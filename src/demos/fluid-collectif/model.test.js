import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  normalize,
  replay,
  step,
  editEvent,
  moveEvent,
  reviewResult,
  restore,
  report,
  rewind,
  MAX_BYTES,
} from "./model.js";
const all = (s) => step(s, true),
  stock = (s, sku) => replay(s).stocks.find((x) => x.sku === sku);
const fixed = () =>
  editEvent(editEvent(seed(), "r5", { sku: "SAC-LIN" }), "r7", { quantity: 2 });
test("initial state has no simulated processing; early cancellation waits then resolves without credit", () => {
  const s = seed();
  assert.equal(replay(s).trace.length, 0);
  assert.equal(stock(s, "TASSE-BLEUE").available, 8);
  const first = step(s);
  assert.equal(replay(first).trace[0].status, "waiting");
  assert.equal(stock(first, "TASSE-BLEUE").available, 8);
  const fourth = { ...s, cursor: 4 };
  assert.equal(replay(fourth).trace[0].status, "resolved");
  assert.equal(replay(fourth).trace[0].quantity, 2);
  assert.equal(stock(fourth, "TASSE-BLEUE").available, 5);
});
test("exact duplicate has no effect, contradictory event identity quarantines all versions", () => {
  const s = all(seed()),
    r = replay(s);
  assert.equal(r.trace[2].status, "duplicate");
  assert.equal(r.trace[5].status, "collision");
  assert.equal(r.trace[6].status, "collision");
  assert.equal(stock(s, "SAC-LIN").available, 4);
  assert.equal(stock(s, "INCONNU").available, null);
  assert.throws(() => reviewResult(s), /réserves/);
});
test("correction resolves issues, explicit review is invalidated by source or ordering change", () => {
  const s = reviewResult(all(fixed()));
  assert.equal(replay(s).reviewed, true);
  assert.equal(stock(s, "SAC-LIN").available, 1);
  assert.equal(replay(editEvent(s, "r8", { quantity: 2 })).reviewed, false);
  assert.equal(editEvent(s, "r8", { quantity: 2 }).cursor, 0);
  assert.equal(moveEvent(s, "r2", -1).cursor, 0);
  assert.equal(replay(rewind(s)).trace.length, 0);
});
test("negative stock is preserved; unknown is never coerced to zero", () => {
  let s = fixed();
  s = editEvent(s, "r2", { quantity: 12 });
  s = editEvent(s, "r3", { quantity: 12 });
  s = all(s);
  assert.equal(stock(s, "TASSE-BLEUE").available, -4);
  assert.ok(replay(s).unresolved.some((x) => x.type === "negative-stock"));
  const empty = normalize({
    ...fixed(),
    stocks: [
      { sku: "TASSE-BLEUE", initial: null },
      { sku: "SAC-LIN", initial: 0 },
    ],
  });
  assert.equal(stock(empty, "TASSE-BLEUE").available, null);
  assert.equal(stock(empty, "SAC-LIN").available, 0);
});
test("same event id on different channels is not a delivery duplicate; repeated order with same amount is", () => {
  const s = fixed();
  s.events = [
    s.events[1],
    { ...s.events[1], rowId: "rx", channel: "Amazon" },
    { ...s.events[1], rowId: "ry", eventId: "other" },
  ];
  const r = replay(all(s));
  assert.equal(r.trace[1].status, "reserved");
  assert.equal(r.trace[2].status, "duplicate-order");
  assert.equal(stock(all(s), "TASSE-BLEUE").reserved, 6);
});
test("order conflicts and repeated cancellation never manufacture available stock", () => {
  const s = fixed();
  s.events = [
    s.events[1],
    { ...s.events[1], rowId: "rx", eventId: "other", quantity: 4 },
  ];
  assert.equal(replay(all(s)).trace[0].status, "order-conflict");
  assert.equal(stock(all(s), "TASSE-BLEUE").available, 8);
  s.events = [
    s.events[1],
    {
      ...s.events[1],
      rowId: "c1",
      eventId: "c1",
      kind: "cancel",
      quantity: null,
    },
    {
      ...s.events[1],
      rowId: "c2",
      eventId: "c2",
      kind: "cancel",
      quantity: null,
    },
  ];
  assert.equal(stock(all(s), "TASSE-BLEUE").available, 8);
  assert.equal(replay(all(s)).trace[2].status, "already-cancelled");
});
test("strict atomic input, bounds and reviewed roundtrip", () => {
  const s = reviewResult(all(fixed()));
  assert.deepEqual(restore(JSON.stringify(s, null, 2)), s);
  assert.throws(
    () => normalize({ ...s, events: [s.events[0], s.events[0]] }),
    /dupliqué/,
  );
  assert.throws(() => normalize({ ...s, cursor: 1.5 }), /Position/);
  assert.throws(() => restore(" ".repeat(MAX_BYTES + 1)), /2 Mo/);
  assert.throws(() => editEvent(s, "r1", { quantity: 0 }), /null/);
  assert.ok(report(s).subtitle.includes("relu"));
  const wrong = { ...s, review: "a".repeat(64) };
  assert.equal(restore(JSON.stringify(wrong)).review, null);
});

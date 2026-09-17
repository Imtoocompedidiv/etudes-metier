import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  plan,
  runLocal,
  target,
  hash,
  baseOf,
  currentResults,
  setMapping,
  setDecision,
  normalize,
  parseFile,
  adoptFile,
  sampleLot,
  testCase,
  report,
  MAX_BYTES,
} from "./model.js";

const result = (d, id) => currentResults(d).find((r) => r.lineId === id);
test("initial target is explicit and preview has not executed anything", () => {
  const d = seed();
  assert.equal(d.ledger.length, 1);
  assert.equal(d.runCount, 0);
  assert.equal(d.journal.length, 0);
  assert.equal(currentResults(d), null);
  assert.deepEqual(
    plan(d).map((r) => r.status),
    ["duplicate", "ready", "waiting", "conflict", "ready", "domain", "mapping"],
  );
  assert.throws(() => testCase(d), /Traitez/);
});
test("interruption is before the effect, dependent cancellation waits, second pass recovers exactly once", () => {
  const d = runLocal(seed());
  assert.equal(result(d, "ligne-2").status, "interrupted");
  assert.equal(result(d, "ligne-3").status, "waiting");
  assert.equal(d.ledger.length, 2);
  assert.equal(
    target(d.ledger).some((r) => r.orderId === "C-411"),
    false,
  );
  const next = runLocal(d);
  assert.equal(next.ledger.length, 4);
  assert.equal(result(next, "ligne-2").attempt, 2);
  assert.equal(result(next, "ligne-3").status, "applied");
  assert.equal(
    target(next.ledger).find((r) => r.orderId === "C-411").state,
    "Annulée",
  );
  const replay = runLocal(next);
  assert.equal(hash(replay.ledger), hash(next.ledger));
  assert.equal(result(replay, "ligne-2").status, "duplicate");
  assert.equal(result(replay, "ligne-3").status, "duplicate");
});
test("canonical identity excludes row id and pause flag, but never overwrites a divergent payload", () => {
  let d = seed();
  d.batch.events[0].lineId = "autre-ligne";
  d.batch.events[0].pauseOnce = true;
  d = normalize(d);
  const r = runLocal(d);
  assert.equal(result(r, "autre-ligne").status, "duplicate");
  assert.equal(result(r, "ligne-4").status, "conflict");
  assert.equal(target(r.ledger).find((o) => o.orderId === "C-410").qty, 3);
});
test("two divergent new messages are both blocked until one is explicitly excluded", () => {
  let d = seed();
  d.batch.events = [
    { ...d.batch.events[4], lineId: "a" },
    { ...d.batch.events[4], lineId: "b", qty: 2 },
  ];
  d = normalize(d);
  let r = runLocal(d);
  assert.deepEqual(
    currentResults(r).map((x) => x.status),
    ["conflict", "conflict"],
  );
  assert.equal(r.ledger.length, 1);
  r = setDecision(r, "b", "La source doit clarifier cette seconde version.");
  r = runLocal(r);
  assert.equal(result(r, "a").status, "applied");
  assert.equal(result(r, "b").status, "excluded");
  assert.equal(target(r.ledger).find((x) => x.orderId === "C-412").qty, 1);
});
test("mapping changes only future effects, invalidates the current test case, and empty mappings are refused", () => {
  const before = runLocal(seed());
  assert.throws(
    () => setMapping(before, "TS-BLEU-M", "", "Correspondance source"),
    /non vide/,
  );
  const d = setMapping(
    before,
    "TS-BLEU-M",
    "TEE-BL-M",
    "Référence validée pour le scénario.",
  );
  assert.equal(currentResults(d), null);
  const r = runLocal(d);
  assert.equal(result(r, "ligne-7").status, "applied");
  assert.equal(
    target(r.ledger).find((x) => x.orderId === "C-413").sku,
    "TEE-BL-M",
  );
  const remap = setMapping(
    r,
    "TS-NOIR-M",
    "TEE-NEW",
    "Nouvelle correspondance pour les prochaines entrées.",
  );
  const replay = runLocal(remap);
  assert.equal(
    target(replay.ledger).find((x) => x.orderId === "C-410").sku,
    "TEE-BK-M",
  );
});
test("out of order dependencies resolve in a single pass after upstream succeeds", () => {
  let d = seed();
  d.batch.events = [
    d.batch.events[2],
    { ...d.batch.events[1], pauseOnce: false },
  ];
  d = normalize(d);
  const r = runLocal(d);
  assert.deepEqual(
    currentResults(r).map((x) => x.status),
    ["applied", "applied"],
  );
  assert.deepEqual(
    r.ledger.slice(1).map((e) => e.eventId),
    ["evt-102", "evt-103"],
  );
});
test("unknown and cyclic dependencies cannot hang or create effects", () => {
  let d = seed();
  d.batch.events = [{ ...d.batch.events[4], after: ["absent"] }];
  d = normalize(d);
  assert.equal(currentResults(runLocal(d))[0].status, "missing");
  d = seed();
  d.batch.events = [
    { ...d.batch.events[1], pauseOnce: false, after: ["evt-103"] },
    d.batch.events[2],
  ];
  d = normalize(d);
  const r = runLocal(d);
  assert.deepEqual(
    currentResults(r).map((x) => x.status),
    ["cycle", "cycle"],
  );
  assert.equal(r.ledger.length, 1);
});
test("domain errors are distinct from transient errors and never mutate the target", () => {
  let d = seed();
  d.batch.events = [
    d.batch.events[5],
    { ...d.batch.events[0], lineId: "new-line", eventId: "new-id" },
  ];
  d = normalize(d);
  const r = runLocal(d);
  assert.deepEqual(
    currentResults(r).map((x) => x.status),
    ["domain", "domain"],
  );
  assert.equal(hash(r.ledger), hash(d.ledger));
  assert.equal(r.attempts.length, 0);
});
test("schema validation is transactional, including null dependencies, unsafe quantities and duplicate line ids", () => {
  const d = seed(),
    original = hash(d);
  for (const value of ["", null, -1, 1.5, Infinity, 10001]) {
    const b = sampleLot();
    b.events[0].qty = value;
    assert.throws(() => parseFile(JSON.stringify(b)));
  }
  const b = sampleLot();
  b.events[0].after = null;
  assert.throws(() => parseFile(JSON.stringify(b)), /Dépendances/);
  b.events[0].after = [];
  b.events[1].lineId = b.events[0].lineId;
  assert.throws(() => parseFile(JSON.stringify(b)), /répété/);
  assert.equal(hash(d), original);
  assert.throws(() => parseFile(" ".repeat(MAX_BYTES + 1)), /10 Mo/);
});
test("JSON restoration proves the last replay and rejects tampered target or forged expected state", () => {
  const d = runLocal(runLocal(seed()));
  const parsed = parseFile(JSON.stringify(d, null, 2));
  assert.equal(hash(parsed.value), hash(d));
  const bad = structuredClone(d);
  bad.ledger[0].payload.qty = 8;
  assert.throws(() => normalize(bad), /reproduit/);
  const forged = structuredClone(d);
  forged.journal.at(-1).results[0].status = "applied";
  assert.throws(() => normalize(forged), /reproduit/);
  const wrong = structuredClone(d);
  wrong.ledger.push(wrong.ledger[0]);
  assert.throws(() => normalize(wrong), /répété/);
});
test("new lot preserves applied identities, reimporting identical lot is a no-op, source namespaces stay separate", () => {
  let d = runLocal(seed());
  assert.equal(adoptFile(d, parseFile(JSON.stringify(sampleLot()))), d);
  const b = sampleLot();
  b.label = "Autre lot";
  b.events = [b.events[0]];
  d = adoptFile(d, parseFile(JSON.stringify(b)));
  assert.equal(d.ledger.length, 2);
  assert.equal(currentResults(d), null);
  assert.equal(currentResults(runLocal(d))[0].status, "duplicate");
  b.source = "autre-boutique";
  d = adoptFile(d, parseFile(JSON.stringify(b)));
  const r = runLocal(d);
  assert.equal(currentResults(r)[0].status, "applied");
  assert.equal(target(r.ledger).filter((x) => x.orderId === "C-410").length, 2);
});
test("exported test fixture reproduces its expected ledger and report escapes imported text", () => {
  const d = runLocal(seed()),
    fixture = testCase(d);
  const input = normalize({
    format: "datafreak-reprise-v1",
    ...fixture.input,
    runCount: 0,
    journal: [],
    lastRun: null,
  });
  const replay = runLocal(input);
  assert.deepEqual(fixture.expected.ledger, replay.ledger);
  assert.deepEqual(fixture.expected.results, currentResults(replay));
  assert.deepEqual(fixture.expected.target, target(replay.ledger));
  const malicious = setDecision(d, "ligne-4", "<script>alert(1)</script>");
  assert.ok(!report(malicious).includes("<script>"));
  assert.ok(report(malicious).includes("&lt;script&gt;"));
});

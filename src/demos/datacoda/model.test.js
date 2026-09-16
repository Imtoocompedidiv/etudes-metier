import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  replay,
  timestamp,
  importRows,
  updateEvent,
  changePolicy,
  changeWindow,
  normalizeState,
  parseDossier,
  decisionRows,
  evidenceReport,
  HEADERS,
} from "./model.js";
const fresh = () => structuredClone(seed);
const group = (state, devis = "Q-104") =>
  replay(state).find((row) => row.devis === devis);
test("late arrival withdraws a prepared candidate using receipt time, with its event evidence", () => {
  const g = group(seed);
  assert.equal(g.before.code, "candidate");
  assert.equal(g.after.code, "response_received");
  assert.equal(g.withdrawn, true);
  assert.deepEqual(g.newEvents, ["E-002"]);
  assert.deepEqual(g.after.decisive, ["E-002"]);
});
test("identical retries count once and file order does not change decisions", () => {
  assert.equal(group(seed).after.duplicates, 1);
  assert.deepEqual(
    decisionRows(importRows(seed, [...seed.events].reverse())),
    decisionRows(seed),
  );
  const s = fresh();
  s.events.push({
    ...s.events[4],
    delivery_id: "L-009",
    received_at: "2026-09-16T09:00:00Z",
  });
  assert.equal(group(s, "Q-205").after.count, 1);
});
test("contradictory event IDs and delivery IDs reject a complete import without mutation", () => {
  const before = JSON.stringify(seed);
  assert.throws(
    () =>
      importRows(seed, [
        ...seed.events,
        { ...seed.events[1], delivery_id: "L-099", type: "accepted" },
      ]),
    /contradictoire/,
  );
  assert.throws(
    () => importRows(seed, [...seed.events, seed.events[0]]),
    /Réception/,
  );
  assert.equal(JSON.stringify(seed), before);
});
test("a reply on the older quote never suppresses the new quote within the same dossier", () => {
  assert.equal(group(seed, "Q-204").after.code, "accepted");
  assert.equal(group(seed, "Q-205").after.code, "candidate");
});
test("deadline boundaries are exact and use calendar hours in UTC", () => {
  const justBefore = changeWindow(
    seed,
    "2026-09-17T08:59:59Z",
    "2026-09-17T09:00:00Z",
  );
  assert.equal(group(justBefore).before.code, "waiting");
  assert.equal(group(justBefore).after.code, "candidate");
  assert.equal(group(justBefore).before.dueAt, "2026-09-17T09:00:00Z");
});
test("reply arriving exactly at the checking instant suppresses the candidate", () => {
  const s = changeWindow(seed, seed.preparedAt, "2026-09-17T09:03:00Z");
  assert.equal(group(s).after.code, "response_received");
});
test("caps and later declared reminders change both the decision and next interval", () => {
  assert.equal(
    group(changePolicy(seed, { ...seed.policy, maxReminders: 1 }), "Q-205")
      .after.code,
    "cap",
  );
  assert.equal(
    group(changePolicy(seed, { ...seed.policy, maxReminders: 0 })).before.code,
    "cap",
  );
  const s = fresh();
  s.events.push({
    delivery_id: "L-100",
    event_id: "E-100",
    dossier: "Atelier",
    devis: "Q-205",
    type: "reminder_sent",
    occurred_at: "2026-09-17T09:02:00Z",
    received_at: "2026-09-17T09:02:00Z",
  });
  assert.equal(group(s, "Q-205").after.code, "cap");
  assert.equal(group(s, "Q-205").withdrawn, true);
});
test("cancellation and acceptance stop decisions even when timestamps are tied", () => {
  const s = fresh();
  s.events.push({
    ...s.events[0],
    delivery_id: "L-101",
    event_id: "E-101",
    type: "cancelled",
  });
  assert.equal(group(s).before.code, "cancelled");
});
test("correction propagates immutable event contents across retries, arrival stays per delivery", () => {
  const s = updateEvent(seed, "L-002", {
    type: "accepted",
    received_at: "2026-09-17T08:59:00Z",
  });
  assert.equal(s.events[2].type, "accepted");
  assert.equal(s.events[2].received_at, "2026-09-17T09:04:00Z");
  assert.equal(group(s).before.code, "accepted");
  assert.throws(
    () => updateEvent(seed, "L-002", { occurred_at: "2026-09-17T09:05:00Z" }),
    /réception/,
  );
});
test("missing quotes, two distinct quote events and impossible chronology stay explicit", () => {
  assert.equal(
    group(
      importRows(
        seed,
        seed.events.filter((e) => e.event_id !== "E-001"),
      ),
    ).after.code,
    "missing",
  );
  const s = fresh();
  s.events.push({ ...s.events[0], delivery_id: "L-102", event_id: "E-102" });
  assert.equal(group(s).after.code, "incoherent");
  const t = fresh();
  t.events[1].occurred_at = "2026-09-13T08:00:00Z";
  t.events[2].occurred_at = t.events[1].occurred_at;
  assert.equal(group(t).after.code, "incoherent");
});
test("strict dates, bounds, empty journal and reversed window reject before replacing state", () => {
  for (const date of [
    "2026-02-30T00:00:00Z",
    "2026-09-17T25:00:00Z",
    "2026-09-17T09:00:00+02:00",
    "",
  ])
    assert.throws(() => timestamp(date));
  assert.throws(() => changeWindow(seed, seed.checkedAt, seed.preparedAt));
  assert.throws(() => importRows(seed, []));
  assert.throws(() =>
    changePolicy(seed, { ...seed.policy, firstDelayHours: 0 }),
  );
  assert.throws(() =>
    normalizeState({
      ...seed,
      events: [
        ...seed.events,
        ...Array.from({ length: 500 }, () => seed.events[0]),
      ],
    }),
  );
});
test("JSON round-trip and reports preserve all actual sources and the two decisions", () => {
  const restored = parseDossier(JSON.stringify(seed));
  assert.deepEqual(restored, seed);
  assert.deepEqual(decisionRows(restored), decisionRows(seed));
  const report = evidenceReport(restored);
  assert.equal(report.sections[2].rows.length, 8);
  assert.equal(report.sections[2].headers.length, HEADERS.length);
  assert.match(JSON.stringify(report), /E-002/);
  assert.match(JSON.stringify(report), /2026-09-17T09:03:00Z/);
});

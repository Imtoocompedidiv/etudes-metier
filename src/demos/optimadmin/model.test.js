import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  replay,
  approve,
  runAttempt,
  advance,
  status,
  editRecord,
  editRoute,
  resolveConflict,
  manifest,
  importEvents,
  restore,
} from "./model.js";
test("replay is idempotent even after a preparation", () => {
  let s = seed();
  assert.equal(s.sources.length, 8);
  assert.equal(s.records.length, 6);
  s = runAttempt(approve(s, "evt-001", true, ""), "evt-001");
  s = replay(replay(s));
  assert.equal(s.records.length, 6);
  assert.equal(manifest(s).actions.length, 1);
  assert.equal(s.records[0].attempts, 1);
});
test("conflicting payload requires an explicit version choice", () => {
  let s = seed();
  assert.equal(status(s, s.records[2]).label, "Contenus contradictoires");
  assert.throws(() => approve(s, "evt-003", true, ""));
  s = resolveConflict(s, "evt-003", 1);
  assert.equal(s.records[2].working.doc, "INV-144");
  s = runAttempt(approve(s, "evt-003", true, ""), "evt-003");
  assert.equal(status(replay(s), replay(s).records[2]).key, "prepared");
});
test("missing file and unknown routing remain blocked", () => {
  const s = seed();
  assert.throws(() => approve(s, "evt-002", true, ""));
  assert.throws(() => approve(s, "evt-004", true, ""));
  const fixed = editRecord(s, "evt-002", { hasFile: true });
  assert.equal(status(fixed, fixed.records[1]).key, "review");
  assert.equal(fixed.sources[2].hasFile, false);
});
test("human approval mandatory, content or route edits invalidate output", () => {
  let s = seed();
  assert.throws(() => runAttempt(s, "evt-001"));
  assert.throws(() => approve(s, "evt-001", false, ""));
  s = runAttempt(approve(s, "evt-001", true, "Pièce revue."), "evt-001");
  assert.equal(manifest(s).actions.length, 1);
  assert.equal(
    manifest(editRecord(s, "evt-001", { doc: "INV-099" })).actions.length,
    0,
  );
  assert.equal(
    manifest(editRoute(s, "NORD", "Nouveau dossier")).actions.length,
    0,
  );
});
test("temporary error retries at 60 seconds, never before", () => {
  let s = runAttempt(approve(seed(), "evt-005", true, ""), "evt-005");
  assert.equal(s.records[4].nextAt, 36060);
  assert.throws(() => runAttempt(s, "evt-005"));
  s = advance(s, 59);
  assert.equal(s.records[4].attempts, 1);
  s = advance(s, 1);
  assert.equal(s.records[4].attempts, 2);
  assert.equal(manifest(s).actions.length, 1);
});
test("retry capped at three, second backoff doubles, failed item in exceptions", () => {
  let s = runAttempt(approve(seed(), "evt-006", true, ""), "evt-006");
  s = advance(s, 60);
  assert.equal(s.records[5].nextAt, 36180);
  s = advance(s, 60);
  assert.equal(s.records[5].attempts, 2);
  s = advance(s, 60);
  assert.equal(status(s, s.records[5]).key, "failed");
  assert.throws(() => runAttempt(s, "evt-006"));
  assert.equal(
    manifest(s).exceptions.find((e) => e.event === "evt-006").status,
    "Échec après 3 essais",
  );
});
test("CSV rejects invalid rows atomically and imports known schema", () => {
  const s = seed(),
    old = structuredClone(s);
  assert.throws(() =>
    importEvents(
      s,
      "evenement;client;piece;fichier_present;reponses_test\ne1;NORD;A;peut-être;200",
    ),
  );
  assert.deepEqual(s, old);
  const n = importEvents(
    s,
    "evenement;client;piece;fichier_present;reponses_test\ne1;NORD;A;oui;200",
  );
  assert.equal(n.records.length, 1);
});
test("restore keeps repeatability and rejects forged unapproved preparation", () => {
  let s = runAttempt(approve(seed(), "evt-005", true, ""), "evt-005");
  s = restore(JSON.stringify(s));
  assert.equal(
    status(advance(s, 60), advance(s, 60).records[4]).key,
    "prepared",
  );
  s.records[4].approval = null;
  assert.throws(() => restore(JSON.stringify(s)));
});
test("restore rejects omitted, duplicated or invented source variants", () => {
  const s = seed();
  const omitted = structuredClone(s);
  omitted.records[2].variants.pop();
  assert.throws(() => restore(JSON.stringify(omitted)), /versions du dossier/);
  const invented = structuredClone(s);
  invented.records[0].variants[0].doc = "ABSENT-DES-SOURCES";
  assert.throws(() => restore(JSON.stringify(invented)), /versions du dossier/);
  const duplicate = structuredClone(s);
  duplicate.records[0].variants.push(duplicate.records[0].variants[0]);
  assert.throws(
    () => restore(JSON.stringify(duplicate)),
    /versions du dossier/,
  );
  s.records[2].variants.reverse();
  assert.equal(restore(JSON.stringify(s)).records[2].variants.length, 2);
});
test("a retry beyond the test day is refused without producing an unrestorable state", () => {
  let s = seed();
  s.clock = 86350;
  s = approve(s, "evt-005", true, "");
  const before = structuredClone(s);
  assert.throws(() => runAttempt(s, "evt-005"), /journée d’essai/);
  assert.deepEqual(s, before);
  assert.equal(restore(JSON.stringify(s)).clock, 86350);
  s.clock = 86340;
  s = runAttempt(s, "evt-005");
  assert.equal(s.records[4].nextAt, 86400);
  s = advance(s, 60);
  assert.equal(manifest(restore(JSON.stringify(s))).actions.length, 1);
});

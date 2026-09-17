import test from "node:test";
import assert from "node:assert/strict";
import { csvText, reportHtml } from "../../shared/files.js";
import {
  MAX_BYTES,
  SESSION_HEADERS,
  SNAPSHOT_HEADERS,
  seed,
  normalize,
  restore,
  compare,
  showMinutes,
  editSession,
  editSnapshot,
  associate,
  decide,
  importCsv,
  sessionRows,
  snapshotRows,
  correctionRows,
  reviewReport,
} from "./model.js";
const find = (s) => s.snapshots.find((o) => o.id === "R1-2");
function declared() {
  const s = seed();
  return editSnapshot(s, "R1-2", { ...find(s), intermission: 20 });
}
function prepared() {
  return decide(
    declared(),
    "R1-2",
    "time",
    "correction",
    "Horaire confirmé dans le programme de démonstration.",
    "Production fictive",
  );
}

test("duration is comparable only after its scope and intermission are declared", () => {
  const s = seed(),
    o = find(s),
    c = compare(s, o);
  assert.equal(showMinutes(o), null);
  assert.equal(c.rows.find((r) => r.field === "duration").comparable, false);
  assert.throws(() =>
    decide(
      s,
      o.id,
      "duration",
      "correction",
      "Cette durée doit être revue.",
      "Production",
    ),
  );
  const d = declared(),
    r = compare(d, find(d)).rows.find((r) => r.field === "duration");
  assert.equal(r.from, 130);
  assert.equal(r.to, 130);
  assert.equal(r.different, false);
  assert.equal(
    showMinutes({ duration: 130, scope: "unknown", intermission: 0 }),
    null,
  );
});
test("changing programme invalidates decisions and old listings cannot produce corrections", () => {
  const s = prepared();
  assert.equal(correctionRows(s).length, 1);
  const ref = s.sessions[0];
  assert.throws(
    () => editSession(s, ref.id, { ...ref, time: "20:30" }),
    /plus récente/,
  );
  const changed = editSession(s, ref.id, {
    ...ref,
    time: "20:30",
    updatedAt: "2027-02-01T14:00:00Z",
  });
  assert.equal(changed.decisions.length, 0);
  assert.equal(compare(changed, find(changed)).stale, true);
  assert.equal(correctionRows(changed).length, 0);
  assert.throws(() =>
    decide(
      changed,
      "R1-2",
      "time",
      "correction",
      "Horaire plus récent à demander.",
      "Production",
    ),
  );
  const fresh = editSnapshot(changed, "R1-2", {
    ...find(changed),
    collectedAt: "2027-02-01T15:00:00Z",
  });
  const reviewed = decide(
    fresh,
    "R1-2",
    "time",
    "correction",
    "Nouvelle collecte déclarée pour ce test.",
    "Production",
  );
  assert.equal(correctionRows(reviewed)[0][6], "20:30");
  assert.equal(correctionRows(s)[0][6], "20:00");
});
test("references are associated explicitly, identical titles never merge sessions", () => {
  const s = seed(),
    orphan = s.snapshots.find((o) => !o.sessionId);
  assert.equal(compare(s, orphan).status, "unmapped");
  assert.throws(() => associate(s, orphan.id, "ABSENT"));
  const linked = associate(s, orphan.id, "FC-206");
  assert.equal(
    linked.snapshots.find((o) => o.id === orphan.id).sessionId,
    "FC-206",
  );
  assert.ok(
    compare(
      linked,
      linked.snapshots.find((o) => o.id === orphan.id),
    ).rows.find((r) => r.field === "date").different,
  );
  assert.equal(linked.sessions.length, 6);
});
test("exceptions require justification and never appear as corrections", () => {
  const s = declared();
  assert.throws(() => decide(s, "R1-2", "time", "exception", "oui", "SAV"));
  const x = decide(
    s,
    "R1-2",
    "time",
    "exception",
    "Le relevé correspond ici à une ouverture des portes.",
    "Production",
  );
  assert.equal(correctionRows(x).length, 0);
  assert.equal(compare(x, find(x)).status, "exception");
  assert.throws(() =>
    decide(
      x,
      "R1-2",
      "date",
      "correction",
      "Dates pourtant identiques.",
      "Production",
    ),
  );
});
test("CSV updates are atomic, keep absent records and reject old or conflicting identities", () => {
  const s = prepared();
  const rows = snapshotRows(s).filter((r) => r[0] === "R1-2");
  assert.deepEqual(
    importCsv(s, csvText(SNAPSHOT_HEADERS, rows), "snapshots"),
    s,
  );
  const newer = [...rows[0]];
  newer[5] = "2027-02-01T15:00:00Z";
  newer[7] = "20:00";
  const changed = importCsv(s, csvText(SNAPSHOT_HEADERS, [newer]), "snapshots");
  assert.equal(changed.snapshots.length, s.snapshots.length);
  assert.equal(changed.decisions.length, 0);
  assert.throws(
    () => importCsv(changed, csvText(SNAPSHOT_HEADERS, rows), "snapshots"),
    /plus ancien/,
  );
  const invalid = [...newer];
  invalid[0] = "NEW";
  invalid[6] = "2027-02-29";
  assert.throws(() =>
    importCsv(s, csvText(SNAPSHOT_HEADERS, [newer, invalid]), "snapshots"),
  );
  assert.equal(find(s).time, "19:30");
  assert.equal(s.decisions.length, 1);
  assert.throws(() =>
    importCsv(s, csvText(SNAPSHOT_HEADERS, [newer, newer]), "snapshots"),
  );
  const collision = [...newer];
  collision[0] = "NEW";
  assert.throws(
    () => importCsv(s, csvText(SNAPSHOT_HEADERS, [collision]), "snapshots"),
    /Référence partenaire/,
  );
  assert.deepEqual(
    importCsv(s, csvText(SESSION_HEADERS, sessionRows(s)), "sessions"),
    s,
  );
});
test("strict dates, quantities, shape and stale JSON reviews fail safely", () => {
  const s = prepared();
  assert.deepEqual(restore(JSON.stringify(s, null, 2)), s);
  for (const patch of [
    { date: "2027-02-29" },
    { time: "24:00" },
    { duration: [] },
    { intermission: -1 },
    { scope: "total", duration: 20, intermission: 20 },
    { updatedAt: "2027-02-01T14:00:00+02:00" },
  ])
    assert.throws(() =>
      editSession(s, s.sessions[0].id, { ...s.sessions[0], ...patch }),
    );
  const stale = structuredClone(s);
  stale.snapshots[1].time = "18:00";
  assert.throws(() => restore(JSON.stringify(stale)), /périmée/);
  const extra = structuredClone(s);
  extra.sessions[0].unexpected = true;
  assert.throws(() => normalize(extra));
  const missing = structuredClone(s);
  missing.snapshots[0].sessionId = "X";
  assert.throws(() => normalize(missing));
});
test("all export values come from current decisions and report escapes source text", () => {
  let s = declared();
  s = editSnapshot(s, "R1-2", {
    ...find(s),
    source: "<script>unsafe</script>",
  });
  s = decide(
    s,
    "R1-2",
    "time",
    "correction",
    "Vérification fictive de cet horaire.",
    "Production",
  );
  const row = correctionRows(s)[0];
  assert.equal(row[5], "19:30");
  assert.equal(row[6], "20:00");
  assert.equal(row[7], find(s).collectedAt);
  const html = reportHtml(reviewReport(s));
  assert.ok(!html.includes("<script>unsafe"));
  assert.ok(html.includes("&lt;script&gt;"));
});
test("canonical byte budget rejects an unsavable full dataset and accepted data round trips exactly", () => {
  const s = seed(),
    ref = s.sessions[0];
  s.sessions = Array.from({ length: 100 }, (_, i) => ({
    ...ref,
    id: "S" + i,
    title: "\ud800".repeat(160),
    city: "\ud800".repeat(100),
    venue: "\ud800".repeat(160),
  }));
  s.snapshots = Array.from({ length: 400 }, (_, i) => ({
    ...seed().snapshots[0],
    id: "O" + i,
    partnerRef: "P" + i,
    sessionId: "S" + (i % 100),
    date: "2027-02-17",
    time: "19:00",
    venue: "Autre salle",
    duration: 120,
    source: "\ud800".repeat(300),
  }));
  const big = normalize(s);
  for (const o of big.snapshots)
    for (const field of ["date", "time", "venue", "duration"])
      big.decisions.push({
        snapshotId: o.id,
        field,
        action: "correction",
        note: "\ud800".repeat(500),
        by: "\ud800".repeat(60),
        basis: "",
      });
  // Compute public consistency hashes as a persisted, fully populated dossier would.
  return import("./model.js").then(({ decisionBasis }) => {
    for (const d of big.decisions) {
      const o = big.snapshots.find((o) => o.id === d.snapshotId),
        ref = big.sessions.find((s) => s.id === o.sessionId);
      d.basis = decisionBasis(ref, o, d.field);
    }
    assert.throws(() => normalize(big), /5 Mio/);
    big.decisions = big.decisions.slice(0, 400);
    const n = normalize(big),
      raw = JSON.stringify(n, null, 2);
    assert.ok(Buffer.byteLength(raw) < MAX_BYTES);
    assert.deepEqual(restore(raw), n);
  });
});

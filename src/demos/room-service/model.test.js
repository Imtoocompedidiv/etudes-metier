import test from "node:test";
import assert from "node:assert/strict";
import { csvText } from "../../shared/files.js";
import {
  seed,
  decide,
  decision,
  addMessage,
  exportLine,
  exportReady,
  status,
  changeLine,
  assignMessage,
  unmatched,
  importLines,
  importMessages,
  lineRows,
  messageRows,
  LINE_HEADERS,
  MESSAGE_HEADERS,
  restore,
  questions,
  report,
  basis,
  snapshotKey,
  MAX_EXPORTS,
  MAX_DOSSIER_BYTES,
} from "./model.js";
const reviewed = () =>
  decide(seed, "R104-L1", "M02", "Choix confirmé lors de l’échange fictif.");
test("explicit human choice required even for a single instruction; latest date never wins", () => {
  assert.equal(decision(seed, "R104-L1"), null);
  assert.equal(decision(seed, "R104-L2"), null);
  assert.throws(() => exportLine(seed, "R104-L1"), /Revoir/);
  assert.throws(() => decide(seed, "R104-L1", "M03", "Oui"), /rattachée/);
  assert.throws(() => decide(seed, "R104-L1", "M01", "   "), /Motif/);
  const s = decide(seed, "R104-L1", "M01", "Choix initial confirmé.");
  assert.equal(decision(s, "R104-L1").messageId, "M01");
});
test("new instruction invalidates current review and retains earlier exported version", () => {
  const first = exportLine(reviewed(), "R104-L1");
  assert.equal(first.entry.version, 1);
  const s = addMessage(first.state, {
    ...seed.messages[0],
    id: "M05",
    at: "2026-09-17T12:00",
  });
  assert.equal(decision(s, "R104-L1"), null);
  assert.equal(status(s, "R104-L1"), "Fiche à remplacer");
  const second = exportLine(
    decide(s, "R104-L1", "M05", "Changement confirmé."),
    "R104-L1",
  );
  assert.equal(second.entry.version, 2);
  assert.equal(second.state.exports[0].content.message.mount, "engraved");
  assert.equal(second.entry.content.message.mount, "opening");
  assert.equal(exportLine(second.state, "R104-L1").state.exports.length, 2);
});
test("quantity changes invalidate review and exports; unrelated line changes preserve it", () => {
  const s = exportLine(reviewed(), "R104-L1").state;
  assert.equal(
    decision(changeLine(s, { ...s.lines[1], quantity: 4 }), "R104-L1")
      .messageId,
    "M02",
  );
  const changed = changeLine(s, { ...s.lines[0], quantity: 3 });
  assert.equal(decision(changed, "R104-L1"), null);
  assert.equal(status(changed, "R104-L1"), "Fiche à remplacer");
});
test("unmatched instructions stay separate until explicit assignment and affect only chosen line", () => {
  assert.equal(unmatched(seed).length, 1);
  const s = assignMessage(reviewed(), "M04", "R105-L1");
  assert.equal(unmatched(s).length, 0);
  assert.ok(decision(s, "R104-L1"));
  assert.equal(status(s, "R105-L1"), "À revoir");
  assert.throws(() => assignMessage(seed, "M04", "unknown"), /existante/);
});
test("imports append or update exact IDs; identical replay is idempotent and contradictory replay rejects", () => {
  const s = reviewed();
  assert.deepEqual(importLines(csvText(LINE_HEADERS, lineRows(s)), s), s);
  assert.deepEqual(
    importMessages(csvText(MESSAGE_HEADERS, messageRows(s)), s),
    s,
  );
  const rows = messageRows(s);
  rows[0][3] = "simple";
  assert.throws(
    () => importMessages(csvText(MESSAGE_HEADERS, rows), s),
    /contenu différent/,
  );
  const lines = lineRows(s);
  lines[0][3] = "";
  assert.throws(() => importLines(csvText(LINE_HEADERS, lines), s), /Quantité/);
  lines[0][3] = 3;
  const changed = importLines(csvText(LINE_HEADERS, lines), s);
  assert.equal(decision(changed, "R104-L1"), null);
  assert.throws(
    () =>
      importLines(csvText(LINE_HEADERS, [lineRows(s)[0], lineRows(s)[0]]), s),
    /unique/,
  );
});
test("JSON preserves history, rejects malformed types/calendar/version and never restores stale review as current", () => {
  const s = exportLine(reviewed(), "R104-L1").state;
  assert.deepEqual(restore(JSON.stringify(s)), s);
  for (const val of [[], [2], true, "  ", 0, 1.5]) {
    const bad = structuredClone(s);
    bad.lines[0].quantity = val;
    assert.throws(() => restore(JSON.stringify(bad)), /Quantité/);
  }
  const stale = structuredClone(s);
  stale.messages.push({ ...seed.messages[0], id: "M77" });
  assert.equal(decision(restore(JSON.stringify(stale)), "R104-L1"), null);
  const date = structuredClone(s);
  date.messages[0].at = "2026-02-31T10:00";
  assert.throws(() => restore(JSON.stringify(date)), /exister/);
  const version = structuredClone(s);
  version.exports[0].version = 2;
  assert.throws(() => restore(JSON.stringify(version)), /suivre/);
  const forged = structuredClone(s);
  forged.exports[0].content.line.quantity = 4;
  assert.throws(() => restore(JSON.stringify(forged)), /incohérente/);
});
test("partial output only contains reviewed lines and questions retain missing choices and orphan references", () => {
  const out = exportReady(reviewed());
  assert.equal(out.entries.length, 1);
  assert.equal(report(out.entries[0]).sections[0].rows[0][2], "Anneau gravé");
  assert.match(questions(out.state), /R105-L1/);
  assert.match(questions(out.state), /R999-L1/);
  assert.throws(() => exportReady(seed), /Aucune/);
});
test("structured mount values and reserved identifiers cannot be coerced into accepted fields", () => {
  assert.throws(
    () =>
      addMessage(seed, { ...seed.messages[0], id: "NEW", mount: ["opening"] }),
    /Montage inconnu/,
  );
  const bad = structuredClone(seed);
  bad.lines[0].id = "__proto__";
  assert.throws(() => restore(JSON.stringify(bad)), /Identifiant/);
});
test("review and snapshot fingerprints stay compact for 1 000 full instructions, with strict hash restoration", () => {
  const large = {
    ...seed,
    messages: Array.from({ length: 1000 }, (_, i) => ({
      ...seed.messages[0],
      id: `M${i}`,
      source: "É".repeat(100),
      note: "紬".repeat(500),
    })),
  };
  assert.match(basis(large, "R104-L1"), /^[0-9a-f]{64}$/);
  const result = exportLine(
    decide(large, "R104-L1", "M999", "Choix confirmé."),
    "R104-L1",
  );
  assert.equal(result.entry.key.length, 64);
  assert.deepEqual(restore(JSON.stringify(result.state)), result.state);
  for (const invalid of [[], "a".repeat(63), "A".repeat(64), "z".repeat(64)]) {
    const state = structuredClone(result.state);
    state.decisions["R104-L1"].basis = invalid;
    assert.throws(() => restore(JSON.stringify(state)), /empreinte/);
    const history = structuredClone(result.state);
    history.exports[0].key = invalid;
    assert.throws(() => restore(JSON.stringify(history)), /empreinte/);
  }
});
test("the 3 000 snapshot boundary allows identical re-download but blocks a new version atomically", () => {
  const first = exportLine(reviewed(), "R104-L1");
  const full = {
    ...first.state,
    exports: Array.from({ length: MAX_EXPORTS }, (_, i) => ({
      ...first.entry,
      version: i + 1,
    })),
  };
  const restored = restore(JSON.stringify(full));
  assert.equal(exportLine(restored, "R104-L1").entry.version, MAX_EXPORTS);
  const changed = decide(restored, "R104-L1", "M01", "Nouvel accord déclaré.");
  assert.throws(() => exportLine(changed, "R104-L1"), /3 000/);
  assert.equal(changed.exports.length, MAX_EXPORTS);
  const secondReady = decide(changed, "R104-L2", "M03", "Autre ligne revue.");
  assert.throws(() => exportReady(secondReady), /3 000/);
  assert.equal(secondReady.exports.length, MAX_EXPORTS);
});
test("maximum bounded dossier including JSON escaping fits its explicit import limit and restores", () => {
  const fill = (n) => "X" + "\u0001".repeat(n - 1);
  const lines = Array.from({ length: 200 }, (_, i) => ({
    id: `L${i}`.padEnd(40, "X"),
    order: fill(40),
    reference: fill(100),
    quantity: 500,
  }));
  const messages = Array.from({ length: 1000 }, (_, i) => ({
    id: `M${i}`.padEnd(40, "X"),
    target: lines[0].id,
    at: "2026-09-17T09:10",
    mount: "engraved",
    source: fill(100),
    note: fill(500),
  }));
  const large = decide(
    { version: 1, lines, messages, decisions: {}, exports: [] },
    lines[0].id,
    messages[0].id,
    fill(500),
  );
  const first = exportLine(large, lines[0].id);
  const full = {
    ...first.state,
    exports: Array.from({ length: MAX_EXPORTS }, (_, i) => ({
      ...first.entry,
      version: i + 1,
    })),
  };
  // Reserve the maximal permitted decision record for every line, including stale reviews.
  for (const line of lines)
    full.decisions[line.id] = { ...large.decisions[lines[0].id] };
  const json = JSON.stringify(full, null, 2);
  assert.ok(new TextEncoder().encode(json).length < MAX_DOSSIER_BYTES);
  assert.deepEqual(restore(json), full);
  const changed = structuredClone(first.entry.content);
  changed.message.note = "Autre contenu";
  assert.notEqual(snapshotKey(changed), first.entry.key);
});

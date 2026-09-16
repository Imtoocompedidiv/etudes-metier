import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  parseNotes,
  replaceNotes,
  linkNote,
  unlinkNote,
  editParagraph,
  editNote,
  removeNote,
  addQuestion,
  closeQuestion,
  markReviewed,
  paragraphStatus,
  questionIsClosed,
  restore,
  makeReport,
  issueRows,
  seconds,
} from "./model.js";
const p2 = (s) => s.paragraphs[1];
test("source, question and human confirmation are all required before review", () => {
  let s = seed();
  assert.throws(() => markReviewed(s, "P01", true));
  assert.throws(() => markReviewed(s, "P02", true));
  s = closeQuestion(s, "P02", "Q1", "La proposition reste conditionnelle.");
  assert.throws(() => markReviewed(s, "P02", false));
  s = markReviewed(s, "P02", true);
  assert.equal(paragraphStatus(s, p2(s)).reviewed, true);
});
test("paragraph correction reopens its closed question and invalidates review", () => {
  let s = markReviewed(
    closeQuestion(seed(), "P02", "Q1", "Vérifié avec les notes."),
    "P02",
    true,
  );
  s = editParagraph(
    s,
    "P02",
    "Le 15 octobre est proposé sous réserve du BAT et du budget.",
  );
  assert.equal(questionIsClosed(s, p2(s), p2(s).questions[0]), false);
  assert.equal(paragraphStatus(s, p2(s)).reviewed, false);
  assert.equal(p2(s).original, "Le lancement est confirmé pour le 15 octobre.");
});
test("linked source edits and removal invalidate; unrelated source does not", () => {
  let s = markReviewed(
    closeQuestion(seed(), "P02", "Q1", "Vérifié."),
    "P02",
    true,
  );
  const other = editNote(s, "N01", { ...s.notes[0], texte: "Autre objectif." });
  assert.equal(paragraphStatus(other, p2(other)).reviewed, true);
  s = editNote(s, "N02", { ...s.notes[1], texte: "Date encore à convenir." });
  assert.equal(paragraphStatus(s, p2(s)).reviewed, false);
  const r = removeNote(s, "N02");
  assert.equal(paragraphStatus(r, p2(r)).missing[0].noteId, "N02");
  assert.equal(r.originalNotes.length, 4);
});
test("changing association role or unlinking invalidates a closed question", () => {
  const s = closeQuestion(seed(), "P02", "Q1", "Vérifié.");
  for (const next of [
    linkNote(s, "P02", "N02", "rapprocher"),
    unlinkNote(s, "P02", "N03"),
  ])
    assert.equal(
      questionIsClosed(next, p2(next), p2(next).questions[0]),
      false,
    );
  assert.throws(() => linkNote(s, "P02", "absente"));
});
test("CSV supports quoted multi-line notes, strict dates and duplicate IDs", () => {
  const notes = parseNotes(
    'id;repere;sujet;texte\nN1;00:03:00;Budget;"Deux lignes\navec ; séparateur"',
  );
  assert.equal(notes[0].texte, "Deux lignes\navec ; séparateur");
  assert.throws(() => parseNotes("id;repere;sujet;texte\nN1;00:61:00;A;B"));
  assert.throws(() =>
    parseNotes("id;repere;sujet;texte\nN1;00:01:00;A;B\nN1;00:02:00;C;D"),
  );
  assert.equal(seconds("23:59:59"), 86399);
  assert.throws(() => seconds("24:00:00"));
});
test("replacement preserves orphan links and reports them, invalid input cannot mutate", () => {
  const s = seed(),
    before = structuredClone(s);
  assert.throws(() => replaceNotes(s, [s.notes[0], s.notes[0]]));
  assert.deepEqual(s, before);
  const r = replaceNotes(s, [s.notes[0]]);
  assert.equal(p2(r).links.length, 2);
  assert.equal(
    issueRows(r).filter((row) => row[2] === "Source absente").length,
    3,
  );
});
test("new questions invalidate review and IDs remain unique across paragraphs", () => {
  let s = addQuestion(seed(), "P03", "Le montant est-il hors taxes ?");
  assert.equal(paragraphStatus(s, s.paragraphs[2]).reviewed, false);
  s = addQuestion(s, "P01", "Le public est-il validé ?");
  assert.equal(s.paragraphs[0].questions[0].id, "Q3");
  assert.throws(() => closeQuestion(s, "P03", "Q2", "  "));
});
test("JSON roundtrip retains source-aware status, malformed fields are rejected", () => {
  let s = editParagraph(seed(), "P02", "La date du 15 octobre est proposée.");
  s = markReviewed(
    closeQuestion(s, "P02", "Q1", "Condition conservée."),
    "P02",
    true,
  );
  const r = restore(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(r, s);
  assert.equal(paragraphStatus(r, p2(r)).reviewed, true);
  const bad = structuredClone(s);
  bad.paragraphs[0].links = [{ noteId: "N01", kind: "constructor" }];
  assert.throws(() => restore(bad));
  const dup = structuredClone(s);
  dup.paragraphs[0].questions = structuredClone(p2(s).questions);
  assert.throws(() => restore(dup));
});
test("HTML report preserves original, current, sources and open questions with escaped text", () => {
  let s = editParagraph(seed(), "P02", "<script>interdit</script>");
  const html = makeReport(s);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Le lancement est confirmé"));
  assert.ok(html.includes("00:06:40"));
  assert.ok(html.includes("La date est-elle"));
  assert.ok(html.includes("Ouverte"));
});

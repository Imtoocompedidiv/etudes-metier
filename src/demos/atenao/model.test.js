import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  literalMatches,
  occurrences,
  suggestion,
  confirm,
  decision,
  changeTerm,
  confirmedRows,
  importSegments,
  importTerms,
  restore,
  SEGMENT_HEADERS,
  TERM_HEADERS,
  termRows,
  segmentRows,
} from "./model.js";
import { csvText } from "../../shared/files.js";
test("word boundaries are Unicode-aware, literal, case-insensitive and keep accents", () => {
  assert.equal(
    literalMatches(
      "Pickup point, pickup pointer, xpickup point, pickup points",
      "pickup point",
    ).length,
    1,
  );
  assert.equal(
    literalMatches("un adhérent, des adherents", "adhérent").length,
    1,
  );
  assert.equal(literalMatches("a+b aab", "a+b").length, 1);
});
test("declared plural alias detected but not silently replaced", () => {
  const s = seed(),
    t = s.terms[0];
  assert.equal(occurrences(s, t).length, 4);
  const p = suggestion(t, s.segments[1]);
  assert.equal(p.count, 0);
  assert.equal(p.text, s.segments[1].target);
});
test("proposal does not mutate, confirmation does, original retained", () => {
  const s = seed(),
    t = s.terms[0],
    r = s.segments[0],
    p = suggestion(t, r);
  assert.equal(p.count, 1);
  assert.ok(r.target.includes("pickup point"));
  const next = confirm(s, t.id, r.id, p.text);
  assert.ok(next.segments[0].target.includes("collection point"));
  assert.ok(next.segments[0].original.includes("pickup point"));
  assert.equal(confirmedRows(next).length, 1);
});
test("unmodified old term needs exception with substantive reason", () => {
  const s = seed(),
    t = s.terms[0],
    r = s.segments[3];
  assert.throws(() => confirm(s, t.id, r.id, r.target));
  assert.throws(() => confirm(s, t.id, r.id, r.target, true, "ok"));
  const n = confirm(
    s,
    t.id,
    r.id,
    r.target,
    true,
    "Nom du service conservé sur cet écran.",
  );
  assert.equal(decision(n, n.terms[0], n.segments[3]).kind, "exception");
});
test("term revision invalidates its decisions but preserves translated text", () => {
  let s = seed();
  s = confirm(s, "retrait", "s12", suggestion(s.terms[0], s.segments[0]).text);
  s = changeTerm(s, "retrait", { next: "collection location" });
  assert.equal(confirmedRows(s).length, 0);
  assert.ok(s.segments[0].target.includes("collection point"));
});
test("editing shared segment invalidates another term decision", () => {
  let s = seed();
  s = confirm(s, "commande", "s12", s.segments[0].target);
  assert.equal(confirmedRows(s).length, 1);
  s = confirm(s, "retrait", "s12", suggestion(s.terms[0], s.segments[0]).text);
  assert.equal(confirmedRows(s).length, 1);
  assert.equal(decision(s, s.terms[1], s.segments[0]), null);
});
test("import validation is atomic and successful imports reset decisions", () => {
  const s = seed();
  assert.equal(
    importSegments(s, csvText(SEGMENT_HEADERS, segmentRows(s))).segments.length,
    6,
  );
  assert.equal(
    importTerms(s, csvText(TERM_HEADERS, termRows(s))).terms.length,
    4,
  );
  assert.throws(() =>
    importSegments(
      s,
      "id;document;source_fr;cible_en\nx;A;Bonjour;Hello\nx;B;Salut;Hi",
    ),
  );
  assert.equal(s.segments.length, 6);
});
test("save roundtrip and rejection of stale decision", () => {
  let s = seed();
  s = confirm(s, "retrait", "s12", suggestion(s.terms[0], s.segments[0]).text);
  assert.equal(confirmedRows(restore(JSON.stringify(s))).length, 1);
  s.segments[0].target = "Changed externally";
  assert.throws(() => restore(JSON.stringify(s)), /décision/);
});

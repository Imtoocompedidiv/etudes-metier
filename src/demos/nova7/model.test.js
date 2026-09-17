import test from "node:test";
import assert from "node:assert/strict";
import { csvText } from "../../shared/files.js";
import {
  seed,
  assess,
  setLink,
  editObservation,
  deleteObservation,
  editRecommendation,
  setActiveVersion,
  review,
  restore,
  normalize,
  importCsv,
  observationRows,
  outputRows,
  report,
  retestText,
  IMPORT_HEADERS,
  MAX_BYTES,
} from "./model.js";
const rec = (s, id = "R-01") => s.recommendations.find((r) => r.id === id);
const payload = (s, id, patch) => {
  const { id: _, ...p } = s.observations.find((o) => o.id === id);
  return { ...p, ...patch };
};
function ready() {
  let s = setLink(seed(), "R-01", "O-01", "support");
  s = setLink(s, "R-01", "O-02", "support");
  s = setLink(s, "R-01", "O-03", "counterpoint");
  return review(s, "R-01", {
    by: "Équipe fictive",
    rationale:
      "Deux passages de la même séance motivent cette proposition. Le contrepoint montre un autre chemin possible.",
  });
}
test("two notes from one session are one participant; counterpoints remain explicit", () => {
  const s = ready(),
    a = assess(s, rec(s));
  assert.equal(a.observations, 2);
  assert.equal(a.sessions, 1);
  assert.equal(a.participants, 1);
  assert.equal(a.citations.length, 3);
  assert.equal(a.issues.length, 0);
  const rows = outputRows(s).filter((r) => r[0] === "R-01");
  assert.equal(rows.length, 3);
  assert.equal(rows[2][8], "Contrepoint");
  assert.match(rows[2][13], /filtre/);
});
test("an interpretation and an observation from another task or version cannot validate a recommendation", () => {
  for (const id of ["O-04", "O-05", "O-07"]) {
    const s = setLink(seed(), "R-01", id, "support");
    assert.equal(assess(s, rec(s)).observations, 0);
    assert.throws(
      () =>
        review(s, "R-01", {
          by: "Test",
          rationale: "Motif de relecture fictif",
        }),
      /nécessaire/,
    );
  }
  const s = setLink(ready(), "R-01", "O-04", "context");
  assert.equal(assess(s, rec(s)).issues.length, 0);
  assert.equal(rec(s).review, null);
});
test("editing a cited observation invalidates only dependent reviews and undo snapshots remain valid", () => {
  const s = ready(),
    saved = JSON.stringify(s),
    changed = editObservation(
      s,
      "O-01",
      payload(s, "O-01", {
        text: "Observation fictive corrigée après vérification des notes.",
      }),
    );
  assert.equal(rec(changed).review, null);
  assert.deepEqual(rec(changed, "R-02").review, rec(s, "R-02").review);
  assert.deepEqual(restore(saved), s);
  assert.deepEqual(setLink(s, "R-01", "O-01", "support"), s);
  assert.deepEqual(editObservation(s, "O-01", payload(s, "O-01", {})), s);
  const deleted = deleteObservation(s, "O-01");
  assert.equal(rec(deleted).links.length, 2);
  assert.equal(rec(deleted).review, null);
  assert.ok(rec(deleted, "R-02").review);
});
test("work version preserves historical review but retargeting a recommendation requires matching sources", () => {
  const s = ready(),
    v2 = setActiveVersion(s, "v2");
  assert.deepEqual(rec(v2).review, rec(s).review);
  assert.ok(assess(v2, rec(v2)).toRetest);
  assert.match(retestText(v2), /À tester sur v2/);
  let changed = editRecommendation(v2, "R-01", { versionId: "v2" });
  assert.equal(rec(changed).review, null);
  assert.equal(assess(changed, rec(changed)).observations, 0);
  changed = setLink(changed, "R-01", "O-01", "context");
  changed = setLink(changed, "R-01", "O-02", "context");
  changed = setLink(changed, "R-01", "O-07", "support");
  changed = review(changed, "R-01", {
    by: "Équipe v2 fictive",
    rationale:
      "Un test de la nouvelle version, à compléter ; anciennes notes gardées en contexte.",
  });
  assert.equal(assess(changed, rec(changed)).participants, 1);
  assert.equal(assess(changed, rec(changed)).toRetest, false);
});
test("CSV updates are atomic, idempotent and reject changed session identity", () => {
  const s = ready(),
    rows = observationRows(s);
  assert.deepEqual(importCsv(s, csvText(IMPORT_HEADERS, rows)), s);
  const changed = [...rows[0]];
  changed[7] = "Constat fictif corrigé.";
  const bad = [...rows[1]];
  bad[4] = "2026-02-29";
  assert.throws(
    () => importCsv(s, csvText(IMPORT_HEADERS, [changed, bad])),
    /impossible/,
  );
  assert.ok(rec(s).review);
  const updated = importCsv(s, csvText(IMPORT_HEADERS, [changed]));
  assert.equal(updated.observations.length, 7);
  assert.equal(rec(updated).review, null);
  assert.ok(rec(updated, "R-02").review);
  const contradiction = [...rows[0]];
  contradiction[2] = "P09";
  assert.throws(
    () => importCsv(s, csvText(IMPORT_HEADERS, [contradiction])),
    /ne peut pas changer/,
  );
  assert.throws(
    () => importCsv(s, csvText(IMPORT_HEADERS, [rows[0], rows[0]])),
    /répété/,
  );
});
test("strict restore rejects stale review, duplicate links, invalid references and private participant labels", () => {
  const s = ready();
  assert.deepEqual(restore(JSON.stringify(s)), s);
  const stale = structuredClone(s);
  stale.observations[0].source = "Autre document fictif";
  assert.throws(() => normalize(stale), /sources/);
  const duplicate = structuredClone(s);
  duplicate.recommendations[0].links.push(
    duplicate.recommendations[0].links[0],
  );
  assert.throws(() => normalize(duplicate), /répété/);
  const missing = structuredClone(s);
  missing.observations[0].taskId = "ABSENT";
  assert.throws(() => normalize(missing), /introuvable/);
  const person = structuredClone(s);
  person.sessions[0].participant = "Jean Exemple";
  assert.throws(() => normalize(person), /anonyme/);
  const extra = structuredClone(s);
  extra.secret = true;
  assert.throws(() => normalize(extra), /structure/);
});
test("exports keep unsupported hypotheses, interpretations and all written text", () => {
  const s = setLink(seed(), "R-01", "O-04", "context"),
    rows = outputRows(s);
  assert.equal(rows[0][5], "Hypothèse à étayer");
  assert.equal(rows[0][9], "Interprétation");
  assert.equal(rows[0][8], "Contexte");
  const html = report(s);
  assert.equal(html.sections[0].rows[0][4], s.observations[3].text);
  assert.match(
    html.sections[0].paragraphs.join(),
    /sans portée représentative/,
  );
  assert.equal(rows[0].length, 17);
  const none = outputRows(seed())[0];
  assert.equal(none.length, 17);
  assert.equal(none[7], "");
});
test("accepted canonical data round trips and over-budget escaped content is rejected", () => {
  const s = seed();
  s.observations = Array.from({ length: 500 }, (_, n) => ({
    id: `O-${n}`,
    sessionId: "S-01",
    taskId: "T-01",
    kind: "observed",
    text: "\\".repeat(2500),
    source: "\\".repeat(500),
  }));
  s.recommendations = [];
  const accepted = normalize(s),
    raw = JSON.stringify(accepted, null, 2);
  assert.ok(new TextEncoder().encode(raw).length < MAX_BYTES);
  assert.deepEqual(restore(raw), accepted);
  for (const o of s.observations) o.text = "\ud800".repeat(2500);
  assert.throws(() => normalize(s), /supérieur/);
  assert.throws(() => restore(" ".repeat(MAX_BYTES + 1)), /supérieur/);
});

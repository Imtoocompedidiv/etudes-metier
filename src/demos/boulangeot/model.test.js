import test from "node:test";
import assert from "node:assert/strict";
import {
  initialDossier,
  analyze,
  dimensionMm,
  parseOrder,
  correctLine,
  effectiveValues,
  sourceValues,
  changeMapping,
  replaceOrder,
  normalizeDossier,
  validDossier,
  outputRows,
  questionText,
  removeCorrection,
} from "./model.js";
const at = "2026-09-17T00:00:00.000Z";
test("L’unité absente ne se déduit pas de la dimension et les doublons restent tous bloqués", () => {
  const a = analyze(initialDossier());
  assert.equal(a.ready.length, 1);
  assert.equal(a.rows[1].widthMm, null);
  assert.equal(a.rows[2].widthMm, 1100);
  assert.ok(a.rows[3].issues.some((x) => x.code === "duplicate"));
  assert.ok(a.rows[4].issues.some((x) => x.code === "duplicate"));
});
test("Conversions explicites et décimales sans erreur binaire ni vide à zéro", () => {
  assert.equal(dimensionMm("1,125", "m"), 1125);
  assert.equal(dimensionMm("12.345", "cm"), 123.45);
  assert.equal(dimensionMm("0.125", "mm"), 0.125);
  for (const v of [
    "",
    "0",
    "-1",
    "1 000",
    "1,2.3",
    "1e3",
    "0.0001",
    "Infinity",
  ])
    assert.equal(dimensionMm(v, "mm"), null);
  assert.equal(dimensionMm("800", ""), null);
});
test("Correction avec motif, source conservée, sortie recalculée et retrait réversible", () => {
  const d = initialDossier();
  assert.throws(
    () => correctLine(d, 2, { ...effectiveValues(d, 2), unit: "cm" }, "", at),
    /Motif/,
  );
  const next = correctLine(
    d,
    2,
    { ...effectiveValues(d, 2), unit: "cm" },
    "Unité confirmée",
    at,
  );
  assert.equal(sourceValues(next, 2).unit, "");
  assert.equal(analyze(next).rows[1].widthMm, 800);
  assert.equal(outputRows(next).length, 2);
  assert.equal(analyze(removeCorrection(next, 2, at)).rows[1].widthMm, null);
});
test("Référence de plan nécessaire pour la forme spéciale mais aucune faisabilité déduite", () => {
  let d = initialDossier();
  assert.ok(analyze(d).rows[2].issues.some((x) => x.code === "plan"));
  d = correctLine(
    d,
    3,
    { ...effectiveValues(d, 3), plan: "PLAN-FICTIF-03-A" },
    "Référence fournie",
    at,
  );
  assert.equal(analyze(d).rows[2].ready, true);
  assert.ok(questionText(d).includes("faisabilité"));
});
test("Les repères identiques ne fusionnent jamais, même si les autres valeurs sont égales", () => {
  let d = initialDossier();
  d = correctLine(
    d,
    5,
    { ...effectiveValues(d, 5), reference: "F-05" },
    "Repère distinct confirmé",
    at,
  );
  assert.equal(analyze(d).ready.length, 3);
  d = correctLine(d, 5, effectiveValues(d, 4), "Copie volontaire", at);
  assert.equal(analyze(d).ready.length, 1);
});
test("Changer le mapping réinitialise les corrections, unité de fichier uniquement pour valeurs vides", () => {
  let d = initialDossier();
  d = correctLine(d, 2, { ...effectiveValues(d, 2), unit: "m" }, "Test", at);
  d = changeMapping(d, d.mapping, "cm", at);
  assert.equal(d.edits.length, 0);
  assert.equal(analyze(d).rows[1].widthMm, 800);
  assert.equal(analyze(d).rows[0].widthMm, 900);
  assert.equal(analyze(d).rows[2].widthMm, 1100);
  assert.throws(
    () => changeMapping(d, { ...d.mapping, width: "Hauteur" }, "", at),
    /deux champs/,
  );
});
test("CSV structure invalide rejetée ; fichier identique conserve corrections, différent les réinitialise", () => {
  for (const s of ["a;b\n", "a;a\nx;y", "__proto__;b\nx;y", "a;b\nx"])
    assert.throws(() => parseOrder(s));
  let d = initialDossier();
  d = correctLine(
    d,
    2,
    { ...effectiveValues(d, 2), unit: "cm" },
    "Confirmé",
    at,
  );
  const next = replaceOrder(d, d.table, "copie.csv", at);
  assert.equal(next.edits.length, 1);
  const changed = structuredClone(d.table);
  changed.rows[0][0] = "CHANGÉ";
  assert.equal(replaceOrder(d, changed, "nouveau.csv", at).edits.length, 0);
});
test("JSON réimportable canonique : aucune correction de ligne fantôme ou clé cachée", () => {
  const d = correctLine(
    initialDossier(),
    2,
    { ...effectiveValues(initialDossier(), 2), unit: "cm" },
    "Confirmé",
    at,
  );
  assert.ok(validDossier(d));
  assert.deepEqual(normalizeDossier(JSON.parse(JSON.stringify(d))), d);
  const forged = structuredClone(d);
  forged.edits[0].values.ready = true;
  assert.equal(validDossier(forged), false);
  const missing = structuredClone(d);
  missing.edits[0].line = 99;
  assert.throws(() => normalizeDossier(missing));
  const wrong = structuredClone(d);
  wrong.table.rows[0][0] = null;
  assert.equal(validDossier(wrong), false);
});

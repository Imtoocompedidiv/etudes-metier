import test from "node:test";
import assert from "node:assert/strict";
import {
  initialDocument,
  normalizeDate,
  normalizeAmount,
  runPipeline,
  validateRecipe,
  validateDocument,
  recipe,
  importSource,
} from "./model.js";
test("une date ambiguë exige un choix, puis respecte DMY et MDY", () => {
  assert.ok(normalizeDate("03/04/2026", "").error);
  assert.equal(normalizeDate("03/04/2026", "DMY").value, "2026-04-03");
  assert.equal(normalizeDate("03/04/2026", "MDY").value, "2026-03-04");
});
test("dates impossibles et années bissextiles", () => {
  assert.ok(normalizeDate("31/04/2026", "DMY").error);
  assert.ok(normalizeDate("29/02/2026", "DMY").error);
  assert.equal(normalizeDate("29/02/2024", "DMY").value, "2024-02-29");
  assert.ok(normalizeDate("2026-13-02", "ISO").error);
});
test("montants exacts, absence distincte de zéro et groupement strict", () => {
  assert.equal(normalizeAmount("1\u202f240,50 €").value, "1240.50");
  assert.equal(normalizeAmount("-12,01").value, "-12.01");
  assert.equal(normalizeAmount("0").value, "0.00");
  for (const x of ["", "12 34,56", "1.23", "2,999", "NaN"])
    assert.ok(normalizeAmount(x).error);
  assert.equal(normalizeAmount("1,240.50", "en").value, "1240.50");
});
test("le pipeline ne mute pas sa source et garde la provenance", () => {
  const d = initialDocument(),
    original = JSON.stringify(d);
  const r = runPipeline(d);
  assert.equal(JSON.stringify(d), original);
  assert.equal(r.rows[0].id, d.rows[0].id);
  assert.equal(r.rows[0].values.Client, "Atelier Aube");
  assert.equal(r.stages[1].traces[0].before, "1 240,50 €");
  assert.equal(r.validRows.length, 0);
});
test("choisir un format puis exclure explicitement les doublons", () => {
  const d = initialDocument();
  d.steps[2].format = "DMY";
  let r = runPipeline(d);
  assert.equal(r.validRows.length, 2);
  assert.equal(r.invalidRows.length, 4);
  d.steps[3].policy = "first";
  r = runPipeline(d);
  assert.equal(r.validRows.length, 3);
  assert.equal(r.excluded.length, 1);
  assert.equal(r.rows.length, 5);
  assert.equal(r.issues.length, 2);
});
test("recette exportée et réimportée donne exactement les mêmes valeurs", () => {
  const d = initialDocument();
  d.steps[2].format = "DMY";
  const exported = JSON.parse(JSON.stringify(recipe(d)));
  const steps = validateRecipe(exported, d.headers);
  assert.deepEqual(runPipeline({ ...d, steps }), runPipeline(d));
});
test("désactiver et réordonner les règles change réellement le calcul", () => {
  const d = initialDocument();
  d.steps[2].format = "DMY";
  d.steps[0].enabled = false;
  assert.equal(runPipeline(d).rows[0].values.Client, "  Atelier Aube  ");
  const ordered = {
    ...importSource("Commande\nA\n A"),
    steps: [
      { id: "trim", type: "trim", enabled: true, columns: ["*"] },
      {
        id: "dup",
        type: "dedup",
        enabled: true,
        columns: ["Commande"],
        policy: "flag",
      },
    ],
  };
  assert.equal(runPipeline(ordered).invalidRows.length, 2);
  ordered.steps.reverse();
  assert.equal(runPipeline(ordered).invalidRows.length, 0);
  assert.equal(runPipeline(ordered).rows[1].values.Commande, "A");
});
test("les méthodes importées ne peuvent demander une fonction arbitraire", () => {
  assert.throws(() =>
    validateRecipe(
      { version: 1, steps: [{ id: "x", type: "eval", enabled: true }] },
      ["Date"],
    ),
  );
  assert.throws(() =>
    validateRecipe(
      {
        version: 1,
        steps: [
          {
            id: "x",
            type: "date",
            column: "absente",
            enabled: true,
            format: "ISO",
          },
        ],
      },
      ["Date"],
    ),
  );
  assert.ok(!validateDocument({ headers: ["__proto__"], rows: [], steps: [] }));
});
test("un dossier importé doit être non vide, avec IDs uniques et valeurs texte", () => {
  assert.throws(() => importSource("Date;Montant"));
  const d = initialDocument();
  d.rows[1].id = d.rows[0].id;
  assert.equal(validateDocument(d), false);
});

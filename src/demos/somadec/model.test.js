import test from "node:test";
import assert from "node:assert/strict";
import { csvText } from "../../shared/files.js";
import {
  initial,
  comparisons,
  normalizePart,
  normalizeParts,
  parsePartsCSV,
  partRows,
  columns,
  normalizeDossier,
  replacePart,
  setReview,
  deletePart,
} from "./model.js";
test("Cinq pièces modifiées, ajout et suppression distincts, et inversion à surface égale", () => {
  const c = comparisons(initial);
  assert.equal(c.length, 5);
  assert.equal(c.filter((x) => x.status === "changed").length, 3);
  assert.equal(c.find((x) => x.id === "P-02").swapped, true);
  assert.equal(c.find((x) => x.id === "P-01").changes.length, 2);
  assert.equal(c.find((x) => x.id === "P-04").status, "removed");
  assert.equal(c.find((x) => x.id === "P-05").status, "added");
});
test("Chaque côté constitue une différence distincte", () => {
  const c = comparisons(initial).find((x) => x.id === "P-03");
  assert.deepEqual(
    c.changes.map((x) => x.key),
    ["front", "back"],
  );
});
test("Toute modification après relecture invalide uniquement la signature concernée", () => {
  const reviewed = setReview(setReview(initial, "P-01"), "P-02");
  assert.equal(comparisons(reviewed).filter((x) => x.reviewed).length, 2);
  const edited = replacePart(reviewed, { ...reviewed.after[0], width: 620 });
  assert.equal(
    comparisons(edited).find((x) => x.id === "P-01").reviewed,
    false,
  );
  assert.equal(comparisons(edited).find((x) => x.id === "P-02").reviewed, true);
  assert.equal(
    comparisons(reviewed).find((x) => x.id === "P-01").reviewed,
    true,
  );
});
test("CSV avec guillemets, accents et virgule décimale conserve les données", () => {
  const parts = [
    { ...initial.after[0], label: 'Joue; "droite"', thickness: 18.5 },
  ];
  const csv = csvText(columns, partRows(parts));
  assert.deepEqual(parsePartsCSV(csv), normalizeParts(parts));
  assert.equal(parsePartsCSV(csv.replace("18.5", "18,5"))[0].thickness, 18.5);
});
test("Valeurs manquantes, doublons et chant sans matière refusés avant mutation", () => {
  assert.throws(
    () => normalizePart({ ...initial.after[0], quantity: "" }),
    /Quantité/,
  );
  assert.throws(
    () => normalizePart({ ...initial.after[0], edgeType: "" }),
    /type de chant/,
  );
  assert.throws(
    () => normalizeParts([initial.after[0], initial.after[0]]),
    /Identifiant répété/,
  );
  assert.throws(
    () =>
      normalizeParts([initial.after[0], { ...initial.after[0], id: "autre" }]),
    /Étiquette répétée/,
  );
  assert.throws(() => parsePartsCSV(columns.join(";")), /1 à 500/);
  assert.throws(
    () => normalizePart({ ...initial.after[0], quantity: 1.5 }),
    /entière/,
  );
});
test("Supprimer puis restaurer une pièce conserve la version initiale", () => {
  const removed = deletePart(initial, "P-01");
  assert.equal(
    comparisons(removed).find((x) => x.id === "P-01").status,
    "removed",
  );
  const restored = replacePart(removed, initial.before[0]);
  assert.equal(
    comparisons(restored).find((x) => x.id === "P-01").status,
    "same",
  );
  assert.equal(initial.before[0].width, 580);
});
test("Dossier vide en nouvelle version valide et JSON reproduit la comparaison", () => {
  const d = { ...initial, after: [], reviews: {} };
  assert.equal(
    comparisons(normalizeDossier(d)).every((x) => x.status === "removed"),
    true,
  );
  const saved = JSON.parse(JSON.stringify(setReview(initial, "P-01")));
  assert.deepEqual(comparisons(normalizeDossier(saved)), comparisons(saved));
  assert.throws(() => normalizeDossier({ ...saved, before: [] }), /1 à 500/);
});
test("Les identifiants réservés sont refusés dans les imports CSV et JSON", () => {
  for (const id of ["__proto__", "constructor", "prototype"]) {
    const part = { ...initial.after[0], id };
    assert.throws(
      () => parsePartsCSV(csvText(columns, partRows([part]))),
      /Identifiant réservé/,
    );
    assert.throws(
      () => normalizeDossier({ ...initial, after: [part] }),
      /Identifiant réservé/,
    );
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  HEADERS,
  cents,
  validDate,
  seedState,
  stateOf,
  editRow,
  reviewRow,
  importRows,
  exportRows,
  restoreState,
} from "./model.js";
import { csvText } from "../../shared/files.js";
test("argent exact en centimes, pas de conversion silencieuse", () => {
  assert.equal(cents("24,80"), 2480);
  assert.equal(cents("0,01"), 1);
  for (const value of ["", " ", "0", "-5", "1e4", "12,333", "Infinity"])
    assert.equal(cents(value), null);
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2028-02-29"), true);
});
test("état initial et exclusion motivée, sans présélection", () => {
  const state = seedState();
  assert.equal(exportRows(state, "approved").length, 2);
  assert.throws(
    () => reviewRow(state, "R-108", { checked: true }),
    /Choisissez/,
  );
  assert.throws(
    () => reviewRow(state, "R-108", { decision: "exclude" }),
    /motif/,
  );
  const next = reviewRow(state, "R-108", {
    decision: "exclude",
    reason: "Même achat identifié dans le scénario.",
  });
  assert.equal(stateOf(next.rows[2], next.rows), "excluded");
  assert.equal(exportRows(next, "pending").length, 3);
  assert.equal(exportRows(next, "approved").length, 2);
});
test("édition invalide approbation et le CSV suit la donnée actuelle", () => {
  const original = seedState(),
    next = editRow(original, "R-106", "amount", "53,20");
  assert.equal(stateOf(next.rows[0], next.rows), "pending");
  assert.equal(exportRows(next, "approved").length, 1);
  const approved = reviewRow(next, "R-106", {
    decision: "keep",
    checked: true,
  });
  assert.equal(exportRows(approved, "approved")[0].montant, "53,20");
  assert.equal(stateOf(original.rows[0], original.rows), "approved");
});
test("les pièces manquantes et les montants invalides bloquent validation", () => {
  let state = seedState();
  assert.throws(
    () => reviewRow(state, "R-110", { decision: "keep", checked: true }),
    /justificatif/,
  );
  state = editRow(state, "R-110", "receipt", "JUST-8000");
  assert.throws(
    () => reviewRow(state, "R-110", { decision: "keep" }),
    /Confirmez/,
  );
  state = editRow(state, "R-110", "amount", "-3");
  assert.throws(
    () => reviewRow(state, "R-110", { decision: "keep", checked: true }),
    /Montant/,
  );
});
test("un nouveau rapprochement rend la validation existante périmée", () => {
  let state = seedState();
  state = editRow(state, "R-111", "mission", "VM-2409");
  state = editRow(state, "R-111", "date", "2026-09-10");
  state = editRow(state, "R-111", "amount", "52,30");
  assert.equal(stateOf(state.rows[0], state.rows), "pending");
});
test("import atomique strict, toutes les lignes redeviennent à contrôler", () => {
  const file = csvText(
    HEADERS,
    seedState().rows.map((r) => [r.id, r.mission, r.date, r.amount, r.receipt]),
  );
  assert.equal(exportRows(importRows(file), "approved").length, 0);
  assert.throws(() => importRows(file.replace("18,50", "-8")), /montant/);
  assert.throws(() => importRows(file.replace("R-107", "R-106")), /référence/);
  assert.throws(
    () => importRows(file.replace("2026-09-11", "2026-02-30")),
    /date/,
  );
  assert.throws(
    () => importRows(file.replace("VM-2408", "VM-UNKNOWN")),
    /mission/,
  );
});
test("reprise JSON valide et historique corrompu rejeté", () => {
  const original = seedState();
  assert.deepEqual(restoreState(JSON.stringify(original)), original);
  assert.throws(() => restoreState("{"), /JSON/);
  assert.throws(
    () => restoreState(JSON.stringify({ ...original, rows: [{ id: "X" }] })),
    /champ/,
  );
  assert.throws(
    () =>
      restoreState(
        JSON.stringify({
          ...original,
          journal: [{ step: 1, id: "X", action: {} }],
        }),
      ),
    /Historique/,
  );
});

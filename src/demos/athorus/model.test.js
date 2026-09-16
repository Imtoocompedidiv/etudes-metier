import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  validateCatalogue,
  importCatalogue,
  previewSelection,
  recipeCsv,
  recipeReport,
} from "./model.js";

function fixed() {
  return seed.map((row) =>
    row.id === "row-2" ? { ...row, SKU: "RIV-BL" } : { ...row },
  );
}
test("both conflicting references are identified and correcting one clears the lot", () => {
  assert.equal(
    validateCatalogue(seed).filter((i) => i.code === "duplicate-sku").length,
    2,
  );
  assert.deepEqual(validateCatalogue(fixed()), []);
});
test("blank stock does not become zero and a duplicate option is independent of SKU", () => {
  const rows = fixed();
  rows[1]["Inventory quantity"] = "";
  rows[1]["Option1 value"] = "Sable";
  assert.ok(validateCatalogue(rows).some((i) => i.code === "stock"));
  assert.equal(
    validateCatalogue(rows).filter((i) => i.code === "duplicate-option").length,
    2,
  );
});
test("CSV round trip preserves values and title continuation; unknown format is rejected", () => {
  const rows = fixed();
  rows[0].Title = 'Sac "Rivage", été';
  const imported = importCatalogue(recipeCsv(rows));
  assert.equal(imported[0].Title, rows[0].Title);
  assert.equal(imported[1].Title, "");
  assert.deepEqual(validateCatalogue(imported), []);
  assert.throws(() => importCatalogue("sku,stock\nRIV,2"), /colonne/i);
});
test("stock boundary, invalid quantities and blocked variants change the customer outcome", () => {
  const rows = fixed();
  assert.equal(previewSelection(rows[0], "12", []).ok, true);
  assert.equal(previewSelection(rows[0], "13", []).ok, false);
  assert.equal(previewSelection(rows[0], "", []).ok, false);
  assert.equal(previewSelection(rows[0], "1.5", []).ok, false);
  assert.equal(previewSelection(rows[5], "1", []).ok, false);
  assert.equal(
    previewSelection(seed[0], "1", validateCatalogue(seed)).ok,
    false,
  );
});
test("export is gated and report uses current values", () => {
  assert.throws(() => recipeCsv(seed), /anomalies/);
  const rows = fixed();
  rows[0]["Inventory quantity"] = "2";
  assert.equal(recipeReport(rows).rows[0]["Inventory quantity"], "2");
  assert.equal(recipeReport(rows).tests[1].quantity, 3);
});
test("monetary precision and oversized fields are refused at the boundary", () => {
  const row = {
    ...fixed()[0],
    Price: "0.01",
    "Inventory quantity": String(Number.MAX_SAFE_INTEGER),
  };
  assert.equal(
    previewSelection(row, String(Number.MAX_SAFE_INTEGER), []).totalCents,
    Number.MAX_SAFE_INTEGER,
  );
  row.Price = "0.02";
  assert.match(
    previewSelection(row, String(Number.MAX_SAFE_INTEGER), []).reason,
    /précision monétaire/,
  );
  assert.equal(previewSelection(row, "9007199254740992", []).ok, false);
  const rows = fixed();
  rows[0].Title = "x".repeat(241);
  assert.ok(
    validateCatalogue(rows).some((issue) => issue.code === "field-length"),
  );
  assert.throws(() => importCatalogue(recipeCsv(rows, true)), /240 caractères/);
});

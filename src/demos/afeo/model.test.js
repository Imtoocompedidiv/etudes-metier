import test from "node:test";
import assert from "node:assert/strict";
import {
  initial,
  normalizeProject,
  compare,
  allocations,
  setRequest,
  editOffer,
  parseImport,
  validDate,
} from "./model.js";
const clone = () => structuredClone(initial);
test("Le stock réservé est retiré, les boîtes sont arrondies et le port appliqué une seule fois", () => {
  const a = compare(initial)[0],
    l = a.lines[0];
  assert.equal(l.free, 12);
  assert.equal(l.buy, 60);
  assert.equal(l.boxes, 3);
  assert.equal(l.ordered, 75);
  assert.equal(l.surplus, 15);
  assert.equal(a.partial, 30250);
  assert.equal(a.freight, 0);
  assert.equal(a.total, 30250);
  const p = clone();
  p.suppliers[0].freeFrom = null;
  assert.equal(compare(p)[0].total, 31750);
});
test("Un panier incomplet ne peut pas être affiché moins cher à périmètre inégal", () => {
  const b = compare(initial)[1];
  assert.equal(b.complete, false);
  assert.equal(b.covered, 3);
  assert.equal(b.total, null);
  const p = editOffer(initial, "Boréal", "FEU12", { article: "MA" });
  assert.equal(compare(p)[1].complete, true);
  assert.equal(compare(p)[1].total, 25080);
});
test("Un stock central ne peut être alloué deux fois aux agences et le surplus reste au dépôt", () => {
  const rows = allocations(initial, "Atlas").filter((r) => r.article === "CH");
  assert.equal(
    rows.reduce((s, r) => s + r.stock_alloue, 0),
    12,
  );
  assert.equal(
    rows.reduce((s, r) => s + r.achat_alloue, 0),
    60,
  );
  assert.equal(
    rows.reduce((s, r) => s + r.demande, 0),
    72,
  );
});
test("Une modification de besoin remplace la ligne, zéro besoin ne déclenche pas de port", () => {
  let p = setRequest(initial, "Agence Rivage", "CH", 42);
  assert.equal(p.requests.length, initial.requests.length);
  p = clone();
  p.requests = p.requests.map((r) => ({ ...r, quantite: 0 }));
  const a = compare(p)[0];
  assert.equal(a.total, 0);
  assert.equal(a.freight, 0);
  assert.equal(a.lines[0].surplus, 0);
});
test("Prix inconnu, date expirée et association ambiguë restent bloquants", () => {
  let p = clone();
  p.offers[0].prix = null;
  assert.equal(compare(p)[0].total, null);
  p = clone();
  p.date = "2026-11-01";
  assert.equal(compare(p)[0].covered, 0);
  p = clone();
  p.offers[7].article = "CH";
  assert.throws(() => normalizeProject(p), /Correspondance/);
});
test("Imports invalides ne modifient pas le dossier, valeurs absentes ne valent pas zéro", () => {
  const before = JSON.stringify(initial);
  assert.throws(
    () =>
      parseImport(
        "agence;article;quantite\nAgence Rivage;CH;",
        "requests",
        initial,
      ),
    /entier/,
  );
  assert.throws(
    () => parseImport("article;physique;reserve\nCH;2;5", "stocks", initial),
    /réservé/,
  );
  assert.throws(
    () => parseImport("agence;article;quantite", "requests", initial),
    /vide/,
  );
  assert.equal(JSON.stringify(initial), before);
  assert.throws(() => validDate("2026-13-01"), /impossible/);
  assert.throws(() => validDate("2026-02-30"), /impossible/);
});
test("Le même article ne peut pas être importé deux fois pour une agence", () => {
  assert.throws(
    () =>
      parseImport(
        "agence;article;quantite\nAgence Rivage;CH;2\nAgence Rivage;CH;3",
        "requests",
        initial,
      ),
    /double/,
  );
  const p = normalizeProject(JSON.parse(JSON.stringify(initial)));
  assert.deepEqual(compare(p), compare(initial));
});

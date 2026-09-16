import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  audit,
  editRow,
  parseCollection,
  exportRows,
  manifest,
  parseDossier,
  validState,
} from "./model.js";

const resolved = () =>
  editRow(structuredClone(seed), "articles", "articles-0", { author: "a-001" });
test("Une référence auteur absente bloque le lot ; sa correction permet les trois exports", () => {
  assert.equal(audit(seed).problems.length, 1);
  assert.throws(() => exportRows(seed, "articles"));
  const value = resolved();
  assert.equal(audit(value).ready, true);
  assert.equal(exportRows(value, "articles")[0].author, "a-001");
  assert.deepEqual(manifest(value).order[2].dependsOn, [
    "authors",
    "categories",
  ]);
  assert.equal(value.collections.articles.rows[0].original.auteur, "a-003");
});
test("Les slugs dupliqués, références multiples ambiguës et dates impossibles sont détectés", () => {
  let value = resolved();
  value = editRow(value, "articles", "articles-1", {
    slug: "le-temps-du-chantier",
    date: "2026-02-30",
    categories: "c-001|c-001|absent",
  });
  const p = audit(value).problems;
  assert.equal(p.filter((i) => i.field === "slug").length, 2);
  assert.equal(p.filter((i) => i.field === "date").length, 1);
  assert.equal(p.filter((i) => i.field === "categories").length, 2);
});
test("Un import arbitraire demande une correspondance, sans deviner les références", () => {
  const item = parseCollection(
    "code;url;signature\na-1;jeanne;Jeanne",
    "authors",
  );
  assert.equal(item.map.id, "");
  const value = {
    ...resolved(),
    collections: { ...resolved().collections, authors: item },
  };
  assert.ok(audit(value).problems.some((p) => p.uid === null));
  assert.throws(() => parseCollection("id;nom\n", "authors"));
  assert.throws(() =>
    parseCollection("id;nom\nx;" + "a".repeat(5001), "authors"),
  );
});
test("Une clé en double rend les références ambiguës même si le libellé est identique", () => {
  const value = resolved();
  value.collections.authors.rows[1].data.id = "a-001";
  assert.ok(
    audit(value).problems.some(
      (p) => p.message === "Référence auteur ambiguë.",
    ),
  );
});
test("Le dossier est strictement borné et les valeurs exportées restent celles de la version courante", () => {
  const value = resolved();
  assert.ok(validState(value));
  assert.deepEqual(parseDossier(JSON.stringify(value)), value);
  assert.throws(() => parseDossier('{"collections":{}}'));
  const unsafe = structuredClone(value);
  unsafe.collections.articles.map.uid = "id";
  assert.throws(() => parseDossier(JSON.stringify(unsafe)));
  value.collections.articles.headers.push("id");
  assert.equal(validState(value), false);
});

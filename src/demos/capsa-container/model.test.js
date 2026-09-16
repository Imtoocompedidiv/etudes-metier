import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  analyse,
  compareVersions,
  normalizeProject,
  parseBom,
  parseMappings,
  parsePlans,
  setMapping,
  editRow,
  preparationRows,
  subtractDays,
} from "./model.js";
const copy = () => structuredClone(seed);
test("a lead-time change remains visible when the quantity and management reference stay the same", () => {
  let p = copy();
  p = setMapping(p, {
    reference: "LED-24",
    indice: "A",
    unite: "u",
    article: "ERP-LUM-012",
    unite_cible: "u",
    delai: 10,
  });
  const changed = compareVersions(p).find((r) => r.article === "ERP-LUM-012");
  assert.equal(changed.delta, 0);
  assert.equal(changed.status, "Date modifiée");
  assert.equal(changed.beforeLaunch, "2026-10-04");
  assert.equal(changed.afterLaunch, "2026-09-29");
});
test("an absent plan never becomes an implicit one-module quantity", () => {
  const p = copy();
  p.plans = [];
  const result = analyse(p, "B");
  assert.ok(result.details.every((r) => r.total === null));
  assert.ok(result.groups.every((r) => r.quantite === null));
  assert.equal(result.exportable, false);
});
test("a management article cannot be exported under conflicting target units", () => {
  let p = copy();
  p = setMapping(p, {
    reference: "PAN-18",
    indice: "A",
    unite: "m2",
    article: "ERP-SAME",
    unite_cible: "m2",
    delai: 1,
  });
  p = setMapping(p, {
    reference: "RAIL-02",
    indice: "A",
    unite: "m",
    article: "ERP-SAME",
    unite_cible: "m",
    delai: 1,
  });
  const result = analyse(p, "B");
  assert.equal(
    result.details.filter((r) =>
      r.issues.some((i) => i.includes("Plusieurs unités")),
    ).length,
    2,
  );
  assert.equal(result.exportable, false);
});
const complete = () =>
  setMapping(
    setMapping(copy(), {
      reference: "LED-24",
      indice: "A",
      unite: "u",
      article: "ERP-LUM-024",
      unite_cible: "u",
      delai: 5,
    }),
    {
      reference: "CON-02",
      indice: "A",
      unite: "u",
      article: "ERP-CON-02",
      unite_cible: "u",
      delai: 3,
    },
  );
test("hierarchy multiplies quantities and retains source paths, assemblies do not enter procurement", () => {
  const a = analyse(copy(), "B");
  assert.equal(a.details.find((r) => r.node === "PAN").total, 36);
  assert.deepEqual(a.details.find((r) => r.node === "PAN").path, [
    "MOD-01",
    "PAR",
    "PAN",
  ]);
  assert.equal(a.groups.length, 5);
  assert.ok(!a.groups.some((r) => r.article === "LOT-PAR"));
});
test("unknown mapping and unknown lead block the whole preparation rather than dropping rows", () => {
  assert.throws(() => preparationRows(copy(), "B"), /Complétez/);
  const p = complete();
  assert.equal(preparationRows(p, "B").length, 5);
  assert.equal(analyse(p, "B").exportable, true);
  assert.ok(preparationRows(p, "B").every((r) => r.provenance && r.lancement));
});
test("version comparison preserves removals, additions and changed quantities independently", () => {
  const rows = compareVersions(complete());
  assert.equal(rows.find((r) => r.article === "ERP-VIS-01").delta, -36);
  assert.equal(rows.find((r) => r.article === "ERP-LUM-012").status, "Retrait");
  assert.equal(rows.find((r) => r.article === "ERP-LUM-024").delta, 6);
  assert.equal(rows.find((r) => r.article === "ERP-CON-02").delta, 3);
  assert.equal(
    rows.find((r) => r.article === "ERP-PAN-18").status,
    "Identique",
  );
});
test("unit conversions are dimension-checked and affect preparation with provenance intact", () => {
  const p = setMapping(complete(), {
    reference: "RAIL-02",
    indice: "A",
    unite: "m",
    article: "ERP-RAIL-02",
    unite_cible: "mm",
    delai: 4,
  });
  assert.equal(
    preparationRows(p, "B").find((r) => r.article === "ERP-RAIL-02").quantite,
    18000,
  );
  assert.throws(
    () =>
      parseMappings([
        {
          reference: "R",
          indice: "A",
          unite: "m",
          article: "X",
          unite_cible: "u",
          delai: 1,
        },
      ]),
    /incompatibles/,
  );
});
test("cycles, missing parents, duplicate nodes and excessive depth are rejected atomically", () => {
  const before = copy(),
    rows = structuredClone(before.versions.B);
  rows[0].parent = "PAR";
  assert.throws(() => parseBom(rows), /Cycle/);
  rows[0].parent = "ABSENT";
  assert.throws(() => parseBom(rows), /absent/);
  assert.throws(
    () => parseBom([...before.versions.B, before.versions.B[0]]),
    /deux fois/,
  );
  assert.deepEqual(before, seed);
  const deep = Array.from({ length: 34 }, (_, i) => ({
    node: `N${i}`,
    parent: i ? `N${i - 1}` : "",
    reference: `R${i}`,
    indice: "A",
    designation: "Exemple",
    quantite: 1,
    unite: "u",
    type: i === 33 ? "article" : "ensemble",
  }));
  assert.throws(() => parseBom(deep), /32 niveaux/);
});
test("fractional explosion avoids decimal artefacts; overflow cannot create an export", () => {
  let p = editRow(complete(), "B", "PAR", { quantite: 0.1 });
  p = editRow(p, "B", "PAN", { quantite: 0.2 });
  assert.equal(
    analyse(p, "B").details.find((r) => r.node === "PAN").total,
    0.06,
  );
  p = editRow(p, "B", "MOD-01", { quantite: 100000 });
  p = editRow(p, "B", "PAR", { quantite: 100000 });
  p = editRow(p, "B", "PAN", { quantite: 100000 });
  assert.equal(analyse(p, "B").exportable, false);
});
test("calendar delay is subtracted in UTC, zero is valid and blank stays unknown", () => {
  assert.equal(subtractDays("2026-10-09", 5), "2026-10-04");
  assert.equal(subtractDays("2026-03-01", 1), "2026-02-28");
  assert.equal(subtractDays("2028-03-01", 1), "2028-02-29");
  assert.throws(
    () => parsePlans([{ racine: "R", modules: 1, besoin: "2026-02-30" }]),
    /impossible/,
  );
  assert.equal(
    analyse(complete(), "B").groups.find((r) => r.article === "ERP-LUM-024")
      .lancement,
    "2026-10-04",
  );
});
test("JSON round-trip and source-like CSV records preserve preparation and reject malicious keys", () => {
  const p = complete();
  assert.deepEqual(
    preparationRows(normalizeProject(JSON.parse(JSON.stringify(p))), "B"),
    preparationRows(p, "B"),
  );
  assert.throws(
    () =>
      parseMappings([
        {
          reference: "R",
          indice: "A",
          unite: "__proto__",
          article: "A",
          unite_cible: "u",
          delai: 1,
        },
      ]),
    /inconnue/,
  );
  assert.throws(
    () => parsePlans([{ racine: "R", modules: 0, besoin: "2026-10-09" }]),
    /entier/,
  );
  assert.throws(() => normalizeProject({ ...p, schema: "x" }), /format/);
});

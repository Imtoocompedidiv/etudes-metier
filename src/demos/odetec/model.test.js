import test from "node:test";
import assert from "node:assert/strict";
import { csvText } from "../../shared/files.js";
import {
  initial,
  prepared,
  mapProject,
  editRow,
  parseTable,
  normalizeDossier,
  importTable,
  manifest,
  schemas,
  validDossier,
} from "./model.js";
test("Le cache doit être canonique et une correction ne peut jamais remplacer un identifiant stable", () => {
  const malformed = structuredClone(initial);
  malformed.edits = [
    {
      table: "projects",
      id: "P-101",
      values: { id: "P-999", titre: "Projet modifié", ville: "Paris" },
    },
  ];
  assert.equal(validDossier(malformed), false);
  assert.equal(prepared(malformed).tables.projects[0].id, "P-101");
  const normalized = normalizeDossier(malformed);
  assert.equal(validDossier(normalized), true);
  assert.equal(prepared(normalized).tables.projects[0].id, "P-101");
  assert.equal(validDossier(initial), true);
  const reordered = {
    journal: [],
    mappings: [],
    edits: [],
    source: initial.source,
    version: 1,
  };
  assert.equal(validDossier(reordered), true);
  const untrimmed = structuredClone(initial);
  untrimmed.source.projects[0].id = " P-101 ";
  assert.equal(validDossier(untrimmed), false);
});
test("Une correspondance résout deux références sans fusionner les projets homonymes", () => {
  const d = mapProject(initial, "ancien-102", "P-102"),
    p = prepared(d);
  assert.equal(p.effects.length, 2);
  assert.equal(p.tables.projects.length, 2);
  assert.equal(p.homonyms.length, 2);
  assert.equal(p.issues.length, 1);
  assert.equal(p.issues[0].id, "D-04");
  assert.equal(p.issues[0].type, "cross-project");
  assert.equal(initial.mappings.length, 0);
});
test("Le manifeste exige les relations cohérentes et explique chaque effet et source", () => {
  const mapped = mapProject(initial, "ancien-102", "P-102");
  assert.throws(() => manifest(mapped), /Résolvez/);
  const d = editRow(mapped, "deliverables", "D-04", {
      ...initial.source.deliverables[3],
      lot: "L-03",
    }),
    m = manifest(d);
  assert.equal(m.relations.length, 11);
  assert.equal(m.mappingEffects.length, 2);
  assert.deepEqual(m.counts, { projects: 2, lots: 3, deliverables: 4 });
  assert.deepEqual(
    m.relations.find((r) => r.id === "D-04" && r.property === "Lot"),
    {
      table: "deliverables",
      id: "D-04",
      property: "Lot",
      targetTable: "lots",
      targetId: "L-03",
      sourceValue: "L-01",
    },
  );
});
test("Retirer ou changer une correspondance remet tous les liens à contrôler", () => {
  const d = mapProject(initial, "ancien-102", "P-102");
  assert.deepEqual(
    prepared(mapProject(d, "ancien-102", "")).issues,
    prepared(initial).issues,
  );
  assert.ok(
    prepared(mapProject(d, "ancien-102", "P-101")).tables.lots.find(
      (r) => r.id === "L-03",
    ).projet === "P-101",
  );
  assert.throws(() => mapProject(d, "P-101", "P-102"), /ambiguë/);
  assert.throws(() => mapProject(d, "ancien-102", "P-999"), /absente/);
});
test("CSV guillemets et retour ligne conservés, identifiants et tables vides rejetés", () => {
  const rows = [
    { id: "P-A", titre: 'École; "A"\nAnnexe', ville: "Ville test" },
  ];
  assert.deepEqual(
    parseTable("projects", csvText(schemas.projects.columns, rows)),
    rows,
  );
  assert.throws(() => parseTable("projects", "id;titre;ville"), /1 à 300/);
  for (const id of ["", "__proto__", "constructor", "prototype"])
    assert.throws(() =>
      parseTable(
        "projects",
        csvText(schemas.projects.columns, [{ ...rows[0], id }]),
      ),
    );
  assert.throws(
    () =>
      parseTable(
        "projects",
        csvText(schemas.projects.columns, [rows[0], rows[0]]),
      ),
    /répété/,
  );
});
test("Importer une table remplace seulement sa source et invalide les corrections concernées", () => {
  const d = editRow(
    mapProject(initial, "ancien-102", "P-102"),
    "lots",
    "L-01",
    { titre: "Structure révisée", projet: "P-101" },
  );
  const imported = importTable(d, "projects", [
    { id: "P-103", titre: "Autre projet", ville: "Ville test" },
  ]);
  assert.equal(imported.mappings.length, 0);
  assert.equal(imported.edits.length, 1);
  assert.ok(
    prepared(imported).issues.some((i) => i.type === "missing-project"),
  );
  assert.equal(importTable(d, "lots", initial.source.lots).edits.length, 0);
});
test("Les contrôles portent sur les codes de projet et de lot, jamais sur leurs titres", () => {
  const d = editRow(initial, "deliverables", "D-01", {
    ...initial.source.deliverables[0],
    lot: "ABSENT",
  });
  assert.ok(
    prepared(d).issues.some((i) => i.id === "D-01" && i.type === "missing-lot"),
  );
  const p = prepared(initial);
  assert.ok(
    p.issues.some((i) => i.id === "D-04" && i.type === "cross-project"),
  );
});
test("Export JSON valide après aller retour ; corrections et correspondances dupliquées refusées", () => {
  const d = mapProject(initial, "ancien-102", "P-102");
  assert.deepEqual(normalizeDossier(JSON.parse(JSON.stringify(d))), d);
  assert.throws(
    () => normalizeDossier({ ...d, mappings: [...d.mappings, ...d.mappings] }),
    /ambiguë/,
  );
  assert.throws(
    () =>
      normalizeDossier({
        ...d,
        edits: [{ table: "lots", id: "inconnu", values: { titre: "X" } }],
      }),
    /source/,
  );
});

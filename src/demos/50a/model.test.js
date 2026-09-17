import test from "node:test";
import assert from "node:assert/strict";
import { csvText } from "../../shared/files.js";
import {
  analyse,
  change,
  CONTENT_HEADERS,
  contentRows,
  dateNumber,
  editContent,
  editInitiative,
  importContents,
  importInitiatives,
  INITIATIVE_HEADERS,
  initiativeRows,
  normalize,
  restore,
  seed,
  validDossier,
  workingDays,
} from "./model.js";

test("Dates civiles exactes, bornes et jours ouvrés indépendants du fuseau", () => {
  assert.throws(() => dateNumber("2026-02-30"), /impossible/);
  assert.throws(() => dateNumber("2100-01-01"), /2099/);
  assert.equal(workingDays("2026-09-18", "2026-09-21").length, 2);
  assert.throws(
    () =>
      editInitiative(seed(), "I01", { start: "2026-09-12", end: "2026-09-13" }),
    /lundi/,
  );
  assert.throws(
    () => editInitiative(seed(), "I01", { end: "2026-09-06" }),
    /181/,
  );
});

test("Contenu à date inclusive, blocage aval et dates jamais déplacées", () => {
  const initial = seed();
  assert.equal(analyse(initial).blocked.has("I03"), false);
  const d = editContent(initial, "C03", { ready: "2026-09-22" });
  const report = analyse(d);
  assert.equal(report.blocked.has("I03"), true);
  assert.ok(
    report.issues.some(
      (i) => i.initiativeId === "I04" && i.type === "Blocage en amont",
    ),
  );
  assert.deepEqual(d.initiatives, initial.initiatives);
  assert.equal(
    initial.contents.find((c) => c.id === "C03").ready,
    "2026-09-21",
  );
  const ready = editContent(d, "C03", { state: "Prêt", ready: "2026-09-21" });
  assert.equal(
    analyse(ready).issues.some((i) => i.initiativeId === "I03"),
    false,
  );
});

test("Cycles et références manquantes conservés pour correction, sans récursion infinie", () => {
  const d = seed(),
    report = analyse(d);
  assert.deepEqual(
    report.issues.filter((i) => i.type === "Cycle").map((i) => i.initiativeId),
    ["I05", "I06"],
  );
  const repaired = editInitiative(d, "I05", { depends: [] });
  assert.equal(
    analyse(repaired).issues.some((i) => i.type === "Cycle"),
    false,
  );
  const absent = editInitiative(repaired, "I01", {
    contents: ["ABSENT"],
    depends: ["INCONNU"],
  });
  const issues = analyse(absent).issues;
  assert.ok(issues.some((i) => i.type === "Contenu absent"));
  assert.ok(issues.some((i) => i.type === "Préalable absent"));
  assert.ok(
    issues.some(
      (i) => i.initiativeId === "I02" && i.type === "Blocage en amont",
    ),
  );
});

test("Répartition exacte au centième, surcharge stricte et capacité inconnue distincte de zéro", () => {
  const d = normalize({
    ...seed(),
    initiatives: [
      {
        id: "I",
        title: "Cas de borne",
        owner: "Test",
        start: "2026-09-18",
        end: "2026-09-22",
        effort: 1,
        contents: [],
        depends: [],
      },
    ],
    capacities: [{ owner: "Test", hours: 0.66 }],
  });
  const row = analyse(d).loads[0];
  assert.deepEqual(row.values, [34, 66]);
  assert.equal(
    row.values.reduce((a, b) => a + b, 0),
    100,
  );
  assert.equal(
    row.values.some((v) => v > row.capacity),
    false,
  );
  assert.deepEqual(
    row.contributions.map((c) => c.units),
    [34, 33, 33],
  );
  const missing = analyse({ ...d, capacities: [] }).loads[0];
  assert.equal(missing.capacity, null);
  assert.equal(
    analyse({ ...d, capacities: [{ owner: "Test", hours: 0 }] }).loads[0]
      .capacity,
    0,
  );
});

test("Imports CSV aller-retour, rejet des doublons et nombres ambigus", () => {
  const d = seed();
  assert.deepEqual(
    importContents(csvText(CONTENT_HEADERS, contentRows(d))),
    d.contents,
  );
  assert.deepEqual(
    importInitiatives(csvText(INITIATIVE_HEADERS, initiativeRows(d))),
    d.initiatives,
  );
  assert.throws(
    () =>
      importContents(
        csvText(CONTENT_HEADERS, [...contentRows(d), contentRows(d)[0]]),
      ),
    /répété/,
  );
  const rows = initiativeRows(d);
  rows[0][5] = "";
  assert.throws(
    () => importInitiatives(csvText(INITIATIVE_HEADERS, rows)),
    /nombre/,
  );
  assert.throws(() => editInitiative(d, "I01", { effort: 1.005 }), /décimales/);
  assert.throws(() => editInitiative(d, "I01", { effort: 10001 }), /dépasse/);
  assert.throws(
    () => editInitiative(d, "I01", { depends: ["I02", "I02"] }),
    /répétée/,
  );
});

test("Restauration et cache canoniques, identifiants immuables, erreurs atomiques", () => {
  const d = seed();
  assert.equal(validDossier(d), true);
  assert.deepEqual(restore(JSON.stringify(d)), d);
  assert.equal(validDossier({ ...d, hidden: true }), false);
  const raw = structuredClone(d);
  raw.initiatives[0].effort = "16";
  assert.equal(validDossier(raw), false);
  assert.equal(restore(JSON.stringify(raw)).initiatives[0].effort, 16);
  assert.equal(editContent(d, "C01", { id: "INJECT" }).contents[0].id, "C01");
  assert.throws(
    () => change(d, { capacities: [{ owner: "Alice", hours: 169 }] }, "Erreur"),
    /168/,
  );
  assert.equal(d.capacities[0].hours, 18);
});

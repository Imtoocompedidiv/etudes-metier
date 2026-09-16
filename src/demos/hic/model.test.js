import test from "node:test";
import assert from "node:assert/strict";
import { csvText } from "../../shared/files.js";
import {
  seed,
  calculate,
  reachable,
  graphLayout,
  grams,
  importLots,
  importMovements,
  lotHeaders,
  movementHeaders,
  restore,
} from "./model.js";

test("Une consommation excessive ne modifie ni stock ni filiation", () => {
  const result = calculate(seed.lots, seed.movements);
  assert.equal(result.valid.length, 3);
  assert.match(result.rejected[0].reason, /15 kg/);
  assert.equal(result.balances["BOIS-01"], 60000);
  assert.equal(result.balances["LOT-D"], 0);
  assert.deepEqual([...reachable("BOIS-01", result.edges)].sort(), [
    "LOT-A",
    "LOT-B",
  ]);
  assert.equal(
    Object.values(result.balances).reduce((a, b) => a + b, 0),
    200000,
  );
});
test("Correction, conservation de masse et retrait transitive", () => {
  const movements = structuredClone(seed.movements);
  movements[3].quantity_kg = "50";
  const result = calculate(seed.lots, movements);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.balances["BOIS-01"], 10000);
  assert.deepEqual([...reachable("BOIS-01", result.edges)].sort(), [
    "LOT-A",
    "LOT-B",
    "LOT-D",
  ]);
  assert.equal(
    Object.values(result.balances).reduce((a, b) => a + b, 0),
    200000,
  );
  const layout = graphLayout(seed.lots, result.edges);
  assert.ok(
    layout.nodes.find((n) => n.id === "LOT-B").x >
      layout.nodes.find((n) => n.id === "LOT-A").x,
  );
});
test("Cycles, origines inconnues et dates antérieures sont isolés", () => {
  const extra = [
    {
      id: "M05",
      date: "2026-09-15",
      source: "LOT-B",
      destination: "LOT-A",
      quantity_kg: "1",
    },
    {
      id: "M06",
      date: "2026-09-09",
      source: "BOIS-01",
      destination: "LOT-B",
      quantity_kg: "1",
    },
    {
      id: "M07",
      date: "2026-09-15",
      source: "ABSENT",
      destination: "LOT-A",
      quantity_kg: "1",
    },
  ];
  const result = calculate(seed.lots, [...seed.movements, ...extra]);
  assert.match(result.results.find((r) => r.id === "M05").reason, /cycle/);
  assert.match(result.results.find((r) => r.id === "M06").reason, /précède/);
  assert.match(result.results.find((r) => r.id === "M07").reason, /inconnu/);
  assert.equal(result.balances["LOT-B"], 38000);
});
test("Ordre de calcul date puis identifiant indépendant de l’ordre importé", () => {
  assert.deepEqual(
    calculate(seed.lots, seed.movements),
    calculate(seed.lots, [...seed.movements].reverse()),
  );
});
test("Imports CSV réels, doublons et bornes de quantité", () => {
  assert.deepEqual(importLots(csvText(lotHeaders, seed.lots)), seed.lots);
  assert.deepEqual(
    importMovements(csvText(movementHeaders, seed.movements)),
    seed.movements,
  );
  assert.throws(
    () => importLots(csvText(lotHeaders, [...seed.lots, seed.lots[0]])),
    /dupliqué/,
  );
  assert.equal(grams("0,125"), 125);
  assert.throws(() => grams("0.0001"));
  assert.throws(() => grams(""));
  assert.throws(() => grams("1e10"));
  assert.throws(
    () =>
      importMovements(
        csvText(movementHeaders, [
          { ...seed.movements[0], date: "2026-02-30" },
        ]),
      ),
    /Date invalide/,
  );
});
test("Restauration valide et rejet des stocks produits initiaux et schémas inconnus", () => {
  assert.deepEqual(restore(seed), seed);
  assert.throws(() => restore({ ...seed, schema: "other" }));
  const edited = structuredClone(seed);
  edited.lots[2].quantity_kg = "1";
  assert.throws(() => restore(edited), /commencer à zéro/);
});

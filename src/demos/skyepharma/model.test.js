import test from "node:test";
import assert from "node:assert/strict";
import {
  initial,
  analyze,
  parseLot,
  planningExample,
  demandesExample,
  addLot,
  setRule,
  correctEvent,
  resolveCollision,
  replay,
  isStale,
  changes,
  normalizeDossier,
  validDossier,
} from "./model.js";
const time = "2026-09-17T12:00:00Z";
test("Les deux sources gardent leurs actions A-10 distinctes et la révision la plus haute", () => {
  const a = analyze(initial);
  assert.equal(a.rows.length, 8);
  assert.equal(a.actions.length, 2);
  assert.equal(a.pending.length, 3);
  assert.equal(a.actions.filter((r) => r.actionId === "A-10").length, 2);
  assert.equal(a.actions.find((r) => r.source === "planning").revision, 2);
  assert.equal(a.actions.find((r) => r.source === "planning").state, "done");
  assert.equal(a.rows.filter((r) => r.code === "older").length, 2);
  assert.equal(a.rows.filter((r) => r.code === "duplicate").length, 1);
});
test("Importer deux fois le même lot ne change pas le résultat métier", () => {
  const d = addLot(initial, parseLot(JSON.stringify(planningExample)));
  assert.deepEqual(analyze(d).actions, analyze(initial).actions);
  assert.equal(analyze(d).rows.filter((r) => r.code === "duplicate").length, 6);
  assert.equal(d.batches.length, 3);
  assert.equal(initial.batches.length, 2);
});
test("Règle limitée à la source ; le résultat validé change seulement lors du rejeu", () => {
  const first = replay(initial, time),
    d = setRule(first, "planning", "attente fournisseur", "waiting");
  assert.equal(isStale(first), false);
  assert.equal(isStale(d), true);
  assert.equal(analyze(d.lastRun.basis).actions.length, 2);
  assert.equal(analyze(d).actions.length, 3);
  const next = replay(d, "2026-09-17T12:01:00Z");
  const delta = changes(
    analyze(next.previousRun.basis).actions,
    analyze(next.lastRun.basis).actions,
  );
  assert.equal(delta.length, 1);
  assert.equal(delta[0].actionId, "A-12");
  assert.equal(delta[0].kind, "Ajoutée");
  const foreign = structuredClone(demandesExample);
  foreign.items[0].state = "attente fournisseur";
  assert.ok(
    analyze(addLot(d, parseLot(foreign))).rows.some(
      (r) =>
        r.event.source === "demandes" &&
        r.errors.some((e) => e.includes("non associé")),
    ),
  );
});
test("Collision mise en attente entière, décision explicite et invalidation après correction", () => {
  assert.equal(
    analyze(initial).actions.some((r) => r.actionId === "A-11"),
    false,
  );
  const d = resolveCollision(initial, "B0002:1"),
    a = analyze(d);
  assert.equal(a.actions.find((r) => r.actionId === "A-11").state, "doing");
  assert.equal(a.rows.find((r) => r.key === "B0002:2").code, "ignored");
  const edited = correctEvent(
    d,
    "B0002:1",
    { ...d.batches[1].rows[1], rawStatus: "open" },
    "Exemple de correction",
  );
  assert.equal(
    analyze(edited).actions.some((r) => r.actionId === "A-11"),
    false,
  );
  assert.equal(analyze(edited).collisions[0].decision, null);
});
test("Deux contenus pour la même révision ne sont pas arbitrés par l’ordre ni l’horodatage", () => {
  const extra = structuredClone(planningExample);
  extra.events = [
    {
      ...extra.events[1],
      id: "PL-X",
      status: "en cours",
      updatedAt: "2026-09-17T11:00:00Z",
    },
  ];
  const d = addLot(initial, parseLot(extra)),
    a = analyze(d);
  assert.equal(
    a.actions.some((r) => r.source === "planning" && r.actionId === "A-10"),
    false,
  );
  assert.equal(a.rows.filter((r) => r.code === "conflict").length, 2);
  assert.deepEqual(
    analyze({ ...d, batches: [...d.batches].reverse() }).actions,
    a.actions,
  );
});
test("Une version récente non résolue bloque une publication ancienne trompeuse", () => {
  const extra = structuredClone(planningExample);
  extra.events = [
    { ...extra.events[1], id: "PL-X", revision: 3, status: "inconnu" },
  ];
  const a = analyze(addLot(initial, parseLot(extra)));
  assert.equal(
    a.actions.some((r) => r.source === "planning" && r.actionId === "A-10"),
    false,
  );
  assert.equal(a.rows.find((r) => r.key === "B0001:1").code, "blocked");
});
test("Erreurs métier conservées pour correction ; structure invalide refusée", () => {
  for (const patch of [
    { id: "__proto__" },
    { id: "" },
    { action: "constructor" },
    { due: "2026-02-30" },
    { revision: "0" },
    { revision: "1.5" },
    { updatedAt: "2026-02-30T12:00:00Z" },
    { owner: "" },
  ]) {
    const lot = {
      ...planningExample,
      events: [{ ...planningExample.events[0], ...patch }],
    };
    const d = { ...initial, batches: [{ id: "B0001", ...parseLot(lot) }] };
    assert.equal(analyze(d).actions.length, 0);
    assert.ok(analyze(d).rows[0].errors.length);
  }
  assert.throws(
    () => parseLot({ format: "planning-v1", batch: "X", events: [] }),
    /1 à 200/,
  );
  assert.throws(
    () =>
      parseLot({
        ...planningExample,
        events: [{ ...planningExample.events[0], title: { bad: true } }],
      }),
    /valeur simple/,
  );
  assert.throws(() => parseLot({ format: "autre" }), /Formats/);
});
test("Dossier réimporté reproduit les décisions et le cache rejette une forme non canonique", () => {
  const d = replay(
    resolveCollision(
      setRule(initial, "planning", "attente fournisseur", "waiting"),
      "B0002:1",
    ),
    time,
  );
  assert.equal(validDossier(d), true);
  const copy = normalizeDossier(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(copy, d);
  assert.deepEqual(analyze(copy), analyze(d));
  const bad = structuredClone(d);
  bad.batches[0].rows[0].source = "demandes";
  assert.equal(validDossier(bad), false);
  const bad2 = structuredClone(d);
  bad2.batches[0].source = "__proto__";
  assert.throws(() => normalizeDossier(bad2), /source/);
  const noChange = replay(
    addLot(d, parseLot(planningExample)),
    "2026-09-17T12:03:00Z",
  );
  assert.deepEqual(
    changes(
      analyze(noChange.previousRun.basis).actions,
      analyze(noChange.lastRun.basis).actions,
    ),
    [],
  );
});

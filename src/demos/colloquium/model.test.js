import test from "node:test";
import assert from "node:assert/strict";
import {
  controls,
  seed,
  edit,
  decide,
  entries,
  finalExport,
  changeLog,
  parseList,
  importVersion,
  restore,
  setCapacity,
} from "./model.js";

function resolve() {
  let state = seed();
  state = decide(state, "G-03", {
    action: "apply",
    kind: "remplacement",
    note: "Responsable du groupe : Lou prend cette place.",
  });
  state = decide(state, "G-04", {
    action: "apply",
    kind: "correction",
    note: "Catégorie corrigée par le responsable.",
  });
  state = edit(state, "G-05", "email", "sophie.laurent@example.test");
  state = decide(state, "G-06", {
    action: "remove",
    kind: "retrait",
    note: "Place retirée de la nouvelle liste, confirmé.",
  });
  return state;
}
test("la clé de place rapproche les versions, jamais une adresse email", () => {
  const state = seed();
  assert.equal(entries(state).length, 6);
  assert.equal(controls(state).pending, 4);
  assert.equal(controls(state).emailConflicts, 1);
  assert.equal(
    entries(state).find((e) => e.id === "G-05").after.nom,
    "Sophie Laurent",
  );
  assert.throws(() => finalExport(state), /contrôle/);
});
test("aucun remplacement ni suppression sans décision motivée", () => {
  assert.throws(
    () =>
      decide(seed(), "G-03", { action: "apply", kind: "", note: "Confirmé" }),
    /Qualifiez/,
  );
  assert.throws(
    () =>
      decide(seed(), "G-03", {
        action: "apply",
        kind: "remplacement",
        note: "",
      }),
    /motif/,
  );
  assert.throws(
    () =>
      decide(seed(), "G-06", {
        action: "apply",
        kind: "retrait",
        note: "Test",
      }),
    /ne contient plus/,
  );
  const kept = decide(seed(), "G-06", {
    action: "keep",
    note: "Maintenir Nicolas.",
  });
  assert.equal(
    entries(kept).find((e) => e.id === "G-06").row.nom,
    "Nicolas Leroy",
  );
});
test("résolution complète et export de la version effectivement retenue", () => {
  const state = resolve();
  assert.equal(controls(state).problems.length, 0);
  const rows = finalExport(state);
  assert.equal(rows.length, 5);
  assert.equal(rows.find((row) => row.place === "G-03").nom, "Lou Martin");
  assert.equal(rows.find((row) => row.place === "G-04").categorie, "Médecin");
  assert.equal(
    changeLog(state).find((row) => row.place === "G-06").nouveau_nom,
    "",
  );
});
test("modifier la donnée invalide la décision sans perdre son ancienne trace", () => {
  let state = resolve();
  state = edit(state, "G-03", "email", "lou.nouveau@example.test");
  assert.equal(entries(state).find((e) => e.id === "G-03").stale, true);
  assert.throws(() => finalExport(state));
  assert.equal(
    state.reviews.find((r) => r.place === "G-03").note,
    "Responsable du groupe : Lou prend cette place.",
  );
});
test("capacité, emails répétés et données invalides bloquent le lot", () => {
  assert.throws(() => finalExport(setCapacity(resolve(), "4")), /contrôle/);
  assert.throws(() => setCapacity(seed(), ""));
  assert.throws(() => setCapacity(seed(), "2.5"));
  assert.throws(() => setCapacity(seed(), 0));
  let state = edit(resolve(), "G-05", "email", "THOMAS.BERNARD@example.test");
  state = decide(state, "G-05", {
    action: "apply",
    kind: "correction",
    note: "Choix fictif",
  });
  assert.equal(controls(state).emailConflicts, 1);
  assert.throws(() => finalExport(state));
  assert.throws(
    () =>
      decide(edit(resolve(), "G-03", "email", "invalide"), "G-03", {
        action: "apply",
        kind: "correction",
        note: "Test",
      }),
    /email/,
  );
});
test("import strict atomique et correction explicite de clé", () => {
  const previous = seed();
  const csv =
    "place;nom;email;categorie\nG-01;A;a@example.test;Interne\nG-01;B;b@example.test;Interne";
  assert.throws(
    () => importVersion(previous, "incoming", csv, "test.csv"),
    /répétée/,
  );
  assert.equal(previous.incoming.length, 5);
  assert.throws(() => parseList("nom;email\nA;a@ex.test"), /place/);
  const next = edit(seed(), "G-05", "place", "G-07");
  assert.equal(entries(next).length, 7);
  assert.equal(entries(next).find((e) => e.id === "G-07").before, null);
  assert.throws(() => edit(next, "G-07", "place", "G-01"), /unique/);
});
test("restaurer un dossier valide garde décisions et sorties ; schémas corrompus rejetés", () => {
  const state = resolve();
  assert.deepEqual(
    finalExport(restore(JSON.stringify(state))),
    finalExport(state),
  );
  assert.throws(() => restore("{}"), /compatible/);
  assert.throws(
    () => restore(JSON.stringify({ ...state, capacity: 0 })),
    /places/,
  );
  assert.throws(
    () =>
      restore(
        JSON.stringify({
          ...state,
          incoming: [state.incoming[0], state.incoming[0]],
        }),
      ),
    /invalide/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  validate,
  state,
  declare,
  revise,
  complete,
  manifest,
  parseInput,
  diffWords,
  manifestRows,
} from "./model.js";
const proof = {
  kind: "checked",
  locator: "Page fictive 12",
  reviewer: "Fabrication fictive",
  note: "Texte comparé à la version courante.",
};
test("une reprise devient ancienne après révision et conserve sa référence", () => {
  let d = declare(seed(), "F-01", "web", proof);
  assert.equal(state(d.corrections[0], "web").key, "checked");
  d = revise(d, "F-01", {
    after: "L’atelier ouvre le mardi à 11 h.",
    source: "Manuel fictif, chapitre 1",
    reason: "Horaire déplacé.",
  });
  const s = state(d.corrections[0], "web");
  assert.equal(s.key, "stale");
  assert.equal(s.proof.version, 1);
  assert.equal(s.proof.locator, proof.locator);
  assert.equal(complete(d.corrections[0]), false);
});
test("les exclusions motivées concernent une version, jamais les suivantes", () => {
  let d = declare(seed(), "F-01", "pdf", {
    ...proof,
    kind: "outside",
    note: "La fiche PDF ne contient pas cet horaire.",
  });
  assert.equal(state(d.corrections[0], "pdf").key, "outside");
  d = revise(d, "F-01", {
    after: "Un autre horaire fictif.",
    source: "Source fictive",
    reason: "Changement.",
  });
  assert.equal(state(d.corrections[0], "pdf").key, "stale");
  assert.throws(() => declare(d, "F-01", "pdf", { ...proof, note: "" }));
});
test("le manifeste exige chaque support et contient les textes courants", () => {
  let d = seed();
  assert.throws(() => manifest(d));
  for (const c of d.corrections)
    for (const s of ["paper", "web", "pdf"]) d = declare(d, c.id, s, proof);
  assert.equal(manifest(d).corrections.length, 6);
  assert.equal(manifestRows(d).length, 18);
  assert.equal(
    manifest(d).corrections[0].version.after,
    d.corrections[0].versions[0].after,
  );
});
test("JSON restaure les preuves et rejette un historique contradictoire", () => {
  let d = declare(seed(), "F-01", "web", proof);
  assert.deepEqual(parseInput(JSON.stringify(d, null, 2)), d);
  d.corrections[0].proofs[0].version = 2;
  assert.throws(() => validate(d));
});
test("CSV incomplet ou en doublon rejeté avant remplacement", () => {
  const raw =
    "id;titre;source;avant;apres;motif\nF-01;Titre;Source;Avant;Après;Motif";
  assert.equal(parseInput(raw).corrections.length, 1);
  assert.throws(() =>
    parseInput(raw + "\nF-01;Titre;Source;Avant;Après;Motif"),
  );
  assert.throws(() => parseInput("id;titre\nF-01;Titre"));
});
test("comparaison conserve exactement espaces, accents et modifications", () => {
  const a = "L’atelier ouvre à 9 h.",
    b = "L’atelier ouvre à 10 h.";
  const diff = diffWords(a, b);
  assert.equal(Object.values(diff.before).join(""), a);
  assert.equal(Object.values(diff.after).join(""), b);
  assert.equal(diff.before.changed, "9 ");
  assert.equal(diff.after.changed, "10 ");
});
test("une indentation seule reste visible dans la comparaison", () => {
  const before = "L’atelier ouvre le mardi à 10 h.",
    after = "  " + before;
  const diff = diffWords(before, after);
  assert.equal(Object.values(diff.before).join(""), before);
  assert.equal(Object.values(diff.after).join(""), after);
  assert.equal(diff.after.changed, "  ");
  assert.equal(diff.after.suffix, before);
  const removed = diffWords(after, before);
  assert.equal(removed.before.changed, "  ");
  assert.equal(Object.values(removed.before).join(""), after);
});
test("JSON rejette un support tableau au lieu de créer une déclaration inutilisable", () => {
  const d = declare(seed(), "F-01", "web", proof);
  d.corrections[0].proofs[0].support = ["web"];
  assert.throws(
    () => parseInput(JSON.stringify(d)),
    /Déclaration sans version ou support valide/,
  );
});
test("la mise à jour de déclaration remplace le support courant sans toucher les autres", () => {
  let d = declare(seed(), "F-01", "web", proof);
  d = declare(d, "F-01", "paper", proof);
  d = declare(d, "F-01", "web", { ...proof, locator: "Page fictive 13" });
  assert.equal(d.corrections[0].proofs.length, 2);
  assert.equal(state(d.corrections[0], "web").proof.locator, "Page fictive 13");
});
test("tout dossier accepté et échappé reste importable après export", () => {
  let d = seed();
  d.corrections[0].versions[0].after = '"\\\n'.repeat(1200);
  const encoded = JSON.stringify(validate(d), null, 2);
  assert.deepEqual(parseInput(encoded), d);
});

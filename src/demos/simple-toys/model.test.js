import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  summary,
  decide,
  linkCode,
  saveReceipt,
  preparation,
  exceptions,
  importData,
  restore,
  parseRegistry,
  parseReturns,
} from "./model.js";
const receipt = (s, id, patch = {}) => {
  const r = s.requests.find((x) => x.demande === id);
  return saveReceipt(s, id, {
    beneficiaire: r.beneficiaire,
    email: r.email,
    received: true,
    date: "2026-09-17",
    observed: r.modele_declare,
    condition: "Abîmé",
    direction: "Recyclage à examiner",
    note: "Constat fictif",
    ...patch,
  });
};
test("initial lot has six requests, one prepared, duplicate code cannot produce two entries", () => {
  const s = seed();
  assert.equal(summary(s).ready.length, 1);
  assert.equal(summary(s).cents, 200);
  assert.equal(exceptions(s).length, 5);
  assert.throws(() => decide(s, "R-03", "prepare", "vu"), /Même code/);
});
test("mapping keeps raw code and beneficiary independent from buyer", () => {
  let s = seed();
  assert.throws(() => linkCode(s, "R-01", "SP-VOIT-111", ""), /Expliquez/);
  s = linkCode(s, "R-01", "SP-VOIT-111", "Dernier chiffre relu sur le code");
  s = receipt(s, "R-01");
  s = decide(s, "R-01", "prepare", "Jouet reçu et code vérifié");
  const row = preparation(s).find((x) => x.demande === "R-01");
  assert.equal(row.beneficiaire, "Mila Rousseau");
  assert.equal(s.requests[0].code_recu, "SP-VOIT-11");
  assert.equal(row.code, "SP-VOIT-111");
  assert.equal(summary(s).cents, 400);
});
test("damaged toys remain eligible after physical receipt, never before", () => {
  let s = seed();
  assert.throws(() => decide(s, "R-02", "prepare", "vu"), /Réception/);
  s = receipt(s, "R-02");
  s = decide(s, "R-02", "prepare", "Abîmé mais reçu, tri à examiner");
  assert.equal(
    preparation(s).find((x) => x.demande === "R-02").consigne_euros,
    "2.00",
  );
});
test("duplicate requires reasoned exclusion and still checks retained receipt", () => {
  let s = seed();
  s = decide(s, "R-04", "exclude", "Deuxième demande pour le même jouet");
  assert.throws(() => decide(s, "R-03", "prepare", "vu"), /Réception/);
  s = receipt(s, "R-03");
  s = decide(s, "R-03", "prepare", "Un seul jouet réceptionné");
  assert.equal(preparation(s).filter((x) => x.code === "SP-BAT-303").length, 1);
  assert.equal(summary(s).excluded.length, 1);
});
test("changes invalidate approval; previous processed code and foreign toy blocked", () => {
  let s = seed();
  s = receipt(s, "R-05", { email: "autre@example.test" });
  assert.equal(summary(s).ready.length, 0);
  s = linkCode(s, "R-01", "SP-VOIT-505", "Code relu");
  s = receipt(s, "R-01");
  assert.throws(() => decide(s, "R-01", "prepare", "vu"), /déjà traitée/);
  s = receipt(s, "R-06");
  assert.throws(() => decide(s, "R-06", "prepare", "vu"), /Autre marque/);
});
test("CSV imports are atomic and reset reviews; bad dates and amounts refused", () => {
  const s = seed();
  assert.throws(
    () =>
      parseRegistry(
        "code;modele;acheteur;consigne_euros;deja_traitee\nSP-111;Voiture;A;;non",
      ),
    /Montant/,
  );
  assert.throws(
    () =>
      parseReturns(
        "demande;code_recu;modele_declare;beneficiaire;email\nR-01;SP-111;Voiture;A;a@example.test\nR-01;SP-222;Bateau;B;b@example.test",
      ),
    /répétée/,
  );
  assert.throws(() => receipt(s, "R-02", { date: "2026-02-30" }), /Date/);
  const next = importData(
    s,
    "requests",
    "demande;code_recu;modele_declare;beneficiaire;email\nR-20;SP-AN-404;Anneaux;Mia;mia@example.test",
    "lot.csv",
  );
  assert.equal(summary(next).ready.length, 0);
  assert.equal(s.requests.length, 6);
});
test("JSON roundtrip preserves current decisions, malformed state rejected", () => {
  const s = seed();
  assert.deepEqual(preparation(restore(JSON.stringify(s))), preparation(s));
  assert.throws(
    () =>
      restore(
        JSON.stringify({ ...s, registry: [{ ...s.registry[0], cents: -1 }] }),
      ),
    /Registre/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { csvText, readLocalFile } from "../../shared/files.js";
import {
  initialDossier,
  prepare,
  allocate,
  removeAllocation,
  correct,
  removeCorrection,
  replaceRegister,
  effective,
  parseRegister,
  normalizeDossier,
  validDossier,
  cents,
  suggestions,
  headers,
  allocationRows,
  remainderRows,
  exceptionRows,
  manifest,
  dossierMaxBytes,
} from "./model.js";
const at = "2026-09-17T02:00:00.000Z";
test("Le dossier maximal échappé se restaure avec la borne réservée au JSON", async () => {
  const full = (n) => "\u0001".repeat(n);
  const id = (i) => String(i).padStart(4, "0") + full(76);
  const mkRow = (i) => ({
    id: id(i),
    client_id: full(80),
    client: full(120),
    reference: full(80),
    devise: full(12),
    montant: full(40),
  });
  const d = initialDossier();
  for (const kind of ["payments", "invoices"]) {
    d[kind] = {
      name: full(180),
      rows: Array.from({ length: 500 }, (_, i) => mkRow(i)),
    };
    d.corrections.push(
      ...d[kind].rows.map((r) => ({
        kind,
        id: r.id,
        values: Object.fromEntries(headers.slice(1).map((k) => [k, r[k]])),
        reason: full(500),
      })),
    );
  }
  d.allocations = Array.from({ length: 1000 }, (_, i) => ({
    id: id(i),
    payment: id(i % 500),
    invoice: id(i % 500),
    amount: "9999999.99",
    reason: full(500),
    proof: { payment: mkRow(i % 500), invoice: mkRow(i % 500) },
  }));
  d.journal = Array.from({ length: 2000 }, () => ({ at, action: full(1200) }));
  const canonical = normalizeDossier(d);
  const blob = new Blob([JSON.stringify(canonical, null, 2)]);
  assert.ok(blob.size > 5 * 1024 * 1024);
  assert.ok(blob.size < dossierMaxBytes);
  await assert.rejects(readLocalFile(blob), /limite/);
  const restored = normalizeDossier(
    JSON.parse(await readLocalFile(blob, { maxBytes: dossierMaxBytes })),
  );
  assert.deepEqual(restored, canonical);
  assert.equal(validDossier(restored), true);
});
test("Deux factures partagent un paiement sans perte de centime, reliquats séparés", () => {
  let d = initialDossier();
  assert.equal(prepare(d).remaining.length, 6);
  assert.equal(d.journal.length, 0);
  d = allocate(d, "PAY-01", "FAC-101", "700", "Première facture confirmée", at);
  d = allocate(
    d,
    "PAY-01",
    "FAC-102",
    "500.00",
    "Solde affecté partiellement",
    at,
  );
  const p = prepare(d);
  assert.equal(p.accepted.length, 2);
  assert.equal(p.payments[0].remaining, 0);
  assert.equal(p.invoices[0].remaining, 0);
  assert.equal(p.invoices[1].remaining, 15000);
  assert.equal(p.remaining.length, 4);
  assert.equal(p.exceptions.length, 0);
  assert.equal(
    p.accepted.reduce((s, a) => s + a.cents, 0),
    120000,
  );
});
test("Motif, montant vide, précision, client et devise ne passent jamais implicitement", () => {
  const d = initialDossier();
  assert.equal(cents(""), null);
  assert.equal(cents("0"), 0);
  assert.equal(cents("0,01"), 1);
  assert.equal(cents("1.001"), null);
  assert.equal(cents("1e3"), null);
  assert.equal(cents("-1"), null);
  for (const amount of ["", "0", "-1", "700.01", "800"])
    assert.throws(() => allocate(d, "PAY-01", "FAC-101", amount, "test", at));
  assert.throws(
    () => allocate(d, "PAY-01", "FAC-101", "100", "", at),
    /motif/i,
  );
  assert.throws(
    () => allocate(d, "PAY-01", "FAC-201", "100", "test", at),
    /autre client/i,
  );
  assert.throws(
    () => allocate(d, "PAY-03", "FAC-102", "100", "test", at),
    /autre devise/i,
  );
  assert.equal(d.allocations.length, 0);
});
test("Corrections gardent original et rendent affectation périmée, puis retrait explicite", () => {
  let d = allocate(
    initialDossier(),
    "PAY-01",
    "FAC-101",
    "700",
    "Confirmation initiale",
    at,
  );
  d = correct(
    d,
    "payments",
    "PAY-01",
    { ...d.payments.rows[0], montant: "1100.00" },
    "Montant corrigé",
    at,
  );
  assert.equal(d.payments.rows[0].montant, "1200.00");
  assert.equal(prepare(d).accepted.length, 0);
  assert.match(prepare(d).exceptions[0].detail, /périmée/);
  assert.equal(prepare(d).payments[0].remaining, 110000);
  d = removeAllocation(d, "AFF-001", at);
  d = allocate(d, "PAY-01", "FAC-101", "700", "Nouvelle confirmation", at);
  assert.equal(prepare(d).accepted.length, 1);
  d = removeCorrection(d, "payments", "PAY-01", at);
  assert.equal(prepare(d).accepted.length, 0);
  assert.equal(prepare(d).payments[0].remaining, 120000);
});
test("Réimport identique préserve corrections, autre source les retire mais garde décisions auditables", () => {
  let d = allocate(
    initialDossier(),
    "PAY-01",
    "FAC-101",
    "500",
    "Confirmer",
    at,
  );
  d = correct(
    d,
    "invoices",
    "FAC-102",
    { ...d.invoices.rows[1], client: "Nouveau libellé" },
    "Libellé corrigé",
    at,
  );
  d = replaceRegister(
    d,
    "invoices",
    structuredClone(d.invoices.rows),
    "même.csv",
    at,
  );
  assert.equal(d.corrections.length, 1);
  assert.equal(prepare(d).accepted.length, 1);
  const changed = d.payments.rows.map((r) => ({
    ...r,
    montant: r.id === "PAY-01" ? "900" : r.montant,
  }));
  d = replaceRegister(d, "payments", changed, "nouveau.csv", at);
  assert.equal(d.corrections.length, 1);
  assert.equal(d.allocations.length, 1);
  assert.equal(prepare(d).accepted.length, 0);
  assert.match(prepare(d).exceptions[0].detail, /périmée/);
  d = replaceRegister(
    d,
    "payments",
    changed.filter((r) => r.id !== "PAY-01"),
    "sans.csv",
    at,
  );
  assert.match(prepare(d).exceptions[0].detail, /absente/);
});
test("Toute sur-affectation importée écarte le groupe, pas une sélection arbitraire des premières lignes", () => {
  let d = allocate(initialDossier(), "PAY-01", "FAC-101", "600", "A", at);
  d = allocate(d, "PAY-01", "FAC-102", "600", "B", at);
  d.allocations[0].amount = "700";
  assert.equal(prepare(d).accepted.length, 0);
  assert.equal(prepare(d).exceptions.length, 2);
  assert.equal(prepare(d).payments[0].remaining, 120000);
  d = allocate(initialDossier(), "PAY-01", "FAC-101", "600", "A", at);
  d.allocations.push({
    ...structuredClone(d.allocations[0]),
    id: "AFF-X",
    amount: "200",
  });
  assert.equal(prepare(d).accepted.length, 0);
  assert.equal(prepare(d).exceptions.length, 2);
});
test("Sources invalides restent corrigeables, montant manquant distinct de zéro et suggestions contrôlées", () => {
  let d = initialDossier();
  assert.deepEqual(
    suggestions(d, "PAY-01").map((x) => x.id),
    ["FAC-101"],
  );
  assert.equal(suggestions(d, "PAY-03").length, 0);
  d = correct(
    d,
    "invoices",
    "FAC-101",
    { ...d.invoices.rows[0], montant: "" },
    "Vérifier le montant absent",
    at,
  );
  let p = prepare(d);
  assert.equal(p.invoices[0].remaining, null);
  assert.equal(p.exceptions.length, 1);
  assert.equal(suggestions(d, "PAY-01").length, 0);
  assert.throws(() => allocate(d, "PAY-01", "FAC-101", "1", "test", at));
  d = correct(
    d,
    "invoices",
    "FAC-101",
    { ...d.invoices.rows[0], montant: "0" },
    "Zéro confirmé explicitement",
    at,
  );
  p = prepare(d);
  assert.equal(p.invoices[0].remaining, 0);
  assert.equal(p.exceptions.length, 0);
  assert.throws(() => allocate(d, "PAY-01", "FAC-101", "1", "test", at));
});
test("Homonymes clients ne sont pas identité et montants égaux ne sont jamais affectés automatiquement", () => {
  const d = initialDossier();
  d.invoices.rows[2].client = d.payments.rows[0].client;
  assert.throws(
    () => allocate(d, "PAY-01", "FAC-201", "300", "test", at),
    /autre client/,
  );
  d.payments.rows[0].reference = "";
  assert.equal(suggestions(d, "PAY-01").length, 0);
  assert.equal(prepare(d).accepted.length, 0);
});
test("CSV et dossier stricts, borne, cache canonique et valeurs longues échappées", () => {
  const d = initialDossier();
  assert.throws(() =>
    parseRegister("id;client_id;client;reference;devise;montant"),
  );
  assert.throws(() =>
    parseRegister(csvText(headers, [d.payments.rows[0], d.payments.rows[0]])),
  );
  assert.throws(() =>
    parseRegister(
      csvText(headers, [{ ...d.payments.rows[0], id: "__proto__" }]),
    ),
  );
  assert.throws(() =>
    parseRegister(
      csvText(
        [...headers, "montant"],
        [[...Object.values(d.payments.rows[0]), "1"]],
      ),
    ),
  );
  const weird = '"\\'.repeat(40);
  d.payments.rows[0].id = weird;
  d.payments.rows[0].reference = '"'.repeat(80);
  d.invoices.rows[0].client = "\\".repeat(120);
  let next = allocate(d, weird, "FAC-101", "0.01", "Guillemets conservés", at);
  next = normalizeDossier(JSON.parse(JSON.stringify(next)));
  assert.equal(validDossier(next), true);
  assert.equal(prepare(next).accepted.length, 1);
  const tampered = structuredClone(next);
  tampered.corrections = [
    {
      kind: "payments",
      id: weird,
      values: { ...d.payments.rows[0], id: "OTHER" },
      reason: "Test",
    },
  ];
  assert.equal(validDossier(tampered), false);
  assert.equal(normalizeDossier(tampered).corrections[0].values.id, undefined);
  assert.equal(effective(normalizeDossier(tampered), "payments")[0].id, weird);
});
test("Exports représentent exactement les affectations admissibles et la provenance restaurable", () => {
  let d = allocate(
    initialDossier(),
    "PAY-01",
    "FAC-101",
    "700",
    "Confirmation",
    at,
  );
  d = allocate(d, "PAY-01", "FAC-102", "500", "Répartition", at);
  assert.deepEqual(
    allocationRows(d).map((r) => r[5]),
    ["700.00", "500.00"],
  );
  assert.equal(remainderRows(d).find((r) => r[1] === "FAC-102")[7], "150.00");
  assert.equal(exceptionRows(d).length, 0);
  assert.deepEqual(normalizeDossier(JSON.parse(JSON.stringify(d))), d);
  const m = manifest(d);
  assert.equal(m.prepared.length, 2);
  assert.equal(m.sources.payments.rows[0].montant, "1200.00");
  assert.equal(m.allocations[0].proof.invoice.montant, "700.00");
  assert.equal(m.journal.length, 2);
});

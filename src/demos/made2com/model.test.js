import test from "node:test";
import assert from "node:assert/strict";
import { csvText } from "../../shared/files.js";
import {
  initial,
  simulate,
  normalizeDossier,
  normalizeEvents,
  normalizeRules,
  validDossier,
  parseContacts,
  parseEvents,
  contactHeaders,
  eventHeaders,
  timestamp,
  decisionRows,
  change,
} from "./model.js";
const result = (d, id = "C01") =>
  simulate(d).decisions.find((r) => r.id === id);
test("Six branches expliquées et achat associé au bon panier, sans mutation", () => {
  assert.deepEqual(
    simulate(initial).decisions.map((r) => r.outcome),
    ["eligible", "converted", "pressure", "waiting", "consent", "error"],
  );
  const d = structuredClone(initial);
  d.events.push({
    id: "NOUV",
    contact_id: "C02",
    kind: "cart",
    at: "2026-12-18T09:00:00Z",
    cart_id: "NEW",
  });
  d.rules.delayHours = 0;
  assert.equal(result(d, "C02").outcome, "eligible");
  assert.equal(result(initial, "C02").outcome, "converted");
});
test("Bascule après la limite uniquement, délai inclusif et borne de pression exclusive", () => {
  const d = structuredClone(initial);
  d.at = "2026-12-20T18:00:00Z";
  assert.equal(result(d).outcome, "eligible");
  d.at = "2026-12-20T18:01:00Z";
  assert.equal(result(d).outcome, "gift");
  d.at = "2026-12-18T16:00:00Z";
  assert.equal(result(d, "C04").outcome, "eligible");
  d.at = "2026-12-20T10:00:00Z";
  assert.equal(result(d, "C03").messages, 1);
  assert.equal(result(d, "C03").outcome, "gift");
});
test("Le retrait prime à heure égale et les événements futurs ne changent pas le passé", () => {
  const d = structuredClone(initial);
  d.events.push(
    { id: "W", contact_id: "C01", kind: "withdraw", at: d.at, cart_id: "" },
    { id: "G", contact_id: "C01", kind: "grant", at: d.at, cart_id: "" },
  );
  assert.equal(result(d).outcome, "consent");
  const future = structuredClone(initial);
  future.events.push({
    id: "FUTURE",
    contact_id: "C01",
    kind: "cart",
    at: "2026-12-24T12:00:00Z",
    cart_id: "PAN01",
  });
  assert.equal(result(future).outcome, "eligible");
  future.at = "2026-12-24T12:00:00Z";
  assert.equal(result(future).outcome, "error");
  const past = { ...initial, at: "2026-12-17T12:00:00Z" };
  assert.equal(result(past, "C02").outcome, "eligible");
});
test("Commande orpheline et contact absent sont explicites, les décisions ne deviennent pas des envois", () => {
  const d = structuredClone(initial);
  d.events.push(
    {
      id: "BAD",
      contact_id: "C01",
      kind: "order",
      at: "2026-12-18T08:00:00Z",
      cart_id: "ABSENT",
    },
    {
      id: "UNKNOWN",
      contact_id: "ABSENT",
      kind: "message",
      at: d.at,
      cart_id: "",
    },
  );
  assert.equal(result(d).outcome, "error");
  assert.equal(simulate(d).issues.length, 2);
  assert.equal(decisionRows(d).length, 6);
  assert.match(decisionRows(d)[0][3], /corriger/);
});
test("CSV aller retour, dates impossibles, identifiants répétés et champs limités", () => {
  assert.deepEqual(
    parseContacts(csvText(contactHeaders, initial.contacts)),
    initial.contacts,
  );
  assert.deepEqual(
    parseEvents(csvText(eventHeaders, initial.events)),
    initial.events,
  );
  for (const value of [
    "2026-02-30T12:00:00Z",
    "2026-12-01T25:00:00Z",
    "2026-12-01T12:00:00+02:00",
    "2026-12-01",
  ])
    assert.throws(() => timestamp(value), /UTC/);
  assert.throws(
    () => normalizeEvents([initial.events[0], initial.events[0]]),
    /répété/,
  );
  assert.throws(
    () => normalizeEvents([{ ...initial.events[0], kind: "unknown" }]),
    /Type/,
  );
  assert.throws(
    () =>
      parseContacts("id;name;zone;consent\nA;" + "x".repeat(81) + ";FR;yes"),
    /80/,
  );
});
test("Dossier restaurable canonique, règles bornées et références protégées", () => {
  assert.equal(validDossier(initial), true);
  assert.deepEqual(
    normalizeDossier(JSON.parse(JSON.stringify(initial))),
    initial,
  );
  assert.equal(validDossier({ ...initial, extra: true }), false);
  assert.equal(validDossier({ ...initial, at: "date" }), false);
  for (const maxMessages of ["", 0, 1.5, 21, Infinity])
    assert.throws(
      () => normalizeRules({ ...initial.rules, maxMessages }),
      /entier/,
    );
  const d = change(
    initial,
    { rules: { ...initial.rules, maxMessages: 3 } },
    "Plafond ajusté",
  );
  assert.equal(result(d, "C03").outcome, "eligible");
  assert.equal(
    simulate(d, d.reference.rules, d.reference.at).decisions[2].outcome,
    "pressure",
  );
  assert.equal(initial.rules.maxMessages, 2);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  amount,
  seed,
  expected,
  normalize,
  editEvent,
  importActual,
  run,
  compare,
  isCurrent,
  expectedRows,
  comparedRows,
  restore,
  sampleResults,
  HEADERS,
  MAX_BYTES,
  report,
} from "./model.js";
import { csvText } from "../../shared/files.js";

test("partial deliveries conserve stock by article, lot and unit", () => {
  const d = seed(),
    r = expected(d);
  assert.equal(r.valid, true);
  assert.deepEqual(r.totals.get("T-101"), {
    sent: 50000,
    received: 35000,
    transit: 15000,
  });
  assert.deepEqual(r.totals.get("T-103"), {
    sent: 200000,
    received: 200000,
    transit: 0,
  });
  const a = r.rows.filter((r) => r.article === "Mélange A");
  assert.equal(
    a.reduce((n, r) => n + r.value, 0),
    130000,
  );
  assert.equal(a.find((r) => r.site === "Site B").value, 45000);
});
test("decimal arithmetic is exact, no empty or fractional indivisible units", () => {
  assert.equal(amount("0,125", "kg"), 125);
  assert.equal(amount("1.001", "kg"), 1001);
  for (const s of ["", "-1", "1e3", "01", "0.0001", "1000001"])
    assert.throws(() => amount(s, "kg"));
  assert.throws(() => amount("1.5", "u"));
});
test("over reception, pre-departure and insufficient source block all expected outputs", () => {
  for (const changes of [
    { date: "2026-09-16", quantite: "51" },
    { date: "2026-09-14", quantite: "35" },
  ]) {
    const d = editEvent(seed(), "T-101", "R1", changes, "Cas de recette");
    assert.equal(expected(d).valid, false);
    assert.deepEqual(expected(d).rows, []);
    assert.throws(() => expectedRows(d));
  }
  const d = editEvent(
    seed(),
    "T-101",
    "D1",
    { date: "2026-09-15", quantite: "121" },
    "Cas de recette",
  );
  assert.equal(expected(d).valid, false);
});
test("calendar, schema, identities, units and opening date validated", () => {
  assert.throws(() =>
    editEvent(
      seed(),
      "T-101",
      "R1",
      { date: "2026-02-29", quantite: "40" },
      "date",
    ),
  );
  for (const mutate of [
    (d) => d.scenario.stocks.push(d.scenario.stocks[0]),
    (d) => (d.scenario.transfers[0].to = "Site inconnu"),
    (d) =>
      d.scenario.transfers[0].events.push(d.scenario.transfers[0].events[0]),
    (d) => (d.scenario.transfers[0].unite = "t"),
    (d) => (d.extra = true),
  ]) {
    const d = seed();
    mutate(d);
    assert.throws(() => normalize(d));
  }
  const d = editEvent(
    seed(),
    "T-101",
    "D1",
    { date: "2026-09-13", quantite: "50" },
    "date",
  );
  assert.equal(expected(d).valid, false);
});
test("missing, extra, empty, duplicated and zero are different states", () => {
  const rows = expectedRows(seed());
  rows[0].quantite = "";
  rows[1].quantite = "0";
  rows.push({ ...rows[2] });
  rows.splice(4, 1);
  rows.push({ ...rows[0], lot: "autre", quantite: "0" });
  const d = run(importActual(seed(), csvText(HEADERS, rows), "cas.csv")),
    statuses = compare(d).map((r) => r.status);
  for (const status of [
    "Valeur absente",
    "Écart",
    "Doublon",
    "Ligne absente",
    "Clé supplémentaire",
    "Identique",
  ])
    assert.ok(statuses.includes(status));
  assert.equal(
    comparedRows(d).find((r) => r.at(-1) === "Valeur absente")[7],
    "",
  );
});
test("comparison is explicit and invalidated by edits; identical import is idempotent", () => {
  const csv = csvText(HEADERS, sampleResults());
  let d = importActual(seed(), csv, "resultats.csv");
  assert.equal(isCurrent(d), false);
  assert.throws(() => comparedRows(d));
  d = run(d);
  assert.equal(isCurrent(d), true);
  assert.equal(compare(d).filter((r) => r.status !== "Identique").length, 2);
  assert.equal(importActual(d, csv, "resultats.csv"), d);
  const edited = editEvent(
    d,
    "T-101",
    "R1",
    { date: "2026-09-16", quantite: "40" },
    "Nouvelle réception",
  );
  assert.equal(isCurrent(edited), false);
  assert.equal(expected(edited).totals.get("T-101").transit, 10000);
  assert.equal(isCurrent(run(edited)), true);
});
test("invalid CSV is atomic and formula strings are rejected as quantities", () => {
  const d = seed(),
    before = JSON.stringify(d);
  for (const raw of [
    "site;quantite\nA;5",
    csvText(HEADERS, [{ ...sampleResults()[0], quantite: "=2+2" }]),
    csvText(HEADERS, [{ ...sampleResults()[0], site: "", transfert: "T-101" }]),
  ])
    assert.throws(() => importActual(d, raw, "bad.csv"));
  assert.equal(JSON.stringify(d), before);
});
test("roundtrip preserves trace, actual source and comparison including escaped text", () => {
  let d = seed();
  d.scenario.title = '<script> & "Essai"';
  d = run(importActual(d, csvText(HEADERS, sampleResults()), "essai.csv"));
  const next = restore(JSON.stringify(d, null, 2));
  assert.deepEqual(next, d);
  assert.equal(isCurrent(next), true);
  assert.ok(report(next).sections.some((s) => s.title === "Comparaison"));
  assert.throws(() =>
    restore(JSON.stringify({ ...d, comparison: { fingerprint: "fake" } })),
  );
});
test("maximal canonical dossier remains restorable inside the declared budget", () => {
  const d = seed(),
    escape = "\u0000".repeat(70);
  d.scenario.transfers = Array.from({ length: 50 }, (_, i) => ({
    ...d.scenario.transfers[0],
    id: `${i}${escape}`,
    events: Array.from({ length: 100 }, (_, j) => ({
      id: `${j}${escape}`,
      kind: "depart",
      date: "2026-09-15",
      quantite: "1",
    })),
  }));
  d.actual = {
    filename: "max.csv",
    rows: Array.from({ length: 1000 }, (_, i) => ({
      type: "site",
      site: `${i}${escape}`,
      transfert: "",
      article: escape,
      lot: escape,
      unite: "kg",
      quantite: "0",
    })),
  };
  d.journal = Array.from({ length: 100 }, () => "\u0000".repeat(700));
  const normalized = normalize(d),
    raw = JSON.stringify(normalized, null, 2);
  assert.ok(Buffer.byteLength(raw) < MAX_BYTES);
  assert.deepEqual(restore(raw), normalized);
});

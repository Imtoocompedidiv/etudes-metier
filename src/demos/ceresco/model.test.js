import test from "node:test";
import assert from "node:assert/strict";
import { csvText, reportHtml } from "../../shared/files.js";
import {
  seed,
  calculate,
  summarize,
  editScenario,
  markReview,
  isReviewed,
  saveBase,
  restore,
  parseDemand,
  importDemand,
  HEADERS,
  resultRows,
  report,
  fingerprint,
} from "./model.js";
const changed = (d) =>
  editScenario(d, d.variant.params, {
    ...d.variant.months[8],
    days: "8",
    daysSource: "Huit jours retenus pour le scénario fictif.",
  });
test("monthly overload remains visible despite ample annual capacity, with exact units and formula", () => {
  const d = changed(seed()),
    v = calculate(d.variant)[8];
  assert.equal(v.demandKg, 2400);
  assert.equal(v.capturedKg, 1200);
  assert.equal(v.rawKg, 1500);
  assert.equal(v.capacityKg, 1200);
  assert.equal(v.excessKg, 300);
  assert.equal(v.daysRequired, 10);
  const t = summarize(d.variant);
  assert.ok(t.rawKg < t.capacityKg);
  assert.equal(t.overloadMonths, 1);
  assert.equal(t.knownMonths, 12);
  assert.equal(calculate(d.base)[8].capacityKg, 3000);
});
test("tonnes and kilograms agree; blank is unknown while zero remains a valid zero", () => {
  let d = seed();
  d = editScenario(d, d.variant.params, {
    ...d.variant.months[8],
    demand: "2.4",
    unit: "t",
  });
  assert.equal(calculate(d.variant)[8].rawKg, 1500);
  d = editScenario(d, d.variant.params, { ...d.variant.months[8], demand: "" });
  assert.equal(calculate(d.variant)[8].rawKg, null);
  assert.equal(summarize(d.variant).knownMonths, 11);
  assert.equal(resultRows(d)[8][4], "");
  d = editScenario(d, d.variant.params, {
    ...d.variant.months[8],
    demand: "0",
    days: "0",
  });
  assert.equal(calculate(d.variant)[8].rawKg, 0);
  assert.equal(calculate(d.variant)[8].excessKg, 0);
  d = editScenario(
    d,
    { ...d.variant.params, capacity: "0" },
    d.variant.months[8],
  );
  assert.equal(calculate(d.variant)[8].daysRequired, 0);
});
test("calendar and numeric input reject invalid values and structured coercions", () => {
  const d = seed();
  for (const days of ["29", "-1", "2.5", [], null])
    assert.throws(() =>
      editScenario(d, d.variant.params, { ...d.variant.months[1], days }),
    );
  for (const yieldValue of ["0", "101", "1e2", "NaN", 80, []])
    assert.throws(() =>
      editScenario(
        d,
        { ...d.variant.params, yield: yieldValue },
        d.variant.months[0],
      ),
    );
  assert.throws(() =>
    editScenario(d, d.variant.params, { ...d.variant.months[0], unit: ["kg"] }),
  );
  assert.throws(() =>
    editScenario(d, d.variant.params, {
      ...d.variant.months[0],
      month: "2026-13",
    }),
  );
});
test("review binds source notes and values, base is preserved and explicit replacement clones it", () => {
  const reviewed = markReview(
    changed(seed()),
    "Scénario saturé relu, sans décision de faisabilité.",
  );
  assert.ok(isReviewed(reviewed.variant));
  const n = editScenario(
    reviewed,
    { ...reviewed.variant.params, capacitySource: "Autre source déclarée." },
    reviewed.variant.months[8],
  );
  assert.equal(isReviewed(n.variant), false);
  assert.deepEqual(n.base, reviewed.base);
  const copied = saveBase(n);
  assert.notEqual(copied.base, n.variant);
  assert.deepEqual(copied.base.months, n.variant.months);
  copied.variant.months[8].days = "9";
  assert.equal(copied.base.months[8].days, "8");
});
test("missing source blocks review even if arithmetic is calculable; missing yield prevents false totals", () => {
  let d = seed();
  d.variant.params.yieldSource = "";
  assert.equal(calculate(d.variant)[0].rawKg, 1000);
  assert.throws(() => markReview(d, "Revue"), /sources/);
  d.variant.params.yield = "";
  assert.equal(summarize(d.variant).knownMonths, 0);
  assert.equal(summarize(d.variant).rawKg, null);
  assert.equal(summarize(d.variant).capacityKg, null);
  assert.ok(calculate(d.variant).every((r) => r.rawKg === null));
  assert.equal(calculate(d.variant)[0].capacityKg, 3000);
});
test("CSV requires exactly the twelve distinct months, import affects variant demand only and replay preserves review", () => {
  const d = markReview(seed(), "Relecture complète.");
  const csv = csvText(
    HEADERS,
    d.variant.months.map((m) => [m.month, m.demand, m.unit, m.demandSource]),
  );
  assert.deepEqual(importDemand(d, parseDemand(csv)), d);
  assert.throws(
    () => parseDemand(csv.replace("2026-02", "2026-01")),
    /plusieurs/,
  );
  assert.throws(() => parseDemand("mois;mois\n2026-01;2026-01"));
  const rows = parseDemand(csv);
  rows[8].demand = "5000";
  const n = importDemand(d, rows);
  assert.deepEqual(n.base, d.base);
  assert.equal(n.variant.months[8].days, "20");
  assert.equal(isReviewed(n.variant), false);
  assert.equal(calculate(n.variant)[8].excessKg, 125);
});
test("JSON is canonical and malformed or forged reviews do not become current", () => {
  const d = markReview(changed(seed()), "Revue courante.");
  assert.deepEqual(restore(JSON.stringify(d)), d);
  assert.equal(fingerprint(d.variant).length, 64);
  const forged = structuredClone(d);
  forged.variant.months[0].demand = "99";
  assert.equal(isReviewed(restore(forged).variant), false);
  const broken = structuredClone(d);
  broken.variant.review.fingerprint = [];
  assert.throws(() => restore(broken));
  const bad = structuredClone(d);
  bad.variant.months[1] = bad.variant.months[0];
  assert.throws(() => restore(bad));
});
test("exports carry current inputs, unknowns, source notes and escaped text", () => {
  const d = changed(seed());
  d.variant.params.capacitySource = "<img src=x onerror=alert(1)>";
  const html = reportHtml(report(d));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img"));
  assert.match(html, /Huit jours/);
  assert.equal(resultRows(d)[8][7], 300);
  assert.equal(resultRows(d)[8].at(-1), "À relire");
});

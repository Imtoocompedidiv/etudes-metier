import test from "node:test";
import assert from "node:assert/strict";
import { csvText, reportHtml } from "../../shared/files.js";
import {
  COMPONENTS,
  CSV_HEADERS,
  analyze,
  count,
  explain,
  importCounts,
  report,
  requestRows,
  restore,
  review,
  seed,
  setCount,
  setDigital,
  setEdition,
  setKit,
} from "./model.js";
const copy = () => structuredClone(seed);
function prepared() {
  let s = setKit(copy(), "GC-104", "pack");
  s = setCount(s, "GC-104", "collecteurs", 10);
  s = explain(
    s,
    "GC-104",
    "plateaux",
    "Une pièce appartient à une autre boîte fictive.",
  );
  return setEdition(s, "GC-104", true);
}
function reviewed() {
  return review(prepared(), "GC-104", "SAV fictif", true);
}
test("unknown count is distinct from zero and malformed numeric values are rejected", () => {
  for (const v of ["", "  ", null]) assert.equal(count(v), null);
  assert.equal(count(0), 0);
  assert.equal(count("90"), 90);
  for (const v of [
    [],
    [12],
    {},
    true,
    false,
    undefined,
    -1,
    1.5,
    "1e2",
    "1.0",
    "12x",
    1001,
  ])
    assert.throws(() => count(v));
});
test("kit switch preserves all counts, separates digital content and requires concordance", () => {
  const s = setKit(copy(), "GC-104", "pack");
  const a = analyze(s.cases[0]);
  assert.deepEqual(s.cases[0].counts, seed.cases[0].counts);
  assert.equal(a.rows.find((r) => r.id === "cartes").want, 15);
  assert.equal(a.rows.find((r) => r.id === "collecteurs").got, null);
  assert.equal(a.digitalApplicable, true);
  assert.equal(a.digitalQuestions.length, 3);
  const x = setKit(s, "GC-104", "unknown");
  assert.equal(analyze(x.cases[0]).rows[0].want, null);
  assert.throws(() => setEdition(x, "GC-104", true));
});
test("no offset across families; surplus and outside-kit content require a saved explanation", () => {
  assert.ok(
    analyze(seed.cases[0]).blockers.some((s) => s.includes("hors kit")),
  );
  let s = setKit(copy(), "GC-104", "pack");
  assert.deepEqual(
    analyze(s.cases[0]).rows.map((r) => r.missing),
    [0, 2, 0, 0, 2],
  );
  assert.throws(() => explain(s, "GC-104", "plateaux", "oui"));
  assert.throws(() => review(s, "GC-104", "SAV", true));
  s = prepared();
  assert.deepEqual(analyze(s.cases[0]).blockers, []);
  assert.throws(() => review(s, "GC-104", "SAV", false));
});
test("review and issue explanation invalidate on relevant changes, with independent dossiers preserved", () => {
  const s = reviewed();
  assert.equal(analyze(s.cases[0]).reviewed, true);
  const changed = setCount(s, "GC-104", "plateaux", 14);
  assert.equal(changed.cases[0].review, null);
  assert.equal(changed.cases[0].explanations.plateaux, undefined);
  assert.equal(setDigital(s, "GC-104", 0, "accessible").cases[0].review, null);
  assert.equal(setKit(s, "GC-104", "base").cases[0].editionConfirmed, false);
  assert.deepEqual(changed.cases[1], s.cases[1]);
  assert.equal(analyze(s.cases[0]).reviewed, true);
});
test("CSV upserts only provided components and refuses conflicting or malformed batches atomically", () => {
  const s = reviewed();
  const row = [
    "GC-104",
    s.cases[0].place,
    s.cases[0].order,
    "pack",
    s.cases[0].note,
    "jetons",
    90,
  ];
  const result = importCounts(s, csvText(CSV_HEADERS, [row]));
  assert.equal(result.cases[0].counts.jetons, 90);
  assert.equal(result.cases[0].counts.cartes, 13);
  assert.equal(result.cases[0].review, null);
  assert.throws(() => importCounts(s, csvText(CSV_HEADERS, [row, row])));
  assert.throws(() =>
    importCounts(
      s,
      csvText(CSV_HEADERS, [row, [...row.slice(0, 5), "cartes", "-2"]]),
    ),
  );
  const conflict = [...row];
  conflict[3] = "base";
  conflict[5] = "cartes";
  assert.throws(() => importCounts(s, csvText(CSV_HEADERS, [row, conflict])));
  assert.equal(s.cases[0].counts.jetons, 88);
});
test("JSON round-trips compact review records and rejects tampering or extra component keys", () => {
  const s = reviewed();
  assert.deepEqual(restore(JSON.stringify(s)), s);
  assert.equal(s.cases[0].review.basis.length, 64);
  const bad = structuredClone(s);
  bad.cases[0].counts.jetons = 87;
  assert.throws(() => restore(bad));
  const x = structuredClone(s);
  x.cases[0].explanations.plateaux.basis = "f".repeat(64);
  assert.throws(() => restore(x));
  const y = structuredClone(s);
  y.cases[0].counts.unknown = 4;
  assert.throws(() => restore(y));
  const z = structuredClone(s);
  z.cases[0].counts.jetons = [];
  assert.throws(() => restore(z));
});
test("exports use selected current state, missing counts do not become claims, HTML escapes notes", () => {
  assert.throws(() => requestRows(seed.cases[0]));
  const d = reviewed().cases[0],
    rows = requestRows(d);
  assert.deepEqual(
    rows.map((r) => [r[4], r[7]]),
    [
      ["Jetons", 2],
      ["Cartes de l’extension", 2],
    ],
  );
  const raw = structuredClone(d);
  raw.note = "<script>alert(1)</script>";
  raw.review = null;
  const html = reportHtml(report(raw));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  const unknown = report(seed.cases[0]);
  assert.ok(unknown.sections[1].rows.some((r) => r[2] === "Non compté"));
});
test("maximum escaped JSON remains under importer 5 MiB and restores all 50 dossiers", () => {
  const max = { version: 1, catalog: seed.catalog, cases: [] };
  for (let i = 0; i < 50; i++) {
    let s = copy();
    const id = `D${i}`;
    s.cases = [s.cases[0]];
    s.cases[0].id = id;
    s.cases[0].place = "\u0001".repeat(119) + "x";
    s.cases[0].order = "\u0001".repeat(79) + "x";
    s.cases[0].note = "\u0001".repeat(1000);
    s = setKit(s, id, "pack");
    for (const c of COMPONENTS) {
      s = setCount(s, id, c.id, 1000);
      s = explain(s, id, c.id, "\u0001".repeat(499) + "x");
    }
    s = setEdition(s, id, true);
    s = review(s, id, "\u0001".repeat(59) + "x", true);
    max.cases.push(s.cases[0]);
  }
  const json = JSON.stringify(max, null, 2);
  assert.ok(Buffer.byteLength(json) < 5242880);
  assert.deepEqual(restore(json), max);
  const extra = structuredClone(max);
  extra.cases.push({ ...extra.cases[0], id: "X51" });
  assert.throws(() => restore(extra));
});

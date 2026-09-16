import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  groups,
  propose,
  applyProposal,
  editRow,
  editRules,
  setCheck,
  review,
  reviewed,
  importCsv,
  restore,
  pending,
  HEADERS,
  csvRows,
} from "./model.js";
import { csvText } from "../../shared/files.js";
test("grouping ignores support color but separates ink and plate", () => {
  let s = seed();
  assert.equal(groups(s).length, 2);
  s = editRow(s, "l2", { ink: "Blanc" });
  assert.equal(groups(s).length, 3);
  s = editRow(s, "l3", { plate: "Autre" });
  assert.equal(groups(s).length, 4);
});
test("kraft needs both total600 and each size200", () => {
  let s = seed();
  s = editRow(s, "l1", { qty: 400 });
  s = editRow(s, "l2", { qty: 50 });
  s = editRow(s, "l3", { qty: 100 });
  s = editRow(s, "l4", { qty: 50 });
  const g = groups(s)[0];
  assert.equal(g.total, 600);
  assert.ok(g.issues.some((x) => x.includes("Taille M")));
});
test("proposal explains pack rounding and minimum, never mutates before acceptance", () => {
  const s = seed(),
    g = groups(s)[0],
    p = propose(s, g.key, "l3");
  assert.equal(g.total, 475);
  assert.equal(p.total, 600);
  assert.equal(p.delta, 125);
  assert.equal(p.steps[0].delta, 25);
  assert.equal(s.rows[0].qty, 175);
  const applied = applyProposal(s, p);
  assert.equal(groups(applied)[0].issues.length, 0);
  assert.equal(applied.rows[2].qty, 250);
});
test("per-size correction precedes global minimum, all quantities stay multiples", () => {
  const s = seed(),
    p = propose(s, groups(s)[1].key, "l5");
  assert.equal(p.total, 300);
  assert.equal(p.rows.find((r) => r.id === "l6").qty, 100);
  assert.equal(p.rows.find((r) => r.id === "l5").qty, 200);
  assert.ok(p.rows.every((r) => r.qty % r.pack === 0));
});
test("stale proposal rejected after routing to a new ink", () => {
  const s = seed(),
    p = propose(s, groups(s)[0].key);
  assert.throws(
    () => applyProposal(editRow(s, "l2", { ink: "Blanc" }), p),
    /changé/,
  );
});
test("review requires all checks and passing amounts, later changes invalidate", () => {
  let s = seed();
  assert.throws(() => review(s));
  for (const g of groups(s)) s = applyProposal(s, propose(s, g.key));
  for (const key of ["logo", "technique", "stock"]) s = setCheck(s, key, true);
  assert.equal(pending(s).length, 0);
  s = review(s);
  assert.ok(reviewed(s));
  assert.ok(!reviewed(editRow(s, "l1", { qty: 650 })));
  assert.ok(
    !reviewed(
      editRules(s, {
        ...s.rules,
        version: "Règle atelier test",
        kraft: { total: 650, perSize: 200 },
      }),
    ),
  );
});
test("CSV valid roundtrip, duplicates and nonintegers refused atomically", () => {
  const s = seed(),
    csv = csvText(HEADERS, csvRows(s));
  assert.deepEqual(importCsv(s, csv).rows, s.rows);
  assert.throws(() => importCsv(s, csv.replace("175", "175.5")));
  assert.throws(() => importCsv(s, csv.replace('"l2"', '"l1"')));
  assert.equal(s.rows[0].qty, 175);
});
test("restoration refuses stale review and retains current decisions", () => {
  let s = seed();
  for (const g of groups(s)) s = applyProposal(s, propose(s, g.key));
  for (const key of ["logo", "technique", "stock"]) s = setCheck(s, key, true);
  s = review(s);
  assert.ok(reviewed(restore(JSON.stringify(s))));
  s.rows[0].qty = 1;
  assert.throws(() => restore(JSON.stringify(s)), /Revue incompatible/);
});

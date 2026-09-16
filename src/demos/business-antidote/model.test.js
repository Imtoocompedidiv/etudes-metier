import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  trace,
  audit,
  shorten,
  exportPlan,
  importRows,
  path,
} from "./model.js";
const fresh = () => structuredClone(seed);
test("cycles identify both affected sources and prevent delivery", () => {
  assert.equal(audit(seed).errors, 2);
  assert.equal(trace("/guide", seed).code, "cycle");
  assert.throws(() => exportPlan(seed), /erreurs/);
});
test("a corrected terminal resolves the cycle, shortening remains explicit", () => {
  let value = fresh();
  value.redirects[3].destination = "/ressources/guide";
  assert.equal(audit(value).errors, 0);
  assert.deepEqual(trace("/guide", value).nodes, [
    "/guide",
    "/livre-blanc",
    "/ressources/guide",
  ]);
  value = shorten(value, "r2");
  assert.equal(exportPlan(value)[2].destination, "/ressources/guide");
  assert.equal(trace("/guide", value).edges.length, 1);
});
test("unknown and non-200 targets are distinct from a successful response", () => {
  const value = fresh();
  value.redirects[0].destination = "/absent";
  assert.equal(trace("/services", value).code, "unknown");
  value.redirects[0].destination = "/contact";
  value.inventory.at(-1).statut = "404";
  assert.equal(trace("/services", value).code, "target-status");
});
test("temporary chains cannot be silently flattened and ambiguous sources stop tracing", () => {
  const value = fresh();
  value.redirects[1].code = "302";
  assert.equal(trace("/services", value).canShorten, false);
  assert.throws(() => shorten(value, "r0"), /permanentes/);
  value.redirects.push({
    ...value.redirects[0],
    id: "duplicate",
    destination: "/contact",
  });
  assert.equal(trace("/services", value).code, "duplicate");
});
test("format boundaries reject external paths, blank counts and duplicated inventory", () => {
  assert.equal(path("//evil.example/x"), null);
  assert.equal(path("/x#frag"), null);
  assert.equal(path("/x?lang=fr"), "/x?lang=fr");
  assert.equal(path("/a/../b"), "/b");
  const value = fresh();
  value.inventory[0].visites = "";
  value.inventory.push({ ...value.inventory.at(-1), id: "dup" });
  assert.ok(audit(value).inventoryIssues.length >= 2);
  assert.equal(
    importRows("source;destination;code\n/a;/b;301", "redirects")[0].source,
    "/a",
  );
  assert.throws(
    () =>
      importRows(
        "source;destination;code\n/a;" + "/b".repeat(300) + ";301",
        "redirects",
      ),
    /500/,
  );
});

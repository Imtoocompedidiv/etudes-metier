import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  analyze,
  choose,
  clearChoice,
  editValue,
  relire,
  restore,
  finalPackage,
  MAX_BYTES,
} from "./model.js";
const resolve = (s) => {
  for (const r of analyze(s).rows.filter((r) => r.status === "conflict"))
    s = choose(s, r.siteId, r.key, "local");
  return s;
};
test("three-way comparison distinguishes inheritance, local-only change, convergence and conflict", () => {
  const s = seed(),
    a = analyze(s);
  assert.equal(s.decisions.length, 0);
  assert.equal(a.reviewed, false);
  assert.equal(
    a.rows.find((r) => r.siteId === "rivage" && r.key === "heading").status,
    "conflict",
  );
  assert.equal(
    a.rows.find((r) => r.siteId === "amandiers" && r.key === "intro").status,
    "local",
  );
  assert.equal(
    a.rows.find((r) => r.siteId === "belvedere" && r.key === "heading").status,
    "convergent",
  );
  assert.equal(
    a.rows.find((r) => r.siteId === "belvedere" && r.key === "access").status,
    "inherited",
  );
});
test("absence is distinct from empty, target deletion versus local edit is a conflict", () => {
  const s = seed(),
    r = analyze(s).rows.find((r) => r.siteId === "rivage" && r.key === "offer");
  assert.equal(r.target.present, false);
  assert.equal(r.status, "conflict");
  const kept = choose(s, "rivage", "offer", "local");
  assert.equal(
    analyze(kept).rows.find((r) => r.siteId === "rivage" && r.key === "offer")
      .result.present,
    true,
  );
  const removed = choose(s, "rivage", "offer", "target");
  assert.equal(
    analyze(removed).rows.find(
      (r) => r.siteId === "rivage" && r.key === "offer",
    ).result.present,
    false,
  );
  const empty = editValue(s, "target", null, "offer", true, "");
  assert.equal(
    analyze(empty).rows.find((r) => r.siteId === "rivage" && r.key === "offer")
      .target.present,
    true,
  );
});
test("package is atomic and requires explicit review; local variants survive final export", () => {
  const s = seed();
  assert.throws(() => finalPackage(s), /relu/);
  const done = resolve(s);
  assert.equal(analyze(done).ready, true);
  assert.throws(() => finalPackage(done), /relu/);
  const p = finalPackage(relire(done));
  assert.equal(p.sites.length, 4);
  assert.equal(p.sites[0].values.heading, "Le calme, au bord de l’eau");
  assert.equal(
    p.sites[1].values.intro,
    "Une maison ouverte sur le jardin, à quelques pas du village.",
  );
  assert.equal(Object.hasOwn(p.sites[2].values, "offer"), false);
});
test("required omissions and malformed result URLs block review, version identity must match", () => {
  let s = resolve(editValue(seed(), "target", null, "heading", false, ""));
  s = choose(s, "rivage", "heading", "target");
  assert.ok(analyze(s).issues.some((i) => i.type === "required"));
  assert.throws(() => relire(s), /contrôles/);
  s = resolve(
    editValue(
      seed(),
      "target",
      null,
      "bookingUrl",
      true,
      "javascript:alert(1)",
    ),
  );
  s = choose(s, "rivage", "bookingUrl", "target");
  assert.ok(analyze(s).issues.some((i) => i.type === "url"));
  s = resolve(seed());
  s.sites[0].baseVersion = "v0.9";
  assert.ok(analyze(s).issues.some((i) => i.type === "version"));
});
test("source edit clears decisions and review, stale imported decisions cannot bind to new content", () => {
  const s = relire(resolve(seed()));
  const next = editValue(s, "local", "rivage", "heading", true, "Autre titre");
  assert.equal(next.decisions.length, 0);
  assert.equal(next.review, null);
  const forged = structuredClone(s);
  forged.sites[0].values.heading = "Autre titre";
  const loaded = restore(JSON.stringify(forged));
  assert.equal(loaded.review, null);
  assert.equal(
    analyze(loaded).rows.find(
      (r) => r.siteId === "rivage" && r.key === "heading",
    ).status,
    "conflict",
  );
  assert.equal(analyze(clearChoice(s, "rivage", "heading")).ready, false);
});
test("reviewed roundtrip is exact, invalid duplicate schema and budget fail atomically", () => {
  const s = relire(resolve(seed()));
  assert.deepEqual(restore(JSON.stringify(s, null, 2)), s);
  assert.throws(
    () => restore(JSON.stringify({ ...s, fields: [s.fields[0], s.fields[0]] })),
    /dupliqué/,
  );
  assert.throws(() => restore(" ".repeat(MAX_BYTES + 1)), /4 Mo/);
  assert.throws(
    () => restore(JSON.stringify({ ...s, sites: [] })),
    /établissements/,
  );
  assert.throws(
    () => editValue(s, "target", null, "heading", true, "x".repeat(2001)),
    /2 000/,
  );
});

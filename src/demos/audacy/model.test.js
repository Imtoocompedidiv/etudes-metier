import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  analyze,
  editPage,
  editLink,
  relire,
  restore,
  finalPlan,
  importCsvPair,
  contentHeaders,
  linkHeaders,
  pathKey,
  MAX_BYTES,
} from "./model.js";
import { csvText } from "../../shared/files.js";
const fixed = () => {
  let s = seed();
  s = editPage(s, "ateliers", { targetPath: "/ateliers" });
  s = editPage(s, "contact", { space: "institution" });
  s = editLink(s, "l3", {
    action: "remove",
    reason: "Annonce ancienne retirée.",
  });
  return editLink(s, "l7", {
    action: "replace",
    replacement: "ateliers",
    reason: "Renvoyer au programme courant.",
  });
};
test("initial source issues are explicit and nothing is reviewed", () => {
  const a = analyze(seed());
  assert.equal(a.reviewed, false);
  assert.equal(a.issues.filter((x) => x.kind === "collision").length, 2);
  assert.equal(a.issues.filter((x) => x.kind === "archived-target").length, 2);
  assert.ok(a.issues.some((x) => x.kind === "unassigned"));
  assert.throws(() => finalPlan(seed()), /relire/);
});
test("destination identity includes space, normalizes trailing slash, and preserves case", () => {
  let s = editPage(seed(), "ateliers", { space: "institution" });
  assert.equal(
    analyze(s).issues.some((x) => x.kind === "collision"),
    false,
  );
  s = editPage(s, "ateliers", { space: "services", targetPath: "/adherer/" });
  assert.equal(
    analyze(s).issues.filter((x) => x.kind === "collision").length,
    2,
  );
  assert.equal(pathKey("/A/"), "/A");
  assert.throws(() => pathKey("/a/../b"), /absolu/);
  assert.throws(() => pathKey("//foreign"), /absolu/);
});
test("cross-space links are ordinary; redirected destinations use current target route", () => {
  const s = fixed(),
    a = analyze(s);
  assert.equal(a.ready, true);
  const l = a.relations.find((x) => x.id === "l7");
  assert.equal(l.targetUrl, "https://services.exemple.test/ateliers");
  assert.equal(l.crossSpace, true);
  const plan = finalPlan(relire(s));
  assert.equal(plan.links.find((x) => x.id === "l3").newTarget, null);
  assert.equal(plan.links.find((x) => x.id === "l7").newTarget, l.targetUrl);
  assert.equal(plan.pages.find((x) => x.id === "rencontres").action, "archive");
});
test("archived sources are excluded; reasons and replacement identity cannot be omitted", () => {
  let s = fixed();
  assert.equal(
    analyze(s).relations.find((x) => x.id === "l8").status,
    "source-archived",
  );
  s = editLink(s, "l3", { reason: "" });
  assert.ok(analyze(s).issues.some((x) => x.kind === "reason"));
  s = editLink(fixed(), "l7", { replacement: null });
  assert.ok(analyze(s).issues.some((x) => x.kind === "replacement"));
  s = editPage(fixed(), "rencontres", { note: "" });
  assert.ok(analyze(s).issues.some((x) => x.kind === "archive-reason"));
});
test("review changes with routes or decisions, roundtrip exact, edited external JSON loses stale review", () => {
  const s = relire(fixed());
  assert.deepEqual(restore(JSON.stringify(s, null, 2)), s);
  const moved = editPage(s, "ateliers", { targetPath: "/programme" });
  assert.equal(moved.review, null);
  assert.equal(
    analyze(moved).relations.find((x) => x.id === "l7").targetUrl,
    "https://services.exemple.test/programme",
  );
  const forged = structuredClone(s);
  forged.contents[0].title = "Autre titre";
  assert.equal(restore(JSON.stringify(forged)).review, null);
});
test("atomic CSV pair and strict references preserve source identity", () => {
  const s = fixed();
  const r = importCsvPair(
    csvText(contentHeaders, s.contents),
    csvText(linkHeaders, s.links),
    seed(),
  );
  assert.deepEqual(r, s);
  const broken = structuredClone(s);
  broken.links[0].to = "absent";
  assert.throws(() => restore(JSON.stringify(broken)), /référencé absent/);
  assert.throws(
    () =>
      restore(
        JSON.stringify({ ...s, contents: [s.contents[0], s.contents[0]] }),
      ),
    /dupliqué/,
  );
  assert.throws(() => restore(" ".repeat(MAX_BYTES + 1)), /2 Mo/);
});

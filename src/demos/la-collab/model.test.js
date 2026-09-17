import test from "node:test";
import assert from "node:assert/strict";
import { reportHtml, csvText } from "../../shared/files.js";
import {
  MAX_BYTES,
  seed,
  schema,
  normalize,
  parseImport,
  inspect,
  visibility,
  transition,
  validate,
  evaluate,
  currentRun,
  canDeliver,
  editField,
  editScenario,
  execute,
  importData,
  deliver,
  resultRows,
  report,
  RESULT_HEADERS,
} from "./model.js";
const repaired = () => {
  const d = seed(),
    f = d.schema.fields[1];
  return editField(d, f.id, {
    ...f,
    when: { field: "profil", equals: "professionnel" },
  });
};
test("unknown references block execution, corrected scenario tests its expected validation failure", () => {
  const d = seed();
  assert.equal(inspect(d.schema)[0].code, "reference");
  assert.throws(() => execute(d), /constats/);
  const r = execute(repaired());
  assert.equal(evaluate(r).passed, true);
  assert.ok(canDeliver(r));
  assert.deepEqual(evaluate(r).results[1].steps[0].actual.errors, ["societe"]);
  assert.deepEqual(deliver(r), r.schema);
});
test("three transitions purge the company and never resurrect it when returning to professional", () => {
  const s = repaired().schema;
  let state = transition(
    s,
    {},
    {
      profil: "professionnel",
      societe: "Fictive",
      email: "lea@example.invalid",
      objet: "rdv",
      description: "Bonjour",
    },
  );
  assert.equal(state.answers.societe, "Fictive");
  state = transition(s, state.answers, { profil: "particulier" });
  assert.deepEqual(state.cleared, ["societe"]);
  assert.ok(!Object.hasOwn(state.answers, "societe"));
  state = transition(s, state.answers, { profil: "professionnel" });
  assert.equal(state.answers.societe, "");
  assert.deepEqual(
    validate(s, state.answers).map((x) => x.field),
    ["societe"],
  );
});
test("condition cycles and descendants stay unknown rather than rendering valid controls", () => {
  const d = repaired();
  d.schema.fields[0].when = { field: "societe", equals: "X" };
  const issues = inspect(d.schema);
  assert.equal(issues.filter((x) => x.code === "cycle").length, 2);
  const vis = visibility(d.schema, { profil: "professionnel", societe: "X" });
  assert.equal(vis.profil, null);
  assert.equal(vis.societe, null);
  assert.throws(() => execute(d));
});
test("hidden descendants disappear together, including the equality-to-empty case", () => {
  const d = repaired();
  d.schema.fields[4].when = { field: "societe", equals: "" };
  const state = transition(
    d.schema,
    { profil: "professionnel", description: "Should clear" },
    { profil: "particulier" },
  );
  assert.equal(state.visible.description, false);
  assert.ok(!Object.hasOwn(state.answers, "description"));
});
test("configuration and scenario edits invalidate results; identical imports preserve them", () => {
  const d = execute(repaired());
  assert.ok(currentRun(d));
  const edited = editField(d, "email", {
    ...d.schema.fields[2],
    help: "Adresse fictive",
  });
  assert.ok(!currentRun(edited));
  assert.throws(() => resultRows(edited));
  assert.throws(() => deliver(edited));
  const item = parseImport(JSON.stringify(d.schema));
  assert.deepEqual(importData(d, item), d);
  const changed = editScenario(d, d.scenarios[0].id, {
    ...d.scenarios[0],
    name: "Nouveau titre",
  });
  assert.ok(!currentRun(changed));
  const stale = normalize({ ...edited, execution: d.execution });
  assert.ok(!currentRun(stale));
});
test("expectations remain independent; an incorrect expected visibility really fails the run", () => {
  let d = repaired();
  const first = structuredClone(d.scenarios[0]);
  first.steps[0].expect.visible.push("societe");
  d = editScenario(d, first.id, first);
  d = execute(d);
  assert.equal(evaluate(d).results[0].passed, false);
  assert.ok(currentRun(d));
  assert.ok(!canDeliver(d));
  assert.throws(() => deliver(d));
  assert.equal(resultRows(d)[0][2], "non");
});
test("strict schema shapes, duplicates, booleans, dangerous keys and unknown scenario fields fail safely", () => {
  const d = seed();
  assert.throws(() =>
    schema({
      ...d.schema,
      fields: [{ ...d.schema.fields[0], id: "constructor" }],
    }),
  );
  for (const change of [
    { required: "true" },
    { type: ["text"] },
    { options: [{ value: "a", label: "A" }] },
  ])
    assert.throws(() =>
      editField(d, "societe", { ...d.schema.fields[1], ...change }),
    );
  assert.throws(() =>
    schema({ ...d.schema, fields: [d.schema.fields[0], d.schema.fields[0]] }),
  );
  assert.throws(() => parseImport("null"));
  assert.throws(() => parseImport("{oops"));
  const r = repaired();
  r.scenarios[0].steps[0].set.unknown = "X";
  assert.ok(evaluate(r).blocked);
  assert.throws(() => transition(r.schema, {}, { unknown: "X" }));
});
test("missing labels/messages are explicit config issues and valid values use local targeted validation", () => {
  const d = repaired();
  d.schema.fields[2].label = "";
  d.schema.fields[2].error = "";
  assert.equal(inspect(d.schema).length, 2);
  const r = repaired();
  assert.deepEqual(
    validate(r.schema, {
      profil: "particulier",
      email: "bad",
      objet: "unknown",
      description: "",
    }).map((x) => x.field),
    ["email", "objet", "description"],
  );
});
test("actual dossier serialization roundtrip retains execution and reports escape text", () => {
  let d = repaired();
  d = editField(d, "email", {
    ...d.schema.fields[2],
    help: "<script>unsafe</script>",
  });
  d = execute(d);
  const imported = parseImport(JSON.stringify(d, null, 2));
  assert.deepEqual(imported.data, d);
  assert.ok(canDeliver(imported.data));
  assert.ok(!reportHtml(report(d)).includes("<script>unsafe"));
  assert.ok(
    csvText(RESULT_HEADERS, resultRows(d)).includes("Retour au particulier"),
  );
  assert.equal(resultRows(d).length, 5);
});
test("serialization budget rejects oversized canonical dossiers before accepting unsavable state", () => {
  const d = repaired();
  const base = d.scenarios[0];
  d.scenarios = Array.from({ length: 3 }, (_, i) => ({
    ...base,
    id: "test_" + i,
    steps: Array.from({ length: 20 }, () => ({
      set: Object.fromEntries(
        Array.from({ length: 24 }, (_, j) => [
          "field_" + j,
          "\ud800".repeat(2000),
        ]),
      ),
      expect: { visible: [], errors: [], cleared: [] },
    })),
  }));
  assert.throws(() => normalize(d), /12 Mio/);
  const smaller = repaired();
  smaller.journal = Array.from({ length: 60 }, () => '\ud800"\\'.repeat(100));
  const n = normalize(smaller),
    raw = JSON.stringify(n, null, 2);
  assert.ok(new TextEncoder().encode(raw).length < MAX_BYTES);
  assert.deepEqual(parseImport(raw).data, n);
});

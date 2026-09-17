import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePhp,
  serializePhp,
  transform,
  replaceOrigins,
  seed,
  analyze,
  review,
  updateRow,
  plan,
  restore,
  importCsv,
  normalize,
  byteLength,
} from "./model.js";
import { csvText } from "../../shared/files.js";

test("replacement expansion is bounded and a valid external origin is preserved", () => {
  const raw = serializePhp({
    type: "s",
    value: "https://a.test/ ".repeat(2200),
  });
  assert.throws(
    () => transform(raw, "https://a.test", `https://${"b".repeat(200)}.test`),
    /dépasse/,
  );
  const state = seed();
  assert.equal(
    analyze(state).rows.find((r) => r.name === "lien_partenaire").status,
    "unchanged",
  );
  assert.throws(
    () =>
      normalize({
        ...state,
        rows: [{ name: "x", value: "\ud800", excluded: false, reason: "" }],
      }),
    /Unicode/,
  );
});

test("byte parser handles accents, emoji, delimiters and exact integer values", () => {
  const raw =
    'a:3:{s:4:"clé";s:10:"été 😀";i:0;i:9223372036854775807;s:1:"x";s:4:"\";{}";}';
  const tree = parsePhp(raw);
  assert.equal(serializePhp(tree), raw);
  assert.throws(() => parsePhp('s:1:"é";'), /UTF-8/);
  assert.throws(() => parsePhp('s:4:"é";'), /Délimiteur/);
  assert.throws(() => parsePhp("i:9223372036854775808;"), /64 bits/);
});
test("rejects unsupported or ambiguous structures and excessive nesting", () => {
  for (const x of [
    'O:0:"":0:{}',
    "R:1;",
    'E:1:"a";',
    'a:1:{b:1;s:1:"x";}',
    'a:2:{i:0;N;s:1:"0";N;}',
    "N;extra",
    "b:2;",
  ])
    assert.throws(() => parsePhp(x));
  assert.throws(
    () => parsePhp("a:1:{i:0;".repeat(22) + "N;" + "}".repeat(22)),
    /profonde/,
  );
});
test("transform preserves keys and neighbours; recalculates UTF-8 string lengths", () => {
  const raw =
    'a:2:{s:20:"https://atelier.test";s:24:"https://atelier.test/été";s:1:"n";N;}';
  // Build lengths explicitly so the fixture itself does not hide an invalid byte count.
  const tree = {
    type: "a",
    entries: [
      {
        key: { type: "s", value: "https://atelier.test" },
        value: { type: "s", value: "https://atelier.test/été" },
      },
      { key: { type: "s", value: "n" }, value: { type: "N", value: null } },
    ],
  };
  const result = transform(
    serializePhp(tree),
    "https://atelier.test",
    "https://nouvel.test",
  );
  const output = parsePhp(result.output);
  assert.equal(output.entries[0].key.value, "https://atelier.test");
  assert.equal(output.entries[0].value.value, "https://nouvel.test/été");
  const text =
    "https://atelier.test/a https://atelier.test.evil/a https://sub.atelier.test https://atelier.test:444/a http://atelier.test/a https://atelier.test@evil.test/";
  assert.equal(
    replaceOrigins(text, "https://atelier.test", "https://nouvel.test"),
    "https://nouvel.test/a https://atelier.test.evil/a https://sub.atelier.test https://atelier.test:444/a http://atelier.test/a https://atelier.test@evil.test/",
  );
  assert.throws(
    () =>
      transform(
        serializePhp({ type: "s", value: 's:1:"x";' }),
        "https://atelier.test",
        "https://nouvel.test",
      ),
    /imbriquée/,
  );
});
test("seed gives three changes and invalid cache; exclusion permits explicit reviewed plan", () => {
  const state = seed(),
    a = analyze(state);
  assert.equal(a.changed.length, 3);
  assert.equal(a.blocked.length, 1);
  assert.equal(a.reviewed, false);
  assert.throws(() => review(state), /Corrigez/);
  const fixed = updateRow(state, "cache_banner", {
    excluded: true,
    reason: "Cache à reconstruire hors de cet atelier.",
  });
  const reviewed = review(fixed);
  assert.equal(plan(reviewed).changes.length, 3);
  assert.equal(plan(reviewed).exceptions.length, 2);
  assert.equal(
    analyze(
      updateRow(reviewed, "home", { value: "https://atelier.test/accueil" }),
    ).reviewed,
    false,
  );
  assert.throws(() => plan({ ...reviewed, to: "https://autre.test" }), /relue/);
});
test("imports atomic schema and duplicate names; empty value is legitimate", () => {
  const csv = csvText(
    ["option_name", "option_value"],
    [
      { option_name: "a", option_value: "" },
      { option_name: "b", option_value: 'https://atelier.test/é;"x"\n' },
    ],
  );
  const state = importCsv(csv, seed());
  assert.equal(state.rows[0].value, "");
  assert.equal(state.rows[1].value, 'https://atelier.test/é;"x"\n');
  assert.throws(
    () => importCsv("option_name;option_value\na;x\na;y", seed()),
    /dupliqué/,
  );
  assert.throws(() => importCsv("nom;valeur\nx;y", seed()));
  assert.throws(
    () => normalize({ ...seed(), from: "https://atelier.test/path" }),
    /origine/,
  );
  assert.throws(
    () =>
      normalize({
        ...seed(),
        rows: [{ name: "x", value: "x", excluded: true, reason: "" }],
      }),
    /motif/,
  );
});
test("save restore preserves reviewed data and strips stale review", () => {
  const ready = review(
    updateRow(seed(), "cache_banner", {
      excluded: true,
      reason: "À contrôler séparément.",
    }),
  );
  assert.equal(analyze(restore(JSON.stringify(ready, null, 2))).reviewed, true);
  const tampered = { ...ready, to: "https://nouveau.test" };
  assert.equal(restore(JSON.stringify(tampered)).review, null);
  assert.throws(
    () => restore(JSON.stringify({ ...ready, review: ["a".repeat(64)] })),
    /Empreinte/,
  );
});
test("maximal canonical data with escapes and valid surrogates is restorable", () => {
  const value = '\u0000'.repeat(49995) + '😀"';
  const rows = Array.from({ length: 20 }, (_, i) => ({
    name: "field" + i,
    value,
    excluded: true,
    reason: "Contrôle séparé " + '\u0000'.repeat(280),
  }));
  const state = review(normalize({ ...seed(), rows }));
  const raw = JSON.stringify(state, null, 2);
  assert.ok(byteLength(raw) > 5_900_000);
  assert.equal(analyze(restore(raw)).reviewed, true);
});

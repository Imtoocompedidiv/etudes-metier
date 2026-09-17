import test from "node:test";
import assert from "node:assert/strict";
import { readLocalFile } from "../../shared/files.js";
import {
  initialDossier as seed,
  run,
  replay,
  advance,
  editEvent,
  editRules,
  remember,
  comparison,
  replaceTrace,
  replaceRules,
  removeEdit,
  parseTrace,
  parseScenario,
  normalizeRules,
  normalizeDossier,
  validDossier,
  effectiveRows,
  effectiveRules,
  decimal,
  resultRows,
  scenarioJson,
  manifest,
  exampleTrace,
  dossierMaxBytes,
} from "./model.js";
const at = "2026-09-17T03:00:00.000Z";
test("Rejeu vide puis trois événements et fin déterministe sans écriture physique", () => {
  assert.equal(run(seed).results.length, 0);
  assert.equal(run(seed).states[0].valeur, null);
  let step = seed;
  for (let i = 0; i < 7; i++) step = advance(step, "step", at);
  const full = advance(seed, "all", at);
  assert.deepEqual(run(step), run(full));
  assert.equal(run(full).accepted, 3);
  assert.equal(run(full).rejected, 4);
  assert.equal(run(full).states[0].valeur, 15000000);
  assert.equal(run(full).states[1].valeur, 2000000);
  assert.match(run(full).results[3].errors.join(" "), /contradictoire/);
  assert.match(run(full).results[4].errors.join(" "), /cm.*mm/);
  assert.match(run(full).results[5].errors.join(" "), /hors ordre/);
  assert.match(run(full).results[6].errors.join(" "), /absente/);
});

test("Dossier maximal échappé exportable puis restaurable par la même borne fichier que l’interface", async () => {
  const escaped = "\u0001";
  const trace = Array.from({ length: 500 }, (_, i) => ({
    evenement: escaped.repeat(47) + String(i).padStart(3, "0"),
    temps_ms: escaped.repeat(100),
    sequence: escaped.repeat(100),
    canal: escaped.repeat(100),
    valeur: escaped.repeat(100),
    unite: escaped.repeat(100),
  }));
  const rules = Array.from({ length: 20 }, (_, i) => ({
    canal: escaped.repeat(48) + String(i).padStart(2, "0"),
    unite: escaped.repeat(20),
    min: "-999999.999999",
    max: "999999.999999",
  }));
  const d = normalizeDossier({
    version: 1,
    trace: { name: escaped.repeat(200), rows: trace },
    scenario: { name: escaped.repeat(200), rules },
    edits: trace.map((r) => ({
      evenement: r.evenement,
      values: r,
      reason: escaped.repeat(500),
    })),
    ruleEdit: { rules, reason: escaped.repeat(500) },
    cursor: 500,
    reference: { rows: trace, rules, at },
    journal: Array.from({ length: 2000 }, () => ({
      at,
      action: escaped.repeat(700),
    })),
  });
  const file = new Blob([JSON.stringify(d, null, 2)]);
  assert.ok(file.size > 5 * 1024 * 1024);
  assert.ok(file.size < dossierMaxBytes);
  await assert.rejects(() => readLocalFile(file), /limite/);
  const restored = normalizeDossier(
    JSON.parse(await readLocalFile(file, { maxBytes: dossierMaxBytes })),
  );
  assert.deepEqual(restored, d);
  assert.equal(validDossier(restored), true);
});
test("Doublon identique ignoré, contradiction rejetée, identifiant événement indépendant", () => {
  const trace = [
    seed.trace.rows[0],
    { ...seed.trace.rows[0], evenement: "EV-copy" },
    { ...seed.trace.rows[0], evenement: "EV-other", valeur: "12" },
  ];
  const r = replay(trace, seed.scenario.rules);
  assert.deepEqual(
    r.results.map((x) => x.status),
    ["accepte", "doublon", "rejete"],
  );
  assert.equal(r.states[0].valeur, 10000000);
  assert.equal(r.duplicates, 1);
  const rejected = [
    { ...trace[0], unite: "kg" },
    { ...trace[1], unite: "kg" },
  ];
  assert.equal(replay(rejected, seed.scenario.rules).accepted, 0);
});
test("Un paquet rejeté ne change pas la valeur mais son horodatage observé ne disparaît pas", () => {
  const trace = [
    seed.trace.rows[0],
    { ...seed.trace.rows[1], temps_ms: "100", unite: "cm" },
    { ...seed.trace.rows[2], temps_ms: "90" },
  ];
  const r = replay(trace, seed.scenario.rules);
  assert.equal(r.clock, 100);
  assert.match(r.results[2].errors.join(""), /hors ordre/);
  assert.equal(r.states[0].evenement, "EV-01");
});
test("Valeur manquante, zéro, canal inconnu, unités et bornes sans conversions implicites", () => {
  assert.equal(decimal(""), null);
  assert.equal(decimal("0"), 0);
  assert.equal(decimal("-0,000001"), -1);
  assert.equal(decimal("1e2"), null);
  assert.equal(decimal("1.1234567"), null);
  for (const [field, value, pattern] of [
    ["canal", "inconnu", /Canal inconnu/],
    ["sequence", "", /Séquence/],
    ["temps_ms", "1.5", /Temps entier/],
    ["valeur", "101", /intervalle/],
    ["unite", "n", /N attendue/],
  ]) {
    const r = replay(
      [{ ...seed.trace.rows[0], [field]: value }],
      seed.scenario.rules,
    );
    assert.equal(r.accepted, 0);
    assert.match(r.results[0].errors.join(" "), pattern);
  }
  assert.equal(
    replay([{ ...seed.trace.rows[0], valeur: "0" }], seed.scenario.rules)
      .accepted,
    1,
  );
});
test("Correction motivée conserve la source et invalide le rejeu ; référence explicitement complète", () => {
  assert.throws(() => remember(seed, at), /Terminez/);
  assert.throws(
    () => editEvent(seed, "EV-04", seed.trace.rows[3], "", at),
    /motif/,
  );
  const full = remember(advance(seed, "all", at), at),
    fixed = editEvent(
      full,
      "EV-04",
      { ...seed.trace.rows[3], valeur: "15" },
      "Retransmission identique confirmée dans cet exemple.",
      at,
    );
  assert.equal(fixed.cursor, 0);
  assert.equal(fixed.trace.rows[3].valeur, "18");
  assert.equal(comparison(fixed).pending, true);
  const rerun = advance(fixed, "all", at);
  assert.equal(run(rerun).results[3].status, "doublon");
  assert.equal(comparison(rerun).changes.length, 1);
  assert.equal(comparison(rerun).changes[0].evenement, "EV-04");
  assert.equal(removeEdit(rerun, "EV-04", at).cursor, 0);
});
test("Édition de règles valide les canaux puis annule les résultats calculés", () => {
  const original = remember(advance(seed, "all", at), at),
    rules = structuredClone(seed.scenario.rules);
  rules[0].max = "12";
  assert.throws(() => editRules(original, rules, "", at), /motif/);
  assert.throws(() => normalizeRules([...rules, rules[0]]), /même canal/);
  assert.throws(
    () => normalizeRules([{ ...rules[0], min: "20" }]),
    /intervalle/,
  );
  const changed = editRules(
    original,
    rules,
    "Seuil volontairement réduit pour la recette.",
    at,
  );
  assert.equal(changed.cursor, 0);
  assert.equal(changed.scenario.rules[0].max, "100");
  assert.equal(comparison(advance(changed, "all", at)).rulesChanged, true);
  assert.equal(run(advance(changed, "all", at)).states[0].valeur, 10000000);
});
test("Imports identiques conservent corrections et résultats, nouvelle trace les retire, référence conservée", () => {
  let d = editEvent(
    seed,
    "EV-04",
    { ...seed.trace.rows[3], valeur: "15" },
    "Doublon",
    at,
  );
  d = remember(advance(d, "all", at), at);
  assert.equal(
    replaceTrace(d, parseTrace(exampleTrace()), "identique.csv", at).edits
      .length,
    1,
  );
  assert.equal(
    replaceTrace(d, parseTrace(exampleTrace()), "identique.csv", at).cursor,
    7,
  );
  const raw = structuredClone(seed.trace.rows);
  raw[0].valeur = "11";
  const next = replaceTrace(d, raw, "nouveau.csv", at);
  assert.equal(next.cursor, 0);
  assert.equal(next.edits.length, 0);
  assert.ok(next.reference);
  const rules = structuredClone(seed.scenario.rules);
  rules[1].max = "40";
  assert.equal(replaceRules(d, rules, "nouveau.json", at).cursor, 0);
});
test("Identité des événements pour comparaison, retrait et ajout restent explicites", () => {
  let d = remember(advance(seed, "all", at), at);
  const raw = structuredClone(seed.trace.rows);
  raw[0].evenement = "EV-new";
  d = advance(replaceTrace(d, raw, "changed.csv", at), "all", at);
  assert.equal(
    comparison(d).changes.some(
      (x) =>
        x.evenement === "EV-01" && x.apres === "Absent de la trace courante",
    ),
    true,
  );
  assert.equal(
    comparison(d).changes.some(
      (x) => x.evenement === "EV-new" && x.avant === "Absent de la référence",
    ),
    true,
  );
});
test("Schémas et cache canoniques, exports/restauration traçables", () => {
  assert.deepEqual(parseTrace(exampleTrace()), seed.trace.rows);
  assert.deepEqual(
    parseScenario(JSON.stringify(scenarioJson(seed))),
    seed.scenario.rules,
  );
  assert.throws(
    () => parseTrace("evenement;temps_ms;sequence;canal;valeur;unite"),
    /1 à 500/,
  );
  assert.throws(
    () => parseTrace(exampleTrace() + "\nEV-01;1;2;force;3;N"),
    /répété/,
  );
  assert.throws(() => normalizeRules([]), /1 à 20/);
  const d = remember(advance(seed, "all", at), at);
  assert.equal(validDossier(d), true);
  assert.deepEqual(normalizeDossier(JSON.parse(JSON.stringify(d))), d);
  const bad = structuredClone(d);
  bad.edits = [{ evenement: "ghost", values: seed.trace.rows[0], reason: "x" }];
  assert.equal(validDossier(bad), false);
  const hidden = structuredClone(d);
  hidden.cursor = 7.5;
  assert.equal(validDossier(hidden), false);
  const raw = structuredClone(d);
  raw.trace.rows[0].hidden = true;
  assert.equal(validDossier(raw), false);
  assert.equal(resultRows(d).length, 7);
  assert.equal(manifest(d).rejeu.rejected, 4);
  assert.equal(manifest(d).source.rows[3].valeur, "18");
  assert.deepEqual(effectiveRows(seed), seed.trace.rows);
  assert.deepEqual(effectiveRules(seed), seed.scenario.rules);
});

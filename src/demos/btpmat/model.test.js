import test from "node:test";
import assert from "node:assert/strict";
import { csvText } from "../../shared/files.js";
import {
  initialDossier as seed,
  analyze,
  cellValue,
  parseCatalog,
  exampleCsv,
  rowKey,
  decide,
  replaceState,
  correctSource,
  removeCorrection,
  normalizeDossier,
  validDossier,
  manifest,
  headers,
} from "./model.js";
const at = "2026-09-17T02:30:00.000Z";
const get = (d, p = "MOD-A", v = "4M", field = "prix_ht") =>
  analyze(d)
    .variants.find((r) => r.produit === p && r.variante === v)
    .cells.find((c) => c.field === field);
test("Comparaison indépendante par déclinaison et trois branches exactes", () => {
  const a = analyze(seed);
  assert.equal(a.variants.length, 6);
  assert.equal(get(seed).status, "conflict");
  assert.equal(get(seed, "MOD-A", "3M").status, "same");
  assert.equal(get(seed, "BEN-B", "500L", "designation").status, "local");
  assert.equal(get(seed, "ETA-C", "GRIS", "stock").status, "incoming");
  assert.equal(a.patch.length, 2);
  assert.equal(a.exceptions.length, 4);
  assert.equal(
    a.patch.some((x) => x.champ === "prix_ht"),
    false,
  );
});
test("Prix en centimes, absence distincte de zéro et limites entières", () => {
  assert.deepEqual(cellValue("prix_ht", "0"), { valid: true, value: 0 });
  assert.equal(cellValue("prix_ht", "").valid, false);
  assert.equal(cellValue("prix_ht", "42,01").value, 4201);
  for (const s of ["-1", "1.234", "1e2", "1 000"])
    assert.equal(cellValue("prix_ht", s).valid, false);
  assert.equal(cellValue("stock", "1.5").valid, false);
  assert.equal(cellValue("delai_jours", "3651").valid, false);
});
test("Décision motivée, valeur boutique préservée ou flux explicitement choisi", () => {
  const c = get(seed);
  assert.throws(() => decide(seed, c.key, "", "Motif", at), /Choisissez/);
  assert.throws(() => decide(seed, c.key, "feed", " ", at), /Motif/);
  const keep = decide(
    seed,
    c.key,
    "shop",
    "Correction commerciale confirmée",
    at,
  );
  assert.equal(get(keep).result, 405000);
  assert.equal(analyze(keep).patch.length, 2);
  const take = decide(seed, c.key, "feed", "Nouveau tarif confirmé", at);
  assert.equal(get(take).result, 420000);
  const p = analyze(take).patch.find((x) => x.champ === "prix_ht");
  assert.equal(p.ancienne_valeur, "4050.00");
  assert.equal(p.nouvelle_valeur, "4200.00");
  assert.equal(p.motif, "Nouveau tarif confirmé");
});
test("Arbitrage périmé si un membre du triplet change, fichier identique conservé", () => {
  const chosen = decide(seed, get(seed).key, "feed", "Tarif confirmé", at);
  const exact = replaceState(
    chosen,
    "feed",
    seed.states.feed.rows,
    "nouveau-nom.csv",
    at,
  );
  assert.equal(get(exact).resolved, true);
  const rows = seed.states.feed.rows.map((r) =>
    r.variante === "4M" ? { ...r, prix_ht: "4250" } : r,
  );
  const next = replaceState(chosen, "feed", rows, "flux-revu.csv", at);
  assert.equal(get(next).stale, true);
  assert.equal(get(next).blocked, true);
  assert.equal(
    analyze(next).patch.some((x) => x.champ === "prix_ht"),
    false,
  );
  const baseRows = seed.states.base.rows.map((r) =>
    r.variante === "4M" ? { ...r, prix_ht: "3900.00" } : r,
  );
  assert.equal(
    get(replaceState(chosen, "base", baseRows, "base-revue.csv", at)).stale,
    true,
  );
});
test("Corrections source motivées, import original immuable et remplacement ciblé", () => {
  const row = seed.states.feed.rows.find((r) => r.produit === "BEN-B"),
    key = rowKey(row);
  const fixed = correctSource(
    seed,
    "feed",
    key,
    {
      designation: row.designation,
      prix_ht: "0",
      stock: row.stock,
      delai_jours: row.delai_jours,
    },
    "Prix gratuit confirmé pour l’exemple",
    at,
  );
  assert.equal(
    fixed.states.feed.rows.find((r) => r.produit === "BEN-B").prix_ht,
    "",
  );
  assert.equal(get(fixed, "BEN-B", "500L").status, "incoming");
  assert.equal(get(fixed, "BEN-B", "500L").result, 0);
  assert.equal(
    get(removeCorrection(fixed, "feed", key, at), "BEN-B", "500L").status,
    "invalid",
  );
  assert.throws(
    () => correctSource(seed, "feed", key, { ...row }, "", at),
    /motif/,
  );
  assert.equal(
    replaceState(fixed, "base", seed.states.base.rows, "base.csv", at).overrides
      .length,
    1,
  );
});
test("Nouvelles et absentes restent exceptions sans création ni suppression implicites", () => {
  const a = analyze(seed);
  for (const p of ["NEW-D", "LEG-E"]) {
    const v = a.variants.find((x) => x.produit === p);
    assert.equal(v.structural, true);
    assert.equal(
      a.patch.some((x) => x.produit === p),
      false,
    );
  }
  const r = seed.states.shop.rows.filter((x) => x.produit !== "ETA-C");
  assert.equal(
    analyze(replaceState(seed, "shop", r, "shop.csv", at)).variants.find(
      (x) => x.produit === "ETA-C",
    ).structural,
    true,
  );
});
test("Imports structuraux rejetés sans ambiguïté des clés ni conversion implicite", () => {
  assert.equal(parseCatalog(exampleCsv("base")).length, 5);
  assert.throws(
    () =>
      parseCatalog("produit;variante;designation;prix_ht;stock;delai_jours"),
    /1 à 500/,
  );
  assert.throws(
    () =>
      parseCatalog(exampleCsv("base") + '\n"MOD-A";"3M";"Autre";"1";"1";"1"'),
    /double/,
  );
  assert.throws(
    () => parseCatalog(exampleCsv("base").replace("MOD-A", "__proto__")),
    /réservés/,
  );
  assert.throws(() => parseCatalog("produit;produit\nA;B"), /même nom/);
});
test("Restauration canonique et manifeste traçable sans champs cachés acceptés en cache", () => {
  const d = decide(seed, get(seed).key, "feed", "Recette fictive", at);
  assert.equal(validDossier(JSON.parse(JSON.stringify(d))), true);
  assert.deepEqual(normalizeDossier(JSON.parse(JSON.stringify(d))), d);
  const bad = structuredClone(d);
  bad.decisions[0].hidden = "x";
  assert.equal(validDossier(bad), false);
  const phantom = structuredClone(d);
  phantom.overrides = [
    {
      side: "feed",
      key: '["fantome","x"]',
      values: { designation: "x", prix_ht: "2", stock: "1", delai_jours: "1" },
      reason: "x",
    },
  ];
  assert.throws(() => normalizeDossier(phantom), /absente/);
  const m = manifest(d);
  assert.equal(m.changements.length, 3);
  assert.equal(m.sources.feed.rows[1].prix_ht, "4200");
  assert.equal(m.arbitrages[0].reason, "Recette fictive");
});
test("Les identifiants et triplets au maximum échappé survivent à la décision et au JSON", () => {
  const d = structuredClone(seed),
    produit = '"'.repeat(40) + "\\".repeat(40),
    variante = "\\".repeat(40) + '"'.repeat(40);
  for (const [index, side] of ["base", "shop", "feed"].entries()) {
    const row = {
      produit,
      variante,
      designation: "\u0001".repeat(249) + String(index),
      prix_ht: "10",
      stock: "1",
      delai_jours: "2",
    };
    d.states[side].rows = parseCatalog(csvText(headers, [row]));
  }
  const cell = analyze(d).variants[0].cells.find(
    (c) => c.field === "designation",
  );
  assert.ok(cell.key.length > 300);
  assert.ok(cell.fingerprint.length > 1500);
  const result = decide(
    d,
    cell.key,
    "feed",
    "Conserver la désignation du flux",
    at,
  );
  assert.equal(validDossier(result), true);
  assert.deepEqual(
    normalizeDossier(JSON.parse(JSON.stringify(result))),
    result,
  );
  assert.equal(
    manifest(result).changements[0].nouvelle_valeur,
    d.states.feed.rows[0].designation,
  );
  const corrected = correctSource(
    result,
    "feed",
    rowKey(d.states.feed.rows[0]),
    { ...d.states.feed.rows[0], designation: "Désignation corrigée" },
    "Contrôle",
    at,
  );
  assert.deepEqual(
    normalizeDossier(JSON.parse(JSON.stringify(corrected))),
    corrected,
  );
});

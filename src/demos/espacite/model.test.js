import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  compare,
  decide,
  editSource,
  expectedYears,
  setPair,
  removePair,
  replaceSource,
  restore,
  exportRows,
  parseSource,
  HEADERS,
  report,
} from "./model.js";
import { csvText } from "../../shared/files.js";
test('les décimales exportées gardent la précision annoncée',()=>{let d=seed();d=editSource(d,'left','A04',{valeur:0.1},'Valeur témoin');d=editSource(d,'right','B04',{valeur:0.3},'Valeur témoin');const out=exportRows(d)[3];assert.equal(out.ecart,0.2);assert.equal(out.variation_pourcent,200);});
test("périmètre différent masque toute variation sans altérer les nombres", () => {
  const d = seed(),
    r = compare(d, d.pairs[1]);
  assert.equal(r.compatible, false);
  assert.equal(r.delta, null);
  assert.equal(exportRows(d)[1].reference, 12);
  assert.equal(exportRows(d)[1].ecart, "");
  assert.throws(() => decide(d, "C2", "include", "Relu"), /impossible/);
});
test("absence, zéro et variation depuis zéro sont distingués", () => {
  const d = seed();
  const z = compare(d, d.pairs[2]);
  assert.equal(z.delta, 24);
  assert.equal(z.relative, null);
  assert.equal(z.status, "Base nulle");
  const missing = compare(d, d.pairs[3]);
  assert.equal(missing.compatible, false);
  assert.equal(exportRows(d)[2].reference, 0);
  assert.equal(exportRows(d)[3].actualisation, "");
});
test("correction traçable invalide une décision et un retour à la même donnée restaure sa pertinence", () => {
  let d = decide(seed(), "C2", "exclude", "Périmètre élargi, ne pas comparer.");
  const old = structuredClone(d);
  d = editSource(d, "right", "B02", { valeur: 19 }, "Version reçue");
  assert.equal(compare(d, d.pairs[1]).stale, true);
  assert.equal(old.edits.length, 0);
  assert.equal(d.edits[0].before.valeur, 18);
  assert.equal(compare(old, old.pairs[1]).review.kind, "exclude");
  assert.throws(
    () => editSource(d, "right", "B02", { valeur: 20 }, ""),
    /Motif/,
  );
});
test("périodes et définition empêchent une comparaison malgré valeurs valides", () => {
  let d = expectedYears(seed(), 2023, 2025);
  assert.ok(compare(d, d.pairs[0]).issues.includes("Millésime inattendu"));
  d = editSource(
    seed(),
    "right",
    "B01",
    { definition: "Demandes encore actives" },
    "Définition du fichier",
  );
  assert.ok(compare(d, d.pairs[0]).issues.includes("Définition différente"));
  assert.throws(() => expectedYears(d, 2025, 2024), /suivre/);
});
test("pourcentages exigent un dénominateur défini et produisent un écart en points", () => {
  let d = seed();
  for (const [side, id, v] of [
    ["left", "A01", 24],
    ["right", "B01", 30],
  ])
    d = editSource(
      d,
      side,
      id,
      { unite: "pourcentage", valeur: v },
      "Nouvel indicateur",
    );
  assert.ok(compare(d, d.pairs[0]).issues.includes("Dénominateur non précisé"));
  for (const [side, id] of [
    ["left", "A01"],
    ["right", "B01"],
  ])
    d = editSource(
      d,
      side,
      id,
      { denominateur: "Ensemble des demandes" },
      "Population définie",
    );
  const r = compare(d, d.pairs[0]);
  assert.equal(r.delta, 6);
  assert.equal(r.relative, null);
});
test("imports valident toutes les lignes et conservent les références devenues orphelines", () => {
  const d = seed(),
    parsed = parseSource(csvText(HEADERS, d.sources.right));
  assert.equal(parsed[3].valeur, null);
  assert.throws(
    () =>
      parseSource(csvText(HEADERS, [d.sources.right[0], d.sources.right[0]])),
    /dupliqué/,
  );
  const n = replaceSource(d, "right", parsed.slice(1));
  assert.equal(n.pairs.length, 4);
  assert.equal(
    compare(n, n.pairs[0]).issues[0],
    "Ligne d’actualisation absente",
  );
  assert.equal(d.sources.right.length, 4);
});
test("correspondances explicites sans fusion ni réutilisation d’une ligne", () => {
  let d = seed();
  assert.throws(() => setPair(d, "C1", "A01", "B02"), /déjà rapprochée/);
  d = removePair(d, "C2");
  assert.equal(d.sources.left.length, 4);
  d = setPair(d, null, "A02", "B02");
  assert.equal(d.pairs.length, 4);
});
test("restauration refuse chaîne modifiée et revue compatible forcée", () => {
  let d = editSource(
    seed(),
    "right",
    "B01",
    { valeur: 1400 },
    "Révision du producteur",
  );
  d = decide(d, "C1", "include", "Définitions et couverture relues.");
  assert.deepEqual(restore(JSON.parse(JSON.stringify(d))), d);
  const bad = structuredClone(d);
  bad.edits[0].before.valeur = 0;
  assert.throws(() => restore(bad), /Chaîne/);
  const fabricated = decide(seed(), "C2", "exclude", "Écart réel");
  fabricated.reviews.C2.kind = "include";
  assert.throws(() => restore(fabricated), /incompatible/);
});
test("rapport échappe la saisie et conserve la correction, la note et les métadonnées", () => {
  let d = editSource(
    seed(),
    "right",
    "B01",
    { valeur: 1400 },
    "<script>alert(1)</script>",
  );
  d = decide(d, "C1", "include", "Version revue & documentée");
  const html = report(d);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("1395"));
  assert.ok(html.includes("1400"));
  assert.ok(html.includes("Version revue &amp; documentée"));
  assert.ok(html.includes("Dénominateur") || html.includes("denominateur"));
});

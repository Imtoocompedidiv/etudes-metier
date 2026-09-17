import test from "node:test";
import assert from "node:assert/strict";
import { csvText, reportHtml } from "../../shared/files.js";
import {
  HEADERS,
  seed,
  parseArrival,
  analyze,
  setAlias,
  editRow,
  reviewProduct,
  productKey,
  outputRows,
  restore,
  replaceArrival,
  removeAlias,
  report,
} from "./model.js";
const firstKey = (d) => productKey(d.source[0]);
const mapped = () => {
  const d = seed();
  return setAlias(
    d,
    d.source[1],
    "XL",
    "Libellé confirmé par le fournisseur fictif.",
  );
};
const reviewed = () => {
  const d = mapped();
  return reviewProduct(d, firstKey(d), "Variantes et références relues.");
};
test("initial dataset reports real duplicate references, missing image and family-specific alias", () => {
  const g = analyze(seed());
  assert.equal(g.length, 3);
  assert.equal(g[0].variants[1].size, null);
  assert.match(g[1].variants[0].issues.join(" "), /Référence partagée/);
  assert.match(g[1].variants[1].issues.join(" "), /Référence partagée/);
  assert.match(g[1].variants[2].issues.join(" "), /visuel/);
  assert.equal(outputRows(seed()).length, 0);
});
test("a supplier alias cannot spill into a different family or supplier", () => {
  let d = mapped();
  d.source.push({
    ...d.source[1],
    id: "X1",
    fournisseur: "Autre",
    reference: "X1",
  });
  d.source.push({
    ...d.source[1],
    id: "X2",
    famille: "femme",
    produit: "W",
    reference: "X2",
  });
  const variants = analyze(d).flatMap((g) => g.variants);
  assert.equal(variants.find((v) => v.row.id === "L2").size, "XL");
  assert.equal(variants.find((v) => v.row.id === "X1").size, null);
  assert.equal(variants.find((v) => v.row.id === "X2").size, null);
  assert.throws(() => setAlias(d, d.source[1], "39–42", "Wrong family"));
  assert.throws(() => setAlias(d, d.source[1], "XL", "  "));
});
test("review is bound to source, correction, alias and cross-product conflicts", () => {
  let d = reviewed();
  assert.equal(outputRows(d).length, 3);
  d = editRow(
    d,
    "L1",
    { ...d.source[0], visuel: "nouveau.jpg" },
    "Nouveau visuel confirmé.",
  );
  assert.equal(analyze(d)[0].stale, true);
  assert.equal(outputRows(d).length, 0);
  d = reviewed();
  d.source.push({ ...d.source[0], id: "NEW", produit: "OTHER" });
  assert.equal(analyze(d)[0].stale, true);
  assert.equal(outputRows(d).length, 0);
  d = removeAlias(reviewed(), seed().source[1]);
  assert.equal(analyze(d)[0].review, null);
});
test("source values survive motivated corrections; group IDs cannot silently merge", () => {
  const d = seed(),
    n = editRow(
      d,
      "L5",
      { ...d.source[4], reference: "CHA-R-4346" },
      "Référence confirmée.",
    );
  assert.equal(n.source[4].reference, "CHA-R-3942");
  assert.equal(analyze(n)[1].variants[1].row.reference, "CHA-R-4346");
  assert.throws(() =>
    editRow(
      d,
      "L5",
      { ...d.source[4], produit: "BOX-H" },
      "Fusion non autorisée",
    ),
  );
  assert.throws(() => editRow(d, "L5", d.source[4], ""));
  const html = reportHtml(report(n));
  assert.match(html, /CHA-R-3942/);
  assert.match(html, /CHA-R-4346/);
  assert.match(html, /Référence confirmée/);
});
test("product attributes and repeated color-size tuples block review", () => {
  const d = mapped();
  d.source[2].marque = "Autre marque";
  assert.match(analyze(d)[0].issues.join(" "), /marque différentes/);
  assert.throws(() => reviewProduct(d, firstKey(d), "Tentative"));
  d.source[2].marque = d.source[0].marque;
  d.source[2].couleur = "Bleu";
  assert.match(analyze(d)[0].issues.join(" "), /Couleur et taille répétées/);
  d.source[2].famille = "constructor";
  assert.doesNotThrow(() => analyze(d));
  assert.match(analyze(d)[0].issues.join(" "), /Famille/);
});
test("CSV is strict, atomic, reorderable and retains unknown values for human correction", () => {
  const d = seed(),
    csv = csvText(
      HEADERS,
      d.source.map((r) => HEADERS.map((k) => r[k])),
    );
  assert.deepEqual(parseArrival(csv), d.source);
  assert.throws(
    () => parseArrival(csv + "\n" + csv.split("\n")[1]),
    /dupliqué/,
  );
  assert.throws(() => parseArrival("id;id\n1;2"));
  const unknown = { ...d.source[0], famille: "non connue", taille: "????" };
  assert.equal(
    parseArrival(csvText(HEADERS, [HEADERS.map((k) => unknown[k])]))[0].taille,
    "????",
  );
  assert.deepEqual(d, seed());
});
test("restoration rejects malformed shapes, duplicate reviews and invalid alias targets", () => {
  const d = reviewed();
  assert.deepEqual(restore(JSON.stringify(d)), d);
  for (const field of ["reference", "taille", "famille"]) {
    const x = seed();
    x.source[0][field] = [];
    assert.throws(() => restore(x));
  }
  const duplicate = reviewed();
  duplicate.reviews.push(duplicate.reviews[0]);
  assert.throws(() => restore(duplicate));
  const invalid = mapped();
  invalid.aliases[0].size = "39–42";
  assert.throws(() => restore(invalid));
  const forged = reviewed();
  forged.source[0].visuel = "";
  assert.equal(analyze(restore(forged))[0].review, null);
});
test("identical arrivals preserve work; changed arrivals reset corrections and reviews", () => {
  const d = reviewed();
  assert.equal(replaceArrival(d, d.source, "identique.csv"), d);
  const next = structuredClone(d.source);
  next[0].visuel = "recu-v2.jpg";
  const n = replaceArrival(d, next, "v2.csv");
  assert.equal(n.reviews.length, 0);
  assert.equal(n.edits.length, 0);
  assert.equal(n.aliases.length, 1);
});
test("exports contain only whole reviewed products and escape formula and markup content", () => {
  const d = reviewed();
  assert.equal(outputRows(d).length, 3);
  assert.match(reportHtml(report(d)), /Produit relu/);
  const n = editRow(
    d,
    "L1",
    { ...d.source[0], visuel: "<img onerror=alert(1)>" },
    "Nom reçu",
  );
  const html = reportHtml(report(n));
  assert.ok(!html.includes("<img onerror"));
  assert.match(html, /&lt;img/);
  assert.match(csvText(["reference"], [["=cmd()"]]), /'=cmd/);
});

test("a 300-variant reviewed product with long Unicode fields survives JSON save and restore", () => {
  let d = seed();
  const long = 'é漢"'.repeat(100);
  d.source = Array.from({ length: 300 }, (_, i) => ({
    ...d.source[0],
    id: `R${i}`,
    reference: `REF-${i}`,
    couleur: `Couleur ${i}`,
    taille: "XL",
    titre: long,
    marque: long,
    licence: long,
    composition: long,
    visuel: long,
  }));
  d = reviewProduct(d, firstKey(d), "Revue des trois cents déclinaisons.");
  assert.equal(outputRows(d).length, 300);
  assert.equal(d.reviews[0].signature.length, 64);
  const serialized = JSON.stringify(d);
  assert.ok(new TextEncoder().encode(serialized).length < 16777216);
  assert.deepEqual(restore(serialized), d);
  assert.equal(outputRows(restore(serialized)).length, 300);
  const altered = editRow(
    d,
    "R299",
    { ...d.source[299], visuel: "nouveau.jpg" },
    "Nouveau fichier reçu.",
  );
  assert.equal(outputRows(altered).length, 0);
});

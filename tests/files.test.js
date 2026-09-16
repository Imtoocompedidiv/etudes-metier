import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv,
  csvText,
  reportHtml,
  readLocalFile,
} from "../src/shared/files.js";
test("CSV français, BOM, champs cités multilignes et guillemets échappés", () => {
  const p = parseCsv(
    '\uFEFFréf;désignation;qté\r\nA1;"Pièce; série \"\"A\"\"\nà vérifier";12\r\n',
  );
  assert.equal(p.delimiter, ";");
  assert.equal(p.rows[0]["désignation"], 'Pièce; série "A"\nà vérifier');
  assert.equal(p.rows[0]["qté"], "12");
});
test("séparateurs virgule et tabulation", () => {
  assert.equal(parseCsv("id,nom\n1,Test").delimiter, ",");
  assert.equal(parseCsv("id\tnom\n1\tTest").delimiter, "\t");
});
test("refuse imports tronqués, ambigus, champs surnuméraires et doublons", () => {
  for (const invalid of [
    "a;a\n1;2",
    "a;b\n1;2;3",
    'a;b\n1;"x',
    "a,b;c\n1,2;3",
    'a;b\n1;"x"z',
    "__proto__;b\na;b",
  ])
    assert.throws(() => parseCsv(invalid));
  assert.throws(
    () => parseCsv("a;b\n1;2", { requiredHeaders: ["id"] }),
    /manquante/,
  );
  assert.throws(() => parseCsv("a;b\n1;2\n3;4", { maxRows: 1 }), /dépasse/);
});
test("exports neutralisent les formules tableur et échappent les textes", () => {
  const csv = csvText(
    ["réf", "commentaire"],
    [
      ['=HYPERLINK("x")', "\n @SUM(1)"],
      ["A2", "Pièce; vis"],
    ],
  );
  const p = parseCsv(csv);
  assert.ok(p.rows[0]["réf"].startsWith("'="));
  assert.ok(p.rows[0]["commentaire"].startsWith("'"));
  assert.equal(p.rows[1].commentaire, "Pièce; vis");
  assert.equal(parseCsv(csvText(["avoir"], [[-125]])).rows[0].avoir, "-125");
});
test("rapport autonome ne peut exécuter le contenu du dossier", () => {
  const html = reportHtml({
    title: "<script>alert(1)</script>",
    sections: [
      {
        title: "Dossier",
        headers: ["x"],
        rows: [["<img src=x onerror=alert(1)>"]],
      },
    ],
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("@media print"));
});
test("limite d’import et détection binaire", async () => {
  await assert.rejects(
    readLocalFile({ size: 100, text: async () => "" }, { maxBytes: 50 }),
    /dépasse/,
  );
  await assert.rejects(
    readLocalFile({ size: 2, text: async () => "\u0000" }),
    /binaire/,
  );
});

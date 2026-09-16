import test from "node:test";
import assert from "node:assert/strict";
import {
  preflightXml,
  pathParts,
  compareStructures,
  normalize,
  seed,
  validContract,
} from "./model.js";

const element = (name, attrs = {}, children = [], text = "") => ({
  name,
  attrs: Object.entries(attrs).map(([name, value]) => ({ name, value })),
  children,
  text,
});
const trip = (id, zone = "France", price = "249.00") =>
  element("Trip", { Id: id, Name: "Séjour test", Region: zone }, [
    element("Segment", { Name: "Culture" }),
    element("Price", {}, [], price),
  ]);
const corrected = () => {
  const c = structuredClone(seed.contract);
  c.fields.zone.path = "@Region";
  return c;
};

test("DTD, entités, vide et limite sont refusés avant DOMParser", () => {
  for (const input of [
    "<!DOCTYPE a><a/>",
    '<!ENTITY x "test"><a/>',
    "",
    "x".repeat(200001),
  ])
    assert.throws(() => preflightXml(input));
  assert.equal(preflightXml("<a>&amp;</a>"), "<a>&amp;</a>");
});

test("chemins déterministes en notation Clark, sans XPath implicite", () => {
  assert.deepEqual(
    pathParts(
      "/{https://schema.example/travel}Catalog/{https://schema.example/travel}Trip",
      true,
    ),
    [
      "{https://schema.example/travel}Catalog",
      "{https://schema.example/travel}Trip",
    ],
  );
  for (const path of [
    "../Price",
    "//Price",
    "Segment[1]/@Name",
    "*/@Name",
    "@Id/Price",
  ])
    assert.throws(() => pathParts(path));
  const ns = "{https://schema.example/travel}";
  const c = corrected();
  c.recordPath = `/${ns}Catalog/${ns}Trip`;
  const node = trip("S1");
  node.name = `${ns}Trip`;
  assert.equal(
    normalize(element(`${ns}Catalog`, {}, [node]), c).rows.length,
    1,
  );
});

test("les répétitions ne multiplient pas les chemins structurels", () => {
  const before = element("Catalog", {}, [element("Trip", { Zone: "France" })]);
  const after = element("Catalog", {}, [
    element("Trip", { Region: "France" }),
    element("Trip", { Region: "Italie" }),
  ]);
  assert.deepEqual(compareStructures(before, after), {
    removed: ["/Catalog/Trip/@Zone"],
    added: ["/Catalog/Trip/@Region"],
    retained: ["/Catalog", "/Catalog/Trip"],
  });
});

test("le mapping corrigé normalise les centimes ; le mapping ancien conserve les exceptions", () => {
  const doc = element("Catalog", {}, [
    trip("S1"),
    trip("S2", "Italie", "389.50"),
  ]);
  assert.equal(normalize(doc, seed.contract).errors.length, 2);
  const result = normalize(doc, corrected());
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[1].values.price, 38950);
});

test("doublons, cardinalité, décimales et dépassements ne passent pas silencieusement", () => {
  const a = trip("DUP");
  a.children.push(element("Segment", { Name: "Nature" }));
  const b = trip("DUP", "France", "1.999");
  const c = trip("C", "France", "9007199254740992.00");
  const result = normalize(element("Catalog", {}, [a, b, c]), corrected());
  assert.equal(result.errors.filter((e) => e.field === "id").length, 2);
  assert.equal(result.errors.filter((e) => e.field === "segment").length, 1);
  assert.equal(result.errors.filter((e) => e.field === "price").length, 2);
});

test("le contrat garde un identifiant obligatoire et refuse une collection absente", () => {
  const c = corrected();
  c.fields.id.required = false;
  assert.equal(validContract(c), false);
  assert.match(normalize(element("Other"), corrected()).fatal, /Aucun objet/);
});

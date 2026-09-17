import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  allocate,
  analyzeLine,
  updateLine,
  updateLot,
  decide,
  review,
  restore,
  metersToCm,
  importCsv,
  report,
  allocationRows,
  decisionBasis,
  reviewBasis,
} from "./model.js";
const checks = {
  by: "Atelier fictif",
  consumption: true,
  pattern: true,
  material: true,
};
function readySecond() {
  let s = allocate(seed(), "L02", "B", 200);
  s = decide(
    s,
    "L02",
    "B",
    "accepted",
    "Accord fictif après comparaison des échantillons.",
  );
  return review(s, "L02", checks);
}
test("centimètres exacts et entrées numériques strictes", () => {
  assert.equal(metersToCm("0,29"), 29);
  assert.equal(metersToCm("1.10"), 110);
  for (const v of [
    "",
    "  ",
    [],
    [6],
    {},
    true,
    null,
    "1.111",
    "1e2",
    -2,
    "Infinity",
  ])
    assert.throws(() => metersToCm(v));
});
test("conservation des lots et besoin des lignes, mutation atomique", () => {
  const s = seed(),
    before = JSON.stringify(s);
  assert.throws(() => allocate(s, "L02", "A", 401), /lot A/);
  assert.throws(() => allocate(s, "L02", "B", 201), /plus que/);
  assert.equal(JSON.stringify(s), before);
  const t = allocate(s, "L02", "B", 200);
  assert.equal(analyzeLine(t, "L02").missing, 0);
  assert.ok(analyzeLine(t, "L02").blockers.some((x) => x.includes("écart")));
});
test("matière, réception et revue ne se déduisent pas du métrage", () => {
  let s = allocate(seed(), "L02", "B", 200);
  assert.throws(() => review(s, "L02", checks));
  assert.throws(() => decide(s, "L02", "B", "", "Choix encore en attente"));
  s = decide(
    s,
    "L02",
    "B",
    "rejected",
    "Teinte différente refusée par le prescripteur.",
  );
  assert.throws(() => review(s, "L02", checks));
  s = decide(
    s,
    "L02",
    "B",
    "accepted",
    "Teinte validée dans cet exemple fictif.",
  );
  s = updateLot(s, "B", { received: false });
  assert.throws(() => review(s, "L02", checks));
  assert.throws(() => review(seed(), "L01", { ...checks, pattern: false }));
});
test("modification pertinente invalide décisions et revue, autres lignes intactes", () => {
  let s = readySecond();
  s = review(s, "L01", checks);
  assert.equal(analyzeLine(s, "L02").reviewed, true);
  const t = updateLine(s, "L02", { quantity: 2 });
  assert.equal(t.decisions.length, 0);
  assert.equal(t.reviews.length, 1);
  assert.equal(t.reviews[0].lineId, "L01");
  const u = updateLot(s, "B", { dye: "S-03" });
  assert.equal(u.decisions.length, 0);
  assert.equal(u.reviews.length, 1);
  assert.throws(() => updateLot(s, "A", { totalCm: 999 }));
});
test("une réaffectation retire ses décisions obsolètes", () => {
  const s = readySecond(),
    t = allocate(s, "L02", "B", 0);
  assert.equal(t.decisions.length, 0);
  assert.equal(t.reviews.length, 0);
  assert.equal(analyzeLine(t, "L02").missing, 200);
});
test("imports ajout et mise à jour, identité stricte et absence de remise à zéro", () => {
  const s = seed();
  const t = importCsv(
    s,
    "lots",
    "id;reference;teinte;metres;recu\nC;Velours;V01;6;non",
  );
  assert.equal(t.lots.length, 3);
  assert.deepEqual(t.allocations, s.allocations);
  assert.throws(
    () =>
      importCsv(s, "lots", "id;reference;teinte;metres;recu\nA;Lin;S01;1;oui"),
    /pas assez/,
  );
  assert.throws(() =>
    importCsv(s, "lots", "id;reference;teinte;metres;recu\nC;Lin;S01;6;true"),
  );
  assert.throws(
    () =>
      importCsv(
        s,
        "lots",
        "id;reference;teinte;metres;recu\nC;Lin;S01;6;oui\nC;Lin;S01;6;oui",
      ),
    /doublon/,
  );
});
test("reprise JSON contrôle les liens et revues, pas de validation falsifiée ou ancienne", () => {
  const s = readySecond();
  assert.deepEqual(restore(JSON.stringify(s)), s);
  for (const change of [
    (x) => (x.lines[1].dye = "S03"),
    (x) => (x.reviews[0].pattern = false),
    (x) => (x.decisions[0].basis = "a".repeat(63)),
    (x) => (x.lots[0].received = "oui"),
    (x) => (x.lines[0].quantity = []),
  ]) {
    const t = structuredClone(s);
    change(t);
    assert.throws(() => restore(t));
  }
});
test("exports expliquent réserves et état courant sans prétendre ordre atelier", () => {
  const s = readySecond();
  assert.match(report(s).title, /brouillon/);
  const t = review(s, "L01", checks);
  assert.match(report(t).title, /préparation revue/);
  assert.equal(allocationRows(t).find((x) => x.lot === "B").metres, 2);
  assert.match(report(t).subtitle, /sans réservation/);
});

test("le dossier maximal reste réimportable sous la limite locale, même avec échappement JSON", () => {
  const fill = (length) => "\u0001".repeat(length);
  const s = {
    version: 1,
    lines: [],
    lots: [],
    allocations: [],
    decisions: [],
    reviews: [],
  };
  for (let i = 0; i < 100; i++) {
    s.lines.push({
      id: `L${i}`,
      order: fill(40),
      model: fill(100),
      quantity: 1,
      unitCm: 1000,
      ref: "A" + fill(99),
      dye: fill(60),
      finish: fill(100),
    });
    s.lots.push({
      id: `T${i}`,
      ref: "B" + fill(99),
      dye: fill(60),
      totalCm: 1000,
      received: true,
    });
  }
  for (let i = 0; i < 100; i++)
    for (let j = 0; j < 10; j++)
      s.allocations.push({
        lineId: `L${i}`,
        lotId: `T${(i + j) % 100}`,
        cm: 100,
      });
  s.decisions = s.allocations.map((a) => ({
    lineId: a.lineId,
    lotId: a.lotId,
    choice: "accepted",
    note: fill(500),
    basis: decisionBasis(s, a.lineId, a.lotId),
  }));
  s.reviews = s.lines.map((l) => ({
    lineId: l.id,
    basis: reviewBasis(s, l.id),
    by: fill(60),
    consumption: true,
    pattern: true,
    material: true,
  }));
  const serialized = JSON.stringify(s, null, 2);
  assert.ok(Buffer.byteLength(serialized, "utf8") < 5 * 1024 * 1024);
  assert.deepEqual(restore(serialized), s);
});

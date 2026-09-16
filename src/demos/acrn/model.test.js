import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  normalizeProject,
  dateDay,
  parseAssets,
  parseBookings,
  proposal,
  applyProposal,
  conflictsFor,
  planningRows,
  movements,
} from "./model.js";
test("parc vide rejeté avant import, locations vides permises sur un parc valide", () => {
  const before = JSON.stringify(seed);
  assert.throws(() => parseAssets([]), /au moins un appareil/);
  assert.throws(
    () => normalizeProject({ ...seed, assets: [], bookings: [] }),
    /au moins un appareil/,
  );
  assert.equal(JSON.stringify(seed), before);
  assert.deepEqual(normalizeProject({ ...seed, bookings: [] }).bookings, []);
});
test("prolongation franchit la validité, remplaçant évalué sur tout le séjour", () => {
  const p = proposal(seed, "LOC-104", "2026-09-27");
  assert.match(p.reasons.join(" "), /validité/);
  assert.equal(
    p.replacements.find((r) => r.asset.appareil === "CT-108").reasons.length,
    0,
  );
  assert.ok(
    p.replacements.find((r) => r.asset.appareil === "CT-112").reasons.length >
      0,
  );
  assert.throws(() => applyProposal(seed, "LOC-104", "2026-09-27"));
});
test("remplacement conserve la location et crée seulement la queue prolongée", () => {
  const next = applyProposal(seed, "LOC-104", "2026-09-27", "CT-108");
  assert.equal(
    next.bookings.find((b) => b.location === "LOC-104").fin,
    "2026-09-23",
  );
  assert.deepEqual(next.bookings.at(-1), {
    location: "LOC-104-R1",
    appareil: "CT-108",
    client: "Ateliers du Rivage",
    debut: "2026-09-24",
    fin: "2026-09-27",
  });
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(next))), next);
  assert.equal(conflictsFor(next, next.bookings.at(-1)).length, 0);
  assert.equal(seed.bookings.length, 6);
});
test("import refuse dates impossibles, appareil inconnu et identifiants dupliqués", () => {
  assert.throws(() => dateDay("2026-02-30"));
  assert.throws(() => parseAssets([seed.assets[0], seed.assets[0]]));
  assert.throws(() =>
    parseBookings([{ ...seed.bookings[0], appareil: "absent" }], seed.assets),
  );
  assert.throws(() =>
    parseBookings([{ ...seed.bookings[0], fin: "2026-09-01" }], seed.assets),
  );
});
test("date inconnue reste bloquante et transport est inclus dans le chevauchement", () => {
  const p = structuredClone(seed);
  p.assets[1].validite = "";
  assert.match(
    proposal(p, "LOC-104", "2026-09-27").replacements[0].reasons.join(" "),
    /inconnue/,
  );
  p.assets[1].validite = "2026-12-01";
  p.params.atelier = 10;
  assert.match(
    proposal(p, "LOC-104", "2026-09-27").replacements[0].reasons.join(" "),
    /Chevauchement/,
  );
});
test("exports reflètent décisions, paramètres et mouvements associés", () => {
  const next = applyProposal(seed, "LOC-104", "2026-09-27", "CT-108");
  const rows = planningRows(next);
  assert.equal(rows.length, 7);
  assert.equal(rows.at(-1).arrivee_atelier, "2026-09-29");
  assert.equal(rows.at(-1).disponible_au_plus_tot, "2026-10-03");
  assert.ok(
    movements(next).some(
      (m) => m.location === "LOC-104-R1" && m.date === "2026-09-29",
    ),
  );
  assert.throws(() =>
    normalizeProject({ ...next, params: { transport: "", atelier: 3 } }),
  );
});

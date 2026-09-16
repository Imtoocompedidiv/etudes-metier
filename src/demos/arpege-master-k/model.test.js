import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  normalizeProject,
  parseLines,
  parseReceipts,
  reconcile,
  upsertReceipt,
  updateLine,
  removeReceipt,
  caseSummaries,
} from "./model.js";
test("partial receipts accumulate by line and preserve other dossier quantities", () => {
  const next = upsertReceipt(seed, {
    reception: "REC-NEW",
    colis: "COL-NEW",
    date: "2026-09-17",
    ligne: "L-102",
    quantite: 1,
    commentaire: "",
  });
  assert.equal(reconcile(next).find((l) => l.ligne === "L-102").attendu, 1);
  assert.equal(reconcile(next).find((l) => l.ligne === "L-201").recu, 1);
  assert.equal(seed.receipts.length, 3);
  const final = upsertReceipt(next, {
    reception: "REC-NEW2",
    colis: "COL-NEW2",
    date: "2026-09-18",
    ligne: "L-102",
    quantite: 1,
    commentaire: "",
  });
  assert.equal(
    reconcile(final).find((l) => l.ligne === "L-102").statut,
    "Réception complète",
  );
  assert.equal(
    caseSummaries(final).find((c) => c.dossier === "R-2609-14").complete,
    false,
  );
});
test("physical receipt can be recorded with explicit acknowledgment but creates no authorization", () => {
  const raw = {
    reception: "EXCESS",
    colis: "COL-X",
    date: "2026-09-17",
    ligne: "L-103",
    quantite: 1,
  };
  assert.throws(() => upsertReceipt(seed, raw), /Confirmez/);
  const next = upsertReceipt(seed, raw, { acknowledge: true });
  const row = reconcile(next).find((l) => l.ligne === "L-103");
  assert.equal(row.autorisee, null);
  assert.equal(row.attendu, null);
  assert.equal(row.recu, 1);
  assert.match(row.points_a_verifier, /sans autorisation/);
  assert.throws(
    () => upsertReceipt(seed, { ...raw, ligne: "L-102", quantite: 4 }),
    /Confirmez/,
  );
  assert.equal(
    reconcile(
      upsertReceipt(
        seed,
        { ...raw, ligne: "L-102", quantite: 4 },
        { acknowledge: true },
      ),
    ).find((l) => l.ligne === "L-102").excedent,
    2,
  );
});
test("series duplicates are signaled across dossiers without merging requests or deliveries", () => {
  const rows = reconcile(seed);
  assert.match(
    rows.find((l) => l.ligne === "L-103").points_a_verifier,
    /L-301/,
  );
  assert.match(
    rows.find((l) => l.ligne === "L-301").points_a_verifier,
    /L-103/,
  );
  assert.equal(rows.length, 6);
  assert.equal(caseSummaries(seed).length, 4);
});
test("imports reject missing fields, empty inventory, bad dates, foreign lines and duplicate IDs atomically", () => {
  const before = JSON.stringify(seed);
  assert.throws(() => parseLines([]), /au moins/);
  assert.throws(
    () => parseLines([{ ...seed.lines[0], quantite: "" }]),
    /obligatoire/,
  );
  assert.throws(
    () => parseLines([{ ...seed.lines[0], autorisee: "" }]),
    /ensemble/,
  );
  assert.throws(() => parseLines([seed.lines[0], seed.lines[0]]), /double/);
  assert.throws(
    () =>
      parseReceipts([{ ...seed.receipts[0], date: "2026-02-30" }], seed.lines),
    /impossible/,
  );
  assert.throws(
    () =>
      parseReceipts([{ ...seed.receipts[0], ligne: "INCONNU" }], seed.lines),
    /absente/,
  );
  assert.throws(
    () =>
      parseReceipts(
        [seed.receipts[0], { ...seed.receipts[1], date: "2026-09-18" }],
        seed.lines,
      ),
    /deux dates/,
  );
  assert.equal(JSON.stringify(seed), before);
});
test("editing receipt replaces quantity rather than appending and removal restores its balance", () => {
  const edited = upsertReceipt(seed, { ...seed.receipts[1], quantite: 2 });
  assert.equal(edited.receipts.length, 3);
  assert.equal(reconcile(edited).find((l) => l.ligne === "L-102").recu, 2);
  const removed = removeReceipt(edited, seed.receipts[1].reception);
  assert.equal(reconcile(removed).find((l) => l.ligne === "L-102").recu, 0);
});
test("JSON and CSV-shaped records preserve quantities, null authorization and current corrected values", () => {
  const next = updateLine(seed, {
    ...seed.lines[2],
    serie: "DEMO-AFF-CORR",
    autorisation: "AUT-DEMO-114",
    autorisee: 1,
  });
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(next))), next);
  const asCsv = next.lines.map((l) =>
    Object.fromEntries(
      Object.entries(l).map(([k, v]) => [k, v === null ? "" : String(v)]),
    ),
  );
  assert.deepEqual(parseLines(asCsv), next.lines);
  assert.equal(reconcile(next).find((l) => l.ligne === "L-103").attendu, 1);
  assert.equal(
    reconcile(next).find((l) => l.ligne === "L-103").issues.length,
    0,
  );
});

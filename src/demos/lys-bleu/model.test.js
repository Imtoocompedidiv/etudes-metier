import test from "node:test";
import assert from "node:assert/strict";
import { csvText } from "../../shared/files.js";
import {
  seed,
  sixMonths,
  evaluate,
  setProposal,
  setPolicy,
  setDates,
  editRequest,
  review,
  restore,
  normalize,
  importCsv,
  invoiceRows,
  historyRows,
  outputRows,
  report,
  draftText,
  INVOICE_HEADERS,
  HISTORY_HEADERS,
  MAX_BYTES,
} from "./model.js";
const inv = (s) => s.invoices[0];
function ready() {
  let s = setProposal(seed(), "LB-260331", "LIV-01", 1);
  s = editRequest(s, "LB-260331", "LIV-03", {
    ...inv(s).request.lines[2],
    exception: {
      source: "Liste fictive libraires, édition de septembre 2026, LIV-03.",
      by: "Service commandes fictif",
      confirmed: true,
    },
  });
  return review(s, "LB-260331", {
    by: "Relecteur fictif",
    note: "Propositions limitées au plafond illustratif et aux livres déclarés neufs.",
  });
}
test("historical returns accumulate once and reduce the title ceiling with explicit rounding", () => {
  const s = seed(),
    e = evaluate(inv(s));
  assert.equal(e.previous, 5);
  assert.deepEqual(
    e.rows.map((r) => r.cap),
    [1, 3, 2],
  );
  assert.equal(e.blockers.length, 2);
  const ceil = setPolicy(s, "LB-260331", { ...inv(s).policy, round: "ceil" });
  assert.equal(evaluate(inv(ceil)).rows[0].cap, 2);
  assert.equal(sixMonths("2026-03-31"), "2026-09-30");
  assert.equal(sixMonths("2026-08-31"), "2027-02-28");
  assert.equal(sixMonths("2023-08-31"), "2024-02-29");
  assert.throws(() => sixMonths("2026-02-29"), /impossible/);
});
test("invoice ceiling is one shared pool and exceptions remove the title from its base", () => {
  let s = setPolicy(seed(), "LB-260331", {
    ...inv(seed()).policy,
    scope: "invoice",
  });
  let e = evaluate(inv(s));
  assert.equal(e.shared.remaining, 6);
  assert.equal(e.shared.proposed, 8);
  assert.match(e.blockers.join(), /commun dépassé de 2/);
  s = editRequest(s, "LB-260331", "LIV-03", {
    ...inv(s).request.lines[2],
    exception: {
      source: "Sélection fictive septembre, LIV-03.",
      by: "Service fictif",
      confirmed: true,
    },
  });
  e = evaluate(inv(s));
  assert.equal(e.shared.ordered, 17);
  assert.equal(e.shared.previous, 4);
  assert.equal(e.shared.remaining, 4);
  assert.equal(e.shared.proposed, 5);
  assert.equal(e.rows[2].cap, 5);
  s = setProposal(s, "LB-260331", "LIV-01", 1);
  assert.equal(evaluate(inv(s)).blockers.length, 0);
});
test("exception never bypasses the physical state or calendar and requires a real declaration", () => {
  const s = ready();
  assert.equal(evaluate(inv(s)).blockers.length, 0);
  assert.throws(
    () =>
      editRequest(s, "LB-260331", "LIV-03", {
        ...inv(s).request.lines[2],
        exception: { source: "Liste fictive", by: "Service", confirmed: false },
      }),
    /explicitement/,
  );
  const bad = editRequest(s, "LB-260331", "LIV-03", {
    ...inv(s).request.lines[2],
    newCount: 2,
    tagged: 1,
  });
  assert.match(evaluate(inv(bad)).blockers.join(), /déclarés neufs/);
  assert.equal(inv(bad).review, null);
  const late = setDates(s, "LB-260331", {
    date: "2026-10-01",
    receivedAt: null,
  });
  assert.match(evaluate(inv(late)).blockers.join(), /fenêtre/);
  assert.throws(
    () =>
      review(late, "LB-260331", {
        by: "Test",
        note: "Relecture fictive tardive",
      }),
    /empêchent/,
  );
});
test("deadline uses chosen event and boundary; missing reception and future history prevent review", () => {
  let s = seed(),
    second = s.invoices[1];
  assert.equal(evaluate(second).deadline, "2027-02-28");
  assert.equal(evaluate(second).blockers.length, 0);
  assert.equal(evaluate(second).rows[0].unknown, 1);
  s = setPolicy(s, second.id, { ...second.policy, boundary: "exclusive" });
  assert.match(evaluate(s.invoices[1]).blockers.join(), /fenêtre/);
  s = setPolicy(seed(), second.id, { ...second.policy, dateBasis: "receipt" });
  assert.match(evaluate(s.invoices[1]).blockers.join(), /fenêtre/);
  const missing = setPolicy(seed(), "LB-260331", {
    ...inv(seed()).policy,
    dateBasis: "receipt",
  });
  assert.match(evaluate(inv(missing)).blockers.join(), /réception/);
  const old = setDates(seed(), "LB-260331", {
    date: "2026-06-21",
    receivedAt: null,
  });
  assert.match(evaluate(inv(old)).blockers.join(), /postérieure/);
});
test("all material edits invalidate review, no-op keeps it, restore refuses stale or forged data", () => {
  const s = ready(),
    raw = JSON.stringify(s);
  assert.deepEqual(restore(raw), s);
  assert.deepEqual(setProposal(s, "LB-260331", "LIV-01", 1), s);
  assert.equal(inv(setProposal(s, "LB-260331", "LIV-01", 0)).review, null);
  assert.equal(
    inv(setPolicy(s, "LB-260331", { ...inv(s).policy, round: "ceil" })).review,
    null,
  );
  const forged = structuredClone(s);
  forged.invoices[0].request.lines[0].proposed = 0;
  assert.throws(() => restore(JSON.stringify(forged)), /version/);
  assert.throws(
    () => restore(raw.replace('"ordered":7', '"ordered":-1')),
    /Commandés/,
  );
  const extra = structuredClone(s);
  extra.secret = "x";
  assert.throws(() => normalize(extra), /structure/);
});
test("CSV upserts are atomic, idempotent and preserve absent lines and history", () => {
  const s = ready(),
    original = JSON.stringify(s),
    rows = historyRows(s);
  assert.deepEqual(importCsv(s, "history", csvText(HISTORY_HEADERS, rows)), s);
  const invalid = [
    ["LB-260331", "R-101", "LIV-01", "2026-06-20", 1],
    ["LB-260331", "R-BAD", "LIV-02", "2026-02-29", 1],
  ];
  assert.throws(
    () => importCsv(s, "history", csvText(HISTORY_HEADERS, invalid)),
    /impossible/,
  );
  assert.equal(JSON.stringify(s), original);
  const updated = importCsv(
    s,
    "history",
    csvText(HISTORY_HEADERS, [invalid[0]]),
  );
  assert.equal(inv(updated).history.length, 4);
  assert.equal(evaluate(inv(updated)).previous, 4);
  assert.equal(inv(updated).review, null);
  assert.throws(
    () => importCsv(s, "history", csvText(HISTORY_HEADERS, [rows[0], rows[0]])),
    /répété/,
  );
  assert.throws(
    () =>
      importCsv(
        s,
        "history",
        csvText(HISTORY_HEADERS, [
          ["LB-260331", "R-101", "LIV-02", "2026-06-20", 1],
        ]),
      ),
    /changer de titre/,
  );
  assert.throws(
    () =>
      importCsv(
        s,
        "history",
        csvText(HISTORY_HEADERS, [
          ["LB-260331", "NEW", "LIV-01", "2026-08-01", 9],
        ]),
      ),
    /cumulées/,
  );
});
test("invoice import clears an exception when its book changes and never hides inconsistent quantities", () => {
  const s = ready(),
    rows = invoiceRows(s);
  assert.deepEqual(importCsv(s, "invoices", csvText(INVOICE_HEADERS, rows)), s);
  const edit = [...rows[2]];
  edit[4] = "Un autre titre fictif";
  const changed = importCsv(s, "invoices", csvText(INVOICE_HEADERS, [edit]));
  assert.equal(inv(changed).request.lines[2].exception, null);
  assert.equal(inv(changed).review, null);
  assert.equal(inv(changed).lines.length, 3);
  const reduced = [...rows[0]];
  reduced[5] = 1;
  assert.throws(
    () => importCsv(s, "invoices", csvText(INVOICE_HEADERS, [reduced])),
    /cumulées/,
  );
  assert.throws(
    () =>
      importCsv(
        s,
        "invoices",
        csvText([...INVOICE_HEADERS, "colonne"], [[...rows[0], "x"]]),
      ),
    /inattendues/,
  );
  assert.throws(
    () =>
      editRequest(s, "LB-260331", "LIV-02", {
        ...inv(s).request.lines[1],
        newCount: 4,
      }),
    /détail de l’état/,
  );
});
test("exports reflect all current quantities and explanations without pretending to accept a return", () => {
  const s = ready(),
    rows = outputRows(inv(s));
  assert.deepEqual(
    rows.map((r) => r[10]),
    [1, 3, 3],
  );
  assert.match(rows[2][13], /LIV-03/);
  assert.match(draftText(inv(s)), /Aucun accord/);
  assert.equal(report(inv(s)).sections[3].rows.length, 4);
  assert.throws(() => outputRows(inv(seed())), /Relisez/);
  const changed = setProposal(s, "LB-260331", "LIV-01", 0);
  assert.throws(() => draftText(inv(changed)), /Relisez/);
});
test("canonical maximum-size accepted dossiers round trip and reject oversized input", () => {
  const base = ready(),
    large = { format: base.format, invoices: [] };
  for (let n = 0; n < 30; n++) {
    const i = structuredClone(base.invoices[0]);
    i.id = `F-${n}`;
    i.bookstore = "\\".repeat(180);
    i.review = null;
    i.lines = Array.from({ length: 30 }, (_, j) => ({
      id: `L-${j}`,
      title: "\\".repeat(180),
      ordered: 100000,
    }));
    i.history = Array.from({ length: 200 }, (_, j) => ({
      id: `H-${j}`,
      lineId: `L-${j % 30}`,
      date: "2026-06-20",
      quantity: 1,
    }));
    i.request.lines = i.lines.map((l) => ({
      lineId: l.id,
      requested: 1,
      newCount: 1,
      tagged: 0,
      damaged: 0,
      proposed: 1,
      exception: {
        source: "\\".repeat(300),
        by: "\\".repeat(60),
        confirmed: true,
      },
    }));
    large.invoices.push(i);
  }
  let s = normalize(large);
  for (const i of s.invoices)
    s = review(s, i.id, { by: "\\".repeat(60), note: "\\".repeat(500) });
  const raw = JSON.stringify(s, null, 2);
  assert.ok(new TextEncoder().encode(raw).length < MAX_BYTES);
  assert.deepEqual(restore(raw), s);
  assert.throws(() => restore(" ".repeat(MAX_BYTES + 1)), /supérieur/);
});

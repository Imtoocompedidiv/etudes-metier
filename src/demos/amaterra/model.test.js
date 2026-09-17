import test from "node:test";
import assert from "node:assert/strict";
import { csvText } from "../../shared/files.js";
import {
  seed,
  HEADERS,
  groupRows,
  supplies,
  changeGroup,
  issues,
  peak,
  checks,
  programmeKey,
  reviewKey,
  review,
  isReviewed,
  updateSettings,
  importGroups,
  restore,
  report,
  addGroup,
  removeGroup,
} from "./model.js";

function ready() {
  let s = structuredClone(seed);
  s = changeGroup(s, { ...s.groups[0], childCapacity: 20 });
  s = changeGroup(s, { ...s.groups[1], start: "10:45", childCapacity: 20 });
  s = changeGroup(s, { ...s.groups[2], adultAudience: true, adultPaper: 4 });
  s = updateSettings(s, { stocks: { ...s.stocks, paper120: 48 } });
  s.availability = programmeKey(s);
  return s;
}
test("paper is consumed per formula while tools follow overlapping intervals and turnaround", () => {
  assert.equal(supplies(seed)[0].required, 84);
  assert.equal(supplies(seed)[1].required, null);
  assert.equal(peak(seed, 1), 34);
  const moved = changeGroup(seed, { ...seed.groups[1], start: "10:45" });
  assert.equal(peak(moved, 1), 18);
  assert.equal(supplies(moved)[0].required, 84);
  assert.equal(issues(moved).filter((x) => x.ids.length === 2).length, 0);
  const short = changeGroup(seed, { ...seed.groups[1], start: "10:40" });
  assert.equal(peak(short, 1), 34);
  assert.match(
    issues(short).find((x) => x.ids.length === 2).text,
    /intervalle inférieur/,
  );
});
test("different artists and rooms can overlap; tools remain shared across venue and ratios round per group", () => {
  const s = changeGroup(seed, {
    ...seed.groups[1],
    artist: "Autre intervenant",
    room: "Autre salle",
    count: 17,
  });
  assert.equal(issues(s).filter((x) => x.ids.length === 2).length, 0);
  assert.equal(peak(s, 2), 17); // ceil(16/2) + ceil(17/2)
  const shorter = changeGroup(s, { ...s.groups[1], duration: 60 });
  assert.ok(issues(shorter).some((x) => /60 min prévues/.test(x.text)));
});
test("unknown child capacity, minimum age and adult limits are independent", () => {
  let s = changeGroup(seed, {
    ...seed.groups[0],
    youngest: 6,
    childCapacity: 15,
  });
  s = changeGroup(s, {
    ...s.groups[2],
    count: 13,
    adultPaper: 4,
    adultAudience: true,
  });
  assert.ok(issues(s).some((x) => /6 ans/.test(x.text)));
  assert.ok(issues(s).some((x) => /capacité déclarée de 15/.test(x.text)));
  assert.ok(issues(s).some((x) => /au-delà des 12/.test(x.text)));
  assert.equal(supplies(s)[1].required, 52);
});
test("review needs all checks; group change resets availability; stock change preserves it but resets review", () => {
  assert.throws(() => review(seed), /Résolvez/);
  const s = review(ready());
  assert.equal(isReviewed(s), true);
  assert.deepEqual(checks(s), []);
  const stock = updateSettings(s, { stocks: { ...s.stocks, paper160: 83 } });
  assert.equal(stock.availability, programmeKey(stock));
  assert.equal(isReviewed(stock), false);
  assert.ok(checks(stock).some((x) => /1 feuilles/.test(x)));
  const changed = changeGroup(s, { ...s.groups[1], count: 17 });
  assert.equal(changed.availability, "");
  assert.equal(changed.reviewed, "");
});
test("CSV round trip preserves groups including blanks; duplicates and invalid values reject without mutation", () => {
  const raw = csvText(HEADERS, groupRows(seed));
  assert.deepEqual(importGroups(raw, seed).groups, seed.groups);
  const before = JSON.stringify(seed),
    rows = groupRows(seed);
  rows.push(rows[0]);
  assert.throws(() => importGroups(csvText(HEADERS, rows), seed), /unique/);
  const bad = groupRows(seed);
  bad[0][5] = "";
  assert.throws(
    () => importGroups(csvText(HEADERS, bad), seed),
    /Participants/,
  );
  bad[0][5] = "1.5";
  assert.throws(
    () => importGroups(csvText(HEADERS, bad), seed),
    /Participants/,
  );
  bad[0][5] = "16";
  bad[0][3] = "23:30";
  assert.throws(() => importGroups(csvText(HEADERS, bad), seed), /journée/);
  assert.equal(JSON.stringify(seed), before);
});
test("JSON validates every group and setting; stale declarations cannot restore a reviewed preparation", () => {
  const s = review(ready());
  assert.deepEqual(restore(JSON.stringify(s)), s);
  const bad = structuredClone(s);
  bad.groups[1].count = 100;
  const restored = restore(JSON.stringify(bad));
  assert.equal(restored.availability, "");
  assert.equal(restored.reviewed, "");
  for (const value of [
    null,
    {},
    { ...s, date: "2026-02-31" },
    { ...s, stocks: { ...s.stocks, pencils: null } },
    { ...s, ratios: { ...s.ratios, pencils: 0 } },
  ])
    assert.throws(() => restore(JSON.stringify(value)));
  const forged = { ...s, stocks: { ...s.stocks, paper160: 0 } };
  forged.reviewed = reviewKey(forged);
  assert.equal(restore(JSON.stringify(forged)).reviewed, "");
});
test("exports reflect current values and retain all unresolved checks in a draft", () => {
  const draft = report(seed);
  assert.match(draft.subtitle, /Brouillon/);
  assert.ok(
    draft.sections
      .find((x) => x.title === "Réserves et déclarations")
      .paragraphs.some((x) => /chevauchement/.test(x)),
  );
  const readyState = review(ready());
  const final = report(readyState);
  assert.match(final.subtitle, /Préparation revue/);
  assert.equal(final.sections[1].rows.find((x) => x[0] === "Ciseaux")[1], 18);
  assert.equal(
    final.sections[1].rows.find((x) => x[0] === "Papier A4 120 g")[1],
    48,
  );
});
test("JSON numeric fields reject coerced collections and normalize only optional blanks", () => {
  for (const value of [[], [16], {}, true]) {
    const bad = structuredClone(seed);
    bad.groups[0].count = value;
    assert.throws(() => restore(JSON.stringify(bad)), /Participants/);
    bad.groups[0].count = 16;
    bad.groups[0].youngest = value;
    assert.throws(() => restore(JSON.stringify(bad)), /Âge minimum/);
    bad.groups[0].youngest = 8;
    bad.stocks.scissors = value;
    assert.throws(() => restore(JSON.stringify(bad)));
  }
  const blank = structuredClone(seed);
  blank.groups[0].youngest = "   ";
  blank.groups[0].childCapacity = "\t";
  blank.groups[0].adultPaper = "\n";
  const restored = restore(JSON.stringify(blank));
  assert.equal(restored.groups[0].youngest, null);
  assert.equal(restored.groups[0].childCapacity, null);
  assert.equal(restored.groups[0].adultPaper, null);
  blank.groups[0].count = "   ";
  assert.throws(() => restore(JSON.stringify(blank)), /Participants/);
  blank.groups[0].count = "16";
  assert.equal(restore(JSON.stringify(blank)).groups[0].count, 16);
});
test("add/remove bounded groups keep IDs unique and never empty the programme", () => {
  const s = addGroup(seed);
  assert.equal(s.groups.length, 4);
  assert.equal(s.groups[3].id, "G4");
  assert.equal(removeGroup(s, "G4").groups.length, 3);
  assert.throws(
    () => removeGroup({ ...s, groups: [s.groups[0]] }, "G1"),
    /au moins/,
  );
  let full = structuredClone(seed);
  while (full.groups.length < 30) full = addGroup(full);
  assert.throws(() => addGroup(full), /Maximum 30/);
});

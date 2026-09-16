import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  parseTime,
  formatTime,
  parseSrt,
  inspect,
  editCue,
  shiftCues,
  parseOffset,
  changeRules,
  acceptReading,
  canExport,
  srtText,
  reportRows,
  restore,
  importSrt,
} from "./model.js";
test("strict timestamp parsing and roundtrip", () => {
  assert.equal(parseTime("01:02:03,004"), 3723004);
  assert.equal(formatTime(3723004), "01:02:03,004");
  for (const s of [
    "00:62:00,000",
    "00:00:02.123",
    "-00:00:01,000",
    "04:00:00,000",
  ])
    assert.throws(() => parseTime(s));
});
test("seed identifies two affected overlap rows and one dense passage", () => {
  const rows = inspect(seed());
  assert.deepEqual(
    rows.filter((r) => r.hard.length).map((r) => r.cue.id),
    ["s3", "s4"],
  );
  assert.deepEqual(
    rows.filter((r) => r.warnings.length).map((r) => r.cue.id),
    ["s6"],
  );
  assert.equal(canExport(seed()), false);
});
test("corrected exports reparse and report original/current evidence", () => {
  let s = editCue(seed(), "s3", { end: 12600 });
  s = editCue(s, "s6", { text: "Les références sont vérifiées." });
  assert.equal(canExport(s), true);
  const parsed = parseSrt(srtText(s));
  assert.deepEqual(parsed, s.cues);
  assert.equal(reportRows(s)[2][2], "00:00:13,400");
  assert.equal(reportRows(s)[2][5], "00:00:12,600");
});
test("nested overlaps are all detected, not only adjacent entries", () => {
  const s = seed();
  s.cues = [
    { id: "s1", start: 0, end: 20000, text: "A" },
    { id: "s2", start: 1000, end: 2000, text: "B" },
    { id: "s3", start: 3000, end: 4000, text: "C" },
  ];
  assert.equal(inspect(s)[0].hard.length, 2);
  assert.equal(inspect(s)[2].hard.length, 1);
});
test("offset is atomic, preserves duration and refuses negative timestamps", () => {
  assert.equal(parseOffset("1.001"), 1001);
  assert.equal(parseOffset("-0.001"), -1);
  assert.throws(() => parseOffset("0.0001"));
  assert.throws(() => parseOffset(""));
  const s = seed(),
    before = structuredClone(s);
  assert.throws(() => shiftCues(s, ["s1", "s3"], -1000));
  assert.deepEqual(s, before);
  const moved = shiftCues(s, ["s3", "s4"], 500);
  assert.equal(moved.cues[2].end - moved.cues[2].start, 4400);
  assert.equal(moved.cues[3].start, 13100);
});
test("waiver is motivated, cannot hide overlap, and is invalidated by edits/rules", () => {
  let s = seed();
  assert.throws(() => acceptReading(s, "s3", "Chevauchement accepté"));
  assert.throws(() => acceptReading(s, "s6", "OK"));
  s = acceptReading(s, "s6", "Lecture orale doublée dans cet extrait.");
  assert.equal(inspect(s)[5].accepted, true);
  assert.equal(inspect(editCue(s, "s6", { end: 25400 }))[5].accepted, false);
  assert.equal(
    inspect(changeRules(s, { ...s.rules, maxCps: 18 }))[5].accepted,
    false,
  );
});
test("malformed/duplicated SRT import rejects atomically, reordered input stays blocked", () => {
  const s = seed(),
    before = structuredClone(s);
  assert.throws(() => importSrt(s, "1\n00:00:01,000 --> 00:00:00,000\nA"));
  assert.throws(() =>
    parseSrt(
      "1\n00:00:01,000 --> 00:00:02,000\nA\n\n1\n00:00:03,000 --> 00:00:04,000\nB",
    ),
  );
  assert.deepEqual(s, before);
  const imported = importSrt(
    s,
    "8\n00:00:03,000 --> 00:00:04,000\nA\n\n9\n00:00:01,000 --> 00:00:02,000\nB",
  );
  assert.match(inspect(imported)[1].hard.join(), /décroissant/);
  assert.equal(canExport(imported), false);
});
test("restore validates dossier structure and stale waiver remains inactive", () => {
  const s = acceptReading(
    seed(),
    "s6",
    "Texte ponctuel à valider par le relecteur.",
  );
  assert.equal(inspect(restore(JSON.stringify(s)))[5].accepted, true);
  s.cues[5].end += 100;
  assert.equal(inspect(restore(JSON.stringify(s)))[5].accepted, false);
  s.baseline.pop();
  assert.throws(() => restore(JSON.stringify(s)));
});

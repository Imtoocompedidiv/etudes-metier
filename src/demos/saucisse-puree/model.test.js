import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  normalize,
  restore,
  parseSrt,
  time,
  parseTime,
  editCue,
  shift,
  findings,
  importSrt,
  srt,
  markReview,
  reviewed,
  editBrief,
  attachMedia,
  signature,
  validDossier,
  report,
  addCue,
  removeCue,
} from "./model.js";
const fixed = () => editCue(seed, { ...seed.cues[2], end: 17500 });

test("SRT real round trip and strict syntax preserve multiline text and milliseconds", () => {
  const state = fixed();
  const raw = srt(state, "example-v1");
  assert.deepEqual(parseSrt(raw), state.cues);
  assert.equal(parseTime(time(3_600_000)), 3_600_000);
  const multiline = raw.replace(
    "Une bonne saucisse,",
    "Une bonne\r\nsaucisse,",
  );
  assert.equal(parseSrt(multiline)[0].text, "Une bonne\nsaucisse,");
  for (const bad of [
    "",
    "WEBVTT",
    raw.replace("00:00:00,500", "00:00:61,500"),
    raw.replace("2\r\n", "1\r\n"),
    raw.replace("Une bonne saucisse,", "<script>x</script>"),
  ])
    assert.throws(() => parseSrt(bad));
});
test("boundaries distinguish adjacent cues, overlaps, reverse times and clip overrun", () => {
  assert.equal(
    findings(seed, "example-v1").filter((x) => x.code === "outside").length,
    1,
  );
  const state = fixed();
  assert.deepEqual(findings(state, "example-v1"), []);
  const adjacent = editCue(state, { ...state.cues[1], start: 5000 });
  assert.ok(
    !findings(adjacent, "example-v1").some((x) => x.code === "overlap"),
  );
  const overlap = editCue(state, { ...state.cues[1], start: 4999 });
  assert.ok(findings(overlap, "example-v1").some((x) => x.code === "overlap"));
  const reverse = editCue(state, { ...state.cues[1], end: 4000 });
  assert.ok(findings(reverse, "example-v1").some((x) => x.code === "order"));
  assert.throws(() => srt(overlap, "example-v1"), /bloquantes/);
});
test("batch offset is atomic, bounded and invalidates review", () => {
  const state = markReview(
    fixed(),
    "example-v1",
    "Image et lecture vérifiées.",
  );
  assert.equal(reviewed(state, "example-v1"), true);
  assert.throws(() => shift(state, -501), /Aucun/);
  assert.throws(() => shift(state, 0.1));
  const shifted = shift(state, 500);
  assert.equal(shifted.cues[0].start, 1000);
  assert.equal(shifted.cues[2].end, 18000);
  assert.equal(shifted.review, null);
  assert.equal(state.cues[0].start, 500);
});
test("review is bound to content and media; restore drops stale signatures and attachment is required", () => {
  const state = markReview(fixed(), "example-v1", "Lecture vérifiée.");
  assert.deepEqual(restore(JSON.stringify(state)), state);
  assert.equal(attachMedia(state, state.media), state);
  assert.equal(reviewed(state, undefined), false);
  assert.throws(() => markReview(fixed(), undefined, "ok"));
  const stale = structuredClone(state);
  stale.cues[0].text = "Une autre livraison";
  assert.equal(restore(JSON.stringify(stale)).review, null);
  assert.equal(
    editBrief(state, { ...state.brief, maxDuration: 17 }).review,
    null,
  );
  assert.equal(
    attachMedia(state, { ...state.media, fingerprint: "a".repeat(64) }).review,
    null,
  );
  assert.notEqual(signature(stale), signature(state));
});
test("strict restoration rejects types, excessive values and unknown fields; canonical local cache only", () => {
  assert.equal(validDossier(seed), true);
  for (const change of [
    { brief: { ...seed.brief, readingRate: [20] } },
    { brief: { ...seed.brief, ratio: ["vertical"] } },
    { media: { ...seed.media, width: "540" } },
    { cues: [...seed.cues, seed.cues[0]] },
    { media: { ...seed.media, duration: Infinity } },
    { other: true },
    { cues: [{ ...seed.cues[0], text: "" }] },
  ])
    assert.throws(() => normalize({ ...seed, ...change }));
  assert.equal(
    validDossier({ ...seed, brief: { ...seed.brief, title: "  Test  " } }),
    false,
  );
  assert.throws(() => restore("{"));
});
test("compact review survives a full dossier with escaped long text", () => {
  const state = normalize({
    ...seed,
    brief: { ...seed.brief, maxDuration: 3600, readingRate: 80 },
    media: { ...seed.media, duration: 3_600_000 },
    cues: Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      start: i * 18000,
      end: (i + 1) * 18000,
      text: '"\\\n'.repeat(333) + "x",
    })),
  });
  const checked = markReview(
    state,
    "example-v1",
    "Lecture du dossier complet.",
  );
  assert.match(checked.review.snapshot, /^[a-f0-9]{64}$/);
  assert.deepEqual(restore(JSON.stringify(checked)), checked);
  assert.equal(reviewed(checked, "example-v1"), true);
  assert.throws(
    () =>
      normalize({
        ...checked,
        review: { ...checked.review, snapshot: "not-a-hash" },
      }),
    /Revue invalide/,
  );
});
test("reading counts Unicode code points without spaces; declared format and duration are checked", () => {
  let state = editCue(fixed(), {
    ...seed.cues[0],
    start: 0,
    end: 1000,
    text: "😀 ".repeat(21).trim(),
  });
  assert.ok(findings(state, "example-v1").some((f) => f.code === "reading"));
  state = editBrief(state, {
    ...state.brief,
    readingRate: 21,
    ratio: "carre",
    maxDuration: 17,
  });
  const list = findings(state, "example-v1");
  assert.ok(!list.some((f) => f.code === "reading"));
  assert.ok(list.some((f) => f.code === "ratio"));
  assert.ok(list.some((f) => f.code === "duration"));
});
test("exports contain the current data; SRT import and edits leave source unchanged", () => {
  const before = JSON.stringify(seed);
  const state = importSrt(seed, srt(fixed(), "example-v1"));
  assert.equal(state.cues[2].end, 17500);
  assert.equal(
    report(state, "example-v1").sections[1].rows[2][2],
    "00:00:17,500",
  );
  assert.throws(() => srt(state, undefined), /bloquantes/);
  assert.equal(JSON.stringify(seed), before);
  assert.equal(removeCue(addCue(state), 4).cues.length, 3);
  assert.throws(() => removeCue({ ...state, cues: [state.cues[0]] }, 1));
});

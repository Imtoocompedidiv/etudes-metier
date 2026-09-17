import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  story,
  inspect,
  revision,
  normalize,
  editNode,
  start,
  act,
  previous,
  replay,
  saveCheckpoint,
  resumeCheckpoint,
  reviewTrace,
  reviewed,
  parseImport,
  matrix,
  report,
  MAX_BYTES,
} from "./model.js";
const fixed = () => {
  const s = seed();
  return editNode(s, "priorite", {
    answers: s.story.nodes[1].answers.map((a) => ({ ...a, next: "debrief" })),
  });
};
const action = (s, kind, answer = null) => act(s, { kind, answer });
const completed = () =>
  action(
    action(
      action(action(start(fixed()), "continue"), "answer", "b"),
      "continue",
    ),
    "continue",
  );
test("loop and identical labels cannot inflate score or branch coverage", () => {
  let s = fixed();
  s = editNode(s, "priorite", {
    answers: s.story.nodes[1].answers.map((a) => ({
      ...a,
      label: "Même texte",
      next: a.id === "b" ? "priorite" : "debrief",
    })),
  });
  s = action(
    action(action(action(start(s), "continue"), "answer", "b"), "continue"),
    "answer",
    "a",
  );
  assert.equal(replay(s.story, s.run).points, 1);
  s = action(s, "continue");
  assert.equal(replay(s.story, s.run).answered, 1);
  assert.equal(
    matrix(s).filter((r) => r.answer && r.observed === "Parcourue").length,
    2,
  );
  const other = action(
    action(action(start(fixed()), "continue"), "answer", "a"),
    "continue",
  );
  assert.equal(
    matrix(other).find((r) => r.answer === "b").observed,
    "Non parcourue",
  );
});
test("graph identifies missing destination, unreachable screen and closed component", () => {
  assert.equal(inspect(seed().story).issues[0].kind, "missing-target");
  assert.equal(inspect(fixed().story).issues.length, 0);
  const s = fixed().story;
  s.nodes[2].next = "debrief";
  assert.ok(inspect(s).issues.some((x) => x.kind === "no-exit"));
  assert.ok(
    inspect(s).issues.some(
      (x) => x.node === "bilan" && x.kind === "unreachable",
    ),
  );
  s.entry = "absent";
  assert.ok(inspect(s).issues.some((x) => x.kind === "missing-entry"));
  assert.throws(() => start(seed()), /chemins/);
});
test("zero point answer is distinct from no answer and replacement does not accumulate", () => {
  let s = start(fixed());
  assert.equal(replay(s.story, s.run).answered, 0);
  s = action(s, "continue");
  assert.throws(() => action(s, "continue"), /Choisissez/);
  s = action(s, "answer", "b");
  let r = replay(s.story, s.run);
  assert.equal(r.answered, 1);
  assert.equal(r.points, 0);
  assert.equal(r.maximum, 1);
  s = action(s, "answer", "a");
  r = replay(s.story, s.run);
  assert.equal(r.points, 1);
  assert.equal(r.answered, 1);
  s = action(s, "answer", "a");
  assert.equal(replay(s.story, s.run).points, 1);
});
test("completed trace and branch coverage remain descriptive and replayable", () => {
  const s = completed(),
    r = replay(s.story, s.run);
  assert.equal(r.completed, true);
  assert.equal(r.points, 0);
  assert.equal(matrix(s).find((x) => x.answer === "b").observed, "Parcourue");
  assert.equal(
    matrix(s).find((x) => x.answer === "a").observed,
    "Non parcourue",
  );
  assert.throws(() => action(s, "continue"), /terminé/);
  const reviewedState = reviewTrace(s);
  assert.equal(reviewed(reviewedState), true);
  assert.equal(reviewed(previous(reviewedState)), false);
  assert.ok(report(reviewedState).subtitle.includes("relue"));
});
test("checkpoint restores answers and position; an edit invalidates both traces", () => {
  let s = action(action(start(fixed()), "continue"), "answer", "a");
  s = saveCheckpoint(s);
  s = action(s, "continue");
  assert.equal(replay(s.story, s.run).current, "debrief");
  s = resumeCheckpoint(s);
  assert.equal(replay(s.story, s.run).current, "priorite");
  assert.equal(replay(s.story, s.run).points, 1);
  const old = s.run;
  s = editNode(s, "priorite", { body: "Question changée" });
  assert.equal(s.run, null);
  assert.equal(s.checkpoint, null);
  assert.throws(() => parseImport(JSON.stringify(old), s), /autre version/);
});
test("strict imports reject duplicate IDs, unknown actions, forged score and impossible chronology", () => {
  const s = fixed();
  const dup = structuredClone(s.story);
  dup.nodes[1].id = "accueil";
  assert.throws(() => story(dup), /dupliqué/);
  assert.throws(
    () =>
      normalize({
        ...s,
        run: {
          format: "h3-run-v1",
          revision: revision(s.story),
          actions: [{ kind: "answer", answer: "a" }],
        },
      }),
    /hors/,
  );
  const run = start(s).run;
  assert.throws(
    () => parseImport(JSON.stringify({ ...run, points: 50 }), s),
    /structure/,
  );
  assert.throws(() => parseImport("{", s));
  assert.throws(
    () => parseImport(JSON.stringify({ ...s, unknown: 1 }), s),
    /structure/,
  );
});
test("roundtrip exact and unchanged edit preserve review, stale review is stripped", () => {
  const s = reviewTrace(completed());
  assert.deepEqual(parseImport(JSON.stringify(s, null, 2), seed()), s);
  assert.equal(
    reviewed(editNode(s, "priorite", { body: s.story.nodes[1].body })),
    true,
  );
  const wrong = { ...s, review: "a".repeat(64) };
  assert.equal(parseImport(JSON.stringify(wrong), seed()).review, null);
  assert.equal(parseImport(JSON.stringify(s.story), s).review, s.review);
});
test("bounds prevent giant traces and malformed schema without executing imported content", () => {
  let s = fixed();
  s.story.nodes[1].body = "<script>alert(1)</script>";
  assert.ok(story(s.story).nodes[1].body.includes("<script>"));
  s = action(start(s), "continue");
  assert.throws(
    () =>
      normalize({
        ...s,
        run: {
          ...s.run,
          actions: Array.from({ length: 201 }, () => ({
            kind: "answer",
            answer: "a",
          })),
        },
      }),
    /200/,
  );
  assert.throws(() => parseImport(" ".repeat(MAX_BYTES + 1), s), /4 Mo/);
  assert.throws(
    () =>
      story({
        ...s.story,
        nodes: [
          {
            ...s.story.nodes[1],
            answers: s.story.nodes[1].answers.map((a) => ({
              ...a,
              points: 0.1,
            })),
          },
        ],
      }),
    /entier/,
  );
});
test("maximum text escapes fit canonical budget and restore under the same reader limit", () => {
  const nodes = Array.from({ length: 40 }, (_, i) => ({
    id: "p" + i,
    type: i === 39 ? "end" : "page",
    title: "x".repeat(120),
    body: "\u0000".repeat(3000),
    next: i === 39 ? null : "p" + (i + 1),
    answers: [],
  }));
  const s = normalize({
    ...seed(),
    story: {
      format: "h3-story-v1",
      title: "t".repeat(160),
      entry: "p0",
      nodes,
    },
  });
  const raw = JSON.stringify(s, null, 2);
  assert.ok(new TextEncoder().encode(raw).length > 700000);
  assert.deepEqual(parseImport(raw, seed()), s);
});

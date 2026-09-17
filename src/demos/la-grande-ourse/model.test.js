import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  normalize,
  restore,
  valid,
  issues,
  allIssues,
  choose,
  edit,
  review,
  isReviewed,
  changeValues,
  missingKeys,
  restoreKeys,
  dictionary,
  canExport,
  preview,
  report,
  interpolate,
  validEmail,
  MAX_JSON_BYTES,
} from "./model.js";

test("strict catalogue rejects duplicates, coerced values and altered component contract", () => {
  assert.equal(valid(seed), true);
  for (const changes of [
    { messages: [...seed.messages, seed.messages[0]] },
    { values: [] },
    { messages: [{ ...seed.messages[0], limit: "45" }] },
    { messages: [{ ...seed.messages[4], variables: [] }] },
    { extra: true },
  ])
    assert.throws(() => normalize({ ...seed, ...changes }));
  assert.throws(() => restore("{"));
  assert.deepEqual(restore(JSON.stringify(seed)), seed);
});
test("required variables, syntax and unknown variables are concrete distinct findings", () => {
  assert.deepEqual(
    issues(seed, seed.messages[4]).map((f) => f.code),
    ["missing"],
  );
  let s = choose(seed, "booking.error", "B");
  assert.equal(allIssues(s).length, 0);
  s = edit(s, "booking.error", {
    variants: [{ id: "A", text: "{email} {intrus} {Email} {" }],
    selected: "A",
  });
  assert.deepEqual(
    issues(s, s.messages[4]).map((f) => f.code),
    ["syntax", "unexpected", "value"],
  );
  assert.equal(
    interpolate("{email}", { email: "<script>{intrus}</script>" }),
    "<script>{intrus}</script>",
  );
});
test("limits count Unicode code points after substitution; exact equality passes", () => {
  let s = choose(seed, "booking.error", "B");
  s = edit(s, "booking.error", {
    variants: [{ id: "A", text: "{email}😀" }],
    selected: "A",
    limit: 3,
  });
  s = changeValues(s, { email: "éé" });
  assert.deepEqual(issues(s, s.messages[4]), []);
  s = changeValues(s, { email: "ééé" });
  assert.equal(issues(s, s.messages[4])[0].code, "length");
});
test("review binds context, alternatives, chosen version and test values; stale restoration clears it", () => {
  let s = review(
    choose(seed, "booking.error", "B"),
    "booking.error",
    "Relu en erreur.",
  );
  assert.equal(isReviewed(s, s.messages[4]), true);
  assert.deepEqual(restore(JSON.stringify(s)), s);
  assert.equal(
    edit(s, "booking.error", { context: "Nouveau contexte." }).messages[4]
      .review,
    null,
  );
  assert.equal(choose(s, "booking.error", "A").messages[4].review, null);
  assert.equal(
    changeValues(s, { email: "test@example.invalid" }).messages[4].review,
    null,
  );
  const stale = structuredClone(s);
  stale.messages[4].variants[0].text = "Variante modifiée";
  assert.equal(normalize(stale).messages[4].review, null);
});
test("missing system keys remain visible and restorable, and block a partial dictionary", () => {
  const s = normalize({
    ...seed,
    messages: seed.messages.filter((m) => m.key !== "booking.success"),
  });
  assert.deepEqual(missingKeys(s), ["booking.success"]);
  assert.match(preview(s, "booking.success"), /manquant/);
  assert.throws(() => dictionary(s));
  assert.equal(missingKeys(restoreKeys(s)).length, 0);
});
test("dictionary exports current raw placeholders only after every message is reviewed", () => {
  let s = choose(seed, "booking.error", "B");
  assert.throws(() => dictionary(s));
  for (const m of s.messages) s = review(s, m.key, "Lecture déclarée.");
  assert.equal(canExport(s), true);
  assert.equal(
    dictionary(s)["booking.error"],
    "Vérifiez {email}, puis réessayez.",
  );
  assert.equal(
    preview(s, "booking.error"),
    "Vérifiez lea.exemple, puis réessayez.",
  );
  assert.match(report(s).sections[1].rows[4][5], /déclarée/);
  assert.equal(seed.messages[4].selected, "A");
});
test("review hashes stay compact for large escaped catalogues; e-mail simulation is bounded syntax only", () => {
  const s = normalize({
    ...seed,
    messages: [
      {
        ...seed.messages[0],
        variants: [{ id: "A", text: '"\\\n'.repeat(600) }],
        limit: 2000,
      },
    ],
  });
  const checked = review(s, "booking.title", "Essai local.");
  assert.equal(checked.messages[0].review.snapshot.length, 64);
  assert.deepEqual(restore(JSON.stringify(checked)), checked);
  assert.equal(validEmail("lea.exemple"), false);
  assert.equal(validEmail("lea@example.invalid"), true);
});

test("maximum canonical catalogues round-trip including escaped UTF-16 and review metadata", () => {
  for (const token of ["\ud800", "\udc00", '\\"\n', "😀"]) {
    const long = (n) => token.repeat(Math.ceil(n / token.length)).slice(0, n);
    let s = normalize({
      version: 1,
      values: Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [
          i ? `v${i}` : "email",
          long(200),
        ]),
      ),
      messages: Array.from({ length: 40 }, (_, i) => ({
        key: `custom.m${String(i).padStart(2, "0")}${"a".repeat(70)}`,
        context: long(500),
        action: long(300),
        variables: [],
        limit: 2000,
        variants: ["A", "B", "C", "D"].map((id) => ({ id, text: long(2000) })),
        selected: "A",
        review: null,
      })),
      journal: [],
    });
    for (const m of s.messages) s = review(s, m.key, long(250));
    s = normalize({
      ...s,
      journal: Array.from({ length: 40 }, () => long(250)),
    });
    const raw = JSON.stringify(s, null, 2);
    assert.ok(Buffer.byteLength(raw) < MAX_JSON_BYTES);
    if (token === "\ud800" || token === "\udc00")
      assert.ok(raw.length > 1_000_000);
    assert.deepEqual(restore(raw), s);
    assert.ok(s.messages.every((m) => isReviewed(s, m)));
  }
  assert.throws(() => restore(" ".repeat(MAX_JSON_BYTES + 1)), /4 Mio/);
  assert.throws(() => restore("é".repeat(MAX_JSON_BYTES / 2 + 1)), /4 Mio/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  parseEdition,
  validateEdition,
  moveBlock,
  emailHtml,
  delivery,
  plainText,
} from "./model.js";
const fixed = () => ({
  ...seed,
  blocks: seed.blocks.map((b) =>
    b.id === "cour" ? { ...b, url: "https://example.com/cour" } : { ...b },
  ),
});
test("missing destination is linked to the correct block and gates delivery", () => {
  assert.deepEqual(
    validateEdition(seed).map((i) => i.blockId),
    ["cour"],
  );
  assert.throws(() => delivery(seed, "html"), /Complétez/);
  assert.deepEqual(validateEdition(fixed()), []);
});
test("reordering preserves data and changes both output formats", () => {
  const moved = moveBlock(fixed(), "cour", -1);
  assert.equal(moved.blocks[0].id, "cour");
  assert.ok(
    emailHtml(moved).indexOf("Une cour") <
      emailHtml(moved).indexOf("Un atelier"),
  );
  assert.ok(
    plainText(moved).indexOf("Une cour") <
      plainText(moved).indexOf("Un atelier"),
  );
  assert.equal(moveBlock(moved, "cour", -1), moved);
});
test("import validates the structural contract and does not accept duplicate IDs", () => {
  assert.deepEqual(parseEdition(JSON.stringify(seed)), seed);
  assert.throws(() => parseEdition("{"), /mal formé/);
  assert.throws(
    () =>
      parseEdition(
        JSON.stringify({ ...seed, blocks: [seed.blocks[0], seed.blocks[0]] }),
      ),
    /dupliqué/,
  );
  assert.throws(
    () => parseEdition(JSON.stringify({ ...seed, intro: {} })),
    /intro/,
  );
});
test("imported markup is text, unsafe links are gated, preview contains a restrictive policy", () => {
  const value = fixed();
  value.blocks[0].title = "<script>alert(1)</script>";
  value.blocks[0].url = "javascript:alert(1)";
  const html = emailHtml(value, { preview: true });
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes("Content-Security-Policy"));
  assert.ok(validateEdition(value).some((i) => i.field === "url"));
});
test("HTML uses inline styles and table layout without stylesheets or scripts", () => {
  const html = delivery(fixed(), "html");
  assert.ok(html.includes('role="presentation"'));
  assert.ok(html.includes('style="'));
  assert.ok(!/<style\b|<link\b|<script\b/i.test(html));
  assert.ok(html.includes("Gérer mon abonnement"));
});
test("preview links cannot navigate while the exported email keeps its destinations", () => {
  const preview = emailHtml(fixed(), { preview: true });
  assert.ok(!/\shref\s*=/i.test(preview));
  assert.equal((preview.match(/aria-disabled="true"/g) || []).length, 4);
  assert.ok(emailHtml(fixed()).includes('href="https://example.com/cour"'));
  assert.ok(emailHtml(fixed()).includes('href="https://example.com/preferences"'));
  assert.throws(() => parseEdition(JSON.stringify({ ...seed, edition: "__proto__" })), /inconnue/);
});

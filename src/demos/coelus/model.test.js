import test from "node:test";
import assert from "node:assert/strict";
import {
  initial,
  compare,
  saveTarget,
  removeTarget,
  acceptDifference,
  revoke,
  normalizeInventory,
  normalizeDossier,
  normalizeResource,
  parseJson,
  validDossier,
  diffRows,
} from "./model.js";
const find = (d, key) => compare(d).find((r) => r.key === key);
test("Sept ressources comparées par type et identifiant ; absence distincte des nombres nuls", () => {
  const rows = compare(initial);
  assert.equal(rows.length, 7);
  assert.equal(rows.filter((r) => r.status === "same").length, 3);
  assert.equal(rows.filter((r) => r.status !== "same").length, 4);
  const d = saveTarget(initial, {
    type: "bucket",
    id: "medias",
    objects: 0,
    bytes: 0,
    public: false,
  });
  assert.equal(find(d, "bucket:medias").status, "different");
  assert.deepEqual(find(d, "bucket:medias").diffs, ["objects", "bytes"]);
  assert.equal(find(initial, "bucket:medias").status, "missing");
  assert.equal(initial.target.resources.length, 6);
});
test("Éditer et retirer la cible conserve la source et recalcule chaque attribut", () => {
  const source = initial.source.resources.find((r) => r.type === "bucket");
  const added = saveTarget(initial, source);
  assert.equal(find(added, "bucket:medias").status, "same");
  assert.equal(
    find(removeTarget(added, "bucket:medias"), "bucket:medias").status,
    "missing",
  );
  const extra = saveTarget(initial, {
    type: "table",
    id: "private.extra",
    rows: 0,
    rls: false,
  });
  assert.equal(find(extra, "table:private.extra").status, "extra");
  assert.equal(
    find(
      saveTarget(initial, { type: "provider", id: "google", enabled: true }),
      "provider:google",
    ).status,
    "same",
  );
});
test("Un écart accepté reste exporté et toute différence d’attribut invalide sa justification", () => {
  const d = acceptDifference(
    initial,
    "table:public.orders",
    "Trois commandes de test sont exclues de la reprise.",
  );
  assert.equal(find(d, "table:public.orders").decisionStatus, "accepted");
  assert.ok(diffRows(d).some((r) => r[6] === "Accepté"));
  const changed = saveTarget(d, {
    type: "table",
    id: "public.orders",
    rows: 1238,
    rls: true,
  });
  assert.equal(find(changed, "table:public.orders").decisionStatus, "stale");
  assert.equal(changed.decisions[0].target.rows, 1237);
  assert.equal(
    find(revoke(d, "table:public.orders"), "table:public.orders")
      .decisionStatus,
    "pending",
  );
  assert.throws(
    () => acceptDifference(initial, "table:public.products", "Pourquoi"),
    /écart/,
  );
  assert.throws(() => acceptDifference(initial, "bucket:medias", " "), /Texte/);
});
test("Import borné sans propriétés cachées, secrets, doublons ni nombres imprécis", () => {
  assert.throws(
    () => normalizeInventory({ ...initial.source, service_role: "secret" }),
    /Champ non admis/,
  );
  assert.throws(
    () =>
      normalizeInventory({
        ...initial.source,
        resources: [...initial.source.resources, initial.source.resources[0]],
      }),
    /répétée/,
  );
  for (const rows of [-1, 1.2, 1e12 + 1, "1", NaN])
    assert.throws(
      () => normalizeResource({ type: "table", id: "x", rows, rls: true }),
      /entier/,
    );
  assert.throws(
    () =>
      normalizeResource({
        type: "bucket",
        id: "x",
        objects: 0,
        bytes: 0,
        public: "false",
      }),
    /booléen/,
  );
  assert.throws(
    () =>
      normalizeResource({
        type: "function",
        id: "x",
        revision: "a",
        token: "abc",
      }),
    /non admis/,
  );
});
test("Analyse JSON refuse les clés répétées, y compris échappées, et reste fidèle aux chaînes", () => {
  assert.deepEqual(parseJson(JSON.stringify(initial)), initial);
  assert.deepEqual(parseJson(' {"x":[true,false,null,-1.2e3,"a\\n\\\"b"]} '), {
    x: [true, false, null, -1200, 'a\n"b'],
  });
  for (const raw of [
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"__proto__":{}}',
    '{"x":1,}',
    "[1,]",
    '{"x":01}',
    "{} fin",
    "\u00a0{}",
  ])
    assert.throws(() => parseJson(raw));
  assert.throws(
    () => parseJson("[".repeat(20) + "0" + "]".repeat(20)),
    /imbriqué/,
  );
});
test("Restauration canonique et décisions doublonnées ou ressources non concordantes refusées", () => {
  const d = acceptDifference(
    initial,
    "bucket:medias",
    "Reprise des médias dans un lot séparé.",
  );
  assert.deepEqual(normalizeDossier(parseJson(JSON.stringify(d))), d);
  assert.equal(validDossier(d), true);
  assert.equal(validDossier({ ...d, unexpected: "x" }), false);
  assert.throws(
    () =>
      normalizeDossier({ ...d, decisions: [...d.decisions, ...d.decisions] }),
    /ambiguë/,
  );
  assert.throws(
    () =>
      normalizeDossier({
        ...d,
        decisions: [{ ...d.decisions[0], key: "table:wrong" }],
      }),
    /ambiguë/,
  );
  assert.equal(validDossier({ ...d, journal: [{}] }), false);
});

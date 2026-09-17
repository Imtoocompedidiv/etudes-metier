import { parseCsv, escapeHtml } from "../../shared/files.js";

export const HEADERS = [
  "id",
  "indicateur",
  "unite",
  "perimetre",
  "annee",
  "definition",
  "denominateur",
  "valeur",
  "source",
];
export const UNITS = {
  nombre: "nombre",
  lieux: "lieux",
  jours: "jours",
  pourcentage: "%",
};
const clone = (x) => structuredClone(x);
const clean = (x, label, max = 160, optional = false) => {
  const s = String(x ?? "").trim();
  if ((!s && !optional) || s.length > max)
    throw Error(
      `${label} : ${optional ? "texte trop long" : "valeur requise ou trop longue"}.`,
    );
  return s;
};
const code = (x) => {
  const s = clean(x, "Identifiant", 40);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(s))
    throw Error(
      "Identifiant : lettres, chiffres, point, tiret ou soulignement.",
    );
  return s;
};
const year = (x) => {
  if (!/^\d{4}$/.test(String(x)) || +x < 1990 || +x > 2100)
    throw Error("Année attendue entre 1990 et 2100.");
  return +x;
};
const norm = (x) =>
  String(x)
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
export function row(input) {
  const unite = clean(input.unite, "Unité");
  if (!Object.hasOwn(UNITS, unite))
    throw Error("Unité attendue : nombre, lieux, jours ou pourcentage.");
  const v = String(input.valeur ?? "")
    .trim()
    .replace(",", ".");
  if (v && !/^\d+(\.\d{1,4})?$/.test(v))
    throw Error(
      "Valeur positive, avec au plus quatre décimales ; laisser vide si inconnue.",
    );
  const valeur = v === "" ? null : Number(v);
  if (
    valeur !== null &&
    (valeur > 1e9 ||
      ((unite === "nombre" || unite === "lieux") &&
        !Number.isInteger(valeur)) ||
      (unite === "pourcentage" && valeur > 100))
  )
    throw Error("Valeur hors limites de son unité.");
  return {
    id: code(input.id),
    indicateur: clean(input.indicateur, "Indicateur"),
    unite,
    perimetre: clean(input.perimetre, "Périmètre"),
    annee: year(input.annee),
    definition: clean(input.definition, "Définition", 700),
    denominateur: clean(input.denominateur, "Dénominateur", 200, true),
    valeur,
    source: clean(input.source, "Source", 240),
  };
}
export function rows(list) {
  if (!Array.isArray(list) || !list.length || list.length > 200)
    throw Error("La source doit contenir entre 1 et 200 lignes.");
  const result = list.map(row);
  if (new Set(result.map((x) => x.id)).size !== result.length)
    throw Error("Identifiant de source dupliqué.");
  return result;
}
export function parseSource(text) {
  const parsed = parseCsv(text, { requiredHeaders: HEADERS, maxRows: 200 });
  return rows(parsed.rows);
}
const make = (
  id,
  indicateur,
  unite,
  valeur,
  annee,
  perimetre = "8 communes",
  definition = indicateur,
  denominateur = "",
) =>
  row({
    id,
    indicateur,
    unite,
    valeur,
    annee,
    perimetre,
    definition,
    denominateur,
    source: `Tableau fictif ${annee}.csv`,
  });
export const seed = () => ({
  schema: "espacite-comparison-v1",
  expected: { left: 2024, right: 2025 },
  sources: {
    left: [
      make("A01", "Demandes enregistrées", "nombre", 1240, 2024),
      make("A02", "Permanences d’accueil", "lieux", 12, 2024),
      make("A03", "Rendez-vous tenus", "nombre", 0, 2024),
      make("A04", "Délai médian", "jours", 17, 2024),
    ],
    right: [
      make("B01", "Demandes enregistrées", "nombre", 1395, 2025),
      make("B02", "Permanences d’accueil", "lieux", 18, 2025, "10 communes"),
      make("B03", "Rendez-vous tenus", "nombre", 24, 2025),
      make("B04", "Délai médian", "jours", null, 2025),
    ],
  },
  edits: [],
  pairs: [1, 2, 3, 4].map((n) => ({
    id: `C${n}`,
    left: `A0${n}`,
    right: `B0${n}`,
  })),
  reviews: {},
  journal: [],
});
export function current(d, side, id) {
  const original = d.sources[side].find((r) => r.id === id);
  if (!original) return null;
  return (
    d.edits.filter((e) => e.side === side && e.id === id).at(-1)?.after ||
    original
  );
}
function context(d, p) {
  return {
    left: current(d, "left", p.left),
    right: current(d, "right", p.right),
    expected: d.expected,
    pair: p,
  };
}
export function fingerprint(d, p) {
  return JSON.stringify(context(d, p));
}
export function compare(d, p) {
  const { left: a, right: b } = context(d, p),
    issues = [];
  if (!a) issues.push("Ligne de référence absente");
  if (!b) issues.push("Ligne d’actualisation absente");
  if (a && b) {
    if (a.annee !== d.expected.left || b.annee !== d.expected.right)
      issues.push("Millésime inattendu");
    if (a.unite !== b.unite) issues.push("Unité différente");
    if (norm(a.perimetre) !== norm(b.perimetre))
      issues.push("Périmètre différent");
    if (norm(a.definition) !== norm(b.definition))
      issues.push("Définition différente");
    if (norm(a.denominateur) !== norm(b.denominateur))
      issues.push("Dénominateur différent");
    if (
      (a.unite === "pourcentage" || b.unite === "pourcentage") &&
      (!a.denominateur || !b.denominateur)
    )
      issues.push("Dénominateur non précisé");
    if (a.valeur === null || b.valeur === null) issues.push("Valeur absente");
  }
  const compatible = !issues.length,
    delta = compatible ? Number((b.valeur - a.valeur).toFixed(4)) : null;
  const relative =
    compatible && a.valeur !== 0 && a.unite !== "pourcentage"
      ? Number(((delta / a.valeur) * 100).toFixed(4))
      : null;
  const raw = d.reviews[p.id],
    review = raw?.fingerprint === fingerprint(d, p) ? raw : null;
  const status = review
    ? review.kind === "include"
      ? "Comparaison relue"
      : "Écart documenté"
    : issues[0] || (a.valeur === 0 ? "Base nulle" : "À relire");
  return {
    a,
    b,
    issues,
    compatible,
    delta,
    relative,
    review,
    stale: !!raw && !review,
    status,
    pair: p,
  };
}
function log(d, text) {
  d.journal = [...d.journal, { at: new Date().toISOString(), text }].slice(
    -200,
  );
  return d;
}
export function editSource(d, side, id, patch, reason) {
  if (!["left", "right"].includes(side)) throw Error("Source inconnue.");
  const before = current(d, side, id);
  if (!before) throw Error("Ligne absente.");
  const after = row({ ...before, ...patch, id: before.id });
  const motif = clean(reason, "Motif de correction", 1000);
  if (JSON.stringify(before) === JSON.stringify(after))
    throw Error("Aucune valeur modifiée.");
  const next = clone(d);
  if (next.edits.length >= 500)
    throw Error("Limite de 500 corrections atteinte.");
  next.edits.push({ side, id, before: clone(before), after, motif });
  return log(
    next,
    `Correction ${side === "left" ? "référence" : "actualisation"} ${id} : ${motif}`,
  );
}
export function expectedYears(d, left, right) {
  left = year(left);
  right = year(right);
  if (left >= right)
    throw Error("La période d’actualisation doit suivre la référence.");
  return log(
    { ...clone(d), expected: { left, right } },
    `Périodes attendues ${left} puis ${right}.`,
  );
}
export function setPair(d, id, left, right) {
  if (!current(d, "left", left) || !current(d, "right", right))
    throw Error("Choisir deux lignes présentes dans les sources.");
  if (
    d.pairs.some((p) => p.id !== id && (p.left === left || p.right === right))
  )
    throw Error(
      "Une de ces lignes est déjà rapprochée. Retirez d’abord son autre correspondance.",
    );
  const n = clone(d);
  let p = n.pairs.find((p) => p.id === id);
  if (p) {
    p.left = left;
    p.right = right;
  } else {
    if (n.pairs.length >= 200) throw Error("Maximum de 200 correspondances.");
    let i = 1;
    while (n.pairs.some((p) => p.id === `C${i}`)) i++;
    p = { id: `C${i}`, left, right };
    n.pairs.push(p);
    delete n.reviews[p.id];
  }
  return log(n, `Correspondance ${p.id} : ${left} avec ${right}.`);
}
export function removePair(d, id) {
  const n = clone(d);
  n.pairs = n.pairs.filter((p) => p.id !== id);
  delete n.reviews[id];
  return log(n, `Correspondance ${id} retirée ; lignes source conservées.`);
}
export function decide(d, id, kind, note) {
  const p = d.pairs.find((p) => p.id === id);
  if (!p) throw Error("Correspondance absente.");
  if (!["include", "exclude"].includes(kind)) throw Error("Décision inconnue.");
  const result = compare(d, p);
  if (kind === "include" && !result.compatible)
    throw Error("Comparaison impossible : " + result.issues.join(", ") + ".");
  const n = clone(d);
  n.reviews[id] = {
    kind,
    note: clean(note, "Note de restitution", 1500),
    fingerprint: fingerprint(d, p),
  };
  return log(
    n,
    `${id} : ${kind === "include" ? "comparaison relue" : "écart documenté"}.`,
  );
}
export function replaceSource(d, side, input) {
  if (!["left", "right"].includes(side)) throw Error("Source inconnue.");
  const parsed = rows(input),
    n = clone(d);
  n.sources[side] = parsed;
  n.edits = n.edits.filter((e) => e.side !== side);
  return log(
    n,
    `Source ${side === "left" ? "référence" : "actualisation"} remplacée (${parsed.length} lignes). Correspondances conservées ; corrections de cette source retirées.`,
  );
}
export function restore(input) {
  if (input?.schema !== "espacite-comparison-v1")
    throw Error("Dossier Espacité incompatible.");
  const expected = {
    left: year(input.expected?.left),
    right: year(input.expected?.right),
  };
  if (expected.left >= expected.right) throw Error("Périodes incohérentes.");
  const result = {
    schema: input.schema,
    expected,
    sources: {
      left: rows(input.sources?.left),
      right: rows(input.sources?.right),
    },
    edits: [],
    pairs: [],
    reviews: {},
    journal: [],
  };
  if (!Array.isArray(input.edits) || input.edits.length > 500)
    throw Error("Corrections invalides.");
  for (const e of input.edits) {
    if (!["left", "right"].includes(e.side))
      throw Error("Source de correction invalide.");
    const before = row(e.before),
      after = row(e.after);
    if (
      e.id !== before.id ||
      e.id !== after.id ||
      JSON.stringify(before) !== JSON.stringify(current(result, e.side, e.id))
    )
      throw Error("Chaîne de corrections incohérente.");
    result.edits.push({
      side: e.side,
      id: e.id,
      before,
      after,
      motif: clean(e.motif, "Motif", 1000),
    });
  }
  if (!Array.isArray(input.pairs) || input.pairs.length > 200)
    throw Error("Correspondances invalides.");
  result.pairs = input.pairs.map((p) => ({
    id: code(p.id),
    left: code(p.left),
    right: code(p.right),
  }));
  for (const k of ["id", "left", "right"])
    if (new Set(result.pairs.map((p) => p[k])).size !== result.pairs.length)
      throw Error("Correspondance dupliquée.");
  if (
    !input.reviews ||
    typeof input.reviews !== "object" ||
    Array.isArray(input.reviews)
  )
    throw Error("Revues invalides.");
  for (const [id, r] of Object.entries(input.reviews)) {
    const p = result.pairs.find((p) => p.id === id);
    if (!p || !["include", "exclude"].includes(r.kind))
      throw Error("Revue sans correspondance ou décision invalide.");
    const value = {
      kind: r.kind,
      note: clean(r.note, "Note", 1500),
      fingerprint: clean(r.fingerprint, "Empreinte", 9000),
    };
    if (
      value.fingerprint === fingerprint(result, p) &&
      value.kind === "include" &&
      !compare(result, p).compatible
    )
      throw Error("Revue incompatible avec les sources.");
    result.reviews[id] = value;
  }
  if (!Array.isArray(input.journal) || input.journal.length > 200)
    throw Error("Journal invalide.");
  result.journal = input.journal.map((x) => ({
    at: clean(x.at, "Date du journal", 40),
    text: clean(x.text, "Entrée du journal", 1500),
  }));
  return result;
}
export const number = (x) =>
  x === null
    ? "Non renseigné"
    : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(x);
export function outcome(r) {
  if (!r.compatible) return "Variation masquée";
  if (r.review?.kind === "exclude") return "Comparaison écartée";
  const delta = `${r.delta > 0 ? "+" : ""}${number(r.delta)} ${r.a.unite === "pourcentage" ? "points" : UNITS[r.a.unite]}`;
  return r.relative === null
    ? `${delta}${r.a.unite !== "pourcentage" ? " ; base nulle, variation relative non définie" : ""}`
    : `${delta} (${r.relative > 0 ? "+" : ""}${number(r.relative)} %)`;
}
export function exportRows(d) {
  return d.pairs.map((p) => {
    const r = compare(d, p),
      allow = r.compatible && r.review?.kind !== "exclude";
    return {
      correspondance: p.id,
      indicateur: r.a?.indicateur || r.b?.indicateur || p.id,
      reference_id: p.left,
      actualisation_id: p.right,
      reference: r.a?.valeur ?? "",
      actualisation: r.b?.valeur ?? "",
      unite: r.a?.unite || "",
      perimetre_reference: r.a?.perimetre || "",
      perimetre_actualisation: r.b?.perimetre || "",
      annee_reference: r.a?.annee || "",
      annee_actualisation: r.b?.annee || "",
      definition_reference: r.a?.definition || "",
      definition_actualisation: r.b?.definition || "",
      denominateur_reference: r.a?.denominateur || "",
      denominateur_actualisation: r.b?.denominateur || "",
      source_reference: r.a?.source || "",
      source_actualisation: r.b?.source || "",
      ecart: allow ? r.delta : "",
      variation_pourcent: allow ? (r.relative ?? "") : "",
      statut: r.status,
      controles: r.issues.join(" ; "),
      note: r.review?.note || "",
      revue_perimee: r.stale ? "oui" : "non",
    };
  });
}
export function report(d) {
  const e = escapeHtml,
    table = (headers, rs) =>
      `<table><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rs.map((r) => `<tr>${r.map((v) => `<td>${e(String(v ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Note de comparabilité</title><style>body{font:16px/1.5 system-ui;max-width:1100px;margin:40px auto;padding:20px;color:#233244}h1,h2{color:#3b2c59}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{border:1px solid #cdd3dd;padding:10px;vertical-align:top;text-align:left;overflow-wrap:anywhere}th{background:#eef2f5}section{break-inside:avoid}@media print{body{font-size:11px;margin:0}}</style><h1>Note de comparabilité</h1><p>Prototype indépendant pour Espacité. Sources fournies par l’utilisateur, données d’exemple fictives. Évolution ${d.expected.left}–${d.expected.right}. Les appréciations restent à relire par le chargé d’études.</p>${d.pairs
    .map((p) => {
      const r = compare(d, p);
      return `<section><h2>${e(r.a?.indicateur || r.b?.indicateur || p.id)}</h2><p><strong>${e(r.status)}</strong> · ${e(outcome(r))}</p>${table(["Métadonnée", "Référence", "Actualisation"], [["Identifiant", p.left, p.right], ["Valeur", r.a ? number(r.a.valeur) : "Ligne absente", r.b ? number(r.b.valeur) : "Ligne absente"], ...["unite", "perimetre", "annee", "definition", "denominateur", "source"].map((k) => [k, r.a?.[k], r.b?.[k]])])}<p>${e(r.issues.join(" ; ") || "Métadonnées compatibles avec les périodes attendues.")}</p><p>${e(r.review?.note || "Aucune note de revue actuelle.")}${r.stale ? " Une ancienne décision est devenue périmée." : ""}</p></section>`;
    })
    .join("")}<h2>Corrections conservées</h2>${table(
    ["Ligne", "Champ", "Origine de la correction", "Après", "Motif"],
    d.edits.flatMap((x) =>
      HEADERS.filter(
        (k) => JSON.stringify(x.before[k]) !== JSON.stringify(x.after[k]),
      ).map((k) => [
        `${x.side} ${x.id}`,
        k,
        x.before[k] === null ? "Non renseigné" : x.before[k],
        x.after[k] === null ? "Non renseigné" : x.after[k],
        x.motif,
      ]),
    ),
  )}<h2>Lignes sans correspondance</h2>${table(
    ["Source", "ID", "Indicateur"],
    ["left", "right"].flatMap((side) =>
      d.sources[side]
        .filter((x) => !d.pairs.some((p) => p[side] === x.id))
        .map((x) => [side, x.id, x.indicateur]),
    ),
  )}<h2>Journal</h2>${table(
    ["Date", "Action"],
    d.journal.map((x) => [x.at, x.text]),
  )}</html>`;
}

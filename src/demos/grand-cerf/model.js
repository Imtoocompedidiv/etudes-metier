import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { parseCsv } from "../../shared/files.js";

export const CATALOG = "trouvez-moi-public-2026-09-17";
export const COMPONENTS = [
  {
    id: "plateaux",
    name: "Pièces de plateau",
    expected: 12,
    group: "base",
    symbol: "square",
  },
  {
    id: "jetons",
    name: "Jetons",
    expected: 90,
    group: "base",
    symbol: "circle",
  },
  {
    id: "collecteurs",
    name: "Collecteurs",
    expected: 10,
    group: "base",
    symbol: "triangle",
  },
  {
    id: "livret",
    name: "Livret de devinettes",
    expected: 1,
    group: "base",
    symbol: "book",
  },
  {
    id: "cartes",
    name: "Cartes de l’extension",
    expected: 15,
    group: "extension",
    symbol: "cards",
  },
];
export const KITS = {
  base: "Jeu",
  extension: "Extension",
  pack: "Pack",
  unknown: "À identifier",
};
export const ACCESS = {
  unknown: "À vérifier",
  accessible: "Accès déclaré",
  inaccessible: "Accès à rétablir",
};
export const CSV_HEADERS = [
  "dossier",
  "lieu",
  "commande",
  "kit",
  "note",
  "composant",
  "compte",
];
export const REQUEST_HEADERS = [
  "dossier",
  "commande",
  "kit",
  "referentiel",
  "composant",
  "attendu",
  "compte",
  "demande",
  "relecteur",
  "statut",
];
const hash = (v) => bytesToHex(sha256(utf8ToBytes(JSON.stringify(v))));
const fail = (message) => {
  throw new Error(message);
};
function object(v, label) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail(`${label} invalide.`);
  return v;
}
function text(v, label, max, min = 0) {
  if (typeof v !== "string" || v.length > max || v.trim().length < min)
    fail(`${label} : texte de ${min} à ${max} caractères attendu.`);
  return v;
}
function identifier(v) {
  if (typeof v !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(v))
    fail("Identifiant dossier invalide.");
  return v;
}
function choice(v, options, label) {
  if (typeof v !== "string" || !Object.hasOwn(options, v))
    fail(`${label} inconnu.`);
  return v;
}
export function count(v) {
  if (v === null || (typeof v === "string" && !v.trim())) return null;
  if (typeof v !== "string" && typeof v !== "number")
    fail("Le comptage doit être un entier ou rester vide.");
  if (
    !/^\d+$/.test(String(v)) ||
    !Number.isSafeInteger(Number(v)) ||
    Number(v) > 1000
  )
    fail("Comptage attendu de 0 à 1 000, sans décimale.");
  return Number(v);
}
function blank(id, place, order, kit, note) {
  return {
    id,
    place,
    order,
    kit,
    note,
    counts: Object.fromEntries(COMPONENTS.map((c) => [c.id, null])),
    digital: ["unknown", "unknown", "unknown"],
    editionConfirmed: false,
    explanations: {},
    review: null,
  };
}
const first = blank(
  "GC-104",
  "École des Tilleuls (fictive)",
  "CMD-EX-104",
  "extension",
  "La demande mentionne le jeu et son extension.",
);
first.counts = {
  plateaux: 13,
  jetons: 88,
  collecteurs: null,
  livret: 1,
  cartes: 13,
};
const second = blank(
  "GC-105",
  "Centre des Alouettes (fictif)",
  "CMD-EX-105",
  "base",
  "Le livret n’a pas été retrouvé lors du comptage fictif.",
);
second.counts = {
  plateaux: 12,
  jetons: 90,
  collecteurs: 10,
  livret: 0,
  cartes: null,
};
export const seed = { version: 1, catalog: CATALOG, cases: [first, second] };
export function expected(kit, component) {
  return kit === "unknown"
    ? null
    : kit === "pack" || kit === component.group
      ? component.expected
      : 0;
}
function issueBasis(d, c) {
  return hash([CATALOG, d.kit, c.id, expected(d.kit, c), d.counts[c.id]]);
}
function hasIssue(d, c) {
  const n = expected(d.kit, c);
  return n !== null && d.counts[c.id] !== null && d.counts[c.id] > n;
}
export function basis(d) {
  return hash([
    CATALOG,
    d.id,
    d.place,
    d.order,
    d.kit,
    d.note,
    d.editionConfirmed,
    COMPONENTS.map((c) => [
      c.id,
      d.counts[c.id],
      d.explanations[c.id]
        ? [d.explanations[c.id].note, d.explanations[c.id].basis]
        : null,
    ]),
    d.digital,
  ]);
}
function reconcile(d) {
  for (const c of COMPONENTS)
    if (
      d.explanations[c.id] &&
      (!hasIssue(d, c) || d.explanations[c.id].basis !== issueBasis(d, c))
    )
      delete d.explanations[c.id];
  if (d.review && d.review.basis !== basis(d)) d.review = null;
  return d;
}
export function analyze(d) {
  const rows = COMPONENTS.map((c) => {
    const want = expected(d.kit, c),
      got = d.counts[c.id];
    const issue = hasIssue(d, c),
      explanation = issue ? d.explanations[c.id] : null;
    return {
      ...c,
      want,
      got,
      issue,
      explanation,
      missing: want > 0 && got !== null ? Math.max(want - got, 0) : 0,
      label:
        want === null
          ? "Kit à identifier"
          : want === 0
            ? got > 0
              ? "Hors du kit choisi"
              : "Hors du kit choisi"
            : got === null
              ? "Non compté"
              : got === want
                ? "Complet"
                : got < want
                  ? `${want - got} à demander`
                  : `+${got - want} ${explanation ? "expliqué" : "à expliquer"}`,
    };
  });
  const blockers = [];
  if (d.kit === "unknown")
    blockers.push("Identifier le kit et sa nomenclature.");
  for (const r of rows) {
    if (r.want > 0 && r.got === null)
      blockers.push(`Compter : ${r.name.toLowerCase()}.`);
    if (r.issue && !r.explanation)
      blockers.push(
        `Expliquer : ${r.name.toLowerCase()} ${r.want === 0 ? "hors kit" : "en plus"}.`,
      );
  }
  if (!d.editionConfirmed)
    blockers.push("Confirmer que cette nomenclature correspond à la boîte.");
  const digitalApplicable = ["base", "pack"].includes(d.kit);
  const digitalQuestions = digitalApplicable
    ? d.digital.flatMap((v, i) =>
        v === "accessible"
          ? []
          : [`Diaporama ${i + 1} : ${ACCESS[v].toLowerCase()}.`],
      )
    : [];
  return {
    rows,
    blockers,
    digitalApplicable,
    digitalQuestions,
    reviewed: Boolean(
      d.review && d.review.basis === basis(d) && blockers.length === 0,
    ),
  };
}
function change(state, id, fn) {
  const next = structuredClone(state),
    d = next.cases.find((x) => x.id === id);
  if (!d) fail("Dossier introuvable.");
  fn(d);
  reconcile(d);
  return next;
}
export function setKit(state, id, kit) {
  return change(state, id, (d) => {
    d.kit = choice(kit, KITS, "Kit");
    d.editionConfirmed = false;
  });
}
export function setCount(state, id, component, value) {
  if (!COMPONENTS.some((c) => c.id === component)) fail("Composant inconnu.");
  return change(state, id, (d) => {
    d.counts[component] = count(value);
  });
}
export function setDigital(state, id, index, value) {
  if (!Number.isInteger(index) || index < 0 || index > 2)
    fail("Repère numérique inconnu.");
  return change(state, id, (d) => {
    d.digital[index] = choice(value, ACCESS, "Accès");
  });
}
export function setEdition(state, id, value) {
  if (typeof value !== "boolean") fail("Confirmation invalide.");
  return change(state, id, (d) => {
    if (d.kit === "unknown" && value) fail("Identifiez d’abord le kit.");
    d.editionConfirmed = value;
  });
}
export function explain(state, id, component, note) {
  return change(state, id, (d) => {
    const c = COMPONENTS.find((c) => c.id === component);
    if (!c || !hasIssue(d, c))
      fail("Cet écart ne nécessite pas d’explication.");
    d.explanations[component] = {
      note: text(note, "Explication", 500, 10),
      basis: issueBasis(d, c),
    };
  });
}
export function review(state, id, by, checked) {
  return change(state, id, (d) => {
    const a = analyze(d);
    if (a.blockers.length)
      fail("Complétez les points indiqués avant la revue.");
    if (checked !== true)
      fail("Confirmez la relecture des quantités et des réserves.");
    d.review = { by: text(by, "Relecteur", 60, 2), basis: basis(d) };
  });
}
export function restore(raw) {
  const p = typeof raw === "string" ? JSON.parse(raw) : raw;
  object(p, "Dossier");
  if (
    p.version !== 1 ||
    p.catalog !== CATALOG ||
    !Array.isArray(p.cases) ||
    !p.cases.length ||
    p.cases.length > 50
  )
    fail("Version, référentiel ou nombre de dossiers invalide (1 à 50).");
  const ids = new Set();
  const cases = p.cases.map((v) => {
    object(v, "Demande");
    const id = identifier(v.id);
    if (ids.has(id)) fail("Identifiant dossier répété.");
    ids.add(id);
    const d = blank(
      id,
      text(v.place, "Lieu", 120, 1),
      text(v.order, "Commande déclarée", 80, 1),
      choice(v.kit, KITS, "Kit"),
      text(v.note, "Note", 1000),
    );
    object(v.counts, "Comptages");
    if (Object.keys(v.counts).length !== COMPONENTS.length)
      fail("Cinq familles de comptage sont attendues.");
    for (const c of COMPONENTS) {
      if (!Object.hasOwn(v.counts, c.id)) fail("Famille de comptage absente.");
      d.counts[c.id] = count(v.counts[c.id]);
    }
    if (!Array.isArray(v.digital) || v.digital.length !== 3)
      fail("Trois états numériques sont attendus.");
    d.digital = v.digital.map((v) => choice(v, ACCESS, "Accès"));
    if (
      typeof v.editionConfirmed !== "boolean" ||
      (v.kit === "unknown" && v.editionConfirmed)
    )
      fail("Confirmation de nomenclature incohérente.");
    d.editionConfirmed = v.editionConfirmed;
    object(v.explanations, "Explications");
    for (const [cid, record] of Object.entries(v.explanations)) {
      const c = COMPONENTS.find((c) => c.id === cid);
      object(record, "Explication");
      if (
        !c ||
        !hasIssue(d, c) ||
        record.basis !== issueBasis(d, c) ||
        !/^[a-f0-9]{64}$/.test(record.basis)
      )
        fail("Explication périmée ou incohérente.");
      d.explanations[cid] = {
        note: text(record.note, "Explication", 500, 10),
        basis: record.basis,
      };
    }
    if (v.review !== null) {
      object(v.review, "Revue");
      if (
        !/^[a-f0-9]{64}$/.test(v.review.basis) ||
        v.review.basis !== basis(d) ||
        analyze(d).blockers.length
      )
        fail("Revue périmée ou incohérente.");
      d.review = {
        by: text(v.review.by, "Relecteur", 60, 2),
        basis: v.review.basis,
      };
    }
    return d;
  });
  return { version: 1, catalog: CATALOG, cases };
}
export function importCounts(state, raw) {
  const { rows } = parseCsv(raw, {
    requiredHeaders: CSV_HEADERS,
    maxRows: 250,
  });
  if (!rows.length) fail("Aucun comptage à importer.");
  const next = structuredClone(state),
    pairs = new Set(),
    meta = new Map();
  for (const row of rows) {
    const id = identifier(row.dossier),
      cid = row.composant;
    if (!COMPONENTS.some((c) => c.id === cid))
      fail(`Composant inconnu dans ${id}.`);
    const pair = `${id}/${cid}`;
    if (pairs.has(pair)) fail(`Comptage répété : ${pair}.`);
    pairs.add(pair);
    const kit = choice(row.kit, KITS, "Kit"),
      place = text(row.lieu, "Lieu", 120, 1),
      order = text(row.commande, "Commande", 80, 1),
      note = text(row.note, "Note", 1000);
    const stamp = JSON.stringify([kit, place, order, note]);
    if (meta.has(id) && meta.get(id) !== stamp)
      fail(`Informations contradictoires pour ${id}.`);
    meta.set(id, stamp);
    let d = next.cases.find((c) => c.id === id);
    if (!d) {
      d = blank(id, place, order, kit, note);
      next.cases.push(d);
    }
    if (d.kit !== kit) d.editionConfirmed = false;
    Object.assign(d, { kit, place, order, note });
    d.counts[cid] = count(row.compte);
  }
  next.cases.forEach(reconcile);
  return restore(next);
}
export function exampleRows() {
  return seed.cases.flatMap((d) =>
    COMPONENTS.map((c) => [
      d.id,
      d.place,
      d.order,
      d.kit,
      d.note,
      c.id,
      d.counts[c.id] ?? "",
    ]),
  );
}
export function requestRows(d) {
  const a = analyze(d);
  if (!a.reviewed) fail("Le dossier doit être relu avant le CSV de demande.");
  return a.rows
    .filter((r) => r.missing > 0)
    .map((r) => [
      d.id,
      d.order,
      KITS[d.kit],
      CATALOG,
      r.name,
      r.want,
      r.got,
      r.missing,
      d.review.by,
      "Demande préparatoire, prise en charge non décidée",
    ]);
}
export function report(d) {
  const a = analyze(d);
  return {
    title: `Comptage de boîte · ${d.id}`,
    subtitle: `${a.reviewed ? "Demande relue" : "Brouillon"} · ${d.place} · ${d.order} · ${KITS[d.kit]}`,
    sections: [
      {
        title: "Référence déclarée",
        paragraphs: [
          d.note,
          `Instantané ${CATALOG}. Jeu GS2602 ; extension GS2602.1 ; pack : association des deux. Nomenclature ${d.editionConfirmed ? "confirmée par déclaration humaine" : "à vérifier sur la boîte concernée"}.`,
          "Sources publiques : https://www.grand-cerf.com/cycle-1/362-trouvez-moi-jeu-langage-vocabulaire.html ; https://www.grand-cerf.com/cycle-2/363-trouvez-moi-jeu-langage-vocabulaire.html",
        ],
      },
      {
        title: "Pièces physiques",
        headers: [
          "Famille",
          "Attendu",
          "Compté",
          "Pièces à demander",
          "Réserve",
        ],
        rows: a.rows.map((r) => [
          r.name,
          r.want === null ? "Kit inconnu" : r.want === 0 ? "Hors kit" : r.want,
          r.got ?? "Non compté",
          r.want > 0 && r.got !== null ? r.missing : "Indéterminé / hors kit",
          r.explanation?.note || r.label,
        ]),
      },
      {
        title: "Accès numériques déclarés",
        paragraphs: [
          a.digitalApplicable
            ? "Les états portent sur trois diaporamas. Les numéros sont des repères de démonstration, pas des noms de fichiers officiels."
            : "Le kit choisi ne permet pas de demander un accès numérique. Les déclarations antérieures sont conservées séparément.",
        ],
        headers: ["Repère", "État déclaré"],
        rows: d.digital.map((s, i) => [`Diaporama ${i + 1}`, ACCESS[s]]),
      },
      {
        title: "Revue",
        paragraphs: [
          a.reviewed
            ? `Relecture déclarée par ${d.review.by}.`
            : "Dossier non relu.",
          ...a.blockers,
          ...a.digitalQuestions,
          "Exemple fictif, prototype indépendant. Aucun droit à garantie, envoi de pièces ou traitement SAV décidé.",
        ],
      },
    ],
  };
}
export function questions(d) {
  const a = analyze(d);
  return [
    `Dossier ${d.id} · ${d.order} · ${KITS[d.kit]}`,
    `Brouillon de réponse, non envoyé. Référentiel ${CATALOG}.`,
    "",
    ...a.blockers,
    ...a.digitalQuestions,
    ...a.rows
      .filter((r) => r.missing)
      .map((r) => `${r.name} : ${r.missing} à demander après validation SAV.`),
    a.reviewed
      ? `Comptage relu par ${d.review.by}.`
      : "Relecture du dossier encore nécessaire.",
    "",
    "La prise en charge et l’expédition restent à décider par le SAV. Exemple fictif.",
  ].join("\n");
}

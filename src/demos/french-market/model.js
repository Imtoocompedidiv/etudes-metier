import { parseCsv } from "../../shared/files.js";
import { sha256 } from "@noble/hashes/sha2.js";

const digest = (value) =>
  Array.from(sha256(new TextEncoder().encode(JSON.stringify(value))), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

export const HEADERS = [
  "id",
  "fournisseur",
  "produit",
  "titre",
  "famille",
  "marque",
  "licence",
  "reference",
  "couleur",
  "taille",
  "composition",
  "visuel",
];
export const FAMILIES = {
  homme: {
    label: "Sous-vêtements homme",
    sizes: ["S", "M", "L", "XL", "XXL", "3XL"],
  },
  femme: {
    label: "Sous-vêtements femme",
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
  },
  chaussettes: {
    label: "Chaussettes",
    sizes: ["27–30", "31–34", "35–38", "39–42", "43–46", "47–50"],
  },
  casquettes: {
    label: "Casquettes",
    sizes: [
      "Réglable",
      "54 cm",
      "55 cm",
      "56 cm",
      "57 cm",
      "58 cm",
      "59 cm",
      "60 cm",
      "61 cm",
      "62 cm",
    ],
  },
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const norm = (v) =>
  v.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
const clone = (v) => structuredClone(v);
const fail = (message) => {
  throw Error(message);
};
function text(v, label, required = false, max = 300) {
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\x00-\x08\x0b-\x1f]/.test(v) ||
    (required && !v.trim())
  )
    fail(
      `${label} : texte ${required ? "non vide " : ""}de ${max} caractères maximum attendu.`,
    );
  return v.trim();
}
function shape(v, keys, label) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k)) ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    fail(`${label} ne respecte pas le format attendu.`);
}
function id(v) {
  const s = text(v, "Identifiant", true, 50);
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(s) ||
    ["constructor", "prototype", "__proto__"].includes(s)
  )
    fail("Identifiant de ligne non accepté.");
  return s;
}
export function row(v) {
  shape(v, HEADERS, "Ligne");
  const out = Object.fromEntries(
    HEADERS.map((k) => [
      k,
      text(v[k], k, ["fournisseur", "produit"].includes(k)),
    ]),
  );
  out.id = id(v.id);
  return out;
}
function rows(v) {
  if (!Array.isArray(v) || v.length < 1 || v.length > 300)
    fail("Un arrivage contient entre 1 et 300 lignes.");
  const a = v.map(row);
  if (new Set(a.map((r) => r.id)).size !== a.length)
    fail("Identifiant de ligne dupliqué.");
  return a;
}
export function parseArrival(source) {
  const p = parseCsv(source, { requiredHeaders: HEADERS, maxRows: 300 });
  if (p.headers.length !== HEADERS.length)
    fail("Utilisez les douze colonnes du modèle CSV.");
  return rows(p.rows);
}
export const productKey = (r) => JSON.stringify([r.fournisseur, r.produit]);
export const aliasKey = (r) =>
  JSON.stringify([r.fournisseur, r.famille, r.taille]);
export function effective(d) {
  return d.source.map((r) => d.edits.find((e) => e.id === r.id)?.value || r);
}
export function sizeOf(d, r) {
  if (!Object.hasOwn(FAMILIES, r.famille)) return null;
  const f = FAMILIES[r.famille];
  const a = d.aliases.find((a) => a.key === aliasKey(r));
  return a?.size || (f.sizes.includes(r.taille) ? r.taille : null);
}
function baseGroups(d) {
  const current = effective(d),
    groups = new Map(),
    refs = new Map();
  for (const r of current) {
    const k = productKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
    const sku = norm(r.reference);
    if (sku) {
      if (!refs.has(sku)) refs.set(sku, []);
      refs.get(sku).push(r.id);
    }
  }
  return [...groups].map(([key, variants]) => {
    const common = [];
    for (const field of [
      "titre",
      "famille",
      "marque",
      "licence",
      "composition",
    ])
      if (new Set(variants.map((r) => norm(r[field]))).size > 1)
        common.push(`Valeurs de ${field} différentes dans ce produit.`);
    const tuples = new Map();
    for (const r of variants) {
      const size = sizeOf(d, r);
      if (size && r.couleur) {
        const k = JSON.stringify([norm(r.couleur), size]);
        if (!tuples.has(k)) tuples.set(k, []);
        tuples.get(k).push(r.id);
      }
    }
    const checked = variants.map((r) => {
      const size = sizeOf(d, r),
        issues = [...common];
      for (const field of [
        "titre",
        "marque",
        "licence",
        "reference",
        "couleur",
        "composition",
        "visuel",
      ])
        if (!r[field]) issues.push(`${field} à renseigner.`);
      if (!Object.hasOwn(FAMILIES, r.famille))
        issues.push("Famille à choisir.");
      else if (!size) issues.push("Taille à associer pour cette famille.");
      if (r.reference && refs.get(norm(r.reference))?.length > 1)
        issues.push(
          `Référence partagée par ${refs.get(norm(r.reference)).join(", ")}.`,
        );
      if (
        size &&
        tuples.get(JSON.stringify([norm(r.couleur), size]))?.length > 1
      )
        issues.push("Couleur et taille répétées dans ce produit.");
      return {
        row: r,
        size,
        issues,
        source: d.source.find((s) => s.id === r.id),
        edit: d.edits.find((e) => e.id === r.id) || null,
        alias: d.aliases.find((a) => a.key === aliasKey(r)) || null,
      };
    });
    const signature = digest(
      checked.map((r) => ({
        row: r.row,
        size: r.size,
        issues: r.issues,
        source: r.source,
        edit: r.edit,
        alias: r.alias,
      })),
    );
    return {
      key,
      first: variants[0],
      variants: checked,
      issues: [...new Set(checked.flatMap((r) => r.issues))],
      signature,
    };
  });
}
export function analyze(d) {
  return baseGroups(d).map((g) => {
    const decision = d.reviews.find((x) => x.key === g.key);
    return {
      ...g,
      review:
        decision?.signature === g.signature && !g.issues.length
          ? decision
          : null,
      stale: Boolean(
        decision && (decision.signature !== g.signature || g.issues.length),
      ),
    };
  });
}
function log(d, message) {
  return { ...d, journal: [...d.journal, message].slice(-100) };
}
export function editRow(d, key, value, reason) {
  const source = d.source.find((r) => r.id === key);
  if (!source) fail("Ligne absente.");
  const note = text(reason, "Justificatif", true, 800),
    next = row({ ...value, id: key });
  // Group identities belong to the source. They cannot silently merge two products.
  if (
    next.fournisseur !== source.fournisseur ||
    next.produit !== source.produit
  )
    fail(
      "Les codes fournisseur et produit se corrigent dans le fichier source.",
    );
  return log(
    {
      ...d,
      edits: [
        ...d.edits.filter((e) => e.id !== key),
        { id: key, value: next, reason: note },
      ],
    },
    `Correction ${key} : ${note}`,
  );
}
export function removeEdit(d, key) {
  return log(
    { ...d, edits: d.edits.filter((e) => e.id !== key) },
    `Correction ${key} retirée.`,
  );
}
export function setAlias(d, r, size, reason) {
  if (
    !Object.hasOwn(FAMILIES, r.famille) ||
    !FAMILIES[r.famille].sizes.includes(size)
  )
    fail("Taille retenue non admise dans cette famille.");
  if (!r.taille)
    fail("Renseignez d’abord la taille fournisseur dans la ligne.");
  const key = aliasKey(r),
    note = text(reason, "Justificatif de correspondance", true, 800);
  if (!d.aliases.some((a) => a.key === key) && d.aliases.length >= 300)
    fail("Maximum 300 correspondances de tailles.");
  return log(
    {
      ...d,
      aliases: [
        ...d.aliases.filter((a) => a.key !== key),
        { key, size, reason: note },
      ],
    },
    `Taille ${r.taille} associée à ${size} pour ${r.fournisseur} / ${r.famille}.`,
  );
}
export function removeAlias(d, r) {
  return log(
    { ...d, aliases: d.aliases.filter((a) => a.key !== aliasKey(r)) },
    `Correspondance de taille ${r.taille} retirée.`,
  );
}
export function reviewProduct(d, key, note) {
  const g = analyze(d).find((g) => g.key === key);
  if (!g || g.issues.length)
    fail("Résolvez les points signalés avant la revue du produit.");
  const reason = text(note, "Note de revue", true, 800);
  return log(
    {
      ...d,
      reviews: [
        ...d.reviews.filter((r) => r.key !== key),
        { key, signature: g.signature, note: reason },
      ],
    },
    `Produit ${g.first.produit} relu.`,
  );
}
export function replaceArrival(d, input, name) {
  const source = rows(input);
  if (same(source, d.source)) return d;
  return log(
    {
      ...d,
      source,
      name: text(name, "Nom du fichier", true, 160),
      edits: [],
      reviews: [],
    },
    "Arrivage remplacé. Corrections et revues retirées ; dictionnaire de tailles conservé.",
  );
}
export function restore(input) {
  const v = typeof input === "string" ? JSON.parse(input) : input;
  shape(
    v,
    ["schema", "name", "source", "edits", "aliases", "reviews", "journal"],
    "Dossier",
  );
  if (v.schema !== "french-market-arrival-v1")
    fail("Dossier French Market incompatible.");
  const d = {
    schema: v.schema,
    name: text(v.name, "Nom", true, 160),
    source: rows(v.source),
    edits: [],
    aliases: [],
    reviews: [],
    journal: [],
  };
  for (const k of ["edits", "aliases", "reviews"])
    if (!Array.isArray(v[k]) || v[k].length > 300)
      fail(`${k} : maximum 300 entrées.`);
  const seen = new Set();
  d.edits = v.edits.map((e) => {
    shape(e, ["id", "value", "reason"], "Correction");
    const key = id(e.id);
    if (seen.has(key)) fail("Correction répétée.");
    seen.add(key);
    const s = d.source.find((r) => r.id === key);
    const value = row(e.value);
    if (
      !s ||
      value.id !== key ||
      s.fournisseur !== value.fournisseur ||
      s.produit !== value.produit
    )
      fail("Correction sans source correspondante.");
    return {
      id: key,
      value,
      reason: text(e.reason, "Justificatif", true, 800),
    };
  });
  const keys = new Set();
  d.aliases = v.aliases.map((a) => {
    shape(a, ["key", "size", "reason"], "Correspondance");
    const key = text(a.key, "Clé", true, 1000);
    let parts;
    try {
      parts = JSON.parse(key);
    } catch {
      fail("Clé de correspondance invalide.");
    }
    if (
      !Array.isArray(parts) ||
      parts.length !== 3 ||
      parts.some((x) => typeof x !== "string" || !x.trim() || x.length > 300) ||
      JSON.stringify(parts) !== key ||
      !Object.hasOwn(FAMILIES, parts[1]) ||
      !FAMILIES[parts[1]].sizes.includes(a.size) ||
      keys.has(key)
    )
      fail("Correspondance invalide ou dupliquée.");
    keys.add(key);
    return {
      key,
      size: a.size,
      reason: text(a.reason, "Justificatif", true, 800),
    };
  });
  const gs = baseGroups(d);
  const reviewed = new Set();
  d.reviews = v.reviews.map((r) => {
    shape(r, ["key", "signature", "note"], "Revue");
    const key = text(r.key, "Produit", true, 1000),
      g = gs.find((g) => g.key === key);
    if (!g || reviewed.has(key)) fail("Revue sans produit ou répétée.");
    if (typeof r.signature !== "string" || !/^[a-f0-9]{64}$/.test(r.signature))
      fail("Version revue invalide.");
    reviewed.add(key);
    return {
      key,
      signature: r.signature,
      note: text(r.note, "Note", true, 800),
    };
  });
  if (!Array.isArray(v.journal) || v.journal.length > 100)
    fail("Journal invalide.");
  d.journal = v.journal.map((x) => text(x, "Journal", true, 1200));
  return d;
}
export const OUTPUT_HEADERS = [
  ...HEADERS,
  "taille_retenue",
  "note_correction",
  "note_correspondance",
  "note_revue",
];
export function outputRows(d) {
  return analyze(d)
    .filter((g) => g.review)
    .flatMap((g) =>
      g.variants.map((v) => [
        ...HEADERS.map((k) => v.row[k]),
        v.size,
        v.edit?.reason || "",
        v.alias?.reason || "",
        g.review.note,
      ]),
    );
}
export function exceptions(d) {
  return analyze(d)
    .filter((g) => !g.review)
    .flatMap((g) =>
      g.variants.map((v) => [
        v.row.id,
        v.row.produit,
        v.row.reference,
        v.issues.join(" | ") || "Produit à relire",
        g.stale ? "Revue à refaire" : "Non revu",
      ]),
    );
}
export function report(d) {
  const gs = analyze(d);
  return {
    title: "Préparation des déclinaisons",
    subtitle: `French Market · Prototype indépendant. ${d.name}. Données fictives fournies en exemple. Aucune mise en ligne. Le format reste à adapter à votre import PrestaShop.`,
    sections: [
      {
        title: "Produits",
        headers: [
          "Fournisseur",
          "Produit",
          "Titre",
          "Statut",
          "Réserves",
          "Note de revue",
        ],
        rows: gs.map((g) => [
          g.first.fournisseur,
          g.first.produit,
          g.first.titre,
          g.review ? "Produit relu" : g.stale ? "Revue à refaire" : "À relire",
          g.issues.join(" "),
          g.review?.note || "",
        ]),
      },
      {
        title: "Provenance des variantes",
        headers: [
          "Ligne",
          "Champ",
          "Valeur source",
          "Valeur préparée",
          "Motif",
        ],
        rows: gs.flatMap((g) =>
          g.variants.flatMap((v) =>
            HEADERS.filter((k) => k !== "id").map((k) => [
              v.row.id,
              k,
              v.source[k],
              v.row[k],
              v.source[k] !== v.row[k] ? v.edit?.reason || "" : "",
            ]),
          ),
        ),
      },
      {
        title: "Correspondances de tailles",
        headers: [
          "Ligne",
          "Taille source courante",
          "Taille retenue",
          "Justificatif",
        ],
        rows: gs.flatMap((g) =>
          g.variants.map((v) => [
            v.row.id,
            v.row.taille,
            v.size || "Non associée",
            v.alias?.reason ||
              (v.size ? "Libellé déjà canonique" : "Aucune correspondance"),
          ]),
        ),
      },
      {
        title: "Limites de cette préparation",
        paragraphs: [
          "Les familles et libellés sont déclarés pour cet exemple. Aucun ajustement de mensurations, conformité textile ou droit de licence n’est vérifié.",
          "Le visuel est une référence déclarée : aucun fichier image n’est ouvert ou validé.",
          "La cohérence de composition est textuelle. Le contenu commercial doit être relu.",
        ],
      },
      {
        title: "Journal",
        paragraphs: d.journal.length ? d.journal : ["Aucune modification."],
      },
    ],
  };
}
export function seed() {
  const build = (
    id,
    produit,
    titre,
    famille,
    reference,
    couleur,
    taille,
    visuel,
    composition = "95 % coton, 5 % élasthanne",
  ) => ({
    id,
    fournisseur: "Fournisseur témoin",
    produit,
    titre,
    famille,
    marque: "Atelier témoin",
    licence: "Aucune",
    reference,
    couleur,
    taille,
    composition,
    visuel,
  });
  return {
    schema: "french-market-arrival-v1",
    name: "arrivage-fictif.csv",
    source: [
      build(
        "L1",
        "BOX-H",
        "Boxer Horizon",
        "homme",
        "BOX-BL-M",
        "Bleu",
        "M",
        "box-bleu.jpg",
      ),
      build(
        "L2",
        "BOX-H",
        "Boxer Horizon",
        "homme",
        "BOX-BL-XL",
        "Bleu",
        "Extra Large",
        "box-bleu.jpg",
      ),
      build(
        "L3",
        "BOX-H",
        "Boxer Horizon",
        "homme",
        "BOX-NO-M",
        "Noir",
        "M",
        "box-noir.jpg",
      ),
      build(
        "L4",
        "CHA-M",
        "Chaussettes Motif",
        "chaussettes",
        "CHA-R-3942",
        "Rayures",
        "39–42",
        "chaussettes-rayures.jpg",
        "80 % coton, 20 % polyamide",
      ),
      build(
        "L5",
        "CHA-M",
        "Chaussettes Motif",
        "chaussettes",
        "CHA-R-3942",
        "Rayures",
        "43–46",
        "chaussettes-rayures.jpg",
        "80 % coton, 20 % polyamide",
      ),
      build(
        "L6",
        "CHA-M",
        "Chaussettes Motif",
        "chaussettes",
        "CHA-N-3942",
        "Noir",
        "39–42",
        "",
        "80 % coton, 20 % polyamide",
      ),
      build(
        "L7",
        "CAP-R",
        "Casquette Traverse",
        "casquettes",
        "CAP-BL",
        "Bleu",
        "Réglable",
        "casquette-bleue.jpg",
        "100 % coton",
      ),
    ],
    edits: [],
    aliases: [],
    reviews: [],
    journal: [],
  };
}

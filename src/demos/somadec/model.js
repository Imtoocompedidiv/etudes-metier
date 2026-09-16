import { parseCsv } from "../../shared/files.js";

export const columns = [
  "id",
  "etiquette",
  "decor",
  "epaisseur",
  "quantite",
  "longueur",
  "largeur",
  "chant",
  "avant",
  "arriere",
  "gauche",
  "droit",
  "usinage",
  "remarque",
];
export const edgeTypes = [
  "",
  "ABS 0,8 mm",
  "ABS 2 mm",
  "AIRFORCE",
  "MDF 0,6 × 23",
  "BOIS",
];
export const machiningTypes = [
  "",
  "Taquets 1 face",
  "Taquets 2 faces",
  "Charnière 1 trou",
  "Charnière 3 trous",
];
export const fields = [
  ["label", "Étiquette"],
  ["decor", "Décor"],
  ["thickness", "Épaisseur"],
  ["quantity", "Quantité"],
  ["length", "Longueur"],
  ["width", "Largeur"],
  ["edgeType", "Type de chant"],
  ["front", "Chant avant"],
  ["back", "Chant arrière"],
  ["left", "Chant gauche"],
  ["right", "Chant droit"],
  ["machining", "Usinage"],
  ["notes", "Remarque"],
];
const numeric = new Set(["thickness", "quantity", "length", "width"]);
const edges = new Set(["front", "back", "left", "right"]);
const text = (v, label, required = true, max = 180) => {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    throw Error(
      `${label} : texte ${required ? "obligatoire, " : ""}${max} caractères maximum.`,
    );
  return v.trim();
};
const number = (v, label, integer = false) => {
  if (
    v == null ||
    (typeof v !== "number" && typeof v !== "string") ||
    String(v).trim() === "" ||
    !/^\d+(?:[.,]\d+)?$/.test(String(v).trim())
  )
    throw Error(`${label} : renseignez une valeur positive.`);
  const n = Number(String(v).replace(",", "."));
  if (
    !Number.isFinite(n) ||
    n <= 0 ||
    n > 100000 ||
    (integer && !Number.isInteger(n)) ||
    (!integer && Math.round(n * 10) !== n * 10)
  )
    throw Error(
      `${label} : ${integer ? "valeur entière de 1 à 100 000" : "valeur de 0,1 à 100 000, un chiffre après la virgule maximum"}.`,
    );
  return n;
};
const bool = (v, label) => {
  if (typeof v !== "boolean") throw Error(`${label} : valeur oui/non requise.`);
  return v;
};
export function normalizePart(p) {
  if (!p || typeof p !== "object" || Array.isArray(p))
    throw Error("Pièce illisible.");
  const out = {
    id: text(p.id, "Identifiant", true, 80),
    label: text(p.label, "Étiquette"),
    decor: text(p.decor, "Décor"),
    thickness: number(p.thickness, "Épaisseur"),
    quantity: number(p.quantity, "Quantité", true),
    length: number(p.length, "Longueur"),
    width: number(p.width, "Largeur"),
    edgeType: text(p.edgeType ?? "", "Type de chant", false),
    machining: text(p.machining ?? "", "Usinage", false),
    notes: text(p.notes ?? "", "Remarque", false, 500),
  };
  if (["__proto__", "constructor", "prototype"].includes(out.id))
    throw Error(
      "Identifiant réservé : choisissez une autre référence de pièce.",
    );
  for (const edge of edges) out[edge] = bool(p[edge], edge);
  if (!edgeTypes.includes(out.edgeType))
    throw Error("Type de chant non reconnu.");
  if (!machiningTypes.includes(out.machining))
    throw Error("Usinage non reconnu.");
  if ([...edges].some((e) => out[e]) && !out.edgeType)
    throw Error("Choisissez un type de chant pour les côtés cochés.");
  return out;
}
export function normalizeParts(parts, { allowEmpty = false } = {}) {
  if (
    !Array.isArray(parts) ||
    parts.length > 500 ||
    (!allowEmpty && !parts.length)
  )
    throw Error("Une version doit contenir de 1 à 500 pièces.");
  const ids = new Set(),
    labels = new Set();
  return parts.map((p, i) => {
    let out;
    try {
      out = normalizePart(p);
    } catch (e) {
      throw Error(`Ligne ${i + 1} : ${e.message}`);
    }
    if (ids.has(out.id))
      throw Error(
        `Identifiant répété « ${out.id} ». Une clé stable par pièce est nécessaire.`,
      );
    if (labels.has(out.label.toLocaleLowerCase("fr")))
      throw Error(
        `Étiquette répétée « ${out.label} ». Distinguez les pièces pour la relecture.`,
      );
    ids.add(out.id);
    labels.add(out.label.toLocaleLowerCase("fr"));
    return out;
  });
}
export function parsePartsCSV(csv) {
  const { rows } = parseCsv(csv, { requiredHeaders: columns, maxRows: 500 });
  const flag = (v, label) => {
    if (!["0", "1"].includes(v))
      throw Error(`${label} : utilisez 0 ou 1 pour les chants.`);
    return v === "1";
  };
  return normalizeParts(
    rows.map((r, i) => ({
      id: r.id,
      label: r.etiquette,
      decor: r.decor,
      thickness: r.epaisseur,
      quantity: r.quantite,
      length: r.longueur,
      width: r.largeur,
      edgeType: r.chant,
      front: flag(r.avant, `Ligne ${i + 1}, avant`),
      back: flag(r.arriere, `Ligne ${i + 1}, arrière`),
      left: flag(r.gauche, `Ligne ${i + 1}, gauche`),
      right: flag(r.droit, `Ligne ${i + 1}, droit`),
      machining: r.usinage,
      notes: r.remarque,
    })),
  );
}
export function partRows(parts) {
  return parts.map((p) => [
    p.id,
    p.label,
    p.decor,
    p.thickness,
    p.quantity,
    p.length,
    p.width,
    p.edgeType,
    +p.front,
    +p.back,
    +p.left,
    +p.right,
    p.machining,
    p.notes,
  ]);
}
export function fingerprint(before, after) {
  return JSON.stringify([
    before ? fields.map(([k]) => before[k]) : null,
    after ? fields.map(([k]) => after[k]) : null,
  ]);
}
export function comparisons(d) {
  const ids = [
    ...new Set([...d.before.map((p) => p.id), ...d.after.map((p) => p.id)]),
  ];
  return ids.map((id) => {
    const before = d.before.find((p) => p.id === id),
      after = d.after.find((p) => p.id === id);
    const changes =
      before && after
        ? fields
            .filter(([k]) => before[k] !== after[k])
            .map(([key, label]) => ({
              key,
              label,
              before: before[key],
              after: after[key],
            }))
        : [];
    const status = !before
      ? "added"
      : !after
        ? "removed"
        : changes.length
          ? "changed"
          : "same";
    const swapped = !!(
      before &&
      after &&
      before.length !== before.width &&
      before.length === after.width &&
      before.width === after.length
    );
    return {
      id,
      before,
      after,
      changes,
      status,
      swapped,
      label: (after || before).label,
      reviewed:
        status !== "same" && d.reviews[id] === fingerprint(before, after),
    };
  });
}
export function setReview(d, id) {
  const c = comparisons(d).find((c) => c.id === id);
  if (!c || c.status === "same")
    throw Error("Aucune modification à relire sur cette pièce.");
  const next = structuredClone(d);
  if (c.reviewed) delete next.reviews[id];
  else next.reviews[id] = fingerprint(c.before, c.after);
  return next;
}
export function replacePart(d, p) {
  const part = normalizePart(p),
    next = structuredClone(d),
    i = next.after.findIndex((v) => v.id === part.id);
  if (i < 0) next.after.push(part);
  else next.after[i] = part;
  next.after = normalizeParts(next.after, { allowEmpty: true });
  return next;
}
export function deletePart(d, id) {
  const next = structuredClone(d);
  next.after = next.after.filter((p) => p.id !== id);
  return next;
}
export function normalizeDossier(d) {
  if (!d || d.version !== 1) throw Error("Dossier SOMADEC version 1 attendu.");
  const before = normalizeParts(d.before),
    after = normalizeParts(d.after, { allowEmpty: true });
  const ids = new Set([...before, ...after].map((p) => p.id)),
    reviews = {};
  if (!d.reviews || typeof d.reviews !== "object" || Array.isArray(d.reviews))
    throw Error("Relectures illisibles.");
  for (const [id, value] of Object.entries(d.reviews))
    if (ids.has(id) && typeof value === "string" && value.length < 6000)
      reviews[id] = value;
  if (!Array.isArray(d.journal) || d.journal.length > 500)
    throw Error("Journal invalide.");
  return {
    version: 1,
    project: text(d.project, "Projet"),
    beforeLabel: text(d.beforeLabel, "Nom de version initiale"),
    afterLabel: text(d.afterLabel, "Nom de nouvelle version"),
    before,
    after,
    reviews,
    journal: d.journal.map((j) => ({
      at: text(j.at, "Heure", true, 40),
      action: text(j.action, "Action", true, 700),
    })),
  };
}
export const validDossier = (d) => {
  try {
    normalizeDossier(d);
    return true;
  } catch {
    return false;
  }
};
export function formatValue(key, value) {
  if (edges.has(key)) return value ? "Oui" : "Non";
  if (numeric.has(key))
    return `${Number(value).toLocaleString("fr-FR")}${key === "quantity" ? "" : " mm"}`;
  return value || "Aucun";
}
const part = (id, label, length, width, opts = {}) => ({
  id,
  label,
  decor: "Chêne clair fictif",
  thickness: 19,
  quantity: 1,
  length,
  width,
  edgeType: "ABS 2 mm",
  front: true,
  back: false,
  left: true,
  right: false,
  machining: "",
  notes: "",
  ...opts,
});
export const initial = {
  version: 1,
  project: "Meuble d’accueil · exemple",
  beforeLabel: "Client · version 1",
  afterLabel: "Client · version 2",
  before: [
    part("P-01", "Joue droite", 2400, 580),
    part("P-02", "Étagère", 760, 380, { quantity: 3 }),
    part("P-03", "Traverse", 760, 90, { left: false }),
    part("P-04", "Fond", 2300, 760, {
      thickness: 8,
      edgeType: "",
      front: false,
      left: false,
    }),
  ],
  after: [
    part("P-01", "Joue droite", 2400, 600, { right: true }),
    part("P-02", "Étagère", 380, 760, { quantity: 3 }),
    part("P-03", "Traverse", 760, 90, {
      front: false,
      back: true,
      left: false,
    }),
    part("P-05", "Plinthe", 760, 100, {
      left: false,
      notes: "Pièce ajoutée au second envoi",
    }),
  ],
  reviews: {},
  journal: [],
};

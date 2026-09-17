import { parseCsv } from "../../shared/files.js";

export const fields = [
  ["reference", "Repère"],
  ["quantity", "Quantité"],
  ["width", "Largeur"],
  ["height", "Hauteur"],
  ["unit", "Unité"],
  ["shape", "Forme"],
  ["plan", "Référence du plan"],
];
export const shapes = ["rectangle", "cintrée", "ronde", "autre"];
const reserved = ["__proto__", "constructor", "prototype"];
const clone = (x) => structuredClone(x);
function txt(v, max = 300) {
  if (typeof v !== "string" || v.length > max)
    throw Error("Une valeur texte est attendue (300 caractères maximum).");
  return v;
}
function record(x) {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw Error("Objet attendu.");
  return x;
}
function same(a, b) {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]))
  );
}
export function parseOrder(text) {
  const p = parseCsv(text, { maxRows: 500 });
  if (!p.rows.length)
    throw Error("Le CSV ne contient aucune ligne de données.");
  return normalizeTable({
    headers: p.headers,
    rows: p.rows.map((r) => p.headers.map((h) => r[h])),
  });
}
function normalizeTable(t) {
  record(t);
  if (!Array.isArray(t.headers) || !t.headers.length || t.headers.length > 40)
    throw Error("Le fichier doit comporter 1 à 40 colonnes.");
  const headers = t.headers.map((h) => txt(h, 80).trim());
  if (
    headers.some((h) => !h || reserved.includes(h)) ||
    new Set(headers).size !== headers.length
  )
    throw Error("Noms de colonnes vides, réservés ou dupliqués.");
  if (!Array.isArray(t.rows) || !t.rows.length || t.rows.length > 500)
    throw Error("Le fichier doit comporter 1 à 500 lignes.");
  const rows = t.rows.map((r) => {
    if (!Array.isArray(r) || r.length !== headers.length)
      throw Error("Nombre de colonnes incohérent.");
    return r.map((v) => txt(v));
  });
  return { headers, rows };
}
export function suggestedMapping(table) {
  const aliases = {
    reference: ["Position", "Repère", "reference"],
    quantity: ["Nb", "Quantité", "quantity"],
    width: ["Largeur", "width"],
    height: ["Hauteur", "height"],
    unit: ["Unité", "unit"],
    shape: ["Forme", "shape"],
    plan: ["Plan", "plan"],
  };
  return Object.fromEntries(
    fields.map(([k]) => [
      k,
      aliases[k].find((h) => table.headers.includes(h)) || "",
    ]),
  );
}
function normalizeMapping(mapping, table) {
  record(mapping);
  const out = Object.fromEntries(
    fields.map(([k]) => {
      const h = txt(mapping[k], 80);
      if (h && !table.headers.includes(h))
        throw Error("Colonne associée absente du fichier.");
      return [k, h];
    }),
  );
  const chosen = Object.values(out).filter(Boolean);
  if (new Set(chosen).size !== chosen.length)
    throw Error("Une colonne ne peut alimenter deux champs différents.");
  return out;
}
function normalizedValues(v) {
  record(v);
  return Object.fromEntries(fields.map(([k]) => [k, txt(v[k])]));
}
function journal(j) {
  if (!Array.isArray(j) || j.length > 300) throw Error("Journal invalide.");
  return j.map((e) => {
    record(e);
    const at = txt(e.at, 40),
      action = txt(e.action, 500);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) ||
      !Number.isFinite(Date.parse(at)) ||
      new Date(at).toISOString() !== at
    )
      throw Error("Date de journal invalide.");
    return { at, action };
  });
}
export function normalizeDossier(d) {
  record(d);
  if (d.version !== 1) throw Error("Version de dossier non reconnue.");
  const table = normalizeTable(d.table),
    mapping = normalizeMapping(d.mapping, table);
  const fallbackUnit = txt(d.fallbackUnit, 2);
  if (!["", "mm", "cm", "m"].includes(fallbackUnit))
    throw Error("Unité de fichier invalide.");
  if (!Array.isArray(d.edits) || d.edits.length > 500)
    throw Error("Corrections invalides.");
  const seen = new Set(),
    edits = d.edits.map((e) => {
      record(e);
      if (
        !Number.isInteger(e.line) ||
        e.line < 1 ||
        e.line > table.rows.length ||
        seen.has(e.line)
      )
        throw Error("Ligne de correction invalide.");
      seen.add(e.line);
      const reason = txt(e.reason).trim();
      if (!reason) throw Error("Motif de correction obligatoire.");
      return { line: e.line, values: normalizedValues(e.values), reason };
    });
  return {
    version: 1,
    name: txt(d.name, 160),
    table,
    mapping,
    fallbackUnit,
    edits,
    journal: journal(d.journal),
  };
}
export function validDossier(d) {
  try {
    return same(d, normalizeDossier(d));
  } catch {
    return false;
  }
}
export function sourceValues(d, line) {
  const row = d.table.rows[line - 1];
  if (!row) throw Error("Ligne absente.");
  return Object.fromEntries(
    fields.map(([k]) => [
      k,
      d.mapping[k] ? row[d.table.headers.indexOf(d.mapping[k])] : "",
    ]),
  );
}
export function effectiveValues(d, line) {
  const edit = d.edits.find((e) => e.line === line);
  if (edit) return clone(edit.values);
  const source = sourceValues(d, line);
  return { ...source, unit: source.unit.trim() ? source.unit : d.fallbackUnit };
}
export function dimensionMm(raw, unit) {
  const value = raw.trim();
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const thousand = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  const factor = { mm: 1, cm: 10, m: 1000 }[unit];
  if (!factor || !Number.isSafeInteger(thousand) || thousand <= 0) return null;
  const microns = thousand * factor;
  if (!Number.isSafeInteger(microns) || microns > 1e9) return null;
  return microns / 1000;
}
export function analyze(d) {
  const refs = new Map();
  const rows = d.table.rows.map((_, i) => {
    const line = i + 1,
      source = sourceValues(d, line),
      v = effectiveValues(d, line);
    const reference = v.reference.trim(),
      unit = v.unit.trim().toLowerCase(),
      shape = v.shape.trim().toLowerCase(),
      quantity = /^[1-9]\d{0,3}$/.test(v.quantity.trim())
        ? Number(v.quantity)
        : null;
    const widthMm = dimensionMm(v.width, unit),
      heightMm = dimensionMm(v.height, unit),
      issues = [];
    if (!reference || reserved.includes(reference) || reference.length > 80)
      issues.push({
        code: "reference",
        message: "Un repère de 1 à 80 caractères est nécessaire.",
      });
    if (quantity === null)
      issues.push({
        code: "quantity",
        message: "Quantité entière de 1 à 9 999 attendue.",
      });
    if (!["mm", "cm", "m"].includes(unit))
      issues.push({
        code: "unit",
        message: "Confirmer l’unité : mm, cm ou m.",
      });
    if (widthMm === null)
      issues.push({
        code: "width",
        message: ["mm", "cm", "m"].includes(unit)
          ? "Largeur positive, sans séparateur de milliers et avec au plus trois décimales attendue."
          : "Largeur non convertie sans unité connue.",
      });
    if (heightMm === null)
      issues.push({
        code: "height",
        message: ["mm", "cm", "m"].includes(unit)
          ? "Hauteur positive, sans séparateur de milliers et avec au plus trois décimales attendue."
          : "Hauteur non convertie sans unité connue.",
      });
    if (!shapes.includes(shape))
      issues.push({
        code: "shape",
        message: "Préciser la forme de l’ouverture.",
      });
    if (shapes.includes(shape) && shape !== "rectangle" && !v.plan.trim())
      issues.push({
        code: "plan",
        message:
          "Référence de plan à préciser pour cette forme. Le plan restera à examiner par le bureau d’études.",
      });
    if (reference) {
      if (!refs.has(reference)) refs.set(reference, []);
      refs.get(reference).push(line);
    }
    return {
      line,
      source,
      values: v,
      reference,
      quantity,
      widthMm,
      heightMm,
      unit,
      shape,
      plan: v.plan.trim(),
      issues,
      edit: d.edits.find((e) => e.line === line) || null,
    };
  });
  for (const r of rows) {
    if (refs.get(r.reference)?.length > 1)
      r.issues.unshift({
        code: "duplicate",
        message: `Repère partagé avec les lignes ${refs
          .get(r.reference)
          .filter((x) => x !== r.line)
          .join(", ")}. Les lignes restent distinctes.`,
      });
    r.ready = r.issues.length === 0;
  }
  return {
    rows,
    ready: rows.filter((r) => r.ready),
    pending: rows.filter((r) => !r.ready),
  };
}
function log(d, at, action) {
  return normalizeDossier({
    ...d,
    journal: [...d.journal, { at, action }].slice(-300),
  });
}
export function correctLine(d, line, values, reason, at) {
  if (!reason.trim()) throw Error("Motif de correction obligatoire.");
  return log(
    {
      ...d,
      edits: [
        ...d.edits.filter((e) => e.line !== line),
        { line, values: normalizedValues(values), reason: reason.trim() },
      ],
    },
    at,
    `Ligne ${line} corrigée : ${reason.trim()}`,
  );
}
export function removeCorrection(d, line, at) {
  return log(
    { ...d, edits: d.edits.filter((e) => e.line !== line) },
    at,
    `Correction de la ligne ${line} retirée`,
  );
}
export function changeMapping(d, mapping, fallbackUnit, at) {
  const normalized = normalizeMapping(mapping, d.table);
  if (same(normalized, d.mapping) && fallbackUnit === d.fallbackUnit) return d;
  return log(
    { ...d, mapping: normalized, fallbackUnit, edits: [] },
    at,
    "Correspondance des colonnes appliquée ; corrections de lignes réinitialisées",
  );
}
export function replaceOrder(d, table, name, at) {
  const t = normalizeTable(table);
  if (same(t, d.table))
    return log(
      d,
      at,
      "Fichier identique réimporté ; corrections et correspondances conservées",
    );
  return log(
    {
      ...d,
      name,
      table: t,
      mapping: suggestedMapping(t),
      fallbackUnit: "",
      edits: [],
    },
    at,
    `Nouveau fichier ${name} : correspondances suggérées et corrections réinitialisées`,
  );
}
export const outputHeaders = [
  "ligne_source",
  "repere",
  "quantite",
  "largeur_mm",
  "hauteur_mm",
  "forme",
  "reference_plan",
  "note_correction",
];
export function outputRows(d) {
  return analyze(d).ready.map((r) => [
    r.line,
    r.reference,
    r.quantity,
    r.widthMm,
    r.heightMm,
    r.shape,
    r.plan,
    r.edit?.reason || "",
  ]);
}
export function questionText(d) {
  const a = analyze(d);
  return [
    "Demande de précisions — dossier fictif",
    `Fichier : ${d.name}`,
    "",
    ...a.pending.flatMap((r) => [
      `Ligne de données ${r.line}, repère ${r.reference || "non renseigné"}`,
      ...r.issues.map((i) => "- " + i.message),
      "",
    ]),
    a.pending.length
      ? "Merci de confirmer ces points avant la préparation du dossier."
      : "Aucun champ à préciser dans ce contrôle de données.",
    "La faisabilité, les performances et la conformité de fabrication restent à vérifier par le bureau d’études.",
  ].join("\n");
}
export const exampleCsv =
  "Position;Nb;Largeur;Hauteur;Unité;Forme;Plan\nF-01;2;900;1200;mm;rectangle;\nF-02;1;80;125;;rectangle;\nF-03;2;1,1;1,5;m;cintrée;\nF-04;1;100;130;cm;rectangle;\nF-04;1;700;900;mm;rectangle;";
export function initialDossier() {
  const table = parseOrder(exampleCsv);
  return {
    version: 1,
    name: "commande-fictive.csv",
    table,
    mapping: suggestedMapping(table),
    fallbackUnit: "",
    edits: [],
    journal: [],
  };
}

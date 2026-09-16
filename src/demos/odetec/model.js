import { parseCsv } from "../../shared/files.js";

export const schemas = {
  projects: { label: "Projets", columns: ["id", "titre", "ville"] },
  lots: { label: "Lots", columns: ["id", "titre", "projet"] },
  deliverables: {
    label: "Livrables",
    columns: ["id", "titre", "projet", "lot", "revision"],
  },
};
export const labels = {
  id: "Code stable",
  titre: "Intitulé",
  ville: "Ville",
  projet: "Projet",
  lot: "Lot",
  revision: "Révision",
};
const tables = Object.keys(schemas);
const key = (value) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 80 ||
    !/^[\p{L}\p{N}._ -]+$/u.test(value.trim()) ||
    ["__proto__", "constructor", "prototype"].includes(value.trim())
  )
    throw Error(
      "Code invalide : 1 à 80 lettres, chiffres, espaces, points, tirets ou tirets bas.",
    );
  return value.trim();
};
const text = (value, name, max = 200) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw Error(`${name} : texte obligatoire, ${max} caractères maximum.`);
  return value.trim();
};
export function normalizeRows(table, rows) {
  if (!tables.includes(table)) throw Error("Table inconnue.");
  if (!Array.isArray(rows) || !rows.length || rows.length > 300)
    throw Error("Chaque table doit contenir de 1 à 300 lignes.");
  const ids = new Set();
  return rows.map((row, i) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw Error(`Ligne ${i + 1} illisible.`);
    const out = {};
    for (const field of schemas[table].columns)
      out[field] = ["id", "projet", "lot"].includes(field)
        ? key(row[field])
        : text(row[field], labels[field]);
    if (ids.has(out.id))
      throw Error(`Code répété ${out.id} dans ${schemas[table].label}.`);
    ids.add(out.id);
    return out;
  });
}
export function parseTable(table, csv) {
  if (!tables.includes(table)) throw Error("Table inconnue.");
  return normalizeRows(
    table,
    parseCsv(csv, { requiredHeaders: schemas[table].columns, maxRows: 300 })
      .rows,
  );
}
export function normalizeDossier(d) {
  if (!d || d.version !== 1) throw Error("Dossier ODETEC version 1 attendu.");
  const source = {};
  for (const table of tables)
    source[table] = normalizeRows(table, d.source?.[table]);
  if (
    !Array.isArray(d.edits) ||
    d.edits.length > 900 ||
    !Array.isArray(d.mappings) ||
    d.mappings.length > 600 ||
    !Array.isArray(d.journal) ||
    d.journal.length > 500
  )
    throw Error("Décisions ou journal illisibles.");
  const used = new Set();
  const edits = d.edits.map((e) => {
    if (
      !e ||
      !tables.includes(e.table) ||
      !source[e.table].some((r) => r.id === e.id) ||
      used.has(`${e.table}|${e.id}`)
    )
      throw Error("Correction sans ligne source ou répétée.");
    const raw = source[e.table].find((r) => r.id === e.id);
    const row = normalizeRows(e.table, [
      { ...raw, ...e.values, id: raw.id },
    ])[0];
    used.add(`${e.table}|${e.id}`);
    return {
      table: e.table,
      id: raw.id,
      values: Object.fromEntries(
        schemas[e.table].columns
          .filter((f) => f !== "id")
          .map((f) => [f, row[f]]),
      ),
    };
  });
  const mapped = new Set();
  const mappings = d.mappings.map((m) => {
    const old = key(m.old),
      target = key(m.target);
    if (
      mapped.has(old) ||
      source.projects.some((p) => p.id === old) ||
      !source.projects.some((p) => p.id === target)
    )
      throw Error("Correspondance projet ambiguë ou cible absente.");
    mapped.add(old);
    return { old, target };
  });
  return {
    version: 1,
    source,
    edits,
    mappings,
    journal: d.journal.map((j) => ({
      at: text(j.at, "Heure", 50),
      action: text(j.action, "Action", 800),
    })),
  };
}
export const validDossier = (d) => {
  try {
    const normalized = normalizeDossier(d);
    const sameShape = (a, b) => {
      if (a === b) return true;
      if (!a || !b || typeof a !== "object" || typeof b !== "object")
        return false;
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      const keys = Object.keys(a);
      return (
        keys.length === Object.keys(b).length &&
        keys.every(
          (field) => Object.hasOwn(b, field) && sameShape(a[field], b[field]),
        )
      );
    };
    return sameShape(d, normalized);
  } catch {
    return false;
  }
};
export function prepared(d) {
  const byTable = {};
  for (const table of tables)
    byTable[table] = d.source[table].map((raw) => ({
      ...raw,
      ...d.edits.find((e) => e.table === table && e.id === raw.id)?.values,
      id: raw.id,
    }));
  const projectIds = new Set(byTable.projects.map((p) => p.id)),
    aliases = new Map(d.mappings.map((m) => [m.old, m.target]));
  const resolve = (v) => (projectIds.has(v) ? v : aliases.get(v) || null);
  const issues = [],
    effects = [];
  for (const table of ["lots", "deliverables"])
    byTable[table] = byTable[table].map((r) => {
      const resolved = resolve(r.projet);
      if (!resolved)
        issues.push({
          table,
          id: r.id,
          field: "projet",
          message: `Le code projet « ${r.projet} » n’a pas de cible.`,
          type: "missing-project",
        });
      if (resolved !== r.projet && resolved)
        effects.push({
          table,
          id: r.id,
          field: "projet",
          source: r.projet,
          target: resolved,
        });
      return { ...r, sourceProject: r.projet, projet: resolved };
    });
  for (const r of byTable.deliverables) {
    const lot = byTable.lots.find((l) => l.id === r.lot);
    if (!lot)
      issues.push({
        table: "deliverables",
        id: r.id,
        field: "lot",
        message: `Le lot « ${r.lot} » est absent.`,
        type: "missing-lot",
      });
    else if (r.projet && lot.projet && r.projet !== lot.projet)
      issues.push({
        table: "deliverables",
        id: r.id,
        field: "lot",
        message: `Le lot ${lot.id} appartient à ${lot.projet}, le livrable à ${r.projet}.`,
        type: "cross-project",
      });
    else if (!lot.projet)
      issues.push({
        table: "deliverables",
        id: r.id,
        field: "lot",
        message: `Le projet du lot ${lot.id} reste à résoudre.`,
        type: "unresolved-lot",
      });
  }
  const homonyms = byTable.projects.filter((p, i, a) =>
    a.some(
      (other, j) =>
        i !== j &&
        p.titre.toLocaleLowerCase("fr") === other.titre.toLocaleLowerCase("fr"),
    ),
  );
  return { tables: byTable, issues, effects, homonyms };
}
export function editRow(d, table, id, values) {
  const next = structuredClone(d),
    raw = d.source[table]?.find((r) => r.id === id);
  if (!raw) throw Error("Ligne source absente.");
  const row = normalizeRows(table, [{ ...raw, ...values, id: raw.id }])[0];
  next.edits = next.edits.filter((e) => e.table !== table || e.id !== id);
  if (schemas[table].columns.some((f) => row[f] !== raw[f]))
    next.edits.push({
      table,
      id,
      values: Object.fromEntries(
        schemas[table].columns
          .filter((f) => f !== "id")
          .map((f) => [f, row[f]]),
      ),
    });
  return normalizeDossier(next);
}
export function mapProject(d, old, target) {
  const next = structuredClone(d);
  next.mappings = next.mappings.filter((m) => m.old !== old);
  if (target) next.mappings.push({ old, target });
  return normalizeDossier(next);
}
export function importTable(d, table, rows) {
  const next = structuredClone(d);
  next.source[table] = normalizeRows(table, rows);
  next.edits = next.edits.filter((e) => e.table !== table);
  if (table === "projects")
    next.mappings = next.mappings.filter(
      (m) =>
        next.source.projects.some((p) => p.id === m.target) &&
        !next.source.projects.some((p) => p.id === m.old),
    );
  return normalizeDossier(next);
}
export function manifest(d) {
  const result = prepared(d);
  if (result.issues.length)
    throw Error(
      "Résolvez les relations signalées avant de préparer les tables.",
    );
  return {
    format: "odetec-migration-v1",
    notice:
      "Exemple indépendant. Ces clés métier doivent être associées aux identifiants de pages cibles pendant une reprise séparée ; un import CSV ne crée pas ces relations.",
    creationOrder: ["projects", "lots", "deliverables"],
    counts: Object.fromEntries(tables.map((t) => [t, result.tables[t].length])),
    mappings: structuredClone(d.mappings),
    mappingEffects: result.effects,
    relations: [
      ...result.tables.lots.map((r) => ({
        table: "lots",
        id: r.id,
        property: "Projet",
        targetTable: "projects",
        targetId: r.projet,
        sourceValue: d.source.lots.find((s) => s.id === r.id).projet,
      })),
      ...result.tables.deliverables.flatMap((r) => [
        {
          table: "deliverables",
          id: r.id,
          property: "Projet",
          targetTable: "projects",
          targetId: r.projet,
          sourceValue: d.source.deliverables.find((s) => s.id === r.id).projet,
        },
        {
          table: "deliverables",
          id: r.id,
          property: "Lot",
          targetTable: "lots",
          targetId: r.lot,
          sourceValue: d.source.deliverables.find((s) => s.id === r.id).lot,
        },
      ]),
    ],
    edits: structuredClone(d.edits),
  };
}
export const initial = {
  version: 1,
  source: {
    projects: [
      { id: "P-101", titre: "École des Tilleuls", ville: "Ville témoin A" },
      { id: "P-102", titre: "École des Tilleuls", ville: "Ville témoin B" },
    ],
    lots: [
      { id: "L-01", titre: "Structure", projet: "P-101" },
      { id: "L-02", titre: "Fluides", projet: "P-102" },
      { id: "L-03", titre: "Électricité", projet: "ancien-102" },
    ],
    deliverables: [
      {
        id: "D-01",
        titre: "Note structure",
        projet: "P-101",
        lot: "L-01",
        revision: "A",
      },
      {
        id: "D-02",
        titre: "Plan des réseaux",
        projet: "P-102",
        lot: "L-02",
        revision: "B",
      },
      {
        id: "D-03",
        titre: "Synoptique électrique",
        projet: "ancien-102",
        lot: "L-03",
        revision: "A",
      },
      {
        id: "D-04",
        titre: "Schéma de principe",
        projet: "P-102",
        lot: "L-01",
        revision: "A",
      },
    ],
  },
  edits: [],
  mappings: [],
  journal: [],
};

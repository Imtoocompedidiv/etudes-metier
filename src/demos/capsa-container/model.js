export const bomHeaders = [
  "node",
  "parent",
  "reference",
  "indice",
  "designation",
  "quantite",
  "unite",
  "type",
];
export const mapHeaders = [
  "reference",
  "indice",
  "unite",
  "article",
  "unite_cible",
  "delai",
];
export const planHeaders = ["racine", "modules", "besoin"];
export const units = {
  u: ["compte", 1000000],
  ens: ["ensemble", 1000000],
  m: ["longueur", 1000000],
  cm: ["longueur", 10000],
  mm: ["longueur", 1000],
  m2: ["surface", 1000000],
  cm2: ["surface", 100],
  kg: ["masse", 1000000],
  g: ["masse", 1000],
};
const MICRO = 1000000n;
const clone = (value) => structuredClone(value);
const keyParts = (...parts) => JSON.stringify(parts);
export const mappingKey = (row) =>
  keyParts(row.reference, row.indice, row.unite);
function text(value, label, optional = false) {
  if (
    typeof value !== "string" ||
    value.length > 180 ||
    (!optional && !value.trim())
  )
    throw Error(
      `${label} : texte ${optional ? "de 180 caractères maximum" : "obligatoire, 180 caractères maximum"}.`,
    );
  return value.trim();
}
function list(value, label, max = 500) {
  if (!Array.isArray(value) || value.length > max)
    throw Error(`${label} : liste attendue, ${max} lignes maximum.`);
  return value;
}
function decimal(value, label) {
  const s = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!/^\d+(?:\.\d{1,6})?$/.test(s) || Number(s) <= 0 || Number(s) > 100000)
    throw Error(
      `${label} : nombre positif inférieur ou égal à 100000, six décimales maximum.`,
    );
  return Number(s);
}
function integer(value, label, min, max) {
  const s = String(value ?? "").trim();
  if (!/^\d+$/.test(s) || Number(s) < min || Number(s) > max)
    throw Error(`${label} : entier de ${min} à ${max} attendu.`);
  return Number(s);
}
export function isoDate(value) {
  const s = String(value ?? "");
  const d = new Date(`${s}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== s ||
    s < "2000-01-01" ||
    s > "2100-12-31"
  )
    throw Error("Date impossible : utiliser AAAA-MM-JJ, entre 2000 et 2100.");
  return s;
}
function unit(value, label) {
  if (typeof value !== "string" || !Object.hasOwn(units, value))
    throw Error(`${label} : unité inconnue.`);
  return value;
}
function micro(value) {
  return BigInt(Math.round(value * 1000000));
}
function finalQuantity(n, d) {
  const q = (n * MICRO + d / 2n) / d;
  if (q <= 0n || q > 1000000000000000n)
    throw Error(
      "Quantité dépliée hors précision : de 0,000001 à 1 000 000 000.",
    );
  return Number(q) / 1000000;
}

export function parseBom(input) {
  const rows = list(input, "Nomenclature").map((r, i) => {
    if (!r || typeof r !== "object") throw Error(`Ligne ${i + 1} illisible.`);
    const out = {};
    for (const k of ["node", "parent", "reference", "indice", "designation"])
      out[k] = text(r[k], `Ligne ${i + 1}, ${k}`, k === "parent");
    out.quantite = decimal(r.quantite, `Ligne ${i + 1}, quantité`);
    out.unite = unit(r.unite, `Ligne ${i + 1}`);
    if (!["ensemble", "article"].includes(r.type))
      throw Error(`Ligne ${i + 1} : type ensemble ou article attendu.`);
    out.type = r.type;
    out.sourceLine = i + 2;
    if (out.type === "ensemble" && !["ens", "u"].includes(out.unite))
      throw Error(`Ligne ${i + 1} : un ensemble doit être compté en ens ou u.`);
    return out;
  });
  if (!rows.length)
    throw Error("La nomenclature doit contenir au moins une ligne.");
  const byId = new Map();
  for (const row of rows) {
    if (byId.has(row.node))
      throw Error(`Identifiant ${row.node} présent deux fois.`);
    byId.set(row.node, row);
  }
  const children = new Map();
  for (const row of rows) {
    if (row.parent) {
      const parent = byId.get(row.parent);
      if (!parent) throw Error(`${row.node} : parent ${row.parent} absent.`);
      if (parent.type !== "ensemble")
        throw Error(`${row.node} : le parent doit être un ensemble.`);
      children.set(row.parent, [...(children.get(row.parent) || []), row.node]);
    }
  }
  for (const row of rows) {
    const seen = new Set();
    let current = row;
    while (current) {
      if (seen.has(current.node))
        throw Error(`Cycle détecté depuis ${row.node}.`);
      seen.add(current.node);
      if (seen.size > 32)
        throw Error("La profondeur maximale est de 32 niveaux.");
      current = byId.get(current.parent);
    }
    if (row.type === "ensemble" && !children.has(row.node))
      throw Error(`${row.node} : ensemble sans composant.`);
  }
  return rows;
}
export function parseMappings(input) {
  const seen = new Set();
  return list(input, "Correspondances", 1000).map((r, i) => {
    const row = {
      reference: text(r.reference, `Correspondance ${i + 1}, référence`),
      indice: text(r.indice, `Correspondance ${i + 1}, indice`),
      unite: unit(r.unite, `Correspondance ${i + 1}`),
      article: text(r.article, `Correspondance ${i + 1}, article`),
      unite_cible: unit(r.unite_cible, `Correspondance ${i + 1}, cible`),
      delai:
        r.delai === null || String(r.delai ?? "").trim() === ""
          ? null
          : integer(r.delai, `Correspondance ${i + 1}, délai`, 0, 730),
    };
    if (units[row.unite][0] !== units[row.unite_cible][0])
      throw Error(
        `Correspondance ${i + 1} : unités de dimensions incompatibles.`,
      );
    const key = mappingKey(row);
    if (seen.has(key))
      throw Error(
        `Correspondance ${i + 1} : référence, indice et unité déjà définis.`,
      );
    seen.add(key);
    return row;
  });
}
export function parsePlans(input) {
  const seen = new Set();
  return list(input, "Planning").map((r, i) => {
    const racine = text(r.racine, `Planning ${i + 1}, racine`);
    if (seen.has(racine)) throw Error(`Planning : racine ${racine} en double.`);
    seen.add(racine);
    return {
      racine,
      modules: integer(r.modules, `Planning ${i + 1}, modules`, 1, 10000),
      besoin: isoDate(r.besoin),
    };
  });
}
export function normalizeProject(value) {
  if (!value || value.schema !== "capsa-nomenclature-v1")
    throw Error("Dossier attendu au format capsa-nomenclature-v1.");
  const versions = {
      A: parseBom(value.versions?.A),
      B: parseBom(value.versions?.B),
    },
    mappings = parseMappings(value.mappings),
    plans = parsePlans(value.plans);
  return { schema: value.schema, versions, mappings, plans };
}
export function validProject(value) {
  try {
    normalizeProject(value);
    return true;
  } catch {
    return false;
  }
}
export function subtractDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
export function analyse(project, revision) {
  if (!["A", "B"].includes(revision)) throw Error("Révision A ou B attendue.");
  const rows = project.versions[revision],
    byId = new Map(rows.map((r) => [r.node, r])),
    maps = new Map(project.mappings.map((r) => [mappingKey(r), r])),
    plans = new Map(project.plans.map((r) => [r.racine, r]));
  const details = rows.map((row) => {
    const path = [];
    let current = row;
    while (current) {
      path.unshift(current);
      current = byId.get(current.parent);
    }
    const plan = plans.get(path[0].node);
    let n = BigInt(plan?.modules || 1),
      d = 1n;
    for (const part of path) {
      n *= micro(part.quantite);
      d *= MICRO;
    }
    const issues = [];
    if (!plan) issues.push(`Planning absent pour ${path[0].node}`);
    let total = null;
    try {
      total = plan ? finalQuantity(n, d) : null;
    } catch (e) {
      issues.push(e.message);
    }
    const mapping = maps.get(mappingKey(row));
    let quantity = null,
      launch = null;
    if (row.type === "article") {
      if (!mapping) issues.push("Correspondance à renseigner");
      else {
        try {
          quantity = plan
            ? finalQuantity(
                n * BigInt(units[row.unite][1]),
                d * BigInt(units[mapping.unite_cible][1]),
              )
            : null;
        } catch (e) {
          issues.push(e.message);
        }
        if (mapping.delai === null)
          issues.push("Délai calendaire à renseigner");
        else if (plan) launch = subtractDays(plan.besoin, mapping.delai);
      }
    }
    return {
      ...row,
      path: path.map((p) => p.node),
      factorPath: path.map((p) => p.quantite),
      depth: path.length - 1,
      root: path[0].node,
      modules: plan?.modules ?? null,
      total,
      mapping,
      quantity,
      needBy: plan?.besoin || "",
      launch,
      issues,
    };
  });
  const targetUnits = new Map();
  for (const row of details.filter((r) => r.type === "article" && r.mapping)) {
    const key = keyParts(row.mapping.article, row.indice);
    if (!targetUnits.has(key)) targetUnits.set(key, new Set());
    targetUnits.get(key).add(row.mapping.unite_cible);
  }
  for (const row of details.filter((r) => r.type === "article" && r.mapping)) {
    if (targetUnits.get(keyParts(row.mapping.article, row.indice)).size > 1)
      row.issues.push(
        "Plusieurs unités cibles pour le même article et indice : harmonisez les correspondances.",
      );
  }
  const grouped = new Map();
  for (const row of details.filter((r) => r.type === "article")) {
    const article = row.mapping?.article || `Non résolu (${row.reference})`,
      target = row.mapping?.unite_cible || row.unite;
    const key = keyParts(article, row.indice, target, row.needBy);
    if (!grouped.has(key))
      grouped.set(key, {
        key,
        article,
        indice: row.indice,
        unite: target,
        besoin: row.needBy,
        quantite: 0,
        lancement: row.launch,
        provenance: [],
        issues: [],
      });
    const group = grouped.get(key);
    if (row.quantity !== null && group.quantite !== null) {
      group.quantite =
        Math.round((group.quantite + row.quantity) * 1000000) / 1000000;
      if (group.quantite > 1e9)
        group.issues.push("Quantité agrégée supérieure à la limite.");
    } else group.quantite = null;
    if (group.lancement && row.launch && row.launch < group.lancement)
      group.lancement = row.launch;
    else if (!row.launch) group.lancement = null;
    group.provenance.push({
      revision,
      node: row.node,
      line: row.sourceLine,
      path: row.path.join(" > "),
      reference: row.reference,
      indice: row.indice,
      quantite: row.quantity,
      delai: row.mapping?.delai ?? null,
    });
    group.issues.push(...row.issues);
  }
  const groups = [...grouped.values()].map((g) => ({
    ...g,
    issues: [...new Set(g.issues)],
  }));
  const blockers = details.flatMap((r) =>
    r.issues.map((message) => ({ node: r.node, message })),
  );
  for (const group of groups)
    for (const message of group.issues) {
      if (!blockers.some((b) => b.message === message))
        blockers.push({ node: group.article, message });
    }
  return {
    details,
    groups,
    blockers,
    exportable: blockers.length === 0 && groups.every((g) => !g.issues.length),
  };
}
export function compareVersions(project) {
  const before = analyse(project, "A"),
    after = analyse(project, "B");
  const left = new Map(before.groups.map((g) => [g.key, g])),
    right = new Map(after.groups.map((g) => [g.key, g]));
  return [...new Set([...left.keys(), ...right.keys()])].map((key) => {
    const a = left.get(key),
      b = right.get(key),
      base = b || a;
    const previous = a ? a.quantite : 0,
      current = b ? b.quantite : 0,
      delta =
        previous === null || current === null
          ? null
          : Math.round((current - previous) * 1000000) / 1000000;
    return {
      ...base,
      previous,
      current,
      delta,
      status: !a
        ? "Ajout"
        : !b
          ? "Retrait"
          : delta === null
            ? "À préciser"
            : delta === 0
              ? a.lancement === b.lancement
                ? "Identique"
                : "Date modifiée"
              : "Modification",
      beforeLaunch: a?.lancement || "",
      afterLaunch: b?.lancement || "",
      issues: [...new Set([...(a?.issues || []), ...(b?.issues || [])])],
      beforeSources: a?.provenance || [],
      afterSources: b?.provenance || [],
    };
  });
}
export function setMapping(project, raw) {
  const [mapping] = parseMappings([raw]);
  const key = mappingKey(mapping);
  return normalizeProject({
    ...project,
    mappings: [
      ...project.mappings.filter((m) => mappingKey(m) !== key),
      mapping,
    ],
  });
}
export function editRow(project, revision, node, patch) {
  if (!["A", "B"].includes(revision)) throw Error("Révision inconnue.");
  return normalizeProject({
    ...project,
    versions: {
      ...project.versions,
      [revision]: project.versions[revision].map((r) =>
        r.node === node ? { ...r, ...patch, node: r.node } : r,
      ),
    },
  });
}
export function preparationRows(project, revision) {
  const result = analyse(project, revision);
  if (!result.exportable)
    throw Error(
      "Complétez les correspondances, délais et plannings avant de préparer le lot.",
    );
  return result.groups.map((g) => ({
    revision,
    article: g.article,
    indice: g.indice,
    unite: g.unite,
    quantite: g.quantite,
    besoin: g.besoin,
    lancement: g.lancement,
    provenance: g.provenance
      .map((p) => `${p.revision} ligne ${p.line} : ${p.path} (${p.quantite})`)
      .join(" | "),
  }));
}
export const preparationHeaders = [
  "revision",
  "article",
  "indice",
  "unite",
  "quantite",
  "besoin",
  "lancement",
  "provenance",
];
export function diffRows(project) {
  return compareVersions(project).map((r) => ({
    article: r.article,
    indice: r.indice,
    unite: r.unite,
    besoin: r.besoin,
    revision_A: r.previous,
    revision_B: r.current,
    ecart: r.delta,
    nature: r.status,
    lancement_A: r.beforeLaunch,
    lancement_B: r.afterLaunch,
    points: r.issues.join(" ; "),
    sources_A: r.beforeSources.map((p) => p.path).join(" | "),
    sources_B: r.afterSources.map((p) => p.path).join(" | "),
  }));
}
export const diffHeaders = [
  "article",
  "indice",
  "unite",
  "besoin",
  "revision_A",
  "revision_B",
  "ecart",
  "nature",
  "lancement_A",
  "lancement_B",
  "points",
  "sources_A",
  "sources_B",
];
const base = [
  ["MOD-01", "", "MOD-01", "A", "Module bureau", 1, "ens", "ensemble"],
  ["PAR", "MOD-01", "LOT-PAR", "A", "Parois", 3, "ens", "ensemble"],
  ["PAN", "PAR", "PAN-18", "A", "Panneau", 4, "m2", "article"],
  ["RAIL", "PAR", "RAIL-02", "A", "Rail", 2, "m", "article"],
  ["ELE", "MOD-01", "LOT-ELE", "A", "Électricité", 1, "ens", "ensemble"],
  ["LUM", "ELE", "LED-12", "A", "Éclairage", 2, "u", "article"],
  ["CON", "ELE", "CON-02", "A", "Connectique", 1, "u", "article"],
  ["VIS", "PAR", "VIS-01", "A", "Visserie", 4, "u", "article"],
].map((values) =>
  Object.fromEntries(bomHeaders.map((key, i) => [key, values[i]])),
);
const revised = clone(base)
  .filter((r) => r.node !== "VIS")
  .map((r) =>
    r.node === "LUM"
      ? { ...r, reference: "LED-24" }
      : r.node === "CON"
        ? { ...r, quantite: 2 }
        : r,
  );
revised.push({
  node: "VENT",
  parent: "MOD-01",
  reference: "VENT-01",
  indice: "A",
  designation: "Ventilation",
  quantite: 1,
  unite: "u",
  type: "article",
});
export const seed = normalizeProject({
  schema: "capsa-nomenclature-v1",
  versions: { A: base, B: revised },
  plans: [{ racine: "MOD-01", modules: 3, besoin: "2026-10-09" }],
  mappings: [
    ["PAN-18", "m2", "ERP-PAN-18", "m2", 8],
    ["RAIL-02", "m", "ERP-RAIL-02", "m", 4],
    ["LED-12", "u", "ERP-LUM-012", "u", 5],
    ["CON-02", "u", "ERP-CON-02", "u", null],
    ["VIS-01", "u", "ERP-VIS-01", "u", 2],
    ["VENT-01", "u", "ERP-VENT-01", "u", 10],
  ].map(([reference, unite, article, unite_cible, delai]) => ({
    reference,
    indice: "A",
    unite,
    article,
    unite_cible,
    delai,
  })),
});

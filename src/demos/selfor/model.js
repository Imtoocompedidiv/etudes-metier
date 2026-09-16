import { parseCsv } from "../../shared/files.js";
export const HEADERS = [
  "id",
  "reference",
  "famille",
  "taille",
  "couleur_support",
  "quantite",
  "conditionnement",
  "cliche",
  "encre",
];
export const FAMILIES = { kraft: "Sacs kraft", papier: "Pochettes papier" };
export const INKS = ["Noir", "Blanc", "Orange", "Noir + orange"];
export const CHECKS = {
  logo: "Fichier logo disponible",
  technique: "Technique à faire confirmer au conseiller",
  stock: "Disponibilité à faire confirmer au conseiller",
};
const copy = (v) => structuredClone(v);
const text = (v, max = 80) =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= max &&
  !/[\r\n]/.test(v);
const integer = (v, min, max) =>
  Number.isSafeInteger(v) && v >= min && v <= max;
const normalize = (v) => v.trim().normalize("NFKC").toLocaleUpperCase("fr");
function validRow(r) {
  if (
    !r ||
    !text(r.id, 40) ||
    !/^[-A-Za-z0-9_]+$/.test(r.id) ||
    !text(r.sku, 60) ||
    !Object.hasOwn(FAMILIES, r.family) ||
    !["S", "M", "L"].includes(r.size) ||
    !text(r.color, 40) ||
    !integer(r.qty, 1, 100000) ||
    !integer(r.pack, 1, 1000) ||
    !text(r.plate, 60) ||
    !INKS.includes(r.ink)
  )
    throw Error(
      "Chaque ligne demande un identifiant unique, une référence, famille, taille, couleur, quantité entière positive, lot, cliché et encre du référentiel.",
    );
  return {
    id: r.id,
    sku: r.sku.trim(),
    family: r.family,
    size: r.size,
    color: r.color.trim(),
    qty: r.qty,
    pack: r.pack,
    plate: r.plate.trim(),
    ink: r.ink,
  };
}
function validRules(r) {
  if (!r || !text(r.version, 100))
    throw Error("Indiquez une version de règles.");
  for (const f of Object.keys(FAMILIES))
    if (
      !r[f] ||
      !integer(r[f].total, 1, 10000) ||
      !integer(r[f].perSize, 1, 10000)
    )
      throw Error(
        "Les seuils doivent être des entiers positifs jusqu’à 10 000.",
      );
  return {
    version: r.version.trim(),
    kraft: { ...r.kraft },
    papier: { ...r.papier },
  };
}
export const seriesKey = (r) =>
  JSON.stringify([r.family, normalize(r.plate), r.ink]);
export function groups(s) {
  const m = new Map();
  for (const r of s.rows) {
    const key = seriesKey(r);
    if (!m.has(key))
      m.set(key, {
        key,
        family: r.family,
        plate: normalize(r.plate),
        ink: r.ink,
        rows: [],
      });
    m.get(key).rows.push(r);
  }
  return [...m.values()].map((g) => {
    const rule = s.rules[g.family],
      sizes = [...new Set(g.rows.map((r) => r.size))]
        .sort()
        .map((size) => ({
          size,
          qty: g.rows
            .filter((r) => r.size === size)
            .reduce((n, r) => n + r.qty, 0),
        })),
      total = g.rows.reduce((n, r) => n + r.qty, 0);
    const issues = [];
    for (const r of g.rows)
      if (r.qty % r.pack)
        issues.push(
          `${r.sku} : ${r.qty} n’est pas un multiple du lot de ${r.pack}.`,
        );
    for (const a of sizes)
      if (a.qty < rule.perSize)
        issues.push(
          `Taille ${a.size} : ${a.qty} sur un minimum de ${rule.perSize}.`,
        );
    if (total < rule.total)
      issues.push(`Série : ${total} sur un minimum de ${rule.total}.`);
    return { ...g, total, sizes, rule, issues };
  });
}
export function fingerprint(s) {
  return JSON.stringify([s.rows, s.rules, s.checks]);
}
export function reviewed(s) {
  return s.review === fingerprint(s);
}
export function pending(s) {
  return [
    ...groups(s).flatMap((g) =>
      g.issues.map((v) => `${FAMILIES[g.family]}, ${g.plate}, ${g.ink} : ${v}`),
    ),
    ...Object.entries(CHECKS)
      .filter(([key]) => !s.checks[key])
      .map(([, label]) => label),
  ];
}
function record(s, action) {
  s.review = null;
  s.log.push(action);
  s.log = s.log.slice(-200);
  return s;
}
export function editRow(state, id, changes) {
  const s = copy(state),
    i = s.rows.findIndex((r) => r.id === id);
  if (i < 0) throw Error("Ligne introuvable.");
  s.rows[i] = validRow({ ...s.rows[i], ...changes, id });
  if (JSON.stringify(s.rows[i]) === JSON.stringify(state.rows[i])) return state;
  return record(s, `Ligne ${s.rows[i].sku} modifiée ; revue retirée.`);
}
export function addRow(state, row) {
  const s = copy(state);
  if (s.rows.length >= 100) throw Error("Le panier est limité à 100 lignes.");
  const r = validRow(row);
  if (s.rows.some((x) => x.id === r.id))
    throw Error("Identifiant déjà présent.");
  s.rows.push(r);
  return record(s, `Ligne ${r.sku} ajoutée.`);
}
export function removeRow(state, id) {
  if (state.rows.length === 1)
    throw Error("Conservez au moins une ligne dans le panier.");
  const s = copy(state);
  s.rows = s.rows.filter((r) => r.id !== id);
  return record(s, `Ligne ${id} retirée.`);
}
export function editRules(state, rules) {
  const s = copy(state);
  s.rules = validRules(rules);
  return record(s, "Règles de travail modifiées ; revue retirée.");
}
export function setCheck(state, key, value) {
  if (!Object.hasOwn(CHECKS, key) || typeof value !== "boolean")
    throw Error("Déclaration inconnue.");
  const s = copy(state);
  s.checks[key] = value;
  return record(s, `Déclaration mise à jour : ${CHECKS[key]}.`);
}
export function review(state) {
  if (pending(state).length)
    throw Error(
      "Résolvez les quantités et renseignez les trois points de préparation avant de marquer la fiche relue.",
    );
  const s = copy(state);
  s.review = fingerprint(s);
  s.log.push(
    "Préparation relue sur cette version. Le conseiller reste chargé du devis et du BAT.",
  );
  return s;
}
export function propose(s, key, preferredId) {
  const g = groups(s).find((g) => g.key === key);
  if (!g) throw Error("Série introuvable.");
  const rows = copy(g.rows),
    steps = [];
  const add = (r, q, reason) => {
    if (!q) return;
    const old = r.qty;
    r.qty += q;
    if (r.qty > 100000)
      throw Error(
        "La proposition dépasse la limite de 100 000 pièces sur une ligne.",
      );
    steps.push({
      id: r.id,
      sku: r.sku,
      before: old,
      after: r.qty,
      delta: q,
      reason,
    });
  };
  for (const r of rows)
    add(r, (r.pack - (r.qty % r.pack)) % r.pack, `Multiple de ${r.pack}`);
  for (const size of [...new Set(rows.map((r) => r.size))]) {
    const same = rows.filter((r) => r.size === size);
    const qty = same.reduce((n, r) => n + r.qty, 0);
    const selected = same.find((r) => r.id === preferredId) || same[0];
    if (qty < g.rule.perSize)
      add(
        selected,
        Math.ceil((g.rule.perSize - qty) / selected.pack) * selected.pack,
        `Minimum taille ${size} : ${g.rule.perSize}`,
      );
  }
  const total = rows.reduce((n, r) => n + r.qty, 0),
    target = rows.find((r) => r.id === preferredId) || rows[0];
  if (total < g.rule.total)
    add(
      target,
      Math.ceil((g.rule.total - total) / target.pack) * target.pack,
      `Minimum de série : ${g.rule.total}`,
    );
  return {
    key,
    fingerprint: fingerprint(s),
    steps,
    rows,
    total: rows.reduce((n, r) => n + r.qty, 0),
    delta: rows.reduce((n, r) => n + r.qty, 0) - g.total,
  };
}
export function applyProposal(state, proposal) {
  if (proposal.fingerprint !== fingerprint(state))
    throw Error("Le panier a changé. Recalculez la proposition.");
  const current = groups(state).find((g) => g.key === proposal.key);
  if (!current) throw Error("Série introuvable.");
  const expected = new Set(current.rows.map((r) => r.id));
  if (
    proposal.rows.length !== expected.size ||
    proposal.rows.some((r) => !expected.has(r.id))
  )
    throw Error("Proposition incomplète.");
  const s = copy(state);
  for (const r of proposal.rows) {
    const i = s.rows.findIndex((x) => x.id === r.id);
    s.rows[i] = validRow(r);
  }
  return record(
    s,
    `Proposition appliquée à ${current.plate} / ${current.ink} : +${proposal.delta} pièces.`,
  );
}
export function importCsv(state, raw) {
  const { rows } = parseCsv(raw, { requiredHeaders: HEADERS, maxRows: 100 });
  if (!rows.length) throw Error("Le CSV ne contient aucune ligne.");
  const parsed = rows.map((r, i) => {
    for (const field of ["quantite", "conditionnement"])
      if (!/^\d+$/.test(r[field]))
        throw Error(`Ligne ${i + 2} : ${field} doit être un entier positif.`);
    return validRow({
      id: r.id,
      sku: r.reference,
      family: r.famille,
      size: r.taille,
      color: r.couleur_support,
      qty: Number(r.quantite),
      pack: Number(r.conditionnement),
      plate: r.cliche,
      ink: r.encre,
    });
  });
  if (new Set(parsed.map((r) => r.id)).size !== parsed.length)
    throw Error("Identifiants de lignes répétés.");
  return record(
    { ...copy(state), rows: parsed },
    `CSV importé : ${parsed.length} lignes.`,
  );
}
export function csvRows(s) {
  return s.rows.map((r) => [
    r.id,
    r.sku,
    r.family,
    r.size,
    r.color,
    r.qty,
    r.pack,
    r.plate,
    r.ink,
  ]);
}
export function restore(raw) {
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    throw Error("JSON illisible.");
  }
  if (
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.rows) ||
    !s.rows.length ||
    s.rows.length > 100 ||
    !s.checks ||
    !Array.isArray(s.log) ||
    s.log.length > 200 ||
    s.log.some((v) => typeof v !== "string" || v.length > 1000) ||
    !(s.review === null || typeof s.review === "string")
  )
    throw Error("Dossier non reconnu.");
  const rows = s.rows.map(validRow),
    rules = validRules(s.rules),
    checks = {};
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw Error("Identifiants répétés.");
  for (const key of Object.keys(CHECKS)) {
    if (typeof s.checks[key] !== "boolean")
      throw Error("Déclarations invalides.");
    checks[key] = s.checks[key];
  }
  const next = {
    version: 1,
    rows,
    rules,
    checks,
    review: s.review,
    log: s.log,
  };
  if (
    next.review !== null &&
    (next.review !== fingerprint(next) || pending(next).length)
  )
    throw Error("Revue incompatible avec le contenu du dossier.");
  return next;
}
export function seed() {
  return {
    version: 1,
    rows: [
      {
        id: "l1",
        sku: "K-S-NATUREL",
        family: "kraft",
        size: "S",
        color: "Naturel",
        qty: 175,
        pack: 50,
        plate: "ATELIER",
        ink: "Noir",
      },
      {
        id: "l2",
        sku: "K-S-BLANC",
        family: "kraft",
        size: "S",
        color: "Blanc",
        qty: 100,
        pack: 50,
        plate: "ATELIER",
        ink: "Noir",
      },
      {
        id: "l3",
        sku: "K-M-NATUREL",
        family: "kraft",
        size: "M",
        color: "Naturel",
        qty: 150,
        pack: 25,
        plate: "ATELIER",
        ink: "Noir",
      },
      {
        id: "l4",
        sku: "K-M-BLANC",
        family: "kraft",
        size: "M",
        color: "Blanc",
        qty: 50,
        pack: 25,
        plate: "ATELIER",
        ink: "Noir",
      },
      {
        id: "l5",
        sku: "P-M-CREME",
        family: "papier",
        size: "M",
        color: "Crème",
        qty: 150,
        pack: 25,
        plate: "BOUTIQUE",
        ink: "Orange",
      },
      {
        id: "l6",
        sku: "P-L-CREME",
        family: "papier",
        size: "L",
        color: "Crème",
        qty: 50,
        pack: 25,
        plate: "BOUTIQUE",
        ink: "Orange",
      },
    ],
    rules: {
      version: "Document lié au 17 septembre 2026 · base de travail",
      kraft: { total: 600, perSize: 200 },
      papier: { total: 300, perSize: 100 },
    },
    checks: { logo: false, technique: false, stock: false },
    review: null,
    log: ["Exemple chargé : références et conditionnements fictifs."],
  };
}

import { parseCsv, csvText } from "../../shared/files.js";

export const sides = ["base", "shop", "feed"];
export const sideLabels = {
  base: "Base de référence",
  shop: "Boutique actuelle",
  feed: "Nouveau flux",
};
export const fields = [
  ["designation", "Désignation"],
  ["prix_ht", "Prix HT"],
  ["stock", "Stock"],
  ["delai_jours", "Délai (jours)"],
];
export const headers = ["produit", "variante", ...fields.map(([f]) => f)];
const reserved = new Set(["__proto__", "constructor", "prototype"]);
// A JSON string code unit may occupy six characters (for example \u0001).
// Account for quotes, commas and brackets as well as the source field limits.
const jsonStringArrayLimit = (lengths) =>
  2 +
  Math.max(0, lengths.length - 1) +
  lengths.reduce((n, size) => n + 2 + 6 * size, 0);
const isObject = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const text = (x, label, max = 250) => {
  if (typeof x !== "string" || x.length > max)
    throw Error(`${label} : texte de ${max} caractères maximum attendu.`);
  return x;
};
const id = (x, label) => {
  const v = text(x, label, 80).trim();
  if (!v || reserved.has(v))
    throw Error(
      `${label} : identifiant non vide et distinct des mots réservés attendu.`,
    );
  return v;
};
const time = (x) => {
  if (
    typeof x !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) ||
    new Date(x).toISOString() !== x
  )
    throw Error("Date du journal invalide.");
  return x;
};
export const rowKey = (r) => JSON.stringify([r.produit, r.variante]);
export const cellKey = (r, field) =>
  JSON.stringify([r.produit, r.variante, field]);
function normalizeRow(r) {
  if (!isObject(r)) throw Error("Ligne de catalogue invalide.");
  return Object.fromEntries(
    headers.map((h) => [
      h,
      h === "produit" || h === "variante" ? id(r[h], h) : text(r[h], h),
    ]),
  );
}
function rowsChecked(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500)
    throw Error("Chaque état doit contenir de 1 à 500 variantes.");
  const keys = new Set();
  return rows.map((r, i) => {
    const next = normalizeRow(r),
      key = rowKey(next);
    if (keys.has(key))
      throw Error(
        `Variante en double à la ligne de données ${i + 1} : ${next.produit} / ${next.variante}.`,
      );
    keys.add(key);
    return next;
  });
}
export function parseCatalog(raw) {
  const p = parseCsv(raw, { requiredHeaders: headers, maxRows: 500 });
  if (p.headers.length !== headers.length)
    throw Error(
      "Utilisez les six colonnes documentées, sans colonne supplémentaire.",
    );
  return rowsChecked(p.rows);
}
function fingerprint(base, shop, feed, field) {
  return JSON.stringify([base[field], shop[field], feed[field]]);
}
function checkedFingerprint(raw) {
  text(raw, "Empreinte", jsonStringArrayLimit([250, 250, 250]));
  let a;
  try {
    a = JSON.parse(raw);
  } catch {
    throw Error("Empreinte de décision invalide.");
  }
  if (
    !Array.isArray(a) ||
    a.length !== 3 ||
    a.some((x) => typeof x !== "string" || x.length > 250)
  )
    throw Error("Empreinte de décision invalide.");
  return JSON.stringify(a);
}
function normalizeKey(raw, cell = false) {
  text(
    raw,
    "Clé",
    jsonStringArrayLimit(
      cell ? [80, 80, Math.max(...fields.map(([f]) => f.length))] : [80, 80],
    ),
  );
  let a;
  try {
    a = JSON.parse(raw);
  } catch {
    throw Error("Clé invalide.");
  }
  if (!Array.isArray(a) || a.length !== (cell ? 3 : 2))
    throw Error("Clé invalide.");
  const b = [id(a[0], "Produit"), id(a[1], "Variante")];
  if (cell) {
    if (!fields.some(([f]) => f === a[2])) throw Error("Champ inconnu.");
    b.push(a[2]);
  }
  return JSON.stringify(b);
}
export function normalizeDossier(raw) {
  if (!isObject(raw) || raw.version !== 1 || !isObject(raw.states))
    throw Error("Dossier BTPMAT version 1 attendu.");
  const states = Object.fromEntries(
    sides.map((side) => {
      const x = raw.states[side];
      if (!isObject(x)) throw Error(`État ${sideLabels[side]} absent.`);
      return [
        side,
        {
          name: text(x.name, "Nom du fichier", 180),
          rows: rowsChecked(x.rows),
        },
      ];
    }),
  );
  if (
    !Array.isArray(raw.overrides) ||
    raw.overrides.length > 1500 ||
    !Array.isArray(raw.decisions) ||
    raw.decisions.length > 6000 ||
    !Array.isArray(raw.journal) ||
    raw.journal.length > 2000
  )
    throw Error("Collections du dossier invalides ou trop volumineuses.");
  const overrideKeys = new Set();
  const overrides = raw.overrides.map((x) => {
    if (!isObject(x) || !sides.includes(x.side) || !isObject(x.values))
      throw Error("Correction invalide.");
    const key = normalizeKey(x.key);
    if (!states[x.side].rows.some((r) => rowKey(r) === key))
      throw Error("Une correction vise une variante absente de son état.");
    const pair = JSON.stringify([x.side, key]);
    if (overrideKeys.has(pair)) throw Error("Correction dupliquée.");
    overrideKeys.add(pair);
    const reason = text(x.reason, "Motif", 500).trim();
    if (!reason)
      throw Error("Un motif est nécessaire pour corriger une source.");
    return {
      side: x.side,
      key,
      values: Object.fromEntries(
        fields.map(([f]) => [f, text(x.values[f], f)]),
      ),
      reason,
    };
  });
  const allKeys = new Set(sides.flatMap((s) => states[s].rows.map(rowKey))),
    decisionKeys = new Set();
  const decisions = raw.decisions.map((x) => {
    if (!isObject(x) || !["shop", "feed"].includes(x.choice))
      throw Error("Décision invalide.");
    const key = normalizeKey(x.key, true),
      [product, variant] = JSON.parse(key);
    if (!allKeys.has(JSON.stringify([product, variant])))
      throw Error("Une décision vise une variante absente du dossier.");
    if (decisionKeys.has(key)) throw Error("Décision dupliquée.");
    decisionKeys.add(key);
    const reason = text(x.reason, "Motif", 500).trim();
    if (!reason) throw Error("Motif de décision obligatoire.");
    return {
      key,
      choice: x.choice,
      fingerprint: checkedFingerprint(x.fingerprint),
      reason,
    };
  });
  const journal = raw.journal.map((x) => {
    if (!isObject(x)) throw Error("Journal invalide.");
    return { at: time(x.at), action: text(x.action, "Action", 700) };
  });
  return { version: 1, states, overrides, decisions, journal };
}
function equal(a, b) {
  if (a === b) return true;
  if (
    typeof a !== typeof b ||
    !a ||
    !b ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  if (typeof a !== "object") return false;
  const x = Object.keys(a),
    y = Object.keys(b);
  return (
    x.length === y.length &&
    x.every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]))
  );
}
export const validDossier = (x) => {
  try {
    return equal(x, normalizeDossier(x));
  } catch {
    return false;
  }
};
function logged(d, action, at) {
  return {
    ...d,
    journal: [...d.journal, { at: time(at), action }].slice(-2000),
  };
}
export function effectiveRows(d, side) {
  return d.states[side].rows.map((r) => {
    const override = d.overrides.find(
      (x) => x.side === side && x.key === rowKey(r),
    );
    return override ? { ...r, ...override.values } : r;
  });
}
export function cellValue(field, raw) {
  const x = raw.trim();
  if (!x) return { valid: false, error: "Valeur absente", value: null };
  if (field === "designation") return { valid: true, value: x };
  if (field === "prix_ht") {
    if (!/^\d{1,8}([.,]\d{1,2})?$/.test(x))
      return {
        valid: false,
        error: "Prix positif ou nul, deux décimales maximum",
        value: null,
      };
    const [whole, decimal = ""] = x.replace(",", ".").split(".");
    return {
      valid: true,
      value: Number(whole) * 100 + Number(decimal.padEnd(2, "0")),
    };
  }
  const max = field === "stock" ? 1000000 : 3650;
  if (!/^\d+$/.test(x) || !Number.isSafeInteger(Number(x)) || Number(x) > max)
    return { valid: false, error: `Entier de 0 à ${max} attendu`, value: null };
  return { valid: true, value: Number(x) };
}
export const displayValue = (field, value) =>
  value === null
    ? "Absente"
    : field === "prix_ht"
      ? new Intl.NumberFormat("fr-FR", {
          style: "currency",
          currency: "EUR",
        }).format(value / 100)
      : String(value);
export const outputValue = (field, value) =>
  field === "prix_ht" ? (value / 100).toFixed(2) : String(value);
export function analyze(d) {
  const maps = Object.fromEntries(
    sides.map((s) => [
      s,
      new Map(effectiveRows(d, s).map((r) => [rowKey(r), r])),
    ]),
  );
  const keys = [...new Set(sides.flatMap((s) => [...maps[s].keys()]))];
  const decisions = new Map(d.decisions.map((x) => [x.key, x]));
  const variants = keys.map((key) => {
    const [produit, variante] = JSON.parse(key),
      source = Object.fromEntries(
        sides.map((s) => [s, maps[s].get(key) || null]),
      );
    const absent = sides.filter((s) => !source[s]),
      structural = absent.length > 0;
    const title =
      (source.shop || source.feed || source.base).designation ||
      "Désignation à préciser";
    if (structural)
      return {
        key,
        produit,
        variante,
        title,
        source,
        structural: true,
        absent,
        cells: [],
        status:
          !source.base && !source.shop
            ? "Nouvelle variante"
            : !source.feed
              ? "Absente du flux"
              : "Présence à examiner",
        issues: [
          `Variante absente de ${absent.map((s) => sideLabels[s]).join(", ")}. Création et suppression à traiter séparément.`,
        ],
      };
    const cells = fields.map(([field, label]) => {
      const raw = Object.fromEntries(sides.map((s) => [s, source[s][field]]));
      const parsed = Object.fromEntries(
        sides.map((s) => [s, cellValue(field, raw[s])]),
      );
      const values = Object.fromEntries(sides.map((s) => [s, parsed[s].value])),
        cellId = cellKey(source.base, field),
        fp = fingerprint(source.base, source.shop, source.feed, field),
        decision = decisions.get(cellId) || null,
        stale = !!decision && decision.fingerprint !== fp;
      const errors = sides
        .filter((s) => !parsed[s].valid)
        .map((s) => `${sideLabels[s]} : ${parsed[s].error}`);
      let status = "same",
        result = values.shop,
        resolved = false;
      if (errors.length) {
        status = "invalid";
        result = null;
      } else if (values.shop === values.feed) {
        status = "same";
      } else if (values.shop === values.base) {
        status = "incoming";
        result = values.feed;
      } else if (values.feed === values.base) {
        status = "local";
      } else {
        status = "conflict";
        result = null;
        if (decision && !stale) {
          result = values[decision.choice];
          resolved = true;
        }
      }
      return {
        key: cellId,
        field,
        label,
        raw,
        values,
        errors,
        status,
        result,
        decision,
        stale,
        fingerprint: fp,
        resolved,
        blocked: status === "invalid" || (status === "conflict" && !resolved),
        changed: result !== null && result !== values.shop,
      };
    });
    const pending = cells.filter((c) => c.blocked).length;
    return {
      key,
      produit,
      variante,
      title,
      source,
      structural: false,
      absent: [],
      cells,
      status: pending
        ? `${pending} champ${pending > 1 ? "s" : ""} à examiner`
        : cells.some((c) => c.changed)
          ? "Changements préparés"
          : "Boutique préservée",
      issues: cells
        .filter((c) => c.blocked)
        .map(
          (c) =>
            `${c.label} : ${c.errors.join(" ; ") || "modifications concurrentes à décider"}`,
        ),
    };
  });
  const patch = variants.flatMap((v) =>
    v.cells
      .filter((c) => c.changed && !c.blocked)
      .map((c) => ({
        produit: v.produit,
        variante: v.variante,
        champ: c.field,
        base: outputValue(c.field, c.values.base),
        ancienne_valeur: outputValue(c.field, c.values.shop),
        nouvelle_valeur: outputValue(c.field, c.result),
        origine: c.status === "conflict" ? "Décision explicite" : "Flux seul",
        motif:
          c.status === "conflict"
            ? c.decision.reason
            : "La boutique est identique à la base pour ce champ.",
      })),
  );
  const exceptions = variants.flatMap((v) =>
    v.structural
      ? [
          {
            produit: v.produit,
            variante: v.variante,
            champ: "présence",
            detail: v.issues[0],
          },
        ]
      : v.cells
          .filter((c) => c.blocked)
          .map((c) => ({
            produit: v.produit,
            variante: v.variante,
            champ: c.field,
            detail:
              c.errors.join(" ; ") ||
              (c.stale
                ? "Décision périmée ; arbitrage à refaire."
                : "Modifications concurrentes ; choisir la valeur à conserver."),
          })),
  );
  return {
    variants,
    patch,
    exceptions,
    stale: variants.flatMap((v) => v.cells).filter((c) => c.stale).length,
  };
}
export function decide(d, key, choice, reason, at) {
  if (!["shop", "feed"].includes(choice))
    throw Error("Choisissez la valeur boutique ou celle du nouveau flux.");
  const motif = text(reason, "Motif", 500).trim();
  if (!motif) throw Error("Motif de décision obligatoire.");
  const cell = analyze(d)
    .variants.flatMap((v) => v.cells)
    .find((c) => c.key === key);
  if (!cell || cell.status !== "conflict")
    throw Error("Ce champ ne présente pas de conflit à arbitrer.");
  const next = normalizeDossier({
    ...d,
    decisions: [
      ...d.decisions.filter((x) => x.key !== key),
      { key, choice, reason: motif, fingerprint: cell.fingerprint },
    ],
  });
  const [p, v, f] = JSON.parse(key);
  return logged(
    next,
    `${p} / ${v}, ${f} : ${choice === "shop" ? "boutique conservée" : "flux retenu"}. ${motif}`,
    at,
  );
}
export function removeDecision(d, key, at) {
  return logged(
    normalizeDossier({
      ...d,
      decisions: d.decisions.filter((x) => x.key !== key),
    }),
    "Arbitrage retiré ; comparaison recalculée.",
    at,
  );
}
export function correctSource(d, side, key, values, reason, at) {
  if (!sides.includes(side)) throw Error("État inconnu.");
  const next = normalizeDossier({
    ...d,
    overrides: [
      ...d.overrides.filter((x) => !(x.side === side && x.key === key)),
      { side, key, values, reason },
    ],
  });
  return logged(
    next,
    `${sideLabels[side]}, ${JSON.parse(key).join(" / ")} : correction documentée. ${reason.trim()}`,
    at,
  );
}
export function removeCorrection(d, side, key, at) {
  return logged(
    normalizeDossier({
      ...d,
      overrides: d.overrides.filter((x) => !(x.side === side && x.key === key)),
    }),
    `${sideLabels[side]}, ${JSON.parse(key).join(" / ")} : valeurs importées restaurées.`,
    at,
  );
}
export function replaceState(d, side, rows, name, at) {
  if (!sides.includes(side)) throw Error("État inconnu.");
  rows = rowsChecked(rows);
  name = text(name, "Nom du fichier", 180);
  const identical = equal(rows, d.states[side].rows);
  if (identical)
    return logged(
      d,
      `${sideLabels[side]} réimporté à l’identique ; corrections et arbitrages conservés.`,
      at,
    );
  const states = { ...d.states, [side]: { name, rows } },
    keys = new Set(sides.flatMap((s) => states[s].rows.map(rowKey)));
  const decisions = d.decisions.filter((x) => {
    const [p, v] = JSON.parse(x.key);
    return keys.has(JSON.stringify([p, v]));
  });
  return logged(
    normalizeDossier({
      ...d,
      states,
      decisions,
      overrides: d.overrides.filter((x) => x.side !== side),
    }),
    `${sideLabels[side]} remplacé par ${name}. Corrections de cet état retirées ; arbitrages vérifiés sur les nouvelles valeurs.`,
    at,
  );
}
export const patchHeaders = [
  "produit",
  "variante",
  "champ",
  "base",
  "ancienne_valeur",
  "nouvelle_valeur",
  "origine",
  "motif",
];
export const exceptionHeaders = ["produit", "variante", "champ", "detail"];
export function manifest(d) {
  const a = analyze(d);
  return {
    format: "btpmat-comparaison-v1",
    note: "Données fictives. Patch partiel champ par champ, non natif PrestaShop ou ITECK. Aucune écriture distante.",
    sources: d.states,
    corrections: d.overrides,
    arbitrages: d.decisions,
    changements: a.patch,
    exceptions: a.exceptions,
    journal: d.journal,
  };
}
const row = (produit, variante, designation, prix_ht, stock, delai_jours) => ({
  produit,
  variante,
  designation,
  prix_ht,
  stock,
  delai_jours,
});
const base = [
  row("MOD-A", "3M", "Module fictif 3 mètres", "3200", "5", "5"),
  row("MOD-A", "4M", "Module fictif 4 mètres", "3900", "8", "5"),
  row("BEN-B", "500L", "Benne fictive 500 litres", "820", "4", "7"),
  row("ETA-C", "GRIS", "Étagère fictive grise", "150", "0", "2"),
  row("LEG-E", "UNIQUE", "Accessoire fictif", "45", "7", "3"),
];
const shop = base.map((r) => ({ ...r }));
shop[1].prix_ht = "4050";
shop[2].designation = "Benne fictive 500 litres, note boutique";
const feed = base.filter((r) => r.produit !== "LEG-E").map((r) => ({ ...r }));
feed[1].prix_ht = "4200";
feed[1].stock = "6";
feed[2].prix_ht = "";
feed[3].stock = "12";
feed.push(row("NEW-D", "UNIQUE", "Nouveau produit fictif", "240", "3", "10"));
export const initialDossier = normalizeDossier({
  version: 1,
  states: {
    base: { name: "base-fictive.csv", rows: base },
    shop: { name: "boutique-fictive.csv", rows: shop },
    feed: { name: "flux-fictif.csv", rows: feed },
  },
  overrides: [],
  decisions: [],
  journal: [],
});
export const exampleCsv = (side) =>
  csvText(headers, initialDossier.states[side].rows);

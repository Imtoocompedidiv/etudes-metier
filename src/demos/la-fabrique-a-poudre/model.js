import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { parseCsv } from "../../shared/files.js";

export const MAX_BYTES = 12 * 1024 * 1024;
export const HEADERS = [
  "type",
  "site",
  "transfert",
  "article",
  "lot",
  "unite",
  "quantite",
];
const obj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const fail = (msg) => {
  throw Error(msg);
};
const shape = (x, fields, label) => {
  if (
    !obj(x) ||
    Object.keys(x).some((k) => !fields.includes(k)) ||
    fields.some((k) => !Object.hasOwn(x, k))
  )
    fail(`${label} : structure invalide.`);
};
const text = (x, label, max = 100, empty = false) => {
  if (typeof x !== "string" || x.length > max || (!empty && !x.trim()))
    fail(
      `${label} : texte ${empty ? "" : "non vide "}de ${max} caractères maximum attendu.`,
    );
  return x.trim();
};
const list = (x, max, label, min = 0) => {
  if (!Array.isArray(x) || x.length > max || x.length < min)
    fail(`${label} : ${min} à ${max} lignes attendues.`);
  return x;
};
const unique = (xs, f, label) => {
  const keys = xs.map(f);
  if (new Set(keys).size !== keys.length) fail(`${label} : identité répétée.`);
};
export const amount = (x, unit, zero = true) => {
  if (
    typeof x !== "string" ||
    !/^(0|[1-9]\d{0,6})(?:[.,]\d{1,3})?$/.test(x.trim())
  )
    fail(
      "Quantité : nombre positif, sans exposant, avec trois décimales maximum.",
    );
  const [a, b = ""] = x.trim().replace(",", ".").split(".");
  const n = Number(a) * 1000 + Number(b.padEnd(3, "0"));
  if (n > 1_000_000_000 || (!zero && n === 0) || (unit === "u" && n % 1000))
    fail("Quantité hors limite (1 000 000) ou fraction d’unité indivisible.");
  return n;
};
export const decimal = (n) => (n / 1000).toFixed(3).replace(/\.?0+$/, "");
export const display = (n) => decimal(n).replace(".", ",");
const date = (x) => {
  if (
    typeof x !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(x) ||
    Number(x.slice(0, 4)) < 2000 ||
    Number(x.slice(0, 4)) > 2100 ||
    !Number.isFinite(Date.parse(x)) ||
    new Date(x).toISOString().slice(0, 10) !== x
  )
    fail("Date calendaire invalide (2000–2100).");
  return x;
};
const unit = (x) => {
  if (!["kg", "u"].includes(x))
    fail("Unité attendue : kg ou u, sans conversion implicite.");
  return x;
};
export const rowKey = (r) =>
  JSON.stringify([r.type, r.site, r.transfert, r.article, r.lot, r.unite]);
const identity = (r) => ({
  type: text(r.type, "Type", 10),
  site: text(r.site, "Site", 80, true),
  transfert: text(r.transfert, "Transfert", 80, true),
  article: text(r.article, "Article", 100),
  lot: text(r.lot, "Lot", 100),
  unite: unit(r.unite),
});
function resultRow(r) {
  shape(r, HEADERS, "Résultat");
  const v = identity(r);
  if (
    !["site", "transit"].includes(v.type) ||
    (v.type === "site" && (!v.site || v.transfert)) ||
    (v.type === "transit" && (v.site || !v.transfert))
  )
    fail(
      "Identité attendue : site nommé sans transfert, ou transit avec transfert sans site.",
    );
  v.quantite = r.quantite === "" ? "" : decimal(amount(r.quantite, v.unite));
  return v;
}
export function scenario(raw) {
  shape(raw, ["title", "openingDate", "stocks", "transfers"], "Scénario");
  const s = {
    title: text(raw.title, "Titre", 180),
    openingDate: date(raw.openingDate),
    stocks: [],
    transfers: [],
  };
  s.stocks = list(raw.stocks, 200, "Stocks initiaux", 1).map((r) => {
    shape(r, ["site", "article", "lot", "unite", "quantite"], "Stock initial");
    const v = {
      site: text(r.site, "Site", 80),
      article: text(r.article, "Article", 100),
      lot: text(r.lot, "Lot", 100),
      unite: unit(r.unite),
    };
    v.quantite = decimal(amount(r.quantite, v.unite));
    return v;
  });
  unique(
    s.stocks,
    (r) => JSON.stringify([r.site, r.article, r.lot, r.unite]),
    "Stock initial",
  );
  const sites = new Set(s.stocks.map((r) => r.site));
  s.transfers = list(raw.transfers, 50, "Transferts", 1).map((t) => {
    shape(
      t,
      ["id", "from", "to", "article", "lot", "unite", "events"],
      "Transfert",
    );
    const v = {
      id: text(t.id, "Identifiant", 80),
      from: text(t.from, "Origine", 80),
      to: text(t.to, "Destination", 80),
      article: text(t.article, "Article", 100),
      lot: text(t.lot, "Lot", 100),
      unite: unit(t.unite),
      events: [],
    };
    if (v.from === v.to || !sites.has(v.from) || !sites.has(v.to))
      fail(
        "Les deux sites doivent être distincts et déclarés dans les stocks initiaux.",
      );
    v.events = list(t.events, 100, "Mouvements", 1).map((e) => {
      shape(e, ["id", "kind", "date", "quantite"], "Mouvement");
      if (!["depart", "reception"].includes(e.kind))
        fail("Nature du mouvement inconnue.");
      return {
        id: text(e.id, "Identifiant mouvement", 80),
        kind: e.kind,
        date: date(e.date),
        quantite: decimal(amount(e.quantite, v.unite, false)),
      };
    });
    unique(v.events, (e) => e.id, "Mouvement");
    return v;
  });
  unique(s.transfers, (t) => t.id, "Transfert");
  return s;
}
export function normalize(raw) {
  shape(
    raw,
    ["format", "scenario", "actual", "comparison", "journal"],
    "Dossier",
  );
  if (raw.format !== "poudre-recette-v1") fail("Version du dossier inconnue.");
  const d = {
    format: raw.format,
    scenario: scenario(raw.scenario),
    actual: null,
    comparison: null,
    journal: list(raw.journal, 100, "Journal").map((x) =>
      text(x, "Action", 700),
    ),
  };
  if (raw.actual !== null) {
    shape(raw.actual, ["filename", "rows"], "Résultats importés");
    d.actual = {
      filename: text(raw.actual.filename, "Nom du fichier", 180),
      rows: list(raw.actual.rows, 1000, "Résultats", 1).map(resultRow),
    };
  }
  if (raw.comparison !== null) {
    shape(raw.comparison, ["fingerprint"], "Comparaison");
    if (
      typeof raw.comparison.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(raw.comparison.fingerprint)
    )
      fail("Empreinte de comparaison invalide.");
    d.comparison = { fingerprint: raw.comparison.fingerprint };
  }
  if (utf8ToBytes(JSON.stringify(d, null, 2)).length > MAX_BYTES)
    fail("Dossier trop volumineux pour être restauré (12 Mio maximum).");
  return d;
}
export function restore(text) {
  if (utf8ToBytes(text).length > MAX_BYTES) fail("Dossier limité à 12 Mio.");
  return normalize(JSON.parse(text));
}
export function fingerprint(d) {
  return bytesToHex(
    sha256(utf8ToBytes(JSON.stringify([d.scenario, d.actual]))),
  );
}
const addJournal = (d, message) => ({
  ...d,
  journal: [...d.journal, message].slice(-100),
});
export function expected(d) {
  const s = d.scenario,
    rows = new Map(),
    totals = new Map(),
    issues = [];
  const stockRow = (site, r) => ({
    type: "site",
    site,
    transfert: "",
    article: r.article,
    lot: r.lot,
    unite: r.unite,
  });
  const get = (site, r) => {
    const v = stockRow(site, r),
      k = rowKey(v);
    if (!rows.has(k)) rows.set(k, { ...v, value: 0 });
    return rows.get(k);
  };
  for (const r of s.stocks) get(r.site, r).value = amount(r.quantite, r.unite);
  const events = s.transfers
    .flatMap((t, ti) => {
      totals.set(t.id, { sent: 0, received: 0, transit: 0 });
      return t.events.map((e, ei) => ({ t, e, ti, ei }));
    })
    .sort(
      (a, b) => a.e.date.localeCompare(b.e.date) || a.ti - b.ti || a.ei - b.ei,
    );
  for (const { t, e } of events) {
    const n = amount(e.quantite, t.unite),
      total = totals.get(t.id),
      origin = get(t.from, t),
      destination = get(t.to, t);
    if (e.date < s.openingDate) {
      issues.push(
        `${t.id} / ${e.id} : mouvement antérieur au stock d’ouverture.`,
      );
      continue;
    }
    if (e.kind === "depart") {
      if (origin.value < n) {
        issues.push(
          `${t.id} / ${e.id} : départ de ${display(n)} ${t.unite} supérieur au stock disponible de ${display(origin.value)} ${t.unite} à ${t.from}.`,
        );
        continue;
      }
      origin.value -= n;
      total.sent += n;
      total.transit += n;
    } else {
      if (total.transit < n) {
        issues.push(
          `${t.id} / ${e.id} : réception de ${display(n)} ${t.unite} supérieure aux ${display(total.transit)} ${t.unite} déjà partis et non reçus.`,
        );
        continue;
      }
      destination.value += n;
      total.received += n;
      total.transit -= n;
    }
  }
  for (const t of s.transfers)
    rows.set(
      rowKey({
        type: "transit",
        site: "",
        transfert: t.id,
        ...t,
        unite: t.unite,
      }),
      {
        type: "transit",
        site: "",
        transfert: t.id,
        article: t.article,
        lot: t.lot,
        unite: t.unite,
        value: totals.get(t.id).transit,
      },
    );
  return {
    valid: !issues.length,
    issues,
    totals,
    rows: issues.length ? [] : [...rows.values()],
    events,
  };
}
export function importActual(d, raw, filename) {
  const csv = parseCsv(raw, { requiredHeaders: HEADERS, maxRows: 1000 });
  if (csv.headers.length !== HEADERS.length)
    fail("Le CSV doit contenir exactement les sept colonnes du modèle.");
  const actual = {
    filename: text(filename, "Nom du fichier", 180),
    rows: csv.rows.map(resultRow),
  };
  const next = normalize({ ...d, actual, comparison: null });
  if (JSON.stringify(actual) === JSON.stringify(d.actual)) return d;
  return addJournal(
    next,
    `Résultats importés depuis ${actual.filename} (${actual.rows.length} lignes).`,
  );
}
export function compare(d) {
  const exp = expected(d);
  if (!exp.valid) fail("Corrigez le scénario avant de comparer.");
  if (!d.actual) fail("Importez d’abord un résultat CSV.");
  const actual = new Map();
  for (const r of d.actual.rows) {
    const k = rowKey(r);
    actual.set(k, [...(actual.get(k) || []), r]);
  }
  const base = new Map(exp.rows.map((r) => [rowKey(r), r]));
  return [...new Set([...base.keys(), ...actual.keys()])].map((k) => {
    const e = base.get(k),
      got = actual.get(k) || [],
      r = e || got[0];
    const value =
      got.length === 1 && got[0].quantite !== ""
        ? amount(got[0].quantite, r.unite)
        : null;
    const status =
      got.length > 1
        ? "Doublon"
        : !e
          ? "Clé supplémentaire"
          : got.length === 0
            ? "Ligne absente"
            : value === null
              ? "Valeur absente"
              : e.value === value
                ? "Identique"
                : "Écart";
    return {
      type: r.type,
      site: r.site,
      transfert: r.transfert,
      article: r.article,
      lot: r.lot,
      unite: r.unite,
      expected: e?.value ?? null,
      actual: value,
      difference: e && value !== null ? value - e.value : null,
      count: got.length,
      status,
    };
  });
}
export const isCurrent = (d) =>
  Boolean(
    d.actual &&
    expected(d).valid &&
    d.comparison?.fingerprint === fingerprint(d),
  );
export function run(d) {
  const rows = compare(d);
  return addJournal(
    { ...d, comparison: { fingerprint: fingerprint(d) } },
    `Comparaison exécutée : ${rows.filter((r) => r.status !== "Identique").length} écarts ou réserves sur ${rows.length} clés.`,
  );
}
export function editEvent(d, transferId, eventId, changes, reason) {
  const motif = text(reason, "Motif de correction", 400);
  const t = d.scenario.transfers.find((t) => t.id === transferId),
    e = t?.events.find((e) => e.id === eventId);
  if (!e) fail("Mouvement introuvable.");
  const proposed = {
    ...e,
    date: date(changes.date),
    quantite: decimal(amount(changes.quantite, t.unite, false)),
  };
  if (JSON.stringify(proposed) === JSON.stringify(e)) return d;
  const next = normalize({
    ...d,
    scenario: {
      ...d.scenario,
      transfers: d.scenario.transfers.map((t) =>
        t.id === transferId
          ? {
              ...t,
              events: t.events.map((e) => (e.id === eventId ? proposed : e)),
            }
          : t,
      ),
    },
    comparison: null,
  });
  return addJournal(
    next,
    `${transferId} / ${eventId} : ${e.quantite} → ${proposed.quantite} ${t.unite}, ${e.date} → ${proposed.date}. ${motif}`,
  );
}
export function expectedRows(d) {
  const r = expected(d);
  if (!r.valid) fail("Scénario invalide : attendus indisponibles.");
  return r.rows.map((r) => ({
    type: r.type,
    site: r.site,
    transfert: r.transfert,
    article: r.article,
    lot: r.lot,
    unite: r.unite,
    quantite: decimal(r.value),
  }));
}
export const COMPARE_HEADERS = [
  ...HEADERS.slice(0, 6),
  "attendu",
  "obtenu",
  "ecart",
  "nombre_lignes",
  "etat",
];
export function comparedRows(d) {
  if (!isCurrent(d))
    fail("Exécutez une comparaison sur les données actuelles.");
  return compare(d).map((r) => [
    ...HEADERS.slice(0, 6).map((k) => r[k]),
    r.expected === null ? "" : decimal(r.expected),
    r.actual === null ? "" : decimal(r.actual),
    r.difference === null ? "" : decimal(r.difference),
    r.count,
    r.status,
  ]);
}
export function report(d) {
  const exp = expected(d);
  return {
    title: "Recette des échanges entre sites",
    subtitle: `${d.scenario.title} · Cas fictif indépendant · Aucune validation de production`,
    sections: [
      {
        title: "Règles et état",
        paragraphs: [
          "Unités kg et u distinctes. Aucun arrondi ou conversion implicite. Les identités de stock omises commencent à zéro dans ce scénario. À date égale, les transferts puis leurs mouvements suivent l’ordre du JSON.",
          exp.valid
            ? "Scénario calculable."
            : `Scénario invalide. ${exp.issues.join(" ")}`,
          isCurrent(d)
            ? `Comparaison exécutée sur ${d.actual.filename}.`
            : "Aucune comparaison à jour. Les résultats ERP ne sont pas validés.",
        ],
      },
      ...(exp.valid
        ? [
            {
              title: "Attendus",
              headers: HEADERS,
              rows: expectedRows(d).map((r) => HEADERS.map((k) => r[k])),
            },
          ]
        : []),
      ...(isCurrent(d)
        ? [
            {
              title: "Comparaison",
              headers: COMPARE_HEADERS,
              rows: comparedRows(d),
            },
          ]
        : []),
      {
        title: "Journal",
        paragraphs: d.journal.length
          ? d.journal
          : ["Aucune action enregistrée."],
      },
    ],
  };
}
export const seed = () =>
  normalize({
    format: "poudre-recette-v1",
    scenario: {
      title: "Transferts d’essai entre deux sites",
      openingDate: "2026-09-14",
      stocks: [
        {
          site: "Site A",
          article: "Mélange A",
          lot: "M26-04",
          unite: "kg",
          quantite: "120",
        },
        {
          site: "Site B",
          article: "Mélange A",
          lot: "M26-04",
          unite: "kg",
          quantite: "10",
        },
        {
          site: "Site A",
          article: "Mélange B",
          lot: "B26-01",
          unite: "kg",
          quantite: "200",
        },
        {
          site: "Site B",
          article: "Mélange B",
          lot: "B26-01",
          unite: "kg",
          quantite: "100",
        },
        {
          site: "Site A",
          article: "Pots vides",
          lot: "P26-02",
          unite: "u",
          quantite: "600",
        },
        {
          site: "Site B",
          article: "Pots vides",
          lot: "P26-02",
          unite: "u",
          quantite: "100",
        },
      ],
      transfers: [
        {
          id: "T-101",
          from: "Site A",
          to: "Site B",
          article: "Mélange A",
          lot: "M26-04",
          unite: "kg",
          events: [
            { id: "D1", kind: "depart", date: "2026-09-15", quantite: "50" },
            { id: "R1", kind: "reception", date: "2026-09-16", quantite: "35" },
          ],
        },
        {
          id: "T-102",
          from: "Site B",
          to: "Site A",
          article: "Mélange B",
          lot: "B26-01",
          unite: "kg",
          events: [
            { id: "D1", kind: "depart", date: "2026-09-15", quantite: "20" },
            { id: "R1", kind: "reception", date: "2026-09-16", quantite: "20" },
          ],
        },
        {
          id: "T-103",
          from: "Site A",
          to: "Site B",
          article: "Pots vides",
          lot: "P26-02",
          unite: "u",
          events: [
            { id: "D1", kind: "depart", date: "2026-09-15", quantite: "200" },
            {
              id: "R1",
              kind: "reception",
              date: "2026-09-16",
              quantite: "150",
            },
            { id: "R2", kind: "reception", date: "2026-09-17", quantite: "50" },
          ],
        },
      ],
    },
    actual: null,
    comparison: null,
    journal: [],
  });
export function sampleResults() {
  return expectedRows(seed()).map((r) =>
    r.site === "Site B" && r.article === "Mélange A"
      ? { ...r, lot: "M26-40" }
      : r,
  );
}

import { parseCsv } from "../../shared/files.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export const YEAR = 2026;
export const MONTHS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];
export const IDS = MONTHS.map(
  (_, i) => `${YEAR}-${String(i + 1).padStart(2, "0")}`,
);
export const HEADERS = ["mois", "demande", "unite", "source"];
const hash = (x) => bytesToHex(sha256(utf8ToBytes(JSON.stringify(x))));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (x) => structuredClone(x);
function shape(v, fields, label) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !fields.includes(k)) ||
    fields.some((k) => !Object.hasOwn(v, k))
  )
    throw Error(`${label} : structure inattendue.`);
}
function text(v, label, max = 500, required = false) {
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\x00-\x08\x0b-\x1f]/.test(v) ||
    (required && !v.trim())
  )
    throw Error(
      `${label} : texte ${required ? "non vide " : ""}de ${max} caractères maximum attendu.`,
    );
  return v.trim();
}
export function decimal(v, label, max, places = 3, min = 0) {
  if (typeof v !== "string")
    throw Error(`${label} : valeur textuelle attendue.`);
  const t = v.trim().replace(",", ".");
  if (!t) return "";
  if (
    !new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(t) ||
    !Number.isFinite(Number(t)) ||
    Number(t) < min ||
    Number(t) > max
  )
    throw Error(
      `${label} : nombre de ${min} à ${max}, avec ${places} décimales maximum.`,
    );
  return String(Number(t));
}
const value = (s) => (s === "" ? null : Number(s));
const scaled = (s, factor) =>
  s === "" ? null : Math.round(Number(s) * factor);
export const maxDays = (id) =>
  new Date(Date.UTC(YEAR, IDS.indexOf(id) + 1, 0)).getUTCDate();
export function params(v) {
  shape(
    v,
    [
      "capture",
      "yield",
      "capacity",
      "captureSource",
      "yieldSource",
      "capacitySource",
    ],
    "Hypothèses",
  );
  return {
    capture: decimal(v.capture, "Captation", 100, 2),
    yield: decimal(v.yield, "Rendement", 100, 2, 0.01),
    capacity: decimal(v.capacity, "Capacité brute par jour", 1000000),
    captureSource: text(v.captureSource, "Source captation"),
    yieldSource: text(v.yieldSource, "Source rendement"),
    capacitySource: text(v.capacitySource, "Source capacité"),
  };
}
export function month(v) {
  shape(
    v,
    ["month", "demand", "unit", "demandSource", "days", "daysSource"],
    "Mois",
  );
  if (typeof v.month !== "string" || !IDS.includes(v.month))
    throw Error(`Mois attendu entre ${YEAR}-01 et ${YEAR}-12.`);
  if (typeof v.unit !== "string" || !["kg", "t"].includes(v.unit))
    throw Error("Unité attendue : kg ou t.");
  const days = text(v.days, "Jours", 2);
  if (days !== "" && (!/^\d+$/.test(days) || Number(days) > maxDays(v.month)))
    throw Error(
      `Jours d’ouverture : entier de 0 à ${maxDays(v.month)} pour ce mois.`,
    );
  return {
    month: v.month,
    demand: decimal(
      v.demand,
      "Demande du marché",
      v.unit === "t" ? 10000 : 10000000,
    ),
    unit: v.unit,
    demandSource: text(v.demandSource, "Source demande"),
    days: days === "" ? "" : String(Number(days)),
    daysSource: text(v.daysSource, "Source jours"),
  };
}
export function scenario(v) {
  shape(v, ["label", "params", "months", "review"], "Scénario");
  if (!Array.isArray(v.months) || v.months.length !== 12)
    throw Error("Douze mois requis.");
  const months = v.months.map(month);
  if (new Set(months.map((m) => m.month)).size !== 12)
    throw Error("Chaque mois doit apparaître une fois.");
  months.sort((a, b) => a.month.localeCompare(b.month));
  let review = null;
  if (v.review !== null) {
    shape(v.review, ["fingerprint", "note"], "Revue");
    if (
      typeof v.review.fingerprint !== "string" ||
      !/^([a-f0-9]{64})$/.test(v.review.fingerprint)
    )
      throw Error("Version de revue invalide.");
    review = {
      fingerprint: v.review.fingerprint,
      note: text(v.review.note, "Note de revue", 800, true),
    };
  }
  return {
    label: text(v.label, "Nom du scénario", 80, true),
    params: params(v.params),
    months,
    review,
  };
}
export const fingerprint = (s) => hash({ params: s.params, months: s.months });
export function restore(raw) {
  let v = typeof raw === "string" ? JSON.parse(raw) : raw;
  shape(v, ["version", "base", "variant", "journal"], "Dossier");
  if (v.version !== 1 || !Array.isArray(v.journal) || v.journal.length > 60)
    throw Error("Dossier CERESCO version 1 attendu.");
  return {
    version: 1,
    base: scenario(v.base),
    variant: scenario(v.variant),
    journal: v.journal.map((x) => text(x, "Journal", 600, true)),
  };
}
export function seed() {
  const volumes = [
    1600, 1700, 1800, 1700, 1900, 2000, 1300, 1000, 2400, 1900, 1800, 1600,
  ];
  const s = {
    label: "Variante de travail",
    params: {
      capture: "50",
      yield: "80",
      capacity: "150",
      captureSource: "Hypothèse fictive de captation du marché.",
      yieldSource: "Hypothèse fictive de rendement matière.",
      capacitySource: "Capacité fictive en kilogrammes bruts traités par jour.",
    },
    months: IDS.map((id, i) => ({
      month: id,
      demand: String(volumes[i]),
      unit: "kg",
      demandSource: "Enquête fictive, volumes préparés attendus.",
      days: "20",
      daysSource: "Calendrier fictif, jours effectivement mobilisables.",
    })),
    review: null,
  };
  return {
    version: 1,
    base: { ...clone(s), label: "Base de référence" },
    variant: s,
    journal: [],
  };
}
export function calculate(s) {
  const capture = scaled(s.params.capture, 100),
    yieldBp = scaled(s.params.yield, 100),
    perDayGrams = scaled(s.params.capacity, 1000);
  return s.months.map((m) => {
    const demandGrams = scaled(m.demand, m.unit === "t" ? 1000000 : 1000),
      days = value(m.days);
    const numerator =
      demandGrams === null || capture === null ? null : demandGrams * capture;
    const rawKg =
      numerator === null || yieldBp === null
        ? null
        : numerator / yieldBp / 1000;
    const capacityGrams =
      perDayGrams === null || days === null ? null : perDayGrams * days;
    const capacityKg = capacityGrams === null ? null : capacityGrams / 1000;
    const exceeds =
      rawKg === null || capacityGrams === null
        ? null
        : numerator > capacityGrams * yieldBp;
    const excessKg =
      exceeds === null
        ? null
        : exceeds
          ? (numerator - capacityGrams * yieldBp) / yieldBp / 1000
          : 0;
    const missing = [];
    for (const [label, amount] of [
      ["demande du marché", demandGrams],
      ["captation", capture],
      ["rendement", yieldBp],
      ["capacité quotidienne", perDayGrams],
      ["jours d’ouverture", days],
    ])
      if (amount === null) missing.push(label);
    const sourcesMissing = [];
    for (const [label, source] of [
      ["demande", m.demandSource],
      ["captation", s.params.captureSource],
      ["rendement", s.params.yieldSource],
      ["capacité", s.params.capacitySource],
      ["jours", m.daysSource],
    ])
      if (!source) sourcesMissing.push(label);
    return {
      ...m,
      demandKg: demandGrams === null ? null : demandGrams / 1000,
      capturedKg: numerator === null ? null : numerator / 10000000,
      rawKg,
      capacityKg,
      exceeds,
      excessKg,
      missing,
      sourcesMissing,
      daysRequired:
        rawKg === null || perDayGrams === null
          ? null
          : numerator === 0
            ? 0
            : perDayGrams === 0
              ? null
              : Math.ceil(numerator / (yieldBp * perDayGrams)),
    };
  });
}
export function summarize(s) {
  const rows = calculate(s),
    known = rows.filter((r) => r.rawKg !== null && r.capacityKg !== null);
  return {
    rows,
    knownMonths: known.length,
    rawKg: known.length ? known.reduce((sum, r) => sum + r.rawKg, 0) : null,
    capacityKg: known.length
      ? known.reduce((sum, r) => sum + r.capacityKg, 0)
      : null,
    overloadMonths: rows.filter((r) => r.exceeds).length,
    incomplete: rows.some((r) => r.missing.length || r.sourcesMissing.length),
  };
}
export function isReviewed(s) {
  return s.review?.fingerprint === fingerprint(s) && !summarize(s).incomplete;
}
function logged(d, variant, action) {
  return { ...d, variant, journal: [...d.journal, action].slice(-60) };
}
export function editScenario(d, newParams, newMonth) {
  const p = params(newParams),
    m = month(newMonth);
  const next = {
    ...d.variant,
    params: p,
    months: d.variant.months.map((x) => (x.month === m.month ? m : x)),
  };
  return same(next, d.variant)
    ? d
    : logged(
        d,
        next,
        `Hypothèses et ${MONTHS[IDS.indexOf(m.month)].toLowerCase()} modifiés ; base conservée.`,
      );
}
export function markReview(d, note) {
  if (summarize(d.variant).incomplete)
    throw Error("Renseignez les valeurs et leurs sources avant la revue.");
  return logged(
    d,
    {
      ...d.variant,
      review: {
        fingerprint: fingerprint(d.variant),
        note: text(note, "Note de revue", 800, true),
      },
    },
    "Variante relue pour cette version.",
  );
}
export function saveBase(d) {
  const base = { ...clone(d.variant), label: "Base de référence" };
  return {
    ...d,
    base,
    journal: [
      ...d.journal,
      "Variante mémorisée comme nouvelle base de comparaison.",
    ].slice(-60),
  };
}
export function parseDemand(raw) {
  const p = parseCsv(raw, { requiredHeaders: HEADERS, maxRows: 12 });
  if (p.headers.length !== 4 || p.rows.length !== 12)
    throw Error("Les quatre colonnes documentées et douze mois sont requis.");
  const rows = p.rows.map((r) => {
    const n = month({
      month: r.mois,
      demand: r.demande,
      unit: r.unite,
      demandSource: r.source,
      days: "",
      daysSource: "",
    });
    return {
      month: n.month,
      demand: n.demand,
      unit: n.unit,
      demandSource: n.demandSource,
    };
  });
  if (new Set(rows.map((r) => r.month)).size !== 12)
    throw Error("Un mois est présent plusieurs fois.");
  return rows.sort((a, b) => a.month.localeCompare(b.month));
}
export function importDemand(d, rows) {
  if (!Array.isArray(rows) || rows.length !== 12)
    throw Error("Douze lignes attendues.");
  const next = {
    ...d.variant,
    months: d.variant.months.map((m) => {
      const r = rows.find((x) => x.month === m.month);
      if (!r) throw Error("Un mois est absent.");
      return month({ ...m, ...r });
    }),
  };
  return same(d.variant, next)
    ? d
    : logged(
        d,
        next,
        "Demande de la variante remplacée ; calendrier et base conservés.",
      );
}
export const display = (n) =>
  n === null
    ? "Non calculable"
    : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n);
export const output = (n) => (n === null ? "" : Number(n.toFixed(9)));
export const RESULT_HEADERS = [
  "mois",
  "demande_marche_base_kg",
  "demande_marche_variante_kg",
  "besoin_brut_base_kg",
  "besoin_brut_variante_kg",
  "capacite_base_kg",
  "capacite_variante_kg",
  "depassement_variante_kg",
  "jours_requis_variante",
  "donnees_manquantes",
  "sources_manquantes",
  "revue_variante",
];
export function resultRows(d) {
  const b = calculate(d.base);
  return calculate(d.variant).map((v, i) => [
    v.month,
    ...[
      b[i].demandKg,
      v.demandKg,
      b[i].rawKg,
      v.rawKg,
      b[i].capacityKg,
      v.capacityKg,
      v.excessKg,
      v.daysRequired,
    ].map(output),
    v.missing.join(" | "),
    v.sourcesMissing.join(" | "),
    isReviewed(d.variant) ? "Relue pour cette version" : "À relire",
  ]);
}
export function report(d) {
  return {
    title: "Comparaison des volumes de légumerie",
    subtitle: `${YEAR} · Étude indépendante CERESCO · Données fictives`,
    sections: [
      {
        title: "Lecture des calculs",
        paragraphs: [
          "Demande du marché en légumes préparés. Volume capté = demande × captation. Besoin brut = volume capté ÷ rendement matière. Capacité brute = jours × kilogrammes bruts par jour. Aucun report de production entre mois.",
          "Ce modèle arithmétique ne détermine ni approvisionnement agricole disponible, ni rentabilité, ni faisabilité sanitaire. Les paramètres restent à confirmer avec le consultant.",
          "Valeurs arrondies seulement pour la restitution. Une cellule vide dans le CSV signifie un résultat non calculable.",
        ],
      },
      {
        title: "Comparatif mensuel",
        headers: RESULT_HEADERS,
        rows: resultRows(d),
      },
      ...["base", "variant"].flatMap((key) => {
        const s = d[key];
        return [
          {
            title: s.label,
            headers: ["Hypothèse", "Valeur", "Source déclarée"],
            rows: [
              [
                "Captation (%)",
                s.params.capture || "Inconnue",
                s.params.captureSource,
              ],
              [
                "Rendement (%)",
                s.params.yield || "Inconnu",
                s.params.yieldSource,
              ],
              [
                "Capacité (kg bruts/jour)",
                s.params.capacity || "Inconnue",
                s.params.capacitySource,
              ],
            ],
          },
          {
            title: `${s.label} · sources mensuelles`,
            headers: [
              "Mois",
              "Demande reçue",
              "Unité",
              "Source demande",
              "Jours",
              "Source jours",
            ],
            rows: s.months.map((m) => [
              m.month,
              m.demand || "Inconnue",
              m.unit,
              m.demandSource,
              m.days || "Inconnus",
              m.daysSource,
            ]),
          },
          {
            title: `${s.label} · revue`,
            paragraphs: [
              isReviewed(s)
                ? "Revue déclarée pour cette version."
                : s.review
                  ? "Revue antérieure devenue périmée."
                  : "Aucune revue déclarée.",
              s.review?.note || "",
            ],
          },
        ];
      }),
    ],
  };
}

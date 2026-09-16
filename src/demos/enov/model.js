import { parseCsv } from "../../shared/files.js";

export const HEADERS = [
  "reference",
  "mission",
  "date",
  "montant",
  "justificatif",
];
export const MISSIONS = ["VM-2408", "VM-2409", "VM-2410", "VM-2411"];
const fields = ["mission", "date", "amount", "receipt"];
const safeText = (v, max = 140) =>
  typeof v === "string" && v.length <= max && !/[\u0000-\u0008]/.test(v);
export function cents(value) {
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return result > 0 && Number.isSafeInteger(result) ? result : null;
}
export function validDate(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}
export function similarRows(row, rows) {
  if (cents(row.amount) === null || !validDate(row.date)) return [];
  return rows.filter(
    (other) =>
      other.id !== row.id &&
      other.mission === row.mission &&
      other.date === row.date &&
      cents(other.amount) === cents(row.amount),
  );
}
export function fingerprint(row, rows) {
  return JSON.stringify([
    row.id,
    ...fields.map((key) => row[key]),
    similarRows(row, rows)
      .map((peer) => [peer.id, ...fields.map((key) => peer[key])])
      .sort((a, b) => a[0].localeCompare(b[0])),
  ]);
}
export function rowProblems(row) {
  const errors = [];
  if (!MISSIONS.includes(row.mission))
    errors.push("Mission inconnue dans le référentiel exemple.");
  if (!validDate(row.date))
    errors.push("Date invalide, attendue au format AAAA-MM-JJ.");
  if (cents(row.amount) === null)
    errors.push("Montant positif avec deux décimales au maximum requis.");
  if (!row.receipt.trim()) errors.push("Référence du justificatif manquante.");
  return errors;
}
export function stateOf(row, rows) {
  const current = row.review?.fingerprint === fingerprint(row, rows);
  if (current && row.review.decision === "exclude" && row.review.reason.trim())
    return "excluded";
  if (
    current &&
    row.review.decision === "keep" &&
    row.review.checked &&
    !rowProblems(row).length &&
    (!similarRows(row, rows).length || row.review.reason.trim())
  )
    return "approved";
  return "pending";
}
function journal(state, id, action) {
  return [
    ...state.journal,
    { step: (state.journal.at(-1)?.step || 0) + 1, id, action },
  ].slice(-100);
}
export function editRow(state, id, field, value) {
  if (!fields.includes(field) || !safeText(value))
    throw new Error("Champ ou valeur non reconnu.");
  const previous = state.rows.find((row) => row.id === id);
  if (!previous) throw new Error("Cette référence n’existe plus.");
  if (previous[field] === value) return state;
  return {
    ...state,
    rows: state.rows.map((row) =>
      row.id === id ? { ...row, [field]: value } : row,
    ),
    journal: journal(
      state,
      id,
      `Modification de ${{ mission: "la mission", date: "la date", amount: "la somme", receipt: "la référence justificatif" }[field]} ; contrôle à refaire.`,
    ),
  };
}
export function reviewRow(
  state,
  id,
  { decision, reason = "", checked = false },
) {
  const row = state.rows.find((item) => item.id === id);
  if (!row) throw new Error("Choisissez une ligne.");
  if (!["keep", "exclude"].includes(decision))
    throw new Error("Choisissez de conserver ou d’exclure cette ligne.");
  if (!safeText(reason, 500))
    throw new Error("Le motif doit rester inférieur à 500 caractères.");
  const peers = similarRows(row, state.rows);
  if ((peers.length || decision === "exclude") && !reason.trim())
    throw new Error("Ajoutez un motif à votre décision.");
  if (decision === "exclude" && !peers.length)
    throw new Error(
      "L’exclusion pour doublon nécessite une déclaration proche.",
    );
  if (decision === "keep") {
    const errors = rowProblems(row);
    if (errors.length) throw new Error(errors.join(" "));
    if (!checked)
      throw new Error(
        "Confirmez le contrôle du justificatif dans cet exemple.",
      );
  }
  const review = {
    decision,
    reason: reason.trim(),
    checked: Boolean(checked),
    fingerprint: fingerprint(row, state.rows),
  };
  return {
    ...state,
    rows: state.rows.map((item) =>
      item.id === id ? { ...item, review } : item,
    ),
    journal: journal(
      state,
      id,
      decision === "exclude"
        ? "Ligne exclue après décision motivée."
        : "Ligne validée après contrôle humain.",
    ),
  };
}
export function seedState() {
  let state = {
    schema: "enov-frais-v1",
    rows: [
      {
        id: "R-106",
        mission: "VM-2409",
        date: "2026-09-10",
        amount: "52,30",
        receipt: "JUST-7793",
        review: null,
      },
      {
        id: "R-107",
        mission: "VM-2408",
        date: "2026-09-11",
        amount: "18,50",
        receipt: "JUST-7821",
        review: null,
      },
      {
        id: "R-108",
        mission: "VM-2409",
        date: "2026-09-12",
        amount: "24,80",
        receipt: "JUST-7842",
        review: null,
      },
      {
        id: "R-109",
        mission: "VM-2409",
        date: "2026-09-12",
        amount: "24,80",
        receipt: "JUST-7956",
        review: null,
      },
      {
        id: "R-110",
        mission: "VM-2410",
        date: "2026-09-13",
        amount: "67,20",
        receipt: "",
        review: null,
      },
      {
        id: "R-111",
        mission: "VM-2411",
        date: "2026-09-14",
        amount: "31,00",
        receipt: "JUST-8028",
        review: null,
      },
    ],
    journal: [],
  };
  for (const id of ["R-106", "R-107"])
    state = reviewRow(state, id, {
      decision: "keep",
      checked: true,
      reason: "Validation présente dans l’exemple.",
    });
  return state;
}
export function importRows(text) {
  const { rows } = parseCsv(text, { requiredHeaders: HEADERS, maxRows: 500 });
  if (!rows.length) throw new Error("Le fichier ne contient aucune dépense.");
  const seen = new Set();
  const items = rows.map((input, index) => {
    const prefix = `Ligne ${index + 2}`;
    const row = {
      id: input.reference.trim(),
      mission: input.mission.trim(),
      date: input.date.trim(),
      amount: input.montant.trim(),
      receipt: input.justificatif.trim(),
      review: null,
    };
    if (!row.id || row.id.length > 40 || seen.has(row.id))
      throw new Error(
        `${prefix} : référence absente, trop longue ou déjà utilisée.`,
      );
    for (const value of Object.values(row).filter((v) => v !== null))
      if (!safeText(value))
        throw new Error(`${prefix} : champ trop long ou caractère invalide.`);
    if (!validDate(row.date))
      throw new Error(`${prefix} : date invalide. Utilisez AAAA-MM-JJ.`);
    if (cents(row.amount) === null)
      throw new Error(
        `${prefix} : montant positif attendu, au plus deux décimales.`,
      );
    if (!MISSIONS.includes(row.mission))
      throw new Error(
        `${prefix} : mission inconnue. Références disponibles : ${MISSIONS.join(", ")}.`,
      );
    seen.add(row.id);
    return row;
  });
  return {
    schema: "enov-frais-v1",
    rows: items,
    journal: [
      {
        step: 1,
        id: "Lot",
        action: `Import de ${items.length} lignes ; validations à effectuer.`,
      },
    ],
  };
}
export function restoreState(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Le dossier JSON ne peut pas être lu.");
  }
  if (
    parsed?.schema !== "enov-frais-v1" ||
    !Array.isArray(parsed.rows) ||
    !parsed.rows.length ||
    parsed.rows.length > 500 ||
    !Array.isArray(parsed.journal) ||
    parsed.journal.length > 100
  )
    throw new Error("Ce fichier n’est pas un dossier de frais compatible.");
  const ids = new Set();
  for (const row of parsed.rows) {
    if (
      !row ||
      !safeText(row.id, 40) ||
      !row.id.trim() ||
      ids.has(row.id) ||
      !fields.every((f) => safeText(row[f]))
    )
      throw new Error("Référence ou champ invalide dans le dossier.");
    ids.add(row.id);
    if (
      row.review != null &&
      (!["keep", "exclude"].includes(row.review.decision) ||
        typeof row.review.checked !== "boolean" ||
        !safeText(row.review.reason, 500) ||
        !safeText(row.review.fingerprint, 100000))
    )
      throw new Error("Décision illisible dans le dossier.");
  }
  if (
    parsed.journal.some(
      (entry) =>
        !entry ||
        !Number.isSafeInteger(entry.step) ||
        entry.step < 1 ||
        !safeText(entry.id, 40) ||
        !safeText(entry.action, 500),
    )
  )
    throw new Error("Historique invalide dans le dossier.");
  return {
    schema: parsed.schema,
    rows: parsed.rows.map((row) => ({
      id: row.id,
      mission: row.mission,
      date: row.date,
      amount: row.amount,
      receipt: row.receipt,
      review: row.review ? { ...row.review } : null,
    })),
    journal: parsed.journal.map((entry) => ({ ...entry })),
  };
}
export function exportRows(state, wanted) {
  return state.rows
    .filter((row) => stateOf(row, state.rows) === wanted)
    .map((row) => ({
      reference: row.id,
      mission: row.mission,
      date: row.date,
      montant:
        cents(row.amount) === null
          ? row.amount
          : (cents(row.amount) / 100).toFixed(2).replace(".", ","),
      justificatif: row.receipt,
      decision:
        row.review?.fingerprint === fingerprint(row, state.rows)
          ? row.review.decision
          : "",
      motif:
        row.review?.fingerprint === fingerprint(row, state.rows)
          ? row.review.reason
          : "",
      controle:
        wanted === "pending"
          ? [
              ...rowProblems(row),
              ...(similarRows(row, state.rows).length
                ? ["Déclarations proches à examiner."]
                : []),
              ...(row.review
                ? ["Décision à renouveler après modification."]
                : ["Contrôle humain à effectuer."]),
            ].join(" ")
          : wanted === "excluded"
            ? "Exclusion humaine motivée"
            : "Validation humaine déclarée",
    }));
}

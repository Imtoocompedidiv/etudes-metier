import { parseCsv } from "../../shared/files.js";

export const REGISTRY_HEADERS = [
  "code",
  "modele",
  "acheteur",
  "consigne_euros",
  "deja_traitee",
];
export const RETURN_HEADERS = [
  "demande",
  "code_recu",
  "modele_declare",
  "beneficiaire",
  "email",
];
export const MODELS = [
  "Voiture",
  "Camion",
  "Bateau",
  "Anneaux",
  "Autre marque",
];
export const CONDITIONS = ["Bon état apparent", "Abîmé", "Incomplet"];
export const DIRECTIONS = [
  "Reconditionnement à examiner",
  "Recyclage à examiner",
];
const validCode = (x) =>
  typeof x === "string" && /^[A-Z0-9][A-Z0-9-]{2,39}$/.test(x);
const short = (x) => typeof x === "string" && x.length <= 250;
const emailValid = (x) =>
  typeof x === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
function dateValid(x) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const d = new Date(x + "T12:00:00Z");
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === x;
}
function journal(state, description) {
  return [
    ...state.journal,
    { n: (state.journal.at(-1)?.n || 0) + 1, description },
  ].slice(-150);
}
export function effectiveCode(row) {
  return row.link?.code || row.code_recu;
}
function registered(state, row) {
  return state.registry.find((x) => x.code === effectiveCode(row));
}
function fingerprint(state, row) {
  const { review, ...values } = row;
  return JSON.stringify([values, registered(state, row) || null]);
}
export function currentReview(state, row) {
  return row.review?.fingerprint === fingerprint(state, row)
    ? row.review
    : null;
}
export function seed() {
  const registry = [
    ["SP-VOIT-111", "Voiture", "Alex Rousseau"],
    ["SP-CAM-202", "Camion", "Inès Laurent"],
    ["SP-BAT-303", "Bateau", "Sami Perrin"],
    ["SP-AN-404", "Anneaux", "Aya Morel"],
    ["SP-VOIT-505", "Voiture", "Lou Marin"],
  ].map(([code, modele, acheteur], i) => ({
    code,
    modele,
    acheteur,
    cents: 200,
    processed: i === 4,
  }));
  const requests = [
    ["R-01", "SP-VOIT-11", "Voiture", "Mila Rousseau", "mila@example.test"],
    ["R-02", "SP-CAM-202", "Camion", "Inès Laurent", "ines@example.test"],
    ["R-03", "SP-BAT-303", "Bateau", "Noé Perrin", "noe@example.test"],
    ["R-04", "SP-BAT-303", "Bateau", "Noé Perrin", "noe@example.test"],
    ["R-05", "SP-AN-404", "Anneaux", "Aya Morel", "aya@example.test"],
    ["R-06", "AUTRE-11", "Autre marque", "Eli Martin", "eli@example.test"],
  ].map(([demande, code_recu, modele_declare, beneficiaire, email]) => ({
    demande,
    code_recu,
    modele_declare,
    beneficiaire,
    email,
    link: null,
    received: false,
    date: "",
    observed: "",
    condition: "",
    direction: "",
    note: "",
    review: null,
  }));
  let state = {
    schema: "simple-retours-v1",
    registry,
    requests,
    journal: [],
    files: { registry: "codes-exemple.csv", requests: "retours-exemple.csv" },
  };
  state.requests[4] = {
    ...state.requests[4],
    received: true,
    date: "2026-09-16",
    observed: "Anneaux",
    condition: "Bon état apparent",
    direction: "Reconditionnement à examiner",
    note: "Exemple de réception déjà vérifiée.",
  };
  return decide(
    state,
    "R-05",
    "prepare",
    "Réception et bénéficiaire vérifiés dans le scénario fictif.",
  );
}
export function inspect(state, row) {
  const record = registered(state, row);
  const review = currentReview(state, row);
  if (review?.kind === "exclude")
    return {
      row,
      record,
      review,
      issues: [],
      status: "excluded",
      label: "Écarté du lot",
    };
  const issues = [];
  if (!record) issues.push("Code absent du registre");
  if (record?.processed) issues.push("Consigne déjà traitée dans le registre");
  const duplicates = state.requests.filter(
    (x) =>
      x.demande !== row.demande &&
      effectiveCode(x) === effectiveCode(row) &&
      currentReview(state, x)?.kind !== "exclude",
  );
  if (duplicates.length)
    issues.push(
      "Même code dans " + duplicates.map((x) => x.demande).join(", "),
    );
  if (!row.beneficiaire.trim() || !emailValid(row.email))
    issues.push("Bénéficiaire ou email à compléter");
  if (!row.received) issues.push("Réception physique non confirmée");
  else if (!dateValid(row.date)) issues.push("Date de réception à compléter");
  if (!MODELS.includes(row.observed)) issues.push("Modèle reçu à constater");
  else if (row.observed === "Autre marque")
    issues.push("Autre marque hors circuit Simple.");
  else if (record && row.observed !== record.modele)
    issues.push("Modèle reçu différent du registre");
  if (!CONDITIONS.includes(row.condition))
    issues.push("État du jouet à constater");
  if (!DIRECTIONS.includes(row.direction))
    issues.push("Orientation de tri à proposer");
  const status = issues.length
    ? "blocked"
    : review?.kind === "prepare"
      ? "ready"
      : "review";
  const label =
    status === "ready"
      ? "Prêt à préparer"
      : !record
        ? "Code inconnu"
        : duplicates.length
          ? "Même code"
          : !row.received
            ? "Réception à pointer"
            : status === "review"
              ? "À confirmer"
              : issues[0];
  return {
    row,
    record,
    review,
    issues,
    status,
    label,
    stale: Boolean(row.review && !review),
  };
}
export function summary(state) {
  const rows = state.requests.map((x) => inspect(state, x));
  const ready = rows.filter((x) => x.status === "ready");
  return {
    rows,
    ready,
    pending: rows.filter((x) => !["ready", "excluded"].includes(x.status)),
    excluded: rows.filter((x) => x.status === "excluded"),
    cents: ready.reduce((a, x) => a + x.record.cents, 0),
  };
}
function changeRow(state, id, patch, message) {
  if (!state.requests.some((x) => x.demande === id))
    throw Error("Demande introuvable.");
  return {
    ...state,
    requests: state.requests.map((x) =>
      x.demande === id ? { ...x, ...patch } : x,
    ),
    journal: journal(state, id + " · " + message),
  };
}
export function linkCode(state, id, code, note) {
  if (!state.registry.some((x) => x.code === code))
    throw Error("Choisissez un code présent dans le registre.");
  if (!note?.trim() || !short(note))
    throw Error("Expliquez le rapprochement en 250 caractères maximum.");
  return changeRow(
    state,
    id,
    { link: { code, note: note.trim() } },
    "Code rapproché manuellement de " + code + " : " + note.trim(),
  );
}
export function unlinkCode(state, id) {
  return changeRow(
    state,
    id,
    { link: null },
    "Rapprochement retiré ; code reçu conservé.",
  );
}
export function saveReceipt(state, id, values) {
  const keys = [
    "beneficiaire",
    "email",
    "date",
    "observed",
    "condition",
    "direction",
    "note",
  ];
  for (const key of keys)
    if (!short(values[key]))
      throw Error("Un champ est absent ou dépasse 250 caractères.");
  if (typeof values.received !== "boolean")
    throw Error("Confirmez le constat de réception.");
  if (values.date && !dateValid(values.date))
    throw Error("Date de réception invalide.");
  if (values.observed && !MODELS.includes(values.observed))
    throw Error("Modèle observé inconnu.");
  if (values.condition && !CONDITIONS.includes(values.condition))
    throw Error("État inconnu.");
  if (values.direction && !DIRECTIONS.includes(values.direction))
    throw Error("Orientation inconnue.");
  const patch = Object.fromEntries(keys.map((k) => [k, values[k].trim()]));
  patch.received = values.received;
  return changeRow(state, id, patch, "Constats et bénéficiaire enregistrés.");
}
export function decide(state, id, kind, note) {
  const row = state.requests.find((x) => x.demande === id);
  if (!row) throw Error("Demande introuvable.");
  if (!["prepare", "exclude"].includes(kind) || !note?.trim() || !short(note))
    throw Error(
      "Choisissez une décision et ajoutez un motif de 250 caractères maximum.",
    );
  if (kind === "prepare") {
    const issues = inspect(
      {
        ...state,
        requests: state.requests.map((x) =>
          x.demande === id ? { ...x, review: null } : x,
        ),
      },
      { ...row, review: null },
    ).issues;
    if (issues.length) throw Error(issues.join(" · "));
  }
  return changeRow(
    state,
    id,
    {
      review: { kind, note: note.trim(), fingerprint: fingerprint(state, row) },
    },
    (kind === "prepare" ? "Préparation confirmée" : "Demande écartée") +
      " : " +
      note.trim(),
  );
}
export function parseRegistry(raw) {
  const { rows } = parseCsv(raw, {
    requiredHeaders: REGISTRY_HEADERS,
    maxRows: 500,
  });
  if (!rows.length) throw Error("Le registre est vide.");
  const used = new Set();
  return rows.map((x, i) => {
    if (!validCode(x.code) || used.has(x.code))
      throw Error("Ligne " + (i + 2) + " : code invalide ou répété.");
    used.add(x.code);
    if (!MODELS.slice(0, 4).includes(x.modele) || !short(x.acheteur))
      throw Error("Modèle ou acheteur invalide.");
    if (
      !/^\d{1,3}(?:[.,]\d{1,2})?$/.test(x.consigne_euros) ||
      !["oui", "non"].includes(x.deja_traitee)
    )
      throw Error("Montant ou indicateur déjà traité invalide.");
    const cents = Math.round(Number(x.consigne_euros.replace(",", ".")) * 100);
    if (cents <= 0 || cents > 10000)
      throw Error("Consigne entre 0,01 et 100 euros attendue.");
    return {
      code: x.code,
      modele: x.modele,
      acheteur: x.acheteur,
      cents,
      processed: x.deja_traitee === "oui",
    };
  });
}
export function parseReturns(raw) {
  const { rows } = parseCsv(raw, {
    requiredHeaders: RETURN_HEADERS,
    maxRows: 500,
  });
  if (!rows.length) throw Error("Le lot est vide.");
  const used = new Set();
  return rows.map((x, i) => {
    if (!validCode(x.demande) || used.has(x.demande))
      throw Error("Ligne " + (i + 2) + " : demande invalide ou répétée.");
    used.add(x.demande);
    if (
      !validCode(x.code_recu) ||
      !MODELS.includes(x.modele_declare) ||
      !short(x.beneficiaire) ||
      !short(x.email)
    )
      throw Error("Ligne " + (i + 2) + " : code, modèle ou texte invalide.");
    return {
      ...Object.fromEntries(RETURN_HEADERS.map((k) => [k, x[k]])),
      link: null,
      received: false,
      date: "",
      observed: "",
      condition: "",
      direction: "",
      note: "",
      review: null,
    };
  });
}
export function importData(state, side, raw, name) {
  if (!["registry", "requests"].includes(side)) throw Error("Import inconnu.");
  const value = side === "registry" ? parseRegistry(raw) : parseReturns(raw);
  return {
    ...state,
    [side]: value,
    requests:
      side === "registry"
        ? state.requests.map((x) => ({ ...x, review: null }))
        : value,
    files: { ...state.files, [side]: String(name).slice(0, 150) },
    journal: journal(
      state,
      "Import " +
        (side === "registry" ? "du registre" : "des demandes") +
        " ; préparations à confirmer.",
    ),
  };
}
export function preparation(state) {
  return summary(state).ready.map((x) => ({
    demande: x.row.demande,
    code: x.record.code,
    modele: x.record.modele,
    beneficiaire: x.row.beneficiaire,
    email: x.row.email,
    reception: x.row.date,
    consigne_euros: (x.record.cents / 100).toFixed(2),
    orientation: x.row.direction,
    motif: x.review.note,
    statut: "Préparation uniquement, aucun bon émis",
  }));
}
export function exceptions(state) {
  return summary(state)
    .rows.filter((x) => x.status !== "ready")
    .map((x) => ({
      demande: x.row.demande,
      code_recu: x.row.code_recu,
      code_retenu: effectiveCode(x.row),
      beneficiaire: x.row.beneficiaire,
      statut: x.label,
      points:
        x.status === "excluded"
          ? x.review.note
          : x.issues.join(" | ") || "Décision humaine attendue",
    }));
}
export function restore(raw) {
  const s = JSON.parse(raw);
  if (
    s?.schema !== "simple-retours-v1" ||
    !Array.isArray(s.registry) ||
    !Array.isArray(s.requests) ||
    !s.registry.length ||
    !s.requests.length ||
    s.registry.length > 500 ||
    s.requests.length > 500 ||
    !Array.isArray(s.journal) ||
    s.journal.length > 150 ||
    !s.files
  )
    throw Error("Dossier Simple. incompatible.");
  const codes = new Set();
  for (const r of s.registry) {
    if (
      !validCode(r.code) ||
      codes.has(r.code) ||
      !MODELS.slice(0, 4).includes(r.modele) ||
      !short(r.acheteur) ||
      !Number.isInteger(r.cents) ||
      r.cents < 1 ||
      r.cents > 10000 ||
      typeof r.processed !== "boolean"
    )
      throw Error("Registre du dossier invalide.");
    codes.add(r.code);
  }
  const ids = new Set();
  for (const r of s.requests) {
    if (
      !validCode(r.demande) ||
      ids.has(r.demande) ||
      !validCode(r.code_recu) ||
      !MODELS.includes(r.modele_declare)
    )
      throw Error("Demande du dossier invalide.");
    ids.add(r.demande);
    for (const k of [
      "beneficiaire",
      "email",
      "date",
      "observed",
      "condition",
      "direction",
      "note",
    ])
      if (!short(r[k])) throw Error("Champ du dossier invalide.");
    if (
      typeof r.received !== "boolean" ||
      (r.date && !dateValid(r.date)) ||
      (r.observed && !MODELS.includes(r.observed)) ||
      (r.condition && !CONDITIONS.includes(r.condition)) ||
      (r.direction && !DIRECTIONS.includes(r.direction))
    )
      throw Error("Constat du dossier invalide.");
    if (
      r.link &&
      (!validCode(r.link.code) || !short(r.link.note) || !r.link.note.trim())
    )
      throw Error("Rapprochement invalide.");
    if (
      r.review &&
      (!["prepare", "exclude"].includes(r.review.kind) ||
        !short(r.review.note) ||
        !r.review.note.trim() ||
        typeof r.review.fingerprint !== "string" ||
        r.review.fingerprint.length > 5000)
    )
      throw Error("Décision invalide.");
  }
  if (
    !s.journal.every(
      (x) =>
        Number.isInteger(x.n) &&
        typeof x.description === "string" &&
        x.description.length <= 600,
    ) ||
    !short(s.files.registry) ||
    !short(s.files.requests)
  )
    throw Error("Journal du dossier invalide.");
  return s;
}

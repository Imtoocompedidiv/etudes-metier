import { parseCsv } from "../../shared/files.js";

export const HEADERS = ["place", "nom", "email", "categorie"];
export const CATEGORIES = ["Interne", "Médecin", "Autre professionnel"];
const validId = (value) =>
  typeof value === "string" && /^[A-Z0-9][A-Z0-9_-]{0,30}$/i.test(value);
const text = (value) =>
  typeof value === "string" &&
  value.length <= 250 &&
  !/[\u0000-\u0008]/.test(value);
export function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function seed() {
  const previous = [
    {
      place: "G-01",
      nom: "Ana Morel",
      email: "ana.morel@example.test",
      categorie: "Interne",
    },
    {
      place: "G-02",
      nom: "Thomas Bernard",
      email: "thomas.bernard@example.test",
      categorie: "Médecin",
    },
    {
      place: "G-03",
      nom: "Camille Duval",
      email: "camille@example.test",
      categorie: "Interne",
    },
    {
      place: "G-04",
      nom: "Lucas Petit",
      email: "lucas.petit@example.test",
      categorie: "Interne",
    },
    {
      place: "G-05",
      nom: "Sophie Laurent",
      email: "sophie.laurent@example.test",
      categorie: "Interne",
    },
    {
      place: "G-06",
      nom: "Nicolas Leroy",
      email: "nicolas.leroy@example.test",
      categorie: "Interne",
    },
  ];
  const incoming = structuredClone(previous).slice(0, 5);
  Object.assign(incoming[2], { nom: "Lou Martin", email: "lou@example.test" });
  incoming[3].categorie = "Médecin";
  incoming[4].email = "thomas.bernard@example.test";
  return {
    schema: "colloquium-listes-v1",
    previous,
    incoming,
    capacity: 6,
    reviews: [],
    journal: [],
    files: {
      previous: "groupe-septembre-v1.csv",
      incoming: "groupe-septembre-v2.csv",
    },
  };
}
export function changes(before, after) {
  if (!before) return ["Ajout"];
  if (!after) return ["Retrait"];
  return HEADERS.slice(1).filter((key) => before[key] !== after[key]);
}
function signature(before, after) {
  return JSON.stringify([before, after]);
}
export function entries(state) {
  const ids = [
    ...new Set([
      ...state.previous.map((row) => row.place),
      ...state.incoming.map((row) => row.place),
    ]),
  ];
  return ids.map((id) => {
    const before = state.previous.find((row) => row.place === id) || null;
    const after = state.incoming.find((row) => row.place === id) || null;
    const delta = changes(before, after);
    const saved = state.reviews.find((review) => review.place === id);
    const review = saved?.signature === signature(before, after) ? saved : null;
    const row =
      review?.action === "keep"
        ? before
        : review?.action === "remove"
          ? null
          : after;
    return {
      id,
      before,
      after,
      delta,
      review,
      row,
      changed: delta.length > 0,
      pending: delta.length > 0 && !review,
      stale: Boolean(saved && !review),
    };
  });
}
function append(state, place, message) {
  return [
    ...state.journal,
    { step: (state.journal.at(-1)?.step || 0) + 1, place, message },
  ].slice(-150);
}
export function rowIssues(row) {
  if (!row) return [];
  const issues = [];
  if (!row.nom.trim()) issues.push("Nom manquant");
  if (!validEmail(row.email.trim()))
    issues.push("Adresse email invalide ou absente");
  if (!CATEGORIES.includes(row.categorie)) issues.push("Catégorie inconnue");
  return issues;
}
export function controls(state) {
  const list = entries(state);
  const rows = list.map((entry) => entry.row).filter(Boolean);
  const problems = [];
  list
    .filter((entry) => entry.pending)
    .forEach((entry) =>
      problems.push({
        place: entry.id,
        type: "decision",
        message: entry.stale
          ? "Décision à refaire après modification"
          : "Changement à examiner",
      }),
    );
  rows.forEach((row) =>
    rowIssues(row).forEach((message) =>
      problems.push({ place: row.place, type: "field", message }),
    ),
  );
  const emails = new Map();
  rows.forEach((row) => {
    const email = row.email.trim().toLowerCase();
    if (email) emails.set(email, [...(emails.get(email) || []), row.place]);
  });
  for (const [email, ids] of emails)
    if (ids.length > 1)
      problems.push({
        place: ids[0],
        places: ids,
        type: "email",
        message: `Adresse répétée entre ${ids.join(" et ")} : ${email}`,
      });
  if (
    !Number.isSafeInteger(state.capacity) ||
    state.capacity < 1 ||
    state.capacity > 1000
  )
    problems.push({
      place: "Lot",
      type: "capacity",
      message:
        "Le nombre de places commandées doit être un entier entre 1 et 1 000.",
    });
  else if (rows.length > state.capacity)
    problems.push({
      place: "Lot",
      type: "capacity",
      message: `${rows.length} personnes proposées pour ${state.capacity} places commandées.`,
    });
  if (!rows.length)
    problems.push({
      place: "Lot",
      type: "empty",
      message: "La liste retenue ne peut pas être vide.",
    });
  return {
    list,
    rows,
    problems,
    pending: list.filter((entry) => entry.pending).length,
    emailConflicts: [...emails.values()].filter((ids) => ids.length > 1).length,
  };
}
export function edit(state, id, key, value) {
  if (!HEADERS.includes(key) || !text(value))
    throw new Error("Champ ou valeur invalide.");
  if (!state.incoming.some((row) => row.place === id))
    throw new Error("Cette ligne reçue n’existe plus.");
  if (
    key === "place" &&
    (!validId(value) ||
      state.incoming.some((row) => row.place === value && row.place !== id))
  )
    throw new Error(
      "La clé de place doit être unique, de 1 à 31 lettres, chiffres, tirets ou traits bas.",
    );
  return {
    ...state,
    incoming: state.incoming.map((row) =>
      row.place === id ? { ...row, [key]: value } : row,
    ),
    journal: append(
      state,
      id,
      `Modification de ${key === "place" ? "la clé de place" : key} dans la version reçue.`,
    ),
  };
}
export function setCapacity(state, value) {
  if (
    !/^\d{1,4}$/.test(String(value)) ||
    Number(value) < 1 ||
    Number(value) > 1000
  )
    throw new Error("Saisissez de 1 à 1 000 places commandées.");
  return {
    ...state,
    capacity: Number(value),
    journal: append(
      state,
      "Lot",
      `Capacité déclarée : ${Number(value)} places.`,
    ),
  };
}
export function decide(state, id, { action, kind, note }) {
  const entry = entries(state).find((item) => item.id === id);
  if (!entry?.changed)
    throw new Error("Aucun changement à qualifier pour cette place.");
  if (!text(note) || !note.trim())
    throw new Error("Ajoutez un motif à votre décision.");
  if (!["apply", "keep", "remove"].includes(action))
    throw new Error("Choisissez la version à retenir.");
  if (action === "keep" && !entry.before)
    throw new Error("Cette place n’existe pas dans la version précédente.");
  if (action === "remove" && entry.after)
    throw new Error(
      "Le retrait concerne une place absente de la version reçue.",
    );
  if (action === "apply" && !entry.after)
    throw new Error("La version reçue ne contient plus cette place.");
  if (action === "apply") {
    if (!["correction", "remplacement", "ajout"].includes(kind))
      throw new Error("Qualifiez le changement avant de le confirmer.");
    if (!entry.before && kind !== "ajout")
      throw new Error("Cette place est nouvelle : choisissez Ajout.");
    if (entry.before && kind === "ajout")
      throw new Error(
        "Cette place existe déjà : choisissez Correction ou Remplacement.",
      );
    const problems = rowIssues(entry.after);
    if (problems.length) throw new Error(problems.join(". "));
  }
  const review = {
    place: id,
    action,
    kind:
      action === "keep"
        ? "version précédente"
        : action === "remove"
          ? "retrait"
          : kind,
    note: note.trim(),
    signature: signature(entry.before, entry.after),
  };
  return {
    ...state,
    reviews: [...state.reviews.filter((item) => item.place !== id), review],
    journal: append(state, id, `${review.kind} confirmé : ${review.note}`),
  };
}
export function parseList(raw) {
  const { rows } = parseCsv(raw, { requiredHeaders: HEADERS, maxRows: 500 });
  if (!rows.length) throw new Error("Le fichier ne contient aucune personne.");
  const seen = new Set();
  return rows.map((row, index) => {
    const result = Object.fromEntries(
      HEADERS.map((key) => [key, String(row[key]).trim()]),
    );
    if (!validId(result.place) || seen.has(result.place))
      throw new Error(`Ligne ${index + 2} : clé de place invalide ou répétée.`);
    if (!HEADERS.every((key) => text(result[key])))
      throw new Error(
        `Ligne ${index + 2} : champ trop long ou caractère de contrôle.`,
      );
    seen.add(result.place);
    return result;
  });
}
export function importVersion(state, side, raw, filename) {
  if (!["previous", "incoming"].includes(side))
    throw new Error("Version inconnue.");
  const rows = parseList(raw);
  return {
    ...state,
    [side]: rows,
    reviews: [],
    files: { ...state.files, [side]: String(filename).slice(0, 200) },
    journal: append(
      state,
      "Lot",
      `${side === "previous" ? "Version précédente" : "Version reçue"} importée : ${rows.length} lignes. Décisions remises à examiner.`,
    ),
  };
}
export function finalExport(state) {
  const report = controls(state);
  if (report.problems.length)
    throw new Error(
      `${report.problems.length} contrôle(s) restent à traiter avant l’export.`,
    );
  return report.rows.map((row) => ({ ...row }));
}
export function changeLog(state) {
  finalExport(state);
  return entries(state)
    .filter((entry) => entry.changed)
    .map((entry) => ({
      place: entry.id,
      action: entry.review.kind,
      ancien_nom: entry.before?.nom || "",
      nouveau_nom: entry.row?.nom || "",
      ancien_email: entry.before?.email || "",
      nouvel_email: entry.row?.email || "",
      ancienne_categorie: entry.before?.categorie || "",
      nouvelle_categorie: entry.row?.categorie || "",
      motif: entry.review.note,
    }));
}
export function restore(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Le dossier JSON est illisible.");
  }
  if (
    data?.schema !== "colloquium-listes-v1" ||
    !Array.isArray(data.previous) ||
    !Array.isArray(data.incoming) ||
    !Array.isArray(data.reviews) ||
    !Array.isArray(data.journal) ||
    data.journal.length > 150 ||
    data.reviews.length > 1000 ||
    !data.files ||
    !text(data.files.previous) ||
    !text(data.files.incoming)
  )
    throw new Error(
      "Ce fichier n’est pas un dossier de comparaison compatible.",
    );
  for (const list of [data.previous, data.incoming]) {
    if (!list.length || list.length > 500)
      throw new Error("Liste vide ou trop volumineuse.");
    const seen = new Set();
    for (const row of list) {
      if (
        !row ||
        !validId(row.place) ||
        seen.has(row.place) ||
        !HEADERS.every((key) => text(row[key]))
      )
        throw new Error("Donnée participant ou clé invalide.");
      seen.add(row.place);
    }
  }
  setCapacity(data, data.capacity);
  for (const review of data.reviews)
    if (
      !review ||
      !validId(review.place) ||
      !["apply", "keep", "remove"].includes(review.action) ||
      !text(review.note) ||
      !text(review.kind) ||
      typeof review.signature !== "string" ||
      review.signature.length > 4000
    )
      throw new Error("Décision invalide dans le dossier.");
  for (const entry of data.journal)
    if (
      !entry ||
      !Number.isSafeInteger(entry.step) ||
      entry.step < 1 ||
      !text(entry.place) ||
      typeof entry.message !== "string" ||
      entry.message.length > 600
    )
      throw new Error("Journal invalide dans le dossier.");
  return {
    schema: data.schema,
    previous: data.previous.map((row) =>
      Object.fromEntries(HEADERS.map((key) => [key, row[key]])),
    ),
    incoming: data.incoming.map((row) =>
      Object.fromEntries(HEADERS.map((key) => [key, row[key]])),
    ),
    capacity: data.capacity,
    reviews: data.reviews.map((review) => ({ ...review })),
    journal: data.journal.map((entry) => ({ ...entry })),
    files: { ...data.files },
  };
}

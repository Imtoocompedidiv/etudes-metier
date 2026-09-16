export const lineHeaders = [
  "ligne",
  "dossier",
  "client",
  "article",
  "serie",
  "quantite",
  "motif",
  "autorisation",
  "autorisee",
];
export const receiptHeaders = [
  "reception",
  "colis",
  "date",
  "ligne",
  "quantite",
  "commentaire",
];
export const seed = {
  version: 1,
  lines: [
    {
      ligne: "L-101",
      dossier: "R-2609-14",
      client: "Ateliers du Rivage",
      article: "Indicateur de pesage · exemple",
      serie: "DEMO-IND-041",
      quantite: 1,
      motif: "Réparation",
      autorisation: "AUT-DEMO-114",
      autorisee: 1,
    },
    {
      ligne: "L-102",
      dossier: "R-2609-14",
      client: "Ateliers du Rivage",
      article: "Boîtier de raccordement · exemple",
      serie: "",
      quantite: 3,
      motif: "Vérification",
      autorisation: "AUT-DEMO-114",
      autorisee: 3,
    },
    {
      ligne: "L-103",
      dossier: "R-2609-14",
      client: "Ateliers du Rivage",
      article: "Afficheur déporté · exemple",
      serie: "DEMO-AFF-008",
      quantite: 1,
      motif: "Réparation",
      autorisation: "",
      autorisee: null,
    },
    {
      ligne: "L-201",
      dossier: "R-2609-11",
      client: "Conditionnement des Aulnes",
      article: "Transmetteur de pesage · exemple",
      serie: "DEMO-TR-022",
      quantite: 1,
      motif: "Vérification",
      autorisation: "AUT-DEMO-111",
      autorisee: 1,
    },
    {
      ligne: "L-301",
      dossier: "R-2609-16",
      client: "Matériaux du Vallon",
      article: "Afficheur déporté · exemple",
      serie: "DEMO-AFF-008",
      quantite: 1,
      motif: "Diagnostic",
      autorisation: "AUT-DEMO-116",
      autorisee: 1,
    },
    {
      ligne: "L-401",
      dossier: "R-2609-17",
      client: "Fabrication de la Rive",
      article: "Module de liaison · exemple",
      serie: "",
      quantite: 2,
      motif: "Vérification",
      autorisation: "AUT-DEMO-117",
      autorisee: 2,
    },
  ],
  receipts: [
    {
      reception: "REC-DEMO-1",
      colis: "COL-DEMO-41",
      date: "2026-09-16",
      ligne: "L-101",
      quantite: 1,
      commentaire: "Exemple de réception complète.",
    },
    {
      reception: "REC-DEMO-2",
      colis: "COL-DEMO-41",
      date: "2026-09-16",
      ligne: "L-102",
      quantite: 1,
      commentaire: "Deux boîtiers restent attendus.",
    },
    {
      reception: "REC-DEMO-3",
      colis: "COL-DEMO-36",
      date: "2026-09-15",
      ligne: "L-201",
      quantite: 1,
      commentaire: "",
    },
  ],
  journal: [],
};
const text = (v, name, optional = false) => {
  if (v !== undefined && v !== null && !["string", "number"].includes(typeof v))
    throw Error(`${name} : texte attendu.`);
  const s = String(v ?? "").trim();
  if ((!s && !optional) || s.length > 180)
    throw Error(
      `${name} : renseignez ${optional ? "au plus" : "de 1 à"} 180 caractères.`,
    );
  return s;
};
function integer(v, name, { min = 1, nullable = false } = {}) {
  if (v === null || v === undefined || String(v).trim() === "") {
    if (nullable) return null;
    throw Error(`${name} : quantité obligatoire.`);
  }
  if (
    !/^\d+$/.test(String(v).trim()) ||
    !Number.isSafeInteger(Number(v)) ||
    Number(v) < min ||
    Number(v) > 100000
  )
    throw Error(`${name} : entier de ${min} à 100000 attendu.`);
  return Number(v);
}
function rowsCheck(rows, max) {
  if (!Array.isArray(rows) || rows.length > max)
    throw Error(`Le fichier doit contenir au plus ${max} lignes.`);
}
export function validDate(v) {
  const s = text(v, "Date");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    Number(s.slice(0, 4)) < 1900 ||
    Number(s.slice(0, 4)) > 2200 ||
    new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s
  )
    throw Error("Date de réception impossible, format AAAA-MM-JJ attendu.");
  return s;
}
export function parseLines(rows) {
  rowsCheck(rows, 1000);
  if (!rows.length)
    throw Error("Le dossier doit contenir au moins une ligne de matériel.");
  const ids = new Set(),
    clients = new Map();
  return rows.map((r, i) => {
    const p = `Ligne ${i + 1}`;
    const ligne = text(r.ligne, `${p}, identifiant`);
    if (ids.has(ligne)) throw Error(`${p} : identifiant ${ligne} en double.`);
    ids.add(ligne);
    const dossier = text(r.dossier, `${p}, dossier`),
      client = text(r.client, `${p}, client`);
    if (clients.has(dossier) && clients.get(dossier) !== client)
      throw Error(
        `${p} : le dossier ${dossier} possède deux clients différents.`,
      );
    clients.set(dossier, client);
    const autorisation = text(r.autorisation, `${p}, autorisation`, true),
      autorisee = integer(r.autorisee, `${p}, quantité autorisée`, {
        min: 0,
        nullable: true,
      });
    if (
      (autorisation && autorisee === null) ||
      (!autorisation && autorisee !== null)
    )
      throw Error(
        `${p} : référence et quantité autorisées doivent être renseignées ensemble, ou toutes deux laissées vides.`,
      );
    return {
      ligne,
      dossier,
      client,
      article: text(r.article, `${p}, article`),
      serie: text(r.serie, `${p}, série`, true),
      quantite: integer(r.quantite, `${p}, quantité demandée`),
      motif: text(r.motif, `${p}, motif`),
      autorisation,
      autorisee,
    };
  });
}
export function parseReceipts(rows, lines) {
  rowsCheck(rows, 5000);
  const ids = new Set(),
    lineIds = new Set(lines.map((l) => l.ligne)),
    parcels = new Map();
  return rows.map((r, i) => {
    const p = `Réception ${i + 1}`,
      reception = text(r.reception, `${p}, identifiant`);
    if (ids.has(reception))
      throw Error(`${p} : identifiant ${reception} en double.`);
    ids.add(reception);
    const ligne = text(r.ligne, `${p}, ligne`);
    if (!lineIds.has(ligne))
      throw Error(
        `${p} : ligne ${ligne} absente du dossier. Le rapprochement est impossible.`,
      );
    const colis = text(r.colis, `${p}, colis`),
      date = validDate(r.date);
    if (parcels.has(colis) && parcels.get(colis) !== date)
      throw Error(
        `${p} : le colis ${colis} possède deux dates de réception différentes.`,
      );
    parcels.set(colis, date);
    return {
      reception,
      colis,
      date,
      ligne,
      quantite: integer(r.quantite, `${p}, quantité`),
      commentaire: text(r.commentaire, `${p}, commentaire`, true),
    };
  });
}
export function normalizeProject(value) {
  if (!value || value.version !== 1)
    throw Error(
      "Ce JSON ne correspond pas à un dossier de réception, version 1.",
    );
  const lines = parseLines(value.lines),
    receipts = parseReceipts(value.receipts, lines);
  const journal = Array.isArray(value.journal)
    ? value.journal
        .slice(-40)
        .map((j) => ({
          at: text(j.at, "Date du journal"),
          text: text(j.text, "Texte du journal"),
        }))
    : [];
  return { version: 1, lines, receipts, journal };
}
export function validProject(value) {
  try {
    normalizeProject(value);
    return true;
  } catch {
    return false;
  }
}
export function reconcile(project) {
  const totals = new Map();
  for (const r of project.receipts)
    totals.set(r.ligne, (totals.get(r.ligne) || 0) + r.quantite);
  const serials = new Map();
  for (const l of project.lines) {
    if (l.serie) {
      const s = l.serie.toUpperCase();
      serials.set(s, [...(serials.get(s) || []), l]);
    }
  }
  return project.lines.map((l) => {
    const recu = totals.get(l.ligne) || 0,
      attendu = l.autorisee === null ? null : Math.max(0, l.autorisee - recu),
      excedent = l.autorisee === null ? null : Math.max(0, recu - l.autorisee);
    const issues = [];
    if (l.autorisee === null)
      issues.push(
        recu
          ? "Reçu sans autorisation enregistrée"
          : "Autorisation non renseignée",
      );
    else {
      if (l.autorisee > l.quantite)
        issues.push("Autorisé supérieur à la demande");
      if (excedent) issues.push(`${excedent} unité(s) reçue(s) en excédent`);
      if (l.autorisee < l.quantite)
        issues.push(
          `${l.quantite - l.autorisee} unité(s) demandée(s) non autorisée(s)`,
        );
    }
    if (l.serie && (serials.get(l.serie.toUpperCase()) || []).length > 1)
      issues.push(
        `Série également présente sur ${serials
          .get(l.serie.toUpperCase())
          .filter((x) => x.ligne !== l.ligne)
          .map((x) => x.ligne)
          .join(", ")}`,
      );
    if (l.serie && l.quantite > 1)
      issues.push("Une seule série indiquée pour plusieurs unités");
    const statut = issues.length
      ? "À vérifier"
      : attendu === 0
        ? "Réception complète"
        : recu
          ? "Réception partielle"
          : "En attente";
    return {
      ...l,
      recu,
      attendu,
      excedent,
      statut,
      points_a_verifier: issues.join(" ; "),
      issues,
    };
  });
}
export const reconciliationHeaders = [
  ...lineHeaders,
  "recu",
  "attendu",
  "excedent",
  "statut",
  "points_a_verifier",
];
export function caseSummaries(project) {
  const rows = reconcile(project),
    cases = new Map();
  for (const r of rows) {
    if (!cases.has(r.dossier))
      cases.set(r.dossier, { dossier: r.dossier, client: r.client, rows: [] });
    cases.get(r.dossier).rows.push(r);
  }
  return [...cases.values()].map((c) => ({
    ...c,
    received: c.rows.reduce((s, r) => s + r.recu, 0),
    pending: c.rows.reduce((s, r) => s + (r.attendu || 0), 0),
    issues: c.rows.filter((r) => r.issues.length).length,
    complete: c.rows.every((r) => r.statut === "Réception complète"),
  }));
}
export function upsertReceipt(project, raw, { acknowledge = false } = {}) {
  const previous = project.receipts.filter(
      (r) => r.reception !== raw.reception,
    ),
    receipts = parseReceipts([...previous, raw], project.lines),
    next = { ...project, receipts };
  const changed = reconcile(next).find((l) => l.ligne === raw.ligne);
  if ((changed.autorisee === null || changed.excedent > 0) && !acknowledge)
    throw Error(
      "Confirmez que vous relevez une réception physique avec écart d’autorisation. Aucun accord de retour ne sera créé.",
    );
  return normalizeProject(next);
}
export function updateLine(project, raw) {
  if (!project.lines.some((l) => l.ligne === raw.ligne))
    throw Error("Ligne absente du dossier.");
  return normalizeProject({
    ...project,
    lines: project.lines.map((l) => (l.ligne === raw.ligne ? raw : l)),
  });
}
export function removeReceipt(project, id) {
  if (!project.receipts.some((r) => r.reception === id))
    throw Error("Réception absente du dossier.");
  return normalizeProject({
    ...project,
    receipts: project.receipts.filter((r) => r.reception !== id),
  });
}
export function nextReceiptId(project) {
  let n = 1;
  while (project.receipts.some((r) => r.reception === `REC-DEMO-${n}`)) n++;
  return `REC-DEMO-${n}`;
}

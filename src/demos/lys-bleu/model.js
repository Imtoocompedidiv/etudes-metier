import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { parseCsv } from "../../shared/files.js";

export const MAX_BYTES = 5 * 1024 * 1024;
export const SCOPES = {
  title: "Par titre",
  invoice: "Commande hors exceptions",
};
export const ROUNDS = { floor: "Inférieur", ceil: "Supérieur" };
export const BASES = {
  request: "Date de demande",
  receipt: "Date de réception",
};
export const BOUNDS = {
  inclusive: "Jour limite inclus",
  exclusive: "Avant le jour limite",
};
export const INVOICE_HEADERS = [
  "facture",
  "librairie",
  "date_facture",
  "ligne",
  "titre",
  "commandes",
];
export const HISTORY_HEADERS = [
  "facture",
  "reprise",
  "ligne",
  "date_reprise",
  "quantite",
];
export const OUTPUT_HEADERS = [
  "facture",
  "ligne",
  "titre",
  "commandes",
  "deja_repris",
  "demandes",
  "neufs",
  "etiquetes",
  "abimes",
  "non_controles",
  "proposes",
  "regle_plafond",
  "plafond_restant",
  "exception_source",
  "date_retenue",
  "limite_calendaire",
  "relecteur",
  "note",
  "statut",
];
const copy = (x) => structuredClone(x);
const hash = (x) => bytesToHex(sha256(utf8ToBytes(JSON.stringify(x))));
function fail(msg) {
  throw Error(msg);
}
function shape(v, keys, label) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    fail(`${label} : structure inconnue.`);
}
function text(v, label, max = 180, min = 1) {
  if (
    typeof v !== "string" ||
    v.length > max ||
    v.trim().length < min ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
  )
    fail(`${label} : texte de ${min} à ${max} caractères attendu.`);
  return v.replace(/\r\n?/g, "\n");
}
function id(v) {
  if (
    typeof v !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(v) ||
    ["constructor", "prototype", "__proto__"].includes(v)
  )
    fail("Identifiant invalide.");
  return v;
}
function opt(v, values, label) {
  if (typeof v !== "string" || !Object.hasOwn(values, v))
    fail(`${label} inconnu.`);
  return v;
}
function qty(v, label, min = 0) {
  if (!Number.isSafeInteger(v) || v < min || v > 100000)
    fail(`${label} : entier de ${min} à 100 000 attendu.`);
  return v;
}
function number(v, label, min = 0) {
  if (typeof v !== "string" || !/^\d{1,6}$/.test(v))
    fail(`${label} : entier obligatoire.`);
  return qty(Number(v), label, min);
}
export function calendarDate(v) {
  if (typeof v !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(v))
    fail("Date au format AAAA-MM-JJ attendue, de 2000 à 2099.");
  const d = new Date(v + "T12:00:00Z");
  if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== v)
    fail("Date impossible.");
  return v;
}
export function sixMonths(v) {
  calendarDate(v);
  const [y, m, d] = v.split("-").map(Number),
    target = new Date(Date.UTC(y, m - 1 + 6, 1, 12));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
function list(v, max, label) {
  if (!Array.isArray(v) || v.length > max)
    fail(`${label} : ${max} éléments maximum.`);
  return v;
}
function unique(items, key, label) {
  if (new Set(items.map((x) => x[key])).size !== items.length)
    fail(`${label} : identifiant répété.`);
}
const blankLine = (lineId) => ({
  lineId,
  requested: 0,
  newCount: 0,
  tagged: 0,
  damaged: 0,
  proposed: 0,
  exception: null,
});
const basis = (invoice) => hash({ ...invoice, review: null });

function normalizeInvoice(v) {
  shape(
    v,
    [
      "id",
      "bookstore",
      "date",
      "lines",
      "history",
      "request",
      "policy",
      "review",
    ],
    "Facture",
  );
  const inv = {
    id: id(v.id),
    bookstore: text(v.bookstore, "Librairie"),
    date: calendarDate(v.date),
    lines: [],
    history: [],
    request: null,
    policy: null,
    review: null,
  };
  inv.lines = list(v.lines, 30, "Titres").map((l) => {
    shape(l, ["id", "title", "ordered"], "Titre");
    return {
      id: id(l.id),
      title: text(l.title, "Titre"),
      ordered: qty(l.ordered, "Commandés", 1),
    };
  });
  if (!inv.lines.length) fail("La facture doit contenir un titre.");
  unique(inv.lines, "id", "Titres");
  inv.history = list(v.history, 200, "Reprises").map((h) => {
    shape(h, ["id", "lineId", "date", "quantity"], "Reprise");
    const row = {
      id: id(h.id),
      lineId: id(h.lineId),
      date: calendarDate(h.date),
      quantity: qty(h.quantity, "Reprise", 1),
    };
    if (!inv.lines.some((l) => l.id === row.lineId))
      fail("Reprise sans ligne de facture.");
    if (row.date < inv.date) fail("Une reprise précède la facture.");
    return row;
  });
  unique(inv.history, "id", "Reprises");
  for (const l of inv.lines)
    if (
      inv.history
        .filter((h) => h.lineId === l.id)
        .reduce((n, h) => n + h.quantity, 0) > l.ordered
    )
      fail("Les reprises cumulées dépassent la quantité commandée.");
  shape(v.request, ["date", "receivedAt", "lines"], "Demande");
  inv.request = {
    date: calendarDate(v.request.date),
    receivedAt:
      v.request.receivedAt === null ? null : calendarDate(v.request.receivedAt),
    lines: [],
  };
  if (inv.request.date < inv.date) fail("La demande précède la facture.");
  if (inv.request.receivedAt && inv.request.receivedAt < inv.request.date)
    fail("La réception précède la demande.");
  inv.request.lines = list(v.request.lines, 30, "Lignes de demande").map(
    (l) => {
      shape(
        l,
        [
          "lineId",
          "requested",
          "newCount",
          "tagged",
          "damaged",
          "proposed",
          "exception",
        ],
        "Ligne de demande",
      );
      const row = {
        lineId: id(l.lineId),
        requested: qty(l.requested, "Demandés"),
        newCount: qty(l.newCount, "Neufs"),
        tagged: qty(l.tagged, "Étiquetés"),
        damaged: qty(l.damaged, "Abîmés"),
        proposed: qty(l.proposed, "Proposés"),
        exception: null,
      };
      if (!inv.lines.some((a) => a.id === row.lineId))
        fail("Demande sans ligne de facture.");
      if (row.newCount + row.tagged + row.damaged > row.requested)
        fail("Le détail de l’état dépasse le nombre demandé.");
      if (l.exception !== null) {
        shape(l.exception, ["source", "by", "confirmed"], "Exception");
        if (l.exception.confirmed !== true)
          fail(
            "L’appartenance à la sélection doit être déclarée explicitement.",
          );
        row.exception = {
          source: text(l.exception.source, "Référence d’exception", 300, 10),
          by: text(l.exception.by, "Personne déclarant l’exception", 60, 2),
          confirmed: true,
        };
      }
      return row;
    },
  );
  unique(inv.request.lines, "lineId", "Demande");
  if (inv.request.lines.length !== inv.lines.length)
    fail("Chaque ligne de facture doit avoir sa ligne de demande.");
  shape(v.policy, ["scope", "round", "dateBasis", "boundary"], "Paramètres");
  inv.policy = {
    scope: opt(v.policy.scope, SCOPES, "Périmètre"),
    round: opt(v.policy.round, ROUNDS, "Arrondi"),
    dateBasis: opt(v.policy.dateBasis, BASES, "Date retenue"),
    boundary: opt(v.policy.boundary, BOUNDS, "Borne"),
  };
  if (v.review !== null) {
    shape(v.review, ["by", "note", "basis"], "Revue");
    inv.review = {
      by: text(v.review.by, "Relecteur", 60, 2),
      note: text(v.review.note, "Note de préparation", 500, 10),
      basis: text(v.review.basis, "Empreinte", 64, 64),
    };
    if (inv.review.basis !== basis(inv) || evaluate(inv).blockers.length)
      fail("La revue ne porte pas sur cette version du dossier.");
  }
  return inv;
}
export function normalize(v) {
  shape(v, ["format", "invoices"], "Dossier");
  if (v.format !== "lys-bleu-return-v1") fail("Format de dossier inconnu.");
  const result = {
    format: v.format,
    invoices: list(v.invoices, 30, "Factures").map(normalizeInvoice),
  };
  if (!result.invoices.length) fail("Aucune facture dans le dossier.");
  unique(result.invoices, "id", "Factures");
  if (
    new TextEncoder().encode(JSON.stringify(result, null, 2)).length > MAX_BYTES
  )
    fail("Dossier supérieur à 5 Mio, réduisez le nombre de factures.");
  return result;
}
export function restore(raw) {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > MAX_BYTES
  )
    fail("Fichier JSON supérieur à 5 Mio.");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    fail("JSON illisible.");
  }
  return normalize(value);
}
export function evaluate(inv) {
  const selectedDate =
    inv.policy.dateBasis === "request"
      ? inv.request.date
      : inv.request.receivedAt;
  const deadline = sixMonths(inv.date),
    blockers = [],
    warnings = [];
  if (!selectedDate)
    blockers.push("Date de réception à renseigner pour cette convention.");
  else if (
    inv.policy.boundary === "inclusive"
      ? selectedDate > deadline
      : selectedDate >= deadline
  )
    blockers.push(
      "La date retenue est hors de la fenêtre illustrative de six mois.",
    );
  if (inv.history.some((h) => !selectedDate || h.date > selectedDate))
    blockers.push("Une reprise enregistrée est postérieure à la date retenue.");
  const round = Math[inv.policy.round];
  const rows = inv.lines.map((l) => {
    const req = inv.request.lines.find((r) => r.lineId === l.id),
      previous = inv.history
        .filter((h) => h.lineId === l.id)
        .reduce((n, h) => n + h.quantity, 0);
    const remaining = l.ordered - previous,
      cap = req.exception
        ? remaining
        : Math.max(0, round(l.ordered / 2) - previous);
    return {
      ...l,
      ...req,
      previous,
      remaining,
      cap,
      unknown: req.requested - req.newCount - req.tagged - req.damaged,
      issues: [],
    };
  });
  const standard = rows.filter((r) => !r.exception),
    shared = {
      ordered: standard.reduce((n, r) => n + r.ordered, 0),
      previous: standard.reduce((n, r) => n + r.previous, 0),
      proposed: standard.reduce((n, r) => n + r.proposed, 0),
    };
  shared.ceiling = round(shared.ordered / 2);
  shared.remaining = Math.max(0, shared.ceiling - shared.previous);
  if (!rows.some((r) => r.requested > 0))
    blockers.push("Aucun exemplaire demandé dans cette facture.");
  for (const r of rows) {
    if (r.requested > r.remaining)
      r.issues.push(
        `La demande dépasse de ${r.requested - r.remaining} les exemplaires non repris.`,
      );
    if (r.proposed > r.requested)
      r.issues.push("La proposition dépasse la demande.");
    if (r.proposed > r.newCount)
      r.issues.push("La proposition dépasse les exemplaires déclarés neufs.");
    if (r.proposed > r.remaining)
      r.issues.push("La proposition dépasse les exemplaires non repris.");
    if ((inv.policy.scope === "title" || r.exception) && r.proposed > r.cap)
      r.issues.push(
        `Dépasse le ${r.exception ? "reliquat physique" : "plafond illustratif"} de ${r.proposed - r.cap}.`,
      );
    if (r.unknown)
      warnings.push(
        `${r.title} : ${r.unknown} exemplaire${r.unknown > 1 ? "s" : ""} non contrôlé${r.unknown > 1 ? "s" : ""}.`,
      );
    if (r.tagged || r.damaged)
      warnings.push(
        `${r.title} : ${[r.tagged ? `${r.tagged} livre${r.tagged > 1 ? "s" : ""} étiqueté${r.tagged > 1 ? "s" : ""}` : "", r.damaged ? `${r.damaged} livre${r.damaged > 1 ? "s" : ""} abîmé${r.damaged > 1 ? "s" : ""}` : ""].filter(Boolean).join(" et ")} hors des exemplaires neufs.`,
      );
    if (r.proposed < r.requested)
      warnings.push(
        `${r.title} : ${r.requested - r.proposed} exemplaire${r.requested - r.proposed > 1 ? "s" : ""} de la demande non proposé${r.requested - r.proposed > 1 ? "s" : ""}.`,
      );
    blockers.push(...r.issues.map((s) => `${r.title} : ${s}`));
  }
  if (inv.policy.scope === "invoice" && shared.proposed > shared.remaining)
    blockers.push(
      `Plafond commun dépassé de ${shared.proposed - shared.remaining} exemplaire${shared.proposed - shared.remaining > 1 ? "s" : ""}. Répartissez les propositions entre les titres sans exception.`,
    );
  return {
    rows,
    shared,
    deadline,
    selectedDate,
    blockers,
    warnings,
    total: rows.reduce((n, r) => n + r.proposed, 0),
    requested: rows.reduce((n, r) => n + r.requested, 0),
    previous: rows.reduce((n, r) => n + r.previous, 0),
  };
}
function mutate(state, invoiceId, fn) {
  const next = copy(state),
    inv = next.invoices.find((i) => i.id === invoiceId);
  if (!inv) fail("Facture introuvable.");
  const before = basis(inv);
  fn(inv);
  if (basis(inv) !== before) inv.review = null;
  return normalize(next);
}
export const setProposal = (s, i, l, n) =>
  mutate(s, i, (inv) => {
    const r = inv.request.lines.find((x) => x.lineId === l);
    if (!r) fail("Titre introuvable.");
    r.proposed = qty(n, "Proposition");
  });
export const setPolicy = (s, i, p) =>
  mutate(s, i, (inv) => {
    inv.policy = copy(p);
  });
export const setDates = (s, i, p) =>
  mutate(s, i, (inv) => {
    inv.request.date = p.date;
    inv.request.receivedAt = p.receivedAt;
  });
export const editRequest = (s, i, l, changes) =>
  mutate(s, i, (inv) => {
    const n = inv.request.lines.findIndex((x) => x.lineId === l);
    if (n < 0) fail("Titre introuvable.");
    inv.request.lines[n] = { ...copy(changes), lineId: l };
  });
export function review(s, i, { by, note }) {
  const next = copy(s),
    inv = next.invoices.find((x) => x.id === i);
  if (!inv) fail("Facture introuvable.");
  const check = evaluate(inv);
  if (check.blockers.length)
    fail("Des points empêchent encore la relecture de cette préparation.");
  inv.review = {
    by: text(by, "Relecteur", 60, 2),
    note: text(note, "Note de préparation", 500, 10),
    basis: basis(inv),
  };
  return normalize(next);
}
export function importCsv(s, kind, raw) {
  if (!["invoices", "history"].includes(kind)) fail("Import inconnu.");
  if (new TextEncoder().encode(raw).length > MAX_BYTES)
    fail("CSV supérieur à 5 Mio.");
  const headers = kind === "invoices" ? INVOICE_HEADERS : HISTORY_HEADERS;
  const parsed = parseCsv(raw, { requiredHeaders: headers, maxRows: 2000 });
  if (
    parsed.headers.length !== headers.length ||
    parsed.headers.some((h) => !headers.includes(h))
  )
    fail("Colonnes CSV inattendues.");
  if (!parsed.rows.length) fail("CSV vide.");
  const next = copy(s),
    seen = new Set(),
    meta = new Map(),
    before = new Map(next.invoices.map((i) => [i.id, basis(i)]));
  for (const row of parsed.rows) {
    const invoiceId = id(row.facture),
      lineId = id(row.ligne),
      recordId = kind === "invoices" ? lineId : id(row.reprise),
      key = invoiceId + "|" + recordId;
    if (seen.has(key)) fail("Identifiant répété dans le CSV.");
    seen.add(key);
    let inv = next.invoices.find((i) => i.id === invoiceId);
    if (kind === "invoices") {
      const details = {
        bookstore: text(row.librairie, "Librairie"),
        date: calendarDate(row.date_facture),
      };
      if (
        meta.has(invoiceId) &&
        JSON.stringify(meta.get(invoiceId)) !== JSON.stringify(details)
      )
        fail("La même facture possède des en-têtes contradictoires.");
      meta.set(invoiceId, details);
      if (!inv) {
        inv = {
          id: invoiceId,
          ...details,
          lines: [],
          history: [],
          request: { date: details.date, receivedAt: null, lines: [] },
          policy: {
            scope: "title",
            round: "floor",
            dateBasis: "request",
            boundary: "inclusive",
          },
          review: null,
        };
        next.invoices.push(inv);
      }
      Object.assign(inv, details);
      const line = {
          id: lineId,
          title: text(row.titre, "Titre"),
          ordered: number(row.commandes, "Commandés", 1),
        },
        old = inv.lines.find((l) => l.id === lineId);
      if (old) {
        if (JSON.stringify(old) !== JSON.stringify(line))
          inv.request.lines.find((r) => r.lineId === lineId).exception = null;
        Object.assign(old, line);
      } else {
        inv.lines.push(line);
        inv.request.lines.push(blankLine(lineId));
      }
    } else {
      if (!inv)
        fail(
          "Reprise sans facture connue. Importez la facture avant son historique.",
        );
      const h = {
          id: recordId,
          lineId,
          date: calendarDate(row.date_reprise),
          quantity: number(row.quantite, "Quantité reprise", 1),
        },
        old = inv.history.find((x) => x.id === recordId);
      if (old && old.lineId !== lineId)
        fail("Une référence de reprise ne peut pas changer de titre.");
      if (old) Object.assign(old, h);
      else inv.history.push(h);
    }
  }
  for (const inv of next.invoices)
    if (before.get(inv.id) !== basis(inv)) inv.review = null;
  return normalize(next);
}
export const invoiceRows = (s) =>
  s.invoices.flatMap((i) =>
    i.lines.map((l) => [i.id, i.bookstore, i.date, l.id, l.title, l.ordered]),
  );
export const historyRows = (s) =>
  s.invoices.flatMap((i) =>
    i.history.map((h) => [i.id, h.id, h.lineId, h.date, h.quantity]),
  );
export function outputRows(inv) {
  if (
    !inv.review ||
    inv.review.basis !== basis(inv) ||
    evaluate(inv).blockers.length
  )
    fail("Relisez la version actuelle avant d’exporter les propositions.");
  const e = evaluate(inv);
  return e.rows
    .filter((r) => r.requested > 0)
    .map((r) => [
      inv.id,
      r.id,
      r.title,
      r.ordered,
      r.previous,
      r.requested,
      r.newCount,
      r.tagged,
      r.damaged,
      r.unknown,
      r.proposed,
      `${SCOPES[inv.policy.scope]}, arrondi ${ROUNDS[inv.policy.round].toLowerCase()}${r.exception ? ", titre d’exception déclaré" : ""}`,
      inv.policy.scope === "invoice" && !r.exception
        ? e.shared.remaining
        : r.cap,
      r.exception?.source || "",
      e.selectedDate,
      e.deadline,
      inv.review.by,
      inv.review.note,
      "Proposition préparatoire, aucun accord",
    ]);
}
export function report(inv) {
  const e = evaluate(inv);
  return {
    title: `Dossier préparatoire ${inv.id}`,
    subtitle: `${inv.bookstore} · Données de démonstration · Aucun accord de retour ni avoir.`,
    sections: [
      {
        title: "Paramètres illustratifs",
        paragraphs: [
          `Facture du ${inv.date}. Demande du ${inv.request.date}. Réception ${inv.request.receivedAt || "non renseignée"}.`,
          `Plafond 50 %. ${SCOPES[inv.policy.scope]}. Arrondi ${ROUNDS[inv.policy.round].toLowerCase()}. Date retenue : ${BASES[inv.policy.dateBasis]}. Limite calendaire ${e.deadline}, ${BOUNDS[inv.policy.boundary].toLowerCase()}. Paramètres à confirmer avec le service commandes.`,
          ...(inv.policy.scope === "invoice"
            ? [
                `Plafond commun hors exceptions : ${e.shared.ordered} commandés × 50 %, arrondi = ${e.shared.ceiling}. ${e.shared.previous} déjà repris ; ${e.shared.remaining} restants pour l’ensemble des lignes sans exception.`,
              ]
            : []),
        ],
      },
      {
        title: "Quantités",
        headers: [
          "Titre",
          "Commandés",
          "Repris",
          "Demandés",
          "Neufs",
          "Étiquetés",
          "Abîmés",
          "Non contrôlés",
          "Proposés",
        ],
        rows: e.rows.map((r) => [
          r.title,
          r.ordered,
          r.previous,
          r.requested,
          r.newCount,
          r.tagged,
          r.damaged,
          r.unknown,
          r.proposed,
        ]),
      },
      {
        title: "Exceptions déclarées",
        paragraphs: e.rows
          .filter((r) => r.exception)
          .map(
            (r) =>
              `${r.title} : ${r.exception.source}. Déclaré par ${r.exception.by}. L’exception ne neutralise ni délai ni état physique.`,
          ),
      },
      {
        title: "Historique",
        headers: ["Reprise", "Ligne", "Date", "Quantité"],
        rows: inv.history.map((h) => [h.id, h.lineId, h.date, h.quantity]),
      },
      {
        title: "Points de relecture",
        paragraphs: [
          ...e.blockers,
          ...e.warnings,
          ...(!e.blockers.length && !e.warnings.length
            ? ["Aucun point ouvert selon les paramètres illustratifs."]
            : []),
        ],
      },
      {
        title: inv.review ? "Préparation relue" : "Brouillon non relu",
        paragraphs: inv.review
          ? [`${inv.review.by} : ${inv.review.note}`]
          : ["La proposition n’a pas encore été relue pour cette version."],
      },
    ],
  };
}
export function draftText(inv) {
  outputRows(inv);
  const e = evaluate(inv);
  return `Réponse préparatoire à relire, non envoyée\n${inv.bookstore} · ${inv.id}\n\nDemande du ${inv.request.date}.\n\n${e.rows
    .filter((r) => r.requested)
    .map(
      (r) =>
        `${r.title} : proposition de ${r.proposed} sur les ${r.requested} exemplaire${r.requested > 1 ? "s" : ""} de la demande.`,
    )
    .join(
      "\n",
    )}\n\n${inv.review.note}\n\nParamètres illustratifs : 50 %, ${SCOPES[inv.policy.scope]}, arrondi ${ROUNDS[inv.policy.round].toLowerCase()}, ${BASES[inv.policy.dateBasis]}, limite ${e.deadline}, ${BOUNDS[inv.policy.boundary].toLowerCase()}.\n${e.warnings.join("\n")}\n\nPréparé par ${inv.review.by}. Aucun accord de retour ni avoir émis.\n`;
}
export function seed() {
  const first = {
    id: "LB-260331",
    bookstore: "Librairie du Passage (fictive)",
    date: "2026-03-31",
    lines: [
      { id: "LIV-01", title: "Les jours de verre", ordered: 7 },
      { id: "LIV-02", title: "La traversée des marges", ordered: 10 },
      { id: "LIV-03", title: "Atlas des voix lentes", ordered: 6 },
    ],
    history: [
      { id: "R-101", lineId: "LIV-01", date: "2026-06-20", quantity: 2 },
      { id: "R-102", lineId: "LIV-02", date: "2026-06-20", quantity: 1 },
      { id: "R-103", lineId: "LIV-02", date: "2026-08-28", quantity: 1 },
      { id: "R-104", lineId: "LIV-03", date: "2026-08-28", quantity: 1 },
    ],
    request: {
      date: "2026-09-17",
      receivedAt: null,
      lines: [
        {
          lineId: "LIV-01",
          requested: 2,
          newCount: 2,
          tagged: 0,
          damaged: 0,
          proposed: 2,
          exception: null,
        },
        {
          lineId: "LIV-02",
          requested: 4,
          newCount: 3,
          tagged: 1,
          damaged: 0,
          proposed: 3,
          exception: null,
        },
        {
          lineId: "LIV-03",
          requested: 3,
          newCount: 3,
          tagged: 0,
          damaged: 0,
          proposed: 3,
          exception: null,
        },
      ],
    },
    policy: {
      scope: "title",
      round: "floor",
      dateBasis: "request",
      boundary: "inclusive",
    },
    review: null,
  };
  const second = {
    id: "LB-260831",
    bookstore: "Librairie des Amandiers (fictive)",
    date: "2026-08-31",
    lines: [{ id: "LIV-04", title: "La maison du dernier tram", ordered: 5 }],
    history: [],
    request: {
      date: "2027-02-28",
      receivedAt: "2027-03-01",
      lines: [
        {
          lineId: "LIV-04",
          requested: 2,
          newCount: 1,
          tagged: 0,
          damaged: 0,
          proposed: 1,
          exception: null,
        },
      ],
    },
    policy: {
      scope: "title",
      round: "floor",
      dateBasis: "request",
      boundary: "inclusive",
    },
    review: null,
  };
  return normalize({ format: "lys-bleu-return-v1", invoices: [first, second] });
}

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { parseCsv } from "../../shared/files.js";

export const MAX_BYTES = 5 * 1024 * 1024;
export const CHANNELS = {
  direct: "Vente directe",
  reseau_a: "Réseau A",
  reseau_b: "Réseau B",
};
export const SCOPES = {
  show: "Hors entracte",
  total: "Entracte inclus",
  unknown: "Périmètre inconnu",
};
export const FIELDS = {
  date: "Date",
  time: "Heure locale",
  venue: "Salle",
  duration: "Durée de spectacle",
};
export const SESSION_HEADERS = [
  "id",
  "titre",
  "ville",
  "date",
  "heure",
  "salle",
  "duree",
  "perimetre",
  "entracte",
  "modification",
];
export const SNAPSHOT_HEADERS = [
  "id",
  "canal",
  "reference_partenaire",
  "seance",
  "source",
  "collecte",
  "date",
  "heure",
  "salle",
  "duree",
  "perimetre",
  "entracte",
];
export const CORRECTION_HEADERS = [
  "releve",
  "canal",
  "reference_partenaire",
  "seance",
  "champ",
  "valeur_relevee",
  "valeur_programme",
  "collecte",
  "modification_programme",
  "relecteur",
  "motif",
  "statut",
];
const hash = (x) => bytesToHex(sha256(utf8ToBytes(JSON.stringify(x))));
const clone = (x) => structuredClone(x);
const fail = (message) => {
  throw Error(message);
};
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
function text(v, label, max, min = 1) {
  if (
    typeof v !== "string" ||
    v.length > max ||
    v.trim().length < min ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
  )
    fail(`${label} : texte de ${min} à ${max} caractères attendu.`);
  return v.replace(/\r\n?/g, "\n");
}
function ident(v) {
  if (
    typeof v !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(v) ||
    ["constructor", "prototype", "__proto__"].includes(v)
  )
    fail("Identifiant invalide (40 caractères maximum).");
  return v;
}
function option(v, choices, label) {
  if (typeof v !== "string" || !Object.hasOwn(choices, v))
    fail(`${label} inconnu.`);
  return v;
}
export function date(v) {
  if (typeof v !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(v))
    fail("Date attendue entre 2000 et 2099, au format AAAA-MM-JJ.");
  const n = Date.parse(v + "T12:00:00Z");
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== v)
    fail("Date impossible.");
  return v;
}
function time(v) {
  if (typeof v !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v))
    fail("Heure locale attendue au format HH:MM.");
  return v;
}
export function stamp(v) {
  if (
    typeof v !== "string" ||
    !/^20\d{2}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/.test(v)
  )
    fail("Horodatage UTC attendu, par exemple 2027-02-01T13:00:00Z.");
  date(v.slice(0, 10));
  return v;
}
function integer(v, max, label, allowEmpty = false) {
  if (allowEmpty && (v === null || v === "")) return null;
  if (
    (typeof v !== "number" && typeof v !== "string") ||
    !/^\d+$/.test(String(v)) ||
    !Number.isSafeInteger(Number(v)) ||
    Number(v) > max
  )
    fail(
      `${label} : entier de 0 à ${max} attendu${allowEmpty ? ", ou vide" : ""}.`,
    );
  return Number(v);
}
function values(x) {
  const duration = integer(x.duration, 1440, "Durée", true),
    scope = option(x.scope, SCOPES, "Périmètre"),
    intermission = integer(x.intermission, 300, "Entracte", true);
  if (duration !== null && duration === 0)
    fail("Une durée renseignée doit être supérieure à zéro.");
  if (
    scope === "total" &&
    duration !== null &&
    intermission !== null &&
    intermission >= duration
  )
    fail("L’entracte doit être plus court que la durée totale.");
  return {
    date: date(x.date),
    time: time(x.time),
    venue: text(x.venue, "Salle", 160),
    duration,
    scope,
    intermission,
  };
}
export function session(x) {
  shape(
    x,
    [
      "id",
      "title",
      "city",
      "date",
      "time",
      "venue",
      "duration",
      "scope",
      "intermission",
      "updatedAt",
    ],
    "Séance",
  );
  return {
    id: ident(x.id),
    title: text(x.title, "Titre", 160),
    city: text(x.city, "Ville", 100),
    ...values(x),
    updatedAt: stamp(x.updatedAt),
  };
}
export function snapshot(x) {
  shape(
    x,
    [
      "id",
      "channel",
      "partnerRef",
      "sessionId",
      "source",
      "collectedAt",
      "date",
      "time",
      "venue",
      "duration",
      "scope",
      "intermission",
    ],
    "Relevé",
  );
  return {
    id: ident(x.id),
    channel: option(x.channel, CHANNELS, "Canal"),
    partnerRef: text(x.partnerRef, "Référence partenaire", 100),
    sessionId: x.sessionId === null ? null : ident(x.sessionId),
    source: text(x.source, "Source déclarée", 300),
    collectedAt: stamp(x.collectedAt),
    ...values(x),
  };
}
export function showMinutes(x) {
  if (
    x.duration === null ||
    x.scope === "unknown" ||
    (x.scope === "total" && x.intermission === null)
  )
    return null;
  return x.scope === "total" ? x.duration - x.intermission : x.duration;
}
export const durationText = (x) =>
  x.duration === null
    ? "Durée inconnue"
    : `${x.duration} min · ${SCOPES[x.scope].toLowerCase()}${x.scope === "total" ? ` · entracte ${x.intermission === null ? "inconnu" : x.intermission + " min"}` : ""}`;
export function decisionBasis(s, o, field) {
  return hash([s, o, field]);
}
export function compare(state, o) {
  const s = state.sessions.find((s) => s.id === o.sessionId);
  if (!s)
    return {
      session: null,
      stale: false,
      rows: [],
      status: "unmapped",
      label: "À rapprocher",
    };
  const stale = o.collectedAt < s.updatedAt;
  const rows = Object.entries(FIELDS).map(([field, name]) => {
    const from = field === "duration" ? showMinutes(o) : o[field],
      to = field === "duration" ? showMinutes(s) : s[field];
    const comparable = from !== null && to !== null,
      different = comparable && from !== to;
    const decision = state.decisions.find(
      (d) =>
        d.snapshotId === o.id &&
        d.field === field &&
        d.basis === decisionBasis(s, o, field),
    );
    return {
      field,
      name,
      from,
      to,
      comparable,
      different,
      decision,
      actionable: comparable && different && !stale,
    };
  });
  const pending = rows.filter((r) => r.different && !r.decision),
    unknown = rows.filter((r) => !r.comparable);
  const status = stale
    ? "stale"
    : unknown.length
      ? "scope"
      : pending.length
        ? "difference"
        : rows.some((r) => r.decision?.action === "correction")
          ? "prepared"
          : rows.some((r) => r.decision)
            ? "exception"
            : "same";
  const labels = {
    stale: "Relevé ancien",
    scope: "Durée à préciser",
    difference: "Écart à relire",
    prepared: "Correction préparée",
    exception: "Exception documentée",
    same: "Concordant",
  };
  return { session: s, stale, rows, status, label: labels[status] };
}
function unique(items, key, label) {
  const seen = new Set();
  for (const x of items) {
    const k = key(x);
    if (seen.has(k)) fail(`${label} en double.`);
    seen.add(k);
  }
}
export function normalize(x) {
  shape(x, ["format", "sessions", "snapshots", "decisions"], "Dossier");
  if (x.format !== "franceconcert-review-v1")
    fail("Format franceconcert-review-v1 attendu.");
  if (
    !Array.isArray(x.sessions) ||
    x.sessions.length < 1 ||
    x.sessions.length > 100 ||
    !Array.isArray(x.snapshots) ||
    x.snapshots.length > 400 ||
    !Array.isArray(x.decisions) ||
    x.decisions.length > 1600
  )
    fail("Limite : 1 à 100 séances, 400 relevés et 1 600 décisions.");
  const state = {
    format: x.format,
    sessions: x.sessions.map(session),
    snapshots: x.snapshots.map(snapshot),
    decisions: [],
  };
  unique(state.sessions, (s) => s.id, "Identifiant de séance");
  unique(state.snapshots, (o) => o.id, "Identifiant de relevé");
  unique(
    state.snapshots,
    (o) => [o.channel, o.partnerRef].join("\u0000"),
    "Référence partenaire sur ce canal",
  );
  for (const o of state.snapshots)
    if (
      o.sessionId !== null &&
      !state.sessions.some((s) => s.id === o.sessionId)
    )
      fail(
        `Séance ${o.sessionId} absente. Laissez seance vide pour rapprocher ultérieurement.`,
      );
  for (const raw of x.decisions) {
    shape(
      raw,
      ["snapshotId", "field", "action", "note", "by", "basis"],
      "Décision",
    );
    const snapshotId = ident(raw.snapshotId),
      field = option(raw.field, FIELDS, "Champ"),
      action = option(
        raw.action,
        { correction: true, exception: true },
        "Décision",
      );
    const o = state.snapshots.find((o) => o.id === snapshotId),
      c = o && compare(state, o),
      r = c?.rows.find((r) => r.field === field);
    if (!r?.actionable || raw.basis !== decisionBasis(c.session, o, field))
      fail("Décision périmée ou sans écart récent comparable.");
    state.decisions.push({
      snapshotId,
      field,
      action,
      note: text(raw.note, "Motif", 500, 10),
      by: text(raw.by, "Relecteur", 60, 2),
      basis: raw.basis,
    });
  }
  unique(
    state.decisions,
    (d) => [d.snapshotId, d.field].join("/"),
    "Décision de champ",
  );
  if (
    new TextEncoder().encode(JSON.stringify(state, null, 2)).length > MAX_BYTES
  )
    fail("Le dossier complet dépasse 5 Mio après sérialisation.");
  return state;
}
export function restore(raw) {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > MAX_BYTES
  )
    fail("Le fichier JSON est limité à 5 Mio.");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    fail("JSON illisible.");
  }
  return normalize(value);
}
function reconcile(state) {
  state.decisions = state.decisions.filter((d) => {
    const o = state.snapshots.find((o) => o.id === d.snapshotId),
      c = o && compare({ ...state, decisions: [] }, o),
      r = c?.rows.find((r) => r.field === d.field);
    return r?.actionable && d.basis === decisionBasis(c.session, o, d.field);
  });
  return normalize(state);
}
function sameValues(a, b, ignored) {
  const clean = (v) =>
    Object.fromEntries(Object.entries(v).filter(([k]) => !ignored.includes(k)));
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
}
function checkSessionVersion(old, next) {
  if (
    old &&
    ((!sameValues(old, next, ["updatedAt"]) &&
      next.updatedAt <= old.updatedAt) ||
      next.updatedAt < old.updatedAt)
  )
    fail("Une séance modifiée exige une date de modification plus récente.");
}
function checkSnapshotVersion(old, next) {
  if (old && next.collectedAt < old.collectedAt)
    fail("Un relevé plus ancien ne remplace pas la collecte actuelle.");
}
export function editSession(state, id, raw) {
  const next = session({ ...raw, id }),
    old = state.sessions.find((s) => s.id === id);
  if (!old) fail("Séance introuvable.");
  checkSessionVersion(old, next);
  return reconcile({
    ...clone(state),
    sessions: state.sessions.map((s) => (s.id === id ? next : s)),
  });
}
export function editSnapshot(state, id, raw) {
  const next = snapshot({ ...raw, id }),
    old = state.snapshots.find((o) => o.id === id);
  if (!old) fail("Relevé introuvable.");
  checkSnapshotVersion(old, next);
  return reconcile({
    ...clone(state),
    snapshots: state.snapshots.map((o) => (o.id === id ? next : o)),
  });
}
export function associate(state, id, sessionId) {
  if (sessionId !== null && !state.sessions.some((s) => s.id === sessionId))
    fail("Choisissez une séance existante.");
  const old = state.snapshots.find((o) => o.id === id);
  if (!old) fail("Relevé introuvable.");
  return editSnapshot(state, id, { ...old, sessionId });
}
export function decide(state, id, field, action, note, by) {
  const o = state.snapshots.find((o) => o.id === id),
    c = o && compare(state, o),
    r = c?.rows.find((r) => r.field === field);
  if (!r?.actionable)
    fail("La décision exige un relevé récent et un écart comparable.");
  return normalize({
    ...clone(state),
    decisions: [
      ...state.decisions.filter(
        (d) => !(d.snapshotId === id && d.field === field),
      ),
      {
        snapshotId: id,
        field,
        action,
        note,
        by,
        basis: decisionBasis(c.session, o, field),
      },
    ],
  });
}
export function removeDecision(state, id, field) {
  return normalize({
    ...clone(state),
    decisions: state.decisions.filter(
      (d) => !(d.snapshotId === id && d.field === field),
    ),
  });
}
export function importCsv(state, raw, kind) {
  if (!["sessions", "snapshots"].includes(kind)) fail("Type CSV inconnu.");
  const { rows } = parseCsv(raw, {
    requiredHeaders: kind === "sessions" ? SESSION_HEADERS : SNAPSHOT_HEADERS,
    maxRows: kind === "sessions" ? 100 : 400,
  });
  if (!rows.length) fail("Le CSV ne contient aucune ligne.");
  unique(rows, (r) => r.id, "Identifiant CSV");
  const mapped = rows.map((r) => {
    const shared = {
      date: r.date,
      time: r.heure,
      venue: r.salle,
      duration: r.duree,
      scope: r.perimetre,
      intermission: r.entracte,
    };
    return kind === "sessions"
      ? session({
          id: r.id,
          title: r.titre,
          city: r.ville,
          ...shared,
          updatedAt: r.modification,
        })
      : snapshot({
          id: r.id,
          channel: r.canal,
          partnerRef: r.reference_partenaire,
          sessionId: r.seance || null,
          source: r.source,
          collectedAt: r.collecte,
          ...shared,
        });
  });
  const next = clone(state);
  for (const item of mapped) {
    const at = next[kind].findIndex((v) => v.id === item.id),
      old = next[kind][at];
    if (kind === "sessions") checkSessionVersion(old, item);
    else checkSnapshotVersion(old, item);
    if (at < 0) next[kind].push(item);
    else next[kind][at] = item;
  }
  return reconcile(next);
}
export function sessionRows(state) {
  return state.sessions.map((s) => [
    s.id,
    s.title,
    s.city,
    s.date,
    s.time,
    s.venue,
    s.duration ?? "",
    s.scope,
    s.intermission ?? "",
    s.updatedAt,
  ]);
}
export function snapshotRows(state) {
  return state.snapshots.map((o) => [
    o.id,
    o.channel,
    o.partnerRef,
    o.sessionId || "",
    o.source,
    o.collectedAt,
    o.date,
    o.time,
    o.venue,
    o.duration ?? "",
    o.scope,
    o.intermission ?? "",
  ]);
}
export function correctionRows(state) {
  return state.snapshots.flatMap((o) => {
    const c = compare(state, o);
    return c.rows
      .filter((r) => r.actionable && r.decision?.action === "correction")
      .map((r) => [
        o.id,
        CHANNELS[o.channel],
        o.partnerRef,
        o.sessionId,
        r.name,
        r.from,
        r.to,
        o.collectedAt,
        c.session.updatedAt,
        r.decision.by,
        r.decision.note,
        "Correction préparée, non envoyée",
      ]);
  });
}
export function reviewReport(state) {
  return {
    title: "Relecture des supports de tournée",
    subtitle: "FranceConcert · Étude indépendante · Exemples fictifs",
    sections: [
      {
        title: "Périmètre",
        paragraphs: [
          "Dossier de relevés déclarés. Aucune consultation automatique, modification de site ou émission de billet.",
          "Dates et heures de séance locales déclarées ; horodatages de modification et collecte en UTC. Durées comparées hors entracte uniquement quand le périmètre est connu.",
        ],
      },
      {
        title: "Programme",
        headers: SESSION_HEADERS,
        rows: sessionRows(state),
      },
      {
        title: "Relevés",
        headers: [...SNAPSHOT_HEADERS, "etat"],
        rows: state.snapshots.map((o, i) => [
          ...snapshotRows(state)[i],
          compare(state, o).label,
        ]),
      },
      {
        title: "Décisions actuelles",
        headers: [
          "Relevé",
          "Champ",
          "Décision",
          "Valeur relevée",
          "Programme",
          "Motif",
          "Relecteur",
        ],
        rows: state.snapshots.flatMap((o) =>
          compare(state, o)
            .rows.filter((r) => r.decision && r.actionable)
            .map((r) => [
              o.id,
              r.name,
              r.decision.action === "correction"
                ? "Correction à préparer"
                : "Exception conservée",
              r.from,
              r.to,
              r.decision.note,
              r.decision.by,
            ]),
        ),
      },
      {
        title: "Corrections préparées",
        headers: CORRECTION_HEADERS,
        rows: correctionRows(state),
        paragraphs: [
          "Les relevés anciens ou non rapprochés et les durées non comparables ne produisent aucune correction automatique.",
        ],
      },
    ],
  };
}
export function draftText(state) {
  const rows = correctionRows(state);
  return [
    "Brouillon de demandes, non envoyé. Exemple fictif FranceConcert.",
    "",
    ...rows.map(
      (r) =>
        `${r[1]} / ${r[2]} / ${r[3]}\n${r[4]} : relevé ${r[5]}, valeur du programme ${r[6]}.\nCollecte ${r[7]}, modification ${r[8]}.\nMotif : ${r[10]}\nRelecture déclarée : ${r[9]}\n`,
    ),
    rows.length
      ? "À relire avant tout envoi aux partenaires."
      : "Aucune correction décidée et actuelle à demander.",
  ].join("\n");
}
export function seed() {
  const places = [
    ["Paris", "2027-02-16", "20:00", "Salle des Arches"],
    ["Lyon", "2027-02-18", "20:00", "Théâtre des Quais"],
    ["Lille", "2027-02-20", "20:30", "Salle du Beffroi"],
    ["Nantes", "2027-02-23", "20:00", "Théâtre du Passage"],
    ["Bordeaux", "2027-02-26", "20:00", "Salle des Vignes"],
    ["Paris", "2027-02-28", "18:00", "Salle des Arches"],
  ];
  const sessions = places.map(([city, date, time, venue], i) => ({
    id: "FC-" + (201 + i),
    title: "Tournée de démonstration",
    city,
    date,
    time,
    venue,
    duration: 130,
    scope: "show",
    intermission: 20,
    updatedAt: "2027-02-01T12:00:00Z",
  }));
  const snapshots = sessions.flatMap((s, i) =>
    Object.keys(CHANNELS)
      .filter((c) => !(i === 0 && c === "reseau_b"))
      .map((channel, j) => ({
        id: `R${i + 1}-${j + 1}`,
        channel,
        partnerRef: `${channel.toUpperCase()}-${201 + i}`,
        sessionId: s.id,
        source: `Export fictif ${CHANNELS[channel]}`,
        collectedAt:
          (i === 3 && channel === "direct") ||
          (i === 5 && channel === "reseau_b")
            ? "2027-02-01T11:00:00Z"
            : "2027-02-01T13:00:00Z",
        date: s.date,
        time:
          i === 0 && channel === "reseau_a"
            ? "19:30"
            : i === 2 && channel === "reseau_a"
              ? "20:00"
              : i === 4 && channel === "reseau_a"
                ? "20:15"
                : s.time,
        venue: s.venue,
        duration: channel === "reseau_a" ? 150 : 130,
        scope: channel === "reseau_a" ? "total" : "show",
        intermission: i === 0 && channel === "reseau_a" ? null : 20,
      })),
  );
  snapshots.push({
    id: "R-ORPHELIN",
    channel: "reseau_b",
    partnerRef: "PART-77",
    sessionId: null,
    source: "Export fictif Réseau B",
    collectedAt: "2027-02-01T13:00:00Z",
    date: "2027-02-16",
    time: "20:00",
    venue: "Salle des Arches",
    duration: 130,
    scope: "show",
    intermission: 20,
  });
  return normalize({
    format: "franceconcert-review-v1",
    sessions,
    snapshots,
    decisions: [],
  });
}

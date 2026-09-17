import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { parseCsv } from "../../shared/files.js";

export const MAX_BYTES = 5 * 1024 * 1024;
export const KINDS = {
  observed: "Observation",
  interpretation: "Interprétation",
};
export const ROLES = {
  support: "Appui",
  counterpoint: "Contrepoint",
  context: "Contexte",
};
export const IMPORT_HEADERS = [
  "observation",
  "session",
  "participant",
  "version",
  "date_seance",
  "tache",
  "nature",
  "texte",
  "source",
];
export const OUTPUT_HEADERS = [
  "recommandation",
  "titre",
  "tache",
  "version_testee",
  "version_travail",
  "statut",
  "proposition",
  "observation",
  "role",
  "nature",
  "session",
  "participant",
  "date_seance",
  "constat",
  "source",
  "relecteur",
  "motif",
];
const copy = (x) => structuredClone(x),
  hash = (x) => bytesToHex(sha256(utf8ToBytes(JSON.stringify(x))));
function fail(m) {
  throw Error(m);
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
function participant(v) {
  if (typeof v !== "string" || !/^P\d{2,4}$/.test(v))
    fail("Participant : identifiant anonyme P01 à P9999 attendu.");
  return v;
}
function date(v) {
  if (typeof v !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(v))
    fail("Date au format AAAA-MM-JJ attendue.");
  const d = new Date(v + "T12:00:00Z");
  if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== v)
    fail("Date de séance impossible.");
  return v;
}
function opt(v, choices, label) {
  if (typeof v !== "string" || !Object.hasOwn(choices, v))
    fail(`${label} inconnu.`);
  return v;
}
function list(v, max, label) {
  if (!Array.isArray(v) || v.length > max)
    fail(`${label} : ${max} éléments maximum.`);
  return v;
}
function unique(rows, key, label) {
  if (new Set(rows.map((r) => r[key])).size !== rows.length)
    fail(`${label} : identifiant répété.`);
}
const lookup = (rows, key, label) =>
  rows.find((x) => x.id === key) || fail(`${label} introuvable.`);
export function evidence(s, r) {
  return r.links.map((link) => {
    const observation = s.observations.find((o) => o.id === link.observationId),
      session = s.sessions.find((x) => x.id === observation?.sessionId);
    const compatible =
      !!observation &&
      !!session &&
      observation.taskId === r.taskId &&
      session.versionId === r.versionId;
    return {
      ...link,
      observation,
      session,
      compatible,
      eligible:
        link.role === "support" &&
        compatible &&
        observation.kind === "observed",
    };
  });
}
export function assess(s, r) {
  const citations = evidence(s, r),
    supports = citations.filter((x) => x.eligible),
    issues = [];
  if (!supports.length)
    issues.push(
      "Aucune observation d’appui de cette tâche et de cette version.",
    );
  for (const c of citations.filter((x) => x.role === "support" && !x.eligible))
    issues.push(
      `${c.observationId} : ${!c.compatible ? "autre tâche ou autre version" : "interprétation, pas observation de terrain"}.`,
    );
  const toRetest = r.versionId !== s.activeVersion;
  return {
    citations,
    supports,
    issues,
    toRetest,
    observations: supports.length,
    sessions: new Set(supports.map((c) => c.session.id)).size,
    participants: new Set(supports.map((c) => c.session.participant)).size,
    status: r.review
      ? "Relecture enregistrée"
      : supports.length
        ? "À relire"
        : "Hypothèse à étayer",
  };
}
function basis(s, r) {
  return hash({
    study: s.title,
    recommendation: { ...r, review: null },
    task: s.tasks.find((t) => t.id === r.taskId) || null,
    version: s.versions.find((v) => v.id === r.versionId) || null,
    citations: r.links.map((l) => {
      const o = s.observations.find((x) => x.id === l.observationId);
      return {
        link: l,
        observation: o || null,
        session: s.sessions.find((x) => x.id === o?.sessionId) || null,
      };
    }),
  });
}
export function normalize(v) {
  shape(
    v,
    [
      "format",
      "title",
      "activeVersion",
      "versions",
      "tasks",
      "sessions",
      "observations",
      "recommendations",
    ],
    "Carnet",
  );
  if (v.format !== "nova7-notebook-v1") fail("Format de carnet inconnu.");
  const s = {
    format: v.format,
    title: text(v.title, "Étude"),
    activeVersion: id(v.activeVersion),
    versions: [],
    tasks: [],
    sessions: [],
    observations: [],
    recommendations: [],
  };
  for (const [key, max] of [
    ["versions", 10],
    ["tasks", 20],
  ]) {
    s[key] = list(v[key], max, key).map((x) => {
      shape(x, ["id", "label"], key);
      return { id: id(x.id), label: text(x.label, key) };
    });
    unique(s[key], "id", key);
    if (!s[key].length) fail(`${key} vide.`);
  }
  lookup(s.versions, s.activeVersion, "Version de travail");
  s.sessions = list(v.sessions, 200, "Séances").map((x) => {
    shape(x, ["id", "participant", "versionId", "date"], "Séance");
    const r = {
      id: id(x.id),
      participant: participant(x.participant),
      versionId: id(x.versionId),
      date: date(x.date),
    };
    lookup(s.versions, r.versionId, "Version de séance");
    return r;
  });
  unique(s.sessions, "id", "Séances");
  s.observations = list(v.observations, 500, "Observations").map((x) => {
    shape(
      x,
      ["id", "sessionId", "taskId", "kind", "text", "source"],
      "Observation",
    );
    const o = {
      id: id(x.id),
      sessionId: id(x.sessionId),
      taskId: id(x.taskId),
      kind: opt(x.kind, KINDS, "Nature"),
      text: text(x.text, "Note", 2500, 3),
      source: text(x.source, "Référence source", 500, 3),
    };
    lookup(s.sessions, o.sessionId, "Séance");
    lookup(s.tasks, o.taskId, "Tâche");
    return o;
  });
  unique(s.observations, "id", "Observations");
  s.recommendations = list(v.recommendations, 100, "Recommandations").map(
    (x) => {
      shape(
        x,
        ["id", "title", "taskId", "versionId", "text", "links", "review"],
        "Recommandation",
      );
      const r = {
        id: id(x.id),
        title: text(x.title, "Titre"),
        taskId: id(x.taskId),
        versionId: id(x.versionId),
        text: text(x.text, "Proposition", 1500, 3),
        links: [],
        review: null,
      };
      lookup(s.tasks, r.taskId, "Tâche");
      lookup(s.versions, r.versionId, "Version");
      r.links = list(x.links, 50, "Citations").map((l) => {
        shape(l, ["observationId", "role"], "Citation");
        const c = {
          observationId: id(l.observationId),
          role: opt(l.role, ROLES, "Rôle"),
        };
        lookup(s.observations, c.observationId, "Observation citée");
        return c;
      });
      unique(r.links, "observationId", "Citations");
      if (x.review !== null) {
        shape(x.review, ["by", "rationale", "basis"], "Relecture");
        r.review = {
          by: text(x.review.by, "Relecteur", 60, 2),
          rationale: text(x.review.rationale, "Motif", 600, 10),
          basis: text(x.review.basis, "Empreinte", 64, 64),
        };
      }
      return r;
    },
  );
  unique(s.recommendations, "id", "Recommandations");
  for (const r of s.recommendations)
    if (
      r.review &&
      (r.review.basis !== basis(s, r) || assess(s, r).issues.length)
    )
      fail(`La relecture de ${r.id} ne porte pas sur ces sources.`);
  if (new TextEncoder().encode(JSON.stringify(s, null, 2)).length > MAX_BYTES)
    fail("Carnet supérieur à 5 Mio.");
  return s;
}
export function restore(raw) {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > MAX_BYTES
  )
    fail("JSON supérieur à 5 Mio.");
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    fail("JSON illisible.");
  }
  return normalize(s);
}
function mutate(s, fn) {
  const next = copy(s),
    before = new Map(s.recommendations.map((r) => [r.id, basis(s, r)]));
  fn(next);
  for (const r of next.recommendations)
    if (before.get(r.id) !== basis(next, r)) r.review = null;
  return normalize(next);
}
export const setActiveVersion = (s, version) =>
  mutate(s, (x) => {
    x.activeVersion = version;
  });
export const setLink = (s, recId, observationId, role) =>
  mutate(s, (x) => {
    const r = lookup(x.recommendations, recId, "Recommandation");
    lookup(x.observations, observationId, "Observation");
    if (
      (r.links.find((l) => l.observationId === observationId)?.role || "") ===
      role
    )
      return;
    r.links = r.links.filter((l) => l.observationId !== observationId);
    if (role) r.links.push({ observationId, role });
  });
export const editObservation = (s, observationId, changes) =>
  mutate(s, (x) => {
    const n = x.observations.findIndex((o) => o.id === observationId);
    if (n < 0) fail("Observation introuvable.");
    x.observations[n] = { id: observationId, ...copy(changes) };
  });
export const deleteObservation = (s, observationId) =>
  mutate(s, (x) => {
    lookup(x.observations, observationId, "Observation");
    x.observations = x.observations.filter((o) => o.id !== observationId);
    for (const r of x.recommendations)
      r.links = r.links.filter((l) => l.observationId !== observationId);
  });
function nextId(rows, prefix) {
  const used = new Set(rows.map((x) => x.id));
  let n = 1;
  while (used.has(`${prefix}-${String(n).padStart(2, "0")}`)) n++;
  return `${prefix}-${String(n).padStart(2, "0")}`;
}
export function addObservation(s, changes) {
  return mutate(s, (x) => {
    x.observations.push({ id: nextId(x.observations, "O"), ...copy(changes) });
  });
}
export function editRecommendation(s, recId, changes) {
  return mutate(s, (x) => {
    const r = lookup(x.recommendations, recId, "Recommandation");
    Object.assign(r, copy(changes));
  });
}
export function addRecommendation(s, changes) {
  return mutate(s, (x) => {
    x.recommendations.push({
      id: nextId(x.recommendations, "R"),
      ...copy(changes),
      links: [],
      review: null,
    });
  });
}
export function review(s, recId, { by, rationale }) {
  const next = copy(s),
    r = lookup(next.recommendations, recId, "Recommandation");
  if (assess(next, r).issues.length)
    fail(
      "Une observation d’appui de la même tâche et version est nécessaire ; relisez les citations signalées.",
    );
  r.review = {
    by: text(by, "Relecteur", 60, 2),
    rationale: text(rationale, "Motif", 600, 10),
    basis: basis(next, r),
  };
  return normalize(next);
}
export function importCsv(s, raw) {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > MAX_BYTES
  )
    fail("CSV supérieur à 5 Mio.");
  const parsed = parseCsv(raw, {
    requiredHeaders: IMPORT_HEADERS,
    maxRows: 500,
  });
  if (
    parsed.headers.length !== IMPORT_HEADERS.length ||
    parsed.headers.some((h) => !IMPORT_HEADERS.includes(h))
  )
    fail("Colonnes CSV inattendues.");
  if (!parsed.rows.length) fail("CSV vide.");
  const seen = new Set(),
    sessions = new Map();
  return mutate(s, (next) => {
    for (const r of parsed.rows) {
      const observationId = id(r.observation);
      if (seen.has(observationId))
        fail("Identifiant d’observation répété dans le CSV.");
      seen.add(observationId);
      const session = {
          id: id(r.session),
          participant: participant(r.participant),
          versionId: id(r.version),
          date: date(r.date_seance),
        },
        oldSession = next.sessions.find((x) => x.id === session.id);
      if (oldSession && JSON.stringify(oldSession) !== JSON.stringify(session))
        fail(
          `La séance ${session.id} ne peut pas changer de participant, version ou date. Utilisez une nouvelle référence de séance.`,
        );
      if (
        sessions.has(session.id) &&
        JSON.stringify(sessions.get(session.id)) !== JSON.stringify(session)
      )
        fail("Séance contradictoire dans le CSV.");
      sessions.set(session.id, session);
      if (!oldSession) next.sessions.push(session);
      const observation = {
          id: observationId,
          sessionId: session.id,
          taskId: id(r.tache),
          kind: r.nature,
          text: r.texte,
          source: r.source,
        },
        old = next.observations.find((x) => x.id === observationId);
      if (old) Object.assign(old, observation);
      else next.observations.push(observation);
    }
  });
}
export const observationRows = (s) =>
  s.observations.map((o) => {
    const session = lookup(s.sessions, o.sessionId, "Séance");
    return [
      o.id,
      session.id,
      session.participant,
      session.versionId,
      session.date,
      o.taskId,
      o.kind,
      o.text,
      o.source,
    ];
  });
export function outputRows(s) {
  return s.recommendations.flatMap((r) => {
    const a = assess(s, r),
      base = [
        r.id,
        r.title,
        lookup(s.tasks, r.taskId, "Tâche").label,
        r.versionId,
        s.activeVersion,
        `${a.status}${a.toRetest ? " ; à retester sur " + s.activeVersion : ""}`,
        r.text,
      ];
    return a.citations.length
      ? a.citations.map((c) => [
          ...base,
          c.observation.id,
          ROLES[c.role],
          KINDS[c.observation.kind],
          c.session.id,
          c.session.participant,
          c.session.date,
          c.observation.text,
          c.observation.source,
          r.review?.by || "",
          r.review?.rationale || "",
        ])
      : [
          [
            ...base,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            r.review?.by || "",
            r.review?.rationale || "",
          ],
        ];
  });
}
export function report(s) {
  return {
    title: `Restitution · ${s.title}`,
    subtitle: `Version de travail ${s.activeVersion}. Exemple fictif. Les interprétations et propositions sont rédigées par l’utilisateur.`,
    sections: s.recommendations.flatMap((r) => {
      const a = assess(s, r);
      return [
        {
          title: `${r.id} · ${r.title}`,
          paragraphs: [
            `${lookup(s.tasks, r.taskId, "Tâche").label} · version testée ${r.versionId}. ${a.status}.${a.toRetest ? ` À retester sur ${s.activeVersion}.` : ""}`,
            r.text,
            `${a.observations} observation${a.observations > 1 ? "s" : ""} d’appui, ${a.sessions} séance${a.sessions > 1 ? "s" : ""} et ${a.participants} participant${a.participants > 1 ? "s" : ""} unique${a.participants > 1 ? "s" : ""}. Décompte descriptif, sans portée représentative.`,
            ...(r.review
              ? [`Relecture par ${r.review.by}. ${r.review.rationale}`]
              : ["Hypothèse ou proposition non relue pour cette version."]),
            ...a.issues,
          ],
          headers: [
            "Observation",
            "Rôle",
            "Nature",
            "Séance / participant / version",
            "Texte",
            "Source",
          ],
          rows: a.citations.map((c) => [
            c.observation.id,
            ROLES[c.role],
            KINDS[c.observation.kind],
            `${c.session.id} / ${c.session.participant} / ${c.session.versionId}`,
            c.observation.text,
            c.observation.source,
          ]),
        },
      ];
    }),
  };
}
export function retestText(s) {
  const rows = s.recommendations.filter((r) => r.versionId !== s.activeVersion);
  return `Plan de retest à préparer\n${s.title}\nVersion de travail ${s.activeVersion}\n\n${rows.length ? rows.map((r) => `${r.id} · ${r.title}\nTâche : ${lookup(s.tasks, r.taskId, "Tâche").label}\nProposition : ${r.text}\nSources issues de ${r.versionId}. À tester sur ${s.activeVersion}.\nRelecture antérieure : ${r.review ? r.review.by + ", " + r.review.rationale : "aucune"}.`).join("\n\n") : "Aucune recommandation ne porte actuellement sur une autre version."}\n\nLes observations antérieures ne prouvent pas le comportement de la nouvelle version. Aucun test réalisé par cet export.\n`;
}
export function seed() {
  const s = {
    format: "nova7-notebook-v1",
    title: "Réserver une salle · service fictif",
    activeVersion: "v1",
    versions: [
      { id: "v1", label: "v1 · Premier prototype" },
      { id: "v2", label: "v2 · Capacité dans la liste" },
    ],
    tasks: [
      { id: "T-01", label: "Choisir une salle" },
      { id: "T-02", label: "Comprendre le tarif" },
      { id: "T-03", label: "Confirmer la réservation" },
    ],
    sessions: [
      { id: "S-01", participant: "P01", versionId: "v1", date: "2026-09-10" },
      { id: "S-02", participant: "P02", versionId: "v1", date: "2026-09-10" },
      { id: "S-03", participant: "P03", versionId: "v1", date: "2026-09-11" },
      { id: "S-04", participant: "P04", versionId: "v1", date: "2026-09-11" },
      { id: "S-05", participant: "P05", versionId: "v1", date: "2026-09-11" },
      { id: "S-06", participant: "P01", versionId: "v2", date: "2026-09-16" },
    ],
    observations: [
      {
        id: "O-01",
        sessionId: "S-01",
        taskId: "T-01",
        kind: "observed",
        text: "Le participant ouvre deux fiches pour trouver le nombre de places.",
        source: "Note fictive de séance S-01, passage 1.",
      },
      {
        id: "O-02",
        sessionId: "S-01",
        taskId: "T-01",
        kind: "observed",
        text: "Après retour à la liste, il rouvre une fiche pour comparer sa capacité.",
        source: "Note fictive de séance S-01, passage 2.",
      },
      {
        id: "O-03",
        sessionId: "S-02",
        taskId: "T-01",
        kind: "observed",
        text: "Le participant retrouve la capacité depuis le filtre et réserve sans ouvrir de fiche.",
        source: "Note fictive de séance S-02, passage 1.",
      },
      {
        id: "O-04",
        sessionId: "S-03",
        taskId: "T-01",
        kind: "interpretation",
        text: "La capacité pourrait être attendue dès la liste de résultats.",
        source: "Interprétation fictive de l’observateur après S-03.",
      },
      {
        id: "O-05",
        sessionId: "S-04",
        taskId: "T-02",
        kind: "observed",
        text: "Le participant demande si le montant comprend les deux heures sélectionnées.",
        source: "Note fictive de séance S-04, passage tarif.",
      },
      {
        id: "O-06",
        sessionId: "S-05",
        taskId: "T-03",
        kind: "observed",
        text: "Le participant appuie deux fois sur Confirmer après le premier clic sans retour visible.",
        source: "Note fictive de séance S-05, confirmation.",
      },
      {
        id: "O-07",
        sessionId: "S-06",
        taskId: "T-01",
        kind: "observed",
        text: "Le participant compare deux capacités directement dans la liste, puis ouvre une seule fiche.",
        source: "Note fictive de séance S-06 sur v2.",
      },
    ],
    recommendations: [
      {
        id: "R-01",
        title: "Rendre la capacité visible",
        taskId: "T-01",
        versionId: "v1",
        text: "Afficher le nombre de places sur chaque résultat pour comparer les salles.",
        links: [],
        review: null,
      },
      {
        id: "R-02",
        title: "Préciser la durée couverte par le tarif",
        taskId: "T-02",
        versionId: "v1",
        text: "Rappeler la durée sélectionnée à côté du montant total.",
        links: [{ observationId: "O-05", role: "support" }],
        review: null,
      },
      {
        id: "R-03",
        title: "Rendre la confirmation visible",
        taskId: "T-03",
        versionId: "v1",
        text: "Afficher un retour visible après le clic et empêcher une seconde soumission pendant le traitement.",
        links: [{ observationId: "O-06", role: "support" }],
        review: null,
      },
    ],
  };
  return review(normalize(s), "R-02", {
    by: "Équipe fictive",
    rationale:
      "Proposition issue d’une seule séance. Vérifier sa compréhension lors d’un prochain test.",
  });
}

import { parseCsv, reportHtml } from "../../shared/files.js";

export const NOTE_HEADERS = ["id", "repere", "sujet", "texte"];
export const KINDS = { appui: "Appui", rapprocher: "À rapprocher" };
const copy = (value) => structuredClone(value);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
function text(value, label, max, empty = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new Error(
      `${label} est vide, trop long ou contient un caractère non admis.`,
    );
  return value.trim();
}
function identifier(value) {
  if (typeof value !== "string" || !idPattern.test(value))
    throw new Error(
      "Identifiant attendu : lettres, chiffres, tiret ou soulignement, 40 caractères maximum.",
    );
  return value;
}
export function seconds(value) {
  if (
    typeof value !== "string" ||
    !/^\d{2}:[0-5]\d:[0-5]\d$/.test(value) ||
    Number(value.slice(0, 2)) > 23
  )
    throw new Error("Repère attendu au format HH:MM:SS, dans les 24 heures.");
  return value.split(":").reduce((total, n) => total * 60 + Number(n), 0);
}
export function normalizeNote(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Note invalide.");
  const note = {
    id: identifier(raw.id),
    repere: text(raw.repere, "Repère", 8),
    sujet: text(raw.sujet, "Sujet", 100),
    texte: text(raw.texte, "Texte de note", 2500),
  };
  seconds(note.repere);
  return note;
}
export function normalizeNotes(raw) {
  if (!Array.isArray(raw) || raw.length > 120)
    throw new Error("120 notes maximum par dossier.");
  const notes = raw.map(normalizeNote);
  if (new Set(notes.map((n) => n.id)).size !== notes.length)
    throw new Error("Deux notes portent le même identifiant.");
  return notes;
}
export function parseNotes(raw) {
  const notes = normalizeNotes(
    parseCsv(raw, { requiredHeaders: NOTE_HEADERS, maxRows: 120 }).rows,
  );
  if (!notes.length) throw new Error("Le CSV doit contenir au moins une note.");
  return notes;
}
function findParagraph(state, id) {
  const p = state.paragraphs.find((item) => item.id === id);
  if (!p) throw new Error("Paragraphe introuvable.");
  return p;
}
export function fingerprint(state, paragraph) {
  return JSON.stringify([
    paragraph.text,
    paragraph.links.map((link) => [
      link.noteId,
      link.kind,
      state.notes.find((n) => n.id === link.noteId) || null,
    ]),
  ]);
}
export function questionIsClosed(state, paragraph, question) {
  return Boolean(
    question.resolution &&
    question.closedFingerprint === fingerprint(state, paragraph),
  );
}
export function paragraphStatus(state, p) {
  const missing = p.links.filter(
    (link) => !state.notes.some((n) => n.id === link.noteId),
  );
  const open = p.questions.filter((q) => !questionIsClosed(state, p, q));
  const issues = [];
  if (!p.links.length) issues.push("Aucun passage lié");
  if (missing.length) issues.push(`${missing.length} source(s) absente(s)`);
  if (open.length) issues.push(`${open.length} question(s) ouverte(s)`);
  const reviewed = !issues.length && p.review === fingerprint(state, p);
  return {
    reviewed,
    missing,
    open,
    issues,
    label: reviewed
      ? "Relu"
      : issues.length
        ? issues.join(" · ")
        : p.review
          ? "Relecture à renouveler"
          : "À relire",
  };
}
function log(state, action) {
  state.journal = [...state.journal, text(action, "Journal", 500)].slice(-200);
}
export function editParagraph(state, id, value) {
  const next = text(value, "Paragraphe", 5000),
    s = copy(state),
    p = findParagraph(s, id);
  if (p.text === next) return state;
  p.text = next;
  log(
    s,
    `${id} · texte corrigé ; les relectures concernées sont à renouveler.`,
  );
  return s;
}
export function linkNote(state, paragraphId, noteId, kind = "appui") {
  if (!Object.hasOwn(KINDS, kind)) throw new Error("Rôle du passage inconnu.");
  if (!state.notes.some((n) => n.id === noteId))
    throw new Error("Note source introuvable.");
  const s = copy(state),
    p = findParagraph(s, paragraphId);
  const existing = p.links.find((l) => l.noteId === noteId);
  if (existing?.kind === kind) return state;
  if (existing) existing.kind = kind;
  else {
    if (p.links.length >= 30)
      throw new Error("30 liens maximum par paragraphe.");
    p.links.push({ noteId, kind });
  }
  log(
    s,
    `${paragraphId} · ${noteId} associé comme ${KINDS[kind].toLowerCase()}.`,
  );
  return s;
}
export function unlinkNote(state, paragraphId, noteId) {
  const s = copy(state),
    p = findParagraph(s, paragraphId);
  p.links = p.links.filter((l) => l.noteId !== noteId);
  log(s, `${paragraphId} · lien ${noteId} retiré.`);
  return s;
}
export function addQuestion(state, paragraphId, value) {
  const question = text(value, "Question", 1200),
    s = copy(state),
    p = findParagraph(s, paragraphId);
  if (p.questions.length >= 20)
    throw new Error("20 questions maximum par paragraphe.");
  const ids = new Set(
    s.paragraphs.flatMap((p) => p.questions.map((q) => q.id)),
  );
  let number = 1;
  while (ids.has("Q" + number)) number++;
  const id = "Q" + number;
  p.questions.push({
    id,
    text: question,
    resolution: "",
    closedFingerprint: null,
  });
  p.review = null;
  log(s, `${paragraphId} · question ${id} créée.`);
  return s;
}
export function closeQuestion(state, paragraphId, questionId, value) {
  const reason = text(value, "Motif de résolution", 1500),
    s = copy(state),
    p = findParagraph(s, paragraphId);
  const q = p.questions.find((q) => q.id === questionId);
  if (!q) throw new Error("Question introuvable.");
  q.resolution = reason;
  q.closedFingerprint = fingerprint(s, p);
  p.review = null;
  log(s, `${paragraphId} · question ${questionId} close avec motif.`);
  return s;
}
export function reopenQuestion(state, paragraphId, questionId) {
  const s = copy(state),
    p = findParagraph(s, paragraphId),
    q = p.questions.find((q) => q.id === questionId);
  if (!q) throw new Error("Question introuvable.");
  q.closedFingerprint = null;
  p.review = null;
  log(
    s,
    `${paragraphId} · question ${questionId} rouverte, motif précédent conservé.`,
  );
  return s;
}
export function markReviewed(state, paragraphId, confirmed) {
  const s = copy(state),
    p = findParagraph(s, paragraphId),
    result = paragraphStatus(s, p);
  if (!confirmed)
    throw new Error("Confirmez avoir relu le texte et ses passages.");
  if (result.issues.length)
    throw new Error(
      "À résoudre avant relecture : " + result.issues.join(" ; ") + ".",
    );
  p.review = fingerprint(s, p);
  log(s, `${paragraphId} · texte et passages déclarés relus.`);
  return s;
}
export function replaceNotes(state, notes) {
  const normalized = normalizeNotes(notes),
    s = copy(state);
  const old = new Map(state.notes.map((n) => [n.id, JSON.stringify(n)]));
  const changed = normalized
    .filter((n) => old.get(n.id) !== JSON.stringify(n))
    .map((n) => n.id);
  const removed = state.notes
    .filter((n) => !normalized.some((v) => v.id === n.id))
    .map((n) => n.id);
  s.notes = normalized;
  log(
    s,
    `Notes remplacées · ${changed.length} nouvelle(s) ou modifiée(s), ${removed.length} retirée(s). Les liens vers une source absente sont conservés et signalés.`,
  );
  return s;
}
export function editNote(state, id, fields) {
  if (!state.notes.some((n) => n.id === id))
    throw new Error("Note introuvable.");
  const next = normalizeNote({ ...fields, id });
  const s = replaceNotes(
    state,
    state.notes.map((n) => (n.id === id ? next : n)),
  );
  log(s, `${id} · note corrigée. La version initiale reste dans le dossier.`);
  return s;
}
export function removeNote(state, id) {
  return replaceNotes(
    state,
    state.notes.filter((n) => n.id !== id),
  );
}
export function restore(value) {
  if (!value || value.schema !== "codexa-review-v1")
    throw new Error("Dossier de relecture Codexa v1 attendu.");
  const notes = normalizeNotes(value.notes),
    originalNotes = normalizeNotes(value.originalNotes);
  if (
    !Array.isArray(value.paragraphs) ||
    !value.paragraphs.length ||
    value.paragraphs.length > 24
  )
    throw new Error("De 1 à 24 paragraphes attendus.");
  const allQuestions = new Set();
  const paragraphs = value.paragraphs.map((p) => {
    if (
      !p ||
      !Array.isArray(p.links) ||
      p.links.length > 30 ||
      !Array.isArray(p.questions) ||
      p.questions.length > 20
    )
      throw new Error("Liens ou questions invalides.");
    const links = p.links.map((l) => {
      if (!l || !Object.hasOwn(KINDS, l.kind))
        throw new Error("Type de lien invalide.");
      return { noteId: identifier(l.noteId), kind: l.kind };
    });
    if (new Set(links.map((l) => l.noteId)).size !== links.length)
      throw new Error("Lien source dupliqué.");
    const questions = p.questions.map((q) => {
      if (!q || !/^Q[1-9]\d{0,6}$/.test(q.id) || allQuestions.has(q.id))
        throw new Error("Identifiant de question invalide ou répété.");
      allQuestions.add(q.id);
      return {
        id: q.id,
        text: text(q.text, "Question", 1200),
        resolution: text(q.resolution, "Résolution", 1500, true),
        closedFingerprint:
          q.closedFingerprint === null
            ? null
            : text(q.closedFingerprint, "Empreinte de question", 100000),
      };
    });
    return {
      id: identifier(p.id),
      text: text(p.text, "Paragraphe", 5000),
      original: text(p.original, "Texte initial", 5000),
      links,
      questions,
      review:
        p.review === null
          ? null
          : text(p.review, "Empreinte de relecture", 100000),
    };
  });
  if (new Set(paragraphs.map((p) => p.id)).size !== paragraphs.length)
    throw new Error("Paragraphe dupliqué.");
  if (!Array.isArray(value.journal) || value.journal.length > 200)
    throw new Error("Journal invalide.");
  return {
    schema: "codexa-review-v1",
    title: text(value.title, "Titre", 180),
    notes,
    originalNotes,
    paragraphs,
    journal: value.journal.map((line) => text(line, "Journal", 500)),
  };
}
export function validState(state) {
  try {
    restore(state);
    return true;
  } catch {
    return false;
  }
}
export function issueRows(state) {
  return state.paragraphs.flatMap((p) => {
    const result = paragraphStatus(state, p);
    const rows = result.open.map((q) => [
      p.id,
      q.id,
      q.closedFingerprint
        ? "Question rouverte après modification"
        : "Question ouverte",
      q.text,
      q.resolution,
    ]);
    for (const link of result.missing)
      rows.push([
        p.id,
        link.noteId,
        "Source absente",
        "Retrouver la note ou retirer son lien après vérification.",
        "",
      ]);
    if (!p.links.length) rows.push([p.id, "", "Aucun passage lié", p.text, ""]);
    if (!result.reviewed)
      rows.push([p.id, "", "Relecture à effectuer", result.label, ""]);
    return rows;
  });
}
export function makeReport(state) {
  const reviewed = state.paragraphs.filter(
    (p) => paragraphStatus(state, p).reviewed,
  ).length;
  return reportHtml({
    title: state.title,
    subtitle: `Dossier de revue · ${reviewed}/${state.paragraphs.length} paragraphes déclarés relus. Liens et décisions établis manuellement. Exemple fictif, sans validation automatique de fidélité.`,
    sections: [
      ...state.paragraphs.map((p) => ({
        title: `${p.id} · ${paragraphStatus(state, p).label}`,
        paragraphs: [
          `Texte initial\n${p.original}`,
          `Texte courant\n${p.text}`,
        ],
        headers: ["Source", "Rôle", "Repère", "Passage exact"],
        rows: p.links.map((l) => {
          const n = state.notes.find((n) => n.id === l.noteId);
          return [
            l.noteId,
            KINDS[l.kind],
            n?.repere || "",
            n?.texte || "SOURCE ABSENTE",
          ];
        }),
      })),
      {
        title: "Questions de revue",
        headers: [
          "Paragraphe",
          "Question",
          "État",
          "Texte",
          "Résolution ou motif précédent",
        ],
        rows: state.paragraphs.flatMap((p) =>
          p.questions.map((q) => [
            p.id,
            q.id,
            questionIsClosed(state, p, q)
              ? "Close sur la version courante"
              : "Ouverte",
            q.text,
            q.resolution,
          ]),
        ),
      },
      {
        title: "Tous les passages courants",
        headers: NOTE_HEADERS,
        rows: state.notes.map((n) => NOTE_HEADERS.map((key) => n[key])),
      },
      {
        title: "Notes initiales conservées",
        headers: NOTE_HEADERS,
        rows: state.originalNotes.map((n) => NOTE_HEADERS.map((key) => n[key])),
      },
      { title: "Journal du dossier", paragraphs: state.journal },
    ],
  });
}
const initialNotes = [
  {
    id: "N01",
    repere: "00:04:12",
    sujet: "Objectif",
    texte:
      "Préparer une nouvelle édition papier du catalogue pour les revendeurs et partenaires avant la fin de l’année.",
  },
  {
    id: "N02",
    repere: "00:06:40",
    sujet: "Calendrier",
    texte:
      "Le 15 octobre est proposé pour le lancement. Cette date reste soumise à la validation du bon à tirer et du budget.",
  },
  {
    id: "N03",
    repere: "00:09:05",
    sujet: "Bon à tirer",
    texte:
      "L’équipe souhaite disposer du bon à tirer le 20 septembre. Le calendrier définitif sera confirmé après sa validation.",
  },
  {
    id: "N04",
    repere: "00:12:18",
    sujet: "Budget",
    texte:
      "Le devis envisagé porte sur 10 000 exemplaires et 42 000 euros. La direction financière doit encore valider ce montant avant engagement.",
  },
];
export function seed() {
  const s = {
    schema: "codexa-review-v1",
    title: "Lancement du catalogue",
    notes: copy(initialNotes),
    originalNotes: copy(initialNotes),
    paragraphs: [
      {
        id: "P01",
        original:
          "Une nouvelle édition papier du catalogue est prévue pour les revendeurs et partenaires avant la fin de l’année.",
        text: "Une nouvelle édition papier du catalogue est prévue pour les revendeurs et partenaires avant la fin de l’année.",
        links: [],
        questions: [],
        review: null,
      },
      {
        id: "P02",
        original: "Le lancement est confirmé pour le 15 octobre.",
        text: "Le lancement est confirmé pour le 15 octobre.",
        links: [
          { noteId: "N02", kind: "appui" },
          { noteId: "N03", kind: "rapprocher" },
        ],
        questions: [
          {
            id: "Q1",
            text: "La date est-elle confirmée ou seulement proposée ?",
            resolution: "",
            closedFingerprint: null,
          },
        ],
        review: null,
      },
      {
        id: "P03",
        original:
          "Le tirage envisagé est de 10 000 exemplaires pour un budget estimé à 42 000 euros, sous réserve de validation par la direction financière.",
        text: "Le tirage envisagé est de 10 000 exemplaires pour un budget estimé à 42 000 euros, sous réserve de validation par la direction financière.",
        links: [{ noteId: "N04", kind: "appui" }],
        questions: [],
        review: null,
      },
    ],
    journal: [
      "Exemple fictif chargé ; les rôles des passages et la fidélité du texte restent à apprécier par le relecteur.",
    ],
  };
  s.paragraphs[2].review = fingerprint(s, s.paragraphs[2]);
  return s;
}

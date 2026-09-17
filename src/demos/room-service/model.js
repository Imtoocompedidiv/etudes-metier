import { parseCsv } from "../../shared/files.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export const MAX_EXPORTS = 3000;
// The bounded dossier includes historical snapshots; CSV imports keep the shared 5 MiB limit.
export const MAX_DOSSIER_BYTES = 32 * 1024 * 1024;
const fingerprint = (value) =>
  bytesToHex(sha256(utf8ToBytes(JSON.stringify(value))));
const digest = (value, label) => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value))
    throw Error(`${label} : empreinte de dossier invalide.`);
  return value;
};

export const MOUNTS = {
  opening: "Bélière ouvrable",
  engraved: "Anneau gravé",
  simple: "Simple",
};
export const LINE_HEADERS = ["id", "commande", "reference", "quantite"];
export const MESSAGE_HEADERS = [
  "id",
  "ligne",
  "date",
  "montage",
  "source",
  "note",
];
const str = (v, label, max = 160, empty = false) => {
  if (typeof v !== "string" || v.length > max || (!empty && !v.trim()))
    throw Error(
      `${label} : texte ${empty ? "de 0" : "de 1"} à ${max} caractères attendu.`,
    );
  return v.trim();
};
const id = (v, label) => {
  const s = str(v, label, 40);
  if (
    !/^[\w-]+$/.test(s) ||
    ["__proto__", "constructor", "prototype"].includes(s)
  )
    throw Error(
      `${label} : lettres, chiffres, tiret et underscore uniquement.`,
    );
  return s;
};
const integer = (v, label, min = 1, max = 500) => {
  if (
    !["number", "string"].includes(typeof v) ||
    (typeof v === "string" && !v.trim()) ||
    !Number.isInteger(Number(v)) ||
    Number(v) < min ||
    Number(v) > max
  )
    throw Error(`${label} : entier de ${min} à ${max} attendu.`);
  return Number(v);
};
export function stamp(v) {
  if (typeof v !== "string" || !/^20\d\d-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v))
    throw Error("Date attendue au format AAAA-MM-JJTHH:MM.");
  const d = new Date(`${v}:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 16) !== v)
    throw Error("La date et l’heure doivent exister.");
  return v;
}
export function lineValue(v) {
  if (!v || Array.isArray(v)) throw Error("Ligne manquante.");
  return {
    id: id(v.id, "Identifiant de ligne"),
    order: str(v.order, "Commande", 40),
    reference: str(v.reference, "Référence", 100),
    quantity: integer(v.quantity, "Quantité"),
  };
}
export function messageValue(v) {
  if (!v || Array.isArray(v)) throw Error("Instruction manquante.");
  if (typeof v.mount !== "string" || !Object.hasOwn(MOUNTS, v.mount))
    throw Error("Montage inconnu : opening, engraved ou simple attendu.");
  return {
    id: id(v.id, "Identifiant de message"),
    target: v.target === "" ? "" : id(v.target, "Ligne visée"),
    at: stamp(v.at),
    mount: v.mount,
    source: str(v.source, "Source", 100),
    note: str(v.note, "Note", 500, true),
  };
}
function unique(list, label) {
  if (new Set(list.map((x) => x.id)).size !== list.length)
    throw Error(`${label} : chaque identifiant doit être unique.`);
}
export const seed = {
  version: 1,
  lines: [
    { id: "R104-L1", order: "R-104", reference: "Pendentif A", quantity: 2 },
    { id: "R104-L2", order: "R-104", reference: "Pendentif B", quantity: 1 },
    { id: "R105-L1", order: "R-105", reference: "Pendentif C", quantity: 3 },
    { id: "R106-L1", order: "R-106", reference: "Pendentif D", quantity: 1 },
  ],
  messages: [
    {
      id: "M01",
      target: "R104-L1",
      at: "2026-09-17T09:10",
      mount: "opening",
      source: "Client · email fictif",
      note: "Bélière ouvrable demandée pour les deux pièces.",
    },
    {
      id: "M02",
      target: "R104-L1",
      at: "2026-09-17T10:25",
      mount: "engraved",
      source: "Atelier · note fictive",
      note: "Le dernier échange mentionne un anneau gravé. À confirmer avec le client.",
    },
    {
      id: "M03",
      target: "R104-L2",
      at: "2026-09-17T09:30",
      mount: "simple",
      source: "Client · email fictif",
      note: "Pendentif seul.",
    },
    {
      id: "M04",
      target: "R999-L1",
      at: "2026-09-17T11:00",
      mount: "opening",
      source: "Message sans référence certaine",
      note: "Référence transcrite à vérifier avant rattachement.",
    },
  ],
  decisions: {},
  exports: [],
};
export const instructions = (s, lineId) =>
  s.messages.filter((m) => m.target === lineId);
export const unmatched = (s) =>
  s.messages.filter((m) => !s.lines.some((l) => l.id === m.target));
export const basis = (s, lineId) =>
  fingerprint([s.lines.find((l) => l.id === lineId), instructions(s, lineId)]);
export function decision(s, lineId) {
  const d = s.decisions[lineId];
  return d &&
    d.basis === basis(s, lineId) &&
    instructions(s, lineId).some((m) => m.id === d.messageId)
    ? d
    : null;
}
export function snapshot(s, lineId) {
  const d = decision(s, lineId);
  if (!d)
    throw Error(
      "Revoir les instructions de cette ligne avant de préparer sa fiche.",
    );
  const line = s.lines.find((l) => l.id === lineId),
    m = s.messages.find((m) => m.id === d.messageId);
  return {
    line: { ...line },
    message: { ...m },
    reason: d.reason,
    basis: d.basis,
  };
}
export const snapshotKey = (v) =>
  fingerprint([v.line, v.message, v.reason, v.basis]);
export const lastExport = (s, lineId) =>
  s.exports.filter((e) => e.lineId === lineId).at(-1);
export function status(s, lineId) {
  const d = decision(s, lineId),
    last = lastExport(s, lineId);
  if (last && (!d || last.key !== snapshotKey(snapshot(s, lineId))))
    return "Fiche à remplacer";
  if (d) return last ? `Fiche v${last.version}` : "Prête à préparer";
  const all = instructions(s, lineId);
  return all.length
    ? new Set(all.map((m) => m.mount)).size > 1
      ? "À arbitrer"
      : "À revoir"
    : "Choix manquant";
}
export function decide(s, lineId, messageId, reason) {
  if (!s.lines.some((l) => l.id === lineId)) throw Error("Ligne inconnue.");
  if (!instructions(s, lineId).some((m) => m.id === messageId))
    throw Error("Choisissez une instruction rattachée à cette ligne.");
  return {
    ...s,
    decisions: {
      ...s.decisions,
      [lineId]: {
        messageId,
        reason: str(reason, "Motif de décision", 500),
        basis: basis(s, lineId),
      },
    },
  };
}
export function changeLine(s, raw) {
  const line = lineValue(raw);
  if (!s.lines.some((l) => l.id === line.id)) throw Error("Ligne inconnue.");
  return { ...s, lines: s.lines.map((l) => (l.id === line.id ? line : l)) };
}
export function addMessage(s, raw) {
  const message = messageValue(raw);
  if (s.messages.length >= 1000)
    throw Error("Ce carnet est limité à 1 000 instructions.");
  if (s.messages.some((m) => m.id === message.id))
    throw Error("Cet identifiant de message existe déjà.");
  return { ...s, messages: [...s.messages, message] };
}
export function assignMessage(s, messageId, lineId) {
  if (!s.lines.some((l) => l.id === lineId))
    throw Error("Choisissez une ligne existante.");
  if (!s.messages.some((m) => m.id === messageId))
    throw Error("Message introuvable.");
  return {
    ...s,
    messages: s.messages.map((m) =>
      m.id === messageId ? { ...m, target: lineId } : m,
    ),
  };
}
export function importLines(raw, s) {
  const { rows } = parseCsv(raw, {
    requiredHeaders: LINE_HEADERS,
    maxRows: 200,
  });
  if (!rows.length) throw Error("Le fichier doit contenir une ligne.");
  const lines = rows.map((r) =>
    lineValue({
      id: r.id,
      order: r.commande,
      reference: r.reference,
      quantity: r.quantite,
    }),
  );
  unique(lines, "Commandes");
  const merged = s.lines.map((l) => lines.find((n) => n.id === l.id) || l);
  merged.push(...lines.filter((l) => !s.lines.some((old) => old.id === l.id)));
  if (merged.length > 200) throw Error("Maximum 200 lignes dans ce carnet.");
  return { ...s, lines: merged };
}
export function importMessages(raw, s) {
  const { rows } = parseCsv(raw, {
    requiredHeaders: MESSAGE_HEADERS,
    maxRows: 1000,
  });
  if (!rows.length) throw Error("Le fichier doit contenir une instruction.");
  const messages = rows.map((r) =>
    messageValue({
      id: r.id,
      target: r.ligne,
      at: r.date,
      mount: r.montage,
      source: r.source,
      note: r.note,
    }),
  );
  unique(messages, "Instructions");
  for (const m of messages) {
    const existing = s.messages.find((x) => x.id === m.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(m))
      throw Error(
        `${m.id} existe avec un contenu différent. Ajoutez une nouvelle instruction avec un nouvel identifiant.`,
      );
  }
  const merged = [
    ...s.messages,
    ...messages.filter((m) => !s.messages.some((x) => x.id === m.id)),
  ];
  if (merged.length > 1000)
    throw Error("Maximum 1 000 instructions dans ce carnet.");
  return { ...s, messages: merged };
}
export function exportLine(s, lineId) {
  const content = snapshot(s, lineId),
    key = snapshotKey(content),
    previous = lastExport(s, lineId);
  if (previous?.key === key) return { state: s, entry: previous };
  if (
    s.exports.length >= MAX_EXPORTS ||
    (previous?.version || 0) >= MAX_EXPORTS
  )
    throw Error(
      "Ce carnet conserve au maximum 3 000 fiches. Sauvegardez ce dossier et commencez un nouveau carnet pour poursuivre.",
    );
  const entry = { lineId, version: (previous?.version || 0) + 1, key, content };
  return { state: { ...s, exports: [...s.exports, entry] }, entry };
}
export function exportReady(s) {
  const ready = s.lines.filter((l) => decision(s, l.id));
  if (!ready.length) throw Error("Aucune ligne revue à exporter.");
  let state = s;
  const entries = ready.map((l) => {
    const result = exportLine(state, l.id);
    state = result.state;
    return result.entry;
  });
  return { state, entries };
}
export const lineRows = (s) =>
  s.lines.map((l) => [l.id, l.order, l.reference, l.quantity]);
export const messageRows = (s) =>
  s.messages.map((m) => [m.id, m.target, m.at, m.mount, m.source, m.note]);
export const READY_HEADERS = [
  "ligne",
  "commande",
  "reference",
  "quantite",
  "montage",
  "version_fiche",
  "instruction",
  "source",
  "motif",
];
export const readyRows = (entries) =>
  entries.map((e) => {
    const { line, message, reason } = e.content;
    return [
      line.id,
      line.order,
      line.reference,
      line.quantity,
      MOUNTS[message.mount],
      e.version,
      message.id,
      message.source,
      reason,
    ];
  });
export function questions(s) {
  const rows = s.lines
    .filter((l) => !decision(s, l.id))
    .map(
      (l) =>
        `${l.order} / ${l.id} · ${l.reference}\n${instructions(s, l.id).length ? "Confirmer le choix retenu et son motif parmi les instructions reçues." : "Quel montage faut-il préparer : bélière ouvrable, anneau gravé ou simple ?"}${lastExport(s, l.id) ? "\nUne fiche antérieure existe : vérifier son remplacement avant préparation." : ""}`,
    );
  rows.push(
    ...unmatched(s).map(
      (m) =>
        `${m.id} · ${m.source}\nÀ quelle ligne correspond cette instruction ? Référence reçue : ${m.target || "absente"}. Aucun rattachement automatique.`,
    ),
  );
  return `Questions de préparation · exemple fictif\nBrouillon local, aucun message envoyé.\n\n${rows.length ? rows.join("\n\n") : "Toutes les lignes possèdent une décision à jour et tous les messages sont rattachés."}`;
}
export function report(entry) {
  const { line, message, reason } = entry.content;
  return {
    title: `Fiche atelier · ${line.order} / ${line.id}`,
    subtitle: `Version ${entry.version} · Données fictives · Export local, aucune transmission ou réservation`,
    sections: [
      {
        title: "Instruction retenue",
        headers: ["Référence", "Quantité", "Montage"],
        rows: [[line.reference, line.quantity, MOUNTS[message.mount]]],
      },
      {
        title: "Décision humaine",
        paragraphs: [
          `Message ${message.id} · ${message.at.replace("T", " ")} · ${message.source}`,
          message.note,
          `Motif : ${reason}`,
        ],
      },
      {
        title: "Avant préparation",
        paragraphs: [
          "Ce document est une instruction de montage déclarée, pas un dessin de fabrication. Vérifier les spécifications, disponibilités et accords dans les outils métier.",
          "Toute instruction reçue après cette version exige une nouvelle revue dans le carnet. Le fichier déjà téléchargé ne se met pas à jour automatiquement.",
        ],
      },
    ],
  };
}
export function restore(raw) {
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    throw Error("Dossier JSON illisible.");
  }
  if (
    !v ||
    v.version !== 1 ||
    !Array.isArray(v.lines) ||
    !v.lines.length ||
    v.lines.length > 200 ||
    !Array.isArray(v.messages) ||
    v.messages.length > 1000 ||
    !Array.isArray(v.exports) ||
    v.exports.length > MAX_EXPORTS ||
    !v.decisions ||
    Array.isArray(v.decisions) ||
    typeof v.decisions !== "object"
  )
    throw Error("Structure de dossier invalide.");
  const s = {
    version: 1,
    lines: v.lines.map(lineValue),
    messages: v.messages.map(messageValue),
    decisions: {},
    exports: [],
  };
  unique(s.lines, "Commandes");
  unique(s.messages, "Instructions");
  for (const [lineId, d] of Object.entries(v.decisions)) {
    if (!s.lines.some((l) => l.id === lineId) || !d || typeof d !== "object")
      throw Error("Décision associée à une ligne inconnue.");
    const clean = {
      messageId: id(d.messageId, "Message retenu"),
      reason: str(d.reason, "Motif", 500),
      basis: digest(d.basis, "État de revue"),
    };
    // Une revue ancienne reste visible mais ne satisfait pas decision().
    s.decisions[lineId] = clean;
  }
  for (const e of v.exports) {
    if (!e || !s.lines.some((l) => l.id === e.lineId) || !e.content)
      throw Error("Historique associé à une ligne inconnue.");
    const content = {
      line: lineValue(e.content.line),
      message: messageValue(e.content.message),
      reason: str(e.content.reason, "Motif archivé", 500),
      basis: digest(e.content.basis, "État archivé"),
    };
    if (
      content.line.id !== e.lineId ||
      content.message.target !== e.lineId ||
      digest(e.key, "Fiche archivée") !== snapshotKey(content)
    )
      throw Error("Fiche archivée incohérente.");
    const previous = lastExport(s, e.lineId),
      version = integer(e.version, "Version", 1, MAX_EXPORTS);
    if (version !== (previous?.version || 0) + 1)
      throw Error("Les versions archivées doivent se suivre.");
    s.exports.push({ lineId: e.lineId, version, key: e.key, content });
  }
  return s;
}

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const MAX_TIME = 3_600_000;
export const RATIOS = { vertical: [9, 16], carre: [1, 1], paysage: [16, 9] };
const plain = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
function keys(x, expected, name) {
  if (
    !plain(x) ||
    Object.keys(x).some((k) => !expected.includes(k)) ||
    expected.some((k) => !Object.hasOwn(x, k))
  )
    throw Error(`${name} : structure inattendue.`);
}
function text(x, max, name) {
  if (
    typeof x !== "string" ||
    !x.trim() ||
    x.length > max ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(x)
  )
    throw Error(`${name} : texte requis, ${max} caractères maximum.`);
  return x.trim().replace(/\r\n?/g, "\n");
}
function integer(x, min, max, name) {
  if (typeof x !== "number" || !Number.isSafeInteger(x) || x < min || x > max)
    throw Error(`${name} : entier entre ${min} et ${max} attendu.`);
  return x;
}
export function time(ms) {
  integer(ms, 0, MAX_TIME, "Repère");
  const h = Math.floor(ms / 3600000),
    m = Math.floor((ms % 3600000) / 60000),
    s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
export function parseTime(value) {
  if (typeof value !== "string" || !/^\d{2}:[0-5]\d:[0-5]\d,\d{3}$/.test(value))
    throw Error("Repère attendu au format 00:00:00,000.");
  const [h, m, s, ms] = value.split(/[:,]/).map(Number);
  return integer(((h * 60 + m) * 60 + s) * 1000 + ms, 0, MAX_TIME, "Repère");
}
function cue(x) {
  keys(x, ["id", "start", "end", "text"], "Sous-titre");
  return {
    id: integer(x.id, 1, 99999, "Identifiant"),
    start: integer(x.start, 0, MAX_TIME, "Début"),
    end: integer(x.end, 0, MAX_TIME, "Fin"),
    text: text(x.text, 1000, "Sous-titre"),
  };
}
function cues(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 200)
    throw Error("Entre 1 et 200 sous-titres attendus.");
  const result = list.map(cue);
  if (new Set(result.map((c) => c.id)).size !== result.length)
    throw Error("Les identifiants des sous-titres doivent être uniques.");
  return result;
}
export function brief(x) {
  keys(x, ["title", "ratio", "maxDuration", "readingRate"], "Brief");
  if (typeof x.ratio !== "string" || !Object.hasOwn(RATIOS, x.ratio))
    throw Error("Format vidéo inconnu.");
  return {
    title: text(x.title, 100, "Titre"),
    ratio: x.ratio,
    maxDuration: integer(x.maxDuration, 1, 3600, "Durée maximale"),
    readingRate: integer(x.readingRate, 1, 80, "Vitesse de lecture"),
  };
}
export function media(x) {
  keys(
    x,
    ["name", "width", "height", "duration", "bytes", "fingerprint"],
    "Vidéo",
  );
  if (
    typeof x.fingerprint !== "string" ||
    !/^(example-v1|[a-f0-9]{64})$/.test(x.fingerprint)
  )
    throw Error("Empreinte vidéo invalide.");
  return {
    name: text(x.name, 200, "Nom vidéo"),
    width: integer(x.width, 1, 16384, "Largeur"),
    height: integer(x.height, 1, 16384, "Hauteur"),
    duration: integer(x.duration, 1, MAX_TIME, "Durée vidéo"),
    bytes: integer(x.bytes, 0, 52428800, "Taille vidéo"),
    fingerprint: x.fingerprint,
  };
}
export const seed = {
  version: 1,
  brief: {
    title: "Bistrot des Tilleuls · Plat du jour",
    ratio: "vertical",
    maxDuration: 30,
    readingRate: 20,
  },
  media: {
    name: "bistrot-demo.mp4",
    width: 540,
    height: 960,
    duration: 18000,
    bytes: 314274,
    fingerprint: "example-v1",
  },
  cues: [
    { id: 1, start: 500, end: 5000, text: "Une bonne saucisse," },
    { id: 2, start: 5200, end: 14500, text: "une purée maison." },
    { id: 3, start: 15000, end: 20000, text: "On vous garde une table ?" },
  ],
  review: null,
  journal: [],
};
// Empreinte de version locale, pas une preuve d’identité ou d’authenticité.
export const signature = (s) =>
  bytesToHex(
    sha256(
      new TextEncoder().encode(JSON.stringify([s.brief, s.media, s.cues])),
    ),
  );
export function normalize(s) {
  keys(
    s,
    ["version", "brief", "media", "cues", "review", "journal"],
    "Dossier",
  );
  if (s.version !== 1)
    throw Error("Dossier de recette vidéo version 1 attendu.");
  const result = {
    version: 1,
    brief: brief(s.brief),
    media: media(s.media),
    cues: cues(s.cues),
    review: null,
    journal: [],
  };
  if (!Array.isArray(s.journal) || s.journal.length > 40)
    throw Error("Historique invalide.");
  result.journal = s.journal.map((v) => text(v, 250, "Historique"));
  if (s.review !== null) {
    keys(s.review, ["snapshot", "note"], "Revue");
    if (
      typeof s.review.snapshot !== "string" ||
      !/^[a-f0-9]{64}$/.test(s.review.snapshot)
    )
      throw Error("Revue invalide.");
    const note = text(s.review.note, 250, "Note de revue");
    if (s.review.snapshot === signature(result))
      result.review = { snapshot: s.review.snapshot, note };
  }
  return result;
}
export function restore(raw) {
  if (typeof raw !== "string" || raw.length > 1000000)
    throw Error("Dossier limité à 1 Mo.");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Error("Le dossier JSON est illisible.");
  }
  return normalize(data);
}
export const validDossier = (x) => {
  try {
    return JSON.stringify(x) === JSON.stringify(normalize(x));
  } catch {
    return false;
  }
};
function next(s, changes, action) {
  return normalize({
    ...s,
    ...changes,
    review: null,
    journal: [...s.journal, action].slice(-40),
  });
}
export function editCue(s, value) {
  const c = cue(value);
  if (!s.cues.some((x) => x.id === c.id))
    throw Error("Sous-titre introuvable.");
  return next(
    s,
    { cues: s.cues.map((x) => (x.id === c.id ? c : x)) },
    `Sous-titre ${c.id} modifié.`,
  );
}
export function addCue(s) {
  if (s.cues.length >= 200) throw Error("Maximum 200 sous-titres.");
  let id = 1;
  while (s.cues.some((c) => c.id === id)) id++;
  const start = Math.min(
    Math.max(...s.cues.map((c) => c.end)),
    MAX_TIME - 1000,
  );
  return next(
    s,
    {
      cues: [
        ...s.cues,
        { id, start, end: start + 1000, text: "Nouveau sous-titre" },
      ],
    },
    `Sous-titre ${id} ajouté.`,
  );
}
export function removeCue(s, id) {
  if (!s.cues.some((c) => c.id === id)) throw Error("Sous-titre introuvable.");
  if (s.cues.length === 1) throw Error("Conservez au moins un sous-titre.");
  return next(
    s,
    { cues: s.cues.filter((c) => c.id !== id) },
    `Sous-titre ${id} supprimé.`,
  );
}
export function shift(s, milliseconds) {
  integer(milliseconds, -MAX_TIME, MAX_TIME, "Décalage");
  const list = s.cues.map((c) => ({
    ...c,
    start: c.start + milliseconds,
    end: c.end + milliseconds,
  }));
  if (
    list.some(
      (c) => c.start < 0 || c.end < 0 || c.start > MAX_TIME || c.end > MAX_TIME,
    )
  )
    throw Error(
      "Ce décalage sortirait des repères compris entre 0 et 1 heure. Aucun sous-titre déplacé.",
    );
  return next(s, { cues: list }, `Lot décalé de ${milliseconds} ms.`);
}
export const editBrief = (s, b) =>
  next(s, { brief: brief(b) }, "Brief modifié.");
export const attachMedia = (s, m) => {
  const descriptor = media(m);
  return JSON.stringify(s.media) === JSON.stringify(descriptor)
    ? s
    : next(s, { media: descriptor }, "Vidéo associée au dossier.");
};
export function parseSrt(raw) {
  if (typeof raw !== "string" || raw.length > 300000)
    throw Error("SRT limité à 300 000 caractères.");
  const clean = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!clean) throw Error("Le fichier SRT est vide.");
  const list = clean.split(/\n[ \t]*\n/).map((block, i) => {
    const lines = block.split("\n");
    if (lines.length < 3 || !/^[1-9]\d{0,4}$/.test(lines[0]))
      throw Error(`Bloc ${i + 1} : identifiant et texte SRT requis.`);
    const match = lines[1].match(
      /^(\d{2}:[0-5]\d:[0-5]\d,\d{3}) --> (\d{2}:[0-5]\d:[0-5]\d,\d{3})$/,
    );
    if (!match) throw Error(`Bloc ${i + 1} : ligne de temps SRT invalide.`);
    const value = lines.slice(2).join("\n");
    if (/[<>]/.test(value))
      throw Error(`Bloc ${i + 1} : texte brut attendu, sans balises SRT.`);
    return {
      id: Number(lines[0]),
      start: parseTime(match[1]),
      end: parseTime(match[2]),
      text: value,
    };
  });
  return cues(list);
}
export const importSrt = (s, raw) =>
  next(s, { cues: parseSrt(raw) }, "Sous-titres importés depuis un SRT.");
export function findings(s, attachedFingerprint) {
  const found = [];
  const push = (code, severity, message, ids = []) =>
    found.push({ code, severity, message, ids });
  if (s.media.fingerprint !== attachedFingerprint)
    push(
      "media-missing",
      "bloquant",
      "Associez de nouveau la vidéo pour vérifier cette livraison.",
    );
  const [w, h] = RATIOS[s.brief.ratio];
  if (Math.abs(s.media.width / s.media.height - w / h) > 0.005)
    push(
      "ratio",
      "bloquant",
      `Format ${s.media.width} × ${s.media.height}, attendu ${w}:${h} (tolérance 0,5 point de ratio).`,
    );
  if (s.media.duration > s.brief.maxDuration * 1000)
    push(
      "duration",
      "bloquant",
      `Le clip dure ${(s.media.duration / 1000).toFixed(3)} s, au-delà des ${s.brief.maxDuration} s du brief.`,
    );
  for (const c of s.cues) {
    if (c.end <= c.start)
      push(
        "order",
        "bloquant",
        `Sous-titre ${c.id} : la fin doit suivre le début.`,
        [c.id],
      );
    if (c.end > s.media.duration || c.start >= s.media.duration)
      push(
        "outside",
        "bloquant",
        `Sous-titre ${c.id} : repère hors du clip de ${(s.media.duration / 1000).toFixed(3)} s.`,
        [c.id],
      );
    const characters = Array.from(c.text.replace(/\s/g, "")).length;
    if (
      c.end > c.start &&
      characters * 1000 > s.brief.readingRate * (c.end - c.start)
    )
      push(
        "reading",
        "à relire",
        `Sous-titre ${c.id} : ${((characters * 1000) / (c.end - c.start)).toFixed(1)} caractères/s, seuil ${s.brief.readingRate}. Espaces exclus.`,
        [c.id],
      );
    if (/[<>]/.test(c.text))
      push(
        "markup",
        "bloquant",
        `Sous-titre ${c.id} : retirez les chevrons ; la livraison attend du texte brut.`,
        [c.id],
      );
  }
  const list = [...s.cues].sort((a, b) => a.start - b.start || a.id - b.id);
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length && list[j].start < list[i].end; j++) {
      if (list[i].end > list[i].start && list[j].end > list[j].start)
        push(
          "overlap",
          "bloquant",
          `Sous-titres ${list[i].id} et ${list[j].id} : repères qui se chevauchent.`,
          [list[i].id, list[j].id],
        );
    }
  return found;
}
export function markReview(s, attached, note) {
  if (findings(s, attached).length)
    throw Error("Corrigez les points de contrôle avant de déclarer la revue.");
  return {
    ...s,
    review: { snapshot: signature(s), note: text(note, 250, "Note de revue") },
    journal: [...s.journal, "Revue déclarée pour cette version."].slice(-40),
  };
}
export const reviewed = (s, attached) =>
  s.review?.snapshot === signature(s) && findings(s, attached).length === 0;
export function srt(s, attached) {
  if (findings(s, attached).some((f) => f.severity === "bloquant"))
    throw Error(
      "Corrigez les anomalies bloquantes avant de livrer le SRT. Le dossier et le rapport restent exportables.",
    );
  return (
    [...s.cues]
      .sort((a, b) => a.start - b.start || a.id - b.id)
      .map(
        (c, i) =>
          `${i + 1}\r\n${time(c.start)} --> ${time(c.end)}\r\n${c.text.replace(/\n/g, "\r\n")}`,
      )
      .join("\r\n\r\n") + "\r\n"
  );
}
export const findingRows = (s, attached) =>
  findings(s, attached).map((f) => [
    f.severity,
    f.code,
    f.ids.join("|"),
    f.message,
  ]);
export function report(s, attached) {
  return {
    title: s.brief.title,
    subtitle: `${reviewed(s, attached) ? "Revue déclarée" : "Livraison à relire"} · Exemple indépendant Saucisse Purée`,
    sections: [
      {
        title: "Brief et vidéo",
        paragraphs: [
          `${s.media.name}, ${s.media.width} × ${s.media.height}, ${(s.media.duration / 1000).toFixed(3)} s.`,
          `Format ${RATIOS[s.brief.ratio].join(":")}, durée maximale ${s.brief.maxDuration} s, lecture ${s.brief.readingRate} caractères/s hors espaces.`,
          attached === s.media.fingerprint
            ? "Vidéo associée dans la session de contrôle."
            : "Vidéo non associée dans cette session : caractéristiques déclarées à revérifier.",
        ],
      },
      {
        title: "Sous-titres courants",
        headers: ["Repère", "Début", "Fin", "Texte"],
        rows: s.cues.map((c) => [c.id, time(c.start), time(c.end), c.text]),
      },
      {
        title: "Constats",
        headers: ["Niveau", "Contrôle", "Repères", "Détail"],
        rows: findingRows(s, attached),
        paragraphs: findings(s, attached).length
          ? []
          : ["Aucun écart aux paramètres de ce dossier."],
      },
      {
        title: "Revue et historique",
        paragraphs: [
          reviewed(s, attached)
            ? s.review.note
            : "Aucune revue valable pour cette version et cette vidéo.",
          ...s.journal,
        ],
      },
      {
        title: "Périmètre",
        paragraphs: [
          "Contrôle de format et de repères temporels uniquement. Le sens, le montage, le son, les droits et le rendu sur chaque réseau sont à vérifier par l’équipe. Le fichier vidéo ne figure pas dans le dossier JSON.",
          "Sous-ensemble SRT en texte brut. Les repères identiques en fin/début sont autorisés ; les chevauchements sont signalés. Seuils du brief fictifs et modifiables. Aucun envoi externe.",
        ],
      },
    ],
  };
}

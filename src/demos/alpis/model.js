export const DEFAULT_RULES = {
  videoMs: 42000,
  maxCps: 17,
  maxLine: 42,
  minMs: 1000,
  maxMs: 7000,
};
const LIMIT = 10800000;
export function parseTime(text) {
  const m = /^(\d{2}):([0-5]\d):([0-5]\d),(\d{3})$/.exec(String(text));
  if (!m) throw new Error("Utilisez un temps au format 00:00:12,600.");
  const value = ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4];
  if (value > LIMIT)
    throw new Error("La démonstration accepte des temps jusqu’à trois heures.");
  return value;
}
export function formatTime(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > LIMIT)
    throw new Error("Temps hors limites.");
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(value / 3600000))}:${pad(Math.floor(value / 60000) % 60)}:${pad(Math.floor(value / 1000) % 60)},${pad(value % 1000, 3)}`;
}
function validateCue(cue) {
  if (!cue || typeof cue.id !== "string" || !/^s\d+$/.test(cue.id))
    throw new Error("Identifiant de passage invalide.");
  if (
    ![cue.start, cue.end].every(
      (x) => Number.isSafeInteger(x) && x >= 0 && x <= LIMIT,
    ) ||
    cue.end <= cue.start
  )
    throw new Error("La sortie doit suivre l’entrée, sans temps négatif.");
  if (
    typeof cue.text !== "string" ||
    !cue.text.trim() ||
    cue.text.length > 3000 ||
    /\n\s*\n|\r|\u0000|-->/.test(cue.text)
  )
    throw new Error(
      "Le texte doit être renseigné, sans ligne vide ni marqueur de temps.",
    );
  return { id: cue.id, start: cue.start, end: cue.end, text: cue.text.trim() };
}
export function parseSrt(raw) {
  if (typeof raw !== "string" || raw.length > 1000000)
    throw new Error("Fichier SRT trop volumineux.");
  const normalized = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!normalized) throw new Error("Le fichier SRT est vide.");
  const blocks = normalized.split(/\n[ \t]*\n+/);
  if (blocks.length > 500)
    throw new Error("La démonstration est limitée à 500 passages.");
  const seen = new Set();
  return blocks.map((block, index) => {
    const [number, timing, ...lines] = block.split("\n");
    if (!/^\d+$/.test(number) || +number < 1 || seen.has(+number))
      throw new Error(`Bloc ${index + 1} : numéro absent ou répété.`);
    seen.add(+number);
    const match =
      /^(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})$/.exec(
        timing || "",
      );
    if (!match)
      throw new Error(`Bloc ${index + 1} : horodatage SRT non reconnu.`);
    return validateCue({
      id: `s${index + 1}`,
      start: parseTime(match[1]),
      end: parseTime(match[2]),
      text: lines.join("\n"),
    });
  });
}
export function validateRules(rules) {
  if (
    !rules ||
    !Number.isSafeInteger(rules.videoMs) ||
    rules.videoMs < 1000 ||
    rules.videoMs > LIMIT ||
    !Number.isFinite(rules.maxCps) ||
    rules.maxCps < 1 ||
    rules.maxCps > 100 ||
    !Number.isInteger(rules.maxLine) ||
    rules.maxLine < 10 ||
    rules.maxLine > 120 ||
    !Number.isSafeInteger(rules.minMs) ||
    !Number.isSafeInteger(rules.maxMs) ||
    rules.minMs < 100 ||
    rules.maxMs > 60000 ||
    rules.minMs > rules.maxMs
  )
    throw new Error(
      "Règles invalides : durée vidéo 1 s à 3 h, vitesse 1 à 100, ligne 10 à 120, durées 0,1 à 60 s.",
    );
  return Object.fromEntries(
    Object.keys(DEFAULT_RULES).map((key) => [key, rules[key]]),
  );
}
export function cueFingerprint(cue, rules) {
  return JSON.stringify([cue.start, cue.end, cue.text, validateRules(rules)]);
}
export function metrics(cue) {
  const characters = Array.from(cue.text.replace(/\n/g, " ")).length;
  return {
    characters,
    cps: characters / ((cue.end - cue.start) / 1000),
    maxLine: Math.max(
      ...cue.text.split("\n").map((line) => Array.from(line).length),
    ),
    duration: (cue.end - cue.start) / 1000,
  };
}
export function inspect(state) {
  return state.cues.map((cue, index) => {
    const hard = [],
      warnings = [],
      m = metrics(cue);
    if (cue.end > state.rules.videoMs)
      hard.push("Sortie au-delà de la vidéo déclarée");
    if (index > 0 && cue.start < state.cues[index - 1].start)
      hard.push("Ordre des entrées décroissant");
    for (const other of state.cues) {
      if (
        other.id !== cue.id &&
        Math.max(cue.start, other.start) < Math.min(cue.end, other.end)
      )
        hard.push(
          `Chevauchement avec le passage ${state.cues.indexOf(other) + 1} (${((Math.min(cue.end, other.end) - Math.max(cue.start, other.start)) / 1000).toFixed(3)} s)`,
        );
    }
    if (m.cps > state.rules.maxCps)
      warnings.push(
        `Vitesse ${m.cps.toFixed(1)} > ${state.rules.maxCps} car./s`,
      );
    if (m.maxLine > state.rules.maxLine)
      warnings.push(
        `Ligne de ${m.maxLine} > ${state.rules.maxLine} caractères`,
      );
    if (
      m.duration * 1000 < state.rules.minMs ||
      m.duration * 1000 > state.rules.maxMs
    )
      warnings.push("Durée hors intervalle configuré");
    const waiver = state.waivers[cue.id];
    const accepted =
      warnings.length > 0 &&
      !!waiver &&
      waiver.fingerprint === cueFingerprint(cue, state.rules);
    return {
      cue,
      index,
      hard,
      warnings,
      accepted,
      note: accepted ? waiver.note : "",
      ...m,
    };
  });
}
export function canExport(state) {
  return inspect(state).every(
    (row) => !row.hard.length && (!row.warnings.length || row.accepted),
  );
}
export function importSrt(state, raw, filename = "import.srt") {
  const cues = parseSrt(raw);
  return {
    version: 1,
    filename: String(filename).slice(0, 120),
    cues,
    baseline: structuredClone(cues),
    rules: {
      ...state.rules,
      videoMs: Math.max(state.rules.videoMs, ...cues.map((c) => c.end)),
    },
    waivers: {},
    log: [],
  };
}
export function editCue(state, id, patch) {
  const original = state.cues.find((c) => c.id === id);
  if (!original) throw new Error("Passage introuvable.");
  const next = validateCue({ ...original, ...patch, id });
  if (JSON.stringify(original) === JSON.stringify(next)) return state;
  return {
    ...state,
    cues: state.cues.map((c) => (c.id === id ? next : c)),
    waivers: { ...state.waivers, [id]: null },
    log: [
      ...state.log,
      { action: "Passage modifié", ids: [id], before: original, after: next },
    ],
  };
}
export function shiftCues(state, ids, delta) {
  if (!ids.length || !Number.isSafeInteger(delta) || Math.abs(delta) > 600000)
    throw new Error(
      "Sélectionnez au moins un passage et un décalage de −600 à 600 secondes.",
    );
  const selected = new Set(ids);
  if (ids.some((id) => !state.cues.some((c) => c.id === id)))
    throw new Error("Sélection périmée.");
  const cues = state.cues.map((c) =>
    selected.has(c.id)
      ? validateCue({ ...c, start: c.start + delta, end: c.end + delta })
      : c,
  );
  if (!delta) return state;
  return {
    ...state,
    cues,
    waivers: Object.fromEntries(
      Object.entries(state.waivers).filter(([id]) => !selected.has(id)),
    ),
    log: [
      ...state.log,
      { action: `Décalage de ${delta / 1000} s`, ids: [...selected] },
    ],
  };
}
export function parseOffset(seconds) {
  if (!/^-?\d+(?:\.\d{1,3})?$/.test(String(seconds).trim()))
    throw new Error(
      "Indiquez un décalage en secondes, avec trois décimales au maximum.",
    );
  const delta = Math.round(Number(seconds) * 1000);
  if (!Number.isSafeInteger(delta) || Math.abs(delta) > 600000)
    throw new Error("Le décalage doit rester entre −600 et 600 secondes.");
  return delta;
}
export function changeRules(state, rules) {
  const next = validateRules(rules);
  if (JSON.stringify(next) === JSON.stringify(state.rules)) return state;
  return {
    ...state,
    rules: next,
    waivers: {},
    log: [...state.log, { action: "Paramètres de lecture modifiés", ids: [] }],
  };
}
export function acceptReading(state, id, note) {
  const row = inspect(state).find((r) => r.cue.id === id);
  if (!row || row.hard.length || !row.warnings.length)
    throw new Error(
      "Une dérogation concerne uniquement des règles de lecture, sans anomalie temporelle.",
    );
  if (typeof note !== "string" || note.trim().length < 8 || note.length > 1000)
    throw new Error("Expliquez la dérogation en au moins huit caractères.");
  return {
    ...state,
    waivers: {
      ...state.waivers,
      [id]: {
        note: note.trim(),
        fingerprint: cueFingerprint(row.cue, state.rules),
      },
    },
    log: [
      ...state.log,
      { action: "Dérogation de lecture motivée", ids: [id], note: note.trim() },
    ],
  };
}
export function srtText(state) {
  if (!canExport(state))
    throw new Error(
      "Corrigez les anomalies temporelles et traitez les règles de lecture avant export.",
    );
  return (
    state.cues
      .map(
        (c, i) =>
          `${i + 1}\r\n${formatTime(c.start)} --> ${formatTime(c.end)}\r\n${c.text.replace(/\n/g, "\r\n")}`,
      )
      .join("\r\n\r\n") + "\r\n"
  );
}
export const REPORT_HEADERS = [
  "passage",
  "entree_initiale",
  "sortie_initiale",
  "texte_initial",
  "entree_actuelle",
  "sortie_actuelle",
  "texte_actuel",
  "caracteres_par_seconde",
  "anomalies_temporelles",
  "regles_de_lecture",
  "derogation_active",
];
export function reportRows(state) {
  return inspect(state).map((r) => {
    const old = state.baseline.find((c) => c.id === r.cue.id);
    return [
      r.index + 1,
      formatTime(old.start),
      formatTime(old.end),
      old.text,
      formatTime(r.cue.start),
      formatTime(r.cue.end),
      r.cue.text,
      r.cps.toFixed(2),
      r.hard.join(" / "),
      r.warnings.join(" / "),
      r.note,
    ];
  });
}
export function restore(raw) {
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new Error("Le dossier JSON ne peut pas être lu.");
  }
  if (
    !v ||
    v.version !== 1 ||
    typeof v.filename !== "string" ||
    !Array.isArray(v.cues) ||
    v.cues.length < 1 ||
    v.cues.length > 500 ||
    !Array.isArray(v.baseline) ||
    v.baseline.length !== v.cues.length ||
    !Array.isArray(v.log) ||
    v.log.length > 5000 ||
    !v.waivers ||
    typeof v.waivers !== "object" ||
    Array.isArray(v.waivers)
  )
    throw new Error("Structure de dossier non reconnue.");
  const cues = v.cues.map(validateCue),
    baseline = v.baseline.map(validateCue),
    rules = validateRules(v.rules);
  if (
    new Set(cues.map((c) => c.id)).size !== cues.length ||
    cues.some((c, i) => c.id !== baseline[i].id)
  )
    throw new Error(
      "Les passages et leur version initiale ne correspondent pas.",
    );
  const waivers = {};
  for (const [id, waiver] of Object.entries(v.waivers)) {
    if (waiver === null) continue;
    if (
      !cues.some((c) => c.id === id) ||
      typeof waiver?.note !== "string" ||
      waiver.note.trim().length < 8 ||
      waiver.note.length > 1000 ||
      typeof waiver.fingerprint !== "string"
    )
      throw new Error("Dérogation non reconnue.");
    waivers[id] = { note: waiver.note, fingerprint: waiver.fingerprint };
  }
  const log = v.log.map((entry) => {
    if (
      typeof entry.action !== "string" ||
      entry.action.length > 200 ||
      !Array.isArray(entry.ids) ||
      entry.ids.some((id) => !cues.some((c) => c.id === id))
    )
      throw new Error("Journal non reconnu.");
    return {
      action: entry.action,
      ids: entry.ids,
      ...(typeof entry.note === "string"
        ? { note: entry.note.slice(0, 1000) }
        : {}),
    };
  });
  return {
    version: 1,
    filename: v.filename.slice(0, 120),
    cues,
    baseline,
    rules,
    waivers,
    log,
  };
}
export function seed() {
  const definitions = [
    [0, 4200, "Bienvenue dans notre atelier."],
    [4800, 8500, "Nous préparons la prochaine livraison."],
    [9000, 13400, "Chaque série suit\nle même parcours de contrôle."],
    [12600, 16800, "Le colis rejoint ensuite\nla zone de départ."],
    [18000, 22000, "La date reste à confirmer."],
    [
      23000,
      25300,
      "Toutes les références sont vérifiées une dernière fois avant que le transporteur ne prenne en charge la commande.",
    ],
    [28000, 34000, "Vous recevrez le récapitulatif\nà la fin de la visite."],
    [35000, 39700, "Merci. Nous pouvons maintenant avancer."],
  ];
  const cues = definitions.map(([start, end, text], i) => ({
    id: `s${i + 1}`,
    start,
    end,
    text,
  }));
  return {
    version: 1,
    filename: "visite-atelier-exemple.srt",
    cues,
    baseline: structuredClone(cues),
    rules: { ...DEFAULT_RULES },
    waivers: {},
    log: [],
  };
}

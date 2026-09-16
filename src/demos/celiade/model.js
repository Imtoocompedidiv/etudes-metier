export const SCHEMA = "celiade-inventaire-v1";
const DAY = 86400000;
export function day(value, label = "Date") {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value))
    throw new Error(
      `${label} attendue au format AAAA-MM-JJ, entre 2000 et 2099.`,
    );
  const n = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value)
    throw new Error(`${label} impossible.`);
  return n / DAY;
}
export const iso = (value) => new Date(value * DAY).toISOString().slice(0, 10);
export function dateLabel(value, short = false) {
  if (!value) return "Non définie";
  return new Intl.DateTimeFormat(
    "fr-FR",
    short
      ? { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }
      : { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
  ).format(new Date(day(value) * DAY));
}
const text = (v, label, max = 180) => {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    /[\u0000-\u001f]/.test(v)
  )
    throw new Error(`${label} requis, ${max} caractères maximum.`);
  return v.trim();
};
const int = (v, label, min, max) => {
  if (
    v === "" ||
    v === null ||
    !Number.isInteger(Number(v)) ||
    Number(v) < min ||
    Number(v) > max
  )
    throw new Error(`${label} : entier de ${min} à ${max} attendu.`);
  return Number(v);
};
export function parseSettings(settings, meeting) {
  const duration = int(settings?.duration, "Durée", 1, 1440);
  const shortDays = int(settings?.shortDays, "Délai jusqu’à 5 h", 1, 60);
  const longDays = int(settings?.longDays, "Délai au-delà de 5 h", 1, 60);
  const preparedOn = settings?.preparedOn;
  if (day(preparedOn, "Date de préparation") < day(meeting, "Date de réunion"))
    throw new Error(
      "La préparation doit être postérieure ou égale à la réunion.",
    );
  if (!Array.isArray(settings.closed) || settings.closed.length > 100)
    throw new Error("Au plus 100 dates de fermeture sont acceptées.");
  const closed = [
    ...new Set(
      settings.closed.map((d) => {
        day(d, "Jour fermé");
        return d;
      }),
    ),
  ].sort();
  return { duration, shortDays, longDays, preparedOn, closed };
}
export function initialState() {
  const v = (name, checked = true, receivedOn = "2026-09-15", note = "") => ({
    name,
    checked,
    receivedOn,
    note,
  });
  return {
    schema: SCHEMA,
    title: "Réunion de septembre",
    meeting: "2026-09-14",
    settings: {
      duration: 285,
      shortDays: 8,
      longDays: 10,
      preparedOn: "2026-09-16",
      closed: ["2026-09-21"],
    },
    pieces: [
      {
        id: "audio",
        label: "Audio réunion",
        required: true,
        versions: [v("reunion-septembre.mp3")],
      },
      {
        id: "presences",
        label: "Présences",
        required: true,
        versions: [v("presences.pdf")],
      },
      {
        id: "odj",
        label: "Ordre du jour",
        required: true,
        versions: [
          v("ordre-du-jour-v1.pdf"),
          v(
            "ordre-du-jour-v2.pdf",
            false,
            "2026-09-16",
            "Ajout de l’annexe budget à l’ordre du jour.",
          ),
        ],
      },
      {
        id: "modele",
        label: "Modèle de PV",
        required: true,
        versions: [v("modele-pv.docx")],
      },
      {
        id: "consignes",
        label: "Consignes",
        required: true,
        versions: [v("consignes-redaction.txt")],
      },
      { id: "annexe", label: "Annexe budget", required: true, versions: [] },
    ],
    journal: [],
    release: null,
  };
}
export function restoreState(raw) {
  const d = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (
    d?.schema !== SCHEMA ||
    !Array.isArray(d.pieces) ||
    !d.pieces.length ||
    d.pieces.length > 40 ||
    !Array.isArray(d.journal) ||
    d.journal.length > 200
  )
    throw new Error("Inventaire Céliade non reconnu ou trop volumineux.");
  text(d.title, "Titre");
  day(d.meeting, "Date de réunion");
  const settings = parseSettings(d.settings, d.meeting),
    ids = new Set();
  const pieces = d.pieces.map((p) => {
    const id = text(p?.id, "Identifiant", 80),
      label = text(p?.label, "Nom de pièce");
    if (
      ids.has(id) ||
      typeof p.required !== "boolean" ||
      !Array.isArray(p.versions) ||
      p.versions.length > 30
    )
      throw new Error("Pièce dupliquée ou historique invalide.");
    ids.add(id);
    let previousDay = -Infinity;
    const versions = p.versions.map((v) => {
      const name = text(v?.name, "Nom de fichier");
      const receivedOn = v?.receivedOn;
      const n = day(receivedOn, "Réception");
      if (n < previousDay || n > day(settings.preparedOn))
        throw new Error(
          "Les réceptions doivent suivre leur ordre et ne pas dépasser la date de préparation.",
        );
      if (
        typeof v.checked !== "boolean" ||
        typeof v.note !== "string" ||
        v.note.length > 500 ||
        /[\u0000-\u0008]/.test(v.note)
      )
        throw new Error("Contrôle ou note de réception invalide.");
      previousDay = n;
      return { name, receivedOn, checked: v.checked, note: v.note };
    });
    return { id, label, required: p.required, versions };
  });
  const journal = d.journal.map((j) => ({
    index: int(j?.index, "Numéro de journal", 1, 1000000),
    text: text(j?.text, "Entrée du journal", 500),
  }));
  let release = null;
  if (d.release != null) {
    if (
      typeof d.release.fingerprint !== "string" ||
      d.release.fingerprint.length > 100000
    )
      throw new Error("Fiche de départ invalide.");
    day(d.release.start);
    day(d.release.end);
    release = {
      fingerprint: d.release.fingerprint,
      start: d.release.start,
      end: d.release.end,
    };
  }
  return {
    schema: SCHEMA,
    title: d.title,
    meeting: d.meeting,
    settings,
    pieces,
    journal,
    release,
  };
}
export const validState = (raw) => {
  try {
    restoreState(raw);
    return true;
  } catch {
    return false;
  }
};
export const latest = (piece) => piece.versions.at(-1);
export function pieceStatus(piece) {
  return !latest(piece)
    ? piece.required
      ? "missing"
      : "optional"
    : latest(piece).checked
      ? "checked"
      : "review";
}
export const statusLabel = (status) =>
  ({
    missing: "Manquante",
    optional: "Facultative",
    checked: "Contrôlé",
    review: "À recontrôler",
  })[status];
export const blockers = (d) =>
  d.pieces.filter((p) => p.required && pieceStatus(p) !== "checked");
export function fingerprint(d) {
  return JSON.stringify([
    d.title,
    d.meeting,
    [
      d.settings.duration,
      d.settings.shortDays,
      d.settings.longDays,
      d.settings.preparedOn,
      [...d.settings.closed].sort(),
    ],
    d.pieces.map((p) => {
      const v = latest(p);
      return [
        p.id,
        p.label,
        p.required,
        p.versions.length,
        v ? [v.name, v.receivedOn, v.checked, v.note] : null,
      ];
    }),
  ]);
}
export function productionCalendar(d) {
  const settings = parseSettings(d.settings, d.meeting);
  const start = settings.preparedOn;
  const count =
    settings.duration <= 300 ? settings.shortDays : settings.longDays;
  const closed = new Set(settings.closed),
    days = [];
  let cursor = day(start),
    worked = 0;
  while (worked < count) {
    cursor++;
    const date = iso(cursor),
      weekday = new Date(cursor * DAY).getUTCDay();
    const kind = closed.has(date)
      ? "closed"
      : weekday === 0 || weekday === 6
        ? "weekend"
        : "work";
    if (kind === "work") worked++;
    days.push({ date, kind, workday: kind === "work" ? worked : null });
    if (days.length > 500)
      throw new Error("Calendrier trop long pour cet exemple.");
  }
  return { start, end: iso(cursor), count, days };
}
export function releaseIsCurrent(d) {
  if (
    !d.release ||
    d.release.fingerprint !== fingerprint(d) ||
    blockers(d).length
  )
    return false;
  const cal = productionCalendar(d);
  return cal.start === d.release.start && cal.end === d.release.end;
}
function log(d, message) {
  return [
    ...d.journal,
    { index: (d.journal.at(-1)?.index || 0) + 1, text: message },
  ].slice(-200);
}
export function receiveVersion(d, id, entry) {
  const piece = d.pieces.find((p) => p.id === id);
  if (!piece) throw new Error("Pièce introuvable.");
  if (piece.versions.length >= 30)
    throw new Error("Au plus 30 versions par pièce dans cet exemple.");
  const name = text(entry.name, "Nom du fichier");
  const n = day(entry.receivedOn, "Réception");
  if (
    n > day(d.settings.preparedOn) ||
    (latest(piece) && n < day(latest(piece).receivedOn))
  )
    throw new Error(
      "Réception attendue après la version précédente et au plus tard à la date de préparation.",
    );
  if (typeof entry.note !== "string" || entry.note.length > 500)
    throw new Error("Note limitée à 500 caractères.");
  return {
    ...d,
    pieces: d.pieces.map((p) =>
      p.id === id
        ? {
            ...p,
            versions: [
              ...p.versions,
              {
                name,
                receivedOn: entry.receivedOn,
                note: entry.note,
                checked: false,
              },
            ],
          }
        : p,
    ),
    journal: log(
      d,
      `${piece.label} : réception déclarée, version ${piece.versions.length + 1} à contrôler.`,
    ),
  };
}
export function checkVersion(d, id, checked) {
  const piece = d.pieces.find((p) => p.id === id);
  if (!latest(piece || { versions: [] }))
    throw new Error("Une réception doit être déclarée avant son contrôle.");
  return {
    ...d,
    pieces: d.pieces.map((p) =>
      p.id === id
        ? {
            ...p,
            versions: p.versions.map((v, i) =>
              i === p.versions.length - 1
                ? { ...v, checked: Boolean(checked) }
                : v,
            ),
          }
        : p,
    ),
    journal: log(
      d,
      `${piece.label} : version ${piece.versions.length} ${checked ? "contrôlée" : "remise en examen"}.`,
    ),
  };
}
export function applySettings(d, input) {
  const settings = parseSettings(input, d.meeting);
  for (const p of d.pieces)
    if (latest(p) && day(latest(p).receivedOn) > day(settings.preparedOn))
      throw new Error(
        "La date de préparation ne peut précéder une réception déclarée.",
      );
  return {
    ...d,
    settings,
    journal: log(
      d,
      "Paramètres de production modifiés ; fiche de départ à confirmer.",
    ),
  };
}
export function addPiece(d, label) {
  if (d.pieces.length >= 40)
    throw new Error("Au plus 40 pièces dans cet exemple.");
  label = text(label, "Nom de la nouvelle pièce");
  if (
    d.pieces.some(
      (p) => p.label.toLocaleLowerCase("fr") === label.toLocaleLowerCase("fr"),
    )
  )
    throw new Error("Une pièce porte déjà ce nom.");
  let number = 1;
  while (d.pieces.some((p) => p.id === `piece-${number}`)) number++;
  return {
    ...d,
    pieces: [
      ...d.pieces,
      { id: `piece-${number}`, label, required: true, versions: [] },
    ],
    journal: log(d, `${label} ajoutée aux pièces attendues.`),
  };
}
export function fixDeparture(d) {
  if (blockers(d).length)
    throw new Error(
      "Toutes les pièces obligatoires doivent être reçues et contrôlées.",
    );
  const { start, end } = productionCalendar(d);
  return {
    ...d,
    release: { start, end, fingerprint: fingerprint(d) },
    journal: log(
      d,
      `Départ déclaré au ${dateLabel(start, true)} ; production indicative au ${dateLabel(end, true)}.`,
    ),
  };
}
export function requestText(d) {
  const needs = blockers(d);
  if (!needs.length)
    return "Toutes les pièces attendues de cet inventaire sont reçues et contrôlées. Aucune demande complémentaire à préparer.";
  return `Bonjour,\n\nPour préparer le dossier de la réunion du ${dateLabel(d.meeting)}, il reste les éléments suivants à régler :\n\n${needs.map((p) => (pieceStatus(p) === "missing" ? `• ${p.label} : pièce attendue, sans réception déclarée.` : `• ${p.label} : version ${p.versions.length} (${latest(p).name}) reçue, contrôle ou confirmation de version à finaliser.`)).join("\n")}\n\nMerci pour votre retour.\n\nBrouillon fondé sur l’inventaire courant. À adapter avant toute transmission.`;
}

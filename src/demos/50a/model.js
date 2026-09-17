import { parseCsv } from "../../shared/files.js";

export const CONTENT_HEADERS = [
  "id",
  "titre",
  "etape",
  "etat",
  "disponible_le",
];
export const INITIATIVE_HEADERS = [
  "id",
  "titre",
  "responsable",
  "debut",
  "fin",
  "heures",
  "contenus",
  "prealables",
];
export const STAGES = ["Découverte", "Réassurance", "Décision"];
export const STATES = ["Prêt", "À créer"];
const DAY = 86400000;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const fail = (message) => {
  throw new Error(message);
};
function text(value, label, max = 100) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f]/.test(value)
  )
    fail(
      `${label} doit contenir de 1 à ${max} caractères, sans retour à la ligne.`,
    );
  return value.trim();
}
function id(value, label) {
  const result = text(value, label, 40);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(result) ||
    ["__proto__", "constructor", "prototype"].includes(result)
  )
    fail(`${label} contient un identifiant non accepté.`);
  return result;
}
function shape(value, fields, label) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.keys(value).some((k) => !fields.includes(k)) ||
    fields.some((k) => !own(value, k))
  )
    fail(`${label} ne respecte pas les colonnes attendues.`);
}
export function dateNumber(value) {
  if (typeof value !== "string" || !/^(20\d{2})-\d{2}-\d{2}$/.test(value))
    fail("Date attendue au format AAAA-MM-JJ, entre 2000 et 2099.");
  const n = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value)
    fail(`Date impossible : ${value}.`);
  return n / DAY;
}
export const dateString = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export function displayDate(value) {
  return value.split("-").reverse().join("/");
}
export function hundredths(value, label, max = 10000) {
  const string = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(string))
    fail(`${label} doit être un nombre positif avec deux décimales au plus.`);
  const [whole, dec = ""] = string.split(".");
  const result = Number(whole) * 100 + Number(dec.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > max * 100)
    fail(`${label} dépasse ${max} heures.`);
  return result;
}
export const hours = (n) =>
  (n / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const numberHours = (n) => n / 100;
function refs(value) {
  if (!Array.isArray(value) || value.length > 200)
    fail("Liste de références invalide.");
  const out = value.map((v) => id(v, "Référence"));
  if (new Set(out).size !== out.length)
    fail("Référence répétée dans une dépendance.");
  return out;
}
function list(value, parser, label) {
  if (!Array.isArray(value) || value.length > 200)
    fail(`${label} : 200 lignes au maximum.`);
  const out = value.map(parser);
  if (new Set(out.map((r) => r.id)).size !== out.length)
    fail(`${label} : identifiant répété.`);
  return out;
}
export function content(value) {
  shape(value, ["id", "title", "stage", "state", "ready"], "Contenu");
  if (!STAGES.includes(value.stage) || !STATES.includes(value.state))
    fail("Étape ou état de contenu inconnu.");
  dateNumber(value.ready);
  return {
    id: id(value.id, "Contenu"),
    title: text(value.title, "Titre"),
    stage: value.stage,
    state: value.state,
    ready: value.ready,
  };
}
export function workingDays(start, end) {
  const first = dateNumber(start),
    last = dateNumber(end);
  if (last < first || last - first > 180)
    fail("Une initiative doit durer de 1 à 181 jours calendaires.");
  const out = [];
  for (let n = first; n <= last; n++) {
    const weekday = new Date(n * DAY).getUTCDay();
    if (weekday !== 0 && weekday !== 6) out.push(n);
  }
  return out;
}
export function initiative(value) {
  shape(
    value,
    ["id", "title", "owner", "start", "end", "effort", "contents", "depends"],
    "Initiative",
  );
  if (!workingDays(value.start, value.end).length)
    fail("L’initiative doit comprendre au moins un jour du lundi au vendredi.");
  return {
    id: id(value.id, "Initiative"),
    title: text(value.title, "Titre"),
    owner: text(value.owner, "Responsable", 60),
    start: value.start,
    end: value.end,
    effort: numberHours(hundredths(value.effort, "Charge")),
    contents: refs(value.contents),
    depends: refs(value.depends),
  };
}
export function normalize(value) {
  shape(
    value,
    ["version", "contents", "initiatives", "capacities", "journal"],
    "Dossier",
  );
  if (value.version !== 1) fail("Version de dossier inconnue.");
  const contents = list(value.contents, content, "Contenus");
  const initiatives = list(value.initiatives, initiative, "Initiatives");
  const dates = initiatives.flatMap((i) => [
    dateNumber(i.start),
    dateNumber(i.end),
  ]);
  if (dates.length && Math.max(...dates) - Math.min(...dates) > 366)
    fail("Le programme doit tenir dans une période de 367 jours au maximum.");
  if (!Array.isArray(value.capacities) || value.capacities.length > 200)
    fail("Capacités invalides.");
  const capacities = value.capacities.map((c) => {
    shape(c, ["owner", "hours"], "Capacité");
    return {
      owner: text(c.owner, "Responsable", 60),
      hours: numberHours(hundredths(c.hours, "Capacité hebdomadaire", 168)),
    };
  });
  if (new Set(capacities.map((c) => c.owner)).size !== capacities.length)
    fail("Capacité répétée pour un responsable.");
  if (!Array.isArray(value.journal) || value.journal.length > 40)
    fail("Journal invalide.");
  return {
    version: 1,
    contents,
    initiatives,
    capacities,
    journal: value.journal.map((t) => text(t, "Journal", 300)),
  };
}
export function validDossier(value) {
  try {
    return JSON.stringify(value) === JSON.stringify(normalize(value));
  } catch {
    return false;
  }
}
export function restore(source) {
  if (source.length > 2 * 1024 * 1024) fail("Dossier limité à 2 Mo.");
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    fail("JSON illisible.");
  }
  return normalize(value);
}
function csvRows(source, headers) {
  const result = parseCsv(source, { requiredHeaders: headers, maxRows: 200 });
  if (
    result.headers.length !== headers.length ||
    result.headers.some((h) => !headers.includes(h))
  )
    fail("Utilisez exactement les colonnes du CSV fourni.");
  return result.rows;
}
export function importContents(source) {
  return list(
    csvRows(source, CONTENT_HEADERS).map((r) => ({
      id: r.id,
      title: r.titre,
      stage: r.etape,
      state: r.etat,
      ready: r.disponible_le,
    })),
    content,
    "Contenus",
  );
}
export function importInitiatives(source) {
  return list(
    csvRows(source, INITIATIVE_HEADERS).map((r) => ({
      id: r.id,
      title: r.titre,
      owner: r.responsable,
      start: r.debut,
      end: r.fin,
      effort: r.heures,
      contents: r.contenus ? r.contenus.split("|") : [],
      depends: r.prealables ? r.prealables.split("|") : [],
    })),
    initiative,
    "Initiatives",
  );
}
export const contentRows = (d) =>
  d.contents.map((c) => [c.id, c.title, c.stage, c.state, c.ready]);
export const initiativeRows = (d) =>
  d.initiatives.map((i) => [
    i.id,
    i.title,
    i.owner,
    i.start,
    i.end,
    i.effort,
    i.contents.join("|"),
    i.depends.join("|"),
  ]);
export function change(d, patch, note) {
  return normalize({
    ...d,
    ...patch,
    journal: [...d.journal, note].slice(-40),
  });
}
export function editContent(d, key, patch) {
  if (!d.contents.some((c) => c.id === key)) fail("Contenu introuvable.");
  return change(
    d,
    {
      contents: d.contents.map((c) =>
        c.id === key ? content({ ...c, ...patch, id: key }) : c,
      ),
    },
    `Contenu ${key} modifié.`,
  );
}
export function editInitiative(d, key, patch) {
  if (!d.initiatives.some((i) => i.id === key)) fail("Initiative introuvable.");
  return change(
    d,
    {
      initiatives: d.initiatives.map((i) =>
        i.id === key ? initiative({ ...i, ...patch, id: key }) : i,
      ),
    },
    `Initiative ${key} modifiée.`,
  );
}
function monday(day) {
  const wd = new Date(day * DAY).getUTCDay();
  return day - ((wd + 6) % 7);
}
export function weekLabel(start) {
  const thursday = start + 3;
  const year = new Date(thursday * DAY).getUTCFullYear();
  const firstThursday = Date.UTC(year, 0, 4) / DAY;
  return `${year} · S${String(1 + Math.round((start - monday(firstThursday)) / 7)).padStart(2, "0")}`;
}
export function analyse(d) {
  const byId = new Map(d.initiatives.map((i) => [i.id, i]));
  const byContent = new Map(d.contents.map((c) => [c.id, c]));
  const issues = [],
    add = (initiativeId, type, detail, severity = "block") =>
      issues.push({ initiativeId, type, detail, severity });
  // A reachability test identifies actual cycle members, not every upstream consumer.
  function reaches(start, current, seen) {
    if (seen.has(current)) return false;
    seen.add(current);
    for (const prior of byId.get(current)?.depends || []) {
      if (prior === start || reaches(start, prior, seen)) return true;
    }
    return false;
  }
  for (const i of d.initiatives) {
    if (reaches(i.id, i.id, new Set()))
      add(
        i.id,
        "Cycle",
        `Les préalables de ${i.id} reviennent à cette initiative.`,
      );
    for (const key of i.contents) {
      const c = byContent.get(key);
      if (!c)
        add(i.id, "Contenu absent", `${key} n’existe pas dans l’inventaire.`);
      else {
        if (c.ready > i.start)
          add(
            i.id,
            "Contenu trop tard",
            `${key} est disponible le ${displayDate(c.ready)}, après le début prévu le ${displayDate(i.start)}.`,
          );
        if (c.state !== "Prêt")
          add(
            i.id,
            "Contenu à valider",
            `${key} est encore à créer. Sa disponibilité reste prévisionnelle.`,
            "warning",
          );
      }
    }
    for (const key of i.depends) {
      const prior = byId.get(key);
      if (!prior)
        add(i.id, "Préalable absent", `${key} n’existe pas dans le programme.`);
      else if (prior.end >= i.start)
        add(
          i.id,
          "Dates incompatibles",
          `${key} finit le ${displayDate(prior.end)} ; ${i.id} doit commencer après cette date.`,
        );
    }
  }
  const blocked = new Set(
    issues.filter((i) => i.severity === "block").map((i) => i.initiativeId),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of d.initiatives) {
      if (!blocked.has(i.id) && i.depends.some((key) => blocked.has(key))) {
        blocked.add(i.id);
        changed = true;
      }
    }
  }
  for (const i of d.initiatives) {
    const blockedPrior = i.depends.filter((key) => blocked.has(key));
    if (
      blockedPrior.length &&
      !issues.some((x) => x.initiativeId === i.id && x.type === "Cycle")
    )
      add(
        i.id,
        "Blocage en amont",
        `Préalable à arbitrer : ${blockedPrior.join(", ")}.`,
      );
  }
  const dates = d.initiatives.flatMap((i) => [
    dateNumber(i.start),
    dateNumber(i.end),
  ]);
  const weeks = [];
  if (dates.length)
    for (let n = monday(Math.min(...dates)); n <= Math.max(...dates); n += 7)
      weeks.push({ start: n, date: dateString(n), label: weekLabel(n) });
  const owners = [...new Set(d.initiatives.map((i) => i.owner))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const loads = owners.map((owner) => {
    const totals = new Map(weeks.map((w) => [w.start, 0]));
    const contributions = [];
    for (const i of d.initiatives.filter((i) => i.owner === owner)) {
      const days = workingDays(i.start, i.end),
        units = hundredths(i.effort, "Charge");
      const base = Math.floor(units / days.length),
        remainder = units % days.length;
      days.forEach((day, index) => {
        const amount = base + (index < remainder ? 1 : 0);
        const week = monday(day);
        totals.set(week, totals.get(week) + amount);
        contributions.push({
          initiative: i.id,
          day: dateString(day),
          week: dateString(week),
          units: amount,
        });
      });
    }
    const capacity = d.capacities.find((c) => c.owner === owner);
    return {
      owner,
      capacity: capacity ? hundredths(capacity.hours, "Capacité", 168) : null,
      values: weeks.map((w) => totals.get(w.start)),
      contributions,
    };
  });
  return { issues, blocked, weeks, loads, owners };
}
export function seed() {
  return normalize({
    version: 1,
    contents: [
      {
        id: "C01",
        title: "Page offre principale",
        stage: "Décision",
        state: "Prêt",
        ready: "2026-09-07",
      },
      {
        id: "C02",
        title: "Étude de cas",
        stage: "Réassurance",
        state: "À créer",
        ready: "2026-09-18",
      },
      {
        id: "C03",
        title: "Guide méthodologique",
        stage: "Découverte",
        state: "À créer",
        ready: "2026-09-21",
      },
      {
        id: "C04",
        title: "Témoignage vidéo",
        stage: "Réassurance",
        state: "À créer",
        ready: "2026-10-09",
      },
      {
        id: "C05",
        title: "Grille des offres",
        stage: "Décision",
        state: "Prêt",
        ready: "2026-09-14",
      },
      {
        id: "C06",
        title: "Questions fréquentes",
        stage: "Réassurance",
        state: "Prêt",
        ready: "2026-09-07",
      },
    ],
    initiatives: [
      {
        id: "I01",
        title: "Refonte de la page offre",
        owner: "Alice",
        start: "2026-09-07",
        end: "2026-09-11",
        effort: 16,
        contents: ["C01"],
        depends: [],
      },
      {
        id: "I02",
        title: "Publication du cas client",
        owner: "Thomas",
        start: "2026-09-21",
        end: "2026-09-25",
        effort: 20,
        contents: ["C02"],
        depends: ["I01"],
      },
      {
        id: "I03",
        title: "Campagne du guide",
        owner: "Alice",
        start: "2026-09-21",
        end: "2026-10-02",
        effort: 24,
        contents: ["C03"],
        depends: ["I01"],
      },
      {
        id: "I04",
        title: "Relais témoignage",
        owner: "Thomas",
        start: "2026-10-05",
        end: "2026-10-16",
        effort: 32,
        contents: ["C04"],
        depends: ["I02", "I03"],
      },
      {
        id: "I05",
        title: "Révision du parcours",
        owner: "Alice",
        start: "2026-10-05",
        end: "2026-10-09",
        effort: 18,
        contents: ["C05"],
        depends: ["I06"],
      },
      {
        id: "I06",
        title: "Publication FAQ",
        owner: "Thomas",
        start: "2026-10-12",
        end: "2026-10-16",
        effort: 20,
        contents: ["C06"],
        depends: ["I05"],
      },
    ],
    capacities: [
      { owner: "Alice", hours: 18 },
      { owner: "Thomas", hours: 18 },
    ],
    journal: [],
  });
}

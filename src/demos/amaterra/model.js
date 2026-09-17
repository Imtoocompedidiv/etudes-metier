import { parseCsv } from "../../shared/files.js";

export const FORMULAS = {
  soufflets: {
    name: "Tunnel à soufflets",
    audience: "Enfants dès 7 ans",
    minutes: 90,
    paper: 3,
    weight: 160,
  },
  carte: {
    name: "Grande carte tunnel",
    audience: "Enfants dès 7 ans",
    minutes: 90,
    paper: 2,
    weight: 160,
  },
  adultes: {
    name: "Tunnel adultes / adolescents",
    audience: "Adolescents et adultes",
    minutes: 120,
    paper: null,
    weight: 120,
    capacity: 12,
  },
};
export const HEADERS = [
  "id",
  "groupe",
  "formule",
  "debut",
  "duree_min",
  "participants",
  "age_min",
  "salle",
  "intervenant",
  "capacite_enfants",
  "feuilles_adultes_par_personne",
  "public_adultes_confirme",
];
const text = (v, name, max = 100) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw Error(`${name} doit contenir entre 1 et ${max} caractères.`);
  return v.trim();
};
const num = (v, name, min, max, nullable = false) => {
  const blank = typeof v === "string" && v.trim() === "";
  if (nullable && (blank || v === null || v === undefined)) return null;
  if (
    blank ||
    (typeof v !== "number" && typeof v !== "string") ||
    !Number.isInteger(Number(v)) ||
    Number(v) < min ||
    Number(v) > max
  )
    throw Error(`${name} doit être un entier entre ${min} et ${max}.`);
  return Number(v);
};
export function minute(v) {
  if (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v))
    throw Error("Horaire attendu au format HH:MM, entre 00:00 et 23:59.");
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}
export const clock = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export function validateGroup(g) {
  if (!g || typeof g !== "object") throw Error("Groupe manquant.");
  const id = text(g.id, "Identifiant", 40);
  if (!/^[a-zA-Z0-9_-]+$/.test(id))
    throw Error(
      "Identifiant : lettres, chiffres, tirets et underscores uniquement.",
    );
  if (!Object.hasOwn(FORMULAS, g.formula))
    throw Error(`Formule inconnue pour ${id}.`);
  const start = clock(minute(g.start)),
    duration = num(g.duration, "Durée", 15, 360);
  if (minute(start) + duration > 1440)
    throw Error("Un atelier doit se terminer dans la journée.");
  if (typeof g.adultAudience !== "boolean")
    throw Error("La déclaration du public adultes doit être un booléen.");
  return {
    id,
    name: text(g.name, "Nom du groupe"),
    formula: g.formula,
    start,
    duration,
    count: num(g.count, "Participants", 1, 150),
    youngest: num(g.youngest, "Âge minimum", 0, 110, true),
    room: text(g.room, "Salle"),
    artist: text(g.artist, "Intervenant"),
    childCapacity: num(
      g.childCapacity,
      "Capacité enfants déclarée",
      1,
      150,
      true,
    ),
    adultPaper: num(g.adultPaper, "Feuilles adultes par personne", 1, 50, true),
    adultAudience: g.adultAudience,
  };
}
export const seed = {
  version: 1,
  date: "2026-10-17",
  place: "Médiathèque des Tilleuls",
  gap: 15,
  ratios: { scissors: 1, pencils: 1 },
  stocks: { paper160: 100, paper120: 0, scissors: 40, pencils: 40 },
  groups: [
    {
      id: "G1",
      name: "Groupe du matin",
      formula: "soufflets",
      start: "09:00",
      duration: 90,
      count: 16,
      youngest: 8,
      room: "Salle d’animation",
      artist: "Cécile",
      childCapacity: null,
      adultPaper: null,
      adultAudience: false,
    },
    {
      id: "G2",
      name: "Deuxième groupe",
      formula: "carte",
      start: "10:00",
      duration: 90,
      count: 18,
      youngest: 7,
      room: "Salle d’animation",
      artist: "Cécile",
      childCapacity: null,
      adultPaper: null,
      adultAudience: false,
    },
    {
      id: "G3",
      name: "Atelier adultes",
      formula: "adultes",
      start: "14:00",
      duration: 120,
      count: 12,
      youngest: null,
      room: "Salle d’animation",
      artist: "Cécile",
      childCapacity: null,
      adultPaper: null,
      adultAudience: false,
    },
  ],
  availability: "",
  reviewed: "",
};
export const programmeKey = (s) =>
  JSON.stringify([s.date, s.place, s.gap, s.groups]);
export const reviewKey = (s) =>
  JSON.stringify([programmeKey(s), s.ratios, s.stocks, s.availability]);
export function changeGroup(s, group) {
  const g = validateGroup(group);
  if (!s.groups.some((x) => x.id === g.id)) throw Error("Groupe introuvable.");
  return {
    ...s,
    groups: s.groups.map((x) => (x.id === g.id ? g : x)),
    availability: "",
    reviewed: "",
  };
}
export function removeGroup(s, id) {
  if (s.groups.length === 1) throw Error("Conservez au moins un groupe.");
  return {
    ...s,
    groups: s.groups.filter((g) => g.id !== id),
    availability: "",
    reviewed: "",
  };
}
export function addGroup(s) {
  if (s.groups.length >= 30)
    throw Error("Maximum 30 groupes pour une journée.");
  let n = 1;
  while (s.groups.some((g) => g.id === `G${n}`)) n++;
  return {
    ...s,
    groups: [
      ...s.groups,
      validateGroup({
        ...seed.groups[0],
        id: `G${n}`,
        name: `Nouveau groupe ${n}`,
        count: 12,
        start: "16:00",
      }),
    ],
    availability: "",
    reviewed: "",
  };
}
export function updateSettings(s, next) {
  const x = normalize({ ...s, ...next, availability: "", reviewed: "" });
  if (programmeKey(s) === programmeKey(x)) x.availability = s.availability;
  return x;
}
const same = (a, b) =>
  a.trim().toLocaleLowerCase("fr") === b.trim().toLocaleLowerCase("fr");
export function issues(s) {
  const out = [];
  for (const g of s.groups) {
    const f = FORMULAS[g.formula];
    if (g.duration < f.minutes)
      out.push({
        ids: [g.id],
        text: `${g.name} : ${g.duration} min prévues, la fiche présente ${f.minutes} min.`,
      });
    if (f.capacity && g.count > f.capacity)
      out.push({
        ids: [g.id],
        text: `${g.name} : ${g.count} personnes, au-delà des 12 de la formule adultes.`,
      });
    if (!f.capacity && (g.youngest === null || g.youngest < 7))
      out.push({
        ids: [g.id],
        text: `${g.name} : public à partir de 7 ans ; âge minimum ${g.youngest === null ? "non renseigné" : g.youngest + " ans"}.`,
      });
    if (!f.capacity && (g.childCapacity === null || g.count > g.childCapacity))
      out.push({
        ids: [g.id],
        text: `${g.name} : ${g.childCapacity === null ? "capacité enfants à déclarer avec le lieu" : `effectif supérieur à la capacité déclarée de ${g.childCapacity}`}.`,
      });
    if (f.capacity && !g.adultAudience)
      out.push({
        ids: [g.id],
        text: `${g.name} : adéquation du public adolescents / adultes à confirmer avec l’intervenant.`,
      });
    if (f.capacity && g.adultPaper === null)
      out.push({
        ids: [g.id],
        text: `${g.name} : quantité de papier A4 120 g par personne à définir.`,
      });
  }
  for (let i = 0; i < s.groups.length; i++)
    for (let j = i + 1; j < s.groups.length; j++) {
      const a = s.groups[i],
        b = s.groups[j],
        as = minute(a.start),
        bs = minute(b.start),
        ae = as + a.duration,
        be = bs + b.duration;
      if (
        as < be + s.gap &&
        bs < ae + s.gap &&
        (same(a.artist, b.artist) || same(a.room, b.room))
      ) {
        const overlap = as < be && bs < ae;
        out.push({
          ids: [a.id, b.id],
          text: `${a.name} et ${b.name} : ${overlap ? "chevauchement" : `intervalle inférieur aux ${s.gap} min déclarées`} ${same(a.artist, b.artist) ? `pour ${a.artist}` : ""}${same(a.artist, b.artist) && same(a.room, b.room) ? " et " : ""}${same(a.room, b.room) ? `dans ${a.room}` : ""}.`,
        });
      }
    }
  return out;
}
export function peak(s, ratio) {
  const events = s.groups
    .flatMap((g) => [
      [minute(g.start), Math.ceil(g.count / ratio)],
      [minute(g.start) + g.duration + s.gap, -Math.ceil(g.count / ratio)],
    ])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let running = 0,
    maximum = 0;
  for (const [, delta] of events) {
    running += delta;
    maximum = Math.max(maximum, running);
  }
  return maximum;
}
export function supplies(s) {
  const children = s.groups.filter((g) => g.formula !== "adultes"),
    adults = s.groups.filter((g) => g.formula === "adultes");
  const paper160 = children.reduce(
    (n, g) => n + g.count * FORMULAS[g.formula].paper,
    0,
  );
  const missing = adults.some((g) => g.adultPaper === null),
    known = adults.reduce((n, g) => n + g.count * (g.adultPaper || 0), 0);
  return [
    {
      id: "paper160",
      name: "Papier A4 160 g",
      required: paper160,
      known: paper160,
      unit: "feuilles",
      rule:
        children
          .map((g) => `${g.name} : ${g.count} × ${FORMULAS[g.formula].paper}`)
          .join(" + ") || "Aucun groupe enfants.",
    },
    {
      id: "paper120",
      name: "Papier A4 120 g",
      required: missing ? null : known,
      known,
      unit: "feuilles",
      rule: missing
        ? `Quantité adultes à définir. ${known} feuilles déjà renseignées.`
        : adults
            .map((g) => `${g.name} : ${g.count} × ${g.adultPaper}`)
            .join(" + ") || "Aucun groupe adultes.",
    },
    ...[
      ["scissors", "Ciseaux"],
      ["pencils", "Crayons"],
    ].map(([id, name]) => ({
      id,
      name,
      required: peak(s, s.ratios[id]),
      known: peak(s, s.ratios[id]),
      unit: "pièces",
      rule: `Hypothèse déclarée : 1 pour ${s.ratios[id]} personne${s.ratios[id] > 1 ? "s" : ""}, pic simultané, remise en place de ${s.gap} min incluse.`,
    })),
  ].map((row) => ({
    ...row,
    stock: s.stocks[row.id],
    shortage:
      row.required === null
        ? null
        : Math.max(0, row.required - s.stocks[row.id]),
  }));
}
export function checks(s) {
  const list = issues(s).map((x) => x.text);
  for (const r of supplies(s))
    if (r.shortage > 0)
      list.push(
        `${r.name} : ${r.shortage} ${r.unit} à prévoir en plus du stock déclaré.`,
      );
  if (s.availability !== programmeKey(s))
    list.push(
      "Disponibilité de l’intervenant et du lieu à confirmer pour cette version du programme.",
    );
  return list;
}
export function review(s) {
  if (checks(s).length)
    throw Error(
      "Résolvez les points à confirmer et les manques avant de marquer la préparation revue.",
    );
  return { ...s, reviewed: reviewKey(s) };
}
export const isReviewed = (s) =>
  s.reviewed === reviewKey(s) && checks(s).length === 0;
export const groupRows = (s) =>
  s.groups.map((g) => [
    g.id,
    g.name,
    g.formula,
    g.start,
    g.duration,
    g.count,
    g.youngest ?? "",
    g.room,
    g.artist,
    g.childCapacity ?? "",
    g.adultPaper ?? "",
    g.adultAudience ? "oui" : "non",
  ]);
export function importGroups(raw, s) {
  const { rows } = parseCsv(raw, { requiredHeaders: HEADERS, maxRows: 30 });
  if (!rows.length) throw Error("Le fichier ne contient aucun groupe.");
  const groups = rows.map((r, i) => {
    if (!["oui", "non"].includes(r.public_adultes_confirme))
      throw Error(
        `Ligne ${i + 2} : public_adultes_confirme doit être oui ou non.`,
      );
    return validateGroup({
      id: r.id,
      name: r.groupe,
      formula: r.formule,
      start: r.debut,
      duration: r.duree_min,
      count: r.participants,
      youngest: r.age_min,
      room: r.salle,
      artist: r.intervenant,
      childCapacity: r.capacite_enfants,
      adultPaper: r.feuilles_adultes_par_personne,
      adultAudience: r.public_adultes_confirme === "oui",
    });
  });
  if (new Set(groups.map((g) => g.id)).size !== groups.length)
    throw Error("Chaque groupe doit avoir un identifiant unique.");
  return { ...s, groups, availability: "", reviewed: "" };
}
export function normalize(s) {
  if (
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.groups) ||
    !s.groups.length ||
    s.groups.length > 30
  )
    throw Error("Dossier Amaterra version 1 attendu, avec 1 à 30 groupes.");
  if (
    typeof s.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(s.date) ||
    !Number.isFinite(Date.parse(s.date + "T12:00:00Z")) ||
    new Date(s.date + "T12:00:00Z").toISOString().slice(0, 10) !== s.date
  )
    throw Error("Date civile invalide.");
  const groups = s.groups.map(validateGroup);
  if (new Set(groups.map((g) => g.id)).size !== groups.length)
    throw Error("Identifiants de groupes en double.");
  const stocks = {},
    ratios = {};
  for (const id of ["paper160", "paper120", "scissors", "pencils"])
    stocks[id] = num(s.stocks?.[id], `Stock ${id}`, 0, 100000);
  for (const id of ["scissors", "pencils"])
    ratios[id] = num(s.ratios?.[id], `Partage ${id}`, 1, 10);
  const result = {
    version: 1,
    date: s.date,
    place: text(s.place, "Lieu", 150),
    gap: num(s.gap, "Remise en place", 0, 120),
    groups,
    stocks,
    ratios,
    availability: "",
    reviewed: "",
  };
  if (s.availability === programmeKey(result))
    result.availability = s.availability;
  if (s.reviewed === reviewKey(result) && checks(result).length === 0)
    result.reviewed = s.reviewed;
  return result;
}
export function restore(raw) {
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    throw Error("Le fichier JSON est illisible.");
  }
  return normalize(s);
}
export const supplyRows = (s) =>
  supplies(s).map((r) => [
    r.name,
    r.required ?? "à confirmer",
    r.known,
    r.stock,
    r.shortage ?? "à confirmer",
    r.unit,
    r.rule,
  ]);
export function report(s) {
  const unresolved = checks(s);
  return {
    title: `Journée d’ateliers · ${s.place}`,
    subtitle: `${s.date} · ${isReviewed(s) ? "Préparation revue (déclaration)" : "Brouillon avec réserves"} · Groupes fictifs, prototype indépendant. Aucune réservation ni confirmation de disponibilité externe.`,
    sections: [
      {
        title: "Programme",
        headers: [
          "Groupe",
          "Formule",
          "Horaire",
          "Participants",
          "Public",
          "Salle",
          "Intervenant",
        ],
        rows: s.groups
          .slice()
          .sort((a, b) => minute(a.start) - minute(b.start))
          .map((g) => [
            g.name,
            FORMULAS[g.formula].name,
            `${g.start}–${clock(minute(g.start) + g.duration)}`,
            g.count,
            FORMULAS[g.formula].audience,
            g.room,
            g.artist,
          ]),
      },
      {
        title: "Fournitures à prévoir",
        headers: [
          "Fourniture",
          "Besoin",
          "Quantité déjà définie",
          "Stock déclaré",
          "Manque",
          "Unité",
          "Calcul",
        ],
        rows: supplyRows(s),
      },
      {
        title: "Réserves et déclarations",
        paragraphs: unresolved.length
          ? unresolved
          : [
              "Les contrôles de cet exemple sont renseignés. Cela ne remplace pas la confirmation de l’artiste et du lieu.",
            ],
      },
      {
        title: "Conditions et limites",
        paragraphs: [
          `Temps de remise en place déclaré : ${s.gap} min (paramètre illustratif). Les outils sont mutualisés au pic, remise en place incluse. La disponibilité est ${s.availability === programmeKey(s) ? "déclarée pour cette version" : "à confirmer"}.`,
          "Les quantités de papier enfants (3 ou 2 feuilles A4 160 g), durées (90 / 120 min) et limite de 12 adultes viennent de la présentation publique de Cécile Jacoud. Quantité de papier adultes, capacité enfants et partage des outils sont déclarés dans cet exemple.",
          "Scalpels et tapis annoncés fournis pour la formule adultes. Colle, couleurs, protections et conditions pratiques restent à convenir avec l’artiste. Cette liste ne vaut pas contrôle de sécurité ou diagnostic pédagogique.",
          "Source : https://amaterra.fr/site/wp-content/uploads/2026/06/cecile-jacoud-presentation-4.pdf",
        ],
      },
    ],
  };
}

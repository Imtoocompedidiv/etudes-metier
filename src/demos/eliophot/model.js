import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
export const MAX_BYTES = 4 * 1024 * 1024;
const enc = new TextEncoder();
const hash = (x) => bytesToHex(sha256(enc.encode(JSON.stringify(x))));
const eq = (a, b) => a.present === b.present && a.value === b.value;
const cell = (values, key) =>
  Object.hasOwn(values, key)
    ? { present: true, value: values[key] }
    : { present: false, value: "" };
const id = (x) =>
  typeof x === "string" &&
  /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,39}$/.test(x) &&
  !["constructor", "prototype"].includes(x);
const isHash = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
function shape(x, names, label) {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    Object.keys(x).length !== names.length ||
    names.some((k) => !Object.hasOwn(x, k))
  )
    throw Error(`${label} : structure inattendue.`);
}
function str(x, label, max = 120) {
  if (typeof x !== "string" || !x.trim() || x.length > max)
    throw Error(
      `${label} : texte non vide de ${max} caractères maximum requis.`,
    );
  return x;
}
function unique(items, label) {
  if (new Set(items).size !== items.length) throw Error(`${label} dupliqué.`);
}
export function normalize(input) {
  shape(
    input,
    ["format", "fields", "base", "target", "sites", "decisions", "review"],
    "Dossier",
  );
  if (input.format !== "eliophot-dossier-v1")
    throw Error("Format de dossier non reconnu.");
  if (
    !Array.isArray(input.fields) ||
    !input.fields.length ||
    input.fields.length > 30
  )
    throw Error("De 1 à 30 champs requis.");
  const fields = input.fields.map((f) => {
    shape(f, ["key", "label", "type", "required"], "Champ");
    if (!id(f.key)) throw Error("Clé de champ invalide.");
    str(f.label, "Libellé", 80);
    if (!["text", "url"].includes(f.type) || typeof f.required !== "boolean")
      throw Error("Type ou obligation du champ invalide.");
    return { ...f };
  });
  unique(
    fields.map((f) => f.key),
    "Champ",
  );
  const known = new Set(fields.map((f) => f.key));
  const values = (v) => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw Error("Valeurs attendues sous forme d’objet.");
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (!known.has(k) || typeof val !== "string" || val.length > 2000)
        throw Error(`Valeur ${k} inconnue ou supérieure à 2 000 caractères.`);
      out[k] = val;
    }
    return out;
  };
  const manifest = (m, label) => {
    shape(m, ["version", "values"], label);
    if (!id(m.version)) throw Error("Identifiant de version invalide.");
    return { version: m.version, values: values(m.values) };
  };
  const base = manifest(input.base, "Socle"),
    target = manifest(input.target, "Cible");
  if (base.version === target.version)
    throw Error("Les deux versions de socle doivent être distinctes.");
  if (
    !Array.isArray(input.sites) ||
    !input.sites.length ||
    input.sites.length > 20
  )
    throw Error("De 1 à 20 établissements requis.");
  const sites = input.sites.map((s) => {
    shape(s, ["id", "name", "baseVersion", "values"], "Établissement");
    if (!id(s.id) || !id(s.baseVersion))
      throw Error("Identité ou version d’établissement invalide.");
    return { ...s, name: str(s.name, "Nom", 100), values: values(s.values) };
  });
  unique(
    sites.map((s) => s.id),
    "Établissement",
  );
  if (!Array.isArray(input.decisions) || input.decisions.length > 600)
    throw Error("Liste d’arbitrages invalide.");
  const decisions = input.decisions.map((d) => {
    shape(d, ["siteId", "fieldKey", "choice", "fingerprint"], "Arbitrage");
    if (
      !sites.some((s) => s.id === d.siteId) ||
      !known.has(d.fieldKey) ||
      !["local", "target"].includes(d.choice) ||
      !isHash(d.fingerprint)
    )
      throw Error("Arbitrage invalide.");
    return { ...d };
  });
  unique(
    decisions.map((d) => JSON.stringify([d.siteId, d.fieldKey])),
    "Arbitrage",
  );
  if (input.review !== null && !isHash(input.review))
    throw Error("Empreinte de revue invalide.");
  const out = {
    format: input.format,
    fields,
    base,
    target,
    sites,
    decisions,
    review: input.review,
  };
  if (enc.encode(JSON.stringify(out, null, 2)).length > MAX_BYTES)
    throw Error("Le dossier dépasse 4 Mo au format exporté.");
  return out;
}
function rawRow(s, site, f) {
  const b = cell(s.base.values, f.key),
    l = cell(site.values, f.key),
    t = cell(s.target.values, f.key);
  let status, origin, result;
  if (eq(l, b)) {
    status = eq(t, b) ? "unchanged" : "inherited";
    origin = "target";
    result = t;
  } else if (eq(t, b)) {
    status = "local";
    origin = "local";
    result = l;
  } else if (eq(l, t)) {
    status = "convergent";
    origin = "both";
    result = l;
  } else {
    status = "conflict";
    origin = null;
    result = null;
  }
  const fingerprint = hash({
    schema: f,
    baseVersion: s.base.version,
    targetVersion: s.target.version,
    siteId: site.id,
    localVersion: site.baseVersion,
    b,
    l,
    t,
  });
  const decision = s.decisions.find(
    (d) =>
      d.siteId === site.id &&
      d.fieldKey === f.key &&
      d.fingerprint === fingerprint,
  );
  if (status === "conflict" && decision) {
    origin = decision.choice;
    result = origin === "local" ? l : t;
    status = "resolved";
  }
  return {
    siteId: site.id,
    siteName: site.name,
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    base: b,
    local: l,
    target: t,
    status,
    origin,
    result,
    fingerprint,
    choice: decision?.choice || null,
  };
}
export function fingerprint(s) {
  return hash({
    fields: s.fields,
    base: s.base,
    target: s.target,
    sites: s.sites,
    decisions: s.decisions,
  });
}
export function analyze(input) {
  const s = normalize(input),
    rows = [],
    issues = [];
  for (const site of s.sites) {
    if (site.baseVersion !== s.base.version)
      issues.push({
        siteId: site.id,
        key: null,
        type: "version",
        message: `${site.name} se réfère à ${site.baseVersion}, le socle chargé est ${s.base.version}.`,
      });
    for (const f of s.fields) {
      const r = rawRow(s, site, f);
      rows.push(r);
      if (!r.result) {
        issues.push({
          siteId: site.id,
          key: f.key,
          type: "conflict",
          message: `${f.label} attend un arbitrage.`,
        });
        continue;
      }
      if (f.required && (!r.result.present || !r.result.value.trim()))
        issues.push({
          siteId: site.id,
          key: f.key,
          type: "required",
          message: `${f.label} est obligatoire dans le résultat.`,
        });
      if (r.result.present && r.result.value && f.type === "url") {
        let valid = false;
        try {
          const u = new URL(r.result.value);
          valid =
            u.protocol === "https:" &&
            !u.username &&
            !u.password &&
            Boolean(u.hostname);
        } catch {}
        if (!valid)
          issues.push({
            siteId: site.id,
            key: f.key,
            type: "url",
            message: `${f.label} doit être une URL HTTPS sans identifiants.`,
          });
      }
    }
  }
  const ready = !issues.length,
    reviewed = ready && s.review === fingerprint(s);
  return { rows, issues, ready, reviewed };
}
export function choose(input, siteId, fieldKey, choice) {
  const s = normalize(input);
  if (!["local", "target"].includes(choice)) throw Error("Choix invalide.");
  const row = analyze(s).rows.find(
    (r) => r.siteId === siteId && r.key === fieldKey,
  );
  if (!row || !["conflict", "resolved"].includes(row.status))
    throw Error("Ce champ ne demande pas d’arbitrage.");
  return {
    ...s,
    decisions: [
      ...s.decisions.filter(
        (d) => d.siteId !== siteId || d.fieldKey !== fieldKey,
      ),
      { siteId, fieldKey, choice, fingerprint: row.fingerprint },
    ],
    review: null,
  };
}
export function clearChoice(input, siteId, fieldKey) {
  const s = normalize(input);
  return {
    ...s,
    decisions: s.decisions.filter(
      (d) => d.siteId !== siteId || d.fieldKey !== fieldKey,
    ),
    review: null,
  };
}
export function editValue(input, scope, siteId, fieldKey, present, value) {
  const s = normalize(input);
  if (
    !s.fields.some((f) => f.key === fieldKey) ||
    typeof present !== "boolean" ||
    typeof value !== "string"
  )
    throw Error("Modification de champ invalide.");
  const next = structuredClone(s);
  let values;
  if (scope === "base" || scope === "target") values = next[scope].values;
  else if (scope === "local")
    values = next.sites.find((x) => x.id === siteId)?.values;
  else throw Error("Version inconnue.");
  if (!values) throw Error("Établissement inconnu.");
  if (present) values[fieldKey] = value;
  else delete values[fieldKey];
  if (JSON.stringify(next) === JSON.stringify(s)) return s;
  return normalize({ ...next, decisions: [], review: null });
}
export function relire(input) {
  const s = normalize(input);
  if (!analyze(s).ready)
    throw Error(
      "Résolvez tous les arbitrages et contrôles avant de relire le paquet.",
    );
  return { ...s, review: fingerprint(s) };
}
export function restore(text) {
  if (enc.encode(text).length > MAX_BYTES)
    throw Error("Fichier supérieur à 4 Mo.");
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    throw Error("JSON illisible.");
  }
  const s = normalize(input);
  s.decisions = s.decisions.filter((d) => {
    const site = s.sites.find((x) => x.id === d.siteId),
      f = s.fields.find((x) => x.key === d.fieldKey);
    const r = rawRow({ ...s, decisions: [] }, site, f);
    return r.status === "conflict" && r.fingerprint === d.fingerprint;
  });
  if (s.review !== fingerprint(s) || !analyze(s).ready) s.review = null;
  return s;
}
export function finalPackage(input) {
  const s = normalize(input),
    a = analyze(s);
  if (!a.reviewed)
    throw Error("Le paquet complet doit être relu avant l’export final.");
  return {
    format: "eliophot-configurations-v1",
    fromVersion: s.base.version,
    toVersion: s.target.version,
    review: s.review,
    sites: s.sites.map((site) => ({
      id: site.id,
      name: site.name,
      version: s.target.version,
      values: Object.fromEntries(
        a.rows
          .filter((r) => r.siteId === site.id && r.result.present)
          .map((r) => [r.key, r.result.value]),
      ),
    })),
  };
}
export const labelStatus = {
  unchanged: "Inchangé",
  inherited: "Nouveau socle",
  local: "Variante locale",
  convergent: "Même évolution",
  conflict: "À arbitrer",
  resolved: "Arbitré",
};
export const displayCell = (c) =>
  !c
    ? "À arbitrer"
    : !c.present
      ? "Champ absent"
      : c.value === ""
        ? "Chaîne vide"
        : c.value;
export const csvHeaders = [
  "site",
  "champ",
  "base_present",
  "base",
  "local_present",
  "local",
  "cible_presente",
  "cible",
  "statut",
  "choix",
  "resultat_present",
  "resultat",
];
export function rowsCsv(s) {
  return analyze(s).rows.map((r) => ({
    site: r.siteName,
    champ: r.key,
    base_present: r.base.present,
    base: r.base.value,
    local_present: r.local.present,
    local: r.local.value,
    cible_presente: r.target.present,
    cible: r.target.value,
    statut: r.status,
    choix: r.origin || "",
    resultat_present: r.result?.present ?? "",
    resultat: r.result?.value ?? "",
  }));
}
export function report(s) {
  const a = analyze(s);
  return {
    title: "Eliophot · Recette de variantes",
    subtitle: `${s.base.version} vers ${s.target.version} · ${a.reviewed ? "Paquet complet relu" : "Dossier provisoire, non relu"}`,
    sections: [
      {
        title: "Périmètre",
        paragraphs: [
          "Exemple fictif de comparaison à trois versions. Aucun site modifié. Le paquet final contient tous les établissements et se télécharge seulement après arbitrage et revue.",
          `Empreinte de cette configuration : ${fingerprint(s)}`,
        ],
      },
      {
        title: "Contrôles en attente",
        paragraphs: a.issues.length
          ? a.issues.map(
              (x) =>
                `${s.sites.find((y) => y.id === x.siteId).name} · ${x.message}`,
            )
          : ["Aucun contrôle en attente."],
      },
      ...s.sites.map((site) => ({
        title: site.name,
        headers: [
          "Champ",
          "Socle de départ",
          "Établissement",
          "Cible",
          "Résultat",
          "Décision",
        ],
        rows: a.rows
          .filter((r) => r.siteId === site.id)
          .map((r) => [
            r.label,
            displayCell(r.base),
            displayCell(r.local),
            displayCell(r.target),
            displayCell(r.result),
            labelStatus[r.status],
          ]),
      })),
    ],
  };
}
export function seed() {
  const fields = [
    { key: "heading", label: "Titre d’accueil", type: "text", required: true },
    { key: "intro", label: "Texte d’accueil", type: "text", required: true },
    {
      key: "bookingLabel",
      label: "Libellé réservation",
      type: "text",
      required: true,
    },
    {
      key: "bookingUrl",
      label: "Adresse réservation",
      type: "url",
      required: true,
    },
    { key: "offer", label: "Offre saisonnière", type: "text", required: false },
    { key: "access", label: "Accès", type: "text", required: false },
  ];
  const base = {
    version: "v1.4",
    values: {
      heading: "Votre séjour commence ici",
      intro: "Un lieu pour se ressourcer et découvrir les environs.",
      bookingLabel: "Réserver votre séjour",
      bookingUrl: "https://reservation.exemple.test/sejour",
      offer: "Deux nuits, un petit-déjeuner offert.",
    },
  };
  const target = {
    version: "v1.5",
    values: {
      heading: "Prenez le temps de séjourner",
      intro: base.values.intro,
      bookingLabel: base.values.bookingLabel,
      bookingUrl: "https://reservation.exemple.test/reserver",
      access: "Consultez les itinéraires avant votre arrivée.",
    },
  };
  const sites = [
    {
      id: "rivage",
      name: "Maison du Rivage",
      baseVersion: "v1.4",
      values: {
        ...base.values,
        heading: "Le calme, au bord de l’eau",
        bookingUrl: "https://rivage.exemple.test/reservation",
        offer: "Une escapade de trois nuits au bord de l’eau.",
      },
    },
    {
      id: "amandiers",
      name: "Les Amandiers",
      baseVersion: "v1.4",
      values: {
        ...base.values,
        heading: "Séjourner entre jardin et village",
        intro: "Une maison ouverte sur le jardin, à quelques pas du village.",
      },
    },
    {
      id: "belvedere",
      name: "Le Belvédère",
      baseVersion: "v1.4",
      values: { ...base.values, heading: target.values.heading },
    },
    {
      id: "hauts",
      name: "Les Hauts de Rive",
      baseVersion: "v1.4",
      values: {
        ...base.values,
        access: "Arrivée par la route du plateau. Parking au portail.",
      },
    },
  ];
  return normalize({
    format: "eliophot-dossier-v1",
    fields,
    base,
    target,
    sites,
    decisions: [],
    review: null,
  });
}

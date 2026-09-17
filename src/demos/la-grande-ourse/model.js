import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
// Canonical JSON can use six bytes per UTF-16 unit for isolated surrogates.
// 40 × (4 × 2000 + 500 + 300 + 250) text units, 20 × 200 values,
// 40 × 250 journal units and bounded keys/metadata remain below 3 MiB.
// 4 MiB also admits the indented JSON produced by downloadJson.
export const MAX_JSON_BYTES = 4 * 1024 * 1024;
export const CONTRACT = {
  "booking.title": [],
  "booking.intro": [],
  "booking.email": [],
  "booking.submit": [],
  "booking.error": ["email"],
  "booking.success": ["email"],
  "booking.again": [],
};
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
function keys(x, expected, label) {
  if (
    !object(x) ||
    Object.keys(x).some((k) => !expected.includes(k)) ||
    expected.some((k) => !Object.hasOwn(x, k))
  )
    throw Error(`${label} : structure invalide.`);
}
function text(x, max, label, empty = false) {
  if (
    typeof x !== "string" ||
    x.length > max ||
    (!empty && !x.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x)
  )
    throw Error(
      `${label} : texte ${empty ? "" : "non vide "}limité à ${max} caractères.`,
    );
  return x.replace(/\r\n?/g, "\n");
}
const name = (x) => typeof x === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(x);
function strings(x) {
  if (
    !Array.isArray(x) ||
    x.length > 8 ||
    x.some((v) => !name(v)) ||
    new Set(x).size !== x.length
  )
    throw Error("Variables : huit noms uniques au maximum, en minuscules.");
  return [...x];
}
function message(x) {
  keys(
    x,
    [
      "key",
      "context",
      "action",
      "variables",
      "limit",
      "variants",
      "selected",
      "review",
    ],
    "Message",
  );
  if (
    typeof x.key !== "string" ||
    !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(x.key) ||
    x.key.length > 80
  )
    throw Error(
      "Clé : mots minuscules séparés par un point, 80 caractères maximum.",
    );
  const variables = strings(x.variables);
  if (
    Object.hasOwn(CONTRACT, x.key) &&
    JSON.stringify([...variables].sort()) !== JSON.stringify(CONTRACT[x.key])
  )
    throw Error(
      `Le contrat de ${x.key} exige ${CONTRACT[x.key].join(", ") || "aucune variable"}.`,
    );
  if (
    typeof x.limit !== "number" ||
    !Number.isSafeInteger(x.limit) ||
    x.limit < 1 ||
    x.limit > 2000
  )
    throw Error("Limite : entier de 1 à 2 000 caractères.");
  if (
    !Array.isArray(x.variants) ||
    x.variants.length < 1 ||
    x.variants.length > 4
  )
    throw Error("Une à quatre variantes par message.");
  const variants = x.variants.map((v) => {
    keys(v, ["id", "text"], "Variante");
    if (typeof v.id !== "string" || !/[A-D]/.test(v.id) || v.id.length !== 1)
      throw Error("Identifiant de variante A, B, C ou D attendu.");
    return { id: v.id, text: text(v.text, 2000, "Variante", true) };
  });
  if (new Set(variants.map((v) => v.id)).size !== variants.length)
    throw Error("Variantes dupliquées.");
  if (
    typeof x.selected !== "string" ||
    !variants.some((v) => v.id === x.selected)
  )
    throw Error("Variante retenue absente.");
  let review = null;
  if (x.review !== null) {
    keys(x.review, ["snapshot", "note"], "Revue");
    if (
      typeof x.review.snapshot !== "string" ||
      !/^[a-f0-9]{64}$/.test(x.review.snapshot)
    )
      throw Error("Empreinte de revue invalide.");
    review = {
      snapshot: x.review.snapshot,
      note: text(x.review.note, 250, "Note de revue"),
    };
  }
  return {
    key: x.key,
    context: text(x.context, 500, "Contexte"),
    action: text(x.action, 300, "Action attendue"),
    variables,
    limit: x.limit,
    variants,
    selected: x.selected,
    review,
  };
}
function digest(value) {
  return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))));
}
export function fingerprint(s, m) {
  const { review, ...content } = m;
  return digest([content, s.values]);
}
export function normalize(x) {
  keys(x, ["version", "values", "messages", "journal"], "Catalogue");
  if (x.version !== 1) throw Error("Catalogue version 1 attendu.");
  if (
    !object(x.values) ||
    Object.keys(x.values).length > 20 ||
    !Object.hasOwn(x.values, "email")
  )
    throw Error("Valeurs d’essai invalides ; email requis.");
  const values = {};
  for (const [k, v] of Object.entries(x.values)) {
    if (!name(k)) throw Error("Nom de valeur d’essai invalide.");
    values[k] = text(v, 200, "Valeur d’essai", true);
  }
  if (
    !Array.isArray(x.messages) ||
    x.messages.length < 1 ||
    x.messages.length > 40
  )
    throw Error("Un à quarante messages attendus.");
  const messages = x.messages.map(message);
  if (new Set(messages.map((m) => m.key)).size !== messages.length)
    throw Error("Deux messages partagent la même clé.");
  if (!Array.isArray(x.journal) || x.journal.length > 40)
    throw Error("Historique invalide.");
  const result = {
    version: 1,
    values,
    messages,
    journal: x.journal.map((v) => text(v, 250, "Historique")),
  };
  for (const m of messages)
    if (m.review?.snapshot !== fingerprint(result, m)) m.review = null;
  return result;
}
export function restore(raw) {
  if (
    typeof raw !== "string" ||
    raw.length > MAX_JSON_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_JSON_BYTES
  )
    throw Error("Catalogue limité à 4 Mio en UTF-8.");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Error("JSON illisible.");
  }
  return normalize(data);
}
export const valid = (x) => {
  try {
    return JSON.stringify(normalize(x)) === JSON.stringify(x);
  } catch {
    return false;
  }
};
const initial = (key, context, action, limit, variants) => ({
  key,
  context,
  action,
  variables: CONTRACT[key],
  limit,
  variants: variants.map((text, i) => ({
    id: String.fromCharCode(65 + i),
    text,
  })),
  selected: "A",
  review: null,
});
export const seed = {
  version: 1,
  values: { email: "lea.exemple" },
  messages: [
    initial(
      "booking.title",
      "Début du formulaire de visite.",
      "Comprendre ce qui est réservé.",
      45,
      ["Réserver une visite", "Choisissez votre prochaine visite"],
    ),
    initial(
      "booking.intro",
      "Avant la saisie de l’adresse.",
      "Comprendre la suite du parcours.",
      120,
      ["Laissez votre adresse pour recevoir les modalités de visite."],
    ),
    initial(
      "booking.email",
      "Libellé du champ e-mail.",
      "Saisir une adresse personnelle de test.",
      32,
      ["Adresse e-mail"],
    ),
    initial(
      "booking.submit",
      "Action principale du formulaire.",
      "Confirmer la demande de visite.",
      40,
      ["Confirmer ma demande", "Recevoir les modalités"],
    ),
    initial(
      "booking.error",
      "Adresse refusée au moment de confirmer.",
      "Corriger puis réessayer.",
      140,
      ["Cette adresse n’est pas valide.", "Vérifiez {email}, puis réessayez."],
    ),
    initial(
      "booking.success",
      "Demande acceptée dans la simulation.",
      "Comprendre la destination de la confirmation.",
      140,
      [
        "Les modalités seront envoyées à {email}.",
        "La suite de votre visite arrive à {email}.",
      ],
    ),
    initial(
      "booking.again",
      "Retour depuis la confirmation.",
      "Tester une autre adresse.",
      40,
      ["Recommencer l’essai"],
    ),
  ],
  journal: [],
};
export function selectedText(m) {
  return m.variants.find((v) => v.id === m.selected).text;
}
export function interpolate(template, values) {
  return template.replace(/\{([a-z][a-z0-9_]{0,31})\}/g, (_, key) =>
    Object.hasOwn(values, key) ? values[key] : `{${key}}`,
  );
}
export function issues(s, m) {
  const template = selectedText(m),
    found = [],
    used = [...template.matchAll(/\{([a-z][a-z0-9_]{0,31})\}/g)].map(
      (v) => v[1],
    );
  const push = (code, detail) => found.push({ key: m.key, code, detail });
  if (!template.trim()) push("empty", "Le texte retenu est vide.");
  if (/[{}]/.test(template.replace(/\{([a-z][a-z0-9_]{0,31})\}/g, "")))
    push("syntax", "Accolade isolée ou variable mal formée.");
  for (const variable of m.variables)
    if (!used.includes(variable))
      push("missing", `Variable requise absente : {${variable}}.`);
  for (const variable of new Set(used)) {
    if (!m.variables.includes(variable))
      push("unexpected", `Variable non prévue : {${variable}}.`);
    if (!Object.hasOwn(s.values, variable))
      push("value", `Valeur d’essai absente : ${variable}.`);
  }
  const count = Array.from(interpolate(template, s.values)).length;
  if (count > m.limit)
    push(
      "length",
      `${count} caractères après substitution, limite déclarée ${m.limit}.`,
    );
  return found;
}
export const missingKeys = (s) =>
  Object.keys(CONTRACT).filter((k) => !s.messages.some((m) => m.key === k));
export function allIssues(s) {
  return [
    ...missingKeys(s).map((key) => ({
      key,
      code: "key",
      detail: "Clé du formulaire absente.",
    })),
    ...s.messages.flatMap((m) => issues(s, m)),
  ];
}
export function isReviewed(s, m) {
  return m.review?.snapshot === fingerprint(s, m) && issues(s, m).length === 0;
}
export const canExport = (s) =>
  allIssues(s).length === 0 && s.messages.every((m) => isReviewed(s, m));
function next(s, changes, note) {
  return normalize({
    ...s,
    ...changes,
    journal: [...s.journal, note].slice(-40),
  });
}
export function edit(s, key, changes) {
  const m = s.messages.find((m) => m.key === key);
  if (!m) throw Error("Message introuvable.");
  const updated = message({ ...m, ...changes, key, review: null });
  return next(
    s,
    { messages: s.messages.map((m) => (m.key === key ? updated : m)) },
    `${key} modifié.`,
  );
}
export function choose(s, key, id) {
  return edit(s, key, { selected: id });
}
export function review(s, key, note) {
  const m = s.messages.find((m) => m.key === key);
  if (!m) throw Error("Message introuvable.");
  if (issues(s, m).length)
    throw Error("Corrigez les constats du message avant de le retenir.");
  const checked = {
    ...m,
    review: {
      snapshot: fingerprint(s, m),
      note: text(note, 250, "Note de revue"),
    },
  };
  return next(
    s,
    { messages: s.messages.map((m) => (m.key === key ? checked : m)) },
    `${key} relu, variante ${m.selected}.`,
  );
}
export function changeValues(s, values) {
  return next(
    s,
    { values, messages: s.messages.map((m) => ({ ...m, review: null })) },
    "Valeurs d’essai modifiées, revues annulées.",
  );
}
export function restoreKeys(s) {
  const missing = missingKeys(s);
  if (s.messages.length + missing.length > 40)
    throw Error("Trop de messages pour restaurer le contrat.");
  return next(
    s,
    {
      messages: [
        ...s.messages,
        ...seed.messages
          .filter((m) => missing.includes(m.key))
          .map((m) => structuredClone(m)),
      ],
    },
    "Clés du formulaire remises en place.",
  );
}
export function dictionary(s) {
  if (!canExport(s))
    throw Error(
      "Corrigez et relisez chaque message avant de livrer le dictionnaire.",
    );
  return Object.fromEntries(s.messages.map((m) => [m.key, selectedText(m)]));
}
export function preview(s, key) {
  const m = s.messages.find((m) => m.key === key);
  return m ? interpolate(selectedText(m), s.values) : `[${key} manquant]`;
}
export const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export function report(s) {
  return {
    title: "Spécification des messages",
    subtitle: "La grande Ourse · Exemple indépendant · Réservation fictive",
    sections: [
      {
        title: "Valeurs d’essai et contrôle",
        paragraphs: [
          "Limites comptées en points de code Unicode, après substitution avec les valeurs ci-dessous. Aucune garantie pour d’autres valeurs en production. Déclaration éditoriale locale, aucun test utilisateur exécuté.",
        ],
        headers: ["Variable", "Valeur"],
        rows: Object.entries(s.values),
      },
      {
        title: "Messages retenus",
        headers: [
          "Clé",
          "Variante",
          "Texte source",
          "Rendu d’essai",
          "Limite",
          "Revue",
        ],
        rows: s.messages.map((m) => [
          m.key,
          m.selected,
          selectedText(m),
          interpolate(selectedText(m), s.values),
          m.limit,
          isReviewed(s, m) ? m.review.note : "Non relu",
        ]),
      },
      {
        title: "Contexte de conception",
        headers: ["Clé", "Contexte", "Action attendue", "Variables"],
        rows: s.messages.map((m) => [
          m.key,
          m.context,
          m.action,
          m.variables.join(", "),
        ]),
      },
      {
        title: "Réserves",
        headers: ["Clé", "Contrôle", "Détail"],
        rows: allIssues(s).map((f) => [f.key, f.code, f.detail]),
        paragraphs: s.messages.every((m) => isReviewed(s, m))
          ? []
          : [
              "Le catalogue comprend des textes non relus. Le dictionnaire de livraison reste bloqué.",
            ],
      },
      { title: "Historique", paragraphs: s.journal },
    ],
  };
}

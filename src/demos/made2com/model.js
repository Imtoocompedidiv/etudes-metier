import { parseCsv } from "../../shared/files.js";

export const contactHeaders = ["id", "name", "zone", "consent"];
export const eventHeaders = ["id", "contact_id", "kind", "at", "cart_id"];
export const kinds = {
  cart: "Panier abandonné",
  order: "Commande complétée",
  message: "Message déjà envoyé",
  grant: "Accord enregistré",
  withdraw: "Retrait enregistré",
};
export const outcomes = {
  eligible: "Éligible à la relance",
  gift: "Branche carte cadeau",
  converted: "Sortie de relance",
  pressure: "Pression atteinte",
  waiting: "Délai non écoulé",
  consent: "Sans accord actif",
  empty: "Aucun panier",
  error: "Données à corriger",
};
const key = (v) => {
  if (
    typeof v !== "string" ||
    !/^[a-zA-Z0-9_-]{1,40}$/.test(v) ||
    ["__proto__", "constructor", "prototype"].includes(v)
  )
    throw Error(
      "Code attendu : 1 à 40 lettres, chiffres, tirets ou tirets bas.",
    );
  return v;
};
const text = (v) => {
  if (typeof v !== "string" || !v.trim() || v.length > 80)
    throw Error("Nom obligatoire, 80 caractères maximum.");
  return v.trim();
};
export function timestamp(v) {
  if (
    typeof v !== "string" ||
    !/^20\d\d-\d\d-\d\dT\d\d:\d\d:00Z$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v.replace("Z", ".000Z")
  )
    throw Error(
      "Date UTC attendue : AAAA-MM-JJTHH:MM:00Z, entre 2000 et 2099.",
    );
  return v;
}
function integer(v, min, max, label) {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max)
    throw Error(`${label} : entier de ${min} à ${max}.`);
  return v;
}
function unique(rows, limit, fn, label) {
  if (!Array.isArray(rows) || rows.length > limit || !rows.length)
    throw Error(`${label} : 1 à ${limit} lignes attendues.`);
  const ids = new Set();
  return rows.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw Error("Ligne invalide.");
    const row = fn(raw);
    if (ids.has(row.id)) throw Error(`Code répété : ${row.id}.`);
    ids.add(row.id);
    return row;
  });
}
export const normalizeContacts = (rows) =>
  unique(
    rows,
    200,
    (r) => {
      if (!["yes", "no"].includes(r.consent))
        throw Error("Consentement initial : yes ou no.");
      return {
        id: key(r.id),
        name: text(r.name),
        zone: key(r.zone),
        consent: r.consent,
      };
    },
    "Contacts",
  );
export const normalizeEvents = (rows) =>
  unique(
    rows,
    1000,
    (r) => {
      if (!Object.hasOwn(kinds, r.kind))
        throw Error("Type inconnu : cart, order, message, grant ou withdraw.");
      const cart = r.cart_id || "";
      if (["cart", "order"].includes(r.kind)) key(cart);
      else if (cart)
        throw Error(
          "La référence panier est réservée aux paniers et commandes.",
        );
      return {
        id: key(r.id),
        contact_id: key(r.contact_id),
        kind: r.kind,
        at: timestamp(r.at),
        cart_id: cart,
      };
    },
    "Événements",
  );
export const parseContacts = (v) =>
  normalizeContacts(
    parseCsv(v, { requiredHeaders: contactHeaders, maxRows: 200 }).rows,
  );
export const parseEvents = (v) =>
  normalizeEvents(
    parseCsv(v, { requiredHeaders: eventHeaders, maxRows: 1000 }).rows,
  );
export function normalizeRules(r) {
  if (!r || !Array.isArray(r.zones) || !r.zones.length || r.zones.length > 20)
    throw Error("De 1 à 20 zones sont nécessaires.");
  const seen = new Set();
  return {
    maxMessages: integer(r.maxMessages, 1, 20, "Maximum de messages"),
    windowHours: integer(r.windowHours, 1, 720, "Fenêtre de pression"),
    delayHours: integer(r.delayHours, 0, 168, "Délai panier"),
    zones: r.zones.map((z) => {
      const id = key(z.id);
      if (seen.has(id)) throw Error("Zone répétée.");
      seen.add(id);
      return { id, label: text(z.label), cutoff: timestamp(z.cutoff) };
    }),
  };
}
export function normalizeDossier(d) {
  if (d?.version !== 1 || !Array.isArray(d.journal) || d.journal.length > 40)
    throw Error("Dossier Made2Com version 1 attendu.");
  return {
    version: 1,
    contacts: normalizeContacts(d.contacts),
    events: normalizeEvents(d.events),
    rules: normalizeRules(d.rules),
    at: timestamp(d.at),
    reference: {
      rules: normalizeRules(d.reference?.rules),
      at: timestamp(d.reference?.at),
    },
    journal: d.journal.map((j) => {
      if (typeof j !== "string" || j.length > 200)
        throw Error("Journal invalide.");
      return j;
    }),
  };
}
export const validDossier = (d) => {
  try {
    return JSON.stringify(d) === JSON.stringify(normalizeDossier(d));
  } catch {
    return false;
  }
};
const priority = { cart: 0, order: 1, message: 2, grant: 3, withdraw: 4 };
export const sortEvents = (rows) =>
  [...rows].sort(
    (a, b) =>
      a.at.localeCompare(b.at) ||
      priority[a.kind] - priority[b.kind] ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
export function eventIssues(d) {
  const known = new Set(d.contacts.map((c) => c.id));
  return sortEvents(d.events).flatMap((e) => {
    if (!known.has(e.contact_id))
      return [
        {
          id: e.id,
          contact_id: e.contact_id,
          reason: "Contact absent du fichier contacts.",
        },
      ];
    if (
      e.kind === "order" &&
      !d.events.some(
        (c) =>
          c.kind === "cart" &&
          c.contact_id === e.contact_id &&
          c.cart_id === e.cart_id &&
          c.at <= e.at,
      )
    )
      return [
        {
          id: e.id,
          contact_id: e.contact_id,
          reason: "Commande sans panier correspondant antérieur ou simultané.",
        },
      ];
    if (
      e.kind === "cart" &&
      d.events.some(
        (c) =>
          c.kind === "cart" &&
          c.id !== e.id &&
          c.contact_id === e.contact_id &&
          c.cart_id === e.cart_id,
      )
    )
      return [
        {
          id: e.id,
          contact_id: e.contact_id,
          reason: "Référence panier répétée pour ce contact.",
        },
      ];
    return [];
  });
}
export function simulate(d, rules = d.rules, at = d.at) {
  const issues = eventIssues(d),
    activeIssuesAt = eventIssues({
      ...d,
      events: d.events.filter((e) => e.at <= at),
    }),
    now = Date.parse(at),
    issueIds = new Set(activeIssuesAt.map((e) => e.id));
  const decisions = d.contacts.map((contact) => {
    const all = sortEvents(d.events.filter((e) => e.contact_id === contact.id)),
      events = all.filter((e) => e.at <= at && !issueIds.has(e.id));
    let consent = contact.consent === "yes";
    for (const e of events)
      if (e.kind === "grant" || e.kind === "withdraw")
        consent = e.kind === "grant";
    const cart = events.findLast((e) => e.kind === "cart");
    const order =
      cart &&
      events.find(
        (e) =>
          e.kind === "order" && e.cart_id === cart.cart_id && e.at >= cart.at,
      );
    const messages = events.filter(
      (e) =>
        e.kind === "message" &&
        Date.parse(e.at) > now - rules.windowHours * 3600000,
    ).length;
    const zone = rules.zones.find((z) => z.id === contact.zone);
    const activeIssues = activeIssuesAt.filter(
      (i) => i.contact_id === contact.id,
    );
    let outcome, reason;
    if (activeIssues.length) {
      outcome = "error";
      reason = activeIssues[0].reason;
    } else if (!consent) {
      outcome = "consent";
      reason =
        "Aucun accord actif à la date simulée, selon les données fictives.";
    } else if (!cart) {
      outcome = "empty";
      reason = "Aucun panier abandonné à la date simulée.";
    } else if (order) {
      outcome = "converted";
      reason = `Une commande du panier ${cart.cart_id} a été enregistrée le ${displayDate(order.at)}.`;
    } else if (!zone) {
      outcome = "error";
      reason = `La zone ${contact.zone} ne possède pas de date limite.`;
    } else if (now - Date.parse(cart.at) < rules.delayHours * 3600000) {
      outcome = "waiting";
      reason = `Attendre ${rules.delayHours} h après le panier ${cart.cart_id}.`;
    } else if (messages >= rules.maxMessages) {
      outcome = "pressure";
      reason = `${messages} messages dans les ${rules.windowHours} dernières heures, pour un plafond de ${rules.maxMessages}.`;
    } else if (at > zone.cutoff) {
      outcome = "gift";
      reason = `La limite ${zone.label} du ${displayDate(zone.cutoff)} est dépassée.`;
    } else {
      outcome = "eligible";
      reason = `Panier ${cart.cart_id} sans commande, délai écoulé et pression disponible.`;
    }
    return {
      id: contact.id,
      name: contact.name,
      outcome,
      label: outcomes[outcome],
      reason,
      consent,
      cart,
      order,
      messages,
      zone,
      events,
      all,
      activeIssues,
    };
  });
  return { decisions, issues };
}
export function displayDate(v) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(v));
}
export function change(d, patch, action) {
  return normalizeDossier({
    ...d,
    ...patch,
    journal: [...d.journal, action].slice(-40),
  });
}
export const decisionHeaders = [
  "contact",
  "name",
  "simulation_utc",
  "outcome",
  "reason",
];
export const decisionRows = (d) =>
  simulate(d).decisions.map((r) => [r.id, r.name, d.at, r.label, r.reason]);
const rules = {
  maxMessages: 2,
  windowHours: 72,
  delayHours: 6,
  zones: [
    { id: "FR", label: "France", cutoff: "2026-12-20T18:00:00Z" },
    { id: "BE", label: "Belgique", cutoff: "2026-12-18T18:00:00Z" },
  ],
};
export const initial = normalizeDossier({
  version: 1,
  contacts: [
    ["C01", "Camille", "FR", "yes"],
    ["C02", "Noa", "FR", "yes"],
    ["C03", "Alix", "BE", "yes"],
    ["C04", "Lou", "FR", "yes"],
    ["C05", "Sasha", "FR", "no"],
    ["C06", "Charlie", "XX", "yes"],
  ].map(([id, name, zone, consent]) => ({ id, name, zone, consent })),
  events: [
    ["E01", "C01", "cart", "2026-12-16T09:00:00Z", "PAN01"],
    ["E02", "C02", "cart", "2026-12-16T09:00:00Z", "PAN02"],
    ["E03", "C02", "message", "2026-12-17T10:00:00Z", ""],
    ["E04", "C02", "order", "2026-12-18T08:00:00Z", "PAN02"],
    ["E05", "C03", "cart", "2026-12-16T12:00:00Z", "PAN03"],
    ["E06", "C03", "message", "2026-12-17T10:00:00Z", ""],
    ["E07", "C03", "message", "2026-12-18T10:00:00Z", ""],
    ["E08", "C04", "cart", "2026-12-18T10:00:00Z", "PAN04"],
    ["E09", "C05", "cart", "2026-12-17T09:00:00Z", "PAN05"],
    ["E10", "C06", "cart", "2026-12-17T09:00:00Z", "PAN06"],
  ].map(([id, contact_id, kind, at, cart_id]) => ({
    id,
    contact_id,
    kind,
    at,
    cart_id,
  })),
  rules,
  at: "2026-12-18T12:00:00Z",
  reference: { rules, at: "2026-12-18T12:00:00Z" },
  journal: [],
});

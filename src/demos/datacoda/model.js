export const EVENT_TYPES = {
  quote_sent: "Devis envoyé",
  reminder_sent: "Relance déclarée envoyée",
  response_received: "Réponse client",
  accepted: "Devis accepté",
  cancelled: "Devis annulé",
};
export const HEADERS = [
  "delivery_id",
  "event_id",
  "dossier",
  "devis",
  "type",
  "occurred_at",
  "received_at",
];
const PRIORITY = {
  quote_sent: 0,
  reminder_sent: 1,
  response_received: 2,
  accepted: 3,
  cancelled: 4,
};
const HOUR = 3_600_000;
const identity = (value) =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value);
export const pairKey = (event) => JSON.stringify([event.dossier, event.devis]);
export function timestamp(value) {
  if (
    typeof value !== "string" ||
    !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
  )
    throw new Error(
      "Horodatage UTC attendu, par exemple 2026-09-17T09:03:00Z.",
    );
  const ms = Date.parse(value);
  if (
    !Number.isFinite(ms) ||
    new Date(ms).toISOString() !== value.replace("Z", ".000Z")
  )
    throw new Error("Date ou heure impossible.");
  return ms;
}
export const iso = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
export function validatePolicy(policy) {
  if (
    !policy ||
    !Number.isInteger(policy.firstDelayHours) ||
    policy.firstDelayHours < 1 ||
    policy.firstDelayHours > 2160 ||
    !Number.isInteger(policy.repeatDelayHours) ||
    policy.repeatDelayHours < 1 ||
    policy.repeatDelayHours > 2160 ||
    !Number.isInteger(policy.maxReminders) ||
    policy.maxReminders < 0 ||
    policy.maxReminders > 10
  )
    throw new Error(
      "Délais entiers de 1 à 2 160 heures ; plafond de 0 à 10 relances.",
    );
  return {
    firstDelayHours: policy.firstDelayHours,
    repeatDelayHours: policy.repeatDelayHours,
    maxReminders: policy.maxReminders,
  };
}
function contentKey(event) {
  return JSON.stringify([
    event.event_id,
    event.dossier,
    event.devis,
    event.type,
    event.occurred_at,
  ]);
}
export function validateEvents(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500)
    throw new Error("Le journal doit contenir de 1 à 500 réceptions.");
  const deliveries = new Set(),
    events = new Map();
  return rows.map((row, index) => {
    if (
      !row ||
      !identity(row.delivery_id) ||
      !identity(row.event_id) ||
      !identity(row.devis)
    )
      throw new Error(
        `Ligne ${index + 1} : identifiant absent ou invalide (64 caractères au maximum).`,
      );
    if (deliveries.has(row.delivery_id))
      throw new Error(
        `Réception ${row.delivery_id} répétée. Chaque livraison technique doit avoir sa propre clé.`,
      );
    deliveries.add(row.delivery_id);
    if (
      typeof row.dossier !== "string" ||
      !row.dossier.trim() ||
      row.dossier !== row.dossier.trim() ||
      row.dossier.length > 80 ||
      /[\u0000-\u001f]/.test(row.dossier)
    )
      throw new Error(`Ligne ${index + 1} : nom du dossier invalide.`);
    if (!Object.hasOwn(EVENT_TYPES, row.type))
      throw new Error(`Ligne ${index + 1} : type d’événement inconnu.`);
    if (timestamp(row.received_at) < timestamp(row.occurred_at))
      throw new Error(
        `Ligne ${index + 1} : la réception ne peut pas précéder la survenue.`,
      );
    const event = Object.fromEntries(HEADERS.map((key) => [key, row[key]]));
    const key = contentKey(event);
    if (events.has(event.event_id) && events.get(event.event_id) !== key)
      throw new Error(
        `Événement ${event.event_id} contradictoire. Un identifiant ne peut pas désigner deux contenus.`,
      );
    events.set(event.event_id, key);
    return event;
  });
}
export function normalizeState(state) {
  if (!state || state.schema !== "datacoda-replay-v1")
    throw new Error("Dossier de recette DataCoda non reconnu.");
  const events = validateEvents(state.events),
    policy = validatePolicy(state.policy);
  if (timestamp(state.checkedAt) < timestamp(state.preparedAt))
    throw new Error(
      "Le contrôle doit suivre la préparation, ou avoir lieu au même instant.",
    );
  return {
    schema: "datacoda-replay-v1",
    events,
    policy,
    preparedAt: state.preparedAt,
    checkedAt: state.checkedAt,
  };
}
export function validState(state) {
  try {
    normalizeState(state);
    return true;
  } catch {
    return false;
  }
}
export function parseDossier(raw) {
  if (typeof raw !== "string" || raw.length > 1_000_000)
    throw new Error("Dossier JSON trop volumineux.");
  return normalizeState(JSON.parse(raw));
}
export function importRows(state, rows) {
  return normalizeState({ ...state, events: rows });
}
export function updateEvent(state, deliveryId, patch) {
  const old = state.events.find((event) => event.delivery_id === deliveryId);
  if (!old) throw new Error("Réception introuvable.");
  // Immutable event content is corrected across its retries; arrival is specific to a delivery.
  const events = state.events.map((event) =>
    event.event_id === old.event_id
      ? {
          ...event,
          type: patch.type ?? event.type,
          occurred_at: patch.occurred_at ?? event.occurred_at,
          received_at:
            event.delivery_id === deliveryId
              ? (patch.received_at ?? event.received_at)
              : event.received_at,
        }
      : event,
  );
  return normalizeState({ ...state, events });
}
export function changeWindow(state, preparedAt, checkedAt) {
  return normalizeState({ ...state, preparedAt, checkedAt });
}
export function changePolicy(state, policy) {
  return normalizeState({ ...state, policy });
}
export function uniqueEvents(rows) {
  const events = new Map();
  for (const row of rows) {
    const previous = events.get(row.event_id);
    if (!previous)
      events.set(row.event_id, { ...row, deliveries: [row.delivery_id] });
    else {
      previous.deliveries.push(row.delivery_id);
      if (timestamp(row.received_at) < timestamp(previous.received_at)) {
        previous.received_at = row.received_at;
        previous.delivery_id = row.delivery_id;
      }
    }
  }
  return [...events.values()].sort(
    (a, b) =>
      timestamp(a.occurred_at) - timestamp(b.occurred_at) ||
      PRIORITY[a.type] - PRIORITY[b.type] ||
      a.event_id.localeCompare(b.event_id),
  );
}
export function atInstant(rows, policy, at) {
  const time = timestamp(at);
  const seenRows = rows.filter((event) => timestamp(event.received_at) <= time);
  const events = uniqueEvents(seenRows),
    unknownCount = rows.length - seenRows.length;
  const base = {
    at,
    eventIds: events.map((event) => event.event_id),
    arrivals: seenRows.length,
    duplicates: seenRows.length - events.length,
    unknownCount,
    dueAt: null,
    decisive: [],
    count: 0,
  };
  const result = (code, label, reason, extra = {}) => ({
    ...base,
    code,
    label,
    reason,
    candidate: code === "candidate",
    ...extra,
  });
  const quotes = events.filter((event) => event.type === "quote_sent");
  if (!quotes.length)
    return result(
      "missing",
      "Devis non connu",
      "Aucun événement de devis envoyé n’était reçu à cet instant.",
    );
  if (quotes.length !== 1)
    return result(
      "incoherent",
      "Historique à vérifier",
      "Deux envois distincts portent la même clé de devis. Donnez une clé propre à chaque version.",
      { decisive: quotes.map((event) => event.event_id) },
    );
  const quote = quotes[0];
  const earlier = events.filter(
    (event) => timestamp(event.occurred_at) < timestamp(quote.occurred_at),
  );
  if (earlier.length)
    return result(
      "incoherent",
      "Historique à vérifier",
      "Un événement de ce devis est survenu avant son envoi.",
      { decisive: earlier.map((event) => event.event_id) },
    );
  const reminders = events.filter((event) => event.type === "reminder_sent");
  base.count = reminders.length;
  const stop = ["cancelled", "accepted", "response_received"]
    .map((type) => events.filter((event) => event.type === type).at(-1))
    .find(Boolean);
  if (stop) {
    const titles = {
      cancelled: "Suspendue · devis annulé",
      accepted: "Suspendue · devis accepté",
      response_received: "Suspendue · réponse reçue",
    };
    return result(
      stop.type,
      titles[stop.type],
      `Événement « ${EVENT_TYPES[stop.type]} » reçu à ${stop.received_at}.`,
      { decisive: [stop.event_id] },
    );
  }
  if (reminders.length >= policy.maxReminders)
    return result(
      "cap",
      "Plafond atteint",
      `${reminders.length} relance(s) déclarée(s), plafond fixé à ${policy.maxReminders}.`,
      { decisive: reminders.map((event) => event.event_id) },
    );
  const last = reminders.at(-1) || quote;
  const due =
    timestamp(last.occurred_at) +
    (reminders.length ? policy.repeatDelayHours : policy.firstDelayHours) *
      HOUR;
  const dueAt = iso(due);
  const extra = { dueAt, decisive: [last.event_id] };
  if (time < due)
    return result(
      "waiting",
      "Délai en cours",
      `Prochaine échéance ${dueAt}. Délais calendaires en heures.`,
      extra,
    );
  return result(
    "candidate",
    "Relance candidate",
    "Délai atteint, aucun arrêt connu et plafond disponible. Cette recette ne transmet aucun message.",
    extra,
  );
}
export function replay(state) {
  const clean = normalizeState(state);
  const groups = new Map();
  for (const event of clean.events) {
    const key = pairKey(event);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups]
    .map(([key, rows]) => {
      const before = atInstant(rows, clean.policy, clean.preparedAt),
        after = atInstant(rows, clean.policy, clean.checkedAt);
      return {
        key,
        dossier: rows[0].dossier,
        devis: rows[0].devis,
        rows,
        before,
        after,
        changed:
          JSON.stringify([before.code, before.dueAt, before.count]) !==
          JSON.stringify([after.code, after.dueAt, after.count]),
        withdrawn: before.candidate && !after.candidate,
        newEvents: after.eventIds.filter((id) => !before.eventIds.includes(id)),
      };
    })
    .sort(
      (a, b) =>
        a.dossier.localeCompare(b.dossier) || a.devis.localeCompare(b.devis),
    );
}
export const DECISION_HEADERS = [
  "dossier",
  "devis",
  "preparation_utc",
  "decision_preparation",
  "controle_utc",
  "decision_controle",
  "relance_candidate_retiree",
  "echeance_utc",
  "relances_declarees",
  "evenements_determinants",
  "raison",
];
export function decisionRows(state) {
  return replay(state).map((group) => ({
    dossier: group.dossier,
    devis: group.devis,
    preparation_utc: state.preparedAt,
    decision_preparation: group.before.label,
    controle_utc: state.checkedAt,
    decision_controle: group.after.label,
    relance_candidate_retiree: group.withdrawn ? "oui" : "non",
    echeance_utc: group.after.dueAt || "",
    relances_declarees: group.after.count,
    evenements_determinants: group.after.decisive.join("|"),
    raison: group.after.reason,
  }));
}
export function evidenceReport(state) {
  return {
    title: "DataCoda · Recette de relance",
    subtitle: `Préparation ${state.preparedAt} ; contrôle ${state.checkedAt}. Données de simulation, aucun envoi.`,
    sections: [
      {
        title: "Règles appliquées",
        paragraphs: [
          `Premier délai ${state.policy.firstDelayHours} h ; intervalle ${state.policy.repeatDelayHours} h ; plafond ${state.policy.maxReminders}. Heures calendaires UTC.`,
          "Un devis possède une clé propre. Les reprises identiques sont dédupliquées par event_id. La réception technique détermine ce qui était connu à chaque instant. Réponse, acceptation et annulation arrêtent la relance.",
        ],
      },
      {
        title: "Décisions du lot",
        headers: DECISION_HEADERS,
        rows: decisionRows(state).map((row) =>
          DECISION_HEADERS.map((key) => row[key]),
        ),
      },
      {
        title: "Réceptions sources",
        headers: HEADERS,
        rows: state.events.map((row) => HEADERS.map((key) => row[key])),
      },
      {
        title: "Périmètre",
        paragraphs: [
          "Rejeu local uniquement. Ni connexion, ni garantie de livraison, ni verrou distribué. Aucun texte de réponse n’est interprété. Les règles illustratives doivent être confirmées avant toute adaptation.",
        ],
      },
    ],
  };
}
const event = (
  delivery_id,
  event_id,
  dossier,
  devis,
  type,
  occurred_at,
  received_at = occurred_at,
) => ({
  delivery_id,
  event_id,
  dossier,
  devis,
  type,
  occurred_at,
  received_at,
});
export const seed = {
  schema: "datacoda-replay-v1",
  preparedAt: "2026-09-17T09:00:00Z",
  checkedAt: "2026-09-17T09:05:00Z",
  policy: { firstDelayHours: 72, repeatDelayHours: 48, maxReminders: 2 },
  events: [
    event(
      "L-001",
      "E-001",
      "Rivage",
      "Q-104",
      "quote_sent",
      "2026-09-14T09:00:00Z",
    ),
    event(
      "L-002",
      "E-002",
      "Rivage",
      "Q-104",
      "response_received",
      "2026-09-17T08:58:00Z",
      "2026-09-17T09:03:00Z",
    ),
    event(
      "L-003",
      "E-002",
      "Rivage",
      "Q-104",
      "response_received",
      "2026-09-17T08:58:00Z",
      "2026-09-17T09:04:00Z",
    ),
    event(
      "L-004",
      "E-003",
      "Atelier",
      "Q-205",
      "quote_sent",
      "2026-09-12T09:00:00Z",
    ),
    event(
      "L-005",
      "E-004",
      "Atelier",
      "Q-205",
      "reminder_sent",
      "2026-09-15T09:00:00Z",
    ),
    event(
      "L-006",
      "E-005",
      "Canopée",
      "Q-306",
      "quote_sent",
      "2026-09-16T09:00:00Z",
    ),
    event(
      "L-007",
      "E-006",
      "Atelier",
      "Q-204",
      "quote_sent",
      "2026-09-10T09:00:00Z",
    ),
    event(
      "L-008",
      "E-007",
      "Atelier",
      "Q-204",
      "accepted",
      "2026-09-11T10:00:00Z",
    ),
  ],
};

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
export const MAX_BYTES = 2 * 1024 * 1024;
export const CHANNELS = ["Amazon", "Cdiscount", "Rakuten"];
const enc = new TextEncoder(),
  hash = (x) => bytesToHex(sha256(enc.encode(JSON.stringify(x))));
function keys(x, names, label) {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    Object.keys(x).length !== names.length ||
    names.some((k) => !Object.hasOwn(x, k))
  )
    throw Error(`${label} : structure inattendue.`);
}
function identifier(x, label) {
  if (typeof x !== "string" || !/^[-A-Za-z0-9_]{1,40}$/.test(x))
    throw Error(
      `${label} : lettres, chiffres, tirets et soulignés, 40 caractères maximum.`,
    );
  return x;
}
function qty(x, nullable, min = 0) {
  if (nullable && x === null) return null;
  if (!Number.isInteger(x) || x < min || x > 1000000)
    throw Error(`Quantité entière de ${min} à 1 000 000 requise.`);
  return x;
}
export function normalize(input) {
  keys(input, ["format", "stocks", "events", "cursor", "review"], "Dossier");
  if (input.format !== "fluid-dossier-v1")
    throw Error("Format de dossier non reconnu.");
  if (
    !Array.isArray(input.stocks) ||
    input.stocks.length < 1 ||
    input.stocks.length > 80
  )
    throw Error("De 1 à 80 stocks de départ requis.");
  const skus = new Set(),
    stocks = input.stocks.map((s) => {
      keys(s, ["sku", "initial"], "Stock");
      identifier(s.sku, "Référence");
      if (skus.has(s.sku)) throw Error("Référence de stock dupliquée.");
      skus.add(s.sku);
      return { sku: s.sku, initial: qty(s.initial, true) };
    });
  if (
    !Array.isArray(input.events) ||
    input.events.length < 1 ||
    input.events.length > 400
  )
    throw Error("De 1 à 400 réceptions requises.");
  const rowIds = new Set(),
    events = input.events.map((e) => {
      keys(
        e,
        ["rowId", "eventId", "channel", "orderId", "sku", "kind", "quantity"],
        "Réception",
      );
      for (const k of ["rowId", "eventId", "orderId", "sku"])
        identifier(e[k], k);
      if (rowIds.has(e.rowId))
        throw Error("Identifiant de réception rowId dupliqué.");
      rowIds.add(e.rowId);
      if (!CHANNELS.includes(e.channel))
        throw Error("Canal non reconnu dans ce schéma d’exemple.");
      if (!["reserve", "cancel"].includes(e.kind))
        throw Error("Type attendu : reserve ou cancel.");
      if (e.kind === "cancel" && e.quantity !== null)
        throw Error(
          "Une annulation reprend la quantité commandée : quantity doit être null.",
        );
      return {
        ...e,
        quantity: e.kind === "reserve" ? qty(e.quantity, false, 1) : null,
      };
    });
  if (
    !Number.isInteger(input.cursor) ||
    input.cursor < 0 ||
    input.cursor > events.length
  )
    throw Error("Position de lecture invalide.");
  if (
    input.review !== null &&
    (typeof input.review !== "string" || !/^[a-f0-9]{64}$/.test(input.review))
  )
    throw Error("Empreinte de revue invalide.");
  const result = {
    format: "fluid-dossier-v1",
    stocks,
    events,
    cursor: input.cursor,
    review: input.review,
  };
  if (enc.encode(JSON.stringify(result, null, 2)).length > MAX_BYTES)
    throw Error("Dossier supérieur à 2 Mo.");
  return result;
}
const eventKey = (e) => JSON.stringify([e.channel, e.eventId]);
const orderKey = (e) => JSON.stringify([e.channel, e.orderId, e.sku]);
const payload = (e) =>
  JSON.stringify([e.channel, e.eventId, e.orderId, e.sku, e.kind, e.quantity]);
export function fingerprint(state) {
  const s = normalize(state);
  return hash({ stocks: s.stocks, events: s.events, cursor: s.cursor });
}
export function replay(state) {
  const s = normalize(state),
    eventGroups = new Map(),
    orderGroups = new Map();
  // The whole supplied batch is preflighted. A contradictory identity is never chosen by arrival order.
  for (const e of s.events) {
    const k = eventKey(e);
    if (!eventGroups.has(k)) eventGroups.set(k, new Set());
    eventGroups.get(k).add(payload(e));
  }
  const collisions = new Set(
    [...eventGroups]
      .filter(([, values]) => values.size > 1)
      .map(([key]) => key),
  );
  for (const e of s.events)
    if (e.kind === "reserve" && !collisions.has(eventKey(e))) {
      const k = orderKey(e);
      if (!orderGroups.has(k)) orderGroups.set(k, new Set());
      orderGroups.get(k).add(e.quantity);
    }
  const orderConflicts = new Set(
    [...orderGroups]
      .filter(([, values]) => values.size > 1)
      .map(([key]) => key),
  );
  const initial = new Map(s.stocks.map((x) => [x.sku, x.initial])),
    reserved = new Map(),
    orders = new Map(),
    pending = new Map(),
    seen = new Set(),
    trace = [];
  for (const e of s.events.slice(0, s.cursor)) {
    const record = {
      rowId: e.rowId,
      index: trace.length + 1,
      eventId: e.eventId,
      channel: e.channel,
      orderId: e.orderId,
      sku: e.sku,
      kind: e.kind,
      status: "",
      decision: "",
      quantity: e.quantity,
      delta: 0,
      resolution: "",
    };
    trace.push(record);
    const ek = eventKey(e),
      ok = orderKey(e);
    if (collisions.has(ek)) {
      record.status = "collision";
      record.decision =
        "Identifiant contradictoire dans le lot. Toutes ses versions sont écartées du calcul.";
      continue;
    }
    if (orderConflicts.has(ok)) {
      record.status = "order-conflict";
      record.decision =
        "Quantités contradictoires pour cette ligne de commande. Ligne mise en quarantaine.";
      continue;
    }
    if (seen.has(ek)) {
      record.status = "duplicate";
      record.decision = "Réception identique déjà traitée, aucun nouvel effet.";
      continue;
    }
    seen.add(ek);
    if (!reserved.has(e.sku)) reserved.set(e.sku, 0);
    if (e.kind === "reserve") {
      if (orders.has(ok)) {
        record.status = "duplicate-order";
        record.decision =
          "Ligne de commande déjà connue avec la même quantité, aucun nouvel effet.";
        continue;
      }
      const cancellations = pending.get(ok) || [];
      const cancelled = cancellations.length > 0;
      orders.set(ok, { quantity: e.quantity, cancelled });
      if (cancelled) {
        record.status = "cancelled-on-arrival";
        record.decision =
          "Commande rapprochée de son annulation antérieure. Aucune réservation nette.";
          for (const old of cancellations) {
            old.status = "resolved";
            old.quantity = e.quantity;
          old.resolution = `Rapprochée de la réception ${record.index}, quantité ${e.quantity}.`;
        }
        pending.delete(ok);
      } else {
        reserved.set(e.sku, reserved.get(e.sku) + e.quantity);
        record.delta = -e.quantity;
        record.status = "reserved";
        record.decision =
          "Quantité réservée une seule fois pour cette ligne de commande.";
      }
    } else {
      const known = orders.get(ok);
      if (!known) {
        record.status = "waiting";
        record.decision =
          "Commande absente à ce stade. Annulation en attente, aucun stock recrédité.";
        if (!pending.has(ok)) pending.set(ok, []);
        pending.get(ok).push(record);
      } else if (known.cancelled) {
        record.status = "already-cancelled";
        record.quantity = known.quantity;
        record.decision = "Cette ligne est déjà annulée, aucun nouveau crédit.";
      } else {
        known.cancelled = true;
        reserved.set(e.sku, reserved.get(e.sku) - known.quantity);
        record.delta = known.quantity;
        record.quantity = known.quantity;
        record.status = "cancelled";
        record.decision = "Annulation de la quantité réellement réservée.";
      }
    }
  }
  const allSkus = [...new Set([...initial.keys(), ...reserved.keys()])];
  const stocks = allSkus.map((sku) => {
    const amount = initial.get(sku) ?? null,
      held = reserved.get(sku) || 0;
    return {
      sku,
      initial: amount,
      reserved: held,
      available: amount === null ? null : amount - held,
      unknown: amount === null,
      negative: amount !== null && amount - held < 0,
    };
  });
  const unresolved = trace
    .filter((r) =>
      ["collision", "order-conflict", "waiting"].includes(r.status),
    )
    .map((r) => ({ type: r.status, rowId: r.rowId, message: r.decision }));
  for (const stock of stocks) {
    if (stock.unknown)
      unresolved.push({
        type: "unknown-stock",
        sku: stock.sku,
        message: "Stock de départ inconnu, disponible non calculable.",
      });
    if (stock.negative)
      unresolved.push({
        type: "negative-stock",
        sku: stock.sku,
        message: `Disponible négatif (${stock.available}), à examiner.`,
      });
  }
  return {
    trace,
    stocks,
    unresolved,
    complete: s.cursor === s.events.length,
    preflight: {
      collisionGroups: collisions.size,
      orderConflictGroups: orderConflicts.size,
    },
    reviewed:
      s.cursor === s.events.length &&
      !unresolved.length &&
      s.review === fingerprint(s),
  };
}
export function step(state, all = false) {
  const s = normalize(state);
  return normalize({
    ...s,
    cursor: all ? s.events.length : Math.min(s.events.length, s.cursor + 1),
    review: null,
  });
}
export function rewind(state) {
  return normalize({ ...state, cursor: 0, review: null });
}
export function editEvent(state, rowId, patch) {
  const s = normalize(state);
  if (!s.events.some((e) => e.rowId === rowId))
    throw Error("Réception absente.");
  const events = s.events.map((e) =>
    e.rowId === rowId ? { ...e, ...patch, rowId: e.rowId } : e,
  );
  if (JSON.stringify(events) === JSON.stringify(s.events)) return s;
  return normalize({ ...s, events, cursor: 0, review: null });
}
export function moveEvent(state, rowId, direction) {
  const s = normalize(state),
    i = s.events.findIndex((e) => e.rowId === rowId),
    to = i + direction;
  if (![-1, 1].includes(direction) || i < 0 || to < 0 || to >= s.events.length)
    throw Error("Déplacement hors du flux.");
  const events = [...s.events];
  [events[i], events[to]] = [events[to], events[i]];
  return normalize({ ...s, events, cursor: 0, review: null });
}
export function reviewResult(state) {
  const s = normalize(state),
    r = replay(s);
  if (!r.complete || r.unresolved.length)
    throw Error("Terminez le lot et résolvez les réserves avant la revue.");
  return { ...s, review: fingerprint(s) };
}
export function restore(raw) {
  if (typeof raw !== "string" || enc.encode(raw).length > MAX_BYTES)
    throw Error("Le fichier est limité à 2 Mo.");
  const s = normalize(JSON.parse(raw));
  if (!replay(s).reviewed) s.review = null;
  return s;
}
export const journalHeaders = [
  "index",
  "rowId",
  "eventId",
  "channel",
  "orderId",
  "sku",
  "status",
  "quantity",
  "delta",
  "decision",
  "resolution",
];
export function report(state) {
  const s = normalize(state),
    r = replay(s);
  return {
    title: "Rejouage local du flux de commandes",
    subtitle: r.reviewed
      ? "Résultat complet relu."
      : `Document provisoire, ${s.cursor}/${s.events.length} réceptions traitées.`,
    sections: [
      {
        title: "Conventions du lot",
        paragraphs: [
          "Schéma fictif, aucune connexion Prestashop ou marketplace. Le lot entier est contrôlé avant lecture : identifiant contradictoire ou quantité de commande contradictoire met le groupe en quarantaine.",
          "Les annulations portent une ligne complète canal / commande / SKU. La réservation est un état de recette, pas un stock physique certifié. Aucun écrêtage du stock négatif.",
        ],
      },
      {
        title: "Stocks",
        headers: ["Référence", "Initial", "Réservé", "Disponible"],
        rows: r.stocks.map((x) => [
          x.sku,
          x.initial ?? "Inconnu",
          x.reserved,
          x.available ?? "Inconnu",
        ]),
      },
      {
        title: "Réceptions traitées",
        headers: journalHeaders,
        rows: r.trace.map((x) => journalHeaders.map((h) => x[h] ?? "")),
      },
      {
        title: "Réserves",
        paragraphs: r.unresolved.map(
          (x) => (x.rowId || x.sku) + " : " + x.message,
        ),
      },
    ],
  };
}
export function seed() {
  return {
    format: "fluid-dossier-v1",
    stocks: [
      { sku: "TASSE-BLEUE", initial: 8 },
      { sku: "SAC-LIN", initial: 5 },
    ],
    events: [
      {
        rowId: "r1",
        eventId: "evt-01",
        channel: "Amazon",
        orderId: "C-204",
        sku: "TASSE-BLEUE",
        kind: "cancel",
        quantity: null,
      },
      {
        rowId: "r2",
        eventId: "evt-02",
        channel: "Cdiscount",
        orderId: "C-203",
        sku: "TASSE-BLEUE",
        kind: "reserve",
        quantity: 3,
      },
      {
        rowId: "r3",
        eventId: "evt-02",
        channel: "Cdiscount",
        orderId: "C-203",
        sku: "TASSE-BLEUE",
        kind: "reserve",
        quantity: 3,
      },
      {
        rowId: "r4",
        eventId: "evt-04",
        channel: "Amazon",
        orderId: "C-204",
        sku: "TASSE-BLEUE",
        kind: "reserve",
        quantity: 2,
      },
      {
        rowId: "r5",
        eventId: "evt-05",
        channel: "Rakuten",
        orderId: "C-205",
        sku: "INCONNU",
        kind: "reserve",
        quantity: 1,
      },
      {
        rowId: "r6",
        eventId: "evt-06",
        channel: "Amazon",
        orderId: "C-206",
        sku: "SAC-LIN",
        kind: "reserve",
        quantity: 2,
      },
      {
        rowId: "r7",
        eventId: "evt-06",
        channel: "Amazon",
        orderId: "C-206",
        sku: "SAC-LIN",
        kind: "reserve",
        quantity: 4,
      },
      {
        rowId: "r8",
        eventId: "evt-08",
        channel: "Cdiscount",
        orderId: "C-207",
        sku: "SAC-LIN",
        kind: "reserve",
        quantity: 1,
      },
    ],
    cursor: 0,
    review: null,
  };
}

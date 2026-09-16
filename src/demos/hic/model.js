import { parseCsv } from "../../shared/files.js";

export const lotHeaders = ["id", "label", "type", "received", "quantity_kg"];
export const movementHeaders = [
  "id",
  "date",
  "source",
  "destination",
  "quantity_kg",
];
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
export function grams(value) {
  const text = String(value).trim().replace(",", ".");
  if (!/^\d{1,7}(?:\.\d{1,3})?$/.test(text))
    throw new Error(
      "Quantité attendue de 0 à 9 999 999 kg, avec trois décimales maximum.",
    );
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}
export const kg = (value) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(
    value / 1000,
  );
export function validDate(value) {
  return (
    /^20\d\d-\d\d-\d\d$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function text(value, label, max = 80) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new Error(
      `${label} est vide, trop long ou contient un caractère de contrôle.`,
    );
  return value.trim();
}
function rows(value, headers, limit) {
  if (!Array.isArray(value) || !value.length || value.length > limit)
    throw new Error(`Le fichier doit contenir de 1 à ${limit} lignes.`);
  const seen = new Set();
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new Error(`Ligne ${index + 1} invalide.`);
    const result = Object.fromEntries(
      headers.map((key) => [key, text(row[key], `${key}, ligne ${index + 1}`)]),
    );
    if (!identifier.test(result.id) || seen.has(result.id))
      throw new Error(`Identifiant invalide ou dupliqué : ${result.id}.`);
    seen.add(result.id);
    grams(result.quantity_kg);
    return result;
  });
}
export function validateLots(value) {
  return rows(value, lotHeaders, 60).map((lot) => {
    if (!["matiere", "produit"].includes(lot.type))
      throw new Error(
        `Type inconnu pour ${lot.id} : matiere ou produit attendu.`,
      );
    if (!validDate(lot.received))
      throw new Error(
        `Date de disponibilité invalide pour ${lot.id} (2000–2099).`,
      );
    if (lot.type === "produit" && grams(lot.quantity_kg) !== 0)
      throw new Error(
        `Le produit ${lot.id} doit commencer à zéro ; sa quantité provient des mouvements.`,
      );
    return lot;
  });
}
export function validateMovements(value) {
  return rows(value, movementHeaders, 500).map((movement) => {
    if (!validDate(movement.date))
      throw new Error(`Date invalide pour ${movement.id} (2000–2099).`);
    if (
      !identifier.test(movement.source) ||
      !identifier.test(movement.destination)
    )
      throw new Error(`Référence invalide pour ${movement.id}.`);
    if (!grams(movement.quantity_kg))
      throw new Error(
        `La quantité de ${movement.id} doit être strictement positive.`,
      );
    return movement;
  });
}
export const importLots = (raw) =>
  validateLots(
    parseCsv(raw, { requiredHeaders: lotHeaders, maxRows: 60 }).rows,
  );
export const importMovements = (raw) =>
  validateMovements(
    parseCsv(raw, { requiredHeaders: movementHeaders, maxRows: 500 }).rows,
  );
export function reachable(start, edges, direction = "down") {
  const result = new Set(),
    pending = [start];
  while (pending.length) {
    const current = pending.pop();
    for (const edge of edges) {
      const from = direction === "down" ? edge.source : edge.destination;
      const to = direction === "down" ? edge.destination : edge.source;
      if (from === current && to !== start && !result.has(to)) {
        result.add(to);
        pending.push(to);
      }
    }
  }
  return result;
}
export function calculate(lots, movements) {
  const index = new Map(lots.map((lot) => [lot.id, lot]));
  const balances = Object.fromEntries(
    lots.map((lot) => [lot.id, grams(lot.quantity_kg)]),
  );
  const incoming = Object.fromEntries(lots.map((lot) => [lot.id, 0]));
  const edges = [],
    results = [];
  const sorted = [...movements].sort(
    (a, b) => compare(a.date, b.date) || compare(a.id, b.id),
  );
  for (const movement of sorted) {
    const source = index.get(movement.source),
      destination = index.get(movement.destination);
    const amount = grams(movement.quantity_kg);
    let reason = "";
    if (!source || !destination)
      reason = "Lot d’origine ou de destination inconnu.";
    else if (
      movement.source === movement.destination ||
      reachable(movement.destination, edges).has(movement.source)
    )
      reason = "Ce mouvement créerait un cycle de filiation.";
    else if (destination.type !== "produit")
      reason = "La destination doit être un produit, sans stock initial.";
    else if (
      source.received > movement.date ||
      destination.received > movement.date
    )
      reason = "Le mouvement précède la disponibilité d’un lot.";
    else if (balances[movement.source] < amount)
      reason = `Dépassement de ${kg(amount - balances[movement.source])} kg.`;
    else if (!Number.isSafeInteger(balances[movement.destination] + amount))
      reason = "La quantité cumulée dépasse la précision autorisée.";
    const before = source ? balances[movement.source] : null;
    if (!reason) {
      balances[movement.source] -= amount;
      balances[movement.destination] += amount;
      incoming[movement.destination] += amount;
      edges.push({ ...movement, grams: amount });
    }
    results.push({
      ...movement,
      grams: amount,
      valid: !reason,
      reason: reason || "Retenu",
      availableBefore: before,
    });
  }
  return {
    balances,
    incoming,
    edges,
    results,
    valid: results.filter((r) => r.valid),
    rejected: results.filter((r) => !r.valid),
  };
}
export function graphLayout(lots, edges) {
  const depth = new Map(lots.map((lot) => [lot.id, 0]));
  for (let pass = 0; pass < lots.length; pass++) {
    let changed = false;
    for (const edge of edges)
      if (depth.get(edge.destination) <= depth.get(edge.source)) {
        depth.set(edge.destination, depth.get(edge.source) + 1);
        changed = true;
      }
    if (!changed) break;
  }
  const counts = new Map();
  const nodes = lots.map((lot) => {
    const column = depth.get(lot.id),
      row = counts.get(column) || 0;
    counts.set(column, row + 1);
    return { ...lot, x: 24 + column * 270, y: 25 + row * 112 };
  });
  return {
    nodes,
    width: Math.max(770, ...nodes.map((n) => n.x + 228)),
    height: Math.max(285, ...nodes.map((n) => n.y + 105)),
  };
}
export function restore(value) {
  if (value?.schema !== "hic-lots-v1")
    throw new Error("Dossier HIC v1 attendu.");
  const lots = validateLots(value.lots),
    movements = validateMovements(value.movements);
  const journal = Array.isArray(value.journal)
    ? value.journal
        .slice(-40)
        .map((entry) => text(entry, "Entrée du journal", 300))
    : [];
  return { schema: "hic-lots-v1", lots, movements, journal };
}
export function validState(value) {
  try {
    restore(value);
    return true;
  } catch {
    return false;
  }
}
export const seed = {
  schema: "hic-lots-v1",
  lots: [
    {
      id: "BOIS-01",
      label: "Chêne",
      type: "matiere",
      received: "2026-09-10",
      quantity_kg: "120",
    },
    {
      id: "BOIS-02",
      label: "Frêne",
      type: "matiere",
      received: "2026-09-10",
      quantity_kg: "80",
    },
    {
      id: "LOT-A",
      label: "Brut",
      type: "produit",
      received: "2026-09-12",
      quantity_kg: "0",
    },
    {
      id: "LOT-B",
      label: "Finition",
      type: "produit",
      received: "2026-09-12",
      quantity_kg: "0",
    },
    {
      id: "LOT-C",
      label: "Composants",
      type: "produit",
      received: "2026-09-12",
      quantity_kg: "0",
    },
    {
      id: "LOT-D",
      label: "Seconde série",
      type: "produit",
      received: "2026-09-12",
      quantity_kg: "0",
    },
  ],
  movements: [
    {
      id: "M01",
      date: "2026-09-12",
      source: "BOIS-01",
      destination: "LOT-A",
      quantity_kg: "60",
    },
    {
      id: "M02",
      date: "2026-09-13",
      source: "LOT-A",
      destination: "LOT-B",
      quantity_kg: "38",
    },
    {
      id: "M03",
      date: "2026-09-13",
      source: "BOIS-02",
      destination: "LOT-C",
      quantity_kg: "35",
    },
    {
      id: "M04",
      date: "2026-09-14",
      source: "BOIS-01",
      destination: "LOT-D",
      quantity_kg: "75",
    },
  ],
  journal: ["Exemple fictif chargé ; M04 contient une consommation excessive."],
};

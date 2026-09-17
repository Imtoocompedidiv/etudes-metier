import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { reportHtml } from "../../shared/files.js";

export const MAX_BYTES = 10 * 1024 * 1024;
export const LIMIT = 500;
export const countText = (count, singular, plural = `${singular}s`) =>
  `${count} ${count > 1 ? plural : singular}`;
const fail = (message) => {
  throw Error(message);
};
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const shape = (x, fields, label) => {
  if (
    !object(x) ||
    Object.keys(x).length !== fields.length ||
    fields.some((k) => !Object.hasOwn(x, k))
  )
    fail(`${label} : structure inattendue.`);
};
const string = (x, label, max = 100, empty = false) => {
  if (
    typeof x !== "string" ||
    x.length > max ||
    /[\u0000-\u001f]/.test(x) ||
    (!empty && !x.trim())
  )
    fail(
      `${label} : texte ${empty ? "" : "non vide "}de ${max} caractères maximum attendu.`,
    );
  return x.trim();
};
const id = (x, label = "Identifiant") => {
  const v = string(x, label, 80);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(v))
    fail(
      `${label} : lettres, chiffres, tiret, point, barre oblique ou soulignement attendus.`,
    );
  return v;
};
const integer = (x, min, max, label) => {
  if (!Number.isSafeInteger(x) || x < min || x > max)
    fail(`${label} : entier de ${min} à ${max} attendu.`);
  return x;
};
const array = (x, max, label, min = 0) => {
  if (!Array.isArray(x) || x.length < min || x.length > max)
    fail(`${label} : ${min} à ${max} éléments attendus.`);
  return x;
};
const unique = (xs, key, label) => {
  if (new Set(xs.map(key)).size !== xs.length)
    fail(`${label} : identifiant répété.`);
};
const budget = (x) => {
  if (utf8ToBytes(JSON.stringify(x, null, 2)).length > MAX_BYTES)
    fail("Le dossier dépasse 10 Mo. Réduisez le lot ou le journal.");
  return x;
};
export const hash = (x) => bytesToHex(sha256(utf8ToBytes(JSON.stringify(x))));
const key = (source, eventId) => JSON.stringify([source, eventId]);
export const payload = (event) => ({
  type: event.type,
  orderId: event.orderId,
  sku: event.sku,
  qty: event.qty,
  after: [...event.after].sort(),
});
export const fingerprint = (event) => hash(payload(event));
const validatePayload = (x) => {
  shape(x, ["type", "orderId", "sku", "qty", "after"], "Contenu");
  if (!["create", "cancel"].includes(x.type))
    fail("Type de message attendu : create ou cancel.");
  const v = {
    type: x.type,
    orderId: id(x.orderId, "Commande"),
    sku: string(x.sku, "Référence source", 80, x.type === "cancel"),
    qty: integer(
      x.qty,
      x.type === "create" ? 1 : 0,
      x.type === "create" ? 10000 : 0,
      "Quantité",
    ),
    after: array(x.after, 10, "Dépendances")
      .map((v) => id(v, "Dépendance"))
      .sort(),
  };
  unique(v.after, (x) => x, "Dépendances");
  if (v.type === "cancel" && v.sku !== "")
    fail("Une annulation porte sku vide et qty égal à zéro.");
  return v;
};
const normalizeEvent = (x) => {
  shape(
    x,
    [
      "lineId",
      "eventId",
      "type",
      "orderId",
      "sku",
      "qty",
      "after",
      "pauseOnce",
    ],
    "Message",
  );
  if (typeof x.pauseOnce !== "boolean")
    fail("pauseOnce doit être un booléen explicite.");
  const v = {
    lineId: id(x.lineId, "Ligne"),
    eventId: id(x.eventId, "Événement"),
    ...validatePayload({
      type: x.type,
      orderId: x.orderId,
      sku: x.sku,
      qty: x.qty,
      after: x.after,
    }),
    pauseOnce: x.pauseOnce,
  };
  if (v.after.includes(v.eventId))
    fail(`Le message ${v.eventId} ne peut pas dépendre de lui-même.`);
  return v;
};
export function normalizeBatch(x) {
  shape(x, ["label", "source", "events"], "Lot");
  const b = {
    label: string(x.label, "Libellé du lot", 160),
    source: id(x.source, "Source"),
    events: array(x.events, LIMIT, "Messages", 1).map(normalizeEvent),
  };
  unique(b.events, (e) => e.lineId, "Lignes du lot");
  return b;
}
const normalizeLedger = (xs) => {
  const ledger = array(xs, 2000, "Registre appliqué").map((x) => {
    shape(
      x,
      ["source", "eventId", "payload", "mappedSku"],
      "Événement appliqué",
    );
    const p = validatePayload(x.payload);
    const mappedSku = string(
      x.mappedSku,
      "Référence cible",
      80,
      p.type === "cancel",
    );
    if (p.type === "cancel" && mappedSku !== "")
      fail("Une annulation appliquée ne porte pas de référence cible.");
    return {
      source: id(x.source, "Source appliquée"),
      eventId: id(x.eventId),
      payload: p,
      mappedSku,
    };
  });
  unique(ledger, (e) => key(e.source, e.eventId), "Registre appliqué");
  // The local target is rebuilt from the ledger, never trusted from imported totals.
  target(ledger, true);
  return ledger;
};
export function target(ledger, validate = false) {
  const orders = new Map(),
    applied = new Set();
  for (const row of ledger) {
    const p = row.payload,
      k = key(row.source, p.orderId);
    if (validate && p.after.some((dep) => !applied.has(key(row.source, dep))))
      fail(`Registre : prérequis absent pour ${row.eventId}.`);
    if (p.type === "create") {
      if (orders.has(k)) fail(`Registre : création répétée de ${p.orderId}.`);
      orders.set(k, {
        source: row.source,
        orderId: p.orderId,
        sku: row.mappedSku,
        qty: p.qty,
        state: "Ouverte",
        createdBy: row.eventId,
        cancelledBy: "",
      });
    } else {
      const before = orders.get(k);
      if (!before || before.state !== "Ouverte")
        fail(`Registre : annulation sans commande ouverte pour ${p.orderId}.`);
      orders.set(k, { ...before, state: "Annulée", cancelledBy: row.eventId });
    }
    applied.add(key(row.source, row.eventId));
  }
  return [...orders.values()];
}
const normalizeBase = (raw) => {
  shape(
    raw,
    ["batch", "mapping", "ledger", "attempts", "decisions"],
    "État de reprise",
  );
  const batch = normalizeBatch(raw.batch);
  const mapping = array(raw.mapping, 500, "Correspondances").map((r) => {
    shape(r, ["from", "to", "note"], "Correspondance");
    return {
      from: string(r.from, "Référence source", 80),
      to: string(r.to, "Référence cible", 80),
      note: string(r.note, "Motif de correspondance", 300),
    };
  });
  unique(mapping, (m) => m.from, "Correspondances");
  const lines = new Set(batch.events.map((e) => e.lineId));
  const attempts = array(raw.attempts, LIMIT, "Tentatives").map((r) => {
    shape(r, ["lineId", "count"], "Tentative");
    const v = {
      lineId: id(r.lineId, "Ligne"),
      count: integer(r.count, 1, 10000, "Tentatives"),
    };
    if (!lines.has(v.lineId))
      fail("Tentative liée à une ligne absente du lot.");
    return v;
  });
  const decisions = array(raw.decisions, LIMIT, "Décisions").map((r) => {
    shape(r, ["lineId", "note"], "Décision");
    const v = {
      lineId: id(r.lineId, "Ligne"),
      note: string(r.note, "Motif", 300),
    };
    if (!lines.has(v.lineId)) fail("Décision liée à une ligne absente du lot.");
    return v;
  });
  unique(attempts, (r) => r.lineId, "Tentatives");
  unique(decisions, (r) => r.lineId, "Décisions");
  return budget({
    batch,
    mapping,
    ledger: normalizeLedger(raw.ledger),
    attempts,
    decisions,
  });
};
export const baseOf = (d) => ({
  batch: d.batch,
  mapping: d.mapping,
  ledger: d.ledger,
  attempts: d.attempts,
  decisions: d.decisions,
});
export const STATUS = {
  duplicate: "Déjà reçu",
  conflict: "Contenu divergent",
  ready: "À traiter",
  waiting: "Dépendance en attente",
  missing: "Prérequis absent",
  cycle: "Cycle de dépendances",
  mapping: "Référence à relier",
  domain: "Commande incompatible",
  excluded: "Mis de côté",
  applied: "Appliqué",
  interrupted: "Interruption de test",
};
export const blocked = (status) =>
  [
    "conflict",
    "waiting",
    "missing",
    "cycle",
    "mapping",
    "domain",
    "interrupted",
  ].includes(status);
const cycles = (batch) => {
  const graph = new Map(batch.events.map((e) => [e.eventId, e.after])),
    marks = new Map(),
    stack = [],
    inCycle = new Set();
  function visit(id) {
    if (marks.get(id) === 2 || !graph.has(id)) return;
    if (marks.get(id) === 1) {
      const start = stack.indexOf(id);
      stack.slice(start).forEach((x) => inCycle.add(x));
      return;
    }
    marks.set(id, 1);
    stack.push(id);
    for (const dep of graph.get(id)) visit(dep);
    stack.pop();
    marks.set(id, 2);
  }
  for (const id of graph.keys()) visit(id);
  return inCycle;
};
const context = (b) => {
  const active = b.batch.events.filter(
    (e) => !b.decisions.some((d) => d.lineId === e.lineId),
  );
  const variants = new Map();
  for (const e of active) {
    const set = variants.get(e.eventId) || new Set();
    set.add(fingerprint(e));
    variants.set(e.eventId, set);
  }
  return { variants, cycleIds: cycles({ events: active }) };
};
const inspectBase = (b, e, c) => {
  const note = b.decisions.find((d) => d.lineId === e.lineId);
  if (note) return { status: "excluded", reason: note.note };
  const previous = b.ledger.find(
    (r) => r.source === b.batch.source && r.eventId === e.eventId,
  );
  if (previous)
    return fingerprint(e) === hash(previous.payload)
      ? {
          status: "duplicate",
          reason:
            "Même identifiant et même contenu déjà appliqués. Aucun nouvel effet.",
        }
      : {
          status: "conflict",
          reason:
            "Cet identifiant est déjà appliqué avec un autre contenu. Aucun écrasement.",
        };
  if (c.variants.get(e.eventId)?.size > 1)
    return {
      status: "conflict",
      reason:
        "Plusieurs contenus actifs portent ce nouvel identifiant dans le lot. Aucun choix automatique.",
    };
  if (c.cycleIds.has(e.eventId))
    return {
      status: "cycle",
      reason: "Les dépendances forment un cycle dans ce lot.",
    };
  const absent = e.after.filter(
    (dep) =>
      !b.ledger.some((r) => r.source === b.batch.source && r.eventId === dep),
  );
  if (absent.length) {
    const missing = absent.filter(
      (dep) => !b.batch.events.some((r) => r.eventId === dep),
    );
    return missing.length
      ? {
          status: "missing",
          reason: `Prérequis hors du registre et du lot : ${missing.join(", ")}.`,
        }
      : {
          status: "waiting",
          reason: `Attend l’application de ${absent.join(", ")}.`,
        };
  }
  if (e.type === "create" && !b.mapping.some((r) => r.from === e.sku))
    return {
      status: "mapping",
      reason: `La référence ${e.sku} n’a pas de correspondance cible.`,
    };
  const order = target(b.ledger).find(
    (r) => r.source === b.batch.source && r.orderId === e.orderId,
  );
  if (e.type === "create" && order)
    return {
      status: "domain",
      reason: "Cette commande existe déjà sous un autre événement de création.",
    };
  if (e.type === "cancel" && !order)
    return {
      status: "domain",
      reason: "La commande à annuler est absente de la cible locale.",
    };
  if (e.type === "cancel" && order.state !== "Ouverte")
    return {
      status: "domain",
      reason: "La commande est déjà annulée par un autre événement.",
    };
  return {
    status: "ready",
    reason:
      e.pauseOnce && !b.attempts.some((r) => r.lineId === e.lineId)
        ? "Une interruption de test est prévue à la première tentative."
        : "Le message peut être traité dans la cible locale.",
  };
};
export function plan(d) {
  const b = baseOf(d),
    c = context(b);
  return d.batch.events.map((e) => ({
    lineId: e.lineId,
    eventId: e.eventId,
    ...inspectBase(b, e, c),
    attempt: d.attempts.find((r) => r.lineId === e.lineId)?.count || 0,
  }));
}

function executeBase(input) {
  const b = structuredClone(input),
    c = context(b),
    results = new Map(),
    queue = new Set(b.batch.events.map((e) => e.lineId));
  let progress = true;
  while (progress && queue.size) {
    progress = false;
    for (const e of b.batch.events) {
      if (!queue.has(e.lineId)) continue;
      let verdict = inspectBase(b, e, c),
        attempt = b.attempts.find((r) => r.lineId === e.lineId)?.count || 0;
      if (verdict.status === "waiting") continue;
      if (verdict.status === "ready") {
        attempt++;
        b.attempts = b.attempts
          .filter((r) => r.lineId !== e.lineId)
          .concat({ lineId: e.lineId, count: attempt });
        if (e.pauseOnce && attempt === 1)
          verdict = {
            status: "interrupted",
            reason:
              "Interruption locale du scénario avant application. Reprise possible au prochain passage.",
          };
        else {
          if (b.ledger.length >= 2000)
            fail("La cible de test est limitée à 2 000 événements appliqués.");
          const mappedSku =
            e.type === "create"
              ? b.mapping.find((m) => m.from === e.sku).to
              : "";
          b.ledger.push({
            source: b.batch.source,
            eventId: e.eventId,
            payload: payload(e),
            mappedSku,
          });
          verdict = {
            status: "applied",
            reason:
              e.type === "create"
                ? `Commande ${e.orderId} créée, ${countText(e.qty, "pièce")}, référence ${mappedSku}.`
                : `Commande ${e.orderId} annulée.`,
          };
        }
      }
      results.set(e.lineId, {
        lineId: e.lineId,
        eventId: e.eventId,
        ...verdict,
        attempt,
      });
      queue.delete(e.lineId);
      progress = true;
    }
  }
  for (const e of b.batch.events)
    if (queue.has(e.lineId))
      results.set(e.lineId, {
        lineId: e.lineId,
        eventId: e.eventId,
        ...inspectBase(b, e, c),
        attempt: b.attempts.find((r) => r.lineId === e.lineId)?.count || 0,
      });
  return {
    after: b,
    results: b.batch.events.map((e) => results.get(e.lineId)),
  };
}
const normalizeResults = (raw) => {
  const rows = array(raw, LIMIT, "Résultats", 1).map((r) => {
    shape(r, ["lineId", "eventId", "status", "reason", "attempt"], "Résultat");
    if (!Object.hasOwn(STATUS, r.status) || r.status === "ready")
      fail("Statut de résultat inconnu ou non exécuté.");
    return {
      lineId: id(r.lineId),
      eventId: id(r.eventId),
      status: r.status,
      reason: string(r.reason, "Explication", 1000),
      attempt: integer(r.attempt, 0, 10000, "Tentative"),
    };
  });
  unique(rows, (r) => r.lineId, "Résultats");
  return rows;
};
export function normalize(raw) {
  shape(
    raw,
    [
      "format",
      "batch",
      "mapping",
      "ledger",
      "attempts",
      "decisions",
      "runCount",
      "journal",
      "lastRun",
    ],
    "Dossier",
  );
  if (raw.format !== "datafreak-reprise-v1")
    fail("Format de dossier non reconnu.");
  const b = normalizeBase(baseOf(raw)),
    runCount = integer(raw.runCount, 0, 10000, "Numéro de passage");
  const journal = array(raw.journal, 20, "Journal").map((r) => {
    shape(r, ["run", "batchLabel", "source", "results"], "Passage");
    return {
      run: integer(r.run, 1, runCount, "Passage"),
      batchLabel: string(r.batchLabel, "Libellé", 160),
      source: id(r.source),
      results: normalizeResults(r.results),
    };
  });
  if (
    journal.some((r, i) => i > 0 && journal[i - 1].run >= r.run) ||
    (runCount > 0 && journal.at(-1)?.run !== runCount) ||
    (!runCount && journal.length)
  )
    fail("L’ordre du journal ne correspond pas au dernier passage.");
  let lastRun = null;
  if (raw.lastRun !== null) {
    shape(raw.lastRun, ["before", "afterHash", "run"], "Cas de recette");
    const before = normalizeBase(raw.lastRun.before),
      replay = executeBase(before);
    if (
      raw.lastRun.run !== runCount ||
      journal.at(-1)?.batchLabel !== b.batch.label ||
      journal.at(-1)?.source !== b.batch.source ||
      raw.lastRun.afterHash !== hash(b) ||
      hash(replay.after) !== hash(b) ||
      JSON.stringify(replay.results) !== JSON.stringify(journal.at(-1)?.results)
    )
      fail("Le dernier cas de recette ne reproduit pas cet état.");
    lastRun = { before, afterHash: hash(b), run: runCount };
  }
  return budget({
    format: "datafreak-reprise-v1",
    ...b,
    runCount,
    journal,
    lastRun,
  });
}
export function seed() {
  const event = (
    lineId,
    eventId,
    type,
    orderId,
    sku,
    qty,
    after = [],
    pauseOnce = false,
  ) => ({ lineId, eventId, type, orderId, sku, qty, after, pauseOnce });
  const first = event("ligne-1", "evt-101", "create", "C-410", "TS-NOIR-M", 3);
  return normalize({
    format: "datafreak-reprise-v1",
    batch: {
      label: "Lot du 17 septembre",
      source: "boutique-demo",
      events: [
        first,
        event(
          "ligne-2",
          "evt-102",
          "create",
          "C-411",
          "TS-NOIR-M",
          2,
          [],
          true,
        ),
        event("ligne-3", "evt-103", "cancel", "C-411", "", 0, ["evt-102"]),
        event("ligne-4", "evt-101", "create", "C-410", "TS-NOIR-M", 4),
        event("ligne-5", "evt-104", "create", "C-412", "VESTE-S", 1),
        event("ligne-6", "evt-105", "cancel", "C-499", "", 0),
        event("ligne-7", "evt-106", "create", "C-413", "TS-BLEU-M", 2),
      ],
    },
    mapping: [
      {
        from: "TS-NOIR-M",
        to: "TEE-BK-M",
        note: "Correspondance fictive initiale",
      },
      { from: "VESTE-S", to: "JKT-S", note: "Correspondance fictive initiale" },
    ],
    ledger: [
      {
        source: "boutique-demo",
        eventId: "evt-101",
        payload: payload(first),
        mappedSku: "TEE-BK-M",
      },
    ],
    attempts: [],
    decisions: [],
    runCount: 0,
    journal: [],
    lastRun: null,
  });
}
export function runLocal(d) {
  if (d.runCount >= 10000)
    fail("Limite de passages atteinte. Reprenez un nouvel atelier.");
  const before = structuredClone(baseOf(d)),
    { after, results } = executeBase(before),
    run = d.runCount + 1;
  return normalize({
    ...d,
    ...after,
    runCount: run,
    journal: [
      ...d.journal,
      { run, batchLabel: d.batch.label, source: d.batch.source, results },
    ].slice(-20),
    lastRun: { before, afterHash: hash(after), run },
  });
}
export function setMapping(d, from, to, note) {
  from = string(from, "Référence source", 80);
  to = string(to, "Référence cible", 80);
  note = string(note, "Motif", 300);
  if (note.length < 5)
    fail("Expliquez la correspondance en au moins cinq caractères.");
  if (d.mapping.some((m) => m.from === from && m.to === to && m.note === note))
    return d;
  return normalize({
    ...d,
    mapping: [...d.mapping.filter((m) => m.from !== from), { from, to, note }],
    lastRun: null,
  });
}
export function setDecision(d, lineId, note, remove = false) {
  const e = d.batch.events.find((e) => e.lineId === lineId);
  if (!e) fail("Ligne introuvable.");
  const other = d.decisions.filter((x) => x.lineId !== lineId);
  if (remove) return normalize({ ...d, decisions: other, lastRun: null });
  note = string(note, "Motif", 300);
  if (note.length < 5)
    fail("Expliquez la mise à l’écart en au moins cinq caractères.");
  if (
    inspectBase({ ...baseOf(d), decisions: other }, e, context(d)).status ===
    "duplicate"
  )
    fail("Ce message est déjà appliqué. Aucun effet à mettre de côté.");
  if (d.decisions.some((x) => x.lineId === lineId && x.note === note)) return d;
  return normalize({
    ...d,
    decisions: [...other, { lineId, note }],
    lastRun: null,
  });
}
export function parseFile(raw) {
  if (typeof raw !== "string" || utf8ToBytes(raw).length > MAX_BYTES)
    fail("Fichier texte JSON attendu, 10 Mo maximum.");
  let x;
  try {
    x = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    fail("Le fichier ne contient pas un JSON valide.");
  }
  if (x?.format === "datafreak-reprise-v1")
    return { kind: "dossier", value: normalize(x) };
  if (x?.format === "datafreak-lot-v1") {
    shape(x, ["format", "label", "source", "events"], "Fichier de lot");
    return {
      kind: "lot",
      value: normalizeBatch({
        label: x.label,
        source: x.source,
        events: x.events,
      }),
    };
  }
  fail(
    "Formats acceptés : datafreak-lot-v1 (messages) ou datafreak-reprise-v1 (dossier sauvegardé).",
  );
}
export function adoptFile(d, parsed) {
  if (parsed.kind === "dossier") return normalize(parsed.value);
  const batch = normalizeBatch(parsed.value);
  if (hash(batch) === hash(d.batch)) return d;
  return normalize({ ...d, batch, attempts: [], decisions: [], lastRun: null });
}
export const sampleLot = () => ({
  format: "datafreak-lot-v1",
  ...seed().batch,
});
export const currentResults = (d) =>
  d.lastRun?.afterHash === hash(baseOf(d)) ? d.journal.at(-1)?.results : null;
export function testCase(d) {
  if (!currentResults(d))
    fail(
      "Traitez le lot courant pour obtenir un cas de recette reproductible.",
    );
  const replay = executeBase(d.lastRun.before);
  return {
    format: "datafreak-test-v1",
    description:
      "Cas de recette local, entrée et attendu du dernier passage. Aucun appel distant.",
    input: d.lastRun.before,
    expected: {
      ledger: replay.after.ledger,
      attempts: replay.after.attempts,
      target: target(replay.after.ledger),
      results: replay.results,
    },
  };
}
export const targetHeaders = [
  "source",
  "commande",
  "reference",
  "quantite",
  "etat",
  "creation",
  "annulation",
];
export const targetRows = (d) =>
  target(d.ledger).map((r) => [
    r.source,
    r.orderId,
    r.sku,
    r.qty,
    r.state,
    r.createdBy,
    r.cancelledBy,
  ]);
export const journalHeaders = [
  "passage",
  "lot",
  "source",
  "ligne",
  "evenement",
  "situation",
  "tentatives_cumulees_ligne",
  "explication",
];
export const journalRows = (d) =>
  d.journal.flatMap((j) =>
    j.results.map((r) => [
      j.run,
      j.batchLabel,
      j.source,
      r.lineId,
      r.eventId,
      STATUS[r.status],
      r.attempt,
      r.reason,
    ]),
  );
export function report(d) {
  return reportHtml({
    title: "Reprise d’un flux de commandes",
    subtitle: `Prototype indépendant pour DATAFREAK. Données fictives, cible locale préchargée avec un événement dans l’exemple initial. ${countText(d.runCount, "passage réalisé", "passages réalisés")} dans cet atelier ; les 20 derniers sont conservés.`,
    sections: [
      {
        title: "État de la cible locale",
        headers: targetHeaders,
        rows: targetRows(d),
      },
      {
        title: "Qualification actuelle du lot",
        paragraphs: [
          d.lastRun
            ? "Le dernier passage correspond au lot et aux décisions courants."
            : "Aucun passage correspondant aux décisions courantes. La qualification ci-dessous est un plan, pas une exécution.",
        ],
        headers: ["Ligne", "Événement", "Situation", "Explication"],
        rows: plan(d).map((r) => [
          r.lineId,
          r.eventId,
          STATUS[r.status],
          r.reason,
        ]),
      },
      {
        title: "Correspondances appliquées aux nouveaux messages",
        headers: ["Source", "Cible", "Motif"],
        rows: d.mapping.map((m) => [m.from, m.to, m.note]),
      },
      {
        title: "Mises à l’écart",
        headers: ["Ligne", "Motif"],
        rows: d.decisions.map((x) => [x.lineId, x.note]),
      },
      {
        title: "Journal des passages",
        headers: journalHeaders,
        rows: journalRows(d),
      },
    ],
  });
}

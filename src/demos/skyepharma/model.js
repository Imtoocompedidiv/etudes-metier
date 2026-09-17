export const sources = { planning: "Planning", demandes: "Demandes" };
export const states = {
  todo: "À faire",
  doing: "En cours",
  waiting: "En attente",
  done: "Terminée",
};
export const resultLabels = {
  accepted: "Retenu",
  duplicate: "Doublon exact",
  older: "Révision ancienne",
  collision: "Collision",
  invalid: "À corriger",
  unknown: "Statut inconnu",
  ignored: "Écarté par décision",
  conflict: "Révision contradictoire",
  blocked: "Action en attente",
  equivalent: "Révision équivalente",
};
const fields = [
  "eventId",
  "actionId",
  "revision",
  "updatedAt",
  "title",
  "owner",
  "due",
  "rawStatus",
];
const badIds = ["__proto__", "constructor", "prototype"];
const clean = (v, max = 300) => {
  if (typeof v !== "string" || v.length > max)
    throw Error(`Texte attendu, ${max} caractères maximum.`);
  return v.trim();
};
const required = (v, name, max = 300) => {
  const s = clean(v, max);
  if (!s) throw Error(`${name} obligatoire.`);
  return s;
};
const keyOk = (v) =>
  typeof v === "string" &&
  /^[\p{L}\p{N}._ -]{1,80}$/u.test(v) &&
  !badIds.includes(v);
const isoDay = (v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const isoTime = (v) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().replace(".000Z", "Z") === v;
const equal = (a, b) => {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]))
  );
};
const idPair = (a, b) => JSON.stringify([a, b]);
export const rowKey = (batch, index) => `${batch.id}:${index}`;
function eventObject(row) {
  if (!row || typeof row !== "object" || Array.isArray(row))
    throw Error("Événement illisible.");
  return Object.fromEntries(
    fields.map((f) => [
      f,
      f === "revision"
        ? clean(String(row[f] ?? ""), 20)
        : clean(row[f] ?? "", f === "title" ? 300 : 100),
    ]),
  );
}
export function parseLot(value) {
  const d = typeof value === "string" ? JSON.parse(value) : value;
  if (!d || typeof d !== "object") throw Error("Objet JSON attendu.");
  let source, name, rows;
  if (d.format === "planning-v1") {
    source = "planning";
    name = required(d.batch, "Nom du lot", 80);
    rows = d.events;
  } else if (d.format === "demandes-v1") {
    source = "demandes";
    name = required(d.lot, "Nom du lot", 80);
    rows = d.items;
  } else throw Error("Formats attendus : planning-v1 ou demandes-v1.");
  if (!Array.isArray(rows) || !rows.length || rows.length > 200)
    throw Error("Un lot doit contenir de 1 à 200 événements.");
  rows = rows.map((r) => {
    if (!r || typeof r !== "object" || Array.isArray(r))
      throw Error("Chaque événement doit être un objet.");
    const map =
      source === "planning"
        ? {
            eventId: r.id,
            actionId: r.action,
            revision: r.revision,
            updatedAt: r.updatedAt,
            title: r.title,
            owner: r.owner,
            due: r.due,
            rawStatus: r.status,
          }
        : {
            eventId: r.event_id,
            actionId: r.task_id,
            revision: r.version,
            updatedAt: r.timestamp,
            title: r.subject,
            owner: r.assigned_to,
            due: r.deadline,
            rawStatus: r.state,
          };
    for (const [f, v] of Object.entries(map))
      if (
        v !== undefined &&
        v !== null &&
        !(typeof v === "string" || (f === "revision" && typeof v === "number"))
      )
        throw Error(`Champ ${f} : valeur simple attendue.`);
    return eventObject(map);
  });
  return { source, name, rows };
}
function normalizeBasis(d) {
  if (!d || !Array.isArray(d.batches) || d.batches.length > 20)
    throw Error("Dossier limité à 20 lots.");
  const used = new Set();
  let count = 0;
  const batches = d.batches.map((b) => {
    if (
      !b ||
      !/^B\d{4}$/.test(b.id) ||
      used.has(b.id) ||
      !Object.hasOwn(sources, b.source)
    )
      throw Error("Lot ou source invalide.");
    used.add(b.id);
    if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > 200)
      throw Error("Lot vide ou trop volumineux.");
    count += b.rows.length;
    return {
      id: b.id,
      source: b.source,
      name: required(b.name, "Nom du lot", 80),
      rows: b.rows.map(eventObject),
    };
  });
  if (count > 2000) throw Error("Dossier limité à 2 000 événements.");
  const locations = new Set(
    batches.flatMap((b) => b.rows.map((_, i) => rowKey(b, i))),
  );
  const rules = [];
  const ruleKeys = new Set();
  if (!Array.isArray(d.rules) || d.rules.length > 100)
    throw Error("Règles illisibles.");
  for (const r of d.rules) {
    if (
      !r ||
      !Object.hasOwn(sources, r.source) ||
      !Object.hasOwn(states, r.state)
    )
      throw Error("Règle invalide.");
    const rawStatus = required(r.rawStatus, "Statut source", 100),
      id = idPair(r.source, rawStatus);
    if (ruleKeys.has(id)) throw Error("Règle répétée.");
    ruleKeys.add(id);
    rules.push({ source: r.source, rawStatus, state: r.state });
  }
  if (!Array.isArray(d.edits) || d.edits.length > 2000)
    throw Error("Corrections illisibles.");
  const editKeys = new Set();
  const edits = d.edits.map((e) => {
    if (!e || !locations.has(e.key) || editKeys.has(e.key))
      throw Error("Correction sans événement ou répétée.");
    editKeys.add(e.key);
    return {
      key: e.key,
      values: eventObject(e.values),
      reason: required(e.reason, "Motif de correction", 300),
    };
  });
  if (!Array.isArray(d.resolutions) || d.resolutions.length > 2000)
    throw Error("Décisions de collision illisibles.");
  const resolutionKeys = new Set();
  const resolutions = d.resolutions.map((r) => {
    if (
      !r ||
      !Object.hasOwn(sources, r.source) ||
      !keyOk(r.eventId) ||
      !locations.has(r.keep) ||
      resolutionKeys.has(idPair(r.source, r.eventId))
    )
      throw Error("Décision de collision invalide.");
    resolutionKeys.add(idPair(r.source, r.eventId));
    return {
      source: r.source,
      eventId: r.eventId,
      keep: r.keep,
      fingerprint: required(r.fingerprint, "Empreinte", 200000),
    };
  });
  return { batches, rules, edits, resolutions };
}
export const basis = (d) => normalizeBasis(d);
export const fingerprint = (d) => JSON.stringify(basis(d));
export function normalizeDossier(d) {
  if (!d || d.version !== 1)
    throw Error("Dossier Skyepharma version 1 attendu.");
  if (!Array.isArray(d.journal) || d.journal.length > 500)
    throw Error("Journal invalide.");
  const run = (r) => {
    if (r === null) return null;
    if (!r || !isoTime(r.at)) throw Error("Date de rejeu invalide.");
    return { at: r.at, basis: normalizeBasis(r.basis) };
  };
  return {
    version: 1,
    ...normalizeBasis(d),
    lastRun: run(d.lastRun),
    previousRun: run(d.previousRun),
    journal: d.journal.map((j) => ({
      at: required(j.at, "Heure", 50),
      action: required(j.action, "Action", 500),
    })),
  };
}
export const validDossier = (d) => {
  try {
    return equal(d, normalizeDossier(d));
  } catch {
    return false;
  }
};
function validateEvent(e, rules) {
  const errors = [];
  if (!keyOk(e.eventId))
    errors.push("Identifiant d’événement manquant ou invalide.");
  if (!keyOk(e.actionId))
    errors.push("Identifiant d’action manquant ou invalide.");
  if (!/^[1-9]\d{0,5}$/.test(e.revision))
    errors.push("Révision entière de 1 à 999999 requise.");
  if (!isoTime(e.updatedAt))
    errors.push("Horodatage UTC attendu : AAAA-MM-JJTHH:MM:SSZ.");
  if (!isoDay(e.due)) errors.push("Échéance calendaire AAAA-MM-JJ invalide.");
  if (!e.title) errors.push("Intitulé obligatoire.");
  if (!e.owner) errors.push("Responsable obligatoire.");
  const rule = rules.find(
    (r) => r.source === e.source && r.rawStatus === e.rawStatus,
  );
  if (!rule)
    errors.push(
      `Statut « ${e.rawStatus || "(vide)"} » non associé pour ${sources[e.source]}.`,
    );
  return { errors, state: rule?.state || null, unknown: !rule };
}
export function analyze(d) {
  const rows = d.batches.flatMap((b) =>
    b.rows.map((raw, index) => {
      const k = rowKey(b, index),
        edit = d.edits.find((e) => e.key === k);
      const e = { ...raw, ...edit?.values, source: b.source };
      const { errors, state, unknown } = validateEvent(e, d.rules);
      return {
        key: k,
        batchId: b.id,
        batchName: b.name,
        raw,
        event: e,
        edit: edit || null,
        state,
        errors,
        code: errors.length
          ? unknown && errors.length === 1
            ? "unknown"
            : "invalid"
          : "accepted",
        message: errors.join(" "),
        fingerprint: JSON.stringify(fields.map((f) => e[f])),
      };
    }),
  );
  const groups = new Map();
  for (const r of rows)
    if (keyOk(r.event.eventId)) {
      const k = idPair(r.event.source, r.event.eventId);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
  const candidates = [],
    collisions = [];
  for (const group of groups.values()) {
    const distinct = [...new Set(group.map((r) => r.fingerprint))].sort();
    let chosen = group[0];
    if (distinct.length > 1) {
      const fp = JSON.stringify(distinct),
        source = chosen.event.source,
        eventId = chosen.event.eventId;
      const decision = d.resolutions.find(
        (r) =>
          r.source === source &&
          r.eventId === eventId &&
          r.fingerprint === fp &&
          group.some((row) => row.key === r.keep),
      );
      collisions.push({
        source,
        eventId,
        fingerprint: fp,
        keys: group.map((r) => r.key),
        decision: decision || null,
      });
      if (!decision) {
        for (const row of group) {
          row.code = "collision";
          row.message =
            "Même clé source/événement, contenus différents. Choisissez explicitement une version.";
        }
        continue;
      }
      chosen = group.find((r) => r.key === decision.keep);
      for (const row of group)
        if (row.fingerprint !== chosen.fingerprint) {
          row.code = "ignored";
          row.message = `Version écartée au profit de ${chosen.key}.`;
        }
    }
    const same = group.filter((r) => r.fingerprint === chosen.fingerprint);
    for (const row of same)
      if (row.key !== chosen.key) {
        row.code = "duplicate";
        row.message = `Contenu identique à ${chosen.key}, sans effet supplémentaire.`;
      }
    if (!chosen.errors.length) candidates.push(chosen);
  }
  const actions = [];
  const byAction = new Map();
  for (const row of candidates) {
    const k = idPair(row.event.source, row.event.actionId);
    if (!byAction.has(k)) byAction.set(k, []);
    byAction.get(k).push(row);
  }
  for (const list of byAction.values()) {
    const highest = Math.max(...list.map((r) => Number(r.event.revision)));
    const top = list.filter((r) => Number(r.event.revision) === highest);
    for (const row of list)
      if (Number(row.event.revision) < highest) {
        row.code = "older";
        row.message = `Révision ${row.event.revision} antérieure à la révision ${highest}.`;
      }
    const topPayload = new Set(
      top.map((r) =>
        JSON.stringify([r.event.title, r.event.owner, r.event.due, r.state]),
      ),
    );
    if (topPayload.size > 1) {
      for (const row of top) {
        row.code = "conflict";
        row.message =
          "Deux événements décrivent différemment la même révision. Corrigez les données source.";
      }
      continue;
    }
    const selected = top[0];
    const blocking = rows.filter(
      (r) =>
        ["collision", "unknown", "invalid"].includes(r.code) &&
        r.event.source === selected.event.source &&
        r.event.actionId === selected.event.actionId &&
        (!/^[1-9]\d{0,5}$/.test(r.event.revision) ||
          Number(r.event.revision) >= highest),
    );
    if (blocking.length) {
      for (const row of top) {
        row.code = "blocked";
        row.message = `Une version non résolue de cette action empêche sa publication (${blocking.map((r) => r.key).join(", ")}).`;
      }
      continue;
    }
    for (const row of top.slice(1)) {
      row.code = "equivalent";
      row.message = `Même révision et même état métier que ${selected.key}.`;
    }
    actions.push({
      source: selected.event.source,
      actionId: selected.event.actionId,
      title: selected.event.title,
      owner: selected.event.owner,
      due: selected.event.due,
      state: selected.state,
      revision: highest,
      eventId: selected.event.eventId,
      rowKey: selected.key,
      updatedAt: selected.event.updatedAt,
    });
  }
  actions.sort(
    (a, b) =>
      a.source.localeCompare(b.source) || a.actionId.localeCompare(b.actionId),
  );
  return {
    rows,
    actions,
    collisions,
    pending: rows.filter((r) =>
      ["collision", "unknown", "invalid", "conflict", "blocked"].includes(
        r.code,
      ),
    ),
  };
}
export function addLot(d, lot) {
  const next = structuredClone(d);
  const n = Math.max(0, ...d.batches.map((b) => Number(b.id.slice(1)))) + 1;
  next.batches.push({ id: `B${String(n).padStart(4, "0")}`, ...lot });
  return normalizeDossier(next);
}
export function setRule(d, source, rawStatus, state) {
  const next = structuredClone(d);
  next.rules = next.rules.filter(
    (r) => r.source !== source || r.rawStatus !== rawStatus,
  );
  if (state) next.rules.push({ source, rawStatus, state });
  return normalizeDossier(next);
}
export function correctEvent(d, k, values, reason) {
  const next = structuredClone(d);
  next.edits = next.edits.filter((e) => e.key !== k);
  next.edits.push({ key: k, values, reason });
  return normalizeDossier(next);
}
export function removeCorrection(d, k) {
  const next = structuredClone(d);
  next.edits = next.edits.filter((e) => e.key !== k);
  return normalizeDossier(next);
}
export function resolveCollision(d, k) {
  const a = analyze(d),
    collision = a.collisions.find((c) => c.keys.includes(k));
  if (!collision) throw Error("Aucune collision pour cet événement.");
  const next = structuredClone(d);
  next.resolutions = next.resolutions.filter(
    (r) => r.source !== collision.source || r.eventId !== collision.eventId,
  );
  next.resolutions.push({
    source: collision.source,
    eventId: collision.eventId,
    keep: k,
    fingerprint: collision.fingerprint,
  });
  return normalizeDossier(next);
}
export function reopenCollision(d, source, eventId) {
  const next = structuredClone(d);
  next.resolutions = next.resolutions.filter(
    (r) => r.source !== source || r.eventId !== eventId,
  );
  return normalizeDossier(next);
}
export function replay(d, at) {
  if (!isoTime(at)) throw Error("Date de rejeu invalide.");
  const next = structuredClone(d);
  next.previousRun = next.lastRun;
  next.lastRun = { at, basis: basis(d) };
  return normalizeDossier(next);
}
export const isStale = (d) =>
  !d.lastRun || fingerprint(d) !== fingerprint(d.lastRun.basis);
export function changes(before, after) {
  const key = (a) => idPair(a.source, a.actionId),
    keys = new Set([...before.map(key), ...after.map(key)]);
  return [...keys].flatMap((k) => {
    const a = before.find((r) => key(r) === k),
      b = after.find((r) => key(r) === k);
    if (equal(a, b)) return [];
    return [
      {
        source: (b || a).source,
        actionId: (b || a).actionId,
        kind: !a ? "Ajoutée" : !b ? "Retirée" : "Modifiée",
        before: a || null,
        after: b || null,
      },
    ];
  });
}
export const planningExample = {
  format: "planning-v1",
  batch: "Préparation des salles",
  events: [
    {
      id: "PL-01",
      action: "A-10",
      revision: 1,
      updatedAt: "2026-09-15T09:00:00Z",
      title: "Installer la table, salle témoin A",
      owner: "Équipe fictive A",
      due: "2026-09-25",
      status: "en cours",
    },
    {
      id: "PL-02",
      action: "A-10",
      revision: 2,
      updatedAt: "2026-09-16T09:00:00Z",
      title: "Installer la table, salle témoin A",
      owner: "Équipe fictive A",
      due: "2026-09-25",
      status: "terminé",
    },
    {
      id: "PL-03",
      action: "A-12",
      revision: 2,
      updatedAt: "2026-09-16T10:00:00Z",
      title: "Réceptionner les chaises, salle témoin B",
      owner: "Équipe fictive B",
      due: "2026-09-28",
      status: "attente fournisseur",
    },
    {
      id: "PL-02",
      action: "A-10",
      revision: 2,
      updatedAt: "2026-09-16T09:00:00Z",
      title: "Installer la table, salle témoin A",
      owner: "Équipe fictive A",
      due: "2026-09-25",
      status: "terminé",
    },
    {
      id: "PL-00",
      action: "A-10",
      revision: 1,
      updatedAt: "2026-09-14T09:00:00Z",
      title: "Installer la table, salle témoin A",
      owner: "Équipe fictive A",
      due: "2026-09-25",
      status: "à faire",
    },
  ],
};
export const demandesExample = {
  format: "demandes-v1",
  lot: "Demandes des équipes",
  items: [
    {
      event_id: "DE-01",
      task_id: "A-10",
      version: 1,
      timestamp: "2026-09-16T11:00:00Z",
      subject: "Préparer les badges visiteurs fictifs",
      assigned_to: "Accueil fictif",
      deadline: "2026-09-25",
      state: "open",
    },
    {
      event_id: "DE-02",
      task_id: "A-11",
      version: 1,
      timestamp: "2026-09-16T12:00:00Z",
      subject: "Déplacer le tableau, salle témoin C",
      assigned_to: "Équipe fictive C",
      deadline: "2026-09-27",
      state: "in_progress",
    },
    {
      event_id: "DE-02",
      task_id: "A-11",
      version: 1,
      timestamp: "2026-09-16T12:00:00Z",
      subject: "Déplacer le tableau, salle témoin C",
      assigned_to: "Équipe fictive C",
      deadline: "2026-09-27",
      state: "closed",
    },
  ],
};
export const initial = normalizeDossier({
  version: 1,
  batches: [
    { id: "B0001", ...parseLot(planningExample) },
    { id: "B0002", ...parseLot(demandesExample) },
  ],
  rules: [
    { source: "planning", rawStatus: "à faire", state: "todo" },
    { source: "planning", rawStatus: "en cours", state: "doing" },
    { source: "planning", rawStatus: "terminé", state: "done" },
    { source: "demandes", rawStatus: "open", state: "todo" },
    { source: "demandes", rawStatus: "in_progress", state: "doing" },
    { source: "demandes", rawStatus: "closed", state: "done" },
  ],
  edits: [],
  resolutions: [],
  lastRun: null,
  previousRun: null,
  journal: [],
});

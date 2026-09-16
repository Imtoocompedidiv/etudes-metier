import { parseCsv } from "../../shared/files.js";
export const HEADERS = [
  "evenement",
  "client",
  "piece",
  "fichier_present",
  "reponses_test",
];
const CASES = ["200", "429,200", "503,503,503"];
const clone = (v) => structuredClone(v);
const hash = (v) => JSON.stringify(v);
export function clockText(seconds) {
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function payload(v) {
  if (
    !v ||
    typeof v.event !== "string" ||
    !/^[-a-zA-Z0-9_]{1,60}$/.test(v.event) ||
    typeof v.client !== "string" ||
    !/^[A-Z0-9-]{1,20}$/.test(v.client) ||
    typeof v.doc !== "string" ||
    !v.doc.trim() ||
    v.doc.length > 100 ||
    typeof v.hasFile !== "boolean" ||
    !CASES.includes(v.response)
  )
    throw new Error(
      "Événement invalide : identifiant, code client en majuscules, pièce, présence et scénario 200 / 429,200 / 503,503,503 attendus.",
    );
  return {
    event: v.event,
    client: v.client.trim(),
    doc: v.doc.trim(),
    hasFile: v.hasFile,
    response: v.response,
  };
}
function addLog(s, event, action, detail = "") {
  s.log.push({ time: s.clock, event, action, detail });
  if (s.log.length > 3000) s.log = s.log.slice(-3000);
}
export function signature(s, r) {
  return hash([r.working, s.routes[r.working.client] || ""]);
}
export function blockReason(s, r) {
  if (r.variants.length > 1 && r.resolution !== hash(r.variants))
    return "Contenus contradictoires";
  if (!s.routes[r.working.client]) return "Client à rattacher";
  if (!r.working.hasFile) return "Pièce manquante";
  return "";
}
export function status(s, r) {
  const blocked = blockReason(s, r);
  if (blocked) return { key: "blocked", label: blocked };
  if (r.prepared && r.approval === signature(s, r))
    return { key: "prepared", label: "Action préparée" };
  if (r.approval !== signature(s, r))
    return { key: "review", label: "Validation attendue" };
  if (r.attempts >= 3 && r.lastCode !== 200)
    return { key: "failed", label: "Échec après 3 essais" };
  if (r.nextAt !== null)
    return { key: "retry", label: `Reprise à ${clockText(r.nextAt)}` };
  return { key: "approved", label: "Validée, essai à lancer" };
}
function invalidate(r) {
  r.approval = null;
  r.note = "";
  r.attempts = 0;
  r.nextAt = null;
  r.lastCode = null;
  r.prepared = false;
}
export function replay(state) {
  const s = clone(state);
  for (const raw of s.sources) {
    const incoming = payload(raw);
    const found = s.records.find((r) => r.id === incoming.event);
    if (!found) {
      s.records.push({
        id: incoming.event,
        variants: [incoming],
        working: clone(incoming),
        resolution: null,
        approval: null,
        note: "",
        attempts: 0,
        nextAt: null,
        lastCode: null,
        prepared: false,
      });
      addLog(s, incoming.event, "Événement reçu", incoming.doc);
    } else if (found.variants.some((v) => hash(v) === hash(incoming))) {
      addLog(
        s,
        incoming.event,
        "Doublon ignoré",
        "Identifiant et contenu déjà enregistrés.",
      );
    } else {
      found.variants.push(incoming);
      found.resolution = null;
      invalidate(found);
      addLog(
        s,
        incoming.event,
        "Conflit de contenu",
        "Nouvelle version reçue sous le même identifiant.",
      );
    }
  }
  return s;
}
export function editRecord(state, id, changes) {
  const s = clone(state),
    r = s.records.find((r) => r.id === id);
  if (!r) throw new Error("Événement introuvable.");
  const next = payload({ ...r.working, ...changes, event: id });
  if (hash(next) === hash(r.working)) return state;
  r.working = next;
  invalidate(r);
  addLog(
    s,
    id,
    "Correction enregistrée",
    "Validation et préparation retirées ; entrées reçues conservées.",
  );
  return s;
}
export function resolveConflict(state, id, index) {
  const s = clone(state),
    r = s.records.find((r) => r.id === id);
  if (!r || !Number.isInteger(index) || !r.variants[index])
    throw new Error("Choisissez une version reçue.");
  r.working = clone(r.variants[index]);
  r.resolution = hash(r.variants);
  invalidate(r);
  addLog(s, id, "Version retenue", `Version ${index + 1} · ${r.working.doc}`);
  return s;
}
export function approve(state, id, confirmed, note) {
  const s = clone(state),
    r = s.records.find((r) => r.id === id);
  if (!r) throw new Error("Événement introuvable.");
  const reason = blockReason(s, r);
  if (reason)
    throw new Error(`À résoudre avant validation : ${reason.toLowerCase()}.`);
  if (!confirmed) throw new Error("Confirmez le rattachement de la pièce.");
  if (typeof note !== "string" || note.length > 800)
    throw new Error("Note trop longue.");
  r.approval = signature(s, r);
  r.note = note.trim();
  addLog(
    s,
    id,
    "Validation humaine enregistrée",
    r.note || "Rattachement confirmé.",
  );
  return s;
}
function attempt(s, r) {
  if (r.approval !== signature(s, r) || blockReason(s, r))
    throw new Error("Validez le contenu courant avant cet essai.");
  if (r.prepared)
    throw new Error("Une action est déjà préparée pour cet événement.");
  if (r.attempts >= 3)
    throw new Error(
      "Trois essais ont été réalisés. Modifiez le cas fourni pour repartir.",
    );
  if (r.nextAt !== null && s.clock < r.nextAt)
    throw new Error(
      `La reprise attend ${clockText(r.nextAt)} sur l’horloge d’essai.`,
    );
  const responses = r.working.response.split(",").map(Number);
  const code = responses[Math.min(r.attempts, responses.length - 1)];
  if (code !== 200 && r.attempts < 2 && s.clock + 60 * 2 ** r.attempts > 86400)
    throw new Error(
      "La reprise dépasserait la journée d’essai. Rechargez l’exemple ou choisissez un autre cas de réponse avant de relancer.",
    );
  r.attempts++;
  r.lastCode = code;
  if (code === 200) {
    r.prepared = true;
    r.nextAt = null;
    addLog(
      s,
      r.id,
      "Réponse de test 200",
      "Action ajoutée au manifeste local, aucun transfert.",
    );
  } else if (r.attempts >= 3) {
    r.nextAt = null;
    addLog(
      s,
      r.id,
      `Réponse de test ${code}`,
      "Plafond de trois tentatives atteint.",
    );
  } else {
    r.nextAt = s.clock + 60 * 2 ** (r.attempts - 1);
    addLog(
      s,
      r.id,
      `Réponse de test ${code}`,
      `Reprise prévue à ${clockText(r.nextAt)}.`,
    );
  }
}
export function runAttempt(state, id) {
  const s = clone(state),
    r = s.records.find((r) => r.id === id);
  if (!r) throw new Error("Événement introuvable.");
  attempt(s, r);
  return s;
}
export function advance(state, seconds = 60) {
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 1 ||
    seconds > 3600 ||
    state.clock + seconds > 86400
  )
    throw new Error("Avancement de l’horloge invalide.");
  const s = clone(state);
  s.clock += seconds;
  addLog(s, "horloge", "Horloge avancée", `${seconds} secondes.`);
  for (const r of s.records) {
    if (r.nextAt !== null && r.nextAt <= s.clock) attempt(s, r);
  }
  return s;
}
export function editRoute(state, client, destination) {
  if (
    typeof destination !== "string" ||
    !destination.trim() ||
    destination.length > 160 ||
    /[\r\n]/.test(destination) ||
    !Object.hasOwn(state.routes, client)
  )
    throw new Error("Destination attendue pour un client existant.");
  const s = clone(state);
  if (s.routes[client] === destination.trim()) return state;
  s.routes[client] = destination.trim();
  for (const r of s.records) if (r.working.client === client) invalidate(r);
  addLog(
    s,
    "routage",
    "Destination modifiée",
    `${client} · validations correspondantes retirées.`,
  );
  return s;
}
export function parseEvents(raw) {
  const { rows } = parseCsv(raw, { requiredHeaders: HEADERS, maxRows: 300 });
  if (!rows.length) throw new Error("Ajoutez au moins un événement.");
  return rows.map((row, i) => {
    if (!["oui", "non"].includes(row.fichier_present.toLowerCase()))
      throw new Error(`Ligne ${i + 2} : fichier_present vaut oui ou non.`);
    return payload({
      event: row.evenement,
      client: row.client,
      doc: row.piece,
      hasFile: row.fichier_present.toLowerCase() === "oui",
      response: row.reponses_test,
    });
  });
}
export function importEvents(state, raw) {
  const sources = parseEvents(raw);
  return replay({ ...state, sources, records: [], clock: 36000, log: [] });
}
export function manifest(state) {
  return {
    type: "plan-local-sans-transfert",
    clock: clockText(state.clock),
    actions: state.records
      .filter((r) => status(state, r).key === "prepared")
      .map((r) => ({
        event: r.id,
        client: r.working.client,
        piece: r.working.doc,
        destination: state.routes[r.working.client],
        attempts: r.attempts,
        validationNote: r.note,
      })),
    exceptions: state.records
      .filter((r) => status(state, r).key !== "prepared")
      .map((r) => ({
        event: r.id,
        piece: r.working.doc,
        status: status(state, r).label,
      })),
    rules: {
      maxAttempts: 3,
      retrySeconds: [60, 120],
      idempotency: "Identifiant événement et contenu reçu identiques",
      responses: "Cas de test fournis, aucun appel externe",
    },
  };
}
export function recordRows(state) {
  return state.records.map((r) => [
    r.id,
    r.working.client,
    r.working.doc,
    status(state, r).label,
    r.attempts,
    state.routes[r.working.client] || "",
    r.note,
  ]);
}
export function restore(raw) {
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    throw new Error("JSON illisible.");
  }
  if (
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.sources) ||
    !s.sources.length ||
    s.sources.length > 300 ||
    !Array.isArray(s.records) ||
    s.records.length > 300 ||
    !s.routes ||
    typeof s.routes !== "object" ||
    Array.isArray(s.routes) ||
    !Number.isSafeInteger(s.clock) ||
    s.clock < 0 ||
    s.clock > 86400 ||
    !Array.isArray(s.log) ||
    s.log.length > 3000
  )
    throw new Error("Structure du banc non reconnue.");
  const sources = s.sources.map(payload),
    routes = {};
  for (const [key, v] of Object.entries(s.routes)) {
    if (
      !/^[A-Z0-9-]{1,20}$/.test(key) ||
      typeof v !== "string" ||
      !v.trim() ||
      v.length > 160 ||
      /[\r\n]/.test(v)
    )
      throw new Error("Destination invalide.");
    routes[key] = v;
  }
  const records = s.records.map((r) => {
    if (
      !r ||
      typeof r.id !== "string" ||
      !Array.isArray(r.variants) ||
      !r.variants.length ||
      r.variants.length > 300 ||
      typeof r.note !== "string" ||
      r.note.length > 800 ||
      !Number.isInteger(r.attempts) ||
      r.attempts < 0 ||
      r.attempts > 3 ||
      ![null, 200, 429, 503].includes(r.lastCode) ||
      typeof r.prepared !== "boolean" ||
      !(
        r.nextAt === null ||
        (Number.isSafeInteger(r.nextAt) &&
          r.nextAt >= s.clock &&
          r.nextAt <= 86400)
      ) ||
      !(r.approval === null || typeof r.approval === "string") ||
      !(r.resolution === null || typeof r.resolution === "string")
    )
      throw new Error("État d’événement invalide.");
    const working = payload(r.working),
      variants = r.variants.map(payload);
    if (
      working.event !== r.id ||
      variants.some((v) => v.event !== r.id) ||
      !sources.some((v) => v.event === r.id)
    )
      throw new Error("Identifiants incohérents.");
    const received = new Set(sources.filter((v) => v.event === r.id).map(hash));
    const restoredVariants = new Set(variants.map(hash));
    if (
      restoredVariants.size !== variants.length ||
      restoredVariants.size !== received.size ||
      [...received].some((v) => !restoredVariants.has(v))
    )
      throw new Error(
        "Les versions du dossier ne correspondent pas aux entrées reçues.",
      );
    if (
      (r.prepared &&
        (r.lastCode !== 200 || r.attempts < 1 || r.nextAt !== null)) ||
      (r.nextAt !== null &&
        (r.attempts < 1 || r.attempts >= 3 || ![429, 503].includes(r.lastCode)))
    )
      throw new Error("Tentatives incohérentes.");
    const safe = {
      id: r.id,
      variants,
      working,
      resolution: r.resolution,
      approval: r.approval,
      note: r.note,
      attempts: r.attempts,
      nextAt: r.nextAt,
      lastCode: r.lastCode,
      prepared: r.prepared,
    };
    if (
      (safe.prepared || safe.nextAt !== null) &&
      (safe.approval !== signature({ routes }, safe) ||
        blockReason({ routes }, safe))
    )
      throw new Error("Action non validée dans le dossier.");
    return safe;
  });
  if (
    new Set(records.map((r) => r.id)).size !== records.length ||
    new Set(sources.map((v) => v.event)).size !== records.length
  )
    throw new Error("Événements manquants ou répétés dans le dossier.");
  const log = s.log.map((l) => {
    if (
      !Number.isSafeInteger(l.time) ||
      l.time < 0 ||
      l.time > s.clock ||
      typeof l.event !== "string" ||
      typeof l.action !== "string" ||
      l.action.length > 200 ||
      typeof l.detail !== "string" ||
      l.detail.length > 1000
    )
      throw new Error("Journal invalide.");
    return { time: l.time, event: l.event, action: l.action, detail: l.detail };
  });
  return { version: 1, sources, records, routes, clock: s.clock, log };
}
export function seed() {
  const list = [
    ["evt-001", "NORD", "INV-042", true, "200"],
    ["evt-001", "NORD", "INV-042", true, "200"],
    ["evt-002", "RIVE", "INV-043", false, "200"],
    ["evt-003", "CANAL", "INV-044", true, "200"],
    ["evt-004", "INCONNU", "INV-045", true, "200"],
    ["evt-005", "NORD", "INV-046", true, "429,200"],
    ["evt-006", "RIVE", "INV-047", true, "503,503,503"],
    ["evt-003", "CANAL", "INV-144", true, "200"],
  ];
  return replay({
    version: 1,
    sources: list.map(([event, client, doc, hasFile, response]) => ({
      event,
      client,
      doc,
      hasFile,
      response,
    })),
    records: [],
    routes: {
      NORD: "Atelier Nord / Septembre",
      RIVE: "Maison Rive / Septembre",
      CANAL: "Studio Canal / Septembre",
    },
    clock: 36000,
    log: [],
  });
}

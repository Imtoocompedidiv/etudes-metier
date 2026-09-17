import { parseCsv, csvText } from "../../shared/files.js";

// A complete dossier can retain three 500-row traces/corrections plus
// 2,000 journal entries. JSON may escape each UTF-16 code unit as six bytes.
// The schema's maximum, including pretty-printing, stays below 20 MiB.
export const dossierMaxBytes = 20 * 1024 * 1024;

export const headers = [
  "evenement",
  "temps_ms",
  "sequence",
  "canal",
  "valeur",
  "unite",
];
export const fields = headers.slice(1);
const obj = (x) => x && typeof x === "object" && !Array.isArray(x);
const str = (x, label, max = 100) => {
  if (typeof x !== "string" || x.length > max)
    throw Error(`${label} : texte de ${max} caractères maximum attendu.`);
  return x;
};
const id = (x, label) => {
  const v = str(x, label, 50).trim();
  if (!v || ["__proto__", "constructor", "prototype"].includes(v))
    throw Error(`${label} : identifiant non vide attendu.`);
  return v;
};
const reason = (x) => {
  const v = str(x, "Motif", 500).trim();
  if (!v) throw Error("Un motif est obligatoire.");
  return v;
};
const date = (x) => {
  if (
    typeof x !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) ||
    !Number.isFinite(Date.parse(x)) ||
    new Date(x).toISOString() !== x
  )
    throw Error("Date du journal invalide.");
  return x;
};
function rows(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 500)
    throw Error("Une trace doit contenir de 1 à 500 événements.");
  const seen = new Set();
  return raw.map((r, i) => {
    if (!obj(r)) throw Error("Événement invalide.");
    const n = Object.fromEntries(
      headers.map((h) => [
        h,
        h === "evenement" ? id(r[h], "Événement") : str(r[h], h),
      ]),
    );
    if (seen.has(n.evenement))
      throw Error(
        `Identifiant événement répété à la ligne ${i + 1}. Les séquences répétées sont en revanche autorisées pour les essais.`,
      );
    seen.add(n.evenement);
    return n;
  });
}
export function parseTrace(text) {
  const p = parseCsv(text, { requiredHeaders: headers, maxRows: 500 });
  if (p.headers.length !== headers.length)
    throw Error("Utilisez les six colonnes documentées.");
  return rows(p.rows);
}
export function decimal(raw) {
  if (
    typeof raw !== "string" ||
    !/^[-+]?\d{1,6}(?:[.,]\d{1,6})?$/.test(raw.trim())
  )
    return null;
  const v = raw.trim().replace(",", ".");
  const sign = v[0] === "-" ? -1 : 1;
  const [whole, fraction = ""] = v.replace(/^[-+]/, "").split(".");
  return sign * (Number(whole) * 1000000 + Number(fraction.padEnd(6, "0")));
}
function integer(raw, min, max) {
  return /^\d+$/.test(raw.trim()) &&
    Number.isSafeInteger(Number(raw)) &&
    Number(raw) >= min &&
    Number(raw) <= max
    ? Number(raw)
    : null;
}
export function normalizeRules(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 20)
    throw Error("Le scénario doit contenir de 1 à 20 canaux.");
  const seen = new Set();
  return raw.map((r) => {
    if (!obj(r)) throw Error("Règle invalide.");
    const canal = id(r.canal, "Canal"),
      unite = str(r.unite, "Unité", 20).trim(),
      min = str(r.min, "Minimum", 30).trim(),
      max = str(r.max, "Maximum", 30).trim();
    if (seen.has(canal)) throw Error("Deux règles utilisent le même canal.");
    seen.add(canal);
    if (
      !unite ||
      decimal(min) === null ||
      decimal(max) === null ||
      decimal(min) > decimal(max)
    )
      throw Error(
        `Règle ${canal} : unité et intervalle min ≤ max valides requis.`,
      );
    return { canal, unite, min, max };
  });
}
export function parseScenario(raw) {
  const r = JSON.parse(raw);
  if (!obj(r) || r.format !== "dra-scenario-fictif-v1")
    throw Error("Scénario de démonstration DRA v1 attendu.");
  return normalizeRules(r.canaux);
}
const equal = (a, b) => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (obj(a) && obj(b)) {
    const ak = Object.keys(a),
      bk = Object.keys(b);
    return (
      ak.length === bk.length &&
      ak.every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]))
    );
  }
  return false;
};
export function normalizeDossier(raw) {
  if (!obj(raw) || raw.version !== 1 || !obj(raw.trace) || !obj(raw.scenario))
    throw Error("Dossier de rejeu DRA version 1 attendu.");
  const trace = {
      name: str(raw.trace.name, "Nom du fichier", 200),
      rows: rows(raw.trace.rows),
    },
    scenario = {
      name: str(raw.scenario.name, "Nom du scénario", 200),
      rules: normalizeRules(raw.scenario.rules),
    };
  const ids = new Set(trace.rows.map((r) => r.evenement));
  if (!Array.isArray(raw.edits) || raw.edits.length > 500)
    throw Error("Corrections invalides.");
  const edited = new Set();
  const edits = raw.edits.map((e) => {
    if (!obj(e) || !obj(e.values)) throw Error("Correction invalide.");
    const evenement = id(e.evenement, "Événement");
    if (!ids.has(evenement) || edited.has(evenement))
      throw Error("Correction sans événement unique.");
    edited.add(evenement);
    return {
      evenement,
      values: Object.fromEntries(fields.map((f) => [f, str(e.values[f], f)])),
      reason: reason(e.reason),
    };
  });
  const ruleEdit =
    raw.ruleEdit === null
      ? null
      : obj(raw.ruleEdit)
        ? {
            rules: normalizeRules(raw.ruleEdit.rules),
            reason: reason(raw.ruleEdit.reason),
          }
        : (() => {
            throw Error("Correction de règles invalide.");
          })();
  if (
    !Number.isInteger(raw.cursor) ||
    raw.cursor < 0 ||
    raw.cursor > trace.rows.length
  )
    throw Error("Position de rejeu invalide.");
  const reference =
    raw.reference === null
      ? null
      : obj(raw.reference)
        ? {
            rows: rows(raw.reference.rows),
            rules: normalizeRules(raw.reference.rules),
            at: date(raw.reference.at),
          }
        : (() => {
            throw Error("Référence invalide.");
          })();
  if (!Array.isArray(raw.journal) || raw.journal.length > 2000)
    throw Error("Journal invalide.");
  const journal = raw.journal.map((e) => {
    if (!obj(e)) throw Error("Entrée de journal invalide.");
    return { at: date(e.at), action: str(e.action, "Action", 700) };
  });
  return {
    version: 1,
    trace,
    scenario,
    edits,
    ruleEdit,
    cursor: raw.cursor,
    reference,
    journal,
  };
}
export function validDossier(raw) {
  try {
    return equal(raw, normalizeDossier(raw));
  } catch {
    return false;
  }
}
export function effectiveRows(d) {
  const map = new Map(d.edits.map((x) => [x.evenement, x.values]));
  return d.trace.rows.map((r) => ({ ...r, ...map.get(r.evenement) }));
}
export const effectiveRules = (d) => d.ruleEdit?.rules || d.scenario.rules;
const signature = (r) => JSON.stringify(fields.map((f) => r[f].trim()));

/** Replay follows file order. An identical retransmission is ignored. A rejected
 * measurement never changes the last accepted channel value. For other packets,
 * valid timestamps advance the observed clock even when their value is rejected. */
export function replay(input, rules, cursor = input.length) {
  const channelRules = new Map(rules.map((r) => [r.canal, r])),
    states = new Map(
      rules.map((r) => [
        r.canal,
        {
          canal: r.canal,
          unite: r.unite,
          valeur: null,
          evenement: null,
          temps_ms: null,
        },
      ]),
    );
  const seen = new Map(),
    results = [];
  let clock = null;
  for (const [i, r] of input.slice(0, cursor).entries()) {
    const errors = [],
      notes = [],
      seq = integer(r.sequence, 1, 999999999),
      t = integer(r.temps_ms, 0, 604800000),
      v = decimal(r.valeur),
      canal = r.canal.trim(),
      unite = r.unite.trim(),
      rule = channelRules.get(canal);
    const first = seq === null ? null : seen.get(seq),
      identical = !!first && first.signature === signature(r);
    if (seq === null) errors.push("Séquence entière 1–999999999 attendue.");
    if (t === null) errors.push("Temps entier 0–604800000 ms attendu.");
    if (!rule) errors.push("Canal inconnu du scénario.");
    else if (unite !== rule.unite)
      errors.push(
        `Unité ${unite || "absente"} ; ${rule.unite} attendue. Aucune conversion implicite.`,
      );
    if (v === null)
      errors.push(
        r.valeur.trim()
          ? "Valeur numérique invalide."
          : "Valeur absente, distincte de zéro.",
      );
    else if (rule && (v < decimal(rule.min) || v > decimal(rule.max)))
      errors.push(`Valeur hors intervalle fictif ${rule.min} à ${rule.max}.`);
    if (first && !identical)
      errors.push(`Séquence contradictoire avec ${first.evenement}.`);
    if (!identical && t !== null) {
      if (clock !== null && t < clock)
        errors.push(`Horodatage hors ordre, après ${clock} ms observés.`);
      clock = Math.max(clock ?? t, t);
    }
    if (identical)
      notes.push(
        `Retransmission identique à ${first.evenement}, ignorée sans changer l’état.`,
      );
    const status = errors.length ? "rejete" : identical ? "doublon" : "accepte";
    if (!first && seq !== null)
      seen.set(seq, { evenement: r.evenement, signature: signature(r) });
    if (status === "accepte")
      states.set(canal, {
        canal,
        unite: rule.unite,
        valeur: v,
        evenement: r.evenement,
        temps_ms: t,
      });
    results.push({
      evenement: r.evenement,
      ligne: i + 1,
      source: r,
      status,
      errors,
      notes,
      valeurAppliquee: status === "accepte" ? v : null,
    });
  }
  return {
    results,
    states: [...states.values()],
    clock,
    cursor: results.length,
    total: input.length,
    complete: results.length === input.length,
    accepted: results.filter((x) => x.status === "accepte").length,
    rejected: results.filter((x) => x.status === "rejete").length,
    duplicates: results.filter((x) => x.status === "doublon").length,
  };
}
export const statusLabels = {
  accepte: "Accepté par le scénario",
  rejete: "Rejeté par le scénario",
  doublon: "Doublon ignoré",
};
export const run = (d) => replay(effectiveRows(d), effectiveRules(d), d.cursor);
export const numberText = (n) =>
  n === null ? "Aucune valeur acceptée" : String(n / 1000000);
const log = (d, at, action) =>
  normalizeDossier({
    ...d,
    journal: [...d.journal, { at: date(at), action }].slice(-2000),
  });
export function advance(d, mode, at) {
  if (!["step", "all", "reset"].includes(mode))
    throw Error("Action de rejeu inconnue.");
  const cursor =
    mode === "reset"
      ? 0
      : mode === "all"
        ? d.trace.rows.length
        : Math.min(d.trace.rows.length, d.cursor + 1);
  if (cursor === d.cursor) return d;
  return log(
    { ...d, cursor },
    at,
    mode === "reset"
      ? "Rejeu remis au début."
      : `Rejeu effectué jusqu’à ${cursor} / ${d.trace.rows.length} événements.`,
  );
}
export function editEvent(d, event, values, why, at) {
  const r = d.trace.rows.find((x) => x.evenement === event);
  if (!r) throw Error("Événement introuvable.");
  const item = {
    evenement: event,
    values: Object.fromEntries(fields.map((f) => [f, str(values[f], f)])),
    reason: reason(why),
  };
  return log(
    {
      ...d,
      edits: [...d.edits.filter((e) => e.evenement !== event), item],
      cursor: 0,
    },
    at,
    `${event} corrigé. Rejeu remis à zéro. ${item.reason}`,
  );
}
export function removeEdit(d, event, at) {
  return log(
    { ...d, edits: d.edits.filter((e) => e.evenement !== event), cursor: 0 },
    at,
    `Correction ${event} retirée. Rejeu remis à zéro.`,
  );
}
export function editRules(d, rules, why, at) {
  const ruleEdit = { rules: normalizeRules(rules), reason: reason(why) };
  return log(
    { ...d, ruleEdit, cursor: 0 },
    at,
    `Règles fictives modifiées. Rejeu remis à zéro. ${ruleEdit.reason}`,
  );
}
export function removeRuleEdit(d, at) {
  return log(
    { ...d, ruleEdit: null, cursor: 0 },
    at,
    "Règles importées restaurées. Rejeu remis à zéro.",
  );
}
export function replaceTrace(d, raw, name, at) {
  const checked = rows(raw),
    same = equal(checked, d.trace.rows);
  return log(
    {
      ...d,
      trace: { name: str(name, "Fichier", 200), rows: checked },
      edits: same ? d.edits : [],
      cursor: same ? d.cursor : 0,
    },
    at,
    same
      ? "Trace identique réimportée ; corrections et rejeu conservés."
      : "Nouvelle trace importée ; corrections de trace retirées et rejeu remis à zéro.",
  );
}
export function replaceRules(d, rules, name, at) {
  const checked = normalizeRules(rules),
    same = equal(checked, d.scenario.rules);
  return log(
    {
      ...d,
      scenario: { name: str(name, "Fichier", 200), rules: checked },
      ruleEdit: same ? d.ruleEdit : null,
      cursor: same ? d.cursor : 0,
    },
    at,
    same
      ? "Scénario identique réimporté ; corrections et rejeu conservés."
      : "Nouveau scénario importé ; corrections des règles retirées et rejeu remis à zéro.",
  );
}
export function remember(d, at) {
  if (d.cursor !== d.trace.rows.length)
    throw Error("Terminez le rejeu avant de mémoriser sa référence.");
  return log(
    {
      ...d,
      reference: {
        rows: effectiveRows(d),
        rules: effectiveRules(d),
        at: date(at),
      },
    },
    at,
    "Référence de comparaison mémorisée avec sa trace et ses règles fictives.",
  );
}
export function comparison(d) {
  if (!d.reference) return null;
  const current = run(d);
  if (!current.complete) return { pending: true, changes: [] };
  const old = replay(d.reference.rows, d.reference.rules),
    oldMap = new Map(old.results.map((x) => [x.evenement, x])),
    newMap = new Map(current.results.map((x) => [x.evenement, x])),
    ids = [...new Set([...oldMap.keys(), ...newMap.keys()])];
  const changes = ids.flatMap((id) => {
    const a = oldMap.get(id),
      b = newMap.get(id);
    const same =
      a &&
      b &&
      equal(a.source, b.source) &&
      a.status === b.status &&
      equal(a.errors, b.errors) &&
      equal(a.notes, b.notes);
    return same
      ? []
      : [
          {
            evenement: id,
            avant: a ? statusLabels[a.status] : "Absent de la référence",
            apres: b ? statusLabels[b.status] : "Absent de la trace courante",
            valeur_avant: a ? numberText(a.valeurAppliquee) : "",
            valeur_apres: b ? numberText(b.valeurAppliquee) : "",
            detail: !a
              ? "Nouvel identifiant événement."
              : !b
                ? "Événement retiré de la trace."
                : [
                    ...b.errors,
                    ...b.notes,
                    ...(!equal(a.source, b.source)
                      ? ["Donnée source modifiée."]
                      : []),
                  ].join(" "),
          },
        ];
  });
  return {
    pending: false,
    changes,
    rulesChanged: !equal(d.reference.rules, effectiveRules(d)),
    old,
    current,
  };
}
export const resultHeaders = [
  "evenement",
  "ligne",
  "temps_ms",
  "sequence",
  "canal",
  "valeur",
  "unite",
  "resultat",
  "valeur_appliquee",
  "explication",
];
export function resultRows(d) {
  return run(d).results.map((r) => ({
    ...r.source,
    ligne: r.ligne,
    resultat: statusLabels[r.status],
    valeur_appliquee:
      r.valeurAppliquee === null ? "" : numberText(r.valeurAppliquee),
    explication: [...r.errors, ...r.notes].join(" "),
  }));
}
export const scenarioJson = (d) => ({
  format: "dra-scenario-fictif-v1",
  note: "Règles de démonstration uniquement, aucune validité métrologique.",
  canaux: effectiveRules(d),
});
export function manifest(d) {
  return {
    format: "dra-recette-fictive-v1",
    note: "Rejeu déterministe hors matériel. Aucune conclusion métrologique.",
    source: d.trace,
    scenarioImporte: d.scenario,
    corrections: d.edits,
    correctionRegles: d.ruleEdit,
    traceCourante: effectiveRows(d),
    reglesCourantes: effectiveRules(d),
    rejeu: run(d),
    reference: d.reference,
    comparaison: comparison(d),
    journal: d.journal,
  };
}
export const initialDossier = normalizeDossier({
  version: 1,
  trace: {
    name: "trace-fictive.csv",
    rows: [
      ["EV-01", "0", "1", "force", "10", "N"],
      ["EV-02", "50", "2", "position", "2", "mm"],
      ["EV-03", "100", "3", "force", "15", "N"],
      ["EV-04", "100", "3", "force", "18", "N"],
      ["EV-05", "200", "4", "position", "4", "cm"],
      ["EV-06", "150", "5", "force", "20", "N"],
      ["EV-07", "300", "6", "force", "", "N"],
    ].map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
  },
  scenario: {
    name: "scenario-fictif.json",
    rules: [
      { canal: "force", unite: "N", min: "0", max: "100" },
      { canal: "position", unite: "mm", min: "0", max: "50" },
    ],
  },
  edits: [],
  ruleEdit: null,
  cursor: 0,
  reference: null,
  journal: [],
});
export const exampleTrace = () => csvText(headers, initialDossier.trace.rows);

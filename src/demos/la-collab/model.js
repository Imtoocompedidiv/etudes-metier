import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export const MAX_BYTES = 12 * 1024 * 1024;
export const TYPES = {
  text: "Texte",
  email: "E-mail",
  select: "Sélection",
  textarea: "Zone de texte",
  checkbox: "Case à cocher",
};
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
function shape(x, names, label) {
  if (
    !object(x) ||
    Object.keys(x).length !== names.length ||
    names.some((k) => !Object.hasOwn(x, k))
  )
    throw Error(`${label} : structure inconnue.`);
}
function text(x, max, label, empty = true) {
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
function ident(x) {
  if (
    typeof x !== "string" ||
    !/^[a-z][a-z0-9_]{0,39}$/.test(x) ||
    ["constructor", "prototype", "__proto__"].includes(x)
  )
    throw Error(
      "Identifiant : lettres minuscules, chiffres et tirets bas, 40 caractères maximum.",
    );
  return x;
}
function list(x, max, label, min = 0) {
  if (!Array.isArray(x) || x.length < min || x.length > max)
    throw Error(`${label} : ${min} à ${max} éléments attendus.`);
  return x;
}
function unique(x, label) {
  if (new Set(x).size !== x.length)
    throw Error(`${label} : identifiants en double.`);
  return x;
}
function names(x) {
  return unique(list(x, 24, "Attentes").map(ident), "Attentes");
}
export function field(x) {
  shape(
    x,
    ["id", "label", "type", "required", "error", "help", "options", "when"],
    "Champ",
  );
  const id = ident(x.id);
  if (
    !Object.hasOwn(TYPES, x.type) ||
    typeof x.type !== "string" ||
    typeof x.required !== "boolean"
  )
    throw Error("Type ou caractère obligatoire invalide.");
  const options = list(x.options, 12, "Options").map((o) => {
    shape(o, ["value", "label"], "Option");
    return {
      value: text(o.value, 80, "Valeur", false),
      label: text(o.label, 120, "Libellé", false),
    };
  });
  unique(
    options.map((o) => o.value),
    "Options",
  );
  if (x.type === "select" ? !options.length : options.length)
    throw Error(
      "Une sélection exige des options ; les autres types n’en portent pas.",
    );
  let when = null;
  if (x.when !== null) {
    shape(x.when, ["field", "equals"], "Condition");
    when = {
      field: ident(x.when.field),
      equals: text(x.when.equals, 2000, "Valeur attendue"),
    };
  }
  return {
    id,
    label: text(x.label, 120, "Libellé"),
    type: x.type,
    required: x.required,
    error: text(x.error, 300, "Message d’erreur"),
    help: text(x.help, 500, "Aide"),
    options,
    when,
  };
}
export function schema(x) {
  shape(x, ["format", "title", "fields"], "Schéma");
  if (x.format !== "collab-form-v1")
    throw Error("Schéma collab-form-v1 attendu.");
  const fields = list(x.fields, 24, "Champs", 1).map(field);
  unique(
    fields.map((f) => f.id),
    "Champs",
  );
  return {
    format: x.format,
    title: text(x.title, 160, "Titre", false),
    fields,
  };
}
function answerMap(x) {
  if (!object(x) || Object.keys(x).length > 24)
    throw Error("Réponses invalides.");
  return Object.fromEntries(
    Object.entries(x).map(([k, v]) => [ident(k), text(v, 2000, "Réponse")]),
  );
}
export function scenario(x) {
  shape(x, ["id", "name", "steps"], "Scénario");
  return {
    id: ident(x.id),
    name: text(x.name, 150, "Nom du scénario", false),
    steps: list(x.steps, 20, "Étapes", 1).map((s) => {
      shape(s, ["set", "expect"], "Étape");
      shape(s.expect, ["visible", "errors", "cleared"], "Attentes");
      return {
        set: answerMap(s.set),
        expect: {
          visible: names(s.expect.visible),
          errors: names(s.expect.errors),
          cleared: names(s.expect.cleared),
        },
      };
    }),
  };
}
function scenarios(x) {
  const items = list(x, 40, "Scénarios", 1).map(scenario);
  unique(
    items.map((s) => s.id),
    "Scénarios",
  );
  return items;
}
export function fingerprint(d) {
  return bytesToHex(
    sha256(utf8ToBytes(JSON.stringify([d.schema, d.scenarios]))),
  );
}
export function normalize(x) {
  shape(
    x,
    ["format", "schema", "scenarios", "execution", "journal"],
    "Dossier",
  );
  if (x.format !== "collab-dossier-v1")
    throw Error("Dossier collab-dossier-v1 attendu.");
  const d = {
    format: x.format,
    schema: schema(x.schema),
    scenarios: scenarios(x.scenarios),
    execution: null,
    journal: list(x.journal, 60, "Journal").map((j) =>
      text(j, 400, "Journal", false),
    ),
  };
  if (x.execution !== null) {
    shape(x.execution, ["fingerprint"], "Exécution");
    if (
      typeof x.execution.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(x.execution.fingerprint)
    )
      throw Error("Empreinte de rejeu invalide.");
    d.execution = { fingerprint: x.execution.fingerprint };
  }
  if (new TextEncoder().encode(JSON.stringify(d, null, 2)).length > MAX_BYTES)
    throw Error(
      "Le dossier complet dépasse 12 Mio après sérialisation. Réduisez les scénarios.",
    );
  return d;
}
export function parseImport(raw) {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > MAX_BYTES
  )
    throw Error("Fichier limité à 12 Mio.");
  let x;
  try {
    x = JSON.parse(raw);
  } catch {
    throw Error("JSON illisible.");
  }
  if (x?.format === "collab-dossier-v1")
    return { kind: "dossier", data: normalize(x) };
  if (x?.format === "collab-form-v1")
    return { kind: "schema", data: schema(x) };
  shape(x, ["format", "scenarios"], "Scénarios");
  if (x.format !== "collab-scenarios-v1")
    throw Error("Format JSON non reconnu.");
  return { kind: "scenarios", data: scenarios(x.scenarios) };
}
export function inspect(s) {
  const issues = [],
    by = new Map(s.fields.map((f) => [f.id, f]));
  for (const f of s.fields) {
    if (!f.label.trim())
      issues.push({ field: f.id, code: "label", detail: "Libellé absent." });
    if (
      (f.required || f.type === "email" || f.type === "select") &&
      !f.error.trim()
    )
      issues.push({
        field: f.id,
        code: "message",
        detail: "Message d’erreur absent.",
      });
    if (f.when && !by.has(f.when.field))
      issues.push({
        field: f.id,
        code: "reference",
        detail: `La condition dépend de ${f.when.field}, qui n’existe pas.`,
      });
    if (f.when && by.has(f.when.field)) {
      const parent = by.get(f.when.field);
      if (
        parent.type === "select" &&
        !parent.options.some((o) => o.value === f.when.equals) &&
        f.when.equals !== ""
      )
        issues.push({
          field: f.id,
          code: "option",
          detail: "Valeur de condition absente des options du champ source.",
        });
      if (parent.type === "checkbox" && !["", "oui"].includes(f.when.equals))
        issues.push({
          field: f.id,
          code: "option",
          detail: "Une case prend la valeur « oui » ou une chaîne vide.",
        });
    }
  }
  const visited = new Set(),
    cycles = new Set();
  function walk(id, stack) {
    if (stack.includes(id)) {
      stack.slice(stack.indexOf(id)).forEach((k) => cycles.add(k));
      return;
    }
    if (visited.has(id)) return;
    const f = by.get(id);
    if (f?.when && by.has(f.when.field)) walk(f.when.field, [...stack, id]);
    visited.add(id);
  }
  s.fields.forEach((f) => walk(f.id, []));
  cycles.forEach((id) =>
    issues.push({
      field: id,
      code: "cycle",
      detail: "Ce champ appartient à une boucle de conditions.",
    }),
  );
  return issues;
}
export function visibility(s, answers) {
  const by = new Map(s.fields.map((f) => [f.id, f])),
    memo = new Map();
  function visit(id, stack = []) {
    if (memo.has(id)) return memo.get(id);
    const f = by.get(id);
    if (!f || stack.includes(id)) return null;
    if (!f.when) {
      memo.set(id, true);
      return true;
    }
    const p = visit(f.when.field, [...stack, id]);
    const v =
      p === null ? null : p && (answers[f.when.field] ?? "") === f.when.equals;
    memo.set(id, v);
    return v;
  }
  return Object.fromEntries(s.fields.map((f) => [f.id, visit(f.id)]));
}
export function transition(s, previous, patch) {
  const before = answerMap(previous),
    incoming = answerMap(patch),
    known = new Set(s.fields.map((f) => f.id));
  if (
    [...Object.keys(before), ...Object.keys(incoming)].some(
      (k) => !known.has(k),
    )
  )
    throw Error("Réponse liée à un champ absent du schéma.");
  const merged = { ...before, ...incoming },
    visible = visibility(s, merged),
    cleared = [],
    answers = {};
  for (const f of s.fields) {
    const value = merged[f.id] ?? "";
    if (visible[f.id] === true) answers[f.id] = value;
    else if (value !== "") cleared.push(f.id);
  }
  return { answers, visible, cleared };
}
export function validate(s, answers) {
  const visible = visibility(s, answers),
    errors = [];
  for (const f of s.fields) {
    if (visible[f.id] !== true) continue;
    const v = answers[f.id] ?? "";
    if (
      (f.required && !v.trim()) ||
      (v !== "" &&
        f.type === "email" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ||
      (v !== "" &&
        f.type === "select" &&
        !f.options.some((o) => o.value === v)) ||
      (f.type === "checkbox" && !["", "oui"].includes(v))
    )
      errors.push({
        field: f.id,
        message: f.error.trim() || `Vérifiez ${f.label || f.id}.`,
      });
  }
  return errors;
}
export function scenarioIssues(d) {
  const ids = new Set(d.schema.fields.map((f) => f.id));
  return d.scenarios.flatMap((s) =>
    s.steps.flatMap((step, index) => {
      const used = [
        ...Object.keys(step.set),
        ...step.expect.visible,
        ...step.expect.errors,
        ...step.expect.cleared,
      ];
      return [...new Set(used)]
        .filter((k) => !ids.has(k))
        .map((k) => ({
          scenario: s.id,
          step: index + 1,
          field: k,
          detail: `Scénario ${s.name}, étape ${index + 1} : champ ${k} absent.`,
        }));
    }),
  );
}
const sameSet = (a, b) =>
  a.length === b.length &&
  [...a].sort().every((x, i) => x === [...b].sort()[i]);
export function evaluate(d) {
  const faults = [...inspect(d.schema), ...scenarioIssues(d)];
  if (faults.length)
    return { blocked: true, faults, results: [], passed: false };
  const results = d.scenarios.map((s) => {
    let values = {};
    const steps = s.steps.map((step, index) => {
      const state = transition(d.schema, values, step.set);
      values = state.answers;
      const actual = {
        visible: Object.keys(state.visible).filter(
          (k) => state.visible[k] === true,
        ),
        errors: validate(d.schema, state.answers).map((e) => e.field),
        cleared: state.cleared,
      };
      const differences = Object.keys(actual).filter(
        (k) => !sameSet(actual[k], step.expect[k]),
      );
      return {
        index: index + 1,
        actual,
        expected: step.expect,
        answers: state.answers,
        differences,
        passed: differences.length === 0,
      };
    });
    return {
      id: s.id,
      name: s.name,
      steps,
      passed: steps.every((s) => s.passed),
    };
  });
  return {
    blocked: false,
    faults: [],
    results,
    passed: results.every((s) => s.passed),
  };
}
export const currentRun = (d) =>
  Boolean(d.execution && d.execution.fingerprint === fingerprint(d));
export const canDeliver = (d) => currentRun(d) && evaluate(d).passed;
function log(d, changes, message) {
  return normalize({
    ...d,
    ...changes,
    journal: [...d.journal, message].slice(-60),
  });
}
export function editField(d, id, raw) {
  if (!d.schema.fields.some((f) => f.id === id))
    throw Error("Champ introuvable.");
  const next = field({ ...raw, id });
  if (
    JSON.stringify(next) ===
    JSON.stringify(d.schema.fields.find((f) => f.id === id))
  )
    return d;
  return log(
    d,
    {
      schema: {
        ...d.schema,
        fields: d.schema.fields.map((f) => (f.id === id ? next : f)),
      },
      execution: null,
    },
    `${id} modifié ; rejeu à refaire.`,
  );
}
export function editScenario(d, id, raw) {
  const next = scenario({ ...raw, id });
  if (!d.scenarios.some((s) => s.id === id))
    throw Error("Scénario introuvable.");
  if (
    JSON.stringify(next) ===
    JSON.stringify(d.scenarios.find((s) => s.id === id))
  )
    return d;
  return log(
    d,
    {
      scenarios: d.scenarios.map((s) => (s.id === id ? next : s)),
      execution: null,
    },
    `${id} modifié ; rejeu à refaire.`,
  );
}
export function execute(d) {
  const result = evaluate(d);
  if (result.blocked)
    throw Error("Corrigez les constats de configuration avant le rejeu.");
  return log(
    d,
    { execution: { fingerprint: fingerprint(d) } },
    `${result.results.length} scénarios rejoués, ${result.results.filter((r) => r.passed).length} conformes aux attentes déclarées.`,
  );
}
export function importData(d, item) {
  if (item.kind === "dossier") return normalize(item.data);
  const changes =
    item.kind === "schema"
      ? { schema: schema(item.data) }
      : { scenarios: scenarios(item.data) };
  const merged = { ...d, ...changes };
  if (fingerprint(merged) === fingerprint(d)) return d;
  return log(
    d,
    { ...changes, execution: null },
    `${item.kind === "schema" ? "Schéma" : "Scénarios"} importé ; rejeu à refaire.`,
  );
}
export function deliver(d) {
  if (!canDeliver(d))
    throw Error(
      "Le schéma exige un rejeu actuel et tous les scénarios conformes.",
    );
  return structuredClone(d.schema);
}
export const RESULT_HEADERS = [
  "scenario",
  "etape",
  "conforme",
  "visible_attendu",
  "visible_observe",
  "erreurs_attendues",
  "erreurs_observees",
  "purge_attendue",
  "purge_observee",
];
export function resultRows(d) {
  if (!currentRun(d))
    throw Error("Rejouez les scénarios pour exporter les résultats actuels.");
  return evaluate(d).results.flatMap((s) =>
    s.steps.map((t) => [
      s.name,
      t.index,
      t.passed ? "oui" : "non",
      t.expected.visible.join(" | "),
      t.actual.visible.join(" | "),
      t.expected.errors.join(" | "),
      t.actual.errors.join(" | "),
      t.expected.cleared.join(" | "),
      t.actual.cleared.join(" | "),
    ]),
  );
}
export function report(d) {
  const faults = [...inspect(d.schema), ...scenarioIssues(d)],
    computed = currentRun(d) ? evaluate(d) : null;
  return {
    title: "Recette du formulaire conditionnel",
    subtitle: "La Collab · Étude indépendante · Données fictives",
    sections: [
      {
        title: "Périmètre",
        paragraphs: [
          "Contrôles locaux de structure, visibilité, erreurs et purge. Aucune donnée envoyée. Pas de certification d’accessibilité ni de test utilisateur.",
          currentRun(d)
            ? "Scénarios rejoués pour cette version."
            : "Aucun rejeu actuel ; les résultats précédents ne sont pas repris.",
          "Empreinte de configuration : " + fingerprint(d),
        ],
      },
      {
        title: "Champs",
        headers: [
          "Identifiant",
          "Libellé",
          "Type",
          "Obligatoire",
          "Condition",
          "Message d’erreur",
          "Aide",
        ],
        rows: d.schema.fields.map((f) => [
          f.id,
          f.label,
          f.type,
          f.required ? "oui" : "non",
          f.when ? `${f.when.field} = ${f.when.equals}` : "Toujours",
          f.error,
          f.help,
        ]),
      },
      {
        title: "Constats",
        headers: ["Champ", "Détail"],
        rows: faults.map((f) => [f.field, f.detail]),
      },
      {
        title: "Scénarios",
        headers: RESULT_HEADERS,
        rows: computed && !computed.blocked ? resultRows(d) : [],
        paragraphs: computed ? [] : ["Rejeu non effectué pour cette version."],
      },
      { title: "Modifications", paragraphs: d.journal },
    ],
  };
}
const make = (id, label, type, required, error, options = [], when = null) => ({
  id,
  label,
  type,
  required,
  error,
  help: "",
  options,
  when,
});
const basic = ["profil", "email", "objet", "description"],
  all = ["profil", "societe", "email", "objet", "description"];
const complete = {
  profil: "particulier",
  email: "leo@example.invalid",
  objet: "rdv",
  description: "Un rendez-vous pour présenter notre projet.",
};
export const initialAnswers = () => ({ ...complete });
export function seed() {
  return normalize({
    format: "collab-dossier-v1",
    schema: {
      format: "collab-form-v1",
      title: "Demande de rendez-vous fictive",
      fields: [
        make("profil", "Vous êtes", "select", true, "Choisissez un profil.", [
          { value: "particulier", label: "Un particulier" },
          { value: "professionnel", label: "Un professionnel" },
        ]),
        make(
          "societe",
          "Société",
          "text",
          true,
          "Renseignez votre société.",
          [],
          { field: "profil_client", equals: "professionnel" },
        ),
        make(
          "email",
          "E-mail",
          "email",
          true,
          "Indiquez une adresse e-mail de test valide.",
        ),
        make("objet", "Objet", "select", true, "Choisissez un objet.", [
          { value: "rdv", label: "Demande de rendez-vous" },
          { value: "information", label: "Demande d’information" },
        ]),
        make(
          "description",
          "Description",
          "textarea",
          true,
          "Décrivez votre demande.",
        ),
      ],
    },
    scenarios: [
      {
        id: "particulier_complet",
        name: "Particulier complet",
        steps: [
          {
            set: { ...complete },
            expect: { visible: basic, errors: [], cleared: [] },
          },
        ],
      },
      {
        id: "professionnel_sans_societe",
        name: "Professionnel sans société",
        steps: [
          {
            set: { ...complete, profil: "professionnel" },
            expect: { visible: all, errors: ["societe"], cleared: [] },
          },
        ],
      },
      {
        id: "retour_particulier",
        name: "Retour au particulier",
        steps: [
          {
            set: {
              ...complete,
              profil: "professionnel",
              societe: "Atelier fictif",
            },
            expect: { visible: all, errors: [], cleared: [] },
          },
          {
            set: { profil: "particulier" },
            expect: { visible: basic, errors: [], cleared: ["societe"] },
          },
          {
            set: { profil: "professionnel" },
            expect: { visible: all, errors: ["societe"], cleared: [] },
          },
        ],
      },
    ],
    execution: null,
    journal: [],
  });
}

export const definitions = {
  table: {
    label: "Tables",
    fields: { rows: ["Lignes", "number"], rls: ["RLS activée", "boolean"] },
  },
  bucket: {
    label: "Stockage",
    fields: {
      objects: ["Objets", "number"],
      bytes: ["Octets", "number"],
      public: ["Public", "boolean"],
    },
  },
  function: {
    label: "Fonctions",
    fields: { revision: ["Révision", "string"] },
  },
  extension: {
    label: "Extensions",
    fields: { version: ["Version", "string"] },
  },
  provider: { label: "Connexion", fields: { enabled: ["Activé", "boolean"] } },
};
export const statuses = {
  same: "Attributs identiques",
  different: "Différent",
  missing: "Absent de la cible",
  extra: "Uniquement en cible",
};
const strictKeys = (obj, allowed) => {
  if (!obj || typeof obj !== "object" || Array.isArray(obj))
    throw Error("Objet JSON attendu.");
  const unknown = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (unknown.length)
    throw Error(
      `Champ non admis : ${unknown[0]}. Utilisez uniquement le schéma d’inventaire, sans secret.`,
    );
};
const text = (v, max = 80) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw Error(`Texte obligatoire de 1 à ${max} caractères.`);
  return v.trim();
};
const id = (v) => {
  if (
    typeof v !== "string" ||
    !/^[a-zA-Z0-9_.-]{1,80}$/.test(v) ||
    ["__proto__", "constructor", "prototype"].includes(v)
  )
    throw Error(
      "Identifiant invalide : lettres, chiffres, points, tirets et tirets bas, 80 caractères maximum.",
    );
  return v;
};
export const resourceKey = (r) => `${r.type}:${r.id}`;
export function normalizeResource(r) {
  if (!Object.hasOwn(definitions, r?.type))
    throw Error("Type de ressource inconnu.");
  const fields = definitions[r.type].fields;
  strictKeys(r, ["type", "id", ...Object.keys(fields)]);
  const out = { type: r.type, id: id(r.id) };
  for (const [k, [label, type]] of Object.entries(fields)) {
    const v = r[k];
    if (type === "number") {
      if (
        typeof v !== "number" ||
        !Number.isSafeInteger(v) ||
        v < 0 ||
        v > 1e12
      )
        throw Error(`${label} : entier entre 0 et 1 000 000 000 000.`);
      out[k] = v;
    }
    if (type === "boolean") {
      if (typeof v !== "boolean")
        throw Error(`${label} : booléen true ou false attendu.`);
      out[k] = v;
    }
    if (type === "string") out[k] = text(v, 80);
  }
  return out;
}
export function normalizeInventory(v) {
  strictKeys(v, ["format", "label", "resources"]);
  if (
    v.format !== "coelus-inventory-v1" ||
    !Array.isArray(v.resources) ||
    v.resources.length > 500
  )
    throw Error(
      "Inventaire coelus-inventory-v1 attendu, 500 ressources maximum.",
    );
  const seen = new Set();
  return {
    format: v.format,
    label: text(v.label),
    resources: v.resources.map((r) => {
      const row = normalizeResource(r),
        key = resourceKey(row);
      if (seen.has(key)) throw Error(`Ressource répétée : ${key}.`);
      seen.add(key);
      return row;
    }),
  };
}
// Reject ambiguous duplicate JSON properties before normalisation. No eval or reviver.
export function parseJson(raw) {
  if (typeof raw !== "string" || raw.length > 1048576)
    throw Error("JSON de 1 Mo maximum attendu.");
  const s = raw.replace(/^\uFEFF/, ""),
    n = s.length;
  let pos = 0;
  const skip = () => {
    while (pos < n && /[ \n\r\t]/.test(s[pos])) pos++;
  };
  const string = () => {
    const start = pos++;
    let escape = false;
    while (pos < n) {
      const c = s[pos++];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') return JSON.parse(s.slice(start, pos));
    }
    throw Error("Chaîne JSON non terminée.");
  };
  const value = (depth) => {
    if (depth > 16) throw Error("JSON trop imbriqué.");
    skip();
    const c = s[pos];
    if (c === '"') return string();
    if (c === "{") {
      pos++;
      skip();
      const object = {},
        seen = new Set();
      if (s[pos] === "}") {
        pos++;
        return object;
      }
      while (pos < n) {
        skip();
        if (s[pos] !== '"') throw Error("Clé JSON attendue.");
        const k = string();
        if (
          seen.has(k) ||
          ["__proto__", "constructor", "prototype"].includes(k)
        )
          throw Error(`Clé JSON répétée ou interdite : ${k}.`);
        seen.add(k);
        skip();
        if (s[pos++] !== ":") throw Error("Séparateur JSON attendu.");
        object[k] = value(depth + 1);
        skip();
        const sep = s[pos++];
        if (sep === "}") return object;
        if (sep !== ",") throw Error("Objet JSON invalide.");
      }
    } else if (c === "[") {
      pos++;
      skip();
      const arr = [];
      if (s[pos] === "]") {
        pos++;
        return arr;
      }
      while (pos < n) {
        arr.push(value(depth + 1));
        if (arr.length > 2000) throw Error("Tableau JSON trop long.");
        skip();
        const sep = s[pos++];
        if (sep === "]") return arr;
        if (sep !== ",") throw Error("Tableau JSON invalide.");
      }
    } else {
      const match = s
        .slice(pos)
        .match(
          /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/,
        );
      if (match) {
        pos += match[0].length;
        return JSON.parse(match[0]);
      }
    }
    throw Error("Valeur JSON invalide.");
  };
  const result = value(0);
  skip();
  if (pos !== n) throw Error("Contenu après le document JSON.");
  return result;
}
export function normalizeDossier(d) {
  strictKeys(d, ["version", "source", "target", "decisions", "journal"]);
  if (
    d.version !== 1 ||
    !Array.isArray(d.decisions) ||
    d.decisions.length > 1000 ||
    !Array.isArray(d.journal) ||
    d.journal.length > 40
  )
    throw Error("Dossier Coelus version 1 attendu.");
  const source = normalizeInventory(d.source),
    target = normalizeInventory(d.target),
    seen = new Set();
  const decisions = d.decisions.map((r) => {
    strictKeys(r, ["key", "source", "target", "reason"]);
    const src = r.source === null ? null : normalizeResource(r.source),
      tgt = r.target === null ? null : normalizeResource(r.target);
    if (!src && !tgt) throw Error("Décision sans ressource.");
    const key = resourceKey(src || tgt);
    if (
      r.key !== key ||
      (src && tgt && resourceKey(src) !== resourceKey(tgt)) ||
      seen.has(key)
    )
      throw Error("Décision ambiguë ou répétée.");
    seen.add(key);
    return { key, source: src, target: tgt, reason: text(r.reason, 400) };
  });
  return {
    version: 1,
    source,
    target,
    decisions,
    journal: d.journal.map((j) => text(j, 600)),
  };
}
export const validDossier = (d) => {
  try {
    return JSON.stringify(d) === JSON.stringify(normalizeDossier(d));
  } catch {
    return false;
  }
};
export function compare(d) {
  const source = new Map(d.source.resources.map((r) => [resourceKey(r), r])),
    target = new Map(d.target.resources.map((r) => [resourceKey(r), r]));
  return [...new Set([...source.keys(), ...target.keys()])]
    .sort((a, b) => {
      const [ta] = a.split(":"),
        [tb] = b.split(":");
      return (
        Object.keys(definitions).indexOf(ta) -
          Object.keys(definitions).indexOf(tb) || (a < b ? -1 : a > b ? 1 : 0)
      );
    })
    .map((key) => {
      const src = source.get(key) || null,
        tgt = target.get(key) || null,
        resource = src || tgt;
      const diffs = Object.keys(definitions[resource.type].fields).filter(
        (field) => src?.[field] !== tgt?.[field],
      );
      const status = !src
        ? "extra"
        : !tgt
          ? "missing"
          : diffs.length
            ? "different"
            : "same";
      const decision = d.decisions.find((r) => r.key === key);
      const current =
        !!decision &&
        JSON.stringify(decision.source) === JSON.stringify(src) &&
        JSON.stringify(decision.target) === JSON.stringify(tgt);
      return {
        key,
        resource,
        source: src,
        target: tgt,
        diffs,
        status,
        decision,
        decisionStatus: decision
          ? current && status !== "same"
            ? "accepted"
            : "stale"
          : "pending",
      };
    });
}
export function change(d, patch, action) {
  return normalizeDossier({
    ...d,
    ...patch,
    journal: [...d.journal, action].slice(-40),
  });
}
export function saveTarget(d, r) {
  const row = normalizeResource(r);
  return change(
    d,
    {
      target: {
        ...d.target,
        resources: [
          ...d.target.resources.filter(
            (v) => resourceKey(v) !== resourceKey(row),
          ),
          row,
        ],
      },
    },
    `Cible déclarée mise à jour : ${resourceKey(row)}.`,
  );
}
export function removeTarget(d, key) {
  return change(
    d,
    {
      target: {
        ...d.target,
        resources: d.target.resources.filter((r) => resourceKey(r) !== key),
      },
    },
    `Cible déclarée retirée : ${key}.`,
  );
}
export function acceptDifference(d, key, reason) {
  const row = compare(d).find((r) => r.key === key);
  if (!row || row.status === "same")
    throw Error("Sélectionnez un écart existant.");
  const decision = {
    key,
    source: row.source,
    target: row.target,
    reason: text(reason, 400),
  };
  return change(
    d,
    { decisions: [...d.decisions.filter((r) => r.key !== key), decision] },
    `Écart accepté : ${key}. Motif : ${decision.reason}`,
  );
}
export const revoke = (d, key) =>
  change(
    d,
    { decisions: d.decisions.filter((r) => r.key !== key) },
    `Acceptation retirée : ${key}.`,
  );
export const formatValue = (v) =>
  v === undefined
    ? "Absent"
    : typeof v === "boolean"
      ? v
        ? "Oui"
        : "Non"
      : typeof v === "number"
        ? v.toLocaleString("fr-FR")
        : v;
export function summary(r) {
  if (!r) return "Absent";
  return Object.entries(definitions[r.type].fields)
    .map(([key, [label]]) => `${label} ${formatValue(r[key])}`)
    .join(" · ");
}
export const diffHeaders = [
  "type",
  "resource",
  "status",
  "field",
  "source",
  "target",
  "decision",
  "reason",
];
export const diffRows = (d) =>
  compare(d)
    .filter((r) => r.status !== "same")
    .flatMap((r) =>
      r.diffs.map((field) => [
        r.resource.type,
        r.resource.id,
        statuses[r.status],
        field,
        r.source?.[field] ?? "absent",
        r.target?.[field] ?? "absent",
        r.decisionStatus === "accepted"
          ? "Accepté"
          : r.decisionStatus === "stale"
            ? "À revalider"
            : "À traiter",
        r.decision?.reason || "",
      ]),
    );
export const initial = normalizeDossier({
  version: 1,
  source: {
    format: "coelus-inventory-v1",
    label: "Cloud témoin",
    resources: [
      { type: "table", id: "public.orders", rows: 1240, rls: true },
      { type: "table", id: "public.products", rows: 86, rls: true },
      {
        type: "bucket",
        id: "medias",
        objects: 48,
        bytes: 96000000,
        public: false,
      },
      { type: "function", id: "receipt", revision: "a31f" },
      { type: "extension", id: "vector", version: "0.8.0" },
      { type: "provider", id: "google", enabled: true },
      { type: "provider", id: "smtp", enabled: true },
    ],
  },
  target: {
    format: "coelus-inventory-v1",
    label: "Docker témoin",
    resources: [
      { type: "table", id: "public.orders", rows: 1237, rls: true },
      { type: "table", id: "public.products", rows: 86, rls: true },
      { type: "function", id: "receipt", revision: "a20b" },
      { type: "extension", id: "vector", version: "0.8.0" },
      { type: "provider", id: "google", enabled: false },
      { type: "provider", id: "smtp", enabled: true },
    ],
  },
  decisions: [],
  journal: [],
});

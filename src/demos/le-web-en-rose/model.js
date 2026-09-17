import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { parseCsv } from "../../shared/files.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const byteLength = (s) => encoder.encode(s).length;
const hash = (x) => bytesToHex(sha256(encoder.encode(JSON.stringify(x))));
const looksSerialized = (s) => /^(?:N;|[aObisdCRrE]:)/.test(s);
function boundedText(s, max, label, empty = false) {
  if (
    typeof s !== "string" ||
    (!empty && !s.trim()) ||
    s.length > max ||
    !s.isWellFormed()
  )
    throw Error(
      `${label} : texte Unicode ${empty ? "" : "non vide "}limité à ${max} caractères.`,
    );
  return s;
}
function exactKeys(x, keys, label) {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    Object.keys(x).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(x, k))
  )
    throw Error(`${label} : structure inattendue.`);
}

// A byte-oriented, data-only subset. No PHP evaluation, objects or references.
export function parsePhp(raw) {
  boundedText(raw, 50000, "Valeur");
  const bytes = encoder.encode(raw);
  if (bytes.length > 100000)
    throw Error("Valeur limitée à 100 000 octets UTF-8.");
  let offset = 0,
    nodes = 0;
  const error = (message) => {
    throw Error(`${message} (octet ${offset}).`);
  };
  const take = (literal) => {
    for (const char of literal)
      if (bytes[offset++] !== char.charCodeAt(0))
        error(`Délimiteur ${JSON.stringify(literal)} attendu`);
  };
  const until = (end) => {
    const start = offset;
    while (offset < bytes.length && bytes[offset] !== end.charCodeAt(0))
      offset++;
    if (offset === bytes.length) error("Valeur tronquée");
    const value = decoder.decode(bytes.subarray(start, offset));
    offset++;
    return value;
  };
  const count = (end, max) => {
    const value = until(end);
    if (!/^(0|[1-9]\d*)$/.test(value) || Number(value) > max)
      error("Longueur ou cardinalité invalide");
    return Number(value);
  };
  function node(depth = 0) {
    if (++nodes > 3000 || depth > 20)
      error("Structure trop profonde ou trop volumineuse");
    const type = String.fromCharCode(bytes[offset++] || 0);
    if (type === "N") {
      take(";");
      return { type: "N", value: null };
    }
    if ("OCRrE".includes(type))
      error("Objets, classes et références non pris en charge");
    if (!"sbida".includes(type)) error("Type PHP non pris en charge");
    take(":");
    if (type === "s") {
      const length = count(":", 100000);
      take('"');
      if (offset + length > bytes.length) error("Chaîne tronquée");
      let value;
      try {
        value = decoder.decode(bytes.subarray(offset, offset + length));
      } catch {
        error("La longueur coupe un caractère UTF-8");
      }
      offset += length;
      take('";');
      return { type, value };
    }
    if (type === "a") {
      const length = count(":", 1500);
      take("{");
      const entries = [],
        keys = new Set();
      for (let i = 0; i < length; i++) {
        const key = node(depth + 1);
        if (!["i", "s"].includes(key.type))
          error("Clé de tableau : entier ou chaîne requis");
        // PHP casts canonical integer-string keys, so reject their collisions too.
        const identity =
          key.type === "i" || /^(0|-?[1-9]\d*)$/.test(key.value)
            ? `n:${key.value}`
            : `s:${key.value}`;
        if (keys.has(identity))
          error("Clé de tableau dupliquée ou équivalente");
        keys.add(identity);
        entries.push({ key, value: node(depth + 1) });
      }
      take("}");
      return { type, entries };
    }
    const value = until(";");
    if (type === "b" && !["0", "1"].includes(value))
      error("Booléen attendu : 0 ou 1");
    if (type === "i") {
      if (
        !/^(0|-?[1-9]\d*)$/.test(value) ||
        value.length > 20 ||
        BigInt(value) < -(2n ** 63n) ||
        BigInt(value) > 2n ** 63n - 1n
      )
        error("Entier signé 64 bits invalide");
    }
    if (
      type === "d" &&
      (!/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) ||
        !Number.isFinite(Number(value)))
    )
      error("Nombre décimal fini attendu");
    return { type, value };
  }
  const result = node();
  if (offset !== bytes.length) error("Données après la valeur sérialisée");
  return result;
}

export function serializePhp(node) {
  if (node.type === "N") return "N;";
  if (node.type === "a")
    return `a:${node.entries.length}:{${node.entries.map(({ key, value }) => serializePhp(key) + serializePhp(value)).join("")}}`;
  if (node.type === "s") return `s:${byteLength(node.value)}:"${node.value}";`;
  return `${node.type}:${node.value};`;
}
export function origin(text) {
  boundedText(text, 300, "Origine");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw Error("Adresse absolue http:// ou https:// attendue.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error(
      "Indiquez uniquement une origine HTTP(S), sans chemin, paramètres ou identifiants.",
    );
  return url.origin;
}
export function replaceOrigins(value, from, to) {
  // Absolute unescaped HTTP(S) origins only, with an authority boundary.
  return value.replace(/\bhttps?:\/\/[^\s/\?#"'<>\\]+/gi, (token) => {
    try {
      const url = new URL(token);
      return !url.username && !url.password && url.origin === from ? to : token;
    } catch {
      return token;
    }
  });
}
export function transform(raw, from, to) {
  const serialized = looksSerialized(raw);
  const tree = serialized ? parsePhp(raw) : { type: "s", value: raw };
  const leaves = [];
  const walk = (node, path) => {
    if (node.type === "a")
      return {
        ...node,
        entries: node.entries.map(({ key, value }, i) => ({
          key,
          value: walk(
            value,
            `${path}[${key.type === "i" ? key.value : JSON.stringify(key.value)}]#${i}`,
          ),
        })),
      };
    if (node.type === "s" && looksSerialized(node.value))
      throw Error(
        "Sérialisation imbriquée dans une chaîne : contrôle séparé requis.",
      );
    const value =
      node.type === "s" ? replaceOrigins(node.value, from, to) : node.value;
    leaves.push({
      path,
      type: node.type,
      before: node.value,
      after: value,
      oldBytes: node.type === "s" ? byteLength(node.value) : null,
      newBytes: node.type === "s" ? byteLength(value) : null,
    });
    return { ...node, value };
  };
  const next = walk(tree, "$");
  const changed = leaves.some((x) => x.before !== x.after);
  const output = changed ? (serialized ? serializePhp(next) : next.value) : raw;
  if (output.length > 50000 || byteLength(output) > 100000)
    throw Error(
      "La valeur transformée dépasse la limite de 50 000 caractères ou 100 000 octets. Réduisez ce lot.",
    );
  if (changed && serialized) parsePhp(output);
  return { serialized, tree, leaves, changed, output };
}

export function normalize(input) {
  exactKeys(input, ["version", "from", "to", "rows", "review"], "Dossier");
  if (input.version !== 1) throw Error("Version de dossier non reconnue.");
  const from = origin(input.from),
    to = origin(input.to);
  if (
    !Array.isArray(input.rows) ||
    input.rows.length < 1 ||
    input.rows.length > 100
  )
    throw Error("Le dossier doit comporter de 1 à 100 options.");
  const names = new Set();
  let total = 0;
  const rows = input.rows.map((r) => {
    exactKeys(r, ["name", "value", "excluded", "reason"], "Option");
    const name = boundedText(r.name, 120, "Nom");
    if (/[\u0000-\u001f]/.test(name) || names.has(name))
      throw Error("Nom d’option dupliqué ou caractère de contrôle.");
    names.add(name);
    const value = boundedText(r.value, 50000, "Valeur", true);
    if (byteLength(value) > 100000 || (total += byteLength(value)) > 1000000)
      throw Error(
        "Valeurs limitées à 100 000 octets par option et 1 Mo au total.",
      );
    if (typeof r.excluded !== "boolean")
      throw Error("État d’exclusion invalide.");
    const reason = boundedText(r.reason, 300, "Motif", true);
    if (r.excluded && !reason.trim())
      throw Error("Une exclusion exige un motif.");
    return { name, value, excluded: r.excluded, reason };
  });
  if (
    input.review !== null &&
    (typeof input.review !== "string" || !/^[a-f0-9]{64}$/.test(input.review))
  )
    throw Error("Empreinte de revue invalide.");
  return { version: 1, from, to, rows, review: input.review };
}
export function fingerprint(state) {
  const s = normalize(state);
  return hash({ from: s.from, to: s.to, rows: s.rows });
}
export function analyze(state) {
  const s = normalize(state);
  const rows = s.rows.map((r) => {
    try {
      const transformed = transform(r.value, s.from, s.to);
      return {
        ...r,
        ...transformed,
        status: r.excluded
          ? "excluded"
          : transformed.changed
            ? "changed"
            : "unchanged",
      };
    } catch (error) {
      return {
        ...r,
        status: r.excluded ? "excluded" : "error",
        error: error.message,
        output: r.value,
        leaves: [],
      };
    }
  });
  const blocked = rows.filter((r) => r.status === "error");
  return {
    rows,
    blocked,
    changed: rows.filter((r) => r.status === "changed"),
    excluded: rows.filter((r) => r.status === "excluded"),
    reviewed: s.review === fingerprint(s) && !blocked.length,
  };
}
export function review(state) {
  const s = normalize(state);
  if (analyze(s).blocked.length)
    throw Error(
      "Corrigez ou excluez avec motif les valeurs invalides avant la revue.",
    );
  return { ...s, review: fingerprint(s) };
}
export function updateRow(state, name, patch) {
  return normalize({
    ...state,
    review: null,
    rows: state.rows.map((r) => (r.name === name ? { ...r, ...patch } : r)),
  });
}
export function importCsv(raw, current) {
  const data = parseCsv(raw, {
    requiredHeaders: ["option_name", "option_value"],
    maxRows: 100,
  });
  if (data.headers.length !== 2)
    throw Error("Le CSV doit contenir seulement option_name et option_value.");
  return normalize({
    ...current,
    review: null,
    rows: data.rows.map((r) => ({
      name: r.option_name,
      value: r.option_value,
      excluded: false,
      reason: "",
    })),
  });
}
export function restore(raw) {
  if (byteLength(raw) > MAX_FILE_BYTES)
    throw Error("Dossier JSON trop volumineux.");
  const result = normalize(JSON.parse(raw));
  // Canonicalize stale review rather than upgrading it to a valid review.
  if (result.review !== fingerprint(result)) result.review = null;
  return result;
}
export function plan(state) {
  const s = normalize(state),
    a = analyze(s);
  if (!a.reviewed)
    throw Error("La version courante doit être relue avant l’export du plan.");
  return {
    schema: "rose-plan-v1",
    origin: s.from,
    destination: s.to,
    review: s.review,
    changes: a.changed.map((r) => ({
      option_name: r.name,
      before: r.value,
      after: r.output,
    })),
    exceptions: a.excluded.map((r) => ({
      option_name: r.name,
      reason: r.reason,
      before: r.value,
      error: r.error || null,
    })),
    unchanged: a.rows
      .filter((r) => r.status === "unchanged")
      .map((r) => r.name),
  };
}
const str = (value) => ({ type: "s", value });
const arr = (pairs) => ({
  type: "a",
  entries: pairs.map(([key, value]) => ({ key: str(key), value })),
});
export function seed() {
  return {
    version: 1,
    from: "https://atelier.test",
    to: "https://nouvel-atelier.test",
    review: null,
    rows: [
      {
        name: "siteurl",
        value: "https://atelier.test",
        excluded: false,
        reason: "",
      },
      {
        name: "home",
        value: "https://atelier.test",
        excluded: false,
        reason: "",
      },
      {
        name: "widget_atelier",
        value: serializePhp(
          arr([
            ["title", str("L’Atelier — été")],
            [
              "image",
              arr([
                ["url", str("https://atelier.test/wp-content/uploads/été.png")],
                ["alt", str("La collection d’été")],
              ]),
            ],
            [
              "links",
              arr([
                ["url", str("https://atelier.test/produits")],
                ["label", str("Nos produits")],
              ]),
            ],
          ]),
        ),
        excluded: false,
        reason: "",
      },
      {
        name: "cache_banner",
        value: 's:12:"https://atelier.test/banner.jpg";',
        excluded: false,
        reason: "",
      },
      {
        name: "lien_partenaire",
        value: "https://atelier.test.example.net/catalogue",
        excluded: false,
        reason: "",
      },
      {
        name: "options_archives",
        value: "https://atelier.test/archive",
        excluded: true,
        reason: "Archive de référence conservée pour comparaison.",
      },
    ],
  };
}

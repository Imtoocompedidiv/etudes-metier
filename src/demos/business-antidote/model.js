import { parseCsv } from "../../shared/files.js";

export const redirectHeaders = ["source", "destination", "code"];
export const inventoryHeaders = ["url", "statut", "visites"];
export const seed = {
  redirects: [
    ["/services", "/expertises", "301"],
    ["/expertises", "/conseil", "301"],
    ["/guide", "/livre-blanc", "301"],
    ["/livre-blanc", "/guide", "301"],
    ["/actualites", "/journal", "301"],
    ["/contactez-nous", "/contact", "301"],
  ].map(([source, destination, code], i) => ({
    id: `r${i}`,
    source,
    destination,
    code,
  })),
  inventory: [
    ["/services", "404", "245"],
    ["/expertises", "404", "90"],
    ["/guide", "404", "156"],
    ["/livre-blanc", "404", "20"],
    ["/actualites", "404", "112"],
    ["/contactez-nous", "404", "48"],
    ["/conseil", "200", "0"],
    ["/ressources/guide", "200", "0"],
    ["/journal", "200", "0"],
    ["/contact", "200", "0"],
  ].map(([url, statut, visites], i) => ({ id: `u${i}`, url, statut, visites })),
};

export function path(value) {
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s#]/.test(value)
  )
    return null;
  try {
    const u = new URL(value, "https://recette.example");
    return u.origin === "https://recette.example"
      ? u.pathname + u.search
      : null;
  } catch {
    return null;
  }
}

export function importRows(text, kind) {
  const headers = kind === "redirects" ? redirectHeaders : inventoryHeaders;
  const parsed = parseCsv(text, { requiredHeaders: headers, maxRows: 1000 });
  if (!parsed.rows.length)
    throw new Error("Le fichier ne contient aucune ligne.");
  if (parsed.headers.some((h) => !headers.includes(h)))
    throw new Error(`Colonnes attendues uniquement : ${headers.join(", ")}.`);
  return parsed.rows.map((r, i) => {
    const row = { id: `${kind === "redirects" ? "r" : "u"}${i}` };
    for (const h of headers) {
      const value = String(r[h] ?? "").trim();
      if (value.length > 500)
        throw new Error(`Ligne ${i + 2} : ${h} dépasse 500 caractères.`);
      row[h] = value;
    }
    return row;
  });
}

export function validateState(value) {
  return (
    value &&
    ["redirects", "inventory"].every(
      (k) =>
        Array.isArray(value[k]) &&
        value[k].length > 0 &&
        value[k].length <= 1000 &&
        value[k].every(
          (row) =>
            row &&
            typeof row.id === "string" &&
            (k === "redirects" ? redirectHeaders : inventoryHeaders).every(
              (h) => typeof row[h] === "string" && row[h].length <= 500,
            ),
        ),
    )
  );
}

export function trace(start, value) {
  const first = path(start);
  if (!first)
    return {
      ok: false,
      code: "format",
      message: "Chemin interne requis, sans espace, fragment ou domaine.",
      nodes: [String(start)],
      edges: [],
    };
  const groups = new Map();
  for (const rule of value.redirects) {
    const source = path(rule.source);
    if (source) groups.set(source, [...(groups.get(source) || []), rule]);
  }
  const visited = new Set();
  const nodes = [first],
    edges = [];
  let current = first;
  while (groups.has(current)) {
    if (visited.has(current))
      return {
        ok: false,
        code: "cycle",
        message:
          "Boucle de redirection : ce chemin repasse par une URL déjà visitée.",
        nodes,
        edges,
      };
    visited.add(current);
    const options = groups.get(current);
    if (options.length > 1)
      return {
        ok: false,
        code: "duplicate",
        message:
          "Plusieurs règles pour cette source. Choisissez une seule destination.",
        nodes,
        edges,
      };
    const rule = options[0];
    if (!["301", "302"].includes(rule.code))
      return {
        ok: false,
        code: "status",
        message: "Code de redirection attendu : 301 ou 302.",
        nodes,
        edges,
      };
    const next = path(rule.destination);
    if (!next)
      return {
        ok: false,
        code: "destination",
        message: "La destination doit être un chemin interne valide.",
        nodes,
        edges,
      };
    edges.push({ id: rule.id, from: current, to: next, code: rule.code });
    nodes.push(next);
    current = next;
  }
  const targets = value.inventory.filter((item) => path(item.url) === current);
  if (targets.length !== 1)
    return {
      ok: false,
      code: targets.length ? "inventory-duplicate" : "unknown",
      message: targets.length
        ? "La destination figure plusieurs fois dans l’inventaire."
        : "Destination absente de l’inventaire : son statut reste inconnu.",
      nodes,
      edges,
      terminal: current,
    };
  if (targets[0].statut !== "200")
    return {
      ok: false,
      code: "target-status",
      message: `Le statut déclaré de la destination est ${targets[0].statut || "vide"}, pas 200.`,
      nodes,
      edges,
      terminal: current,
    };
  return {
    ok: true,
    code: edges.length > 1 ? "chain" : "valid",
    nodes,
    edges,
    terminal: current,
    canShorten: edges.length > 1 && edges.every((e) => e.code === "301"),
    message:
      edges.length > 1
        ? `${edges.length} sauts avant une destination déclarée 200.`
        : "Destination déclarée 200 dans l’inventaire.",
  };
}

export function audit(value) {
  const inventoryIssues = [];
  const urls = new Set();
  for (const item of value.inventory) {
    const u = path(item.url);
    if (!u)
      inventoryIssues.push({
        id: item.id,
        message: `Chemin invalide : ${item.url || "vide"}.`,
      });
    if (u && urls.has(u))
      inventoryIssues.push({ id: item.id, message: `URL en double : ${u}.` });
    urls.add(u);
    if (!["200", "404", "410", "500"].includes(item.statut))
      inventoryIssues.push({
        id: item.id,
        message: `Statut non pris en charge pour ${item.url}.`,
      });
    if (
      !/^\d+$/.test(item.visites) ||
      !Number.isSafeInteger(Number(item.visites)) ||
      Number(item.visites) > 100000000
    )
      inventoryIssues.push({
        id: item.id,
        message: `Visites requises, de 0 à 100 millions : ${item.url}.`,
      });
  }
  const rules = value.redirects.map((rule) => ({
    ...rule,
    result: trace(rule.source, value),
    visits: Number(
      value.inventory.find((u) => path(u.url) === path(rule.source))?.visites ||
        0,
    ),
  }));
  return {
    rules,
    inventoryIssues,
    errors: rules.filter((r) => !r.result.ok).length + inventoryIssues.length,
    chains: rules.filter((r) => r.result.code === "chain").length,
  };
}

export function shorten(value, id) {
  const rule = value.redirects.find((r) => r.id === id);
  if (!rule) throw new Error("Règle introuvable.");
  const result = trace(rule.source, value);
  if (!result.canShorten)
    throw new Error(
      "Seules les chaînes entièrement permanentes vers un statut 200 peuvent être raccourcies ici.",
    );
  return {
    ...value,
    redirects: value.redirects.map((r) =>
      r.id === id ? { ...r, destination: result.terminal } : r,
    ),
  };
}

export function exportPlan(value) {
  if (audit(value).errors)
    throw new Error("Corrigez les erreurs avant d’exporter le plan.");
  return value.redirects.map((r) => ({
    source: path(r.source),
    destination: path(r.destination),
    code: r.code,
  }));
}

export function report(value) {
  const result = audit(value);
  return {
    title: "Recette des redirections",
    limits:
      "Chemins internes exacts ; pas de crawl, regex, règle serveur ou contrôle distant. Les statuts sont déclarés dans l’inventaire.",
    errors: result.errors,
    chains: result.chains,
    rules: result.rules,
    inventoryIssues: result.inventoryIssues,
    inventory: value.inventory,
  };
}

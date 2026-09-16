export const fields = [
  { key: "id", label: "Identifiant", description: "Clé unique du séjour" },
  { key: "name", label: "Nom", description: "Intitulé du séjour" },
  { key: "zone", label: "Zone", description: "Destination géographique" },
  { key: "segment", label: "Segment", description: "Catégorie du séjour" },
  {
    key: "price",
    label: "Prix",
    description: "Montant en euros, hors calcul commercial",
  },
];

const reference = `<?xml version="1.0" encoding="UTF-8"?>
<Catalog>
  <Trip Id="S-101" Name="Les jardins de Loire" Zone="France">
    <Segment Name="Culture" />
    <Price>249.00</Price>
  </Trip>
  <Trip Id="S-102" Name="Escales ligures" Zone="Italie">
    <Segment Name="Découverte" />
    <Price>389.50</Price>
  </Trip>
  <Trip Id="S-103" Name="Les chemins du Jura" Zone="France">
    <Segment Name="Nature" />
    <Price>175.00</Price>
  </Trip>
</Catalog>`;

export const seed = {
  version: 1,
  reference,
  candidate: reference.replaceAll("Zone=", "Region="),
  contract: {
    recordPath: "/Catalog/Trip",
    fields: {
      id: { path: "@Id", type: "text", required: true },
      name: { path: "@Name", type: "text", required: true },
      zone: { path: "@Zone", type: "text", required: true },
      segment: { path: "Segment/@Name", type: "text", required: true },
      price: { path: "Price", type: "money", required: true },
    },
  },
};

export function preflightXml(text) {
  if (typeof text !== "string" || !text.trim())
    throw new Error("Le fichier XML est vide.");
  if (text.length > 200_000)
    throw new Error("Limite de 200 000 caractères par fichier XML.");
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) {
    throw new Error(
      "Les déclarations DOCTYPE et ENTITY sont refusées. Fournissez un XML autonome sans déclaration d’entité.",
    );
  }
  return text;
}

function expandedName(node) {
  return node.namespaceURI
    ? `{${node.namespaceURI}}${node.localName}`
    : node.localName;
}

export function parseXml(text, Parser = globalThis.DOMParser) {
  preflightXml(text);
  if (!Parser)
    throw new Error("L’analyse XML nécessite un navigateur doté de DOMParser.");
  const doc = new Parser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror") || !doc.documentElement) {
    throw new Error(
      "XML mal formé. Vérifiez les balises, guillemets et caractères échappés avant de charger ce fichier.",
    );
  }
  let count = 0;
  function walk(element, depth) {
    count += 1;
    if (count > 5000 || depth > 24)
      throw new Error(
        "Le document dépasse 5 000 éléments ou 24 niveaux de profondeur.",
      );
    const attrs = Array.from(element.attributes)
      .filter((a) => a.namespaceURI !== "http://www.w3.org/2000/xmlns/")
      .map((a) => ({ name: expandedName(a), value: a.value }));
    if (attrs.some((a) => a.value.length > 5000))
      throw new Error("Un attribut dépasse 5 000 caractères.");
    return {
      name: expandedName(element),
      text: element.textContent.trim(),
      attrs,
      children: Array.from(element.children).map((child) =>
        walk(child, depth + 1),
      ),
    };
  }
  return walk(doc.documentElement, 1);
}

// Clark notation keeps URI slashes inside one path component, independent of prefixes.
export function pathParts(path, absolute = false) {
  if (typeof path !== "string" || path.length > 1000 || !path.trim())
    throw new Error("Renseignez un chemin.");
  if (absolute !== path.startsWith("/"))
    throw new Error(
      absolute
        ? "Le chemin des objets doit commencer par /."
        : "Utilisez un chemin relatif à un objet, sans / initial.",
    );
  let inside = false;
  let part = "";
  const result = [];
  for (const char of absolute ? path.slice(1) : path) {
    if (char === "{") {
      if (inside || (part !== "" && part !== "@"))
        throw new Error("Espace de noms invalide.");
      inside = true;
    } else if (char === "}") {
      if (!inside) throw new Error("Espace de noms invalide.");
      inside = false;
    }
    if (char === "/" && !inside) {
      result.push(part);
      part = "";
    } else part += char;
  }
  result.push(part);
  if (
    inside ||
    result.some((p) => !/^@?(?:\{[^{}]+\})?[\p{L}_][\p{L}\p{N}_.-]*$/u.test(p))
  ) {
    throw new Error(
      "Chemin exact attendu : Élément/@Attribut. XPath, jokers et indices ne sont pas pris en charge.",
    );
  }
  if (
    result.slice(0, -1).some((p) => p.startsWith("@")) ||
    (absolute && result.some((p) => p.startsWith("@")))
  ) {
    throw new Error(
      "Un attribut ne peut apparaître qu’à la fin d’un chemin de champ.",
    );
  }
  return result;
}

export function selectRecords(root, path) {
  const [first, ...rest] = pathParts(path, true);
  let nodes = root.name === first ? [root] : [];
  for (const name of rest)
    nodes = nodes.flatMap((n) => n.children.filter((c) => c.name === name));
  if (nodes.length > 1000)
    throw new Error("Le contrat sélectionne plus de 1 000 objets.");
  return nodes;
}

export function pathValues(record, path) {
  const parts = pathParts(path);
  let nodes = [record];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part.startsWith("@"))
      return nodes.flatMap((n) =>
        n.attrs.filter((a) => a.name === part.slice(1)).map((a) => a.value),
      );
    nodes = nodes.flatMap((n) => n.children.filter((c) => c.name === part));
  }
  return nodes.map((n) => n.text);
}

export function structuralPaths(root) {
  const paths = new Set();
  function walk(node, base) {
    const path = `${base}/${node.name}`;
    paths.add(path);
    for (const attr of node.attrs) paths.add(`${path}/@${attr.name}`);
    for (const child of node.children) walk(child, path);
  }
  walk(root, "");
  return [...paths].sort();
}

export function compareStructures(before, after) {
  const a = new Set(structuralPaths(before));
  const b = new Set(structuralPaths(after));
  return {
    removed: [...a].filter((p) => !b.has(p)).sort(),
    added: [...b].filter((p) => !a.has(p)).sort(),
    retained: [...a].filter((p) => b.has(p)).sort(),
  };
}

export function validContract(c) {
  try {
    pathParts(c.recordPath, true);
    if (!c.fields || Object.keys(c.fields).length !== fields.length)
      return false;
    return fields.every(({ key }) => {
      if (!Object.hasOwn(c.fields, key)) return false;
      const rule = c.fields[key];
      return (
        rule &&
        typeof rule.path === "string" &&
        rule.path.length <= 1000 &&
        ["text", "money"].includes(rule.type) &&
        typeof rule.required === "boolean" &&
        (key !== "id" || (rule.required && rule.type === "text"))
      );
    });
  } catch {
    return false;
  }
}

export function validateState(s) {
  if (!s || s.version !== 1 || !validContract(s.contract)) return false;
  try {
    preflightXml(s.reference);
    preflightXml(s.candidate);
    return true;
  } catch {
    return false;
  }
}

function money(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error(
      "Montant attendu en euros, avec un point et au plus deux décimales.",
    );
  const [whole, decimal = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents))
    throw new Error("Montant hors précision entière disponible.");
  return cents;
}

export function normalize(root, contract) {
  if (!validContract(contract))
    return {
      fatal:
        "Contrat invalide. Vérifiez le chemin des objets et les cinq champs attendus.",
      rows: [],
      errors: [],
    };
  let records;
  try {
    records = selectRecords(root, contract.recordPath);
  } catch (e) {
    return { fatal: e.message, rows: [], errors: [] };
  }
  if (!records.length)
    return {
      fatal: "Aucun objet ne correspond au chemin du contrat.",
      rows: [],
      errors: [],
    };
  const rows = records.map((record, index) => {
    const values = {};
    const errors = [];
    for (const { key, label } of fields) {
      const rule = contract.fields[key];
      try {
        const found = pathValues(record, rule.path);
        if (found.length > 1)
          throw new Error(
            `${label} : ${found.length} valeurs trouvées ; le contrat attend une valeur unique.`,
          );
        const value = found[0]?.trim() ?? "";
        if (!value) {
          if (rule.required)
            throw new Error(`Valeur absente ou vide pour le champ ${label}.`);
          values[key] = null;
        } else if (value.length > 5000)
          throw new Error(`${label} dépasse 5 000 caractères.`);
        else values[key] = rule.type === "money" ? money(value) : value;
      } catch (error) {
        errors.push({ field: key, path: rule.path, message: error.message });
        values[key] = null;
      }
    }
    return { index: index + 1, values, errors };
  });
  const frequencies = new Map();
  for (const row of rows)
    if (row.values.id)
      frequencies.set(row.values.id, (frequencies.get(row.values.id) ?? 0) + 1);
  for (const row of rows)
    if (frequencies.get(row.values.id) > 1)
      row.errors.push({
        field: "id",
        path: contract.fields.id.path,
        message: "Identifiant dupliqué dans le flux.",
      });
  return {
    fatal: null,
    rows,
    errors: rows.flatMap((row) =>
      row.errors.map((e) => ({
        object: row.index,
        id: row.values.id ?? "",
        ...e,
      })),
    ),
  };
}

export function analyze(state) {
  let before, after, referenceError, candidateError;
  try {
    before = parseXml(state.reference);
  } catch (e) {
    referenceError = e.message;
  }
  try {
    after = parseXml(state.candidate);
  } catch (e) {
    candidateError = e.message;
  }
  return {
    referenceError,
    candidateError,
    diff: before && after ? compareStructures(before, after) : null,
    result: after
      ? normalize(after, state.contract)
      : { fatal: candidateError, rows: [], errors: [] },
  };
}

import { parseCsv } from "../../shared/files.js";

export const types = ["authors", "categories", "articles"];
export const labels = {
  authors: "Auteurs",
  categories: "Catégories",
  articles: "Articles",
};
export const fields = {
  authors: { id: "Identifiant", slug: "Slug", name: "Nom" },
  categories: { id: "Identifiant", slug: "Slug", name: "Nom" },
  articles: {
    id: "Identifiant",
    slug: "Slug",
    title: "Titre",
    author: "Auteur",
    categories: "Catégories",
    date: "Date de publication",
    excerpt: "Extrait",
  },
};
const knownColumns = {
  id: "id",
  slug: "slug",
  name: "nom",
  title: "titre",
  author: "auteur",
  categories: "categories",
  date: "date_publication",
  excerpt: "extrait",
};
const data = {
  authors: [
    { id: "a-001", slug: "maria-duval", nom: "Maria Duval" },
    { id: "a-002", slug: "thomas-bernard", nom: "Thomas Bernard" },
  ],
  categories: [
    { id: "c-001", slug: "architecture", nom: "Architecture" },
    { id: "c-002", slug: "portraits", nom: "Portraits" },
    { id: "c-003", slug: "materiaux", nom: "Matériaux" },
  ],
  articles: [
    {
      id: "p-001",
      slug: "le-temps-du-chantier",
      titre: "Le temps du chantier",
      auteur: "a-003",
      categories: "c-001|c-002",
      date_publication: "2026-09-01",
      extrait:
        "Au fil du chantier, les usages se précisent. Le dessin laisse place aux gestes et chaque matière prend sa place.",
    },
    {
      id: "p-002",
      slug: "la-matiere-en-main",
      titre: "La matière en main",
      auteur: "a-002",
      categories: "c-003",
      date_publication: "2026-09-05",
      extrait:
        "Un atelier ouvre ses portes. De la première coupe au dernier assemblage, Thomas observe une autre façon de construire.",
    },
    {
      id: "p-003",
      slug: "habiter-autrement",
      titre: "Habiter autrement",
      auteur: "a-001",
      categories: "c-001",
      date_publication: "2026-09-09",
      extrait:
        "Une maison se transforme avec celles et ceux qui l’habitent. Trois espaces racontent ce changement.",
    },
    {
      id: "p-004",
      slug: "les-outils-du-geste",
      titre: "Les outils du geste",
      auteur: "a-002",
      categories: "c-002|c-003",
      date_publication: "2026-09-12",
      extrait:
        "Les outils portent la mémoire de l’atelier. Ce portrait suit les traces laissées sur un établi.",
    },
  ],
};

function collection(type, headers, rows) {
  return {
    headers,
    map: Object.fromEntries(
      Object.keys(fields[type]).map((field) => [
        field,
        headers.includes(knownColumns[field])
          ? knownColumns[field]
          : headers.includes(field)
            ? field
            : "",
      ]),
    ),
    rows: rows.map((record, index) => ({
      uid: `${type}-${index}`,
      data: { ...record },
      original: { ...record },
    })),
  };
}
export const seed = {
  collections: Object.fromEntries(
    types.map((type) => [
      type,
      collection(type, Object.keys(data[type][0]), data[type]),
    ]),
  ),
  journal: [],
};

export function parseCollection(text, type) {
  if (!types.includes(type)) throw new Error("Collection inconnue.");
  const parsed = parseCsv(text, { maxRows: 1000 });
  if (!parsed.rows.length)
    throw new Error("Le fichier ne contient aucune ligne.");
  if (parsed.headers.length > 20)
    throw new Error("Vingt colonnes au maximum par collection.");
  if (parsed.headers.some((header) => !header.trim() || header.length > 200))
    throw new Error("Un nom de colonne est vide ou dépasse 200 caractères.");
  for (const row of parsed.rows) {
    if (Object.values(row).some((value) => value.length > 5000))
      throw new Error("Un champ dépasse 5 000 caractères.");
  }
  return collection(type, parsed.headers, parsed.rows);
}

export function validState(value) {
  if (
    !value ||
    !value.collections ||
    !Array.isArray(value.journal) ||
    value.journal.length > 80
  )
    return false;
  if (
    !value.journal.every(
      (item) =>
        item &&
        typeof item.action === "string" &&
        item.action.length < 2000 &&
        typeof item.at === "string" &&
        item.at.length <= 50,
    )
  )
    return false;
  return types.every((type) => {
    const item = value.collections[type];
    if (
      !item ||
      !Array.isArray(item.headers) ||
      !item.headers.length ||
      item.headers.length > 20 ||
      new Set(item.headers).size !== item.headers.length
    )
      return false;
    if (
      !item.headers.every(
        (key) => typeof key === "string" && key.trim() && key.length <= 200,
      )
    )
      return false;
    if (
      !item.map ||
      !Object.keys(fields[type]).every(
        (key) =>
          typeof item.map[key] === "string" &&
          (!item.map[key] || item.headers.includes(item.map[key])),
      )
    )
      return false;
    if (Object.keys(item.map).length !== Object.keys(fields[type]).length)
      return false;
    if (
      !Array.isArray(item.rows) ||
      !item.rows.length ||
      item.rows.length > 1000 ||
      new Set(item.rows.map((row) => row?.uid)).size !== item.rows.length
    )
      return false;
    return item.rows.every(
      (row) =>
        typeof row.uid === "string" &&
        row.uid.length <= 100 &&
        ["data", "original"].every(
          (key) =>
            row[key] &&
            item.headers.every(
              (header) =>
                typeof row[key][header] === "string" &&
                row[key][header].length <= 5000,
            ),
        ),
    );
  });
}

export function parseDossier(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Le dossier JSON ne peut pas être lu.");
  }
  if (!validState(value))
    throw new Error(
      "Le dossier ne respecte pas le format des trois collections.",
    );
  return value;
}

export function normalize(item) {
  return item.rows.map((row) => ({
    uid: row.uid,
    ...Object.fromEntries(
      Object.entries(item.map).map(([field, source]) => [
        field,
        String(row.data[source] ?? "").trim(),
      ]),
    ),
  }));
}
export function categoryIds(value) {
  return value
    .split("|")
    .map((id) => id.trim())
    .filter(Boolean);
}
function dateValid(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
const indexedCounts = (rows, key) => {
  const counts = new Map();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return counts;
};

export function audit(value) {
  const normalized = Object.fromEntries(
    types.map((type) => [type, normalize(value.collections[type])]),
  );
  const problems = [];
  const add = (type, uid, field, message) =>
    problems.push({ type, uid, field, message });
  for (const type of types) {
    const item = value.collections[type];
    const selected = Object.values(item.map).filter(Boolean);
    for (const field of Object.keys(fields[type])) {
      if (!item.map[field])
        add(
          type,
          null,
          field,
          `Associez une colonne au champ « ${fields[type][field]} ».`,
        );
      else if (selected.filter((col) => col === item.map[field]).length > 1)
        add(
          type,
          null,
          field,
          "Une colonne source est associée à plusieurs champs.",
        );
    }
    const ids = indexedCounts(normalized[type], "id");
    const slugs = indexedCounts(normalized[type], "slug");
    for (const row of normalized[type]) {
      for (const field of Object.keys(fields[type])) {
        if (!item.map[field]) continue;
        if (!row[field])
          add(type, row.uid, field, `${fields[type][field]} obligatoire.`);
        else if (row[field].length > (field === "excerpt" ? 5000 : 240))
          add(type, row.uid, field, "Ce champ dépasse la longueur admise.");
      }
      if (row.id && !/^[a-zA-Z0-9_-]+$/.test(row.id))
        add(
          type,
          row.uid,
          "id",
          "Identifiant composé de lettres, chiffres, tirets ou soulignements.",
        );
      if (row.id && ids.get(row.id) > 1)
        add(
          type,
          row.uid,
          "id",
          "Identifiant présent plusieurs fois dans cette collection.",
        );
      if (row.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug))
        add(
          type,
          row.uid,
          "slug",
          "Slug attendu en minuscules, mots séparés par des tirets.",
        );
      if (row.slug && slugs.get(row.slug) > 1)
        add(
          type,
          row.uid,
          "slug",
          "Slug présent plusieurs fois dans cette collection.",
        );
      if (type === "articles") {
        if (row.date && !dateValid(row.date))
          add(
            type,
            row.uid,
            "date",
            "Date réelle attendue au format AAAA-MM-JJ.",
          );
        const authors = normalized.authors.filter(
          (author) => author.id === row.author,
        );
        if (row.author && authors.length !== 1)
          add(
            type,
            row.uid,
            "author",
            authors.length
              ? "Référence auteur ambiguë."
              : `Auteur « ${row.author} » introuvable.`,
          );
        const refs = categoryIds(row.categories);
        if (!refs.length && row.categories)
          add(
            type,
            row.uid,
            "categories",
            "Indiquez au moins un identifiant de catégorie.",
          );
        if (new Set(refs).size !== refs.length)
          add(
            type,
            row.uid,
            "categories",
            "Une catégorie figure plusieurs fois.",
          );
        for (const id of refs) {
          const matches = normalized.categories.filter(
            (category) => category.id === id,
          );
          if (matches.length !== 1)
            add(
              type,
              row.uid,
              "categories",
              matches.length
                ? `Catégorie « ${id} » ambiguë.`
                : `Catégorie « ${id} » introuvable.`,
            );
        }
      }
    }
  }
  return {
    normalized,
    problems,
    ready: !problems.length,
    counts: Object.fromEntries(
      types.map((type) => [
        type,
        problems.filter((item) => item.type === type).length,
      ]),
    ),
  };
}

export function recordChange(value, action) {
  return {
    ...value,
    journal: [...value.journal, { at: new Date().toISOString(), action }].slice(
      -80,
    ),
  };
}
export function editRow(value, type, uid, draft) {
  const item = value.collections[type];
  const next = {
    ...item,
    rows: item.rows.map((row) =>
      row.uid !== uid
        ? row
        : {
            ...row,
            data: {
              ...row.data,
              ...Object.fromEntries(
                Object.entries(draft)
                  .filter(([field]) => item.map[field])
                  .map(([field, text]) => [item.map[field], text]),
              ),
            },
          },
    ),
  };
  return recordChange(
    { ...value, collections: { ...value.collections, [type]: next } },
    `${labels[type]} · ${uid} · valeurs modifiées`,
  );
}
export function exportRows(value, type) {
  const result = audit(value);
  if (!result.ready)
    throw new Error(
      "Corrigez les correspondances et les références avant de livrer les collections.",
    );
  return result.normalized[type].map(({ uid, ...row }) => row);
}
export function manifest(value) {
  const result = audit(value);
  if (!result.ready) throw new Error("Le dossier comporte encore des erreurs.");
  return {
    format: "sans-concept-cms-recipe-v1",
    note: "Format de préparation, pas un import natif universel Framer. Associer les champs et références dans le CMS cible.",
    order: types.map((type) => ({
      collection: type,
      dependsOn: type === "articles" ? ["authors", "categories"] : [],
      file: `sans-concept-${type}.csv`,
      rows: result.normalized[type].length,
    })),
    rules: {
      categorySeparator: "|",
      date: "YYYY-MM-DD",
      referenceKey: "id",
      excerpt: "Texte brut",
    },
    mappings: Object.fromEntries(
      types.map((type) => [type, value.collections[type].map]),
    ),
    journal: value.journal,
  };
}

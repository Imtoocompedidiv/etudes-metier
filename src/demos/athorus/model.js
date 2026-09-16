import { parseCsv } from "../../shared/files.js";

export const headers = [
  "URL handle",
  "Title",
  "Option1 name",
  "Option1 value",
  "SKU",
  "Price",
  "Inventory quantity",
];
export const maxFieldLength = 240;
export const seed = [
  ["sac-rivage", "Sac Rivage", "Couleur", "Sable", "RIV-SA", "79.00", "12"],
  ["sac-rivage", "", "Couleur", "Bleu", "RIV-SA", "79.00", "8"],
  ["sac-rivage", "", "Couleur", "Olive", "RIV-OL", "79.00", "5"],
  ["sac-traverse", "Sac Traverse", "Couleur", "Sable", "TR-SA", "89.00", "4"],
  ["sac-traverse", "", "Couleur", "Bleu", "TR-BL", "89.00", "7"],
  ["sac-traverse", "", "Couleur", "Olive", "TR-OL", "89.00", "0"],
].map((cells, index) => ({
  id: `row-${index + 1}`,
  ...Object.fromEntries(headers.map((h, i) => [h, cells[i]])),
}));

export function importCatalogue(text) {
  const parsed = parseCsv(text, { requiredHeaders: headers, maxRows: 500 });
  const extra = parsed.headers.filter((h) => !headers.includes(h));
  if (extra.length)
    throw new Error(
      `Colonnes hors du sous-ensemble : ${extra.join(", ")}. Utilisez le fichier exemple pour préparer un lot de recette.`,
    );
  if (!parsed.rows.length)
    throw new Error("Le fichier ne contient aucune variante.");
  for (const [index, row] of parsed.rows.entries()) {
    for (const field of headers) {
      if (String(row[field] ?? "").length > maxFieldLength)
        throw new Error(
          `Ligne ${index + 2}, ${field} : ${maxFieldLength} caractères maximum pour ce banc de recette.`,
        );
    }
  }
  return parsed.rows.map((row, index) => ({
    id: `row-${index + 1}`,
    ...Object.fromEntries(headers.map((h) => [h, String(row[h] ?? "").trim()])),
  }));
}

export function productTitle(rows, handle) {
  return (
    rows.find((row) => row["URL handle"] === handle && row.Title.trim())
      ?.Title ||
    handle ||
    "Produit sans nom"
  );
}

export function validateCatalogue(rows) {
  const issues = [];
  const add = (row, field, code, message) =>
    issues.push({
      rowId: row.id,
      line: rows.indexOf(row) + 2,
      field,
      code,
      message,
    });
  const skuGroups = new Map();
  const options = new Map();
  const products = new Map();
  for (const row of rows) {
    for (const field of headers) {
      if (row[field].length > maxFieldLength)
        add(
          row,
          field,
          "field-length",
          `${field} dépasse ${maxFieldLength} caractères, limite de cette recette.`,
        );
    }
    const handle = row["URL handle"];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle))
      add(
        row,
        "URL handle",
        "handle",
        "Identifiant produit requis, en minuscules, chiffres et traits d’union.",
      );
    if (!row["Option1 name"].trim())
      add(
        row,
        "Option1 name",
        "option-name",
        "Le nom de l’option est obligatoire.",
      );
    if (!row["Option1 value"].trim())
      add(
        row,
        "Option1 value",
        "option-value",
        "La valeur de l’option est obligatoire.",
      );
    if (!row.SKU.trim())
      add(
        row,
        "SKU",
        "sku-missing",
        "Une référence est requise pour cette recette.",
      );
    if (!/^\d+(?:\.\d{1,2})?$/.test(row.Price) || Number(row.Price) > 1000000)
      add(
        row,
        "Price",
        "price",
        "Prix requis, positif ou nul, avec un point décimal et deux décimales maximum.",
      );
    if (
      !/^\d+$/.test(row["Inventory quantity"]) ||
      !Number.isSafeInteger(Number(row["Inventory quantity"]))
    )
      add(
        row,
        "Inventory quantity",
        "stock",
        "Stock requis, entier positif ou nul.",
      );
    const sku = row.SKU.trim().toLowerCase();
    if (sku) skuGroups.set(sku, [...(skuGroups.get(sku) || []), row]);
    const optionKey = JSON.stringify([
      handle,
      row["Option1 value"].trim().toLowerCase(),
    ]);
    options.set(optionKey, [...(options.get(optionKey) || []), row]);
    products.set(handle, [...(products.get(handle) || []), row]);
  }
  for (const group of skuGroups.values())
    if (group.length > 1) {
      for (const row of group)
        add(
          row,
          "SKU",
          "duplicate-sku",
          `Référence en double aux lignes ${group.map((r) => rows.indexOf(r) + 2).join(", ")}.`,
        );
    }
  for (const group of options.values())
    if (group.length > 1) {
      for (const row of group)
        add(
          row,
          "Option1 value",
          "duplicate-option",
          "Cette valeur apparaît plusieurs fois dans le même produit.",
        );
    }
  for (const group of products.values()) {
    const titles = new Set(group.map((r) => r.Title.trim()).filter(Boolean));
    if (!group[0].Title.trim())
      add(
        group[0],
        "Title",
        "title-missing",
        "Le titre doit figurer sur la première ligne de ce produit.",
      );
    if (titles.size > 1)
      for (const row of group)
        add(
          row,
          "Title",
          "title-conflict",
          "Un même identifiant produit désigne plusieurs titres.",
        );
    const names = new Set(group.map((r) => r["Option1 name"].trim()));
    if (names.size > 1)
      for (const row of group)
        add(
          row,
          "Option1 name",
          "option-conflict",
          "Le nom de l’option doit rester identique dans un produit.",
        );
  }
  return issues;
}

export function previewSelection(row, quantity, issues) {
  if (!row) return { ok: false, reason: "Choisissez une variante." };
  if (issues.some((i) => i.rowId === row.id))
    return {
      ok: false,
      reason:
        "La variante comporte une anomalie de catalogue. Corrigez-la avant de la tester.",
    };
  if (
    !/^\d+$/.test(String(quantity)) ||
    Number(quantity) < 1 ||
    !Number.isSafeInteger(Number(quantity))
  )
    return {
      ok: false,
      reason: "Saisissez une quantité entière d’au moins 1.",
    };
  if (Number(quantity) > Number(row["Inventory quantity"]))
    return {
      ok: false,
      reason: `Quantité indisponible : ${row["Inventory quantity"]} en stock.`,
    };
  const totalCents = Math.round(Number(row.Price) * 100) * Number(quantity);
  if (!Number.isSafeInteger(totalCents))
    return {
      ok: false,
      reason:
        "Le total dépasse la précision monétaire prise en charge. Réduisez la quantité.",
    };
  return {
    ok: true,
    reason: `${quantity} exemplaire${Number(quantity) > 1 ? "s" : ""} disponible${Number(quantity) > 1 ? "s" : ""}.`,
    totalCents,
  };
}

function csvCell(value) {
  const text = String(value);
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function recipeCsv(rows, allowInvalid = false) {
  if (!allowInvalid && validateCatalogue(rows).length)
    throw new Error("Corrigez les anomalies avant d’exporter le catalogue.");
  return (
    "\ufeff" +
    [headers, ...rows.map((row) => headers.map((h) => row[h]))]
      .map((cells) => cells.map(csvCell).join(","))
      .join("\n")
  );
}

export function recipeReport(rows) {
  const issues = validateCatalogue(rows);
  return {
    title: "Recette de catalogue à variantes",
    format:
      "Sous-ensemble Shopify ; un emplacement, une option, aucune mise à jour de boutique.",
    rules: [
      "SKU obligatoire et unique sans distinction de casse, règle propre à cette recette.",
      "Stock entier non négatif ; vente au-delà du stock désactivée dans l’aperçu.",
      "Première ligne du produit avec titre ; prix en euros fictifs.",
    ],
    variants: rows.length,
    issues,
    tests: rows.flatMap((row) =>
      [1, Number(row["Inventory quantity"]) + 1].map((quantity) => ({
        sku: row.SKU,
        quantity,
        ...previewSelection(row, String(quantity), issues),
      })),
    ),
    rows,
  };
}

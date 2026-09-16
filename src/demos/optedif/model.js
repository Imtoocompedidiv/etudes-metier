import { parseCsv } from "../../shared/files.js";

export const OP_LABELS = {
  trim: "Nettoyer les espaces",
  amount: "Lire les montants",
  date: "Interpréter les dates",
  dedup: "Repérer les doublons",
  case: "Changer la casse",
};
export const DATE_FORMATS = {
  DMY: "Jour / mois / année",
  MDY: "Mois / jour / année",
  ISO: "Année-mois-jour",
};
export const EXAMPLE_CSV =
  "Commande;Client;Date;Montant\nC-301;  Atelier Aube  ;03/04/2026;1 240,50 €\nC-302;Boulangerie Lune;12/01/2026;89,00 €\nC-303;Librairie Orbe;31/04/2026;457,20 €\nC-304;Maison Verne;18/02/2026;\nC-305;Épicerie Rivage;27/12/2025;3 000,00 €\nC-305;Épicerie Rivage;27/12/2025;3 000,00 €";
export function importSource(text) {
  const parsed = parseCsv(text, { maxRows: 2000 });
  if (parsed.headers.length > 12)
    throw new Error("Cet exercice accepte jusqu’à 12 colonnes.");
  if (!parsed.rows.length)
    throw new Error("Le fichier doit contenir au moins une ligne de données.");
  for (const [i, row] of parsed.rows.entries())
    for (const [column, value] of Object.entries(row))
      if (value.length > 512)
        throw new Error(
          `Ligne ${i + 1}, ${column} : la valeur dépasse 512 caractères.`,
        );
  return {
    headers: parsed.headers,
    rows: parsed.rows.map((values, i) => ({ id: `row-${i + 1}`, values })),
  };
}
export function makeStep(type, headers, id) {
  if (!OP_LABELS[type]) throw new Error("Transformation inconnue.");
  const defaults = {
    trim: { columns: ["*"] },
    amount: {
      column: headers.find((h) => /montant|prix|total/i.test(h)) || headers[0],
      locale: "fr",
    },
    date: {
      column: headers.find((h) => /date/i.test(h)) || headers[0],
      format: "",
    },
    dedup: { columns: [headers[0]], policy: "flag" },
    case: { column: headers[0], mode: "upper" },
  };
  return { id, type, enabled: true, ...defaults[type] };
}
export function initialDocument() {
  const source = importSource(EXAMPLE_CSV);
  return {
    ...source,
    steps: ["trim", "amount", "date", "dedup"].map((type, i) =>
      makeStep(type, source.headers, `step-${i + 1}`),
    ),
  };
}
export function normalizeDate(value, format) {
  const text = String(value).trim();
  if (!text) return { error: "Date absente" };
  if (!DATE_FORMATS[format]) return { error: "Choisissez le format des dates" };
  const match = (
    format === "ISO"
      ? /^(\d{4})-(\d{2})-(\d{2})$/
      : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  ).exec(text);
  if (!match) return { error: `Format attendu : ${DATE_FORMATS[format]}` };
  let year, month, day;
  if (format === "ISO") [year, month, day] = match.slice(1).map(Number);
  else if (format === "DMY") [day, month, year] = match.slice(1).map(Number);
  else [month, day, year] = match.slice(1).map(Number);
  if (year < 1900 || year > 2199)
    return { error: "Année hors de l’exercice (1900–2199)" };
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return { error: "Date impossible" };
  const pad = (n) => String(n).padStart(2, "0");
  return {
    value: `${year}-${pad(month)}-${pad(day)}`,
    explanation: `Jour ${pad(day)} · Mois ${pad(month)} · Année ${year}`,
  };
}
export function normalizeAmount(value, locale = "fr") {
  const raw = String(value).trim();
  if (!raw) return { error: "Montant absent" };
  const text = raw.replace(/\s*€\s*$/, "").replace(/[\u00a0\u202f]/g, " ");
  const pattern =
    locale === "fr"
      ? /^([+-]?)(\d+|\d{1,3}(?: \d{3})+)(?:,(\d{1,2}))?$/
      : /^([+-]?)(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/;
  const match = pattern.exec(text);
  if (!match)
    return {
      error: `Montant ${locale === "fr" ? "français" : "anglais"} invalide`,
    };
  const absolute =
    BigInt(match[2].replace(/[ ,]/g, "")) * 100n +
    BigInt((match[3] || "").padEnd(2, "0"));
  if (absolute > 100000000000000n)
    return { error: "Montant trop élevé pour cet exercice" };
  const cents = match[1] === "-" ? -absolute : absolute;
  return {
    value: `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`,
    explanation: `${locale === "fr" ? "Virgule décimale et espaces de milliers" : "Point décimal et virgules de milliers"} ; ${cents} centimes`,
  };
}
export function validateRecipe(input, headers) {
  if (
    input?.version !== 1 ||
    !Array.isArray(input.steps) ||
    input.steps.length > 12
  )
    throw new Error("Méthode attendue : version 1, jusqu’à 12 opérations.");
  const ids = new Set();
  return input.steps.map((step, index) => {
    if (
      !step ||
      !OP_LABELS[step.type] ||
      typeof step.id !== "string" ||
      ids.has(step.id) ||
      typeof step.enabled !== "boolean"
    )
      throw new Error(`Opération ${index + 1} invalide ou dupliquée.`);
    ids.add(step.id);
    const usesColumns = step.type === "trim" || step.type === "dedup";
    if (usesColumns) {
      if (
        !Array.isArray(step.columns) ||
        !step.columns.length ||
        step.columns.some(
          (c) => !headers.includes(c) && !(step.type === "trim" && c === "*"),
        )
      )
        throw new Error(`Opération ${index + 1} : colonne absente du fichier.`);
    } else if (!headers.includes(step.column))
      throw new Error(
        `Opération ${index + 1} : colonne « ${step.column} » absente.`,
      );
    if (step.type === "amount" && !["fr", "en"].includes(step.locale))
      throw new Error("Lecture des montants inconnue.");
    if (
      step.type === "date" &&
      step.format !== "" &&
      !DATE_FORMATS[step.format]
    )
      throw new Error("Format de date inconnu.");
    if (step.type === "dedup" && !["flag", "first"].includes(step.policy))
      throw new Error("Politique de doublon inconnue.");
    if (step.type === "case" && !["upper", "lower"].includes(step.mode))
      throw new Error("Transformation de casse inconnue.");
    const result = { id: step.id, type: step.type, enabled: step.enabled };
    if (usesColumns) result.columns = [...new Set(step.columns)];
    else result.column = step.column;
    for (const key of ["locale", "format", "policy", "mode"])
      if (key in step) result[key] = step[key];
    return result;
  });
}
export function recipe(document) {
  return {
    version: 1,
    description: "Méthode pédagogique locale",
    steps: structuredClone(document.steps),
  };
}
export function validateDocument(value) {
  try {
    if (
      !Array.isArray(value?.headers) ||
      !value.headers.length ||
      value.headers.length > 12 ||
      new Set(value.headers).size !== value.headers.length ||
      value.headers.some(
        (h) =>
          typeof h !== "string" ||
          !h ||
          ["__proto__", "constructor", "prototype"].includes(h),
      )
    )
      return false;
    if (
      !Array.isArray(value.rows) ||
      !value.rows.length ||
      value.rows.length > 2000
    )
      return false;
    const ids = new Set();
    for (const row of value.rows) {
      if (typeof row?.id !== "string" || ids.has(row.id) || !row.values)
        return false;
      ids.add(row.id);
      for (const h of value.headers)
        if (typeof row.values[h] !== "string" || row.values[h].length > 512)
          return false;
    }
    validateRecipe({ version: 1, steps: value.steps }, value.headers);
    return true;
  } catch {
    return false;
  }
}
function transformCell(value, step) {
  if (step.type === "trim") {
    const result = String(value).trim().replace(/\s+/g, " ");
    return {
      value: result,
      explanation: "Espaces extérieurs retirés et espaces répétés réunis",
    };
  }
  if (step.type === "amount") return normalizeAmount(value, step.locale);
  if (step.type === "date") return normalizeDate(value, step.format);
  if (step.type === "case")
    return {
      value:
        step.mode === "upper"
          ? String(value).toLocaleUpperCase("fr-FR")
          : String(value).toLocaleLowerCase("fr-FR"),
      explanation:
        step.mode === "upper"
          ? "Passage en majuscules"
          : "Passage en minuscules",
    };
  throw new Error("Transformation non prise en charge.");
}
export function runPipeline(document) {
  if (!validateDocument(document))
    throw new Error("Le dossier ou la méthode est invalide.");
  let rows = structuredClone(document.rows),
    issues = [],
    excluded = [];
  const stages = [];
  for (const step of document.steps) {
    const traces = [];
    const before = structuredClone(rows);
    if (step.enabled && step.type === "dedup") {
      const groups = new Map();
      for (const row of rows) {
        const key = JSON.stringify(step.columns.map((c) => row.values[c]));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      const removed = new Set();
      for (const group of groups.values())
        if (group.length > 1) {
          if (step.policy === "first")
            for (const row of group.slice(1)) {
              removed.add(row.id);
              const issue = {
                rowId: row.id,
                column: step.columns.join(" + "),
                stepId: step.id,
                message: `Doublon retiré ; première occurrence ${group[0].id} conservée`,
                severity: "excluded",
              };
              excluded.push(issue);
              traces.push({
                ...issue,
                before: step.columns.map((c) => row.values[c]).join(" / "),
                after: "Ligne exclue",
                explanation: issue.message,
              });
            }
          else
            for (const row of group) {
              const issue = {
                rowId: row.id,
                column: step.columns.join(" + "),
                stepId: step.id,
                message: `Clé partagée par ${group.length} lignes`,
                severity: "error",
              };
              issues.push(issue);
              traces.push({
                ...issue,
                before: step.columns.map((c) => row.values[c]).join(" / "),
                after: "À examiner",
                explanation: issue.message,
              });
            }
        }
      rows = rows.filter((r) => !removed.has(r.id));
      issues = issues.filter((i) => !removed.has(i.rowId));
    } else if (step.enabled) {
      const columns =
        step.type === "trim"
          ? step.columns.includes("*")
            ? document.headers
            : step.columns
          : [step.column];
      rows = rows.map((row) => {
        const values = { ...row.values };
        for (const column of columns) {
          const original = values[column],
            result = transformCell(original, step);
          const trace = {
            rowId: row.id,
            column,
            stepId: step.id,
            before: original,
            after: result.error ? original : result.value,
            explanation: result.error || result.explanation,
            changed: !result.error && original !== result.value,
            severity: result.error ? "error" : "ok",
          };
          traces.push(trace);
          if (result.error)
            issues.push({
              rowId: row.id,
              column,
              stepId: step.id,
              message: result.error,
              severity: "error",
            });
          else values[column] = result.value;
        }
        return { ...row, values };
      });
    }
    stages.push({
      id: step.id,
      enabled: step.enabled,
      before,
      rows: structuredClone(rows),
      issues: structuredClone(issues),
      excluded: structuredClone(excluded),
      traces,
    });
  }
  const failed = new Set(issues.map((i) => i.rowId));
  return {
    rows,
    issues,
    excluded,
    stages,
    validRows: rows.filter((r) => !failed.has(r.id)),
    invalidRows: rows.filter((r) => failed.has(r.id)),
  };
}

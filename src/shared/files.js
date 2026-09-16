export function parseCsv(raw, { requiredHeaders = [], maxRows = 2000 } = {}) {
  const text = String(raw)
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (!text.trim()) throw new Error("Le fichier est vide.");
  let quoted = false,
    first = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
    }
    if (c === "\n" && !quoted) break;
    if (!quoted) first += c;
  }
  const counts = [";", ",", "\t"]
    .map((delimiter) => ({
      delimiter,
      count: first.split(delimiter).length - 1,
    }))
    .sort((a, b) => b.count - a.count);
  if (counts[0].count === counts[1].count && counts[0].count > 0)
    throw new Error(
      "Séparateur ambigu. Utilisez un CSV séparé par des points-virgules.",
    );
  const delimiter = counts[0].delimiter;
  const matrix = [];
  let row = [],
    field = "",
    state = "plain",
    line = 1;
  const endField = () => {
    row.push(field);
    field = "";
    state = "plain";
  };
  const endRow = () => {
    endField();
    if (row.some((v) => v.trim() !== "")) matrix.push(row);
    row = [];
    if (matrix.length > maxRows + 1)
      throw new Error(`Le fichier dépasse ${maxRows} lignes de données.`);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (state === "quoted") {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else state = "closed";
      } else {
        field += c;
        if (c === "\n") line++;
      }
    } else if (c === delimiter) endField();
    else if (c === "\n") {
      endRow();
      line++;
    } else if (state === "closed") {
      if (c !== " " && c !== "\t")
        throw new Error(`Texte inattendu après un guillemet, ligne ${line}.`);
    } else if (c === '"') {
      if (field.length) throw new Error(`Guillemet inattendu, ligne ${line}.`);
      state = "quoted";
    } else field += c;
  }
  if (state === "quoted")
    throw new Error("Un champ entre guillemets n’est pas fermé.");
  endRow();
  const headers = matrix.shift()?.map((v) => v.trim());
  if (!headers?.length || headers.some((v) => !v))
    throw new Error("Chaque colonne doit avoir un nom.");
  if (new Set(headers).size !== headers.length)
    throw new Error("Deux colonnes portent le même nom.");
  if (
    headers.some((v) => ["__proto__", "constructor", "prototype"].includes(v))
  )
    throw new Error("Nom de colonne réservé.");
  const missing = requiredHeaders.filter((h) => !headers.includes(h));
  if (missing.length)
    throw new Error(
      `Colonne${missing.length > 1 ? "s" : ""} manquante${missing.length > 1 ? "s" : ""} : ${missing.join(", ")}.`,
    );
  const rows = matrix.map((values, index) => {
    if (values.length !== headers.length)
      throw new Error(
        `La ligne de données ${index + 1} contient ${values.length} champs au lieu de ${headers.length}.`,
      );
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
  return { headers, rows, delimiter };
}

function safeCell(value) {
  let text = value == null ? "" : String(value);
  if (typeof value !== "number" && /^[\s\u0000-\u001f]*[=+@-]/.test(text))
    text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function csvText(headers, rows) {
  return (
    "\uFEFF" +
    [
      headers,
      ...rows.map((row) =>
        Array.isArray(row) ? row : headers.map((h) => row[h]),
      ),
    ]
      .map((row) => row.map(safeCell).join(";"))
      .join("\r\n")
  );
}
export function downloadText(
  filename,
  text,
  mime = "text/plain;charset=utf-8",
) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-");
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function downloadCsv(filename, headers, rows) {
  downloadText(filename, csvText(headers, rows), "text/csv;charset=utf-8");
}
export function downloadJson(filename, value) {
  downloadText(
    filename,
    JSON.stringify(value, null, 2),
    "application/json;charset=utf-8",
  );
}
export async function readLocalFile(file, { maxBytes = 5242880 } = {}) {
  if (!file) throw new Error("Choisissez un fichier.");
  if (file.size > maxBytes)
    throw new Error(
      `Le fichier dépasse la limite de ${Math.round(maxBytes / 1048576)} Mo.`,
    );
  const text = await file.text();
  if (text.includes("\u0000"))
    throw new Error(
      "Ce fichier est binaire. Importez le format texte indiqué.",
    );
  return text;
}
export const euro = (cents) =>
  Number.isFinite(cents)
    ? new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
      }).format(cents / 100)
    : "Montant invalide";
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export function reportHtml({ title, subtitle = "", sections = [] }) {
  const content = sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.title || "")}</h2>${(section.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join("")}${section.headers?.length ? `<table><thead><tr>${section.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${(section.rows || []).map((row) => `<tr>${row.map((v) => `<td>${escapeHtml(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}</section>`,
    )
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{max-width:1050px;margin:40px auto;padding:0 24px;color:#172633;font:16px/1.5 Arial,sans-serif}h1{font-size:30px}h2{font-size:21px;margin-top:32px}p{white-space:pre-wrap}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:10px;border-bottom:1px solid #bfcbd3;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#eef2f4}footer{margin-top:40px;border-top:1px solid #ccc;padding-top:12px;color:#445; font-size:13px}@media print{body{margin:0;max-width:none}tr{break-inside:avoid}thead{display:table-header-group}h2{break-after:avoid}}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p>${content}<footer>Document issu d’un exemple indépendant. Les paramètres et données doivent être validés avant utilisation opérationnelle.</footer></body></html>`;
}
export function downloadReport(filename, report) {
  downloadText(filename, reportHtml(report), "text/html;charset=utf-8");
}

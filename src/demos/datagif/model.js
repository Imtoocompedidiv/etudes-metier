import { escapeHtml } from "../../shared/files.js";

export const editions = {
  rives: {
    name: "Le Journal des Rives",
    accent: "#fffb8c",
    ink: "#262626",
    link: "#007a3d",
  },
  ateliers: {
    name: "La Lettre des Ateliers",
    accent: "#c9f5df",
    ink: "#193c31",
    link: "#1d6049",
  },
};

export const seed = {
  edition: "rives",
  subject: "Trois regards sur la ville",
  preheader: "Les lieux changent avec celles et ceux qui les font vivre.",
  date: "16 septembre 2026",
  intro:
    "Trois regards sur la ville, ses espaces et celles et ceux qui les font vivre. Bonne lecture !",
  unsubscribe: "https://example.com/preferences",
  blocks: [
    {
      id: "atelier",
      type: "article",
      title: "Un atelier ouvert sur la ville",
      excerpt:
        "Une journée de rencontres pour explorer les liens entre création, habitants et territoire.",
      url: "https://example.com/atelier",
      linkLabel: "Lire le reportage",
    },
    {
      id: "cour",
      type: "article",
      title: "Une cour retrouve sa place",
      excerpt:
        "Longtemps fermée, la cour rouvre ses portes et devient un lieu partagé au cœur du quartier.",
      url: "",
      linkLabel: "Découvrir le projet",
    },
    {
      id: "samedi",
      type: "agenda",
      title: "Le rendez-vous du samedi",
      excerpt:
        "Ateliers, visites et discussions pour faire vivre les idées tout au long de l’année. Rendez-vous samedi à 10 heures.",
      url: "https://example.com/samedi",
      linkLabel: "Voir le programme",
    },
  ],
};

export function validUrl(value) {
  try {
    const u = new URL(value);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
}

export function parseEdition(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      "Le fichier JSON est mal formé. Téléchargez l’exemple pour voir la structure attendue.",
    );
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Object.hasOwn(editions, value.edition)
  )
    throw new Error("Édition inconnue. Valeurs acceptées : rives, ateliers.");
  for (const key of ["subject", "preheader", "date", "intro", "unsubscribe"]) {
    if (typeof value[key] !== "string" || value[key].length > 10000)
      throw new Error(
        `Le champ ${key} doit contenir du texte de moins de 10 000 caractères.`,
      );
  }
  if (
    !Array.isArray(value.blocks) ||
    value.blocks.length < 1 ||
    value.blocks.length > 40
  )
    throw new Error("Le dossier doit contenir entre 1 et 40 blocs.");
  const ids = new Set();
  const blocks = value.blocks.map((block, index) => {
    if (!block || !["article", "agenda"].includes(block.type))
      throw new Error(`Bloc ${index + 1} : type article ou agenda attendu.`);
    const clean = { type: block.type };
    for (const key of ["id", "title", "excerpt", "url", "linkLabel"]) {
      if (typeof block[key] !== "string" || block[key].length > 10000)
        throw new Error(`Bloc ${index + 1} : champ ${key} invalide.`);
      clean[key] = block[key];
    }
    if (!clean.id.trim() || ids.has(clean.id))
      throw new Error(`Bloc ${index + 1} : identifiant vide ou dupliqué.`);
    ids.add(clean.id);
    return clean;
  });
  return {
    edition: value.edition,
    ...Object.fromEntries(
      ["subject", "preheader", "date", "intro", "unsubscribe"].map((key) => [
        key,
        value[key],
      ]),
    ),
    blocks,
  };
}

export function validateEdition(value) {
  const issues = [];
  const add = (field, message, blockId = null) =>
    issues.push({ field, message, blockId });
  if (!value.subject.trim()) add("subject", "L’objet de l’édition est vide.");
  if (!value.date.trim()) add("date", "La date de l’édition est vide.");
  if (!validUrl(value.unsubscribe))
    add(
      "unsubscribe",
      "Le lien de gestion de l’abonnement doit être une URL HTTP ou HTTPS complète.",
    );
  if (!value.blocks.length)
    add("blocks", "Ajoutez au moins un bloc éditorial.");
  value.blocks.forEach((block, index) => {
    const prefix = `Bloc ${index + 1}`;
    if (!block.title.trim())
      add("title", `${prefix} : titre manquant.`, block.id);
    if (!block.excerpt.trim())
      add("excerpt", `${prefix} : extrait manquant.`, block.id);
    if (!validUrl(block.url))
      add("url", `${prefix} : destination manquante ou invalide.`, block.id);
    if (!block.linkLabel.trim())
      add("linkLabel", `${prefix} : texte du lien manquant.`, block.id);
  });
  return issues;
}

export function moveBlock(value, id, direction) {
  const from = value.blocks.findIndex((block) => block.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= value.blocks.length) return value;
  const blocks = [...value.blocks];
  [blocks[from], blocks[to]] = [blocks[to], blocks[from]];
  return { ...value, blocks };
}

export function emailHtml(value, { preview = false } = {}) {
  const theme = editions[value.edition];
  const esc = escapeHtml;
  const linkAttributes = (url) => preview ? 'role="link" aria-disabled="true"' : `href="${esc(validUrl(url) ? url : "#")}"`;
  const rows = value.blocks
    .map((block) => {
      const destination = validUrl(block.url) ? block.url : "#";
      return `<tr><td style="padding:24px 0;border-top:1px solid ${theme.ink};">
${block.type === "agenda" ? `<p style="font-family:Arial,sans-serif;font-size:14px;line-height:20px;margin:0 0 8px;color:${theme.link};">Au programme</p>` : ""}
<h2 style="font-family:Arial,sans-serif;font-size:23px;line-height:28px;margin:0 0 10px;color:${theme.ink};">${esc(block.title)}</h2>
<p style="font-family:Arial,sans-serif;font-size:16px;line-height:24px;margin:0 0 12px;color:${theme.ink};">${esc(block.excerpt).replaceAll("\n", "<br>")}</p>
<a ${linkAttributes(destination)} style="font-family:Arial,sans-serif;font-size:16px;line-height:24px;color:${theme.link};text-decoration:underline;">${esc(block.linkLabel || "Lien à compléter")}</a>
</td></tr>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${preview ? "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'\">" : ""}
<title>${esc(value.subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;color:${theme.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ffffff;font-size:1px;line-height:1px;">${esc(value.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#ffffff;"><tr><td align="center" style="padding:24px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;border-collapse:collapse;text-align:left;">
<tr><td style="height:12px;background:${theme.accent};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:12px 0 20px;">
<h1 style="font-family:Arial,sans-serif;font-size:36px;line-height:40px;margin:0 0 12px;letter-spacing:-1px;color:${theme.ink};">${esc(theme.name)}</h1>
<p style="font-family:Arial,sans-serif;font-size:14px;line-height:20px;margin:0;color:${theme.ink};">L’édition du matin · ${esc(value.date)}</p></td></tr>
<tr><td style="padding:20px 0;border-top:1px solid ${theme.ink};"><p style="font-family:Arial,sans-serif;font-size:16px;line-height:24px;margin:0;color:${theme.ink};">${esc(value.intro).replaceAll("\n", "<br>")}</p></td></tr>
${rows}
<tr><td style="padding:20px;background:${theme.accent};">
<p style="font-family:Arial,sans-serif;font-size:14px;line-height:20px;margin:0 0 12px;color:${theme.ink};">${esc(theme.name)} · Édition fictive pour une recette de composants.</p>
<a ${linkAttributes(value.unsubscribe)} style="font-family:Arial,sans-serif;font-size:14px;line-height:20px;color:${theme.ink};text-decoration:underline;">Gérer mon abonnement</a></td></tr>
</table></td></tr></table></body></html>`;
}

export function plainText(value) {
  return [
    editions[value.edition].name,
    value.date,
    value.subject,
    value.intro,
    ...value.blocks.map(
      (block) =>
        `${block.title}\n${block.excerpt}\n${block.linkLabel} : ${block.url}`,
    ),
    `Gérer mon abonnement : ${value.unsubscribe}`,
  ].join("\n\n");
}

export function delivery(value, type) {
  if (validateEdition(value).length)
    throw new Error(
      "Complétez les champs signalés avant de télécharger la livraison.",
    );
  return type === "html" ? emailHtml(value) : plainText(value);
}

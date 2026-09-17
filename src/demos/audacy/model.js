import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { parseCsv } from "../../shared/files.js";
export const MAX_BYTES = 2 * 1024 * 1024;
export const spaces = {
  institution: "Institution",
  services: "Services",
  archive: "Archive",
  unassigned: "À affecter",
};
const enc = new TextEncoder(),
  hash = (x) => bytesToHex(sha256(enc.encode(JSON.stringify(x))));
const id = (x) =>
  typeof x === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(x);
function shape(x, names, label) {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    Object.keys(x).length !== names.length ||
    names.some((k) => !Object.hasOwn(x, k))
  )
    throw Error(`${label} : structure inattendue.`);
}
function text(x, label, max, empty = true) {
  if (typeof x !== "string" || x.length > max || (!empty && !x.trim()))
    throw Error(
      `${label} : ${empty ? "" : "texte non vide, "}${max} caractères maximum.`,
    );
  return x;
}
export function pathKey(path) {
  if (
    typeof path !== "string" ||
    path.length > 200 ||
    !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(path)
  )
    throw Error(
      "Chemin absolu attendu, lettres ASCII, chiffres, tirets et barres obliques ; sans requête ni ancre.",
    );
  return path === "/" ? "/" : path.replace(/\/$/, "");
}
function origin(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw Error("Origine HTTPS invalide.");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/"
  )
    throw Error("Origine HTTPS sans chemin, requête ou identifiants requise.");
  return u.origin;
}
export function normalize(input) {
  shape(input, ["format", "origins", "contents", "links", "review"], "Dossier");
  if (input.format !== "audacy-dossier-v1")
    throw Error("Format de dossier non reconnu.");
  shape(input.origins, ["source", "institution", "services"], "Origines");
  const origins = Object.fromEntries(
    Object.entries(input.origins).map(([k, v]) => [k, origin(v)]),
  );
  if (new Set(Object.values(origins)).size !== 3)
    throw Error("Trois origines distinctes sont requises.");
  if (
    !Array.isArray(input.contents) ||
    !input.contents.length ||
    input.contents.length > 100
  )
    throw Error("De 1 à 100 contenus requis.");
  const contents = input.contents.map((p) => {
    shape(
      p,
      ["id", "title", "sourcePath", "space", "targetPath", "note"],
      "Contenu",
    );
    if (!id(p.id) || !Object.hasOwn(spaces, p.space))
      throw Error("Identifiant ou espace de contenu invalide.");
    return {
      ...p,
      title: text(p.title, "Titre", 140, false),
      sourcePath: pathKey(p.sourcePath),
      targetPath: text(p.targetPath, "Chemin cible", 200),
      note: text(p.note, "Motif", 500),
    };
  });
  if (new Set(contents.map((p) => p.id)).size !== contents.length)
    throw Error("Identifiant de contenu dupliqué.");
  if (new Set(contents.map((p) => p.sourcePath)).size !== contents.length)
    throw Error("Chemin source dupliqué après normalisation.");
  if (!Array.isArray(input.links) || input.links.length > 300)
    throw Error("300 liens au maximum.");
  const known = new Set(contents.map((p) => p.id));
  const links = input.links.map((l) => {
    shape(l, ["id", "from", "to", "action", "replacement", "reason"], "Lien");
    if (
      !id(l.id) ||
      !known.has(l.from) ||
      !known.has(l.to) ||
      !["keep", "remove", "replace"].includes(l.action)
    )
      throw Error("Lien invalide ou contenu référencé absent.");
    if (l.replacement !== null && !known.has(l.replacement))
      throw Error("Cible de remplacement inconnue.");
    return { ...l, reason: text(l.reason, "Motif du lien", 500) };
  });
  if (new Set(links.map((l) => l.id)).size !== links.length)
    throw Error("Identifiant de lien dupliqué.");
  if (
    input.review !== null &&
    (typeof input.review !== "string" || !/^[a-f0-9]{64}$/.test(input.review))
  )
    throw Error("Empreinte de revue invalide.");
  const s = {
    format: input.format,
    origins,
    contents,
    links,
    review: input.review,
  };
  if (enc.encode(JSON.stringify(s, null, 2)).length > MAX_BYTES)
    throw Error("Dossier supérieur à 2 Mo au format exporté.");
  return s;
}
export const fingerprint = (s) =>
  hash({ origins: s.origins, contents: s.contents, links: s.links });
export function analyze(input) {
  const s = normalize(input),
    issues = [],
    pages = s.contents.map((p) => {
      let targetUrl = null;
      if (p.space === "unassigned")
        issues.push({
          pageId: p.id,
          linkId: null,
          kind: "unassigned",
          message: "Choisir l’espace de destination.",
        });
      else if (p.space === "archive") {
        if (p.note.trim().length < 3)
          issues.push({
            pageId: p.id,
            linkId: null,
            kind: "archive-reason",
            message: "Motiver l’archivage.",
          });
      } else {
        try {
          targetUrl = s.origins[p.space] + pathKey(p.targetPath);
        } catch (e) {
          issues.push({
            pageId: p.id,
            linkId: null,
            kind: "path",
            message: e.message,
          });
        }
      }
      return { ...p, sourceUrl: s.origins.source + p.sourcePath, targetUrl };
    });
  const byId = new Map(pages.map((p) => [p.id, p])),
    destinations = new Map();
  for (const p of pages)
    if (p.targetUrl) {
      if (!destinations.has(p.targetUrl)) destinations.set(p.targetUrl, []);
      destinations.get(p.targetUrl).push(p.id);
    }
  for (const [url, ids] of destinations)
    if (ids.length > 1)
      for (const pageId of ids)
        issues.push({
          pageId,
          linkId: null,
          kind: "collision",
          message: `Destination partagée par ${ids.length} contenus : ${url}`,
        });
  const relations = s.links.map((l) => {
    const from = byId.get(l.from),
      to = byId.get(l.to),
      target = l.action === "replace" ? byId.get(l.replacement) : to;
    let status = "ready",
      targetUrl = null,
      explanation = l.action === "replace" ? "Lien réorienté vers la nouvelle cible." : "Lien conservé vers la destination calculée.";
    const add = (kind, message) => {
      issues.push({ pageId: l.from, linkId: l.id, kind, message });
      status = "blocked";
      explanation = message;
    };
    if (from.space === "archive") {
      status = "source-archived";
      explanation =
        "La page source est archivée ; ce lien ne figure pas dans le site cible.";
    } else if (l.action === "remove") {
      status = "removed";
      explanation = "Lien retiré du site cible.";
      if (l.reason.trim().length < 3)
        add("reason", "Motiver le retrait du lien.");
    } else {
      if (!from.targetUrl)
        add(
          "source-destination",
          "La page source n’a pas de destination publiable.",
        );
      if (l.action === "replace" && (l.reason.trim().length < 3 || !target))
        add(
          "replacement",
          "Choisir une cible de remplacement et motiver ce choix.",
        );
      if (target) {
        if (target.space === "archive")
          add(
            "archived-target",
            "Le lien vise une archive. Retirez-le ou choisissez une autre cible.",
          );
        else if (!target.targetUrl)
          add(
            "target-destination",
            "La cible du lien n’a pas de destination publiable.",
          );
        else targetUrl = target.targetUrl;
      }
    }
    return {
      ...l,
      fromTitle: from.title,
      toTitle: to.title,
      resolvedTargetId: target?.id || null,
      resolvedTitle: target?.title || null,
      sourceUrl: from.sourceUrl,
      oldTargetUrl: to.sourceUrl,
      fromTargetUrl: from.targetUrl,
      targetUrl,
      status,
      explanation,
      crossSpace: Boolean(
        target &&
        from.space !== target.space &&
        ["institution", "services"].includes(from.space) &&
        ["institution", "services"].includes(target.space),
      ),
    };
  });
  const ready = issues.length === 0;
  return {
    pages,
    relations,
    issues,
    ready,
    reviewed: ready && s.review === fingerprint(s),
  };
}
export function editPage(input, id, patch) {
  const s = normalize(input);
  if (!s.contents.some((p) => p.id === id)) throw Error("Contenu inconnu.");
  const next = {
    ...s,
    contents: s.contents.map((p) =>
      p.id === id ? { ...p, ...patch, id: p.id } : p,
    ),
  };
  if (JSON.stringify(next) === JSON.stringify(s)) return s;
  return normalize({ ...next, review: null });
}
export function editLink(input, id, patch) {
  const s = normalize(input);
  if (!s.links.some((l) => l.id === id)) throw Error("Lien inconnu.");
  const next = {
    ...s,
    links: s.links.map((l) =>
      l.id === id ? { ...l, ...patch, id: l.id, from: l.from, to: l.to } : l,
    ),
  };
  if (JSON.stringify(next) === JSON.stringify(s)) return s;
  return normalize({ ...next, review: null });
}
export function relire(input) {
  const s = normalize(input);
  if (!analyze(s).ready)
    throw Error(
      "Terminez les affectations et les décisions de liens avant la revue.",
    );
  return { ...s, review: fingerprint(s) };
}
export function restore(text) {
  if (enc.encode(text).length > MAX_BYTES)
    throw Error("Fichier supérieur à 2 Mo.");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw Error("JSON illisible.");
  }
  const s = normalize(value);
  if (s.review !== fingerprint(s) || !analyze(s).ready) s.review = null;
  return s;
}
export const contentHeaders = [
  "id",
  "title",
  "sourcePath",
  "space",
  "targetPath",
  "note",
];
export const linkHeaders = [
  "id",
  "from",
  "to",
  "action",
  "replacement",
  "reason",
];
export function importCsvPair(contentText, linkText, current) {
  const c = parseCsv(contentText, {
      requiredHeaders: contentHeaders,
      maxRows: 100,
    }),
    l = parseCsv(linkText, { requiredHeaders: linkHeaders, maxRows: 300 });
  if (
    c.headers.length !== contentHeaders.length ||
    l.headers.length !== linkHeaders.length
  )
    throw Error("Colonnes supplémentaires non prises en charge.");
  return normalize({
    ...current,
    contents: c.rows,
    links: l.rows.map((x) => ({ ...x, replacement: x.replacement || null })),
    review: null,
  });
}
export function finalPlan(input) {
  const s = normalize(input),
    a = analyze(s);
  if (!a.reviewed) throw Error("Plan complet à relire avant export final.");
  return {
    format: "audacy-plan-v1",
    review: s.review,
    pages: a.pages.map((p) => ({
      id: p.id,
      title: p.title,
      sourceUrl: p.sourceUrl,
      targetUrl: p.targetUrl,
      action: p.space === "archive" ? "archive" : "publish",
      note: p.note,
    })),
    links: a.relations.map((l) => ({
      id: l.id,
      from: l.from,
      resolvedTargetId: l.resolvedTargetId,
      sourcePage: l.fromTargetUrl,
      oldTarget: l.oldTargetUrl,
      newTarget: l.status === "ready" ? l.targetUrl : null,
      action: l.status,
      reason: l.reason,
    })),
  };
}
export const planHeaders = [
  "id",
  "title",
  "sourceUrl",
  "space",
  "targetUrl",
  "note",
];
export const relationHeaders = [
  "id",
  "from",
  "to",
  "action",
  "replacement",
  "reason",
  "status",
  "sourceUrl",
  "oldTargetUrl",
  "fromTargetUrl",
  "targetUrl",
];
export function planRows(s) {
  return analyze(s).pages.map((p) =>
    Object.fromEntries(planHeaders.map((k) => [k, p[k] ?? ""])),
  );
}
export function relationRows(s) {
  return analyze(s).relations.map((l) =>
    Object.fromEntries(relationHeaders.map((k) => [k, l[k] ?? ""])),
  );
}
export function report(s) {
  const a = analyze(s);
  return {
    title: "Audacy · Répartition d’un référentiel",
    subtitle: a.reviewed ? "Plan complet relu" : "Dossier provisoire, non relu",
    sections: [
      {
        title: "Périmètre",
        paragraphs: [
          "Contenus associatifs fictifs. Aucune donnée médicale ni connexion CMS. Les liens entre les deux espaces sont autorisés. Les pages archivées sont retirées du site cible et leurs liens sortants sont exclus.",
          `Empreinte de cette configuration : ${fingerprint(s)}`,
        ],
      },
      {
        title: "Contrôles",
        paragraphs: a.issues.length
          ? a.issues.map((x) => `${x.linkId || x.pageId} · ${x.message}`)
          : ["Aucun contrôle ouvert."],
      },
      {
        title: "Destinations des contenus",
        headers: ["Contenu", "URL source", "Espace", "Destination", "Motif"],
        rows: a.pages.map((p) => [
          p.title,
          p.sourceUrl,
          spaces[p.space],
          p.targetUrl || "Aucune",
          p.note,
        ]),
      },
      {
        title: "Liens réécrits ou exclus",
        headers: [
          "Source",
          "Ancienne cible",
          "Cible proposée",
          "Décision",
          "Motif",
        ],
        rows: a.relations.map((l) => [
          l.fromTitle,
          l.oldTargetUrl,
          l.targetUrl || "Aucune",
          l.explanation,
          l.reason,
        ]),
      },
    ],
  };
}
export function seed() {
  const origins = {
    source: "https://association.exemple.test",
    institution: "https://collectif.exemple.test",
    services: "https://services.exemple.test",
  };
  const contents = [
    {
      id: "association",
      title: "Notre association",
      sourcePath: "/association",
      space: "institution",
      targetPath: "/association",
      note: "",
    },
    {
      id: "collectif",
      title: "Le collectif",
      sourcePath: "/collectif",
      space: "institution",
      targetPath: "/collectif",
      note: "",
    },
    {
      id: "adherer",
      title: "Adhérer",
      sourcePath: "/adherer",
      space: "services",
      targetPath: "/adherer",
      note: "",
    },
    {
      id: "ateliers",
      title: "Ateliers",
      sourcePath: "/ateliers",
      space: "services",
      targetPath: "/adherer",
      note: "",
    },
    {
      id: "reservation",
      title: "Réserver un atelier",
      sourcePath: "/reserver",
      space: "services",
      targetPath: "/ateliers/reserver",
      note: "",
    },
    {
      id: "ressources",
      title: "Ressources",
      sourcePath: "/ressources",
      space: "institution",
      targetPath: "/ressources",
      note: "",
    },
    {
      id: "rencontres",
      title: "Rencontres 2024",
      sourcePath: "/rencontres-2024",
      space: "archive",
      targetPath: "/rencontres-2024",
      note: "Événement terminé.",
    },
    {
      id: "contact",
      title: "Contact",
      sourcePath: "/contact",
      space: "unassigned",
      targetPath: "/contact",
      note: "",
    },
  ];
  const links = [
    ["association", "collectif"],
    ["association", "adherer"],
    ["association", "rencontres"],
    ["collectif", "contact"],
    ["adherer", "ateliers"],
    ["ateliers", "reservation"],
    ["ressources", "rencontres"],
    ["rencontres", "contact"],
    ["ressources", "ateliers"],
  ].map(([from, to], i) => ({
    id: `l${i + 1}`,
    from,
    to,
    action: "keep",
    replacement: null,
    reason: "",
  }));
  return normalize({
    format: "audacy-dossier-v1",
    origins,
    contents,
    links,
    review: null,
  });
}

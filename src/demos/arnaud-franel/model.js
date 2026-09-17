import { parseCsv } from "../../shared/files.js";
export const SUPPORTS = {
  paper: "Papier",
  web: "Web HTML",
  pdf: "Complément PDF",
};
export const HEADERS = ["id", "titre", "source", "avant", "apres", "motif"];
export const MAX_BYTES = 5 * 1024 * 1024;
const fail = (m) => {
  throw Error(m);
};
function shape(x, keys) {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    Object.keys(x).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(x, k))
  )
    fail("Structure du dossier inconnue.");
}
function text(v, max = 1000, min = 1) {
  if (
    typeof v !== "string" ||
    v.length > max ||
    v.trim().length < min ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
  )
    fail(`Texte attendu, de ${min} à ${max} caractères.`);
  return v;
}
function validateCorrection(c) {
  shape(c, ["id", "title", "versions", "proofs"]);
  text(c.id, 32);
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(c.id))
    fail("Référence de correction invalide.");
  text(c.title, 120);
  if (
    !Array.isArray(c.versions) ||
    !c.versions.length ||
    c.versions.length > 20
  )
    fail("Une correction conserve de 1 à 20 versions.");
  c.versions.forEach((v, i) => {
    shape(v, ["number", "before", "after", "source", "reason"]);
    if (v.number !== i + 1) fail("Versions non consécutives.");
    text(v.before, 4000);
    text(v.after, 4000);
    text(v.source, 250);
    text(v.reason, 600);
    if (v.before === v.after) fail("Le texte avant et après doit différer.");
    if (i && v.before !== c.versions[i - 1].after)
      fail("Historique de texte incohérent.");
  });
  if (!Array.isArray(c.proofs) || c.proofs.length > 60)
    fail("Historique de déclarations trop volumineux.");
  const seen = new Set();
  for (const p of c.proofs) {
    shape(p, ["version", "support", "kind", "locator", "reviewer", "note"]);
    if (
      !Number.isInteger(p.version) ||
      !c.versions[p.version - 1] ||
      typeof p.support !== "string" ||
      !Object.hasOwn(SUPPORTS, p.support) ||
      !["checked", "outside"].includes(p.kind)
    )
      fail("Déclaration sans version ou support valide.");
    text(p.locator, 250);
    text(p.reviewer, 100);
    text(p.note, 600);
    const key = p.version + ":" + p.support;
    if (seen.has(key))
      fail("Deux déclarations pour le même support et la même version.");
    seen.add(key);
  }
  return c;
}
export function validate(d) {
  shape(d, ["format", "title", "corrections"]);
  if (d.format !== "franel-corrections-v1") fail("Format inconnu.");
  text(d.title, 160);
  if (
    !Array.isArray(d.corrections) ||
    !d.corrections.length ||
    d.corrections.length > 50
  )
    fail("Le dossier contient de 1 à 50 corrections.");
  d.corrections.forEach(validateCorrection);
  if (new Set(d.corrections.map((c) => c.id)).size !== d.corrections.length)
    fail("Référence de correction répétée.");
  if (new TextEncoder().encode(JSON.stringify(d, null, 2)).length > MAX_BYTES)
    fail("Le dossier dépasse 5 Mo.");
  return structuredClone(d);
}
export function current(c) {
  return c.versions.at(-1);
}
export function state(c, support) {
  const proof = c.proofs
    .filter((p) => p.support === support)
    .sort((a, b) => a.version - b.version)
    .at(-1);
  if (!proof) return { key: "todo", label: "À vérifier", proof: null };
  if (proof.version !== current(c).number)
    return { key: "stale", label: "À reprendre", proof };
  return {
    key: proof.kind,
    label: proof.kind === "outside" ? "Non concerné" : "Reprise déclarée",
    proof,
  };
}
export function complete(c) {
  return Object.keys(SUPPORTS).every((k) =>
    ["checked", "outside"].includes(state(c, k).key),
  );
}
export function revise(d, id, { after, source, reason }) {
  const next = validate(d);
  const c = next.corrections.find((c) => c.id === id);
  if (!c) fail("Correction introuvable.");
  const v = current(c);
  if (after === v.after) fail("Modifiez le texte pour créer une version.");
  c.versions.push({
    number: v.number + 1,
    before: v.after,
    after,
    source,
    reason,
  });
  return validate(next);
}
export function declare(d, id, support, { kind, locator, reviewer, note }) {
  const next = validate(d);
  const c = next.corrections.find((c) => c.id === id);
  if (!c) fail("Correction introuvable.");
  const version = current(c).number;
  c.proofs = c.proofs.filter(
    (p) => !(p.version === version && p.support === support),
  );
  c.proofs.push({ version, support, kind, locator, reviewer, note });
  return validate(next);
}
export function parseInput(raw) {
  if (new TextEncoder().encode(raw).length > MAX_BYTES)
    fail("Le fichier dépasse 5 Mo.");
  if (raw.trimStart().startsWith("{")) return validate(JSON.parse(raw));
  const { headers, rows } = parseCsv(raw, {
    requiredHeaders: HEADERS,
    maxRows: 50,
  });
  if (headers.length !== HEADERS.length)
    fail("Colonnes inattendues dans le CSV.");
  return validate({
    format: "franel-corrections-v1",
    title: "Lot importé",
    corrections: rows.map((r) => ({
      id: r.id,
      title: r.titre,
      versions: [
        {
          number: 1,
          before: r.avant,
          after: r.apres,
          source: r.source,
          reason: r.motif,
        },
      ],
      proofs: [],
    })),
  });
}
export function manifestRows(d) {
  return d.corrections.flatMap((c) =>
    Object.keys(SUPPORTS).map((k) => {
      const s = state(c, k),
        v = current(c);
      return [
        c.id,
        c.title,
        v.number,
        SUPPORTS[k],
        s.label,
        s.proof?.version ?? "",
        s.proof?.locator ?? "",
        s.proof?.reviewer ?? "",
        s.proof?.note ?? "",
        v.source,
        v.after,
      ];
    }),
  );
}
export const MANIFEST_HEADERS = [
  "correction",
  "titre",
  "version_actuelle",
  "support",
  "etat",
  "version_declaree",
  "repere",
  "relecteur",
  "note",
  "source",
  "texte_actuel",
];
export function manifest(d) {
  if (!d.corrections.every(complete))
    fail("Chaque support doit être revu pour la version actuelle.");
  return {
    format: "franel-manifeste-v1",
    title: d.title,
    corrections: validate(d).corrections.map((c) => ({
      id: c.id,
      title: c.title,
      version: current(c),
      declarations: c.proofs.filter((p) => p.version === current(c).number),
    })),
  };
}
export function diffWords(before, after) {
  const a = before.match(/\s+|\S+\s*/g) || [],
    b = after.match(/\s+|\S+\s*/g) || [];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  const cut = (v) => ({
    prefix: v.slice(0, start).join(""),
    changed: v.slice(start, v.length - end).join(""),
    suffix: end ? v.slice(-end).join("") : "",
  });
  return { before: cut(a), after: cut(b) };
}
export function seed() {
  const rows = [
    [
      "F-01",
      "Horaires de l’atelier",
      "Manuel fictif, chapitre 1",
      "L’atelier ouvre le mardi à 9 h.",
      "L’atelier ouvre le mardi à 10 h.",
      "Nouvel horaire dans le scénario.",
    ],
    [
      "F-02",
      "Retrait des commandes",
      "Manuel fictif, chapitre 2",
      "Les commandes sont retirées à l’accueil.",
      "Les commandes sont retirées au comptoir de l’atelier.",
      "Point de retrait déplacé.",
    ],
    [
      "F-03",
      "Salle de lecture",
      "Manuel fictif, chapitre 3",
      "La salle contient douze places.",
      "La salle contient seize places.",
      "Capacité corrigée dans le scénario.",
    ],
    [
      "F-04",
      "Réservation",
      "Guide fictif, fiche 4",
      "La réservation se fait le jour même.",
      "La réservation se fait la veille.",
      "Délai fictif modifié.",
    ],
    [
      "F-05",
      "Accueil",
      "Guide fictif, fiche 5",
      "L’accueil se trouve au premier étage.",
      "L’accueil se trouve au rez-de-chaussée.",
      "Repère de localisation modifié.",
    ],
    [
      "F-06",
      "Contact",
      "Guide fictif, fiche 6",
      "Le formulaire est dans la rubrique Atelier.",
      "Le formulaire est dans la rubrique Nous joindre.",
      "Rubrique du scénario renommée.",
    ],
  ];
  return validate({
    format: "franel-corrections-v1",
    title: "Manuel d’accueil · exemple fictif",
    corrections: rows.map(([id, title, source, before, after, reason]) => ({
      id,
      title,
      versions: [{ number: 1, before, after, source, reason }],
      proofs: [],
    })),
  });
}

import { parseCsv } from "../../shared/files.js";
export const SEGMENT_HEADERS = ["id", "document", "source_fr", "cible_en"];
export const TERM_HEADERS = [
  "id",
  "source_fr",
  "ancienne_cible_en",
  "nouvelle_cible_en",
  "variantes_source",
  "variantes_cible",
];
const clone = (s) => structuredClone(s);
const string = (v, max) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const id = (v) => typeof v === "string" && /^[-a-zA-Z0-9_]{1,50}$/.test(v);
const escape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function literalMatches(text, term) {
  if (!term.trim()) return [];
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_])${escape(term)}(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  return [...text.matchAll(re)].map((m) => ({
    index: m.index,
    length: m[0].length,
    text: m[0],
  }));
}
function termValid(t) {
  if (
    !t ||
    !id(t.id) ||
    !string(t.source, 150) ||
    !string(t.old, 150) ||
    !string(t.next, 150) ||
    !Array.isArray(t.sourceAliases) ||
    !Array.isArray(t.targetAliases) ||
    t.sourceAliases.length > 12 ||
    t.targetAliases.length > 12 ||
    [...t.sourceAliases, ...t.targetAliases].some((v) => !string(v, 150))
  )
    throw Error(
      "Entrée de glossaire invalide : identifiant, termes et variantes courtes attendus.",
    );
  return {
    id: t.id,
    source: t.source.trim(),
    old: t.old.trim(),
    next: t.next.trim(),
    sourceAliases: [...new Set(t.sourceAliases.map((v) => v.trim()))],
    targetAliases: [...new Set(t.targetAliases.map((v) => v.trim()))],
  };
}
function segmentValid(r) {
  if (
    !r ||
    !id(r.id) ||
    !string(r.file, 150) ||
    !string(r.source, 4000) ||
    !string(r.original, 4000) ||
    !string(r.target, 4000)
  )
    throw Error(
      "Segment invalide : identifiant, nom de document, source française et cible anglaise attendus.",
    );
  return {
    id: r.id,
    file: r.file.trim(),
    source: r.source.trim(),
    original: r.original.trim(),
    target: r.target.trim(),
  };
}
export function occurrences(s, t) {
  return s.segments
    .filter(
      (r) =>
        [t.source, ...t.sourceAliases].some(
          (v) => literalMatches(r.source, v).length,
        ) ||
        [t.old, ...t.targetAliases, t.next].some(
          (v) =>
            literalMatches(r.original, v).length ||
            literalMatches(r.target, v).length,
        ),
    )
    .map((r) => ({
      segment: r,
      sourceFound: [t.source, ...t.sourceAliases].filter(
        (v) => literalMatches(r.source, v).length,
      ),
      targetFound: [...new Set([t.old, ...t.targetAliases, t.next])].filter(
        (v) =>
          literalMatches(r.original, v).length ||
          literalMatches(r.target, v).length,
      ),
    }));
}
const key = (term, segment) => JSON.stringify([term, segment]);
export function signature(t, r) {
  return JSON.stringify([t, r.source, r.original, r.target, r.file]);
}
export function decision(s, t, r) {
  const d = s.decisions[key(t.id, r.id)];
  return d && d.signature === signature(t, r) ? d : null;
}
function log(s, message) {
  s.log.push(message);
  s.log = s.log.slice(-300);
  return s;
}
export function changeTerm(state, tid, changes) {
  const s = clone(state),
    i = s.terms.findIndex((t) => t.id === tid);
  if (i < 0) throw Error("Terme introuvable.");
  const previous = s.terms[i];
  s.terms[i] = termValid({ ...previous, ...changes, id: tid });
  if (JSON.stringify(previous) === JSON.stringify(s.terms[i])) return state;
  for (const [k, d] of Object.entries(s.decisions))
    if (d.termId === tid) delete s.decisions[k];
  return log(
    s,
    `Préférence ${s.terms[i].source} modifiée ; décisions de ce terme à reprendre.`,
  );
}
export function suggestion(t, r) {
  const found = literalMatches(r.target, t.old);
  let text = r.target;
  for (const m of [...found].reverse())
    text = text.slice(0, m.index) + t.next + text.slice(m.index + m.length);
  return { text, count: found.length };
}
export function confirm(
  state,
  tid,
  sid,
  target,
  exception = false,
  reason = "",
) {
  const s = clone(state),
    t = s.terms.find((t) => t.id === tid),
    r = s.segments.find((r) => r.id === sid);
  if (!t || !r || !occurrences(s, t).some((v) => v.segment.id === sid))
    throw Error(
      "Cette combinaison de terme et segment ne correspond à aucune occurrence.",
    );
  if (!string(target, 4000))
    throw Error("La traduction doit contenir de 1 à 4 000 caractères.");
  if (typeof reason !== "string" || reason.length > 1000)
    throw Error("Motif trop long.");
  if (exception && reason.trim().length < 8)
    throw Error("Expliquez l’exception en au moins huit caractères.");
  if (
    !exception &&
    target.trim() === r.target &&
    !literalMatches(target, t.next).length
  )
    throw Error(
      "La préférence reste absente. Modifiez la traduction ou conservez une exception motivée.",
    );
  if (r.target !== target.trim()) {
    r.target = target.trim();
    for (const [k, d] of Object.entries(s.decisions))
      if (d.segmentId === sid) delete s.decisions[k];
  }
  s.decisions[key(tid, sid)] = {
    termId: tid,
    segmentId: sid,
    kind: exception ? "exception" : "confirmed",
    reason: reason.trim(),
    signature: signature(t, r),
    target: r.target,
  };
  return log(
    s,
    `${sid} · ${t.source} : ${exception ? "exception motivée" : "version confirmée"}.`,
  );
}
export function reopen(state, tid, sid) {
  const s = clone(state);
  delete s.decisions[key(tid, sid)];
  return log(s, `${sid} remis à relire pour ce terme.`);
}
export function reviewRows(s) {
  return s.terms.flatMap((t) =>
    occurrences(s, t).map(({ segment: r }) => {
      const d = decision(s, t, r);
      return {
        term: t.source,
        termId: t.id,
        segment: r.id,
        file: r.file,
        source: r.source,
        original: r.original,
        current: r.target,
        preference: t.next,
        status: d
          ? d.kind === "exception"
            ? "Exception motivée"
            : "Version confirmée"
          : "À relire",
        reason: d?.reason || "",
      };
    }),
  );
}
export function confirmedRows(s) {
  return reviewRows(s).filter((r) => r.status !== "À relire");
}
export function importSegments(state, raw) {
  const { rows } = parseCsv(raw, {
    requiredHeaders: SEGMENT_HEADERS,
    maxRows: 300,
  });
  if (!rows.length) throw Error("Le fichier ne contient aucun segment.");
  const segments = rows.map((r) =>
    segmentValid({
      id: r.id,
      file: r.document,
      source: r.source_fr,
      original: r.cible_en,
      target: r.cible_en,
    }),
  );
  if (new Set(segments.map((r) => r.id)).size !== segments.length)
    throw Error("Identifiants de segments répétés.");
  return log(
    { ...clone(state), segments, decisions: {} },
    `${segments.length} segments importés, toutes les décisions à reprendre.`,
  );
}
export function importTerms(state, raw) {
  const { rows } = parseCsv(raw, {
    requiredHeaders: TERM_HEADERS,
    maxRows: 40,
  });
  if (!rows.length) throw Error("Le glossaire est vide.");
  const terms = rows.map((r) =>
    termValid({
      id: r.id,
      source: r.source_fr,
      old: r.ancienne_cible_en,
      next: r.nouvelle_cible_en,
      sourceAliases: r.variantes_source.split("|").filter(Boolean),
      targetAliases: r.variantes_cible.split("|").filter(Boolean),
    }),
  );
  if (new Set(terms.map((t) => t.id)).size !== terms.length)
    throw Error("Identifiants de termes répétés.");
  return log(
    { ...clone(state), terms, decisions: {} },
    "Glossaire importé ; décisions à reprendre.",
  );
}
export function termRows(s) {
  return s.terms.map((t) => [
    t.id,
    t.source,
    t.old,
    t.next,
    t.sourceAliases.join("|"),
    t.targetAliases.join("|"),
  ]);
}
export function segmentRows(s) {
  return s.segments.map((r) => [r.id, r.file, r.source, r.target]);
}
export function restore(raw) {
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    throw Error("Dossier JSON illisible.");
  }
  if (
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.terms) ||
    !s.terms.length ||
    s.terms.length > 40 ||
    !Array.isArray(s.segments) ||
    !s.segments.length ||
    s.segments.length > 300 ||
    !s.decisions ||
    typeof s.decisions !== "object" ||
    Array.isArray(s.decisions) ||
    Object.keys(s.decisions).length > 12000 ||
    !Array.isArray(s.log) ||
    s.log.length > 300 ||
    s.log.some((l) => typeof l !== "string" || l.length > 1500)
  )
    throw Error("Structure du dossier non reconnue.");
  const next = {
    version: 1,
    terms: s.terms.map(termValid),
    segments: s.segments.map(segmentValid),
    decisions: {},
    log: s.log,
  };
  if (
    new Set(next.terms.map((t) => t.id)).size !== next.terms.length ||
    new Set(next.segments.map((r) => r.id)).size !== next.segments.length
  )
    throw Error("Identifiants répétés.");
  const termsById = new Map(next.terms.map((t) => [t.id, t]));
  const segmentsById = new Map(next.segments.map((r) => [r.id, r]));
  const associations = new Set(
    next.terms.flatMap((t) =>
      occurrences(next, t).map(({ segment }) => key(t.id, segment.id)),
    ),
  );
  for (const [k, d] of Object.entries(s.decisions)) {
    if (!d || typeof d !== "object")
      throw Error("Une décision ne correspond plus au terme ou au segment.");
    const t = termsById.get(d.termId),
      r = segmentsById.get(d.segmentId);
    if (
      !t ||
      !r ||
      k !== key(t.id, r.id) ||
      !["exception", "confirmed"].includes(d.kind) ||
      typeof d.reason !== "string" ||
      d.reason.length > 1000 ||
      (d.kind === "exception" && d.reason.trim().length < 8) ||
      d.signature !== signature(t, r) ||
      d.target !== r.target ||
      !associations.has(k)
    )
      throw Error("Une décision ne correspond plus au terme ou au segment.");
    next.decisions[k] = {
      termId: t.id,
      segmentId: r.id,
      kind: d.kind,
      reason: d.reason,
      signature: d.signature,
      target: d.target,
    };
  }
  return next;
}
export function seed() {
  return {
    version: 1,
    terms: [
      {
        id: "retrait",
        source: "point de retrait",
        old: "pickup point",
        next: "collection point",
        sourceAliases: ["points de retrait"],
        targetAliases: ["pickup points"],
      },
      {
        id: "commande",
        source: "commande",
        old: "order",
        next: "order",
        sourceAliases: ["commandes"],
        targetAliases: ["orders"],
      },
      {
        id: "adherent",
        source: "adhérent",
        old: "member",
        next: "member",
        sourceAliases: ["adhérents"],
        targetAliases: ["members"],
      },
      {
        id: "accueil",
        source: "accueil",
        old: "reception",
        next: "welcome desk",
        sourceAliases: [],
        targetAliases: [],
      },
    ],
    segments: [
      [
        "s12",
        "ACCUEIL_v2",
        "Votre commande est disponible au point de retrait.",
        "Your order is available at the pickup point.",
      ],
      [
        "s08",
        "LIVRAISON",
        "Nos points de retrait sont ouverts du lundi au samedi.",
        "Our pickup points are open from Monday to Saturday.",
      ],
      [
        "s04",
        "FAQ",
        "Où se trouve le point de retrait le plus proche ?",
        "Where is the nearest pickup point?",
      ],
      [
        "s27",
        "ECRAN_COMMANDE",
        "Sélectionnez un point de retrait sur la carte.",
        "Select a pickup point on the map.",
      ],
      [
        "s15",
        "COMPTE_v1",
        "En tant qu’adhérent, vous cumulez des avantages.",
        "As a member, you earn benefits.",
      ],
      [
        "s03",
        "BIENVENUE",
        "Bienvenue sur notre service d’accueil en ligne.",
        "Welcome to our online reception service.",
      ],
    ].map(([id, file, source, target]) => ({
      id,
      file,
      source,
      target,
      original: target,
    })),
    decisions: {},
    log: [
      "Exemple chargé : six segments fictifs et quatre préférences FR vers EN.",
    ],
  };
}

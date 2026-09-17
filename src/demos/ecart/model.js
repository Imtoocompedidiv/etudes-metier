import { parseCsv } from "../../shared/files.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

const hash = (value) => bytesToHex(sha256(utf8ToBytes(JSON.stringify(value))));
const clone = (value) => structuredClone(value);
export const LINE_HEADERS = [
  "id",
  "commande",
  "modele",
  "quantite",
  "metres_unitaires",
  "reference",
  "teinte",
  "finition",
];
export const LOT_HEADERS = ["id", "reference", "teinte", "metres", "recu"];
const object = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${label} : objet attendu.`);
  return value;
};
const text = (value, label, max = 100, empty = false) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw Error(
      `${label} : texte ${empty ? "de 0" : "de 1"} à ${max} caractères attendu.`,
    );
  return value.trim();
};
const id = (value, label = "Identifiant") => {
  const s = text(value, label, 30);
  if (
    !/^[a-zA-Z0-9_-]+$/.test(s) ||
    ["__proto__", "constructor", "prototype"].includes(s)
  )
    throw Error(`${label} : lettres, chiffres, tiret ou underscore attendus.`);
  return s;
};
const integer = (value, label, min, max) => {
  if (
    !["number", "string"].includes(typeof value) ||
    (typeof value === "string" && !/^\d+$/.test(value.trim())) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw Error(`${label} : entier entre ${min} et ${max} attendu.`);
  return Number(value);
};
const bool = (value, label) => {
  if (typeof value !== "boolean")
    throw Error(`${label} : vrai ou faux attendu.`);
  return value;
};
const digest = (value) => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value))
    throw Error("Empreinte de revue invalide.");
  return value;
};
const list = (value, label, max) => {
  if (!Array.isArray(value) || value.length > max)
    throw Error(`${label} : tableau de ${max} éléments au plus attendu.`);
  return value;
};
const unique = (rows, key, label) => {
  if (new Set(rows.map(key)).size !== rows.length)
    throw Error(`${label} : doublon interdit.`);
  return rows;
};
export function metersToCm(value) {
  if (!["number", "string"].includes(typeof value))
    throw Error("Métrage : nombre décimal attendu.");
  const raw = String(value).trim().replace(",", ".");
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(raw))
    throw Error("Métrage : jusqu’à deux décimales, sans valeur négative.");
  const [whole, decimal = ""] = raw.split(".");
  return integer(
    Number(whole) * 100 + Number(decimal.padEnd(2, "0")),
    "Métrage en centimètres",
    0,
    1000000,
  );
}
export const m = (cm) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(
    cm / 100,
  ) + " m";
export function lineValue(raw) {
  const v = object(raw, "Ligne");
  return {
    id: id(v.id),
    order: text(v.order, "Commande", 40),
    model: text(v.model, "Modèle"),
    quantity: integer(v.quantity, "Quantité", 1, 1000),
    unitCm: integer(v.unitCm, "Consommation en centimètres", 1, 100000),
    ref: text(v.ref, "Référence"),
    dye: text(v.dye, "Teinte", 60),
    finish: text(v.finish, "Finition", 100, true),
  };
}
export function lotValue(raw) {
  const v = object(raw, "Lot");
  return {
    id: id(v.id),
    ref: text(v.ref, "Référence"),
    dye: text(v.dye, "Teinte", 60),
    totalCm: integer(v.totalCm, "Longueur en centimètres", 0, 1000000),
    received: bool(v.received, "Réception"),
  };
}
function validateCore(value) {
  const v = object(value, "Dossier");
  const lines = unique(
    list(v.lines, "Lignes", 100).map(lineValue),
    (x) => x.id,
    "Lignes",
  );
  const lots = unique(
    list(v.lots, "Lots", 100).map(lotValue),
    (x) => x.id,
    "Lots",
  );
  if (!lines.length || !lots.length)
    throw Error("Conservez au moins une ligne et un lot.");
  const allocations = unique(
    list(v.allocations, "Affectations", 1000).map((raw) => {
      const a = object(raw, "Affectation");
      return {
        lineId: id(a.lineId),
        lotId: id(a.lotId),
        cm: integer(a.cm, "Longueur affectée", 1, 1000000),
      };
    }),
    (x) => `${x.lineId}/${x.lotId}`,
    "Affectations",
  );
  for (const a of allocations)
    if (
      !lines.some((x) => x.id === a.lineId) ||
      !lots.some((x) => x.id === a.lotId)
    )
      throw Error("Une affectation référence une ligne ou un lot absent.");
  for (const lot of lots)
    if (
      allocations
        .filter((x) => x.lotId === lot.id)
        .reduce((a, b) => a + b.cm, 0) > lot.totalCm
    )
      throw Error(
        `Le lot ${lot.id} ne contient pas assez de mètres. Retirez une affectation ou augmentez le métrage déclaré.`,
      );
  for (const line of lines)
    if (
      allocations
        .filter((x) => x.lineId === line.id)
        .reduce((a, b) => a + b.cm, 0) >
      line.quantity * line.unitCm
    )
      throw Error(
        `La ligne ${line.id} reçoit plus que son besoin de travail. Ajustez les affectations avant de réduire le besoin.`,
      );
  return { version: 1, lines, lots, allocations };
}
export function lineBasis(state, lineId) {
  const line = state.lines.find((x) => x.id === lineId);
  if (!line) throw Error("Ligne inconnue.");
  const assigned = state.allocations
    .filter((x) => x.lineId === lineId)
    .sort((a, b) => a.lotId.localeCompare(b.lotId))
    .map((a) => ({
      allocation: a,
      lot: state.lots.find((x) => x.id === a.lotId),
    }));
  return hash({ line, assigned });
}
export function decisionBasis(state, lineId, lotId) {
  return hash({ basis: lineBasis(state, lineId), lotId });
}
export function restore(raw) {
  const v = object(typeof raw === "string" ? JSON.parse(raw) : raw, "Dossier");
  if (v.version !== 1) throw Error("Version de dossier inconnue.");
  const core = validateCore(v);
  const decisions = unique(
    list(v.decisions, "Décisions", 1000).map((raw) => {
      const d = object(raw, "Décision");
      if (!["accepted", "rejected"].includes(d.choice))
        throw Error("Décision matière inconnue.");
      const result = {
        lineId: id(d.lineId),
        lotId: id(d.lotId),
        basis: digest(d.basis),
        choice: d.choice,
        note: text(d.note, "Motif de décision", 500),
      };
      if (result.note.length < 10)
        throw Error("Le motif doit comporter au moins dix caractères.");
      if (
        !core.allocations.some(
          (a) => a.lineId === result.lineId && a.lotId === result.lotId,
        )
      )
        throw Error("Décision sans affectation correspondante.");
      if (result.basis !== decisionBasis(core, result.lineId, result.lotId))
        throw Error("Décision fondée sur une ancienne affectation.");
      return result;
    }),
    (x) => `${x.lineId}/${x.lotId}`,
    "Décisions",
  );
  const reviews = unique(
    list(v.reviews, "Revues", 100).map((raw) => {
      const r = object(raw, "Revue");
      const result = {
        lineId: id(r.lineId),
        basis: digest(r.basis),
        by: text(r.by, "Relecteur", 60),
        consumption: bool(r.consumption, "Consommation"),
        pattern: bool(r.pattern, "Laize et raccord"),
        material: bool(r.material, "Matière"),
      };
      if (!result.consumption || !result.pattern || !result.material)
        throw Error(
          "Une revue enregistrée doit contenir les trois déclarations.",
        );
      if (result.basis !== reviewBasis({ ...core, decisions }, result.lineId))
        throw Error("Revue fondée sur une ancienne matière.");
      return result;
    }),
    (x) => x.lineId,
    "Revues",
  );
  const result = { ...core, decisions, reviews };
  for (const review of reviews)
    if (analyzeLine(result, review.lineId).blockers.length)
      throw Error("Revue présente sur une ligne encore incomplète.");
  return result;
}
function reconcile(raw) {
  const core = validateCore(raw);
  const decisions = (raw.decisions || []).filter(
    (d) =>
      core.allocations.some(
        (a) => a.lineId === d.lineId && a.lotId === d.lotId,
      ) && d.basis === decisionBasis(core, d.lineId, d.lotId),
  );
  const s = { ...core, decisions, reviews: [] };
  s.reviews = (raw.reviews || []).filter(
    (r) =>
      core.lines.some((l) => l.id === r.lineId) &&
      r.basis === reviewBasis(s, r.lineId) &&
      !analyzeLine(s, r.lineId).blockers.length,
  );
  return s;
}
export function reviewBasis(state, lineId) {
  return hash({
    basis: lineBasis(state, lineId),
    decisions: state.decisions
      .filter((x) => x.lineId === lineId)
      .sort((a, b) => a.lotId.localeCompare(b.lotId))
      .map((x) => ({
        lineId: x.lineId,
        lotId: x.lotId,
        choice: x.choice,
        note: x.note,
        basis: x.basis,
      })),
  });
}
export function analyzeLine(state, lineId) {
  const line = state.lines.find((x) => x.id === lineId);
  if (!line) throw Error("Ligne inconnue.");
  const allocations = state.allocations
    .filter((x) => x.lineId === lineId)
    .map((a) => {
      const lot = state.lots.find((x) => x.id === a.lotId);
      const differences = [];
      if (lot.ref !== line.ref)
        differences.push(`Référence ${lot.ref} au lieu de ${line.ref}`);
      if (lot.dye !== line.dye)
        differences.push(`Teinte ${lot.dye} au lieu de ${line.dye}`);
      const decision = state.decisions.find(
        (x) =>
          x.lineId === lineId &&
          x.lotId === lot.id &&
          x.basis === decisionBasis(state, lineId, lot.id),
      );
      return { ...a, lot, differences, decision };
    });
  const need = line.quantity * line.unitCm,
    assigned = allocations.reduce((a, b) => a + b.cm, 0),
    blockers = [];
  if (assigned < need)
    blockers.push(`${m(need - assigned)} restent à affecter.`);
  for (const a of allocations) {
    if (!a.lot.received)
      blockers.push(`Réception du lot ${a.lotId} non déclarée.`);
    if (a.differences.length && a.decision?.choice !== "accepted")
      blockers.push(
        `Lot ${a.lotId} : ${a.decision?.choice === "rejected" ? "matière refusée" : "écart matière à décider"}.`,
      );
  }
  const reviewed =
    !blockers.length &&
    state.reviews.some(
      (x) => x.lineId === lineId && x.basis === reviewBasis(state, lineId),
    );
  return {
    line,
    allocations,
    need,
    assigned,
    missing: need - assigned,
    blockers,
    reviewed,
  };
}
export const analyze = (state) =>
  state.lines.map((l) => analyzeLine(state, l.id));
export function updateLine(state, lineId, changes) {
  if (!state.lines.some((x) => x.id === lineId)) throw Error("Ligne inconnue.");
  return reconcile({
    ...state,
    lines: state.lines.map((x) =>
      x.id === lineId ? lineValue({ ...x, ...changes, id: lineId }) : x,
    ),
  });
}
export function updateLot(state, lotId, changes) {
  if (!state.lots.some((x) => x.id === lotId)) throw Error("Lot inconnu.");
  return reconcile({
    ...state,
    lots: state.lots.map((x) =>
      x.id === lotId ? lotValue({ ...x, ...changes, id: lotId }) : x,
    ),
  });
}
export function allocate(state, lineId, lotId, cm) {
  const amount = integer(cm, "Longueur affectée", 0, 1000000);
  const allocations = state.allocations.filter(
    (x) => x.lineId !== lineId || x.lotId !== lotId,
  );
  if (amount) allocations.push({ lineId, lotId, cm: amount });
  return reconcile({ ...state, allocations });
}
export function decide(state, lineId, lotId, choice, note) {
  if (!["accepted", "rejected"].includes(choice))
    throw Error("Choisissez d’accepter ou refuser cette matière.");
  const row = analyzeLine(state, lineId).allocations.find(
    (a) => a.lotId === lotId,
  );
  if (!row?.differences.length)
    throw Error(
      "Cette affectation ne présente pas d’écart référence ou teinte.",
    );
  const reason = text(note, "Motif", 500);
  if (reason.length < 10)
    throw Error("Précisez le motif sur au moins dix caractères.");
  const decisions = state.decisions.filter(
    (d) => d.lineId !== lineId || d.lotId !== lotId,
  );
  decisions.push({
    lineId,
    lotId,
    choice,
    note: reason,
    basis: decisionBasis(state, lineId, lotId),
  });
  return reconcile({ ...state, decisions });
}
export function review(state, lineId, input) {
  const row = analyzeLine(state, lineId);
  if (row.blockers.length)
    throw Error(
      "Terminez les affectations, réceptions et décisions matière avant la revue.",
    );
  for (const key of ["consumption", "pattern", "material"])
    if (input[key] !== true)
      throw Error(
        "Les trois contrôles doivent être déclarés par le relecteur.",
      );
  const by = text(input.by, "Relecteur", 60);
  const reviews = state.reviews.filter((r) => r.lineId !== lineId);
  reviews.push({
    lineId,
    basis: reviewBasis(state, lineId),
    by,
    consumption: true,
    pattern: true,
    material: true,
  });
  return { ...clone(state), reviews };
}
export function importCsv(state, kind, raw) {
  if (!["lines", "lots"].includes(kind))
    throw Error("Type de fichier inconnu.");
  const rows = parseCsv(raw, {
    requiredHeaders: kind === "lines" ? LINE_HEADERS : LOT_HEADERS,
    maxRows: 100,
  }).rows;
  if (!rows.length) throw Error("Le fichier ne contient aucune donnée.");
  const items = unique(
    rows.map((v) =>
      kind === "lines"
        ? lineValue({
            id: v.id,
            order: v.commande,
            model: v.modele,
            quantity: v.quantite,
            unitCm: metersToCm(v.metres_unitaires),
            ref: v.reference,
            dye: v.teinte,
            finish: v.finition,
          })
        : lotValue({
            id: v.id,
            ref: v.reference,
            dye: v.teinte,
            totalCm: metersToCm(v.metres),
            received: v.recu === "oui" ? true : v.recu === "non" ? false : null,
          }),
    ),
    (x) => x.id,
    "Fichier",
  );
  const merged = [
    ...state[kind].filter((x) => !items.some((y) => x.id === y.id)),
    ...items,
  ];
  return reconcile({ ...state, [kind]: merged });
}
export function seed() {
  return {
    version: 1,
    lines: [
      {
        id: "L01",
        order: "J-026",
        model: "Fauteuil 1926",
        quantity: 1,
        unitCm: 600,
        ref: "Lin Sable",
        dye: "S-01",
        finish: "Bois naturel, mat",
      },
      {
        id: "L02",
        order: "J-026",
        model: "Fauteuil 1926",
        quantity: 1,
        unitCm: 600,
        ref: "Lin Sable",
        dye: "S-01",
        finish: "Bois naturel, mat",
      },
    ],
    lots: [
      { id: "A", ref: "Lin Sable", dye: "S-01", totalCm: 1000, received: true },
      { id: "B", ref: "Lin Sable", dye: "S-02", totalCm: 400, received: true },
    ],
    allocations: [
      { lineId: "L01", lotId: "A", cm: 600 },
      { lineId: "L02", lotId: "A", cm: 400 },
    ],
    decisions: [],
    reviews: [],
  };
}
export const exampleLines = () =>
  seed().lines.map((x) => [
    x.id,
    x.order,
    x.model,
    x.quantity,
    x.unitCm / 100,
    x.ref,
    x.dye,
    x.finish,
  ]);
export const exampleLots = () =>
  seed().lots.map((x) => [
    x.id,
    x.ref,
    x.dye,
    x.totalCm / 100,
    x.received ? "oui" : "non",
  ]);
export function allocationRows(state) {
  return analyze(state).flatMap((row) =>
    row.allocations.map((a) => ({
      commande: row.line.order,
      ligne: row.line.id,
      modele: row.line.model,
      lot: a.lotId,
      reference: a.lot.ref,
      teinte: a.lot.dye,
      metres: a.cm / 100,
      reception: a.lot.received ? "Déclarée" : "À confirmer",
      ecart: a.differences.join(" ; "),
      decision:
        a.decision?.choice === "accepted"
          ? "Acceptée"
          : a.decision?.choice === "rejected"
            ? "Refusée"
            : "",
      motif: a.decision?.note || "",
      revue: row.reviewed ? "Déclarée" : "À faire",
    })),
  );
}
export function questions(state) {
  return analyze(state)
    .flatMap((row) => [
      `${row.line.order} / ${row.line.id} · ${row.line.model}`,
      ...row.blockers.map((v) => "- " + v),
      ...(!row.reviewed
        ? [
            "- Confirmer consommation, laize/raccord et compatibilité avec l’atelier.",
          ]
        : [
            "- Revue déclarée par " +
              state.reviews.find((x) => x.lineId === row.line.id).by,
          ]),
      "",
    ])
    .join("\n");
}
export function report(state) {
  const rows = analyze(state),
    ready = rows.every((r) => r.reviewed);
  return {
    title: ready
      ? "Dossier matière · préparation revue"
      : "Dossier matière · brouillon",
    subtitle:
      "ECART · exemple fictif. Affectations locales déclaratives, sans réservation de stock ni ordre de fabrication.",
    sections: [
      {
        title: "Lignes de mobilier",
        headers: [
          "Commande / ligne",
          "Modèle et finition",
          "Besoin de travail",
          "Affecté",
          "État",
        ],
        rows: rows.map((r) => [
          r.line.order + " / " + r.line.id,
          r.line.model + " · " + r.line.finish,
          m(r.need),
          m(r.assigned),
          r.reviewed
            ? "Revue déclarée"
            : r.blockers.join(" ") || "Revue atelier à faire",
        ]),
      },
      {
        title: "Matières affectées",
        headers: [
          "Ligne",
          "Lot / matière / teinte",
          "Métrage",
          "Réception",
          "Décision sur les écarts",
        ],
        rows: allocationRows(state).map((a) => [
          a.ligne,
          a.lot + " / " + a.reference + " / " + a.teinte,
          m(a.metres * 100),
          a.reception,
          a.ecart
            ? `${a.ecart} · ${a.decision || "À décider"} ${a.motif}`
            : "Références identiques, compatibilité à confirmer",
        ]),
      },
      {
        title: "Contrôles déclarés",
        paragraphs: state.reviews.length
          ? state.reviews.map(
              (r) =>
                `${r.lineId} : consommation, laize/raccord et matière déclarés vérifiés par ${r.by}.`,
            )
          : ["Aucune revue complète enregistrée."],
      },
      {
        title: "Périmètre",
        paragraphs: [
          "Le métrage unitaire est une hypothèse de travail à valider pour la matière choisie. Les longueurs sont additionnées ; aucun plan de coupe ni diagnostic textile n’est calculé. Une nouvelle modification invalide les revues concernées.",
        ],
      },
    ],
  };
}

import { parseCsv } from "../../shared/files.js";

export const requestHeaders = ["agence", "article", "quantite"];
export const stockHeaders = ["article", "physique", "reserve"];
export const offerHeaders = [
  "fournisseur",
  "reference",
  "article",
  "unites_par_boite",
  "prix_boite_ht",
  "tarif_du",
  "valable_jusquau",
];
export const initial = {
  version: 1,
  date: "2026-09-21",
  agencies: ["Agence Rivage", "Agence Vallon", "Agence Coteau"],
  items: [
    { id: "CH", name: "Chiffons atelier" },
    { id: "RU", name: "Ruban de masquage" },
    { id: "ET", name: "Étiquettes logistiques" },
    { id: "MA", name: "Marqueurs permanents" },
  ],
  requests: [
    { agence: "Agence Rivage", article: "CH", quantite: 42 },
    { agence: "Agence Vallon", article: "CH", quantite: 30 },
    { agence: "Agence Rivage", article: "RU", quantite: 24 },
    { agence: "Agence Coteau", article: "RU", quantite: 24 },
    { agence: "Agence Vallon", article: "ET", quantite: 120 },
    { agence: "Agence Coteau", article: "MA", quantite: 24 },
  ],
  stocks: [
    { article: "CH", physique: 20, reserve: 8 },
    { article: "RU", physique: 12, reserve: 4 },
    { article: "ET", physique: 30, reserve: 0 },
    { article: "MA", physique: 10, reserve: 4 },
  ],
  suppliers: [
    { id: "Atlas", freight: 1500, freeFrom: 25000 },
    { id: "Boréal", freight: 1800, freeFrom: 20000 },
  ],
  offers: [
    {
      fournisseur: "Atlas",
      reference: "CH25",
      article: "CH",
      unites_par_boite: 25,
      prix: 2950,
      tarif_du: "2026-09-01",
      valable_jusquau: "2026-10-31",
    },
    {
      fournisseur: "Atlas",
      reference: "RM12",
      article: "RU",
      unites_par_boite: 12,
      prix: 3600,
      tarif_du: "2026-09-01",
      valable_jusquau: "2026-10-31",
    },
    {
      fournisseur: "Atlas",
      reference: "EL20",
      article: "ET",
      unites_par_boite: 20,
      prix: 900,
      tarif_du: "2026-09-01",
      valable_jusquau: "2026-10-31",
    },
    {
      fournisseur: "Atlas",
      reference: "MP10",
      article: "MA",
      unites_par_boite: 10,
      prix: 1250,
      tarif_du: "2026-09-01",
      valable_jusquau: "2026-10-31",
    },
    {
      fournisseur: "Boréal",
      reference: "CT20",
      article: "CH",
      unites_par_boite: 20,
      prix: 2200,
      tarif_du: "2026-09-10",
      valable_jusquau: "2026-09-30",
    },
    {
      fournisseur: "Boréal",
      reference: "RM10",
      article: "RU",
      unites_par_boite: 10,
      prix: 2850,
      tarif_du: "2026-09-10",
      valable_jusquau: "2026-09-30",
    },
    {
      fournisseur: "Boréal",
      reference: "ET50",
      article: "ET",
      unites_par_boite: 50,
      prix: 2100,
      tarif_du: "2026-09-10",
      valable_jusquau: "2026-09-30",
    },
    {
      fournisseur: "Boréal",
      reference: "FEU12",
      article: "",
      unites_par_boite: 12,
      prix: 1440,
      tarif_du: "2026-09-10",
      valable_jusquau: "2026-09-30",
    },
  ],
  journal: [],
};
const required = (value, label) => {
  const text = String(value ?? "").trim();
  if (!text || text.length > 100)
    throw Error(`${label} : valeur requise, 100 caractères maximum.`);
  return text;
};
export function quantity(value, label = "Quantité", min = 0) {
  if (String(value).trim() === "" || !/^\d+$/.test(String(value)))
    throw Error(`${label} : entier requis.`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > 1000000)
    throw Error(`${label} : entier de ${min} à 1 000 000.`);
  return n;
}
export function money(value, label = "Prix") {
  const s = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw Error(`${label} : montant requis, deux décimales maximum.`);
  return quantity(Math.round(Number(s) * 100), label);
}
export function validDate(value, label = "Date") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    throw Error(`${label} : date AAAA-MM-JJ requise.`);
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw Error(`${label} : date impossible.`);
  return value;
}
function unique(rows, key, label) {
  const seen = new Set();
  for (const r of rows) {
    const k = key(r);
    if (seen.has(k)) throw Error(`${label} en double : ${k}.`);
    seen.add(k);
  }
  return rows;
}
export function normalizeProject(input) {
  if (!input || input.version !== 1)
    throw Error("Dossier AFEO version 1 attendu.");
  const items = unique(
    (input.items ?? []).map((r) => ({
      id: required(r.id, "Article"),
      name: required(r.name, "Désignation"),
    })),
    (r) => r.id,
    "Article",
  );
  const agencies = unique(
    (input.agencies ?? []).map((r) => required(r, "Agence")),
    (r) => r,
    "Agence",
  );
  if (
    !items.length ||
    items.length > 100 ||
    !agencies.length ||
    agencies.length > 30
  )
    throw Error("Prévoir 1 à 100 articles et 1 à 30 agences.");
  const suppliers = unique(
    (input.suppliers ?? []).map((s) => ({
      id: required(s.id, "Fournisseur"),
      freight: quantity(s.freight, "Port en centimes"),
      freeFrom:
        s.freeFrom === null ? null : quantity(s.freeFrom, "Franco en centimes"),
    })),
    (s) => s.id,
    "Fournisseur",
  );
  if (!suppliers.length || suppliers.length > 10)
    throw Error("Prévoir 1 à 10 fournisseurs.");
  const hasItem = (id) => items.some((i) => i.id === id),
    hasSupplier = (id) => suppliers.some((i) => i.id === id);
  const requests = unique(
    (input.requests ?? []).map((r) => {
      if (!agencies.includes(r.agence) || !hasItem(r.article))
        throw Error("Besoin : agence ou article inconnu.");
      return {
        agence: r.agence,
        article: r.article,
        quantite: quantity(r.quantite),
      };
    }),
    (r) => `${r.agence}/${r.article}`,
    "Besoin",
  );
  const stocks = unique(
    (input.stocks ?? []).map((r) => {
      if (!hasItem(r.article)) throw Error("Stock : article inconnu.");
      const row = {
        article: r.article,
        physique: quantity(r.physique, "Stock physique"),
        reserve: quantity(r.reserve, "Stock réservé"),
      };
      if (row.reserve > row.physique)
        throw Error(
          `${row.article} : le stock réservé dépasse le stock physique.`,
        );
      return row;
    }),
    (r) => r.article,
    "Stock",
  );
  if (items.some((i) => !stocks.some((s) => s.article === i.id)))
    throw Error(
      "Une ligne de stock est requise pour chaque article, y compris un stock nul.",
    );
  const offers = unique(
    (input.offers ?? []).map((r) => {
      if (!hasSupplier(r.fournisseur))
        throw Error("Catalogue : fournisseur inconnu.");
      if (r.article && !hasItem(r.article))
        throw Error("Catalogue : article inconnu.");
      const row = {
        fournisseur: r.fournisseur,
        reference: required(r.reference, "Référence"),
        article: r.article || "",
        unites_par_boite: quantity(r.unites_par_boite, "Unités par boîte", 1),
        prix: r.prix === null ? null : quantity(r.prix, "Prix en centimes"),
        tarif_du: validDate(r.tarif_du, "Début de tarif"),
        valable_jusquau: validDate(r.valable_jusquau, "Fin de tarif"),
      };
      if (row.tarif_du > row.valable_jusquau)
        throw Error("Fin de tarif antérieure à son début.");
      return row;
    }),
    (r) => `${r.fournisseur}/${r.reference}`,
    "Référence fournisseur",
  );
  unique(
    offers.filter((o) => o.article),
    (r) => `${r.fournisseur}/${r.article}`,
    "Correspondance article/fournisseur",
  );
  if (offers.length > 1000) throw Error("Catalogue limité à 1 000 références.");
  return {
    version: 1,
    date: validDate(input.date, "Date d’achat"),
    items,
    agencies,
    suppliers,
    requests,
    stocks,
    offers,
    journal: (input.journal ?? [])
      .slice(-40)
      .map((v) => String(v).slice(0, 180)),
  };
}
export function needs(project) {
  return project.items.map((item) => {
    const stock = project.stocks.find((s) => s.article === item.id),
      demand = project.requests
        .filter((r) => r.article === item.id)
        .reduce((sum, r) => sum + r.quantite, 0),
      free = stock.physique - stock.reserve;
    return {
      ...item,
      demand,
      free,
      used: Math.min(free, demand),
      buy: Math.max(0, demand - free),
    };
  });
}
export function compare(project) {
  const requiredNeeds = needs(project);
  return project.suppliers.map((s) => {
    const lines = requiredNeeds.map((n) => {
      const offer = project.offers.find(
        (o) => o.fournisseur === s.id && o.article === n.id,
      );
      let issue = "";
      if (n.buy > 0) {
        if (!offer) issue = "Référence sans correspondance";
        else if (offer.prix === null) issue = "Prix inconnu";
        else if (
          project.date < offer.tarif_du ||
          project.date > offer.valable_jusquau
        )
          issue = "Tarif hors période";
      }
      const boxes =
        n.buy === 0
          ? 0
          : !issue
            ? Math.ceil(n.buy / offer.unites_par_boite)
            : null;
      return {
        ...n,
        offer,
        issue,
        boxes,
        ordered: boxes === null ? null : boxes * (offer?.unites_par_boite ?? 0),
        surplus:
          boxes === null
            ? null
            : boxes * (offer?.unites_par_boite ?? 0) - n.buy,
        cost: boxes === null ? null : boxes * (offer?.prix ?? 0),
      };
    });
    const partial = lines.reduce((sum, l) => sum + (l.cost ?? 0), 0),
      complete = lines.every((l) => !l.issue),
      ordered = lines.some((l) => (l.boxes ?? 0) > 0),
      freight =
        ordered && (s.freeFrom === null || partial < s.freeFrom)
          ? s.freight
          : 0;
    return {
      ...s,
      lines,
      partial,
      freight,
      total: complete ? partial + freight : null,
      covered: lines.filter((l) => !l.issue && l.demand > 0).length,
      required: lines.filter((l) => l.demand > 0).length,
      complete,
    };
  });
}
export function allocations(project, supplierId) {
  const basket = compare(project).find((s) => s.id === supplierId);
  if (!basket) throw Error("Fournisseur inconnu.");
  return basket.lines.flatMap((line) => {
    let remaining = line.used;
    return project.agencies
      .map((agency) => {
        const demand =
            project.requests.find(
              (r) => r.agence === agency && r.article === line.id,
            )?.quantite ?? 0,
          stock = Math.min(remaining, demand);
        remaining -= stock;
        return {
          agence: agency,
          article: line.id,
          demande: demand,
          stock_alloue: stock,
          achat_alloue: line.issue ? 0 : demand - stock,
          non_servi: line.issue ? demand - stock : 0,
        };
      })
      .filter((r) => r.demande > 0);
  });
}
export function updateProject(project, patch, label) {
  return normalizeProject({
    ...project,
    ...patch,
    journal: [
      ...project.journal,
      `${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · ${label}`,
    ].slice(-40),
  });
}
export function setRequest(project, agency, article, value) {
  const quantite = quantity(value),
    requests = project.requests.filter(
      (r) => !(r.agence === agency && r.article === article),
    );
  requests.push({ agence: agency, article, quantite });
  return updateProject(
    project,
    { requests },
    `Besoin ${agency} · ${article} = ${quantite} unités`,
  );
}
export function editOffer(project, supplier, reference, values) {
  const offers = project.offers.map((o) =>
    o.fournisseur === supplier && o.reference === reference
      ? { ...o, ...values }
      : o,
  );
  return updateProject(
    project,
    { offers },
    `Catalogue ${supplier} · ${reference} modifié`,
  );
}
export function parseImport(text, kind, project) {
  const headers =
    kind === "requests"
      ? requestHeaders
      : kind === "stocks"
        ? stockHeaders
        : offerHeaders;
  const { rows } = parseCsv(text, { requiredHeaders: headers, maxRows: 1000 });
  if (!rows.length)
    throw Error("Le fichier est vide. Le dossier est conservé.");
  const clean =
    kind === "requests"
      ? rows.map((r) => ({
          agence: r.agence,
          article: r.article,
          quantite: r.quantite,
        }))
      : kind === "stocks"
        ? rows.map((r) => ({
            article: r.article,
            physique: r.physique,
            reserve: r.reserve,
          }))
        : rows.map((r) => ({
            ...r,
            prix: r.prix_boite_ht.trim() === "" ? null : money(r.prix_boite_ht),
          }));
  return updateProject(
    project,
    { [kind]: clean },
    `Import de ${rows.length} lignes de ${kind === "requests" ? "besoins" : kind === "stocks" ? "stock" : "catalogue"}`,
  );
}
export function offerRows(project) {
  return project.offers.map((o) => ({
    ...o,
    prix_boite_ht: o.prix === null ? "" : (o.prix / 100).toFixed(2),
  }));
}

import { parseCsv, csvText } from "../../shared/files.js";
export const headers = [
  "id",
  "client_id",
  "client",
  "reference",
  "devise",
  "montant",
];
export const fields = headers.slice(1);
export const kinds = ["payments", "invoices"];
// Full provenance contains two row snapshots per allocation and a journal.
// The maximum canonical schema, including JSON escaping, fits below 48 MiB.
export const dossierMaxBytes = 48 * 1024 * 1024;
const object = (x) => x && typeof x === "object" && !Array.isArray(x);
const text = (x, label, max = 120) => {
  if (typeof x !== "string" || x.length > max)
    throw Error(`${label} : texte de ${max} caractères maximum attendu.`);
  return x;
};
const identity = (x, label) => {
  const s = text(x, label, 80).trim();
  if (!s || ["__proto__", "constructor", "prototype"].includes(s))
    throw Error(`${label} : identifiant non vide et non réservé attendu.`);
  return s;
};
const motif = (x) => {
  const s = text(x, "Motif", 500).trim();
  if (!s) throw Error("Un motif est obligatoire.");
  return s;
};
const stamp = (x) => {
  if (
    typeof x !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) ||
    !Number.isFinite(Date.parse(x)) ||
    new Date(x).toISOString() !== x
  )
    throw Error("Date du journal invalide.");
  return x;
};
const kindOf = (x) => {
  if (!kinds.includes(x)) throw Error("Registre inconnu.");
  return x;
};
const equal = (a, b) => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (object(a) && object(b)) {
    const ak = Object.keys(a),
      bk = Object.keys(b);
    return (
      ak.length === bk.length &&
      ak.every((k) => Object.hasOwn(b, k) && equal(a[k], b[k]))
    );
  }
  return false;
};
export function cents(raw) {
  if (typeof raw !== "string" || !/^\d{1,7}(?:[.,]\d{1,2})?$/.test(raw.trim()))
    return null;
  const [w, f = ""] = raw.trim().replace(",", ".").split(".");
  return Number(w) * 100 + Number(f.padEnd(2, "0"));
}
export const plainMoney = (n) => (n === null ? "" : (n / 100).toFixed(2));
export const money = (n, currency = "") =>
  n === null
    ? "Montant à vérifier"
    : new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n / 100) + (currency ? " " + currency : "");
function row(raw) {
  if (!object(raw)) throw Error("Ligne de registre invalide.");
  return {
    id: identity(raw.id, "Identifiant"),
    client_id: text(raw.client_id, "Identifiant client", 80).trim(),
    client: text(raw.client, "Libellé client", 120),
    reference: text(raw.reference, "Référence", 80),
    devise: text(raw.devise, "Devise", 12),
    montant: text(raw.montant, "Montant", 40),
  };
}
function rows(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 500)
    throw Error("Un registre doit contenir entre 1 et 500 lignes.");
  const seen = new Set();
  return raw.map((r) => {
    const n = row(r);
    if (seen.has(n.id))
      throw Error(`Identifiant répété dans le registre : ${n.id}.`);
    seen.add(n.id);
    return n;
  });
}
export function parseRegister(raw) {
  const p = parseCsv(raw, { requiredHeaders: headers, maxRows: 500 });
  if (p.headers.length !== headers.length)
    throw Error("Utilisez les six colonnes documentées.");
  return rows(p.rows);
}
function source(raw) {
  if (!object(raw)) throw Error("Source invalide.");
  return { name: text(raw.name, "Nom de fichier", 180), rows: rows(raw.rows) };
}
export function problems(r) {
  const e = [];
  if (
    !r.client_id ||
    ["__proto__", "constructor", "prototype"].includes(r.client_id)
  )
    e.push("Identifiant client absent ou réservé.");
  if (!/^[A-Z]{3}$/.test(r.devise))
    e.push("Devise de trois lettres majuscules attendue.");
  if (cents(r.montant) === null)
    e.push(
      "Montant absent ou invalide : zéro doit être écrit explicitement, deux décimales maximum.",
    );
  return e;
}
export function normalizeDossier(raw) {
  if (!object(raw) || raw.version !== 1)
    throw Error("Dossier de rapprochement Baouw v1 attendu.");
  const d = {
    version: 1,
    payments: source(raw.payments),
    invoices: source(raw.invoices),
    corrections: [],
    allocations: [],
    journal: [],
  };
  if (
    !Array.isArray(raw.corrections) ||
    raw.corrections.length > 1000 ||
    !Array.isArray(raw.allocations) ||
    raw.allocations.length > 1000 ||
    !Array.isArray(raw.journal) ||
    raw.journal.length > 2000
  )
    throw Error("Dossier trop long ou incomplet.");
  const cs = new Set();
  d.corrections = raw.corrections.map((c) => {
    if (!object(c)) throw Error("Correction invalide.");
    const kind = kindOf(c.kind),
      id = identity(c.id, "Source corrigée"),
      key = JSON.stringify([kind, id]);
    if (cs.has(key) || !d[kind].rows.some((r) => r.id === id))
      throw Error("Correction répétée ou source absente.");
    cs.add(key);
    const r = row({ ...c.values, id });
    return {
      kind,
      id,
      values: Object.fromEntries(fields.map((f) => [f, r[f]])),
      reason: motif(c.reason),
    };
  });
  const seen = new Set();
  d.allocations = raw.allocations.map((a) => {
    if (!object(a) || !object(a.proof)) throw Error("Affectation invalide.");
    const id = identity(a.id, "Identifiant affectation"),
      payment = identity(a.payment, "Règlement"),
      invoice = identity(a.invoice, "Facture"),
      amount = text(a.amount, "Montant affecté", 40);
    if (seen.has(id) || cents(amount) === null || cents(amount) <= 0)
      throw Error(
        "Affectation répétée ou montant strictement positif invalide.",
      );
    seen.add(id);
    const proof = {
      payment: row(a.proof.payment),
      invoice: row(a.proof.invoice),
    };
    if (proof.payment.id !== payment || proof.invoice.id !== invoice)
      throw Error("Preuve liée à une autre source.");
    return { id, payment, invoice, amount, reason: motif(a.reason), proof };
  });
  d.journal = raw.journal.map((j) => {
    if (!object(j)) throw Error("Journal invalide.");
    return { at: stamp(j.at), action: text(j.action, "Action", 1200) };
  });
  return d;
}
export const validDossier = (d) => {
  try {
    return equal(d, normalizeDossier(d));
  } catch {
    return false;
  }
};
export const effective = (d, kind) =>
  d[kind].rows.map((r) => {
    const c = d.corrections.find((c) => c.kind === kind && c.id === r.id);
    return c ? { ...r, ...c.values } : r;
  });
export function prepare(d) {
  const registers = Object.fromEntries(
    kinds.map((k) => [
      k,
      effective(d, k).map((r) => ({
        ...r,
        cents: cents(r.montant),
        issues: problems(r),
      })),
    ]),
  );
  const payments = new Map(registers.payments.map((r) => [r.id, r])),
    invoices = new Map(registers.invoices.map((r) => [r.id, r]));
  const rawPayments = new Map(effective(d, "payments").map((r) => [r.id, r])),
    rawInvoices = new Map(effective(d, "invoices").map((r) => [r.id, r]));
  const allocations = d.allocations.map((a) => {
    const p = payments.get(a.payment),
      i = invoices.get(a.invoice),
      issues = [];
    if (!p || !i) issues.push("Source absente du registre courant.");
    else {
      if (
        !equal(rawPayments.get(a.payment), a.proof.payment) ||
        !equal(rawInvoices.get(a.invoice), a.proof.invoice)
      )
        issues.push(
          "Affectation périmée : une source a changé. Retirez-la puis confirmez une nouvelle répartition.",
        );
      if (p.issues.length || i.issues.length)
        issues.push("Une source possède une donnée à vérifier.");
      if (p.client_id !== i.client_id) issues.push("Clients différents.");
      if (p.devise !== i.devise) issues.push("Devises différentes.");
    }
    return {
      ...a,
      cents: cents(a.amount),
      issues,
      paymentRow: p,
      invoiceRow: i,
    };
  });
  const ps = new Map(),
    is = new Map();
  for (const a of allocations.filter((a) => !a.issues.length)) {
    ps.set(a.payment, (ps.get(a.payment) || 0) + a.cents);
    is.set(a.invoice, (is.get(a.invoice) || 0) + a.cents);
  }
  for (const a of allocations.filter((a) => !a.issues.length)) {
    if (ps.get(a.payment) > a.paymentRow.cents)
      a.issues.push(
        "La somme des affectations dépasse le règlement ; toutes ses affectations sont écartées.",
      );
    if (is.get(a.invoice) > a.invoiceRow.cents)
      a.issues.push(
        "La somme des affectations dépasse la facture ; toutes ses affectations sont écartées.",
      );
  }
  const accepted = allocations.filter((a) => !a.issues.length);
  for (const k of kinds)
    for (const r of registers[k]) {
      r.assigned = accepted
        .filter((a) => (k === "payments" ? a.payment : a.invoice) === r.id)
        .reduce((s, a) => s + a.cents, 0);
      r.remaining = r.issues.length ? null : r.cents - r.assigned;
    }
  const exceptions = [
    ...kinds.flatMap((k) =>
      registers[k]
        .filter((r) => r.issues.length)
        .map((r) => ({
          type: k === "payments" ? "Règlement" : "Facture",
          id: r.id,
          detail: r.issues.join(" "),
        })),
    ),
    ...allocations
      .filter((a) => a.issues.length)
      .map((a) => ({
        type: "Affectation",
        id: a.id,
        detail: a.issues.join(" "),
      })),
  ];
  const remaining = kinds.flatMap((k) =>
    registers[k]
      .filter((r) => r.remaining !== 0)
      .map((r) => ({ ...r, type: k === "payments" ? "Règlement" : "Facture" })),
  );
  return { ...registers, allocations, accepted, exceptions, remaining };
}
export function pairIssues(p, i) {
  if (!p || !i) return ["Sélectionnez un règlement et une facture."];
  const e = [];
  if (p.issues.length || i.issues.length)
    e.push("Corrigez les données sources avant d’affecter.");
  if (p.client_id !== i.client_id)
    e.push("Cette facture appartient à un autre client.");
  if (p.devise !== i.devise) e.push("Cette facture utilise une autre devise.");
  if (p.remaining === 0) e.push("Aucun montant disponible sur ce règlement.");
  if (i.remaining === 0)
    e.push("Aucun montant restant à affecter sur cette facture.");
  return e;
}
function logged(d, action, at) {
  return {
    ...d,
    journal: [...d.journal, { at: stamp(at), action }].slice(-2000),
  };
}
export function allocate(d, payment, invoice, amount, reason, at) {
  const note = motif(reason),
    p = prepare(d),
    pr = p.payments.find((r) => r.id === payment),
    ir = p.invoices.find((r) => r.id === invoice),
    e = pairIssues(pr, ir),
    value = cents(amount);
  if (e.length) throw Error(e.join(" "));
  if (value === null || value <= 0)
    throw Error(
      "Saisissez un montant strictement positif avec deux décimales maximum.",
    );
  if (value > pr.remaining || value > ir.remaining)
    throw Error(
      "Le montant dépasse le disponible du règlement ou le reste de la facture.",
    );
  if (d.allocations.length >= 1000)
    throw Error("Le dossier contient déjà 1000 affectations.");
  const ids = new Set(d.allocations.map((a) => a.id));
  let n = 1;
  while (ids.has("AFF-" + String(n).padStart(3, "0"))) n++;
  const a = {
    id: "AFF-" + String(n).padStart(3, "0"),
    payment,
    invoice,
    amount: plainMoney(value),
    reason: note,
    proof: {
      payment: effective(d, "payments").find((r) => r.id === payment),
      invoice: effective(d, "invoices").find((r) => r.id === invoice),
    },
  };
  return logged(
    { ...d, allocations: [...d.allocations, a] },
    `${a.id} · ${payment} vers ${invoice} · ${money(value, pr.devise)} · ${note}`,
    at,
  );
}
export function removeAllocation(d, id, at) {
  if (!d.allocations.some((a) => a.id === id))
    throw Error("Affectation introuvable.");
  return logged(
    { ...d, allocations: d.allocations.filter((a) => a.id !== id) },
    `Retrait de ${id}.`,
    at,
  );
}
export function correct(d, kind, id, values, reason, at) {
  kindOf(kind);
  if (!d[kind].rows.some((r) => r.id === id))
    throw Error("Source introuvable.");
  const reasonText = motif(reason),
    r = row({ ...values, id }),
    c = {
      kind,
      id,
      values: Object.fromEntries(fields.map((f) => [f, r[f]])),
      reason: reasonText,
    };
  return logged(
    {
      ...d,
      corrections: [
        ...d.corrections.filter((x) => !(x.kind === kind && x.id === id)),
        c,
      ],
    },
    `Correction ${kind === "payments" ? "règlement" : "facture"} ${id} · ${reasonText}`,
    at,
  );
}
export function removeCorrection(d, kind, id, at) {
  kindOf(kind);
  if (!d.corrections.some((c) => c.kind === kind && c.id === id))
    throw Error("Correction introuvable.");
  return logged(
    {
      ...d,
      corrections: d.corrections.filter(
        (c) => !(c.kind === kind && c.id === id),
      ),
    },
    `Valeurs importées restaurées pour ${id}.`,
    at,
  );
}
export function replaceRegister(d, kind, raw, name, at) {
  kindOf(kind);
  const next = source({ name, rows: raw }),
    same = equal(next.rows, d[kind].rows);
  return logged(
    {
      ...d,
      [kind]: next,
      corrections: same
        ? d.corrections
        : d.corrections.filter((c) => c.kind !== kind),
    },
    `Import ${kind === "payments" ? "règlements" : "factures"} ${name} · ${same ? "source identique, corrections conservées" : "source différente, corrections de ce registre retirées ; affectations réévaluées"}.`,
    at,
  );
}
export function suggestions(d, payment) {
  const p = prepare(d),
    r = p.payments.find((x) => x.id === payment);
  if (!r || !r.reference.trim() || r.issues.length) return [];
  return p.invoices.filter(
    (i) =>
      i.reference.trim() === r.reference.trim() &&
      i.client_id === r.client_id &&
      i.devise === r.devise &&
      !i.issues.length &&
      i.remaining > 0,
  );
}
export const allocationHeaders = [
  "affectation",
  "reglement",
  "facture",
  "client_id",
  "devise",
  "montant",
  "motif",
];
export const allocationRows = (d) =>
  prepare(d).accepted.map((a) => [
    a.id,
    a.payment,
    a.invoice,
    a.paymentRow.client_id,
    a.paymentRow.devise,
    plainMoney(a.cents),
    a.reason,
  ]);
export const exceptionHeaders = ["type", "identifiant", "explication"];
export const exceptionRows = (d) =>
  prepare(d).exceptions.map((e) => [e.type, e.id, e.detail]);
export const remainderHeaders = [
  "type",
  "identifiant",
  "client_id",
  "client",
  "devise",
  "montant_initial",
  "affecte",
  "reste",
  "verification",
];
export const remainderRows = (d) =>
  prepare(d).remaining.map((r) => [
    r.type,
    r.id,
    r.client_id,
    r.client,
    r.devise,
    plainMoney(r.cents),
    plainMoney(r.assigned),
    plainMoney(r.remaining),
    r.issues.join(" "),
  ]);
export function manifest(d) {
  return {
    format: "baouw-preparation-v1",
    note: "Données fictives et préparation locale à relire. Aucune écriture comptable ni connexion Odoo.",
    sources: { payments: d.payments, invoices: d.invoices },
    corrections: d.corrections,
    allocations: d.allocations,
    prepared: allocationRows(d),
    exceptions: exceptionRows(d),
    remaining: remainderRows(d),
    journal: d.journal,
  };
}
export function initialDossier() {
  return {
    version: 1,
    payments: {
      name: "reglements-fictifs.csv",
      rows: [
        {
          id: "PAY-01",
          client_id: "CLI-01",
          client: "Atelier Fiction 1",
          reference: "FAC-101",
          devise: "EUR",
          montant: "1200.00",
        },
        {
          id: "PAY-02",
          client_id: "CLI-02",
          client: "Comptoir Fiction 2",
          reference: "FAC-201",
          devise: "EUR",
          montant: "300.00",
        },
        {
          id: "PAY-03",
          client_id: "CLI-01",
          client: "Atelier Fiction 1",
          reference: "FAC-102",
          devise: "USD",
          montant: "450.00",
        },
      ],
    },
    invoices: {
      name: "factures-fictives.csv",
      rows: [
        {
          id: "FAC-101",
          client_id: "CLI-01",
          client: "Atelier Fiction 1",
          reference: "FAC-101",
          devise: "EUR",
          montant: "700.00",
        },
        {
          id: "FAC-102",
          client_id: "CLI-01",
          client: "Atelier Fiction 1",
          reference: "FAC-102",
          devise: "EUR",
          montant: "650.00",
        },
        {
          id: "FAC-201",
          client_id: "CLI-02",
          client: "Comptoir Fiction 2",
          reference: "FAC-201",
          devise: "EUR",
          montant: "300.00",
        },
      ],
    },
    corrections: [],
    allocations: [],
    journal: [],
  };
}
export const exampleCsv = (kind) =>
  csvText(headers, initialDossier()[kind].rows);

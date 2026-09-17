import React, { useState } from "react";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/mulish/400.css";
import "@fontsource/mulish/600.css";
import "@fontsource/mulish/700.css";
import { useHistory } from "../../shared/state.js";
import {
  FileImport,
  ErrorMessage,
  DemoFooter,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadCsv,
  downloadText,
  downloadJson,
  downloadReport,
} from "../../shared/files.js";
import {
  initialDossier,
  headers,
  fields,
  dossierMaxBytes,
  parseRegister,
  normalizeDossier,
  validDossier,
  effective,
  prepare,
  pairIssues,
  allocate,
  removeAllocation,
  correct,
  removeCorrection,
  replaceRegister,
  suggestions,
  money,
  allocationHeaders,
  allocationRows,
  exceptionHeaders,
  exceptionRows,
  remainderHeaders,
  remainderRows,
  manifest,
  exampleCsv,
} from "./model.js";
import "./styles.css";
const now = () => new Date().toISOString();
const names = { payments: "règlements", invoices: "factures" };
const labels = {
  client_id: "Identifiant client",
  client: "Libellé client",
  reference: "Référence",
  devise: "Devise",
  montant: "Montant source",
};
function Ledger({
  kind,
  d,
  p,
  selected,
  onSelect,
  onUpload,
  search,
  onSearch,
  client,
  onClient,
}) {
  const list = p[kind],
    clients = Array.from(
      new Map(p.invoices.map((r) => [r.client_id, r.client])).entries(),
    );
  const shown = list.filter((r) =>
    kind === "payments"
      ? `${r.id} ${r.client_id} ${r.client} ${r.reference}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase())
      : !client || r.client_id === client,
  );
  return (
    <section className={"ba-ledger ba-" + kind}>
      <div className="ba-section-title">
        <h2>
          {kind === "payments" ? "Règlements reçus" : "Factures à rapprocher"}
        </h2>
        <span>
          {shown.length} ligne{shown.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="ba-ledger-controls">
        <FileImport
          label={"Importer les " + names[kind] + " CSV"}
          accept=".csv,text/csv"
          onFile={(f) => onUpload(f, kind)}
        />
        {kind === "payments" ? (
          <label>
            Rechercher un règlement
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Identifiant, client ou référence"
            />
          </label>
        ) : (
          <label>
            Filtrer par client
            <select value={client} onChange={(e) => onClient(e.target.value)}>
              <option value="">Tous les clients</option>
              {clients.map(([id, name]) => (
                <option key={id} value={id}>
                  {name || "Libellé absent"} · {id || "Identifiant absent"}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div
        className="ba-scroll"
        role="region"
        aria-label={
          kind === "payments"
            ? "Règlements reçus, tableau défilant"
            : "Factures, tableau défilant"
        }
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Identifiant</th>
              <th scope="col">Client</th>
              <th scope="col">Montant</th>
              <th scope="col">
                {kind === "payments" ? "Disponible" : "Reste"}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={selected === r.id ? "selected" : ""}>
                <th scope="row">
                  <button
                    aria-pressed={selected === r.id}
                    className="ba-row-choice"
                    onClick={() => onSelect(r.id)}
                  >
                    {r.id}
                  </button>
                </th>
                <td>
                  {r.client || "Libellé absent"}
                  <small>{r.client_id || "Identifiant absent"}</small>
                </td>
                <td>{money(r.cents, r.devise)}</td>
                <td>
                  {r.issues.length ? (
                    <span className="ba-warning">À vérifier</span>
                  ) : (
                    money(r.remaining, r.devise)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && (
          <p className="ba-empty">Aucune ligne pour ce filtre.</p>
        )}
      </div>
      <p className="ba-source-name">{d[kind].name}</p>
    </section>
  );
}
function PairSummary({ title, r, payment }) {
  return (
    <div className="ba-pair-summary">
      <h3>{title}</h3>
      {r ? (
        <dl>
          <dt>Identifiant</dt>
          <dd>{r.id}</dd>
          <dt>Client</dt>
          <dd>
            {r.client || "Libellé absent"}
            <small>{r.client_id || "Identifiant absent"}</small>
          </dd>
          <dt>Référence</dt>
          <dd>{r.reference || "Absente"}</dd>
          <dt>{payment ? "Disponible" : "Reste à affecter"}</dt>
          <dd>{money(r.remaining, r.devise)}</dd>
        </dl>
      ) : (
        <p>Sélectionnez une ligne.</p>
      )}
    </div>
  );
}
function AllocationInspector({
  d,
  p,
  payment,
  invoice,
  commit,
  onEdit,
  onInvoice,
}) {
  const [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const issues = pairIssues(payment, invoice),
    matched = suggestions(d, payment?.id);
  const submit = (e) => {
    e.preventDefault();
    setError("");
    try {
      const next = allocate(d, payment?.id, invoice?.id, amount, reason, now());
      if (commit(next, "Affectation enregistrée dans la préparation.")) {
        setAmount("");
        setReason("");
      }
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <aside className="ba-inspector">
      <div className="ba-section-title">
        <h2>Affecter un montant</h2>
      </div>
      <div className="ba-inspector-content">
        <PairSummary title="Règlement sélectionné" r={payment} payment />
        <PairSummary title="Facture sélectionnée" r={invoice} />
        {matched.length > 0 && (
          <div className="ba-suggestion">
            <p>Même référence, client et devise. À confirmer.</p>
            {matched.map((r) => (
              <button key={r.id} onClick={() => onInvoice(r.id)}>
                Sélectionner {r.id}
              </button>
            ))}
          </div>
        )}
        {issues.length > 0 && (
          <ul className="ba-issues">
            {issues.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        <form onSubmit={submit}>
          <label>
            Montant à affecter
            <input
              value={amount}
              inputMode="decimal"
              maxLength={40}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Montant confirmé"
            />
          </label>
          <label>
            Motif
            <textarea
              value={reason}
              maxLength={500}
              rows={3}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ce qui justifie cette affectation."
            />
          </label>
          <ErrorMessage>{error}</ErrorMessage>
          <p className="ba-note">
            Le montant doit rester dans les deux soldes. Identifiants client et
            devises doivent correspondre.
          </p>
          <button
            className="ba-primary"
            type="submit"
            disabled={issues.length > 0}
          >
            Enregistrer l’affectation
          </button>
        </form>
        <div className="ba-source-actions">
          <button
            disabled={!payment}
            onClick={() => onEdit({ kind: "payments", id: payment.id })}
          >
            Corriger le règlement
          </button>
          <button
            disabled={!invoice}
            onClick={() => onEdit({ kind: "invoices", id: invoice.id })}
          >
            Corriger la facture
          </button>
        </div>
      </div>
    </aside>
  );
}
function SourceEditor({ d, target, commit, onClose }) {
  const r = effective(d, target.kind).find((r) => r.id === target.id),
    original = d[target.kind].rows.find((r) => r.id === target.id),
    existing = d.corrections.find(
      (c) => c.kind === target.kind && c.id === target.id,
    );
  const [values, setValues] = useState(() =>
      Object.fromEntries(fields.map((f) => [f, r[f]])),
    ),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const submit = (e) => {
    e.preventDefault();
    setError("");
    try {
      if (
        commit(
          correct(d, target.kind, target.id, values, reason, now()),
          "Source corrigée. Les affectations sont réévaluées.",
        )
      )
        onClose();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <aside className="ba-inspector">
      <div className="ba-section-title">
        <h2>Corriger {target.id}</h2>
      </div>
      <form className="ba-inspector-content" onSubmit={submit}>
        <p>
          Les données importées restent conservées. Une source différente rend
          ses affectations périmées.
        </p>
        {fields.map((f) => (
          <label key={f}>
            {labels[f]}
            <input
              value={values[f]}
              maxLength={
                f === "client"
                  ? 120
                  : f === "montant"
                    ? 40
                    : f === "devise"
                      ? 12
                      : 80
              }
              onChange={(e) => setValues({ ...values, [f]: e.target.value })}
            />
            <small>Importé · {original[f] || "absent"}</small>
          </label>
        ))}
        <label>
          Motif de correction
          <textarea
            value={reason}
            maxLength={500}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <ErrorMessage>{error}</ErrorMessage>
        <button className="ba-primary">Enregistrer la correction</button>
        {existing && (
          <>
            <p className="ba-note">Correction actuelle · {existing.reason}</p>
            <button
              type="button"
              onClick={() => {
                try {
                  if (
                    commit(
                      removeCorrection(d, target.kind, target.id, now()),
                      "Donnée importée restaurée.",
                    )
                  )
                    onClose();
                } catch (err) {
                  setError(err.message);
                }
              }}
            >
              Retirer cette correction
            </button>
          </>
        )}
        <button type="button" onClick={onClose}>
          Revenir à l’affectation
        </button>
      </form>
    </aside>
  );
}
function Review({ d, p, commit }) {
  const [remainderFilter, setRemainderFilter] = useState("all");
  const remaining = p.remaining.filter(
    (r) => remainderFilter === "all" || r.type === remainderFilter,
  );
  return (
    <div className="ba-review">
      <section>
        <div className="ba-section-title">
          <h2>Affectations préparées</h2>
          <span>
            {p.accepted.length} admissible{p.accepted.length > 1 ? "s" : ""}
          </span>
        </div>
        <div
          className="ba-scroll"
          role="region"
          aria-label="Affectations préparées, tableau défilant"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Affectation</th>
                <th>Règlement / facture</th>
                <th>Montant</th>
                <th>Motif et état</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {p.allocations.map((a) => (
                <tr key={a.id}>
                  <th>{a.id}</th>
                  <td>
                    {a.payment}
                    <small>{a.invoice}</small>
                  </td>
                  <td>{money(a.cents, a.proof.payment.devise)}</td>
                  <td>
                    {a.reason}
                    {a.issues.length ? (
                      <p className="ba-warning">{a.issues.join(" ")}</p>
                    ) : (
                      <small>Dans l’export de préparation</small>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() =>
                        commit(
                          removeAllocation(d, a.id, now()),
                          "Affectation retirée.",
                        )
                      }
                      aria-label={"Retirer " + a.id}
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!p.allocations.length && (
            <p className="ba-empty">Aucune affectation enregistrée.</p>
          )}
        </div>
      </section>
      <section>
        <div className="ba-section-title">
          <h2>Reliquats</h2>
          <span>
            {remaining.length} ligne{remaining.length > 1 ? "s" : ""}
          </span>
        </div>
        <label className="ba-remainder-filter">
          Type de reliquat
          <select
            value={remainderFilter}
            onChange={(e) => setRemainderFilter(e.target.value)}
          >
            <option value="all">Règlements et factures</option>
            <option>Règlement</option>
            <option>Facture</option>
          </select>
        </label>
        <div
          className="ba-scroll"
          role="region"
          aria-label="Reliquats, tableau défilant"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Identifiant</th>
                <th>Type / client</th>
                <th>Montant restant</th>
              </tr>
            </thead>
            <tbody>
              {remaining.map((r) => (
                <tr key={JSON.stringify([r.type, r.id])}>
                  <th>{r.id}</th>
                  <td>
                    {r.type}
                    <small>
                      {r.client_id} · {r.client}
                    </small>
                  </td>
                  <td>
                    {money(r.remaining, r.devise)}
                    {r.issues.length > 0 && (
                      <small className="ba-warning">{r.issues.join(" ")}</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!remaining.length && (
            <p className="ba-empty">Aucun reliquat pour ce filtre.</p>
          )}
        </div>
      </section>
    </div>
  );
}
export default function App() {
  useDocumentTitle("Baouw · Rapprocher les règlements clients");
  const history = useHistory(initialDossier, {
      key: "baouw:v1",
      validate: validDossier,
    }),
    d = history.value,
    p = prepare(d);
  const [selectedPayment, setSelectedPayment] = useState("PAY-01"),
    [selectedInvoice, setSelectedInvoice] = useState("FAC-101"),
    [search, setSearch] = useState(""),
    [client, setClient] = useState(""),
    [editor, setEditor] = useState(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(null);
  const payment =
      p.payments.find((r) => r.id === selectedPayment) || p.payments[0],
    invoice = p.invoices.find((r) => r.id === selectedInvoice) || p.invoices[0];
  const commit = (value, message) => {
    setError("");
    try {
      history.set(normalizeDossier(value));
      setNotice(message);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };
  const upload = async (file, kind) => {
    setError("");
    setNotice("");
    setPreview(null);
    try {
      const raw = await readLocalFile(
        file,
        kind === "dossier" ? { maxBytes: dossierMaxBytes } : undefined,
      );
      setPreview({
        kind,
        name: file.name,
        value:
          kind === "dossier"
            ? normalizeDossier(JSON.parse(raw))
            : parseRegister(raw),
      });
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? "JSON invalide. Le dossier courant est conservé."
          : err.message,
      );
    }
  };
  const confirm = () => {
    try {
      const next =
        preview.kind === "dossier"
          ? preview.value
          : replaceRegister(
              d,
              preview.kind,
              preview.value,
              preview.name,
              now(),
            );
      if (
        commit(
          next,
          preview.kind === "dossier"
            ? "Dossier restauré."
            : "Registre importé ; affectations réévaluées.",
        )
      ) {
        setPreview(null);
        setEditor(null);
        setClient("");
        setSearch("");
      }
    } catch (err) {
      setError(err.message);
    }
  };
  const exported = (fn, message) => {
    try {
      fn();
      setNotice(message);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };
  const report = () =>
    downloadReport("baouw-revue.html", {
      title: "Rapprochement de règlements fictifs",
      subtitle:
        "Préparation indépendante à relire. Aucune écriture comptable et aucune connexion Odoo.",
      sections: [
        {
          title: "Sources et méthode",
          paragraphs: [
            `Règlements : ${d.payments.name}. Factures : ${d.invoices.name}.`,
            `Affectations admissibles seulement : ${p.accepted.length}. Référence, identifiant client et devise sont comparés exactement ; les libellés homonymes ne constituent pas une identité. Les décisions périmées restent à revoir.`,
          ],
        },
        {
          title: "Affectations préparées",
          headers: allocationHeaders,
          rows: allocationRows(d),
        },
        {
          title: "Points à vérifier",
          headers: exceptionHeaders,
          rows: exceptionRows(d),
        },
        {
          title: "Reliquats",
          headers: remainderHeaders,
          rows: remainderRows(d),
        },
        {
          title: "Corrections des sources",
          headers: ["Registre", "Identifiant", "Motif"],
          rows: d.corrections.map((c) => [names[c.kind], c.id, c.reason]),
        },
        {
          title: "Journal",
          headers: ["Date UTC", "Action"],
          rows: d.journal.map((j) => [j.at, j.action]),
        },
      ],
    });
  const activeEditor =
    editor && d[editor.kind].rows.some((r) => r.id === editor.id)
      ? editor
      : null;
  return (
    <main className="ba-app">
      <header className="ba-top">
        <span>Baouw · étude indépendante</span>
        <span>Données fictives · traitement local</span>
      </header>
      <div className="ba-intro">
        <h1>Rapprocher les règlements clients</h1>
        <p>
          Sélectionnez un règlement puis répartissez son montant entre les
          factures.
        </p>
        {!history.storageAvailable && (
          <p className="ba-warning">
            Sauvegarde du navigateur indisponible. Exportez le dossier JSON pour
            le conserver.
          </p>
        )}
        <div role="status" className={notice ? "ba-notice" : ""}>
          {notice}
        </div>
        <ErrorMessage>{error}</ErrorMessage>
      </div>
      {preview && (
        <section className="ba-preview" aria-label="Aperçu avant import">
          <h2>
            {preview.kind === "dossier"
              ? "Restaurer le dossier"
              : "Remplacer le registre des " + names[preview.kind]}
          </h2>
          <p>
            {preview.name} ·{" "}
            {preview.kind === "dossier"
              ? `${preview.value.payments.rows.length} règlements, ${preview.value.invoices.rows.length} factures et ${preview.value.allocations.length} affectations`
              : preview.value.length + " lignes"}
          </p>
          <p>
            Une source identique conserve les corrections. Une source différente
            retire les corrections de ce registre ; chaque affectation conserve
            sa preuve et devient périmée si l’une de ses sources diffère. Une
            restauration JSON reprend tout le dossier. Action annulable.
          </p>
          {preview.kind !== "dossier" && (
            <div
              className="ba-scroll"
              role="region"
              aria-label="Aperçu des premières lignes"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.value.slice(0, 4).map((r) => (
                    <tr key={r.id}>
                      {headers.map((h) => (
                        <td key={h}>{r[h] || "absent"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="ba-inline">
            <button className="ba-primary" onClick={confirm}>
              Confirmer l’import
            </button>
            <button onClick={() => setPreview(null)}>
              Abandonner l’import
            </button>
          </div>
        </section>
      )}
      <div className="ba-workspace">
        <div className="ba-books">
          <Ledger
            kind="payments"
            d={d}
            p={p}
            selected={payment?.id}
            onSelect={(id) => {
              setSelectedPayment(id);
              setEditor(null);
            }}
            onUpload={upload}
            search={search}
            onSearch={setSearch}
          />
          <Ledger
            kind="invoices"
            d={d}
            p={p}
            selected={invoice?.id}
            onSelect={(id) => {
              setSelectedInvoice(id);
              setEditor(null);
            }}
            onUpload={upload}
            client={client}
            onClient={setClient}
          />
          <Review d={d} p={p} commit={commit} />
        </div>
        {activeEditor ? (
          <SourceEditor
            key={JSON.stringify([
              activeEditor,
              effective(d, activeEditor.kind).find(
                (r) => r.id === activeEditor.id,
              ),
            ])}
            d={d}
            target={activeEditor}
            commit={commit}
            onClose={() => setEditor(null)}
          />
        ) : (
          <AllocationInspector
            key={JSON.stringify([
              payment?.id,
              invoice?.id,
              payment?.montant,
              invoice?.montant,
            ])}
            d={d}
            p={p}
            payment={payment}
            invoice={invoice}
            commit={commit}
            onEdit={setEditor}
            onInvoice={setSelectedInvoice}
          />
        )}
      </div>
      {p.exceptions.length > 0 && (
        <section className="ba-exceptions">
          <h2>Points à vérifier</h2>
          <ul>
            {p.exceptions.map((e, i) => (
              <li key={i}>
                <strong>
                  {e.type} {e.id}
                </strong>{" "}
                · {e.detail}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="ba-details">
        <details>
          <summary>Journal des actions ({d.journal.length})</summary>
          {d.journal.length ? (
            <>
              <p>
                Les 30 dernières actions sont affichées ; le dossier exporte
                tout le journal conservé.
              </p>
              <ol>
                {d.journal
                  .slice(-30)
                  .reverse()
                  .map((j, i) => (
                    <li key={i}>
                      <time>{new Date(j.at).toLocaleString("fr-FR")}</time> ·{" "}
                      {j.action}
                    </li>
                  ))}
              </ol>
            </>
          ) : (
            <p>Aucune action enregistrée.</p>
          )}
        </details>
        <details>
          <summary>Formats et exemples à importer</summary>
          <p>
            Chaque CSV contient 1 à 500 lignes et les colonnes{" "}
            <code>{headers.join(", ")}</code>. Identifiant unique par registre,
            identifiant client stable, devise sur trois lettres majuscules.
            Montants positifs ou zéro explicite, sans séparateur de milliers,
            jusqu’à 9 999 999,99 avec deux décimales. Une référence n’entraîne
            jamais d’affectation automatique.
          </p>
          <p>
            Les montants sont les soldes à rapprocher au début du dossier. Aucun
            avoir, remboursement, frais bancaire ou conversion de devise dans
            cet exemple. Une modification du libellé source rend aussi
            l’affectation à revoir. Formats indépendants, sans import natif
            Odoo.
          </p>
          <div className="ba-inline">
            {["payments", "invoices"].map((k) => (
              <button
                key={k}
                onClick={() =>
                  exported(
                    () =>
                      downloadText(
                        "baouw-exemple-" + k + ".csv",
                        exampleCsv(k),
                        "text/csv;charset=utf-8",
                      ),
                    "Exemple téléchargé.",
                  )
                }
              >
                Exemple {names[k]} CSV
              </button>
            ))}
          </div>
        </details>
      </div>
      <footer className="ba-toolbar">
        <p>
          Préparation à relire avec votre référent. Aucune écriture comptable et
          aucune connexion à Odoo.
        </p>
        <div className="ba-inline">
          <button
            disabled={!history.canUndo}
            onClick={() => {
              history.undo();
              setEditor(null);
              setNotice("Action annulée.");
              setError("");
            }}
          >
            Annuler
          </button>
          <button
            disabled={!history.canRedo}
            onClick={() => {
              history.redo();
              setEditor(null);
              setNotice("Action rétablie.");
              setError("");
            }}
          >
            Rétablir
          </button>
          <button
            onClick={() =>
              exported(
                () =>
                  downloadCsv(
                    "baouw-affectations.csv",
                    allocationHeaders,
                    allocationRows(d),
                  ),
                "Affectations admissibles téléchargées.",
              )
            }
          >
            Affectations CSV
          </button>
          <button
            onClick={() =>
              exported(
                () =>
                  downloadCsv(
                    "baouw-exceptions.csv",
                    exceptionHeaders,
                    exceptionRows(d),
                  ),
                "Points à vérifier téléchargés.",
              )
            }
          >
            Exceptions CSV
          </button>
          <button
            onClick={() =>
              exported(
                () =>
                  downloadCsv(
                    "baouw-reliquats.csv",
                    remainderHeaders,
                    remainderRows(d),
                  ),
                "Reliquats téléchargés.",
              )
            }
          >
            Reliquats CSV
          </button>
          <button onClick={() => exported(report, "Rapport HTML téléchargé.")}>
            Rapport HTML
          </button>
          <button
            onClick={() =>
              exported(
                () => downloadJson("baouw-manifeste.json", manifest(d)),
                "Manifeste de préparation téléchargé.",
              )
            }
          >
            Manifeste JSON
          </button>
          <button
            onClick={() =>
              exported(
                () => downloadJson("baouw-dossier.json", d),
                "Dossier complet téléchargé.",
              )
            }
          >
            Sauvegarder JSON
          </button>
          <FileImport
            label="Restaurer JSON"
            accept=".json,application/json"
            onFile={(f) => upload(f, "dossier")}
          />
          <button
            onClick={() => {
              history.reset();
              setEditor(null);
              setPreview(null);
              setSearch("");
              setClient("");
              setError("");
              setNotice("Exemple réinitialisé. Action annulable.");
            }}
          >
            Réinitialiser l’exemple
          </button>
        </div>
        <p className="ba-note">
          Dossier conservé dans ce navigateur. Annuler et rétablir restent
          disponibles pendant la session.
        </p>
      </footer>
      <DemoFooter />
    </main>
  );
}

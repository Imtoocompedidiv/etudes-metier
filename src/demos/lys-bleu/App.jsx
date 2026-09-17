import React, { useEffect, useState } from "react";
import "@fontsource/league-spartan/400.css";
import "@fontsource/league-spartan/600.css";
import "@fontsource/sanchez/400.css";
import { useHistory } from "../../shared/state.js";
import { DemoFooter, FileImport, useDocumentTitle } from "../../shared/ui.jsx";
import {
  downloadCsv,
  downloadJson,
  downloadReport,
  downloadText,
  readLocalFile,
} from "../../shared/files.js";
import {
  seed,
  evaluate,
  setProposal,
  setPolicy,
  setDates,
  editRequest,
  review,
  restore,
  importCsv,
  invoiceRows,
  historyRows,
  outputRows,
  report,
  draftText,
  SCOPES,
  ROUNDS,
  BASES,
  BOUNDS,
  INVOICE_HEADERS,
  HISTORY_HEADERS,
  OUTPUT_HEADERS,
  MAX_BYTES,
} from "./model.js";
import "./styles.css";

const dateLabel = (v) =>
  v
    ? new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(v + "T12:00:00Z"))
    : "Non renseignée";
function integer(value, label) {
  if (!/^\d{1,6}$/.test(String(value)))
    throw Error(`${label} : entier obligatoire.`);
  return Number(value);
}
function Choice({ label, value, options, onChange, disabled }) {
  return (
    <label className="lb-choice">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {Object.entries(options).map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
function Qty({ value, label, disabled, onSave }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="lb-proposal-label">
      Proposition
      <input
        aria-label={label}
        type="text"
        inputMode="numeric"
        maxLength={6}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (String(value) !== draft && !onSave(draft))
            setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
function Invoice({ invoice, calculation, locked, onDates }) {
  const [expanded, setExpanded] = useState(false),
    grouped = Object.entries(
      invoice.history.reduce(
        (acc, h) => ({ ...acc, [h.date]: (acc[h.date] || 0) + h.quantity }),
        {},
      ),
    );
  return (
    <section className="lb-invoice">
      <h2>Facture & reprises</h2>
      <div className="lb-invoice-meta">
        <div>
          <strong>Facture {invoice.id}</strong>
          <p>{invoice.bookstore}</p>
        </div>
        <div>
          <span>Date de facture</span>
          <strong>{dateLabel(invoice.date)}</strong>
        </div>
      </div>
      <div
        className="lb-table-scroll"
        tabIndex="0"
        role="region"
        aria-label="Titres facturés et reprises"
      >
        <table>
          <thead>
            <tr>
              <th>Titre</th>
              <th>Commandés</th>
              <th>Déjà repris</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id}>
                <th scope="row">
                  {l.title}
                  <small>{l.id}</small>
                </th>
                <td>{l.ordered}</td>
                <td>{calculation.rows.find((r) => r.id === l.id).previous}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Historique des reprises</h3>
      {grouped.length ? (
        <dl className="lb-history-summary">
          {grouped.map(([d, n]) => (
            <div key={d}>
              <dt>{dateLabel(d)}</dt>
              <dd>
                {n} exemplaire{n > 1 ? "s" : ""}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>Aucune reprise enregistrée.</p>
      )}
      <p className="lb-total">
        Total déjà repris{" "}
        <strong>
          {calculation.previous} exemplaire{calculation.previous > 1 ? "s" : ""}
        </strong>
      </p>
      <button
        disabled={locked}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Refermer l’historique" : "Voir l’historique"}
      </button>
      {expanded && (
        <div className="lb-history-detail">
          {invoice.history.map((h) => (
            <p key={h.id}>
              <strong>
                {h.id} · {h.lineId}
              </strong>
              <span>
                {dateLabel(h.date)} · {h.quantity} exemplaire
                {h.quantity > 1 ? "s" : ""}
              </span>
            </p>
          ))}
          {!invoice.history.length && (
            <p>L’historique importé apparaîtra ici.</p>
          )}
          <small>
            Les propositions de cette demande ne sont jamais ajoutées aux
            reprises comptabilisées.
          </small>
        </div>
      )}
      <div className="lb-calendar">
        <h3>Repères de la demande</h3>
        <dl>
          <div>
            <dt>Demande</dt>
            <dd>{dateLabel(invoice.request.date)}</dd>
          </div>
          <div>
            <dt>Réception</dt>
            <dd>{dateLabel(invoice.request.receivedAt)}</dd>
          </div>
          <div>
            <dt>Limite illustrative</dt>
            <dd>{dateLabel(calculation.deadline)}</dd>
          </div>
        </dl>
        <button disabled={locked} onClick={onDates}>
          Modifier les dates
        </button>
      </div>
    </section>
  );
}
function RequestEditor({ line, onSave, onCancel }) {
  const [draft, setDraft] = useState({
    ...line,
    exceptionOn: !!line.exception,
    source: line.exception?.source || "",
    by: line.exception?.by || "",
    confirmed: line.exception?.confirmed || false,
  });
  const set = (k, v) => setDraft((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="lb-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          lineId: line.lineId,
          requested: integer(draft.requested, "Demandés"),
          newCount: integer(draft.newCount, "Neufs"),
          tagged: integer(draft.tagged, "Étiquetés"),
          damaged: integer(draft.damaged, "Abîmés"),
          proposed: integer(draft.proposed, "Proposés"),
          exception: draft.exceptionOn
            ? { source: draft.source, by: draft.by, confirmed: draft.confirmed }
            : null,
        });
      }}
    >
      <h2>Détails de la demande</h2>
      <p>
        États exclusifs par exemplaire. Un livre abîmé et étiqueté est compté
        une seule fois dans la catégorie choisie.
      </p>
      <div className="lb-edit-grid">
        {[
          ["requested", "Demandés"],
          ["newCount", "Neufs, non étiquetés"],
          ["tagged", "Étiquetés"],
          ["damaged", "Abîmés"],
          ["proposed", "Quantité proposée"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="text"
              inputMode="numeric"
              required
              maxLength={6}
              pattern="[0-9]{1,6}"
              value={draft[key]}
              onChange={(e) => set(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      <p className="lb-muted">
        La part non contrôlée est la différence entre le nombre demandé et les
        états renseignés. Elle n’est pas comptée comme neuve.
      </p>
      <fieldset>
        <legend>Exception au plafond</legend>
        <label className="lb-check">
          <input
            type="checkbox"
            checked={draft.exceptionOn}
            onChange={(e) => set("exceptionOn", e.target.checked)}
          />
          Documenter un titre hors plafond
        </label>
        {draft.exceptionOn && (
          <>
            <label>
              Référence de la sélection ou de la confirmation
              <textarea
                required
                minLength={10}
                maxLength={300}
                value={draft.source}
                onChange={(e) => set("source", e.target.value)}
                placeholder="Pour l’exemple, référence fictive de la liste et du titre."
              />
            </label>
            <label>
              Personne déclarant l’exception
              <input
                required
                minLength={2}
                maxLength={60}
                value={draft.by}
                onChange={(e) => set("by", e.target.value)}
                placeholder="Nom ou rôle fictif"
              />
            </label>
            <label className="lb-check">
              <input
                type="checkbox"
                required
                checked={draft.confirmed}
                onChange={(e) => set("confirmed", e.target.checked)}
              />
              Je déclare ce titre présent dans la sélection citée.
            </label>
            <p className="lb-muted">
              Le délai et l’état physique restent contrôlés avec les mêmes
              paramètres.
            </p>
          </>
        )}
      </fieldset>
      <div className="lb-actions">
        <button type="submit" className="lb-primary">
          Enregistrer les détails
        </button>
        <button type="button" onClick={onCancel}>
          Abandonner
        </button>
      </div>
    </form>
  );
}
function DatesEditor({ invoice, onSave, onCancel }) {
  const [draft, setDraft] = useState({
    date: invoice.request.date,
    receivedAt: invoice.request.receivedAt || "",
  });
  return (
    <form
      className="lb-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...draft, receivedAt: draft.receivedAt || null });
      }}
    >
      <h2>Dates de la demande</h2>
      <p>
        Le choix de la date retenue pour les six mois reste un paramètre
        illustratif à confirmer.
      </p>
      <label>
        Date de demande
        <input
          type="date"
          required
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
      </label>
      <label>
        Date de réception, si connue
        <input
          type="date"
          value={draft.receivedAt}
          onChange={(e) => setDraft({ ...draft, receivedAt: e.target.value })}
        />
      </label>
      <div className="lb-actions">
        <button className="lb-primary" type="submit">
          Enregistrer les dates
        </button>
        <button type="button" onClick={onCancel}>
          Abandonner
        </button>
      </div>
    </form>
  );
}
function Policies({ invoice, locked, onChange }) {
  const policy = invoice.policy;
  return (
    <section className="lb-policy">
      <h3>Paramètres illustratifs à confirmer</h3>
      <div className="lb-policy-grid">
        <Choice
          label="Périmètre"
          value={policy.scope}
          options={SCOPES}
          disabled={locked}
          onChange={(scope) => onChange({ ...policy, scope })}
        />
        <Choice
          label="Arrondi"
          value={policy.round}
          options={ROUNDS}
          disabled={locked}
          onChange={(round) => onChange({ ...policy, round })}
        />
        <div className="lb-fixed">
          <span>Délai</span>
          <strong>6 mois calendaires</strong>
        </div>
        <Choice
          label="Date retenue"
          value={policy.dateBasis}
          options={BASES}
          disabled={locked}
          onChange={(dateBasis) => onChange({ ...policy, dateBasis })}
        />
      </div>
      <div className="lb-boundary">
        <Choice
          label="Borne du délai"
          value={policy.boundary}
          options={BOUNDS}
          disabled={locked}
          onChange={(boundary) => onChange({ ...policy, boundary })}
        />
        <p>
          Plafond de 50 %. Pour une commande, les titres d’exception sont
          retirés de la base. Chacun conserve son propre reliquat physique. Ces
          conventions restent à confirmer avec le service commandes.
        </p>
      </div>
    </section>
  );
}
function Preparation({ invoice, calculation, onReview, runExport }) {
  const [by, setBy] = useState(""),
    [note, setNote] = useState("");
  return (
    <section className="lb-preparation">
      <div className="lb-document">
        <h1>Fiche préparatoire</h1>
        <p className="lb-lead">
          {invoice.id} · {invoice.bookstore}
        </p>
        <p>
          Demande du {dateLabel(invoice.request.date)}. Les quantités ci-dessous
          sont des propositions à examiner.
        </p>
        <p className="lb-scroll-hint">
          Faites défiler le tableau pour lire toutes les quantités.
        </p>
        <div
          className="lb-table-scroll"
          tabIndex="0"
          role="region"
          aria-label="Quantités de la fiche préparatoire, tableau défilant"
        >
          <table>
            <thead>
              <tr>
                {[
                  "Titre",
                  "Demandés",
                  "Neufs",
                  "Étiquetés",
                  "Abîmés",
                  "Non contrôlés",
                  "Proposés",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calculation.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.title}</th>
                  <td>{r.requested}</td>
                  <td>{r.newCount}</td>
                  <td>{r.tagged}</td>
                  <td>{r.damaged}</td>
                  <td>{r.unknown}</td>
                  <td>
                    <strong>{r.proposed}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2>Base de calcul</h2>
        <p>
          50 % · {SCOPES[invoice.policy.scope]} · arrondi{" "}
          {ROUNDS[invoice.policy.round].toLowerCase()}.{" "}
          {BASES[invoice.policy.dateBasis]}{" "}
          {calculation.selectedDate
            ? `retenue le ${dateLabel(calculation.selectedDate)}`
            : "non renseignée"}
          . Limite illustrative au {dateLabel(calculation.deadline)},{" "}
          {BOUNDS[invoice.policy.boundary].toLowerCase()}.
        </p>
        {invoice.policy.scope === "invoice" && (
          <p>
            Plafond commun hors exceptions {calculation.shared.ceiling}, moins{" "}
            {calculation.shared.previous} repris, soit{" "}
            {calculation.shared.remaining} pour toutes les propositions sans
            exception.
          </p>
        )}
        {calculation.rows.some((r) => r.exception) && (
          <>
            <h2>Exceptions déclarées</h2>
            {calculation.rows
              .filter((r) => r.exception)
              .map((r) => (
                <p key={r.id}>
                  <strong>{r.title}</strong>
                  <br />
                  {r.exception.source}
                  <br />
                  <span className="lb-muted">Déclaré par {r.exception.by}</span>
                </p>
              ))}
          </>
        )}
        <h2>Points de relecture</h2>
        {calculation.blockers.length > 0 && (
          <ul className="lb-blockers">
            {calculation.blockers.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        {calculation.warnings.length > 0 && (
          <ul>
            {calculation.warnings.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        {!calculation.blockers.length && !calculation.warnings.length && (
          <p>Aucun point ouvert selon ces paramètres illustratifs.</p>
        )}
        <p className="lb-document-note">
          Aucun accord de retour ni avoir. Les paramètres doivent être confirmés
          avec le service commandes.
        </p>
      </div>
      <aside className="lb-review">
        <h2>
          {invoice.review ? "Préparation relue" : "Relire les propositions"}
        </h2>
        {invoice.review ? (
          <>
            <p className="lb-reviewed-by">{invoice.review.by}</p>
            <p>{invoice.review.note}</p>
            <p className="lb-muted">
              Toute modification du dossier retire cette relecture.
            </p>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onReview({ by, note });
            }}
          >
            <p>La relecture porte sur cette préparation et ses réserves.</p>
            <label>
              Relecteur
              <input
                required
                minLength={2}
                maxLength={60}
                value={by}
                onChange={(e) => setBy(e.target.value)}
                placeholder="Nom ou rôle fictif"
              />
            </label>
            <label>
              Note de préparation
              <textarea
                required
                minLength={10}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Justifiez les propositions et les points restant à confirmer."
              />
            </label>
            <button
              className="lb-primary"
              disabled={calculation.blockers.length > 0}
            >
              Enregistrer la relecture
            </button>
            {calculation.blockers.length > 0 && (
              <p className="lb-warning">
                Revenez au dossier pour traiter les incompatibilités avant de
                relire.
              </p>
            )}
          </form>
        )}
        <div className="lb-export">
          <h3>Récupérer la préparation</h3>
          <button onClick={() => runExport("html")}>
            Télécharger la fiche HTML
          </button>
          <button disabled={!invoice.review} onClick={() => runExport("csv")}>
            Exporter les propositions CSV
          </button>
          <button disabled={!invoice.review} onClick={() => runExport("txt")}>
            Télécharger la réponse TXT
          </button>
          <p className="lb-muted">
            Le HTML conserve aussi un brouillon non relu. La réponse TXT reste
            un texte à relire, rien n’est envoyé.
          </p>
        </div>
      </aside>
    </section>
  );
}
export default function App() {
  useDocumentTitle("Le Lys Bleu · Dossier de retour");
  const history = useHistory(seed),
    state = history.value,
    [selected, setSelected] = useState(state.invoices[0].id),
    [view, setView] = useState("dossier"),
    [editor, setEditor] = useState(null),
    [imports, setImports] = useState(false),
    [feedback, setFeedback] = useState(null);
  const invoice =
      state.invoices.find((i) => i.id === selected) || state.invoices[0],
    calculation = evaluate(invoice),
    locked = !!editor;
  const act = (fn, msg) => {
    try {
      history.set(fn(state));
      setFeedback({ text: msg, error: false });
      return true;
    } catch (e) {
      setFeedback({ text: e.message, error: true });
      return false;
    }
  };
  const runExport = (kind) => {
    try {
      if (kind === "html")
        downloadReport(
          `lys-bleu-${invoice.id}-preparation.html`,
          report(invoice),
        );
      else if (kind === "csv")
        downloadCsv(
          `lys-bleu-${invoice.id}-propositions.csv`,
          OUTPUT_HEADERS,
          outputRows(invoice),
        );
      else
        downloadText(`lys-bleu-${invoice.id}-reponse.txt`, draftText(invoice));
      setFeedback({
        text: "Fichier préparé depuis le dossier courant.",
        error: false,
      });
    } catch (e) {
      setFeedback({ text: e.message, error: true });
    }
  };
  const load = async (kind, file) => {
    try {
      const raw = await readLocalFile(file, { maxBytes: MAX_BYTES });
      const result =
        kind === "json" ? restore(raw) : importCsv(state, kind, raw);
      history.set(result);
      setFeedback({
        text:
          kind === "json"
            ? "Dossier restauré."
            : "CSV intégré. Les lignes absentes du fichier sont conservées.",
        error: false,
      });
    } catch (e) {
      setFeedback({ text: e.message, error: true });
    }
  };
  return (
    <div className="lys-bleu-app">
      <header className="lb-header">
        <strong>Le Lys Bleu Éditions</strong>
        <nav aria-label="Vues du retour">
          <button
            disabled={locked}
            aria-current={view === "dossier" ? "page" : undefined}
            onClick={() => setView("dossier")}
          >
            Dossier de retour
          </button>
          <button
            disabled={locked}
            aria-current={view === "fiche" ? "page" : undefined}
            onClick={() => setView("fiche")}
          >
            Fiche préparatoire
          </button>
        </nav>
        <span>Préparation indépendante</span>
      </header>
      <main>
        {feedback && (
          <p
            className={`lb-feedback ${feedback.error ? "lb-error" : ""}`}
            role={feedback.error ? "alert" : "status"}
          >
            {feedback.text}
          </p>
        )}
        <div className="lb-top">
          <div>
            {view === "dossier" && (
              <>
                <h1>Un second retour, la même facture</h1>
                <p className="lb-lead">
                  Ajustez les quantités proposées en tenant compte des reprises
                  précédentes.
                </p>
              </>
            )}
          </div>
          <div className="lb-selection">
            <label>
              Facture
              <select
                disabled={locked}
                value={invoice.id}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setFeedback(null);
                }}
              >
                {state.invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.id} · {i.bookstore}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={locked}
              aria-expanded={imports}
              onClick={() => setImports(!imports)}
            >
              Importer des fichiers
            </button>
          </div>
        </div>
        {imports && (
          <section className="lb-imports">
            <h2>Factures, reprises et dossier enregistré</h2>
            <p>
              Les CSV mettent à jour les identifiants présents. Une reprise
              importée deux fois sous le même identifiant n’est comptée qu’une
              fois. Les autres lignes sont conservées.
            </p>
            <div className="lb-import-grid">
              <div>
                <h3>Factures</h3>
                <FileImport
                  label="Importer les factures CSV"
                  accept=".csv,text/csv"
                  onFile={(f) => load("invoices", f)}
                />
                <button
                  onClick={() =>
                    downloadCsv(
                      "lys-bleu-factures-exemple.csv",
                      INVOICE_HEADERS,
                      invoiceRows(state),
                    )
                  }
                >
                  Télécharger le format factures
                </button>
                <small>
                  facture, librairie, date_facture, ligne, titre, commandes
                </small>
              </div>
              <div>
                <h3>Reprises déjà comptabilisées</h3>
                <FileImport
                  label="Importer les reprises CSV"
                  accept=".csv,text/csv"
                  onFile={(f) => load("history", f)}
                />
                <button
                  onClick={() =>
                    downloadCsv(
                      "lys-bleu-reprises-exemple.csv",
                      HISTORY_HEADERS,
                      historyRows(state),
                    )
                  }
                >
                  Télécharger le format reprises
                </button>
                <small>facture, reprise, ligne, date_reprise, quantite</small>
              </div>
              <div>
                <h3>Reprendre une session</h3>
                <FileImport
                  label="Reprendre le dossier JSON"
                  accept=".json,application/json"
                  onFile={(f) => load("json", f)}
                />
                <small>
                  Remplace l’ensemble du dossier. Annuler permet de retrouver
                  l’état précédent. Fichiers limités à 5 Mio.
                </small>
              </div>
            </div>
          </section>
        )}
        {view === "dossier" ? (
          <div className="lb-spread">
            <Invoice
              key={invoice.id}
              invoice={invoice}
              calculation={calculation}
              locked={locked}
              onDates={() => {
                setImports(false);
                setEditor("dates");
              }}
            />
            <section className="lb-request">
              <h2>Demande du {dateLabel(invoice.request.date)}</h2>
              {editor === "dates" ? (
                <DatesEditor
                  key={invoice.id}
                  invoice={invoice}
                  onCancel={() => setEditor(null)}
                  onSave={(p) => {
                    if (
                      act(
                        (s) => setDates(s, invoice.id, p),
                        "Dates enregistrées.",
                      )
                    )
                      setEditor(null);
                  }}
                />
              ) : editor ? (
                <>
                  <p className="lb-edited-title">
                    {invoice.lines.find((l) => l.id === editor)?.title}
                  </p>
                  <RequestEditor
                    key={invoice.id + editor}
                    line={invoice.request.lines.find(
                      (l) => l.lineId === editor,
                    )}
                    onCancel={() => setEditor(null)}
                    onSave={(changes) => {
                      if (
                        act(
                          (s) => editRequest(s, invoice.id, editor, changes),
                          "Détails enregistrés.",
                        )
                      )
                        setEditor(null);
                    }}
                  />
                </>
              ) : (
                <>
                  {invoice.policy.scope === "invoice" && (
                    <div className="lb-shared">
                      <strong>Plafond commun hors exceptions</strong>
                      <p>
                        {calculation.shared.ordered} commandés × 50 %, arrondi{" "}
                        {ROUNDS[invoice.policy.round].toLowerCase()} ={" "}
                        {calculation.shared.ceiling}. Moins{" "}
                        {calculation.shared.previous} repris, soit{" "}
                        <strong>
                          {calculation.shared.remaining} pour l’ensemble des
                          titres sans exception
                        </strong>
                        .
                      </p>
                      <p>
                        {calculation.shared.proposed} proposés sur ce plafond
                        commun.
                      </p>
                    </div>
                  )}
                  <div className="lb-request-lines">
                    {calculation.rows.map((r) => (
                      <article className="lb-request-line" key={r.id}>
                        <div className="lb-line-heading">
                          <h3>{r.title}</h3>
                          <small>{r.id}</small>
                        </div>
                        <div className="lb-line-content">
                          <dl className="lb-condition">
                            <div>
                              <dt>Demandés</dt>
                              <dd>{r.requested}</dd>
                            </div>
                            <div>
                              <dt>Neufs</dt>
                              <dd>{r.newCount}</dd>
                            </div>
                            {r.tagged > 0 && (
                              <div>
                                <dt>Étiquetés</dt>
                                <dd>{r.tagged}</dd>
                              </div>
                            )}
                            {r.damaged > 0 && (
                              <div>
                                <dt>Abîmés</dt>
                                <dd>{r.damaged}</dd>
                              </div>
                            )}
                            {r.unknown > 0 && (
                              <div>
                                <dt>Non contrôlés</dt>
                                <dd>{r.unknown}</dd>
                              </div>
                            )}
                          </dl>
                          <div className="lb-remainder">
                            <span>
                              {r.exception
                                ? "Reliquat physique"
                                : invoice.policy.scope === "title"
                                  ? "Plafond illustratif restant"
                                  : "Plafond commun restant"}
                            </span>
                            <strong>
                              {invoice.policy.scope === "invoice" &&
                              !r.exception
                                ? calculation.shared.remaining
                                : r.cap}
                            </strong>
                            <small>
                              {r.exception
                                ? "Exception déclarée"
                                : invoice.policy.scope === "invoice"
                                  ? "Partagé entre les titres"
                                  : `${r.ordered} × 50 %, arrondi − ${r.previous} repris`}
                            </small>
                          </div>
                          <div>
                            <Qty
                              key={invoice.id + r.id}
                              label={`Proposition ${r.title}`}
                              value={r.proposed}
                              onSave={(raw) =>
                                act(
                                  (s) =>
                                    setProposal(
                                      s,
                                      invoice.id,
                                      r.id,
                                      integer(raw, "Proposition"),
                                    ),
                                  "Proposition enregistrée.",
                                )
                              }
                            />
                            {r.issues.map((t) => (
                              <p className="lb-warning" key={t}>
                                {t}
                              </p>
                            ))}
                          </div>
                          <button
                            aria-label={`Détails ${r.title}`}
                            onClick={() => {
                              setImports(false);
                              setEditor(r.id);
                            }}
                          >
                            Détails
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <Policies
                    invoice={invoice}
                    locked={locked}
                    onChange={(p) =>
                      act(
                        (s) => setPolicy(s, invoice.id, p),
                        "Paramètres illustratifs modifiés.",
                      )
                    }
                  />
                  {calculation.blockers
                    .filter(
                      (x) =>
                        !calculation.rows.some((r) =>
                          r.issues.some((y) => x === r.title + " : " + y),
                        ),
                    )
                    .map((x) => (
                      <p key={x} className="lb-warning lb-global-reserve">
                        {x}
                      </p>
                    ))}
                </>
              )}
            </section>
          </div>
        ) : (
          <Preparation
            key={invoice.id + (invoice.review?.basis || "draft")}
            invoice={invoice}
            calculation={calculation}
            onReview={(p) =>
              act(
                (s) => review(s, invoice.id, p),
                "Relecture de la préparation enregistrée.",
              )
            }
            runExport={runExport}
          />
        )}
        <div className="lb-bottom">
          <div className="lb-actions">
            <button
              disabled={locked}
              className="lb-primary"
              onClick={() => setView(view === "dossier" ? "fiche" : "dossier")}
            >
              {view === "dossier" ? "Examiner la fiche" : "Revenir au dossier"}
            </button>
            <button
              disabled={locked}
              onClick={() => downloadJson("lys-bleu-dossiers.json", state)}
            >
              Sauvegarder
            </button>
            <button
              disabled={locked || !history.canUndo}
              onClick={() => {
                history.undo();
                setFeedback(null);
              }}
            >
              Annuler
            </button>
            <button
              disabled={locked || !history.canRedo}
              onClick={() => {
                history.redo();
                setFeedback(null);
              }}
            >
              Rétablir
            </button>
            <button
              disabled={locked}
              onClick={() => {
                history.reset();
                setEditor(null);
                setImports(false);
                setView("dossier");
                setSelected("LB-260331");
                setFeedback({
                  text: "Exemple initial rechargé.",
                  error: false,
                });
              }}
            >
              Exemple initial
            </button>
          </div>
          <p>Données fictives. Aucun accord de retour ni avoir émis.</p>
        </div>
      </main>
      <DemoFooter />
    </div>
  );
}

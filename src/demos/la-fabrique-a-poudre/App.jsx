import { useEffect, useRef, useState } from "react";
import "@fontsource/baloo-2/600.css";
import "@fontsource/baloo-2/700.css";
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/600.css";
import { useHistory } from "../../shared/state.js";
import {
  downloadJson,
  downloadCsv,
  downloadReport,
  readLocalFile,
} from "../../shared/files.js";
import { DemoFooter, useDocumentTitle } from "../../shared/ui.jsx";
import {
  seed,
  expected,
  display,
  editEvent,
  importActual,
  isCurrent,
  run,
  compare,
  restore,
  MAX_BYTES,
  HEADERS,
  COMPARE_HEADERS,
  expectedRows,
  comparedRows,
  sampleResults,
  report,
} from "./model.js";
import "./styles.css";

function ScrollTable({ label, headings, children }) {
  return (
    <div className="poudre-table" role="region" aria-label={label} tabIndex={0}>
      <table>
        <thead>
          <tr>
            {headings.map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function TransferEditor({
  value,
  transfer,
  event,
  commit,
  dirtyChanged,
  disabled,
}) {
  const [draft, setDraft] = useState({
    date: event.date,
    quantite: event.quantite,
    reason: "",
  });
  const [error, setError] = useState("");
  const dirty =
    draft.date !== event.date ||
    draft.quantite !== event.quantite ||
    !!draft.reason;
  useEffect(() => {
    dirtyChanged(dirty);
  }, [dirty]);
  function change(k, v) {
    setDraft((d) => ({ ...d, [k]: v }));
    setError("");
  }
  function save(e) {
    e.preventDefault();
    try {
      const next = editEvent(value, transfer.id, event.id, draft, draft.reason);
      commit(next);
      setDraft({
        date: next.scenario.transfers
          .find((t) => t.id === transfer.id)
          .events.find((e) => e.id === event.id).date,
        quantite: next.scenario.transfers
          .find((t) => t.id === transfer.id)
          .events.find((e) => e.id === event.id).quantite,
        reason: "",
      });
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <form onSubmit={save} className="poudre-edit" id="poudre-editor">
      <h3>Corriger le mouvement {event.id}</h3>
      <p>
        {event.kind === "depart" ? "Départ" : "Réception"} · {transfer.id}
      </p>
      <label>
        Date du mouvement
        <input
          type="date"
          value={draft.date}
          min="2000-01-01"
          max="2100-12-31"
          onChange={(e) => change("date", e.target.value)}
          required
          disabled={disabled}
        />
      </label>
      <label>
        Quantité ({transfer.unite})
        <input
          inputMode="decimal"
          value={draft.quantite}
          onChange={(e) => change("quantite", e.target.value)}
          required
          disabled={disabled}
        />
      </label>
      <label>
        Motif de correction
        <textarea
          rows={2}
          maxLength={400}
          value={draft.reason}
          onChange={(e) => change("reason", e.target.value)}
          placeholder="Ce qui change dans ce cas de test"
          required
          disabled={disabled}
        />
      </label>
      {error && (
        <p role="alert" className="poudre-error">
          {error}
        </p>
      )}
      <button className="poudre-primary" disabled={!dirty || disabled}>
        Appliquer la correction
      </button>
      {dirty && (
        <button
          type="button"
          className="poudre-text"
          onClick={() => {
            setDraft({
              date: event.date,
              quantite: event.quantite,
              reason: "",
            });
            setError("");
          }}
        >
          Abandonner la saisie
        </button>
      )}
      <small>
        La correction modifie le scénario d’essai. Aucune écriture dans un ERP.
      </small>
    </form>
  );
}
export default function App() {
  useDocumentTitle("La Fabrique à Poudre · Recette des échanges");
  const history = useHistory(seed),
    d = history.value;
  const [selected, setSelected] = useState("T-101"),
    [eventId, setEventId] = useState("R1"),
    [tab, setTab] = useState("Attendus");
  const [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(null),
    [filter, setFilter] = useState(false);
  const dossierInput = useRef(null),
    resultInput = useRef(null);
  const transfer =
    d.scenario.transfers.find((t) => t.id === selected) ||
    d.scenario.transfers[0];
  const event =
    transfer.events.find((e) => e.id === eventId) || transfer.events[0];
  const computed = expected(d),
    total = computed.totals.get(transfer.id),
    current = isCurrent(d),
    rows = current ? compare(d) : [];
  const lock = dirty || !!pending;
  function safe(fn) {
    try {
      fn();
      setError("");
    } catch (e) {
      setError(e.message);
      setNotice("");
    }
  }
  function commit(next) {
    history.set(next);
    setError("");
    setNotice(
      "Scénario mis à jour. Une comparaison doit être relancée après une correction.",
    );
  }
  function move(direction) {
    history[direction]();
    setDirty(false);
    setNotice(
      direction === "undo" ? "Dernière action annulée." : "Action rétablie.",
    );
    setError("");
  }
  async function file(kind, file) {
    if (!file) return;
    try {
      const text = await readLocalFile(file, {
        maxBytes: kind === "dossier" ? MAX_BYTES : 5 * 1024 * 1024,
      });
      const next =
        kind === "dossier" ? restore(text) : importActual(d, text, file.name);
      setPending({ kind, next, name: file.name });
      setError("");
    } catch (e) {
      setError(e.message);
      setNotice("");
    }
  }
  function applyPending() {
    if (pending.kind === "reset") history.reset();
    else history.set(pending.next);
    setNotice(
      pending.kind === "result"
        ? "Résultat importé. Lancez la comparaison."
        : "Dossier chargé.",
    );
    if (pending.kind === "result") setTab("Comparaison");
    setPending(null);
    setDirty(false);
    setError("");
  }
  return (
    <div className="poudre-app">
      <header className="poudre-header">
        <strong>La Fabrique à Poudre</strong>
        <span>Étude indépendante · données fictives</span>
      </header>
      <main inert={!!pending}>
        <section className="poudre-intro">
          <div>
            <h1>Recette des échanges entre sites</h1>
            <p>
              Une réception partielle doit rester en transit. Essayez 40 kg au
              lieu de 35 kg.
            </p>
          </div>
          <div className="poudre-toolbar">
            <button
              disabled={lock}
              onClick={() => dossierInput.current.click()}
            >
              Importer un dossier
            </button>
            <button
              disabled={lock}
              onClick={() => downloadJson("poudre-dossier.json", d)}
            >
              Exporter le dossier
            </button>
            <button
              disabled={lock || !history.canUndo}
              onClick={() => move("undo")}
            >
              Annuler
            </button>
            <button
              disabled={lock || !history.canRedo}
              onClick={() => move("redo")}
            >
              Rétablir
            </button>
          </div>
        </section>
        <input
          hidden
          ref={dossierInput}
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            file("dossier", e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          hidden
          ref={resultInput}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            file("result", e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {error && (
          <p role="alert" className="poudre-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="poudre-notice">
            {notice}
          </p>
        )}
        <nav className="poudre-mobile-nav" aria-label="Accès rapide">
          <a href="#poudre-editor">Corriger un mouvement</a>
          <a href="#poudre-results">Voir les résultats</a>
        </nav>
        <div className="poudre-workspace">
          <aside className="poudre-rail">
            <h2>Scénarios de transfert</h2>
            <p>Sélectionnez un transfert, puis le mouvement à éprouver.</p>
            <div className="poudre-transfer-list">
              {d.scenario.transfers.map((t) => (
                <button
                  key={t.id}
                  className={t.id === transfer.id ? "selected" : ""}
                  aria-pressed={t.id === transfer.id}
                  disabled={lock}
                  onClick={() => {
                    setSelected(t.id);
                    setEventId(
                      t.events.find((e) => e.kind === "reception")?.id ||
                        t.events[0].id,
                    );
                    setNotice("");
                  }}
                >
                  <strong>{t.id}</strong>
                  <span>
                    {t.from} → {t.to}
                  </span>
                  <small>
                    {t.article} · {t.lot} · {t.unite}
                  </small>
                </button>
              ))}
            </div>
            <details className="poudre-identity">
              <summary>Détails du transfert</summary>
              <dl>
                <dt>Origine</dt>
                <dd>{transfer.from}</dd>
                <dt>Destination</dt>
                <dd>{transfer.to}</dd>
                <dt>Article</dt>
                <dd>{transfer.article}</dd>
                <dt>Lot</dt>
                <dd>{transfer.lot}</dd>
                <dt>Unité</dt>
                <dd>{transfer.unite}</dd>
              </dl>
            </details>
            <label className="poudre-event-selector">
              Mouvement à corriger
              <select
                value={event.id}
                disabled={lock}
                onChange={(e) => setEventId(e.target.value)}
              >
                {transfer.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id} · {e.kind === "depart" ? "Départ" : "Réception"} ·{" "}
                    {e.quantite} {transfer.unite}
                  </option>
                ))}
              </select>
            </label>
            <TransferEditor
              key={JSON.stringify([
                transfer.id,
                event,
                history.past.length,
                history.future.length,
              ])}
              value={d}
              transfer={transfer}
              event={event}
              commit={commit}
              dirtyChanged={setDirty}
              disabled={!!pending}
            />
          </aside>
          <section className="poudre-results" id="poudre-results">
            <nav className="poudre-tabs" aria-label="Vue de recette">
              {["Mouvements", "Attendus", "Comparaison"].map((x) => (
                <button
                  key={x}
                  aria-current={tab === x ? "page" : undefined}
                  onClick={() => setTab(x)}
                >
                  {x}
                </button>
              ))}
            </nav>
            {!computed.valid && (
              <div role="alert" className="poudre-error">
                <strong>Scénario non calculable</strong>
                <ul>
                  {computed.issues.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
                <p>
                  Les stocks attendus et leur comparaison sont masqués jusqu’à
                  correction.
                </p>
              </div>
            )}
            {tab === "Mouvements" && (
              <div className="poudre-panel">
                <h2>Mouvements du scénario</h2>
                <p>
                  Ordre chronologique, puis ordre des transferts et de leurs
                  mouvements à date égale. Stock d’ouverture au{" "}
                  {d.scenario.openingDate}.
                </p>
                <ScrollTable
                  label="Mouvements chronologiques, défilement horizontal"
                  headings={[
                    "Date",
                    "Transfert",
                    "Mouvement",
                    "Trajet",
                    "Quantité",
                  ]}
                >
                  {computed.events.map(({ t, e }) => (
                    <tr key={`${t.id}/${e.id}`}>
                      <td>{e.date}</td>
                      <td>
                        {t.id}
                        <small>
                          {t.article} · {t.lot}
                        </small>
                      </td>
                      <td>
                        {e.kind === "depart" ? "Départ" : "Réception"} {e.id}
                      </td>
                      <td>
                        {t.from} → {t.to}
                      </td>
                      <td className="poudre-number">
                        {display(Number(e.quantite) * 1000)} {t.unite}
                      </td>
                    </tr>
                  ))}
                </ScrollTable>
                <details>
                  <summary>Stocks d’ouverture</summary>
                  <ScrollTable
                    label="Stocks initiaux, défilement horizontal"
                    headings={["Site", "Article", "Lot", "Quantité"]}
                  >
                    {d.scenario.stocks.map((r, i) => (
                      <tr key={i}>
                        <td>{r.site}</td>
                        <td>{r.article}</td>
                        <td>{r.lot}</td>
                        <td className="poudre-number">
                          {r.quantite} {r.unite}
                        </td>
                      </tr>
                    ))}
                  </ScrollTable>
                </details>
              </div>
            )}
            {tab === "Attendus" && computed.valid && (
              <>
                <section className="poudre-panel">
                  <h2>Attendus pour le transfert {transfer.id}</h2>
                  <p>
                    Chaque quantité est rattachée à {transfer.article}, lot{" "}
                    {transfer.lot}, en {transfer.unite}.
                  </p>
                  <div className="poudre-equation">
                    <div>
                      <strong>
                        {display(total.sent)} {transfer.unite}
                      </strong>
                      <span>partis ({transfer.from})</span>
                    </div>
                    <div>
                      <strong>
                        {display(total.received)} {transfer.unite}
                      </strong>
                      <span>reçus ({transfer.to})</span>
                    </div>
                    <div className={total.transit ? "poudre-transit" : ""}>
                      <strong>
                        {display(total.transit)} {transfer.unite}
                      </strong>
                      <span>en transit ({transfer.id})</span>
                    </div>
                  </div>
                  <p className="poudre-equation-text">
                    {display(total.sent)} {transfer.unite} partis ={" "}
                    {display(total.received)} {transfer.unite} reçus +{" "}
                    {display(total.transit)} {transfer.unite} en transit
                  </p>
                </section>
                <section className="poudre-panel">
                  <div className="poudre-section-title">
                    <div>
                      <h2>Stocks attendus après traitement</h2>
                      <p>
                        Soldes par identité de stock. Le transit est isolé par
                        transfert.
                      </p>
                    </div>
                    <button
                      disabled={lock}
                      onClick={() =>
                        safe(() =>
                          downloadCsv(
                            "poudre-attendus.csv",
                            HEADERS,
                            expectedRows(d),
                          ),
                        )
                      }
                    >
                      Exporter les attendus
                    </button>
                  </div>
                  <ScrollTable
                    label="Stocks attendus, défilement horizontal"
                    headings={[
                      "Emplacement",
                      "Article",
                      "Lot",
                      "Unité",
                      "Stock attendu",
                    ]}
                  >
                    {computed.rows.map((r, i) => (
                      <tr
                        key={i}
                        className={r.type === "transit" ? "transit-row" : ""}
                      >
                        <td>
                          {r.type === "transit"
                            ? `Transit ${r.transfert}`
                            : r.site}
                        </td>
                        <td>{r.article}</td>
                        <td>{r.lot}</td>
                        <td>{r.unite}</td>
                        <td className="poudre-number">{display(r.value)}</td>
                      </tr>
                    ))}
                  </ScrollTable>
                  <button
                    className="poudre-after-table"
                    disabled={lock}
                    onClick={() => resultInput.current.click()}
                  >
                    Importer le résultat CSV
                  </button>
                </section>
              </>
            )}
            {tab === "Comparaison" && (
              <section className="poudre-panel">
                <h2>Attendus et résultats importés</h2>
                <p>
                  Le fichier obtenu lors d’un essai est rapproché par site ou
                  transfert, article, lot et unité. Une ligne absente ne vaut
                  pas zéro.
                </p>
                <div className="poudre-actions">
                  <button
                    disabled={lock}
                    onClick={() => resultInput.current.click()}
                  >
                    Importer le résultat CSV
                  </button>
                  <button
                    className="poudre-primary"
                    disabled={lock || !d.actual || !computed.valid}
                    onClick={() =>
                      safe(() => {
                        history.set(run(d));
                        setNotice(
                          "Comparaison exécutée sur les données actuelles.",
                        );
                      })
                    }
                  >
                    Lancer la comparaison
                  </button>
                </div>
                <p className="poudre-source">
                  {d.actual
                    ? `Source importée · ${d.actual.filename} · ${d.actual.rows.length} lignes`
                    : "Aucun résultat importé."}
                </p>
                {!current && (
                  <p className="poudre-unrun">
                    Comparaison non exécutée sur ces données. Importez le
                    fichier d’exemple ci-dessous, puis lancez le rapprochement.
                  </p>
                )}
                {current && (
                  <>
                    <p className="poudre-comparison-summary">
                      {rows.filter((r) => r.status !== "Identique").length}{" "}
                      écarts ou réserves sur {rows.length} clés comparées.
                    </p>
                    <label className="poudre-checkbox">
                      <input
                        type="checkbox"
                        checked={filter}
                        onChange={(e) => setFilter(e.target.checked)}
                      />
                      Afficher uniquement les écarts et réserves
                    </label>
                    <ScrollTable
                      label="Comparaison des résultats, défilement horizontal"
                      headings={[
                        "Emplacement",
                        "Article / lot",
                        "Attendu",
                        "Obtenu",
                        "Écart",
                        "État",
                      ]}
                    >
                      {rows
                        .filter((r) => !filter || r.status !== "Identique")
                        .map((r, i) => (
                          <tr key={i}>
                            <td>
                              {r.type === "transit"
                                ? `Transit ${r.transfert}`
                                : r.site}
                            </td>
                            <td>
                              {r.article}
                              <small>
                                {r.lot} · {r.unite}
                              </small>
                            </td>
                            <td className="poudre-number">
                              {r.expected === null
                                ? "Absent"
                                : display(r.expected)}
                            </td>
                            <td className="poudre-number">
                              {r.actual === null ? "Absent" : display(r.actual)}
                            </td>
                            <td className="poudre-number">
                              {r.difference === null
                                ? "—"
                                : display(r.difference)}
                            </td>
                            <td
                              className={
                                r.status === "Identique" ? "" : "poudre-reserve"
                              }
                            >
                              {r.status}
                              {r.count > 1 && (
                                <small>{r.count} lignes importées</small>
                              )}
                            </td>
                          </tr>
                        ))}
                    </ScrollTable>
                    {filter && !rows.some((r) => r.status !== "Identique") && (
                      <p>Aucun écart ni réserve.</p>
                    )}
                    <button
                      className="poudre-after-table"
                      disabled={lock}
                      onClick={() =>
                        safe(() =>
                          downloadCsv(
                            "poudre-comparaison.csv",
                            COMPARE_HEADERS,
                            comparedRows(d),
                          ),
                        )
                      }
                    >
                      Exporter la comparaison
                    </button>
                  </>
                )}
              </section>
            )}
            <details className="poudre-disclosure">
              <summary>Journal de recette et rapport</summary>
              {d.journal.length ? (
                <ol>
                  {d.journal.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ol>
              ) : (
                <p>Aucune action enregistrée.</p>
              )}
              <button
                disabled={lock}
                onClick={() =>
                  safe(() => downloadReport("poudre-rapport.html", report(d)))
                }
              >
                Exporter le rapport HTML imprimable
              </button>
            </details>
            <details className="poudre-disclosure">
              <summary>Formats, exemple et règles de calcul</summary>
              <p>
                Fichiers traités dans cet onglet, sans connexion à un ERP.
                Exportez le dossier pour conserver votre travail ; fermer
                l’onglet efface cette session.
              </p>
              <p>
                Le JSON porte les stocks initiaux et les événements datés. Les
                sites doivent exister dans les stocks initiaux. Une identité
                article/lot/unité omise commence à zéro dans ce scénario. Aucun
                transfert ne peut rendre le stock négatif ni recevoir plus que
                ce qui est déjà parti. À date égale, l’ordre du JSON est
                conservé.
              </p>
              <p>
                Le CSV attendu contient {HEADERS.join(", ")}. Type « site » avec
                site renseigné et transfert vide ; type « transit » avec
                transfert renseigné et site vide. Quantités positives, jusqu’à
                trois décimales en kg, entières en u. Pas de conversion d’unité.
              </p>
              <div className="poudre-actions">
                <button
                  disabled={lock}
                  onClick={() =>
                    downloadCsv(
                      "poudre-resultat-exemple.csv",
                      HEADERS,
                      sampleResults(),
                    )
                  }
                >
                  Télécharger le résultat d’exemple
                </button>
                <button
                  disabled={lock}
                  onClick={() =>
                    downloadJson("poudre-dossier-exemple.json", seed())
                  }
                >
                  Télécharger le dossier d’exemple
                </button>
                <button
                  disabled={lock}
                  onClick={() => setPending({ kind: "reset" })}
                >
                  Revenir à l’exemple
                </button>
              </div>
              <p>
                Le résultat d’exemple contient volontairement un lot mal saisi.
                Le présent outil porte sur la recette logicielle, sans
                validation de formulation, de qualité ou de production.
              </p>
            </details>
          </section>
        </div>
        <DemoFooter />
      </main>
      {pending && (
        <div className="poudre-modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="poudre-dialog-title"
            className="poudre-modal"
            onKeyDown={(e) => {
              if (e.key === "Escape") setPending(null);
              if (e.key === "Tab") {
                const buttons = [...e.currentTarget.querySelectorAll("button")];
                if (e.shiftKey && document.activeElement === buttons[0]) {
                  e.preventDefault();
                  buttons.at(-1).focus();
                } else if (
                  !e.shiftKey &&
                  document.activeElement === buttons.at(-1)
                ) {
                  e.preventDefault();
                  buttons[0].focus();
                }
              }
            }}
          >
            <h2 id="poudre-dialog-title">
              {pending.kind === "reset"
                ? "Revenir au scénario d’exemple ?"
                : "Charger ce fichier ?"}
            </h2>
            <p>
              {pending.name ||
                "Les données de la session seront remplacées par le scénario initial."}
            </p>
            {pending.next && (
              <p>
                {pending.kind === "result"
                  ? `${pending.next.actual.rows.length} lignes de résultats à comparer.`
                  : `${pending.next.scenario.transfers.length} transferts et ${pending.next.scenario.stocks.length} stocks d’ouverture.`}
              </p>
            )}
            <p>Vous pourrez annuler cette action.</p>
            <div className="poudre-actions">
              <button autoFocus onClick={() => setPending(null)}>
                Annuler le chargement
              </button>
              <button className="poudre-primary" onClick={applyPending}>
                Confirmer le chargement
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

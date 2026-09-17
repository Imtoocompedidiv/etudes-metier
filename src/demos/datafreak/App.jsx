import React, { useEffect, useMemo, useRef, useState } from "react";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import { useHistory } from "../../shared/state.js";
import { useDocumentTitle } from "../../shared/ui.jsx";
import {
  downloadCsv,
  downloadJson,
  downloadText,
  readLocalFile,
} from "../../shared/files.js";
import {
  MAX_BYTES,
  seed,
  plan,
  runLocal,
  target,
  currentResults,
  setMapping,
  setDecision,
  parseFile,
  adoptFile,
  sampleLot,
  testCase,
  report,
  STATUS,
  blocked,
  fingerprint,
  targetHeaders,
  targetRows,
  journalHeaders,
  journalRows,
  countText,
} from "./model.js";
import "./styles.css";

const names = {
  lot: "Lot d’événements",
  target: "Cible de test",
  journal: "Journal",
};
const eventLabel = (e) =>
  e.type === "create"
    ? `Création · ${countText(e.qty, "pièce")}`
    : "Annulation";
const byStatus = (rows, status) =>
  rows.filter((r) => r.status === status).length;

function Modal({ title, children, onClose }) {
  const box = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    box.current.querySelector("button,input,select")?.focus();
    return () => previous?.focus?.();
  }, []);
  const trap = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [
      ...box.current.querySelectorAll(
        'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
      ),
    ];
    const first = items[0],
      last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="dfk-backdrop">
      <section
        className="dfk-dialog"
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dfk-modal-title"
        onKeyDown={trap}
      >
        <div className="dfk-dialog-heading">
          <h2 id="dfk-modal-title">{title}</h2>
          <button onClick={onClose}>Fermer</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default function App() {
  useDocumentTitle("DATAFREAK · Reprise d’un flux de commandes");
  const history = useHistory(seed, { max: 12 }),
    d = history.value;
  const [tab, setTab] = useState("lot"),
    [selected, setSelected] = useState("ligne-4");
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [journalRun, setJournalRun] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [note, setNote] = useState(""),
    [mapDraft, setMapDraft] = useState(""),
    [editingMap, setEditingMap] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false);
  const file = useRef(null),
    inspector = useRef(null),
    tabButtons = useRef({});
  const prepared = useMemo(() => plan(d), [d]),
    last = useMemo(() => currentResults(d), [d]);
  const rows = last || prepared;
  const e =
    d.batch.events.find((e) => e.lineId === selected) || d.batch.events[0];
  const selectedPlan = prepared.find((r) => r.lineId === e.lineId),
    selectedResult = rows.find((r) => r.lineId === e.lineId);
  const existing = d.ledger.find(
    (r) => r.source === d.batch.source && r.eventId === e.eventId,
  );
  const mapping = d.mapping.find((m) => m.from === e.sku);
  const decision = d.decisions.find((r) => r.lineId === e.lineId);
  const dirty = note !== "" || (editingMap && mapDraft !== (mapping?.to || ""));
  const targetData = useMemo(() => target(d.ledger), [d.ledger]);
  const visible = d.batch.events.filter((event) => {
    const r = rows.find((r) => r.lineId === event.lineId);
    return (
      (filter === "all" ||
        (filter === "blocked" ? blocked(r.status) : r.status === filter)) &&
      `${event.eventId} ${event.lineId} ${event.orderId} ${event.sku}`
        .toLocaleLowerCase("fr")
        .includes(query.toLocaleLowerCase("fr"))
    );
  });
  const clearDraft = () => {
    setNote("");
    setMapDraft(mapping?.to || "");
  };
  const fresh = () => {
    setNote("");
    setMapDraft("");
    setEditingMap(false);
    setError("");
  };
  const apply = (change, success) => {
    try {
      const next = typeof change === "function" ? change(d) : change;
      history.set(next);
      fresh();
      setMessage(success);
    } catch (err) {
      setError(err.message);
      setMessage("");
    }
  };
  const selectEvent = (event) => {
    setSelected(event.lineId);
    setNote("");
    setError("");
    setMapDraft(d.mapping.find((m) => m.from === event.sku)?.to || "");
    setEditingMap(
      prepared.find((r) => r.lineId === event.lineId)?.status === "mapping",
    );
  };
  const changeTab = (t) => {
    setTab(t);
    setError("");
  };
  const navigateTabs = (event, t) => {
    const keys = Object.keys(names),
      i = keys.indexOf(t);
    const next =
      event.key === "ArrowRight"
        ? keys[(i + 1) % keys.length]
        : event.key === "ArrowLeft"
          ? keys[(i + keys.length - 1) % keys.length]
          : event.key === "Home"
            ? keys[0]
            : event.key === "End"
              ? keys.at(-1)
              : null;
    if (next) {
      event.preventDefault();
      changeTab(next);
      tabButtons.current[next]?.focus();
    }
  };
  const run = () => {
    try {
      const next = runLocal(d),
        out = currentResults(next);
      history.set(next);
      fresh();
      setMessage(
        `Passage ${next.runCount} terminé. ${countText(byStatus(out, "applied"), "effet appliqué", "effets appliqués")}, ${countText(byStatus(out, "duplicate"), "message déjà reçu", "messages déjà reçus")}, ${countText(out.filter((r) => blocked(r.status)).length, "point à traiter", "points à traiter")}.`,
      );
    } catch (err) {
      setError(err.message);
    }
  };
  const importFile = async (event) => {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    setBusy(true);
    setError("");
    try {
      const parsed = parseFile(
        await readLocalFile(chosen, { maxBytes: MAX_BYTES }),
      );
      setModal({ kind: "import", parsed, filename: chosen.name });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const exportFile = (fn, label) => {
    try {
      fn();
      setMessage(`${label} téléchargé.`);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };
  const undo = () => {
    history.undo();
    fresh();
    setMessage("Dernière modification annulée dans la cible locale.");
  };
  const redo = () => {
    history.redo();
    fresh();
    setMessage("Modification rétablie dans la cible locale.");
  };

  return (
    <div className="dfk-app">
      <div inert={!!modal}>
        <header className="dfk-top">
          <strong>DATAFREAK</strong>
          <span>Prototype indépendant · Données fictives</span>
        </header>
        <main>
          <div className="dfk-heading">
            <div>
              <h1>Reprise d’un flux de commandes</h1>
              <p>
                Traitez le lot, puis reprenez après l’interruption. La commande
                déjà reçue reste unique.
              </p>
            </div>
            <div className="dfk-actions">
              <button
                disabled={dirty || busy}
                onClick={() => file.current.click()}
              >
                {busy ? "Lecture du fichier…" : "Charger un lot"}
              </button>
              <button
                disabled={dirty}
                onClick={() =>
                  exportFile(
                    () => downloadJson("datafreak-dossier.json", d),
                    "Dossier JSON",
                  )
                }
              >
                Enregistrer
              </button>
              <button
                className="dfk-primary"
                disabled={dirty || busy}
                onClick={run}
              >
                Traiter le lot en local
              </button>
            </div>
          </div>
          <input
            ref={file}
            hidden
            type="file"
            accept=".json,application/json"
            onChange={importFile}
            aria-label="Fichier de lot ou dossier JSON"
          />
          <div
            className="dfk-tabs"
            role="tablist"
            aria-label="Vues de l’atelier"
          >
            {Object.entries(names).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                id={`dfk-tab-${key}`}
                aria-controls={`dfk-panel-${key}`}
                aria-selected={tab === key}
                tabIndex={tab === key ? 0 : -1}
                ref={(el) => {
                  tabButtons.current[key] = el;
                }}
                disabled={dirty}
                onClick={() => changeTab(key)}
                onKeyDown={(ev) => navigateTabs(ev, key)}
              >
                {label}
              </button>
            ))}
          </div>
          {error && (
            <p className="dfk-feedback dfk-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="dfk-feedback" role="status">
              {message}
            </p>
          )}
          {dirty && (
            <p className="dfk-draft">
              Une saisie attend d’être appliquée dans le panneau.{" "}
              <button onClick={clearDraft}>Effacer la saisie</button>
            </p>
          )}

          <section
            role="tabpanel"
            id={`dfk-panel-${tab}`}
            aria-labelledby={`dfk-tab-${tab}`}
          >
            {tab === "lot" && (
              <div className="dfk-workbench">
                <section
                  className="dfk-batch"
                  aria-labelledby="dfk-batch-title"
                >
                  <div className="dfk-section-heading">
                    <div>
                      <h2 id="dfk-batch-title">{d.batch.label}</h2>
                      <p>
                        {last
                          ? `Résultats du passage ${d.runCount}`
                          : "Plan préparé · Aucune exécution de cette version"}
                      </p>
                    </div>
                    <div className="dfk-history">
                      <button
                        aria-expanded={filtersOpen}
                        aria-controls="dfk-filters"
                        onClick={() => setFiltersOpen(!filtersOpen)}
                      >
                        Filtrer{filter !== "all" || query ? " · actif" : ""}
                      </button>
                      <button
                        disabled={!history.canUndo || dirty}
                        onClick={undo}
                      >
                        Annuler
                      </button>
                      <button
                        disabled={!history.canRedo || dirty}
                        onClick={redo}
                      >
                        Rétablir
                      </button>
                    </div>
                  </div>
                  {filtersOpen && (
                    <div className="dfk-filters" id="dfk-filters">
                      <label>
                        Afficher
                        <select
                          aria-label="Afficher"
                          value={filter}
                          onChange={(ev) => setFilter(ev.target.value)}
                        >
                          <option value="all">Tous les messages</option>
                          <option value="blocked">Points à traiter</option>
                          <option value="applied">Appliqués ce passage</option>
                          <option value="duplicate">Déjà reçus</option>
                          <option value="excluded">Mis de côté</option>
                        </select>
                      </label>
                      <label>
                        Rechercher
                        <input
                          value={query}
                          onChange={(ev) => setQuery(ev.target.value)}
                          placeholder="Événement, commande…"
                          type="search"
                        />
                      </label>
                      <span>
                        {visible.length} / {d.batch.events.length} messages
                      </span>
                    </div>
                  )}
                  <p className="dfk-scroll-hint">
                    Faites défiler le tableau horizontalement pour voir les
                    situations.
                  </p>
                  <div
                    className="dfk-scroll"
                    role="region"
                    aria-label="Messages du lot, tableau défilant horizontalement"
                    tabIndex="0"
                  >
                    <table className="dfk-events">
                      <thead>
                        <tr>
                          <th scope="col">Événement</th>
                          <th scope="col">Commande</th>
                          <th scope="col">Contenu</th>
                          <th scope="col">Situation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((event) => {
                          const r = rows.find((r) => r.lineId === event.lineId);
                          return (
                            <tr
                              key={event.lineId}
                              className={
                                e.lineId === event.lineId ? "dfk-selected" : ""
                              }
                            >
                              <td>
                                <button
                                  className="dfk-row-button"
                                  disabled={dirty}
                                  aria-label={`Inspecter ${event.eventId}, ${event.lineId}`}
                                  aria-pressed={e.lineId === event.lineId}
                                  onClick={() => selectEvent(event)}
                                >
                                  {event.eventId}
                                </button>
                                <span className="dfk-line-id">
                                  {event.lineId}
                                </span>
                              </td>
                              <td>{event.orderId}</td>
                              <td>{eventLabel(event)}</td>
                              <td>
                                <span
                                  className={`dfk-status dfk-status-${r.status}`}
                                >
                                  {STATUS[r.status]}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {!visible.length && (
                      <p className="dfk-empty">
                        Aucun message ne correspond à ce filtre.{" "}
                        <button
                          onClick={() => {
                            setFilter("all");
                            setQuery("");
                          }}
                        >
                          Afficher le lot complet
                        </button>
                      </p>
                    )}
                  </div>
                  <button
                    className="dfk-inspector-link"
                    onClick={() => {
                      inspector.current?.scrollIntoView({
                        behavior: "auto",
                        block: "start",
                      });
                      inspector.current?.focus();
                    }}
                  >
                    Voir le détail du message sélectionné
                  </button>
                  <p className="dfk-local-note">
                    L’exemple commence avec <strong>C-410 déjà créée</strong>{" "}
                    dans la cible fictive. Le journal des nouveaux passages est
                    initialement vide.
                  </p>
                </section>
                <aside
                  className="dfk-inspector"
                  ref={inspector}
                  tabIndex="-1"
                  aria-labelledby="dfk-inspector-title"
                >
                  <h2 id="dfk-inspector-title">
                    {selectedPlan.status === "conflict" && existing
                      ? "Même identifiant, autre contenu"
                      : selectedPlan.status === "mapping"
                        ? "Relier la référence source"
                        : decision
                          ? "Message mis de côté"
                          : e.eventId}
                  </h2>
                  {!(selectedPlan.status === "conflict" && existing) && (
                    <p
                      className={`dfk-status dfk-status-${selectedResult.status}`}
                    >
                      {STATUS[selectedResult.status]}
                    </p>
                  )}
                  <p>{selectedResult.reason}</p>
                  {existing && selectedPlan.status === "conflict" ? (
                    <div className="dfk-compare">
                      <section>
                        <h3>Déjà appliqué</h3>
                        <dl>
                          <dt>Commande</dt>
                          <dd>{existing.payload.orderId}</dd>
                          <dt>Contenu</dt>
                          <dd>{eventLabel(existing.payload)}</dd>
                          <dt>Référence source</dt>
                          <dd>{existing.payload.sku || "Sans objet"}</dd>
                          {(existing.payload.after.length > 0 ||
                            e.after.length > 0) && (
                            <>
                              <dt>Prérequis</dt>
                              <dd>
                                {existing.payload.after.join(", ") || "Aucun"}
                              </dd>
                            </>
                          )}
                        </dl>
                      </section>
                      <section>
                        <h3>Dans ce lot</h3>
                        <dl>
                          <dt>Commande</dt>
                          <dd>{e.orderId}</dd>
                          <dt>Contenu</dt>
                          <dd>{eventLabel(e)}</dd>
                          <dt>Référence source</dt>
                          <dd>{e.sku || "Sans objet"}</dd>
                          {(existing.payload.after.length > 0 ||
                            e.after.length > 0) && (
                            <>
                              <dt>Prérequis</dt>
                              <dd>{e.after.join(", ") || "Aucun"}</dd>
                            </>
                          )}
                        </dl>
                      </section>
                    </div>
                  ) : (
                    <dl className="dfk-details">
                      <dt>Commande</dt>
                      <dd>{e.orderId}</dd>
                      <dt>Contenu</dt>
                      <dd>{eventLabel(e)}</dd>
                      <dt>Référence source</dt>
                      <dd>{e.sku || "Sans objet"}</dd>
                      <dt>Référence cible</dt>
                      <dd>
                        {e.type === "cancel"
                          ? "Sans objet"
                          : existing?.mappedSku ||
                            mapping?.to ||
                            "À renseigner"}
                      </dd>
                      <dt>Prérequis</dt>
                      <dd>{e.after.join(", ") || "Aucun"}</dd>
                    </dl>
                  )}
                  <p className="dfk-source">
                    Source <code>{d.batch.source}</code> ·{" "}
                    <code>{e.lineId}</code>
                  </p>
                  {editingMap && e.type === "create" ? (
                    <form
                      className="dfk-edit"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        apply(
                          (d) => setMapping(d, e.sku, mapDraft, note),
                          "Correspondance enregistrée. Traitez le lot pour appliquer les nouveaux messages.",
                        );
                      }}
                    >
                      <label>
                        Référence cible
                        <input
                          value={mapDraft}
                          maxLength={80}
                          onChange={(ev) => setMapDraft(ev.target.value)}
                          placeholder="Exemple : TEE-BL-M"
                          required
                        />
                      </label>
                      <label>
                        Motif de correspondance
                        <textarea
                          value={note}
                          maxLength={300}
                          onChange={(ev) => setNote(ev.target.value)}
                          placeholder="Pourquoi ces deux références correspondent-elles ?"
                          required
                          minLength={5}
                        />
                      </label>
                      <button
                        className="dfk-decision"
                        disabled={!mapDraft.trim() || note.trim().length < 5}
                      >
                        Enregistrer la correspondance
                      </button>
                      <p>
                        Elle s’appliquera aux nouveaux événements. Les commandes
                        déjà créées conservent leur référence.
                      </p>
                    </form>
                  ) : decision ? (
                    <div className="dfk-edit">
                      <h3>Décision conservée</h3>
                      <p>{decision.note}</p>
                      <button
                        onClick={() =>
                          apply(
                            (d) => setDecision(d, e.lineId, "", true),
                            "Mise à l’écart retirée. Le message est de nouveau qualifié.",
                          )
                        }
                      >
                        Remettre dans le lot
                      </button>
                    </div>
                  ) : (
                    selectedPlan.status !== "duplicate" && (
                      <form
                        className="dfk-edit"
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          apply(
                            (d) => setDecision(d, e.lineId, note),
                            "Message mis de côté avec son motif. Son contenu source est conservé.",
                          );
                        }}
                      >
                        <label>
                          Motif de mise à l’écart
                          <textarea
                            value={note}
                            maxLength={300}
                            onChange={(ev) => setNote(ev.target.value)}
                            placeholder="Ex. Contenu divergent à vérifier avec la source"
                            required
                            minLength={5}
                          />
                        </label>
                        <button
                          className="dfk-decision"
                          disabled={note.trim().length < 5}
                        >
                          Mettre ce message de côté
                        </button>
                      </form>
                    )
                  )}
                  {!editingMap &&
                    e.type === "create" &&
                    ["ready", "mapping"].includes(selectedPlan.status) && (
                      <button
                        className="dfk-map-link"
                        disabled={dirty}
                        onClick={() => {
                          setMapDraft(mapping?.to || "");
                          setEditingMap(true);
                          setNote("");
                        }}
                      >
                        Modifier la correspondance de référence
                      </button>
                    )}
                  <details className="dfk-technical">
                    <summary>Contenu et empreinte du message</summary>
                    <p>
                      Identité source + événement. L’empreinte ignore
                      l’identifiant de ligne et l’interruption de test.
                    </p>
                    <code className="dfk-hash">{fingerprint(e)}</code>
                    <pre>{JSON.stringify(e, null, 2)}</pre>
                  </details>
                </aside>
              </div>
            )}

            {tab === "target" && (
              <section className="dfk-target">
                <div className="dfk-section-heading">
                  <div>
                    <h2>Cible de test locale</h2>
                    <p>
                      {countText(
                        d.ledger.length,
                        "événement appliqué",
                        "événements appliqués",
                      )}
                      , {countText(targetData.length, "commande")}. Le registre
                      préchargé est inclus.
                    </p>
                  </div>
                  <div className="dfk-history">
                    <button disabled={!history.canUndo || dirty} onClick={undo}>
                      Annuler
                    </button>
                    <button disabled={!history.canRedo || dirty} onClick={redo}>
                      Rétablir
                    </button>
                  </div>
                </div>
                <p>
                  Une commande est préchargée dans l’exemple fourni. Chaque
                  nouveau traitement apparaît séparément dans le journal ; un
                  rejeu identique conserve cet état.
                </p>
                <div
                  className="dfk-scroll"
                  role="region"
                  aria-label="Commandes de la cible locale, tableau défilant"
                  tabIndex="0"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Commande</th>
                        <th>Source</th>
                        <th>Référence</th>
                        <th>Quantité</th>
                        <th>État</th>
                        <th>Création</th>
                        <th>Annulation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targetData.map((order) => {
                        const origin = d.journal.find(
                          (j) =>
                            j.source === order.source &&
                            j.results.some(
                              (r) =>
                                r.eventId === order.createdBy &&
                                r.status === "applied",
                            ),
                        );
                        return (
                          <tr key={`${order.source}/${order.orderId}`}>
                            <th scope="row">{order.orderId}</th>
                            <td>{order.source}</td>
                            <td>{order.sku}</td>
                            <td>{countText(order.qty, "pièce")}</td>
                            <td>{order.state}</td>
                            <td>
                              {order.createdBy}
                              <span className="dfk-line-id">
                                {origin
                                  ? `Passage ${origin.run}`
                                  : "Avant les passages conservés"}
                              </span>
                            </td>
                            <td>{order.cancelledBy || "Aucune"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="dfk-target-note">
                  <h3>Ce que représente la cible</h3>
                  <p>
                    Une projection reconstruite depuis les événements appliqués.
                    Aucun statut de commande réel, stock, paiement ou API n’est
                    modifié. Les quantités restent celles de la création, même
                    après annulation.
                  </p>
                </div>
              </section>
            )}

            {tab === "journal" && (
              <section className="dfk-journal">
                <div className="dfk-section-heading">
                  <div>
                    <h2>Journal des passages</h2>
                    <p>
                      Chaque ligne rapporte une décision de traitement. Les 20
                      derniers passages sont conservés.
                    </p>
                    <p>
                      Les tentatives sont cumulées par ligne du lot. Un doublon
                      ne déclenche aucun nouvel essai.
                    </p>
                  </div>
                  <label>
                    Passage
                    <select
                      aria-label="Passage"
                      value={journalRun}
                      onChange={(ev) => setJournalRun(ev.target.value)}
                    >
                      <option value="all">Tous les passages</option>
                      {d.journal.map((j) => (
                        <option key={j.run} value={j.run}>
                          Passage {j.run}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {!d.journal.length ? (
                  <div className="dfk-empty">
                    <h3>Aucun nouveau passage</h3>
                    <p>
                      La cible de l’exemple est préchargée. Lancez le lot pour
                      enregistrer la première tentative.
                    </p>
                    <button className="dfk-primary" onClick={run}>
                      Traiter le lot en local
                    </button>
                  </div>
                ) : (
                  d.journal
                    .filter(
                      (j) =>
                        journalRun === "all" || String(j.run) === journalRun,
                    )
                    .slice()
                    .reverse()
                    .map((j) => (
                      <section className="dfk-run" key={j.run}>
                        <div>
                          <h3>Passage {j.run}</h3>
                          <span>
                            {j.batchLabel} · {j.source}
                          </span>
                          <p>
                            {countText(
                              byStatus(j.results, "applied"),
                              "appliqué",
                              "appliqués",
                            )}
                            ,{" "}
                            {countText(
                              byStatus(j.results, "duplicate"),
                              "déjà reçu",
                              "déjà reçus",
                            )}
                            ,{" "}
                            {countText(
                              j.results.filter((r) => blocked(r.status)).length,
                              "point à traiter",
                              "points à traiter",
                            )}
                            .
                          </p>
                        </div>
                        <div
                          className="dfk-scroll"
                          role="region"
                          aria-label={`Résultats du passage ${j.run}, tableau défilant`}
                          tabIndex="0"
                        >
                          <table>
                            <thead>
                              <tr>
                                <th>Ligne</th>
                                <th>Événement</th>
                                <th>Situation</th>
                                <th>Tentatives cumulées</th>
                                <th>Explication</th>
                              </tr>
                            </thead>
                            <tbody>
                              {j.results.map((r) => (
                                <tr key={r.lineId}>
                                  <td>{r.lineId}</td>
                                  <td>{r.eventId}</td>
                                  <td>
                                    <span
                                      className={`dfk-status dfk-status-${r.status}`}
                                    >
                                      {STATUS[r.status]}
                                    </span>
                                  </td>
                                  <td>{r.attempt || "Aucune"}</td>
                                  <td>{r.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ))
                )}
              </section>
            )}
          </section>

          <p className="dfk-scenario-note">
            {d.batch.events.some((e) => e.pauseOnce) ? (
              <>
                Interruption de test à la première tentative de{" "}
                {d.batch.events
                  .filter((e) => e.pauseOnce)
                  .map((e) => e.eventId)
                  .join(", ")}
                .{" "}
              </>
            ) : null}
            Aucun appel vers un système client. Les fichiers restent dans ce
            navigateur, sans sauvegarde automatique.
          </p>
          <div className="dfk-exports">
            <strong>Exporter</strong>
            <button
              disabled={!d.journal.length || dirty}
              onClick={() =>
                exportFile(
                  () =>
                    downloadCsv(
                      "datafreak-journal.csv",
                      journalHeaders,
                      journalRows(d),
                    ),
                  "Journal CSV",
                )
              }
            >
              Journal CSV
            </button>
            <button
              disabled={dirty}
              onClick={() =>
                exportFile(
                  () =>
                    downloadCsv(
                      "datafreak-cible.csv",
                      targetHeaders,
                      targetRows(d),
                    ),
                  "Cible CSV",
                )
              }
            >
              Cible CSV
            </button>
            <button
              disabled={dirty}
              onClick={() =>
                exportFile(
                  () =>
                    downloadText(
                      "datafreak-rapport.html",
                      report(d),
                      "text/html;charset=utf-8",
                    ),
                  "Rapport HTML",
                )
              }
            >
              Rapport HTML
            </button>
            <button
              disabled={!last || dirty}
              onClick={() =>
                exportFile(
                  () => downloadJson("datafreak-cas-recette.json", testCase(d)),
                  "Cas de recette",
                )
              }
            >
              Cas de recette
            </button>
            <a
              className="dfk-portfolio"
              href="https://imtoocompedidiv.github.io/portfolio/"
            >
              JD · Portfolio
            </a>
          </div>
          <details className="dfk-help">
            <summary>
              Formats, exemple à charger et reprise de l’atelier
            </summary>
            <p>
              Chargez un lot JSON au format fourni, jusqu’à 500 messages, ou un
              dossier sauvegardé. Un nouveau lot conserve le registre des
              événements appliqués ; un dossier le remplace après confirmation.
              Le cas de recette exporté contient l’entrée et le résultat attendu
              du dernier passage, pour écrire des tests.
            </p>
            <div>
              <button
                disabled={dirty}
                onClick={() =>
                  exportFile(
                    () =>
                      downloadJson("datafreak-lot-exemple.json", sampleLot()),
                    "Lot d’exemple",
                  )
                }
              >
                Télécharger le lot d’exemple
              </button>
              <button
                disabled={dirty}
                onClick={() => setModal({ kind: "reset" })}
              >
                Recommencer l’exemple
              </button>
            </div>
            <p>
              Champs d’un message : lineId, eventId, type (create/cancel),
              orderId, sku, qty, after (liste de prérequis), pauseOnce
              (interruption locale de test). Pour une annulation, sku est vide
              et qty vaut 0. L’identifiant d’événement est propre à sa source.
            </p>
          </details>
        </main>
      </div>
      {modal?.kind === "import" && (
        <Modal
          title={
            modal.parsed.kind === "dossier"
              ? "Restaurer le dossier"
              : "Charger ce lot"
          }
          onClose={() => setModal(null)}
        >
          <p>
            <strong>{modal.filename}</strong>
          </p>
          <p>
            {modal.parsed.kind === "dossier"
              ? `${modal.parsed.value.batch.events.length} messages, ${modal.parsed.value.ledger.length} événements appliqués et ${modal.parsed.value.runCount} passages enregistrés. Le dossier actuel sera remplacé.`
              : `${modal.parsed.value.events.length} messages de ${modal.parsed.value.source}. Le registre appliqué est conservé ; les décisions et tentatives du lot précédent sont remplacées.`}
          </p>
          <p>Les changements pourront être annulés dans l’atelier.</p>
          <div className="dfk-dialog-actions">
            <button onClick={() => setModal(null)}>Garder l’état actuel</button>
            <button
              className="dfk-primary"
              onClick={() => {
                apply(
                  (d) => adoptFile(d, modal.parsed),
                  modal.parsed.kind === "dossier"
                    ? "Dossier restauré."
                    : "Lot chargé, registre appliqué conservé.",
                );
                setFilter("all");
                setQuery("");
                setTab("lot");
                setSelected(
                  modal.parsed.kind === "dossier"
                    ? modal.parsed.value.batch.events[0].lineId
                    : modal.parsed.value.events[0].lineId,
                );
                setModal(null);
              }}
            >
              Confirmer le chargement
            </button>
          </div>
        </Modal>
      )}
      {modal?.kind === "reset" && (
        <Modal title="Recommencer l’exemple" onClose={() => setModal(null)}>
          <p>
            Le lot, la cible et les décisions reviennent à l’exemple initial. La
            commande C-410 sera préchargée et le journal vide. Enregistrez le
            dossier actuel si vous souhaitez le conserver après fermeture.
          </p>
          <div className="dfk-dialog-actions">
            <button onClick={() => setModal(null)}>Garder mon dossier</button>
            <button
              className="dfk-primary"
              onClick={() => {
                history.reset();
                fresh();
                setSelected("ligne-4");
                setFilter("all");
                setQuery("");
                setTab("lot");
                setJournalRun("all");
                setMessage("Exemple réinitialisé, aucun nouveau passage.");
                setModal(null);
              }}
            >
              Recommencer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

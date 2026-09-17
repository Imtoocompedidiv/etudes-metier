import React, { useEffect, useRef, useState } from "react";
import "@fontsource/lexend/400.css";
import "@fontsource/lexend/600.css";
import { useHistory } from "../../shared/state.js";
import { DemoFooter, useDocumentTitle } from "../../shared/ui.jsx";
import {
  downloadJson,
  downloadCsv,
  downloadReport,
  readLocalFile,
} from "../../shared/files.js";
import {
  CHANNELS,
  MAX_BYTES,
  seed,
  replay,
  step,
  rewind,
  editEvent,
  moveEvent,
  reviewResult,
  restore,
  journalHeaders,
  report,
} from "./model.js";
import "./styles.css";
const labels = {
  waiting: "En attente",
  resolved: "Rapprochée",
  collision: "Collision",
  "order-conflict": "Commande contradictoire",
  duplicate: "Doublon ignoré",
  "duplicate-order": "Commande déjà connue",
  reserved: "Réservée",
  "cancelled-on-arrival": "Annulée à réception",
  cancelled: "Annulée",
  "already-cancelled": "Déjà annulée",
};
const eventName = (e) =>
  `${e.kind === "cancel" ? "Annulation" : "Commande"} ${e.orderId}`;
function EventEditor({ event, onSave, onDirty }) {
  const [draft, setDraft] = useState(structuredClone(event)),
    [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(event);
  const change = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setError("");
    onDirty(JSON.stringify(next) !== JSON.stringify(event));
  };
  return (
    <form
      className="fluid-editor"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          if (draft.kind === "reserve" && draft.quantity === "")
            throw Error(
              "Renseignez une quantité entière avant de sauvegarder.",
            );
          onSave({
            ...draft,
            quantity: draft.kind === "cancel" ? null : Number(draft.quantity),
          });
          onDirty(false);
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <div className="fluid-fields">
        <label>
          Type d’événement
          <select
            value={draft.kind}
            onChange={(e) =>
              change({
                kind: e.target.value,
                quantity: e.target.value === "cancel" ? null : 1,
              })
            }
          >
            <option value="reserve">Commande</option>
            <option value="cancel">Annulation</option>
          </select>
        </label>
        <label>
          Canal
          <select
            value={draft.channel}
            onChange={(e) => change({ channel: e.target.value })}
          >
            {CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Commande
          <input
            maxLength={40}
            required
            value={draft.orderId}
            onChange={(e) => change({ orderId: e.target.value })}
          />
        </label>
        <label>
          Référence produit (SKU)
          <input
            maxLength={40}
            required
            value={draft.sku}
            onChange={(e) => change({ sku: e.target.value })}
          />
        </label>
        {draft.kind === "reserve" ? (
          <label>
            Quantité
            <input
              type="number"
              min="1"
              max="1000000"
              step="1"
              required
              value={draft.quantity}
              onChange={(e) => change({ quantity: e.target.value })}
            />
          </label>
        ) : (
          <div>
            <strong className="fluid-field-label">Quantité</strong>
            <p className="fluid-no-quantity">
              Reprise de la quantité commandée. Aucun montant à saisir.
            </p>
          </div>
        )}
        <label>
          Identifiant de l’événement
          <input
            maxLength={40}
            required
            value={draft.eventId}
            onChange={(e) => change({ eventId: e.target.value })}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="fluid-warning">
          {error}
        </p>
      )}
      <div className="fluid-actions">
        <button className="fluid-yellow" disabled={!dirty}>
          Enregistrer l’événement
        </button>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => {
            setDraft(structuredClone(event));
            setError("");
            onDirty(false);
          }}
        >
          Annuler la saisie
        </button>
      </div>
    </form>
  );
}
function Confirm({ title, children, accept, close }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="fluid-dialog" onCancel={close}>
      <h2>{title}</h2>
      {children}
      <div className="fluid-actions">
        <button onClick={close}>Conserver mon dossier</button>
        <button className="fluid-yellow" onClick={accept}>
          Confirmer
        </button>
      </div>
    </dialog>
  );
}
export default function App() {
  useDocumentTitle("Fluid Collectif · Rejouage de commandes");
  const history = useHistory(seed, { max: 20 }),
    state = history.value,
    result = replay(state);
  const [selected, setSelected] = useState("r1"),
    [search, setSearch] = useState(""),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(null),
    [reset, setReset] = useState(false);
  const file = useRef(null),
    event = state.events.find((e) => e.rowId === selected) || state.events[0],
    record = result.trace.find((r) => r.rowId === event.rowId);
  const visible = state.events.filter((e) =>
    [eventName(e), e.eventId, e.channel, e.sku].some((x) =>
      x.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const safe = (fn) => {
    setError("");
    setMessage("");
    try {
      fn();
    } catch (e) {
      setError(e.message);
    }
  };
  const commit = (next, note) => {
    history.set(next);
    setError("");
    setMessage(note);
  };
  const run = (all) =>
    safe(() => {
      const next = step(state, all);
      commit(
        next,
        all ? "Lot entièrement rejoué." : "Réception suivante traitée.",
      );
      if (!all) setSelected(next.events[next.cursor - 1].rowId);
    });
  return (
    <div className="fluid-app">
      <header className="fluid-brand">
        <strong>fluid collectif</strong>
        <span>Étude indépendante · JD</span>
      </header>
      <main className="fluid-shell">
        <div className="fluid-heading">
          <h1>Rejouer une commande, sans la compter deux fois</h1>
          <p>
            Avancez dans le flux, puis inspectez l’effet de chaque réception.
          </p>
        </div>
        <div className="fluid-toolbar">
          <div className="fluid-actions">
            <button
              className="fluid-yellow"
              disabled={dirty}
              onClick={() => file.current?.click()}
            >
              Importer un dossier
            </button>
            <button
              disabled={dirty}
              onClick={() => downloadJson("fluid-exemple.json", seed())}
            >
              Exemple JSON
            </button>
          </div>
          <div className="fluid-actions">
            <button
              className="fluid-yellow"
              disabled={dirty || result.complete}
              onClick={() => run(false)}
            >
              Pas suivant
            </button>
            <button
              className="fluid-navy"
              disabled={dirty || result.complete}
              onClick={() => run(true)}
            >
              Tout rejouer
            </button>
            <button
              disabled={dirty || state.cursor === 0}
              onClick={() =>
                commit(rewind(state), "Rejouage revenu au départ.")
              }
            >
              Repartir du début
            </button>
          </div>
        </div>
        <input
          type="file"
          ref={file}
          hidden
          accept=".json,application/json"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setError("");
            setMessage("");
            try {
              setPending({
                name: f.name,
                state: restore(await readLocalFile(f, { maxBytes: MAX_BYTES })),
              });
            } catch (err) {
              setError(err.message);
            }
          }}
        />
        <div className="fluid-progress">
          <strong>
            {state.cursor} sur {state.events.length} réceptions
          </strong>
          <progress
            value={state.cursor}
            max={state.events.length}
            aria-label="Réceptions traitées"
          />
          <span>
            {state.cursor === 0
              ? "Aucun événement traité"
              : result.complete
                ? "Lecture du lot terminée"
                : "Lecture partielle"}
          </span>
        </div>
        <p className="fluid-contract">
          Contrôle préalable du lot complet. Les identifiants contradictoires
          restent en quarantaine, même si une version arrive en premier.
        </p>
        {error && (
          <p className="fluid-warning fluid-notice" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="fluid-notice" role="status">
            {message}
          </p>
        )}
        {dirty && (
          <p className="fluid-notice">
            Saisie en cours. Enregistrez ou annulez avant de poursuivre. Une
            correction remet le rejouage au départ.
          </p>
        )}
        <div className="fluid-workspace">
          <aside className="fluid-receipts">
            <h2>Ordre de réception</h2>
            <label>
              Rechercher une réception
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <ol>
              {visible.map((e) => {
                const index = state.events.indexOf(e),
                  row = result.trace.find((r) => r.rowId === e.rowId);
                return (
                  <li
                    key={e.rowId}
                    className={e.rowId === event.rowId ? "is-selected" : ""}
                  >
                    <button
                      className="fluid-pick"
                      disabled={dirty}
                      aria-pressed={e.rowId === event.rowId}
                      onClick={() => setSelected(e.rowId)}
                    >
                      <span
                        className={`fluid-dot ${row?.status || "untreated"}`}
                        aria-hidden="true"
                      />
                      <span>
                        <strong>
                          {index + 1}. {eventName(e)}
                        </strong>
                        <small>
                          {e.eventId} · {e.channel}
                        </small>
                        <em>{row ? labels[row.status] : "Non traitée"}</em>
                      </span>
                    </button>
                    <div className="fluid-order-buttons">
                      <button
                        disabled={dirty || index === 0}
                        aria-label={`Monter la réception ${index + 1}`}
                        onClick={() =>
                          safe(() =>
                            commit(
                              moveEvent(state, e.rowId, -1),
                              "Réception déplacée. Rejouage à refaire.",
                            ),
                          )
                        }
                      >
                        ↑
                      </button>
                      <button
                        disabled={dirty || index === state.events.length - 1}
                        aria-label={`Descendre la réception ${index + 1}`}
                        onClick={() =>
                          safe(() =>
                            commit(
                              moveEvent(state, e.rowId, 1),
                              "Réception déplacée. Rejouage à refaire.",
                            ),
                          )
                        }
                      >
                        ↓
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            {!visible.length && (
              <p className="fluid-empty-list">
                Aucune réception ne correspond.
              </p>
            )}
          </aside>
          <div className="fluid-detail">
            <section className="fluid-event">
              <h2>{eventName(event)}</h2>
              <p className="fluid-subtitle">
                {record
                  ? labels[record.status]
                  : "Cette réception attend son tour."}
              </p>
              <EventEditor
                key={JSON.stringify(event)}
                event={event}
                onDirty={setDirty}
                onSave={(patch) =>
                  commit(
                    editEvent(state, event.rowId, patch),
                    "Événement enregistré. Le lot doit être rejoué.",
                  )
                }
              />
            </section>
            <section className="fluid-decision">
              <h2>Décision du rejouage</h2>
              {record ? (
                <div
                  className={
                    ["collision", "order-conflict", "waiting"].includes(
                      record.status,
                    )
                      ? "fluid-warning"
                      : "fluid-decision-text"
                  }
                >
                  <strong>{labels[record.status]}</strong>
                  <p>{record.decision}</p>
                  {record.resolution && <p>{record.resolution}</p>}
                  <p>
                    Mouvement de disponibilité {record.delta > 0 ? "+" : ""}
                    {record.delta} unité{Math.abs(record.delta) > 1 ? "s" : ""}.{" "}
                    {record.quantity === null
                      ? "Quantité déterminée au rapprochement."
                      : `Quantité de la ligne ${record.quantity}.`}
                  </p>
                </div>
              ) : (
                <p className="fluid-empty">
                  Lancez un pas pour voir la décision et la quantité retenue.
                </p>
              )}
            </section>
            <section className="fluid-stocks">
              <h2>Stock de recette</h2>
              <div
                className="fluid-table-scroll"
                role="region"
                aria-label="Stocks de recette, défilement horizontal"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Initial</th>
                      <th>Réservé</th>
                      <th>Disponible</th>
                      <th>Contrôle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.stocks.map((s) => (
                      <tr key={s.sku}>
                        <th scope="row">{s.sku}</th>
                        <td>{s.initial ?? "Inconnu"}</td>
                        <td>{s.reserved}</td>
                        <td
                          className={
                            s.negative || s.unknown ? "fluid-problem" : ""
                          }
                        >
                          {s.available ?? "Inconnu"}
                        </td>
                        <td>
                          {s.unknown
                            ? "Stock initial inconnu"
                            : s.negative
                              ? "Négatif, à examiner"
                              : state.cursor === 0
                                ? "Non traité"
                                : "Calculé sur le lot lu"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="fluid-review">
              <p>
                {result.reviewed
                  ? "Résultat complet relu."
                  : !result.complete
                    ? "Terminez le lot pour examiner toutes ses réserves."
                    : result.unresolved.length
                      ? `${result.unresolved.length} réserve${result.unresolved.length > 1 ? "s" : ""} à résoudre avant la revue.`
                      : "Le lot est complet. Vérifiez les décisions avant la revue."}
              </p>
              <button
                className="fluid-navy"
                disabled={
                  dirty ||
                  !result.complete ||
                  !!result.unresolved.length ||
                  result.reviewed
                }
                onClick={() =>
                  safe(() =>
                    commit(
                      reviewResult(state),
                      "Revue enregistrée pour ce lot et cet ordre de réception.",
                    ),
                  )
                }
              >
                Relire le résultat
              </button>
            </section>
            <div className="fluid-exports fluid-actions">
              <button
                disabled={dirty}
                onClick={() => downloadJson("fluid-dossier.json", state)}
              >
                Dossier JSON
              </button>
              <button
                disabled={dirty}
                onClick={() =>
                  downloadCsv("fluid-journal.csv", journalHeaders, result.trace)
                }
              >
                Journal CSV
              </button>
              <button
                disabled={dirty}
                onClick={() =>
                  downloadReport("fluid-rapport.html", report(state))
                }
              >
                Rapport HTML
              </button>
            </div>
          </div>
        </div>
        <details className="fluid-full-trace">
          <summary>
            Journal de toutes les réceptions traitées ({result.trace.length})
          </summary>
          <div
            className="fluid-table-scroll"
            role="region"
            aria-label="Journal des réceptions, défilement horizontal"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Ordre</th>
                  <th>Réception</th>
                  <th>Décision</th>
                  <th>Effet net</th>
                  <th>Rapprochement</th>
                </tr>
              </thead>
              <tbody>
                {result.trace.map((r) => (
                  <tr key={r.rowId}>
                    <td>{r.index}</td>
                    <td>
                      {r.channel}
                      <br />
                      {r.eventId}
                    </td>
                    <td>
                      {labels[r.status]}
                      <p>{r.decision}</p>
                    </td>
                    <td>
                      {r.delta > 0 ? "+" : ""}
                      {r.delta}
                    </td>
                    <td>{r.resolution || "Aucun complément"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <div className="fluid-bottom">
          <p>
            Données fictives. Aucun échange avec Prestashop ou une marketplace.
            Sauvegardez le JSON pour conserver cette session locale.
          </p>
          <div className="fluid-actions">
            <button
              disabled={dirty || !history.canUndo}
              onClick={() => {
                history.undo();
                setError("");
                setMessage("Dernière action annulée.");
              }}
            >
              Annuler
            </button>
            <button
              disabled={dirty || !history.canRedo}
              onClick={() => {
                history.redo();
                setError("");
                setMessage("Action rétablie.");
              }}
            >
              Rétablir
            </button>
            <button disabled={dirty} onClick={() => setReset(true)}>
              Réinitialiser
            </button>
          </div>
        </div>
        <details className="fluid-method">
          <summary>Schéma et conventions du rejouage</summary>
          <p>
            L’exemple JSON comprend stocks de départ et réceptions dans l’ordre
            d’arrivée. rowId identifie une réception ; canal + eventId identifie
            l’événement. Une même identité avec un contenu différent met toutes
            ses versions en quarantaine avant traitement. Une ligne de commande
            est identifiée par canal + commande + SKU ; deux quantités
            différentes pour cette ligne demandent une correction.
          </p>
          <p>
            Une annulation concerne la ligne complète et porte quantity: null.
            Arrivée trop tôt, elle attend sa commande sans recréditer de stock.
            Le résultat rapproche ensuite les deux. Une correction ou un
            déplacement remet la lecture au départ. Les stocks inconnus et
            négatifs restent visibles. Jusqu’à 80 stocks, 400 réceptions et 2 Mo
            par fichier. Le JSON reprend exactement le dossier ; le CSV et le
            HTML décrivent la lecture effectuée.
          </p>
        </details>
      </main>
      <DemoFooter />
      {pending && (
        <Confirm
          title="Importer ce lot ?"
          close={() => setPending(null)}
          accept={() => {
            commit(pending.state, "Dossier importé.");
            setSelected(pending.state.events[0].rowId);
            setSearch("");
            setPending(null);
          }}
        >
          <p>
            {pending.name} contient {pending.state.events.length} réceptions et{" "}
            {pending.state.stocks.length} stocks. Le remplacement restera
            annulable.
          </p>
        </Confirm>
      )}
      {reset && (
        <Confirm
          title="Restaurer l’exemple initial ?"
          close={() => setReset(false)}
          accept={() => {
            commit(seed(), "Exemple initial restauré.");
            setSelected("r1");
            setSearch("");
            setReset(false);
          }}
        >
          <p>Le lot courant sera remplacé. Cette action restera annulable.</p>
        </Confirm>
      )}
    </div>
  );
}

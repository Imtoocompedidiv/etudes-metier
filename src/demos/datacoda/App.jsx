import React, { useRef, useState } from "react";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import { useHistory } from "../../shared/state";
import { DemoFooter, useDocumentTitle } from "../../shared/ui";
import {
  parseCsv,
  readLocalFile,
  downloadCsv,
  downloadJson,
  downloadReport,
} from "../../shared/files";
import {
  seed,
  EVENT_TYPES,
  HEADERS,
  DECISION_HEADERS,
  pairKey,
  replay,
  uniqueEvents,
  validState,
  parseDossier,
  importRows,
  updateEvent,
  changeWindow,
  changePolicy,
  decisionRows,
  evidenceReport,
} from "./model";
import "./styles.css";

const display = (value) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
function Upload({ label, accept, onFile, disabled }) {
  const input = useRef(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current.click()}
      >
        {label}
      </button>
      <input
        ref={input}
        hidden
        type="file"
        accept={accept}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) await onFile(file);
        }}
      />
    </>
  );
}
function WindowForm({ state, onSave, onDirty }) {
  const [prepared, setPrepared] = useState(state.preparedAt),
    [checked, setChecked] = useState(state.checkedAt);
  const change = (kind, value) => {
    if (kind === "prepared") setPrepared(value);
    else setChecked(value);
    onDirty(
      (kind === "prepared" ? value : prepared) !== state.preparedAt ||
        (kind === "checked" ? value : checked) !== state.checkedAt,
    );
  };
  const dirty = prepared !== state.preparedAt || checked !== state.checkedAt;
  return (
    <form
      className="dc-window"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(prepared, checked);
      }}
    >
      <label>
        Préparation · UTC
        <input
          value={prepared}
          onChange={(e) => change("prepared", e.target.value)}
          spellCheck={false}
          aria-describedby="dc-date-format"
        />
      </label>
      <label>
        Contrôle · UTC
        <input
          value={checked}
          onChange={(e) => change("checked", e.target.value)}
          spellCheck={false}
          aria-describedby="dc-date-format"
        />
      </label>
      <div className="dc-window-actions">
        <button className="dc-primary" type="submit">
          Rejouer
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setPrepared(state.preparedAt);
              setChecked(state.checkedAt);
              onDirty(false);
            }}
          >
            Annuler la saisie des dates
          </button>
        )}
      </div>
      <p id="dc-date-format">
        Format année-mois-jourT heure:minute:secondeZ, sans espace. Tous les
        horaires sont en UTC.
      </p>
    </form>
  );
}
function EventForm({ event, copies, onSave, onDirty }) {
  const [form, setForm] = useState({
    type: event.type,
    occurred_at: event.occurred_at,
    received_at: event.received_at,
  });
  const dirty = Object.keys(form).some((key) => form[key] !== event[key]);
  const change = (key, value) => {
    const next = { ...form, [key]: value };
    setForm(next);
    onDirty(Object.keys(next).some((k) => next[k] !== event[k]));
  };
  return (
    <form
      className="dc-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(event.delivery_id, form);
      }}
    >
      <div className="dc-editor-heading">
        <h2>Modifier l’événement</h2>
        <span>
          {event.event_id} · {event.delivery_id}
        </span>
      </div>
      <label>
        Type d’événement
        <select
          value={form.type}
          onChange={(e) => change("type", e.target.value)}
        >
          {Object.entries(EVENT_TYPES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="dc-event-dates">
        <label>
          Survenue · UTC
          <input
            value={form.occurred_at}
            onChange={(e) => change("occurred_at", e.target.value)}
            spellCheck={false}
          />
        </label>
        <label>
          Réception · UTC
          <input
            value={form.received_at}
            onChange={(e) => change("received_at", e.target.value)}
            spellCheck={false}
          />
        </label>
      </div>
      <p>
        {copies > 1
          ? `Cet événement a ${copies} réceptions. Son type et sa survenue sont corrigés sur toutes ses copies ; la réception change seulement pour ${event.delivery_id}.`
          : "La survenue décrit le fait ; la réception indique quand le système en a eu connaissance."}
      </p>
      <div className="dc-actions">
        <button className="dc-primary" type="submit" disabled={!dirty}>
          Enregistrer l’événement
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setForm({
                type: event.type,
                occurred_at: event.occurred_at,
                received_at: event.received_at,
              });
              onDirty(false);
            }}
          >
            Annuler la saisie
          </button>
        )}
      </div>
    </form>
  );
}
function PolicyForm({ policy, onSave, onDirty }) {
  const [form, setForm] = useState(policy);
  const change = (key, value) => {
    const next = { ...form, [key]: value };
    setForm(next);
    onDirty(
      Object.keys(next).some((k) => String(next[k]) !== String(policy[k])),
    );
  };
  const dirty = Object.keys(form).some(
    (key) => String(form[key]) !== String(policy[key]),
  );
  return (
    <form
      className="dc-policy"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(
          Object.fromEntries(
            Object.entries(form).map(([k, v]) => [
              k,
              String(v).trim() === "" ? NaN : Number(v),
            ]),
          ),
        );
      }}
    >
      <label>
        Premier délai (heures)
        <input
          type="number"
          min="1"
          max="2160"
          step="1"
          value={form.firstDelayHours}
          onChange={(e) => change("firstDelayHours", e.target.value)}
        />
      </label>
      <label>
        Intervalle suivant (heures)
        <input
          type="number"
          min="1"
          max="2160"
          step="1"
          value={form.repeatDelayHours}
          onChange={(e) => change("repeatDelayHours", e.target.value)}
        />
      </label>
      <label>
        Plafond par devis
        <input
          type="number"
          min="0"
          max="10"
          step="1"
          value={form.maxReminders}
          onChange={(e) => change("maxReminders", e.target.value)}
        />
      </label>
      <div className="dc-actions">
        <button className="dc-primary" type="submit" disabled={!dirty}>
          Appliquer les règles
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setForm(policy);
              onDirty(false);
            }}
          >
            Annuler les règles
          </button>
        )}
      </div>
    </form>
  );
}
function Decision({ value, title }) {
  return (
    <section
      className={`dc-decision dc-${value.candidate ? "candidate" : value.code === "waiting" ? "waiting" : "held"}`}
    >
      <h3>{title}</h3>
      <strong>{value.label}</strong>
      <p>{value.reason}</p>
      <small>
        {value.eventIds.length} événement(s) connu(s) · {value.duplicates}{" "}
        copie(s) dédupliquée(s)
      </small>
    </section>
  );
}
export default function App() {
  useDocumentTitle("DataCoda · Rejouer avant de relancer");
  const history = useHistory(seed, {
      key: "datacoda-v1",
      validate: validState,
    }),
    state = history.value;
  const groups = replay(state);
  const [selectedKey, setSelectedKey] = useState(pairKey(seed.events[0]));
  const [delivery, setDelivery] = useState("L-002");
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(null);
  const [dirty, setDirty] = useState({
    event: false,
    window: false,
    policy: false,
  });
  const isDirty = Object.values(dirty).some(Boolean);
  const current =
    groups.find((group) => group.key === selectedKey) || groups[0];
  const selected =
    current.rows.find((row) => row.delivery_id === delivery) || current.rows[0];
  const sorted = [...current.rows].sort(
    (a, b) =>
      a.received_at.localeCompare(b.received_at) ||
      a.delivery_id.localeCompare(b.delivery_id),
  );
  const editFlag = (key, value) => {
    setDirty((previous) => ({ ...previous, [key]: value }));
    if (!value) setError("");
  };
  const commit = (next, key, message) => {
    try {
      history.set(next());
      editFlag(key, false);
      setError("");
      setNotice(message);
    } catch (e) {
      setError(e.message);
    }
  };
  const pickGroup = (key) => {
    if (dirty.event) {
      setError(
        "Enregistrez ou annulez la saisie de l’événement avant de changer de devis.",
      );
      return;
    }
    setSelectedKey(key);
    setError("");
  };
  const pickRow = (id) => {
    if (dirty.event) {
      setError(
        "Enregistrez ou annulez la saisie avant de changer de réception.",
      );
      return;
    }
    setDelivery(id);
    setError("");
  };
  const inspectFile = async (file, kind) => {
    try {
      const text = await readLocalFile(file);
      let next;
      if (kind === "json") next = parseDossier(text);
      else {
        const parsed = parseCsv(text, {
          requiredHeaders: HEADERS,
          maxRows: 500,
        });
        if (parsed.headers.some((key) => !HEADERS.includes(key)))
          throw new Error(
            "Le CSV doit contenir exactement les sept colonnes de l’exemple.",
          );
        next = importRows(state, parsed.rows);
      }
      setPreview({ name: file.name, state: next, kind });
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  const emit = (action, message) => {
    if (isDirty) {
      setError("Enregistrez ou annulez les saisies avant de télécharger.");
      return;
    }
    action();
    setNotice(message);
    setError("");
  };
  const evidence = current.rows
    .filter((row) => current.after.decisive.includes(row.event_id))
    .sort((a, b) => a.received_at.localeCompare(b.received_at))[0];
  return (
    <div className="dc-app">
      <header className="dc-header">
        <div className="dc-brand">
          <span>DataCoda</span>
          <small>Étude indépendante · Données fictives</small>
        </div>
        <div className="dc-actions">
          <a className="dc-button" href="#dc-files">
            Importer
          </a>
          <button
            disabled={!history.canUndo || isDirty}
            onClick={() => {
              history.undo();
              setError("");
              setNotice("Dernière modification annulée.");
            }}
          >
            Annuler
          </button>
          <button
            disabled={!history.canRedo || isDirty}
            onClick={() => {
              history.redo();
              setError("");
              setNotice("Modification rétablie.");
            }}
          >
            Rétablir
          </button>
          <a className="dc-button dc-primary" href="#dc-delivery">
            Exporter
          </a>
        </div>
      </header>
      <main>
        <div className="dc-intro">
          <h1>Rejouer avant de relancer</h1>
          <p>
            Une réponse arrivée entre la préparation et le contrôle change la
            décision.
          </p>
          <p className="dc-first-step">
            Avancez la réception de la réponse à 08:59 UTC. Elle sera alors
            connue dès la préparation.
          </p>
        </div>
        <WindowForm
          key={state.preparedAt + state.checkedAt}
          state={state}
          onDirty={(value) => editFlag("window", value)}
          onSave={(a, b) =>
            commit(
              () => changeWindow(state, a, b),
              "window",
              "Historique rejoué aux deux instants enregistrés.",
            )
          }
        />
        {error && (
          <div className="dc-error" role="alert">
            {error}
          </div>
        )}
        {isDirty && (
          <div className="dc-pending" role="status">
            Une saisie est en cours. Les décisions reflètent les valeurs
            enregistrées ; les téléchargements attendent votre validation.
          </div>
        )}
        <div className="dc-notice" role="status">
          {notice}
        </div>
        <nav className="dc-tabs" aria-label="Devis du journal">
          {groups.map((group) => (
            <button
              key={group.key}
              aria-pressed={group.key === current.key}
              onClick={() => pickGroup(group.key)}
            >
              {group.dossier}
              <span>{group.devis}</span>
              {group.withdrawn && (
                <span className="dc-tab-dot" aria-label="Décision changée" />
              )}
            </button>
          ))}
        </nav>
        <div className="dc-workspace">
          <section className="dc-journal">
            <div className="dc-section-title">
              <h2>Journal des réceptions</h2>
              <span>
                {current.rows.length} réceptions ·{" "}
                {uniqueEvents(current.rows).length} événements
              </span>
            </div>
            <p className="dc-section-help">
              Ordre d’arrivée dans le système. Sélectionnez une réception pour
              l’examiner.
            </p>
            <div
              className="dc-scroll"
              role="region"
              aria-label="Journal défilant"
              tabIndex="0"
            >
              <table>
                <thead>
                  <tr>
                    <th>Survenue · UTC</th>
                    <th>Réception · UTC</th>
                    <th>Événement</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, index) => {
                    const duplicate = sorted
                      .slice(0, index)
                      .some((other) => other.event_id === row.event_id);
                    const known = row.received_at <= state.checkedAt;
                    return (
                      <tr
                        key={row.delivery_id}
                        className={`${row.delivery_id === selected.delivery_id ? "dc-selected " : ""}${!known ? "dc-future" : ""}`}
                      >
                        <td>
                          <time dateTime={row.occurred_at}>
                            {display(row.occurred_at)}
                          </time>
                        </td>
                        <td>
                          <time dateTime={row.received_at}>
                            {display(row.received_at)}
                          </time>
                          {!known && <small>Après le contrôle</small>}
                        </td>
                        <td>
                          <button
                            className="dc-event-button"
                            onClick={() => pickRow(row.delivery_id)}
                            aria-label={`Examiner ${row.delivery_id} ${EVENT_TYPES[row.type]}`}
                          >
                            {EVENT_TYPES[row.type]}
                          </button>
                          <small>
                            {row.event_id} · {row.delivery_id}
                            {duplicate ? " · Copie technique" : ""}
                          </small>
                          {row.received_at > state.preparedAt &&
                            row.received_at <= state.checkedAt && (
                              <span className="dc-between">
                                Reçue entre les deux instants
                              </span>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="dc-journal-note">
              <span className="dc-line-symbol" aria-hidden="true" />
              <p>
                Une seule réponse, deux réceptions possibles. L’identifiant
                d’événement sert à reconnaître la reprise.
              </p>
            </div>
          </section>
          <section
            className="dc-inspector"
            aria-label="Décisions et correction"
          >
            <h2>Impact sur la décision</h2>
            <div className="dc-decisions">
              <Decision value={current.before} title="À la préparation" />
              <Decision value={current.after} title="Au contrôle" />
            </div>
            <div className="dc-evidence">
              <strong>
                {current.withdrawn
                  ? "Relance écartée au contrôle"
                  : current.changed
                    ? "Décision modifiée"
                    : "Décision conservée"}
              </strong>
              <p>
                {evidence
                  ? `${EVENT_TYPES[evidence.type]} · ${evidence.event_id}. Survenue ${display(evidence.occurred_at)}, reçue ${display(evidence.received_at)} UTC.`
                  : "Le dossier ne comporte pas encore d’événement déterminant connu."}
              </p>
              {current.newEvents.length > 0 && (
                <small>
                  Événements nouvellement connus :{" "}
                  {current.newEvents.join(", ")}.
                </small>
              )}
            </div>
            <EventForm
              key={JSON.stringify(selected)}
              event={selected}
              copies={
                current.rows.filter((row) => row.event_id === selected.event_id)
                  .length
              }
              onDirty={(value) => editFlag("event", value)}
              onSave={(id, patch) =>
                commit(
                  () => updateEvent(state, id, patch),
                  "event",
                  "Événement enregistré et décisions recalculées.",
                )
              }
            />
          </section>
        </div>
        <section className="dc-comparison">
          <div className="dc-section-title">
            <h2>Comparer tout le lot</h2>
            <span>
              {groups.length} devis ·{" "}
              {groups.filter((group) => group.withdrawn).length} relance(s)
              écartée(s) au contrôle
            </span>
          </div>
          <div
            className="dc-scroll"
            role="region"
            aria-label="Comparaison défilante des devis"
            tabIndex="0"
          >
            <table>
              <thead>
                <tr>
                  <th>Dossier et devis</th>
                  <th>À la préparation</th>
                  <th>Au contrôle</th>
                  <th>Événement déterminant</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.key}>
                    <td>
                      <button
                        className="dc-event-button"
                        onClick={() => pickGroup(group.key)}
                      >
                        {group.dossier} · {group.devis}
                      </button>
                    </td>
                    <td>{group.before.label}</td>
                    <td className={group.withdrawn ? "dc-change-text" : ""}>
                      {group.after.label}
                    </td>
                    <td>{group.after.decisive.join(", ") || "Devis absent"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <details className="dc-rules">
          <summary>Règles de cette recette</summary>
          <p>
            Délais calendaires en heures, sans calendrier de jours ouvrés. Une
            réponse, une acceptation ou une annulation connue suspend la
            relance. Chaque version de devis doit posséder une clé distincte.
          </p>
          <PolicyForm
            key={JSON.stringify(state.policy)}
            policy={state.policy}
            onDirty={(value) => editFlag("policy", value)}
            onSave={(policy) =>
              commit(
                () => changePolicy(state, policy),
                "policy",
                "Règles appliquées à tous les devis.",
              )
            }
          />
          <p>
            À survenue identique, le devis précède les relances, puis les
            réponses, acceptations et annulations. Le calcul est indépendant de
            l’ordre des lignes du fichier. Les heures de réception décident de
            ce qui est connu à chaque instant.
          </p>
        </details>
        <section className="dc-delivery" id="dc-delivery">
          <div>
            <h2>Exporter la recette</h2>
            <p>
              Toutes les décisions, y compris celles qui bloquent la relance.
              Aucun message envoyé.
            </p>
          </div>
          <div className="dc-actions">
            <button
              disabled={isDirty}
              onClick={() =>
                emit(
                  () =>
                    downloadCsv(
                      "datacoda-decisions.csv",
                      DECISION_HEADERS,
                      decisionRows(state),
                    ),
                  "Décisions du lot téléchargées.",
                )
              }
            >
              Décisions CSV
            </button>
            <button
              disabled={isDirty}
              onClick={() =>
                emit(
                  () =>
                    downloadReport(
                      "datacoda-recette.html",
                      evidenceReport(state),
                    ),
                  "Rapport avec événements sources téléchargé.",
                )
              }
            >
              Rapport HTML
            </button>
            <button
              disabled={isDirty}
              onClick={() =>
                emit(
                  () => downloadJson("datacoda-dossier.json", state),
                  "Dossier de reprise téléchargé.",
                )
              }
            >
              Dossier JSON
            </button>
          </div>
        </section>
        <section className="dc-files" id="dc-files">
          <h2>Charger un historique</h2>
          <p>
            CSV à sept colonnes, jusqu’à 500 réceptions. Horodatages UTC avec
            secondes. Le dossier JSON contient aussi les règles et les deux
            instants du rejeu.
          </p>
          <div className="dc-actions">
            <Upload
              label="Importer les réceptions CSV"
              accept=".csv,text/csv"
              disabled={isDirty}
              onFile={(file) => inspectFile(file, "csv")}
            />
            <Upload
              label="Reprendre un dossier JSON"
              accept=".json,application/json"
              disabled={isDirty}
              onFile={(file) => inspectFile(file, "json")}
            />
            <button
              onClick={() =>
                downloadCsv("datacoda-exemple.csv", HEADERS, seed.events)
              }
            >
              Exemple CSV
            </button>
            <button
              disabled={isDirty}
              onClick={() => {
                history.reset();
                setSelectedKey(pairKey(seed.events[0]));
                setDelivery("L-002");
                setNotice("Exemple initial restauré.");
                setError("");
              }}
            >
              Revoir l’exemple
            </button>
          </div>
          <p className="dc-local-note">
            Le dossier enregistré est conservé dans ce navigateur
            {history.storageAvailable
              ? "."
              : " uniquement pour cette session, le stockage local étant indisponible."}{" "}
            Pas de connexion à Companion, à une messagerie ou à un agenda.
          </p>
        </section>
        {preview && (
          <div className="dc-modal-backdrop">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="dc-preview-title"
              className="dc-preview"
              onKeyDown={(event) => {
                if (event.key === "Escape") setPreview(null);
                if (event.key === "Tab") {
                  const controls = Array.from(
                    event.currentTarget.querySelectorAll("button"),
                  );
                  const first = controls[0],
                    last = controls.at(-1);
                  if (event.shiftKey && event.target === first) {
                    event.preventDefault();
                    last.focus();
                  } else if (!event.shiftKey && event.target === last) {
                    event.preventDefault();
                    first.focus();
                  }
                }
              }}
            >
              <h2 id="dc-preview-title">Vérifier avant de remplacer</h2>
              <p>
                {preview.name} · {preview.state.events.length} réceptions,{" "}
                {replay(preview.state).length} devis.
              </p>
              <p>
                {preview.kind === "csv"
                  ? "Les règles et les deux instants actuels seront conservés."
                  : "Les règles et les deux instants seront repris depuis ce dossier."}{" "}
                Vous pourrez annuler ce remplacement.
              </p>
              <ul>
                {preview.state.events.slice(0, 4).map((event) => (
                  <li key={event.delivery_id}>
                    {event.dossier} · {event.devis} · {EVENT_TYPES[event.type]}
                  </li>
                ))}
              </ul>
              <div className="dc-actions">
                <button
                  className="dc-primary"
                  onClick={() => {
                    history.set(preview.state);
                    setPreview(null);
                    setError("");
                    setNotice("Historique remplacé après vérification.");
                  }}
                >
                  Confirmer le remplacement
                </button>
                <button autoFocus onClick={() => setPreview(null)}>
                  Conserver le dossier actuel
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
      <DemoFooter />
    </div>
  );
}

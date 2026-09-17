import React, { useState } from "react";
import "@fontsource/oswald/400.css";
import "@fontsource/oswald/600.css";
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
  CHANNELS,
  SCOPES,
  FIELDS,
  SESSION_HEADERS,
  SNAPSHOT_HEADERS,
  CORRECTION_HEADERS,
  MAX_BYTES,
  seed,
  compare,
  showMinutes,
  durationText,
  editSession,
  editSnapshot,
  associate,
  decide,
  removeDecision,
  importCsv,
  restore,
  sessionRows,
  snapshotRows,
  correctionRows,
  reviewReport,
  draftText,
} from "./model.js";
import "./styles.css";

const dateLabel = (value) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value + "T12:00:00Z"));
const stampLabel = (value) =>
  `${dateLabel(value.slice(0, 10))}, ${value.slice(11, 16)} UTC`;
const classStatus = (status) =>
  ["same", "exception"].includes(status)
    ? "fc-calm"
    : status === "prepared"
      ? "fc-prepared"
      : ["scope", "stale", "unmapped"].includes(status)
        ? "fc-amber"
        : "fc-red";
function StateLabel({ value }) {
  return <span className={classStatus(value.status)}>{value.label}</span>;
}

function Matrix({
  state,
  selected,
  selectedSession,
  onSelect,
  onEdit,
  locked,
}) {
  const [filter, setFilter] = useState("all");
  const sessions = state.sessions.filter(
    (s) =>
      filter === "all" ||
      state.snapshots.some(
        (o) =>
          o.sessionId === s.id &&
          (filter === "stale"
            ? compare(state, o).stale
            : ["scope", "difference"].includes(compare(state, o).status)),
      ),
  );
  return (
    <section className="fc-programme">
      <h1>Une séance, plusieurs supports</h1>
      <p className="fc-lead">
        Décalez un horaire, puis repérez les relevés à actualiser.
      </p>
      <div className="fc-matrix-toolbar">
        <span>Tournée de démonstration</span>
        <label>
          Filtrer les relevés
          <select
            value={filter}
            disabled={locked}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Tous les relevés</option>
            <option value="review">Écarts à relire</option>
            <option value="stale">Relevés anciens</option>
          </select>
        </label>
        <button
          className="fc-primary"
          disabled={locked || !selectedSession}
          onClick={() => onEdit("session", selectedSession.id)}
        >
          Modifier la séance
        </button>
      </div>
      <p className="fc-scroll-hint">
        Faites défiler le tableau pour voir les trois canaux.
      </p>
      <div
        className="fc-matrix-scroll"
        role="region"
        aria-label="Séances et canaux, tableau défilant"
        tabIndex="0"
      >
        <table className="fc-matrix">
          <thead>
            <tr>
              <th>Séance</th>
              <th>
                Programme<small>Référence déclarée</small>
              </th>
              {Object.values(CHANNELS).map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr
                key={s.id}
                className={
                  selectedSession?.id === s.id ? "fc-row-selected" : ""
                }
              >
                <th scope="row">
                  <button
                    disabled={locked}
                    className="fc-session-link"
                    onClick={() => onSelect(null, s.id)}
                  >
                    {s.id}
                  </button>
                  <span>
                    {s.city} · {dateLabel(s.date)}
                  </span>
                </th>
                <td>
                  <button
                    disabled={locked}
                    className="fc-reference-link"
                    onClick={() => onEdit("session", s.id)}
                  >
                    <strong>{s.time}</strong>
                    <span>{s.venue}</span>
                  </button>
                </td>
                {Object.keys(CHANNELS).map((channel) => {
                  const list = state.snapshots.filter(
                    (o) => o.sessionId === s.id && o.channel === channel,
                  );
                  return (
                    <td key={channel}>
                      {list.length ? (
                        list.map((o) => (
                          <button
                            key={o.id}
                            disabled={locked}
                            className={`fc-listing ${selected === o.id ? "fc-listing-selected" : ""}`}
                            aria-pressed={selected === o.id}
                            onClick={() => onSelect(o.id, s.id)}
                            aria-label={`Ouvrir ${CHANNELS[channel]} ${s.id} ${o.partnerRef}`}
                          >
                            <strong>{o.time}</strong>
                            <StateLabel value={compare(state, o)} />
                            {list.length > 1 && <small>{o.partnerRef}</small>}
                          </button>
                        ))
                      ) : (
                        <span className="fc-muted">Pas de relevé</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!sessions.length && (
        <p className="fc-empty">Aucune séance dans ce filtre.</p>
      )}
      <p className="fc-caption">
        Heures locales déclarées. Les relevés portent sur les dates de collecte
        indiquées, sans contrôle du site actuel.
      </p>
    </section>
  );
}

function Unmatched({ state, run, locked, onSelect }) {
  const items = state.snapshots.filter((o) => o.sessionId === null);
  return (
    <section className="fc-unmatched">
      <h2>Références à rapprocher</h2>
      {items.length ? (
        items.map((o) => (
          <form
            key={o.id}
            onSubmit={(e) => {
              e.preventDefault();
              const id = new FormData(e.currentTarget).get("session");
              if (
                run(
                  () => associate(state, o.id, id),
                  "Référence associée à la séance choisie.",
                )
              )
                onSelect(o.id, id);
            }}
          >
            <div>
              <strong>{o.partnerRef}</strong>
              <span>
                {CHANNELS[o.channel]} · {o.date} · {o.time}
              </span>
              <small>{o.venue}</small>
            </div>
            <label>
              <span className="fc-visually-hidden">
                Associer {o.partnerRef} à une séance
              </span>
              <select name="session" required defaultValue="" disabled={locked}>
                <option value="" disabled>
                  Choisir une séance…
                </option>
                {state.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.city} · {s.date} · {s.time}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={locked} type="submit">
              Associer
            </button>
          </form>
        ))
      ) : (
        <p>Toutes les références ont une séance déclarée.</p>
      )}
      <p className="fc-caption">
        Le titre ou la ville ne suffisent pas à associer une référence. Le choix
        reste explicite.
      </p>
    </section>
  );
}

function RecordEditor({ kind, record, state, run, close }) {
  const [draft, setDraft] = useState({ ...record });
  const set = (key) => (e) =>
    setDraft((v) => ({ ...v, [key]: e.target.value }));
  const isSession = kind === "session";
  return (
    <form
      className="fc-record-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const next = {
          ...draft,
          duration: draft.duration === "" ? null : draft.duration,
          intermission: draft.intermission === "" ? null : draft.intermission,
        };
        if (
          run(
            () =>
              isSession
                ? editSession(state, record.id, next)
                : editSnapshot(state, record.id, next),
            isSession
              ? "Programme modifié. Les décisions et l’ancienneté des relevés ont été recalculées."
              : "Transcription enregistrée. Les décisions liées aux anciennes valeurs sont retirées.",
          )
        )
          close();
      }}
    >
      <h2>{isSession ? "Modifier le programme" : "Revoir la transcription"}</h2>
      <p>
        {record.id}
        {!isSession && ` · ${record.partnerRef}`}
      </p>
      {isSession ? (
        <>
          <label>
            Titre
            <input
              value={draft.title}
              onChange={set("title")}
              maxLength="160"
              required
            />
          </label>
          <label>
            Ville
            <input
              value={draft.city}
              onChange={set("city")}
              maxLength="100"
              required
            />
          </label>
        </>
      ) : (
        <label>
          Source déclarée
          <input
            value={draft.source}
            onChange={set("source")}
            maxLength="300"
            required
          />
        </label>
      )}
      <div className="fc-form-pair">
        <label>
          Date locale
          <input
            type="date"
            value={draft.date}
            onChange={set("date")}
            required
          />
        </label>
        <label>
          Heure locale
          <input
            type="time"
            value={draft.time}
            onChange={set("time")}
            required
          />
        </label>
      </div>
      <label>
        Salle
        <input
          value={draft.venue}
          onChange={set("venue")}
          maxLength="160"
          required
        />
      </label>
      <div className="fc-form-pair">
        <label>
          Durée annoncée, min
          <input
            inputMode="numeric"
            value={draft.duration ?? ""}
            onChange={set("duration")}
            placeholder="Inconnue"
          />
        </label>
        <label>
          Entracte, min
          <input
            inputMode="numeric"
            value={draft.intermission ?? ""}
            onChange={set("intermission")}
            placeholder="Inconnu"
          />
        </label>
      </div>
      <label>
        Périmètre de la durée
        <select value={draft.scope} onChange={set("scope")}>
          {Object.entries(SCOPES).map(([key, value]) => (
            <option key={key} value={key}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        {isSession
          ? "Modification du programme, UTC"
          : "Collecte du relevé, UTC"}
        <input
          value={isSession ? draft.updatedAt : draft.collectedAt}
          onChange={set(isSession ? "updatedAt" : "collectedAt")}
          required
          placeholder="2027-02-01T14:00:00Z"
        />
      </label>
      <p className="fc-caption">
        {isSession
          ? "Avancez l’horodatage si vous changez la séance. Les relevés antérieurs devront être actualisés."
          : "Recopiez une collecte vérifiée et sa date. Changer ce champ ne consulte aucun site."}
      </p>
      <div className="fc-form-actions">
        <button type="button" onClick={close}>
          Abandonner
        </button>
        <button className="fc-primary" type="submit">
          Enregistrer {isSession ? "la séance" : "le relevé"}
        </button>
      </div>
    </form>
  );
}

function DecisionForm({ state, observation, comparison, run, onDirty, dirty }) {
  const rows = comparison.rows.filter((r) => r.actionable),
    [field, setField] = useState(rows[0]?.field || ""),
    [action, setAction] = useState("correction"),
    [note, setNote] = useState(""),
    [by, setBy] = useState("");
  if (!rows.length) return null;
  const chosen = rows.find((r) => r.field === field) || rows[0];
  function dirtySet(fn, value) {
    fn(value);
    onDirty(true);
  }
  function clear() {
    setNote("");
    setBy("");
    onDirty(false);
  }
  return (
    <form
      className="fc-decision"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          run(
            () => decide(state, observation.id, chosen.field, action, note, by),
            "Décision enregistrée pour ce champ et ces valeurs.",
          )
        )
          clear();
      }}
    >
      <h3>Décision sur un écart</h3>
      <label>
        Champ à traiter
        <select
          value={chosen.field}
          onChange={(e) => dirtySet(setField, e.target.value)}
        >
          {rows.map((r) => (
            <option key={r.field} value={r.field}>
              {r.name} · {r.from} / {r.to}
            </option>
          ))}
        </select>
      </label>
      <label>
        Décision
        <select
          value={action}
          onChange={(e) => dirtySet(setAction, e.target.value)}
        >
          <option value="correction">Correction à préparer</option>
          <option value="exception">Exception locale à conserver</option>
        </select>
      </label>
      <label>
        Motif de la décision
        <textarea
          value={note}
          onChange={(e) => dirtySet(setNote, e.target.value)}
          minLength="10"
          maxLength="500"
          required
          placeholder="Ce qui justifie la correction ou l’exception."
        />
      </label>
      <label>
        Relecteur
        <input
          value={by}
          onChange={(e) => dirtySet(setBy, e.target.value)}
          minLength="2"
          maxLength="60"
          required
          placeholder="Nom ou rôle fictif"
        />
      </label>
      <button className="fc-primary" type="submit">
        Enregistrer la décision
      </button>
      {dirty && (
        <button className="fc-discard" type="button" onClick={clear}>
          Abandonner la saisie
        </button>
      )}
    </form>
  );
}

function Inspector({
  state,
  observation,
  selectedSession,
  run,
  onEdit,
  dirty,
  setDirty,
}) {
  if (!observation)
    return (
      <aside className="fc-inspector">
        <h2>{selectedSession?.id || "Choisir une séance"}</h2>
        <p>
          Sélectionnez un relevé dans la matrice pour comparer ses valeurs au
          programme.
        </p>
        {selectedSession && (
          <button
            className="fc-primary"
            onClick={() => onEdit("session", selectedSession.id)}
          >
            Modifier cette séance
          </button>
        )}
      </aside>
    );
  const c = compare(state, observation);
  return (
    <aside className="fc-inspector">
      <h2>
        {CHANNELS[observation.channel]} ·{" "}
        {observation.sessionId || observation.partnerRef}
      </h2>
      <p className="fc-source-date">
        Relevé du {stampLabel(observation.collectedAt)}
      </p>
      <p className="fc-muted">
        Programme{" "}
        {c.session
          ? `modifié le ${stampLabel(c.session.updatedAt)}`
          : "non rapproché"}
      </p>
      <p className="fc-caption">
        {observation.source} · {observation.partnerRef}
      </p>
      {c.stale && (
        <div className="fc-age-warning">
          <strong>Relevé ancien</strong>
          <p>
            Cette collecte précède la modification du programme. Actualisez sa
            transcription avant de préparer une correction.
          </p>
        </div>
      )}
      <div className="fc-comparison-scroll">
        <table className="fc-comparison">
          <thead>
            <tr>
              <th>Champ</th>
              <th>Relevé</th>
              <th>Programme</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.field}>
                <th scope="row">{r.name}</th>
                <td className={r.different ? "fc-red" : ""}>
                  {r.field === "duration" ? durationText(observation) : r.from}
                </td>
                <td>
                  {r.field === "duration" ? durationText(c.session) : r.to}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="fc-duration-note">
        <h3>Périmètre de la durée</h3>
        <p>
          {showMinutes(observation) === null
            ? "Le relevé ne permet pas encore de comparer la durée de spectacle."
            : observation.scope === "total"
              ? `${observation.duration} − ${observation.intermission} = ${showMinutes(observation)} min de spectacle.`
              : `${showMinutes(observation)} min de spectacle déclarées.`}
        </p>
        <p className="fc-caption">
          Les déclarations d’entracte et de périmètre se modifient dans la
          transcription, puis s’enregistrent.
        </p>
        <button
          disabled={dirty}
          onClick={() => onEdit("snapshot", observation.id)}
        >
          Revoir la transcription
        </button>
      </section>
      {c.rows.some((r) => r.decision) && (
        <section className="fc-existing-decisions">
          <h3>Décisions conservées</h3>
          {c.rows
            .filter((r) => r.decision)
            .map((r) => (
              <div key={r.field}>
                <strong>
                  {r.name} ·{" "}
                  {r.decision.action === "correction"
                    ? "correction préparée"
                    : "exception locale"}
                </strong>
                <p>{r.decision.note}</p>
                <small>{r.decision.by}</small>
                <button
                  disabled={dirty}
                  onClick={() =>
                    run(
                      () => removeDecision(state, observation.id, r.field),
                      "Décision retirée.",
                    )
                  }
                >
                  Retirer · {r.name}
                </button>
              </div>
            ))}
        </section>
      )}
      <DecisionForm
        key={JSON.stringify([observation, c.session])}
        state={state}
        observation={observation}
        comparison={c}
        run={run}
        onDirty={setDirty}
        dirty={dirty}
      />
      {!c.rows.some((r) => r.actionable) && (
        <p className="fc-inspector-empty">
          {c.stale
            ? "Aucune décision de correction possible sur ce relevé ancien."
            : c.rows.some((r) => !r.comparable)
              ? "Précisez le périmètre de la durée pour terminer le rapprochement."
              : "Les valeurs comparables concordent avec le programme."}
        </p>
      )}
    </aside>
  );
}

function Corrections({ state, act }) {
  const rows = correctionRows(state),
    undecided = state.snapshots.filter((o) =>
      ["stale", "scope", "unmapped", "difference"].includes(
        compare(state, o).status,
      ),
    );
  return (
    <section className="fc-corrections">
      <h1>Corrections préparées</h1>
      <p className="fc-lead">
        Seules les décisions actuelles sur un relevé récent figurent dans ce
        lot.
      </p>
      <div className="fc-output-layout">
        <div>
          <p className="fc-scroll-hint">
            Faites défiler le tableau pour voir les valeurs et la relecture.
          </p>
          <div
            className="fc-output-table"
            role="region"
            aria-label="Corrections préparées, tableau défilant"
            tabIndex="0"
          >
            <table>
              <thead>
                <tr>
                  <th>Canal et référence</th>
                  <th>Séance</th>
                  <th>Champ</th>
                  <th>Relevé</th>
                  <th>Programme</th>
                  <th>Relecture</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r[0] + r[4]}>
                    <th scope="row">
                      {r[1]}
                      <small>{r[2]}</small>
                    </th>
                    <td>{r[3]}</td>
                    <td>{r[4]}</td>
                    <td>{r[5]}</td>
                    <td>{r[6]}</td>
                    <td>
                      {r[9]}
                      <small>{r[10]}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <p className="fc-empty">
              Aucune correction décidée et actuelle. Choisissez un écart
              comparable dans les relevés.
            </p>
          )}
          <h2>Relevés encore ouverts</h2>
          <ul className="fc-open-items">
            {undecided.map((o) => (
              <li key={o.id}>
                <strong>
                  {CHANNELS[o.channel]} · {o.partnerRef}
                </strong>
                <StateLabel value={compare(state, o)} />
              </li>
            ))}
          </ul>
        </div>
        <aside className="fc-output-actions">
          <h2>Préparer la transmission</h2>
          <p>
            Les sources, dates et valeurs sont conservées dans les exports.
            Aucun partenaire n’est contacté.
          </p>
          <button
            className="fc-primary"
            disabled={!rows.length}
            onClick={() =>
              act(
                () =>
                  downloadCsv(
                    "franceconcert-corrections.csv",
                    CORRECTION_HEADERS,
                    rows,
                  ),
                "Corrections CSV téléchargées.",
              )
            }
          >
            Exporter les corrections CSV
          </button>
          <button
            onClick={() =>
              act(
                () =>
                  downloadReport(
                    "franceconcert-relecture.html",
                    reviewReport(state),
                  ),
                "Compte rendu HTML téléchargé.",
              )
            }
          >
            Exporter le compte rendu HTML
          </button>
          <button
            onClick={() =>
              act(
                () =>
                  downloadText("franceconcert-demandes.txt", draftText(state)),
                "Brouillon TXT téléchargé.",
              )
            }
          >
            Télécharger les demandes TXT
          </button>
          <p className="fc-caption">
            Le compte rendu inclut les réserves et les exceptions. Le CSV ne
            contient que les corrections préparées.
          </p>
        </aside>
      </div>
    </section>
  );
}

function Imports({ state, run, act }) {
  async function ingest(file, kind) {
    const raw = await readLocalFile(file, { maxBytes: MAX_BYTES });
    run(
      () => (kind === "json" ? restore(raw) : importCsv(state, raw, kind)),
      kind === "json"
        ? "Dossier restauré depuis le JSON."
        : "CSV importé. Les identifiants absents du fichier sont conservés.",
    );
  }
  return (
    <section className="fc-imports">
      <h2>Importer des relevés ou un programme</h2>
      <p>
        Un fichier invalide est refusé en entier. Le CSV met à jour les
        identifiants présents ; le JSON remplace le dossier. Une collecte
        ancienne ne remplace pas une collecte plus récente.
      </p>
      <div className="fc-import-columns">
        <section>
          <h3>Programme CSV</h3>
          <FileImport
            label="Choisir le programme CSV"
            onFile={(f) => ingest(f, "sessions")}
          />
          <button
            onClick={() =>
              act(
                () =>
                  downloadCsv(
                    "franceconcert-programme-exemple.csv",
                    SESSION_HEADERS,
                    sessionRows(seed()),
                  ),
                "Exemple de programme téléchargé.",
              )
            }
          >
            Exemple de programme
          </button>
          <p className="fc-caption">{SESSION_HEADERS.join(", ")}</p>
        </section>
        <section>
          <h3>Relevés CSV</h3>
          <FileImport
            label="Choisir les relevés CSV"
            onFile={(f) => ingest(f, "snapshots")}
          />
          <button
            onClick={() =>
              act(
                () =>
                  downloadCsv(
                    "franceconcert-releves-exemple.csv",
                    SNAPSHOT_HEADERS,
                    snapshotRows(seed()),
                  ),
                "Exemple de relevés téléchargé.",
              )
            }
          >
            Exemple de relevés
          </button>
          <p className="fc-caption">{SNAPSHOT_HEADERS.join(", ")}</p>
        </section>
        <section>
          <h3>Dossier complet</h3>
          <FileImport
            label="Reprendre le dossier JSON"
            accept=".json,application/json"
            onFile={(f) => ingest(f, "json")}
          />
          <p className="fc-caption">
            Jusqu’à 100 séances et 400 relevés. Limite globale 5 Mio. Le JSON
            conserve les décisions actuelles.
          </p>
        </section>
      </div>
      <p className="fc-caption">
        Canaux direct, reseau_a, reseau_b. Périmètres show (hors entracte),
        total (entracte inclus), unknown. Durée ou entracte vide = inconnu.
        Horodatages UTC au format 2027-02-01T13:00:00Z. Séance vide = référence
        à rapprocher.
      </p>
    </section>
  );
}

export default function App() {
  useDocumentTitle("FranceConcert · Relecture des supports");
  const history = useHistory(seed),
    state = history.value;
  const [tab, setTab] = useState("programme"),
    [selected, setSelected] = useState("R1-2"),
    [sessionId, setSessionId] = useState("FC-201"),
    [editor, setEditor] = useState(null),
    [dirty, setDirty] = useState(false),
    [imports, setImports] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const observation = state.snapshots.find((o) => o.id === selected),
    selectedSession =
      state.sessions.find(
        (s) => s.id === (observation?.sessionId || sessionId),
      ) || state.sessions[0],
    locked = Boolean(editor || dirty);
  function run(fn, message) {
    try {
      history.set(fn());
      setError("");
      setNotice(message);
      return true;
    } catch (e) {
      setError(e.message);
      setNotice("");
      return false;
    }
  }
  function act(fn, message) {
    try {
      fn();
      setError("");
      setNotice(message);
    } catch (e) {
      setError(e.message);
      setNotice("");
    }
  }
  function choose(id, sid) {
    setSelected(id);
    setSessionId(sid);
    setError("");
    setNotice("");
  }
  function onEdit(kind, id) {
    setEditor({ kind, id });
    setError("");
    setNotice("");
  }
  function closeEditor() {
    setEditor(null);
    setError("");
  }
  return (
    <div className="franceconcert-app">
      <header className="fc-header">
        <div className="fc-brand">
          <strong>FranceConcert</strong>
          <span>Relecture des supports</span>
        </div>
        <nav aria-label="Vues de relecture">
          <button
            disabled={locked}
            aria-current={tab === "programme" ? "page" : undefined}
            onClick={() => setTab("programme")}
          >
            Programme & relevés
          </button>
          <button
            disabled={locked}
            aria-current={tab === "corrections" ? "page" : undefined}
            onClick={() => setTab("corrections")}
          >
            Corrections préparées
          </button>
        </nav>
        <span className="fc-fictive">Exemple fictif</span>
      </header>
      <main>
        <div className="fc-feedback" aria-live="polite">
          {error ? (
            <p role="alert">{error}</p>
          ) : notice ? (
            <p>{notice}</p>
          ) : null}
        </div>
        {tab === "programme" ? (
          <div className="fc-workspace">
            <div className="fc-left">
              <Matrix
                state={state}
                selected={selected}
                selectedSession={selectedSession}
                onSelect={choose}
                onEdit={onEdit}
                locked={locked}
              />
              <Unmatched
                state={state}
                run={run}
                locked={locked}
                onSelect={choose}
              />
            </div>
            {editor ? (
              <aside className="fc-inspector">
                <RecordEditor
                  key={editor.kind + editor.id}
                  kind={editor.kind}
                  record={(editor.kind === "session"
                    ? state.sessions
                    : state.snapshots
                  ).find((r) => r.id === editor.id)}
                  state={state}
                  run={run}
                  close={closeEditor}
                />
              </aside>
            ) : (
              <Inspector
                state={state}
                observation={observation}
                selectedSession={selectedSession}
                run={run}
                onEdit={onEdit}
                dirty={dirty}
                setDirty={setDirty}
              />
            )}
          </div>
        ) : (
          <Corrections state={state} act={act} />
        )}
        {locked && (
          <p className="fc-editing-note">
            Enregistrez ou abandonnez la saisie pour changer de vue ou de
            relevé.
          </p>
        )}
        <div className="fc-toolbar">
          <button
            disabled={locked}
            aria-expanded={imports}
            onClick={() => setImports(!imports)}
          >
            Importer des CSV / reprendre
          </button>
          <button
            disabled={locked}
            onClick={() =>
              act(
                () => downloadJson("franceconcert-dossier.json", state),
                "Dossier JSON téléchargé.",
              )
            }
          >
            Enregistrer le dossier
          </button>
          <button
            disabled={locked || !history.canUndo}
            onClick={() => {
              history.undo();
              setError("");
              setNotice("Dernière modification annulée.");
            }}
          >
            Annuler
          </button>
          <button
            disabled={locked || !history.canRedo}
            onClick={() => {
              history.redo();
              setError("");
              setNotice("Modification rétablie.");
            }}
          >
            Rétablir
          </button>
          <button
            className="fc-reset"
            disabled={locked}
            onClick={() => {
              history.reset();
              choose("R1-2", "FC-201");
              setNotice(
                "Exemple initial rétabli. Annuler retrouve votre dossier.",
              );
            }}
          >
            Exemple initial
          </button>
        </div>
        {imports && !locked && <Imports state={state} run={run} act={act} />}
        <p className="fc-context">
          Données fictives. Aucun site partenaire modifié, aucun billet émis.
        </p>
      </main>
      <DemoFooter />
    </div>
  );
}

import React, { useState } from "react";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/600.css";
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
  assess,
  setLink,
  setActiveVersion,
  addObservation,
  editObservation,
  deleteObservation,
  addRecommendation,
  editRecommendation,
  review,
  restore,
  importCsv,
  observationRows,
  outputRows,
  report,
  retestText,
  KINDS,
  ROLES,
  IMPORT_HEADERS,
  OUTPUT_HEADERS,
  MAX_BYTES,
} from "./model.js";
import "./styles.css";

function Select({
  label,
  accessibleLabel,
  value,
  options,
  onChange,
  disabled,
}) {
  return (
    <label>
      {label}
      <select
        value={value}
        aria-label={accessibleLabel}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {Object.entries(options).map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
const opts = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.label]));
function NoteEditor({ state, note, taskId, onSave, onCancel, onDelete }) {
  const [draft, setDraft] = useState(
    note
      ? {
          sessionId: note.sessionId,
          taskId: note.taskId,
          kind: note.kind,
          text: note.text,
          source: note.source,
        }
      : {
          sessionId:
            state.sessions.find((s) => s.versionId === state.activeVersion)
              ?.id ||
            state.sessions[0]?.id ||
            "",
          taskId,
          kind: "observed",
          text: "",
          source: "",
        },
  );
  const change = (key, value) => setDraft((x) => ({ ...x, [key]: value }));
  return (
    <form
      className="n7-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <h2>{note ? `Modifier ${note.id}` : "Nouvelle note"}</h2>
      <p>
        Utilisez uniquement des notes fictives ou anonymisées. La nature de la
        note reste un choix explicite.
      </p>
      <Select
        label="Séance"
        value={draft.sessionId}
        options={Object.fromEntries(
          state.sessions.map((s) => [
            s.id,
            `${s.id} · ${s.participant} · ${s.versionId} · ${s.date}`,
          ]),
        )}
        onChange={(v) => change("sessionId", v)}
      />
      <Select
        label="Tâche de la note"
        value={draft.taskId}
        options={opts(state.tasks)}
        onChange={(v) => change("taskId", v)}
      />
      <Select
        label="Nature de la note"
        value={draft.kind}
        options={KINDS}
        onChange={(v) => change("kind", v)}
      />
      <label>
        Texte de la note
        <textarea
          required
          minLength={3}
          maxLength={2500}
          value={draft.text}
          onChange={(e) => change("text", e.target.value)}
        />
      </label>
      <label>
        Référence source
        <input
          required
          minLength={3}
          maxLength={500}
          value={draft.source}
          onChange={(e) => change("source", e.target.value)}
          placeholder="Note fictive de séance, passage ou référence"
        />
      </label>
      <div className="n7-actions">
        <button className="n7-primary" type="submit">
          Enregistrer la note
        </button>
        <button type="button" onClick={onCancel}>
          Abandonner
        </button>
        {note && (
          <button className="n7-remove" type="button" onClick={onDelete}>
            Retirer la note
          </button>
        )}
      </div>
      {note && (
        <p className="n7-muted">
          Retirer la note enlève ses citations et retire les relectures qui en
          dépendent. Annuler la restaure.
        </p>
      )}
    </form>
  );
}
function RecommendationEditor({
  state,
  recommendation,
  taskId,
  onSave,
  onCancel,
}) {
  const [draft, setDraft] = useState(
    recommendation
      ? {
          title: recommendation.title,
          taskId: recommendation.taskId,
          versionId: recommendation.versionId,
          text: recommendation.text,
        }
      : { title: "", taskId, versionId: state.activeVersion, text: "" },
  );
  const change = (key, value) => setDraft((x) => ({ ...x, [key]: value }));
  return (
    <form
      className="n7-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <h2>
        {recommendation
          ? "Modifier la recommandation"
          : "Nouvelle recommandation"}
      </h2>
      <label>
        Titre
        <input
          required
          maxLength={180}
          value={draft.title}
          onChange={(e) => change("title", e.target.value)}
        />
      </label>
      <Select
        label="Tâche de la recommandation"
        value={draft.taskId}
        options={opts(state.tasks)}
        onChange={(v) => change("taskId", v)}
      />
      <Select
        label="Version testée"
        value={draft.versionId}
        options={opts(state.versions)}
        onChange={(v) => change("versionId", v)}
      />
      <label>
        Proposition rédigée
        <textarea
          required
          minLength={3}
          maxLength={1500}
          value={draft.text}
          onChange={(e) => change("text", e.target.value)}
        />
      </label>
      <p className="n7-muted">
        Les anciennes citations restent visibles après un changement de version.
        Les appuis devront correspondre à la nouvelle tâche et version.
      </p>
      <div className="n7-actions">
        <button className="n7-primary" type="submit">
          Enregistrer la recommandation
        </button>
        <button type="button" onClick={onCancel}>
          Abandonner
        </button>
      </div>
    </form>
  );
}
function Recommendation({
  state,
  recommendation,
  selection,
  locked,
  editingBlocked,
  onSelect,
  onEdit,
  onOpenNote,
  onReview,
  onDirty,
}) {
  const [by, setBy] = useState(""),
    [rationale, setRationale] = useState(""),
    [dirty, setDirty] = useState(false);
  const change = (fn, value) => {
    fn(value);
    setDirty(true);
    onDirty(true);
  };
  if (!recommendation)
    return (
      <aside className="n7-recommendation">
        <h2>Recommandation</h2>
        <p>
          Aucune recommandation pour cette tâche. Ajoutez-en une pour relier les
          notes.
        </p>
        <button disabled={locked} onClick={() => onEdit(null)}>
          Ajouter une recommandation
        </button>
      </aside>
    );
  const a = assess(state, recommendation);
  return (
    <aside className="n7-recommendation">
      <h2>Recommandation</h2>
      <Select
        label="Proposition à examiner"
        value={recommendation.id}
        options={Object.fromEntries(
          selection.map((r) => [r.id, `${r.id} · ${r.title}`]),
        )}
        disabled={locked}
        onChange={onSelect}
      />
      <p className="n7-scope">
        Version testée <strong>{recommendation.versionId}</strong>
      </p>
      {a.toRetest && (
        <p className="n7-warning">
          À retester sur {state.activeVersion}. Les notes de{" "}
          {recommendation.versionId} restent historiques.
        </p>
      )}
      <p className="n7-proposition">{recommendation.text}</p>
      <button
        className="n7-wide"
        disabled={locked}
        onClick={() => onEdit(recommendation)}
      >
        Modifier la recommandation
      </button>
      <section className="n7-citations">
        <h3>Citations</h3>
        {a.citations.length ? (
          <ul>
            {a.citations.map((c) => (
              <li key={c.observation.id}>
                <div>
                  <button
                    disabled={locked}
                    className="n7-note-link"
                    onClick={() => onOpenNote(c.observation)}
                  >
                    {c.observation.id}
                  </button>
                  <strong>{ROLES[c.role]}</strong>
                  <span>
                    {c.session.versionId} · {c.session.participant}
                  </span>
                </div>
                <p>{c.observation.text}</p>
                <small>
                  {KINDS[c.observation.kind]} · {c.observation.source}
                  {!c.compatible ? " · Autre tâche ou version" : ""}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="n7-empty">Aucune observation citée.</p>
        )}
        {a.observations > 0 && (
          <p className="n7-count">
            {a.observations} observation{a.observations > 1 ? "s" : ""} d’appui
            · {a.sessions} séance{a.sessions > 1 ? "s" : ""} · {a.participants}{" "}
            participant{a.participants > 1 ? "s" : ""} unique
            {a.participants > 1 ? "s" : ""}
            <small>Décompte descriptif, sans portée représentative.</small>
          </p>
        )}
      </section>
      <section className="n7-review">
        <h3>{a.status}</h3>
        {recommendation.review ? (
          <>
            <p>
              <strong>{recommendation.review.by}</strong>
            </p>
            <p>{recommendation.review.rationale}</p>
            <p className="n7-muted">
              Relecture de la proposition sur {recommendation.versionId}. Une
              modification d’un texte cité retire cette relecture.
            </p>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (onReview({ by, rationale })) {
                setDirty(false);
                onDirty(false);
              }
            }}
          >
            <label>
              Relecteur
              <input
                required
                disabled={editingBlocked}
                minLength={2}
                maxLength={60}
                value={by}
                onChange={(e) => change(setBy, e.target.value)}
                placeholder="Nom ou rôle fictif"
              />
            </label>
            <label>
              Motif de relecture
              <textarea
                required
                disabled={editingBlocked}
                minLength={10}
                maxLength={600}
                value={rationale}
                onChange={(e) => change(setRationale, e.target.value)}
                placeholder="Expliquez la proposition et ses limites."
              />
            </label>
            <button
              className="n7-primary"
              disabled={editingBlocked || a.issues.length > 0}
            >
              Enregistrer la relecture
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setBy("");
                  setRationale("");
                  setDirty(false);
                  onDirty(false);
                }}
              >
                Abandonner la saisie
              </button>
            )}
            {a.issues.length > 0 && (
              <ul className="n7-review-issues">
                {a.issues.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </form>
        )}
      </section>
    </aside>
  );
}
function Restitution({ state, runExport }) {
  return (
    <section className="n7-restitution">
      <div className="n7-sheet">
        <h1>Restitution des tests</h1>
        <p className="n7-lead">
          {state.title} · Version de travail {state.activeVersion}
        </p>
        {state.recommendations.map((r) => {
          const a = assess(state, r);
          return (
            <article key={r.id}>
              <div className="n7-sheet-heading">
                <h2>{r.title}</h2>
                <span>
                  {r.id} · {r.versionId}
                </span>
              </div>
              <p className="n7-sheet-scope">
                {state.tasks.find((t) => t.id === r.taskId).label} · {a.status}
              </p>
              {a.toRetest && (
                <p className="n7-warning">
                  À retester sur {state.activeVersion}
                </p>
              )}
              <p className="n7-sheet-proposition">{r.text}</p>
              <p className="n7-count">
                {a.observations} observation{a.observations > 1 ? "s" : ""}{" "}
                d’appui, {a.sessions} séance{a.sessions > 1 ? "s" : ""},{" "}
                {a.participants} participant{a.participants > 1 ? "s" : ""}{" "}
                unique{a.participants > 1 ? "s" : ""}.{" "}
                <small>Décompte descriptif, sans portée représentative.</small>
              </p>
              {a.citations.length ? (
                <ol className="n7-source-list">
                  {a.citations.map((c) => (
                    <li key={c.observation.id}>
                      <strong>
                        {c.observation.id} · {ROLES[c.role]} ·{" "}
                        {KINDS[c.observation.kind]}
                      </strong>
                      <p>{c.observation.text}</p>
                      <small>
                        {c.session.id} · {c.session.participant} ·{" "}
                        {c.session.versionId} · {c.session.date}
                        <br />
                        {c.observation.source}
                      </small>
                      {!c.compatible && (
                        <small className="n7-warning">
                          Citation d’une autre tâche ou version.
                        </small>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="n7-empty">
                  Cette hypothèse ne cite aucune observation.
                </p>
              )}
              {r.review ? (
                <p className="n7-review-note">
                  <strong>{r.review.by}</strong>
                  <br />
                  {r.review.rationale}
                </p>
              ) : (
                <p className="n7-muted">
                  Proposition non relue pour cette version.
                </p>
              )}
              {a.issues.length > 0 && (
                <ul className="n7-review-issues">
                  {a.issues.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
        {!state.recommendations.length && (
          <p>Aucune recommandation dans ce carnet.</p>
        )}
      </div>
      <aside className="n7-output">
        <h2>Récupérer le travail</h2>
        <p>
          Les exports incluent les hypothèses et les contrepoints avec leur
          statut.
        </p>
        <button className="n7-primary" onClick={() => runExport("html")}>
          Télécharger la restitution HTML
        </button>
        <button onClick={() => runExport("csv")}>Exporter les liens CSV</button>
        <button onClick={() => runExport("txt")}>
          Télécharger le plan de retest TXT
        </button>
        <p className="n7-muted">
          Le plan liste les recommandations portant sur une autre version. Il
          n’exécute aucun test.
        </p>
        <h3>Versions à distinguer</h3>
        <p>
          Une relecture de v1 reste attachée à v1. La sélectionner comme
          historique ne prouve pas le comportement de v2.
        </p>
      </aside>
    </section>
  );
}
export default function App() {
  useDocumentTitle("Nova7 · Carnet de restitution");
  const history = useHistory(seed),
    state = history.value,
    [view, setView] = useState("carnet"),
    [taskId, setTaskId] = useState("T-01"),
    [selected, setSelected] = useState("R-01"),
    [editor, setEditor] = useState(null),
    [imports, setImports] = useState(false),
    [busy, setBusy] = useState(false),
    [reviewDirty, setReviewDirty] = useState(false),
    [feedback, setFeedback] = useState(null);
  const task = state.tasks.find((t) => t.id === taskId) || state.tasks[0],
    selection = state.recommendations.filter((r) => r.taskId === task.id),
    recommendation = selection.find((r) => r.id === selected) || selection[0],
    locked = !!editor || reviewDirty || busy;
  const notes = state.observations.filter(
    (o) =>
      o.taskId === task.id &&
      state.sessions.find((s) => s.id === o.sessionId)?.versionId ===
        state.activeVersion,
  );
  const act = (fn, message) => {
    try {
      const next = fn(state);
      history.set(next);
      setFeedback({ text: message, error: false });
      return next;
    } catch (e) {
      setFeedback({ text: e.message, error: true });
      return null;
    }
  };
  const openEditor = (kind, record) => {
    setImports(false);
    setEditor({ kind, record });
  };
  const saveNote = (changes) => {
    const next = act(
      (s) =>
        editor.record
          ? editObservation(s, editor.record.id, changes)
          : addObservation(s, changes),
      "Note enregistrée.",
    );
    if (next) setEditor(null);
  };
  const saveRecommendation = (changes) => {
    const next = act(
      (s) =>
        editor.record
          ? editRecommendation(s, editor.record.id, changes)
          : addRecommendation(s, changes),
      "Recommandation enregistrée.",
    );
    if (next) {
      setEditor(null);
      setTaskId(changes.taskId);
      setSelected(editor.record?.id || next.recommendations.at(-1).id);
    }
  };
  const load = async (kind, file) => {
    setBusy(true);
    try {
      const raw = await readLocalFile(file, { maxBytes: MAX_BYTES }),
        next = kind === "json" ? restore(raw) : importCsv(state, raw);
      history.set(next);
      setFeedback({
        text:
          kind === "json"
            ? "Carnet restauré."
            : "Observations intégrées. Les lignes absentes du CSV sont conservées.",
        error: false,
      });
    } catch (e) {
      setFeedback({ text: e.message, error: true });
    } finally {
      setBusy(false);
    }
  };
  const runExport = (kind) => {
    try {
      if (kind === "html")
        downloadReport("nova7-restitution.html", report(state));
      else if (kind === "csv")
        downloadCsv("nova7-liens.csv", OUTPUT_HEADERS, outputRows(state));
      else downloadText("nova7-retest.txt", retestText(state));
      setFeedback({
        text: "Export préparé depuis le carnet courant.",
        error: false,
      });
    } catch (e) {
      setFeedback({ text: e.message, error: true });
    }
  };
  return (
    <div className="nova7-app">
      <header className="n7-header">
        <strong>Nova7</strong>
        <nav aria-label="Vues du carnet">
          <button
            disabled={locked}
            aria-current={view === "carnet" ? "page" : undefined}
            onClick={() => setView("carnet")}
          >
            Carnet de restitution
          </button>
          <button
            disabled={locked}
            aria-current={view === "restitution" ? "page" : undefined}
            onClick={() => setView("restitution")}
          >
            Restitution
          </button>
        </nav>
        <span>Exemple fictif</span>
      </header>
      <main>
        {feedback && (
          <p
            className={`n7-feedback ${feedback.error ? "n7-error" : ""}`}
            role={feedback.error ? "alert" : "status"}
          >
            {feedback.text}
          </p>
        )}
        <div className="n7-top">
          <div>
            {view === "carnet" && (
              <>
                <h1>Garder le fil entre observation et recommandation</h1>
                <p className="n7-lead">
                Reliez deux observations, enregistrez une relecture, puis
                modifiez un appui.
                </p>
              </>
            )}
          </div>
          <div className="n7-toolbar">
            <Select
              label="Version de travail"
              value={state.activeVersion}
              options={opts(state.versions)}
              disabled={locked}
              onChange={(version) =>
                act(
                  (s) => setActiveVersion(s, version),
                  "Version de travail changée. Les relectures antérieures restent attachées à leur version.",
                )
              }
            />
            <button
              disabled={locked}
              aria-expanded={imports}
              onClick={() => setImports(!imports)}
            >
              Importer des observations
            </button>
            <button
              className="n7-primary"
              disabled={locked}
              onClick={() => downloadJson("nova7-carnet.json", state)}
            >
              Sauvegarder le dossier
            </button>
          </div>
        </div>
        {imports && (
          <section className="n7-imports">
            <h2>Notes anonymisées et carnet enregistré</h2>
            <p>
              Une séance garde le même participant, la même version et la même
              date. Les identifiants d’observation présents sont mis à jour, les
              autres notes restent dans le carnet.
            </p>
            <fieldset disabled={locked}>
              <div>
                <FileImport
                  label="Importer les notes CSV"
                  accept=".csv,text/csv"
                  onFile={(f) => load("csv", f)}
                />
                <button
                  onClick={() =>
                    downloadCsv(
                      "nova7-observations-exemple.csv",
                      IMPORT_HEADERS,
                      observationRows(state),
                    )
                  }
                >
                  Télécharger le format d’exemple
                </button>
                <small>
                  observation, session, participant, version, date_seance,
                  tache, nature, texte, source
                </small>
              </div>
              <div>
                <FileImport
                  label="Reprendre le carnet JSON"
                  accept=".json,application/json"
                  onFile={(f) => load("json", f)}
                />
                <small>
                  Remplace le carnet. Annuler permet de retrouver l’état
                  précédent. Maximum 5 Mio.
                </small>
              </div>
            </fieldset>
            {busy && <p role="status">Lecture du fichier…</p>}
          </section>
        )}
        {view === "carnet" ? (
          <div className="n7-workbench">
            <aside className="n7-tasks">
              <h2>Tâches</h2>
              <nav aria-label="Tâches du test">
                {state.tasks.map((t) => (
                  <button
                    key={t.id}
                    disabled={locked}
                    aria-current={task.id === t.id ? "page" : undefined}
                    onClick={() => {
                      setTaskId(t.id);
                      setSelected(
                        state.recommendations.find((r) => r.taskId === t.id)
                          ?.id || "",
                      );
                      setFeedback(null);
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
              <p>Service fictif de réservation de salle.</p>
            </aside>
            <section className="n7-notes">
              {editor?.kind === "note" ? (
                <NoteEditor
                  key={editor.record?.id || "new"}
                  state={state}
                  note={editor.record}
                  taskId={task.id}
                  onSave={saveNote}
                  onCancel={() => setEditor(null)}
                  onDelete={() => {
                    if (
                      act(
                        (s) => deleteObservation(s, editor.record.id),
                        "Note retirée. Annuler la restaure avec ses citations.",
                      )
                    )
                      setEditor(null);
                  }}
                />
              ) : editor?.kind === "recommendation" ? (
                <RecommendationEditor
                  key={editor.record?.id || "new"}
                  state={state}
                  recommendation={editor.record}
                  taskId={task.id}
                  onSave={saveRecommendation}
                  onCancel={() => setEditor(null)}
                />
              ) : (
                <>
                  <div className="n7-notes-heading">
                    <h2>Observations · {task.label}</h2>
                    <button
                      disabled={locked || !state.sessions.length}
                      onClick={() => openEditor("note", null)}
                    >
                      Ajouter une note
                    </button>
                  </div>
                  {notes.length ? (
                    notes.map((o) => {
                      const session = state.sessions.find(
                        (s) => s.id === o.sessionId,
                      );
                      return (
                        <article key={o.id} className="n7-note">
                          <div className="n7-note-meta">
                            <strong>
                              {o.id} · {session.id} · {session.participant} ·{" "}
                              {session.versionId}
                            </strong>
                            <span
                              className={
                                o.kind === "interpretation"
                                  ? "n7-interpretation"
                                  : "n7-observed"
                              }
                            >
                              {KINDS[o.kind]}
                            </span>
                          </div>
                          <p>{o.text}</p>
                          <small>Source · {o.source}</small>
                          <div className="n7-note-actions">
                            <button
                              disabled={locked}
                              onClick={() => openEditor("note", o)}
                              aria-label={`Modifier ${o.id}`}
                            >
                              Modifier
                            </button>
                            <Select
                              label="Rôle dans la recommandation"
                              accessibleLabel={`Rôle de ${o.id} dans la recommandation`}
                              value={
                                recommendation?.links.find(
                                  (l) => l.observationId === o.id,
                                )?.role || ""
                              }
                              options={{ "": "Non cité", ...ROLES }}
                              disabled={locked || !recommendation}
                              onChange={(role) =>
                                act(
                                  (s) =>
                                    setLink(s, recommendation.id, o.id, role),
                                  "Citations enregistrées.",
                                )
                              }
                            />
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <p className="n7-empty">
                      Aucune note pour cette tâche sur {state.activeVersion}.
                      Importez un relevé ou ajoutez une note à une séance de
                      cette version.
                    </p>
                  )}
                  <button
                    className="n7-add-recommendation"
                    disabled={locked}
                    onClick={() => openEditor("recommendation", null)}
                  >
                    Ajouter une recommandation à cette tâche
                  </button>
                </>
              )}
            </section>
            <Recommendation
              key={
                recommendation?.id +
                "|" +
                (recommendation?.review?.basis || "draft")
              }
              state={state}
              recommendation={recommendation}
              selection={selection}
              locked={locked}
              editingBlocked={!!editor || busy}
              onSelect={setSelected}
              onEdit={(r) => openEditor("recommendation", r)}
              onOpenNote={(o) => openEditor("note", o)}
              onReview={(p) =>
                act(
                  (s) => review(s, recommendation.id, p),
                  "Relecture enregistrée pour la proposition et ses sources actuelles.",
                )
              }
              onDirty={setReviewDirty}
            />
          </div>
        ) : (
          <Restitution state={state} runExport={runExport} />
        )}
        <div className="n7-bottom">
          <div className="n7-actions">
            <button
              disabled={locked}
              className="n7-primary"
              onClick={() =>
                setView(view === "carnet" ? "restitution" : "carnet")
              }
            >
              {view === "carnet" ? "Voir la restitution" : "Revenir au carnet"}
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
                setTaskId("T-01");
                setSelected("R-01");
                setImports(false);
                setFeedback(null);
                setView("carnet");
              }}
            >
              Exemple initial
            </button>
          </div>
          <p>Données fictives. Aucune conclusion automatique.</p>
        </div>
      </main>
      <DemoFooter />
    </div>
  );
}

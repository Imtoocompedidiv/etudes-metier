import React, { useEffect, useRef, useState } from "react";
import "@fontsource/sora/400.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import { useHistory } from "../../shared/state.js";
import { DemoFooter, useDocumentTitle } from "../../shared/ui.jsx";
import {
  downloadCsv,
  downloadJson,
  downloadReport,
  readLocalFile,
} from "../../shared/files.js";
import {
  seed,
  inspect,
  revision,
  editNode,
  start,
  act,
  previous,
  replay,
  saveCheckpoint,
  resumeCheckpoint,
  reviewTrace,
  reviewed,
  parseImport,
  matrix,
  matrixHeaders,
  report,
  MAX_BYTES,
} from "./model.js";
import "./styles.css";
const typeLabel = { page: "Page", question: "Question", end: "Fin" };

function Destination({ value, nodes, onChange, label }) {
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={nodes.some((n) => n.id === value) ? "" : "h3-invalid"}
      >
        {!nodes.some((n) => n.id === value) && (
          <option value={value}>{value} (absente)</option>
        )}
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.title}
          </option>
        ))}
      </select>
    </label>
  );
}
function Editor({ node, nodes, onSave, onDirty }) {
  const [draft, setDraft] = useState(structuredClone(node)),
    [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(node);
  const change = (next) => {
    setDraft(next);
    onDirty(JSON.stringify(next) !== JSON.stringify(node));
    setError("");
  };
  const answer = (id, patch) =>
    change({
      ...draft,
      answers: draft.answers.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  return (
    <form
      className="h3-editor"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const answers = draft.answers.map((a) => {
            if (a.points === "")
              throw Error("Indiquez les points de chaque réponse.");
            return { ...a, points: Number(a.points) };
          });
          onSave({ ...draft, answers });
          onDirty(false);
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <h2>{node.title}</h2>
      <label>
        Titre
        <input
          maxLength={120}
          value={draft.title}
          onChange={(e) => change({ ...draft, title: e.target.value })}
          required
        />
      </label>
      <label>
        {node.type === "question" ? "Question" : "Contenu de l’écran"}
        <textarea
          value={draft.body}
          maxLength={3000}
          rows={3}
          onChange={(e) => change({ ...draft, body: e.target.value })}
          required
        />
      </label>
      {node.type === "page" && (
        <Destination
          label="Écran suivant"
          value={draft.next}
          nodes={nodes}
          onChange={(next) => change({ ...draft, next })}
        />
      )}
      {node.type === "question" && (
        <fieldset className="h3-answer-list">
          <legend>Réponses</legend>
          {draft.answers.map((a, i) => (
            <div className="h3-answer-editor" key={a.id}>
              <div className="h3-answer-fields">
                <label>
                  Réponse {a.id.toUpperCase()}
                  <input
                    value={a.label}
                    maxLength={300}
                    onChange={(e) => answer(a.id, { label: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Points
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="1"
                    value={a.points}
                    onChange={(e) => answer(a.id, { points: e.target.value })}
                    required
                  />
                </label>
                <Destination
                  label={`Destination ${a.id.toUpperCase()}`}
                  nodes={nodes}
                  value={a.next}
                  onChange={(next) => answer(a.id, { next })}
                />
              </div>
              {!nodes.some((n) => n.id === a.next) && (
                <p className="h3-warning">
                  Cette destination n’existe pas dans le storyboard.
                </p>
              )}
              <details>
                <summary>Feedback {a.id.toUpperCase()}</summary>
                <label>
                  Message après la réponse
                  <textarea
                    maxLength={1000}
                    value={a.feedback}
                    onChange={(e) => answer(a.id, { feedback: e.target.value })}
                  />
                </label>
              </details>
            </div>
          ))}
        </fieldset>
      )}
      {node.type === "end" && (
        <p className="h3-help">
          Cet écran termine le parcours. Il ne porte aucune destination.
        </p>
      )}
      {error && (
        <p role="alert" className="h3-warning">
          {error}
        </p>
      )}
      <div className="h3-actions">
        <button className="h3-orange" disabled={!dirty}>
          Enregistrer {node.type === "question" ? "la question" : "l’écran"}
        </button>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => change(structuredClone(node))}
        >
          Annuler la saisie
        </button>
      </div>
      <p className="h3-help">
        Une modification du storyboard réinitialise le test et sa reprise
        enregistrée.
      </p>
    </form>
  );
}
function Player({ state, runAction, begin, dirty }) {
  const result = state.run ? replay(state.story, state.run) : null;
  const choice = result?.choices.find((c) => c.node === result.current),
    feedback = result?.node.answers.find(
      (a) => a.id === choice?.answer,
    )?.feedback;
  return (
    <section className="h3-player" aria-label="Parcours apprenant">
      <div className="h3-player-top">
        <strong>Parcours de test</strong>
        <span>{result ? typeLabel[result.node.type] : "Non démarré"}</span>
      </div>
      {!result ? (
        <>
          <h2>{state.story.title}</h2>
          <p>
            Jouez les interactions pour observer les destinations, les réponses
            et la reprise. Les données de cet exemple sont fictives.
          </p>
          <button
            className="h3-orange"
            disabled={dirty || inspect(state.story).issues.length > 0}
            onClick={begin}
          >
            Démarrer le parcours
          </button>
        </>
      ) : (
        <>
          <h2>{result.node.title}</h2>
          <p className="h3-learning-text">{result.node.body}</p>
          {result.node.type === "question" && (
            <fieldset className="h3-choices">
              <legend>Choisissez une réponse</legend>
              {result.node.answers.map((a) => (
                <label
                  key={a.id}
                  className={choice?.answer === a.id ? "is-chosen" : ""}
                >
                  <input
                    type="radio"
                    name="h3-answer"
                    value={a.id}
                    checked={choice?.answer === a.id}
                    onChange={() => runAction({ kind: "answer", answer: a.id })}
                  />
                  <span>{a.label}</span>
                </label>
              ))}
            </fieldset>
          )}
          {choice && feedback && <div className="h3-feedback">{feedback}</div>}
          {result.completed ? (
            <div className="h3-completed">
              <strong>Parcours terminé</strong>
              <p>
                {result.answered
                  ? `${result.points} point${result.points > 1 ? "s" : ""} sur ${result.maximum}, sur ${result.answered} question${result.answered > 1 ? "s" : ""} répondue${result.answered > 1 ? "s" : ""}.`
                  : "Aucune question répondue."}
              </p>
              <p>
                La trace concerne ce parcours. Les autres branches restent à
                vérifier.
              </p>
            </div>
          ) : (
            <button
              className="h3-orange"
              disabled={dirty || (result.node.type === "question" && !choice)}
              onClick={() => runAction({ kind: "continue", answer: null })}
            >
              Continuer
            </button>
          )}
          <div className="h3-player-foot">
            <span>
              {result.answered} / {result.totalQuestions} question
              {result.totalQuestions > 1 ? "s" : ""} répondue
              {result.totalQuestions > 1 ? "s" : ""}
            </span>
            <span>
              {result.answered
                ? `${result.points} / ${result.maximum} points`
                : "Aucun score pour le moment"}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
function Confirm({ title, children, accept, close }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog className="h3-dialog" ref={ref} onCancel={close}>
      <h2>{title}</h2>
      {children}
      <div className="h3-actions">
        <button onClick={close}>Conserver mon travail</button>
        <button className="h3-purple" onClick={accept}>
          Confirmer
        </button>
      </div>
    </dialog>
  );
}

export default function App() {
  useDocumentTitle("H3 Campus Online · Recette interactive");
  const history = useHistory(seed, { max: 20 }),
    state = history.value;
  const [tab, setTab] = useState("editor"),
    [selected, setSelected] = useState("priorite"),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(null),
    [reset, setReset] = useState(false);
  const file = useRef(null),
    check = inspect(state.story),
    result = state.run ? replay(state.story, state.run) : null,
    rows = matrix(state),
    node =
      state.story.nodes.find((n) => n.id === selected) || state.story.nodes[0];
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
    setMessage(note);
    setError("");
  };
  const begin = () =>
    safe(() => {
      commit(start(state), "Parcours lancé.");
      setTab("player");
    });
  const runAction = (action) =>
    safe(() =>
      commit(
        act(state, action),
        action.kind === "answer" ? "Réponse enregistrée." : "Écran suivant.",
      ),
    );
  return (
    <div className="h3-app">
      <header className="h3-brand">
        <strong>
          H3 <span>Campus Online</span>
        </strong>
        <span>Étude indépendante · JD</span>
      </header>
      <main>
        <div className="h3-heading">
          <div>
            <h1>Recetter un parcours interactif</h1>
            <p>
              Corrigez une branche, jouez le scénario, puis relisez la trace.
            </p>
          </div>
          <div className="h3-actions">
            <button disabled={dirty} onClick={() => file.current?.click()}>
              Importer JSON
            </button>
            <button
              className="h3-purple"
              disabled={dirty}
              onClick={() => downloadJson("h3-dossier.json", state)}
            >
              Exporter le dossier
            </button>
          </div>
        </div>
        <input
          type="file"
          accept=".json,application/json"
          hidden
          ref={file}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setError("");
            setMessage("");
            try {
              const raw = await readLocalFile(f, { maxBytes: MAX_BYTES });
              setPending({ name: f.name, state: parseImport(raw, state) });
            } catch (err) {
              setError(err.message);
            }
          }}
        />
        <div className="h3-tabs" role="tablist" aria-label="Mode de travail">
          <button
            role="tab"
            aria-selected={tab === "editor"}
            disabled={dirty}
            onClick={() => setTab("editor")}
          >
            Storyboard
          </button>
          <button
            role="tab"
            aria-selected={tab === "player"}
            disabled={dirty}
            onClick={() => setTab("player")}
          >
            Parcours apprenant
          </button>
        </div>
        {error && (
          <p className="h3-notice h3-warning" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="h3-notice" role="status">
            {message}
          </p>
        )}
        {dirty && (
          <p className="h3-notice">
            Une saisie est en cours. Enregistrez ou annulez-la pour jouer et
            exporter.
          </p>
        )}
        <div className="h3-workspace">
          <aside className="h3-storyboard">
            <h2>Modules du parcours</h2>
            <div className="h3-node-list">
              {state.story.nodes.map((n) => (
                <button
                  key={n.id}
                  disabled={dirty}
                  aria-pressed={selected === n.id && tab === "editor"}
                  className={
                    selected === n.id && tab === "editor" ? "is-selected" : ""
                  }
                  onClick={() => {
                    setSelected(n.id);
                    setTab("editor");
                  }}
                >
                  <strong>{n.title}</strong>
                  <span>
                    {typeLabel[n.type]}
                    {state.story.entry === n.id ? " · Départ" : ""}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="h3-check-button"
              disabled={dirty}
              onClick={() =>
                setMessage(
                  check.issues.length
                    ? `${check.issues.length} anomalie${check.issues.length > 1 ? "s" : ""} de chemin à examiner dans le contrôle.`
                    : "Tous les écrans sont accessibles et disposent d’un chemin vers une fin. Cela ne valide pas les contenus pédagogiques.",
                )
              }
            >
              Vérifier les chemins
            </button>
          </aside>
          {tab === "editor" ? (
            <Editor
              key={revision(state.story) + node.id}
              node={node}
              nodes={state.story.nodes}
              onDirty={setDirty}
              onSave={(patch) =>
                commit(
                  editNode(state, node.id, patch),
                  "Storyboard enregistré. Le test doit être rejoué pour cette version.",
                )
              }
            />
          ) : (
            <Player
              state={state}
              runAction={runAction}
              begin={begin}
              dirty={dirty}
            />
          )}
          <aside className="h3-control">
            <section>
              <h2>Contrôle du parcours</h2>
              {check.issues.length ? (
                <div className="h3-warning">
                  <strong>
                    {check.issues.length} anomalie
                    {check.issues.length > 1 ? "s" : ""} à examiner
                  </strong>
                  {check.issues.slice(0, 8).map((issue, i) => (
                    <p key={i}>
                      <button
                        className="h3-inline"
                        disabled={dirty}
                        onClick={() => {
                          setSelected(issue.node);
                          setTab("editor");
                        }}
                      >
                        {issue.node}
                      </button>{" "}
                      · {issue.message}
                    </p>
                  ))}
                  {check.issues.length > 8 && (
                    <p>La matrice détaille toutes les anomalies.</p>
                  )}
                </div>
              ) : (
                <div className="h3-path-ok">
                  <strong>Chemins cohérents</strong>
                  <p>
                    Chaque écran est accessible et peut rejoindre une fin. Les
                    interactions restent à jouer.
                  </p>
                </div>
              )}
            </section>
            <section>
              <h2>Reprise de test</h2>
              <p>
                {state.checkpoint
                  ? `Progression sauvegardée sur « ${replay(state.story, state.checkpoint).node.title} ».`
                  : "Aucune progression sauvegardée."}
              </p>
              <div className="h3-actions h3-stack">
                <button
                  className="h3-purple"
                  disabled={dirty || check.issues.length > 0}
                  onClick={begin}
                >
                  {state.run ? "Recommencer le parcours" : "Jouer le parcours"}
                </button>
                <button
                  disabled={dirty || !state.run}
                  onClick={() =>
                    safe(() =>
                      commit(
                        saveCheckpoint(state),
                        "Progression sauvegardée pour cette version.",
                      ),
                    )
                  }
                >
                  Sauvegarder la progression
                </button>
                <button
                  disabled={dirty || !state.checkpoint}
                  onClick={() =>
                    safe(() => {
                      commit(resumeCheckpoint(state), "Progression reprise.");
                      setTab("player");
                    })
                  }
                >
                  Reprendre la progression
                </button>
                <button
                  disabled={dirty || !state.run?.actions.length}
                  onClick={() =>
                    safe(() =>
                      commit(
                        previous(state),
                        "Dernière action apprenant retirée.",
                      ),
                    )
                  }
                >
                  Retirer la dernière action
                </button>
              </div>
              <p className="h3-help">
                Reprise en mémoire, liée à cette version. Exportez le dossier ou
                la progression JSON pour la conserver.
              </p>
            </section>
          </aside>
        </div>
        <section className="h3-trace">
          <div className="h3-trace-heading">
            <h2>Trace de recette</h2>
            <div className="h3-actions">
              <button
                disabled={dirty}
                onClick={() => downloadJson("h3-storyboard.json", state.story)}
              >
                Storyboard JSON
              </button>
              <button
                disabled={dirty || !state.run}
                onClick={() => downloadJson("h3-progression.json", state.run)}
              >
                Progression JSON
              </button>
              <button
                disabled={dirty}
                onClick={() =>
                  downloadCsv("h3-matrice.csv", matrixHeaders, rows)
                }
              >
                Matrice CSV
              </button>
              <button
                disabled={dirty}
                onClick={() => downloadReport("h3-rapport.html", report(state))}
              >
                Rapport HTML
              </button>
            </div>
          </div>
          {result?.trace.length ? (
            <div
              className="h3-table-scroll"
              role="region"
              aria-label="Trace des actions, défilement horizontal"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Étape</th>
                    <th>Écran</th>
                    <th>Action</th>
                    <th>Réponse</th>
                    <th>Points</th>
                    <th>Destination</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trace.map((t) => (
                    <tr key={t.index}>
                      <td>{t.index}</td>
                      <td>{t.title}</td>
                      <td>{t.action}</td>
                      <td>{t.answer || "Aucune"}</td>
                      <td>{t.points ?? "Sans réponse"}</td>
                      <td>{t.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="h3-empty">
              Aucune action apprenant pour cette version.
            </p>
          )}
          <div className="h3-review">
            <p>
              {reviewed(state)
                ? "Trace de ce parcours relue."
                : "La revue concerne le parcours joué, pas toutes les branches du module."}
            </p>
            <button
              disabled={dirty || !result?.completed || reviewed(state)}
              onClick={() =>
                safe(() =>
                  commit(
                    reviewTrace(state),
                    "Trace du parcours courant relue.",
                  ),
                )
              }
            >
              Marquer cette trace relue
            </button>
          </div>
          <details className="h3-matrix">
            <summary>Matrice de tous les chemins</summary>
            <div
              className="h3-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Matrice des chemins, défilement horizontal"
            >
              <table>
                <thead>
                  <tr>
                    <th>Écran</th>
                    <th>Réponse</th>
                    <th>Destination</th>
                    <th>Points</th>
                    <th>Parcours courant</th>
                    <th>Contrôle</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.title}</td>
                      <td>{r.answer || "Sans réponse"}</td>
                      <td>{r.destination || "Fin"}</td>
                      <td>{r.points}</td>
                      <td>{r.observed}</td>
                      <td>{r.issues || "Aucune anomalie de graphe"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <div className="h3-bottom">
          <p>
            Exemple fictif, traitement local. Aucun accès au LMS. Les contenus
            importés sont du texte, jamais du code exécuté.
          </p>
          <div className="h3-actions">
            <button
              disabled={dirty || !history.canUndo}
              onClick={() => {
                history.undo();
                setError("");
                setMessage("Modification annulée.");
              }}
            >
              Annuler
            </button>
            <button
              disabled={dirty || !history.canRedo}
              onClick={() => {
                history.redo();
                setError("");
                setMessage("Modification rétablie.");
              }}
            >
              Rétablir
            </button>
            <button disabled={dirty} onClick={() => setReset(true)}>
              Réinitialiser
            </button>
          </div>
        </div>
        <details className="h3-method">
          <summary>Formats et portée de la recette</summary>
          <p>
            Import JSON du dossier complet, du storyboard seul ou d’une
            progression exportée. Les progressions ne se reprennent que sur la
            même version exacte du storyboard. Jusqu’à 40 écrans, 2 à 6 réponses
            par question et 200 actions de test. Le fichier doit tenir dans 4
            Mo. Les points remplacent la réponse précédente ; ils ne s’ajoutent
            pas à chaque passage.
          </p>
          <p>
            Le contrôle de graphe repère les destinations absentes, écrans
            inaccessibles et zones sans issue. La trace et la matrice montrent
            seulement ce qui a été parcouru. Aucun fichier natif Storyline,
            paquet SCORM ou certificat de conformité n’est produit.
          </p>
        </details>
      </main>
      <DemoFooter />
      {pending && (
        <Confirm
          title="Importer ce dossier ?"
          close={() => setPending(null)}
          accept={() => {
            commit(pending.state, "Import confirmé.");
            setSelected(pending.state.story.nodes[0].id);
            setTab(pending.state.run ? "player" : "editor");
            setPending(null);
          }}
        >
          <p>
            {pending.name} contient {pending.state.story.nodes.length} écrans.
            Le remplacement du travail courant restera annulable.
          </p>
        </Confirm>
      )}
      {reset && (
        <Confirm
          title="Restaurer l’exemple initial ?"
          close={() => setReset(false)}
          accept={() => {
            commit(seed(), "Exemple restauré.");
            setSelected("priorite");
            setTab("editor");
            setReset(false);
          }}
        >
          <p>
            Les modifications et le test seront remplacés. L’action restera
            annulable.
          </p>
        </Confirm>
      )}
    </div>
  );
}

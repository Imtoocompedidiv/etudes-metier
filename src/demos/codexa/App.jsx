import React, { useEffect, useRef, useState } from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import {
  DemoFooter,
  ErrorMessage,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import { useHistory } from "../../shared/state.js";
import {
  downloadCsv,
  downloadJson,
  downloadText,
  readLocalFile,
} from "../../shared/files.js";
import {
  NOTE_HEADERS,
  KINDS,
  seed,
  parseNotes,
  replaceNotes,
  editNote,
  removeNote,
  editParagraph,
  linkNote,
  unlinkNote,
  addQuestion,
  closeQuestion,
  reopenQuestion,
  markReviewed,
  paragraphStatus,
  questionIsClosed,
  restore,
  issueRows,
  makeReport,
} from "./model.js";
import "./styles.css";

function Upload({ label, accept, disabled, onFile }) {
  const input = useRef(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}
function ImportPreview({ preview, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="cx-import"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="cx-import-title"
    >
      <h2 id="cx-import-title">
        {preview.kind === "notes"
          ? "Remplacer les notes courantes"
          : "Reprendre un dossier"}
      </h2>
      <p>
        {preview.name} · {preview.notes.length} notes
      </p>
      <p>
        {preview.kind === "notes"
          ? "Les paragraphes et leurs liens sont conservés. Une source modifiée ou absente rouvre les questions et la relecture qui en dépendent. Les notes initiales restent dans le rapport."
          : "Le dossier remplacera le travail courant. Vous pourrez revenir en arrière avec Annuler."}
      </p>
      <div className="cx-preview-list">
        {preview.notes.slice(0, 6).map((n) => (
          <p key={n.id}>
            <strong>
              {n.id} · {n.repere}
            </strong>
            <br />
            {n.texte}
          </p>
        ))}
      </div>
      {preview.notes.length > 6 && (
        <p>
          Les {preview.notes.length - 6} autres notes ont aussi été contrôlées.
        </p>
      )}
      <div className="cx-actions">
        <button autoFocus onClick={onCancel}>
          Conserver le travail actuel
        </button>
        <button className="cx-primary" onClick={onConfirm}>
          Confirmer l’import
        </button>
      </div>
    </dialog>
  );
}
export default function CodexaApp() {
  useDocumentTitle("Codexa · Relecture et passages sources");
  const history = useHistory(seed);
  const state = history.value;
  const [selected, setSelected] = useState("P02");
  const paragraph =
    state.paragraphs.find((p) => p.id === selected) || state.paragraphs[0];
  const [draft, setDraft] = useState(paragraph.text);
  const [search, setSearch] = useState("");
  const [noteDraft, setNoteDraft] = useState(null);
  const [newQuestion, setNewQuestion] = useState("");
  const [resolutions, setResolutions] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sourceToFocus, setSourceToFocus] = useState(null);
  const noteNodes = useRef(new Map());
  const editor = useRef(null);
  const currentNote =
    noteDraft && state.notes.find((n) => n.id === noteDraft.id);
  const textDirty = draft !== paragraph.text;
  const noteDirty = Boolean(
    noteDraft && JSON.stringify(noteDraft) !== JSON.stringify(currentNote),
  );
  const resolutionDirty = paragraph.questions.some(
    (q) =>
      Object.hasOwn(resolutions, q.id) && resolutions[q.id] !== q.resolution,
  );
  const dirty =
    textDirty || noteDirty || Boolean(newQuestion) || resolutionDirty;
  const status = paragraphStatus(state, paragraph);
  const reviewed = state.paragraphs.filter(
    (p) => paragraphStatus(state, p).reviewed,
  ).length;
  const openQuestions = state.paragraphs.reduce(
    (sum, p) => sum + paragraphStatus(state, p).open.length,
    0,
  );
  const filteredNotes = state.notes.filter((n) =>
    [n.id, n.repere, n.sujet, n.texte]
      .join(" ")
      .toLocaleLowerCase("fr")
      .includes(search.toLocaleLowerCase("fr")),
  );
  const linkedIds = new Set(paragraph.links.map((l) => l.noteId));
  const usedIds = new Set(
    state.paragraphs.flatMap((p) => p.links.map((l) => l.noteId)),
  );
  useEffect(() => {
    setDraft(paragraph.text);
    setConfirmed(false);
  }, [state, paragraph.id]);
  useEffect(() => {
    if (!sourceToFocus) return;
    const node = noteNodes.current.get(sourceToFocus);
    if (node) {
      node.scrollIntoView({ behavior: "auto", block: "center" });
      node.focus();
    }
    setSourceToFocus(null);
  }, [sourceToFocus, search]);
  function change(fn, message) {
    try {
      history.set(fn(state));
      setError("");
      setNotice(message);
      return true;
    } catch (e) {
      setError(e.message);
      setNotice("");
      return false;
    }
  }
  function choose(id) {
    if (dirty) return;
    setSelected(id);
    setNoteDraft(null);
    setResolutions({});
    setNewQuestion("");
    setError("");
  }
  function cancelEdits() {
    setDraft(paragraph.text);
    setNoteDraft(null);
    setNewQuestion("");
    setResolutions({});
    setConfirmed(false);
    setError("");
    setNotice("Saisies non enregistrées abandonnées.");
  }
  async function importFile(file, kind) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const raw = await readLocalFile(file);
      const value =
        kind === "notes" ? parseNotes(raw) : restore(JSON.parse(raw));
      setPreview({
        kind,
        value,
        notes: kind === "notes" ? value : value.notes,
        name: file.name,
      });
    } catch (e) {
      setError(e instanceof SyntaxError ? "JSON illisible." : e.message);
    } finally {
      setBusy(false);
    }
  }
  function confirmImport() {
    if (
      change(
        (s) =>
          preview.kind === "notes"
            ? replaceNotes(s, preview.value)
            : preview.value,
        "Import enregistré. Les passages et questions restent consultables.",
      )
    ) {
      setPreview(null);
      setNoteDraft(null);
      setResolutions({});
      setNewQuestion("");
    }
  }
  function focusSource(id) {
    setSearch("");
    setSourceToFocus(id);
  }
  function exportAction(action, message) {
    try {
      action();
      setNotice(message);
      setError("");
    } catch (e) {
      setError(e.message);
      setNotice("");
    }
  }
  return (
    <main className="cx-app">
      <header className="cx-top">
        <div>
          <span className="cx-wordmark">Codexa</span>
          <span>Atelier de relecture</span>
        </div>
        <div className="cx-actions">
          <Upload
            label={busy ? "Lecture du fichier…" : "Importer les notes"}
            accept=".csv,text/csv"
            disabled={dirty || busy}
            onFile={(file) => importFile(file, "notes")}
          />
          <button
            disabled={dirty || !history.canUndo}
            onClick={() => {
              history.undo();
              setError("");
              setNotice("Dernière action annulée.");
              setNoteDraft(null);
            }}
          >
            Annuler
          </button>
          <button
            disabled={dirty || !history.canRedo}
            onClick={() => {
              history.redo();
              setError("");
              setNotice("Action rétablie.");
            }}
          >
            Rétablir
          </button>
          <a className="cx-button cx-primary" href="#cx-exports">
            Exporter le dossier
          </a>
        </div>
      </header>
      <section className="cx-heading">
        <h1>Relire avec les passages sources</h1>
        <p>Exemple indépendant · réunion fictive · traitement local</p>
      </section>
      <div className="cx-messages">
        <ErrorMessage>{error}</ErrorMessage>
        {dirty ? (
          <div className="cx-pending">
            Des saisies restent à enregistrer. Les exports utilisent uniquement
            les versions enregistrées.
            <button onClick={cancelEdits}>Abandonner ces saisies</button>
          </div>
        ) : notice ? (
          <p className="cx-notice" role="status">
            {notice}
          </p>
        ) : (
          <p className="cx-guide">
            Commencez par le paragraphe 2. Les notes N02 et N03 permettent de
            discuter la date annoncée.
          </p>
        )}
      </div>
      <nav className="cx-mobile-nav" aria-label="Naviguer dans l’atelier">
        <a href="#cx-document">Texte</a>
        <a href="#cx-notes">Sources</a>
        <a href="#cx-questions">Questions</a>
      </nav>
      <div className="cx-workspace">
        <aside
          className="cx-notes"
          id="cx-notes"
          aria-label="Carnet des notes sources"
        >
          <h2>Notes de réunion</h2>
          <label className="cx-search">
            Rechercher une note
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Mot, repère ou identifiant"
            />
          </label>
          <p className="cx-note-count">
            {filteredNotes.length} notes affichées ·{" "}
            {state.notes.filter((n) => !usedIds.has(n.id)).length} sans lien
          </p>
          <div className="cx-note-list">
            {filteredNotes.map((n) => (
              <article
                key={n.id}
                tabIndex={-1}
                ref={(node) => {
                  if (node) noteNodes.current.set(n.id, node);
                  else noteNodes.current.delete(n.id);
                }}
                className={
                  "cx-note " + (linkedIds.has(n.id) ? "cx-note-linked" : "")
                }
              >
                <div className="cx-note-id">
                  <strong>{n.id}</strong>
                  <time>{n.repere}</time>
                </div>
                <span className="cx-note-topic">{n.sujet}</span>
                <p>{n.texte}</p>
                <div className="cx-note-actions">
                  {linkedIds.has(n.id) ? (
                    <span>Liée à {paragraph.id}</span>
                  ) : (
                    <button
                      disabled={dirty}
                      onClick={() =>
                        change(
                          (s) => linkNote(s, paragraph.id, n.id),
                          "Passage lié au paragraphe sélectionné.",
                        )
                      }
                    >
                      Lier à {paragraph.id}
                    </button>
                  )}
                  <button
                    disabled={dirty}
                    onClick={() => {
                      setNoteDraft({ ...n });
                      setError("");
                    }}
                  >
                    Modifier la note
                  </button>
                </div>
                {noteDraft?.id === n.id && (
                  <form
                    className="cx-note-edit"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (
                        change(
                          (s) => editNote(s, n.id, noteDraft),
                          "Note enregistrée ; les relectures liées sont à renouveler.",
                        )
                      )
                        setNoteDraft(null);
                    }}
                  >
                    <label>
                      Repère de {n.id}
                      <input
                        value={noteDraft.repere}
                        onChange={(e) =>
                          setNoteDraft({ ...noteDraft, repere: e.target.value })
                        }
                        maxLength={8}
                      />
                    </label>
                    <label>
                      Sujet de {n.id}
                      <input
                        value={noteDraft.sujet}
                        onChange={(e) =>
                          setNoteDraft({ ...noteDraft, sujet: e.target.value })
                        }
                        maxLength={100}
                      />
                    </label>
                    <label>
                      Texte de {n.id}
                      <textarea
                        value={noteDraft.texte}
                        onChange={(e) =>
                          setNoteDraft({ ...noteDraft, texte: e.target.value })
                        }
                        maxLength={2500}
                      />
                    </label>
                    <button
                      type="submit"
                      className="cx-primary"
                      disabled={
                        !noteDirty ||
                        textDirty ||
                        resolutionDirty ||
                        Boolean(newQuestion)
                      }
                    >
                      Enregistrer la note
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNoteDraft(null);
                        setError("");
                      }}
                    >
                      Fermer l’édition
                    </button>
                    <button
                      type="button"
                      className="cx-text-danger"
                      disabled={dirty}
                      onClick={() => {
                        if (
                          change(
                            (s) => removeNote(s, n.id),
                            "Note retirée. Ses liens restent signalés jusqu’à votre décision.",
                          )
                        )
                          setNoteDraft(null);
                      }}
                    >
                      Retirer cette note
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
          {!filteredNotes.length && <p>Aucune note pour cette recherche.</p>}
        </aside>
        <section
          className="cx-paper"
          id="cx-document"
          aria-label="Document de travail"
        >
          <h2>{state.title}</h2>
          <div className="cx-paragraphs">
            {state.paragraphs.map((p, i) => (
              <button
                key={p.id}
                className={
                  "cx-paragraph " + (p.id === paragraph.id ? "cx-selected" : "")
                }
                aria-pressed={p.id === paragraph.id}
                disabled={dirty}
                onClick={() => choose(p.id)}
              >
                <span className="cx-paragraph-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="cx-paragraph-body">
                  <span>{p.text}</span>
                  <span
                    className={
                      "cx-paragraph-state " +
                      (paragraphStatus(state, p).reviewed ? "cx-reviewed" : "")
                    }
                  >
                    {paragraphStatus(state, p).label} · {p.links.length}{" "}
                    passage(s)
                  </span>
                </span>
              </button>
            ))}
          </div>
          <form
            className="cx-edit-paragraph"
            ref={editor}
            onSubmit={(e) => {
              e.preventDefault();
              change(
                (s) => editParagraph(s, paragraph.id, draft),
                "Texte enregistré. Les questions closes sur une autre version sont rouvertes.",
              );
            }}
          >
            <label htmlFor="cx-text">
              Éditer le paragraphe {state.paragraphs.indexOf(paragraph) + 1}
            </label>
            <textarea
              id="cx-text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={5000}
            />
            <div className="cx-actions">
              <button
                className="cx-primary"
                disabled={
                  !textDirty ||
                  noteDirty ||
                  resolutionDirty ||
                  Boolean(newQuestion)
                }
              >
                Enregistrer le texte
              </button>
              {textDirty && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(paragraph.text);
                    setError("");
                  }}
                >
                  Annuler la saisie
                </button>
              )}
            </div>
            {paragraph.text !== paragraph.original && (
              <details className="cx-original">
                <summary>Lire le texte initial</summary>
                <p>{paragraph.original}</p>
              </details>
            )}
          </form>
          <section className="cx-linked" aria-label="Passages liés">
            <h3>
              Passages sources liés à ce paragraphe ({paragraph.links.length})
            </h3>
            <p className="cx-small">
              L’association est manuelle. Le rôle du passage ne vaut pas
              validation automatique du texte.
            </p>
            {paragraph.links.map((l) => {
              const n = state.notes.find((n) => n.id === l.noteId);
              return (
                <article
                  className={"cx-link " + (!n ? "cx-missing" : "")}
                  key={l.noteId}
                >
                  <div className="cx-link-heading">
                    <button
                      disabled={!n}
                      onClick={() => focusSource(l.noteId)}
                      aria-label={`Voir la note ${l.noteId}`}
                    >
                      {l.noteId}
                    </button>
                    <label className="cx-role">
                      <span className="cx-sr">Rôle de {l.noteId}</span>
                      <select
                        value={l.kind}
                        disabled={dirty}
                        onChange={(e) =>
                          change(
                            (s) =>
                              linkNote(
                                s,
                                paragraph.id,
                                l.noteId,
                                e.target.value,
                              ),
                            "Rôle du passage mis à jour.",
                          )
                        }
                      >
                        <option value="appui">Appui</option>
                        <option value="rapprocher">À rapprocher</option>
                      </select>
                    </label>
                    <button
                      className="cx-unlink"
                      disabled={dirty}
                      onClick={() =>
                        change(
                          (s) => unlinkNote(s, paragraph.id, l.noteId),
                          "Lien retiré, note conservée dans le carnet.",
                        )
                      }
                      aria-label={`Retirer le lien ${l.noteId}`}
                    >
                      Retirer
                    </button>
                  </div>
                  <p>
                    {n
                      ? `« ${n.texte} »`
                      : "Source absente du jeu de notes courant. Retrouvez-la ou retirez ce lien après vérification."}
                  </p>
                  {n && (
                    <time>
                      {n.repere} · {n.sujet}
                    </time>
                  )}
                </article>
              );
            })}
            {!paragraph.links.length && (
              <p className="cx-empty">
                Choisissez un passage dans le carnet et utilisez « Lier à{" "}
                {paragraph.id} ».
              </p>
            )}
          </section>
          <section className="cx-review" aria-label="Valider la relecture">
            <h3>Relecture du paragraphe</h3>
            <p>{status.label}</p>
            <label className="cx-checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={dirty || status.reviewed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              J’ai relu cette formulation et ses passages sources.
            </label>
            <button
              disabled={
                dirty || status.reviewed || Boolean(status.issues.length)
              }
              onClick={() =>
                change(
                  (s) => markReviewed(s, paragraph.id, confirmed),
                  "Paragraphe déclaré relu sur cette version.",
                )
              }
            >
              Marquer ce paragraphe relu
            </button>
          </section>
        </section>
        <aside
          className="cx-questions"
          id="cx-questions"
          aria-label="Questions au rédacteur"
        >
          <h2>Questions au rédacteur</h2>
          <p className="cx-small">
            Paragraphe {state.paragraphs.indexOf(paragraph) + 1} ·{" "}
            {status.open.length} ouverte(s)
          </p>
          {paragraph.questions.map((q) => {
            const closed = questionIsClosed(state, paragraph, q);
            return (
              <section
                className={"cx-question " + (closed ? "cx-closed" : "")}
                key={q.id}
              >
                <div className="cx-question-state">
                  {q.id} ·{" "}
                  {closed
                    ? "Close sur cette version"
                    : q.closedFingerprint
                      ? "Rouverte après modification"
                      : "Ouverte"}
                </div>
                <h3>{q.text}</h3>
                {closed ? (
                  <>
                    <p>{q.resolution}</p>
                    <button
                      disabled={dirty}
                      onClick={() =>
                        change(
                          (s) => reopenQuestion(s, paragraph.id, q.id),
                          "Question rouverte.",
                        )
                      }
                    >
                      Rouvrir la question
                    </button>
                  </>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (
                        change(
                          (s) =>
                            closeQuestion(
                              s,
                              paragraph.id,
                              q.id,
                              resolutions[q.id] ?? q.resolution,
                            ),
                          "Question close. Vous pouvez maintenant déclarer le paragraphe relu.",
                        )
                      )
                        setResolutions((v) => {
                          const next = { ...v };
                          delete next[q.id];
                          return next;
                        });
                    }}
                  >
                    {q.closedFingerprint && (
                      <p className="cx-small">
                        Le texte ou un passage a changé. Réexaminez le motif
                        précédent avant de clore à nouveau.
                      </p>
                    )}
                    <label>
                      Motif de résolution {q.id}
                      <textarea
                        value={resolutions[q.id] ?? q.resolution}
                        onChange={(e) =>
                          setResolutions({
                            ...resolutions,
                            [q.id]: e.target.value,
                          })
                        }
                        maxLength={1500}
                        placeholder="Ce qui a été vérifié ou corrigé"
                      />
                    </label>
                    <button
                      className="cx-primary"
                      disabled={textDirty || noteDirty || Boolean(newQuestion)}
                      type="submit"
                    >
                      Clore la question {q.id}
                    </button>
                  </form>
                )}
              </section>
            );
          })}
          {!paragraph.questions.length && (
            <p className="cx-empty">
              Aucune question sur ce paragraphe. Vous pouvez en ouvrir une
              ci-dessous.
            </p>
          )}
          <form
            className="cx-new-question"
            onSubmit={(e) => {
              e.preventDefault();
              if (
                change(
                  (s) => addQuestion(s, paragraph.id, newQuestion),
                  "Question ajoutée au dossier.",
                )
              )
                setNewQuestion("");
            }}
          >
            <label>
              Ajouter une question
              <textarea
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                maxLength={1200}
                placeholder="Le point à faire préciser"
              />
            </label>
            <button
              disabled={
                !newQuestion.trim() || textDirty || noteDirty || resolutionDirty
              }
            >
              Ajouter au fil de revue
            </button>
          </form>
        </aside>
      </div>
      <section className="cx-exports" id="cx-exports">
        <div>
          <h2>Dossier de revue</h2>
          <p>
            {state.paragraphs.length - reviewed} paragraphes à relire ·{" "}
            {openQuestions} questions ouvertes
          </p>
        </div>
        <div className="cx-actions">
          <button
            disabled={dirty}
            onClick={() =>
              exportAction(
                () =>
                  downloadText(
                    "codexa-dossier-revue.html",
                    makeReport(state),
                    "text/html;charset=utf-8",
                  ),
                "Rapport téléchargé avec les textes, sources et questions.",
              )
            }
          >
            Rapport HTML
          </button>
          <button
            disabled={dirty}
            onClick={() =>
              exportAction(
                () =>
                  downloadCsv(
                    "codexa-points-ouverts.csv",
                    [
                      "paragraphe",
                      "identifiant",
                      "type",
                      "point",
                      "motif_precedent",
                    ],
                    issueRows(state),
                  ),
                "Points ouverts téléchargés.",
              )
            }
          >
            Points ouverts CSV
          </button>
          <button
            disabled={dirty}
            onClick={() =>
              exportAction(
                () => downloadJson("codexa-dossier.json", state),
                "Sauvegarde téléchargée ; elle peut être reprise ci-dessous.",
              )
            }
          >
            Sauvegarde JSON
          </button>
        </div>
      </section>
      <details className="cx-files">
        <summary>Fichiers d’exemple, reprise et journal</summary>
        <p>
          CSV de notes attendu : id, repere, sujet, texte. 120 notes au maximum,
          repère HH:MM:SS. Importer remplace les notes courantes après aperçu,
          sans retirer leurs liens.
        </p>
        <div className="cx-actions">
          <button
            disabled={dirty}
            onClick={() =>
              downloadCsv(
                "codexa-notes-exemple.csv",
                NOTE_HEADERS,
                seed().notes,
              )
            }
          >
            Notes CSV d’exemple
          </button>
          <Upload
            label="Reprendre une sauvegarde JSON"
            accept=".json,application/json"
            disabled={dirty || busy}
            onFile={(file) => importFile(file, "dossier")}
          />
          <button
            disabled={dirty}
            onClick={() => {
              history.reset();
              setNoteDraft(null);
              setResolutions({});
              setNewQuestion("");
              setError("");
              setNotice(
                "Exemple réinitialisé. Cette action peut être annulée.",
              );
            }}
          >
            Recharger l’exemple
          </button>
        </div>
        <h3>Journal des actions</h3>
        <ol>
          {state.journal.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </details>
      <p className="cx-local-note">
        Le travail reste dans cet onglet, sans sauvegarde automatique.
        Téléchargez le dossier avant de le fermer. Les notes initiales et les
        corrections sont des documents de travail, pas une transcription
        certifiée.
      </p>
      <DemoFooter />
      {preview && (
        <ImportPreview
          preview={preview}
          onCancel={() => setPreview(null)}
          onConfirm={confirmImport}
        />
      )}
    </main>
  );
}

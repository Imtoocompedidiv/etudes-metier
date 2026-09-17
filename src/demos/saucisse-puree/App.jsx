import { useEffect, useRef, useState } from "react";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import {
  DemoContext,
  DemoFooter,
  ErrorMessage,
  FileImport,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import { useHistory } from "../../shared/state.js";
import {
  readLocalFile,
  downloadJson,
  downloadCsv,
  downloadText,
  downloadReport,
} from "../../shared/files.js";
import {
  seed,
  time,
  parseTime,
  editCue,
  addCue,
  removeCue,
  shift,
  editBrief,
  attachMedia,
  media,
  importSrt,
  restore,
  validDossier,
  findings,
  markReview,
  reviewed,
  srt,
  findingRows,
  report,
} from "./model.js";
import demoVideo from "./assets/bistrot-demo.mp4";
import "./styles.css";

async function inspectVideo(file) {
  if (!file.size || file.size > 52428800)
    throw Error("La vidéo doit peser entre 1 octet et 50 Mo.");
  const url = URL.createObjectURL(file);
  try {
    const descriptor = await new Promise((resolve, reject) => {
      const probe = document.createElement("video");
      const finish = (error) => {
        clearTimeout(timer);
        probe.onloadedmetadata = null;
        probe.onerror = null;
        if (error) reject(error);
        else
          resolve({
            width: probe.videoWidth,
            height: probe.videoHeight,
            duration: Math.round(probe.duration * 1000),
          });
        probe.removeAttribute("src");
        probe.load();
      };
      const timer = setTimeout(
        () =>
          finish(Error("La lecture des métadonnées a dépassé 10 secondes.")),
        10000,
      );
      probe.onloadedmetadata = () => finish();
      probe.onerror = () =>
        finish(
          Error(
            "Le navigateur ne sait pas lire cette vidéo. Essayez un MP4 H.264 ou un WebM.",
          ),
        );
      probe.preload = "metadata";
      probe.src = url;
    });
    const hash = await crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    const fingerprint = Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    return {
      url,
      media: media({
        ...descriptor,
        name: file.name,
        bytes: file.size,
        fingerprint,
      }),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function BriefEditor({ state, onSave }) {
  const [draft, setDraft] = useState(state.brief);
  useEffect(() => setDraft(state.brief), [state.brief]);
  return (
    <form
      className="sp-brief"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...draft,
          maxDuration: Number(draft.maxDuration),
          readingRate: Number(draft.readingRate),
        });
      }}
    >
      <h2>Informations du brief</h2>
      <label>
        Titre du dossier
        <input
          value={draft.title}
          maxLength={100}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>
      <div className="sp-three">
        <label>
          Format attendu
          <select
            value={draft.ratio}
            onChange={(e) => setDraft({ ...draft, ratio: e.target.value })}
          >
            <option value="vertical">9:16</option>
            <option value="carre">1:1</option>
            <option value="paysage">16:9</option>
          </select>
        </label>
        <label>
          Durée max. (s)
          <input
            type="number"
            required
            min="1"
            max="3600"
            step="1"
            value={draft.maxDuration}
            onChange={(e) =>
              setDraft({ ...draft, maxDuration: e.target.value })
            }
          />
        </label>
        <label>
          Caractères/s
          <input
            type="number"
            required
            min="1"
            max="80"
            step="1"
            value={draft.readingRate}
            onChange={(e) =>
              setDraft({ ...draft, readingRate: e.target.value })
            }
          />
        </label>
      </div>
      <button className="sp-secondary" type="submit">
        Appliquer le brief
      </button>
      <p className="sp-note">
        Seuils d’exemple modifiables. Lecture hors espaces ; aucune norme de
        plateforme présumée.
      </p>
    </form>
  );
}

function VideoPane({
  state,
  attachment,
  matching,
  videoRef,
  onImport,
  busy,
  onDefaultReady,
  onError,
  onTime,
  current,
  safe,
  setSafe,
  onBrief,
}) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !matching) return;
    const inspect = () => onDefaultReady({ currentTarget: video });
    // Cached media can expose metadata before React attaches its event handler.
    if (video.readyState >= 1) inspect();
    video.addEventListener("loadedmetadata", inspect);
    return () => video.removeEventListener("loadedmetadata", inspect);
  }, [attachment.url, matching]);
  const active = state.cues.filter(
    (c) => current >= c.start && current < c.end,
  );
  return (
    <aside className="sp-video-pane">
      <div className="sp-video-stage">
        {matching ? (
          <>
            <video
              ref={videoRef}
              src={attachment.url}
              controls
              playsInline
              preload="metadata"
              onError={() =>
                onError(
                  "La vidéo n’a pas pu être chargée. Importez un fichier local lisible.",
                )
              }
              onTimeUpdate={(e) =>
                onTime(Math.round(e.currentTarget.currentTime * 1000))
              }
              aria-label="Vidéo de livraison et aperçu des sous-titres"
            />
            {safe && <div className="sp-safe-area" aria-hidden="true" />}
            <div className="sp-caption" aria-live="off">
              {active.map((c) => (
                <span key={c.id}>{c.text}</span>
              ))}
            </div>
          </>
        ) : (
          <div className="sp-unlinked">
            <strong>Vidéo à associer</strong>
            <p>
              Le dossier conserve ses caractéristiques, mais pas le fichier.
              Importez la vidéo correspondante pour reprendre la recette.
            </p>
          </div>
        )}
      </div>
      <div className="sp-video-meta">
        <span>
          {state.media.width} × {state.media.height}
        </span>
        <span>{(state.media.duration / 1000).toFixed(3)} s</span>
        <span>Fichier local</span>
      </div>
      <FileImport
        label={busy ? "Lecture du fichier…" : "Importer une vidéo"}
        accept="video/mp4,video/webm,video/quicktime"
        onFile={onImport}
      />
      <label className="sp-checkbox">
        <input
          type="checkbox"
          checked={safe}
          onChange={(e) => setSafe(e.target.checked)}
        />
        Repère de cadrage illustratif
      </label>
      <p className="sp-note">
        Exemple muet de 18 s, photographie animée d’un bistrot fictif. Import
        limité à 50 Mo ; aucune vidéo envoyée.
      </p>
      <BriefEditor state={state} onSave={onBrief} />
    </aside>
  );
}

function CueEditor({ value, onSave, onCancel, onRemove }) {
  const [draft, setDraft] = useState({
    ...value,
    start: time(value.start),
    end: time(value.end),
  });
  useEffect(
    () =>
      setDraft({ ...value, start: time(value.start), end: time(value.end) }),
    [value],
  );
  return (
    <form
      className="sp-cue-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <h3>Édition du sous-titre {value.id}</h3>
      <div className="sp-edit-grid">
        <label>
          Début
          <input
            value={draft.start}
            maxLength={12}
            onChange={(e) => setDraft({ ...draft, start: e.target.value })}
          />
        </label>
        <label>
          Fin
          <input
            value={draft.end}
            maxLength={12}
            onChange={(e) => setDraft({ ...draft, end: e.target.value })}
          />
        </label>
        <label>
          Texte
          <textarea
            rows="3"
            value={draft.text}
            maxLength={1000}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          />
        </label>
      </div>
      <p className="sp-note">
        Repères en heures, minutes, secondes et millisecondes, par exemple
        00:00:17,500. Texte brut.
      </p>
      <div className="sp-buttons">
        <button type="submit">Appliquer</button>
        <button
          type="button"
          className="sp-secondary"
          onClick={() => {
            setDraft({
              ...value,
              start: time(value.start),
              end: time(value.end),
            });
            onCancel();
          }}
        >
          Réinitialiser l’édition
        </button>
        <button type="button" className="sp-text-button" onClick={onRemove}>
          Supprimer ce sous-titre
        </button>
      </div>
    </form>
  );
}

function CueTimeline({ state, selected, select, onShift }) {
  const [offset, setOffset] = useState("500");
  const length = Math.max(
    state.media.duration,
    ...state.cues.flatMap((c) => [c.start, c.end]),
    1,
  );
  return (
    <section
      className="sp-timeline"
      aria-label="Repères temporels des sous-titres"
    >
      <div className="sp-section-top">
        <h3>Repères des sous-titres</h3>
        <form
          className="sp-offset"
          onSubmit={(e) => {
            e.preventDefault();
            onShift(offset);
          }}
        >
          <label>
            Décalage du lot (ms)
            <input
              type="number"
              required
              step="1"
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
            />
          </label>
          <button className="sp-secondary">Décaler</button>
        </form>
      </div>
      <div className="sp-time-labels">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i}>{((length * i) / 4 / 1000).toFixed(1)} s</span>
        ))}
      </div>
      <div className="sp-tracks">
        <div
          className="sp-video-boundary"
          style={{ left: `${(state.media.duration / length) * 100}%` }}
        />
        {state.cues.map((c) => (
          <div className="sp-track" key={c.id}>
            <button
              className={
                selected === c.id ? "sp-segment selected" : "sp-segment"
              }
              style={{
                marginLeft: `${(c.start / length) * 100}%`,
                width: `${Math.max(0.5, ((c.end - c.start) / length) * 100)}%`,
                maxWidth: `${100 - (c.start / length) * 100}%`,
              }}
              onClick={() => select(c.id)}
              title={`Sous-titre ${c.id}, ${time(c.start)} à ${time(c.end)}`}
              aria-label={`Sélectionner le sous-titre ${c.id}`}
            >
              {c.text}
            </button>
          </div>
        ))}
      </div>
      <p className="sp-note">
        Trait bordeaux, fin du clip à {(state.media.duration / 1000).toFixed(3)}{" "}
        s. Sélectionnez un segment pour relire son passage.
      </p>
    </section>
  );
}

function Transcript({ state, list, selected, select, run, commit, info }) {
  const [onlyIssues, setOnlyIssues] = useState(false);
  const visible = state.cues.filter(
    (c) => !onlyIssues || list.some((f) => f.ids.includes(c.id)),
  );
  const chosen = state.cues.find((c) => c.id === selected) || state.cues[0];
  return (
    <section className="sp-transcript">
      <div className="sp-section-top">
        <h2>Sous-titres ({state.cues.length})</h2>
        <button
          className="sp-secondary"
          onClick={() => run(() => commit(addCue(state)), "Sous-titre ajouté.")}
        >
          Ajouter un sous-titre
        </button>
      </div>
      <label className="sp-checkbox">
        <input
          type="checkbox"
          checked={onlyIssues}
          onChange={(e) => setOnlyIssues(e.target.checked)}
        />
        Afficher seulement les passages à revoir
      </label>
      <div
        className="sp-table-scroll"
        role="region"
        aria-label="Tableau des sous-titres, défilement horizontal possible"
        tabIndex="0"
      >
        <table>
          <thead>
            <tr>
              <th>Repère</th>
              <th>Début / fin</th>
              <th>Texte</th>
              <th>Contrôle</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => {
              const problems = list.filter((f) => f.ids.includes(c.id));
              return (
                <tr key={c.id} className={c.id === chosen.id ? "selected" : ""}>
                  <td>
                    <button
                      className="sp-row-select"
                      aria-pressed={c.id === chosen.id}
                      onClick={() => select(c.id)}
                    >
                      Passage {c.id}
                    </button>
                  </td>
                  <td className="sp-clock">
                    {time(c.start)}
                    <br />
                    {time(c.end)}
                  </td>
                  <td>{c.text}</td>
                  <td>
                    {problems.length ? (
                      <span className="sp-problem">
                        {problems.map((f) => f.message).join(" ")}
                      </span>
                    ) : (
                      <span className="sp-ok">Conforme</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && (
          <p className="sp-empty">
            Aucun passage à revoir pour les paramètres actuels.
          </p>
        )}
      </div>
      <CueEditor
        value={chosen}
        onSave={(d) =>
          run(
            () =>
              commit(
                editCue(state, {
                  ...d,
                  start: parseTime(d.start),
                  end: parseTime(d.end),
                }),
              ),
            "Sous-titre enregistré.",
          )
        }
        onCancel={() => info("Édition rétablie, dossier inchangé.")}
        onRemove={() =>
          run(() => commit(removeCue(state, chosen.id)), "Sous-titre supprimé.")
        }
      />
      <CueTimeline
        state={state}
        selected={chosen.id}
        select={select}
        onShift={(offset) =>
          run(() => {
            if (!/^-?\d+$/.test(offset))
              throw Error("Décalage entier en millisecondes attendu.");
            commit(shift(state, Number(offset)));
          }, "Lot déplacé.")
        }
      />
    </section>
  );
}

function DeliveryReview({ state, fingerprint, list, select, run, commit }) {
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState(
    "Image, texte et repères relus dans cette version.",
  );
  useEffect(
    () => setConfirmed(false),
    [state.brief, state.media, state.cues, fingerprint],
  );
  return (
    <>
      <section className="sp-findings">
        <h2>Contrôles de livraison</h2>
        {list.length ? (
          <ul>
            {list.map((f, i) => (
              <li key={`${f.code}-${i}`}>
                <strong
                  className={
                    f.severity === "bloquant" ? "sp-problem" : "sp-warning"
                  }
                >
                  {f.severity === "bloquant" ? "À corriger" : "À relire"}
                </strong>
                <span>{f.message}</span>
                {f.ids.length > 0 && (
                  <button
                    className="sp-text-button"
                    onClick={() => select(f.ids[0])}
                  >
                    Voir le passage
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="sp-success">
            Le format, les repères et la vitesse de lecture respectent le brief.
          </p>
        )}
        <p className="sp-note">
          Le son, le sens, le montage, les droits et le rendu sur chaque réseau
          restent à vérifier par l’équipe.
        </p>
      </section>
      <section className="sp-review">
        <h2>Revue de la version</h2>
        <p>
          {reviewed(state, fingerprint)
            ? "Revue déclarée pour cette version."
            : "La déclaration porte sur le fichier associé, le brief et les sous-titres courants."}
        </p>
        <label>
          Note de revue
          <textarea
            rows="2"
            value={note}
            maxLength={250}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="sp-checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          J’ai relu cette livraison
        </label>
        <button
          disabled={list.length > 0 || !confirmed}
          onClick={() =>
            run(
              () => commit(markReview(state, fingerprint, note)),
              "Revue déclarée pour cette version.",
            )
          }
        >
          Marquer la revue
        </button>
        <p className="sp-note">
          Une modification du dossier annule la revue ; un retour arrière peut
          retrouver la version relue.
        </p>
      </section>
    </>
  );
}

export default function App() {
  useDocumentTitle("Saucisse Purée · Recette vidéo");
  const history = useHistory(seed, {
    key: "saucisse-puree:v1",
    max: 40,
    validate: validDossier,
  });
  const state = history.value;
  const stateRef = useRef(state);
  stateRef.current = state;
  const [attachment, setAttachment] = useState({
    url: demoVideo,
    media: seed.media,
    ready: false,
  });
  const [selected, setSelected] = useState(3);
  const [current, setCurrent] = useState(0);
  const [safe, setSafe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const videoRef = useRef(null);
  const importSequence = useRef(0);
  const matching =
    JSON.stringify(state.media) === JSON.stringify(attachment.media);
  const fingerprint =
    matching && attachment.ready ? attachment.media.fingerprint : undefined;
  const list = findings(state, fingerprint);
  useEffect(() => {
    if (!state.cues.some((c) => c.id === selected))
      setSelected(state.cues[0].id);
  }, [state.cues, selected]);
  useEffect(
    () => () => {
      if (attachment.url.startsWith("blob:"))
        URL.revokeObjectURL(attachment.url);
    },
    [attachment.url],
  );
  useEffect(
    () => () => {
      importSequence.current++;
    },
    [],
  );
  function run(action, success) {
    try {
      action();
      setError("");
      if (success) setMessage(success);
    } catch (e) {
      setError(e.message);
      setMessage("");
    }
  }
  const select = (id) => {
    setSelected(id);
    const c = state.cues.find((v) => v.id === id);
    if (videoRef.current && matching && c) {
      videoRef.current.currentTime = Math.min(
        c.start / 1000,
        state.media.duration / 1000,
      );
      setCurrent(c.start);
    }
  };
  async function importVideo(file) {
    const request = ++importSequence.current;
    setBusy(true);
    try {
      const next = await inspectVideo(file);
      if (request !== importSequence.current) {
        URL.revokeObjectURL(next.url);
        return;
      }
      history.set(attachMedia(stateRef.current, next.media));
      setAttachment({ ...next, ready: true });
      setCurrent(0);
      setError("");
      setMessage("Vidéo lue localement et associée au dossier.");
    } catch (e) {
      if (request === importSequence.current) setError(e.message);
    } finally {
      if (request === importSequence.current) setBusy(false);
    }
  }
  async function importFile(file, kind) {
    try {
      const raw = await readLocalFile(file, {
        maxBytes: kind === "srt" ? 300000 : 1000000,
      });
      if (kind === "srt") history.set(importSrt(stateRef.current, raw));
      else history.set(restore(raw));
      setError("");
      setMessage(
        kind === "srt"
          ? "SRT importé, repères contrôlés."
          : "Dossier restauré. La vidéo doit être associée pour reprendre la revue.",
      );
    } catch (e) {
      setError(e.message);
      setMessage("");
    }
  }
  function reset() {
    importSequence.current++;
    history.reset();
    setAttachment({ url: demoVideo, media: seed.media, ready: false });
    setBusy(false);
    setCurrent(0);
    setSelected(3);
    setError("");
    setMessage("Exemple initial rétabli.");
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.load();
    }
  }
  return (
    <main className="saucisse-demo">
      <header className="sp-header">
        <strong>Saucisse Purée</strong>
        <span>Étude indépendante · JD</span>
      </header>
      <div className="sp-page">
        <h1>La recette d’une vidéo verticale</h1>
        <DemoContext company="Saucisse Purée">
          Le dernier sous-titre dépasse le clip. Ramenez sa fin à 00:00:17,500,
          puis testez un décalage du lot.
        </DemoContext>
        <div className="sp-history">
          <button
            className="sp-secondary"
            disabled={!history.canUndo}
            onClick={() => run(history.undo, "Dernière modification annulée.")}
          >
            Annuler
          </button>
          <button
            className="sp-secondary"
            disabled={!history.canRedo}
            onClick={() => run(history.redo, "Modification rétablie.")}
          >
            Rétablir
          </button>
          <button className="sp-text-button" onClick={reset}>
            Reprendre l’exemple
          </button>
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        <p className="sp-feedback" role="status">
          {message}
        </p>
        <div className="sp-workspace">
          <VideoPane
            state={state}
            attachment={attachment}
            matching={matching}
            videoRef={videoRef}
            onImport={importVideo}
            busy={busy}
            current={current}
            onTime={setCurrent}
            safe={safe}
            setSafe={setSafe}
            onError={setError}
            onDefaultReady={(e) => {
              if (attachment.media.fingerprint === "example-v1") {
                const video = e.currentTarget;
                if (
                  video.videoWidth === seed.media.width &&
                  video.videoHeight === seed.media.height &&
                  Math.round(video.duration * 1000) === seed.media.duration
                )
                  setAttachment((a) => ({ ...a, ready: true }));
                else
                  setError(
                    "Les caractéristiques du média d’exemple ne correspondent pas au dossier. Importez une vidéo locale.",
                  );
              }
            }}
            onBrief={(b) =>
              run(() => history.set(editBrief(state, b)), "Brief appliqué.")
            }
          />
          <Transcript
            state={state}
            list={list}
            selected={selected}
            select={select}
            run={run}
            commit={history.set}
            info={setMessage}
          />
        </div>
        <div className="sp-delivery">
          <DeliveryReview
            state={state}
            fingerprint={fingerprint}
            list={list}
            select={select}
            run={run}
            commit={history.set}
          />
          <section className="sp-exports">
            <h2>Exporter la livraison</h2>
            <div className="sp-export-grid">
              <button
                disabled={list.some((f) => f.severity === "bloquant")}
                onClick={() =>
                  run(
                    () =>
                      downloadText(
                        "saucisse-sous-titres.srt",
                        srt(state, fingerprint),
                        "application/x-subrip;charset=utf-8",
                      ),
                    "SRT courant exporté.",
                  )
                }
              >
                Sous-titres SRT
              </button>
              <button
                onClick={() =>
                  run(
                    () =>
                      downloadCsv(
                        "saucisse-constats.csv",
                        ["niveau", "controle", "reperes", "detail"],
                        findingRows(state, fingerprint),
                      ),
                    "Constats exportés.",
                  )
                }
              >
                Constats CSV
              </button>
              <button
                onClick={() =>
                  run(
                    () => downloadJson("saucisse-dossier.json", state),
                    "Dossier exporté sans le fichier vidéo.",
                  )
                }
              >
                Dossier JSON
              </button>
              <button
                onClick={() =>
                  run(
                    () =>
                      downloadReport(
                        "saucisse-rapport.html",
                        report(state, fingerprint),
                      ),
                    "Rapport HTML exporté.",
                  )
                }
              >
                Rapport HTML
              </button>
            </div>
            <p className="sp-note">
              Le SRT se livre après correction des erreurs bloquantes. Le
              rapport conserve toutes les réserves.
            </p>
            <div className="sp-imports">
              <FileImport
                label="Importer un SRT"
                accept=".srt,text/plain"
                onFile={(f) => importFile(f, "srt")}
              />
              <FileImport
                label="Restaurer un dossier"
                accept=".json,application/json"
                onFile={(f) => importFile(f, "json")}
              />
            </div>
            <p className="sp-note">
              Votre dossier reste dans ce navigateur. Aucun compte, aucune
              publication.
            </p>
            {!history.storageAvailable && (
              <p className="sp-warning">
                Sauvegarde locale indisponible. Exportez votre dossier JSON.
              </p>
            )}
          </section>
        </div>
        <details className="sp-journal">
          <summary>Historique du dossier ({state.journal.length})</summary>
          {state.journal.length ? (
            <ol>
              {state.journal.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ol>
          ) : (
            <p>L’exemple initial n’a pas encore été modifié.</p>
          )}
        </details>
        <DemoFooter />
      </div>
    </main>
  );
}

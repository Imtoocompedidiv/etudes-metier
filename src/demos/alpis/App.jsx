import { useEffect, useRef, useState } from "react";
import "@fontsource/fraunces/latin-400.css";
import "@fontsource/hanken-grotesk/latin-400.css";
import "@fontsource/hanken-grotesk/latin-600.css";
import { useHistory } from "../../shared/state.js";
import { FileImport, DemoFooter, useDocumentTitle } from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadText,
  downloadCsv,
  downloadJson,
} from "../../shared/files.js";
import {
  seed,
  parseTime,
  formatTime,
  inspect,
  metrics,
  editCue,
  shiftCues,
  parseOffset,
  changeRules,
  acceptReading,
  canExport,
  srtText,
  importSrt,
  restore,
  REPORT_HEADERS,
  reportRows,
} from "./model.js";
import "./styles.css";

function Editor({ state, row, apply }) {
  const [start, setStart] = useState(formatTime(row.cue.start));
  const [end, setEnd] = useState(formatTime(row.cue.end));
  const [text, setText] = useState(row.cue.text);
  const [note, setNote] = useState("");
  const field = useRef();
  useEffect(() => {
    setStart(formatTime(row.cue.start));
    setEnd(formatTime(row.cue.end));
    setText(row.cue.text);
    setNote("");
  }, [row.cue]);
  const save = (event) => {
    event.preventDefault();
    apply(
      () =>
        editCue(state, row.cue.id, {
          start: parseTime(start),
          end: parseTime(end),
          text,
        }),
      "Passage enregistré. La frise et les contrôles sont à jour.",
    );
  };
  const dirty =
    start !== formatTime(row.cue.start) ||
    end !== formatTime(row.cue.end) ||
    text !== row.cue.text;
  return (
    <section
      className="alpis-editor"
      id="alpis-editor"
      aria-label="Éditeur du passage"
    >
      <span className="alpis-accent">Passage {row.index + 1}</span>
      <h2>Ajuster le passage</h2>
      <form onSubmit={save}>
        <div className="alpis-timefields">
          <label>
            Heure d’entrée
            <input
              ref={field}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              spellCheck="false"
            />
          </label>
          <label>
            Heure de sortie
            <input
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              spellCheck="false"
            />
          </label>
        </div>
        <label>
          Texte du sous-titre
          <textarea
            rows="4"
            value={text}
            maxLength="3000"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p className="alpis-small">
          Temps au format 00:00:12,600. Conservez les sauts de ligne utiles ;
          aucune ligne vide.
        </p>
        <div className="alpis-metrics">
          <span>
            Durée enregistrée<strong>{row.duration.toFixed(3)} s</strong>
          </span>
          <span>
            Vitesse enregistrée<strong>{row.cps.toFixed(1)} car./s</strong>
          </span>
        </div>
        {(row.hard.length > 0 || row.warnings.length > 0) && (
          <div className={row.hard.length ? "alpis-alert" : "alpis-notice"}>
            <ul>
              {[...row.hard, ...row.warnings].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            {row.accepted && <p>Dérogation active · {row.note}</p>}
          </div>
        )}
        <button className="alpis-primary alpis-wide" disabled={!dirty}>
          Enregistrer le passage
        </button>
        {dirty && (
          <p className="alpis-small">
            Modifications en attente. Enregistrez avant de changer de passage.
          </p>
        )}
      </form>
      {!row.hard.length && row.warnings.length > 0 && !row.accepted && (
        <details className="alpis-waiver">
          <summary>Conserver une exception de lecture</summary>
          <p>
            Une décision motivée couvre les règles configurées pour ce passage.
            Elle sera retirée si le passage ou les règles changent.
          </p>
          <label>
            Motif
            <textarea
              rows="2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength="1000"
            />
          </label>
          <button
            disabled={dirty}
            onClick={() =>
              apply(
                () => acceptReading(state, row.cue.id, note),
                "Dérogation enregistrée dans le relevé de contrôle.",
              )
            }
          >
            Enregistrer la dérogation
          </button>
        </details>
      )}
    </section>
  );
}

function Rules({ state, apply }) {
  const [draft, setDraft] = useState({ ...state.rules });
  useEffect(() => setDraft({ ...state.rules }), [state.rules]);
  const number = (key, label, divide = 1, step = "1") => (
    <label>
      {label}
      <input
        type="number"
        step={step}
        value={draft[key] === "" ? "" : draft[key] / divide}
        onChange={(e) =>
          setDraft((d) => ({
            ...d,
            [key]: e.target.value === "" ? "" : Number(e.target.value) * divide,
          }))
        }
      />
    </label>
  );
  return (
    <details className="alpis-rules">
      <summary>Règles de lecture et durée du fichier</summary>
      <p>
        Paramètres illustratifs, à adapter au cahier de livraison. La vitesse
        compte les caractères Unicode, espaces et balises éventuelles compris ;
        chaque saut de ligne compte pour un espace.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply(
            () => changeRules(state, draft),
            "Règles actualisées. Les dérogations précédentes ont été retirées.",
          );
        }}
      >
        <div className="alpis-rulegrid">
          {number("videoMs", "Durée vidéo (s)", 1000, "0.001")}
          {number("maxCps", "Vitesse maximale (car./s)", 1, "0.1")}
          {number("maxLine", "Caractères par ligne")}
          {number("minMs", "Durée minimale (s)", 1000, "0.1")}
          {number("maxMs", "Durée maximale (s)", 1000, "0.1")}
        </div>
        <button>Appliquer les règles</button>
      </form>
    </details>
  );
}

export default function App() {
  useDocumentTitle("Alpis · Relecture des sous-titres");
  const history = useHistory(seed);
  const state = history.value;
  const [selected, setSelected] = useState("s3");
  const [checked, setChecked] = useState([]);
  const [filter, setFilter] = useState("all");
  const [offset, setOffset] = useState("0.5");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const rows = inspect(state);
  const current = rows.find((r) => r.cue.id === selected) || rows[0];
  const unresolved = rows.filter(
    (r) => r.hard.length || (r.warnings.length && !r.accepted),
  );
  const shown = filter === "issues" ? unresolved : rows;
  const exportReady = canExport(state);
  const apply = (transform, message) => {
    try {
      const next = transform();
      history.set(next);
      setError("");
      setNotice(message);
      return true;
    } catch (e) {
      setError(e.message);
      setNotice("");
      return false;
    }
  };
  const runExport = (fn) => {
    try {
      fn();
      setError("");
      setNotice("Fichier téléchargé depuis le dossier affiché.");
    } catch (e) {
      setError(e.message);
    }
  };
  const loadSrt = async (file) => {
    try {
      const raw = await readLocalFile(file, { maxBytes: 1000000 });
      if (
        apply(
          () => importSrt(state, raw, file.name),
          "SRT importé. La numérotation suit l’ordre du fichier ; vérifiez la durée vidéo déclarée.",
        )
      ) {
        setSelected("s1");
        setChecked([]);
        setFilter("all");
      }
    } catch (e) {
      setError(e.message);
    }
  };
  const loadJson = async (file) => {
    try {
      const raw = await readLocalFile(file);
      if (apply(() => restore(raw), "Dossier restauré.")) {
        setSelected("s1");
        setChecked([]);
        setFilter("all");
      }
    } catch (e) {
      setError(e.message);
    }
  };
  const laneEnds = [];
  const placed = [...rows]
    .sort((a, b) => a.cue.start - b.cue.start)
    .map((row) => {
      let lane = laneEnds.findIndex((end) => end <= row.cue.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = row.cue.end;
      return { ...row, lane };
    });
  const range = Math.max(state.rules.videoMs, ...state.cues.map((c) => c.end));
  const choose = (id) => {
    setSelected(id);
    setError("");
  };
  return (
    <div className="alpis-app">
      <header className="alpis-topbar">
        <span>
          <strong>ALPIS</strong>
          <span className="alpis-divider">/</span>Atelier de relecture
        </span>
        <span>Prototype indépendant · Données fictives</span>
      </header>
      <main>
        <div className="alpis-heading">
          <div>
            <h1>Relire les sous-titres</h1>
            <p>
              {state.filename === "visite-atelier-exemple.srt" ? (
                <>
                  Ajustez la sortie du passage 3 à <strong>00:00:12,600</strong>
                  , puis raccourcissez le passage 6.
                </>
              ) : (
                "Sélectionnez un passage, vérifiez ses temps et son texte, puis exportez la version relue."
              )}
            </p>
          </div>
          <div className="alpis-heading-actions">
            <FileImport
              label="Importer un SRT"
              accept=".srt,text/plain"
              onFile={loadSrt}
            />
            <button
              className="alpis-primary"
              disabled={!exportReady}
              onClick={() =>
                runExport(() =>
                  downloadText(
                    "alpis-version-relue.srt",
                    srtText(state),
                    "application/x-subrip;charset=utf-8",
                  ),
                )
              }
            >
              Exporter le SRT
            </button>
          </div>
        </div>
        <div className="alpis-filebar">
          <span>
            {state.filename} · {state.cues.length} passages ·{" "}
            {exportReady
              ? "Version exportable"
              : `${unresolved.length} passage${unresolved.length > 1 ? "s" : ""} à traiter`}
          </span>
          <div>
            <button
              disabled={!history.canUndo}
              onClick={() => {
                history.undo();
                setError("");
                setNotice("Dernière action annulée.");
              }}
            >
              Annuler
            </button>
            <button
              disabled={!history.canRedo}
              onClick={() => {
                history.redo();
                setError("");
                setNotice("Action rétablie.");
              }}
            >
              Rétablir
            </button>
          </div>
        </div>
        {error && (
          <div className="alpis-error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <p className="alpis-feedback" role="status">
            {notice}
          </p>
        )}
        <section className="alpis-timeline" aria-label="Frise temporelle">
          <div className="alpis-timeline-heading">
            <h2>Chronologie</h2>
            <span>
              Chaque bloc ouvre son passage. Les recouvrements occupent des
              pistes distinctes.
            </span>
          </div>
          <div
            className="alpis-timeline-scroll"
            tabIndex="0"
            role="region"
            aria-label="Frise défilable horizontalement"
          >
            <div
              className="alpis-timeline-inner"
              style={{ height: 56 + Math.max(laneEnds.length, 1) * 52 }}
            >
              <div className="alpis-ruler">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} style={{ left: `${i * 12.5}%` }}>
                    {((range * i) / 8 / 1000).toFixed(1)} s
                  </span>
                ))}
              </div>
              {placed.map((r) => (
                <button
                  key={r.cue.id}
                  className={`alpis-clip ${current.cue.id === r.cue.id ? "selected" : ""} ${r.hard.length ? "overlap" : ""}`}
                  style={{
                    left: `${(r.cue.start / range) * 100}%`,
                    width: `${((r.cue.end - r.cue.start) / range) * 100}%`,
                    top: 40 + r.lane * 52,
                  }}
                  onClick={() => choose(r.cue.id)}
                  aria-label={`Ouvrir le passage ${r.index + 1}`}
                >
                  <strong>{r.index + 1}</strong>
                  <span>{r.cue.text}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
        <div className="alpis-workspace">
          <section className="alpis-passages" aria-label="Liste des passages">
            <div className="alpis-list-head">
              <h2>Passages</h2>
              <label className="alpis-filter">
                <span className="alpis-sr">Filtrer les passages</span>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Tous les passages</option>
                  <option value="issues">
                    À traiter ({unresolved.length})
                  </option>
                </select>
              </label>
            </div>
            <div className="alpis-list">
              {shown.map((row) => (
                <div
                  key={row.cue.id}
                  className={`alpis-row ${current.cue.id === row.cue.id ? "active" : ""}`}
                >
                  <label className="alpis-check">
                    <input
                      type="checkbox"
                      checked={checked.includes(row.cue.id)}
                      onChange={(e) =>
                        setChecked((ids) =>
                          e.target.checked
                            ? [...ids, row.cue.id]
                            : ids.filter((id) => id !== row.cue.id),
                        )
                      }
                    />
                    <span className="alpis-sr">
                      Inclure le passage {row.index + 1} dans le décalage
                    </span>
                  </label>
                  <button
                    className="alpis-row-button"
                    onClick={() => choose(row.cue.id)}
                    aria-label={`Éditer le passage ${row.index + 1}`}
                  >
                    <span className="alpis-cue-number">{row.index + 1}</span>
                    <span className="alpis-row-main">
                      <span className="alpis-time">
                        {formatTime(row.cue.start)} – {formatTime(row.cue.end)}
                      </span>
                      <span className="alpis-cuetext">{row.cue.text}</span>
                      <span
                        className={`alpis-status ${row.hard.length ? "error" : row.warnings.length && !row.accepted ? "warning" : ""}`}
                      >
                        {row.hard.length
                          ? "Chronologie à corriger"
                          : row.accepted
                            ? "Dérogation motivée"
                            : row.warnings.length
                              ? "Lecture à vérifier"
                              : "Contrôles passés"}
                      </span>
                    </span>
                  </button>
                </div>
              ))}
              {!shown.length && (
                <p className="alpis-empty">
                  Tous les passages ont été traités. La version peut être
                  exportée.
                </p>
              )}
            </div>
            <div className="alpis-selection">
              <span>
                {
                  checked.filter((id) => state.cues.some((c) => c.id === id))
                    .length
                }{" "}
                passage(s) sélectionné(s)
              </span>
              <button
                onClick={() =>
                  setChecked(
                    checked.length === state.cues.length
                      ? []
                      : state.cues.map((c) => c.id),
                  )
                }
              >
                {checked.length === state.cues.length
                  ? "Tout désélectionner"
                  : "Tout sélectionner"}
              </button>
              <a className="alpis-mobile-link" href="#alpis-editor">
                Aller à l’éditeur
              </a>
            </div>
          </section>
          <Editor state={state} row={current} apply={apply} />
        </div>
        <section className="alpis-shift">
          <div>
            <h2>Décaler la sélection</h2>
            <p>
              Le décalage conserve les durées. Un résultat négatif est refusé ;
              les autres conflits restent signalés.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply(() => {
                if (offset.trim() === "")
                  throw new Error("Indiquez un décalage.");
                const delta = parseOffset(offset);
                return shiftCues(state, checked, delta);
              }, "Sélection décalée. Vérifiez les nouveaux contrôles.");
            }}
          >
            <label>
              Décalage en secondes
              <input
                type="number"
                step="0.001"
                value={offset}
                onChange={(e) => setOffset(e.target.value)}
              />
            </label>
            <button disabled={!checked.length}>Appliquer le décalage</button>
          </form>
        </section>
        <Rules state={state} apply={apply} />
        <section className="alpis-journal">
          <div className="alpis-journal-head">
            <div>
              <h2>Journal de relecture</h2>
              <p>
                Le relevé compare chaque passage à son import initial et
                conserve les contrôles courants.
              </p>
            </div>
            <button
              onClick={() =>
                runExport(() =>
                  downloadCsv(
                    "alpis-releve-controles.csv",
                    REPORT_HEADERS,
                    reportRows(state),
                  ),
                )
              }
            >
              Télécharger le relevé CSV
            </button>
          </div>
          {state.log.length ? (
            <ol>
              {state.log
                .slice(-8)
                .reverse()
                .map((entry, i) => (
                  <li key={state.log.length - i}>
                    <span>{entry.action}</span>
                    <span>
                      {entry.ids.length
                        ? `Passage(s) ${entry.ids.map((id) => state.cues.findIndex((c) => c.id === id) + 1).join(", ")}`
                        : "Tout le fichier"}
                    </span>
                    {entry.note && <p>{entry.note}</p>}
                  </li>
                ))}
            </ol>
          ) : (
            <p className="alpis-empty">
              Aucune modification. La version d’import sert de référence.
            </p>
          )}
          {state.log.length > 8 && (
            <p className="alpis-small">
              Huit dernières actions affichées ; le dossier JSON conserve le
              journal complet.
            </p>
          )}
          <div className="alpis-savebar">
            <button
              onClick={() =>
                runExport(() =>
                  downloadJson("alpis-dossier-relecture.json", state),
                )
              }
            >
              Sauvegarder le dossier JSON
            </button>
            <FileImport
              label="Restaurer un dossier"
              accept=".json,application/json"
              onFile={loadJson}
            />
            <button
              onClick={() => {
                history.reset();
                setSelected("s3");
                setChecked([]);
                setFilter("all");
                setError("");
                setNotice("Exemple rechargé. Cette action peut être annulée.");
              }}
            >
              Recharger l’exemple
            </button>
          </div>
        </section>
        <p className="alpis-local">
          Fichiers traités dans cet onglet, sans envoi ni sauvegarde
          automatique. Sauvegardez le dossier avant de fermer. Les contrôles
          mesurent le temps et la lecture ; le contenu reste à relire.
        </p>
      </main>
      <DemoFooter />
    </div>
  );
}

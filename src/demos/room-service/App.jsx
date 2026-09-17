import { useEffect, useState } from "react";
import "@fontsource/mulish/latin-400.css";
import "@fontsource/mulish/latin-600.css";
import { useHistory } from "../../shared/state.js";
import { DemoFooter, FileImport, useDocumentTitle } from "../../shared/ui.jsx";
import {
  downloadCsv,
  downloadJson,
  downloadText,
  downloadReport,
  readLocalFile,
} from "../../shared/files.js";
import {
  MOUNTS,
  LINE_HEADERS,
  MESSAGE_HEADERS,
  READY_HEADERS,
  seed,
  instructions,
  unmatched,
  decision,
  status,
  decide,
  changeLine,
  addMessage,
  assignMessage,
  importLines,
  importMessages,
  exportLine,
  exportReady,
  lastExport,
  lineRows,
  messageRows,
  readyRows,
  questions,
  report,
  restore,
  MAX_DOSSIER_BYTES,
} from "./model.js";
import "./styles.css";

function Mount({ type, large = false }) {
  return (
    <svg
      className={large ? "rs-mount rs-mount-large" : "rs-mount"}
      viewBox="0 0 110 130"
      aria-hidden="true"
    >
      {type === "opening" && (
        <>
          <path d="M59 11 C35 4 35 41 55 41 C76 41 76 4 59 11" />
          <path d="M63 13 L62 35 M63 18 L68 19" />
        </>
      )}
      {type === "engraved" && (
        <>
          <circle cx="55" cy="24" r="15" />
          <circle cx="55" cy="24" r="10" />
          <path d="M42 18l5 2m15-6-3 4m-7 15 1 5m12-12 4 1" />
        </>
      )}
      {type === "simple" && (
        <>
          <ellipse cx="55" cy="29" rx="7" ry="10" />
          <path d="M51 38h8" />
        </>
      )}
      {!type && <path d="M48 21c0-13 21-13 18 0-1 6-11 7-11 14m0 8v2" />}
      <ellipse cx="55" cy="83" rx="31" ry="38" />
      <ellipse cx="55" cy="83" rx="26" ry="33" />
      <path
        className="rs-stone-mark"
        d="M47 64c-14 15-8 30 2 37m17-47c12 16 12 31 1 43"
      />
    </svg>
  );
}
function LineForm({ line, onSave, onDirty }) {
  const [draft, setDraft] = useState(line),
    [error, setError] = useState("");
  useEffect(() => {
    setDraft(line);
    setError("");
    onDirty(false);
  }, [JSON.stringify(line)]);
  const set = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }));
    onDirty(true);
  };
  return (
    <details className="rs-line-edit">
      <summary>Modifier la référence ou la quantité</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSave(draft);
            onDirty(false);
            setError("");
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <label>
          Commande
          <input
            value={draft.order}
            maxLength={40}
            onChange={(e) => set("order", e.target.value)}
            required
          />
        </label>
        <label>
          Référence
          <input
            value={draft.reference}
            maxLength={100}
            onChange={(e) => set("reference", e.target.value)}
            required
          />
        </label>
        <label>
          Quantité
          <input
            type="number"
            min="1"
            max="500"
            step="1"
            value={draft.quantity}
            onChange={(e) => set("quantity", e.target.value)}
            required
          />
        </label>
        <div className="rs-actions">
          <button type="submit">Enregistrer la ligne</button>
          <button
            type="button"
            onClick={() => {
              setDraft(line);
              onDirty(false);
              setError("");
            }}
          >
            Abandonner la saisie
          </button>
        </div>
        {error && (
          <p className="rs-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
function ChoiceForm({ state, line, onSave, onDirty }) {
  const current = decision(state, line.id),
    old = state.decisions[line.id],
    all = instructions(state, line.id);
  const [chosen, setChosen] = useState(current?.messageId || ""),
    [reason, setReason] = useState(current?.reason || ""),
    [error, setError] = useState("");
  useEffect(() => {
    setChosen(current?.messageId || "");
    setReason(current?.reason || "");
    setError("");
    onDirty(false);
  }, [JSON.stringify(all), JSON.stringify(line), JSON.stringify(current)]);
  return (
    <form
      className="rs-choice"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave(chosen, reason);
          setError("");
          onDirty(false);
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <h2>Instructions reçues</h2>
      {all.length ? (
        <fieldset>
          <legend className="rs-visually-hidden">
            Instruction à retenir pour {line.id}
          </legend>
          {all.map((m) => (
            <label
              key={m.id}
              className={`rs-instruction ${chosen === m.id ? "is-chosen" : ""}`}
            >
              <input
                type="radio"
                name={`instruction-${line.id}`}
                value={m.id}
                checked={chosen === m.id}
                onChange={() => {
                  setChosen(m.id);
                  onDirty(true);
                }}
              />
              <span>
                <strong>{MOUNTS[m.mount]}</strong>
                <small>
                  {m.id} · {m.at.replace("T", " à ")} · {m.source}
                </small>
                <span>{m.note || "Aucune note complémentaire."}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="rs-empty">
          Aucun choix reçu pour cette ligne. Ajoutez une instruction ou
          rattachez un message en attente.
        </p>
      )}
      <p className="rs-note">
        La date seule ne décide pas du montage. Retenez une instruction après
        vérification.
      </p>
      {old && !current && (
        <p className="rs-reserve">
          La revue précédente n’est plus à jour. Son motif reste dans le dossier
          et les fiches déjà exportées.
        </p>
      )}
      <label>
        Motif du choix
        <textarea
          value={reason}
          maxLength={500}
          rows={2}
          placeholder="Indiquez ce qui confirme le choix pour cette ligne."
          onChange={(e) => {
            setReason(e.target.value);
            onDirty(true);
          }}
        />
      </label>
      <div className="rs-actions">
        <button
          className="rs-primary"
          type="submit"
          disabled={!chosen || !reason.trim()}
        >
          Retenir cette instruction
        </button>
        <button
          type="button"
          onClick={() => {
            setChosen(current?.messageId || "");
            setReason(current?.reason || "");
            onDirty(false);
            setError("");
          }}
        >
          Abandonner la saisie
        </button>
      </div>
      {error && (
        <p className="rs-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
function MessageForm({ line, state, onSave, onDirty }) {
  const initial = { at: "2026-09-17T12:00", mount: "", source: "", note: "" };
  const [draft, setDraft] = useState(initial),
    [error, setError] = useState("");
  const set = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }));
    onDirty(true);
  };
  return (
    <form
      className="rs-new-message"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          let n = 1;
          while (state.messages.some((m) => m.id === `N${n}`)) n++;
          onSave({ ...draft, id: `N${n}`, target: line.id });
          setDraft(initial);
          setError("");
          onDirty(false);
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <div className="rs-section-title">
        <h2>Ajouter une instruction</h2>
        <span>Pour {line.id}</span>
      </div>
      <p>
        Une nouvelle consigne demande une nouvelle revue, même si le montage
        reste identique.
      </p>
      <div className="rs-form-pair">
        <label>
          Montage
          <select
            value={draft.mount}
            onChange={(e) => set("mount", e.target.value)}
            required
          >
            <option value="">Choisir le montage</option>
            {Object.entries(MOUNTS).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date et heure
          <input
            type="datetime-local"
            value={draft.at}
            onChange={(e) => set("at", e.target.value)}
            required
          />
        </label>
      </div>
      <label>
        Source de l’instruction
        <input
          value={draft.source}
          maxLength={100}
          placeholder="Ex. appel client confirmé, cas fictif"
          onChange={(e) => set("source", e.target.value)}
          required
        />
      </label>
      <label>
        Note
        <textarea
          rows={2}
          value={draft.note}
          maxLength={500}
          onChange={(e) => set("note", e.target.value)}
        />
      </label>
      <div className="rs-actions">
        <button type="submit">Ajouter à l’historique</button>
        <button
          type="button"
          onClick={() => {
            setDraft(initial);
            onDirty(false);
            setError("");
          }}
        >
          Effacer la saisie
        </button>
      </div>
      {error && (
        <p className="rs-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
function Orphan({ message, lines, onAssign }) {
  const [target, setTarget] = useState("");
  return (
    <form
      className="rs-orphan"
      onSubmit={(e) => {
        e.preventDefault();
        onAssign(message.id, target);
      }}
    >
      <div>
        <strong>
          {message.id} · {MOUNTS[message.mount]}
        </strong>
        <p>
          {message.source}
          <br />
          Référence reçue : {message.target || "absente"}
        </p>
        <small>{message.note}</small>
      </div>
      <label>
        Ligne à confirmer
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          required
        >
          <option value="">Choisir explicitement</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.id} · {l.reference}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={!target}>
        Rattacher le message
      </button>
    </form>
  );
}
export default function App() {
  useDocumentTitle("Room Service · Carnet de montage");
  const history = useHistory(seed, { max: 60 }),
    state = history.value;
  const [selected, setSelected] = useState(seed.lines[0].id),
    [filter, setFilter] = useState("all"),
    [dirty, setDirty] = useState({}),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0);
  const line = state.lines.find((l) => l.id === selected) || state.lines[0],
    current = decision(state, line.id),
    retained = current
      ? state.messages.find((m) => m.id === current.messageId)
      : null,
    previous = lastExport(state, line.id),
    lineStatus = status(state, line.id),
    orphans = unmatched(state),
    ready = state.lines.filter((l) => decision(state, l.id)),
    isDirty = Object.values(dirty).some(Boolean);
  const setPart = (part, value) => setDirty((d) => ({ ...d, [part]: value }));
  const act = (fn, message) => {
    try {
      history.set(fn(state));
      setError("");
      setNotice(message);
    } catch (err) {
      setError(err.message);
    }
  };
  const load = async (file, type) => {
    if (isDirty)
      throw Error("Enregistrez ou abandonnez les saisies avant un import.");
    const raw = await readLocalFile(
      file,
      type === "json" ? { maxBytes: MAX_DOSSIER_BYTES } : undefined,
    );
    const next =
      type === "lines"
        ? importLines(raw, state)
        : type === "messages"
          ? importMessages(raw, state)
          : restore(raw);
    history.set(next);
    setError("");
    setNotice(
      type === "json"
        ? "Dossier restauré. Les revues sont contrôlées contre les données."
        : "Import terminé. Les identifiants exacts sont rapprochés ; les revues concernées sont à reprendre.",
    );
    setEpoch((e) => e + 1);
  };
  const exportSheet = () => {
    try {
      const out = exportLine(state, line.id);
      downloadReport(
        `room-service-${line.id}-v${out.entry.version}.html`,
        report(out.entry),
      );
      history.set(out.state);
      setNotice(
        `Fiche v${out.entry.version} téléchargée. Aucun envoi à l’atelier.`,
      );
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };
  const exportCsv = () => {
    try {
      const out = exportReady(state);
      downloadCsv(
        "room-service-montages-revus.csv",
        READY_HEADERS,
        readyRows(out.entries),
      );
      history.set(out.state);
      setNotice(
        `${out.entries.length} ligne(s) revue(s) exportée(s). Les autres restent dans le carnet.`,
      );
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <main className="room-service-app">
      <div className="rs-context">
        Étude indépendante · Données fictives · Sans compte
      </div>
      <header className="rs-header">
        <span className="rs-brand">Room Service</span>
        <span>Carnet de montage</span>
        <a href="https://imtoocompedidiv.github.io/portfolio/">JD</a>
      </header>
      <section className="rs-intro">
        <h1>La bonne instruction pour chaque pendentif</h1>
        <p>
          Deux messages donnent des choix différents. Retenez une instruction
          avant de préparer la fiche.
        </p>
      </section>
      <nav className="rs-toolbar" aria-label="Dossier et historique">
        <FileImport
          label="Importer des lignes CSV"
          onFile={(f) => load(f, "lines")}
        />
        <FileImport
          label="Importer des instructions"
          onFile={(f) => load(f, "messages")}
        />
        <button
          disabled={isDirty}
          onClick={() => downloadJson("room-service-dossier.json", state)}
        >
          Enregistrer le dossier
        </button>
        <button
          disabled={!history.canUndo || isDirty}
          onClick={() => {
            history.undo();
            setEpoch((e) => e + 1);
            setNotice("Dernière modification annulée.");
          }}
        >
          Annuler
        </button>
        <button
          disabled={!history.canRedo || isDirty}
          onClick={() => {
            history.redo();
            setEpoch((e) => e + 1);
            setNotice("Modification rétablie.");
          }}
        >
          Rétablir
        </button>
      </nav>
      <details className="rs-files">
        <summary>Modèles de fichiers et reprise du dossier</summary>
        <p>
          Les lignes CSV sont ajoutées ou mises à jour par identifiant. Les
          instructions s’ajoutent, avec rejet d’un identifiant existant au
          contenu différent. Aucune lecture d’email. Maximum 200 lignes et 1 000
          instructions.
        </p>
        <div className="rs-actions">
          <button
            onClick={() =>
              downloadCsv(
                "room-service-lignes-exemple.csv",
                LINE_HEADERS,
                lineRows(seed),
              )
            }
          >
            Modèle de lignes
          </button>
          <button
            onClick={() =>
              downloadCsv(
                "room-service-instructions-exemple.csv",
                MESSAGE_HEADERS,
                messageRows(seed),
              )
            }
          >
            Modèle d’instructions
          </button>
          <FileImport
            label="Reprendre un JSON"
            accept=".json,application/json"
            onFile={(f) => load(f, "json")}
          />
          <button
            disabled={isDirty}
            onClick={() => {
              history.reset();
              setSelected(seed.lines[0].id);
              setDirty({});
              setEpoch((e) => e + 1);
              setNotice("Exemple initial rechargé.");
              setError("");
            }}
          >
            Recharger l’exemple
          </button>
        </div>
        <p>
          Montages CSV : <code>opening</code>, <code>engraved</code>,{" "}
          <code>simple</code>. Dates <code>2026-09-17T12:00</code>. Les données
          disparaissent à la fermeture si le dossier n’est pas téléchargé.
        </p>
      </details>
      {isDirty && (
        <p className="rs-reserve" role="status">
          Saisie en cours. Enregistrez ou abandonnez cette saisie avant de
          changer de ligne, importer ou exporter.
        </p>
      )}
      {notice && (
        <p className="rs-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="rs-error" role="alert">
          {error}
        </p>
      )}
      <div className="rs-workbench">
        <aside className="rs-lines">
          <h2>Lignes de commande</h2>
          <label className="rs-filter">
            Afficher
            <select
              value={filter}
              disabled={isDirty}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Toutes les lignes</option>
              <option value="todo">À revoir</option>
              <option value="ready">Revues</option>
            </select>
          </label>
          <ul>
            {state.lines
              .filter(
                (l) =>
                  filter === "all" ||
                  (filter === "ready"
                    ? decision(state, l.id)
                    : !decision(state, l.id)),
              )
              .map((l) => (
                <li key={l.id}>
                  <button
                    className={l.id === line.id ? "is-selected" : ""}
                    aria-pressed={l.id === line.id}
                    disabled={isDirty && l.id !== line.id}
                    onClick={() => {
                      setSelected(l.id);
                      setDirty({});
                      setError("");
                      setNotice("");
                    }}
                  >
                    <strong>
                      {l.order} / {l.id.split("-").at(-1)}
                    </strong>
                    <span>
                      {l.reference} · {l.quantity} pièce(s)
                    </span>
                    <small
                      className={decision(state, l.id) ? "rs-status-good" : ""}
                    >
                      {status(state, l.id)}
                    </small>
                  </button>
                </li>
              ))}
          </ul>
          <p>
            {ready.length} ligne(s) revue(s) sur {state.lines.length}.<br />
            {orphans.length} message(s) à rattacher.
          </p>
        </aside>
        <section className="rs-main-column" key={`${line.id}-${epoch}`}>
          <div className="rs-line-top">
            <h2>Détails de {line.id}</h2>
            <p>
              {line.reference} · Quantité {line.quantity}
            </p>
            <div className="rs-mount-options">
              {Object.entries(MOUNTS).map(([type, label]) => (
                <div
                  key={type}
                  className={retained?.mount === type ? "is-retained" : ""}
                >
                  <Mount type={type} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <p className="rs-caption">
              Repères visuels abstraits. Dimensions et fabrication à définir
              dans l’atelier.
            </p>
            <LineForm
              line={line}
              onDirty={(v) => setPart("line", v)}
              onSave={(value) => {
                const next = changeLine(state, value);
                history.set(next);
                setNotice(
                  "Ligne enregistrée. Sa revue doit être à jour avant export.",
                );
              }}
            />
          </div>
          <ChoiceForm
            state={state}
            line={line}
            onDirty={(v) => setPart("choice", v)}
            onSave={(m, r) => {
              history.set(decide(state, line.id, m, r));
              setNotice("Instruction retenue. La fiche peut être préparée.");
            }}
          />
          <MessageForm
            state={state}
            line={line}
            onDirty={(v) => setPart("message", v)}
            onSave={(m) => {
              history.set(addMessage(state, m));
              setNotice(
                "Nouvelle instruction ajoutée. Reprenez la revue de cette ligne.",
              );
            }}
          />
        </section>
        <aside className="rs-paper">
          <div className="rs-paper-heading">
            <h2>Fiche atelier</h2>
            <span>
              {previous ? `Dernière sortie v${previous.version}` : "À préparer"}
            </span>
          </div>
          <p>
            {line.order} · {line.id}
          </p>
          <strong className={`rs-paper-status ${current ? "is-ready" : ""}`}>
            {lineStatus}
          </strong>
          <dl>
            <dt>Référence</dt>
            <dd>{line.reference}</dd>
            <dt>Quantité</dt>
            <dd>{line.quantity} pièce(s)</dd>
          </dl>
          <div className="rs-preview">
            <Mount type={retained?.mount} large />
            <strong>
              {retained ? MOUNTS[retained.mount] : "Aucun choix retenu"}
            </strong>
            <p>
              {current
                ? current.reason
                : "La fiche attend une décision explicite."}
            </p>
          </div>
          {previous && lineStatus === "Fiche à remplacer" && (
            <p className="rs-reserve">
              La version {previous.version} téléchargée reste inchangée. Une
              nouvelle fiche sera nécessaire après revue.
            </p>
          )}
          <button
            className="rs-primary"
            disabled={!current || isDirty}
            onClick={exportSheet}
          >
            Préparer la fiche HTML
          </button>
          <p className="rs-caption">
            Téléchargement imprimable. Aucun envoi ni réservation de stock.
          </p>
          <details>
            <summary>
              Versions déjà préparées (
              {state.exports.filter((e) => e.lineId === line.id).length})
            </summary>
            {state.exports
              .filter((e) => e.lineId === line.id)
              .map((e) => (
                <div className="rs-archive" key={e.version}>
                  <strong>
                    v{e.version} · {MOUNTS[e.content.message.mount]}
                  </strong>
                  <span>
                    {e.content.line.quantity} pièce(s) · {e.content.message.id}
                  </span>
                  <button
                    disabled={isDirty}
                    onClick={() =>
                      downloadReport(
                        `room-service-${line.id}-archive-v${e.version}.html`,
                        report(e),
                      )
                    }
                  >
                    Relire l’ancienne fiche
                  </button>
                </div>
              ))}
          </details>
        </aside>
      </div>
      <section className="rs-unmatched">
        <div className="rs-section-title">
          <h2>Messages à rattacher</h2>
          <span>{orphans.length} en attente</span>
        </div>
        <p>
          Une référence inconnue reste ici. Le rapprochement demande une
          décision, même si un nom de produit ressemble.
        </p>
        {orphans.map((m) => (
          <Orphan
            key={m.id}
            message={m}
            lines={state.lines}
            onAssign={(mid, lid) => {
              if (isDirty) {
                setError(
                  "Terminez la saisie en cours avant de rattacher un message.",
                );
                return;
              }
              act(
                (s) => assignMessage(s, mid, lid),
                "Message rattaché. La ligne concernée demande une revue.",
              );
            }}
          />
        ))}
        {!orphans.length && (
          <p className="rs-notice">
            Tous les messages sont rattachés à une ligne.
          </p>
        )}
      </section>
      <section className="rs-outputs">
        <div>
          <h2>Préparer la suite</h2>
          <p>
            Le CSV contient uniquement les {ready.length} ligne(s) revue(s). Les{" "}
            {state.lines.length - ready.length} autres lignes et les références
            inconnues restent dans les questions à éclaircir.
          </p>
        </div>
        <div className="rs-actions">
          <button
            className="rs-primary"
            disabled={!ready.length || isDirty}
            onClick={exportCsv}
          >
            Exporter les montages revus
          </button>
          <button
            disabled={isDirty}
            onClick={() =>
              downloadText("room-service-questions.txt", questions(state))
            }
          >
            Télécharger les questions
          </button>
        </div>
      </section>
      <p className="rs-local">
        Fichiers traités dans ce navigateur. Aucune connexion à Odoo, Shopify ou
        une messagerie.
      </p>
      <DemoFooter />
    </main>
  );
}

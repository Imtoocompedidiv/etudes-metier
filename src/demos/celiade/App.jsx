import React, { useMemo, useState } from "react";
import "@fontsource/encode-sans/latin-400.css";
import "@fontsource/encode-sans/latin-500.css";
import "@fontsource/encode-sans/latin-600.css";
import "@fontsource/encode-sans/latin-700.css";
import { useHistory } from "../../shared/state.js";
import {
  FileImport,
  ErrorMessage,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadJson,
  downloadText,
  downloadReport,
} from "../../shared/files.js";
import {
  initialState,
  validState,
  restoreState,
  latest,
  pieceStatus,
  statusLabel,
  blockers,
  productionCalendar,
  dateLabel,
  day,
  iso,
  checkVersion,
  receiveVersion,
  applySettings,
  addPiece,
  fixDeparture,
  releaseIsCurrent,
  requestText,
} from "./model.js";
import "./styles.css";

function Calendar({ value }) {
  const [expanded, setExpanded] = useState(false);
  const first = day(value.start),
    weekday = new Date(first * 86400000).getUTCDay();
  const from = first - ((weekday + 6) % 7),
    end = day(value.end);
  const until = end + (6 - ((new Date(end * 86400000).getUTCDay() + 6) % 7));
  const kinds = new Map(value.days.map((d) => [d.date, d]));
  const all = Array.from({ length: until - from + 1 }, (_, i) => iso(from + i));
  return (
    <>
      <div className="cel-date-route">
        <div>
          <span>Début de préparation</span>
          <strong>{dateLabel(value.start)}</strong>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <span>Fin prévisionnelle</span>
          <strong>{dateLabel(value.end)}</strong>
        </div>
      </div>
      <div
        className="cel-calendar"
        role="table"
        aria-label="Jours du calendrier de production"
      >
        <div role="row" className="cel-week-head">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <span role="columnheader" key={d}>
              {d}
            </span>
          ))}
        </div>
        {Array.from(
          {
            length: Math.ceil(
              (expanded ? all.length : Math.min(all.length, 42)) / 7,
            ),
          },
          (_, week) => (
            <div role="row" key={week}>
              {all.slice(week * 7, week * 7 + 7).map((date) => {
                const info = kinds.get(date),
                  kind =
                    date === value.start
                      ? "start"
                      : date === value.end
                        ? "end"
                        : info?.kind || "outside";
                return (
                  <span
                    key={date}
                    role="cell"
                    className={`cel-day ${kind}`}
                    title={`${dateLabel(date)} · ${kind === "start" ? "Départ non compté" : kind === "end" ? "Fin prévisionnelle" : kind === "work" ? `Jour de production ${info.workday}` : kind === "closed" ? "Fermeture déclarée" : kind === "weekend" ? "Week-end" : "Hors période"}`}
                  >
                    <span>{Number(date.slice(-2))}</span>
                  </span>
                );
              })}
            </div>
          ),
        )}
      </div>
      {all.length > 42 && (
        <button className="cel-text" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Réduire le calendrier" : "Voir toute la période"}
        </button>
      )}
      <div className="cel-legend">
        <span>
          <i className="start" />
          Départ
        </span>
        <span>
          <i className="work" />
          Jour compté
        </span>
        <span>
          <i className="closed" />
          Fermeture
        </span>
      </div>
    </>
  );
}

function Settings({ document, onApply }) {
  const [draft, setDraft] = useState({
    ...document.settings,
    closed: document.settings.closed.join("\n"),
  });
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify({
      ...document.settings,
      closed: document.settings.closed.join("\n"),
    });
  const update = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <form
      className="cel-settings"
      onSubmit={(e) => {
        e.preventDefault();
        onApply({
          ...draft,
          closed: draft.closed
            .split(/\r?\n/)
            .map((x) => x.trim())
            .filter(Boolean),
        });
      }}
    >
      <h2>Préparer le calendrier</h2>
      <label>
        Durée de la réunion (minutes)
        <input
          aria-label="Durée de la réunion"
          type="number"
          min="1"
          max="1440"
          required
          value={draft.duration}
          onChange={(e) => update("duration", e.target.value)}
        />
      </label>
      <label>
        Date de préparation
        <input
          aria-label="Date de préparation"
          type="date"
          required
          value={draft.preparedOn}
          onChange={(e) => update("preparedOn", e.target.value)}
        />
      </label>
      <label>
        Délai jusqu’à 5 h (jours ouvrés)
        <input
          aria-label="Délai jusqu’à 5 heures"
          type="number"
          min="1"
          max="60"
          required
          value={draft.shortDays}
          onChange={(e) => update("shortDays", e.target.value)}
        />
      </label>
      <label>
        Délai au-delà de 5 h (jours ouvrés)
        <input
          aria-label="Délai au-delà de 5 heures"
          type="number"
          min="1"
          max="60"
          required
          value={draft.longDays}
          onChange={(e) => update("longDays", e.target.value)}
        />
      </label>
      <label>
        Jours fermés, un par ligne
        <textarea
          aria-label="Jours fermés"
          value={draft.closed}
          onChange={(e) => update("closed", e.target.value)}
          rows="2"
          maxLength="1200"
          placeholder="AAAA-MM-JJ"
        />
      </label>
      <p className="cel-hint">
        Format AAAA-MM-JJ. Samedis et dimanches exclus.
      </p>
      <button type="submit" disabled={!dirty}>
        Appliquer le calendrier
      </button>
      {dirty && (
        <p className="cel-draft-note" role="status">
          Réglages modifiés. Appliquez-les pour recalculer.
        </p>
      )}
    </form>
  );
}

function PieceDetail({ piece, preparedOn, onCheck, onReceive }) {
  const [checked, setChecked] = useState(false),
    [receiving, setReceiving] = useState(!latest(piece));
  const [form, setForm] = useState({
    name: "",
    receivedOn: preparedOn,
    note: "",
  });
  const current = latest(piece);
  return (
    <section
      className="cel-detail"
      aria-label="Détail de la pièce sélectionnée"
    >
      <h2>{piece.label}</h2>
      <p>
        {!current
          ? "Cette pièce est attendue. Déclarez sa réception dans l’inventaire."
          : current.checked
            ? "La version courante est contrôlée dans cet exemple."
            : "La nouvelle version doit être vérifiée."}
      </p>
      {piece.versions.length > 0 && (
        <ol className="cel-version-list">
          {[...piece.versions].reverse().map((v, i) => {
            const number = piece.versions.length - i;
            return (
              <li key={number} className={v.checked ? "checked" : "review"}>
                <div>
                  <strong>
                    v{number} · {v.name}
                  </strong>
                  <span> · reçu le {dateLabel(v.receivedOn, true)}</span>
                </div>
                <p>
                  {i === 0
                    ? v.checked
                      ? "Version courante contrôlée"
                      : "En attente de contrôle"
                    : v.checked
                      ? "Ancienne version contrôlée"
                      : "Ancienne version non contrôlée"}
                </p>
                {v.note && <p className="cel-version-note">{v.note}</p>}
              </li>
            );
          })}
        </ol>
      )}
      {current && !current.checked && (
        <div className="cel-check-action">
          <label>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            J’ai contrôlé cette version dans l’exemple
          </label>
          <button
            className="cel-primary"
            disabled={!checked}
            onClick={() => onCheck(true)}
          >
            Accepter cette version
          </button>
        </div>
      )}
      {current?.checked && (
        <button className="cel-text" onClick={() => onCheck(false)}>
          Remettre cette version en examen
        </button>
      )}
      {!receiving && (
        <button onClick={() => setReceiving(true)}>
          Déclarer une réception
        </button>
      )}
      {receiving && (
        <form
          className="cel-receive"
          onSubmit={(e) => {
            e.preventDefault();
            onReceive(form);
          }}
        >
          <h3>
            {current
              ? "Déclarer la version suivante"
              : "Déclarer une réception"}
          </h3>
          <label>
            Nom du fichier dans l’inventaire
            <input
              aria-label="Nom du fichier reçu"
              required
              maxLength="180"
              value={form.name}
              placeholder={
                piece.id === "annexe" ? "annexe-budget.pdf" : "document-v2.pdf"
              }
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label>
            Date de réception déclarée
            <input
              aria-label="Date de réception déclarée"
              type="date"
              required
              max={preparedOn}
              value={form.receivedOn}
              onChange={(e) =>
                setForm((f) => ({ ...f, receivedOn: e.target.value }))
              }
            />
          </label>
          <label>
            Note sur cette version
            <textarea
              aria-label="Note sur cette version"
              rows="2"
              maxLength="500"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </label>
          <p className="cel-hint">
            Métadonnées uniquement. Aucun PDF, audio ou document de réunion
            n’est chargé.
          </p>
          <div className="cel-actions">
            <button type="submit" className="cel-primary">
              Enregistrer la réception
            </button>
            {current && (
              <button type="button" onClick={() => setReceiving(false)}>
                Annuler la réception
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

export default function Celiade() {
  useDocumentTitle("Céliade · Le dossier prêt à rédiger");
  const history = useHistory(initialState, {
    key: "celiade:v1",
    validate: validState,
  });
  const d = history.value,
    [selected, setSelected] = useState("odj"),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [pending, setPending] = useState(null),
    [request, setRequest] = useState(false),
    [newPiece, setNewPiece] = useState(""),
    [importKey, setImportKey] = useState(0);
  const piece = d.pieces.find((p) => p.id === selected) || d.pieces[0];
  const missing = blockers(d),
    cal = useMemo(() => productionCalendar(d), [d]);
  const current = releaseIsCurrent(d);
  function change(fn, message) {
    try {
      const next = fn(d);
      history.set(next);
      setError("");
      setFeedback(message);
    } catch (e) {
      setError(e.message);
    }
  }
  function download(fn, message) {
    try {
      fn();
      setFeedback(message);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  function reset() {
    history.reset();
    setSelected("odj");
    setError("");
    setFeedback(
      "Inventaire initial restauré. Annuler permet de retrouver le précédent.",
    );
    setPending(null);
    setRequest(false);
    setImportKey((k) => k + 1);
  }
  const importDossier = async (file) =>
    setPending({
      data: restoreState(await readLocalFile(file)),
      name: file.name,
    });
  const exportSheet = () =>
    downloadReport("celiade-fiche-de-depart.html", {
      title: "Fiche de départ du dossier",
      subtitle: `${d.title} · Réunion fictive du ${dateLabel(d.meeting)}`,
      sections: [
        {
          title: current ? "Départ déclaré" : "Départ à confirmer",
          paragraphs: [
            `Préparation : ${dateLabel(cal.start)}. Production indicative : ${dateLabel(cal.end)}.`,
            `${cal.count} jours comptés après le départ, samedis et dimanches exclus. Fermetures déclarées : ${d.settings.closed.map((x) => dateLabel(x, true)).join(", ") || "aucune"}.`,
            `Cette fiche décrit un inventaire et des contrôles déclarés. Aucun fichier de réunion n’a été lu. Calendrier de production indicatif, sans calcul d’échéance juridique.`,
          ],
        },
        {
          title: "Versions retenues",
          headers: [
            "Pièce",
            "Version",
            "Fichier déclaré",
            "Réception",
            "Contrôle",
          ],
          rows: d.pieces.map((p) => [
            p.label,
            p.versions.length ? `v${p.versions.length}` : "Aucune",
            latest(p)?.name || "",
            latest(p)?.receivedOn || "",
            statusLabel(pieceStatus(p)),
          ]),
        },
        {
          title: "Journal des décisions",
          headers: ["Ordre", "Action"],
          rows: d.journal.map((j) => [j.index, j.text]),
        },
      ],
    });
  return (
    <div className="cel-app">
      <header className="cel-header">
        <div className="cel-brand">
          <strong>Céliade</strong>
          <span>Étude indépendante</span>
        </div>
        <div className="cel-actions">
          <FileImport
            key={importKey}
            label="Importer un dossier"
            accept=".json,application/json"
            onFile={importDossier}
          />
          <button disabled={!history.canUndo} onClick={history.undo}>
            Annuler
          </button>
          <button disabled={!history.canRedo} onClick={history.redo}>
            Rétablir
          </button>
          <button onClick={reset}>Revenir à l’exemple</button>
        </div>
      </header>
      <div className="cel-layout">
        <main className="cel-paper">
          <h1>Le dossier prêt à rédiger</h1>
          <p className="cel-lead">
            Vérifiez les pièces et leurs versions avant de fixer le départ.
          </p>
          <p className="cel-meeting">
            Réunion fictive du {dateLabel(d.meeting)} ·{" "}
            {Math.floor(d.settings.duration / 60)} h{" "}
            {String(d.settings.duration % 60).padStart(2, "0")}
          </p>
          <ErrorMessage>{error}</ErrorMessage>
          {pending && (
            <section className="cel-import-review">
              <h2>Charger {pending.name}</h2>
              <p>
                {pending.data.pieces.length} pièces et{" "}
                {pending.data.pieces.reduce((n, p) => n + p.versions.length, 0)}{" "}
                versions reconnues. Le dossier courant sera remplacé ; l’action
                reste annulable.
              </p>
              <div className="cel-actions">
                <button
                  className="cel-primary"
                  onClick={() => {
                    history.set(pending.data);
                    setSelected(pending.data.pieces[0].id);
                    setPending(null);
                    setError("");
                    setFeedback(
                      "Inventaire chargé avec ses versions et son journal.",
                    );
                  }}
                >
                  Charger cet inventaire
                </button>
                <button onClick={() => setPending(null)}>
                  Garder le dossier actuel
                </button>
              </div>
            </section>
          )}
          <div
            className="cel-manifest"
            role="region"
            aria-label="Inventaire des pièces"
            tabIndex="0"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Pièce</th>
                  <th scope="col">Version reçue</th>
                  <th scope="col">État</th>
                </tr>
              </thead>
              <tbody>
                {d.pieces.map((p) => (
                  <tr
                    key={p.id}
                    className={piece.id === p.id ? "selected" : ""}
                  >
                    <td>
                      <button
                        aria-pressed={piece.id === p.id}
                        onClick={() => {
                          setSelected(p.id);
                          setError("");
                        }}
                      >
                        {p.label}
                      </button>
                    </td>
                    <td>{latest(p) ? `v${p.versions.length}` : "Aucune"}</td>
                    <td>
                      <span className={`cel-piece-state ${pieceStatus(p)}`}>
                        <i aria-hidden="true" />
                        {statusLabel(pieceStatus(p))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PieceDetail
            key={`${piece.id}:${piece.versions.length}:${latest(piece)?.checked}:${d.settings.preparedOn}`}
            piece={piece}
            preparedOn={d.settings.preparedOn}
            onCheck={(checked) =>
              change(
                (x) => checkVersion(x, piece.id, checked),
                checked
                  ? "Version courante contrôlée."
                  : "Version remise en examen.",
              )
            }
            onReceive={(entry) =>
              change(
                (x) => receiveVersion(x, piece.id, entry),
                "Réception déclarée. La nouvelle version attend son contrôle.",
              )
            }
          />
        <details className="cel-management" key={importKey}>
            <summary>Adapter et conserver cet inventaire</summary>
            <form
              className="cel-add-piece"
              onSubmit={(e) => {
                e.preventDefault();
                change(
                  (x) => addPiece(x, newPiece),
                  "Pièce ajoutée aux éléments attendus.",
                );
              }}
            >
              <label>
                Nouvelle pièce obligatoire
                <input
                  aria-label="Nouvelle pièce obligatoire"
                  value={newPiece}
                  onChange={(e) => setNewPiece(e.target.value)}
                  maxLength="180"
                  required
                  placeholder="Annexe activité"
                />
              </label>
              <button type="submit">Ajouter la pièce</button>
            </form>
            <div className="cel-actions">
              <button
                onClick={() =>
                  download(
                    () => downloadJson("celiade-inventaire.json", d),
                    "Inventaire JSON préparé pour téléchargement.",
                  )
                }
              >
                Enregistrer l’inventaire JSON
              </button>
              <button
                onClick={() =>
                  download(
                    () => downloadJson("celiade-exemple.json", initialState()),
                    "Fichier exemple préparé pour téléchargement.",
                  )
                }
              >
                Fichier exemple
              </button>
            </div>
            <h3>Journal des décisions</h3>
            {d.journal.length ? (
              <ol className="cel-journal">
                {d.journal.map((j) => (
                  <li key={j.index}>{j.text}</li>
                ))}
              </ol>
            ) : (
              <p>Aucune modification depuis l’exemple initial.</p>
            )}
          </details>
        </main>
        <aside className="cel-sidebar" aria-label="Calendrier de préparation">
          <Settings
            key={JSON.stringify(d.settings)}
            document={d}
            onApply={(input) =>
              change(
                (x) => applySettings(x, input),
                "Calendrier recalculé avec les paramètres affichés.",
              )
            }
          />
          <section className="cel-projection">
            <h2>Projection de production</h2>
            <Calendar value={cal} />
            <p>
              {missing.length
                ? `Projection seulement. ${missing.length} pièce${missing.length > 1 ? "s restent" : " reste"} à régler.`
                : current
                  ? "Départ déclaré pour les versions contrôlées de cet inventaire."
                  : "Pièces contrôlées. Le départ reste à fixer."}
            </p>
            <p className="cel-hint">
              Calendrier indicatif de production. Le jour de départ n’est pas
              compté. Aucun délai juridique n’est calculé.
            </p>
          </section>
        </aside>
      </div>
      <section
        className={`cel-departure ${current ? "ready" : ""}`}
        aria-label="État du départ"
      >
        <div>
          <h2>
            {current
              ? "Départ fixé dans l’inventaire"
              : d.release
                ? "Départ à confirmer à nouveau"
                : "Départ en attente"}
          </h2>
          <p>
            {missing.length
              ? missing
                  .map(
                    (p) =>
                      `${p.label} ${pieceStatus(p) === "missing" ? "manquante" : "à recontrôler"}`,
                  )
                  .join(" · ")
              : current
                ? `Préparation ${dateLabel(cal.start, true)} · Production indicative ${dateLabel(cal.end, true)}`
                : "Toutes les pièces attendues sont contrôlées."}
          </p>
        </div>
        <div className="cel-actions">
          <button
            className="cel-primary"
            disabled={missing.length > 0 || current}
            onClick={() =>
              change(
                fixDeparture,
                "Départ fixé pour ces versions et ce calendrier.",
              )
            }
          >
            Fixer le départ du dossier
          </button>
          <button onClick={() => setRequest(!request)}>
            {request ? "Fermer la demande" : "Préparer la demande de pièces"}
          </button>
          {current && (
            <button
              onClick={() =>
                download(
                  exportSheet,
                  "Fiche de départ HTML préparée pour téléchargement.",
                )
              }
            >
              Exporter la fiche de départ
            </button>
          )}
        </div>
      </section>
      {request && (
        <section className="cel-request" aria-label="Demande de pièces">
          <h2>Demande fondée sur l’inventaire courant</h2>
          <pre>{requestText(d)}</pre>
          <button
            onClick={() =>
              download(
                () =>
                  downloadText("celiade-demande-de-pieces.txt", requestText(d)),
                "Brouillon TXT préparé. Aucun message envoyé.",
              )
            }
          >
            Télécharger le brouillon TXT
          </button>
        </section>
      )}
      <p className="cel-feedback" role="status" aria-live="polite">
        {feedback}
        {!history.storageAvailable
          ? " Sauvegarde locale indisponible : exportez l’inventaire JSON pour le conserver."
          : ""}
      </p>
      <footer className="cel-footer">
        <span>
          Inventaire fictif · Aucun document de réunion chargé · Traitement
          local
        </span>
        <a href="https://imtoocompedidiv.github.io/portfolio/">
          Conception et développement par JD
        </a>
      </footer>
    </div>
  );
}

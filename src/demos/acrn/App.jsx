import React, { useEffect, useMemo, useState } from "react";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import { useHistory } from "../../shared/state.js";
import {
  FileImport,
  ErrorMessage,
  DemoFooter,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  parseCsv,
  readLocalFile,
  downloadCsv,
  downloadJson,
  downloadReport,
} from "../../shared/files.js";
import {
  seed,
  validProject,
  normalizeProject,
  parseAssets,
  parseBookings,
  parseParams,
  assetHeaders,
  bookingHeaders,
  dateDay,
  dateISO,
  shiftDate,
  proposal,
  applyProposal,
  conflictsFor,
  planningRows,
  movements,
} from "./model.js";
import "./styles.css";
const fr = (s) =>
  s
    ? new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "UTC",
      }).format(new Date(`${s}T00:00:00Z`))
    : "Inconnue";
function Timeline({ project, selected, onSelect, preview, start, onMove }) {
  const first = dateDay(start),
    span = 21;
  const days = Array.from({ length: span }, (_, i) => dateISO(first + i));
  const position = (a, b) => ({
    left: `${(Math.max(0, dateDay(a) - first) / span) * 100}%`,
    width: `${(Math.max(0, Math.min(span, dateDay(b) - first + 1) - Math.max(0, dateDay(a) - first)) / span) * 100}%`,
  });
  return (
    <section className="acrn-timeline">
      <div className="acrn-section-head">
        <div>
          <button
            onClick={() => onMove(-7)}
            aria-label="Voir sept jours plus tôt"
          >
            ‹
          </button>
          <h2>
            {new Intl.DateTimeFormat("fr-FR", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${start}T00:00:00Z`))}
          </h2>
          <button
            onClick={() => onMove(7)}
            aria-label="Voir sept jours plus tard"
          >
            ›
          </button>
        </div>
        <span>Locations et immobilisations</span>
      </div>
      <div
        className="acrn-scroll"
        role="region"
        aria-label="Planning horizontal du parc, défilement possible"
        tabIndex="0"
      >
        <div className="acrn-calendar">
          <div className="acrn-calendar-head">
            <strong>Appareil</strong>
            <div>
              {days.map((d, i) => (
                <span key={d}>{i % 3 === 0 ? fr(d) : ""}</span>
              ))}
            </div>
          </div>
          {project.assets.map((a) => (
            <div className="acrn-calendar-row" key={a.appareil}>
              <div className="acrn-device">
                <strong>{a.appareil}</strong>
                <span>{a.designation}</span>
                <small>Validité {fr(a.validite)}</small>
              </div>
              <div className="acrn-track">
                {project.bookings
                  .filter(
                    (b) =>
                      b.appareil === a.appareil &&
                      dateDay(b.fin) +
                        project.params.transport +
                        project.params.atelier >=
                        first &&
                      dateDay(b.debut) < first + span,
                  )
                  .map((b) => {
                    const issues = conflictsFor(project, b);
                    return (
                      <React.Fragment key={b.location}>
                        <span
                          className="acrn-turnaround"
                          style={position(
                            shiftDate(b.fin, 1),
                            shiftDate(
                              b.fin,
                              project.params.transport + project.params.atelier,
                            ),
                          )}
                        />
                        <button
                          className={`acrn-event ${selected === b.location ? "selected" : ""} ${issues.length ? "has-issue" : ""}`}
                          style={position(b.debut, b.fin)}
                          onClick={() => onSelect(b.location)}
                          title={`${b.location} · ${b.client} · ${fr(b.debut)} au ${fr(b.fin)}${issues.length ? " · Points à vérifier" : ""}`}
                        >
                          <strong>{b.client}</strong>
                          <span>
                            {fr(b.debut)} – {fr(b.fin)}
                          </span>
                        </button>
                      </React.Fragment>
                    );
                  })}
                {preview?.candidate.appareil === a.appareil &&
                  dateDay(preview.candidate.fin) >
                    dateDay(preview.booking.fin) && (
                    <span
                      className="acrn-extension"
                      style={position(
                        shiftDate(preview.booking.fin, 1),
                        preview.candidate.fin,
                      )}
                    >
                      Prolongation envisagée
                    </span>
                  )}
                {a.validite &&
                  dateDay(a.validite) >= first &&
                  dateDay(a.validite) < first + span && (
                    <span
                      className="acrn-validity"
                      style={{
                        left: `${((dateDay(a.validite) - first + 1) / span) * 100}%`,
                      }}
                      title={`Validité métrologique jusqu’au ${fr(a.validite)}`}
                    >
                      <span>{fr(a.validite)}</span>
                    </span>
                  )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="acrn-legend">
        <span>
          <i className="booking" />
          Location
        </span>
        <span>
          <i className="turnaround" />
          Transport et atelier
        </span>
        <span>
          <i className="deadline" />
          Fin de validité
        </span>
        <span>Dates incluses. Disponibilité après immobilisation.</span>
      </div>
    </section>
  );
}
export default function App() {
  useDocumentTitle("ACRN · Parc de location");
  const history = useHistory(seed, { key: "acrn:v1", validate: validProject });
  const project = history.value;
  const [selected, setSelected] = useState("LOC-104"),
    [end, setEnd] = useState("2026-09-27"),
    [replacement, setReplacement] = useState("CT-108"),
    [start, setStart] = useState("2026-09-14");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(null),
    [clearBookings, setClearBookings] = useState(false),
    [showEditor, setShowEditor] = useState(false),
    [filter, setFilter] = useState("selected"),
    [importEpoch, setImportEpoch] = useState(0);
  const preview = useMemo(() => {
    try {
      return proposal(project, selected, end);
    } catch (e) {
      return { error: e.message };
    }
  }, [project, selected, end]);
  const movementRows = movements(project).filter(
    (m) =>
      filter === "all" ||
      m.location === selected ||
      m.location.startsWith(selected + "-R"),
  );
  const selectedBooking = project.bookings.find((b) => b.location === selected);
  useEffect(() => {
    if (
      project.bookings.length &&
      !project.bookings.some((b) => b.location === selected)
    ) {
      setSelected(project.bookings[0].location);
      setEnd(shiftDate(project.bookings[0].fin, 4));
      setReplacement("");
    }
  }, [project.bookings, selected]);
  function commit(next, text) {
    next.journal = [
      ...(next.journal || []),
      { at: new Date().toISOString(), text },
    ].slice(-40);
    history.set(next);
    setError("");
    setNotice(text);
  }
  function choose(id) {
    setSelected(id);
    const b = project.bookings.find((b) => b.location === id);
    if (b) setEnd(shiftDate(b.fin, 4));
    setReplacement("");
    setNotice("");
    setError("");
  }
  async function ingest(file, type) {
    const text = await readLocalFile(file);
    let value;
    if (type === "json") value = normalizeProject(JSON.parse(text));
    else {
      const rows = parseCsv(text, {
        requiredHeaders: type === "assets" ? assetHeaders : bookingHeaders,
      }).rows;
      value =
        type === "assets"
          ? parseAssets(rows)
          : parseBookings(rows, project.assets);
    }
    setPending({ type, value, name: file.name });
    setClearBookings(false);
    setError("");
  }
  const missingAssets =
    pending?.type === "assets"
      ? project.bookings.filter(
          (b) => !pending.value.some((a) => a.appareil === b.appareil),
        )
      : [];
  function acceptImport() {
    try {
      let next =
        pending.type === "json"
          ? pending.value
          : { ...project, [pending.type]: pending.value };
      if (pending.type === "assets" && missingAssets.length) {
        if (!clearBookings)
          throw new Error(
            "Confirmez le retrait des locations liées aux appareils absents.",
          );
        next.bookings = project.bookings.filter((b) =>
          pending.value.some((a) => a.appareil === b.appareil),
        );
      }
      next = normalizeProject(next);
      commit(next, `Import de ${pending.name}`);
      setPending(null);
      if (!next.bookings.some((b) => b.location === selected)) {
        setSelected(next.bookings[0]?.location || "");
        setEnd(next.bookings[0] ? shiftDate(next.bookings[0].fin, 4) : "");
      }
    } catch (e) {
      setError(e.message);
    }
  }
  function apply(withReplacement) {
    try {
      const next = applyProposal(
        project,
        selected,
        end,
        withReplacement ? replacement : "",
      );
      commit(
        next,
        withReplacement
          ? `Prolongation ${selected} jusqu’au ${fr(end)} avec ${replacement}.`
          : `Prolongation ${selected} jusqu’au ${fr(end)}.`,
      );
      const last = withReplacement
        ? next.bookings.at(-1)
        : next.bookings.find((b) => b.location === selected);
      setSelected(last.location);
      setEnd(last.fin);
      setReplacement("");
    } catch (e) {
      setError(e.message);
    }
  }
  function parameter(key, v) {
    try {
      const params = parseParams({ ...project.params, [key]: v });
      commit({ ...project, params }, `Paramètre ${key} : ${v} jours.`);
    } catch (e) {
      setError(e.message);
    }
  }
  function exportPlanning() {
    const rows = planningRows(project);
    downloadCsv(
      "acrn-planning.csv",
      [
        ...bookingHeaders,
        "validite",
        "transport_jours",
        "atelier_jours",
        "arrivee_atelier",
        "disponible_au_plus_tot",
        "points_a_verifier",
      ],
      rows,
    );
    setNotice(
      "Le fichier CSV du planning a été généré avec les paramètres et les points à vérifier.",
    );
  }
  function report() {
    downloadReport("acrn-mouvements.html", {
      title: "Mouvements du parc de location",
      subtitle: `Exemple indépendant · Transport ${project.params.transport} jours · Atelier ${project.params.atelier} jours · Dates incluses`,
      sections: [
        {
          title: "Mouvements prévus",
          headers: ["Date", "Appareil", "Opération", "Destination", "Location"],
          rows: movementRows.map((m) => [
            m.date,
            m.appareil,
            m.operation,
            m.destination,
            m.location,
          ]),
        },
        {
          title: "Points à vérifier",
          paragraphs: planningRows(project)
            .filter((b) => b.points_a_verifier)
            .map((b) => `${b.location} : ${b.points_a_verifier}`),
        },
      ],
    });
    setNotice("Le rapport HTML imprimable a été généré.");
  }
  return (
    <main className="acrn-app">
      <header className="acrn-top">
        <strong>
          ACRN <span>/ Parc de location</span>
        </strong>
        <span>Prototype indépendant · Données fictives · Traitement local</span>
      </header>
      <div className="acrn-body">
        <div className="acrn-title">
          <div>
            <h1>Prolongations et disponibilité métrologique</h1>
            <p>
              Allongez la location du CT-104, puis examinez les remplacements
              possibles.
            </p>
          </div>
          <div className="acrn-tools">
            <FileImport
              key={`assets-${importEpoch}`}
              label="Importer le parc"
              onFile={(f) => ingest(f, "assets")}
            />
            <FileImport
              key={`bookings-${importEpoch}`}
              label="Importer les locations"
              onFile={(f) => ingest(f, "bookings")}
            />
            <button
              onClick={() => {
                history.undo();
                setNotice("La dernière modification a été annulée.");
                setError("");
              }}
              disabled={!history.canUndo}
            >
              Annuler
            </button>
            <button
              onClick={() => {
                history.redo();
                setNotice("La modification a été rétablie.");
                setError("");
              }}
              disabled={!history.canRedo}
            >
              Rétablir
            </button>
            <button className="acrn-primary" onClick={exportPlanning}>
              Exporter le planning
            </button>
          </div>
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        {notice && (
          <p role="status" className="acrn-notice">
            {notice}
          </p>
        )}
        {!history.storageAvailable && (
          <p role="status">
            La sauvegarde locale est indisponible. Exportez le dossier JSON pour
            conserver vos modifications.
          </p>
        )}
        {pending && (
          <section
            className="acrn-import-review"
            aria-label="Vérifier l’import"
          >
            <h2>Importer {pending.name}</h2>
            <p>
              {pending.type === "json"
                ? `${pending.value.assets.length} appareils et ${pending.value.bookings.length} locations`
                : `${pending.value.length} lignes`}{" "}
              remplaceront les données correspondantes. L’opération pourra être
              annulée.
            </p>
            {missingAssets.length > 0 && (
              <label>
                <input
                  type="checkbox"
                  checked={clearBookings}
                  onChange={(e) => setClearBookings(e.target.checked)}
                />
                Retirer aussi les {missingAssets.length} locations d’appareils
                absents de ce parc.
              </label>
            )}
            <div>
              <button
                className="acrn-primary"
                onClick={acceptImport}
                disabled={missingAssets.length > 0 && !clearBookings}
              >
                Confirmer l’import
              </button>
              <button onClick={() => setPending(null)}>
                Conserver le dossier actuel
              </button>
            </div>
          </section>
        )}
        <div className="acrn-workspace">
          <div className="acrn-main-column">
            <Timeline
              project={project}
              selected={selected}
              onSelect={choose}
              preview={preview.error ? null : preview}
              start={start}
              onMove={(n) => setStart(shiftDate(start, n))}
            />
            <section className="acrn-movements">
              <div className="acrn-section-head">
                <h2>Mouvements à prévoir</h2>
                <label>
                  Afficher{" "}
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="selected">La location choisie</option>
                    <option value="all">Tout le parc</option>
                  </select>
                </label>
              </div>
              <div
                className="acrn-scroll"
                role="region"
                tabIndex="0"
                aria-label="Mouvements, tableau défilant"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Appareil</th>
                      <th>Opération</th>
                      <th>Destination</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movementRows.map((m, i) => (
                      <tr key={`${m.location}-${i}`}>
                        <td>{fr(m.date)}</td>
                        <td>{m.appareil}</td>
                        <td>{m.operation}</td>
                        <td>{m.destination}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!movementRows.length && (
                  <p>
                    Aucun mouvement pour cette sélection. Choisissez une
                    location ou importez un fichier.
                  </p>
                )}
              </div>
              <div className="acrn-section-actions">
                <button
                  onClick={() => {
                    downloadCsv(
                      "acrn-mouvements.csv",
                      [
                        "date",
                        "appareil",
                        "operation",
                        "destination",
                        "location",
                      ],
                      movementRows,
                    );
                    setNotice("Le CSV des mouvements affichés a été généré.");
                  }}
                >
                  Exporter ces mouvements
                </button>
                <button onClick={report}>Rapport imprimable</button>
              </div>
            </section>
            <section className="acrn-data">
              <div className="acrn-section-head">
                <h2>Données et paramètres du parc</h2>
                <button
                  onClick={() => setShowEditor(!showEditor)}
                  aria-expanded={showEditor}
                >
                  {showEditor ? "Fermer les données" : "Modifier les données"}
                </button>
              </div>
              {showEditor && (
                <>
                  <p>
                    Les dates de validité sont des données de planning. Une
                    modification doit provenir d’un document validé par votre
                    métrologue.
                  </p>
                  <div
                    className="acrn-scroll"
                    tabIndex="0"
                    role="region"
                    aria-label="Données des appareils"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Appareil</th>
                          <th>Famille</th>
                          <th>Validité indiquée</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.assets.map((a) => (
                          <tr key={a.appareil}>
                            <th>{a.appareil}</th>
                            <td>{a.famille}</td>
                            <td>
                              <input
                                type="date"
                                aria-label={`Validité ${a.appareil}`}
                                value={a.validite}
                                onChange={(e) => {
                                  try {
                                    const assets = parseAssets(
                                      project.assets.map((x) =>
                                        x.appareil === a.appareil
                                          ? { ...x, validite: e.target.value }
                                          : x,
                                      ),
                                    );
                                    commit(
                                      { ...project, assets },
                                      `Date de validité modifiée pour ${a.appareil}.`,
                                    );
                                  } catch (err) {
                                    setError(err.message);
                                  }
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <details>
                <summary>Fichiers d’exemple et sauvegarde du dossier</summary>
                <p>
                  Les CSV reprennent le format des exemples. Téléchargez-les
                  pour les modifier, puis importez-les. Le JSON contient le
                  parc, les locations, les paramètres et l’historique.
                </p>
                <div className="acrn-section-actions">
                  <button
                    onClick={() =>
                      downloadCsv(
                        "acrn-parc-exemple.csv",
                        assetHeaders,
                        seed.assets,
                      )
                    }
                  >
                    Exemple de parc CSV
                  </button>
                  <button
                    onClick={() =>
                      downloadCsv(
                        "acrn-locations-exemple.csv",
                        bookingHeaders,
                        seed.bookings,
                      )
                    }
                  >
                    Exemple de locations CSV
                  </button>
                  <button
                    onClick={() => {
                      downloadJson("acrn-dossier.json", project);
                      setNotice("Le dossier JSON a été généré.");
                    }}
                  >
                    Sauvegarder en JSON
                  </button>
                  <FileImport
                    key={`json-${importEpoch}`}
                    label="Importer un dossier JSON"
                    accept=".json,application/json"
                    onFile={(f) => ingest(f, "json")}
                  />
                </div>
              </details>
            </section>
          </div>
          <aside className="acrn-inspector">
            <section>
              <h2>Prolonger la location</h2>
              <label>
                Location
                <select
                  value={selected}
                  onChange={(e) => choose(e.target.value)}
                >
                  <option value="" disabled>
                    Choisir une location
                  </option>
                  {project.bookings.map((b) => (
                    <option key={b.location} value={b.location}>
                      {b.location} · {b.appareil}
                    </option>
                  ))}
                </select>
              </label>
              {selectedBooking && (
                <p className="acrn-booking-info">
                  <strong>{selectedBooking.client}</strong> <br />
                  {fr(selectedBooking.debut)} au {fr(selectedBooking.fin)}
                </p>
              )}
              <label>
                Nouvelle fin de location
                <input
                  type="date"
                  value={end}
                  min={selectedBooking?.fin}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    setNotice("");
                  }}
                />
              </label>
              <div className="acrn-param">
                <label>
                  Transport retour (jours)
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={project.params.transport}
                    onChange={(e) => parameter("transport", e.target.value)}
                  />
                </label>
                <label>
                  Atelier (jours)
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={project.params.atelier}
                    onChange={(e) => parameter("atelier", e.target.value)}
                  />
                </label>
              </div>
              <p className="acrn-help">
                Hypothèses en jours calendaires, appliquées à tout le parc.
                Elles ne prolongent pas une validité métrologique.
              </p>
              {preview.error ? (
                <ErrorMessage>{preview.error}</ErrorMessage>
              ) : (
                <>
                  <div
                    className={
                      preview.reasons.length ? "acrn-conflict" : "acrn-clear"
                    }
                  >
                    <strong>
                      {preview.reasons.length
                        ? "Points à résoudre"
                        : "Aucun conflit détecté sur cette proposition"}
                    </strong>
                    {preview.reasons.map((s, i) => (
                      <p key={i}>{s}</p>
                    ))}
                  </div>
                  <button
                    onClick={() => apply(false)}
                    disabled={
                      !!preview.reasons.length || end === preview.booking.fin
                    }
                  >
                    Appliquer la prolongation
                  </button>
                  <h3>Remplacer pendant la prolongation</h3>
                  <p>
                    {end === preview.booking.fin
                      ? "Choisissez une fin plus tardive pour chercher un remplacement."
                      : `Du ${fr(preview.tailStart)} au ${fr(end)}. Même famille seulement ; la compatibilité réelle reste à valider.`}
                  </p>
                  <label>
                    Appareil de remplacement
                    <select
                      value={replacement}
                      onChange={(e) => setReplacement(e.target.value)}
                    >
                      <option value="">Choisir un appareil</option>
                      {preview.replacements.map((r) => (
                        <option
                          key={r.asset.appareil}
                          value={r.asset.appareil}
                          disabled={!!r.reasons.length}
                        >
                          {r.asset.appareil} ·{" "}
                          {r.reasons.length ? "indisponible" : "créneau libre"}
                        </option>
                      ))}
                    </select>
                  </label>
                  {preview.replacements.map((r) => (
                    <p className="acrn-availability" key={r.asset.appareil}>
                      <strong>{r.asset.appareil}</strong>{" "}
                      {r.reasons.length
                        ? r.reasons.join(" ")
                        : "Créneau libre, transport et atelier compris."}
                    </p>
                  ))}
                  <button
                    className="acrn-blue"
                    onClick={() => apply(true)}
                    disabled={
                      !replacement ||
                      !!preview.replacements.find(
                        (r) => r.asset.appareil === replacement,
                      )?.reasons.length ||
                      !preview.replacements.some(
                        (r) => r.asset.appareil === replacement,
                      )
                    }
                  >
                    Appliquer le remplacement
                  </button>
                </>
              )}
            </section>
            <section className="acrn-journal">
              <h2>Historique des modifications</h2>
              {!project.journal.length ? (
                <p>
                  Aucune modification enregistrée. Le planning montre les
                  données d’exemple.
                </p>
              ) : (
                <ol>
                  {project.journal
                    .slice(-5)
                    .reverse()
                    .map((j, i) => (
                      <li key={i}>
                        {j.text}
                        <time>
                          {new Date(j.at).toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </li>
                    ))}
                </ol>
              )}
              <button
                onClick={() => {
                  history.reset();
                  setImportEpoch((x) => x + 1);
                  setPending(null);
                  setSelected("LOC-104");
                  setEnd("2026-09-27");
                  setReplacement("CT-108");
                  setNotice(
                    "Le dossier d’exemple a été restauré. Vous pouvez annuler cette action.",
                  );
                  setError("");
                }}
              >
                Revenir à l’exemple
              </button>
            </section>
          </aside>
        </div>
        <DemoFooter />
      </div>
    </main>
  );
}

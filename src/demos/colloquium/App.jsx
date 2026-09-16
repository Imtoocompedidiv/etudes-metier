import React, { useEffect, useState } from "react";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import {
  DemoFooter,
  ErrorMessage,
  FileImport,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import { useHistory } from "../../shared/state.js";
import {
  downloadCsv,
  downloadJson,
  readLocalFile,
} from "../../shared/files.js";
import {
  HEADERS,
  CATEGORIES,
  seed,
  controls,
  edit,
  decide,
  importVersion,
  finalExport,
  changeLog,
  restore,
  setCapacity,
} from "./model.js";
import "./styles.css";

const labels = { nom: "Nom et prénom", email: "Email", categorie: "Catégorie" };
function describe(entry) {
  if (!entry.before) return "Nouvelle place";
  if (!entry.after) return "Ligne retirée";
  if (entry.delta.includes("nom")) return "Nom modifié";
  if (entry.delta.includes("categorie")) return "Catégorie modifiée";
  if (entry.delta.includes("email")) return "Adresse modifiée";
  return "Aucun changement";
}
export default function ColloquiumApp() {
  useDocumentTitle("Colloquium · Comparaison des listes de groupe");
  const history = useHistory(seed);
  const state = history.value;
  const report = controls(state);
  const [selected, setSelected] = useState("G-03");
  const [filter, setFilter] = useState("all");
  const [action, setAction] = useState("");
  const [kind, setKind] = useState("");
  const [note, setNote] = useState("");
  const [capacity, setCapacityInput] = useState(String(state.capacity));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showControls, setShowControls] = useState(false);
  const entry =
    report.list.find((item) => item.id === selected) || report.list[0];
  const entrySignature = JSON.stringify([
    entry.before,
    entry.after,
    entry.review,
  ]);
  useEffect(() => {
    setAction(entry.review?.action || "");
    setKind(entry.review?.kind || "");
    setNote(entry.review?.note || "");
    setError("");
  }, [entry.id, entrySignature]);
  useEffect(() => setCapacityInput(String(state.capacity)), [state.capacity]);
  function update(key, value) {
    try {
      history.set(edit(state, entry.id, key, value));
      setError("");
      setNotice(
        `${entry.id} modifiée. Le comparatif et ses contrôles ont été recalculés.`,
      );
      if (key === "place") setSelected(value);
    } catch (err) {
      setError(err.message);
    }
  }
  function confirm(event) {
    event.preventDefault();
    try {
      history.set(decide(state, entry.id, { action, kind, note }));
      setNotice(`Décision enregistrée pour ${entry.id}.`);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }
  async function receive(file, side) {
    const next = importVersion(
      state,
      side,
      await readLocalFile(file),
      file.name,
    );
    history.set(next);
    setSelected(
      controls(next).list.find((item) => item.pending)?.id ||
        next.incoming[0].place,
    );
    setFilter("all");
    setNotice(
      "Version importée. Les décisions doivent être reprises sur ce nouveau comparatif.",
    );
  }
  function exportList(log = false) {
    try {
      const rows = log ? changeLog(state) : finalExport(state);
      const headers = log
        ? [
            "place",
            "action",
            "ancien_nom",
            "nouveau_nom",
            "ancien_email",
            "nouvel_email",
            "ancienne_categorie",
            "nouvelle_categorie",
            "motif",
          ]
        : HEADERS;
      downloadCsv(
        log ? "colloquium-modifications.csv" : "colloquium-liste-retenue.csv",
        headers,
        rows,
      );
      setNotice(
        log
          ? `${rows.length} décisions exportées.`
          : `${rows.length} personnes exportées dans la liste retenue.`,
      );
    } catch (err) {
      setError(err.message);
      setShowControls(true);
    }
  }
  const rowsShown = report.list.filter(
    (item) => filter !== "changes" || item.changed,
  );
  return (
    <div className="clq">
      <header className="clq-top">
        <span className="clq-wordmark">Colloquium</span>
        <span className="clq-independence">Étude indépendante</span>
        <span className="clq-top-context">
          Groupe exemple · Données fictives · Sans compte
        </span>
      </header>
      <main className="clq-main">
        <div className="clq-heading">
          <div>
            <h1>Les listes de groupe, version par version</h1>
            <p>
              Comparez les changements, vérifiez un remplacement, puis exportez
              la liste retenue.
            </p>
          </div>
          <div className="clq-header-tools">
            <FileImport
              label="Importer la version reçue"
              onFile={(file) => receive(file, "incoming")}
            />
            <button
              type="button"
              disabled={!history.canUndo}
              onClick={() => {
                history.undo();
                setNotice("Dernière action annulée.");
              }}
            >
              Annuler
            </button>
          </div>
        </div>
        <div className="clq-workspace">
          <aside className="clq-index" aria-label="Places à comparer">
            <div className="clq-index-heading">
              <h2>Dans ce groupe</h2>
              <span>{report.list.length} places</span>
            </div>
            <div className="clq-index-filters">
              <button
                type="button"
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                Toutes
              </button>
              <button
                type="button"
                aria-pressed={filter === "changes"}
                onClick={() => setFilter("changes")}
              >
                Changements
              </button>
            </div>
            <div className="clq-place-list">
              {rowsShown.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={entry.id === item.id ? "clq-active" : ""}
                  aria-pressed={entry.id === item.id}
                  onClick={() => setSelected(item.id)}
                >
                  <span
                    className={`clq-marker ${item.pending ? "clq-marker-pending" : item.changed ? "clq-marker-done" : "clq-marker-same"}`}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{item.id}</strong>
                    <span>{describe(item)}</span>
                    <small>
                      {item.stale
                        ? "À réexaminer"
                        : item.review
                          ? "Décision prise"
                          : item.pending
                            ? "À examiner"
                            : "Inchangée"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <p className="clq-key-note">
              La clé désigne une place. Une adresse email commune ne fusionne
              jamais deux personnes.
            </p>
          </aside>
          <div className="clq-content">
            <div className="clq-version-tools">
              <details>
                <summary>Fichiers de comparaison</summary>
                <div>
                  <FileImport
                    label="Importer la version précédente"
                    onFile={(file) => receive(file, "previous")}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      downloadCsv(
                        "colloquium-version-precedente.csv",
                        HEADERS,
                        seed().previous,
                      );
                      setNotice("Exemple de version précédente téléchargé.");
                    }}
                  >
                    Exemple précédent CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      downloadCsv(
                        "colloquium-version-recue.csv",
                        HEADERS,
                        seed().incoming,
                      );
                      setNotice("Exemple de version reçue téléchargé.");
                    }}
                  >
                    Exemple reçu CSV
                  </button>
                </div>
                <p>
                  Colonnes <code>place ; nom ; email ; categorie</code>. Les
                  clés de place sont fournies dans les fichiers, jamais déduites
                  des noms. Chaque import remplace une version et retire les
                  décisions antérieures. Limite de 500 lignes par version.
                </p>
              </details>
              <span className="clq-brand-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
            <div
              className="clq-tables-scroll"
              tabIndex="0"
              role="region"
              aria-label="Comparaison des versions, tableau défilable"
            >
              <div className="clq-tables">
                {[
                  ["previous", "Version précédente", "before"],
                  ["incoming", "Version reçue", "after"],
                ].map(([side, title, key]) => (
                  <section key={side} aria-label={title}>
                    <header>
                      <h2>{title}</h2>
                      <p>{state.files[side]}</p>
                    </header>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Place</th>
                          <th scope="col">Nom et prénom</th>
                          <th scope="col">Email</th>
                          <th scope="col">Catégorie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.list.map((item) => (
                          <tr
                            key={item.id}
                            className={`${entry.id === item.id ? "clq-row-selected " : ""}${!item[key] ? "clq-row-absent" : ""}`}
                          >
                            <th scope="row">
                              <button
                                type="button"
                                onClick={() => setSelected(item.id)}
                                aria-label={`Examiner ${item.id}, ${title}`}
                              >
                                {item.id}
                              </button>
                            </th>
                            {["nom", "email", "categorie"].map((field) => (
                              <td
                                key={field}
                                className={
                                  item.delta.includes(field)
                                    ? `clq-field-change clq-field-${field}`
                                    : ""
                                }
                              >
                                {item[key]?.[field] || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))}
              </div>
            </div>
            <p className="clq-mobile-context">
              Sur téléphone, choisissez une place dans la liste ci-dessus. Ses
              deux versions sont détaillées juste après.
            </p>
            <section
              className="clq-decision"
              aria-labelledby="clq-detail-title"
            >
              <header>
                <h2 id="clq-detail-title">
                  {entry.id} <span>· {describe(entry)}</span>
                </h2>
                <span
                  className={
                    entry.pending ? "clq-tag-pending" : "clq-tag-ready"
                  }
                >
                  {entry.stale
                    ? "Décision à renouveler"
                    : entry.pending
                      ? "À examiner"
                      : entry.changed
                        ? "Décision enregistrée"
                        : "Sans changement"}
                </span>
              </header>
              <div className="clq-decision-grid">
                <section className="clq-old">
                  <h3>Version précédente</h3>
                  {entry.before ? (
                    <dl>
                      {["nom", "email", "categorie"].map((field) => (
                        <div key={field}>
                          <dt>{labels[field]}</dt>
                          <dd>{entry.before[field] || "Non renseigné"}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p>
                      Aucune personne sur cette clé dans la liste précédente.
                    </p>
                  )}
                </section>
                <section className="clq-new">
                  <h3>Version reçue</h3>
                  {entry.after ? (
                    <div className="clq-new-fields">
                      <label>
                        Nom et prénom
                        <input
                          value={entry.after.nom}
                          maxLength="250"
                          onChange={(event) =>
                            update("nom", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Email
                        <input
                          type="email"
                          value={entry.after.email}
                          maxLength="250"
                          onChange={(event) =>
                            update("email", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Catégorie
                        <select
                          value={entry.after.categorie}
                          onChange={(event) =>
                            update("categorie", event.target.value)
                          }
                        >
                          {!CATEGORIES.includes(entry.after.categorie) && (
                            <option value={entry.after.categorie}>
                              {entry.after.categorie || "À sélectionner"}
                            </option>
                          )}
                          {CATEGORIES.map((category) => (
                            <option key={category}>{category}</option>
                          ))}
                        </select>
                      </label>
                      <details className="clq-key-edit">
                        <summary>Corriger la clé de cette place</summary>
                        <p>
                          Rapprochement explicite uniquement si le responsable
                          du groupe confirme la bonne référence.
                        </p>
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            update(
                              "place",
                              new FormData(event.currentTarget).get("place"),
                            );
                          }}
                          key={entry.id}
                        >
                          <label>
                            Nouvelle clé
                            <input
                              name="place"
                              defaultValue={entry.id}
                              maxLength="31"
                            />
                          </label>
                          <button type="submit">Corriger la clé</button>
                        </form>
                      </details>
                    </div>
                  ) : (
                    <p className="clq-removed">
                      La place a disparu de la version reçue. Son retrait reste
                      à confirmer.
                    </p>
                  )}
                </section>
                <form className="clq-qualification" onSubmit={confirm}>
                  <h3>Décision pour la liste retenue</h3>
                  {entry.changed ? (
                    <>
                      <label>
                        Version à retenir
                        <select
                          value={action}
                          onChange={(event) => {
                            setAction(event.target.value);
                            setError("");
                          }}
                        >
                          <option value="">Choisir une décision</option>
                          {entry.after && (
                            <option value="apply">
                              Retenir la version reçue
                            </option>
                          )}
                          {entry.before && (
                            <option value="keep">
                              Conserver la version précédente
                            </option>
                          )}
                          {!entry.after && (
                            <option value="remove">Confirmer le retrait</option>
                          )}
                        </select>
                      </label>
                      {action === "apply" && (
                        <label>
                          Nature du changement
                          <select
                            value={kind}
                            onChange={(event) => setKind(event.target.value)}
                          >
                            <option value="">À qualifier</option>
                            {entry.before ? (
                              <>
                                <option value="correction">
                                  Correction de données
                                </option>
                                <option value="remplacement">
                                  Remplacement de personne
                                </option>
                              </>
                            ) : (
                              <option value="ajout">Ajout d’une place</option>
                            )}
                          </select>
                        </label>
                      )}
                      <label>
                        Motif de la décision
                        <textarea
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          rows="2"
                          maxLength="250"
                          placeholder="Précision donnée par le responsable du groupe"
                        />
                      </label>
                      <ErrorMessage>{error}</ErrorMessage>
                      <button type="submit" className="clq-primary">
                        Confirmer la décision
                      </button>
                      <p className="clq-small">
                        Une modification des données remet cette décision à
                        examiner.
                      </p>
                    </>
                  ) : (
                    <p className="clq-no-change">
                      Les valeurs sont identiques. Aucune décision n’est
                      nécessaire, les contrôles du lot restent applicables.
                    </p>
                  )}
                </form>
              </div>
              {entry.review && (
                <div className="clq-kept">
                  <strong>Décision actuelle</strong>
                  <span>
                    {entry.review.kind} · {entry.review.note}
                  </span>
                </div>
              )}
            </section>
            <section className="clq-export">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  try {
                    history.set(setCapacity(state, capacity));
                    setError("");
                    setNotice("Nombre de places commandées mis à jour.");
                  } catch (err) {
                    setError(err.message);
                    setShowControls(true);
                  }
                }}
              >
                <label>
                  Places commandées
                  <input
                    inputMode="numeric"
                    value={capacity}
                    onChange={(event) => setCapacityInput(event.target.value)}
                    aria-label="Nombre de places commandées"
                  />
                </label>
                <button type="submit">Appliquer</button>
              </form>
              <div className="clq-export-action">
                <p>
                  {report.pending} changement{report.pending !== 1 ? "s" : ""} à
                  examiner · {report.emailConflicts} adresse
                  {report.emailConflicts !== 1 ? "s" : ""} répétée
                  {report.emailConflicts !== 1 ? "s" : ""}
                </p>
                <div>
                  <button
                    type="button"
                    aria-expanded={showControls}
                    onClick={() => setShowControls(!showControls)}
                  >
                    Voir les contrôles ({report.problems.length})
                  </button>
                  <button
                    type="button"
                    className="clq-primary"
                    disabled={report.problems.length > 0}
                    onClick={() => exportList()}
                  >
                    Exporter la liste retenue
                  </button>
                </div>
              </div>
            </section>
            {showControls && (
              <section
                className="clq-controls"
                aria-label="Contrôles avant export"
              >
                <h2>
                  {report.problems.length
                    ? "À résoudre avant l’export"
                    : "La liste est prête à exporter"}
                </h2>
                <ErrorMessage>{error}</ErrorMessage>
                {report.problems.length ? (
                  <ul>
                    {report.problems.map((problem, index) => (
                      <li key={index}>
                        <strong>{problem.place}</strong>
                        <span>{problem.message}</span>
                        {problem.place !== "Lot" && (
                          <button
                            type="button"
                            onClick={() => setSelected(problem.place)}
                          >
                            Examiner
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {report.rows.length} personnes pour {state.capacity} places
                    commandées. Aucune anomalie détectée par les règles de cet
                    exemple.
                  </p>
                )}
                <p className="clq-small">
                  La capacité et les catégories sont des paramètres fictifs. Le
                  responsable reste chargé de vérifier les conditions du
                  congrès. Aucune inscription n’est transmise à idloom.
                </p>
              </section>
            )}
            <div className="clq-notice" role="status" aria-live="polite">
              {notice}
            </div>
            <details className="clq-dossier">
              <summary>Relevé des modifications et dossier de reprise</summary>
              <p>
                Le dossier reste en mémoire pendant cette visite. Téléchargez le
                JSON pour conserver les deux versions, les décisions et le
                journal.
              </p>
              <div className="clq-dossier-tools">
                <button
                  type="button"
                  disabled={report.problems.length > 0}
                  onClick={() => exportList(true)}
                >
                  Exporter le relevé CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadJson("colloquium-dossier.json", state);
                    setNotice("Dossier JSON enregistré.");
                  }}
                >
                  Enregistrer le dossier JSON
                </button>
                <FileImport
                  label="Reprendre un dossier JSON"
                  accept=".json,application/json"
                  onFile={async (file) => {
                    const next = restore(await readLocalFile(file));
                    history.set(next);
                    setSelected(controls(next).list[0].id);
                    setNotice("Dossier et décisions restaurés.");
                  }}
                />
                <button
                  type="button"
                  disabled={!history.canRedo}
                  onClick={() => {
                    history.redo();
                    setNotice("Action rétablie.");
                  }}
                >
                  Rétablir
                </button>
                <button
                  type="button"
                  onClick={() => {
                    history.reset();
                    setSelected("G-03");
                    setFilter("all");
                    setShowControls(false);
                    setNotice(
                      "Exemple rétabli. Cette action peut être annulée.",
                    );
                  }}
                >
                  Revenir à l’exemple
                </button>
              </div>
              <ol>
                {state.journal
                  .slice()
                  .reverse()
                  .map((item) => (
                    <li key={item.step}>
                      <span>
                        #{item.step} · {item.place}
                      </span>
                      {item.message}
                    </li>
                  ))}
              </ol>
            </details>
          </div>
        </div>
      </main>
      <DemoFooter />
    </div>
  );
}

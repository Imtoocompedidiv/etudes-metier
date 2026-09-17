import React, { useState } from "react";
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
  ACCESS,
  CATALOG,
  COMPONENTS,
  CSV_HEADERS,
  KITS,
  REQUEST_HEADERS,
  analyze,
  basis,
  exampleRows,
  explain,
  importCounts,
  questions,
  report,
  requestRows,
  restore,
  review,
  seed,
  setCount,
  setDigital,
  setEdition,
  setKit,
} from "./model.js";
import "./styles.css";

function PieceSymbol({ type }) {
  return (
    <svg className="gc-symbol" viewBox="0 0 40 40" aria-hidden="true">
      {type === "square" ? (
        <rect x="7" y="7" width="26" height="26" rx="2" />
      ) : type === "circle" ? (
        <circle cx="20" cy="20" r="13" />
      ) : type === "triangle" ? (
        <path d="M20 6 36 33H4Z" />
      ) : type === "book" ? (
        <path d="M4 7c7-1 12 1 15 4v25c-4-4-8-5-15-4zm32 0c-7-1-12 1-15 4v25c4-4 8-5 15-4z" />
      ) : (
        <>
          <rect
            x="6"
            y="5"
            width="24"
            height="28"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <rect x="11" y="10" width="25" height="27" rx="2" />
        </>
      )}
    </svg>
  );
}

function ComponentRows({ state, dossier, run }) {
  const [expanded, setExpanded] = useState(null);
  const a = analyze(dossier);
  return (
    <>
      <div
        className="gc-count-table"
        role="table"
        aria-label="Comptage des familles physiques"
      >
        <div className="gc-table-head" role="row">
          <span role="columnheader">Composant</span>
          <span role="columnheader">Attendu</span>
          <span role="columnheader">Compté</span>
          <span role="columnheader">Écart</span>
        </div>
        {a.rows.map((r) => (
          <React.Fragment key={r.id}>
            <div
              className={`gc-component ${r.want === 0 ? "gc-outside" : ""}`}
              role="row"
            >
              <div className="gc-family" role="cell">
                <PieceSymbol type={r.symbol} />
                <span>{r.name}</span>
              </div>
              <div className="gc-expected" role="cell">
                <span className="gc-mobile-label">Attendu </span>
                {r.want === null ? "?" : r.want === 0 ? "Hors kit" : r.want}
              </div>
              <div role="cell">
                <input
                  aria-label={`Compté · ${r.name}`}
                  value={r.got ?? ""}
                  inputMode="numeric"
                  placeholder="?"
                  onChange={(e) =>
                    run(
                      () => setCount(state, dossier.id, r.id, e.target.value),
                      "Comptage enregistré.",
                    )
                  }
                />
              </div>
              <div
                className={`gc-delta ${r.missing ? "gc-missing" : r.issue || (r.got === null && r.want > 0) ? "gc-attention" : ""}`}
                role="cell"
              >
                <span>{r.label}</span>
                {r.issue && (
                  <button
                    aria-expanded={expanded === r.id}
                    className="gc-text-button"
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  >
                    {r.explanation ? "Revoir" : "Expliquer"} · {r.name}
                  </button>
                )}
              </div>
            </div>
            {expanded === r.id && r.issue && (
              <div className="gc-explanation">
                <form
                  key={r.explanation?.basis + (r.explanation?.note || "")}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = new FormData(e.currentTarget);
                    if (
                      run(
                        () => explain(state, dossier.id, r.id, v.get("note")),
                        "Explication enregistrée pour cet écart.",
                      )
                    )
                      setExpanded(null);
                  }}
                >
                  <label>
                    Explication pour {r.name.toLowerCase()}
                    <textarea
                      name="note"
                      minLength="10"
                      maxLength="500"
                      required
                      defaultValue={r.explanation?.note || ""}
                      placeholder="Par exemple, une pièce provient d’une seconde boîte. À vérifier dans le cas réel."
                    />
                  </label>
                  <p>
                    Cette explication conserve le comptage. Elle ne transforme
                    pas les éléments en pièces à expédier.
                  </p>
                  <button type="submit">Enregistrer l’explication</button>
                </form>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="gc-digital">
        <div>
          <h2>Accès numériques</h2>
          <p>3 diaporamas, suivis séparément du matériel.</p>
        </div>
        {a.digitalApplicable ? (
          <div className="gc-digital-fields">
            {dossier.digital.map((v, i) => (
              <label key={i}>
                Diaporama {i + 1}
                <select
                  value={v}
                  onChange={(e) =>
                    run(
                      () => setDigital(state, dossier.id, i, e.target.value),
                      "État d’accès enregistré.",
                    )
                  }
                >
                  <option value="unknown">À vérifier</option>
                  <option value="accessible">Accès déclaré</option>
                  <option value="inaccessible">Accès à rétablir</option>
                </select>
              </label>
            ))}
          </div>
        ) : (
          <p className="gc-attention">
            Ces accès concernent le jeu de base. Les états déjà saisis sont
            conservés ; identifiez le bon kit pour les revoir.
          </p>
        )}
      </div>
      <label className="gc-check gc-edition">
        <input
          type="checkbox"
          checked={dossier.editionConfirmed}
          disabled={dossier.kit === "unknown"}
          onChange={(e) =>
            run(
              () => setEdition(state, dossier.id, e.target.checked),
              "Déclaration de concordance enregistrée.",
            )
          }
        />
        <span>
          J’ai vérifié que ce contenu correspond à la boîte concernée.
          <small>
            Instantané des fiches publiques au 17 septembre 2026. Aucune édition
            reconnue automatiquement.
          </small>
        </span>
      </label>
    </>
  );
}

function Preparation({ dossier, state, run, navigate }) {
  const a = analyze(dossier),
    missing = a.rows.filter((r) => r.missing);
  return (
    <aside className="gc-preparation">
      <h2>Avant de transmettre</h2>
      <div className={`gc-prep-status ${a.reviewed ? "gc-reviewed" : ""}`}>
        {a.reviewed
          ? "Comptage relu"
          : a.blockers.length
            ? `${a.blockers.length} point${a.blockers.length > 1 ? "s" : ""} à compléter`
            : "Prêt pour la relecture"}
      </div>
      <h3>Actions restantes</h3>
      {a.blockers.length ? (
        <ul>
          {a.blockers.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : (
        <p>
          {a.reviewed
            ? "Les quantités ont été revues pour cette version."
            : "Relire les quantités et les réserves ci-dessous."}
        </p>
      )}
      <section className="gc-request-preview">
        <h2>Pièces à demander</h2>
        {missing.length ? (
          <ul>
            {missing.map((r) => (
              <li key={r.id}>
                <strong>{r.missing}</strong> {r.name.toLowerCase()}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {dossier.kit === "unknown"
              ? "Identifiez le kit pour rapprocher les quantités."
              : "Aucun déficit connu dans les familles comptées."}
          </p>
        )}
        <p className="gc-caption">
          {a.reviewed
            ? "Demande préparatoire. La prise en charge reste à décider."
            : "Brouillon tant que le dossier n’est pas relu. Les quantités inconnues restent ouvertes."}
        </p>
        <button className="gc-primary" onClick={navigate}>
          Voir le brouillon
        </button>
      </section>
      <form
        className="gc-review"
        key={basis(dossier)}
        onSubmit={(e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          run(
            () =>
              review(
                state,
                dossier.id,
                values.get("by"),
                values.get("checked") === "on",
              ),
            "Relecture enregistrée. Une modification du dossier la rendra à refaire.",
          );
        }}
      >
        <h3>Relire le dossier</h3>
        <label className="gc-check">
          <input type="checkbox" name="checked" required />
          <span>Quantités et réserves relues.</span>
        </label>
        <label>
          Relecteur
          <input
            name="by"
            maxLength="60"
            minLength="2"
            required
            placeholder="Nom ou rôle fictif"
          />
        </label>
        <button type="submit" disabled={a.blockers.length > 0}>
          Enregistrer la relecture
        </button>
        {a.reviewed && (
          <p className="gc-success">
            Relecture déclarée par {dossier.review.by}.
          </p>
        )}
      </form>
    </aside>
  );
}

function Request({ dossier, act }) {
  const a = analyze(dossier);
  return (
    <section className="gc-document-layout">
      <div className="gc-paper">
        <div className="gc-paper-head">
          <h1>Préparer la demande</h1>
          <span>{a.reviewed ? "Demande relue" : "Brouillon"}</span>
        </div>
        <h2>
          {dossier.id} · {dossier.place}
        </h2>
        <p>
          {dossier.order} · {KITS[dossier.kit]} · Trouvez-moi !
        </p>
        <p>{dossier.note}</p>
        <div
          className="gc-paper-table"
          role="region"
          aria-label="Rapprochement des pièces, tableau défilant"
          tabIndex="0"
        >
          <table>
            <thead>
              <tr>
                <th>Famille</th>
                <th>Attendu</th>
                <th>Compté</th>
                <th>À demander</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.name}</th>
                  <td>
                    {r.want === null ? "?" : r.want === 0 ? "Hors kit" : r.want}
                  </td>
                  <td>{r.got ?? "Non compté"}</td>
                  <td>
                    {r.want > 0 && r.got !== null
                      ? r.missing
                      : "À préciser / hors kit"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Explications conservées</h3>
        {Object.keys(dossier.explanations).length ? (
          <ul>
            {a.rows
              .filter((r) => r.explanation)
              .map((r) => (
                <li key={r.id}>
                  {r.name} : {r.explanation.note}
                </li>
              ))}
          </ul>
        ) : (
          <p>Aucune explication enregistrée.</p>
        )}
        <h3>Questions encore ouvertes</h3>
        {a.blockers.length + a.digitalQuestions.length ? (
          <ul>
            {[...a.blockers, ...a.digitalQuestions].map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : (
          <p>Aucune question de comptage ou d’accès dans cet exemple.</p>
        )}
        <p className="gc-source">
          Nomenclature de démonstration {CATALOG}. Repères numériques fictifs ;
          contenu public du jeu GS2602 et de l’extension GS2602.1. La
          concordance avec la boîte est{" "}
          {dossier.editionConfirmed ? "déclarée vérifiée" : "encore à vérifier"}
          .
        </p>
        <p className={a.reviewed ? "gc-success" : "gc-attention"}>
          {a.reviewed
            ? `Relecture déclarée par ${dossier.review.by}.`
            : "Cette version du dossier n’a pas été relue."}
        </p>
      </div>
      <aside className="gc-preparation gc-export-panel">
        <h2>À garder ou transmettre</h2>
        <p>
          Les exports portent sur le dossier sélectionné. Le JSON conserve tous
          les dossiers.
        </p>
        <button
          className="gc-primary"
          onClick={() =>
            act(
              () =>
                downloadReport(
                  `grand-cerf-${dossier.id}.html`,
                  report(dossier),
                ),
              "Rapport HTML téléchargé.",
            )
          }
        >
          Exporter le rapport HTML
        </button>
        <button
          disabled={!a.reviewed}
          onClick={() =>
            act(
              () =>
                downloadCsv(
                  `grand-cerf-${dossier.id}-pieces.csv`,
                  REQUEST_HEADERS,
                  requestRows(dossier),
                ),
              "Demande de pièces CSV téléchargée.",
            )
          }
        >
          Exporter les pièces CSV
        </button>
        {!a.reviewed && (
          <p className="gc-caption">
            Le CSV des pièces attend la relecture du dossier.
          </p>
        )}
        <button
          onClick={() =>
            act(
              () =>
                downloadText(
                  `grand-cerf-${dossier.id}-questions.txt`,
                  questions(dossier),
                ),
              "Brouillon texte téléchargé.",
            )
          }
        >
          Télécharger le brouillon TXT
        </button>
        <p className="gc-source">
          Aucune demande n’est envoyée. Le SAV décide de la prise en charge et
          des pièces réellement disponibles.
        </p>
      </aside>
    </section>
  );
}

function Imports({ state, run, act }) {
  async function ingest(file, kind) {
    const raw = await readLocalFile(file);
    run(
      () => (kind === "json" ? restore(raw) : importCounts(state, raw)),
      kind === "json"
        ? "Dossiers restaurés depuis le JSON."
        : "Comptages importés. Les identifiants absents du CSV sont conservés.",
    );
  }
  return (
    <section className="gc-imports">
      <h2>Importer des comptages</h2>
      <p>
        Le CSV ajoute ou met à jour un composant dans un dossier. Les lignes non
        présentes sont conservées. Une erreur refuse tout le fichier. Le JSON
        remplace le lot courant.
      </p>
      <div className="gc-import-actions">
        <FileImport
          label="Choisir le CSV de comptage"
          onFile={(f) => ingest(f, "csv")}
        />
        <FileImport
          label="Reprendre un JSON"
          accept=".json,application/json"
          onFile={(f) => ingest(f, "json")}
        />
        <button
          onClick={() =>
            act(
              () =>
                downloadCsv(
                  "grand-cerf-exemple-comptages.csv",
                  CSV_HEADERS,
                  exampleRows(),
                ),
              "Exemple CSV téléchargé.",
            )
          }
        >
          Télécharger un exemple CSV
        </button>
      </div>
      <p className="gc-caption">
        Colonnes : {CSV_HEADERS.join(", ")}. Kit : base, extension, pack ou
        unknown. Familles : {COMPONENTS.map((c) => c.id).join(", ")}. Champ
        compte vide = inconnu ; 0 = aucune pièce comptée. Jusqu’à 50 dossiers,
        250 lignes. Fichiers traités localement, limite 5 Mo.
      </p>
    </section>
  );
}

export default function App() {
  useDocumentTitle("Grand Cerf · Comptage d’une boîte");
  const history = useHistory(seed),
    state = history.value;
  const [selected, setSelected] = useState("GC-104"),
    [tab, setTab] = useState("counts"),
    [imports, setImports] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const dossier = state.cases.find((d) => d.id === selected) || state.cases[0];
  function run(fn, message) {
    try {
      history.set(fn());
      setNotice(message);
      setError("");
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
      setNotice(message);
      setError("");
    } catch (e) {
      setError(e.message);
      setNotice("");
    }
  }
  return (
    <div className="grand-cerf-app">
      <header className="gc-header">
        <div className="gc-brand">
          <strong>Grand Cerf</strong>
          <span>Comptage d’une boîte</span>
        </div>
        <nav aria-label="Comptage et préparation">
          <button
            aria-current={tab === "counts" ? "page" : undefined}
            onClick={() => setTab("counts")}
          >
            Comptage
          </button>
          <button
            aria-current={tab === "request" ? "page" : undefined}
            onClick={() => setTab("request")}
          >
            Préparer la demande
          </button>
        </nav>
        <span className="gc-fictive">Données fictives</span>
      </header>
      <main>
        <div className="gc-feedback" aria-live="polite">
          {error ? (
            <p role="alert">{error}</p>
          ) : notice ? (
            <p>{notice}</p>
          ) : null}
        </div>
        {tab === "counts" ? (
          <div className="gc-workspace">
            <section className="gc-counting">
              <h1>Quel contenu manque dans la boîte ?</h1>
              <p className="gc-lead">
                Identifiez le kit, comptez son contenu puis relisez la demande.
              </p>
              <div className="gc-case">
                <label htmlFor="gc-dossier">Dossier</label>
                <div>
                  <select
                    id="gc-dossier"
                    value={dossier.id}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setNotice("");
                      setError("");
                    }}
                  >
                    {state.cases.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.id} · {d.place}
                      </option>
                    ))}
                  </select>
                  <p>{dossier.note}</p>
                </div>
              </div>
              <div className="gc-kit">
                <span>Type de kit</span>
                <div role="group" aria-label="Type de kit">
                  {Object.entries(KITS).map(([key, label]) => (
                    <button
                      key={key}
                      aria-pressed={dossier.kit === key}
                      onClick={() => {
                        if (dossier.kit !== key)
                          run(
                            () => setKit(state, dossier.id, key),
                            "Kit modifié. Comptages conservés ; concordance de la nomenclature à revoir.",
                          );
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <ComponentRows
                key={dossier.id}
                state={state}
                dossier={dossier}
                run={run}
              />
            </section>
            <Preparation
              dossier={dossier}
              state={state}
              run={run}
              navigate={() => setTab("request")}
            />
          </div>
        ) : (
          <Request dossier={dossier} act={act} />
        )}
        <div className="gc-toolbar">
          <button
            className="gc-primary"
            aria-expanded={imports}
            onClick={() => setImports(!imports)}
          >
            Importer / reprendre
          </button>
          <button
            onClick={() =>
              act(
                () => downloadJson("grand-cerf-dossiers.json", state),
                "Tous les dossiers ont été enregistrés en JSON.",
              )
            }
          >
            Enregistrer le dossier
          </button>
          <button
            disabled={!history.canUndo}
            onClick={() => {
              history.undo();
              setNotice("Dernière modification annulée.");
              setError("");
            }}
          >
            Annuler
          </button>
          <button
            disabled={!history.canRedo}
            onClick={() => {
              history.redo();
              setNotice("Modification rétablie.");
              setError("");
            }}
          >
            Rétablir
          </button>
          <button
            className="gc-reset"
            onClick={() => {
              history.reset();
              setSelected("GC-104");
              setNotice(
                "Exemple initial rétabli. Annuler permet de retrouver votre lot.",
              );
              setError("");
            }}
          >
            Exemple initial
          </button>
        </div>
        {imports && <Imports state={state} run={run} act={act} />}
        <p className="gc-context">
          Prototype indépendant. Aucune demande envoyée et aucune prise en
          charge décidée.
        </p>
      </main>
      <DemoFooter />
    </div>
  );
}

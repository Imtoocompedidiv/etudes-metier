import { useMemo, useState } from "react";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import {
  downloadCsv,
  downloadJson,
  downloadReport,
  readLocalFile,
} from "../../shared/files.js";
import { useHistory } from "../../shared/state.js";
import {
  DemoFooter,
  ErrorMessage,
  FileImport,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  types,
  labels,
  fields,
  seed,
  audit,
  categoryIds,
  editRow,
  parseCollection,
  parseDossier,
  validState,
  recordChange,
  exportRows,
  manifest,
} from "./model.js";
import "./styles.css";

function Editor({ type, record, collection, problems, result, onSave }) {
  const [draft, setDraft] = useState(record);
  const set = (field, value) => setDraft((old) => ({ ...old, [field]: value }));
  const source = collection.rows.find((row) => row.uid === record.uid);
  const hasMappingError = problems.some((problem) => problem.uid === null);
  return (
    <aside className="sc-inspector" aria-label="Inspection de la ligne">
      <h2>
        {type === "articles" ? "Article sélectionné" : "Fiche sélectionnée"}
      </h2>
      <p className="sc-subtle">
        Modifiez les valeurs, puis enregistrez pour recalculer la recette.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
        }}
      >
        {Object.entries(fields[type]).map(([field, label]) => {
          const errors = problems.filter(
            (p) => p.uid === record.uid && p.field === field,
          );
          const common = {
            value: draft[field] ?? "",
            onChange: (event) => set(field, event.target.value),
            disabled: !collection.map[field] || hasMappingError,
            "aria-invalid": !!errors.length,
            maxLength: field === "excerpt" ? 5000 : 240,
          };
          return (
            <label className="sc-field" key={field}>
              {label}
              {field === "excerpt" ? (
                <textarea {...common} rows={4} />
              ) : field === "author" ? (
                <select
                  value={draft.author}
                  disabled={common.disabled}
                  aria-invalid={common["aria-invalid"]}
                  onChange={(e) => set("author", e.target.value)}
                >
                  {!result.normalized.authors.some(
                    (a) => a.id === draft.author,
                  ) && (
                    <option value={draft.author}>
                      {draft.author || "Aucun auteur"} · introuvable
                    </option>
                  )}
                  {result.normalized.authors.map((author) => (
                    <option key={author.uid} value={author.id}>
                      {author.name || author.id} · {author.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input {...common} />
              )}
              {field === "categories" && (
                <small>
                  Identifiants séparés par |. Disponibles :{" "}
                  {result.normalized.categories
                    .map((c) => `${c.id} (${c.name})`)
                    .join(", ")}
                  .
                </small>
              )}
              {field === "date" && (
                <small>AAAA-MM-JJ, par exemple 2026-09-17.</small>
              )}
              {errors.map((e, i) => (
                <small className="sc-error-text" key={i}>
                  {e.message}
                </small>
              ))}
            </label>
          );
        })}
        <button className="sc-primary" disabled={hasMappingError} type="submit">
          Enregistrer la ligne
        </button>
        {hasMappingError && (
          <p className="sc-error-text">
            Associez les colonnes sans doublon avant l’édition.
          </p>
        )}
      </form>
      <details className="sc-source">
        <summary>Voir la ligne source</summary>
        <p>Valeurs conservées à l’import, avant vos corrections.</p>
        <dl>
          {collection.headers.map((key) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{source?.original[key] || "Vide"}</dd>
            </div>
          ))}
        </dl>
      </details>
    </aside>
  );
}

export default function App() {
  useDocumentTitle("Sans Concept · Atelier de migration CMS");
  const history = useHistory(seed, {
    key: "sans-concept:v1",
    validate: validState,
  });
  const value = history.value;
  const [type, setType] = useState("articles");
  const [uid, setUid] = useState("articles-0");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const result = useMemo(() => audit(value), [value]);
  const collection = value.collections[type];
  const rows = result.normalized[type];
  const selected = rows.find((row) => row.uid === uid) || rows[0];
  const problems = result.problems.filter((p) => p.type === type);
  const shown = rows.filter((row) => {
    const match = Object.values(row)
      .join(" ")
      .toLocaleLowerCase("fr")
      .includes(search.toLocaleLowerCase("fr"));
    return (
      match &&
      (filter !== "errors" ||
        problems.some((p) => p.uid === row.uid || p.uid === null))
    );
  });
  function chooseType(next) {
    setType(next);
    setUid(value.collections[next].rows[0].uid);
    setSearch("");
    setFilter("all");
    setError("");
  }
  function mutate(next, message) {
    history.set(next);
    setError("");
    setNotice(message);
  }
  async function importCollection(file) {
    try {
      const next = parseCollection(await readLocalFile(file), type);
      mutate(
        (old) =>
          recordChange(
            { ...old, collections: { ...old.collections, [type]: next } },
            `${labels[type]} · ${next.rows.length} lignes importées`,
          ),
        `${next.rows.length} lignes importées. Vérifiez les correspondances ci-dessous.`,
      );
      setUid(next.rows[0].uid);
      setFilter("all");
      setSearch("");
    } catch (e) {
      setError(e.message);
    }
  }
  async function importDossier(file) {
    try {
      mutate(
        parseDossier(await readLocalFile(file)),
        "Dossier restauré avec ses sources et son journal.",
      );
    } catch (e) {
      setError(e.message);
    }
  }
  function mapField(field, header) {
    mutate(
      (old) =>
        recordChange(
          {
            ...old,
            collections: {
              ...old.collections,
              [type]: {
                ...old.collections[type],
                map: { ...old.collections[type].map, [field]: header },
              },
            },
          },
          `${labels[type]} · ${fields[type][field]} associé à ${header || "aucune colonne"}`,
        ),
      "Correspondance mise à jour. Les références ont été recalculées.",
    );
  }
  function exportCollection(nextType) {
    try {
      downloadCsv(
        `sans-concept-${nextType}.csv`,
        Object.keys(fields[nextType]),
        exportRows(value, nextType),
      );
      setNotice(`${labels[nextType]} exportés dans le format de préparation.`);
    } catch (e) {
      setError(e.message);
    }
  }
  function report() {
    downloadReport("sans-concept-recette.html", {
      title: "Sans Concept · Recette CMS",
      subtitle:
        "Données courantes et contrôle local des trois collections. Format de préparation à adapter au CMS cible.",
      sections: [
        {
          title: "Ordre de préparation",
          paragraphs: [
            "Auteurs et catégories sont indépendants. Préparer ces deux collections avant les articles.",
            `${result.problems.length} anomalie(s) détectée(s). La présence de zéro anomalie ne valide pas l’affichage final dans Framer.`,
          ],
        },
        {
          title: "Anomalies",
          headers: ["Collection", "Ligne", "Champ", "Diagnostic"],
          rows: result.problems.map((p) => [
            labels[p.type],
            p.uid || "Correspondance",
            fields[p.type][p.field],
            p.message,
          ]),
        },
        ...types.map((name) => ({
          title: labels[name],
          headers: Object.values(fields[name]),
          rows: result.normalized[name].map((row) =>
            Object.keys(fields[name]).map((key) => row[key]),
          ),
        })),
        {
          title: "Journal du dossier",
          headers: ["Date UTC", "Modification"],
          rows: value.journal.map((entry) => [entry.at, entry.action]),
        },
      ],
    });
    setNotice(
      "Rapport HTML téléchargé, avec les données et diagnostics actuels.",
    );
  }
  const preview = type === "articles" ? selected : null;
  const author =
    preview && result.normalized.authors.find((a) => a.id === preview.author);
  return (
    <div className="sc-app">
      <header className="sc-header">
        <strong>Sans Concept</strong>
        <span>Prototype indépendant · données fictives</span>
      </header>
      <main>
        <section className="sc-intro">
          <div>
            <h1>Atelier de migration CMS</h1>
            <p>
              Choisissez Maria Duval pour remplacer l’auteur introuvable, puis
              préparez les fichiers.
            </p>
          </div>
          <div
            className="sc-dependencies"
            aria-label="Auteurs et catégories alimentent les articles"
          >
            <div>
              <span>Auteurs</span>
              <span>Catégories</span>
            </div>
            <b aria-hidden="true">→</b>
            <span className="sc-target">Articles</span>
          </div>
        </section>
        <div className="sc-topbar">
          <nav aria-label="Collections">
            {types.map((name) => (
              <button
                key={name}
                aria-pressed={type === name}
                onClick={() => chooseType(name)}
              >
                <span>{labels[name]}</span>
                <small>
                  {value.collections[name].rows.length} lignes ·{" "}
                  {result.counts[name]
                    ? `${result.counts[name]} anomalie(s)`
                    : "contrôlées"}
                </small>
              </button>
            ))}
          </nav>
          <div className="sc-history">
            <button
              disabled={!history.canUndo}
              onClick={() => {
                history.undo();
                setNotice("Dernière modification annulée.");
              }}
            >
              Annuler
            </button>
            <button
              disabled={!history.canRedo}
              onClick={() => {
                history.redo();
                setNotice("Modification rétablie.");
              }}
            >
              Rétablir
            </button>
          </div>
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        <p role="status" className="sc-notice">
          {notice}
        </p>
        {!history.storageAvailable && (
          <p className="sc-error-text">
            La sauvegarde locale n’est pas disponible. Téléchargez le dossier
            JSON pour le conserver.
          </p>
        )}
        <div className="sc-workspace">
          <div className="sc-main-column">
            <section
              className="sc-table-section"
              aria-label="Collection active"
            >
              <div className="sc-tools">
                <h2>{labels[type]}</h2>
                <FileImport
                  label="Importer CSV"
                  accept=".csv,text/csv"
                  onFile={importCollection}
                />
                <button
                  onClick={() =>
                    downloadCsv(
                      `sans-concept-exemple-${type}.csv`,
                      seed.collections[type].headers,
                      seed.collections[type].rows.map((row) => row.data),
                    )
                  }
                >
                  Exemple CSV
                </button>
              </div>
              <div className="sc-filter">
                <label>
                  Rechercher
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Titre, identifiant, slug…"
                  />
                </label>
                <label>
                  Afficher
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Toutes les lignes</option>
                    <option value="errors">Avec anomalie</option>
                  </select>
                </label>
              </div>
              <div
                className="sc-table-scroll"
                role="region"
                aria-label="Collection, tableau défilant"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>{type === "articles" ? "Titre" : "Nom"}</th>
                      <th>Slug</th>
                      {type === "articles" && (
                        <>
                          <th>Auteur</th>
                          <th>Date</th>
                        </>
                      )}
                      <th>Diagnostic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => {
                      const issues = problems.filter(
                        (p) => p.uid === row.uid || p.uid === null,
                      );
                      return (
                        <tr
                          key={row.uid}
                          data-selected={row.uid === selected.uid}
                        >
                          <td>
                            <button
                              aria-pressed={row.uid === selected.uid}
                              onClick={() => setUid(row.uid)}
                            >
                              {row.title ||
                                row.name ||
                                row.id ||
                                "Ligne sans libellé"}
                            </button>
                            <small>{row.id || "Identifiant manquant"}</small>
                          </td>
                          <td>{row.slug || "À associer"}</td>
                          {type === "articles" && (
                            <>
                              <td>{row.author || "À associer"}</td>
                              <td>{row.date || "À associer"}</td>
                            </>
                          )}
                          <td>
                            <span
                              className={
                                issues.length ? "sc-problem" : "sc-valid"
                              }
                            >
                              {issues.length
                                ? `${issues.length} anomalie(s)`
                                : "Conforme"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {!shown.length && (
                      <tr>
                        <td colSpan={type === "articles" ? 5 : 3}>
                          Aucune ligne pour ce filtre. Les données sont
                          conservées.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <details className="sc-mapping" open>
              <summary>Correspondance des colonnes · {labels[type]}</summary>
              <p>
                Le format de préparation est explicite. Les colonnes reconnues
                sont proposées ; vous pouvez changer chaque association.
              </p>
              <div className="sc-map-grid">
                {Object.entries(fields[type]).map(([key, title]) => (
                  <label key={key}>
                    {title}
                    <select
                      value={collection.map[key]}
                      onChange={(e) => mapField(key, e.target.value)}
                    >
                      <option value="">Choisir une colonne</option>
                      {collection.headers.map((header) => (
                        <option key={header}>{header}</option>
                      ))}
                    </select>
                    {problems
                      .filter((p) => p.uid === null && p.field === key)
                      .map((p, i) => (
                        <small className="sc-error-text" key={i}>
                          {p.message}
                        </small>
                      ))}
                  </label>
                ))}
              </div>
            </details>
            {preview && (
              <article className="sc-preview">
                <span className="sc-subtle">
                  Épreuve de l’article enregistré
                </span>
                <h2>{preview.title || "Titre à associer"}</h2>
                <p className="sc-byline">
                  {author?.name || "Auteur introuvable"} ·{" "}
                  {preview.date || "Date à associer"}
                </p>
                <p>{preview.excerpt || "Extrait à associer"}</p>
                <div className="sc-tags">
                  {categoryIds(preview.categories).map((id, index) => (
                    <span key={`${id}-${index}`}>
                      {result.normalized.categories.find((c) => c.id === id)
                        ?.name || id}
                    </span>
                  ))}
                </div>
                <small>
                  Texte brut. Le rendu et les composants du CMS cible restent à
                  recetter.
                </small>
              </article>
            )}
          </div>
          <Editor
            key={`${type}:${JSON.stringify(selected)}:${JSON.stringify(collection.map)}`}
            type={type}
            record={selected}
            collection={collection}
            problems={problems}
            result={result}
            onSave={(draft) =>
              mutate(
                editRow(value, type, selected.uid, draft),
                "Ligne enregistrée. Sources et références contrôlées à nouveau.",
              )
            }
          />
        </div>
        <section className="sc-delivery" aria-label="Livraison des collections">
          <div>
            <h2>Préparer les fichiers</h2>
            <p>
              {result.ready
                ? "Les trois collections sont cohérentes dans ce format."
                : `${result.problems.length} anomalie(s) à corriger avant les CSV.`}
            </p>
            <p>
              Auteurs et catégories d’abord, articles ensuite. Aucun transfert
              automatique vers Framer.
            </p>
          </div>
          <div className="sc-export-buttons">
            {types.map((name) => (
              <button
                key={name}
                disabled={!result.ready}
                onClick={() => exportCollection(name)}
              >
                {labels[name]} CSV
              </button>
            ))}
            <button
              disabled={!result.ready}
              onClick={() => {
                downloadJson("sans-concept-manifeste.json", manifest(value));
                setNotice(
                  "Manifeste d’ordre et de correspondances téléchargé.",
                );
              }}
            >
              Manifeste JSON
            </button>
          </div>
        </section>
        <section className="sc-archive">
          <div>
            <h2>Conserver la recette</h2>
            <p>
              Le dossier JSON conserve les sources, les corrections et les 80
              dernières opérations. L’annulation reste locale au navigateur.
            </p>
          </div>
          <div>
            <button
              onClick={() => downloadJson("sans-concept-dossier.json", value)}
            >
              Dossier JSON
            </button>
            <FileImport
              label="Restaurer un dossier"
              accept=".json,application/json"
              onFile={importDossier}
            />
            <button onClick={report}>Rapport HTML</button>
          </div>
        </section>
        <details className="sc-journal">
          <summary>Journal et périmètre</summary>
          <p>
            Mille lignes par collection, vingt colonnes, trois collections
            fixes. Références par identifiant, catégories séparées par |,
            extraits en texte brut. Les CSV sont un format de travail à associer
            aux champs réels de Framer, pas un format natif universel.
          </p>
          <ol>
            {value.journal.length ? (
              value.journal.map((entry, index) => (
                <li key={`${index}-${entry.at}`}>
                  <time>{entry.at.replace("T", " ").slice(0, 19)} UTC</time>{" "}
                  {entry.action}
                </li>
              ))
            ) : (
              <li>Aucune modification enregistrée.</li>
            )}
          </ol>
          <button
            onClick={() => {
              history.reset();
              setType("articles");
              setUid("articles-0");
              setSearch("");
              setFilter("all");
              setError("");
              setNotice("Exemple initial restauré.");
            }}
          >
            Réinitialiser l’exemple
          </button>
        </details>
        <DemoFooter />
      </main>
    </div>
  );
}

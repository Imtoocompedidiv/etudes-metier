import { useState } from "react";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-600.css";
import { useHistory } from "../../shared/state.js";
import {
  FileImport,
  ErrorMessage,
  DemoFooter,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadCsv,
  downloadJson,
  downloadReport,
} from "../../shared/files.js";
import {
  seed,
  redirectHeaders,
  inventoryHeaders,
  importRows,
  validateState,
  trace,
  audit,
  shorten,
  exportPlan,
  report,
} from "./model.js";
import "./styles.css";

function RuleEditor({ rule, save, remove, canRemove }) {
  const [draft, setDraft] = useState(rule);
  return (
    <form
      className="ba-editor"
      onSubmit={(event) => {
        event.preventDefault();
        save(draft);
      }}
    >
      <h2>Inspection de la redirection</h2>
      <label>
        URL source
        <input
          maxLength={500}
          value={draft.source}
          onChange={(e) => setDraft({ ...draft, source: e.target.value })}
        />
      </label>
      <label>
        URL de destination
        <input
          maxLength={500}
          value={draft.destination}
          onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
        />
      </label>
      <label>
        Code de redirection
        <select
          value={draft.code}
          onChange={(e) => setDraft({ ...draft, code: e.target.value })}
        >
          <option value="301">301 · Permanente</option>
          <option value="302">302 · Temporaire</option>
          {!["301", "302"].includes(draft.code) && (
            <option value={draft.code}>{draft.code || "Code vide"}</option>
          )}
        </select>
      </label>
      <button className="ba-primary">Enregistrer la règle</button>
      <button
        type="button"
        className="ba-remove"
        disabled={!canRemove}
        onClick={remove}
      >
        Retirer cette règle
      </button>
      <p className="ba-note">
        Chemins internes exacts. Les paramètres restent distincts ; aucun
        fragment, domaine ou règle avec joker.
      </p>
    </form>
  );
}

function InventoryEditor({ item, save }) {
  const [draft, setDraft] = useState(item);
  return (
    <form
      className="ba-inventory-editor"
      onSubmit={(event) => {
        event.preventDefault();
        save(draft);
      }}
    >
      <h3>Modifier l’inventaire</h3>
      <label>
        Chemin inventorié
        <input
          maxLength={500}
          value={draft.url}
          onChange={(e) => setDraft({ ...draft, url: e.target.value })}
        />
      </label>
      <label>
        Statut déclaré
        <select
          value={draft.statut}
          onChange={(e) => setDraft({ ...draft, statut: e.target.value })}
        >
          {["200", "404", "410", "500"].map((s) => (
            <option key={s}>{s}</option>
          ))}
          {!["200", "404", "410", "500"].includes(draft.statut) && (
            <option value={draft.statut}>{draft.statut || "Vide"}</option>
          )}
        </select>
      </label>
      <label>
        Visites historiques
        <input
          inputMode="numeric"
          maxLength={15}
          value={draft.visites}
          onChange={(e) => setDraft({ ...draft, visites: e.target.value })}
        />
      </label>
      <button className="ba-primary">Enregistrer l’URL</button>
    </form>
  );
}

export default function App() {
  useDocumentTitle("Business Antidote · Recette des redirections");
  const history = useHistory(seed, {
    key: "business-antidote:v1",
    validate: validateState,
  });
  const value = history.value;
  const [selectedId, setSelectedId] = useState("r0");
  const [inventoryId, setInventoryId] = useState("u0");
  const [query, setQuery] = useState("/services");
  const [followed, setFollowed] = useState("/services");
  const [panel, setPanel] = useState("redirects");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected =
    value.redirects.find((r) => r.id === selectedId) || value.redirects[0];
  const inventoryItem =
    value.inventory.find((r) => r.id === inventoryId) || value.inventory[0];
  const result = audit(value);
  const journey = trace(followed, value);
  const selectedTrace = trace(selected.source, value);
  const visibleRules = result.rules.filter(
    (r) =>
      filter === "all" ||
      (filter === "errors" ? !r.result.ok : r.result.code === "chain"),
  );
  function apply(next, text) {
    history.set(next);
    setError("");
    setNotice(text);
  }
  function select(rule) {
    setSelectedId(rule.id);
    setQuery(rule.source);
    setFollowed(rule.source);
  }
  async function importFile(file, kind) {
    try {
      const rows = importRows(await readLocalFile(file), kind);
      apply(
        { ...value, [kind]: rows },
        `${rows.length} lignes importées. Annuler permet de revenir au lot précédent.`,
      );
      if (kind === "redirects") select(rows[0]);
      else setInventoryId(rows[0].id);
    } catch (err) {
      setError(err.message);
    }
  }
  function saveRule(draft) {
    apply(
      {
        ...value,
        redirects: value.redirects.map((r) =>
          r.id === draft.id ? { ...draft } : r,
        ),
      },
      "Règle enregistrée. Tous les parcours ont été recalculés.",
    );
    setFollowed(draft.source);
    setQuery(draft.source);
  }
  function shortenSelected() {
    try {
      const before = selectedTrace.edges.length;
      const next = shorten(value, selected.id);
      apply(
        next,
        `${selected.source} : ${before} sauts remplacés par un accès direct à ${trace(selected.source, next).terminal}. Les autres règles sont conservées.`,
      );
      setFollowed(selected.source);
      setQuery(selected.source);
    } catch (err) {
      setError(err.message);
    }
  }
  function exportHtml() {
    const current = report(value);
    downloadReport("business-antidote-recette.html", {
      title: current.title,
      subtitle: current.limits,
      sections: [
        {
          title: "Contrôle du lot",
          paragraphs: [
            `${current.errors} erreurs bloquantes. ${current.chains} chaînes conservées.`,
          ],
          headers: ["Source", "Destination", "Code", "Parcours", "Diagnostic"],
          rows: current.rules.map((r) => [
            r.source,
            r.destination,
            r.code,
            r.result.nodes.join(" → "),
            r.result.message,
          ]),
        },
        {
          title: "Inventaire déclaré",
          headers: ["URL", "Statut", "Visites historiques"],
          rows: value.inventory.map((r) => [r.url, r.statut, r.visites]),
        },
        {
          title: "Erreurs de l’inventaire",
          paragraphs: current.inventoryIssues.map((i) => i.message),
        },
      ],
    });
    setNotice("Rapport HTML autonome téléchargé avec le lot actuel.");
  }
  return (
    <div className="ba-app">
      <header className="ba-header">
        <strong>
          Business Antidote
          <span aria-hidden="true" />
        </strong>
        <p>Prototype indépendant · données fictives</p>
      </header>
      <main>
        <h1>Recette des redirections</h1>
        <p className="ba-intro">
          Suivez une URL, corrigez sa destination et livrez le plan.
        </p>
        <ErrorMessage>{error}</ErrorMessage>
        <div className="ba-workbench">
          <section className="ba-tracer" aria-labelledby="ba-trace-title">
            <h2 id="ba-trace-title">Traçage d’une URL</h2>
            <form
              className="ba-trace-form"
              onSubmit={(e) => {
                e.preventDefault();
                setFollowed(query);
                const rule = value.redirects.find((r) => r.source === query);
                if (rule) setSelectedId(rule.id);
              }}
            >
              <label>
                <span>URL à suivre</span>
                <input
                  maxLength={500}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button className="ba-primary">Suivre le parcours</button>
            </form>
            <div
              className="ba-route-scroll"
              role="region"
              tabIndex="0"
              aria-label="Parcours de redirection, défilement horizontal"
            >
              <ol className="ba-route">
                {journey.nodes.map((node, index) => (
                  <li key={`${node}:${index}`}>
                    <div
                      className={
                        index === journey.nodes.length - 1
                          ? journey.ok
                            ? "ba-node ba-terminal"
                            : "ba-node ba-broken"
                          : "ba-node"
                      }
                    >
                      <strong>{node || "Chemin vide"}</strong>
                      <span>
                        {index === 0
                          ? "Départ"
                          : index === journey.nodes.length - 1
                            ? journey.ok
                              ? "200 déclaré"
                              : "Arrêt du parcours"
                            : "Étape intermédiaire"}
                      </span>
                    </div>
                    {journey.edges[index] && (
                      <div className="ba-edge">
                        <span>{journey.edges[index].code}</span>
                        <i aria-hidden="true">→</i>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
            <div
              className={`ba-trace-result ${journey.ok ? "" : "ba-problem"}`}
            >
              <p>{journey.message}</p>
              {selectedTrace.canShorten && followed === selected.source && (
                <button onClick={shortenSelected}>
                  Raccourcir cette chaîne
                </button>
              )}
            </div>
            <p className="ba-note">
              Le statut 200 vient du fichier d’inventaire. Le banc ne visite
              aucune page.
            </p>
            {journey.code === "cycle" && (
              <p className="ba-suggestion">
                Dans l’exemple, le guide final est{" "}
                <code>/ressources/guide</code>. Modifiez la règle{" "}
                <code>/livre-blanc</code> pour terminer le parcours.
              </p>
            )}
          </section>
          <aside>
            <RuleEditor
              key={JSON.stringify(selected)}
              rule={selected}
              save={saveRule}
              canRemove={value.redirects.length > 1}
              remove={() => {
                const next = value.redirects.filter(
                  (r) => r.id !== selected.id,
                );
                apply(
                  { ...value, redirects: next },
                  "Règle retirée ; Annuler reste disponible.",
                );
                select(next[0]);
              }}
            />
          </aside>
        </div>
        <section className="ba-data" aria-label="Données de recette">
          <div className="ba-data-heading">
            <div
              className="ba-tabs"
              role="tablist"
              aria-label="Jeux de données"
            >
              <button
                role="tab"
                aria-selected={panel === "redirects"}
                onClick={() => setPanel("redirects")}
              >
                Plan de redirections
              </button>
              <button
                role="tab"
                aria-selected={panel === "inventory"}
                onClick={() => setPanel("inventory")}
              >
                Inventaire des URL
              </button>
            </div>
            <div className="ba-toolbar">
              <FileImport
                label={
                  panel === "redirects"
                    ? "Importer le plan CSV"
                    : "Importer l’inventaire CSV"
                }
                accept=".csv,text/csv"
                onFile={(file) => importFile(file, panel)}
              />
              <button
                onClick={() =>
                  downloadCsv(
                    `business-antidote-exemple-${panel}.csv`,
                    panel === "redirects" ? redirectHeaders : inventoryHeaders,
                    seed[panel],
                  )
                }
              >
                Exemple CSV
              </button>
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
          {panel === "redirects" ? (
            <>
              <div className="ba-filter">
                <p>
                  {value.redirects.length} règles · {result.errors}{" "}
                  {result.errors === 1
                    ? "erreur bloquante"
                    : "erreurs bloquantes"}{" "}
                  · {result.chains} {result.chains === 1 ? "chaîne" : "chaînes"}
                </p>
                <label>
                  Afficher
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Toutes les règles</option>
                    <option value="errors">Erreurs</option>
                    <option value="chains">Chaînes</option>
                  </select>
                </label>
                <button
                  disabled={value.redirects.length >= 1000}
                  onClick={() => {
                    const r = {
                      id: crypto.randomUUID(),
                      source: "/nouvelle-source",
                      destination: "/contact",
                      code: "301",
                    };
                    apply(
                      { ...value, redirects: [...value.redirects, r] },
                      "Nouvelle règle ajoutée, à adapter.",
                    );
                    select(r);
                  }}
                >
                  Ajouter une règle
                </button>
              </div>
              <div
                className="ba-table-scroll"
                role="region"
                tabIndex="0"
                aria-label="Plan de redirections, tableau défilant"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Destination</th>
                      <th>Code</th>
                      <th>Visites historiques</th>
                      <th>Diagnostic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRules.map((rule) => (
                      <tr
                        key={rule.id}
                        className={selected.id === rule.id ? "ba-selected" : ""}
                      >
                        <td>
                          <button
                            className="ba-link"
                            aria-pressed={selected.id === rule.id}
                            onClick={() => select(rule)}
                          >
                            {rule.source || "Source vide"}
                          </button>
                        </td>
                        <td>{rule.destination || "Destination vide"}</td>
                        <td>{rule.code || "Vide"}</td>
                        <td>
                          {Number.isFinite(rule.visits)
                            ? rule.visits.toLocaleString("fr-FR")
                            : "À corriger"}
                        </td>
                        <td
                          className={
                            !rule.result.ok
                              ? "ba-error-text"
                              : rule.result.code === "chain"
                                ? "ba-chain-text"
                                : "ba-good"
                          }
                        >
                          {!rule.result.ok
                            ? rule.result.code === "cycle"
                              ? "Boucle"
                              : "À corriger"
                            : rule.result.code === "chain"
                              ? `${rule.result.edges.length} sauts`
                              : "Conforme"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visibleRules.length && (
                  <p className="ba-empty">Aucune règle dans ce filtre.</p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="ba-note">
                Statuts importés ou déclarés pour la recette. Les visites
                historiques servent à lire les priorités, sans prévision de
                trafic.
              </p>
              <div className="ba-inventory-layout">
                <div
                  className="ba-table-scroll"
                  role="region"
                  tabIndex="0"
                  aria-label="Inventaire des URL, tableau défilant"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>URL</th>
                        <th>Statut</th>
                        <th>Visites</th>
                      </tr>
                    </thead>
                    <tbody>
                      {value.inventory.map((item) => (
                        <tr
                          key={item.id}
                          className={
                            inventoryItem.id === item.id ? "ba-selected" : ""
                          }
                        >
                          <td>
                            <button
                              className="ba-link"
                              onClick={() => setInventoryId(item.id)}
                            >
                              {item.url || "Chemin vide"}
                            </button>
                          </td>
                          <td>{item.statut || "Vide"}</td>
                          <td>{item.visites || "Vide"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <InventoryEditor
                  key={JSON.stringify(inventoryItem)}
                  item={inventoryItem}
                  save={(draft) =>
                    apply(
                      {
                        ...value,
                        inventory: value.inventory.map((r) =>
                          r.id === draft.id ? draft : r,
                        ),
                      },
                      "Inventaire enregistré et contrôles recalculés.",
                    )
                  }
                />
              </div>
              {result.inventoryIssues.length > 0 && (
                <ul className="ba-inventory-errors">
                  {result.inventoryIssues.map((i, index) => (
                    <li key={index}>{i.message}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
        <section className="ba-delivery">
          <div>
            <h2>Livraison du plan</h2>
            <p>
              {result.errors
                ? `${result.errors} erreurs bloquent le CSV.`
                : "Le plan peut être exporté pour intégration et recette serveur."}
            </p>
          </div>
          <div className="ba-toolbar">
            <button
              className="ba-primary"
              disabled={result.errors > 0}
              onClick={() => {
                downloadCsv(
                  "business-antidote-redirections.csv",
                  redirectHeaders,
                  exportPlan(value),
                );
                setNotice("Plan CSV courant téléchargé.");
              }}
            >
              Exporter le plan CSV
            </button>
            <button onClick={exportHtml}>Rapport de recette HTML</button>
            <button
              onClick={() =>
                downloadJson("business-antidote-recette.json", report(value))
              }
            >
              Dossier JSON
            </button>
          </div>
        </section>
        <p className="ba-notice" role="status">
          {notice}
        </p>
        <details className="ba-format">
          <summary>Format et limites de la recette</summary>
          <p>
            Plan CSV : <code>{redirectHeaders.join(" ; ")}</code>. Inventaire
            CSV : <code>{inventoryHeaders.join(" ; ")}</code>. Mille lignes par
            fichier au maximum. Statuts d’inventaire acceptés : 200, 404, 410,
            500.
          </p>
          <p>
            Les chemins sont exacts et les paramètres de requête restent
            conservés. Ce plan est un livrable de travail, à adapter au système
            réel de redirections. Aucune expression régulière, aucun domaine
            externe, aucun crawl. Seules les chaînes de 301 peuvent être
            raccourcies ; une 302 conserve son caractère temporaire.
          </p>
          <button
            onClick={() => {
              history.reset();
              select(seed.redirects[0]);
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

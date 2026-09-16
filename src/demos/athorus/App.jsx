import { useState } from "react";
import "@fontsource/kanit/latin-500.css";
import "@fontsource/kanit/latin-600.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import { useHistory } from "../../shared/state.js";
import {
  FileImport,
  ErrorMessage,
  DemoFooter,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadText,
  downloadJson,
  euro,
} from "../../shared/files.js";
import {
  seed,
  headers,
  maxFieldLength,
  importCatalogue,
  validateCatalogue,
  productTitle,
  previewSelection,
  recipeCsv,
  recipeReport,
} from "./model.js";
import productViews from "./product-views.png";
import "./styles.css";

const labels = {
  "URL handle": "Identifiant produit",
  Title: "Titre du produit",
  "Option1 name": "Nom de l’option",
  "Option1 value": "Valeur de l’option",
  SKU: "Référence",
  Price: "Prix en euros",
  "Inventory quantity": "Stock",
};
const colors = { Sable: "#d3c1a1", Bleu: "#3c587c", Olive: "#637046" };

function VariantEditor({ row, onSave, issues }) {
  const [draft, setDraft] = useState(row);
  return (
    <form
      className="athorus-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <h2>Édition de la variante sélectionnée</h2>
      <div className="athorus-fields">
        {headers.map((field) => (
          <label key={field}>
            {labels[field]}
            <input
              maxLength={maxFieldLength}
              value={draft[field]}
              onChange={(event) =>
                setDraft({ ...draft, [field]: event.target.value })
              }
              inputMode={
                field === "Price"
                  ? "decimal"
                  : field === "Inventory quantity"
                    ? "numeric"
                    : "text"
              }
              aria-describedby={
                field === "Title" ? "athorus-title-help" : undefined
              }
            />
          </label>
        ))}
        <button className="athorus-primary" type="submit">
          Enregistrer la variante
        </button>
      </div>
      <p id="athorus-title-help" className="athorus-hint">
        Le titre est requis sur la première ligne d’un produit. Les variantes
        suivantes peuvent le laisser vide.
      </p>
      {issues.length > 0 && (
        <ul className="athorus-issues">
          {issues.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}
    </form>
  );
}

function Bag({ handle, color }) {
  const column = ["Sable", "Bleu", "Olive"].indexOf(color);
  const row = handle === "sac-rivage" ? 0 : handle === "sac-traverse" ? 1 : -1;
  if (column < 0 || row < 0)
    return (
      <div className="athorus-product-empty">
        Aucun visuel associé à cette variante importée.
      </div>
    );
  return (
    <div
      className="athorus-product-photo"
      role="img"
      aria-label={`${row === 0 ? "Sac Rivage" : "Sac Traverse"}, couleur ${color}, produit fictif`}
      style={{
        backgroundImage: `url(${productViews})`,
        backgroundPosition: `${column * 50}% ${row * 100}%`,
      }}
    />
  );
}

export default function App() {
  useDocumentTitle("Athorus · Recette de catalogue");
  const history = useHistory(seed, {
    key: "athorus:v1",
    validate: (value) =>
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 500 &&
      value.every(
        (row) =>
          typeof row.id === "string" &&
          headers.every(
            (h) =>
              typeof row[h] === "string" && row[h].length <= maxFieldLength,
          ),
      ),
  });
  const rows = history.value;
  const [selectedId, setSelectedId] = useState("row-2");
  const [previewId, setPreviewId] = useState("row-1");
  const [quantity, setQuantity] = useState("1");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempted, setAttempted] = useState(false);
  const issues = validateCatalogue(rows);
  const selected = rows.find((row) => row.id === selectedId) || rows[0];
  const preview = rows.find((row) => row.id === previewId) || rows[0];
  const products = [...new Set(rows.map((row) => row["URL handle"]))];
  const rowIssues = (id) => issues.filter((issue) => issue.rowId === id);
  const visible =
    filter === "errors" ? rows.filter((row) => rowIssues(row.id).length) : rows;
  const result = previewSelection(preview, quantity, issues);
  async function importFile(file) {
    try {
      const next = importCatalogue(await readLocalFile(file));
      history.set(next);
      setSelectedId(next[0].id);
      setPreviewId(next[0].id);
      setAttempted(false);
      setError("");
      setMessage(
        `${next.length} variantes importées. Le lot précédent reste accessible avec Annuler.`,
      );
    } catch (e) {
      setError(e.message);
    }
  }
  function save(draft) {
    history.set(rows.map((row) => (row.id === draft.id ? { ...draft } : row)));
    setMessage(
      `Variante ${draft.SKU || draft.id} enregistrée ; contrôles recalculés.`,
    );
    setError("");
  }
  return (
    <div className="athorus-app">
      <header className="athorus-masthead">
        <strong>
          Athorus <span>Digital</span>
        </strong>
        <p>Prototype indépendant · données fictives</p>
      </header>
      <main>
        <div className="athorus-workspace">
          <section
            className="athorus-catalogue"
            aria-labelledby="athorus-title"
          >
            <h1 id="athorus-title">Recette de catalogue à variantes</h1>
            <p className="athorus-intro">
              Corrigez la référence en double, puis testez les options du
              produit.
            </p>
            <ErrorMessage>{error}</ErrorMessage>
            <div className="athorus-sheet">
              <div className="athorus-toolbar">
                <FileImport
                  label="Importer un CSV"
                  accept=".csv,text/csv"
                  onFile={importFile}
                />
                <button
                  onClick={() =>
                    downloadText(
                      "athorus-exemple.csv",
                      recipeCsv(seed, true),
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  Fichier exemple
                </button>
                <button onClick={history.undo} disabled={!history.canUndo}>
                  Annuler
                </button>
                <button onClick={history.redo} disabled={!history.canRedo}>
                  Rétablir
                </button>
                <button
                  onClick={() => {
                    history.reset();
                    setMessage("Exemple initial restauré.");
                  }}
                >
                  Réinitialiser
                </button>
              </div>
              <div className="athorus-filter">
                <span>
                  {rows.length} variantes dans {products.length} produits
                </span>
                <label>
                  Afficher{" "}
                  <select
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  >
                    <option value="all">Toutes les variantes</option>
                    <option value="errors">Avec anomalie</option>
                  </select>
                </label>
              </div>
              <div
                className="athorus-table-scroll"
                tabIndex="0"
                role="region"
                aria-label="Catalogue des variantes, tableau défilant"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Option</th>
                      <th>Référence</th>
                      <th>Prix</th>
                      <th>Stock</th>
                      <th>Contrôle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr
                        key={row.id}
                        className={
                          selected?.id === row.id ? "athorus-selected" : ""
                        }
                      >
                        <td>
                          <button
                            className="athorus-row-button"
                            aria-pressed={selected?.id === row.id}
                            onClick={() => setSelectedId(row.id)}
                          >
                            {productTitle(rows, row["URL handle"])}
                          </button>
                        </td>
                        <td>{row["Option1 value"] || "Vide"}</td>
                        <td>{row.SKU || "Vide"}</td>
                        <td>
                          {/^\d+(\.\d+)?$/.test(row.Price)
                            ? euro(Math.round(Number(row.Price) * 100))
                            : row.Price || "Vide"}
                        </td>
                        <td>{row["Inventory quantity"] || "Vide"}</td>
                        <td
                          className={
                            rowIssues(row.id).length
                              ? "athorus-invalid"
                              : "athorus-valid"
                          }
                        >
                          {rowIssues(row.id).length
                            ? `${rowIssues(row.id).length} anomalie${rowIssues(row.id).length > 1 ? "s" : ""}`
                            : "Conforme"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visible.length && (
                  <p className="athorus-empty">
                    Aucune variante avec anomalie.
                  </p>
                )}
              </div>
              {selected && (
                <VariantEditor
                  key={JSON.stringify(selected)}
                  row={selected}
                  onSave={save}
                  issues={rowIssues(selected.id)}
                />
              )}
            </div>
          </section>
          <aside
            className="athorus-preview"
            aria-labelledby="athorus-preview-title"
          >
            <h2 id="athorus-preview-title">Aperçu du produit</h2>
            <label>
              Produit{" "}
              <select
                value={preview?.["URL handle"]}
                onChange={(event) => {
                  setPreviewId(
                    rows.find((row) => row["URL handle"] === event.target.value)
                      .id,
                  );
                  setAttempted(false);
                }}
              >
                {products.map((handle) => (
                  <option value={handle} key={handle}>
                    {productTitle(rows, handle)}
                  </option>
                ))}
              </select>
            </label>
            <Bag
              handle={preview?.["URL handle"]}
              color={preview?.["Option1 value"]}
            />
            <h3>{productTitle(rows, preview?.["URL handle"])}</h3>
            <p className="athorus-price">
              {/^\d+(\.\d+)?$/.test(preview?.Price)
                ? euro(Math.round(Number(preview.Price) * 100))
                : "Prix à corriger"}
            </p>
            <fieldset>
              <legend>{preview?.["Option1 name"] || "Option"}</legend>
              <div className="athorus-swatches">
                {rows
                  .filter(
                    (row) => row["URL handle"] === preview?.["URL handle"],
                  )
                  .map((row) => (
                    <button
                      key={row.id}
                      aria-pressed={preview.id === row.id}
                      onClick={() => {
                        setPreviewId(row.id);
                        setAttempted(false);
                      }}
                    >
                      <i
                        aria-hidden="true"
                        style={{
                          background: colors[row["Option1 value"]] || "#aaa",
                        }}
                      />
                      {row["Option1 value"] || "Sans valeur"}
                    </button>
                  ))}
              </div>
            </fieldset>
            <label className="athorus-quantity">
              Quantité{" "}
              <input
                value={quantity}
                inputMode="numeric"
                onChange={(event) => {
                  setQuantity(event.target.value);
                  setAttempted(false);
                }}
              />
            </label>
            <p>
              {preview?.["Inventory quantity"] || "Stock manquant"} en stock
            </p>
            <button
              className="athorus-primary athorus-wide"
              onClick={() => setAttempted(true)}
            >
              Tester cette quantité
            </button>
            {attempted && (
              <p
                role="status"
                className={result.ok ? "athorus-valid" : "athorus-invalid"}
              >
                {result.reason}
                {result.ok && ` Total ${euro(result.totalCents)}.`}
              </p>
            )}
            <p className="athorus-hint">
              Aperçu relié au tableau. Aucun achat, aucune connexion à Shopify.
            </p>
          </aside>
        </div>
        <section className="athorus-delivery">
          <div>
            <h2>Livraison du lot</h2>
            <p>
              {issues.length
                ? `${issues.length} anomalies à corriger avant le CSV.`
                : "Le lot respecte les règles de cette recette."}
            </p>
          </div>
          <div className="athorus-toolbar">
            <button
              className="athorus-primary"
              disabled={issues.length > 0}
              onClick={() => {
                downloadText(
                  "athorus-catalogue-recette.csv",
                  recipeCsv(rows),
                  "text/csv;charset=utf-8",
                );
                setMessage("CSV du lot actuel téléchargé.");
              }}
            >
              Exporter le CSV de recette
            </button>
            <button
              className="athorus-report"
              onClick={() => {
                downloadJson(
                  "athorus-rapport-recette.json",
                  recipeReport(rows),
                );
                setMessage("Rapport du lot actuel téléchargé.");
              }}
            >
              Rapport de recette JSON
            </button>
          </div>
        </section>
        <p role="status" className="athorus-feedback">
          {message}
        </p>
        <details className="athorus-format">
          <summary>Format pris en charge et règles de recette</summary>
          <p>
            Colonnes documentées Shopify, limitées à une option et un
            emplacement. Les fichiers restent dans ce navigateur. Le lot se
            sauvegarde localement, avec annulation.
          </p>
          <p>
            Ce banc impose une référence unique, un stock non négatif et
            interdit la vente au-delà du stock. Ces choix servent la recette
            fictive ; ils ne couvrent pas toutes les configurations Shopify. Le
            CSV exporté est un lot de travail à compléter selon le contrat
            d’import de votre boutique.
          </p>
          <code>{headers.join(", ")}</code>
        </details>
        <DemoFooter />
      </main>
    </div>
  );
}

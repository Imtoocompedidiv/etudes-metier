import React, { useMemo, useState } from "react";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/karla/400.css";
import "@fontsource/karla/600.css";
import "@fontsource/karla/700.css";
import { useHistory } from "../../shared/state.js";
import {
  DemoFooter,
  ErrorMessage,
  FileImport,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  downloadCsv,
  downloadJson,
  downloadReport,
  parseCsv,
  readLocalFile,
} from "../../shared/files.js";
import {
  seed,
  units,
  mappingKey,
  normalizeProject,
  validProject,
  analyse,
  compareVersions,
  setMapping,
  editRow,
  parseBom,
  parseMappings,
  parsePlans,
  bomHeaders,
  mapHeaders,
  planHeaders,
  preparationRows,
  preparationHeaders,
  diffRows,
  diffHeaders,
} from "./model.js";
import "./styles.css";
const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });
const qty = (value) => (value === null ? "À calculer" : number.format(value));
const date = (value) =>
  value ? value.split("-").reverse().join("/") : "À préciser";
const unitLabel = (value) =>
  value === "m2" ? "m²" : value === "cm2" ? "cm²" : value;

function MappingEditor({ row, onApply }) {
  const [draft, setDraft] = useState({
    reference: row.reference,
    indice: row.indice,
    unite: row.unite,
    article: row.mapping?.article || "",
    unite_cible: row.mapping?.unite_cible || row.unite,
    delai: row.mapping?.delai ?? "",
  });
  const [error, setError] = useState("");
  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const conversion = units[draft.unite_cible][1]
    ? units[row.unite][1] / units[draft.unite_cible][1]
    : 1;
  return (
    <form
      className="cp-mapping"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        try {
          onApply(draft);
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <h2>Correspondance de {row.reference}</h2>
      <p className="cp-muted">
        Indice {row.indice} · ligne source {row.sourceLine}
      </p>
      <label>
        Article de gestion
        <input
          required
          maxLength={180}
          value={draft.article}
          onChange={(e) => change("article", e.target.value)}
          placeholder="Ex. ERP-LUM-024"
        />
      </label>
      <div className="cp-form-pair">
        <label>
          Unité source
          <input readOnly value={unitLabel(row.unite)} />
        </label>
        <label>
          Unité cible
          <select
            value={draft.unite_cible}
            onChange={(e) => change("unite_cible", e.target.value)}
          >
            {Object.keys(units)
              .filter((u) => units[u][0] === units[row.unite][0])
              .map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="cp-conversion">
        Conversion standard · 1 {unitLabel(row.unite)} ={" "}
        {number.format(conversion)} {unitLabel(draft.unite_cible)}
      </div>
      <label>
        Délai calendaire (jours)
        <input
          inputMode="numeric"
          type="number"
          min="0"
          max="730"
          step="1"
          value={draft.delai}
          onChange={(e) => change("delai", e.target.value)}
          placeholder="Inconnu tant que vide"
        />
      </label>
      <p className="cp-muted">
        Le délai retranche des jours calendaires à la date de besoin. Zéro est
        une valeur explicite ; vide signifie inconnu.
      </p>
      <ErrorMessage>{error}</ErrorMessage>
      <button className="cp-primary" type="submit">
        Appliquer la correspondance
      </button>
    </form>
  );
}
function RowEditor({ row, onApply }) {
  const [draft, setDraft] = useState({
    reference: row.reference,
    indice: row.indice,
    designation: row.designation,
    quantite: row.quantite,
    parent: row.parent,
  });
  const [error, setError] = useState("");
  return (
    <details className="cp-row-editor">
      <summary>Modifier la ligne de nomenclature</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onApply(draft);
            setError("");
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        {[
          ["reference", "Référence BE"],
          ["indice", "Indice"],
          ["designation", "Désignation"],
          ["parent", "Identifiant du parent"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              maxLength={180}
              required={key !== "parent"}
              value={draft[key]}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [key]: e.target.value }))
              }
            />
          </label>
        ))}
        <label>
          Quantité par parent
          <input
            type="number"
            min="0.000001"
            max="100000"
            step="0.000001"
            value={draft.quantite}
            onChange={(e) =>
              setDraft((d) => ({ ...d, quantite: e.target.value }))
            }
          />
        </label>
        <ErrorMessage>{error}</ErrorMessage>
        <button type="submit">Appliquer à cette version</button>
      </form>
    </details>
  );
}
function Planning({ project, onApply }) {
  const roots = [
    ...new Set(
      [...project.versions.A, ...project.versions.B]
        .filter((r) => !r.parent)
        .map((r) => r.node),
    ),
  ];
  const [draft, setDraft] = useState(
    roots.map(
      (racine) =>
        project.plans.find((p) => p.racine === racine) || {
          racine,
          modules: 1,
          besoin: "",
        },
    ),
  );
  const [error, setError] = useState("");
  return (
    <details className="cp-planning">
      <summary>
        Planning des modules{" "}
        <span>
          {project.plans
            .map((p) => `${p.modules} × ${p.racine} · ${date(p.besoin)}`)
            .join(" / ") || "À définir"}
        </span>
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onApply(parsePlans(draft));
            setError("");
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        {draft.map((p, i) => (
          <fieldset key={p.racine}>
            <legend>{p.racine}</legend>
            <label>
              Nombre de modules
              <input
                type="number"
                min="1"
                max="10000"
                value={p.modules}
                onChange={(e) =>
                  setDraft((d) =>
                    d.map((v, j) =>
                      j === i ? { ...v, modules: e.target.value } : v,
                    ),
                  )
                }
              />
            </label>
            <label>
              Date de besoin
              <input
                type="date"
                required
                min="2000-01-01"
                max="2100-12-31"
                value={p.besoin}
                onChange={(e) =>
                  setDraft((d) =>
                    d.map((v, j) =>
                      j === i ? { ...v, besoin: e.target.value } : v,
                    ),
                  )
                }
              />
            </label>
          </fieldset>
        ))}
        <ErrorMessage>{error}</ErrorMessage>
        <button type="submit">Appliquer le planning</button>
      </form>
    </details>
  );
}
function SourcePath({ row, revision }) {
  return (
    <section className="cp-source">
      <h3>Origine de la quantité</h3>
      <p className="cp-formula">
        {row.modules ?? "?"} modules{" "}
        {row.factorPath.map((n, i) => (
          <React.Fragment key={i}> × {number.format(n)}</React.Fragment>
        ))}{" "}
        ={" "}
        <strong>
          {qty(row.total)} {unitLabel(row.unite)}
        </strong>
      </p>
      <p>{row.path.join(" › ")}</p>
      <div>
        Révision {revision} · ligne CSV {row.sourceLine}
      </div>
      <p className="cp-source-note">
        Les multiplicateurs d’assemblage restent des quantités de composition.
        Seuls les articles terminaux sont préparés.
      </p>
    </section>
  );
}
export default function App() {
  useDocumentTitle("CAPSA · Nomenclatures et besoins");
  const history = useHistory(seed, { key: "capsa:v1", validate: validProject });
  const project = history.value;
  const [revision, setRevision] = useState("B"),
    [view, setView] = useState("composition"),
    [selected, setSelected] = useState("LUM"),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [importKind, setImportKind] = useState("bom"),
    [preview, setPreview] = useState(null),
    [fileKey, setFileKey] = useState(0);
  const current = useMemo(
    () => analyse(project, revision),
    [project, revision],
  );
  const differences = useMemo(() => compareVersions(project), [project]);
  const selectedRow =
    current.details.find((r) => r.node === selected) || current.details[0];
  function commit(next, note) {
    history.set(normalizeProject(next));
    setMessage(note);
    setError("");
    setPreview(null);
  }
  function act(fn) {
    try {
      fn();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }
  async function importFile(file) {
    const raw = await readLocalFile(file);
    let next, label;
    if (importKind === "json") {
      next = normalizeProject(JSON.parse(raw));
      label = "Dossier complet, deux versions";
    } else {
      const headers =
        importKind === "bom"
          ? bomHeaders
          : importKind === "mapping"
            ? mapHeaders
            : planHeaders;
      const rows = parseCsv(raw, {
        requiredHeaders: headers,
        maxRows: importKind === "mapping" ? 1000 : 500,
      }).rows;
      if (importKind === "bom") {
        next = {
          ...project,
          versions: { ...project.versions, [revision]: parseBom(rows) },
        };
        label = `Nomenclature de la révision ${revision}`;
      }
      if (importKind === "mapping") {
        next = { ...project, mappings: parseMappings(rows) };
        label = "Toutes les correspondances";
      }
      if (importKind === "planning") {
        next = { ...project, plans: parsePlans(rows) };
        label = "Tout le planning";
      }
      next = normalizeProject(next);
    }
    setPreview({ project: next, label, filename: file.name });
    setMessage("Le fichier a été lu. Confirmez le remplacement ci-dessous.");
  }
  function exportReport() {
    const values = diffRows(project);
    downloadReport("capsa-rapport-des-ecarts.html", {
      title: "CAPSA · Comparaison de nomenclatures",
      subtitle:
        "Étude indépendante sur données fictives. Paramètres calendaires indicatifs, aucune commande générée.",
      sections: [
        {
          title: "Planning utilisé",
          headers: planHeaders,
          rows: project.plans.map((p) => planHeaders.map((h) => p[h])),
        },
        {
          title: "Écarts A vers B",
          headers: diffHeaders,
          rows: values.map((r) => diffHeaders.map((h) => r[h])),
        },
        {
          title: "Lignes de la révision " + revision,
          headers: [
            "Ligne",
            "Nœud",
            "Chemin",
            "Quantité dépliée",
            "Unité",
            "Points à préciser",
          ],
          rows: current.details.map((r) => [
            r.sourceLine,
            r.node,
            r.path.join(" > "),
            r.total,
            r.unite,
            r.issues.join(" ; "),
          ]),
        },
      ],
    });
    setMessage("Rapport HTML téléchargé, imprimable depuis votre navigateur.");
  }
  const previewAnalysis = preview ? analyse(preview.project, revision) : null;
  return (
    <div className="capsa-app">
      <header className="cp-header">
        <span>CAPSA Container</span>
        <small>Étude indépendante · Données fictives</small>
      </header>
      <main className="cp-main">
        <div className="cp-title">
          <div>
            <h1>De la nomenclature aux besoins</h1>
            <p>
              Résolvez la correspondance de LED-24, puis comparez les deux
              versions du module.
            </p>
          </div>
          <div className="cp-history">
            <button
              disabled={!history.canUndo}
              onClick={() => {
                history.undo();
                setPreview(null);
                setMessage("Dernière modification annulée.");
              }}
            >
              Annuler
            </button>
            <button
              disabled={!history.canRedo}
              onClick={() => {
                history.redo();
                setPreview(null);
                setMessage("Modification rétablie.");
              }}
            >
              Rétablir
            </button>
          </div>
        </div>
        <div className="cp-toolbar">
          <nav aria-label="Vues de l’étude">
            <button
              aria-pressed={view === "composition"}
              onClick={() => setView("composition")}
            >
              Nomenclature
            </button>
            <button
              aria-pressed={view === "needs"}
              onClick={() => setView("needs")}
            >
              Besoins & écarts
            </button>
          </nav>
          <label className="cp-version">
            Version affichée
            <select
              value={revision}
              onChange={(e) => {
                setRevision(e.target.value);
                setPreview(null);
              }}
            >
              <option value="A">Révision A</option>
              <option value="B">Révision B</option>
            </select>
          </label>
        </div>
        <Planning
          key={JSON.stringify(project.plans) + JSON.stringify(project.versions)}
          project={project}
          onApply={(plans) =>
            commit(
              { ...project, plans },
              "Planning appliqué aux deux versions. Les dates ont été recalculées.",
            )
          }
        />
        <ErrorMessage>{error}</ErrorMessage>
        <p className="cp-message" role="status">
          {message ||
            `${current.details.length} lignes source · ${current.groups.length} besoins regroupés dans cette version`}
        </p>
        {!history.storageAvailable && (
          <p role="status">
            La sauvegarde dans ce navigateur est indisponible. Téléchargez le
            dossier JSON pour conserver votre travail.
          </p>
        )}
        {view === "composition" ? (
          <div className="cp-workbench">
            <section className="cp-sheet">
              <div className="cp-section-title">
                <h2>Composition issue du bureau d’études</h2>
                <span>Révision {revision}</span>
              </div>
              <p className="cp-mobile-hint">
                Faites défiler le tableau vers la droite pour voir les
                quantités.
              </p>
              <div
                className="cp-table-scroll"
                role="region"
                aria-label="Composition, tableau défilant"
                tabIndex="0"
              >
                <table className="cp-bom">
                  <thead>
                    <tr>
                      <th>Référence / désignation</th>
                      <th>Indice</th>
                      <th>Qté / parent</th>
                      <th>Unité</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.details.map((row) => (
                      <tr
                        key={row.node}
                        className={`${row.node === selectedRow.node ? "cp-selected" : ""} ${row.type === "ensemble" ? "cp-assembly" : ""}`}
                      >
                        <td>
                          <div
                            className="cp-tree"
                            style={{
                              paddingLeft: `${Math.min(row.depth, 8) * 18}px`,
                            }}
                          >
                            <button
                              aria-label={`${row.reference} · ${row.designation}`}
                              aria-pressed={row.node === selectedRow.node}
                              onClick={() => setSelected(row.node)}
                            >
                              {row.reference}
                            </button>
                            <span>{row.designation}</span>
                            {row.issues.length > 0 && (
                              <small className="cp-issue">
                                {row.issues.join(" · ")}
                              </small>
                            )}
                          </div>
                        </td>
                        <td>{row.indice}</td>
                        <td>{qty(row.quantite)}</td>
                        <td>{unitLabel(row.unite)}</td>
                        <td>{qty(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="cp-muted cp-table-note">
                Sélectionnez une référence pour modifier sa correspondance ou sa
                quantité. Les traits suivent la composition du fichier source.
              </p>
            </section>
            <aside className="cp-inspector">
              {selectedRow.type === "article" ? (
                <MappingEditor
                  key={
                    revision +
                    selectedRow.node +
                    JSON.stringify(selectedRow.mapping) +
                    mappingKey(selectedRow)
                  }
                  row={selectedRow}
                  onApply={(mapping) =>
                    commit(
                      setMapping(project, mapping),
                      `Correspondance de ${mapping.reference} appliquée. Les besoins sont recalculés.`,
                    )
                  }
                />
              ) : (
                <div className="cp-assembly-note">
                  <h2>{selectedRow.designation}</h2>
                  <p>
                    Cet ensemble multiplie les quantités de ses composants. Il
                    n’entre pas dans le lot d’articles à préparer.
                  </p>
                </div>
              )}
              <SourcePath row={selectedRow} revision={revision} />
              <RowEditor
                key={revision + JSON.stringify(selectedRow)}
                row={selectedRow}
                onApply={(patch) =>
                  commit(
                    editRow(project, revision, selectedRow.node, patch),
                    `Ligne ${selectedRow.node} mise à jour dans la révision ${revision}.`,
                  )
                }
              />
            </aside>
          </div>
        ) : (
          <div className="cp-needs">
            <section className="cp-sheet">
              <h2>Comparaison des versions</h2>
              <p className="cp-mobile-hint">
                Faites défiler le tableau vers la droite pour comparer les
                quantités et les dates.
              </p>
              <p className="cp-muted">
                Même planning et mêmes correspondances pour les deux versions.
                Chaque ligne conserve son article, son indice, son unité et sa
                date de besoin.
              </p>
              <div
                className="cp-table-scroll"
                role="region"
                aria-label="Comparaison des versions, tableau défilant"
                tabIndex="0"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Article / indice</th>
                      <th>Unité</th>
                      <th>Rév. A</th>
                      <th>Rév. B</th>
                      <th>Écart B − A</th>
                      <th>Nature</th>
                      <th>Besoin</th>
                      <th>Préparation B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {differences.map((row) => (
                      <tr
                        key={row.key}
                        className={
                          row.status === "Identique" ? "" : "cp-change"
                        }
                      >
                        <td>
                          <strong>{row.article}</strong>
                          <small>Indice {row.indice}</small>
                          {row.issues.map((i) => (
                            <small key={i} className="cp-issue">
                              {i}
                            </small>
                          ))}
                        </td>
                        <td>{unitLabel(row.unite)}</td>
                        <td>{qty(row.previous)}</td>
                        <td>{qty(row.current)}</td>
                        <td className="cp-number">
                          {row.delta > 0 ? "+" : ""}
                          {qty(row.delta)}
                        </td>
                        <td>{row.status}</td>
                        <td>{date(row.besoin)}</td>
                        <td>
                          {row.current === 0 ? "Retiré" : date(row.afterLaunch)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="cp-sheet">
              <h2>Provenance du lot · révision {revision}</h2>
              {current.groups.map((group) => (
                <details key={group.key} className="cp-provenance">
                  <summary>
                    <strong>{group.article}</strong>
                    <span>
                      {qty(group.quantite)} {unitLabel(group.unite)} · besoin{" "}
                      {date(group.besoin)}
                    </span>
                  </summary>
                  <ul>
                    {group.provenance.map((p) => (
                      <li key={p.node}>
                        Ligne {p.line} · {p.path} · {qty(p.quantite)}{" "}
                        {unitLabel(group.unite)}
                      </li>
                    ))}
                  </ul>
                  {group.issues.length > 0 && (
                    <p className="cp-issue">{group.issues.join(" · ")}</p>
                  )}
                </details>
              ))}
            </section>
          </div>
        )}
        <section className="cp-output">
          <div>
            <h2>Préparation de la révision {revision}</h2>
            <p>
              {current.exportable
                ? "Toutes les lignes disposent d’une correspondance et d’un délai. Le lot peut être préparé."
                : `${current.blockers.length} point${current.blockers.length > 1 ? "s" : ""} à préciser avant l’export du lot complet.`}
            </p>
            <p className="cp-muted">
              Jours calendaires, sans déduction de stock. Format de préparation
              à valider avec l’administrateur ERP. Aucune commande créée.
            </p>
          </div>
          <div className="cp-output-actions">
            <button
              className="cp-primary"
              disabled={!current.exportable}
              onClick={() =>
                act(() => {
                  downloadCsv(
                    `capsa-preparation-${revision}.csv`,
                    preparationHeaders,
                    preparationRows(project, revision),
                  );
                  setMessage(
                    `Préparation ${revision} téléchargée avec les chemins source.`,
                  );
                })
              }
            >
              Exporter la préparation CSV
            </button>
            <button
              onClick={() =>
                act(() => {
                  downloadCsv(
                    "capsa-ecarts-A-B.csv",
                    diffHeaders,
                    diffRows(project),
                  );
                  setMessage(
                    "Écarts entre versions téléchargés, avec les points non résolus.",
                  );
                })
              }
            >
              Exporter les écarts CSV
            </button>
            <button onClick={() => act(exportReport)}>
              Rapport imprimable
            </button>
            {view === "composition" && (
              <button onClick={() => setView("needs")}>
                Voir les besoins & écarts
              </button>
            )}
          </div>
        </section>
        <section className="cp-files">
          <h2>Fichiers de travail</h2>
          <p className="cp-muted">
            Les imports remplacent le jeu choisi après aperçu. Les autres
            données restent en place. Téléchargez les exemples pour retrouver
            les colonnes attendues.
          </p>
          <div className="cp-file-grid">
            <div>
              <label>
                Jeu à importer
                <select
                  value={importKind}
                  onChange={(e) => {
                    setImportKind(e.target.value);
                    setPreview(null);
                    setFileKey((k) => k + 1);
                  }}
                >
                  <option value="bom">
                    Nomenclature de la révision {revision}
                  </option>
                  <option value="mapping">Toutes les correspondances</option>
                  <option value="planning">Tout le planning</option>
                  <option value="json">Dossier complet JSON</option>
                </select>
              </label>
              <FileImport
                key={fileKey}
                label={
                  importKind === "json"
                    ? "Importer le dossier JSON"
                    : "Importer le CSV"
                }
                accept={
                  importKind === "json"
                    ? ".json,application/json"
                    : ".csv,text/csv"
                }
                onFile={importFile}
              />
            </div>
            <div className="cp-samples">
              <button
                onClick={() =>
                  downloadCsv(
                    `capsa-nomenclature-${revision}.csv`,
                    bomHeaders,
                    project.versions[revision],
                  )
                }
              >
                Nomenclature {revision} en CSV
              </button>
              <button
                onClick={() =>
                  downloadCsv(
                    "capsa-correspondances.csv",
                    mapHeaders,
                    project.mappings,
                  )
                }
              >
                Correspondances en CSV
              </button>
              <button
                onClick={() =>
                  downloadCsv("capsa-planning.csv", planHeaders, project.plans)
                }
              >
                Planning en CSV
              </button>
            </div>
            <div className="cp-save">
              <button
                onClick={() => {
                  downloadJson("capsa-dossier.json", project);
                  setMessage("Dossier complet téléchargé.");
                }}
              >
                Sauvegarder le dossier JSON
              </button>
              <button
                onClick={() => {
                  history.reset();
                  setPreview(null);
                  setFileKey((k) => k + 1);
                  setSelected("LUM");
                  setRevision("B");
                  setMessage(
                    "Exemple initial rétabli. Cette action peut être annulée.",
                  );
                }}
              >
                Réinitialiser l’exemple
              </button>
            </div>
          </div>
          {preview && (
            <div className="cp-preview">
              <h3>Remplacer · {preview.label}</h3>
              <p>
                {preview.filename} · {preview.project.versions.A.length} lignes
                A · {preview.project.versions.B.length} lignes B ·{" "}
                {preview.project.mappings.length} correspondances ·{" "}
                {preview.project.plans.length} racines planifiées
              </p>
              <p>
                {previewAnalysis.blockers.length} point(s) à préciser dans la
                révision {revision}. Aucun changement n’est encore appliqué.
              </p>
              <div
                className="cp-table-scroll"
                role="region"
                aria-label="Aperçu de l’import"
                tabIndex="0"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Nœud</th>
                      <th>Référence</th>
                      <th>Quantité dépliée</th>
                      <th>Contrôle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewAnalysis.details.slice(0, 6).map((r) => (
                      <tr key={r.node}>
                        <td>{r.node}</td>
                        <td>{r.reference}</td>
                        <td>{qty(r.total)}</td>
                        <td>{r.issues.join(" · ") || "Renseigné"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="cp-muted">
                Aperçu des six premières lignes. Le remplacement complet reste
                annulable.
              </p>
              <button
                className="cp-primary"
                onClick={() =>
                  commit(
                    preview.project,
                    `${preview.label} importé. Les calculs sont à jour.`,
                  )
                }
              >
                Confirmer le remplacement
              </button>
              <button onClick={() => setPreview(null)}>
                Abandonner l’import
              </button>
            </div>
          )}
          <details className="cp-format">
            <summary>Formats et règles de calcul</summary>
            <p>
              Une ligne de nomenclature possède un identifiant unique, un parent
              éventuel et un type « ensemble » ou « article ». Les assemblages
              doivent avoir des composants. La profondeur est limitée à 32
              niveaux. La quantité d’une feuille multiplie les quantités de son
              chemin et le nombre de modules planifiés.
            </p>
            <p>
              Les correspondances sont définies par référence BE, indice et
              unité. Les conversions standard restent dans une même dimension.
              Les besoins se regroupent uniquement pour un même article de
              gestion, indice, unité cible et date. Les quantités sont arrondies
              à six décimales après dépliage.
            </p>
            <p>
              Les délais sont fictifs et calendaires. Les samedis, dimanches et
              jours fériés sont comptés. Les exports ne tiennent compte ni du
              stock ni des engagements fournisseurs. Aucun fichier n’est envoyé
              à un serveur par cet outil.
            </p>
          </details>
        </section>
        <DemoFooter />
      </main>
    </div>
  );
}

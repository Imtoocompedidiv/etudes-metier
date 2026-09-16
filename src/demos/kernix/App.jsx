import React, { useEffect, useMemo, useState } from "react";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-serif/latin-500.css";
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
  downloadText,
  euro,
  readLocalFile,
} from "../../shared/files.js";
import {
  analyze,
  fields,
  parseXml,
  seed,
  validContract,
  validateState,
} from "./model.js";
import "./styles.css";

export default function App() {
  useDocumentTitle("Kernix · Banc de recette XML");
  const history = useHistory(seed, {
    key: "kernix:v1",
    validate: validateState,
  });
  const state = history.value;
  const analysis = useMemo(() => analyze(state), [state]);
  const [drafts, setDrafts] = useState({
    reference: state.reference,
    candidate: state.candidate,
  });
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [search, setSearch] = useState("");
  const [recordPath, setRecordPath] = useState(state.contract.recordPath);
  useEffect(() => {
    setDrafts((d) => ({ ...d, reference: state.reference }));
  }, [state.reference]);
  useEffect(() => {
    setDrafts((d) => ({ ...d, candidate: state.candidate }));
  }, [state.candidate]);
  useEffect(() => {
    setRecordPath(state.contract.recordPath);
  }, [state.contract.recordPath]);
  useEffect(() => {
    setErrors({});
  }, [state.reference, state.candidate, state.contract.recordPath]);
  const pending =
    drafts.reference !== state.reference ||
    drafts.candidate !== state.candidate ||
    recordPath !== state.contract.recordPath;
  const result = analysis.result;
  const validRows = result.rows.filter((r) => !r.errors.length);
  const excluded = result.rows.filter((r) => r.errors.length);
  const visibleRows = result.rows.filter(
    (row) =>
      (!onlyErrors || row.errors.length) &&
      Object.values(row.values)
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(search.toLocaleLowerCase("fr")),
  );
  const problemFields = new Set(result.errors.map((e) => e.field));

  function travel(action) {
    action();
    setNotice("");
    setErrors({});
  }
  function applyXml(key, text) {
    try {
      parseXml(text);
      history.set((s) => ({ ...s, [key]: text }));
      setDrafts((d) => ({ ...d, [key]: text }));
      setErrors((e) => ({ ...e, [key]: "" }));
      setNotice(
        `${key === "reference" ? "Référence" : "Nouveau flux"} chargé. La comparaison est recalculée.`,
      );
    } catch (e) {
      setErrors((old) => ({ ...old, [key]: e.message }));
    }
  }
  async function importXml(key, file) {
    const text = await readLocalFile(file, { maxBytes: 800_000 });
    parseXml(text);
    applyXml(key, text);
  }
  function updateRule(key, change) {
    history.set((s) => {
      s.contract.fields[key] = { ...s.contract.fields[key], ...change };
      return s;
    });
    setNotice("");
  }
  function applyPath() {
    const next = { ...state.contract, recordPath: recordPath.trim() };
    if (!validContract(next)) {
      setErrors((e) => ({
        ...e,
        path: "Le chemin des objets doit être absolu, par exemple /Catalog/Trip.",
      }));
      return;
    }
    history.set((s) => ({ ...s, contract: next }));
    setErrors((e) => ({ ...e, path: "" }));
    setNotice("Le chemin des objets a été appliqué.");
  }
  async function importContract(file) {
    const c = JSON.parse(await readLocalFile(file, { maxBytes: 50_000 }));
    if (!validContract(c))
      throw new Error(
        "Contrat invalide. Les cinq champs et un identifiant texte obligatoire sont requis.",
      );
    history.set((s) => ({ ...s, contract: c }));
    setNotice("Contrat chargé. Les deux fichiers XML sont conservés.");
  }
  async function restore(file) {
    const value = JSON.parse(
      await readLocalFile(file, { maxBytes: 1_000_000 }),
    );
    if (!validateState(value))
      throw new Error("Dossier invalide ou version non prise en charge.");
    parseXml(value.reference);
    parseXml(value.candidate);
    history.set(value);
    setNotice("Dossier restauré avec ses deux flux et son contrat.");
  }
  function report() {
    downloadReport("kernix-recette.html", {
      title: "Recette XML · Kernix",
      subtitle:
        "Étude indépendante. Flux fictifs ou fichiers fournis localement. Aucun import de production.",
      sections: [
        {
          title: "Périmètre",
          paragraphs: [
            `Chemin des objets : ${state.contract.recordPath}`,
            `${validRows.length} objets valides ; ${excluded.length} écartés.`,
            result.fatal ?? "Analyse du nouveau flux terminée.",
          ],
        },
        {
          title: "Structure",
          headers: ["Évolution", "Chemin"],
          rows: [
            ...(analysis.diff?.removed ?? []).map((p) => [
              "Absent du nouveau flux",
              p,
            ]),
            ...(analysis.diff?.added ?? []).map((p) => ["Ajouté", p]),
          ],
        },
        {
          title: "Contrat",
          headers: ["Champ", "Chemin", "Type", "Obligatoire"],
          rows: fields.map(({ key }) => {
            const rule = state.contract.fields[key];
            return [key, rule.path, rule.type, rule.required ? "Oui" : "Non"];
          }),
        },
        {
          title: "Objets",
          headers: ["Position", ...fields.map((f) => f.label), "Contrôle"],
          rows: result.rows.map((row) => [
            row.index,
            ...fields.map(({ key }) => row.values[key] ?? ""),
            row.errors.map((e) => e.message).join(" ; ") || "Valide",
          ]),
        },
        {
          title: "Unité des montants",
          paragraphs: [
            "Les valeurs de type money sont exprimées en centimes entiers dans les données normalisées et ce rapport. Les prix de la table à l’écran sont affichés en euros.",
          ],
        },
      ],
    });
    setNotice("Rapport HTML téléchargé. Il peut être ouvert et imprimé.");
  }

  return (
    <main className="kx-app">
      <header className="kx-top">
        <div className="kx-identity">
          <span className="kx-brand">Kernix</span>
          <strong>Banc de recette XML</strong>
        </div>
        <span className="kx-independent">
          Prototype indépendant · données fictives
        </span>
        <div className="kx-actions">
          <button
            disabled={!history.canUndo}
            onClick={() => travel(history.undo)}
          >
            Annuler
          </button>
          <button
            disabled={!history.canRedo}
            onClick={() => travel(history.redo)}
          >
            Rétablir
          </button>
          <button
            className="kx-primary"
            onClick={() => {
              travel(history.reset);
              setDrafts({
                reference: seed.reference,
                candidate: seed.candidate,
              });
            }}
          >
            Exemple
          </button>
        </div>
      </header>
      <div className="kx-content">
        <section className="kx-intro">
          <h1>Recetter une évolution de flux</h1>
          <p>
            Le fournisseur a renommé <code>Zone</code>. Remplacez{" "}
            <code>@Zone</code> par <code>@Region</code> dans le contrat, puis
            vérifiez les objets.
          </p>
        </section>
        <div className="kx-documents">
          {["reference", "candidate"].map((key) => (
            <section className="kx-document" key={key}>
              <div className="kx-section-head">
                <h2>
                  {key === "reference" ? "Référence" : "Nouveau flux"}{" "}
                  <span>
                    {key === "reference" ? "(ancienne version)" : "(évolution)"}
                  </span>
                </h2>
                <FileImport
                  label="Importer un XML"
                  accept=".xml,text/xml,application/xml"
                  onFile={(file) => importXml(key, file)}
                />
              </div>
              <label className="kx-sr" htmlFor={`kx-${key}`}>
                {key === "reference"
                  ? "XML de référence"
                  : "XML du nouveau flux"}
              </label>
              <textarea
                id={`kx-${key}`}
                spellCheck={false}
                value={drafts[key]}
                maxLength={200_000}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [key]: e.target.value }))
                }
              />
              <div className="kx-document-tools">
                <button
                  disabled={drafts[key] === state[key]}
                  onClick={() => applyXml(key, drafts[key])}
                >
                  Appliquer le XML
                </button>
                <button
                  className="kx-text-button"
                  onClick={() =>
                    downloadText(
                      `kernix-${key}.xml`,
                      state[key],
                      "application/xml;charset=utf-8",
                    )
                  }
                >
                  Télécharger ce flux
                </button>
              </div>
              <ErrorMessage>
                {errors[key] || analysis[`${key}Error`]}
              </ErrorMessage>
            </section>
          ))}
        </div>
        <section className="kx-diff" aria-label="Écarts de structure">
          <strong>
            {analysis.diff
              ? `${analysis.diff.removed.length} chemin${analysis.diff.removed.length > 1 ? "s" : ""} absent${analysis.diff.removed.length > 1 ? "s" : ""} · ${analysis.diff.added.length} ajouté${analysis.diff.added.length > 1 ? "s" : ""}`
              : "Comparaison indisponible"}
          </strong>
          <div>
            {analysis.diff &&
              (!analysis.diff.removed.length && !analysis.diff.added.length ? (
                <span>
                  Les chemins structurels sont identiques. Les valeurs peuvent
                  différer.
                </span>
              ) : (
                <>
                  {analysis.diff.removed.map((path) => (
                    <p key={`r${path}`}>
                      Absent <code>{path}</code>
                    </p>
                  ))}
                  {analysis.diff.added.map((path) => (
                    <p key={`a${path}`}>
                      Ajouté <code>{path}</code>
                    </p>
                  ))}
                </>
              ))}
          </div>
        </section>

        <section className="kx-contract">
          <div className="kx-section-head">
            <h2>Contrat de correspondance</h2>
            <FileImport
              label="Importer un contrat JSON"
              accept=".json,application/json"
              onFile={importContract}
            />
          </div>
          <div className="kx-record-path">
            <label htmlFor="kx-record-path">Chemin des objets</label>
            <input
              id="kx-record-path"
              value={recordPath}
              maxLength={1000}
              onChange={(e) => setRecordPath(e.target.value)}
            />
            <button
              disabled={recordPath === state.contract.recordPath}
              onClick={applyPath}
            >
              Appliquer le chemin
            </button>
          </div>
          <ErrorMessage>{errors.path}</ErrorMessage>
          <div
            className="kx-table-scroll"
            role="region"
            aria-label="Contrat, tableau défilant horizontalement"
            tabIndex={0}
          >
            <table className="kx-mapping">
              <thead>
                <tr>
                  <th>Champ de sortie</th>
                  <th>Chemin dans le nouveau flux</th>
                  <th>Type</th>
                  <th>Obligatoire</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {fields.map(({ key, label, description }) => {
                  const rule = state.contract.fields[key];
                  return (
                    <tr
                      key={key}
                      className={problemFields.has(key) ? "kx-row-error" : ""}
                    >
                      <th scope="row">
                        <code>{key}</code>
                      </th>
                      <td>
                        <input
                          aria-label={`Chemin du champ ${label}`}
                          value={rule.path}
                          maxLength={1000}
                          onChange={(e) =>
                            updateRule(key, { path: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        {key === "id" ? (
                          <span>Texte</span>
                        ) : (
                          <select
                            aria-label={`Type du champ ${label}`}
                            value={rule.type}
                            onChange={(e) =>
                              updateRule(key, { type: e.target.value })
                            }
                          >
                            <option value="text">Texte</option>
                            <option value="money">Euros</option>
                          </select>
                        )}
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${label} obligatoire`}
                          checked={rule.required}
                          disabled={key === "id"}
                          onChange={(e) =>
                            updateRule(key, { required: e.target.checked })
                          }
                        />
                      </td>
                      <td>{description}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <details className="kx-help">
            <summary>Syntaxe et limites du contrat</summary>
            <p>
              Chaque chemin désigne un élément ou un attribut exact, relatif à
              l’objet. <code>Segment/@Name</code> lit l’attribut de Segment. Une
              valeur multiple est une exception, même pour un champ facultatif.
            </p>
            <p>
              Les espaces de noms utilisent la notation{" "}
              <code>{"{URI}Nom"}</code>, indépendante du préfixe XML. Exemple{" "}
              <code>{"/{urn:sejour}Catalog/{urn:sejour}Trip"}</code>. Aucun
              XPath, joker ou indice. Limites par flux : 200 000 caractères, 5
              000 éléments, 1 000 objets et 24 niveaux. Les DTD et entités
              personnalisées sont refusées.
            </p>
          </details>
        </section>
        {pending && (
          <p className="kx-pending" role="status">
            Des modifications de fichier ou de chemin attendent d’être
            appliquées. Les résultats ci-dessous décrivent la dernière version
            appliquée ; leurs exports sont suspendus.
          </p>
        )}
        <ErrorMessage>{result.fatal}</ErrorMessage>
        <section className="kx-results">
          <div className="kx-section-head">
            <h2>
              Résultats de transformation{" "}
              <span>({result.rows.length} objets)</span>
            </h2>
            <span>
              {validRows.length} valides · {excluded.length} écartés
            </span>
          </div>
          <div className="kx-filters">
            <label>
              Rechercher un objet
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Identifiant, nom, destination…"
              />
            </label>
            <label className="kx-check">
              <input
                type="checkbox"
                checked={onlyErrors}
                onChange={(e) => setOnlyErrors(e.target.checked)}
              />
              Seulement les exceptions
            </label>
          </div>
          <div
            className="kx-table-scroll"
            role="region"
            aria-label="Objets normalisés, tableau défilant horizontalement"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  {fields.map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                  <th>Contrôle</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.index}>
                    {fields.map(({ key }) => (
                      <td key={key}>
                        {row.values[key] == null ? (
                          <span className="kx-missing">Absent</span>
                        ) : state.contract.fields[key].type === "money" ? (
                          euro(row.values[key])
                        ) : (
                          row.values[key]
                        )}
                      </td>
                    ))}
                    <td>
                      {row.errors.length ? (
                        <ul className="kx-errors">
                          {row.errors.map((e, i) => (
                            <li key={`${e.field}-${i}`}>{e.message}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="kx-valid">Valide</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleRows.length && (
              <p className="kx-empty">Aucun objet ne correspond à cette vue.</p>
            )}
          </div>
        </section>
        <section className="kx-delivery">
          <div>
            <h2>Exporter la recette</h2>
            <p>
              Le JSON contient les objets valides et la liste explicite des
              objets écartés. Les montants sont en centimes.
            </p>
          </div>
          <div className="kx-actions">
            <button
              className="kx-primary"
              disabled={pending || !validRows.length || !!result.fatal}
              onClick={() => {
                downloadJson("kernix-donnees.json", {
                  version: 1,
                  moneyUnit: "EUR cents",
                  contract: state.contract,
                  records: validRows.map((r) => r.values),
                  excluded: excluded.map((r) => ({
                    position: r.index,
                    id: r.values.id,
                    errors: r.errors,
                  })),
                });
                setNotice(
                  `Export terminé. Objets valides : ${validRows.length}. Objets écartés et identifiés dans le JSON : ${excluded.length}.`,
                );
              }}
            >
              Données valides JSON
            </button>
            <button
              disabled={pending}
              onClick={() => {
                downloadCsv(
                  "kernix-exceptions.csv",
                  ["position", "id", "champ", "chemin", "erreur"],
                  result.errors.map((e) => [
                    e.object,
                    e.id,
                    e.field,
                    e.path,
                    e.message,
                  ]),
                );
                setNotice("CSV des exceptions téléchargé.");
              }}
            >
              Exceptions CSV
            </button>
            <button
              disabled={pending}
              onClick={() => {
                downloadJson("kernix-contrat.json", state.contract);
                setNotice("Contrat JSON téléchargé.");
              }}
            >
              Contrat JSON
            </button>
            <button disabled={pending} onClick={report}>
              Rapport HTML
            </button>
          </div>
        </section>
        <div className="kx-save">
          <button
            disabled={pending}
            onClick={() => {
              downloadJson("kernix-dossier.json", state);
              setNotice(
                "Dossier complet téléchargé pour une restauration ultérieure.",
              );
            }}
          >
            Sauvegarder le dossier
          </button>
          <FileImport
            label="Restaurer un dossier JSON"
            accept=".json,application/json"
            onFile={restore}
          />
          <p>
            Vos fichiers restent dans ce navigateur.
            {!history.storageAvailable &&
              " Le stockage local est indisponible ; téléchargez le dossier pour le conserver."}
          </p>
        </div>
        <p className="kx-notice" role="status">
          {notice}
        </p>
        <DemoFooter />
      </div>
    </main>
  );
}

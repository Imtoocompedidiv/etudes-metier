import React, { useMemo, useState } from "react";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import { useHistory } from "../../shared/state.js";
import {
  FileImport,
  ErrorMessage,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  downloadCsv,
  downloadJson,
  downloadText,
  downloadReport,
  readLocalFile,
} from "../../shared/files.js";
import {
  OP_LABELS,
  DATE_FORMATS,
  EXAMPLE_CSV,
  initialDocument,
  makeStep,
  importSource,
  runPipeline,
  recipe,
  validateRecipe,
  validateDocument,
} from "./model.js";
import "./styles.css";

function Icon({ name }) {
  const paths = {
    up: "m6 14 6-6 6 6",
    down: "m6 10 6 6 6-6",
    undo: "M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12",
    redo: "m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12",
    download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
    plus: "M12 4v16M4 12h16",
    cross: "m6 6 12 12M18 6 6 18",
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.plus} />
    </svg>
  );
}
export default function Optedif() {
  useDocumentTitle("Optédif · Comprendre chaque transformation");
  const history = useHistory(initialDocument, {
    key: "optedif:v1",
    validate: validateDocument,
  });
  const doc = history.value;
  const [selectedStep, setSelectedStep] = useState("step-3");
  const [selectedCell, setSelectedCell] = useState({
    rowId: "row-1",
    column: "Date",
  });
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const [mobileView, setMobileView] = useState("before");
  const [pendingImport, setPendingImport] = useState(null);
  const result = useMemo(() => runPipeline(doc), [doc]);
  const step = doc.steps.find((s) => s.id === selectedStep) || doc.steps[0];
  const stage = result.stages.find((s) => s.id === step?.id) || {
    rows: doc.rows,
    issues: [],
    traces: [],
    excluded: [],
  };
  const allRows =
    filter === "errors"
      ? doc.rows.filter((r) => result.issues.some((i) => i.rowId === r.id))
      : doc.rows;
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(allRows.length / 50) - 1),
  );
  const shown = allRows.slice(safePage * 50, safePage * 50 + 50);
  const cellTrace = stage.traces.find(
    (t) =>
      t.rowId === selectedCell.rowId &&
      (t.column === selectedCell.column || step?.type === "dedup"),
  );
  const sourceRow = doc.rows.find((r) => r.id === selectedCell.rowId);
  const outputRow = stage.rows.find((r) => r.id === selectedCell.rowId);
  const selectedIssue = stage.issues.find(
    (i) => i.rowId === selectedCell.rowId && i.column === selectedCell.column,
  );
  const changeStep = (patch) => {
    if (!step) return;
    history.set((d) => ({
      ...d,
      steps: d.steps.map((s) => (s.id === step.id ? { ...s, ...patch } : s)),
    }));
    setFeedback("");
  };
  const moveStep = (id, offset) =>
    history.set((d) => {
      const i = d.steps.findIndex((s) => s.id === id),
        target = i + offset;
      if (target < 0 || target >= d.steps.length) return d;
      const steps = [...d.steps];
      [steps[i], steps[target]] = [steps[target], steps[i]];
      return { ...d, steps };
    });
  const addStep = (type) => {
    const id = `step-${Date.now()}`;
    history.set((d) => ({
      ...d,
      steps: [...d.steps, makeStep(type, d.headers, id)],
    }));
    setSelectedStep(id);
    setAdding(false);
  };
  const editCell = (id, column, value) =>
    history.set((d) => ({
      ...d,
      rows: d.rows.map((r) =>
        r.id === id ? { ...r, values: { ...r.values, [column]: value } } : r,
      ),
    }));
  const importCsv = async (file) => {
    setError("");
    const source = importSource(await readLocalFile(file));
    setPendingImport({ source, name: file.name });
  };
  const confirmImport = () => {
    const source = pendingImport.source;
    const steps = ["trim", "amount", "date", "dedup"].map((type, i) =>
      makeStep(type, source.headers, `step-${i + 1}`),
    );
    history.set({ ...source, steps });
    setSelectedStep("step-3");
    setSelectedCell({ rowId: source.rows[0].id, column: steps[2].column });
    setPage(0);
    setFilter("all");
    setFeedback(
      `${source.rows.length} lignes importées. Choisissez les colonnes et formats de chaque opération.`,
    );
    setPendingImport(null);
  };
  const importRecipe = async (file) => {
    const parsed = JSON.parse(await readLocalFile(file));
    const steps = validateRecipe(parsed, doc.headers);
    history.set((d) => ({ ...d, steps }));
    setSelectedStep(steps[0]?.id || "");
    setFeedback(
      `${steps.length} opérations chargées et rejouées sur le fichier courant.`,
    );
  };
  const exported = (fn, message) => {
    try {
      fn();
      setFeedback(message);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };
  const reset = () => {
    history.reset();
    setPage(0);
    setFilter("all");
    setSelectedStep("step-3");
    setSelectedCell({ rowId: "row-1", column: "Date" });
    setFeedback("Exercice initial restauré. Vous pouvez annuler cette action.");
  };
  const sourceLabel = (id) =>
    doc.rows.find((r) => r.id === id)?.values[doc.headers[0]] || id;
  const exportExceptions = () =>
    downloadCsv(
      "optedif-exceptions.csv",
      [
        "Ligne source",
        "Référence",
        "Colonne",
        "Opération",
        "Motif",
        "Traitement",
      ],
      [...result.issues, ...result.excluded].map((i) => [
        doc.rows.findIndex((r) => r.id === i.rowId) + 1,
        sourceLabel(i.rowId),
        i.column,
        OP_LABELS[doc.steps.find((s) => s.id === i.stepId)?.type] || "",
        i.message,
        i.severity === "excluded" ? "Exclue par règle choisie" : "À corriger",
      ]),
    );
  const exportWorksheet = () =>
    downloadReport("optedif-fiche-de-reprise.html", {
      title: "Préparer un export et expliquer sa méthode",
      subtitle:
        "Exercice indépendant pour Optédif · Paramètres et exemples pédagogiques",
      sections: [
        {
          title: "La méthode choisie",
          headers: ["Ordre", "Opération", "Réglages", "Active"],
          rows: doc.steps.map((s, i) => [
            i + 1,
            OP_LABELS[s.type],
            [
              s.column || s.columns?.join(", "),
              s.format && DATE_FORMATS[s.format],
              s.locale,
              s.policy,
              s.mode,
            ]
              .filter(Boolean)
              .join(" · "),
            s.enabled ? "Oui" : "Non",
          ]),
        },
        {
          title: "Bilan des règles actives",
          paragraphs: [
            `${doc.rows.length} lignes source ; ${result.validRows.length} exportables ; ${result.invalidRows.length} à corriger ; ${result.excluded.length} écartées par la politique de doublon.`,
            `L’ordre des opérations compte. Un contrôle placé avant un nettoyage analyse la valeur qu’il reçoit à ce moment. Aucun format de date n’est déduit automatiquement.`,
          ],
        },
        {
          title: "Exceptions à examiner",
          headers: ["Référence", "Colonne", "Motif"],
          rows: result.issues.map((i) => [
            sourceLabel(i.rowId),
            i.column,
            i.message,
          ]),
        },
      ],
    });
  function columnsChoice() {
    return (
      <fieldset className="opd-column-checks">
        <legend>Colonnes utilisées</legend>
        {step.type === "trim" && (
          <label>
            <input
              type="checkbox"
              checked={step.columns.includes("*")}
              onChange={(e) =>
                changeStep({
                  columns: e.target.checked ? ["*"] : [doc.headers[0]],
                })
              }
            />
            Toutes les colonnes
          </label>
        )}
        {!step.columns.includes("*") &&
          doc.headers.map((h) => (
            <label key={h}>
              <input
                type="checkbox"
                checked={step.columns.includes(h)}
                onChange={(e) => {
                  const columns = e.target.checked
                    ? [...step.columns, h]
                    : step.columns.filter((x) => x !== h);
                  if (columns.length) changeStep({ columns });
                }}
              />
              {h}
            </label>
          ))}
      </fieldset>
    );
  }
  function table(mode) {
    const after = mode === "after";
    return (
      <section
        className={`opd-data-panel ${mobileView === mode ? "opd-mobile-active" : ""}`}
        aria-label={after ? "Après cette étape" : "Fichier d’origine"}
      >
        <div className="opd-panel-title">
          <h2>{after ? "Après cette étape" : "Avant"}</h2>
          <span>
            {after ? "Lecture seule" : "Fichier d’origine modifiable"}
          </span>
        </div>
        <div
          className="opd-table-scroll"
          role="region"
          aria-label={`${after ? "Résultat" : "Source"} : tableau défilable horizontalement`}
          tabIndex="0"
        >
          <table>
            <thead>
              <tr>
                {doc.headers.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const displayed = after
                  ? stage.rows.find((r) => r.id === row.id)
                  : row;
                const removed = after && !displayed;
                return (
                  <tr
                    key={row.id}
                    className={
                      selectedCell.rowId === row.id ? "opd-selected" : ""
                    }
                  >
                    {doc.headers.map((column) => {
                      const issues = stage.issues.filter(
                        (i) =>
                          i.rowId === row.id &&
                          (i.column === column ||
                            (step?.type === "dedup" &&
                              i.column.includes(column))),
                      );
                      return (
                        <td key={column}>
                          {after ? (
                            <button
                              className={`opd-result-cell ${issues.length ? "opd-invalid" : ""} ${removed ? "opd-removed" : ""}`}
                              onClick={() =>
                                setSelectedCell({ rowId: row.id, column })
                              }
                              aria-label={`Examiner ${column}, ligne ${doc.rows.indexOf(row) + 1}`}
                              aria-description={
                                issues.map((i) => i.message).join(". ") ||
                                undefined
                              }
                              title={
                                issues.length
                                  ? issues.map((i) => i.message).join(". ")
                                  : displayed?.values[column] || "Valeur vide"
                              }
                            >
                              {removed
                                ? "Ligne exclue"
                                : displayed.values[column] || "∅"}
                            </button>
                          ) : (
                            <input
                              aria-label={`${column}, ligne ${doc.rows.indexOf(row) + 1}`}
                              value={row.values[column]}
                              maxLength={512}
                              onFocus={() =>
                                setSelectedCell({ rowId: row.id, column })
                              }
                              onChange={(e) =>
                                editCell(row.id, column, e.target.value)
                              }
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!shown.length && (
            <p className="opd-empty">Aucune ligne pour ce filtre.</p>
          )}
        </div>
      </section>
    );
  }
  return (
    <div className="opd-app">
      <header className="opd-topbar">
        <div className="opd-brand">
          <strong>
            Optédif <span>Formation</span>
          </strong>
          <span className="opd-context">Exercice indépendant</span>
        </div>
        <div className="opd-toolbar">
          <FileImport onFile={importCsv} />
          <button
            onClick={() =>
              exported(
                () =>
                  downloadText(
                    "optedif-exemple.csv",
                    EXAMPLE_CSV,
                    "text/csv;charset=utf-8",
                  ),
                "Fichier exemple préparé pour le téléchargement.",
              )
            }
          >
            Fichier exemple
          </button>
          <button onClick={history.undo} disabled={!history.canUndo}>
            <Icon name="undo" />
            Annuler
          </button>
          <button
            className="opd-icon-button"
            onClick={history.redo}
            disabled={!history.canRedo}
            aria-label="Refaire la dernière action"
          >
            <Icon name="redo" />
          </button>
          <button className="opd-primary" onClick={reset}>
            Reprendre l’exercice
          </button>
        </div>
      </header>
      <div className="opd-layout">
        <div className="opd-intro">
          <h1>Comprendre chaque transformation</h1>
          <p>
            Choisissez le format des dates, puis comparez une ligne avant et
            après.
          </p>
        </div>
        <aside className="opd-rail" aria-label="Méthode de transformation">
          <div className="opd-rail-heading">
            <h2>La méthode</h2>
            <p>Rejouée sur chaque ligne.</p>
          </div>
          <ol className="opd-step-list">
            {doc.steps.map((s, i) => (
              <li key={s.id} className={s.id === step?.id ? "is-active" : ""}>
                <input
                  type="checkbox"
                  aria-label={`Activer ${OP_LABELS[s.type]}`}
                  checked={s.enabled}
                  onChange={(e) =>
                    history.set((d) => ({
                      ...d,
                      steps: d.steps.map((x) =>
                        x.id === s.id ? { ...x, enabled: e.target.checked } : x,
                      ),
                    }))
                  }
                />
                <button
                  className="opd-step-name"
                  aria-pressed={s.id === step?.id}
                  onClick={() => setSelectedStep(s.id)}
                >
                  {OP_LABELS[s.type]}
                </button>
                <div className="opd-step-moves">
                  <button
                    aria-label={`Monter ${OP_LABELS[s.type]}`}
                    disabled={i === 0}
                    onClick={() => moveStep(s.id, -1)}
                  >
                    <Icon name="up" />
                  </button>
                  <button
                    aria-label={`Descendre ${OP_LABELS[s.type]}`}
                    disabled={i === doc.steps.length - 1}
                    onClick={() => moveStep(s.id, 1)}
                  >
                    <Icon name="down" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="opd-rail-actions">
            <button
              disabled={doc.steps.length >= 12}
              aria-expanded={adding}
              onClick={() => setAdding((x) => !x)}
            >
              <Icon name="plus" />
              Ajouter une opération
            </button>
            {adding && (
              <div className="opd-add-menu">
                {Object.entries(OP_LABELS).map(([type, label]) => (
                  <button key={type} onClick={() => addStep(type)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() =>
                exported(
                  () => downloadJson("optedif-methode.json", recipe(doc)),
                  "Méthode préparée. Réimportez ce JSON pour rejouer les mêmes opérations.",
                )
              }
            >
              <Icon name="download" />
              Exporter la méthode
            </button>
            <FileImport
              label="Importer une méthode"
              accept=".json,application/json"
              onFile={importRecipe}
            />
            <p>
              L’ordre compte. Déplacez une règle pour observer ce qu’elle
              reçoit.
            </p>
          </div>
        </aside>
        <main className="opd-work">
          <ErrorMessage>{error}</ErrorMessage>
          {pendingImport && (
            <section
              className="opd-import-review"
              aria-label="Confirmer le fichier"
            >
              <h2>Charger {pendingImport.name}</h2>
              <p>
                {pendingImport.source.rows.length} lignes et{" "}
                {pendingImport.source.headers.length} colonnes reconnues. Le
                fichier actuel et sa méthode seront remplacés ; Annuler
                permettra de les retrouver.
              </p>
              <div>
                <button className="opd-primary" onClick={confirmImport}>
                  Charger ce fichier
                </button>
                <button onClick={() => setPendingImport(null)}>
                  Garder l’exercice actuel
                </button>
              </div>
            </section>
          )}
          {step ? (
            <section
              className="opd-settings"
              aria-label="Réglages de l’opération"
            >
              <div className="opd-setting-title">
                <h2>{OP_LABELS[step.type]}</h2>
                <button
                  className="opd-text-button"
                  onClick={() =>
                    history.set((d) => ({
                      ...d,
                      steps: d.steps.filter((s) => s.id !== step.id),
                    }))
                  }
                >
                  Retirer cette opération
                </button>
              </div>
              <div className="opd-settings-fields">
                {["trim", "dedup"].includes(step.type) ? (
                  columnsChoice()
                ) : (
                  <label>
                    Colonne
                    <select
                      aria-label="Colonne de l’opération"
                      value={step.column}
                      onChange={(e) => {
                        changeStep({ column: e.target.value });
                        setSelectedCell((c) => ({
                          ...c,
                          column: e.target.value,
                        }));
                      }}
                    >
                      {doc.headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                )}
                {step.type === "date" && (
                  <label>
                    Format déclaré
                    <select
                      aria-label="Format déclaré des dates"
                      value={step.format}
                      onChange={(e) => changeStep({ format: e.target.value })}
                    >
                      <option value="">Choisir, sans deviner</option>
                      {Object.entries(DATE_FORMATS).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {step.type === "amount" && (
                  <label>
                    Écriture des montants
                    <select
                      aria-label="Écriture des montants"
                      value={step.locale}
                      onChange={(e) => changeStep({ locale: e.target.value })}
                    >
                      <option value="fr">Française · 1 240,50</option>
                      <option value="en">Anglaise · 1,240.50</option>
                    </select>
                  </label>
                )}
                {step.type === "dedup" && (
                  <label>
                    Traitement explicite
                    <select
                      aria-label="Traitement des doublons"
                      value={step.policy}
                      onChange={(e) => changeStep({ policy: e.target.value })}
                    >
                      <option value="flag">
                        Signaler les lignes concernées
                      </option>
                      <option value="first">
                        Conserver la première occurrence
                      </option>
                    </select>
                  </label>
                )}
                {step.type === "case" && (
                  <label>
                    Résultat attendu
                    <select
                      value={step.mode}
                      onChange={(e) => changeStep({ mode: e.target.value })}
                    >
                      <option value="upper">MAJUSCULES</option>
                      <option value="lower">minuscules</option>
                    </select>
                  </label>
                )}
                <p className="opd-rule-note">
                  {!step.enabled
                    ? "Cette opération est désactivée. Activez-la dans la méthode pour la rejouer."
                    : step.type === "date"
                      ? "03/04/2026 peut désigner deux dates. Seul le format choisi décide."
                      : step.type === "amount"
                        ? "Une cellule vide reste une anomalie. Les décimales sont traitées au centime."
                        : step.type === "dedup"
                          ? "La clé choisie détermine les groupes. Aucune ressemblance approximative n’est utilisée."
                          : step.type === "trim"
                            ? "Nettoyez avant de comparer les clés pour réunir les espaces invisibles."
                            : "La casse transforme seulement le texte de la colonne choisie."}
                </p>
              </div>
            </section>
          ) : (
            <section className="opd-settings">
              <h2>Aucune opération</h2>
              <p>
                Ajoutez une règle pour commencer. Le résultat correspond pour
                l’instant au fichier d’origine.
              </p>
            </section>
          )}
          <div className="opd-preview-toolbar">
            <span>{doc.rows.length} lignes dans le fichier</span>
            <label>
              Afficher
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">Toutes les lignes</option>
                <option value="errors">Exceptions du résultat final</option>
              </select>
            </label>
            <div
              className="opd-mobile-tabs"
              role="tablist"
              aria-label="Aperçu des données"
            >
              <button
                role="tab"
                aria-selected={mobileView === "before"}
                onClick={() => setMobileView("before")}
              >
                Avant
              </button>
              <button
                role="tab"
                aria-selected={mobileView === "after"}
                onClick={() => setMobileView("after")}
              >
                Après
              </button>
            </div>
          </div>
          <div className="opd-comparison">
            {table("before")}
            {table("after")}
          </div>
          {allRows.length > 50 && (
            <nav className="opd-pagination" aria-label="Pages du tableau">
              <button
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                Précédentes
              </button>
              <span>
                Lignes {safePage * 50 + 1} à{" "}
                {Math.min(allRows.length, (safePage + 1) * 50)} sur{" "}
                {allRows.length}
              </span>
              <button
                disabled={(safePage + 1) * 50 >= allRows.length}
                onClick={() => setPage(safePage + 1)}
              >
                Suivantes
              </button>
            </nav>
          )}
          <section className="opd-explanation">
            <div className="opd-explain-cell">
              <h2>Pourquoi cette valeur change</h2>
              <p>
                {selectedCell.column} · {sourceLabel(selectedCell.rowId)}
              </p>
              <div className="opd-value-route">
                <div>
                  <span>Valeur d’origine</span>
                  <code>{sourceRow?.values[selectedCell.column] || "∅"}</code>
                </div>
                <div>
                  <span>À cette étape</span>
                  <p>
                    {selectedIssue?.message ||
                      cellTrace?.explanation ||
                      (step?.enabled
                        ? "Cette opération ne transforme pas cette cellule."
                        : "Aucune transformation active à cette étape.")}
                  </p>
                </div>
                <div>
                  <span>Valeur obtenue</span>
                  <code>
                    {outputRow?.values[selectedCell.column] ||
                      (!outputRow ? "Ligne exclue" : "∅")}
                  </code>
                </div>
              </div>
            </div>
            <div className="opd-exception-list">
              <h2>À examiner dans le résultat final</h2>
              {result.issues.length ? (
                <ul>
                  {result.issues.slice(0, 5).map((i, n) => (
                    <li key={`${i.stepId}-${i.rowId}-${i.column}-${n}`}>
                      <button
                        onClick={() => {
                          setSelectedStep(i.stepId);
                          setSelectedCell({
                            rowId: i.rowId,
                            column: doc.headers.includes(i.column)
                              ? i.column
                              : doc.headers[0],
                          });
                          setPage(
                            Math.floor(
                              doc.rows.findIndex((r) => r.id === i.rowId) / 50,
                            ),
                          );
                          setFilter("all");
                          setMobileView("after");
                        }}
                      >
                        <strong>{sourceLabel(i.rowId)}</strong>
                        <span>
                          {i.column} · {i.message}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Aucune exception pour les règles actives.</p>
              )}
              {result.issues.length > 5 && (
                <p>
                  {result.issues.length - 5} autres signalements dans l’export.
                </p>
              )}
              {result.excluded.length > 0 && (
                <p>
                  {result.excluded.length} ligne(s) exclue(s) par la règle de
                  doublon choisie.
                </p>
              )}
            </div>
          </section>
          <section className="opd-delivery">
            <div>
              <h2>Le résultat et la méthode restent séparés</h2>
              <p>
                {result.validRows.length} ligne(s) exportable(s) selon les
                règles actives ; {result.invalidRows.length} à corriger.
              </p>
            </div>
            <div className="opd-delivery-actions">
              <button
                className="opd-primary"
                disabled={!result.validRows.length}
                onClick={() =>
                  exported(
                    () =>
                      downloadCsv(
                        "optedif-resultat.csv",
                        doc.headers,
                        result.validRows.map((r) => r.values),
                      ),
                    `${result.validRows.length} lignes préparées pour le téléchargement. Les exceptions restent à part.`,
                  )
                }
              >
                <Icon name="download" />
                Exporter le résultat contrôlé
              </button>
              <button
                onClick={() =>
                  exported(
                    exportExceptions,
                    "Relevé des exceptions préparé pour le téléchargement.",
                  )
                }
              >
                <Icon name="download" />
                Exporter les exceptions
              </button>
            </div>
            <button
              className="opd-text-button"
              onClick={() =>
                exported(
                  exportWorksheet,
                  "Fiche pédagogique HTML préparée. Elle peut être imprimée depuis le navigateur.",
                )
              }
            >
              Télécharger la fiche de reprise
            </button>
          </section>
          <div className="opd-feedback" role="status" aria-live="polite">
            {feedback}
            {!history.storageAvailable &&
              " La sauvegarde locale est indisponible ; exportez votre méthode avant de fermer."}
          </div>
          <footer className="opd-footer">
            <span>
              Exemple fictif · Calculs dans votre navigateur · Sans compte
            </span>
            <a href="https://imtoocompedidiv.github.io/portfolio/">
              Conception et développement par JD
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}

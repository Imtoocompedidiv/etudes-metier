import React, { useState } from "react";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import { useHistory } from "../../shared/state.js";
import {
  FileImport,
  DemoFooter,
  useDocumentTitle,
  ErrorMessage,
} from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadCsv,
  downloadJson,
  downloadText,
  downloadReport,
} from "../../shared/files.js";
import {
  fields,
  shapes,
  initialDossier,
  analyze,
  parseOrder,
  normalizeDossier,
  validDossier,
  correctLine,
  removeCorrection,
  changeMapping,
  replaceOrder,
  outputRows,
  outputHeaders,
  questionText,
  exampleCsv,
} from "./model.js";
import "./styles.css";

const stamp = () => new Date().toISOString();
const mm = (x) =>
  x === null
    ? "Non convertie"
    : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(x) +
      " mm";
const shortIssue = (r) =>
  r.ready
    ? "Données préparées"
    : r.issues.some((x) => x.code === "duplicate")
      ? "Repère en double"
      : r.issues.some((x) => x.code === "unit")
        ? "Unité à confirmer"
        : r.issues.some((x) => x.code === "plan")
          ? "Plan à préciser"
          : "Données à préciser";
function Units({ value, onChange, label, id }) {
  return (
    <label htmlFor={id}>
      {label}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">À confirmer</option>
        {value && !["mm", "cm", "m"].includes(value) && (
          <option value={value}>{value} (à préciser)</option>
        )}
        <option value="mm">mm</option>
        <option value="cm">cm</option>
        <option value="m">m</option>
      </select>
    </label>
  );
}
function Mapping({ d, onCommit }) {
  const [draft, setDraft] = useState(d.mapping),
    [unit, setUnit] = useState(d.fallbackUnit);
  const changed =
    JSON.stringify(draft) !== JSON.stringify(d.mapping) ||
    unit !== d.fallbackUnit;
  return (
    <details className="bou-mapping" open>
      <summary>
        Colonnes du fichier <span>{d.name}</span>
      </summary>
      <div className="bou-map-grid">
        {fields.map(([k, label]) => (
          <label key={k}>
            {label}
            <select
              value={draft[k]}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            >
              <option value="">Non associée</option>
              {d.table.headers.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="bou-map-bottom">
        <Units
          id="bou-file-unit"
          label="Unité des lignes sans unité"
          value={unit}
          onChange={setUnit}
        />
        <p>
          L’unité n’est jamais déduite des dimensions. Ce réglage ne remplace
          pas une unité renseignée dans le fichier.
        </p>
        <button
          disabled={!changed}
          onClick={() =>
            onCommit(
              () => changeMapping(d, draft, unit, stamp()),
              "Correspondance appliquée.",
            )
          }
        >
          Appliquer la correspondance
        </button>
      </div>
      {d.edits.length > 0 && (
        <p className="bou-map-note">
          Modifier la correspondance ou l’unité de fichier réinitialisera les{" "}
          {d.edits.length} correction{d.edits.length > 1 ? "s" : ""} de lignes.
          Vous pourrez annuler.
        </p>
      )}
    </details>
  );
}
function Editor({ r, d, onCommit }) {
  const [draft, setDraft] = useState(r.values),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const unitMissing = r.issues.some((i) => i.code === "unit");
  const save = (e) => {
    e.preventDefault();
    setError("");
    try {
      const next = correctLine(d, r.line, draft, reason, stamp());
      onCommit(() => next, `Correction de la ligne ${r.line} enregistrée.`);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <aside className="bou-editor" aria-label="Correction de la ligne">
      <h2>Ligne de données {r.line}</h2>
      <p className={"bou-status " + (r.ready ? "bou-ready" : "bou-pending")}>
        {shortIssue(r)}
      </p>
      {r.issues.length > 0 && (
        <ul className="bou-issues">
          {r.issues.map((i) => (
            <li key={i.code}>{i.message}</li>
          ))}
        </ul>
      )}
      <div
        className="bou-scroll"
        tabIndex="0"
        role="region"
        aria-label="Source et préparation, tableau défilant"
      >
        <table className="bou-compare">
          <thead>
            <tr>
              <th>Champ</th>
              <th>Valeur source</th>
              <th>Préparée</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Largeur</th>
              <td>{r.source.width || "Absente"}</td>
              <td>{mm(r.widthMm)}</td>
            </tr>
            <tr>
              <th>Hauteur</th>
              <td>{r.source.height || "Absente"}</td>
              <td>{mm(r.heightMm)}</td>
            </tr>
            <tr>
              <th>Unité</th>
              <td>{r.source.unit || "Absente"}</td>
              <td>{r.unit || "Non confirmée"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <form onSubmit={save}>
        <div className="bou-edit-grid">
          {fields
            .filter(([k]) => !["unit", "shape", "plan"].includes(k))
            .map(([k, label]) => (
              <label key={k}>
                {label}
                <input
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  maxLength={300}
                  inputMode={
                    ["quantity", "width", "height"].includes(k)
                      ? "decimal"
                      : undefined
                  }
                />
              </label>
            ))}
          <Units
            id="bou-line-unit"
            label="Unité de cette ligne"
            value={draft.unit}
            onChange={(unit) => setDraft({ ...draft, unit })}
          />
          <label>
            Forme
            <select
              value={draft.shape}
              onChange={(e) => setDraft({ ...draft, shape: e.target.value })}
            >
              <option value="">À préciser</option>
              {!shapes.includes(draft.shape) && draft.shape && (
                <option value={draft.shape}>{draft.shape} (à préciser)</option>
              )}
              {shapes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Référence du plan
          <input
            value={draft.plan}
            onChange={(e) => setDraft({ ...draft, plan: e.target.value })}
            placeholder="Ex. PLAN-FICTIF-03-A"
            maxLength={300}
          />
        </label>
        <p className="bou-hint">
          Pour une forme spéciale, renseigner le plan fourni. Sa référence ne
          valide ni son contenu ni la fabrication.
        </p>
        <label>
          Motif de la correction
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Précisez ce qui a été confirmé."
            maxLength={300}
            rows={2}
          />
        </label>
        <ErrorMessage>{error}</ErrorMessage>
        <button className="bou-primary" type="submit">
          {unitMissing ? "Confirmer l’unité" : "Enregistrer la correction"}
        </button>
      </form>
      {r.edit && (
        <div className="bou-existing">
          <p>
            <strong>Dernière correction</strong>
            <br />
            {r.edit.reason}
          </p>
          <button
            onClick={() =>
              onCommit(
                () => removeCorrection(d, r.line, stamp()),
                "Correction retirée, valeurs source restaurées.",
              )
            }
          >
            Retirer la correction
          </button>
        </div>
      )}
      <p className="bou-hint">
        Les valeurs source restent conservées. La préparation se recalcule après
        enregistrement.
      </p>
      <details>
        <summary>Tous les champs source</summary>
        <dl>
          {fields.map(([k, l]) => (
            <React.Fragment key={k}>
              <dt>{l}</dt>
              <dd>{r.source[k] || "Non renseigné"}</dd>
            </React.Fragment>
          ))}
        </dl>
      </details>
    </aside>
  );
}
export default function App() {
  useDocumentTitle("Boulangeot · Préparation des demandes");
  const history = useHistory(initialDossier, {
    key: "boulangeot:v1",
    validate: validDossier,
  });
  const d = history.value,
    a = analyze(d);
  const [selected, setSelected] = useState(2),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(null);
  const rows = a.rows.filter(
    (r) =>
      (filter === "all" ||
        (filter === "pending" && !r.ready) ||
        (filter === "ready" && r.ready)) &&
      `${r.reference} ${r.shape} ${r.plan}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const current = a.rows.find((r) => r.line === selected) || a.rows[0];
  const commit = (fn, msg) => {
    setError("");
    try {
      history.set(normalizeDossier(fn()));
      setNotice(msg);
    } catch (e) {
      setError(e.message);
    }
  };
  const read = async (file, kind) => {
    setPending(null);
    setError("");
    setNotice("");
    try {
      const text = await readLocalFile(file);
      setPending(
        kind === "csv"
          ? { kind, name: file.name, value: parseOrder(text) }
          : {
              kind,
              name: file.name,
              value: normalizeDossier(JSON.parse(text)),
            },
      );
    } catch (e) {
      setError(e.message);
    }
  };
  const accept = () => {
    if (!pending) return;
    commit(
      () =>
        pending.kind === "csv"
          ? replaceOrder(d, pending.value, pending.name, stamp())
          : pending.value,
      pending.kind === "csv"
        ? "Fichier reçu. Vérifiez les correspondances et les lignes à préciser."
        : "Dossier restauré avec ses valeurs source, corrections et journal.",
    );
    setSelected(1);
    setQuery("");
    setFilter("all");
    setPending(null);
  };
  const exportFile = (kind) => {
    if (kind === "csv")
      downloadCsv(
        "boulangeot-lignes-preparees.csv",
        outputHeaders,
        outputRows(d),
      );
    if (kind === "questions")
      downloadText("boulangeot-questions-client.txt", questionText(d));
    if (kind === "exceptions")
      downloadCsv(
        "boulangeot-lignes-a-preciser.csv",
        ["ligne_source", "repere", "questions"],
        a.pending.map((r) => [
          r.line,
          r.reference,
          r.issues.map((x) => x.message).join(" | "),
        ]),
      );
    if (kind === "json") downloadJson("boulangeot-dossier.json", d);
    if (kind === "html")
      downloadReport("boulangeot-preparation.html", {
        title: "Préparation de demande de chiffrage",
        subtitle: `Boulangeot · étude indépendante · ${d.name} · Données fictives`,
        sections: [
          {
            title: "Périmètre",
            paragraphs: [
              "Préparation de données, format indépendant de Logikal. Ce contrôle ne valide pas les plans, la faisabilité ou la conformité de fabrication.",
              `${a.ready.length} ligne(s) préparée(s), ${a.pending.length} à préciser. Le CSV de préparation n’inclut que les premières.`,
            ],
          },
          {
            title: "Lignes préparées",
            headers: outputHeaders,
            rows: outputRows(d),
          },
          {
            title: "Points à préciser",
            headers: ["Ligne", "Repère", "Questions"],
            rows: a.pending.map((r) => [
              r.line,
              r.reference,
              r.issues.map((i) => i.message).join(" / "),
            ]),
          },
          {
            title: "Source et décisions",
            headers: ["Ligne", "Champ", "Source", "Valeur retenue", "Motif"],
            rows: a.rows.flatMap((r) =>
              fields.map(([k, l]) => [
                r.line,
                l,
                r.source[k],
                r.values[k],
                r.edit?.reason || "",
              ]),
            ),
          },
          {
            title: "Journal",
            headers: ["Date", "Action"],
            rows: d.journal.map((j) => [j.at, j.action]),
          },
        ],
      });
    setNotice("Fichier téléchargé depuis le dossier courant.");
  };
  return (
    <div className="bou-app">
      <main>
        <header className="bou-header">
          <div>
            <h1>Préparer une demande de chiffrage</h1>
            <p>Confirmez une unité, puis corrigez le repère en double.</p>
          </div>
          <div className="bou-meta">
            <strong>Boulangeot · étude indépendante</strong>
            <span>Données fictives · traitement local</span>
          </div>
        </header>
        <div className="bou-toolbar">
          <FileImport
            label="Importer un CSV"
            accept=".csv,text/csv"
            onFile={(f) => read(f, "csv")}
          />
          <button
            onClick={() => {
              history.undo();
              setNotice("Modification annulée.");
              setError("");
            }}
            disabled={!history.canUndo}
          >
            Annuler
          </button>
          <button
            onClick={() => {
              history.redo();
              setNotice("Modification rétablie.");
              setError("");
            }}
            disabled={!history.canRedo}
          >
            Rétablir
          </button>
          <button className="bou-primary" onClick={() => exportFile("json")}>
            Sauvegarder
          </button>
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        {notice && (
          <p className="bou-notice" role="status">
            {notice}
          </p>
        )}
        {!history.storageAvailable && (
          <p role="alert">
            La sauvegarde locale est indisponible. Téléchargez le dossier JSON
            pour le conserver.
          </p>
        )}
        {pending && (
          <section className="bou-preview" aria-label="Aperçu avant import">
            <h2>
              {pending.kind === "csv"
                ? "Fichier prêt à examiner"
                : "Dossier prêt à restaurer"}
            </h2>
            <p>
              {pending.name} ·{" "}
              {pending.kind === "csv"
                ? `${pending.value.rows.length} lignes et ${pending.value.headers.length} colonnes.`
                : `${pending.value.table.rows.length} lignes et ${pending.value.edits.length} corrections.`}
            </p>
            <p>
              {pending.kind === "csv"
                ? "Un nouveau fichier remplace le précédent et réinitialise ses corrections. Un fichier identique conserve le travail effectué."
                : "Ce dossier remplace le dossier courant. Le remplacement est annulable."}
            </p>
            {pending.kind === "csv" && (
              <div
                className="bou-scroll"
                role="region"
                tabIndex="0"
                aria-label="Aperçu du CSV, tableau défilant"
              >
                <table>
                  <thead>
                    <tr>
                      {pending.value.headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pending.value.rows.slice(0, 3).map((r, i) => (
                      <tr key={i}>
                        {r.map((v, j) => (
                          <td key={j}>{v || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button className="bou-primary" onClick={accept}>
              Confirmer l’import
            </button>
            <button onClick={() => setPending(null)}>
              Abandonner l’import
            </button>
          </section>
        )}
        <Mapping
          key={JSON.stringify([
            d.name,
            d.mapping,
            d.fallbackUnit,
            d.table.headers,
          ])}
          d={d}
          onCommit={commit}
        />
        <div className="bou-workspace">
          <section aria-label="Lignes à préparer" className="bou-lines">
            <div className="bou-filters">
              <label>
                Rechercher un repère
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex. F-04 ou cintrée"
                />
              </label>
              <label>
                Afficher
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Toutes les lignes</option>
                  <option value="pending">Lignes à préciser</option>
                  <option value="ready">Lignes préparées</option>
                </select>
              </label>
            </div>
            <div
              className="bou-scroll"
              role="region"
              tabIndex="0"
              aria-label="Demande de chiffrage, tableau défilant"
            >
              <table className="bou-table">
                <thead>
                  <tr>
                    <th>Repère</th>
                    <th>Quantité</th>
                    <th>Dimensions préparées</th>
                    <th>Forme</th>
                    <th>Contrôle</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      className={r.line === current.line ? "bou-selected" : ""}
                      key={r.line}
                    >
                      <td>
                        <button
                          aria-pressed={r.line === current.line}
                          onClick={() => setSelected(r.line)}
                        >
                          {r.reference || "Sans repère"}
                        </button>
                        <small>Ligne {r.line}</small>
                      </td>
                      <td>{r.quantity ?? "À préciser"}</td>
                      <td>
                        {r.widthMm === null || r.heightMm === null ? (
                          <span>
                            À préciser
                            <small>
                              Source {r.source.width || "?"} ×{" "}
                              {r.source.height || "?"}
                            </small>
                          </span>
                        ) : (
                          <span>
                            {new Intl.NumberFormat("fr-FR", {
                              maximumFractionDigits: 3,
                            }).format(r.widthMm)}{" "}
                            ×{" "}
                            {new Intl.NumberFormat("fr-FR", {
                              maximumFractionDigits: 3,
                            }).format(r.heightMm)}{" "}
                            mm
                          </span>
                        )}
                      </td>
                      <td>{r.shape || "À préciser"}</td>
                      <td>
                        <span
                          className={
                            "bou-status " +
                            (r.ready ? "bou-ready" : "bou-pending")
                          }
                        >
                          {shortIssue(r)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && (
              <p className="bou-empty">
                Aucune ligne ne correspond aux filtres.
              </p>
            )}
            <div className="bou-table-note">
              <p>
                {rows.length} ligne{rows.length === 1 ? "" : "s"} affichée
                {rows.length === 1 ? "" : "s"} sur {a.rows.length}. Chaque
                repère doit rester distinct.
              </p>
              <p>
                Dimensions préparées en mm. Aucune forme n’est dessinée ou
                déclarée réalisable par cet outil.
              </p>
            </div>
          </section>
          <Editor
            key={JSON.stringify(current)}
            r={current}
            d={d}
            onCommit={commit}
          />
        </div>
        <section className="bou-output">
          <div>
            <h2>Sortie de préparation</h2>
            <p>
              {a.ready.length} ligne{a.ready.length === 1 ? "" : "s"} préparée
              {a.ready.length === 1 ? "" : "s"}, {a.pending.length} à préciser.
              Le fichier de sortie est indépendant de Logikal.
            </p>
          </div>
          <div>
            <button
              className="bou-primary"
              disabled={!a.ready.length}
              onClick={() => exportFile("csv")}
            >
              CSV des lignes préparées
            </button>
            <button onClick={() => exportFile("questions")}>
              Questions client
            </button>
            <button onClick={() => exportFile("exceptions")}>
              CSV des exceptions
            </button>
            <button onClick={() => exportFile("html")}>Rapport HTML</button>
          </div>
        </section>
        <details className="bou-journal">
          <summary>Journal des modifications ({d.journal.length})</summary>
          {d.journal.length ? (
            <ol>
              {[...d.journal].reverse().map((j, i) => (
                <li key={i}>
                  <time dateTime={j.at}>
                    {new Date(j.at).toLocaleTimeString("fr-FR")}
                  </time>
                  {j.action}
                </li>
              ))}
            </ol>
          ) : (
            <p>Aucune modification enregistrée.</p>
          )}
        </details>
        <div className="bou-tools">
          <button
            onClick={() => {
              downloadText(
                "boulangeot-exemple.csv",
                exampleCsv,
                "text/csv;charset=utf-8",
              );
              setNotice("Exemple CSV téléchargé.");
            }}
          >
            Télécharger le CSV exemple
          </button>
          <FileImport
            label="Restaurer un dossier JSON"
            accept=".json,application/json"
            onFile={(f) => read(f, "json")}
          />
          <button
            onClick={() => {
              history.reset();
              setSelected(2);
              setQuery("");
              setFilter("all");
              setPending(null);
              setError("");
              setNotice(
                "Exemple réinitialisé. Cette action peut être annulée.",
              );
            }}
          >
            Réinitialiser l’exemple
          </button>
        </div>
        <p className="bou-limit">
          Exemple local de préparation, sans envoi ni connexion à un logiciel de
          fabrication. 500 lignes maximum ; dimensions positives avec trois
          décimales au plus, jusqu’à 1 000 000 mm pour le calcul. Ces limites de
          saisie ne définissent aucune gamme fabricable.
        </p>
        <DemoFooter />
      </main>
    </div>
  );
}

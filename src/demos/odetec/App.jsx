import { useState } from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
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
  initial,
  schemas,
  labels,
  prepared,
  parseTable,
  normalizeDossier,
  validDossier,
  mapProject,
  editRow,
  importTable,
  manifest,
} from "./model.js";
import "./styles.css";

const names = Object.keys(schemas);
function Inspector({ d, table, row, raw, onCommit }) {
  const [draft, setDraft] = useState({
    ...raw,
    ...d.edits.find((e) => e.table === table && e.id === raw.id)?.values,
  });
  const [target, setTarget] = useState(
    d.mappings.find((m) => m.old === draft.projet)?.target || "",
  );
  const [error, setError] = useState("");
  const unknown =
    table !== "projects" &&
    !d.source.projects.some((p) => p.id === draft.projet);
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify({
      ...raw,
      ...d.edits.find((e) => e.table === table && e.id === raw.id)?.values,
    });
  function save(e) {
    e.preventDefault();
    try {
      onCommit(editRow(d, table, raw.id, draft), `Correction de ${raw.id}`);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  function relate() {
    try {
      onCommit(
        mapProject(d, draft.projet, target),
        target
          ? `Correspondance ${draft.projet} vers ${target}`
          : `Correspondance ${draft.projet} retirée`,
      );
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  const issues = prepared(d).issues.filter(
    (i) => i.table === table && i.id === row.id,
  );
  return (
    <aside className="od-inspector" aria-label={`Éditer ${raw.id}`}>
      <h2>
        {unknown ? "Relier" : "Préparer"} {raw.id}
      </h2>
      <p className="od-small">
        La source reste conservée. Toute correction est annulable.
      </p>
      {unknown && (
        <div className="od-mapping">
          <p>
            Projet source <code>{draft.projet}</code>
          </p>
          <label htmlFor="od-target">Projet cible</label>
          <select
            id="od-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={dirty}
          >
            <option value="">Aucune correspondance</option>
            {prepared(d).tables.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} · {p.titre} · {p.ville}
              </option>
            ))}
          </select>
          <p className="od-small">
            Cette correspondance s’applique à toutes les références au code{" "}
            <code>{draft.projet}</code>.
          </p>
          <button className="od-primary" onClick={relate} disabled={dirty}>
            Enregistrer la relation
          </button>
          {dirty && (
            <p className="od-small">
              Enregistrez d’abord vos modifications ci-dessous.
            </p>
          )}
        </div>
      )}
      <details className="od-edit" open={!unknown}>
        <summary>Modifier la ligne</summary>
        <form onSubmit={save}>
          {schemas[table].columns
            .filter((f) => f !== "id")
            .map((field) => (
              <label key={field}>
                {labels[field]}
                <input
                  value={draft[field]}
                  onChange={(e) =>
                    setDraft({ ...draft, [field]: e.target.value })
                  }
                  maxLength={["projet", "lot"].includes(field) ? 80 : 200}
                  list={
                    field === "projet"
                      ? "od-project-list"
                      : field === "lot"
                        ? "od-lot-list"
                        : undefined
                  }
                />
              </label>
            ))}
          <datalist id="od-project-list">
            {d.source.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titre} · {p.ville}
              </option>
            ))}
          </datalist>
          <datalist id="od-lot-list">
            {d.source.lots.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titre}
              </option>
            ))}
          </datalist>
          <button type="submit" disabled={!dirty}>
            Enregistrer la ligne
          </button>
        </form>
      </details>
      <ErrorMessage>{error}</ErrorMessage>
      {issues.length > 0 && (
        <div className="od-caution">
          {issues.map((issue, i) => (
            <p key={i}>{issue.message}</p>
          ))}
        </div>
      )}
      <details>
        <summary>Voir la ligne d’origine</summary>
        <dl>
          {schemas[table].columns.map((f) => (
            <div key={f}>
              <dt>{labels[f]}</dt>
              <dd>{raw[f]}</dd>
            </div>
          ))}
        </dl>
      </details>
    </aside>
  );
}
export default function App() {
  useDocumentTitle("ODETEC · Préparation de migration");
  const history = useHistory(initial, {
      key: "odetec:v1",
      validate: validDossier,
    }),
    d = history.value,
    p = prepared(d);
  const [table, setTable] = useState("lots"),
    [id, setId] = useState("L-03"),
    [onlyIssues, setOnlyIssues] = useState(false),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(null),
    [showImport, setShowImport] = useState(false),
    [epoch, setEpoch] = useState(0);
  const row = p.tables[table].find((r) => r.id === id),
    raw = d.source[table].find((r) => r.id === id),
    blocked = p.issues.length > 0;
  const rows = p.tables[table].filter(
    (r) =>
      (!onlyIssues ||
        p.issues.some((i) => i.table === table && i.id === r.id)) &&
      [r.id, r.titre, r.ville, r.sourceProject, r.lot]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(query.toLocaleLowerCase("fr")),
  );
  const changed = d.edits.length + d.mappings.length;
  function select(nextTable, nextId) {
    setTable(nextTable);
    setId(nextId ?? p.tables[nextTable][0]?.id);
    setNotice("");
  }
  function commit(next, action) {
    next.journal = [
      ...next.journal,
      { at: new Date().toISOString(), action },
    ].slice(-500);
    history.set(next);
    setNotice(action);
    setError("");
  }
  async function file(file, kind) {
    setError("");
    setNotice("");
    const text = await readLocalFile(file);
    if (kind === "dossier") {
      const restored = normalizeDossier(JSON.parse(text));
      setPreview({ kind, file: file.name, dossier: restored });
    } else
      setPreview({
        kind: table,
        file: file.name,
        rows: parseTable(table, text),
      });
  }
  function accept() {
    try {
      if (preview.kind === "dossier") {
        commit(preview.dossier, `Dossier ${preview.file} restauré`);
        setTable("lots");
        setId(preview.dossier.source.lots[0].id);
      } else {
        const next = importTable(d, preview.kind, preview.rows);
        commit(
          next,
          `${schemas[preview.kind].label} importés depuis ${preview.file}`,
        );
        setTable(preview.kind);
        setId(preview.rows[0].id);
      }
      setPreview(null);
      setShowImport(false);
      setEpoch(epoch + 1);
    } catch (e) {
      setError(e.message);
    }
  }
  function exportTable(which) {
    try {
      manifest(d);
      downloadCsv(
        `odetec-${which}.csv`,
        schemas[which].columns,
        p.tables[which],
      );
      setNotice(`${schemas[which].label} téléchargés en CSV.`);
    } catch (e) {
      setError(e.message);
    }
  }
  function exportManifest() {
    try {
      downloadJson("odetec-manifeste.json", manifest(d));
      setNotice("Manifeste de relations téléchargé.");
    } catch (e) {
      setError(e.message);
    }
  }
  function report() {
    downloadReport("odetec-controle.html", {
      title: "Préparation de migration · ODETEC",
      subtitle:
        "Prototype indépendant · opérations fictives · aucune connexion à Notion",
      sections: [
        {
          title: "État des contrôles",
          paragraphs: [
            `${p.issues.length} contrôle(s) à résoudre. ${d.source.projects.length} projets, ${d.source.lots.length} lots, ${d.source.deliverables.length} livrables.`,
            ...p.issues.map(
              (i) => `${schemas[i.table].label} ${i.id} : ${i.message}`,
            ),
          ],
        },
        {
          title: "Effets des correspondances",
          headers: ["Table", "Ligne", "Code source", "Projet cible"],
          rows: p.effects.map((e) => [
            schemas[e.table].label,
            e.id,
            e.source,
            e.target,
          ]),
        },
        ...names.map((t) => ({
          title: `${schemas[t].label} préparés`,
          headers: schemas[t].columns.map((f) => labels[f]),
          rows: p.tables[t].map((r) =>
            schemas[t].columns.map((f) => r[f] ?? "À résoudre"),
          ),
        })),
        {
          title: "Corrections explicites",
          headers: ["Table", "Ligne", "Champ", "Source", "Préparé"],
          rows: d.edits.flatMap((e) =>
            schemas[e.table].columns
              .filter(
                (f) =>
                  f !== "id" &&
                  e.values[f] !==
                    d.source[e.table].find((r) => r.id === e.id)[f],
              )
              .map((f) => [
                schemas[e.table].label,
                e.id,
                labels[f],
                d.source[e.table].find((r) => r.id === e.id)[f],
                e.values[f],
              ]),
          ),
        },
        {
          title: "Reprise des relations",
          paragraphs: [
            "Le manifeste distingue les valeurs simples des relations. Les clés métier doivent être rapprochées des identifiants de pages cibles pendant la reprise. Aucun import Notion n’est exécuté.",
          ],
        },
      ],
    });
    setNotice("Rapport HTML de contrôle téléchargé.");
  }
  let relationLot =
    table === "lots"
      ? row
      : table === "deliverables"
        ? p.tables.lots.find((l) => l.id === row?.lot)
        : null;
  const relationProject =
    table === "projects"
      ? row
      : p.tables.projects.find(
          (project) => project.id === (row?.projet || relationLot?.projet),
        );
  const children =
    table === "projects"
      ? p.tables.lots.filter((l) => l.projet === row?.id)
      : table === "lots"
        ? p.tables.deliverables.filter((l) => l.lot === row?.id)
        : row
          ? [row]
          : [];
  return (
    <div className="od-app">
      <aside className="od-rail">
        <strong>ODETEC</strong>
        <p>
          Préparation
          <br />
          des données
        </p>
        <div className="od-rail-note">
          Prototype indépendant
          <br />
          Données fictives
        </div>
        <div className="od-rail-state">
          {changed} décision{changed !== 1 ? "s" : ""}
          <br />
          <span>{blocked ? "Contrôles en cours" : "Relations cohérentes"}</span>
        </div>
        <p className="od-local">Les fichiers restent dans ce navigateur.</p>
      </aside>
      <main className="od-main">
        <header className="od-header">
          <div>
            <h1>Préparer une migration de projets</h1>
            <p>
              Commencez par relier le code <code>ancien-102</code> au projet{" "}
              <code>P-102</code>.
            </p>
          </div>
          <div className="od-tools">
            <button
              onClick={() => setShowImport(!showImport)}
              aria-expanded={showImport}
            >
              Importer
            </button>
            <button
              disabled={!history.canUndo}
              onClick={() => {
                history.undo();
                setNotice("Dernière décision annulée.");
              }}
            >
              Annuler
            </button>
            <button
              disabled={!history.canRedo}
              onClick={() => {
                history.redo();
                setNotice("Décision rétablie.");
              }}
            >
              Rétablir
            </button>
            <button
              className="od-primary"
              onClick={() => {
                downloadJson("odetec-dossier.json", d);
                setNotice("Dossier JSON sauvegardé avec sources et décisions.");
              }}
            >
              Sauvegarder
            </button>
          </div>
        </header>
        {!history.storageAvailable && (
          <p className="od-caution">
            La sauvegarde locale est indisponible. Téléchargez le dossier JSON
            pour le conserver.
          </p>
        )}
        {showImport && (
          <section className="od-import">
            <h2>Importer les données</h2>
            <p>
              Chaque CSV remplace sa table source et ses corrections. Les autres
              tables sont conservées ; leurs relations seront à nouveau
              contrôlées.
            </p>
            <div className="od-import-actions">
              <FileImport
                key={`${epoch}-${table}`}
                label={`Choisir un CSV ${schemas[table].label}`}
                accept=".csv,text/csv"
                onFile={(f) => file(f, "table")}
              />
              <button
                onClick={() => {
                  downloadCsv(
                    `odetec-${table}-exemple.csv`,
                    schemas[table].columns,
                    initial.source[table],
                  );
                  setNotice("Exemple CSV téléchargé.");
                }}
              >
                Exemple {schemas[table].label}
              </button>
              <FileImport
                key={`json-${epoch}`}
                label="Restaurer un dossier JSON"
                accept=".json,application/json"
                onFile={(f) => file(f, "dossier")}
              />
            </div>
            <p className="od-small">
              Colonnes attendues pour {schemas[table].label.toLowerCase()} :{" "}
              <code>{schemas[table].columns.join(";")}</code>
            </p>
          </section>
        )}
        {preview && (
          <section className="od-preview" aria-label="Aperçu de l’import">
            <h2>{preview.file}</h2>
            <p>
              {preview.kind === "dossier"
                ? `Restaurer ${preview.dossier.source.projects.length} projets, ${preview.dossier.source.lots.length} lots et ${preview.dossier.source.deliverables.length} livrables, avec leurs décisions.`
                : `Remplacer la table ${schemas[preview.kind].label} par ${preview.rows.length} lignes validées.`}
            </p>
            {preview.rows && (
              <ul>
                {preview.rows.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    {r.id} · {r.titre}
                  </li>
                ))}
              </ul>
            )}
            <button className="od-primary" onClick={accept}>
              Confirmer l’import
            </button>
            <button
              onClick={() => {
                setPreview(null);
                setEpoch(epoch + 1);
              }}
            >
              Abandonner
            </button>
          </section>
        )}
        <ErrorMessage>{error}</ErrorMessage>
        <p role="status" className="od-notice">
          {notice}
        </p>
        <nav className="od-tabs" aria-label="Tables à préparer">
          {names.map((t) => (
            <button
              key={t}
              aria-current={table === t ? "page" : undefined}
              onClick={() => {
                select(t);
                setOnlyIssues(false);
                setQuery("");
              }}
            >
              {schemas[t].label} <span>({d.source[t].length})</span>
            </button>
          ))}
        </nav>
        <div className="od-workbench">
          <section className="od-data" aria-label={schemas[table].label}>
            <div className="od-filter">
              <label>
                Rechercher
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Code ou intitulé"
                />
              </label>
              <label className="od-check">
                <input
                  type="checkbox"
                  checked={onlyIssues}
                  onChange={(e) => setOnlyIssues(e.target.checked)}
                />
                Lignes à contrôler
              </label>
            </div>
            <div
              className="od-table-scroll"
              tabIndex="0"
              role="region"
              aria-label="Table des données, défilement horizontal possible"
            >
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Intitulé</th>
                    <th>{table === "projects" ? "Ville" : "Projet source"}</th>
                    {table !== "projects" && <th>Projet préparé</th>}
                    {table === "deliverables" && <th>Lot préparé</th>}
                    <th>Contrôle</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const bad = p.issues.filter(
                      (i) => i.table === table && i.id === r.id,
                    );
                    return (
                      <tr
                        key={r.id}
                        className={r.id === id ? "od-selected" : ""}
                      >
                        <td>
                          <button
                            aria-label={`Ouvrir ${r.id}`}
                            onClick={() => select(table, r.id)}
                          >
                            {r.id}
                          </button>
                        </td>
                        <td>{r.titre}</td>
                        <td>
                          {table === "projects"
                            ? r.ville
                            : d.source[table].find((x) => x.id === r.id).projet}
                        </td>
                        {table !== "projects" && (
                          <td className={r.projet ? "od-link" : "od-amber"}>
                            {r.projet || "À relier"}
                          </td>
                        )}
                        {table === "deliverables" && <td>{r.lot}</td>}
                        <td>
                          <span className={bad.length ? "od-bad" : "od-ok"}>
                            {bad.length ? "À contrôler" : "Cohérent"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!rows.length && (
                <p className="od-empty">
                  Aucune ligne ne correspond aux filtres. Décochez le filtre ou
                  changez la recherche.
                </p>
              )}
            </div>
            <section className="od-relations">
              <h2>Relations de {row?.id || "la ligne sélectionnée"}</h2>
              {row ? (
                <>
                  <div className="od-chain">
                    <div className={relationProject ? "" : "od-chain-missing"}>
                      <span>Projet</span>
                      <strong>{relationProject?.id || "À relier"}</strong>
                      <p>
                        {relationProject?.titre ||
                          row.sourceProject ||
                          "Projet absent"}
                      </p>
                      {relationProject?.ville && (
                        <small>{relationProject.ville}</small>
                      )}
                    </div>
                    {table !== "projects" && (
                      <>
                        <span className="od-chain-join" aria-hidden="true">
                          ↔
                        </span>
                        <div
                          className={
                            relationLot?.projet === relationProject?.id &&
                            relationProject
                              ? ""
                              : "od-chain-missing"
                          }
                        >
                          <span>Lot</span>
                          <strong>{relationLot?.id || "Absent"}</strong>
                          <p>{relationLot?.titre || row.lot || "Lot absent"}</p>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="od-related">
                    <span>
                      {table === "projects"
                        ? "Lots liés"
                        : table === "lots"
                          ? "Livrables utilisant ce lot"
                          : "Livrable"}
                    </span>
                    {children.length ? (
                      children.map((child) => (
                        <button
                          key={child.id}
                          onClick={() =>
                            select(
                              table === "projects" ? "lots" : "deliverables",
                              child.id,
                            )
                          }
                        >
                          {child.id} · {child.titre}
                        </button>
                      ))
                    ) : (
                      <p>Aucun élément lié.</p>
                    )}
                  </div>
                </>
              ) : (
                <p>Sélectionnez une ligne dans la table.</p>
              )}
            </section>
          </section>
          {row && raw ? (
            <Inspector
              key={`${table}-${id}-${JSON.stringify(d.edits)}-${JSON.stringify(d.mappings)}`}
              d={d}
              table={table}
              row={row}
              raw={raw}
              onCommit={commit}
            />
          ) : (
            <aside className="od-inspector">
              <h2>Choisir une ligne</h2>
              <p>
                Ouvrez son code stable pour examiner ses données et relations.
              </p>
            </aside>
          )}
        </div>
        <section className="od-controls">
          <div className="od-section-title">
            <h2>Contrôles de la reprise</h2>
            <span>{p.issues.length} à résoudre</span>
          </div>
          {p.issues.length ? (
            p.issues.map((i, n) => (
              <button
                className="od-issue"
                key={`${i.table}-${i.id}-${n}`}
                onClick={() => {
                  select(i.table, i.id);
                  setOnlyIssues(false);
                  setQuery("");
                }}
              >
                <span className="od-issue-mark">!</span>
                <span>
                  <strong>
                    {i.id} · {schemas[i.table].label}
                  </strong>
                  <span>{i.message}</span>
                </span>
                <span>Ouvrir</span>
              </button>
            ))
          ) : (
            <p className="od-success">
              Toutes les relations pointent vers une clé présente et le même
              projet. Les tables et le manifeste peuvent être préparés.
            </p>
          )}
          {p.homonyms.length > 0 && (
            <div className="od-homonyms">
              <strong>{p.homonyms.length} projets homonymes conservés</strong>
              <p>
                {p.homonyms.map((r) => `${r.id} (${r.ville})`).join(" · ")}. Le
                titre ne sert jamais de clé de fusion.
              </p>
            </div>
          )}
        </section>
        {d.mappings.length > 0 && (
          <section className="od-effects">
            <h2>Effets des correspondances</h2>
            <p>Chaque occurrence préparée reste reliée à sa valeur source.</p>
            {d.mappings.map((m) => (
              <div className="od-map-row" key={m.old}>
                <code>{m.old}</code>
                <span>vers</span>
                <strong>{m.target}</strong>
                <span>
                  {p.effects
                    .filter((e) => e.source === m.old)
                    .map((e) => e.id)
                    .join(", ") || "Aucune occurrence courante"}
                </span>
                <button
                  onClick={() =>
                    commit(
                      mapProject(d, m.old, ""),
                      `Correspondance ${m.old} retirée`,
                    )
                  }
                >
                  Retirer
                </button>
              </div>
            ))}
          </section>
        )}
        <section className="od-exports">
          <div>
            <h2>Préparer la reprise</h2>
            <p>
              Les CSV portent les clés métier. Le manifeste décrit les relations
              à recréer, après association aux identifiants de pages cibles.
              Aucun accès à Notion.
            </p>
          </div>
          <div className="od-export-buttons">
            {names.map((t) => (
              <button key={t} disabled={blocked} onClick={() => exportTable(t)}>
                CSV {schemas[t].label}
              </button>
            ))}
            <button
              className="od-primary"
              disabled={blocked}
              onClick={exportManifest}
            >
              Manifeste JSON
            </button>
            <button onClick={report}>Rapport HTML</button>
          </div>
          {blocked && (
            <p className="od-small">
              Résolvez les contrôles pour exporter des tables cohérentes. Le
              rapport et la sauvegarde restent disponibles.
            </p>
          )}
        </section>
        <details className="od-journal">
          <summary>Journal des décisions ({d.journal.length})</summary>
          {d.journal.length ? (
            <ol>
              {d.journal.map((j, i) => (
                <li key={i}>
                  <time>{new Date(j.at).toLocaleTimeString("fr-FR")}</time>{" "}
                  {j.action}
                </li>
              ))}
            </ol>
          ) : (
            <p>Aucune décision enregistrée dans cet exemple.</p>
          )}
        </details>
        <div className="od-bottom">
          <button
            onClick={() => {
              history.reset();
              setTable("lots");
              setId("L-03");
              setPreview(null);
              setQuery("");
              setOnlyIssues(false);
              setEpoch(epoch + 1);
              setNotice("Exemple réinitialisé. Cette action est annulable.");
            }}
          >
            Repartir de l’exemple
          </button>
          <DemoFooter />
        </div>
      </main>
    </div>
  );
}

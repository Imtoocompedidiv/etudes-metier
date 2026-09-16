import React, { useEffect, useMemo, useState } from "react";
import "@fontsource/roboto-condensed/400.css";
import "@fontsource/roboto-condensed/600.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import { useHistory } from "../../shared/state.js";
import {
  FileImport,
  ErrorMessage,
  DemoFooter,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  parseCsv,
  readLocalFile,
  downloadCsv,
  downloadJson,
  downloadReport,
} from "../../shared/files.js";
import {
  seed,
  lineHeaders,
  receiptHeaders,
  reconciliationHeaders,
  parseLines,
  parseReceipts,
  normalizeProject,
  validProject,
  reconcile,
  caseSummaries,
  upsertReceipt,
  updateLine,
  removeReceipt,
  nextReceiptId,
} from "./model.js";
import "./styles.css";
const fr = (s) => s.split("-").reverse().join("/");
const quantity = (v) => (v === null ? "Non renseigné" : v);
function ReceiptForm({ project, line, editing, onSave, onCancel }) {
  const [draft, setDraft] = useState(
    editing || {
      reception: nextReceiptId(project),
      colis: "COL-DEMO-42",
      date: "2026-09-17",
      ligne: line.ligne,
      quantite: "1",
      commentaire: "",
    },
  );
  const [ack, setAck] = useState(false),
    [error, setError] = useState("");
  const current = reconcile({
    ...project,
    receipts: project.receipts.filter((r) => r.reception !== draft.reception),
  }).find((l) => l.ligne === line.ligne);
  const excess =
    current.autorisee === null || Number(draft.quantite) > current.attendu;
  function save(e) {
    e.preventDefault();
    try {
      onSave(
        upsertReceipt(
          project,
          { ...draft, ligne: line.ligne },
          { acknowledge: ack },
        ),
        editing ? "Réception corrigée." : "Réception enregistrée.",
      );
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <form className="masterk-form" onSubmit={save}>
      <h2>{editing ? "Corriger la réception" : "Enregistrer un colis"}</h2>
      <p>
        <strong>{line.ligne}</strong> · {line.article}
      </p>
      <div className="masterk-readout">
        <span>
          Autorisé <strong>{quantity(current.autorisee)}</strong>
        </span>
        <span>
          Déjà reçu <strong>{current.recu}</strong>
        </span>
        <span>
          Attendu <strong>{quantity(current.attendu)}</strong>
        </span>
      </div>
      <label>
        Référence du colis
        <input
          required
          maxLength="180"
          value={draft.colis}
          onChange={(e) => setDraft({ ...draft, colis: e.target.value })}
        />
      </label>
      <label>
        Date de réception
        <input
          type="date"
          required
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
      </label>
      <label>
        Quantité de cette ligne dans le colis
        <input
          type="number"
          required
          min="1"
          max="100000"
          step="1"
          value={draft.quantite}
          onChange={(e) => {
            setDraft({ ...draft, quantite: e.target.value });
            setAck(false);
          }}
        />
      </label>
      <label>
        Commentaire
        <textarea
          maxLength="180"
          rows="3"
          value={draft.commentaire}
          onChange={(e) => setDraft({ ...draft, commentaire: e.target.value })}
        />
      </label>
      {excess && (
        <label className="masterk-ack">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          <span>
            Je relève une réception physique avec écart d’autorisation. Cet
            écart restera visible.
          </span>
        </label>
      )}
      <ErrorMessage>{error}</ErrorMessage>
      <button className="masterk-primary" type="submit">
        {editing ? "Enregistrer la correction" : "Enregistrer la réception"}
      </button>
      {editing && (
        <button type="button" onClick={onCancel}>
          Abandonner la correction
        </button>
      )}
      <p className="masterk-help">
        Les quantités s’ajoutent par ligne. Pour un colis contenant plusieurs
        articles, conservez sa référence et sa date.
      </p>
    </form>
  );
}
function LineForm({ line, project, onSave, onCancel }) {
  const [draft, setDraft] = useState({
      ...line,
      autorisee: line.autorisee ?? "",
    }),
    [error, setError] = useState("");
  return (
    <form
      className="masterk-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave(
            updateLine(project, draft),
            `Données de ${line.ligne} corrigées.`,
          );
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <h2>Corriger la ligne {line.ligne}</h2>
      <p>
        Recopiez les informations d’un document existant. Aucune autorisation de
        retour n’est émise ici.
      </p>
      <label>
        Article
        <input
          required
          maxLength="180"
          value={draft.article}
          onChange={(e) => setDraft({ ...draft, article: e.target.value })}
        />
      </label>
      <label>
        Numéro de série, si disponible
        <input
          maxLength="180"
          value={draft.serie}
          onChange={(e) => setDraft({ ...draft, serie: e.target.value })}
        />
      </label>
      <label>
        Quantité demandée
        <input
          type="number"
          min="1"
          max="100000"
          required
          value={draft.quantite}
          onChange={(e) => setDraft({ ...draft, quantite: e.target.value })}
        />
      </label>
      <label>
        Motif
        <input
          required
          maxLength="180"
          value={draft.motif}
          onChange={(e) => setDraft({ ...draft, motif: e.target.value })}
        />
      </label>
      <fieldset>
        <legend>Autorisation déjà reçue</legend>
        <label>
          Référence du bon
          <input
            maxLength="180"
            value={draft.autorisation}
            onChange={(e) =>
              setDraft({ ...draft, autorisation: e.target.value })
            }
          />
        </label>
        <label>
          Quantité autorisée
          <input
            type="number"
            min="0"
            max="100000"
            value={draft.autorisee}
            onChange={(e) => setDraft({ ...draft, autorisee: e.target.value })}
          />
        </label>
        <p className="masterk-help">
          Laissez les deux champs vides si vous n’avez pas le bon. Zéro signifie
          qu’aucune unité n’est autorisée.
        </p>
      </fieldset>
      <ErrorMessage>{error}</ErrorMessage>
      <button className="masterk-primary">Enregistrer les données</button>
      <button type="button" onClick={onCancel}>
        Revenir au colis
      </button>
    </form>
  );
}
export default function App() {
  useDocumentTitle("ARPEGE MASTER K · Réception des retours");
  const history = useHistory(seed, {
      key: "arpege-master-k:v1",
      validate: validProject,
    }),
    project = history.value;
  const [selectedCase, setSelectedCase] = useState("R-2609-14"),
    [selectedLine, setSelectedLine] = useState("L-102"),
    [search, setSearch] = useState(""),
    [onlyIssues, setOnlyIssues] = useState(false),
    [mode, setMode] = useState("receipt"),
    [editing, setEditing] = useState(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [epoch, setEpoch] = useState(0),
    [pending, setPending] = useState(null),
    [replaceAck, setReplaceAck] = useState(false);
  const allRows = useMemo(() => reconcile(project), [project]),
    cases = useMemo(() => caseSummaries(project), [project]);
  const active = cases.find((c) => c.dossier === selectedCase) || cases[0];
  const rows = active.rows;
  const line = rows.find((l) => l.ligne === selectedLine) || rows[0];
  const visibleCases = cases.filter(
    (c) =>
      (!onlyIssues || c.issues > 0) &&
      `${c.dossier} ${c.client}`
        .toLocaleLowerCase("fr")
        .includes(search.toLocaleLowerCase("fr")),
  );
  const receipts = project.receipts.filter((r) =>
    rows.some((l) => l.ligne === r.ligne),
  );
  useEffect(() => {
    if (!cases.some((c) => c.dossier === selectedCase)) {
      setSelectedCase(cases[0].dossier);
      setSelectedLine(cases[0].rows[0].ligne);
      setEditing(null);
    }
  }, [project, selectedCase]);
  function chooseCase(c) {
    setSelectedCase(c.dossier);
    setSelectedLine(
      c.rows.find((l) => l.attendu > 0)?.ligne || c.rows[0].ligne,
    );
    setMode("receipt");
    setEditing(null);
    setError("");
  }
  function chooseLine(id) {
    setSelectedLine(id);
    setMode("receipt");
    setEditing(null);
    setEpoch((n) => n + 1);
  }
  function commit(next, message) {
    next.journal = [
      ...(next.journal || []),
      { at: new Date().toISOString(), text: message },
    ].slice(-40);
    history.set(next);
    setNotice(message);
    setError("");
    setEditing(null);
    setEpoch((n) => n + 1);
    setMode("receipt");
  }
  function moveHistory(direction) {
    history[direction]();
    setEditing(null);
    setMode("receipt");
    setEpoch((n) => n + 1);
    setPending(null);
    setError("");
    setNotice(
      direction === "undo" ? "Modification annulée." : "Modification rétablie.",
    );
  }
  async function ingest(file, type) {
    const raw = await readLocalFile(file);
    const value =
      type === "json"
        ? normalizeProject(JSON.parse(raw))
        : type === "lines"
          ? parseLines(parseCsv(raw, { requiredHeaders: lineHeaders }).rows)
          : parseReceipts(
              parseCsv(raw, { requiredHeaders: receiptHeaders, maxRows: 5000 })
                .rows,
              project.lines,
            );
    setPending({ type, value, name: file.name });
    setReplaceAck(false);
  }
  function confirmImport() {
    try {
      let next;
      if (pending.type === "json") next = pending.value;
      else if (pending.type === "lines") {
        if (project.receipts.length && !replaceAck)
          throw Error(
            "Confirmez le remplacement du lot et le retrait des réceptions associées.",
          );
        next = { ...project, lines: pending.value, receipts: [] };
      } else next = { ...project, receipts: pending.value };
      commit(normalizeProject(next), `Import de ${pending.name}`);
      setPending(null);
    } catch (err) {
      setError(err.message);
    }
  }
  function exportRows() {
    downloadCsv("master-k-rapprochement.csv", reconciliationHeaders, allRows);
    setNotice("CSV du rapprochement de tous les dossiers généré.");
  }
  function report() {
    downloadReport("master-k-bordereau.html", {
      title: `Réception atelier · ${active.dossier}`,
      subtitle: `${active.client} · Exemple indépendant, sans valeur de bon de retour officiel`,
      sections: [
        {
          title: "Matériel demandé, autorisé et reçu",
          headers: [
            "Ligne",
            "Article / série",
            "Demande",
            "Bon enregistré",
            "Autorisé",
            "Reçu",
            "Encore attendu",
            "Points à vérifier",
          ],
          rows: rows.map((l) => [
            l.ligne,
            `${l.article} / ${l.serie || "Série non renseignée"}`,
            l.quantite,
            l.autorisation || "Non renseigné",
            quantity(l.autorisee),
            l.recu,
            quantity(l.attendu),
            l.points_a_verifier || "Aucun écart détecté",
          ]),
        },
        {
          title: "Réceptions enregistrées",
          headers: ["Colis", "Date", "Ligne", "Quantité", "Commentaire"],
          rows: receipts.map((r) => [
            r.colis,
            r.date,
            r.ligne,
            r.quantite,
            r.commentaire,
          ]),
        },
        {
          title: "Périmètre",
          paragraphs: [
            "Données fictives. Ce document rapproche des quantités saisies ; il ne vaut ni autorisation RMA, ni diagnostic, ni accord de garantie.",
          ],
        },
      ],
    });
    setNotice(`Bordereau HTML imprimable de ${active.dossier} généré.`);
  }
  return (
    <main className="masterk-app">
      <header className="masterk-top">
        <strong>ARPEGE MASTER K</strong>
        <span>Étude indépendante · Réception atelier</span>
      </header>
      <div className="masterk-content">
        <div className="masterk-heading">
          <div>
            <h1>Réception des retours atelier</h1>
            <p>
              Enregistrez un boîtier dans le deuxième colis du dossier
              R-2609-14, puis vérifiez ce qui reste attendu.
            </p>
          </div>
          <div className="masterk-actions">
            <button
              disabled={!history.canUndo}
              onClick={() => moveHistory("undo")}
            >
              Annuler
            </button>
            <button
              disabled={!history.canRedo}
              onClick={() => moveHistory("redo")}
            >
              Rétablir
            </button>
          </div>
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        {notice && (
          <p className="masterk-notice" role="status">
            {notice}
          </p>
        )}
        {!history.storageAvailable && (
          <p role="status">
            La sauvegarde locale est indisponible. Exportez le dossier JSON pour
            conserver votre travail.
          </p>
        )}
        {pending && (
          <section
            className="masterk-import"
            aria-label="Vérification du fichier"
          >
            <h2>Vérifier {pending.name}</h2>
            <p>
              {pending.type === "json"
                ? `${pending.value.lines.length} lignes et ${pending.value.receipts.length} réceptions remplaceront le dossier`
                : `${pending.value.length} ${pending.type === "lines" ? "lignes de matériel" : "réceptions"} remplaceront le lot correspondant`}
              . Vous pourrez annuler l’import.
            </p>
            {pending.type === "lines" && project.receipts.length > 0 && (
              <label className="masterk-ack">
                <input
                  type="checkbox"
                  checked={replaceAck}
                  onChange={(e) => setReplaceAck(e.target.checked)}
                />
                <span>
                  Remplacer toutes les demandes et retirer les{" "}
                  {project.receipts.length} réceptions actuelles.
                </span>
              </label>
            )}
            <div className="masterk-actions">
              <button
                className="masterk-primary"
                disabled={
                  pending.type === "lines" &&
                  project.receipts.length > 0 &&
                  !replaceAck
                }
                onClick={confirmImport}
              >
                Confirmer l’import
              </button>
              <button onClick={() => setPending(null)}>
                Conserver les données actuelles
              </button>
            </div>
          </section>
        )}
        <div className="masterk-workspace">
          <aside className="masterk-inbox">
            <h2>Dossiers de retour</h2>
            <label className="masterk-search">
              Rechercher un dossier
              <input
                type="search"
                placeholder="Référence ou client"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="masterk-filter">
              <input
                type="checkbox"
                checked={onlyIssues}
                onChange={(e) => setOnlyIssues(e.target.checked)}
              />
              Avec points à vérifier
            </label>
            <div className="masterk-case-list">
              {visibleCases.map((c) => (
                <button
                  key={c.dossier}
                  className={`masterk-case ${c.dossier === active.dossier ? "selected" : ""}`}
                  onClick={() => chooseCase(c)}
                  aria-pressed={c.dossier === active.dossier}
                >
                  <strong>{c.dossier}</strong>
                  <span>{c.client}</span>
                  <small>
                    {c.rows.length} ligne(s) · {c.received} unité(s) reçue(s)
                  </small>
                  <em>
                    {c.issues
                      ? `${c.issues} ligne(s) à vérifier`
                      : c.complete
                        ? "Réception complète"
                        : `${c.pending} unité(s) encore attendue(s)`}
                  </em>
                </button>
              ))}
              {!visibleCases.length && (
                <p className="masterk-empty">
                  Aucun dossier ne correspond. Modifiez les filtres.
                </p>
              )}
            </div>
          </aside>
          <section className="masterk-document">
            <div className="masterk-doc-heading">
              <div>
                <h2>Dossier {active.dossier}</h2>
                <p>
                  {active.client} <span>· Client fictif</span>
                </p>
              </div>
              <button onClick={report}>Bordereau imprimable</button>
            </div>
            <p className="masterk-hint">
              Les autorisations ci-dessous sont des exemples enregistrés.
              Cliquez sur une ligne pour saisir son colis ou corriger ses
              données.
            </p>
            <div
              className="masterk-scroll"
              role="region"
              aria-label="Rapprochement du matériel, tableau défilant"
              tabIndex="0"
            >
              <table className="masterk-lines">
                <thead>
                  <tr>
                    <th>Article / série</th>
                    <th>Demandé</th>
                    <th>Autorisé</th>
                    <th>Reçu</th>
                    <th>Attendu</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.ligne}
                      className={r.ligne === line.ligne ? "selected" : ""}
                    >
                      <td>
                        <button
                          className="masterk-line-button"
                          onClick={() => chooseLine(r.ligne)}
                          aria-label={`Sélectionner ${r.ligne} ${r.article}`}
                          aria-pressed={r.ligne === line.ligne}
                        >
                          <strong>{r.article}</strong>
                          <span>
                            {r.ligne} · {r.serie || "Série non renseignée"}
                          </span>
                        </button>
                        <small>{r.autorisation || "Sans bon enregistré"}</small>
                      </td>
                      <td>{r.quantite}</td>
                      <td>
                        {r.autorisee === null ? (
                          <span className="masterk-unknown">Inconnu</span>
                        ) : (
                          r.autorisee
                        )}
                      </td>
                      <td>{r.recu}</td>
                      <td>
                        <strong>
                          {r.attendu === null ? "Inconnu" : r.attendu}
                        </strong>
                        {r.excedent > 0 && (
                          <small className="masterk-danger">
                            +{r.excedent} en excédent
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="masterk-line-info">
              <div>
                <strong>
                  {line.ligne} · {line.statut}
                </strong>
                <span>Motif · {line.motif}</span>
              </div>
              <button
                onClick={() => {
                  setMode(mode === "line" ? "receipt" : "line");
                  setEditing(null);
                }}
              >
                {" "}
                {mode === "line" ? "Revenir au colis" : "Corriger cette ligne"}
              </button>
            </div>
            {rows.some((l) => l.issues.length > 0) && (
              <section
                className="masterk-issues"
                aria-label="Points à vérifier"
              >
                <h3>Points à vérifier</h3>
                {rows
                  .filter((l) => l.issues.length)
                  .map((l) => (
                    <p key={l.ligne}>
                      <strong>{l.ligne}</strong> · {l.points_a_verifier}
                    </p>
                  ))}
              </section>
            )}
            <section className="masterk-receipts">
              <h2>Réceptions enregistrées</h2>
              <div
                className="masterk-scroll"
                role="region"
                aria-label="Historique des colis, tableau défilant"
                tabIndex="0"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Colis / date</th>
                      <th>Ligne</th>
                      <th>Quantité</th>
                      <th>Commentaire</th>
                      <th>Correction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((r) => (
                      <tr key={r.reception}>
                        <td>
                          <strong>{r.colis}</strong>
                          <small>{fr(r.date)}</small>
                        </td>
                        <td>{r.ligne}</td>
                        <td>{r.quantite}</td>
                        <td>{r.commentaire || "Aucun commentaire"}</td>
                        <td>
                          <button
                            onClick={() => {
                              setSelectedLine(r.ligne);
                              setEditing(r);
                              setMode("receipt");
                            }}
                          >
                            Modifier {r.reception}
                          </button>
                          <button
                            className="masterk-text-button"
                            onClick={() => {
                              try {
                                commit(
                                  removeReceipt(project, r.reception),
                                  `Réception ${r.reception} retirée. Annulation possible.`,
                                );
                              } catch (err) {
                                setError(err.message);
                              }
                            }}
                          >
                            Retirer {r.reception}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!receipts.length && (
                  <p className="masterk-empty">
                    Aucun colis n’a été enregistré pour ce dossier.
                  </p>
                )}
              </div>
            </section>
          </section>
          <aside className="masterk-inspector">
            {mode === "line" ? (
              <LineForm
                key={`line-${line.ligne}-${epoch}`}
                line={line}
                project={project}
                onSave={commit}
                onCancel={() => setMode("receipt")}
              />
            ) : (
              <ReceiptForm
                key={`receipt-${line.ligne}-${editing?.reception || "new"}-${epoch}`}
                line={line}
                project={project}
                editing={editing}
                onSave={commit}
                onCancel={() => setEditing(null)}
              />
            )}
          </aside>
        </div>
        <section className="masterk-files">
          <div className="masterk-doc-heading">
            <div>
              <h2>Fichiers et rapprochement</h2>
              <p>
                CSV locaux à contrôler avant import. Le JSON conserve demandes,
                réceptions et journal.
              </p>
            </div>
            <button className="masterk-primary" onClick={exportRows}>
              Exporter le rapprochement CSV
            </button>
          </div>
          <div className="masterk-file-columns">
            <div>
              <h3>Demandes de retour</h3>
              <FileImport
                key={`lines-${epoch}`}
                label="Importer les demandes CSV"
                onFile={(f) => ingest(f, "lines")}
              />
              <button
                className="masterk-text-button"
                onClick={() =>
                  downloadCsv(
                    "master-k-demandes-exemple.csv",
                    lineHeaders,
                    seed.lines,
                  )
                }
              >
                Télécharger l’exemple de demandes
              </button>
            </div>
            <div>
              <h3>Réceptions physiques</h3>
              <FileImport
                key={`receipts-${epoch}`}
                label="Importer les réceptions CSV"
                onFile={(f) => ingest(f, "receipts")}
              />
              <button
                className="masterk-text-button"
                onClick={() => {
                  downloadCsv(
                    "master-k-receptions.csv",
                    receiptHeaders,
                    project.receipts,
                  );
                  setNotice("CSV des réceptions actuelles généré.");
                }}
              >
                Exporter les réceptions actuelles
              </button>
            </div>
            <div>
              <h3>Dossier complet</h3>
              <FileImport
                key={`json-${epoch}`}
                label="Importer un dossier JSON"
                accept=".json,application/json"
                onFile={(f) => ingest(f, "json")}
              />
              <button
                className="masterk-text-button"
                onClick={() => {
                  downloadJson("master-k-dossier.json", project);
                  setNotice("Dossier JSON généré.");
                }}
              >
                Sauvegarder le dossier JSON
              </button>
            </div>
          </div>
          <details>
            <summary>Journal des actions et remise à zéro</summary>
            {project.journal.length ? (
              <ol className="masterk-journal">
                {project.journal.map((j, i) => (
                  <li key={i}>
                    <time>{new Date(j.at).toLocaleTimeString("fr-FR")}</time>{" "}
                    {j.text}
                  </li>
                ))}
              </ol>
            ) : (
              <p>Aucune action depuis l’ouverture de cet exemple.</p>
            )}
            <button
              onClick={() => {
                history.reset();
                setSelectedCase("R-2609-14");
                setSelectedLine("L-102");
                setEditing(null);
                setMode("receipt");
                setPending(null);
                setSearch("");
                setOnlyIssues(false);
                setEpoch((n) => n + 1);
                setError("");
                setNotice(
                  "Exemple initial restauré. Cette opération peut être annulée.",
                );
              }}
            >
              Réinitialiser l’exemple
            </button>
          </details>
        </section>
        <DemoFooter />
      </div>
    </main>
  );
}

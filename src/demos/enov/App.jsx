import React, { useEffect, useState } from "react";
import "@fontsource/poppins/latin-600.css";
import {
  DemoFooter,
  ErrorMessage,
  FileImport,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import { useHistory } from "../../shared/state.js";
import {
  downloadCsv,
  downloadJson,
  euro,
  readLocalFile,
} from "../../shared/files.js";
import {
  HEADERS,
  MISSIONS,
  cents,
  editRow,
  exportRows,
  fingerprint,
  importRows,
  restoreState,
  reviewRow,
  rowProblems,
  seedState,
  similarRows,
  stateOf,
} from "./model.js";
import "./styles.css";

const stateNames = {
  pending: "À vérifier",
  approved: "Validée",
  excluded: "Exclue",
};
const displayDate = (date) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split("-").reverse().join("/") : date;
function Icon({ type }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d={
          type === "download"
            ? "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"
            : type === "search"
              ? "m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0"
              : "M8 5 2 11l6 6M2 11h12a7 7 0 0 1 7 7"
        }
      />
    </svg>
  );
}
export default function EnovApp() {
  useDocumentTitle("Enov · Contrôle des frais terrain");
  const history = useHistory(seedState);
  const { value: state } = history;
  const [selectedId, setSelectedId] = useState("R-108");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const row =
    state.rows.find((item) => item.id === selectedId) || state.rows[0];
  const rowFingerprint = fingerprint(row, state.rows);
  const status = stateOf(row, state.rows);
  const peers = similarRows(row, state.rows);
  const counts = state.rows.reduce(
    (all, item) => ({
      ...all,
      [stateOf(item, state.rows)]: all[stateOf(item, state.rows)] + 1,
    }),
    { pending: 0, approved: 0, excluded: 0 },
  );
  const visible = state.rows.filter(
    (item) =>
      (filter === "all" || stateOf(item, state.rows) === filter) &&
      `${item.id} ${item.mission}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  const approvedTotal = state.rows
    .filter((item) => stateOf(item, state.rows) === "approved")
    .reduce((sum, item) => sum + cents(item.amount), 0);

  useEffect(() => {
    const review =
      row.review?.fingerprint === rowFingerprint ? row.review : null;
    setChoice(review?.decision || "");
    setReason(review?.reason || "");
    setChecked(review?.checked || false);
    setError("");
  }, [row.id, rowFingerprint, row.review]);

  function change(field, value) {
    try {
      history.set(editRow(state, row.id, field, value));
      setNotice(`${row.id} modifiée. La validation doit être renouvelée.`);
    } catch (err) {
      setError(err.message);
    }
  }
  function approve(event) {
    event.preventDefault();
    try {
      history.set(
        reviewRow(state, row.id, {
          decision: peers.length ? choice : "keep",
          reason,
          checked,
        }),
      );
      setError("");
      setNotice(
        `${row.id} ${choice === "exclude" ? "exclue du lot avec son motif." : "validée pour le lot."}`,
      );
    } catch (err) {
      setError(err.message);
    }
  }
  async function importFile(file, json = false) {
    const text = await readLocalFile(file);
    const next = json ? restoreState(text) : importRows(text);
    history.set(next);
    setSelectedId(next.rows[0].id);
    setFilter("all");
    setQuery("");
    setNotice(
      `${next.rows.length} lignes ${json ? "restaurées" : "importées"}. Vous pouvez annuler pour retrouver le lot précédent.`,
    );
  }
  function exportLot(wanted) {
    const rows = exportRows(state, wanted);
    if (!rows.length) {
      setNotice("Aucune ligne à exporter dans cette catégorie.");
      return;
    }
    downloadCsv(
      `enov-frais-${wanted === "approved" ? "valides" : wanted === "pending" ? "exceptions" : "exclus"}.csv`,
      [...HEADERS, "decision", "motif", "controle"],
      rows,
    );
    setNotice(
      `${rows.length} lignes exportées. Le fichier correspond à l’état actuel du lot.`,
    );
  }
  function sampleFile() {
    downloadCsv(
      "enov-frais-exemple.csv",
      HEADERS,
      seedState().rows.map((item) => ({
        reference: item.id,
        mission: item.mission,
        date: item.date,
        montant: item.amount,
        justificatif: item.receipt,
      })),
    );
    setNotice(
      "Fichier exemple téléchargé. Son import remet toutes les lignes à vérifier.",
    );
  }
  return (
    <div className="enov">
      <div className="enov-brandbar">
        <span className="enov-wordmark">
          Enov<span>.</span>
        </span>
        <span className="enov-independent">Étude indépendante</span>
        <span className="enov-local">Outil local · Sans compte</span>
      </div>
      <main className="enov-main">
        <header className="enov-heading">
          <div>
            <p className="enov-eyebrow">COLLECTE / PRÉPARATION DU LOT</p>
            <h1>Contrôle des frais terrain</h1>
            <p className="enov-intro">
              Ouvrez un doublon, vérifiez la dépense, puis préparez le lot
              validé.
            </p>
            <p className="enov-context">
              Exemple indépendant · Données fictives
            </p>
          </div>
          <div className="enov-primary-tools">
            <FileImport onFile={importFile} />
            <button type="button" onClick={sampleFile}>
              <Icon type="download" />
              Fichier exemple
            </button>
            <button
              type="button"
              disabled={!history.canUndo}
              onClick={() => {
                history.undo();
                setNotice("Dernière action annulée.");
              }}
            >
              <Icon />
              Annuler
            </button>
          </div>
        </header>
        <div className="enov-workspace">
          <section className="enov-ledger" aria-label="Dépenses du lot">
            <div className="enov-list-tools">
              <div className="enov-filters" aria-label="Filtrer le lot">
                {[
                  ["all", "Toutes", state.rows.length],
                  ["pending", "À vérifier", counts.pending],
                  ["approved", "Validées", counts.approved],
                ].map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                    <span>{count}</span>
                  </button>
                ))}
              </div>
              <label className="enov-search">
                <Icon type="search" />
                <input
                  aria-label="Rechercher une référence ou une mission"
                  placeholder="Référence ou mission"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            <p className="enov-table-hint">
              Choisissez une ligne pour ouvrir son contrôle. Le tableau défile
              horizontalement sur petit écran.
            </p>
            <div
              className="enov-table-scroll"
              tabIndex="0"
              role="region"
              aria-label="Tableau des dépenses, défilement horizontal disponible"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="enov-sr">Sélection</span>
                    </th>
                    <th scope="col">Référence</th>
                    <th scope="col">Mission</th>
                    <th scope="col">Date</th>
                    <th scope="col" className="enov-money">
                      Montant
                    </th>
                    <th scope="col">Contrôle</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => {
                    const itemStatus = stateOf(item, state.rows);
                    const isDuplicate =
                      similarRows(item, state.rows).length > 0;
                    return (
                      <tr
                        key={item.id}
                        className={row.id === item.id ? "enov-selected" : ""}
                      >
                        <td>
                          <input
                            type="radio"
                            name="selected-expense"
                            aria-label={`Ouvrir ${item.id}`}
                            checked={row.id === item.id}
                            onChange={() => setSelectedId(item.id)}
                          />
                        </td>
                        <th scope="row">
                          <button
                            type="button"
                            className="enov-row-link"
                            onClick={() => setSelectedId(item.id)}
                          >
                            {item.id}
                          </button>
                        </th>
                        <td>{item.mission}</td>
                        <td>{displayDate(item.date)}</td>
                        <td className="enov-money">
                          {cents(item.amount) === null
                            ? item.amount || "À saisir"
                            : euro(cents(item.amount))}
                        </td>
                        <td>
                          <span
                            className={`enov-status enov-status-${itemStatus}`}
                          >
                            <span aria-hidden="true">
                              {itemStatus === "approved"
                                ? "✓"
                                : itemStatus === "excluded"
                                  ? "−"
                                  : "•"}
                            </span>
                            {itemStatus === "pending" && isDuplicate
                              ? "Doublon possible"
                              : itemStatus === "pending" && !item.receipt.trim()
                                ? "Justificatif absent"
                                : stateNames[itemStatus]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!visible.length && (
                <div className="enov-empty">
                  Aucune ligne ne correspond à ce filtre.
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("all");
                      setQuery("");
                    }}
                  >
                    Voir toutes les dépenses
                  </button>
                </div>
              )}
            </div>
            <div className="enov-ledger-note">
              <span className="enov-note-mark">i</span>
              <p>
                Une ressemblance signale un contrôle à faire. Aucune ligne n’est
                supprimée automatiquement.
              </p>
            </div>
            <details className="enov-method">
              <summary>Règles de cet exemple et format d’import</summary>
              <p>
                Un doublon possible partage la mission, la date et le montant.
                Un justificatif désigne ici une référence saisie, sans document
                analysé. Chaque validation correspond à votre déclaration de
                contrôle.
              </p>
              <p>
                Colonnes CSV requises : <code>{HEADERS.join(" ; ")}</code>.
                Missions d’exemple : {MISSIONS.join(", ")}. Dates AAAA-MM-JJ,
                montants positifs. 500 lignes maximum. Un import remplace le lot
                seulement après vérification de tout le fichier.
              </p>
            </details>
          </section>
          <section
            className="enov-inspector"
            aria-labelledby="enov-detail-title"
          >
            <div className="enov-detail-top">
              <span className="enov-eyebrow">LIGNE SÉLECTIONNÉE</span>
              <span className={`enov-status enov-status-${status}`}>
                {stateNames[status]}
              </span>
            </div>
            <h2 id="enov-detail-title">
              {row.id}
              <span>{row.mission}</span>
            </h2>
            {peers.length > 0 && (
              <div className="enov-duplicate">
                <h3>
                  {peers.length === 1
                    ? "Deux déclarations proches"
                    : `${peers.length + 1} déclarations proches`}
                </h3>
                <p>
                  Même mission, même date et même montant. Comparez les pièces
                  avant de décider.
                </p>
                <div className="enov-compare">
                  {[row, ...peers].map((item) => (
                    <div key={item.id}>
                      <strong>{item.id}</strong>
                      <span>{item.receipt || "Référence absente"}</span>
                      <span>{euro(cents(item.amount))}</span>
                      <small>{stateNames[stateOf(item, state.rows)]}</small>
                      {item.id !== row.id && (
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                        >
                          Examiner cette ligne
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <form onSubmit={approve} noValidate>
              <h3>Détails de la ligne sélectionnée</h3>
              <div className="enov-fields">
                <label>
                  Montant déclaré
                  <span className="enov-amount-input">
                    <input
                      inputMode="decimal"
                      value={row.amount}
                      maxLength="12"
                      onChange={(event) => change("amount", event.target.value)}
                    />{" "}
                    <span>€</span>
                  </span>
                </label>
                <label>
                  Référence du justificatif
                  <input
                    value={row.receipt}
                    placeholder="Ex. JUST-8100"
                    maxLength="140"
                    onChange={(event) => change("receipt", event.target.value)}
                  />
                </label>
              </div>
              <details className="enov-edit-context">
                <summary>Modifier la mission ou la date</summary>
                <label>
                  Mission
                  <select
                    value={row.mission}
                    onChange={(event) => change("mission", event.target.value)}
                  >
                    {MISSIONS.map((mission) => (
                      <option key={mission}>{mission}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Date de la dépense
                  <input
                    type="date"
                    value={row.date}
                    onChange={(event) => change("date", event.target.value)}
                  />
                </label>
              </details>
              {rowProblems(row).length > 0 && (
                <ul className="enov-issues">
                  {rowProblems(row).map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
              <label className="enov-reason">
                Motif de la décision
                {peers.length ? " (obligatoire)" : " (facultatif)"}
                <textarea
                  value={reason}
                  maxLength="500"
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    peers.length
                      ? "Ex. Même dépense déclarée deux fois, pièce vérifiée."
                      : "Précision utile au suivi du lot"
                  }
                  rows="2"
                />
              </label>
              {peers.length > 0 && (
                <fieldset>
                  <legend>Votre décision pour {row.id}</legend>
                  <label>
                    <input
                      type="radio"
                      name="duplicate-decision"
                      checked={choice === "keep"}
                      onChange={() => setChoice("keep")}
                    />
                    Conserver cette ligne
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="duplicate-decision"
                      checked={choice === "exclude"}
                      onChange={() => setChoice("exclude")}
                    />
                    Exclure cette ligne (doublon)
                  </label>
                </fieldset>
              )}
              {choice !== "exclude" && (
                <label className="enov-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => setChecked(event.target.checked)}
                  />
                  <span>
                    Je déclare avoir contrôlé le justificatif dans ce scénario
                    fictif.
                  </span>
                </label>
              )}
              <ErrorMessage>{error}</ErrorMessage>
              <button type="submit" className="enov-validate">
                {choice === "exclude" && peers.length
                  ? "Enregistrer la décision"
                  : "Valider cette ligne"}
                <span aria-hidden="true">→</span>
              </button>
              <p className="enov-fine">
                Toute modification d’une dépense ou d’une déclaration proche
                rend la décision précédente à vérifier.
              </p>
            </form>
          </section>
        </div>
        <section className="enov-export" aria-label="Préparer les fichiers">
          <div>
            <h2>
              {counts.approved} validée{counts.approved !== 1 ? "s" : ""}
              <span>/ {counts.pending} à vérifier</span>
              {counts.excluded > 0 && (
                <small>
                  · {counts.excluded} exclue{counts.excluded !== 1 ? "s" : ""}
                </small>
              )}
            </h2>
            <p>
              {euro(approvedTotal)} dans le lot validé. Les exceptions restent
              dans un fichier séparé.
            </p>
          </div>
          <div className="enov-export-buttons">
            <button
              className="enov-primary"
              type="button"
              disabled={!counts.approved}
              onClick={() => exportLot("approved")}
            >
              <Icon type="download" />
              Exporter les lignes validées
            </button>
            <button
              type="button"
              disabled={!counts.pending}
              onClick={() => exportLot("pending")}
            >
              Exporter les exceptions
            </button>
          </div>
        </section>
        <div className="enov-feedback" role="status" aria-live="polite">
          {notice}
        </div>
        <details className="enov-dossier">
          <summary>Dossier de travail et journal des décisions</summary>
          <p>
            Le lot reste en mémoire pendant cette visite. Enregistrez un dossier
            JSON pour le reprendre après fermeture de l’onglet. Aucun fichier
            n’est envoyé à Enov.
          </p>
          <div className="enov-secondary-tools">
            <button
              type="button"
              onClick={() => {
                downloadJson("enov-dossier-frais.json", state);
                setNotice(
                  "Dossier JSON enregistré avec les décisions et le journal actuels.",
                );
              }}
            >
              Enregistrer le dossier JSON
            </button>
            <FileImport
              label="Reprendre un dossier JSON"
              accept=".json,application/json"
              onFile={(file) => importFile(file, true)}
            />
            <button
              type="button"
              disabled={!history.canRedo}
              onClick={() => {
                history.redo();
                setNotice("Action rétablie.");
              }}
            >
              Rétablir l’action
            </button>
            <button
              type="button"
              onClick={() => {
                history.reset();
                setSelectedId("R-108");
                setFilter("all");
                setQuery("");
                setNotice(
                  "Exemple initial rétabli. Cette action peut être annulée.",
                );
              }}
            >
              Revenir à l’exemple
            </button>
            <button
              type="button"
              disabled={!counts.excluded}
              onClick={() => exportLot("excluded")}
            >
              Exporter les exclusions
            </button>
          </div>
          <ol className="enov-journal">
            {state.journal
              .slice()
              .reverse()
              .map((entry) => (
                <li key={entry.step}>
                  <span>#{entry.step}</span>
                  <strong>{entry.id}</strong>
                  {entry.action}
                </li>
              ))}
          </ol>
        </details>
      </main>
      <DemoFooter />
    </div>
  );
}

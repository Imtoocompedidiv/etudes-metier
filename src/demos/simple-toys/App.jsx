import React, { useEffect, useState } from "react";
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
  downloadReport,
  readLocalFile,
  euro,
} from "../../shared/files.js";
import {
  seed,
  summary,
  inspect,
  effectiveCode,
  linkCode,
  unlinkCode,
  saveReceipt,
  decide,
  importData,
  preparation,
  exceptions,
  restore,
  REGISTRY_HEADERS,
  RETURN_HEADERS,
  MODELS,
  CONDITIONS,
  DIRECTIONS,
} from "./model.js";
import "./styles.css";

function Toy({ model }) {
  return (
    <svg className="simple-toy" viewBox="0 0 120 96" aria-hidden="true">
      {model === "Bateau" ? (
        <>
          <path d="M12 57h96l-17 25H31z" fill="#24405d" />
          <path d="M28 49h67v9H22z" fill="#82a092" />
          <path d="M62 13v44" stroke="#24405d" strokeWidth="5" />
          <path d="M68 15v31h30z" fill="#b9cbbb" />
        </>
      ) : model === "Anneaux" ? (
        <>
          <rect x="53" y="15" width="14" height="66" rx="7" fill="#24405d" />
          <rect x="20" y="65" width="80" height="17" rx="8" fill="#24405d" />
          <rect x="29" y="46" width="62" height="17" rx="8" fill="#c7b78a" />
          <rect x="39" y="27" width="42" height="17" rx="8" fill="#82a092" />
          <circle cx="60" cy="17" r="10" fill="#a1b6a3" />
        </>
      ) : model === "Autre marque" ? (
        <>
          <circle cx="39" cy="23" r="13" fill="#c4ae93" />
          <circle cx="81" cy="23" r="13" fill="#c4ae93" />
          <ellipse cx="60" cy="62" rx="27" ry="29" fill="#c4ae93" />
          <circle cx="60" cy="36" r="27" fill="#c4ae93" />
          <circle cx="49" cy="32" r="3" fill="#24405d" />
          <circle cx="71" cy="32" r="3" fill="#24405d" />
          <ellipse cx="60" cy="44" rx="8" ry="6" fill="#e9d9c0" />
        </>
      ) : (
        <>
          <path
            d={
              model === "Camion"
                ? "M10 30h65v20h24l13 17v12H10z"
                : "M12 54l17-6 13-25h32l16 25 18 8v23H12z"
            }
            fill="#82a092"
          />
          {model === "Camion" ? (
            <path d="M82 35h13l11 19H82z" fill="#24405d" />
          ) : (
            <path d="M47 30h21l10 20H36z" fill="#f8f4e9" />
          )}
          <circle cx="32" cy="77" r="15" fill="#24405d" />
          <circle cx="88" cy="77" r="15" fill="#24405d" />
          <circle cx="32" cy="77" r="5" fill="#f8f4e9" />
          <circle cx="88" cy="77" r="5" fill="#f8f4e9" />
        </>
      )}
    </svg>
  );
}
function Receipt({ row, onSave, onDirty }) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(
      [
        "beneficiaire",
        "email",
        "received",
        "date",
        "observed",
        "condition",
        "direction",
        "note",
      ].map((k) => [k, row[k]]),
    ),
  );
  const changed = Object.keys(draft).some((k) => draft[k] !== row[k]);
  useEffect(() => onDirty(changed), [changed, onDirty]);
  const set = (k, v) => setDraft((x) => ({ ...x, [k]: v }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <h3>Personne qui retourne le jouet</h3>
      <div className="simple-two">
        <label>
          Nom du bénéficiaire
          <input
            value={draft.beneficiaire}
            onChange={(e) => set("beneficiaire", e.target.value)}
            maxLength={250}
          />
        </label>
        <label>
          Email du bénéficiaire
          <input
            type="text"
            inputMode="email"
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
            maxLength={250}
          />
        </label>
      </div>
      <h3 className="simple-divider">Réception physique</h3>
      <label className="simple-check">
        <input
          type="checkbox"
          checked={draft.received}
          onChange={(e) => set("received", e.target.checked)}
        />
        J’ai le jouet en main
      </label>
      <div className="simple-two">
        <label>
          Date de réception
          <input
            type="date"
            value={draft.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </label>
        <label>
          Modèle observé
          <select
            value={draft.observed}
            onChange={(e) => set("observed", e.target.value)}
          >
            <option value="">À constater</option>
            {MODELS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          État du jouet
          <select
            value={draft.condition}
            onChange={(e) => set("condition", e.target.value)}
          >
            <option value="">À constater</option>
            {CONDITIONS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Orientation proposée
          <select
            value={draft.direction}
            onChange={(e) => set("direction", e.target.value)}
          >
            <option value="">À examiner</option>
            {DIRECTIONS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="simple-help">
        Un jouet Simple. abîmé peut revenir. L’orientation reste à examiner par
        l’atelier.
      </p>
      <label>
        Note de réception
        <textarea
          value={draft.note}
          onChange={(e) => set("note", e.target.value)}
          maxLength={250}
          rows={2}
        />
      </label>
      <button className="simple-secondary" disabled={!changed}>
        Enregistrer les constats
      </button>
      {changed && (
        <span className="simple-unsaved" role="status">
          Modifications à enregistrer
        </span>
      )}
    </form>
  );
}
export default function SimpleApp() {
  useDocumentTitle("Simple. · Réception et préparation des consignes");
  const history = useHistory(seed),
    state = history.value,
    report = summary(state);
  const [selected, setSelected] = useState("R-01"),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [mapCode, setMapCode] = useState(""),
    [mapNote, setMapNote] = useState(""),
    [decision, setDecision] = useState(""),
    [reason, setReason] = useState("");
  const [receiptDirty, setReceiptDirty] = useState(false);
  const row =
      state.requests.find((x) => x.demande === selected) || state.requests[0],
    item = inspect(state, row);
  function run(fn, message) {
    try {
      history.set(fn());
      setError("");
      setDecision("");
      setReason("");
      setNotice(message);
    } catch (e) {
      setError(e.message);
    }
  }
  function select(id) {
    setSelected(id);
    setMapCode("");
    setMapNote("");
    setDecision("");
    setReason("");
    setError("");
  }
  async function receive(file, side) {
    const next = importData(state, side, await readLocalFile(file), file.name);
    history.set(next);
    select(next.requests[0].demande);
    setNotice(
      "Fichier importé. Vérifiez les constats avant de confirmer une préparation.",
    );
  }
  const visible = report.rows.filter(
    (x) =>
      filter === "all" ||
      (filter === "pending" && !["ready", "excluded"].includes(x.status)) ||
      filter === x.status,
  );
  function exportReady() {
    const rows = preparation(state);
    if (!rows.length) return;
    downloadCsv(
      "simple-preparation-consignes.csv",
      [
        "demande",
        "code",
        "modele",
        "beneficiaire",
        "email",
        "reception",
        "consigne_euros",
        "orientation",
        "motif",
        "statut",
      ],
      rows,
    );
    setNotice(
      rows.length +
        " consigne" +
        (rows.length > 1 ? "s" : "") +
        " exportée" +
        (rows.length > 1 ? "s" : "") +
        " pour préparation. Aucun bon créé.",
    );
  }
  function exportReception() {
    downloadReport("simple-reception.html", {
      title: "Simple. · Dossier de réception fictif",
      subtitle:
        "Préparation indicative, aucun bon d’achat émis. Constats et orientations déclarés par l’utilisateur.",
      sections: [
        {
          title: "Consignes à préparer",
          headers: [
            "Demande",
            "Code",
            "Bénéficiaire",
            "Réception",
            "Montant indicatif",
          ],
          rows: preparation(state).map((x) => [
            x.demande,
            x.code,
            x.beneficiaire,
            x.reception,
            x.consigne_euros + " €",
          ]),
        },
        {
          title: "Exceptions et exclusions",
          headers: ["Demande", "Code", "Statut", "Points à vérifier ou motif"],
          rows: exceptions(state).map((x) => [
            x.demande,
            x.code_retenu,
            x.statut,
            x.points,
          ]),
        },
        {
          title: "Journal du dossier",
          paragraphs: state.journal.map(
            (x) => "#" + x.n + " · " + x.description,
          ),
        },
      ],
    });
    setNotice("Dossier de réception HTML enregistré.");
  }
  return (
    <div className="simple-demo">
      <header className="simple-top">
        <span className="simple-wordmark">Simple.</span>
        <span>Étude indépendante</span>
        <span className="simple-context">Lot fictif · Sans compte</span>
      </header>
      <main>
        <div className="simple-heading">
          <h1>
            Les jouets revenus,{" "}
            <br />
            les consignes à préparer
          </h1>
          <p>
            Rapprochez le code de la voiture, constatez sa réception,{" "}
            <br />
            puis préparez la consigne de la personne qui la retourne.
          </p>
        </div>
        <div className="simple-workbench">
          <section className="simple-ledger" aria-label="Demandes du lot">
            <div className="simple-toolbar">
              <FileImport
                label="Importer un lot"
                onFile={(f) => receive(f, "requests")}
              />
              <div className="simple-filters">
                {[
                  ["all", "Tous", report.rows.length],
                  ["pending", "À vérifier", report.pending.length],
                  ["ready", "Prêts", report.ready.length],
                  ["excluded", "Écartés", report.excluded.length],
                ].map(([k, t, n]) => (
                  <button
                    key={k}
                    aria-pressed={filter === k}
                    onClick={() => setFilter(k)}
                  >
                    {t} <span>{n}</span>
                  </button>
                ))}
              </div>
            </div>
            <div
              className="simple-table-wrap"
              role="region"
              aria-label="Table de réception, défilable"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Demande</th>
                    <th>Code reçu</th>
                    <th>Modèle</th>
                    <th>Bénéficiaire</th>
                    <th>Contrôle</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((x) => (
                    <tr
                      key={x.row.demande}
                      className={
                        x.row.demande === row.demande ? "selected" : ""
                      }
                    >
                      <th scope="row">
                        <button
                          onClick={() => select(x.row.demande)}
                          aria-label={"Examiner " + x.row.demande}
                        >
                          {x.row.demande}
                          <Toy model={x.row.modele_declare} />
                        </button>
                      </th>
                      <td>
                        <code>{x.row.code_recu}</code>
                        {x.row.link && (
                          <span className="simple-mapped">Rapproché</span>
                        )}
                      </td>
                      <td>{x.row.modele_declare}</td>
                      <td>{x.row.beneficiaire || "À compléter"}</td>
                      <td>
                        <span className={"simple-badge " + x.status}>
                          {x.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length && (
                <p className="simple-empty">Aucune demande dans ce filtre.</p>
              )}
            </div>
            <div className="simple-ledger-foot">
              <span>{state.files.requests}</span>
              <button
                disabled={!history.canUndo}
                onClick={() => {
                  history.undo();
                  setError("");
                  setNotice("Dernière action annulée.");
                }}
              >
                Annuler
              </button>
              <button
                disabled={!history.canRedo}
                onClick={() => {
                  history.redo();
                  setError("");
                  setNotice("Action rétablie.");
                }}
              >
                Rétablir
              </button>
            </div>
            <details className="simple-register">
              <summary>Registre des codes et fichiers d’exemple</summary>
              <p>
                Le code reçu reste conservé. Le rapprochement se fait avec un
                code du registre après vérification humaine.
              </p>
              <div className="simple-file-buttons">
                <FileImport
                  label="Importer le registre"
                  onFile={(f) => receive(f, "registry")}
                />
                <button
                  onClick={() =>
                    downloadCsv(
                      "simple-codes-exemple.csv",
                      REGISTRY_HEADERS,
                      seed().registry.map((x) => ({
                        code: x.code,
                        modele: x.modele,
                        acheteur: x.acheteur,
                        consigne_euros: (x.cents / 100).toFixed(2),
                        deja_traitee: x.processed ? "oui" : "non",
                      })),
                    )
                  }
                >
                  Exemple registre CSV
                </button>
                <button
                  onClick={() =>
                    downloadCsv(
                      "simple-retours-exemple.csv",
                      RETURN_HEADERS,
                      seed().requests,
                    )
                  }
                >
                  Exemple retours CSV
                </button>
              </div>
              <p className="simple-help">
                Registre attendu : code, modele, acheteur, consigne_euros,
                deja_traitee (oui/non). Demandes : demande, code_recu,
                modele_declare, beneficiaire, email.
              </p>
              <ul>
                {state.registry.map((r) => (
                  <li key={r.code}>
                    <code>{r.code}</code>
                    <span>
                      {r.modele} · {r.acheteur}
                    </span>
                    <strong>
                      {r.processed ? "Déjà traitée" : euro(r.cents)}
                    </strong>
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <section className="simple-detail" aria-labelledby="simple-title">
            <div className="simple-detail-heading">
              <span>Demande {row.demande}</span>
              <span className={"simple-badge " + item.status}>
                {item.label}
              </span>
            </div>
            <h2 id="simple-title">
              {row.modele_declare} ·{" "}
              {row.beneficiaire.split(" ")[0] || "Retour"}
            </h2>
            {error && (
              <div className="simple-error-position">
                <ErrorMessage>{error}</ErrorMessage>
              </div>
            )}
            <div className="simple-code-area">
              <div className="simple-toy-tile">
                <Toy model={row.modele_declare} />
              </div>
              <div>
                <span className="simple-label">Code reçu</span>
                <code className="simple-code">{row.code_recu}</code>
                {row.link && (
                  <>
                    <span className="simple-label">
                      Code retenu après rapprochement
                    </span>
                    <code className="simple-code">{effectiveCode(row)}</code>
                    <p className="simple-help">{row.link.note}</p>
                  </>
                )}
                {item.record && (
                  <p className="simple-help">
                    Acheteur enregistré
                    <br />
                    <strong>{item.record.acheteur}</strong>
                  </p>
                )}
              </div>
            </div>
            <details className="simple-link" open={!item.record}>
              <summary>Rapprocher le code après vérification</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () => linkCode(state, row.demande, mapCode, mapNote),
                    "Code rapproché. Vérifiez les constats avant préparation.",
                  );
                }}
              >
                <label>
                  Code enregistré
                  <select
                    value={mapCode}
                    onChange={(e) => setMapCode(e.target.value)}
                  >
                    <option value="">Choisir le code vérifié</option>
                    {state.registry.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.code} · {r.modele}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Motif du rapprochement
                  <input
                    value={mapNote}
                    onChange={(e) => setMapNote(e.target.value)}
                    maxLength={250}
                    placeholder="Ce qui permet de confirmer le code"
                  />
                </label>
                <div className="simple-actions">
                  <button>Enregistrer le rapprochement</button>
                  {row.link && (
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          () => unlinkCode(state, row.demande),
                          "Code reçu rétabli.",
                        )
                      }
                    >
                      Retirer le lien
                    </button>
                  )}
                </div>
              </form>
            </details>
            <div className="simple-beneficiary">
              <span>Personne qui retourne le jouet</span>
              <strong>{row.beneficiaire || "À compléter"}</strong>
              <span>{row.email || "Email à compléter"}</span>
            </div>
            <details
              className="simple-receipt-fold"
              key={row.demande + "-receipt"}
              open={Boolean(
                item.record &&
                (!row.received ||
                  !row.date ||
                  !row.observed ||
                  !row.condition ||
                  !row.direction),
              )}
            >
              <summary>
                Réception et bénéficiaire{" "}
                <span>
                  {row.received ? "Réception déclarée" : "À constater"}
                </span>
              </summary>
              <Receipt
                key={JSON.stringify(row)}
                row={row}
                onDirty={setReceiptDirty}
                onSave={(v) =>
                  run(
                    () => saveReceipt(state, row.demande, v),
                    "Constats enregistrés. La préparation reste à confirmer.",
                  )
                }
              />
            </details>
            <details
              className="simple-decision"
              key={row.demande + "-decision"}
              open={
                item.issues.length === 0 &&
                item.status !== "ready" &&
                item.status !== "excluded"
              }
            >
              <summary>
                Décision pour cette demande{" "}
                <span>{item.review ? "Enregistrée" : "À prendre"}</span>
              </summary>
              {item.stale && (
                <p className="simple-attention">
                  Les données ont changé. La décision précédente doit être
                  renouvelée.
                </p>
              )}
              {item.issues.length > 0 && (
                <ul className="simple-issues">
                  {item.issues.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
              {item.review && (
                <p className="simple-reviewed">
                  <strong>
                    {item.review.kind === "prepare"
                      ? "Préparation confirmée"
                      : "Écarté du lot"}
                  </strong>
                  <br />
                  {item.review.note}
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () => decide(state, row.demande, decision, reason),
                    "Décision enregistrée pour " + row.demande + ".",
                  );
                }}
              >
                <label>
                  Décision
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                  >
                    <option value="">Choisir une décision</option>
                    <option value="prepare">Confirmer la préparation</option>
                    <option value="exclude">
                      Écarter cette demande du lot
                    </option>
                  </select>
                </label>
                <label>
                  Motif de la décision
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={250}
                    rows={2}
                    placeholder="Vérification effectuée ou raison de l’écart"
                  />
                </label>
                {receiptDirty && (
                  <p className="simple-attention">
                    Enregistrez les constats modifiés avant de décider ou
                    d’exporter la préparation.
                  </p>
                )}
                <button className="simple-primary" disabled={receiptDirty}>
                  Enregistrer la décision
                </button>
              </form>
            </details>
          </section>
        </div>
        <section
          className="simple-output"
          aria-label="Préparation des consignes"
        >
          <div>
            <strong>
              {report.ready.length} jouet{report.ready.length > 1 ? "s" : ""}{" "}
              prêt{report.ready.length > 1 ? "s" : ""}
            </strong>
            <span>{euro(report.cents)} à préparer</span>
            <small>Seules les demandes confirmées figurent dans ce CSV.</small>
          </div>
          <button
            disabled={!report.ready.length || receiptDirty}
            onClick={exportReady}
          >
            Exporter la préparation CSV
          </button>
          <p>
            Aucun bon d’achat réel
            <br />
            n’est émis.
          </p>
        </section>
        <p className="simple-notice" role="status">
          {notice}
        </p>
        <details className="simple-dossier">
          <summary>Exceptions, dossier de réception et reprise</summary>
          <p>
            Les décisions restent en mémoire pendant cette visite. Enregistrez
            le JSON pour reprendre le lot.
          </p>
          <div className="simple-file-buttons">
            <button
              onClick={() => {
                downloadCsv(
                  "simple-exceptions.csv",
                  [
                    "demande",
                    "code_recu",
                    "code_retenu",
                    "beneficiaire",
                    "statut",
                    "points",
                  ],
                  exceptions(state),
                );
                setNotice("Exceptions et exclusions exportées.");
              }}
            >
              Exporter les exceptions CSV
            </button>
            <button onClick={exportReception}>Dossier de réception HTML</button>
            <button
              onClick={() => {
                downloadJson("simple-dossier.json", state);
                setNotice("Dossier JSON enregistré.");
              }}
            >
              Enregistrer le dossier JSON
            </button>
            <FileImport
              label="Reprendre un dossier JSON"
              accept=".json"
              onFile={async (f) => {
                const next = restore(await readLocalFile(f));
                history.set(next);
                select(next.requests[0].demande);
                setNotice("Dossier restauré avec ses décisions.");
              }}
            />
            <button
              onClick={() => {
                history.reset();
                select("R-01");
                setFilter("all");
                setNotice("Exemple rétabli.");
              }}
            >
              Revenir à l’exemple
            </button>
          </div>
          <ol className="simple-journal">
            {[...state.journal].reverse().map((x) => (
              <li key={x.n}>
                <span>#{x.n}</span>
                {x.description}
              </li>
            ))}
          </ol>
        </details>
      </main>
      <DemoFooter />
    </div>
  );
}

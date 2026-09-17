import { useState } from "react";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import { useHistory } from "../../shared/state.js";
import { FileImport, DemoFooter, useDocumentTitle } from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadCsv,
  downloadJson,
  downloadText,
  downloadReport,
} from "../../shared/files.js";
import {
  seed,
  analyze,
  analyzeLine,
  allocate,
  updateLine,
  updateLot,
  decide,
  review,
  restore,
  importCsv,
  metersToCm,
  m,
  LINE_HEADERS,
  LOT_HEADERS,
  exampleLines,
  exampleLots,
  allocationRows,
  questions,
  report,
  lineBasis,
} from "./model.js";
import "./styles.css";

const data = (event) => {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget));
};
function LineTable({ rows, selected, select }) {
  return (
    <section className="ec-panel ec-command">
      <h2>
        Commande{" "}
        {new Set(rows.map((r) => r.line.order)).size === 1
          ? rows[0].line.order
          : "· plusieurs dossiers"}
      </h2>
      <div
        className="ec-scroll"
        role="region"
        aria-label="Lignes de commande, tableau défilant"
        tabIndex="0"
      >
        <table>
          <thead>
            <tr>
              <th>Ligne</th>
              <th>Modèle</th>
              <th>Quantité</th>
              <th>Besoin</th>
              <th>Affecté</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.line.id}
                className={selected === r.line.id ? "selected" : ""}
              >
                <td>
                  <button
                    className="ec-textbutton"
                    onClick={() => select(r.line.id)}
                    aria-pressed={selected === r.line.id}
                  >
                    {r.line.id}
                  </button>
                </td>
                <td>
                  {r.line.model}
                  <small>
                    {r.line.order}
                    {r.reviewed ? " · revue déclarée" : ""}
                  </small>
                </td>
                <td>{r.line.quantity}</td>
                <td>{m(r.need)}</td>
                <td>
                  {m(r.assigned)}
                  {r.missing > 0 && <small>Manque {m(r.missing)}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Lots({ state, run }) {
  const [editing, setEditing] = useState(null);
  return (
    <section className="ec-panel ec-lots">
      <h2>Lots de tissu</h2>
      {state.lots.map((lot, index) => {
        const assigned = state.allocations.filter((a) => a.lotId === lot.id),
          used = assigned.reduce((n, a) => n + a.cm, 0),
          left = lot.totalCm - used;
        return (
          <div className="ec-lot" key={lot.id}>
            <div className="ec-lot-row">
              <div className="ec-lot-name">
                <strong>Lot {lot.id}</strong>
                <span>{lot.ref}</span>
                <span>Teinte {lot.dye}</span>
                <span>
                  {m(lot.totalCm)}{" "}
                  {lot.received ? "reçus déclarés" : "annoncés"}
                </span>
                <button
                  className="ec-textbutton"
                  onClick={() => setEditing(editing === lot.id ? null : lot.id)}
                  aria-expanded={editing === lot.id}
                >
                  Modifier le lot {lot.id}
                </button>
              </div>
              <div
                className="ec-ribbon"
                aria-label={`Lot ${lot.id} : ${m(used)} affectés, ${m(left)} disponibles`}
              >
                {assigned.map((a, i) => (
                  <div
                    className={`ec-piece shade-${i % 2}`}
                    key={a.lineId}
                    style={{ flex: a.cm }}
                  >
                    {m(a.cm)}
                    <span>{a.lineId}</span>
                  </div>
                ))}
                {left > 0 && (
                  <div className="ec-free" style={{ flex: left }}>
                    {m(left)} disponibles
                  </div>
                )}
                {lot.totalCm === 0 && (
                  <span className="ec-zero">Aucun métrage</span>
                )}
              </div>
              <div className="ec-lot-left">
                <strong>{m(left)}</strong>
                <span>restants</span>
              </div>
            </div>
            {editing === lot.id && (
              <form
                className="ec-lot-edit"
                key={JSON.stringify(lot)}
                onSubmit={(event) => {
                  const values = data(event);
                  if (
                    run(
                      () =>
                        updateLot(state, lot.id, {
                          ref: values.ref,
                          dye: values.dye,
                          totalCm: metersToCm(values.metres),
                          received: values.received === "on",
                        }),
                      "Lot mis à jour ; les revues concernées sont à refaire.",
                    )
                  )
                    setEditing(null);
                }}
              >
                <label>
                  Référence du lot {lot.id}
                  <input
                    name="ref"
                    defaultValue={lot.ref}
                    maxLength="100"
                    required
                  />
                </label>
                <label>
                  Teinte du lot {lot.id}
                  <input
                    name="dye"
                    defaultValue={lot.dye}
                    maxLength="60"
                    required
                  />
                </label>
                <label>
                  Métrage du lot {lot.id}
                  <input
                    name="metres"
                    inputMode="decimal"
                    defaultValue={lot.totalCm / 100}
                    required
                  />
                </label>
                <label className="ec-check">
                  <input
                    type="checkbox"
                    name="received"
                    defaultChecked={lot.received}
                  />
                  Réception déclarée
                </label>
                <button type="submit">Enregistrer le lot</button>
              </form>
            )}
          </div>
        );
      })}
    </section>
  );
}
function LineReview({ state, row, run }) {
  const line = row.line,
    basis = lineBasis(state, line.id);
  return (
    <aside className="ec-review">
      <h2>Revue atelier</h2>
      <p className="ec-line-heading">
        {line.id} · {line.model}
      </p>
      <form
        className="ec-line-edit"
        key={basis}
        onSubmit={(event) => {
          const v = data(event);
          run(
            () =>
              updateLine(state, line.id, {
                quantity: v.quantity,
                unitCm: metersToCm(v.unit),
                ref: v.ref,
                dye: v.dye,
              }),
            "Ligne enregistrée. Toute revue liée aux anciennes valeurs est retirée.",
          );
        }}
      >
        <label>
          Quantité
          <input
            name="quantity"
            type="number"
            min="1"
            max="1000"
            defaultValue={line.quantity}
            required
          />
        </label>
        <label>
          Consommation unitaire
          <span className="ec-unit">
            <input
              name="unit"
              inputMode="decimal"
              defaultValue={line.unitCm / 100}
              required
            />
            <span>m</span>
          </span>
        </label>
        <label>
          Référence
          <input name="ref" defaultValue={line.ref} maxLength="100" required />
        </label>
        <label>
          Teinte
          <input name="dye" defaultValue={line.dye} maxLength="60" required />
        </label>
        <button type="submit" className="ec-subtle">
          Enregistrer la ligne
        </button>
      </form>
      <form
        className="ec-checks"
        key={`${basis}-${JSON.stringify(state.decisions)}`}
        onSubmit={(event) => {
          const v = data(event);
          run(
            () =>
              review(state, line.id, {
                by: v.by,
                consumption: v.consumption === "on",
                pattern: v.pattern === "on",
                material: v.material === "on",
              }),
            "Revue enregistrée pour cette version de la ligne.",
          );
        }}
      >
        <label className="ec-check">
          <input type="checkbox" name="consumption" />
          Consommation confirmée
        </label>
        <label className="ec-check">
          <input type="checkbox" name="pattern" />
          Laize et raccord vérifiés
        </label>
        <label className="ec-check">
          <input type="checkbox" name="material" />
          Matière compatible
        </label>
        <label className="ec-relector">
          Relecteur
          <input
            name="by"
            placeholder="Nom ou rôle fictif"
            maxLength="60"
            required
          />
        </label>
        <button type="submit" disabled={row.blockers.length > 0}>
          Enregistrer la revue
        </button>
        {row.reviewed ? (
          <p className="ec-success">
            Revue déclarée par{" "}
            {state.reviews.find((r) => r.lineId === line.id).by}.
          </p>
        ) : (
          <p className="ec-caption">
            {row.blockers.length
              ? "Affectations et décisions à compléter."
              : "Trois déclarations humaines, pour la matière de cette ligne."}
          </p>
        )}
      </form>
      <p className="ec-source">
        6 m est un point de départ à valider pour le tissu choisi, sans calcul
        de coupe.
      </p>
    </aside>
  );
}
function AllocationEditor({ state, row, run }) {
  const [lotId, setLotId] = useState("B"),
    [amount, setAmount] = useState("2");
  const lot = state.lots.find((l) => l.id === lotId) || state.lots[0];
  const existing = state.allocations.find(
    (a) => a.lineId === row.line.id && a.lotId === lot.id,
  );
  const different = lot.ref !== row.line.ref || lot.dye !== row.line.dye;
  return (
    <section className="ec-panel ec-allocation">
      <h2>
        {existing ? "Modifier" : "Ajouter"} une affectation à {row.line.id}
      </h2>
      <form
        className="ec-allocate-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => allocate(state, row.line.id, lot.id, metersToCm(amount)),
            "Affectation enregistrée. Les décisions et revues concernées sont à refaire.",
          );
        }}
      >
        <label>
          Lot
          <select
            value={lot.id}
            onChange={(e) => {
              setLotId(e.target.value);
              const a = state.allocations.find(
                (x) => x.lineId === row.line.id && x.lotId === e.target.value,
              );
              setAmount(
                String(a ? a.cm / 100 : Math.max(row.missing, 0) / 100),
              );
            }}
          >
            {state.lots.map((l) => (
              <option value={l.id} key={l.id}>
                {l.id} · {l.ref} ({l.dye})
              </option>
            ))}
          </select>
        </label>
        <label>
          {existing ? "Mètres affectés au total" : "Mètres à affecter"}
          <span className="ec-unit">
            <input
              aria-label="Mètres à affecter"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              required
            />
            <span>m</span>
          </span>
        </label>
        <button type="submit" className="ec-primary">
          {existing ? "Remplacer l’affectation" : "Ajouter l’affectation"}
        </button>
        <p className={different ? "ec-warning" : "ec-caption"}>
          {different
            ? `Le lot ${lot.id} ne porte pas la même référence ou teinte. Une décision restera nécessaire.`
            : "La référence et la teinte correspondent. L’atelier doit encore vérifier la matière."}
        </p>
      </form>
      {row.allocations.length > 0 && (
        <div className="ec-assigned-list">
          {row.allocations.map((a) => (
            <span key={a.lotId}>
              Lot {a.lotId} · {m(a.cm)}{" "}
              <button
                className="ec-textbutton"
                onClick={() =>
                  run(
                    () => allocate(state, row.line.id, a.lotId, 0),
                    "Affectation retirée.",
                  )
                }
                aria-label={`Retirer le lot ${a.lotId} de ${row.line.id}`}
              >
                Retirer
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
function Decisions({ state, row, run }) {
  const differences = row.allocations.filter((a) => a.differences.length);
  if (!differences.length) return null;
  return (
    <section className="ec-decisions">
      <h2>Écarts de matière</h2>
      {differences.map((a) => (
        <form
          key={`${a.lotId}-${lineBasis(state, row.line.id)}-${JSON.stringify(a.decision)}`}
          onSubmit={(event) => {
            const v = data(event);
            run(
              () => decide(state, row.line.id, a.lotId, v.choice, v.note),
              "Décision matière enregistrée ; la revue complète reste séparée.",
            );
          }}
        >
          <div>
            <h3>
              Lot {a.lotId} sur {row.line.id}
            </h3>
            {a.differences.map((v) => (
              <p key={v}>{v}</p>
            ))}
          </div>
          <fieldset>
            <legend>Décision atelier</legend>
            <label className="ec-check">
              <input
                type="radio"
                name="choice"
                value="accepted"
                defaultChecked={a.decision?.choice === "accepted"}
                required
              />
              Accepter pour cette ligne
            </label>
            <label className="ec-check">
              <input
                type="radio"
                name="choice"
                value="rejected"
                defaultChecked={a.decision?.choice === "rejected"}
                required
              />
              Refuser cette matière
            </label>
          </fieldset>
          <label>
            Motif de la décision
            <textarea
              name="note"
              defaultValue={a.decision?.note || ""}
              placeholder="Accord à partir d’un échantillon, alternative validée…"
              minLength="10"
              maxLength="500"
              required
            />
          </label>
          <button type="submit">Enregistrer la décision</button>
          {a.decision && (
            <p className="ec-decision-status">
              Décision enregistrée :{" "}
              {a.decision.choice === "accepted" ? "acceptée" : "refusée"}.
            </p>
          )}
        </form>
      ))}
    </section>
  );
}
function Transmission({ state, rows, runAction }) {
  const ready = rows.every((r) => r.reviewed);
  return (
    <section className="ec-transmission">
      <div className="ec-export-head">
        <div>
          <h1>Bordereau matière</h1>
          <p>
            {ready
              ? "Préparation revue pour les données courantes."
              : "Brouillon avec les points encore à confirmer."}
          </p>
        </div>
        <button
          className="ec-primary"
          onClick={() =>
            runAction(
              () =>
                downloadReport("ecart-bordereau-matiere.html", report(state)),
              "Bordereau HTML téléchargé.",
            )
          }
        >
          Exporter le bordereau HTML
        </button>
      </div>
      <div className="ec-paper">
        <div className="ec-paper-top">
          <strong>ECART</strong>
          <span>{ready ? "Préparation revue" : "Brouillon"}</span>
        </div>
        {rows.map((r) => (
          <article key={r.line.id}>
            <div className="ec-paper-title">
              <h2>
                {r.line.order} / {r.line.id}
              </h2>
              <p>
                {r.line.model} · {r.line.finish}
              </p>
            </div>
            <p>
              Besoin de travail {m(r.need)} pour {r.line.quantity} pièce
              {r.line.quantity > 1 ? "s" : ""}. Affecté {m(r.assigned)}.
            </p>
            <div
              className="ec-scroll"
              role="region"
              aria-label={`Affectations de ${r.line.id}`}
              tabIndex="0"
            >
              <table>
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Matière / teinte</th>
                    <th>Mètres</th>
                    <th>Réception</th>
                    <th>Décision</th>
                  </tr>
                </thead>
                <tbody>
                  {r.allocations.map((a) => (
                    <tr key={a.lotId}>
                      <td>{a.lotId}</td>
                      <td>
                        {a.lot.ref} / {a.lot.dye}
                      </td>
                      <td>{m(a.cm)}</td>
                      <td>{a.lot.received ? "Déclarée" : "À confirmer"}</td>
                      <td>
                        {a.differences.length
                          ? a.decision
                            ? (a.decision.choice === "accepted"
                                ? "Acceptée. "
                                : "Refusée. ") + a.decision.note
                            : "Écart à décider"
                          : "Références identiques"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.blockers.length > 0 && (
              <ul>
                {r.blockers.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            )}
            <p className={r.reviewed ? "ec-success" : "ec-warning"}>
              {r.reviewed
                ? `Revue déclarée par ${state.reviews.find((x) => x.lineId === r.line.id).by}.`
                : "Consommation, laize/raccord et compatibilité restent à valider."}
            </p>
          </article>
        ))}
        <p className="ec-paper-note">
          Exemple fictif. Affectations locales, sans réservation de stock ni
          ordre de fabrication. Les contrôles textile sont déclarés par une
          personne ; aucun diagnostic automatique.
        </p>
      </div>
      <div className="ec-export-buttons">
        <button
          onClick={() =>
            runAction(
              () =>
                downloadCsv(
                  "ecart-affectations.csv",
                  [
                    "commande",
                    "ligne",
                    "modele",
                    "lot",
                    "reference",
                    "teinte",
                    "metres",
                    "reception",
                    "ecart",
                    "decision",
                    "motif",
                    "revue",
                  ],
                  allocationRows(state),
                ),
              "CSV des affectations téléchargé.",
            )
          }
        >
          Exporter les affectations CSV
        </button>
        <button
          onClick={() =>
            runAction(
              () =>
                downloadText("ecart-questions-atelier.txt", questions(state)),
              "Points de revue téléchargés.",
            )
          }
        >
          Télécharger les points à confirmer
        </button>
      </div>
    </section>
  );
}
export default function App() {
  useDocumentTitle("ECART · Dossier matière");
  const history = useHistory(seed),
    state = history.value,
    rows = analyze(state);
  const [selected, setSelected] = useState("L02"),
    [tab, setTab] = useState("matter"),
    [imports, setImports] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const row = rows.find((r) => r.line.id === selected) || rows[0];
  function run(fn, message) {
    try {
      const next = fn();
      history.set(next);
      setError("");
      setNotice(message);
      return true;
    } catch (e) {
      setError(e.message);
      setNotice("");
      return false;
    }
  }
  function runAction(fn, message) {
    try {
      fn();
      setError("");
      setNotice(message);
    } catch (e) {
      setError(e.message);
    }
  }
  async function ingest(file, kind) {
    try {
      const raw = await readLocalFile(file);
      run(
        () => (kind === "json" ? restore(raw) : importCsv(state, kind, raw)),
        kind === "json"
          ? "Dossier restauré."
          : "Import ajouté ou mis à jour par identifiant ; affectations conservées si valides.",
      );
    } catch (e) {
      setError(e.message);
      setNotice("");
    }
  }
  const missing = rows.reduce((n, r) => n + r.missing, 0),
    ready = rows.every((r) => r.reviewed);
  return (
    <div className="ecart-app">
      <header className="ec-header">
        <div className="ec-wordmark">ECART</div>
        <nav aria-label="Dossier matière">
          <button
            aria-current={tab === "matter" ? "page" : undefined}
            onClick={() => setTab("matter")}
          >
            Dossier matière
          </button>
          <button
            aria-current={tab === "transmission" ? "page" : undefined}
            onClick={() => setTab("transmission")}
          >
            Transmission
          </button>
        </nav>
        <span className="ec-private-note">Exemple fictif</span>
      </header>
      <main>
        <div className="ec-toolbar">
          {tab === "matter" ? (
            <div>
              <h1>Affecter le tissu client</h1>
              <p>
                Deux fauteuils, deux lots reçus dans l’exemple.
                <br />
                Répartissez les mètres puis vérifiez la matière avec l’atelier.
              </p>
            </div>
          ) : (
            <p>
              Prototype indépendant pour explorer la transmission des tissus
              clients.
            </p>
          )}
          <div className="ec-toolbar-actions">
            <button
              onClick={() => setImports(!imports)}
              aria-expanded={imports}
            >
              Importer
            </button>
            <button
              className="ec-primary"
              onClick={() =>
                runAction(
                  () => downloadJson("ecart-dossier.json", state),
                  "Dossier JSON téléchargé. Utilisez Reprendre un JSON pour le rouvrir.",
                )
              }
            >
              Enregistrer le dossier
            </button>
          </div>
        </div>
        {imports && (
          <section className="ec-imports">
            <h2>Ajouter des données ou reprendre un dossier</h2>
            <p>
              Les CSV ajoutent ou mettent à jour les identifiants présents. Une
              reprise JSON remplace le dossier courant. Les fichiers restent
              dans votre navigateur.
            </p>
            <div>
              <FileImport
                label="Importer les lignes CSV"
                accept=".csv,text/csv"
                onFile={(f) => ingest(f, "lines")}
              />
              <FileImport
                label="Importer les lots CSV"
                accept=".csv,text/csv"
                onFile={(f) => ingest(f, "lots")}
              />
              <FileImport
                label="Reprendre un JSON"
                accept=".json,application/json"
                onFile={(f) => ingest(f, "json")}
              />
            </div>
            <div>
              <button
                onClick={() =>
                  downloadCsv(
                    "ecart-exemple-lignes.csv",
                    LINE_HEADERS,
                    exampleLines(),
                  )
                }
              >
                Exemple lignes CSV
              </button>
              <button
                onClick={() =>
                  downloadCsv(
                    "ecart-exemple-lots.csv",
                    LOT_HEADERS,
                    exampleLots(),
                  )
                }
              >
                Exemple lots CSV
              </button>
            </div>
            <p className="ec-caption">
              Métrages en mètres, deux décimales au plus ; réception « oui » ou
              « non ». Une erreur annule tout l’import.
            </p>
          </section>
        )}
        <div className="ec-feedback" aria-live="polite">
          {error ? (
            <p role="alert" className="ec-error">
              {error}
            </p>
          ) : notice ? (
            <p>{notice}</p>
          ) : null}
        </div>
        {tab === "matter" ? (
          <>
            <div className="ec-workspace">
              <div className="ec-materials">
                <LineTable
                  rows={rows}
                  selected={row.line.id}
                  select={setSelected}
                />
                <Lots state={state} run={run} />
              </div>
              <LineReview state={state} row={row} run={run} />
              <AllocationEditor
                key={row.line.id}
                state={state}
                row={row}
                run={run}
              />
            </div>
            <Decisions state={state} row={row} run={run} />
            <div className="ec-transmission-strip">
              <strong>Transmission</strong>
              <p>
                {missing > 0
                  ? `${m(missing)} restent à affecter${rows.filter((r) => r.missing > 0).length === 1 ? " à " + rows.find((r) => r.missing > 0).line.id : ""}`
                  : ready
                    ? "Préparation revue"
                    : "Métrages affectés, revue à terminer"}
              </p>
              <button onClick={() => setTab("transmission")}>
                Voir le bordereau
              </button>
            </div>
          </>
        ) : (
          <Transmission state={state} rows={rows} runAction={runAction} />
        )}
        <div className="ec-history">
          <div>
            <button
              disabled={!history.canUndo}
              onClick={() => {
                history.undo();
                setError("");
                setNotice("Dernière modification annulée.");
              }}
            >
              Annuler
            </button>
            <button
              disabled={!history.canRedo}
              onClick={() => {
                history.redo();
                setError("");
                setNotice("Modification rétablie.");
              }}
            >
              Rétablir
            </button>
            <button
              onClick={() => {
                history.reset();
                setSelected("L02");
                setError("");
                setNotice(
                  "Exemple rétabli. Annuler permet de retrouver votre dossier.",
                );
              }}
            >
              Exemple initial
            </button>
          </div>
          <span>Prototype indépendant · traitement local</span>
        </div>
      </main>
      <DemoFooter />
    </div>
  );
}

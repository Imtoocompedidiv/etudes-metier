import { useEffect, useMemo, useState } from "react";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/space-grotesk/latin-600.css";
import {
  downloadCsv,
  downloadJson,
  downloadReport,
  readLocalFile,
} from "../../shared/files.js";
import { useHistory } from "../../shared/state.js";
import {
  DemoContext,
  DemoFooter,
  ErrorMessage,
  FileImport,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  seed,
  calculate,
  graphLayout,
  reachable,
  grams,
  kg,
  importLots,
  importMovements,
  lotHeaders,
  movementHeaders,
  validateMovements,
  restore,
  validState,
} from "./model.js";
import "./styles.css";

function Genealogy({ lots, result, selected, onSelect, recall }) {
  const layout = useMemo(
    () => graphLayout(lots, result.edges),
    [lots, result.edges],
  );
  const impacted = reachable(selected, result.edges);
  const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
  return (
    <div
      className="hic-graph-scroll"
      role="region"
      aria-label="Graphe de filiation, défilement horizontal possible"
      tabIndex={0}
    >
      <div
        className="hic-graph"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg width={layout.width} height={layout.height} aria-hidden="true">
          {result.edges.map((edge, index) => {
            const from = nodes.get(edge.source),
              to = nodes.get(edge.destination);
            const x1 = from.x + 190,
              y1 = from.y + 37,
              x2 = to.x,
              y2 = to.y + 37;
            const mid = x1 + 35 + (index % 3) * 5;
            const highlighted =
              recall && (edge.source === selected || impacted.has(edge.source));
            return (
              <g key={edge.id} className={highlighted ? "hic-path-active" : ""}>
                <path d={`M${x1} ${y1} H${mid} V${y2} H${x2}`} />
                <path
                  d={`M${x2 - 6} ${y2 - 4} L${x2} ${y2} L${x2 - 6} ${y2 + 4}`}
                />
                <rect x={x1 + 4} y={y1 - 25} width="70" height="21" />
                <text x={x1 + 8} y={y1 - 10}>
                  {kg(edge.grams)} kg
                </text>
              </g>
            );
          })}
        </svg>
        {layout.nodes.map((node) => (
          <button
            key={node.id}
            className={`hic-node ${node.id === selected ? "is-selected" : ""} ${recall && impacted.has(node.id) ? "is-impacted" : ""}`}
            style={{ left: node.x, top: node.y }}
            onClick={() => onSelect(node.id)}
            aria-pressed={node.id === selected}
            title={`${node.id} · ${node.label}`}
          >
            <strong>{node.id}</strong>
            <span>{node.label}</span>
            <small>{kg(result.balances[node.id])} kg restants</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function MovementEditor({ movement, lots, onApply, onDirty }) {
  const [draft, setDraft] = useState(movement);
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(movement);
    setError("");
    onDirty(false);
  }, [movement]);
  if (!draft) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(movement);
  const edit = (field, value) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    setError("");
    onDirty(JSON.stringify(next) !== JSON.stringify(movement));
  };
  const apply = (event) => {
    event.preventDefault();
    try {
      const [value] = validateMovements([draft]);
      onApply(value);
      onDirty(false);
      setError("");
    } catch (problem) {
      setError(problem.message);
    }
  };
  return (
    <form className="hic-editor" onSubmit={apply}>
      <div className="hic-editor-title">
        <h3>Détail du mouvement {movement.id}</h3>
        <span>{dirty ? "Correction non appliquée" : "Valeur du registre"}</span>
      </div>
      <div className="hic-editor-fields">
        <label>
          Date
          <input
            aria-label="Date du mouvement"
            type="date"
            min="2000-01-01"
            max="2099-12-31"
            value={draft.date}
            onChange={(event) => edit("date", event.target.value)}
            required
          />
        </label>
        {["source", "destination"].map((field) => (
          <label key={field}>
            {field === "source" ? "Origine" : "Destination"}
            <select
              aria-label={
                field === "source"
                  ? "Origine du mouvement"
                  : "Destination du mouvement"
              }
              value={draft[field]}
              onChange={(event) => edit(field, event.target.value)}
            >
              {!lots.some((lot) => lot.id === draft[field]) && (
                <option value={draft[field]}>{draft[field]} (inconnu)</option>
              )}
              {lots.map((lot) => (
                <option value={lot.id} key={lot.id}>
                  {lot.id} · {lot.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Quantité (kg)
          <input
            aria-label="Quantité du mouvement en kg"
            inputMode="decimal"
            value={draft.quantity_kg}
            maxLength={11}
            onChange={(event) => edit("quantity_kg", event.target.value)}
            required
          />
        </label>
        <button className="hic-primary" type="submit" disabled={!dirty}>
          Appliquer la correction
        </button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {dirty && (
        <p className="hic-draft-note">
          Le graphe et les exports utilisent les valeurs appliquées. Appliquez
          la correction avant d’exporter.
        </p>
      )}
    </form>
  );
}

function Ledger({ result, selected, onSelect, filter }) {
  const rows = filter === "errors" ? result.rejected : result.results;
  return (
    <div
      className="hic-table-scroll"
      role="region"
      aria-label="Mouvements du dossier, défilement horizontal possible"
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            <th>Mouvement</th>
            <th>Date</th>
            <th>Origine</th>
            <th>Destination</th>
            <th>Quantité</th>
            <th>Contrôle</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`${!row.valid ? "hic-rejected" : ""} ${row.id === selected ? "hic-selected-row" : ""}`}
            >
              <td>
                <button
                  className="hic-row-button"
                  aria-label={`Modifier ${row.id}`}
                  aria-pressed={row.id === selected}
                  onClick={() => onSelect(row.id)}
                >
                  {row.id}
                </button>
              </td>
              <td>{row.date.split("-").reverse().join("/")}</td>
              <td>{row.source}</td>
              <td>{row.destination}</td>
              <td>{kg(row.grams)} kg</td>
              <td>{row.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="hic-empty">Aucun mouvement dans cette vue.</p>
      )}
    </div>
  );
}

export default function App() {
  useDocumentTitle("HIC · Traçabilité des lots");
  const history = useHistory(seed, { key: "hic:v1", validate: validState });
  const { value } = history;
  const result = useMemo(
    () => calculate(value.lots, value.movements),
    [value.lots, value.movements],
  );
  const [selectedLot, setSelectedLot] = useState("BOIS-01");
  const [selectedMove, setSelectedMove] = useState("M04");
  const [recall, setRecall] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [comparison, setComparison] = useState(null);
  const lot =
    value.lots.find((item) => item.id === selectedLot) || value.lots[0];
  const movement =
    value.movements.find((item) => item.id === selectedMove) ||
    value.movements[0];
  const descendants = reachable(lot.id, result.edges),
    ancestors = reachable(lot.id, result.edges, "up");
  const commit = (next, message) => {
    setComparison({
      before: result.balances,
      after: calculate(next.lots, next.movements).balances,
    });
    history.set({ ...next, journal: [...value.journal, message].slice(-40) });
    setError("");
    setNotice(message);
  };
  const applyMovement = (next) =>
    commit(
      {
        ...value,
        movements: value.movements.map((row) =>
          row.id === next.id ? next : row,
        ),
      },
      `${next.id} corrigé : ${next.quantity_kg} kg de ${next.source} vers ${next.destination}, le ${next.date}.`,
    );
  const importFile = async (file, kind) => {
    try {
      const raw = await readLocalFile(file, { maxBytes: 500000 });
      if (kind === "dossier") {
        const restored = restore(JSON.parse(raw));
        history.set(restored);
        setDirty(false);
        setComparison(null);
        setError("");
        setNotice("Dossier restauré avec son journal.");
        return;
      }
      const data = kind === "lots" ? importLots(raw) : importMovements(raw);
      commit(
        { ...value, [kind]: data },
        `${data.length} ${kind === "lots" ? "lots" : "mouvements"} importés depuis ${file.name.slice(0, 80)}.`,
      );
    } catch (problem) {
      setError(`Import refusé. ${problem.message}`);
    }
  };
  const addMovement = () => {
    let index = 1;
    while (
      value.movements.some(
        (row) => row.id === `M${String(index).padStart(2, "0")}`,
      )
    )
      index++;
    const next = {
      id: `M${String(index).padStart(2, "0")}`,
      date: value.movements.at(-1).date,
      source: lot.id,
      destination:
        value.lots.find((item) => item.type === "produit")?.id || lot.id,
      quantity_kg: "1",
    };
    if (value.movements.length >= 500) {
      setError("Le dossier est limité à 500 mouvements.");
      return;
    }
    commit(
      { ...value, movements: [...value.movements, next] },
      `${next.id} ajouté à partir du lot sélectionné ; contrôles recalculés.`,
    );
    setSelectedMove(next.id);
  };
  const report = () =>
    downloadReport("hic-filiation.html", {
      title: `Filiation du lot ${lot.id} · ${lot.label}`,
      subtitle:
        "Données fictives. Graphe des mouvements retenus, quantités en kilogrammes. Simulation de retrait conservative : tous les descendants sont concernés, sans calcul de contamination.",
      sections: [
        {
          title: "Lot sélectionné",
          paragraphs: [
            `Stock restant : ${kg(result.balances[lot.id])} kg. Origines : ${[...ancestors].join(", ") || "lot entrant"}.`,
            `Descendants : ${[...descendants].join(", ") || "aucun"}. ${result.rejected.length} mouvement(s) en anomalie ne participe(nt) pas à la filiation.`,
          ],
        },
        {
          title: "Mouvements retenus liés à la filiation",
          headers: ["ID", "Date", "Origine", "Destination", "kg"],
          rows: result.valid
            .filter(
              (row) =>
                new Set([lot.id, ...ancestors, ...descendants]).has(
                  row.source,
                ) &&
                new Set([lot.id, ...ancestors, ...descendants]).has(
                  row.destination,
                ),
            )
            .map((row) => [
              row.id,
              row.date,
              row.source,
              row.destination,
              kg(row.grams),
            ]),
        },
        {
          title: "Exceptions du dossier",
          headers: ["Mouvement", "Motif"],
          rows: result.rejected.map((row) => [row.id, row.reason]),
        },
        { title: "Journal des modifications", paragraphs: value.journal },
      ],
    });
  const undo = () => {
    history.undo();
    setComparison(null);
    setNotice("Dernière modification annulée.");
  };
  return (
    <div className="hic-app">
      <header className="hic-header">
        <div className="hic-mark" aria-label="Étude pour HIC">
          hic<span>.</span>
        </div>
        <h1>Tracer les lots d’un atelier</h1>
        <span className="hic-workshop">Atelier Bois · exemple fictif</span>
      </header>
      <DemoContext company="HIC">
        Corrigez M04 à 50 kg, puis simulez le retrait de BOIS-01.
      </DemoContext>
      <div className="hic-toolbar">
        <FileImport
          label="Importer les lots"
          accept=".csv,text/csv"
          onFile={(file) => importFile(file, "lots")}
        />
        <FileImport
          label="Importer les mouvements"
          accept=".csv,text/csv"
          onFile={(file) => importFile(file, "movements")}
        />
        <button onClick={undo} disabled={!history.canUndo}>
          Annuler
        </button>
        <button
          onClick={() => {
            history.redo();
            setComparison(null);
            setNotice("Modification rétablie.");
          }}
          disabled={!history.canRedo}
        >
          Rétablir
        </button>
        <button
          className="hic-primary"
          onClick={() => downloadJson("hic-dossier.json", value)}
          disabled={dirty}
        >
          Exporter le dossier
        </button>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <div role="status" className="hic-notice">
        {notice}
      </div>
      {!history.storageAvailable && (
        <p>
          La sauvegarde locale est indisponible. Exportez le dossier pour le
          conserver.
        </p>
      )}
      <main className="hic-main">
        <aside className="hic-register">
          <h2>Lots et produits</h2>
          <p>Stock restant après les mouvements retenus</p>
          <div className="hic-lot-list">
            {value.lots.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedLot(item.id)}
                className={lot.id === item.id ? "is-selected" : ""}
                aria-pressed={lot.id === item.id}
              >
                <span>
                  <strong>{item.id}</strong>
                  <small>{item.label}</small>
                </span>
                <span>{kg(result.balances[item.id])} kg</span>
              </button>
            ))}
          </div>
          <dl className="hic-lot-details">
            <dt>Lot sélectionné</dt>
            <dd>{lot.label}</dd>
            <dt>Disponible à partir du</dt>
            <dd>{lot.received}</dd>
            <dt>Quantité initiale</dt>
            <dd>{kg(grams(lot.quantity_kg))} kg</dd>
            <dt>Quantité reçue par transfert</dt>
            <dd>{kg(result.incoming[lot.id])} kg</dd>
          </dl>
        </aside>
        <div className="hic-workspace">
          <section className="hic-genealogy">
            <div className="hic-section-title">
              <h2>Filiation</h2>
              <label className="hic-check">
                <input
                  type="checkbox"
                  checked={recall}
                  onChange={(event) => setRecall(event.target.checked)}
                />
                Simuler un retrait
              </label>
              <select
                aria-label="Lot à examiner"
                value={lot.id}
                onChange={(event) => setSelectedLot(event.target.value)}
              >
                {value.lots.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} · {item.label}
                  </option>
                ))}
              </select>
            </div>
            <Genealogy
              lots={value.lots}
              result={result}
              selected={lot.id}
              onSelect={setSelectedLot}
              recall={recall}
            />
            <div className={`hic-impact ${recall ? "is-active" : ""}`}>
              <strong>
                {recall
                  ? `Retrait simulé de ${lot.id}`
                  : `Origines de ${lot.id}`}
              </strong>
              <p>
                {recall
                  ? descendants.size
                    ? `Lots en aval concernés : ${[...descendants].join(", ")}.`
                    : "Aucun lot en aval dans les mouvements retenus."
                  : ancestors.size
                    ? [...ancestors].join(", ")
                    : "Ce lot ne possède pas d’origine dans les mouvements retenus."}
              </p>
              <small>
                {recall
                  ? "Tous les descendants sont inclus, sans estimation de proportion. Les mouvements en anomalie sont hors graphe."
                  : "Les lignes représentent les quantités transférées. Les nœuds affichent le stock restant."}
              </small>
            </div>
          </section>
          <section className="hic-ledger">
            <div className="hic-section-title">
              <h2>Mouvements du dossier</h2>
              <label>
                Afficher
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  <option value="all">Tous les mouvements</option>
                  <option value="errors">Anomalies seulement</option>
                </select>
              </label>
              <button onClick={addMovement} disabled={dirty}>
                Ajouter un mouvement
              </button>
            </div>
            <p className="hic-method">
              Traitement par date, puis identifiant. Un mouvement refusé ne
              consomme aucune matière. Unité unique : kg, sans perte ni
              conversion.
            </p>
            <Ledger
              result={result}
              selected={movement.id}
              onSelect={setSelectedMove}
              filter={filter}
            />
            <MovementEditor
              movement={movement}
              lots={value.lots}
              onApply={applyMovement}
              onDirty={setDirty}
            />
            {comparison && (
              <div className="hic-comparison">
                <strong>Variation des stocks après cette modification</strong>
                <p>
                  {value.lots
                    .filter(
                      (item) =>
                        comparison.before[item.id] !==
                        comparison.after[item.id],
                    )
                    .map(
                      (item) =>
                        `${item.id} : ${kg(comparison.before[item.id] || 0)} → ${kg(comparison.after[item.id])} kg`,
                    )
                    .join(" · ") || "Aucune variation de stock."}
                </p>
              </div>
            )}
          </section>
          <section className="hic-exports">
            <h2>Exports et validation</h2>
            <div>
              <button
                disabled={dirty || !result.valid.length}
                onClick={() =>
                  downloadCsv(
                    "hic-registre-valide.csv",
                    movementHeaders,
                    result.valid,
                  )
                }
              >
                Registre CSV
              </button>
              <button disabled={dirty} onClick={report}>
                Fiche de filiation
              </button>
              <button
                disabled={dirty || !result.rejected.length}
                onClick={() =>
                  downloadCsv(
                    "hic-exceptions.csv",
                    [...movementHeaders, "reason"],
                    result.rejected,
                  )
                }
              >
                Exceptions CSV
              </button>
            </div>
            <p>
              {result.valid.length} mouvement(s) retenu(s),{" "}
              {result.rejected.length} exclu(s). Le registre CSV ne contient que
              les mouvements retenus ; le dossier JSON conserve tous les
              mouvements.
            </p>
          </section>
          <details className="hic-details">
            <summary>Fichiers d’exemple, restauration et journal</summary>
            <p>
              Importez des CSV UTF-8 avec les colonnes de ces exemples. 60 lots
              et 500 mouvements maximum. Les produits commencent à zéro ; les
              matières portent le stock initial. Les imports remplacent le
              registre concerné.
            </p>
            <div className="hic-detail-actions">
              <button
                onClick={() =>
                  downloadCsv("hic-exemple-lots.csv", lotHeaders, seed.lots)
                }
              >
                Exemple lots CSV
              </button>
              <button
                onClick={() =>
                  downloadCsv(
                    "hic-exemple-mouvements.csv",
                    movementHeaders,
                    seed.movements,
                  )
                }
              >
                Exemple mouvements CSV
              </button>
              <FileImport
                label="Restaurer un dossier JSON"
                accept=".json,application/json"
                onFile={(file) => importFile(file, "dossier")}
              />
              <button
                onClick={() => {
                  history.reset();
                  setSelectedMove("M04");
                  setSelectedLot("BOIS-01");
                  setComparison(null);
                  setRecall(false);
                  setError("");
                  setNotice(
                    "Exemple réinitialisé. Cette action peut être annulée.",
                  );
                }}
              >
                Réinitialiser l’exemple
              </button>
            </div>
            <h3>Journal du dossier</h3>
            <ol>
              {value.journal.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ol>
          </details>
        </div>
      </main>
      <DemoFooter />
    </div>
  );
}

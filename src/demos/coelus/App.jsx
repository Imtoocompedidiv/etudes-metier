import React, { useState } from "react";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import { useHistory } from "../../shared/state.js";
import {
  DemoContext,
  DemoFooter,
  ErrorMessage,
  FileImport,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadJson,
  downloadCsv,
  downloadReport,
} from "../../shared/files.js";
import {
  definitions,
  statuses,
  initial,
  normalizeDossier,
  normalizeInventory,
  normalizeResource,
  parseJson,
  validDossier,
  compare,
  change,
  saveTarget,
  removeTarget,
  acceptDifference,
  revoke,
  summary,
  formatValue,
  diffHeaders,
  diffRows,
} from "./model.js";
import "./styles.css";

function ResourceEditor({ row, onSave, onRemove }) {
  const [draft, setDraft] = useState(structuredClone(row.target || row.source)),
    [error, setError] = useState("");
  const fields = definitions[row.resource.type].fields;
  return (
    <aside className="co-inspector">
      <h2>{row.resource.id}</h2>
      <p className="co-muted">{definitions[row.resource.type].label}</p>
      <h3>Attributs source</h3>
      <dl>
        {Object.entries(fields).map(([key, [label]]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{formatValue(row.source?.[key])}</dd>
          </div>
        ))}
      </dl>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSave(normalizeResource(draft));
            setError("");
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <h3>
          {row.target
            ? "Éditer la cible déclarée"
            : "Déclarer la ressource cible"}
        </h3>
        {Object.entries(fields).map(([key, [label, type]]) => (
          <label key={key}>
            {label}
            {type === "boolean" ? (
              <select
                value={String(draft[key])}
                onChange={(e) =>
                  setDraft({ ...draft, [key]: e.target.value === "true" })
                }
              >
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </select>
            ) : (
              <input
                required
                type={type === "number" ? "number" : "text"}
                min={type === "number" ? 0 : undefined}
                max={type === "number" ? 1e12 : undefined}
                step={type === "number" ? 1 : undefined}
                maxLength={type === "string" ? 80 : undefined}
                value={draft[key]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    [key]:
                      type === "number"
                        ? e.target.value === ""
                          ? ""
                          : Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            )}
          </label>
        ))}
        <ErrorMessage>{error}</ErrorMessage>
        <button className="co-primary" type="submit">
          {row.target ? "Enregistrer la cible" : "Ajouter à la cible"}
        </button>
        <p className="co-muted">
          Cette action modifie l’inventaire JSON déclaré. Aucun transfert,
          changement de configuration ni requête n’est effectué.
        </p>
      </form>
      {row.target && (
        <button className="co-remove" onClick={() => onRemove(row.key)}>
          Retirer de l’inventaire cible
        </button>
      )}
    </aside>
  );
}
function DecisionForm({ row, onAccept, onRevoke }) {
  const [reason, setReason] = useState(row.decision?.reason || ""),
    [error, setError] = useState("");
  return (
    <section className="co-decision" id="co-decisions">
      <h2>Décisions de recette</h2>
      <div className="co-decision-body">
        <div>
          <strong>{row.resource.id}</strong>
          <p>{statuses[row.status]}</p>
          <p className="co-muted">
            {row.decisionStatus === "accepted"
              ? "Écart accepté, conservé au comparatif."
              : row.decisionStatus === "stale"
                ? "Les attributs ont changé. Le motif doit être revalidé."
                : "Un écart reste à traiter tant qu’il n’est ni corrigé ni explicitement accepté."}
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              onAccept(row.key, reason);
              setError("");
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          <label>
            Justifier un écart accepté
            <textarea
              maxLength={400}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Décision de recette et suites à donner"
              required
            />
          </label>
          <ErrorMessage>{error}</ErrorMessage>
          <div className="co-actions">
            <button className="co-primary" disabled={row.status === "same"}>
              Accepter cet écart
            </button>
            {row.decision && (
              <button type="button" onClick={() => onRevoke(row.key)}>
                Retirer l’acceptation
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
export default function App() {
  useDocumentTitle("Coelus · Rapprochement de migration");
  const history = useHistory(initial, {
      key: "coelus:v1",
      validate: validDossier,
    }),
    d = history.value;
  const [selected, setSelected] = useState("bucket:medias"),
    [query, setQuery] = useState(""),
    [type, setType] = useState("all"),
    [onlyDiff, setOnlyDiff] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const rows = compare(d),
    row = rows.find((r) => r.key === selected) || rows[0],
    visible = rows.filter(
      (r) =>
        (type === "all" || r.resource.type === type) &&
        (!onlyDiff || r.status !== "same") &&
        r.resource.id.toLowerCase().includes(query.toLowerCase()),
    );
  const pending = rows.filter(
      (r) => r.status !== "same" && r.decisionStatus !== "accepted",
    ),
    accepted = rows.filter((r) => r.decisionStatus === "accepted");
  const commit = (next, msg) => {
    history.set(next);
    setError("");
    setNotice(msg);
  };
  async function importFile(file, side) {
    try {
      const parsed = parseJson(
        await readLocalFile(file, { maxBytes: 1048576 }),
      );
      if (side === "dossier")
        commit(normalizeDossier(parsed), "Dossier restauré.");
      else
        commit(
          change(
            d,
            { [side]: normalizeInventory(parsed) },
            `Inventaire ${side === "source" ? "source" : "cible"} remplacé.`,
          ),
          "Inventaire remplacé ; toutes les acceptations ont été réévaluées.",
        );
    } catch (err) {
      setError(`Import refusé. ${err.message}`);
      setNotice("");
    }
  }
  function report() {
    downloadReport("coelus-rapprochement.html", {
      title: "Rapprochement d’inventaires Coelus",
      subtitle: `${d.source.label} / ${d.target.label} · ${pending.length} écarts à traiter, ${accepted.length} acceptés · inventaires fictifs déclaratifs`,
      sections: [
        {
          title: "Portée",
          paragraphs: [
            "Ce rapport compare uniquement les attributs des fichiers fournis, sans connexion à une base. Des compteurs identiques ne prouvent pas l’identité des données, des objets stockés ni des politiques RLS. Les révisions de fonctions sont des libellés déclarés. OAuth et SMTP sont seulement signalés comme activés ou non. Les secrets, politiques et configurations complètes ne sont pas inspectés.",
          ],
        },
        {
          title: "Comparatif complet",
          headers: [
            "Type",
            "Ressource",
            "Source",
            "Cible",
            "Statut",
            "Décision",
          ],
          rows: rows.map((r) => [
            definitions[r.resource.type].label,
            r.resource.id,
            summary(r.source),
            summary(r.target),
            statuses[r.status],
            r.decisionStatus === "accepted"
              ? "Accepté"
              : r.decisionStatus === "stale"
                ? "À revalider"
                : "Non accepté",
          ]),
        },
        { title: "Détail des écarts", headers: diffHeaders, rows: diffRows(d) },
        {
          title: "Décisions conservées",
          headers: [
            "Ressource",
            "Motif",
            "Source au moment de la décision",
            "Cible au moment de la décision",
          ],
          rows: d.decisions.map((r) => [
            r.key,
            r.reason,
            summary(r.source),
            summary(r.target),
          ]),
        },
        { title: "Journal", paragraphs: d.journal },
      ],
    });
  }
  return (
    <div className="coelus-app">
      <div className="co-rail">
        <strong>Coelus</strong>
        <nav aria-label="Sections du rapprochement">
          <a href="#co-compare">Comparaison</a>
          <a href="#co-decisions">Décisions</a>
          <a href="#co-exports">Livraison</a>
        </nav>
        <span>
          Inventaires locaux
          <br />
          Sans connexion
        </span>
      </div>
      <div className="co-body">
        <header>
          <span>Atelier de migration</span>
          <div className="co-actions">
            <button
              disabled={!history.canUndo}
              onClick={() => {
                history.undo();
                setError("");
                setNotice("Modification annulée.");
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
          </div>
        </header>
        <DemoContext company="Coelus">
          Inventaires fictifs déclaratifs. Aucun accès Supabase ni transfert
          réel.
        </DemoContext>
        <main>
          <h1>Rapprocher deux inventaires de migration</h1>
          <p className="co-intro">
            Ajoutez le bucket medias à la cible, puis contrôlez ses attributs.
          </p>
          <section className="co-sources" aria-label="Fichiers de comparaison">
            {["source", "target"].map((side) => (
              <div key={side}>
                <div>
                  <span>{side === "source" ? "Source" : "Cible"}</span>
                  <strong>{d[side].label}</strong>
                  <small>{d[side].resources.length} ressources déclarées</small>
                </div>
                <FileImport
                  label={`Importer la ${side === "source" ? "source" : "cible"} JSON`}
                  accept=".json,application/json"
                  onFile={(f) => importFile(f, side)}
                />
              </div>
            ))}
          </section>
          <ErrorMessage>{error}</ErrorMessage>
          <p role="status" className="co-notice">
            {notice}
          </p>
          <div className="co-workspace">
            <div className="co-main">
              <section id="co-compare" className="co-compare">
                <div className="co-toolbar">
                  <label>
                    Rechercher une ressource
                    <input
                      type="search"
                      value={query}
                      placeholder="Nom ou schéma"
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <label>
                    Type
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                    >
                      <option value="all">Tous les types</option>
                      {Object.entries(definitions).map(([value, v]) => (
                        <option key={value} value={value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="co-check">
                    <input
                      type="checkbox"
                      checked={onlyDiff}
                      onChange={(e) => setOnlyDiff(e.target.checked)}
                    />
                    Uniquement les écarts
                  </label>
                </div>
                <div
                  className="co-scroll"
                  role="region"
                  aria-label="Inventaires comparés, défilement horizontal"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Ressource</th>
                        <th>Source</th>
                        <th>Statut</th>
                        <th>Cible</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(definitions).map(([group, def]) => {
                        const entries = visible.filter(
                          (r) => r.resource.type === group,
                        );
                        return entries.length ? (
                          <React.Fragment key={group}>
                            <tr className="co-group">
                              <th colSpan={4}>{def.label}</th>
                            </tr>
                            {entries.map((r) => (
                              <tr
                                key={r.key}
                                className={`${row?.key === r.key ? "co-selected" : ""} ${r.status === "same" ? "co-same" : ""}`}
                              >
                                <th>
                                  <button
                                    aria-pressed={row?.key === r.key}
                                    onClick={() => setSelected(r.key)}
                                  >
                                    {r.resource.id}
                                  </button>
                                </th>
                                <td>{summary(r.source)}</td>
                                <td>
                                  <span>{statuses[r.status]}</span>
                                  {r.decisionStatus === "accepted" && (
                                    <small>Écart accepté</small>
                                  )}
                                  {r.decisionStatus === "stale" && (
                                    <small>À revalider</small>
                                  )}
                                </td>
                                <td>{summary(r.target)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ) : null;
                      })}
                    </tbody>
                  </table>
                </div>
                {!visible.length && (
                  <p className="co-empty">Aucune ressource pour ce filtre.</p>
                )}
                <p className="co-table-note">
                  {pending.length} écarts à traiter · {accepted.length}{" "}
                  acceptés. L’égalité porte uniquement sur les attributs listés.
                </p>
              </section>
              {row && (
                <DecisionForm
                  key={
                    row.key +
                    JSON.stringify(row.decision) +
                    JSON.stringify(row.source) +
                    JSON.stringify(row.target)
                  }
                  row={row}
                  onAccept={(key, reason) =>
                    commit(
                      acceptDifference(d, key, reason),
                      "Écart accepté avec sa justification.",
                    )
                  }
                  onRevoke={(key) =>
                    commit(revoke(d, key), "Acceptation retirée.")
                  }
                />
              )}
            </div>
            {row && (
              <ResourceEditor
                key={
                  row.key +
                  JSON.stringify(row.source) +
                  JSON.stringify(row.target)
                }
                row={row}
                onSave={(resource) =>
                  commit(
                    saveTarget(d, resource),
                    "Inventaire cible mis à jour. Les écarts ont été recalculés.",
                  )
                }
                onRemove={(key) =>
                  commit(
                    removeTarget(d, key),
                    "Ressource retirée de l’inventaire cible. Action annulable.",
                  )
                }
              />
            )}
          </div>
          <section className="co-exports" id="co-exports">
            <h2>Sorties de livraison</h2>
            <p>
              Les exports conservent les différences, leurs motifs et les
              acceptations à revalider.
            </p>
            <div className="co-actions">
              <button
                className="co-primary"
                onClick={() =>
                  downloadCsv("coelus-ecarts.csv", diffHeaders, diffRows(d))
                }
              >
                Écarts CSV
              </button>
              <button
                onClick={() => downloadJson("coelus-cible.json", d.target)}
              >
                Inventaire cible JSON
              </button>
              <button
                onClick={() => downloadJson("coelus-source.json", d.source)}
              >
                Inventaire source JSON
              </button>
              <button onClick={() => downloadJson("coelus-dossier.json", d)}>
                Dossier JSON
              </button>
              <button onClick={report}>Rapport HTML</button>
            </div>
            <div className="co-restore">
              <FileImport
                label="Restaurer un dossier JSON"
                accept=".json,application/json"
                onFile={(f) => importFile(f, "dossier")}
              />
              <button
                onClick={() => {
                  history.reset();
                  setError("");
                  setNotice("Exemple rétabli. Vous pouvez annuler.");
                }}
              >
                Rétablir l’exemple
              </button>
            </div>
          </section>
          <details className="co-limits">
            <summary>Ce que le rapprochement contrôle</summary>
            <p>
              Clé stable type et identifiant ; tables (nombre de lignes,
              indicateur RLS), buckets (objets, octets, visibilité), fonctions
              (révision), extensions (version), connexions (activation
              déclarée). Les noms sont sensibles à la casse. Le format est
              propre à cet exemple, pas un export natif Supabase.
            </p>
            <p>
              Une acceptation porte sur les attributs exacts de la source et de
              la cible au moment de la décision. Une modification la rend
              caduque, y compris si les deux inventaires deviennent identiques.
              Les comptes, règles RLS, ACL, politiques, fichiers et secrets
              réels ne sont pas inspectés. Aucune certification de migration ni
              de sécurité n’est produite.
            </p>
            <p>
              Pour tester un import, exportez l’un des inventaires ci-dessus.
              Les propriétés inconnues, identifiants dupliqués et champs JSON
              répétés sont refusés.
            </p>
          </details>
          {d.journal.length > 0 && (
            <details className="co-journal">
              <summary>Journal de recette ({d.journal.length})</summary>
              <ol>
                {d.journal.map((entry, i) => (
                  <li key={i}>{entry}</li>
                ))}
              </ol>
            </details>
          )}
          {!history.storageAvailable && (
            <p>
              La sauvegarde locale est indisponible. Exportez votre dossier pour
              le conserver.
            </p>
          )}
        </main>
        <DemoFooter />
      </div>
    </div>
  );
}

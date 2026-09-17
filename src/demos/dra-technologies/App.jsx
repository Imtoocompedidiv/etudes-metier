import React, { useState } from "react";
import "@fontsource/oswald/500.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
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
  downloadText,
  downloadReport,
} from "../../shared/files.js";
import {
  initialDossier,
  dossierMaxBytes,
  headers,
  fields,
  parseTrace,
  parseScenario,
  normalizeDossier,
  validDossier,
  effectiveRows,
  effectiveRules,
  run,
  advance,
  editEvent,
  removeEdit,
  editRules,
  removeRuleEdit,
  replaceTrace,
  replaceRules,
  remember,
  comparison,
  statusLabels,
  numberText,
  resultRows,
  resultHeaders,
  scenarioJson,
  manifest,
  exampleTrace,
} from "./model.js";
import "./styles.css";
const now = () => new Date().toISOString();
const fieldLabels = {
  temps_ms: "Temps (ms)",
  sequence: "Séquence",
  canal: "Canal",
  valeur: "Valeur",
  unite: "Unité",
};
function EventInspector({ d, event, result, onCommit }) {
  const [draft, setDraft] = useState(() =>
      Object.fromEntries(fields.map((f) => [f, event[f]])),
    ),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const original = d.trace.rows.find((r) => r.evenement === event.evenement),
    edit = d.edits.find((e) => e.evenement === event.evenement);
  const submit = (e) => {
    e.preventDefault();
    setError("");
    try {
      const n = editEvent(d, event.evenement, draft, reason, now());
      onCommit(() => n, "Événement corrigé. Relancez le rejeu.");
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <aside className="dra-inspector" aria-label="Événement sélectionné">
      <h2>Événement sélectionné</h2>
      <p className="dra-event-id">
        {event.evenement}{" "}
        <span>
          · ligne{" "}
          {d.trace.rows.findIndex((r) => r.evenement === event.evenement) + 1}
        </span>
      </p>
      <p className={"dra-event-status " + (result?.status || "")}>
        {result ? statusLabels[result.status] : "À rejouer"}
      </p>
      {result && [...result.errors, ...result.notes].length > 0 && (
        <ul className="dra-reasons">
          {[...result.errors, ...result.notes].map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
      <form onSubmit={submit}>
        <div className="dra-event-fields">
          {fields.map((f) => (
            <label key={f}>
              {fieldLabels[f]}
              <input
                value={draft[f]}
                maxLength={100}
                onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
              />
              <small>Importé · {original[f] || "absent"}</small>
            </label>
          ))}
        </div>
        <label>
          Motif de correction
          <textarea
            rows={3}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ce qui a été confirmé dans ce scénario."
          />
        </label>
        <ErrorMessage>{error}</ErrorMessage>
        <button className="dra-primary" type="submit">
          Appliquer la correction
        </button>
        {edit && (
          <>
            <p className="dra-note">Correction actuelle · {edit.reason}</p>
            <button
              type="button"
              onClick={() =>
                onCommit(
                  () => removeEdit(d, event.evenement, now()),
                  "Valeur importée restaurée. Relancez le rejeu.",
                )
              }
            >
              Retirer la correction
            </button>
          </>
        )}
      </form>
      <p className="dra-note">
        Les valeurs importées restent conservées. Toute correction remet le
        rejeu à zéro.
      </p>
    </aside>
  );
}
function RulesPanel({ d, onCommit, onUpload, onExport }) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(() =>
      effectiveRules(d).map((r) => ({ ...r })),
    ),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const begin = () => {
    setDraft(effectiveRules(d).map((r) => ({ ...r })));
    setReason("");
    setError("");
    setEditing(true);
  };
  const save = (e) => {
    e.preventDefault();
    setError("");
    try {
      const n = editRules(d, draft, reason, now());
      onCommit(() => n, "Règles modifiées. Relancez le rejeu.");
      setEditing(false);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <aside className="dra-rules" aria-label="Scénario fictif">
      <h2>Scénario fictif</h2>
      <p>Canaux et intervalles de recette, sans validité métrologique.</p>
      <p className="dra-note">{d.scenario.name}</p>
      {editing ? (
        <form onSubmit={save}>
          <div className="dra-rule-forms">
            {draft.map((r, i) => (
              <fieldset key={i}>
                <legend>Canal {i + 1}</legend>
                <label>
                  Nom du canal
                  <input
                    value={r.canal}
                    maxLength={50}
                    onChange={(e) =>
                      setDraft(
                        draft.map((x, j) =>
                          j === i ? { ...x, canal: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Unité attendue
                  <input
                    value={r.unite}
                    maxLength={20}
                    onChange={(e) =>
                      setDraft(
                        draft.map((x, j) =>
                          j === i ? { ...x, unite: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <div className="dra-rule-range">
                  {["min", "max"].map((f) => (
                    <label key={f}>
                      {f === "min" ? "Minimum" : "Maximum"}
                      <input
                        value={r[f]}
                        maxLength={30}
                        onChange={(e) =>
                          setDraft(
                            draft.map((x, j) =>
                              j === i ? { ...x, [f]: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                >
                  Retirer ce canal
                </button>
              </fieldset>
            ))}
          </div>
          <button
            type="button"
            disabled={draft.length >= 20}
            onClick={() =>
              setDraft([...draft, { canal: "", unite: "", min: "", max: "" }])
            }
          >
            Ajouter un canal
          </button>
          <label>
            Motif de modification des règles
            <textarea
              rows={3}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <ErrorMessage>{error}</ErrorMessage>
          <button className="dra-primary" type="submit">
            Appliquer les règles
          </button>
          <button type="button" onClick={() => setEditing(false)}>
            Abandonner les modifications
          </button>
        </form>
      ) : (
        <>
          <div className="dra-rule-list">
            {effectiveRules(d).map((r) => (
              <section key={r.canal}>
                <h3>
                  {r.canal}
                  <span>{r.unite}</span>
                </h3>
                <p>
                  {r.min} à {r.max}
                </p>
              </section>
            ))}
          </div>
          <button onClick={begin}>Modifier les règles</button>
        </>
      )}
      {d.ruleEdit && (
        <>
          <p className="dra-note">{d.ruleEdit.reason}</p>
          <button
            onClick={() => {
              onCommit(
                () => removeRuleEdit(d, now()),
                "Règles importées restaurées. Relancez le rejeu.",
              );
              setEditing(false);
            }}
          >
            Retirer la correction des règles
          </button>
        </>
      )}
      <div className="dra-rule-import">
        <FileImport
          label="Importer les règles JSON"
          accept=".json,application/json"
          onFile={(f) => onUpload(f, "rules")}
        />
        <button onClick={onExport}>Exporter les règles JSON</button>
      </div>
      <details>
        <summary>Règles de rejeu</summary>
        <p>
          L’ordre du fichier est conservé. Une retransmission identique est
          ignorée. Une séquence contradictoire est rejetée.
        </p>
        <p>
          Un horodatage valide fait avancer l’horloge observée, même si la
          valeur est rejetée. Aucun paquet plus ancien n’est réordonné
          automatiquement.
        </p>
        <p>
          Seules les valeurs acceptées changent l’état du canal. L’unité doit
          correspondre exactement, sans conversion.
        </p>
      </details>
    </aside>
  );
}
function Results({ d, r, delta, onCommit }) {
  return (
    <section className="dra-results">
      <div className="dra-current">
        <h2>
          État après {r.cursor} événement{r.cursor > 1 ? "s" : ""}
        </h2>
        <p className="dra-note">
          Dernière valeur acceptée par canal dans ce scénario fictif.
        </p>
        <div
          className="dra-scroll"
          role="region"
          aria-label="État des canaux, tableau défilant"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Canal</th>
                <th>Valeur</th>
                <th>Unité</th>
                <th>Événement</th>
              </tr>
            </thead>
            <tbody>
              {r.states.map((s) => (
                <tr key={s.canal}>
                  <th>{s.canal}</th>
                  <td>{numberText(s.valeur)}</td>
                  <td>{s.unite}</td>
                  <td>{s.evenement || "Aucun"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          {r.accepted} accepté{r.accepted > 1 ? "s" : ""} · {r.rejected} rejeté
          {r.rejected > 1 ? "s" : ""} · {r.duplicates} doublon
          {r.duplicates > 1 ? "s" : ""} ignoré{r.duplicates > 1 ? "s" : ""}
        </p>
      </div>
      <div className="dra-reference">
        <h2>Comparaison à la référence</h2>
        {!delta ? (
          <p>
            Aucune référence enregistrée. Terminez le rejeu puis mémorisez ce
            résultat pour comparer une correction.
          </p>
        ) : (
          <>
            <p className="dra-note">
              Référence du {new Date(d.reference.at).toLocaleString("fr-FR")} ·{" "}
              {d.reference.rows.length} événements
            </p>
            {delta.pending ? (
              <p className="dra-await">
                Rejouez toute la trace courante pour comparer. La référence
                reste conservée.
              </p>
            ) : (
              <>
                <p>
                  {delta.changes.length} événement
                  {delta.changes.length > 1 ? "s" : ""} différent
                  {delta.changes.length > 1 ? "s" : ""}.{" "}
                  {delta.rulesChanged
                    ? "Les règles ont également changé."
                    : "Règles identiques."}
                </p>
                {delta.changes.length > 0 && (
                  <div
                    className="dra-scroll"
                    role="region"
                    aria-label="Écarts à la référence, tableau défilant"
                    tabIndex={0}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Événement</th>
                          <th>Référence</th>
                          <th>Rejeu courant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {delta.changes.map((c) => (
                          <tr key={c.evenement}>
                            <th>{c.evenement}</th>
                            <td>{c.avant}</td>
                            <td>
                              {c.apres}
                              <small>{c.detail}</small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="dra-note">
                  Correspondance par identifiant événement, avec données,
                  résultat et motifs. Les règles et la trace de référence
                  restent dans le dossier.
                </p>
              </>
            )}
          </>
        )}
        <button
          disabled={!r.complete}
          onClick={() =>
            onCommit(
              () => remember(d, now()),
              "Référence mémorisée avec sa trace et ses règles.",
            )
          }
        >
          {d.reference ? "Remplacer la référence" : "Mémoriser ce résultat"}
        </button>
        {!r.complete && (
          <p className="dra-note">Disponible après le rejeu complet.</p>
        )}
      </div>
    </section>
  );
}
export default function App() {
  useDocumentTitle("DRA Technologies · Rejouer une trace de mesure");
  const history = useHistory(initialDossier, {
      key: "dra-technologies:v1",
      validate: validDossier,
    }),
    d = history.value,
    rows = effectiveRows(d),
    r = run(d),
    delta = comparison(d);
  const [selected, setSelected] = useState("EV-04"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState(null);
  const event = rows.find((x) => x.evenement === selected) || rows[0],
    byId = new Map(r.results.map((x) => [x.evenement, x])),
    visible = rows.filter(
      (x) =>
        (filter === "all" ||
          (filter === "pending" && !byId.has(x.evenement)) ||
          (filter === "rejected" &&
            byId.get(x.evenement)?.status === "rejete")) &&
        `${x.evenement} ${x.canal} ${x.sequence}`
          .toLocaleLowerCase("fr")
          .includes(search.trim().toLocaleLowerCase("fr")),
    );
  const commit = (fn, message) => {
    setError("");
    try {
      history.set(normalizeDossier(fn()));
      setNotice(message);
    } catch (err) {
      setError(err.message);
    }
  };
  const upload = async (file, kind) => {
    setError("");
    setNotice("");
    setPreview(null);
    try {
      const raw = await readLocalFile(
        file,
        kind === "dossier" ? { maxBytes: dossierMaxBytes } : undefined,
      );
      const value =
        kind === "trace"
          ? parseTrace(raw)
          : kind === "rules"
            ? parseScenario(raw)
            : normalizeDossier(JSON.parse(raw));
      setPreview({ kind, name: file.name, value });
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? "JSON invalide. Le dossier actuel est conservé."
          : err.message,
      );
    }
  };
  const accept = () => {
    const p = preview;
    commit(
      () =>
        p.kind === "trace"
          ? replaceTrace(d, p.value, p.name, now())
          : p.kind === "rules"
            ? replaceRules(d, p.value, p.name, now())
            : p.value,
      p.kind === "dossier"
        ? "Dossier restauré."
        : "Import effectué. Les règles de conservation sont appliquées.",
    );
    setPreview(null);
  };
  const exportFile = (type) => {
    if (type === "results") {
      downloadCsv("dra-resultats.csv", resultHeaders, resultRows(d));
      setNotice(
        `${r.cursor} événements traités exportés. ${r.complete ? "Rejeu complet." : "Rejeu partiel."}`,
      );
    }
    if (type === "trace") {
      downloadCsv("dra-trace-courante.csv", headers, rows);
      setNotice(
        "Trace courante téléchargée. Les valeurs importées restent dans le dossier.",
      );
    }
    if (type === "rules") {
      downloadJson("dra-scenario.json", scenarioJson(d));
      setNotice("Règles courantes téléchargées.");
    }
    if (type === "dossier") {
      downloadJson("dra-dossier.json", d);
      setNotice("Dossier sauvegardé.");
    }
    if (type === "manifest") {
      downloadJson("dra-recette.json", manifest(d));
      setNotice("Manifeste de recette téléchargé.");
    }
    if (type === "report") {
      downloadReport("dra-rejeu.html", {
        title: "DRA Technologies · rejeu de mesures fictives",
        subtitle: `Étude indépendante hors matériel. ${r.cursor} / ${r.total} événements traités. Aucune validité métrologique.`,
        sections: [
          {
            title: "Résultats du rejeu courant",
            headers: resultHeaders,
            rows: resultRows(d).map((x) => resultHeaders.map((h) => x[h])),
          },
          {
            title: "Règles courantes fictives",
            headers: ["Canal", "Unité", "Minimum", "Maximum"],
            rows: effectiveRules(d).map((x) => [
              x.canal,
              x.unite,
              x.min,
              x.max,
            ]),
          },
          {
            title: "Comparaison",
            paragraphs: [
              !delta
                ? "Aucune référence."
                : delta.pending
                  ? "Comparaison non disponible tant que le rejeu courant est incomplet."
                  : `${delta.changes.length} événements différents. Règles ${delta.rulesChanged ? "modifiées" : "identiques"}.`,
            ],
            headers: ["Événement", "Avant", "Après", "Détail"],
            rows: delta?.pending
              ? []
              : (delta?.changes || []).map((x) => [
                  x.evenement,
                  x.avant,
                  x.apres,
                  x.detail,
                ]),
          },
          {
            title: "Trace importée",
            headers,
            rows: d.trace.rows.map((x) => headers.map((h) => x[h])),
          },
          {
            title: "Corrections des événements",
            headers: ["Événement", "Valeurs corrigées", "Motif"],
            rows: d.edits.map((x) => [
              x.evenement,
              fields
                .map((f) => `${fieldLabels[f]} = ${x.values[f] || "absent"}`)
                .join(" ; "),
              x.reason,
            ]),
          },
          {
            title: "Correction des règles",
            paragraphs: [d.ruleEdit?.reason || "Aucune"],
          },
          {
            title: "Journal",
            headers: ["Date UTC", "Action"],
            rows: d.journal.map((x) => [x.at, x.action]),
          },
        ],
      });
      setNotice("Rapport HTML téléchargé.");
    }
  };
  return (
    <main className="dra-app">
      <header className="dra-top">
        <strong>
          DRA Technologies <span>· étude indépendante</span>
        </strong>
        <p>Trace fictive · aucun matériel connecté</p>
      </header>
      <div className="dra-heading">
        <h1>Rejouer une trace de mesure</h1>
        <p>
          Avancez dans la trace, corrigez un événement puis comparez le rejeu.
        </p>
      </div>
      {(error || notice || preview) && (
        <div className="dra-feedback">
          <ErrorMessage>{error}</ErrorMessage>
          {notice && (
            <p className="dra-notice" role="status">
              {notice}
            </p>
          )}
          {preview && (
            <section aria-label="Aperçu avant import">
              <h2>
                {preview.kind === "dossier"
                  ? "Restaurer le dossier"
                  : "Remplacer " +
                    (preview.kind === "trace" ? "la trace" : "les règles")}
              </h2>
              <p>
                {preview.name} ·{" "}
                {preview.kind === "dossier"
                  ? `${preview.value.trace.rows.length} événements, ${preview.value.edits.length} corrections, ${preview.value.cursor} traités`
                  : preview.value.length +
                    " " +
                    (preview.kind === "trace" ? "événements" : "canaux")}
              </p>
              <p>
                Un fichier identique conserve les corrections et le rejeu. Un
                fichier différent retire les corrections de cette source et
                remet le rejeu à zéro. La référence reste conservée. Une
                restauration JSON reprend tout le dossier. Ces actions sont
                annulables.
              </p>
              {preview.kind === "trace" && (
                <div
                  className="dra-scroll"
                  role="region"
                  aria-label="Aperçu de la trace importée"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        {headers.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.value.slice(0, 4).map((x) => (
                        <tr key={x.evenement}>
                          {headers.map((h) => (
                            <td key={h}>{x[h] || "absent"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="dra-inline">
                <button className="dra-primary" onClick={accept}>
                  Confirmer l’import
                </button>
                <button onClick={() => setPreview(null)}>
                  Abandonner l’import
                </button>
              </div>
            </section>
          )}
        </div>
      )}
      <div className="dra-workbench">
        <section className="dra-trace">
          <h2>Trace de mesure</h2>
          <div className="dra-run-controls">
            <FileImport
              label="Importer la trace CSV"
              accept=".csv,text/csv"
              onFile={(f) => upload(f, "trace")}
            />
            <button
              disabled={r.complete}
              onClick={() =>
                commit(
                  () => advance(d, "step", now()),
                  "Événement suivant traité.",
                )
              }
            >
              Pas suivant
            </button>
            <button
              className="dra-primary"
              disabled={r.complete}
              onClick={() =>
                commit(
                  () => advance(d, "all", now()),
                  "Trace entière rejouée dans l’ordre du fichier.",
                )
              }
            >
              Rejouer tout
            </button>
            <button
              disabled={!r.cursor}
              onClick={() =>
                commit(
                  () => advance(d, "reset", now()),
                  "Rejeu remis au début.",
                )
              }
            >
              Revenir au début
            </button>
          </div>
          <div className="dra-progress">
            <span>
              Événements traités · {r.cursor} / {r.total}
            </span>
            <progress
              value={r.cursor}
              max={r.total}
              aria-label="Progression du rejeu"
            />
          </div>
          <div className="dra-trace-filter">
            <label>
              Rechercher
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Événement, canal ou séquence"
              />
            </label>
            <label>
              Afficher
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Tous les événements</option>
                <option value="rejected">Rejetés par le scénario</option>
                <option value="pending">À rejouer</option>
              </select>
            </label>
          </div>
          <div
            className="dra-scroll"
            role="region"
            aria-label="Trace et résultats, tableau défilant"
            tabIndex={0}
          >
            <table className="dra-trace-table">
              <thead>
                <tr>
                  <th>Événement</th>
                  <th>Temps (ms)</th>
                  <th>Séquence</th>
                  <th>Canal</th>
                  <th>Valeur</th>
                  <th>Unité</th>
                  <th>Résultat</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((x) => (
                  <tr
                    key={x.evenement}
                    className={
                      x.evenement === event.evenement ? "dra-selected" : ""
                    }
                  >
                    <th>
                      <button
                        aria-pressed={x.evenement === event.evenement}
                        onClick={() => setSelected(x.evenement)}
                      >
                        {x.evenement}
                      </button>
                    </th>
                    <td>{x.temps_ms || "absent"}</td>
                    <td>{x.sequence || "absente"}</td>
                    <td>{x.canal || "absent"}</td>
                    <td>{x.valeur || "absente"}</td>
                    <td>{x.unite || "absente"}</td>
                    <td>
                      <span
                        className={
                          "dra-status " + (byId.get(x.evenement)?.status || "")
                        }
                      >
                        {byId.has(x.evenement)
                          ? statusLabels[byId.get(x.evenement).status]
                          : "À rejouer"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && <p>Aucun événement pour ce filtre.</p>}
          </div>
          <p className="dra-note">
            {d.trace.name} · {visible.length} événements affichés. Sélectionnez
            un identifiant pour examiner et corriger la ligne.
          </p>
        </section>
        <EventInspector
          key={JSON.stringify([
            event,
            d.edits.find((x) => x.evenement === event.evenement),
          ])}
          d={d}
          event={event}
          result={byId.get(event.evenement)}
          onCommit={commit}
        />
        <RulesPanel
          key={JSON.stringify([d.scenario, d.ruleEdit])}
          d={d}
          onCommit={commit}
          onUpload={upload}
          onExport={() => exportFile("rules")}
        />
        <Results d={d} r={r} delta={delta} onCommit={commit} />
      </div>
      <div className="dra-bottom">
        <details>
          <summary>Journal des actions ({d.journal.length})</summary>
          {d.journal.length ? (
            <ol className="dra-journal">
              {d.journal
                .slice()
                .reverse()
                .map((j, i) => (
                  <li key={i}>
                    <time>{new Date(j.at).toLocaleString("fr-FR")}</time>
                    <span>{j.action}</span>
                  </li>
                ))}
            </ol>
          ) : (
            <p>Aucune action pour le moment.</p>
          )}
        </details>
        <details>
          <summary>Formats et exemples à importer</summary>
          <p>
            CSV de 1 à 500 événements, colonnes {headers.join(", ")}.
            Identifiant événement unique et stable, séquence répétée autorisée
            pour les essais. Temps entier de 0 à 604 800 000 ms ; valeurs
            signées jusqu’à 6 chiffres avant et après la virgule. Limites de
            saisie propres à la démonstration.
          </p>
          <p>
            Scénario JSON « dra-scenario-fictif-v1 », tableau canaux avec canal,
            unite, min et max. De 1 à 20 canaux distincts. Chaque intervalle est
            inclusif. Les deux exemples ci-dessous correspondent au dossier
            initial.
          </p>
          <div className="dra-inline">
            <button
              onClick={() => {
                downloadText(
                  "dra-exemple-trace.csv",
                  exampleTrace(),
                  "text/csv;charset=utf-8",
                );
                setNotice("Exemple de trace téléchargé.");
              }}
            >
              Exemple trace CSV
            </button>
            <button
              onClick={() => {
                downloadJson(
                  "dra-exemple-scenario.json",
                  scenarioJson(initialDossier),
                );
                setNotice("Exemple de règles téléchargé.");
              }}
            >
              Exemple règles JSON
            </button>
          </div>
        </details>
      </div>
      <footer className="dra-toolbar">
        <div className="dra-inline">
          <button
            disabled={!history.canUndo}
            onClick={() => {
              history.undo();
              setPreview(null);
              setError("");
              setNotice("Action annulée.");
            }}
          >
            Annuler
          </button>
          <button
            disabled={!history.canRedo}
            onClick={() => {
              history.redo();
              setPreview(null);
              setError("");
              setNotice("Action rétablie.");
            }}
          >
            Rétablir
          </button>
          <button disabled={!r.cursor} onClick={() => exportFile("results")}>
            Résultats CSV
          </button>
          <button onClick={() => exportFile("trace")}>
            Trace courante CSV
          </button>
          <button onClick={() => exportFile("manifest")}>Manifeste JSON</button>
          <button onClick={() => exportFile("report")}>Rapport HTML</button>
          <button onClick={() => exportFile("dossier")}>
            Sauvegarder le dossier
          </button>
          <FileImport
            label="Restaurer JSON"
            accept=".json,application/json"
            onFile={(f) => upload(f, "dossier")}
          />
          <button
            onClick={() => {
              history.reset();
              setSelected("EV-04");
              setSearch("");
              setFilter("all");
              setPreview(null);
              setError("");
              setNotice("Exemple réinitialisé. Action annulable.");
            }}
          >
            Réinitialiser l’exemple
          </button>
        </div>
        <p>
          Calcul local et déterministe. Dossier conservé dans ce navigateur ;
          annulation disponible pendant la session. Aucun échange avec un
          appareil, aucune mesure réelle.
        </p>
        {!history.storageAvailable && (
          <p>
            Stockage local indisponible. Sauvegardez le JSON avant de quitter.
          </p>
        )}
      </footer>
      <DemoFooter />
    </main>
  );
}

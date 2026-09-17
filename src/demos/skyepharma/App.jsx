import { useState } from "react";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";

import { useHistory } from "../../shared/state.js";
import {
  FileImport,
  DemoFooter,
  ErrorMessage,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadJson,
  downloadCsv,
  downloadReport,
} from "../../shared/files.js";
import {
  initial,
  sources,
  states,
  resultLabels,
  analyze,
  parseLot,
  planningExample,
  demandesExample,
  addLot,
  setRule,
  correctEvent,
  removeCorrection,
  resolveCollision,
  reopenCollision,
  replay,
  isStale,
  changes,
  normalizeDossier,
  validDossier,
} from "./model.js";
import "./styles.css";
const fieldLabels = {
  eventId: "Identifiant événement",
  actionId: "Identifiant action",
  revision: "Révision",
  updatedAt: "Horodatage UTC",
  title: "Intitulé",
  owner: "Responsable",
  due: "Échéance",
  rawStatus: "Statut source",
};
const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const dateLabel = (v) => v?.split("-").reverse().join("/") || "";
const resultClass = (code) =>
  ["collision", "invalid", "conflict"].includes(code)
    ? "danger"
    : ["unknown", "blocked"].includes(code)
      ? "warning"
      : code === "accepted"
        ? "good"
        : "quiet";
function Status({ code }) {
  return (
    <span className={`sky-status sky-${resultClass(code)}`}>
      {resultLabels[code]}
    </span>
  );
}
function EventEditor({ row, d, commit }) {
  const [values, setValues] = useState(
    Object.fromEntries(Object.keys(fieldLabels).map((k) => [k, row.event[k]])),
  );
  const [reason, setReason] = useState(row.edit?.reason || "");
  const [error, setError] = useState("");
  const [mapped, setMapped] = useState(
    d.rules.find(
      (r) =>
        r.source === row.event.source && r.rawStatus === row.event.rawStatus,
    )?.state || "waiting",
  );
  const current = d.rules.find(
    (r) => r.source === row.event.source && r.rawStatus === row.event.rawStatus,
  );
  const collision = analyze(d).collisions.find((c) => c.keys.includes(row.key));
  const save = (e) => {
    e.preventDefault();
    try {
      commit(
        correctEvent(d, row.key, values, reason),
        `Correction ${row.key} : ${reason}`,
      );
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <aside className="sky-inspector" aria-label="Détail de l’événement">
      <h2>Détail de l’événement</h2>
      <p className="sky-code">
        {sources[row.event.source]} / {row.event.eventId || "Sans identifiant"}
        <br />
        {row.key} · {row.batchName}
      </p>
      <Status code={row.code} />
      <p className="sky-explanation">
        {row.message ||
          "Événement admissible. La révision détermine l’état retenu, pas l’ordre d’arrivée."}
      </p>
      <details className="sky-source" open>
        <summary>Valeurs source importées</summary>
        <pre>{JSON.stringify(row.raw, null, 2)}</pre>
      </details>
      {row.event.rawStatus && (
        <section className="sky-rule">
          <h3>Associer ce statut</h3>
          <label>
            « {row.event.rawStatus} »
            <select value={mapped} onChange={(e) => setMapped(e.target.value)}>
              {Object.entries(states).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <p>
            Règle pour la source {sources[row.event.source]} uniquement. L’autre
            source reste indépendante.
          </p>
          <button
            className="sky-primary"
            disabled={current?.state === mapped}
            onClick={() =>
              commit(
                () => setRule(d, row.event.source, row.event.rawStatus, mapped),
                `Règle ${sources[row.event.source]} : ${row.event.rawStatus} → ${states[mapped]}`,
              )
            }
          >
            Enregistrer la règle
          </button>
        </section>
      )}
      {collision && (
        <section className="sky-collision">
          <h3>Deux contenus, une clé</h3>
          <p>
            Conserver cette version écarte explicitement les autres contenus de
            la même clé. Le choix reste réversible.
          </p>
          <button
            onClick={() =>
              commit(
                resolveCollision(d, row.key),
                `Collision ${sources[row.event.source]}/${row.event.eventId} : version ${row.key} conservée`,
              )
            }
          >
            Conserver cette version
          </button>
          {collision.decision && (
            <>
              <p>Décision actuelle : {collision.decision.keep}.</p>
              <button
                onClick={() =>
                  commit(
                    reopenCollision(d, collision.source, collision.eventId),
                    `Collision ${collision.eventId} remise à examiner`,
                  )
                }
              >
                Réexaminer la collision
              </button>
            </>
          )}
        </section>
      )}
      <details className="sky-edit">
        <summary>Corriger les données de cet événement</summary>
        <form onSubmit={save}>
          {Object.entries(fieldLabels).map(([k, label]) => (
            <label key={k}>
              {label}
              <input
                value={values[k]}
                onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                maxLength={k === "title" ? 300 : 100}
              />
            </label>
          ))}
          <label>
            Motif de la correction
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              rows={2}
            />
          </label>
          <p>
            Les valeurs reçues restent conservées. Corrigez seulement avec une
            information confirmée.
          </p>
          <ErrorMessage>{error}</ErrorMessage>
          <button className="sky-primary" type="submit">
            Enregistrer la correction
          </button>
        </form>
        {row.edit && (
          <button
            onClick={() =>
              commit(
                removeCorrection(d, row.key),
                `Correction ${row.key} retirée`,
              )
            }
          >
            Revenir aux valeurs source
          </button>
        )}
      </details>
    </aside>
  );
}
function CurrentActions({ d, result, commit, feedback }) {
  const current = d.lastRun ? analyze(d.lastRun.basis) : null;
  const before = d.previousRun ? analyze(d.previousRun.basis).actions : [];
  const delta = current ? changes(before, current.actions) : [];
  const stale = isStale(d);
  const headers = [
    "source",
    "action",
    "intitule",
    "responsable",
    "echeance",
    "statut",
    "revision",
    "evenement",
    "provenance",
  ];
  const exportRows =
    current?.actions.map((a) => [
      sources[a.source],
      a.actionId,
      a.title,
      a.owner,
      a.due,
      states[a.state],
      a.revision,
      a.eventId,
      a.rowKey,
    ]) || [];
  const exportActions = () => {
    downloadCsv("skyepharma-actions.csv", headers, exportRows);
    feedback("CSV des actions retenues téléchargé.");
  };
  const exportPending = () => {
    downloadCsv(
      "skyepharma-evenements-a-revoir.csv",
      [
        "provenance",
        "source",
        "evenement",
        "action",
        "revision",
        "resultat",
        "explication",
      ],
      current.pending.map((r) => [
        r.key,
        sources[r.event.source],
        r.event.eventId,
        r.event.actionId,
        r.event.revision,
        resultLabels[r.code],
        r.message,
      ]),
    );
    feedback("CSV des événements à revoir téléchargé.");
  };
  const report = () => {
    downloadReport("skyepharma-reprise.html", {
      title: "Reprise du flux administratif",
      subtitle: `Étude indépendante Skyepharma. Données fictives de réaménagement de salles. Traitement du ${d.lastRun.at}. Aucune API connectée.`,
      sections: [
        { title: "Actions retenues", headers, rows: exportRows },
        {
          title: "Événements à revoir",
          paragraphs: [
            "Une action dont une version récente reste ambiguë est absente des actions retenues. Ce rapport ne vaut pas validation métier.",
          ],
          headers: [
            "Source",
            "Événement",
            "Révision",
            "Résultat",
            "Explication",
          ],
          rows: current.pending.map((r) => [
            sources[r.event.source],
            r.event.eventId,
            r.event.revision,
            resultLabels[r.code],
            r.message,
          ]),
        },
        {
          title: "Écarts depuis le rejeu précédent",
          headers: ["Source", "Action", "Changement", "Avant", "Après"],
          rows: delta.map((c) => [
            sources[c.source],
            c.actionId,
            c.kind,
            c.before
              ? `${states[c.before.state]} · r${c.before.revision}`
              : "Absent",
            c.after
              ? `${states[c.after.state]} · r${c.after.revision}`
              : "Absent",
          ]),
        },
        {
          title: "Règles de statut",
          headers: ["Source", "Valeur reçue", "État métier"],
          rows: d.rules.map((r) => [
            sources[r.source],
            r.rawStatus,
            states[r.state],
          ]),
        },
        {
          title: "Journal",
          headers: ["Heure", "Action"],
          rows: d.journal.map((j) => [j.at, j.action]),
        },
      ],
    });
    feedback("Rapport HTML imprimable téléchargé.");
  };
  return (
    <section className="sky-current" aria-labelledby="sky-current-title">
      <div className="sky-current-head">
        <div>
          <h2 id="sky-current-title">État courant des actions</h2>
          <p>
            {!current
              ? "Lancez le premier rejeu pour préparer la synthèse."
              : stale
                ? "Des entrées ont changé. Rejouez avant d’exporter."
                : `Dernier rejeu ${new Date(d.lastRun.at).toLocaleTimeString("fr-FR")} · ${current.actions.length} actions retenues.`}
          </p>
        </div>
        <button
          className="sky-primary"
          onClick={() => {
            commit(
              replay(d, stamp()),
              `Rejeu local : ${result.actions.length} actions retenues, ${result.pending.length} événements à revoir`,
            );
            feedback("Rejeu terminé. Synthèse et écarts recalculés.");
          }}
        >
          Rejouer la file
        </button>
      </div>
      {current ? (
        <>
          <div
            className="sky-table-scroll"
            tabIndex={0}
            aria-label="Actions retenues, tableau défilant"
          >
            <table>
              <thead>
                <tr>
                  {[
                    "Action",
                    "Source",
                    "Responsable",
                    "Échéance",
                    "État métier",
                    "Révision",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {current.actions.map((a) => (
                  <tr key={`${a.source}:${a.actionId}`}>
                    <td>
                      <strong>{a.actionId}</strong>
                      <span>{a.title}</span>
                    </td>
                    <td>
                      {sources[a.source]}
                      <small>
                        {a.eventId} · {a.rowKey}
                      </small>
                    </td>
                    <td>{a.owner}</td>
                    <td>{dateLabel(a.due)}</td>
                    <td>{states[a.state]}</td>
                    <td>{a.revision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!current.actions.length && (
              <p className="sky-empty">
                Aucune action admissible. Corrigez les événements signalés.
              </p>
            )}
          </div>
          <div className="sky-export">
            <p>
              {current.pending.length} événements à revoir. Le CSV des actions
              contient uniquement les lignes retenues ; les exceptions ont leur
              propre fichier.
            </p>
            <div>
              <button disabled={stale} onClick={exportActions}>
                CSV des actions
              </button>
              <button disabled={stale} onClick={exportPending}>
                CSV des exceptions
              </button>
              <button disabled={stale} onClick={report}>
                Rapport HTML
              </button>
            </div>
          </div>
          <details className="sky-delta" open>
            <summary>
              Changements depuis le rejeu précédent ({delta.length})
            </summary>
            {delta.length ? (
              <ul>
                {delta.map((c) => (
                  <li key={`${c.source}:${c.actionId}`}>
                    <strong>
                      {sources[c.source]} / {c.actionId}
                    </strong>{" "}
                    · {c.kind}
                    <span>
                      {c.before
                        ? `${states[c.before.state]} · révision ${c.before.revision}`
                        : "Absente"}{" "}
                      →{" "}
                      {c.after
                        ? `${states[c.after.state]} · révision ${c.after.revision}`
                        : "Absente"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Aucun changement d’action. Un import identique reste sans effet
                métier.
              </p>
            )}
          </details>
        </>
      ) : (
        <p className="sky-empty">
          La file contient des exemples. Aucune synthèse n’a encore été validée
          par un clic sur « Rejouer la file ».
        </p>
      )}
    </section>
  );
}
export default function App() {
  useDocumentTitle("Skyepharma · Reprise de flux administratif");
  const history = useHistory(initial, {
    key: "skyepharma:v1",
    validate: validDossier,
  });
  const d = history.value;
  const [batch, setBatch] = useState("B0001"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState("B0001:2");
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(null),
    [epoch, setEpoch] = useState(0);
  const result = analyze(d),
    rows = result.rows.filter(
      (r) =>
        (batch === "all" || r.batchId === batch) &&
        (filter === "all" ||
          (filter === "pending" && result.pending.includes(r)) ||
          r.code === filter) &&
        `${sources[r.event.source]} ${r.event.eventId} ${r.event.actionId} ${r.event.title} ${r.key}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  const row = result.rows.find((r) => r.key === selected) || result.rows[0];
  const commit = (change, action) => {
    try {
      const next = typeof change === "function" ? change() : change;
      next.journal = [...next.journal, { at: stamp(), action }].slice(-500);
      history.set(normalizeDossier(next));
      setError("");
      setNotice(action);
    } catch (e) {
      setError(e.message);
    }
  };
  const load = async (file, mode) => {
    setPending(null);
    const value = JSON.parse(await readLocalFile(file));
    const data = mode === "lot" ? parseLot(value) : normalizeDossier(value);
    setPending({ mode, data, name: file.name });
    setError("");
  };
  const accept = () => {
    if (pending.mode === "lot") {
      commit(() => addLot(d, pending.data), `Lot importé : ${pending.name}`);
    } else {
      history.set(pending.data);
      setSelected("");
      setBatch("all");
      setQuery("");
      setFilter("all");
      setNotice("Dossier restauré, avec ses règles et son dernier rejeu.");
    }
    setPending(null);
    setEpoch(epoch + 1);
  };
  const browseEvent = (k) => {
    setSelected(k);
    setBatch("all");
    setFilter("all");
    setQuery("");
  };
  return (
    <div className="sky-app">
      <header className="sky-header">
        <span>
          <strong>Skyepharma</strong> · étude indépendante
        </span>
        <span>Données fictives · traitement local</span>
      </header>
      <main className="sky-main">
        <section className="sky-title">
          <div>
            <h1>Reprendre un flux administratif</h1>
            <p>
              Associez le statut « attente fournisseur », puis rejouez les
              événements.
            </p>
          </div>
          <div className="sky-toolbar">
            <FileImport
              key={`lot${epoch}`}
              label="Importer un lot JSON"
              accept=".json,application/json"
              onFile={(f) => load(f, "lot")}
            />
            <button
              disabled={!history.canUndo}
              onClick={() => {
                history.undo();
                setNotice("Dernière action annulée.");
              }}
            >
              Annuler
            </button>
            <button
              disabled={!history.canRedo}
              onClick={() => {
                history.redo();
                setNotice("Action rétablie.");
              }}
            >
              Rétablir
            </button>
            <button
              onClick={() => {
                downloadJson("skyepharma-dossier.json", d);
                setNotice("Dossier JSON téléchargé.");
              }}
            >
              Sauvegarder
            </button>
          </div>
        </section>
        <div className="sky-messages">
          <p role="status">{notice}</p>
          <ErrorMessage>{error}</ErrorMessage>
          {!history.storageAvailable && (
            <p>
              Stockage local indisponible. Sauvegardez le dossier avant de
              quitter.
            </p>
          )}
        </div>
        {pending && (
          <section className="sky-import" aria-label="Aperçu avant import">
            <h2>
              {pending.mode === "lot"
                ? "Lot prêt à ajouter"
                : "Dossier prêt à restaurer"}
            </h2>
            <p>
              {pending.name} ·{" "}
              {pending.mode === "lot"
                ? `${sources[pending.data.source]}, ${pending.data.rows.length} événements. Le rejeu contrôlera les valeurs métier.`
                : `${pending.data.batches.length} lots. Remplace le dossier courant ; annulation disponible.`}
            </p>
            <div>
              <button className="sky-primary" onClick={accept}>
                Confirmer l’import
              </button>
              <button onClick={() => setPending(null)}>
                Abandonner l’import
              </button>
            </div>
          </section>
        )}
        <div className="sky-workbench">
          <aside className="sky-lots">
            <h2>Lots reçus</h2>
            <button
              className={batch === "all" ? "sky-active" : ""}
              onClick={() => setBatch("all")}
            >
              Tous les lots <span>{d.batches.length}</span>
            </button>
            {d.batches.map((b) => (
              <button
                key={b.id}
                className={batch === b.id ? "sky-active" : ""}
                onClick={() => {
                  setBatch(b.id);
                  const first = result.rows.find((r) => r.batchId === b.id);
                  if (first) setSelected(first.key);
                }}
              >
                <strong>{sources[b.source]}</strong>
                <span>{b.rows.length} événements</span>
                <small>
                  {b.id} · {b.name}
                </small>
              </button>
            ))}
            <details className="sky-examples">
              <summary>Exemples et formats</summary>
              <p>
                Deux adaptateurs locaux, sans appel distant. Les révisions sont
                des entiers ; les dates sont ISO et les horodatages en UTC.
              </p>
              <button
                onClick={() =>
                  downloadJson("planning-exemple.json", planningExample)
                }
              >
                Exemple Planning
              </button>
              <button
                onClick={() =>
                  downloadJson("demandes-exemple.json", demandesExample)
                }
              >
                Exemple Demandes
              </button>
              <button
                onClick={() =>
                  commit(
                    () => addLot(d, parseLot(planningExample)),
                    "Lot Planning réimporté pour tester les doublons",
                  )
                }
              >
                Réimporter le lot Planning
              </button>
              <details>
                <summary>Champs attendus</summary>
                <p>
                  <b>planning-v1</b> : batch, events[] contenant id, action,
                  revision, updatedAt, title, owner, due, status.
                </p>
                <p>
                  <b>demandes-v1</b> : lot, items[] contenant event_id, task_id,
                  version, timestamp, subject, assigned_to, deadline, state.
                </p>
              </details>
            </details>
          </aside>
          <section className="sky-events" aria-label="Événements de la file">
            <div className="sky-filters">
              <label>
                <span>Rechercher un événement ou une action</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex. A-12 ou chaises"
                />
              </label>
              <label>
                <span>Résultat du contrôle</span>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Tous les résultats</option>
                  <option value="pending">À revoir</option>
                  {Object.entries(resultLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="sky-table-scroll"
              tabIndex={0}
              aria-label="Événements, tableau défilant"
            >
              <table>
                <thead>
                  <tr>
                    <th>Source / événement</th>
                    <th>Action</th>
                    <th>Révision</th>
                    <th>Résultat</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.key}
                      className={r.key === row?.key ? "sky-selected" : ""}
                    >
                      <td>
                        <button
                          onClick={() => setSelected(r.key)}
                          aria-pressed={r.key === row?.key}
                        >
                          {r.event.eventId || "Sans identifiant"}
                        </button>
                        <small>
                          {sources[r.event.source]} · {r.key}
                        </small>
                      </td>
                      <td>
                        <strong>{r.event.actionId || "Sans action"}</strong>
                        <span>{r.event.title || "Sans intitulé"}</span>
                      </td>
                      <td>{r.event.revision || "Absente"}</td>
                      <td>
                        <Status code={r.code} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && (
                <p className="sky-empty">Aucun événement pour ces filtres.</p>
              )}
            </div>
            <p className="sky-event-note">
              {rows.length} événement{rows.length === 1 ? "" : "s"} affiché
              {rows.length === 1 ? "" : "s"}. Les résultats ci-dessus sont un
              aperçu des contrôles ; la synthèse est validée par le rejeu.
            </p>
            {result.collisions.length > 0 && (
              <div className="sky-collision-links">
                <h3>Versions à comparer</h3>
                {result.collisions.map((c) => (
                  <div key={`${c.source}:${c.eventId}`}>
                    <span>
                      {sources[c.source]} / {c.eventId}
                    </span>
                    {c.keys.map((k) => (
                      <button key={k} onClick={() => browseEvent(k)}>
                        {k}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
          {row ? (
            <EventEditor
              key={`${row.key}:${row.fingerprint}`}
              row={row}
              d={d}
              commit={commit}
            />
          ) : (
            <aside className="sky-inspector">
              <p>Importez un lot pour examiner ses événements.</p>
            </aside>
          )}
        </div>
        <CurrentActions
          d={d}
          result={result}
          commit={commit}
          feedback={setNotice}
        />
        <section className="sky-bottom">
          <details>
            <summary>Règles de statut ({d.rules.length})</summary>
            <p>
              Une règle agit seulement sur sa source et sa valeur exacte. La
              retirer peut remettre des événements en attente.
            </p>
            <ul>
              {d.rules.map((r) => (
                <li key={`${r.source}:${r.rawStatus}`}>
                  <span>
                    {sources[r.source]} · « {r.rawStatus} » → {states[r.state]}
                  </span>
                  <button
                    onClick={() =>
                      commit(
                        () => setRule(d, r.source, r.rawStatus, ""),
                        `Règle retirée : ${sources[r.source]} / ${r.rawStatus}`,
                      )
                    }
                  >
                    Retirer {r.rawStatus}
                  </button>
                </li>
              ))}
            </ul>
          </details>
          <details open>
            <summary>Journal d’exécution ({d.journal.length})</summary>
            {d.journal.length ? (
              <ol>
                {[...d.journal].reverse().map((j, i) => (
                  <li key={`${j.at}:${i}`}>
                    <time>{new Date(j.at).toLocaleTimeString("fr-FR")}</time>
                    <span>{j.action}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Aucune action dans cette session.</p>
            )}
          </details>
          <div className="sky-restore">
            <FileImport
              key={`restore${epoch}`}
              label="Restaurer un dossier JSON"
              accept=".json,application/json"
              onFile={(f) => load(f, "dossier")}
            />
            <button
              onClick={() => {
                history.reset();
                setSelected("B0001:2");
                setBatch("all");
                setQuery("");
                setFilter("all");
                setPending(null);
                setNotice("Exemple initial restauré. Annulation possible.");
              }}
            >
              Réinitialiser l’exemple
            </button>
          </div>
        </section>
        <p className="sky-limit">
          Scénario fictif de réaménagement de salles, hors production et
          contrôle qualité. Aucun système distant connecté. Le dossier courant
          est conservé dans ce navigateur ; annulation disponible pendant la
          session.
        </p>
        <DemoFooter />
      </main>
    </div>
  );
}

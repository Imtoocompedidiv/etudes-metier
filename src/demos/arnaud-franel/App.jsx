import React, { useState, useEffect } from "react";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import { useHistory } from "../../shared/state.js";
import { DemoFooter, FileImport, useDocumentTitle } from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadJson,
  downloadCsv,
  downloadReport,
} from "../../shared/files.js";
import {
  SUPPORTS,
  HEADERS,
  MAX_BYTES,
  MANIFEST_HEADERS,
  seed,
  current,
  state,
  complete,
  revise,
  declare,
  parseInput,
  manifestRows,
  manifest,
  diffWords,
} from "./model.js";
import "./styles.css";

function Passage({ parts, kind }) {
  return (
    <p className="af-passage">
      {parts.prefix}
      <mark className={kind}>{parts.changed}</mark>
      {parts.suffix}
    </p>
  );
}
function VersionEditor({ correction, onSave, onDirty, disabled }) {
  const v = current(correction);
  const [after, setAfter] = useState(v.after),
    [source, setSource] = useState(v.source),
    [reason, setReason] = useState("");
  const dirty = after !== v.after || source !== v.source || reason !== "";
  useEffect(() => onDirty(dirty), [dirty]);
  return (
    <form
      className="af-version-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ after, source, reason });
      }}
    >
      <div className="af-field">
        <label htmlFor="af-after">Texte après correction</label>
        <textarea
          id="af-after"
          value={after}
          maxLength={4000}
          disabled={disabled}
          onChange={(e) => setAfter(e.target.value)}
          required
        />
      </div>
      <div className="af-field">
        <label htmlFor="af-source">Source de la phrase</label>
        <input
          id="af-source"
          value={source}
          maxLength={250}
          disabled={disabled}
          onChange={(e) => setSource(e.target.value)}
          required
        />
      </div>
      <div className="af-field">
        <label htmlFor="af-reason">Motif de la révision</label>
        <textarea
          id="af-reason"
          className="af-short"
          value={reason}
          maxLength={600}
          disabled={disabled}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ce qui change dans cette version fictive"
          required
        />
      </div>
      <div className="af-actions">
        <button
          className="af-primary"
          disabled={
            disabled || after === v.after || !reason.trim() || !source.trim()
          }
        >
          Enregistrer la version
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setAfter(v.after);
              setSource(v.source);
              setReason("");
            }}
          >
            Abandonner la saisie
          </button>
        )}
      </div>
    </form>
  );
}
function SupportEditor({ support, version, onSave, onClose }) {
  const [kind, setKind] = useState("checked"),
    [locator, setLocator] = useState(""),
    [reviewer, setReviewer] = useState(""),
    [note, setNote] = useState("");
  return (
    <form
      className="af-support-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ kind, locator, reviewer, note });
      }}
    >
      <h3>
        {SUPPORTS[support]} · version {version}
      </h3>
      <p>
        Déclarez le contrôle effectué sur le support. Cette déclaration ne
        modifie aucun ouvrage.
      </p>
      <div className="af-form-grid">
        <label>
          Décision
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="checked">Reprise vérifiée</option>
            <option value="outside">Support non concerné</option>
          </select>
        </label>
        <label>
          Repère du support
          <input
            value={locator}
            onChange={(e) => setLocator(e.target.value)}
            maxLength={250}
            placeholder="Page, rubrique ou version du fichier fictif"
            required
          />
        </label>
        <label>
          Relecteur
          <input
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            maxLength={100}
            placeholder="Nom ou rôle fictif"
            required
          />
        </label>
        <label>
          Note de contrôle
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={600}
            placeholder={
              kind === "outside"
                ? "Pourquoi cette phrase ne concerne pas ce support"
                : "Texte comparé et réserve éventuelle"
            }
            required
          />
        </label>
      </div>
      <div className="af-actions">
        <button
          className="af-primary"
          disabled={!locator.trim() || !reviewer.trim() || !note.trim()}
        >
          Enregistrer la déclaration
        </button>
        <button type="button" onClick={onClose}>
          Fermer sans enregistrer
        </button>
      </div>
    </form>
  );
}
export default function App() {
  useDocumentTitle("Arnaud Franel · cahier de corrections");
  const history = useHistory(seed);
  const d = history.value;
  const [selected, setSelected] = useState("F-01"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [view, setView] = useState("corrections"),
    [support, setSupport] = useState(null),
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const c = d.corrections.find((c) => c.id === selected) || d.corrections[0],
    v = current(c),
    diff = diffWords(v.before, v.after),
    locked = dirty || support !== null || pending !== null;
  const ready = d.corrections.filter(complete).length,
    visible = d.corrections.filter(
      (c) =>
        (c.title + " " + c.id)
          .toLocaleLowerCase("fr")
          .includes(query.toLocaleLowerCase("fr")) &&
        (filter === "all" || !complete(c)),
    );
  function run(fn, success) {
    try {
      fn();
      setError("");
      setMessage(success);
    } catch (e) {
      setError(e.message);
      setMessage("");
    }
  }
  async function importFile(file) {
    try {
      const imported = parseInput(
        await readLocalFile(file, { maxBytes: MAX_BYTES }),
      );
      setPending(imported);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  const report = () =>
    downloadReport("franel-relecture.html", {
      title: d.title,
      subtitle: `Corrections entièrement déclarées : ${ready} / ${d.corrections.length}. Données fictives ; contrôles déclaratifs.`,
      sections: [
        {
          title: "Suivi par support",
          headers: MANIFEST_HEADERS,
          rows: manifestRows(d),
        },
        ...d.corrections.map((c) => ({
          title: c.id + " · " + c.title,
          paragraphs: [
            "Source : " + current(c).source,
            "Avant : " + current(c).before,
            "Après : " + current(c).after,
            "Motif : " + current(c).reason,
          ],
        })),
      ],
    });
  return (
    <div className="af-app">
      <header className="af-header">
        <strong>Arnaud Franel Éditions</strong>
        <span>Étude indépendante · données fictives</span>
      </header>
      <nav className="af-nav" aria-label="Vues du cahier">
        <div>
          <button
            disabled={locked}
            aria-current={view === "corrections" ? "page" : undefined}
            onClick={() => setView("corrections")}
          >
            Corrections
          </button>
          <button
            disabled={locked}
            aria-current={view === "manifest" ? "page" : undefined}
            onClick={() => setView("manifest")}
          >
            Manifeste
          </button>
        </div>
        <span>{d.title}</span>
      </nav>
      <div className="af-workspace">
        <aside className="af-sidebar">
          <h2>Corrections</h2>
          <label htmlFor="af-query">Rechercher</label>
          <input
            id="af-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Titre ou référence"
          />
          <label htmlFor="af-filter">Afficher</label>
          <select
            id="af-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Tout le lot</option>
            <option value="open">Supports encore ouverts</option>
          </select>
          <div className="af-correction-list">
            {visible.map((item) => (
              <button
                key={item.id}
                disabled={locked}
                aria-pressed={c.id === item.id}
                onClick={() => {
                  setSelected(item.id);
                  setView("corrections");
                  setMessage("");
                  setError("");
                }}
              >
                <span>{item.id}</span>
                <strong>{item.title}</strong>
                <small>
                  {
                    Object.keys(SUPPORTS).filter((s) =>
                      ["checked", "outside"].includes(state(item, s).key),
                    ).length
                  }
                  /3 supports
                </small>
              </button>
            ))}
            {!visible.length && <p>Aucune correction pour ce filtre.</p>}
          </div>
          <p className="af-progress">
            Corrections complètes : {ready} / {d.corrections.length}
          </p>
        </aside>
        <main className="af-main">
          <div className="af-heading">
            <div>
              <h1>
                {view === "corrections"
                  ? "Suivre les reprises d’une correction"
                  : "Manifeste du lot"}
              </h1>
              <p>
                {view === "corrections"
                  ? "Confirmez la reprise Web, puis modifiez une phrase pour voir ce qui reste à revoir."
                  : "Retrouvez les déclarations liées à chaque texte et à sa version."}
              </p>
            </div>
            <div className="af-actions">
              <FileImport
                label="Importer CSV / JSON"
                accept=".csv,.json"
                onFile={importFile}
              />
              <button
                disabled={locked}
                onClick={() =>
                  run(
                    () => downloadJson("franel-dossier.json", d),
                    "Dossier téléchargé.",
                  )
                }
              >
                Dossier JSON
              </button>
              <button
                disabled={locked || !history.canUndo}
                onClick={() => {
                  history.undo();
                  setMessage("Modification annulée.");
                  setError("");
                }}
              >
                Annuler
              </button>
              <button
                disabled={locked || !history.canRedo}
                onClick={() => {
                  history.redo();
                  setMessage("Modification rétablie.");
                  setError("");
                }}
              >
                Rétablir
              </button>
            </div>
          </div>
          {error && (
            <p className="af-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="af-message" role="status">
              {message}
            </p>
          )}
          {pending && (
            <section
              className="af-import"
              aria-label="Vérifier le dossier importé"
            >
              <h2>Remplacer le lot par « {pending.title} » ?</h2>
              <p>
                {pending.corrections.length} corrections,{" "}
                {pending.corrections.reduce((n, c) => n + c.versions.length, 0)}{" "}
                versions. Le lot courant sera remplacé ; Annuler permet de le
                retrouver.
              </p>
              <div className="af-actions">
                <button
                  className="af-primary"
                  disabled={dirty || support !== null}
                  onClick={() => {
                    history.set(pending);
                    setSelected(pending.corrections[0].id);
                    setPending(null);
                    setMessage("Dossier importé.");
                    setError("");
                  }}
                >
                  Importer ce lot
                </button>
                <button onClick={() => setPending(null)}>
                  Conserver le lot actuel
                </button>
              </div>
            </section>
          )}
          {dirty && (
            <p className="af-editing">
              Enregistrez la nouvelle version ou abandonnez la saisie avant de
              poursuivre.
            </p>
          )}
          {view === "corrections" ? (
            <>
              <div className="af-version-grid">
                <section className="af-before">
                  <h2>
                    {c.id} · {c.title}
                  </h2>
                  <h3>Avant cette version</h3>
                  <Passage parts={diff.before} kind="af-removed" />
                  <h3>Texte enregistré · v{v.number}</h3>
                  <Passage parts={diff.after} kind="af-added" />
                  <p className="af-caption">
                    Le passage surligné délimite la différence entre les deux
                    textes.
                  </p>
                  <dl>
                    <dt>Source</dt>
                    <dd>{v.source}</dd>
                    <dt>Motif enregistré</dt>
                    <dd>{v.reason}</dd>
                  </dl>
                </section>
                <VersionEditor
                  key={c.id + ":" + v.number + ":" + v.after + ":" + v.source}
                  correction={c}
                  disabled={support !== null || pending !== null}
                  onDirty={setDirty}
                  onSave={(payload) =>
                    run(() => {
                      history.set(revise(d, c.id, payload));
                      setDirty(false);
                    }, "Nouvelle version enregistrée. Les déclarations précédentes restent dans l’historique.")
                  }
                />
                <aside className="af-version-card">
                  <h2>Version actuelle</h2>
                  <strong className="af-number">{v.number}</strong>
                  <p>
                    {complete(c)
                      ? "Trois supports déclarés pour ce texte."
                      : "Des supports restent à contrôler."}
                  </p>
                  <dl>
                    <dt>Versions conservées</dt>
                    <dd>{c.versions.length} / 20</dd>
                    <dt>Dernière révision</dt>
                    <dd>{v.reason}</dd>
                  </dl>
                  <p>
                    Les reprises et exclusions sont des déclarations humaines
                    liées à cette version.
                  </p>
                </aside>
              </div>
              <section className="af-supports">
                <h2>Supports à contrôler</h2>
                <div
                  className="af-table-region"
                  role="region"
                  aria-label="Suivi des trois supports, tableau défilant"
                  tabIndex="0"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Support</th>
                        <th>Dernière déclaration</th>
                        <th>État</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(SUPPORTS).map(([key, label]) => {
                        const s = state(c, key);
                        return (
                          <tr key={key}>
                            <th scope="row">
                              {label}
                              <small>
                                {key === "paper"
                                  ? "Ouvrage imprimé"
                                  : key === "web"
                                    ? "Application HTML"
                                    : "Fiche de mise à jour"}
                              </small>
                            </th>
                            <td>
                              {s.proof ? (
                                <>
                                  <strong>
                                    v{s.proof.version} · {s.proof.reviewer}
                                  </strong>
                                  <small>{s.proof.locator}</small>
                                  <small>{s.proof.note}</small>
                                </>
                              ) : (
                                <span>Aucune déclaration</span>
                              )}
                            </td>
                            <td>
                              <span className={"af-status af-" + s.key}>
                                {s.label}
                              </span>
                              {s.key === "stale" && (
                                <small>
                                  La version actuelle est v{v.number}.
                                </small>
                              )}
                            </td>
                            <td>
                              <button
                                disabled={locked}
                                onClick={() => {
                                  setSupport(key);
                                  setMessage("");
                                }}
                              >
                                {s.proof
                                  ? "Revoir le support"
                                  : "Déclarer le contrôle"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {support && (
                  <SupportEditor
                    key={c.id + support + v.number}
                    support={support}
                    version={v.number}
                    onClose={() => setSupport(null)}
                    onSave={(payload) =>
                      run(() => {
                        history.set(declare(d, c.id, support, payload));
                        setSupport(null);
                      }, "Déclaration enregistrée pour ce support et cette version.")
                    }
                  />
                )}
              </section>
              <details className="af-history">
                <summary>Historique de cette correction</summary>
                {[...c.versions].reverse().map((version) => (
                  <article key={version.number}>
                    <h3>Version {version.number}</h3>
                    <p>{version.after}</p>
                    <p className="af-caption">
                      {version.source} · {version.reason}
                    </p>
                    <ul>
                      {c.proofs
                        .filter((p) => p.version === version.number)
                        .map((p) => (
                          <li key={p.support}>
                            {SUPPORTS[p.support]} ·{" "}
                            {p.kind === "outside"
                              ? "non concerné"
                              : "reprise déclarée"}{" "}
                            · {p.reviewer} · {p.locator}
                          </li>
                        ))}
                    </ul>
                  </article>
                ))}
              </details>
            </>
          ) : (
            <section className="af-manifest">
              <h2>
                {ready === d.corrections.length
                  ? "Lot entièrement déclaré"
                  : "Supports encore ouverts"}
              </h2>
              <p>
                Le CSV de suivi et le rapport peuvent être provisoires. Le
                manifeste n’inclut que des déclarations de la version actuelle
                et exige un lot complet.
              </p>
              <div
                className="af-table-region"
                role="region"
                aria-label="Manifeste du lot, tableau défilant"
                tabIndex="0"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Correction</th>
                      <th>Version</th>
                      {Object.values(SUPPORTS).map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.corrections.map((c) => (
                      <tr key={c.id}>
                        <th scope="row">
                          <button
                            onClick={() => {
                              setSelected(c.id);
                              setView("corrections");
                            }}
                          >
                            {c.id} · {c.title}
                          </button>
                        </th>
                        <td>v{current(c).number}</td>
                        {Object.keys(SUPPORTS).map((s) => (
                          <td key={s}>
                            <span className={"af-status af-" + state(c, s).key}>
                              {state(c, s).label}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <details className="af-formats">
            <summary>Format d’import et exemple</summary>
            <p>
              Un CSV crée un lot de corrections sans déclaration préalable. Le
              JSON restaure l’ensemble du dossier. Jusqu’à 50 corrections, 20
              versions par correction, 5 Mo. Les données restent dans ce
              navigateur.
            </p>
            <button
              disabled={locked}
              onClick={() =>
                downloadCsv(
                  "franel-corrections-exemple.csv",
                  HEADERS,
                  seed().corrections.map((c) => {
                    const v = current(c);
                    return [
                      c.id,
                      c.title,
                      v.source,
                      v.before,
                      v.after,
                      v.reason,
                    ];
                  }),
                )
              }
            >
              Télécharger le CSV d’exemple
            </button>
          </details>
        </main>
      </div>
      <footer className="af-tools">
        <div className="af-actions">
          <button
            disabled={locked}
            className="af-primary"
            onClick={() =>
              run(
                () =>
                  downloadCsv(
                    "franel-suivi.csv",
                    MANIFEST_HEADERS,
                    manifestRows(d),
                  ),
                "CSV téléchargé.",
              )
            }
          >
            CSV de suivi
          </button>
          <button
            disabled={locked}
            onClick={() => run(report, "Rapport HTML téléchargé.")}
          >
            Rapport HTML
          </button>
          <button
            disabled={locked || ready !== d.corrections.length}
            onClick={() =>
              run(
                () => downloadJson("franel-manifeste.json", manifest(d)),
                "Manifeste téléchargé.",
              )
            }
          >
            Manifeste complet
          </button>
        </div>
        <p>
          Déclarations locales. Aucun ouvrage modifié. Sauvegardez le dossier
          pour le reprendre.
        </p>
        <button
          disabled={locked}
          onClick={() => {
            history.reset();
            setSelected("F-01");
            setView("corrections");
            setMessage("Exemple initial rétabli.");
            setError("");
          }}
        >
          Exemple initial
        </button>
      </footer>
      <DemoFooter />
    </div>
  );
}

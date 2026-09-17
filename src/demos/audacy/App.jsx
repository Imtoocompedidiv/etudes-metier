import React, { useState, useRef } from "react";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/spectral/500.css";
import "@fontsource/spectral/600.css";
import { useHistory } from "../../shared/state.js";
import { DemoFooter, useDocumentTitle } from "../../shared/ui.jsx";
import {
  downloadJson,
  downloadCsv,
  downloadReport,
  readLocalFile,
} from "../../shared/files.js";
import {
  seed,
  analyze,
  spaces,
  editPage,
  editLink,
  relire,
  restore,
  finalPlan,
  importCsvPair,
  contentHeaders,
  linkHeaders,
  planHeaders,
  relationHeaders,
  planRows,
  relationRows,
  report,
  MAX_BYTES,
} from "./model.js";
import "./styles.css";
function ContentEditor({ page, onSave, onDirty }) {
  const initial = {
      title: page.title,
      space: page.space,
      targetPath: page.targetPath,
      note: page.note,
    },
    [draft, setDraft] = useState(initial);
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const change = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onDirty(JSON.stringify(initial) !== JSON.stringify(next));
  };
  return (
    <form
      className="aud-content-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <label>
        Titre
        <input
          value={draft.title}
          maxLength={140}
          required
          onChange={(e) => change({ title: e.target.value })}
        />
      </label>
      <div className="aud-origin">
        <span>URL d’origine</span>
        <code>{page.sourceUrl}</code>
      </div>
      <label>
        Espace de destination
        <select
          value={draft.space}
          onChange={(e) => change({ space: e.target.value })}
        >
          {Object.entries(spaces).map(([v, label]) => (
            <option value={v} key={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Chemin cible
        <input
          value={draft.targetPath}
          maxLength={200}
          disabled={["archive", "unassigned"].includes(draft.space)}
          onChange={(e) => change({ targetPath: e.target.value })}
        />
      </label>
      <label>
        {draft.space === "archive"
          ? "Motif de l’archivage"
          : "Note de décision"}
        <textarea
          value={draft.note}
          maxLength={500}
          onChange={(e) => change({ note: e.target.value })}
        />
      </label>
      {dirty && (
        <p className="aud-note">
          La revue du plan sera à refaire après cette modification.
        </p>
      )}
      <div className="aud-actions">
        <button className="aud-primary" disabled={!dirty} type="submit">
          Enregistrer le contenu
        </button>
        <button
          disabled={!dirty}
          type="button"
          onClick={() => {
            setDraft(initial);
            onDirty(false);
          }}
        >
          Annuler la saisie
        </button>
      </div>
    </form>
  );
}
function Neighbourhood({ page, relations, pages, onSelect }) {
  const incoming = relations.filter(
    (l) =>
      l.resolvedTargetId === page.id &&
      !["removed", "source-archived"].includes(l.status),
  );
  const sources = [...new Set(incoming.map((l) => l.from))].map((id) =>
    pages.find((p) => p.id === id),
  );
  const visible = sources.slice(0, 4),
    height = Math.max(110, visible.length * 72);
  return (
    <section className="aud-neighbours">
      <h3>Liens entrants proposés</h3>
      {visible.length ? (
        <div className="aud-diagram" style={{ height }}>
          <svg
            viewBox={`0 0 600 ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="aud-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 0 L 10 5 L 0 10"
                  fill="none"
                  stroke="context-stroke"
                  strokeWidth="1.5"
                />
              </marker>
            </defs>
            {visible.map((p, i) => (
              <path
                key={p.id}
                d={`M 248 ${((i + 0.5) * height) / visible.length} L 360 ${height / 2}`}
                stroke={
                  incoming.some(
                    (l) => l.from === p.id && l.status === "blocked",
                  )
                    ? "#b7422d"
                    : "#11626e"
                }
                strokeWidth="1.5"
                markerEnd="url(#aud-arrow)"
              />
            ))}
          </svg>
          <div className="aud-source-nodes">
            {visible.map((p) => (
              <button key={p.id} onClick={() => onSelect(p.id)}>
                <strong>{p.title}</strong>
                <small>{spaces[p.space]}</small>
              </button>
            ))}
          </div>
          <div
            className={`aud-target-node ${page.space === "archive" ? "is-archive" : ""}`}
          >
            <strong>{page.title}</strong>
            <span>{spaces[page.space]}</span>
          </div>
        </div>
      ) : (
        <p className="aud-empty">
          Aucun lien conservé vers cette page dans l’état actuel.
        </p>
      )}
      <p className="aud-note">
        {sources.length > 4
          ? `${sources.length} sources, quatre montrées ici. `
          : ""}
        Les flèches vont de la source vers cette page. Un lien entre espaces
        reste autorisé.
      </p>
    </section>
  );
}
function LinkEditor({ link, contents, onSave, onDirty }) {
  const initial = {
      action: link.action,
      replacement: link.replacement,
      reason: link.reason,
    },
    [draft, setDraft] = useState(initial);
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const change = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onDirty(JSON.stringify(initial) !== JSON.stringify(next));
  };
  return (
    <form
      className="aud-link-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <p className="aud-link-direction">
        <strong>{link.fromTitle}</strong>
        <span aria-label="vers">→</span>
        <strong>{link.toTitle}</strong>
      </p>
      <label>
        Action sur le lien
        <select
          value={draft.action}
          onChange={(e) => change({ action: e.target.value })}
        >
          <option value="keep">Conserver la cible d’origine</option>
          <option value="remove">Retirer le lien</option>
          <option value="replace">Remplacer la cible</option>
        </select>
      </label>
      {draft.action === "replace" && (
        <label>
          Nouvelle page cible
          <select
            value={draft.replacement || ""}
            onChange={(e) => change({ replacement: e.target.value || null })}
          >
            <option value="">Choisir une page</option>
            {contents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} · {spaces[p.space]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Motif du changement
        <textarea
          value={draft.reason}
          maxLength={500}
          onChange={(e) => change({ reason: e.target.value })}
        />
      </label>
      <div
        className={`aud-link-result ${link.status === "blocked" ? "is-blocked" : ""}`}
      >
        <strong>{link.explanation}</strong>
        <span>{link.targetUrl || "Aucune cible publiée pour ce lien."}</span>
        {link.reason && <p>{link.reason}</p>}
      </div>
      <div className="aud-actions">
        <button className="aud-primary" type="submit" disabled={!dirty}>
          Enregistrer le lien
        </button>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => {
            setDraft(initial);
            onDirty(false);
          }}
        >
          Annuler la saisie
        </button>
      </div>
    </form>
  );
}
export default function App() {
  useDocumentTitle("Audacy · Architecture des contenus");
  const history = useHistory(seed(), { max: 25 }),
    state = history.value,
    a = analyze(state);
  const [selected, setSelected] = useState("rencontres"),
    [selectedLink, setSelectedLink] = useState("l3"),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [pending, setPending] = useState(null),
    [csvFiles, setCsvFiles] = useState({ contents: null, links: null });
    const file = useRef(null),
    dialog = useRef(null), csvSection = useRef(null);
  const page = a.pages.find((p) => p.id === selected) || a.pages[0],
    related = a.relations.filter(
      (l) =>
        l.from === page.id ||
        l.to === page.id ||
        l.resolvedTargetId === page.id,
    ),
    link = related.find((l) => l.id === selectedLink) || related[0],
    visible = a.pages.filter(
      (p) =>
        (filter === "all" || p.space === filter) &&
        `${p.title} ${p.sourcePath}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const safe = (fn) => {
    try {
      setError("");
      fn();
    } catch (e) {
      setError(e.message);
    }
  };
  const commit = (next, msg) => {
    history.set(next);
    setDirty(false);
    setRevision((x) => x + 1);
    setMessage(msg);
    setError("");
  };
  const select = (id) => {
    if (dirty) {
      setError("Enregistrez ou annulez la saisie avant de changer de page.");
      return;
    }
    setSelected(id);
    setError("");
  };
  const startImport = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const next = restore(await readLocalFile(f, { maxBytes: MAX_BYTES }));
      setPending({ name: f.name, state: next });
      dialog.current.showModal();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };
  const readCsv = async (kind, f) => {
    if (!f) return;
    try {
      const raw = await readLocalFile(f, { maxBytes: MAX_BYTES });
      setCsvFiles((x) => ({ ...x, [kind]: { name: f.name, text: raw } }));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div className="aud-app">
      <header className="aud-header">
        <span className="aud-wordmark">
          audacy<span>/</span>
        </span>
        <span>Étude indépendante · JD</span>
      </header>
      <main>
        <div className="aud-heading">
          <div>
            <h1>Deux espaces, un référentiel commun</h1>
            <p>
              Affectez les contenus et vérifiez les liens qui traversent la
              frontière.
            </p>
          </div>
          <div className="aud-actions">
            <button
              className="aud-primary"
              disabled={dirty}
              onClick={() => file.current.click()}
            >
              Importer un dossier
            </button>
            <button
              disabled={dirty}
              onClick={() => {
                csvSection.current.open = true;
                csvSection.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              Exemples CSV
            </button>
            <input
              type="file"
              hidden
              accept=".json,application/json"
              ref={file}
              onChange={startImport}
            />
          </div>
        </div>
        <div className="aud-status">
          <strong>
            {a.reviewed
              ? "Plan complet relu"
              : a.ready
                ? "Plan prêt à relire"
                : `${a.issues.length} contrôles à terminer`}
          </strong>
          <span>
            {a.pages.length} contenus · {a.relations.length} liens d’origine
          </span>
        </div>
        <p className="aud-message" role="status">
          {message}
        </p>
        {error && (
          <p className="aud-error" role="alert">
            {error}
          </p>
        )}
        <div className="aud-workspace">
          <section className="aud-inventory">
            <div className="aud-section-head">
              <h2>Inventaire des contenus</h2>
              <label>
                Filtrer par espace
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Tous les espaces</option>
                  {Object.entries(spaces).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="aud-search">
              Rechercher un contenu
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div
              className="aud-table-scroll aud-inventory-scroll"
              role="region"
              aria-label="Inventaire, défilement horizontal"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Titre</th>
                    <th>Espace futur</th>
                    <th>Chemin cible</th>
                    <th>Contrôle</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => {
                    const issues = a.issues.filter((i) => i.pageId === p.id),
                      incoming = a.relations.filter(
                        (l) => l.to === p.id && l.status === "blocked",
                      ).length;
                    return (
                      <tr
                        key={p.id}
                        className={p.id === page.id ? "is-selected" : ""}
                      >
                        <th>
                          <button
                            disabled={dirty}
                            aria-pressed={p.id === page.id}
                            onClick={() => select(p.id)}
                          >
                            {p.title}
                          </button>
                        </th>
                        <td>{spaces[p.space]}</td>
                        <td>
                          {p.space === "archive"
                            ? "Archivé"
                            : p.targetPath || "Non renseigné"}
                        </td>
                        <td>
                          {issues.length ? (
                            <span className="aud-problem">
                              {issues.length} contrôle
                              {issues.length > 1 ? "s" : ""}
                            </span>
                          ) : incoming ? (
                            <span className="aud-problem">
                              {incoming} lien{incoming > 1 ? "s" : ""} entrant
                              {incoming > 1 ? "s" : ""} à reprendre
                            </span>
                          ) : (
                            "Calculé"
                          )}
                          {issues.some((i) => i.kind === "collision") && (
                            <small>Destination partagée</small>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!visible.length && (
              <p className="aud-empty">Aucun contenu ne correspond.</p>
            )}
            <section className="aud-plan">
              <h2>Plan de réécriture</h2>
              <p>
                Les destinations évoluent avec les affectations. L’archive reste
                sans URL publiée.
              </p>
              <div
                className="aud-table-scroll"
                role="region"
                aria-label="Plan des destinations, défilement horizontal"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th>URL actuelle</th>
                      <th>Destination proposée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.pages.map((p) => (
                      <tr key={p.id}>
                        <th>{p.title}</th>
                        <td>{p.sourceUrl}</td>
                        <td>
                          {p.targetUrl ||
                            (p.space === "archive"
                              ? "Archive, sans destination"
                              : "À définir")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
          <aside className="aud-inspector">
            <h2>{page.title}</h2>
            <fieldset className="aud-editor-lock" disabled={Boolean(dirty && dirty !== 'page')}>
            <ContentEditor
              key={`p:${page.id}:${revision}`}
              page={page}
              onDirty={value => setDirty(value ? 'page' : false)}
              onSave={(draft) =>
                safe(() =>
                  commit(
                    editPage(state, page.id, draft),
                    "Contenu enregistré. Les destinations et liens ont été recalculés.",
                  ),
                )
              }
            />
            </fieldset>
            {a.issues
              .filter((i) => i.pageId === page.id && !i.linkId)
              .map((i, index) => (
                <p className="aud-error" key={index}>
                  {i.message}
                </p>
              ))}
            <Neighbourhood
              page={page}
              relations={a.relations}
              pages={a.pages}
              onSelect={select}
            />
            <section className="aud-relations">
              <h3>Liens de cette page</h3>
              <p className="aud-note">
                Les liens d’origine restent dans le dossier, même après retrait
                ou remplacement.
              </p>
              {related.length ? (
                <>
                  <label>
                    Choisir un lien
                    <select
                      disabled={dirty}
                      value={link.id}
                      onChange={(e) => {
                        setSelectedLink(e.target.value);
                        setError("");
                      }}
                    >
                      {related.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.id} · {l.fromTitle} → {l.toTitle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="aud-editor-lock" disabled={Boolean(dirty && dirty !== 'link')}>
                  <LinkEditor
                    key={`l:${link.id}:${revision}`}
                    link={link}
                    contents={a.pages}
                    onDirty={value => setDirty(value ? 'link' : false)}
                    onSave={(draft) =>
                      safe(() =>
                        commit(
                          editLink(state, link.id, draft),
                          "Décision de lien enregistrée. Le plan reste à relire.",
                        ),
                      )
                    }
                  />
                  </fieldset>
                </>
              ) : (
                <p className="aud-empty">Aucun lien associé à cette page.</p>
              )}
            </section>
          </aside>
        </div>
        <section className="aud-delivery">
          <div>
            <button
              className="aud-primary"
              disabled={dirty || !a.ready || a.reviewed}
              onClick={() =>
                safe(() =>
                  commit(
                    relire(state),
                    "Plan complet relu pour ces contenus et ces décisions.",
                  ),
                )
              }
            >
              Relire le plan
            </button>
            <p>
              {a.reviewed
                ? "Revue attachée à cette version exacte."
                : "Les contrôles portent sur tous les contenus et liens du dossier."}
            </p>
          </div>
          <div className="aud-actions">
            <button
              disabled={dirty}
              onClick={() => downloadJson("audacy-dossier.json", state)}
            >
              Dossier JSON
            </button>
            <button
              disabled={dirty || !a.reviewed}
              onClick={() =>
                safe(() => downloadJson("audacy-plan.json", finalPlan(state)))
              }
            >
              Exporter le plan
            </button>
            <button
              disabled={dirty}
              onClick={() => {
                downloadCsv(
                  "audacy-destinations.csv",
                  planHeaders,
                  planRows(state),
                );
              }}
            >
              Destinations CSV
            </button>
            <button disabled={dirty} onClick={()=>downloadCsv('audacy-relations.csv',relationHeaders,relationRows(state))}>Relations CSV</button>
            <button
              disabled={dirty}
              onClick={() =>
                downloadReport("audacy-rapport.html", report(state))
              }
            >
              Rapport HTML
            </button>
          </div>
        </section>
        <details className="aud-csv" ref={csvSection}>
          <summary>Importer un inventaire et ses liens en CSV</summary>
          <p>
            Les deux fichiers remplacent ensemble l’inventaire et les liens. Les
            exemples fournissent les colonnes attendues ; les trois origines du
            dossier courant sont conservées.
          </p>
          <div className="aud-actions"><button disabled={dirty} onClick={()=>downloadCsv('audacy-contenus-exemple.csv',contentHeaders,seed().contents)}>Exemple des contenus</button><button disabled={dirty} onClick={()=>downloadCsv('audacy-liens-exemple.csv',linkHeaders,seed().links)}>Exemple des liens</button></div>
          <div className="aud-csv-inputs">
            <label>
              Fichier des contenus
              <input
                disabled={dirty}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => readCsv("contents", e.target.files?.[0])}
              />
            </label>
            <label>
              Fichier des liens
              <input
                disabled={dirty}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => readCsv("links", e.target.files?.[0])}
              />
            </label>
            <button
              disabled={dirty || !csvFiles.contents || !csvFiles.links}
              onClick={() =>
                safe(() => {
                  const next = importCsvPair(
                    csvFiles.contents.text,
                    csvFiles.links.text,
                    state,
                  );
                  setPending({ name: "Le couple CSV", state: next });
                  dialog.current.showModal();
                })
              }
            >
              Vérifier les deux CSV
            </button>
          </div>
        </details>
        <div className="aud-bottom">
          <p>
            Données associatives fictives. Traitement local. Aucun CMS modifié.
            Exportez le dossier JSON pour conserver cette session.
          </p>
          <div className="aud-actions">
            <button
              disabled={dirty || !history.canUndo}
              onClick={() => {
                history.undo();
                setRevision((x) => x + 1);
                setMessage("Dernière action annulée.");
                setError("");
              }}
            >
              Annuler
            </button>
            <button
              disabled={dirty || !history.canRedo}
              onClick={() => {
                history.redo();
                setRevision((x) => x + 1);
                setMessage("Action rétablie.");
                setError("");
              }}
            >
              Rétablir
            </button>
            <button
              disabled={dirty}
              onClick={() => {
                setPending({ reset: true });
                dialog.current.showModal();
              }}
            >
              Réinitialiser
            </button>
          </div>
        </div>
        <details className="aud-method">
          <summary>Conventions et limites</summary>
          <p>
            Les espaces Institution et Services utilisent deux origines HTTPS
            distinctes. Un chemin identique dans les deux espaces ne crée pas de
            collision. Dans un espace, le slash final est ignoré ; la casse est
            conservée. Ce format accepte uniquement les chemins ASCII absolus,
            sans requêtes, ancres, points ou caractères encodés.
          </p>
          <p>
            Une page en archive n’a aucune URL publiée. Ses liens sortants sont
            exclus du plan ; ses liens entrants demandent une décision. Un
            retrait ou un remplacement exige un motif. Les relations conservées
            sont réécrites vers la destination actuelle de leur cible. Ce plan
            ne crée ni redirection HTTP, ni archive dans un CMS.
          </p>
          <p>
            Le JSON documenté permet de modifier les origines et de reprendre le
            dossier. Jusqu’à 100 contenus, 300 liens, 500 caractères par motif
            et 2 Mo par fichier. La revue est retirée à toute modification. Les
            tableaux et rapports peuvent décrire un état provisoire ; seul le
            plan final exige la revue complète.
          </p>
        </details>
      </main>
      <DemoFooter />
      <dialog
        ref={dialog}
        className="aud-dialog"
        onCancel={() => setPending(null)}
      >
        <h2>
          {pending?.reset
            ? "Revenir à l’exemple ?"
            : "Importer ce référentiel ?"}
        </h2>
        <p>
          {pending?.reset
            ? "Les modifications seront remplacées ; le retour arrière reste disponible."
            : `${pending?.name || ""} contient ${pending?.state?.contents.length || 0} contenus et ${pending?.state?.links.length || 0} liens. Le remplacement restera annulable.`}
        </p>
        <div className="aud-actions">
          <button
            onClick={() => {
              dialog.current.close();
              setPending(null);
            }}
          >
            Conserver mon dossier
          </button>
          <button
            className="aud-primary"
            onClick={() => {
              const next = pending.reset ? seed() : pending.state;
              commit(
                next,
                pending.reset ? "Exemple restauré." : "Référentiel importé.",
              );
              setSelected(next.contents[0].id);
              setSelectedLink(next.links[0]?.id || "");
              setFilter("all");
              setSearch("");
              dialog.current.close();
              setPending(null);
            }}
          >
            Confirmer
          </button>
        </div>
      </dialog>
    </div>
  );
}

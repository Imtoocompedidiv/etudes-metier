import React, { useEffect, useRef, useState } from "react";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import {
  DemoFooter,
  ErrorMessage,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import { useHistory } from "../../shared/state.js";
import {
  downloadCsv,
  downloadJson,
  downloadText,
  readLocalFile,
} from "../../shared/files.js";
import {
  HEADERS,
  UNITS,
  seed,
  current,
  compare,
  editSource,
  expectedYears,
  setPair,
  removePair,
  decide,
  parseSource,
  replaceSource,
  restore,
  number,
  outcome,
  exportRows,
  report,
} from "./model.js";
import "./styles.css";

function Upload({ children, disabled, onFile, accept = ".csv,text/csv" }) {
  const input = useRef();
  return (
    <>
      <button disabled={disabled} onClick={() => input.current.click()}>
        {children}
      </button>
      <input
        hidden
        ref={input}
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}
function Preview({ value, onCancel, onConfirm }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog className="esp-import" ref={ref} onCancel={onCancel}>
      <h2>
        {value.kind === "dossier"
          ? "Reprendre le dossier"
          : "Remplacer une source"}
      </h2>
      <p>
        {value.kind === "dossier"
          ? `${value.data.pairs.length} correspondances et ${value.data.edits.length} corrections enregistrées.`
          : `${value.data.length} lignes pour la ${value.side === "left" ? "référence" : "source d’actualisation"}. Les corrections de cette source seront retirées ; les liens conservés seront recalculés.`}
      </p>
      <p>
        Le dossier courant sera modifié seulement après confirmation. Vous
        pourrez annuler.
      </p>
      <div>
        <button onClick={onCancel}>Annuler l’import</button>
        <button className="primary" onClick={onConfirm}>
          Confirmer l’import
        </button>
      </div>
    </dialog>
  );
}
function Metadata({ title, data }) {
  return (
    <section>
      <h3>{title}</h3>
      {data ? (
        <dl>
          {[
            ["Périmètre", data.perimetre],
            ["Année", data.annee],
            ["Unité", UNITS[data.unite]],
            ["Définition", data.definition],
            ["Dénominateur", data.denominateur || "Sans objet"],
          ].map(([k, v]) => (
            <React.Fragment key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : (
        <p>Ligne absente de la source.</p>
      )}
    </section>
  );
}
function SourceEditor({ data, side, onSave, onDirty, blocked }) {
  const [form, setForm] = useState(data || {}),
    [reason, setReason] = useState("");
  const dirty =
    reason !== "" || JSON.stringify(form) !== JSON.stringify(data || {});
  useEffect(() => {
    onDirty(dirty);
  }, [dirty]);
  if (!data)
    return (
      <p className="esp-hint">
        Rétablissez la ligne par import ou choisissez une autre correspondance.
      </p>
    );
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      className="esp-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (onSave(form, reason)) {
          setReason("");
          onDirty(false);
        }
      }}
    >
      <h3>
        Correction de la source{" "}
        {side === "left" ? "référence" : "actualisation"} · {data.id}
      </h3>
      <p>
        Corrigez une erreur de saisie avec son justificatif. Un vrai changement
        de périmètre doit rester documenté sans comparaison.
      </p>
      <fieldset disabled={blocked}>
        <div className="esp-edit-grid">
          <label>
            Valeur
            <input
              value={form.valeur ?? ""}
              inputMode="decimal"
              onChange={(e) => set("valeur", e.target.value)}
            />
            <small>Vide signifie non renseigné.</small>
          </label>
          <label>
            Unité
            <select
              value={form.unite}
              onChange={(e) => set("unite", e.target.value)}
            >
              {Object.entries(UNITS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Périmètre
            <input
              value={form.perimetre}
              maxLength={160}
              onChange={(e) => set("perimetre", e.target.value)}
            />
          </label>
          <label>
            Année
            <input
              value={form.annee}
              inputMode="numeric"
              onChange={(e) => set("annee", e.target.value)}
            />
          </label>
          <label className="wide">
            Définition
            <textarea
              rows={2}
              value={form.definition}
              maxLength={700}
              onChange={(e) => set("definition", e.target.value)}
            />
          </label>
          <label>
            Dénominateur
            <input
              value={form.denominateur}
              maxLength={200}
              onChange={(e) => set("denominateur", e.target.value)}
            />
          </label>
          <label>
            Nom de source
            <input
              value={form.source}
              maxLength={240}
              onChange={(e) => set("source", e.target.value)}
            />
          </label>
          <label className="wide">
            Motif de correction
            <textarea
              value={reason}
              maxLength={1000}
              rows={2}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Référence de la version ou confirmation du producteur"
            />
          </label>
        </div>
        <div className="esp-actions">
          <button type="submit" className="primary" disabled={!dirty}>
            Enregistrer la correction
          </button>
          {dirty && (
            <button
              type="button"
              onClick={() => {
                setForm(data);
                setReason("");
                onDirty(false);
              }}
            >
              Abandonner la saisie
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
function PairForm({ d, onSubmit, disabled }) {
  const [left, setLeft] = useState(""),
    [right, setRight] = useState("");
  return (
    <details className="esp-pair">
      <summary>Rapprocher deux codes différents</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (onSubmit(left, right)) {
            setLeft("");
            setRight("");
          }
        }}
      >
        <p>
          Un code ne peut appartenir qu’à une correspondance. Les libellés ne
          provoquent jamais de fusion automatique.
        </p>
        <fieldset disabled={disabled}>
          <div className="esp-two">
            <label>
              Ligne de référence
              <select value={left} onChange={(e) => setLeft(e.target.value)}>
                <option value="">Choisir</option>
                {d.sources.left
                  .filter((r) => !d.pairs.some((p) => p.left === r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id} · {r.indicateur}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Ligne d’actualisation
              <select value={right} onChange={(e) => setRight(e.target.value)}>
                <option value="">Choisir</option>
                {d.sources.right
                  .filter((r) => !d.pairs.some((p) => p.right === r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id} · {r.indicateur}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <button disabled={!left || !right}>Ajouter la correspondance</button>
        </fieldset>
      </form>
    </details>
  );
}
export default function App() {
  useDocumentTitle("Espacité · Comparabilité des agrégats");
  const h = useHistory(seed),
    d = h.value;
  const [selected, setSelected] = useState("C2"),
    [side, setSide] = useState("right"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState(null),
    [editorDirty, setEditorDirty] = useState(false),
    [note, setNote] = useState(""),
    [years, setYears] = useState(d.expected);
  const pair = d.pairs.find((p) => p.id === selected) || d.pairs[0],
    result = pair ? compare(d, pair) : null,
    active = result?.[side === "left" ? "a" : "b"];
  const noteDirty = note !== (result?.review?.note || ""),
    yearsDirty =
      String(years.left) !== String(d.expected.left) ||
      String(years.right) !== String(d.expected.right),
    dirty = editorDirty || noteDirty || yearsDirty;
  useEffect(() => {
    setNote(result?.review?.note || "");
    setEditorDirty(false);
    setYears(d.expected);
  }, [d, selected]);
  const run = (fn, text) => {
    try {
      const next = fn();
      if (next) h.set(next);
      setError("");
      setNotice(text);
      return true;
    } catch (e) {
      setError(e.message);
      setNotice("");
      return false;
    }
  };
  const output = (fn, text) => {
    try {
      fn();
      setError("");
      setNotice(text);
    } catch (e) {
      setError(e.message);
      setNotice("");
    }
  };
  const read = async (file, kind, which) => {
    try {
      const text = await readLocalFile(file),
        data =
          kind === "dossier" ? restore(JSON.parse(text)) : parseSource(text);
      setPreview({ data, kind, side: which });
      setError("");
      setNotice("");
    } catch (e) {
      setError(e.message);
      setNotice("");
    }
  };
  const visible = d.pairs
    .map((p) => compare(d, p))
    .filter(
      (r) =>
        (filter === "all" ||
          (filter === "issues" && !r.compatible) ||
          (filter === "pending" && !r.review)) &&
        `${r.a?.indicateur || ""} ${r.b?.indicateur || ""} ${r.pair.left} ${r.pair.right}`
          .toLocaleLowerCase("fr")
          .includes(query.toLocaleLowerCase("fr")),
    );
  const unlinked = ["left", "right"].reduce(
    (sum, s) =>
      sum +
      d.sources[s].filter((r) => !d.pairs.some((p) => p[s] === r.id)).length,
    0,
  );
  return (
    <div className="esp-app">
      <header className="esp-brand">
        <strong>Espacité</strong>
        <span>Prototype indépendant · Données fictives</span>
        <a href="#esp-output">Note de restitution</a>
      </header>
      <section className="esp-title">
        <h1>Comparer les agrégats avant restitution</h1>
        <p>
          Sélectionnez les permanences pour examiner le changement de périmètre.
        </p>
      </section>
      <main>
        <div className="esp-feedback">
          <ErrorMessage>{error}</ErrorMessage>
          {notice && <p role="status">{notice}</p>}
          {dirty && (
            <p className="esp-unsaved">
              Une saisie est en cours. Enregistrez-la ou abandonnez-la avant de
              changer de dossier ou d’exporter.
            </p>
          )}
        </div>
        <div className="esp-desk">
          <section className="esp-work" aria-label="Sources et correspondances">
            <div className="esp-toolbar">
              <form
                className="esp-periods"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () => expectedYears(d, years.left, years.right),
                    "Périodes attendues mises à jour. Les revues sont recalculées.",
                  );
                }}
              >
                <label>
                  Référence
                  <input
                    aria-label="Année de référence"
                    inputMode="numeric"
                    value={years.left}
                    disabled={editorDirty || noteDirty}
                    onChange={(e) =>
                      setYears({ ...years, left: e.target.value })
                    }
                  />
                </label>
                <label>
                  Actualisation
                  <input
                    aria-label="Année d’actualisation"
                    inputMode="numeric"
                    value={years.right}
                    disabled={editorDirty || noteDirty}
                    onChange={(e) =>
                      setYears({ ...years, right: e.target.value })
                    }
                  />
                </label>
                {yearsDirty && (
                  <>
                    <button>Appliquer</button>
                    <button type="button" onClick={() => setYears(d.expected)}>
                      Annuler les périodes
                    </button>
                  </>
                )}
              </form>
              <div className="esp-actions">
                <button
                  disabled={!h.canUndo || dirty}
                  onClick={() => {
                    h.undo();
                    setNotice("Dernière modification annulée.");
                    setError("");
                  }}
                >
                  Annuler
                </button>
                <button
                  disabled={!h.canRedo || dirty}
                  onClick={() => {
                    h.redo();
                    setNotice("Modification rétablie.");
                    setError("");
                  }}
                >
                  Rétablir
                </button>
                <a className="esp-button primary" href="#esp-output">
                  Exporter la note
                </a>
              </div>
            </div>
            <p className="esp-help">
              Mode évolution entre deux années. Les dates doivent correspondre
              aux périodes choisies, les définitions et périmètres rester
              identiques.
            </p>
            <div className="esp-filter">
              <label>
                Rechercher
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Indicateur ou code"
                />
              </label>
              <label>
                Afficher
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Toutes les correspondances</option>
                  <option value="issues">Avec un écart de comparabilité</option>
                  <option value="pending">Sans revue actuelle</option>
                </select>
              </label>
            </div>
            <div
              className="esp-scroll"
              tabIndex={0}
              aria-label="Tableau des correspondances, défilement horizontal possible"
            >
              <table className="esp-table">
                <thead>
                  <tr>
                    <th>Indicateur</th>
                    <th>Référence</th>
                    <th>Actualisation</th>
                    <th>Comparabilité</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr
                      key={r.pair.id}
                      className={r.pair.id === pair?.id ? "selected" : ""}
                    >
                      <th scope="row">
                        <button
                          disabled={dirty}
                          aria-pressed={r.pair.id === pair?.id}
                          onClick={() => {
                            setSelected(r.pair.id);
                            setError("");
                            setNotice("");
                          }}
                        >
                          {r.a?.indicateur ||
                            r.b?.indicateur ||
                            "Ligne absente"}
                          <small>
                            {r.pair.left} / {r.pair.right}
                          </small>
                        </button>
                      </th>
                      <td>{r.a ? number(r.a.valeur) : "Ligne absente"}</td>
                      <td>{r.b ? number(r.b.valeur) : "Ligne absente"}</td>
                      <td>
                        <span
                          className={
                            r.review
                              ? "reviewed"
                              : r.compatible
                                ? "pending"
                                : "issue"
                          }
                        >
                          {r.status}
                        </span>
                        {r.stale && <small>Revue à refaire</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visible.length && <p>Aucune correspondance dans ce filtre.</p>}
            </div>
            <p className="esp-mobile-link">
              <a href="#esp-inspector">Examiner la ligne sélectionnée</a>
            </p>
            <div className="esp-sources">
              {["left", "right"].map((s) => (
                <section key={s}>
                  <h3>
                    Source {s === "left" ? "de référence" : "d’actualisation"}
                  </h3>
                  <p>
                    {d.sources[s].length} lignes importées.{" "}
                    {s === "left" ? result?.a?.source : result?.b?.source}
                  </p>
                  <Upload
                    disabled={dirty}
                    onFile={(file) => read(file, "source", s)}
                  >
                    Importer {s === "left" ? "la référence" : "l’actualisation"}
                  </Upload>
                  <button
                    className="text"
                    disabled={dirty}
                    onClick={() =>
                      output(
                        () =>
                          downloadCsv(
                            `espacite-${s}-exemple.csv`,
                            HEADERS,
                            seed().sources[s],
                          ),
                        "CSV exemple téléchargé.",
                      )
                    }
                  >
                    Télécharger le CSV exemple
                  </button>
                </section>
              ))}
            </div>
            <details className="esp-edit-section">
              <summary>Corriger une métadonnée avec justificatif</summary>
              <div className="esp-side">
                <label>
                  Source à corriger
                  <select
                    disabled={dirty}
                    value={side}
                    onChange={(e) => setSide(e.target.value)}
                  >
                    <option value="right">Actualisation</option>
                    <option value="left">Référence</option>
                  </select>
                </label>
              </div>
              <SourceEditor
                key={`${selected}-${side}-${JSON.stringify(active)}`}
                data={active}
                side={side}
                blocked={noteDirty || yearsDirty}
                onDirty={setEditorDirty}
                onSave={(form, motif) =>
                  run(
                    () => editSource(d, side, active.id, form, motif),
                    "Correction conservée avec son motif. La revue concernée est à refaire.",
                  )
                }
              />
            </details>
            <PairForm
              d={d}
              disabled={dirty}
              onSubmit={(left, right) =>
                run(
                  () => setPair(d, null, left, right),
                  "Correspondance ajoutée.",
                )
              }
            />
            <p className="esp-help">
              {unlinked} ligne{unlinked > 1 ? "s" : ""} sans correspondance.
              Elles restent présentes dans les sources et sont signalées dans la
              note.
            </p>
          </section>
          <aside
            className="esp-inspector"
            id="esp-inspector"
            aria-label="Revue de la correspondance"
          >
            {result ? (
              <>
                <h2>
                  {result.a?.indicateur || result.b?.indicateur || pair.id}
                </h2>
                <div className="esp-two">
                  <Metadata
                    title={`Référence ${d.expected.left}`}
                    data={result.a}
                  />
                  <Metadata
                    title={`Actualisation ${d.expected.right}`}
                    data={result.b}
                  />
                </div>
                <div
                  className={
                    result.compatible ? "esp-verdict compatible" : "esp-verdict"
                  }
                >
                  <strong>
                    {result.compatible
                      ? outcome(result)
                      : "La variation reste masquée."}
                  </strong>
                  {result.issues.length > 0 && (
                    <ul>
                      {result.issues.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  )}
                  {result.compatible && (
                    <p>
                      Les contrôles de métadonnées passent. La pertinence métier
                      reste à confirmer par la relecture.
                    </p>
                  )}
                </div>
                {result.stale && (
                  <p className="esp-unsaved">
                    Les données ont changé depuis la dernière revue. Son
                    ancienne note est conservée dans le dossier, sans valider
                    cette version.
                  </p>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(
                      () => decide(d, pair.id, "include", note),
                      "Comparaison relue pour cette version.",
                    );
                  }}
                >
                  <label>
                    Note pour la restitution
                    <textarea
                      rows={5}
                      maxLength={1500}
                      disabled={editorDirty || yearsDirty}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Précisez le constat et ses limites pour la restitution."
                    />
                  </label>
                  <div className="esp-decision">
                    <button
                      className="primary"
                      disabled={
                        !result.compatible ||
                        !note.trim() ||
                        editorDirty ||
                        yearsDirty
                      }
                    >
                      Valider la comparaison
                    </button>
                    <button
                      type="button"
                      disabled={!note.trim() || editorDirty || yearsDirty}
                      onClick={() =>
                        run(
                          () => decide(d, pair.id, "exclude", note),
                          "Écart documenté. Aucune variation ne sera retenue dans la note.",
                        )
                      }
                    >
                      Documenter sans comparer
                    </button>
                    {noteDirty && (
                      <button
                        type="button"
                        className="text"
                        onClick={() => setNote(result.review?.note || "")}
                      >
                        Abandonner la note
                      </button>
                    )}
                  </div>
                </form>
                {result.review && (
                  <p className="esp-reviewed">
                    {result.status} · Décision liée aux données affichées.
                  </p>
                )}
                <details className="esp-pair">
                  <summary>Modifier le rapprochement</summary>
                  <p>
                    Retirer la correspondance conserve les deux lignes source.
                    Vous pourrez ensuite relier d’autres codes dans la table.
                  </p>
                  <button
                    disabled={dirty}
                    onClick={() =>
                      run(
                        () => removePair(d, pair.id),
                        "Correspondance retirée. Les données source sont conservées.",
                      )
                    }
                  >
                    Retirer cette correspondance
                  </button>
                </details>
              </>
            ) : (
              <>
                <h2>Aucune correspondance</h2>
                <p>Rapprochez deux lignes pour commencer la revue.</p>
              </>
            )}
          </aside>
        </div>
        <section className="esp-output" id="esp-output">
          <div>
            <h2>Note de restitution</h2>
            <p>
              Statuts, réserves, sources et corrections suivent les chiffres.
              Sans revue, le résultat est identifié comme à relire.
            </p>
          </div>
          <div className="esp-actions">
            <button
              disabled={dirty}
              onClick={() =>
                output(() => {
                  const rs = exportRows(d);
                  downloadCsv(
                    "espacite-comparaisons.csv",
                    Object.keys(rs[0] || { correspondance: "" }),
                    rs,
                  );
                }, "Tableau CSV téléchargé.")
              }
            >
              Télécharger CSV
            </button>
            <button
              className="primary"
              disabled={dirty}
              onClick={() =>
                output(
                  () =>
                    downloadText(
                      "espacite-note.html",
                      report(d),
                      "text/html;charset=utf-8",
                    ),
                  "Note HTML téléchargée, ouvrable et imprimable dans un navigateur.",
                )
              }
            >
              Télécharger HTML
            </button>
            <button
              disabled={dirty}
              onClick={() =>
                output(
                  () => downloadJson("espacite-dossier.json", d),
                  "Dossier téléchargé. Il permet de reprendre les sources, corrections et décisions.",
                )
              }
            >
              Sauvegarder le dossier
            </button>
            <Upload
              disabled={dirty}
              accept=".json,application/json"
              onFile={(file) => read(file, "dossier")}
            >
              Reprendre un dossier
            </Upload>
          </div>
          <p className="esp-help">
            Les fichiers restent dans cet onglet. Sauvegardez le dossier avant
            de le fermer. Le rapport est un fichier HTML, pas un PDF.
          </p>
        </section>
        <details className="esp-journal">
          <summary>Corrections et décisions ({d.journal.length})</summary>
          {d.journal.length ? (
            <ol>
              {d.journal.map((x, i) => (
                <li key={i}>{x.text}</li>
              ))}
            </ol>
          ) : (
            <p>Aucune modification enregistrée.</p>
          )}
          <button
            disabled={dirty}
            onClick={() => {
              h.reset();
              setSelected("C2");
              setFilter("all");
              setQuery("");
              setNotice(
                "Exemple initial restauré. Cette action est annulable.",
              );
              setError("");
            }}
          >
            Recharger l’exemple
          </button>
        </details>
      </main>
      <DemoFooter />
      {preview && (
        <Preview
          value={preview}
          onCancel={() => setPreview(null)}
          onConfirm={() => {
            const ok = run(
              () =>
                preview.kind === "dossier"
                  ? preview.data
                  : replaceSource(d, preview.side, preview.data),
              "Import effectué. Contrôles et décisions recalculés.",
            );
            if (ok) setPreview(null);
          }}
        />
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect } from "react";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import {
  DemoFooter,
  ErrorMessage,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import { useHistory } from "../../shared/state.js";
import {
  readLocalFile,
  downloadCsv,
  downloadJson,
  downloadReport,
} from "../../shared/files.js";
import {
  HEADERS,
  FAMILIES,
  seed,
  parseArrival,
  analyze,
  setAlias,
  removeAlias,
  editRow,
  removeEdit,
  reviewProduct,
  replaceArrival,
  restore,
  OUTPUT_HEADERS,
  outputRows,
  exceptions,
  report,
} from "./model.js";
import "./styles.css";

function Upload({ children, disabled, onFile, json = false }) {
  const ref = useRef();
  return (
    <>
      <button disabled={disabled} onClick={() => ref.current.click()}>
        {children}
      </button>
      <input
        hidden
        ref={ref}
        type="file"
        accept={json ? ".json,application/json" : ".csv,text/csv"}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
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
    <dialog ref={ref} className="fm-dialog" onCancel={onCancel}>
      <h2>
        {value.kind === "json"
          ? "Reprendre le dossier"
          : "Remplacer l’arrivage"}
      </h2>
      <p>
        {value.kind === "json"
          ? `${value.data.source.length} lignes, ${value.data.edits.length} corrections et ${value.data.reviews.length} notes de revue.`
          : `${value.data.length} lignes reçues. Si cet arrivage diffère de la source actuelle, il la remplacera et les corrections et revues seront retirées. Un arrivage identique conserve le travail. Le dictionnaire de tailles reste disponible.`}
      </p>
      <p>Aucun changement avant confirmation. L’import pourra être annulé.</p>
      <div>
        <button onClick={onCancel}>Annuler l’import</button>
        <button className="primary" onClick={onConfirm}>
          Confirmer l’import
        </button>
      </div>
    </dialog>
  );
}
function SizeEditor({ variant, onSave, onRemove, onDirty, blocked }) {
  const [size, setSize] = useState(""),
    [reason, setReason] = useState("");
  const dirty = Boolean(size || reason);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty]);
  const family = FAMILIES[variant.row.famille];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (onSave(size, reason)) {
          setSize("");
          setReason("");
          onDirty(false);
        }
      }}
    >
      <h3>Correspondance de taille</h3>
      <p>
        <strong>{variant.row.taille || "Taille fournisseur absente"}</strong> ·{" "}
        {family?.label || "Famille inconnue"}
      </p>
      <fieldset disabled={blocked}>
        <label>
          Taille retenue
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">À choisir</option>
            {(family?.sizes || []).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <p className="fm-help">
          Les correspondances valent pour ce fournisseur et cette famille. Elles
          ne convertissent aucune mensuration.
        </p>
        <label>
          Justificatif de correspondance
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Précisez ce que le fournisseur a confirmé."
            maxLength={800}
          />
        </label>
        <button className="primary" disabled={!size || !reason.trim()}>
          Enregistrer la correspondance
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setSize("");
              setReason("");
              onDirty(false);
            }}
          >
            Abandonner la correspondance
          </button>
        )}
        {variant.alias && (
          <div className="fm-existing">
            <p>
              {variant.alias.size} · {variant.alias.reason}
            </p>
            <button type="button" disabled={dirty} onClick={onRemove}>
              Retirer la correspondance
            </button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
function RowEditor({ variant, onSave, onRemove, onDirty, blocked }) {
  const [form, setForm] = useState(variant.row),
    [reason, setReason] = useState("");
  const dirty =
    JSON.stringify(form) !== JSON.stringify(variant.row) || Boolean(reason);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty]);
  const labels = {
    titre: "Titre du produit",
    famille: "Famille",
    marque: "Marque",
    licence: "Licence",
    reference: "Référence",
    couleur: "Couleur / motif",
    taille: "Taille fournisseur",
    composition: "Composition déclarée",
    visuel: "Référence du visuel",
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (onSave(form, reason)) {
          setReason("");
          onDirty(false);
        }
      }}
    >
      <p className="fm-help">
        Corrigez les données avec un motif. Les codes fournisseur et produit
        restent ceux du fichier source.
      </p>
      <fieldset disabled={blocked}>
        {Object.entries(labels).map(([key, label]) => (
          <label key={key}>
            {label}
            {key === "famille" ? (
              <select
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              >
                {!Object.hasOwn(FAMILIES, form[key]) && (
                  <option value={form[key]}>{form[key] || "À choisir"}</option>
                )}
                {Object.entries(FAMILIES).map(([value, f]) => (
                  <option key={value} value={value}>
                    {f.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={form[key]}
                maxLength={300}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            )}
          </label>
        ))}
        <label>
          Motif de la correction
          <textarea
            value={reason}
            maxLength={800}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Confirmation reçue ou correction vérifiée."
          />
        </label>
        <button className="primary" disabled={!dirty || !reason.trim()}>
          Enregistrer la correction
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setForm(variant.row);
              setReason("");
              onDirty(false);
            }}
          >
            Abandonner la correction
          </button>
        )}
        {variant.edit && (
          <div className="fm-existing">
            <p>Dernière correction · {variant.edit.reason}</p>
            <button disabled={dirty} type="button" onClick={onRemove}>
              Retirer la correction
            </button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
function ProductReview({ group, onReview, blocked, onDirty }) {
  const [checked, setChecked] = useState(false),
    [note, setNote] = useState("");
  useEffect(() => {
    onDirty(Boolean(checked || note));
  }, [checked, note]);
  return (
    <form
      className="fm-review"
      onSubmit={(e) => {
        e.preventDefault();
        if (checked && onReview(note)) {
          setChecked(false);
          setNote("");
          onDirty(false);
        }
      }}
    >
      <div>
        <h2>Revue du produit · {group.first.titre || group.first.produit}</h2>
        <p>
          {group.variants.length} variantes.{" "}
          {group.review
            ? "Cette version a été relue."
            : group.stale
              ? "Les données ont changé depuis la dernière revue."
              : "La revue porte sur le produit entier."}
        </p>
        {group.issues.length > 0 && (
          <p className="fm-blocked">
            Résolvez les points signalés avant de confirmer.
          </p>
        )}
        {group.review && <p className="fm-approved">{group.review.note}</p>}
      </div>
      <fieldset disabled={blocked || group.issues.length > 0}>
        <label className="fm-checkbox">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          J’ai relu ce produit et toutes ses variantes.
        </label>
        <label>
          Note de revue
          <input
            value={note}
            maxLength={800}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Précisez la vérification effectuée."
          />
        </label>
        <div className="fm-review-actions">
          <button className="primary" disabled={!checked || !note.trim()}>
            Confirmer la revue
          </button>
          {(checked || note) && (
            <button
              type="button"
              onClick={() => {
                setChecked(false);
                setNote("");
                onDirty(false);
              }}
            >
              Abandonner la revue
            </button>
          )}
        </div>
        <p className="fm-help">
          Une modification pertinente remet le produit à relire. Les droits de
          licence et le contenu commercial restent à vérifier.
        </p>
      </fieldset>
    </form>
  );
}
export default function App() {
  useDocumentTitle("French Market · Préparation des déclinaisons");
  const history = useHistory(seed),
    d = history.value,
    groups = analyze(d);
  const [selected, setSelected] = useState("L2"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState(null);
  const [aliasDirty, setAliasDirty] = useState(false),
    [rowDirty, setRowDirty] = useState(false),
    [reviewDirty, setReviewDirty] = useState(false);
  const dirty = aliasDirty || rowDirty || reviewDirty;
  const group =
    groups.find((g) => g.variants.some((v) => v.row.id === selected)) ||
    groups[0];
  const variant =
    group.variants.find((v) => v.row.id === selected) || group.variants[0];
  const editorKey = JSON.stringify([variant.row, variant.alias, variant.edit]);
  const totals = {
    all: d.source.length,
    pending: groups
      .filter((g) => !g.review)
      .reduce((n, g) => n + g.variants.length, 0),
    ready: outputRows(d).length,
  };
  const displayed = groups
    .map((g) => ({
      ...g,
      shown: g.variants.filter(
        (v) =>
          (filter === "all" ||
            (filter === "ready" ? Boolean(g.review) : !g.review)) &&
          `${g.first.titre} ${g.first.produit} ${v.row.reference} ${v.row.couleur} ${v.row.id}`
            .toLocaleLowerCase("fr")
            .includes(query.toLocaleLowerCase("fr")),
      ),
    }))
    .filter((g) => g.shown.length);
  function commit(fn, message) {
    try {
      history.set(fn());
      setError("");
      setNotice(message);
      return true;
    } catch (e) {
      setError(e.message);
      setNotice("");
      return false;
    }
  }
  function step(method, message) {
    method();
    setError("");
    setNotice(message);
    setAliasDirty(false);
    setRowDirty(false);
    setReviewDirty(false);
  }
  async function read(file, kind) {
    try {
      const content = await readLocalFile(file, {
        maxBytes: kind === "json" ? 16777216 : 5242880,
      });
      const data = kind === "json" ? restore(content) : parseArrival(content);
      setPreview({ kind, data, name: file.name });
      setError("");
    } catch (e) {
      setError(e.message);
      setNotice("");
    }
  }
  return (
    <div className="fm-app">
      <header className="fm-header">
        <strong>French Market</strong>
        <span>Prototype indépendant · Catalogue fictif</span>
        <nav aria-label="Sections du dossier">
          <a href="#fm-dossier">Dossier</a>
          <a href="#fm-export">Export</a>
        </nav>
      </header>
      <main>
        <div className="fm-heading">
          <div>
            <h1>Préparer les déclinaisons d’un arrivage</h1>
            <p>
              Associez « Extra Large » à XL, puis vérifiez les références
              partagées.
            </p>
          </div>
          <div className="fm-toolbar">
            <Upload disabled={dirty} onFile={(f) => read(f, "csv")}>
              Importer un arrivage CSV
            </Upload>
            <button
              disabled={dirty}
              onClick={() =>
                downloadCsv(
                  "french-market-modele.csv",
                  HEADERS,
                  seed().source.map((r) => HEADERS.map((k) => r[k])),
                )
              }
            >
              Modèle CSV
            </button>
            <button
              disabled={dirty || !history.canUndo}
              onClick={() =>
                step(history.undo, "Dernière modification annulée.")
              }
            >
              Annuler
            </button>
            <button
              disabled={dirty || !history.canRedo}
              onClick={() => step(history.redo, "Modification rétablie.")}
            >
              Rétablir
            </button>
          </div>
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        {notice && (
          <p role="status" className="fm-notice">
            {notice}
          </p>
        )}
        {dirty && (
          <p className="fm-notice">
            Une saisie est en cours. Enregistrez-la ou abandonnez-la avant de
            changer de ligne ou d’exporter.
          </p>
        )}
        <div className="fm-workspace" id="fm-dossier">
          <section
            className="fm-dossier"
            aria-label="Déclinaisons de l’arrivage"
          >
            <div className="fm-filters">
              <div
                className="fm-tabs"
                role="group"
                aria-label="Filtrer les variantes"
              >
                {[
                  ["all", "Toutes"],
                  ["pending", "À relire"],
                  ["ready", "Relues"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label} ({totals[value]})
                  </button>
                ))}
              </div>
              <label>
                Rechercher
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Produit, référence, couleur…"
                />
              </label>
            </div>
            <div
              className="fm-table-scroll"
              role="region"
              aria-label="Tableau des variantes, défilement horizontal possible"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Couleur / motif</th>
                    <th>Taille fournisseur</th>
                    <th>Visuel déclaré</th>
                    <th>Revue</th>
                  </tr>
                </thead>
                {displayed.map((g) => (
                  <tbody key={g.key}>
                    <tr className="fm-product">
                      <th colSpan={5}>
                        <strong>{g.first.titre || g.first.produit}</strong>
                        <span>
                          {FAMILIES[g.first.famille]?.label ||
                            g.first.famille ||
                            "Famille inconnue"}{" "}
                          · {g.first.marque || "Marque absente"} · Licence{" "}
                          {g.first.licence || "inconnue"}
                        </span>
                        <small>
                          {g.first.fournisseur} · {g.first.produit}
                        </small>
                      </th>
                    </tr>
                    {g.shown.map((v) => (
                      <tr
                        key={v.row.id}
                        className={
                          v.row.id === variant.row.id ? "selected" : ""
                        }
                      >
                        <th scope="row">
                          <button
                            disabled={dirty}
                            aria-pressed={v.row.id === variant.row.id}
                            onClick={() => setSelected(v.row.id)}
                          >
                            {v.row.reference || "Référence absente"}
                            <small>{v.row.id}</small>
                          </button>
                        </th>
                        <td>{v.row.couleur || "Non renseigné"}</td>
                        <td>
                          {v.row.taille || "Absente"}
                          {v.alias && <small>Retenue · {v.size}</small>}
                        </td>
                        <td>{v.row.visuel || "Non renseigné"}</td>
                        <td>
                          <span
                            className={
                              v.issues.length
                                ? "fm-tag issue"
                                : g.review
                                  ? "fm-tag reviewed"
                                  : "fm-tag"
                            }
                          >
                            {v.issues.length
                              ? `${v.issues.length} point${v.issues.length > 1 ? "s" : ""} à préciser`
                              : g.review
                                ? "Relue"
                                : g.stale
                                  ? "À relire à nouveau"
                                  : "À relire"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            {!displayed.length && (
              <p className="fm-empty">
                Aucune variante ne correspond à ces filtres.
              </p>
            )}
            <p className="fm-mobile-jump">
              <a href="#fm-inspector">Examiner la variante sélectionnée</a>
            </p>
            <p className="fm-caption">
              {d.name} · {d.source.length} lignes. Les visuels sont des noms
              déclarés, sans vérification du fichier image.
            </p>
            <details className="fm-rules">
              <summary>Familles et libellés de préparation</summary>
              <p>
                Ces libellés illustrent un dictionnaire de catalogue. Ils ne
                calculent pas les équivalences entre mensurations. Les
                correspondances fournisseur restent à confirmer.
              </p>
              {Object.entries(FAMILIES).map(([k, f]) => (
                <p key={k}>
                  <strong>{f.label}</strong> · {f.sizes.join(", ")}
                </p>
              ))}
            </details>
          </section>
          <aside
            className="fm-inspector"
            id="fm-inspector"
            aria-label="Inspecteur de la variante"
          >
            <h2>Inspecter la déclinaison</h2>
            <p className="fm-selection">
              {variant.row.id} · {variant.row.reference || "Référence absente"}
            </p>
            <SizeEditor
              key={`a${editorKey}`}
              variant={variant}
              blocked={rowDirty || reviewDirty}
              onDirty={setAliasDirty}
              onSave={(size, reason) =>
                commit(
                  () => setAlias(d, variant.row, size, reason),
                  "Correspondance enregistrée. Les produits concernés sont à relire.",
                )
              }
              onRemove={() =>
                commit(
                  () => removeAlias(d, variant.row),
                  "Correspondance retirée.",
                )
              }
            />
            <h3>Source et état actuel</h3>
            <div className="fm-compare">
              <table>
                <thead>
                  <tr>
                    <th>Champ</th>
                    <th>Source</th>
                    <th>Préparé</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["reference", "Référence"],
                    ["couleur", "Couleur"],
                    ["taille", "Taille"],
                    ["visuel", "Visuel"],
                  ].map(([key, label]) => (
                    <tr key={key}>
                      <th>{label}</th>
                      <td>{variant.source[key] || "Absent"}</td>
                      <td>{variant.row[key] || "Absent"}</td>
                    </tr>
                  ))}
                  <tr>
                    <th>Taille retenue</th>
                    <td>Sans objet</td>
                    <td>{variant.size || "À associer"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {variant.issues.length > 0 && (
              <div className="fm-issues">
                <h3>À préciser</h3>
                <ul>
                  {variant.issues.map((i, index) => (
                    <li key={index}>{i}</li>
                  ))}
                </ul>
              </div>
            )}
            <details className="fm-correction">
              <summary>Corriger les données de cette ligne</summary>
              <RowEditor
                key={`r${editorKey}`}
                variant={variant}
                blocked={aliasDirty || reviewDirty}
                onDirty={setRowDirty}
                onSave={(value, reason) =>
                  commit(
                    () => editRow(d, variant.row.id, value, reason),
                    "Correction enregistrée. La source est conservée.",
                  )
                }
                onRemove={() =>
                  commit(
                    () => removeEdit(d, variant.row.id),
                    "Correction retirée.",
                  )
                }
              />
            </details>
          </aside>
        </div>
        <ProductReview
          key={group.signature + Boolean(group.review)}
          group={group}
          blocked={aliasDirty || rowDirty}
          onDirty={setReviewDirty}
          onReview={(note) =>
            commit(
              () => reviewProduct(d, group.key, note),
              "Produit relu pour cette version. Ses variantes sont exportables.",
            )
          }
        />
        <section className="fm-export" id="fm-export">
          <div>
            <h2>Préparation du catalogue</h2>
            <p>
              {totals.ready} variantes relues exportables. {totals.pending}{" "}
              encore à relire.
            </p>
          </div>
          <div className="fm-exports">
            <button
              disabled={dirty || !totals.ready}
              className="primary"
              onClick={() =>
                downloadCsv(
                  "french-market-variantes-relues.csv",
                  OUTPUT_HEADERS,
                  outputRows(d),
                )
              }
            >
              CSV des variantes relues
            </button>
            <button
              disabled={dirty}
              onClick={() =>
                downloadCsv(
                  "french-market-exceptions.csv",
                  ["ligne", "produit", "reference", "reserve", "statut"],
                  exceptions(d),
                )
              }
            >
              Exceptions CSV
            </button>
            <button
              disabled={dirty}
              onClick={() =>
                downloadReport("french-market-rapport.html", report(d))
              }
            >
              Rapport HTML
            </button>
            <button
              disabled={dirty}
              onClick={() => downloadJson("french-market-dossier.json", d)}
            >
              Sauvegarder JSON
            </button>
            <Upload json disabled={dirty} onFile={(f) => read(f, "json")}>
              Reprendre JSON
            </Upload>
          </div>
          <p className="fm-caption">
            Format de préparation indépendant de PrestaShop. Aucune mise en
            ligne. Sauvegardez le dossier avant de fermer cet onglet.
          </p>
        </section>
        <details className="fm-journal">
          <summary>Modifications du dossier ({d.journal.length})</summary>
          {d.journal.length ? (
            <ol>
              {d.journal.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
          ) : (
            <p>Aucune modification enregistrée.</p>
          )}
          <button
            disabled={dirty}
            onClick={() =>
              step(
                history.reset,
                "Exemple rétabli. Cette action peut être annulée.",
              )
            }
          >
            Rétablir l’exemple
          </button>
        </details>
      </main>
      <DemoFooter />
      {preview && (
        <Preview
          value={preview}
          onCancel={() => setPreview(null)}
          onConfirm={() => {
            if (
              commit(
                () =>
                  preview.kind === "json"
                    ? preview.data
                    : replaceArrival(d, preview.data, preview.name),
                "Dossier repris. Les contrôles ont été recalculés.",
              )
            ) {
              setSelected(
                preview.kind === "json"
                  ? preview.data.source[0].id
                  : preview.data[0].id,
              );
              setPreview(null);
              setFilter("all");
              setQuery("");
            }
          }}
        />
      )}
    </div>
  );
}

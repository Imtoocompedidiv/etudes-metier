import React, { useState } from "react";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@fontsource/oswald/500.css";
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
  downloadReport,
  downloadText,
} from "../../shared/files.js";
import {
  initialDossier,
  sides,
  sideLabels,
  fields,
  headers,
  rowKey,
  parseCatalog,
  normalizeDossier,
  validDossier,
  analyze,
  decide,
  removeDecision,
  correctSource,
  removeCorrection,
  replaceState,
  displayValue,
  patchHeaders,
  exceptionHeaders,
  manifest,
  exampleCsv,
} from "./model.js";
import "./styles.css";
const stamp = () => new Date().toISOString();
const labels = {
  same: "Valeurs identiques",
  local: "Correction boutique conservée",
  incoming: "Valeur du flux proposée",
  invalid: "Donnée à préciser",
  conflict: "Arbitrage nécessaire",
};
function Decision({ cell, onCommit, d }) {
  const [choice, setChoice] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const submit = (e) => {
    e.preventDefault();
    setError("");
    try {
      const next = decide(d, cell.key, choice, reason, stamp());
      onCommit(() => next, "Arbitrage enregistré. Le patch a été recalculé.");
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form className="btp-decision" onSubmit={submit}>
      <div>
        <h3>Décision sur {cell.label.toLowerCase()}</h3>
        {cell.stale && (
          <p className="btp-warning">
            La version a changé. L’ancienne décision ne s’applique plus.
          </p>
        )}
        <fieldset>
          <legend>Valeur à conserver</legend>
          {["shop", "feed"].map((side) => (
            <label key={side} className="btp-radio">
              <input
                type="radio"
                name="btp-value"
                value={side}
                checked={choice === side}
                onChange={() => setChoice(side)}
              />
              <span>
                {side === "shop" ? "Garder" : "Prendre"}{" "}
                {displayValue(cell.field, cell.values[side])}
                <small>{sideLabels[side]}</small>
              </span>
            </label>
          ))}
        </fieldset>
      </div>
      <label>
        Motif de la décision
        <textarea
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Précisez ce qui a été confirmé."
        />
      </label>
      <div className="btp-decision-action">
        <button className="btp-primary" type="submit">
          Enregistrer la décision
        </button>
        <p>Une modification du triplet de valeurs invalide cet arbitrage.</p>
      </div>
      {cell.decision && (
        <div className="btp-previous">
          <p>
            <strong>
              {cell.stale ? "Décision précédente" : "Décision enregistrée"}
            </strong>{" "}
            · {cell.decision.choice === "shop" ? "Boutique" : "Flux"} ·{" "}
            {cell.decision.reason}
          </p>
          <button
            type="button"
            onClick={() =>
              onCommit(
                () => removeDecision(d, cell.key, stamp()),
                "Arbitrage retiré.",
              )
            }
          >
            Retirer cette décision
          </button>
        </div>
      )}
      <ErrorMessage>{error}</ErrorMessage>
    </form>
  );
}
function SourceEditor({ d, variant, side, onCommit }) {
  const row = variant.source[side],
    original = d.states[side].rows.find((r) => rowKey(r) === variant.key),
    override = d.overrides.find(
      (x) => x.side === side && x.key === variant.key,
    );
  const [values, setValues] = useState(() =>
      Object.fromEntries(fields.map(([f]) => [f, row?.[f] || ""])),
    ),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  if (!row)
    return (
      <p>
        Cette variante est absente de cet état. Sa création ou sa suppression
        sort du périmètre de ce comparateur.
      </p>
    );
  const save = (e) => {
    e.preventDefault();
    setError("");
    try {
      const next = correctSource(d, side, variant.key, values, reason, stamp());
      onCommit(
        () => next,
        "Source corrigée. Les contrôles et arbitrages ont été recalculés.",
      );
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form className="btp-source-editor" onSubmit={save}>
      <div className="btp-edit-fields">
        {fields.map(([f, l]) => (
          <label key={f}>
            {l}
            <input
              value={values[f]}
              inputMode={f === "designation" ? undefined : "decimal"}
              maxLength={250}
              onChange={(e) => setValues({ ...values, [f]: e.target.value })}
            />
            <small>Importée · {original[f] || "Absente"}</small>
          </label>
        ))}
      </div>
      <label>
        Motif de correction de la source
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={2}
        />
      </label>
      <ErrorMessage>{error}</ErrorMessage>
      <div className="btp-inline">
        <button type="submit">Enregistrer la correction source</button>
        {override && (
          <button
            type="button"
            onClick={() =>
              onCommit(
                () => removeCorrection(d, side, variant.key, stamp()),
                "Correction retirée ; source importée restaurée.",
              )
            }
          >
            Retirer la correction source
          </button>
        )}
      </div>
      {override && (
        <p className="btp-note">Correction actuelle · {override.reason}</p>
      )}
    </form>
  );
}
export default function App() {
  useDocumentTitle("BTPMAT · Comparaison du catalogue");
  const history = useHistory(initialDossier, {
      key: "btpmat:v1",
      validate: validDossier,
    }),
    d = history.value,
    a = analyze(d);
  const [selected, setSelected] = useState('["MOD-A","4M"]'),
    [field, setField] = useState("prix_ht"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [sourceSide, setSourceSide] = useState("feed"),
    [preview, setPreview] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const variant = a.variants.find((v) => v.key === selected) || a.variants[0],
    cell =
      variant.cells.find((c) => c.field === field) ||
      variant.cells.find((c) => c.status === "conflict"),
    visible = a.variants.filter(
      (v) =>
        (filter === "all" ||
          (filter === "exceptions" && v.issues.length) ||
          (filter === "changes" && v.cells.some((c) => c.changed))) &&
        `${v.produit} ${v.variante} ${v.title}`
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
  const upload = async (file, side) => {
    setError("");
    setNotice("");
    setPreview(null);
    try {
      const raw = await readLocalFile(file);
      if (side === "dossier") {
        const dossier = normalizeDossier(JSON.parse(raw));
        setPreview({ side, name: file.name, dossier });
      } else {
        const rows = parseCatalog(raw);
        setPreview({ side, name: file.name, rows });
      }
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
        p.side === "dossier"
          ? p.dossier
          : replaceState(d, p.side, p.rows, p.name, stamp()),
      p.side === "dossier"
        ? "Dossier restauré."
        : "État importé et comparaison recalculée.",
    );
    setPreview(null);
  };
  const undo = () => {
      history.undo();
      setError("");
      setPreview(null);
      setNotice("Modification annulée.");
    },
    redo = () => {
      history.redo();
      setError("");
      setPreview(null);
      setNotice("Modification rétablie.");
    };
  const exportPatch = () => {
    downloadCsv("btpmat-changements.csv", patchHeaders, a.patch);
    setNotice(
      `${a.patch.length} changement${a.patch.length > 1 ? "s" : ""} exporté${a.patch.length > 1 ? "s" : ""}. Les exceptions sont exclues du patch.`,
    );
  };
  const exportExceptions = () => {
    downloadCsv("btpmat-exceptions.csv", exceptionHeaders, a.exceptions);
    setNotice("Exceptions téléchargées.");
  };
  const exportManifest = () => {
    downloadJson("btpmat-manifeste.json", manifest(d));
    setNotice("Manifeste téléchargé avec les trois sources et les décisions.");
  };
  const exportReport = () => {
    downloadReport("btpmat-comparaison.html", {
      title: "BTPMAT · comparaison de catalogue fictif",
      subtitle:
        "Étude indépendante. Patch partiel par champ, sans création, suppression ni écriture dans PrestaShop ou ITECK.",
      sections: [
        {
          title: "Changements préparés",
          headers: patchHeaders,
          rows: a.patch.map((x) => patchHeaders.map((h) => x[h])),
        },
        {
          title: "Exceptions exclues",
          headers: exceptionHeaders,
          rows: a.exceptions.map((x) => exceptionHeaders.map((h) => x[h])),
        },
        ...sides.map((side) => ({
          title: sideLabels[side] + " · données importées",
          headers,
          rows: d.states[side].rows.map((r) => headers.map((h) => r[h])),
        })),
        {
          title: "Corrections de source",
          headers: ["État", "Variante", "Valeurs", "Motif"],
          rows: d.overrides.map((x) => [
            sideLabels[x.side],
            JSON.parse(x.key).join(" / "),
            fields
              .map(([f, l]) => `${l} = ${x.values[f] || "absente"}`)
              .join(" ; "),
            x.reason,
          ]),
        },
        {
          title: "Journal",
          headers: ["Date UTC", "Action"],
          rows: d.journal.map((x) => [x.at, x.action]),
        },
      ],
    });
    setNotice("Rapport HTML téléchargé.");
  };
  return (
    <main className="btp-app">
      <header className="btp-top">
        <strong>
          BTPMAT <span>· étude indépendante</span>
        </strong>
        <p>Données fictives · traitement local</p>
      </header>
      <div className="btp-layout">
        <aside className="btp-catalog" aria-label="Variantes du catalogue">
          <h2>Variantes du catalogue</h2>
          <label>
            Rechercher une variante
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Référence ou désignation"
            />
          </label>
          <label>
            Afficher
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Toutes les variantes</option>
              <option value="exceptions">Avec exceptions</option>
              <option value="changes">Avec changements</option>
            </select>
          </label>
          <div className="btp-variant-list">
            {visible.map((v) => (
              <button
                key={v.key}
                aria-pressed={variant.key === v.key}
                onClick={() => {
                  setSelected(v.key);
                  setField("prix_ht");
                }}
              >
                <strong>
                  {v.produit} / {v.variante}
                </strong>
                <span>{v.title}</span>
                <small className={v.issues.length ? "btp-warning" : ""}>
                  {v.status}
                </small>
              </button>
            ))}
            {!visible.length && <p>Aucune variante pour ce filtre.</p>}
          </div>
          <p className="btp-side-note">
            {visible.length} sur {a.variants.length} variantes. Les produits et
            déclinaisons restent distincts.
          </p>
        </aside>
        <section className="btp-work">
          <div className="btp-heading">
            <h1>Préparer une mise à jour du catalogue</h1>
            <p>Comparez les trois états, puis arbitrez le prix en conflit.</p>
          </div>
          <div className="btp-sources">
            {sides.map((side) => (
              <section key={side}>
                <h2>{sideLabels[side]}</h2>
                <p>{d.states[side].name}</p>
                <span>{d.states[side].rows.length} variantes importées</span>
                <FileImport
                  label={`Importer ${side === "base" ? "la base" : side === "shop" ? "la boutique" : "le flux"}`}
                  accept=".csv,text/csv"
                  onFile={(f) => upload(f, side)}
                />
              </section>
            ))}
          </div>
          <ErrorMessage>{error}</ErrorMessage>
          {notice && (
            <p role="status" className="btp-notice">
              {notice}
            </p>
          )}
          {preview && (
            <section className="btp-preview" aria-label="Aperçu avant import">
              <h2>
                {preview.side === "dossier"
                  ? "Restaurer ce dossier"
                  : "Remplacer " + sideLabels[preview.side]}
              </h2>
              <p>
                {preview.name} ·{" "}
                {preview.rows
                  ? `${preview.rows.length} variantes`
                  : `${preview.dossier.decisions.length} arbitrages et ${preview.dossier.overrides.length} corrections`}
              </p>
              <p>
                Le remplacement est annulable. Un CSV différent retire les
                corrections de cet état et vérifie les décisions sur les
                nouvelles valeurs. Un CSV identique conserve le travail
                effectué.
              </p>
              {preview.rows && (
                <div
                  className="btp-scroll"
                  role="region"
                  aria-label="Aperçu du fichier CSV, tableau défilant"
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
                      {preview.rows.slice(0, 4).map((r) => (
                        <tr key={rowKey(r)}>
                          {headers.map((h) => (
                            <td key={h}>{r[h] || "Absente"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="btp-inline">
                <button className="btp-primary" onClick={accept}>
                  Confirmer l’import
                </button>
                <button onClick={() => setPreview(null)}>
                  Abandonner l’import
                </button>
              </div>
            </section>
          )}
          <section
            className="btp-comparison"
            aria-label="Comparaison de la variante"
          >
            <h2>
              {variant.produit} / {variant.variante}{" "}
              <span>{variant.title}</span>
            </h2>
            {variant.structural ? (
              <div className="btp-structural">
                <h3>{variant.status}</h3>
                <p>{variant.issues[0]}</p>
                <ul>
                  {sides.map((s) => (
                    <li key={s}>
                      {sideLabels[s]} ·{" "}
                      {variant.source[s] ? "Présente" : "Absente"}
                    </li>
                  ))}
                </ul>
                <p>Aucune création ni suppression ne sera inscrite au patch.</p>
              </div>
            ) : (
              <>
                <div
                  className="btp-scroll"
                  role="region"
                  aria-label="Comparaison à trois états, tableau défilant"
                  tabIndex={0}
                >
                  <table className="btp-compare-table">
                    <thead>
                      <tr>
                        <th>Champ</th>
                        <th>Référence</th>
                        <th>Boutique</th>
                        <th>Nouveau flux</th>
                        <th>Résultat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variant.cells.map((c) => (
                        <tr
                          key={c.field}
                          className={c.blocked ? "btp-row-warning" : ""}
                        >
                          <th>
                            {c.status === "conflict" ? (
                              <button
                                className="btp-field-button"
                                onClick={() => setField(c.field)}
                                aria-pressed={cell?.field === c.field}
                              >
                                {c.label}
                              </button>
                            ) : (
                              c.label
                            )}
                          </th>
                          {sides.map((s) => (
                            <td key={s}>
                              <span>{c.raw[s] || "Absente"}</span>
                              {c.field === "prix_ht" &&
                                c.values[s] !== null && (
                                  <small>
                                    {displayValue(c.field, c.values[s])}
                                  </small>
                                )}
                            </td>
                          ))}
                          <td>
                            <strong>
                              {c.blocked
                                ? "À examiner"
                                : displayValue(c.field, c.result)}
                            </strong>
                            <small>
                              {c.resolved
                                ? "Arbitrage appliqué"
                                : labels[c.status]}
                            </small>
                            {c.stale && (
                              <small className="btp-warning">
                                Ancienne décision périmée
                              </small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="btp-note">
                  Comparaison champ par champ. Le patch peut être partiel ; les
                  champs en exception restent exclus.
                </p>
                {cell?.status === "conflict" && (
                  <Decision
                    key={JSON.stringify([
                      variant.key,
                      cell.key,
                      cell.fingerprint,
                      cell.decision,
                    ])}
                    cell={cell}
                    d={d}
                    onCommit={commit}
                  />
                )}
              </>
            )}
            {variant.cells.some((c) => c.errors.length > 0) && (
              <div className="btp-data-errors">
                <h3>Données à préciser</h3>
                <ul>
                  {variant.cells.flatMap((c) =>
                    c.errors.map((e, i) => (
                      <li key={c.field + i}>
                        {c.label} · {e}
                      </li>
                    )),
                  )}
                </ul>
              </div>
            )}
            <details className="btp-correction">
              <summary>Corriger une valeur source de cette variante</summary>
              <p>
                La valeur importée reste conservée. Une correction peut rendre
                un arbitrage périmé.
              </p>
              <label>
                État à corriger
                <select
                  value={sourceSide}
                  onChange={(e) => setSourceSide(e.target.value)}
                >
                  {sides.map((s) => (
                    <option key={s} value={s}>
                      {sideLabels[s]}
                    </option>
                  ))}
                </select>
              </label>
              <SourceEditor
                key={JSON.stringify([
                  variant.key,
                  sourceSide,
                  variant.source[sourceSide],
                ])}
                d={d}
                variant={variant}
                side={sourceSide}
                onCommit={commit}
              />
            </details>
          </section>
          <section className="btp-results">
            <div className="btp-result-head">
              <h2>Changements préparés</h2>
              <div className="btp-inline">
                <button
                  className="btp-primary"
                  disabled={!a.patch.length}
                  onClick={exportPatch}
                >
                  Exporter le patch CSV
                </button>
                <button onClick={exportExceptions}>Exceptions CSV</button>
                <button onClick={exportManifest}>Manifeste JSON</button>
                <button onClick={exportReport}>Rapport HTML</button>
              </div>
            </div>
            <p>
              {a.patch.length} changement{a.patch.length > 1 ? "s" : ""} préparé
              {a.patch.length > 1 ? "s" : ""} · {a.exceptions.length} exception
              {a.exceptions.length > 1 ? "s" : ""} exclue
              {a.exceptions.length > 1 ? "s" : ""} du patch.
            </p>
            <div
              className="btp-scroll"
              role="region"
              aria-label="Aperçu du patch, tableau défilant"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Variante</th>
                    <th>Champ</th>
                    <th>Boutique actuelle</th>
                    <th>Valeur préparée</th>
                    <th>Origine</th>
                  </tr>
                </thead>
                <tbody>
                  {a.patch.map((r) => (
                    <tr key={JSON.stringify([r.produit, r.variante, r.champ])}>
                      <th>
                        {r.produit} / {r.variante}
                      </th>
                      <td>{fields.find(([f]) => f === r.champ)[1]}</td>
                      <td>{r.ancienne_valeur}</td>
                      <td>{r.nouvelle_valeur}</td>
                      <td>{r.origine}</td>
                    </tr>
                  ))}
                  {!a.patch.length && (
                    <tr>
                      <td colSpan={5}>
                        Aucun changement exportable dans l’état courant.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <details className="btp-journal">
            <summary>Journal des opérations ({d.journal.length})</summary>
            {d.journal.length ? (
              <ol>
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
              <p>Aucune opération pour le moment.</p>
            )}
          </details>
          <details className="btp-formats">
            <summary>Formats d’import et exemples</summary>
            <p>
              CSV UTF-8, séparateur point-virgule, virgule ou tabulation. Six
              colonnes obligatoires · {headers.join(", ")}. Prix HT positifs ou
              nuls avec deux décimales au plus ; stock entier 0–1 000 000 et
              délai entier 0–3 650 jours. Une valeur vide reste à préciser.
              Jusqu’à 500 variantes par état.
            </p>
            <div className="btp-inline">
              {sides.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    downloadText(
                      `btpmat-exemple-${s}.csv`,
                      exampleCsv(s),
                      "text/csv;charset=utf-8",
                    );
                    setNotice("Exemple téléchargé.");
                  }}
                >
                  Exemple{" "}
                  {s === "base" ? "base" : s === "shop" ? "boutique" : "flux"}
                </button>
              ))}
            </div>
          </details>
        </section>
      </div>
      <div className="btp-footer-toolbar">
        <div className="btp-inline">
          <button onClick={undo} disabled={!history.canUndo}>
            Annuler
          </button>
          <button onClick={redo} disabled={!history.canRedo}>
            Rétablir
          </button>
          <button
            onClick={() => {
              downloadJson("btpmat-dossier.json", d);
              setNotice("Dossier sauvegardé.");
            }}
          >
            Sauvegarder le dossier
          </button>
          <FileImport
            label="Restaurer le dossier JSON"
            accept=".json,application/json"
            onFile={(f) => upload(f, "dossier")}
          />
          <button
            onClick={() => {
              history.reset();
              setSelected('["MOD-A","4M"]');
              setField("prix_ht");
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
          Format de démonstration indépendant de PrestaShop et ITECK. Aucun
          accès à la boutique. Le journal suit le dossier ; annuler et rétablir
          restent disponibles pendant cette session.
        </p>
        {!history.storageAvailable && (
          <p>
            Stockage local indisponible. Sauvegardez le JSON avant de quitter.
          </p>
        )}
      </div>
      <DemoFooter />
    </main>
  );
}

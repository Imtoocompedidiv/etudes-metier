import { useEffect, useState } from "react";
import { useHistory } from "../../shared/state.js";
import { FileImport, DemoFooter, useDocumentTitle } from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadCsv,
  downloadJson,
  downloadReport,
} from "../../shared/files.js";
import {
  seed,
  groups,
  propose,
  applyProposal,
  editRow,
  addRow,
  removeRow,
  editRules,
  setCheck,
  review,
  reviewed,
  pending,
  restore,
  importCsv,
  csvRows,
  HEADERS,
  FAMILIES,
  INKS,
  CHECKS,
  seriesKey,
} from "./model.js";
import "./styles.css";
const number = (n) => n.toLocaleString("fr-FR");
function RowEditor({ row, onSave, onRemove }) {
  const [draft, setDraft] = useState({ ...row });
  useEffect(() => setDraft({ ...row }), [row]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(row);
  const field = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <section className="selfor-editor" aria-label="Modifier une ligne">
      <div className="selfor-section-title">
        <h2>La ligne sélectionnée</h2>
        <code>{row.id}</code>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(row.id, {
            ...draft,
            qty: Number(draft.qty),
            pack: Number(draft.pack),
          });
        }}
      >
        <label>
          Référence
          <input
            value={draft.sku}
            maxLength={60}
            onChange={(e) => field("sku", e.target.value)}
            required
          />
        </label>
        <label>
          Famille
          <select
            value={draft.family}
            onChange={(e) => field("family", e.target.value)}
          >
            {Object.entries(FAMILIES).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Taille
          <select
            value={draft.size}
            onChange={(e) => field("size", e.target.value)}
          >
            {["S", "M", "L"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Couleur du support
          <input
            value={draft.color}
            maxLength={40}
            onChange={(e) => field("color", e.target.value)}
            required
          />
        </label>
        <label>
          Quantité
          <input
            type="number"
            min="1"
            max="100000"
            step="1"
            value={draft.qty}
            onChange={(e) => field("qty", e.target.value)}
            required
          />
        </label>
        <label>
          Conditionnement
          <input
            type="number"
            min="1"
            max="1000"
            step="1"
            value={draft.pack}
            onChange={(e) => field("pack", e.target.value)}
            required
          />
        </label>
        <label>
          Identifiant du cliché
          <input
            value={draft.plate}
            maxLength={60}
            onChange={(e) => field("plate", e.target.value)}
            required
          />
        </label>
        <label>
          Encre d’impression
          <select
            value={draft.ink}
            onChange={(e) => field("ink", e.target.value)}
          >
            {INKS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="selfor-editor-actions">
          <button className="selfor-primary" disabled={!dirty}>
            Enregistrer la ligne
          </button>
          <button type="button" onClick={() => onRemove(row.id)}>
            Retirer la ligne
          </button>
          <span>
            {dirty
              ? "Modification à enregistrer avant de poursuivre."
              : "Références et lots fictifs, modifiables pour cet essai."}
          </span>
        </div>
      </form>
    </section>
  );
}
function RulesEditor({ rules, onSave }) {
  const [draft, setDraft] = useState(structuredClone(rules));
  useEffect(() => setDraft(structuredClone(rules)), [rules]);
  return (
    <form
      className="selfor-rules-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...draft,
          kraft: {
            total: Number(draft.kraft.total),
            perSize: Number(draft.kraft.perSize),
          },
          papier: {
            total: Number(draft.papier.total),
            perSize: Number(draft.papier.perSize),
          },
        });
      }}
    >
      <label className="selfor-rule-version">
        Libellé de version
        <input
          value={draft.version}
          maxLength={100}
          onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value }))}
          required
        />
      </label>
      {Object.entries(FAMILIES).map(([key, name]) => (
        <fieldset key={key}>
          <legend>{name}</legend>
          <label>
            Minimum de série
            <input
              aria-label={`Minimum de série ${name}`}
              type="number"
              min="1"
              max="10000"
              value={draft[key].total}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  [key]: { ...d[key], total: e.target.value },
                }))
              }
            />
          </label>
          <label>
            Minimum par taille
            <input
              aria-label={`Minimum par taille ${name}`}
              type="number"
              min="1"
              max="10000"
              value={draft[key].perSize}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  [key]: { ...d[key], perSize: e.target.value },
                }))
              }
            />
          </label>
        </fieldset>
      ))}
      <button type="submit">Appliquer les règles de travail</button>
    </form>
  );
}
export default function App() {
  useDocumentTitle("Selfor · Préparer un assortiment");
  const history = useHistory(seed, { max: 50 }),
    s = history.value;
  const [selected, setSelected] = useState("l1"),
    [preferred, setPreferred] = useState(""),
    [filter, setFilter] = useState("all"),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const all = groups(s),
    row = s.rows.find((r) => r.id === selected) || s.rows[0],
    group = all.find((g) => g.key === seriesKey(row)),
    visible = filter === "issues" ? all.filter((g) => g.issues.length) : all;
  const target = group.rows.some((r) => r.id === preferred)
    ? preferred
    : group.rows[0].id;
  let proposal;
  try {
    proposal = propose(s, group.key, target);
  } catch {}
  const issues = pending(s),
    total = s.rows.reduce((n, r) => n + r.qty, 0),
    isReviewed = reviewed(s);
  function act(fn, success) {
    try {
      history.set(fn(s));
      setError("");
      setMessage(success || "Préparation mise à jour.");
      return true;
    } catch (e) {
      setError(e.message);
      setMessage("");
      return false;
    }
  }
  function saveRow(id, changes) {
    act(
      (st) => editRow(st, id, changes),
      "Ligne enregistrée. Les séries ont été recalculées ; la revue précédente est retirée.",
    );
  }
  function duplicate() {
    let n = 1;
    while (s.rows.some((r) => r.id === `ajout-${n}`)) n++;
    const id = `ajout-${n}`;
    if (
      act(
        (st) =>
          addRow(st, { ...row, id, sku: `COPIE-${row.sku}`.slice(0, 60) }),
        "Copie ajoutée. Modifiez sa référence et ses quantités.",
      )
    )
      setSelected(id);
  }
  async function onCsv(file) {
    try {
      const raw = await readLocalFile(file, { maxBytes: 1024 * 1024 });
      act(
        (st) => importCsv(st, raw),
        "Panier importé. Annuler permet de retrouver le panier précédent.",
      );
    } catch (e) {
      setError(e.message);
      setMessage("");
    }
  }
  async function onJson(file) {
    try {
      const restored = restore(
        await readLocalFile(file, { maxBytes: 1024 * 1024 }),
      );
      act(() => restored, "Dossier restauré, avec ses règles et déclarations.");
    } catch (e) {
      setError(e.message);
      setMessage("");
    }
  }
  function output(fn) {
    try {
      fn();
      setError("");
      setMessage("Fichier téléchargé. Aucun devis ni commande n’a été envoyé.");
    } catch (e) {
      setError(e.message);
    }
  }
  function csv() {
    downloadCsv(
      "selfor-composition.csv",
      [
        ...HEADERS,
        "serie",
        "points_quantites",
        "version_regles",
        "etat_preparation",
      ],
      s.rows.map((r, i) => {
        const g = all.find((g) => g.key === seriesKey(r));
        return [
          ...csvRows(s)[i],
          `${FAMILIES[g.family]} / ${g.plate} / ${g.ink}`,
          g.issues.join(" | "),
          s.rules.version,
          isReviewed ? "Préparation relue" : "Brouillon à compléter",
        ];
      }),
    );
  }
  function report() {
    downloadReport("selfor-preparation.html", {
      title: "Préparation d’un assortiment personnalisé",
      subtitle: `Prototype indépendant pour Selfor · Données fictives · ${isReviewed ? "Préparation relue" : "Brouillon à compléter"} · Aucun devis ni BAT`,
      sections: [
        {
          title: "Composition retenue",
          headers: [
            "Référence",
            "Famille",
            "Taille",
            "Support",
            "Quantité",
            "Lot",
            "Cliché",
            "Encre",
          ],
          rows: s.rows.map((r) => [
            r.sku,
            FAMILIES[r.family],
            r.size,
            r.color,
            r.qty,
            r.pack,
            r.plate,
            r.ink,
          ]),
        },
        {
          title: "Contrôle par série",
          headers: [
            "Famille",
            "Cliché",
            "Encre",
            "Quantité",
            "Minimum",
            "Tailles",
            "Points ouverts",
          ],
          rows: all.map((g) => [
            FAMILIES[g.family],
            g.plate,
            g.ink,
            g.total,
            g.rule.total,
            g.sizes
              .map((t) => `${t.size} : ${t.qty} / ${g.rule.perSize}`)
              .join(" ; "),
            g.issues.join(" ; ") || "Seuils de travail atteints",
          ]),
        },
        {
          title: "Questions de préparation",
          headers: ["Point", "Déclaration"],
          rows: Object.entries(CHECKS).map(([k, label]) => [
            label,
            s.checks[k] ? "Renseigné dans le banc" : "À renseigner",
          ]),
        },
        {
          title: "Points restants",
          paragraphs: issues.length
            ? issues
            : [
                "Quantités et trois points de préparation renseignés. Le conseiller doit encore confirmer technique, disponibilité, prix et BAT.",
              ],
        },
        {
          title: "Règles utilisées",
          paragraphs: [
            s.rules.version,
            "Familles, références et lots de démonstration. Règles à confirmer avec le conseiller ; aucune disponibilité ou tarification calculée.",
          ],
          headers: ["Famille", "Minimum série", "Minimum taille"],
          rows: Object.entries(FAMILIES).map(([key, label]) => [
            label,
            s.rules[key].total,
            s.rules[key].perSize,
          ]),
        },
        { title: "Historique de préparation", paragraphs: s.log },
      ],
    });
  }
  return (
    <div className="selfor-app">
      <header className="selfor-header">
        <div>
          <strong>SELFOR</strong>
          <span>Préparation de personnalisation</span>
        </div>
        <p>Prototype indépendant · Références fictives</p>
      </header>
      <main>
        <div className="selfor-heading">
          <div>
            <h1>Composer un assortiment personnalisable</h1>
            <p>
              Ouvrez une référence et changez sa quantité. Les seuils se
              vérifient par série et par taille.
            </p>
          </div>
          <FileImport
            label="Importer un panier CSV"
            accept=".csv,text/csv"
            onFile={onCsv}
          />
        </div>
        <div className="selfor-toolbar">
          <p>
            <strong>{number(total)} pièces</strong> · {s.rows.length} références
            · {all.length} séries
          </p>
          <label>
            Afficher
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Toutes les séries</option>
              <option value="issues">Séries à ajuster</option>
            </select>
          </label>
          <div>
            <button
              disabled={!history.canUndo}
              onClick={() => {
                history.undo();
                setError("");
                setMessage("Dernière action annulée.");
              }}
            >
              Annuler
            </button>
            <button
              disabled={!history.canRedo}
              onClick={() => {
                history.redo();
                setError("");
                setMessage("Action rétablie.");
              }}
            >
              Rétablir
            </button>
          </div>
        </div>
        {error && (
          <p className="selfor-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="selfor-message" role="status">
            {message}
          </p>
        )}
        <div className="selfor-workspace">
          <div className="selfor-order">
            <section aria-label="Panier de préparation">
              <div
                className="selfor-table"
                role="region"
                aria-label="Références, tableau défilable"
                tabIndex="0"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Taille / support</th>
                      <th>Quantité</th>
                      <th>Lot</th>
                      <th>Encre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.flatMap((g) => [
                      <tr className="selfor-group-row" key={g.key}>
                        <th colSpan="5">
                          <button onClick={() => setSelected(g.rows[0].id)}>
                            {FAMILIES[g.family]} · cliché {g.plate}
                            <span>
                              {g.ink} · {g.total} pièces ·{" "}
                              {g.issues.length
                                ? `${g.issues.length} point(s) à revoir`
                                : "Seuils atteints"}
                            </span>
                          </button>
                        </th>
                      </tr>,
                      ...g.rows.map((r) => (
                        <tr
                          key={r.id}
                          className={row.id === r.id ? "selfor-selected" : ""}
                        >
                          <th>
                            <button
                              aria-label={`Modifier ${r.sku}`}
                              onClick={() => setSelected(r.id)}
                            >
                              {r.sku}
                            </button>
                          </th>
                          <td>
                            <b>{r.size}</b> · {r.color}
                          </td>
                          <td>
                            <strong>{number(r.qty)}</strong>
                            {r.qty % r.pack > 0 && (
                              <small>Multiple à revoir</small>
                            )}
                          </td>
                          <td>{r.pack}</td>
                          <td>{r.ink}</td>
                        </tr>
                      )),
                    ])}
                  </tbody>
                </table>
                {!visible.length && (
                  <p className="selfor-empty">
                    Les quantités de toutes les séries respectent les règles de
                    travail.
                  </p>
                )}
              </div>
              <p className="selfor-table-note">
                La couleur du sac peut varier dans une série. Changer l’encre,
                le cliché ou la famille sépare les quantités.
              </p>
              <div className="selfor-order-actions">
                <button onClick={duplicate}>
                  Dupliquer la ligne sélectionnée
                </button>
                <a href="#selfor-line-editor" className="selfor-mobile-link">
                  Aller à la modification
                </a>
              </div>
            </section>
            <div id="selfor-line-editor">
              <RowEditor
                row={row}
                onSave={saveRow}
                onRemove={(id) =>
                  act(
                    (st) => removeRow(st, id),
                    "Ligne retirée. Annuler permet de la retrouver.",
                  )
                }
              />
            </div>
            <section className="selfor-checks">
              <h2>Questions avant devis</h2>
              <p>
                Ces déclarations préparent l’échange avec le conseiller. Aucun
                fichier ni stock n’est interrogé.
              </p>
              {Object.entries(CHECKS).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={s.checks[key]}
                    onChange={(e) =>
                      act(
                        (st) => setCheck(st, key, e.target.checked),
                        "Point de préparation mis à jour.",
                      )
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
              <div className="selfor-review">
                <button
                  onClick={() =>
                    act(
                      review,
                      "Préparation marquée relue sur cette version. Le devis reste à établir par le conseiller.",
                    )
                  }
                  disabled={isReviewed}
                >
                  Marquer la préparation relue
                </button>
                <span>
                  {isReviewed
                    ? "Préparation relue"
                    : `${issues.length} point(s) à compléter`}
                </span>
              </div>
            </section>
          </div>
          <aside className="selfor-series" aria-label="Contrôle de la série">
            <div className="selfor-aside-title">
              <span>Série sélectionnée</span>
              <h2>{FAMILIES[group.family]}</h2>
              <p>
                Cliché <strong>{group.plate}</strong> · Encre {group.ink}
              </p>
            </div>
            <div className="selfor-total">
              <span>Total de la série</span>
              <strong>
                {number(group.total)}{" "}
                <small>/ {number(group.rule.total)}</small>
              </strong>
              <meter
                min="0"
                max={Math.max(group.total, group.rule.total)}
                value={group.total}
                aria-label="Quantité de la série"
              />
              <p>
                {group.total < group.rule.total
                  ? `${number(group.rule.total - group.total)} pièces manquent au minimum global.`
                  : "Minimum global atteint."}
              </p>
            </div>
            <div className="selfor-size-breakdown">
              <h3>Chaque taille compte</h3>
              {group.sizes.map((t) => (
                <div key={t.size}>
                  <strong>Taille {t.size}</strong>
                  <span>
                    {t.qty} / {group.rule.perSize}
                  </span>
                  <b
                    className={
                      t.qty < group.rule.perSize ? "selfor-bad" : "selfor-good"
                    }
                  >
                    {t.qty < group.rule.perSize
                      ? `+${group.rule.perSize - t.qty} requises`
                      : "Seuil atteint"}
                  </b>
                </div>
              ))}
            </div>
            {group.issues.length > 0 ? (
              <div className="selfor-proposal">
                <h3>Proposition d’ajustement</h3>
                <label>
                  Compléter en priorité sur
                  <select
                    value={target}
                    onChange={(e) => setPreferred(e.target.value)}
                  >
                    {group.rows.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.sku} · taille {r.size}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  Les lots sont arrondis, puis les minimums par taille et de
                  série sont complétés. Le complément d’une taille utilise une
                  référence de cette taille.
                </p>
                {proposal ? (
                  <>
                    <ol>
                      {proposal.steps.map((step, i) => (
                        <li key={i}>
                          <div>
                            <strong>+{step.delta}</strong>
                            <span>
                              {step.sku}
                              <small>
                                {step.before} → {step.after} pièces
                              </small>
                            </span>
                          </div>
                          <p>{step.reason}</p>
                        </li>
                      ))}
                    </ol>
                    <div className="selfor-proposal-total">
                      <span>Après acceptation</span>
                      <b>{number(proposal.total)} pièces</b>
                    </div>
                    <button
                      className="selfor-primary"
                      onClick={() =>
                        act(
                          (st) => applyProposal(st, proposal),
                          `Proposition appliquée : +${proposal.delta} pièces. Vous pouvez annuler.`,
                        )
                      }
                    >
                      Appliquer les +{proposal.delta} pièces
                    </button>
                    <small>Aucune quantité n’est modifiée avant ce clic.</small>
                  </>
                ) : (
                  <p role="alert">
                    Impossible de proposer une quantité dans les limites du
                    banc. Ajustez les seuils ou les lignes.
                  </p>
                )}
              </div>
            ) : (
              <div className="selfor-series-ready">
                <strong>Les quantités sont cohérentes.</strong>
                <p>
                  Le conseiller doit encore vérifier technique, disponibilités
                  et devis.
                </p>
              </div>
            )}
            <details className="selfor-detail-issues">
              <summary>Voir les contrôles de cette série</summary>
              {group.issues.length ? (
                <ul>
                  {group.issues.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              ) : (
                <p>Minimum global, taille et conditionnements respectés.</p>
              )}
            </details>
          </aside>
        </div>
        <section className="selfor-outputs">
          <div>
            <h2>
              {isReviewed ? "Préparation relue" : "Exporter le brouillon"}
            </h2>
            <p>
              La fiche conserve les quantités choisies, les règles utilisées et
              les questions ouvertes.
            </p>
          </div>
          <div>
            <button className="selfor-primary" onClick={() => output(csv)}>
              Composition CSV
            </button>
            <button onClick={() => output(report)}>
              Fiche HTML imprimable
            </button>
            <button
              onClick={() =>
                output(() => downloadJson("selfor-dossier.json", s))
              }
            >
              Sauvegarder le dossier
            </button>
          </div>
        </section>
        <details className="selfor-rules">
          <summary>Règles, fichiers d’exemple et reprise du travail</summary>
          <p>
            Base de travail issue du document de personnalisation lié au 17
            septembre 2026. Kraft 600 pièces et 200 par taille ; pochettes
            papier 300 et 100. Faites confirmer les regroupements applicables.
            Les références, lots et matières de cet exemple sont fictifs.
          </p>
          <RulesEditor
            rules={s.rules}
            onSave={(r) =>
              act(
                (st) => editRules(st, r),
                "Règles mises à jour. La revue de la préparation est retirée.",
              )
            }
          />
          <div className="selfor-file-actions">
            <button
              onClick={() =>
                output(() =>
                  downloadCsv("selfor-exemple.csv", HEADERS, csvRows(seed())),
                )
              }
            >
              Télécharger le CSV d’exemple
            </button>
            <FileImport
              label="Restaurer un dossier JSON"
              accept=".json,application/json"
              onFile={onJson}
            />
            <button
              onClick={() => {
                history.reset();
                setSelected("l1");
                setMessage("Exemple initial rechargé.");
                setError("");
              }}
            >
              Recharger l’exemple
            </button>
          </div>
        </details>
        <details className="selfor-history">
          <summary>
            Historique de préparation · {s.log.length} entrée(s)
          </summary>
          <ol>
            {s.log.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ol>
        </details>
        <p className="selfor-local">
          Travail local, sans compte ni sauvegarde automatique. Exportez le
          dossier pour le reprendre. La fiche prépare un échange, elle ne vaut
          ni devis, ni commande, ni BAT.
        </p>
      </main>
      <DemoFooter />
    </div>
  );
}

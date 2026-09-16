import { useState } from "react";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
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
} from "../../shared/files.js";
import {
  initial,
  columns,
  edgeTypes,
  machiningTypes,
  comparisons,
  parsePartsCSV,
  partRows,
  normalizeDossier,
  validDossier,
  normalizePart,
  replacePart,
  deletePart,
  setReview,
  formatValue,
} from "./model.js";
import "./styles.css";

const statuses = {
  added: "Pièce ajoutée",
  removed: "Pièce supprimée",
  changed: "Différences détectées",
  same: "Aucune différence",
};
const sides = [
  ["front", "Avant"],
  ["back", "Arrière"],
  ["left", "Gauche"],
  ["right", "Droit"],
];
function PanelDrawing({ part, title }) {
  if (!part)
    return (
      <figure className="soma-drawing soma-missing">
        <figcaption>{title}</figcaption>
        <div>
          Pièce absente
          <br />
          dans cette version
        </div>
      </figure>
    );
  const scale = 180 / Math.max(part.length, part.width),
    w = part.width * scale,
    h = part.length * scale,
    x = (320 - w) / 2,
    y = 60 + (180 - h) / 2;
  return (
    <figure className="soma-drawing">
      <figcaption>{title}</figcaption>
      <svg
        viewBox="0 0 320 300"
        role="img"
        aria-label={`${part.label}, longueur ${part.length} mm dans le sens du fil, largeur ${part.width} mm. Chants : ${
          sides
            .filter(([k]) => part[k])
            .map(([, v]) => v)
            .join(", ") || "aucun"
        }.`}
      >
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="#f4ede3"
          stroke="#8c8579"
        />
        {[1, 2, 3, 4, 5].map((n) => (
          <line
            key={n}
            x1={x + (w * n) / 6}
            x2={x + (w * n) / 6}
            y1={y + 3}
            y2={y + h - 3}
            stroke="#d7c8b7"
            strokeWidth="1"
          />
        ))}
        {part.front && (
          <line x1={x} x2={x + w} y1={y + h} y2={y + h} className="soma-edge" />
        )}
        {part.back && (
          <line x1={x} x2={x + w} y1={y} y2={y} className="soma-edge" />
        )}
        {part.left && (
          <line x1={x} x2={x} y1={y} y2={y + h} className="soma-edge" />
        )}
        {part.right && (
          <line x1={x + w} x2={x + w} y1={y} y2={y + h} className="soma-edge" />
        )}
        <text x="160" y="20" textAnchor="middle">
          {part.width.toLocaleString("fr-FR")} mm
        </text>
        <text x="160" y={y - 12} textAnchor="middle" className="soma-side">
          Arrière
        </text>
        <text x="160" y={y + h + 26} textAnchor="middle" className="soma-side">
          Avant
        </text>
        <text x={x - 12} y={y + h / 2} textAnchor="end" className="soma-side">
          Gauche
        </text>
        <text x={x + w + 12} y={y + h / 2} className="soma-side">
          Droit
        </text>
        <text x="160" y="291" textAnchor="middle">
          Longueur {part.length.toLocaleString("fr-FR")} mm
        </text>
        <path
          d={`M160 ${y + 15} v${Math.max(h - 30, 2)} m-4 -7 l4 7 4 -7`}
          fill="none"
          stroke="#7f6855"
          strokeWidth="1.5"
        />
      </svg>
    </figure>
  );
}
function PieceEditor({
  part,
  isNew,
  onSave,
  onDelete,
  onCancel,
  comparison,
  onReview,
}) {
  const [draft, setDraft] = useState(part),
    [error, setError] = useState("");
  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(part);
  const save = (e) => {
    e.preventDefault();
    try {
      onSave(normalizePart(draft));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <form className="soma-editor" onSubmit={save}>
      <h2>{isNew ? "Ajouter une pièce" : "Détails de la pièce"}</h2>
      <div className="soma-editor-body">
        <p className="soma-small">
          {isNew ? "Clé nouvelle" : `Clé stable ${part.id}`} · Nouvelle version
        </p>
        {isNew && (
          <label>
            Identifiant
            <input
              value={draft.id}
              onChange={(e) => change("id", e.target.value)}
              required
              maxLength={80}
            />
          </label>
        )}
        <label>
          Étiquette
          <input
            value={draft.label}
            onChange={(e) => change("label", e.target.value)}
            required
            maxLength={180}
          />
        </label>
        <div className="soma-pair">
          {[
            ["length", "Longueur (mm)"],
            ["width", "Largeur (mm)"],
            ["quantity", "Quantité"],
            ["thickness", "Épaisseur (mm)"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                inputMode="decimal"
                value={draft[key]}
                onChange={(e) => change(key, e.target.value)}
                required
              />
            </label>
          ))}
        </div>
        <label>
          Décor
          <input
            value={draft.decor}
            onChange={(e) => change("decor", e.target.value)}
            required
            maxLength={180}
          />
        </label>
        <label>
          Type de chant
          <select
            value={draft.edgeType}
            onChange={(e) => change("edgeType", e.target.value)}
          >
            {edgeTypes.map((v) => (
              <option key={v} value={v}>
                {v || "Aucun"}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Côtés avec chant</legend>
          <div className="soma-checks">
            {sides.map(([k, label]) => (
              <label key={k} className={draft[k] ? "active" : ""}>
                <input
                  type="checkbox"
                  checked={draft[k]}
                  onChange={(e) => change(k, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <details
          className="soma-extra"
          open={Boolean(part.machining || part.notes)}
        >
          <summary>Usinage et remarque</summary>
          <label>
            Usinage
            <select
              value={draft.machining}
              onChange={(e) => change("machining", e.target.value)}
            >
              {machiningTypes.map((v) => (
                <option key={v} value={v}>
                  {v || "Aucun"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Remarque
            <textarea
              value={draft.notes}
              onChange={(e) => change("notes", e.target.value)}
              maxLength={500}
              rows={2}
            />
          </label>
        </details>
        <ErrorMessage>{error}</ErrorMessage>
        <button className="soma-primary" type="submit">
          {isNew ? "Ajouter à la version" : "Enregistrer la pièce"}
        </button>
        {dirty && (
          <p className="soma-small soma-copper" role="status">
            Modifications du formulaire à enregistrer.
          </p>
        )}
        {!isNew && (
          <>
            <button
              type="button"
              disabled={dirty || comparison?.status === "same"}
              onClick={onReview}
            >
              {comparison?.reviewed ? "Retirer la relecture" : "Marquer relue"}
            </button>
            <button
              className="soma-textbutton"
              type="button"
              onClick={onDelete}
            >
              Supprimer de la nouvelle version
            </button>
          </>
        )}
        {isNew && (
          <button type="button" onClick={onCancel}>
            Annuler l’ajout
          </button>
        )}
      </div>
    </form>
  );
}
function Comparison({ item }) {
  if (!item)
    return (
      <section className="soma-comparison">
        <h2>Sélectionnez une pièce</h2>
        <p>Choisissez une ligne ou affichez toutes les pièces.</p>
      </section>
    );
  return (
    <section className="soma-comparison">
      <div className="soma-comparison-title">
        <h2>{item.label}</h2>
        <span className="soma-status">
          {item.status === "changed"
            ? `${item.changes.length} différences`
            : statuses[item.status]}
        </span>
      </div>
      <p className="soma-small">
        {item.id} ·{" "}
        {item.reviewed
          ? "Modification relue"
          : item.status === "same"
            ? "Versions identiques"
            : "À relire"}
      </p>
      <div className="soma-sketches">
        <PanelDrawing part={item.before} title="Avant · version initiale" />
        <PanelDrawing part={item.after} title="Après · nouvelle version" />
      </div>
      <p className="soma-sketch-caption">
        Le fil suit la longueur. Les côtés cuivrés portent un chant.
        <br />
        Croquis indicatif, sans compensation d’épaisseur ni plan machine.
      </p>
      {item.swapped && (
        <p className="soma-alert">
          <strong>Longueur et largeur inversées.</strong> La surface reste
          identique, le sens du fil change.
        </p>
      )}
      <h3>Différences sur cette pièce</h3>
      {item.status === "changed" ? (
        <div
          className="soma-table-scroll"
          role="region"
          aria-label="Différences de la pièce"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Champ</th>
                <th>Version initiale</th>
                <th>Nouvelle version</th>
              </tr>
            </thead>
            <tbody>
              {item.changes.map((c) => (
                <tr key={c.key}>
                  <th>{c.label}</th>
                  <td>{formatValue(c.key, c.before)}</td>
                  <td>{formatValue(c.key, c.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="soma-state-message">
          {item.status === "added"
            ? "Cette pièce entre dans la nouvelle liste. Vérifiez ses dimensions, ses chants et sa quantité."
            : item.status === "removed"
              ? "Cette pièce quitte la liste. Sa suppression doit aussi être relue."
              : "Tous les champs sont identiques entre les deux versions."}
        </p>
      )}
    </section>
  );
}
export default function App() {
  useDocumentTitle("SOMADEC · Relire une liste de débit");
  const h = useHistory(initial, { key: "somadec:v1", validate: validDossier });
  const d = h.value,
    [selected, setSelected] = useState("P-01"),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [pending, setPending] = useState(null),
    [newPart, setNewPart] = useState(null),
    [importKey, setImportKey] = useState(0);
  const entries = comparisons(d),
    changed = entries.filter((e) => e.status !== "same"),
    reviewed = changed.filter((e) => e.reviewed),
    visible = entries.filter(
      (e) =>
        filter === "all" ||
        (filter === "unread" && e.status !== "same" && !e.reviewed) ||
        (filter === "changed" && e.status !== "same"),
    );
  const item = entries.find((e) => e.id === selected);
  function commit(next, action) {
    const at = new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    next.journal = [...next.journal, { at, action }].slice(-500);
    h.set(normalizeDossier(next));
    setError("");
    setFeedback(action);
    setPending(null);
  }
  function changePart(p) {
    try {
      if (newPart && entries.some((v) => v.id === p.id))
        throw Error("Cet identifiant existe déjà dans la nouvelle version.");
      commit(
        replacePart(d, p),
        `${p.label} ${newPart ? "ajoutée" : "enregistrée"}`,
      );
      setSelected(p.id);
      setNewPart(null);
    } catch (e) {
      throw e;
    }
  }
  async function importFile(file, side) {
    setError("");
    setFeedback("");
    setPending(null);
    try {
      const text = await readLocalFile(file);
      if (side === "dossier") {
        setPending({
          kind: side,
          name: file.name,
          value: normalizeDossier(JSON.parse(text)),
        });
      } else {
        setPending({ kind: side, name: file.name, value: parsePartsCSV(text) });
      }
    } catch (e) {
      setError(e.message);
      setImportKey((v) => v + 1);
    }
  }
  function acceptImport() {
    try {
      const next =
        pending.kind === "dossier"
          ? pending.value
          : {
              ...structuredClone(d),
              [pending.kind]: pending.value,
              [`${pending.kind}Label`]: pending.name,
            };
      commit(next, `Import de ${pending.name}`);
      setSelected((next.after[0] || next.before[0])?.id || "");
      setNewPart(null);
    } catch (e) {
      setError(e.message);
    }
  }
  function startAdd() {
    let n = 1;
    while (entries.some((e) => e.id === `N-${n}`)) n++;
    setNewPart({
      ...initial.after[0],
      id: `N-${n}`,
      label: "",
      notes: "",
      front: false,
      left: false,
      right: false,
      back: false,
      edgeType: "",
    });
  }
  function review() {
    try {
      commit(
        setReview(d, item.id),
        `${item.label} : relecture ${item.reviewed ? "retirée" : "confirmée"}`,
      );
    } catch (e) {
      setError(e.message);
    }
  }
  function runExport(type) {
    setError("");
    if (type === "csv") {
      downloadCsv("somadec-nouvelle-liste.csv", columns, partRows(d.after));
    } else if (type === "json") {
      downloadJson("somadec-dossier.json", d);
    } else {
      downloadReport("somadec-relecture.html", {
        title: "Relecture de liste de débit",
        subtitle: `${d.project} · Prototype indépendant, données d’exemple. ${reviewed.length}/${changed.length} pièces modifiées relues.`,
        sections: [
          {
            title: "Périmètre",
            paragraphs: [
              `Version initiale : ${d.beforeLabel}. Nouvelle version : ${d.afterLabel}.`,
              `Longueur dans le sens du fil. Chants repérés avant / arrière / gauche / droit dans le croquis. Aucune correction de cote ni compensation de chant n’est calculée.`,
              `Ce rapport décrit une relecture, sans validation de fabrication ni fichier de commande machine.`,
            ],
          },
          {
            title: "Changements",
            headers: [
              "Clé",
              "Étiquette",
              "Champ",
              "Avant",
              "Après",
              "Relecture",
            ],
            rows: changed.flatMap((e) =>
              e.changes.length
                ? e.changes.map((c) => [
                    e.id,
                    e.label,
                    c.label,
                    formatValue(c.key, c.before),
                    formatValue(c.key, c.after),
                    e.reviewed ? "Relue" : "À relire",
                  ])
                : [
                    [
                      e.id,
                      e.label,
                      statuses[e.status],
                      e.before ? "Présente" : "Absente",
                      e.after ? "Présente" : "Absente",
                      e.reviewed ? "Relue" : "À relire",
                    ],
                  ],
            ),
          },
          {
            title: "Nouvelle liste",
            headers: columns,
            rows: partRows(d.after),
          },
          {
            title: "Journal de ce dossier",
            headers: ["Heure", "Action"],
            rows: d.journal.map((j) => [j.at, j.action]),
          },
        ],
      });
    }
    setFeedback(
      `${type === "csv" ? "Liste CSV" : type === "json" ? "Dossier JSON" : "Rapport HTML"} téléchargé avec les données courantes.`,
    );
  }
  return (
    <div className="soma-app">
      <header className="soma-header">
        <strong>SOMADEC</strong>
        <span>Prototype indépendant · Données fictives</span>
        <div className="soma-history">
          <button
            onClick={() => {
              h.undo();
              setPending(null);
              setNewPart(null);
              setFeedback("Dernière action annulée.");
            }}
            disabled={!h.canUndo}
          >
            Annuler
          </button>
          <button
            onClick={() => {
              h.redo();
              setPending(null);
              setNewPart(null);
              setFeedback("Action rétablie.");
            }}
            disabled={!h.canRedo}
          >
            Rétablir
          </button>
        </div>
      </header>
      <main>
        <div className="soma-heading">
          <h1>Relire une liste de débit</h1>
          <p>
            Changez un côté de chant, enregistrez la pièce et relisez la
            différence.
          </p>
        </div>
        <section className="soma-sources" aria-label="Versions à comparer">
          <div>
            <h2>Versions à comparer</h2>
            <div className="soma-source-pair">
              {[
                ["before", "Version initiale"],
                ["after", "Nouvelle version"],
              ].map(([side, label]) => (
                <div className="soma-source" key={side}>
                  <div>
                    <strong>{label}</strong>
                    <span>{d[`${side}Label`]}</span>
                  </div>
                  <FileImport
                    key={`${importKey}-${side}`}
                    label={`Importer ${side === "before" ? "l’initiale" : "la nouvelle"}`}
                    accept=".csv,text/csv"
                    onFile={(f) => importFile(f, side)}
                  />
                </div>
              ))}
            </div>
          </div>
          <label className="soma-project">
            Projet
            <input
              key={d.project}
              defaultValue={d.project}
              onBlur={(e) => {
                if (e.target.value !== d.project)
                  try {
                    const next = normalizeDossier({
                      ...d,
                      project: e.target.value,
                    });
                    commit(next, "Nom du projet modifié");
                  } catch (err) {
                    setError(err.message);
                    e.target.value = d.project;
                  }
              }}
            />
          </label>
        </section>
        <ErrorMessage>{error}</ErrorMessage>
        <div className="soma-feedback" role="status">
          {feedback}
        </div>
        {pending && (
          <section
            className="soma-import-preview"
            aria-label="Aperçu de l’import"
          >
            <h2>Import prêt à vérifier</h2>
            <p>
              <strong>{pending.name}</strong> ·{" "}
              {pending.kind === "dossier"
                ? `${pending.value.before.length} pièces initiales et ${pending.value.after.length} nouvelles`
                : `${pending.value.length} pièces pour ${pending.kind === "before" ? "la version initiale" : "la nouvelle version"}`}
              . Les données actuelles restent en place jusqu’à confirmation.
            </p>
            <div className="soma-preview-rows">
              {(pending.kind === "dossier"
                ? pending.value.after
                : pending.value
              )
                .slice(0, 6)
                .map((p) => (
                  <span key={p.id}>
                    {p.id} · {p.label} · {p.length} × {p.width} mm
                  </span>
                ))}
            </div>
            <div className="soma-actions">
              <button className="soma-primary" onClick={acceptImport}>
                Confirmer le remplacement
              </button>
              <button onClick={() => setPending(null)}>
                Garder le dossier actuel
              </button>
            </div>
          </section>
        )}
        <div className="soma-workspace">
          <aside className="soma-pieces">
            <div className="soma-list-heading">
              <h2>Pièces ({entries.length})</h2>
              <label>
                Afficher
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Toutes les pièces</option>
                  <option value="changed">Modifiées</option>
                  <option value="unread">À relire</option>
                </select>
              </label>
            </div>
            <nav aria-label="Pièces de la liste">
              {visible.map((e) => (
                <button
                  key={e.id}
                  className={!newPart && selected === e.id ? "selected" : ""}
                  onClick={() => {
                    setSelected(e.id);
                    setNewPart(null);
                  }}
                  aria-current={
                    !newPart && selected === e.id ? "true" : undefined
                  }
                >
                  <strong>{e.label}</strong>
                  <span>
                    <i
                      className={`soma-dot ${e.reviewed ? "reviewed" : e.status}`}
                    />
                    {e.reviewed ? "Modification relue" : statuses[e.status]}
                  </span>
                </button>
              ))}
              {!visible.length && (
                <p className="soma-empty">Aucune pièce dans ce filtre.</p>
              )}
            </nav>
            <button className="soma-add" onClick={startAdd}>
              Ajouter une pièce
            </button>
          </aside>
          <Comparison
            item={
              newPart
                ? {
                    id: newPart.id,
                    label: "Nouvelle pièce",
                    before: null,
                    after: null,
                    changes: [],
                    status: "added",
                    reviewed: false,
                  }
                : item
            }
          />
          {newPart ? (
            <PieceEditor
              key={`new-${newPart.id}`}
              part={newPart}
              isNew
              onSave={changePart}
              onCancel={() => setNewPart(null)}
            />
          ) : item?.after ? (
            <PieceEditor
              key={JSON.stringify(item.after)}
              part={item.after}
              comparison={item}
              onSave={changePart}
              onReview={review}
              onDelete={() =>
                commit(
                  deletePart(d, item.id),
                  `${item.label} supprimée de la nouvelle version`,
                )
              }
            />
          ) : item ? (
            <section className="soma-removed">
              <h2>Pièce supprimée</h2>
              <p>
                La version initiale reste consultable. Vous pouvez relire cette
                suppression ou remettre la pièce dans la nouvelle liste.
              </p>
              <button className="soma-primary" onClick={review}>
                {item.reviewed ? "Retirer la relecture" : "Marquer relue"}
              </button>
              <button
                onClick={() =>
                  commit(
                    replacePart(d, item.before),
                    `${item.label} restaurée depuis l’initiale`,
                  )
                }
              >
                Restaurer la pièce
              </button>
            </section>
          ) : null}
        </div>
        <section className="soma-export">
          <div>
            <h2>Progression de relecture</h2>
            <div className="soma-progress">
              <progress
                aria-label="Pièces modifiées relues"
                value={reviewed.length}
                max={Math.max(changed.length, 1)}
              />
              <span>
                {reviewed.length} sur {changed.length} pièces modifiées relues
              </span>
            </div>
            <p className="soma-small">
              Une nouvelle modification remet la pièce à relire. La fabrication
              reste à valider par l’atelier.
            </p>
          </div>
          <div>
            <h2>Exporter les résultats</h2>
            <div className="soma-actions">
              <button onClick={() => runExport("csv")}>Liste CSV</button>
              <button onClick={() => runExport("html")}>Rapport HTML</button>
              <button onClick={() => runExport("json")}>Dossier JSON</button>
            </div>
          </div>
        </section>
        <div className="soma-details">
          <details>
            <summary>Journal des modifications ({d.journal.length})</summary>
            {d.journal.length ? (
              <ol>
                {[...d.journal].reverse().map((j, i) => (
                  <li key={`${i}-${j.at}`}>
                    <time>{j.at}</time> {j.action}
                  </li>
                ))}
              </ol>
            ) : (
              <p>
                Aucune action enregistrée. Le journal commence avec vos
                modifications.
              </p>
            )}
          </details>
          <details>
            <summary>Fichiers, exemples et limites</summary>
            <p>
              Import CSV séparé par point-virgule, virgule ou tabulation. Les
              clés <code>id</code> restent identiques entre versions ; les
              étiquettes distinguent les pièces. Dimensions en mm, quantité
              entière. Chants à 0 ou 1.
            </p>
            <p>
              Le classeur public de SOMADEC fournit les champs métier. Le CSV de
              cet exemple ajoute une clé stable ; aucun import direct dans
              Opticoupe n’est garanti. Les dimensions finies ou brutes sont à
              préciser avec le BE.
            </p>
            <div className="soma-actions">
              <button
                onClick={() =>
                  downloadCsv(
                    "somadec-initiale-exemple.csv",
                    columns,
                    partRows(initial.before),
                  )
                }
              >
                Exemple initial CSV
              </button>
              <button
                onClick={() =>
                  downloadCsv(
                    "somadec-nouvelle-exemple.csv",
                    columns,
                    partRows(initial.after),
                  )
                }
              >
                Exemple nouvelle CSV
              </button>
              <FileImport
                key={`json-${importKey}`}
                label="Recharger un dossier JSON"
                accept=".json,application/json"
                onFile={(f) => importFile(f, "dossier")}
              />
              <button
                onClick={() => {
                  h.reset();
                  setSelected("P-01");
                  setFilter("all");
                  setNewPart(null);
                  setPending(null);
                  setError("");
                  setFeedback(
                    "Exemple rétabli. Cette action peut être annulée.",
                  );
                }}
              >
                Réinitialiser l’exemple
              </button>
            </div>
            <p>
              Les fichiers restent dans ce navigateur.{" "}
              {h.storageAvailable
                ? "Dossier conservé localement entre deux visites."
                : "La conservation locale est indisponible ; exportez le JSON pour garder votre travail."}{" "}
              L’annulation conserve les 40 dernières actions de cette session.
            </p>
          </details>
        </div>
        <DemoFooter />
      </main>
    </div>
  );
}

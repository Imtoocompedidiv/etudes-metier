import React, { useRef, useState } from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/900.css";
import { useHistory } from "../../shared/state.js";
import { DemoFooter, useDocumentTitle } from "../../shared/ui.jsx";
import {
  downloadCsv,
  downloadJson,
  downloadReport,
  readLocalFile,
} from "../../shared/files.js";
import {
  analyze,
  byteLength,
  importCsv,
  MAX_FILE_BYTES,
  normalize,
  origin,
  plan,
  restore,
  review,
  seed,
  updateRow,
} from "./model.js";
import "./styles.css";

const statusLabel = {
  changed: "Modifié",
  unchanged: "Inchangé",
  excluded: "Exclu",
  error: "À corriger",
};
const displayValue = (value) =>
  value === null ? "null" : value === "" ? "(chaîne vide)" : String(value);
const csvHeaders = [
  "option_name",
  "statut",
  "avant",
  "apres",
  "motif",
  "erreur",
];
const comparisonRows = (a) =>
  a.rows.map((r) => [
    r.name,
    statusLabel[r.status],
    r.value,
    r.status === "excluded" ? r.value : r.output,
    r.reason,
    r.error || "",
  ]);

function SourceEditor({ row, save, onDirty, blocked }) {
  const [value, setValue] = useState(row.value);
  const [excluded, setExcluded] = useState(row.excluded);
  const [reason, setReason] = useState(row.reason);
  const [error, setError] = useState("");
  const dirty =
    value !== row.value || excluded !== row.excluded || reason !== row.reason;
  const change = (nextValue, nextExcluded, nextReason) => {
    setValue(nextValue);
    setExcluded(nextExcluded);
    setReason(nextReason);
    onDirty(
      nextValue !== row.value ||
        nextExcluded !== row.excluded ||
        nextReason !== row.reason,
    );
    setError("");
  };
  return (
    <form
      className="rose-editor"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          save({ value, excluded, reason });
          onDirty(false);
        } catch (e) {
          setError(e.message);
        }
      }}
    >
      <label htmlFor="rose-source">Modifier la valeur source</label>
      <p className="rose-help">
        Conservez l’adresse d’origine. Le remplacement se calcule dans la
        comparaison.
      </p>
      <textarea
        id="rose-source"
        value={value}
        maxLength={50000}
        spellCheck="false"
        disabled={blocked}
        onChange={(e) => change(e.target.value, excluded, reason)}
      />
      <label className="rose-check">
        <input
          type="checkbox"
          checked={excluded}
          disabled={blocked}
          onChange={(e) => change(value, e.target.checked, reason)}
        />
        Exclure cette option du plan
      </label>
      {excluded && (
        <label>
          Motif d’exclusion
          <textarea
            value={reason}
            maxLength={300}
            rows={2}
            required
            disabled={blocked}
            onChange={(e) => change(value, excluded, e.target.value)}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="rose-error">
          {error}
        </p>
      )}
      <div className="rose-actions">
        <button className="rose-pink" disabled={!dirty || blocked}>
          Enregistrer la correction
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => change(row.value, row.excluded, row.reason)}
          >
            Abandonner la saisie
          </button>
        )}
      </div>
    </form>
  );
}

function Comparison({ row }) {
  return (
    <section
      className="rose-comparison"
      id="rose-comparison"
      aria-labelledby="rose-selected"
    >
      <h2 id="rose-selected">{row.name}</h2>
      <p className="rose-help">
        {row.error
          ? "Cette valeur demande un contrôle."
          : row.serialized
            ? "Valeur PHP sérialisée. Les clés restent intactes."
            : "Option texte. Seules les origines HTTP(S) correspondantes sont remplacées."}
      </p>
      {row.excluded && (
        <div className="rose-exclusion">
          <strong>Exclue du plan</strong>
          <p>{row.reason}</p>
          <span>
            La valeur source est conservée. La comparaison reste consultable.
          </span>
        </div>
      )}
      {row.error ? (
        <div className="rose-error">
          <strong>Lecture interrompue</strong>
          <p>{row.error}</p>
          <p>
            {row.excluded
              ? "Source invalide conservée en exception. Elle ne sera pas remplacée."
              : "Corrigez la source ou excluez-la avec un motif pour poursuivre."}
          </p>
        </div>
      ) : (
        <div
          className="rose-table-scroll"
          role="region"
          aria-label="Comparaison des valeurs, défilement horizontal"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Chemin / type</th>
                <th>Valeur d’origine</th>
                <th>Nouvelle valeur</th>
                <th>Octets UTF-8</th>
              </tr>
            </thead>
            <tbody>
              {row.leaves.map((leaf, index) => (
                <tr
                  key={index}
                  className={leaf.before !== leaf.after ? "rose-changed" : ""}
                >
                  <th scope="row">
                    <code>{leaf.path}</code>
                    <small>
                      {
                        {
                          s: "chaîne",
                          N: "null",
                          b: "booléen",
                          i: "entier",
                          d: "décimal",
                        }[leaf.type]
                      }
                    </small>
                  </th>
                  <td>{displayValue(leaf.before)}</td>
                  <td>{displayValue(leaf.after)}</td>
                  <td>
                    {leaf.oldBytes === null
                      ? "Sans chaîne"
                      : `${leaf.oldBytes} → ${leaf.newBytes}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RawValues({ row }) {
  return (
    <div className="rose-raw">
      <h3>{row.serialized ? "Valeur sérialisée" : "Valeur brute"}</h3>
      <div className="rose-raw-label">
        <strong>Avant</strong>
        <span>{byteLength(row.value)} octets</span>
      </div>
      <pre>{row.value || "(chaîne vide)"}</pre>
      <div className="rose-raw-label">
        <strong>
          {row.excluded ? "Source conservée dans le plan" : "Après"}
        </strong>
        <span>
          {row.error && !row.excluded
            ? "Indisponible"
            : `${byteLength(row.excluded ? row.value : row.output)} octets`}
        </span>
      </div>
      <pre>
        {row.error && !row.excluded
          ? "Résultat indisponible tant que la source est invalide."
          : row.excluded
            ? row.value
            : row.output || "(chaîne vide)"}
      </pre>
    </div>
  );
}

function ImportConfirmation({ pending, close, accept }) {
  const ref = useRef(null);
  React.useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="rose-dialog" onCancel={close}>
      <h2>Remplacer le dossier courant ?</h2>
      <p>
        {pending.name} contient {pending.value.rows.length} options. L’import
        reste annulable.
      </p>
      <p>
        Origine {pending.value.from}
        <br />
        Destination {pending.value.to}
      </p>
      <div className="rose-actions">
        <button onClick={close}>Conserver mon dossier</button>
        <button className="rose-pink" onClick={accept}>
          Importer ces options
        </button>
      </div>
    </dialog>
  );
}

export default function App() {
  useDocumentTitle("Le Web en Rose · Options WordPress");
  const history = useHistory(seed, { max: 20 });
  const state = history.value,
    result = analyze(state);
  const [selected, setSelected] = useState("widget_atelier");
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const [from, setFrom] = useState(state.from),
    [to, setTo] = useState(state.to);
  const [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [pending, setPending] = useState(null),
    [resetOpen, setResetOpen] = useState(false);
  const fileInput = useRef(null);
  const originDirty = from !== state.from || to !== state.to;
  const busyEdit = dirty || originDirty;
  const row = result.rows.find((r) => r.name === selected) || result.rows[0];
  const visible = result.rows.filter(
    (r) =>
      r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (filter === "all" || r.status === filter),
  );
  const safe = (fn) => {
    setError("");
    setMessage("");
    try {
      fn();
    } catch (e) {
      setError(e.message);
    }
  };
  const commit = (next, note) => {
    const valid = normalize(next);
    history.set(valid);
    setFrom(valid.from);
    setTo(valid.to);
    setMessage(note);
    setError("");
  };
  const travel = (direction) => {
    history[direction]();
    setDirty(false);
    setError("");
    setMessage(
      direction === "undo"
        ? "Dernière modification annulée."
        : "Modification rétablie.",
    );
  };
  React.useEffect(() => {
    setFrom(state.from);
    setTo(state.to);
  }, [state]);
  const exportReport = () =>
    downloadReport("rose-controle.html", {
      title: "Contrôle des options WordPress",
      subtitle: `${state.from} vers ${state.to}. ${result.reviewed ? "Version relue." : "Document provisoire, version non relue."} Aucune modification de base exécutée.`,
      sections: [
        {
          title: "Périmètre",
          paragraphs: [
            "Sous-ensemble PHP, tableaux et scalaires. Objets, références et sérialisations imbriquées refusés. Le plan doit être vérifié sur une copie sauvegardée. Les exclusions conservent leur source.",
            `Options ${result.rows.length}, changements ${result.changed.length}, erreurs non exclues ${result.blocked.length}, exclusions ${result.excluded.length}.`,
          ],
        },
        {
          title: "Options et décisions",
          headers: csvHeaders,
          rows: comparisonRows(result),
        },
      ],
    });
  return (
    <div className="rose-app">
      <header className="rose-brand">
        <strong>
          Le Web en <span>Rose</span>
        </strong>
        <span>Étude indépendante · JD</span>
      </header>
      <main>
        <div className="rose-heading">
          <div>
            <h1>Changer d’adresse, sans perdre la structure.</h1>
            {result.blocked.length > 0 ? (
              <p>
                Essayez le contrôle. Ouvrez{" "}
                <button
                  className="rose-inline"
                  disabled={busyEdit}
                  onClick={() => {
                    setSelected(result.blocked[0].name);
                    document
                      .getElementById("rose-comparison")
                      ?.scrollIntoView({ block: "start" });
                  }}
                >
                  {result.blocked[0].name}
                </button>
                , puis corrigez sa source ou excluez-la avec un motif.
              </p>
            ) : (
              <p>
                Inspectez les valeurs avant et après remplacement, puis relisez
                cette version pour emporter le plan. Aucune base WordPress n’est
                modifiée.
              </p>
            )}
          </div>
          <div className="rose-actions">
            <button
              className="rose-pink"
              disabled={busyEdit}
              onClick={() => fileInput.current?.click()}
            >
              Importer un CSV / JSON
            </button>
            <button
              disabled={busyEdit}
              onClick={() =>
                downloadCsv(
                  "rose-exemple.csv",
                  ["option_name", "option_value"],
                  seed().rows.map((r) => [r.name, r.value]),
                )
              }
            >
              Exemple CSV
            </button>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept=".csv,.json,text/csv,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError("");
            setMessage("");
            try {
              const raw = await readLocalFile(file, {
                maxBytes: MAX_FILE_BYTES,
              });
              const value = file.name.toLowerCase().endsWith(".json")
                ? restore(raw)
                : importCsv(raw, state);
              setPending({ name: file.name, value });
            } catch (err) {
              setError(err.message);
            }
          }}
        />
        <form
          className="rose-origins"
          onSubmit={(e) => {
            e.preventDefault();
            safe(() => {
              const a = origin(from),
                b = origin(to);
              commit(
                {
                  ...state,
                  from: a,
                  to: b,
                  review:
                    a === state.from && b === state.to ? state.review : null,
                },
                "Comparaison recalculée.",
              );
            });
          }}
        >
          <label>
            Origine
            <input
              value={from}
              disabled={dirty}
              maxLength={300}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Destination
            <input
              value={to}
              disabled={dirty}
              maxLength={300}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button className="rose-black" disabled={dirty}>
            Comparer
          </button>
          {originDirty && (
            <button
              type="button"
              onClick={() => {
                setFrom(state.from);
                setTo(state.to);
                setError("");
              }}
            >
              Abandonner les adresses
            </button>
          )}
        </form>
        {error && (
          <div className="rose-notice rose-error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="rose-notice" role="status">
            {message}
          </div>
        )}
        {busyEdit && (
          <p className="rose-notice">
            Une saisie est en cours. Enregistrez-la ou abandonnez-la avant
            d’exporter ou de changer de dossier.
          </p>
        )}
        <nav className="rose-mobile-nav" aria-label="Zones de travail">
          <a href="#rose-options">Options</a>
          <a href="#rose-comparison">Comparaison</a>
          <a href="#rose-edit">Correction</a>
        </nav>
        <div className="rose-workspace">
          <aside
            className="rose-options"
            id="rose-options"
            aria-label="Options du dossier"
          >
            <label>
              Rechercher une option
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Afficher
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Toutes les options</option>
                {Object.entries(statusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p>
              <strong>{result.changed.length} modifications</strong> ·{" "}
              <span className="rose-accent">
                {result.blocked.length} à corriger
              </span>
            </p>
            <div className="rose-option-list">
              {visible.map((r) => (
                <button
                  key={r.name}
                  className={`rose-option ${r.name === row.name ? "is-selected" : ""}`}
                  aria-pressed={r.name === row.name}
                  disabled={busyEdit}
                  onClick={() => setSelected(r.name)}
                >
                  <i className={`rose-dot ${r.status}`} aria-hidden="true" />
                  <span>
                    <strong>{r.name}</strong>
                    <small>{statusLabel[r.status]}</small>
                  </span>
                </button>
              ))}
              {!visible.length && <p>Aucune option ne correspond au filtre.</p>}
            </div>
          </aside>
          <Comparison row={row} />
          <aside
            className="rose-inspector"
            id="rose-edit"
            aria-label="Texte source et correction"
          >
            <RawValues row={row} />
            <SourceEditor
              key={JSON.stringify([
                row.name,
                row.value,
                row.excluded,
                row.reason,
              ])}
              row={row}
              blocked={originDirty}
              onDirty={setDirty}
              save={(patch) =>
                commit(
                  updateRow(state, row.name, patch),
                  "Correction enregistrée et comparaison recalculée.",
                )
              }
            />
          </aside>
        </div>
        <section className="rose-review" aria-label="Revue du dossier">
          <div>
            <strong>
              {result.blocked.length
                ? `${result.blocked.length} donnée${result.blocked.length > 1 ? "s invalides restent" : " invalide reste"} à résoudre.`
                : result.reviewed
                  ? "Version courante relue."
                  : "Aucune erreur non exclue. Vérifiez les comparaisons avant la revue."}
            </strong>
            <p>
              {result.excluded.length} exclusion
              {result.excluded.length > 1 ? "s" : ""} conservée
              {result.excluded.length > 1 ? "s" : ""} avec motif.
            </p>
          </div>
          <button
            className="rose-pink"
            disabled={busyEdit || result.blocked.length > 0 || result.reviewed}
            onClick={() =>
              safe(() =>
                commit(
                  review(state),
                  "Revue enregistrée pour cette version des données et des adresses.",
                ),
              )
            }
          >
            Marquer cette version relue
          </button>
        </section>
        <section className="rose-exceptions">
          <h2>Exceptions et éléments à corriger</h2>
          {result.rows
            .filter((r) => r.error || r.excluded)
            .map((r) => (
              <div className="rose-exception-row" key={r.name}>
                <strong>{r.name}</strong>
                <span>{r.excluded ? r.reason : r.error}</span>
                <span>
                  {r.excluded
                    ? "Exclue, source conservée"
                    : "Correction requise"}
                </span>
                <button
                  disabled={busyEdit}
                  onClick={() => {
                    setSelected(r.name);
                    document
                      .getElementById("rose-edit")
                      ?.scrollIntoView({ block: "start" });
                  }}
                >
                  Voir {r.name}
                </button>
              </div>
            ))}
        </section>
        <section className="rose-export">
          <div>
            <h2>Emporter le contrôle</h2>
            <p>
              Le dossier JSON reprend exactement la session. Le CSV facilite la
              lecture ; le rapport HTML s’imprime depuis le navigateur.
            </p>
          </div>
          <div className="rose-actions">
            <button
              disabled={busyEdit}
              onClick={() => downloadJson("rose-dossier.json", state)}
            >
              Enregistrer le dossier JSON
            </button>
            <button
              disabled={busyEdit}
              onClick={() =>
                downloadCsv(
                  "rose-comparaison.csv",
                  csvHeaders,
                  comparisonRows(result),
                )
              }
            >
              Exporter la comparaison CSV
            </button>
            <button disabled={busyEdit} onClick={exportReport}>
              Rapport HTML
            </button>
            <button
              className="rose-black"
              disabled={busyEdit || !result.reviewed}
              onClick={() =>
                safe(() => downloadJson("rose-plan.json", plan(state)))
              }
            >
              Exporter le plan relu
            </button>
          </div>
        </section>
        <div className="rose-bottom">
          <p>
            Fichiers traités dans ce navigateur, sans accès à WordPress. Session
            en mémoire ; sauvegardez le dossier pour la reprendre.
          </p>
          <div className="rose-actions">
            <button disabled={busyEdit} onClick={() => setResetOpen(true)}>
              Réinitialiser
            </button>
            <button
              disabled={busyEdit || !history.canUndo}
              onClick={() => travel("undo")}
            >
              Annuler
            </button>
            <button
              disabled={busyEdit || !history.canRedo}
              onClick={() => travel("redo")}
            >
              Rétablir
            </button>
          </div>
        </div>
        <details className="rose-method">
          <summary>Formats et limites du contrôle</summary>
          <p>
            CSV à deux colonnes option_name et option_value, jusqu’à 100
            options. Valeurs jusqu’à 50 000 caractères, 100 000 octets par
            option et 1 Mo au total. Dossier JSON jusqu’à 8 Mo. Origines HTTP(S)
            absolues, sans chemin, paramètres ou identifiants. Les domaines
            voisins, sous-domaines, autres ports et les clés des tableaux
            restent inchangés.
          </p>
          <p>
            Le contrôle prend en charge chaînes UTF-8, tableaux, entiers signés
            64 bits, décimaux finis, booléens et null. Les objets, classes,
            références, chaînes contenant une autre sérialisation, structures de
            plus de 20 niveaux ou 3 000 éléments sont refusés. Les URL échappées
            en JSON et les URL relatives demandent un autre contrôle. Aucune
            commande SQL ni connexion distante n’est produite.
          </p>
        </details>
      </main>
      <DemoFooter />
      {pending && (
        <ImportConfirmation
          pending={pending}
          close={() => setPending(null)}
          accept={() => {
            commit(
              pending.value,
              `${pending.value.rows.length} options importées.`,
            );
            setSelected(pending.value.rows[0].name);
            setFilter("all");
            setSearch("");
            setPending(null);
          }}
        />
      )}
      {resetOpen && (
        <ResetDialog
          close={() => setResetOpen(false)}
          accept={() => {
            commit(seed(), "Exemple initial restauré.");
            setSelected("widget_atelier");
            setFilter("all");
            setSearch("");
            setResetOpen(false);
          }}
        />
      )}
    </div>
  );
}
function ResetDialog({ close, accept }) {
  const ref = useRef(null);
  React.useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog className="rose-dialog" ref={ref} onCancel={close}>
      <h2>Revenir à l’exemple initial ?</h2>
      <p>Le remplacement du dossier restera annulable.</p>
      <div className="rose-actions">
        <button onClick={close}>Conserver mon travail</button>
        <button className="rose-pink" onClick={accept}>
          Restaurer l’exemple
        </button>
      </div>
    </dialog>
  );
}

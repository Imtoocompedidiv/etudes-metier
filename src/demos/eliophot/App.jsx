import React, { useState, useRef } from "react";
import "@fontsource/league-spartan/400.css";
import "@fontsource/league-spartan/600.css";
import "@fontsource/league-spartan/700.css";
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
  choose,
  clearChoice,
  editValue,
  relire,
  restore,
  finalPackage,
  rowsCsv,
  csvHeaders,
  report,
  labelStatus,
  displayCell,
  MAX_BYTES,
} from "./model.js";
import "./styles.css";
const scopeLabels = { base: "Socle", local: "Établissement", target: "Cible" };
function VersionEditor({ row, state, onSave, onDirty }) {
  const initial = { base: row.base, local: row.local, target: row.target };
  const [draft, setDraft] = useState(structuredClone(initial));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const change = (scope, patch) => {
    const next = { ...draft, [scope]: { ...draft[scope], ...patch } };
    setDraft(next);
    onDirty(JSON.stringify(next) !== JSON.stringify(initial));
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
      className="elio-version-editor"
    >
      <div className="elio-values">
        {["base", "local", "target"].map((scope) => (
          <div key={scope} className="elio-value">
            <label htmlFor={`elio-value-${scope}`}>
              {scopeLabels[scope]}{" "}
              {scope === "local" ? "" : state[scope].version}
            </label>
            <textarea
              id={`elio-value-${scope}`}
              value={draft[scope].value}
              disabled={!draft[scope].present}
              maxLength={2000}
              onChange={(e) => change(scope, { value: e.target.value })}
              aria-describedby={`elio-present-${scope}`}
            />
            <label className="elio-presence" id={`elio-present-${scope}`}>
              <input
                type="checkbox"
                checked={draft[scope].present}
                onChange={(e) => change(scope, { present: e.target.checked })}
              />
              Champ présent dans {scopeLabels[scope].toLowerCase()}
            </label>
            {!draft[scope].present && (
              <p className="elio-absent">Champ absent</p>
            )}
          </div>
        ))}
      </div>
      {dirty && (
        <p className="elio-source-warning">
          La modification d’une source remet tous les arbitrages et la revue à
          refaire.
        </p>
      )}
      <div className="elio-edit-actions">
        <button disabled={!dirty} type="submit">
          Enregistrer les valeurs
        </button>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => {
            setDraft(structuredClone(initial));
            onDirty(false);
          }}
        >
          Annuler la saisie
        </button>
      </div>
    </form>
  );
}
function ResultPreview({ site, rows }) {
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const show = (key, fallback) => {
    const r = byKey[key];
    if (!r) return fallback;
    if (!r.result)
      return (
        <span className="elio-preview-pending">
          {r.label} en attente d’arbitrage
        </span>
      );
    if (r.required && (!r.result.present || !r.result.value.trim()))
      return <span className="elio-preview-pending">{r.label} obligatoire à compléter</span>;
    return r.result.present ? r.result.value : null;
  };
  return (
    <section className="elio-preview">
      <div className="elio-section-line">
        <h2>Aperçu du résultat</h2>
        <strong>{site.name}</strong>
      </div>
      <div className="elio-preview-page">
        <h3>{show("heading", "Aperçu des valeurs")}</h3>
        <p>{show("intro", "")}</p>
        {byKey.offer && (
          <p className="elio-preview-offer">{show("offer", "")}</p>
        )}
        <div className="elio-preview-booking">
          <strong>{show("bookingLabel", "Réservation")}</strong>
          <span>{show("bookingUrl", "")}</span>
        </div>
        {byKey.access && <p>{show("access", "")}</p>}
        <small>Aperçu de contenu. Aucun lien de réservation actif.</small>
      </div>
    </section>
  );
}
function Summary({ rows, onSelect }) {
  return (
    <section className="elio-summary">
      <h2>Ce qui sera transmis</h2>
      <p>
        Le paquet final comprend tous les établissements. Il reste bloqué tant
        qu’un contrôle demande une décision.
      </p>
      <div
        className="elio-table-scroll"
        role="region"
        aria-label="Synthèse des champs, défilement horizontal"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Champ</th>
              <th>Socle de départ</th>
              <th>Établissement</th>
              <th>Cible</th>
              <th>Résultat</th>
              <th>Décision</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th>
                  <button onClick={() => onSelect(r.key)}>{r.label}</button>
                </th>
                <td>{displayCell(r.base)}</td>
                <td>{displayCell(r.local)}</td>
                <td>{displayCell(r.target)}</td>
                <td>{displayCell(r.result)}</td>
                <td>
                  {labelStatus[r.status]}
                  {r.choice && (
                    <small>
                      {r.choice === "local"
                        ? "Valeur locale retenue"
                        : "Cible retenue"}
                    </small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export default function App() {
  useDocumentTitle("Eliophot · Recette de variantes");
  const history = useHistory(seed(), { max: 25 }),
    state = history.value;
  const [siteId, setSiteId] = useState(state.sites[0].id),
    [fieldKey, setFieldKey] = useState(state.fields[0].key),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(null),
    [editorVersion, setEditorVersion] = useState(0);
  const file = useRef(null),
    dialog = useRef(null),
    result = analyze(state),
    site = state.sites.find((s) => s.id === siteId) || state.sites[0],
    selectedKey = state.fields.some((f) => f.key === fieldKey)
      ? fieldKey
      : state.fields[0].key,
    rows = result.rows.filter((r) => r.siteId === site.id),
    row = rows.find((r) => r.key === selectedKey);
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
    setEditorVersion((x) => x + 1);
    setMessage(msg);
    setError("");
  };
  const selectField = (k) => {
    if (dirty) {
      setError("Enregistrez ou annulez la saisie avant de changer de champ.");
      return;
    }
    setFieldKey(k);
    setError("");
  };
  const chooseRow = (choice) =>
    safe(() =>
      commit(
        choose(state, site.id, row.key, choice),
        "Arbitrage enregistré pour ce champ.",
      ),
    );
  const inputFile = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    try {
      const next = restore(
        await readLocalFile(picked, { maxBytes: MAX_BYTES }),
      );
      setPending({ name: picked.name, state: next });
      dialog.current.showModal();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="elio-app">
      <header className="elio-header">
        <span className="elio-wordmark">ELIOPHOT</span>
        <span>Étude indépendante · JD</span>
      </header>
      <main>
        <div className="elio-heading">
          <div>
            <h1>Faire évoluer le socle, garder les variantes</h1>
            <p>
              Comparez le modèle commun et les choix de chaque établissement.
            </p>
          </div>
          <div className="elio-actions">
            <button
              className="elio-primary"
              disabled={dirty}
              onClick={() => file.current.click()}
            >
              Importer un dossier
            </button>
            <button
              disabled={dirty}
              onClick={() => downloadJson("eliophot-exemple.json", seed())}
            >
              Exemple JSON
            </button>
            <input
              type="file"
              accept=".json,application/json"
              hidden
              ref={file}
              onChange={inputFile}
            />
          </div>
        </div>
        <div className="elio-version-strip">
          <div>
            <span>Socle de départ</span>
            <strong>{state.base.version}</strong>
          </div>
          <div>
            <span>Version cible</span>
            <strong>{state.target.version}</strong>
          </div>
          <div>
            <span>État du paquet</span>
            <strong className={result.ready ? "elio-ready" : "elio-waiting"}>
              {result.reviewed
                ? "Paquet complet relu"
                : result.ready
                  ? "Prêt à relire"
                  : `${result.issues.length} contrôle${result.issues.length > 1 ? "s" : ""} à terminer`}
            </strong>
          </div>
        </div>
        <p role="status" className="elio-message">
          {message}
        </p>
        {error && (
          <p role="alert" className="elio-error">
            {error}
          </p>
        )}
        <div className="elio-workspace">
          <aside className="elio-sites">
            <h2>Établissements</h2>
            <nav aria-label="Établissements">
              {state.sites.map((s) => {
                const count = result.issues.filter(
                  (x) => x.siteId === s.id,
                ).length;
                return (
                  <button
                    key={s.id}
                    disabled={dirty}
                    aria-pressed={site.id === s.id}
                    onClick={() => {
                      setSiteId(s.id);
                      setError("");
                    }}
                  >
                    <strong>{s.name}</strong>
                    <span>
                      {count
                        ? `${count} contrôle${count > 1 ? "s" : ""}`
                        : "Aucun contrôle ouvert"}
                    </span>
                  </button>
                );
              })}
            </nav>
            <p>
              Version locale issue de <strong>{site.baseVersion}</strong>.
            </p>
          </aside>
          <aside className="elio-fields">
            <h2>Champs de configuration</h2>
            <nav aria-label="Champs de configuration">
              {rows.map((r) => (
                <button
                  disabled={dirty}
                  key={r.key}
                  aria-pressed={r.key === row.key}
                  onClick={() => selectField(r.key)}
                >
                  <span>{r.label}</span>
                  <small>{labelStatus[r.status]}</small>
                </button>
              ))}
            </nav>
          </aside>
          <div className="elio-detail">
            <section className="elio-compare">
              <h2>{row.label}</h2>
              <p>
                {row.required
                  ? "Champ obligatoire dans chaque configuration finale."
                  : "Champ facultatif ; sa suppression peut être conservée."}{" "}
                {row.type === "url"
                  ? "URL HTTPS sans identifiants."
                  : "Texte libre."}
              </p>
              <VersionEditor
                key={`${site.id}:${row.key}:${editorVersion}`}
                row={row}
                state={state}
                onDirty={setDirty}
                onSave={(draft) =>
                  safe(() => {
                    let next = state;
                    for (const scope of ["base", "local", "target"])
                      next = editValue(
                        next,
                        scope,
                        site.id,
                        row.key,
                        draft[scope].present,
                        draft[scope].value,
                      );
                    commit(
                      next,
                      "Sources enregistrées. Tous les arbitrages et la revue sont à refaire.",
                    );
                  })
                }
              />
              <div
                className={`elio-decision ${row.status === "conflict" ? "is-conflict" : ""}`}
              >
                <strong>
                  {row.status === "conflict"
                    ? "Le socle et l’établissement ont changé cette valeur."
                    : labelStatus[row.status]}
                </strong>
                <p>
                  {row.status === "conflict"
                    ? "Ces trois états sont différents. Choisissez la valeur à conserver pour cet établissement."
                    : row.status === "resolved"
                      ? `Arbitrage enregistré. La ${row.choice === "local" ? "valeur locale" : "cible"} sera retenue.`
                      : row.status === "local"
                        ? "Le socle conserve sa valeur de départ. La variante locale est préservée."
                        : row.status === "convergent"
                          ? "L’établissement et le nouveau socle portent déjà le même changement."
                          : row.status === "inherited"
                            ? "L’établissement suit le socle de départ. La nouvelle valeur est reprise."
                            : "Aucune valeur ne change pour ce champ."}
                </p>
              </div>
              {["conflict", "resolved"].includes(row.status) && (
                <div className="elio-resolution">
                  <span>Votre décision</span>
                  <div className="elio-actions">
                    <button
                      disabled={dirty}
                      aria-pressed={row.choice === "local"}
                      onClick={() => chooseRow("local")}
                    >
                      Conserver la valeur locale
                    </button>
                    <button
                      disabled={dirty}
                      aria-pressed={row.choice === "target"}
                      onClick={() => chooseRow("target")}
                    >
                      {row.target.present
                        ? "Adopter le nouveau socle"
                        : "Accepter la suppression"}
                    </button>
                    {row.choice && (
                      <button
                        disabled={dirty}
                        onClick={() =>
                          safe(() =>
                            commit(
                              clearChoice(state, site.id, row.key),
                              "Arbitrage retiré.",
                            ),
                          )
                        }
                      >
                        Retirer l’arbitrage
                      </button>
                    )}
                  </div>
                </div>
              )}
              {result.issues
                .filter(
                  (x) =>
                    x.siteId === site.id &&
                    x.type !== "conflict" &&
                    (!x.key || x.key === row.key),
                )
                .map((x, i) => (
                  <p key={i} className="elio-error">
                    {x.message}
                  </p>
                ))}
            </section>
            <ResultPreview site={site} rows={rows} />
          </div>
        </div>
        <Summary rows={rows} onSelect={selectField} />
        <section className="elio-delivery">
          <div>
            <button
              className="elio-primary"
              disabled={dirty || !result.ready || result.reviewed}
              onClick={() =>
                safe(() =>
                  commit(
                    relire(state),
                    "Paquet complet relu. Les configurations finales peuvent être exportées.",
                  ),
                )
              }
            >
              Relire le paquet
            </button>
            <p>
              {result.reviewed
                ? "Revue attachée à cette version exacte."
                : "Tous les établissements doivent passer les contrôles."}
            </p>
          </div>
          <div className="elio-actions">
            <button
              disabled={dirty}
              onClick={() => downloadJson("eliophot-dossier.json", state)}
            >
              Dossier JSON
            </button>
            <button
              disabled={dirty || !result.reviewed}
              onClick={() =>
                safe(() =>
                  downloadJson(
                    "eliophot-configurations.json",
                    finalPackage(state),
                  ),
                )
              }
            >
              Configurations finales
            </button>
            <button
              disabled={dirty}
              onClick={() =>
                downloadCsv(
                  "eliophot-differences.csv",
                  csvHeaders,
                  rowsCsv(state),
                )
              }
            >
              Différences CSV
            </button>
            <button
              disabled={dirty}
              onClick={() =>
                downloadReport("eliophot-rapport.html", report(state))
              }
            >
              Rapport HTML
            </button>
          </div>
        </section>
        <div className="elio-bottom">
          <p>
            Données fictives. Traitement local. Aucun site modifié. Exportez le
            dossier JSON pour conserver votre travail.
          </p>
          <div className="elio-actions">
            <button
              disabled={dirty || !history.canUndo}
              onClick={() => {
                history.undo();
                setEditorVersion((x) => x + 1);
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
                setEditorVersion((x) => x + 1);
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
        <details className="elio-method">
          <summary>Format et règles de comparaison</summary>
          <p>
            Le dossier contient un schéma de champs, les valeurs des deux socles
            et les snapshots complets des établissements. Une clé absente
            signifie un champ supprimé ; une chaîne vide reste une valeur
            présente. Les identifiants de version servent à contrôler l’origine
            du snapshot. Une version différente bloque le paquet.
          </p>
          <p>
            Quand le local égale le socle de départ, la cible est retenue. Quand
            seule la variante locale change, elle est conservée. Quand les deux
            nouvelles valeurs coïncident, elles convergent. Les autres cas
            demandent un arbitrage. Une modification de source remet toutes les
            décisions à refaire. Les URL sont affichées sans être ouvertes. Le
            résultat n’est pas une migration de base de données.
          </p>
          <p>
            Le JSON documenté accepte 30 champs, 20 établissements, 2 000
            caractères par valeur et 4 Mo par fichier. Les arbitrages importés
            restent liés à leurs trois valeurs exactes ; la revue est vérifiée à
            la reprise. Le dossier conserve les choix, le paquet final ne
            contient que les configurations résolues. Aucun déploiement
            automatique.
          </p>
        </details>
      </main>
      <DemoFooter />
      <dialog
        className="elio-dialog"
        ref={dialog}
        onCancel={() => setPending(null)}
      >
        <h2>
          {pending?.reset ? "Revenir à l’exemple ?" : "Importer ce dossier ?"}
        </h2>
        <p>
          {pending?.reset
            ? "Les modifications courantes seront remplacées. Le retour arrière reste disponible."
            : `${pending?.name || ""} contient ${pending?.state?.sites.length || 0} établissements. Le remplacement restera annulable.`}
        </p>
        <div className="elio-actions">
          <button
            onClick={() => {
              dialog.current.close();
              setPending(null);
            }}
          >
            Conserver mon dossier
          </button>
          <button
            className="elio-primary"
            onClick={() => {
              const next = pending.reset ? seed() : pending.state;
              commit(
                next,
                pending.reset ? "Exemple restauré." : "Dossier importé.",
              );
              setSiteId(next.sites[0].id);
              setFieldKey(next.fields[0].key);
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

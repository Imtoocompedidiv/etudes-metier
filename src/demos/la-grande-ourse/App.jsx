import { useEffect, useState } from "react";
import "@fontsource/lato/latin-400.css";
import "@fontsource/lato/latin-700.css";
import { useHistory } from "../../shared/state.js";
import {
  DemoContext,
  DemoFooter,
  FileImport,
  ErrorMessage,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadJson,
  downloadReport,
  downloadCsv,
} from "../../shared/files.js";
import * as M from "./model.js";
import "./styles.css";

function Catalogue({ state, selected, onSelect }) {
  const [query, setQuery] = useState("");
  const messages = state.messages.filter((m) =>
    (m.key + " " + M.selectedText(m))
      .toLocaleLowerCase("fr")
      .includes(query.toLocaleLowerCase("fr")),
  );
  return (
    <aside className="ourse-catalogue">
      <h2>Messages</h2>
      <label>
        Rechercher un message
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={120}
          type="search"
        />
      </label>
      <nav aria-label="Messages du catalogue">
        {messages.map((m) => (
          <button
            type="button"
            key={m.key}
            aria-pressed={selected === m.key}
            onClick={() => onSelect(m.key)}
          >
            <span>{m.key}</span>
            <small>
              {M.issues(state, m).length
                ? "À corriger"
                : M.isReviewed(state, m)
                  ? "Relu"
                  : "Non relu"}
            </small>
          </button>
        ))}
      </nav>
      {messages.length === 0 && <p>Aucun message pour cette recherche.</p>}
      <p className="ourse-help">
        Le formulaire utilise sept clés fixes. Les autres clés du catalogue
        restent exportables, sans être branchées à cet aperçu.
      </p>
    </aside>
  );
}

function Editor({ state, message, onChange, onReview }) {
  const [draft, setDraft] = useState({
    ...message,
    variants: message.variants.map((v) => ({ ...v })),
  });
  const [note, setNote] = useState(
    "Texte relu dans son contexte et avec les valeurs d’essai.",
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(message);
  const findings = M.issues(state, message);
  const update = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  function apply(e) {
    e.preventDefault();
    onChange(message.key, {
      context: draft.context,
      action: draft.action,
      limit: Number(draft.limit),
      variants: draft.variants,
      selected: draft.selected,
    });
  }
  return (
    <section className="ourse-editor" aria-labelledby="ourse-editor-title">
      <h2 id="ourse-editor-title">{message.key}</h2>
      <form onSubmit={apply}>
        <div className="ourse-context-fields">
          <label>
            Contexte
            <textarea
              value={draft.context}
              onChange={(e) => update("context", e.target.value)}
              maxLength={500}
              required
              rows={2}
            />
          </label>
          <label>
            Action attendue
            <textarea
              value={draft.action}
              onChange={(e) => update("action", e.target.value)}
              maxLength={300}
              required
              rows={2}
            />
          </label>
          <div className="ourse-contract">
            <span>Variables requises</span>
            <strong>
              {message.variables.map((v) => `{${v}}`).join(", ") || "Aucune"}
            </strong>
          </div>
          <label className="ourse-limit">
            Limite déclarée
            <input
              type="number"
              min={1}
              max={2000}
              value={draft.limit}
              onChange={(e) => update("limit", e.target.value)}
              required
            />
          </label>
        </div>
        <p className="ourse-help">
          Comptage en points de code Unicode, après substitution avec les
          valeurs d’essai. Cette limite ne prédit pas le rendu de toutes les
          valeurs de production.
        </p>
        <fieldset>
          <legend>Variantes proposées</legend>
          {draft.variants.map((v) => (
            <div className="ourse-variant" key={v.id}>
              <label className="ourse-radio">
                <input
                  type="radio"
                  name="ourse-variant"
                  checked={draft.selected === v.id}
                  onChange={() => update("selected", v.id)}
                />
                <span>Variante {v.id}</span>
              </label>
              <textarea
                aria-label={`Texte de la variante ${v.id}`}
                value={v.text}
                onChange={(e) =>
                  update(
                    "variants",
                    draft.variants.map((item) =>
                      item.id === v.id
                        ? { ...item, text: e.target.value }
                        : item,
                    ),
                  )
                }
                maxLength={2000}
                rows={3}
              />
              <small>
                {Array.from(M.interpolate(v.text, state.values)).length} /{" "}
                {draft.limit} caractères avec les valeurs d’essai
              </small>
            </div>
          ))}
        </fieldset>
        <div className="ourse-actions">
          <button type="submit">Appliquer</button>
          <button
            type="button"
            className="ourse-link"
            onClick={() =>
              setDraft({
                ...message,
                variants: message.variants.map((v) => ({ ...v })),
              })
            }
            disabled={!dirty}
          >
            Annuler l’édition
          </button>
        </div>
      </form>
      {dirty && (
        <p className="ourse-notice">
          Édition en cours. Appliquez les changements pour les voir dans le
          composant et les contrôler.
        </p>
      )}
      {findings.length > 0 ? (
        <ul className="ourse-findings">
          {findings.map((f, i) => (
            <li key={i}>{f.detail}</li>
          ))}
        </ul>
      ) : (
        <p className="ourse-clear">
          La variante appliquée respecte les critères déclarés.
        </p>
      )}
      <div className="ourse-review">
        <label>
          Note de revue
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={250}
          />
        </label>
        <button
          type="button"
          className="ourse-primary"
          disabled={dirty || findings.length > 0 || !note.trim()}
          onClick={() => onReview(message.key, note)}
        >
          Retenir cette version
        </button>
        <p>
          {M.isReviewed(state, message)
            ? "Version relue avec les valeurs d’essai actuelles."
            : "Aucune revue pour cette version."}
        </p>
      </div>
    </section>
  );
}

function LiveForm({ state, onValues }) {
  const [mode, setMode] = useState("saisie");
  const [email, setEmail] = useState(state.values.email);
  useEffect(() => setEmail(state.values.email), [state.values.email]);
  const t = (key) => M.preview(state, "booking." + key);
  function submit(e) {
    e.preventDefault();
    if (email !== state.values.email) onValues({ ...state.values, email });
    setMode(M.validEmail(email) ? "confirmation" : "erreur");
  }
  const allReviewed = Object.keys(M.CONTRACT).every((key) => {
    const m = state.messages.find((m) => m.key === key);
    return m && M.isReviewed(state, m);
  });
  return (
    <section className="ourse-preview" aria-labelledby="ourse-preview-title">
      <div className="ourse-preview-heading">
        <h2 id="ourse-preview-title">En situation</h2>
        <div
          className="ourse-state-buttons"
          role="group"
          aria-label="État de l’aperçu"
        >
          {["saisie", "erreur", "confirmation"].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={value === mode}
              onClick={() => setMode(value)}
            >
              {value === "saisie"
                ? "Saisie"
                : value === "erreur"
                  ? "Erreur"
                  : "Confirmation"}
            </button>
          ))}
        </div>
      </div>
      <p className="ourse-preview-note">
        {allReviewed
          ? "Textes relus dans cet exemple."
          : "Aperçu des textes appliqués, dont des versions non relues."}
      </p>
      <div className="ourse-live-form">
        <h3>{t("title")}</h3>
        {mode === "confirmation" ? (
          <>
            <p className="ourse-success" role="status">
              {t("success")}
            </p>
            <button type="button" onClick={() => setMode("saisie")}>
              {t("again")}
            </button>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <p>{t("intro")}</p>
            <label>
              {t("email")}
              <input
                aria-label="Adresse e-mail du formulaire fictif"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                aria-invalid={mode === "erreur"}
                aria-describedby={
                  mode === "erreur" ? "ourse-form-error" : undefined
                }
              />
            </label>
            {mode === "erreur" && (
              <p
                id="ourse-form-error"
                className="ourse-form-error"
                role="alert"
              >
                {t("error")}
              </p>
            )}
            <button type="submit">{t("submit")}</button>
          </form>
        )}
        <p className="ourse-fiction">
          Réservation fictive. Aucun message ni demande envoyé.
        </p>
      </div>
      <div className="ourse-preview-help">
        <strong>Valeur d’essai appliquée</strong>
        <code>{state.values.email || "(vide)"}</code>
        <p>
          Valider le formulaire applique l’adresse saisie aux messages et annule
          leurs revues si elle change. Les boutons d’état permettent aussi
          d’inspecter chaque écran.
        </p>
      </div>
    </section>
  );
}

function Delivery({ state, onExport, onRestoreKeys, onValues }) {
  const findings = M.allIssues(state),
    notReviewed = state.messages.filter((m) => !M.isReviewed(state, m)).length;
  const [valuesText, setValuesText] = useState(
    JSON.stringify(state.values, null, 2),
  );
  return (
    <section className="ourse-delivery">
      <div className="ourse-delivery-heading">
        <div>
          <h2>Livraison des textes</h2>
          <p>
            {findings.length
              ? `${findings.length} constat${findings.length > 1 ? "s" : ""} à corriger.`
              : "Aucun écart aux critères déclarés."}{" "}
            {notReviewed} message{notReviewed > 1 ? "s" : ""} non relu
            {notReviewed > 1 ? "s" : ""}.
          </p>
        </div>
        <div className="ourse-export-buttons">
          <button
            type="button"
            disabled={!M.canExport(state)}
            onClick={() => onExport("dictionary")}
          >
            Dictionnaire JSON
          </button>
          <button type="button" onClick={() => onExport("catalogue")}>
            Catalogue complet
          </button>
          <button type="button" onClick={() => onExport("report")}>
            Spécification HTML
          </button>
          <button type="button" onClick={() => onExport("csv")}>
            Constats CSV
          </button>
        </div>
      </div>
      {M.missingKeys(state).length > 0 && (
        <div className="ourse-notice">
          <p>
            Clés du formulaire absentes : {M.missingKeys(state).join(", ")}.
          </p>
          <button type="button" onClick={onRestoreKeys}>
            Remettre les clés du formulaire
          </button>
        </div>
      )}
      <div
        className="ourse-table-scroll"
        role="region"
        aria-label="Tableau de recette, défilement horizontal possible"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th>Clé</th>
              <th>Variables requises</th>
              <th>Variante appliquée</th>
              <th>Revue</th>
            </tr>
          </thead>
          <tbody>
            {state.messages.map((m) => (
              <tr key={m.key}>
                <td>{m.key}</td>
                <td>
                  {m.variables.map((v) => `{${v}}`).join(", ") || "Aucune"}
                </td>
                <td>{M.selectedText(m) || "(texte vide)"}</td>
                <td>
                  {M.issues(state, m).length
                    ? "À corriger"
                    : M.isReviewed(state, m)
                      ? "Relu"
                      : "Non relu"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ourse-help">
        Le dictionnaire conserve les variables et exige la revue de chaque
        message. Le catalogue et la spécification peuvent être exportés avec
        leurs réserves. La revue est une déclaration éditoriale locale, sans
        test utilisateur réalisé.
      </p>
      <details>
        <summary>Valeurs d’essai du catalogue</summary>
        <p>
          Objet JSON, vingt variables maximum. Modifier ces valeurs annule les
          revues ; le formulaire utilise la valeur <code>email</code>.
        </p>
        <label>
          Valeurs JSON
          <textarea
            value={valuesText}
            onChange={(e) => setValuesText(e.target.value)}
            maxLength={10000}
            rows={5}
          />
        </label>
        <button type="button" onClick={() => onValues(valuesText)}>
          Appliquer les valeurs d’essai
        </button>
      </details>
      <details>
        <summary>
          Format d’import et historique ({state.journal.length})
        </summary>
        <p>
          Le catalogue complet exporté fournit le format JSON d’import, limité à
          4 Mio. Il contient les messages, leurs variantes, les valeurs d’essai
          et les revues. Les clés système suivent un contrat fixe de variables.
        </p>
        <ol>
          {state.journal.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export default function App() {
  useDocumentTitle("La grande Ourse · Du message au composant");
  const history = useHistory(M.seed, {
    key: "la-grande-ourse:v1",
    validate: M.valid,
  });
  const state = history.value;
  const [selected, setSelected] = useState("booking.error"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const current =
    state.messages.find((m) => m.key === selected) || state.messages[0];
  function run(action, message) {
    try {
      setError("");
      const next = action();
      if (next) history.set(next);
      setNotice(message);
    } catch (e) {
      setError(e.message);
      setNotice("");
    }
  }
  function values(input) {
    run(() => {
      let v = input;
      if (typeof input === "string") {
        try {
          v = JSON.parse(input);
        } catch {
          throw Error(
            "Les valeurs d’essai doivent être un objet JSON lisible.",
          );
        }
      }
      return M.changeValues(state, v);
    }, "Valeurs appliquées. Les revues sont à refaire.");
  }
  async function imported(file) {
    try {
      const data = M.restore(
        await readLocalFile(file, { maxBytes: M.MAX_JSON_BYTES }),
      );
      history.set(data);
      setSelected(data.messages[0].key);
      setError("");
      setNotice("Catalogue importé.");
    } catch (e) {
      setError(e.message);
    }
  }
  function exported(kind) {
    run(() => {
      if (kind === "dictionary")
        downloadJson("ourse-dictionnaire.json", M.dictionary(state));
      if (kind === "catalogue") downloadJson("ourse-catalogue.json", state);
      if (kind === "report")
        downloadReport("ourse-specification.html", M.report(state));
      if (kind === "csv")
        downloadCsv(
          "ourse-constats.csv",
          ["cle", "controle", "detail"],
          M.allIssues(state).map((f) => [f.key, f.code, f.detail]),
        );
    }, "Fichier exporté depuis le catalogue courant.");
  }
  return (
    <main className="ourse-app">
      <header className="ourse-top">
        <strong>La grande Ourse</strong>
        <span>Étude indépendante · JD</span>
      </header>
      <div className="ourse-intro">
        <h1>Du message au composant</h1>
        <DemoContext company="La grande Ourse">
          Passez le formulaire en erreur, choisissez la variante B qui contient{" "}
          {"{email}"}, puis retenez sa version.
        </DemoContext>
        <div className="ourse-toolbar">
          <button
            type="button"
            disabled={!history.canUndo}
            onClick={() => {
              history.undo();
              setError("");
              setNotice("Dernière modification annulée.");
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!history.canRedo}
            onClick={() => {
              history.redo();
              setError("");
              setNotice("Modification rétablie.");
            }}
          >
            Rétablir
          </button>
          <button
            type="button"
            onClick={() => {
              history.reset();
              setSelected("booking.error");
              setError("");
              setNotice("Exemple restauré.");
            }}
          >
            Exemple
          </button>
          <FileImport
            label="Importer le catalogue"
            accept=".json,application/json"
            onFile={imported}
          />
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        {notice && (
          <p role="status" className="ourse-status">
            {notice}
          </p>
        )}
      </div>
      <div className="ourse-workbench">
        <Catalogue
          state={state}
          selected={current.key}
          onSelect={setSelected}
        />
        <Editor
          key={JSON.stringify(current)}
          state={state}
          message={current}
          onChange={(key, change) =>
            run(() => M.edit(state, key, change), "Message appliqué.")
          }
          onReview={(key, note) =>
            run(() => M.review(state, key, note), "Version retenue et relue.")
          }
        />
        <LiveForm state={state} onValues={values} />
        <Delivery
          key={JSON.stringify(state.values)}
          state={state}
          onExport={exported}
          onRestoreKeys={() =>
            run(() => M.restoreKeys(state), "Clés manquantes restaurées.")
          }
          onValues={values}
        />
      </div>
      {!history.storageAvailable && (
        <p className="ourse-storage">
          Stockage local indisponible. Exportez le catalogue pour conserver vos
          modifications.
        </p>
      )}
      <DemoFooter />
    </main>
  );
}

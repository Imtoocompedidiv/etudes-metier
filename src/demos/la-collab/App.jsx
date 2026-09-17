import React, { useState, useEffect, useRef } from "react";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
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
  MAX_BYTES,
  TYPES,
  seed,
  initialAnswers,
  fingerprint,
  inspect,
  scenarioIssues,
  transition,
  validate,
  evaluate,
  currentRun,
  canDeliver,
  editField,
  editScenario,
  execute,
  parseImport,
  importData,
  deliver,
  resultRows,
  report,
  RESULT_HEADERS,
} from "./model.js";
import "./styles.css";

function FieldEditor({ field, schema, blocked, onSave, onDirty }) {
  const [draft, setDraft] = useState(field),
    [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(field);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty]);
  function patch(value) {
    setDraft({ ...draft, ...value });
    setError("");
  }
  return (
    <form
      className="lc-editor"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave(draft);
          setError("");
          onDirty(false);
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <h3>Configuration du champ sélectionné</h3>
      <p className="lc-meta">
        {field.id} · {TYPES[field.type]}
      </p>
      <fieldset disabled={blocked}>
        <label>
          Libellé du champ
          <input
            value={draft.label}
            maxLength={120}
            onChange={(e) => patch({ label: e.target.value })}
          />
        </label>
        <label>
          Champ source de la condition
          <select
            value={draft.when?.field ?? ""}
            onChange={(e) =>
              patch({
                when: e.target.value
                  ? { field: e.target.value, equals: draft.when?.equals ?? "" }
                  : null,
              })
            }
          >
            <option value="">Toujours visible</option>
            {draft.when &&
              !schema.fields.some((f) => f.id === draft.when.field) && (
                <option value={draft.when.field}>
                  {draft.when.field} (absent)
                </option>
              )}
            {schema.fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label || f.id} ({f.id})
              </option>
            ))}
          </select>
        </label>
        {draft.when && (
          <label>
            Valeur attendue
            <input
              value={draft.when.equals}
              maxLength={2000}
              onChange={(e) =>
                patch({ when: { ...draft.when, equals: e.target.value } })
              }
            />
          </label>
        )}
        <label className="lc-check">
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(e) => patch({ required: e.target.checked })}
          />
          Champ obligatoire lorsqu’il est visible
        </label>
        <label>
          Message d’erreur
          <input
            value={draft.error}
            maxLength={300}
            onChange={(e) => patch({ error: e.target.value })}
          />
        </label>
        <details>
          <summary>Aide et valeurs proposées</summary>
          <label>
            Aide du champ
            <textarea
              value={draft.help}
              maxLength={500}
              onChange={(e) => patch({ help: e.target.value })}
            />
          </label>
          {draft.type === "select" && (
            <ul>
              {draft.options.map((o) => (
                <li key={o.value}>
                  <code>{o.value}</code> · {o.label}
                </li>
              ))}
            </ul>
          )}
          <p className="lc-meta">
            Les types et options se modifient dans le schéma JSON documenté.
          </p>
        </details>
        <ErrorMessage>{error}</ErrorMessage>
        <button className="lc-black" disabled={!dirty}>
          Appliquer la règle
        </button>
        {dirty && (
          <button
            type="button"
            className="lc-link-button"
            onClick={() => {
              setDraft(field);
              setError("");
              onDirty(false);
            }}
          >
            Abandonner la saisie
          </button>
        )}
      </fieldset>
    </form>
  );
}
function Trial({ schema, blocked }) {
  const known = new Set(schema.fields.map((f) => f.id));
  const [state, setState] = useState(() =>
      transition(
        schema,
        {},
        Object.fromEntries(
          Object.entries(initialAnswers()).filter(([k]) => known.has(k)),
        ),
      ),
    ),
    [checked, setChecked] = useState(false);
  const faults = inspect(schema),
    errors = checked ? validate(schema, state.answers) : [];
  function answer(id, value) {
    setState((previous) =>
      transition(schema, previous.answers, { [id]: value }),
    );
    setChecked(false);
  }
  return (
    <section className="lc-trial" id="lc-try" aria-labelledby="lc-try-title">
      <h2 id="lc-try-title">Essayer le formulaire</h2>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setChecked(true);
        }}
      >
        <fieldset disabled={blocked}>
          {checked && errors.length > 0 && (
            <div className="lc-error-summary" role="alert">
              <strong>
                {errors.length} champ{errors.length > 1 ? "s" : ""} à corriger
              </strong>
              <ul>
                {errors.map((e) => (
                  <li key={e.field}>
                    <a
                      href={"#lc-field-" + e.field}
                      onClick={(event) => {
                        event.preventDefault();
                        document.getElementById("lc-field-" + e.field)?.focus();
                      }}
                    >
                      {e.message}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {schema.fields.map((f) => {
            if (state.visible[f.id] !== true)
              return state.visible[f.id] === null ? (
                <p key={f.id} className="lc-warning">
                  {f.label || f.id} ne peut pas être évalué tant que sa
                  condition est invalide.
                </p>
              ) : null;
            const id = "lc-field-" + f.id,
              err = errors.find((e) => e.field === f.id),
              description =
                [f.help ? id + "-help" : null, err ? id + "-error" : null]
                  .filter(Boolean)
                  .join(" ") || undefined;
            const props = {
              id,
              value: state.answers[f.id] ?? "",
              required: f.required,
              "aria-invalid": Boolean(err),
              "aria-describedby": description,
              maxLength: 2000,
              onChange: (e) => answer(f.id, e.target.value),
            };
            return (
              <div className="lc-form-field" key={f.id}>
                {f.type === "select" && f.options.length <= 3 ? (
                  <fieldset
                    className="lc-choice"
                    aria-describedby={description}
                  >
                    <legend>
                      {f.label || f.id}
                      {f.required ? " *" : ""}
                    </legend>
                    {f.options.map((o, i) => (
                      <label key={o.value}>
                        <input
                          id={i === 0 ? id : undefined}
                          type="radio"
                          name={"trial-" + f.id}
                          value={o.value}
                          checked={state.answers[f.id] === o.value}
                          required={f.required}
                          onChange={() => answer(f.id, o.value)}
                        />
                        {o.label}
                      </label>
                    ))}
                  </fieldset>
                ) : f.type === "checkbox" ? (
                  <label className="lc-check">
                    <input
                      id={id}
                      type="checkbox"
                      checked={state.answers[f.id] === "oui"}
                      aria-describedby={description}
                      aria-invalid={Boolean(err)}
                      onChange={(e) =>
                        answer(f.id, e.target.checked ? "oui" : "")
                      }
                    />
                    {f.label || f.id}
                    {f.required ? " *" : ""}
                  </label>
                ) : (
                  <>
                    <label htmlFor={id}>
                      {f.label || f.id}
                      {f.required ? " *" : ""}
                    </label>
                    {f.type === "textarea" ? (
                      <textarea {...props} />
                    ) : f.type === "select" ? (
                      <select {...props}>
                        <option value="">Choisir</option>
                        {f.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        {...props}
                        type={f.type === "email" ? "email" : "text"}
                      />
                    )}
                  </>
                )}
                {f.help && (
                  <p className="lc-meta" id={id + "-help"}>
                    {f.help}
                  </p>
                )}
                {err && (
                  <p className="lc-field-error" id={id + "-error"}>
                    {err.message}
                  </p>
                )}
              </div>
            );
          })}
          <button disabled={faults.length > 0}>Vérifier la saisie</button>
          <p className="lc-meta">
            * Champ obligatoire quand il est visible. Aucune demande envoyée.
          </p>
        </fieldset>
      </form>
      {state.cleared.length > 0 && (
        <p className="lc-purged" role="status">
          Valeur{state.cleared.length > 1 ? "s" : ""} retirée
          {state.cleared.length > 1 ? "s" : ""} des réponses actives :{" "}
          {state.cleared.join(", ")}.
        </p>
      )}
      {checked && errors.length === 0 && !faults.length && (
        <p className="lc-success" role="status">
          La saisie respecte les contrôles déclarés. Elle reste dans ce
          navigateur.
        </p>
      )}
      <details>
        <summary>Réponses actives de cet essai</summary>
        <pre>{JSON.stringify(state.answers, null, 2)}</pre>
        <p className="lc-meta">
          Les réponses cachées sont retirées immédiatement. Elles ne
          réapparaissent pas en changeant de profil.
        </p>
      </details>
    </section>
  );
}
function ScenarioEditor({ scenario, blocked, onDirty, onSave }) {
  const initial = JSON.stringify(scenario, null, 2),
    [raw, setRaw] = useState(initial),
    [error, setError] = useState("");
  const dirty = raw !== initial;
  useEffect(() => {
    onDirty(dirty);
  }, [dirty]);
  return (
    <details className="lc-scenario-editor">
      <summary>Modifier les attentes de ce scénario</summary>
      <p className="lc-meta">
        Chaque étape fixe des réponses et les identifiants attendus. Les
        attentes sont indépendantes du calcul.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const parsed = JSON.parse(raw);
            onSave(parsed);
            setError("");
            onDirty(false);
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <fieldset disabled={blocked}>
          <label>
            Scénario JSON
            <textarea
              className="lc-code"
              spellCheck={false}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          </label>
          <ErrorMessage>{error}</ErrorMessage>
          <div className="lc-actions">
            <button disabled={!dirty}>Appliquer le scénario</button>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setRaw(initial);
                  setError("");
                  onDirty(false);
                }}
              >
                Abandonner le scénario
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </details>
  );
}
function ImportDialog({ preview, onConfirm, onClose }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog ref={ref} className="lc-dialog" onCancel={onClose}>
      <h2>
        {preview.kind === "reset"
          ? "Rétablir l’exemple"
          : "Importer le fichier"}
      </h2>
      <p>
        {preview.kind === "reset"
          ? "Les champs, scénarios et résultats seront remplacés par l’exemple initial."
          : preview.kind === "dossier"
            ? "Le schéma, les scénarios et le journal du fichier remplaceront le dossier actuel."
            : preview.kind === "schema"
              ? `${preview.data.fields.length} champs reçus. Les scénarios actuels seront conservés et vérifiés contre ce schéma.`
              : `${preview.data.length} scénarios reçus. Le schéma actuel sera conservé.`}
      </p>
      {preview.kind === "schema" && (
        <ul>
          {preview.data.fields.map((f) => (
            <li key={f.id}>
              {f.id} · {f.label || "Libellé absent"}
            </li>
          ))}
        </ul>
      )}
      <p>
        L’essai du formulaire sera remis à zéro. Vous pourrez annuler cette
        opération.
      </p>
      <div className="lc-actions">
        <button onClick={onClose}>Annuler l’opération</button>
        <button className="lc-black" onClick={onConfirm}>
          Confirmer
        </button>
      </div>
    </dialog>
  );
}
export default function App() {
  useDocumentTitle("La Collab · Recette de formulaire");
  const h = useHistory(seed),
    d = h.value,
    version = fingerprint(d),
    faults = [...inspect(d.schema), ...scenarioIssues(d)],
    run = currentRun(d) ? evaluate(d) : null;
  const [selected, setSelected] = useState("societe"),
    [selectedTest, setSelectedTest] = useState("retour_particulier"),
    [fieldDirty, setFieldDirty] = useState(false),
    [testDirty, setTestDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState(null),
    [trialRevision, setTrialRevision] = useState(0);
  const upload = useRef(),
    dirty = fieldDirty || testDirty,
    active =
      d.schema.fields.find((f) => f.id === selected) ?? d.schema.fields[0],
    test = d.scenarios.find((s) => s.id === selectedTest) ?? d.scenarios[0],
    result = run?.results.find((s) => s.id === test.id);
  function commit(fn, message) {
    const next = fn();
    h.set(next);
    setError("");
    setNotice(message);
  }
  function safe(fn, message) {
    try {
      commit(fn, message);
    } catch (err) {
      setError(err.message);
      setNotice("");
    }
  }
  async function read(file) {
    try {
      setPreview(parseImport(await readLocalFile(file, MAX_BYTES)));
      setError("");
    } catch (err) {
      setError(err.message);
      setNotice("");
    }
  }
  function travel(fn) {
    fn();
    setError("");
    setNotice("Version du dossier changée ; essai du formulaire remis à zéro.");
    setTrialRevision((v) => v + 1);
  }
  return (
    <div className="lc-app">
      <header>
        <strong>La Collab</strong>
        <span>Étude indépendante</span>
        <span>Données fictives</span>
      </header>
      <main>
        <div className="lc-heading">
          <div>
            <h1>Recetter les branches d’un formulaire</h1>
            <p>
              Corrigez la condition du champ Société, puis rejouez les
              scénarios.
            </p>
          </div>
          <div className="lc-actions">
            <button
              className="lc-black"
              disabled={dirty}
              onClick={() => upload.current.click()}
            >
              Importer JSON
            </button>
            <input
              hidden
              type="file"
              accept=".json,application/json"
              ref={upload}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) read(file);
              }}
            />
            <button
              disabled={dirty || !h.canUndo}
              onClick={() => travel(h.undo)}
            >
              Annuler
            </button>
            <button
              disabled={dirty || !h.canRedo}
              onClick={() => travel(h.redo)}
            >
              Rétablir
            </button>
          </div>
        </div>
        <nav className="lc-mobile-nav" aria-label="Parties de l’atelier">
          <a href="#lc-fields">Champs</a>
          <a href="#lc-try">Formulaire</a>
          <a href="#lc-tests">Scénarios</a>
        </nav>
        <ErrorMessage>{error}</ErrorMessage>
        {notice && (
          <p className="lc-notice" role="status">
            {notice}
          </p>
        )}
        {dirty && (
          <p className="lc-warning" role="status">
            Appliquez ou abandonnez la saisie avant de changer de sélection, de
            rejouer ou d’exporter.
          </p>
        )}
        <div className="lc-workspace">
          <section className="lc-fields" id="lc-fields">
            <h2>Champs et conditions</h2>
            <div className="lc-field-list">
              {d.schema.fields.map((f) => (
                <button
                  disabled={dirty}
                  key={f.id}
                  aria-pressed={active.id === f.id}
                  onClick={() => setSelected(f.id)}
                >
                  <strong>{f.label || f.id}</strong>
                  <span>
                    {f.when
                      ? `${f.when.field} = ${f.when.equals || "(vide)"}`
                      : "Toujours visible"}
                  </span>
                  {faults.some((i) => i.field === f.id) && (
                    <span className="lc-field-warning">À vérifier</span>
                  )}
                </button>
              ))}
            </div>
            <FieldEditor
              key={version + active.id}
              field={active}
              schema={d.schema}
              blocked={testDirty}
              onDirty={setFieldDirty}
              onSave={(raw) =>
                commit(
                  () => editField(d, active.id, raw),
                  "Règle appliquée. Rejouez les scénarios pour vérifier les effets.",
                )
              }
            />
          </section>
          <Trial
            key={version + trialRevision}
            schema={d.schema}
            blocked={dirty}
          />
          <section className="lc-tests" id="lc-tests">
            <div className="lc-section-heading">
              <h2>Scénarios de référence</h2>
              <button
                className="lc-black"
                disabled={dirty || faults.length > 0}
                onClick={() =>
                  safe(
                    () => execute(d),
                    "Scénarios rejoués. Les résultats comparent les attentes et les valeurs observées.",
                  )
                }
              >
                Rejouer les scénarios
              </button>
            </div>
            <div
              className="lc-scroll"
              tabIndex={0}
              role="region"
              aria-label="Résultats des scénarios"
            >
              <table>
                <thead>
                  <tr>
                    <th>Scénario</th>
                    <th>Étapes</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {d.scenarios.map((s) => {
                    const r = run?.results.find((r) => r.id === s.id);
                    return (
                      <tr
                        key={s.id}
                        className={test.id === s.id ? "lc-selected" : ""}
                      >
                        <th>
                          <button
                            disabled={dirty}
                            aria-pressed={test.id === s.id}
                            onClick={() => setSelectedTest(s.id)}
                          >
                            {s.name}
                          </button>
                        </th>
                        <td>{s.steps.length}</td>
                        <td
                          className={
                            r ? (r.passed ? "lc-pass" : "lc-fail") : ""
                          }
                        >
                          {r
                            ? r.passed
                              ? "Conforme aux attentes"
                              : "Écart observé"
                            : "Non exécuté"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {faults.length > 0 && (
              <div className="lc-faults">
                <h3>Configuration à vérifier</h3>
                <ul>
                  {faults.map((f, i) => (
                    <li key={i}>
                      <button
                        disabled={
                          dirty ||
                          !d.schema.fields.some((v) => v.id === f.field)
                        }
                        onClick={() => setSelected(f.field)}
                      >
                        {f.field}
                      </button>{" "}
                      {f.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="lc-step-results">
              <h3>{test.name}</h3>
              <p className="lc-meta">
                « Conforme » signifie que les résultats rejoignent les attentes
                déclarées, y compris les erreurs attendues.
              </p>
              {test.steps.map((step, i) => {
                const actual = result?.steps[i];
                return (
                  <details key={i} open={test.steps.length === 1}>
                    <summary>
                      Étape {i + 1}
                      {actual
                        ? ` · ${actual.passed ? "Conforme aux attentes" : "Écart observé"}`
                        : " · À exécuter"}
                    </summary>
                    <dl>
                      <dt>Réponses appliquées</dt>
                      <dd>
                        {Object.entries(step.set).map(([k, v]) => (
                          <div key={k}>
                            <code>{k}</code> = {v || "(vide)"}
                          </div>
                        ))}
                      </dd>
                    </dl>
                    {["visible", "errors", "cleared"].map((kind, j) => (
                      <div key={kind} className="lc-expect">
                        <strong>
                          {
                            [
                              "Champs visibles",
                              "Erreurs de saisie",
                              "Valeurs retirées",
                            ][j]
                          }
                        </strong>
                        <p>
                          Attendu · {step.expect[kind].join(", ") || "Aucun"}
                        </p>
                        {actual && (
                          <p
                            className={
                              actual.differences.includes(kind)
                                ? "lc-fail"
                                : "lc-pass"
                            }
                          >
                            Observé ·{" "}
                            {actual.actual[kind].join(", ") || "Aucun"}
                          </p>
                        )}
                      </div>
                    ))}
                  </details>
                );
              })}
            </div>
            <ScenarioEditor
              key={version + test.id}
              scenario={test}
              blocked={fieldDirty}
              onDirty={setTestDirty}
              onSave={(raw) =>
                commit(
                  () => editScenario(d, test.id, raw),
                  "Attentes appliquées. Rejouez les scénarios.",
                )
              }
            />
          </section>
        </div>
        <section className="lc-delivery">
          <div>
            <h2>Livraison</h2>
            <p>
              Une modification impose un nouveau rejeu. Contrôles ciblés, sans
              certification d’accessibilité.
            </p>
            {!canDeliver(d) && (
              <p className="lc-meta">
                Le schéma reste bloqué jusqu’au succès des scénarios de cette
                version.
              </p>
            )}
          </div>
          <div className="lc-actions">
            <button
              disabled={dirty || !canDeliver(d)}
              onClick={() =>
                safe(() => {
                  downloadJson("collab-formulaire.json", deliver(d));
                  return d;
                }, "Schéma téléchargé.")
              }
            >
              Schéma JSON
            </button>
            <button
              disabled={dirty}
              onClick={() => downloadJson("collab-dossier.json", d)}
            >
              Dossier JSON
            </button>
            <button
              disabled={dirty || !currentRun(d)}
              onClick={() =>
                downloadCsv(
                  "collab-resultats.csv",
                  RESULT_HEADERS,
                  resultRows(d),
                )
              }
            >
              Résultats CSV
            </button>
            <button
              disabled={dirty}
              onClick={() => downloadReport("collab-recette.html", report(d))}
            >
              Rapport HTML
            </button>
          </div>
        </section>
        <details className="lc-formats">
          <summary>Formats d’import et exemples</summary>
          <p>
            Importer JSON reconnaît le schéma collab-form-v1, les scénarios
            collab-scenarios-v1 et le dossier collab-dossier-v1. Au plus 24
            champs, 40 scénarios, 20 étapes par scénario et 12 Mio pour le
            dossier sérialisé complet.
          </p>
          <p>
            Conditions d’égalité entre valeurs textuelles. Une case vaut « oui »
            ou une chaîne vide. Les champs cachés et leurs descendants sont
            purgés. Les types, options et nouveaux champs se préparent dans le
            JSON. Les références inconnues et les cycles restent des constats
            éditables, mais bloquent le rejeu.
          </p>
          <div className="lc-actions">
            <button
              disabled={dirty}
              onClick={() =>
                downloadJson("collab-schema-exemple.json", seed().schema)
              }
            >
              Schéma exemple
            </button>
            <button
              disabled={dirty}
              onClick={() =>
                downloadJson("collab-scenarios-exemple.json", {
                  format: "collab-scenarios-v1",
                  scenarios: seed().scenarios,
                })
              }
            >
              Scénarios exemple
            </button>
            <button
              disabled={dirty}
              onClick={() =>
                downloadJson("collab-scenarios.json", {
                  format: "collab-scenarios-v1",
                  scenarios: d.scenarios,
                })
              }
            >
              Scénarios courants
            </button>
          </div>
        </details>
        <details className="lc-journal">
          <summary>Modifications du dossier ({d.journal.length})</summary>
          {d.journal.length ? (
            <ol>
              {d.journal.map((j, i) => (
                <li key={i}>{j}</li>
              ))}
            </ol>
          ) : (
            <p>Aucune modification enregistrée.</p>
          )}
          <button
            disabled={dirty}
            onClick={() => setPreview({ kind: "reset" })}
          >
            Rétablir l’exemple
          </button>
        </details>
        <p className="lc-local">
          Travail local en mémoire. Sauvegardez le dossier JSON avant de fermer
          l’onglet. Aucun formulaire réel, aucune réservation, aucune connexion
          aux outils du collectif.
        </p>
      </main>
      <DemoFooter />
      {preview && (
        <ImportDialog
          preview={preview}
          onClose={() => setPreview(null)}
          onConfirm={() => {
            try {
              commit(
                () =>
                  preview.kind === "reset" ? seed() : importData(d, preview),
                "Dossier mis à jour ; essai du formulaire remis à zéro.",
              );
              setPreview(null);
              setTrialRevision((v) => v + 1);
            } catch (err) {
              setError(err.message);
              setPreview(null);
            }
          }}
        />
      )}
    </div>
  );
}

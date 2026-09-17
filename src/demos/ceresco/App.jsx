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
  readLocalFile,
  downloadCsv,
  downloadJson,
  downloadReport,
} from "../../shared/files.js";
import {
  YEAR,
  MONTHS,
  IDS,
  HEADERS,
  seed,
  fingerprint,
  calculate,
  summarize,
  editScenario,
  markReview,
  isReviewed,
  saveBase,
  restore,
  parseDemand,
  importDemand,
  display,
  RESULT_HEADERS,
  resultRows,
  report,
} from "./model.js";
import "./styles.css";
const monthShort = (i) =>
  [
    "Jan",
    "Fév",
    "Mar",
    "Avr",
    "Mai",
    "Juin",
    "Juil",
    "Août",
    "Sep",
    "Oct",
    "Nov",
    "Déc",
  ][i];

function Upload({ children, onFile, disabled, json = false }) {
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
function Confirm({ value, onCancel, onConfirm }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog ref={ref} className="ce-dialog" onCancel={onCancel}>
      <h2>{value.title}</h2>
      <p>{value.message}</p>
      {value.kind === "csv" && (
        <div
          className="ce-scroll"
          tabIndex={0}
          role="region"
          aria-label="Aperçu de la demande reçue"
        >
          <table>
            <thead>
              <tr>
                <th>Mois</th>
                <th>Demande</th>
                <th>Unité</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {value.data.map((r) => (
                <tr key={r.month}>
                  <th>{r.month}</th>
                  <td>{r.demand || "Inconnue"}</td>
                  <td>{r.unit}</td>
                  <td>{r.demandSource || "À préciser"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>L’action pourra être annulée.</p>
      <div className="ce-actions">
        <button onClick={onCancel}>Annuler l’opération</button>
        <button className="ce-primary" onClick={onConfirm}>
          Confirmer
        </button>
      </div>
    </dialog>
  );
}
function Chart({ rows, selected, onSelect, disabled }) {
  const ceiling = Math.max(
    1,
    ...rows.flatMap((r) => [r.rawKg ?? 0, r.capacityKg ?? 0]),
  );
  const step = 10 ** Math.floor(Math.log10(ceiling)),
    top = Math.ceil(ceiling / step) * step;
  const left = 75,
    width = 785,
    height = 190,
    bottom = 225;
  const x = (i) => left + ((i + 0.5) * width) / 12,
    y = (v) => bottom - (v / top) * height;
  const capPaths = [];
  let run = [];
  rows.forEach((r, i) => {
    if (r.capacityKg === null) {
      if (run.length) capPaths.push(run.join(" "));
      run = [];
    } else run.push(`${run.length ? "L" : "M"}${x(i)},${y(r.capacityKg)}`);
  });
  if (run.length) capPaths.push(run.join(" "));
  return (
    <section className="ce-chart" aria-labelledby="ce-chart-title">
      <div className="ce-section-heading">
        <h2 id="ce-chart-title">Volumes mensuels de la variante</h2>
        <div className="ce-legend">
          <span>
            <i />
            Besoin brut
          </span>
          <span>
            <i className="ce-line" />
            Capacité brute
          </span>
        </div>
      </div>
      <div
        className="ce-chart-scroll"
        tabIndex={0}
        role="region"
        aria-label="Graphique des volumes en kilogrammes, défilement horizontal possible"
      >
        <svg
          viewBox="0 0 885 282"
          role="img"
          aria-label="Besoin brut et capacité brute par mois. Les valeurs sont détaillées dans le tableau suivant."
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <line
                x1={left}
                x2={left + width}
                y1={y((top * i) / 4)}
                y2={y((top * i) / 4)}
              />
              <text x={left - 10} y={y((top * i) / 4) + 5} textAnchor="end">
                {display((top * i) / 4)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => (
            <g key={r.month}>
              <title>
                {MONTHS[i]} : besoin {display(r.rawKg)} kg, capacité{" "}
                {display(r.capacityKg)} kg.
              </title>
              {r.rawKg !== null ? (
                <rect
                  className={r.exceeds ? "ce-overload" : ""}
                  x={x(i) - 17}
                  y={y(r.rawKg)}
                  width={34}
                  height={Math.max(0, bottom - y(r.rawKg))}
                />
              ) : (
                <text x={x(i)} y={bottom - 10} textAnchor="middle">
                  ?
                </text>
              )}
              <text x={x(i)} y={bottom + 25} textAnchor="middle">
                {monthShort(i)}
              </text>
            </g>
          ))}
          {capPaths.map((p, i) => (
            <path key={i} d={p} />
          ))}
          <text
            className="ce-axis"
            x={15}
            y={125}
            transform="rotate(-90 15 125)"
            textAnchor="middle"
          >
            kg bruts
          </text>
        </svg>
      </div>
      <div className="ce-month-buttons" aria-label="Choisir le mois à examiner">
        {rows.map((r, i) => (
          <button
            key={r.month}
            disabled={disabled}
            aria-pressed={selected === r.month}
            aria-label={`Examiner ${MONTHS[i].toLowerCase()}`}
            onClick={() => onSelect(r.month)}
          >
            {monthShort(i)}
            {r.exceeds && (
              <span className="ce-dot" aria-label="Dépassement">
                !
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="ce-help">
        Chaque mois est calculé séparément. Une donnée absente apparaît « ? » ;
        les capacités inconnues interrompent la ligne.
      </p>
    </section>
  );
}
function Hypotheses({ s, selected, onSelect, onSave, onDirty, blocked }) {
  const original = s.months.find((m) => m.month === selected);
  const [p, setP] = useState(s.params),
    [m, setM] = useState(original);
  const dirty =
    JSON.stringify(p) !== JSON.stringify(s.params) ||
    JSON.stringify(m) !== JSON.stringify(original);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty]);
  return (
    <form
      className="ce-notebook"
      id="ce-hypotheses"
      onSubmit={(e) => {
        e.preventDefault();
        if (onSave(p, m)) onDirty(false);
      }}
    >
      <h2>Hypothèses de la variante</h2>
      <fieldset disabled={blocked}>
        <div className="ce-param-row">
          <label htmlFor="ce-capture">Captation (%)</label>
          <input
            id="ce-capture"
            inputMode="decimal"
            value={p.capture}
            onChange={(e) => setP({ ...p, capture: e.target.value })}
          />
        </div>
        <div className="ce-param-row">
          <label htmlFor="ce-yield">Rendement matière (%)</label>
          <input
            id="ce-yield"
            inputMode="decimal"
            value={p.yield}
            onChange={(e) => setP({ ...p, yield: e.target.value })}
          />
        </div>
        <div className="ce-param-row">
          <label htmlFor="ce-capacity">Capacité brute (kg / jour)</label>
          <input
            id="ce-capacity"
            inputMode="decimal"
            value={p.capacity}
            onChange={(e) => setP({ ...p, capacity: e.target.value })}
          />
        </div>
        <details>
          <summary>Sources des trois hypothèses</summary>
          {[
            ["captureSource", "Source de la captation"],
            ["yieldSource", "Source du rendement"],
            ["capacitySource", "Source de la capacité"],
          ].map(([k, label]) => (
            <label key={k}>
              {label}
              <textarea
                maxLength={500}
                value={p[k]}
                onChange={(e) => setP({ ...p, [k]: e.target.value })}
              />
            </label>
          ))}
        </details>
        <hr />
        <label>
          Mois examiné
          <select
            value={selected}
            disabled={dirty}
            onChange={(e) => onSelect(e.target.value)}
          >
            {IDS.map((id, i) => (
              <option key={id} value={id}>
                {MONTHS[i]} {YEAR}
              </option>
            ))}
          </select>
        </label>
        <div className="ce-param-row">
          <label htmlFor="ce-days">Jours d’ouverture</label>
          <input
            id="ce-days"
            inputMode="numeric"
            value={m.days}
            onChange={(e) => setM({ ...m, days: e.target.value })}
          />
        </div>
        <label>
          Source du calendrier
          <textarea
            maxLength={500}
            value={m.daysSource}
            onChange={(e) => setM({ ...m, daysSource: e.target.value })}
          />
        </label>
        <details>
          <summary>Demande et unité de ce mois</summary>
          <label>
            Demande de légumes préparés
            <input
              inputMode="decimal"
              value={m.demand}
              onChange={(e) => setM({ ...m, demand: e.target.value })}
            />
          </label>
          <label>
            Unité reçue
            <select
              value={m.unit}
              onChange={(e) => setM({ ...m, unit: e.target.value })}
            >
              <option value="kg">kg</option>
              <option value="t">tonnes</option>
            </select>
          </label>
          <label>
            Source de la demande
            <textarea
              maxLength={500}
              value={m.demandSource}
              onChange={(e) => setM({ ...m, demandSource: e.target.value })}
            />
          </label>
        </details>
        <p className="ce-help">
          Un champ vide reste inconnu. Changer l’unité réinterprète le nombre
          saisi. Les sources sont des notes déclarées.
        </p>
        <button className="ce-primary" disabled={!dirty}>
          Appliquer les hypothèses
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setP(s.params);
              setM(original);
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
function Review({ s, blocked, onDirty, onReview }) {
  const [checked, setChecked] = useState(false),
    [note, setNote] = useState("");
  useEffect(() => {
    onDirty(checked || Boolean(note));
  }, [checked, note]);
  const summary = summarize(s);
  return (
    <section className="ce-review">
      <div>
        <h2>Revue de la variante</h2>
        <p>
          {isReviewed(s)
            ? "Cette version a été relue."
            : s.review
              ? "Les hypothèses ont changé depuis la dernière revue."
              : "Aucune revue déclarée."}
        </p>
        {s.review && <p className="ce-review-note">{s.review.note}</p>}
        <p className="ce-help">
          Une saturation peut être relue et documentée. Cette revue ne vaut pas
          décision de faisabilité.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (onReview(note)) {
            setChecked(false);
            setNote("");
            onDirty(false);
          }
        }}
      >
        <fieldset disabled={blocked || summary.incomplete}>
          <label className="ce-checkbox">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            J’ai relu les hypothèses et les écarts.
          </label>
          <label>
            Note de revue
            <textarea
              value={note}
              maxLength={800}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Précisez les vérifications et les réserves."
            />
          </label>
          <button disabled={!checked || !note.trim()}>
            Enregistrer la revue
          </button>
        </fieldset>
        {summary.incomplete && (
          <p className="ce-warning">
            Renseignez les valeurs et leurs sources pour déclarer une revue.
          </p>
        )}
      </form>
    </section>
  );
}
export default function App() {
  useDocumentTitle("CERESCO · Scénarios de légumerie");
  const history = useHistory(seed),
    d = history.value,
    summary = summarize(d.variant),
    base = calculate(d.base);
  const [selected, setSelected] = useState(IDS[8]),
    [formDirty, setFormDirty] = useState(false),
    [reviewDirty, setReviewDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState(null);
  const dirty = formDirty || reviewDirty,
    selectedRow = summary.rows.find((r) => r.month === selected),
    version = fingerprint(d.variant);
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
  async function read(file, kind) {
    try {
      const raw = await readLocalFile(file);
      const data = kind === "json" ? restore(raw) : parseDemand(raw);
      setPreview({
        kind,
        data,
        title:
          kind === "json"
            ? "Reprendre le dossier"
            : "Remplacer la demande de la variante",
        message:
          kind === "json"
            ? "La base, la variante et les notes de revue de ce fichier remplaceront le dossier actuel."
            : "Douze mois reçus. La base de référence et le calendrier de la variante seront conservés. Une modification rend la revue antérieure périmée.",
      });
      setError("");
    } catch (e) {
      setError(e.message);
      setNotice("");
    }
  }
  const closeStep = (method, msg) => {
    method();
    setError("");
    setNotice(msg);
  };
  return (
    <div className="ce-app">
      <header className="ce-header">
        <strong>CERESCO</strong>
        <span>Étude indépendante</span>
        <span>Données fictives</span>
      </header>
      <main>
        <div className="ce-heading">
          <div>
            <h1>Comparer les volumes d’une légumerie</h1>
            <p>
              Passez septembre à 8 jours d’ouverture pour examiner le mois
              saturé.
            </p>
          </div>
          <div className="ce-actions">
            <Upload disabled={dirty} onFile={(f) => read(f, "csv")}>
              Importer les besoins CSV
            </Upload>
            <button
              disabled={dirty}
              onClick={() =>
                downloadCsv(
                  "ceresco-demande-exemple.csv",
                  HEADERS,
                  seed().variant.months.map((m) => [
                    m.month,
                    m.demand,
                    m.unit,
                    m.demandSource,
                  ]),
                )
              }
            >
              Modèle CSV
            </button>
            <button
              disabled={dirty || !history.canUndo}
              onClick={() => closeStep(history.undo, "Modification annulée.")}
            >
              Annuler
            </button>
            <button
              disabled={dirty || !history.canRedo}
              onClick={() => closeStep(history.redo, "Modification rétablie.")}
            >
              Rétablir
            </button>
          </div>
        </div>
        <ErrorMessage>{error}</ErrorMessage>
        {notice && (
          <p role="status" className="ce-notice">
            {notice}
          </p>
        )}
        {dirty && (
          <p className="ce-warning" role="status">
            Appliquez ou abandonnez la saisie avant de changer de mois ou
            d’exporter.
          </p>
        )}
        <div className="ce-workspace">
          <div className="ce-analysis">
            <Chart
              rows={summary.rows}
              selected={selected}
              disabled={dirty}
              onSelect={setSelected}
            />
            <section className="ce-comparison">
              <div className="ce-section-heading">
                <h2>Comparaison mensuelle des volumes</h2>
                <button
                  disabled={dirty}
                  onClick={() =>
                    setPreview({
                      kind: "base",
                      title: "Remplacer la base de référence",
                      message:
                        "La variante actuelle deviendra la base figée. La comparaison utilisera ces valeurs comme point de départ.",
                    })
                  }
                >
                  Mémoriser la variante comme base
                </button>
              </div>
              <div
                role="region"
                tabIndex={0}
                className="ce-scroll"
                aria-label="Tableau comparatif mensuel en kilogrammes, défilement horizontal possible"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Mois {YEAR}</th>
                      <th>
                        Demande marché
                        <br />
                        variante (kg)
                      </th>
                      <th>
                        Besoin brut
                        <br />
                        base (kg)
                      </th>
                      <th>
                        Besoin brut
                        <br />
                        variante (kg)
                      </th>
                      <th>
                        Capacité brute
                        <br />
                        variante (kg)
                      </th>
                      <th>
                        Dépassement
                        <br />
                        (kg)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((r, i) => (
                      <tr
                        key={r.month}
                        className={selected === r.month ? "ce-selected" : ""}
                      >
                        <th>
                          <button
                            disabled={dirty}
                            aria-pressed={selected === r.month}
                            onClick={() => setSelected(r.month)}
                          >
                            {MONTHS[i]}
                          </button>
                        </th>
                        <td>{display(r.demandKg)}</td>
                        <td>{display(base[i].rawKg)}</td>
                        <td>{display(r.rawKg)}</td>
                        <td>{display(r.capacityKg)}</td>
                        <td className={r.exceeds ? "ce-excess" : ""}>
                          {display(r.excessKg)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <a className="ce-mobile-inspector" href="#ce-hypotheses">
                Examiner les hypothèses du mois sélectionné
              </a>
              <div className="ce-annual">
                <strong>
                  {summary.knownMonths === 12
                    ? "Année complète"
                    : `${summary.knownMonths} mois calculables sur 12`}
                </strong>
                <span>{display(summary.rawKg)} kg bruts à traiter</span>
                <span>
                  {display(summary.capacityKg)} kg de capacité sur ces mêmes
                  mois
                </span>
                <span className={summary.overloadMonths ? "ce-excess" : ""}>
                  {summary.overloadMonths} mois avec dépassement
                  {summary.knownMonths < 12
                    ? " parmi les mois calculables"
                    : ""}
                </span>
              </div>
              <p className="ce-help">
                La capacité annuelle ne compense pas un dépassement mensuel. Pas
                de report, de stock tampon ni de disponibilité agricole
                modélisés.
              </p>
            </section>
            <details className="ce-base">
              <summary>Hypothèses de la base figée</summary>
              <p>
                Captation {d.base.params.capture || "?"} % ; rendement{" "}
                {d.base.params.yield || "?"} % ; capacité{" "}
                {d.base.params.capacity || "?"} kg bruts / jour.
              </p>
              <ul>
                <li>
                  {d.base.params.captureSource ||
                    "Source de captation inconnue"}
                </li>
                <li>
                  {d.base.params.yieldSource || "Source de rendement inconnue"}
                </li>
                <li>
                  {d.base.params.capacitySource ||
                    "Source de capacité inconnue"}
                </li>
              </ul>
              <p>
                Les douze lignes et leurs sources sont conservées dans le
                rapport et le dossier JSON.
              </p>
            </details>
          </div>
          <aside aria-label="Carnet des hypothèses">
            <Hypotheses
              key={version + selected}
              s={d.variant}
              selected={selected}
              onSelect={setSelected}
              blocked={reviewDirty}
              onDirty={(value) => {
                setFormDirty(value);
                if (!value) setError("");
              }}
              onSave={(p, m) =>
                commit(
                  () => editScenario(d, p, m),
                  "Variante mise à jour. La base est conservée.",
                )
              }
            />
            <section className="ce-formula">
              <h2>Calcul de {MONTHS[IDS.indexOf(selected)].toLowerCase()}</h2>
              {selectedRow.rawKg === null ? (
                <p>Besoin brut non calculable.</p>
              ) : (
                <p className="ce-equation">
                  {display(selectedRow.demandKg)} × {d.variant.params.capture} %
                  ÷ {d.variant.params.yield} % ={" "}
                  <strong>{display(selectedRow.rawKg)} kg bruts</strong>
                </p>
              )}
              <p>
                La demande porte sur des légumes préparés. La captation en
                retient une part ; le rendement détermine le volume brut à
                traiter.
              </p>
              <p>
                Capacité {d.variant.params.capacity || "?"} kg bruts / jour ×{" "}
                {selectedRow.days || "?"} jours ={" "}
                <strong>{display(selectedRow.capacityKg)} kg bruts</strong>.
              </p>
              {selectedRow.exceeds && (
                <p className="ce-warning">
                  {display(selectedRow.excessKg)} kg dépassent la capacité du
                  mois. Au même débit, {display(selectedRow.daysRequired)} jours
                  seraient nécessaires, sans vérifier leur disponibilité.
                </p>
              )}
              {selectedRow.missing.length > 0 && (
                <p className="ce-warning">
                  Valeurs à préciser : {selectedRow.missing.join(", ")}.
                </p>
              )}
              {selectedRow.sourcesMissing.length > 0 && (
                <p className="ce-warning">
                  Sources à préciser : {selectedRow.sourcesMissing.join(", ")}.
                </p>
              )}
            </section>
          </aside>
        </div>
        <Review
          key={version + Boolean(isReviewed(d.variant))}
          s={d.variant}
          blocked={formDirty}
          onDirty={setReviewDirty}
          onReview={(note) =>
            commit(
              () => markReview(d, note),
              "Revue enregistrée pour cette version.",
            )
          }
        />
        <section className="ce-exports">
          <div>
            <h2>Restitution</h2>
            <p>
              Les exports conservent les inconnues, les hypothèses et l’état de
              revue.
            </p>
          </div>
          <div className="ce-actions">
            <button
              className="ce-primary"
              disabled={dirty}
              onClick={() =>
                downloadCsv(
                  "ceresco-comparaison.csv",
                  RESULT_HEADERS,
                  resultRows(d),
                )
              }
            >
              Comparer CSV
            </button>
            <button
              disabled={dirty}
              onClick={() => downloadReport("ceresco-rapport.html", report(d))}
            >
              Rapport HTML
            </button>
            <button
              disabled={dirty}
              onClick={() => downloadJson("ceresco-dossier.json", d)}
            >
              Sauvegarder JSON
            </button>
            <Upload disabled={dirty} json onFile={(f) => read(f, "json")}>
              Reprendre JSON
            </Upload>
          </div>
        </section>
        <details className="ce-journal">
          <summary>Modifications du dossier ({d.journal.length})</summary>
          {d.journal.length ? (
            <ol>
              {d.journal.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
          ) : (
            <p>Aucune modification enregistrée.</p>
          )}
          <button
            disabled={dirty}
            onClick={() =>
              setPreview({
                kind: "reset",
                title: "Rétablir l’exemple",
                message:
                  "Le scénario fictif initial remplacera le dossier actuel.",
              })
            }
          >
            Rétablir l’exemple
          </button>
        </details>
        <p className="ce-local">
          Calculs locaux, aucune connexion aux outils du cabinet. Sauvegardez le
          JSON avant de fermer l’onglet. Modèle de volumes à confirmer avec le
          consultant, sans conclusion financière ou sanitaire.
        </p>
      </main>
      <DemoFooter />
      {preview && (
        <Confirm
          value={preview}
          onCancel={() => setPreview(null)}
          onConfirm={() => {
            const ok = commit(
              () =>
                preview.kind === "csv"
                  ? importDemand(d, preview.data)
                  : preview.kind === "json"
                    ? preview.data
                    : preview.kind === "base"
                      ? saveBase(d)
                      : seed(),
              "Dossier et calculs mis à jour.",
            );
            if (ok) {
              setPreview(null);
              setFormDirty(false);
              setReviewDirty(false);
            }
          }}
        />
      )}
    </div>
  );
}

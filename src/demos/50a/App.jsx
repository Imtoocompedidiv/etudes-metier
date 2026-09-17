import { useMemo, useState } from "react";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-800.css";
import { useHistory } from "../../shared/state.js";
import {
  DemoContext,
  DemoFooter,
  ErrorMessage,
  FileImport,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  downloadCsv,
  downloadJson,
  downloadReport,
  readLocalFile,
} from "../../shared/files.js";
import {
  analyse,
  change,
  CONTENT_HEADERS,
  contentRows,
  dateNumber,
  dateString,
  displayDate,
  editContent,
  editInitiative,
  hours,
  importContents,
  importInitiatives,
  INITIATIVE_HEADERS,
  initiativeRows,
  restore,
  seed,
  STAGES,
  STATES,
  validDossier,
} from "./model.js";
import "./styles.css";

function ContentEditor({ row, onSave }) {
  const [draft, setDraft] = useState(row);
  const update = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <form
      className="fa-editor fa-content-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(row.id, draft);
      }}
    >
      <h3>
        Édition du contenu <span>{row.id}</span>
      </h3>
      <label>
        Titre
        <input
          required
          maxLength={100}
          value={draft.title}
          onChange={(e) => update("title", e.target.value)}
        />
      </label>
      <label>
        Étape
        <select
          value={draft.stage}
          onChange={(e) => update("stage", e.target.value)}
        >
          {STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        État
        <select
          value={draft.state}
          onChange={(e) => update("state", e.target.value)}
        >
          {STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Date de disponibilité
        <input
          type="date"
          required
          min="2000-01-01"
          max="2099-12-31"
          value={draft.ready}
          onChange={(e) => update("ready", e.target.value)}
        />
      </label>
      <button className="fa-primary">Enregistrer le contenu</button>
      <p>
        Une date future reste une prévision. « À créer » appelle une validation
        avant lancement.
      </p>
    </form>
  );
}

function InitiativeEditor({ row, onSave }) {
  const [draft, setDraft] = useState({
    ...row,
    contents: row.contents.join(" | "),
    depends: row.depends.join(" | "),
  });
  const update = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const split = (s) => (s.trim() ? s.split("|").map((v) => v.trim()) : []);
  return (
    <form
      className="fa-editor fa-initiative-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(row.id, {
          ...draft,
          contents: split(draft.contents),
          depends: split(draft.depends),
        });
      }}
    >
      <h3>
        Édition de l’initiative <span>{row.id}</span>
      </h3>
      <div className="fa-form-grid">
        <label className="fa-wide">
          Titre
          <input
            required
            maxLength={100}
            value={draft.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </label>
        <label>
          Responsable
          <input
            required
            maxLength={60}
            value={draft.owner}
            onChange={(e) => update("owner", e.target.value)}
          />
        </label>
        <label>
          Début
          <input
            type="date"
            required
            min="2000-01-01"
            max="2099-12-31"
            value={draft.start}
            onChange={(e) => update("start", e.target.value)}
          />
        </label>
        <label>
          Fin
          <input
            type="date"
            required
            min="2000-01-01"
            max="2099-12-31"
            value={draft.end}
            onChange={(e) => update("end", e.target.value)}
          />
        </label>
        <label>
          Charge estimée (h)
          <input
            type="number"
            min="0"
            max="10000"
            step="0.01"
            required
            value={draft.effort}
            onChange={(e) => update("effort", e.target.value)}
          />
        </label>
        <label>
          Contenus requis
          <input
            maxLength={8199}
            value={draft.contents}
            onChange={(e) => update("contents", e.target.value)}
            aria-describedby="fa-refs"
          />
        </label>
        <label>
          Initiatives préalables
          <input
            maxLength={8199}
            value={draft.depends}
            onChange={(e) => update("depends", e.target.value)}
            aria-describedby="fa-refs"
          />
        </label>
        <button className="fa-primary">Appliquer l’initiative</button>
      </div>
      <p id="fa-refs">
        Identifiants séparés par |. Les dates ne se décalent jamais
        automatiquement.
      </p>
    </form>
  );
}

function Programme({ rows, report, selected, onSelect }) {
  const first = report.weeks[0]?.start;
  const span = report.weeks.length * 7;
  return (
    <div
      className="fa-scroll"
      role="region"
      aria-label="Programme, défilement horizontal"
      tabIndex={0}
    >
      <div
        className="fa-programme"
        style={{ minWidth: Math.max(790, 265 + report.weeks.length * 92) }}
      >
        <div className="fa-plan-head">
          <strong>Initiative / responsable</strong>
          <div className="fa-week-titles">
            {report.weeks.map((w) => (
              <div key={w.start}>
                <b>{w.label}</b>
                <span>{displayDate(w.date).slice(0, 5)}</span>
              </div>
            ))}
          </div>
        </div>
        {rows.map((row) => {
          const blocking = report.blocked.has(row.id),
            warning = report.issues.some(
              (x) => x.initiativeId === row.id && x.severity === "warning",
            );
          const left = ((dateNumber(row.start) - first) / span) * 100,
            width =
              ((dateNumber(row.end) - dateNumber(row.start) + 1) / span) * 100;
          return (
            <div
              className={`fa-plan-row ${selected === row.id ? "is-selected" : ""}`}
              key={row.id}
            >
              <button
                className="fa-plan-label"
                aria-pressed={selected === row.id}
                onClick={() => onSelect(row.id)}
              >
                <b>
                  {row.id} · {row.title}
                </b>
                <span>
                  {row.owner} · {row.effort} h
                </span>
              </button>
              <div
                className="fa-track"
                style={{ "--weeks": report.weeks.length }}
              >
                <button
                  className={`fa-bar ${blocking ? "is-blocked" : ""}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={() => onSelect(row.id)}
                  aria-label={`Éditer ${row.id}, du ${displayDate(row.start)} au ${displayDate(row.end)}`}
                >
                  <span>
                    {displayDate(row.start).slice(0, 5)} au{" "}
                    {displayDate(row.end).slice(0, 5)}
                  </span>
                </button>
                <small>
                  {blocking
                    ? "À arbitrer"
                    : warning
                      ? "Contenu à valider"
                      : "Dates compatibles"}
                </small>
              </div>
            </div>
          );
        })}
        {!rows.length && (
          <p className="fa-empty">Aucune initiative pour ce filtre.</p>
        )}
      </div>
    </div>
  );
}

function Capacity({ row, onSave }) {
  const [value, setValue] = useState(
    row.capacity == null ? "" : row.capacity / 100,
  );
  return (
    <form
      className="fa-capacity"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(row.owner, value);
      }}
    >
      <input
        aria-label={`Capacité de ${row.owner} en heures par semaine`}
        required
        type="number"
        min="0"
        max="168"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button aria-label={`Enregistrer la capacité de ${row.owner}`}>
        Valider
      </button>
    </form>
  );
}

export default function App() {
  useDocumentTitle("50A · Contenus et feuille de route");
  const h = useHistory(seed, { key: "50a:v1", validate: validDossier });
  const d = h.value;
  const report = useMemo(() => analyse(d), [d]);
  const [selectedContent, setSelectedContent] = useState("C03"),
    [selectedInitiative, setSelectedInitiative] = useState("I03");
  const [query, setQuery] = useState(""),
    [owner, setOwner] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const c = d.contents.find((c) => c.id === selectedContent) || d.contents[0];
  const i =
    d.initiatives.find((i) => i.id === selectedInitiative) || d.initiatives[0];
  const filteredContents = d.contents.filter((c) =>
    `${c.id} ${c.title} ${c.stage}`
      .toLocaleLowerCase("fr")
      .includes(query.toLocaleLowerCase("fr")),
  );
  const filteredInitiatives = d.initiatives.filter(
    (i) => !owner || i.owner === owner,
  );
  function act(fn, success) {
    try {
      const next = fn();
      if (next) h.set(next);
      setError("");
      setNotice(success);
    } catch (e) {
      setError(e.message);
      setNotice("");
    }
  }
  async function ingest(file, type) {
    try {
      const source = await readLocalFile(file, { maxBytes: 2 * 1024 * 1024 });
      const next =
        type === "dossier"
          ? restore(source)
          : change(
              d,
              {
                [type]:
                  type === "contents"
                    ? importContents(source)
                    : importInitiatives(source),
              },
              `Import ${type === "contents" ? "des contenus" : "des initiatives"} : ${file.name.slice(0, 120)}.`,
            );
      h.set(next);
      setOwner("");
      setQuery("");
      setError("");
      setNotice(
        "Fichier chargé. Les références et charges ont été recalculées.",
      );
    } catch (e) {
      setError(`Import refusé. ${e.message}`);
      setNotice("");
    }
  }
  function saveCapacity(name, value) {
    act(
      () =>
        change(
          d,
          {
            capacities: [
              ...d.capacities.filter((c) => c.owner !== name),
              { owner: name, hours: value },
            ],
          },
          `Capacité de ${name} modifiée.`,
        ),
      "Capacité hebdomadaire enregistrée.",
    );
  }
  const loadRows = report.loads.flatMap((row) =>
    report.weeks.map((week, index) => [
      row.owner,
      week.date,
      row.values[index] / 100,
      row.capacity == null ? "Non renseignée" : row.capacity / 100,
      row.capacity == null
        ? "À renseigner"
        : row.values[index] > row.capacity
          ? "Surcharge"
          : "Dans la capacité",
    ]),
  );
  function exportReport() {
    downloadReport("50a-arbitrage.html", {
      title: "50A · Programme à arbitrer",
      subtitle:
        "Exemple indépendant, données fictives. Dates conservées, charge prévisionnelle répartie du lundi au vendredi sans jours fériés.",
      sections: [
        { title: "Contenus", headers: CONTENT_HEADERS, rows: contentRows(d) },
        {
          title: "Initiatives prévues",
          headers: INITIATIVE_HEADERS,
          rows: initiativeRows(d),
        },
        {
          title: "Points à arbitrer",
          headers: ["Initiative", "Type", "Portée", "Explication"],
          rows: report.issues.map((x) => [
            x.initiativeId,
            x.type,
            x.severity === "block" ? "Blocage" : "Validation",
            x.detail,
          ]),
        },
        {
          title: "Charge hebdomadaire",
          headers: [
            "Responsable",
            "Semaine du",
            "Charge h",
            "Capacité h",
            "État",
          ],
          rows: loadRows,
        },
        {
          title: "Journal",
          paragraphs: d.journal.length
            ? d.journal
            : ["Aucune modification du jeu initial."],
        },
      ],
    });
  }
  return (
    <div className="fiftya-demo">
      <header className="fa-header">
        <a href="#fa-programme" className="fa-brand">
          50A
        </a>
        <span>
          Des contenus <br />à la feuille de route
        </span>
        <nav aria-label="Sections de l’atelier">
          <a href="#fa-programme">Programme</a>
          <a href="#fa-load">Charge</a>
          <a href="#fa-exports">Livraison</a>
        </nav>
      </header>
      <DemoContext company="50A">
        Programme fictif inspiré de deux matrices publiques. Données locales,
        sans connexion Google.
      </DemoContext>
      <main>
        <div className="fa-heading">
          <h1>Planifiez vos contenus et vos initiatives</h1>
          <p>Décalez le guide, puis observez les actions qui en dépendent.</p>
        </div>
        <div className="fa-messages">
          <ErrorMessage>{error}</ErrorMessage>
          <p role="status">{notice}</p>
          {!h.storageAvailable && (
            <p>
              La sauvegarde locale est indisponible. Exportez votre dossier pour
              le conserver.
            </p>
          )}
        </div>
        <section
          className="fa-workspace"
          id="fa-programme"
          aria-label="Contenus et programme"
        >
          <aside className="fa-inventory">
            <h2>
              Inventaire des contenus <span>({d.contents.length})</span>
            </h2>
            <label>
              Rechercher un contenu
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Titre, identifiant ou étape"
              />
            </label>
            <div className="fa-content-list">
              {filteredContents.map((row) => (
                <button
                  key={row.id}
                  className={c?.id === row.id ? "selected" : ""}
                  aria-pressed={c?.id === row.id}
                  onClick={() => setSelectedContent(row.id)}
                >
                  <b>
                    {row.id} · {row.title}
                  </b>
                  <span>{row.stage}</span>
                  <span>
                    {displayDate(row.ready)}{" "}
                    <em className={row.state === "Prêt" ? "ready" : ""}>
                      {row.state}
                    </em>
                  </span>
                </button>
              ))}
            </div>
            {!filteredContents.length && (
              <p>Aucun contenu pour cette recherche.</p>
            )}
            {c && (
              <ContentEditor
                key={JSON.stringify(c)}
                row={c}
                onSave={(key, draft) =>
                  act(
                    () => editContent(d, key, draft),
                    "Contenu enregistré ; les dépendances ont été recalculées.",
                  )
                }
              />
            )}
          </aside>
          <div className="fa-programme-area">
            <div className="fa-toolbar">
              <div>
                <p>Importer des données CSV</p>
                <div className="fa-imports">
                  <FileImport
                    label="Contenus CSV"
                    accept=".csv"
                    onFile={(file) => ingest(file, "contents")}
                  />
                  <FileImport
                    label="Initiatives CSV"
                    accept=".csv"
                    onFile={(file) => ingest(file, "initiatives")}
                  />
                </div>
              </div>
              <label>
                Filtrer par responsable
                <select
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                >
                  <option value="">Tous les responsables</option>
                  {report.owners.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <h2>
              Programme des initiatives{" "}
              <span>({filteredInitiatives.length})</span>
            </h2>
            <Programme
              rows={filteredInitiatives}
              report={report}
              selected={i?.id}
              onSelect={setSelectedInitiative}
            />
            {i && (
              <InitiativeEditor
                key={JSON.stringify(i)}
                row={i}
                onSave={(key, draft) =>
                  act(
                    () => editInitiative(d, key, draft),
                    "Initiative enregistrée. Les dates des autres actions restent inchangées.",
                  )
                }
              />
            )}
          </div>
        </section>
        <section className="fa-section" id="fa-load">
          <div className="fa-section-heading">
            <h2>Charge par semaine</h2>
            <p>
              Répartie entre jours du lundi au vendredi, sans jours fériés
              déduits.
            </p>
          </div>
          <p className="fa-help">
            Toutes les initiatives sont comptées, y compris celles à arbitrer.
            Les centièmes d’heure restants sont affectés aux premiers jours. Une
            capacité absente ne vaut pas zéro.
          </p>
          <div
            className="fa-scroll"
            role="region"
            aria-label="Charge hebdomadaire, défilement horizontal"
            tabIndex={0}
          >
            <table className="fa-load-table">
              <thead>
                <tr>
                  <th>Responsable</th>
                  {report.weeks.map((w) => (
                    <th key={w.start}>
                      {w.label}
                      <span>du {displayDate(w.date).slice(0, 5)}</span>
                    </th>
                  ))}
                  <th>Capacité hebdo (h)</th>
                </tr>
              </thead>
              <tbody>
                {report.loads.map((row) => (
                  <tr key={row.owner}>
                    <th scope="row">{row.owner}</th>
                    {row.values.map((value, index) => (
                      <td
                        key={index}
                        className={
                          row.capacity != null && value > row.capacity
                            ? "fa-overload"
                            : ""
                        }
                      >
                        {hours(value)} h
                        {row.capacity != null && value > row.capacity && (
                          <small>+{hours(value - row.capacity)} h</small>
                        )}
                      </td>
                    ))}
                    <td>
                      <Capacity
                        key={`${row.owner}:${row.capacity}`}
                        row={row}
                        onSave={saveCapacity}
                      />
                      {row.capacity == null && <small>À renseigner</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.loads.length && (
            <p>Importez un programme pour calculer sa charge.</p>
          )}
        </section>
        <section className="fa-section">
          <h2>
            Points à arbitrer <span>({report.issues.length})</span>
          </h2>
          <p className="fa-help">
            Une ligne orange signale un blocage de date ou de référence. Les
            contenus à créer restent signalés même si leur date prévue convient.
          </p>
          <div className="fa-issues">
            {report.issues.map((item, index) => (
              <div key={`${item.initiativeId}:${index}`}>
                <span
                  className={
                    item.severity === "block"
                      ? "fa-issue-block"
                      : "fa-issue-warning"
                  }
                >
                  {item.type}
                </span>
                <button
                  onClick={() => {
                    setSelectedInitiative(item.initiativeId);
                    document
                      .getElementById("fa-programme")
                      .scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {item.initiativeId}
                </button>
                <p>{item.detail}</p>
              </div>
            ))}
            {!report.issues.length && (
              <p>
                Aucune incohérence détectée dans les dates et références
                déclarées. Ce contrôle ne valide pas les contenus eux-mêmes.
              </p>
            )}
          </div>
        </section>
        <section className="fa-section fa-exports" id="fa-exports">
          <h2>Livrer le programme</h2>
          <p>
            Les CSV exportés servent aussi de modèles d’import. Références
            multiples séparées par |. Aucun lien avec les fichiers Google de
            l’agence.
          </p>
          <div className="fa-export-buttons">
            <button
              className="fa-primary"
              onClick={() =>
                downloadCsv("50a-contenus.csv", CONTENT_HEADERS, contentRows(d))
              }
            >
              Contenus CSV
            </button>
            <button
              className="fa-primary"
              onClick={() =>
                downloadCsv(
                  "50a-initiatives.csv",
                  INITIATIVE_HEADERS,
                  initiativeRows(d),
                )
              }
            >
              Initiatives CSV
            </button>
            <button
              className="fa-primary"
              onClick={() =>
                downloadCsv(
                  "50a-charge.csv",
                  [
                    "responsable",
                    "semaine_du",
                    "charge_h",
                    "capacite_h",
                    "etat",
                  ],
                  loadRows,
                )
              }
            >
              Charge CSV
            </button>
            <button
              className="fa-primary"
              onClick={() => downloadJson("50a-dossier.json", d)}
            >
              Dossier JSON
            </button>
            <button className="fa-primary" onClick={exportReport}>
              Rapport HTML
            </button>
          </div>
          <div className="fa-history">
            <FileImport
              label="Restaurer un dossier JSON"
              accept=".json"
              onFile={(file) => ingest(file, "dossier")}
            />
            <button
              disabled={!h.canUndo}
              onClick={() => {
                h.undo();
                setNotice("Dernière modification annulée.");
                setError("");
              }}
            >
              Annuler
            </button>
            <button
              disabled={!h.canRedo}
              onClick={() => {
                h.redo();
                setNotice("Modification rétablie.");
                setError("");
              }}
            >
              Rétablir
            </button>
            <button
              onClick={() => {
                h.reset();
                setOwner("");
                setQuery("");
                setError("");
                setNotice("Exemple rétabli. Cette action peut être annulée.");
              }}
            >
              Rétablir l’exemple
            </button>
          </div>
          {d.journal.length > 0 && (
            <details>
              <summary>Journal des modifications ({d.journal.length})</summary>
              <ol>
                {d.journal.map((entry, index) => (
                  <li key={index}>{entry}</li>
                ))}
              </ol>
            </details>
          )}
        </section>
      </main>
      <DemoFooter />
    </div>
  );
}

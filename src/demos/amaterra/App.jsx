import { useEffect, useState } from "react";
import "@fontsource/domine/latin-600.css";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import { useHistory } from "../../shared/state.js";
import { DemoFooter, FileImport, useDocumentTitle } from "../../shared/ui.jsx";
import {
  downloadCsv,
  downloadJson,
  downloadReport,
  readLocalFile,
} from "../../shared/files.js";
import {
  FORMULAS,
  HEADERS,
  seed,
  minute,
  clock,
  issues,
  supplies,
  checks,
  programmeKey,
  changeGroup,
  removeGroup,
  addGroup,
  updateSettings,
  review,
  isReviewed,
  groupRows,
  importGroups,
  restore,
  supplyRows,
  report,
} from "./model.js";
import "./styles.css";

function GroupEditor({ group, onSave, onRemove, removable, onDirty }) {
  const [draft, setDraft] = useState(group),
    [error, setError] = useState("");
  useEffect(() => {
    setDraft(group);
    setError("");
    onDirty(false);
  }, [JSON.stringify(group)]);
  const set = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    onDirty(true);
    setError("");
  };
  return (
    <form
      className="amaterra-editor"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave(draft);
          onDirty(false);
          setError("");
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <div className="amaterra-section-heading">
        <h2>Le groupe sélectionné</h2>
        <span>{group.id}</span>
      </div>
      <div className="amaterra-form-grid">
        <label>
          Nom du groupe
          <input
            value={draft.name}
            required
            maxLength={100}
            onChange={(e) => set("name", e.target.value)}
          />
        </label>
        <label>
          Formule
          <select
            value={draft.formula}
            onChange={(e) => set("formula", e.target.value)}
          >
            {Object.entries(FORMULAS).map(([id, f]) => (
              <option key={id} value={id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Heure de début
          <input
            type="time"
            required
            value={draft.start}
            onChange={(e) => set("start", e.target.value)}
          />
        </label>
        <label>
          Durée prévue (minutes)
          <input
            type="number"
            min={15}
            max={360}
            required
            value={draft.duration}
            onChange={(e) => set("duration", e.target.value)}
          />
          <small>
            Fiche publiée : {FORMULAS[draft.formula].minutes} minutes.
          </small>
        </label>
        <label>
          Participants
          <input
            type="number"
            min={1}
            max={150}
            required
            value={draft.count}
            onChange={(e) => set("count", e.target.value)}
          />
        </label>
        <label>
          Salle
          <input
            value={draft.room}
            required
            maxLength={100}
            onChange={(e) => set("room", e.target.value)}
          />
        </label>
        <label>
          Intervenant
          <input
            value={draft.artist}
            required
            maxLength={100}
            onChange={(e) => set("artist", e.target.value)}
          />
        </label>
        {draft.formula !== "adultes" ? (
          <>
            <label>
              Âge du plus jeune (ans)
              <input
                type="number"
                min={0}
                max={110}
                value={draft.youngest ?? ""}
                placeholder="À renseigner"
                onChange={(e) => set("youngest", e.target.value)}
              />
              <small>Formule présentée à partir de 7 ans.</small>
            </label>
            <label>
              Capacité enfants convenue avec le lieu
              <input
                type="number"
                min={1}
                max={150}
                value={draft.childCapacity ?? ""}
                placeholder="À confirmer"
                onChange={(e) => set("childCapacity", e.target.value)}
              />
              <small>
                Aucune limite enfants n’est déduite de la formule adultes.
              </small>
            </label>
          </>
        ) : (
          <>
            <label>
              Feuilles A4 120 g par personne
              <input
                type="number"
                min={1}
                max={50}
                value={draft.adultPaper ?? ""}
                placeholder="À définir"
                onChange={(e) => set("adultPaper", e.target.value)}
              />
              <small>
                La fiche ne donne pas de quantité. Paramètre à convenir.
              </small>
            </label>
            <label className="amaterra-checkbox">
              <input
                type="checkbox"
                checked={draft.adultAudience}
                onChange={(e) => set("adultAudience", e.target.checked)}
              />
              <span>
                Public adolescents / adultes convenu avec l’intervenant.
                <small>Capacité publiée : 12 personnes maximum.</small>
              </span>
            </label>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="amaterra-error">
          {error}
        </p>
      )}
      <div className="amaterra-actions">
        <button className="amaterra-primary" type="submit">
          Enregistrer le groupe
        </button>
        <button type="button" disabled={!removable} onClick={onRemove}>
          Retirer ce groupe
        </button>
      </div>
      <p className="amaterra-note">
        L’enregistrement recalcule la préparation et remet la disponibilité à
        confirmer. Les textes saisis restent dans votre navigateur.
      </p>
    </form>
  );
}

function Supplies({ state, onSave, onDirty }) {
  const [draft, setDraft] = useState({
      stocks: state.stocks,
      ratios: state.ratios,
    }),
    [error, setError] = useState("");
  useEffect(() => {
    setDraft({ stocks: state.stocks, ratios: state.ratios });
    onDirty(false);
    setError("");
  }, [JSON.stringify(state.stocks), JSON.stringify(state.ratios)]);
  const rows = supplies(state);
  return (
    <form
      className="amaterra-supplies"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave(draft);
          onDirty(false);
          setError("");
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <h2>À préparer pour la journée</h2>
      <p>Quantités recalculées à chaque groupe enregistré.</p>
      {rows.map((r, i) => (
        <div key={r.id}>
          {(i === 0 || i === 2) && (
            <h3>{i === 0 ? "Papier et supports" : "Matériel réutilisable"}</h3>
          )}
          <div className="amaterra-supply-row">
            <div>
              <strong>{r.name}</strong>
              <span className={r.required === null ? "amaterra-warning" : ""}>
                {r.required === null
                  ? "Quantité à confirmer"
                  : `${r.required} ${r.unit}${i >= 2 ? " au pic" : ""}`}
              </span>
            </div>
            <label>
              Stock prévu
              <input
                aria-label={`Stock ${r.name}`}
                type="number"
                min={0}
                max={100000}
                required
                value={draft.stocks[r.id]}
                onChange={(e) => {
                  setDraft((d) => ({
                    ...d,
                    stocks: { ...d.stocks, [r.id]: e.target.value },
                  }));
                  onDirty(true);
                }}
              />
            </label>
            <p>{r.rule}</p>
            {r.shortage > 0 && (
              <p className="amaterra-warning">
                Il manque {r.shortage} {r.unit} dans le stock déclaré.
              </p>
            )}
            {i >= 2 && (
              <label className="amaterra-ratio">
                Partager un exemplaire entre
                <input
                  aria-label={`${r.name} : personnes par exemplaire`}
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={draft.ratios[r.id]}
                  onChange={(e) => {
                    setDraft((d) => ({
                      ...d,
                      ratios: { ...d.ratios, [r.id]: e.target.value },
                    }));
                    onDirty(true);
                  }}
                />
                personne(s)
              </label>
            )}
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="amaterra-error">
          {error}
        </p>
      )}
      <button type="submit">Enregistrer les fournitures</button>
      <p className="amaterra-note">
        Le papier est consommé. Ciseaux et crayons sont mutualisés, avec le
        temps de remise en place déclaré. Les ratios de partage sont des
        hypothèses de préparation.
      </p>
      <details>
        <summary>Ce qui reste à convenir avec l’artiste</summary>
        <p>
          Colle, couleurs, protections et conditions d’usage des outils.
          Scalpels et tapis sont annoncés fournis pour la formule adultes. Cette
          préparation ne vaut pas vérification de sécurité.
        </p>
      </details>
    </form>
  );
}

export default function App() {
  useDocumentTitle("Amaterra · Préparation des ateliers");
  const history = useHistory(seed, { max: 60 }),
    s = history.value;
  const [selected, setSelected] = useState("G2"),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [groupDirty, setGroupDirty] = useState(false),
    [supplyDirty, setSupplyDirty] = useState(false),
    [metaDirty, setMetaDirty] = useState(false);
  const [meta, setMeta] = useState({
    date: s.date,
    place: s.place,
    gap: s.gap,
  });
  useEffect(() => {
    setMeta({ date: s.date, place: s.place, gap: s.gap });
    setMetaDirty(false);
  }, [s.date, s.place, s.gap]);
  useEffect(() => {
    if (!s.groups.some((g) => g.id === selected)) setSelected(s.groups[0].id);
  }, [s.groups, selected]);
  const dirty = groupDirty || supplyDirty || metaDirty;
  const group = s.groups.find((g) => g.id === selected) || s.groups[0],
    list = issues(s),
    remaining = checks(s);
  const begin =
    Math.floor(Math.min(...s.groups.map((g) => minute(g.start))) / 60) * 60;
  const end =
    Math.ceil(
      Math.max(...s.groups.map((g) => minute(g.start) + g.duration)) / 60,
    ) * 60;
  const hours = Array.from(
      { length: Math.floor((end - begin) / 60) + 1 },
      (_, i) => begin + i * 60,
    ),
    span = Math.max(60, end - begin);
  function commit(value, message) {
    history.set(value);
    setNotice(message);
    setError("");
  }
  function action(fn, message) {
    try {
      fn();
      setNotice(message);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }
  async function upload(file, kind) {
    const raw = await readLocalFile(file, { maxBytes: 3 * 1024 * 1024 });
    const next = kind === "csv" ? importGroups(raw, s) : restore(raw);
    commit(
      next,
      kind === "csv"
        ? `${next.groups.length} groupes importés. Disponibilité et préparation à revoir.`
        : "Dossier repris. Les déclarations sont liées à la version enregistrée.",
    );
    setGroupDirty(false);
    setSupplyDirty(false);
  }
  return (
    <div className="amaterra-app">
      <header className="amaterra-header">
        <span>Amaterra</span>
        <p>Prototype indépendant · Groupes fictifs</p>
      </header>
      <main>
        <h1>Préparer la journée d’ateliers</h1>
        <p className="amaterra-intro">
          Dans l’exemple initial, décalez le deuxième groupe à 10 h 45. Le pic
          de ciseaux descend de 34 à 18, les 84 feuilles restent à prévoir.
        </p>
        <form
          className="amaterra-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            action(() => {
              commit(
                updateSettings(s, meta),
                "Journée enregistrée ; disponibilité à confirmer.",
              );
              setMetaDirty(false);
            }, "Journée enregistrée ; disponibilité à confirmer.");
          }}
        >
          <label>
            Date
            <input
              type="date"
              required
              value={meta.date}
              onChange={(e) => {
                setMeta({ ...meta, date: e.target.value });
                setMetaDirty(true);
              }}
            />
          </label>
          <label>
            Lieu
            <input
              value={meta.place}
              maxLength={150}
              required
              onChange={(e) => {
                setMeta({ ...meta, place: e.target.value });
                setMetaDirty(true);
              }}
            />
          </label>
          <label>
            Remise en place (min)
            <input
              type="number"
              min={0}
              max={120}
              value={meta.gap}
              required
              onChange={(e) => {
                setMeta({ ...meta, gap: e.target.value });
                setMetaDirty(true);
              }}
            />
            <small>Paramètre illustratif entre deux groupes.</small>
          </label>
          <button type="submit" disabled={!metaDirty}>
            Enregistrer la journée
          </button>
        </form>
        <div className="amaterra-actions amaterra-imports">
          <FileImport
            label="Importer des groupes CSV"
            onFile={(f) => upload(f, "csv")}
          />
          <button
            onClick={() =>
              action(
                () =>
                  downloadCsv(
                    "amaterra-groupes-exemple.csv",
                    HEADERS,
                    groupRows(seed),
                  ),
                "Modèle CSV téléchargé. Il remplace tous les groupes lors de l’import.",
              )
            }
          >
            Modèle CSV
          </button>
          <button
            disabled={!history.canUndo}
            onClick={() => {
              history.undo();
              setNotice("Dernière modification annulée.");
            }}
          >
            Annuler
          </button>
          <button
            disabled={!history.canRedo}
            onClick={() => {
              history.redo();
              setNotice("Modification rétablie.");
            }}
          >
            Rétablir
          </button>
          <button
            disabled={dirty}
            onClick={() =>
              action(
                () => commit(addGroup(s), "Groupe ajouté."),
                "Groupe ajouté.",
              )
            }
          >
            Ajouter un groupe
          </button>
        </div>
        {dirty && (
          <p className="amaterra-unsaved" role="status">
            Des champs ont été modifiés. Enregistrez le groupe, la journée ou
            les fournitures pour recalculer et exporter.
          </p>
        )}
        {notice && (
          <p className="amaterra-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="amaterra-error">
            {error}
          </p>
        )}
        <div className="amaterra-workspace">
          <div>
            <section
              className="amaterra-programme"
              aria-label="Programme de la journée"
            >
              <div className="amaterra-axis" aria-hidden="true">
                <span>Groupes</span>
                <div>
                  {hours.map((h) => (
                    <b
                      key={h}
                      style={{ left: `${((h - begin) / span) * 100}%` }}
                    >
                      {clock(h)}
                    </b>
                  ))}
                </div>
              </div>
              {s.groups.map((g) => {
                const conflict = list.filter(
                  (x) => x.ids.length === 2 && x.ids.includes(g.id),
                );
                return (
                  <button
                    key={g.id}
                    className={`amaterra-group ${selected === g.id ? "is-selected" : ""}`}
                    aria-pressed={selected === g.id}
                    aria-label={`Modifier ${g.name}`}
                    onClick={() => {
                      setSelected(g.id);
                      setGroupDirty(false);
                    }}
                  >
                    <span className="amaterra-group-label">
                      <strong>{g.name}</strong>
                      <small>
                        {g.count} participants · {g.room}
                      </small>
                    </span>
                    <span
                      className="amaterra-track"
                      style={{ backgroundSize: `${(60 / span) * 100}% 100%` }}
                    >
                      <span
                        className={`amaterra-block ${conflict.length ? "is-conflict" : ""}`}
                        style={{
                          left: `${((minute(g.start) - begin) / span) * 100}%`,
                          width: `${(g.duration / span) * 100}%`,
                        }}
                      >
                        <strong>
                          {g.start} – {clock(minute(g.start) + g.duration)}
                        </strong>
                        <span>{FORMULAS[g.formula].name}</span>
                      </span>
                      {conflict.length > 0 && (
                        <span className="amaterra-conflict-label">
                          Créneaux à ajuster · {g.artist}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              <p className="amaterra-note">
                Sélectionnez un groupe pour le modifier. Les disponibilités
                représentées sont fictives.
              </p>
            </section>
            <GroupEditor
              key={group.id}
              group={group}
              onDirty={setGroupDirty}
              removable={s.groups.length > 1}
              onSave={(g) =>
                commit(
                  changeGroup(s, g),
                  "Groupe enregistré. Programme et fournitures recalculés.",
                )
              }
              onRemove={() =>
                action(() => {
                  commit(removeGroup(s, group.id), "Groupe retiré.");
                  setGroupDirty(false);
                }, "Groupe retiré.")
              }
            />
            <section
              className="amaterra-review"
              aria-label="Points à confirmer"
            >
              <div className="amaterra-section-heading">
                <h2>Avant de transmettre</h2>
                <span>
                  {remaining.length} point{remaining.length !== 1 ? "s" : ""}
                </span>
              </div>
              {remaining.length > 0 ? (
                <ul>
                  {remaining.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  Les quantités, les contraintes de l’exemple et les
                  déclarations sont renseignées.
                </p>
              )}
              <label className="amaterra-checkbox">
                <input
                  type="checkbox"
                  disabled={dirty}
                  checked={s.availability === programmeKey(s)}
                  onChange={(e) =>
                    commit(
                      {
                        ...s,
                        availability: e.target.checked ? programmeKey(s) : "",
                        reviewed: "",
                      },
                      "Déclaration de disponibilité mise à jour pour ce programme.",
                    )
                  }
                />
                <span>
                  J’ai vérifié la disponibilité du lieu et de l’intervenant pour
                  cette version.
                  <small>
                    Déclaration de démonstration, aucun créneau réellement
                    réservé.
                  </small>
                </span>
              </label>
              <button
                className="amaterra-primary"
                disabled={dirty || remaining.length > 0 || isReviewed(s)}
                onClick={() =>
                  action(
                    () =>
                      commit(
                        review(s),
                        "Préparation marquée revue. Aucune réservation n’a été effectuée.",
                      ),
                    "Préparation marquée revue. Aucune réservation n’a été effectuée.",
                  )
                }
              >
                {isReviewed(s)
                  ? "Préparation revue"
                  : "Marquer la préparation revue"}
              </button>
              <p className="amaterra-note">
                Vous pouvez aussi exporter un brouillon contenant les réserves.
                Toute modification remet la préparation à revoir.
              </p>
            </section>
          </div>
          <Supplies
            state={s}
            onDirty={setSupplyDirty}
            onSave={(patch) =>
              commit(
                updateSettings(s, patch),
                "Fournitures enregistrées. Le besoin utilise les groupes déjà enregistrés.",
              )
            }
          />
        </div>
        <section
          className="amaterra-exports"
          aria-label="Exporter la préparation"
        >
          <div>
            <h2>
              {isReviewed(s)
                ? "La préparation est revue"
                : "Exporter le brouillon"}
            </h2>
            <p>
              Les documents reflètent l’état enregistré, avec ses réserves.
              Aucun envoi ni réservation.
            </p>
          </div>
          <div className="amaterra-actions">
            <button
              disabled={dirty}
              onClick={() =>
                action(
                  () => downloadReport("amaterra-programme.html", report(s)),
                  "Programme HTML téléchargé, avec les réserves courantes.",
                )
              }
            >
              Programme HTML
            </button>
            <button
              disabled={dirty}
              onClick={() =>
                action(
                  () =>
                    downloadCsv(
                      "amaterra-fournitures.csv",
                      [
                        "fourniture",
                        "besoin",
                        "quantite_definie",
                        "stock_declare",
                        "manque",
                        "unite",
                        "regle",
                      ],
                      supplyRows(s),
                    ),
                  "Liste de fournitures CSV téléchargée.",
                )
              }
            >
              Fournitures CSV
            </button>
            <button
              className="amaterra-primary"
              disabled={dirty}
              onClick={() =>
                action(
                  () => downloadJson("amaterra-dossier.json", s),
                  "Dossier JSON sauvegardé.",
                )
              }
            >
              Sauvegarder le dossier
            </button>
            <FileImport
              label="Reprendre un dossier JSON"
              accept=".json,application/json"
              onFile={(f) => upload(f, "json")}
            />
          </div>
        </section>
        <details className="amaterra-sources">
          <summary>Règles publiques et paramètres de l’exemple</summary>
          <p>
            Les formules, durées, quantités de papier enfants et limite adultes
            viennent de la{" "}
            <a
              href="https://amaterra.fr/site/wp-content/uploads/2026/06/cecile-jacoud-presentation-4.pdf"
              target="_blank"
              rel="noreferrer"
            >
              présentation de Cécile Jacoud
            </a>
            . Stocks, horaires, noms de groupes, capacité enfants, papier
            adultes et partage des outils sont fictifs ou à déclarer. La
            capacité pédagogique et les conditions de sécurité restent à
            convenir avec l’artiste.
          </p>
        </details>
      </main>
      <DemoFooter />
    </div>
  );
}

import { useEffect, useState } from "react";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
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
  replay,
  status,
  clockText,
  blockReason,
  editRecord,
  resolveConflict,
  approve,
  runAttempt,
  advance,
  editRoute,
  importEvents,
  restore,
  manifest,
  recordRows,
  HEADERS,
} from "./model.js";
import "./styles.css";

function PieceEditor({ state, record, apply }) {
  const [draft, setDraft] = useState({ ...record.working });
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [variant, setVariant] = useState("");
  useEffect(() => {
    setDraft({ ...record.working });
    setConfirmed(false);
    setNote("");
    setVariant("");
  }, [record]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(record.working);
  const current = status(state, record),
    blocked = blockReason(state, record);
  return (
    <section
      className="optim-editor"
      id="optim-editor"
      aria-label="Détail de l’événement"
    >
      <div className="optim-detail-head">
        <span>Événement sélectionné</span>
        <code>{record.id}</code>
      </div>
      <h2>
        {current.key === "prepared"
          ? "Action préparée"
          : blocked
            ? "Résoudre le point bloquant"
            : "Valider avant de préparer"}
      </h2>
      <p className="optim-editor-intro">
        {current.key === "prepared"
          ? "Cette action figure dans le manifeste local. Aucun document n’a été transféré."
          : "Le rattachement et la présence du fichier restent des décisions humaines, y compris dans cet exemple."}
      </p>
      {record.variants.length > 1 && (
        <div className="optim-conflict">
          <strong>
            {record.resolution
              ? "Choix de version enregistré"
              : "Même identifiant, deux contenus"}
          </strong>
          <p>
            Les versions reçues restent conservées. Retenir une version retire
            la validation précédente.
          </p>
          <label>
            Version à conserver
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
            >
              <option value="">Choisir explicitement</option>
              {record.variants.map((v, i) => (
                <option key={i} value={i}>
                  Version {i + 1} · {v.doc} · {v.client}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={variant === ""}
            onClick={() =>
              apply(
                () => resolveConflict(state, record.id, Number(variant)),
                "Version retenue. Vérifiez le rattachement avant validation.",
              )
            }
          >
            Retenir cette version
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply(
            () => editRecord(state, record.id, draft),
            "Correction enregistrée. Les validations et tentatives précédentes sont retirées.",
          );
        }}
      >
        <label>
          Client rattaché
          <select
            value={draft.client}
            onChange={(e) => setDraft({ ...draft, client: e.target.value })}
          >
            {!state.routes[draft.client] && (
              <option value={draft.client}>
                {draft.client} · non rattaché
              </option>
            )}
            {Object.entries(state.routes).map(([id, dest]) => (
              <option key={id} value={id}>
                {id} · {dest.split(" / ")[0]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Référence de la pièce
          <input
            value={draft.doc}
            onChange={(e) => setDraft({ ...draft, doc: e.target.value })}
            maxLength="100"
          />
        </label>
        <label className="optim-checkbox">
          <input
            type="checkbox"
            checked={draft.hasFile}
            onChange={(e) => setDraft({ ...draft, hasFile: e.target.checked })}
          />
          <span>Présence du fichier déclarée</span>
        </label>
        <label>
          Réponses fournies au banc
          <select
            value={draft.response}
            onChange={(e) => setDraft({ ...draft, response: e.target.value })}
          >
            <option value="200">Succès immédiat · 200</option>
            <option value="429,200">Limitation puis succès · 429, 200</option>
            <option value="503,503,503">
              Indisponible trois fois · 503, 503, 503
            </option>
          </select>
        </label>
        <p className="optim-small">
          Ce sont des cas d’essai déterministes. Aucune API n’est interrogée.
        </p>
        <button disabled={!dirty} className="optim-wide">
          Enregistrer la correction
        </button>
      </form>
      <div className="optim-destination">
        <span>Destination déclarée</span>
        <strong>
          {state.routes[record.working.client] || "À définir par rattachement"}
        </strong>
      </div>
      {blocked && (
        <p className="optim-blocked">
          {blocked}. Corrigez ce point avant de valider.
        </p>
      )}
      {current.key === "review" && (
        <div className="optim-approval">
          <label className="optim-checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>Rattachement vérifié sur cette version</span>
          </label>
          <label>
            Note de validation, facultative
            <textarea
              rows="2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength="800"
            />
          </label>
          <button
            className="optim-primary optim-wide"
            disabled={dirty}
            onClick={() =>
              apply(
                () => approve(state, record.id, confirmed, note),
                "Validation enregistrée. Lancez maintenant la réponse de test.",
              )
            }
          >
            Valider cette pièce
          </button>
        </div>
      )}
      {current.key === "approved" && (
        <button
          className="optim-primary optim-wide"
          disabled={dirty}
          onClick={() =>
            apply(
              () => runAttempt(state, record.id),
              "Réponse de test appliquée. Consultez le statut et le journal.",
            )
          }
        >
          Lancer l’essai de préparation
        </button>
      )}
      <div className={`optim-current ${current.key}`}>
        <strong>{current.label}</strong>
        <span>
          {record.attempts} tentative(s) ·{" "}
          {record.lastCode
            ? `dernière réponse ${record.lastCode}`
            : "aucune réponse de test"}
        </span>
        {current.key === "retry" && (
          <p>
            Avancez l’horloge d’essai. La tentative suivante attend{" "}
            {clockText(record.nextAt)}.
          </p>
        )}
        {current.key === "failed" && (
          <p>
            Le plafond est atteint. Pour un autre essai, changez les réponses
            fournies et revalidez.
          </p>
        )}
        {record.note && <p>Note · {record.note}</p>}
      </div>
      {dirty && (
        <p className="optim-small">
          Une correction attend son enregistrement. Le manifeste utilise
          uniquement les valeurs enregistrées.
        </p>
      )}
    </section>
  );
}

function Routing({ state, apply }) {
  const [draft, setDraft] = useState({ ...state.routes });
  useEffect(() => setDraft({ ...state.routes }), [state.routes]);
  return (
    <details className="optim-routing">
      <summary>Destinations et entrées reçues</summary>
      <p>
        Changer une destination retire les validations et préparations du client
        concerné. Les événements reçus restent immuables.
      </p>
      <div className="optim-routes">
        {Object.entries(state.routes).map(([id]) => (
          <form
            key={id}
            onSubmit={(e) => {
              e.preventDefault();
              apply(
                () => editRoute(state, id, draft[id]),
                "Destination modifiée. Les pièces de ce client sont à revalider.",
              );
            }}
          >
            <label>
              Destination {id}
              <input
                value={draft[id]}
                onChange={(e) => setDraft({ ...draft, [id]: e.target.value })}
                maxLength="160"
              />
            </label>
            <button>Appliquer à {id}</button>
          </form>
        ))}
      </div>
      <div
        className="optim-scroll"
        role="region"
        tabIndex="0"
        aria-label="Entrées reçues, tableau défilable"
      >
        <table>
          <thead>
            <tr>
              <th>Réception</th>
              <th>Événement</th>
              <th>Client reçu</th>
              <th>Pièce reçue</th>
              <th>Fichier déclaré</th>
              <th>Réponses de test</th>
            </tr>
          </thead>
          <tbody>
            {state.sources.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{r.event}</td>
                <td>{r.client}</td>
                <td>{r.doc}</td>
                <td>{r.hasFile ? "oui" : "non"}</td>
                <td>{r.response}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function App() {
  useDocumentTitle("Optimadmin · Banc de recette");
  const history = useHistory(seed);
  const state = history.value;
  const [selected, setSelected] = useState("evt-001"),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [showAll, setShowAll] = useState(false);
  const record =
    state.records.find((r) => r.id === selected) || state.records[0];
  const plan = manifest(state);
  const counts = {
    blocked: state.records.filter((r) => status(state, r).key === "blocked")
      .length,
    review: state.records.filter((r) => status(state, r).key === "review")
      .length,
    prepared: plan.actions.length,
  };
  const shown = state.records.filter(
    (r) =>
      filter === "all" ||
      (filter === "waiting"
        ? status(state, r).key !== "prepared"
        : status(state, r).key === filter),
  );
  const apply = (fn, message) => {
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
  };
  const output = (fn) => {
    try {
      fn();
      setError("");
      setNotice("Fichier du banc téléchargé. Aucun transfert externe.");
    } catch (e) {
      setError(e.message);
    }
  };
  const onCsv = async (file) => {
    try {
      const raw = await readLocalFile(file, { maxBytes: 1000000 });
      if (
        apply(
          () => importEvents(state, raw),
          "Lot importé et réceptionné. Vérifiez les exceptions.",
        )
      ) {
        setSelected("");
        setFilter("all");
      }
    } catch (e) {
      setError(e.message);
    }
  };
  const onJson = async (file) => {
    try {
      const raw = await readLocalFile(file);
      if (
        apply(
          () => restore(raw),
          "Banc restauré avec ses validations et tentatives.",
        )
      ) {
        setSelected("");
        setFilter("all");
      }
    } catch (e) {
      setError(e.message);
    }
  };
  const report = () =>
    downloadReport("optimadmin-rapport-recette.html", {
      title: "Recette locale du transfert de pièces",
      subtitle: `Données fictives · Horloge ${clockText(state.clock)} · Aucun transfert exécuté`,
      sections: [
        {
          title: "Résultat courant",
          paragraphs: [
            `${state.sources.length} réceptions, ${state.records.length} identifiants distincts, ${plan.actions.length} actions préparées, ${plan.exceptions.length} exceptions ou attentes.`,
            `Réponses 200/429/503 fournies comme cas d’essai. Plafond trois tentatives ; délais de reprise 60 puis 120 secondes.`,
            `La validation dépend du contenu et de la destination courants. Un identifiant événement identique et un contenu identique sont reconnus au replay.`,
          ],
          headers: [
            "Événement",
            "Client",
            "Pièce",
            "Statut",
            "Tentatives",
            "Destination",
            "Note",
          ],
          rows: recordRows(state),
        },
        {
          title: "Journal d’essai",
          headers: ["Heure", "Événement", "Action", "Détail"],
          rows: state.log.map((l) => [
            clockText(l.time),
            l.event,
            l.action,
            l.detail,
          ]),
        },
      ],
    });
  return (
    <div className="optim-app">
      <header className="optim-header">
        <span>
          <strong>OPTIMADMIN</strong>
          <span className="optim-separator">/</span>Banc de recette
        </span>
        <span>Prototype indépendant · Données fictives</span>
      </header>
      <main>
        <div className="optim-title">
          <div>
            <h1>Éprouver le transfert de pièces</h1>
            <p>
              Rejouez le lot. Chaque identifiant doit garder une seule action,
              même après plusieurs réceptions.
            </p>
          </div>
          <div className="optim-actions">
            <FileImport
              label="Importer les événements"
              accept=".csv,text/csv"
              onFile={onCsv}
            />
            <button
              className="optim-primary"
              onClick={() =>
                apply(
                  () => replay(state),
                  "Lot rejoué. Les doublons connus ont été ignorés sans retirer les décisions existantes.",
                )
              }
            >
              Rejouer le lot
            </button>
          </div>
        </div>
        <div className="optim-pipeline">
          <div>
            <span className="optim-node">R</span>
            <span>
              <strong>Réception</strong>
              <small>
                {state.sources.length} entrées · {state.records.length}{" "}
                identifiants
              </small>
            </span>
          </div>
          <div>
            <span className="optim-node">C</span>
            <span>
              <strong>Contrôle</strong>
              <small>
                {counts.blocked} blocages · {counts.review} validations
                attendues
              </small>
            </span>
          </div>
          <div>
            <span className="optim-node">P</span>
            <span>
              <strong>Préparation</strong>
              <small>{counts.prepared} action(s) dans le manifeste</small>
            </span>
          </div>
        </div>
        {error && (
          <div className="optim-error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <p className="optim-feedback" role="status">
            {notice}
          </p>
        )}
        <div className="optim-workspace">
          <section className="optim-events" aria-label="Lot d’événements">
            <div className="optim-events-head">
              <div>
                <h2>Lot de travail</h2>
                <p>Un dossier par identifiant reçu</p>
              </div>
              <div className="optim-clock">
                <span>
                  Horloge d’essai <strong>{clockText(state.clock)}</strong>
                </span>
                <button
                  onClick={() =>
                    apply(
                      () => advance(state, 60),
                      "Horloge avancée d’une minute ; les reprises arrivées à échéance ont été jouées.",
                    )
                  }
                >
                  + 60 secondes
                </button>
              </div>
            </div>
            <div className="optim-filterbar">
              <label>
                Afficher
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Tous les événements</option>
                  <option value="waiting">Hors manifeste</option>
                  <option value="blocked">Points bloquants</option>
                  <option value="prepared">Actions préparées</option>
                  <option value="retry">Reprises en attente</option>
                </select>
              </label>
              <div>
                <button
                  disabled={!history.canUndo}
                  onClick={() => {
                    history.undo();
                    setError("");
                    setNotice("Dernière action annulée.");
                  }}
                >
                  Annuler
                </button>
                <button
                  disabled={!history.canRedo}
                  onClick={() => {
                    history.redo();
                    setError("");
                    setNotice("Action rétablie.");
                  }}
                >
                  Rétablir
                </button>
              </div>
            </div>
            <div
              className="optim-scroll"
              role="region"
              tabIndex="0"
              aria-label="Événements, tableau défilable"
            >
              <table>
                <thead>
                  <tr>
                    <th>Événement</th>
                    <th>Client</th>
                    <th>Pièce</th>
                    <th>Résultat</th>
                    <th>Essais</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr
                      key={r.id}
                      className={record?.id === r.id ? "selected" : ""}
                    >
                      <td>
                        <button
                          className="optim-eventlink"
                          onClick={() => {
                            setSelected(r.id);
                            setError("");
                          }}
                          aria-label={`Ouvrir ${r.id}`}
                        >
                          {r.id}
                        </button>
                      </td>
                      <td>{r.working.client}</td>
                      <td>{r.working.doc}</td>
                      <td>
                        <span className={`optim-badge ${status(state, r).key}`}>
                          {status(state, r).label}
                        </span>
                      </td>
                      <td>{r.attempts}/3</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shown.length && (
                <p className="optim-empty">Aucun événement dans ce filtre.</p>
              )}
            </div>
            <p className="optim-table-note">
              Le lot initial contient un doublon identique et un identifiant
              reçu avec deux références différentes. Les entrées d’origine sont
              conservées ci-dessous.
            </p>
            <a className="optim-mobile-link" href="#optim-editor">
              Aller au détail sélectionné
            </a>
            <div className="optim-engine-note">
              <strong>Ce que le banc éprouve</strong>
              <p>
                Une validation précède toute préparation. Les réponses d’erreur
                attendent 60 puis 120 secondes, avec trois tentatives au
                maximum.
              </p>
              <p>Aucune messagerie, GED ou facture réelle n’est connectée.</p>
            </div>
          </section>
          {record && (
            <PieceEditor state={state} record={record} apply={apply} />
          )}
        </div>
        <Routing state={state} apply={apply} />
        <section className="optim-journal">
          <div className="optim-journal-head">
            <h2>
              Journal de recette <span>{state.log.length} entrées</span>
            </h2>
            <button onClick={() => setShowAll(!showAll)}>
              {showAll
                ? "Afficher les dernières entrées"
                : "Voir tout le journal"}
            </button>
          </div>
          <div className="optim-log">
            {(showAll ? state.log : state.log.slice(-7)).map((l, i) => (
              <div key={i}>
                <time>{clockText(l.time)}</time>
                <code>{l.event}</code>
                <strong>{l.action}</strong>
                <span>{l.detail}</span>
              </div>
            ))}
          </div>
          <div className="optim-exports">
            <div>
              <h3>Sorties du lot</h3>
              <p>
                {plan.actions.length} action(s) préparée(s),{" "}
                {plan.exceptions.length} attente(s) ou exception(s)
                conservée(s).
              </p>
            </div>
            <button
              className="optim-primary"
              onClick={() =>
                output(() => downloadJson("optimadmin-manifeste.json", plan))
              }
            >
              Manifeste de transfert JSON
            </button>
            <button
              onClick={() =>
                output(() =>
                  downloadCsv(
                    "optimadmin-journal-recette.csv",
                    ["heure", "evenement", "action", "detail"],
                    state.log.map((l) => [
                      clockText(l.time),
                      l.event,
                      l.action,
                      l.detail,
                    ]),
                  ),
                )
              }
            >
              Journal de recette CSV
            </button>
            <button onClick={() => output(report)}>
              Rapport HTML imprimable
            </button>
          </div>
        </section>
        <details className="optim-files">
          <summary>Fichiers d’exemple et sauvegarde du banc</summary>
          <p>
            Importer un CSV remplace le lot courant. Annuler permet de revenir
            au lot précédent. Sauvegardez le dossier JSON pour garder vos
            corrections et vos décisions.
          </p>
          <div>
            <button
              onClick={() =>
                output(() =>
                  downloadCsv(
                    "optimadmin-evenements-exemple.csv",
                    HEADERS,
                    seed().sources.map((s) => [
                      s.event,
                      s.client,
                      s.doc,
                      s.hasFile ? "oui" : "non",
                      s.response,
                    ]),
                  ),
                )
              }
            >
              Télécharger le CSV d’exemple
            </button>
            <button
              onClick={() =>
                output(() => downloadJson("optimadmin-dossier.json", state))
              }
            >
              Sauvegarder le dossier JSON
            </button>
            <FileImport
              label="Restaurer un dossier"
              accept=".json,application/json"
              onFile={onJson}
            />
            <button
              onClick={() => {
                history.reset();
                setSelected("evt-001");
                setFilter("all");
                setError("");
                setNotice(
                  "Exemple rechargé. Vous pouvez annuler cette action.",
                );
              }}
            >
              Recharger l’exemple
            </button>
          </div>
        </details>
        <p className="optim-local">
          Tout se déroule dans cet onglet, sans compte, envoi ou sauvegarde
          automatique. Le manifeste est un plan local de transfert. Fermer
          l’onglet efface le banc non sauvegardé.
        </p>
      </main>
      <DemoFooter />
    </div>
  );
}

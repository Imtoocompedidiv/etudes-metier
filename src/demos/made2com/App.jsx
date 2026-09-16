import React, { useState } from "react";
import "@fontsource/ubuntu/latin-400.css";
import "@fontsource/ubuntu/latin-500.css";
import "@fontsource/ubuntu/latin-700.css";
import "@fontsource/open-sans/latin-400.css";
import "@fontsource/open-sans/latin-600.css";
import { useHistory } from "../../shared/state.js";
import {
  DemoContext,
  DemoFooter,
  ErrorMessage,
  FileImport,
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
  validDossier,
  normalizeDossier,
  normalizeRules,
  normalizeEvents,
  normalizeContacts,
  parseContacts,
  parseEvents,
  contactHeaders,
  eventHeaders,
  kinds,
  outcomes,
  simulate,
  change,
  displayDate,
  timestamp,
  decisionHeaders,
  decisionRows,
} from "./model.js";
import "./styles.css";

const localDate = (v) => v.slice(0, 16);
const utcDate = (v) => timestamp(`${v}:00Z`);
function TableScroll({ children, label }) {
  return (
    <div className="m2-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
function RuleForm({ rules, onApply }) {
  const [draft, setDraft] = useState(structuredClone(rules));
  const [error, setError] = useState("");
  const number = (name, label, min, max) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={draft[name]}
        onChange={(e) =>
          setDraft({
            ...draft,
            [name]: e.target.value === "" ? "" : Number(e.target.value),
          })
        }
      />
    </label>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onApply(normalizeRules(draft));
          setError("");
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <h3>Paramètres de la simulation</h3>
      <div className="m2-rule-numbers">
        {number("maxMessages", "Maximum de messages", 1, 20)}
        {number("windowHours", "Fenêtre de pression (h)", 1, 720)}
        {number("delayHours", "Délai après panier (h)", 0, 168)}
      </div>
      <div className="m2-zones">
        {draft.zones.map((z, i) => (
          <label key={z.id}>
            Limite {z.label} (UTC)
            <input
              type="datetime-local"
              min="2000-01-01T00:00"
              max="2099-12-31T23:59"
              required
              value={localDate(z.cutoff)}
              onChange={(e) => {
                const zones = structuredClone(draft.zones);
                zones[i].cutoff = e.target.value ? `${e.target.value}:00Z` : "";
                setDraft({ ...draft, zones });
              }}
            />
          </label>
        ))}
      </div>
      <p className="m2-help">
        La fenêtre exclut sa borne basse. À l’heure limite, la livraison reste
        admissible ; la carte cadeau intervient après.
      </p>
      <ErrorMessage>{error}</ErrorMessage>
      <button className="m2-primary" type="submit">
        Appliquer les règles
      </button>
    </form>
  );
}
function ContactEdit({ contact, zones, onApply }) {
  const [draft, setDraft] = useState(contact);
  return (
    <details className="m2-contact-edit">
      <summary>Modifier la fiche · {contact.name}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply(draft);
        }}
      >
        <label>
          Nom de test
          <input
            maxLength={80}
            value={draft.name}
            required
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          Zone
          <select
            value={draft.zone}
            onChange={(e) => setDraft({ ...draft, zone: e.target.value })}
          >
            {!zones.some((z) => z.id === draft.zone) && (
              <option value={draft.zone}>{draft.zone} · inconnue</option>
            )}
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Accord initial fictif
          <select
            value={draft.consent}
            onChange={(e) => setDraft({ ...draft, consent: e.target.value })}
          >
            <option value="yes">Oui</option>
            <option value="no">Non</option>
          </select>
        </label>
        <button type="submit">Enregistrer la fiche</button>
      </form>
    </details>
  );
}
function EventEdit({ event, onApply, onClose }) {
  const [draft, setDraft] = useState(event),
    [error, setError] = useState("");
  return (
    <form
      className="m2-event-edit"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onApply(normalizeEvents([draft])[0]);
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <h3>Événement {event.id}</h3>
      <label>
        Type
        <select
          value={draft.kind}
          onChange={(e) =>
            setDraft({
              ...draft,
              kind: e.target.value,
              cart_id: ["cart", "order"].includes(e.target.value)
                ? draft.cart_id
                : "",
            })
          }
        >
          {Object.entries(kinds).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Date (UTC)
        <input
          type="datetime-local"
          required
          value={localDate(draft.at)}
          onChange={(e) =>
            setDraft({
              ...draft,
              at: e.target.value ? `${e.target.value}:00Z` : "",
            })
          }
        />
      </label>
      {["cart", "order"].includes(draft.kind) && (
        <label>
          Référence panier
          <input
            value={draft.cart_id}
            maxLength={40}
            required
            onChange={(e) => setDraft({ ...draft, cart_id: e.target.value })}
          />
        </label>
      )}
      <ErrorMessage>{error}</ErrorMessage>
      <div className="m2-actions">
        <button className="m2-primary">Enregistrer l’événement</button>
        <button type="button" onClick={onClose}>
          Fermer
        </button>
      </div>
    </form>
  );
}
function Decision({ row, rules }) {
  return (
    <aside
      className={`m2-decision m2-outcome-${row.outcome}`}
      aria-live="polite"
    >
      <h2>{row.label}</h2>
      <p className="m2-reason">{row.reason}</p>
      <h3>Vérification des règles</h3>
      <dl>
        <div>
          <dt>Accord</dt>
          <dd>{row.consent ? "Actif" : "Absent"}</dd>
        </div>
        <div>
          <dt>Panier</dt>
          <dd>{row.cart?.cart_id || "Aucun"}</dd>
        </div>
        <div>
          <dt>Achat associé</dt>
          <dd>{row.order ? "Oui" : "Non"}</dd>
        </div>
        <div>
          <dt>Pression</dt>
          <dd>
            {row.messages} / {rules.maxMessages} messages
          </dd>
        </div>
        <div>
          <dt>Livraison</dt>
          <dd>{row.zone ? displayDate(row.zone.cutoff) : "Zone inconnue"}</dd>
        </div>
      </dl>
      <p className="m2-help">
        La première règle bloquante décide. Le détail reste visible pour la
        recette. Les accords de cet exemple ne constituent pas des preuves
        juridiques.
      </p>
    </aside>
  );
}
export default function App() {
  useDocumentTitle("Made2Com · Rejouer une séquence WooCommerce");
  const history = useHistory(initial, {
      key: "made2com:v1",
      validate: validDossier,
    }),
    d = history.value;
  const [selected, setSelected] = useState("C02"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState(null);
  const current = simulate(d),
    reference = simulate(d, d.reference.rules, d.reference.at),
    row =
      current.decisions.find((r) => r.id === selected) || current.decisions[0];
  const visible = current.decisions.filter(
    (r) =>
      (filter === "all" || r.outcome === filter) &&
      `${r.id} ${r.name}`
        .toLocaleLowerCase("fr")
        .includes(query.toLocaleLowerCase("fr")),
  );
  const perform = (fn, message) => {
    try {
      fn();
      setError("");
      setNotice(message || "");
    } catch (err) {
      setError(err.message);
    }
  };
  const commit = (patch, action) => {
    history.set(change(d, patch, action));
    setEditing(null);
    setNotice(action);
  };
  const updateAt = (v) =>
    perform(
      () => commit({ at: utcDate(v) }, "Date de simulation modifiée."),
      "Simulation recalculée.",
    );
  async function importFile(file, type) {
    try {
      const value = await readLocalFile(file, { maxBytes: 1048576 });
      if (type === "dossier") {
        history.set(normalizeDossier(JSON.parse(value)));
        setEditing(null);
      } else if (type === "rules")
        commit(
          { rules: normalizeRules(JSON.parse(value)) },
          "Règles importées.",
        );
      else if (type === "contacts")
        commit(
          { contacts: parseContacts(value) },
          "Fichier contacts remplacé.",
        );
      else
        commit({ events: parseEvents(value) }, "Fichier événements remplacé.");
      setError("");
      setNotice(
        "Import appliqué. Les références ont été recalculées ; vous pouvez annuler.",
      );
    } catch (err) {
      setError(`Import refusé. ${err.message}`);
    }
  }
  function report() {
    downloadReport("made2com-recette.html", {
      title: "Recette de séquence WooCommerce",
      subtitle: `Simulation ${displayDate(d.at)} UTC · données fictives · aucun envoi`,
      sections: [
        {
          title: "Règles",
          paragraphs: [
            `${d.rules.maxMessages} messages maximum dans ${d.rules.windowHours} h ; délai après panier ${d.rules.delayHours} h. Priorité : erreurs, accord, panier, achat associé, zone, délai, pression, livraison.`,
            "La borne basse de pression est exclue. Les événements postérieurs à la simulation sont ignorés. Seules les commandes associées au dernier panier le ferment. Les décisions ne programment aucun message.",
          ],
          headers: ["Zone", "Date limite UTC"],
          rows: d.rules.zones.map((z) => [z.label, z.cutoff]),
        },
        { title: "Décisions", headers: decisionHeaders, rows: decisionRows(d) },
        {
          title: "Événements à corriger",
          headers: ["Événement", "Contact", "Motif"],
          rows: current.issues.map((i) => [i.id, i.contact_id, i.reason]),
        },
        { title: "Journal du dossier", paragraphs: d.journal },
      ],
    });
  }
  const toolbar = (
    <>
      <button
        onClick={() => {
          history.undo();
          setEditing(null);
          setNotice("Dernière modification annulée.");
        }}
        disabled={!history.canUndo}
      >
        Annuler
      </button>
      <button
        onClick={() => {
          history.redo();
          setEditing(null);
        }}
        disabled={!history.canRedo}
      >
        Rétablir
      </button>
    </>
  );
  return (
    <div className="made2com-app">
      <header className="m2-header">
        <strong>Made2Com</strong>
        <span>Atelier de recette</span>
        <div className="m2-actions">{toolbar}</div>
      </header>
      <DemoContext company="Made2Com">
        Données fictives, traitement local et aucun envoi.
      </DemoContext>
      <main>
        <div className="m2-heading">
          <h1>Rejouer une séquence WooCommerce</h1>
          <p>
            Avancez au 21 décembre pour suivre la bascule carte cadeau de
            Camille.
          </p>
        </div>
        <section className="m2-datebar" aria-label="Calendrier de simulation">
          <label>
            Date de simulation (UTC)
            <input
              type="datetime-local"
              min="2000-01-01T00:00"
              max="2099-12-31T23:59"
              value={localDate(d.at)}
              onChange={(e) => {
                if (e.target.value) updateAt(e.target.value);
              }}
            />
          </label>
          <p className="m2-help">
            Toutes les heures sont en UTC.
            <br />
            La simulation évalue les événements déjà survenus.
          </p>
          <div className="m2-timeline" aria-label="Raccourcis décembre 2026">
            {[16, 17, 18, 19, 20, 21, 22, 23, 24].map((day) => (
              <button
                key={day}
                aria-pressed={d.at.startsWith(`2026-12-${day}`)}
                onClick={() => updateAt(`2026-12-${day}T12:00`)}
              >
                <span />
                {day} déc.
              </button>
            ))}
          </div>
        </section>
        <ErrorMessage>{error}</ErrorMessage>
        <p className="m2-status" role="status">
          {notice}
        </p>
        <div className="m2-workspace">
          <section className="m2-contacts">
            <h2>Contacts ({d.contacts.length})</h2>
            <div className="m2-search">
              <label>
                Rechercher
                <input
                  type="search"
                  placeholder="Nom ou code"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                Décision
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Toutes les décisions</option>
                  {Object.entries(outcomes).map(([v, label]) => (
                    <option value={v} key={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="m2-contact-list">
              {visible.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSelected(r.id);
                    setEditing(null);
                  }}
                  aria-pressed={row.id === r.id}
                >
                  <span>
                    {r.id} <strong>{r.name}</strong>
                  </span>
                  <small>{r.label}</small>
                </button>
              ))}
              {!visible.length && <p>Aucun contact pour ce filtre.</p>}
            </div>
          </section>
          <section className="m2-ledger">
            <h2>
              Historique pour {row.id} · {row.name}
            </h2>
            <ol>
              {row.all.map((e) => (
                <li
                  key={e.id}
                  className={`${e.at > d.at ? "m2-future" : ""} ${current.issues.some((i) => i.id === e.id) ? "m2-invalid" : ""}`}
                >
                  <time>{displayDate(e.at)}</time>
                  <div>
                    <strong>{kinds[e.kind]}</strong>
                    <p>
                      {e.cart_id ? `Panier ${e.cart_id}` : `Événement ${e.id}`}
                    </p>
                    {e.at > d.at && <small>Après la simulation, ignoré</small>}
                    {current.issues
                      .filter((i) => i.id === e.id)
                      .map((i) => (
                        <small key={i.id}>{i.reason}</small>
                      ))}
                    <button onClick={() => setEditing(e)}>
                      Modifier {e.id}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            {!row.all.length && (
              <p className="m2-empty">Aucun événement pour ce contact.</p>
            )}
            <div className="m2-ledger-bottom">
              <button
                onClick={() => {
                  let n = d.events.length + 1;
                  while (d.events.some((e) => e.id === `AJOUT${n}`)) n++;
                  setEditing({
                    id: `AJOUT${n}`,
                    contact_id: row.id,
                    kind: "withdraw",
                    at: d.at,
                    cart_id: "",
                  });
                }}
              >
                Ajouter un événement
              </button>
              <ContactEdit
                key={JSON.stringify(d.contacts.find((c) => c.id === row.id))}
                contact={d.contacts.find((c) => c.id === row.id)}
                zones={d.rules.zones}
                onApply={(c) =>
                  perform(
                    () =>
                      commit(
                        {
                          contacts: normalizeContacts(
                            d.contacts.map((r) => (r.id === c.id ? c : r)),
                          ),
                        },
                        `Fiche ${c.id} modifiée.`,
                      ),
                    "Fiche enregistrée.",
                  )
                }
              />
            </div>
            {editing && (
              <EventEdit
                key={editing.id}
                event={editing}
                onClose={() => setEditing(null)}
                onApply={(e) =>
                  perform(
                    () =>
                      commit(
                        {
                          events: normalizeEvents([
                            ...d.events.filter((r) => r.id !== e.id),
                            e,
                          ]),
                        },
                        `Événement ${e.id} enregistré.`,
                      ),
                    "Événement enregistré ; séquence recalculée.",
                  )
                }
              />
            )}
          </section>
          <Decision row={row} rules={d.rules} />
        </div>
        <section className="m2-settings">
          <h2>Tester un autre réglage</h2>
          <div className="m2-settings-body">
            <RuleForm
              key={JSON.stringify(d.rules)}
              rules={d.rules}
              onApply={(rules) =>
                commit({ rules }, "Règles de simulation modifiées.")
              }
            />
            <div className="m2-comparison">
              <h3>Comparer les décisions</h3>
              <p className="m2-help">
                Référence du {displayDate(d.reference.at)} UTC, avec les mêmes
                fichiers et les règles mémorisées. La simulation affiche le
                dossier courant.
              </p>
              <TableScroll label="Comparaison des décisions, défilement horizontal">
                <table>
                  <thead>
                    <tr>
                      <th>Contact</th>
                      <th>Référence</th>
                      <th>Simulation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.decisions.map((r, i) => (
                      <tr
                        key={r.id}
                        className={
                          reference.decisions[i].outcome !== r.outcome
                            ? "m2-changed"
                            : ""
                        }
                      >
                        <th>{r.name}</th>
                        <td>{reference.decisions[i].label}</td>
                        <td>{r.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
              <button
                onClick={() =>
                  perform(
                    () =>
                      commit(
                        {
                          reference: {
                            at: d.at,
                            rules: structuredClone(d.rules),
                          },
                        },
                        "Référence de comparaison mise à jour.",
                      ),
                    "Référence mémorisée.",
                  )
                }
              >
                Prendre cette simulation comme référence
              </button>
            </div>
          </div>
        </section>
        {current.issues.length > 0 && (
          <section className="m2-exceptions">
            <h2>Événements à corriger</h2>
            <p>
              Ces événements ne sont pas évalués. Une anomalie survenue bloque
              la décision du contact associé ; un contact inconnu est signalé
              ici.
            </p>
            <TableScroll label="Événements non évalués">
              <table>
                <thead>
                  <tr>
                    <th>Événement</th>
                    <th>Contact</th>
                    <th>Motif</th>
                  </tr>
                </thead>
                <tbody>
                  {current.issues.map((i) => (
                    <tr key={i.id}>
                      <td>{i.id}</td>
                      <td>{i.contact_id}</td>
                      <td>{i.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </section>
        )}
        <section className="m2-files">
          <h2>Imports et exports</h2>
          <div className="m2-files-body">
            <div>
              <h3>Contacts et événements</h3>
              <FileImport
                label="Importer les contacts CSV"
                accept=".csv,text/csv"
                onFile={(f) => importFile(f, "contacts")}
              />
              <FileImport
                label="Importer les événements CSV"
                accept=".csv,text/csv"
                onFile={(f) => importFile(f, "events")}
              />
              <p className="m2-help">
                Chaque import remplace son fichier et recalcule les références.
                200 contacts et 1 000 événements maximum.
              </p>
              <div className="m2-actions">
                <button
                  onClick={() =>
                    downloadCsv(
                      "made2com-contacts.csv",
                      contactHeaders,
                      d.contacts,
                    )
                  }
                >
                  Contacts actuels CSV
                </button>
                <button
                  onClick={() =>
                    downloadCsv(
                      "made2com-evenements.csv",
                      eventHeaders,
                      d.events,
                    )
                  }
                >
                  Événements actuels CSV
                </button>
              </div>
            </div>
            <div>
              <h3>Règles et dossier</h3>
              <FileImport
                label="Importer les règles JSON"
                accept=".json,application/json"
                onFile={(f) => importFile(f, "rules")}
              />
              <FileImport
                label="Restaurer un dossier JSON"
                accept=".json,application/json"
                onFile={(f) => importFile(f, "dossier")}
              />
              <div className="m2-actions">
                <button
                  onClick={() => downloadJson("made2com-regles.json", d.rules)}
                >
                  Règles JSON
                </button>
                <button
                  onClick={() => downloadJson("made2com-dossier.json", d)}
                >
                  Dossier JSON
                </button>
              </div>
            </div>
            <div>
              <h3>Livrer la recette</h3>
              <p className="m2-help">
                Le CSV contient toutes les décisions, y compris les erreurs. Il
                ne sert pas de liste d’envoi.
              </p>
              <div className="m2-actions">
                <button
                  className="m2-primary"
                  onClick={() =>
                    downloadCsv(
                      "made2com-decisions.csv",
                      decisionHeaders,
                      decisionRows(d),
                    )
                  }
                >
                  Décisions CSV
                </button>
                <button onClick={report}>Rapport HTML</button>
              </div>
              <details>
                <summary>Règles et limites du modèle</summary>
                <p>
                  Accord initial, puis événements chronologiques. À heure égale,
                  un retrait prime sur un accord. Le dernier panier est la seule
                  relance étudiée ; une commande ne ferme que son propre panier.
                  Toute commande correspond à un achat complété, sans gestion de
                  remboursement.
                </p>
                <p>
                  Les messages dans la fenêtre sont des événements historiques,
                  pas le résultat d’envois simulés. Les zones, dates et plafonds
                  sont des paramètres de test, pas des règles Made2Com. Aucun
                  connecteur ni moteur CRM n’est utilisé.
                </p>
              </details>
              <button
                className="m2-reset"
                onClick={() => {
                  history.reset();
                  setEditing(null);
                  setNotice("Exemple rétabli. Cette action peut être annulée.");
                }}
              >
                Rétablir l’exemple
              </button>
            </div>
          </div>
        </section>
        {!history.storageAvailable && (
          <p>
            La sauvegarde locale est indisponible. Exportez le dossier pour le
            conserver.
          </p>
        )}
      </main>
      <DemoFooter />
    </div>
  );
}

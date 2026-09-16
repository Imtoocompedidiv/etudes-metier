import { Fragment, useState } from "react";
import "@fontsource/montserrat/600.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import {
  FileImport,
  ErrorMessage,
  DemoFooter,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import { useHistory } from "../../shared/state.js";
import {
  downloadCsv,
  downloadJson,
  downloadReport,
  readLocalFile,
  euro,
} from "../../shared/files.js";
import {
  initial,
  normalizeProject,
  compare,
  allocations,
  quantity,
  money,
  updateProject,
  setRequest,
  editOffer,
  parseImport,
  requestHeaders,
  stockHeaders,
  offerHeaders,
  offerRows,
} from "./model.js";
import "./styles.css";

function OfferEditor({ project, line, supplier, onChange }) {
  const offer = line.offer,
    stock = project.stocks.find((s) => s.article === line.id);
  const [error, setError] = useState("");
  return (
    <form
      className="afeo-editor"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const f = new FormData(event.currentTarget);
          let next = project;
          if (offer)
            next = editOffer(next, supplier, offer.reference, {
              unites_par_boite: quantity(f.get("pack"), "Unités par boîte", 1),
              prix:
                String(f.get("price")).trim() === ""
                  ? null
                  : money(f.get("price")),
              tarif_du: f.get("from"),
              valable_jusquau: f.get("until"),
            });
          next = updateProject(
            next,
            {
              stocks: next.stocks.map((s) =>
                s.article === line.id
                  ? {
                      ...s,
                      physique: quantity(f.get("physical")),
                      reserve: quantity(f.get("reserved")),
                    }
                  : s,
              ),
            },
            `Stock ${line.id} contrôlé`,
          );
          onChange(next);
          setError("");
        } catch (e) {
          setError(e.message);
        }
      }}
    >
      <strong>
        {offer
          ? `${supplier} · ${offer.reference}`
          : "Stock central · référence fournisseur à associer"}
      </strong>
      <div className="afeo-fields">
        {offer && (
          <>
            <label>
              Unités par boîte
              <input
                name="pack"
                inputMode="numeric"
                defaultValue={offer.unites_par_boite}
              />
            </label>
            <label>
              Prix de la boîte HT (€)
              <input
                name="price"
                inputMode="decimal"
                defaultValue={
                  offer.prix === null ? "" : (offer.prix / 100).toFixed(2)
                }
              />
            </label>
            <label>
              Tarif du
              <input type="date" name="from" defaultValue={offer.tarif_du} />
            </label>
            <label>
              Valable jusqu’au
              <input
                type="date"
                name="until"
                defaultValue={offer.valable_jusquau}
              />
            </label>
          </>
        )}
        <label>
          Stock physique (unités)
          <input
            name="physical"
            inputMode="numeric"
            defaultValue={stock.physique}
          />
        </label>
        <label>
          Déjà réservé (unités)
          <input
            name="reserved"
            inputMode="numeric"
            defaultValue={stock.reserve}
          />
        </label>
        <button className="afeo-primary">Appliquer</button>
      </div>
      <small>
        Le stock est partagé entre agences. Un prix laissé vide reste inconnu.
      </small>
      <ErrorMessage>{error}</ErrorMessage>
    </form>
  );
}
function SupplierEditor({ supplier, onSave }) {
  const [error, setError] = useState("");
  return (
    <form
      className="afeo-shipping"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          const f = new FormData(e.currentTarget);
          onSave({
            ...supplier,
            freight: money(f.get("port"), "Port"),
            freeFrom:
              String(f.get("threshold")).trim() === ""
                ? null
                : money(f.get("threshold"), "Franco"),
          });
          setError("");
        } catch (err) {
          setError(err.message);
        }
      }}
    >
      <strong>Livraison {supplier.id}</strong>
      <label>
        Port HT (€)
        <input
          name="port"
          inputMode="decimal"
          defaultValue={(supplier.freight / 100).toFixed(2)}
        />
      </label>
      <label>
        Franco dès (€ HT)
        <input
          name="threshold"
          inputMode="decimal"
          placeholder="Aucun seuil"
          defaultValue={
            supplier.freeFrom === null
              ? ""
              : (supplier.freeFrom / 100).toFixed(2)
          }
        />
      </label>
      <button>Enregistrer les frais</button>
      <small>
        Seuil appliqué au total des articles, une fois par panier. Aucun calcul
        de transport entre agences.
      </small>
      <ErrorMessage>{error}</ErrorMessage>
    </form>
  );
}

export default function App() {
  useDocumentTitle("AFEO · Achats courants des agences");
  const history = useHistory(initial, {
    key: "afeo:v1",
    validate: normalizeProject,
  });
  const p = history.value;
  const [agency, setAgency] = useState(initial.agencies[0]),
    [item, setItem] = useState(initial.items[0].id),
    [supplier, setSupplier] = useState(initial.suppliers[0].id),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(null),
    [epoch, setEpoch] = useState(0),
    [draft, setDraft] = useState(false);
  const activeSupplier = p.suppliers.some((s) => s.id === supplier)
      ? supplier
      : p.suppliers[0].id,
    activeAgency = p.agencies.includes(agency) ? agency : p.agencies[0],
    activeItem = p.items.some((i) => i.id === item) ? item : p.items[0].id;
  const baskets = compare(p),
    basket = baskets.find((s) => s.id === activeSupplier),
    allocation = allocations(p, activeSupplier);
  const refresh = () => {
    setEpoch((e) => e + 1);
    setPending(null);
    setError("");
    setDraft(false);
  };
  const change = (next, message = "Dossier mis à jour.") => {
    history.set(next);
    refresh();
    setNotice(message);
  };
  const run = (fn) => {
    try {
      fn();
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  const load = async (file, kind) => {
    const text = await readLocalFile(file);
    const next =
      kind === "json"
        ? normalizeProject(JSON.parse(text))
        : parseImport(text, kind, p);
    setPending({ next, name: file.name, kind });
    setError("");
  };
  const csv = () => {
    downloadCsv(
      "afeo-comparatif.csv",
      [
        "fournisseur",
        "article",
        "demande",
        "stock_libre",
        "besoin_achat",
        "reference",
        "boites",
        "unites_boite",
        "quantite_achetee",
        "surplus",
        "articles_ht",
        "anomalie",
        "tarif_du",
        "valable_jusquau",
      ],
      baskets.flatMap((b) =>
        b.lines.map((l) => ({
          fournisseur: b.id,
          article: l.id,
          demande: l.demand,
          stock_libre: l.free,
          besoin_achat: l.buy,
          reference: l.offer?.reference ?? "",
          boites: l.boxes ?? "",
          unites_boite: l.offer?.unites_par_boite ?? "",
          quantite_achetee: l.ordered ?? "",
          surplus: l.surplus ?? "",
          articles_ht: l.cost === null ? "" : (l.cost / 100).toFixed(2),
          anomalie: l.issue,
          tarif_du: l.offer?.tarif_du ?? "",
          valable_jusquau: l.offer?.valable_jusquau ?? "",
        })),
      ),
    );
    setNotice(
      "Comparatif CSV téléchargé. Les montants n’incluent pas le port ; voir le fichier paniers.",
    );
  };
  const report = () => {
    if (!basket.complete)
      throw Error(
        "Le panier doit couvrir tous les besoins avant de préparer un brouillon.",
      );
    downloadReport("afeo-brouillon-achats.html", {
      title: `Brouillon d’achat · ${basket.id}`,
      subtitle: `Exemple fictif AFEO · ${p.date} · aucune commande transmise.`,
      sections: [
        {
          title: "Articles à acheter",
          headers: [
            "Article",
            "Référence",
            "Boîtes",
            "Unités par boîte",
            "Acheté",
            "Surplus dépôt",
            "HT",
          ],
          rows: basket.lines
            .filter((l) => l.buy > 0)
            .map((l) => [
              l.name,
              l.offer.reference,
              l.boxes,
              l.offer.unites_par_boite,
              l.ordered,
              l.surplus,
              euro(l.cost),
            ]),
        },
        {
          title: "Coût du panier",
          paragraphs: [
            `Articles ${euro(basket.partial)} ; port ${euro(basket.freight)} ; total HT ${euro(basket.total)}. Tarifs fictifs, date de préparation ${p.date}.`,
          ],
        },
        {
          title: "Allocation des quantités demandées",
          paragraphs: [
            "Le stock libre est alloué dans l’ordre affiché des agences. Le surplus reste au dépôt, sans promesse de livraison entre agences.",
          ],
          headers: [
            "Agence",
            "Article",
            "Demandé",
            "Stock alloué",
            "Achat alloué",
          ],
          rows: allocation.map((r) => [
            r.agence,
            r.article,
            r.demande,
            r.stock_alloue,
            r.achat_alloue,
          ]),
        },
        {
          title: "Provenance du tarif",
          headers: ["Référence", "Tarif du", "Valable jusqu’au"],
          rows: basket.lines
            .filter((l) => l.buy > 0)
            .map((l) => [
              l.offer.reference,
              l.offer.tarif_du,
              l.offer.valable_jusquau,
            ]),
        },
      ],
    });
    setNotice("Brouillon HTML téléchargé. Aucun achat transmis.");
  };
  return (
    <div className="afeo-app">
      <header className="afeo-header">
        <span className="afeo-brand">AFEO</span>
        <h1>Préparer les achats des agences</h1>
        <div className="afeo-history">
          <button
            disabled={!history.canUndo}
            onClick={() => {
              history.undo();
              refresh();
              setNotice("Dernière modification annulée.");
            }}
          >
            Annuler
          </button>
          <button
            disabled={!history.canRedo}
            onClick={() => {
              history.redo();
              refresh();
              setNotice("Modification rétablie.");
            }}
          >
            Rétablir
          </button>
        </div>
        <a className="afeo-button" href="#afeo-import">
          Importer
        </a>
        <button
          className="afeo-primary"
          onClick={() => {
            downloadJson("afeo-dossier.json", p);
            setNotice("Dossier JSON téléchargé.");
          }}
        >
          Exporter le dossier
        </button>
      </header>
      <div className="afeo-context">
        Exemple fictif · Modifiez un conditionnement pour recalculer le panier.
        Aucune commande transmise.
      </div>
      <div className="afeo-layout">
        <aside className="afeo-sidebar">
          <h2>Besoins des agences</h2>
          <nav aria-label="Agence à modifier">
            {p.agencies.map((a) => (
              <button
                key={a}
                aria-pressed={a === activeAgency}
                onClick={() => {
                  setAgency(a);
                  setEpoch((e) => e + 1);
                }}
              >
                {a}
              </button>
            ))}
          </nav>
          <form
            key={`request-${epoch}-${activeAgency}`}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() =>
                change(
                  setRequest(p, activeAgency, activeItem, f.get("request")),
                  `Besoin de ${activeAgency} enregistré.`,
                ),
              );
            }}
          >
            <h3>Modifier un besoin</h3>
            <label>
              Article
              <select
                value={activeItem}
                onChange={(e) => {
                  setItem(e.target.value);
                  setEpoch((v) => v + 1);
                }}
              >
                {p.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantité demandée
              <input
                name="request"
                inputMode="numeric"
                defaultValue={
                  p.requests.find(
                    (r) =>
                      r.agence === activeAgency && r.article === activeItem,
                  )?.quantite ?? 0
                }
              />
            </label>
            <small>
              Unités pour {activeAgency}. La saisie remplace son besoin pour cet
              article.
            </small>
            <button className="afeo-primary">Enregistrer le besoin</button>
          </form>
          <form
            key={`date-${epoch}`}
            onSubmit={(e) => {
              e.preventDefault();
              run(() =>
                change(
                  updateProject(
                    p,
                    { date: new FormData(e.currentTarget).get("date") },
                    "Date de préparation modifiée",
                  ),
                ),
              );
            }}
          >
            <label>
              Date de préparation
              <input name="date" type="date" defaultValue={p.date} />
            </label>
            <button>Vérifier les tarifs</button>
          </form>
          <p className="afeo-note">
            Stock partagé, alloué dans l’ordre des agences ci-dessus. Le surplus
            reste au dépôt.
          </p>
        </aside>
        <main className="afeo-main">
          <div role="status" className="afeo-status">
            {notice}
          </div>
          <ErrorMessage>{error}</ErrorMessage>
          <section aria-labelledby="afeo-needs">
            <div className="afeo-section-heading">
              <div>
                <h2 id="afeo-needs">Du besoin au conditionnement</h2>
                <p>Toutes les agences réunies · catalogue {activeSupplier}</p>
              </div>
              <label>
                Fournisseur étudié
                <select
                  value={activeSupplier}
                  onChange={(e) => {
                    setSupplier(e.target.value);
                    setEpoch((v) => v + 1);
                    setDraft(false);
                  }}
                >
                  {p.suppliers.map((s) => (
                    <option key={s.id}>{s.id}</option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="afeo-table-scroll"
              role="region"
              aria-label="Besoins et conditionnements, tableau défilant"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Article</th>
                    <th>Demandé</th>
                    <th>Stock libre</th>
                    <th>À acheter</th>
                    <th>Conditionnement</th>
                    <th>Surplus</th>
                  </tr>
                </thead>
                <tbody>
                  {basket.lines.map((l) => (
                    <Fragment key={l.id}>
                      <tr
                        className={activeItem === l.id ? "afeo-selected" : ""}
                      >
                        <th>
                          <button
                            aria-expanded={activeItem === l.id}
                            onClick={() => {
                              setItem(l.id);
                              setEpoch((v) => v + 1);
                            }}
                          >
                            {l.name}
                          </button>
                          <small>{l.id}</small>
                        </th>
                        <td>{l.demand} u</td>
                        <td>{l.free} u</td>
                        <td>{l.buy} u</td>
                        <td>
                          {l.issue ? (
                            <span className="afeo-warning-text">{l.issue}</span>
                          ) : l.boxes ? (
                            `${l.boxes} boîte${l.boxes > 1 ? "s" : ""} (${l.offer.unites_par_boite} u)`
                          ) : (
                            "Aucun achat"
                          )}
                        </td>
                        <td>
                          {l.surplus === null
                            ? "Non calculé"
                            : `${l.surplus} u`}
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <OfferEditor
              key={`offer-${epoch}-${activeSupplier}-${activeItem}`}
              project={p}
              line={basket.lines.find((l) => l.id === activeItem)}
              supplier={activeSupplier}
              onChange={change}
            />
          </section>
          <section className="afeo-compare" aria-labelledby="afeo-compare">
            <h2 id="afeo-compare">Comparer les paniers</h2>
            <div
              className="afeo-table-scroll"
              role="region"
              aria-label="Comparatif fournisseurs, tableau défilant"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Fournisseur</th>
                    <th>Articles servis</th>
                    <th>Articles HT</th>
                    <th>Port HT</th>
                    <th>Total HT</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {baskets.map((b) => (
                    <tr
                      key={b.id}
                      className={activeSupplier === b.id ? "afeo-selected" : ""}
                    >
                      <th>{b.id}</th>
                      <td>
                        {b.covered} sur {b.required}
                      </td>
                      <td>
                        {euro(b.partial)}
                        {!b.complete && (
                          <small>Postes chiffrés seulement</small>
                        )}
                      </td>
                      <td>
                        {euro(b.freight)}
                        {!b.complete && <small>Provisoire</small>}
                      </td>
                      <td>
                        <strong>
                          {b.complete ? euro(b.total) : "Incomplet"}
                        </strong>
                      </td>
                      <td>
                        <button
                          aria-pressed={activeSupplier === b.id}
                          onClick={() => {
                            setSupplier(b.id);
                            setEpoch((v) => v + 1);
                            setDraft(false);
                          }}
                        >
                          Voir {b.id}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="afeo-compare-help">
              Les paniers portent sur le même besoin global. Un total n’est
              comparable que lorsque chaque article demandé est servi et chaque
              tarif valable.
            </p>
            {p.offers
              .filter((o) => !o.article)
              .map((o) => (
                <form
                  className="afeo-mapping"
                  key={`map-${o.fournisseur}-${o.reference}-${epoch}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const article = new FormData(e.currentTarget).get(
                      "article",
                    );
                    run(() => {
                      if (!article)
                        throw Error("Choisissez un article à associer.");
                      change(
                        editOffer(p, o.fournisseur, o.reference, { article }),
                        "Correspondance enregistrée sur votre choix explicite.",
                      );
                    });
                  }}
                >
                  <p>
                    <strong>
                      {o.fournisseur} · {o.reference}
                    </strong>{" "}
                    n’a pas de correspondance. {o.unites_par_boite} unités par
                    boîte, {o.prix === null ? "prix inconnu" : euro(o.prix)} HT.
                  </p>
                  <label>
                    Associer cette référence
                    <select name="article" defaultValue="">
                      <option value="">Choisir un article</option>
                      {p.items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button>Valider la correspondance</button>
                  <small>
                    Validez seulement une référence dont la correspondance est
                    connue. Aucun rapprochement technique automatique.
                  </small>
                </form>
              ))}
            <details>
              <summary>
                Régler les frais de livraison de {activeSupplier}
              </summary>
              <SupplierEditor
                key={`supplier-${activeSupplier}-${epoch}`}
                supplier={p.suppliers.find((s) => s.id === activeSupplier)}
                onSave={(next) =>
                  change(
                    updateProject(
                      p,
                      {
                        suppliers: p.suppliers.map((s) =>
                          s.id === next.id ? next : s,
                        ),
                      },
                      `Livraison ${next.id} modifiée`,
                    ),
                  )
                }
              />
            </details>
          </section>
          <section className="afeo-draft">
            <div className="afeo-draft-heading">
              <button
                className="afeo-primary"
                disabled={!basket.complete}
                onClick={() => {
                  setDraft(true);
                  setNotice(
                    `Brouillon ${activeSupplier} affiché. Aucune commande transmise.`,
                  );
                }}
              >
                Préparer le brouillon {activeSupplier}
              </button>
              <span>
                {basket.complete
                  ? `Total HT ${euro(basket.total)}, allocations détaillées ci-dessous après ouverture.`
                  : "Complétez les correspondances, prix ou dates pour préparer le brouillon."}
              </span>
            </div>
            {draft && basket.complete && (
              <div className="afeo-draft-body">
                <h2>Brouillon {activeSupplier}</h2>
                <p>
                  Allocation dans l’ordre {p.agencies.join(", ")}. Les{" "}
                  {basket.lines.reduce((s, l) => s + l.surplus, 0)} unités de
                  surplus restent au dépôt.
                </p>
                <div
                  className="afeo-table-scroll"
                  role="region"
                  aria-label="Allocation aux agences, tableau défilant"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Agence</th>
                        <th>Article</th>
                        <th>Demandé</th>
                        <th>Stock alloué</th>
                        <th>Achat alloué</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocation.map((r) => (
                        <tr key={`${r.agence}-${r.article}`}>
                          <td>{r.agence}</td>
                          <td>{r.article}</td>
                          <td>{r.demande}</td>
                          <td>{r.stock_alloue}</td>
                          <td>{r.achat_alloue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="afeo-actions">
                  <button onClick={() => run(report)}>
                    Télécharger le brouillon HTML
                  </button>
                  <button
                    onClick={() => {
                      downloadCsv(
                        "afeo-allocations.csv",
                        [
                          "agence",
                          "article",
                          "demande",
                          "stock_alloue",
                          "achat_alloue",
                          "non_servi",
                        ],
                        allocation,
                      );
                      setNotice("Allocations CSV téléchargées.");
                    }}
                  >
                    Télécharger les allocations CSV
                  </button>
                </div>
              </div>
            )}
          </section>
          <div className="afeo-bottom">
            <section>
              <h2>Journal d’activité</h2>
              {p.journal.length ? (
                <ol>
                  {[...p.journal].reverse().map((s, i) => (
                    <li key={`${i}-${s}`}>{s}</li>
                  ))}
                </ol>
              ) : (
                <p>Aucune modification.</p>
              )}
            </section>
            <section>
              <h2>Exporter les données</h2>
              <p>Fichiers construits à partir du dossier courant.</p>
              <div className="afeo-actions">
                <button onClick={csv}>Comparatif CSV</button>
                <button
                  onClick={() => {
                    downloadCsv(
                      "afeo-paniers.csv",
                      [
                        "fournisseur",
                        "articles_ht",
                        "port_ht",
                        "total_ht",
                        "statut",
                        "date_preparation",
                      ],
                      baskets.map((b) => ({
                        fournisseur: b.id,
                        articles_ht: (b.partial / 100).toFixed(2),
                        port_ht: (b.freight / 100).toFixed(2),
                        total_ht:
                          b.total === null ? "" : (b.total / 100).toFixed(2),
                        statut: b.complete
                          ? "Complet"
                          : "Incomplet, montants partiels",
                        date_preparation: p.date,
                      })),
                    );
                    setNotice("Récapitulatif des paniers CSV téléchargé.");
                  }}
                >
                  Paniers CSV
                </button>
                <button
                  onClick={() => {
                    downloadJson("afeo-dossier.json", p);
                    setNotice("Dossier JSON téléchargé.");
                  }}
                >
                  Dossier JSON
                </button>
              </div>
            </section>
          </div>
          <section className="afeo-import" id="afeo-import">
            <h2>Importer un dossier</h2>
            <p>
              CSV à séparateur point-virgule, références du dossier ci-dessus.
              Importer remplace la table choisie après aperçu. Tous les fichiers
              restent dans ce navigateur.
            </p>
            <div className="afeo-actions" key={`files-${epoch}`}>
              <FileImport
                label="Besoins CSV"
                accept=".csv"
                onFile={(file) => load(file, "requests")}
              />
              <FileImport
                label="Stock CSV"
                accept=".csv"
                onFile={(file) => load(file, "stocks")}
              />
              <FileImport
                label="Catalogue CSV"
                accept=".csv"
                onFile={(file) => load(file, "offers")}
              />
              <FileImport
                label="Restaurer un JSON"
                accept=".json"
                onFile={(file) => load(file, "json")}
              />
            </div>
            {pending && (
              <div className="afeo-import-preview">
                <h3>Aperçu de {pending.name}</h3>
                <p>
                  {pending.next.requests.length} besoins ·{" "}
                  {pending.next.stocks.length} articles en stock ·{" "}
                  {pending.next.offers.length} références fournisseurs.
                </p>
                <div
                  className="afeo-table-scroll"
                  role="region"
                  aria-label="Aperçu avant import"
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Fournisseur</th>
                        <th>Couverture</th>
                        <th>Total HT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compare(pending.next).map((b) => (
                        <tr key={b.id}>
                          <td>{b.id}</td>
                          <td>
                            {b.covered} sur {b.required}
                          </td>
                          <td>{b.complete ? euro(b.total) : "Incomplet"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  className="afeo-primary"
                  onClick={() =>
                    change(
                      pending.next,
                      "Import validé. Vous pouvez l’annuler.",
                    )
                  }
                >
                  Confirmer le remplacement
                </button>
                <button onClick={() => setPending(null)}>
                  Abandonner l’import
                </button>
              </div>
            )}
            <details>
              <summary>Télécharger les modèles et revoir l’exemple</summary>
              <div className="afeo-actions">
                <button
                  onClick={() =>
                    downloadCsv(
                      "afeo-besoins-exemple.csv",
                      requestHeaders,
                      initial.requests,
                    )
                  }
                >
                  Exemple besoins
                </button>
                <button
                  onClick={() =>
                    downloadCsv(
                      "afeo-stock-exemple.csv",
                      stockHeaders,
                      initial.stocks,
                    )
                  }
                >
                  Exemple stock
                </button>
                <button
                  onClick={() =>
                    downloadCsv(
                      "afeo-catalogue-exemple.csv",
                      offerHeaders,
                      offerRows(initial),
                    )
                  }
                >
                  Exemple catalogue
                </button>
                <button
                  onClick={() => {
                    history.reset();
                    refresh();
                    setNotice("Exemple fictif restauré.");
                  }}
                >
                  Revenir à l’exemple
                </button>
              </div>
              <p>
                Le JSON contient aussi les articles, agences et paramètres des
                fournisseurs. Un prix vide reste inconnu. Dates et références
                sont contrôlées avant import.
              </p>
            </details>
          </section>
          <p className="afeo-local">
            {history.storageAvailable
              ? "Dossier conservé localement dans ce navigateur."
              : "Sauvegarde locale indisponible. Téléchargez le JSON pour conserver votre travail."}
          </p>
        </main>
      </div>
      <DemoFooter />
    </div>
  );
}

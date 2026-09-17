import { useEffect, useState } from "react";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto-condensed/latin-600.css";
import { useHistory } from "../../shared/state.js";
import { FileImport, DemoFooter, useDocumentTitle } from "../../shared/ui.jsx";
import {
  downloadCsv,
  downloadJson,
  downloadReport,
  readLocalFile,
} from "../../shared/files.js";
import {
  seed,
  occurrences,
  literalMatches,
  suggestion,
  confirm,
  reopen,
  decision,
  changeTerm,
  confirmedRows,
  reviewRows,
  importSegments,
  importTerms,
  restore,
  TERM_HEADERS,
  SEGMENT_HEADERS,
  termRows,
  segmentRows,
} from "./model.js";
import "./styles.css";
function Highlight({ text, terms }) {
  const matches = terms
    .flatMap((t) => literalMatches(text, t))
    .sort((a, b) => a.index - b.index || b.length - a.length);
  let position = 0;
  const parts = [];
  for (const m of matches) {
    if (m.index < position) continue;
    parts.push(text.slice(position, m.index));
    parts.push(
      <mark key={`${m.index}-${m.length}`}>
        {text.slice(m.index, m.index + m.length)}
      </mark>,
    );
    position = m.index + m.length;
  }
  parts.push(text.slice(position));
  return <>{parts}</>;
}
function Preference({ term, onSave }) {
  const [next, setNext] = useState(term.next),
    [aliases, setAliases] = useState(term.targetAliases.join(" | "));
  useEffect(() => {
    setNext(term.next);
    setAliases(term.targetAliases.join(" | "));
  }, [term]);
  return (
    <form
      className="atenao-preference"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          next,
          targetAliases: aliases
            .split("|")
            .map((v) => v.trim())
            .filter(Boolean),
        });
      }}
    >
      <div>
        <span>Ancienne cible livrée</span>
        <strong>{term.old}</strong>
        <small>FR vers EN · {term.source}</small>
      </div>
      <label>
        Préférence client à retenir
        <input
          value={next}
          maxLength={150}
          required
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      <button
        type="submit"
        disabled={
          next === term.next && aliases === term.targetAliases.join(" | ")
        }
      >
        Enregistrer la préférence
      </button>
      <details>
        <summary>Variantes et règle de recherche</summary>
        <p>
          La recherche repère les mots entiers, sans tenir compte des
          majuscules. Les accents restent distincts. Les variantes sont
          déclarées, aucune flexion n’est devinée.
        </p>
        <p>
          Variantes françaises : {term.sourceAliases.join(" ; ") || "aucune"}.
        </p>
        <label>
          Autres formes anglaises à repérer
          <input
            value={aliases}
            maxLength={1000}
            onChange={(e) => setAliases(e.target.value)}
          />
          <small>
            Séparez les variantes par |. Elles seront signalées pour relecture.
          </small>
        </label>
        <p>
          Seule l’ancienne cible principale peut être remplacée par la
          proposition. Enregistrez ces variantes avec la préférence.
        </p>
      </details>
    </form>
  );
}
function SegmentEditor({ state, term, segment, onConfirm, onReopen }) {
  const saved = decision(state, term, segment),
    proposed = suggestion(term, segment);
  const [draft, setDraft] = useState(segment.target),
    [exception, setException] = useState(saved?.kind === "exception"),
    [reason, setReason] = useState(saved?.reason || "");
  useEffect(() => {
    setDraft(segment.target);
    setException(saved?.kind === "exception");
    setReason(saved?.reason || "");
  }, [segment, term, saved]);
  return (
    <div className="atenao-editor">
      <div className="atenao-editor-head">
        <strong>Revue du segment {segment.id}</strong>
        <span>
          {saved
            ? saved.kind === "exception"
              ? "Exception motivée"
              : "Version confirmée"
            : "Décision attendue"}
        </span>
      </div>
      <div className="atenao-original">
        <span>Cible d’origine</span>
        <p>{segment.original}</p>
      </div>
      <div className="atenao-suggestion">
        <span>Proposition littérale</span>
        <p>
          {proposed.count ? (
            <Highlight text={proposed.text} terms={[term.next]} />
          ) : (
            <>
              Aucune occurrence exacte de « {term.old} » à remplacer. Les
              variantes se révisent à la main.
            </>
          )}
        </p>
        <button
          type="button"
          disabled={!proposed.count}
          onClick={() => {
            setDraft(proposed.text);
            setException(false);
          }}
        >
          Utiliser la proposition
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(draft, exception, reason);
        }}
      >
        <label>
          Version à confirmer
          <textarea
            value={draft}
            maxLength={4000}
            rows="3"
            onChange={(e) => setDraft(e.target.value)}
            required
          />
        </label>
        <label className="atenao-exception-check">
          <input
            type="checkbox"
            checked={exception}
            onChange={(e) => setException(e.target.checked)}
          />
          Conserver une exception à la préférence
        </label>
        {exception && (
          <label>
            Motif de l’exception
            <textarea
              value={reason}
              minLength={8}
              maxLength={1000}
              rows="2"
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </label>
        )}
        <div className="atenao-editor-actions">
          <button type="submit" className="atenao-primary">
            {exception ? "Confirmer l’exception" : "Confirmer la version"}
          </button>
          <button type="button" onClick={() => setDraft(segment.target)}>
            Reprendre la version courante
          </button>
          {saved && (
            <button type="button" onClick={onReopen}>
              Remettre à relire
            </button>
          )}
        </div>
        <p>
          La proposition reste un brouillon jusqu’à votre confirmation. Changer
          la traduction remet à relire les autres termes déjà validés sur ce
          segment.
        </p>
      </form>
    </div>
  );
}
export default function App() {
  useDocumentTitle("Atenao · Revue terminologique");
  const history = useHistory(seed, { max: 50 }),
    s = history.value;
  const [termId, setTermId] = useState("retrait"),
    [segmentId, setSegmentId] = useState("s12"),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const term = s.terms.find((t) => t.id === termId) || s.terms[0],
    matches = occurrences(s, term),
    confirmed = matches.filter((v) => decision(s, term, v.segment)),
    shown = matches.filter(
      (v) =>
        filter === "all" ||
        (filter === "pending"
          ? !decision(s, term, v.segment)
          : decision(s, term, v.segment)?.kind === "exception"),
    );
  const terms = s.terms.filter((t) =>
      `${t.source} ${t.old} ${t.next}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
    chosen =
      shown.find((v) => v.segment.id === segmentId)?.segment ||
      shown[0]?.segment,
    decisions = confirmedRows(s),
    allReviews = reviewRows(s);
  function act(fn, text) {
    try {
      history.set(fn(s));
      setMessage(text || "Dossier mis à jour.");
      setError("");
      return true;
    } catch (e) {
      setError(e.message);
      setMessage("");
      return false;
    }
  }
  async function ingest(file, kind) {
    try {
      const raw = await readLocalFile(file, { maxBytes: 3 * 1024 * 1024 });
      act(
        (st) =>
          kind === "segments"
            ? importSegments(st, raw)
            : kind === "terms"
              ? importTerms(st, raw)
              : restore(raw),
        kind === "json"
          ? "Dossier restauré, décisions vérifiées."
          : "Import terminé. Les décisions précédentes sont retirées.",
      );
      setFilter("all");
    } catch (e) {
      setError(e.message);
      setMessage("");
    }
  }
  function output(fn) {
    try {
      fn();
      setError("");
      setMessage("Fichier téléchargé depuis le dossier courant.");
    } catch (e) {
      setError(e.message);
    }
  }
  function exportDecisions() {
    const headers = [
      "terme_fr",
      "segment",
      "document",
      "source_fr",
      "cible_origine",
      "cible_confirmee",
      "preference_client",
      "decision",
      "motif",
    ];
    downloadCsv(
      "atenao-decisions.csv",
      headers,
      decisions.map((r) => [
        r.term,
        r.segment,
        r.file,
        r.source,
        r.original,
        r.current,
        r.preference,
        r.status,
        r.reason,
      ]),
    );
  }
  function report() {
    downloadReport("atenao-revue.html", {
      title: "Revue de préférence terminologique",
      subtitle:
        "Prototype indépendant pour Atenao · Corpus fictif FR vers EN · Recherche littérale, décisions humaines",
      sections: [
        {
          title: "Avancement",
          paragraphs: [
            `${s.segments.length} segments, ${s.terms.length} termes, ${allReviews.length} associations à examiner. ${decisions.length} décision(s) confirmée(s), ${allReviews.length - decisions.length} à relire.`,
            "La cible affichée dans une ligne À relire ne constitue pas une version approuvée. Aucune traduction ni propagation automatique.",
          ],
        },
        {
          title: "Préférences de travail",
          headers: [
            "Source FR",
            "Ancienne cible EN",
            "Préférence EN",
            "Variantes françaises",
            "Variantes anglaises",
          ],
          rows: s.terms.map((t) => [
            t.source,
            t.old,
            t.next,
            t.sourceAliases.join(" ; "),
            t.targetAliases.join(" ; "),
          ]),
        },
        {
          title: "Revue des associations",
          headers: [
            "Terme",
            "Segment / document",
            "Source",
            "Cible d’origine",
            "Cible courante",
            "Décision",
            "Motif",
          ],
          rows: allReviews.map((r) => [
            r.term,
            `${r.segment} / ${r.file}`,
            r.source,
            r.original,
            r.current,
            r.status,
            r.reason,
          ]),
        },
        { title: "Journal", paragraphs: s.log },
        {
          title: "Règle de recherche",
          paragraphs: [
            "Mots entiers au sens des lettres, chiffres et caractère souligné Unicode. Casse ignorée, accents conservés. Variantes explicitement déclarées. La détection signale un contexte à examiner ; elle ne mesure pas la qualité de la traduction.",
            "Le nom du document est une étiquette du CSV, pas un fichier Word analysé.",
          ],
        },
      ],
    });
  }
  return (
    <div className="atenao-app">
      <header className="atenao-header">
        <div>
          <strong>ATENAO</strong>
          <span>Revue terminologique</span>
        </div>
        <p>Prototype indépendant · Textes fictifs</p>
      </header>
      <div className="atenao-layout">
        <aside className="atenao-glossary" aria-label="Glossaire client">
          <h2>Glossaire client</h2>
          <p>{s.terms.length} termes · FR vers EN</p>
          <label>
            Rechercher un terme
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Terme source ou cible"
            />
          </label>
          <nav aria-label="Choisir un terme">
            {terms.map((t) => {
              const count = occurrences(s, t).length;
              return (
                <button
                  key={t.id}
                  className={term.id === t.id ? "atenao-term-selected" : ""}
                  aria-pressed={term.id === t.id}
                  onClick={() => {
                    setTermId(t.id);
                    setFilter("all");
                  }}
                >
                  <strong>{t.source}</strong>
                  <span>
                    {t.old}
                    {t.old !== t.next && (
                      <>
                        {" "}
                        → <b>{t.next}</b>
                      </>
                    )}
                  </span>
                  <small>{count} segment(s) à examiner</small>
                </button>
              );
            })}
            {!terms.length && (
              <p className="atenao-no-term">Aucun terme ne correspond.</p>
            )}
          </nav>
          <div className="atenao-method">
            <strong>À examiner en contexte</strong>
            <p>
              La concordance repère du texte. Le choix linguistique appartient
              au traducteur.
            </p>
          </div>
        </aside>
        <main>
          <div className="atenao-heading">
            <h1>Réviser une préférence terminologique</h1>
            <p>
              Utilisez la proposition sur le premier segment, puis confirmez
              votre version. Le pluriel du deuxième reste à traiter à la main.
            </p>
          </div>
          <Preference
            term={term}
            onSave={(changes) =>
              act(
                (st) => changeTerm(st, term.id, changes),
                "Préférence enregistrée. Les décisions de ce terme sont à reprendre.",
              )
            }
          />
          <div className="atenao-toolbar">
            <label>
              Afficher
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Toutes les occurrences</option>
                <option value="pending">À relire</option>
                <option value="exception">Exceptions motivées</option>
              </select>
            </label>
            <p>
              <strong>
                {confirmed.length} / {matches.length}
              </strong>{" "}
              décisions · {s.segments.length} segments dans le corpus
            </p>
            <div>
              <button
                onClick={() => {
                  history.undo();
                  setMessage("Dernière action annulée.");
                  setError("");
                }}
                disabled={!history.canUndo}
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  history.redo();
                  setMessage("Action rétablie.");
                  setError("");
                }}
                disabled={!history.canRedo}
              >
                Rétablir
              </button>
              <FileImport
                label="Importer des segments"
                accept=".csv,text/csv"
                onFile={(file) => ingest(file, "segments")}
              />
            </div>
          </div>
          {error && (
            <p className="atenao-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="atenao-message" role="status">
              {message}
            </p>
          )}
          <section
            className="atenao-concordance"
            aria-label="Concordances bilingues"
          >
            <div className="atenao-column-titles">
              <span>Document / segment</span>
              <span>Source française</span>
              <span>Cible anglaise courante</span>
              <span>Revue</span>
            </div>
            {shown.map(({ segment: r, sourceFound, targetFound }) => {
              const d = decision(s, term, r),
                open = chosen?.id === r.id;
              return (
                <article
                  key={r.id}
                  className={
                    open ? "atenao-segment atenao-open" : "atenao-segment"
                  }
                >
                  <button
                    className="atenao-segment-button"
                    aria-expanded={open}
                    aria-label={`Ouvrir le segment ${r.id}`}
                    onClick={() => setSegmentId(r.id)}
                  >
                    <span className="atenao-document">
                      <strong>{r.file}</strong>
                      <code>{r.id}</code>
                    </span>
                    <span className="atenao-source">
                      <span className="atenao-mobile-label">
                        Source française
                      </span>
                      <Highlight
                        text={r.source}
                        terms={[term.source, ...term.sourceAliases]}
                      />
                    </span>
                    <span className="atenao-target">
                      <span className="atenao-mobile-label">
                        Cible anglaise
                      </span>
                      <Highlight
                        text={r.target}
                        terms={[term.old, ...term.targetAliases, term.next]}
                      />
                    </span>
                    <span className={`atenao-status ${d?.kind || ""}`}>
                      {d
                        ? d.kind === "exception"
                          ? "Exception motivée"
                          : "Confirmé"
                        : "À relire"}
                    </span>
                  </button>
                  {open && (
                    <>
                      <p className="atenao-found">
                        Repéré dans la source :{" "}
                        {sourceFound.join(" ; ") || "aucune forme exacte"} ·
                        dans la cible d’origine ou courante :{" "}
                        {targetFound.join(" ; ") || "aucune forme exacte"}.
                      </p>
                      <SegmentEditor
                        state={s}
                        term={term}
                        segment={r}
                        onConfirm={(target, exception, reason) =>
                          act(
                            (st) =>
                              confirm(
                                st,
                                term.id,
                                r.id,
                                target,
                                exception,
                                reason,
                              ),
                            exception
                              ? "Exception enregistrée avec son motif."
                              : "Version confirmée. Les autres termes du segment sont à relire si le texte a changé.",
                          )
                        }
                        onReopen={() =>
                          act(
                            (st) => reopen(st, term.id, r.id),
                            "Segment remis à relire pour ce terme.",
                          )
                        }
                      />
                    </>
                  )}
                </article>
              );
            })}
            {!shown.length && (
              <div className="atenao-empty">
                <h2>
                  {matches.length
                    ? "Aucun segment dans ce filtre"
                    : "Aucune concordance dans ce corpus"}
                </h2>
                <p>
                  {matches.length
                    ? "Changez le filtre pour voir les autres décisions."
                    : "Vérifiez les termes et les variantes déclarées. Une absence d’occurrence ne prouve pas que la préférence a été appliquée partout."}
                </p>
              </div>
            )}
          </section>
          <section className="atenao-outputs">
            <div>
              <h2>Conserver la revue</h2>
              <p>
                {decisions.length} choix confirmé(s) exportable(s). Le compte
                rendu conserve aussi les {allReviews.length - decisions.length}{" "}
                associations encore à relire.
              </p>
            </div>
            <div>
              <button
                onClick={() =>
                  output(() =>
                    downloadCsv(
                      "atenao-glossaire.csv",
                      TERM_HEADERS,
                      termRows(s),
                    ),
                  )
                }
              >
                Glossaire révisé CSV
              </button>
              <button
                className="atenao-primary"
                disabled={!decisions.length}
                onClick={() => output(exportDecisions)}
              >
                Décisions confirmées CSV
              </button>
              <button onClick={() => output(report)}>Compte rendu HTML</button>
            </div>
          </section>
          <details className="atenao-files">
            <summary>
              Importer un glossaire, sauvegarder ou reprendre un dossier
            </summary>
            <p>
              CSV de segments : identifiant, document, source française, cible
              anglaise. CSV de glossaire : termes et variantes séparées par |.
              Un import remplace le corpus ou le glossaire et retire ses
              décisions ; vous pouvez annuler.
            </p>
            <div>
              <button
                onClick={() =>
                  output(() =>
                    downloadCsv(
                      "atenao-segments-exemple.csv",
                      SEGMENT_HEADERS,
                      segmentRows(seed()),
                    ),
                  )
                }
              >
                Exemple de segments CSV
              </button>
              <button
                onClick={() =>
                  output(() =>
                    downloadCsv(
                      "atenao-glossaire-exemple.csv",
                      TERM_HEADERS,
                      termRows(seed()),
                    ),
                  )
                }
              >
                Exemple de glossaire CSV
              </button>
              <FileImport
                label="Importer un glossaire"
                accept=".csv,text/csv"
                onFile={(file) => ingest(file, "terms")}
              />
              <button
                onClick={() =>
                  output(() => downloadJson("atenao-dossier.json", s))
                }
              >
                Sauvegarder le dossier JSON
              </button>
              <FileImport
                label="Restaurer un dossier JSON"
                accept=".json,application/json"
                onFile={(file) => ingest(file, "json")}
              />
              <button
                onClick={() => {
                  history.reset();
                  setTermId("retrait");
                  setSegmentId("s12");
                  setFilter("all");
                  setSearch("");
                  setMessage("Exemple rechargé.");
                  setError("");
                }}
              >
                Recharger l’exemple
              </button>
            </div>
          </details>
          <p className="atenao-local">
            Les textes restent dans cet onglet, sans compte ni sauvegarde
            automatique. Aucun service de traduction ou de TAO n’est connecté.
            Exportez le dossier pour conserver votre revue.
          </p>
        </main>
      </div>
      <DemoFooter />
    </div>
  );
}

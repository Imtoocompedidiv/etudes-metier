import { useState } from "react";
import { useHistory } from "../../shared/state.js";
import {
  FileImport,
  ErrorMessage,
  DemoFooter,
  useDocumentTitle,
} from "../../shared/ui.jsx";
import {
  readLocalFile,
  downloadJson,
  downloadText,
} from "../../shared/files.js";
import {
  seed,
  editions,
  parseEdition,
  validateEdition,
  moveBlock,
  emailHtml,
  plainText,
  delivery,
} from "./model.js";
import "./styles.css";

export default function App() {
  useDocumentTitle("Datagif · Composer une newsletter");
  const history = useHistory(seed, {
    key: "datagif:v1",
    validate: (value) => {
      try {
        parseEdition(JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
  });
  const value = history.value;
  const [selectedId, select] = useState("cour");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [width, setWidth] = useState("desktop");
  const [format, setFormat] = useState("html");
  const [draft, setDraft] = useState(null);
  const selected =
    value.blocks.find((block) => block.id === selectedId) || value.blocks[0];
  const edit = draft?.id === selected?.id ? draft : selected;
  const issues = validateEdition(value);
  const output = format === "html" ? emailHtml(value) : plainText(value);
  function changeSelection(id) {
    select(id);
    setDraft(null);
  }
  async function importFile(file) {
    try {
      const next = parseEdition(await readLocalFile(file));
      history.set(next);
      select(next.blocks[0].id);
      setDraft(null);
      setError("");
      setMessage(
        `${next.blocks.length} blocs importés. Le dossier précédent reste accessible avec Annuler.`,
      );
    } catch (e) {
      setError(e.message);
    }
  }
  function updateField(key, text) {
    setDraft({ ...edit, [key]: text });
  }
  function saveBlock(event) {
    event.preventDefault();
    history.set({
      ...value,
      blocks: value.blocks.map((block) =>
        block.id === edit.id ? edit : block,
      ),
    });
    setDraft(null);
    setMessage("Bloc enregistré. Les deux formats de livraison sont à jour.");
  }
  function addBlock() {
    const block = {
      id: `article-${Date.now()}`,
      type: "article",
      title: "Nouvel article",
      excerpt: "",
      url: "",
      linkLabel: "Lire l’article",
    };
    history.set({ ...value, blocks: [...value.blocks, block] });
    changeSelection(block.id);
  }
  return (
    <div className="datagif-app">
      <header className="datagif-header">
        <strong>Datagif</strong>
        <p>Composer et livrer une newsletter</p>
        <span>Prototype indépendant · Contenus fictifs</span>
      </header>
      <div className="datagif-instruction">
        Déplacez le deuxième article, complétez son lien, puis ouvrez la
        livraison.
      </div>
      <main className="datagif-layout">
        <section
          className="datagif-content"
          aria-labelledby="datagif-content-title"
        >
          <h1 id="datagif-content-title">Contenu de l’édition</h1>
          <div className="datagif-toolbar">
            <FileImport
              label="Importer JSON"
              accept=".json,application/json"
              onFile={importFile}
            />
            <button onClick={() => downloadJson("datagif-exemple.json", seed)}>
              Exemple
            </button>
            <button
              onClick={() => {
                history.undo();
                setDraft(null);
              }}
              disabled={!history.canUndo}
            >
              Annuler
            </button>
            <button
              onClick={() => {
                history.redo();
                setDraft(null);
              }}
              disabled={!history.canRedo}
            >
              Rétablir
            </button>
          </div>
          <ErrorMessage>{error}</ErrorMessage>
          <ol className="datagif-blocks">
            {value.blocks.map((block, index) => (
              <li
                key={block.id}
                className={selected?.id === block.id ? "datagif-selected" : ""}
              >
                <button
                  className="datagif-block-title"
                  onClick={() => changeSelection(block.id)}
                  aria-pressed={selected?.id === block.id}
                >
                  {block.title || "Titre à compléter"}
                  <small>
                    {block.type === "agenda" ? "Agenda" : "Article"}
                  </small>
                </button>
                <div>
                  <button
                    aria-label={`Monter ${block.title || "le bloc"}`}
                    disabled={index === 0}
                    onClick={() => {
                      history.set(moveBlock(value, block.id, -1));
                      setDraft(null);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Descendre ${block.title || "le bloc"}`}
                    disabled={index === value.blocks.length - 1}
                    onClick={() => {
                      history.set(moveBlock(value, block.id, 1));
                      setDraft(null);
                    }}
                  >
                    ↓
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            className="datagif-add"
            onClick={addBlock}
            disabled={value.blocks.length >= 40}
          >
            Ajouter un article
          </button>
          <label className="datagif-edition">
            Édition
            <select
              value={value.edition}
              onChange={(event) =>
                history.set({ ...value, edition: event.target.value })
              }
            >
              {Object.entries(editions).map(([key, theme]) => (
                <option key={key} value={key}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
          {edit && (
            <form className="datagif-editor" onSubmit={saveBlock}>
              <label>
                Type de bloc
                <select
                  value={edit.type}
                  onChange={(event) => updateField("type", event.target.value)}
                >
                  <option value="article">Article</option>
                  <option value="agenda">Agenda</option>
                </select>
              </label>
              <label>
                Titre de l’article
                <input
                  value={edit.title}
                  onChange={(event) => updateField("title", event.target.value)}
                />
              </label>
              <label>
                Extrait
                <textarea
                  value={edit.excerpt}
                  onChange={(event) =>
                    updateField("excerpt", event.target.value)
                  }
                  rows="4"
                />
              </label>
              <label>
                Lien de l’article
                <input
                  value={edit.url}
                  onChange={(event) => updateField("url", event.target.value)}
                  placeholder="https://example.com/article"
                />
              </label>
              <label>
                Texte du lien
                <input
                  value={edit.linkLabel}
                  onChange={(event) =>
                    updateField("linkLabel", event.target.value)
                  }
                />
              </label>
              <button className="datagif-primary" type="submit">
                Enregistrer le bloc
              </button>
              <button
                type="button"
                className="datagif-delete"
                disabled={value.blocks.length <= 1}
                onClick={() => {
                  history.set({
                    ...value,
                    blocks: value.blocks.filter(
                      (block) => block.id !== selected.id,
                    ),
                  });
                  setDraft(null);
                  setMessage("Bloc retiré. Annuler permet de le retrouver.");
                }}
              >
                Retirer ce bloc
              </button>
            </form>
          )}
          <details className="datagif-settings">
            <summary>Objet, introduction et abonnement</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                history.set({ ...value, ...Object.fromEntries(form) });
                setMessage("Paramètres de l’édition enregistrés.");
              }}
              key={JSON.stringify([
                value.subject,
                value.preheader,
                value.date,
                value.intro,
                value.unsubscribe,
              ])}
            >
              <label>
                Objet
                <input name="subject" defaultValue={value.subject} />
              </label>
              <label>
                Texte d’aperçu
                <input name="preheader" defaultValue={value.preheader} />
              </label>
              <label>
                Date
                <input name="date" defaultValue={value.date} />
              </label>
              <label>
                Introduction
                <textarea name="intro" defaultValue={value.intro} rows="3" />
              </label>
              <label>
                Gestion de l’abonnement
                <input name="unsubscribe" defaultValue={value.unsubscribe} />
              </label>
              <button>Enregistrer l’édition</button>
            </form>
          </details>
          <button
            className="datagif-reset"
            onClick={() => {
              history.reset();
              setDraft(null);
              select("cour");
              setMessage("Édition fictive initiale restaurée.");
            }}
          >
            Réinitialiser l’exemple
          </button>
        </section>
        <section
          className="datagif-preview-area"
          aria-label="Aperçu et livraison"
        >
          <div className="datagif-preview-title">
            <h2>Aperçu</h2>
            <div className="datagif-toggle">
              <button
                aria-pressed={width === "desktop"}
                onClick={() => setWidth("desktop")}
              >
                Ordinateur
              </button>
              <button
                aria-pressed={width === "mobile"}
                onClick={() => setWidth("mobile")}
              >
                Mobile
              </button>
            </div>
          </div>
          <div className="datagif-preview-frame">
            <iframe
              title="Aperçu isolé de la newsletter"
              sandbox=""
              srcDoc={emailHtml(value, { preview: true })}
              style={{
                maxWidth: width === "mobile" ? 360 : 640,
                height: Math.max(
                  660,
                  310 + value.blocks.length * (width === "mobile" ? 250 : 185),
                ),
              }}
            />
          </div>
          <section
            className="datagif-delivery"
            aria-labelledby="datagif-delivery-title"
          >
            <h2 id="datagif-delivery-title">Livraison</h2>
            <div className="datagif-delivery-grid">
              <div>
                <fieldset>
                  <legend>Format de sortie</legend>
                  <label>
                    <input
                      type="radio"
                      name="datagif-format"
                      checked={format === "html"}
                      onChange={() => setFormat("html")}
                    />
                    HTML email
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="datagif-format"
                      checked={format === "text"}
                      onChange={() => setFormat("text")}
                    />
                    Version texte
                  </label>
                </fieldset>
                <p>
                  Styles intégrés et tableau de présentation. La validation des
                  clients email reste à réaliser sur le service d’envoi retenu.
                </p>
              </div>
              <label className="datagif-source-label">
                Contenu généré
                <textarea
                  readOnly
                  value={output}
                  aria-label="Contenu généré"
                  rows="10"
                />
              </label>
              <div className="datagif-downloads">
                <button
                  className="datagif-primary"
                  disabled={issues.length > 0}
                  onClick={() => {
                    downloadText(
                      `datagif-edition.${format === "html" ? "html" : "txt"}`,
                      delivery(value, format),
                      format === "html"
                        ? "text/html;charset=utf-8"
                        : "text/plain;charset=utf-8",
                    );
                    setMessage(
                      `Version ${format === "html" ? "HTML" : "texte"} téléchargée.`,
                    );
                  }}
                >
                  Télécharger {format === "html" ? "le HTML" : "le texte"}
                </button>
                <button
                  onClick={() => {
                    downloadJson("datagif-edition.json", value);
                    setMessage(
                      "Dossier JSON exporté, réimportable dans cet atelier.",
                    );
                  }}
                >
                  Exporter le JSON
                </button>
                <h3>
                  {issues.length
                    ? "À compléter"
                    : "Édition prête pour la recette"}
                </h3>
                {issues.length ? (
                  <ul className="datagif-issues">
                    {issues.map((issue, i) => (
                      <li key={i}>
                        {issue.blockId ? (
                          <button
                            onClick={() => changeSelection(issue.blockId)}
                          >
                            {issue.message}
                          </button>
                        ) : (
                          issue.message
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Les contrôles de contenu sont satisfaits.</p>
                )}
              </div>
            </div>
          </section>
          <p role="status" className="datagif-feedback">
            {message}
          </p>
          <p className="datagif-note">
            Exemple sans images distantes ni contenu HTML importé. L’aperçu est
            isolé, ses liens sont inactifs. Les fichiers restent dans ce
            navigateur.
          </p>
        </section>
      </main>
      <DemoFooter />
    </div>
  );
}

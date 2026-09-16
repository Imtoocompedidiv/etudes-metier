import React, { Component, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "./shared/base.css";

const modules = import.meta.glob("./demos/*/App.jsx");
const pieces = location.pathname.split("/").filter(Boolean);
const slug =
  new URLSearchParams(location.search).get("etude") ||
  pieces[pieces.indexOf("etudes-metier") + 1];
const moduleKey = `./demos/${slug}/App.jsx`;
const Demo = modules[moduleKey] ? lazy(modules[moduleKey]) : null;

class Boundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("Chargement de l’étude interrompu", error);
  }
  render() {
    return this.state.failed ? (
      <main className="entry-message">
        <h1>L’étude n’a pas pu s’ouvrir</h1>
        <p>
          Rechargez cette page pour reprendre l’exemple. Aucun fichier n’a été
          envoyé.
        </p>
        <button onClick={() => location.reload()}>Recharger la page</button>
      </main>
    ) : (
      this.props.children
    );
  }
}

const root =
  import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <Boundary>
    {Demo ? (
      <Suspense
        fallback={
          <main className="entry-message" role="status">
            Ouverture de l’étude…
          </main>
        }
      >
        <Demo />
      </Suspense>
    ) : (
      <main className="entry-message">
        <h1>Études métier</h1>
        <p>
          Chaque étude possède son lien direct. Ouvrez celui qui accompagne la
          proposition reçue.
        </p>
        <a href="https://imtoocompedidiv.github.io/portfolio/">
          Le travail de JD
        </a>
      </main>
    )}
  </Boundary>,
);

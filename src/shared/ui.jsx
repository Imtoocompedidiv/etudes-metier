import React, { useEffect, useId, useState } from "react";
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = `${title} · Étude indépendante`;
  }, [title]);
}
export function DemoContext({ company, children }) {
  return (
    <aside className="demo-context" aria-label="À propos de cet exemple">
      <strong>{company} · Exemple de travail indépendant</strong>
      <p>
        {children ||
          "Modifiez les données d’exemple pour essayer le parcours. Le traitement reste dans votre navigateur."}
      </p>
    </aside>
  );
}
export function DemoFooter() {
  return (
    <footer className="demo-footer">
      <span>
        Exemple fourni avec données fictives · Traitement local · Sans compte
      </span>
      <a href="https://imtoocompedidiv.github.io/portfolio/">
        Conception et développement par JD
      </a>
    </footer>
  );
}
export function ErrorMessage({ children }) {
  return children ? (
    <div className="demo-error" role="alert">
      {children}
    </div>
  ) : null;
}
export function FileImport({
  label = "Importer un CSV",
  accept = ".csv,text/csv",
  onFile,
}) {
  const id = useId();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="demo-file-field">
      <label className="demo-file-import" htmlFor={id}>
        {busy ? "Lecture du fichier…" : label}
        <input
          id={id}
          type="file"
          accept={accept}
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              await onFile(file);
            } catch (err) {
              setError(err?.message || "Le fichier n’a pas pu être importé.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <ErrorMessage>{error}</ErrorMessage>
    </div>
  );
}

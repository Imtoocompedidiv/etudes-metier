import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
export const MAX_BYTES = 4 * 1024 * 1024;
const enc = new TextEncoder();
const clone = (x) => structuredClone(x);
const hash = (x) => bytesToHex(sha256(enc.encode(JSON.stringify(x))));
const keys = (x, names, label) => {
  if (
    !x ||
    typeof x !== "object" ||
    Array.isArray(x) ||
    Object.keys(x).length !== names.length ||
    names.some((n) => !Object.hasOwn(x, n))
  )
    throw Error(`${label} : structure inattendue.`);
};
function text(x, max, label, empty = false) {
  if (
    typeof x !== "string" ||
    x.length > max ||
    (!empty && !x.trim()) ||
    !x.isWellFormed()
  )
    throw Error(
      `${label} : texte ${empty ? "" : "non vide "}de ${max} caractères maximum.`,
    );
  return x;
}
function id(x) {
  if (
    typeof x !== "string" ||
    !/^[-a-z0-9_]{1,40}$/.test(x) ||
    ["__proto__", "constructor", "prototype"].includes(x)
  )
    throw Error(
      "Identifiant invalide (minuscules, chiffres, tirets, 40 caractères).",
    );
  return x;
}
function array(x, min, max, label) {
  if (!Array.isArray(x) || x.length < min || x.length > max)
    throw Error(`${label} : de ${min} à ${max} éléments.`);
  return x;
}
function checkBytes(x) {
  if (enc.encode(JSON.stringify(x, null, 2)).length > MAX_BYTES)
    throw Error(
      "Dossier supérieur à 4 Mo une fois enregistré. Réduisez les textes ou les traces.",
    );
  return x;
}

export function story(input) {
  keys(input, ["format", "title", "entry", "nodes"], "Storyboard");
  if (input.format !== "h3-story-v1")
    throw Error("Format de storyboard non reconnu.");
  const seen = new Set();
  const nodes = array(input.nodes, 1, 40, "Écrans").map((n) => {
    keys(n, ["id", "type", "title", "body", "next", "answers"], "Écran");
    id(n.id);
    if (seen.has(n.id)) throw Error("Identifiant d’écran dupliqué.");
    seen.add(n.id);
    if (!["page", "question", "end"].includes(n.type))
      throw Error("Type d’écran invalide.");
    if (
      (n.type === "end" && n.next !== null) ||
      (n.type === "question" && n.next !== null)
    )
      throw Error("La destination directe est réservée aux pages.");
    if (n.type === "page") id(n.next);
    const answerIds = new Set();
    const answers = array(
      n.answers,
      n.type === "question" ? 2 : 0,
      n.type === "question" ? 6 : 0,
      "Réponses",
    ).map((a) => {
      keys(a, ["id", "label", "points", "next", "feedback"], "Réponse");
      id(a.id);
      id(a.next);
      if (answerIds.has(a.id)) throw Error("Identifiant de réponse dupliqué.");
      answerIds.add(a.id);
      if (!Number.isInteger(a.points) || a.points < 0 || a.points > 10)
        throw Error("Les points doivent être un entier de 0 à 10.");
      return {
        id: a.id,
        label: text(a.label, 300, "Réponse"),
        points: a.points,
        next: a.next,
        feedback: text(a.feedback, 1000, "Feedback", true),
      };
    });
    return {
      id: n.id,
      type: n.type,
      title: text(n.title, 120, "Titre"),
      body: text(n.body, 3000, "Contenu"),
      next: n.next,
      answers,
    };
  });
  return checkBytes({
    format: "h3-story-v1",
    title: text(input.title, 160, "Titre du parcours"),
    entry: id(input.entry),
    nodes,
  });
}
export const revision = (input) => hash(story(input));
export function edges(node) {
  return node.type === "page"
    ? [{ choice: null, to: node.next }]
    : node.type === "question"
      ? node.answers.map((a) => ({ choice: a.id, to: a.next }))
      : [];
}
export function inspect(input) {
  const s = story(input),
    map = new Map(s.nodes.map((n) => [n.id, n])),
    issues = [];
  if (!map.has(s.entry))
    issues.push({
      node: s.entry,
      kind: "missing-entry",
      message: "L’écran de départ n’existe pas.",
    });
  for (const n of s.nodes)
    for (const e of edges(n))
      if (!map.has(e.to))
        issues.push({
          node: n.id,
          choice: e.choice,
          kind: "missing-target",
          message: `Destination ${e.to} absente${e.choice ? ` pour ${e.choice}` : ""}.`,
        });
  const reachable = new Set(),
    pending = map.has(s.entry) ? [s.entry] : [];
  while (pending.length) {
    const x = pending.pop();
    if (reachable.has(x)) continue;
    reachable.add(x);
    for (const e of edges(map.get(x))) if (map.has(e.to)) pending.push(e.to);
  }
  for (const n of s.nodes)
    if (!reachable.has(n.id))
      issues.push({
        node: n.id,
        kind: "unreachable",
        message: "Cet écran ne peut pas être atteint depuis le départ.",
      });
  const canExit = new Set(
    s.nodes.filter((n) => n.type === "end").map((n) => n.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of s.nodes)
      if (!canExit.has(n.id) && edges(n).some((e) => canExit.has(e.to))) {
        canExit.add(n.id);
        changed = true;
      }
  }
  for (const n of s.nodes)
    if (reachable.has(n.id) && !canExit.has(n.id))
      issues.push({
        node: n.id,
        kind: "no-exit",
        message: "Aucun chemin ne mène de cet écran à une fin.",
      });
  return { issues, reachable: [...reachable], canExit: [...canExit] };
}
function actions(input) {
  return array(input, 0, 200, "Trace").map((a) => {
    keys(a, ["kind", "answer"], "Action");
    if (!["continue", "answer"].includes(a.kind))
      throw Error("Action inconnue.");
    if (a.kind === "answer") id(a.answer);
    else if (a.answer !== null)
      throw Error("Une action Continuer ne porte pas de réponse.");
    return { kind: a.kind, answer: a.answer };
  });
}
export function replay(input, run) {
  const s = story(input);
  keys(run, ["format", "revision", "actions"], "Progression");
  if (run.format !== "h3-run-v1" || run.revision !== revision(s))
    throw Error(
      "Cette progression appartient à une autre version du storyboard.",
    );
  if (inspect(s).issues.length)
    throw Error(
      "Corrigez les chemins du storyboard avant de jouer ou reprendre.",
    );
  const map = new Map(s.nodes.map((n) => [n.id, n])),
    answers = new Map(),
    trace = [];
  let current = s.entry;
  for (const action of actions(run.actions)) {
    const node = map.get(current);
    if (action.kind === "answer") {
      if (node.type !== "question")
        throw Error("Une réponse est placée hors d’une question.");
      const selected = node.answers.find((a) => a.id === action.answer);
      if (!selected) throw Error("Réponse absente de la question courante.");
      answers.set(current, selected.id);
      trace.push({
        index: trace.length + 1,
        node: node.id,
        title: node.title,
        action: "Répondre",
        answer: selected.label,
        answerId: selected.id,
        points: selected.points,
        to: current,
      });
    } else {
      if (node.type === "end") throw Error("Le parcours est déjà terminé.");
      const selected = node.answers.find((a) => a.id === answers.get(current));
      if (node.type === "question" && !selected)
        throw Error("Choisissez une réponse avant de continuer.");
      const next = node.type === "page" ? node.next : selected.next;
      trace.push({
        index: trace.length + 1,
        node: node.id,
        title: node.title,
        action: "Continuer",
        answer: selected?.label || "",
        answerId: selected?.id || null,
        points: null,
        to: next,
      });
      current = next;
    }
  }
  const choices = [...answers].map(([node, answer]) => {
    const q = map.get(node),
      a = q.answers.find((x) => x.id === answer);
    return {
      node,
      answer,
      points: a.points,
      maximum: Math.max(...q.answers.map((x) => x.points)),
    };
  });
  return {
    current,
    node: map.get(current),
    trace,
    choices,
    points: choices.reduce((s, a) => s + a.points, 0),
    maximum: choices.reduce((s, a) => s + a.maximum, 0),
    answered: choices.length,
    totalQuestions: s.nodes.filter((n) => n.type === "question").length,
    completed: map.get(current).type === "end",
  };
}
export function freshRun(input) {
  const s = story(input);
  const run = { format: "h3-run-v1", revision: revision(s), actions: [] };
  replay(s, run);
  return run;
}
export function progress(input, run, action) {
  const next = { ...run, actions: [...run.actions, action] };
  replay(input, next);
  return next;
}
const validRun = (s, run) => {
  if (run === null) return null;
  const result = {
    format: run.format,
    revision: run.revision,
    actions: actions(run.actions),
  };
  keys(run, ["format", "revision", "actions"], "Progression");
  replay(s, result);
  return result;
};
export function normalize(input) {
  keys(input, ["format", "story", "run", "checkpoint", "review"], "Dossier");
  if (input.format !== "h3-dossier-v1")
    throw Error("Format de dossier non reconnu.");
  const s = story(input.story),
    run = validRun(s, input.run),
    checkpoint = validRun(s, input.checkpoint);
  if (
    input.review !== null &&
    (typeof input.review !== "string" || !/^[a-f0-9]{64}$/.test(input.review))
  )
    throw Error("Empreinte de revue invalide.");
  return checkBytes({
    format: "h3-dossier-v1",
    story: s,
    run,
    checkpoint,
    review: input.review,
  });
}
export function reviewed(state) {
  const s = normalize(state);
  return (
    !!s.run &&
    replay(s.story, s.run).completed &&
    s.review === hash({ story: s.story, run: s.run })
  );
}
export function editNode(state, nodeId, patch) {
  const source = normalize(state);
  if (!source.story.nodes.some((n) => n.id === nodeId))
    throw Error("Écran à modifier absent.");
  const next = story({
    ...source.story,
    nodes: source.story.nodes.map((n) =>
      n.id === nodeId ? { ...n, ...patch, id: n.id } : n,
    ),
  });
  if (revision(next) === revision(source.story)) return source;
  return normalize({
    ...source,
    story: next,
    run: null,
    checkpoint: null,
    review: null,
  });
}
export function start(state) {
  const s = normalize(state);
  return { ...s, run: freshRun(s.story), review: null };
}
export function act(state, action) {
  const s = normalize(state);
  if (!s.run) throw Error("Lancez le parcours avant de répondre.");
  return normalize({
    ...s,
    run: progress(s.story, s.run, action),
    review: null,
  });
}
export function previous(state) {
  const s = normalize(state);
  if (!s.run?.actions.length) throw Error("Aucune action à retirer.");
  return normalize({
    ...s,
    run: { ...s.run, actions: s.run.actions.slice(0, -1) },
    review: null,
  });
}
export function saveCheckpoint(state) {
  const s = normalize(state);
  if (!s.run) throw Error("Aucune progression à sauvegarder.");
  return normalize({ ...s, checkpoint: clone(s.run) });
}
export function resumeCheckpoint(state) {
  const s = normalize(state);
  if (!s.checkpoint) throw Error("Aucune progression sauvegardée.");
  return normalize({ ...s, run: clone(s.checkpoint), review: null });
}
export function reviewTrace(state) {
  const s = normalize(state);
  if (!s.run || !replay(s.story, s.run).completed)
    throw Error("Terminez un parcours avant de relire sa trace.");
  return { ...s, review: hash({ story: s.story, run: s.run }) };
}
export function parseImport(raw, current) {
  if (typeof raw !== "string" || enc.encode(raw).length > MAX_BYTES)
    throw Error("Fichier JSON limité à 4 Mo.");
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(
      "Un objet JSON de dossier, storyboard ou progression est attendu.",
    );
  const s = normalize(current);
  if (value.format === "h3-dossier-v1") {
    const result = normalize(value);
    if (!reviewed(result)) result.review = null;
    return result;
  }
  if (value.format === "h3-story-v1") {
    const next = story(value);
    return revision(next) === revision(s.story)
      ? s
      : normalize({
          ...s,
          story: next,
          run: null,
          checkpoint: null,
          review: null,
        });
  }
  if (value.format === "h3-run-v1") {
    const run = validRun(s.story, value);
    return normalize({ ...s, run, checkpoint: clone(run), review: null });
  }
  throw Error(
    "Import attendu : dossier, storyboard ou progression H3 version 1.",
  );
}
export function matrix(state) {
  const s = normalize(state),
    issues = inspect(s.story).issues,
    result = s.run ? replay(s.story, s.run) : null;
  return s.story.nodes.flatMap((n) => {
    const list = edges(n);
    return (list.length ? list : [{ choice: null, to: null }]).map((e) => ({
      screen: n.id,
      title: n.title,
      type: n.type,
      answer: e.choice || "",
      destination: e.to || "",
      points: e.choice ? n.answers.find((a) => a.id === e.choice).points : "",
      observed:
        n.type === "end"
          ? result?.current === n.id
            ? "Écran final atteint"
            : "Écran final non atteint"
          : result?.trace.some(
                (t) =>
                  t.node === n.id &&
                  t.action === "Continuer" &&
                  t.to === e.to &&
                  (!e.choice || t.answerId === e.choice),
              )
            ? "Parcourue"
            : "Non parcourue",
      issues: issues
        .filter((x) => x.node === n.id && (!x.choice || x.choice === e.choice))
        .map((x) => x.message)
        .join(" "),
    }));
  });
}
export const matrixHeaders = [
  "screen",
  "title",
  "type",
  "answer",
  "destination",
  "points",
  "observed",
  "issues",
];
export function report(state) {
  const s = normalize(state),
    r = s.run ? replay(s.story, s.run) : null;
  return {
    title: "Recette du parcours " + s.story.title,
    subtitle: reviewed(s)
      ? "Trace du parcours courant relue."
      : "Document provisoire, trace non relue.",
    sections: [
      {
        title: "Périmètre",
        paragraphs: [
          "Exemple original fictif. Aucun accès à un LMS, aucun fichier Storyline ou paquet SCORM produit. Une trace terminée ne couvre pas nécessairement toutes les branches.",
          r
            ? `${r.answered} question(s) répondue(s) sur ${r.totalQuestions}. Points ${r.points}/${r.maximum}, maximum des seules questions répondues. État ${r.completed ? "terminé" : "en cours"}.`
            : "Aucun parcours joué.",
        ],
      },
      {
        title: "Matrice des chemins",
        headers: matrixHeaders,
        rows: matrix(s).map((x) => matrixHeaders.map((h) => x[h])),
      },
      {
        title: "Trace des actions",
        headers: [
          "Étape",
          "Écran",
          "Action",
          "Réponse",
          "Points",
          "Destination",
        ],
        rows: r
          ? r.trace.map((t) => [
              t.index,
              t.node,
              t.action,
              t.answer,
              t.points ?? "",
              t.to,
            ])
          : [],
      },
    ],
  };
}
export function seed() {
  return {
    format: "h3-dossier-v1",
    story: {
      format: "h3-story-v1",
      title: "Clarifier une demande client",
      entry: "accueil",
      nodes: [
        {
          id: "accueil",
          type: "page",
          title: "Accueil",
          body: "Une demande arrive dans votre équipe. Avant de promettre une livraison, clarifiez la date attendue et les éléments disponibles. Ce scénario fictif sert à tester le parcours.",
          next: "priorite",
          answers: [],
        },
        {
          id: "priorite",
          type: "question",
          title: "Choisir une priorité",
          body: "Une demande arrive sans date de livraison. Que faites-vous ?",
          next: null,
          answers: [
            {
              id: "a",
              label: "Confirmer l’échéance avec le client",
              points: 1,
              next: "debrief",
              feedback: "Vous clarifiez la contrainte avant de vous engager.",
            },
            {
              id: "b",
              label: "Promettre demain sans vérifier",
              points: 0,
              next: "page_absente",
              feedback:
                "L’échéance reste inconnue. Reprendre contact permet de cadrer la demande.",
            },
          ],
        },
        {
          id: "debrief",
          type: "page",
          title: "Faire le point",
          body: "Une réponse utile confirme l’échéance attendue, les informations manquantes et la prochaine étape. La recette technique vérifie que chaque réponse atteint bien cet écran.",
          next: "bilan",
          answers: [],
        },
        {
          id: "bilan",
          type: "end",
          title: "Bilan",
          body: "Le parcours de test est terminé. Relisez la trace et les branches parcourues avant de partager votre constat.",
          next: null,
          answers: [],
        },
      ],
    },
    run: null,
    checkpoint: null,
    review: null,
  };
}

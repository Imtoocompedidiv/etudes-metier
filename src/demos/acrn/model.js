export const assetHeaders = ["appareil", "famille", "designation", "validite"];
export const bookingHeaders = [
  "location",
  "appareil",
  "client",
  "debut",
  "fin",
];
export function dateDay(value, label = "Date") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))
    throw new Error(`${label} : utilisez AAAA-MM-JJ.`);
  const time = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
  )
    throw new Error(`${label} : date impossible.`);
  return time / 86400000;
}
export const dateISO = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
export const shiftDate = (s, n) => dateISO(dateDay(s) + n);
function required(v, label) {
  const s = String(v ?? "").trim();
  if (!s || s.length > 180)
    throw new Error(`${label} : texte requis, 180 caractères maximum.`);
  return s;
}
function boundedRows(rows) {
  if (!Array.isArray(rows) || rows.length > 2000)
    throw new Error("Le fichier doit contenir au plus 2 000 lignes.");
}
function unique(rows, key, label) {
  const set = new Set();
  rows.forEach((r, i) => {
    if (set.has(r[key]))
      throw new Error(`Ligne ${i + 1} : ${label} ${r[key]} en double.`);
    set.add(r[key]);
  });
  return rows;
}
export function parseAssets(rows) {
  boundedRows(rows);
  if (!rows.length)
    throw new Error(
      "Le parc doit contenir au moins un appareil. Le dossier actuel est conservé.",
    );
  return unique(
    rows.map((r, i) => {
      const line = `Ligne ${i + 1}`;
      const validite = String(r.validite ?? "").trim();
      if (validite) dateDay(validite, `${line}, validité`);
      return {
        appareil: required(r.appareil, `${line}, appareil`),
        famille: required(r.famille, `${line}, famille`),
        designation: required(r.designation, `${line}, désignation`),
        validite,
      };
    }),
    "appareil",
    "appareil",
  );
}
export function parseBookings(rows, assets) {
  boundedRows(rows);
  const ids = new Set(assets.map((a) => a.appareil));
  return unique(
    rows.map((r, i) => {
      const line = `Ligne ${i + 1}`;
      const appareil = required(r.appareil, `${line}, appareil`);
      if (!ids.has(appareil))
        throw new Error(`${line} : appareil ${appareil} absent du parc.`);
      const debut = String(r.debut ?? "").trim(),
        fin = String(r.fin ?? "").trim();
      if (dateDay(fin, `${line}, fin`) < dateDay(debut, `${line}, début`))
        throw new Error(`${line} : la fin précède le début.`);
      return {
        location: required(r.location, `${line}, location`),
        appareil,
        client: required(r.client, `${line}, client`),
        debut,
        fin,
      };
    }),
    "location",
    "location",
  );
}
export function parseParams(p) {
  const out = {};
  for (const k of ["transport", "atelier"]) {
    if (
      p?.[k] === "" ||
      p?.[k] == null ||
      !Number.isInteger(Number(p[k])) ||
      Number(p[k]) < 0 ||
      Number(p[k]) > 30
    )
      throw new Error(`${k} : nombre entier de jours entre 0 et 30.`);
    out[k] = Number(p[k]);
  }
  return out;
}
export function normalizeProject(raw) {
  if (raw?.version !== 1) throw new Error("Version de dossier non reconnue.");
  const assets = parseAssets(raw.assets);
  const bookings = parseBookings(raw.bookings, assets);
  const params = parseParams(raw.params);
  const journal = Array.isArray(raw.journal)
    ? raw.journal
        .slice(-40)
        .map((j) => ({
          at: String(j.at || "").slice(0, 40),
          text: String(j.text || "").slice(0, 250),
        }))
    : [];
  return { version: 1, assets, bookings, params, journal };
}
export const validProject = (raw) => {
  try {
    normalizeProject(raw);
    return true;
  } catch {
    return false;
  }
};
export const seed = {
  version: 1,
  params: { transport: 2, atelier: 3 },
  journal: [],
  assets: [
    {
      appareil: "CT-104",
      famille: "Couplemètre 10 N·m",
      designation: "Couplemètre de table",
      validite: "2026-09-25",
    },
    {
      appareil: "CT-108",
      famille: "Couplemètre 10 N·m",
      designation: "Couplemètre de table",
      validite: "2026-10-10",
    },
    {
      appareil: "CT-112",
      famille: "Couplemètre 10 N·m",
      designation: "Couplemètre de table",
      validite: "2026-09-24",
    },
  ],
  bookings: [
    {
      location: "LOC-104",
      appareil: "CT-104",
      client: "Ateliers du Rivage",
      debut: "2026-09-16",
      fin: "2026-09-23",
    },
    {
      location: "LOC-108",
      appareil: "CT-108",
      client: "Mécanique des Aulnes",
      debut: "2026-09-17",
      fin: "2026-09-18",
    },
    {
      location: "LOC-112",
      appareil: "CT-112",
      client: "Fabrication du Parc",
      debut: "2026-09-18",
      fin: "2026-09-22",
    },
    {
      location: "LOC-205",
      appareil: "CT-104",
      client: "Atelier Bellevue",
      debut: "2026-10-01",
      fin: "2026-10-04",
    },
    {
      location: "LOC-206",
      appareil: "CT-108",
      client: "Solutions du Vallon",
      debut: "2026-10-05",
      fin: "2026-10-08",
    },
    {
      location: "LOC-207",
      appareil: "CT-112",
      client: "Atelier de la Rive",
      debut: "2026-09-27",
      fin: "2026-09-30",
    },
  ],
};
export function conflictsFor(project, booking, exclude = booking.location) {
  const reasons = [];
  const asset = project.assets.find((a) => a.appareil === booking.appareil);
  if (!asset) return ["Appareil absent du parc."];
  const start = dateDay(booking.debut),
    end = dateDay(booking.fin),
    back = end + project.params.transport;
  if (!asset.validite) reasons.push("Date de validité métrologique inconnue.");
  else if (back > dateDay(asset.validite))
    reasons.push(
      `Retour atelier le ${dateISO(back)}, après la validité du ${asset.validite}.`,
    );
  const ready = back + project.params.atelier;
  for (const other of project.bookings) {
    if (other.location === exclude || other.appareil !== booking.appareil)
      continue;
    const ostart = dateDay(other.debut),
      oready =
        dateDay(other.fin) + project.params.transport + project.params.atelier;
    if (start <= oready && ostart <= ready)
      reasons.push(
        `Chevauchement avec ${other.location} (${other.client}), immobilisation comprise.`,
      );
  }
  return reasons;
}
export function proposal(project, location, newEnd) {
  const booking = project.bookings.find((b) => b.location === location);
  if (!booking) throw new Error("Choisissez une location existante.");
  const end = dateDay(newEnd, "Nouvelle fin");
  if (end < dateDay(booking.fin))
    throw new Error(
      "La prolongation doit conserver ou repousser la fin actuelle.",
    );
  const candidate = { ...booking, fin: newEnd };
  const reasons = conflictsFor(project, candidate);
  const original = project.assets.find((a) => a.appareil === booking.appareil);
  const tailStart = shiftDate(booking.fin, 1);
  const replacements = project.assets
    .filter(
      (a) => a.appareil !== booking.appareil && a.famille === original.famille,
    )
    .map((a) => {
      const tail = {
        ...booking,
        appareil: a.appareil,
        debut: tailStart,
        fin: newEnd,
      };
      return {
        asset: a,
        tail,
        reasons:
          end <= dateDay(booking.fin)
            ? ["Aucune prolongation à affecter."]
            : conflictsFor(project, tail, ""),
      };
    });
  return { booking, candidate, reasons, replacements, tailStart };
}
export function applyProposal(project, location, newEnd, replacement = "") {
  const p = proposal(project, location, newEnd);
  if (newEnd === p.booking.fin) throw new Error("La date est inchangée.");
  let bookings;
  if (replacement) {
    const chosen = p.replacements.find((r) => r.asset.appareil === replacement);
    if (!chosen || chosen.reasons.length)
      throw new Error(
        "Ce remplacement n’est pas disponible sur toute la période.",
      );
    const existing = conflictsFor(project, p.booking);
    if (existing.length)
      throw new Error(
        "La location initiale comporte déjà un conflit à corriger avant de la prolonger.",
      );
    let suffix = 1;
    while (
      project.bookings.some((b) => b.location === `${location}-R${suffix}`)
    )
      suffix++;
    bookings = [
      ...project.bookings,
      { ...chosen.tail, location: `${location}-R${suffix}` },
    ];
  } else {
    if (p.reasons.length)
      throw new Error(
        "Résolvez les conflits avant d’appliquer cette prolongation.",
      );
    bookings = project.bookings.map((b) =>
      b.location === location ? p.candidate : b,
    );
  }
  return { ...project, bookings };
}
export function movements(project) {
  return project.bookings
    .flatMap((b) => [
      {
        date: b.debut,
        appareil: b.appareil,
        operation: "Début chez le client",
        destination: b.client,
        location: b.location,
      },
      {
        date: b.fin,
        appareil: b.appareil,
        operation: "Fin chez le client",
        destination: b.client,
        location: b.location,
      },
      {
        date: shiftDate(b.fin, project.params.transport),
        appareil: b.appareil,
        operation: "Arrivée atelier",
        destination: "Atelier de contrôle",
        location: b.location,
      },
      {
        date: shiftDate(
          b.fin,
          project.params.transport + project.params.atelier + 1,
        ),
        appareil: b.appareil,
        operation: "Fin d’immobilisation prévue",
        destination: "Sous réserve de contrôle et de validité",
        location: b.location,
      },
    ])
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.appareil.localeCompare(b.appareil),
    );
}
export function planningRows(project) {
  return project.bookings.map((b) => ({
    ...b,
    validite:
      project.assets.find((a) => a.appareil === b.appareil)?.validite || "",
    transport_jours: project.params.transport,
    atelier_jours: project.params.atelier,
    arrivee_atelier: shiftDate(b.fin, project.params.transport),
    disponible_au_plus_tot: shiftDate(
      b.fin,
      project.params.transport + project.params.atelier + 1,
    ),
    points_a_verifier: conflictsFor(project, b).join(" | "),
  }));
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  day,
  blockers,
  productionCalendar,
  checkVersion,
  receiveVersion,
  fixDeparture,
  releaseIsCurrent,
  requestText,
  restoreState,
  applySettings,
  addPiece,
} from "./model.js";
function completed() {
  let d = checkVersion(initialState(), "odj", true);
  d = receiveVersion(d, "annexe", {
    name: "budget.pdf",
    receivedOn: "2026-09-16",
    note: "",
  });
  return checkVersion(d, "annexe", true);
}
test("réception et contrôle sont distincts et bloquent le départ", () => {
  const d = initialState();
  assert.equal(blockers(d).length, 2);
  assert.throws(() => fixDeparture(d));
  const r = receiveVersion(d, "annexe", {
    name: "budget.pdf",
    receivedOn: "2026-09-16",
    note: "",
  });
  assert.equal(blockers(r).length, 2);
  assert.throws(() => fixDeparture(r));
  assert.ok(releaseIsCurrent(fixDeparture(completed())));
});
test("la version suivante invalide le contrôle et la fiche sans effacer l’ancienne", () => {
  const d = fixDeparture(completed());
  const saved = JSON.stringify(d);
  const changed = receiveVersion(d, "odj", {
    name: "odj-v3.pdf",
    receivedOn: "2026-09-16",
    note: "Correction",
  });
  assert.equal(changed.pieces[2].versions.length, 3);
  assert.equal(changed.pieces[2].versions[1].checked, true);
  assert.equal(releaseIsCurrent(changed), false);
  assert.equal(JSON.stringify(d), saved);
});
test("la demande correspond seulement aux manques courants", () => {
  const d = checkVersion(initialState(), "odj", true),
    output = requestText(d);
  assert.match(output, /Annexe budget/);
  assert.doesNotMatch(output, /Ordre du jour|Présences|Audio/);
  assert.match(requestText(completed()), /Aucune demande/);
});
test("calendrier exclut départ, week-ends et fermeture ; seuil 300 minutes inclus", () => {
  const d = initialState();
  assert.equal(productionCalendar(d).end, "2026-09-29");
  assert.equal(
    productionCalendar({ ...d, settings: { ...d.settings, duration: 300 } })
      .count,
    8,
  );
  assert.equal(
    productionCalendar({ ...d, settings: { ...d.settings, duration: 301 } })
      .end,
    "2026-10-01",
  );
  assert.equal(
    productionCalendar({ ...d, settings: { ...d.settings, closed: [] } }).end,
    "2026-09-28",
  );
});
test("une correction du calendrier exige une nouvelle fiche de départ", () => {
  const d = fixDeparture(completed());
  const changed = applySettings(d, { ...d.settings, duration: 301 });
  assert.equal(releaseIsCurrent(changed), false);
  assert.equal(fixDeparture(changed).release.end, "2026-10-01");
});
test("dates et imports invalides sont rejetés sans modifier la source", () => {
  for (const date of ["2026-02-30", "2026-13-10", "31/01/2026"])
    assert.throws(() => day(date));
  const d = initialState(),
    before = JSON.stringify(d);
  const bad = structuredClone(d);
  bad.pieces[1].id = "audio";
  assert.throws(() => restoreState(bad));
  assert.throws(() =>
    receiveVersion(d, "audio", {
      name: "futur.mp3",
      receivedOn: "2026-09-17",
      note: "",
    }),
  );
  assert.equal(JSON.stringify(d), before);
});
test("inventaire exporté réimporté restitue versions, contrôles et départ", () => {
  const d = fixDeparture(completed());
  const restored = restoreState(JSON.stringify(d));
  assert.deepEqual(restored, d);
  assert.equal(releaseIsCurrent(restored), true);
  restored.release.end = "2026-10-15";
  assert.equal(releaseIsCurrent(restored), false);
});
test("une nouvelle pièce requise remet le dossier en attente, identité unique", () => {
  const d = fixDeparture(completed()),
    changed = addPiece(d, "Annexe activité");
  assert.equal(blockers(changed).length, 1);
  assert.equal(releaseIsCurrent(changed), false);
  assert.throws(() => addPiece(changed, "annexe activité"));
});

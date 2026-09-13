/**
 * iPad-Zeigerlebenszyklus (Nutzerbefund 13.9.2026: „Text verschwindet, Input wird manchmal
 * erst gar nicht registriert, man muss absetzen").
 *
 * Diese Tests bündeln den ECHTEN Editor (src/main.ts) und stellen die Ereignisfolgen nach, die
 * iOS/iPadOS zusätzlich zu den normalen Pointer-Events schickt. Vorher gemessenes Verhalten:
 *   • `pointercancel` löschte den fertigen Strich  → Text verschwand
 *   • `lostpointercapture` (Handballen) tat dasselbe
 *   • der erste `pointermove` nach `setPointerCapture` wurde auf iOS verworfen (WebKit 276287)
 *     → Punkte fehlten, schnelles Schreiben „kam nicht an"
 *   • ein hängender Strich blockierte jeden folgenden Kontakt lautlos
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { PenPressureTracker, pressureVaries, strokeIsStuck } from "../src/input-device";

const requireFromProject = createRequire(`${process.cwd()}/package.json`);
const { buildSync } = requireFromProject("esbuild");
const code = buildSync({ entryPoints: ["src/main.ts"], bundle: true, platform: "node", format: "cjs", target: "es2022", loader: { ".woff2": "binary" }, external: ["obsidian"], write: false }).outputFiles[0].text;

const noop = () => {};
class NodeStub {
  style: any = { setProperty(name: string, value: string) { this[name] = value; } };
  dataset: any = {}; children: NodeStub[] = []; captured = new Set<number>(); drawn = false;
  private w = 0; private h = 0;
  get width() { return this.w; } set width(v: number) { this.w = v; this.drawn = false; }
  get height() { return this.h; } set height(v: number) { this.h = v; this.drawn = false; }
  clientWidth = 800; scrollTop = 0; scrollLeft = 0; strokes = 0;
  classList = { add: noop, remove: noop, toggle: noop, contains: () => false };
  toggleClass() {} addClass() {} removeClass() {} setText() {} empty() {}
  createEl() { return new NodeStub(); } createDiv() { return new NodeStub(); } createSpan() { return new NodeStub(); }
  addEventListener() {} removeEventListener() {} append() {} replaceChildren() {} remove() {}
  setAttribute() {} getAttribute() { return null; }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  setPointerCapture(id: number) { this.captured.add(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 800 }; }
  querySelectorAll() { return []; }
  getContext() { return new Proxy({}, { get: (_t, name) => name === "measureText" ? () => ({ width: 10 }) : () => { if (name === "clearRect") this.strokes = 0; if (name === "stroke") this.strokes++; if (["stroke", "fill", "fillRect"].includes(String(name))) this.drawn = true; }, set: () => true }); }
}
const moduleStub = { exports: {} as any };
runInNewContext(code, {
  module: moduleStub, exports: moduleStub.exports,
  require: (name: string) => name === "obsidian" ? { MarkdownRenderChild: class {}, Plugin: class {}, PluginSettingTab: class {}, Notice: class {}, Modal: class {}, Setting: class {} } : requireFromProject(name),
  console, structuredClone, crypto: globalThis.crypto, setTimeout, clearTimeout, Buffer,
  window: { devicePixelRatio: 1, setTimeout: () => 1, clearTimeout: noop },
  document: { createElement: () => new NodeStub(), documentElement: {} },
  getComputedStyle: () => ({ getPropertyValue: () => "#abc" }),
  requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
  ResizeObserver: class { observe = noop; disconnect = noop; }
});
const Editor = moduleStub.exports.InlineHandwritingEditor;

const event = (x: number, y: number, type = "pointerdown", pointerId = 1, pointerType = "pen", extra: Record<string, unknown> = {}) =>
  ({ clientX: x, clientY: y, pointerId, pointerType, button: 0, buttons: type === "pointerup" ? 0 : 1, pressure: .5, tiltX: 0, tiltY: 0, isPrimary: true, timeStamp: 10, type, preventDefault: noop, ...extra });
function fixture() {
  const page = { id: "p1", width: 500, height: 500, paper: "blank", elements: [] as any[] };
  const settings = { penColor: "#111", penSize: 2, circleLasso: true, scratchErase: true, shapeOptimization: false, beautifyEnabled: false, penForceMode: false, shapeHoldSnap: false };
  const e: any = new Editor(new NodeStub(), { settings, registerEditor: noop }, {}, { version: 3, pages: [page], profile: {} }, false);
  e.editing = true; e.tool = "pen"; e.wrapper = new NodeStub(); e.reticle = new NodeStub(); e.statusEl = new NodeStub(); e.pagesEl = new NodeStub();
  e.canvases.set(page.id, new NodeStub()); e.overlays.set(page.id, new NodeStub()); e.selectionOverlays.set(page.id, new NodeStub());
  return { e, page, canvas: e.canvases.get(page.id) as NodeStub };
}
function draw(e: any, page: any, moves = 12, at = (i: number) => ({ x: 100 + i * 3, y: 100 + i * 2 })) {
  e.pointerDown(event(at(0).x, at(0).y), page.id);
  for (let i = 1; i <= moves; i++) e.pointerMove(event(at(i).x, at(i).y, "pointermove"), page.id);
}
const inked = (page: any) => page.elements.reduce((n: number, el: any) => n + (el.points?.length ?? 0), 0);

// 1. iOS bricht den Strich ab: die geschriebene Tinte darf NICHT verschwinden.
{
  const { e, page } = fixture();
  draw(e, page);
  const vorher = inked(page);
  assert.ok(vorher >= 13, "der Strich hat Punkte, bevor iOS abbricht");
  e.pointerUp(event(136, 124, "pointercancel"), page.id);
  assert.equal(page.elements.length, 1, "pointercancel behält den Strich (vorher wurde er gelöscht)");
  assert.ok(inked(page) >= 13, `die Tinte bleibt erhalten (${inked(page)} Punkte)`);
  assert.equal(e.pointerPageId, null, "der Editor ist danach wieder aufnahmebereit");
}

// 2. Handballen/Zweifinger (lostpointercapture) darf die Tinte ebenfalls nicht löschen.
{
  const { e, page, canvas } = fixture();
  draw(e, page);
  canvas.releasePointerCapture(1);
  e.pointerUp(event(136, 124, "lostpointercapture"), page.id);
  assert.equal(page.elements.length, 1, "lostpointercapture behält die Tinte");
  assert.equal(e.pointerPageId, null, "der Editor bleibt bedienbar");
}

// 3. Nicht-Tinte (Formvorschau) rollt beim Abbruch weiterhin zurück — Auswahl-Verhalten bleibt.
{
  const { e, page } = fixture();
  e.tool = "rectangle";
  e.pointerDown(event(100, 100), page.id);
  e.pointerMove(event(160, 160, "pointermove"), page.id);
  e.pointerUp(event(160, 160, "pointercancel"), page.id);
  assert.equal(page.elements.length, 0, "eine abgebrochene Formvorschau verschwindet weiterhin");
}

// 4. WebKit 276287: der erste Move nach setPointerCapture kommt ohne Capture an.
{
  const { e, page, canvas } = fixture();
  e.pointerDown(event(100, 100), page.id);
  canvas.captured.clear();
  for (let i = 1; i <= 10; i++) e.pointerMove(event(100 + i * 3, 100 + i * 2, "pointermove"), page.id);
  assert.equal(page.elements[0].points.length, 11, "ohne Capture-Test gehen keine Punkte verloren (vorher 1)");
}

// 5. Ein hängender Strich (kein Abschlussereignis) darf den nächsten Kontakt nicht verschlucken.
{
  const { e, page } = fixture();
  draw(e, page, 4);
  e.pointerUp(event(112, 108, "pointerup", 7), page.id); // Abschluss mit fremder pointerId: bleibt hängen
  assert.equal(e.pointerPageId, "p1", "der alte Strich gilt noch als laufend");
  e.lastPointerActivityTs = 0; // lange her → iOS hat das Abschlussereignis nie geliefert
  e.pointerDown(event(300, 300), page.id);
  assert.equal(page.elements.length, 2, "der neue Strich wird begonnen (vorher lautlos verworfen)");
  for (let i = 1; i <= 5; i++) e.pointerMove(event(300 + i, 300 + i, "pointermove"), page.id);
  e.pointerUp(event(305, 305, "pointerup"), page.id);
  assert.ok(page.elements[1].points.length >= 6, "der neue Strich sammelt Punkte");
}

// 6. Doppelt gemeldetes Aufsetzen (kommt bei Stiften vor) darf den Strich nicht zerschneiden.
{
  const { e, page } = fixture();
  e.pointerDown(event(100, 100), page.id);
  e.pointerMove(event(120, 120, "pointermove"), page.id);
  e.pointerDown(event(100, 100), page.id); // dasselbe Aufsetzen noch einmal, gleiche Stelle
  assert.equal(page.elements.length, 1, "kein zweiter Strich durch ein doppeltes pointerdown");
  e.pointerMove(event(140, 140, "pointermove"), page.id);
  e.pointerUp(event(140, 140, "pointerup"), page.id);
  assert.ok(page.elements[0].points.length >= 4, "der Strich läuft ununterbrochen weiter (kein Absetzen nötig)");
}

// 7. Ein echter neuer Strich an anderer Stelle während eines laufenden: abschließen und weiter.
{
  const { e, page } = fixture();
  draw(e, page, 4);
  e.lastPointerActivityTs = 0;
  e.pointerDown(event(300, 300), page.id);
  assert.equal(page.elements.length, 2, "der vorige Strich wird abgeschlossen, nicht verworfen");
  for (let i = 1; i <= 5; i++) e.pointerMove(event(300 + i, 300 + i, "pointermove"), page.id);
  e.pointerUp(event(305, 305, "pointerup"), page.id);
  assert.equal(e.pointerPageId, null, "danach ist der Editor wieder frei");
  assert.ok(inked(page) >= 11, `beide Striche liegen auf der Seite (${inked(page)} Punkte)`);
}

// 8. Verspätetes Abschlussereignis des vorigen Strichs darf den neuen nicht beenden.
{
  const { e, page } = fixture();
  e.pointerDown(event(100, 100, "pointerdown", 1, "pen", { timeStamp: 50 }), page.id);
  e.pointerDown(event(300, 300, "pointerdown", 1, "pen", { timeStamp: 60 }), page.id); // 50 ms alt → nicht „frisch"
  assert.equal(page.elements.length, 2, "der alte Strich wird abgeschlossen und der neue beginnt");
  e.pointerUp(event(100, 100, "pointerup", 1, "pen", { timeStamp: 55 }), page.id); // verspätet, vor dem neuen Start
  assert.equal(e.pointerPageId, page.id, "das verspätete pointerup beendet den neuen Strich nicht");
}

// 9. Druck: Apple Pencil löst fein auf — der Wert darf nicht verbogen werden.
{
  const tracker = new PenPressureTracker();
  const leicht = tracker.observe(1, 0.12);
  const mittel = tracker.observe(1, 0.55);
  const fest = tracker.observe(1, 1);
  assert.equal(leicht.pressure, 0.12, "leiser Anschlag bleibt leise");
  assert.equal(mittel.pressure, 0.55, "mittlerer Anschlag bleibt mittel");
  assert.equal(fest.pressure, 1, "fester Anschlag (Apple Pencil) wird NICHT mehr auf 0,72 verbogen");
  assert.equal(fest.varies, true, "der Verlauf verrät den echten Druckfühler");
}

// 10. Plateau-Treiber (manche Wacom): konstant 1.0 sagt nichts über den Anschlag.
{
  const tracker = new PenPressureTracker();
  const a = tracker.observe(2, 1);
  const b = tracker.observe(2, 1);
  assert.equal(a.varies, false, "konstanter Wert = kein echter Drucksensor");
  assert.equal(b.pressure, 0.72, "Plateau 1.0 fällt auf den bisherigen Ersatzwert zurück");
}

// 11. Maus/Finger-Idiom bleibt neutral, und ein neuer Kontakt wird neu beurteilt.
{
  const tracker = new PenPressureTracker();
  assert.equal(tracker.observe(3, 0.5).pressure, 0.5, "Maus-Anschlag bleibt neutral");
  assert.equal(tracker.observe(3, 0).pressure, 0.5, "ohne Kontakt neutral");
  tracker.observe(4, 1);
  tracker.observe(4, 1);
  tracker.forget(4);
  assert.equal(tracker.observe(4, 1).varies, false, "nach dem Absetzen beginnt die Beurteilung neu");
}

// 12. Hilfsfunktionen: Verlaufserkennung und hängender Strich.
{
  assert.equal(pressureVaries([{ pressure: 0.3 }, { pressure: 0.8 }]), true, "Schwankung wird erkannt");
  assert.equal(pressureVaries([{ pressure: 1 }, { pressure: 1 }]), false, "Plateau wird erkannt");
  assert.equal(pressureVaries([{ pressure: 0 }]), false, "zu wenig Werte");
  assert.equal(strokeIsStuck(1000, 1500, 120), true, "500 ms ohne Ereignis gilt als hängend");
  assert.equal(strokeIsStuck(1000, 1100, 120), false, "kurze Pause ist kein Hänger");
  assert.equal(strokeIsStuck(0, 99999), false, "ohne begonnenen Strich nie hängend");
}

console.log("iPad-Zeigerlebenszyklus: 12 Fälle bestanden");

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

// Bundle the real editor; only the unavailable Obsidian host/DOM is substituted.
const requireFromProject = createRequire(`${process.cwd()}/package.json`);
const { buildSync } = requireFromProject("esbuild");
const code = buildSync({ entryPoints: ["src/main.ts"], bundle: true, platform: "node", format: "cjs", external: ["obsidian"], write: false }).outputFiles[0].text;
const noop = () => {};
class NodeStub {
  style: any = { setProperty(name: string, value: string) { this[name] = value; } };
  dataset: any = {}; children: NodeStub[] = []; captured = new Set<number>(); drawn = false;
  private w = 0; private h = 0;
  get width() { return this.w; } set width(v) { this.w = v; this.drawn = false; }
  get height() { return this.h; } set height(v) { this.h = v; this.drawn = false; }
  clientWidth = 800; scrollTop = 0; scrollLeft = 0; strokes = 0;
  createDiv(options?: any) { return this.createEl("div", options); }
  createEl(_tag: string, options?: any) { const n = new NodeStub(); n.dataset.cls = typeof options === "string" ? options : options?.cls; this.children.push(n); return n; }
  append(n: NodeStub) { this.children.push(n); }
  empty() { this.children = []; }
  addClass = noop; removeClass = noop; toggleClass = noop; setText = noop; setAttribute = noop; addEventListener = noop;
  querySelector() { return null; }
  querySelectorAll(selector: string): NodeStub[] { return this.children.flatMap(n => [...(n.dataset.cls === selector.slice(1) ? [n] : []), ...n.querySelectorAll(selector)]); }
  getBoundingClientRect() { return { width: 500, height: 500, left: 0, top: 0 }; }
  setPointerCapture(id: number) { this.captured.add(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
  getContext() { return new Proxy({}, { get: (_t, name) => name === "measureText" ? () => ({ width: 10 }) : () => { if (name === "clearRect") this.strokes = 0; if (name === "stroke") this.strokes++; if (["stroke", "fill", "fillRect"].includes(String(name))) this.drawn = true; }, set: () => true }); }
}
const moduleStub = { exports: {} as any };
runInNewContext(code, {
  module: moduleStub, exports: moduleStub.exports,
  require: (name: string) => name === "obsidian" ? { MarkdownRenderChild: class {}, Plugin: class {}, PluginSettingTab: class {}, Notice: class {}, Modal: class {}, Setting: class {} } : requireFromProject(name),
  console, structuredClone, crypto: globalThis.crypto, setTimeout, clearTimeout,
  window: { devicePixelRatio: 1, setTimeout: () => 1, clearTimeout: noop },
  document: { createElement: () => new NodeStub(), documentElement: {} },
  getComputedStyle: () => ({ getPropertyValue: () => "#abc" }),
  requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
  ResizeObserver: class { observe = noop; disconnect = noop; }
});
const Editor = moduleStub.exports.InlineHandwritingEditor;
function stroke(id: string, points = [{ x: 100, y: 100, pressure: .5 }, { x: 200, y: 200, pressure: .5 }]) { return { type: "stroke", id, color: "#111", size: 2, points }; }
function fixture(elements = [stroke("a"), stroke("b")]) {
  const page = { id: "p1", width: 500, height: 500, paper: "blank", elements };
  const settings = { penColor: "#111", penSize: 2, circleLasso: true, scratchErase: true };
  const e: any = new Editor(new NodeStub(), { settings, registerEditor: noop }, {}, { version: 3, pages: [page], profile: {} }, false);
  e.editing = true; e.tool = "select"; e.wrapper = new NodeStub(); e.reticle = new NodeStub(); e.statusEl = new NodeStub(); e.pagesEl = new NodeStub();
  e.canvases.set(page.id, new NodeStub()); e.overlays.set(page.id, new NodeStub()); e.selectionOverlays.set(page.id, new NodeStub());
  return { e, page, canvas: e.canvases.get(page.id) as NodeStub };
}
function event(x: number, y: number, type = "pointerdown") { return { clientX: x, clientY: y, pointerId: 1, pointerType: "pen", button: 0, pressure: .5, timeStamp: 10, type, preventDefault: noop }; }
let passed = 0;
function test(name: string, fn: () => void) { try { fn(); passed++; console.log(`PASS ${name}`); } catch (error) { console.error(`FAIL ${name}`); throw error; } }

test("drag captures pointer, keeps committed data and replaces in order", () => {
  const { e, page, canvas } = fixture(); e.setSelection(["a"]);
  const before = JSON.stringify(page.elements);
  e.pointerDown(event(150, 150), page.id);
  assert.equal(canvas.hasPointerCapture(1), true);
  assert.equal(e.pointerPageId, page.id);
  e.pointerMove(event(170, 160, "pointermove"), page.id);
  assert.equal(JSON.stringify(page.elements), before);
  e.pointerUp(event(170, 160, "pointerup"), page.id);
  assert.equal(page.elements.map(x => x.id).join(","), "a,b");
  assert.equal(page.elements[0].points[0].x, 120);
  assert.equal(e.pointerPageId, null);
  assert.equal(canvas.hasPointerCapture(1), false);
  e.undo(); assert.equal(e.document.pages[0].elements[0].points[0].x, 100);
});
test("resize captures and previews without deleting committed elements", () => {
  const { e, page, canvas } = fixture(); e.setSelection(["a"]);
  const before = JSON.stringify(page.elements);
  e.pointerDown(event(200, 200), page.id);
  assert.equal(canvas.hasPointerCapture(1), true);
  assert.equal(e.pointerPageId, page.id);
  e.pointerMove(event(250, 250, "pointermove"), page.id);
  assert.equal(JSON.stringify(page.elements), before);
  e.pointerUp(event(250, 250, "pointerup"), page.id);
  assert.equal(page.elements.map(x => x.id).join(","), "a,b");
  assert.equal(page.elements[0].points[1].x, 250);
  assert.equal(e.pointerPageId, null);
});
test("cancel rolls back a preview and releases all transient state", () => {
  for (const start of [150, 200]) {
    const { e, page, canvas } = fixture(); e.setSelection(["a"]);
    const before = JSON.stringify(page.elements);
    e.pointerDown(event(start, start), page.id);
    e.pointerMove(event(250, 250, "pointermove"), page.id);
    e.pointerUp(event(260, 260, "pointercancel"), page.id);
    assert.equal(JSON.stringify(page.elements), before);
    assert.equal(e.pointerPageId, null);
    assert.equal(e.currentElementId, null);
    assert.equal(e.dragSnapshot.length + e.resizeSnapshot.length, 0);
    assert.equal(e.history.length, 0);
    assert.equal(canvas.hasPointerCapture(1), false);
  }
});
function drawGesture(e: any, page: any, points: any[]) {
  e.tool = "pen"; e.pointerDown(event(points[0].x, points[0].y), page.id);
  for (const p of points.slice(1)) e.pointerMove(event(p.x, p.y, "pointermove"), page.id);
  const last = points[points.length - 1]; e.pointerUp(event(last.x, last.y, "pointerup"), page.id);
}
function circle() { return Array.from({ length: 65 }, (_, i) => ({ x: 250 + 180 * Math.cos(i * Math.PI / 32), y: 250 + 180 * Math.sin(i * Math.PI / 32) })); }
test("empty circle stays ink rather than selecting itself", () => {
  const { e, page } = fixture([]); drawGesture(e, page, circle());
  assert.equal(page.elements.length, 1);
  assert.equal(e.tool, "pen"); assert.equal(e.selectionIds.size, 0);
  assert.equal(e.history.length, 1); assert.equal(e.pointerPageId, null);
});
test("accepted lasso excludes gesture and resumes save and undo", () => {
  const { e, page } = fixture([stroke("target", [{ x: 230, y: 230, pressure: .5 }, { x: 270, y: 270, pressure: .5 }])]);
  e.remember(); e.markChanged();
  drawGesture(e, page, circle());
  assert.equal([...e.selectionIds].join(","), "target");
  assert.equal(page.elements.map(x => x.id).join(","), "target");
  assert.equal(e.currentElementId, null); assert.equal(e.currentRawPoints.length, 0); assert.equal(e.pointerPageId, null);
  let saves = 0; e.saveQueue.enqueue = () => saves++; e.saveNow(); assert.equal(saves, 1);
  const history = e.history.length; e.undo(); assert.equal(e.history.length, history - 1);
});
test("scratch with no real target persists as ordinary ink", () => {
  const { e, page } = fixture([]);
  drawGesture(e, page, Array.from({ length: 14 }, (_, i) => ({ x: i % 2 ? 170 : 100, y: 100 + i * 3 })));
  assert.equal(page.elements.length, 1); assert.equal(e.history.length, 1);
  assert.equal(e.pointerPageId, null);
});
test("scratch removes target and gesture explicitly, with one undo", () => {
  const { e, page } = fixture([stroke("target", [{ x: 130, y: 90, pressure: .5 }, { x: 130, y: 150, pressure: .5 }])]);
  drawGesture(e, page, Array.from({ length: 14 }, (_, i) => ({ x: i % 2 ? 170 : 100, y: 100 + i * 3 })));
  assert.equal(page.elements.length, 0); assert.equal(e.history.length, 1); assert.equal(e.pointerPageId, null);
  let saves = 0; e.saveQueue.enqueue = () => saves++; e.saveNow(); assert.equal(saves, 1);
  e.undo(); assert.equal(e.document.pages[0].elements.map((x: any) => x.id).join(","), "target");
});
test("selection frame and hit testing belong only to their page", () => {
  const { e, page } = fixture();
  const second = { ...structuredClone(page), id: "p2" }; e.document.pages.push(second);
  e.canvases.set(second.id, new NodeStub()); e.selectionOverlays.set(second.id, new NodeStub());
  e.setSelection(["a"]);
  let frames = 0; const draw = e.drawSelectionFrame.bind(e); e.drawSelectionFrame = (...args: any[]) => { frames++; draw(...args); };
  e.drawSelectionOverlay(second.id); assert.equal(frames, 0);
  e.pointerDown(event(150, 150), second.id);
  assert.equal(e.activePageId, second.id); assert.equal(e.dragSnapshot.length, 0); assert.equal(e.resizeSnapshot.length, 0);
  e.setActivePage(page.id); assert.equal(e.selectionIds.size, 0); assert.equal(e.selectionBox, null);
});
test("thumbnail bitmap survives insertion into page strip", () => {
  const { e } = fixture(); e.pageStrip = new NodeStub(); e.rebuildPageStrip();
  const thumbnail = e.pageStrip.children[0].children[0];
  assert.equal(thumbnail.width, 120); assert.equal(thumbnail.height, 120);
  assert.equal(thumbnail.drawn, true);
});
test("zoom changes layout width and survives multi-page rebuild", () => {
  const { e, page } = fixture(); e.document.pages.push({ ...structuredClone(page), id: "p2" });
  e.rebuildPages(); e.pagesEl.scrollTop = 100; e.pagesEl.scrollLeft = 50;
  e.setZoom(2);
  for (const frame of e.pagesEl.querySelectorAll(".hp-page")) {
    assert.equal(frame.style["--hp-page-width"], "1004px");
    assert.ok(!frame.style.transform);
  }
  assert.ok(e.pagesEl.scrollTop > 100); assert.ok(e.pagesEl.scrollLeft > 50);
  e.rebuildPages();
  for (const frame of e.pagesEl.querySelectorAll(".hp-page")) assert.equal(frame.style["--hp-page-width"], "1004px");
  e.setZoom(99); assert.equal(e.zoom, 4); e.setZoom(.01); assert.equal(e.zoom, .35);
});
test("lost capture cancels without leaving save/undo locked", () => {
  const { e, page, canvas } = fixture(); e.setSelection(["a"]); const before = JSON.stringify(page.elements);
  e.pointerDown(event(150, 150), page.id); e.pointerMove(event(180, 180, "pointermove"), page.id);
  canvas.releasePointerCapture(1); e.pointerUp(event(180, 180, "lostpointercapture"), page.id);
  assert.equal(e.pointerPageId, null); assert.equal(e.dragSnapshot.length, 0); assert.equal(JSON.stringify(page.elements), before);
});
test("touch selection captures and releases its tap lifecycle", () => {
  const { e, page, canvas } = fixture();
  e.pointerDown({ ...event(100, 100), pointerType: "touch" }, page.id);
  assert.equal(canvas.hasPointerCapture(1), true);
  e.pointerUp({ ...event(100, 100, "pointerup"), pointerType: "touch" }, page.id);
  assert.equal(e.selectionIds.size, 1); assert.equal(e.touchSelectDown, null); assert.equal(e.pointerPageId, null);
});
test("preview paints only unselected committed ink beneath the ghost", () => {
  const { e, page, canvas } = fixture(); e.setSelection(["a"]);
  e.pointerDown(event(150, 150), page.id); e.pointerMove(event(180, 180, "pointermove"), page.id);
  assert.equal(canvas.strokes, 1); assert.equal(page.elements.length, 2);
});
test("ordinary pen-up keeps the incremental append fast path", () => {
  const { e, page } = fixture(); let redraws = 0;
  const redraw = e.redrawPage.bind(e); e.redrawPage = (...args: any[]) => { redraws++; redraw(...args); };
  drawGesture(e, page, [{ x: 10, y: 10 }, { x: 20, y: 20 }]);
  assert.equal(redraws, 0); assert.equal(e.pointerPageId, null);
});
console.log(`editor-phase4: ${passed} tests passed`);

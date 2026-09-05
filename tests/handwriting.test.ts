import assert from "node:assert/strict";
import { createDocument, parseDocument, StrokeElement } from "../src/document";
import { applyReconstructions, decodeCtc, planReconstructions, reconstructLine, restoreReconstructions, segmentInkLines } from "../src/htr-core";
import { constructGeometry, aimConstruction } from "../src/geometry-tools";
import { normalizeHandwritingWord } from "../src/handwriting-normalizer";
import { drawText } from "../src/rendering";
import { browserWorkerSource } from "../src/htr-client";
import { runInNewContext } from "node:vm";

const make = (id: string, x: number, y: number, height = 35): StrokeElement => ({ type: "stroke", id, color: "#111", size: 3, points: [{ x, y, pressure: .5 }, { x: x + 10, y: y + height, pressure: .7 }] });
const document = createDocument("grid"); const page = document.pages[0];
page.elements = [make("b", 60, 100), make("a", 20, 100), make("c", 20, 200), make("dot", 23, 90, 2)];
const original = structuredClone(page.elements);
const lines = segmentInkLines(page.elements as StrokeElement[]);
assert.equal(lines.length, 2); assert.equal(lines[0].strokes.length, 3, "detached dot joins first line");
const reconstructed = lines.map((line, i) => reconstructLine(page, line, ["Hallo", "Welt"][i]));
applyReconstructions(page, reconstructed); assert.equal(page.elements.length, 2);
const reload = parseDocument(JSON.parse(JSON.stringify(document)))!.document.pages[0];
assert.equal(restoreReconstructions(reload), 4); assert.deepEqual(reload.elements, original, "original order and coordinates survive save/reload");
assert.equal(restoreReconstructions(reload), 0, "restore idempotent");
assert.throws(() => reconstructLine(page, lines[0], "stale"), /geändert/);
const classes = [1, 1, 0, 1, 2, 2, 0]; const logits = classes.flatMap(c => [0, 1, 2].map(k => c === k ? 10 : -10));
assert.equal(decodeCtc(logits, [1, 7, 3], "ab"), "aab");
assert.throws(() => decodeCtc(logits, [1, 7, 4], "ab"), /Alphabet/);
const base = { x: 300, y: 400, length: 100, angle: 30, sweep: 360, edge: 0 as const };
const aimedCircle = aimConstruction(base, 360, 480, "compass");
assert.equal(aimedCircle.length, 100);
assert.equal(aimedCircle.x, 300); assert.equal(aimedCircle.y, 400);
assert.equal(base.angle, 30, "aiming must not mutate its input");
for (const edge of [0, 45, 135] as const) {
  const aimed = aimConstruction({ ...base, edge }, 360, 480, "set-square");
  const result = constructGeometry("set-square", aimed, "#111", 3);
  assert.ok(Math.abs(result.points[1].x - 360) < 1e-9);
  assert.ok(Math.abs(result.points[1].y - 480) < 1e-9);
}
assert.equal(aimConstruction(base, 300, 400, "compass"), base, "anchor click retains valid radius");
assert.equal(aimConstruction(base, NaN, 400, "compass"), base);
assert.equal(aimConstruction(base, 9000, 400, "compass").length, 4000);
const line = constructGeometry("set-square", base, "#111", 3);
assert.ok(Math.abs(Math.hypot(line.points[1].x - 300, line.points[1].y - 400) - 100) < 1e-9);
assert.ok(Math.abs(line.points[1].y - 450) < 1e-9);
const circle = constructGeometry("compass", base, "#111", 3);
assert.equal(circle.kind, "ellipse"); assert.equal(circle.points[1].x - circle.points[0].x, 200);
const arc = constructGeometry("compass", { ...base, sweep: 120 }, "#111", 3);
assert.equal(arc.closed, false);
for (const p of arc.points) assert.ok(Math.abs(Math.hypot(p.x - 300, p.y - 400) - 100) < 1e-8);
assert.throws(() => constructGeometry("compass", { ...base, length: NaN }, "#111", 3));
page.format = "square"; page.width = 1200; page.height = 1200;
assert.equal(parseDocument(JSON.parse(JSON.stringify(document)))!.document.pages[0].height, 1200);
console.log("Handwriting reconstruction and construction tests passed");

const largePage = createDocument("grid").pages[0];
largePage.elements = [make("large", 30, 100, 120)];
const largeLine = segmentInkLines(largePage.elements as StrokeElement[])[0];
const largeText = reconstructLine(largePage, largeLine, "Große Handschrift");
assert.ok(largeText.fontSize > 150, "large handwriting is not capped at 80 px");
const wrapped = reconstructLine(largePage, largeLine, "Lange Wörter bleiben lesbar und werden umgebrochen", 1, s => s.length * 80);
assert.ok(wrapped.text.includes("\n"));
assert.equal(wrapped.fontSize, largeText.fontSize, "wrapping does not reduce glyph size");
assert.ok(wrapped.height! > wrapped.fontSize * 2);
for (const paper of ["grid", "lines", "blank"] as const) {
  const original = [make("one", 40, 20, 180), make("two", 90, 25, 175)];
  const result = normalizeHandwritingWord(original, {targetHeight: 17, samples: 100, averageSlope: .2}, paper);
  for (let i = 0; i < original.length; i++) for (let p = 0; p < original[i].points.length; p++) {
    assert.equal(result.strokes[i].points[p].x, original[i].points[p].x);
    assert.ok(Math.abs(result.strokes[i].points[p].y - original[i].points[p].y) <= 2);
  }
}
const paints: unknown[][] = [];
const ctx = {save() {}, restore() {}, measureText: (s: string) => ({width:s.length * 10}), fillText: (...args: unknown[]) => paints.push(args)} as unknown as CanvasRenderingContext2D;
drawText(ctx, {...largeText, text: "eins zwei drei vier", width: 95});
assert.ok(paints.length > 1);
assert.ok(paints.every(args => args.length === 3), "never use Canvas maxWidth: it compresses glyphs");
console.log("No-squeeze regression tests passed");

const crowded = createDocument("blank").pages[0];
crowded.elements = [make("source", 30, 100, 80), make("keep", 30, 210, 35)];
const source = segmentInkLines([crowded.elements[0] as StrokeElement])[0];
const proposal = reconstructLine(crowded, source, "Lesbar");
const beforePlan = JSON.stringify(crowded);
const placements = planReconstructions(crowded, [proposal]);
assert.equal(JSON.stringify(crowded), beforePlan, "planning never mutates the page");
assert.ok(placements[0].baseline - placements[0].fontSize >= 253, "large text moves below untouched ink");
applyReconstructions(crowded, placements);
assert.equal(crowded.elements[0].id, "keep");
assert.equal(restoreReconstructions(crowded), 1);
assert.equal(JSON.stringify(crowded), beforePlan, "reflow still restores exact source and layer ordering");
const noRoom = {...crowded, height: 270};
const noRoomBefore = JSON.stringify(noRoom);
assert.throws(() => applyReconstructions(noRoom, [proposal]), /mehr Platz/);
assert.equal(JSON.stringify(noRoom), noRoomBefore, "failed placement is atomic");
assert.throws(() => planReconstructions(crowded, [proposal, proposal]), /mehrfach/);
crowded.elements[0].locked = true;
assert.throws(() => applyReconstructions(crowded, [proposal]), /geändert/);
console.log("Handwriting placement and atomicity tests passed");

const electronWorker = { process: {versions:{node:"22"}}, result:"" };
runInNewContext(browserWorkerSource('globalThis.result = typeof globalThis.process;'), electronWorker);
assert.equal(electronWorker.result, "undefined", "Electron worker must select the browser/WASM runtime");
const browserWorker = {result:""};
runInNewContext(browserWorkerSource('globalThis.result = typeof globalThis.process;'), browserWorker);
assert.equal(browserWorker.result, "undefined", "regular browser workers stay supported");
assert.ok(process.versions.node, "host Node process must not be modified");
console.log("Electron worker isolation tests passed");

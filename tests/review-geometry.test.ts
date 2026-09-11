import assert from "node:assert/strict";
import test from "node:test";
import { StrokeElement, elementBounds } from "../src/document";
import { HandwritingV2Options, normalizeHandwritingV2, smoothInkLines } from "../src/handwriting-v2";
import { optimizeShape } from "../src/shapes";

const options: HandwritingV2Options = {
  height: 16, strength: 0, pageWidth: 1200, pageHeight: 1697, paper: "grid",
  equalize: true, smooth: true, closeLoops: false,
  spacing: .8, baseline: 900, startX: 800, lockRows: true, rowStep: 72
};
const stroke = (id: string, xy: number[][]): StrokeElement => ({
  type: "stroke", id, color: "#111", size: 3,
  points: xy.map(([x, y], i) => ({ x, y, pressure: .2 + i / (xy.length * 2), time: i * 8 }))
});
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const circle = () => stroke("circle", Array.from({ length: 25 }, (_, i) => {
  const angle = i * Math.PI * 2 / 24;
  return [300 + 30 * Math.cos(angle), 300 + 30 * Math.sin(angle)];
}));

test("combined equalization/height/smoothing caps the final height against original ink", () => {
  for (const heights of [[100, 20, 20], [20, 100, 100], [10, 20, 20]]) {
    for (const height of [16, 96]) {
      const source = heights.map((h, i) => stroke(`stem-${i}`, Array.from({ length: 9 }, (_, j) => [100 + i * 30, 200 - h + h * j / 8])));
      const snapshot = structuredClone(source);
      const result = normalizeHandwritingV2(source, { ...options, height });
      const ys = result.strokes.flatMap(s => s.points.map(p => p.y));
      const originalHeight = Math.max(...heights);
      const ratio = (Math.max(...ys) - Math.min(...ys)) / originalHeight;
      assert.ok(ratio >= .75 - 1e-9 && ratio <= 1.35 + 1e-9, `final height ratio ${ratio} outside original cap`);
      close(Math.max(...ys), 200);
      assert.equal(result.baseline, 200);
      assert.equal(result.endX, 160);
      assert.deepEqual(source, snapshot, "input must not mutate");
      result.strokes.forEach((s, i) => {
        assert.deepEqual(s.points.map(p => p.x), source[i].points.map(p => p.x));
        assert.deepEqual(s.rawPoints, source[i].points);
        assert.deepEqual(s.points.map(p => [p.pressure, p.time]), source[i].points.map(p => [p.pressure, p.time]));
      });
      const again = normalizeHandwritingV2(result.strokes, { ...options, height: 96, strength: 1 });
      assert.deepEqual(again.strokes, result.strokes, "once-only survives changed settings");
    }
  }
});

test("line smoothing preserves captured extrema and bottom both alone and in the pipeline", () => {
  const source = circle(), snapshot = structuredClone(source);
  const original = elementBounds(source);
  const points = smoothInkLines(source.points);
  assert.deepEqual(elementBounds({ ...source, points }), original, "smoothing must preserve the complete envelope");
  assert.ok(points.some((p, i) => p.x !== source.points[i].x || p.y !== source.points[i].y), "smoothing still does work");
  const result = normalizeHandwritingV2([source], { ...options, height: 60, equalize: false });
  assert.deepEqual(elementBounds(result.strokes[0]), original);
  assert.deepEqual(source, snapshot);
  assert.deepEqual(result.strokes[0].rawPoints, source.points);
  assert.deepEqual(points.map(p => [p.pressure, p.time]), source.points.map(p => [p.pressure, p.time]));
});

function densePolygon(vertices: number[][]): StrokeElement {
  const xy = vertices.flatMap((a, i) => {
    const b = vertices[(i + 1) % vertices.length];
    return Array.from({ length: 25 }, (_, j) => [a[0] + (b[0] - a[0]) * j / 25, a[1] + (b[1] - a[1]) * j / 25]);
  });
  return stroke("polygon", [...xy, vertices[0]]);
}

test("held right triangles remain polygons rather than acquiring a fourth corner", () => {
  const source = densePolygon([[100, 100], [200, 100], [200, 200]]);
  const snapshot = structuredClone(source);
  const result = optimizeShape(source, .7, true);
  assert.equal(result.kind, "polygon");
  assert.deepEqual(result.stroke.points.map(p => [p.x, p.y]), [[100, 100], [200, 100], [200, 200], [100, 100]]);
  assert.deepEqual(source, snapshot);
  for (const force of [false, true]) {
    assert.equal(optimizeShape(densePolygon([[100, 100], [200, 100], [200, 200], [100, 200]]), .7, force).kind, "rectangle");
    assert.equal(optimizeShape(circle(), .7, force).kind, "ellipse");
  }
});

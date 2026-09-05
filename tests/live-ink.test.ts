import assert from "node:assert/strict";
import { drawLiveInk } from "../src/live-ink";
import { InkStroke } from "../src/strokes";

const segments: number[][] = [];
let start: number[] = [];
const context = {
  save() {}, restore() {}, beginPath() {}, stroke() {},
  moveTo(x: number, y: number) { start = [x, y]; },
  lineTo(x: number, y: number) { segments.push([...start, x, y]); }
} as unknown as CanvasRenderingContext2D;
const stroke: InkStroke = { id: "long", color: "#111", size: 4, points: Array.from({ length: 50000 }, (_, i) => ({ x: i, y: i % 100, pressure: .5 })) };
drawLiveInk(context, stroke, 49999);
assert.equal(segments.length, 1, "one new point must draw one segment regardless of stroke length");
assert.deepEqual(segments[0], [49998, 98, 49999, 99]);
segments.length = 0;
drawLiveInk(context, stroke, 49997);
assert.equal(segments.length, 3, "all coalesced samples are painted exactly once");
segments.length = 0;
drawLiveInk(context, stroke, stroke.points.length);
assert.equal(segments.length, 0, "no new samples must not revisit old ink");
assert.equal(stroke.points.length, 50000, "rendering preserves captured input");
console.log("Incremental live ink tests passed");

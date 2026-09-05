import { InkStroke, pressureWidth, visibleInkColor } from "./strokes";

/** Append only newly captured segments; never revisit earlier ink during pen movement. */
export function drawLiveInk(context: CanvasRenderingContext2D, stroke: InkStroke, firstNewPoint: number): void {
  context.save();
  context.strokeStyle = visibleInkColor(stroke.color);
  context.lineCap = "round"; context.lineJoin = "round";
  for (let i = Math.max(1, firstNewPoint); i < stroke.points.length; i++) {
    const a = stroke.points[i - 1], b = stroke.points[i];
    context.lineWidth = (pressureWidth(stroke, a) + pressureWidth(stroke, b)) / 2;
    context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
  }
  context.restore();
}

import { ShapeElement } from "./document";
import { InkPoint } from "./strokes";

export interface Construction { x: number; y: number; angle: number; length: number; sweep: number; edge: 0 | 45 | 135 }
/** Keep the anchor fixed while positioning the compass arm or selected ruler edge. */
export function aimConstruction(c: Construction, x: number, y: number, kind: "set-square" | "compass"): Construction {
  if (![x, y, c.x, c.y].every(Number.isFinite)) return c;
  const length = Math.hypot(x - c.x, y - c.y);
  if (length < 1) return c;
  const angle = Math.atan2(y - c.y, x - c.x) * 180 / Math.PI - (kind === "set-square" ? c.edge : 0);
  return { ...c, length: Math.min(4000, length), angle };
}
const point = (x: number, y: number): InkPoint => ({ x, y, pressure: 0.5 });
export function constructGeometry(kind: "set-square" | "compass", c: Construction, color: string, size: number): ShapeElement {
  if (![c.x, c.y, c.angle, c.length, c.sweep].every(Number.isFinite) || c.length <= 0 || c.length > 4000 || c.sweep <= 0 || c.sweep > 360 || ![0, 45, 135].includes(c.edge)) throw new Error("Ungültige Konstruktionsmaße");
  const radians = c.angle * Math.PI / 180;
  const points: InkPoint[] = [];
  if (kind === "set-square") {
    const theta = radians + c.edge * Math.PI / 180;
    points.push(point(c.x, c.y), point(c.x + Math.cos(theta) * c.length, c.y + Math.sin(theta) * c.length));
  } else if (c.sweep === 360) {
    points.push(point(c.x - c.length, c.y - c.length), point(c.x + c.length, c.y + c.length));
  } else {
    // Circle samples have <= 0.2 px sagitta error; no distorted ellipse fitting.
    const count = Math.max(2, Math.ceil(c.sweep * Math.PI / 180 / (2 * Math.acos(1 - Math.min(0.2 / c.length, 1)))));
    for (let i = 0; i <= count; i++) { const a = radians + i / count * c.sweep * Math.PI / 180; points.push(point(c.x + Math.cos(a) * c.length, c.y + Math.sin(a) * c.length)); }
  }
  return { type: "shape", id: crypto.randomUUID(), kind: kind === "set-square" ? "line" : c.sweep === 360 ? "ellipse" : "polygon", points, color, size,
    closed: kind === "compass" && c.sweep === 360, fillOpacity: 0,
    name: kind === "set-square" ? `Geodreieck: ${c.angle + c.edge}°, ${c.length} px` : `Zirkel: r=${c.length} px, ${c.sweep}°` };
}

export function drawSetSquare(ctx: CanvasRenderingContext2D, c: Construction): void {
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle * Math.PI / 180);
  // The selected 45°/135° edge starts at the construction origin, not inside the tool.
  if (c.edge === 45) ctx.translate(220, 0);
  if (c.edge === 135) ctx.translate(-220, 0);
  ctx.fillStyle = "rgba(61,154,164,.14)"; ctx.strokeStyle = "#137b89"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-220, 0); ctx.lineTo(220, 0); ctx.lineTo(0, 220); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.font = "12px sans-serif"; ctx.fillStyle = "#155862";
  for (let x = -200; x <= 200; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, x % 50 === 0 ? 18 : 8); ctx.stroke(); if (x % 50 === 0) ctx.fillText(String(Math.abs(x)), x - 7, 32); }
  ctx.beginPath(); ctx.arc(0, 0, 120, 0, Math.PI); ctx.stroke();
  for (let degree = 0; degree <= 180; degree += 10) {
    const a = degree * Math.PI / 180; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 110, Math.sin(a) * 110); ctx.lineTo(Math.cos(a) * 120, Math.sin(a) * 120); ctx.stroke();
    if (degree % 30 === 0) ctx.fillText(String(degree), Math.cos(a) * 92 - 8, Math.sin(a) * 92);
  }
  ctx.restore();
}

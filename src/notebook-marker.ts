import { HandwritingPage, HighlightElement } from "./document";
import { textFontFamilies, wrapTextLines } from "./rendering";

export function drawNotebookMarker(context: CanvasRenderingContext2D, marker: HighlightElement): void {
  const points = marker.points?.length ? marker.points : [{ x: marker.x1, y: marker.y }, { x: marker.x2, y: marker.y }];
  context.save(); context.strokeStyle = marker.color; context.globalAlpha = marker.opacity;
  context.lineWidth = marker.size; context.lineCap = "round"; context.lineJoin = "round";
  context.beginPath(); context.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  if (points.length === 1) context.lineTo(points[0].x + .01, points[0].y);
  context.stroke(); context.restore();
}

/** Snap only to actual typeset words, never infer text from arbitrary pen strokes. */
export function snapMarkerToText(page: HandwritingPage, marker: HighlightElement, context: CanvasRenderingContext2D): HighlightElement[] {
  const gesture = marker.points ?? [];
  if (!gesture.length) return [marker];
  const hits: HighlightElement[] = [];
  context.save();
  for (const text of page.elements) {
    if (text.type !== "text" || text.table) continue;
    context.font = `${text.fontStyle ?? "normal"} ${text.fontWeight ?? 400} ${text.fontSize}px ${textFontFamilies[text.fontFamily ?? "sans"]}`;
    const lines = wrapTextLines(text.text, text.width, text.blockStyle, s => context.measureText(s).width);
    lines.forEach((line, row) => {
      const baseline = text.baseline + row * text.fontSize * 1.25;
      const lineWidth = context.measureText(line).width;
      let x = text.x + (text.textAlign === "center" ? (text.width - lineWidth) / 2 : text.textAlign === "right" ? text.width - lineWidth : 0);
      let left = Infinity, right = -Infinity;
      for (const token of line.match(/\S+\s*|\s+/g) ?? []) {
        const width = context.measureText(token).width;
        if (token.trim() && gesture.some(point => point.x >= x - 3 && point.x <= x + width + 3 && point.y >= baseline - text.fontSize && point.y <= baseline + text.fontSize * .2)) {
          left = Math.min(left, x); right = Math.max(right, x + context.measureText(token.trimEnd()).width);
        }
        x += width;
      }
      if (right > left) hits.push({ ...marker, id: hits.length ? crypto.randomUUID() : marker.id, x1: left, x2: right, y: baseline - text.fontSize * .35, size: text.fontSize * .9, points: undefined });
    });
  }
  context.restore();
  return hits.length ? hits : [marker];
}

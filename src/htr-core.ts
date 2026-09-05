import { elementBounds, HandwritingPage, StrokeElement, TextElement } from "./document";

export const HTR_MODEL = "naeyn/de-htr-web-v2@6241c1ff";
export interface InkLine { strokes: StrokeElement[]; minX: number; minY: number; maxX: number; maxY: number }

/** Spatial grouping, independent of capture order (including late dots and crossbars). */
export function segmentInkLines(strokes: StrokeElement[]): InkLine[] {
  const candidates = strokes.filter(s => !s.locked && s.points.length > 0 && s.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
    .map(s => ({ stroke: s, ...elementBounds(s) }));
  const lines: InkLine[] = [];
  for (const s of candidates.sort((a, b) => (b.maxY - b.minY) - (a.maxY - a.minY))) {
    const height = s.maxY - s.minY;
    const nearest = lines.filter(l => {
      const h = l.maxY - l.minY;
      const overlap = Math.min(s.maxY, l.maxY) - Math.max(s.minY, l.minY);
      const horizontalGap = Math.max(l.minX - s.maxX, s.minX - l.maxX, 0);
      return horizontalGap < Math.max(160, h * 5) && (overlap > Math.min(height, h) * 0.35 ||
        (height < h * 0.35 && Math.abs(s.maxY - l.minY) < h * 0.35));
    }).sort((a, b) => Math.abs((a.minY + a.maxY) - (s.minY + s.maxY)) - Math.abs((b.minY + b.maxY) - (s.minY + s.maxY)))[0];
    if (nearest) {
      nearest.strokes.push(s.stroke); nearest.minX = Math.min(nearest.minX, s.minX); nearest.minY = Math.min(nearest.minY, s.minY);
      nearest.maxX = Math.max(nearest.maxX, s.maxX); nearest.maxY = Math.max(nearest.maxY, s.maxY);
    } else lines.push({ strokes: [s.stroke], minX: s.minX, minY: s.minY, maxX: s.maxX, maxY: s.maxY });
  }
  return lines.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
}

/** CTC class zero is blank, alphabet indexes begin at one. Blank resets repetition. */
export function decodeCtc(logits: ArrayLike<number>, dims: readonly number[], alphabet: string): string {
  const chars = Array.from(alphabet);
  if (dims.length !== 3 || dims[0] !== 1 || dims[2] !== chars.length + 1 || logits.length !== dims[1] * dims[2]) throw new Error("HTR-Modell und Alphabet passen nicht zusammen");
  let text = ""; let previous = -1;
  for (let t = 0; t < dims[1]; t++) {
    let best = 0;
    for (let c = 1; c < dims[2]; c++) if (logits[t * dims[2] + c] > logits[t * dims[2] + best]) best = c;
    if (best !== 0 && best !== previous) text += chars[best - 1];
    previous = best;
  }
  return text.trim();
}

export function reconstructLine(page: HandwritingPage, line: InkLine, text: string): TextElement {
  if (!text.trim() || text.length > 500) throw new Error("Bitte 1–500 Zeichen pro Zeile bestätigen");
  if (!line.strokes.every(s => page.elements.some(e => e.id === s.id && JSON.stringify(e) === JSON.stringify(s)))) throw new Error("Die Handschrift hat sich geändert. Bitte neu erkennen.");
  const originals = structuredClone(line.strokes);
  const fontSize = Math.max(22, Math.min(80, (line.maxY - line.minY) * 1.35));
  return {
    type: "text", id: crypto.randomUUID(), x: line.minX, baseline: line.minY + fontSize * 0.8,
    width: Math.max(20, page.width - line.minX - 16), fontSize, color: line.strokes[0].color,
    fontFamily: "handwriting", text: text.trim(),
    reconstruction: { model: HTR_MODEL, originalStrokes: originals, originalIndices: originals.map(s => page.elements.findIndex(e => e.id === s.id)), confirmedAt: new Date().toISOString() }
  };
}

export function applyReconstructions(page: HandwritingPage, replacements: TextElement[]): void {
  const remove = new Set(replacements.flatMap(r => r.reconstruction?.originalStrokes.map(s => s.id) ?? []));
  page.elements = page.elements.filter(e => !remove.has(e.id));
  page.elements.push(...replacements);
}

export function restoreReconstructions(page: HandwritingPage): number {
  const restored: Array<{ index: number; stroke: StrokeElement }> = [];
  page.elements = page.elements.filter(e => {
    if (e.type !== "text" || !e.reconstruction || e.locked) return true;
    e.reconstruction.originalStrokes.forEach((stroke, i) => restored.push({ index: e.reconstruction!.originalIndices[i], stroke: structuredClone(stroke) }));
    return false;
  });
  for (const { index, stroke } of restored.sort((a, b) => a.index - b.index)) {
    if (!page.elements.some(e => e.id === stroke.id)) page.elements.splice(Math.min(index, page.elements.length), 0, stroke);
  }
  return restored.length;
}

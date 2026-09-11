import { elementBounds, HandwritingPage, StrokeElement, TextElement } from "./document";
import { TEXT_LINE_HEIGHT } from "./rendering";

export const HTR_MODEL = "naeyn/de-htr-web-v2@6241c1ff";
export interface InkLine { strokes: StrokeElement[]; minX: number; minY: number; maxX: number; maxY: number }

/** Explicit user regrouping, not an automatic guess about different writing rows. */
export function joinInkLines(lines: InkLine[]): InkLine {
  if (lines.length < 2) throw new Error("Mindestens zwei Gruppen auswählen.");
  const strokes = lines.flatMap(line => line.strokes);
  if (new Set(strokes.map(s => s.id)).size !== strokes.length) throw new Error("Ein Strich gehört zu mehreren Gruppen.");
  return { strokes: structuredClone(strokes), minX: Math.min(...lines.map(l => l.minX)), minY: Math.min(...lines.map(l => l.minY)), maxX: Math.max(...lines.map(l => l.maxX)), maxY: Math.max(...lines.map(l => l.maxY)) };
}

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

export function decodeCtcConfidence(logits: ArrayLike<number>, dims: readonly number[], alphabet: string): { text: string; confidence: number } {
  const text=decodeCtc(logits,dims,alphabet);
  let previous=-1, total=0, count=0;
  for(let t=0;t<dims[1];t++) {
    const offset=t*dims[2]; let best=0;
    for(let c=1;c<dims[2];c++) if(logits[offset+c]>logits[offset+best]) best=c;
    if(best!==0 && best!==previous) {
      const peak=logits[offset+best]; let denominator=0;
      for(let c=0;c<dims[2];c++) denominator+=Math.exp(logits[offset+c]-peak);
      total+=Math.log(1/denominator); count++;
    }
    previous=best;
  }
  return {text,confidence:count ? Math.exp(total/count) : 0};
}

export function reconstructLine(page: HandwritingPage, line: InkLine, text: string, sizeScale = 1, measure?: (text: string, fontSize: number) => number, targetFontSize?: number): TextElement {
  if (!text.trim() || text.length > 500) throw new Error("Bitte 1–500 Zeichen pro Zeile bestätigen");
  if (!line.strokes.every(s => page.elements.some(e => e.id === s.id && JSON.stringify(e) === JSON.stringify(s)))) throw new Error("Die Handschrift hat sich geändert. Bitte neu erkennen.");
  const originals = structuredClone(line.strokes);
  if (!Number.isFinite(sizeScale) || sizeScale < 0.75 || sizeScale > 1.75) throw new Error("Ungültige Schriftgröße");
  if (targetFontSize !== undefined && (!Number.isFinite(targetFontSize) || targetFontSize < 16 || targetFontSize > 256)) throw new Error("Schriftgröße muss zwischen 16 und 256 px liegen");
  const fontSize = targetFontSize ?? Math.max(22, (line.maxY - line.minY) * 1.35) * sizeScale;
  const width = page.width - line.minX - 16;
  const fits = measure ?? ((value: string, size: number) => Array.from(value).length * size * 0.55);
  const lines: string[] = [];
  for (const paragraph of text.trim().split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (fits(candidate, fontSize) <= width) { current = candidate; continue; }
      if (current) { lines.push(current); current = ""; }
      for (const character of Array.from(word)) {
        if (fits(character, fontSize) > width) throw new Error("Am Seitenrand fehlt Platz. Bitte die Handschrift weiter links platzieren.");
        if (current && fits(current + character, fontSize) > width) { lines.push(current); current = ""; }
        current += character;
      }
    }
    lines.push(current);
  }
  const baseline = line.minY + fontSize * 0.8;
  const height = fontSize * TEXT_LINE_HEIGHT * lines.length;
  if (baseline - fontSize + height > page.height - 8) throw new Error("Für lesbare Schrift fehlt unten Platz. Bitte eine neue Seite verwenden oder die Größe selbst anpassen.");
  return {
    type: "text", id: crypto.randomUUID(), x: line.minX, baseline,
    width, height, fontSize, color: line.strokes[0].color,
    fontFamily: "handwriting", text: lines.join("\n"),
    reconstruction: { model: HTR_MODEL, originalStrokes: originals, originalIndices: originals.map(s => page.elements.findIndex(e => e.id === s.id)), confirmedAt: new Date().toISOString() }
  };
}

/** Place larger reconstructed lines without resizing glyphs or moving existing work. */
export function planReconstructions(page: HandwritingPage, replacements: TextElement[]): TextElement[] {
  const remove = new Set<string>();
  for (const replacement of replacements) {
    if (!replacement.reconstruction?.originalStrokes.length) throw new Error("Originalstriche fehlen");
    for (const original of replacement.reconstruction.originalStrokes) {
      if (remove.has(original.id)) throw new Error("Ein Strich wurde mehrfach ausgewählt");
      const current = page.elements.find(e => e.id === original.id);
      if (!current || current.locked || JSON.stringify(current) !== JSON.stringify(original)) throw new Error("Die Handschrift hat sich geändert. Bitte neu erkennen.");
      remove.add(original.id);
    }
  }
  // Images and marker backgrounds are intentionally writable; text, ink and geometry are obstacles.
  const occupied = page.elements.filter(e => !remove.has(e.id) && e.type !== "image" && e.type !== "highlight").map(elementBounds);
  const placed: TextElement[] = [];
  for (const input of [...replacements].sort((a, b) => a.baseline - b.baseline || a.x - b.x)) {
    const text = structuredClone(input);
    let box = elementBounds(text);
    if (![box.minX, box.minY, box.maxX, box.maxY].every(Number.isFinite) || box.minX < 0 || box.maxX > page.width || text.width <= 0 || (text.height ?? 0) <= 0) throw new Error("Ungültige Textfläche");
    if (box.minY < 8) { text.baseline += 8 - box.minY; box = elementBounds(text); }
    for (;;) {
      const hits = occupied.filter(b => box.minX < b.maxX + 8 && box.maxX > b.minX - 8 && box.minY < b.maxY + 8 && box.maxY > b.minY - 8);
      if (!hits.length) break;
      text.baseline += Math.max(...hits.map(b => b.maxY)) + 8 - box.minY;
      box = elementBounds(text);
    }
    if (box.maxY > page.height - 8) throw new Error("Die lesbare Schrift braucht mehr Platz. Bitte weniger Zeilen auswählen oder eine neue Seite verwenden. Das Original bleibt erhalten.");
    occupied.push(box); placed.push(text);
  }
  return placed;
}

export function applyReconstructions(page: HandwritingPage, replacements: TextElement[]): void {
  const placed = planReconstructions(page, replacements);
  const remove = new Set(replacements.flatMap(r => r.reconstruction?.originalStrokes.map(s => s.id) ?? []));
  page.elements = page.elements.filter(e => !remove.has(e.id));
  page.elements.push(...placed);
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

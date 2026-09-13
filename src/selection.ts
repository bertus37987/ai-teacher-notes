import { HandwritingPage, PageElement, elementBounds } from "./document";
import { InkPoint, InkStroke } from "./strokes";
import { shapeOutline } from "./rendering";

/* Phase 4: Auswahl & Gesten (iPad-Parität). Reine, DOM-freie Funktionen. */

export interface SelectionBox { minX: number; minY: number; maxX: number; maxY: number; }

export function boxOf(elements: PageElement[]): SelectionBox | null {
  if (elements.length === 0) return null;
  const bounds = elements.map(elementBounds);
  return {
    minX: Math.min(...bounds.map((box) => box.minX)),
    minY: Math.min(...bounds.map((box) => box.minY)),
    maxX: Math.max(...bounds.map((box) => box.maxX)),
    maxY: Math.max(...bounds.map((box) => box.maxY))
  };
}

export function boxesOverlap(left: SelectionBox, right: SelectionBox): boolean {
  return left.minX <= right.maxX && left.maxX >= right.minX && left.minY <= right.maxY && left.maxY >= right.minY;
}

function boxContains(box: SelectionBox, point: InkPoint): boolean {
  return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
}

type Position = Pick<InkPoint, "x" | "y">;
type Segment = readonly [Position, Position];

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
  const cross = (p: Position, q: Position, r: Position): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const on = (p: Position, q: Position, r: Position): boolean => r.x >= Math.min(p.x, q.x) && r.x <= Math.max(p.x, q.x) && r.y >= Math.min(p.y, q.y) && r.y <= Math.max(p.y, q.y);
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return (abC * abD < 0 && cdA * cdB < 0)
    || (abC === 0 && on(a, b, c)) || (abD === 0 && on(a, b, d))
    || (cdA === 0 && on(c, d, a)) || (cdB === 0 && on(c, d, b));
}

function pathSegments(points: readonly Position[], closed = false): Segment[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [[points[0], points[0]]];
  const segments: Segment[] = points.slice(1).map((point, index) => [points[index], point]);
  if (closed) segments.push([points[points.length - 1], points[0]]);
  return segments;
}

function pathCrossesBox(points: InkPoint[], box: SelectionBox): boolean {
  if (points.some(point => boxContains(box, point))) return true;
  const edges = pathSegments([
    { x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }
  ], true);
  return pathSegments(points).some(([a, b]) => edges.some(([c, d]) => segmentsIntersect(a, b, c, d)));
}

function pointInPolygon(point: InkPoint, polygon: InkPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function inkedPoints(element: PageElement): InkPoint[] {
  if (element.type === "stroke" || element.type === "highlight") return element.points ?? [];
  if (element.type === "shape" && (element.kind === "line" || element.kind === "arrow")) return element.points;
  return [];
}

/** Rechteck-Auswahl: Text vollständig innen, alles andere mit echter Überdeckung. */
export function rectangleSelection(page: HandwritingPage, box: SelectionBox): PageElement[] {
  return page.elements.filter((element) => {
    if (element.locked) return false;
    const bounds = elementBounds(element);
    if (element.type === "text") {
      return boxContains(box, { x: bounds.minX, y: bounds.minY, pressure: 0 }) && boxContains(box, { x: bounds.maxX, y: bounds.maxY, pressure: 0 });
    }
    if (!boxesOverlap(box, bounds)) return false;
    const ink = inkedPoints(element);
    if (ink.length > 0) return pathCrossesBox(ink, box);
    return true;
  });
}

/** Lasso-Auswahl entlang eines geschlossenen Freihandpfads (Ray-Casting). */
export function lassoSelection(page: HandwritingPage, path: InkPoint[]): PageElement[] {
  if (path.length < 3) return [];
  return page.elements.filter((element) => {
    if (element.locked) return false;
    const bounds = elementBounds(element);
    const candidates: InkPoint[] = [
      { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, pressure: 0 },
      { x: bounds.minX, y: bounds.minY, pressure: 0 },
      { x: bounds.maxX, y: bounds.maxY, pressure: 0 },
      { x: bounds.minX, y: bounds.maxY, pressure: 0 },
      { x: bounds.maxX, y: bounds.minY, pressure: 0 }
    ];
    const ink = inkedPoints(element);
    return ink.length > 0
      ? ink.some((point) => pointInPolygon(point, path)) || candidates.some((point) => pointInPolygon(point, path))
      : candidates.some((point) => pointInPolygon(point, path));
  });
}

function transformPoints(points: InkPoint[], origin: InkPoint, sx: number, sy: number): InkPoint[] {
  return points.map((point) => ({ ...point, x: origin.x + (point.x - origin.x) * sx, y: origin.y + (point.y - origin.y) * sy }));
}

export function translateElements(elements: PageElement[], dx: number, dy: number): PageElement[] {
  return elements.map((element) => {
    const shifted = { ...element };
    if ("points" in shifted && Array.isArray(shifted.points)) {
      shifted.points = (shifted.points as InkPoint[]).map((point) => ({ ...point, x: point.x + dx, y: point.y + dy }));
    }
    if (shifted.type === "stroke" && Array.isArray(shifted.rawPoints)) {
      shifted.rawPoints = shifted.rawPoints.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy }));
    }
    if (shifted.type === "highlight" && typeof shifted.x1 === "number" && typeof shifted.x2 === "number") {
      shifted.x1 += dx; shifted.x2 += dx; shifted.y += dy;
    }
    if (shifted.type === "text") { shifted.x += dx; shifted.baseline += dy; }
    if (shifted.type === "image") { shifted.x += dx; shifted.y += dy; }
    return shifted;
  });
}

/** Skalierung der Auswahl um einen Anker; Text-Höhe und Pinselstärken bleiben. */
export function scaleElements(elements: PageElement[], origin: InkPoint, sx: number, sy: number): PageElement[] {
  return elements.map((element) => {
    const scaled = { ...element };
    if ("points" in scaled && Array.isArray(scaled.points)) {
      scaled.points = transformPoints(scaled.points as InkPoint[], origin, sx, sy);
    }
    if (scaled.type === "stroke" && Array.isArray(scaled.rawPoints)) {
      scaled.rawPoints = transformPoints(scaled.rawPoints, origin, sx, sy);
    }
    if (scaled.type === "highlight" && typeof scaled.x1 === "number" && typeof scaled.x2 === "number") {
      scaled.x1 = origin.x + (scaled.x1 - origin.x) * sx;
      scaled.x2 = origin.x + (scaled.x2 - origin.x) * sx;
      scaled.y = origin.y + (scaled.y - origin.y) * sy;
    }
    if (scaled.type === "text") {
      scaled.x = origin.x + (scaled.x - origin.x) * sx;
      scaled.baseline = origin.y + (scaled.baseline - origin.y) * sy;
      if (typeof scaled.width === "number" && sx > 0) scaled.width = Math.max(24, scaled.width * sx);
    }
    if (scaled.type === "image") {
      const width = Math.max(12, scaled.width * sx);
      const height = Math.max(12, scaled.height * sy);
      scaled.x = origin.x + (scaled.x - origin.x) * sx;
      scaled.y = origin.y + (scaled.y - origin.y) * sy;
      scaled.width = width; scaled.height = height;
    }
    return scaled;
  });
}

export function duplicateElements(elements: PageElement[]): PageElement[] {
  return elements.map((element) => {
    const copy = structuredClone(element) as PageElement & { id?: string };
    copy.id = crypto.randomUUID();
    if ("points" in copy && Array.isArray(copy.points)) {
      copy.points = (copy.points as InkPoint[]).map((point) => ({ ...point, x: point.x + 12, y: point.y + 12 }));
    }
    if (copy.type === "stroke" && Array.isArray(copy.rawPoints)) {
      copy.rawPoints = copy.rawPoints.map((point) => ({ ...point, x: point.x + 12, y: point.y + 12 }));
    }
    if (copy.type === "highlight") { copy.x1 += 12; copy.x2 += 12; copy.y += 12; }
    if (copy.type === "text") { copy.x += 12; copy.baseline += 12; }
    if (copy.type === "image") { copy.x += 12; copy.y += 12; }
    return copy as PageElement;
  });
}

/* ------------------------- Gesten ------------------------- */

/** Circle-to-Lasso: großer, annähernd runder, geschlossener Stift-Kreis. */
export function circleLassoGesture(stroke: InkStroke, page: HandwritingPage): boolean {
  if (stroke.points.length < 20) return false;
  const box = elementBounds({ type: "stroke", id: "g", color: "#111", size: 1, points: stroke.points });
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const diagonal = Math.hypot(width, height);
  const pageMinimum = Math.min(page.width, page.height);
  if (diagonal < pageMinimum * 0.3) return false;
  const aspect = Math.min(width, height) / Math.max(width, height);
  if (aspect < 1 / 1.7) return false;
  const first = stroke.points[0];
  const last = stroke.points[stroke.points.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) > diagonal * 0.22) return false;
  const centerX = (box.minX + box.maxX) / 2;
  const centerY = (box.minY + box.maxY) / 2;
  // Fit the ellipse perimeter, not its bounding box: square corners sit far outside it.
  const errors = stroke.points.map(point => Math.abs(Math.hypot((point.x - centerX) / width, (point.y - centerY) / height) * 2 - 1));
  return errors.reduce((sum, error) => sum + error, 0) / errors.length <= 0.12 && Math.max(...errors) <= 0.28;
}

/** Mindest-Rücklauf: so oft muss der Zug seine Spanne durchlaufen, um als „Wegkritzeln" zu gelten. */
export const SCRIBBLE_MIN_BACK_AND_FORTH = 4;

/**
 * Rücklauf-Verhältnis: Summe aller |dx| geteilt durch die Spanne in x.
 * Schrift wandert vorwärts (nahe 1), Kritzelei läuft dieselbe Spanne viele Male zurück.
 * Gemessen 13.9.2026 an 12 Proben: Schrift 1,00–2,49 · Kritzelei 10,93–11,38.
 */
export function backAndForthRatio(points: InkPoint[]): number {
  let travel = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const x = points[i].x;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (i > 0) travel += Math.abs(x - points[i - 1].x);
  }
  const span = maxX - minX;
  return span > 0 ? travel / span : 0;
}

/** Scribble-to-Erase: enge, hektische Zickzack-Gekritzel, nicht normale Schrift. */
export function scratchEraseGesture(stroke: InkStroke): boolean {
  if (stroke.points.length < 12) return false;
  const box = elementBounds({ type: "stroke", id: "g", color: "#111", size: 1, points: stroke.points });
  const diagonal = Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  if (diagonal < 12 || diagonal > 140) return false;
  let pathLength = 0;
  let flips = 0;
  let previousDirection = 0;
  let reversals = 0;
  let previousVector: Position | null = null;
  for (let index = 1; index < stroke.points.length; index += 1) {
    const dx = stroke.points[index].x - stroke.points[index - 1].x;
    const dy = stroke.points[index].y - stroke.points[index - 1].y;
    const length = Math.hypot(dx, dy);
    pathLength += length;
    if (length > 1.5) {
      // Writing loops turn smoothly; destructive scratch requires repeated sharp returns.
      if (previousVector && (dx * previousVector.x + dy * previousVector.y) / (length * Math.hypot(previousVector.x, previousVector.y)) < -0.5) reversals += 1;
      previousVector = { x: dx, y: dy };
    }
    if (Math.abs(dx) > 1.5) {
      const direction = Math.sign(dx);
      if (direction !== 0 && previousDirection !== 0 && direction !== previousDirection) flips += 1;
      previousDirection = direction;
    }
  }
  if (!(pathLength / Math.max(1, diagonal) >= 2.6 && flips >= 5 && reversals >= 5)) return false;
  // Schreibschrift mit Schleifen lief bis 0.25.36 in dieselbe Falle: schon drei Schleifenbuchstaben
  // erreichen Tortuosität, Flips und Reversals eines Kritzelzugs und löschten damit die Tinte
  // darunter (gemessen 13.9.2026: „lll" ⇒ Löschgeste ⇒ Text weg). Was Kritzelei von Schrift
  // trennt, ist die RÜCKLAUF-Bewegung: Kritzelei fährt dieselbe Spanne viele Male zurück,
  // Schrift wandert vorwärts. Gemessen an 12 Proben: Schrift 1,00–2,49 · Kritzelei 10,93–11,38.
  return backAndForthRatio(stroke.points) >= SCRIBBLE_MIN_BACK_AND_FORTH;
}

function pointSegmentDistance(point: Position, a: Position, b: Position): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function segmentsNear([a, b]: Segment, [c, d]: Segment, margin: number): boolean {
  return segmentsIntersect(a, b, c, d) || Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b)) <= margin;
}

function midpoint(a: Position, b: Position): Position {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Flatten a rendered quadratic with at most 0.5 px deviation. */
function quadraticSegments(start: Position, control: Position, end: Position): Segment[] {
  const steps = Math.max(1, Math.ceil(Math.sqrt(Math.hypot(start.x - 2 * control.x + end.x, start.y - 2 * control.y + end.y) / 2)));
  return pathSegments(Array.from({ length: steps + 1 }, (_, step) => {
    const t = step / steps, u = 1 - t;
    return { x: u * u * start.x + 2 * u * t * control.x + t * t * end.x, y: u * u * start.y + 2 * u * t * control.y + t * t * end.y };
  }));
}

function strokeSegments(stroke: InkStroke): Segment[] {
  const points = stroke.points;
  if (stroke.inkGeometry === "captured" || points.length < 2) return pathSegments(points);
  return points.slice(1).flatMap((endPoint, index) => {
    // Same quadratic endpoints/control points as drawInkStroke.
    const control = points[index];
    const start = index === 0 ? control : midpoint(points[index - 1], control);
    const end = index === points.length - 2 ? endPoint : midpoint(control, endPoint);
    return quadraticSegments(start, control, end);
  });
}

function markerSegments(points: Position[]): Segment[] {
  if (points.length < 3) return pathSegments(points);
  const segments: Segment[] = [];
  let start = points[0];
  for (let index = 1; index < points.length - 1; index += 1) {
    const end = midpoint(points[index], points[index + 1]);
    segments.push(...quadraticSegments(start, points[index], end));
    start = end;
  }
  segments.push([start, points[points.length - 1]]);
  return segments;
}

/** Elemente, deren sichtbare Kontur ein Gekritzel berührt (kein Text, keine Bilder). */
export function scratchedElements(page: HandwritingPage, stroke: InkStroke): PageElement[] {
  const scratch = pathSegments(stroke.points);
  if (scratch.length === 0) return [];
  return page.elements.filter((element) => {
    if (element.id === stroke.id || element.locked) return false;
    if (element.type !== "stroke" && element.type !== "shape" && element.type !== "highlight") return false;
    const points = element.type === "shape" ? shapeOutline(element)
      : element.type === "highlight" ? element.points?.length ? element.points : [{ x: element.x1, y: element.y }, { x: element.x2, y: element.y }]
      : element.points;
    const closed = element.type === "shape" && (element.closed || element.kind === "ellipse" || element.kind === "rectangle");
    const outline = element.type === "stroke" ? strokeSegments(element)
      : element.type === "highlight" ? markerSegments(points) : pathSegments(points, closed);
    const margin = 6 + stroke.size / 2 + element.size / 2;
    return scratch.some(segment => outline.some(target => segmentsNear(segment, target, margin)));
  });
}
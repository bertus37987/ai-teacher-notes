import { InkPoint, InkStroke } from "./strokes";
import type { ShapeElement } from "./document";

export type OptimizedShape = "line" | "arrow" | "ellipse" | "rectangle" | "polygon" | null;
export type ShapeDragTool = "line" | "arrow" | "ellipse" | "circle" | "rectangle" | "triangle" | "diamond";

export function draggedShapePoints(tool: ShapeDragTool, start: InkPoint, end: InkPoint, page?:{width:number;height:number}): InkPoint[] {
  if (tool === "line" || tool === "arrow" || tool === "ellipse" || tool === "rectangle") return [{ ...start }, { ...end }];
  if (tool === "circle") {
    let side = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
    if(page) side=Math.max(0,Math.min(side,end.x>=start.x ? page.width-start.x : start.x,end.y>=start.y ? page.height-start.y : start.y));
    return [{ ...start }, { ...end, x: start.x + Math.sign(end.x - start.x || 1) * side, y: start.y + Math.sign(end.y - start.y || 1) * side }];
  }
  const left = Math.min(start.x, end.x); const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y); const bottom = Math.max(start.y, end.y);
  if (tool === "triangle") return [
    { ...start, x: (left + right) / 2, y: top }, { ...end, x: right, y: bottom }, { ...end, x: left, y: bottom }
  ];
  return [
    { ...start, x: (left + right) / 2, y: top }, { ...end, x: right, y: (top + bottom) / 2 },
    { ...end, x: (left + right) / 2, y: bottom }, { ...end, x: left, y: (top + bottom) / 2 }
  ];
}

export function shapeContainsPoint(shape: ShapeElement, point: InkPoint): boolean {
  if (!shape.closed || shape.points.length < 2) return false;
  const box = bounds(shape.points);
  if (point.x < box.minX || point.x > box.maxX || point.y < box.minY || point.y > box.maxY) return false;
  if (shape.kind === "ellipse") {
    const rx = (box.maxX - box.minX) / 2; const ry = (box.maxY - box.minY) / 2;
    if (rx <= 0 || ry <= 0) return false;
    const cx = (box.minX + box.maxX) / 2; const cy = (box.minY + box.maxY) / 2;
    return ((point.x - cx) / rx) ** 2 + ((point.y - cy) / ry) ** 2 <= 1;
  }
  const vertices = shape.kind === "rectangle" && shape.points.length === 2 ? [
    shape.points[0], { ...shape.points[0], x: shape.points[1].x }, shape.points[1], { ...shape.points[0], y: shape.points[1].y }
  ] : shape.points;
  let inside = false;
  for (let current = 0, previous = vertices.length - 1; current < vertices.length; previous = current, current += 1) {
    const a = vertices[current]; const b = vertices[previous];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distance(a: InkPoint, b: InkPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pathLength(points: InkPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distance(points[index - 1], points[index]);
  return total;
}

function bounds(points: InkPoint[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return points.reduce((box, point) => ({
    minX: Math.min(box.minX, point.x),
    minY: Math.min(box.minY, point.y),
    maxX: Math.max(box.maxX, point.x),
    maxY: Math.max(box.maxY, point.y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function pointLineDistance(point: InkPoint, start: InkPoint, end: InkPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + ratio * dx, y: start.y + ratio * dy, pressure: point.pressure });
}

function simplify(points: InkPoint[], epsilon: number): InkPoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  let farthestDistance = 0;
  let farthestIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const candidate = pointLineDistance(points[index], points[0], points[points.length - 1]);
    if (candidate > farthestDistance) {
      farthestDistance = candidate;
      farthestIndex = index;
    }
  }
  if (farthestDistance <= epsilon) return [{ ...points[0] }, { ...points[points.length - 1] }];
  const left = simplify(points.slice(0, farthestIndex + 1), epsilon);
  const right = simplify(points.slice(farthestIndex), epsilon);
  return [...left.slice(0, -1), ...right];
}

function polygonFromGesture(stroke: InkStroke, diagonal: number): InkStroke | null {
  const simplified = simplify(stroke.points, Math.max(6, diagonal * 0.045));
  const vertices = simplified.slice();
  if (vertices.length > 1 && distance(vertices[0], vertices[vertices.length - 1]) < diagonal * 0.25) vertices.pop();
  if (vertices.length < 3 || vertices.length > 12) return null;
  const pressure = stroke.points.reduce((sum, point) => sum + point.pressure, 0) / stroke.points.length;
  const clean = vertices.map((point) => ({ ...point, pressure }));
  clean.push({ ...clean[0] });
  return { ...stroke, points: clean };
}

function optimizeLine(stroke: InkStroke, toleranceScale = 1): InkStroke | null {
  const points = stroke.points;
  if (points.length < 2) return null;
  const start = points[0];
  const end = points[points.length - 1];
  const chord = distance(start, end);
  if (chord < 80 || pathLength(points) / chord > 1 + .075 * toleranceScale) return null;
  const tolerance = Math.max(4, chord * 0.028) * toleranceScale;
  if (points.some((point) => pointLineDistance(point, start, end) > tolerance)) return null;

  const cleanStart = { ...start };
  const cleanEnd = { ...end };
  if (Math.abs(end.y - start.y) / chord < 0.13) {
    cleanStart.y = (start.y + end.y) / 2;
    cleanEnd.y = cleanStart.y;
  } else if (Math.abs(end.x - start.x) / chord < 0.13) {
    cleanStart.x = (start.x + end.x) / 2;
    cleanEnd.x = cleanStart.x;
  }
  return { ...stroke, points: [cleanStart, cleanEnd] };
}

function optimizeArrow(stroke: InkStroke): InkStroke | null {
  if (stroke.points.length < 8) return null;
  const reduced = simplify(stroke.points, 7);
  if (reduced.length < 4 || reduced.length > 7) return null;
  const start = reduced[0];
  const tip = reduced[1];
  const shaft = distance(start, tip);
  if (shaft < 90) return null;
  const returnsToTip = reduced.slice(2, -1).some((point) => distance(point, tip) < Math.max(16, shaft * 0.13));
  const wingPoints = reduced.slice(2).filter((point) => {
    const length = distance(point, tip);
    return length > 14 && length < shaft * 0.48;
  });
  if (!returnsToTip || wingPoints.length < 2) return null;
  const angle = Math.atan2(tip.y - start.y, tip.x - start.x);
  const sides = wingPoints.map((point) => Math.sign(Math.sin(Math.atan2(point.y - tip.y, point.x - tip.x) - angle)));
  if (!sides.includes(-1) || !sides.includes(1)) return null;
  return { ...stroke, points: [{ ...start }, { ...tip }] };
}

function optimizeClosedShape(stroke: InkStroke, toleranceScale = 1, force = false, preferCircle = false): { stroke: InkStroke; kind: OptimizedShape } | null {
  if (stroke.points.length < (force ? 8 : 10)) return null;
  const box = bounds(stroke.points);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const diagonal = Math.hypot(width, height);
  // Halten (force): handschriftgroße Ovale (ab ~16 px) zulassen und größere
  // End-Lücke tolerieren — sonst scheitert der Hold-Snap im Schulalltag.
  const minSize = force ? 16 : 40;
  const minDiagonal = force ? 26 : 60;
  const closureLimit = diagonal * (force ? 0.45 : 0.22) * toleranceScale;
  if (width < minSize || height < minSize || diagonal < minDiagonal || distance(stroke.points[0], stroke.points[stroke.points.length - 1]) > closureLimit) return null;

  const edgeError = stroke.points.reduce((sum, point) => sum + Math.min(
    Math.abs(point.x - box.minX),
    Math.abs(point.x - box.maxX),
    Math.abs(point.y - box.minY),
    Math.abs(point.y - box.maxY)
  ), 0) / stroke.points.length / Math.max(width, height);

  const centerX = (box.minX + box.maxX) / 2;
  const centerY = (box.minY + box.maxY) / 2;
  const radii = stroke.points.map((point) => Math.hypot(
    (point.x - centerX) / (width / 2),
    (point.y - centerY) / (height / 2)
  ));
  const radialError = radii.reduce((sum, radius) => sum + Math.abs(radius - 1), 0) / radii.length;
  // Require all four box corners: a right triangle can occupy three and
  // still pass the average edge-error threshold, especially when held.
  // Ellipses additionally need a balanced radius profile.
  const cornerTolerance = Math.max(14, diagonal * 0.18);
  const cornerCount = [
    { x: box.minX, y: box.minY, pressure: 0 },
    { x: box.maxX, y: box.minY, pressure: 0 },
    { x: box.maxX, y: box.maxY, pressure: 0 },
    { x: box.minX, y: box.maxY, pressure: 0 }
  ].reduce((count, corner) => count + (stroke.points.some((point) => distance(corner, point) <= cornerTolerance) ? 1 : 0), 0);
  const radiusRatio = Math.min(...radii) / Math.max(...radii);

  if (edgeError < (force ? 0.09 : 0.07) * toleranceScale && radialError > (force ? 0.12 : 0.09) && cornerCount === 4) {
    const pressure = stroke.points.reduce((sum, point) => sum + point.pressure, 0) / stroke.points.length;
    return {
      kind: "rectangle",
      stroke: {
        ...stroke,
        points: [
          { x: box.minX, y: box.minY, pressure },
          { x: box.maxX, y: box.minY, pressure },
          { x: box.maxX, y: box.maxY, pressure },
          { x: box.minX, y: box.maxY, pressure },
          { x: box.minX, y: box.minY, pressure }
        ]
      }
    };
  }

  if (radialError <= (force ? 0.38 : 0.24) * toleranceScale && radiusRatio >= (force ? 0.32 : 0.5)) {
    // Kreis-Anteil: fast runde Zeichnungen werden im Normalfall bereits perfekt
    // rund (Apple-Notes-Verhalten); Halten/100 % erlauben großzügigeres Einrunden.
    const aspect = Math.min(width, height) / Math.max(width, height);
    const circle = preferCircle ? aspect >= (force ? 0.66 : 0.72) : aspect >= 0.88;
    const radiusX = circle ? (width + height) / 4 : width / 2;
    const radiusY = circle ? radiusX : height / 2;
    const first = stroke.points[0];
    const startAngle = Math.atan2((first.y - centerY) / height, (first.x - centerX) / width);
    let signedArea = 0;
    for (let index = 1; index < stroke.points.length; index += 1) {
      signedArea += stroke.points[index - 1].x * stroke.points[index].y - stroke.points[index].x * stroke.points[index - 1].y;
    }
    const direction = signedArea >= 0 ? 1 : -1;
    const pressure = stroke.points.reduce((sum, point) => sum + point.pressure, 0) / stroke.points.length;
    const points: InkPoint[] = [];
    for (let step = 0; step <= 48; step += 1) {
      const angle = startAngle + direction * step / 48 * Math.PI * 2;
      points.push({
        x: centerX + Math.cos(angle) * radiusX,
        y: centerY + Math.sin(angle) * radiusY,
        pressure
      });
    }
    return { kind: "ellipse", stroke: { ...stroke, points } };
  }
  const polygon = polygonFromGesture(stroke, diagonal);
  return polygon ? { kind: "polygon", stroke: polygon } : null;
}

export function optimizeShape(stroke: InkStroke, strength = .7, force = false): { stroke: InkStroke; kind: OptimizedShape } {
  if (strength <= 0) return { stroke, kind: null };
  let toleranceScale = .5 + Math.min(1, strength) / 1.4;
  if (force) toleranceScale += .35;
  const arrow = optimizeArrow(stroke);
  if (arrow) return { stroke: arrow, kind: "arrow" };
  const line = optimizeLine(stroke, toleranceScale);
  if (line) return { stroke: line, kind: "line" };
  const closed = optimizeClosedShape(stroke, toleranceScale, force, force || strength >= 1);
  return closed ?? { stroke, kind: null };
}

/** Endpunkte eines Strichs an nahe Zielpunkte (andere Elemente) attrahieren. */
export function snapStrokeEndpoints(stroke: InkStroke, targets: { x: number; y: number }[], radius = 14): InkStroke {
  if (targets.length === 0 || stroke.points.length < 2) return stroke;
  const snap = (point: InkPoint): InkPoint => {
    let best: { x: number; y: number } | null = null;
    let bestDistance = radius;
    for (const target of targets) {
      const candidate = Math.hypot(target.x - point.x, target.y - point.y);
      if (candidate < bestDistance) { bestDistance = candidate; best = target; }
    }
    return best ? { ...point, x: best.x, y: best.y } : point;
  };
  const first = snap(stroke.points[0]);
  const last = snap(stroke.points[stroke.points.length - 1]);
  return { ...stroke, points: [first, ...stroke.points.slice(1, -1), last] };
}

/** Richtung einer Geraden auf das nächste 15°-Raster einrasten (Länge bleibt). */
export function snapLineAngle(points: InkPoint[], stepDegrees = 15): InkPoint[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy);
  if (length < 24) return points;
  const angle = Math.atan2(dy, dx);
  const step = stepDegrees * Math.PI / 180;
  const snappedAngle = Math.round(angle / step) * step;
  return [...points.slice(0, -1), { ...last, x: first.x + Math.cos(snappedAngle) * length, y: first.y + Math.sin(snappedAngle) * length }];
}

import { InkPoint, InkStroke } from "./strokes";

export type Paper = "grid" | "lines" | "blank";
export type ShapeKind = "line" | "arrow" | "ellipse" | "rectangle" | "polygon";

export interface ElementMeta {
  locked?: boolean;
  opacity?: number;
  /** Human-readable layer name used by artboards and agent inspection. */
  name?: string;
  /** Optional containing artboard or semantic frame. */
  parentId?: string;
  semanticRole?: string;
  renderStyle?: "clean" | "sketch";
  /** Lightweight artboard metadata. Artboards stay ordinary editable shapes. */
  artboard?: {
    preset: "desktop" | "tablet" | "mobile" | "custom";
    backgroundColor: string;
    clipContent?: boolean;
  };
  /** Optional references to source cards used by visual explanations. */
  sourceRefs?: string[];
  /** One-shot human context marker included in the next agent turn. */
  agentAttached?: boolean;
  /** Herkunft: durch einen externen Agenten (MCP) erzeugtes/bearbeitetes Objekt.
   *  Agent-Geometrie durchläuft nie die Handschrift-Normalisierung. */
  origin?: { agent?: { requestId: string; at: number; label?: string } };
}

export interface StrokeElement extends InkStroke, ElementMeta {
  /** Persisted once-only guard; original restoration does not silently requeue ink. */
  normalizedWordId?: string;
  type: "stroke";
  /** Unmodified capture points, retained before geometric filtering. */
  rawPoints?: InkPoint[];
  /** Optional local English handwriting transcription; never replaces the visible ink. */
  recognitionText?: string;
}

export interface TextElement extends ElementMeta {
  /** Simple spreadsheet-style grid. Stored as text for search and portable fallback. */
  table?: { cells: string[][] };
  type: "text";
  id: string;
  x: number;
  baseline: number;
  width: number;
  /** Custom text-box height. Older documents derive it from fontSize. */
  height?: number;
  /**
   * This label sits on a filled shape, so its colour is used as given. Without it the guard that
   * keeps near-white ink from vanishing on the white page turns light type on a dark bar dark too.
   */
  onFilledSurface?: boolean;
  fontSize: number;
  color: string;
  text: string;
  reconstruction?: { model: string; originalStrokes: StrokeElement[]; originalIndices: number[]; confirmedAt: string };
  /** Curated, portable font roles used by both the human UI and WebMCP agent. */
  fontFamily?: "sans" | "serif" | "mono" | "handwriting";
  fontWeight?: 400 | 500 | 600 | 700;
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  textAlign?: "left" | "center" | "right";
  blockStyle?: "body" | "heading-1" | "heading-2" | "heading-3" | "bullet" | "numbered" | "check" | "quote" | "code" | "math";
  highlightColor?: string;
}

export interface HighlightElement extends ElementMeta {
  type: "highlight";
  id: string;
  x1: number;
  x2: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  /** A real marker gesture. Legacy/smart highlights remain a straight x1/x2 line. */
  points?: InkPoint[];
}

export interface ShapeElement extends ElementMeta {
  /** Optional school geometry labels, included in notebook raster exports. */
  showMeasurements?: boolean;
  type: "shape";
  id: string;
  kind: ShapeKind;
  points: InkPoint[];
  color: string;
  size: number;
  closed: boolean;
  fillColor?: string;
  fillOpacity?: number;
  /** Optional editable corner radius for rectangular UI and diagram shapes. */
  radius?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  startArrow?: boolean;
  endArrow?: boolean;
}

export interface ImageElement extends ElementMeta {
  type: "image";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
  mimeType: "image/png" | "image/jpeg";
  sourceName?: string;
}

export type PageElement = StrokeElement | TextElement | HighlightElement | ShapeElement | ImageElement;

export interface HandwritingPage {
  id: string;
  width: number;
  height: number;
  format?: "a4" | "a4-landscape" | "a5" | "square" | "custom";
  paper: Paper;
  elements: PageElement[];
  /** Learned writing rows. New words near one of these baselines snap to it. */
  baselines?: number[];
}

export interface HandwritingProfile {
  targetHeight: number;
  samples: number;
  averageSlope: number;
}

export interface HandwritingDocumentV3 {
  version: 3;
  pages: HandwritingPage[];
  profile: HandwritingProfile;
}

export type HandwritingDocumentV2 = HandwritingDocumentV3;

interface StoredDocumentV2 {
  version: 2;
  pages: HandwritingPage[];
}

interface LegacyText {
  id: string;
  x: number;
  baseline: number;
  width: number;
  fontSize: number;
  color: string;
  text: string;
}

interface LegacyDocumentV1 {
  version: 1;
  width: number;
  height: number;
  paper: Paper;
  strokes: InkStroke[];
  texts?: LegacyText[];
}

export const A4_WIDTH = 1200;
export const A4_HEIGHT = Math.round(A4_WIDTH * 297 / 210);

export function createPage(paper: Paper, width = A4_WIDTH, height = Math.round(width * 297 / 210)): HandwritingPage {
  return { id: crypto.randomUUID(), width, height, paper, elements: [], baselines: [] };
}

export function createDocument(paper: Paper): HandwritingDocumentV3 {
  return { version: 3, pages: [createPage(paper)], profile: { targetHeight: 52, samples: 0, averageSlope: 0 } };
}

export function paperBaselineStep(paper: Paper): number {
  return paper === "grid" ? 24 : paper === "lines" ? 32 : 0;
}

export function alignPageBaselines(page: HandwritingPage): boolean {
  const original = Array.isArray(page.baselines) ? page.baselines : [];
  const step = paperBaselineStep(page.paper);
  const aligned = [...new Set(original
    .filter((baseline) => Number.isFinite(baseline) && baseline > 0 && baseline < page.height)
    .map((baseline) => step > 0 ? Math.round(baseline / step) * step : baseline))]
    .sort((left, right) => left - right);
  const changed = !Array.isArray(page.baselines) || JSON.stringify(original) !== JSON.stringify(aligned);
  page.baselines = aligned;
  return changed;
}

function pointDistance(left: InkPoint, right: InkPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

/**
 * Turns a consecutively drawn, connected run of 3–12 straight segments into
 * one closed sharp polygon. This supports natural pen-lift-at-each-corner
 * drawing without a separate polygon selection tool.
 */
export function mergeClosedLineShapes(page: HandwritingPage, fillColor?: string, fillOpacity?: number): boolean {
  let changed = false;
  let index = 0;
  while (index < page.elements.length) {
    const first = page.elements[index];
    if (first.type !== "shape" || first.kind !== "line" || first.points.length < 2) { index += 1; continue; }
    const firstStart = first.points[0];
    let currentEnd = first.points[first.points.length - 1];
    const vertices: InkPoint[] = [{ ...firstStart }, { ...currentEnd }];
    const segments: ShapeElement[] = [first];
    let cursor = index + 1;
    for (; cursor < page.elements.length && segments.length < 12; cursor += 1) {
      const candidate = page.elements[cursor];
      if (candidate.type !== "shape" || candidate.kind !== "line" || candidate.points.length < 2) break;
      const start = candidate.points[0];
      const end = candidate.points[candidate.points.length - 1];
      const toStart = pointDistance(currentEnd, start);
      const toEnd = pointDistance(currentEnd, end);
      if (Math.min(toStart, toEnd) > 34) break;
      currentEnd = toStart <= toEnd ? end : start;
      vertices.push({ ...currentEnd });
      segments.push(candidate);
      if (segments.length >= 3 && pointDistance(currentEnd, firstStart) <= 34) {
        const cleanVertices = vertices.slice(0, -1);
        if (cleanVertices.length >= 3) {
          const polygon: ShapeElement = {
            type: "shape",
            id: segments[segments.length - 1].id,
            kind: "polygon",
            points: cleanVertices,
            color: segments[0].color,
            size: segments.reduce((sum, segment) => sum + segment.size, 0) / segments.length,
            closed: true,
            fillColor,
            fillOpacity: fillOpacity ?? 0
          };
          page.elements.splice(index, segments.length, polygon);
          changed = true;
        }
        break;
      }
    }
    index += 1;
  }
  return changed;
}

function preparePages(pages: HandwritingPage[]): boolean {
  let changed = false;
  for (const page of pages) {
    const a4Height = Math.round(page.width * 297 / 210);
    if (!page.format && page.height !== a4Height) { page.height = a4Height; changed = true; }
    if (alignPageBaselines(page)) changed = true;
    if (mergeClosedLineShapes(page)) changed = true;
  }
  return changed;
}

function isPaper(value: unknown): value is Paper {
  return value === "grid" || value === "lines" || value === "blank";
}

function isLegacyDocument(value: unknown): value is LegacyDocumentV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LegacyDocumentV1>;
  return candidate.version === 1
    && isFiniteNumber(candidate.width) && (candidate.width as number) > 0 && (candidate.width as number) <= LIMIT.coordinate
    && isFiniteNumber(candidate.height) && (candidate.height as number) > 0 && (candidate.height as number) <= LIMIT.coordinate
    && isPaper(candidate.paper)
    && Array.isArray(candidate.strokes);
}

/* ------------------------- Validierung (M1 hart) ------------------------- */

const LIMIT = {
  pages: 5_000,
  elements: 100_000,
  points: 100_000,
  coordinate: 100_000,
  text: 200_000,
  cell: 10_000,
  cellRows: 2_000,
  cellCols: 200,
  id: 200,
  color: 64,
  recognition: 10_000,
  imageData: 50_000_000,
  fontSize: 1_000,
} as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= LIMIT.id;
}

function isColor(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= LIMIT.color;
}

/** Punkte-Array: endliche x/y-Koordinaten in plausibler Menge. */
function validatePoints(points: unknown): string | null {
  if (!Array.isArray(points)) return "Punkte fehlen oder sind kein Array";
  if (points.length < 1 || points.length > LIMIT.points) return `Punktzahl unplausibel (${points.length})`;
  for (const point of points) {
    if (!point || typeof point !== "object") return "Punkt ist kein Objekt";
    const candidate = point as { x?: unknown; y?: unknown };
    if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y)) return "Punktkoordinaten nicht endlich";
  }
  return null;
}

function validateElement(element: unknown, where: string): string | null {
  if (!element || typeof element !== "object") return `${where}: Element ist kein Objekt`;
  const candidate = element as Record<string, unknown>;
  if (!isId(candidate.id)) return `${where}: Element-Id fehlt oder ist unplausibel`;
  switch (candidate.type) {
    case "stroke": {
      const pointsError = validatePoints(candidate.points); if (pointsError) return `${where}: ${pointsError}`;
      if (!isColor(candidate.color)) return `${where}: Stiftfarbe ungültig`;
      if (!isFiniteNumber(candidate.size) || (candidate.size as number) <= 0) return `${where}: Stiftstärke ungültig`;
      if (candidate.rawPoints !== undefined) { const rawError = validatePoints(candidate.rawPoints); if (rawError) return `${where}: Originalpunkte ${rawError}`; }
      if (candidate.recognitionText !== undefined && !(typeof candidate.recognitionText === "string" && candidate.recognitionText.length <= LIMIT.recognition)) return `${where}: Erkennungstext unplausibel`;
      if (candidate.normalizedWordId !== undefined && !(typeof candidate.normalizedWordId === "string" && candidate.normalizedWordId.length <= LIMIT.id)) return `${where}: Wort-Marker unplausibel`;
      return null;
    }
    case "text": {
      if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.baseline) || !isFiniteNumber(candidate.width)) return `${where}: Textposition/-breite nicht endlich`;
      if (!isFiniteNumber(candidate.fontSize) || (candidate.fontSize as number) <= 0 || (candidate.fontSize as number) > LIMIT.fontSize) return `${where}: Schriftgröße unplausibel`;
      if (!isColor(candidate.color)) return `${where}: Textfarbe ungültig`;
      if (typeof candidate.text !== "string" || candidate.text.length > LIMIT.text) return `${where}: Textinhalt fehlt oder ist unplausibel groß`;
      if (candidate.height !== undefined && !isFiniteNumber(candidate.height)) return `${where}: Texthöhe ungültig`;
      const table = candidate.table;
      if (table !== undefined) {
        if (!table || typeof table !== "object" || !Array.isArray((table as { cells?: unknown }).cells)) return `${where}: Tabelle ohne Zell-Array`;
        const cells = (table as { cells: unknown[] }).cells;
        if (cells.length > LIMIT.cellRows) return `${where}: Tabelle hat zu viele Zeilen`;
        for (const row of cells) {
          if (!Array.isArray(row) || row.length > LIMIT.cellCols) return `${where}: Tabellenzeile unplausibel`;
          for (const cell of row) if (typeof cell !== "string" || cell.length > LIMIT.cell) return `${where}: Tabellenzelle kein Text oder zu groß`;
        }
      }
      return null;
    }
    case "highlight": {
      if (candidate.points !== undefined) { const pointsError = validatePoints(candidate.points); if (pointsError) return `${where}: ${pointsError}`; }
      else if (!isFiniteNumber(candidate.x1) || !isFiniteNumber(candidate.x2) || !isFiniteNumber(candidate.y) || !isFiniteNumber(candidate.size) || !isFiniteNumber(candidate.opacity)) return `${where}: Markierungskoordinaten nicht endlich`;
      return null;
    }
    case "shape": {
      const kinds: readonly string[] = ["line", "arrow", "ellipse", "rectangle", "polygon"];
      if (typeof candidate.kind !== "string" || !kinds.includes(candidate.kind)) return `${where}: unbekannte Formenart`;
      const pointsError = validatePoints(candidate.points); if (pointsError) return `${where}: ${pointsError}`;
      return null;
    }
    case "image": {
      if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y)) return `${where}: Bildposition nicht endlich`;
      if (!isFiniteNumber(candidate.width) || !isFiniteNumber(candidate.height)) return `${where}: Bildmaße nicht endlich`;
      if ((candidate.width as number) <= 0 || (candidate.height as number) <= 0 || (candidate.width as number) > LIMIT.coordinate || (candidate.height as number) > LIMIT.coordinate) return `${where}: Bildmaße unplausibel`;
      if (typeof candidate.dataUrl !== "string" || !candidate.dataUrl.startsWith("data:image/") || candidate.dataUrl.length > LIMIT.imageData) return `${where}: Bilddaten fehlen oder sind unplausibel`;
      return null;
    }
    default:
      return `${where}: unbekannter Elementtyp ${String(candidate.type)}`;
  }
}

function validatePage(page: unknown, index: number): string | null {
  const where = `Seite ${index + 1}`;
  if (!page || typeof page !== "object") return `${where}: kein Objekt`;
  const candidate = page as Record<string, unknown>;
  if (!isId(candidate.id)) return `${where}: Seiten-Id fehlt`;
  if (!isFiniteNumber(candidate.width) || (candidate.width as number) <= 0 || (candidate.width as number) > LIMIT.coordinate) return `${where}: Breite unplausibel`;
  if (!isFiniteNumber(candidate.height) || (candidate.height as number) <= 0 || (candidate.height as number) > LIMIT.coordinate) return `${where}: Höhe unplausibel`;
  if (candidate.paper !== "grid" && candidate.paper !== "lines" && candidate.paper !== "blank") return `${where}: unbekanntes Papier`;
  if (!Array.isArray(candidate.elements) || candidate.elements.length > LIMIT.elements) return `${where}: Elemente fehlen oder sind unplausibel`;
  for (let elementIndex = 0; elementIndex < candidate.elements.length; elementIndex += 1) {
    const error = validateElement(candidate.elements[elementIndex], `${where}, Element ${elementIndex + 1}`);
    if (error) return error;
  }
  if (candidate.baselines !== undefined && (!Array.isArray(candidate.baselines) || !candidate.baselines.every(isFiniteNumber))) return `${where}: Grundlinien ungültig`;
  return null;
}

function validatePages(pages: unknown): string | null {
  if (!Array.isArray(pages)) return "Seiten fehlen oder sind kein Array";
  if (pages.length < 1) return "Heft hat keine Seiten";
  if (pages.length > LIMIT.pages) return "zu viele Seiten";
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const error = validatePage(pages[pageIndex], pageIndex);
    if (error) return error;
  }
  return null;
}

export type NotebookParseError =
  | { kind: "malformed"; detail: string }
  | { kind: "unsupported-version"; version: number };

export type NotebookParseResult =
  | { ok: true; document: HandwritingDocumentV3; migrated: boolean }
  | { ok: false; document: null; error: NotebookParseError };

function malformed(detail: string): NotebookParseResult {
  return { ok: false, document: null, error: { kind: "malformed", detail } };
}

/**
 * Strikter Loader: validiert Form, Maße, Elemente und Inhaltsgrenzen; liefert
 * bei Fehlern einen Grund (malformed / unsupported-version) statt stiller
 * Migration. Unbekannte Felder bleiben erhalten; niemals wird ein leeres Heft
 * als „Reparatur“ zurückgegeben.
 */
export function parseNotebook(value: unknown): NotebookParseResult {
  if (!value || typeof value !== "object") return malformed("Datei ist kein Dokument-Objekt");
  const version = (value as { version?: unknown }).version;
  if (version === 2 || version === 3) {
    const pages = (value as Partial<StoredDocumentV2>).pages;
    const validationError = validatePages(pages);
    if (validationError) return malformed(validationError);
    const typedPages = pages as HandwritingPage[];
    const pagesChanged = preparePages(typedPages);
    if (version === 3) {
      const candidate = value as HandwritingDocumentV3;
      if (candidate.profile && typeof candidate.profile.targetHeight === "number") return { ok: true, document: candidate, migrated: pagesChanged };
      return { ok: true, document: { ...candidate, profile: { targetHeight: 52, samples: 0, averageSlope: 0 } }, migrated: true };
    }
    // V2 → V3: ursprüngliche (unbekannte) Felder bleiben erhalten.
    return {
      ok: true,
      migrated: true,
      document: { ...value, version: 3, pages: typedPages, profile: { targetHeight: 52, samples: 0, averageSlope: 0 } } as unknown as HandwritingDocumentV3
    };
  }
  if (version === 1) {
    if (!isLegacyDocument(value)) return malformed("V1-Dokument unvollständig oder beschädigt");
    const elements: PageElement[] = [
      ...value.strokes.map((stroke): StrokeElement => ({ ...stroke, type: "stroke" })),
      ...(value.texts ?? []).map((text): TextElement => ({ ...text, type: "text" }))
    ];
    for (let elementIndex = 0; elementIndex < elements.length; elementIndex += 1) {
      const error = validateElement(elements[elementIndex], `Seite 1, Element ${elementIndex + 1}`);
      if (error) return malformed(error);
    }
    return {
      ok: true,
      migrated: true,
      document: {
        version: 3,
        profile: { targetHeight: 52, samples: 0, averageSlope: 0 },
        pages: [{
          id: crypto.randomUUID(),
          width: value.width,
          height: Math.round(value.width * 297 / 210),
          paper: value.paper,
          elements,
          baselines: []
        }]
      }
    };
  }
  if (isFiniteNumber(version) && version > 3) return { ok: false, document: null, error: { kind: "unsupported-version", version } };
  return malformed(isFiniteNumber(version) ? `unbekannte Versionsnummer ${version}` : "fehlende oder ungültige Versionsnummer");
}

/**
 * Kompatibilitäts-Wrapper mit der bisherigen Signatur: Fehlerfälle sind null.
 * Neue Aufrufer sollten parseNotebook für die Fehlergründe verwenden.
 */
export function parseDocument(value: unknown): { document: HandwritingDocumentV3; migrated: boolean } | null {
  const result = parseNotebook(value);
  return result.ok ? { document: result.document, migrated: result.migrated } : null;
}

export function cloneDocument(document: HandwritingDocumentV3): HandwritingDocumentV3 {
  return structuredClone(document);
}

export function elementBounds(element: PageElement): { minX: number; minY: number; maxX: number; maxY: number } {
  if (element.type === "image") {
    return { minX: element.x, minY: element.y, maxX: element.x + element.width, maxY: element.y + element.height };
  }
  if (element.type === "text") {
    const height = element.height ?? element.fontSize * 1.2;
    return {
      minX: element.x,
      minY: element.baseline - element.fontSize,
      maxX: element.x + element.width,
      maxY: element.baseline - element.fontSize + height
    };
  }
  if (element.type === "highlight") {
    if (element.points?.length) {
      const bounds = element.points.reduce((box, point) => ({
        minX: Math.min(box.minX, point.x), minY: Math.min(box.minY, point.y),
        maxX: Math.max(box.maxX, point.x), maxY: Math.max(box.maxY, point.y)
      }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
      return { minX: bounds.minX - element.size / 2, minY: bounds.minY - element.size / 2, maxX: bounds.maxX + element.size / 2, maxY: bounds.maxY + element.size / 2 };
    }
    return {
      minX: Math.min(element.x1, element.x2),
      minY: element.y - element.size / 2,
      maxX: Math.max(element.x1, element.x2),
      maxY: element.y + element.size / 2
    };
  }
  const points = element.points;
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return points.reduce((box, point) => ({
    minX: Math.min(box.minX, point.x),
    minY: Math.min(box.minY, point.y),
    maxX: Math.max(box.maxX, point.x),
    maxY: Math.max(box.maxY, point.y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

export function boundsForElements(elements: PageElement[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return elements.reduce((box, element) => {
    const bounds = elementBounds(element);
    return {
      minX: Math.min(box.minX, bounds.minX),
      minY: Math.min(box.minY, bounds.minY),
      maxX: Math.max(box.maxX, bounds.maxX),
      maxY: Math.max(box.maxY, bounds.maxY)
    };
  }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

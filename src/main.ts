import { App, Editor, MarkdownPostProcessorContext, MarkdownRenderChild, Notice, Plugin, PluginSettingTab, Setting, TFile, loadPdfJs, normalizePath } from "obsidian";
import { HandwritingDocumentV3, HandwritingPage, HighlightElement, ImageElement, PageElement, Paper, ShapeElement, ShapeKind, StrokeElement, alignPageBaselines, cloneDocument, createDocument, createPage, elementBounds, mergeClosedLineShapes, parseNotebook } from "./document";
import { normalizeHandwritingV2 } from "./handwriting-v2";
import {PAPER_WRITING_DEFAULTS,PaperWritingSettings,paperWritingLayout,splitNewInkWords,isDrawingCluster,allowHoldSnap} from "./handwriting-layout";
import {penCursorActive,isPenInput,isFingerInput,describePenDiagnostic,PenDiagnosticSample,PenPressureTracker,strokeIsStuck} from "./input-device";
import { drawShapeMeasurements, shapeMeasurements } from "./shape-measurements";
import { ShapeDragTool, draggedShapePoints, optimizeShape, shapeContainsPoint, snapLineAngle, snapStrokeEndpoints } from "./shapes";
import { InkPoint, InkStroke, cleanCapturedStroke, pressureWidth, strokeTouches, visibleInkColor } from "./strokes";
import { SelectionBox, boxOf, circleLassoGesture, duplicateElements, lassoSelection, rectangleSelection, scaleElements, scratchEraseGesture, scratchedElements, translateElements } from "./selection";
import { PdfAnnotationManager } from "./pdf-annotation";
import { buildImagePdf, buildMultiPageImagePdf, dataUrlBytes } from "./export";
import { LocalHandwritingRecognizer } from "./htr-client";
import { reviewHandwriting } from "./handwriting-review";
import { reconstructLine } from "./htr-core";
import { applyReconstructions, restoreReconstructions, segmentInkLines } from "./htr-core";
import { drawBoardElement, drawText } from "./rendering";
import { drawLiveInk } from "./live-ink";
import { editNotebookText } from "./notebook-text";
import { editNotebookImage, waitForNotebookImage } from "./notebook-image";
import { drawNotebookMarker, snapMarkerToText } from "./notebook-marker";
import { abortable } from "./abortable";
import { applyDockIcons, applyIcon, rangeControl, rgbPicker, switchControl, thicknessControl, applyToolIcon } from "./editor-controls";
import { EditorSnapshots } from "./editor-history";
import { SaveQueue, SaveTracker } from "./save-queue";
import { NotebookCommandService } from "./notebook-commands";
import type { AppliedNotebookBatch } from "./notebook-commands";
import type { NotebookWriteBatch } from "./notebook-commands";
import { AgentChannel } from "./agent-channel";
import type { AgentProposalOutcome } from "./agent-channel";
import { exportNotebookBackup, parseNotebookBackup, prepareBackupPages } from "./notebook-transfer";
import { ONE_NOTE_MAX_BYTES, ONE_NOTE_PAGE_HEIGHT, ONE_NOTE_PAGE_WIDTH, blocksToPageElements, buildOneNoteHtml, extractOneNoteBlocks, layoutOneNoteBlocks, parseMhtArchive, textElementToHtml } from "./onenote-transfer";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { LeafLike } from "./command-target";
import { editableLeaf, pickMarkdownLeaf } from "./command-target";
import caveatFontBytes from "../web/fonts/caveat-latin.woff2";

type Tool = "pen" | "brush" | "highlight" | "eraser" | "laser" | "fill" | "select" | ShapeDragTool;

export interface SmoothHandwritingSettings extends PaperWritingSettings {
  settingsVersion: number;
  folder: string;
  defaultPaper: Paper;
  shapeOptimization: boolean;
  shapeImprovement: number;
  shapeMeasurements: boolean;
  laserSize: number;
  markerSnap: boolean;
  penForceMode: boolean;
  searchCompanion: boolean;
  beautifyEnabled: boolean;
  beautifyCloseLoops: boolean;
  beautifySize: number;
  beautifyStrength: number;
  wordDelay: number;
  markerColor: string;
  markerSize: number;
  penColor: string;
  penSize: number;
  fillColor: string;
  fillOpacity: number;
  pressureEnabled: boolean;
  pressureSensitivity: number;
  /** MCP/Agent-Kanal: standardmäßig aus, Loopback + geteiltes Token. */
  agentEnabled: boolean;
  agentPort: number;
  agentToken: string;
  /** iPad-Parität (alle abschaltbar, Default wie Apple Notes = an): */
  shapeHoldSnap: boolean;
  shapeEndpointSnap: boolean;
  lineAngleSnap: boolean;
  equalizeLetters: boolean;
  smoothInkLines: boolean;
  /** Phase 4: Gesten & Auswahl. */
  circleLasso: boolean;
  scratchErase: boolean;
  /** Live-Umwandlung: nach der Korrekturpause Tinte automatisch in Schrift umwandeln. */
  liveConvert: boolean;
  liveConvertMinConfidence: number;
}

// Nutzerwunsch 10.9.2026 („delay für das fill, weil sonst wird es beim Halten direkt
// gefüllt"): Eine gehaltene Form erscheint zuerst nur als Kontur. Gefüllt wird erst,
// wenn der Stift danach kurz still bleibt — wer sofort weiterschreibt, behält die
// ungefüllte Form. Füllen geht jederzeit gezielt mit dem Füll-Werkzeug.
// Build-Marke: bleibt im minifizierten Bundle erhalten und macht die installierte
// Version eindeutig prüfbar (statt nur dem Manifest zu vertrauen).
const DEFAULT_SETTINGS: SmoothHandwritingSettings = {
  ...PAPER_WRITING_DEFAULTS,
  settingsVersion: 3, folder: "Handwriting", defaultPaper: "grid", shapeOptimization: true, shapeImprovement: 0.7, shapeMeasurements:true, laserSize: 6, wordDelay: 800,
  beautifyEnabled:true, beautifyCloseLoops:true, beautifySize:36, beautifyStrength:.8,
  markerSnap: true, penForceMode: false, searchCompanion: true, markerColor: "#ffd84d", markerSize: 34, penColor: "#202124", penSize: 4,
  fillColor: "#7c5cff", fillOpacity: 0.24, pressureEnabled: true, pressureSensitivity: 0.72,
  agentEnabled: false, agentPort: 27855, agentToken: "",
  shapeHoldSnap: true, shapeEndpointSnap: true, lineAngleSnap: true, equalizeLetters: true, smoothInkLines: true,
  circleLasso: true, scratchErase: true, liveConvert: false, liveConvertMinConfidence: 0.85
};

function isShapeTool(tool: Tool): tool is ShapeDragTool {
  return ["line", "arrow", "ellipse", "circle", "rectangle", "triangle", "diamond"].includes(tool);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function prepareCanvas(canvas: HTMLCanvasElement, page: HandwritingPage, gemessen?: { left: number; top: number; width: number; height: number }): CanvasRenderingContext2D | null {
  const rect = gemessen ?? canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d", { desynchronized: true, alpha: true });
  if (!context) return null;
  context.setTransform(canvas.width / page.width, 0, 0, canvas.height / page.height, 0, 0);
  context.clearRect(0, 0, page.width, page.height);
  return context;
}

export function drawInkStroke(context: CanvasRenderingContext2D, stroke: InkStroke, laser = false): void {
  if (stroke.points.length === 0) return;
  context.save();
  context.strokeStyle = visibleInkColor(stroke.color);
  context.fillStyle = visibleInkColor(stroke.color);
  context.lineCap = "round";
  context.lineJoin = "round";
  if (laser) { context.globalAlpha = 0.92; context.shadowColor = "#404040"; context.shadowBlur = 18; }
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    context.beginPath();
    context.arc(point.x, point.y, pressureWidth(stroke, point) / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }
  if (laser) {
    // One glow pass for the complete tail, not one blurred pass per segment.
    context.lineWidth = stroke.size;
    context.beginPath(); context.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) context.lineTo(stroke.points[i].x, stroke.points[i].y);
    context.stroke(); context.restore(); return;
  }
  for (let index = 0; index < stroke.points.length - 1; index += 1) {
    const before = stroke.points[index];
    const point = stroke.points[index + 1];
    const prior = stroke.points[Math.max(0, index - 1)];
    const start = index === 0 ? before : { x: (prior.x + before.x) / 2, y: (prior.y + before.y) / 2 };
    const end = index === stroke.points.length - 2 ? point : { x: (before.x + point.x) / 2, y: (before.y + point.y) / 2 };
    context.lineWidth = (pressureWidth(stroke, before) + pressureWidth(stroke, point)) / 2;
    context.beginPath();
    context.moveTo(stroke.inkGeometry === "captured" ? before.x : start.x, stroke.inkGeometry === "captured" ? before.y : start.y);
    if(stroke.inkGeometry === "captured") context.lineTo(point.x,point.y);
    else context.quadraticCurveTo(before.x, before.y, end.x, end.y);
    context.stroke();
  }
  context.restore();
}

function drawArrowHead(context: CanvasRenderingContext2D, start: InkPoint, end: InkPoint, size: number): void {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const length = Math.max(18, size * 5);
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - Math.cos(angle - Math.PI / 6) * length, end.y - Math.sin(angle - Math.PI / 6) * length);
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - Math.cos(angle + Math.PI / 6) * length, end.y - Math.sin(angle + Math.PI / 6) * length);
}

export function drawShape(context: CanvasRenderingContext2D, shape: ShapeElement): void {
  if (shape.points.length === 0) return;
  context.save();
  context.strokeStyle = visibleInkColor(shape.color);
  context.lineWidth = shape.size;
  context.lineCap = shape.kind === "ellipse" || shape.kind === "line" || shape.kind === "arrow" ? "round" : "butt";
  context.lineJoin = shape.kind === "ellipse" ? "round" : "miter";
  // Stricharten wie im Export (Code-Audit H-03): Ohne diese Zeilen war eine gestrichelte
  // oder gepunktete Form im Editor durchgezogen, in PDF/Export aber gestrichelt — der
  // Schüler sah also nicht, was er bekommt.
  if (shape.lineStyle === "dashed") context.setLineDash([shape.size * 3.5, shape.size * 2.5]);
  else if (shape.lineStyle === "dotted") { context.setLineDash([0.01, shape.size * 2.8]); context.lineCap = "round"; }
  context.beginPath();
  const first = shape.points[0];
  if (shape.kind === "ellipse") {
    const box = shape.points.reduce((result, point) => ({ minX: Math.min(result.minX, point.x), minY: Math.min(result.minY, point.y), maxX: Math.max(result.maxX, point.x), maxY: Math.max(result.maxY, point.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    context.ellipse((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.maxX - box.minX) / 2, (box.maxY - box.minY) / 2, 0, 0, Math.PI * 2);
  } else if (shape.kind === "rectangle" && shape.points.length === 2) {
    const end = shape.points[1];
    const x = Math.min(first.x, end.x), y = Math.min(first.y, end.y);
    const width = Math.abs(end.x - first.x), height = Math.abs(end.y - first.y);
    // Eckenradius wie im Export — sonst wirkte dieselbe Form im Editor eckig, im PDF rund.
    const radius = Math.min(shape.radius ?? 0, width / 2, height / 2);
    if (radius > 0 && typeof context.roundRect === "function") context.roundRect(x, y, width, height, radius);
    else context.rect(x, y, width, height);
  } else {
    context.moveTo(first.x, first.y);
    for (const point of shape.points.slice(1)) context.lineTo(point.x, point.y);
    if (shape.closed) context.closePath();
    if (shape.kind === "arrow" && shape.points.length >= 2) {
      const last = shape.points[shape.points.length - 1];
      // Doppelpfeile fehlten im Editor ganz (H-03).
      if (shape.startArrow) drawArrowHead(context, last, first, shape.size);
      if (shape.endArrow !== false) drawArrowHead(context, first, last, shape.size);
    }
  }
  if (shape.closed && shape.fillColor && (shape.fillOpacity ?? 0) > 0) {
    context.save();
    context.globalAlpha = shape.fillOpacity ?? 0;
    context.fillStyle = shape.fillColor;
    context.fill();
    context.restore();
  }
  context.stroke();
  context.restore();
  drawShapeMeasurements(context,shape);
}

const imageCache = new Map<string, HTMLImageElement>();

function cachedImage(element: ImageElement, onload?: () => void): HTMLImageElement {
  const existing = imageCache.get(element.dataUrl);
  if (existing) return existing;
  const image = new Image();
  imageCache.set(element.dataUrl, image);
  if (onload) image.addEventListener("load", onload, { once: true });
  image.src = element.dataUrl;
  return image;
}

function drawPaper(context: CanvasRenderingContext2D, page: HandwritingPage): void {
  context.save(); context.fillStyle = "#fff"; context.fillRect(0, 0, page.width, page.height);
  context.strokeStyle = "rgba(86,117,158,.2)"; context.lineWidth = 1;
  if (page.paper === "grid") {
    for (let x = 0; x <= page.width; x += 24) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, page.height); context.stroke(); }
    for (let y = 0; y <= page.height; y += 24) { context.beginPath(); context.moveTo(0, y); context.lineTo(page.width, y); context.stroke(); }
  } else if (page.paper === "lines") {
    for (let y = 32; y <= page.height; y += 32) { context.beginPath(); context.moveTo(0, y); context.lineTo(page.width, y); context.stroke(); }
  }
  context.restore();
}

function drawPageElements(context: CanvasRenderingContext2D, page: HandwritingPage, onImageLoad?: () => void): void {
  for (const element of page.elements.filter((candidate): candidate is ImageElement => candidate.type === "image")) {
    const image = cachedImage(element, onImageLoad);
    if (image.complete && image.naturalWidth > 0) context.drawImage(image, element.x, element.y, element.width, element.height);
  }
  for (const element of page.elements.filter((candidate) => candidate.type === "highlight")) {
    const highlight = element as HighlightElement;
    drawNotebookMarker(context, highlight);
  }
  for (const element of page.elements.filter((candidate) => candidate.type !== "highlight" && candidate.type !== "image")) {
    if (element.type === "stroke") drawInkStroke(context, element);
    else if (element.type === "shape") drawShape(context, element);
    else if (element.type === "text") {
      drawText(context, element, element.fontFamily === "sans" ? undefined : '"Teacher Caveat", "Segoe Print", cursive');
    }
  }
}

export function drawPage(canvas: HTMLCanvasElement, page: HandwritingPage, transient?: InkStroke): void {
  const context = prepareCanvas(canvas, page);
  if (!context) return;
  drawPageElements(context, page, () => drawPage(canvas, page, transient));
  if (transient) drawInkStroke(context, transient, true);
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
}

function loadHtmlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("Bild konnte nicht gelesen werden")); image.src = dataUrl; });
}

/**
 * Rückfrage vor einem zerstörerischen Schritt.
 *
 * `window.confirm` ist in Obsidians Renderer unbrauchbar: Der Aufruf liefert keinen
 * verlässlichen Wert, und `if (!bestaetigt) return;` bricht dann still ab — der Knopf
 * wirkte schlicht kaputt (Nutzerbefund 11.9.2026: „Entfernen funktioniert nicht").
 * Dieser Dialog ist nicht blockierend, mit Tastatur bedienbar und zeigt den Text an,
 * der bei confirm im Titel landete.
 */
function confirmDialog(message: string, danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.body.createDiv({ cls: "hp-confirm-overlay" });
    const box = overlay.createDiv({ cls: "hp-confirm" });
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    const [titel, ...rest] = message.split("\n\n");
    box.createDiv({ cls: "hp-confirm-title", text: titel });
    const body = rest.join("\n\n").trim();
    if (body) box.createDiv({ cls: "hp-confirm-body", text: body });
    const actions = box.createDiv({ cls: "hp-confirm-actions" });
    const abbrechen = actions.createEl("button", { text: "Abbrechen", attr: { "aria-label": "Abbrechen" } });
    const ok = actions.createEl("button", { text: "Entfernen", cls: danger ? "mod-warning" : "mod-cta", attr: { "aria-label": "Bestätigen" } });
    let erledigt = false;
    const schliessen = (wert: boolean) => {
      if (erledigt) return; erledigt = true;
      document.removeEventListener("keydown", taste, true);
      overlay.remove(); resolve(wert);
    };
    const taste = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); schliessen(false); }
      else if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); schliessen(true); }
    };
    abbrechen.onclick = () => schliessen(false);
    ok.onclick = () => schliessen(true);
    overlay.addEventListener("pointerdown", (event) => { if (event.target === overlay) schliessen(false); });
    document.addEventListener("keydown", taste, true);
    window.setTimeout(() => ok.focus(), 0);
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Datei ausliefern — auf dem iPad über das Teilen-Blatt, sonst als Download.
 *
 * Warum: Der Download-Weg (<a download>) ist in WKWebView (Obsidian Mobile) unzuverlässig
 * bzw. unsichtbar — dort landet die Datei nirgends, die Hausaufgabe lässt sich also nicht
 * abgeben (Paritäts-Audit 11.9.2026, Blocker A1). Wo das System Teilen anbietet, nutzen wir es.
 * Auf dem Desktop bleibt alles wie vorher (kein Teilen-Dialog nötig, sofortiger Download).
 */
async function deliverFile(blob: Blob, filename: string, shareTitle?: string): Promise<boolean> {
  try {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
    const shareApi = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
    if (typeof navigator.share === "function" && shareApi.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: shareTitle ?? filename });
      return true;
    }
  } catch (error) {
    // Abbruch durch den Nutzer ist kein Fehler — dann passiert einfach nichts.
    if (error instanceof DOMException && error.name === "AbortError") return true;
  }
  downloadBlob(blob, filename);
  return false;
}

function setPaperClass(element: HTMLElement, paper: Paper): void {
  element.removeClass("hp-paper-grid", "hp-paper-lines", "hp-paper-blank");
  element.addClass(`hp-paper-${paper}`);
}

export class InlineHandwritingEditor extends MarkdownRenderChild {
  private handwritingMode = true;
  private recognizer?: LocalHandwritingRecognizer;
  private document: HandwritingDocumentV3;
  private wrapper!: HTMLDivElement;
  private pagesEl!: HTMLDivElement;
  private pageCountEl!: HTMLSpanElement;
  private statusEl!: HTMLSpanElement;
  private editButton!: HTMLButtonElement;
  private toggleButton!: HTMLButtonElement;
  private toolbar!: HTMLDivElement;
  private optionsPanel!: HTMLDivElement;
  private paperSelect!: HTMLSelectElement;
  private paperButtons = new Map<Paper,HTMLButtonElement>();
  private reticle!: HTMLDivElement;

  /**
   * Zwischenspeicher für die Canvas-Maße, gültig für EIN Anzeigebild.
   *
   * `getBoundingClientRect()` erzwingt ein Layout. Im Zeichenpfad lief es pro
   * Stift-Ereignis — gemessen 203 Aufrufe für 200 Punkte (11.9.2026). Bei einem echten
   * Stift mit über 100 Ereignissen je Sekunde ist das der spürbare Input-Delay.
   * `document.timeline.currentTime` wechselt genau einmal pro Bild; innerhalb eines
   * Bildes ist eine Neuberechnung unnötig und war die Ursache der Verzögerung.
   */
  private rectCache = new WeakMap<HTMLCanvasElement, { clock: number; rect: { left: number; top: number; width: number; height: number } }>();

  private measuredRect(canvas: HTMLCanvasElement): { left: number; top: number; width: number; height: number } {
    const clock = typeof document !== "undefined" && document.timeline && typeof document.timeline.currentTime === "number"
      ? document.timeline.currentTime
      : Date.now();
    const treffer = this.rectCache.get(canvas);
    if (treffer && treffer.clock === clock) return treffer.rect;
    const messwert = canvas.getBoundingClientRect();
    const rect = { left: messwert.left, top: messwert.top, width: messwert.width, height: messwert.height };
    this.rectCache.set(canvas, { clock, rect });
    return rect;
  }

  // Letzte Maus-/Touchpad-Aktivität: ein nur schwebender Stift soll das Touchpad nicht überstimmen.
  private lastMouseActivityTs = Number.NEGATIVE_INFINITY;
  /** Letzter angewandter Stiftmodus — vermeidet unnötige DOM-Schreibzugriffe. */
  private penHoverState: boolean | null = null;
  private tool: Tool = "pen";
  private activePageId: string;
  private readonly canvases = new Map<string, HTMLCanvasElement>();
  private readonly overlays = new Map<string, HTMLCanvasElement>();
  private laserFrame: number | null = null;
  private snapshots = new EditorSnapshots();
  private observers: ResizeObserver[] = [];
  private history: HandwritingDocumentV3[] = [];
  private future: HandwritingDocumentV3[] = [];
  private currentElementId: string | null = null;
  private currentRawPoints: InkPoint[] = [];
  private pointerPageId: string | null = null;
  private activePointerId: number | null = null;
  private transientLaser: InkStroke | null = null;
  /** Zeitstempel der letzten Bewegung — Grundlage für „Zeichnen & Halten“. */
  private lastMoveTs: number | null = null;
  /* Phase 4: Auswahl & Gesten. */
  private readonly selectionOverlays = new Map<string, HTMLCanvasElement>();
  private selectionIds = new Set<string>();
  private selectionPageId: string | null = null;
  private selectionBox: SelectionBox | null = null;
  private marqueeStart: InkPoint | null = null;
  private dragStart: InkPoint | null = null;
  private dragSnapshot: PageElement[] = [];
  private resizeHandle: number | null = null;
  private resizeSnapshot: PageElement[] = [];
  private resizeBox: SelectionBox | null = null;
  private resizeCurrent: InkPoint | null = null;
  private selectionActions!: HTMLDivElement;
  /** Touch-Tap-Position im Auswahlwerkzeug (Tap = Treffer, Wisch = Scrollen). */
  private touchSelectDown: InkPoint | null = null;
  /* Phase 4: Seitenleiste & Zoom. */
  private pageStrip!: HTMLDivElement;
  private headerEl!: HTMLDivElement;
  /** Canvas-Lineal: Position + Winkel; Stift-Striche snappen darauf. */
  private ruler: { x: number; y: number; angle: number } | null = null;
  private rulerDrag: "move" | "rotate" | null = null;
  private rulerDragStart: InkPoint | null = null;
  private rulerStart: { x: number; y: number; angle: number } | null = null;
  /** Aktiver Strich dockt ans Lineal an (Stift, nah gestartet). */
  private rulerSnapping = false;
  private rulerToolButton?: HTMLButtonElement;
  private lastMovePoint: { x: number; y: number } | null = null;
  /**
   * Sicherheitsnetz gegen hängende Striche (iPad-Befund 13.9.2026): iOS schickt beim Aufsetzen
   * der Handfläche oder beim Wechsel in den Hintergrund nicht immer ein `pointerup`. Blieb der
   * Editor danach in „Strich läuft" stehen, verschluckte der nächste `pointerdown` den neuen
   * Strich lautlos — der Nutzer sah „reagiert manchmal nicht".
   */
  private lastPointerActivityTs = 0;
  /** Beginn des laufenden Strichs — filtert verspätete Abschluss-Ereignisse (iOS). */
  private strokeStartedTs = 0;
  /** Client-Koordinate des laufenden Aufsetzens — erkennt doppelt gemeldete `pointerdown`. */
  private strokeStartClient: { x: number; y: number } | null = null;
  /** Letzte Client-Koordinate: ein Abbruch ohne Koordinaten darf keinen Strich ins Eck setzen. */
  private lastClientPoint: { x: number; y: number } | null = null;
  /** Druckauswertung je Zeiger — erkennt, ob der Treiber echten Druck liefert (Apple Pencil). */
  private readonly pressureTracker = new PenPressureTracker();
  /** Bild/PDF-Input für den Upload-Button in der Werkzeugleiste. */
  private importImageInput!: HTMLInputElement;
  private zoom = 1;
  private saveTimer: number | null = null;
  private wordTimers = new Map<string, number>();
  private readonly saves = new SaveTracker();
  private readonly saveQueue = new SaveQueue();
  private saveFailures = 0;
  private lastWriteTimeMs = 0;
  private saveConflictShown = false;
  private get dirty(): boolean { return this.saves.dirty; }
  /** Angewendete Agent-Batches (Idempotenz für MCP-Retries). */
  private readonly appliedAgentRequests = new Set<string>();
  /** Geteilte, validierte Befehls-Schicht für UI und MCP (§19). */
  readonly commandService = new NotebookCommandService(this);

  /* ------------------------- NotebookCommandHost ------------------------- */
  getRevision(): number { return this.saves.revision; }
  getPage(pageId: string): HandwritingPage | null { return this.page(pageId) ?? null; }
  isWritingLocked(): boolean { return this.pointerPageId !== null || this.importing || this.objectEditing; }
  hasApplied(requestId: string): boolean { return this.appliedAgentRequests.has(requestId); }
  applyApplied(batch: AppliedNotebookBatch): void {
    const page = this.page(batch.pageId);
    if (!page) return;
    this.remember();
    page.elements = batch.elements;
    this.appliedAgentRequests.add(batch.requestId);
    // Deckel gegen unbegrenztes Wachstum in langen Sitzungen (Code-Audit N-05).
    // Großzügig gewählt: ein zu früh vergessener Eintrag würde einen Retry doppelt anwenden.
    while (this.appliedAgentRequests.size > 512) {
      const aeltester = this.appliedAgentRequests.values().next().value;
      if (aeltester === undefined) break;
      this.appliedAgentRequests.delete(aeltester);
    }
    this.clearPendingNormalization();
    this.markChanged();
    this.redrawPage(page.id);
    this.setStatus(batch.origin?.label ? `Agent-Beitrag „${batch.origin.label}“ angewendet` : "Agent-Beitrag angewendet");
  }
  private pendingAgentProposal: { ui: HTMLElement; finish: (outcome: AgentProposalOutcome) => void; timeout: number } | null = null;

  /** Öffentlicher Seiten-Lookup für die Agenten-Inspektion. */
  pageFor(pageId: string): HandwritingPage | undefined { return this.page(pageId); }
  activeAgentPage(): HandwritingPage | undefined { return this.activePage(); }

  /** Inspektionsdaten einer Seite (begrenzt, ohne rohe Vault-Pfade). */
  agentInspection(page: HandwritingPage): {
    pageId: string; width: number; height: number; paper: string; revision: number; elementCount: number;
    elements: { id: string; type: string; label?: string; bounds: { minX: number; minY: number; maxX: number; maxY: number } }[];
  } {
    return {
      pageId: page.id,
      width: page.width,
      height: page.height,
      paper: page.paper,
      revision: this.getRevision(),
      elementCount: page.elements.length,
      elements: page.elements.slice(0, 5_000).map((element) => {
        const entry: { id: string; type: string; label?: string; bounds: { minX: number; minY: number; maxX: number; maxY: number } } = {
          id: element.id, type: element.type, bounds: elementBounds(element),
        };
        if (element.type === "text") entry.label = element.text.slice(0, 120);
        return entry;
      }),
    };
  }

  /**
   * Sichtbarer Agent-Vorschlag: erst validieren (stage), dann Annehmen/Verwerfen.
   * Annahme ruft commandService.execute mit erneuter Revisionsprüfung —
   * zwischenzeitliche Nutzereingaben machen den Vorschlag veraltet, nichts wird still überschrieben.
   */
  proposeAgentBatch(batch: NotebookWriteBatch, label: string | null): Promise<AgentProposalOutcome> {
    return new Promise((resolve) => {
      if (this.pendingAgentProposal) { resolve({ error: "Im Editor liegt bereits ein offener Vorschlag" }); return; }
      const staged = this.commandService.stage(batch);
      if (!staged.ok) { resolve({ error: `Vorschlag ungültig (${staged.errors.map((entry) => entry.code).join(", ")})` }); return; }
      const applied = staged.applied;
      const ui = this.wrapper.createDiv({ cls: "hp-agent-proposal" });
      ui.createSpan({ cls: "hp-agent-title", text: label ? `Agent-Vorschlag „${label}“` : "Agent-Vorschlag" });
      ui.createSpan({ cls: "hp-agent-summary", text: `+${applied.addedIds.length} neu · ${applied.updatedIds.length} geändert · ${applied.removedIds.length} entfernt` });
      ui.createSpan({ cls: "hp-agent-wait", text: "wartet auf deine Entscheidung" });
      const accept = ui.createEl("button", { cls: "hp-agent-accept", text: "Annehmen" });
      const reject = ui.createEl("button", { cls: "hp-agent-reject", text: "Verwerfen" });
      this.wrapper.prepend(ui);
      const finish = (outcome: AgentProposalOutcome): void => {
        if (!this.pendingAgentProposal) return;
        window.clearTimeout(this.pendingAgentProposal.timeout);
        this.pendingAgentProposal = null;
        ui.remove();
        resolve(outcome);
      };
      this.pendingAgentProposal = { ui, finish, timeout: window.setTimeout(() => finish({ error: "Vorschlag nicht entschieden (abgelaufen)" }), 300_000) };
      accept.addEventListener("click", () => {
        // Erneut gegen die aktuelle Revision validieren — der Mensch hat vielleicht weitergeschrieben.
        const result = this.commandService.execute(batch);
        if (result.ok) finish({ result: { ok: true, applied: true, addedIds: result.addedIds, updatedIds: result.updatedIds, removedIds: result.removedIds } });
        else finish({ result: { ok: false, applied: false, reason: String(result.errors[0]?.code ?? "invalid") } });
      });
      reject.addEventListener("click", () => finish({ result: { ok: false, applied: false, reason: "rejected" } }));
    });
  }
  private importing = false;
  private importAbort: AbortController | null = null;
  private editing = false;
  private expanded = false;
  private pendingStrokes = new Map<string, Set<string>>();
  private normalizationQueue: Promise<void> = Promise.resolve();
  private normalizationEpoch = 0;
  private toolButtons = new Map<Tool, HTMLButtonElement>();
  private portalAnchor: Comment | null = null;
  private touchScroll = new Map<number, number>();
  /** Hat der Radierer in dieser Geste etwas getroffen? (M-04) */
  private erasedSomething = false;
  private shapeDragStart: InkPoint | null = null;
  private objectEditing = false;
  private exporting = false;
  private editedObjectId: string | null = null;
  private objectAbort: AbortController | null = null;
  /**
   * Zuletzt durch einen Systemabbruch verlorene Textentwürfe, je Seite. Ein Schüler, der
   * mitten im Schreiben versehentlich die Seite wechselt oder das Fenster schließt, verliert
   * seine Arbeit sonst ersatzlos (Blocker A4). Beim nächsten neuen Textfeld auf derselben
   * Seite wird der Entwurf angeboten und gemeldet — nur im Arbeitsspeicher, damit keine
   * zusätzlichen Dateien im Vault entstehen.
   */
  private abandonedDrafts = new Map<string, import("./document").TextElement>();
  private pendingInsert: "text" | "table" | null = null;

  constructor(container: HTMLElement, private readonly plugin: SmoothHandwritingPlugin, private readonly file: TFile, document: HandwritingDocumentV3, migrated: boolean) {
    super(container);
    this.document = document;
    this.activePageId = document.pages[0].id;
    if (migrated) this.saves.flagDirty();
    // Lab-Mock und frisch erzeugte Dateien können ohne stat existieren; ohne
    // mtime läuft der Editor ohne Extern-Konflikt-Erkennung (sicherer Fall).
    this.lastWriteTimeMs = this.file.stat?.mtime ?? 0;
    this.plugin.registerEditor(this, file.path);
  }

  onload(): void {
    this.mount();
    if (this.dirty) this.scheduleSave();
    const keyHandler = (event: KeyboardEvent): void => {
      if (this.objectEditing || document.querySelector("dialog[open]") || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "Escape" && this.pendingInsert) { this.pendingInsert=null; this.setStatus(""); return; }
      if (event.key === "Escape" && this.editing) this.setEditing(false);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && this.editing) { event.preventDefault(); if (event.shiftKey) this.redo(); else this.undo(); }
      /* Phase 4: Auswahl-Tastatur (nur im Editor, nicht während Texteingabe). */
      if (this.editing && this.tool === "select" && this.selectionIds.size > 0) {
        if (event.key === "Escape") { this.clearSelection(); return; }
        if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); this.deleteSelected(); return; }
        const step = event.shiftKey ? 10 : 1;
        const nudges: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const nudge = nudges[event.key];
        if (nudge) { event.preventDefault(); this.nudgeSelected(nudge[0], nudge[1]); }
      }
    };
    document.addEventListener("keydown", keyHandler);
    this.register(() => document.removeEventListener("keydown", keyHandler));
  }

  openEditor(): void {
    if (!this.editing) this.setEditing(true);
  }

  onunload(): void {
    this.pendingAgentProposal?.finish({ error: "Editor geschlossen" });
    this.plugin.unregisterEditor(this, this.file.path);
    this.clearPendingNormalization();
    this.objectAbort?.abort();
    // Der Zeiger darf nach dem Schließen nicht unsichtbar bleiben (Code-Audit K-01).
    this.setPenCursorActive(false);
    this.cancelPreviewFrame();
    if (this.shapeFeedbackFrame) { cancelAnimationFrame(this.shapeFeedbackFrame); this.shapeFeedbackFrame = 0; }
    if (this.liveInkFrame) { cancelAnimationFrame(this.liveInkFrame); this.liveInkFrame = 0; }
    this.liveInkPending = null;
    this.touchScroll.clear();
    if (this.laserFrame !== null) cancelAnimationFrame(this.laserFrame);
    this.importAbort?.abort();
    this.recognizer?.dispose();
    if (this.pointerPageId) { this.saves.flagDirty(); this.pointerPageId = null; }
    this.restoreFromPortal();
    this.disconnectObservers();
    document.body.removeClass("hp-editor-open");
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    for (const timer of this.wordTimers.values()) window.clearTimeout(timer);
    if (this.dirty) void this.saveNow();
  }

  private mount(): void {
    this.containerEl.empty();
    this.wrapper = this.containerEl.createDiv("hp-inline");
    const header = this.wrapper.createDiv("hp-inline-header");
    this.headerEl = header;
    header.createSpan({ cls: "hp-inline-title", text: "Smooth Handwriting" });
    this.pageCountEl = header.createSpan("hp-page-count");
    this.statusEl = header.createSpan("hp-status");
    // Der Header kann bei schmalem Fenster auf mehrere Zeilen umbrechen. Die Seitenübersicht
    // hing an festen 52 px und saß dann unter dem Header (UI-Audit 4.2). Die echte Höhe wird
    // als CSS-Variable geführt und beim Umbruch nachgeführt.
    const headerRo = new ResizeObserver(() => {
      const hoehe = Math.round(header.getBoundingClientRect().height);
      if (hoehe > 0) this.wrapper.style.setProperty("--hp-header-height", `${hoehe}px`);
    });
    headerRo.observe(header); this.observers.push(headerRo);
    const papers=header.createDiv({cls:"hp-paper-switch",attr:{role:"group","aria-label":"Papier schnell wechseln"}});
    header.insertBefore(papers,this.statusEl);
    for(const [paper,label] of [["grid","Kariert"],["lines","Liniert"],["blank","Blanko"]] as const) {
      const button=papers.createEl("button",{text:label,attr:{"aria-pressed":"false",title:`Aktive Seite: ${label}`}});
      button.onclick=()=>this.changePaper(paper);
      this.paperButtons.set(paper,button);
    }
    const toolsToggle = header.createEl("button", { cls: "hp-tools-toggle", text: "Werkzeuge", attr: { "aria-expanded": "true" } });
    toolsToggle.onclick = () => { const hidden = this.wrapper.classList.toggle("is-tools-hidden"); toolsToggle.setAttribute("aria-expanded", String(!hidden)); requestAnimationFrame(() => this.redrawAll()); };
    this.editButton = header.createEl("button", { cls: "mod-cta", text: "Bearbeiten" });
    this.editButton.addEventListener("click", () => this.setEditing(!this.editing));
    // Nutzerwunsch 11.9.2026: neben „Bearbeiten" auch ein Weg, den Block wieder loszuwerden.
    const entfernen = header.createEl("button", { text: "Entfernen", attr: { "aria-label": "Handschriftblock entfernen", title: "Block und Datei entfernen" } });
    entfernen.addEventListener("click", () => void this.removeSelf());
    this.buildToolbar();
    this.pagesEl = this.wrapper.createDiv("hp-pages");
    this.pageStrip = this.wrapper.createDiv("hp-page-strip");
    this.pageStrip.hidden = true;
    // Untere Ansichtsleiste: Seitenübersicht + Zoom sitzen hier fest statt frei über dem Blatt zu schweben.
    const viewBar = this.wrapper.createDiv("hp-view-bar");
    const stripToggle = viewBar.createEl("button", { cls: "hp-strip-toggle", attr: { "aria-label": "Seitenübersicht öffnen/schließen", title: "Seitenübersicht" } });
    stripToggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16"/></svg>';
    stripToggle.onclick = () => { this.pageStrip.hidden = !this.pageStrip.hidden; this.pageStrip.style.top = `${Math.round(this.headerEl.getBoundingClientRect().bottom)}px`; this.wrapper.classList.toggle("is-strip-open", !this.pageStrip.hidden); if (!this.pageStrip.hidden) this.rebuildPageStrip(); };
    const zoomControls = viewBar.createDiv("hp-zoom-controls");
    const zoomOut = zoomControls.createEl("button", { attr: { "aria-label": "Verkleinern", title: "Verkleinern" } });
    zoomOut.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/></svg>';
    zoomOut.onclick = () => this.setZoom(this.zoom / 1.25);
    this.zoomLabel = zoomControls.createEl("span", { cls: "hp-zoom-label", text: "100 %" });
    const zoomIn = zoomControls.createEl("button", { attr: { "aria-label": "Vergrößern", title: "Vergrößern" } });
    zoomIn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6M11 8v6"/></svg>';
    zoomIn.onclick = () => this.setZoom(this.zoom * 1.25);
    const zoomFit = zoomControls.createEl("button", { attr: { "aria-label": "Seitenbreite anpassen", title: "Seitenbreite anpassen" } });
    zoomFit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
    zoomFit.onclick = () => this.fitZoom();
    this.pagesEl.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      this.setZoom(this.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
    }, { passive: false });
    this.toggleButton = this.wrapper.createEl("button", { cls: "hp-expand-button", text: "⌄", attr: { "aria-label": "Handschriftvorschau aufklappen", title: "Block vergrößern" } });
    this.toggleButton.addEventListener("click", () => this.setExpanded(!this.expanded));
    this.reticle = this.wrapper.createDiv("hp-pen-reticle");
    this.rebuildPages();
    this.rebuildPageStrip();
    this.updateHeader();
  }

  private labeledControl(label: string): HTMLDivElement {
    const section = (label === "Werkzeug" ? this.toolbar : this.optionsPanel).createEl("details", { cls: "hp-tool-section" });
    section.open = ["Werkzeug", "Schreiben"].includes(label);
    if(label!=="Werkzeug") section.addEventListener("toggle",()=> { if(section.open) this.optionsPanel.querySelectorAll<HTMLDetailsElement>("details").forEach(other=> { if(other!==section) other.open=false; }); });
    section.createEl("summary", { text: label });
    const group = section.createDiv("hp-tool-group");
    return group;
  }

  private buildToolbar(): void {
    this.toolbar = this.wrapper.createDiv("hp-toolbar");
    this.optionsPanel = this.toolbar.createDiv("hp-options-panel"); this.optionsPanel.hidden = true;
    const toolGroup = this.labeledControl("Werkzeug");
    const tools: Array<[Tool, string, string]> = [["pen", "✎", "Stift"], ["brush", "🖌", "Pinsel (Breite folgt dem Tempo)"], ["highlight", "▰", "Intelligenter Markierer"], ["eraser", "⌫", "Radierer"], ["fill", "▣", "Geschlossene Form mit Stifttipp füllen"], ["laser", "●", "Präsentationsstift (nur beim Halten)"]];
    tools.unshift(["select", "↖", "Text, Tabellen und Bilder auswählen"]);
    for (const [tool, icon, label] of tools) {
      // Symbol als Strich-SVG statt gemischter Emoji/Textzeichen (UI-Audit 2.4).
      const button = toolGroup.createEl("button", { attr: { "aria-label": label, title: label } });
      applyToolIcon(button, tool); void icon;
      button.addEventListener("click", () => this.activateTool(tool));
      this.toolButtons.set(tool, button);
    }
    toolGroup.createEl("button", { text: "T", attr: { "aria-label": "Text einfügen", title: "Text einfügen" } }).onclick = () => void this.insertText();
    toolGroup.createEl("button", { text: "↶", attr: { "aria-label": "Rückgängig", title: "Rückgängig" } }).onclick = () => this.undo();
    toolGroup.createEl("button", { text: "↷", attr: { "aria-label": "Wiederholen", title: "Strg/⌘ + Umschalt + Z" } }).onclick = () => this.redo();
    // Import/Export bündeln in „Weitere Werkzeuge“ → Datei; hier bleibt nur der direkte Export.
    toolGroup.createEl("button", { attr: { "aria-label": "PDF exportieren", title: "Alle Seiten als PDF exportieren" } }).onclick = () => void this.exportAllPagesPdf();
    // Upload direkt in der Leiste: ein Klick öffnet den Dateidialog (kein Dropdown,
    // nichts überlappt die Zeichenfläche). Einträge für OneNote/Backup bleiben im •••-Menü → Datei.
    const uploadButton = toolGroup.createEl("button", { attr: { "aria-label": "Bild oder PDF importieren", title: "Bild (.png .jpg .webp) oder PDF importieren" } });
    uploadButton.addEventListener("click", (event) => { event.stopPropagation(); this.importImageInput.click(); });
    applyIcon(uploadButton);
    // Lineal auch in der Leiste: gleicher Zustand wie der Header-Toggle.
    const rulerToolButton = toolGroup.createEl("button", { cls: "hp-ruler-button", attr: { "aria-label": "Lineal anzeigen", "aria-pressed": "false", title: "Lineal einblenden (Stift dockt an, Enden ziehen = drehen)" } });
    rulerToolButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/></svg>';
    rulerToolButton.addEventListener("click", (event) => { event.stopPropagation(); this.toggleRuler(); });
    this.rulerToolButton = rulerToolButton;
    const more = toolGroup.createEl("button", { text: "•••", attr: { "aria-label": "Weitere Werkzeuge", "aria-expanded": "false" } });
    const colorButton = toolGroup.createEl("button", { cls: "hp-rgb-toggle", attr: { "aria-label": "RGB-Farbe auswählen", title: "RGB-Farbe auswählen", "aria-expanded": "false" } });
    toolGroup.insertBefore(colorButton, more);
    // Keep selection last in both the visual layout and keyboard navigation order.
    toolGroup.append(this.toolButtons.get("select")!);
    this.selectionActions = this.toolbar.createDiv("hp-selection-actions");
    this.selectionActions.hidden = true;
    this.selectionActions.createSpan({ cls: "hp-selection-count", text: "0 Objekte ausgewählt" });
    const duplicateAction = this.selectionActions.createEl("button", { text: "Duplizieren", attr: { "aria-label": "Auswahl duplizieren" } });
    duplicateAction.onclick = () => this.duplicateSelected();
    const recolorAction = this.selectionActions.createEl("button", { text: "Einfärben", attr: { "aria-label": "Auswahl einfärben (Marker in Markerfarbe)", title: "Auswahl einfärben" } });
    recolorAction.onclick = () => this.recolorSelected();
    const deleteAction = this.selectionActions.createEl("button", { text: "Löschen", attr: { "aria-label": "Auswahl löschen" } });
    deleteAction.onclick = () => this.deleteSelected();
    for (const action of [duplicateAction, recolorAction, deleteAction]) applyIcon(action);
    const colorPanel = this.toolbar.createDiv("hp-color-panel"); colorPanel.hidden = true;
    const colorTarget = colorPanel.createEl("select", { attr: { "aria-label": "Farbe für" } });
    for (const [value, text] of [["penColor", "Stift"], ["markerColor", "Marker"], ["fillColor", "Füllung"]]) colorTarget.createEl("option", { value, text });
    const rgb = rgbPicker(colorPanel, this.plugin.settings.penColor, value => {
      const target = colorTarget.value as "penColor" | "markerColor" | "fillColor";
      this.plugin.settings[target] = value;
      colorButton.style.setProperty("--hp-selected-color", value);
      this.updateReticleStyle();
    });
    colorPanel.addEventListener("change", () => void this.plugin.persistSettings());
    colorTarget.onchange = () => rgb.setColor(this.plugin.settings[colorTarget.value as "penColor" | "markerColor" | "fillColor"]);
    colorButton.onclick = () => { colorPanel.hidden = !colorPanel.hidden; colorButton.setAttribute("aria-expanded", String(!colorPanel.hidden)); if (!colorPanel.hidden) { this.optionsPanel.hidden = true; more.setAttribute("aria-expanded", "false"); } };
    applyDockIcons(toolGroup);
    toolGroup.style.setProperty("--hp-tool-count",String(toolGroup.querySelectorAll(":scope > button").length));
    more.onclick = () => { this.optionsPanel.hidden = !this.optionsPanel.hidden; more.setAttribute("aria-expanded", String(!this.optionsPanel.hidden)); colorPanel.hidden = true; colorButton.setAttribute("aria-expanded", "false"); };
    const writing = this.labeledControl("Schreiben");
    writing.addClass("hp-text-controls");
    switchControl(writing,"Eigene Schrift optimieren",this.plugin.settings.beautifyEnabled,value=> { this.plugin.settings.beautifyEnabled=value; this.clearPendingNormalization(); });
    switchControl(writing,"Kleine Lücken in Ovalen schließen",this.plugin.settings.beautifyCloseLoops,value=> { this.plugin.settings.beautifyCloseLoops=value; });
    writing.createEl("small",{text:"Deine Stiftzüge bleiben erhalten. Keine automatische Textersetzung. Ecken, Ober-/Unterlängen und verbundene Buchstaben bleiben persönlich."});
    switchControl(writing,"Schrifthöhe am Papier ausrichten",this.plugin.settings.beautifyPaperSize,value=>{this.plugin.settings.beautifyPaperSize=value;});
    for(const [key,label,min,max,step] of [["gridWritingHeight","Kariert: Schrifthöhe",1,3,.5],["lineWritingHeight","Liniert: Schrifthöhe",.5,2,.5]] as const) {
      rangeControl(writing,label,this.plugin.settings[key],min,max,step,value=>{this.plugin.settings[key]=value;},value=>`${value} ${key.startsWith("grid") ? "Kästchen" : "Zeilen"}`);
    }
    writing.createEl("small",{text:"Nur die Höhe ändert sich, die untere Wortkante bleibt an deiner Schreibposition. Keine automatischen Abstände, kein Einrasten und kein Zeilenwechsel. Kariert standardmäßig 2 Kästchen, liniert 1 Zeile hoch."});
    rangeControl(writing,"Manuelle Höhe (Blanko)",this.plugin.settings.beautifySize,20,64,2,value=> { this.plugin.settings.beautifySize=value; },value=>`${value} px`);
    rangeControl(writing,"Striche begradigen",this.plugin.settings.beautifyStrength,0,1,.05,value=> { this.plugin.settings.beautifyStrength=value; },value=>`${Math.round(value*100)} %`);
    switchControl(writing,"Buchstaben entzerren",this.plugin.settings.equalizeLetters,value=> { this.plugin.settings.equalizeLetters=value; });
    switchControl(writing,"Striche sanft glätten",this.plugin.settings.smoothInkLines,value=> { this.plugin.settings.smoothInkLines=value; });
    switchControl(writing, "Buchstaben schützen", true, value => { this.handwritingMode = value; this.clearPendingNormalization(); });
    switchControl(writing, "Marker an Text ausrichten", this.plugin.settings.markerSnap, value => { this.plugin.settings.markerSnap = value; });
    switchControl(writing, "Stift als Maus behandeln (Yoga-Fallback)", this.plugin.settings.penForceMode, value => { this.plugin.settings.penForceMode = value; });
    switchControl(writing, "Formen verbessern", this.plugin.settings.shapeOptimization, value => { this.plugin.settings.shapeOptimization = value; });
    rangeControl(writing, "Formkorrektur-Stärke", this.plugin.settings.shapeImprovement || .7, .05, 1, .05, value => { this.plugin.settings.shapeImprovement = value; }, value => `${Math.round(value * 100)} %`);
    writing.createEl("small", { text: "Formkorrektur im Zeichenmodus: Buchstaben schützen ausschalten. Höhere Werte erkennen großzügiger." });
    switchControl(writing, "Halten für perfekte Form", this.plugin.settings.shapeHoldSnap, value => { this.plugin.settings.shapeHoldSnap = value; });
    switchControl(writing, "An Endpunkte einrasten", this.plugin.settings.shapeEndpointSnap, value => { this.plugin.settings.shapeEndpointSnap = value; });
    switchControl(writing, "Linienwinkel einrasten (15°)", this.plugin.settings.lineAngleSnap, value => { this.plugin.settings.lineAngleSnap = value; });
    writing.createEl("small", { text: "Gesten (nur im Schreibmodus): Kreis um Inhalte ⇒ Auswahl; Zickzack-Gekritzel ⇒ darunterliegende Striche weg." });
    switchControl(writing, "Circle-to-Lasso", this.plugin.settings.circleLasso, value => { this.plugin.settings.circleLasso = value; });
    switchControl(writing, "Scribble-to-Erase", this.plugin.settings.scratchErase, value => { this.plugin.settings.scratchErase = value; });
    rangeControl(writing, "Korrekturpause", this.plugin.settings.wordDelay, 400, 1500, 50, value => { this.plugin.settings.wordDelay = value; }, value => `${value} ms`);
    this.optionsPanel.addEventListener("change", () => void this.plugin.persistSettings());
    switchControl(writing, "Live in normale Schrift umwandeln", this.plugin.settings.liveConvert, value => { this.plugin.settings.liveConvert = value; });
    writing.createEl("small", { text: `Live-Umwandlung: nach der Korrekturpause wird erkannt und normaler Text gesetzt. Original bleibt wiederherstellbar (Undo / Original wiederherstellen). Unsichere Erkennungen (Vertrauen < ${Math.round(this.plugin.settings.liveConvertMinConfidence * 100)} %) werden nicht übernommen.` });
    writing.createEl("button", { text: "Optional: in Text umwandeln …" }).onclick = () => void this.recognizeHandwriting();
    writing.createEl("button", { text: "Original wiederherstellen" }).onclick = () => {
      const page = this.activePage(); if (!page) return; this.remember();
      let count = restoreReconstructions(page);
      page.elements=page.elements.map(e=> { if(e.type!=="stroke" || !e.rawPoints) return e; count++; return {...e,points:structuredClone(e.rawPoints)}; });
      this.clearPendingNormalization(); this.markChanged(); this.redrawPage(page.id); this.setStatus(`${count} Originalstriche wiederhergestellt`);
    };
    const shapeGroup = this.labeledControl("Formen");
    switchControl(shapeGroup,"Winkel bei neuen Formen anzeigen",this.plugin.settings.shapeMeasurements,value=>{this.plugin.settings.shapeMeasurements=value;});
    shapeGroup.createEl("small",{text:"Kreis: 360° und Radius. Dreieck/Raute: Innenwinkel. Gerade: Richtung gegen den Uhrzeigersinn ab rechts. Längen in px, nicht cm."});
    const shapeTools: Array<[ShapeDragTool, string, string]> = [
      ["line", "╱", "Gerade"], ["arrow", "➜", "Pfeil"], ["rectangle", "▭", "Rechteck"],
      ["ellipse", "⬭", "Oval"], ["circle", "○", "Kreis"], ["triangle", "△", "Dreieck"], ["diamond", "◇", "Raute"]
    ];
    for (const [tool, icon, label] of shapeTools) {
      // Symbol kommt aus toolPaths (Strich-SVG), nicht aus dem Zeichenvorrat der Schrift.
      const button = shapeGroup.createEl("button", { text: "", attr: { "aria-label": label, title: `${label} ziehen` } });
      button.dataset.hpIconFallback = icon;
      applyToolIcon(button, tool);
      button.addEventListener("click", () => { this.activateTool(tool); this.optionsPanel.hidden=true; more.setAttribute("aria-expanded","false"); this.setStatus(`${label} auf der Seite ziehen`); });
      this.toolButtons.set(tool, button);
    }
    shapeGroup.createEl("small", { text: "Füllung: Farbe und Deckkraft für geschlossene Formen." });
    const fillRow = shapeGroup.createDiv("hp-fill-row");
    const fill = fillRow.createEl("input", { type: "color", value: this.plugin.settings.fillColor, attr: { "aria-label": "Füllfarbe" } });
    fill.addEventListener("input", () => { this.plugin.settings.fillColor = fill.value; void this.plugin.persistSettings(); });
    rangeControl(shapeGroup, "Deckkraft der Füllung", this.plugin.settings.fillOpacity, 0, .8, .05, value => { this.plugin.settings.fillOpacity = value; }, value => value ? `${Math.round(value * 100)} %` : "Aus");
    const colorGroup = this.labeledControl("Stiftfarbe");
    for (const color of ["#202124", "#2457e6", "#d93025", "#16833b", "#7c3aed"]) {
      const swatch = colorGroup.createEl("button", { cls: "hp-color-swatch", attr: { "aria-label": color, title: color } });
      swatch.style.setProperty("--hp-swatch", color);
      swatch.addEventListener("click", () => { colorTarget.value = "penColor"; rgb.setColor(color); void this.plugin.persistSettings(); });
    }
    colorGroup.createEl("button", { text: "RGB mischen", attr: { "aria-label": "Eigene Stiftfarbe" } }).onclick = () => { colorTarget.value = "penColor"; rgb.setColor(this.plugin.settings.penColor); colorButton.click(); };
    const sizeGroup = this.labeledControl("Stifte");
    switchControl(sizeGroup, "Stiftdruck verwenden", this.plugin.settings.pressureEnabled, value => { this.plugin.settings.pressureEnabled = value; });
    thicknessControl(sizeGroup, "Stiftstärke", this.plugin.settings.penSize, 1, 18, .5, value => { this.plugin.settings.penSize = value; this.updateReticleStyle(); }, () => this.plugin.settings.penColor, value => `${value} px`);
    thicknessControl(sizeGroup, "Markerstärke", this.plugin.settings.markerSize, 18, 64, 2, value => { this.plugin.settings.markerSize = value; this.updateReticleStyle(); }, () => this.plugin.settings.markerColor, value => `${value} px`);
    rangeControl(sizeGroup, "Laserstärke", this.plugin.settings.laserSize, 2, 16, 1, value => { this.plugin.settings.laserSize = value; }, value => `${value} px`);
    rangeControl(sizeGroup, "Drucksensitivität", this.plugin.settings.pressureSensitivity, 0, 1, .05, value => { this.plugin.settings.pressureSensitivity = value; }, value => `${Math.round(value * 100)} %`);
    const pageGroup = this.labeledControl("Seite & Einfügen");
    pageGroup.createEl("button", { text: "Textfeld", attr: { "aria-label": "Textfeld einfügen" } }).onclick = () => void this.insertText();
    pageGroup.createEl("button", { text: "Tabelle", attr: { "aria-label": "Tabelle einfügen" } }).onclick = () => void this.insertText(true);
    const select = pageGroup.createEl("button", { text: "Text / Tabelle bearbeiten", attr: { "aria-label": "Text oder Tabelle auswählen" } });
    select.onclick = () => { this.optionsPanel.hidden = true; more.setAttribute("aria-expanded", "false"); this.activateTool("select"); this.setStatus("Textfeld oder Tabelle antippen zum Bearbeiten"); };
    this.paperSelect = pageGroup.createEl("select", { attr: { "aria-label": "Papierart" } });
    this.paperSelect.createEl("option", { value: "grid", text: "Kariert" });
    this.paperSelect.createEl("option", { value: "lines", text: "Liniert" });
    this.paperSelect.createEl("option", { value: "blank", text: "Blanko" });
    this.paperSelect.addEventListener("change", () => this.changePaper(this.paperSelect.value as Paper));
    const format = pageGroup.createEl("select", { attr: { "aria-label": "Seitenformat" } });
    for (const [value, text] of [["", "Format ändern …"], ["a4", "A4 hoch"], ["a4-landscape", "A4 quer"], ["a5", "A5 hoch"], ["square", "Quadratisch"]]) format.createEl("option", { value, text });
    format.onchange = () => {
      const page = this.activePage(); if (!page || !format.value) return;
      const sizes: Record<string, [number, number]> = { a4: [1200, 1697], "a4-landscape": [1697, 1200], a5: [846, 1200], square: [1200, 1200] };
      const [width, height] = sizes[format.value];
      if (page.elements.some(e => { const b = elementBounds(e); return b.maxX > width || b.maxY > height; })) { new Notice("Das kleinere Format würde Inhalt abschneiden. Bitte zuerst verschieben oder eine neue Seite verwenden."); format.value = ""; return; }
      this.remember(); page.width = width; page.height = height; page.format = format.value as HandwritingPage["format"]; alignPageBaselines(page); this.rebuildPages(); this.rebuildPageStrip(); this.markChanged(); format.value = "";
    };
    pageGroup.createEl("button", { text: "+", attr: { "aria-label": "Seite hinzufügen", title: "Seite hinzufügen" } }).addEventListener("click", () => this.addPage());
    const fileGroup = this.labeledControl("Datei");
    for (const [format, label] of [["png", "PNG"], ["jpeg", "JPG"], ["pdf", "PDF"]] as const) {
      fileGroup.createEl("button", { text: label, attr: { "aria-label": `Aktive Seite als ${label} speichern`, title: `Aktive Seite als ${label} herunterladen` } })
        .addEventListener("click", () => void this.exportActivePage(format));
    }
    fileGroup.createEl("button", { text: "PDF alle", attr: { "aria-label": "Alle Seiten als mehrseitige PDF speichern", title: "Gesamte Handschriftnotiz als mehrseitige PDF herunterladen" } })
      .addEventListener("click", () => void this.exportAllPagesPdf());
    // Drucken ist im Schulalltag der klassische OneNote-Weg (Arbeitsblätter, Elternabend).
    fileGroup.createEl("button", { text: "Drucken", attr: { "aria-label": "Notiz drucken", title: "Druckdialog mit allen Seiten öffnen" } })
      .addEventListener("click", () => void this.printPages());
    const importInput = fileGroup.createEl("input", { type: "file", attr: { accept: "image/png,image/jpeg,image/webp,application/pdf", multiple: "", "aria-label": "PNG, JPEG, WebP oder PDF importieren" } });
    importInput.addClass("hp-file-input");
    this.importImageInput = importInput;
    fileGroup.createEl("button", { text: "Bild / PDF", attr: { "aria-label": "PNG, JPEG, WebP oder PDF importieren", title: "Bild oder PDF zum Beschriften importieren" } })
      .addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", () => { const files = Array.from(importInput.files ?? []); importInput.value = ""; if (files.length > 0) void this.importFiles(files); });
    // Übertragung: bearbeitbares Backup + OneNote-Brücke.
    fileGroup.createEl("button", { text: "Backup", attr: { "aria-label": "Bearbeitbares Backup exportieren", title: "Vollständige bearbeitbare Kopie als .handwriting.json herunterladen" } })
      .addEventListener("click", () => this.exportEditableBackup());
    const backupInput = fileGroup.createEl("input", { type: "file", attr: { accept: ".handwriting.json,application/json", "aria-label": "Backup importieren" } });
    backupInput.addClass("hp-file-input");
    fileGroup.createEl("button", { text: "Backup ▲", attr: { "aria-label": "Backup importieren", title: "Bearbeitbares Backup (.handwriting.json) als neue Seiten anhängen" } })
      .addEventListener("click", () => backupInput.click());
    backupInput.addEventListener("change", () => { const file = backupInput.files?.[0]; backupInput.value = ""; if (file) void this.importBackupFile(file); });
    const oneNoteInput = fileGroup.createEl("input", { type: "file", attr: { accept: ".html,.htm,.mht,.mhtml,text/html,message/rfc822", "aria-label": "OneNote-Exportdatei auswählen" } });
    oneNoteInput.addClass("hp-file-input");
    fileGroup.createEl("button", { text: "OneNote ▲", attr: { "aria-label": "OneNote-Notizen importieren", title: "OneNote-Export (.html/.mht) als Seiten importieren — in OneNote: Datei → Exportieren → Webseite" } })
      .addEventListener("click", () => oneNoteInput.click());
    oneNoteInput.addEventListener("change", () => { const file = oneNoteInput.files?.[0]; oneNoteInput.value = ""; if (file) void this.importOneNoteFile(file); });
    fileGroup.createEl("button", { text: "OneNote ▼", attr: { "aria-label": "OneNote-HTML exportieren", title: "Notiz als eigenständige HTML-Datei exportieren, die OneNote öffnen kann" } })
      .addEventListener("click", () => void this.exportOneNoteHtml());
    // Einheitliche Outline-Icons für alle Datei-, Einfügen- und Seitenaktionen.
    for (const section of [fileGroup, pageGroup]) applyDockIcons(section);
    this.paperSelect.value = this.activePage()?.paper ?? this.plugin.settings.defaultPaper;
    this.activateTool("pen");
  }

  private setEditing(value: boolean): void {
    this.editing = value;
    if (value) this.moveToPortal();
    else this.restoreFromPortal();
    this.wrapper.toggleClass("is-editing", value);
    document.body.toggleClass("hp-editor-open", value);
    this.editButton.setText(value ? "Fertig" : "Bearbeiten");
    this.reticle.removeClass("is-visible");
    if (!value) {
      this.setExpanded(false);
      this.setPenCursorActive(false);
      if (this.dirty) void this.saveNow();
    }
    requestAnimationFrame(() => this.redrawAll());
  }

  private setExpanded(value: boolean): void {
    this.expanded = value;
    this.wrapper.toggleClass("is-expanded", value);
    this.toggleButton.setText(value ? "⌃" : "⌄");
    this.toggleButton.setAttribute("aria-label", value ? "Handschriftvorschau zuklappen" : "Handschriftvorschau aufklappen");
    requestAnimationFrame(() => this.redrawAll());
  }

  private moveToPortal(): void {
    if (this.portalAnchor || this.wrapper.parentNode === document.body) return;
    const parent = this.wrapper.parentNode;
    if (!parent) return;
    this.portalAnchor = document.createComment("Smooth Handwriting fullscreen portal");
    parent.insertBefore(this.portalAnchor, this.wrapper);
    document.body.appendChild(this.wrapper);
  }

  private restoreFromPortal(): void {
    if (!this.portalAnchor) return;
    const parent = this.portalAnchor.parentNode;
    if (parent) {
      parent.insertBefore(this.wrapper, this.portalAnchor);
      this.portalAnchor.remove();
    } else this.wrapper.remove();
    this.portalAnchor = null;
  }

  private activateTool(tool: Tool): void {
    this.pendingInsert=null;
    this.tool = tool;
    if (tool !== "laser") this.reticle?.removeClass("is-visible");
    this.wrapper.dataset.tool = tool;
    for (const [candidate, button] of this.toolButtons) { button.toggleClass("is-active", candidate === tool); button.setAttribute("aria-pressed", String(candidate === tool)); }
    this.updateReticleStyle();
  }

  private updateReticleStyle(): void {
    if (!this.reticle) return;
    const color = this.tool === "laser" ? "#ff1744" : this.tool === "highlight" ? this.plugin.settings.markerColor : this.tool === "fill" ? this.plugin.settings.fillColor : this.plugin.settings.penColor;
    const size = this.tool === "eraser" ? 22 : this.tool === "highlight" ? Math.min(24, this.plugin.settings.markerSize / 2) : Math.max(6, this.plugin.settings.penSize);
    this.reticle.style.setProperty("--hp-reticle-color", color);
    this.reticle.style.setProperty("--hp-reticle-size", `${size}px`);
    this.reticle.toggleClass("is-laser", this.tool === "laser");
  }

  private updateReticle(event: PointerEvent): void {
    // Echter Stift (Lenovo Yoga, Apple Pencil): System-Cursor aus, Stiftpunkt zeigen.
    // Laser behält den Punkt auch bei Maus; Touch zeigt nichts.
    // Ein nur schwebender Stift (Näherung ohne Kontakt) übernimmt erst, wenn das
    // Touchpad kurz ruht — sonst blendet er den Mauszeiger aus, während mit dem
    // Touchpad gearbeitet wird (Feedback 10.9.2026). Kontakt hat immer Vorrang.
    // Date.now statt performance.now: der Test-Harness läuft in einem vm-Kontext ohne performance.
    const now = Date.now();
    const penInput = isPenInput(event, this.plugin.settings.penForceMode);
    if (!penInput) this.lastMouseActivityTs = now;
    const penActive = penCursorActive(penInput, event.buttons > 0 || event.pressure > 0, now - this.lastMouseActivityTs);
    // Diagnose ist ein Nebenkanal: sie darf den Editor nie lahmlegen (der Test-Harness
    // benutzt einen Teil-Stub des Plugins, echte Plugins haben die Methode).
    if (typeof this.plugin.recordPenSample === "function") this.plugin.recordPenSample(event, penInput, penActive);
    // Nur bei echter Änderung schreiben: ein classList-Zugriff auf <body> kann eine
    // Style-Neuberechnung für den ganzen Baum anstoßen.
    if (penActive !== this.penHoverState) {
      this.penHoverState = penActive;
      this.wrapper.toggleClass("is-pen-hover", penActive);
      // Der Yoga-Stift bewegt den Systemzeiger nicht — der bleibt also irgendwo stehen
      // und war beim Schreiben weiter zu sehen. Im Stiftmodus wird er deshalb global
      // ausgeblendet (Nutzerbefund 11.9.2026: „der Cursor ist trotzdem noch da").
      this.setPenCursorActive(penActive);
    }
    if (!this.editing || isFingerInput(event, this.plugin.settings.penForceMode)) { this.reticle.removeClass("is-visible"); return; }
    if (this.tool !== "laser" && !penActive) { this.reticle.removeClass("is-visible"); return; }
    this.placeReticle(event);
    this.reticle.addClass("is-visible");
  }

  /**
   * Blendet den Systemzeiger global aus/an. Der Yoga-Stift bewegt ihn nicht, er bleibt
   * sonst beim Schreiben sichtbar stehen. Wichtig: auch wieder AUSSCHALTEN — sonst
   * bleibt der Zeiger in der ganzen App unsichtbar (Code-Audit K-01).
   */
  private setPenCursorActive(active: boolean): void {
    this.wrapper.ownerDocument?.body?.classList?.toggle("hp-pen-active", active);
  }

  /** Nur die Position nachführen, ohne Sichtbarkeit/Tool-Logik zu wiederholen. */
  private trackReticle(event: PointerEvent): void {
    if (!this.reticle.classList.contains("is-visible")) return;
    this.placeReticle(event);
  }

  private reticleFrame = 0;
  private reticleTarget: { x: number; y: number } | null = null;

  /**
   * Der Stiftpunkt wird hoechstens einmal pro Bildschirmbild geschrieben. `pointerrawupdate`
   * und `pointermove` melden dieselbe Bewegung mehrfach je Bild; jede dieser Schreibungen
   * stiess eine Stil-Neuberechnung an. Sichtbar bleibt es identisch — angezeigt wird ohnehin
   * nur der letzte Stand eines Bildes.
   */
  private placeReticle(event: PointerEvent): void {
    const sample = this.freshestSample(event);
    this.reticleTarget = { x: sample.clientX, y: sample.clientY };
    if (this.reticleFrame) return;
    this.reticleFrame = requestAnimationFrame(() => {
      this.reticleFrame = 0;
      const ziel = this.reticleTarget;
      if (!ziel) return;
      this.reticle.style.transform = `translate3d(${ziel.x}px, ${ziel.y}px, 0) translate(-50%, -50%)`;
    });
  }

  /**
   * Der Stift liefert pro pointermove mehrere Zwischenproben (Coalesced Events).
   * Die letzte ist die frischeste Position — mit ihr läuft der Stiftpunkt nicht
   * hinter der Tinte her (Tracking-Befund 10.9.2026).
   */
  private freshestSample(event: PointerEvent): { clientX: number; clientY: number } {
    const coalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
    const last = coalesced.length ? coalesced[coalesced.length - 1] : null;
    return last ? { clientX: last.clientX, clientY: last.clientY } : { clientX: event.clientX, clientY: event.clientY };
  }

  private rebuildPages(): void {
    this.clearSelection();
    // Bei einem Neuaufbau werden Canvases und Zuhörer ersetzt; ein laufender Fingereintrag
    // erreicht seinen `pointerup` dann nie und der Finger scrollte dauerhaft statt zu
    // zeichnen (Code-Audit M-01). Ein wartender Vorschau-Frame ebenso (M-02).
    this.touchScroll.clear();
    this.cancelPreviewFrame();
    this.disconnectObservers();
    this.canvases.clear();
    this.overlays.clear();
    this.selectionOverlays.clear();
    this.pagesEl.empty();
    for (const [index, page] of this.document.pages.entries()) {
      const frame = this.pagesEl.createDiv("hp-page");
      frame.dataset.pageId = page.id;
      frame.style.setProperty("--hp-page-width", `${page.width * this.zoom + 4}px`);
      frame.toggleClass("is-active", page.id === this.activePageId);
      setPaperClass(frame, page.paper);
      frame.createDiv({ cls: "hp-page-label", text: `Seite ${index + 1}` });
      const surface = frame.createDiv("hp-canvas-stack");
      const canvas = surface.createEl("canvas", { attr: { "aria-label": `Handschrift Seite ${index + 1}` } });
      const overlay = surface.createEl("canvas", { cls: "hp-live-overlay", attr: { "aria-hidden": "true" } });
      const selection = surface.createEl("canvas", { cls: "hp-selection-overlay", attr: { "aria-hidden": "true" } });
      this.overlays.set(page.id, overlay);
      this.selectionOverlays.set(page.id, selection);
      canvas.style.aspectRatio = `${page.width} / ${page.height}`;
      canvas.addEventListener("pointerenter", (event) => this.updateReticle(event));
      // pointerrawupdate kommt häufiger als pointermove (kein rAF-Bündeln) — damit läuft
      // der Stiftpunkt sichtbar genauer mit (Feedback 10.9.2026: „mit der Maus ist das
      // Tracking genauer"); Sichtbarkeit/Tool-Logik bleibt in updateReticle.
      // "pointerrawupdate" fehlt (noch) in den DOM-Typen — Parameter auf PointerEvent verengen.
      canvas.addEventListener("pointerrawupdate", (event) => this.trackReticle(event as PointerEvent));
      canvas.addEventListener("pointerleave", () => { this.reticle.removeClass("is-visible"); this.wrapper.removeClass("is-pen-hover"); this.setPenCursorActive(false); });
      canvas.addEventListener("pointerdown", (event) => this.pointerDown(event, page.id));
      canvas.addEventListener("pointermove", (event) => this.pointerMove(event, page.id));
      canvas.addEventListener("pointerup", (event) => this.pointerUp(event, page.id));
      canvas.addEventListener("pointercancel", (event) => this.pointerUp(event, page.id));
      canvas.addEventListener("lostpointercapture", (event) => this.pointerUp(event, page.id));
      canvas.addEventListener("dblclick", event => {
        if (!this.editing || this.objectEditing || this.tool !== "select") return;
        const point = this.toPoint(event as PointerEvent, page, canvas);
        const target = [...page.elements].reverse().find(e => { if(e.type !== "text") return false; const b=elementBounds(e); return point.x>=b.minX && point.x<=b.maxX && point.y>=b.minY && point.y<=b.maxY; });
        if(target?.type === "text") void this.editTextElement(page, target);
      });
      frame.addEventListener("click", () => this.setActivePage(page.id));
      const observer = new ResizeObserver(() => { this.updatePaperScale(frame, canvas, page); this.redrawPage(page.id); });
      observer.observe(canvas);
      this.observers.push(observer);
      this.canvases.set(page.id, canvas);
    }
    this.updateHeader();
    const add = this.pagesEl.createEl("button", { cls: "hp-page-add", text: "+", attr: { "aria-label": "Neue Seite am Ende hinzufügen", title: "Neue Seite" } });
    add.onclick = () => this.addPage();
    requestAnimationFrame(() => this.redrawAll());
  }

  private updatePaperScale(frame: HTMLElement, canvas: HTMLCanvasElement, page: HandwritingPage): void {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / page.width;
    const scaleY = rect.height / page.height;
    frame.style.setProperty("--hp-grid-x", `${24 * scaleX}px`);
    frame.style.setProperty("--hp-grid-y", `${24 * scaleY}px`);
    frame.style.setProperty("--hp-line-y", `${32 * scaleY}px`);
  }

  private disconnectObservers(): void { for (const observer of this.observers) observer.disconnect(); this.observers = []; }
  private updateHeader(): void {
    this.pageCountEl?.setText(`${this.document.pages.length} ${this.document.pages.length === 1 ? "Seite" : "Seiten"}`);
    const paper=this.activePage()?.paper;
    if(paper && this.paperSelect) this.paperSelect.value=paper;
    for(const [kind,button] of this.paperButtons) button.setAttribute("aria-pressed",String(kind===paper));
  }
  private setActivePage(pageId: string): void {
    if (pageId !== this.activePageId) this.clearSelection();
    this.activePageId = pageId;
    this.updateHeader();
    const active = this.activePage();
    if (active && this.paperSelect) this.paperSelect.value = active.paper;
    this.pagesEl.querySelectorAll<HTMLElement>(".hp-page").forEach((frame) => frame.toggleClass("is-active", frame.dataset.pageId === pageId));
  }
  private activePage(): HandwritingPage | undefined { return this.document.pages.find((page) => page.id === this.activePageId); }
  private page(pageId: string): HandwritingPage | undefined { return this.document.pages.find((page) => page.id === pageId); }

  /** Lineal an/aus — gemeinsame Logik für Header- und Leisten-Button. */
  private toggleRuler(): void {
    const on = !this.ruler;
    this.rulerToolButton?.setAttribute("aria-pressed", String(on));
    if (on) { this.placeRulerInView(); this.setStatus("Lineal eingeblendet — Leiste ziehen zum Verschieben, Enden ziehen zum Drehen"); }
    else { this.ruler = null; this.rulerSnapping = false; this.setStatus(""); }
    for (const page of this.document.pages) this.drawSelectionOverlay(page.id);
  }

  private toPoint(event: PointerEvent, page: HandwritingPage, canvas: HTMLCanvasElement): InkPoint {
    const rect = this.measuredRect(canvas);
    // Pen-Präzision: echter Druck (Yoga-Wacom: >0 und <1; manche Treiber melden
    // 0.5 konstant), Neigung für Schattierung; Maus/Touch → neutrale 0.5.
    // isPenInput statt pointerType-Vergleich: manche Yoga-/Wacom-Treiber melden den
    // Stift als "mouse" — dann gingen Druck und Neigung verloren (Befund 11.9.2026).
    const isPen = isPenInput(event, this.plugin.settings.penForceMode);
    // Druck über den Verlauf des Strichs auswerten, nicht über einen Einzelwert: Apple Pencil
    // liefert echten Druck (auch 1.0 beim festen Aufdrücken), manche Wacom-Treiber nur ein
    // konstantes Plateau. Vorher wurde jeder Wert ≥ 1 auf 0,72 verbogen — dadurch unterschied
    // sich die iPad-Handschrift sichtbar von der Yoga-Handschrift.
    const pressure = isPen ? this.pressureTracker.observe(event.pointerId, event.pressure).pressure : 0.5;
    const tilt = isPen ? Math.atan2(Math.hypot(event.tiltX ?? 0, event.tiltY ?? 0) / 100, 1) : 0;
    return { x: Math.max(0, Math.min(page.width, (event.clientX - rect.left) * page.width / rect.width)), y: Math.max(0, Math.min(page.height, (event.clientY - rect.top) * page.height / rect.height)), pressure, tilt, time: event.timeStamp };
  }

  private pointerDown(event: PointerEvent, pageId: string): void {
    this.updateReticle(event);
    // Fill-Delay: ein neuer Strich verwirft die noch ausstehende Füllung der zuletzt
    // gehaltenen Form — wer weiterschreibt, will keine nachträglich gefüllte Form.
    if (!this.editing || this.objectEditing) return;
    const page = this.page(pageId); const canvas = this.canvases.get(pageId);
    if (!page || !canvas) return;
    // Ein hängender Strich darf den nächsten nicht verschlucken — genau das war das iPad-Symptom
    // „reagiert manchmal nicht": iOS liefert beim Handballen oder App-Wechsel nicht immer ein
    // `pointerup`, der Editor blieb in „Strich läuft" stehen und verwarf jeden neuen Kontakt.
    if (this.pointerPageId !== null) {
      // Handballen/Zweifinger dürfen den laufenden Stiftstrich NICHT abbrechen (Palm-Rejection).
      if (isFingerInput(event, this.plugin.settings.penForceMode)) return;
      const frisch = !strokeIsStuck(this.lastPointerActivityTs, event.timeStamp || Date.now(), 120);
      // Dasselbe Aufsetzen doppelt gemeldet (kommt bei Stiften vor): identischer Zeiger, gleiche
      // Stelle wie der Strichbeginn, praktisch gleichzeitig — es darf keinen Strich zerschneiden.
      const derselbeStart = this.strokeStartClient !== null
        && Math.hypot(event.clientX - this.strokeStartClient.x, event.clientY - this.strokeStartClient.y) < 3
        && Math.abs((event.timeStamp || 0) - this.strokeStartedTs) < 120;
      if (frisch && derselbeStart && this.activePointerId === event.pointerId) return;
      // Sonst ist der alte Strich tot: erst sauber abschließen, dann den neuen beginnen.
      if (this.activePointerId !== null) this.pointerUp(this.syntheticPointerUp(this.activePointerId), pageId);
      if (this.pointerPageId !== null) return;
    }
    if(this.pendingInsert && event.button===0) {
      event.preventDefault(); const table=this.pendingInsert==="table"; this.pendingInsert=null;
      this.setActivePage(pageId); void this.editTextElement(page,undefined,table,this.toPoint(event,page,canvas)); return;
    }
    if (this.tool === "select") {
      if (event.button !== 0) return;
      this.setActivePage(pageId);
      const point=this.toPoint(event,page,canvas);
      if (isFingerInput(event, this.plugin.settings.penForceMode)) { this.touchSelectDown = point; this.capturePointer(canvas, event.pointerId, pageId); return; }
      // Resize-Griff → Auswahl skalieren; Treffer auf Auswahl → verschieben.
      if (this.selectionBox) {
        const handle=this.selectionHandleAt(page,point);
        if(handle!==null && event.button===0){event.preventDefault();this.setActivePage(pageId);this.capturePointer(canvas,event.pointerId,pageId);this.beginResize(page,handle);return;}
        if(event.button===0 && (this.pointInBox(this.selectionBox,point) || this.hitsSelected(page,point))){event.preventDefault();this.setActivePage(pageId);this.capturePointer(canvas,event.pointerId,pageId);this.beginDrag(page,point);return;}
      }
      const target=this.hitTestElement(page,point);
      if(target && event.button===0){
        event.preventDefault(); this.setActivePage(pageId);
        if(target.type==="text") { void this.editTextElement(page,target); return; }
        if(target.type==="image") { void this.editImageElement(page,target); return; }
        this.setSelection([target.id]); return;
      }
      if(event.button===0){event.preventDefault();this.setActivePage(pageId);this.marqueeStart=point;this.capturePointer(canvas,event.pointerId,pageId);this.drawSelectionOverlay(pageId);}
      return;
    }
    if (isFingerInput(event, this.plugin.settings.penForceMode)) {
      if (this.pointerPageId === null) { this.touchScroll.set(event.pointerId, event.clientY); canvas.setPointerCapture(event.pointerId); }
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault(); this.setActivePage(pageId); this.capturePointer(canvas, event.pointerId, pageId);
    this.notePointerActivity(event);
    // Zeitpunkt des Strichbeginns: ein verspätet eintreffendes Abschluss-Ereignis des VORIGEN
    // Strichs darf diesen hier nicht beenden (iOS liefert `pointerup` gelegentlich nach).
    this.strokeStartedTs = event.timeStamp;
    this.strokeStartClient = { x: event.clientX, y: event.clientY };
    this.lastMoveTs = event.timeStamp;
    const point = this.toPoint(event, page, canvas);
    if (this.ruler) {
      const handle = this.rulerHandleAt(page, point);
      if (handle) { this.rulerDrag = handle; this.rulerDragStart = point; this.rulerStart = { ...this.ruler }; return; }
    }
    if (this.tool === "laser") {
      this.transientLaser = { id: "laser", color: "#ff1744", size: this.plugin.settings.laserSize, pressureSensitivity: 0, points: [point] };
      this.drawLaser(pageId); return;
    }
    this.remember(((this.tool === "pen" || this.tool === "brush") && this.handwritingMode) || this.tool === "highlight");
    if (this.tool === "eraser") { if (this.eraseAt(page, point)) this.erasedSomething = true; return; }
    if (this.tool === "fill") {
      // Oben wurde bereits ein Undo-Schnappschuss angelegt. Bei einem Treffer behalten wir
      // ihn (Füllen ist dann ein Schritt); ohne Treffer wird genau DIESER wieder verworfen —
      // sonst sammelt jeder Fehlgriff leere Undo-Schritte an.
      const target = [...page.elements].reverse().find((element): element is ShapeElement => element.type === "shape" && shapeContainsPoint(element, point));
      if (target) {
        // Ist die Fülldeckkraft auf „Aus" (0) gestellt, wird NICHT heimlich mit 24 %
        // gefüllt — der Regler verspricht „Aus", also passiert nichts (Code-Audit H-04).
        const deckkraft = this.plugin.settings.fillOpacity;
        if (deckkraft <= 0) {
          this.history.pop();
          this.setStatus("Fülldeckkraft ist auf Aus gestellt — im Einstellungs-Tab erhöhen, um zu füllen");
          return;
        }
        target.fillColor = this.plugin.settings.fillColor;
        target.fillOpacity = deckkraft;
        this.markChanged(); this.redrawPage(pageId);
        this.setStatus("Form gefüllt — ↶ nimmt es zurück");
      } else {
        this.history.pop();
        this.setStatus("Keine geschlossene Form unter dem Stift — Fülleimer trifft nur geschlossene Formen");
        window.setTimeout(() => this.setStatus(""), 1600);
      }
      this.finishPointer(pageId, event.pointerId); return;
    }
    if (this.tool === "highlight") {
      const element: HighlightElement = { type: "highlight", id: crypto.randomUUID(), x1: point.x, x2: point.x, y: point.y, size: this.plugin.settings.markerSize, color: this.plugin.settings.markerColor, opacity: 0.28, points: [point] };
      page.elements.push(element); this.currentElementId = element.id; this.currentRawPoints = [point];
    } else if (isShapeTool(this.tool)) {
      const kind: ShapeKind = this.tool === "circle" ? "ellipse" : this.tool === "triangle" || this.tool === "diamond" ? "polygon" : this.tool;
      const element: ShapeElement = { type: "shape", id: crypto.randomUUID(), kind, points: draggedShapePoints(this.tool, point, point), color: this.plugin.settings.penColor, size: this.plugin.settings.penSize, closed: this.tool !== "line" && this.tool !== "arrow", fillColor: undefined, fillOpacity: 0 };
      element.showMeasurements=this.plugin.settings.shapeMeasurements;
      page.elements.push(element); this.currentElementId = element.id; this.shapeDragStart = point;
    } else {
      const brush = this.tool === "brush";
      const element: StrokeElement = { type: "stroke", id: crypto.randomUUID(), color: this.plugin.settings.penColor, size: brush ? Math.max(10, this.plugin.settings.penSize * 2.2) : this.plugin.settings.penSize, pressureSensitivity: this.plugin.settings.pressureEnabled ? this.plugin.settings.pressureSensitivity : 0, brush: brush || undefined, points: [point] };
      page.elements.push(element); this.currentElementId = element.id; this.currentRawPoints = [point];
      // Lineal-Andock: nahe am Lineal gestartete Stift-Striche laufen entlang.
      this.rulerSnapping = !brush && !!this.ruler && this.rulerDistance(point) < 18;
      if (this.rulerSnapping) { const snapped = this.projectOnRuler(point); element.points[0] = snapped; this.currentRawPoints[0] = snapped; }
    }
    if (this.tool === "pen" || this.tool === "brush" || this.tool === "highlight") {
      const overlay = this.overlays.get(pageId);
      if (overlay) { overlay.style.opacity = this.tool === "highlight" ? ".28" : "1"; const context = prepareCanvas(overlay, page); if (context) drawInkStroke(context, { id: "live", color: this.plugin.settings.penColor, size: this.tool === "highlight" ? this.plugin.settings.markerSize : this.tool === "brush" ? Math.max(10, this.plugin.settings.penSize * 2.2) : this.plugin.settings.penSize, points: [point], pressureSensitivity: 0 }); }
    } else this.redrawPage(pageId);
  }

  private pointerMove(event: PointerEvent, pageId: string): void {
    this.updateReticle(event);
    const touchY = this.touchScroll.get(event.pointerId);
    if (touchY !== undefined) {
      event.preventDefault();
      this.pagesEl.scrollTop += touchY - event.clientY;
      this.touchScroll.set(event.pointerId, event.clientY);
      return;
    }
    if (!this.editing || this.pointerPageId !== pageId) return;
    const page = this.page(pageId); const canvas = this.canvases.get(pageId);
    if (!page || !canvas) return;
    // Safari/iOS bricht hier ab: der ERSTE pointermove nach setPointerCapture kommt ohne
    // Capture an (WebKit-Bug 276287). Der frühere Capture-Test verwarf ihn — bei schnellem
    // Schreiben fehlten dadurch Punkte bis hin zum Strichanfang. Der Zeigervergleich leistet
    // dasselbe (fremde Zeiger bleiben draußen) und funktioniert auf allen Plattformen.
    if (this.activePointerId !== event.pointerId) return;
    this.notePointerActivity(event);
    event.preventDefault(); const coalesced = event.getCoalescedEvents?.(); const events = coalesced?.length ? coalesced : [event];
    if (this.rulerDrag && this.rulerDragStart && this.ruler && this.rulerStart) {
      const current = this.toPoint(event, page, canvas);
      if (this.rulerDrag === "move") {
        this.ruler.x = this.rulerStart.x + (current.x - this.rulerDragStart.x);
        this.ruler.y = this.rulerStart.y + (current.y - this.rulerDragStart.y);
      } else {
        const startAngle = Math.atan2(this.rulerDragStart.y - this.rulerStart.y, this.rulerDragStart.x - this.rulerStart.x);
        const nowAngle = Math.atan2(current.y - this.ruler.y, current.x - this.ruler.x);
        this.ruler.angle = this.rulerStart.angle + (nowAngle - startAngle);
      }
      this.drawSelectionOverlay(pageId); return;
    }
    if (this.tool === "select" && this.marqueeStart) {
      const point=this.toPoint(event,page,canvas);
      const box: SelectionBox = { minX: Math.min(this.marqueeStart.x, point.x), minY: Math.min(this.marqueeStart.y, point.y), maxX: Math.max(this.marqueeStart.x, point.x), maxY: Math.max(this.marqueeStart.y, point.y) };
      this.selectionIds = new Set(rectangleSelection(page, box).map(element => element.id));
      this.selectionPageId = page.id;
      this.selectionBox = this.selectionIds.size > 0 ? box : null;
      this.drawSelectionOverlay(page.id); this.updateSelectionActions(); return;
    }
    if (this.tool === "select" && this.dragSnapshot.length) {
      const point=this.toPoint(event,page,canvas);
      this.previewSelectionGeometry(page, point.x - (this.dragStart?.x ?? point.x), point.y - (this.dragStart?.y ?? point.y), 0, null);
      return;
    }
    if (this.tool === "select" && this.resizeSnapshot.length && this.resizeBox) {
      this.previewResize(page, this.toPoint(event,page,canvas)); return;
    }
    if (this.tool === "laser" && this.transientLaser) {
      for (const sample of events) this.transientLaser.points.push(this.toPoint(sample, page, canvas));
      // A bounded tail and a separate layer keep cost independent of notebook size.
      this.transientLaser.points = this.transientLaser.points.slice(-96);
      if (this.laserFrame === null) this.laserFrame = requestAnimationFrame(() => { this.laserFrame = null; this.drawLaser(pageId); });
      return;
    }
    if (this.tool === "eraser") { for (const sample of events) if (this.eraseAt(page, this.toPoint(sample, page, canvas))) this.erasedSomething = true; return; }
    const last = page.elements[page.elements.length - 1];
    const element = last?.id === this.currentElementId ? last : page.elements.find((candidate) => candidate.id === this.currentElementId);
    if (!element) return;
    if (element.type === "highlight") {
      const firstNewPoint = this.currentRawPoints.length;
      for (const sample of events) this.currentRawPoints.push(this.toPoint(sample, page, canvas));
      element.x2 = this.currentRawPoints[this.currentRawPoints.length - 1].x;
      element.points = this.currentRawPoints;
      this.scheduleLiveInk(pageId, element, firstNewPoint);
      return;
    }
    else if (element.type === "stroke") {
      // Keep the pen-down path entirely incremental. Re-running the model over
      // the full stroke on every pointer event caused the Lenovo pen lag.
      const firstNewPoint = this.currentRawPoints.length;
      for (const sample of events) this.currentRawPoints.push(this.toPoint(sample, page, canvas));
      // Lineal-Andock: der angekoppelte Strich folgt exakt der Linealachse.
      if (this.rulerSnapping && this.ruler) for (let i = Math.max(1, firstNewPoint); i < this.currentRawPoints.length; i++) this.currentRawPoints[i] = this.projectOnRuler(this.currentRawPoints[i]);
      // Brush: width follows drawing speed (slow = wide, fast = thin) —
      // encoded as per-point pressure so rendering stays incremental.
      if (element.brush && this.currentRawPoints.length > 1) {
        const pts = this.currentRawPoints;
        for (let i = Math.max(1, firstNewPoint); i < pts.length; i++) {
          const dt = Math.max(4, (pts[i].time ?? event.timeStamp) - (pts[i - 1].time ?? event.timeStamp));
          const speed = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i].y) / dt; // px per ms
          pts[i].pressure = Math.max(0.12, Math.min(1, 1.25 - speed * 1.1));
        }
      }
      element.points = this.currentRawPoints;
      // Hold-Erkennung: Zeit UND Position — Digitizer-Jitter-Moves (Zeit läuft
      // weiter, Position bleibt) dürfen den Hold nicht zurücksetzen.
      this.lastMoveTs = event.timeStamp;
      const lastPoint = this.currentRawPoints[this.currentRawPoints.length - 1];
      if (lastPoint) this.lastMovePoint = { x: lastPoint.x, y: lastPoint.y };
      this.scheduleLiveInk(pageId, element, firstNewPoint);
      return;
    }
    else if (element.type === "shape" && isShapeTool(this.tool) && this.shapeDragStart) {
      element.points = draggedShapePoints(this.tool, this.shapeDragStart, this.toPoint(events[events.length - 1], page, canvas),page);
      // Gerader Linienmodus: freihändige Zug-Richtungen rasten auf das 15°-Raster.
      if (this.tool === "line" && this.plugin.settings.lineAngleSnap) element.points = snapLineAngle(element.points);
      // Einmal pro Anzeigebild zeichnen und die Messwerte setzen — vorher lief pro
      // Stiftpunkt eine volle Overlay-Löschung PLUS eine DOM-Schreibung der Messwerte
      // (dieselbe Fehlerklasse wie das erzwungene Layout in toPoint).
      this.scheduleShapeFeedback(pageId, element); return;
    }
    this.redrawPage(pageId);
  }

  private pointerUp(event: PointerEvent, pageId: string): void {
    const page = this.page(pageId); const canvas = this.canvases.get(pageId);
    if (!page || !canvas) return;
    // Abbruch-Ereignisse erreichen `updateReticle` nie (sie kommen direkt hierher). Für die
    // Stift-Diagnose werden sie deshalb ausdrücklich erfasst — sonst könnte die Diagnose den
    // iPad-Fall „Strich wurde unterbrochen" gar nicht anzeigen (Selbstbefund 13.9.2026).
    if (event.type === "pointercancel" || event.type === "lostpointercapture") {
      if (typeof this.plugin.recordPenSample === "function") this.plugin.recordPenSample(event, true, this.penHoverState === true);
    }
    if (this.touchScroll.has(event.pointerId)) {
      this.touchScroll.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (this.pointerPageId !== pageId || this.activePointerId !== event.pointerId) return;
    // Ein verspätet eintreffendes Abschluss-Ereignis des VORIGEN Strichs darf den laufenden nicht
    // beenden. iOS liefert `pointerup` gelegentlich nach dem nächsten `pointerdown` (Befund 13.9.2026).
    const verspaetet = event.type === "pointerup" && this.strokeStartedTs > 0 && event.timeStamp > 0 && event.timeStamp < this.strokeStartedTs;
    if (verspaetet) return;
    let redrawOnFinish = true;
    try {
    // iOS bricht laufende Striche ab (Handballen, Gestenerkennung, App-Wechsel, Sperrbildschirm).
    // Früher wurde die bereits geschriebene Tinte dabei gelöscht — genau das war das iPad-Symptom
    // „manchmal verschwindet Text" (Befund 13.9.2026). Jetzt wird die Tinte behalten; nur
    // Vorschau-Zustände (Auswahl-Rahmen, Lineal, Füllung) rollen weiterhin zurück.
    const abgebrochen = event.type === "pointercancel" || event.type === "lostpointercapture";
    const laufend = page.elements.find(candidate => candidate.id === this.currentElementId);
    const istTinte = laufend?.type === "stroke" || laufend?.type === "highlight";
    if (abgebrochen && !istTinte) {
      if (this.currentElementId) {
        page.elements = page.elements.filter(element => element.id !== this.currentElementId);
        this.history.pop();
      }
      return;
    }
    // „Zeichnen & Halten“ (iPad): bleibt der Stift am Ende liegen, wird die Form
    // beim Abheben forciert perfekt. WICHTIG (Fund 10.9.2026): vor dem finalen
    // pointerMove messen — der setzt lastMoveTs auf den Up-Zeitstempel, dadurch war
    // die Stillstandszeit immer 0 ms und der Hold konnte nie feuern.
    const upPoint = this.toPoint(event, page, canvas);
    const movedFar = this.lastMovePoint ? Math.hypot(upPoint.x - this.lastMovePoint.x, upPoint.y - this.lastMovePoint.y) : Infinity;
    const holdDetected = this.plugin.settings.shapeHoldSnap && this.lastMoveTs !== null && event.timeStamp - this.lastMoveTs >= 350 && movedFar < 2.5;
    if (event.type !== "pointercancel") this.pointerMove(event, pageId);
    event.preventDefault();
    if (this.tool === "laser") { this.transientLaser = null; this.pointerPageId = null; if (this.laserFrame !== null) cancelAnimationFrame(this.laserFrame); this.laserFrame = null; this.drawLaser(pageId); return; }
    /* Phase 4: Abschluss/Auswahlinteraktionen. */
    if (this.rulerDrag) { this.rulerDrag = null; this.rulerDragStart = null; this.rulerStart = null; this.drawSelectionOverlay(pageId); this.pointerPageId = null; return; }
    this.rulerSnapping = false;
    if (this.tool === "select" && this.marqueeStart) { this.marqueeStart = null; this.pointerPageId = null; this.drawSelectionOverlay(pageId); this.updateSelectionActions(); return; }
    if (this.tool === "select" && this.dragSnapshot.length) { const point = this.toPoint(event, page, canvas); this.commitDrag(page, point.x - (this.dragStart?.x ?? point.x), point.y - (this.dragStart?.y ?? point.y)); return; }
    if (this.tool === "select" && this.resizeSnapshot.length) { this.commitResize(page); return; }
    if (this.tool === "select" && this.touchSelectDown) {
      const point = this.toPoint(event, page, canvas);
      if (Math.hypot(point.x - this.touchSelectDown.x, point.y - this.touchSelectDown.y) < 14) {
        const target = this.hitTestElement(page, point);
        if (target?.type === "text") void this.editTextElement(page, target);
        else if (target?.type === "image") void this.editImageElement(page, target);
        else if (target) this.setSelection([target.id]);
        else this.clearSelection();
      }
      this.touchSelectDown = null; return;
    }
    const element = page.elements.find((candidate) => candidate.id === this.currentElementId);
    if (element?.type === "stroke") {
      element.rawPoints = structuredClone(this.currentRawPoints);
      element.points = this.handwritingMode ? structuredClone(this.currentRawPoints) : cleanCapturedStroke(this.currentRawPoints, true);
      if(this.handwritingMode) element.inkGeometry="captured";
      /* Phase 4-Gesten (nur im Schreibmodus; Strich selbst wird nie persistiert). */
      if (this.handwritingMode) {
        if (this.plugin.settings.circleLasso && circleLassoGesture(element, page)) {
          const lasso = lassoSelection({ ...page, elements: page.elements.filter(candidate => candidate.id !== element.id) }, element.points);
          if (lasso.length > 0) {
            page.elements = page.elements.filter(candidate => candidate.id !== element.id);
            this.history.pop();
            this.setSelection(lasso.map(candidate => candidate.id));
            this.activateTool("select");
            this.setStatus(`Kreis-Auswahl: ${lasso.length} ${lasso.length === 1 ? "Objekt" : "Objekte"} — verschieben, skalieren oder ↶`);
            this.redrawPage(page.id); return;
          }
        }
        if (this.plugin.settings.scratchErase && scratchEraseGesture(element)) {
          const doomed = scratchedElements(page, element).filter(candidate => candidate.id !== element.id);
          if (doomed.length > 0) {
            const ids = new Set(doomed.map(candidate => candidate.id));
            page.elements = page.elements.filter(candidate => candidate.id !== element.id && !ids.has(candidate.id));
            this.markChanged(); this.redrawPage(page.id);
            this.setStatus(`${ids.size} ${ids.size === 1 ? "Strich" : "Striche"} weggekritzelt — ↶ stellt alles wieder her`);
            return;
          }
        }
      }
      const converted=this.convertAutomaticShape(page,element,holdDetected);
      // Phase 0 (Nutzervorgabe 8.9.2026): Schrift-Korrektur NUR auf Schrift —
      // Zeichnungen, die keine Form wurden, bleiben Zeichnungen.
      if(!converted && !element.brush && this.plugin.settings.beautifyEnabled && this.handwritingMode) this.queueWordStroke(pageId,element.id);
    }
    else if (element?.type === "highlight") {
      const context = canvas.getContext("2d");
      if(context && this.plugin.settings.markerSnap) {
        const snapped = snapMarkerToText(page, element, context);
        const index = page.elements.indexOf(element); page.elements.splice(index, 1, ...snapped);
      }
    }
    else if (element?.type === "shape") {
      const box = elementBounds(element);
      if (Math.max(box.maxX - box.minX, box.maxY - box.minY) < 8) page.elements = page.elements.filter((candidate) => candidate.id !== element.id);
    }
    const appendStroke = element?.type === "stroke" && page.elements[page.elements.length - 1] === element;
    this.currentElementId = null; this.currentRawPoints = []; this.shapeDragStart = null; this.pointerPageId = null; this.markChanged();
    const overlay = this.overlays.get(pageId); if (overlay) { prepareCanvas(overlay, page); overlay.style.opacity = "1"; }
    if (appendStroke) { const context = canvas.getContext("2d"); if (context) drawInkStroke(context, element); }
    else this.redrawPage(pageId);
    redrawOnFinish = false;
    } finally {
      this.finishPointer(pageId, event.pointerId, redrawOnFinish);
    }
  }

  /**
   * Merkt sich, wann und wo zuletzt ein echter Zeigerkontakt war. Grundlage der Erkennung
   * „dieser Strich läuft nicht mehr" (iPad-Befund 13.9.2026).
   */
  private notePointerActivity(event: { timeStamp: number; clientX?: number; clientY?: number }): void {
    this.lastPointerActivityTs = event.timeStamp || Date.now();
    if (typeof event.clientX === "number" && typeof event.clientY === "number") {
      this.lastClientPoint = { x: event.clientX, y: event.clientY };
    }
  }

  /**
   * Baut ein Abschluss-Ereignis für einen Strich, dessen echtes `pointerup` nie ankam
   * (iOS/Handballen/App-Wechsel). Es benutzt die zuletzt bekannte Position — ein Abbruch ohne
   * Koordinaten darf den Strich nicht in die linke obere Ecke ziehen.
   */
  private syntheticPointerUp(pointerId: number): PointerEvent {
    return {
      type: "pointerup",
      pointerId,
      pointerType: "pen",
      button: 0,
      buttons: 0,
      pressure: 0,
      tiltX: 0,
      tiltY: 0,
      isPrimary: true,
      clientX: this.lastClientPoint?.x ?? 0,
      clientY: this.lastClientPoint?.y ?? 0,
      // Zeitstempel = letzter echter Kontakt. Mit der aktuellen Uhrzeit hielte der Editor den
      // Stift für „noch aufgelegt" und würde die Schrift in eine Form umwandeln (Halten-Erkennung).
      timeStamp: this.lastPointerActivityTs || Date.now(),
      preventDefault: () => {}
    } as unknown as PointerEvent;
  }

  /** All exits (including accepted gestures and cancellation) unlock save/undo. */
  private capturePointer(canvas: HTMLCanvasElement, pointerId: number, pageId: string): void {
    // setPointerCapture kann auf iOS werfen (z. B. wenn der Zeiger schon weg ist) — der
    // Editor darf daran nicht sterben, die Zeigerprüfung übernimmt den Schutz ohnehin.
    try { canvas.setPointerCapture(pointerId); } catch { /* ohne Capture weiterarbeiten */ }
    this.activePointerId = pointerId;
    this.pointerPageId = pageId;
  }

  private finishPointer(pageId: string, pointerId: number, redraw = true): void {
    // Ausstehende Live-Tinte zuerst ausgeben: sonst fehlten die letzten Segmente,
    // wenn das Bild nicht mehr zum Zeichnen kam (Bündelung seit 11.9.2026).
    this.flushLiveInk();
    // Ein Radierer-Tipp ins Leere legte oben einen Undo-Schnappschuss an, ohne etwas zu
    // ändern — der Nutzer musste dann mehrfach Ctrl+Z drücken (Code-Audit M-04). Genau
    // dieser eine leere Schritt wird hier zurückgenommen.
    if (this.tool === "eraser" && !this.erasedSomething && this.history.length) this.history.pop();
    this.erasedSomething = false;
    this.pointerPageId = null;
    this.activePointerId = null;
    this.currentElementId = null; this.currentRawPoints = []; this.shapeDragStart = null;
    this.lastMoveTs = null; this.lastMovePoint = null; this.marqueeStart = null; this.touchSelectDown = null;
    this.strokeStartedTs = 0;
    this.strokeStartClient = null;
    // Der nächste Strich dieses Zeigers darf die Druckkurve neu beurteilen: ein Treiber kann pro
    // Kontakt unterschiedlich melden, und ein Plateau vom Vorstrich darf echten Druck nicht blocken.
    this.pressureTracker.forget(pointerId);
    this.dragSnapshot = []; this.dragStart = null;
    this.resizeSnapshot = []; this.resizeHandle = null; this.resizeBox = null; this.resizeCurrent = null;
    this.transientLaser = null;
    this.cancelPreviewFrame();
    if (this.laserFrame !== null) cancelAnimationFrame(this.laserFrame);
    this.laserFrame = null;
    const canvas = this.canvases.get(pageId);
    if (canvas?.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    this.refreshSelectionBox();
    if (redraw) this.redrawPage(pageId);
    this.updateSelectionActions();
    if (this.dirty) this.scheduleSave();
  }

  /** Formname für die Statuszeile — „Ellipse/Kreis" war zu unscharf: der Nutzer will
   *  sehen, ob ein Kreis, ein Oval oder ein Viereck erkannt wurde. */
  private shapeLabel(kind: ShapeKind, points: InkPoint[]): string {
    if (kind === "rectangle") return "Viereck";
    if (kind === "polygon") return "Vieleck";
    if (kind === "line") return "Gerade";
    if (kind === "arrow") return "Pfeil";
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    return Math.abs(width - height) <= Math.max(2, Math.max(width, height) * 0.06) ? "Kreis" : "Oval";
  }

  private convertAutomaticShape(page: HandwritingPage, stroke: StrokeElement, force = false): boolean {
    if (!this.plugin.settings.shapeOptimization) return false;
    // Wächter (Review 10.9.2026): Halten im Schreibmodus darf Buchstaben nicht zu Formen machen.
    // Dort greift der Snap nur auf deutlich größere geschlossene Züge — Buchstaben bleiben Schrift.
    if (force && this.handwritingMode) {
      const box = elementBounds(stroke);
      // Grenze aus der eingestellten Schreibhöhe — Buchstaben bleiben Schrift (s. holdSnapMinSide).
      const writingHeight = paperWritingLayout(page.paper, this.plugin.settings).height;
      const allowed = allowHoldSnap({
        force, handwritingMode: this.handwritingMode, writingHeight,
        width: box.maxX - box.minX, height: box.maxY - box.minY
      });
      if (!allowed) return false;
    }
    let candidate: InkStroke = stroke;
    if (this.plugin.settings.shapeEndpointSnap) {
      const targets: { x: number; y: number }[] = [];
      for (const other of page.elements) if (other.id !== stroke.id) {
        const box = elementBounds(other);
        targets.push({ x: box.minX, y: box.minY }, { x: box.maxX, y: box.minY }, { x: box.maxX, y: box.maxY }, { x: box.minX, y: box.maxY }, { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
      }
      candidate = snapStrokeEndpoints(candidate, targets, 14);
    }
    const optimized = optimizeShape(candidate, this.plugin.settings.shapeImprovement, force);
    if (!optimized.kind) return false;
    const index = page.elements.findIndex((element) => element.id === stroke.id);
    if (index < 0) return false;
    const kind: ShapeKind = optimized.kind;
    const points = kind === "line" && this.plugin.settings.lineAngleSnap ? snapLineAngle(optimized.stroke.points) : optimized.stroke.points;
    // Nutzerbefund 11.9.2026: automatisch erkannte Formen erschienen mit leuchtender
    // Füllung („durchsichtig-rot"). Eine erkannte Form ist zuerst nur eine Kontur;
    // gefüllt wird ausschließlich bewusst mit dem Füll-Werkzeug. Der frühere Fill-Delay
    // füllte nach 700 ms doch automatisch — das widersprach diesem Kommentar
    // (Code-Audit H-07) und ist deshalb entfernt.
    page.elements[index] = { type: "shape", id: stroke.id, kind, points, color: stroke.color, size: stroke.size, closed: kind !== "line" && kind !== "arrow", fillColor: undefined, fillOpacity: 0 };
    // Geschlossene Geraden werden zu einem Vieleck — ohne Füllung: eine erkannte Form
    // ist zuerst Kontur, gefüllt wird nur bewusst mit dem Fülleimer (Befund 11.9.2026).
    if (kind === "line") mergeClosedLineShapes(page, undefined, 0);
    this.setStatus(`Form erkannt: ${this.shapeLabel(kind, points)}`);
    window.setTimeout(() => this.setStatus(""), 1400); return true;
  }

  /** Gibt zurück, ob wirklich etwas entfernt wurde (siehe M-04: leere Undo-Schritte). */
  private eraseAt(page: HandwritingPage, point: InkPoint): boolean {
    const before = page.elements.length;
    page.elements = page.elements.filter((element) => {
      if (element.type === "stroke") return !strokeTouches(element, point, 18);
      if (element.type === "image") return true;
      const box = elementBounds(element);
      return point.x < box.minX - 18 || point.x > box.maxX + 18 || point.y < box.minY - 18 || point.y > box.maxY + 18;
    });
    const getroffen = page.elements.length !== before;
    if (getroffen) { this.markChanged(); this.redrawPage(page.id); }
    return getroffen;
  }

  /* ------------------------- Phase 4: Auswahl ------------------------- */

  private selectedElements(page: HandwritingPage): PageElement[] {
    if (page.id !== this.selectionPageId) return [];
    return page.elements.filter(element => this.selectionIds.has(element.id));
  }

  private setSelection(ids: string[]): void {
    this.selectionPageId = this.activePageId;
    this.selectionIds = new Set(ids);
    this.refreshSelectionBox();
    for (const pageId of this.selectionOverlays.keys()) this.drawSelectionOverlay(pageId);
    this.updateSelectionActions();
  }

  private refreshSelectionBox(): void {
    const page = this.activePage();
    this.selectionBox = page ? boxOf(this.selectedElements(page)) : null;
  }

  private clearSelection(): void {
    this.selectionPageId = null;
    this.selectionIds.clear();
    this.selectionBox = null;
    for (const pageId of this.selectionOverlays.keys()) this.drawSelectionOverlay(pageId);
    this.updateSelectionActions();
  }

  private pointInBox(box: SelectionBox, point: InkPoint): boolean {
    return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
  }

  private hitsSelected(page: HandwritingPage, point: InkPoint): boolean {
    if (this.selectionBox && !this.pointInBox(this.selectionBox, point)) return false;
    for (const element of this.selectedElements(page)) {
      if (element.type === "image" || element.type === "text") {
        const box = elementBounds(element);
        if (this.pointInBox({ minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY }, point)) return true;
      } else if (element.type === "shape") {
        if (shapeContainsPoint(element, point)) return true;
        if (element.points.some(candidate => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= Math.max(8, element.size / 2 + 6))) return true;
      } else {
        const ink = element.points ?? [];
        if (ink.some(candidate => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= Math.max(8, element.size / 2 + 6))) return true;
      }
    }
    return false;
  }

  private hitTestElement(page: HandwritingPage, point: InkPoint): PageElement | undefined {
    for (const element of [...page.elements].reverse()) {
      if (element.type === "image" && element.locked) continue;
      const box = elementBounds(element);
      if (!this.pointInBox({ minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY }, point)) continue;
      if (element.type === "text" || element.type === "image") return element;
      if (element.type === "shape") {
        const tolerance = element.kind === "line" || element.kind === "arrow" ? Math.max(10, element.size / 2 + 8) : 0;
        if (shapeContainsPoint(element, point) || element.points.some(candidate => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= tolerance)) return element;
      } else if (element.type === "stroke" || element.type === "highlight") {
        const tolerance = Math.max(8, element.size / 2 + 6);
        if ((element.points ?? []).some(candidate => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= tolerance)) return element;
      }
    }
    return undefined;
  }

  private selectionHandleAt(page: HandwritingPage, point: InkPoint): number | null {
    if (!this.selectionBox || this.selectionPageId !== page.id) return null;
    const canvas = this.canvases.get(page.id);
    const scale = canvas?.getBoundingClientRect()?.width ? page.width / canvas.getBoundingClientRect().width : 1;
    const tolerance = 12 * scale;
    const corners: Array<[number, number]> = [
      [this.selectionBox.minX, this.selectionBox.minY],
      [this.selectionBox.maxX, this.selectionBox.minY],
      [this.selectionBox.maxX, this.selectionBox.maxY],
      [this.selectionBox.minX, this.selectionBox.maxY]
    ];
    const index = corners.findIndex(([x, y]) => Math.hypot(point.x - x, point.y - y) <= tolerance);
    return index >= 0 ? index : null;
  }

  private beginDrag(page: HandwritingPage, start: InkPoint): void {
    this.dragSnapshot = this.selectedElements(page);
    this.dragStart = start;
  }

  private previewSelectionGeometry(page: HandwritingPage, dx: number, dy: number, _scale: number, _box: SelectionBox | null): void {
    const translated = translateElements(this.dragSnapshot, dx, dy);
    this.queuePreview(() => this.paintPreview(page, translated, boxOf(translated)));
  }

  private commitDrag(page: HandwritingPage, dx: number, dy: number): void {
    this.remember();
    const translated = translateElements(this.dragSnapshot, dx, dy);
    const replacements = new Map(translated.map(element => [element.id, element]));
    page.elements = page.elements.map(element => replacements.get(element.id) ?? element);
    this.dragSnapshot = []; this.dragStart = null;
    this.pointerPageId = null;
    this.refreshSelectionBox();
    this.markChanged(); this.redrawPage(page.id); this.drawSelectionOverlay(page.id);
    this.setStatus(dx === 0 && dy === 0 ? "" : "Auswahl verschoben — ↶ stellt zurück");
  }

  private beginResize(page: HandwritingPage, handle: number): void {
    this.resizeSnapshot = this.selectedElements(page);
    this.resizeHandle = handle;
    this.resizeBox = this.selectionBox;
    this.redrawPage(page.id);
  }

  /** Zeichenarbeit pro Frame bündeln: pointermove feuert mit >100 Hz (Stift noch mehr). */
  private previewFrame = 0;
  private queuePreview(draw: () => void): void {
    if (this.previewFrame) { this.pendingPreview = draw; return; }
    draw();
    // Umgebungen ohne requestAnimationFrame (Test-Harness im vm-Kontext) zeichnen direkt —
    // sonst bricht jede Verschiebung/Skalierung dort ab.
    const raf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 16);
    this.previewFrame = raf(() => {
      this.previewFrame = 0;
      const next = this.pendingPreview; this.pendingPreview = null;
      if (next) this.queuePreview(next);
    });
  }
  private pendingPreview: (() => void) | null = null;

  private previewResize(page: HandwritingPage, current: InkPoint): void {
    if (!this.resizeBox) return;
    this.resizeCurrent = current;
    const handle = this.resizeHandle ?? 2;
    const anchorX = handle === 0 || handle === 3 ? this.resizeBox.maxX : this.resizeBox.minX;
    const anchorY = handle === 0 || handle === 1 ? this.resizeBox.maxY : this.resizeBox.minY;
    const edgeX = handle === 0 || handle === 3 ? this.resizeBox.minX : this.resizeBox.maxX;
    const edgeY = handle === 0 || handle === 1 ? this.resizeBox.minY : this.resizeBox.maxY;
    const sx = Math.abs(edgeX - anchorX) < 1 ? 1 : clamp((current.x - anchorX) / (edgeX - anchorX), 0.15, 40);
    const sy = Math.abs(edgeY - anchorY) < 1 ? 1 : clamp((current.y - anchorY) / (edgeY - anchorY), 0.15, 40);
    const scaled = scaleElements(this.resizeSnapshot, { x: anchorX, y: anchorY, pressure: 0.5 }, sx, sy);
    // Nutzerbefund 11.9.2026: „Resize hängt total" — vorher liefen pro pointermove ZWEI
    // vollständige Seitenzeichnungen (redrawPage + Ghost) plus Rahmen. Jetzt genau eine
    // Vorschau-Zeichnung pro Frame: die Auswahl wird im Basisbild ausgeblendet und die
    // neue Geometrie einmal aufgetragen.
    // Nutzerbefund 11.9.2026 („Resize hängt total"): Vorher liefen pro pointermove-Ereignis
    // zwei vollständige Seitenzeichnungen — der Stift liefert über 100 Ereignisse pro Sekunde.
    // Jetzt wird genau einmal pro Bildschirmbild gezeichnet (requestAnimationFrame).
    this.queuePreview(() => this.paintPreview(page, scaled, boxOf(scaled)));
  }

  private commitResize(page: HandwritingPage): void {
    this.remember();
    if (this.resizeBox) {
      const handle = this.resizeHandle ?? 2;
      const anchorX = handle === 0 || handle === 3 ? this.resizeBox.maxX : this.resizeBox.minX;
      const anchorY = handle === 0 || handle === 1 ? this.resizeBox.maxY : this.resizeBox.minY;
      const edgeX = handle === 0 || handle === 3 ? this.resizeBox.minX : this.resizeBox.maxX;
      const edgeY = handle === 0 || handle === 1 ? this.resizeBox.minY : this.resizeBox.maxY;
      const current = this.resizeCurrent ?? this.resizeCursorPoint();
      const sx = Math.abs(edgeX - anchorX) < 1 ? 1 : clamp((current.x - anchorX) / (edgeX - anchorX), 0.15, 40);
      const sy = Math.abs(edgeY - anchorY) < 1 ? 1 : clamp((current.y - anchorY) / (edgeY - anchorY), 0.15, 40);
      const replacements = new Map(scaleElements(this.resizeSnapshot, { x: anchorX, y: anchorY, pressure: 0.5 }, sx, sy).map(element => [element.id, element]));
      page.elements = page.elements.map(element => replacements.get(element.id) ?? element);
    }
    this.resizeSnapshot = []; this.resizeHandle = null; this.resizeBox = null; this.resizeCurrent = null;
    this.pointerPageId = null;
    this.refreshSelectionBox();
    this.markChanged(); this.redrawPage(page.id); this.drawSelectionOverlay(page.id);
  }

  private resizeCursorPoint(): InkPoint {
    return { x: this.selectionBox?.maxX ?? 0, y: this.selectionBox?.maxY ?? 0, pressure: 0.5 };
  }

  /**
   * Vorschau: Das Basisbild bleibt unverändert (eine Zeichnung gespart). Hier wird die Seite
   * ohne die verschobenen/skalierten Originale aufgetragen und die neue Geometrie darüber —
   * dadurch entsteht genau EIN Bild pro Frame statt zweier Vollzeichnungen.
   */
  private drawGhostPreview(page: HandwritingPage, elements: PageElement[]): void {
    const overlay = this.overlays.get(page.id);
    if (!overlay) return;
    const context = prepareCanvas(overlay, page);
    if (!context) return;
    context.globalAlpha = 0.85;
    drawPageElements(context, { ...page, elements });
    context.globalAlpha = 1;
  }

  /** Die vollständige Vorschau (Basis + Geisterbild + Rahmen) genau einmal pro Frame. */
  private paintPreview(page: HandwritingPage, elements: PageElement[], frame: SelectionBox | null): void {
    this.redrawPage(page.id);
    this.drawGhostPreview(page, elements);
    if (frame) this.drawSelectionFrame(page.id, frame);
  }

  /** Entfernt diesen Block samt Datei (Rückfrage im Plugin) und blendet den Block aus. */
  private async removeSelf(): Promise<void> {
    const bestaetigt = await confirmDialog(`Diesen Handschriftblock samt Datei „${this.file.path || this.file.name || "Handschriftdatei"}" entfernen?\n\nDie Datei kommt in den Papierkorb.`);
    if (!bestaetigt) return;
    // Loeschen und Aufraeumen bewusst getrennt: schlaegt das Loeschen fehl (gesperrte Datei,
    // fehlende Vault-Berechtigung), darf die Oberflaeche trotzdem nicht gesperrt
    // zurueckbleiben — sonst laesst sich Obsidian danach nicht mehr bedienen (K-02-Klasse).
    const pfad = this.file.path || this.file.name || "die Handschriftdatei";
    let fehler: string | null = null;
    try { await this.plugin.removeBlockFile(this.file); }
    catch (error) { fehler = String(error); }
    this.wrapper.empty();
    // Die Body-Sperre muss mit: blieb `hp-editor-open` stehen, ließ sich Obsidian danach
    // nicht mehr scrollen (Code-Audit K-02). Gespeichert wird hier nichts mehr — die
    // Datei liegt im Papierkorb.
    document.body.removeClass("hp-editor-open");
    this.setPenCursorActive(false);
    this.editing = false;
    this.wrapper.removeClass("is-editing");
    this.editButton.setText("Bearbeiten");
    this.reticle.removeClass("is-visible");
    this.wrapper.createDiv({
      cls: "hp-error",
      text: fehler
        ? `Entfernen fehlgeschlagen (${fehler}). Die Datei ${pfad} liegt noch im Vault — bitte von Hand löschen.`
        : "Handschriftblock entfernt. Die Blockmarke im Text kann jetzt gelöscht werden."
    });
  }

  private drawSelectionOverlay(pageId: string): void {
    const page = this.page(pageId);
    const overlay = this.selectionOverlays.get(pageId);
    if (!page || !overlay) return;
    const context = prepareCanvas(overlay, page);
    if (!context) return;
    if (this.ruler) this.drawRuler(context);
    if (this.selectionBox && this.selectionPageId === pageId) this.drawSelectionFrame(pageId, this.selectionBox);
  }

  /** Ruler geometry: line through center at angle, half length fixed; returns distance of a point to the line. */
  private rulerAxis(): { cx: number; cy: number; dx: number; dy: number; half: number } | null {
    if (!this.ruler) return null;
    const dx = Math.cos(this.ruler.angle), dy = Math.sin(this.ruler.angle);
    return { cx: this.ruler.x, cy: this.ruler.y, dx, dy, half: 340 };
  }
  private rulerDistance(point: InkPoint): number {
    const axis = this.rulerAxis(); if (!axis) return Infinity;
    const rx = point.x - axis.cx, ry = point.y - axis.cy;
    return Math.abs(-rx * axis.dy + ry * axis.dx);
  }
  private rulerHandleAt(page: HandwritingPage, point: InkPoint): "move" | "rotate" | null {
    const axis = this.rulerAxis(); if (!axis) return null;
    const rx = point.x - axis.cx, ry = point.y - axis.cy;
    const along = rx * axis.dx + ry * axis.dy;
    const off = Math.abs(-rx * axis.dy + ry * axis.dx);
    if (Math.abs(along) > axis.half * 1.12 && off < 22) return "rotate";
    if (Math.abs(along) <= axis.half && off < 16) return "move";
    return null;
  }
  private projectOnRuler(point: InkPoint): InkPoint {
    const axis = this.rulerAxis(); if (!axis) return point;
    const rx = point.x - axis.cx, ry = point.y - axis.cy;
    const along = rx * axis.dx + ry * axis.dy;
    return { ...point, x: axis.cx + axis.dx * along, y: axis.cy + axis.dy * along };
  }
  /** Lineal-Körper (Apple-Stil): halbtransparente Leiste mit Skala und Drehgriffen. */
  private drawRuler(context: CanvasRenderingContext2D): void {
    const axis = this.rulerAxis(); if (!axis) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--interactive-accent").trim() || "#7c5cff";
    const dicke = 44, half = axis.half;
    context.save();
    context.translate(axis.cx, axis.cy);
    context.rotate(this.ruler?.angle ?? 0);
    context.beginPath(); context.roundRect(-half, -dicke / 2, half * 2, dicke, 9);
    context.globalAlpha = 0.12; context.fillStyle = accent; context.fill();
    context.globalAlpha = 0.9; context.strokeStyle = accent; context.lineWidth = 2; context.stroke();
    // Skala: jeder fünfte Strich lang
    context.globalAlpha = 0.75; context.lineWidth = 1.5;
    context.beginPath();
    for (let x = -half + 8, i = 0; x <= half - 8; x += 18, i += 1) {
      const laenge = i % 5 === 0 ? 15 : 8;
      context.moveTo(x, -dicke / 2); context.lineTo(x, -dicke / 2 + laenge);
    }
    context.stroke();
    context.globalAlpha = 1; context.fillStyle = accent;
    for (const r of [-half, half]) { context.beginPath(); context.arc(r, 0, 8, 0, Math.PI * 2); context.fill(); }
    context.restore();
  }

  /** Beim Einschalten in den sichtbaren Blattbereich legen — sonst „passiert nichts". */
  private placeRulerInView(): void {
    const page = this.activePage();
    if (!page) { this.ruler = { x: 420, y: 840, angle: 0 }; return; }
    const frame = this.pagesEl.querySelector<HTMLElement>(`[data-page-id="${page.id}"]`);
    if (!frame) { this.ruler = { x: page.width / 2, y: page.height / 3, angle: 0 }; return; }
    const frameBox = frame.getBoundingClientRect();
    const host = this.pagesEl.getBoundingClientRect();
    const scale = frameBox.width / page.width || 1;
    const oben = Math.max(0, (host.top - frameBox.top) / scale);
    const unten = Math.min(page.height, (host.bottom - frameBox.top) / scale);
    const y = unten > oben ? (oben + unten) / 2 : page.height / 3;
    this.ruler = { x: page.width / 2, y, angle: 0 };
  }

  private drawSelectionFrame(pageId: string, box: SelectionBox): void {
    const page = this.page(pageId);
    const overlay = this.selectionOverlays.get(pageId);
    if (!page || !overlay) return;
    const context = prepareCanvas(overlay, page);
    if (!context) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--interactive-accent").trim() || "#7c5cff";
    const canvasRect = this.canvases.get(pageId)?.getBoundingClientRect();
    const scale = canvasRect?.width ? page.width / canvasRect.width : 1;
    context.strokeStyle = accent; context.fillStyle = accent;
    context.lineWidth = 2 * scale; context.setLineDash([6 * scale, 4 * scale]);
    context.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
    context.setLineDash([]);
    const size = 8 * scale;
    for (const [x, y] of [[box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY]] as Array<[number, number]>) {
      context.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }

  private updateSelectionActions(): void {
    if (!this.selectionActions) return;
    this.selectionActions.hidden = this.selectionIds.size === 0;
    const label = this.selectionActions.querySelector<HTMLElement>(".hp-selection-count");
    if (label) label.setText(`${this.selectionIds.size} ${this.selectionIds.size === 1 ? "Objekt" : "Objekte"} ausgewählt`);
    if (this.selectionIds.size === 0) this.selectionBox = null;
  }

  private deleteSelected(): void {
    const page = this.activePage();
    if (!page || this.selectionIds.size === 0) return;
    this.remember();
    page.elements = page.elements.filter(element => !this.selectionIds.has(element.id));
    this.clearSelection();
    this.markChanged(); this.redrawPage(page.id);
    this.setStatus("Auswahl gelöscht — ↶ stellt zurück");
  }

  private duplicateSelected(): void {
    const page = this.activePage();
    if (!page || this.selectionIds.size === 0) return;
    this.remember();
    const duplicates = duplicateElements(this.selectedElements(page));
    page.elements.push(...duplicates);
    this.setSelection(duplicates.map(element => element.id));
    this.markChanged(); this.redrawPage(page.id);
    this.setStatus("Auswahl dupliziert — Kopie liegt versetzt");
  }

  private recolorSelected(): void {
    const page = this.activePage();
    if (!page || this.selectionIds.size === 0) return;
    this.remember();
    for (const element of this.selectedElements(page)) {
      // Die frühere Bedingung verglich die eben zugewiesene Stiftfarbe mit der Markerfarbe
      // und war damit praktisch nie wahr — ein Marker wurde in Stiftfarbe eingefärbt
      // (Code-Audit M-03). Marker bekommen jetzt direkt ihre eigene Farbe.
      if (element.type === "highlight") element.color = this.plugin.settings.markerColor;
      else if (element.type === "stroke" || element.type === "shape" || element.type === "text") element.color = this.plugin.settings.penColor;
    }
    this.markChanged(); this.redrawPage(page.id);
    this.setStatus("Auswahl eingefärbt");
  }

  private nudgeSelected(dx: number, dy: number): void {
    const page = this.activePage();
    if (!page || this.selectionIds.size === 0) return;
    this.remember();
    const moved = translateElements(this.selectedElements(page), dx, dy);
    const ids = new Set(this.selectionIds);
    page.elements = page.elements.map(element => ids.has(element.id) ? moved.find(candidate => candidate.id === element.id) ?? element : element);
    this.refreshSelectionBox();
    this.markChanged(); this.redrawPage(page.id); this.drawSelectionOverlay(page.id);
  }

  /* ------------------------- Phase 4: Seiten & Zoom ------------------------- */

  private movePage(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.document.pages.length) return;
    this.remember();
    const pages = this.document.pages;
    const [page] = pages.splice(index, 1);
    pages.splice(target, 0, page);
    this.rebuildPages(); this.rebuildPageStrip(); this.markChanged();
  }

  private duplicatePage(index: number): void {
    const source = this.document.pages[index];
    if (!source) return;
    this.remember();
    const copy = structuredClone(source);
    copy.id = crypto.randomUUID();
    this.document.pages.splice(index + 1, 0, copy);
    this.activePageId = copy.id;
    this.rebuildPages(); this.rebuildPageStrip(); this.markChanged();
  }

  private async deletePage(index: number): Promise<void> {
    if (this.document.pages.length <= 1) { this.setStatus("Die letzte Seite kann nicht gelöscht werden"); return; }
    if (!await confirmDialog(`Seite ${index + 1} wirklich löschen?\n\n↶ stellt sie wieder her.`)) return;
    this.remember();
    const [removed] = this.document.pages.splice(index, 1);
    if (this.activePageId === removed.id) this.activePageId = this.document.pages[Math.min(index, this.document.pages.length - 1)].id;
    this.clearSelection();
    this.rebuildPages(); this.rebuildPageStrip(); this.markChanged();
  }

  /** Bricht einen wartenden Vorschau-Frame ab (Code-Audit M-02). */
  /**
   * Zeichnet die gezogene Form und ihre Messwerte höchstens einmal pro Anzeigebild.
   * Beides pro Stiftpunkt auszuführen kostete ein Canvas-Löschen und eine DOM-Schreibung
   * je Punkt — bei über 100 Punkten je Sekunde deutlich spürbar.
   */
  private shapeFeedbackFrame = 0;
  private scheduleShapeFeedback(pageId: string, element: ShapeElement): void {
    if (this.shapeFeedbackFrame) return;
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: FrameRequestCallback) => window.setTimeout(() => cb(Date.now()), 16) as unknown as number;
    this.shapeFeedbackFrame = raf(() => {
      this.shapeFeedbackFrame = 0;
      const page = this.page(pageId);
      if (!page) return;
      const overlay = this.overlays.get(pageId);
      if (overlay) { const ctx = prepareCanvas(overlay, page, this.measuredRect(this.canvases.get(pageId) ?? overlay)); if (ctx) drawShape(ctx, element); }
      this.setStatus(shapeMeasurements(element).map(m => m.text).join(" · "));
    });
  }

  /**
   * Live-Tinte höchstens einmal pro Anzeigebild zeichnen.
   *
   * Gemessen (11.9.2026): Die Kosten pro Stiftpunkt wachsen mit der Dokumentgröße —
   * 1 Seite 0,267 ms, 19 Seiten 1,861 ms —, weil bei JEDEM pointermove synchron in das
   * Overlay gezeichnet wurde. Ein Stift liefert über 100 Ereignisse je Sekunde; alles
   * über der Bildrate ist verschenkte Arbeit und erzeugt die spürbare Verzögerung.
   * Jetzt werden die neuen Punkte nur eingesammelt und einmal pro Bild gezeichnet.
   * Der Stiftpunkt (reine transform-Änderung) folgt weiterhin sofort — das Schreiben
   * fühlt sich dadurch direkter an, nicht träger.
   */
  private liveInkFrame = 0;
  private liveInkPending: { pageId: string; elementId: string; from: number } | null = null;

  private scheduleLiveInk(pageId: string, element: StrokeElement | import("./document").HighlightElement, from: number): void {
    if (this.liveInkPending && this.liveInkPending.pageId === pageId) this.liveInkPending.from = Math.min(this.liveInkPending.from, from);
    else this.liveInkPending = { pageId, elementId: element.id, from };
    if (this.liveInkFrame) return;
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: FrameRequestCallback) => window.setTimeout(() => cb(Date.now()), 16) as unknown as number;
    this.liveInkFrame = raf(() => this.flushLiveInk());
  }

  /** Zeichnet alle aufgelaufenen Strichpunkte in einem Zug (idempotent). */
  private flushLiveInk(): void {
    this.liveInkFrame = 0;
    const offen = this.liveInkPending;
    this.liveInkPending = null;
    if (!offen) return;
    const page = this.page(offen.pageId);
    const element = page?.elements.find(candidate => candidate.id === offen.elementId);
    if (!page || !element) return;
    const context = this.overlays.get(offen.pageId)?.getContext("2d");
    if (!context) return;
    if (element.type === "stroke") drawLiveInk(context, element, offen.from);
    else if (element.type === "highlight" && element.points) drawLiveInk(context, { id: element.id, color: element.color, size: element.size, pressureSensitivity: 0, points: element.points }, offen.from);
  }

  private cancelPreviewFrame(): void {
    if (this.previewFrame) { cancelAnimationFrame(this.previewFrame); this.previewFrame = 0; }
    this.pendingPreview = null;
  }

  private rebuildPageStrip(): void {
    if (!this.pageStrip) return;
    this.pageStrip.empty();
    for (const [index, page] of this.document.pages.entries()) {
      const item = this.pageStrip.createDiv("hp-page-thumb");
      item.addEventListener("click", () => {
        this.setActivePage(page.id);
        this.pagesEl.querySelector<HTMLElement>(`[data-page-id="${page.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      const thumbnail = this.pageThumbnail(page);
      if (page.id === this.activePageId) item.addClass("is-active");
      item.append(thumbnail);
      item.createDiv({ cls: "hp-page-thumb-label", text: `Seite ${index + 1}` });
      const controls = item.createDiv("hp-page-thumb-controls");
      const up = controls.createEl("button", { text: "↑", attr: { "aria-label": `Seite ${index + 1} nach oben` } });
      up.onclick = (event) => { event.stopPropagation(); this.movePage(index, -1); };
      const down = controls.createEl("button", { text: "↓", attr: { "aria-label": `Seite ${index + 1} nach unten` } });
      down.onclick = (event) => { event.stopPropagation(); this.movePage(index, 1); };
      const duplicate = controls.createEl("button", { text: "⧉", attr: { "aria-label": `Seite ${index + 1} duplizieren` } });
      duplicate.onclick = (event) => { event.stopPropagation(); this.duplicatePage(index); };
      const remove = controls.createEl("button", { text: "🗑", attr: { "aria-label": `Seite ${index + 1} löschen` } });
      remove.onclick = (event) => { event.stopPropagation(); this.deletePage(index); };
    }
  }

  private pageThumbnail(page: HandwritingPage): HTMLCanvasElement {
    const scale = 120 / page.width;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(page.width * scale);
    canvas.height = Math.round(page.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return canvas;
    context.scale(scale, scale);
    drawPaper(context, page);
    for (const element of page.elements) {
      if (element.type === "image") { context.fillStyle = "rgba(124, 92, 255, 0.16)"; const box = elementBounds(element); context.fillRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY); continue; }
      drawBoardElement(context, element);
    }
    return canvas;
  }

  private setZoom(next: number): void {
    const previous = this.zoom;
    this.zoom = clamp(next, 0.35, 4);
    for (const frame of Array.from(this.pagesEl.querySelectorAll<HTMLElement>(".hp-page"))) {
      const page = this.page(frame.dataset.pageId ?? "");
      if (page) frame.style.setProperty("--hp-page-width", `${page.width * this.zoom + 4}px`);
    }
    // Width participates in normal flow, so page height and both scroll ranges grow.
    this.pagesEl.scrollTop *= this.zoom / previous;
    this.pagesEl.scrollLeft *= this.zoom / previous;
    this.zoomLabel?.setText(`${Math.round(this.zoom * 100)} %`);
    requestAnimationFrame(() => this.redrawAll());
  }

  private zoomLabel: HTMLElement | null = null;

  private fitZoom(): void {
    const page = this.activePage();
    if (!page) return;
    const width = this.pagesEl.clientWidth - 32;
    this.setZoom(Math.max(0.35, Math.min(2, width / page.width)));
  }

  private queueWordStroke(pageId: string, strokeId: string): void {
    const stroke=this.page(pageId)?.elements.find(e=>e.id===strokeId); if(stroke?.type!=="stroke" || stroke.normalizedWordId) return;
    const pending = this.pendingStrokes.get(pageId) ?? new Set<string>(); pending.add(strokeId); this.pendingStrokes.set(pageId, pending);
    const oldTimer = this.wordTimers.get(pageId); if (oldTimer !== undefined) window.clearTimeout(oldTimer);
    const timer = window.setTimeout(() => { this.wordTimers.delete(pageId); const ids = [...(this.pendingStrokes.get(pageId) ?? [])]; this.pendingStrokes.delete(pageId); if (ids.length > 0) this.enqueueNormalization(pageId, ids); }, this.plugin.settings.wordDelay);
    this.wordTimers.set(pageId, timer);
  }

  private enqueueNormalization(pageId: string, ids: string[]): void {
    const epoch = this.normalizationEpoch;
    this.normalizationQueue = this.normalizationQueue.then(() => this.normalizeWord(pageId, ids, epoch)).catch((error) => { console.error("Smooth Handwriting normalization failed", error); this.setStatus("Korrektur übersprungen"); });
  }

  private async normalizeWord(pageId: string, ids: string[], epoch: number): Promise<void> {
    await Promise.resolve();
    const page = this.page(pageId); if (!page || epoch !== this.normalizationEpoch) return;
    if (this.pointerPageId || this.importing) { for (const id of ids) this.queueWordStroke(pageId, id); return; }
    if(this.plugin.settings.beautifyEnabled) await this.normalizeWordV2(page,ids,epoch);
    if(this.plugin.settings.liveConvert) await this.liveConvertInk(page, ids, epoch);
  }

  /** Live-Umwandlung (Nutzerauftrag 10.9.2026): erkannte Zeile ersetzt Tinte, Original bleibt in reconstruction.originalStrokes.
   * Bewusst NICHT in normalizeWordV2: Der Auto-Pipeline-Vertrag (8.9.2026) verbietet OCR/Fonts in der Verschönerung.
   * Der Toggle ist das explizite Opt-in des Nutzers; das Vertrauensgate schützt vor Fehlernkennung. */
  private async liveConvertInk(page: HandwritingPage, ids: string[], epoch: number): Promise<void> {
    if (epoch !== this.normalizationEpoch || this.pointerPageId || this.objectEditing || this.importing) return;
    // Wichtig: normalizeWordV2 läuft VOR dieser Funktion und markiert dieselben Striche mit normalizedWordId.
    // Deshalb hier NICHT nach !normalizedWordId filtern — sonst findet die Live-Umwandlung bei aktiver
    // Verschönerung (Standardfall) nie etwas und wäre ein stiller No-Op.
    const strokes = page.elements.filter((e): e is StrokeElement => e.type === "stroke" && ids.includes(e.id));
    if (!strokes.length) return;
    // Zeichnungs-Schutz (Review 10.9.2026): normalizeWordV2 lässt erkannte Zeichnungen unverändert —
    // die Live-Umwandlung darf sie ebenso wenig in Text verwandeln (Vertrag: Zeichnungen bleiben intakt).
    if (isDrawingCluster(strokes, paperWritingLayout(page.paper, { ...this.plugin.settings }).height)) return;
    try {
      const lines = segmentInkLines(strokes);
      if (!lines.length) return;
      const recognizer = this.plugin.sharedRecognizer();
      let converted = 0;
      for (const line of lines) {
        const { text, confidence } = await recognizer.recognizeDetailed(line);
        if (epoch !== this.normalizationEpoch || this.pointerPageId || this.objectEditing || this.importing) return;
        if (!text.trim()) continue;
        if (confidence < this.plugin.settings.liveConvertMinConfidence) { this.setStatus(`Live-Umwandlung: Zeile übersprungen (Vertrauen ${Math.round(confidence * 100)} %) – Tinte bleibt`); continue; }
        const textElement = reconstructLine(page, line, text);
        if (!converted) this.remember(); // Undo-Snapshot vor der ersten Ersetzung, sonst ist das Original nur über reconstruction erreichbar
        applyReconstructions(page, [textElement]);
        converted++;
        this.setStatus(`Live umgewandelt: „${text.slice(0, 40)}" – Original wiederherstellbar`);
      }
      if (converted) { this.markChanged(); this.redrawPage(page.id); }
    } catch (error) {
      // Sanfter Fallback: Tinte bleibt, keine dialogblockierende Fehlermeldung.
      this.setStatus(`Live-Umwandlung übersprungen: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Statusmeldung setzen. Fehler dürfen nicht wie „4 Seiten" aussehen (UI-Audit 2.6),
   * und lange Sätze wurden stumm abgeschnitten — der volle Text steht deshalb im title
   * und ist per Maus erreichbar (2.7).
   */
  private setStatus(text: string, kind: "info" | "error" = "info"): void {
    this.statusEl.setText(text);
    this.statusEl.toggleClass("is-error", kind === "error" && text !== "");
    if (text) this.statusEl.setAttribute("title", text);
    else this.statusEl.removeAttribute("title");
  }
  private async normalizeWordV2(page:HandwritingPage,ids:string[],epoch:number):Promise<void> {
    if(epoch!==this.normalizationEpoch) return;
    if(this.pointerPageId || this.objectEditing) { for(const id of ids) this.queueWordStroke(page.id,id); return; }
    const source=page.elements.filter((e):e is StrokeElement=>e.type==="stroke" && !e.normalizedWordId && ids.includes(e.id));
    if(!source.length) return;
    // Zeichnungs-Schutz: Freihand-Zeichnungen bleiben vollständig intakt.
    const layoutProbe=paperWritingLayout(page.paper,{...this.plugin.settings});
    if(isDrawingCluster(source,layoutProbe.height)) { this.setStatus("Zeichnung erkannt – bleibt unverändert"); return; }
    const lines=segmentInkLines(source);
    if(lines.length>1) { for(const line of lines) await this.normalizeWordV2(page,line.strokes.map(s=>s.id),epoch); return; }
    const words=splitNewInkWords(source);
    if(words.length>1) {for(const word of words) await this.normalizeWordV2(page,word.map(s=>s.id),epoch);return;}
    const settings={...this.plugin.settings},layout=paperWritingLayout(page.paper,settings);
    const normalized=normalizeHandwritingV2(source,{height:layout.height,strength:settings.beautifyStrength,closeLoops:settings.beautifyCloseLoops,equalize:settings.equalizeLetters,smooth:settings.smoothInkLines,pageWidth:page.width,pageHeight:page.height,paper:page.paper});
    const signature=JSON.stringify(source);
    const output=normalized.strokes;
    const message="Höhe angepasst · Striche beruhigt";
    const commit=async()=> {
      const valid=()=>epoch===this.normalizationEpoch && this.page(page.id)===page && this.plugin.settings.beautifyEnabled;
      // Wait without touching existing ink while the next pointer gesture is active.
      while(valid() && (this.pointerPageId || this.objectEditing || this.importing)) await new Promise(resolve=>window.setTimeout(resolve,80));
      if(!valid() || JSON.stringify(page.elements.filter(e=>ids.includes(e.id)))!==signature) return;
      const occupied=page.elements.filter(e=>!ids.includes(e.id)&&e.type!=="image"&&e.type!=="highlight").map(elementBounds);
      if(output.some(e=>{const b=elementBounds(e);return occupied.some(o=>b.minX<o.maxX&&b.maxX>o.minX&&b.minY<o.maxY&&b.maxY>o.minY);})) {this.setStatus("Zu wenig Platz für das neue Wort – Original bleibt");return;}
      this.remember(); const first=page.elements.findIndex(e=>ids.includes(e.id));page.elements=page.elements.filter(e=>!ids.includes(e.id));page.elements.splice(first,0,...output);
      this.markChanged();this.redrawPage(page.id);this.setStatus(message);
    };
    await commit();
  }
  private clearPendingNormalization(): void {
    this.normalizationEpoch++;
    for (const timer of this.wordTimers.values()) window.clearTimeout(timer);
    this.wordTimers.clear(); this.pendingStrokes.clear();
  }
  private async recognizeHandwriting(): Promise<void> {
    const page = this.activePage(); if (!page) return;
    this.clearPendingNormalization(); const revision = this.saves.revision;
    this.recognizer = this.plugin.createRecognizer();
    try {
      const result = await reviewHandwriting(page, this.recognizer);
      if (!result) return;
      if (revision !== this.saves.revision || this.page(page.id) !== page) throw new Error("Die Seite wurde geändert. Bitte Vorschau neu öffnen.");
      this.remember(); applyReconstructions(page, result); this.markChanged(); this.redrawPage(page.id); this.setStatus(`${result.length} geprüfte Zeilen rekonstruiert – Original gespeichert`);
    } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
    finally { this.recognizer.dispose(); this.recognizer = undefined; }
  }
  private async insertText(table = false): Promise<void> {
    this.activateTool("select"); this.pendingInsert=table ? "table" : "text";
    this.optionsPanel.hidden=true;
    this.setStatus(`${table ? "Tabelle" : "Textfeld"}: zum Einfügen auf die Seite tippen · Esc bricht ab`);
  }
  private async editTextElement(page: HandwritingPage, original?: import("./document").TextElement, table = false, position?: {x:number;y:number}): Promise<void> {
    if(this.objectEditing) return;
    // Ein geretteter Entwurf wartet auf dieser Seite: statt eines leeren Felds wird er
    // angeboten (nur solange keine Tabelle und kein bestehendes Feldelement bearbeitet wird).
    if(!original && !table && this.abandonedDrafts.has(page.id)) {
      const gerettet = this.abandonedDrafts.get(page.id);
      this.abandonedDrafts.delete(page.id);
      if(gerettet) {
        // Als bestehendes Element bearbeiten = derselbe Editor, aber mit Inhalt gefüllt.
        // „Übernehmen" fügt ihn regulär ein, „Abbrechen" verwirft ihn bewusst.
        new Notice("Geretteter Entwurf wiederhergestellt — mit ✓ übernehmen oder × verwerfen.");
        original = gerettet;
      }
    }
    const surface=this.canvases.get(page.id)?.parentElement; if(!surface) return;
    this.objectEditing=true;
    this.objectAbort=new AbortController(); this.editedObjectId=original?.id ?? null; this.redrawPage(page.id);
    this.optionsPanel.hidden=true;
    this.toolbar.querySelectorAll<HTMLElement>("[aria-expanded]").forEach(control=>control.setAttribute("aria-expanded","false"));
    this.toolbar.inert=true; this.editButton.disabled=true;
    const add=this.pagesEl.querySelector<HTMLButtonElement>(".hp-page-add"); if(add) add.disabled=true;
    try {
      const text=await editNotebookText(page, this.plugin.settings.penColor, surface, original, table, position, this.objectAbort.signal,
        (entwurf)=>{
          // Erneuter Abbruch: den neueren (vollständigeren) Entwurf behalten, nicht den alten.
          const alt = this.abandonedDrafts.get(page.id);
          const neuer = !alt || entwurf.text.length >= alt.text.length ? entwurf : alt;
          this.abandonedDrafts.set(page.id, neuer);
          new Notice("Entwurf gesichert — er wird beim nächsten Textfeld auf dieser Seite wiederhergestellt.");
        });
      if(text && this.page(page.id)===page) { this.remember(); const index=original ? page.elements.indexOf(original) : -1; if(index>=0) page.elements[index]=text; else page.elements.push(text); this.markChanged(); this.redrawPage(page.id); }
    } finally { this.objectEditing=false; this.objectAbort=null; this.editedObjectId=null; this.toolbar.inert=false; this.editButton.disabled=false; if(add) add.disabled=false; this.redrawPage(page.id); this.setStatus(""); }
  }
  private async editImageElement(page:HandwritingPage,original:ImageElement):Promise<void> {
    if(this.objectEditing||this.pointerPageId||this.importing)return;
    const surface=this.canvases.get(page.id)?.parentElement;if(!surface)return;
    this.objectEditing=true;this.objectAbort=new AbortController();this.editedObjectId=original.id;
    this.optionsPanel.hidden=true;this.toolbar.inert=true;this.editButton.disabled=true;this.redrawPage(page.id);
    const add=this.pagesEl.querySelector<HTMLButtonElement>(".hp-page-add");if(add)add.disabled=true;
    try {
      const result=await editNotebookImage(page,original,surface,this.objectAbort.signal);
      const index=page.elements.findIndex(e=>e.id===original.id);
      if(result && this.page(page.id)===page && index>=0) {this.remember();if(result==="delete")page.elements.splice(index,1);else page.elements[index]=result;this.markChanged();}
    } finally {this.objectEditing=false;this.objectAbort=null;this.editedObjectId=null;this.toolbar.inert=false;this.editButton.disabled=false;if(add)add.disabled=false;this.redrawPage(page.id);this.setStatus("Stift wählen, um das Bild zu beschriften");}
  }
  private changePaper(paper: Paper): void {
    const page = this.activePage(); if (!page || page.paper===paper) return;
    if(this.pointerPageId || this.objectEditing) {this.setStatus("Bitte erst die aktuelle Eingabe abschließen");this.updateHeader();return;}
    this.clearPendingNormalization(); this.remember(); page.paper = paper; alignPageBaselines(page);
    const frame = this.pagesEl.querySelector<HTMLElement>(`[data-page-id="${page.id}"]`); if (frame) setPaperClass(frame, paper); this.markChanged();
    this.updateHeader();
  }
  private addPage(): void {
    this.remember(); const last=this.document.pages[this.document.pages.length-1]; const page = createPage(last?.paper ?? this.plugin.settings.defaultPaper);
    if(last) { page.width=last.width; page.height=last.height; page.format=last.format; }
    this.document.pages.push(page); this.activePageId = page.id; this.rebuildPages(); this.rebuildPageStrip(); this.markChanged();
    requestAnimationFrame(() => this.pagesEl.querySelector(`[data-page-id="${page.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  /**
   * Sammelt allen maschinenlesbaren Text einer Seite: Textboxen, Tabellen (TSV) und
   * bereits erkannte Handschrift (recognitionText). Grundlage für die Begleitdatei,
   * über die Obsidians Suche den Heftinhalt findet (Blocker A2, 11.9.2026).
   */
  private pageText(page: HandwritingPage): string {
    const zeilen: string[] = [];
    page.elements.forEach((element) => {
      // Erkannte Handschrift sitzt auf STRICHEN, nicht auf Textboxen: wer eine Seite
      // „in Text umwandelt", bekommt recognitionText — ohne diesen Zweig wäre genau
      // der Inhalt nicht durchsuchbar, der am mühsamsten entstanden ist (Blocker A2).
      if (element.type === "stroke") {
        const erkannt = element.recognitionText?.replace(/\s+/g, " ").trim();
        if (erkannt) zeilen.push(erkannt);
        return;
      }
      if (element.type !== "text") return;
      if (element.table) {
        for (const row of element.table.cells) {
          const zellen = row.map(cell => String(cell ?? "").replace(/\s+/g, " ").trim());
          if (zellen.some(Boolean)) zeilen.push(zellen.join("\t"));
        }
        return;
      }
      const inhalt = (element.reconstruction?.originalStrokes ? "" : element.text) ?? "";
      const sauber = inhalt.replace(/\s+/g, " ").trim();
      if (sauber) zeilen.push(sauber);
    });
    return zeilen.join("\n");
  }

  /**
   * Schreibt eine Begleitdatei `<notiz>.handwriting.txt` mit dem Klartext des Hefts.
   *
   * Warum: Der Heftinhalt liegt sonst nur in der .handwriting.json, die Obsidians Suche
   * nicht liest — ein Schüler findet seine Notizen also nicht wieder (Blocker A2).
   * Die Datei wird aus dem gespeicherten Dokument erzeugt und bei jeder Sicherung
   * mitgeschrieben; sie ist reiner Text und geht bei Formatänderungen nicht verloren.
   */
  /**
   * Legt den eigenen, nicht gespeicherten Stand als Konfliktkopie neben die Notiz.
   *
   * Warum: Wird dieselbe Notiz parallel geändert (Sync oder zweites Fenster), hält das
   * Plugin das Speichern an, um den neueren Dateistand nicht zu überschreiben. Ohne Kopie
   * wäre die eigene Arbeit damit verloren (Blocker A5). Es wird NIE die Originaldatei
   * angefasst — nur eine zusätzliche, klar benannte Datei daneben gelegt.
   */
  private async writeConflictCopy(): Promise<void> {
    try {
      const stempel = new Date().toISOString().replace(/[:.]/g, "-");
      const ordner = this.file.parent?.path ?? "";
      const name = `${this.file.basename}.handwriting-konflikt-${stempel}.json`;
      const pfad = normalizePath(ordner ? `${ordner}/${name}` : name);
      const text = JSON.stringify(this.document);
      // Bewusst die Vault-API mit Pfad (nicht saveDocument): dort wird eine TFile erwartet,
      // die für eine neu anzulegende Datei noch nicht existiert.
      const vorhanden = this.plugin.app.vault.getAbstractFileByPath(pfad);
      if (vorhanden instanceof TFile) await this.plugin.app.vault.modify(vorhanden, text);
      else await this.plugin.app.vault.create(pfad, text);
      this.setStatus("Konfliktkopie gesichert");
    } catch (error) {
      console.warn("Smooth Handwriting: Konfliktkopie nicht geschrieben", error);
      new Notice("Konfliktkopie konnte nicht gesichert werden — bitte dieses Fenster offen lassen.");
    }
  }

  private async writeSearchCompanion(): Promise<void> {
    if (!this.plugin.settings.searchCompanion) return;
    try {
      const kopf = [
        `# ${this.file.basename}`,
        "",
        `Klartext dieses Handschrift-Hefts · ${this.document.pages.length} Seite(n) · automatisch erzeugt`,
        "Handschriftliche Striche sind hier NICHT enthalten; sie stehen in der zugehörigen .handwriting.json.",
        ""
      ];
      const seiten = this.document.pages.map((page, index) => {
        const inhalt = this.pageText(page);
        return `## Seite ${index + 1}\n${inhalt || "(kein Text auf dieser Seite)"}`;
      });
      const pfad = `${this.file.path.replace(/\.handwriting\.json$/i, "")}.handwriting.txt`;
      const text = [...kopf, ...seiten].join("\n\n") + "\n";
      const vorhanden = this.plugin.app.vault.getAbstractFileByPath(pfad);
      if (vorhanden instanceof TFile) await this.plugin.app.vault.modify(vorhanden, text);
      else await this.plugin.app.vault.create(pfad, text);
    } catch (error) {
      // Die Begleitdatei ist ein Zusatz — sie darf das Speichern nie stören.
      console.warn("Smooth Handwriting: Suchbegleitdatei nicht geschrieben", error);
    }
  }

  private async renderExportCanvas(page: HandwritingPage): Promise<HTMLCanvasElement> {
    const images = page.elements.filter((element): element is ImageElement => element.type === "image");
    await Promise.all(images.map(async (element) => {
      const image = cachedImage(element);
      await waitForNotebookImage(image);
    }));
    const canvas = document.createElement("canvas"); canvas.width = page.width; canvas.height = page.height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas nicht verfügbar");
    drawPaper(context, page); drawPageElements(context, page); return canvas;
  }
  private async exportActivePage(format: "png" | "jpeg" | "pdf"): Promise<void> {
    if(this.exporting||this.importing||this.objectEditing||this.pointerPageId)return;
    const current=this.activePage();if(!current)return;
    const page=structuredClone(current);this.exporting=true;
    try {
      this.setStatus(`Exportiere ${format.toUpperCase()} …`);
      const canvas = await this.renderExportCanvas(page);
      const pageNumber = this.document.pages.findIndex((candidate) => candidate.id === page.id) + 1;
      const basename = `Smooth-Handwriting-Seite-${pageNumber}`;
      if (format === "pdf") {
        const jpegUrl = canvas.toDataURL("image/jpeg", 0.94);
        const pdf = buildImagePdf(dataUrlBytes(jpegUrl), canvas.width, canvas.height);
        void deliverFile(new Blob([pdf as BlobPart], { type: "application/pdf" }), `${basename}.pdf`, `Seite: ${basename}`);
      } else {
        const mime = format === "png" ? "image/png" : "image/jpeg";
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Export fehlgeschlagen")), mime, 0.94));
        void deliverFile(blob, `${basename}.${format === "png" ? "png" : "jpg"}`, `Seite: ${basename}`);
      }
      this.setStatus(`${format.toUpperCase()} heruntergeladen`); window.setTimeout(() => this.setStatus(""), 1600);
    } catch (error) { new Notice(`Export fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`); this.setStatus(""); }
    finally {this.exporting=false;}
  }
  /**
   * Drucken: öffnet den System-Druckdialog mit der Notiz als Rasterbild(er).
   *
   * Warum: OneNote druckt Arbeitsblätter und Hausaufgaben auf Papier — ohne Drucken ist
   * der Schulalltag nicht abgebildet (Paritäts-Audit 11.9.2026, Blocker A3). Wir nutzen
   * den vorhandenen Seiten-Renderer und einen versteckten Rahmen; ein neuer Renderer,
   * ein neuer Exportpfad oder ein PDF-Zwischenschritt ist nicht nötig.
   */
  async printPages(): Promise<void> {
    if (this.exporting || this.importing || this.objectEditing || this.pointerPageId) return;
    this.exporting = true;
    try {
      this.setStatus("Bereite Drucken vor …");
      const snapshot = cloneDocument(this.document);
      const rahmen = document.createElement("iframe");
      rahmen.setAttribute("aria-hidden", "true");
      rahmen.className = "hp-print-frame";
      document.body.appendChild(rahmen);
      const fenster = rahmen.contentWindow;
      const dokument = fenster?.document;
      if (!fenster || !dokument) throw new Error("Druckfenster nicht verfügbar");
      dokument.open();
      dokument.write("<!doctype html><html><head><meta charset=\"utf-8\"><title>" + this.file.basename + "</title>"
        + "<style>@page{margin:12mm}html,body{margin:0;padding:0}img{width:100%;display:block;page-break-after:always}"
        + "img:last-child{page-break-after:auto}</style></head><body></body></html>");
      dokument.close();
      for (const page of snapshot.pages) {
        // Bei einem 30-seitigen Heft blockierte eine geschlossene Schleife die Oberfläche
        // minutenlang. Kurze Freigabe je Seite, damit die Oberfläche bedienbar bleibt.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        const canvas = await this.renderExportCanvas(page);
        const bild = dokument.createElement("img");
        bild.src = canvas.toDataURL("image/jpeg", 0.94);
        dokument.body.appendChild(bild);
      }
      const fertig = new Promise<void>((resolve) => { fenster.addEventListener("afterprint", () => resolve(), { once: true }); });
      fenster.focus();
      fenster.print();
      // Der Rahmen wird erst nach dem Druck entfernt; manche Drucker-Dialoge sind asynchron.
      void fertig.then(() => window.setTimeout(() => rahmen.remove(), 500));
      window.setTimeout(() => rahmen.remove(), 60000);
      this.setStatus("Druckdialog geöffnet");
      window.setTimeout(() => this.setStatus(""), 1800);
    } catch (error) {
      new Notice(`Drucken fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
      this.setStatus("");
    } finally { this.exporting = false; }
  }

  private async exportAllPagesPdf(): Promise<void> {
    if(this.exporting||this.importing||this.objectEditing||this.pointerPageId)return;
    const snapshot=cloneDocument(this.document);this.exporting=true;
    try {
      this.setStatus("Exportiere mehrseitige PDF …");
      const pages = [];
      for (const page of snapshot.pages) {
        const canvas = await this.renderExportCanvas(page);
        pages.push({ jpeg: dataUrlBytes(canvas.toDataURL("image/jpeg", 0.94)), pixelWidth: canvas.width, pixelHeight: canvas.height });
      }
      const pdf = buildMultiPageImagePdf(pages);
      void deliverFile(new Blob([pdf as BlobPart], { type: "application/pdf" }), "Smooth-Handwriting-Gesamtnotiz.pdf", "Gesamtnotiz");
      this.setStatus(`${pages.length} Seiten als PDF heruntergeladen`);
      window.setTimeout(() => this.setStatus(""), 1800);
    } catch (error) { new Notice(`PDF-Export fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`); this.setStatus(""); }
    finally {this.exporting=false;}
  }
  private placeImage(page: HandwritingPage, dataUrl: string, mimeType: "image/png" | "image/jpeg", sourceName: string, sourceWidth: number, sourceHeight: number, background=false): ImageElement {
    const scale = background ? Math.min(page.width / sourceWidth, page.height / sourceHeight) : Math.min(1,page.width*.65/sourceWidth,page.height*.42/sourceHeight);
    const width = sourceWidth * scale; const height = sourceHeight * scale;
    const element: ImageElement = { type: "image", id: crypto.randomUUID(), x: background ? (page.width-width)/2 : 48, y: background ? (page.height-height)/2 : 96, width, height, dataUrl, mimeType, sourceName,locked:background };
    page.elements.push(element);return element;
  }
  private async importFiles(files: File[]): Promise<void> {
    if (this.importing||this.objectEditing||this.pointerPageId) return;
    if (files.some(file => file.size > 20 * 1024 * 1024)) { new Notice("Bitte Dateien bis 20 MB verwenden."); return; }
    const busy = document.createElement("dialog"); busy.className = "hp-review";
    const progress = document.createElement("p"); progress.textContent = "Dokument wird lokal vorbereitet …"; progress.setAttribute("role", "status");
    const cancelImport = document.createElement("button"); cancelImport.textContent = "Import abbrechen";
    const controller = new AbortController(); this.importAbort = controller;
    const deadline = window.setTimeout(() => controller.abort(), 120000);
    cancelImport.onclick = () => controller.abort();
    busy.append(progress, cancelImport); busy.setAttribute("aria-label", "Datei-Import");
    busy.oncancel = event => { event.preventDefault(); controller.abort(); }; document.body.append(busy); busy.showModal();
    this.importing = true;
    const emptyStartPage = this.document.pages.length === 1 && this.document.pages[0].elements.length === 0 && files.every(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) ? this.document.pages[0].id : null;
    this.remember(); let imageTargetUsed = false; let importedPages = 0;
    let importedImage:{page:HandwritingPage;image:ImageElement}|undefined;
    try {
      this.setStatus("Importiere Datei …");
      for (const file of files) {
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          const pdfjs = await abortable(loadPdfJs(), controller.signal);
          const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
          try {
          const pdf = await abortable<PDFDocumentProxy>(loadingTask.promise, controller.signal);
          if (pdf.numPages > 40) throw new Error("Bitte PDFs mit höchstens 40 Seiten verwenden.");
          for (let number = 1; number <= pdf.numPages; number += 1) {
            progress.textContent = `PDF wird vorbereitet: Seite ${number} von ${pdf.numPages} …`;
            const sourcePage = await abortable(pdf.getPage(number), controller.signal); const originalViewport = sourcePage.getViewport({ scale: 1 });
            const viewport = sourcePage.getViewport({ scale: Math.min(2, 1600 / Math.max(originalViewport.width, originalViewport.height)) });
            const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext("2d"); if (!context) throw new Error("PDF-Canvas nicht verfügbar");
            // Offscreen rasterization must not wait for display-frame callbacks in a background host.
            const render = sourcePage.render({ canvas, canvasContext: context, viewport, intent: "print" });
            try { await abortable(render.promise, controller.signal); } finally { if (controller.signal.aborted) render.cancel(); }
            const page = createPage("blank"); page.width = canvas.width; page.height = canvas.height; page.format = "custom";
            this.placeImage(page, canvas.toDataURL("image/jpeg", 0.92), "image/jpeg", `${file.name} – Seite ${number}`, canvas.width, canvas.height,true);
            this.document.pages.push(page); this.activePageId = page.id; importedPages += 1;
          }
          } finally { void loadingTask.destroy().catch(() => {}); }
        } else if (["image/png","image/jpeg","image/webp"].includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)) {
          const dataUrl = await abortable(readDataUrl(file), controller.signal); const image = await abortable(loadHtmlImage(dataUrl), controller.signal);
          if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40_000_000)throw new Error("Bitte Bilder mit höchstens 40 Megapixeln verwenden.");
          const scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));
          const bitmap=document.createElement("canvas");bitmap.width=Math.max(1,Math.round(image.naturalWidth*scale));bitmap.height=Math.max(1,Math.round(image.naturalHeight*scale));
          const context=bitmap.getContext("2d");if(!context)throw new Error("Bild-Canvas nicht verfügbar");context.drawImage(image,0,0,bitmap.width,bitmap.height);
          const mimeType=/jpe?g/i.test(file.type)||/\.jpe?g$/i.test(file.name) ? "image/jpeg" : "image/png";
          const useCurrentPage = !imageTargetUsed && importedPages === 0;
          const page = useCurrentPage ? this.activePage() ?? createPage("blank") : createPage("blank");
          if (!this.document.pages.includes(page)) this.document.pages.push(page);
          if (!useCurrentPage) this.activePageId = page.id;
          importedImage={page,image:this.placeImage(page,bitmap.toDataURL(mimeType,.94),mimeType,file.name,bitmap.width,bitmap.height)};
          imageTargetUsed = true; importedPages += 1;
        } else throw new Error(`Nicht unterstütztes Format: ${file.name}`);
      }
      if (emptyStartPage && importedPages > 0) this.document.pages = this.document.pages.filter(page => page.id !== emptyStartPage);
      this.rebuildPages(); this.rebuildPageStrip(); this.markChanged(); this.setStatus(`${importedPages} Seite${importedPages === 1 ? "" : "n"} importiert`);
      requestAnimationFrame(() => this.pagesEl.querySelector(`[data-page-id="${this.activePageId}"]`)?.scrollIntoView({ block: "start" }));
      window.setTimeout(() => this.setStatus(""), 1800);
    } catch (error) {
      importedImage=undefined;const previous = this.history.pop(); if (previous) this.document = previous;
      this.activePageId = this.document.pages[0].id; this.rebuildPages();
      new Notice(`Import fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`); this.setStatus("");
    } finally { window.clearTimeout(deadline); this.importAbort = null; this.importing = false; busy.close(); busy.remove(); if (this.dirty) this.scheduleSave(); }
    if(importedImage && files.length===1){this.activateTool("select");void this.editImageElement(importedImage.page,importedImage.image);}
  }
  /* ------------------------- Übertragung: Backup & OneNote ------------------------- */

  /** Bearbeitbares Vollbackup (eigenes .handwriting.json) herunterladen. */
  exportEditableBackup(): void {
    if (this.exporting || this.importing || this.objectEditing || this.pointerPageId) return;
    const backup = exportNotebookBackup(this.document);
    void deliverFile(new Blob([backup.text], { type: "application/json" }), backup.filename, "Sicherung");
    this.setStatus("Bearbeitbares Backup heruntergeladen"); window.setTimeout(() => this.setStatus(""), 1600);
  }

  /** Vollbackup importieren: Seiten werden angehängt, ein Undo-Schritt. */
  async importBackupFile(file: { name: string; size: number; text: () => Promise<string> }): Promise<void> {
    if (this.importing || this.objectEditing || this.pointerPageId || this.exporting) return;
    if (file.size > 64 * 1024 * 1024) { new Notice("Backup zu groß: höchstens 64 MiB."); return; }
    this.importing = true;
    const controller = new AbortController(); this.importAbort = controller;
    try {
      const text = await file.text();
      if (controller.signal.aborted) return;
      const incoming = parseNotebookBackup(text, file.name);
      const pages = prepareBackupPages(this.document, incoming);
      if (!(await confirmDialog(`${pages.length} Seite${pages.length === 1 ? "" : "n"} aus "${file.name}" anhängen? Rückgängig ist möglich.`))) return;
      this.remember();
      this.document.pages.push(...pages);
      this.rebuildPages(); this.rebuildPageStrip(); this.markChanged();
      this.setStatus(`${pages.length} Seite${pages.length === 1 ? "" : "n"} importiert`);
    } catch (error) {
      new Notice(`Import fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.importAbort = null; this.importing = false;
      if (this.dirty) this.scheduleSave();
    }
  }

  /** OneNote-HTML/MHT-Export importieren; Tinte aus OneNote kommt als Bild. */
  async importOneNoteFile(file: { name: string; size: number; text: () => Promise<string> }): Promise<void> {
    if (this.importing || this.objectEditing || this.pointerPageId || this.exporting) return;
    if (!/\.(html?|mht|mhtml)$/i.test(file.name)) { new Notice("Bitte einen OneNote-Export als .html oder .mht wählen. Native .one-Dateien kann Obsidian nicht lesen — in OneNote über Datei → Exportieren → Webseite exportieren."); return; }
    if (file.size > ONE_NOTE_MAX_BYTES) { new Notice("OneNote-Export zu groß: höchstens 48 MiB."); return; }
    this.importing = true;
    const controller = new AbortController(); this.importAbort = controller;
    try {
      const raw = await file.text();
      if (controller.signal.aborted) return;
      const isArchive = /\.(mht|mhtml)$/i.test(file.name) || /^\s*MIME-Version:/im.test(raw.slice(0, 2000));
      const { html, images } = isArchive ? parseMhtArchive(raw) : { html: raw, images: new Map<string, string>() };
      const blocks = extractOneNoteBlocks(html);
      if (blocks.length === 0) { new Notice("In diesem OneNote-Export wurde kein übernehmbarer Inhalt gefunden."); return; }
      const { pages: layoutPages, missingImages } = layoutOneNoteBlocks(blocks, ONE_NOTE_PAGE_HEIGHT);
      if (layoutPages.length === 0) { new Notice("OneNote-Export ist nach der Aufbereitung leer."); return; }
      if (!(await confirmDialog(`"${file.name}": ${layoutPages.length} Seite${layoutPages.length === 1 ? "" : "n"} mit ${blocks.length} Blöcken anhängen? Rückgängig ist möglich.`))) return;
      this.remember();
      const imageData = (src: string) => {
        const resolved = images.get(src) ?? (/^data:image\//i.test(src) ? src : null);
        if (!resolved) return null;
        const mimeType = /^data:image\/jpeg/i.test(resolved) ? "image/jpeg" as const : "image/png" as const;
        const binary = atob(resolved.slice(resolved.indexOf(",") + 1));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        // Größe ohne DOM ermitteln: PNG/IHDR bzw. JPEG/SOF-Marker lesen.
        const readPng = bytes[0] === 0x89 ? (bytes[20] << 24 | bytes[24] << 16 | bytes[28] << 8 | bytes[32]) >>> 0 : 0;
        let width = readPng, height = 0;
        if (!width && bytes[0] === 0xff) {
          for (let offset = 2; offset + 9 < bytes.length; offset += 2 + ((bytes[offset + 2] << 8) | bytes[offset + 3])) {
            if (bytes[offset + 1] >= 0xc0 && bytes[offset + 1] <= 0xcf && bytes[offset + 1] !== 0xc4 && bytes[offset + 1] !== 0xc8 && bytes[offset + 1] !== 0xcc) {
              height = (bytes[offset + 5] << 8) | bytes[offset + 6];
              width = (bytes[offset + 7] << 8) | bytes[offset + 8];
              break;
            }
          }
        }
        if (!width || !height) { width = ONE_NOTE_PAGE_WIDTH - 128; height = 240; }
        return { dataUrl: resolved, mimeType, width, height };
      };
      for (const layout of layoutPages) {
        const page = createPage("lines");
        page.width = ONE_NOTE_PAGE_WIDTH; page.height = ONE_NOTE_PAGE_HEIGHT;
        page.elements = blocksToPageElements(layout, () => crypto.randomUUID(), imageData);
        this.document.pages.push(page);
      }
      this.rebuildPages(); this.rebuildPageStrip(); this.markChanged();
      const missingNote = missingImages.length > 0 ? ` (${missingImages.length} Bildquellen fehlen im Export)` : "";
      this.setStatus(`${layoutPages.length} OneNote-Seite${layoutPages.length === 1 ? "" : "n"} importiert${missingNote}`);
      window.setTimeout(() => this.setStatus(""), 2400);
    } catch (error) {
      new Notice(`OneNote-Import fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
      this.setStatus("");
    } finally {
      this.importAbort = null; this.importing = false;
      if (this.dirty) this.scheduleSave();
    }
  }

  /** Notiz als eigenständige HTML-Datei exportieren, die OneNote öffnen kann. */
  async exportOneNoteHtml(): Promise<void> {
    if (this.exporting || this.importing || this.objectEditing || this.pointerPageId) return;
    const snapshot = cloneDocument(this.document);
    this.exporting = true;
    try {
      this.setStatus("Exportiere OneNote-HTML …");
      const pages = [];
      for (const [index, page] of snapshot.pages.entries()) {
        const textLike = page.elements.filter(element => element.type === "text") as Extract<PageElement, { type: "text" }>[];
        const inkLike = page.elements.filter(element => element.type !== "text" && element.type !== "image");
        let inkDataUrl: string | undefined;
        if (inkLike.length > 0) {
          const canvas = document.createElement("canvas");
          canvas.width = page.width; canvas.height = page.height;
          const context = canvas.getContext("2d");
          if (context) { for (const element of inkLike) drawBoardElement(context, element); inkDataUrl = canvas.toDataURL("image/png"); }
        }
        pages.push({
          title: `Seite ${index + 1}`,
          inkDataUrl,
          blocks: textLike.map(element => ({ html: textElementToHtml(element) })).sort((left, right) => 0)
        });
      }
      const html = buildOneNoteHtml(pages, `Smooth-Handwriting-Export ${new Date().toLocaleDateString("de-DE")}`);
      void deliverFile(new Blob([html], { type: "text/html" }), "Smooth-Handwriting-Onenote-Export.html", "OneNote-Export");
      this.setStatus("OneNote-HTML heruntergeladen — in OneNote über Datei → Öffnen oder Einfügen importieren");
      window.setTimeout(() => this.setStatus(""), 2400);
    } catch (error) {
      new Notice(`OneNote-Export fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
      this.setStatus("");
    } finally { this.exporting = false; }
  }

  private remember(appendOnly = false): void {
    this.future = []; this.history.push(this.snapshots.capture(this.document));
    // Any operation that may mutate committed elements invalidates cached copies.
    if (!appendOnly) this.snapshots.invalidate();
    if (this.history.length > 60) this.history.shift();
  }
  private undo(): void {
    if (this.pointerPageId) return;
    const previous = this.history.pop(); if (!previous) return; this.future.push(cloneDocument(this.document)); this.document = cloneDocument(previous); this.snapshots.invalidate();
    if (!this.document.pages.some((page) => page.id === this.activePageId)) this.activePageId = this.document.pages[0].id;
    this.clearPendingNormalization(); this.rebuildPages(); this.rebuildPageStrip(); this.markChanged();
  }
  private redo(): void {
    if (this.pointerPageId) return;
    const next = this.future.pop(); if (!next) return;
    this.history.push(cloneDocument(this.document)); this.document = cloneDocument(next); this.snapshots.invalidate();
    this.clearPendingNormalization();
    if (!this.page(this.activePageId)) this.activePageId = this.document.pages[0].id;
    this.rebuildPages(); this.rebuildPageStrip(); this.markChanged();
  }
  private markChanged(): void { this.saves.markChanged(); this.scheduleSave(); }
  private scheduleSave(): void { if (this.saveTimer !== null) window.clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => { this.saveTimer = null; void this.saveNow(); }, 500); }
  private saveNow(): void {
    if (this.pointerPageId || this.importing) { this.scheduleSave(); return; }
    this.saveQueue.enqueue(() => this.drainSave());
  }
  private async drainSave(): Promise<void> {
    // Extern geändert (zweite Ansicht, Sync): den älteren In-Memory-Stand nicht
    // still über den neueren Dateistand schreiben.
    const mtime = this.file.stat?.mtime ?? 0;
    if (mtime > this.lastWriteTimeMs) {
      if (!this.saveConflictShown) {
        this.saveConflictShown = true;
        // Beim Konflikt den eigenen Stand NICHT still verwerfen, sondern daneben ablegen.
        // Sonst ist die Arbeit einer ganzen Unterrichtsstunde weg, sobald die Notiz
        // parallel (Sync, zweites Fenster) geändert wurde (Blocker A5).
        void this.writeConflictCopy();
        new Notice("Die Notiz wurde außerhalb dieses Fensters geändert. Ihr Stand wurde als Konfliktkopie gesichert – bitte dieses Fenster schließen und die Notiz erneut öffnen.");
      }
      this.setStatus("Extern geändert – Speichern angehalten (Konfliktkopie gesichert)", "error");
      return;
    }
    const attempt = await this.saves.tryDrain(async () => { await this.plugin.saveDocument(this.file, this.document); });
    if (attempt.status === "clean") {
      // Die Datei-mtime statt der lokalen Uhr merken: sonst galt eine extern geänderte
      // Datei dauerhaft als Konflikt, weil die Uhr weiterläuft (Code-Audit M-09).
      this.lastWriteTimeMs = this.file.stat?.mtime ?? Date.now();
      this.saveFailures = 0;
      this.saveConflictShown = false;
      void this.writeSearchCompanion();
    } else if (attempt.status === "superseded") {
      this.scheduleSave();
    } else if (attempt.status === "failed") {
      this.saveFailures += 1;
      if (this.saveFailures === 1) {
        const message = attempt.error instanceof Error ? attempt.error.message : String(attempt.error);
        new Notice(`Smooth Handwriting konnte nicht speichern: ${message} – neue Versuche laufen.`);
      }
      this.setStatus(`Speichern fehlgeschlagen (${this.saveFailures}. Versuch)`, "error");
      this.scheduleSave();
    }
  }
  private drawLaser(pageId: string): void {
    const page = this.page(pageId), overlay = this.overlays.get(pageId);
    if (!page || !overlay) return;
    overlay.style.opacity="1";
    const context = prepareCanvas(overlay, page);
    if (context && this.transientLaser) drawInkStroke(context, this.transientLaser, true);
  }
  private redrawPage(pageId: string): void {
    const page = this.page(pageId), canvas = this.canvases.get(pageId);
    if (!page || !canvas) return;
    const active = this.pointerPageId === pageId ? page.elements.find(e => e.id === this.currentElementId && (e.type === "stroke" || e.type === "highlight" || e.type === "shape")) as StrokeElement | HighlightElement | ShapeElement | undefined : undefined;
    const previewIds = new Set(this.pointerPageId === pageId ? [...this.dragSnapshot, ...this.resizeSnapshot].map(element => element.id) : []);
    drawPage(canvas, active || this.editedObjectId || previewIds.size ? { ...page, elements: page.elements.filter(e => e !== active && e.id !== this.editedObjectId && !previewIds.has(e.id)) } : page);
    const overlay = this.overlays.get(pageId);
    if (overlay) {
      const context = prepareCanvas(overlay, page); overlay.style.opacity=active?.type==="highlight" ? String(active.opacity) : "1";
      if(context && active) { if(active.type==="highlight") drawNotebookMarker(context,{...active,opacity:1}); else if(active.type==="shape") drawShape(context,active); else drawInkStroke(context,active); }
    }
    this.drawSelectionOverlay(pageId);
  }
  private redrawAll(): void { for (const page of this.document.pages) this.redrawPage(page.id); }
}

export default class SmoothHandwritingPlugin extends Plugin {
  settings: SmoothHandwritingSettings = DEFAULT_SETTINGS;
  private pdfManager!: PdfAnnotationManager;
  private pendingOpenPath: string | null = null;
  /** Agent-Kanal: Poll-Loop zur Companion-Bridge, standardmäßig aus. */
  agent: AgentChannel | null = null;
  private editorIndex = new Map<string, Set<InlineHandwritingEditor>>();

  registerEditor(editor: InlineHandwritingEditor, path: string): void {
    let set = this.editorIndex.get(path);
    if (!set) { set = new Set(); this.editorIndex.set(path, set); }
    set.add(editor);
  }
  unregisterEditor(editor: InlineHandwritingEditor, path: string): void {
    const set = this.editorIndex.get(path);
    if (!set) return;
    set.delete(editor);
    if (set.size === 0) this.editorIndex.delete(path);
  }
  /** Stabile Vault-Identität für die Brücke (isoliert zwei offene Vaults). */
  agentVaultId(): string {
    const base = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? this.app.vault.getName();
    let hash = 2166136261;
    for (const character of base) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return `vault-${(hash >>> 0).toString(16)}`;
  }
  newAgentToken(): string {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  private findAgentEditor(pageId?: string): InlineHandwritingEditor | null {
    for (const editors of this.editorIndex.values()) {
      for (const editor of editors) if (!pageId || editor.pageFor(pageId)) return editor;
    }
    return null;
  }
  collectAgentInspection(pageId: string | undefined): { ok: true; page: ReturnType<InlineHandwritingEditor["agentInspection"]> } | { ok: false; error: string } {
    const editor = this.findAgentEditor(pageId);
    if (!editor) return { ok: false, error: "kein offener Smooth-Handwriting-Editor – die Notiz muss geöffnet sein" };
    const page = pageId ? editor.pageFor(pageId) : editor.activeAgentPage();
    if (!page) return { ok: false, error: `Seite ${pageId ?? ""} im offenen Editor nicht gefunden` };
    return { ok: true, page: editor.agentInspection(page) };
  }
  proposeAgentBatch(batch: NotebookWriteBatch, label: string | null): Promise<AgentProposalOutcome> {
    const editor = this.findAgentEditor(batch.pageId);
    if (!editor) return Promise.resolve({ error: "kein offener Editor für diese Seite – die Notiz muss geöffnet sein" });
    return editor.proposeAgentBatch(batch, label);
  }
  async onload(): Promise<void> {
    // Die Handschrift-Schrift kommt aus dem Bundle, nicht mehr aus assets/: BRAT und der
    // Community-Store liefern nur main.js, manifest.json und styles.css aus, dort meldete
    // jede Installation beim Laden „Handschrift-Font fehlt" (Nutzerbefund 13.9.2026).
    try {
      const face = new FontFace("Teacher Caveat", caveatFontBytes);
      const fontSet = document.fonts as FontFaceSet & Set<FontFace>;
      fontSet.add(await face.load());
      this.register(() => { fontSet.delete(face); });
    } catch { /* Ohne registrierte Schrift greifen die Ersatzschriften aus rendering.ts. */ }
    const stored = await this.loadData() as Partial<SmoothHandwritingSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
    if ((stored?.settingsVersion ?? 0) < 3) {
      this.settings.settingsVersion = 3;
      // Earlier builds wrote 500 ms, which frequently fired between letters.
      if (stored?.wordDelay === undefined || stored.wordDelay <= 500) this.settings.wordDelay = 800;
      if (stored?.fillOpacity === undefined || stored.fillOpacity === 0) this.settings.fillOpacity = 0.24;
      await this.persistSettings();
    }
    this.addSettingTab(new SmoothHandwritingSettingTab(this.app, this));
    this.addCommand({ id: "pen-diagnostic", name: "Stift-Diagnose (was meldet mein Stift?)", callback: () => this.showPenDiagnostic() });
    // callback statt checkCallback: mit checkCallback verschwindet der Befehl aus der
    // Befehlspalette, sobald kein Markdown-Editor aktiv ist. Auf dem iPad öffnet Obsidian Notizen
    // in der Leseansicht — dort war „Handschriftblock einfügen" gar nicht auffindbar, während die
    // Stift-Diagnose (callback) stehen blieb (Nutzerbefund 13.9.2026). Das Ziel sucht sich der
    // Befehl jetzt selbst und stellt die Notiz bei Bedarf auf Bearbeiten um.
    this.addCommand({
      id: "insert-handwriting-block",
      name: "Handschriftblock einfügen",
      callback: () => void this.runBlockCommand("insert")
    });
    this.addCommand({
      id: "remove-handwriting-block",
      name: "Handschriftblock wieder entfernen",
      callback: () => void this.runBlockCommand("remove")
    });
    this.registerMarkdownCodeBlockProcessor("handschrift", async (source, element, context) => this.renderBlock(source.trim(), element, context));
    this.pdfManager = new PdfAnnotationManager(this.app, () => this.settings, () => this.persistSettings()); this.pdfManager.onload(); this.register(() => this.pdfManager.unload());
    // Der warm gehaltene Recognizer hielt sonst nach jedem Plugin-Neuladen einen
    // Worker samt WASM am Leben (Code-Audit M-06: Aufräumfunktion ohne Aufrufer).
    this.register(() => this.disposeSharedRecognizer());
    if (this.settings.agentEnabled && !this.settings.agentToken.trim()) { this.settings.agentToken = this.newAgentToken(); await this.persistSettings(); }
    this.agent = new AgentChannel(this);
    this.agent.refresh();
    this.register(() => this.agent?.stop());
  }
  persistSettings(): Promise<void> { return this.saveData(this.settings); }
  /** Letzte Zeigerereignisse für die Stift-Diagnose (Ringpuffer). */
  private penSamples: PenDiagnosticSample[] = [];
  /** Laufendes Anzeige-Intervall der Stift-Diagnose (siehe M-08). */
  private penDiagnosticTimer: number | null = null;

  recordPenSample(event: PointerEvent, classifiedAsPen: boolean, penModeActive: boolean): void {
    // Nur sammeln, solange die Diagnose offen ist: `showPenDiagnostic` leert den Puffer
    // beim Oeffnen ohnehin, vorher erfasste Proben sieht also niemand. Damit kostet das
    // Schreiben mit dem Stift keine Objektzuweisung mehr (Performance-Runde 11.9.2026).
    if (this.penDiagnosticTimer === null) return;
    if (this.penSamples.length >= 400) this.penSamples.shift();
    this.penSamples.push({
      pointerType: event.pointerType,
      pressure: event.pressure,
      tiltX: event.tiltX ?? 0,
      tiltY: event.tiltY ?? 0,
      buttons: event.buttons,
      isPrimary: event.isPrimary,
      classifiedAsPen,
      penModeActive,
      time: event.timeStamp,
      type: event.type
    });
  }

  /**
   * Zeigt, wie das Gerät dem Plugin gemeldet wird. Entscheidet, ob die Stift-Erkennung
   * greift — bei manchen Yoga-Treibern meldet sich der Stift als Maus, dann hilft nur
   * der Fallback-Schalter im Panel.
   */
  showPenDiagnostic(): void {
    // WICHTIG: kein Modal. Ein Obsidian-Modal legt einen Hintergrund über die ganze
    // Fläche und blockiert damit genau die Zeichenfläche, die man beschreiben soll —
    // dann kommen keine Ereignisse an und die Diagnose zeigt fälschlich „nichts".
    // Deshalb ein schwebendes, klick-durchlässiges Panel (Nutzerbefund 11.9.2026).
    this.penSamples = [];
    document.querySelector(".hp-pen-diagnostic")?.remove();
    const panel = document.body.createDiv({ cls: "hp-pen-diagnostic" });
    const kopf = panel.createDiv({ cls: "hp-pen-diag-head" });
    kopf.createSpan({ text: `Stift-Diagnose · ${this.manifest.version}` });
    const zu = kopf.createEl("button", { text: "×", attr: { "aria-label": "Stift-Diagnose schließen", title: "Schließen" } });
    panel.createEl("p", { cls: "hp-pen-diag-hint", text: "Zeichne jetzt mit dem Stift auf die Fläche (zwei Wörter). Die Anzeige läuft mit." });
    const out = panel.createEl("pre", { cls: "hp-pen-diag" });
    const umgebung = panel.createEl("p", { cls: "hp-pen-diag-env" });
    umgebung.setText([
      `Plattform: ${navigator.platform || "?"} · Electron ${(navigator.userAgent.match(/Electron\/([\d.]+)/) ?? [])[1] ?? "?"}`,
      `Wayland-Sitzung: ${/Linux/.test(navigator.platform) ? "ja (Linux)" : "nein"}`,
      "Bekanntes Problem: Obsidian (Electron) liefert unter Wayland oft keine Stift-Ereignisse."
    ].join("\n"));
    const zeichnen = (): void => out.setText(describePenDiagnostic(this.penSamples));
    // Ein erneuter Aufruf entfernt das alte Panel — sein Intervall muss dann mitsterben,
    // sonst liefen mehrere Timer parallel in entferntes DOM (Code-Audit M-08).
    if (this.penDiagnosticTimer !== null) { window.clearInterval(this.penDiagnosticTimer); this.penDiagnosticTimer = null; }
    const timer = window.setInterval(zeichnen, 250);
    this.penDiagnosticTimer = timer;
    zu.onclick = () => { window.clearInterval(timer); if (this.penDiagnosticTimer === timer) this.penDiagnosticTimer = null; panel.remove(); };
    zeichnen();
  }

  assetUrl(name: string): string { return this.app.vault.adapter.getResourcePath(`${this.manifest.dir}/assets/${name}`); }
  createRecognizer(): LocalHandwritingRecognizer { return new LocalHandwritingRecognizer(name => this.assetUrl(name)); }
  private sharedRecognizerInstance?: LocalHandwritingRecognizer;
  /** Warm gehaltener Recognizer für Live-Umwandlung (Modell-Load nur beim ersten Einsatz). */
  sharedRecognizer(): LocalHandwritingRecognizer {
    if (!this.sharedRecognizerInstance) this.sharedRecognizerInstance = new LocalHandwritingRecognizer(name => this.assetUrl(name));
    return this.sharedRecognizerInstance;
  }
  disposeSharedRecognizer(): void { this.sharedRecognizerInstance?.dispose(); this.sharedRecognizerInstance = undefined; }
  /** Die offene Notiz — notfalls die einzige Markdown-Ansicht, auch wenn gerade keine „aktiv" ist. */
  private markdownLeaf(): LeafLike | null {
    const views: LeafLike[] = [];
    const active = (this.app.workspace.activeEditor as unknown as { view?: LeafLike } | null)?.view ?? null;
    this.app.workspace.iterateAllLeaves((leaf) => { views.push(leaf.view as unknown as LeafLike); });
    return pickMarkdownLeaf(views, active);
  }
  /** Zielsuche für die Block-Befehle; stellt eine Notiz in der Leseansicht auf Bearbeiten um. */
  private blockCommandTarget(): Promise<{ editor: Editor } | { error: string }> {
    return editableLeaf(this.markdownLeaf()) as Promise<{ editor: Editor } | { error: string }>;
  }
  private async runBlockCommand(kind: "insert" | "remove"): Promise<void> {
    const target = await this.blockCommandTarget();
    if ("error" in target) { new Notice(target.error); return; }
    if (kind === "insert") await this.insertBlock(target.editor); else await this.removeBlock(target.editor);
  }
  private async insertBlock(editor: Editor): Promise<void> {
    const folder = normalizePath(this.settings.folder.trim() || DEFAULT_SETTINGS.folder); if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-"); const path = normalizePath(`${folder}/Handschrift-${stamp}.handwriting.json`);
    await this.app.vault.create(path, JSON.stringify(createDocument(this.settings.defaultPaper), null, 2));
    this.pendingOpenPath = path;
    editor.replaceSelection(`\n\`\`\`handschrift\n${path}\n\`\`\`\n`);
    new Notice("Smooth-Handwriting-Block wurde eingefügt und öffnet sich im Vollbild.");
  }
  private async renderBlock(path: string, element: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
    const resolved = this.app.metadataCache.getFirstLinkpathDest(path, context.sourcePath); if (!(resolved instanceof TFile)) { element.createDiv({ cls: "hp-error", text: `Handschriftdatei nicht gefunden: ${path}` }); return; }
    try {
      const raw = await this.app.vault.cachedRead(resolved);
      const result = parseNotebook(JSON.parse(raw) as unknown);
      if (!result.ok) {
        const message = result.error.kind === "unsupported-version"
          ? `Neuere Dateiversion (${result.error.version}) – bitte das Plugin aktualisieren. Die Datei wurde nicht verändert.`
          : `Handschrift konnte nicht geladen werden (${result.error.detail}). Die Datei wurde nicht verändert.`;
        element.createDiv({ cls: "hp-error", text: message });
        return;
      }
      if (result.migrated) {
        // Original einmalig vor der automatischen Migration sichern.
        try {
          const backupPath = `${resolved.path}.pre-migration-${Date.now()}.bak`;
          if (!this.app.vault.getAbstractFileByPath(backupPath)) await this.app.vault.create(backupPath, raw);
        } catch (error) { console.error("Smooth Handwriting: Migrationssicherung nicht möglich", error); }
      }
      const editor = new InlineHandwritingEditor(element, this, resolved, result.document, result.migrated);
      context.addChild(editor);
      if (this.pendingOpenPath === resolved.path) {
        this.pendingOpenPath = null;
        window.setTimeout(() => editor.openEditor(), 60);
      }
    }
    catch (error) { element.createDiv({ cls: "hp-error", text: `Handschrift konnte nicht geladen werden: ${String(error)}` }); }
  }
  /**
   * Entfernt einen Handschriftblock vollständig: Blockmarke im Text UND die zugehörige
   * Datei. Die Datei wandert in Obsidians Papierkorb (kein endgültiges Löschen) — nach
   * Rückfrage, weil dabei Seiten verloren gehen können.
   */
  async removeBlock(editor?: Editor): Promise<void> {
    const cursor = editor?.getCursor();
    const text = editor?.getValue() ?? "";
    const bloecke = [...text.matchAll(/```handschrift\s*\n([^\n]*)\n```/g)];
    if (!bloecke.length) { new Notice("In dieser Notiz steht kein Handschriftblock."); return; }
    // Block unter dem Cursor wählen, sonst den einzigen Block.
    let treffer = bloecke[0];
    if (cursor && bloecke.length > 1) {
      const pos = editor!.posToOffset(cursor);
      treffer = bloecke.find(block => pos >= (block.index ?? 0) && pos <= (block.index ?? 0) + block[0].length) ?? bloecke[0];
    }
    const pfad = treffer[1].trim();
    const datei = this.app.vault.getAbstractFileByPath(pfad);
    const bestaetigt = await confirmDialog(`Handschriftblock entfernen?\n\nDie Datei „${pfad}" wird in den Papierkorb gelegt${datei ? "" : " (Datei nicht gefunden)"}.`);
    if (!bestaetigt) return;
    if (editor) {
      const start = treffer.index ?? text.indexOf(treffer[0]);
      editor.replaceRange("", editor.offsetToPos(start), editor.offsetToPos(start + treffer[0].length));
    }
    if (datei instanceof TFile) {
      try { await this.app.fileManager.trashFile(datei); } catch { await this.app.vault.delete(datei); }
    }
    new Notice("Handschriftblock und Datei entfernt (aus dem Papierkorb wiederherstellbar).");
  }

  /** Datei eines Blocks in den Papierkorb legen (wiederverwendbar für beide Wege). */
  async removeBlockFile(file: TFile): Promise<void> {
    try { await this.app.fileManager.trashFile(file); } catch { await this.app.vault.delete(file); }
    new Notice("Handschriftdatei in den Papierkorb gelegt.");
  }

  async saveDocument(file: TFile, document: HandwritingDocumentV3): Promise<void> { await this.app.vault.modify(file, JSON.stringify(document)); }
}

class SmoothHandwritingSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SmoothHandwritingPlugin) { super(app, plugin); }
  display(): void {
    this.containerEl.empty();
    // — Datei & Papier —
new Setting(this.containerEl).setName("Speicherordner").setDesc("Ordner im Vault für Handschrift- und PDF-Seitendateien.").addText((text) => text.setValue(this.plugin.settings.folder).onChange(async (value) => { this.plugin.settings.folder = value; await this.plugin.persistSettings(); }));
    // Durchsuchbarkeit: Begleitdatei mit Klartext (Blocker A2). Ohne Schalter wäre die
    // zusätzliche Datei im Vault nicht abschaltbar.
    new Setting(this.containerEl).setName("Suchbare Textbegleitdatei")
      .setDesc("Legt neben jeder Handschriftnotiz eine .handwriting.txt mit allem Text (Textboxen, Tabellen, erkannte Handschrift) an, damit Obsidians Suche den Heftinhalt findet.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.searchCompanion)
        .onChange(async (value) => { this.plugin.settings.searchCompanion = value; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Standardpapier").addDropdown((dropdown) => dropdown.addOption("grid", "Kariert").addOption("lines", "Liniert").addOption("blank", "Blanko").setValue(this.plugin.settings.defaultPaper).onChange(async (value) => { this.plugin.settings.defaultPaper = value as Paper; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Schrift & Papier").setHeading();
    new Setting(this.containerEl).setName("Wortkorrektur-Pause").setDesc("Wartezeit in Millisekunden, bevor neue Striche einmalig in der Höhe angepasst und beruhigt werden. Position und Abstände bleiben immer erhalten.").addSlider((slider) => slider.setLimits(400, 1500, 50).setDynamicTooltip().setValue(this.plugin.settings.wordDelay).onChange(async (value) => { this.plugin.settings.wordDelay = value; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Schrifthöhe am Papier ausrichten").setDesc("Neue Wörter richten ihre Höhe am Papier aus: kariert = 2 Kästchen, liniert = 1 Zeile. Kein Verschieben, keine Abstandskorrektur.").addToggle(toggle=>toggle.setValue(this.plugin.settings.beautifyPaperSize).onChange(async value=>{this.plugin.settings.beautifyPaperSize=value;await this.plugin.persistSettings();}));
    for(const [key,name,min,max,step] of [["gridWritingHeight","Kariert: Höhe in Kästchen",1,3,.5],["lineWritingHeight","Liniert: Höhe in Zeilen",.5,2,.5],["beautifySize","Manuelle Höhe / Blankopapier (px)",20,64,2]] as const) {
      new Setting(this.containerEl).setName(name).addSlider(slider=>slider.setLimits(min,max,step).setDynamicTooltip().setValue(this.plugin.settings[key]).onChange(async value=>{this.plugin.settings[key]=value;await this.plugin.persistSettings();}));
    }
    for (const [key, name, desc] of [["equalizeLetters", "Buchstaben entzerren", "Ungleiche Buchstabenhöhen innerhalb eines Worts angleichen (max. ±12 %, Wortkante bleibt)."], ["smoothInkLines", "Striche sanft glätten", "Ruhige Linienabschnitte sanft ausgleichen; Ecken und Bögen bleiben erhalten."]] as const) {
      new Setting(this.containerEl).setName(name).setDesc(desc).addToggle((toggle) => toggle.setValue(this.plugin.settings[key]).onChange(async (value) => { this.plugin.settings[key] = value; await this.plugin.persistSettings(); }));
    }
    new Setting(this.containerEl).setName("Formen & Gesten").setHeading();
    new Setting(this.containerEl).setName("Formen verbessern").setDesc("0 = aus. Höhere Werte tolerieren ungenauere Geraden; der Buchstabenschutz im Editor hat Vorrang.").addSlider((slider) => slider.setLimits(0, 1, .05).setDynamicTooltip().setValue(this.plugin.settings.shapeOptimization ? this.plugin.settings.shapeImprovement : 0).onChange(async (value) => { this.plugin.settings.shapeImprovement = value; this.plugin.settings.shapeOptimization = value > 0; await this.plugin.persistSettings(); }));
    for (const [key, name, desc] of [["shapeHoldSnap", "Halten für perfekte Form", "Stift am Ende des Strichs kurz liegen lassen ⇒ Kreis wird rund, Viereck eckig (Draw & Hold wie auf dem iPad)."], ["shapeEndpointSnap", "An Endpunkte einrasten", "Linien-/Pfeilenden rasten an Endpunkte und Mittellinien anderer Striche ein."], ["lineAngleSnap", "Linienwinkel einrasten (15°)", "Geraden und Linien-Züge rasten auf das 15-Grad-Raster ein."], ["circleLasso", "Circle-to-Lasso", "Im Schreibmodus einen großen Kreis um Inhalte ziehen ⇒ Auswahl (wie GoodNotes)."], ["scratchErase", "Scribble-to-Erase", "Zickzack über Striche kritzeln entfernt sie; Text und Bilder bleiben geschützt."]] as const) {
      new Setting(this.containerEl).setName(name).setDesc(desc).addToggle((toggle) => toggle.setValue(this.plugin.settings[key]).onChange(async (value) => { this.plugin.settings[key] = value; await this.plugin.persistSettings(); }));
    }
    new Setting(this.containerEl).setName("Stifte & Farben").setHeading();
    new Setting(this.containerEl).setName("Stiftstärke").addSlider(slider => slider.setLimits(1, 18, .5).setDynamicTooltip().setValue(this.plugin.settings.penSize).onChange(async value => { this.plugin.settings.penSize = value; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Markerfarbe").addColorPicker((picker) => picker.setValue(this.plugin.settings.markerColor).onChange(async (value) => { this.plugin.settings.markerColor = value; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Markerstärke").addSlider((slider) => slider.setLimits(18, 64, 2).setDynamicTooltip().setValue(this.plugin.settings.markerSize).onChange(async (value) => { this.plugin.settings.markerSize = value; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Fülldeckkraft").addSlider(slider => slider.setLimits(0, .8, .05).setDynamicTooltip().setValue(this.plugin.settings.fillOpacity).onChange(async value => { this.plugin.settings.fillOpacity = value; await this.plugin.persistSettings(); }));
    // Die Schwelle war gelesen, aber nirgends einstellbar — wer 85 % zu streng fand,
    // hatte keinen Weg (Code-Audit M-05).
    new Setting(this.containerEl).setName("Live-Umwandlung: Mindestvertrauen")
      .setDesc("Wie sicher die Erkennung sein muss, damit sie den Handschriftzug automatisch in Text umwandelt.")
      .addSlider((slider) => slider.setLimits(0.5, 0.99, 0.01).setDynamicTooltip()
        .setValue(this.plugin.settings.liveConvertMinConfidence)
        .onChange(async (value) => { this.plugin.settings.liveConvertMinConfidence = value; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Stiftdruck verwenden").setDesc("Druck und Neigung des Stifts (Lenovo Yoga, Apple Pencil) bestimmen die Strichbreite.").addToggle((toggle) => toggle.setValue(this.plugin.settings.pressureEnabled).onChange(async (value) => { this.plugin.settings.pressureEnabled = value; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Drucksensitivität").addSlider(slider => slider.setLimits(0, 1, .05).setDynamicTooltip().setValue(this.plugin.settings.pressureSensitivity).onChange(async value => { this.plugin.settings.pressureSensitivity = value; this.plugin.settings.pressureEnabled = value > 0; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Laserpointer").setHeading();
    new Setting(this.containerEl).setName("Laserstärke").addSlider(slider => slider.setLimits(2, 16, 1).setDynamicTooltip().setValue(this.plugin.settings.laserSize).onChange(async value => { this.plugin.settings.laserSize = value; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Externer Agent (MCP)").setHeading();
    new Setting(this.containerEl).setName("Agent-Zugriff aktivieren")
      .setDesc("Zeichnen durch einen externen Agenten (MCP), nur über die Companion-Bridge auf diesem Gerät (127.0.0.1). Der Agent sieht ausschließlich die Seite der offenen Notiz; jede Änderung erscheint als Vorschlag, den du annimmst oder verwirfst. Bridge-Start: npm run mcp:bridge.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.agentEnabled).onChange(async (value) => {
        this.plugin.settings.agentEnabled = value;
        if (value && !this.plugin.settings.agentToken.trim()) this.plugin.settings.agentToken = this.plugin.newAgentToken();
        await this.plugin.persistSettings();
        this.plugin.agent?.refresh();
        this.display();
      }));
    new Setting(this.containerEl).setName("Bridge-Port")
      .setDesc("Port der Companion-Bridge (nur localhost).")
      .addText((text) => text.setValue(String(this.plugin.settings.agentPort)).onChange(async (value) => {
        const port = Number(value);
        if (Number.isFinite(port) && port > 0 && port < 65536) { this.plugin.settings.agentPort = port; await this.plugin.persistSettings(); this.plugin.agent?.refresh(); }
      }));
    new Setting(this.containerEl).setName("Token")
      .setDesc("Muss mit dem Token der Bridge übereinstimmen (die Bridge zeigt es beim Start an).")
      .addText((text) => text.setValue(this.plugin.settings.agentToken).onChange(async (value) => { this.plugin.settings.agentToken = value.trim(); await this.plugin.persistSettings(); this.plugin.agent?.refresh(); }));
    new Setting(this.containerEl).setName("Token neu erzeugen")
      .addButton((button) => button.setButtonText("Neu erzeugen").onClick(async () => { this.plugin.settings.agentToken = this.plugin.newAgentToken(); await this.plugin.persistSettings(); this.display(); }));
    const agentStatus = !this.plugin.settings.agentEnabled ? "Deaktiviert."
      : this.plugin.agent?.state.connected ? `Verbunden (Vault ${this.plugin.agentVaultId()}).`
      : this.plugin.agent?.state.lastError ? `Nicht verbunden – ${this.plugin.agent.state.lastError}.`
      : "Nicht verbunden – läuft die Bridge? (npm run mcp:bridge)";
    new Setting(this.containerEl).setName("Status").setDesc(agentStatus);
  }
}

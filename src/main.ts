import { App, Editor, MarkdownPostProcessorContext, MarkdownRenderChild, Notice, Plugin, PluginSettingTab, Setting, TFile, loadPdfJs, normalizePath } from "obsidian";
import { HandwritingDocumentV3, HandwritingPage, HighlightElement, ImageElement, Paper, ShapeElement, ShapeKind, StrokeElement, alignPageBaselines, cloneDocument, createDocument, createPage, elementBounds, mergeClosedLineShapes, parseDocument } from "./document";
import { normalizeHandwritingWord } from "./handwriting-normalizer";
import { ShapeDragTool, draggedShapePoints, optimizeShape, shapeContainsPoint } from "./shapes";
import { InkPoint, InkStroke, cleanCapturedStroke, pressureWidth, strokeTouches, visibleInkColor } from "./strokes";
import { snapHighlightToWords } from "./smart-highlight";
import { PdfAnnotationManager } from "./pdf-annotation";
import { buildImagePdf, buildMultiPageImagePdf, dataUrlBytes } from "./export";
import { LocalHandwritingRecognizer } from "./htr-client";
import { reviewHandwriting } from "./handwriting-review";
import { applyReconstructions, restoreReconstructions } from "./htr-core";
import { constructionDialog } from "./construction-dialog";
import { drawText } from "./rendering";
import { drawLiveInk } from "./live-ink";
import { textDialog } from "./text-dialog";
import { abortable } from "./abortable";
import { applyDockIcons, rangeControl, rgbPicker } from "./editor-controls";
import { EditorSnapshots } from "./editor-history";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Tool = "pen" | "highlight" | "eraser" | "laser" | "fill" | ShapeDragTool;

export interface SmoothHandwritingSettings {
  settingsVersion: number;
  folder: string;
  defaultPaper: Paper;
  shapeOptimization: boolean;
  shapeImprovement: number;
  laserSize: number;
  wordDelay: number;
  markerColor: string;
  markerSize: number;
  penColor: string;
  penSize: number;
  fillColor: string;
  fillOpacity: number;
  pressureEnabled: boolean;
  pressureSensitivity: number;
}

const DEFAULT_SETTINGS: SmoothHandwritingSettings = {
  settingsVersion: 3, folder: "Handwriting", defaultPaper: "grid", shapeOptimization: true, shapeImprovement: 0.7, laserSize: 6, wordDelay: 800,
  markerColor: "#ffd84d", markerSize: 34, penColor: "#202124", penSize: 4,
  fillColor: "#7c5cff", fillOpacity: 0.24, pressureEnabled: true, pressureSensitivity: 0.72
};

function isShapeTool(tool: Tool): tool is ShapeDragTool {
  return ["line", "arrow", "ellipse", "circle", "rectangle", "triangle", "diamond"].includes(tool);
}

function prepareCanvas(canvas: HTMLCanvasElement, page: HandwritingPage): CanvasRenderingContext2D | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
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
  if (laser) { context.globalAlpha = 0.92; context.shadowColor = "#ff1744"; context.shadowBlur = 18; }
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
    context.moveTo(start.x, start.y);
    context.quadraticCurveTo(before.x, before.y, end.x, end.y);
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
  context.beginPath();
  const first = shape.points[0];
  if (shape.kind === "ellipse") {
    const box = shape.points.reduce((result, point) => ({ minX: Math.min(result.minX, point.x), minY: Math.min(result.minY, point.y), maxX: Math.max(result.maxX, point.x), maxY: Math.max(result.maxY, point.y) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    context.ellipse((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.maxX - box.minX) / 2, (box.maxY - box.minY) / 2, 0, 0, Math.PI * 2);
  } else if (shape.kind === "rectangle" && shape.points.length === 2) {
    const end = shape.points[1];
    context.rect(Math.min(first.x, end.x), Math.min(first.y, end.y), Math.abs(end.x - first.x), Math.abs(end.y - first.y));
  } else {
    context.moveTo(first.x, first.y);
    for (const point of shape.points.slice(1)) context.lineTo(point.x, point.y);
    if (shape.closed) context.closePath();
    if (shape.kind === "arrow" && shape.points.length >= 2) drawArrowHead(context, first, shape.points[shape.points.length - 1], shape.size);
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
    context.save(); context.globalAlpha = highlight.opacity; context.strokeStyle = highlight.color; context.lineWidth = highlight.size; context.lineCap = "round";
    context.beginPath(); context.moveTo(highlight.x1, highlight.y); context.lineTo(highlight.x2, highlight.y); context.stroke(); context.restore();
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

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  private deleteButton!: HTMLButtonElement;
  private toggleButton!: HTMLButtonElement;
  private toolbar!: HTMLDivElement;
  private optionsPanel!: HTMLDivElement;
  private paperSelect!: HTMLSelectElement;
  private reticle!: HTMLDivElement;
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
  private transientLaser: InkStroke | null = null;
  private saveTimer: number | null = null;
  private wordTimers = new Map<string, number>();
  private dirty = false;
  private importing = false;
  private importAbort: AbortController | null = null;
  private editing = false;
  private expanded = false;
  private pendingStrokes = new Map<string, Set<string>>();
  private normalizationQueue: Promise<void> = Promise.resolve();
  private normalizationEpoch = 0;
  private changeRevision = 0;
  private toolButtons = new Map<Tool, HTMLButtonElement>();
  private portalAnchor: Comment | null = null;
  private touchScroll = new Map<number, number>();
  private shapeDragStart: InkPoint | null = null;

  constructor(container: HTMLElement, private readonly plugin: SmoothHandwritingPlugin, private readonly file: TFile, document: HandwritingDocumentV3, migrated: boolean) {
    super(container);
    this.document = document;
    this.activePageId = document.pages[0].id;
    this.dirty = migrated;
  }

  onload(): void {
    this.mount();
    if (this.dirty) this.scheduleSave();
    const keyHandler = (event: KeyboardEvent): void => {
      if (document.querySelector("dialog[open]") || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "Escape" && this.editing) this.setEditing(false);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && this.editing) { event.preventDefault(); if (event.shiftKey) this.redo(); else this.undo(); }
    };
    document.addEventListener("keydown", keyHandler);
    this.register(() => document.removeEventListener("keydown", keyHandler));
  }

  openEditor(): void {
    if (!this.editing) this.setEditing(true);
  }

  onunload(): void {
    if (this.laserFrame !== null) cancelAnimationFrame(this.laserFrame);
    this.importAbort?.abort();
    this.recognizer?.dispose();
    if (this.pointerPageId) { this.dirty = true; this.pointerPageId = null; }
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
    header.createSpan({ cls: "hp-inline-title", text: "Smooth Handwriting" });
    this.pageCountEl = header.createSpan("hp-page-count");
    this.statusEl = header.createSpan("hp-status");
    const toolsToggle = header.createEl("button", { cls: "hp-tools-toggle", text: "Werkzeuge", attr: { "aria-expanded": "true" } });
    toolsToggle.onclick = () => { const hidden = this.wrapper.classList.toggle("is-tools-hidden"); toolsToggle.setAttribute("aria-expanded", String(!hidden)); requestAnimationFrame(() => this.redrawAll()); };
    this.deleteButton = header.createEl("button", { cls: "hp-delete-button", text: "Alles löschen", attr: { "aria-label": "Gesamte Handschriftnotiz leeren", title: "Alle Seiten leeren (mit Rückgängig wiederherstellbar)" } });
    this.deleteButton.addEventListener("click", () => this.clearAll());
    this.editButton = header.createEl("button", { cls: "mod-cta", text: "Bearbeiten" });
    this.editButton.addEventListener("click", () => this.setEditing(!this.editing));
    this.buildToolbar();
    this.pagesEl = this.wrapper.createDiv("hp-pages");
    this.toggleButton = this.wrapper.createEl("button", { cls: "hp-expand-button", text: "⌄", attr: { "aria-label": "Handschriftvorschau aufklappen", title: "Block vergrößern" } });
    this.toggleButton.addEventListener("click", () => this.setExpanded(!this.expanded));
    this.reticle = this.wrapper.createDiv("hp-pen-reticle");
    this.rebuildPages();
    this.updateHeader();
  }

  private labeledControl(label: string): HTMLDivElement {
    const section = (label === "Werkzeug" ? this.toolbar : this.optionsPanel).createEl("details", { cls: "hp-tool-section" });
    section.open = ["Werkzeug", "Handschrift", "Konstruieren"].includes(label);
    section.createEl("summary", { text: label });
    const group = section.createDiv("hp-tool-group");
    return group;
  }

  private buildToolbar(): void {
    this.toolbar = this.wrapper.createDiv("hp-toolbar");
    this.optionsPanel = this.toolbar.createDiv("hp-options-panel"); this.optionsPanel.hidden = true;
    const toolGroup = this.labeledControl("Werkzeug");
    const tools: Array<[Tool, string, string]> = [["pen", "✎", "Stift"], ["highlight", "▰", "Intelligenter Markierer"], ["eraser", "⌫", "Radierer"], ["fill", "▣", "Geschlossene Form mit Stifttipp füllen"], ["laser", "●", "Präsentationsstift (nur beim Halten)"]];
    for (const [tool, icon, label] of tools) {
      const button = toolGroup.createEl("button", { text: icon, attr: { "aria-label": label, title: label } });
      button.addEventListener("click", () => this.activateTool(tool));
      this.toolButtons.set(tool, button);
    }
    toolGroup.createEl("button", { text: "T", attr: { "aria-label": "Text einfügen", title: "Text einfügen" } }).onclick = () => void this.insertText();
    toolGroup.createEl("button", { text: "↶", attr: { "aria-label": "Rückgängig", title: "Rückgängig" } }).onclick = () => this.undo();
    toolGroup.createEl("button", { text: "↷", attr: { "aria-label": "Wiederholen", title: "Strg/⌘ + Umschalt + Z" } }).onclick = () => this.redo();
    const pdfInput = toolGroup.createEl("input", { type: "file", cls: "hp-file-input", attr: { accept: "application/pdf", "aria-label": "PDF hochladen" } });
    toolGroup.createEl("button", { text: "⇧", attr: { "aria-label": "PDF hochladen", title: "PDF hochladen" } }).onclick = () => pdfInput.click();
    pdfInput.onchange = () => { const files = Array.from(pdfInput.files ?? []); pdfInput.value = ""; if (files.length) void this.importFiles(files); };
    const more = toolGroup.createEl("button", { text: "•••", attr: { "aria-label": "Weitere Werkzeuge", "aria-expanded": "false" } });
    const colorButton = toolGroup.createEl("button", { cls: "hp-rgb-toggle", attr: { "aria-label": "RGB-Farbe auswählen", title: "RGB-Farbe auswählen", "aria-expanded": "false" } });
    toolGroup.insertBefore(colorButton, more);
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
    more.onclick = () => { this.optionsPanel.hidden = !this.optionsPanel.hidden; more.setAttribute("aria-expanded", String(!this.optionsPanel.hidden)); colorPanel.hidden = true; colorButton.setAttribute("aria-expanded", "false"); };
    const writing = this.labeledControl("Handschrift");
    writing.addClass("hp-text-controls");
    rangeControl(writing, "Buchstaben schützen", 1, 0, 1, 1, value => { this.handwritingMode = value === 1; this.clearPendingNormalization(); }, value => value ? "An" : "Aus");
    rangeControl(writing, "Improve shapes", this.plugin.settings.shapeOptimization ? this.plugin.settings.shapeImprovement : 0, 0, 1, .05, value => { this.plugin.settings.shapeImprovement = value; this.plugin.settings.shapeOptimization = value > 0; }, value => value ? `${Math.round(value * 100)} %` : "Aus");
    writing.createEl("small", { text: "Formkorrektur im Zeichenmodus: Buchstaben schützen ausschalten. Höhere Werte erkennen großzügiger." });
    rangeControl(writing, "Korrekturpause", this.plugin.settings.wordDelay, 400, 1500, 50, value => { this.plugin.settings.wordDelay = value; }, value => `${value} ms`);
    this.optionsPanel.addEventListener("change", () => void this.plugin.persistSettings());
    writing.createEl("button", { text: "Lesbar machen" }).onclick = () => void this.recognizeHandwriting();
    writing.createEl("button", { text: "Original wiederherstellen" }).onclick = () => {
      const page = this.activePage(); if (!page) return; this.remember();
      const count = restoreReconstructions(page); this.markChanged(); this.redrawPage(page.id); this.setStatus(`${count} Originalstriche wiederhergestellt`);
    };
    const geometry = this.labeledControl("Konstruieren");
    geometry.addClass("hp-text-controls");
    geometry.createEl("button", { text: "Geodreieck" }).onclick = () => void this.openConstruction("set-square");
    geometry.createEl("button", { text: "Zirkel" }).onclick = () => void this.openConstruction("compass");
    const shapeGroup = this.labeledControl("Form ziehen");
    const shapeTools: Array<[ShapeDragTool, string, string]> = [
      ["line", "╱", "Gerade"], ["arrow", "➜", "Pfeil"], ["rectangle", "▭", "Rechteck"],
      ["ellipse", "⬭", "Oval"], ["circle", "○", "Kreis"], ["triangle", "△", "Dreieck"], ["diamond", "◇", "Raute"]
    ];
    for (const [tool, icon, label] of shapeTools) {
      const button = shapeGroup.createEl("button", { text: `${icon} ${label}`, attr: { "aria-label": label, title: `${label} ziehen` } });
      button.addEventListener("click", () => this.activateTool(tool));
      this.toolButtons.set(tool, button);
    }
    const colorGroup = this.labeledControl("Stiftfarbe");
    for (const color of ["#202124", "#2457e6", "#d93025", "#16833b", "#7c3aed"]) {
      const swatch = colorGroup.createEl("button", { cls: "hp-color-swatch", attr: { "aria-label": color, title: color } });
      swatch.style.setProperty("--hp-swatch", color);
      swatch.addEventListener("click", () => { colorTarget.value = "penColor"; rgb.setColor(color); void this.plugin.persistSettings(); });
    }
    colorGroup.createEl("button", { text: "RGB mischen", attr: { "aria-label": "Eigene Stiftfarbe" } }).onclick = () => { colorTarget.value = "penColor"; rgb.setColor(this.plugin.settings.penColor); colorButton.click(); };
    const sizeGroup = this.labeledControl("Stärke");
    rangeControl(sizeGroup, "Stiftstärke", this.plugin.settings.penSize, 1, 18, .5, value => { this.plugin.settings.penSize = value; this.updateReticleStyle(); }, value => `${value} px`);
    rangeControl(sizeGroup, "Markerstärke", this.plugin.settings.markerSize, 18, 64, 2, value => { this.plugin.settings.markerSize = value; this.updateReticleStyle(); }, value => `${value} px`);
    rangeControl(sizeGroup, "Laserstärke", this.plugin.settings.laserSize, 2, 16, 1, value => { this.plugin.settings.laserSize = value; }, value => `${value} px`);
    const fillGroup = this.labeledControl("Formfüllung");
    const fill = fillGroup.createEl("input", { type: "color", value: this.plugin.settings.fillColor, attr: { "aria-label": "Füllfarbe" } });
    fill.addEventListener("input", () => { this.plugin.settings.fillColor = fill.value; void this.plugin.persistSettings(); });
    rangeControl(fillGroup, "Deckkraft der Füllung", this.plugin.settings.fillOpacity, 0, .8, .05, value => { this.plugin.settings.fillOpacity = value; }, value => value ? `${Math.round(value * 100)} %` : "Aus");
    const pressureGroup = this.labeledControl("Druck");
    rangeControl(pressureGroup, "Drucksensitivität", this.plugin.settings.pressureEnabled ? this.plugin.settings.pressureSensitivity : 0, 0, 1, .05, value => { this.plugin.settings.pressureSensitivity = value; this.plugin.settings.pressureEnabled = value > 0; }, value => value ? `${Math.round(value * 100)} %` : "Aus");
    const pageGroup = this.labeledControl("Seite");
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
      this.remember(); page.width = width; page.height = height; page.format = format.value as HandwritingPage["format"]; alignPageBaselines(page); this.rebuildPages(); this.markChanged(); format.value = "";
    };
    pageGroup.createEl("button", { text: "+", attr: { "aria-label": "Seite hinzufügen", title: "Seite hinzufügen" } }).addEventListener("click", () => this.addPage());
    const fileGroup = this.labeledControl("Datei");
    fileGroup.createEl("button", { text: "Notiz leeren", attr: { "aria-label": "Notiz leeren" } }).onclick = () => this.clearAll();
    for (const [format, label] of [["png", "PNG"], ["jpeg", "JPG"], ["pdf", "PDF"]] as const) {
      fileGroup.createEl("button", { text: label, attr: { "aria-label": `Aktive Seite als ${label} speichern`, title: `Aktive Seite als ${label} herunterladen` } })
        .addEventListener("click", () => void this.exportActivePage(format));
    }
    fileGroup.createEl("button", { text: "PDF alle", attr: { "aria-label": "Alle Seiten als mehrseitige PDF speichern", title: "Gesamte Handschriftnotiz als mehrseitige PDF herunterladen" } })
      .addEventListener("click", () => void this.exportAllPagesPdf());
    const importInput = fileGroup.createEl("input", { type: "file", attr: { accept: "image/png,image/jpeg,application/pdf", multiple: "", "aria-label": "PNG, JPEG oder PDF importieren" } });
    importInput.addClass("hp-file-input");
    fileGroup.createEl("button", { text: "↧", attr: { "aria-label": "PNG, JPEG oder PDF importieren", title: "Datei als beschreibbaren Hintergrund importieren" } })
      .addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", () => { const files = Array.from(importInput.files ?? []); importInput.value = ""; if (files.length > 0) void this.importFiles(files); });
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
    this.tool = tool;
    if (tool !== "laser") this.reticle?.removeClass("is-visible");
    this.wrapper.dataset.tool = tool;
    for (const [candidate, button] of this.toolButtons) { button.toggleClass("is-active", candidate === tool); button.setAttribute("aria-pressed", String(candidate === tool)); }
    this.updateReticleStyle();
  }

  private updateReticleStyle(): void {
    if (!this.reticle) return;
    const color = this.tool === "laser" ? "#ff1744" : this.tool === "highlight" ? this.plugin.settings.markerColor : this.tool === "fill" ? this.plugin.settings.fillColor : this.plugin.settings.penColor;
    const size = this.tool === "eraser" ? 22 : this.tool === "highlight" ? Math.min(24, this.plugin.settings.markerSize / 2) : Math.max(7, this.plugin.settings.penSize + 4);
    this.reticle.style.setProperty("--hp-reticle-color", color);
    this.reticle.style.setProperty("--hp-reticle-size", `${size}px`);
    this.reticle.toggleClass("is-laser", this.tool === "laser");
  }

  private updateReticle(event: PointerEvent): void {
    // Normal tools use the browser cursor, which does not wait for JS/painting.
    if (!this.editing || event.pointerType === "touch" || this.tool !== "laser") { this.reticle.removeClass("is-visible"); return; }
    this.reticle.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
    this.reticle.addClass("is-visible");
  }

  private rebuildPages(): void {
    this.disconnectObservers();
    this.canvases.clear();
    this.overlays.clear();
    this.pagesEl.empty();
    for (const [index, page] of this.document.pages.entries()) {
      const frame = this.pagesEl.createDiv("hp-page");
      frame.dataset.pageId = page.id;
      frame.toggleClass("is-active", page.id === this.activePageId);
      setPaperClass(frame, page.paper);
      frame.createDiv({ cls: "hp-page-label", text: `Seite ${index + 1}` });
      const surface = frame.createDiv("hp-canvas-stack");
      const canvas = surface.createEl("canvas", { attr: { "aria-label": `Handschrift Seite ${index + 1}` } });
      const overlay = surface.createEl("canvas", { cls: "hp-live-overlay", attr: { "aria-hidden": "true" } });
      this.overlays.set(page.id, overlay);
      canvas.style.aspectRatio = `${page.width} / ${page.height}`;
      canvas.addEventListener("pointerenter", (event) => this.updateReticle(event));
      canvas.addEventListener("pointerleave", () => this.reticle.removeClass("is-visible"));
      canvas.addEventListener("pointerdown", (event) => this.pointerDown(event, page.id));
      canvas.addEventListener("pointermove", (event) => this.pointerMove(event, page.id));
      canvas.addEventListener("pointerup", (event) => this.pointerUp(event, page.id));
      canvas.addEventListener("pointercancel", (event) => this.pointerUp(event, page.id));
      frame.addEventListener("click", () => this.setActivePage(page.id));
      const observer = new ResizeObserver(() => { this.updatePaperScale(frame, canvas, page); this.redrawPage(page.id); });
      observer.observe(canvas);
      this.observers.push(observer);
      this.canvases.set(page.id, canvas);
    }
    this.updateHeader();
    requestAnimationFrame(() => this.redrawAll());
  }

  private updatePaperScale(frame: HTMLElement, canvas: HTMLCanvasElement, page: HandwritingPage): void {
    const scaleX = canvas.clientWidth / page.width;
    const scaleY = canvas.clientHeight / page.height;
    frame.style.setProperty("--hp-grid-x", `${24 * scaleX}px`);
    frame.style.setProperty("--hp-grid-y", `${24 * scaleY}px`);
    frame.style.setProperty("--hp-line-y", `${32 * scaleY}px`);
  }

  private disconnectObservers(): void { for (const observer of this.observers) observer.disconnect(); this.observers = []; }
  private updateHeader(): void { this.pageCountEl?.setText(`${this.document.pages.length} ${this.document.pages.length === 1 ? "Seite" : "Seiten"}`); }
  private setActivePage(pageId: string): void {
    this.activePageId = pageId;
    const active = this.activePage();
    if (active && this.paperSelect) this.paperSelect.value = active.paper;
    this.pagesEl.querySelectorAll<HTMLElement>(".hp-page").forEach((frame) => frame.toggleClass("is-active", frame.dataset.pageId === pageId));
  }
  private activePage(): HandwritingPage | undefined { return this.document.pages.find((page) => page.id === this.activePageId); }
  private page(pageId: string): HandwritingPage | undefined { return this.document.pages.find((page) => page.id === pageId); }

  private toPoint(event: PointerEvent, page: HandwritingPage, canvas: HTMLCanvasElement): InkPoint {
    const rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(page.width, (event.clientX - rect.left) * page.width / rect.width)), y: Math.max(0, Math.min(page.height, (event.clientY - rect.top) * page.height / rect.height)), pressure: event.pressure > 0 ? event.pressure : 0.5, time: event.timeStamp };
  }

  private pointerDown(event: PointerEvent, pageId: string): void {
    this.updateReticle(event);
    if (!this.editing) return;
    const page = this.page(pageId); const canvas = this.canvases.get(pageId);
    if (!page || !canvas) return;
    if (event.pointerType === "touch") {
      if (this.pointerPageId === null) { this.touchScroll.set(event.pointerId, event.clientY); canvas.setPointerCapture(event.pointerId); }
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault(); this.setActivePage(pageId); canvas.setPointerCapture(event.pointerId); this.pointerPageId = pageId;
    const point = this.toPoint(event, page, canvas);
    if (this.tool === "laser") {
      this.transientLaser = { id: "laser", color: "#ff1744", size: this.plugin.settings.laserSize, pressureSensitivity: 0, points: [point] };
      this.drawLaser(pageId); return;
    }
    this.remember(this.tool === "pen" && this.handwritingMode);
    if (this.tool === "eraser") { this.eraseAt(page, point); return; }
    if (this.tool === "fill") {
      const target = [...page.elements].reverse().find((element): element is ShapeElement => element.type === "shape" && shapeContainsPoint(element, point));
      if (target) {
        target.fillColor = this.plugin.settings.fillColor;
        target.fillOpacity = Math.max(0.24, this.plugin.settings.fillOpacity);
        this.markChanged(); this.redrawPage(pageId);
      } else this.history.pop();
      canvas.releasePointerCapture(event.pointerId); this.pointerPageId = null; return;
    }
    if (this.tool === "highlight") {
      const element: HighlightElement = { type: "highlight", id: crypto.randomUUID(), x1: point.x, x2: point.x, y: point.y, size: this.plugin.settings.markerSize, color: this.plugin.settings.markerColor, opacity: 0.28 };
      page.elements.push(element); this.currentElementId = element.id; this.currentRawPoints = [point];
    } else if (isShapeTool(this.tool)) {
      const kind: ShapeKind = this.tool === "circle" ? "ellipse" : this.tool === "triangle" || this.tool === "diamond" ? "polygon" : this.tool;
      const element: ShapeElement = { type: "shape", id: crypto.randomUUID(), kind, points: draggedShapePoints(this.tool, point, point), color: this.plugin.settings.penColor, size: this.plugin.settings.penSize, closed: this.tool !== "line" && this.tool !== "arrow", fillColor: this.plugin.settings.fillColor, fillOpacity: this.tool === "line" || this.tool === "arrow" ? 0 : this.plugin.settings.fillOpacity };
      page.elements.push(element); this.currentElementId = element.id; this.shapeDragStart = point;
    } else {
      const element: StrokeElement = { type: "stroke", id: crypto.randomUUID(), color: this.plugin.settings.penColor, size: this.plugin.settings.penSize, pressureSensitivity: this.plugin.settings.pressureEnabled ? this.plugin.settings.pressureSensitivity : 0, points: [point] };
      page.elements.push(element); this.currentElementId = element.id; this.currentRawPoints = [point];
    }
    if (this.tool === "pen") {
      const overlay = this.overlays.get(pageId);
      if (overlay) { const context = prepareCanvas(overlay, page); if (context) drawInkStroke(context, page.elements[page.elements.length - 1] as StrokeElement); }
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
    if (!page || !canvas || !canvas.hasPointerCapture(event.pointerId)) return;
    event.preventDefault(); const coalesced = event.getCoalescedEvents?.(); const events = coalesced?.length ? coalesced : [event];
    if (this.tool === "laser" && this.transientLaser) {
      for (const sample of events) this.transientLaser.points.push(this.toPoint(sample, page, canvas));
      // A bounded tail and a separate layer keep cost independent of notebook size.
      this.transientLaser.points = this.transientLaser.points.slice(-96);
      if (this.laserFrame === null) this.laserFrame = requestAnimationFrame(() => { this.laserFrame = null; this.drawLaser(pageId); });
      return;
    }
    if (this.tool === "eraser") { for (const sample of events) this.eraseAt(page, this.toPoint(sample, page, canvas)); return; }
    const last = page.elements[page.elements.length - 1];
    const element = last?.id === this.currentElementId ? last : page.elements.find((candidate) => candidate.id === this.currentElementId);
    if (!element) return;
    if (element.type === "highlight") {
      for (const sample of events) this.currentRawPoints.push(this.toPoint(sample, page, canvas));
      element.x2 = this.currentRawPoints[this.currentRawPoints.length - 1].x;
      const ys = this.currentRawPoints.map((point) => point.y).sort((left, right) => left - right);
      element.y = ys[Math.floor(ys.length / 2)];
    }
    else if (element.type === "stroke") {
      // Keep the pen-down path entirely incremental. Re-running the model over
      // the full stroke on every pointer event caused the Lenovo pen lag.
      const firstNewPoint = this.currentRawPoints.length;
      for (const sample of events) this.currentRawPoints.push(this.toPoint(sample, page, canvas));
      element.points = this.currentRawPoints;
      const context = this.overlays.get(pageId)?.getContext("2d");
      if (context) drawLiveInk(context, element, firstNewPoint);
      return;
    }
    else if (element.type === "shape" && isShapeTool(this.tool) && this.shapeDragStart) element.points = draggedShapePoints(this.tool, this.shapeDragStart, this.toPoint(events[events.length - 1], page, canvas));
    this.redrawPage(pageId);
  }

  private pointerUp(event: PointerEvent, pageId: string): void {
    const page = this.page(pageId); const canvas = this.canvases.get(pageId);
    if (!page || !canvas) return;
    if (this.touchScroll.has(event.pointerId)) {
      this.touchScroll.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (!canvas.hasPointerCapture(event.pointerId)) return;
    if (event.type !== "pointercancel") this.pointerMove(event, pageId);
    event.preventDefault(); canvas.releasePointerCapture(event.pointerId);
    if (this.tool === "laser") { this.transientLaser = null; this.pointerPageId = null; if (this.laserFrame !== null) cancelAnimationFrame(this.laserFrame); this.laserFrame = null; this.drawLaser(pageId); return; }
    const element = page.elements.find((candidate) => candidate.id === this.currentElementId);
    if (element?.type === "stroke") { element.rawPoints = structuredClone(this.currentRawPoints); element.points = cleanCapturedStroke(this.currentRawPoints, true); if (!this.handwritingMode && !this.convertAutomaticShape(page, element)) this.queueWordStroke(pageId, element.id); }
    else if (element?.type === "highlight") {
      const snapped = snapHighlightToWords(page, element, this.currentRawPoints);
      if (snapped) Object.assign(element, snapped);
      else page.elements = page.elements.filter((candidate) => candidate.id !== element.id);
    }
    else if (element?.type === "shape") {
      const box = elementBounds(element);
      if (Math.max(box.maxX - box.minX, box.maxY - box.minY) < 8) page.elements = page.elements.filter((candidate) => candidate.id !== element.id);
    }
    const appendStroke = element?.type === "stroke" && page.elements[page.elements.length - 1] === element;
    this.currentElementId = null; this.currentRawPoints = []; this.shapeDragStart = null; this.pointerPageId = null; this.markChanged();
    const overlay = this.overlays.get(pageId); if (overlay) prepareCanvas(overlay, page);
    if (appendStroke) { const context = canvas.getContext("2d"); if (context) drawInkStroke(context, element); }
    else this.redrawPage(pageId);
  }

  private convertAutomaticShape(page: HandwritingPage, stroke: StrokeElement): boolean {
    if (!this.plugin.settings.shapeOptimization) return false;
    const optimized = optimizeShape(stroke, this.plugin.settings.shapeImprovement);
    if (!optimized.kind) return false;
    const index = page.elements.findIndex((element) => element.id === stroke.id);
    if (index < 0) return false;
    const kind: ShapeKind = optimized.kind;
    page.elements[index] = { type: "shape", id: stroke.id, kind, points: optimized.stroke.points, color: stroke.color, size: stroke.size, closed: kind !== "line" && kind !== "arrow", fillColor: this.plugin.settings.fillColor, fillOpacity: kind === "line" || kind === "arrow" ? 0 : this.plugin.settings.fillOpacity };
    if (kind === "line") mergeClosedLineShapes(page, this.plugin.settings.fillColor, this.plugin.settings.fillOpacity);
    this.setStatus(`Form erkannt: ${kind === "ellipse" ? "Ellipse" : kind === "rectangle" ? "Rechteck" : kind === "polygon" ? "Vieleck" : "Gerade"}`);
    window.setTimeout(() => this.setStatus(""), 1400); return true;
  }

  private eraseAt(page: HandwritingPage, point: InkPoint): void {
    const before = page.elements.length;
    page.elements = page.elements.filter((element) => {
      if (element.type === "stroke") return !strokeTouches(element, point, 18);
      if (element.type === "image") return true;
      const box = elementBounds(element);
      return point.x < box.minX - 18 || point.x > box.maxX + 18 || point.y < box.minY - 18 || point.y > box.maxY + 18;
    });
    if (page.elements.length !== before) { this.markChanged(); this.redrawPage(page.id); }
  }

  private queueWordStroke(pageId: string, strokeId: string): void {
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
    if (this.pointerPageId) { for (const id of ids) this.queueWordStroke(pageId, id); return; }
    const original = ids.map((id) => page.elements.find((element): element is StrokeElement => element.id === id && element.type === "stroke")).filter((stroke): stroke is StrokeElement => Boolean(stroke));
    if (original.length === 0) return;
    const signature = JSON.stringify(original); this.setStatus("Richte Handschrift aus …");
    const result = normalizeHandwritingWord(original, this.document.profile, page.paper, page.baselines ?? []);
    const current = ids.map((id) => page.elements.find((element): element is StrokeElement => element.id === id && element.type === "stroke")).filter((stroke): stroke is StrokeElement => Boolean(stroke));
    if (epoch !== this.normalizationEpoch || JSON.stringify(current) !== signature) { this.setStatus("Neuere Eingabe behalten"); return; }
    if (result.changed) {
      this.remember(); this.document.profile = result.profile; const replacements = new Map(result.strokes.map((stroke) => [stroke.id, stroke]));
      page.elements = page.elements.map((element) => replacements.get(element.id) ?? element);
      this.registerBaseline(page, result.baseline);
      this.markChanged(); this.redrawPage(pageId); this.setStatus("Persönliche Schrift ausgerichtet");
    } else { this.document.profile = result.profile; this.registerBaseline(page, result.baseline); this.markChanged(); this.setStatus(""); }
    window.setTimeout(() => this.setStatus(""), 1600);
  }

  private setStatus(text: string): void { this.statusEl.setText(text); }
  private clearPendingNormalization(): void {
    this.normalizationEpoch++;
    for (const timer of this.wordTimers.values()) window.clearTimeout(timer);
    this.wordTimers.clear(); this.pendingStrokes.clear();
  }
  private async recognizeHandwriting(): Promise<void> {
    const page = this.activePage(); if (!page) return;
    this.clearPendingNormalization(); const revision = this.changeRevision;
    this.recognizer = this.plugin.createRecognizer();
    try {
      const result = await reviewHandwriting(page, this.recognizer);
      if (!result) return;
      if (revision !== this.changeRevision || this.page(page.id) !== page) throw new Error("Die Seite wurde geändert. Bitte Vorschau neu öffnen.");
      this.remember(); applyReconstructions(page, result); this.markChanged(); this.redrawPage(page.id); this.setStatus(`${result.length} geprüfte Zeilen rekonstruiert – Original gespeichert`);
    } catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
    finally { this.recognizer.dispose(); this.recognizer = undefined; }
  }
  private async openConstruction(kind: "set-square" | "compass"): Promise<void> {
    const page = this.activePage(); if (!page) return;
    const shape = await constructionDialog(page, kind, this.canvases.get(page.id), this.plugin.settings.penColor, this.plugin.settings.penSize);
    if (shape && this.page(page.id) === page) { this.remember(); page.elements.push(shape); this.markChanged(); this.redrawPage(page.id); }
  }
  private async insertText(): Promise<void> {
    const page = this.activePage(); if (!page) return;
    const text = await textDialog(page, this.plugin.settings.penColor);
    if (text && this.page(page.id) === page) { this.remember(); page.elements.push(text); this.markChanged(); this.redrawPage(page.id); }
  }
  private registerBaseline(page: HandwritingPage, baseline: number): void {
    if (!Number.isFinite(baseline) || baseline <= 0 || baseline >= page.height) return;
    const baselines = page.baselines ?? [];
    if (!baselines.some((candidate) => Math.abs(candidate - baseline) < 12)) baselines.push(baseline);
    page.baselines = baselines.sort((left, right) => left - right);
  }
  private changePaper(paper: Paper): void {
    const page = this.activePage(); if (!page) return; this.remember(); page.paper = paper; alignPageBaselines(page);
    const frame = this.pagesEl.querySelector<HTMLElement>(`[data-page-id="${page.id}"]`); if (frame) setPaperClass(frame, paper); this.markChanged();
  }
  private addPage(): void {
    this.remember(); const page = createPage(this.activePage()?.paper ?? this.plugin.settings.defaultPaper); this.document.pages.push(page); this.activePageId = page.id; this.rebuildPages(); this.markChanged();
    requestAnimationFrame(() => this.pagesEl.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }
  private async renderExportCanvas(page: HandwritingPage): Promise<HTMLCanvasElement> {
    const images = page.elements.filter((element): element is ImageElement => element.type === "image");
    await Promise.all(images.map(async (element) => {
      const image = cachedImage(element);
      if (!image.complete || image.naturalWidth === 0) await new Promise<void>((resolve, reject) => { image.addEventListener("load", () => resolve(), { once: true }); image.addEventListener("error", () => reject(new Error("Importbild konnte nicht exportiert werden")), { once: true }); });
    }));
    const canvas = document.createElement("canvas"); canvas.width = page.width; canvas.height = page.height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas nicht verfügbar");
    drawPaper(context, page); drawPageElements(context, page); return canvas;
  }
  private async exportActivePage(format: "png" | "jpeg" | "pdf"): Promise<void> {
    const page = this.activePage(); if (!page) return;
    try {
      this.setStatus(`Exportiere ${format.toUpperCase()} …`);
      const canvas = await this.renderExportCanvas(page);
      const pageNumber = this.document.pages.findIndex((candidate) => candidate.id === page.id) + 1;
      const basename = `Smooth-Handwriting-Seite-${pageNumber}`;
      if (format === "pdf") {
        const jpegUrl = canvas.toDataURL("image/jpeg", 0.94);
        const pdf = buildImagePdf(dataUrlBytes(jpegUrl), canvas.width, canvas.height);
        downloadBlob(new Blob([pdf as BlobPart], { type: "application/pdf" }), `${basename}.pdf`);
      } else {
        const mime = format === "png" ? "image/png" : "image/jpeg";
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Export fehlgeschlagen")), mime, 0.94));
        downloadBlob(blob, `${basename}.${format === "png" ? "png" : "jpg"}`);
      }
      this.setStatus(`${format.toUpperCase()} heruntergeladen`); window.setTimeout(() => this.setStatus(""), 1600);
    } catch (error) { new Notice(`Export fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`); this.setStatus(""); }
  }
  private async exportAllPagesPdf(): Promise<void> {
    try {
      this.setStatus("Exportiere mehrseitige PDF …");
      const pages = [];
      for (const page of this.document.pages) {
        const canvas = await this.renderExportCanvas(page);
        pages.push({ jpeg: dataUrlBytes(canvas.toDataURL("image/jpeg", 0.94)), pixelWidth: canvas.width, pixelHeight: canvas.height });
      }
      const pdf = buildMultiPageImagePdf(pages);
      downloadBlob(new Blob([pdf as BlobPart], { type: "application/pdf" }), "Smooth-Handwriting-Gesamtnotiz.pdf");
      this.setStatus(`${pages.length} Seiten als PDF heruntergeladen`);
      window.setTimeout(() => this.setStatus(""), 1800);
    } catch (error) { new Notice(`PDF-Export fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`); this.setStatus(""); }
  }
  private placeImage(page: HandwritingPage, dataUrl: string, mimeType: "image/png" | "image/jpeg", sourceName: string, sourceWidth: number, sourceHeight: number): void {
    const scale = Math.min(page.width / sourceWidth, page.height / sourceHeight);
    const width = sourceWidth * scale; const height = sourceHeight * scale;
    const element: ImageElement = { type: "image", id: crypto.randomUUID(), x: (page.width - width) / 2, y: (page.height - height) / 2, width, height, dataUrl, mimeType, sourceName };
    page.elements.unshift(element);
  }
  private async importFiles(files: File[]): Promise<void> {
    if (this.importing) return;
    if (files.some(file => file.size > 20 * 1024 * 1024)) { new Notice("Bitte Dateien bis 20 MB verwenden."); return; }
    const busy = document.createElement("dialog"); busy.className = "hp-review";
    const progress = document.createElement("p"); progress.textContent = "Dokument wird lokal vorbereitet …"; progress.setAttribute("role", "status");
    const cancelImport = document.createElement("button"); cancelImport.textContent = "Import abbrechen";
    const controller = new AbortController(); this.importAbort = controller;
    const deadline = window.setTimeout(() => controller.abort(), 120000);
    cancelImport.onclick = () => controller.abort();
    busy.append(progress, cancelImport); busy.setAttribute("aria-label", "PDF-Import");
    busy.oncancel = event => { event.preventDefault(); controller.abort(); }; document.body.append(busy); busy.showModal();
    this.importing = true;
    const emptyStartPage = this.document.pages.length === 1 && this.document.pages[0].elements.length === 0 && files.every(file => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) ? this.document.pages[0].id : null;
    this.remember(); let imageTargetUsed = false; let importedPages = 0;
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
            this.placeImage(page, canvas.toDataURL("image/jpeg", 0.92), "image/jpeg", `${file.name} – Seite ${number}`, canvas.width, canvas.height);
            this.document.pages.push(page); this.activePageId = page.id; importedPages += 1;
          }
          } finally { void loadingTask.destroy().catch(() => {}); }
        } else if (file.type === "image/png" || file.type === "image/jpeg" || /\.(png|jpe?g)$/i.test(file.name)) {
          const dataUrl = await abortable(readDataUrl(file), controller.signal); const image = await abortable(loadHtmlImage(dataUrl), controller.signal);
          const useCurrentPage = !imageTargetUsed && importedPages === 0;
          const page = useCurrentPage ? this.activePage() ?? createPage("blank") : createPage("blank");
          if (!this.document.pages.includes(page)) this.document.pages.push(page);
          if (!useCurrentPage) this.activePageId = page.id;
          this.placeImage(page, dataUrl, file.type === "image/png" ? "image/png" : "image/jpeg", file.name, image.naturalWidth, image.naturalHeight);
          imageTargetUsed = true; importedPages += 1;
        } else throw new Error(`Nicht unterstütztes Format: ${file.name}`);
      }
      if (emptyStartPage && importedPages > 0) this.document.pages = this.document.pages.filter(page => page.id !== emptyStartPage);
      this.rebuildPages(); this.markChanged(); this.setStatus(`${importedPages} Seite${importedPages === 1 ? "" : "n"} importiert`);
      requestAnimationFrame(() => this.pagesEl.querySelector(`[data-page-id="${this.activePageId}"]`)?.scrollIntoView({ block: "start" }));
      window.setTimeout(() => this.setStatus(""), 1800);
    } catch (error) {
      const previous = this.history.pop(); if (previous) this.document = previous;
      this.activePageId = this.document.pages[0].id; this.rebuildPages();
      new Notice(`Import fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`); this.setStatus("");
    } finally { window.clearTimeout(deadline); this.importAbort = null; this.importing = false; busy.close(); busy.remove(); if (this.dirty) this.scheduleSave(); }
  }
  private clearAll(): void {
    if (!window.confirm("Wirklich alle Seiten dieser Handschriftnotiz leeren? Rückgängig stellt sie wieder her.")) return;
    const paper = this.activePage()?.paper ?? this.plugin.settings.defaultPaper;
    this.remember();
    const page = createPage(paper);
    this.document = { version: 3, pages: [page], profile: { targetHeight: 52, samples: 0, averageSlope: 0 } };
    this.activePageId = page.id;
    this.pendingStrokes.clear();
    for (const timer of this.wordTimers.values()) window.clearTimeout(timer);
    this.wordTimers.clear(); this.normalizationEpoch += 1;
    this.rebuildPages(); this.markChanged(); this.setStatus("Notiz geleert – Rückgängig ist möglich");
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
    this.pendingStrokes.clear(); for (const timer of this.wordTimers.values()) window.clearTimeout(timer); this.wordTimers.clear(); this.normalizationEpoch += 1; this.rebuildPages(); this.markChanged();
  }
  private redo(): void {
    if (this.pointerPageId) return;
    const next = this.future.pop(); if (!next) return;
    this.history.push(cloneDocument(this.document)); this.document = cloneDocument(next); this.snapshots.invalidate();
    this.clearPendingNormalization();
    if (!this.page(this.activePageId)) this.activePageId = this.document.pages[0].id;
    this.rebuildPages(); this.markChanged();
  }
  private markChanged(): void { this.dirty = true; this.changeRevision += 1; this.scheduleSave(); }
  private scheduleSave(): void { if (this.saveTimer !== null) window.clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => { this.saveTimer = null; void this.saveNow(); }, 500); }
  private async saveNow(): Promise<void> {
    if (this.pointerPageId || this.importing) { this.scheduleSave(); return; }
    if (!this.dirty) return; const revision = this.changeRevision;
    try { await this.plugin.saveDocument(this.file, this.document); if (revision === this.changeRevision) this.dirty = false; }
    catch (error) { new Notice(`Smooth Handwriting konnte nicht speichern: ${error instanceof Error ? error.message : String(error)}`); }
  }
  private drawLaser(pageId: string): void {
    const page = this.page(pageId), overlay = this.overlays.get(pageId);
    if (!page || !overlay) return;
    const context = prepareCanvas(overlay, page);
    if (context && this.transientLaser) drawInkStroke(context, this.transientLaser, true);
  }
  private redrawPage(pageId: string): void {
    const page = this.page(pageId), canvas = this.canvases.get(pageId);
    if (!page || !canvas) return;
    const active = this.pointerPageId === pageId && this.tool === "pen" ? page.elements.find(e => e.id === this.currentElementId && e.type === "stroke") as StrokeElement | undefined : undefined;
    drawPage(canvas, active ? { ...page, elements: page.elements.filter(e => e !== active) } : page);
    const overlay = this.overlays.get(pageId);
    if (overlay) { const context = prepareCanvas(overlay, page); if (context && active) drawInkStroke(context, active); }
  }
  private redrawAll(): void { for (const page of this.document.pages) this.redrawPage(page.id); }
}

export default class SmoothHandwritingPlugin extends Plugin {
  settings: SmoothHandwritingSettings = DEFAULT_SETTINGS;
  private pdfManager!: PdfAnnotationManager;
  private pendingOpenPath: string | null = null;
  async onload(): Promise<void> {
    const face = new FontFace("Teacher Caveat", `url("${this.assetUrl("caveat-latin.woff2")}")`);
    const fontSet = document.fonts as FontFaceSet & Set<FontFace>;
    try { fontSet.add(await face.load()); this.register(() => { fontSet.delete(face); }); }
    catch { new Notice("Handschrift-Font fehlt. Bitte das vollständige Plugin-ZIP installieren."); }
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
    this.addCommand({ id: "insert-handwriting-block", name: "Karierten Handschriftblock einfügen", editorCallback: async (editor: Editor) => this.insertBlock(editor) });
    this.registerMarkdownCodeBlockProcessor("handschrift", async (source, element, context) => this.renderBlock(source.trim(), element, context));
    this.pdfManager = new PdfAnnotationManager(this.app, () => this.settings, () => this.persistSettings()); this.pdfManager.onload(); this.register(() => this.pdfManager.unload());
  }
  persistSettings(): Promise<void> { return this.saveData(this.settings); }
  assetUrl(name: string): string { return this.app.vault.adapter.getResourcePath(`${this.manifest.dir}/assets/${name}`); }
  createRecognizer(): LocalHandwritingRecognizer { return new LocalHandwritingRecognizer(name => this.assetUrl(name)); }
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
      const result = parseDocument(JSON.parse(await this.app.vault.cachedRead(resolved)) as unknown);
      if (!result) throw new Error("Ungültiges Dateiformat");
      const editor = new InlineHandwritingEditor(element, this, resolved, result.document, result.migrated);
      context.addChild(editor);
      if (this.pendingOpenPath === resolved.path) {
        this.pendingOpenPath = null;
        window.setTimeout(() => editor.openEditor(), 60);
      }
    }
    catch (error) { element.createDiv({ cls: "hp-error", text: `Handschrift konnte nicht geladen werden: ${String(error)}` }); }
  }
  async saveDocument(file: TFile, document: HandwritingDocumentV3): Promise<void> { await this.app.vault.modify(file, JSON.stringify(document)); }
}

class SmoothHandwritingSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SmoothHandwritingPlugin) { super(app, plugin); }
  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl).setName("Speicherordner").setDesc("Ordner im Vault für Handschrift und PDF-Seitendateien.").addText((text) => text.setValue(this.plugin.settings.folder).onChange(async (value) => { this.plugin.settings.folder = value; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Persönliche Wortkorrektur").setDesc("Pause, bevor Originalzüge an Baseline und persönliche Schrifthöhe angepasst werden.").addSlider((slider) => slider.setLimits(400, 1500, 50).setDynamicTooltip().setValue(this.plugin.settings.wordDelay).onChange(async (value) => { this.plugin.settings.wordDelay = value; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Improve shapes").setDesc("0 = aus. Höhere Werte tolerieren ungenauere Geraden; Buchstabenschutz im Editor hat Vorrang.").addSlider((slider) => slider.setLimits(0, 1, .05).setDynamicTooltip().setValue(this.plugin.settings.shapeOptimization ? this.plugin.settings.shapeImprovement : 0).onChange(async (value) => { this.plugin.settings.shapeImprovement = value; this.plugin.settings.shapeOptimization = value > 0; await this.plugin.persistSettings(); }));
    for (const [name, key, min, max, step] of [["Stiftstärke", "penSize", 1, 18, .5], ["Laserstärke", "laserSize", 2, 16, 1], ["Fülldeckkraft", "fillOpacity", 0, .8, .05], ["Drucksensitivität", "pressureSensitivity", 0, 1, .05]] as const) {
      new Setting(this.containerEl).setName(name).addSlider(slider => slider.setLimits(min, max, step).setDynamicTooltip().setValue(this.plugin.settings[key]).onChange(async value => { this.plugin.settings[key] = value; if (key === "pressureSensitivity") this.plugin.settings.pressureEnabled = value > 0; await this.plugin.persistSettings(); }));
    }
    new Setting(this.containerEl).setName("Standardpapier").addDropdown((dropdown) => dropdown.addOption("grid", "Kariert").addOption("lines", "Liniert").addOption("blank", "Blanko").setValue(this.plugin.settings.defaultPaper).onChange(async (value) => { this.plugin.settings.defaultPaper = value as Paper; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Markerfarbe").addColorPicker((picker) => picker.setValue(this.plugin.settings.markerColor).onChange(async (value) => { this.plugin.settings.markerColor = value; await this.plugin.persistSettings(); }));
    new Setting(this.containerEl).setName("Markerstärke").addSlider((slider) => slider.setLimits(18, 64, 2).setDynamicTooltip().setValue(this.plugin.settings.markerSize).onChange(async (value) => { this.plugin.settings.markerSize = value; await this.plugin.persistSettings(); }));
  }
}

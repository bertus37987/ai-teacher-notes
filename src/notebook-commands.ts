/*
 * NotebookCommandService (M2) — transport-unabhängige, validierte
 * Befehls-Schicht für UI und MCP.
 *
 * Vertrag:
 *  - Batch: requestId (Idempotenz) + pageId + baseRevision + Operations-Liste
 *    + optionale touch-Scope-Liste für vorhandene Elemente.
 *  - Alles-oder-nichts: jede Operation wird gegen eine Arbeitskopie geprüft;
 *    ein einziger Fehler ⇒ nichts wird angewendet (Klarer Fehler-Index).
 *  - stage() validiert und erzeugt den Endzustand ohne Mutation — die Naht
 *    für menschlich geprüfte Proposals; execute() wendet über den Host an.
 *  - Agent-Geometrie trägt origin-Metadaten und betritt das Dokument nie über
 *    die Pointer-Queue ⇒ keine Handschrift-Normalisierung, keine
 *    normalizedWordIds auf Agent-Objekten.
 *  - Kein freies JS, keine Shell, keine Netzwerk-/Vault-Zugriffe: nur
 *    typisierte Operationen mit endlichen Koordinaten, Längen- und
 *    Mengen-Grenzen.
 */

import { HandwritingPage, HighlightElement, PageElement, ShapeElement, ShapeKind, StrokeElement, TextElement } from "./document";
import { InkPoint } from "./strokes";

export interface AgentOrigin {
  requestId: string;
  at: number;
  label?: string;
}

export interface CommandPoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface CommandStyle {
  color?: string;
  size?: number;
  fillColor?: string;
  fillOpacity?: number;
  closed?: boolean;
  dashed?: boolean;
}

export type ElementPatch = {
  text?: string;
  x?: number;
  baseline?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  points?: CommandPoint[];
  dx?: number;
  dy?: number;
  color?: string;
  size?: number;
  fillColor?: string;
  fillOpacity?: number;
  closed?: boolean;
};

export type NotebookCommand =
  | { op: "create_path"; id: string; points: CommandPoint[]; style?: CommandStyle }
  | { op: "create_shape"; id: string; kind: ShapeKind; points: CommandPoint[]; style?: CommandStyle }
  | { op: "create_text"; id: string; x: number; baseline: number; fontSize: number; text: string; width?: number; style?: CommandStyle }
  | { op: "create_highlight"; id: string; points: CommandPoint[]; style?: CommandStyle }
  | { op: "update_element"; id: string; patch: ElementPatch }
  | { op: "delete_element"; id: string };

export interface NotebookWriteBatch {
  readonly requestId: string;
  readonly pageId: string;
  readonly baseRevision: number;
  readonly operations: NotebookCommand[];
  /** Explizite Scope-Liste: exakt die Ids aller update/delete-Operationen. */
  readonly touch?: string[];
  readonly origin?: { label?: string };
}

export interface AppliedNotebookBatch {
  readonly requestId: string;
  readonly pageId: string;
  /** Endzustand der Elementliste (Kopien; Originalobjekte bleiben unberührt). */
  readonly elements: PageElement[];
  readonly addedIds: string[];
  readonly updatedIds: string[];
  readonly removedIds: string[];
  readonly origin?: { label?: string };
}

export interface NotebookCommandHost {
  getRevision(): number;
  getPage(pageId: string): HandwritingPage | null;
  isWritingLocked(): boolean;
  hasApplied(requestId: string): boolean;
  /** Atomarer Undo-Schritt: Originalzustand sichern, Elementliste ersetzen, Revision erhöhen. */
  applyApplied(batch: AppliedNotebookBatch): void;
}

export interface CommandErrorEntry {
  index: number;
  code: string;
  detail: string;
}

export type CommandFailure = { ok: false; errors: CommandErrorEntry[] };
export type CommandSuccess = { ok: true; duplicate?: boolean; addedIds: string[]; updatedIds: string[]; removedIds: string[] };
export type CommandResult = CommandSuccess | CommandFailure;

export type StagedResult =
  | { ok: true; applied: AppliedNotebookBatch }
  | CommandFailure;

const LIMITS = {
  batch: 200,
  points: 5_000,
  text: 20_000,
  id: 100,
  color: 64,
  fontSize: 200,
} as const;

const ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
const DEFAULTS = { penColor: "#202124", penSize: 4, markerColor: "#ffd84d", markerSize: 34, markerOpacity: 0.45, fillColor: "#7c5cff", fillOpacity: 0.24 } as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function invalid(index: number, code: string, detail: string): CommandFailure {
  return { ok: false, errors: [{ index, code, detail }] };
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= LIMITS.id && ID_PATTERN.test(value);
}

function validateStyle(style: CommandStyle | undefined, index: number): string | null {
  if (!style) return null;
  if (style.color !== undefined && (typeof style.color !== "string" || style.color.length === 0 || style.color.length > LIMITS.color)) return "Farbe ungültig";
  if (style.size !== undefined && (!isFiniteNumber(style.size) || style.size <= 0 || style.size > 500)) return "Stärke ungültig";
  if (style.fillColor !== undefined && (typeof style.fillColor !== "string" || style.fillColor.length > LIMITS.color)) return "Füllfarbe ungültig";
  if (style.fillOpacity !== undefined && (!isFiniteNumber(style.fillOpacity) || style.fillOpacity < 0 || style.fillOpacity > 1)) return "Fülldeckkraft ungültig";
  if (style.closed !== undefined && typeof style.closed !== "boolean") return "geschlossen-Flag ungültig";
  if (style.dashed !== undefined && typeof style.dashed !== "boolean") return "Strichelmuster ungültig";
  return null;
}

function validatePoints(points: unknown, index: number, max = LIMITS.points): string | null {
  if (!Array.isArray(points) || points.length < 1) return "Punkte fehlen";
  if (points.length > max) return `Zu viele Punkte (${points.length}, Maximum ${max})`;
  for (const point of points) {
    if (!point || typeof point !== "object") return "Punkt ist kein Objekt";
    const candidate = point as { x?: unknown; y?: unknown };
    if (!isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.y)) return "Punktkoordinaten nicht endlich";
  }
  return null;
}

function withinPage(points: CommandPoint[], page: HandwritingPage): boolean {
  return points.every((point) => point.x >= 0 && point.y >= 0 && point.x <= page.width && point.y <= page.height);
}

function toInk(points: CommandPoint[]): InkPoint[] {
  return points.map((point) => ({ x: point.x, y: point.y, pressure: isFiniteNumber(point.pressure) ? point.pressure as number : 0.5 }));
}

function originFor(batch: NotebookWriteBatch): PageElement["origin"] | undefined {
  return { agent: { requestId: batch.requestId, at: Date.now(), label: batch.origin?.label } };
}

export class NotebookCommandService {
  constructor(private readonly host: NotebookCommandHost) {}

  /** Validieren + Endzustand erzeugen, ohne anzuwenden (Proposal-Naht). */
  stage(batch: NotebookWriteBatch): StagedResult {
    const failure = this.validateEnvelope(batch);
    if (failure) return failure;
    const page = this.host.getPage(batch.pageId);
    if (!page) return invalid(-1, "page-not-found", "Seite nicht gefunden");

    const working = page.elements.map((element) => structuredClone(element));
    const addedIds: string[] = [];
    const updatedIds: string[] = [];
    const removedIds: string[] = [];
    const seenIds = new Set(working.map((element) => element.id));

    // Scope: exakt die adressierten vorhandenen Ids müssen gelistet sein.
    const addressed = batch.operations
      .map((operation, index) => (operation.op === "update_element" || operation.op === "delete_element" ? { id: operation.id, index } : null))
      .filter((entry): entry is { id: string; index: number } => entry !== null);
    const touchSet = new Set(batch.touch ?? []);
    for (const entry of addressed) if (!touchSet.has(entry.id)) return invalid(entry.index, "not-scoped", `Element ${entry.id} fehlt in der Scope-Liste`);
    for (const touchId of touchSet) if (!addressed.some((entry) => entry.id === touchId)) return invalid(-1, "scope-mismatch", `Scope enthält ungenutzte Id ${touchId}`);

    for (let index = 0; index < batch.operations.length; index += 1) {
      const operation = batch.operations[index];
      if (typeof operation.op !== "string") return invalid(index, "invalid-operation", "Operation ungültig");

      switch (operation.op) {
        case "create_path": {
          if (!validId(operation.id)) return invalid(index, "invalid-id", `Id ungültig (${String(operation.id)})`);
          if (seenIds.has(operation.id)) return invalid(index, "duplicate-id", `Id ${operation.id} existiert bereits`);
          const styleError = validateStyle(operation.style, index); if (styleError) return invalid(index, "invalid-style", styleError);
          const pointsError = validatePoints(operation.points, index); if (pointsError) return invalid(index, "invalid-points", pointsError);
          if (!withinPage(operation.points, page)) return invalid(index, "out-of-page", "Punkte liegen außerhalb der Seite");
          const element: StrokeElement = {
            type: "stroke", id: operation.id,
            color: operation.style?.color ?? DEFAULTS.penColor,
            size: operation.style?.size ?? DEFAULTS.penSize,
            points: toInk(operation.points),
            origin: originFor(batch),
          };
          working.push(element); seenIds.add(operation.id); addedIds.push(operation.id);
          break;
        }
        case "create_shape": {
          if (!validId(operation.id)) return invalid(index, "invalid-id", `Id ungültig (${String(operation.id)})`);
          if (seenIds.has(operation.id)) return invalid(index, "duplicate-id", `Id ${operation.id} existiert bereits`);
          const styleError = validateStyle(operation.style, index); if (styleError) return invalid(index, "invalid-style", styleError);
          const pointsError = validatePoints(operation.points, index); if (pointsError) return invalid(index, "invalid-points", pointsError);
          if (!withinPage(operation.points, page)) return invalid(index, "out-of-page", "Punkte liegen außerhalb der Seite");
          const style = operation.style ?? {};
          const element: ShapeElement = {
            type: "shape", id: operation.id, kind: operation.kind,
            color: style.color ?? DEFAULTS.penColor,
            size: style.size ?? DEFAULTS.penSize,
            points: toInk(operation.points),
            closed: style.closed ?? (operation.kind !== "line" && operation.kind !== "arrow"),
            ...(style.fillColor !== undefined ? { fillColor: style.fillColor, fillOpacity: style.fillOpacity ?? DEFAULTS.fillOpacity } : {}),
            ...(style.dashed ? { lineStyle: "dashed" as const } : {}),
            origin: originFor(batch),
          };
          working.push(element); seenIds.add(operation.id); addedIds.push(operation.id);
          break;
        }
        case "create_text": {
          if (!validId(operation.id)) return invalid(index, "invalid-id", `Id ungültig (${String(operation.id)})`);
          if (seenIds.has(operation.id)) return invalid(index, "duplicate-id", `Id ${operation.id} existiert bereits`);
          const styleError = validateStyle(operation.style, index); if (styleError) return invalid(index, "invalid-style", styleError);
          if (typeof operation.text !== "string" || operation.text.length === 0 || operation.text.length > LIMITS.text) return invalid(index, "invalid-text", "Text fehlt oder ist unplausibel groß");
          if (!isFiniteNumber(operation.x) || !isFiniteNumber(operation.baseline)) return invalid(index, "invalid-position", "Position nicht endlich");
          if (!isFiniteNumber(operation.fontSize) || operation.fontSize < 6 || operation.fontSize > LIMITS.fontSize) return invalid(index, "invalid-font", "Schriftgröße unplausibel");
          if (operation.width !== undefined && (!isFiniteNumber(operation.width) || operation.width < 0)) return invalid(index, "invalid-width", "Breite ungültig");
          if (operation.x < 0 || operation.baseline < 0 || operation.x > page.width || operation.baseline > page.height) return invalid(index, "out-of-page", "Beschriftung liegt außerhalb der Seite");
          const element: TextElement = {
            type: "text", id: operation.id,
            x: operation.x, baseline: operation.baseline,
            width: operation.width ?? Math.max(24, operation.text.length * operation.fontSize * 0.6),
            fontSize: operation.fontSize,
            color: operation.style?.color ?? DEFAULTS.penColor,
            text: operation.text,
            origin: originFor(batch),
          };
          working.push(element); seenIds.add(operation.id); addedIds.push(operation.id);
          break;
        }
        case "create_highlight": {
          if (!validId(operation.id)) return invalid(index, "invalid-id", `Id ungültig (${String(operation.id)})`);
          if (seenIds.has(operation.id)) return invalid(index, "duplicate-id", `Id ${operation.id} existiert bereits`);
          const styleError = validateStyle(operation.style, index); if (styleError) return invalid(index, "invalid-style", styleError);
          const pointsError = validatePoints(operation.points, index); if (pointsError) return invalid(index, "invalid-points", pointsError);
          if (!withinPage(operation.points, page)) return invalid(index, "out-of-page", "Punkte liegen außerhalb der Seite");
          const element: HighlightElement = {
            type: "highlight", id: operation.id,
            x1: operation.points[0].x, x2: operation.points[operation.points.length - 1].x, y: operation.points[0].y,
            size: operation.style?.size ?? DEFAULTS.markerSize,
            color: operation.style?.color ?? DEFAULTS.markerColor,
            opacity: DEFAULTS.markerOpacity,
            points: toInk(operation.points),
            origin: originFor(batch),
          };
          working.push(element); seenIds.add(operation.id); addedIds.push(operation.id);
          break;
        }
        case "update_element": {
          const targetIndex = working.findIndex((element) => element.id === operation.id);
          if (targetIndex < 0) return invalid(index, "not-found", `Element ${operation.id} existiert nicht`);
          const target = working[targetIndex];
          const patchError = this.applyPatch(target, operation.patch, page);
          if (patchError) return invalid(index, patchError.code, patchError.detail);
          if (target.type === "text" || target.type === "image") {
            const bounds = this.textOrImageInPage(target, page);
            if (bounds) return invalid(index, "out-of-page", bounds);
          }
          if (!updatedIds.includes(operation.id)) updatedIds.push(operation.id);
          break;
        }
        case "delete_element": {
          const targetIndex = working.findIndex((element) => element.id === operation.id);
          if (targetIndex < 0) return invalid(index, "not-found", `Element ${operation.id} existiert nicht`);
          working.splice(targetIndex, 1);
          removedIds.push(operation.id);
          break;
        }
        default:
          return invalid(index, "unknown-operation", `Unbekannte Operation ${String((operation as unknown as { op?: unknown }).op)}`);
      }
    }

    return {
      ok: true,
      applied: {
        requestId: batch.requestId,
        pageId: batch.pageId,
        elements: working,
        addedIds,
        updatedIds,
        removedIds,
        origin: batch.origin,
      },
    };
  }

  /** Validieren, stagen und atomar über den Host anwenden. */
  execute(batch: NotebookWriteBatch): CommandResult {
    if (this.host.hasApplied(batch.requestId)) return { ok: true, duplicate: true, addedIds: [], updatedIds: [], removedIds: [] };
    const staged = this.stage(batch);
    if (!staged.ok) return staged;
    this.host.applyApplied(staged.applied);
    return { ok: true, addedIds: staged.applied.addedIds, updatedIds: staged.applied.updatedIds, removedIds: staged.applied.removedIds };
  }

  private validateEnvelope(batch: NotebookWriteBatch): CommandFailure | null {
    if (!batch || typeof batch !== "object") return { ok: false, errors: [{ index: -1, code: "invalid-batch", detail: "Batch fehlt" }] };
    if (!validId(batch.requestId)) return invalid(-1, "invalid-request", "requestId ungültig");
    if (this.host.hasApplied(batch.requestId)) return { ok: false, errors: [{ index: -1, code: "already-applied", detail: "requestId wurde bereits angewendet" }] };
    if (this.host.isWritingLocked()) return invalid(-1, "editor-busy", "Editor arbeitet gerade – bitte später erneut versuchen");
    if (!isFiniteNumber(batch.baseRevision) || batch.baseRevision !== this.host.getRevision()) {
      return invalid(-1, "stale-revision", `Revision veraltet (Basis ${String(batch.baseRevision)}, aktuell ${this.host.getRevision()})`);
    }
    if (!Array.isArray(batch.operations) || batch.operations.length === 0) return invalid(-1, "empty-batch", "Keine Operationen");
    if (batch.operations.length > LIMITS.batch) return invalid(-1, "batch-too-large", `Mehr als ${LIMITS.batch} Operationen`);
    if (batch.touch !== undefined && (!Array.isArray(batch.touch) || !batch.touch.every((id) => typeof id === "string"))) return invalid(-1, "invalid-scope", "Scope-Liste ungültig");
    return null;
  }

  private textOrImageInPage(element: PageElement, page: HandwritingPage): string | null {
    if (element.type === "image") return null; // Bild-Updates sind im MVP nicht unterstützt
    if (element.type !== "text") return null;
    if (element.x < 0 || element.x > page.width || element.baseline < 0 || element.baseline > page.height) return "Beschriftung liegt außerhalb der Seite";
    return null;
  }

  private applyPatch(element: PageElement, patch: ElementPatch, page: HandwritingPage): { code: string; detail: string } | null {
    if (!patch || typeof patch !== "object") return { code: "invalid-patch", detail: "Patch fehlt" };
    const translate = (): { code: string; detail: string } | null => {
      if (patch.dx !== undefined && !isFiniteNumber(patch.dx)) return { code: "invalid-dx", detail: "dx ungültig" };
      if (patch.dy !== undefined && !isFiniteNumber(patch.dy)) return { code: "invalid-dy", detail: "dy ungültig" };
      if (patch.dx !== undefined || patch.dy !== undefined) {
        const shiftX = patch.dx ?? 0;
        const shiftY = patch.dy ?? 0;
        if (element.type === "text") {
          element.x += shiftX; element.baseline += shiftY;
        } else if (element.type === "image") {
          element.x += shiftX; element.y += shiftY;
        } else if (Array.isArray(element.points)) {
          for (const point of element.points) { point.x += shiftX; point.y += shiftY; }
          if (!element.points.every((point) => point.x >= 0 && point.y >= 0 && point.x <= page.width && point.y <= page.height)) return { code: "out-of-page", detail: "Verschobene Punkte liegen außerhalb der Seite" };
        }
      }
      return null;
    };

    switch (element.type) {
      case "text": {
        const allowed = ["text", "x", "baseline", "width", "height", "fontSize", "color", "dx", "dy"];
        for (const key of Object.keys(patch)) if (!allowed.includes(key)) return { code: "patch-invalid", detail: `Patch-Schlüssel ${key} für Textelement unzulässig` };
        if (patch.text !== undefined && (typeof patch.text !== "string" || patch.text.length > LIMITS.text)) return { code: "invalid-text", detail: "Text unplausibel" };
        if (patch.x !== undefined && !isFiniteNumber(patch.x)) return { code: "invalid-position", detail: "x ungültig" };
        if (patch.baseline !== undefined && !isFiniteNumber(patch.baseline)) return { code: "invalid-position", detail: "baseline ungültig" };
        if (patch.width !== undefined && (!isFiniteNumber(patch.width) || patch.width < 0)) return { code: "invalid-width", detail: "Breite ungültig" };
        if (patch.height !== undefined && !isFiniteNumber(patch.height)) return { code: "invalid-height", detail: "Höhe ungültig" };
        if (patch.fontSize !== undefined && (!isFiniteNumber(patch.fontSize) || patch.fontSize < 6 || patch.fontSize > LIMITS.fontSize)) return { code: "invalid-font", detail: "Schriftgröße unplausibel" };
        if (patch.color !== undefined && (typeof patch.color !== "string" || patch.color.length === 0 || patch.color.length > LIMITS.color)) return { code: "invalid-color", detail: "Farbe ungültig" };
        if (patch.text !== undefined) element.text = patch.text;
        if (patch.x !== undefined) element.x = patch.x;
        if (patch.baseline !== undefined) element.baseline = patch.baseline;
        if (patch.width !== undefined) element.width = patch.width;
        if (patch.height !== undefined) element.height = patch.height;
        if (patch.fontSize !== undefined) element.fontSize = patch.fontSize;
        if (patch.color !== undefined) element.color = patch.color;
        return translate();
      }
      case "stroke":
      case "highlight":
      case "shape": {
        const allowed = element.type === "shape"
          ? ["points", "color", "size", "fillColor", "fillOpacity", "closed", "dx", "dy"]
          : ["points", "color", "size", "dx", "dy"];
        for (const key of Object.keys(patch)) if (!allowed.includes(key)) return { code: "patch-invalid", detail: `Patch-Schlüssel ${key} für dieses Element unzulässig` };
        if (patch.points !== undefined) {
          const pointsError = validatePoints(patch.points, -1); if (pointsError) return { code: "invalid-points", detail: pointsError };
          if (!withinPage(patch.points as CommandPoint[], page)) return { code: "out-of-page", detail: "Punkte liegen außerhalb der Seite" };
        }
        if (patch.color !== undefined && (typeof patch.color !== "string" || patch.color.length === 0 || patch.color.length > LIMITS.color)) return { code: "invalid-color", detail: "Farbe ungültig" };
        if (patch.size !== undefined && (!isFiniteNumber(patch.size) || patch.size <= 0 || patch.size > 500)) return { code: "invalid-size", detail: "Stärke ungültig" };
        if (patch.fillOpacity !== undefined && (!isFiniteNumber(patch.fillOpacity) || patch.fillOpacity < 0 || patch.fillOpacity > 1)) return { code: "invalid-fill", detail: "Fülldeckkraft ungültig" };
        if (patch.closed !== undefined && typeof patch.closed !== "boolean") return { code: "invalid-closed", detail: "geschlossen-Flag ungültig" };
        if (patch.points !== undefined) element.points = toInk(patch.points as CommandPoint[]);
        if (patch.color !== undefined) element.color = patch.color;
        if (patch.size !== undefined) element.size = patch.size;
        if (element.type === "shape") {
          if (patch.fillColor !== undefined) { element.fillColor = patch.fillColor; if (element.fillOpacity === undefined) element.fillOpacity = DEFAULTS.fillOpacity; }
          if (patch.fillOpacity !== undefined) element.fillOpacity = patch.fillOpacity;
          if (patch.closed !== undefined) element.closed = patch.closed;
        }
        return translate();
      }
      case "image":
        return { code: "not-supported", detail: "Bild-Bearbeitung über Befehle ist im MVP nicht unterstützt" };
    }
  }
}
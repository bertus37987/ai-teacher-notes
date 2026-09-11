import { HandwritingDocumentV3, HandwritingPage, PageElement, parseNotebook } from "./document";

export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;

export function checkBackupFile(name: string, bytes: number): void {
  if (/\.(one|onepkg)$/i.test(name)) throw new Error("OneNote-Dateien (.one/.onepkg) sind nicht dieses Backup-Format. Bitte eine Smooth-Handwriting-Datei (.handwriting.json) wählen; native OneNote-Konvertierung wird nicht unterstützt.");
  if (!/\.handwriting\.json$/i.test(name)) throw new Error("Bitte eine bearbeitbare .handwriting.json-Datei wählen.");
  if (bytes > MAX_BACKUP_BYTES) throw new Error("Backup zu groß: höchstens 64 MiB.");
}

export function parseNotebookBackup(text: string, name: string): HandwritingDocumentV3 {
  checkBackupFile(name, text.length);
  checkBackupFile(name, new TextEncoder().encode(text).byteLength);
  let value: any;
  try { value = JSON.parse(text); } catch { throw new Error("Ungültiges Backup: JSON nicht lesbar."); }
  // Bound nesting and prohibit prototype keys before any cloning/remapping.
  const visit = (node: any, depth: number): void => {
    if (depth > 40) throw new Error("Backup zu tief verschachtelt.");
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Unsichere Backup-Felder.");
      visit(node[key], depth + 1);
    }
    if (node.type === "image" && (typeof node.dataUrl !== "string" || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(node.dataUrl) || !["image/png", "image/jpeg"].includes(node.mimeType) || !node.dataUrl.startsWith(`data:${node.mimeType};base64,`))) {
      throw new Error("Backup-Bilder müssen eingebettete PNG- oder JPEG-Daten sein.");
    }
  };
  visit(value, 0);
  // parseNotebook also migrates geometry. Validate a disposable copy, keeping
  // the backup's actual page dimensions, baselines, ink and settings untouched.
  const parsed = parseNotebook(structuredClone(value));
  if (!parsed.ok) throw new Error(parsed.error.kind === "unsupported-version" ? `Backup-Version ${parsed.error.version} wird nicht unterstützt.` : `Ungültiges Backup: ${parsed.error.detail}`);
  if (value.version !== 3) throw new Error("Dieses Backup benötigt Dokument-Version 3.");
  return value as HandwritingDocumentV3;
}

/** Stage detached pages only: the receiving document's profile/settings win. */
export function prepareBackupPages(current: HandwritingDocumentV3, incoming: HandwritingDocumentV3, idFactory: () => string = () => crypto.randomUUID()): HandwritingPage[] {
  if (current.pages.length + incoming.pages.length > 5000) throw new Error("Import ergibt zu viele Seiten (höchstens 5000).");
  const elements = (doc: HandwritingDocumentV3): PageElement[] => doc.pages.flatMap(page => page.elements.flatMap(element => [element, ...(element.type === "text" ? element.reconstruction?.originalStrokes ?? [] : [])]));
  const oldIds = [...current.pages, ...elements(current)].map(item => item.id);
  const sourceItems = [...incoming.pages, ...elements(incoming)];
  const used = new Set([...oldIds, ...sourceItems.map(item => item.id)]);
  const ids = new Map<string, string>();
  const fresh = (): string => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const id = idFactory();
      if (/^[A-Za-z0-9_-]{1,200}$/.test(id) && !used.has(id)) { used.add(id); return id; }
    }
    throw new Error("Keine kollisionsfreie ID erzeugbar.");
  };
  for (const item of sourceItems) {
    if (ids.has(item.id)) throw new Error("Backup enthält doppelte Seiten-/Element-IDs.");
    ids.set(item.id, fresh());
  }
  const pages = structuredClone(incoming.pages);
  const copy = { ...incoming, pages };
  for (const page of pages) page.id = ids.get(page.id)!;
  for (const element of elements(copy)) {
    element.id = ids.get(element.id)!;
    if (element.parentId) {
      // Never link imported content to an unrelated receiving element.
      const parent = ids.get(element.parentId);
      if (!parent) throw new Error("Backup enthält einen unbekannten parentId-Verweis.");
      element.parentId = parent;
    }
  }
  return pages;
}

/** This is our editable notebook format, not a native OneNote file. */
export function exportNotebookBackup(document: HandwritingDocumentV3): { filename: string; text: string } {
  return { filename: "Smooth-Handwriting.handwriting.json", text: JSON.stringify(document) };
}

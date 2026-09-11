/**
 * OneNote-Übertragung (0.25.2).
 *
 * `.one`/`.onepkg` sind Microsofts geschlossene Binärformate; der offiziell
 * unterstützte Interoperabilitätsweg ist der HTML-/MHT-Export von OneNote
 * (Datei → Exportieren → Webseite). Dieses Modul liest genau diese Exporte
 * und erzeugt umgekehrt eigenständige HTML-Dateien, die OneNote als
 * Seiteninhalt öffnen kann. Handschriftliche Tinte landet dabei als Bild,
 * nicht als bearbeitbare Tinte — das ist eine Grenze des Formats, kein Bug.
 *
 * Reine, DOM-freie Funktionen: In Node testbar, im Editor ohne DOMParser nutzbar.
 */

import { PageElement, TextElement } from "./document";

export const ONE_NOTE_PAGE_WIDTH = 1200;
export const ONE_NOTE_PAGE_HEIGHT = 1697;
export const ONE_NOTE_MAX_BYTES = 48 * 1024 * 1024;

export interface OneNoteTextBlock {
  kind: "heading-1" | "heading-2" | "heading-3" | "body" | "bullet" | "numbered" | "check" | "quote" | "code";
  text: string;
}
export interface OneNoteImageBlock { kind: "image"; src: string }
export interface OneNoteTableBlock { kind: "table"; cells: string[][] }
export type OneNoteBlock = OneNoteTextBlock | OneNoteImageBlock | OneNoteTableBlock;

/** MHT-Archiv (multipart/related) in HTML + Bild-Map zerlegen. */
export function parseMhtArchive(text: string): { html: string; images: Map<string, string> } {
  const boundaryMatch = text.match(/boundary="?([^"\r\n;]+)"?/i);
  if (!boundaryMatch) throw new Error("MHT-Archiv ohne Begrenzer: kein gültiger OneNote-Export.");
  const boundary = `--${boundaryMatch[1]}`;
  const parts = text.split(boundary);
  let html = "";
  const images = new Map<string, string>();
  for (const part of parts.slice(1, -1)) {
    const separator = part.match(/\r?\n\r?\n/);
    if (!separator || separator.index === undefined) continue;
    const headerText = part.slice(0, separator.index);
    const body = part.slice(separator.index + separator[0].length).replace(/\r?\n$/, "");
    const contentType = /content-type:\s*([^\r\n;]+)/i.exec(headerText)?.[1]?.trim() ?? "";
    const location = /content-location:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() ?? "";
    if (/^text\/html/i.test(contentType)) {
      html = /quoted-printable/i.test(headerText) ? decodeQuotedPrintable(body) : body;
    } else if (/^image\//i.test(contentType)) {
      const base64 = body.replace(/[^A-Za-z0-9+/=]/g, "");
      images.set(location, `data:${contentType};base64,${base64}`);
    }
  }
  if (!html) throw new Error("MHT-Archiv enthält keinen HTML-Teil.");
  return { html, images };
}

export function decodeQuotedPrintable(text: string): string {
  const soft = text.replace(/=\r?\n/g, "");
  return soft.replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", middot: "·", bull: "•" };

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * Toleranter Block-Scanner für OneNote-HTML. Kein vollständiger Parser —
 * er erkennt Überschriften, Listen, Checkboxes, Tabellen, Bilder und
 * Absätze und verwirft alles andere (Skripte, Formatierungs-Markup).
 */
export function extractOneNoteBlocks(html: string): OneNoteBlock[] {
  let source = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  // Heading- und Checkbox-Tags in Satzzeichen-Sentinel verwandeln, bevor alle Tags fallen.
  source = source.replace(/<h([1-6])[^>]*>/gi, (_m, level) => `\u0000H${Math.min(Number(level), 3)}\u0000`);
  source = source.replace(/<input[^>]*type=["']?checkbox["']?[^>]*>/gi, "\u0000CHECK\u0000");
  // Bilder als Sentinel mit Quelle erhalten.
  source = source.replace(/<img\b[^>]*?\bsrc=["']?([^"'\s>]+)[^>]*>/gi, (_m, src) => `\u0000IMG:${src}\u0000`);
  // Tabellen extrahieren und durch Sentinel ersetzen (vor Zeilenumbruch-Erzeugung).
  const tables: string[][][] = [];
  source = source.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml) => {
    const rows: string[][] = [];
    for (const rowMatch of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...rowMatch[1].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(cell => decodeHtmlEntities(cell[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
      if (cells.length) rows.push(cells);
    }
    if (!rows.length) return " ";
    tables.push(rows);
    return `\u0000TABLE:${tables.length - 1}\u0000`;
  });
  // Blockende als Zeilenumbruch interpretieren; Titel/Heading-Enden auch.
  source = source.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, " ")
    .replace(/<li\b[^>]*>/gi, "\u0000LI\u0000")
    .replace(/<\/(?:p|div|li|tr|h[1-6]|table|title|head)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  source = source.replace(/<[^>]+>/g, "");
  source = decodeHtmlEntities(source);
  const blocks: OneNoteBlock[] = [];
  let pendingHeading: OneNoteTextBlock["kind"] | null = null;
  for (const rawLine of source.split("\n")) {
    const line = rawLine.replace(/\u0000\/H\u0000/g, "").trim();
    if (!line) continue;
    // Heading-Sentinel kann inline vor dem Text stehen (<h1>Text</h1> ist eine Zeile).
    const inlineHeading = /\u0000H([123])\u0000/.exec(line);
    if (inlineHeading) {
      // Heading-Sentinel kann mitten in der Zeile stehen (h1 + Absatz in einer Zeile).
      const before = line.slice(0, inlineHeading.index).replace(/\s+/g, " ").trim();
      if (before) { blocks.push({ kind: "body", text: before.slice(0, 20_000) }); }
      const rest = line.slice(inlineHeading.index + inlineHeading[0].length).replace(/\u0000\/H\u0000/, "").trim();
      const kind = `heading-${inlineHeading[1]}` as OneNoteTextBlock["kind"];
      const headingText = rest.replace(/\u0000IMG:[^\u0000]+\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, 20_000);
      // Inline-Bilder im Heading als eigene Blöcke erhalten.
      for (const imageMatch of rest.matchAll(/\u0000IMG:([^\u0000]+)\u0000/g)) blocks.push({ kind: "image", src: imageMatch[1] });
      if (headingText) blocks.push({ kind, text: headingText });
      else pendingHeading = kind;
      continue;
    }
    const image = /^\u0000IMG:(.+)\u0000$/.exec(line);
    if (image) { blocks.push({ kind: "image", src: image[1] }); continue; }
    const table = /^\u0000TABLE:(\d+)\u0000$/.exec(line);
    if (table) { blocks.push({ kind: "table", cells: tables[Number(table[1])] }); continue; }
    let text = line.replace(/\s+/g, " ").trim();
    if (!text) continue;
    // Inline-Sentinels (IMG/CHECK/LI) auswerten; ein Sentinel gilt für den folgenden Text.
    const parts = text.split(/(\u0000(?:IMG:[^\u0000]+|CHECK|LI)\u0000)/);
    let pendingKind: "check" | "bullet" | null = null;
    for (const part of parts) {
      if (!part) continue;
      if (/^\u0000IMG:/.test(part)) { blocks.push({ kind: "image", src: /^\u0000IMG:(.+)\u0000$/.exec(part)![1] }); continue; }
      if (/^\u0000CHECK\u0000$/.test(part)) { pendingKind = "check"; continue; }
      if (/^\u0000LI\u0000$/.test(part)) { pendingKind = "bullet"; continue; }
      const trimmed = part.replace(/\u0000/g, "").trim();
      if (!trimmed) continue;
      const kind: OneNoteTextBlock["kind"] = pendingHeading ?? pendingKind ?? "body";
      const clean = trimmed.replace(/^[\u2610\u2611\u2612]\s*/, "").replace(/^\[[ xX]?\]\s*/i, "").replace(/^[•·▪◦‣]\s*/, "").trim();
      if (clean) { blocks.push({ kind, text: clean.slice(0, 20_000) }); pendingKind = null; if (pendingHeading) pendingHeading = null; }
    }
    continue;
  }
  return blocks;
}

export interface OneNoteLayoutBlock {
  x: number;
  y: number;
  height: number;
  block: OneNoteBlock;
}

/** Blockgrößen abschätzen und Zeilen auf Seiten verteilen. */
export function layoutOneNoteBlocks(blocks: OneNoteBlock[], pageHeight = ONE_NOTE_PAGE_HEIGHT): { pages: OneNoteLayoutBlock[][]; missingImages: string[] } {
  const pages: OneNoteLayoutBlock[][] = [[]];
  const missingImages: string[] = [];
  let y = 96;
  const push = (block: OneNoteLayoutBlock): void => {
    if (y + block.height > pageHeight - 72 && pages[pages.length - 1].length > 0) { pages.push([]); y = 96; }
    block.y = y;
    y += block.height + 16;
    pages[pages.length - 1].push(block);
  };
  for (const block of blocks) {
    if (block.kind === "image") {
      if (!/^data:image\/(png|jpeg);base64,/i.test(block.src)) missingImages.push(block.src);
      push({ x: 64, y: 0, height: 240, block });
      continue;
    }
    if (block.kind === "table") {
      push({ x: 64, y: 0, height: block.cells.length * 34 + 12, block });
      continue;
    }
    const fontSize = block.kind === "heading-1" ? 34 : block.kind === "heading-2" ? 28 : block.kind === "heading-3" ? 24 : 20;
    const charsPerLine = Math.max(8, Math.floor((ONE_NOTE_PAGE_WIDTH - 128) / (fontSize * 0.55)));
    const lines = Math.max(1, Math.ceil(block.text.length / charsPerLine));
    push({ x: 64, y: 0, height: lines * fontSize * 1.5, block });
  }
  return { pages: pages.filter(page => page.length > 0), missingImages };
}

const BLOCK_STYLES: Partial<Record<OneNoteTextBlock["kind"], TextElement["blockStyle"]>> = {
  "heading-1": "heading-1", "heading-2": "heading-2", "heading-3": "heading-3",
  bullet: "bullet", numbered: "numbered", check: "check", quote: "quote", code: "code"
};

/** Layout-Blöcke in Editor-Elemente übersetzen (IDs vom Aufrufer). */
export function blocksToPageElements(layout: OneNoteLayoutBlock[], idFactory: () => string, imageData: (src: string) => { dataUrl: string; mimeType: "image/png" | "image/jpeg"; width: number; height: number } | null): PageElement[] {
  const elements: PageElement[] = [];
  for (const entry of layout) {
    const block = entry.block;
    if (block.kind === "image") {
      const image = imageData(block.src);
      if (image) {
        const scale = Math.min(1, (ONE_NOTE_PAGE_WIDTH - 128) / Math.max(1, image.width), 900 / Math.max(1, image.height));
        elements.push({ type: "image", id: idFactory(), x: entry.x, y: entry.y, width: image.width * scale, height: image.height * scale, dataUrl: image.dataUrl, mimeType: image.mimeType, sourceName: "OneNote-Import" });
      }
      continue;
    }
    const fontSize = block.kind === "heading-1" ? 34 : block.kind === "heading-2" ? 28 : block.kind === "heading-3" ? 24 : 20;
    const element: TextElement = {
      type: "text", id: idFactory(), x: entry.x, baseline: entry.y + fontSize, width: ONE_NOTE_PAGE_WIDTH - 128, fontSize,
      color: "#202124", text: block.kind === "table" ? "" : block.text,
      ...(BLOCK_STYLES[block.kind as OneNoteTextBlock["kind"]] ? { blockStyle: BLOCK_STYLES[block.kind as OneNoteTextBlock["kind"]] } : {})
    };
    if (block.kind === "table") { element.table = { cells: block.cells.map(row => row.map(cell => cell.slice(0, 2_000))) }; element.text = block.cells.map(row => row.join("\t")).join("\n").slice(0, 20_000); }
    elements.push(element);
  }
  return elements;
}

export interface OneNoteExportPage {
  title: string;
  /** Vollflächige Tinte (Striche, Formen, Marker) als PNG-Data-URL, ohne Text. */
  inkDataUrl?: string;
  blocks: Array<{ html: string }>;
}

/** Eigenständige HTML-Datei bauen, die OneNote als Inhalt öffnet. */
export function buildOneNoteHtml(pages: OneNoteExportPage[], documentTitle = "Smooth Handwriting Export"): string {
  const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = pages.map((page, index) => {
    const parts = [`<h1>${escape(page.title || `Seite ${index + 1}`)}</h1>`];
    if (page.inkDataUrl) parts.push(`<div><img src="${page.inkDataUrl}" alt="Handschrift Seite ${index + 1}" style="max-width:100%;border:1px solid #ddd;border-radius:6px;"></div>`);
    for (const block of page.blocks) parts.push(`<div>${block.html}</div>`);
    return parts.join("\n");
  }).join('\n<hr style="border:none;border-top:1px solid #ccc;margin:32px 0;">\n');
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${escape(documentTitle)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;color:#202124;max-width:860px;margin:0 auto;padding:24px;line-height:1.5}h1{font-size:26px}h2{font-size:21px}h3{font-size:18px}table{border-collapse:collapse}td{border:1px solid #bbb;padding:4px 10px}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** Ein Text-/Tabellen-Element als OneNote-taugliches HTML. */
export function textElementToHtml(element: { text: string; fontSize: number; blockStyle?: string; table?: { cells: string[][] } }): string {
  const escape = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = element.text.split("\n").map(line => escape(line)).join("<br>");
  if (element.table) {
    const rows = element.table.cells.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("");
    return `<table>${rows}</table>`;
  }
  switch (element.blockStyle) {
    case "heading-1": return `<h1>${paragraphs}</h1>`;
    case "heading-2": return `<h2>${paragraphs}</h2>`;
    case "heading-3": return `<h3>${paragraphs}</h3>`;
    case "bullet": return `<p>• ${paragraphs}</p>`;
    case "numbered": return `<p>1. ${paragraphs}</p>`;
    case "check": return `<p>☐ ${paragraphs}</p>`;
    case "quote": return `<blockquote>${paragraphs}</blockquote>`;
    case "code": return `<pre>${escape(element.text)}</pre>`;
    default: return `<p>${paragraphs}</p>`;
  }
}

/** Übersicht über Import-Grenzen für Status-/Hinweistexte. */
export function describeOneNoteLimits(): string {
  return "OneNote-Import liest HTML/MHT-Exporte. Handschrift aus OneNote kommt als Bild an, nicht als bearbeitbare Tinte.";
}
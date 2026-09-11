/*
 * PDF-Sidecar-Schutz (M1): Der native PDF-Annotation-Pfad legt seine
 * Seiten-Markierungen in einer Sidecar-JSON ab (Version 1). Vorher fiel der
 * Lader bei kaputter JSON still auf ein leeres Dokument zurück — der nächste
 * Save überschrieb damit das Original. Dieser Guard ersetzt das Muster:
 *
 *  - adopt(): prüft Parse, Version, pdfPath-Identität und Seiten-Form.
 *    Kaputt ⇒ read-only (writable=false) und ein leerer Anzeige-Stand;
 *    die Original-Bytes bleiben für eine Nutzer-ausgelöste Sicherung erhalten.
 *  - recover(): explizite, vom Nutzer bestätigte Wiederherstellung — frischer
 *    beschreibbarer Zustand. Niemals implizit ein leeres Dokument erzeugen.
 */

import { PageElement } from "./document";

export interface PdfInkDocument {
  version: 1;
  pdfPath: string;
  pages: Record<string, PageElement[]>;
}

export class PdfSidecarGuard {
  private state: { corrupt: boolean; raw: string | null } = { corrupt: false, raw: null };

  /** true ⇒ Schreiben ist erlaubt. Kaputte Sidecars sperren jeden Write. */
  get writable(): boolean { return !this.state.corrupt; }

  /** Original-Text der Sidecar-Datei (für die Sicherung vor einer Wiederherstellung). */
  get rawContent(): string | null { return this.state.raw; }

  /**
   * Ladeversuch: entscheidet über Annahme oder Corrupt-Zustand.
   * `text === null` bedeutet „Sidecar-Datei existiert nicht“ — legitimer
   * Neustart, beschreibbar.
   */
  adopt(filePath: string, text: string | null): PdfInkDocument {
    const fresh: PdfInkDocument = { version: 1, pdfPath: filePath, pages: {} };
    if (text === null) { this.state = { corrupt: false, raw: null }; return fresh; }
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { this.state = { corrupt: true, raw: text }; return fresh; }
    const candidate = parsed as Partial<PdfInkDocument> & Record<string, unknown>;
    const pages = candidate.pages;
    const validPages = typeof pages === "object" && pages !== null && !Array.isArray(pages)
      && Object.values(pages).every((elements) => Array.isArray(elements));
    if (candidate.version === 1 && candidate.pdfPath === filePath && validPages) {
      this.state = { corrupt: false, raw: text };
      return candidate as PdfInkDocument;
    }
    this.state = { corrupt: true, raw: text };
    return fresh;
  }

  /** Vorhandene Sidecar-Datei konnte nicht gelesen werden: Sperren ohne Backup-Bytes. */
  markUnreadable(filePath: string): PdfInkDocument {
    this.state = { corrupt: true, raw: null };
    return { version: 1, pdfPath: filePath, pages: {} };
  }

  /** Vom Nutzer bestätigte Wiederherstellung. Aufrufer sichert vorher die
   * rawContent-Bytes; danach ist der Guard wieder beschreibbar und gibt einen
   * frischen leeren Stand zurück. */
  recover(filePath: string): PdfInkDocument {
    this.state = { corrupt: false, raw: null };
    return { version: 1, pdfPath: filePath, pages: {} };
  }
}
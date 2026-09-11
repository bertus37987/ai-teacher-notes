import assert from "node:assert/strict";
import { PdfSidecarGuard, PdfInkDocument } from "../src/pdf-sidecar";

/*
 * 0.23.0-Hazard, native PDF: load() fing kaputte Sidecar-JSONs ab und fiel still
 * auf ein leeres Dokument zurück; der nächste Timer-Save überschrieb damit das
 * Original. Diese Suite pinnt den Ersatz-Vertrag:
 *  - parse/Identitäts-Prüfung (Version, pdfPath, Seiten-Form),
 *  - corrupt ⇒ read-only (keine Writes), Original-Text bleibt für Sicherung erhalten,
 *  - explizite, Nutzer-ausgelöste Wiederherstellung erzeugt einen frischen,
 *    beschreibbaren Zustand — niemals still ein leeres Dokument.
 */

const FILE = "Schule/Physik/Arbeitsblatt.pdf";

function sidecarText(overrides: Record<string, unknown> = {}): string {
  const base: PdfInkDocument = {
    version: 1,
    pdfPath: FILE,
    pages: {
      "1": [{ type: "stroke", id: "s1", color: "#202124", size: 4, points: [{ x: 10, y: 20, pressure: 0.5, time: 1 }] }],
      "2": [{ type: "shape", id: "h1", kind: "line", points: [{ x: 0, y: 0, pressure: 0.5 }, { x: 100, y: 0, pressure: 0.5 }], color: "#202124", size: 4, closed: false }],
    },
  };
  return JSON.stringify({ ...base, ...overrides });
}

async function main(): Promise<void> {
  {
    // Gültiger Sidecar wird unverändert übernommen; Original-Text bleibt für den Fall behalten.
    const guard = new PdfSidecarGuard();
    const text = sidecarText();
    const document = guard.adopt(FILE, text);
    assert.equal(document.pages["1"].length, 1);
    assert.equal(document.pages["2"][0].type, "shape");
    assert.equal(guard.writable, true, "gültige Datei bleibt beschreibbar");
    assert.equal(guard.rawContent, text, "Original-Text bleibt verfügbar");
  }

  {
    // Kein Sidecar vorhanden: frischer Start, beschreibbar, kein Corrupt-Zustand.
    const guard = new PdfSidecarGuard();
    const document = guard.adopt(FILE, null);
    assert.deepEqual(document.pages, {});
    assert.equal(guard.writable, true);
  }

  {
    // Kaputte JSON ⇒ read-only, leerer Arbeitsstand, Original für Sicherung erhalten.
    const guard = new PdfSidecarGuard();
    const broken = "{\"version\": 1, kaputt";
    const document = guard.adopt(FILE, broken);
    assert.deepEqual(document.pages, {}, "frisches leeres Dokument als Anzeige-Stand");
    assert.equal(guard.writable, false, "kaputter Sidecar sperrt das Schreiben");
    assert.equal(guard.rawContent, broken, "Original-Bytes bleiben für die Sicherung erhalten");
  }

  {
    // Falsche Version ⇒ read-only.
    const guard = new PdfSidecarGuard();
    const text = sidecarText({ version: 2 });
    guard.adopt(FILE, text);
    assert.equal(guard.writable, false);
    assert.equal(guard.rawContent, text);
  }

  {
    // Sidecar gehört einem anderen PDF (pdfPath-Mismatch) ⇒ nie wiederverwenden.
    const guard = new PdfSidecarGuard();
    const text = sidecarText({ pdfPath: "Andere/Datei.pdf" });
    guard.adopt(FILE, text);
    assert.equal(guard.writable, false);
    assert.equal(guard.rawContent, text);
  }

  {
    // Formfehler der Seiten-Struktur ⇒ read-only, Original erhalten.
    const cases: string[] = [
      JSON.stringify({ version: 1, pdfPath: FILE }),
      JSON.stringify({ version: 1, pdfPath: FILE, pages: [] }),
      JSON.stringify({ version: 1, pdfPath: FILE, pages: { "1": { hilfe: true } } }),
      JSON.stringify({ version: 1, pdfPath: FILE, pages: null }),
    ];
    for (const text of cases) {
      const guard = new PdfSidecarGuard();
      guard.adopt(FILE, text);
      assert.equal(guard.writable, false, `Formfehler nicht als korrupt erkannt: ${text}`);
      assert.equal(guard.rawContent, text, "auch bei Formfehlern bleibt das Original erhalten");
    }
  }

  {
    // Leerer, aber gültiger Sidecar ist ein legitimer Zustand — kein Corrupt.
    const guard = new PdfSidecarGuard();
    const text = JSON.stringify({ version: 1, pdfPath: FILE, pages: {} });
    guard.adopt(FILE, text);
    assert.equal(guard.writable, true);
  }

  {
    // Vorhandene, aber unlesbare Datei: sperren — kein stilles Überschreiben.
    const guard = new PdfSidecarGuard();
    const document = guard.markUnreadable(FILE);
    assert.deepEqual(document.pages, {});
    assert.equal(guard.writable, false, "unlesbare vorhandene Datei bleibt gesperrt");
    assert.equal(guard.rawContent, null);
  }

  {
    // Explizite Wiederherstellung: frischer beschreibbarer Stand; Rohdaten fürs Backup davor abgreifbar.
    const guard = new PdfSidecarGuard();
    const broken = "????";
    guard.adopt(FILE, broken);
    assert.equal(guard.writable, false);
    assert.equal(guard.rawContent, broken);
    const recovered = guard.recover(FILE);
    assert.deepEqual(recovered, { version: 1, pdfPath: FILE, pages: {} });
    assert.equal(guard.writable, true, "nach Zustimmung des Nutzers wieder beschreibbar");
    assert.equal(guard.rawContent, null, "nach der Sicherung werden keine Bytes mehr vorgehalten");

    // Ein erneuter Ladevorgang ersetzt den Zustand vollständig.
    const again = guard.adopt(FILE, sidecarText());
    assert.equal(again.pages["1"].length, 1);
    assert.equal(guard.writable, true);
  }

  console.log("PDF-Sidecar-Schutz Vertragstests bestanden");
}

main().catch((error) => { console.error(error); process.exit(1); });
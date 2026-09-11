import assert from "node:assert/strict";
import { parseNotebook, parseDocument, createDocument, HandwritingDocumentV3 } from "../src/document";

/*
 * M1: Schema-/Parser-Härtung des Notizbuch-Formats.
 *
 * Vorher bestand hasValidPages nur `typeof width === "number"` — NaN, negative
 * oder unendliche Maße liefen durch, Elemente wurde gar nicht geprüft, und ein
 * „gültiges“ V2-Schema wurde sofort per Auto-Migration zurückgespeichert
 * (Korruption zementiert). Diese Suite pinnt den Vertrag:
 *  - finite, positive, gebundene Seitenmaße; Element-Strukturen; gebundene Inhalte,
 *  - kaputt/neuere Version ⇒ klarer Fehler statt leerem Dokument oder Auto-Migration,
 *  - V1/V2/V3 bleiben ladbar; unbekannte Felder bleiben erhalten,
 *  - parseDocument bleibt kompatibel (Fehler ⇒ null).
 */

function docJson(document: HandwritingDocumentV3, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...JSON.parse(JSON.stringify(document)), ...overrides });
}

function expectError(result: ReturnType<typeof parseNotebook>, kind: string): string {
  assert.equal(result.ok, false);
  if (result.ok) return "";
  assert.equal(result.error.kind, kind);
  return result.error.kind === "malformed" ? result.error.detail : String(result.error.version ?? "");
}

async function main(): Promise<void> {
  const base = createDocument("grid");

  /* ------------------------- gültige Dokumente ------------------------- */

  {
    const result = parseNotebook(JSON.parse(docJson(base)) as unknown);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.migrated, false);
    assert.equal(result.document.pages.length, 1);
  }

  {
    // V3 mit unbekannten Zusatzfeldern bleibt lesbar und behält die Felder.
    const text = JSON.stringify({ ...JSON.parse(docJson(base)), "x-zukunft": { plan: true } });
    const result = parseNotebook(JSON.parse(text) as unknown);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal((result.document as unknown as { "x-zukunft": { plan: boolean } })["x-zukunft"].plan, true, "unbekannte Felder bleiben erhalten");
  }

  {
    // V2 wird migriert (Version 3) und behält unbekannte Felder.
    const v2 = { ...JSON.parse(JSON.stringify(base)), version: 2, "notiz-feld": "bleibt" };
    delete (v2 as Record<string, unknown>).profile;
    const result = parseNotebook(v2 as unknown);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.migrated, true);
    assert.equal(result.document.version, 3);
    assert.equal((result.document as unknown as Record<string, unknown>)["notiz-feld"], "bleibt");
  }

  {
    // Altes V1-Dokument migriert zu einer Seite mit Stroke-Elementen.
    const v1 = { version: 1, width: 1200, height: 1697, paper: "grid", strokes: [{ id: "s1", color: "#111", size: 4, points: [{ x: 10, y: 20, pressure: 0.5 }] }] };
    const result = parseNotebook(v1 as unknown);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.migrated, true);
    assert.equal(result.document.version, 3);
    assert.equal(result.document.pages[0].elements[0].type, "stroke");
  }

  {
    // V1/V2-Migration + neue Striktheit ändern parseDocument-Kompatibilität nicht: valide ⇒ Objekt.
    const parsed = parseDocument(JSON.parse(JSON.stringify(base)) as unknown);
    assert.ok(parsed && parsed.document.pages.length === 1, "parseDocument bleibt kompatibel");
  }

  /* ------------------------- Seitenmaße ------------------------- */

  {
    for (const broken of [
      docJson(base, { pages: [{ ...base.pages[0], width: NaN, height: NaN }] }),
      docJson(base, { pages: [{ ...base.pages[0], width: -10 }] }),
      docJson(base, { pages: [{ ...base.pages[0], height: Infinity }] }),
      docJson(base, { pages: [{ ...base.pages[0], width: 0 }] }),
      docJson(base, { pages: [{ ...base.pages[0], height: 10 ** 9 }] }),
      docJson(base, { pages: [{ ...base.pages[0], width: "1200" }] }),
    ]) {
      const detail = expectError(parseNotebook(JSON.parse(broken) as unknown), "malformed");
      assert.match(detail, /Seite|Maß|Breite|Höhe/i);
    }
  }

  {
    // Leeres Seiten-Array: kein Notebook → nicht migrieren.
    expectError(parseNotebook(JSON.parse(docJson(base, { pages: [] })) as unknown), "malformed");
    // pages kein Array
    expectError(parseNotebook(JSON.parse(docJson(base, { pages: { 0: base.pages[0] } })) as unknown), "malformed");
  }

  {
    // baselines: vorhanden aber kein Array ⇒ malformed (nicht still ersetzen).
    const text = JSON.stringify({ ...JSON.parse(docJson(base)), pages: [{ ...base.pages[0], baselines: "12,24" }] });
    expectError(parseNotebook(JSON.parse(text) as unknown), "malformed");
  }

  /* ------------------------- Elemente ------------------------- */

  {
    // Unbekannter Elementtyp ⇒ malformed.
    const page = { ...base.pages[0], elements: [{ type: "scribble", id: "x" }] };
    const detail = expectError(parseNotebook(JSON.parse(docJson(base, { pages: [page] })) as unknown), "malformed");
    assert.match(detail, /Element/i);
  }

  {
    // Stroke mit kaputten Punkten ⇒ malformed.
    const brokenPointSets: unknown[] = [
      "nicht-ein-array",
      [{ x: "10", y: 20 }],
      [{ x: Infinity, y: 20 }],
      [{ x: 10, y: NaN }],
      Array.from({ length: 250_000 }, (_, i) => ({ x: i, y: i })), // über der Grenze
    ];
    for (const points of brokenPointSets) {
      const element = { type: "stroke", id: "s", color: "#111", size: 4, points };
      expectError(parseNotebook(JSON.parse(docJson(base, { pages: [{ ...base.pages[0], elements: [element] }] })) as unknown), "malformed");
    }

    // Ordentlicher Stroke bleibt gültig; optionale Felder werden nicht verlangt.
    const clean = parseNotebook(JSON.parse(docJson(base, { pages: [{ ...base.pages[0], elements: [{ type: "stroke", id: "s", color: "#111", size: 4, points: [{ x: 1, y: 2 }], rawPoints: [{ x: 1, y: 2 }], normalizedWordId: "w1", recognitionText: "Hallo" }] }] })) as unknown);
    assert.equal(clean.ok, true);
  }

  {
    // Text mit kaputtem Inhalt ⇒ malformed.
    const brokenTexts: unknown[] = [
      { type: "text", id: "t", x: 0, baseline: 0, width: NaN, fontSize: 20, color: "#111", text: "a" },
      { type: "text", id: "t", x: 0, baseline: 0, width: 100, fontSize: "20", color: "#111", text: "a" },
      { type: "text", id: "t", x: 0, baseline: 0, width: 100, fontSize: 20, color: "#111", text: "a".repeat(300_000) },
      { type: "text", id: "t", x: 0, baseline: 0, width: 100, fontSize: 20, color: "#111", text: "a", table: { cells: "kein-array" } },
      { type: "text", id: "t", x: 0, baseline: 0, width: 100, fontSize: 20, color: "#111", text: "a", table: { cells: [["ok", { obj: true }]] } },
      { type: "text", id: "t", x: 0, baseline: 0, width: 100, fontSize: 20, color: "#111", text: "a", table: { cells: [["z".repeat(50_000)]] } },
    ];
    for (const element of brokenTexts) {
      expectError(parseNotebook(JSON.parse(docJson(base, { pages: [{ ...base.pages[0], elements: [element] }] })) as unknown), "malformed");
    }

    // Strukturierte Tabelle in realistischem Umfang ist gültig.
    const tableDoc = createDocument("grid");
    tableDoc.pages[0].elements.push({ type: "text", id: "t2", x: 0, baseline: 50, width: 400, fontSize: 14, color: "#111", text: "", table: { cells: [["a", "b"], ["1", "2"]] } });
    const parsed = parseNotebook(JSON.parse(docJson(tableDoc)) as unknown);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) throw new Error("unreachable");
    const cells = (parsed.document.pages[0].elements[0] as { table?: { cells: string[][] } }).table?.cells;
    assert.deepEqual(cells, [["a", "b"], ["1", "2"]]);
  }

  {
    // Bild mit kaputten Maßen/Data-URL ⇒ malformed.
    const brokenImages: unknown[] = [
      { type: "image", id: "i", x: 0, y: 0, width: NaN, height: 100, dataUrl: "data:image/png;base64,AA==", mimeType: "image/png" },
      { type: "image", id: "i", x: 0, y: 0, width: 100, height: -5, dataUrl: "data:image/png;base64,AA==", mimeType: "image/png" },
      { type: "image", id: "i", x: 0, y: 0, width: 100, height: 100, dataUrl: 42, mimeType: "image/png" },
      { type: "image", id: "i", x: 0, y: 0, width: 100, height: 100, dataUrl: "kein-data-url", mimeType: "image/png" },
    ];
    for (const element of brokenImages) {
      expectError(parseNotebook(JSON.parse(docJson(base, { pages: [{ ...base.pages[0], elements: [element] }] })) as unknown), "malformed");
    }

    // Sauberes Bild bleibt gültig.
    const ok = parseNotebook(JSON.parse(docJson(base, { pages: [{ ...base.pages[0], elements: [{ type: "image", id: "i", x: 0, y: 0, width: 200, height: 150, dataUrl: "data:image/png;base64,AA==", mimeType: "image/png", sourceName: "skizze.png" }] }] })) as unknown);
    assert.equal(ok.ok, true);
  }

  {
    // Highlight: Punkte müssen gültig sein, falls vorhanden.
    const broken = { type: "highlight", id: "h", x1: 0, x2: 10, y: 5, size: 6, color: "#fff", opacity: 0.5, points: [{ x: "1", y: 2 }] };
    expectError(parseNotebook(JSON.parse(docJson(base, { pages: [{ ...base.pages[0], elements: [broken] }] })) as unknown), "malformed");
    const legacy = { type: "highlight", id: "h2", x1: 0, x2: 10, y: 5, size: 6, color: "#fff", opacity: 0.5 };
    const ok = parseNotebook(JSON.parse(docJson(base, { pages: [{ ...base.pages[0], elements: [legacy] }] })) as unknown);
    assert.equal(ok.ok, true, "Legacy-Highlights ohne Punkte bleiben gültig");
  }

  {
    // Shape: unbekannte Art ⇒ malformed.
    expectError(parseNotebook(JSON.parse(docJson(base, { pages: [{ ...base.pages[0], elements: [{ type: "shape", id: "s", kind: "quader", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#111", size: 4, closed: false }] }] })) as unknown), "malformed");
  }

  /* ------------------------- Versionen ------------------------- */

  {
    // Neuere Version ⇒ eigener Fehler, niemals Migrations-Save.
    const v4 = { ...JSON.parse(JSON.stringify(base)), version: 4 };
    expectError(parseNotebook(v4 as unknown), "unsupported-version");

    // Fehlende oder kaputte Version ⇒ malformed.
    const noVersion = JSON.parse(JSON.stringify(base));
    delete (noVersion as Record<string, unknown>).version;
    expectError(parseNotebook(noVersion as unknown), "malformed");
    expectError(parseNotebook({ version: "3", pages: [] } as unknown), "malformed");
  }

  {
    // parseDocument-Kompatibilität: Fehlerfälle liefern null (nicht etwa ein leeres Heft).
    assert.equal(parseDocument({ version: 9, pages: [] } as unknown), null);
    assert.equal(parseDocument(JSON.parse(docJson(base, { pages: [{ ...base.pages[0], width: NaN }] })) as unknown), null);
  }

  console.log("Notizbuch-Parser-Härtung Vertragstests bestanden");
}

main().catch((error) => { console.error(error); process.exit(1); });
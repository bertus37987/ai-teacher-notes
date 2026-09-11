import assert from "node:assert/strict";
import { NotebookCommandService, NotebookCommandHost, AppliedNotebookBatch, NotebookWriteBatch } from "../src/notebook-commands";
import { HandwritingDocumentV3, HandwritingPage, PageElement, createDocument, StrokeElement } from "../src/document";

/*
 * M2: Transport-unabhängiger NotebookCommandService.
 *
 * Vertrag (für UI wie MCP identisch):
 *  - Batch = requestId (Idempotenz) + pageId + baseRevision + Operations-Liste.
 *  - Alles-oder-nichts: eine ungültige Operation wendet GAR NICHTS an.
 *  - Stale baseRevision / gesperrter Editor / doppelte requestId ⇒ klare Ablehnung.
 *  - Explizite Scope-Liste für das Bearbeiten vorhandener Elemente (touch[]).
 *  - Agent-Geometrie bekommt origin-Metadaten und läuft NICHT durch die
 *    Handschrift-Normalisierung (sie betritt das Dokument nie über die
 *    Pointer-Queue).
 */

class FakeHost implements NotebookCommandHost {
  readonly staged: AppliedNotebookBatch[] = [];
  revision = 7;
  locked = false;
  private appliedIds = new Set<string>();
  constructor(readonly document: HandwritingDocumentV3) {}
  getRevision(): number { return this.revision; }
  getPage(pageId: string): HandwritingPage | null { return this.document.pages.find((page) => page.id === pageId) ?? null; }
  isWritingLocked(): boolean { return this.locked; }
  hasApplied(requestId: string): boolean { return this.appliedIds.has(requestId); }
  applyApplied(batch: AppliedNotebookBatch): void {
    this.staged.push(batch);
    this.appliedIds.add(batch.requestId);
    this.revision += 1;
    const page = this.getPage(batch.pageId);
    if (page) page.elements = batch.elements;
  }
}

function newHost(): { host: FakeHost; service: NotebookCommandService; document: HandwritingDocumentV3; page: HandwritingPage } {
  const document = createDocument("grid");
  const host = new FakeHost(document);
  return { host, service: new NotebookCommandService(host), document, page: document.pages[0] };
}

function batch(host: FakeHost, page: HandwritingPage, operations: NotebookWriteBatch["operations"], overrides: Partial<NotebookWriteBatch> = {}): NotebookWriteBatch {
  return { requestId: "req-1", pageId: page.id, baseRevision: host.getRevision(), operations, ...overrides };
}

function agentOriginExpectation(element: PageElement): void {
  const origin = (element as { origin?: { agent?: { requestId: string } } }).origin;
  assert.ok(origin?.agent, "Agent-Element trägt Herkunfts-Metadaten");
  assert.equal(origin.agent.requestId, "req-1");
}

async function main(): Promise<void> {
  const { host, service, page } = newHost();

  {
    // Erzeugen: Pfad, Pfeil, Rechteck, Beschriftung, Markierung — atomar.
    const result = service.execute(batch(host, page, [
      { op: "create_path", id: "p1", points: [{ x: 10, y: 10, pressure: 0.5 }, { x: 60, y: 40, pressure: 0.5 }, { x: 110, y: 20, pressure: 0.5 }], style: { size: 4 } },
      { op: "create_shape", id: "a1", kind: "arrow", points: [{ x: 120, y: 120 }, { x: 300, y: 160 }] },
      { op: "create_shape", id: "r1", kind: "rectangle", points: [{ x: 400, y: 300 }, { x: 600, y: 400 }], style: { fillOpacity: 0.2 } },
      { op: "create_text", id: "t1", x: 120, baseline: 200, fontSize: 20, text: "Zellkern", style: { color: "#202124" } },
      { op: "create_highlight", id: "h1", points: [{ x: 100, y: 500 }, { x: 200, y: 520 }], style: { color: "#ffd84d" } },
    ]));
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(host.staged.length, 1, "genau eine atomare Anwendung");
    assert.equal(host.revision, 8, "Revision genau einmal erhöht");
    assert.equal(page.elements.length, 5);
    const kinds = page.elements.map((element) => element.type).sort();
    assert.deepEqual(kinds, ["highlight", "shape", "shape", "stroke", "text"]);
    for (const element of page.elements) agentOriginExpectation(element);

    // Nach der Anwendung ändern weitere UI-Edits die Revision → alte baseRevision ist stale.
    host.revision += 2;
    const stale = service.execute(batch(host, page, [{ op: "create_text", id: "neu", x: 0, baseline: 10, fontSize: 14, text: "zu spät" }], { requestId: "req-stale", baseRevision: 8 }));
    assert.equal(stale.ok, false);
    if (stale.ok) throw new Error("unreachable");
    assert.match(stale.errors[0].code, /stale/);
    assert.equal(host.staged.length, 1, "stale Batch wendet nichts an");
    assert.equal(page.elements.length, 5);
  }

  {
    // Alles-oder-nichts: eine kaputte Operation verhindert die ganze Anwendung.
    const { host: h2, service: s2, page: p2 } = newHost();
    const result = s2.execute(batch(h2, p2, [
      { op: "create_text", id: "gut", x: 10, baseline: 20, fontSize: 12, text: "bleibt draußen" },
      { op: "create_shape", id: "schlecht", kind: "ellipse", points: [{ x: 10, y: 10 }, { x: NaN, y: 20 }] },
    ], { requestId: "req-atomic" }));
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].index, 1, "Fehler zeigt auf die kaputte Operation");
    assert.equal(h2.staged.length, 0);
    assert.equal(p2.elements.length, 0, "nichts wurde angewendet");
    assert.equal(h2.revision, 7);
  }

  {
    // Idempotenz: gleiche requestId, erneuter Versuch ⇒ No-Op-Erfolg, keine Duplikate.
    const { host: h3, service: s3, page: p3 } = newHost();
    const first = s3.execute(batch(h3, p3, [{ op: "create_text", id: "x1", x: 0, baseline: 5, fontSize: 12, text: "einmal" }], { requestId: "req-idem" }));
    assert.equal(first.ok, true);
    const again = s3.execute(batch(h3, p3, [{ op: "create_text", id: "x1", x: 0, baseline: 5, fontSize: 12, text: "einmal" }], { requestId: "req-idem" }));
    assert.equal(again.ok, true);
    if (!again.ok) throw new Error("unreachable");
    assert.equal(again.duplicate, true);
    assert.equal(p3.elements.length, 1, "kein doppeltes Element nach Retry");
    assert.equal(h3.staged.length, 1, "Retry wendet nichts erneut an");
  }

  {
    // Sperre: während Gesten/Import/Export wird der Batch abgelehnt.
    const { host: h4, service: s4, page: p4 } = newHost();
    h4.locked = true;
    const result = s4.execute(batch(h4, p4, [{ op: "create_text", id: "y", x: 0, baseline: 5, fontSize: 12, text: "warten" }], { requestId: "req-lock" }));
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.errors[0].code, "editor-busy");
    assert.equal(p4.elements.length, 0);
  }

  {
    // Scope: vorhandene Elemente nur mit expliziter touch-Liste bearbeiten.
    const { host: h5, service: s5, page: p5 } = newHost();
    const existing: StrokeElement = { type: "stroke", id: "alt", color: "#202124", size: 4, points: [{ x: 5, y: 5, pressure: 0.5 }] };
    p5.elements.push(existing);

    const unscoped = s5.execute(batch(h5, p5, [{ op: "delete_element", id: "alt" }], { requestId: "req-scope1" }));
    assert.equal(unscoped.ok, false);
    if (unscoped.ok) throw new Error("unreachable");
    assert.match(unscoped.errors[0].code, /not-scoped|scope/);
    assert.equal(p5.elements.length, 1, "ungescopte Löschung wendet nichts an");

    const fremde = s5.execute(batch(h5, p5, [{ op: "update_element", id: "gibtsnicht", patch: { text: "x" } }], { requestId: "req-scope2", touch: ["gibtsnicht"] }));
    assert.equal(fremde.ok, false);
    if (fremde.ok) throw new Error("unreachable");
    assert.match(fremde.errors[0].code, /not-found/);

    const overTouch = s5.execute(batch(h5, p5, [{ op: "delete_element", id: "alt" }], { requestId: "req-scope3", touch: ["alt", "anderes"] }));
    assert.equal(overTouch.ok, false);
    if (overTouch.ok) throw new Error("unreachable");
    assert.match(overTouch.errors[0].code, /scope/i, "touch-Liste muss exakt die adressierten Ids enthalten");

    const scoped = s5.execute(batch(h5, p5, [{ op: "delete_element", id: "alt" }], { requestId: "req-scope4", touch: ["alt"] }));
    assert.equal(scoped.ok, true);
    assert.equal(p5.elements.length, 0);
  }

  {
    // Aktualisieren: Textumformulierung und Kurvenkorrektur (Label/Kurve-Fall §19).
    const { host: h6, service: s6, page: p6 } = newHost();
    assert.equal(p6.elements.length, 0);
    const applied = s6.execute(batch(h6, p6, [
      { op: "create_text", id: "label", x: 10, baseline: 30, fontSize: 16, text: "Zellkernn" },
      { op: "create_path", id: "kurve", points: [{ x: 0, y: 0 }, { x: 50, y: 80 }, { x: 100, y: 40 }] },
    ], { requestId: "req-upd" }));
    assert.equal(applied.ok, true);

    h6.revision += 1; // simuliert Bericht/Inspektion zwischen den Turns
    const follow = s6.execute(batch(h6, p6, [
      { op: "update_element", id: "label", patch: { text: "Zellkern" } },
      { op: "update_element", id: "kurve", patch: { points: [{ x: 0, y: 0 }, { x: 40, y: 90 }, { x: 100, y: 30 }] } },
    ], { requestId: "req-upd2", baseRevision: h6.revision, touch: ["label", "kurve"] }));
    assert.equal(follow.ok, true);
    if (!follow.ok) throw new Error("unreachable");
    const text = p6.elements.find((element) => element.id === "label") as { text: string };
    assert.equal(text.text, "Zellkern");
    const curve = p6.elements.find((element) => element.id === "kurve") as StrokeElement;
    assert.equal(curve.points[1].y, 90, "Kurve wurde korrigiert, nicht dupliziert");
    assert.equal(p6.elements.length, 2);
  }

  {
    // Syntaktische Validierung: Ids, Textlängen, Punktmengen, Batchgröße, Seitenlage.
    const { host: h7, service: s7, page: p7 } = newHost();
    const wrong = (operations: NotebookWriteBatch["operations"], requestId = "r") => s7.execute(batch(h7, p7, operations, { requestId }));

    assert.equal(wrong([{ op: "create_text", id: "bad id!", x: 0, baseline: 5, fontSize: 12, text: "a" }], "r1").ok, false);
    assert.equal(wrong([{ op: "create_text", id: "ok", x: 0, baseline: 5, fontSize: 12, text: "a" }, { op: "create_text", id: "ok", x: 1, baseline: 5, fontSize: 12, text: "b" }], "r2").ok, false, "doppelte Ids im Batch");
    assert.equal(wrong([{ op: "create_text", id: "ok2", x: 0, baseline: 5, fontSize: 12, text: "x".repeat(50_000) }], "r3").ok, false);
    assert.equal(wrong([{ op: "create_path", id: "ok3", points: Array.from({ length: 6_000 }, (_, i) => ({ x: i, y: 0 })) }], "r4").ok, false);
    assert.equal(wrong(Array.from({ length: 250 }, (_, i) => ({ op: "create_text" as const, id: `t${i}`, x: 0, baseline: 5, fontSize: 12, text: "a" })), "r5").ok, false, "Batchgröße begrenzt");
    assert.equal(wrong([{ op: "create_text", id: "ok4", x: 0, baseline: 5, fontSize: 12, text: "a" }], "bad request id").ok, false);
    assert.equal(wrong([{ op: "create_shape", id: "ok5", kind: "ellipse", points: [{ x: -50, y: 10 }, { x: 10, y: 10 }] }], "r6").ok, false, "Punkte außerhalb der Seite");
    assert.equal(wrong([{ op: "create_text", id: "ok6", x: 0, baseline: 99999, fontSize: 12, text: "a" }], "r7").ok, false, "Beschriftung außerhalb der Seite");
    assert.equal(h7.staged.length, 0, "alle syntaktischen Fehler wenden nichts an");
  }

  {
    // Origin-Label landet am Element, und Pfade betreten nie die Normalisierungs-Queue
    // (hier: kein normalizedWordId auf Agent-Strokes).
    const { host: h8, service: s8, page: p8 } = newHost();
    const ok = s8.execute(batch(h8, p8, [{ op: "create_path", id: "pf", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }], { requestId: "req-origin", origin: { label: "Zellmembran" } }));
    assert.equal(ok.ok, true);
    const stroke = p8.elements[0] as StrokeElement & { normalizedWordId?: string };
    assert.equal(stroke.normalizedWordId, undefined, "Agent-Geometrie trägt keinen Normalisierungs-Marker");
  }

  console.log("NotebookCommandService Vertragstests bestanden");
}

main().catch((error) => { console.error(error); process.exit(1); });
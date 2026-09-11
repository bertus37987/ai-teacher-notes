import assert from "node:assert/strict";
import {
  blocksToPageElements, buildOneNoteHtml, decodeHtmlEntities,
  decodeQuotedPrintable, describeOneNoteLimits, extractOneNoteBlocks, layoutOneNoteBlocks,
  parseMhtArchive, textElementToHtml
} from "../src/onenote-transfer";
import { TextElement } from "../src/document";

/* 1) Entitäten und Quoted-Printable. */
assert.equal(decodeHtmlEntities("K&#228;se &amp; B&#252;cher &lt;x&gt; &nbsp;"), "Käse & Bücher <x>  ");
assert.equal(decodeQuotedPrintable("Hal=0DFlo=\r\n weiter"), "Hal\rFlo weiter");
console.log("onenote-transfer: Entitäten und quoted-printable bestanden");

/* 2) Block-Extraktion aus typischem OneNote-HTML. */
const oneNoteHtml = `<!DOCTYPE html><html><head><title>Mathe</title><style>.x{color:red}</style><script>alert(1)</script></head>
<body>
<h1>Mathe Woche 3</h1>
<p>Gleichungen =C3=BCben &amp; Wiederholung</p>
<h2>Lineare Funktionen</h2>
<ul><li>Steigung berechnen</li><li>y-Achsenabschnitt</li></ul>
<p><input type="checkbox" checked> Hausaufgaben Seite 12</p>
<table><tr><td>x</td><td>y</td></tr><tr><td>1</td><td>4</td></tr></table>
<p><img src="file:///C:/Users/Willy/AppData/Local/Temp/graph.png"></p>
</body></html>`;
const blocks = extractOneNoteBlocks(oneNoteHtml);
const kinds = blocks.map(block => block.kind);
assert.ok(kinds.includes("heading-1"), "H1 erkannt");
assert.ok(blocks.some(block => block.kind === "heading-2"), "H2 erkannt");
assert.ok(blocks.some(block => block.kind === "bullet" && block.text === "Steigung berechnen"), "Aufzählung erkannt");
assert.ok(blocks.some(block => block.kind === "check" && block.text === "Hausaufgaben Seite 12"), "Checkbox erkannt");
assert.ok(blocks.some(block => block.kind === "table" && JSON.stringify((block as any).cells) === JSON.stringify([["x","y"],["1","4"]])), "Tabelle erkannt");
assert.ok(blocks.some(block => block.kind === "image" && (block as any).src.includes("graph.png")), "Bild erkannt");
assert.ok(!JSON.stringify(blocks).includes("alert"), "Skripte entfernt");
assert.ok(!JSON.stringify(blocks).includes("color:red"), "Styles entfernt");
console.log("onenote-transfer: Block-Extraktion bestanden");

/* 3) Layout paginiert und meldet fehlende Bilder. */
const { pages: layoutPages, missingImages } = layoutOneNoteBlocks(blocks, 1697);
assert.ok(layoutPages.length >= 1 && layoutPages.every(page => page.length > 0), "Layout erzeugt Seiten");
assert.equal(missingImages.length, 1, "nicht eingebettete Bildquelle gemeldet");
const tall = layoutOneNoteBlocks(Array.from({ length: 60 }, () => ({ kind: "body" as const, text: "Zeile ".repeat(40) })), 1697);
assert.ok(tall.pages.length >= 2, "langer Inhalt wird auf mehrere Seiten verteilt");
console.log("onenote-transfer: Layout und Paginierung bestanden");

/* 4) Elemente: IDs neu, Bild nur mit Daten, Tabellenzellen begrenzt. */
let counter = 0;
const ids: string[] = [];
const elements = blocksToPageElements(layoutPages[0], () => `id-${counter++}`, (src) => /^data:image\//i.test(src) ? { dataUrl: src, mimeType: "image/png", width: 100, height: 50 } : null);
for (const element of elements) ids.push(element.id);
assert.equal(new Set(ids).size, ids.length, "IDs eindeutig");
assert.ok(elements.some((element): element is TextElement => element.type === "text" && element.text === "Steigung berechnen"), "Text-Element übernommen");
assert.ok(!elements.some(element => element.type === "image"), "Bild ohne eingebettete Daten wird übersprungen, nicht defekt importiert");
const tableElement = elements.find((element): element is TextElement => element.type === "text" && !!element.table);
assert.ok(tableElement && tableElement.table!.cells[0][0] === "x", "Tabellenzellen übernommen");
console.log("onenote-transfer: Element-Übersetzung bestanden");

/* 5) MHT-Archiv mit eingebettetem PNG wird zerlegt. */
const png1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const mht = [
  "MIME-Version: 1.0", "Content-Type: multipart/related; boundary=\"----=_NextPart\"",
  "", "------=_NextPart", "Content-Type: text/html;", "Content-Transfer-Encoding: quoted-printable", "",
  "<html><body><h1>=DCberschrift</h1><p><img src=\"cid:grafik\"></p></body></html>",
  "------=_NextPart", "Content-Type: image/png", "Content-Transfer-Encoding: base64", "Content-Location: cid:grafik", "", png1x1,
  "------=_NextPart--", ""
].join("\r\n");
const archive = parseMhtArchive(mht);
assert.ok(archive.html.includes("berschrift"), "HTML-Teil dekodiert");
assert.ok((archive.images.get("cid:grafik") ?? "").startsWith("data:image/png;base64,"), "Bild als Data-URL eingebettet");
const archiveBlocks = extractOneNoteBlocks(archive.html);
const viaMht = blocksToPageElements(layoutOneNoteBlocks(archiveBlocks).pages[0], () => `mht-${counter++}`, (src) => archive.images.get(src) ? { dataUrl: archive.images.get(src)!, mimeType: "image/png", width: 1, height: 1 } : null);
assert.ok(viaMht.some(element => element.type === "image"), "MHT-Bild wird importiert");
console.log("onenote-transfer: MHT-Archiv bestanden");

/* 6) Export-HTML ist eigenständig und OneNote-lesbar. */
const html = buildOneNoteHtml([
  { title: "Testseite", inkDataUrl: `data:image/png;base64,${png1x1}`, blocks: [{ html: textElementToHtml({ text: "Zeile 1\nZeile 2", fontSize: 20, blockStyle: "body" }) }, { html: textElementToHtml({ text: "", fontSize: 20, table: { cells: [["a", "b"]] } }) }] },
  { title: "", blocks: [{ html: textElementToHtml({ text: "Ecke <x>", fontSize: 20, blockStyle: "heading-1" }) }] }
], "Titel & Test");
assert.ok(html.startsWith("<!DOCTYPE html>"), "valide HTML-Struktur");
assert.ok(html.includes("<h1>Testseite</h1>") && html.includes("data:image/png;base64,"), "Seitentitel und Tinte eingebettet");
assert.ok(html.includes("Zeile 1<br>Zeile 2"), "Zeilenumbrüche erhalten");
assert.ok(html.includes("<td>a</td>"), "Tabelle als HTML");
assert.ok(html.includes("Ecke &lt;x&gt;"), "HTML-Escaping verhindert Injektion");
assert.ok(html.includes("<h1>Seite 2</h1>"), "fehlender Titel fällt auf Seitennummer zurück");
assert.ok(!html.includes("<script"), "kein Skript im Export");
assert.ok(describeOneNoteLimits().includes("Bild"), "Grenzen-Hinweis nennt Bild-Verhalten");
console.log("onenote-transfer: Export-HTML und Round-Trip bestanden");

/* 7) Round-Trip: Exportiertes HTML wieder einlesbar. */
const roundTrip = extractOneNoteBlocks(buildOneNoteHtml([{ title: "RT", blocks: [{ html: textElementToHtml({ text: "Rundtrip", fontSize: 20, blockStyle: "body" }) }] }]));
assert.ok(roundTrip.some(block => block.kind === "body" && block.text === "Rundtrip"), "Export ist selbst wieder importierbar");
console.log("onenote-transfer: Round-Trip bestanden");
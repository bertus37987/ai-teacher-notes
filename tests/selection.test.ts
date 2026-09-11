import assert from "node:assert/strict";
import { HandwritingPage, PageElement, elementBounds } from "../src/document";
import { InkPoint, InkStroke } from "../src/strokes";
import { circleLassoGesture, duplicateElements, lassoSelection, rectangleSelection, scaleElements, scratchEraseGesture, scratchedElements, translateElements } from "../src/selection";

const point = (x: number, y: number): InkPoint => ({ x, y, pressure: 0.5 });

function fixturePage(): HandwritingPage {
  const stroke: PageElement = { type: "stroke", id: "s1", color: "#111", size: 3, points: [point(100, 100), point(120, 104), point(140, 108), point(160, 108)] };
  const shape: PageElement = { type: "shape", id: "sh1", kind: "rectangle", color: "#111", size: 3, closed: true, points: [point(200, 200), point(260, 200), point(260, 260), point(200, 260), point(200, 200)] };
  const text: PageElement = { type: "text", id: "t1", x: 300, baseline: 300, width: 100, fontSize: 16, color: "#111", text: "Hallo" };
  const image: PageElement = { type: "image", id: "i1", x: 400, y: 400, width: 100, height: 80, dataUrl: "data:image/png;base64,AA==", mimeType: "image/png", sourceName: "x.png" };
  const locked: PageElement = { type: "image", id: "i2", x: 50, y: 50, width: 40, height: 40, dataUrl: "data:image/png;base64,AA==", mimeType: "image/png", sourceName: "lock.png", locked: true };
  const highlight: PageElement = { type: "highlight", id: "h1", color: "#ff0", size: 10, opacity: 0.3, x1: 100, x2: 260, y: 60, points: [point(100, 60), point(180, 62), point(260, 60)] };
  return { id: "p", width: 800, height: 600, paper: "grid", elements: [stroke, shape, text, image, locked, highlight] };
}

async function main(): Promise<void> {
  /* Rechteck-Auswahl */
  {
    const page = fixturePage();
    const selected = rectangleSelection(page, { minX: 90, minY: 90, maxX: 270, maxY: 270 });
    const ids = selected.map((element) => element.id);
    assert.ok(ids.includes("s1") && ids.includes("sh1"), "Ink und Form unter dem Rahmen");
    assert.ok(!ids.includes("t1"), "Text außerhalb wird nicht getroffen");
    assert.ok(!ids.includes("i2"), "gesperrte Bilder sind nie auswählbar");
  }
  {
    const page = fixturePage();
    const selected = rectangleSelection(page, { minX: 290, minY: 270, maxX: 410, maxY: 310 });
    assert.ok(selected.some((element) => element.id === "t1"), "Text im Rahmen");
    const imageSelected = rectangleSelection(page, { minX: 390, minY: 390, maxX: 510, maxY: 490 });
    assert.ok(imageSelected.some((element) => element.id === "i1"), "Bild im Rahmen");
  }
  {
    const page = fixturePage();
    const partial = rectangleSelection(page, { minX: 330, minY: 330, maxX: 450, maxY: 450 });
    assert.ok(!partial.some((element) => element.id === "t1"), "Text nur noch teilweise erfasst ⇒ nicht ausgewählt");
    assert.ok(partial.some((element) => element.id === "i1"), "angetipptes Bild wird erfasst");
  }

  {
    const page = fixturePage();
    page.elements = [
      { type: "stroke", id: "cross", color: "#111", size: 2, points: [point(0, 100), point(200, 100)] },
      { type: "shape", id: "line", kind: "line", closed: false, color: "#111", size: 2, points: [point(100, 0), point(100, 200)] },
      { type: "stroke", id: "miss", color: "#111", size: 2, points: [point(0, 0), point(200, 60)] }
    ];
    assert.deepEqual(rectangleSelection(page, { minX: 90, minY: 90, maxX: 110, maxY: 110 }).map(e => e.id), ["cross", "line"], "Segmente kreuzen den Rahmen ohne innere Endpunkte");
    assert.deepEqual(rectangleSelection(page, { minX: 90, minY: 0, maxX: 110, maxY: 10 }).map(e => e.id), ["line"], "Bounding-Box allein reicht nicht");
  }

  /* Lasso */
  {
    const page = fixturePage();
    const circle: InkPoint[] = Array.from({ length: 48 }, (_, index) => {
      const angle = index / 48 * Math.PI * 2;
      return point(230 + Math.cos(angle) * 55, 230 + Math.sin(angle) * 55);
    });
    const selected = lassoSelection(page, [...circle, circle[0]]);
    const ids = selected.map((element) => element.id);
    assert.ok(ids.includes("sh1"), "Form im Lasso-Kreis");
    assert.ok(!ids.includes("s1"), "Ink außerhalb bleibt");
    assert.equal(lassoSelection(page, [point(230, 230)]).length, 0, "offener Pfad trifft nichts");
  }

  /* Verschieben */
  {
    const page = fixturePage();
    const [first, second] = page.elements;
    const boundsBefore = elementBounds(first);
    const translated = translateElements([first, second], 10, -5);
    const boundsAfter = elementBounds(translated[0]);
    assert.ok(Math.abs(boundsAfter.minX - (boundsBefore.minX + 10)) < 1e-6 && Math.abs(boundsAfter.minY - (boundsBefore.minY - 5)) < 1e-6, "Ink verschiebt sich");
    if (translated[0].type === "stroke") {
      assert.ok(translated[0].rawPoints === undefined || translated[0].rawPoints.length === 0 || translated[0].rawPoints[0].x === translated[0].points[0].x, "rawPoints ziehen mit Ink mit");
      assert.equal(translated[0].points[0].x, first.type === "stroke" ? first.points[0].x + 10 : NaN, "Punktverschiebung exakt");
    }
  }

  /* Skalieren um Anker */
  {
    const image: PageElement = { type: "image", id: "img", x: 100, y: 100, width: 100, height: 50, dataUrl: "data:image/png;base64,AA==", mimeType: "image/png", sourceName: "a.png" };
    const scaled = scaleElements([image], point(100, 150), 2, 2);
    assert.equal(scaled[0].type, "image");
    if (scaled[0].type === "image") {
      assert.ok(Math.abs(scaled[0].x - 100) < 1e-6, "Ankerkante bleibt");
      assert.equal(scaled[0].width, 200);
      assert.equal(scaled[0].height, 100);
    }
  }
  {
    const stroke: PageElement = { type: "stroke", id: "s", color: "#111", size: 3, points: [point(0, 0), point(10, 10)], rawPoints: [point(0, 0), point(10, 10)] };
    const scaled = scaleElements([stroke], point(0, 0), 3, 2);
    if (scaled[0].type === "stroke") {
      assert.equal(scaled[0].points[1].x, 30);
      assert.equal(scaled[0].points[1].y, 20);
      assert.equal((scaled[0].rawPoints ?? [])[1]?.x, 30, "Original-Punkte skalieren mit");
      assert.equal(scaled[0].size, 3, "Pinselstärke bleibt");
    }
  }

  /* Duplizieren */
  {
    const page = fixturePage();
    const duplicates = duplicateElements([page.elements[0]]);
    assert.equal(duplicates.length, 1);
    assert.notEqual(duplicates[0].id, page.elements[0].id, "frische IDs");
    if (duplicates[0].type === "stroke" && page.elements[0].type === "stroke") {
      assert.equal(duplicates[0].points[0].x, page.elements[0].points[0].x + 12, "Kopie liegt versetzt");
    }
  }

  {
    const legacy: PageElement = { type: "highlight", id: "legacy", x1: 10, x2: 40, y: 20, color: "#ff0", size: 12, opacity: 0.3 };
    const original = structuredClone(legacy);
    const [copy] = duplicateElements([legacy]);
    assert.equal(copy.type, "highlight");
    if (copy.type === "highlight") assert.deepEqual([copy.x1, copy.x2, copy.y], [22, 52, 32], "Legacy-Marker-Kopie ist ebenfalls versetzt");
    assert.notEqual(copy.id, legacy.id);
    assert.deepEqual(legacy, original, "Duplizieren verändert das Original nicht");
  }

  /* Circle-to-Lasso-Geste */
  {
    const page = fixturePage();
    const lasso = (radius: number, jitter: number): InkStroke => ({
      id: "g", color: "#111", size: 2,
      points: Array.from({ length: 60 }, (_, index) => {
        const angle = index / 60 * Math.PI * 2;
        return point(400 + Math.cos(angle) * radius + Math.sin(index * 2.17) * jitter / 2, 300 + Math.sin(angle) * radius + Math.cos(index * 1.73) * jitter / 2);
      })
    });
    assert.equal(circleLassoGesture(lasso(180, 12), page), true, "großer, runder Kreis ist eine Lasso-Geste");
    assert.equal(circleLassoGesture(lasso(20, 2), page), false, "ein kleines o ist niemals eine Lasso-Geste");
    const elongated: InkStroke = {
      id: "g", color: "#111", size: 2,
      points: Array.from({ length: 60 }, (_, index) => {
        const angle = index / 60 * Math.PI * 2;
        return point(400 + Math.cos(angle) * 260, 300 + Math.sin(angle) * 90);
      })
    };
    const square = [point(200, 200), point(400, 200), point(400, 400), point(200, 400), point(200, 200)];
    const squarePoints = square.slice(1).flatMap((end, side) => Array.from({ length: 20 }, (_, index) => point(square[side].x + (end.x - square[side].x) * index / 20, square[side].y + (end.y - square[side].y) * index / 20)));
    squarePoints.push(square[0]);
    assert.equal(circleLassoGesture({ id: "square", color: "#111", size: 2, points: squarePoints }, page), false, "Ein großes Quadrat bleibt eine Zeichnung, kein Kreis-Lasso");
    assert.equal(circleLassoGesture(elongated, page), false, "langgestrecktes Oval wird nicht gekapert");
  }

  /* Scribble-to-Erase-Geste */
  {
    let scratch: InkPoint[] = [];
    for (let index = 0; index < 30; index += 1) scratch.push(point(100 + (index % 2 === 0 ? -14 : 14) + index * 1.5, 200 + index * 1.2));
    assert.equal(scratchEraseGesture({ id: "s", color: "#111", size: 2, points: scratch }), true, "Zickzack-Gekritzel wird als Radier-Geste erkannt");
    const denseScratch = scratch.slice(1).flatMap((end, index) => Array.from({ length: 8 }, (_, step) => point(scratch[index].x + (end.x - scratch[index].x) * step / 8, scratch[index].y + (end.y - scratch[index].y) * step / 8)));
    denseScratch.push(scratch[scratch.length - 1]);
    assert.equal(scratchEraseGesture({ id: "dense", color: "#111", size: 2, points: denseScratch }), true, "Dicht abgetastete echte Zickzack-Geste bleibt gültig");
    const wave: InkPoint[] = Array.from({ length: 40 }, (_, index) => point(100 + index * 5, 200 + Math.sin(index * 0.3) * 8));
    const loops = Array.from({ length: 61 }, (_, index) => {
      const t = index / 60 * 6 * Math.PI;
      return point(100 + 10 * t / (2 * Math.PI) + 8 * Math.cos(t), 100 + 15 * Math.sin(t));
    });
    assert.equal(scratchEraseGesture({ id: "loops", color: "#111", size: 2, points: loops }), false, "Drei wandernde Schreibschleifen sind keine destruktive Kratzgeste");
    assert.equal(scratchEraseGesture({ id: "s", color: "#111", size: 2, points: wave }), false, "ruhige Welle ist keine Radier-Geste");
  }

  /* Kratz-Elemente */
  {
    const page = fixturePage();
    const scratch: InkStroke = { id: "g", color: "#111", size: 2, points: [point(96, 96), point(110, 100)] };
    const hit = scratchedElements(page, scratch);
    assert.ok(hit.some((element) => element.id === "s1"), "Ink unter dem Gekritzel");
    assert.ok(!hit.some((element) => element.type === "text" || element.type === "image"), "Text und Bilder werden nie weggekritzelt");
  }

  {
    const page = fixturePage();
    const ring = Array.from({ length: 65 }, (_, index) => point(200 + 100 * Math.cos(index / 64 * Math.PI * 2), 200 + 100 * Math.sin(index / 64 * Math.PI * 2)));
    page.elements = [
      { type: "stroke", id: "ring", color: "#111", size: 2, inkGeometry: "captured", points: ring, rawPoints: [point(200, 200)] },
      { type: "shape", id: "ellipse", kind: "ellipse", closed: true, color: "#111", size: 2, points: [point(100, 100), point(300, 300)] },
      { type: "shape", id: "rectangle", kind: "rectangle", closed: true, color: "#111", size: 2, points: [point(100, 100), point(300, 300)] },
      { type: "highlight", id: "marker", color: "#ff0", size: 10, opacity: 0.3, x1: 100, x2: 300, y: 100, points: [point(100, 300), point(100, 100), point(300, 100), point(300, 300)] }
    ];
    const before = structuredClone(page);
    const scratch: InkStroke = { id: "gesture", color: "#111", size: 2, points: [point(180, 190), point(220, 210)] };
    assert.deepEqual(scratchedElements(page, scratch), [], "Zentrales Gekritzel berührt weder Umrisse noch U-Marker oder rawPoints");
    const edge = { ...scratch, points: [point(280, 200), point(320, 200)] };
    assert.deepEqual(scratchedElements(page, edge).map(e => e.id), ["ring", "ellipse", "rectangle", "marker"], "Echte Segmentkreuzungen treffen alle Umrisse auch ohne nahe Endpunkte");
    assert.deepEqual(page, before, "Trefferprüfung lässt Geometrie und Rohpunkte unverändert");
    const legacy: PageElement = { type: "highlight", id: "legacy-hit", color: "#ff0", size: 30, opacity: 0.3, x1: 100, x2: 300, y: 200 };
    page.elements = [legacy];
    assert.deepEqual(scratchedElements(page, { ...scratch, points: [point(200, 218)] }).map(e => e.id), ["legacy-hit"], "Sichtbare Markerbreite und einzelne Kratzpunkte zählen");
    assert.deepEqual(scratchedElements(page, { ...scratch, points: [] }), [], "Leere Gesten treffen nichts");
  }

  {
    const page = fixturePage();
    const scratch: InkStroke = { id: "self", color: "#111", size: 2, points: [point(100, 100), point(120, 100)] };
    page.elements = [{ ...scratch, type: "stroke" }, { ...scratch, type: "stroke", id: "locked", locked: true }, { ...scratch, type: "stroke", id: "target" }];
    assert.deepEqual(scratchedElements(page, scratch).map(e => e.id), ["target"], "Geste selbst und gesperrte Tinte werden nie gelöscht");
    assert.deepEqual(rectangleSelection(page, { minX: 80, minY: 80, maxX: 140, maxY: 120 }).map(e => e.id), ["self", "target"], "Gesperrte Tinte ist nicht auswählbar");
    assert.deepEqual(lassoSelection(page, [point(80, 80), point(140, 80), point(140, 120), point(80, 120)]).map(e => e.id), ["self", "target"], "Lasso respektiert ebenfalls gesperrte Objekte");
  }

  {
    const page = fixturePage();
    page.elements = [{ type: "stroke", id: "smooth", color: "#111", size: 2, points: [point(0, 0), point(100, 0), point(100, 100)] }];
    const scratch: InkStroke = { id: "gesture", color: "#111", size: 2, points: [point(100, 0)] };
    assert.deepEqual(scratchedElements(page, scratch).map(e => e.id), [], "Nicht gerenderter Kontrollpunkt einer geglätteten Kurve ist kein Treffer");
    assert.deepEqual(scratchedElements(page, { ...scratch, points: [point(87.5, 25)] }).map(e => e.id), ["smooth"], "Die tatsächlich gerenderte quadratische Kurve wird getroffen");
    page.elements = [{ type: "highlight", id: "smooth-marker", color: "#ff0", size: 2, opacity: 0.3, x1: 0, x2: 100, y: 0, points: [point(0, 0), point(100, 0), point(100, 100)] }];
    assert.deepEqual(scratchedElements(page, scratch).map(e => e.id), [], "Marker-Kontrollpunkte werden nicht als sichtbare Tinte behandelt");
    assert.deepEqual(scratchedElements(page, { ...scratch, points: [point(75, 12.5)] }).map(e => e.id), ["smooth-marker"], "Gerenderte Marker-Kurve wird getroffen");
  }

  console.log("Phase 4: Auswahl, Gesten und Transformationen Vertragstests bestanden");
}

main().catch((error) => { console.error(error); process.exit(1); });
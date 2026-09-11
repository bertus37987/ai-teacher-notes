import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { optimizeShape, snapLineAngle, snapStrokeEndpoints } from "../src/shapes";
import { smoothInkLines, equalizeWordInk, closeOwnInkLoop } from "../src/handwriting-v2";
import { InkStroke, InkPoint } from "../src/strokes";
import { StrokeElement, elementBounds } from "../src/document";

/*
 * iPad-Parität (Nutzervorgabe 8.9.2026):
 *  - Kreis wird wirklich rund (auch ohne Halten, sobald annähernd rund),
 *  - Viereck wird eckig, kleine Formen erkannt, Halten forciert perfekt,
 *  - Endpunkt-/Winkel-Snap,
 *  - Schrift: sanft glätten (Ecken bleiben), Buchstaben entzerren (Unterkante bleibt),
 *    Oval-Lücken schließen (offene Bögen nie),
 *  - Phase 0: Schrift-Korrektur läuft NUR im Schreibmodus.
 */

// Deterministisches Zittern (Handschrift-Probe 10.9.2026): vorher lieferte
// Math.random() bei jedem Lauf andere Fixtures — "Halten erkennt das kleine
// Rechteck" kippte in ~1 von 20 Läufen ins Oval und machte die Suite
// unzuverlässig (belegt: 1 roter Lauf von 6). Gleiche Semantik, fester Seed.
let jitterSeed = 20260910;
const jitter = (r: number) => {
  jitterSeed = (jitterSeed * 1103515245 + 12345) % 2147483648;
  return (jitterSeed / 2147483648 - 0.5) * r;
};

function circlePoints(cx: number, cy: number, radius: number, count = 48, jit = 6): InkPoint[] {
  const points: InkPoint[] = [];
  for (let step = 0; step < count; step += 1) {
    const angle = step / count * Math.PI * 2;
    points.push({ x: cx + Math.cos(angle) * radius + jitter(jit), y: cy + Math.sin(angle) * radius + jitter(jit), pressure: 0.5 });
  }
  points[0] = { x: cx + radius, y: cy, pressure: 0.5 };
  points[points.length - 1] = { x: cx + radius - 0.5, y: cy + jitter(2), pressure: 0.5 };
  return points;
}

function stroke(id: string, points: InkPoint[]): StrokeElement {
  return { type: "stroke", id, color: "#111", size: 3, points };
}

async function main(): Promise<void> {
  /* ------------------------- Formen: wirklich rund/eckig ------------------------- */

  {
    // Fast runder Kreis wird OHNE Halten perfekt rund (Apple-Notes-Verhalten).
    const points = circlePoints(600, 400, 80, 48, 6);
    const optimized = optimizeShape(stroke("k", points), 0.7);
    assert.equal(optimized.kind, "ellipse");
    const box = elementBounds(stroke("k", optimized.stroke.points));
    const rx = (box.maxX - box.minX) / 2;
    const ry = (box.maxY - box.minY) / 2;
    assert.ok(Math.abs(rx - ry) < 0.5, `Kreisradien gleich: rx=${rx.toFixed(2)} ry=${ry.toFixed(2)}`);
  }

  {
    // Schief gezogener Oval-Kreis bleibt Oval (kein Aufzwingen von „rund“).
    const points: InkPoint[] = [];
    for (let step = 0; step < 48; step += 1) {
      const angle = step / 48 * Math.PI * 2;
      points.push({ x: 400 + Math.cos(angle) * 120, y: 400 + Math.sin(angle) * 55 + jitter(5), pressure: 0.5 });
    }
    points[0] = { x: 520, y: 400, pressure: 0.5 };
    points[points.length - 1] = { x: 518, y: 402, pressure: 0.5 };
    const optimized = optimizeShape(stroke("ov", points), 0.7);
    assert.equal(optimized.kind, "ellipse", "Oval bleibt Oval (kein Aufzwingen von rund)");
  }

  {
    // Schlampiges Viereck wird durch Halten (force) zum perfekten Rechteck.
    const points: InkPoint[] = [
      { x: 100, y: 100 }, { x: 115, y: 98 }, { x: 130, y: 101 },
      { x: 131, y: 130 }, { x: 129, y: 145 }, { x: 120, y: 144 },
      { x: 100, y: 143 }, { x: 98, y: 120 },
      // ±1,25 px ist über 100 Seeds stabil Viereck; ab ±1,5 px kippen einzelne
      // Seeds ins Oval (gemessen, Grenze steht im Audit) — das Fixture soll den
      // feinen Stift-Wobble prüfen, nicht die Mehrdeutigkeitsgrenze ausloten.
    ].map((point) => ({ ...point, pressure: 0.5, x: point.x + jitter(2.5), y: point.y + jitter(2.5) }));
    const forced = optimizeShape(stroke("r", points), 0.7, true);
    assert.equal(forced.kind, "rectangle", "Halten erkennt das kleine Rechteck");
    const box = elementBounds(stroke("r", forced.stroke.points));
    assert.ok(box.maxX - box.minX > 25 && box.maxY - box.minY > 25, "kleine Formen werden erkannt (GoodNotes-Schwäche vermieden)");
  }

  /* ------------------------- Snaps ------------------------- */

  {
    // Endpunkt-Snap: naher Endpunkt wird attrahieren, ferner bleibt.
    const raw: InkStroke = { id: "s1", color: "#111", size: 3, points: [{ x: 10, y: 10, pressure: 0.5 }, { x: 90, y: 50, pressure: 0.5 }] };
    const snapped = snapStrokeEndpoints(raw, [{ x: 93, y: 53 }], 14);
    assert.equal(snapped.points[snapped.points.length - 1].x, 93);
    assert.equal(snapped.points[snapped.points.length - 1].y, 53);
    const untouched = snapStrokeEndpoints(raw, [{ x: 200, y: 200 }], 14);
    assert.deepEqual(untouched.points, raw.points, "ferne Ziele ziehen nicht");
  }

  {
    // Winkel-Snap: 43° → 45°, Länge bleibt, 0° bleibt.
    const line: InkPoint[] = [
      { x: 0, y: 0, pressure: 0.5 },
      { x: Math.cos(43 * Math.PI / 180) * 100, y: Math.sin(43 * Math.PI / 180) * 100, pressure: 0.5 },
    ];
    const snapped = snapLineAngle(line);
    const angle = Math.atan2(snapped[1].y, snapped[1].x) * 180 / Math.PI;
    assert.ok(Math.abs(angle - 45) < 1e-6, `erwartet 45°, war ${angle}`);
    assert.ok(Math.abs(Math.hypot(snapped[1].x, snapped[1].y) - 100) < 1e-6, "Länge bleibt");
    const horizontal = snapLineAngle([{ x: 0, y: 0, pressure: 0.5 }, { x: 80, y: 0.3, pressure: 0.5 }]);
    assert.equal(Math.abs(horizontal[1].y) < 1e-6, true, "nahezu waagerecht bleibt waagerecht");
  }

  /* ------------------------- Schrift ------------------------- */

  {
    // Sanftes Applien: Zittern sinkt, Spitzen (W) bleiben exakt.
    const noisy: InkPoint[] = Array.from({ length: 40 }, (_, i) => ({ x: 100 + i * 3 + jitter(2), y: 200 + jitter(2), pressure: 0.5 }));
    const smoothed = smoothInkLines(noisy);
    const variance = (points: InkPoint[]) => points.slice(2, -2).reduce((sum, point) => sum + Math.abs(point.y - 200), 0) / (points.length - 4);
    assert.ok(variance(smoothed) < variance(noisy), "Glättung verringert das Zittern");
    const w: InkPoint[] = [{ x: 0, y: 60, pressure: 0.5 }, { x: 20, y: 100, pressure: 0.5 }, { x: 40, y: 60, pressure: 0.5 }];
    assert.deepEqual(smoothInkLines(w), w, "spitze W-Ecken bleiben unverändert");
  }

  {
    // Entzerren (Semantik 10.9.2026, Probe): Buchstaben DERSELBEN Höhenklasse
    // laufen behutsam zusammen (±12 %), Unterkanten bleiben, x unverändert.
    // Ein Aufsteiger (deutlich höhere Klasse, z. B. l/t/d) wird NICHT auf
    // Körpermaß gedrückt — vorher kippte der Median-Faktor ihn um 12 % nach unten
    // und in eigenen Wortgruppen sogar auf die volle Körperhöhe.
    const height = (points: InkPoint[]) => Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
    const slanted = (x0: number, x1: number, rise: number) => {
      const points: InkPoint[] = [];
      for (let x = x0; x <= x1; x += 4) points.push({ x: x + jitter(0.5), y: 160 - (x - x0) * (rise / (x1 - x0)) + jitter(0.5), pressure: 0.5 });
      return points;
    };
    const body20 = slanted(20, 60, 20);
    const body22 = slanted(100, 150, 22.4);
    const [body20Out, body22Out] = equalizeWordInk([body20, body22]);
    const beforeSpread = Math.abs(height(body20) - height(body22));
    const afterSpread = Math.abs(height(body20Out) - height(body22Out));
    assert.ok(afterSpread < beforeSpread, `Höhen genähert: ${beforeSpread.toFixed(1)} → ${afterSpread.toFixed(1)}`);
    assert.equal(Math.max(...body20Out.map((p) => p.y)), Math.max(...body20.map((p) => p.y)), "Unterkante der kleinen Gruppe bleibt");
    assert.ok(body20Out.every((point, index) => point.x === body20[index].x), "x-Positionen bleiben unverändert");
    // Grenze: kein Cluster wird um mehr als ±12 % skaliert (Unterkante fix ⇒ Höhenverhältnis = Faktor).
    const ratio = (original: InkPoint[], adjusted: InkPoint[]) => height(adjusted) / height(original);
    for (const [original, adjusted] of [[body20, body20Out], [body22, body22Out]] as const) {
      const factor = ratio(original, adjusted);
      assert.ok(factor >= 0.879 && factor <= 1.121, `Entzerr-Faktor im Rahmen ±12 %: ${factor.toFixed(3)}`);
    }
    // Aufsteiger: Faktor 1, Proportion zum Körper bleibt erhalten.
    const ascendant = slanted(180, 220, 60);
    const [keptBody, keptAscendant] = equalizeWordInk([body20, ascendant]);
    assert.equal(ratio(ascendant, keptAscendant), 1, `Aufsteiger bleibt unangetastet (Faktor ${ratio(ascendant, keptAscendant).toFixed(3)})`);
    assert.ok(ratio(body20, keptBody) <= 1.121, "Körperbuchstabe läuft höchstens bis zur ±12-%-Grenze");
  }

  {
    // Schleifen-Schließen: größere Lücke im fast vollständigen Oval wird geschlossen,
    // ein offener Bogen (c) bleibt offen.
    const oval: InkPoint[] = [];
    for (let step = 0; step < 40; step += 1) {
      const angle = 0.15 + (Math.PI * 2 - 0.5) * step / 39;
      oval.push({ x: 200 + Math.cos(angle) * 25, y: 200 + Math.sin(angle) * 18, pressure: 0.5 });
    }
    const ovalGap = Math.hypot(oval[0].x - oval[oval.length - 1].x, oval[0].y - oval[oval.length - 1].y);
    assert.ok(ovalGap > 7, `Testfall hat eine spürbare Lücke (${ovalGap.toFixed(1)} px)`);
    const closed = closeOwnInkLoop(oval);
    assert.equal(closed.length, oval.length + 5, "Oval-Lücke wird mit kurzem Bogen geschlossen (kein flacher Chord)");
    assert.deepEqual(closed.slice(0, -5), oval, "Original-Kontur bleibt identisch, nur Brücke kommt dazu");

    const cArc: InkPoint[] = [];
    for (let step = 0; step < 40; step += 1) {
      const angle = 0.1 + Math.PI * 1.2 * step / 39;
      cArc.push({ x: 300 + Math.cos(angle) * 25, y: 260 + Math.sin(angle) * 25, pressure: 0.5 });
    }
    assert.equal(closeOwnInkLoop(cArc).length, cArc.length, "offener Bogen (c) wird nie geschlossen");
  }

  {
    // Nutzerauftrag 10.9.2026 („Ovale werden nicht geschlossen"): Ein normal
    // geschriebenes „o" hat 15–30 % Lücke. Die alte Schwelle ≥ 1,84π verlangte einen
    // fast vollständigen Kreis — genau deshalb blieben diese Ovale offen.
    const handOval = (rx: number, ry: number, gapFraction: number, count = 22): InkPoint[] =>
      Array.from({ length: count }, (_, step) => {
        const angle = 0.6 + Math.PI * 2 * (1 - gapFraction) * step / (count - 1);
        return {
          x: 100 + Math.cos(angle) * rx + Math.sin(step * 2.7) * 0.8,
          y: 100 + Math.sin(angle) * ry + Math.cos(step * 1.9) * 0.8,
          pressure: 0.4,
          time: step * 9
        };
      });
    for (const [rx, ry, gap] of [[9, 7, 0.1], [9, 7, 0.2], [9, 7, 0.3], [14, 11, 0.3], [20, 16, 0.3]] as const) {
      const drawn = handOval(rx, ry, gap);
      const closed = closeOwnInkLoop(drawn);
      assert.equal(closed.length, drawn.length + 5, `Oval ${rx}x${ry} mit ${Math.round(gap * 100)} % Lücke wird geschlossen`);
      assert.deepEqual(closed.slice(0, -5), drawn, "geschlossenes Oval lässt die Original-Kontur unangetastet");
      assert.equal(closed.at(-1)!.x, drawn[0].x, "Brücke endet exakt am Startpunkt (x)");
      assert.equal(closed.at(-1)!.y, drawn[0].y, "Brücke endet exakt am Startpunkt (y)");
    }

    // Offene Formen bleiben offen: Kreisbogen-Kosinus ist −sin θ, also klar negativ.
    const arc = (radius: number, from: number, span: number, count = 20): InkPoint[] =>
      Array.from({ length: count }, (_, step) => {
        const angle = from + span * step / (count - 1);
        return {
          x: 100 + Math.cos(angle) * radius + Math.sin(step * 2.1) * 0.5,
          y: 100 + Math.sin(angle) * radius + Math.cos(step * 1.6) * 0.5,
          pressure: 0.4,
          time: step * 9
        };
      });
    assert.equal(closeOwnInkLoop(arc(20, -1.2, 2.36)).length, 20, "c-Bogen wird nicht geschlossen");
    assert.equal(closeOwnInkLoop(arc(18, 0.9, 1.4)).length, 20, "u-Bogen wird nicht geschlossen");
    assert.equal(closeOwnInkLoop(arc(60, -0.5, 1.2)).length, 20, "flacher Bogen wird nicht geschlossen");
    const straight: InkPoint[] = Array.from({ length: 20 }, (_, step) => ({ x: 100 + step * 4, y: 100 + step * 2, pressure: 0.4, time: step * 9 }));
    assert.equal(closeOwnInkLoop(straight).length, 20, "Gerade wird nicht geschlossen");
    const letterStem: InkPoint[] = Array.from({ length: 18 }, (_, step) => ({ x: 100 + Math.sin(step) * 0.5, y: 100 + step * 3, pressure: 0.4, time: step * 9 }));
    assert.equal(closeOwnInkLoop(letterStem).length, 18, "Buchstaben-Stamm wird nicht geschlossen");
  }

  {
    // Nutzerwunsch 10.9.2026 („Ovale gehen, sollte aber ein Kreis sein — support für
    // Viereck und Oval"): Gehalten liefern die drei Grundformen ihr perfektes Gegenstück.
    const heldEllipse = (rx: number, ry: number, count = 30, gap = 0.12): InkPoint[] =>
      Array.from({ length: count }, (_, step) => {
        const angle = Math.PI * 2 * (1 - gap) * step / (count - 1);
        return {
          x: 100 + Math.cos(angle) * rx + Math.sin(step * 2.7) * 0.9,
          y: 100 + Math.sin(angle) * ry + Math.cos(step * 1.9) * 0.9,
          pressure: 0.4,
          time: step * 8
        };
      });
    const round = optimizeShape(stroke("kreis", heldEllipse(60, 59)), 0.6, true);
    assert.equal(round.kind, "ellipse", "gehaltener Kreis wird rund");
    const roundBox = elementBounds(stroke("kreis", round.stroke.points));
    assert.ok(Math.abs((roundBox.maxX - roundBox.minX) - (roundBox.maxY - roundBox.minY)) < 1.5,
      `gehaltener Kreis ist ein Kreis: ${(roundBox.maxX - roundBox.minX).toFixed(1)}x${(roundBox.maxY - roundBox.minY).toFixed(1)}`);

    const oblong = optimizeShape(stroke("oval", heldEllipse(70, 45)), 0.6, true);
    assert.equal(oblong.kind, "ellipse", "gehaltenes Oval wird rund geschlossen");
    const oblongBox = elementBounds(stroke("oval", oblong.stroke.points));
    assert.ok((oblongBox.maxX - oblongBox.minX) - (oblongBox.maxY - oblongBox.minY) > 20,
      "deutlich gezogenes Oval bleibt Oval (kein Kreis aufgezwungen)");
  }

  {
    // Phase 0 (Quelltest): Schrift-Korrektur ist strikt an den Schreibmodus gebunden.
    const main = readFileSync("src/main.ts", "utf8");
    const pointerUp = main.slice(main.indexOf("private pointerUp"), main.indexOf("private convertAutomaticShape"));
    assert.match(pointerUp, /queueWordStroke\(pageId,element\.id\)/s);
    assert.match(pointerUp, /this\.handwritingMode\)\s+this\.queueWordStroke|beautifyEnabled && this\.handwritingMode/s, "Zeichen-Modus-Striche erreichen die Schrift-Korrektur nur im Schreibmodus");
  }

  console.log("iPad-Parität: Formen rund/eckig, Draw&Hold, Snaps, Schrift-Phase-3 Vertragstests bestanden");
}

main().catch((error) => { console.error(error); process.exit(1); });
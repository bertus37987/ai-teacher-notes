/**
 * Scribble-to-Erase darf NUR Kritzelei erkennen, niemals Schrift.
 *
 * Nutzerbefund 13.9.2026 (iPad): „es verschwindet text manchmal". Ursache gefunden und gemessen:
 * schon DREI Schreibschrift-Buchstaben mit Schleifen („lll") erreichten Tortuosität, Flips und
 * Reversals eines Kritzelzugs — die Geste feuerte und löschte die Tinte darunter. Die Einstellung
 * ist standardmäßig AN (`scratchErase: true`), der Fehler traf also jeden Schreibschrift-Schreiber.
 *
 * Trennmass ist die RÜCKLAUF-Bewegung (Σ|dx| / x-Spanne): Schrift wandert vorwärts, Kritzelei
 * fährt dieselbe Spanne viele Male zurück. Gemessen an 12 Proben: Schrift 1,00–2,49 · Kritzelei
 * 10,93–11,38 — Schwelle 4 liegt mit Faktor ~1,6 bzw. ~2,7 dazwischen.
 *
 * Beide Richtungen sind Pflicht: Schrift darf nie löschen, echte Kritzelei muss weiter löschen.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backAndForthRatio, scratchEraseGesture } from "../src/selection";
import { InkStroke } from "../src/strokes";

type Point = { x: number; y: number; pressure: number; tilt: number; time: number };
const point = (x: number, y: number): Point => ({ x, y, pressure: 0.5, tilt: 0, time: 0 });
const stroke = (points: Point[]): InkStroke => ({ id: "probe", color: "#111", size: 2, points });

/** Polylinie mit ~4 px Abstand abtasten — so dicht liefert ein echter Stift. */
function polyline(corners: Array<[number, number]>, step = 4): InkStroke {
  const points: Point[] = [];
  for (let i = 1; i < corners.length; i += 1) {
    const [x0, y0] = corners[i - 1];
    const [x1, y1] = corners[i];
    const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let s = 0; s < steps; s += 1) points.push(point(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps));
  }
  const last = corners[corners.length - 1];
  points.push(point(last[0], last[1]));
  return stroke(points);
}

/** Schreibschrift mit Schleifen (rückläufige Bewegung) — die Klasse, die fälschlich löschte. */
function cursiveLoops(letters: number, width: number, height: number, radius: number): InkStroke {
  const points: Point[] = [];
  let x = 0;
  points.push(point(x, 0));
  for (let i = 0; i < letters; i += 1) {
    for (let s = 1; s <= 6; s += 1) points.push(point(x + (width * s) / 6, (-height * s) / 6));
    const cx = x + width + radius;
    for (let a = 180; a <= 540; a += 30) points.push(point(cx + radius * Math.cos((a * Math.PI) / 180), -height + radius * Math.sin((a * Math.PI) / 180)));
    for (let s = 1; s <= 6; s += 1) points.push(point(cx + (width * s) / 6, -height + (height * s) / 6));
    x = cx + width;
  }
  return stroke(points);
}

/** Glatte Schreibschrift-Huckel ohne Schleife. */
function cursiveHumps(count: number, width: number, height: number): InkStroke {
  const points: Point[] = [];
  const stepX = width / (count * 12);
  for (let x = 0; x <= width; x += stepX) points.push(point(x, -Math.abs(Math.sin((x / width) * count * Math.PI)) * height));
  return stroke(points);
}

// --- Schrift: darf NIE löschen ------------------------------------------------------------
const schrift: Array<[string, InkStroke]> = [
  ["Schleifen l", cursiveLoops(1, 10, 30, 6)],
  ["Schleifen ll", cursiveLoops(2, 10, 30, 6)],
  ["Schleifen lll", cursiveLoops(3, 10, 30, 6)],
  ["Schleifen llll", cursiveLoops(4, 10, 30, 6)],
  ["Schleifen lll eng", cursiveLoops(3, 8, 26, 5)],
  ["Schleifen llllll", cursiveLoops(6, 9, 28, 5)],
  ["Huckel 4", cursiveHumps(4, 100, 30)],
  ["Huckel 8", cursiveHumps(8, 120, 34)],
  ["Print WWWW", polyline([[0, 0], [6.25, 30], [12.5, 0], [18.75, 30], [25, 0], [31.25, 30], [37.5, 0], [43.75, 30], [50, 0], [56.25, 30], [62.5, 0], [68.75, 30], [75, 0], [81.25, 30], [87.5, 0], [93.75, 30], [100, 0]])],
  ["Print zz", polyline([[0, 0], [25, 0], [3, 28], [28, 28], [31, 0], [56, 0], [34, 28], [59, 28]])],
  ["Print NN", polyline([[0, 30], [0, 0], [20, 30], [20, 0], [20, 30], [40, 0], [40, 30]])],
];
for (const [name, s] of schrift) {
  assert.equal(scratchEraseGesture(s), false, `"${name}" ist Schrift und darf nicht als Wegkritzeln gelten`);
}

// --- Kritzelei: MUSS weiter löschen (sonst wäre die Absicherung eine Funktionsentfernung) ---
const kritzelei: Array<[string, InkStroke]> = [
  // Der bestehende Vertrag aus tests/selection.test.ts: ein EINZELNER hektischer Zickzack-Zug.
  ["Zickzack einzeln", stroke(Array.from({ length: 30 }, (_, i) => point(100 + (i % 2 === 0 ? -14 : 14) + i * 1.5, 200 + i * 1.2)))],
  ["Saegezahn", polyline(Array.from({ length: 12 }, (_, i) => [i % 2 ? 6 : 54, (i * 3.2) % 40] as [number, number]))],
  ["Wirbel", polyline(Array.from({ length: 40 }, (_, i) => [30 + 26 * Math.cos(i * 0.9), 20 + 18 * Math.sin(i * 1.3)] as [number, number]), 3)],
];
for (const [name, s] of kritzelei) {
  assert.equal(scratchEraseGesture(s), true, `Kritzelei "${name}" muss weiterhin als Wegkritzeln gelten`);
}

// --- Das Trennmaß selbst: die Schwelle liegt messbar zwischen beiden Klassen ----------------
const schriftWerte = schrift.map(([, s]) => backAndForthRatio(s.points));
const kritzelWerte = kritzelei.map(([, s]) => backAndForthRatio(s.points));
const maxSchrift = Math.max(...schriftWerte);
const minKritzel = Math.min(...kritzelWerte);
assert.ok(maxSchrift < 4, `Schrift bleibt unter der Schwelle (max ${maxSchrift.toFixed(2)})`);
assert.ok(minKritzel > 4, `Kritzelei liegt über der Schwelle (min ${minKritzel.toFixed(2)})`);
assert.ok(minKritzel > maxSchrift * 2, `die Klassen sind deutlich getrennt (${minKritzel.toFixed(2)} vs ${maxSchrift.toFixed(2)})`);

// --- Quelltext-Vertrag: die Sperre darf nicht wieder verschwinden ----------------------------
const quelle = readFileSync(`${process.cwd()}/src/selection.ts`, "utf8");
assert.ok(quelle.includes("backAndForthRatio"), "scratchEraseGesture prüft die Rücklauf-Bewegung");

console.log(`Scribble-Schutz: ${schrift.length + kritzelei.length + 4} Fälle bestanden (Schrift max ${maxSchrift.toFixed(2)}, Kritzelei min ${minKritzel.toFixed(2)})`);

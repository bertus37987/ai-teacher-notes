// TEMPORÄR: Können Kreis-Lasso oder Halten-Snap normale Schrift kapern?
// Lasso wäre doppelt schlimm: der Strich wird zur Auswahl UND das Werkzeug schaltet auf "select"
// — der Stift zeichnet danach nicht mehr („reagiert nicht mehr").
import { circleLassoGesture } from "./src/selection";
import { optimizeShape } from "./src/shapes";
import { A4_WIDTH, createPage } from "./src/document";
import { InkStroke } from "./src/strokes";

type P = { x: number; y: number; pressure: number; tilt: number; time: number };
const pt = (x: number, y: number): P => ({ x, y, pressure: 0.5, tilt: 0, time: 0 });
const stroke = (points: P[]): InkStroke => ({ id: "p", color: "#111", size: 2, points });

/** Geschlossene Schleife (Buchstabe „O"/„a") — cx/cy = Mittelpunkt, rx/ry = Radien. */
function loop(cx: number, cy: number, rx: number, ry: number, turns = 1, start = 0): InkStroke {
  const points: P[] = [];
  const total = Math.max(24, Math.round((turns * 2 * Math.PI * Math.max(rx, ry)) / 3));
  for (let i = 0; i <= total; i += 1) {
    const a = start + (i / total) * turns * 2 * Math.PI;
    points.push(pt(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
  }
  return stroke(points);
}

/** Handgezeichneter großer Kreis (Kontrolle: MUSS als Lasso gelten). */
function handCircle(cx: number, cy: number, r: number): InkStroke {
  const points: P[] = [];
  const total = Math.round((2 * Math.PI * r) / 4);
  for (let i = 0; i <= total; i += 1) {
    const a = (i / total) * 2 * Math.PI;
    const jitter = 1 + 0.04 * Math.sin(a * 5) + 0.03 * Math.cos(a * 7); // Handzittern
    points.push(pt(cx + r * Math.cos(a) * jitter, cy + r * Math.sin(a) * jitter));
  }
  return stroke(points);
}

const page = createPage("blank");
console.log(`Seite: ${page.width} x ${page.height}  (Lasso-Schwelle = 30 % der kleineren Seite = ${Math.round(Math.min(page.width, page.height) * 0.3)} px Diagonalen)`);
console.log("A4_WIDTH:", A4_WIDTH);

const faelle: Array<[string, InkStroke]> = [
  ["Grossbuchstabe O (40x50)", loop(200, 300, 20, 25)],
  ["Grossbuchstabe O (60x70)", loop(200, 300, 30, 35)],
  ["Sehr grosses O (90x110)", loop(200, 300, 45, 55)],
  ["Riesiges O (170x200)", loop(300, 400, 85, 100)],
  ["Kreis-Lasso gezeichnet r=200", handCircle(400, 500, 200)],
  ["Kreis-Lasso gezeichnet r=120", handCircle(400, 500, 120)],
  ["Kreis-Lasso gezeichnet r=60", handCircle(400, 500, 60)],
];
console.log("\nName".padEnd(32), "n".padStart(4), "  Lasso?", "  Form(force=halten)");
for (const [name, s] of faelle) {
  const lasso = circleLassoGesture(s, page);
  const shape = optimizeShape(s, 0.7, true);
  console.log(name.padEnd(32), String(s.points.length).padStart(4), (lasso ? "  JA -> Auswahl + Werkzeugwechsel" : "  nein").padEnd(34), shape.kind ?? "-");
}

// Schreibmodus-Wächter: HOLD_SNAP_MIN_WRITING = 34 px kleinere Seite
console.log("\nWächter im Schreibmodus (Halten): Buchstabe schnappt zur Form, wenn beide Seiten >= 34 px");
for (const [name, s] of faelle.slice(0, 4)) {
  const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const kind = optimizeShape(s, 0.7, true).kind;
  console.log(`  ${name.padEnd(26)} ${Math.round(w)}x${Math.round(h)} -> Wächter ${Math.min(w, h) < 34 ? "greift (bleibt Schrift)" : "greift NICHT"} · Form: ${kind ?? "keine"}`);
}

/**
 * „Buchstaben schützen" muss Buchstaben schützen.
 *
 * Der Schalter ist standardmäßig an (`handwritingMode = true`, Etikett „Buchstaben schützen"),
 * und `shapeHoldSnap` ebenfalls. Die Grenze für den Halte-Snap lag aber fest bei 34 px, während
 * die Schreibhöhe des Plugins 48 px (Karo), 32 px (Linien) bzw. 36 px (beautifySize) beträgt —
 * Buchstaben sind also größer als die Grenze. Gemessen 13.9.2026: ein gehaltenes Kapitel-„O"
 * von 40×50 px wurde zur perfekten Ellipse, also zu etwas anderem als dem Geschriebenen.
 *
 * Seitdem kommt die Grenze aus der eingestellten Schreibhöhe.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allowHoldSnap, holdSnapMinSide, paperWritingLayout } from "../src/handwriting-layout";

// 1. Grenze über der Buchstabengröße — für jede Papier-Einstellung.
const karo = paperWritingLayout("grid", { beautifyPaperSize: true, beautifySize: 36, gridWritingHeight: 2, lineWritingHeight: 1 });
const linien = paperWritingLayout("lines", { beautifyPaperSize: true, beautifySize: 36, gridWritingHeight: 2, lineWritingHeight: 1 });
const blank = paperWritingLayout("blank", { beautifyPaperSize: true, beautifySize: 36, gridWritingHeight: 2, lineWritingHeight: 1 });
assert.equal(karo.height, 48, "Karo: Schreibhöhe 2 x 24");
assert.equal(linien.height, 32, "Linien: Schreibhöhe 1 x 32");
assert.equal(blank.height, 36, "Blank: beautifySize");
for (const height of [karo.height, linien.height, blank.height]) {
  assert.ok(holdSnapMinSide(height) > height, `Grenze (${holdSnapMinSide(height)}) liegt über der Schreibhöhe (${height})`);
}
assert.equal(holdSnapMinSide(10), 34, "Untergrenze bleibt 34 px für sehr kleine Schreibhöhen");

// 2. Buchstaben und Ziffern dürfen beim Halten NIE zur Form werden.
const buchstaben: Array<[string, number, number]> = [
  ["Kapitel-O", 40, 50], ["Kapitel-O groß", 48, 48], ["runde Ziffer 8", 44, 60], ["kleines o", 16, 24],
];
const papiere: Array<[string, number]> = [["Karo", karo.height], ["Linien", linien.height], ["Blank", blank.height]];
for (const [name, width, height] of buchstaben) {
  for (const [papier, writingHeight] of papiere) {
    assert.equal(
      allowHoldSnap({ force: true, handwritingMode: true, width, height, writingHeight }),
      false,
      `"${name}" (${width}x${height}) darf auf ${papier} nicht zur Form werden`
    );
  }
}

// 3. Bewusst gezeichnete Formen rasten weiterhin ein — sonst wäre das eine Funktionsentfernung.
for (const [name, width, height] of [["Kreis", 120, 120], ["großer Kreis", 170, 200], ["Rechteck", 200, 140]] as Array<[string, number, number]>) {
  assert.equal(allowHoldSnap({ force: true, handwritingMode: true, width, height, writingHeight: karo.height }), true, `"${name}" muss weiter einrasten`);
}

// 4. Zeichnen ohne Halten und der Zeichenmodus bleiben unberührt.
assert.equal(allowHoldSnap({ force: false, handwritingMode: true, width: 20, height: 20, writingHeight: karo.height }), true, "Ziehen ohne Halten ist nicht betroffen");
assert.equal(allowHoldSnap({ force: true, handwritingMode: false, width: 20, height: 20, writingHeight: karo.height }), true, "Zeichenmodus ist nicht betroffen");

// 5. Quelltext-Vertrag: der Editor benutzt die neue Grenze, die feste 34-px-Regel ist weg.
const main = readFileSync(`${process.cwd()}/src/main.ts`, "utf8");
assert.ok(main.includes("allowHoldSnap("), "convertAutomaticShape prüft über allowHoldSnap");
assert.ok(main.includes("paperWritingLayout(page.paper"), "die Grenze kommt aus der eingestellten Schreibhöhe");
assert.ok(!main.includes("HOLD_SNAP_MIN_WRITING"), "die feste 34-px-Grenze ist entfernt");

console.log(`Halte-Snap-Schutz: ${buchstaben.length * 3 + 3 + 2 + 3} Fälle bestanden (Grenzen: Karo ${holdSnapMinSide(karo.height)} / Linien ${holdSnapMinSide(linien.height)} / Blank ${holdSnapMinSide(blank.height)})`);

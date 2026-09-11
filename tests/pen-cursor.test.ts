import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { penCursorActive, isPenInput, PEN_HOVER_GRACE_MS } from "../src/input-device";

/*
 * Nutzerbefund 10.9.2026: Beim Arbeiten mit dem Touchpad wurde der Mauszeiger als
 * Stift-Icon angezeigt, weil ein in der Hand gehaltener (nur schwebender) Stift
 * pointerType="pen"-Events sendet und damit den Stiftmodus dauerhaft anschaltete.
 * Regel: das zuletzt benutzte Gerät gewinnt, Kontakt hat immer Vorrang.
 */
assert.equal(penCursorActive(true, false, 0), false, "schwebender Stift direkt nach Touchpad-Nutzung lässt den Mauszeiger in Ruhe");
assert.equal(penCursorActive(true, false, PEN_HOVER_GRACE_MS - 1), false, "kurz vor Ablauf der Ruhephase noch kein Stiftmodus");
assert.equal(penCursorActive(true, false, PEN_HOVER_GRACE_MS + 1), true, "nach der Ruhephase übernimmt der schwebende Stift");
assert.equal(penCursorActive(true, false, Number.POSITIVE_INFINITY), true, "ohne Mausaktivität ist der Stift sofort im Stiftmodus");
assert.equal(penCursorActive(true, true, 0), true, "Stiftkontakt schlägt das Touchpad sofort");
assert.equal(penCursorActive(false, true, 0), false, "Maus/Touchpad ist kein Stift");
assert.equal(penCursorActive(false, false, Number.POSITIVE_INFINITY), false, "Maus bleibt Maus");

/*
 * Nutzerbefund 11.9.2026 (Kern des offenen Cursor-Problems): „das Programm erkennt
 * meinen Yoga-Stift nicht richtig". Manche Yoga-/Wacom-Treiber melden den Stift als
 * pointerType="mouse" — dann greift KEINE Stift-Logik, und man sieht beim Schreiben
 * den normalen Maus-Cursor, während umgekehrt mit der Maus das Stiftkreuz erscheint.
 * Deshalb wird zusätzlich über Druck und Neigung erkannt (Mäuse können beides nicht).
 */
assert.equal(isPenInput({ pointerType: "pen", pressure: 0 }), true, "pointerType=pen ist immer ein Stift");
assert.equal(isPenInput({ pointerType: "touch", pressure: 0.5 }), false, "Finger ist kein Stift");
assert.equal(isPenInput({ pointerType: "mouse", pressure: 0, tiltX: 0, tiltY: 0 }), false, "echte Maus bleibt Maus");
assert.equal(isPenInput({ pointerType: "mouse", pressure: 0.42, tiltX: 0, tiltY: 0 }), true, "echter Druck verrät den als Maus gemeldeten Stift");
assert.equal(isPenInput({ pointerType: "mouse", pressure: 0, tiltX: -30, tiltY: 12 }), true, "Neigung verrät den als Maus gemeldeten Stift");
assert.equal(isPenInput({ pointerType: "mouse", pressure: 0.5, tiltX: 0, tiltY: 0 }), false, "gedrückte Maustaste (Druck 0.5) ist kein Stift");
// Fallback-Schalter: wenn der Treiber den Stift völlig ununterscheidbar als Maus meldet.
assert.equal(isPenInput({ pointerType: "mouse", pressure: 0, tiltX: 0, tiltY: 0 }, true), true, "Fallback-Schalter behandelt jeden Nicht-Touch-Zeiger als Stift");

// Vertrag: der Editor benutzt genau diese Heuristik — sonst kehrt der Fehler zurück.
const main = readFileSync("src/main.ts", "utf8");
const start = main.indexOf("private updateReticle(event: PointerEvent)");
const reticle = main.slice(start, main.indexOf("private rebuildPages", start));
assert.ok(start > 0 && reticle.length > 0, "updateReticle gefunden");
assert.ok(reticle.includes("penCursorActive(") && reticle.includes("lastMouseActivityTs"), "updateReticle nutzt die Geräte-Heuristik");
assert.ok(reticle.includes("isPenInput(event"), "updateReticle erkennt den Stift auch als gemeldete Maus");
assert.ok(reticle.includes("penForceMode"), "Fallback-Schalter ist verdrahtet");
assert.ok(!reticle.includes('toggleClass("is-pen-hover", event.pointerType === "pen")'), "alte Direktschaltung darf nicht zurückkehren");
// Der Schreibpfad muss den Druck ebenso erkennen, sonst schreibt der Stift ohne Druck/Neigung.
assert.ok(main.includes("const isPen = isPenInput(event, this.plugin.settings.penForceMode)"), "toPoint nutzt die robuste Erkennung");
// Diagnose muss erreichbar sein — ohne Messung bleibt die Ursache Raten.
assert.ok(main.includes("describePenDiagnostic(") && main.includes("pen-diagnostic"), "Stift-Diagnose ist eingebaut und als Befehl erreichbar");
// Die Diagnose zeigt die echte Plugin-Version aus dem Manifest statt einer eigenen
// Build-Marke — so kann sie nicht mehr von der installierten Fassung abweichen (Audit N-01).
assert.ok(main.includes("this.manifest.version"), "Diagnose zeigt die installierte Fassung (Manifest-Version)");
// Stiftpunkt muss das Fadenkreuz zeigen (gleiche Bildsprache wie der native Maus-Cursor)
// und über pointerrawupdate nachgeführt werden — sonst hängt er hinter der Tinte her.
const css = readFileSync("styles.css", "utf8");
assert.ok(css.includes(".hp-pen-reticle::before") && css.includes(".hp-pen-reticle::after"), "Stiftpunkt hat Fadenkreuz (Kreuz wie der Maus-Cursor)");
assert.ok(main.includes('addEventListener("pointerrawupdate"'), "Stiftpunkt wird über pointerrawupdate nachgeführt");
assert.ok(main.includes("getCoalescedEvents"), "frischeste Zwischenprobe des Stifts wird benutzt");
// Der Systemzeiger bleibt im Stiftmodus sichtbar, weil der Yoga-Stift ihn nicht bewegt —
// er wird deshalb global ausgeblendet (Nutzerbefund: „der Cursor ist trotzdem noch da").
assert.ok(main.includes("hp-pen-active") && main.includes("ownerDocument"), "Stiftmodus blendet den Systemzeiger global aus");
assert.ok(css.includes("body.hp-pen-active"), "CSS blendet den Systemzeiger im Stiftmodus überall aus");
assert.ok(css.includes("width: 13px;") && css.includes("height: 13px;"), "Fadenkreuz ist auf 13 px verkleinert");

console.log("Pen-cursor tests passed (mouse-reported pen detected via pressure/tilt, hover defers to touchpad, contact wins, forced fallback, diagnostic reachable, crosshair + raw updates)");

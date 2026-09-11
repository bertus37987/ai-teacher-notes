/**
 * Eingabegerät-Erkennung für den Editor.
 *
 * Warum es das gibt: `pointerType === "pen"` allein ist auf Linux/Electron nicht
 * verlässlich. Manche Yoga-/Wacom-Treiber melden den Stift als `"mouse"` — dann
 * greift keine Stift-Logik, und der Nutzer sieht beim Schreiben den Maus-Cursor
 * (Nutzerbefund 11.9.2026: „das Programm erkennt meinen Yoga-Stift nicht richtig").
 *
 * Unterscheidung ohne pointerType: Eine Maus kann NICHT neigen und liefert keinen
 * echten Druck. Ein Stift schon — auch schwebend meldet er tiltX/tiltY.
 */

/** Merkmale eines Zeigerereignisses, die zur Erkennung nötig sind. */
export interface PointerSignature {
  pointerType: string;
  pressure: number;
  tiltX?: number;
  tiltY?: number;
  buttons?: number;
}

/**
 * Verrät sich dieser Zeiger durch Druck oder Neigung als Stift?
 * Eine Maus kann WEDER neigen NOCH echten Druck liefern (sie meldet exakt 0 oder,
 * bei gedrückter Taste, exakt 0.5). Ein Finger meldet ebenfalls 0.
 */
function penTraits(event: PointerSignature): boolean {
  const tilt = Math.abs(event.tiltX ?? 0) + Math.abs(event.tiltY ?? 0);
  if (tilt > 0) return true;
  const pressure = event.pressure ?? 0;
  return pressure > 0 && Math.abs(pressure - 0.5) > 0.001;
}

/**
 * Ist das ein Stift? Deckt alle Fehletikettierungen ab, die auf Linux auftreten:
 *   • korrekt: pointerType = "pen"
 *   • als Maus gemeldet (häufig unter Wayland/Electron) → über Druck/Neigung erkannt
 *   • als Finger gemeldet → über Druck/Neigung erkannt (Finger meldet beides nicht)
 * Der Schalter `force` behandelt zusätzlich JEDEN Maus-Zeiger als Stift, für Treiber,
 * die den Stift völlig ununterscheidbar melden.
 */
export function isPenInput(event: PointerSignature, force = false): boolean {
  if (event.pointerType === "pen") return true;
  if (event.pointerType === "touch") return penTraits(event);
  if (force) return true;
  return penTraits(event);
}

/**
 * Echter Finger (Touch), der KEIN Stift ist. Nur das darf scrollen statt zu zeichnen —
 * sonst würde ein als Finger gemeldeter Stift die Seite verschieben statt zu schreiben.
 */
export function isFingerInput(event: PointerSignature, force = false): boolean {
  return event.pointerType === "touch" && !isPenInput(event, force);
}

/** Der zuletzt benutzte Gerätetyp gilt, solange das andere ruht. */
export const PEN_HOVER_GRACE_MS = 900;

export function penCursorActive(
  isPen: boolean,
  contact: boolean,
  msSinceMouse: number,
  grace: number = PEN_HOVER_GRACE_MS
): boolean {
  if (!isPen) return false;
  if (contact) return true;
  return msSinceMouse > grace;
}

/** Was das Plugin beim letzten Zeigerereignis gesehen hat (für die Stift-Diagnose). */
export interface PenDiagnosticSample {
  pointerType: string;
  pressure: number;
  tiltX: number;
  tiltY: number;
  buttons: number;
  isPrimary: boolean;
  classifiedAsPen: boolean;
  penModeActive: boolean;
}

export function describePenDiagnostic(samples: PenDiagnosticSample[]): string {
  if (!samples.length) return [
    "Keine Zeigerereignisse empfangen.",
    "",
    "Das heißt: Der Stift erreicht den Editor GAR NICHT — kein Plugin-Fehler.",
    "Bekannte Ursache auf Linux: Obsidian (Electron) verliert unter einer Wayland-",
    "Sitzung die Stift-Ereignisse. Betroffen sind auch andere Zeichen-Plugins.",
    "Abhilfe: Obsidian über X11/XWayland starten (siehe Beschreibung des Befehls)."
  ].join("\n");
  const types = new Map<string, number>();
  for (const sample of samples) types.set(sample.pointerType, (types.get(sample.pointerType) ?? 0) + 1);
  const typen = [...types.entries()].map(([name, count]) => `${name}: ${count}`).join(", ");
  const druecke = samples.map(sample => sample.pressure);
  const neigungen = samples.map(sample => Math.abs(sample.tiltX) + Math.abs(sample.tiltY));
  const alsStift = samples.filter(sample => sample.classifiedAsPen).length;
  const stiftModus = samples.filter(sample => sample.penModeActive).length;
  const zahl = (wert: number) => (Math.round(wert * 1000) / 1000).toString();
  return [
    `Ereignisse: ${samples.length} (${typen})`,
    `Druck: ${zahl(Math.min(...druecke))} … ${zahl(Math.max(...druecke))}`,
    `Neigung: ${zahl(Math.min(...neigungen))} … ${zahl(Math.max(...neigungen))}`,
    `als Stift erkannt: ${alsStift} von ${samples.length}`,
    `Stiftmodus aktiv: ${stiftModus} von ${samples.length}`
  ].join("\n");
}

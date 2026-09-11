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
  /**
   * Zeitstempel des Zeigerereignisses (ms). Macht die **Abtastrate** messbar und
   * trennt damit Hardware-Latenz von Software-Latenz: Kommen die Proben im
   * 8-ms-Takt (125 Hz), liefert der Stift normal und der Rest ist Software.
   * Kleben sie bei 16,7 ms, bremst der Bildschirmtakt (Compositor/Electron).
   */
  time: number;
}

export function describePenDiagnostic(samples: PenDiagnosticSample[]): string {
  if (!samples.length) return [
    "Keine Zeigerereignisse empfangen.",
    "",
    "Das heißt: Der Stift erreicht den Editor GAR NICHT — kein Plugin-Fehler.",
    "Bekannte Ursache auf Linux: Obsidian (Electron) verliert unter einer Wayland-",
    "Sitzung die Stift-Ereignisse. Betroffen sind auch andere Zeichen-Plugins.",
    "Abhilfe: Obsidian über X11/XWayland starten (siehe Beschreibung des Befehls).",
    "",
    "Zweite Möglichkeit: Der Systemtreiber hängt (bekannter Wacom-Fehler).",
    "Prüfen:  journalctl -k -b | grep -c idleprox_timeout    — hohe Zahl = Treiber zurücksetzen."
  ].join("\n");
  const types = new Map<string, number>();
  for (const sample of samples) types.set(sample.pointerType, (types.get(sample.pointerType) ?? 0) + 1);
  const typen = [...types.entries()].map(([name, count]) => `${name}: ${count}`).join(", ");
  const druecke = samples.map(sample => sample.pressure);
  const neigungen = samples.map(sample => Math.abs(sample.tiltX) + Math.abs(sample.tiltY));
  const alsStift = samples.filter(sample => sample.classifiedAsPen).length;
  const stiftModus = samples.filter(sample => sample.penModeActive).length;
  const zahl = (wert: number) => (Math.round(wert * 1000) / 1000).toString();

  // Abtastrate: Abstand zwischen zwei aufeinanderfolgenden Proben. Das ist die
  // ehrlichste Zahl — sie zeigt, was der Rechner WIRKLICH vom Stift bekommt.
  const zeiten = samples.map(sample => sample.time).filter(wert => Number.isFinite(wert) && wert > 0);
  const luecken: number[] = [];
  for (let i = 1; i < zeiten.length; i++) {
    const abstand = zeiten[i] - zeiten[i - 1];
    if (abstand > 0 && abstand < 250) luecken.push(abstand);
  }
  luecken.sort((a, b) => a - b);
  const median = luecken.length ? luecken[Math.floor(luecken.length / 2)] : 0;
  const rate = median > 0 ? Math.round(1000 / median) : 0;
  const spanne = luecken.length ? `${zahl(luecken[0])} / ${zahl(median)} / ${zahl(luecken[luecken.length - 1])}` : "—";

  const rat = median === 0
    ? "Abtastrate: zu wenig Proben für eine Aussage — bitte zwei Wörter schreiben."
    : median >= 14
      ? `Abtastrate: ${rate} Hz (${zahl(median)} ms). Die Proben kleben am Bildschirmtakt (16,7 ms ⇒ 60 Hz).`
        + "\n  ⇒ Der Stift liefert feiner, als der Rechner ihn durchlässt: die Bremse sitzt in der"
        + "\n     Software-Kette (Compositor/Electron), NICHT im Stift und nicht im Plugin."
      : median >= 6
        ? `Abtastrate: ${rate} Hz (${zahl(median)} ms) — üblicher Wert eines Stifts im Deckglas.`
        : `Abtastrate: ${rate} Hz (${zahl(median)} ms) — sehr hoch (dedizierter Digitizer).`;

  // Streuung: gleichmäßige Abstände fühlen sich glatt an, Ausreißer ruckelig.
  const streuung = luecken.length && luecken[0] > 0
    ? luecken[luecken.length - 1] / luecken[0]
    : 1;
  const ruckeln = luecken.length > 8 && streuung >= 6
    ? `\nStreuung: x${Math.round(streuung)} zwischen schnellster und langsamster Probe — das ruckelt.`
      + "\n  ⇒ Typisch für den bekannten Treiberfehler „tool appears to be hung in-prox“."
      + "\n     Prüfen mit:  journalctl -k -b | grep -c idleprox_timeout"
      + "\n     Ist die Zahl hoch: Obsidian neu starten hilft NICHT, der Stift-Treiber muss zurückgesetzt werden."
    : "";

  return [
    `Ereignisse: ${samples.length} (${typen})`,
    rat + ruckeln,
    `Probenabstand min/median/max: ${spanne} ms`,
    `Druck: ${zahl(Math.min(...druecke))} … ${zahl(Math.max(...druecke))}`,
    `Neigung: ${zahl(Math.min(...neigungen))} … ${zahl(Math.max(...neigungen))}`,
    `als Stift erkannt: ${alsStift} von ${samples.length}`,
    `Stiftmodus aktiv: ${stiftModus} von ${samples.length}`
  ].join("\n");
}

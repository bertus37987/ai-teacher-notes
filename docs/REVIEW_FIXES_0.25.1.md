# Review-Reparaturen 0.25.1 (Preview)

Stand: 9. September 2026. Kein Push, keine Installation, keine Änderungen an persönlichen Settings.
Die installierte Manifest-Version bleibt 0.25.0. Diese Version hat bekannte Datenverlustrisiken.

## Behoben

- Drag/Resize erfasst Pointer und ersetzt Elemente erst beim Commit, ohne Verlust oder Ebenenwechsel.
- Zentrale Pointer-Bereinigung auch bei akzeptierten Gesten, pointercancel und lostpointercapture.
- Kreis-Lasso ohne Selbsttreffer; Scratch nur bei anderen tatsächlich berührten Ink-Konturen.
- Negative Gestenfixtures für wandernde Schreibschleifen, Quadrate und Gekritzel im leeren Kreisinneren.
- Rahmenauswahl prüft kreuzende Segmente; Legacy-Marker-Duplikate verschieben alle Koordinaten.
- Endgültige Worthöhenkappe berücksichtigt Entzerrung; Glättung erhält Extrema; gehaltene rechtwinklige Dreiecke bleiben Polygone.
- Auswahl gehört zu einer Seite, Miniatur-Bitmap bleibt erhalten, Zoom verwendet Layoutbreite und überlebt Rebuilds.

## Ausgeführte Prüfungen

- `npm run typecheck && npm test && npm run handwriting:audit && npm run build && npm run lab:build`: Exit 0.
- 27 Testdateien entsprechend dem Runnerfilter `tests/*.test.ts`; 14 neue Editorfälle und 3 neue Geometriefälle zusätzlich zu erweiterten Auswahltests.
- Audit: 9 bestanden, 0 fehlgeschlagen.
- Performance im finalen seriellen Gesamtlauf: occupancy/free-regions 804 ms bei unverändertem Budget 1600 ms; changed() 1748 Elemente 754 ms.
- Während paralleler Agentenarbeit einmal 2333 ms und damit Performancefehler. Kein Budget geändert; Varianz weiterhin beobachten.
- `npm run plugin:package && npm run mcp:probe && git diff --check`: Exit 0. MCP-Prozessprobe vollständig bestanden.

## Browser-Nachweis

Produktionseditor mit gemocktem Obsidian-Host, isolierter Lab-Schlüssel `review-fix-regression`.
Keine persönlichen Notizen benutzt. Direkte CDP-Mausereignisse über Chrome-WebSocket:

- Ein Strich geschrieben und in IndexedDB gespeichert.
- Rahmenauswahl meldet ein Objekt; Drag verschiebt gespeicherte Punkte um +60/+60.
- Undo stellt gespeicherte Ausgangskoordinaten wieder her.
- Resize: gespeicherte Strichbreite 100 → 160; Undo stellt die vollständige Punktliste exakt wieder her.
- Zoom 125 %, dann neue Seite: beide Seiten bleiben vergrößert (gemessene Rahmenbreite 1504 px), ohne Überlagerung: erste Unterkante 2201.25, zweite Oberkante 2219.25.
- Horizontaler Scrollbereich vorhanden (1540 gegenüber 1265 px Clientbreite).
- Miniaturen besitzen nichtleere Pixelpuffer.
- Nach ausdrücklich bestätigtem Speichern: Reload lädt zwei Seiten mit einem Objekt.

Der Browser-Harness-Aufruf Input.dispatchMouseEvent scheiterte zunächst tatsächlich mit IPC-Timeout.
Direkte Verbindung zum vorhandenen Chrome-CDP-WebSocket funktionierte; der Fehler wurde nicht als Editor-Erfolg ausgegeben.
Ein erster Reload vor expliziter Kontrolle des Speicherabschlusses zeigte noch die vorherige Seitenzahl; nach bestätigter Speicherung war der Wiederladecheck erfolgreich.

## Artefakt

`plugin-dist/smooth-handwriting-0.25.1-preview.zip`

- ZIP-Integritätsprüfung erfolgreich; enthaltenes Manifest 0.25.1.
- SHA256: `5bf00006c359160f7a4c85578cc4e7c1a2a7aaa8d210c02a1471b5219e1d7f46`.
- Nicht in den Vault kopiert. Vor Installation vollständiges Backup inklusive data.json und kein ungefragter Plugin-Reload.

## Verbleibende Grenzen

Kein Yoga-/iPad-Hardwaretest und kein nativer Obsidian-End-to-End-Test. Gesten wurden über Integrations-/Geometrietests abgesichert, nicht als echte Stiftgesten im Browser freigegeben. Konservative Formerkennung kann unvollständige Rechtecke als Polygon belassen. Pinch-Zoom und die bereits dokumentierten zusätzlichen Produktfunktionen sind nicht Teil dieses Reparaturpakets.

Der Editor-Teilagent endete am API-Nutzungslimit; seine vorhandenen Änderungen wurden danach vom Hauptagenten durch vollständige Tests, Build und Browserprüfungen verifiziert.

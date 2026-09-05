# Geometrie-Ziehmodus 0.16.4

Geodreieck und Zirkel bieten jetzt zwei explizite Ziehmodi: Ursprung verschieben sowie Länge/Radius und Richtung vom festen Ursprung aus ziehen. Beim Geodreieck berücksichtigt der Zielpunkt die gewählte Kante (0°, 45°, 135°); beim Zirkel bestimmt er Radius und Startwinkel. Der Bogenwinkel bleibt separat einstellbar. Numerische Eingaben einschließlich Dezimalwerten bleiben möglich. Maße sind weiterhin Seitenpixel, keine physischen Millimeter.

Ein Klick direkt auf den Ursprung behält die letzte gültige Armlänge. Zeichnungen außerhalb des Blatts bleiben im Vorschauzustand gesperrt. Abbrechen übernimmt keine Konstruktion. Touch-Scrollen ist nur auf der Konstruktionsvorschau unterdrückt.

## Prüfung

- Typprüfung und alle sechs automatisierten Testsuiten bestanden. Neue Tests prüfen festen Ursprung, alle drei Kantenrichtungen, degenerierte/ungültige Zielpunkte und die Längenobergrenze.
- Plugin-Paket gebaut; Version 0.16.4 im nativen Obsidian installiert und geladen. Vorherige Installation einschließlich Einstellungen in `plugin-backups/smooth-handwriting-0.16.3-ZBziG8` gesichert (nicht versioniert).
- Im echten Dialog wurden synthetische Pointer-Handler-Aufrufe für Zirkel und Geodreieck ausgeführt. Die Pointer-Capture-Methode des jeweiligen Testcanvas war dabei ersetzt: Dies ist ein Handler-/Integrationsnachweis, kein echter Stift-/Touch-Hardwaretest.
- Beide Dialoge lieferten bei 60/80 Pixel Abstand zum Ursprung Länge 100. Bestätigen erzeugte zwei Konstruktionen; Speichern und erneutes Lesen der neu angelegten synthetischen Vault-Datei bestätigten beide Objekte. Testdatei anschließend in den Vault-Papierkorb verschoben, Testeditor entfernt. Bestehende Notizen nicht benutzt.

Zusätzlich wurde der aktualisierte Browser-Prüfstand mit tatsächlichen Browser-Mausgesten geprüft (ohne Ersetzen von Pointer-Capture). Im Zirkel-Ziehmodus blieb der Ursprung bei 600/400; die Bewegung ergab Radius 285,2486 px und Winkel 45,1695°. Im Geodreieck mit gewählter 45°-Kante ergab dieselbe Zielrichtung Werkzeugwinkel 0,1695° und dieselbe Länge. Einfügen des Kreises erhöhte den gespeicherten Objektzähler von 13 auf 14. Abbrechen der Geodreieck-Konstruktion ließ ihn unverändert; nach Neuladen wurden weiterhin 2 Seiten und 14 Objekte angezeigt. Die Kreisvorschau wurde per Screenshot visuell geprüft. Das ist ein Browser-Mausnachweis, kein nativer Stift-/Touch-Nachweis.

Offen bleiben echte Stift-/Touch-Gesten und die Qualitätsabnahme schwieriger Nutzerhandschrift. Dieser Schritt ändert die Erkennungs-/Schriftrekonstruktionspipeline nicht.

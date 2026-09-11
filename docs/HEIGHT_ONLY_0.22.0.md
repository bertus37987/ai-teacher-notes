# Höhenanpassung ohne Umplatzieren – 0.22.0

Diese Entscheidung ersetzt das automatische Layout aus 0.20/0.21: Der Nutzer möchte nur die Schrifthöhe und ruhigere Striche, keine automatische Platzierung oder Abstände.

## Verhalten

- Höhenanpassung ausschließlich vertikal um die untere Kante des gerade geschriebenen Wortes. Kein horizontales Skalieren, kein Einrasten auf eine andere Grundlinie, keine Buchstaben-/Wortabstands-Korrektur und kein automatischer Zeilenumbruch.
- Die Zielhöhe richtet sich weiterhin nach dem Papier: Standard 2 Kästchen auf kariertem Papier, 1 Zeile auf liniertem Papier; beide Werte sind einstellbar. Gespeicherte persönliche Höhenwerte werden beibehalten.
- Bereits verarbeitete Wörter bleiben unangetastet. Fehlt am oberen Rand Platz oder würde die Korrektur andere Inhalte überlagern, bleibt das Original an seinem Ort statt verschoben zu werden.
- Der neue Regler „Striche begradigen“ beruhigt längere, nahezu geradlinige Abschnitte stärker. Eine begrenzte geometrische Segmentierung schützt markante Richtungswechsel; gleichmäßig gebogene Abschnitte werden nicht zu Geraden gemacht. Die gezeichnete Richtung ist die Referenz, keine erzwungene senkrechte Schrift.
- Die Begradigung kann einzelne Punkte geringfügig seitlich korrigieren. Das ist lokale Strichkorrektur, kein Layout-Verschieben: horizontale Ausdehnung, Wortposition und Abstände werden nicht neu berechnet. Ohne Begradigung bleiben alle X-Koordinaten exakt gleich.
- Originalzüge, Druckdaten und Zeitstempel bleiben gespeichert. Ovale können weiterhin optional vorsichtig geschlossen werden; keine automatische Font-/OCR-Ersetzung.
- Die alten Abstands- und Zeilenhalte-Regler wurden aus dem Editor und den globalen Plugin-Einstellungen entfernt. Alte gespeicherte Layoutwerte sind wirkungslos. Auch das Ausschalten der Optimierung aktiviert nicht mehr den alten umplatzierenden Fallback.

## Prüfung

- Typecheck und sämtliche Funktionstests außerhalb der bekannten allgemeinen Performance-Suite bestanden.
- Neue Tests: unveränderte X-Koordinaten/Abstände bei reiner Höhenkorrektur, feste untere Wortkante, ignorierte alte Layoutoptionen, kein Umbruch am rechten Rand, sicheres Verhalten am oberen Rand, stärkere Beruhigung eines synthetisch zittrigen Schrägstrichs, erhaltene W-Spitzen/Ovalrundungen, Stärke 0 und entfernte UI-Regler.
- Geometrie-Audit: 9/9 bestanden. Kein Nachweis für semantische Handschrifterkennung.
- Browser mit Produktionseditor: zwei große W-Züge bei unterschiedlichen unteren Kanten und großem Abstand gezeichnet. Beide wurden auf 48 Dokumentpixel Höhe verkleinert; ihre unteren Kanten und ihr horizontaler Abstand blieben sichtbar bestehen. Vereinfachte Einstellungen im Browser geprüft.
- Plugin-/Labor-Build erstellt; 0.22.0 im lokalen Obsidian-Vault installiert, mit Sicherung des vorherigen Pluginstands unter `plugin-backups/smooth-handwriting-0.21.0-heightonly-qHl9n2/`. Die bestehende Live-Notiz wurde vor dem Update gespeichert, nicht geometrisch nachbearbeitet.

## Grenzen und nächster Test

Wortgrenzen werden weiterhin aus Pause und Geometrie geschätzt. Langsam gesetzte Einzelbuchstaben, nachträgliche Punkte und stark überlagerte Züge können deshalb unterschiedliche Höhengruppen bilden. Die Korrektur ist bewusst kein automatisches Entschrägen der gesamten Handschrift und keine perfekte Rekonstruktion unleserlicher Zeichen.

Als Nächstes dieselben Wörter mit echter Stifteingabe testen, besonders verbundene Schrift und langsam geschriebene Wörter. Hardware-Latenz auf iPad/Yoga wurde nicht gemessen. Die bekannte allgemeine Whiteboard-Performance-Suite wurde in diesem Stand nicht erneut ausgeführt; keine Aussage, dass alle früheren Lag-Probleme behoben sind.

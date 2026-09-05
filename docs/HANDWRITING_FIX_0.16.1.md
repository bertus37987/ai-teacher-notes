# Smooth Handwriting 0.16.1: keine gequetschte Schrift

## Bestätigte Ursache

Die installierte Erweiterung war noch Version 0.7.1. Ihre geometrische Normalisierung skalierte Schrift auf 72 % einer Papierrasterzeile herunter (17,28 px bei kariertem Papier). Die Source-Baseline hatte außerdem strichweises Skalieren und heuristisches Rundmachen von Buchstaben. Die Obsidian-Textdarstellung verwendete Canvas `maxWidth`, das lange Texte horizontal stauchen kann.

## Änderung

- Keine automatische Größenänderung, Scherung oder Rundung von Buchstaben durch geometrische Vermutungen. Nur eine gemeinsame Verschiebung von höchstens zwei Seitenpixeln auf eine direkt benachbarte Linie bleibt möglich.
- Der schnelle Pointer-Eingabepfad bleibt unverändert. ML weiterhin außerhalb des Stiftpfads im Worker.
- Erkannte Schrift behält natürliche Glyphenproportionen. Umbruch statt horizontaler Kompression, einschließlich langer Einzelwörter.
- Kein 80-px-Limit mehr für große Eingangsschrift. Explizite Größenwahl 75–175 % und eine gerenderte Vorschau vor Übernahme.
- Kein erzwungenes Verkleinern bei Platzmangel am unteren Seitenrand: stattdessen Hinweis und Original behalten.

## Grenzen

Das Entfernen einer Verformung ist noch kein persönliches Schriftmodell. ML erkennt Text; Caveat zeichnet ihn lesbar neu. Wirklich eigene, vollständig rekonstruierte Handschrift bleibt eine separate offene Produktanforderung. Bereits durch 0.7.1 verkleinerte und gespeicherte Striche ohne Rohdaten lassen sich nicht zuverlässig auf ihre ursprünglichen Maße zurückrechnen. Bestehende Notizdateien werden nicht automatisch verändert.

## Prüfung

Automatisierte Regressionen prüfen Größen-/Abstandserhalt auf allen Papierarten, unberührte Strichformen, große Schrift, Textumbruch und Canvas-Aufrufe ohne quetschendes `maxWidth`. Typecheck und alle sechs Suiten bestanden. Plugin-Paket 0.16.1 und Browser-Testhost neu gebaut. Echter Obsidian-Neustart und schwierige Nutzerhandschrift bleiben als Abnahme offen.

Im In-App-Browser erkannte das echte lokale Modell erneut „Hallo“. Die Größenwahl auf 175 % und ein längerer korrigierter Satz zeigten große, natürlich proportionierte Buchstaben mit Zeilenumbruch. Die installierten Plugin-Dateien wurden auf 0.16.1 aktualisiert und per Hash mit dem Paket verglichen; vorhandene Einstellungen blieben bytegleich. Die vorherige Erweiterung ist unter `plugin-backups/` lokal gesichert (git-ignoriert). Notizdateien wurden nicht verändert. Obsidian muss die Erweiterung neu laden, bevor der neue Code aktiv wird.

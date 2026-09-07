# PDF-Schreibfläche und kompakte Werkzeugleiste

Browser-PDF-Import ist jetzt mit PDF.js 6.3.289 aktiviert (neue Produktionsabhängigkeit). Worker, Zeichensätze und WASM werden lokal ausgeliefert; keine Dokumentübertragung an einen Dienst. Native Obsidian verwendet weiterhin seinen eigenen Renderer.

PDF-Seiten werden proportional als Bildhintergrund auf Seiten mit passenden Abmessungen eingefügt. Stiftstriche liegen separat darüber. Ein Fortschrittsdialog verhindert Bearbeitungen während des Imports. Dateien sind auf 20 MB und PDFs auf 40 Seiten begrenzt. Fehler rollen die Dokumentänderungen zurück; automatisches Speichern pausiert während des Imports. Die Originaldatei wird nicht überschrieben. Bild-PDF-Export erhält weder interaktive Formulare noch Original-Vektortext.

Im Browser ersetzt IndexedDB den begrenzten synchronen localStorage für neue Speicherstände. Bestehende lokale Notizen werden weiterhin als Fallback eingelesen. Testblätter haben getrennte Speicherschlüssel. Browser-Builds verwenden Inhaltsversionen für Script und CSS, um veraltete Cache-Dateien zu vermeiden.

Die Werkzeugleiste ist eine schwebende kompakte Leiste am unteren Rand; zusätzliche Einstellungen öffnen sich über „Weitere Werkzeuge“. PDF-Upload ist direkt sichtbar.

## Verifikation

- Typprüfung und sieben Testsuiten bestanden.
- Öffentliche W3C-Testdatei `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf` über den Browser-Dateidialog importiert.
- Auf der importierten Seite mit einer Mausgeste gezeichnet, gespeichert und neu geladen. Screenshot bestätigt PDF-Hintergrund und erhaltenen Strich. Isoliertes Testblatt `?test=pdf-dock-01`; bestehende Nutzerprobe nicht verändert.
- Mehrseitiger Import, Fehlerfälle, Exportdatei und native Obsidian-PDF-Prüfung sind noch nicht vollständig verifiziert. Kein Abschlussnachweis für das gesamte PDF-Ziel.

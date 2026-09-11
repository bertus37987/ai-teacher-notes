# Bildimport und PDF – 0.23.0

## Bedienung

- Direkter Bildknopf in der unteren Leiste: PNG, JPEG und WebP. Ein einzelnes Bild öffnet nach dem Import sofort seinen Bearbeitungsrahmen.
- Bild oder Griff oben ziehen zum Verschieben; vier Eckgriffe ändern die Größe proportional und bleiben innerhalb der Seite. Pfeiltasten verschieben; fokussierte Eckgriffe können ebenfalls per Pfeiltasten skaliert werden. Umschalt erhöht die Schrittweite.
- Haken oder Klick außerhalb übernimmt. Escape/Abbrechen verwirft nur die laufende Größen-/Positionsänderung. „Entfernen“ entfernt nur das Bild; Rückgängig bleibt verfügbar.
- Auswahlwerkzeug ganz rechts wählt Text, Tabellen und Bilder. Zum Beschriften Bildbearbeitung beenden und Stift wählen. Bilder werden unter Markierungen, Handschrift und Text gerendert. Eine Bildänderung verschiebt nicht automatisch die darüberliegende Tinte.
- Direkter PDF-Knopf exportiert alle Seiten; unter Datei ist weiterhin der Export der aktiven Seite möglich. Export ist eine gerasterte Bild-PDF einschließlich Papier, Fotos, Tinte und Text, nicht nachträglich als einzelne Objekte editierbar.

## Grenzen und Sicherheitsverhalten

- Maximal 20 MB pro Importdatei und 40 Megapixel pro Bild. Importbilder werden auf höchstens 2400 Pixel Kantenlänge reduziert; kein Cloud-Upload. WebP wird intern als PNG gespeichert, JPEG bleibt JPEG. Keine neue Produktionsabhängigkeit.
- PDF-Import erzeugt weiterhin eigene beschreibbare Seiten mit gesperrtem PDF-Bildhintergrund. Normale importierte Bilder sind frei skalierbar.
- Export verwendet einen unveränderlichen Dokumentstand. Fehlerhafte Bilder melden einen Fehler statt unbegrenzt zu warten; gleichzeitige Exporte werden abgefangen. Während eines Imports wartet die automatische Handschriftkorrektur.
- Der Bildrahmen zeigt beim Bearbeiten eine Bildvorschau. Die endgültige Bild-/Tintenreihenfolge wird nach Übernehmen auf dem Canvas gerendert. Bild und Tinte sind weiterhin unabhängige Objekte.

## Prüfung

- Typecheck und alle Funktionstests außerhalb der bekannten allgemeinen Performance-Suite bestanden. Neue Tests decken vier Eckgriffe, Seitenbegrenzung, Seitenverhältnis, Speicherung, unabhängige Tinte und Exportfehler ab.
- Browser: neue Bild-/PDF-Knöpfe und Auswahlwerkzeug im echten Produktionseditor geprüft. Der automatisierte Dateitransfer wurde im nativen Obsidian-Host getestet, nicht über einen Browser-Dateidialog.
- Native Testnotiz `Bildimport-Test-0.23.md`: PNG über das echte File-Input-Change-Ereignis importiert, Eckgriff per Tastatur von 640 × 360 auf 630 × 354,375 verkleinert, 10 Pixel verschoben, übernommen und gespeichert. Die rote Testtinte blieb unabhängig erhalten.
- Anschließend tatsächlichen PDF-Knopf ausgelöst und seinen Blob-Download zur Prüfung abgefangen. PDF-Parser meldete 2 Seiten im A4-Seitenverhältnis. Beide Seiten mit Poppler gerendert und visuell geprüft: Bild und rote Tinte gemeinsam auf Seite 1, Text und Linien auf Seite 2.
- Die separate Testnotiz bleibt im Vault erhalten. Bestehende Nutzernotizen wurden nicht mit Testbildern überschrieben. Plugin-Backup: `plugin-backups/smooth-handwriting-0.22.0-imagepdf-E7trv9/`.
- 0.23.0 war für Import/Skalierung/PDF live geladen. Der abschließende Schutz gegen Handschriftkorrektur während laufender Imports wurde gebaut und auf die Installation kopiert; wegen einer inzwischen aktiven Objektbearbeitung nicht erneut geladen. Dieser letzte Schutz wird nach dem nächsten Plugin-Neuladen aktiv. Temporäre Prüf-PDF/Renderbilder wurden nach Sichtprüfung entfernt; die Testnotiz bleibt erneut exportierbar.
- Maus-/Stiftziehen auf echter Tablet-Hardware sowie WebP/JPEG-Import wurden nicht separat end-to-end geprüft. Der allgemeine Whiteboard-Lag ist mit diesen Prüfungen nicht als vollständig behoben belegt.

## Kontext

Hjarni-Notiz „AI Teacher Notes – Projektkern und Build-Plan“ zur Obsidian-first-Reihenfolge gelesen. Die dortigen Versions-/Abnahmestände sind veraltet; lokale Quellen und die geladene Obsidian-Version sind maßgeblich. Hjarni wurde nur gelesen, nicht geändert.

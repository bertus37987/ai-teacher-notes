# Notes-Editor: Review für den Schulalltag

Stand: 08.09.2026. Grundlage: Codeprüfung des Obsidian-Editors, Vergleich mit dem Whiteboard-Texteditor und Browserprüfstand. Kein kompletter Gerätetest auf iPad oder Yoga. Der Editor ist ein brauchbarer Prototyp, noch kein belastbarer OneNote-Ersatz.

## In diesem Durchgang umgesetzt

- Text und Tabellen: Werkzeug wählen, auf die gewünschte Seitenposition tippen, direkt schreiben.
- Transparenter Textbereich statt weißer Bearbeitungskarte; dünner Auswahlrahmen und vier Eckgriffe. Der Rahmen wird nicht exportiert.
- Gleiche Größenänderung und Verschiebung für Tabellen. Zellinhalt bleibt strukturiert gespeichert; keine lose Sammlung unabhängiger Textfelder.
- Kleine kontextuelle Leiste statt zweizeiligem Formular. Exakte Maße bleiben unter „Maße“ erreichbar; Schriftgröße, Fett, Kursiv und Ausrichtung bleiben direkt erreichbar.
- Klick außerhalb oder Strg/⌘+Enter übernimmt; Escape verwirft den aktuellen Entwurf. Neue leere Textfelder werden nicht gespeichert. Textfelder wachsen beim Schreiben bis zum Seitenrand.
- Das gespeicherte Original wird während der Bearbeitung ausgeblendet, ohne es zu verändern. So entsteht bei transparentem Hintergrund keine doppelte Schrift. Beim Abbrechen erscheint es wieder.
- Beim Entladen werden temporäre Eingabelisten und Ereignisbeobachter entfernt.

## Funktions- und UI-Audit

| Bereich | Ergebnis / Schwäche | Nächster sinnvoller Schritt |
| --- | --- | --- |
| Speichern und Wiederherstellung | **P0:** `saveNow` schützt den Dirty-Status mit Revisionen, serialisiert konkurrierende Schreibvorgänge aber nicht. Fehler werden gemeldet, kein expliziter Wiederholen-Knopf. Offene Objektentwürfe sind noch nicht dauerhaft gespeichert. | Schreibwarteschlange, sichtbarer Speicherstatus und Entwurfsrettung beim Ansichtswechsel. Zwei gleichzeitig offene Ansichten derselben Datei testen. |
| Native PDF-Anmerkungen | **P0:** Ein beschädigtes Sidecar wird in `PdfAnnotationManager.load` nur protokolliert und durch einen leeren Arbeitssatz ersetzt. Der nächste Schreibvorgang könnte die bisherigen Daten überschreiben. `save` hat keine sichtbare Fehlerbehandlung. | Bei Lesefehler schreibgeschützt öffnen, Original sichern, Reparatur explizit anbieten. |
| Dateiprüfung | **P1:** `hasValidPages` prüft die äußere Struktur; positive endliche Maße und einzelne Elemente/Tabellenzellen werden nicht vollständig validiert. | Schemaprüfung beim Laden, verständlicher Fehler, niemals ungeprüfte Daten überschreiben. |
| Stift / Laser | Haupteditor zeichnet Live-Tinte getrennt; reale Stiftlatenz ist nicht nachgewiesen. Der native PDF-Pfad zeichnet dagegen auf jeder Bewegung die Seite neu. | Gemeinsamen inkrementellen Zeichenpfad für beide Editoren; Messung mit vollen Schulheften und echten Stiften. |
| Schönschrift | Vereinheitlichung und begrenzte o/u-Reparatur vorhanden. Erkennung ist nicht verlässlich genug für beliebige Wörter; automatische Änderung kann Inhalt verfälschen. | Unsichere Wörter zur Bestätigung zeigen; Originalvergleich und Nutzerbeispiele testen. Nicht als garantiert korrekte Transkription bewerben. |
| Auswahl und Bearbeitung | **P1:** Notes-Auswahl trifft Text und Tabellen; keine gleichwertige Auswahl von Tinte, Bildern und Formen. | Lasso, Mehrfachauswahl, Duplizieren, Löschen mit Undo, gemeinsame Verschiebung. Das ist wichtiger als weitere Stiftvarianten. |
| Textfelder | Direktbearbeitung ist jetzt näher am Whiteboard. Formatierung gilt noch für das ganze Feld. Entwurf kann am Seitenrand überlaufen und blockiert dann die Übernahme mit Hinweis. | Listen, Checklisten, Teilformatierung; gut sichtbare Überlaufanzeige. Kein vollständiger Word-Nachbau nötig. |
| Tabellen | Direkt editierbar, Zellnavigation und TSV-Paste. Ganze Tabelle skalierbar; keine individuellen Spaltenbreiten oder Zeilenlöschung. Paste außerhalb des vorhandenen Gitters wird begrenzt. | Paste-Vorschau/Erweiterung, Zeile/Spalte löschen mit Undo, einzelne Spalten ziehen. Summen erst danach. |
| Seiten | Plus am Ende und Papier-/Formatwahl vorhanden. Keine Miniaturen, Umordnung oder Seitenduplikate. | Kleine Seitenübersicht mit Umordnen, Duplizieren, Benennen und Löschen mit Undo. |
| Arbeitsblätter / Export | Importierte PDFs sind Bildhintergründe, Export ist Bild-PDF. Textsuche, PDF-Text-Snap und auswählbarer Exporttext fehlen. | Textkoordinaten erhalten; gedruckte Arbeitsblätter und Markierungen auf Lesbarkeit prüfen. Original-PDF separat behalten. |
| Marker | Freie transparente Tinte und Snap auf gesetzten Text vorhanden. Tabellentext und PDF-Bildtext sind absichtlich nicht im Snap. | Tabellentext unterstützen; PDF-Snap erst mit zuverlässiger Textebene. |
| Geometrie | Zirkel und Geodreieck funktionieren mit Pixelmaßen, nicht mit einer kalibrierten physischen Längenskala. | Winkel/Längen direkt an Objekten ändern, Einheiten und Druckmaßstab verständlich anzeigen. |
| Touch / Tastatur / Barrierefreiheit | Eckgriffe haben größere Trefferflächen als ihre sichtbaren Quadrate. Canvas-Inhalt ist nicht als vollständige lesbare Dokumentstruktur verfügbar. Sehr schmale Bildschirme reduzieren Toolbar-Trefferflächen stark. | Echte Pencil/Yoga-Tests, virtuelle Tastatur und Palm-Rejection; Textbegleitansicht, Fokusnavigation, responsive Toolbar statt immer kleinerer Knöpfe. |
| Oberfläche | Kontextleiste ist reduziert. Das globale Menü vermischt Grundlagen und viele Schönschrift-Parameter. Mehrere ältere CSS-Layouts überlagern sich. | Basis: Stift, Marker, Auswahl, Text/Tabelle, Undo. Fach-/Feineinstellungen in getrennte Gruppen; CSS gezielt konsolidieren, nicht pauschal neu gestalten. |
| Obsidian und KI | Organisation, Verlinkung und normale Notizen sollten im Vault bleiben. Der Notes-Editor hat noch keine vollständige KI-/MCP-Werkzeugparität zum separaten Whiteboard. | Notiztext für Suche/Links zugänglich machen; später gemeinsame, prüfbare Objektoperationen für Mensch und Agent. Keine zweite Ordner-/Accountverwaltung bauen. |

P0 = möglicher Datenverlust, zuerst beheben. P1 = zentrale Schulaufgabe noch unvollständig. Andere Punkte sind Ausbau oder UX-Verbesserung.

## Reihenfolge bis zu einem belastbaren Schul-MVP

1. **Daten sicher:** Wiederherstellung, serialisiertes Speichern, sichere PDF-Fehlerzustände, valide Dateien.
2. **Ein Heft wirklich bearbeiten:** Lasso und Objektaktionen, Seitenübersicht, brauchbare Tabellenbreiten und Listen.
3. **Auf Geräten bestehen:** eine Unterrichtsstunde offline mit Pencil und Yoga-Stift; lange PDFs, Ansichtswechsel, virtuelle Tastatur, Export und Wiederöffnung.
4. **Lernen unterstützen:** Suchtext, Vorlagen und Links; anschließend überprüfbare KI-Erklärungen, nicht vorher mehr ungesicherte Automatik.

## Prüfumfang dieses Durchgangs

Browser bestanden: Text an getippter Position, transparenter Rahmen, Eckgriff-Resize, Übernahme außerhalb, erneutes Öffnen ohne Doppelzeichnung; Tabelle einsetzen, Zellen direkt editieren und Gesamtgröße ziehen; Undo/Redo und erneutes Laden mit erhaltenen Inhalten; Escape erhält den gespeicherten Originaltext, eine leere Einfügung hinterlässt kein Objekt. Automatisch bestanden: Grenzen und feste Gegenkante bei allen vier Resize-Griffen, alle Nicht-Performance-Testgruppen und TypeScript. Plugin und Browser-Prüfstand erfolgreich gebaut. Version 0.19.1 im lokalen Obsidian-Plugin-Ordner installiert, vorherige Version gesichert.

Der bereits bekannte Whiteboard-Performance-Test überschritt vor diesem Review seine Zeitgrenzen. Er wird nicht als bestanden dargestellt. Native PDF-Fehlerfälle, echter Gerätebetrieb, Synchronisationskonflikte und Screenreader sind hier Codebefunde beziehungsweise offene Prüfungen, keine bestandenen End-to-End-Tests.

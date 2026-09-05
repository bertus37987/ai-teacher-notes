# AI Teacher Notes — verbindlicher Gesamtplan

Aktualisiert: 5. September 2026. Dieser Plan erweitert und ersetzt widersprechende Prioritäten in BUILD_PLAN.md. Die neue Reihenfolge ist ausdrücklich: Planung, Obsidian fertigstellen und prüfen, dann Web-App und Deployment.

## Produkt

Ein mehrseitiges Heft mit einer geduldigen visuellen Lehrkraft. Mensch und Agent bearbeiten dieselben Objekte. Freie Zeichnungen, vollständige Rechenwege, Code, interaktive Simulationen, Karten und Lernkarten werden Teil des Arbeitsmaterials. Papierformat, Orientierung und Größe sind veränderbar.

## Phase A — Obsidian als getestete Grundlage

1. Vorhandenen eigenen Canvas und Obsidian-Adapter weiterverwenden.
2. Handschriftpipeline: Rohstriche behalten, Zeilen segmentieren, offline HTR ausführen, erkannte Wörter korrigierbar anzeigen, lesbar rekonstruieren, Original wiederherstellen.
3. Ein klarer Modus für Handschrift verhindert die automatische Umwandlung von Buchstaben in geometrische Formen.
4. Modell lokal bündeln; Inferenz im Worker nach Pen-up. Keine Notizen an einen Cloudservice senden.
5. Rekonstruktion zunächst in einer gebündelten Handschrift-Schrift. Individuelle persönliche Schriftrekonstruktion ist ein eigener späterer Modellschritt; Ausrichtung allein ist keine semantische Verbesserung.
6. Geodreieck: verschieben, drehen, Gradskala, entlang der Kante zeichnen; Winkel und Länge numerisch eingeben.
7. Zirkel: Mittelpunkt setzen, Radius einstellen/ziehen, Kreis und Kreisbogen mit exaktem Radius erstellen.
8. Papierformat ändern, Undo, Save/Reload, Mehrseitenexport und Modellfehler testen.
9. Installierbares ZIP mit main.js, manifest.json, styles.css, Modell, Worker, Runtime und Lizenzen bauen.

Freigabe: Unit-/Build-Tests, Browserprüfung derselben Komponenten und gesonderter Obsidian-Laufzeittest. Ein Browser-Testhost ersetzt keinen echten Obsidian-Test. Nicht vorhandene Hardware-/Vault-Prüfung bleibt ausdrücklich offen.

## Phase B — Web-Heft und gemeinsamer Aktionskern

Bibliothek, mehrere Hefte/Whiteboards, geordnete Seiten, variable Formate, IndexedDB-Recovery und Supabase-Persistenz. Human UI, Tutor API und Remote MCP nutzen einen SceneCommandService mit identischen Schemas, Idempotency, Seitenrevisionen und atomaren Vorschlägen. Der Agent kann alle Artefaktaktionen; Konten, Berechtigungen und Annahme seiner eigenen Änderungen gehören nicht dazu.

## Phase C — Fachfähigkeiten

| Fach | Werkzeuge und Lernmaterial | Fachliche Prüfung |
|---|---|---|
| Mathematik | Rechenschritte, Brüche, Graphen mit veränderbaren Parametern, Diagrammauswertung | Rechenprüfung, Definitionsbereich, Einheiten, Achsen und Stichproben |
| Deutsch | Textaufbau, Argumentation, sprachliche Mittel, belegte Textstellen | Behauptungen an Zitate/Absätze binden; Interpretation kennzeichnen |
| Biologie | Detaillierte beschriftete Vektorskizzen, mehrere Zustände/Funktionsschritte | Fachquellen, Beschriftungsprüfungen; schematische Vereinfachungen markieren |
| Kunst | Bildkritik, Komposition, Proportionen, eigene Skizzen | Original bewahren, Änderungen als Vorschlag; frei wählbares Papier |
| Informatik | Codeblöcke direkt auf A4, Algorithmusschritte, ML/DL/HTTP/MCP-Schaubilder | Code sprachspezifisch prüfen; Ausführung nur in isolierter Umgebung |
| Technik/NWT | Bemaßung, Maßstab, Ansichten, Schnitte, Zeichnungen aus Fotos | Normprofil/Version explizit; fehlende Maße rückfragen; Foto ist kein Messinstrument |
| Physik | Parametrisierte 2D- und 3D-Simulationen mit Play/Pause/Schritt | Formeln, Einheiten, Anfangsbedingungen, Energie-/Erhaltungschecks |
| Sprachen | Separater Vokabelbereich, Fotoimport, Grammatikbilder und Animation | OCR bestätigen, Übersetzungsalternativen, Lernkarten-Review |
| Wirtschaft/Politik | Statistiken, Diagramme, Vergleiche | Quelle/Datum, Skala, Stichprobe, Korrelation vs. Kausalität |
| Geographie | Schichten, Plattentektonik, Animationen, echte Land-/Weltkarten | Datenquelle, Projektion, Attribution, Maßstab und Datumsstand |

Alle Bereiche gehören zum Produktziel. Für die Hackathon-Freigabe erhält jeder Bereich mindestens einen überprüften Beispielablauf; unbekannte Inhalte bekommen keine pauschale wissenschaftliche Korrektheitsgarantie.

## Wissenschaftliche Darstellung und Animation

Der Agent erstellt einen semantischen Plan mit Fachbegriffen, Quellen, Einheiten, Annahmen und Beziehungen. Validierte Composer erzeugen daraus editierbare Objekte. Eine zweite Prüfung kontrolliert Geometrie, Beschriftungen und fachliche Konsistenz. Ein Modellurteil allein ist kein Korrektheitsnachweis.

Animationen werden als deklarative Szenen mit Objekten, Parametern, Kurven und Zeitachse gespeichert. Geprüfte Simulationsmodule berechnen den Zustand. Kein vom Modell erzeugtes JavaScript wird ungeprüft im App-Ursprung ausgeführt. 3D-Ansichten brauchen Kamera, Legende, Pause/Reset, reduzierte Bewegung und ein statisches Exportbild mit Erklärung.

Für technische Zeichnungen fehlen aus einem einzelnen Foto häufig Tiefe, Maßstab und verdeckte Maße. Der Agent fordert bekannte Referenzmaße an und kennzeichnet unbestimmte Maße. Normkonformität darf nur für konkret implementierte und geprüfte Normregeln behauptet werden.

## Lernprofil und permanente Memory

Onboarding ist überspringbar. Freiwillig: Altersgruppe statt Geburtsdatum, Lernstufe, Interessen, Sprache, Fach, Schulart/Bundesland oder Lehrplan. Interessen beeinflussen Beispiele, Lernstufe beeinflusst Detailtiefe; keine feste Typisierung nach angeblichen Lerntypen.

Memory speichert bestätigte Ziele, bevorzugte Erklärformen, belegte Stolperstellen und bearbeitete Konzepte. Jede Erinnerung hat Quelle, Datum und Gültigkeit; sie ist sichtbar, korrigierbar und löschbar. Sensible Informationen und Diagnosen werden nicht aus Fehlern abgeleitet. Heftinhalt bleibt von Profilwissen getrennt. Rechtschreibtraining aus häufigen Fehlern ist ein späterer Opt-in-Bereich.

## Vokabelbereich

Sammlungen außerhalb des Heftes mit Vorderseite, Rückseite, Sprache, Beispielsatz, Quelle und Lernstand. Fotoimport erzeugt eine Korrekturansicht vor dem Speichern. Ein einfacher Wiederholungsplan mit bekannten/falschen Antworten startet den Lernmodus. Foto und Quelle bleiben privat.

## Deployment und Abnahme

Vercel hostet Web-App, Tutor und Remote MCP. Supabase liefert Auth, owner-scoped RLS, Revisionen, private Assets, Lernkarten und Memory. Projekt/Region/Kosten werden vor kostenpflichtiger Provisionierung geklärt. API-Schlüssel werden nur in sicheren Umgebungsvariablen verwaltet.

Erst eine kleine durchgängige Web-Version deployen: Profil überspringen, dreiseitiges Heft, schreiben, visuell erklären, annehmen, speichern, erneut öffnen, MCP-Bearbeitung. Anschließend Fachmodule einzeln mit Referenzfällen hinzufügen.

## Zeit- und Umfangsentscheidung

Die erweiterte Fachbreite inklusive wissenschaftlicher 3D-Simulationen ist deutlich größer als der ursprüngliche Solo-Hackathon-MVP. Die Reihenfolge bleibt Obsidian → gemeinsamer Kern → Web-Heft/API/MCP → Fachmodule → Deployment/Impact-Tests. Reifegrad pro Fach wird im Repository ausgewiesen; der 28. September bleibt Feature-Freeze-Ziel. Ein erster Platz lässt sich nicht zusichern; Lernwirkung, geprüfte Beispiele und Zuverlässigkeit bestimmen die Prioritäten.

## Nächste konkrete Aufgaben

- [ ] Offline HTR + lesbare Rekonstruktion + Original-Restore
- [ ] Geodreieck/Zirkel/Seitenformate in Obsidian
- [ ] Echte Modell-, Integrations- und Browsertests; installierbares ZIP
- [ ] Repository erstellen, Herkunft und neue Arbeit veröffentlichen
- [ ] Web-Shell, Supabase-Schema, Tutor und Remote MCP
- [ ] Lernprofil/Memory/Vokabeln und Fachmodule
- [ ] In-App-Browserprüfung, Vercel-/Supabase-Deployment

## Aktueller Baseline-Befund

Der importierte Code besteht unter Node 22. Frühere Node-24-Läufe überschritten die ursprünglichen Performancegrenzen; beim abschließenden Lauf am 5. September bestanden auch unter Node 24 alle sechs Suiten innerhalb der unveränderten Grenzen (changed: 913 ms, occupancy: 549 ms, 1748 Objekte). Die Varianz muss weiter beobachtet werden. Die Tests belegen keine Lernwirksamkeit und keine wissenschaftliche Korrektheit der geplanten Fachmodule. Phase A liegt als installierbare Preview vor; Freigabestatus in OBSIDIAN_PREVIEW.md.

# Hackathon-Delta

Dieses Dokument trennt die vorbestehende technische Engine von der Arbeit an AI Teacher Notes. Es wird während GatewayHacks 2026 fortlaufend aktualisiert.

## Deklarierte Grundlage

- Repository: <https://github.com/bertus37987/smooth-whiteboard-webmcp>
- Baseline-Commit: `c3cff3c46bc91c9f108195741459f9dd01346af2`
- Importdatum: 4. September 2026
- Lizenz: MIT; Ink Stroke Modeler unter Apache-2.0

Bereits vorhanden waren unter anderem Canvas-Rendering, Stift und Formen, Custom Paths, strukturierte Visualisierungen, Revisionen, Lease, Accept/Reject, Undo/Redo und Export. Die genaue Bestandsaufnahme steht in `docs/BASELINE_AUDIT.md`.

## Neue Arbeit für AI Teacher Notes

Die folgenden Bereiche gehören zum geplanten Hackathon-Delta und müssen durch Commits, Tests und Demo belegbar werden:

- Dokumentbibliothek für mehrere Hefte und Whiteboards.
- Echte mehrseitige A4-Hefte in der Web-App.
- Supabase Auth, Datenbank, Realtime und private Dateien.
- IndexedDB-Recovery und konfliktgeschütztes Autosave.
- Transportneutraler SceneCommandService.
- In-App-KI-Tutor über API.
- Standardkonformer Remote-MCP-Endpunkt mit Autorisierung.
- Visuelles, schrittweises Tutorverhalten und Verständnisprüfung.
- Rechenwege ohne LaTeX-Eingabe und zusätzliche Lehrkompositionen.
- Smart Ink Lite mit OCR/HTR-Metadaten, Confidence und Restore.
- Neue Heft-/Tablet-UX, Accessibility und Impact-Tests.

## Nachweisformat

| Datum | PR/Commit | Neu gebaut | Test-/Demo-Beleg |
|---|---|---|---|
| 2026-09-04 | Baseline-Commit | Import und dokumentierter Bauplan | Baseline typecheck, tests, web build, audit |
| 2026-09-05 | Initialer AI-Teacher-Notes-Stand | Gesamtplan, Offline-HTR mit Review/Restore, Geodreieck/Zirkel, Seitenformate, Plugin-Paket und Browser-Testadapter | Sechs Testsuiten, Builds, echte ONNX-Browserinferenz; Obsidian-Freigabe noch offen |

## Offene Eligibility-Frage

Der Quellcode begann am 31. August 2026 und damit vor dem genannten Registrierungsstart. Vor der Einreichung muss dokumentiert werden, ob die Organisatoren die deklarierte eigene Engine als zulässige Grundlage akzeptieren.

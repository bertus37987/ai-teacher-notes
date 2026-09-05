# Baseline-Audit

## Quelle

- `bertus37987/smooth-whiteboard-webmcp`
- Branch `main`
- Commit `c3cff3c46bc91c9f108195741459f9dd01346af2`
- geprüft am 4. September 2026

## Technische Basis

Das Projekt ist kein React-, Vite- oder Excalidraw-Projekt. Es ist ein eigener Vanilla-TypeScript-/Canvas-2D-Stack mit esbuild und einem optionalen Obsidian-Adapter.

### Besonders wertvoll für AI Teacher Notes

- Mehr als 30 Canvas-Operationsarten für Erstellen, Bearbeiten, Layout und Lehren.
- Freie SVG-Pfade/Symbole, Ink, Text, Formen, Connectoren, Gruppen und Artboards.
- Strukturierte Visual Composer für Erklärungen, Rechenwege, Plots, Mindmaps, Flowcharts und weitere Layouts.
- Guided Explanations mit schrittweiser Präsentation.
- Revisionen, Lease-Tokens und stale-revision-Schutz.
- Atomare Agenten-Proposals mit Accept/Reject und Rollback.
- Textmessung und Design-Linter für Overflow, Überlappung und Kontrast.
- Lokale Persistenz, History, PNG/SVG/PDF/JSON-Export.
- `src/document.ts` enthält bereits ein echtes Multi-A4-Seitenmodell, das die Web-App noch nicht als Heft-Shell nutzt.

## Aktuelle Grenzen

- Kein LLM- oder Tutor-API-Aufruf.
- Kein Serverbackend, Benutzerkonto, Datenbank oder Cloud-Sync.
- WebMCP hängt an `document.modelContext` beziehungsweise `navigator.modelContext` und ist nicht breit verfügbar.
- Web-App speichert aktuell lokal und behandelt primär ein Board.
- Browser-/OS-Handschrifterkennung ist optional, sprachlich begrenzt und keine semantische Schönschrift.
- Keine Remote-MCP-Authentifizierung und keine serverseitige Dokumentberechtigung.

## Kopplungspunkte

- `web-src/webmcp.ts`: Browseradapter und Toolregistrierung.
- `web-src/app.ts`: Registrierung, Prompt-/Turn-UI und Aufruf des Adapters.
- `web-src/collaboration.ts`: wertvolle transportunabhängige State-Machine, die bleiben soll.
- `web-src/store.ts`: Revision/History, später durch Persistenzadapter zu ergänzen.

Die WebMCP-Datei ist nicht der Kern. Die eigentliche Canvas- und Turnlogik kann in einen gemeinsamen Service extrahiert werden, ohne Renderer und Operationsmodell neu zu schreiben.

## Lizenz und Herkunft

- Projektlizenz: MIT.
- Ink Stroke Modeler: Apache-2.0; bestehende Lizenz- und Third-Party-Hinweise beibehalten.
- Herkunft, URL und Baseline-SHA bleiben in README und `HACKATHON_DELTA.md` sichtbar.

## Reproduzierte Checks

Aus einem frischen, flachen Clone:

- `npm ci`: bestanden.
- `npm run typecheck`: bestanden.
- `npm test`: alle Authoring-, Collaboration-, Core-, Performance- und Quality-Suites bestanden.
- `npm run web:build`: bestanden; Produktionsbundle etwa 254,5 kB.
- `npm audit --omit=dev`: 0 bekannte Vulnerabilities.

Die Collaboration-Suite schreibt absichtlich einen simulierten Fehler (`the page fell over`) in die Ausgabe und bestätigt anschließend den erwarteten Fehlerpfad; der Testprozess endet erfolgreich.

## Importstrategie

1. Kontrollierter Snapshot in ein neues Repository, bestehendes `AGENTS.md` bewahren.
2. Quellrepository als `upstream`-Remote eintragen.
3. Identität, README, Delta und Architektur dokumentieren.
4. Baseline erneut testen und taggen.
5. Funktionen in kleinen Slices extrahieren; kein Framework-/Renderer-Rewrite.
6. WebMCP erst entfernen, wenn UI-Tutor und Remote MCP die Capability-Matrix erfüllen.

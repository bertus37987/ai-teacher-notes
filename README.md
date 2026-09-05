# AI Teacher Notes

> **Nicht nur erklären. Sichtbar machen.**

AI Teacher Notes ist ein stiftzentriertes Lernheft, in dem Mensch und KI dieselben editierbaren Objekte bearbeiten. Lernende schreiben oder zeichnen direkt auf mehreren A4-Seiten oder einer freien Whiteboard-Fläche; der Tutor kann daneben vollständige Rechenwege, eigene Skizzen, Diagramme, Markierungen und schrittweise visuelle Erklärungen erzeugen — ohne dass der Mensch LaTeX oder Prompt-Syntax kennen muss.

## Der Hackathon-Moment

1. Ein Gast öffnet ein Heft mit mehreren A4-Seiten.
2. Er schreibt oder zeichnet eine konkrete Aufgabe direkt auf die Seite.
3. Er markiert die relevante Stelle und fragt: „Erkläre mir das direkt im Heft.“
4. Die KI liest Seite, Auswahl und Handschrift, plant kurz und ergänzt eine editierbare visuelle Erklärung mit vollständigem Lösungsweg.
5. Der Lernende kann die Erklärung annehmen, rückgängig machen oder mit „Anders erklären“ eine zweite Darstellung anfordern.

## Was schon als Basis vorhanden ist

Dieses Repository startet mit einem geprüften Snapshot von [`bertus37987/smooth-whiteboard-webmcp`](https://github.com/bertus37987/smooth-whiteboard-webmcp). Bereits vorhanden sind unter anderem:

- ein performanter Vektor-Canvas mit Stift, Formen, Text, Bildern, Artboards, Auswahl und Export,
- frei definierbare Pfade und editierbare strukturierte Visualisierungen,
- Rechenwege, Funktionsplots, Mindmaps, Flowcharts und geführte Erklärungsschritte,
- ein transaktionales Agentenmodell mit Revisionen, Lease, Accept/Reject und vollständigem Rollback,
- lokale Persistenz, Undo/Redo sowie PNG-, SVG-, PDF- und JSON-Export.

Der Umbau ersetzt die browsergebundene WebMCP-Kopplung durch zwei normale Zugänge zur selben Domänenlogik:

- einen eingebauten Tutor über die OpenAI Responses API,
- einen authentifizierten Remote-MCP-Endpunkt für externe Agenten.

Geplant: Supabase übernimmt anonyme Gast-Sessions, Hefte, Seiten, Revisionsstände und private Dateien. Vercel hostet Web-App, API und MCP-Endpunkt. Diese Integrationen sind noch nicht implementiert oder deployt.

## Projektstatus

**Phase A – Obsidian-Preview 0.16.0.** Gesamtplan und Fachmodule sind dokumentiert. Neu im Obsidian-Editor: lokale deutsche ML-Handschrifterkennung mit korrigierbarer Vorschau, Rekonstruktion in Caveat und gespeichertem Original, Geodreieck, Zirkel/Kreisbögen und variable Seitenformate. Echte schwierige Nutzerhandschrift und der Obsidian-Host müssen noch geprüft werden. Das ist keine Freigabe als fertige Erweiterung.

Die Web-App ist weiterhin der ursprüngliche Whiteboard-Client, ohne neuen Tutor oder Datenbank. WebMCP bleibt Referenzadapter, bis API/Remote MCP dieselben Sicherheits- und Undo-Garantien nachweislich erfüllen.

### Plugin bauen und testen

```bash
npm ci
npm run plugin:package
npm run lab:build
python3 -m http.server 4173 --bind 127.0.0.1 --directory lab-dist
```

Das ZIP liegt unter `plugin-dist/smooth-handwriting-0.16.0-preview.zip`. Der Build lädt Modell und Runtime-Lizenzen; Modell und Konfiguration sind per Revision/Hash festgelegt. Danach funktioniert die Erkennung offline. Die neue Produktionsabhängigkeit `onnxruntime-web@1.27.0` ermöglicht CPU-Inferenz im Worker; 1.20.1 ist mit diesem Modell nicht kompatibel. Das Modell und die Font-Assets müssen zusammen mit dem Plugin installiert werden.

Installation und Abnahme: [Obsidian-Preview](docs/OBSIDIAN_PREVIEW.md).

## Dokumentation

- [Aktueller Gesamtplan: Obsidian zuerst, Fachmodule danach](docs/MASTER_PLAN.md)
- [Konkreter Build-Plan](docs/BUILD_PLAN.md)
- [Zielarchitektur und Schnittstellen](docs/ARCHITECTURE.md)
- [Hackathon- und Demo-Strategie](docs/HACKATHON_STRATEGY.md)
- [Audit der übernommenen Basis](docs/BASELINE_AUDIT.md)
- [Dauerhafte Produktentscheidungen](docs/DECISIONS.md)
- [Bisheriger Whiteboard-Produktplan](docs/PRODUCT_PLAN.md)

## Lokale Baseline ausführen

Voraussetzung: Node.js 24.

```bash
npm ci
npm run typecheck
npm test
npm run web:build
python3 -m http.server 4173 -d web-dist
```

Danach `http://127.0.0.1:4173/` öffnen.

## Qualitätsregel

Eine Agentenfunktion gilt erst als fertig, wenn sie über UI und Remote MCP dieselbe validierte Szenenoperation ausführt, Konflikte korrekt ablehnt, vollständig rückgängig gemacht werden kann und im Demo-E2E-Test besteht. Handschrift-Glättung, semantische Handschrifterkennung und Formenerkennung werden als drei getrennte Fähigkeiten entwickelt und getestet.

## Herkunft und Lizenz

Die Codebasis stammt aus dem eigenen MIT-lizenzierten Projekt [`smooth-whiteboard-webmcp`](https://github.com/bertus37987/smooth-whiteboard-webmcp). Der erste Import basiert auf Commit `c3cff3c46bc91c9f108195741459f9dd01346af2`. Die eingebundene Ink Stroke Modeler-Abhängigkeit bleibt Apache-2.0-lizenziert; Details stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

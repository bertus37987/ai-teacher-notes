# AI Teacher Notes — konkreter Build-Plan

Stand: 4. September 2026
Zieltermin: 1. Oktober 2026, deutlich vor 23:59 EDT einreichen
Teamannahme: Solo-Projekt

## 1. Produktkern

**Motto:** Nicht nur erklären. Sichtbar machen.
**Pitch:** „Dein Heft, das zurückerklärt.“

AI Teacher Notes ist kein Whiteboard mit seitlichem Chat. Es ist ein echtes mehrseitiges Lernheft, in dem die KI denselben visuellen Arbeitsraum und dieselben editierbaren Werkzeuge wie der Mensch benutzt. Die KI soll die Arbeit des Lernenden sehen, direkt daneben erklären, eigene Skizzen erstellen, vollständige Rechenwege legen und anschließend prüfen, ob der nächste selbst geschriebene Schritt verstanden wurde.

Der primäre Cause Pillar ist **Equity in Education**: individuelle visuelle Unterstützung für Lernende, die keinen verlässlichen Zugang zu Nachhilfe oder einer permanent verfügbaren Lehrkraft haben.

## 2. Die eine unverhandelbare Demo

Die P0-Demo verwendet die Gleichung `2x + 6 = 18`, weil sie Handschrift, Mathematik, freie Zeichnung und Pädagogik gleichzeitig zeigt:

1. Gast öffnet ein Matheheft mit mindestens drei A4-Seiten.
2. Gast schreibt `2x + 6 = 18` mit Stift auf Seite 1.
3. Smart Ink richtet die Schrift vorsichtig aus; Original und Undo bleiben verfügbar.
4. Gast markiert die Gleichung und fragt: „Erklär mir das mit einem Bild, aber verrate nicht sofort die Lösung.“
5. Tutor zeichnet eine editierbare Waage, zeigt das Entfernen von 6 auf beiden Seiten und öffnet nur Schritt 1.
6. Gast schreibt selbst `2x = 12`.
7. Tutor erkennt und bestätigt den richtigen Schritt und fragt nach dem nächsten.
8. „Anders erklären“ ergänzt ein Balkenmodell, das 12 in zwei gleiche Teile teilt.
9. Gast nimmt den Vorschlag an, verschiebt selbst ein KI-Objekt und lädt neu; Seite, Reihenfolge und Zustand bleiben erhalten.
10. Ein externer MCP-Client liest dieselbe Seite und fügt einen weiteren Hinweis hinzu, der live erscheint.

Wenn dieser Ablauf nicht zuverlässig ist, werden keine P1-Funktionen gebaut.

## 3. Erfolgsdefinition

### Nutzerergebnis

- Eine neue Person erreicht ohne Erklärung in höchstens 60 Sekunden die erste visuelle Tutorantwort.
- Die KI zeigt zunächst einen sinnvollen nächsten Schritt statt ungefragt nur die Endlösung.
- Alle KI-Objekte sind normale, nachträglich bearbeitbare Heftobjekte.
- Jede KI-Änderung ist als Batch annehmbar, ablehnbar und vollständig rückgängig zu machen.
- Ein Heft besitzt mehrere sortierbare A4-Seiten; freie Whiteboards bleiben als zweiter Dokumenttyp erhalten.

### Technisches Gate

- UI-Tutor und Remote MCP verwenden dieselbe validierte Operationsschicht.
- Speichern mit `baseRevision` verhindert stilles Überschreiben.
- Wiederladen, Offline-Recovery und Konfliktfall sind getestet.
- Keine geheimen Schlüssel im Client oder Repository.
- RLS-Allow- und RLS-Deny-Tests bestehen für alle exponierten Tabellen.
- Der vollständige Browser-E2E-Test besteht auf Desktop und Tabletbreite.

### Impact-Gate

Mit mindestens fünf Lernenden sowie ein bis zwei Lehrer:innen/Tutor:innen wird ein kurzes, anonymes Testprotokoll durchgeführt:

- Flow ohne Hilfe abgeschlossen: Ziel mindestens 80 %.
- Median bis zur ersten verständlichen Erklärung: Ziel unter 60 Sekunden.
- Verständlichkeit: Ziel mindestens 4/5.
- Kontrollgefühl über KI-Änderungen: Ziel mindestens 4/5.
- Transferaufgabe nach der Erklärung: Ergebnis ehrlich als Vorher/Nachher-Differenz berichten.

Keine nicht belegte Lernwirkungsbehauptung. Ergebnisse und Methodik kommen in `docs/impact-study.md`.

## 4. Scope

### P0 — muss für die Einreichung funktionieren

- Gast-Workspace über Supabase Anonymous Auth.
- Dokumentbibliothek mit Heften und Whiteboards.
- Mehrseitiges A4-Heft: anlegen, umbenennen, duplizieren, sortieren, löschen und wiederherstellen.
- Papierarten: blank, liniert, kariert und punktiert.
- Autosave, Revisionsschutz, lokale Recovery und sichtbarer Speicherstatus.
- Bestehender Canvas-Kern mit Stift, Radierer, Auswahl, Formen, Text, Bild, freien Pfaden und Export.
- In-App-Tutor über OpenAI Responses API mit Streaming und strukturierten Tool Calls.
- Agenten-Parität: eigene Pfade, komplette Objektbearbeitung, Layout und Guided Explanation.
- Vollständige Rechenwege ohne LaTeX-Eingabe durch den Menschen.
- Remote MCP über Streamable HTTP mit sicherer, dokumentgebundener Autorisierung.
- Agentenänderungen als atomarer Accept/Reject-Batch mit Undo.
- Smart Ink Lite: lokale Glättung plus begrenzte Ausrichtung, Vorschau und Original-Restore.
- OCR/HTR-Metadaten, damit der Tutor Handschrift lesen kann, ohne sichtbare Striche blind zu ersetzen.
- Drei vorbereitete Beispielhefte: Mathematik, Naturwissenschaft, Sprache/Geschichte.
- Responsive Tablet-/Desktop-Oberfläche und grundlegende Barrierefreiheit.

### P1 — nur nach vollständigem P0

- PDF-/Arbeitsblattimport als Heftseiten.
- Quellenkarten und Zitatprüfung für recherchelastige Fächer.
- Vorlesefunktion und vereinfachte Sprache.
- Magic-Link-Upgrade, damit ein Gast seine Hefte geräteübergreifend behält.
- Lehrerkommentar- oder Freigabelink mit Nur-Lesen-Modus.
- Erweiterte Form- und Diagrammerkennung.

### P2 — nach dem Hackathon

- Echtzeit-Multiplayer.
- Lehrkraft-Dashboard, Klassen und Aufgabenverteilung.
- Persönliches Handschriftmodell und semantische Stilübertragung.
- Offline-first Sync über mehrere Geräte.
- Mobile Apps und systemweite Stiftintegration.

## 5. Architekturentscheidung

Der vorhandene Vanilla-TypeScript-Canvas wird behalten. Ein Rewrite auf React oder Excalidraw würde die stärksten eigenen Bausteine verlieren und das Terminrisiko unnötig erhöhen.

### Laufzeit

- **Frontend:** bestehendes Vanilla TypeScript, Canvas-Renderer und esbuild; neue Bibliotheks- und Heft-Shell als fokussierte Module.
- **Hosting:** Vercel Static Output plus Node Functions unter `/api`.
- **Daten:** Supabase Auth, Postgres, Realtime und private Storage Buckets.
- **Tutor:** OpenAI Responses API; Startmodell `gpt-5.4-mini`, niedrige Reasoning-Stufe für den Standardflow, höher nur für komplexe Aufgaben.
- **MCP:** aktuelles `mcp-handler` 2.x, `@modelcontextprotocol/server` 2.x und Zod 4, versionsgenau gepinnt.

### Gemeinsame Domänenlogik

`web-src/webmcp.ts` darf nicht einfach durch zwei neue, voneinander abweichende Implementierungen ersetzt werden. Stattdessen entsteht eine transportneutrale Schicht:

```text
Human UI -----------┐
In-App Tutor -------+--> Teaching/Board Service --> Validator --> Scene Transaction
Remote MCP ---------┘                                  |
                                                       +--> Supabase revision + Realtime
```

Die bestehende Collaboration-State-Machine, Lease-Prüfung, Stale-Revision-Prüfung, Design-Linter und Rollback-Logik bleiben erhalten und werden von Browser-Globals entkoppelt.

## 6. Datenmodell

### `documents`

- `id uuid primary key`
- `owner_id uuid not null`
- `title text not null`
- `kind document_kind not null` (`notebook` oder `whiteboard`)
- `active_page_id uuid null`
- `created_at`, `updated_at`, `archived_at`

### `pages`

- `id uuid primary key`
- `document_id uuid not null`
- `position integer not null`
- `title text not null`
- `format page_format not null` (`a4` oder `infinite`)
- `paper paper_kind not null` (`blank`, `lined`, `grid`, `dotted`)
- `scene jsonb not null`
- `ocr_summary text null`
- `revision bigint not null default 0`
- `created_at`, `updated_at`

### `turns`

- Tutor-/MCP-Anfrage, Ausgangsrevision, Status und begrenzte Erklärung.
- Vorgeschlagene Operationen werden bis Accept/Reject nachvollziehbar gespeichert.
- Keine internen Gedankengänge speichern; nur Nutzertext, kurze sichtbare Planung, Toolresultate und Status.

### `page_versions`

- Begrenzte, komprimierte Snapshots für Recovery und Agenten-Rollback.
- Snapshot bei akzeptierter Agentenänderung, vor Import und bei bedeutenden Konflikten.

### `ink_segments`

- Elementbezug, erkannter Text, Sprache, Confidence sowie Original-/Refine-Metadaten.
- Rohpunkte bleiben im Szenenobjekt beziehungsweise Snapshot erhalten.

### `mcp_tokens`

- Nur gehashte Tokens, Dokument-Scope, Rechte (`read`, `write`), Ablaufzeit und Widerruf.
- Kein Klartexttoken in der Datenbank oder in Logs.

### Storage

- Privater Bucket für Nutzerbilder, PDF-Seiten und Vorschaubilder.
- Pfade beginnen mit der User-ID; RLS prüft Eigentum und Bucket.
- Service Role nur serverseitig; Browser erhält ausschließlich die Publishable Key.

## 7. API- und MCP-Verträge

### Web/API

- `GET|POST /api/documents`
- `GET|PATCH /api/documents/:id`
- `POST /api/documents/:id/pages`
- `PATCH /api/pages/:id`
- `PUT /api/pages/:id/scene` mit `{ scene, baseRevision }`
- `POST /api/pages/:id/ink/refine`
- `POST /api/documents/:id/tutor` mit `{ pageId, message, selectionIds, locale, level }`
- `GET|POST /api/mcp` als Streamable-HTTP-Endpunkt

Die konkrete Routingform darf sich beim Aufbau ändern; Domänentypen und Revisionssemantik nicht.

### Öffentliche Kerntypen

```ts
type DocumentKind = "notebook" | "whiteboard";
type PageFormat = "a4" | "infinite";

interface SceneEnvelope {
  elements: BoardElement[];
  appState: PersistedPageState;
  revision: number;
}

interface ScenePatchResult {
  revision: number;
  changedElementIds: string[];
  lintIssues: LintIssue[];
  updatedAt: string;
}
```

### MCP-Werkzeuge

1. `list_documents` — nur Dokumente im Token-/User-Scope.
2. `read_page` — Seite, Auswahl, lesbare OCR-Metadaten und aktuelle Revision.
3. `apply_page_changes` — dieselben Low-Level-Operationen wie die UI; beinhaltet freie Pfade und vollständige Bearbeitung.
4. `create_visual_explanation` — kompiliert Waage, Balkenmodell, Ablauf, Vergleich, Zeitstrahl, Konzeptkarte oder freie Lehrgrafik in normale Objekte.
5. `present_explanation_step` — öffnet genau einen geführten Schritt.
6. `complete_contribution` — beendet den Batch und fordert Accept/Reject an.

Im P0 gibt es kein eigenständiges ungesichertes `delete_document`-Werkzeug. Löschen von Seitenelementen bleibt eine validierte Szenenoperation innerhalb eines aktiven Batches.

## 8. Tutorverhalten

Der Tutor arbeitet nach `observe -> plan -> act -> lint -> present -> wait`:

1. Aktuelle Revision, relevante Elemente, OCR und einen kleinen visuellen Crop lesen.
2. Eine sichtbare Ein-Satz-Planung veröffentlichen.
3. Höchstens sechs Tool Calls pro Standardturn.
4. Visuell zuerst erklären, Text knapp halten.
5. Standardmäßig einen nächsten Schritt zeigen und den Lernenden selbst weiterarbeiten lassen.
6. Geänderte Elemente linten und offensichtliche Überlappung, Overflow oder Kontrastfehler innerhalb desselben Turns korrigieren.
7. Als Vorschlag präsentieren; erst Accept macht den Batch zum normalen Dokumentzustand.

Seiteninhalt, importierte Dokumente und MCP-Ausgaben gelten als nicht vertrauenswürdige Daten, nicht als Systemanweisungen.

## 9. Rechenwege ohne LaTeX-Hürde

Der Mensch schreibt normale Handschrift oder Text. Intern darf der Tutor strukturierte Mathematik erzeugen, aber die Oberfläche zeigt keine LaTeX-Eingabepflicht.

- Einfache Algebra nutzt normale editierbare Text-, Linien-, Gruppen- und Hervorhebungsobjekte.
- Brüche, Wurzeln und Klammerstrukturen werden als `mathBlock` mit zugänglichem Klartext und editierbaren visuellen Unterelementen dargestellt.
- Diagramme und geometrische Beweise nutzen dieselben Formen, Connectoren und freien Pfade wie der Mensch.
- Jeder Rechenschritt besitzt `reason`, `result` und optionale visuelle Referenzen; keine reine Endantwort.

## 10. Smart Ink

Smart Ink wird bewusst in drei getrennte Systeme aufgeteilt:

1. **Geometrie:** lokale Echtzeit-/Pen-up-Glättung und saubere Kurven.
2. **Semantik:** OCR/HTR liest Wörter und Mathezeichen als editierbaren Vorschlag für den Tutor.
3. **Formen:** Linien, Kreis/Ellipse, Rechteck und unregelmäßige Skizzen erhalten eigene Klassifikation und Tests.

P0-Refinement:

- Nach Pen-up resamplen und sanft glätten.
- Auf A4-Seiten optional Grundlinie, Höhe, Neigung und Wortabstand in kleinen Grenzen korrigieren.
- Bei niedriger Confidence nur glätten und eine Texttranskription vorschlagen.
- Mathezeichen nicht aggressiv neu anordnen.
- Originalpunkte immer behalten; Vorher/Nachher und Restore anbieten.

Das wird als „Smart Ink Lite“ bezeichnet. Es wird nicht behauptet, Apples proprietäre Handschriftverbesserung vollständig zu reproduzieren.

## 11. UX-Shell

### Bibliothek

- „Neues Heft“ und „Neues Whiteboard“ als klare Primäraktionen.
- Dokumentkarten mit Titel, letzter Änderung, Seitanzahl und Vorschau.
- Gaststatus ruhig erklären: lokal begonnen, optional später mit E-Mail sichern.

### Heft

- Linke schmale Seitenleiste mit A4-Thumbnails, Plus, Drag-Reihenfolge und Kontextmenü.
- Mitte als ruhiges Papier, kein Dashboard-Look.
- Kompakte Werkzeugleiste für Stift, Marker, Radierer, Auswahl, Form, Text und Bild.
- Unterer Tutor-Dock mit Kontextchips für Auswahl, Seite und AI-Pen.
- Schnellaktionen: „Erklären“, „Anders erklären“, „Beispiel“, „Prüf mich“.
- KI-Änderungen erhalten eine neutrale Vorschlagskontur und ein einziges Accept/Reject-Paar.

### Zustände

Loading, leere Bibliothek, speichernd, gespeichert, offline, Konflikt, Rate Limit, Tutorfehler, abgelaufenes MCP-Token und Recovery müssen jeweils eine absichtliche Oberfläche besitzen.

## 12. Sicherheit und Datenschutz

- Anonymous Auth erzeugt einen echten User; anonyme User nutzen die Postgres-Rolle `authenticated`.
- Jede exponierte Tabelle hat RLS mit Eigentumsprüfung `auth.uid() = owner_id` beziehungsweise über den Dokument-Join.
- `UPDATE`-Policies besitzen `USING` und `WITH CHECK`; Allow- und Deny-Fälle werden getestet.
- Tabellenrechte und RLS werden separat konfiguriert, da aktuelle Supabase-Projekte Tabellen nicht zwingend automatisch über die Data API exponieren.
- Private Storage Buckets und owner-scoped Pfade.
- OpenAI- und Service-Role-Key nur in Vercel Functions.
- Responses werden standardmäßig mit `store: false` ausgeführt; persistiert wird nur der für den Produktflow notwendige sichtbare Verlauf.
- Rate Limits pro User, Dokument und MCP-Token.
- Kein unnötiges PII; keine Schülerprofile im P0.

## 13. Umsetzungsplan bis zur Abgabe

### 4.–5. September — Phase 0: Basis, Eligibility, Design

- Neues Repo mit transparenter Herkunft und Baseline-Commit.
- `HACKATHON_DELTA.md`: vorbestehende Engine versus neue Hackathon-Arbeit.
- Organisatoren schriftlich um Bestätigung bitten, ob der vor dem 1. September begonnene Canvas als deklarierte Engine zulässig ist.
- Drei Figma-Kernansichten: Bibliothek, Heft, Smart-Ink-Vergleich.
- P0 einfrieren und Demo-Skript festlegen.

**Gate:** Herkunft nachvollziehbar, Scope eingefroren, kein Rewrite geplant.

### 6.–10. September — Phase 1: Heft und Persistenz

- Supabase-Projekt, lokale Migrationen und RLS-Tests.
- Anonymous Auth, Dokumentbibliothek und mehrere A4-Seiten.
- Autosave mit `baseRevision`, lokale Recovery, Reorder und Thumbnails.
- Realtime-Kanal für serverseitige/MCP-Änderungen.

**Gate:** Drei Seiten erstellen, neu laden und konfliktfrei wiederherstellen.

### 11.–14. September — Phase 2: gemeinsame Operationsschicht

- Canvas-Operationen aus dem WebMCP-Adapter in `BoardService` extrahieren.
- Turn-/Lease-/Proposal-Logik transportneutral machen.
- UI, Tests und späterer MCP-Handler sprechen ausschließlich über diese Schicht.

**Gate:** Gleicher Patch liefert in UI- und Server-Test denselben Szenenzustand.

### 15.–18. September — Phase 3: In-App-Tutor

- `/api/tutor`, Responses API, Streaming und begrenzter Tool-Loop.
- Pädagogische Systemregeln, Waagen- und Balkenmodell, Custom Paths, vollständige Rechenwege.
- Fehler-, Abbruch-, Rate-Limit- und Accept/Reject-Flow.

**Gate:** Mathe-Hero-Flow fünfmal hintereinander ohne manuelle Reparatur.

### 19.–21. September — Phase 4: Remote MCP

- Streamable HTTP MCP, gehashte scoped Tokens und identische BoardService-Tools.
- MCP Inspector Tests für Lesen, Schreiben, stale revision, scope denial und Batchabschluss.
- Realtime-Update zurück in die offene Seite.

**Gate:** Externer MCP-Client ergänzt die offene Heftseite sicher und live.

### 22.–23. September — Phase 5: Smart Ink

- Lokales Smoothing, OCR/HTR-Metadaten und begrenztes Refinement.
- Original-Restore und getrennte Formtests.
- Demo-Sätze und Mathezeichen auf Zielhardware prüfen.

**Gate:** Keine wahrnehmbare Stiftlatenz; Restore reproduziert Original.

### 24.–26. September — Phase 6: UX und fachliche Breite

- Tablet/Desktop-Polish, Tastaturbedienung, Kontrast und Screenreader-Status.
- Beispielhefte für Naturwissenschaft, Sprache und Geschichte.
- Export, Offline-/Konfliktzustände, Performance und Security prüfen.

**Gate:** vollständiger E2E- und Accessibility-Smoke; keine offenen P0-Fehler.

### 27.–28. September — Phase 7: Evidenz und Freeze

- Fünf bis acht Nutzertests und ein bis zwei Lehrkraft-Reviews.
- Ergebnisse dokumentieren, nur P0-Fehler beheben.
- Feature Freeze am 28. September.

### 29. September–1. Oktober — Phase 8: Einreichung

- Video auf etwa 4:40 schneiden, Screenshots, Architektur und Devpost-Text.
- Production Deployment, Backup-Demo und Generalprobe.
- Am 1. Oktober nur finaler Smoke-Test und frühzeitige Einreichung.

## 14. Verifikation

### Unit

- Schema-/Operationsvalidierung, Custom Paths, Textmessung, Layout und Design-Lint.
- Seitensortierung, Revisionsvergleich, Token-Hash und Smart-Ink-Grenzen.
- Linien, Kreis, Ellipse, Rechteck und unregelmäßige Form als getrennte Fälle.

### Integration

- Auth/RLS: Besitzer darf, fremder User darf nicht.
- Storage-Policies inklusive Upsert-Rechte.
- Atomarer Szenen-Patch mit richtiger und veralteter Revision.
- OpenAI-Tool-Loop mit Mockantworten.
- MCP-Scopes und Ablaufzeiten.

### Browser E2E

1. Gast startet und erstellt ein dreiseitiges Heft.
2. Zeichnet, speichert, ordnet Seiten und lädt neu.
3. Führt den gesamten Mathe-Hero-Flow aus.
4. Lehnt einen Batch ab und bestätigt exakten Rollback.
5. Refinet Handschrift und stellt Original wieder her.
6. Remote MCP schreibt in dieselbe Seite und Realtime aktualisiert die UI.
7. Wiederholt Kernflow auf Tabletbreite.

### Abschlusschecks

`typecheck`, Tests, Produktionsbuild, Dependency-Audit, Bundlegröße und Browser-Konsole müssen aufgezeichnet werden. Ein fehlender echter API-Key darf nur den Live-Modelltest blockieren, nicht die deterministischen Integrationstests.

## 15. Risiko- und Streichregeln

| Risiko | Frühwarnsignal | Reaktion |
|---|---|---|
| Eligibility der vorbestehenden Engine | Keine schriftliche Bestätigung bis 7.9. | Engine transparent abgrenzen; Umfang und Einreichung mit Organisatoren klären |
| API/MCP driften auseinander | Doppelte Tool-Implementierungen entstehen | Feature stoppen, beide auf BoardService zurückführen |
| Smart Ink wirkt schlechter | Zeichen werden semantisch verändert | Nur Glättung zeigen; Refinement hinter Opt-in und Restore |
| KI erzeugt überladene Seiten | Lint-/Overflow-Fehler im Hero-Flow | Toolbudget senken, strengere Kompositionsvorlagen |
| Supabase-Konflikte | Revisionen springen oder Saves verschwinden | Realtime pausieren, atomaren Save-Pfad und Recovery zuerst reparieren |
| Zeitverlust | P0 nicht bis 21.9. geschlossen | Multiplayer, Sharing, Voice, PDF-Import und eigenes ML streichen |
| Live-Modell unzuverlässig | Hero-Flow unter 90 % Erfolgsrate | Schema vereinfachen, Beispiele/evals erweitern, sichere Retry-Grenze |

## 16. Definition of Done

- Gast kann mehrere Hefte und Whiteboards mit mehreren Seiten dauerhaft speichern.
- Der dokumentierte Hero-Flow läuft Ende-zu-Ende.
- In-App-Tutor und Remote MCP besitzen echte Aktionsparität.
- Custom Drawings und vollständige Rechenwege sind editierbar und brauchen keine LaTeX-Eingabe.
- Smart Ink bewahrt Stil und Original; Grenzen werden ehrlich bezeichnet.
- Agentenänderungen sind validiert, markiert, annehmbar, ablehnbar und rückgängig.
- App ist auf Desktop und Tablet verständlich, responsiv und grundlegend barrierearm.
- Keine Secrets, ungesicherten Tabellen, öffentlichen privaten Dateien oder WebMCP-Abhängigkeit im finalen Produktpfad.
- Devpost-Seite, maximal fünfminütiges Video, Screenshots, öffentliches Repo und Live-Demo sind fertig.

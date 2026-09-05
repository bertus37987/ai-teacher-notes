# Zielarchitektur

Editierbare FigJam-Ansicht: [AI Teacher Notes – Zielarchitektur](https://www.figma.com/board/M165LL4yIfwlwHkpluPkhY?utm_source=other&utm_content=edit_in_figjam&oai_id=v1%2FCHVKxpovGFVAu9ua65qXIQPi0rH3gcvrhbPDndM2BRAr0n9LhbvZIo&request_id=47d66791-bb79-4acd-b621-c8d920968f18&architecture=true)

## Leitprinzip

Mensch, eingebauter Tutor und externer MCP-Agent erhalten keine getrennten Zeichenwege. Alle drei erzeugen dieselben `SceneOperation`-Objekte, die durch denselben Validator, dieselbe Transaktion und denselben Design-Linter laufen.

```text
Notebook UI -------┐
Tutor API ---------+--> SceneCommandService --> Validation --> Proposal/Commit
Remote MCP --------┘             |                       |
                                 |                       +--> Realtime event
                                 +--> Canvas composers   +--> Supabase revision
```

## Bestehende Module, die bleiben

- `src/document.ts`: vorhandenes Mehrseiten-/A4-Dokumentmodell als Referenz und Migrationsquelle.
- `src/strokes.ts`, `src/shapes.ts`, `src/rendering.ts`: Stift-, Formen- und Renderkern.
- `web-src/model.ts`: BoardElemente, Canvas-Operationen, Connectoren und Linting.
- `web-src/renderer.ts`: Canvas, Kamera, Auswahl, Lasso und Interaktion.
- `web-src/compositions.ts`: visuelle High-Level-Kompositionen.
- `web-src/measure.ts`, `web-src/theme.ts`: echte Textmessung und Designsystem.
- `web-src/store.ts`: History, Revisionen und Persistenzadapter.
- `web-src/collaboration.ts`: Turn-State, Lease, Proposal-Transaktion und Rollback.

`web-src/webmcp.ts` bleibt nur so lange als Referenzadapter bestehen, bis API und Remote MCP dieselbe Capability-Matrix erfüllen.

## Zielmodule

```text
web-src/
  shell/                 Bibliothek, Heftnavigation, Workspace
  notebook/              A4-Layout, Seitenthumbnails, Papierarten
  board/                 vorhandener Canvas-Kern und UI-Adapter
  tutor/                 Prompt-Dock, Streaming, Proposal-Review
  persistence/           IndexedDB, Supabase, Konflikte, Recovery
  smart-ink/             Geometrie, OCR/HTR, Refinement, Formen
shared/
  scene/                 Operationen, Schema, Validator, Inversen
  teaching/              Pädagogische Composer und Math-AST
  contracts/             API-/MCP-Verträge und Ereignistypen
api/
  tutor.ts               Responses-API-Orchestrierung
  mcp.ts                 Streamable-HTTP-MCP
  documents/             serverseitige dokumentgebundene Aktionen
supabase/
  migrations/            reproduzierbare Schemaänderungen
  tests/                 RLS-Allow-/Deny-Tests
```

Die endgültige Ordnerstruktur entsteht inkrementell. Ein Big-Bang-Move des vorhandenen Canvas ist nicht Teil des MVP.

## Dokument- und Seitentypen

```ts
export type DocumentKind = "notebook" | "whiteboard";
export type PageFormat = "a4" | "infinite";
export type PageTemplate = "blank" | "lined" | "grid" | "dotted";

export interface DocumentSummary {
  id: string;
  title: string;
  kind: DocumentKind;
  pageCount: number;
  activePageId: string | null;
  updatedAt: string;
}

export interface SceneEnvelope {
  pageId: string;
  revision: number;
  elements: BoardElement[];
  appState: PersistedPageState;
}
```

Ein Notebook besitzt eine geordnete Liste echter Seiten. Es ist nicht nur ein langes Canvas mit aufgemalten Papierflächen. Revision, Autosave und Konfliktbehandlung laufen pro Seite.

## Kanonische Szenentransaktion

```ts
export interface ScenePatchRequest {
  pageId: string;
  actor: "human" | "tutor" | "mcp";
  runId: string;
  patchId: string;
  baseRevision: number;
  editToken?: string;
  operations: SceneOperation[];
}

export interface ScenePatchResult {
  draftRevision: number;
  changedElementIds: string[];
  removedElementIds: string[];
  lintIssues: LintIssue[];
  previewBounds: Bounds | null;
  nextAction: "continue" | "repair" | "finish" | "conflict";
}
```

`patchId` ist ein Idempotency-Key. Schreibende Agentenaufrufe benötigen zusätzlich eine kurze Lease beziehungsweise ein `editToken`. Jede Operation wird gegen Seitenformat, erlaubte Objektarten, IDs, Punktzahl, Koordinatengrenzen und aktuelle Revision geprüft.

### Aktionsparität

Der gemeinsame Operation-Union umfasst mindestens:

- Ink, Text, Form, Pfeil, Connector, Bild, Highlight und Callout erstellen.
- Freien Pfad oder sicheres Custom-Symbol definieren und wiederverwenden.
- Verschieben, skalieren, drehen, stylen und Layer ändern.
- Gruppieren, verbinden, parenten, ausrichten und verteilen.
- Text und Pfadpunkte bearbeiten.
- Elemente im Proposal als entfernt markieren.
- Erklärungsschritte definieren und präsentieren.
- Seitenbezogene Metadaten ändern.

Agenten dürfen damit prinzipiell alles Sichtbare tun, was die UI tut. Autorisierungsaktionen wie Accept, Tokenverwaltung oder Kontowechsel bleiben ausdrücklich menschlich.

## Proposal- und Revisionsmodell

1. `beginEdit` fixiert `baseRevision`, Kontext und betroffene Element-Hashes.
2. Patches werden gegen eine Draft-Szene angewendet, nicht sofort gegen die Hauptszene.
3. Der Linter prüft Textfit, Überlappung, Seitenrand, Kontrast und Ziel-IDs.
4. Das Frontend zeigt den Draft als gekennzeichnetes Overlay.
5. `Accept` führt einen atomaren Compare-and-swap-Commit aus.
6. Bei Änderungen an denselben Elementen entsteht ein Konflikt.
7. Änderungen an unabhängigen Elementen dürfen nur anhand stabiler Element-Hashes sicher rebased werden.
8. `Reject` verwirft den Draft vollständig.
9. `Undo` schreibt den gespeicherten inversen Patch als neue Revision.

Externe MCP-Clients dürfen Proposals fertigstellen, aber niemals selbst akzeptieren.

## Tutor-Orchestrierung

`/api/tutor` verwendet die OpenAI Responses API und strikt definierte Function Tools.

Eingabekontext:

- aktuelle Seite als strukturierte, räumlich reduzierte Szene,
- vom Nutzer gewählte Elemente beziehungsweise AI-Lasso,
- OCR/HTR mit Confidence,
- ein gezielter visueller Crop statt pauschal jedes Bild,
- Titel und kurze akzeptierte Zusammenfassungen anderer Seiten.

Tool-Loop:

1. `inspect_context`
2. `publish_teaching_plan`
3. eine oder mehrere Scene-/Composer-Aktionen
4. `inspect_lint`
5. optionale Reparatur
6. `finish_contribution`

Der Standardturn besitzt ein Limit von sechs Werkzeugaufrufen. Für numerische Ergebnisse wird ein deterministischer Rechner verwendet; das Modell übernimmt Erklärung und Visualisierung, nicht die alleinige mathematische Wahrheitsprüfung.

## Visuelle Mathematik ohne LaTeX-Eingabe

```ts
export type MathNode =
  | { kind: "number"; value: string }
  | { kind: "identifier"; value: string }
  | { kind: "operator"; value: string }
  | { kind: "fraction"; numerator: MathNode; denominator: MathNode }
  | { kind: "power"; base: MathNode; exponent: MathNode }
  | { kind: "relation"; left: MathNode; operator: string; right: MathNode };
```

Der Math-Composer zerlegt diesen Baum in normale Text-, Linien- und Gruppenobjekte. Bruchstriche, schriftliche Addition, lange Division, algebraische Ketten und Zahlenstrahlen bleiben dadurch editierbar. Zusätzlich wird zugänglicher Klartext gespeichert; der Nutzer sieht und schreibt keine LaTeX-Syntax.

## Remote-MCP-Vertrag

Der P0-Endpunkt liegt unter `/api/mcp` und verwendet stateless Streamable HTTP.

- `list_documents`
- `read_page`
- `begin_page_edit`
- `apply_scene_patch`
- `create_visual_explanation`
- `create_worked_solution`
- `refine_handwriting`
- `manage_pages`
- `finish_page_edit`

Alle Schreibwerkzeuge benötigen `pageId`, `baseRevision`, `editToken` und `patchId`. Toolantworten enthalten `draftRevision`, betroffene IDs, Lintbefunde und `nextAction`.

Für den Hackathon reicht ein gehashter, zeitlich begrenzter Bearbeitungstoken mit Dokument-/Seiten-Scope. OAuth kann danach ergänzt werden; der Server muss dennoch von Beginn an so aufgebaut sein, dass Identität und Scope nicht aus Toolargumenten vertraut werden.

## Supabase-Schema

### Tabellen

- `documents`: Besitzer, Titel, Typ, aktive Seite, Zeitstempel.
- `pages`: Dokument, Position, Format, Vorlage, Szene, Revision, OCR-Kurztext, Thumbnailpfad.
- `page_revisions`: Patch, inverser Patch, Actor, Run und Zeitstempel.
- `agent_runs`: Seite, Basisrevision, Status, Prompt, sichtbarer Plan, Draft und Ablaufzeit.
- `tutor_messages`: sichtbare Nachrichten und Tool-Zusammenfassungen; kein verborgenes Reasoning.
- `ink_regions`: Stroke-IDs, Text, Sprache, Confidence und Refinementstatus.
- `assets`: privater Storagepfad und Metadaten.
- `mcp_tokens`: Hash, Scope, Ablaufzeit und Widerruf.
- `usage_counters`: Gast-, Tutor- und Uploadlimits.

### Indizes

- `documents(owner_id, updated_at desc)`
- `pages(document_id, position)` eindeutig
- `page_revisions(page_id, revision)` eindeutig
- alle Fremdschlüsselspalten
- `mcp_tokens(token_hash)` eindeutig

### Zugriff

- Anonymous Auth erzeugt eindeutige User-IDs und nutzt die Rolle `authenticated`.
- RLS prüft auf jeder Eigentumskette zusätzlich `auth.uid()`; `TO authenticated` allein genügt nicht.
- `UPDATE` erhält `USING` und `WITH CHECK`.
- Tabellenprivilegien werden explizit und minimal vergeben.
- Views sind `security_invoker` oder bleiben in einem nicht exponierten Schema.
- Storage ist privat und owner-scoped; Service Role existiert ausschließlich serverseitig.

## Offline, Autosave und Realtime

1. Lokale UI-Aktionen werden sofort in IndexedDB protokolliert.
2. Ein debounced Save sendet Szene und `baseRevision`.
3. Der Server committed atomar und gibt die nächste Revision zurück.
4. Realtime signalisiert Änderungen derselben Seite, besonders von MCP.
5. Die UI lädt gezielt die neue Revision und führt keine blinde Last-write-wins-Zusammenführung aus.
6. Bei Netzfehler bleibt die lokale Operation in einer Queue; Konflikte verlangen eine bewusste Wiederherstellung oder Duplikation.

CRDT und echtes Multiplayer-Editing sind kein P0-Ziel.

## Smart-Ink-Pipeline

```text
Pointer Samples -> Stroke Modeler -> Pen-up Geometry -> OCR/HTR Metadata
                                              |               |
                                              +--> Safe Refine Proposal
```

- Während des Schreibens läuft kein schweres Modell.
- OCR, geometrische Glättung und Formenerkennung sind getrennt.
- Niedrige Confidence verhindert semantische Ersetzung.
- Originalpunkte bleiben erhalten.
- Mathezeichen werden nicht automatisch umsortiert.
- Shape-Tests unterscheiden Linie, Kreis, Ellipse, Rechteck, Pfeil und bewusst unregelmäßige Form.

## Sicherheitsgrenzen

- Seitentext, OCR, Uploads und externe MCP-Inhalte sind untrusted data.
- Keine Scripts oder externen URLs in benutzer-/agentengenerierten Pfaden oder SVGs.
- Harte Limits für Operationen, Punkte, Koordinaten, Textlänge, Uploadgröße und Turndauer.
- Keine Base64-Dateien in Szenen; nur private Assetreferenzen.
- OpenAI-Key und Supabase Service Role nie im Browser.
- Rate Limits pro User, Dokument und MCP-Token.
- Protokolliert werden sichtbare Aktionen und Fehler, nicht geheime Inhalte oder vollständige Prompts ohne Bedarf.

## Technische Release-Gates

- Derselbe Patch erzeugt client- und serverseitig denselben Hash.
- Jede menschliche SceneOperation ist auch für Tutor/MCP verfügbar oder als bewusste Autorisierungsgrenze dokumentiert.
- Stale Revision lehnt den gesamten Batch ohne Teilmutation ab.
- Reject stellt den exakten Zustand vor dem Run wieder her.
- Custom Paths bleiben nach Speichern und Reload editierbar.
- Rechenwege überlaufen keine A4-Seite.
- RLS-Allow-/Deny-Tests, MCP Inspector und Browser-E2E bestehen.

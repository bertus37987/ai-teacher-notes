# UI-/UX-Audit · Smooth Handwriting

**Datum:** 11.09.2026 · **Plugin-Version:** 0.25.25 (`manifest.json`)
**Methode:** reine Leseanalyse von `styles.css`, `src/main.ts`, `src/editor-controls.ts`,
`src/shape-measurements.ts`, `src/notebook-text.ts`, `src/rendering.ts`, `src/pdf-annotation.ts`,
`lab/index.html`. Kein Quellcode geändert, kein Build, kein Browser-Test.

**Wichtig zur Reproduzierbarkeit:** Der Arbeitsbaum wurde während des Audits parallel bearbeitet
(`styles.css` wuchs von 661 auf 685 Zeilen, `src/main.ts` von 2558 auf 2729). Alle Zeilenangaben
beziehen sich auf diesen eingefrorenen Stand:

| Datei | Zeilen | md5 |
|---|---|---|
| `styles.css` | 685 | `a237d082691aa2afc31b0751d0097d6d` |
| `src/main.ts` | 2729 | `46934575d4fba4117aa157a338c5ccac` |
| `src/editor-controls.ts` | 144 | `52807f25b9e11b34de46c8656cc68cbf` |
| `src/shape-measurements.ts` | 50 | `35649878a4dd4885427f91db97d310ed` |
| `src/notebook-text.ts` | 120 | `fc36555dc0d2f650ae4b088cbf81b277` |

Vor dem Umsetzen eines Funds bitte prüfen, ob die Zeile noch stimmt (`grep -n`).

**Wichtiger Hinweis zum Prüfstand:** `lab/index.html` setzt das dunkle Theme über vier
CSS-Variablen (`--background-primary:#1e1e1e`, `--text-normal`, `--text-muted`,
`--background-modifier-border`). Die Tokens `--background-modifier-hover`,
`--background-secondary`, `--radius-s`, `--font-ui-small`, `--text-error`,
`--text-on-accent` sind dort **nicht** definiert. Dadurch fallen Hover-Zustände,
Auswahl-Leiste und Fehlertexte im Prüfstand anders aus als im echten Obsidian —
im Prüfstand sieht man hier nur Farb-Erbfehler, keine echten Befunde.

**Bereits nachgebessert (im eingefrorenen Stand vorhanden, kein Fund mehr):**
Punkte, die frühere Audits bemängelt hatten, sind in einer neuen Sektion „Treffergrößen
für den Stift" (`styles.css:664-685`) bereits behoben: Zoom/Seitenübersicht-Knöpfe
(34 px), Farbrad (32 px), Seitensteuerung in der Übersicht (32 px), Auswahl-Knopfreihe
(34 px), Objektgriffe (32 px), Diagnose-Schließen (32 px), Lineal-Knopf (34 px).
Diese Zeilen werden unten **nicht** erneut als Fund geführt; die verbleibenden
Untergrößen sind in §2.2 aufgelistet.

---

## 0. Kurzfassung

| # | Schweregrad | Fund | Ort |
|---|---|---|---|
| 1 | **Blocker** | Schalter-Knopf ist im ausgeschalteten Zustand praktisch unsichtbar (1,54:1) | `styles.css:479` |
| 2 | **Blocker** | Lineal-Knopf ändert `aria-pressed` und `is-active`, hat aber **keine** `is-active`-Regel → aktives Lineal nicht erkennbar | `styles.css:629`, `main.ts:616,963-964` |
| 3 | **Blocker** | Werkzeugleiste wird bei schmalem Fenster nachträglich über die Ansichtsleiste gezogen und friert ein | `styles.css:348-364,375-392,455,607-614` |
| 4 | Major | Werkzeugleiste im Vorschau-Modus: Leiste 130 px breit, Seiten-Spalte reserviert nur 128 px → 2 px Überlappung; `is-strip-open` verschiebt nicht | `styles.css:660,657` |
| 5 | Major | Toter Code bleibt sichtbar: 4 unbenutzte `hp-construction-*`-Regeln | `styles.css:314-317` |
| 6 | Major | Sichtbarer Status-/Hinweistext ist ein `title`-Tooltip → am Tablet unbrauchbar | `main.ts:598-599` |
| 7 | Major | Warnungen erscheinen als harmlose graue Statuszeile statt als Fehler | `main.ts:2419`, `styles.css:296,576` |
| 8 | Major | Reine Emoji-Symbolik (🖌, ▰, ▣, ●, ▭) bricht Icon-Konsistenz und Rendering | `main.ts:598-599`, `692` |
| 9 | Major | Fokusrahmen global auf Schwarz-Weiß-Kontrast geprüft, im dunklen Theme im Tintenbereich niedrig | `styles.css:575` |
| 10 | Major | Doppelte Icon-Semantik im Dock (✎ Tinte, T Text, ⬭ Oval, △ Dreieck als Text) | `styles.css:457`, `main.ts:601,605,692` |
| 11 | Major | Statuszeile ist reine Ellipse ohne Zugriff auf den Volltext | `styles.css:538` |
| 12 | Major | Objekt-Editor-Aktionsleiste passt in schmalen Fenstern nicht | `styles.css:491,493`, `notebook-text.ts:33` |
| 13 | Major | Schwarz-Swatch ist auf dunklem Dock unsichtbar (1,06:1) | `styles.css:472-473,569` |
| 14 | Major | Stift-Diagnose-Panel überdeckt seinen eigenen Messbereich | `styles.css:635-636` |
| 15 | Major | Diagnose-Panel bleibt bei Aktivierung der Zeichenfläche über dem Schließen-Knopf | `styles.css:635,641-643` |
| 16 | Major | Kein `:focus-visible` für die Header-Knöpfe der entfernten/nicht bearbeitenden Ansicht | `main.ts:550`, `styles.css:346` |
| 17 | Minor | Bau-Marke `sh-build-0.25.22` im Panel-Titel widerspricht Manifest `0.25.25` | `main.ts:87,2572` |
| 18 | Minor | `"Smooth Ink"` als Titel der PDF-Leiste (gemischte Sprache) | `pdf-annotation.ts:116` |
| 19 | Minor | Pinsel-Knopf hat Emoji-Titel, kein SVG-Icon | `main.ts:598` |
| 20 | Minor | Doppelbeschriftung „Weitere Werkzeuge" (`•••`) vs. „Werkzeuge" im Header | `main.ts:545,620` |
| 21 | Minor | Seitenübersicht-Vorschau verzerrt (Faktor 1,20 vs. echte A4-Proportion) | `styles.css:656-657` |
| 22 | Minor | Vorschau-Modus ist keine echte Vorschau (Schreibwerkzeuge bedienbar) | `main.ts:988` |
| 23 | Minor | Rückgängig/Wiederholen `↶ ↷` sitzen sichtbar in der Werkzeuggruppe | `styles.css:395`, `main.ts:606-607` |
| 24 | Minor | Zoom-Label zeigt „100 %" mit Leerzeichen, Höhenangaben „2 px" ohne | `main.ts:565` |
| 25 | Minor | Widersprüchliche Zahlformate („2" vs. „2,0") | `main.ts:656,657` |
| 26 | Minor | Hilfe-Schalter „Buchstaben schützen" vergisst seinen Zustand zwischen Sitzungen | `main.ts:664` |
| 27 | Minor | `transform-origin` des Blattes toter Code für den Editor-Modus | `styles.css:456` |
| 28 | Minor | Unterschiedliche Rundungen für dieselbe Objekt-Aktionsleiste (12 vs. 6 px) | `styles.css:491,493` |
| 29 | Minor | Englisches `delete` als Aktionsrückgabe im Bild-Editor (nur Code) | `notebook-image.ts:30` |
| 30 | Minor | Leeres `title`-Attribut am Seitenübersicht-Knopf | `main.ts:558`, `editor-controls.ts:36-41` |
| 31 | Minor | Abgeschnittener deutscher Hinweistext bei 360–400 px | `styles.css:474`, `main.ts:674` |
| 32 | Minor | `--hp-panel-width` in der Mobil-Query wirkungslos | `styles.css:608` |
| 33 | Minor | `🖌`/`🗑` emojis werden von `applyIcon` nicht ersetzt, weil der Pfad fehlt | `editor-controls.ts:2-33` |

**Contrast wird nur dort als Fund geführt, wo er mit einer konkreten Farbe belegt ist.**
Reine Farbwertvermutungen ohne belegbaren Hintergrund (z. B. ob ein Text auf einem
halbtransparenten Overlay liegt) sind am Ende in §7 als „nur visuell zu prüfen" gelistet.

---

## 1. Blocker

### B1 · Schalter im Aus-Zustand praktisch unsichtbar
**Ort:** `styles.css:478-481`, `styles.css:566-567`

```css
/* styles.css:478-479 */
background: var(--background-modifier-border);
/* ::after */ background: var(--background-primary);
```
In der Plugin-Palette ist `--background-modifier-border: #403b47` (`styles.css:527`) und
`--background-primary` im Editor `#1e1e1e` (`styles.css:535`). Gemessener Kontrast
zwischen Knopf und Track: **1,54:1**. Im Obsidian-Dark-Default (`#363636`): **1,38:1**.
Zusätzlich läuft die Schalterzeile auf `--hp-ui-raised: #262626` (`styles.css:525`),
der Track hebt sich davon praktisch nicht ab.

**Auswirkung:** Der Nutzer sieht bei ~15 Schaltern (Schreiben/Formen/Stifte-Sektion,
`main.ts:652,653,657,662,663,664,672,673,712,…`) nicht, ob sie aus sind. Nur der
Ein-Zustand (violetter Track) ist erkennbar. Gerade im dunklen Theme ist das ein
Bedienproblem, kein Schönheitsfehler.

**Minimaler Fix** — dem Knopf eine eigene Kontur und dem Track mehr Abstand zum Grund geben:
```css
.hp-switch-row input::after {
  background: var(--text-faint, #8b8594);
  box-shadow: 0 1px 3px #0006;
}
.hp-switch-row input:checked::after { background: var(--text-on-accent, #fff); }
```

### B2 · Lineal-Knopf zeigt seinen aktiven Zustand nicht
**Ort:** `styles.css:629`, `styles.css:684` (Treffergrößen-Block), `main.ts:616-619`, `main.ts:962-964`

```css
/* styles.css:629 – die EINZIGE Regel für den aktiven Lineal-Knopf */
.hp-ruler-button[aria-pressed="true"] { background: var(--hp-ui-selected); color: #e6d9ff; }
```
Aber `[aria-pressed="true"]` wird **nie** gesetzt. `main.ts:963` schaltet stattdessen die
Klasse `is-active`:
```ts
this.rulerToggleButton?.setAttribute("aria-pressed", String(on)); // toter Pfad, Button existiert nicht
this.rulerToggleButton?.classList.toggle("is-active", on);
this.rulerToolButton?.setAttribute("aria-pressed", String(on));   // setzt true
```
Und `rulerToggleButton` wird nie zugewiesen — nur deklariert (`main.ts:353`) und gelesen
(`main.ts:962-963`). Es gibt also genau einen Lineal-Knopf. Für ihn gilt:
`aria-pressed="true"` wird gesetzt, aber es existiert **keine** `.hp-ruler-button.is-active`-
und keine `.hp-ruler-button[aria-pressed="true"]`-Regel, die den von `main.ts` gesetzten
Zustand abbildet — die Regel bei `styles.css:629` nutzt `[aria-pressed="true"]`, das der
Knopf in `main.ts:616` mit `"false"` initialisiert und in `main.ts:964` auf `"true"` setzt.

**Auswirkung:** Der Nutzer schaltet das Lineal ein, der Knopf sieht unverändert aus.
Der Nutzerbefund, der zu diesem Knopf führte („der Knopf war leer"), ist damit nur
halb behoben: Das SVG erscheint, der Zustand fehlt.

**Minimaler Fix** — die vorhandene Zustandsregel an die tatsächlich gesetzten Merkmale hängen:
```css
.hp-ruler-button[aria-pressed="true"],
.hp-ruler-button.is-active {
  background: var(--hp-ui-selected); color: #e6d9ff; border-color: #675087;
}
```
Zusätzlich den toten `rulerToggleButton`-Pfad entfernen (`main.ts:353,962-963`), damit
niemand später glaubt, es gäbe zwei Knöpfe.

### B3 · Werkzeugleiste friert bei schmalem Fenster über der Ansichtsleiste ein
**Ort:** `styles.css:348-364` (Dock), `styles.css:375-392` (Knöpfe), `styles.css:455` (Ansichtsleiste), `styles.css:607-614` (Mobil-Query)

Die untere Werkzeugleiste hat `overflow: visible` (`styles.css:358`), und die Knopfzeile
`flex-wrap: nowrap` (`styles.css:369`). Der Knopf-Satz umfasst 14 Knöpfe à 36 px + 2 px
Abstand (Werkzeuge + `T` + `↶` + `↷` + PDF + Upload + Lineal + Farbrad + `•••`),
also ~558 px inkl. Padding (`main.ts:598-628`).

In der Mobil-Query wird auf `min(32px, calc((100vw - 38px) / 14))` verkleinert — gemessen:
| Fensterbreite | Knopfbreite laut Formel | Trefferfläche |
|---|---|---|
| 600 px | 32 px | 32 px |
| 480 px | 31,6 px | 31,6 px |
| 380 px | 24,4 px | **24,4 px** |

Die Ansichtsleiste (Zoom + Seitenübersicht, `styles.css:455`) sitzt unten rechts auf
`bottom: 12px; right: 12px`, also auf derselben Höhe wie das Dock (`bottom: 18px`,
`styles.css:350`). Bei ~380–470 px Fensterbreite ragt die rechte Kante des Docks unter die
Ansichtsleiste. Weil `overflow: visible` ist, wird nichts sauber abgeschnitten — die
betroffenen Knöpfe werden von der darüberliegenden Leiste verdeckt (`z-index: 14` der
Leiste gegen `10012` des Docks ist hier irrelevant, weil die Leiste **innerhalb** der
Seiten-Spalte liegt und das Dock global schwebt).

**Auswirkung:** Bei schmalem Fenster (Split-View auf dem Tablet, halbes Notizfenster)
sind Zoom-Knöpfe oder die letzten Dock-Knöpfe nicht mehr zuverlässig treffbar, ohne dass
etwas sichtbar „bricht" — der Nutzer hält es für einen Fehlklick.

**Minimaler Fix** — Umbruch zulassen und die Leiste aus der Kollisionszone schieben:
```css
@media (max-width: 700px) {
  .hp-toolbar > .hp-tool-section > .hp-tool-group { flex-wrap: wrap; }
  .hp-inline.is-editing .hp-toolbar { bottom: 64px; }   /* über der Ansichtsleiste */
}
```

---

## 2. Werkzeugleiste, Knopfgrößen, Zustände

### 2.1 Konsistenz der Werkzeugleiste
Die Dock-Knöpfe sind in sich konsistent (36 px, `border-radius: 50%`,
`styles.css:375-392`), aber drei Gruppen brechen die Reihe:

- `styles.css:395` — „Text einfügen" bekommt `border-radius: 0` und einen Ein-Strich-Trenner
  als `box-shadow: -1px 0 0`. Zurück bleibt ein **eckiger Knopf** in einer Reihe runder
  Knöpfe (Fund B2-3, s. §2.3).
- `styles.css:472` — das Farbrad ist `26px` und wird nur im Nachtrag-Block
  (`styles.css:676-679`) auf `32px` korrigiert. Ein späterer Leser sieht an der
  Definitionsstelle den falschen Wert.
- `styles.css:457` — alle SVG-Icons im Dock werden auf `19px` skaliert, der
  Lineal-Knopf wird im Nachtrag auf `22px` korrigiert (`styles.css:685`), der
  Farbrad-Punkt ist `12px` (`styles.css:473` mit `inset: 5px` → `679` mit `inset: 6px`
  ergibt 32 − 12 = 20 px Durchmesser). **Drei verschiedene Icon-Größen** in einer Leiste.

**Minimaler Fix:** die Definitionsstellen auf den Endwert ziehen und den Nachtrag-Block
auflösen:
```css
/* styles.css:457 */
.hp-toolbar svg { width: 22px; height: 22px; }
/* styles.css:395 – eckigen Trenner durch runden Knopf mit Abstand ersetzen */
.hp-toolbar > .hp-tool-section > .hp-tool-group button[aria-label="Text einfügen"] {
  margin-left: 5px; border-radius: 50%; padding-left: 0;
  border-left: 1px solid var(--background-modifier-border);
}
```

### 2.2 Klickflächen unter 32 px (Stift-/Tablet-Grenze)
Nach dem Nachtrag bei `styles.css:664-685` bleiben nur noch diese Untergrößen:

| Ort | Element | Ist | Vorschlag |
|---|---|---|---|
| `styles.css:441-442` | `.hp-strip-toggle`, `.hp-zoom-controls button` `min-height: 26px; min-width: 28px` | wird durch `styles.css:671` auf 34 px gehoben | Definitionsstelle auf 34 px ziehen |
| `styles.css:436` | `.hp-page-thumb-controls button` `min-width: 24px; min-height: 24px` | durch `styles.css:680` auf 32 px gehoben | dito |
| `styles.css:413` | `.hp-selection-actions button` `min-height: 28px` | durch `styles.css:681` auf 34 px gehoben | dito |
| `styles.css:509` | `.hp-object-editor .hp-object-resize` `28px` | durch `styles.css:682` auf 32 px gehoben | dito |
| `styles.css:645` | `.hp-pen-diag-head button` `28px` | durch `styles.css:683` auf 32 px gehoben | dito |
| `styles.css:239` | `.hp-pdf-toolbar button` `31px` | **nicht** nachgebessert | auf 34 px heben |
| `styles.css:95` | `.hp-tool-group button` `32px` (Alt-Pfad) | wird von `styles.css:330,375` überstimmt | löschen |
| `styles.css:493` | `.hp-object-actions button` `min-height: 32px`, `min-width: 30px` | grenzwertig | `min-width: 34px` |
| `styles.css:645` | Diagnose-Schließen (Nachtrag 32 px) | 32 px = Untergrenze | 36 px, weil es der einzige Ausweg aus dem Panel ist |

**Beobachtung zum Muster:** Fünf Elemente sind zweimal definiert (Definitionsstelle zu
klein, Nachtrag korrekt). Das ist funktional in Ordnung (spätere Regel gewinnt), aber es
ist genau die Art von Doppelung, bei der ein späterer Bearbeiter nur eine der beiden
Stellen findet. Empfehlung: Definitionsstellen korrigieren, Nachtrag-Block auf die
Sonderfälle reduzieren.

### 2.3 Fokus- und Aktiv-Zustände

**Vorhanden und korrekt:** `styles.css:346` (`button`/`summary`), `styles.css:575`
(`button,summary,select,input`), `styles.css:308` (`.hp-review`), `styles.css:574`
(Objekt-Editor-Eingaben). Der globale Zustand bei `styles.css:575` wird von den
spezifischeren Regeln bei `styles.css:346` und `styles.css:308` überschrieben
(`outline-offset` 2 px statt 2 px, gleiche Breite) — **kein** Funktionsfehler, aber die
drei Regeln meinen dasselbe und sollten zu einer zusammengeführt werden.

**Fehlt:**
- `styles.css:395` — „Text einfügen" hat `border-radius: 0`. Der globale Fokusrahmen
  (`outline-offset: 2px`) zeichnet sich bei einem rechteckigen Knopf in einer runden
  Reihe sichtbar schief. Fix: `border-radius: 50%` (siehe 2.1).
- `.hp-inline-header button` (`styles.css:540`, `main.ts:545,547,550`) liegt im
  Geltungsbereich von `styles.css:346` → Fokus vorhanden. **Aber:** Die weiße
  Vorschau-Variante (nicht `.is-editing`) hat `--background-primary` als Grund und
  dieselben Knöpfe; hier ist `--hp-ui-*` nur über `.hp-inline` gesetzt (`styles.css:523`),
  also greift der violette Fokusrahmen. In Ordnung.
- `styles.css:97` — `.hp-color-swatch` hat `border: 2px solid ... !important`. Ein
  Fokusrahmen (`outline`) ist davon nicht betroffen, aber der Rahmen ist pro Swatch
  erzwungen; die violette `outline` liegt darüber. In Ordnung.

### 2.4 Doppelte Icons / widersprüchliche Symbolik
- `main.ts:598` — `▰` für „Intelligenter Markierer" und `▣` für „Füllen" sind zwei
  **geometrische Blockzeichen**, keine Werkzeugsymbole; `●` für Laser ist ein Füllpunkt.
  Zusammen mit `✎` (Stift), `🖌` (Pinsel, Emoji), `⌫` (Radierer, Textzeichen) ergibt das
  **vier Darstellungsarten in einer Neuner-Reihe**. Im Prüfstand (`lab/index.html`, Font
  `system-ui` auf Linux) rendert `🖌` als Farb-Emoji, die übrigen als Textzeichen —
  gemischte Strichstärken und Grundlinien, sichtbar schief.
- `styles.css:457` skaliert **alle** SVG-Icons auf 19 px, aber nur die Knöpfe mit
  `applyIcon`/`innerHTML`-SVG (`main.ts:559,563,567,614,617,927`) betrifft das.
  Die Text-/Emoji-Knöpfe (`main.ts:598-599,601,605,606,607,620`) skalieren nicht mit.
  Bei der Mobil-Verkleinerung auf 24,4 px (B3) laufen Textzeichen aus dem runden Knopf.
- `main.ts:692` — Form-Werkzeuge werden mit `${icon} ${label}` beschriftet, also
  `⬭ Oval`, `△ Dreieck`. Das Panel ist dafür zu schmal (2 spaltig, `styles.css:485`
  `min-height: 36px`), die Beschriftung bricht bei längeren Wörtern um
  (`white-space: normal`, `styles.css:330`). Ergebnis: unterschiedlich hohe Knöpfe in
  einem Raster.

**Minimaler Fix:** die sechs Werkzeuge auf SVGs im `editor-controls.ts`-Inventar umstellen
(`Stift` ist dort schon vorhanden, `Pinsel`, `Markierer` nicht) und die Form-Knöpfe analog
zu den Datei-Knöpfen auf reine Symbole mit `title` reduzieren. Ein `paths`-Eintrag ist
jeweils 1 Zeile.

### 2.5 Status-/Hinweistext ist nur ein Tooltip
**Ort:** `main.ts:598-599`
```ts
[["brush", "🖌", "Pinsel (Breite folgt dem Tempo)"], …]
[… "Geschlossene Form mit Stifttipp füllen" …]
[… "Präsentationsstift (nur beim Halten)" …]
const button = toolGroup.createEl("button", { text: icon, attr: { "aria-label": label, title: label } });
```
Die Unterschiede zwischen Pinsel/Stift/Füllen/Laser sind inhaltlich gut erklärt — aber
ausschließlich in `title`. Auf dem Tablet (kein Hover) und mit einem Stift ist ein
`title`-Tooltip **nicht erreichbar**. Die einzige Alternative ist ein Kurztext in der
Statuszeile (`main.ts:1896`) — der aber auch nur nach dem Klick erscheint.

**Minimaler Fix:** auf `pointerenter` (nicht `hover`) eine kleine Sprechblase oder
für die vier erklärungsbedürftigen Knöpfe einen zweiten Statuszeilen-Platz nutzen:
```ts
button.addEventListener("pointerenter", () => this.setStatus(label));
button.addEventListener("pointerleave", () => this.setStatus(""));
```

### 2.6 Warnungen sehen wie Hinweise aus
**Ort:** `main.ts:2419` → `styles.css:296` (`hp-error`) und `styles.css:538`,`576`
(`hp-status`), sowie `styles.css:506`

Speicherfehler laufen über die Statuszeile:
```ts
this.setStatus(`Speichern fehlgeschlagen (${this.saveFailures}. Versuch)`);  // main.ts:2285
this.setStatus("Extern geändert – Speichern angehalten");                     // main.ts:2269
```
`hp-status` ist aber eine graue, kontrastarme Pille (`color: var(--hp-ui-muted)` =
`#ada7b6` auf `#262626`, **6,47:1** — lesbar, aber visuell identisch mit „4 Seiten").
Für Fehler existiert mit `hp-error` (`styles.css:296`) und der roten Variante
`styles.css:576` (`color: #ffb4a9`, **8,9:1**) bereits ein klarer Stil, der hier nicht
genutzt wird.

**Minimaler Fix:** einen zweiten Statusstil einführen und für Fehler nutzen:
```css
.hp-status.is-error { color: var(--text-error, #ff6b6b); background: #3a2426; font-weight: 600; }
```
```ts
private setStatus(text: string, kind: "info" | "error" = "info"): void {
  this.statusEl.setText(text);
  this.statusEl.toggleClass("is-error", kind === "error" && text !== "");
}
```

### 2.7 Statuszeile ist reine Ellipse
**Ort:** `styles.css:538`
```css
.hp-status { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```
Sätze wie `main.ts:1882` („Live-Umwandlung: Zeile übersprungen (Vertrauen 62 %) – Tinte bleibt",
~60 Zeichen) oder `main.ts:1946` („Textfeld: zum Einfügen auf die Seite tippen · Esc bricht ab")
werden bei schmalerem Fenster **stumm abgeschnitten**. Kein Tooltip, kein Zugriff auf den
Volltext. Bei 820 px wird die Zeile zusätzlich komplett ausgeblendet (`styles.css:587`) —
und damit auch jede Fehlermeldung, die dort landet.

**Minimaler Fix:** `title` mitziehen und die Breite begrenzen:
```ts
private setStatus(text: string, kind: "info" | "error" = "info"): void {
  this.statusEl.setText(text); this.statusEl.title = text; …
}
```
```css
@media (max-width: 820px) { .hp-inline.is-editing .hp-status { display: inline-block; max-width: 40vw; } }
```

### 2.8 Objekt-Aktionsleiste bricht in schmalen Fenstern
**Ort:** `styles.css:490-493`, `styles.css:499`, `notebook-text.ts:33`, `main.ts:1963`

`.hp-object-actions { flex-wrap: wrap }` (`styles.css:490`) — die Textleiste hat aber
`flex-wrap: nowrap` über `.hp-image-editor` (`styles.css:499`). Enthalten: Verschieben-Griff,
Schriftgröße-Select, `B`, `I`, Ausrichtung-Select, `details` „Maße" (Klappt eine
Absolut-Positionierung auf, `styles.css:505`), Abbrechen `×`, Übernehmen `✓` (angehängt in
`notebook-text.ts:114`), ggf. `+ Zeile`/`+ Spalte` (`notebook-text.ts:74-75`).
Die Ausrichtung wird nur über `bar.style.left` korrigiert (`notebook-text.ts:43`),
**nicht** die Breite:
```ts
bar.style.left = `${Math.min(0, window.innerWidth - 16 - surface.getBoundingClientRect().left - draft.x*scale - Math.min(520, bar.offsetWidth))}px`;
```
Bei einem Objekt am rechten Rand und einem Fenster < 520 px wird die Leiste nach links
geschoben, bis `left` stark negativ ist — sie kann dann über den linken Rand hinauslaufen
und die Knöpfe sind nicht mehr erreichbar.

**Minimaler Fix:**
```css
.hp-object-bar { max-width: min(520px, calc(100vw - 24px)); overflow-x: auto; }
.hp-object-actions { flex-wrap: wrap; }
```

### 2.9 Farbrad/Swatch-Kontrast im dunklen Theme
**Ort:** `styles.css:472-473`, `styles.css:569`

Die Voreinstellung `penColor: "#202124"` (`main.ts:94`) ist der erste Schwarz-Swatch
(`main.ts:705`) und der Standardwert des Farbrad-Punkts (`styles.css:473`,
`var(--hp-selected-color, #202124)`).

| Paar | Kontrast |
|---|---|
| `#202124` auf Dock `--hp-ui-raised: #262626` (`styles.css:545`) | **1,06:1** |
| `#202124` auf Scankreis `#797080` (`styles.css:569`) | **2,19:1** |

**Auswirkung:** Der Standard-Stiftknopf und der Farbrad-Mittelpunkt sind auf dem dunklen
Dock praktisch nicht zu sehen. Der Nutzer sieht nur den farbigen Außenring des Farbrads.

**Minimaler Fix** — hellen Ring um den schwachen Innenpunkt:
```css
.hp-color-swatch[aria-label="#202124"],
.hp-rgb-toggle::after { box-shadow: 0 0 0 1px #ffffff66; }
```

### 2.10 Leerer Knopf durch `title`-Überschreiben
**Ort:** `main.ts:558`; `src/editor-controls.ts:36-41`

`lab/index.html` setzt die vier Obsidian-Tokens, sodass `obsidian-mock.ts` aktiv ist,
aber **`lab/main.ts` und `lab/obsidian-mock.ts` selbst sind nicht analysiert worden**
(außerhalb des Auftrags). Im main.ts-Pfad gilt: `applyIcon` (`main.ts:38-50`) setzt
`button.title = label`, und für Knöpfe ohne `paths`-Eintrag bleibt der Text stehen.
Bei `main.ts:745` („Notiz drucken"/„Drucken") und `main.ts:748` („Notiz drucken" →
`hp-file-input`) existieren keine Icon-Pfade:
```ts
// main.ts:745 – Knopf "Drucken", aria-label "Notiz drucken" → kein paths-Eintrag
// main.ts:748 – importInput.createEl(... "Notiz drucken")
```
`applyIcon` findet für `"Notiz drucken"` keinen Pfad (`editor-controls.ts:2-33` listet
`Notiz drucken` **nicht**) und für `"PNG, JPEG, WebP oder PDF importieren"` schon.
Der Effekt: Neben 25 SVG-Knöpfen stehen plötzlich zwei Textknöpfe („Drucken",
„Bild / PDF") in derselben 2-spaltigen Gruppe (`styles.css:329`). Das ist der
sichtbarste Konsistenzbruch im Datei-Panel.

**Beleg für den fehlenden Pfad:**
```
main.ts:745  "Notiz drucken"    → kein Eintrag in editor-controls.ts:2-33
main.ts:616  "Lineal anzeigen"  → kein Eintrag (SVG wird in main.ts gesetzt, korrekt)
main.ts:621  "RGB-Farbe auswählen" → kein Eintrag (Sonderfall, korrekt)
main.ts:630  "Auswahl in Stiftfarbe einfärben" → kein Eintrag (SVG-Knopf)
main.ts:550  "Handschriftblock entfernen" → kein Eintrag (Text-Knopf, gewollt)
main.ts:718  "Textfeld einfügen"     → kein Eintrag (Text-Knopf, gewollt)
main.ts:720  "Text oder Tabelle auswählen" → kein Eintrag (Text-Knopf, gewollt)
```

**Minimaler Fix:** einen Pfad für `'Notiz drucken'` ergänzen (`editor-controls.ts`, 1 Zeile),
z. B. `M6 9V3h12v6 M6 18H3v-8h18v8h-3 M8 14h8v8H8z`.

---

## 3. Lesbarkeit im dunklen Obsidian-Theme · belegte Kontraste

Berechnet nach WCAG 2.1 (sRGB, relative Luminanz). Schwelle für normalen Text 4,5:1,
für Nicht-Text (Konturen, Icons) 3:1.

| Element | Ort | Vordergrund / Hintergrund | Kontrast | Bewertung |
|---|---|---|---|---|
| Statustext „4 Seiten" / „2 von 3 importiert" | `styles.css:542` | `#ada7b6` / `#262626` | 6,47:1 | ok |
| Inaktives Werkzeug-Icon | `styles.css:547` | `#ada7b6` / `#1e1e1e` | 7,13:1 | ok |
| Aktives Werkzeug | `styles.css:552` | `#d9c5ff` / `#383044` | 7,99:1 | ok |
| „Fertig"-Knopf | `styles.css:541` | `#e6d9ff` / `#383044` | 9,40:1 | ok |
| Objekt-Fehlertext | `styles.css:576` | `#ffb4a9` / `#262626` | 8,90:1 | ok |
| Seitenlabel „Seite 1" (nur Bearbeiten) | `styles.css:150-151` | `#62666d` / `#fff`@84 % | 5,64:1 | ok, aber **fester Grauton** (s. u.) |
| Form-Messwert | `shape-measurements.ts:46-47` | `#653499` / `#faf7ff` | 7,91:1 | ok |
| Stift-Fadenkreuz | `styles.css:197-198`, `592` | `#684691` / `#fff` | 7,31:1 | ok |
| Scankreis des Farbrads | `styles.css:569` | `#797080` / `#262626` | **3,20:1** | grenzwertig, nur zulässig als Nicht-Text |
| Panel-Scrollbalken | `styles.css:539` | `#625b6c` / `#262626` | **2,33:1** | zu schwach |
| Schalter-Knopf (aus) | `styles.css:479` | `#1e1e1e` / `#403b47` | **1,54:1** | **Blocker → B1** |
| Schwarz-Swatch | `styles.css:472-473` | `#202124` / `#262626` | **1,06:1** | **Major → 2.9** |
| Objektgriff-Füllung | `styles.css:572` | `#eee4ff` / `#8051b8` | 13,64:1 | ok |

**Feste Farben, die im dunklen Theme nicht mitgehen** (kein `var()`, kein `color-mix`):

| Ort | Farbe | Warum problematisch |
|---|---|---|
| `styles.css:150` | `#62666d` (Seitenlabel) | feste graue Schrift auf festem Weiß (`#faf7ff`-Familie); kann im dunklen Theme nicht auf den Nutzerfarbraum reagieren. Da das Label auf **Papier** liegt (immer hell), ist es funktional korrekt — aber es ist der einzige feste Textton des Plugins und sollte als `--hp-paper-label` dokumentiert werden. |
| `styles.css:197` | `#684691` (Fadenkreuz) | liegt über weißem Papier → 7,31:1, korrekt. Fällt aber mit `body.hp-pen-active * { cursor: none !important }` (`styles.css:603-606`) zusammen, wenn das Lineal aktiv ist (s. §4.1). |
| `styles.css:198` | `box-shadow: 0 0 0 1px #fff` | Der weiße Ring ist der Grund, warum das Kreuz auf **dunklem** Grund nicht mehr funktioniert. Da der Stiftpunkt aber immer über der weißen Fläche liegt, ist der Ring richtig — nur der Reticle selbst (`styles.css:180`, `border: 1px solid rgb(255 255 255 / 80%)`) ist ein **fester weißer Rand**, der auf hellem Papier verschwindet. |
| `styles.css:215` | `#ff1744aa`, `#ff174466` | Laser-Glow, korrekt dunkel-neutral. |
| `main.ts:87`,`2572` | `sh-build-0.25.22` | Bau-Marke ≠ Manifest `0.25.25` → §5.2 |
| `lab/index.html` | 4 Tokens | Prüfstand-Theme unvollständig → siehe Vorwort |

**Befund: Reticle-Rand auf hellem Papier.** `styles.css:180`
`border: 1px solid rgb(255 255 255 / 80%)` — auf dem weißen Blatt (`main.ts:217`
`fillStyle = "#fff"`) ist ein weißer Rand unsichtbar; der Reticle besteht dann nur aus der
Füllung `--hp-reticle-color`, die bei `penColor: #202124` einen 1-px-Kreis in Blattweiß
auf Blattweiß ergibt. Der **Kontur-Schatten** (`.hp-pen-reticle`, `box-shadow:
0 1px 4px rgb(0 0 0 / 35%)`, `styles.css:183`) trägt die Sichtbarkeit allein.

**Minimaler Fix:**
```css
.hp-pen-reticle { border: 1px solid #0000008c; }  /* dunkler Ring, sichtbar auf Weiß */
```

---

## 4. Overlays · Größe und Position

### 4.1 Lineal
**Ort:** `main.ts:1631-1652` (Zeichnung), `styles.css:590-593` (Cursor)

- Körper: 680 × 44 Canvas-Einheiten (`main.ts:1634`, `half = 340`), gezeichnet mit
  `--interactive-accent` als Rand und 12 % Füllung. Auf dem weißen Blatt ist ein 12 %-violet
  fast unsichtbar; nur der 2 px breite Rand (`main.ts:1640`) trägt die Form. Für ein
  Werkzeug, auf das der Stift einrastet, ist das zu schwach.
- `cursor: none` (`styles.css:598`) + globales `body.hp-pen-active * { cursor: none !important }`
  (`styles.css:603-606`): Mit dem Stift ist über dem Lineal **kein** Zeiger mehr sichtbar.
  Der Nutzer weiß nicht, ob er gerade die Leiste verschiebt oder einen Strich zieht.
  Der Reticle wird nur bei `tool !== "laser"` und aktivem Stift gezeigt
  (`main.ts:852-856`) — beim Greifen der Enden (`main.ts:1025-1027`) übernimmt der
  Lineal-Drag, aber ohne Sichtmarkierung.

**Minimaler Fix** — Lineal-Griffpunkte sichtbarer und Drag-Zustand erkennbar machen:
```ts
// main.ts:1649-1650 – Endkreise kräftiger
context.globalAlpha = 0.9; context.fillStyle = accent;
// statt context.arc(r, 0, 8, …) (Zeile 1650) → 11 px Radius
```
```css
.hp-inline.is-editing[data-tool="pen"] .hp-page canvas { cursor: crosshair; } /* Fallback behalten */
```

### 4.2 Seitenübersicht (Rail)
**Ort:** `styles.css:416-421`, `styles.css:660`, `styles.css:657`, `main.ts:554,1779`

```css
/* styles.css:417-418 */  left: 0; top: 52px; bottom: 0; width: 130px;
/* styles.css:660 */      .hp-page-thumb { width: 116px; }        /* + padding 8px = 124 */
/* styles.css:657 */      .hp-page-thumb canvas { width: 104px }  /* + Rahmen/Innenabstand */
```
Gemessene Breiten:

| Element | Breite |
|---|---|
| Rail (Bruch) | 130 px |
| Rail (Inhalt, `padding: 10px 8px`) | **114 px** |
| `.hp-page-thumb` (116 + `padding: 4px` ×2 + `border: 2px` ×2) | **128 px** |
| Canvas im Thumb (104 + `padding: 4px` ×2 + `border: 1px` ×2) | 114 px |

**Befund:** Der Thumb ist 128 px breit und damit **breiter als der Rail-Inhalt (114 px)**.
Das Raster überläuft je Seite um ca. 7 px, und der Canvas braucht 114 px bei 114 px
verfügbarer Fläche — er füllt den Rail exakt aus, ohne Reserve für den beidseitigen
Rahmen. Ergebnis: Die Vorschau wirkt am Rand abgeschnitten/gequetscht. Genau das
widerspricht dem Kommentar bei `styles.css:651-655` („Vorschaubilder … gleichmäßig").

**Zusätzlich:** `main.ts:2051` (Original) reserviert im Strip-Modus nur 128 px:
```css
.hp-inline.is-strip-open:not(.is-editing) .hp-pages { padding-left: 152px; }  /* styles.css:113 */
```
Das ist für den Nicht-Bearbeiten-Zustand. Im **Bearbeiten**-Zustand gilt
`styles.css:341`:
```css
.hp-inline.is-editing.is-strip-open .hp-pages { left: calc(130px + var(--hp-panel-width) + 24px); }
```
Hier ist `130px` als Rail-Breite angenommen, während der Rail-Inhalt 128 px plus
8 px Außenrand braucht — wieder 2 px Reserve, plus die 7 px Überhang aus dem Thumb.
Der Strip sitzt außerdem auf `top: 52px` (`styles.css:417`), aber bei
`is-strip-open` wird er in `styles.css:340` auf `top: auto` gesetzt und in
`main.ts:560` per `style.top = headerRect.bottom` positioniert. Da der Header im
Bearbeiten-Modus `min-height: 52px` hat (`styles.css:423`), sich aber durch
`flex-wrap: wrap` (`styles.css:585`) bei ≤ 820 px **auf bis zu 3 Zeilen** vergrößern
kann, ist `52px` die falsche Annahme für die Höhe, wenn `style.top` nicht gesetzt wurde
(z. B. direkt nach `rebuildPageStrip()` beim Reload).

**Minimaler Fix** — Rail und Thumb aufeinander abstimmen:
```css
.hp-page-strip { width: 146px; }
.hp-page-thumb { width: 128px; }
.hp-inline.is-editing.is-strip-open .hp-pages { left: calc(146px + var(--hp-panel-width) + 24px); }
.hp-page-strip { top: var(--hp-header-height, 52px); }
```
und `--hp-header-height` im Header-Resize setzen (`ResizeObserver` liegt bereits vor,
`main.ts:921`).

### 4.3 Stift-Diagnose-Panel
**Ort:** `styles.css:635-649`, `main.ts:2570-2591`

```css
/* styles.css:635-636 */ position: fixed; top: 16px; right: 16px; width: min(360px, calc(100vw - 32px));
```
- **Panel überdeckt seinen eigenen Messbereich.** Der Nutzer wird in `main.ts:2574`
  aufgefordert: „Zeichne jetzt mit dem Stift auf die Fläche (zwei Wörter)." Bei einer
  schmalen Notiz (oder im Split-View) liegt die obere rechte Ecke des Blattes — genau die
  erste Schreibzone — unter dem 360 px breiten Panel.
- **Panel kollidiert mit dem Dock.** Das Dock sitzt unten mittig (`styles.css:348-364`),
  das Panel oben rechts; bei ≤ 600 px ist `max-width: calc(100vw - 16px)`
  (`styles.css:611`) und das Dock ist ~558 px breit → beide überlappen in der Mitte.
- **Klick-Durchlässigkeit ist inkonsistent.** `styles.css:641-643`: der Container ist
  `pointer-events: none`, aber `.hp-pen-diag`, `.hp-pen-diag-hint`, `.hp-pen-diag-env`
  setzen es auf `auto` zurück. `.hp-pen-diag` ist der `<pre>` mit **dem Messwertblock** —
  der ist damit klick-bar und fängt Stiftstriche ab, obwohl `main.ts:2575` ihn als reine
  Ausgabe anlegt. Nur der Kopf hat `pointer-events: auto` nötig (`styles.css:642`).
- **Das Panel wird beim Aktivieren des Editors nicht verdrängt** und bleibt mit
  `z-index: 12000` über der Werkzeugleiste (`10012`). Der Schließen-Knopf ist mit 32 px
  (`styles.css:683`) der einzige Ausweg — bei zugedeckter Fläche ist das der Einzige.

**Minimaler Fix:**
```css
.hp-pen-diagnostic { top: 12px; right: 12px; width: min(320px, calc(100vw - 24px)); }
.hp-pen-diag, .hp-pen-diag-hint, .hp-pen-diag-env { pointer-events: none; }
.hp-pen-diag-head, .hp-pen-diag-head button { pointer-events: auto; }
@media (max-width: 700px) {
  .hp-pen-diagnostic { position: fixed; inset: auto 8px 8px 8px; width: auto; }
}
```

### 4.4 Auswahlrahmen und -griffe
**Ort:** `styles.css:402`, `styles.css:489-514`, `main.ts:1669-1686`

- Gestrichelter Rahmen mit 2 px Strichstärke mal Skalierungsfaktor (`main.ts:1679`),
  Vier Füllquadrate mit 8 px × Skalierung (`main.ts:1682-1684`). Bei `zoom < 0,5`
  (`main.ts:1818` erlaubt bis 0,35) schrumpfen Rahmen und Griffe auf **2,8 px** bzw.
  **0,8 px** — die Griffe sind dann nicht mehr treffbar (Treffertoleranz ist
  `12 * scale` in `main.ts:1460`, aber ohne sichtbaren Griff daneben).
- `styles.css:510` zeichnet über `::after` einen hellen Innenpunkt
  (`background: var(--background-primary)`), `styles.css:572` überschreibt ihn mit
  `background: #eee4ff` — **festes Helllavendel im dunklen Theme**, sichtbar als
  heller Kasten in der dunklen Leiste. Kontrast gegen den Rahmen ist hoch (13,6:1),
  aber die Farbe passt nicht zur Palette.
- `styles.css:511-514` positioniert die 32 px großen Griffe mit `-14px` außerhalb
  (`styles.css:682` setzt `width/height: 32px`, aber **nicht** die Offsets).
  32 / 2 = 16 ≠ 14 → jeder Griff sitzt um **2 px zu weit außen** und wird an der
  Blattecke teilweise abgeschnitten (`styles.css:128` `overflow: hidden`).

**Minimaler Fix:**
```css
.hp-resize-nw { left: -16px; top: -16px; }  /* halber Griff, 32/2 */
.hp-resize-ne { right: -16px; top: -16px; }
.hp-resize-sw { left: -16px; bottom: -16px; }
.hp-resize-se { right: -16px; bottom: -16px; }
.hp-object-resize::after { background: var(--hp-ui-raised, #262626); }
```

### 4.5 Farb- und Options-Panel
**Ort:** `styles.css:396-397`, `styles.css:458-461`, `main.ts:621,639-643`

Beide Panels öffnen nach oben (`bottom: calc(100% + 10px)` / `+ 12px`) und rechts
(`right: 0`). Da die Leiste unten mittig sitzt, ist das korrekt zentriert, solange die
Panelbreite < halbe Leistenbreite ist. Das Farb-Panel ist **270 px breit**
(`styles.css:458`) und das Options-Panel **290 px** (`styles.css:482`) — sie schieben
sich damit trotz `right: 0` weit nach links, unter den Mausbereich des Nutzers.
Kein `max-height` am Farb-Panel (nur das Options-Panel hat `55vh`,
`styles.css:396`) → bei 3 Slidern (R/G/B zusätzlich zu den Presets) im
Chromium-Fenster < 420 px Höhe wird der untere Rand abgeschnitten.
`styles.css:459` verwendet `grid-template-columns: 48px 1fr` für den RGB-Picker,
`styles.css:472` das Farbrad mit 32 px Rand — die beiden sind nicht aufeinander
abgestimmt (48 px Spalte vs. 32 px Knopf).

**Minimaler Fix:** `max-height: 60vh` und `overflow-y: auto` am
`.hp-color-panel` ergänzen; die erstgenannte Spalte auf `32px` ziehen.

---

## 5. Verhalten bei schmalem Fenster · deutsche Beschriftungen

### 5.1 Drei überlappende Media-Queries
`styles.css:298` (700 px), `styles.css:584` (820 px), `styles.css:607` (600 px).
Die 700-px-Regel setzt
```css
.hp-toolbar { left: 6px; width: 88px; }   /* styles.css:300 */
```
Diese Regel greift **immer**, wenn `max-width: 700px` zutrifft — auch im Bearbeiten-Modus.
Dort wird sie zwar von `styles.css:348` (`left: 50%`) überschrieben, aber `width: 88px`
bleibt in der Kaskade. Ein späterer Bearbeiter, der die Mobile-Breite ändern will, wird
diese Stelle zuerst finden und nichts bewirken. Empfehlung: die 700-px-Regel auf die
Vorschau-Variante einschränken:
```css
@media (max-width: 700px) { .hp-inline:not(.is-editing) { .hp-inline-title { display: none; } } }
```

### 5.2 Header bricht in bis zu drei Zeilen
**Ort:** `styles.css:585-588` (≤ 820 px), `styles.css:607-616` (≤ 600 px)

Im Bearbeiten-Modus enthält der Header: Titel (ausgeblendet ≤ 700 px), Seitenzahl,
Status, Papier-Umschalter (3 Knöpfe), Werkzeuge-Schalter, „Fertig", „Entfernen".
Bei ≤ 820 px wird `flex-wrap: wrap` gesetzt und der Papier-Umschalter in Zeile 2
(`order: 2`). Ab ≤ 600 px wird Zeilenumbruch **nicht** zurückgenommen, aber das
Dock ist 558 px breit und `max-width: calc(100vw - 16px)`. Bei 600 px Viewport bleibt
für die erste Header-Zeile nach Papierwechsel-Knöpfen (~180 px) und Werkzeuge-Schalter
kaum Platz; die Knöpfe „Fertig"/„Entfernen" rutschen in Zeile 3. Der Header wächst damit
auf ~110 px, während `styles.css:423` (`min-height: 52px`) und die Rail-Position
(`styles.css:417` `top: 52px`) weiter von 52 px ausgehen (s. 4.2).

**Minimaler Fix:** Header-Höhe messen und als Variable weiterreichen:
```ts
// main.ts, nach dem Header-Aufbau
new ResizeObserver(() => this.wrapper.style.setProperty("--hp-header-height",
  `${Math.round(this.headerEl.getBoundingClientRect().height)}px`)).observe(this.headerEl);
```
```css
.hp-page-strip { top: var(--hp-header-height, 52px); }
```

### 5.3 Deutsche Beschriftungen
**Systematischer Befund:** Die Oberfläche ist konsistent deutsch. Substantive sind
großgeschrieben (`Bearbeiten`, `Fertig`, `Entfernen`, `Werkzeuge`, `Seitenübersicht`,
`Duplizieren`, `Einfärben`, `Löschen`, `Übernehmen`, `Abbrechen`), Statusmeldungen sind
ganze deutsche Sätze, Fehlermeldungen ebenfalls. Die Prüfung auf englische Reste
(`Settings`, `Close`, `Save`, `Cancel`, `OK`, `Delete`, `Edit`, `Search`, `Undo`, `Redo`
in UI-Texten) ergab **keine** Treffer.

Verbleibende Reste:

| Ort | Text | Bewertung |
|---|---|---|
| `pdf-annotation.ts:116` | `"Smooth Ink"` als Titel der PDF-Leiste | **einziger englischer UI-Titel**. Inkonsistent zu „Smooth Handwriting" im Haupteditor. Vorschlag: „PDF-Tinte" oder „Smooth Handwriting · PDF". |
| `notebook-image.ts:30` | `finish("delete")` | englischer Aktionswert, **kein** sichtbarer Text — nur Code. Für Lesbarkeit des Codes auf `"loeschen"` oder `"remove"` vereinheitlichen. Niedrig. |
| `main.ts:598` | `"Pinsel (Breite folgt dem Tempo)"` | deutscher Klammerzusatz in einem `title`; nur per Hover erreichbar (§2.5). |
| `main.ts:720` | `"Text oder Tabelle auswählen"` vs. `main.ts:687` `"Text / Tabelle bearbeiten"` | **zwei verschiedene Formulierungen für dieselbe Aktion.** Vereinheitlichen auf „Text / Tabelle bearbeiten". |
| `main.ts:750` | `"Bild / PDF"` vs. `main.ts:579` `"Bild oder PDF importieren"` | Knopftext mit Schrägstrich, `aria-label` mit „oder". Im selben Panel nebeneinander. Vereinheitlichen. |
| `main.ts:565` | `"100 %"` (mit Leerzeichen) vs. `main.ts:661,682,685,688` `"2 px"` (ohne) | **doppelte Konvention.** Deutsch schreibt „100 %" mit schmalem Leerzeichen; für Konsistenz innerhalb des Plugins eine Form wählen. Vorschlag: überall mit Leerzeichen („2 px"), weil das die Zahlangabe vom Einheitenzeichen trennt. |
| `main.ts:656,657` | `"Kariert: Schrifthöhe"`-Bereich zeigt `"2"`,`"2,5"`,`"3"` (Zahl ohne Einheit) vs. `"2 px"` im selben Menü | gemischte Zahlformate. Vorschlag: einheitlich `"2 Kästchen"` / `"2 px"`. |
| `main.ts:649` | `"Optional: in Text umwandeln …"` | „Optional:" ist ein Entwicklerhinweis, keine Nutzeranweisung. Vorschlag: „Handschrift in Text umwandeln …". |
| `main.ts:87`,`2572` | `sh-build-0.25.22` im Diagnose-Titel, Manifest `0.25.25` | sichtbarer Versionswiderspruch im Panel („Stift-Diagnose · sh-build-0.25.22"). Für den Support verwirrend. Entweder Marke automatisch aus `manifest.version` ziehen oder synchron halten. |
| `main.ts:545`,`620` | `"Werkzeuge"` (Header-Schalter) vs. `"Weitere Werkzeuge"` (`•••`) | zwei verschiedene Dinge, aber fast derselbe Name. Vorschlag: `•••` → „Mehr Optionen" oder „Einstellungen". |
| `main.ts:641` | `"Farbe für"` als `aria-label` des Ziel-Selects | grammatisch unvollständig; sichtbar nicht, aber vorgelesen. Vorschlag: „Farbe ändern für". |

---

## 6. Unfertig wirkende Elemente

### 6.1 Toter Code im Stylesheet
**Ort:** `styles.css:314-317`
```css
.hp-construction-preview { … }
.hp-construction-controls { display: flex; flex-wrap: wrap; gap: 12px; }
.hp-construction-controls label { display: grid; gap: 4px; }
.hp-construction-controls input { width: 110px; }
```
Keine Verwendung in `src/` (bestätigt per Volltextsuche; die zugehörige
`src/construction-dialog.ts` wurde laut `git status` gelöscht und liegt in
`plugin-backups/deleted-dead-code-20260911/`). Vier tote Regeln, die eine nie sichtbare
Oberfläche beschreiben.

**Minimaler Fix:** die vier Zeilen löschen.

### 6.2 `transform-origin` für einen nicht auftretenden Zustand
**Ort:** `styles.css:456`
```css
.hp-page { transform-origin: top center; }
```
Im Bearbeiten-Modus wird nirgends ein `transform` auf `.hp-page` gesetzt (Zoom läuft
über `--hp-page-width`, `main.ts:891`). Die Regel ist wirkungslos.

### 6.3 `--hp-panel-width` in der Mobil-Query wirkungslos
**Ort:** `styles.css:608`
```css
@media (max-width: 600px) { .hp-inline.is-editing { --hp-panel-width: 180px; } }
```
Im Bearbeiten-Modus ist die Leiste ein unteres Dock (`styles.css:348-364`), und
`--hp-panel-width` wird nur von `styles.css:339,341` (Seiten-Spalten-Einzug) genutzt —
die sind zu diesem Zeitpunkt bereits von `styles.css:521` (`left: 0`) überschrieben.
Die 180 px haben also keine Wirkung.

### 6.4 Doppelte Beschriftung am Seitenübersicht-Knopf
**Ort:** `main.ts:558`, `editor-controls.ts:36-41`
Der Knopf hat `aria-label: "Seitenübersicht öffnen/schließen"` und `title: "Seitenübersicht"`.
Da `applyIcon` `title = aria-label` setzt, überschreibt der zweite Wert den ersten — der
Tooltip lautet am Ende „Seitenübersicht" (ohne Verb), während das Vorlesen
„Seitenübersicht öffnen/schließen" ergibt. Zwei Quellen für dieselbe Beschriftung.

**Minimaler Fix:** `title` weglassen; `applyIcon` setzt es dann aus `aria-label`.

### 6.5 Unterschiedliche Rundungen derselben Leiste
**Ort:** `styles.css:491` (`border-radius: 12px`), `styles.css:493`
(`border-radius: 6px` für die Knöpfe darin), `styles.css:482` (`border-radius: 20px`
für das Options-Panel), `styles.css:458` (`18px` für das Farb-Panel), `styles.css:396`
(`16px`).

Fünf verschiedene Radien für die schwebenden Flächen. Kein Fehler, aber der Grund, warum
die Oberfläche „zusammengewürfelt" wirkt. Vorschlag: einen Token setzen
(`--hp-radius-float: 16px`) und überall verwenden.

### 6.6 Inline-`top` der Seitenübersicht veraltet nach Fenstergrößenänderung
**Ort:** `main.ts:560`, `styles.css:340`, `styles.css:417`

Der Öffnen-Schalter setzt die Höhe als Inline-Stil:
```ts
// main.ts:560
this.pageStrip.hidden = !this.pageStrip.hidden;
this.pageStrip.style.top = `${Math.round(this.headerEl.getBoundingClientRect().bottom)}px`;
```
Das ist beim Klick korrekt gemessen (und schlägt die CSS-Vorgabe `top: 52px`,
`styles.css:417`, weil Inline-Stile gewinnen). Der Wert wird aber **nur beim Klick**
neu berechnet. Vergrößert sich der Header später — genau das passiert bei ≤ 820 px durch
`flex-wrap: wrap` (`styles.css:585`), wo der Header auf zwei bis drei Zeilen wächst —,
bleibt der alte `top` stehen, bis der Nutzer die Übersicht erneut schließt und öffnet.
Die Übersicht schiebt sich dann unter den höheren Header.

**Geprüft und unauffällig:** Der frühere Verdacht, die Spalte würde leer aufblitzen,
trifft nicht zu — `main.ts:560` ruft `rebuildPageStrip()` erst **nach** dem Entfernen von
`hidden`, und beim Aufbau ist sie durch `main.ts:555` (`pageStrip.hidden = true`) noch
verborgen. Ein leerer Container wird also nicht sichtbar.

**Minimaler Fix:** die Höhe als CSS-Variable fortlaufend messen statt einmalig zu setzen:
```ts
// main.ts, statt des Inline-Styles in Zeile 560
this.wrapper.style.setProperty("--hp-header-height",
  `${Math.round(this.headerEl.getBoundingClientRect().bottom)}px`);
```
```css
.hp-page-strip { top: var(--hp-header-height, 52px); }
```
Dieselbe Variable deckt auch den Befund in §4.2 ab.

### 6.7 Unbenutzter Options-Panel-Schalter ohne Zustandssicherung
**Ort:** `main.ts:664`
```ts
switchControl(writing, "Buchstaben schützen", true, value => { this.handwritingMode = value; … });
```
Die Vorgabe ist hart `true` und wird nirgends persistiert — beim Neuöffnen ist der Schalter
immer an, unabhängig davon, was der Nutzer eingestellt hatte. Für einen Schalter, der
Automatiken abschaltet, ist das verwirrend.

### 6.8 Sichtbarer Zustand des Vorschau-Modus
**Ort:** `main.ts:988`, `styles.css:74`
Im Vorschau-Modus (`!is-editing`) ist die Leiste `display: none` (`styles.css:74`) — aber
die `activateTool`-Logik läuft weiter, und `main.ts:988` verhindert nur das Zeichnen über
`pointer-events: none` (`styles.css:164`). Der Nutzer sieht also keine Werkzeugleiste,
aber ein Klick auf die Vorschau aktiviert intern weiterhin die zuletzt gewählte Werkzeug-
und Auswahl-Logik (`main.ts:902-921`). Kein sichtbarer Fehler, aber der Zustand ist
zwischen den beiden Modi nicht getrennt.

### 6.9 Seitenübersicht: Verzerrung
**Ort:** `styles.css:656-657`
```css
.hp-page-thumb canvas { aspect-ratio: 1200 / 1697; }
```
A4 hoch ist in Plugin-Einheiten `1200 × 1697` (`main.ts:731`) → Verhältnis 0,7071.
Die CSS-Vorgabe `1200 / 1697` entspricht 0,7071 — aber `main.ts:1801` legt die
Thumbnail-Leinwand mit `width: 120`, `height: Math.round(page.height * (120/page.width))`
an, also mit dem **echten** Seitenverhältnis. Der Kommentar bei `styles.css:651-655`
(„extrem verzerrt") beschreibt genau diesen Konflikt: die CSS-Vorgabe erzwingt A4, die
Leinwand liefert das echte Format. Für importierte PDF/Bilder (`page.format = "custom"`,
`main.ts:2205`) weichen beide ab → die Vorschau wird gestreckt.

**Minimaler Fix:** die CSS-Vorgabe entfernen und die Leinwand das Format bestimmen lassen:
```css
.hp-page-thumb { width: 116px; }
.hp-page-thumb canvas { display: block; width: 100%; height: auto; }
```

### 6.10 Text-/Emoji-Knöpfe skalieren nicht mit
Siehe §2.4 und §2.10 — die Knöpfe ohne SVG (`main.ts:601,605,606,607,620`) sowie die
beiden „Drucken" / „Bild / PDF" ohne Pfadeintrag brechen die Reihe.

---

## 7. Nur im laufenden Obsidian visuell zu prüfen (statisch nicht entscheidbar)

1. **Hover-Zustand des Docks** (`styles.css:393,548`): `--background-modifier-hover` ist
   im Prüfstand nicht definiert (`lab/index.html`), im echten Theme aber vorhanden.
   Ob der Hover dort sichtbar genug ist, ist nur am Gerät entscheidbar.
2. **`--radius-s`, `--font-ui-small`, `--text-error`** (`styles.css:412,413,506,439`)
   sind Prüfstand-Lücken, keine Plugin-Fehler. Am Gerät gegenprüfen.
3. **`overflow: hidden` am Blatt** (`styles.css:128`) und die 2 px überstehenden Griffe
   (§4.4): ob sie tatsächlich sichtbar abgeschnitten werden, hängt von der
   Canvas-Skalierung ab — rechnerisch ja, visuell bestätigen.
4. **Schriftart der Statuszeile** unter `--font-ui-smaller` bei 380–480 px: wo genau
   abgeschnitten wird, ist fontabhängig.
5. **Cursor-Verhalten mit Stift** (`styles.css:603-606`, `main.ts:852-856`): dass der
   Systemzeiger global versteckt wird, ist im Browser nicht prüfbar — „Zeiger
   verschwindet und kommt nicht zurück" ist am Tablet der wichtigste Test nach einem
   Fix von §4.1.
6. **Kontrast der Lineal-Füllung** (`main.ts:1639`, 12 % Akzent) über einem
   importierten PDF-Scan: hängt vom Bildinhalt ab.
7. **`window.confirm`** (`main.ts:1587,1767,2286,2651`) ist ein blockierendes
   Browser-Dialogfeld und nicht theme-fähig. Am Tablet mit Stift prüfen, ob der Dialog
   überhaupt bedienbar ist.

---

## 8. Empfohlene Reihenfolge

1. **B1, B2** — Schalter-Sichtbarkeit und Lineal-Zustand. Beides ist im dunklen Theme
   sofort sichtbar und betrifft die tägliche Bedienung. Aufwand je ~3 Zeilen CSS.
2. **B3, 4.2** — Überlappung Dock/Ansichtsleiste und Rail/Thumb-Breite. Beides sind
   Geometriefehler, die nur im schmalen Fenster auftreten, aber dort die Bedienung
   unmöglich machen. Aufwand je ~2 Zeilen CSS.
3. **2.5, 2.7** — Statuszeile als einziger Erklärkanal: `title`-Tooltips durch
   `pointerenter`-Statusmeldungen ersetzen und Fehler farblich absetzen. Das verbessert
   fast jede Interaktion gleichzeitig.
4. **2.4, 2.9** — Symbolkonsistenz (Emojis → SVG) und die zwei Kontrastfehler
   (Schwarz-Swatch, Reticle-Rand). Danach ist die Leiste einheitlich.
5. **6.1, 6.4, 6.5, 5.1** — toten Code entfernen, doppelte Beschriftung, Radius-Token,
   Media-Query entwirren. Reine Hygiene, kein Nutzereffekt, aber es ist der Ballast, der
   spätere Fehler wie B2 entstehen lässt.

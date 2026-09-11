# Plan: Formen wie auf dem iPad + richtig glatte Handschrift (Ziel 0.24.1)

Erstellt 8. September 2026 aus der Nutzeranforderung: „Improve Shapes: Kreis wird wirklich rund,
Viereck wird viereckig; Schrift-Verbesserungen dürfen nur auf Schrift gehen; Schrift wirklich
smooth (gerade, entzerrt, geschlossen/vervollständigt, sanft); ein gerader Linienmodus.
Recherchiere die iPad-Werkzeuge und plane die Umsetzung.“

Forschungsstand zu den iPad-Referenzen am 8.9.2026 (Hersteller-Dokumentation, kein Ranking-Run):

| Referenz | Relevanteste Mechanismen | Übernahme/Ziel hier |
| --- | --- | --- |
| GoodNotes „AutoShape + Draw & Hold“ | Zeichnen, **Stift am Ende halten** → Snapp zur perfekten Form; Kreis vs. Oval wird unterschieden; „Snap to Endpoints“ (Linien rasten an andere Striche/Endpunkte); Form nachträglich als Ganzes editierbar; auch mehrstufig (3 Striche ⇒ Dreieck). Bekannter Schwachpunkt: kleine Rechtecke scheitern oft. | Draw&Hold + Auto-Shape bei pen-up; Kreis/Oval-Entscheidung über Achsenverhältnis; Endpunkt-Snap als Opt-in; unsere Mindestgrößen **niedriger** als GoodNotes (≤ 30 px). |
| Notability / FreeNotes | Gleiches Muster „zeichnen & halten“, Shape-Recognition als Schalter; Lineal zeichnet exakt gerade Linien in beliebigem Winkel. | Gerader-Linien-Modus als eigenes Werkzeug (Ph. 2) + Draw&Hold. |
| OneNote | „Draw and hold at end“ ⇒ Gerade; Lineal/Winkelmesser. | Funktional identisch in Ph. 2. |
| MyScript/Nebo | Form zeichnen, Stift halten ⇒ perfekte Form; Interactive Ink für Diagramme/Math. | Bestätigt das Halte-Muster als iPad-Standard. |
| Apple Notes | Auto-Refine + manuelles Refine (Slider + „Refine“), Straighten, Rechtschreib-Prüfung in der Schrift; Paste-as-Handwriting. | Straighten/Refine-Konzept übernehmen; Paste-as-Handwriting und Font-Ersatz **bewusst nicht** (persönliche Schrift bleibt). |

**Bestandsaufnahme im Code (gelesen):**
- Rendering zeichnet `ellipse`/`rectangle` bereits **geometrisch exakt** (`rendering.ts` drawShape
  via `context.ellipse`/`roundRect`) — die Qualität steckt in der **Erkennung**, nicht im Zeichnen.
- `optimizeClosedShape` (`shapes.ts:145`): verlangt ≥ 10 Punkte, ≥ 55×55 px, Diagonale ≥ 90,
  nahezu geschlossen; Kreis vs. Rechteck über Kantenfehler — freihändige Kreise scheitern hier oft.
- **Trennungs-Leck** (`main.ts:856–857`): Im Zeichen-Modus fällt jeder Strich, der NICHT als Form
  erkannt wurde, in `queueWordStroke` — die Schrift-Pipeline (Höhe, Begradigung, Schleifen-Schließen,
  Wortgruppierung) läuft damit auf Zeichnungen/Diagramme. Das ist die gemeldete „geht auch für
  alles andere“-Verletzung.

## Phase 0 — Strikte Trennung (Bugfix, klein, sofort)

1. `main.ts:856–857`: `queueWordStroke` **nur wenn `handwritingMode`** (`!converted && beautifyEnabled
   && handwritingMode`). Nicht erkannte Zeichen-Striche bleiben roh (nur `cleanCapturedStroke`).
2. Gegenrichtung bereits korrekt setzen/absichern: `convertAutomaticShape` läuft nur bei
   `!handwritingMode` — per Test pinnen.
3. Regressionstests: Zeichen-Modus-Strich bekommt nie `normalizedWordId` und nie Höhenänderung;
   Schreib-Modus unverändert.

## Phase 1 — Formen wirklich rund/eckig (Auto-Shape wie iPad)

1. `optimizeClosedShape` neu: **Kreis-/Ellipsen-Fit über radiales Mittelrest** (mittlerer
   Radiusfehler statt Kantenfehler); Kreis ⇔ Oval über Achsenverhältnis |rx−ry|/max ≤ 0,15
   ⇒ `kind:"ellipse"` mit gleichen Radien („wirklich rund“). Rechteck über Kantenquote
   (Anteil der Punkte nahe einer der 4 Kasten-Kanten ≥ 0,75 ⇒ perfekte 2-Punkt-Ecke);
   sonst Rauten-/Polygon-Pfad. Mindestgröße auf ~30 px, Schließtoleranz dynamisch.
2. **Draw & Hold** (iPad-Muster): im Zeichen-Modus nach Stift-Aufsetzen warten wir am
   pen-down einfach ab: bleibt der Stift > 350 ms ohne Bewegung auf dem Bildschirm,
   **dann** wird der gerade gezeichnete Strich sofort zur perfekten Form konvertiert
   (Live-Ersetzung, wie bei GoodNotes); normales pen-up macht weiterhin Auto-Shape.
   Umsetzung im Pointer-Handler: `holdTimer` + Bewegungsschwelle ~2 px. Kein Werkzeugwechsel.
3. **Snap an Endpunkte** (Opt-in „An Endpunkte einrasten“, Default an): Endpunkte von
   `line`/`arrow` ziehen im Radius 14 px auf Endpunkte/Mittelpunkte anderer Elemente
   (weiche Attraktion beim Zeichnen, nicht beim Schreiben).
4. Tests: gejitterter Kreis (Radius-RMS-Fehler 6 px) ⇒ exakte Ellipse mit |rx−ry|<0.5 px;
   schiefes Rechteck (±8°) ⇒ rechte Winkel; kleines Rechteck (30 px) wird erkannt
   (GoodNotes-Schwäche vermeiden); Draw&Hold-Timer in Harding-Fakes.

## Phase 2 — Gerader Linienmodus

1. Neues Werkzeug **„Gerade“** (Outline-Icon, Obsidian-Palette): aufsetzen, ziehen ⇒ perfekte
   Gerade als `line`-Shape; beim Ziehen Winkelanzeige (wie bestehende Messungen); optionales
   **Winkel-Snap** 0/15/30/45/60/90° (auf Rädern/Fachbrettern spürbarer Mehrwert).
2. Zusätzlich „Draw & Hold ohne Bewegung“ im Zeichen-Modus ⇒ Gerade (OneNote-Muster).
3. Explizit KEIN neues Lineal-Overlay: Geodreieck zeichnet bereits entlang der Kante;
   der Gerade-Modus ergänzt es ohne Duplikat.

## Phase 3 — Schrift wirklich smooth (die vier Wünsche + sanft)

Alle Eingriffe: einmal pro Wort (`normalizedWordId`), Original bleibt (`rawPoints`),
Verhältnis-Kappen vom 8.9. bleiben, X-Wort-Envelope bleibt, niemals OCR/Font.

1. **Buchstaben gerade machen** (vorhanden, gezielt verstärkt): Strich-Begradigung anheben,
   Ecken-/Extrema-Guards bleiben unangetastet; eigener Regler bleibt bestehen.
2. **Buchstaben entzerren** (neu, Opt-in-Schalter „Buchstaben entzerren“): je Buchstaben-Cluster
   innerhalb des Worts Bounding-Höhen/-Breiten angleichen (Cluster über x-Lücken; max. ±12 %
   Abweichung wird eingeebnet, Wort-Envelope und Buchstaben-Zentren bleiben).
3. **Buchstaben schließen/vervollständigen** (Ausbau `closeOwnInkLoop` + neuer
   `completeLetterInk`): kleine Lücken in fast vollständigen Ovalen (o/e/a-Schlaufen) verläufig
   schließen — nie offene Buchstaben (c/u) oder beliebige Bögen; konservativ, opt-in über
   vorhandenen Schalter `beautifyCloseLoops`.
4. **Sanftes Applien auf Linien**: letzter Pass = lokale gewichtete Glättung (Fenster 3–5,
   S-Gewichte) NUR in sanften Abschnitten (Krümmung/Winkelguard wie in smoothOwnInk) —
   Ergebnis: runde Linien ohne Eckenverwaschen.

Messung je Schritt an synthetischen Fixtures (gejitterte W/M/o, ungleiche Buchstabenhöhen,
offene o-Schlaufen) + Handschrift-Audit erweitert; keine Budget-Senkung, echter Nutzertest.

## Phase 4 — restliche iPad-Parität (M3-Horizont)

Circle-to-Lasso, Scribble-to-Erase (Opt-in, widerrufbar), Auswahl/Gruppierung als Ganzes,
Zoom-/Konzentrationsmodus. Nicht kopiert: Paste-as-Handwriting, automatische Sprachrechtschreibung,
Cloud — bleiben Opt-in-Ausbauten, keine Kern-Features.

## Reihenfolge & Abnahme

0 → 1 → 2 → 3, nach jeder Phase: Tests + Audit + Browser-Smoke + (natives) Nutzertest-Fenster.
Phase 0 und 1 beheben die akute Meldung; Phase 3 macht die Schrift „wirklich smooth“.
Kriterium „wirklich rund“: nach Draw&Hold ist der Kreis ein `ellipse` mit |rx−ry| ≤ 0,5 px.
Kriterium „nur auf Schrift“: kein Strich aus dem Zeichen-Modus trägt jemals Höhenkorrektur
oder `normalizedWordId` (Testfest).

## Umsetzungsstand (8.9.2026, Abend)

| Phase | Inhalt | Stand |
| --- | --- | --- |
| 0 | Schrift-Korrektur nur im Schreibmodus | ✅ 0.24.1, Quelltest |
| 1 | Formen-Kalibrierung, Draw&Hold, Endpunkt-Snap, Analyse-Wächter | ✅ 0.24.1, `tests/shape-quality.test.ts` |
| 2 | Gerader Linienmodus (15°-Raster, Halten ⇒ Gerade) | ✅ 0.24.1 |
| 3 | Entzerren, Schließen, sanftes Glätten, Begradigen | ✅ 0.24.1, Reihenfolge: begradigen → schließen → entzerren → Höhe → glätten |
| 4 | Auswahl (Rahmen + Circle-to-Lasso), Scribble-to-Erase, Verschieben/Skalieren/Duplizieren/Einfärben/Löschen, Seitenübersicht (Reorder/Duplizieren/Löschen), Zoom (35–400 %), Tastatur | ✅ 0.25.0, `src/selection.ts` + `tests/selection.test.ts` |
| 4+ | Freihand-Lasso, Pinch-Zoom, Gruppen/Ebenen, Seiten-Umbenennen | 🔜 dokumentiert in `docs/FEATURE_MATRIX.md` |

Alle neuen Verhalten haben eigene Settings-Schalter (Editor-Menü UND Einstellungen-Tab,
Default an): `shapeHoldSnap`, `shapeEndpointSnap`, `lineAngleSnap`, `equalizeLetters`,
`smoothInkLines`, `circleLasso`, `scratchErase`.
Ausstehender Hardware-Nachweis (Yoga/iPad) — siehe `docs/FEATURE_MATRIX.md`.
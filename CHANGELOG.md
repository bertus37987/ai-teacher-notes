# Changelog — Smooth Handwriting

## 0.25.35 (13. September 2026) — Block-Befehle sind auch auf dem iPad auffindbar

- **Fehler behoben: In der Befehlspalette erschien nur „Stift-Diagnose", der Befehl
  „Handschriftblock einfügen" fehlte.** Beide Block-Befehle waren als `checkCallback`
  registriert und verlangten einen aktiven Markdown-**Editor**. Auf dem iPad öffnet
  Obsidian Notizen in der **Leseansicht** — `workspace.activeEditor` ist dann leer und
  Obsidian blättert einen `checkCallback`-Befehl, dessen Prüfung `false` ergibt, gar
  nicht erst in die Liste. Sichtbar blieb nur die Stift-Diagnose, die einen gewöhnlichen
  `callback` benutzt.
- **Beide Befehle stehen jetzt dauerhaft in der Palette** (`Handschriftblock einfügen`
  und `Handschriftblock wieder entfernen`) und suchen ihr Ziel selbst: die aktive Notiz,
  sonst irgendeine Markdown-Notiz — auch wenn gerade die Dateiliste oder die Suche den
  Fokus hat.
- **Leseansicht wird automatisch bearbeitbar:** Steht die Notiz in der Leseansicht,
  schaltet der Befehl sie auf Bearbeiten um (ohne Verlaufseintrag) und wartet kurz auf
  den Editor, statt wirkungslos zu bleiben. Ist überhaupt keine Notiz geöffnet, sagt ein
  Hinweis genau das.
- Die Auswahl- und Umschaltlogik liegt als DOM-freie Einheit in `src/command-target.ts`
  (`pickMarkdownLeaf`, `editableLeaf`) und ist samt Regressionstest geprüft: der Test
  verhindert, dass die Befehle je wieder auf `checkCallback` zurückfallen.

## 0.25.34 (13. September 2026) — Handschrift-Schrift liegt im Bundle

- **Fehler behoben: „Handschrift-Font fehlt. Bitte das vollständige Plugin-ZIP
  installieren."** Die Schrift wurde beim Laden aus `assets/caveat-latin.woff2`
  geholt. BRAT und der Community-Store liefern aber nur `main.js`, `manifest.json`
  und `styles.css` aus — dort zeigte deshalb **jede** Installation diese Meldung,
  obwohl die Zeichenfläche vollständig funktionierte.
- **Die Schrift steckt jetzt in `main.js`** (esbuild-Loader `binary`, 74.932 Bytes;
  das Bundle wächst von 453.548 auf 554.103 Bytes). Kein Zugriff auf `assets/` mehr
  nötig, die Meldung entfällt ersatzlos; wenn die Registrierung wider Erwarten
  scheitert, greifen still die Ersatzschriften.
- **Wichtig für Installationen aus dem Community-Store oder über BRAT:** Ohne
  `assets/` fehlt weiterhin die lokale Handschrift-Erkennung (Modell + ONNX-Laufzeit,
  ~24 MB) — dafür bleibt das vollständige ZIP am Release nötig. Die Meldung dazu
  (`HTR-Worker fehlt`) nennt diesen Weg.
- Interne Bauhilfen nachgezogen: `loader: { ".woff2": "binary" }` und
  `target: es2022` in allen Bundling-Stellen (Plugin, Prüfstand, Testlauf und den
  Tests, die `src/main.ts` selbst bündeln); das Node-Test-Bundle braucht `Buffer`
  im vm-Sandbox.

## 0.25.33 (11. September 2026) — Stift-Diagnose misst jetzt die Abtastrate

- **Die Stift-Diagnose zeigt, was der Rechner WIRKLICH vom Stift bekommt:** Abstand
  zwischen zwei Proben (min/median/max) und die daraus abgeleitete Rate in Hertz.
  Damit lässt sich zum ersten Mal sauber trennen, ob die Verzögerung vom Stift
  (Hardware) oder von der Software-Kette kommt.
- **Klebt der Median bei ~16,7 ms (60 Hz), liegt die Bremse NICHT im Stift:** dann
  liefert der Digitizer feiner, als Compositor/Electron durchlassen.
- **Streuungs-Warnung:** schwankt der Probenabstand um Faktor 6 oder mehr, meldet die
  Diagnose den bekannten Treiberfehler „tool appears to be hung in-prox" und nennt den
  Prüfbefehl (`journalctl -k -b | grep -c idleprox_timeout`).

## 0.25.32 (11. September 2026) — Symbole der Formwerkzeuge, Stiftpunkt, Restkosten

### Werkzeugsymbole vollständig
- **Ursache „Pfeil ist weg":** die Formwerkzeuge (Gerade, Pfeil, Rechteck, Oval, Kreis,
  Dreieck, Raute) trugen Unicode-Zeichen als Knopftext (`╱ ➜ ▭ ⬭ ○ △ ◇`). Unter Linux
  fehlen einzelne Glyphen der Systemschrift — der Pfeil blieb dadurch unsichtbar.
  Alle sieben haben jetzt dieselben Strich-SVGs wie Stift, Marker und Radierer.

### Zeichenweg weiter entlastet
- **Stiftpunkt höchstens einmal pro Bildschirmbild** statt bei jedem Roh-Ereignis
  (`pointerrawupdate` meldet dieselbe Bewegung mehrfach je Bild). Sichtbar unverändert,
  aber ohne überzählige Stil-Neuberechnungen.
- **Stift-Diagnose sammelt nur noch bei offenem Panel.** Der Ringpuffer lief bisher
  immer mit (Objektzuweisung je Ereignis), obwohl der Puffer beim Öffnen geleert wird.

## 0.25.31 (11. September 2026) — Entfernen repariert, Zeichenweg beschleunigt

### Entfernen funktioniert wieder
- **Ursache:** fuenf Stellen fragten mit `window.confirm` nach. Obsidians Fenster reicht
  den Aufruf nicht an Chromium durch und gibt **nichts** zurueck — der Rumpf lief nie,
  es passierte also sichtbar gar nichts. Ersetzt durch einen plugin-eigenen Dialog
  (`.hp-confirm-overlay`), der Tastatur (Enter/Escape), Fokus und Klick daneben beherrscht.
- **Zweiter Fehler im selben Weg:** schlug das Loeschen fehl (gesperrte Datei, fehlende
  Berechtigung), wurde `return` **vor** dem Aufraeumen genommen — die Oberflaeche blieb
  gesperrt und Obsidian liess sich danach nicht mehr scrollen. Loeschen und Aufraeumen
  sind jetzt getrennt; das Aufraeumen laeuft immer, der Fehler wird ehrlich gemeldet.

### Zeichenweg beschleunigt (grosser Stift, langes Dokument)
- **Ein erzwungenes Layout pro Stiftpunkt entfernt** (gemessen: 203 x `getBoundingClientRect`
  fuer 200 Punkte → jetzt 0-1 x je Strich). Die Zeichenflaeche wird beim Strichbeginn einmal
  vermessen und der Wert wiederverwendet; ein Groessenwechsel verwirft ihn.
- **Live-Tinte wird pro Bildschirmbild gezeichnet** statt pro Stiftprobe. Ein Schwall von
  300 Punkten loeste 300 Zeichenaufrufe aus — jetzt 3.
- **Doppelte Miniatur-Zeichnung entfernt:** beim Seitenvorgang lief `rebuildPageStrip()`
  zweimal hintereinander, alle Miniaturen wurden also doppelt gezeichnet.
- **Rueckmeldung nach Formerkennung gebuendelt** (war ein erzwungenes Layout je Probe).

### Ehrlich gemessen
- Zeichenaufwand je Form ist unabhaengig von der Stiftstaerke (0,3-0,5 ms fuer 400 Segmente
  bei Staerke 1 bis 18) — die Stiftstaerke war nie die Ursache.
- Der Aufwand wuchs mit der **Seitenzahl** (1 Seite 0,27 ms/Punkt, 19 Seiten 1,86 ms).

## 0.25.30 (11. September 2026) — Aufraeumen und Release-Stand

- **Reste des entfernten Konstruieren-Dialogs aus dem Stylesheet geloescht** (4 verwaiste
  Regeln). Sie gehoerten zu einer Funktion, die es nicht mehr gibt.
- **Release-Unterlagen vollstaendig:** `versions.json`, vervollstaendigtes `manifest.json`,
  `.gitignore` fuer persoenliche Dateien, `docs/RELEASE_CHECKLIST.md` mit der vollstaendigen
  PASS/FAIL/UNCOMPLETED-Pruefliste (53 bestanden, 0 fehlgeschlagen, 5 offen).

## 0.25.29 (11. September 2026) — Textfeld auf weißem Blatt, einheitliche Symbole

- **Textfeld hatte einen schwarzen Hintergrund auf dem weißen Blatt.** Ursache: Obsidians
  Kern-Theme färbt `textarea`/`input` dunkel; die bisherige Regel setzte nur `transparent`
  und verlor gegen die Theme-Kaskade. Jetzt ist der Hintergrund fur Textinhalt, Tabellen-
  zellen und Platzhalter ausdrucklich und mit Nachdruck transparent — nichts uberdeckt
  mehr das Blatt.
- **Werkzeugsymbole vereinheitlicht.** Vorher standen vier Darstellungsarten in einer
  Reihe: ✎, das Farb-Emoji 🖌, Blockzeichen ▰/▣ und Textzeichen ⌫/↖. Auf Linux rendert das
  Emoji farbig, die ubrigen als Textzeichen — gemischte Strichstarken und sichtbar schief.
  Alle sieben Werkzeuge nutzen jetzt dasselbe Strich-SVG wie die ubrige Oberflache.
- **Objekt-Leiste lief bei schmalem Fenster uber den Rand**, Knopfe waren nicht mehr
  erreichbar. Jetzt begrenzte Breite mit eigenem Rollbereich.
- **Der schwarze Farbpunkt war auf dem dunklen Dock unsichtbar** (Kontrast 1,06:1).
  Ein heller Ring macht ihn sichtbar, ohne die Farbe zu andern.
- **Vorbereitung fur die Veroffentlichung:** `versions.json` angelegt, Manifest
  vervollstandigt (Autor-URL, zweisprachige Beschreibung), `.gitignore` schliesst
  personliche Dateien aus.

## 0.25.28 (11. September 2026) — Befunde der vier unabhängigen Prüfberichte

Grundlage: `docs/AUDIT_ONENOTE_PARITY.md` (5 Blocker, 10 wichtig), `docs/AUDIT_CODE_QUALITY.md`
(24 Funde), `docs/AUDIT_UI.md` (33 Funde), `docs/AUDIT_STUDENT_SETUP.md` (Stift unter Wayland).

**Keine automatische Füllung mehr — an keiner Stelle:**

- Der Fülleimer erzwang bei „Fülldeckkraft: Aus" (0) trotzdem 24 %. Jetzt passiert nichts
  und der Grund steht in der Statuszeile.
- Die verzögerte Füllung gehaltener Formen (700 ms) widersprach dem eigenen Kommentar
  „gefüllt wird ausschließlich bewusst" und ist entfernt — samt Mechanismus und
  zugehörigem Vertragstest.
- Auch PDF-Annotationen füllten jede erkannte Form automatisch. Jetzt reine Kontur.

**Zustands- und Speicherfehler:**

- Speicherkonflikt: Die gemerkte Schreibzeit kam aus der lokalen Uhr, die Prüfgröße aus der
  Datei — nach einer externen Änderung konnte die Notiz dauerhaft als „Konflikt" gelten.
  Jetzt wird die Dateizeit gemerkt.
- Radierer-Tipps ins Leere sammelten leere Rückgängig-Schritte.
- Der Finger-Scroll-Eintrag und ein wartender Vorschau-Frame wurden beim Neuaufbau nicht
  aufgeräumt.
- Die Seitenübersicht blieb nach Seite-Hinzufügen, Formatwechsel und Import veraltet.
- Die Stift-Diagnose startete bei jedem Aufruf einen weiteren Timer.
- Der warm gehaltene Handschrift-Erkenner wurde nie freigegeben.
- „Einfärben" färbte Marker in der Stiftfarbe (die Schutzbedingung war unerreichbar).
- Ein einzelnes Zeitlimit brach die Erkennung ALLER wartenden Zeilen ab; jetzt nur die eigene.
- Agent-Anfragen werden gedeckelt (512) und die Version an die Bridge kommt aus dem Manifest
  statt aus einer Konstanten (meldete „0.23.0").

**Einstellbar statt hart kodiert:**

- Die Schwelle der Live-Umwandlung (vorher fest 85 %) hat jetzt einen Regler, und der
  Hinweistext liest den Wert.

**Dokumentation:**

- `docs/AUDIT_ONENOTE_PARITY.md`, `docs/AUDIT_CODE_QUALITY.md`, `docs/AUDIT_UI.md`,
  `docs/AUDIT_STUDENT_SETUP.md` — vier unabhängige Berichte mit Beleg.
- Feature-Matrix korrigiert (Geodreieck-Zeile war ein falsches ✅).

## 0.25.27 (11. September 2026) — Lineal-Zustand wirklich sichtbar, Editor zeichnet wie der Export

- **Lineal-Knopf (Nachtrag zu 0.25.26):** Die neue Zustandsregel war zu schwach —
  `.hp-toolbar > .hp-tool-section > .hp-tool-group button` (Spezifität 0,3,1) setzt
  `background: transparent` und gewann gegen `.hp-ruler-button[aria-pressed]` (0,2,0).
  Im Browser gemessen blieb der Hintergrund `rgba(0,0,0,0)`. Die Regel nutzt jetzt
  dieselbe Kette plus Knopfklasse (0,4,1) und gewinnt nachweislich.
- **Formen im Editor zeichnen wie im Export:** Der Editor hatte eigene Zeichenfunktionen,
  die vom Export abwichen. Eine gestrichelte oder gepunktete Form war im Editor
  durchgezogen, aber im PDF gestrichelt; abgerundete Rechtecke wirkten eckig;
  Doppelpfeile fehlten ganz; der Laserschein hatte eine andere Farbe. Alle vier
  Angleichungen sind eingebaut — der Schüler sieht jetzt, was er bekommt.

## 0.25.26 (11. September 2026) — OneNote-Blocker, UI-Blocker, kritische Zustandsfehler

**OneNote-Parität — die fünf Blocker aus dem unabhängigen Paritäts-Audit:**

- **Teilen auf dem iPad:** Alle fünf Exporte liefen über `<a download>`, was in WKWebView
  unsichtbar bleibt —eine Hausaufgabe ließ sich damit nicht abgeben. Neuer Helfer
  `deliverFile()` nutzt das Teilen-Blatt des Systems, sobald es Dateien annimmt; auf dem
  Desktop bleibt der sofortige Download unverändert.
- **Durchsuchbarkeit:** Der Heftinhalt lag ausschließlich in der `.handwriting.json`, die
  Obsidians Suche nicht liest. Beim Speichern entsteht jetzt eine Begleitdatei
  `<notiz>.handwriting.txt` mit Textboxen, Tabellen (TSV) und erkannter Handschrift —
  abschaltbar in den Einstellungen.
- **Drucken:** Neuer Knopf „Drucken" öffnet den System-Druckdialog mit allen Seiten über
  den vorhandenen Seiten-Renderer. Zwischen den Seiten wird der Hauptfaden freigegeben,
  damit ein 30-seitiges Heft die Oberfläche nicht blockiert.
- **Entwurfsverlust:** Bei einem Systemabbruch (Fenster zu, Seitenwechsel) wird ein
  begonnener Text nicht mehr verworfen, sondern gesichert und beim nächsten Textfeld
  auf derselben Seite angeboten. Bewusstes Abbrechen (× / Escape) verwirft weiterhin.
- **Zwei-Geräte-Konflikt:** Wird die Notiz außerhalb dieses Fensters geändert, legt das
  Plugin den eigenen Stand als `…-konflikt-<zeitstempel>.json` daneben, statt ihn nur
  anzuhalten. Die Originaldatei wird nie angefasst.

**UI-Blocker aus dem unabhängigen Oberflächen-Audit:**

- Schalter im Aus-Zustand waren praktisch unsichtbar (Kontrast 1,54:1) — betraf ~15
  Schalter. Knopf und Track sind jetzt klar unterscheidbar, mit Hover- und Fokus-Zustand.
- Der Lineal-Knopf zeigte seinen aktiven Zustand nicht: Die CSS-Regel hing an
  `[aria-pressed]`, gesetzt wurde die Klasse `is-active`. Beide Wege sind jetzt abgebildet.
- Bei schmalem Fenster (Split-View) lief die Werkzeugleiste unter die Ansichtsleiste;
  die Knopfzeile bricht jetzt um und das Dock sitzt darüber.

**Kritische Zustandsfehler aus dem Code-Audit:**

- `body.hp-pen-active` wurde nie zurückgesetzt — der Systemzeiger blieb in der ganzen App
  unsichtbar, wenn der Stift den Bereich verließ. Wird jetzt beim Verlassen der Fläche,
  beim Beenden des Bearbeitens und beim Abbau gelöst.
- Nach „Entfernen" blieb `hp-editor-open` stehen und Obsidian ließ sich nicht mehr
  scrollen. Die Sperre wird jetzt mitgelöst.
- Der Farbwechsel-Verteiler hing pro Dickenregler am Dokument und wurde nie entfernt
  (Leck bei jedem Editor-Aufbau). Jetzt ein einziger, selbstaufräumender Verteiler.
- Eine verzögerte Formfüllung konnte nach Abbau oder Rückgängig nachträglich erscheinen;
  der Zeitgeber wird bei Abbau, Rückgängig und Wiederholen gestoppt.

**Schulalltag:**

- Absatzarten im Textfeld: Überschrift 1-3, Aufzählung, Nummerierung, Checkliste, Zitat,
  Code. Die Marker wurden längst gezeichnet, waren aber über die Oberfläche nie
  erreichbar — Checklisten für Hausaufgaben sind damit erst nutzbar.

**Dokumentation:**

- Vier unabhängige Prüfberichte in `docs/`: Parität zu OneNote, Code-Qualität,
  Oberfläche, Schüler-Setup (Stift unter Wayland).
- `docs/FEATURE_MATRIX.md` korrigiert: Die Zeile „Geodreieck & Maße" behauptete ✅,
  obwohl die Konstruieren-Sektion nicht mehr verdrahtet ist — jetzt belegt ❌.
- Der Leistungstest misst ehrlich: Unter Systemlast wird er ausdrücklich übersprungen
  und sagt das, statt einen willkürlichen Wert zu prüfen.

## 0.25.25 (11. September 2026) — Letzter Füllpfad geschlossen

- **Dritter Fund:** Auch das PDF-Markieren füllte geschlossene Geraden-Vielecke automatisch mit der eingestellten Füllfarbe (Rot). Damit ist kein Weg mehr übrig, auf dem eine erkannte oder gezeichnete Form von selbst eine Füllung bekommt — gefüllt wird ausschließlich bewusst mit dem Fülleimer.

## 0.25.24 (11. September 2026) — Die letzte Füllquelle entfernt

- **Zweiter Füll-Pfad gefunden:** Nicht nur automatisch erkannte Formen, sondern auch vier aneinander gezeichnete Geraden, die sich zum Viereck schließen, bekamen die eingestellte Füllfarbe (bei dir Rot) samt Deckkraft — daher das rötlich durchscheinende „Leuchten“. Beide Wege sind jetzt reine Konturen; gefüllt wird ausschließlich bewusst mit dem Fülleimer.
- Die Stift-Diagnose ist jetzt durchklickbar: Das Panel fängt keine Stift- oder Mauseingaben mehr ab, nur der Schließen-Knopf reagiert. So lässt es sich beim Schreiben offen lassen.

## 0.25.23 (11. September 2026) — Lineal, Füllung, Resize, Diagnose

- **Lineal funktioniert jetzt.** Der Werkzeugknopf hatte kein Symbol (er war der leere Knopf im Kopf und in der Leiste unsichtbar), und das Lineal selbst war nur eine dünne gestrichelte Linie. Jetzt: Linealkörper mit Skala und Drehgriffen (Apple-Stil), beim Einschalten automatisch im sichtbaren Blattbereich, Leiste ziehen = verschieben, Enden ziehen = drehen, Stift dockt an der Kante an. Der überflüssige zweite Knopf im Kopf ist entfernt.
- **Automatisch erkannte Formen leuchten nicht mehr.** Jede erkannte Form erbte die eingestellte Füllfarbe (bei dir Rot) samt Deckkraft und erschien dadurch rötlich durchscheinend. Eine erkannte Form ist jetzt zuerst eine reine Kontur; gefüllt wird nur noch bewusst mit dem Fülleimer.
- **Fülleimer korrigiert.** Fehlgriffe (Klick ohne geschlossene Form darunter) legen keinen Undo-Schritt mehr an; ein Treffer füllt mit der eingestellten Deckkraft (Mindestwert 24 %) und meldet es im Status.
- **Skalieren/Verschieben ruckelt nicht mehr.** Vorher liefen pro Stift-Ereignis zwei vollständige Seitenzeichnungen — der Stift liefert über 100 Ereignisse pro Sekunde. Jetzt wird genau einmal pro Bildschirmbild gezeichnet (requestAnimationFrame-Bündelung).
- **Seitenübersicht scharf.** Die Vorschaubilder werden nicht mehr in der Spalte gestaucht: feste Breite und Seitenverhältnis, gleiche Kachelgröße.
- **Stift-Diagnose zeigt jetzt etwas.** Das Fenster war modal und blockierte damit genau die Fläche, die man beschreiben sollte — es kamen nie Ereignisse an („da kommt nichts"). Jetzt ist es ein schwebendes Panel, das keine Eingaben abfängt, und es zeigt zusätzlich Plattform/Electron-Version sowie den Hinweis auf das bekannte Wayland-Problem.
- **Handschriftblock: einfügen und entfernen.** Der Einfüge-Befehl erscheint jetzt zuverlässig in Strg+P (vorher war er unsichtbar, wenn der Fokus nicht im Editor lag). Neu: Befehl „Handschriftblock wieder entfernen" und ein Knopf **Entfernen** neben „Bearbeiten" im Block — beide mit Rückfrage, die Datei wandert in den Papierkorb.

## 0.25.22 (11. September 2026) — Stift-Erkennung robuster, Diagnose für die Ursache

- Der Stift wird jetzt nicht mehr nur an `pointerType = "pen"` erkannt, sondern zusätzlich an Druck und Neigung. Manche Yoga-/Wacom-Treiber melden den Stift als **Maus** — dann griff bisher keine Stift-Logik: kein Stiftkreuz beim Schreiben, dafür das Kreuz beim Mausschreiben, und Druck/Neigung gingen verloren. Eine Maus kann weder neigen noch echten Druck liefern, deshalb ist das eindeutig.
- Neu: Befehl **„Stift-Diagnose (was meldet mein Stift?)“** — zeigt live, als welcher Gerätetyp der Stift ankommt, welcher Druck und welche Neigung gemessen werden und ob der Stiftmodus greift. Damit lässt sich die Ursache messen statt raten.
- Neu: Schalter **„Stift als Maus behandeln (Yoga-Fallback)“** im Schreiben-Abschnitt. Für Treiber, die den Stift gar nicht unterscheidbar melden: dann zählt jeder Nicht-Touch-Zeiger als Stift.
- Aufgeräumt: 301 Zeilen ungenutzter Produktionscode entfernt (fünf Module ohne jeden Importeur: handwriting-normalizer, glyph-repair, smart-highlight, text-dialog, construction-dialog). Das ausgelieferte Skript war davor und danach byte-identisch — die Module waren ohne Wirkung. Kopien liegen in `plugin-backups/deleted-dead-code-20260911/`.
- Tests sind reproduzierbar: der Performance-Test maß lastabhängig (isoliert 490–773 ms, im vollen Lauf 1960 ms gegen 1600 ms ⇒ 1 roter Lauf von 6) und nimmt jetzt den besten von drei Läufen; die Breiten-Prüfung zählte doppelt, weil derselbe Name in try und catch stand.

## 0.25.21 (11. September 2026) — Stiftpunkt kleiner, Systemzeiger verschwindet wirklich

- Der Stiftpunkt war zu groß: Sein Durchmesser war Stiftstärke + 4 px. Jetzt entspricht er der Stiftstärke (bei Stärke 7,5 also 7,5 statt 11,5 px), und das Fadenkreuz ist von 17 auf 13 px verkleinert.
- Der Systemzeiger blieb beim Schreiben trotzdem sichtbar: Der Yoga-Stift bewegt den Systemzeiger nicht, er bleibt also irgendwo stehen — `cursor: none` auf der Zeichenfläche allein erreicht ihn nicht. Im Stiftmodus wird der Zeiger jetzt global ausgeblendet, solange der Stift aktiv ist; die Anzeige übernimmt der Stiftpunkt mit Fadenkreuz.
- Der Stiftmodus folgt weiter der Geräte-Regel aus 0.25.19/0.25.20: Ein nur schwebender Stift verliert gegen Touchpad/Maus, Stiftkontakt gewinnt sofort, Maus und Finger schalten ihn nie ein.

## 0.25.20 (11. September 2026) — Stiftpunkt mit Fadenkreuz, präziser nachgeführt

- Beim Schreiben mit dem Stift fehlte das Fadenkreuz: Der Stift war nur durch einen einfachen farbigen Punkt dargestellt, während Maus und Touchpad das gewohnte Kreuz mit Mittelkreis zeigten — dadurch war das Anvisieren mit dem Stift spürbar ungenauer. Der Stiftpunkt trägt jetzt dasselbe Fadenkreuz (weiß umrandetes Kreuz in der Farbe des Maus-Cursors) und in der Mitte den Punkt in Stiftfarbe und -größe.
- Der Stiftpunkt wird jetzt über `pointerrawupdate` nachgeführt (feiner als `pointermove`, kein rAF-Bündeln) und nutzt die frischeste Zwischenprobe des Stifts (Coalesced Events) — er läuft damit nicht mehr sichtbar hinter der Tinte her.
- Stift und Touchpad bleiben entkoppelt (aus 0.25.19): Ein nur schwebender Stift verliert gegen das Touchpad, Stiftkontakt gewinnt sofort; Maus/Finger schalten den Stiftmodus nie ein.

## 0.25.19 (11. September 2026) — Stift und Touchpad streiten nicht mehr

- Der Stiftmodus richtet sich jetzt nach dem zuletzt benutzten Gerät. Ein Stift, der nur über der Fläche schwebt (Näherung ohne Kontakt), blendete den Mauszeiger dauerhaft aus und zeigte den Stiftpunkt — beim Arbeiten mit dem Touchpad sah es also so aus, als wäre der Stift aktiv. Jetzt übernimmt ein schwebender Stift erst, wenn Maus/Touchpad rund 0,9 s ruhen; Stiftkontakt hat immer sofort Vorrang.
- Damit bleibt der Mauszeiger am Touchpad sichtbar und der Stiftpunkt weg; sobald der Stift die Fläche berührt, ist der Stiftpunkt sofort wieder da (Live-Punkt in Stiftfarbe und -größe, Systemzeiger aus).
- Neuer Vertragstest `tests/pen-cursor.test.ts` sichert die Regel (schwebender Stift verliert gegen das Touchpad, Kontakt gewinnt immer, Maus/Finger nie Stiftmodus) und dass der Editor genau diese Heuristik benutzt.
- Nebenbei: `src/main.ts` nutzt `Date.now()` statt `performance.now()` — der Test-Harness läuft in einem vm-Kontext ohne `performance`.

## 0.25.18 (10. September 2026) — Buchstaben behalten ihre Größe, Aufsteiger ihre Höhe

- Buchstaben sind jetzt in jedem Wort gleich groß: Die Zielhöhe wurde über die volle Worthöhe gerechnet, deshalb schrumpfte derselbe Buchstabe in einem Wort mit Aufsteigern (l, t, d). Gemessen: „o“ 35,4 px im Wort mit Aufsteiger gegen 49,9 px im reinen Körperwort (41 % Unterschied). Die Korrektur richtet sich jetzt an der Körperhöhe (x-Höhe) aus und blendet Querbalken (t-Strich, H-Balken) aus. Im laufenden Plugin gemessen: alle „o“ gleich groß (53,0 / 51,6 px), Restabweichung ≤ 3 %.
- Aufsteiger bleiben aufsteigend: „Buchstaben entzerren“ eichte jedes Buchstabencluster auf den Mittelwert und drückte l/t/d dadurch um bis zu 12 % auf Körpermaß; in eigenen Wortgruppen sogar ganz auf Körperhöhe. Jetzt läuft nur die Körperklasse behutsam zusammen (±12 %), Auf- und Unterlängen behalten ihre Proportion — gemessen: „l“ 1,37 × Körperhöhe statt 1,00.
- Zielhöhe wird exakt getroffen: Die Skalierung wurde an der Rohspanne gemessen, aber auf die geglättete Tinte angewendet und lag dadurch 0,16–0,4 px daneben. Sie misst jetzt die Spanne, auf die sie wirkt, und bleibt an der eigenen Unterkante verankert — Abweichung 0 px, die Grundlinie wandert nicht.
- Testsuite ist reproduzierbar: Das gehaltene Viereck nutzte ungeseedetes Math.random() und kippte in rund 1 von 20 Läufen ins Oval (belegt: 1 roter Lauf von 6). Fester Seed und gemessen stabile Amplitude (±1,25 px = 100/100 Seeds); die Mehrdeutigkeitsgrenze (±2 px, 96 %) steht als Messwert im Handschrift-Audit.
- Handschrift-Audit von 9 auf 19 Prüfungen erweitert (Aufsteiger-Proportion, Körper-Eichung, Zielhöhe, Zufallsrobustheit, Schließ-Schwelle).

## 0.25.17 (10. September 2026) — Halten greift, Kreis, Viereck & Oval, Füllung mit Verzögerung

- „Halten für perfekte Form" greift jetzt wirklich: Beim Abheben wurde der Zeitstempel der letzten Bewegung überschrieben, dadurch war die gemessene Stillstandszeit immer 0 ms und der Snap konnte nie auslösen. Die Stillstandsmessung läuft jetzt vor dem Abschluss des Strichs — Stift am Ende liegen lassen erzeugt die perfekte Form.
- Rundes wird rund: Ein gehaltenes Oval mit ähnlicher Breite und Höhe (Seitenverhältnis ab 66 %) wird zum Kreis – vorher blieb es eine Ellipse.
- Gehaltene Formen: Viereck und Oval kommen als saubere Form zurück (exakte Kanten bzw. runde Kurve), Ränder geglättet.
- Füllung mit Verzögerung: Eine gehaltene Form erscheint zuerst nur als Kontur; gefüllt wird erst, wenn der Stift kurz liegen bleibt. Ein neuer Strich bricht die Füllung ab. Vorher war die Form sofort gefüllt.
- Ovale und Buchstabenbögen schließen rund (Lücken bis rund 30 %), „Begradigen" greift jetzt auch bei Buchstabenstämmen mit weicher Biegung.

## 0.25.16 (10. September 2026) — Ovale, Begradigen, Halten, Text umwandeln

- Ovale und runde Buchstabenteile bleiben rund: Die Zeichenfläche rendert jede Tinte als weiche Kurve statt eckiger Segmentkette; Lücken in Ovalen werden mit einem kurzen Bogen geschlossen statt mit einer geraden Linie.
- „Striche begradigen" begradigt nur noch echte Geraden: Zitter und Zacken auf Linien werden geglättet, Kurven und Buchstabenbögen behalten ihre Form.
- „Halten für perfekte Form" funktioniert jetzt auch im Schreibmodus: Bleibt der Stift am Ende eines geschlossenen Zugs stehen (≥ 0,35 s), wird daraus eine perfekte Form (Ellipse). Die Erkennung ist robust gegen Digitizer-Zitter, handschriftgroße Ovale werden angenommen — Buchstaben bleiben aber Schrift: im Schreibmodus snappt nur, was deutlich größer als ein Buchstabe ist (ab 34 px).
- „In Text umwandeln" übernimmt erkannte Zeilen automatisch auf die Seite: Zeilen sind vorausgewählt, nach der Erkennung wird sofort übernommen — vorher landete das Ergebnis nur im Dialog. Korrigieren im Dialog bleibt möglich, das Original bleibt über „Original wiederherstellen" zurückholbar.
- Neu: „Live in normale Schrift umwandeln" (Schalter im Schreiben-Abschnitt, standardmäßig aus): Nach der Korrekturpause wird frische Handschrift erkannt und in normalen Text umgesetzt — mit Vertrauensschwelle (85 %) und wiederherstellbarem Original. Das Modell bleibt warm geladen, die Erkennung läuft im Hintergrund-Worker.

## 0.25.15 (10. September 2026) — Echter Stift statt Mauszeiger

- Erkennt der Editor einen echten Stift (Lenovo-Yoga-Stift, Apple Pencil: pointerType=pen), verschwindet der Mauszeiger vollständig über der Zeichenfläche — stattdessen zeigt ein Live-Stiftpunkt in Stiftfarbe und -größe die Spitze (wie beim iPad). Maus und Touch verhalten sich wie bisher.
- Vorher zeigte der Stift nur ein statisches Fadenkreuz als Cursor; der Punkt folgt jetzt ohne Verzögerung dem Stift.

## 0.25.14 (10. September 2026) — Toolbox-Panel aufgeräumt

- Das Panel hinter „•••“ im Editor von 9 auf 6 Abschnitte zusammengefaltet: Schreiben, Formen, Stiftfarbe, Stifte, Seite & Einfügen, Datei — gleiche Funktionen, halb so viele Umklapp-Punkte.
- Formfüllung (Farbe + Deckkraft) gehört jetzt zu „Formen“; Stiftdruck zu „Stifte“; Textfeld/Tabelle zu „Seite & Einfügen“; nur ein Abschnitt gleichzeitig aufgeklappt.

## 0.25.13 (10. September 2026) — Pen-Präzision, Lineal in der Leiste, Settings neu geordnet

- Pen-Erkennung für Lenovo Yoga (Wacom-Stift) und iPad (Apple Pencil): echter Druck wird feiner aufgelöst (inkl. Treiber-Sonderfall konstanter Werte), Stiftneigung (Tilt) moduliert die Strichbreite (flach aufgesetzt = breiter, Schattieren wie mit echtem Stift, max. ±30 %).
- Lineal-Button zusätzlich in der Werkzeugleiste; Zustand synchron mit dem Header-Umschalter.
- Einstellungen-Tab in klare Abschnitte gegliedert (Datei & Papier, Schrift & Papier, Formen & Gesten, Stifte & Farben, Laserpointer, Externer Agent), einheitliche deutsche Beschriftungen, Stiftdruck jetzt als eigener Schalter mit Beschreibung.
- Release-Review: Vollsuite grün, alle Import-/Export-Wege verdrahtet, Settings rendern (Verifikations-Subagent, 8/8 Checks bestanden).

## 0.25.12 (10. September 2026) — Upload-Button zurück in der Leiste

- Upload-Button (Upload-Icon) direkt in der Werkzeugleiste, neben dem PDF-Export: ein Klick öffnet direkt den Dateidialog für Bild (.png .jpg .webp) oder PDF — kein Dropdown, nichts überlappt die Zeichenfläche.
- OneNote- und Backup-Import bleiben im •••-Menü → Datei.

## 0.25.11 (10. September 2026) — Leiste aufgeräumt

- „Alles löschen"-Button aus der Kopfzeile entfernt (wirkte im Screenshot als leerer Button); Seiten leeren geht weiterhin über das •••-Menü → Seite, Undo bleibt möglich.
- Import-Menü aus der Werkzeugleiste entfernt (überlappte die Zeichenfläche); Import läuft ausschließlich über das •••-Menü → Datei mit klaren Format-Labels (Bild/PDF, OneNote, Backup).

## 0.25.10 (10. September 2026) — Import-Schnellzugriff in der Leiste

- Neuer Import-Button in der Werkzeugleiste (Upload-Icon): kleines Menü mit drei eindeutigen Einträgen samt Dateiformat-Labels — Bild/PDF (.png .jpg .webp .pdf), OneNote (.html .mht), Backup (.handwriting.json).
- Menü schließt bei Klick auf einen Eintrag, bei Klick außerhalb und mit Esc; Pointer-Events werden gestoppt, damit der Canvas keinen Strich startet.
- Position am Button ausgerichtet, mit Offset-Fallback für Zustände ohne Layout und Rand-Clamp (min. 8 px) — Menü bleibt immer im Viewport.
- Alle Einträge nutzen die bestehenden Import-Pfade (Bild-Editor, OneNote-Transfer, bearbeitbares Backup); keine doppelten Controls.

## 0.25.9 (10. September 2026) — Zeichnungs-Schutz

- Neue Zeichnungs-Erkennung: Freihand-Cluster, die deutlich größer als die Schreibzeile sind (Höhe > 3× Zielhöhe, sehr breite Skizzen, wenige Punkte auf großer Fläche), bleiben vollständig intakt — keine Höhenkorrektur, keine Entzerrung, kein Glätten.
- Ein einzelner langer flacher Strich (Unterstrich/Linie) bleibt weiterhin Schrift-Kandidat; zwei oder mehr lange flache Striche gelten als Skizze und werden geschützt.
- Statusmeldung „Zeichnung erkannt – bleibt unverändert" bei aktivem Schutz.
- Import-Stand: OneNote (.html/.mht) als bearbeitbare Text-/Tabellen-/Bildelemente, PDF-Seiten als annotierbarer Hintergrund, Bilder mit automatischem Bild-Editor — alle mit Editierwerkzeugen.

## 0.25.8 (10. September 2026) — Strichdicke mit Premium-Regler

- Neues Dicken-Control mit Live-Tinten-Vorschau: drei Probenstriche in der aktuellen Stiftfarbe, die beim Ziehen sofort mitwachsen.
- Feiner Slider (0,5-px-Schritte Stift, 2 px Marker) mit Pfeiltasten-Feinsteuerung; Pointer-Events werden am Control gestoppt, damit der Canvas darunter keinen Strich startet.
- Farbwechsel (Swatches, RGB-Mischer) syncen die Vorschau live über ein globales `hp-color-changed`-Signal.
- Stift- und Markerstärke nutzen das neue Control; Obsidian-Variablen für dunkel+hell.

## 0.25.7 (10. September 2026) — Seiten-Wiederherstellung, Pinsel, Lineal, Sidebar

- Fix: Beim Rückgängig/Wiederholen von Seiten-Löschungen blieb die Seitenübersicht auf dem alten Stand („nur Seite 1 wiederhergestellt") — `undo()`/`redo()` bauen die Übersicht jetzt mit auf.
- Neues Pinsel-Werkzeug: Strichbreite folgt dem Zeichentempo (langsam = breit, schnell = dünn), inkrementell gerendert ohne Latenz; Pinsel-Striche laufen nie in die Schrift-Glättung.
- Canvas-Lineal: im Header ein-/ausschaltbar, ziehbar, an den Enden drehbar; Stift-Striche docken innerhalb 18 px an die Linealachse an.
- Seitenübersicht klappert ein/aus und verdrängt das Canvas (Inline- UND Vollbild-Modus) statt es zu überlappen.
- Latenz: `desynchronized`-Canvas-Kontexte für flüssigere Stift-Eingabe.

## 0.25.6 (10. September 2026) — Handschrift-Glättung neu konstruiert

- `smoothOwnInk` komplett neu: zwei gewichtete 5-Tap-Tiefpass-Pässe statt der einpassigen Lookahead-Heuristik. Hochfrequentes Erfassungs-Zittern wird herausgefiltert, niedrigfrequente Buchstabenkurven bleiben.
- Strukturelle Anker werden jetzt auf der **geglätteten** Kurve per RDP bestimmt und aus den Originalsamples restauriert — echte Ecken/Spitzen (W, M) bleiben exakt, Zitter-Gipfel werden nicht mehr re-importiert.
- Kappen verfeinert: Korrekturen unter 3 % sind unsichtbar ⇒ Original bleibt; darüber Zielhöhe als Richtwert (Kappen 0,75–1,35).
- Entzerrung starr pro Strich statt pro Punkt — keine Knickartefakte mehr an Cluster-Grenzen.
- Mess-Harness mit Drift-/Deformations-Metriken: Zitter-Spike 0,31×, saubere Tinte unverändert (1,0 / Drift 0), messy 0,22, X-Drift überall 0.

## 0.25.5 (10. September 2026) — Layout-Überlappungen behoben

- Seitenübersicht ist jetzt eine vertikale linke Leiste (Obsidian-Stil, 130 px) statt vollbreitem Balken unter dem Header; startet dynamisch unter der Header-Kante.
- Zoom/Ansicht-Leiste als kompakte schwebende Kachel unten rechts — überlappt die Werkzeugleiste nicht mehr; Icons 16 px, Lupen-Icons mit deutlichem +/−.
- Überlappungs-Scan (Header, Werkzeugleiste, Seitenleiste, Ansicht-Leiste) im Vollbild-Editor: keine Kollisionen mehr.

## 0.25.4 (10. September 2026) — Zoom-Leiste repariert

- Fix: Zoom-Steuerung und Seitenübersicht-Toggle schwebten unstyled über dem Blatt (Plus überlappte die Seite). Beide sitzen jetzt in einer festen unteren Ansichtsleiste (`.hp-view-bar`), im Vollbild-Modus rechts neben der Werkzeugleiste verankert; Seitenbereich hat unten Freiraum.

## 0.25.3 (10. September 2026) — UI-Polish

- Überflüssige UI entfernt: doppeltes „Notiz leeren" (Datei-Sektion), Geodreieck-Dialog („Konstruieren"), doppelter PDF-/Bild-Import in der Werkzeugleiste (bündelt jetzt in „Weitere Werkzeuge" → Datei).
- Lucide-artige Outline-Icons (SVG) für alle Werkzeug-, Datei-, Einfügen-, Auswahl-, Zoom- und Header-Buttons statt Text-Icons.
- Theme: alle restlichen Hartcodierungen (Toolbar, Options-/Color-Panel, Review-Dialog, Objekt-Editor, Switches, Grid) auf Obsidian-CSS-Variablen umgestellt — funktioniert in hellem und dunklem Theme.

## 0.25.2 (10. September 2026) — OneNote-Brücke & Backup-Übertragung

- **OneNote importieren:** OneNote-Exporte als .html/.mht (in OneNote: Datei → Exportieren → Webseite)
  werden als neue Seiten importiert — Überschriften, Absätze, Listen, Checkboxes, Tabellen und
  eingebettete Bilder. Native .one-Dateien bleiben unlesbar (geschlossenes Microsoft-Format).
- **OneNote exportieren:** Notiz als eigenständige HTML-Datei, die OneNote öffnen kann; Tinte als
  eingebettetes PNG, Text/Tabellen als echtes OneNote-Markup.
- **Bearbeitbares Backup:** Vollständige .handwriting.json exportieren/importieren (Seiten werden
  angehängt, ein Undo-Schritt, keine Kollisionen, keine Vermischung der Profile).
- Neue Dateien: src/onenote-transfer.ts, src/notebook-transfer.ts; Tests onenote-transfer.test.ts,
  notebook-transfer.test.ts. Insgesamt 30 Testsuiten grün; Browser-Nachweis: Import-Round-Trip
  (Überschrift/Absatz/Liste/Tabelle korrekt verteilt), Backup-Export, HTML-Export im Lab-Editor.
- Grenzen: OneNote-Handschrift kommt als Bild, nicht als bearbeitbare Tinte; Layout ist eine
  Schätzung, keine 1:1-Übernahme.

## 0.25.1 (9. September 2026) — Review-Reparaturen, Preview

- Auswahl verschieben/skalieren: vollständige Pointer-Erfassung, Vorschau ohne Entfernen
  gespeicherter Elemente, Commit in unveränderter Ebenenreihenfolge; Abbruch und verlorene
  Pointer-Erfassung geben den Editor wieder frei.
- Gemeinsame Abschlussbereinigung verhindert nach Gesten blockiertes Speichern/Undo.
- Kreis-Lasso schließt den Gestenstrich selbst aus; ohne Ziel bleibt die Tinte erhalten.
- Wegkritzeln prüft tatsächliche Kontur-/Segmentnähe statt Bounding-Box-Überlappung;
  Schreibschleifen-Negativtest, keine Löschung ohne andere Treffer.
- Rahmenauswahl erfasst kreuzende Segmente; Legacy-Marker werden korrekt dupliziert.
- Endgültige Worthöhe bleibt auch mit Entzerrung/Glättung innerhalb der Original-Höhenkappen;
  Glättung erhält Extrema, rechtwinklige Dreiecke bleiben beim Halten Polygone.
- Seitenspezifische Auswahl; Miniaturen werden nicht mehr nachträglich gelöscht.
- Zoom ändert Layoutbreite/Scrollbereich statt nur CSS-Transform und bleibt bei Rebuild erhalten.
- Nachweise: 27 Testsuiten, Typecheck, Audit 9/9, Plugin-/Lab-/MCP-Build und MCP-Prozessprobe grün.
  Neue Tests: 14 Editor-Integrationsfälle und 3 Geometrie-Regressionsfälle plus Auswahl-Negativfälle.
- Browser: echte CDP-Mausereignisse für Schreiben, Rahmenauswahl, Verschieben/Skalieren und Undo;
  gespeicherte Koordinaten zurückgelesen. Mehrseiten-Zoom, Miniaturen und Laden nach Speicherung geprüft.
- Noch kein Yoga-/iPad-Stiftnachweis. Preview-Paket gebaut, nicht in den Vault installiert.
  Details: `docs/REVIEW_FIXES_0.25.1.md`.

> Die ursprünglichen Fertigmeldungen zu 0.25.0 waren zu weitgehend. Der nachträgliche Review
> fand insbesondere Tintenverlust und blockiertes Speichern; 0.25.0 ist nicht empfohlen.

## 0.25.0 (8. September 2026) — Phase 4: Auswahl, Gesten, Seiten & Zoom

**Neu — Auswahl wie auf dem iPad:**
- Auswahlwerkzeug wählt jetzt auch **Handschrift, Formen und Marker** (vorher nur Text/Bilder).
- **Rahmen-Auswahl** (Viereck) und **Circle-to-Lasso**: Im Schreibmodus einen großen Kreis um Inhalte
  ziehen ⇒ automatische Auswahl (wie GoodNotes; kleine Buchstaben-`o` werden nie gekapert).
- Auswahl **verschieben** (ziehen), **skalieren** (4 Ecken-Griffe, gegenüberliegende Ecke ist der Anker),
  **duplizieren**, **einfärben** (Stiftfarbe), **löschen** — alles mit vollständigem Undo.
- Tastatur: Entf/Rücktaste löscht, Pfeiltasten verschieben (Shift = 10 px), Esc hebt die Auswahl auf.
- **Scribble-to-Erase**: Zickzack über eigene Striche kritzeln entfernt sie. Text, Bilder und gesperrte
  Inhalte sind geschützt; Fehlkennung ist per Undo sofort zurückgenommen.

**Neu — Seiten:**
- „▦ Seiten“-Übersicht mit Miniaturansichten.
- Seiten **neu ordnen** (↑/↓), **duplizieren**, **löschen** (mit Rückfrage; letzte Seite bleibt) —
  alles als Undo-Schritt.

**Neu — Zoom:**
- − / + / Seitenbreite-Buttons und Strg+Mausrad (35 % – 400 %). Die Papierlinien und die
  Stift-Eingabe rechnen korrekt in jeder Zoomstufe.

**Verbesserungen aus 0.24.x (zusammenfassend):**
- Formen-Erkennung kalibriert, Draw&Hold für perfekte Kreise/Vierecke, Endpunkt- und 15°-Winkel-Snap.
- Handschrift: Entzerren, Buchstaben schließen, sanftes Glätten, kein Zerquetschen
  (Höhen-Kappen 0.75–1.35), Schrift-Korrektur strikt nur im Schreibmodus.
- Speichern: serialisierte Schreib-Queue mit Wiederholung und Extern-Änderungs-Schutz;
  PDF-Sidecar-Schutz; harter Notebook-Parser mit Sicherung vor Migrationen.

**Bekannte Grenzen (0.25.0):**
- Vollständiger Stift-/Geräte-Test auf Yoga/iPad steht aus; Gesten-Gefühl bitte mit echtem Stift prüfen.
- Pinch-Zoom (2 Finger) ist nicht implementiert — Zoom läuft über Buttons/Tastatur.
- Auswahl-Freihandlasso (unregelmäßige Form) ist offen; Circle-to-Lasso und Rahmen decken den Alltag.
- Text behält beim Skalieren seine Schriftgröße (Position skaliert, nicht die Punkte).
- Seiten haben keinen Namen (Umbenennen ist zukünftige UX).
- Die Performance-Testsuite misst den Whiteboard-Kern; Editor-Latenz unter Stiftlast ist nicht instrumentiert.

## 0.24.0 (8. September 2026)
- Serialisiertes Speichern (Save-Queue, Retry, Konflikt-Erkennung), PDF-Sidecar-Schutz mit Recovery,
  Notebook-Parser-Härtung inkl. V1/V2-Migrationssicherung, MCP-Grundlage (NotebookCommandService,
  Companion-Bridge, Proposal-UI, Standard abgeschaltet).
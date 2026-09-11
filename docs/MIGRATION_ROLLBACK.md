# Migration, Update & Rollback — Smooth Handwriting

## Datenmodell (wo deine Notizen wirklich liegen)

- In deiner Notiz steht nur ein Verweis:
  ````markdown
  ```handschrift
  Handwriting/Beispiel.handwriting.json
  ```
  ````
  Die **eigentliche, bearbeitbare Notiz** ist diese `.handwriting.json` (Dokumentversion 3,
  Seiten, Elemente, Profil). Beim Sichern/Umziehen immer beides erhalten — Markdown UND JSON.
- Bilder stecken als Data-URLs **in** der JSON. HTML-Notizen exportieren sie nicht verlustfrei.
- Native PDF-Markierungen liegen separat als `<name>-<hash>.smooth-pdf.json` unter
  `<Ordner>/PDF/` (Sidecar-Version 1) — die Original-PDF bleibt unverändert.

## Update des Plugins

0. **Ideales Fenster: Obsidian beendet.** Dann nur Dateien tauschen, kein Reload nötig.
1. Vor jedem Update: komplette Kopie von
   `.obsidian/plugins/smooth-handwriting/` **inklusive `data.json`** in ein neues
   Verzeichnis (z. B. `plugin-backups/smooth-handwriting-<version>-preinstall-<datum>/`).
2. Neues Paket kopieren (immer `main.js` + `manifest.json` + `styles.css`,
   nicht nur `main.js`), Lizenzdateien und `assets/` beibehalten.
3. Obsidian starten bzw. bei laufendem Obsidian das Plugin neu laden
   (`Einstellungen → Community-Plugins → aus- und einschalten`). Ein Reload verwirft
   **nicht gespeicherte Entwürfe** — vorher fertig schreiben.

Kein Daten-Downgrade-Risiko: Der Parser liest ältere Formate (V1/V2 werden beim ersten
Speichern nach V3 migriert — **vorher** wird automatisch eine Kopie
`<name>.pre-migration-<zeitstempel>.bak` angelegt).

## Rollback auf eine frühere Version

1. Obsidian schließen.
2. Aktuellen Ordner des Plugins sichern (wie oben).
3. Ordner aus dem Backup zurückkopieren.
4. Obsidian starten.

Wichtig: **Rollback des Codes hebt eine bereits gespeicherte Datenänderung nicht auf.**
Wurde eine Notiz von einer neueren Version geschrieben:
- Ist das Format noch V3, öffnen ältere 0.2x-Versionen sie normal; unbekannte Felder
  werden beim Lesen erhalten, ggf. beim nächsten Speichern nicht neu geschrieben.
- Lese-Schutz: Eine **neuere, unbekannte Dokumentversion** wird **nicht** als leere
  Notiz geöffnet — die Anzeige bleibt schreibgeschützt mit klarer Meldung. In dem Fall
  die neue Plugin-Version wiederherstellen und ggf. gezielt exportieren (PDF/PNG), bevor
  etwas manuell angefasst wird.

## Beschädigte Daten & Wiederherstellung

- **Kaputtes Notebook-JSON:** Der Editor zeigt eine Fehlermeldung statt einer leeren
  Seite und überschreibt die Datei nicht automatisch. Original sichern, dann mit der
  neuesten Version öffnen (Parser ist strikt, toleriert aber unbekannte Zusatzfelder).
- **PDF-Sidecar beschädigt:** PDF bleibt unverändert; die Markierungsansicht geht in
  einen schreibgeschützten Zustand mit „Original sichern & neu beginnen“-Banner.
  Der korrupte Sidecar wird als `.corrupt-<zeitstempel>.bak` gesichert.
- **Migrations-Sicherung:** `.pre-migration-<zeitstempel>.bak` neben der JSON.
- **Externe Änderungen** (Sync, anderes Gerät) am offenen Notebook: Der Editor
  überschreibt sie nicht mehr unbemerkt, sondern stoppt den Schreibvorgang mit Hinweis —
  prüfen, dann bewusst entscheiden (Notiz schließen/neu öffnen lädt die externe Version).
  **Automatisches Zusammenführen gibt es nicht** — nie zwei Geräte gleichzeitig an
  derselben Datei arbeiten lassen.

## Sichern

PDF-Export ist **kein** editierbares Backup — nur die `.handwriting.json` (plus die
verweisende Markdown-Datei) enthält die weiter bearbeitbaren Striche. Für echte Backups
den gesamten `Handwriting/`-Ordner (JSONs, PDF-Ordner, Sidecars) kopieren.
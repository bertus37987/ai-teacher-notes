# Installation und native Prüfung 0.25.1

10. September 2026. Nutzerauftrag: neu installieren, alles testen, OneNote-Import/Export ergänzen.

## Verifiziert

- Vollständiges Backup vor Installation: `plugin-backups/smooth-handwriting-preinstall-0251-20260910-104653/` inklusive `data.json`.
- Installiert unter `<vault>/.obsidian/plugins/smooth-handwriting/`.
- `main.js`, `manifest.json`, `styles.css` per SHA256 mit Paket identisch; installierte Version 0.25.1.
- `data.json` vor/nach Kopie und erneut nach nativem Start bitgleich mit Backup.
- `npm run typecheck`, `npm test` (27 Suiten), `handwriting:audit` (9/9), `plugin:package`, `lab:build`, `mcp:probe`: Exit 0.
- Whiteboard-Performance: occupancy/free-regions 852 ms (Budget 1600), changed() 1748 Elemente 797 ms.

## Native Obsidian-Prüfung

Obsidian lief zunächst nicht; CLI meldete fehlende Anwendung. Flatpak `md.obsidian.Obsidian` gestartet, kein Reload offener Drafts. CLI bestätigt richtigen Vault `<vault>`, Plugin aktiv mit Version 0.25.1.

Isolierte neue Dateien:
- `Handwriting/Hermes-QA-0251-1789030230436.md`
- `Handwriting/Hermes-QA-0251-1789030230436.handwriting.json`

Produktionseditor geladen, keine `.hp-error`-Anzeige und keine erfassten Konsolenfehler. Auf ausschließlich diesem Testheft native Editor-Methoden ausgeführt:
- Strich um +10/+20 verschoben, Datei zurückgelesen: x=110 statt 100.
- Undo, erneut Datei zurückgelesen: x=100 wiederhergestellt.
- Export-Canvas 1200×1697 erzeugt, gültiger PNG-Data-URL-Präfix.
- Dirty-Status nach Speichern false, `obsidian dev:errors`: keine Fehler.

Dies ist ein nativer Host-/Dateispeicher-Smoke-Test, kein physischer Stifttest und kein vollständiger Nachweis sämtlicher Bedienkombinationen. Vorherige Browser-Pointertests siehe REVIEW_FIXES_0.25.1.md. Yoga-/iPad-Prüfung weiterhin offen.

## Laufende Erweiterung

Nutzer wählte `.one`/`.onepkg`-Originaldateien ausdrücklich statt PDF-Umweg. Originalformat-Unterstützung wird separat untersucht; bisher keine native OneNote-Kompatibilität implementiert/behauptet. Ein vollständig bearbeitbarer eigener Backup-Export/-Import wird separat umgesetzt. Eine kleine nichtprivate echte OneNote-Beispieldatei wurde angefragt, liegt noch nicht vor.

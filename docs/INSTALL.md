# Smooth Handwriting — so installieren es Freunde

Stand: 13. September 2026 · Version **0.25.33** · Repo: <https://github.com/bertus37987/ai-teacher-notes>

Die Erweiterung ist als Beta veröffentlicht: Das Repo ist öffentlich und das neueste Release hängt
`main.js`, `manifest.json` und `styles.css` an. Für Fremde gibt es deshalb drei Wege.

## Weg A — iPad/iPhone oder Desktop, bequem: BRAT

BRAT (*Beta Reviewers Auto-update Tool*) installiert Erweiterungen direkt aus einem GitHub-Repo und
hält sie aktuell. Es funktioniert auch auf iPad/iPhone — die drei Dateien landen automatisch im
richtigen Ordner, was auf iOS sonst kaum machbar ist.

1. Obsidian installieren (App Store / Play Store / obsidian.md) und einen Vault anlegen oder öffnen.
2. **Einstellungen → Community-Erweiterungen** (engl. *Community plugins*) → eingeschränkten Modus
   ausschalten („Eingeschränkten Modus deaktivieren" / *Turn on community plugins*). Das ist der
   Schritt, den fast alle überspringen — ohne ihn lässt sich gar keine Erweiterung installieren.
3. **Durchsuchen** (*Browse*) → nach **BRAT** suchen → **Installieren** → **Aktivieren**.
4. BRAT öffnen → **Add Beta plugin** → Repository eintragen, genau so:
   `bertus37987/ai-teacher-notes`
5. **Add Plugin**. BRAT lädt die Dateien und aktiviert *Smooth Handwriting* automatisch
   (Häkchen „Enable after installing the plugin" ist voreingestellt).
6. Notiz öffnen → Befehlspalette (Desktop `Strg+P` / iPad über das Tastatur- oder Seitenleisten-
   Symbol) → **„Handschriftblock einfügen"**. Damit startet die Zeichenfläche. Mit Apple Pencil
   oder Stylus wird direkt gezeichnet, Maus/Finger gehen auch.
7. Später: BRAT → **Check for updates**. Ohne BRAT müsste jeder Schritt von Hand wiederholt werden.

Direkt links, falls BRAT nicht gewünscht ist: <https://github.com/bertus37987/ai-teacher-notes/releases/latest>

## Weg B — Desktop, von Hand (falls BRAT nicht gewünscht)

1. Auf der Release-Seite diese drei Dateien herunterladen: **main.js**, **manifest.json**, **styles.css**
2. In den Vault legen, in einen Ordner mit genau diesem Namen:

   ```
   <Vault>/.obsidian/plugins/smooth-handwriting/
   ```

   Auf macOS/Linux sind versteckte Ordner mit `.` am Anfang erst sichtbar, wenn man sie einblendet
   (`Cmd+Shift+.` im Finder). Der Ordnername muss `smooth-handwriting` heißen, sonst findet Obsidian
   die Erweiterung nicht.
3. Obsidian → Einstellungen → Community-Erweiterungen → **Smooth Handwriting** aktivieren.
4. Falls sie in der Liste fehlt: Obsidian neu laden (`Strg+R` bzw. Befehl *Reload app without saving*).

Feste Direktlinks (immer die neueste Version):

- <https://github.com/bertus37987/ai-teacher-notes/releases/latest/download/manifest.json>
- <https://github.com/bertus37987/ai-teacher-notes/releases/latest/download/main.js>
- <https://github.com/bertus37987/ai-teacher-notes/releases/latest/download/styles.css>

## Was fehlt, wenn man so installiert (ehrlich gesagt)

- **Handschrift→Text-Erkennung fehlt.** BRAT und Weg B laden nur die drei Dateien. Der Zeichen-Editor
  ist vollständig, aber beim Erkennen meldet die Erweiterung „HTR-Worker fehlt. Bitte das vollständige
  Plugin-Paket installieren." Grund: Modell (`model.onnx`, 10 MB), ONNX-Runtime (13 MB) und die
  Caveat-Schrift liegen in `assets/` (~24 MB) und hängen **nicht** am Release. Das komplette ZIP
  entsteht lokal mit `npm run plugin:package`, ist per `.gitignore` vom Repo ausgeschlossen und
  damit für Fremde unsichtbar.
- **iPad ist ungetestet.** `isDesktopOnly: false` ist gesetzt, probiert hat es aber noch niemand.
- **Nicht im Community-Store.** Deshalb findet man die Erweiterung in Obsidian nicht über „Durchsuchen".
  Dafür wäre ein Pull-Request an <https://github.com/obsidianmd/obsidian-releases> nötig (ID
  `smooth-handwriting` ist frei, Prüfung dauert Tage bis Wochen). Sobald der Eintrag durch ist, genügt
  „Suchen → Installieren → Aktivieren" und BRAT wird überflüssig.

## Prüfsummen 0.25.33 (Release = lokaler Build = hier installiert)

```
2fa10d3a974a59981f5cb34a70973a67e818cdaf8f94289baef7badd3c82b5fd  main.js
bba503fbbd1895c1eae3b2cd31ccabd0723e348cebf9778c6f54986590a26021  manifest.json
fc13db68dfc13a1dd3e3a40b14927e0ea9440ece3c00f3715fb224147f84a596  styles.css
```

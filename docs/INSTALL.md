# Smooth Handwriting — so installieren es Freunde

Stand: 13. September 2026 · Version **0.25.34** · Repo: <https://github.com/bertus37987/ai-teacher-notes>

Die Erweiterung ist als Beta veröffentlicht: Das Repo ist öffentlich und das neueste Release hängt
`main.js`, `manifest.json`, `styles.css` sowie ein vollständiges ZIP an. Für Fremde gibt es deshalb
drei Wege.

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

## Weg C — vollständiges Paket (für die Handschrift-Erkennung)

Nur die drei Dateien aus Weg A/B enthalten die lokale Handschrift-Erkennung **nicht** (Modell und
ONNX-Laufzeit, ~24 MB). Wer „Handschrift → Text" nutzen will, lädt
`smooth-handwriting-<version>-preview.zip` vom neuesten Release, entpackt es und legt den Ordner
`smooth-handwriting/` nach `<Vault>/.obsidian/plugins/`. Darin ist alles: Programm, Schrift,
Modell und Laufzeit.

Auf dem iPad ist das ZIP kaum zu entpacken — dort bleibt Weg A der einzige praktikable Weg, und die
Erkennung damit vorerst außen vor.

## Was inzwischen nicht mehr fehlt

- **Die Handschrift-Schrift steckt seit 0.25.34 im Programm** (`main.js`), nicht mehr in
  `assets/`. Vorher meldete jede BRAT- oder Store-Installation beim Start
  „Handschrift-Font fehlt. Bitte das vollständige Plugin-ZIP installieren." — das ist behoben.
- **iPad ist weiterhin ungetestet.** `isDesktopOnly: false` ist gesetzt, probiert hat es aber noch
  niemand.
- **Nicht im Community-Store.** Deshalb findet man die Erweiterung in Obsidian nicht über
  „Durchsuchen". Dafür wäre ein Pull-Request an <https://github.com/obsidianmd/obsidian-releases>
  nötig (ID `smooth-handwriting` ist frei, Prüfung dauert Tage bis Wochen). Sobald der Eintrag
  durch ist, genügt „Suchen → Installieren → Aktivieren" und BRAT wird überflüssig.

## Prüfsummen 0.25.34 (Release = lokaler Build = hier installiert)

```
82958cbbcc636e45eb9ffea3d73685ab6389c279644bab3125057c3fb884ba8a  main.js
07fe95563598f75f790766089fc4eace50cb8d3d094e69e7aaa026da51055b75  manifest.json
fc13db68dfc13a1dd3e3a40b14927e0ea9440ece3c00f3715fb224147f84a596  styles.css
```

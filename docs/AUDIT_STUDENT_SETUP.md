# Audit: Obsidian + Stift als OneNote-Ersatz für den Schulalltag

Stand: 11. September 2026 · Nur Recherche, **keine Systemänderung vorgenommen** (keine `flatpak override`, kein sudo, keine Installation).

**Legende**
- ✅ **belegt** — eine zitierte Quelle (URL) stützt die Aussage.
- ⚠️ **teilweise belegt** — Quelle stützt einen Teil, der Rest ist plausibel aber nicht nachgewiesen.
- ❌ **unbelegt** — keine Quelle gefunden; als Annahme markiert.
- 🖥️ **Ist-Zustand dieser Maschine** — durch Lesen der lokalen Systemdateien ermittelt (keine Änderung).

## 0. Geprüfter Ist-Zustand (gelesen, nicht verändert)

| Punkt | Wert | Belegquelle |
| --- | --- | --- |
| System | Fedora Linux 44 (Workstation Edition), GNOME Shell 50.4, Kernel 7.1.13-200.fc44 | `/etc/os-release`, `gnome-shell --version`, `uname -r` 🖥️ |
| Sitzung | `XDG_SESSION_TYPE=wayland`, `WAYLAND_DISPLAY=wayland-0` | 🖥️ |
| Obsidian | Flatpak `md.obsidian.Obsidian` **1.13.7**, Runtime `org.freedesktop.Platform 25.08`, Commit vom 18.08.2026 | `flatpak info` 🖥️ |
| Lokale Overrides | **nur** `[Environment] ELECTRON_OZONE_PLATFORM_HINT=wayland` | `flatpak override --user --show` 🖥️ |
| `user-flags.conf` | existiert **nicht** | `ls ~/.var/app/md.obsidian.Obsidian/config/obsidian/` 🖥️ |
| Sandbox-Sockets | `sockets=fallback-x11;pulseaudio;ssh-auth;wayland;` (kein `x11`) | `flatpak info --show-permissions` 🖥️ |
| XWayland | `/tmp/.X11-unix/X0` und `X1` vorhanden | 🖥️ |
| Stiftgerät | `usb-Wacom Co. Ltd. Pen and multitouch sensor` (Pen + Finger getrennt) | `/dev/input/by-id/` 🖥️ |
| Datenträger | btrfs, **keine** verschlüsselte Partition (`crypto_LUKS` nicht vorhanden) | `lsblk -o NAME,FSTYPE` 🖥️ |

---

# Teil 1 — Warum Obsidian den Yoga-Wacom-Stift verliert, und was belegt hilft

## 1.1 Belegte Ursachenkette

**Schritt 1 — Obsidian läuft auf dieser Maschine als *nativer Wayland-Client*, nicht über XWayland.**
Obsidian 1.13.7 (Flatpak) bündelt Electron 43.3.0 ✅
→ <https://forum.obsidian.md/t/linux-tray-icon-is-a-dead-placeholder-obsidian-1-13-7-bundles-electron-43-3-0-fixed-upstream-in-43-4-1/117750>
(dort auch als `x.com/obsdmd`-Aussage belegt: „The installer has been updated to use Electron 43.3.0.")

Seit **Electron 38** ist der Standardwert von `--ozone-platform` **`auto`**, d. h. Electron-Apps laufen in einer Wayland-Sitzung automatisch nativ auf Wayland ✅
→ <https://www.electronjs.org/blog/electron-38-0> (Abschnitt „The default value of the `--ozone-platform` flag changed to `auto`")
→ <https://electronjs.org/blog/tech-talk-wayland>
Zusätzlich setzt das Flathub-Wrapper-Skript genau das: `obsidian.sh` hängt bei vorhandenem Wayland-Socket `--ozone-platform-hint=auto` an ✅
→ <https://raw.githubusercontent.com/flathub/md.obsidian.Obsidian/master/obsidian.sh>

**Schritt 2 — Chromiums Ozone/Wayland-Backend liefert Tablet-/Stift-Ereignisse (Wayland-Protokoll `zwp_tablet_manager_v2`, „tablet-v2") historisch überhaupt nicht.**
Chromium-Tracker, Erstreport: *Fedora 38, Wacom, Mutter (Wayland)* — Stift wird ignoriert: „It works fine when chromium is running without ozone platform set to wayland and instead running through Xwayland." ✅
→ <https://issues.chromium.org/issues/40282832> (Status im Tracker: **Fixed**; der exakte Milestone/Electron, in dem der Fix ankommt, ist auf der Seite nicht ablesbar → ❌ **unbelegt**)
Duplikat mit klarer Ursachenformulierung: „chrome's ozone-wayland backend does not handle pen tablet input" ✅
→ <https://issues.chromium.org/issues/326695622>
Verallgemeinert auf Electron: „Stylus input not working at all on Wayland" (Electron #43821, als Duplikat des Chromium-Bugs geschlossen) ✅
→ <https://github.com/electron/electron/issues/43821>
Compositor-Seite: Mutter-Issue „Chromium's ozone wayland missing pen tablet input in Mutter (No cursor + no input)", geschlossen mit Label *3. Not GNOME* (Verweis an die Ozone/Wayland-Entwickler) ✅
→ <https://gitlab.gnome.org/GNOME/mutter/-/issues/3310>

**Schritt 3 — Chromium hat 2025 Tablet-Unterstützung nachgezogen; ein Folgefehler bleibt.**
Aussage eines Fremdberichts: „Chromium's tablet implementation and a follow-up fix were merged in 2025" ⚠️ (Sekundärquelle, kein Primär-Commit verlinkt)
→ <https://discuss.cachyos.org/t/bug-mouse-clicks-ignored-in-chromium-electron-native-wayland-after-using-a-tablet-stylus/33714>
Derselbe Bericht zeigt den verbleibenden Fehler unter **nativen Wayland**: Nach Stiftnutzung werden Mausklicks ignoriert (auch in VS Code / Electron 42.6.0); unter `--ozone-platform=x11` **nicht reproduzierbar** ✅

**Schritt 4 — Das Fehlerbild deckt sich exakt mit dem gemeldeten Symptom („Stift bewegt nur den Cursor, klickt/zeichnet nicht").**
Obsidian-Bugreport (Linux, Wayland, Wacom-HID in einem IdeaPad/Convertible): „After using the stylus pen, obsidian does not register mouse and touchpad clicks anymore." + Maus/Touchpad hängen ✅
→ <https://forum.obsidian.md/t/using-a-stylus-pen-with-wayland-means-mouse-events-get-ignored/110296>
Arch-Forum, exakt derselbe Befund in Obsidian und VSCodium, **libinput liefert korrekt**: „`sudo libinput debug-events` gives expected output, indicating that my pen is moving around and pressing down, but click/draw in obsidian and vscodium just won't work" ✅
→ <https://bbs.archlinux.org/viewtopic.php?id=299709>
Excalidraw-in-Obsidian, Fedora + Flatpak: Stift ohne Funktion, Maus funktioniert; „Since the pen mode works in x11, running the app in xWayland seems to make the stylus work." ✅
→ <https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1914>
**Direkteste Parallele zur Hardware:** Lenovo Yoga (7 14AHP9) mit integriertem Wacom + Lenovo Digital Pen 2, GNOME/Wayland — Stift funktioniert in GIMP/LibreOffice/GNOME, **nicht** in Chrome, Obsidian, Steam; Workaround: im Flatpak Wayland deaktivieren ✅
→ <https://stackoverflow.com/questions/79200169/stylus-doesnt-work-in-specific-apps-but-works-under-some-x11-and-wayland-apps>

**Schritt 5 — Der Ist-Zustand dieser Maschine ist damit erklärt.** Native Wayland-Sitzung + Elektron auf Ozone/Wayland + noch nicht vollständige Tablet-Unterstützung in der gebündelten Electron-Version ⇒ keine Stift-Ereignisse im Obsidian-Fenster, während der Stift systemweit (Kernel/libinput) funktioniert. ❌ **unbelegt** bleibt, ob Electron 43.3.0 den konkreten Yoga-Pen unter nativem Wayland inzwischen korrekt bedient — das ist nur durch einen Messversuch am Gerät klärbar (Abschnitt 1.4).

## 1.2 Was **nicht** die Ursache ist (ausgeschlossen)

| Hypothese | Bewertung | Beleg |
| --- | --- | --- |
| Flatpak-Sandbox blockiert Eingabegeräte | **Nein.** Auf Wayland kommen Zeigereingaben über den Wayland-Socket des Compositors, nicht über rohe evdev-Geräte. Der Socket `wayland` (und `fallback-x11`) ist gesetzt. | `flatpak info --show-permissions` 🖥️ + <https://raw.githubusercontent.com/flathub/md.obsidian.Obsidian/master/README.md> (Sandbox-/Socket-Beschreibung) |
| Fehlender X-Socket | **Nein**, `/tmp/.X11-unix/X0` und `X1` existieren, `fallback-x11` ist gewährt. | 🖥️ |
| Fedora-44-spezifischer libinput-/Wayland-Regressionsfehler | ❌ **unbelegt.** Kein Bug-/Release-Note-Eintrag gefunden, der Fedora 44 (GNOME 50 / Kernel 7.x) mit diesem Stiftverhalten verknüpft. Die gefundenen Tablet-Berichte beziehen sich auf Fedora 40/41/42. | <https://discussion.fedoraproject.org/t/weird-pen-tablet-behaviour-under-gnome-wayland/123821> (Fedora-Symptome, aber anderer Natur und ältere Releases) |
| Treiber fehlt | **Nein.** Gerät erscheint als Kernel-Eingabegerät, libinput liefert Ereignisse. | <https://bbs.archlinux.org/viewtopic.php?id=299709> |
| Falscher `--ozone-platform-hint`-Wert | **Nein.** `wayland` ist genau das, was den Fehler auslöst; ohne Wayland läuft der Stift. | <https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1914> |

**Wichtiger Zusatzbefund:** Die vorhandene Umgebungsvariable `ELECTRON_OZONE_PLATFORM_HINT=wayland` ist auf Electron 43 **wirkungslos**. Die Variable ist ab Electron 38 als veraltet markiert und ab Electron 39 entfernt; ab dann zählt nur noch das Kommandozeilen-Flag `--ozone-platform=x11|wayland` ✅
→ <https://github.com/electron/electron/commit/b9ceaabb857e0ec55c81b464facea77ebdddad44> („docs: deprecate `ELECTRON_OZONE_PLATFORM_HINT` env var")
→ <https://github.com/electron/electron/issues/48001>
→ <https://github.com/niri-wm/niri/wiki/Application-Issues/Development:-Redraw-Loop> („For Electron ≥ 39, you can use the command-line flag … For Electron < 39, you can set an environment variable `ELECTRON_OZONE_PLATFORM_HINT`")
→ <https://voxelmanip.se/notes/switch-back-electron-to-x11-xwayland/> („this has been removed in Electron 38 and does nothing now")
**Konsequenz: Ein `flatpak override --user --env=ELECTRON_OZONE_PLATFORM_HINT=x11` ist als Fix NICHT empfehlenswert** ❌ unbelegt, dass es unter Electron 43 überhaupt wirkt — im Gegenteil, zwei unabhängige Quellen sagen, dass die Variable nichts mehr tut. (Achtung: Einzelne Ratgeber im Netz empfehlen noch genau das und sind damit veraltet. ✅ belegt durch die obigen Quellen.)

## 1.3 Belegte Lösung: App zurück auf XWayland/X11 zwingen

Es gibt zwei Stellschrauben. Empfohlen wird **Weg A**, weil er das vom Flatpak-Maintainer dokumentierte Verfahren ist *und* weil der Wrapper dann selbst konsistent `--ozone-platform=x11` setzt (statt `--ozone-platform-hint=auto`):

**Weg A — Wayland-Socket entziehen (empfohlen, dokumentiert)**

```bash
flatpak override --user --nosocket=wayland --socket=x11 md.obsidian.Obsidian
```

Belege für genau dieses Vorgehen:
- Flathub-README, Abschnitt „Wayland support": „Wayland support can be disabled by setting the environment variable `--nosocket=wayland` and `--socket=x11` … `$ flatpak override --user --nosocket=wayland --socket=x11 md.obsidian.Obsidian`" ✅ → <https://raw.githubusercontent.com/flathub/md.obsidian.Obsidian/master/README.md>
- `flatpak override` Optionen `--socket=` / `--nosocket=` mit zulässigen Werten `x11, wayland, fallback-x11, …` ✅ → <https://man.archlinux.org/man/flatpak-override.1.en>
- Dasselbe Vorgehen über die GUI (Flatseal, Wayland-Socket abschalten) als funktionierender Workaround im Yoga/Wacom-Fall ✅ → <https://stackoverflow.com/questions/79200169/stylus-doesnt-work-in-specific-apps-but-works-under-some-x11-and-wayland-apps>
- Zusätzlicher Nebeneffekt aus dem Wrapper-Skript: Ohne sichtbaren Wayland-Socket überspringt `obsidian.sh` seinen Wayland-Block (`--ozone-platform-hint=auto`, `--wayland-text-input-version=3`) und setzt stattdessen `--ozone-platform=x11` ✅ → <https://raw.githubusercontent.com/flathub/md.obsidian.Obsidian/master/obsidian.sh>

Danach Obsidian beenden und neu starten. Test ohne Neustart der Sitzung.

**Weg B — nur Testlauf, keine dauerhafte Änderung (dokumentiertes Einzelstart-Verfahren)**

```bash
flatpak run --nosocket=wayland --socket=x11 md.obsidian.Obsidian
```

Quelle: Flathub-README („Wayland support can also be temporarily disabled for a single run") ✅ → siehe oben.
Damit lässt sich **vor** jeder dauerhaften Umstellung beweisen, dass der Stift in Obsidian zeichnet.

**Weg C — `--ozone-platform=x11` als Nutzer-Flag-Datei** ⚠️ **teilweise belegt**
Datei `~/.var/app/md.obsidian.Obsidian/config/obsidian/user-flags.conf` mit der Zeile `--ozone-platform=x11`. Das Dateiverfahren ist dokumentiert ✅ (Flathub-README „Additional user flags may be persistently set by putting them in `user-flags.conf`"), und dass nur das Flag (nicht die Env-Variable) den Plattformwechsel bewirkt, ist belegt ✅ (Electron-38-Blog / niri-Wiki). **Nicht belegt** ist, wie sich `--ozone-platform=x11` gegen das vom Wrapper danach angehängte `--ozone-platform-hint=auto` verhält (Chromium-Doku: `--ozone-platform` wählt die Plattform, der Hint schlägt nur vor → ⚠️ plausibel, in dieser Electron-Version nicht verifiziert). Wenn schon eine Datei, dann zusätzlich `--ozone-platform` **und** die Socket-Umstellung, sonst widersprüchliche Flags.

**Belegt falsch / wirkungslos:**
- `flatpak override --user --env=ELECTRON_OZONE_PLATFORM_HINT=x11` ❌ (Variable ab Electron 39 ohne Funktion)
- `--enable-features=UseOzonePlatform` als „neues" Flag ⚠️ war der historische Weg mit alten Electron-Versionen (< 38) → <https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1914>; in Electron ≥ 38 ist `UseOzonePlatform` nicht mehr nötig, da Wayland Standard ist ✅ → <https://electronjs.org/blog/tech-talk-wayland>

## 1.4 Rückweg (Rollback)

**Genauer inverser Befehl** — stellt exakt den heutigen Zustand wieder her (Wayland an, kein explizites x11; `fallback-x11` ist in den App-Metadaten ohnehin vorhanden):

```bash
flatpak override --user --socket=wayland --socket=fallback-x11 --nosocket=x11 md.obsidian.Obsidian
```

**Sledgehammer** — löscht *alle* Overrides dieser App, inklusive des vorhandenen `ELECTRON_OZONE_PLATFORM_HINT=wayland`:

```bash
flatpak override --user --reset md.obsidian.Obsidian
```

`--reset`: „Remove overrides. If an APP is given, remove the overrides for that application" ✅ → <https://man.archlinux.org/man/flatpak-override.1.en>
Kontrolle vorher/nachher mit `flatpak override --user --show md.obsidian.Obsidian` (heute: nur die eine Env-Zeile) ✅.

## 1.5 Nebenwirkungen / Preis der X11-Umstellung

Alles, was der Flathub-README explizit als Vorteil des Wayland-Backends nennt, fällt weg („Wayland support … brings about several improvements over X11/XWayland: fractional scaling, multi-touch gestures such as pinch-zoom, retains window sizing and in-app scaling across restarts") ✅ → Flathub-README.
Konkret belegte Einbußen:

| Nebenwirkung | Beleg |
| --- | --- |
| Unschärfe/„blurry text" bei Skalierung ≠ 100 % unter XWayland; Fix dort explizit der Wayland-Socket | <https://cstromblad.com/posts/how-to-make-obsidian-play-nice-with-wayland/> |
| Sehr niedrige Auflösung bei Obsidian 1.4.x auf Wayland, „Disabling Wayland and using X11 specifically for Obsidian solves the problem" (zeigt: beide Richtungen existieren, je nach Version) | <https://forum.obsidian.md/t/extremely-low-resolution-in-obsidian-1-4-x-on-linux-with-wayland/66441> |
| Kein Pinch-Zoom / keine Multi-Touch-Gesten | Flathub-README (s. o.) |
| Drag-and-drop teilweise defekt; bei Skalierung ≠ 100 % sitzt der Stiftcursor in Excalidraw versetzt (zeichnet aber korrekt) | <https://stackoverflow.com/questions/79200169/stylus-doesnt-work-in-specific-apps-but-works-under-some-x11-and-wayland-apps> |
| Der Radierer am Stift funktioniert auch unter X11 nicht („this doesn't seem to make the eraser work") | <https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1914> |
| Skalierungs-/XWayland-Probleme auf Tiling-Compositors (hier GNOME, daher geringer) | <https://www.reddit.com/r/ObsidianMD/comments/1ma7l6t/obsidian_on_wayland_does_not_support_graphic/> |

⚠️ Ob auf diesem Gerät eine Nvidia-Sonderbehandlung greift (der Wrapper prüft `/dev/nvidia0`), ist ❌ unbelegt — die GPU wurde nicht ausgelesen.

## 1.6 Risiko in einem Satz

**Gering:** Es wird nur eine App-Sandbox-Berechtigung umgestellt (kein Root, kein Systemeingriff), der Rückweg ist ein Einzeiler, und der Hauptverlust ist Komfort (Schärfe bei Skalierung, Gesten) — **aber** die Maßnahme ist ein Umweg um einen Upstream-Bug, kann beim nächsten Obsidian/Electron-Update überflüssig werden und bringt den Stift-Radierer weiterhin nicht zum Laufen.

## 1.7 Alternative ohne Systemänderung

1. **Nur Messlauf** mit `flatpak run --nosocket=wayland --socket=x11 md.obsidian.Obsidian` (Abschnitt 1.3, Weg B) — ändert nichts persistent.
2. **Arbeitsteilung statt Fix:** Stiftarbeit in einer Linux-App mit funktionierendem Wayland-Stift (z. B. RNote oder Xournal++; RNote ist auf dieser Maschine bereits als Flatpak installiert 🖥️) und Obsidian nur für Text/Struktur. ⚠️ Nicht belegt: ob und wie automatisiert Notizen zwischen diesen Apps und dem Vault wandern.
3. **Zweiter Vault-Zugang im Browser:** Die Web-Variante von Obsidian (bzw. der Plugin-Web-Build `web-dist/`) läuft im Browser; ob dort der Stift im Yoga-Firefox/Chrome unter Wayland funktioniert, ist ❌ **unbelegt** (Chrome hat denselben Ozone-Wayland-Bug laut Chromium-Tracker 40282832 / mutter 3310).
4. **Auf den Upstream-Fix warten:** Chromium-Issue 40282832 steht auf *Fixed*; welcher Electron-Milestone das in Obsidian transportiert, ist ❌ unbelegt → das ist der eigentliche Langfristpfad, nicht die X11-Umstellung.

---

# Teil 2 — Was einem Schüler-Setup (Obsidian + Stift) zum OneNote-Ersatz fehlt

Bewertung je Lücke: **S** ≈ unter 1 Stunde, **M** ≈ ~1 Tag, **L** ≈ mehrere Tage / externer Aufwand.

## 2.1 Die harten Lücken

| # | Lücke | Warum OneNote das kann | Belegstatus | Aufwand |
| --- | --- | --- | --- | --- |
| 1 | **Handschrift ist nicht durchsuchbar** | OneNote wandelt Tinte/Scans per OCR in durchsuchbaren Text um | ✅ belegt: Obsidian-Forum — die Handschrift-Plugins „all leave your handwritten text unsearchable" <https://forum.obsidian.md/t/how-to-handwrite-on-obsidian-with-an-ipad/104417>; OneNote-OCR: <https://support.microsoft.com/en-US/OneNote/onenote-help-and-learning/search-notes-in-onenote> | **L** |
| 2 | **OCR nur als Fremd-Dienst/Metered SaaS** | OneNote: integriert, kostenlos | ✅ belegt: Garda-Plugin, „V1 uses a Garda SaaS OCR backend", Credit-Preise 1 $/20 Seiten <https://community.obsidian.md/plugins/garda-handwriting-text-ocr> | **M** (Anbindung) + laufende Kosten |
| 3 | **Konfliktauflösung beim Sync der Handschrift-Dateien** | OneNote merged serverseitig, Nutzer merkt nichts | 🖥️ Projektintern belegt, **nicht** öffentlich belegt: `docs/FEATURE_MATRIX.md` führt „Obsidian Sync/Konflikt-Merge ⛔ Nicht getestet, nicht beworben" — die Striche liegen in JSON-Sidecars, zwei Geräte, gleicher Abschnitt = Datenverlustrisiko ❌ (kein Webbeleg für den konkreten Fall) | **L** |
| 4 | **Sync Linux ↔ iPad** | OneNote: ein Microsoft-Konto, überall | ✅ belegt: Obsidian Sync ist der offizielle Weg (Windows/macOS/Linux/iOS/Android), iCloud nur Apple↔Apple, „iCloud Drive on Windows may lead to file duplication or corruption" <https://help.obsidian.md/sync-notes> | **M** + laufende Kosten |
| 5 | **Kosten** | OneNote: in vielen Schulen kostenlos | ✅ belegt: Sync 4 $/Monat (jährlich), Publish 8 $/Monat; 40 % Bildungsrabatt → ~2,40 $ <https://obsidian.md/pricing> und <https://obsidian.md/help/discounts> | – |
| 6 | **Teilen mit Mitschülern/Lehrern** | OneNote: Link/„Freigeben" in einem Klick, auch Bearbeitung | ✅ belegt: kein nativer Weg; Community-Antwort ist „Export pdf and share it with them" <https://www.reddit.com/r/ObsidianMD/comments/176haly/best_way_to_share_obsidian_notes_with_normies/>; Share-Note-Plugin (verschlüsselt) <https://forum.obsidian.md/t/notes-sharing/85371>; Publish als Bezahldienst | **S–M** |
| 7 | **Drucken** | OneNote: Drucken/Bearbeiten direkt aus der App | ✅ belegt: kein Druckbefehl; „if you want to print a note, you have to export it to pdf first" <https://forum.obsidian.md/t/print-plugin/73753>; Better Export PDF für Kopf-/Fußzeilen/Seitenzahlen <https://github.com/l1xnan/obsidian-better-export-pdf> | **S** |
| 8 | **Backup** | OneNote: Cloud-Versionierung | ✅ belegt: Obsidian-Hilfe stellt ausdrücklich klar „**Syncing is not a backup**" und empfiehlt Obsidian Git <https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Getting%20started/Back%20up%20your%20Obsidian%20files.md>; Git-Plugin: Auto-Commit/Push, **mobile aber „highly unstable"** <https://github.com/Vinzent03/obsidian-git> | **S** (Desktop), **M** (mobil) |
| 9 | **Verschlüsselung auf dem Gerät** | OneNote: Notebooks liegen im Microsoft-Konto | ✅ belegt: Obsidian verschlüsselt NUR den Remote-Vault, „Obsidian doesn't encrypt your local vault" <https://obsidian.md/help/sync/security>; 🖥️ diese Maschine hat **keine** verschlüsselte Partition (kein `crypto_LUKS`) ⇒ Geräteverlust = Klartext-Notizen | **M** (LUKS-Neuinstallation) / **S** (Vault-Ordner per Cryptomator o. Ä. ❌ unbelegt für Obsidian-Verträglichkeit) |
| 10 | **Plugin-Sicherheit = voller Systemzugriff** | OneNote-Add-ins sind eingeschränkt | ✅ belegt: „Obsidian cannot reliably restrict plugins to specific permissions… plugins can access files, connect to internet, install additional programs" <https://obsidian.md/help/plugin-security> | **S** (Regel: nur geprüfte Plugins, Restricted Mode) |
| 11 | **Unendliche Seite + Text-frei-platzieren** | OneNote-Kernfunktion („freeform canvas") | ✅ belegt: Obsidian Canvas existiert, ist aber „definitely not a OneNote alternative"; Tinte im Canvas nur per Plugin (Blackboard: „**works on desktop with a mouse**" — Stift/Pencil primär iPad) <https://news.ycombinator.com/item?id=39029267> und <https://community.obsidian.md/plugins/blackboard> | **L** |
| 12 | **Audio-Mitschrift zur Vorlesung** | OneNote: Audioaufnahme + Notiz-Sync | 🖥️ Projektintern: `docs/FEATURE_MATRIX.md` — „Audio/Mitschrift ⛔ Spätere, getrennte Entscheidung"; ❌ kein Webbeleg nötig, es ist eine Produktentscheidung | **L** |
| 13 | **iPad-Parität (Apple Pencil)** | OneNote: gleiche App, gleicher Funktionsumfang, Pencil-nativ | ✅ belegt: In Obsidian auf dem iPad hilft nur iPadOS „Scribble" für Text (kein Obsidian-Feature) und plugins; Scribble hat Bugs (unerwartete Zeilenumbrüche, fehlende Leerzeichen) <https://forum.obsidian.md/t/scribble-on-ipad-inserts-unexpected-line-breaks/44652>, <https://forum.obsidian.md/t/apple-pencil-scribble-missing-spaces/79964>; Apple-Pencil-Inking nur über Community-Plugins (Pencil, Blackboard, Ink) <https://community.obsidian.md/plugins/pencil>, <https://github.com/daledesilva/obsidian_ink> | **L** |
| 14 | **Eigene Plugin-Handschrift auf iPad ungeprüft** | – | 🖥️ Projektintern: `manifest.json` setzt `"isDesktopOnly": false`, aber `docs/FEATURE_MATRIX.md` sagt „Lenovo Yoga Stift / iPad Pencil 🧪 **Noch kein Hardware-Nachweis**". ❌ Kein Webbeleg, weil intern. | **M** (Test + UI-Anpassung) |
| 15 | **Echtzeit-Zusammenarbeit am selben Heft** | OneNote: gleichzeitiges Schreiben mehrerer | ✅ teilweise: Obsidian Sync nennt „Collaborate on shared vaults" <https://obsidian.md/pricing> — geteilte Vaults, nicht Freigabe einzelner Seiten; gleichzeitiges Schreiben ist damit ❌ **unbelegt** | **L** |
| 16 | **Lernfunktionen (Karteikarten, Wiederholung), Formel-Erkennung** | OneNote/Copilot-Begleiter | ❌ **unbelegt** für das Zielprodukt; im Repo gibt es dazu keine belegte Funktion | **L** |
| 17 | **Stunden-/Akkulaufzeit-Nachweis** | – | 🖥️ Projektintern offen: `docs/FEATURE_MATRIX.md` „60-Minuten-Offline-Stunde, 20-Seiten-Heft 🔜 Messpflicht" | **S** (Messung) |
| 18 | **Physische Sicherheit der Hardware** | – | ❌ **unbelegt** (keine Quelle recherchiert, die Yoga-Gen-5-Besonderheiten für den Schulbetrieb bewertet) | – |

## 2.2 Was **schon** da ist (damit die Liste nicht unfair wirkt)

- **Offline ist gelöst:** Obsidian speichert lokal, „you always have access to them, even offline" ✅ → <https://help.obsidian.md/sync-notes>
- **Datenhoheit/Formate:** einfache Markdown-Dateien, Import aus OneNote möglich ✅ → <https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Getting%20started/Import%20notes.md>
- **Sync-Sicherheit ist gut:** AES-256, Ende-zu-Ende, Audits durch Cure53/Trail of Bits ✅ → <https://obsidian.md/help/sync/security>, <https://obsidian.md/security>
- **Backup-Werkzeug ist benannt:** Obsidian Git ✅ (s. Lücke 8).

## 2.3 Empfohlene Reihenfolge für das Schüler-Setup

1. **Stift überhaupt zum Laufen bringen** (Teil 1) — ohne Stift ist alles andere Theorie.
2. **Sync Linux ↔ iPad entscheiden** (Lücke 4/5): Obsidian Sync mit Bildungsrabatt ist der einzige offiziell unterstützte Weg; iCloud scheidet aus, sobald Linux mitschreibt ✅.
3. **Drucken/Teilen als PDF exportieren** (Lücke 6/7) — kleinster Aufwand, größter Alltagsnutzen.
4. **Backup einrichten** (Lücke 8) — Obsidian Git, Desktop; iPad-Abdeckung getrennt betrachten.
5. **Handschrift durchsuchbar machen** (Lücke 1/2) — teuerste Lücke, bewusst spät.
6. **Konfliktverhalten der JSON-Sidecars testen** (Lücke 3) — vor jedem echten Zwei-Geräte-Einsatz, sonst Datenverlust.

---

# Quellenverzeichnis (alle recherchierten URLs)

**Teil 1**
- <https://www.electronjs.org/blog/electron-38-0> — `--ozone-platform`-Default `auto`
- <https://electronjs.org/blog/tech-talk-wayland> — Electron Wayland-nativ
- <https://github.com/electron/electron/issues/43821> — Stylus ohne Funktion unter nativem Wayland
- <https://issues.chromium.org/issues/40282832> — Ozone/Wayland: Wacom-Stift wird ignoriert (Fixed)
- <https://issues.chromium.org/issues/326695622> — Duplikat, Ursachenformulierung
- <https://gitlab.gnome.org/GNOME/mutter/-/issues/3310> — Mutter, „Not GNOME"
- <https://discuss.cachyos.org/t/bug-mouse-clicks-ignored-in-chromium-electron-native-wayland-after-using-a-tablet-stylus/33714> — Folgefehler + Fix-Status 2025
- <https://forum.obsidian.md/t/using-a-stylus-pen-with-wayland-means-mouse-events-get-ignored/110296>
- <https://bbs.archlinux.org/viewtopic.php?id=299709> — libinput ok, Electron nicht
- <https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1914> — X11-Workaround, Radierer bleibt kaputt
- <https://forum.obsidian.md/t/pen-tablet-not-functional-anymore-in-excalidraw-plugin-within-obsidian-on-fedora-de-hyprland-gnome/86264>
- <https://stackoverflow.com/questions/79200169/stylus-doesnt-work-in-specific-apps-but-works-under-some-x11-and-wayland-apps> — Lenovo-Yoga-Wacom-Fall
- <https://forum.obsidian.md/t/wayland-stylus-bug/87462> — Bug graveyard
- <https://raw.githubusercontent.com/flathub/md.obsidian.Obsidian/master/README.md> — Wayland deaktivieren, `user-flags.conf`
- <https://raw.githubusercontent.com/flathub/md.obsidian.Obsidian/master/obsidian.sh> — Wrapper-Logik
- <https://man.archlinux.org/man/flatpak-override.1.en> — `--socket/--nosocket/--unset-env/--reset`
- <https://docs.flatpak.org/en/latest/flatpak-command-reference.html>
- <https://cstromblad.com/posts/how-to-make-obsidian-play-nice-with-wayland/>
- <https://forum.obsidian.md/t/extremely-low-resolution-in-obsidian-1-4-x-on-linux-with-wayland/66441>
- <https://forum.obsidian.md/t/obsidian-crashes-when-forced-to-run-on-wayland-native/29783>
- <https://github.com/electron/electron/commit/b9ceaabb857e0ec55c81b464facea77ebdddad44> · <https://github.com/electron/electron/issues/48001> — Env-Variable veraltet/entfernt
- <https://github.com/niri-wm/niri/wiki/Application-Issues/Development:-Redraw-Loop> — ≥39 nur noch Flag
- <https://voxelmanip.se/notes/switch-back-electron-to-x11-xwayland/>
- <https://github.com/IsmaelMartinez/teams-for-linux/blob/1c28e146ca78bcb0ec4df317d7f0684984adf205/docs-site/docs/development/research/wayland-x11-ozone-platform-investigation.md> — Flag muss vor Prozessstart kommen
- <https://www.electronjs.org/blog/electron-39-0>
- <https://fedoraproject.org/wiki/Changes/WaylandOnlyGNOME> · <https://blogs.gnome.org/alatiera/2025/06/23/x11-session-removal-faq/> — GNOME 50 ohne Xorg
- <https://docs.fedoraproject.org/en-US/fedora/latest/release-notes/desktop/> — Fedora-44-Neuerungen
- <https://discussion.fedoraproject.org/t/weird-pen-tablet-behaviour-under-gnome-wayland/123821> — Fedora-Tablet-Symptome (allgemein)

**Teil 2**
- <https://obsidian.md/pricing> · <https://obsidian.md/help/discounts> — Preise, 40 % Bildungsrabatt
- <https://help.obsidian.md/sync-notes> — Sync-Wege und -Grenzen
- <https://obsidian.md/help/sync/security> — E2EE, lokaler Vault unverschlüsselt
- <https://obsidian.md/security> — Audits
- <https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Getting%20started/Back%20up%20your%20Obsidian%20files.md> — „Syncing is not a backup", Obsidian Git
- <https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Extending%20Obsidian/Plugin%20security.md> · <https://obsidian.md/help/plugin-security> — Plugin-Rechte
- <https://obsidian.md/help/mobile> · <https://help.obsidian.md/ios>
- <https://forum.obsidian.md/t/how-to-handwrite-on-obsidian-with-an-ipad/104417> — Handschrift bleibt unsuchbar
- <https://forum.obsidian.md/t/built-in-support-for-handwritten-notes-mainly-for-mobile-apps-e-g-apple-pencil/28460> — Scribble ist iPadOS, nicht Obsidian
- <https://forum.obsidian.md/t/scribble-on-ipad-inserts-unexpected-line-breaks/44652> · <https://forum.obsidian.md/t/apple-pencil-scribble-missing-spaces/79964>
- <https://github.com/daledesilva/obsidian_ink> · <https://community.obsidian.md/plugins/pencil> · <https://community.obsidian.md/plugins/blackboard>
- <https://community.obsidian.md/plugins/garda-handwriting-text-ocr> · <https://community.obsidian.md/plugins/petrify> · <https://github.com/zsviczian/obsidian-excalidraw-plugin> — OCR-Optionen
- <https://github.com/Vinzent03/obsidian-git> — Backup, mobile instabil
- <https://github.com/l1xnan/obsidian-better-export-pdf> · <https://forum.obsidian.md/t/print-plugin/73753> — Drucken/PDF
- <https://www.reddit.com/r/ObsidianMD/comments/176haly/best_way_to_share_obsidian_notes_with_normies/> · <https://forum.obsidian.md/t/notes-sharing/85371>
- <https://news.ycombinator.com/item?id=39029267> — Canvas ≠ OneNote
- <https://support.microsoft.com/en-US/OneNote/onenote-help-and-learning/search-notes-in-onenote> — OneNote-Suche/OCR
- <https://mswtutor.com/onenote-ocr-deep-dive-extract-text-like-a-pro> — OneNote-OCR im Detail
- <https://raw.githubusercontent.com/obsidianmd/obsidian-help/master/en/Getting%20started/Import%20notes.md> — Import aus OneNote

**Projektinterne Belege (kein Web)**: `docs/FEATURE_MATRIX.md` (Konflikt-Merge ⛔, Audio ⛔, Hardware-Nachweis 🧪, Messpflicht 🔜), `manifest.json` (`isDesktopOnly: false`).

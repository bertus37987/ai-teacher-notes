# Stift-Performance auf diesem Fedora-System (Lenovo Yoga)

Stand: 11. September 2026 · gilt für Fedora 44, GNOME 50.4, Wayland, Obsidian 1.13.7 als Flatpak

Dieses Dokument trennt **Plugin**, **Obsidian/Electron** und **System**. Es ist die
Antwort auf die Frage „können wir am System noch etwas für den Stift tun?".

## 1. Ausgangslage (gemessen, nicht geschätzt)

| Punkt | Befund |
|---|---|
| Gerät | `Wacom Pen and multitouch sensor` — ID **056a:522b**, an **USB** (`1-6:1.0`, Treiber `usbhid`) |
| Kernel | 7.1.13-200.fc44, Modul `wacom` geladen, Parameter `touch_arbitration=Y` |
| Sitzung | Wayland (GNOME 50.4 / Mutter) |
| Obsidian | Flatpak `md.obsidian.Obsidian` 1.13.7, läuft über `--ozone-platform=x11` (XWayland) |
| GPU | Intel CometLake-U (i915), `/dev/dri/renderD128` durchgereicht, GPU-Prozess aktiv |
| Bildschirm | 1920×1080, **60 Hz** → 16,7 ms je Bild |
| Plugin-Zeichenweg | 0,02 ms je Punkt (nach der Layout-Reparatur in 0.25.31) |

**Wichtig:** Der Plugin-Anteil ist damit praktisch gratis. Wenn sich der Stift zäh anfühlt,
kann die Ursache rechnerisch **nicht** mehr im Plugin liegen.

## 2. Der harte Systembefund: der Wacom-Treiber hängt

```
$ journalctl -k -b | grep -c idleprox_timeout
528
```

```
wacom 0003:056A:522B.0001: wacom_idleprox_timeout: tool appears to be hung in-prox. forcing it out.
```

Das ist ein **offener, ungefixter Treiberfehler** ([input-wacom#428](https://github.com/linuxwacom/input-wacom/issues/428)):
Nach längerer Stiftnutzung bleibt das Werkzeug im Proximity-Zustand „hängen", der Treiber
wirft es zwangsweise heraus. Die Folge ist genau das beschriebene Verhalten:
**„nach einer Weile wird der Stift zäh"** — und ein Neustart von Obsidian hilft **nicht**,
weil der Zustand im **Kernel** sitzt, nicht in der App. Betroffen sind auch ThinkPad-X1-Yoga-
und Yoga-7-Nutzer, teils auf Kernel 6.6, 6.13 und neuer. Es gab noch keinen Fix.

Die Streuung der Probenabstände ist das Erkennungsmerkmal: Der Abstand zwischen zwei
Stiftproben schwankt dann um Faktor 6 und mehr, statt gleichmäßig zu bleiben.

**Prüfen:**
```bash
journalctl -k -b | grep -c idleprox_timeout      # hohe Zahl = Treiber hängt
```

**Zurücksetzen (braucht dein Passwort, weil /sys Schreibzugriff als root verlangt):**
```bash
# Stift anfassen, damit er in Reichweite ist, dann:
sudo modprobe -r wacom && sudo modprobe wacom
# Hilft das nicht (weil der Zustand im HID-Kern sitzt):
sudo sh -c 'echo 0 > /sys/bus/usb/devices/1-6/authorized; sleep 2; echo 1 > /sys/bus/usb/devices/1-6/authorized'
```

Das ist **vorübergehend** — der Fehler kommt zurück. Als Dauerlösung bleibt nur ein Kernel,
in dem er behoben ist (oder ein anderer Stift). Die Einordnung „mein Stift ist grundsätzlich
lahm" wäre also falsch: Er ist es **periodisch**, und das ist reparierbar.

## 3. Was bereits gesetzt ist (nutzereigen, ohne sudo, sofort umkehrbar)

**Energieprofil** — der `governor` steht auf `powersave`, aber das ist bei `intel_pstate`
(aktiv) **normal** und kein Defekt. Die wirksame Stellschraube ist EPP; er steht auf
`balance_performance`. Wenn du mehr willst:

```bash
sudo dnf install power-profiles-daemon     # fehlt derzeit
powerprofilesctl set performance           # EPP auf performance, ohne sudo
```
Tauschhandel: spürbar weniger Verzögerung, deutlich mehr Akkuverbrauch und Wärme.
Fürs Schreiben lohnt es, für den Rest des Tages nicht.

**GPU-Flags** — Datei `~/.var/app/md.obsidian.Obsidian/config/obsidian/user-flags.conf`.

Der Flatpak-Wrapper liest diese Datei (Zeile 28–33 von `/app/bin/obsidian.sh`) und hängt
jede nicht-kommentierte Zeile als Startargument an. Inhalt:

```
--enable-gpu-rasterization
--enable-zero-copy
--ignore-gpu-blocklist
--disable-frame-rate-limit
```

Damit zeichnet die GPU die Flächen, und Electron deckelt die Bildrate nicht mehr auf den
Bildschirmtakt. **Wird erst nach einem Neustart von Obsidian wirksam.**

Rückgängig: Datei löschen.

Ehrlich dazu: `--disable-frame-rate-limit` kostet **Akku** und kann auf 60-Hz-Panels
**Tearing** erzeugen. Wenn dir das auffällt, die letzte Zeile entfernen — die drei anderen
kannst du behalten.

## 4. Was NICHT hilft (geprüft, damit du es nicht versuchst)

| Vermutung | Befund |
|---|---|
| USB-Autosuspend weckt den Stift langsam | `power/control=on`, `runtime_status=active`, 0 ms suspendiert → **schläft nicht** |
| Stiftstärke verursacht die Verzögerung | 400 Segmente kosten 0,3–0,5 ms bei Stärke 1 **und** 18 → **nein** |
| GPU-Beschleunigung fehlt | i915 + GPU-Prozess + Mesa-EGL aktiv → **läuft schon** |
| Skalierung rechnet um (Unschärfe) | `text-scaling=1.0`, Panel fährt native 1920×1080 → **keine Umrechnung** |
| Zu wenig CPU-Takt | `intel_pstate` aktiv, EPP `balance_performance` → **kein Notlauf** |
| X11 statt Wayland ist schuld | XWayland ist bewusst gesetzt, weil Electron unter Wayland die Stift**ereignisse** verliert → **notwendig** |

## 5. Die Reihenfolge, in der ich vorgehen würde

1. **Abtastrate messen** — die Stift-Diagnose (Strg+P) zeigt jetzt den Probenabstand als
   `min / median / max` und die Rate in Hz.
   - **Median bei ~8 ms (125 Hz):** Der Digitizer liefert normal. Sitzt die Verzögerung
     trotzdem spürbar, ist sie in der Software-Kette (XWayland-Hop + 60-Hz-Takt).
   - **Median bei ~16,7 ms:** Die Proben kleben am Bildschirmtakt — der Stift liefert feiner,
     als der Rechner durchlässt.
   - **Streuung ×6 oder mehr:** Das ist der Treiberfehler aus Abschnitt 2.
2. **Bei Streuung:** Treiber zurücksetzen (Abschnitt 2) und neu messen.
3. **Bei glatter Rate, aber trägem Gefühl:** Obsidian neu starten (lädt die GPU-Flags), und
   für konzentriertes Schreiben `powerprofilesctl set performance`.
4. **Erst dann** über Kernel-Updates oder einen anderen Stift nachdenken.

## 6. Zurücknehmen

```bash
rm ~/.var/app/md.obsidian.Obsidian/config/obsidian/user-flags.conf   # GPU-Flags
powerprofilesctl set balanced                                        # Energieprofil
flatpak override --user --socket=wayland --socket=fallback-x11 --nosocket=x11 md.obsidian.Obsidian  # X11 → Wayland
```

Die X11-Umstellung stammt aus der Stift-Runde vom 11.9.2026: Unter Wayland verliert Electron
die Stift-Ereignisse, dann zeichnet der Stift gar nicht. Der Rückweg ist oben notiert, falls
du Wayland lieber magst — dann aber ohne Stiftzeichnen.

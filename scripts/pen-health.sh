#!/bin/sh
# pen-health.sh — Stift-Gesundheit auf Linux prüfen und zurücksetzen
#
# Hintergrund: Der Wacom-Treiber im Kernel hat einen offenen Fehler
# (input-wacom#428). Nach längerer Stiftnutzung bleibt das Werkzeug im
# Proximity-Zustand hängen. Folge: Der Stift wird zunehmend zäh, obwohl nichts
# am Rechner geändert wurde. Ein Neustart der Zeichen-App hilft NICHT, weil der
# Zustand im Kernel sitzt.
#
# Aufruf:
#   sh scripts/pen-health.sh          # nur prüfen (kein Passwort nötig)
#   sh scripts/pen-health.sh --reset  # zurücksetzen (fragt nach dem Passwort)
#
# Das Zurücksetzen ist vorübergehend — der Fehler kommt wieder. Es gibt bislang
# keinen Treiber-Fix; das Skript macht die Störung nur schnell behebbar.

set -u

MELDUNG="wacom_idleprox_timeout"

# Fehlerzähler dieses Boots
anzahl() {
  journalctl -k -b 2>/dev/null | grep -c "$MELDUNG"
}

# Wacom-Geräte am USB finden (056a = Wacom)
geraete() {
  for d in /sys/bus/usb/devices/*/; do
    [ -f "${d}idVendor" ] || continue
    [ "$(cat "${d}idVendor" 2>/dev/null)" = "056a" ] || continue
    printf '%s\n' "$(basename "$d")"
  done
}

echo "=== Stift-Gesundheit ==="
echo

N=$(anzahl)
echo "Treiberabbrüche in diesem Boot: $N"

if [ "$N" -eq 0 ]; then
  echo "  → unauffällig."
elif [ "$N" -lt 30 ]; then
  echo "  → vereinzelt, meist harmlos."
elif [ "$N" -lt 300 ]; then
  echo "  → deutlich erhöht. Wenn sich der Stift zäh anfühlt: --reset."
else
  echo "  → SEHR hoch. Das ist der bekannte Treiberfehler."
  echo "     Ein Neustart der App hilft nicht — der Zustand sitzt im Kernel."
fi

echo
echo "=== Geräte ==="
for g in $(geraete); do
  name=$(cat "/sys/bus/usb/devices/$g/product" 2>/dev/null)
  treiber=$(basename "$(readlink -f "/sys/bus/usb/devices/$g/driver" 2>/dev/null)" 2>/dev/null)
  echo "  $g: ${name:-?} (Treiber: ${treiber:-?})"
done
[ -n "$(geraete)" ] || echo "  kein Wacom-Gerät gefunden (056a)"

echo
echo "=== Letzte Meldungen ==="
journalctl -k -b 2>/dev/null | grep "$MELDUNG" | tail -3 | sed 's/^/  /'
journalctl -k -b 2>/dev/null | grep -q "$MELDUNG" || echo "  keine"

if [ "${1:-}" != "--reset" ]; then
  echo
  echo "Zum Zurücksetzen:  sh $0 --reset"
  exit 0
fi

echo
echo "=== Zurücksetzen ==="
echo "Das braucht root, weil /sys nur mit erhöhten Rechten schreibbar ist."
echo

# Weg 1: Modul neu laden — deckt die meisten Fälle ab
if command -v modprobe >/dev/null 2>&1; then
  echo "1) Wacom-Modul neu laden ..."
  if sudo modprobe -r wacom 2>/dev/null && sleep 1 && sudo modprobe wacom 2>/dev/null; then
    echo "   neu geladen."
  else
    echo "   nicht möglich (Modul in Benutzung oder nicht als Modul gebaut)."
    echo "   → Weg 2 benutzen."
  fi
fi

# Weg 2: betroffene Geräte am USB kurz ab- und wieder anmelden.
# Das greift auch dann, wenn der Zustand im HID-Kern statt im Modul sitzt.
echo "2) Wacom-Geräte am USB neu anmelden ..."
neu_geladen=0
for g in $(geraete); do
  ziel="/sys/bus/usb/devices/$g/authorized"
  [ -e "$ziel" ] || { echo "   $g: kein authorized-Schalter, übersprungen"; continue; }
  if sudo sh -c "echo 0 > '$ziel'" 2>/dev/null && sleep 2 && sudo sh -c "echo 1 > '$ziel'" 2>/dev/null; then
    echo "   $g: neu angemeldet"
    neu_geladen=$((neu_geladen + 1))
  else
    echo "   $g: fehlgeschlagen"
  fi
done
[ "$neu_geladen" -gt 0 ] || echo "   kein Gerät neu angemeldet."

echo
echo "Fertig. Der Stift ist kurz weg und meldet sich in ein paar Sekunden zurück."
echo "Wenn er danach nicht reagiert: Gerät mit dem Stift berühren oder Kappe abnehmen."
echo
echo "Bitte danach in Obsidian die Stift-Diagnose öffnen (Strg+P) und zwei Wörter"
echo "schreiben — die Abtastrate zeigt, ob die Störung weg ist."

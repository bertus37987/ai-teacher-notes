# Abnahme im echten Obsidian: konkreter Zugang

## Live geprüft

- Obsidian ist als Flatpak `md.obsidian.Obsidian`, Version 1.13.7, installiert und läuft.
- Auf Datenträger liegt Smooth Handwriting 0.16.2. Daraus folgt nicht, dass diese Version im laufenden Obsidian geladen ist.
- Der lesende Aufruf `flatpak run md.obsidian.Obsidian vault=coding plugin id=smooth-handwriting` wird mit „Command line interface is not enabled“ abgewiesen.
- Es wurden weder die CLI-Einstellung geändert noch private Notizen gelesen oder ein App-Neustart erzwungen.

## Benötigte Nutzeraktion

In Obsidian Einstellungen → Allgemein → Erweitert → Command line interface aktivieren. Die offizielle Anleitung ist unter https://obsidian.md/help/cli dokumentiert.

Danach zuerst den lesenden Plugin-Status erneut abfragen. Anschließend gezielt den Plugin-Neuladestatus und lokale Modell-/Worker-/Font-Assets im tatsächlichen Host prüfen. Bestehende Notizen dürfen nicht als Testdaten überschrieben werden.

Für die Qualitätsabnahme bleibt zusätzlich eine schwierige echte Handschriftprobe mit bestätigtem Solltext erforderlich. Ein erfolgreicher Lauf auf dem synthetisch gezeichneten Wort „Hallo“ belegt Inferenz und Integration, aber nicht die vom Nutzer gewünschte Erkennungsqualität.

Die Web-App ist gemäß der ausdrücklich gewünschten Reihenfolge noch nicht als fertiggestellte Folgephase freigegeben. Gesamtziel bleibt offen.

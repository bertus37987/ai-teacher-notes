# Abnahme im echten Obsidian: konkreter Zugang

## Aktualisierung nach Nutzerfreigabe

Die CLI ist jetzt aktiviert. Der erste erfolgreiche Statusaufruf zeigte noch **0.7.1 geladen**, obwohl 0.16.2 bereits auf Datenträger lag. Nach gezieltem `plugin:reload` wurde 0.16.2 geladen; der gebündelte Font war im echten Host verfügbar.

Der echte Worker-/WASM-Test scheiterte zunächst an `Failed to resolve module specifier 'worker_threads'`: Electron stellt im Worker einen Node-Prozess-Shim bereit, wodurch ONNX Runtime den falschen Umgebungspfad wählte. Die Korrektur entfernt diesen Shim ausschließlich im dedizierten ML-Worker. Der erneute native Test mit weißem Eingabetensor lief ohne Backendfehler durch. Das Modell gab auf diesem künstlichen Leerbild `-` aus; dieser Test beweist nur funktionierende Inferenz, keine Texterkennungsqualität. Der Obsidian-Hauptprozess bleibt unberührt.

0.16.3 enthält diese Host-Korrektur und Regressionstests für Electron- und Browser-Worker. Die frühere CLI-Blockade unten ist damit historisch, nicht mehr aktuell.

Nach Installation und Plugin-Neuladen wurde auch der **Produktionsclient** geprüft: `createRecognizer()` (derselbe Einstieg wie im Handschrift-Editor) rasterisierte sieben synthetische „Hallo“-Striche im echten Obsidian und führte die lokale Erkennung aus. Ergebnis: `{"status":"finished","version":"0.16.3","expected":"Hallo","text":"Hallo"}`. Der Client wurde danach beendet; keine Notizdatei wurde angelegt oder verändert. Dies belegt den nativen Weg von Strichen über Rasterisierung, Worker und WASM bis zum Transkript, nicht die Genauigkeit auf schwierigen echten Nutzerproben.

Auch der native Wiederherstellungs-/Speicherweg wurde mit 0.16.3 geprüft: Eine neu angelegte synthetische `.handwriting.json` enthielt einen rekonstruierten Text samt Originalstrich-Metadaten. Der echte `renderBlock`-Einstieg erzeugte den nativen Editor, dessen Schaltfläche „Original wiederherstellen“ betätigt wurde. Nach `saveNow()` wurde die Datei erneut aus dem Vault gelesen: Die Elemente entsprachen exakt dem ursprünglichen Strich einschließlich Koordinaten und Druckwerten. Anschließend wurden Editor und Testcontainer entfernt und ausschließlich die neu angelegte Testdatei in den Vault-Papierkorb verschoben. Bestehende Notizen wurden nicht verwendet. Dies prüft Wiederherstellung und Persistenz, nicht die Qualität einer neuen Erkennung.

## Früherer Befund vor Nutzerfreigabe

- Obsidian ist als Flatpak `md.obsidian.Obsidian`, Version 1.13.7, installiert und läuft.
- Auf Datenträger liegt Smooth Handwriting 0.16.2. Daraus folgt nicht, dass diese Version im laufenden Obsidian geladen ist.
- Der lesende Aufruf `flatpak run md.obsidian.Obsidian vault=coding plugin id=smooth-handwriting` wird mit „Command line interface is not enabled“ abgewiesen.
- Es wurden weder die CLI-Einstellung geändert noch private Notizen gelesen oder ein App-Neustart erzwungen.

## Frühere benötigte Nutzeraktion (inzwischen erledigt)

In Obsidian Einstellungen → Allgemein → Erweitert → Command line interface aktivieren. Die offizielle Anleitung ist unter https://obsidian.md/help/cli dokumentiert.

Danach zuerst den lesenden Plugin-Status erneut abfragen. Anschließend gezielt den Plugin-Neuladestatus und lokale Modell-/Worker-/Font-Assets im tatsächlichen Host prüfen. Bestehende Notizen dürfen nicht als Testdaten überschrieben werden.

Für die Qualitätsabnahme bleibt zusätzlich eine schwierige echte Handschriftprobe mit bestätigtem Solltext erforderlich. Ein erfolgreicher Lauf auf dem synthetisch gezeichneten Wort „Hallo“ belegt Inferenz und Integration, aber nicht die vom Nutzer gewünschte Erkennungsqualität.

Die Web-App ist gemäß der ausdrücklich gewünschten Reihenfolge noch nicht als fertiggestellte Folgephase freigegeben. Gesamtziel bleibt offen.

# Eigene Handschrift – 0.21.0

## Produktentscheidung

Die automatische Optimierung verändert ausschließlich vorhandene Stiftzüge. Sie erkennt keine Buchstaben und ersetzt nichts durch eine Schriftart. Das bisherige automatische HTR-/Caveat-Rekonstruktionsverfahren wurde aus diesem Pfad entfernt; auch gespeicherte alte `beautifySemantic`-Werte aktivieren es nicht mehr. Die explizite Textumwandlung mit Vorschau bleibt als separate, optionale Funktion erhalten.

## Verhalten

- Im geschützten Handschriftmodus wird nach dem Absetzen kein träges Stroke-Modeling mehr vorgeschaltet. Die nachgelagerte Optimierung macht einen vorsichtigen Durchgang; der Renderer glättet diese Geometrie nicht nochmals. W-/M-Spitzen und Druckdaten bleiben erhalten.
- Ein Wort erhält einen einheitlichen Maßstab, statt jeden Buchstaben einzeln gleich hoch zu ziehen. Ober-/Unterlängen, verbundene Buchstaben und die persönlichen Proportionen bleiben relativ zueinander erhalten. Kleine, seitlich versetzte Punkte werden mit ihrem Stamm gruppiert.
- Nahezu vollständige Ovale können eine kurze Abschlussverbindung bekommen. Die Kontur wird nicht durch eine ideale Ellipse ersetzt. Offene C-/U-/W-Formen sollen nicht geschlossen werden; die Entscheidung ist bewusst konservativ und geometrisch, keine semantische Erkennung.
- Kariert: standardmäßig 48 Dokumentpixel = 2 Kästchen Worthöhe, 72 Pixel Zeilenraster = 1 Kästchen freier Abstand. Liniert: 32 Pixel = 1 Zeile. Die Strichstärke ragt zusätzlich um die Mittellinien der Stiftzüge herum.
- Getrennte Buchstabengruppen erhalten einen einstellbaren Abstand. Für räumlich benachbarte Folgewörter gibt es einen eigenen Wortabstands-Regler. Weit entfernte Beschriftungen werden nicht über die Seite herangezogen. Verbundene Schreibschrift wird nicht künstlich in Buchstaben zerlegt.
- Bereits optimierte Wörter behalten ihre gespeicherte Kennung und werden auch nach erneutem Öffnen nicht automatisch verändert. Papier-/Reglerwechsel ändern nicht nachträglich bestehende Wörter. Platzkonflikte lassen das Original stehen.
- Direkt oben: Kariert / Liniert / Blanko, mit erkennbarem Auswahlzustand. Die Position bleibt unabhängig von Statusmeldungen stabil. Wechsel während eines aktiven Strichs oder einer Textbearbeitung wird abgefangen.

## Prüfung und Installation

- Typecheck, alle Funktionstests außerhalb der bestehenden Performance-Suite, Plugin-/Labor-Build bestanden. Web-Build nach Rendereränderung bestanden.
- Neue Regressionen: W-Spitzen, kleine Unruhe in geraden Strichen, Druck/Zeit, vorsichtiger Ovalabschluss, offenes C, keine 0/o-Ersetzung, einheitlicher Wortmaßstab, seitlicher Punkt, Abstände, einmalige Verarbeitung und Rendering ohne erneutes Abrunden.
- Geometrie-Audit: 9/9 bestanden. Es prüft jetzt den tatsächlich aktiven eigenen Tintenpfad, nicht die entfernte automatische Glyphenklassifikation. Kein Nachweis für OCR-Genauigkeit oder alle echten Handschriften.
- Browser: W und kleines Oval gezeichnet, Papierarten direkt gewechselt, weiteres W auf liniertem Papier gezeichnet, Regler angezeigt und gespeicherte Notiz erneut geöffnet. Vorhandene Schrift blieb sichtbar unverändert. Testnotiz ist vom Nutzer-Notizbuch getrennt.
- Obsidian meldet Version 0.21.0, aktiviert. Die bestehende Live-Notiz wurde vor dem Update geschlossen/gespeichert und nach dem Update wieder geöffnet. Ihr Datei-Hash blieb unverändert. Einstellungen und Notizdaten wurden nicht überschrieben.
- Plugin-Sicherung: `plugin-backups/smooth-handwriting-0.20.0-ownink-77Y98A/`.

## Grenzen

Wortgrenzen werden aus Abstand und Schreibpause geschätzt. Nachträglich gesetzte Punkte/Querstriche und sehr eng überlagerte Wörter bleiben schwierige Fälle. Eine große offene Kontur kann nicht sicher als O oder C gedeutet werden; deshalb wird sie nicht aggressiv geschlossen. Die Verbesserung sollte als Nächstes mit der realen Stifteingabe bewertet werden. Stiftlatenz auf iPad/Yoga und Linux wurde nicht mit Hardwaremessungen überprüft.

Die ältere allgemeine Whiteboard-Performance-Suite hat bekannte Budgetüberschreitungen und wurde für diesen Stand nicht erneut ausgeführt. Diese Änderung ist kein Nachweis, dass sämtliche früheren Performanceprobleme behoben sind.

Bereits durch ältere Versionen erzeugte Schriftart-Texte bleiben absichtlich unberührt. Über „Original wiederherstellen“ lässt sich die aktive Seite explizit auf ihre gespeicherten Originalzüge zurücksetzen; dabei werden alle wiederherstellbaren Striche dieser Seite berücksichtigt.

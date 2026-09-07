# Bewegung im Editor 0.16.6

Normale Werkzeuge verwenden jetzt den nativen Crosshair-Cursor statt eines versteckten Systemzeigers mit JavaScript-DOM-Ersatz. Der Laser behält seinen eigenen Punkt, dessen Position nun über Transform statt Layoutkoordinaten aktualisiert wird. Beim Werkzeugwechsel verschwindet dieser Punkt sofort.

Der Seitencontainer verwendet direktes Scrollen (`auto`), damit laufende Touch-Scrollwertänderungen nicht durch CSS-Smooth-Scrolling interpoliert werden.

Typprüfung, sieben Testsuiten, Plugin-Paket und Browser-Lab-Build bestanden. Auf einem getrennten Browser-Prüfblatt wurden nach Mausbewegung `cursor: crosshair`, ausgeblendeter DOM-Zeiger und `scroll-behavior: auto` geprüft; ein Scrollschritt veränderte die Position von 0 auf 280. Das bestätigt die Mechanik, nicht die gemessene Hardwarelatenz beim Nutzer. Version 0.16.5 wurde vor Installation in `plugin-backups/smooth-handwriting-0.16.5-Eged5d` gesichert. Keine Notizdaten geändert.

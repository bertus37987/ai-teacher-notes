# Kompakte Heftschrift 0.16.8

Der Nutzer bestätigt am 7. September, dass kein Input-Delay mehr besteht, und wünscht ausdrücklich kleinere, klar verschönerte Schrift. Die vorherige Orientierung der Vorschau an der Originalhöhe entspricht diesem neuen Wunsch nicht mehr.

Der Prüfdialog setzt erkannte und bestätigte Texte deshalb standardmäßig mit 32 Seitenpixeln. Die Größe ist absolut zwischen 16 und 96 einstellbar, unabhängig von der Höhe der Originalstriche. Es werden Schriftzeichen neu gesetzt, nicht Strichkoordinaten horizontal gestaucht. Der bestehende Caveat-Font bleibt die Darstellungsbasis; dies ist keine persönliche Schriftmodellierung und verbessert nicht automatisch falsche Transkripte. Originale bleiben in den Rekonstruktionsmetadaten erhalten.

Die Kernfunktion behält ihren bisherigen originalgrößenorientierten Aufruf für bestehende Aufrufer; der Produktions-Prüfdialog übergibt ausdrücklich die kompakte Zielgröße. Neue Tests prüfen feste Zielgrößen, ungültige Werte und unveränderte Originalstriche. Typprüfung, sieben Testsuiten, Plugin-Paket und Lab-Build bestanden. Eine erneute visuelle Abnahme dieser Größe auf der echten Nutzerprobe steht noch aus.

Installationsbackup: `plugin-backups/smooth-handwriting-0.16.7-7UqmLt` (nicht versioniert).

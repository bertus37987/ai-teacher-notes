# Manuelle Zeilengruppierung 0.16.7

Im Handschrift-Prüfdialog können mindestens zwei angekreuzte Gruppen über „Auswahl gemeinsam neu erkennen“ zusammengeführt werden. Die lokale Erkennung startet mit der gemeinsamen Original-Tintenfläche erneut. Keine automatische Vermutung über die Zugehörigkeit verschiedener Zeilen; keine Veränderung der Seite vor ausdrücklicher Übernahme.

Der Dialog weist darauf hin, dass die gesamte Vorschau neu startet und bisherige Textkorrekturen dabei verworfen werden. Das geladene lokale Modell wird wiederverwendet. Abbrechen beendet die Erkennung und lässt die Originale bestehen.

Nachweis: Typprüfung und sieben Testsuiten bestanden. Neue Tests prüfen Originalerhalt, unabhängige Kopien, gemeinsame Grenzen und Ablehnung mehrfach zugeordneter Striche. Im getrennten Browserblatt `?test=grouping-01` erzeugten zwei künstliche Striche zunächst zwei Gruppen. Nach Auswahl und Zusammenführen erschien eine Gruppe mit erneuter Erkennung. Abbrechen ließ den gespeicherten Objektzähler bei zwei. Kein Genauigkeitsnachweis auf der echten Nutzerprobe; keine Änderung an Stiftlatenz oder persönlicher Schriftrekonstruktion.

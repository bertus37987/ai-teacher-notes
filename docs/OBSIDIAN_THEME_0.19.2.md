# Obsidian-Farbschema und Stiftcursor · 0.19.2

- Auswahl liegt als letzter Knopf im Dock, einschließlich Tastatur-Reihenfolge.
- Schwarze/anthrazitfarbene Bedienflächen, violette aktive Werkzeuge, Schalter, Regler, Fokusrahmen und Objektgriffe. Farbwerte sind als lokale UI-Tokens gebündelt; Obsidian-Purple kann den violetten Akzent liefern. Die globale Obsidian-Konfiguration wird nicht verändert.
- Papier, importierte Arbeitsblätter, ausgewählte Tintenfarben und Exporte behalten ihre Farben. Transparente Objekteditoren behalten einen hellen Eingabefarbraum, damit schwarzer Text auf Papier lesbar bleibt.
- Der Stift nutzt einen nativen SVG-Cursor mit kleinem Punkt, feinem Kreuz und mittigem Hotspot. Kein neuer Pointer-Move-Renderpfad. Im nativen PDF-Editor wird der bisherige bewegte Stiftpunkt zugunsten desselben Cursors ausgeblendet; Laser/Radierer bleiben getrennt.
- Browserprüfung: tatsächliche Dock-Reihenfolge, dunkle Leiste und Einstellungsmenü, violette Schalter und CSS-Cursor samt Hotspot. Native Cursor sind in Browser-Screenshots nicht sichtbar. Die Stifteingabe auf iPad/Yoga wurde nicht auf echter Hardware getestet.
- Typecheck, Plugin-/Lab-Build sowie Tests für Objektgrößen, Marker und inkrementelle Live-Tinte bestanden. Der bekannte vollständige Whiteboard-Lasttest wurde in diesem UI-Durchgang nicht erneut durchgeführt.

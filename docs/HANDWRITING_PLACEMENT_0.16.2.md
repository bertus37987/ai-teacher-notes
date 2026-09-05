# 0.16.2 — Platz für lesbare Rekonstruktion

Größere rekonstruierte Zeilen werden unter vorhandene Striche, Texte und geometrische Objekte gesetzt, wenn sie sonst überlappen würden. Die Schrift wird nicht verkleinert, vorhandener Inhalt nicht verschoben. Hintergrundbilder und Markierungen bleiben beschreibbar. Zwischen Objekten bleiben acht Seitenpixel Abstand.

Die Planung ist ohne Seiteneffekte. Alle ausgewählten Zeilen werden zunächst zusammen geprüft. Bei Platzmangel, nachträglich verändertem oder gesperrtem Original sowie doppelter Strichauswahl wird nichts ersetzt. Original-Restore erhält auch nach einer Verschiebung die ursprünglichen Koordinaten und Ebenenpositionen.

Automatisierte Prüfungen: Planung ohne Mutation, kollisionsfreie Platzierung, Original-Restore, atomare Ablehnung bei Platzmangel, gesperrte und mehrfach ausgewählte Striche. Typecheck und sechs Testsuiten bestanden. Das ist keine abschließende Abnahme der individuellen Nutzerhandschrift oder des echten Obsidian-Hosts.

In-App-Browser: Der echte Modelllauf erkannte wieder „Hallo“. Ein langer korrigierter Satz mit 175 % Größe wurde wegen fehlendem Platz unter bestehender Geometrie abgelehnt; die Vorschau blieb offen. Ein kürzerer Satz wurde übernommen, gespeichert und neu geladen. Danach wurden die sieben ursprünglichen Striche wiederhergestellt; beide Seiten und die zwei geometrischen Objekte blieben erhalten (neun Objekte insgesamt).

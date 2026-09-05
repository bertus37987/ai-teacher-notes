# Provenance

## Foundation

AI Teacher Notes beginnt als transparenter, kontrollierter Snapshot des eigenen Projekts:

- Quelle: <https://github.com/bertus37987/smooth-whiteboard-webmcp>
- Branch: `main`
- Commit: `c3cff3c46bc91c9f108195741459f9dd01346af2`
- Importiert: 4. September 2026
- Lizenz: MIT

Das Quellrepository bleibt als Git-Remote `upstream` eingetragen. `README.md`, `HACKATHON_DELTA.md` und `docs/BASELINE_AUDIT.md` nennen die Grundlage und grenzen neue Produktarbeit ab.

## Übernommene technische Bereiche

- Canvas-/Dokumentmodell, Rendering, Strokes, Formen und Handschrift-Normalisierung.
- Web-Canvas, Operationen, Layout, Textmessung, Linter und visuelle Composer.
- Collaboration-State-Machine, Revisionen, Agenten-Lease, Proposal und Rollback.
- Exportpfade und optionaler Obsidian-Adapter.

## Drittanbieter

Die bestehenden Hinweise in `THIRD_PARTY_NOTICES.md`, `LICENSE-APACHE-2.0` und den eingebundenen Assetverzeichnissen bleiben maßgeblich. Vor dem ersten öffentlichen Release werden zusätzlich geprüft und, falls erforderlich, ergänzt:

- das exakte Upstream-`NOTICE` des Ink Stroke Modeler Ports,
- vollständige OFL-1.1-Lizenztexte für Inter und Caveat,
- Lizenz-/Quellhinweise für alle neu hinzukommenden Produktionsabhängigkeiten.

## Historientransparenz

Der neue Repository-Name ändert nicht das Entstehungsdatum der Engine. Der Quellcode begann am 31. August 2026. Die Zulässigkeit als deklarierte vorbestehende Foundation wird deshalb vor der Hackathon-Einreichung schriftlich geklärt; die neue Arbeit bleibt in `HACKATHON_DELTA.md` nachvollziehbar.

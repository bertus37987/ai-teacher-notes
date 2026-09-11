# Einmalige Wortkorrektur und Papiermaße · 0.20.0

## Verhalten

- Nur neu erfasste Strich-IDs werden eingeplant. Neu geschriebene Zeilen werden räumlich in Wortgruppen getrennt; es findet keine erneute Korrektur aller vorhandenen Wörter statt.
- Geglättete Striche erhalten eine persistente `normalizedWordId`. Auch nach Speichern/Laden oder Einstellungsänderungen bleiben sie geschützt. Wiederhergestellte Originale werden nicht automatisch erneut eingeplant.
- Geometrie und optionale Erkennung werden vorbereitet und gemeinsam einmal übernommen. Keine sichtbare Zwischen-Glättung mit späterer zweiter Textersetzung. Die lokale Erkennung kann die Übernahme verzögern, nicht die Stifteingabe; reine Glättung funktioniert ohne sie. Änderungen während der Bearbeitung oder nach dem Entladen verhindern eine veraltete Übernahme.
- Mit Papierautomatik: kariert 48 Seitenpixel = zwei 24-px-Kästchen; Zeilenraster 72 px = zwei Kästchen Schrift plus ein freies Kästchen. Liniert 32 px = eine Linie, standardmäßig kein zusätzlicher freier Zeilenabstand. Gemeint ist vertikaler Zeilenabstand; Zeichenabstände bleiben separat einstellbar.
- Einstellbar: karierte Höhe 1–3 Kästchen, karierter Abstand 0–3 Kästchen, linierte Höhe 0,5–2 Zeilen, linierter Abstand 0–2 Zeilen. Regler existieren im Editor und in Obsidian. Neue Werte gelten nur für neue Wörter; Schrift auf bestehenden Seiten wird nicht nachträglich umgeformt.

## Weitere Änderungen aus dem Review

Zirkel-Schaltfläche entfernt; Kreis bleibt unter „Form ziehen“. Gezogene Kreise zeigen 360° und Radius in px, Dreiecke/Rauten/Rechtecke Innenwinkel und Geraden die Richtung ab rechts gegen den Uhrzeigersinn. Beschriftungen werden für neue Formen optional gespeichert und im Notebook-Rasterexport gezeichnet. Kleine Formen zeigen während des Ziehens die Werte im Status statt überlappender Beschriftungen. Die Formvorschau nutzt die separate Live-Ebene. Ein Kreis bleibt am Seitenrand kreisförmig und innerhalb der Seite.

Die Größenkorrektur nutzt geglättete Konturgrenzen, damit die sichtbare Höhe stimmt. Breite flache Striche werden nicht über den Seitenrand skaliert. Versetzte Punkte bleiben oberhalb der Buchstaben. Kurze Zusatzstriche dürfen nicht mehr von der isolierten o/u-Heuristik ignoriert werden.

## Prüfergebnis und Grenzen

- TypeScript, Plugin-/Lab-Build und alle Nicht-Performance-Testgruppen bestanden. Neue Tests prüfen Einmaligkeit, unveränderte alte Wörter, Save/Reload-Schutz, Papierdefaults, Winkel und Kreisränder.
- Der gezielte `npm run handwriting:audit` verbessert sich von 3/9 auf 8/9 bestandene synthetische Anforderungen. Er bleibt mit Exit 1 absichtlich rot: Eine isolierte Null ist weiterhin mit einem o verwechselbar. Das ist keine Erkennungsquote und keine Aussage über beliebige Handschrift. Verbindungsschrift, nachträglich gesetzte Punkte und stark zitternde reale Schrift brauchen weitere Nutzerproben. Keine Garantie vollständiger Buchstabentreue.
- Browser: neue Regler und Defaults sichtbar; erstes Wort bleibt bei Änderung von zwei auf drei Kästchen für das nächste Wort unverändert.
- Obsidian bestätigt Pluginversion 0.20.0, aktiviert, Papierautomatik an, Grid-Höhe 2, Grid-Abstand 1, Linienhöhe 1. Testnotiz „Smooth Handwriting - Live.md“ im Vault coding geöffnet; eigener neuer Schreibblock enthält eine karierte und eine linierte Seite. Vorversion gesichert. Echte Hardware-Stifttests stehen aus.

## Layout / OneNote-Ersatz: nächste UX-Schritte

Keine neue Gesamtgestaltung nötig: schwarzes Dock und helle Papierseiten beibehalten. Statt mehr Knöpfen zuerst eine einklappbare Seitenübersicht, danach einheitliche Lasso-Auswahl mit Verschieben/Duplizieren und kontextabhängigen Objektgriffen. Papiermaße und experimentelle Erkennung in getrennte Einstellungsgruppen aufteilen. Vor weiteren KI-Funktionen Speicherstatus, Entwurfsrettung und sichere PDF-Fehlerzustände aus dem Schul-Review umsetzen. Obsidian bleibt für Ordner, Links und normale Markdown-Notizen zuständig.

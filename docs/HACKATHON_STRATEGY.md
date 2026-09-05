# GatewayHacks 2026 — Gewinnstrategie

## Wettbewerbsposition

AI Teacher Notes tritt im Cause Pillar **Equity in Education** an.

> Viele KI-Produkte geben Antworten. AI Teacher Notes erklärt dort, wo der Lernende bereits denkt: direkt in seinem Heft, als bearbeitbare visuelle Darstellung.

Die App wird nicht als universelles Notizsystem verkauft. Für die Jury ist sie zuerst eine ständig verfügbare visuelle Nachhilfe, die ohne Registrierung ausprobiert werden kann und den Lernenden aktiv zum nächsten eigenen Schritt führt.

## Strategie nach Jurygewichtung

| Kriterium | Gewicht | Was wir beweisen | Artefakt |
|---|---:|---|---|
| Social Impact | 40 % | Visuelle, individualisierte Hilfe ohne dauerhafte Nachhilfe | anonymisierte Nutzertests, Transferaufgabe, Lehrkraftfeedback |
| Technical Execution | 30 % | Mehrseitiges Heft, Persistenz, visueller Tutor und Remote MCP arbeiten zuverlässig zusammen | Live-Hero-Flow, E2E-Video, Architektur, öffentliche Tests |
| Innovation | 20 % | KI und Mensch bearbeiten dieselben normalen Objekte; die KI erklärt räumlich statt im Chat | Custom Drawing, „Anders erklären“, Accept/Reject, manuelle Weiterbearbeitung |
| Design & UX | 10 % | Ruhiges digitales Heft mit niedriger Einstiegshürde | Figma-System, Tablet-Demo, Accessibility und klare Zustände |

Konsequenz: 70 % der Bewertung liegen auf Impact und funktionierender Ausführung. Ein eigener Modell-Trainings-Track darf niemals den zuverlässigen Hero-Flow oder den Nutzernachweis verdrängen.

## Beweisbare Differenzierung

- **Kein Chat neben dem Heft:** Die Erklärung wird Bestandteil des Lernartefakts.
- **Kein flaches Bild:** Agentenoutput bleibt editierbar, gruppierbar, verschiebbar und exportierbar.
- **Keine LaTeX-Hürde:** Der Mensch schreibt natürlich; der Agent legt strukturierte Rechenobjekte.
- **Agenten-Parität:** UI-Tutor und Remote MCP verwenden dieselbe Operationsschicht wie die Handwerkzeuge.
- **Teach, don't solve:** Standard ist ein nächster Schritt plus Verständnisfrage, nicht die sofortige Endantwort.
- **Mehrere Darstellungen:** Dasselbe Konzept kann als Waage, Balkenmodell, Zahlenstrahl oder Ablauf erklärt werden.
- **Kontrollierbare KI:** Jeder Batch ist sichtbar, annehmbar, ablehnbar und rückgängig.

## Demo-Video, Ziel 4:40 Minuten

- **0:00–0:20:** Problem — Antwortgeneratoren ersetzen kein Verständnis.
- **0:20–0:45:** Gast öffnet mehrseitiges Matheheft und schreibt die Gleichung.
- **0:45–1:05:** Smart-Ink-Vorher/Nachher und Original-Restore.
- **1:05–2:10:** Tutor zeichnet die Waage und erklärt Schritt 1 direkt im Heft.
- **2:10–2:50:** Lernender ergänzt selbst; Tutor prüft und reagiert.
- **2:50–3:25:** „Anders erklären“ erzeugt ein Balkenmodell und den vollständigen Weg.
- **3:25–3:45:** Accept, manuelle Bearbeitung, Reload mit gespeichertem Zustand.
- **3:45–4:05:** Externer MCP-Client ergänzt dieselbe Seite live.
- **4:05–4:30:** echte Testergebnisse, Equity-Bezug und Datenschutz.
- **4:30–4:40:** Schluss: „Nicht nur erklären. Sichtbar machen.“

Modellaufrufe werden vor der Aufnahme vorgewärmt. Zusätzlich existiert ein lokaler deterministischer Demo-Modus für den Fall eines Provider- oder WLAN-Ausfalls; er wird als Backup, nicht als angebliche Live-KI, kenntlich gemacht.

## Devpost-Paket

- klare Problem-/Lösungsbeschreibung,
- öffentliches Repository mit Setup und Lizenz,
- Live-Deployment,
- maximal fünfminütiges Demo-/Pitchvideo,
- sechs hochwertige Screenshots,
- Architekturdiagramm,
- kurze Tabelle mit echten Nutzerergebnissen,
- `HACKATHON_DELTA.md` zur transparenten Abgrenzung der vorbestehenden Engine,
- Liste der eingesetzten KI-Tools und externen Dienste.

## Zeitliche Gates

- Registrierung: 1. September 2026.
- Feature Freeze: 28. September.
- Video und Devpost-Inhalt: 29. September.
- Produktions-Generalprobe: 30. September.
- Einreichung: 1. Oktober deutlich vor 23:59 EDT.
- Juryperiode: 2.–20. Oktober.
- Gewinnerankündigung: 21. Oktober.

## Eligibility-Risiko

Das Quell-Repository wurde laut GitHub am **31. August 2026 um 20:40 UTC** erstellt, also vor der genannten Registrierungseröffnung am 1. September. Da die Regeln sagen, Teilnehmende könnten ab Registrierung mit dem Bauen beginnen, muss die Zulässigkeit der vorbestehenden Engine schriftlich mit den Organisatoren geklärt werden.

Vorgehen:

1. Historie und Datum nicht verschleiern.
2. Quell-URL und Baseline-SHA offen nennen.
3. Den Canvas als vorbestehende eigene Open-Source-Engine deklarieren.
4. Neue Hackathon-Arbeit in `HACKATHON_DELTA.md` und Pull Requests nachvollziehbar abgrenzen.
5. Organisatoren um schriftliche Bestätigung bitten.
6. Falls die Engine nicht zulässig ist, Scope neu bewerten, bevor weitere Arbeit darauf aufbaut.

Diese Klärung ist das einzige potenzielle Showstopper-Risiko und hat Priorität vor zusätzlichem Funktionsumfang.

## Nutzerstudie

Ein Test dauert etwa zehn Minuten:

1. Person erhält eine kurze Ausgangs-/Transferaufgabe.
2. Sie öffnet ohne Einweisung ein Gastheft.
3. Sie fordert eine visuelle Erklärung an und arbeitet selbst weiter.
4. Sie löst eine ähnliche Transferaufgabe.
5. Sie bewertet Verständlichkeit und Kontrollgefühl von 1 bis 5.

Erfasst werden nur anonyme Aggregatwerte und freiwillige kurze Zitate. Minderjährige werden nicht ohne passende Einwilligung oder verantwortliche Aufsicht rekrutiert; alternativ testen volljährige Lernende und Lehrkräfte den Ablauf.

## Was wir bewusst nicht in den Pitch quetschen

Multiplayer, Klassenverwaltung, Voice, personalisiertes ML, vollständiges RAG und Marketplace-Ökosystem sind Roadmap. Der Pitch zeigt ein enges Produktversprechen mit außergewöhnlicher visueller Tiefe und belastbarer Ausführung.

# Dauerhafte Entscheidungen

## D-001 — Produktmotto

**Entscheidung:** „Nicht nur erklären. Sichtbar machen.“ Der kurze Pitch lautet „Dein Heft, das zurückerklärt.“
**Warum:** Positioniert das Produkt als visuelle Lehrkraft statt als weiteres Whiteboard oder Chatfenster.

## D-002 — Zielgruppe und Pillar

**Entscheidung:** Breite Lernenden-Zielgruppe; erster Beweisfall Mathematik. Teilnahme unter „Equity in Education“.
**Warum:** Ein enger Demo-Fall macht Technik und Lernwirkung beweisbar, während die vorhandenen Composer fachliche Breite zeigen.

## D-003 — Zwei Dokumentarten

**Entscheidung:** `notebook` mit mehreren echten A4-Seiten und `whiteboard` mit unendlichen Seiten.
**Warum:** Das Heft ist der Alltagsarbeitsraum; das Whiteboard bleibt für freie Erklärungen erhalten.

## D-004 — Kein Canvas- oder Framework-Rewrite

**Entscheidung:** Vanilla-TypeScript-/Canvas-Kern behalten; kein Wechsel zu React/Excalidraw im Hackathon.
**Warum:** Eigener Renderer, Operationsmodell, Visual Composer und Transaktionslogik sind bereits der technische Differenziator.

## D-005 — Ein gemeinsamer Command Service

**Entscheidung:** Human UI, In-App-Tutor und Remote MCP nutzen denselben `SceneCommandService`.
**Warum:** Nur so ist „Agent kann alles Sichtbare, was der Mensch kann“ testbar und bleiben Validierung/Undo identisch.

## D-006 — OpenAI API plus Remote MCP

**Entscheidung:** In-App-Tutor über Responses API; externer Zugriff über standardkonformes Streamable HTTP MCP.
**Warum:** Nutzer bekommen einen sofort funktionierenden Tutor, Integratoren einen offenen Standardzugang ohne WebMCP-Abhängigkeit.

## D-007 — Supabase und Vercel

**Entscheidung:** Supabase für Anonymous Auth, Postgres, Realtime und private Storage; Vercel für Web-App, Functions und MCP.
**Warum:** Schnelle Solo-Entwicklung mit RLS, Echtzeitsignalen und einem gemeinsamen Deployment.

## D-008 — Gast zuerst

**Entscheidung:** Automatische anonyme Session; Account-Upgrade erst nach dem Kernflow.
**Warum:** Minimale Hürde und bessere Demo. Anonymous Auth wird dennoch als echter User mit owner-scoped RLS behandelt.

## D-009 — Smart Ink ehrlich trennen

**Entscheidung:** Smoothing, OCR/HTR und semantisches Redraw sind getrennte Fähigkeiten. Originalstrokes bleiben wiederherstellbar.
**Warum:** Glatte Linien allein verbessern keine falschen Zeichenformen; aggressive automatische Ersetzung wäre fachlich riskant.

## D-010 — KI lehrt schrittweise

**Entscheidung:** Standard ist ein nächster Schritt, eine visuelle Darstellung und eine Verständnisfrage; Endlösung nur auf Wunsch oder als später Schritt.
**Warum:** Das Produkt soll Verständnis fördern und nicht lediglich Antworten eintragen.

## D-011 — Öffentliche transparente Hackathon-Historie

**Entscheidung:** Neues zunächst privates Repository mit Quell-URL, Baseline-SHA und fortlaufendem Delta. Veröffentlichung vor Einreichung nach Nutzerentscheidung.
**Warum:** Die Engine begann vor Registrierung; transparente Abgrenzung und schriftliche Organizer-Klärung sind nötig.

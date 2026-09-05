import { HandwritingPage, StrokeElement, TextElement } from "./document";
import { LocalHandwritingRecognizer, rasterizeLine } from "./htr-client";
import { reconstructLine, segmentInkLines } from "./htr-core";

/** Preview is an explicit proposal: cancelling or any error leaves all ink untouched. */
export async function reviewHandwriting(page: HandwritingPage, recognizer: LocalHandwritingRecognizer): Promise<TextElement[] | null> {
  const lines = segmentInkLines(structuredClone(page.elements.filter((e): e is StrokeElement => e.type === "stroke")));
  if (!lines.length) throw new Error("Keine freie Handschrift auf dieser Seite. Zeichne zuerst mit dem Stift.");
  const dialog = document.createElement("dialog"); dialog.className = "hp-review";
  const title = document.createElement("h2"); title.textContent = "Handschrift lesbar machen";
  const note = document.createElement("p"); note.textContent = "Lokales deutsches ML-Modell · Bitte jede Zeile prüfen. Formeln und Zeichnungen abwählen. Rekonstruktion in Caveat, nicht in deiner persönlichen Schrift. Originalstriche bleiben gespeichert.";
  const status = document.createElement("p"); status.setAttribute("role", "status");
  const rows = document.createElement("div");
  const actions = document.createElement("div"); actions.className = "hp-dialog-actions";
  const cancel = document.createElement("button"); cancel.textContent = "Abbrechen";
  const apply = document.createElement("button"); apply.textContent = "Geprüfte Zeilen übernehmen"; apply.disabled = true;
  actions.append(cancel, apply); dialog.append(title, note, status, rows, actions); document.body.append(dialog);
  const entries = lines.map((line, i) => {
    const row = document.createElement("div"); row.className = "hp-review-row";
    const label = document.createElement("label"); label.textContent = `Zeile ${i + 1} übernehmen`;
    const check = document.createElement("input"); check.type = "checkbox"; check.checked = false; label.prepend(check);
    const preview = document.createElement("img"); preview.alt = `Originalhandschrift Zeile ${i + 1}`;
    try { preview.src = rasterizeLine(line).preview; } catch { /* Error appears during inference, manual input remains available. */ }
    const input = document.createElement("input"); input.type = "text"; input.maxLength = 500; input.setAttribute("aria-label", `Erkannter Text Zeile ${i + 1}`);
    input.placeholder = "Erkennung läuft …";
    const hint = document.createElement("small");
    row.append(label, preview, input, hint); rows.append(row);
    return { line, check, input, hint };
  });
  return new Promise(resolve => {
    let closed = false;
    const finish = (result: TextElement[] | null): void => { if (closed) return; closed = true; recognizer.dispose(); dialog.close(); dialog.remove(); resolve(result); };
    cancel.onclick = () => finish(null);
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
    apply.onclick = () => {
      try {
        const selected = entries.filter(e => e.check.checked);
        if (!selected.length) { status.textContent = "Bitte mindestens eine geprüfte Zeile auswählen."; return; }
        finish(selected.map(e => reconstructLine(page, e.line, e.input.value)));
      } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    };
    dialog.showModal();
    void (async () => {
      for (let i = 0; i < entries.length && !closed; i++) {
        const entry = entries[i]; status.textContent = `Erkenne Zeile ${i + 1} von ${entries.length} …`;
        try { const text = await recognizer.recognize(entry.line); if (closed) return; entry.input.value = text; entry.hint.textContent = "Prüfen, gegebenenfalls korrigieren und zum Übernehmen anhaken."; }
        catch (error) { if (closed) return; entry.hint.textContent = `Keine sichere Erkennung: ${error instanceof Error ? error.message : String(error)} Du kannst die Zeile selbst eingeben.`; }
        entry.input.placeholder = "Text prüfen oder selbst eingeben";
      }
      if (!closed) { status.textContent = "Vorschau fertig. Noch wurde kein Strich ersetzt."; apply.disabled = false; }
    })();
  });
}

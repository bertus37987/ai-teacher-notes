import { HandwritingPage, TextElement } from "./document";
import { wrapTextLines, textFontFamilies } from "./rendering";

export function textDialog(page: HandwritingPage, color: string): Promise<TextElement | null> {
  const dialog = document.createElement("dialog"); dialog.className = "hp-review";
  const title = document.createElement("h2"); title.textContent = "Text einfügen";
  const label = document.createElement("label"); label.textContent = "Beschriftung";
  const input = document.createElement("textarea"); input.rows = 4; input.maxLength = 2000; label.append(input);
  const controls = document.createElement("div"); controls.className = "hp-construction-controls";
  const fields = new Map<string, HTMLInputElement>();
  for (const [name, value] of [["X", 40], ["Y (Oberkante)", 40], ["Schriftgröße", 28]] as const) {
    const field = document.createElement("label"); field.textContent = name;
    const number = document.createElement("input"); number.type = "number"; number.value = String(value); number.min = name === "Schriftgröße" ? "12" : "0";
    fields.set(name, number); field.append(number); controls.append(field);
  }
  const status = document.createElement("p"); status.setAttribute("role", "status");
  const cancel = document.createElement("button"); cancel.textContent = "Abbrechen";
  const apply = document.createElement("button"); apply.textContent = "Text einfügen";
  const actions = document.createElement("div"); actions.className = "hp-dialog-actions"; actions.append(cancel, apply);
  dialog.append(title, label, controls, status, actions); document.body.append(dialog); dialog.showModal(); input.focus();
  return new Promise(resolve => {
    const finish = (text: TextElement | null) => { dialog.close(); dialog.remove(); resolve(text); };
    cancel.onclick = () => finish(null); dialog.oncancel = e => { e.preventDefault(); finish(null); };
    apply.onclick = () => {
      const x = fields.get("X")!.valueAsNumber, y = fields.get("Y (Oberkante)")!.valueAsNumber, fontSize = fields.get("Schriftgröße")!.valueAsNumber;
      const text = input.value.trim(), width = page.width - x - 24;
      if (!text || ![x, y, fontSize].every(Number.isFinite) || x < 0 || y < 0 || fontSize < 12 || fontSize > 120 || width < fontSize) { status.textContent = "Text und gültige Position eingeben; Schriftgröße 12–120."; return; }
      const context = document.createElement("canvas").getContext("2d")!;
      context.font = `${fontSize}px ${textFontFamilies.sans}`;
      const lines = wrapTextLines(text, width, "body", s => context.measureText(s).width);
      const height = Math.max(1, lines.length) * fontSize * 1.25;
      if (y + height > page.height || lines.some(s => context.measureText(s).width > width)) { status.textContent = "Der Text passt hier nicht vollständig auf die Seite. Position, Text oder Schriftgröße anpassen."; return; }
      finish({ type: "text", id: crypto.randomUUID(), x, baseline: y + fontSize, width, height, fontSize, color, text, fontFamily: "sans", blockStyle: "body" });
    };
  });
}

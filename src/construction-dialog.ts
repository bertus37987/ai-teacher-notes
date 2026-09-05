import { HandwritingPage, ShapeElement } from "./document";
import { Construction, constructGeometry, drawSetSquare, aimConstruction } from "./geometry-tools";

export function constructionDialog(page: HandwritingPage, kind: "set-square" | "compass", background: HTMLCanvasElement | undefined, color: string, size: number): Promise<ShapeElement | null> {
  const c: Construction = { x: Math.round(page.width / 2), y: Math.round(page.height / 3), angle: 0, length: 150, sweep: 360, edge: 0 };
  const dialog = document.createElement("dialog"); dialog.className = "hp-review";
  const heading = document.createElement("h2"); heading.textContent = kind === "set-square" ? "Geodreieck" : "Zirkel";
  const hint = document.createElement("p"); hint.textContent = "Ziehmodus wählen: Ursprung verschieben oder Größe und Richtung vom festen Ursprung aus ziehen. Alle Werte sind auch eintippbar. Maße in Seitenpixeln, keine physischen Millimeter. Winkel im Uhrzeigersinn.";
  const canvas = document.createElement("canvas"); canvas.width = page.width; canvas.height = page.height; canvas.className = "hp-construction-preview"; canvas.setAttribute("aria-label", "Konstruktionsvorschau; Ursprung auch über X und Y einstellbar");
  const controls = document.createElement("div"); controls.className = "hp-construction-controls";
  const status = document.createElement("p"); status.setAttribute("role", "status");
  const fields = new Map<string, HTMLInputElement>();
  const specs: Array<[keyof Construction, string, number, number]> = [["x", "Ursprung X", 0, page.width], ["y", "Ursprung Y", 0, page.height], ["angle", "Winkel (°)", -360, 360], ["length", kind === "compass" ? "Radius (px)" : "Länge (px)", 1, 4000]];
  if (kind === "compass") specs.push(["sweep", "Bogen (°)", 1, 360]);
  const apply = document.createElement("button"); apply.textContent = kind === "compass" ? "Kreis/Bogen einfügen" : "Kante zeichnen";
  const draw = (): void => {
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, page.width, page.height);
    if (background) ctx.drawImage(background, 0, 0, page.width, page.height);
    try {
      const shape = constructGeometry(kind, c, color, size);
      const outside = shape.points.some(p => p.x < 0 || p.y < 0 || p.x > page.width || p.y > page.height);
      if (outside) throw new Error("Die Konstruktion liegt außerhalb der Seite. Ursprung oder Größe anpassen.");
      apply.disabled = false; status.textContent = "Vorschau – noch nicht eingefügt";
      if (kind === "set-square") drawSetSquare(ctx, c);
      ctx.strokeStyle = color; ctx.lineWidth = size; ctx.beginPath();
      if (kind === "compass") ctx.arc(c.x, c.y, c.length, c.angle * Math.PI / 180, (c.angle + c.sweep) * Math.PI / 180);
      else shape.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke(); ctx.strokeStyle = "#d44"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c.x - 9, c.y); ctx.lineTo(c.x + 9, c.y); ctx.moveTo(c.x, c.y - 9); ctx.lineTo(c.x, c.y + 9); ctx.stroke();
    } catch (error) { apply.disabled = true; status.textContent = error instanceof Error ? error.message : String(error); }
  };
  for (const [key, text, min, max] of specs) {
    const label = document.createElement("label"); label.textContent = text;
    const input = document.createElement("input"); input.type = "number"; input.min = String(min); input.max = String(max); input.step = "any"; input.value = String(c[key]);
    input.oninput = () => { if (key !== "edge") c[key] = input.valueAsNumber; draw(); };
    label.append(input); controls.append(label); fields.set(key, input);
  }
  if (kind === "set-square") {
    const label = document.createElement("label"); label.textContent = "Kantenrichtung";
    const select = document.createElement("select");
    for (const angle of [0, 45, 135]) { const option = document.createElement("option"); option.value = String(angle); option.textContent = `${angle}°`; select.append(option); }
    select.onchange = () => { c.edge = Number(select.value) as 0 | 45 | 135; draw(); }; label.append(select); controls.append(label);
  }
  const dragLabel = document.createElement("label"); dragLabel.textContent = "Ziehmodus";
  const dragMode = document.createElement("select");
  for (const [value, text] of [["origin", "Ursprung verschieben"], ["arm", kind === "compass" ? "Radius und Startwinkel ziehen" : "Länge und Richtung ziehen"]]) {
    const option = document.createElement("option"); option.value = value; option.textContent = text; dragMode.append(option);
  }
  dragLabel.append(dragMode); controls.append(dragLabel);
  canvas.style.touchAction = "none";
  const place = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(page.width, (event.clientX - rect.left) * page.width / rect.width));
    const y = Math.max(0, Math.min(page.height, (event.clientY - rect.top) * page.height / rect.height));
    if (dragMode.value === "arm") Object.assign(c, aimConstruction(c, x, y, kind));
    else { c.x = Math.round(x); c.y = Math.round(y); }
    for (const key of ["x", "y", "angle", "length"] as const) fields.get(key)!.value = String(c[key]);
    draw();
  };
  canvas.onpointerdown = event => { canvas.setPointerCapture(event.pointerId); place(event); };
  canvas.onpointermove = event => { if (canvas.hasPointerCapture(event.pointerId)) place(event); };
  canvas.onpointerup = event => { if (canvas.hasPointerCapture(event.pointerId)) { place(event); canvas.releasePointerCapture(event.pointerId); } };
  canvas.onpointercancel = event => { if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); };
  const cancel = document.createElement("button"); cancel.textContent = "Abbrechen";
  const actions = document.createElement("div"); actions.className = "hp-dialog-actions"; actions.append(cancel, apply);
  dialog.append(heading, hint, controls, canvas, status, actions); document.body.append(dialog); dialog.showModal(); draw();
  return new Promise(resolve => {
    const finish = (shape: ShapeElement | null): void => { dialog.close(); dialog.remove(); resolve(shape); };
    cancel.onclick = () => finish(null);
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
    apply.onclick = () => { if (!apply.disabled) finish(constructGeometry(kind, c, color, size)); };
  });
}

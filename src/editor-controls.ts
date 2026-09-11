/** Consistent outline icons (lucide-style); paths are application-owned, never user markup. */
const paths: Record<string, string> = {
  'Text, Tabellen und Bilder auswählen': 'M5 3l14 9-7 1-3 7z',
  Stift: 'M4 20l4-1L20 7l-3-3L5 16z M14 7l3 3',
  'Intelligenter Markierer': 'M5 16l8-12 6 4-8 12z M4 20h8 M7 13l6 4',
  Radierer: 'M4 14l9-10 7 6-9 10H8z M9 9l7 6 M11 20h10',
  'Geschlossene Form mit Stifttipp füllen': 'M5 10l7-7 8 8-8 8-8-8z M4 11h16 M4 3l8 8 M20 16q-4 5 0 5q4 0 0-5',
  'Präsentationsstift (nur beim Halten)': 'M5 19l7-7 M4 16l4 4 M15 3v4 M18 9h4 M17 7l3-3',
  'Text einfügen': 'M5 5h14 M12 5v15 M8 20h8',
  Rückgängig: 'M8 5L3 10l5 5 M3 10h10a7 7 0 017 7',
  Wiederholen: 'M16 5l5 5-5 5 M21 10h-10a7 7 0 00-7 7',
  'PDF exportieren': 'M14 3H5v18h14V8z M14 3v5h5 M12 11v7 M9 15l3 3 3-3',
  'Weitere Werkzeuge': 'M5 7h14 M5 17h14 M9 4v6 M15 14v6',
  /* Datei-Sektion (Optionspanel) */
  'Aktive Seite als PNG speichern': 'M3 5h18v14H3z M8 21h8 M12 15l-3-3 3-3 M12 15V9',
  'Aktive Seite als JPG speichern': 'M3 5h18v14H3z M8 21h8 M16 9l-4 6-3-3-4 4',
  'Aktive Seite als PDF speichern': 'M14 3H5v18h14V8z M14 3v5h5 M12 11v7 M9 15l3 3 3-3',
  'Alle Seiten als mehrseitige PDF speichern': 'M8 3h11v18H8z M5 7v14 M3 11v10 M12 12v6 M9.5 15l2.5 3 2.5-3',
  'PNG, JPEG, WebP oder PDF importieren': 'M14 3H5v18h14V8z M14 3v5h5 M12 15V9 M9 12l3-3 3 3',
  'Bearbeitbares Backup exportieren': 'M12 3v12 M7 10l5 5 5-5 M4 21h16',
  'Backup importieren': 'M12 15V3 M7 8l5-5 5 5 M4 21h16',
  Importieren: 'M12 15V3 M7 8l5-5 5 5 M3 15v4a2 2 0 002 2h14a2 2 0 002-2v-4',
  'Bild oder PDF importieren': 'M12 15V3 M7 8l5-5 5 5 M3 15v4a2 2 0 002 2h14a2 2 0 002-2v-4',
  'OneNote-Notizen importieren': 'M4 4h11a3 3 0 013 3v13a0 0 0 010 0H7a3 3 0 01-3-3z M8 4v16 M16 12h-6 M16 16h-4',
  'OneNote-HTML exportieren': 'M4 4h11a3 3 0 013 3v13a0 0 0 010 0H7a3 3 0 01-3-3z M8 4v16 M16 11h-6 M16 15h-4',
  'Seite hinzufügen': 'M12 5v14 M5 12h14',
  'Tabelle einfügen': 'M3 5h18v14H3z M3 10h18 M9 5v14',
  /* Auswahl-Aktionen */
  'Auswahl duplizieren': 'M8 8h12v12H8z M16 8V4H4v12h4',
  'Auswahl löschen': 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  /* Header */
  'Gesamte Handschriftnotiz leeren': 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
};

/** Replaces button text with an application-owned outline SVG. */
export function applyIcon(button: HTMLElement): void {
  const label = button.getAttribute("aria-label") ?? "";
  const path = paths[label];
  if (!path) return;
  button.textContent = "";
  button.title = label;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
  for (const segment of path.split(" M")) {
    const element = document.createElementNS(svg.namespaceURI, "path");
    element.setAttribute("d", segment.trim().startsWith("M") ? segment : `M${segment}`);
    svg.append(element);
  }
  button.append(svg);
}

/** Legacy entry point: iconize every direct button child of a group. */
export function applyDockIcons(group: HTMLElement): void {
  for (const button of Array.from(group.querySelectorAll<HTMLButtonElement>(":scope > button"))) applyIcon(button);
}

export function rangeControl(parent: HTMLElement, name: string, value: number, min: number, max: number, step: number, update: (value: number) => void, format = (n: number) => String(n)): HTMLInputElement {
  const label = document.createElement("label"); label.className = "hp-range-control";
  const title = document.createElement("span"); title.textContent = name;
  const output = document.createElement("output"); output.textContent = format(value);
  const input = document.createElement("input"); input.type = "range"; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value); input.setAttribute("aria-label", name);
  input.oninput = () => { output.textContent = format(input.valueAsNumber); update(input.valueAsNumber); };
  label.append(title, output, input); parent.append(label); return input;
}

/**
 * Farbwechsel-Verteiler. Vorher hing an JEDEM Dickenregler ein eigener
 * `document`-Listener; bei jedem Editor-Aufbau kamen zwei dazu, und keiner wurde je
 * entfernt (Code-Audit H-01). Jetzt gibt es genau einen Listener, und er meldet
 * Regler ab, sobald sie nicht mehr im Dokument hängen.
 */
interface ColorSubscriber { element: HTMLElement; repaint: () => void }
const colorSubscribers = new Set<ColorSubscriber>();
let colorDispatchAttached = false;

function purgeDetachedSubscribers(): void {
  for (const subscriber of colorSubscribers) if (!subscriber.element.isConnected) colorSubscribers.delete(subscriber);
}

function dispatchColorChanged(): void {
  purgeDetachedSubscribers();
  for (const subscriber of colorSubscribers) subscriber.repaint();
}

function subscribeToColorChanges(element: HTMLElement, repaint: () => void): void {
  purgeDetachedSubscribers();
  colorSubscribers.add({ element, repaint });
  if (!colorDispatchAttached) { document.addEventListener("hp-color-changed", dispatchColorChanged); colorDispatchAttached = true; }
}

export function switchControl(parent: HTMLElement, name: string, checked: boolean, update: (on: boolean) => void): HTMLInputElement {
  const label = document.createElement("label"); label.className = "hp-switch-row";
  const text = document.createElement("span"); text.textContent = name;
  const input = document.createElement("input"); input.type = "checkbox"; input.checked = checked;
  input.setAttribute("role", "switch"); input.setAttribute("aria-label", name);
  input.onchange = () => update(input.checked);
  label.append(text, input); parent.append(label); return input;
}

/**
 * Premium-Dickenregler: Live-Tinten-Vorschau (drei Probenstriche in der echten
 * Stiftfarbe), feiner Slider, Pfeiltasten-Schritte. Pointer-Events werden am
 * Container gestoppt, damit der dahinterliegende Canvas keinen Strich startet.
 */
export function thicknessControl(parent: HTMLElement, name: string, value: number, min: number, max: number, step: number, update: (value: number) => void, color: () => string, format = (n: number) => String(n)): HTMLInputElement {
  const label = document.createElement("label"); label.className = "hp-thickness-control";
  const head = document.createElement("div"); head.className = "hp-thickness-head";
  const title = document.createElement("span"); title.textContent = name;
  const output = document.createElement("output"); output.textContent = format(value);
  head.append(title, output);
  const preview = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  preview.setAttribute("viewBox", "0 0 160 26"); preview.classList.add("hp-thickness-preview");
  preview.setAttribute("aria-hidden", "true");
  const probe = (fraction: number) => {
    const width = min + (max - min) * fraction * Math.max(.28, value / max);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M8 ${26 - fraction * 22} C 40 ${26 - fraction * 22 - 4}, 96 ${26 - fraction * 22 + 4}, 152 ${26 - fraction * 22}`);
    path.setAttribute("stroke", color() || "var(--text-normal)");
    path.setAttribute("stroke-width", String(Math.max(.6, Math.min(22, width))));
    path.setAttribute("fill", "none"); path.setAttribute("stroke-linecap", "round"); path.setAttribute("opacity", ".88");
    return path;
  };
  const repaint = () => {
    preview.replaceChildren(probe(.2), probe(.55), probe(.88));
    output.textContent = format(value);
  };
  const input = document.createElement("input"); input.type = "range"; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value); input.setAttribute("aria-label", name);
  input.oninput = () => { value = input.valueAsNumber; update(value); repaint(); };
  input.addEventListener("keydown", (event) => {
    const fine = { ArrowLeft: -step / 2, ArrowRight: step / 2, ArrowUp: step / 2, ArrowDown: -step / 2 }[event.key];
    if (!fine) return; event.preventDefault();
    value = Math.max(min, Math.min(max, value + fine)); input.value = String(value); update(value); repaint();
  });
  repaint();
  // Farbwechsel (Swatch/RGB-Mischer) live mitsyncen — die Vorschau liest die
  // Farbe via Callback erst beim Repaint, daher das globale Signal abonnieren.
  subscribeToColorChanges(label, repaint);
  label.addEventListener("pointerdown", (event) => event.stopPropagation());
  label.addEventListener("pointerup", (event) => event.stopPropagation());
  label.append(head, preview, input); parent.append(label);
  return input;
}

export function rgbPicker(parent: HTMLElement, initial: string, update: (hex: string) => void): { setColor: (hex: string) => void } {
  const host = document.createElement("div"); host.className = "hp-rgb-picker"; parent.append(host);
  const native = document.createElement("input"); native.type = "color"; native.setAttribute("aria-label", "Farbspektrum");
  const hex = document.createElement("input"); hex.type = "text"; hex.maxLength = 7; hex.setAttribute("aria-label", "Hex-Farbe"); hex.spellcheck = false;
  host.append(native, hex);
  let channels = [0, 0, 0];
  const sliders = ["Rot", "Grün", "Blau"].map((name, index) => rangeControl(host, name, 0, 0, 255, 1, value => {
    channels[index] = value; setColor(`#${channels.map(n => n.toString(16).padStart(2, "0")).join("")}`);
  }));
  function setColor(value: string): void {
    if (!/^#[0-9a-f]{6}$/i.test(value)) { hex.setAttribute("aria-invalid", "true"); return; }
    hex.removeAttribute("aria-invalid"); hex.value = value; native.value = value;
    channels = [1, 3, 5].map(start => parseInt(value.slice(start, start + 2), 16));
    sliders.forEach((slider, i) => { slider.value = String(channels[i]); slider.previousElementSibling!.textContent = String(channels[i]); });
    update(value);
    document.dispatchEvent(new CustomEvent("hp-color-changed"));
  }
  native.oninput = () => setColor(native.value); hex.onchange = () => setColor(hex.value);
  const presets = document.createElement("div"); presets.className = "hp-color-presets";
  for (const [name, value] of [["Schwarz", "#202124"], ["Blau", "#2457e6"], ["Rot", "#d93025"], ["Grün", "#16833b"], ["Gelb", "#ffd84d"]]) {
    const button = document.createElement("button"); button.type = "button"; button.title = name; button.setAttribute("aria-label", name);
    button.style.backgroundColor = value; button.onclick = () => { setColor(value); native.dispatchEvent(new Event("change", { bubbles: true })); }; presets.append(button);
  }
  host.prepend(presets);
  setColor(initial); return { setColor };
}

/**
 * Einheitliche Werkzeug-Symbole (UI-Audit 2.4): Vorher standen vier Darstellungsarten
 * in einer Reihe — ✎, das Farb-Emoji 🖌, Blockzeichen ▰/▣/● und Textzeichen ⌫/↖.
 * Auf Linux rendert 🖌 als Farb-Emoji, die anderen als Textzeichen: gemischte
 * Strichstärken und Grundlinien, sichtbar schief. Alle Werkzeuge nutzen jetzt
 * dasselbe Strich-SVG wie die übrige Oberfläche.
 */
const toolPaths: Record<string, string> = {
  pen: '<path d="M4 20l3.6-.8L20.1 6.7a1.7 1.7 0 0 0 0-2.4l-1.4-1.4a1.7 1.7 0 0 0-2.4 0L3.8 15.4 3 20z"/><path d="M15.5 4.5l4 4"/>',
  brush: '<path d="M7 20.5c2.6 0 4.5-1.7 4.5-3.8 0-1.6-1.1-2.7-2.7-2.7S6.1 15.1 6.1 16.7c0 1.6-.9 2.3-1.9 2.7.9.7 1.9 1.1 2.8 1.1z"/><path d="M12.6 13.6 20.4 5.8a1.2 1.2 0 0 0-1.7-1.7l-7.8 7.8"/>',
  highlight: '<path d="M9.5 14.2 5.8 17.9v2.6h2.6l3.7-3.7"/><path d="M12.3 11.4 19.7 4a1.4 1.4 0 0 1 2 2l-7.4 7.4z"/>',
  eraser: '<path d="M7.5 21h11"/><path d="M9.9 18.4 5.2 13.7a1.9 1.9 0 0 1 0-2.7l7.6-7.6a1.9 1.9 0 0 1 2.7 0l4.7 4.7a1.9 1.9 0 0 1 0 2.7l-7.3 7.3z"/>',
  fill: '<path d="M4.6 12.9 11.4 6l7.1 7.1-6.8 6.8a1.2 1.2 0 0 1-1.7 0z"/><path d="M11.4 6V2.8"/><path d="M20.4 15.1c0 1.6-1 2.9-2.4 2.9s-2.4-1.3-2.4-2.9 2.4-4.1 2.4-4.1 2.4 2.5 2.4 4.1z"/>',
  laser: '<circle cx="12" cy="12" r="2.8"/><path d="M12 2.2v3M12 18.8v3M2.2 12h3M18.8 12h3M5.1 5.1l2.1 2.1M16.8 16.8l2.1 2.1M18.9 5.1l-2.1 2.1M7.2 16.8l-2.1 2.1"/>',
  select: '<path d="M5 3.5 18.5 12l-5.6 1.2L10.7 19z"/>'
};
/** Werkzeugknopf mit Strich-SVG bestücken — Beschriftung bleibt als Tooltip. */
export function applyToolIcon(button: HTMLElement, tool: string): void {
  const path = toolPaths[tool];
  if (!path) return;
  button.textContent = "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
  svg.innerHTML = path;
  button.appendChild(svg);
}

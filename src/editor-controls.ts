/** Consistent outline icons; paths are application-owned, never user markup. */
const paths: Record<string, string> = {
  'Text und Tabellen auswählen': 'M5 3l14 9-7 1-3 7z',
  Stift: 'M4 20l4-1L20 7l-3-3L5 16z M14 7l3 3',
  'Intelligenter Markierer': 'M5 16l8-12 6 4-8 12z M4 20h8 M7 13l6 4',
  Radierer: 'M4 14l9-10 7 6-9 10H8z M9 9l7 6 M11 20h10',
  'Geschlossene Form mit Stifttipp füllen': 'M5 10l7-7 8 8-8 8-8-8z M4 11h16 M4 3l8 8 M20 16q-4 5 0 5q4 0 0-5',
  'Präsentationsstift (nur beim Halten)': 'M5 19l7-7 M4 16l4 4 M15 3v4 M18 9h4 M17 7l3-3',
  'Text einfügen': 'M5 5h14 M12 5v15 M8 20h8',
  Rückgängig: 'M8 5L3 10l5 5 M3 10h10a7 7 0 017 7',
  Wiederholen: 'M16 5l5 5-5 5 M21 10h-10a7 7 0 00-7 7',
  'PDF hochladen': 'M14 3H5v18h14V8z M14 3v5h5 M12 18v-7 M9 14l3-3 3 3',
  'Weitere Werkzeuge': 'M5 7h14 M5 17h14 M9 4v6 M15 14v6',
};

export function applyDockIcons(group: HTMLElement): void {
  for (const button of Array.from(group.querySelectorAll<HTMLButtonElement>(":scope > button"))) {
    const label = button.getAttribute("aria-label") ?? "";
    if (!paths[label]) continue;
    button.textContent = "";
    button.title = label;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, "path"); path.setAttribute("d", paths[label]); svg.append(path); button.append(svg);
  }
}

export function rangeControl(parent: HTMLElement, name: string, value: number, min: number, max: number, step: number, update: (value: number) => void, format = (n: number) => String(n)): HTMLInputElement {
  const label = document.createElement("label"); label.className = "hp-range-control";
  const title = document.createElement("span"); title.textContent = name;
  const output = document.createElement("output"); output.textContent = format(value);
  const input = document.createElement("input"); input.type = "range"; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value); input.setAttribute("aria-label", name);
  input.oninput = () => { output.textContent = format(input.valueAsNumber); update(input.valueAsNumber); };
  label.append(title, output, input); parent.append(label); return input;
}

export function switchControl(parent: HTMLElement, name: string, checked: boolean, update: (on: boolean) => void): HTMLInputElement {
  const label = document.createElement("label"); label.className = "hp-switch-row";
  const text = document.createElement("span"); text.textContent = name;
  const input = document.createElement("input"); input.type = "checkbox"; input.checked = checked;
  input.setAttribute("role", "switch"); input.setAttribute("aria-label", name);
  input.onchange = () => update(input.checked);
  label.append(text, input); parent.append(label); return input;
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

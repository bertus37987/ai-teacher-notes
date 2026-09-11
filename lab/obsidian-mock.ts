// Browser-only adapter. This is NOT shipped as part of the Obsidian plugin.
export class MarkdownRenderChild {
  private callbacks: Array<() => void> = [];
  constructor(public containerEl: HTMLElement) {}
  register(callback: () => void): void { this.callbacks.push(callback); }
  unload(): void { (this as unknown as { onunload(): void }).onunload(); this.callbacks.forEach(fn => fn()); }
}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class TFile { constructor(public path: string) {} }
export class Notice { constructor(message: string) { const out = document.querySelector("#notices"); if (out) out.textContent = message; } }
/** Modal-Stub für den Prüfstand: gleiche Oberfläche wie in Obsidian (titleEl/contentEl/open/onClose). */
export class Modal {
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  modalEl: HTMLElement;
  onClose?: () => void;
  private host?: HTMLElement;
  constructor(_app: unknown) {
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal";
    this.titleEl = document.createElement("div");
    this.titleEl.className = "modal-title";
    this.contentEl = document.createElement("div");
    this.contentEl.className = "modal-content";
    this.modalEl.append(this.titleEl, this.contentEl);
  }
  open(): void { this.host = document.createElement("div"); this.host.className = "modal-container"; this.host.append(this.modalEl); document.body.append(this.host); }
  close(): void { this.host?.remove(); this.host = undefined; this.onClose?.(); }
}
export function normalizePath(path: string): string { return path; }
export async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs/pdf.worker.mjs", location.href).href;
  return { getDocument: (options: { data: Uint8Array }) => pdfjs.getDocument({ ...options,
    cMapUrl: new URL("pdfjs/cmaps/", location.href).href, cMapPacked: true,
    standardFontDataUrl: new URL("pdfjs/standard_fonts/", location.href).href,
    wasmUrl: new URL("pdfjs/wasm/", location.href).href }) };
}

type Options = string | { text?: string; cls?: string; attr?: Record<string, string>; type?: string; value?: string };
const create = function(this: HTMLElement, tag: string, options: Options = {}): HTMLElement {
  const opts = typeof options === "string" ? { cls: options } : options;
  const child = document.createElement(tag);
  if (opts.text) child.textContent = opts.text;
  if (opts.cls) child.className = opts.cls;
  for (const [key, value] of Object.entries(opts.attr ?? {})) child.setAttribute(key, value);
  if (opts.type) child.setAttribute("type", opts.type);
  if (opts.value !== undefined) child.setAttribute("value", opts.value);
  this.append(child); return child;
};
Object.assign(HTMLElement.prototype, {
  createEl: create,
  createDiv(this: HTMLElement, opts: Options) { return create.call(this, "div", opts); },
  createSpan(this: HTMLElement, opts: Options) { return create.call(this, "span", opts); },
  empty(this: HTMLElement) { this.replaceChildren(); },
  setText(this: HTMLElement, text: string) { this.textContent = text; },
  addClass(this: HTMLElement, ...names: string[]) { this.classList.add(...names); },
  removeClass(this: HTMLElement, ...names: string[]) { this.classList.remove(...names); },
  toggleClass(this: HTMLElement, name: string, on: boolean) { this.classList.toggle(name, on); }
});

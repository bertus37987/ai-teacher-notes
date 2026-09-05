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
export function normalizePath(path: string): string { return path; }
export function loadPdfJs(): never { throw new Error("PDF-Import benötigt den echten Obsidian-Host"); }

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

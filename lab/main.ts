import SmoothHandwritingPlugin, { InlineHandwritingEditor } from "../src/main";
import { createDocument, parseDocument } from "../src/document";
import { TFile } from "obsidian";

// Mount the production editor, replacing only the Obsidian host/vault APIs.
const plugin = new SmoothHandwritingPlugin();
plugin.assetUrl = name => new URL(`assets/${name}`, location.href).href;
plugin.persistSettings = async () => {};
plugin.saveDocument = async (_file, doc) => {
  localStorage.setItem("teacher-plugin-lab", JSON.stringify(doc));
  const report = document.querySelector("#saved")!;
  report.textContent = `Gespeichert: ${doc.pages.length} Seiten · ${doc.pages.reduce((n, p) => n + p.elements.length, 0)} Objekte · ${doc.pages[0].width} × ${doc.pages[0].height}`;
};
const font = new FontFace("Teacher Caveat", `url(${plugin.assetUrl("caveat-latin.woff2")})`);
await font.load(); (document.fonts as FontFaceSet & Set<FontFace>).add(font);
const stored = localStorage.getItem("teacher-plugin-lab");
const doc = stored ? parseDocument(JSON.parse(stored))?.document ?? createDocument("grid") : createDocument("grid");
const editor = new InlineHandwritingEditor(document.querySelector("#editor") as HTMLElement, plugin, new TFile(), doc, false);
editor.onload();
window.addEventListener("pagehide", () => editor.unload());
document.querySelector("#saved")!.textContent = `Geladen: ${doc.pages.length} Seiten · ${doc.pages.reduce((n, p) => n + p.elements.length, 0)} Objekte · ${doc.pages[0].width} × ${doc.pages[0].height}`;

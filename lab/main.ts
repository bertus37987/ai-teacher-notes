import SmoothHandwritingPlugin, { InlineHandwritingEditor } from "../src/main";
import { createDocument, parseDocument } from "../src/document";
import { TFile } from "obsidian";

// Mount the production editor, replacing only the Obsidian host/vault APIs.
const plugin = new SmoothHandwritingPlugin();
// Isolate automated UI checks from the learner's open default notebook.
const testSession = new URLSearchParams(location.search).get("test");
const storageKey = testSession && /^[a-z0-9-]{1,40}$/.test(testSession) ? `teacher-plugin-lab-test-${testSession}` : "teacher-plugin-lab";
// PDF backgrounds exceed localStorage's small synchronous quota. Keep them in IndexedDB.
const database = await new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("teacher-plugin-notebooks", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("documents");
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
const readSaved = (): Promise<string | undefined> => new Promise((resolve, reject) => {
  const request = database.transaction("documents").objectStore("documents").get(storageKey);
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
plugin.assetUrl = name => new URL(`assets/${name}`, location.href).href;
plugin.persistSettings = async () => {};
plugin.saveDocument = async (_file, doc) => {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("documents", "readwrite");
    transaction.objectStore("documents").put(JSON.stringify(doc), storageKey);
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
  const report = document.querySelector("#saved")!;
  report.textContent = `Gespeichert: ${doc.pages.length} Seiten · ${doc.pages.reduce((n, p) => n + p.elements.length, 0)} Objekte · ${doc.pages[0].width} × ${doc.pages[0].height}`;
};
const font = new FontFace("Teacher Caveat", `url(${plugin.assetUrl("caveat-latin.woff2")})`);
await font.load(); (document.fonts as FontFaceSet & Set<FontFace>).add(font);
const stored = await readSaved() ?? localStorage.getItem(storageKey);
const doc = stored ? parseDocument(JSON.parse(stored))?.document ?? createDocument("grid") : createDocument("grid");
const editor = new InlineHandwritingEditor(document.querySelector("#editor") as HTMLElement, plugin, new TFile(), doc, false);
editor.onload();
window.addEventListener("pagehide", () => editor.unload());
document.querySelector("#saved")!.textContent = `Geladen: ${doc.pages.length} Seiten · ${doc.pages.reduce((n, p) => n + p.elements.length, 0)} Objekte · ${doc.pages[0].width} × ${doc.pages[0].height}`;

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { EditorSnapshots } from "../src/editor-history";
import * as transfer from "../src/notebook-transfer";
import { HandwritingDocumentV3 } from "../src/document";

function fixture(): HandwritingDocumentV3 {
  return { version: 3, profile: { targetHeight: 41, samples: 8, averageSlope: .2 }, settings: { custom: true }, pages: [
    { id: "page", width: 500, height: 600, paper: "lines", baselines: [43], elements: [
      { type: "stroke", id: "ink", color: "#123", size: 2, normalizedWordId: "word", points: [{ x: 10, y: 20, pressure: .4, time: 2 }], rawPoints: [{ x: 11, y: 21, pressure: .7, time: 1 }] },
      { type: "image", id: "image", x: 1, y: 2, width: 30, height: 40, mimeType: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=", locked: true }
    ] }
  ] } as HandwritingDocumentV3;
}
const source = fixture();
const original = JSON.stringify(source);
assert.equal(typeof transfer.exportNotebookBackup, "function", "editable backup export exists");
const backup = transfer.exportNotebookBackup(source);
assert.equal(backup.filename, "Smooth-Handwriting.handwriting.json");
assert.deepEqual(JSON.parse(backup.text), source, "all document fields, raw ink and embedded images survive without normalization");
assert.equal(JSON.stringify(source), original);
console.log("notebook-transfer: lossless export passed");
assert.equal(typeof transfer.parseNotebookBackup, "function", "safe backup parser exists");
assert.deepEqual(transfer.parseNotebookBackup(backup.text, backup.filename), source, "parser validation must not apply legacy geometry migrations to backups");
for (const name of ["test.one", "test.ONEPKG"]) assert.throws(() => transfer.parseNotebookBackup(backup.text, name), /OneNote.*nicht.*Backup-Format/);
assert.throws(() => transfer.parseNotebookBackup("{}", "x.json"), /handwriting.json/);
assert.throws(() => transfer.parseNotebookBackup("{", backup.filename), /JSON/);
assert.throws(() => transfer.parseNotebookBackup('{"version":99}', backup.filename), /Version/);
assert.throws(() => transfer.parseNotebookBackup(JSON.stringify({ ...source, pages: [{ ...source.pages[0], width: -1 }] }), backup.filename), /Breite/);
assert.throws(() => transfer.parseNotebookBackup(" ".repeat(transfer.MAX_BACKUP_BYTES + 1), backup.filename), /64 MiB/);
assert.throws(() => transfer.parseNotebookBackup(backup.text.replace("data:image/png;base64,aGVsbG8=", "data:image/svg+xml;base64,AAAA"), backup.filename), /PNG.*JPEG/);
console.log("notebook-transfer: strict bounded parser passed");
assert.equal(typeof transfer.prepareBackupPages, "function", "non-destructive page import exists");
const incoming = fixture();
incoming.pages[0].elements[1].parentId = "ink";
let sequence = 0;
const pages = transfer.prepareBackupPages(source, incoming, () => sequence++ === 0 ? "page" : `new-${sequence}`);
assert.equal(pages.length, 1);
assert.notEqual(pages[0].id, "page");
assert.notEqual(pages[0].elements[0].id, "ink");
assert.equal(pages[0].elements[1].parentId, pages[0].elements[0].id);
assert.deepEqual((pages[0].elements[0] as any).rawPoints, (incoming.pages[0].elements[0] as any).rawPoints);
assert.equal(JSON.stringify(source), original, "current pages/profile/settings never changed during preparation");
assert.equal(incoming.pages[0].id, "page");
assert.throws(() => transfer.prepareBackupPages(source, incoming, () => "page"), /ID/);
const duplicate = fixture(); duplicate.pages[0].elements[1].id = "ink";
assert.throws(() => transfer.prepareBackupPages(source, duplicate), /doppelte/);
console.log("notebook-transfer: detached pages and collision-safe IDs passed");

// Real editor methods with only Obsidian/browser host APIs substituted.
const requireProject = createRequire(`${process.cwd()}/package.json`);
const code = requireProject("esbuild").buildSync({ entryPoints: ["src/main.ts"], bundle: true, platform: "node", format: "cjs", target: "es2022", loader: { ".woff2": "binary" }, external: ["obsidian"], write: false }).outputFiles[0].text;
const notices: string[] = [];
let downloaded: Blob | undefined;
let downloadName = "";
const noop = () => {};
// --- Minimal-DOM: der plugin-eigene Bestätigungsdialog muss WIRKLICH laufen ---
// Seit 0.25.31 ersetzt er window.confirm, das Obsidians Fenster nicht durchreicht
// (der Rückgabewert kam nie an — beim Entfernen passierte deshalb sichtbar nichts).
// Der Test darf den Dialog nicht umgehen, sonst prüft er die Rückfrage nicht mehr.
const offeneDialoge: any[] = [];
function fakeEl(tag = "div"): any {
  const el: any = {
    tagName: tag, cls: "", download: "", textContent: "", children: [] as any[], parent: null,
    attrs: {} as Record<string, string>, style: {},
    classList: { add: noop, remove: noop, contains: () => false },
    createDiv: (o?: any) => anhaengen(el, "div", o),
    createEl: (t: string, o?: any) => anhaengen(el, t, o),
    append(c: any) { c.parent = el; el.children.push(c); return c; },
    appendChild(c: any) { return el.append(c); },
    setAttribute(k: string, v: string) { el.attrs[k] = v; },
    removeAttribute(k: string) { delete el.attrs[k]; },
    addEventListener: noop, removeEventListener: noop, focus: noop, showModal: noop, close: noop,
    empty() { el.children = []; }, setText(text: string) { el.textContent = text; },
    toggleClass: noop, addClass: noop, removeClass: noop,
    remove() { if (el.parent) el.parent.children = el.parent.children.filter((c: any) => c !== el); },
    click() { if (el.download) downloadName = el.download; if (typeof el.onclick === "function") el.onclick(); },
    querySelector: () => null, querySelectorAll: () => []
  };
  return el;
}
function anhaengen(vater: any, tag: string, o?: any): any {
  const el = fakeEl(tag);
  if (o?.cls) el.cls = o.cls;
  if (o?.text) el.textContent = o.text;
  if (o?.attr) for (const [k, v] of Object.entries(o.attr as Record<string, string>)) el.attrs[k] = v;
  el.parent = vater; vater.children.push(el);
  if (String(el.cls).includes("hp-confirm-overlay")) offeneDialoge.push(el);
  return el;
}
function imBaum(el: any, treffer: (e: any) => boolean): any {
  if (treffer(el)) return el;
  for (const kind of el.children ?? []) { const t = imBaum(kind, treffer); if (t) return t; }
  return null;
}
/** Beantwortet den offenen Plugin-Dialog — genau der Weg, den auch der Nutzer geht. */
function dialogAntworten(bestaetigen: boolean): void {
  const overlay = offeneDialoge.shift();
  if (!overlay) throw new Error("kein Plugin-Bestätigungsdialog offen");
  const label = bestaetigen ? "Bestätigen" : "Abbrechen";
  const knopf = imBaum(overlay, (e: any) => e.attrs?.["aria-label"] === label);
  if (!knopf) throw new Error("Dialogknopf fehlt: " + label);
  knopf.onclick();
}
/** Import starten und die Rückfrage beantworten, sobald sie erscheint. */
async function importieren(e: any, file: any, bestaetigen: boolean): Promise<void> {
  const lauf = e.importBackupFile(file);
  await new Promise((fertig) => setTimeout(fertig, 0));
  dialogAntworten(bestaetigen);
  await lauf;
}
const fakeDocument: any = fakeEl("document");
fakeDocument.body = fakeEl("body");
fakeDocument.createElement = (tag: string) => fakeEl(tag);
const moduleStub = { exports: {} as any };
runInNewContext(code, {
  module: moduleStub, exports: moduleStub.exports,
  require: (name: string) => name === "obsidian" ? { MarkdownRenderChild: class {}, Plugin: class {}, PluginSettingTab: class {}, Notice: class { constructor(message: string) { notices.push(message); } }, Modal: class {}, Setting: class {} } : requireProject(name),
  console, structuredClone, crypto: globalThis.crypto, AbortController, DOMException, TextEncoder, Blob,
  // Buffer: das Test-Bundle entsteht mit platform "node", dort dekodiert esbuild die eingebettete
  // Handschrift-Schrift über Buffer. Das Prod-Bundle (platform browser) nutzt die reine JS-Tabelle.
  Buffer,
  URL: { createObjectURL(blob: Blob) { downloaded = blob; return "blob:local"; }, revokeObjectURL: noop },
  window: { setTimeout: () => 1, clearTimeout: noop },
  document: fakeDocument
});
const Editor = moduleStub.exports.InlineHandwritingEditor;
function editor() {
  const e: any = Object.create(Editor.prototype);
  Object.assign(e, { document: fixture(), pointerPageId: null, objectEditing: false, importing: false, exporting: false,
    history: [], future: [], snapshots: new EditorSnapshots(), activePageId: "page", plugin: { settings: { penSize: 99 } },
    saves: { dirty: false },
    rebuildPages: noop, markChanged: noop, clearPendingNormalization: noop, setStatus: noop, scheduleSave: noop });
  return e;
}
async function integration() {
  const e = editor();
  assert.equal(typeof e.importBackupFile, "function", "real editor backup import is wired");
  const file = { name: backup.filename, size: backup.text.length, text: async () => backup.text };
  await importieren(e, file, true);
  assert.equal(e.document.pages.length, 2);
  assert.equal(e.history.length, 1, "whole import is one undo step");
  assert.deepEqual(e.document.pages[0], source.pages[0]);
  assert.deepEqual(e.document.profile, source.profile);
  assert.equal(e.plugin.settings.penSize, 99);
  e.undo(); assert.equal(JSON.stringify(e.document), original);
  e.redo(); assert.equal(e.document.pages.length, 2);
  e.exportEditableBackup(); assert.equal(downloadName, backup.filename);
  assert.equal(await downloaded!.text(), JSON.stringify(e.document));
  for (const guard of ["pointerPageId", "objectEditing", "importing", "exporting"]) {
    const busy = editor(); busy[guard] = guard === "pointerPageId" ? "page" : true;
    let read = false; await busy.importBackupFile({ ...file, text: async () => { read = true; return backup.text; } });
    assert.equal(read, false, guard); assert.equal(busy.history.length, 0);
    downloaded = undefined; busy.exportEditableBackup(); assert.equal(downloaded, undefined, guard);
  }
  const cancelled = editor(); await importieren(cancelled, file, false);
  assert.equal(JSON.stringify(cancelled.document), original); assert.equal(cancelled.history.length, 0);
  const aborted = editor();
  await aborted.importBackupFile({ ...file, text: async () => { aborted.importAbort.abort(); return backup.text; } });
  assert.equal(JSON.stringify(aborted.document), original); assert.equal(aborted.history.length, 0); assert.equal(aborted.importing, false);
  const invalid = editor(); await invalid.importBackupFile({ ...file, name: "original.one" });
  assert.match(notices.at(-1)!, /OneNote.*nicht.*Backup-Format/); assert.equal(invalid.history.length, 0);
  const tooLarge = editor(); let readLarge = false;
  await tooLarge.importBackupFile({ ...file, size: transfer.MAX_BACKUP_BYTES + 1, text: async () => { readLarge = true; return backup.text; } });
  assert.equal(readLarge, false); assert.equal(tooLarge.history.length, 0);
  const main = readFileSync("src/main.ts", "utf8");
  for (const label of ["Bearbeitbares Backup exportieren", "Backup importieren", "PDF exportieren"]) assert.ok(main.includes(`"aria-label": "${label}"`) || main.includes(`"aria-label":"${label}"`), label);
  console.log("notebook-transfer: real editor export/import, undo/redo, guards, cancel and UI labels passed");
}
integration().catch(error => { console.error(error); process.exitCode = 1; });

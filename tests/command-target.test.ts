import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { LeafLike } from "../src/command-target";
import { NOT_EDITABLE, NO_NOTE_OPEN, editableLeaf, isMarkdownLeaf, pickMarkdownLeaf } from "../src/command-target";

const leaf = (viewType: string, mode = "source", editor?: LeafLike["editor"]): LeafLike => ({
  getViewType: () => viewType,
  getMode: () => mode,
  getState: () => ({ file: "Notiz.md", mode }),
  editor
});
const noWait = async () => {};

// Auf dem iPad ist keine Notiz „aktiv", und die offene Notiz steht in der Leseansicht.
// Beides darf den Befehl weder verschwinden lassen noch ins Leere laufen lassen.
const note = leaf("markdown", "preview");
const explorer = leaf("file-explorer", "source");
assert.equal(pickMarkdownLeaf([explorer, note], explorer) === note, true, "ohne aktive Notiz wird die offene Markdown-Notiz gewählt");
assert.equal(pickMarkdownLeaf([explorer]), null, "ohne Markdown-Notiz gibt es kein Ziel");
const active = leaf("markdown", "source");
assert.equal(pickMarkdownLeaf([note, active], active) === active, true, "die aktive Notiz hat Vorrang");
assert.equal(isMarkdownLeaf(undefined), false, "fehlende Ansicht ist kein Markdown");

// Vertrag: die beiden Block-Befehle müssen dauerhaft in der Befehlspalette stehen. Mit
// checkCallback verschwinden sie, sobald kein Editor aktiv ist (iPad-Befund 13.9.2026).
const main = readFileSync("src/main.ts", "utf8");
for (const id of ["insert-handwriting-block", "remove-handwriting-block"]) {
  const start = main.indexOf(`id: "${id}"`);
  assert.ok(start > 0, `${id} ist registriert`);
  const block = main.slice(start, main.indexOf("});", start));
  assert.ok(/callback:\s*\(/.test(block), `${id} nutzt einen gewöhnlichen callback und bleibt dadurch sichtbar`);
  assert.ok(!block.includes("checkCallback"), `${id} darf nicht wieder auf checkCallback zurückfallen`);
  assert.ok(block.includes("this.runBlockCommand("), `${id} holt sein Ziel über die Rückfall-Suche`);
}
assert.ok(/blockCommandTarget\(\): Promise<\{ editor: Editor \}/.test(main), "die Zielsuche gibt einen Editor oder einen Hinweis zurück");

// Asynchroner Teil (das Test-Bundle ist CommonJS, dort gibt es kein Top-Level-await).
async function main_(): Promise<void> {
  // Umschalten aus der Leseansicht: setState mit mode "source" und ohne Verlauf, danach ist der Editor da.
  let switched: { state: Record<string, unknown>; result: { history: boolean } } | undefined;
  const reading = leaf("markdown", "preview");
  reading.setState = (state, result) => { switched = { state, result }; reading.editor = { replaceSelection() {} }; };
  const opened = await editableLeaf(reading, noWait);
  assert.equal("editor" in opened, true, "die Leseansicht wird bearbeitbar gemacht");
  assert.equal(switched?.state.mode, "source", "umgeschaltet wird auf Bearbeiten");
  assert.equal(switched?.state.file, "Notiz.md", "der Dateibezug der Ansicht bleibt erhalten");
  assert.equal(switched?.result.history, false, "das Umschalten landet nicht im Verlauf");

  // Vorhandene Bearbeitungsansicht bleibt unangetastet.
  const editing = leaf("markdown", "source", { replaceSelection() {} });
  let reSet = false;
  editing.setState = () => { reSet = true; };
  assert.equal("editor" in (await editableLeaf(editing, noWait)), true, "die Bearbeitungsansicht liefert den Editor direkt");
  assert.equal(reSet, false, "eine Ansicht im Bearbeitungsmodus wird nicht neu gesetzt");

  // Ehrliche Fehlermeldungen statt stiller Wirkungslosigkeit.
  assert.deepEqual(await editableLeaf(null, noWait), { error: NO_NOTE_OPEN }, "ohne Notiz kommt ein Hinweis");
  assert.deepEqual(await editableLeaf(leaf("markdown", "preview"), noWait), { error: NOT_EDITABLE }, "ohne Editor kommt ein Hinweis");
}

main_().then(
  () => console.log("Befehlspalette: Block-Befehle bleiben ohne aktiven Editor sichtbar"),
  (error) => { console.error(error); process.exit(1); }
);

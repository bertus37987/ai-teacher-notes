/**
 * Zielsuche für die beiden Block-Befehle („Handschriftblock einfügen" und „… wieder entfernen").
 *
 * Warum das eine eigene, DOM-freie Einheit ist: Auf dem iPad öffnet Obsidian Notizen in der
 * Leseansicht, und `workspace.activeEditor` ist dann leer. Mit einem `checkCallback` verschwand der
 * Befehl deshalb vollständig aus der Befehlspalette — sichtbar blieb nur die Stift-Diagnose, die
 * einen gewöhnlichen `callback` benutzt (Nutzerbefund 13.9.2026). Die Befehle sind jetzt immer
 * sichtbar und stellen die Notiz selbst auf Bearbeiten um.
 *
 * Hier steht nur das Auswahl- und Umschaltverhalten, absichtlich ohne Obsidian-Typen, damit es
 * ohne laufende App prüfbar bleibt.
 */

export interface EditorLike {
  replaceSelection(text: string): void;
}

/** Ein Obsidian-Blatt, so weit es dieser Befehl braucht (MarkdownView passt strukturell). */
export interface LeafLike {
  getViewType?: () => string;
  getMode?: () => string;
  getState?: () => Record<string, unknown> | null;
  setState?: (state: Record<string, unknown>, result: { history: boolean }) => unknown;
  editor?: EditorLike;
}

export const NO_NOTE_OPEN = "Bitte zuerst eine Notiz öffnen — der Handschriftblock gehört in eine Markdown-Notiz.";
export const NOT_EDITABLE = "Diese Notiz lässt sich gerade nicht bearbeiten. Bitte die Notiz im Bearbeitungsmodus öffnen.";

export function isMarkdownLeaf(view: LeafLike | null | undefined): boolean {
  return view?.getViewType?.() === "markdown";
}

/**
 * Bevorzugt die aktive Notiz, sonst irgendeine Markdown-Notiz. Auf Mobilgeräten ist oft gar keine
 * Notiz „aktiv" (Dateiliste, Suche, Graph) — ohne diesen Rückfall bliebe der Befehl wirkungslos.
 */
export function pickMarkdownLeaf(views: LeafLike[], active: LeafLike | null = null): LeafLike | null {
  if (active && isMarkdownLeaf(active) && views.includes(active)) return active;
  return views.find(isMarkdownLeaf) ?? null;
}

/**
 * Leseansicht (mobiler Standard) auf Bearbeiten stellen und danach kurz auf den Editor warten:
 * direkt nach dem Umschalten ist `leaf.editor` noch nicht gesetzt.
 */
export async function editableLeaf(
  leaf: LeafLike | null,
  wait: (ms: number) => Promise<unknown> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<{ editor: EditorLike } | { error: string }> {
  if (!leaf) return { error: NO_NOTE_OPEN };
  if (leaf.getMode?.() !== "source" && leaf.setState && leaf.getState) {
    const state = leaf.getState();
    if (state) await leaf.setState({ ...state, mode: "source" }, { history: false });
  }
  for (let attempt = 0; attempt < 10 && !leaf.editor; attempt++) await wait(50);
  return leaf.editor ? { editor: leaf.editor } : { error: NOT_EDITABLE };
}

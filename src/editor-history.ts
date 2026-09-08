import { HandwritingDocumentV3, PageElement } from "./document";

/** Reuse detached copies of committed elements between append-only pen gestures. */
export class EditorSnapshots {
  private copies = new WeakMap<PageElement, PageElement>();
  invalidate(): void { this.copies = new WeakMap(); }
  capture(document: HandwritingDocumentV3): HandwritingDocumentV3 {
    return { ...document, profile: { ...document.profile }, pages: document.pages.map(page => ({
      ...page, baselines: page.baselines?.slice(), elements: page.elements.map(element => {
        let copy = this.copies.get(element);
        if (!copy) { copy = structuredClone(element); this.copies.set(element, copy); }
        return copy;
      })
    })) };
  }
}

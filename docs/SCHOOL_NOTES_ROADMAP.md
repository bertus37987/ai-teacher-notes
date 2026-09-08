# School notebook extension

Product direction: a pen-first school notebook inside Obsidian for iPad and Lenovo Yoga, including Linux. The present build is an incremental notebook editor, not yet a complete OneNote replacement.

## Implemented in 0.18.0

- Page-positioned text boxes: editable text, size and position, font size, bold, italic and paragraph alignment. Formatting applies to the whole box. Select “Text / Tabelle bearbeiten” in the insert section and tap an existing object to edit it.
- Simple spreadsheet-style tables: editable cells, Tab/Enter navigation, rectangular TSV paste, add rows/columns and resize/move. Maximum 30 rows and 12 columns. No formula engine, sorting, merged cells or Excel file import yet. Cells persist in the notebook and render in its PNG/PDF export.
- Freehand translucent marker with incremental live drawing. Optional snap targets actual text objects only; handwriting, diagrams and PDF image backgrounds remain freehand. Snapping runs on release, not in the pointer movement path.
- One plus button below the last page, quick RGB colors, and iOS-style switches for boolean settings.

## Next milestones, in priority order

1. Reliability on devices: real Apple Pencil/Yoga pen testing, palm rejection, touch scrolling while selecting, keyboard appearance, rotated/resized views, save/reopen and long-document memory. A desktop browser check is not a substitute for hardware verification.
2. Everyday editing: selection/lasso for every object, multi-object movement and copy/paste, inline rich-text ranges, lists and checkboxes, direct resize handles outside edit mode, page thumbnails/reorder/duplicate, paper templates and per-page orientation.
3. Accessible school work: keyboard navigation through notebook objects, a searchable plain-text companion note, transcript review for recognized handwriting, optional dyslexia-friendly spacing, high-contrast controls, reading order and text-to-speech using available platform features.
4. Worksheets: preserve PDF text coordinates for accurate snap/search on PDF text, image cropping, links to original attachments, page-aware print/export and consistent school document templates.
5. Tables: row/column removal with undo, row/column sizing, selection and paste expansion, sum/average formulas with a small safe parser, CSV/TSV import/export. Avoid arbitrary JavaScript evaluation.
6. Visual teacher tools after editing is reliable: step-by-step diagrams, editable graphs, checked calculations, source references and learner-controlled memory. AI changes should remain inspectable and undoable.

## Use Obsidian instead of duplicating it

Keep folders, subject organization, Markdown notes, attachments and internal note links in the vault workflow. Evaluate existing search, templates, backlinks, sync and backup facilities against the user's installed setup before building replacements. Expose notebook text and references to these features instead of creating a separate file manager or account system. Sync availability and conflicts depend on the chosen setup; do not assume paid services are configured.

## Release checks

Create a text box, resize and edit it, insert a table, navigate/paste cells, mark text and empty space, add a page, undo/redo, reopen the document and export it. Preserve original worksheet images and handwriting. Test iPad and Yoga hardware before advertising production readiness on those devices.

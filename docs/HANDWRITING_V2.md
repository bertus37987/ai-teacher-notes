# Schönschrift v2 — implementation and verification log

Objective: support shaky handwriting with consistent sizing, spacing, stable rows, completed recognizable glyphs, and true circles at maximum shape improvement. Keep the original pen captures available and keep inference out of pointer movement.

## Current implementation

- Geometry after the writing pause: group overlapping strokes, smooth local motion, use a fixed target height, add spacing, preserve aspect ratio, and retain original points. A per-page continuation anchor aligns subsequent words to the same row.
- Maximum shape improvement: near-round closed shapes (minor/major axis at least 0.72) use a common radius and become actual circles. Deliberately elongated ellipses remain ellipses. Large gestures can be recognized while letter protection is active; smaller letter gestures remain protected.
- Local semantic reconstruction: the existing CPU inference worker returns text and a CTC token score. Recognitions above the current 0.85 threshold can be rendered in the handwriting font at a fixed size, with original captures retained. Lower scores keep the geometric result and expose the existing review action. CTC score is not a calibrated probability of correctness.
- A u stays open at the top. Semantic completion must restore its bowl or stems, not turn it into an o. Raw geometry alone does not infer missing letters.
- The first real worker check on an isolated open o was uncertain. A supplementary topology check now handles strongly near-closed o shapes and recognizable u bowls. Deliberate c openings are excluded. This does not establish accuracy for arbitrary incomplete glyphs.

## Evidence and remaining work

Automated tests currently verify shared baselines, target height, minimum separation, retained original points, exact circle diameters at 100%, disabled shape correction, and decoder score behavior.

Browser checks on 2026-09-08: a drawn open o and a single-stroke u both reached the semantic reconstruction path and persisted as editable text. A visible size regression (font em size mistaken for glyph height) was found and corrected by measuring the font's o height. Reconstruction currently caps the font at 96 px, so the largest geometric size settings are not yet matched by semantic output. These were synthetic mouse paths, not a handwriting accuracy benchmark.

The notebook flow was also checked in the browser: text insertion and resizing, editable table persistence, marker snap on typed text, a freehand marker stroke on blank paper, page creation, and save/reopen.

Release verification: TypeScript, plugin packaging, lab build, web build and all non-performance test suites pass. The full `npm test` run remains failing at the existing whiteboard performance ceilings (observed 425 ms versus 400 ms on the smaller fixture and 2642 ms versus 2000 ms on the larger fixture across runs). These limits have not been relaxed. No claim of zero latency on physical devices is made.

Still required before claiming the full objective achieved: real recognizer end-to-end samples for open o, broken u and other incomplete letters; crowded connected handwriting; late dots/crossbars; multi-line input; collision and page-edge cases; and stylus checks on iPad/Yoga. Synthetic geometry tests do not prove handwriting recognition quality. Full automatic clean handwriting is not yet verified.

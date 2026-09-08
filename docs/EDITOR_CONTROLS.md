# Editor controls and drawing performance

Version 0.17.4 adds a rainbow color button with an RGB/hex/native color popover for pen, marker and fill. Numeric settings use labeled sliders with visible values; paper and file paths retain categorical/text controls. Zero disables fill, pressure and shape improvement. Letter protection takes precedence over automatic shape conversion.

The Improve shapes value adjusts line deviation and closed-shape recognition tolerances. It does not perform handwriting recognition. Original handwriting is still retained for reconstruction.

Laser and live pen ink use a separate canvas above committed page content. Laser samples are bounded to the latest 96 points, drawn at most once per animation frame with one glow pass; release clears the layer without modifying the document. Completed ordinary pen strokes are appended to the committed canvas. Resize and document editing still redraw the page as needed.

Undo snapshots reuse detached copies of unchanged committed elements between append-only handwriting gestures. Mutating operations invalidate the cache; undo/redo clone restored states to protect shared historical copies. Normalization waits until the pen is up. Snapshot isolation and shape sensitivity are covered by regression tests.

Browser checks: RGB sliders synchronize to hex, zero shape strength displays Off, handwriting survives undo/redo, and laser release does not add saved objects. Unit checks also cover incremental ink rendering and history copy isolation. Actual stylus latency on the user's device still needs a hands-on check; no zero-latency guarantee is made.

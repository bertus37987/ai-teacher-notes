# Third-party notices

## Browser PDF import

- PDF.js / pdfjs-dist 6.3.289, Mozilla contributors, Apache-2.0: https://github.com/mozilla/pdf.js
- The browser lab bundles the renderer and serves its matching worker, character maps, standard fonts and WASM locally. Its LICENSE is copied alongside these assets. Native Obsidian continues to use the host-provided PDF.js.

## Offline handwriting recognition (plugin preview 0.16.0)

- ONNX Runtime Web 1.27.0, Microsoft, MIT: https://github.com/microsoft/onnxruntime
- DE·HTR v2, naeyn, Apache-2.0: https://huggingface.co/naeyn/de-htr-web-v2
- Model revision: `6241c1ff0fd42725e0dc46fcd3217469cac851bb`; model and config SHA-256 are checked by `scripts/build-plugin.mjs`.
- Model card, training-data provenance notice, runtime license and Caveat OFL are included in the packaged assets.
- HTR recognizes German handwriting lines, not arbitrary formulas or diagrams. Recognition is a user-confirmed suggestion, not guaranteed recovery of illegible content. No cloud inference is used.

Smooth Handwriting bundles `ink-stroke-modeler-ts`, a TypeScript
reimplementation of Google's Ink Stroke Modeler:

- TypeScript port: https://github.com/WhiteboardCX/ink-stroke-modeler-ts
- Original project: https://github.com/google/ink-stroke-modeler
- Original copyright: Copyright 2022 Google LLC
- License: Apache License 2.0

The port is pinned to commit
`240d80f2c78c2f70317b498d37564f90fcddfe0c`. It runs entirely on-device and
does not transmit handwriting data.

## Bundled fonts

The web app self-hosts two Latin-subset variable fonts under `web/fonts/`, so an
agent-drawn board looks the same on every machine instead of falling back to
whatever handwriting face the operating system happens to have:

- Inter — Copyright 2016 The Inter Project Authors
  (https://github.com/rsms/inter)
- Caveat — Copyright 2015 Impallari Type
  (https://github.com/googlefonts/caveat)

Both are licensed under the SIL Open Font License, Version 1.1
(https://openfontlicense.org). The files are the unmodified Latin subsets served
by Google Fonts and are used only to render text; no font data is transmitted.

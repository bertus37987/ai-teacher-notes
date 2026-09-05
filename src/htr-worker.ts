import * as ort from "onnxruntime-web/wasm";
import { decodeCtc } from "./htr-core";

const scope = self as unknown as { onmessage: ((event: MessageEvent) => void) | null; postMessage: (value: unknown) => void };
let session: ort.InferenceSession | undefined;
let alphabet = "";
scope.onmessage = async (event: MessageEvent) => {
  const { id, pixels, width, assets } = event.data;
  try {
    if (!session) {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = { mjs: assets.runtime, wasm: assets.wasm };
      const response = await fetch(assets.config);
      if (!response.ok) throw new Error("Modellkonfiguration fehlt");
      const config = await response.json();
      if (config.input_name !== "image" || config.output_name !== "logits" || config.image_height !== 64 || config.blank_index !== 0 || Array.from(config.alphabet as string).length !== 111) throw new Error("Ungültige HTR-Konfiguration");
      alphabet = config.alphabet;
      session = await ort.InferenceSession.create(assets.model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    }
    if (!Number.isInteger(width) || width < 4 || width > 1024 || width % 4 !== 0 || pixels.length !== width * 64) throw new Error("Ungültiges Zeilenbild");
    const input = new ort.Tensor("float32", pixels, [1, 1, 64, width]);
    const output = await session.run({ image: input });
    try { scope.postMessage({ id, text: decodeCtc(output.logits.data as Float32Array, output.logits.dims, alphabet) }); }
    finally { input.dispose(); Object.values(output).forEach(t => t.dispose()); }
  } catch (error) { scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
};

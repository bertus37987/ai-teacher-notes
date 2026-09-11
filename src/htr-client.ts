import { InkLine } from "./htr-core";

export type AssetUrl = (name: string) => string;
export interface RecognitionResult { text: string; confidence: number; }

/** Isolate Electron's process shim only inside our dedicated inference worker. */
export function browserWorkerSource(source: string): string {
  return 'Object.defineProperty(globalThis, "process", { value: undefined, configurable: true });\n' + source;
}

export function rasterizeLine(line: InkLine): { pixels: Float32Array; width: number; preview: string } {
  const padding = Math.max(3, ...line.strokes.map(s => s.size));
  const height = Math.max(1, line.maxY - line.minY) + padding * 2;
  const rawWidth = Math.max(1, line.maxX - line.minX) + padding * 2;
  const scale = 64 / height;
  if (rawWidth * scale > 1024) throw new Error("Diese Zeile ist zu lang. Bitte in kürzere Abschnitte aufteilen; sie wird nicht verzerrt.");
  const width = Math.max(4, Math.ceil(rawWidth * scale / 4) * 4);
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = 64;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, width, 64);
  ctx.scale(scale, scale); ctx.translate(padding - line.minX, padding - line.minY);
  ctx.strokeStyle = "black"; ctx.fillStyle = "black"; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const stroke of line.strokes) {
    ctx.lineWidth = stroke.size;
    ctx.beginPath(); stroke.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    if (stroke.points.length === 1) { const p = stroke.points[0]; ctx.beginPath(); ctx.arc(p.x, p.y, stroke.size / 2, 0, Math.PI * 2); ctx.fill(); }
  }
  const rgba = ctx.getImageData(0, 0, width, 64).data;
  const pixels = Float32Array.from({ length: width * 64 }, (_, i) => rgba[i * 4] / 255);
  return { pixels, width, preview: canvas.toDataURL("image/png") };
}

export class LocalHandwritingRecognizer {
  private worker?: Worker;
  private sequence = 0;
  private pending = new Map<number, { resolve: (result: RecognitionResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private asset: AssetUrl) {}
  private async start(): Promise<void> {
    if (this.worker) return;
    // Blob wrapper also supports Obsidian's app:// vault asset URLs.
    const response = await fetch(this.asset("htr-worker.js"));
    if (!response.ok) throw new Error("HTR-Worker fehlt. Bitte das vollständige Plugin-Paket installieren.");
    // Electron exposes a Node process shim in workers. Emscripten must use its
    // browser/WASM backend here, including in dynamically imported runtime modules.
    const url = URL.createObjectURL(new Blob([browserWorkerSource(await response.text())], { type: "text/javascript" }));
    try { this.worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
    this.worker.onmessage = event => {
      const entry = this.pending.get(event.data.id); if (!entry) return;
      clearTimeout(entry.timer); this.pending.delete(event.data.id);
      if (event.data.error) entry.reject(new Error(event.data.error)); else entry.resolve({text:event.data.text,confidence:event.data.confidence ?? 0});
    };
    this.worker.onerror = () => this.dispose("Lokale Erkennung konnte nicht gestartet werden");
  }
  async recognize(line: InkLine): Promise<string> {
    return (await this.recognizeDetailed(line)).text;
  }
  async recognizeDetailed(line: InkLine): Promise<RecognitionResult> {
    await this.start();
    const { pixels, width } = rasterizeLine(line); const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Nur DIESE Zeile zurückweisen. Vorher beendete ein einziges Zeitlimit den Worker und
        // verwarf damit ALLE wartenden Zeilen (Code-Audit N-06) — eine langsame Zeile riss
        // also die ganze Erkennung ab.
        const entry = this.pending.get(id);
        if (entry) { this.pending.delete(id); entry.reject(new Error("Die Erkennung hat zu lange gedauert. Original bleibt erhalten.")); }
      }, 90_000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ id, pixels, width, assets: {
        model: this.asset("model.onnx"), config: this.asset("config.json"),
        runtime: this.asset("ort-wasm-simd-threaded.mjs"), wasm: this.asset("ort-wasm-simd-threaded.wasm")
      } }, [pixels.buffer]);
    });
  }
  dispose(message = "Erkennung abgebrochen"): void {
    this.worker?.terminate(); this.worker = undefined;
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(message)); }
    this.pending.clear();
  }
}


import { build } from "esbuild";
await build({
  entryPoints: [{ in: "src/document.ts", outfile: "/tmp/doc-probe.cjs" }, { in: "src/handwriting-v2.ts", outfile: "/tmp/hw-probe.cjs" }],
  bundle: true, platform: "node", format: "cjs", logLevel: "silent"
});
console.log("OK");

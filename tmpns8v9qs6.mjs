
import { build } from "esbuild";
for (const [src, out] of [["src/handwriting-v2.ts", "/tmp/hw-probe.cjs"], ["src/document.ts", "/tmp/doc-probe.cjs"]]) {
  await build({ entryPoints: [src], bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "silent" });
}
console.log("OK");

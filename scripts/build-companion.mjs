import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir("companion-dist", { recursive: true });
await build({
  entryPoints: ["companion/mcp-bridge.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "companion-dist/mcp-bridge.mjs",
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "warning",
});
console.log("Companion gebaut: companion-dist/mcp-bridge.mjs");
import { build } from "esbuild";
import { mkdir, copyFile, cp } from "node:fs/promises";
await mkdir("lab-dist", { recursive: true });
await build({ entryPoints: ["lab/main.ts"], bundle: true, format: "esm", platform: "browser", target: "es2022", outfile: "lab-dist/lab.js", alias: { obsidian: "./lab/obsidian-mock.ts" } });
await copyFile("lab/index.html", "lab-dist/index.html");
await copyFile("styles.css", "lab-dist/styles.css");
await cp("plugin-dist/smooth-handwriting/assets", "lab-dist/assets", { recursive: true });
console.log("Plugin UI lab built. Serve lab-dist on localhost (not the repository root).");

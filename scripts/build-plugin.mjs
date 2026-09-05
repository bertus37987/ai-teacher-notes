import { build } from "esbuild";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = "plugin-dist/smooth-handwriting";
const assets = `${root}/assets`;
await mkdir(assets, { recursive: true });
const revision = "6241c1ff0fd42725e0dc46fcd3217469cac851bb";
const files = {
  "model.onnx": "b576a0a1281b9be46b2574028b75575e041b7d7cb650f063886e733467cc1499",
  "config.json": "4ebd69d9d27b398ea3997b031318accc13123f6a8950def1fedc6e364cb758fa",
};
for (const [name, hash] of Object.entries(files)) {
  let bytes;
  try { bytes = await readFile(`${assets}/${name}`); } catch { /* Download missing asset. */ }
  if (!bytes || createHash("sha256").update(bytes).digest("hex") !== hash) {
    const response = await fetch(`https://huggingface.co/naeyn/de-htr-web-v2/resolve/${revision}/${name}`);
    if (!response.ok) throw new Error(`Model download failed: ${name} ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error(`Model checksum mismatch: ${name}`);
    await writeFile(`${assets}/${name}`, bytes);
  }
}
for (const name of ["NOTICE-training-data.md", "README.md"]) {
  const response = await fetch(`https://huggingface.co/naeyn/de-htr-web-v2/resolve/${revision}/${name}`);
  if (!response.ok) throw new Error(`Missing model attribution: ${name}`);
  await writeFile(`${assets}/HTR-${name}`, await response.text());
}
await copyFile("LICENSE-APACHE-2.0", `${assets}/HTR-LICENSE`);
const fontLicense = await fetch("https://raw.githubusercontent.com/googlefonts/caveat/main/OFL.txt");
if (!fontLicense.ok) throw new Error("Missing Caveat OFL license");
await writeFile(`${assets}/CAVEAT-OFL.txt`, await fontLicense.text());
await build({ entryPoints: ["src/htr-worker.ts"], bundle: true, format: "iife", platform: "browser", target: "es2022", outfile: `${assets}/htr-worker.js`, minify: true });
for (const name of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) await copyFile(`node_modules/onnxruntime-web/dist/${name}`, `${assets}/${name}`);
const runtimeLicense = await fetch("https://raw.githubusercontent.com/microsoft/onnxruntime/v1.27.0/LICENSE");
if (!runtimeLicense.ok) throw new Error("Missing ONNX Runtime license");
await writeFile(`${assets}/ONNXRUNTIME-LICENSE`, await runtimeLicense.text());
await copyFile("web/fonts/caveat-latin.woff2", `${assets}/caveat-latin.woff2`);
for (const name of ["main.js", "manifest.json", "styles.css", "LICENSE", "LICENSE-APACHE-2.0", "THIRD_PARTY_NOTICES.md"]) await copyFile(name, `${root}/${name}`);
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const archive = `smooth-handwriting-${manifest.version}-preview.zip`;
const zip = spawnSync("zip", ["-q", "-r", archive, "smooth-handwriting"], { cwd: "plugin-dist", stdio: "inherit" });
if (zip.status !== 0) throw new Error("ZIP packaging failed (install zip)");
console.log(`Packaged plugin-dist/${archive}`);

import {build} from "esbuild";
import {spawnSync} from "node:child_process";
const result=await build({entryPoints:["scripts/audit-handwriting.ts"],bundle:true,platform:"node",format:"cjs",write:false});
const run=spawnSync(process.execPath,["-"],{input:result.outputFiles[0].text,stdio:["pipe","inherit","inherit"]});
process.exitCode=run.status ?? 1;

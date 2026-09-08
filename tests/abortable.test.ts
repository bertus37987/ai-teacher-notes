import assert from "node:assert/strict";
import { abortable } from "../src/abortable";

async function main() {
  const active = new AbortController();
  assert.equal(await abortable(Promise.resolve(7), active.signal), 7);
  await assert.rejects(abortable(Promise.reject(new Error("renderer failed")), active.signal), /renderer failed/);
  const controller = new AbortController();
  const pending = abortable(new Promise<number>(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(pending, /abgebrochen/);
  await assert.rejects(abortable(Promise.resolve(1), controller.signal), /abgebrochen/);
  console.log("Cancellable PDF wait tests passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

// Prozess-E2E der Companion-Bridge: echte Binary via stdin/stdout, Plugin-Rolle via fetch.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import assert from "node:assert/strict";

const PORT = Number(process.argv[2] ?? 27949);
const TOKEN = "prozesstest-abcdef0123456789abcdef01234567";
const bridge = spawn(process.execPath, [decodeURIComponent(new URL("../companion-dist/mcp-bridge.mjs", import.meta.url).pathname), "--port", String(PORT), "--token", TOKEN], { stdio: ["pipe", "pipe", "pipe"] });

const responses = new Map();
const pending = new Map(); // id -> resolve
let nextId = 1;

const lines = createInterface({ input: bridge.stdout });
lines.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      const resolve = pending.get(message.id);
      pending.delete(message.id);
      resolve(message);
    }
  } catch { /* Nebenausgaben im stdout gibt es nicht */ }
});

const send = (method, params) => {
  const id = nextId++;
  bridge.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve) => pending.set(id, resolve));
};
const call = (name, args) => send("tools/call", { name, arguments: args });
const resultOf = (message) => JSON.parse(message.result.content[0].text);
const awaitPort = async () => {
  for (let i = 0; i < 60; i += 1) {
    try { await fetch(`http://127.0.0.1:${PORT}/agent/hello`, { method: "POST", body: "{}" }); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error("Bridge-Port kam nie hoch");
};
const post = async (path, body) => {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: TOKEN, vaultId: "vault-probe", ...body }) });
  return { status: response.status, data: await response.json() };
};

async function pluginLoop(stop) {
  // hello zuerst
  await post("/agent/hello", { info: { agentName: "Probe" } });
  while (!stop.finished) {
    const poll = await post("/agent/poll", {});
    if (poll.status !== 200) { await new Promise((r) => setTimeout(r, 100)); continue; }
    const item = poll.data?.pending;
    if (!item) { await new Promise((r) => setTimeout(r, 100)); continue; }
    if (item.kind === "inspect") {
      await post("/agent/respond", { id: item.id, result: { ok: true, page: { pageId: "seite-1", width: 1200, height: 1697, paper: "grid", revision: 4, elementCount: 1, elements: [{ id: "e1", type: "stroke", bounds: { minX: 400, minY: 600, maxX: 800, maxY: 1000 } }] } } });
      stop.inspect = true;
    } else if (item.kind === "propose") {
      const requestId = item.payload?.batch?.requestId;
      if (requestId === "req-probe-1") {
        await post("/agent/respond", { id: item.id, result: { ok: true, applied: true, addedIds: ["txt-1"], updatedIds: [], removedIds: [] } });
        stop.propose = true;
      } else {
        // andere Antworten bewusst hinauszögern (cancel-Fall)
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
}

const stop = { finished: false, inspect: false, propose: false };
const step = (label) => console.log(`[probe] ${label}`);
await awaitPort();
step("bridge läuft");
const plug = pluginLoop(stop);
{
  const init = await send("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
  assert.equal(init.result.protocolVersion, "2025-11-25");
  step("initialize ok");
}
{
  const list = await send("tools/list", {});
  const names = list.result.tools.map((tool) => tool.name);
  for (const expected of ["notebook_status", "notebook_inspect", "notebook_propose", "notebook_cancel"]) assert.ok(names.includes(expected), expected);
}
{
  const unauthorized = await fetch(`http://127.0.0.1:${PORT}/agent/hello`, { method: "POST", body: JSON.stringify({ token: "falsch", vaultId: "vault-probe" }) });
  assert.equal(unauthorized.status, 401, "falsches Token ⇒ 401");
}
{
  const inspect = await call("notebook_inspect", { vaultId: "vault-probe", pageId: "seite-1" });
  step("inspect antwortete");
  const data = resultOf(inspect);
  assert.equal(data.pageId, "seite-1");
  assert.equal(data.revision, 4);
  const overlap = data.freeRegions.filter((r) => r.minX < 800 && r.maxX > 400 && r.minY < 1000 && r.maxY > 600);
  assert.equal(overlap.length, 0, "freie Regionen schneiden Elemente nicht");
  assert.equal(stop.inspect, true);
}
{
  const propose = await call("notebook_propose", {
    vaultId: "vault-probe", pageId: "seite-1",
    batch: { requestId: "req-probe-1", operations: [{ op: "create_text", id: "txt-1", x: 10, baseline: 40, fontSize: 16, text: "Mitochondrium" }] },
    origin: { label: "Zellskizze" },
  });
  step("propose antwortete");
  const data = resultOf(propose);
  assert.equal(data.applied, true);
  assert.deepEqual(data.addedIds, ["txt-1"]);
}
{
  const status = await call("notebook_status", {});
  const data = resultOf(status);
  assert.equal(data.vaults.length, 1);
  assert.equal(data.vaults[0].agentName, "Probe");
}
{
  // cancel über den Prozess: langsamer Vorschlag + Abbruch
  const slowPropose = call("notebook_propose", { vaultId: "vault-probe", pageId: "seite-1", batch: { requestId: "req-probe-2", operations: [{ op: "create_path", id: "pf-2", points: [{ x: 1, y: 2 }] }] } });
  await new Promise((r) => setTimeout(r, 300));
  const cancel = call("notebook_cancel", { vaultId: "vault-probe", requestId: "req-probe-2" });
  // Der Plugin-Loop antwortet auf req-probe-2 erst nach 500 ms — cancel kommt zuvor.
  const cancelResult = resultOf(await cancel);
  assert.equal(cancelResult.cancelled, true);
  const slowResult = await slowPropose;
  step("slowPropose aufgelöst");
  assert.ok(slowResult.error, "abgebrochener Vorschlag erscheint als Fehler");
  assert.match(String(slowResult.error.message), /abgebrochen/);
}
{
  const cancelMissing = await call("notebook_cancel", { vaultId: "vault-probe", requestId: "gibt-es-nicht" });
  assert.equal(resultOf(cancelMissing).cancelled, false);
}

stop.finished = true;
await plug;
bridge.kill();
console.log("Prozess-E2E Companion-Bridge: alle Prüfungen bestanden");
process.exit(0);
import assert from "node:assert/strict";
import { startBridge } from "../companion/lib/bridge";
import { runMcpLoop } from "../companion/lib/mcp";

/*
 * M2: Integration der Companion-Bridge — echter HTTP-Server (port 0) plus
 * die stdio-MCP-Schleife über einen kontrollierten Eingabestrom. Simuliert
 * den kompletten Weg Agent ↔ Bridge ↔ Plugin-Rolle: Auth, Vault-Isolation,
 * inspect (Poll/Antwort, freie Regionen), propose (Annahme), cancel, timeout.
 */

const TOKEN = "e2e-token-0123456789abcdef0123456789abcdef";

interface MCPLine {
  id: string | number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

async function main(): Promise<void> {
  const bridge = await startBridge({ port: 0, token: TOKEN, inspectTimeoutMs: 1_000, proposeTimeoutMs: 400 });
  const url = `http://127.0.0.1:${bridge.port}`;

  // Kontrollierter Eingabestrom: Zeilen können jederzeit nachgeschoben werden.
  const queue: string[] = [];
  let wake: (() => void) | null = null;
  const input = {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      return this as unknown as AsyncIterator<string>;
    },
    next(): Promise<IteratorResult<string>> {
      return (async () => {
        while (queue.length === 0) await new Promise<void>((resolve) => { wake = resolve; });
        const value = queue.shift();
        if (value === undefined) return { done: true, value: undefined } as IteratorResult<string>;
        return { done: false, value };
      })();
    },
  } as AsyncIterable<string>;

  const out: string[] = [];
  const loop = runMcpLoop(bridge.tools, input, (line) => out.push(line));

  let callId = 0;
  const send = (message: object): void => { queue.push(JSON.stringify(message)); wake?.(); };
  const expectRpc = async (id: number): Promise<MCPLine> => {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const index = out.findIndex((line) => (JSON.parse(line) as MCPLine).id === id);
      if (index >= 0) return JSON.parse(out[index]) as MCPLine;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`keine MCP-Antwort für id ${id}`);
  };
  const post = async (path: string, body: unknown): Promise<{ status: number; data: unknown }> => {
    const response = await fetch(`${url}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const call = async (name: string, args: Record<string, unknown>): Promise<{ id: number; done: () => Promise<MCPLine> }> => {
    const id = ++callId;
    const done = () => expectRpc(id);
    send({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
    return { id, done };
  };

  /* initialize + tools/list über den stdio-Kanal */
  send({ jsonrpc: "2.0", id: 990, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } });
  const initialized = await expectRpc(990);
  assert.equal(initialized.result?.protocolVersion, "2025-11-25");
  send({ jsonrpc: "2.0", id: 991, method: "tools/list", params: {} });
  const toolList = await expectRpc(991);
  const toolNames = ((toolList.result?.tools ?? []) as { name: string }[]).map((tool) => tool.name);
  for (const expected of ["notebook_status", "notebook_inspect", "notebook_propose", "notebook_cancel"]) {
    assert.ok(toolNames.includes(expected), `Werkzeug ${expected} gelistet`);
  }

  /* Auth: falsches Token ⇒ 401 */
  {
    const unauthorized = await post("/agent/hello", { token: "falsch", vaultId: "v1", info: {} });
    assert.equal(unauthorized.status, 401);
  }

  /* Vault-Registrierung */
  {
    const hello = await post("/agent/hello", { token: TOKEN, vaultId: "v1", info: { agentName: "Hermes" } });
    assert.equal(hello.status, 200);
    assert.equal((hello.data as { ok?: boolean }).ok, true);
    // Fremder Vault ist unbekannt ⇒ 404
    const stranger = await post("/agent/poll", { token: TOKEN, vaultId: "v2" });
    assert.equal(stranger.status, 404, "Vault-Isolation: fremde Vaults sehen nichts");
  }

  /* notebook_status spiegelt den verbundenen Vault */
  {
    const status = await call("notebook_status", {});
    const line = await status.done();
    const data = JSON.parse((line.result?.content as { text: string }[])[0].text) as { vaults: { vaultId: string }[] };
    assert.deepEqual(data.vaults.map((vault) => vault.vaultId), ["v1"]);
  }

  /* inspect: Agent fragt an → Plugin pollt → antwortet → freie Regionen */
  {
    const inspect = await call("notebook_inspect", { vaultId: "v1", pageId: "p1" });
    const polled = await post("/agent/poll", { token: TOKEN, vaultId: "v1" });
    const pending = (polled.data as { pending: { id: string; kind: string; payload: { pageId: string } } }).pending;
    assert.equal(pending.kind, "inspect");
    assert.equal(pending.payload.pageId, "p1");

    const responded = await post("/agent/respond", {
      token: TOKEN, vaultId: "v1", id: pending.id,
      result: {
        ok: true,
        page: {
          pageId: "p1", width: 1200, height: 1697, paper: "grid", revision: 9, elementCount: 1,
          elements: [{ id: "e1", type: "stroke", bounds: { minX: 400, minY: 600, maxX: 800, maxY: 1000 } }],
        },
      },
    });
    assert.equal((responded.data as { ok?: boolean }).ok, true);

    const line = await inspect.done();
    assert.equal(line.error, undefined);
    const data = JSON.parse((line.result?.content as { text: string }[])[0].text) as {
      pageId: string; revision: number; elements: unknown[]; freeRegions: { minX: number; minY: number; maxX: number; maxY: number }[];
    };
    assert.equal(data.pageId, "p1");
    assert.equal(data.revision, 9);
    assert.equal(data.elements.length, 1);
    const overlap = data.freeRegions.filter((r) => r.minX < 800 && r.maxX > 400 && r.minY < 1000 && r.maxY > 600);
    assert.equal(overlap.length, 0, "freie Regionen schneiden vorhandene Elemente nicht");
  }

  /* propose: Batch → Poll → menschliche Annahme → Ergebnis fließt zurück */
  {
    const propose = await call("notebook_propose", {
      vaultId: "v1", pageId: "p1",
      batch: { requestId: "req-e2e-1", operations: [{ op: "create_text", id: "t1", x: 10, baseline: 20, fontSize: 16, text: "Mitochondrium" }] },
      origin: { label: "Zellskizze ergänzen" },
    });
    const polled = await post("/agent/poll", { token: TOKEN, vaultId: "v1" });
    const pending = (polled.data as { pending: { id: string; kind: string; payload: { batch: { requestId: string }; label: string } } }).pending;
    assert.equal(pending.kind, "propose");
    assert.equal(pending.payload.batch.requestId, "req-e2e-1");
    assert.equal(pending.payload.label, "Zellskizze ergänzen");

    await post("/agent/respond", { token: TOKEN, vaultId: "v1", id: pending.id, result: { ok: true, applied: true, addedIds: ["t1"], updatedIds: [], removedIds: [] } });
    const line = await propose.done();
    const data = JSON.parse((line.result?.content as { text: string }[])[0].text) as { applied: boolean; addedIds: string[] };
    assert.equal(data.applied, true);
    assert.deepEqual(data.addedIds, ["t1"]);
  }

  /* cancel: offene Anfrage wird sichtbar abgebrochen */
  {
    const slowPropose = await call("notebook_propose", { vaultId: "v1", pageId: "p1", batch: { requestId: "req-e2e-2", operations: [{ op: "create_path", id: "p2", points: [{ x: 1, y: 2 }] }] } });
    const polled = await post("/agent/poll", { token: TOKEN, vaultId: "v1" });
    const pending = (polled.data as { pending: { id: string } }).pending;
    assert.ok(pending, "Vorschlag liegt zur Abholung bereit");
    const cancel = await call("notebook_cancel", { vaultId: "v1", requestId: "req-e2e-2" });
    const cancelLine = await cancel.done();
    const cancelData = JSON.parse((cancelLine.result?.content as { text: string }[])[0].text) as { cancelled: boolean };
    assert.equal(cancelData.cancelled, true);
    const proposeLine = await slowPropose.done();
    assert.ok(proposeLine.error, "abgebrochener Vorschlag erreicht den Agenten als Fehler");
    assert.match(String(proposeLine.error?.message), /abgebrochen/i);
  }

  /* timeout: unbeantwortete Anfrage läuft nach proposeTimeoutMs ab */
  {
    const slow = await call("notebook_propose", { vaultId: "v1", pageId: "p1", batch: { requestId: "req-e2e-3", operations: [{ op: "create_path", id: "p3", points: [{ x: 1, y: 2 }] }] } });
    await new Promise((resolve) => setTimeout(resolve, 150));
    void slow; // nie gepollt
    const line = await slow.done();
    assert.ok(line.error, "Timeout erreicht den Agenten als Fehler");
    assert.match(String(line.error?.message), /Zeitüberschreitung|timeout/i);
  }

  /* bye: Vault abmelden */
  {
    await post("/agent/bye", { token: TOKEN, vaultId: "v1" });
    const polled = await post("/agent/poll", { token: TOKEN, vaultId: "v1" });
    assert.equal(polled.status, 404);
  }

  await bridge.close();
  void loop;
  console.log("Companion-Bridge Integrationstests bestanden");
}

main().catch((error) => { console.error(error); process.exit(1); });
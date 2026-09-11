import assert from "node:assert/strict";
import { findFreeRegions, RegionBounds } from "../companion/lib/free-regions";
import { PendingQueue } from "../companion/lib/pending";
import { generateToken, timingSafeEqual } from "../companion/lib/auth";
import { runMcpLoop, McpTool, McpCallError } from "../companion/lib/mcp";

/*
 * M2: Companion-Bridge (Standard-MCP stdio → Loopback-HTTP → Plugin).
 * Geprüft werden die puren Bausteine: freie Regionen, Pending-Queue mit
 * Vault-Isolation, Token-Auth und die stdio-JSON-RPC-Schleife.
 */

async function main(): Promise<void> {
  /* ------------------------- freie Regionen ------------------------- */

  {
    const page: [number, number] = [1200, 1697];
    const free = findFreeRegions(page[0], page[1], [], { cell: 64 });
    assert.equal(free.length, 1);
    assert.equal(free[0].minX, 0);
    assert.equal(free[0].maxX, 1200);
    assert.equal(free[0].maxY, 1697);

    // Belegte Mitte: keine Region darf die Box schneiden.
    const occupied: RegionBounds[] = [{ minX: 400, minY: 600, maxX: 800, maxY: 1000 }];
    const regions = findFreeRegions(page[0], page[1], occupied, { cell: 64 });
    assert.ok(regions.length > 1, "mehrere freie Regionen");
    const overlaps = regions.filter((region) => region.minX < 800 && region.maxX > 400 && region.minY < 1000 && region.maxY > 600);
    assert.equal(overlaps.length, 0, "keine Region überschneidet belegten Inhalt");

    // Komplett belegte Seite: keine Region.
    const full: RegionBounds[] = [{ minX: 0, minY: 0, maxX: 1200, maxY: 1697 }];
    assert.equal(findFreeRegions(page[0], page[1], full, { cell: 64 }).length, 0);

    // Kleine Mindestgröße filtert Splitter.
    const tiny = findFreeRegions(800, 800, [{ minX: 0, minY: 0, maxX: 700, maxY: 700 }], { cell: 64, minWidth: 64, minHeight: 64 });
    assert.ok(tiny.length > 0);
    assert.equal(tiny[0].maxX, 800, "rechter Randstreifen bleibt als Region");

    // maxRegions begrenzt die Antwort.
    assert.ok(findFreeRegions(1200, 1697, occupied, { cell: 64, maxRegions: 2 }).length <= 2);
  }

  /* ------------------------- Pending-Queue ------------------------- */

  {
    let now = 1000;
    const queue = new PendingQueue(() => now);

    const a = queue.add("vault-a", "inspect", { pageId: "p1" }, 5000);
    const b = queue.add("vault-b", "propose", { batch: {} }, 5000);
    assert.notEqual(a.id, b.id);

    // Vault-Isolation: nur der eigene Vault sieht seine Pendenzen.
    assert.equal(queue.claim("vault-a")?.id, a.id);
    assert.equal(queue.claim("vault-b")?.id, b.id);
    assert.equal(queue.claim("vault-c"), null, "fremder Vault sieht nichts");

    // Antworten nur im richtigen Vault/Id-Paar.
    assert.equal(queue.resolve("vault-b", a.id, { ok: true }), false, "falsches Vault/Id-Paar");
    assert.equal(queue.resolve("vault-a", a.id, { ok: true, page: { width: 1200 } }), true);
    const result = await a.done;
    assert.deepEqual(result, { ok: true, page: { width: 1200 } });

    // b sauber beenden, damit nur die neue Pende ablaufen kann.
    assert.equal(queue.resolve("vault-b", b.id, { applied: true }), true);

    // Timeout: expire liefert abgelaufene Ids und rejected die Promises.
    const slow = queue.add("vault-b", "inspect", { pageId: "p2" }, 5000);
    now += 6000;
    const expired = queue.expire();
    assert.deepEqual(expired, [slow.id]);
    await assert.rejects(slow.done, /Zeitüberschreitung|timeout/i);
    assert.equal(queue.claim("vault-b"), null, "abgelaufene Pende entfernt");

    // Ablehnung (cancel) erreicht den Wartenden als Fehler.
    const cancelled = queue.add("vault-a", "propose", { batch: { requestId: "req-x" } }, 30000);
    assert.equal(queue.findId("vault-a", (payload) => (payload as { batch?: { requestId?: string } }).batch?.requestId === "req-x"), cancelled.id, "Lookup über Batch-requestId");
    assert.equal(queue.findId("vault-b", () => true), null, "Lookup respektiert den Vault");
    assert.equal(queue.reject("vault-a", cancelled.id, new Error("abgebrochen")), true);
    await assert.rejects(cancelled.done, /abgebrochen/);
  }

  /* ------------------------- Token-Auth ------------------------- */

  {
    const token = generateToken();
    assert.equal(token.length, 64, "32 Bytes hex");
    assert.ok(timingSafeEqual(token, token));
    assert.ok(!timingSafeEqual(token, token.slice(0, 63) + (token[63] === "a" ? "b" : "a")));
    assert.ok(!timingSafeEqual(token, ""));
    assert.equal(generateToken() === token, false, "jede Erzeugung ist frisch");
  }

  /* ------------------------- MCP-stdio-Schleife ------------------------- */

  {
    const tools: McpTool[] = [
      {
        name: "notebook_status",
        description: "Verbindungsstatus der Brücke.",
        inputSchema: { type: "object", properties: {} },
        handler: async () => ({ bridge: "test", vaults: [] }),
      },
      {
        name: "notebook_inspect",
        description: "Seite inspizieren.",
        inputSchema: { type: "object", properties: { pageId: { type: "string" } } },
        handler: async (args) => {
          if (!args || typeof args.pageId !== "string") throw new McpCallError(-32602, "pageId fehlt");
          return { pageId: args.pageId, width: 1200 };
        },
      },
    ];

    async function session(lines: string[]): Promise<Record<string, unknown>[]> {
      const output: string[] = [];
      const input = (async function* () { for (const line of lines) yield line; })();
      await runMcpLoop(tools, input, (line) => output.push(line));
      // Nebenläufige Bearbeitung: kurz einschwingen lassen, dann nach id sortieren.
      await new Promise((resolve) => setTimeout(resolve, 50));
      return output
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .sort((left, right) => Number(left.id ?? 0) - Number(right.id ?? 0));
    }

    {
      // Unbekannte Methode → JSON-RPC-Fehler, Schleife lebt weiter.
      const out = await session([
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "gibt/es/nicht" }),
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      ]);
      const first = out[0] as { error: { code: number } };
      assert.equal(first.error.code, -32601);
      assert.equal((out[1] as { result: { tools: unknown[] } }).result.tools.length, 2);
    }

    {
      // initialize antwortet mit ausgehandelter Protokollversion.
      const out = await session([JSON.stringify({ jsonrpc: "2.0", id: 7, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } })]);
      const result = (out[0] as { result: { protocolVersion: string; capabilities: { tools: Record<string, unknown> } } }).result;
      assert.equal(result.protocolVersion, "2025-11-25");
      assert.ok(result.capabilities.tools);
    }

    {
      // tools/call: Ergebnis als text-Inhalt; Handler-Fehler → JSON-RPC-Fehler.
      const out = await session([
        JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "notebook_inspect", arguments: { pageId: "p1" } } }),
        JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "notebook_inspect", arguments: {} } }),
      ]);
      const ok = (out[0] as { result: { content: { type: string; text: string }[] } }).result;
      assert.equal(ok.content[0].type, "text");
      assert.deepEqual(JSON.parse(ok.content[0].text), { pageId: "p1", width: 1200 });
      const failed = (out[1] as { error: { code: number; message: string } }).error;
      assert.equal(failed.code, -32602);
      assert.match(failed.message, /pageId/);
    }

    {
      // Kaputte Zeile wird übersprungen (stderr-Warnung), gültige Zeile danach beantwortet.
      const out = await session(["das ist kein json", JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list", params: {} })]);
      assert.equal(out.length, 1);
      assert.ok((out[0] as { result: { tools: unknown[] } }).result.tools);
    }

    {
      // Nebenläufigkeit: ein blockierender Aufruf hält andere nicht auf
      // (sonst wäre notebook_cancel während eines offenen Vorschlags tot).
      const tools: McpTool[] = [
        { name: "langsam", description: "", inputSchema: {}, handler: async () => { await new Promise((resolve) => setTimeout(resolve, 120)); return { langsam: true }; } },
        { name: "schnell", description: "", inputSchema: {}, handler: async () => ({ schnell: true }) },
      ];
      const outputIds: (string | number | undefined)[] = [];
      const input = (async function* () {
        yield JSON.stringify({ jsonrpc: "2.0", id: 50, method: "tools/call", params: { name: "langsam", arguments: {} } });
        yield JSON.stringify({ jsonrpc: "2.0", id: 51, method: "tools/call", params: { name: "schnell", arguments: {} } });
      })();
      await runMcpLoop(tools, input, (line) => outputIds.push((JSON.parse(line) as { id: number }).id));
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.deepEqual(outputIds, [51, 50], "schnelle Antwort trotz blockiertem ersten Aufruf, Antworten per id zuordenbar");
    }

    {
      // Notifications (ohne id) werden nie beantwortet.
      const out = await session([JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })]);
      assert.equal(out.length, 0);
    }
  }

  console.log("MCP-Companion Vertragstests bestanden");
}

main().catch((error) => { console.error(error); process.exit(1); });
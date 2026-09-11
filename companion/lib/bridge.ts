/*
 * Companion-Bridge: auf der einen Seite Standard-MCP (stdio) für den Agenten,
 * auf der anderen ein Loopback-HTTP-Kanal (nur 127.0.0.1) für das Plugin.
 *
 * Sicherheit: Server bindet ausschließlich an localhost; jede Plugin-Anfrage
 * braucht das geteilte Token; Pendenzen sind an ihren Vault gebunden (fremde
 * Vaults können sie weder sehen noch beantworten). Der Kanal ist standardmäßig
 * AUS — er existiert nur, wenn die Bridge gestartet wird UND das Plugin den
 * Zugriff in den Einstellungen aktiviert hat.
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "./auth";
import { PendingQueue } from "./pending";
import { findFreeRegions, RegionBounds } from "./free-regions";
import { McpTool } from "./mcp";

export interface VaultState {
  vaultId: string;
  info: Record<string, unknown>;
  connectedAt: number;
  lastSeen: number;
}

export interface BridgeOptions {
  port?: number;
  token: string;
  inspectTimeoutMs?: number;
  proposeTimeoutMs?: number;
}

export interface BridgeHandle {
  port: number;
  tools: McpTool[];
  status(): { port: number; vaultCount: number; pendingCount: number };
  close(): Promise<void>;
}

interface InspectElement {
  id: string;
  type: string;
  bounds?: RegionBounds;
  label?: string;
}

export interface InspectResult {
  pageId: string;
  width: number;
  height: number;
  paper: string;
  revision: number;
  elementCount: number;
  elements: InspectElement[];
  freeRegions: RegionBounds[];
}

export function startBridge(options: BridgeOptions): Promise<BridgeHandle> {
  const token = options.token;
  const inspectTimeoutMs = options.inspectTimeoutMs ?? 20_000;
  const proposeTimeoutMs = options.proposeTimeoutMs ?? 300_000;
  const pending = new PendingQueue();
  const vaults = new Map<string, VaultState>();
  // Pendenzen auch ohne eingehende Polls abladen lassen (Plugin geschlossen,
  // Agent wartet): verhindert ewiges Hängen des Agenten-Werkzeugaufrufs.
  const expiryTimer: NodeJS.Timeout = setInterval(() => pending.expire(), 1_000);
  expiryTimer.unref();

  const readBody = (request: IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) { request.destroy(); reject(new Error("Anfrage zu groß")); }
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });

  const json = (response: ServerResponse, status: number, payload: unknown): void => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  };

  const requireVault = (vaultId: unknown): string | null => {
    if (typeof vaultId !== "string" || vaultId.length === 0 || vaultId.length > 200 || !vaults.has(vaultId)) return null;
    vaults.get(vaultId)!.lastSeen = Date.now();
    return vaultId;
  };

  const tools: McpTool[] = [
    {
      name: "notebook_status",
      description: "Verbindungsstatus der Bridge: verbundene Obsidian-Vaults und offene Anfragen.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => ({
        bridge: "smooth-handwriting-companion",
        vaults: [...vaults.values()].map((vault) => ({ vaultId: vault.vaultId, agentName: (vault.info?.agentName as string | undefined) ?? null, connectedAt: vault.connectedAt, lastSeen: vault.lastSeen })),
        pending: pending.size(),
      }),
    },
    {
      name: "notebook_inspect",
      description: "Seite eines verbundenen Vaults inspizieren: Identität, Maße, Papier, Revision, Element-Bounds und grobe freie Regionen.",
      inputSchema: {
        type: "object",
        properties: {
          vaultId: { type: "string", description: "Vault-Id aus notebook_status." },
          pageId: { type: "string", description: "Seiten-Id (optional; sonst aktive Seite)." },
        },
        required: ["vaultId"],
      },
      handler: async (args) => {
        const vaultId = requireVault(args?.vaultId);
        if (!vaultId) throw new Error("Vault nicht verbunden oder unbekannt (erst notebook_status prüfen)");
        const pageId = typeof args?.pageId === "string" && args.pageId.length <= 200 ? args.pageId : undefined;
        const request = pending.add<unknown, { pageId?: string }>(vaultId, "inspect", { pageId }, inspectTimeoutMs);
        const raw = await request.done;
        const data = (raw ?? {}) as { ok?: boolean; page?: { width?: number; height?: number; paper?: string; revision?: number; elements?: InspectElement[]; pageId?: string; elementCount?: number }; error?: string };
        if (!data?.ok || !data.page) throw new Error(data?.error ?? "Seite konnte nicht inspiziert werden");
        const page = data.page;
        const bounded = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
        const width = bounded(page.width, 1200);
        const height = bounded(page.height, 1697);
        const occupied: RegionBounds[] = (page.elements ?? [])
          .map((element) => element.bounds)
          .filter((bounds): bounds is RegionBounds => !!bounds && [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite));
        const result: InspectResult = {
          pageId: String(page.pageId ?? ""),
          width, height,
          paper: typeof page.paper === "string" ? page.paper : "grid",
          revision: bounded(page.revision, 0),
          elementCount: bounded(page.elementCount, (page.elements ?? []).length),
          elements: (page.elements ?? []).slice(0, 5_000).map((element) => ({ id: element.id, type: element.type, bounds: element.bounds, label: element.label })),
          freeRegions: findFreeRegions(width, height, occupied, { cell: 64, maxRegions: 12 }),
        };
        return result;
      },
    },
    {
      name: "notebook_propose",
      description: "Einen Batch von Zeichen-Operationen als sichtbaren Vorschlag in die Notiz legen. Der Mensch im Editor nimmt an oder lehnt ab; die Antwort blockiert, bis die Entscheidung vorliegt.",
      inputSchema: {
        type: "object",
        properties: {
          vaultId: { type: "string" },
          pageId: { type: "string" },
          batch: { type: "object", description: "NotebookWriteBatch: requestId, baseRevision, operations[], touch?" },
          origin: { type: "object", description: "Optional: { label } für die Vorschlagsanzeige." },
        },
        required: ["vaultId", "pageId", "batch"],
      },
      handler: async (args) => {
        const vaultId = requireVault(args?.vaultId);
        if (!vaultId) throw new Error("Vault nicht verbunden oder unbekannt (erst notebook_status prüfen)");
        const pageId = args?.pageId;
        const batch = args?.batch;
        if (typeof pageId !== "string" || pageId.length === 0 || pageId.length > 200) throw new Error("pageId ungültig");
        if (!batch || typeof batch !== "object") throw new Error("batch fehlt");
        const candidate = batch as { requestId?: unknown; operations?: unknown };
        if (typeof candidate.requestId !== "string" || candidate.requestId.length === 0 || candidate.requestId.length > 100) throw new Error("batch.requestId ungültig");
        if (!Array.isArray(candidate.operations) || candidate.operations.length === 0 || candidate.operations.length > 200) throw new Error("batch.operations unplausibel");
        const origin = args?.origin && typeof args.origin === "object" ? args.origin as { label?: unknown } : undefined;
        const label = typeof origin?.label === "string" && origin.label.length <= 120 ? origin.label : undefined;
        const request = pending.add<unknown, { pageId: string; batch: unknown; label?: string }>(
          vaultId, "propose", { pageId, batch, label }, proposeTimeoutMs
        );
        const raw = (await request.done) as { ok?: boolean; duplicate?: boolean; applied?: boolean; reason?: string; errors?: unknown; addedIds?: string[]; updatedIds?: string[]; removedIds?: string[] } | undefined;
        if (!raw) throw new Error("Vorschlag ohne Antwort beendet");
        return raw;
      },
    },
    {
      name: "notebook_cancel",
      description: "Eine offene Inspections- oder Vorschlags-Anfrage für einen Vault abbrechen.",
      inputSchema: {
        type: "object",
        properties: { vaultId: { type: "string" }, requestId: { type: "string" } },
        required: ["vaultId", "requestId"],
      },
      handler: async (args) => {
        const vaultId = typeof args?.vaultId === "string" ? args.vaultId : "";
        const requestId = typeof args?.requestId === "string" ? args.requestId : "";
        // Der Agent kennt die Batch-requestId, nicht die interne Pendenzen-UUID.
        const pendingId = pending.findId(vaultId, (payload) => {
          const candidate = payload as { batch?: { requestId?: string } };
          return candidate?.batch?.requestId === requestId;
        });
        if (!pendingId) return { cancelled: false };
        pending.reject(vaultId, pendingId, new Error("Anfrage vom Agenten abgebrochen"));
        return { cancelled: true };
      },
    },
  ];

  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      void (async () => {
        if (request.method !== "POST") { json(response, 405, { error: "Nur POST" }); return; }
        let body: string;
        try { body = await readBody(request); } catch (error) { json(response, 413, { error: String(error) }); return; }

        const parsed = ((): Record<string, unknown> | null => {
          try { const value = JSON.parse(body); return value && typeof value === "object" ? value as Record<string, unknown> : null; } catch { return null; }
        })();
        if (!parsed || typeof parsed.token !== "string" || !timingSafeEqual(parsed.token, token)) {
          json(response, 401, { error: "unauthorized" });
          return;
        }
        const vaultId = typeof parsed.vaultId === "string" ? parsed.vaultId : "";

        switch (request.url) {
          case "/agent/hello": {
            if (!vaultId || vaultId.length > 200) { json(response, 400, { error: "vaultId ungültig" }); return; }
            const existing = vaults.get(vaultId);
            const now = Date.now();
            vaults.set(vaultId, { vaultId, info: (parsed.info && typeof parsed.info === "object" ? parsed.info : {}) as Record<string, unknown>, connectedAt: existing?.connectedAt ?? now, lastSeen: now });
            json(response, 200, { ok: true, pending: pending.size() });
            return;
          }
          case "/agent/poll": {
            const registered = vaults.has(vaultId);
            if (!registered) { json(response, 404, { error: "Vault unbekannt – zuerst /agent/hello" }); return; }
            const claimed = pending.claim(vaultId);
            if (!claimed) { pending.expire(); json(response, 200, { pending: null }); return; }
            json(response, 200, { pending: { id: claimed.id, kind: claimed.kind, payload: claimed.payload } });
            return;
          }
          case "/agent/respond": {
            const registered = vaults.has(vaultId);
            if (!registered) { json(response, 404, { error: "Vault unbekannt" }); return; }
            const id = typeof parsed.id === "string" ? parsed.id : "";
            if ("error" in parsed && typeof parsed.error === "string") {
              json(response, 200, { ok: pending.reject(vaultId, id, new Error(parsed.error)) });
              return;
            }
            json(response, 200, { ok: pending.resolve(vaultId, id, parsed.result ?? {}) });
            return;
          }
          case "/agent/bye": {
            vaults.delete(vaultId);
            json(response, 200, { ok: true });
            return;
          }
          default:
            json(response, 404, { error: "Unbekannter Endpunkt" });
        }
      })();
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") reject(new Error(`Port ${options.port ?? 27855} belegt – läuft die Bridge bereits? (--port ändern)`));
      else reject(error);
    });

    server.listen(options.port ?? 27855, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : options.port ?? 27855;
      resolve({
        port,
        tools,
        status: () => ({ port, vaultCount: vaults.size, pendingCount: pending.size() }),
        close: () => new Promise<void>((done) => { clearInterval(expiryTimer); server.close(() => done()); }),
      });
    });
  });
}
/*
 * Minimale MCP-stdio-Schleife (JSON-RPC 2.0, zeilenweise, UTF-8) für die
 * Companion-Bridge. Implementiert den für Tools nötigen Teil des Standards
 * (Protocol 2025-11-25): initialize, tools/list, tools/call, ping;
 * Notifications bleiben unbeantwortet; unbekannte Methoden ⇒ -32601.
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown> | undefined) => Promise<unknown>;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
}

export class McpCallError extends Error {
  constructor(readonly code: number, message: string) { super(message); }
}

const PROTOCOL_VERSION = "2025-11-25";

function respond(id: JsonRpcMessage["id"], result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function fail(id: JsonRpcMessage["id"], code: number, message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

export async function runMcpLoop(
  tools: McpTool[],
  input: AsyncIterable<string>,
  output: (line: string) => void,
  warn: (message: string) => void = (message) => process.stderr.write(`${message}\n`)
): Promise<void> {
  // Nachrichten werden nebenläufig bearbeitet: Eine blockierende Anfrage
  // (z. B. ein Vorschlag, der auf die menschliche Annahme wartet) darf
  // andere Aufrufe — insbesondere Abbruch — nicht aufhalten. Antworten
  // tragen ihre id und dürfen in beliebiger Reihenfolge kommen.
  const handle = (message: JsonRpcMessage): void => {
    void (async () => {
      try {
        switch (message.method) {
          case "initialize": {
            output(respond(message.id, {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: { tools: {} },
              serverInfo: { name: "smooth-handwriting-companion", version: "0.1.0" },
            }));
            break;
          }
          case "ping":
            output(respond(message.id, {}));
            break;
          case "tools/list":
            output(respond(message.id, {
              tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
            }));
            break;
          case "tools/call": {
            const params = message.params ?? {};
            const name = typeof params.name === "string" ? params.name : "";
            const args = (params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments))
              ? params.arguments as Record<string, unknown>
              : undefined;
            const tool = tools.find((candidate) => candidate.name === name);
            if (!tool) {
              output(fail(message.id, -32601, `Unbekanntes Werkzeug: ${name}`));
              break;
            }
            try {
              const result = await tool.handler(args);
              output(respond(message.id, { content: [{ type: "text", text: JSON.stringify(result) }], isError: false }));
            } catch (error) {
              const code = error instanceof McpCallError ? error.code : -32000;
              output(fail(message.id, code, error instanceof Error ? error.message : String(error)));
            }
            break;
          }
          default:
            // Notifications (ohne id) nie beantworten.
            if (message.id !== undefined) output(fail(message.id, -32601, `Unbekannte Methode: ${String(message.method)}`));
        }
      } catch (error) {
        warn(`Smooth Handwriting Companion: Verarbeitungsfehler ${error instanceof Error ? error.message : String(error)}`);
        if (message.id !== undefined) output(fail(message.id, -32603, "Interner Fehler"));
      }
    })();
  };

  for await (const rawLine of input) {
    const line = rawLine.trim();
    if (!line) continue;
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
      if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
        warn("Smooth Handwriting Companion: ungültige JSON-RPC-Zeile übersprungen");
        continue;
      }
    } catch {
      warn("Smooth Handwriting Companion: nicht lesbare Zeile übersprungen");
      continue;
    }
    handle(message);
  }
}

export function serveMcpStdio(tools: McpTool[]): void {
  process.stdin.setEncoding("utf8");
  const readline = (async function* lines(): AsyncIterable<string> {
    let buffer = "";
    for await (const chunk of process.stdin) {
      buffer += chunk;
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        yield buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
      }
    }
    if (buffer.trim()) yield buffer;
  })();
  void runMcpLoop(tools, readline, (line) => process.stdout.write(`${line}\n`));
}
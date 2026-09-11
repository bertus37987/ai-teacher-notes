/*
 * Smooth Handwriting – MCP-Companion (Desktop).
 *
 * Standard-MCP-Server (stdio) für den Agenten; verbindet sich mit dem
 * Obsidian-Plugin über einen Loopback-HTTP-Kanal (nur 127.0.0.1). Das Plugin
 * bleibt der einzige Ort mit Schreibrechten — die Bridge vermittelt nur.
 *
 * Aufruf: node companion-dist/mcp-bridge.mjs [--port 27855] [--token HEX]
 * Das Token MUSS mit dem Token in den Plugin-Einstellungen übereinstimmen.
 * Ohne --token wird ein frisches Token erzeugt und auf stderr ausgegeben.
 */

import { startBridge } from "./lib/bridge";
import { serveMcpStdio } from "./lib/mcp";
import { generateToken } from "./lib/auth";

function argument(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

const port = Number(argument("--port", "27855"));
const token = argument("--token") ?? generateToken();
// Token und Port immer ausgeben: das Token muss in die Plugin-Einstellungen übertragen werden.
process.stderr.write(`[smooth-handwriting-companion] Token: ${token}\n`);
process.stderr.write(`[smooth-handwriting-companion] Port: ${port} (nur 127.0.0.1)\n`);

void (async () => {
  const bridge = await startBridge({ port, token });
  process.stderr.write(`[smooth-handwriting-companion] Bridge aktiv auf 127.0.0.1:${bridge.port}\n`);
  process.on("SIGINT", () => void bridge.close().then(() => process.exit(0)));
  process.on("SIGTERM", () => void bridge.close().then(() => process.exit(0)));
  serveMcpStdio(bridge.tools);
})().catch((error) => {
  process.stderr.write(`[smooth-handwriting-companion] Start fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
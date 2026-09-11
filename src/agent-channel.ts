/*
 * Agent-Kanal (M2): verbindet das Plugin mit der Companion-Bridge über einen
 * Loopback-HTTP-Kanal (nur 127.0.0.1, geteiltes Token). Das Plugin bleibt der
 * einzige Ort mit Schreibrechten: Inspect-Antworten werden hier aus dem
 * offenen Editor eingesammelt, Proposals gehen als sichtbare Vorschläge an
 * den Editor und werden erst nach menschlicher Annahme über den
 * NotebookCommandService angewendet.
 *
 * Standardmäßig AUS (agentEnabled). Ist die Bridge nicht erreichbar, bleibt
 * der Kanal still — kein Nutzer-Spam, Status nur in den Einstellungen.
 */

import { Notice } from "obsidian";
import type SmoothHandwritingPlugin from "./main";
import type { NotebookWriteBatch } from "./notebook-commands";

export interface AgentPending {
  id: string;
  kind: string;
  payload: { pageId?: string; batch?: NotebookWriteBatch; label?: string };
}

export interface AgentState {
  enabled: boolean;
  connected: boolean;
  pendingCount: number;
  lastError: string | null;
}

/** Ergebnis eines Vorschlags: entweder MCP-Antwort (result) oder Transport-/UI-Fehler (error). */
export type AgentProposalOutcome =
  | { result: Record<string, unknown> }
  | { error: string };

export class AgentChannel {
  private timer: number | null = null;
  private saidHello = false;
  state: AgentState = { enabled: false, connected: false, pendingCount: 0, lastError: null };

  constructor(private readonly plugin: SmoothHandwritingPlugin) {}

  refresh(): void {
    this.stop();
    this.state.enabled = this.plugin.settings.agentEnabled;
    if (!this.plugin.settings.agentEnabled) return;
    const tick = async (): Promise<void> => {
      await this.tick();
      this.timer = window.setTimeout(() => void tick(), 800);
    };
    this.timer = window.setTimeout(() => void tick(), 400);
  }

  stop(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.saidHello = false;
    this.state = { enabled: false, connected: false, pendingCount: 0, lastError: null };
  }

  private get token(): string { return this.plugin.settings.agentToken.trim(); }

  private endpoint(path: string): string {
    return `http://127.0.0.1:${this.plugin.settings.agentPort}${path}`;
  }

  private async post(path: string, body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> | null }> {
    const response = await fetch(this.endpoint(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: this.token, vaultId: this.plugin.agentVaultId(), ...body }),
    });
    let data: Record<string, unknown> | null = null;
    try { data = await response.json() as Record<string, unknown>; } catch { /* leere Antwort */ }
    return { status: response.status, data };
  }

  private async tick(): Promise<void> {
    if (!this.plugin.settings.agentEnabled) return;
    try {
      if (!this.saidHello) {
        const hello = await this.post("/agent/hello", { info: { app: "obsidian", plugin: "smooth-handwriting", pluginVersion: this.plugin.manifest.version } });
        if (hello.status === 401) {
          this.state = { enabled: true, connected: false, pendingCount: 0, lastError: "Token wird von der Bridge abgelehnt – in den Einstellungen prüfen" };
          return;
        }
        if (hello.status !== 200) throw new Error(`Bridge antwortet nicht (${hello.status})`);
        this.saidHello = true;
        this.state.connected = true;
        this.state.lastError = null;
      }
      const poll = await this.post("/agent/poll", {});
      if (poll.status === 404) { this.saidHello = false; return; }
      if (poll.status !== 200) throw new Error(`Bridge antwortet nicht (${poll.status})`);
      this.state.connected = true;
      const pending = (poll.data as { pending?: AgentPending | null } | null)?.pending;
      this.state.pendingCount = pending ? 1 : 0;
      if (pending) await this.handle(pending);
    } catch {
      this.state.connected = false;
      // Kein Notice-Spam: Zustand reicht für die Einstellungsanzeige.
    }
  }

  private async handle(pending: AgentPending): Promise<void> {
    if (pending.kind === "inspect") {
      const inspection = this.plugin.collectAgentInspection(pending.payload?.pageId);
      if (inspection.ok) await this.post("/agent/respond", { id: pending.id, result: { ok: true, page: inspection.page } });
      else await this.post("/agent/respond", { id: pending.id, error: inspection.error });
      return;
    }
    if (pending.kind === "propose") {
      const batch = pending.payload?.batch;
      const label = typeof pending.payload?.label === "string" ? pending.payload.label : null;
      if (!batch) { await this.post("/agent/respond", { id: pending.id, error: "Vorschlag ohne Batch" }); return; }
      const outcome = await this.plugin.proposeAgentBatch(batch, label);
      if (outcome && "error" in outcome && outcome.error) await this.post("/agent/respond", { id: pending.id, error: outcome.error });
      else if (outcome && "result" in outcome) await this.post("/agent/respond", { id: pending.id, result: outcome.result });
      else await this.post("/agent/respond", { id: pending.id, result: { ok: false, applied: false, reason: "keine Antwort" } });
      return;
    }
    await this.post("/agent/respond", { id: pending.id, error: `Unbekannte Anfrageart „${pending.kind}“` });
  }

  /** Sichtbare Nachricht für Nutzeraktionen (Annahme braucht keine Notice – der Editor zeigt den Status). */
  notice(message: string): void { new Notice(`Smooth Handwriting: ${message}`); }
}
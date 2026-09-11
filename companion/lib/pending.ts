/*
 * Pending-Queue für die Brücke: ein externer Agent wartet (MCP-Toolaufruf),
 * bis das Plugin über den Loopback-Kanal antwortet. Jede Pende ist an ihren
 * Vault gebunden — claim/resolve/reject nur mit passender Vault-Id.
 */

import { randomUUID } from "node:crypto";

export interface Pending<TResult = unknown, TPayload = unknown> {
  id: string;
  vaultId: string;
  kind: string;
  payload: TPayload;
  done: Promise<TResult>;
}

interface PendingEntry {
  id: string;
  vaultId: string;
  kind: string;
  payload: unknown;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  expiresAt: number;
}

export class PendingQueue {
  private entries = new Map<string, PendingEntry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  add<TResult, TPayload>(vaultId: string, kind: string, payload: TPayload, timeoutMs: number): Pending<TResult, TPayload> {
    const id = randomUUID();
    const expiresAt = this.now() + timeoutMs;
    let resolve!: (value: TResult) => void;
    let reject!: (error: Error) => void;
    const done = new Promise<TResult>((res, rej) => { resolve = res; reject = rej; });
    this.entries.set(id, { id, vaultId, kind, payload, resolve: resolve as (value: unknown) => void, reject, expiresAt });
    return { id, vaultId, kind, payload, done };
  }

  /** Älteste offene Pende dieses Vaults (payloads bleiben intern). */
  claim(vaultId: string): { id: string; kind: string; payload: unknown } | null {
    let oldest: PendingEntry | null = null;
    for (const entry of this.entries.values()) {
      if (entry.vaultId !== vaultId) continue;
      if (!oldest || entry.expiresAt < oldest.expiresAt) oldest = entry;
    }
    return oldest ? { id: oldest.id, kind: oldest.kind, payload: oldest.payload } : null;
  }

  /** Nur Paare aus eigenem Vault dürfen antworten. */
  resolve(vaultId: string, id: string, result: unknown): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.vaultId !== vaultId) return false;
    this.entries.delete(id);
    entry.resolve(result);
    return true;
  }

  reject(vaultId: string, id: string, error: Error): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.vaultId !== vaultId) return false;
    this.entries.delete(id);
    entry.reject(error);
    return true;
  }

  /** Id des ersten passenden Eintrags dieses Vaults (für Cancel per Batch-requestId). */
  findId(vaultId: string, match: (payload: unknown) => boolean): string | null {
    for (const entry of this.entries.values()) {
      if (entry.vaultId === vaultId && match(entry.payload)) return entry.id;
    }
    return null;
  }

  /** Abgelaufene Pendenzen ablehnen und ihre Ids liefern. */
  expire(): string[] {
    const nowValue = this.now();
    const expired: string[] = [];
    for (const entry of this.entries.values()) {
      if (entry.expiresAt <= nowValue) {
        expired.push(entry.id);
        this.entries.delete(entry.id);
        entry.reject(new Error("Zeitüberschreitung der Brücken-Anfrage"));
      }
    }
    return expired;
  }

  size(): number { return this.entries.size; }
}
import { randomUUID } from "node:crypto";
import { type JsonRpcMessage, classifyMessage } from "./jsonrpc.js";

export type Direction = "client_to_server" | "server_to_client";

export interface TraceEntry {
  id: string;
  timestamp: string;
  direction: Direction;
  jsonrpc_id: number | string | null;
  method: string | null;
  params: Record<string, unknown> | null;
  result: unknown | null;
  error: unknown | null;
  server: string;
  latency_ms: number | null;
  paired_with: string | null;
  status: "ok" | "error" | "timeout" | "pending";
}

const TIMEOUT_MS = 30_000;

export class TraceCollector {
  private pending = new Map<number | string, { entry: TraceEntry; timer: ReturnType<typeof setTimeout> }>();
  private listeners: Array<(entry: TraceEntry) => void> = [];

  constructor(private serverName: string = "default") {}

  onTrace(fn: (entry: TraceEntry) => void): void {
    this.listeners.push(fn);
  }

  private emit(entry: TraceEntry): void {
    for (const fn of this.listeners) fn(entry);
  }

  record(msg: JsonRpcMessage, direction: Direction): TraceEntry {
    const type = classifyMessage(msg);
    const now = new Date().toISOString();

    if (type === "request") {
      const req = msg as { id: number | string; method: string; params?: Record<string, unknown> };
      const entry: TraceEntry = {
        id: randomUUID(),
        timestamp: now,
        direction,
        jsonrpc_id: req.id,
        method: req.method,
        params: req.params ?? null,
        result: null,
        error: null,
        server: this.serverName,
        latency_ms: null,
        paired_with: null,
        status: "pending",
      };

      const timer = setTimeout(() => {
        this.pending.delete(req.id);
        entry.status = "timeout";
        entry.latency_ms = TIMEOUT_MS;
        this.emit(entry);
      }, TIMEOUT_MS);

      this.pending.set(req.id, { entry, timer });
      this.emit(entry);
      return entry;
    }

    if (type === "response") {
      const res = msg as { id: number | string; result?: unknown; error?: unknown };
      const pendingReq = this.pending.get(res.id);

      // Detect MCP tool-level errors: result.isError === true means the tool
      // itself failed even though the JSON-RPC call succeeded.
      const isToolError =
        !res.error &&
        res.result !== null &&
        typeof res.result === "object" &&
        (res.result as Record<string, unknown>).isError === true;

      const entry: TraceEntry = {
        id: randomUUID(),
        timestamp: now,
        direction,
        jsonrpc_id: res.id,
        method: null,
        params: null,
        result: res.result ?? null,
        error: res.error ?? null,
        server: this.serverName,
        latency_ms: null,
        paired_with: null,
        status: res.error || isToolError ? "error" : "ok",
      };

      if (pendingReq) {
        clearTimeout(pendingReq.timer);
        this.pending.delete(res.id);
        entry.paired_with = pendingReq.entry.id;
        entry.method = pendingReq.entry.method;
        entry.latency_ms = new Date(now).getTime() - new Date(pendingReq.entry.timestamp).getTime();
        pendingReq.entry.paired_with = entry.id;
        pendingReq.entry.latency_ms = entry.latency_ms;
        pendingReq.entry.status = entry.status;
      }

      this.emit(entry);
      return entry;
    }

    // Notification
    const notif = msg as { method: string; params?: Record<string, unknown> };
    const entry: TraceEntry = {
      id: randomUUID(),
      timestamp: now,
      direction,
      jsonrpc_id: null,
      method: notif.method,
      params: notif.params ?? null,
      result: null,
      error: null,
      server: this.serverName,
      latency_ms: null,
      paired_with: null,
      status: "ok",
    };
    this.emit(entry);
    return entry;
  }

  destroy(): void {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.listeners = [];
  }
}

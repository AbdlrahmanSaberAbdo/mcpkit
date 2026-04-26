import { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";
import { JsonRpcParser, serialize, type JsonRpcMessage } from "./jsonrpc.js";
import { TraceCollector, type Direction, type TraceEntry } from "./trace.js";

export type MiddlewareFn = (
  msg: JsonRpcMessage,
  direction: Direction,
) => JsonRpcMessage | null | Promise<JsonRpcMessage | null>;

export interface InterceptorOptions {
  serverName?: string;
}

/**
 * Bidirectional message interceptor that sits between a client and server,
 * parsing JSON-RPC messages, running middleware, emitting traces, and
 * forwarding messages transparently.
 */
export class Interceptor extends EventEmitter {
  private middleware: MiddlewareFn[] = [];
  private tracer: TraceCollector;
  private clientParser: JsonRpcParser;
  private serverParser: JsonRpcParser;

  constructor(
    private clientIn: Readable,
    private serverOut: Writable,
    private serverIn: Readable,
    private clientOut: Writable,
    opts: InterceptorOptions = {},
  ) {
    super();
    this.tracer = new TraceCollector(opts.serverName ?? "default");
    this.clientParser = new JsonRpcParser();
    this.serverParser = new JsonRpcParser();

    this.tracer.onTrace((entry) => this.emit("trace", entry));
  }

  use(fn: MiddlewareFn): void {
    this.middleware.push(fn);
  }

  onTrace(fn: (entry: TraceEntry) => void): void {
    this.tracer.onTrace(fn);
  }

  start(): void {
    // Client -> Server direction
    this.clientIn.pipe(this.clientParser);
    this.clientParser.on("data", async (msg: JsonRpcMessage) => {
      const processed = await this.runMiddleware(msg, "client_to_server");
      if (!processed) return;
      this.tracer.record(processed, "client_to_server");
      this.serverOut.write(serialize(processed));
    });

    // Server -> Client direction
    this.serverIn.pipe(this.serverParser);
    this.serverParser.on("data", async (msg: JsonRpcMessage) => {
      const processed = await this.runMiddleware(msg, "server_to_client");
      if (!processed) return;
      this.tracer.record(processed, "server_to_client");
      this.clientOut.write(serialize(processed));
    });

    // Propagate stream errors
    for (const stream of [this.clientIn, this.serverIn]) {
      stream.on("error", (err) => this.emit("error", err));
    }
    this.clientIn.on("end", () => this.emit("close"));
    this.serverIn.on("end", () => this.emit("close"));
  }

  private async runMiddleware(
    msg: JsonRpcMessage,
    direction: Direction,
  ): Promise<JsonRpcMessage | null> {
    let current: JsonRpcMessage | null = msg;
    for (const fn of this.middleware) {
      if (!current) return null;
      current = await fn(current, direction);
    }
    return current;
  }

  destroy(): void {
    this.tracer.destroy();
    this.clientParser.destroy();
    this.serverParser.destroy();
    this.removeAllListeners();
  }
}

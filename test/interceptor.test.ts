import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { Interceptor } from "../src/core/interceptor.js";
import { serialize } from "../src/core/jsonrpc.js";
import type { TraceEntry } from "../src/core/trace.js";

function createPair() {
  return {
    clientIn: new PassThrough(),
    serverOut: new PassThrough(),
    serverIn: new PassThrough(),
    clientOut: new PassThrough(),
  };
}

describe("Interceptor", () => {
  it("forwards client messages to server", async () => {
    const streams = createPair();
    const interceptor = new Interceptor(
      streams.clientIn,
      streams.serverOut,
      streams.serverIn,
      streams.clientOut,
    );

    const received: string[] = [];
    streams.serverOut.on("data", (chunk: Buffer) => received.push(chunk.toString()));

    interceptor.start();

    const msg = { jsonrpc: "2.0" as const, id: 1, method: "tools/list" };
    streams.clientIn.write(serialize(msg));

    await new Promise((r) => setTimeout(r, 50));

    expect(received.length).toBe(1);
    expect(JSON.parse(received[0].trim())).toEqual(msg);

    interceptor.destroy();
  });

  it("forwards server messages to client", async () => {
    const streams = createPair();
    const interceptor = new Interceptor(
      streams.clientIn,
      streams.serverOut,
      streams.serverIn,
      streams.clientOut,
    );

    const received: string[] = [];
    streams.clientOut.on("data", (chunk: Buffer) => received.push(chunk.toString()));

    interceptor.start();

    const msg = { jsonrpc: "2.0" as const, id: 1, result: { content: [] } };
    streams.serverIn.write(serialize(msg));

    await new Promise((r) => setTimeout(r, 50));

    expect(received.length).toBe(1);
    expect(JSON.parse(received[0].trim())).toEqual(msg);

    interceptor.destroy();
  });

  it("emits trace events for each message", async () => {
    const streams = createPair();
    const interceptor = new Interceptor(
      streams.clientIn,
      streams.serverOut,
      streams.serverIn,
      streams.clientOut,
      { serverName: "test-server" },
    );

    const traces: TraceEntry[] = [];
    interceptor.on("trace", (entry: TraceEntry) => traces.push(entry));

    interceptor.start();

    streams.clientIn.write(serialize({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search" } }));
    await new Promise((r) => setTimeout(r, 50));

    streams.serverIn.write(serialize({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } }));
    await new Promise((r) => setTimeout(r, 50));

    expect(traces.length).toBe(2);
    expect(traces[0].direction).toBe("client_to_server");
    expect(traces[0].method).toBe("tools/call");
    expect(traces[0].server).toBe("test-server");
    expect(traces[1].direction).toBe("server_to_client");
    expect(traces[1].latency_ms).toBeGreaterThanOrEqual(0);

    interceptor.destroy();
  });

  it("supports middleware that can modify messages", async () => {
    const streams = createPair();
    const interceptor = new Interceptor(
      streams.clientIn,
      streams.serverOut,
      streams.serverIn,
      streams.clientOut,
    );

    interceptor.use((msg, direction) => {
      if (direction === "client_to_server" && "params" in msg) {
        return { ...msg, params: { ...(msg.params as Record<string, unknown>), injected: true } };
      }
      return msg;
    });

    const received: string[] = [];
    streams.serverOut.on("data", (chunk: Buffer) => received.push(chunk.toString()));

    interceptor.start();

    streams.clientIn.write(serialize({ jsonrpc: "2.0", id: 1, method: "test", params: { original: true } }));
    await new Promise((r) => setTimeout(r, 50));

    const parsed = JSON.parse(received[0].trim());
    expect(parsed.params.injected).toBe(true);
    expect(parsed.params.original).toBe(true);

    interceptor.destroy();
  });
});

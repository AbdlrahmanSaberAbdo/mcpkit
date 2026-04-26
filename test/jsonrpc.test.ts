import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { JsonRpcParser, classifyMessage, serialize } from "../src/core/jsonrpc.js";
import type { JsonRpcMessage } from "../src/core/jsonrpc.js";

describe("classifyMessage", () => {
  it("identifies a request", () => {
    const msg = { jsonrpc: "2.0" as const, id: 1, method: "tools/call", params: {} };
    expect(classifyMessage(msg)).toBe("request");
  });

  it("identifies a response with result", () => {
    const msg = { jsonrpc: "2.0" as const, id: 1, result: { content: [] } };
    expect(classifyMessage(msg)).toBe("response");
  });

  it("identifies a response with error", () => {
    const msg = { jsonrpc: "2.0" as const, id: 1, error: { code: -32600, message: "bad" } };
    expect(classifyMessage(msg)).toBe("response");
  });

  it("identifies a notification", () => {
    const msg = { jsonrpc: "2.0" as const, method: "notifications/tools/list_changed" };
    expect(classifyMessage(msg)).toBe("notification");
  });
});

describe("serialize", () => {
  it("produces newline-delimited JSON", () => {
    const msg = { jsonrpc: "2.0" as const, id: 1, method: "test" };
    const result = serialize(msg);
    expect(result).toBe(JSON.stringify(msg) + "\n");
  });
});

describe("JsonRpcParser", () => {
  it("parses newline-delimited JSON-RPC messages", async () => {
    const messages: JsonRpcMessage[] = [];
    const parser = new JsonRpcParser();
    parser.on("data", (msg: JsonRpcMessage) => messages.push(msg));

    const input = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "test" } }),
    ].join("\n") + "\n";

    const readable = Readable.from([input]);
    readable.pipe(parser);

    await new Promise<void>((resolve) => parser.on("end", resolve));

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(messages[1]).toEqual({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "test" } });
  });

  it("skips malformed lines", async () => {
    const messages: JsonRpcMessage[] = [];
    const parser = new JsonRpcParser();
    parser.on("data", (msg: JsonRpcMessage) => messages.push(msg));

    const input = 'not json\n{"jsonrpc":"2.0","id":1,"method":"test"}\n';
    const readable = Readable.from([input]);
    readable.pipe(parser);

    await new Promise<void>((resolve) => parser.on("end", resolve));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ jsonrpc: "2.0", id: 1, method: "test" });
  });

  it("handles chunked input across multiple writes", async () => {
    const messages: JsonRpcMessage[] = [];
    const parser = new JsonRpcParser();
    parser.on("data", (msg: JsonRpcMessage) => messages.push(msg));

    const full = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "test" });
    const chunk1 = full.slice(0, 10);
    const chunk2 = full.slice(10) + "\n";

    const readable = Readable.from([chunk1, chunk2]);
    readable.pipe(parser);

    await new Promise<void>((resolve) => parser.on("end", resolve));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ jsonrpc: "2.0", id: 1, method: "test" });
  });
});

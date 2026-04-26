---
name: mcpkit-core
description: Work with the mcpkit core layer: JSON-RPC parsing, bidirectional interceptor, and trace collection. Use when adding middleware, modifying the trace format, debugging MCP protocol issues, adding new trace fields, or extending the interceptor's message pipeline.
---

# mcpkit Core Layer

## Architecture

```
stdin (client)
    │
    ▼
JsonRpcParser           ← Transform stream: newline-delimited → parsed objects
    │
    ▼
Interceptor             ← Runs middleware chain; emits TraceEntry events
    │
    ├─► TraceCollector  ← Pairs requests with responses, computes latency, handles timeout (30s)
    │
    ▼
proc.stdin (server)     ← Serialised back to newline-delimited JSON
```

The server → client path is symmetric: `proc.stdout → serverParser → Interceptor → process.stdout`.

## Key Types

`src/core/jsonrpc.ts`
- `JsonRpcMessage` = `JsonRpcRequest | JsonRpcResponse | JsonRpcNotification`
- `classifyMessage(msg)` → `"request" | "response" | "notification"`
- `JsonRpcParser extends Transform` — object-mode output, buffers across chunks

`src/core/trace.ts`
- `TraceEntry` — one record per message with `id`, `timestamp`, `direction`, `method`, `params`, `result`, `error`, `latency_ms`, `paired_with`, `status`
- `TraceCollector` — `record(msg, direction)` → emits the entry via `onTrace(fn)` listener
- Requests are held in `pending` Map until a matching response arrives or the 30 s timeout fires

`src/core/interceptor.ts`
- `MiddlewareFn = (msg, direction) => JsonRpcMessage | null | Promise<...>`
  - Return `null` to drop the message; return modified msg to transform it
- `interceptor.use(fn)` — append middleware
- `interceptor.on("trace", fn)` — subscribe to completed TraceEntries
- `interceptor.start()` — wire streams; call once

## Adding Middleware

```ts
interceptor.use(async (msg, direction) => {
  if (direction === "client_to_server" && "method" in msg && msg.method === "tools/call") {
    // inspect or mutate msg.params here
  }
  return msg; // or null to drop
});
```

## Adding a TraceEntry Field

1. Add the field to the `TraceEntry` interface in `src/core/trace.ts`
2. Populate it in all three branches of `TraceCollector.record()` (request / response / notification)
3. Update `src/inspector/dashboard/app.js` to render the new field if needed

## Adding a New Direction Type

`Direction` is currently `"client_to_server" | "server_to_client"`. To add a third (e.g. internal), extend the union, then update the `Interceptor.start()` stream wiring and `TraceCollector.record()`.

## Testing Patterns (Vitest)

```ts
import { JsonRpcParser, serialize } from "../../src/core/jsonrpc.js";
import { Readable } from "node:stream";

test("parser emits objects", async () => {
  const parser = new JsonRpcParser();
  const messages: unknown[] = [];
  parser.on("data", (m) => messages.push(m));
  parser.write(serialize({ jsonrpc: "2.0", id: 1, method: "ping" }));
  await new Promise((r) => setTimeout(r, 10));
  expect(messages).toHaveLength(1);
});
```

See `test/interceptor.test.ts` and `test/jsonrpc.test.ts` for full patterns.

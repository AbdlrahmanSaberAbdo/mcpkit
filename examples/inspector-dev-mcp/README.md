# inspector-dev-mcp

Minimal MCP server for manually testing **mcpkit inspector**: masking, long-string truncation, large JSON preview/download, and virtual scrolling in the trace table.

| Tool | What it exercises |
|------|-------------------|
| **`echo_sensitive`** | Params/results with `api_key`, optional `password` / `bearer_token` → **Mask sensitive** in the dashboard |
| **`long_text_field`** | Optional `repeat` (default ~1200) → **long-string truncation** when masking is on |
| **`large_json_response`** | Optional `approxSerializedBytes` (default ~70k serialized) → **compact toolbar** (Download / Expand) under **Response** in the inspector — only triggers when serialized JSON exceeds mcpkit’s threshold (~56 KiB). Scroll the detail panel if needed. |

**Note:** Small tools like `echo_sensitive` stay **below** that size, so you only see syntax-highlighted JSON — no compact toolbar until you call **`large_json_response`** (or similar huge payloads).

This folder is **source-only**: run `npm install` and `npm run build` locally (`dist/` is gitignored). Do not commit `node_modules/`.

## Setup

```bash
cd examples/inspector-dev-mcp
npm install
npm run build
```

Develop without a separate compile step:

```bash
npm run dev
```

(stdio MCP — you must attach a client such as Cursor or `mcpkit inspect`. Running `npm run dev` alone only waits on stdin.)

## Terminal: `mcpkit inspect`

Paths are relative to your **shell’s current working directory**.

From the **mcpkit repo root**:

```bash
mcpkit inspect -- node examples/inspector-dev-mcp/dist/index.js
```

If your cwd is **`.../mcpkit/examples/`**, omit the leading `examples/`:

```bash
mcpkit inspect -- node inspector-dev-mcp/dist/index.js
```

From repo root using **tsx** (no `npm run build` required):

```bash
mcpkit inspect -- npx tsx examples/inspector-dev-mcp/src/index.ts
```

Stderr prints the dashboard URL; open it and drive tools from your MCP client.

### Many trace rows (virtual scroll)

Use **All messages** and repeat tool calls (or call **`large_json_response`** several times).

## Cursor `~/.cursor/mcp.json`

### Inspector dashboard + Cursor (recommended for debugging)

Use absolute paths. Replace with your clone path.

```json
{
  "mcpServers": {
    "inspector-dev-mcp": {
      "command": "mcpkit",
      "args": [
        "inspect",
        "--server-name",
        "inspector-dev-mcp",
        "--",
        "node",
        "/ABS/PATH/mcpkit/examples/inspector-dev-mcp/dist/index.js"
      ]
    }
  }
}
```

Optional: drop `--server-name` … if you do not care about the **Server** column label (defaults to `default`).

### Server only (no mcpkit dashboard)

```json
{
  "mcpServers": {
    "inspector-dev-mcp": {
      "command": "node",
      "args": ["/ABS/PATH/mcpkit/examples/inspector-dev-mcp/dist/index.js"]
    }
  }
}
```

Reload MCP in Cursor after edits. Re-run **`npm run build`** in this folder when you change `src/` before relying on `dist/index.js`.

## Scaffold from YAML

Same tool names via `mcpkit init`:

```bash
# from mcpkit repo root
mcpkit init --from examples/inspector-dev-mcp/inspector-dev-mcp.yaml --output /tmp/inspector-dev-copy
```

Compare generated stubs with `src/index.ts` here if needed.

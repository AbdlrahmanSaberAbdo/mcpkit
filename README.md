# mcpkit

MCP Developer Toolkit — scaffold, proxy, and inspect MCP servers.

MCP (Model Context Protocol) is the standard interface between AI agents and tools. mcpkit gives you the developer tooling that's been missing: generate MCP servers from config files, debug tool calls in real-time, and proxy traffic for inspection.

## Install

```bash
npm install -g mcpkit
# or use directly
npx mcpkit --help
```

Requires Node.js 20+.

## Commands

### `mcpkit init` — Scaffold an MCP Server

Generate a complete MCP server project from a YAML config or OpenAPI spec.

```bash
# From a YAML config
mcpkit init --from config.yaml

# From an OpenAPI spec
mcpkit init --from openapi.yaml --format openapi

# Preview without writing
mcpkit init --from config.yaml --dry-run

# HTTP transport instead of stdio
mcpkit init --from config.yaml --transport http
```

**YAML config format:**

```yaml
name: my-api-server
transport: stdio
tools:
  - name: get_user
    description: Get user by ID
    params:
      id:
        type: string
        required: true
  - name: list_orders
    description: List orders for a user
    params:
      user_id:
        type: string
        required: true
      limit:
        type: integer
        default: 10
```

This generates a ready-to-run TypeScript MCP server with typed handler stubs. Edit the handlers in `src/tools/`, run `npm install && npm run dev`.

### `mcpkit proxy` — Transparent MCP Proxy

Sit between an MCP client and server, logging all JSON-RPC traffic.

```bash
# Wrap a server command
mcpkit proxy -- node my-server.js

# Output NDJSON traces
mcpkit proxy --json -- node my-server.js

# Forward traces to inspector
mcpkit proxy --inspector ws://localhost:3200/ws/ingest -- node my-server.js
```

Output (stderr):

```
[mcpkit] proxy started for: node my-server.js
[10:15:30] → tools/call search_repos (333ms) ✓
[10:15:31] → tools/call query_db (120ms) ✓
[10:15:32] → tools/call deploy (—) ✗
```

### `mcpkit inspect` — Real-Time Debug Dashboard

Proxy + browser-based inspector for MCP traffic. Real-time visibility into every tool call, latency, and request/response payload.

```bash
# Inspect a server (opens browser dashboard)
mcpkit inspect -- node my-server.js

# Custom port
mcpkit inspect --port 3201 -- node my-server.js

# Terminal only (no browser)
mcpkit inspect --log-only -- node my-server.js

# Export traces to file on exit
mcpkit inspect --export traces.json -- node my-server.js
```

The dashboard shows:
- Live stream of all tool calls with method, tool name, latency, and status
- Click any row to see full request/response JSON
- Filter by method, status, or direction
- Search across tool names and arguments
- Color-coded: green = success, red = error, yellow = slow, gray = notification

![mcpkit inspector dashboard](https://github.com/user-attachments/assets/07278d77-9abe-45d7-896e-4ac777a34cf2)

Use the **Tools only** filter to hide protocol noise and focus on real tool calls:

![mcpkit inspector tools only filter](https://github.com/user-attachments/assets/d4dd531d-5312-451c-93de-6d7438ee2625)

### `mcpkit serve` — Shared Inspector Dashboard

Start a standalone dashboard that accepts traces from multiple MCP servers at once. No server to wrap — all MCP servers proxy their traces here.

```bash
# Start the shared dashboard (keep this terminal open)
mcpkit serve

# Custom port
mcpkit serve --port 3201
```

Output:
```
[mcpkit] inspector dashboard: http://localhost:3200
[mcpkit] waiting for proxy connections on ws://localhost:3200/ws/ingest
```

Then configure each MCP server with `--inspector` to stream traces into it:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcpkit",
      "args": ["proxy", "--server-name", "my-server", "--inspector", "ws://localhost:3200/ws/ingest", "--", "node", "my-server.js"]
    },
    "other-server": {
      "command": "mcpkit",
      "args": ["proxy", "--server-name", "other-server", "--inspector", "ws://localhost:3200/ws/ingest", "--", "node", "other-server.js"]
    }
  }
}
```

The dashboard shows a **Server** column so you can tell which MCP each call came from, and a **Server filter** to focus on one at a time.

## Use with Cursor / Claude Desktop

Add mcpkit as a proxy wrapper in your MCP config:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcpkit",
      "args": ["proxy", "--", "node", "my-server.js"]
    }
  }
}
```

Or for inspection:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcpkit",
      "args": ["inspect", "--log-only", "--export", "traces.json", "--", "node", "my-server.js"]
    }
  }
}
```

## Development

```bash
git clone https://github.com/your-org/mcpkit
cd mcpkit
npm install
npm run dev     # watch mode
npm test        # run tests
npm run build   # production build
```

## License

MIT

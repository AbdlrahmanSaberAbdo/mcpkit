# scaffold-from-yaml — mcpkit Example

This example shows how to scaffold a fully-typed TypeScript MCP server from a
single YAML definition file using `mcpkit init`.

Two example YAML definitions are provided:

| File | Description |
|---|---|
| `influxdb-server.yaml` | MCP server for InfluxDB v2 time-series data |
| `postgresql-server.yaml` | MCP server for PostgreSQL (schema discovery + querying) |

---

## Files

```
scaffold-from-yaml/
├── influxdb-server.yaml      ← mcpkit definition for InfluxDB
├── postgresql-server.yaml    ← mcpkit definition for PostgreSQL
├── README.md
├── influxdb-server/          ← generated skeleton (run mcpkit init to create)
└── postgresql-server/        ← generated skeleton (run mcpkit init to create)
```

---

## Step 1 — Scaffold the server

Run this once from the `scaffold-from-yaml/` directory:

```bash
mcpkit init --from influxdb-server.yaml --output influxdb-server
```

Expected output:
```
[mcpkit] Scaffolding MCP server "influxdb-server"
[mcpkit] Created influxdb-server/package.json
[mcpkit] Created influxdb-server/tsconfig.json
[mcpkit] Created influxdb-server/mcpkit.yaml
[mcpkit] Created influxdb-server/src/index.ts
[mcpkit] Created influxdb-server/src/tools/test_connection.ts
[mcpkit] Created influxdb-server/src/tools/list_buckets.ts
[mcpkit] Created influxdb-server/src/tools/list_measurements.ts
[mcpkit] Created influxdb-server/src/tools/execute_flux_query.ts
[mcpkit] Created influxdb-server/src/tools/compute_daily_hourly_average.ts
[mcpkit] Created influxdb-server/src/tools/find_suspiciously_low_values.ts
[mcpkit] Done. Next: cd influxdb-server && npm install
```

## Step 2 — Install dependencies

```bash
cd influxdb-server
npm install
```

## Step 3 — Implement the tool handlers

Every tool gets its own file under `src/tools/`. Each file exports a single
`handle_<tool_name>` function with typed parameters. The `src/index.ts` wires
them to the MCP server automatically — **you only edit the handler files**.

Example — `src/tools/list_buckets.ts` before implementation:

```typescript
export async function handle_list_buckets(params: {}) {
  // TODO: implement list_buckets
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ message: "TODO" }) }],
  };
}
```

After implementation (using the `@influxdata/influxdb-client` package):

```typescript
import { InfluxDB } from "@influxdata/influxdb-client";
import { OrgsAPI } from "@influxdata/influxdb-client-apis";

const client = new InfluxDB({ url: process.env.INFLUXDB_URL!, token: process.env.INFLUXDB_TOKEN! });

export async function handle_list_buckets(params: {}) {
  const orgsAPI = new OrgsAPI(client);
  const buckets = await client.getBucketsAPI().getBuckets({ orgID: process.env.INFLUXDB_ORG_ID });
  return {
    content: [{ type: "text" as const, text: JSON.stringify(buckets.buckets) }],
  };
}
```

Repeat for each handler in `src/tools/`.

## Step 4 — Set environment variables

The server needs these environment variables at runtime:

```bash
export INFLUXDB_URL=http://localhost:8086
export INFLUXDB_TOKEN=your-token-here
export INFLUXDB_ORG=your-org
export INFLUXDB_ORG_ID=your-org-id
```

## Step 5 — Run the server

**During development** (no build step needed):

```bash
npm run dev
```

**For production** (compile first):

```bash
npm run build
npm start
```

## Step 6 — Inspect traffic with mcpkit

Start the shared dashboard in a separate terminal:

```bash
mcpkit serve
# [mcpkit] inspector dashboard: http://localhost:3200
```

Then wrap the server with `mcpkit proxy` so all tool calls appear in the
dashboard:

```bash
mcpkit proxy --server-name influxdb-server --inspector ws://localhost:3200/ws/ingest -- npm run dev
```

Or configure it in your Cursor `mcp.json`:

```json
{
  "mcpServers": {
    "influxdb-server": {
      "command": "mcpkit",
      "args": [
        "proxy",
        "--server-name", "influxdb-server",
        "--inspector", "ws://localhost:3200/ws/ingest",
        "--",
        "node", "influxdb-server/dist/index.js"
      ],
      "env": {
        "INFLUXDB_URL": "http://localhost:8086",
        "INFLUXDB_TOKEN": "your-token-here",
        "INFLUXDB_ORG": "your-org"
      }
    }
  }
}
```

Open `http://localhost:3200` to see every tool call with latency, request
params, and response payload in real time.

---

## Re-generating after YAML changes

If you add or update tools in a YAML definition, re-run `mcpkit init`.
It only creates files that do not already exist — existing handler
implementations are never overwritten.

---

## PostgreSQL example

`postgresql-server.yaml` scaffolds an MCP server with tools for:

| Tool | Description |
|---|---|
| `test_connection` | Server version and connection status |
| `list_schemas` | All non-system schemas in the database |
| `list_tables` | Tables in a schema with row estimates and size |
| `describe_table` | Column types, nullability, and constraints |
| `list_indexes` | Indexes on a table (type, columns, unique) |
| `execute_query` | Read-only SELECT queries (non-SELECT rejected) |
| `explain_query` | EXPLAIN ANALYZE with cost and timing |
| `get_table_stats` | Live pg_stat_user_tables stats |
| `get_slow_queries` | Top N queries from pg_stat_statements |
| `get_database_size` | Size per database and per table |

### Scaffold and run

```bash
mcpkit init --from postgresql-server.yaml --output postgresql-server
cd postgresql-server
npm install
```

Set environment variables:

```bash
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=mydb
export PGUSER=myuser
export PGPASSWORD=mypassword
```

Add the recommended client package to `package.json` then implement each handler:

```bash
npm install pg @types/pg
```

Example — `src/tools/execute_query.ts` after implementation:

```typescript
import { Pool } from "pg";

const pool = new Pool(); // reads PG* env vars automatically

export async function handle_execute_query(params: {
  sql: string;
  limit?: number;
}) {
  if (!/^\s*SELECT/i.test(params.sql)) {
    throw new Error("Only SELECT statements are allowed");
  }
  const limitedSql = `${params.sql} LIMIT ${params.limit ?? 100}`;
  const result = await pool.query(limitedSql);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result.rows) }],
  };
}
```

Run with mcpkit proxy (same as the InfluxDB example):

```bash
mcpkit proxy \
  --server-name postgresql-server \
  --inspector ws://localhost:3200/ws/ingest \
  -- npm run dev
```

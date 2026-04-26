---
name: mcpkit-dev-workflow
description: Development workflow for mcpkit: build, test, run the CLI locally, add a new CLI command, extend the inspector dashboard, or work with the ProcessManager. Use when setting up the dev environment, running or writing tests, adding commands, debugging the CLI, or understanding the project build pipeline.
---

# mcpkit Dev Workflow

## Commands

```bash
npm run dev       # tsup --watch (rebuilds dist/ on save)
npm run build     # production build → dist/
npm test          # vitest run (single pass)
npm run test:watch # vitest interactive
npm run lint      # tsc --noEmit (type-check only, no emit)
```

## Build Output

tsup entry: `bin/mcpkit.ts` → `dist/bin/mcpkit.js`

After build, `tsup.config.ts` copies:
- `src/inspector/dashboard/` → `dist/dashboard/`
- `src/scaffolder/templates/` → `dist/templates/`

**Important**: static assets (dashboard HTML/CSS/JS, EJS templates) are NOT bundled — they are copied as-is. If you add a new template or dashboard file, add a `cpSync` call in `tsup.config.ts` `onSuccess`.

## Running Locally (without install)

```bash
npm run build
node dist/bin/mcpkit.js --help
node dist/bin/mcpkit.js proxy -- node some-server.js
node dist/bin/mcpkit.js init --from test/fixtures/sample-config.yaml --dry-run
```

## Directory Structure

```
bin/          # CLI entry point (mcpkit.ts → createCli().parse())
src/
  cli/        # Command registrations (init.ts, proxy.ts, inspect.ts, index.ts)
  core/       # JSON-RPC, Interceptor, Trace, ProcessManager
  inspector/  # InspectorServer (HTTP + WS), RingBuffer, dashboard static files
  scaffolder/ # YAML/OpenAPI parsers, generator, EJS templates, types
test/         # Vitest tests + fixtures
dist/         # Build output (git-ignored)
```

## Adding a New CLI Command

1. Create `src/cli/my-command.ts`:

```ts
import type { Command } from "commander";

export function registerMyCommand(program: Command): void {
  program
    .command("my-command")
    .description("What it does")
    .option("--flag", "Description")
    .action(async (opts) => {
      // implementation
    });
}
```

2. Import and register in `src/cli/index.ts`:

```ts
import { registerMyCommand } from "./my-command.js";
// inside createCli():
registerMyCommand(program);
```

## ProcessManager (`src/core/process.ts`)

Spawns the downstream MCP server process and exposes `stdin`/`stdout` streams.

```ts
const proc = new ProcessManager(parseCommand(["node", "server.js"]));
proc.on("error", (err) => { ... });
proc.on("exit", (code) => { ... });
proc.start();
// proc.stdin / proc.stdout are the child's stdio
proc.stop(); // SIGTERM
```

## Inspector Dashboard (`src/inspector/dashboard/`)

Plain HTML + vanilla JS (no framework). The `InspectorServer`:
- Serves static files from `dist/dashboard/` over HTTP (port 3200 default)
- `/ws/traces` — dashboard clients subscribe here for live `TraceEntry` pushes
- `/ws/ingest` — external proxy instances push `TraceEntry` JSON here
- `/api/traces` — REST fallback returns `RingBuffer.getAll()` (last 1000 entries)
- `RingBuffer` (`src/inspector/ring-buffer.ts`) — fixed-size circular buffer, capacity 1000

To add a new dashboard feature, edit `src/inspector/dashboard/app.js` (plain ES modules, no build step needed).

## Test Conventions

- Framework: **Vitest** with `.test.ts` extension
- ESM: all imports use `.js` extension (TypeScript resolves to `.ts`)
- Fixtures in `test/fixtures/`
- No test database or network calls — use in-memory streams and dry-run mode
- Run a single test file: `npx vitest run test/jsonrpc.test.ts`

## TypeScript Config Notes

- `"type": "module"` in package.json — everything is ESM
- `target: "node20"` — you can use `using`, top-level `await`, etc.
- Strict mode enabled — avoid `any`, use type guards

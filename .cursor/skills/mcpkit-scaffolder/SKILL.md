---
name: mcpkit-scaffolder
description: Extend or modify the mcpkit code-generation scaffolder: add new template files, modify the YAML/OpenAPI parsers, add new param types, change the generated server structure, or adjust how tools are rendered. Use when the user wants to change what `mcpkit init` generates.
---

# mcpkit Scaffolder

## Data Flow

```
YAML / OpenAPI file
       │
       ▼
yaml-parser.ts / openapi-parser.ts   → ServerConfig
       │
       ▼
generator.ts  generate(config, opts)  → GeneratedFile[]
       │                                     │
       │  reads EJS templates                ▼
       └─── src/scaffolder/templates/   written to opts.output/
```

## Core Types (`src/scaffolder/types.ts`)

```ts
interface ToolParam  { type, description?, required?, default? }
interface ToolDescriptor { name, description, params: Record<string, ToolParam> }
interface ServerConfig   { name, transport: "stdio"|"http", tools: ToolDescriptor[] }
interface GeneratorOptions { lang: "ts", transport, output, dryRun? }
```

`toolToInputSchema(tool)` → JSON Schema `{ type:"object", properties:{...}, required:[...] }` — used when rendering `server-index.ts.ejs`.

## Templates (`src/scaffolder/templates/`)

| File | Purpose |
|------|---------|
| `package.json.ejs` | Generated project's package.json |
| `tsconfig.json.ejs` | Generated project's tsconfig |
| `server-index.ts.ejs` | Main server entry (`src/index.ts`) |
| `tool-handler.ts.ejs` | Per-tool handler stub (`src/tools/<name>.ts`) |

EJS variables available in `server-index.ts.ejs`:
- `name` — server name
- `transport` — `"stdio"` or `"http"`
- `tools` — `ToolDescriptor[]`
- `inputSchemas` — `Record<toolName, JSONSchema>`

EJS variables available in `tool-handler.ts.ejs`:
- `tool` — single `ToolDescriptor`

## Adding a New Template File

1. Create `src/scaffolder/templates/my-file.ejs`
2. In `generator.ts` `generate()`, add:

```ts
files.push({
  path: "my-file.ts",
  content: render(loadTemplate("my-file.ejs"), { /* vars */ }),
});
```

## Adding a New Param Type

`toolToInputSchema` maps `ToolParam.type` directly into the JSON Schema `type` field. If you need richer mapping (e.g. `"date"` → `{ type: "string", format: "date" }`), modify `toolToInputSchema` in `types.ts`:

```ts
function typeToJsonSchema(t: string): Record<string, unknown> {
  if (t === "date") return { type: "string", format: "date" };
  return { type: t };
}
```

## YAML Parser (`src/scaffolder/yaml-parser.ts`)

Parses the custom YAML config format into `ServerConfig`. Extend it when adding new top-level config keys.

## OpenAPI Parser (`src/scaffolder/openapi-parser.ts`)

Uses `@apidevtools/swagger-parser` to dereference the spec, then maps each `POST` operation into a `ToolDescriptor`. The operation `operationId` becomes the tool name; query/body params become `ToolParam` entries.

## Dry-Run

When `opts.dryRun` is true, `generate()` returns `GeneratedFile[]` without writing to disk. The CLI prints the file list. Use this in tests to assert generated content without touching the filesystem.

## Testing

```ts
import { generate } from "../../src/scaffolder/generator.js";
import type { ServerConfig, GeneratorOptions } from "../../src/scaffolder/types.js";

const config: ServerConfig = {
  name: "test-server", transport: "stdio",
  tools: [{ name: "ping", description: "Ping", params: {} }],
};
const opts: GeneratorOptions = { lang: "ts", transport: "stdio", output: "/tmp/out", dryRun: true };
const files = generate(config, opts);
// assert files[].path and files[].content
```

See `test/scaffolder.test.ts` for full examples.

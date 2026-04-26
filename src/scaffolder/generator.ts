import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "ejs";
import type { ServerConfig, GeneratorOptions } from "./types.js";
import { toolToInputSchema } from "./types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const __rootDir = fileURLToPath(new URL("../..", import.meta.url));

// Works both in dev (src/scaffolder/) and bundled (dist/bin/) contexts
const TEMPLATE_CANDIDATES = [
  join(__dirname, "templates"),
  join(__rootDir, "templates"),
  join(__rootDir, "src", "scaffolder", "templates"),
];

function findTemplateDir(): string {
  for (const dir of TEMPLATE_CANDIDATES) {
    try {
      readFileSync(join(dir, "package.json.ejs"));
      return dir;
    } catch { /* continue */ }
  }
  return TEMPLATE_CANDIDATES[0];
}

const TEMPLATE_DIR = findTemplateDir();

function loadTemplate(name: string): string {
  return readFileSync(join(TEMPLATE_DIR, name), "utf-8");
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export function generate(config: ServerConfig, opts: GeneratorOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const inputSchemas: Record<string, Record<string, unknown>> = {};

  for (const tool of config.tools) {
    inputSchemas[tool.name] = toolToInputSchema(tool);
  }

  // package.json
  files.push({
    path: "package.json",
    content: render(loadTemplate("package.json.ejs"), {
      name: config.name,
      transport: opts.transport,
    }),
  });

  // tsconfig.json
  files.push({
    path: "tsconfig.json",
    content: render(loadTemplate("tsconfig.json.ejs"), {}),
  });

  // src/index.ts
  files.push({
    path: "src/index.ts",
    content: render(loadTemplate("server-index.ts.ejs"), {
      name: config.name,
      transport: opts.transport,
      tools: config.tools,
      inputSchemas,
    }),
  });

  // Tool handlers
  for (const tool of config.tools) {
    files.push({
      path: `src/tools/${tool.name}.ts`,
      content: render(loadTemplate("tool-handler.ts.ejs"), { tool }),
    });
  }

  // mcpkit.yaml (copy of original config for re-generation)
  files.push({
    path: "mcpkit.yaml",
    content: generateYamlFromConfig(config),
  });

  if (!opts.dryRun) {
    for (const file of files) {
      const fullPath = join(opts.output, file.path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, file.content);
    }
  }

  return files;
}

function generateYamlFromConfig(config: ServerConfig): string {
  const lines = [
    `name: ${config.name}`,
    `transport: ${config.transport}`,
    `tools:`,
  ];

  for (const tool of config.tools) {
    lines.push(`  - name: ${tool.name}`);
    lines.push(`    description: "${tool.description}"`);
    if (Object.keys(tool.params).length > 0) {
      lines.push(`    params:`);
      for (const [pName, pDef] of Object.entries(tool.params)) {
        lines.push(`      ${pName}:`);
        lines.push(`        type: ${pDef.type}`);
        if (pDef.required !== undefined) lines.push(`        required: ${pDef.required}`);
        if (pDef.description) lines.push(`        description: "${pDef.description}"`);
        if (pDef.default !== undefined) lines.push(`        default: ${JSON.stringify(pDef.default)}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

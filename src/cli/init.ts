import { existsSync, readFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import type { Command } from "commander";
import { parseYamlConfig } from "../scaffolder/yaml-parser.js";
import { parseOpenApiSpec } from "../scaffolder/openapi-parser.js";
import { generate } from "../scaffolder/generator.js";
import type { ServerConfig } from "../scaffolder/types.js";

type Format = "yaml" | "openapi";

function detectFormat(filePath: string, explicit?: string): Format {
  if (explicit === "openapi") return "openapi";
  if (explicit === "yaml") return "yaml";

  const ext = extname(filePath).toLowerCase();
  if (ext === ".json") return "openapi";

  const content = readFileSync(filePath, "utf-8");
  if (content.includes("openapi:") || content.includes("swagger:")) return "openapi";
  return "yaml";
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Scaffold a new MCP server from a config or OpenAPI spec")
    .option("--from <file>", "Source config file (YAML config or OpenAPI spec)")
    .option("--format <format>", "Source format: yaml | openapi (auto-detected if omitted)")
    .option("--transport <transport>", "Transport: stdio | http", "stdio")
    .option("--output <dir>", "Output directory", ".")
    .option("--dry-run", "Preview generated files without writing")
    .action(async (opts: {
      from?: string;
      format?: string;
      transport: string;
      output: string;
      dryRun?: boolean;
    }) => {
      if (!opts.from) {
        process.stderr.write("Error: --from is required. Provide a YAML config or OpenAPI spec.\n");
        process.stderr.write("Example: mcpkit init --from config.yaml\n");
        process.exit(1);
      }

      const filePath = resolve(opts.from);
      if (!existsSync(filePath)) {
        process.stderr.write(`Error: file not found: ${filePath}\n`);
        process.exit(1);
      }

      const format = detectFormat(filePath, opts.format);
      let config: ServerConfig;

      try {
        if (format === "openapi") {
          const tools = await parseOpenApiSpec(filePath);
          if (tools.length === 0) {
            process.stderr.write("Error: no operations found in OpenAPI spec\n");
            process.exit(1);
          }
          config = {
            name: "mcp-server",
            transport: opts.transport === "http" ? "http" : "stdio",
            tools,
          };
        } else {
          config = parseYamlConfig(filePath);
          if (opts.transport) {
            config.transport = opts.transport === "http" ? "http" : "stdio";
          }
        }
      } catch (err) {
        process.stderr.write(`Error parsing ${format} file: ${(err as Error).message}\n`);
        process.exit(1);
      }

      const outputDir = resolve(opts.output);

      const files = generate(config, {
        lang: "ts",
        transport: config.transport,
        output: outputDir,
        dryRun: opts.dryRun,
      });

      if (opts.dryRun) {
        process.stderr.write("[mcpkit] dry run — files that would be generated:\n\n");
        for (const f of files) {
          process.stderr.write(`  ${f.path}\n`);
        }
        process.stderr.write(`\n${files.length} files total\n`);
      } else {
        process.stderr.write(`[mcpkit] generated MCP server in ${outputDir}\n`);
        for (const f of files) {
          process.stderr.write(`  ✓ ${f.path}\n`);
        }
        process.stderr.write(`\nNext steps:\n`);
        process.stderr.write(`  cd ${opts.output !== "." ? opts.output : outputDir}\n`);
        process.stderr.write(`  npm install\n`);
        process.stderr.write(`  # Edit tool handlers in src/tools/\n`);
        process.stderr.write(`  npm run dev\n`);
      }
    });
}

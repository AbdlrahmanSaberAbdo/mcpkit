import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { ServerConfig, ToolDescriptor, ToolParam } from "./types.js";

export function parseYamlConfig(filePath: string): ServerConfig {
  const raw = readFileSync(filePath, "utf-8");
  const doc = parseYaml(raw) as Record<string, unknown>;

  const name = String(doc.name ?? "mcp-server");
  const transport = doc.transport === "http" ? "http" : "stdio";

  const rawTools = doc.tools;
  if (!Array.isArray(rawTools) || rawTools.length === 0) {
    throw new Error("Config must define at least one tool in the 'tools' array");
  }

  const tools: ToolDescriptor[] = rawTools.map((t: Record<string, unknown>, i: number) => {
    if (!t.name || typeof t.name !== "string") {
      throw new Error(`Tool at index ${i} is missing a 'name'`);
    }
    if (!t.description || typeof t.description !== "string") {
      throw new Error(`Tool '${t.name}' is missing a 'description'`);
    }

    const params: Record<string, ToolParam> = {};
    const rawParams = t.params as Record<string, Record<string, unknown>> | undefined;
    if (rawParams && typeof rawParams === "object") {
      for (const [pName, pDef] of Object.entries(rawParams)) {
        params[pName] = {
          type: String(pDef.type ?? "string"),
          description: pDef.description ? String(pDef.description) : undefined,
          required: pDef.required !== false,
          default: pDef.default,
        };
      }
    }

    return { name: t.name, description: t.description, params };
  });

  return { name, transport, tools };
}

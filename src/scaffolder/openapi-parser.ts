import SwaggerParser from "@apidevtools/swagger-parser";
import type { ToolDescriptor, ToolParam } from "./types.js";

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Array<{
    name: string;
    in: string;
    description?: string;
    required?: boolean;
    schema?: { type?: string; default?: unknown };
  }>;
  requestBody?: {
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
}

interface OpenAPISpec {
  paths?: Record<string, Record<string, OpenAPIOperation>>;
}

function jsonSchemaTypeToSimple(schema: Record<string, unknown> | undefined): string {
  if (!schema || !schema.type) return "string";
  return String(schema.type);
}

export async function parseOpenApiSpec(filePath: string): Promise<ToolDescriptor[]> {
  const api = (await SwaggerParser.dereference(filePath)) as OpenAPISpec;
  const tools: ToolDescriptor[] = [];

  if (!api.paths) return tools;

  for (const [path, methods] of Object.entries(api.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation || typeof operation !== "object") continue;

      const name = operation.operationId ?? `${method}_${path.replace(/[^a-zA-Z0-9]/g, "_")}`;
      const description = operation.summary ?? operation.description ?? `${method.toUpperCase()} ${path}`;

      const params: Record<string, ToolParam> = {};

      if (operation.parameters) {
        for (const p of operation.parameters) {
          params[p.name] = {
            type: jsonSchemaTypeToSimple(p.schema as Record<string, unknown>),
            description: p.description,
            required: p.required ?? false,
            default: p.schema?.default,
          };
        }
      }

      if (operation.requestBody?.content) {
        const jsonContent = operation.requestBody.content["application/json"];
        if (jsonContent?.schema) {
          const schema = jsonContent.schema as Record<string, unknown>;
          if (schema.properties && typeof schema.properties === "object") {
            const requiredFields = (schema.required as string[]) ?? [];
            for (const [pName, pDef] of Object.entries(schema.properties as Record<string, Record<string, unknown>>)) {
              params[pName] = {
                type: jsonSchemaTypeToSimple(pDef),
                description: pDef.description ? String(pDef.description) : undefined,
                required: requiredFields.includes(pName),
                default: pDef.default,
              };
            }
          }
        }
      }

      tools.push({ name, description, params });
    }
  }

  return tools;
}

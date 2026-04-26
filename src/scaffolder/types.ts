export interface ToolParam {
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  params: Record<string, ToolParam>;
}

export interface ServerConfig {
  name: string;
  transport: "stdio" | "http";
  tools: ToolDescriptor[];
}

export interface GeneratorOptions {
  lang: "ts";
  transport: "stdio" | "http";
  output: string;
  dryRun?: boolean;
}

export function toolToInputSchema(tool: ToolDescriptor): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [paramName, param] of Object.entries(tool.params)) {
    const prop: Record<string, unknown> = { type: param.type };
    if (param.description) prop.description = param.description;
    if (param.default !== undefined) prop.default = param.default;
    properties[paramName] = prop;
    if (param.required !== false) required.push(paramName);
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

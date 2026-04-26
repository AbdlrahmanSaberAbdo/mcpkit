import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { parseYamlConfig } from "../src/scaffolder/yaml-parser.js";
import { parseOpenApiSpec } from "../src/scaffolder/openapi-parser.js";
import { generate } from "../src/scaffolder/generator.js";
import { toolToInputSchema } from "../src/scaffolder/types.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

describe("parseYamlConfig", () => {
  it("parses a valid YAML config", () => {
    const config = parseYamlConfig(join(FIXTURES, "sample-config.yaml"));
    expect(config.name).toBe("my-api-server");
    expect(config.transport).toBe("stdio");
    expect(config.tools).toHaveLength(2);
    expect(config.tools[0].name).toBe("get_user");
    expect(config.tools[0].description).toBe("Get user by ID");
    expect(config.tools[0].params.id.type).toBe("string");
    expect(config.tools[0].params.id.required).toBe(true);
    expect(config.tools[1].params.limit.default).toBe(10);
  });
});

describe("parseOpenApiSpec", () => {
  it("parses an OpenAPI spec into tool descriptors", async () => {
    const tools = await parseOpenApiSpec(join(FIXTURES, "sample-openapi.yaml"));
    expect(tools.length).toBeGreaterThanOrEqual(2);

    const getUser = tools.find((t) => t.name === "getUser");
    expect(getUser).toBeDefined();
    expect(getUser!.description).toBe("Get a user by ID");
    expect(getUser!.params.id.type).toBe("string");

    const createOrder = tools.find((t) => t.name === "createOrder");
    expect(createOrder).toBeDefined();
    expect(createOrder!.params.product_id.required).toBe(true);
    expect(createOrder!.params.quantity.type).toBe("integer");
  });
});

describe("toolToInputSchema", () => {
  it("converts a tool descriptor to JSON Schema", () => {
    const schema = toolToInputSchema({
      name: "test",
      description: "test tool",
      params: {
        query: { type: "string", required: true, description: "Search query" },
        limit: { type: "integer", required: false, default: 10 },
      },
    });

    expect(schema.type).toBe("object");
    const props = schema.properties as Record<string, Record<string, unknown>>;
    expect(props.query.type).toBe("string");
    expect(props.query.description).toBe("Search query");
    expect(props.limit.default).toBe(10);
    expect((schema.required as string[])).toContain("query");
    expect((schema.required as string[])).not.toContain("limit");
  });
});

describe("generate (dry run)", () => {
  it("generates expected files from YAML config", () => {
    const config = parseYamlConfig(join(FIXTURES, "sample-config.yaml"));
    const files = generate(config, {
      lang: "ts",
      transport: "stdio",
      output: "/tmp/test-output",
      dryRun: true,
    });

    const paths = files.map((f) => f.path);
    expect(paths).toContain("package.json");
    expect(paths).toContain("tsconfig.json");
    expect(paths).toContain("src/index.ts");
    expect(paths).toContain("src/tools/get_user.ts");
    expect(paths).toContain("src/tools/list_orders.ts");
    expect(paths).toContain("mcpkit.yaml");

    const pkg = files.find((f) => f.path === "package.json")!;
    const pkgJson = JSON.parse(pkg.content);
    expect(pkgJson.name).toBe("my-api-server");
    expect(pkgJson.dependencies["@modelcontextprotocol/sdk"]).toBeDefined();

    const index = files.find((f) => f.path === "src/index.ts")!;
    expect(index.content).toContain("StdioServerTransport");
    expect(index.content).toContain("get_user");
    expect(index.content).toContain("list_orders");
  });
});

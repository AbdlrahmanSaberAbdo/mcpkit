/**
 * MCP server intended for manual testing of mcpkit inspector:
 * masking, large payload toolbar, long-string truncation (request + response JSON).
 *
 * Run with: mcpkit inspect -- node dist/index.js   (after npm run build)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "inspector-dev-mcp",
  version: "1.0.0",
});

server.tool(
  "echo_sensitive",
  {
    api_key: z.string().describe("Synthetic secret — should mask in inspector when Mask sensitive is on"),
    password: z.string().optional(),
    bearer_token: z.string().optional(),
    harmless_note: z.string().optional(),
  },
  async (params) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          echoed: true,
          api_key: params.api_key,
          password: params.password ?? "",
          bearer_token: params.bearer_token ?? "",
          harmless_note: params.harmless_note ?? "still visible when not a secret-like key name",
        }),
      },
    ],
  }),
);

server.tool(
  "long_text_field",
  {
    repeat: z.number().int().min(400).max(12000).optional(),
  },
  async ({ repeat = 1200 }) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          paragraph: "x".repeat(repeat),
          approxChars: repeat,
          hint: "Inspect request/response JSON for string truncation when Mask sensitive is enabled",
        }),
      },
    ],
  }),
);

server.tool(
  "large_json_response",
  {
    approxSerializedBytes: z
      .number()
      .int()
      .min(10_000)
      .max(5_000_000)
      .optional()
      .describe("Grow JSON output until serialized size crosses mcpkit compact-view threshold (~56 KiB default)"),
  },
  async ({ approxSerializedBytes = 70_000 }) => {
    let blob = "";
    const chunk = "0123456789abcdef";
    while (JSON.stringify({ blob }).length < approxSerializedBytes) {
      blob += chunk;
    }
    const payload = {
      blob,
      approxSerializedBytes,
      actualSerializedLength: JSON.stringify({ blob }).length,
      hint: "Dashboard should offer compact preview, Expand full, Download JSON",
    };
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(payload),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

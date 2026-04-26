import type { Command } from "commander";
import { InspectorServer } from "../inspector/server.js";

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start the inspector dashboard only — no server to wrap. All MCP servers proxy traces here via --inspector ws://localhost:<port>/ws/ingest")
    .option("--port <port>", "Dashboard port", "3200")
    .action(async (opts: { port: string }) => {
      const port = parseInt(opts.port, 10);
      const inspector = new InspectorServer({ port });

      await inspector.start();

      const url = inspector.getUrl();
      process.stderr.write(`[mcpkit] inspector dashboard: ${url}\n`);
      process.stderr.write(`[mcpkit] waiting for proxy connections on ${url}/ws/ingest\n`);
      process.stderr.write(`[mcpkit] configure each MCP server with:\n`);
      process.stderr.write(`[mcpkit]   mcpkit proxy --inspector ws://localhost:${port}/ws/ingest -- <your-server>\n`);

      try {
        const { default: open } = await import("open");
        await open(url);
      } catch {
        // ignore
      }

      // Keep alive until killed
      process.on("SIGINT", async () => {
        process.stderr.write("\n[mcpkit] shutting down inspector\n");
        await inspector.stop();
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        await inspector.stop();
        process.exit(0);
      });
    });
}

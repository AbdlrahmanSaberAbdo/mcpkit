import { writeFileSync } from "node:fs";
import type { Command } from "commander";
import { ProcessManager, parseCommand } from "../core/process.js";
import { Interceptor } from "../core/interceptor.js";
import { InspectorServer } from "../inspector/server.js";
import type { TraceEntry } from "../core/trace.js";

export function registerInspectCommand(program: Command): void {
  program
    .command("inspect")
    .description("Proxy an MCP server with a real-time browser debug dashboard")
    .option("--port <port>", "Inspector dashboard port", "3200")
    .option("--log-only", "Terminal logging only, no browser UI")
    .option("--export <file>", "Export traces to file on exit")
    .option("--server-name <name>", "Name for this server in traces", "default")
    .argument("[cmd...]", "Server command to spawn (after --)")
    .action(async (cmdParts: string[], opts: { port: string; logOnly?: boolean; export?: string; serverName: string }) => {
      if (!cmdParts.length) {
        process.stderr.write("Error: provide a server command after --, e.g.: mcpkit inspect -- node server.js\n");
        process.exit(1);
      }

      const port = parseInt(opts.port, 10);
      const collectedTraces: TraceEntry[] = [];

      const procOpts = parseCommand(cmdParts);
      const proc = new ProcessManager(procOpts);

      proc.on("error", (err: Error) => {
        process.stderr.write(`[mcpkit] server error: ${err.message}\n`);
        process.exit(1);
      });

      proc.start();

      const interceptor = new Interceptor(
        process.stdin,
        proc.stdin,
        proc.stdout,
        process.stdout,
        { serverName: opts.serverName },
      );

      let inspector: InspectorServer | null = null;

      if (!opts.logOnly) {
        inspector = new InspectorServer({ port });
        await inspector.start();
        const url = inspector.getUrl();
        process.stderr.write(`[mcpkit] inspector dashboard: ${url}\n`);

        try {
          const { default: open } = await import("open");
          await open(url);
        } catch {
          // browser open failed silently — user can navigate manually
        }
      }

      interceptor.on("trace", (entry: TraceEntry) => {
        if (opts.export) collectedTraces.push(entry);
        if (inspector) inspector.ingest(entry);

        const time = new Date(entry.timestamp).toLocaleTimeString("en-US", { hour12: false });
        const arrow = entry.direction === "client_to_server" ? "→" : "←";
        const method = entry.method ?? "response";
        const toolName = entry.params && "name" in entry.params ? ` ${entry.params.name}` : "";
        const latency = entry.latency_ms !== null ? ` (${entry.latency_ms}ms)` : "";
        const status = entry.error ? "✗" : entry.status === "timeout" ? "⏱" : "✓";
        process.stderr.write(`[${time}] ${arrow} ${method}${toolName}${latency} ${status}\n`);
      });

      const cleanup = () => {
        if (opts.export && collectedTraces.length > 0) {
          writeFileSync(opts.export, JSON.stringify(collectedTraces, null, 2));
          process.stderr.write(`[mcpkit] traces exported to ${opts.export}\n`);
        }
        interceptor.destroy();
        inspector?.stop();
        proc.stop();
      };

      proc.on("exit", (code: number | null) => {
        process.stderr.write(`[mcpkit] server exited with code ${code}\n`);
        cleanup();
        process.exit(code ?? 0);
      });

      interceptor.on("close", cleanup);
      process.on("SIGINT", () => { cleanup(); process.exit(0); });

      interceptor.start();
      process.stderr.write(`[mcpkit] inspecting: ${cmdParts.join(" ")}\n`);
    });
}

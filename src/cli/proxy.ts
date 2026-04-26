import type { Command } from "commander";
import type { WebSocket } from "ws";
import { ProcessManager, parseCommand } from "../core/process.js";
import { Interceptor } from "../core/interceptor.js";
import type { TraceEntry } from "../core/trace.js";

function formatTrace(entry: TraceEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", { hour12: false });
  const arrow = entry.direction === "client_to_server" ? "→" : "←";
  const method = entry.method ?? "response";
  const toolName =
    entry.params && "name" in entry.params ? ` ${entry.params.name}` : "";
  const latency = entry.latency_ms !== null ? ` (${entry.latency_ms}ms)` : "";
  const status = entry.error ? "✗" : entry.status === "timeout" ? "⏱" : "✓";
  return `[${time}] ${arrow} ${method}${toolName}${latency} ${status}`;
}

export function registerProxyCommand(program: Command): void {
  program
    .command("proxy")
    .description("Transparent proxy between MCP client and server with logging")
    .option("--json", "Output NDJSON trace entries to stderr")
    .option("--inspector <url>", "WebSocket URL of inspector to emit traces to")
    .option("--server-name <name>", "Name for this server in traces", "default")
    .argument("[cmd...]", "Server command to spawn (after --)")
    .action(async (cmdParts: string[], opts: { json?: boolean; inspector?: string; serverName: string }) => {
      if (!cmdParts.length) {
        process.stderr.write("Error: provide a server command after --, e.g.: mcpkit proxy -- node server.js\n");
        process.exit(1);
      }

      const procOpts = parseCommand(cmdParts);
      const proc = new ProcessManager(procOpts);

      proc.on("error", (err: Error) => {
        process.stderr.write(`[mcpkit] server error: ${err.message}\n`);
        process.exit(1);
      });

      proc.on("exit", (code: number | null) => {
        process.stderr.write(`[mcpkit] server exited with code ${code}\n`);
        process.exit(code ?? 1);
      });

      proc.start();

      const interceptor = new Interceptor(
        process.stdin,
        proc.stdin,
        proc.stdout,
        process.stdout,
        { serverName: opts.serverName },
      );

      let wsClient: WebSocket | null = null;
      if (opts.inspector) {
        const { default: WebSocket } = await import("ws");
        wsClient = new WebSocket(opts.inspector);
        wsClient.on("error", (err) => {
          process.stderr.write(`[mcpkit] inspector connection error: ${err.message}\n`);
        });
      }

      interceptor.on("trace", (entry: TraceEntry) => {
        if (opts.json) {
          process.stderr.write(JSON.stringify(entry) + "\n");
        } else {
          process.stderr.write(formatTrace(entry) + "\n");
        }

        if (wsClient?.readyState === 1) {
          wsClient.send(JSON.stringify(entry));
        }
      });

      interceptor.on("close", () => {
        wsClient?.close();
        proc.stop();
      });

      interceptor.start();

      process.stderr.write(`[mcpkit] proxy started for: ${cmdParts.join(" ")}\n`);
    });
}

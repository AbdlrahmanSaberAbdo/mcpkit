import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";

export interface ProcessManagerOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Manages a child MCP server process, exposing its stdin/stdout for
 * the interceptor to wire into.
 */
export class ProcessManager extends EventEmitter {
  private child: ChildProcess | null = null;
  private opts: ProcessManagerOptions;

  constructor(opts: ProcessManagerOptions) {
    super();
    this.opts = opts;
  }

  get stdin(): Writable {
    if (!this.child?.stdin) throw new Error("Process not started");
    return this.child.stdin;
  }

  get stdout(): Readable {
    if (!this.child?.stdout) throw new Error("Process not started");
    return this.child.stdout;
  }

  start(): void {
    this.child = spawn(this.opts.command, this.opts.args ?? [], {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, ...this.opts.env },
      cwd: this.opts.cwd,
      shell: true,
    });

    this.child.on("error", (err) => this.emit("error", err));
    this.child.on("exit", (code, signal) => {
      this.emit("exit", code, signal);
    });

    // Forward signals to child
    const forwardSignal = (sig: NodeJS.Signals) => {
      this.child?.kill(sig);
    };
    process.on("SIGINT", () => forwardSignal("SIGINT"));
    process.on("SIGTERM", () => forwardSignal("SIGTERM"));
  }

  stop(): void {
    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill("SIGKILL");
        }
      }, 5000);
    }
  }
}

/**
 * Parse a command string like "node my-server.js --flag" into
 * { command, args }.
 */
export function parseCommand(cmdParts: string[]): ProcessManagerOptions {
  const [command, ...args] = cmdParts;
  if (!command) throw new Error("No command provided");
  return { command, args };
}

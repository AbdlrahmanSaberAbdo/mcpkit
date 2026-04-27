import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { RingBuffer } from "./ring-buffer.js";
import type { TraceEntry } from "../core/trace.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const __rootDir = fileURLToPath(new URL("../..", import.meta.url));

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

export interface InspectorServerOptions {
  port?: number;
  dashboardDir?: string;
}

export class InspectorServer {
  private httpServer;
  private wssTraces: WebSocketServer;
  private wssIngest: WebSocketServer;
  private buffer: RingBuffer;
  private dashboardClients = new Set<WebSocket>();
  private dashboardDir: string;
  private port: number;

  constructor(opts: InspectorServerOptions = {}) {
    this.port = opts.port ?? 3200;
    // Bundled CLI: __dirname is dist/bin → dashboard lives at dist/dashboard (../dashboard).
    // Dev (tsx): __dirname is src/inspector → ./dashboard.
    const candidates = [
      join(__dirname, "dashboard"),
      join(__dirname, "..", "dashboard"),
      join(__rootDir, "dashboard"),
      join(__rootDir, "dist", "dashboard"),
      join(__rootDir, "src", "inspector", "dashboard"),
    ];
    this.dashboardDir = opts.dashboardDir ?? candidates.find((d) => {
      try { return readFileSync(join(d, "index.html")).length > 0; } catch { return false; }
    }) ?? join(__dirname, "dashboard");
    this.buffer = new RingBuffer(1000);

    this.httpServer = createServer((req, res) => this.handleHttp(req, res));

    this.wssTraces = new WebSocketServer({ noServer: true });
    this.wssIngest = new WebSocketServer({ noServer: true });

    this.httpServer.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);
      if (url.pathname === "/ws/traces") {
        this.wssTraces.handleUpgrade(req, socket, head, (ws) => {
          this.wssTraces.emit("connection", ws, req);
        });
      } else if (url.pathname === "/ws/ingest") {
        this.wssIngest.handleUpgrade(req, socket, head, (ws) => {
          this.wssIngest.emit("connection", ws, req);
        });
      } else {
        socket.destroy();
      }
    });

    this.wssTraces.on("connection", (ws) => {
      this.dashboardClients.add(ws);
      // Send buffered history on connect
      const history = this.buffer.getAll();
      ws.send(JSON.stringify({ type: "history", traces: history }));
      ws.on("close", () => this.dashboardClients.delete(ws));
    });

    this.wssIngest.on("connection", (ws) => {
      ws.on("message", (data) => {
        try {
          const entry = JSON.parse(data.toString()) as TraceEntry;
          this.ingest(entry);
        } catch {
          // skip malformed
        }
      });
    });
  }

  /** Ingest a trace entry directly (in-process, no WebSocket) */
  ingest(entry: TraceEntry): void {
    this.buffer.push(entry);
    const msg = JSON.stringify({ type: "trace", trace: entry });
    for (const client of this.dashboardClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.port, () => {
        resolve();
      });
    });
  }

  getUrl(): string {
    return `http://localhost:${this.port}`;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.dashboardClients) client.close();
      this.wssTraces.close();
      this.wssIngest.close();
      this.httpServer.close(() => resolve());
    });
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);

    if (url.pathname === "/api/traces") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(this.buffer.getAll()));
      return;
    }

    if (url.pathname === "/api/clear" && req.method === "POST") {
      this.buffer.clear();
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve dashboard static files
    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const fullPath = join(this.dashboardDir, filePath);

    try {
      const content = readFileSync(fullPath);
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  }
}

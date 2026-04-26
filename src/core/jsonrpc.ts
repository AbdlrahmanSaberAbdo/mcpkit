import { Transform, type TransformCallback } from "node:stream";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export type MessageType = "request" | "response" | "notification";

export function classifyMessage(msg: JsonRpcMessage): MessageType {
  if ("method" in msg && "id" in msg) return "request";
  if ("result" in msg || "error" in msg) return "response";
  return "notification";
}

export function serialize(msg: JsonRpcMessage): string {
  return JSON.stringify(msg) + "\n";
}

/**
 * Transform stream that splits newline-delimited input into parsed
 * JSON-RPC message objects. Malformed lines are silently skipped
 * with a warning on stderr.
 */
export class JsonRpcParser extends Transform {
  private buffer = "";

  constructor() {
    super({ readableObjectMode: true });
  }

  _transform(chunk: Buffer, _encoding: string, callback: TransformCallback): void {
    this.buffer += chunk.toString();
    const lines = this.buffer.split("\n");
    // Keep the last (potentially incomplete) line in the buffer
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as JsonRpcMessage;
        this.push(parsed);
      } catch {
        process.stderr.write(`[mcpkit] warning: malformed JSON-RPC message, skipping\n`);
      }
    }
    callback();
  }

  _flush(callback: TransformCallback): void {
    const trimmed = this.buffer.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed) as JsonRpcMessage;
        this.push(parsed);
      } catch {
        process.stderr.write(`[mcpkit] warning: malformed JSON-RPC message in final buffer, skipping\n`);
      }
    }
    callback();
  }
}

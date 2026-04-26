import type { TraceEntry } from "../core/trace.js";

export class RingBuffer {
  private buffer: TraceEntry[];
  private head = 0;
  private count = 0;

  constructor(private capacity: number = 1000) {
    this.buffer = new Array(capacity);
  }

  push(entry: TraceEntry): void {
    this.buffer[this.head] = entry;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  getAll(): TraceEntry[] {
    if (this.count < this.capacity) {
      return this.buffer.slice(0, this.count);
    }
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head),
    ];
  }

  get size(): number {
    return this.count;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}

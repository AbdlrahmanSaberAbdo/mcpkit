import { describe, it, expect } from "vitest";
import {
  maskForDisplay,
  isSensitiveKey,
  truncateLongString,
  LONG_STRING_MAX,
  serializedJsonLength,
  SENSITIVE_KEY_FRAGMENTS,
} from "../src/inspector/dashboard/mask-json.js";

describe("mask-json", () => {
  it("isSensitiveKey detects common secrets", () => {
    expect(isSensitiveKey("password")).toBe(true);
    expect(isSensitiveKey("Authorization")).toBe(true);
    expect(isSensitiveKey("nested_api_key")).toBe(true);
    expect(isSensitiveKey("name")).toBe(false);
  });

  it("SENSITIVE_KEY_FRAGMENTS is non-empty", () => {
    expect(SENSITIVE_KEY_FRAGMENTS.length).toBeGreaterThan(0);
  });

  it("truncateLongString leaves short strings unchanged", () => {
    expect(truncateLongString("hi", 800)).toBe("hi");
  });

  it("truncateLongString adds suffix when over max", () => {
    var long = "a".repeat(900);
    var out = truncateLongString(long, 800);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain("900 chars");
  });

  it("maskForDisplay redacts sensitive keys", () => {
    var out = maskForDisplay({ api_key: "secret123", name: "ok" }, { enabled: true });
    expect(out).toEqual({ api_key: "[REDACTED]", name: "ok" });
  });

  it("maskForDisplay truncates long benign strings", () => {
    var blob = "x".repeat(LONG_STRING_MAX + 50);
    var out = maskForDisplay({ query: blob }, { enabled: true }) as { query: string };
    expect(out.query.length).toBeLessThan(blob.length);
    expect(out.query).toContain("chars");
  });

  it("maskForDisplay when disabled returns cloned structure", () => {
    var src = { token: "abc" };
    var out = maskForDisplay(src, { enabled: false }) as { token: string };
    expect(out).toEqual(src);
    expect(out).not.toBe(src);
  });

  it("maskForDisplay recurses into nested objects", () => {
    var out = maskForDisplay({ outer: { password: "p" } }, { enabled: true }) as {
      outer: { password: string };
    };
    expect(out.outer.password).toBe("[REDACTED]");
  });

  it("serializedJsonLength measures payload size", () => {
    expect(serializedJsonLength({ a: 1 })).toBeGreaterThan(0);
  });
});

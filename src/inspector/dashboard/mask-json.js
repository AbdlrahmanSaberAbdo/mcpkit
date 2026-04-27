/**
 * Display-time masking for MCP trace JSON (browser + Vitest).
 */

export const MASK_STORAGE_KEY = "mcpkit.maskSensitive";
export const DEFAULT_MASK_ENABLED = true;
export const LONG_STRING_MAX = 800;
/** Serialized JSON size above this triggers compact view + preview in the detail panel */
export const LARGE_PAYLOAD_BYTES = 56 * 1024;
/** Character cap for formatted JSON preview before user clicks Expand */
export const LARGE_PREVIEW_CHARS = 16000;

/** Substrings matched against object keys (case-insensitive, substring match). */
export const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "token",
  "api_key",
  "apikey",
  "authorization",
  "secret",
  "bearer",
  "credential",
  "cookie",
];

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isSensitiveKey(key) {
  const k = String(key).toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some(function (frag) {
    return k.includes(frag);
  });
}

/**
 * @param {string} s
 * @param {number} maxLen
 * @returns {string}
 */
export function truncateLongString(s, maxLen) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "… (" + s.length + " chars)";
}

/**
 * Deep clone via JSON round-trip (sufficient for MCP trace payloads).
 * @param {unknown} value
 * @returns {unknown}
 */
export function cloneJson(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

/**
 * @param {unknown} value
 * @param {number} maxLen
 * @returns {unknown}
 */
function maskNested(value, maxLen) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncateLongString(value, maxLen);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map(function (item) {
      return maskNested(item, maxLen);
    });
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of Object.keys(value)) {
    const v = /** @type {Record<string, unknown>} */ (value)[k];
    if (isSensitiveKey(k)) {
      out[k] = "[REDACTED]";
    } else if (v !== null && typeof v === "object") {
      out[k] = maskNested(v, maxLen);
    } else if (typeof v === "string") {
      out[k] = truncateLongString(v, maxLen);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * @param {unknown} value
 * @param {{ enabled?: boolean; maxStringLen?: number }} [options]
 * @returns {unknown}
 */
export function maskForDisplay(value, options) {
  const enabled = options?.enabled !== false;
  const maxLen = options?.maxStringLen ?? LONG_STRING_MAX;
  if (!enabled) return cloneJson(value);
  if (value === null || value === undefined) return value;
  return maskNested(value, maxLen);
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function serializedJsonLength(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

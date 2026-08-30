/** Local logs only: ids, counts, status codes, error classes. Never package contents, PII, or control text. */
const ALLOWED = new Set(["status", "errorClass", "controlCount", "bytes", "port", "missingCount", "rowCount", "added", "updated", "unchanged", "skipped", "conflictCount", "kind"]);

export function logEvent(event, fields = {}) {
  const ev = typeof event === "string" && /^[A-Za-z0-9._-]+$/.test(event) ? event : "event";
  const parts = [];
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED.has(key)) continue;
    if (typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}=${value}`);
    } else if (typeof value === "string" && /^[A-Za-z0-9._-]+$/.test(value) && value.length <= 64) {
      parts.push(`${key}=${value}`);
    }
  }
  console.log(`[aa] ${ev}${parts.length ? ` ${parts.join(" ")}` : ""}`);
}

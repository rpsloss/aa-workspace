/** Client ping for package-access audit. Action + byte counts only — never payload text. */
export type ClientAuditAction = "export" | "reload-sample";

export function reportPackageAccess(action: ClientAuditAction, bytesOut = 0): void {
  const n = Number.isFinite(bytesOut) ? Math.max(0, Math.floor(bytesOut)) : 0;
  void fetch("/api/access-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, outcome: "ok", bytesIn: 0, bytesOut: n }),
  }).catch(() => {
    // Audit ping is best-effort; never include payload in a retry body.
  });
}

export const auditPackageAccess = reportPackageAccess;

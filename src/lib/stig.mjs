/** STIG product-family assignments. Schema 5. Never invent official DISA STIG IDs. Never log CUI. */

import { asList, SCHEMA_VERSION } from "./inventory.mjs";

export { SCHEMA_VERSION };

export const STIG_PRODUCT_FAMILIES = Object.freeze(["rhel-8", "windows-server", "postgresql"]);
export const STIG_TARGET_KINDS = Object.freeze(["asset", "software"]);
export const STIG_FAMILY_LABELS = Object.freeze({
  "rhel-8": "RHEL 8",
  "windows-server": "Windows Server",
  postgresql: "PostgreSQL",
});

function str(value) {
  return value == null ? "" : String(value);
}

export function isStigProductFamily(value) {
  return STIG_PRODUCT_FAMILIES.includes(value);
}

export function isStigTargetKind(value) {
  return STIG_TARGET_KINDS.includes(value);
}

export function emptyStigAssignment() {
  return {
    targetKind: "asset",
    targetId: "",
    stigProductFamily: "",
    officialId: "",
  };
}

/**
 * Drops rows with unknown targetKind or family (including win10/win11).
 * officialId stays blank unless already present; never invents DISA STIG IDs.
 */
export function normalizeStigAssignment(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const targetKind = isStigTargetKind(row.targetKind) ? row.targetKind : "";
  const targetId = str(row.targetId);
  const stigProductFamily = isStigProductFamily(row.stigProductFamily) ? row.stigProductFamily : "";
  if (!targetKind || !targetId || !stigProductFamily) return null;
  const official = str(row.officialId);
  return {
    targetKind,
    targetId,
    stigProductFamily,
    officialId: official,
  };
}

export function normalizeStigAssignments(list) {
  const out = [];
  const seen = new Map();
  for (const row of asList(list)) {
    const item = normalizeStigAssignment(row);
    if (!item) continue;
    const key = `${item.targetKind}:${item.targetId}`;
    if (seen.has(key)) {
      out[seen.get(key)] = item;
    } else {
      seen.set(key, out.length);
      out.push(item);
    }
  }
  return out;
}

/**
 * Missing stigAssignments → []. Does not invent sample rows or official STIG IDs.
 * Does not drop unrelated package fields. Does not change control assessment status.
 */
export function ensureStigAssignments(pkg) {
  if (pkg === null || pkg === undefined) return pkg;
  if (typeof pkg !== "object" || Array.isArray(pkg)) return pkg;
  return {
    ...pkg,
    schemaVersion: SCHEMA_VERSION,
    stigAssignments: normalizeStigAssignments(pkg.stigAssignments),
  };
}

function assignment(targetKind, targetId, stigProductFamily) {
  return {
    targetKind,
    targetId,
    stigProductFamily,
    officialId: "",
  };
}

/**
 * Sample seed only. Do not call from GET hydrate.
 * PostgreSQL STIG is on the software row (sldss-sw-pg), not the VM hosts.
 * Jump hosts are windows-server (not win10/win11). Postgres VM hosts stay unassigned.
 * F5/proxy and VPN interconnect are not seeded.
 */
export function seedSldssStigAssignments() {
  return [
    assignment("asset", "sldss-hw-app-1", "rhel-8"),
    assignment("asset", "sldss-hw-app-2", "rhel-8"),
    assignment("asset", "sldss-hw-app-3", "rhel-8"),
    assignment("asset", "sldss-hw-app-4", "rhel-8"),
    assignment("asset", "sldss-hw-jump-1", "windows-server"),
    assignment("asset", "sldss-hw-jump-2", "windows-server"),
    assignment("software", "sldss-sw-pg", "postgresql"),
  ];
}

export function stigFamilyFor(pkg, targetKind, targetId) {
  const id = str(targetId);
  const kind = str(targetKind);
  const hit = normalizeStigAssignments(pkg?.stigAssignments).find(
    (row) => row.targetKind === kind && row.targetId === id,
  );
  return hit ? hit.stigProductFamily : "";
}

export function stigOfficialIdFor(pkg, targetKind, targetId) {
  const id = str(targetId);
  const kind = str(targetKind);
  const hit = normalizeStigAssignments(pkg?.stigAssignments).find(
    (row) => row.targetKind === kind && row.targetId === id,
  );
  return hit ? hit.officialId : "";
}

export function unassignedAssets(pkg) {
  const assigned = new Set(
    normalizeStigAssignments(pkg?.stigAssignments)
      .filter((row) => row.targetKind === "asset")
      .map((row) => row.targetId),
  );
  return asList(pkg?.assets).filter((row) => row && str(row.id) && !assigned.has(str(row.id)));
}

export function softwareStigAssignments(pkg) {
  const byId = new Map(asList(pkg?.software).map((row) => [str(row?.id), row]));
  return normalizeStigAssignments(pkg?.stigAssignments)
    .filter((row) => row.targetKind === "software")
    .map((row) => ({ ...row, software: byId.get(row.targetId) || null }));
}

/** Empty family removes the row. Does not invent officialId. */
export function upsertStigAssignment(list, next = {}) {
  const targetKind = isStigTargetKind(next.targetKind) ? next.targetKind : "";
  const targetId = str(next.targetId);
  const family = isStigProductFamily(next.stigProductFamily) ? next.stigProductFamily : "";
  const officialId = str(next.officialId);
  const current = normalizeStigAssignments(list).filter(
    (row) => !(row.targetKind === targetKind && row.targetId === targetId),
  );
  if (!targetKind || !targetId || !family) return current;
  current.push({
    targetKind,
    targetId,
    stigProductFamily: family,
    officialId,
  });
  return current;
}

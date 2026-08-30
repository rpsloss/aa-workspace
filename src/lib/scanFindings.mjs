/** Match scan findings to the hardware baseline. Never add F5/proxy as SLDSS assets. Never auto-Satisfied. Never log CUI. */

import { asList } from "./inventory.mjs";
import { isInheritedGssConflict } from "./ingest/merge.mjs";
import { stigFamilyFor } from "./stig.mjs";
import {
  FINDING_FIELDS,
  cciAdvisoryFromIds,
  emptyScanFinding,
  ensureScanFindings,
  normalizeCciIds,
  normalizeScanFinding,
  normalizeScanFindings,
} from "./ingest/scan.mjs";

export { ensureScanFindings, normalizeScanFinding, normalizeScanFindings, emptyScanFinding };

function str(value) {
  return value == null ? "" : String(value).trim();
}

function key(value) {
  return str(value).toLowerCase();
}

function findingIdentity(row) {
  const host = key(row?.assetId) || key(row?.unmatchedHost) || key(row?.hostName);
  const plugin = key(row?.pluginId) || key(row?.ruleId);
  return `${key(row?.sourceType)}|${plugin}|${host}`;
}

/**
 * Host Name first, then Asset Name. Does not create assets.
 */
export function matchHostToAssets(assets, hostName, assetName) {
  const list = asList(assets);
  const host = key(hostName);
  if (host) {
    const byHost = list.filter((row) => key(row?.hostName) === host);
    if (byHost.length) return { matches: byHost, reason: byHost.length > 1 ? "ambiguous-match" : null };
  }
  const name = key(assetName) || host;
  if (name) {
    const byName = list.filter((row) => key(row?.assetName) === name);
    if (byName.length) return { matches: byName, reason: byName.length > 1 ? "ambiguous-match" : null };
  }
  return { matches: [], reason: "unmatched-host" };
}

export function gssConflictForHost(hostName, assetName) {
  return isInheritedGssConflict({
    assetName: assetName || hostName,
    hostName,
    notes: "",
    manufacturer: "",
    model: "",
    assetType: "",
  });
}

function attachMatch(finding, assets, stigAssignments) {
  const incoming = normalizeScanFinding({ ...finding, id: "" }, 0);
  incoming.id = "";
  const gss = gssConflictForHost(incoming.hostName, incoming.unmatchedHost);
  if (gss.conflict) {
    return {
      ...incoming,
      assetId: "",
      unmatchedHost: incoming.hostName || incoming.unmatchedHost,
      inheritedGss: true,
      _matchReason: gss.reason,
      _matchStatus: "conflict",
    };
  }
  const matched = matchHostToAssets(assets, incoming.hostName, incoming.unmatchedHost);
  if (matched.reason === "ambiguous-match") {
    return {
      ...incoming,
      assetId: "",
      unmatchedHost: incoming.hostName,
      _matchReason: "ambiguous-match",
      _matchStatus: "conflict",
    };
  }
  if (!matched.matches.length) {
    return {
      ...incoming,
      assetId: "",
      unmatchedHost: incoming.hostName || incoming.unmatchedHost,
      _matchReason: "unmatched-host",
      _matchStatus: "conflict",
    };
  }
  const asset = matched.matches[0];
  const family =
    incoming.stigFamily || stigFamilyFor({ stigAssignments }, "asset", asset.id) || "";
  return {
    ...incoming,
    assetId: str(asset.id),
    unmatchedHost: "",
    stigFamily: family,
    _matchReason: "",
    _matchStatus: "matched",
  };
}

function fillFinding(existing, incoming) {
  const conflicts = [];
  const proposed = { ...existing };
  let filled = false;
  for (const field of FINDING_FIELDS) {
    if (field === "id" || field === "inheritedGss") continue;
    const next = str(incoming[field]);
    const cur = str(existing[field]);
    if (field === "inheritedGss") continue;
    if (!next) continue;
    if (!cur) {
      proposed[field] = next;
      filled = true;
      continue;
    }
    if (cur !== next) conflicts.push(field);
  }
  if (Boolean(existing.inheritedGss) !== Boolean(incoming.inheritedGss) && incoming.inheritedGss) {
    proposed.inheritedGss = true;
    filled = true;
  }
  const nextCcis = normalizeCciIds(incoming.cciIds);
  const curCcis = normalizeCciIds(existing.cciIds);
  if (nextCcis.length) {
    if (!curCcis.length) {
      proposed.cciIds = nextCcis;
      proposed.cciAdvisory = cciAdvisoryFromIds(nextCcis);
      filled = true;
    } else if (curCcis.join("|") !== nextCcis.join("|")) {
      conflicts.push("cciIds");
    }
  }
  if (conflicts.length) {
    return { status: "conflict", reason: "field-mismatch", proposed, fields: conflicts };
  }
  if (filled) return { status: "update", reason: "", proposed, fields: [] };
  return { status: "unchanged", reason: "", proposed: existing, fields: [] };
}

function stripMatch(row) {
  const next = { ...row };
  delete next._matchReason;
  delete next._matchStatus;
  return normalizeScanFinding(next, 0);
}

export function previewScanMerge(existingFindings, incomingRows, assets, stigAssignments) {
  const existing = normalizeScanFindings(existingFindings);
  const incoming = asList(incomingRows);
  const items = incoming.map((raw, index) => {
    const attached = attachMatch(raw, assets, stigAssignments);
    if (attached._matchStatus === "conflict") {
      const proposed = stripMatch(attached);
      proposed.id = "";
      return {
        status: "conflict",
        reason: attached._matchReason,
        index,
        incoming: proposed,
        existingId: "",
        proposed,
        fields: [],
      };
    }
    const prepared = stripMatch(attached);
    prepared.id = "";
    const matches = existing.filter((row) => findingIdentity(row) === findingIdentity(prepared));
    if (matches.length > 1) {
      return {
        status: "conflict",
        reason: "ambiguous-match",
        index,
        incoming: prepared,
        existingId: matches.map((row) => row.id).join(","),
        proposed: prepared,
        fields: [],
      };
    }
    if (matches.length === 0) {
      return {
        status: "add",
        reason: "",
        index,
        incoming: prepared,
        existingId: "",
        proposed: prepared,
        fields: [],
      };
    }
    const current = matches[0];
    const classified = fillFinding(current, { ...prepared, id: current.id });
    return {
      status: classified.status,
      reason: classified.reason,
      index,
      incoming: prepared,
      existingId: current.id,
      proposed: classified.proposed,
      fields: classified.fields,
    };
  });
  const counts = { add: 0, update: 0, unchanged: 0, conflict: 0 };
  for (const item of items) counts[item.status] += 1;
  return { kind: "scan", items, counts };
}

function newId() {
  return `finding-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Merge findings onto the package. Never writes hardware/software rows.
 * Unmatched hosts and F5/proxy stay conflicts unless confirmed; still no new assets.
 */
export function applyScanMerge(existingFindings, incomingRows, assets, stigAssignments, options = {}) {
  const strategy = options.strategy === "replace" || options.mergeMode === "replace" ? "replace" : "merge";
  const includeInheritedGss = Boolean(options.includeInheritedGss || options.confirmInheritedGss);
  const confirmConflicts = Boolean(options.confirmConflicts);
  const preview = previewScanMerge(existingFindings, incomingRows, assets, stigAssignments);
  const used = new Set();
  const nextById = new Map();
  for (const row of normalizeScanFindings(existingFindings)) {
    if (row.id) nextById.set(row.id, row);
  }
  const applied = { added: 0, updated: 0, unchanged: 0, skipped: 0 };

  for (const item of preview.items) {
    const gss = item.reason && String(item.reason).startsWith("inherited-gss");
    const unmatched = item.reason === "unmatched-host" || item.reason === "ambiguous-match";
    if (item.status === "conflict") {
      const allowed = gss ? includeInheritedGss : confirmConflicts;
      if (!allowed) {
        applied.skipped += 1;
        continue;
      }
      if (item.existingId && !String(item.existingId).includes(",") && nextById.has(item.existingId)) {
        const current = nextById.get(item.existingId);
        const next = { ...current, ...item.incoming, id: current.id };
        nextById.set(current.id, normalizeScanFinding(next, 0));
        used.add(current.id);
        applied.updated += 1;
        continue;
      }
      const id = newId();
      const row = normalizeScanFinding({ ...item.incoming, id }, nextById.size);
      if (unmatched || gss) {
        row.assetId = "";
        row.unmatchedHost = row.unmatchedHost || row.hostName;
        row.inheritedGss = Boolean(gss) || row.inheritedGss;
      }
      nextById.set(id, row);
      used.add(id);
      applied.added += 1;
      continue;
    }
    if (item.status === "add") {
      const id = newId();
      nextById.set(id, normalizeScanFinding({ ...item.proposed, id }, nextById.size));
      used.add(id);
      applied.added += 1;
      continue;
    }
    if (item.status === "update") {
      nextById.set(item.existingId, normalizeScanFinding({ ...item.proposed, id: item.existingId }, 0));
      used.add(item.existingId);
      applied.updated += 1;
      continue;
    }
    used.add(item.existingId);
    applied.unchanged += 1;
  }

  let rows;
  if (strategy === "replace") {
    rows = [...nextById.values()].filter((row) => used.has(row.id));
  } else {
    rows = [...nextById.values()];
  }
  return { ok: true, kind: "scan", strategy, mergeMode: strategy, rows, preview, applied };
}

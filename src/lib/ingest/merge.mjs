/** Merge preview for HW/SW ingest. No silent overwrite. Never log CUI. */

import { normalizeAsset, normalizeSoftware } from "../inventory.mjs";
import { normalizeDataFlow } from "../boundary.mjs";
import {
  isBlankEmassPoamId,
  isRecognizedPoamRisk,
  isRecognizedPoamStatus,
  normalizePoam,
} from "../poamCsv.mjs";

function str(value) {
  return value == null ? "" : String(value).trim();
}

function key(value) {
  return str(value).toLowerCase();
}

const HW_COMPARE = [
  "assetName",
  "assetType",
  "manufacturer",
  "model",
  "serialNumber",
  "hostName",
  "ipAddress",
  "macAddress",
  "osFirmware",
  "location",
  "notes",
];

const SW_COMPARE = ["name", "vendor", "version", "license", "relatedAsset"];

export function isInheritedGssConflict(row) {
  const blob = [
    row?.assetName,
    row?.assetType,
    row?.manufacturer,
    row?.model,
    row?.notes,
    row?.hostName,
    row?.name,
    row?.vendor,
  ]
    .map((v) => key(v))
    .join(" ");
  if (/\bf5\b/.test(blob) || /big-?ip/.test(blob)) {
    return { conflict: true, reason: "inherited-gss-f5" };
  }
  if (/\bproxy\b/.test(blob) && (/\bgss\b/.test(blob) || /inherited/.test(blob))) {
    return { conflict: true, reason: "inherited-gss-proxy" };
  }
  if (/inherited/.test(blob) && /\bgss\b/.test(blob)) {
    return { conflict: true, reason: "inherited-gss" };
  }
  return { conflict: false, reason: "" };
}

export const isInheritedGssHardwareConflict = isInheritedGssConflict;

function hwMatches(existing, incoming) {
  const host = key(incoming.hostName);
  if (host) {
    const byHost = existing.filter((row) => key(row.hostName) === host);
    if (byHost.length) return byHost;
  }
  const name = key(incoming.assetName);
  if (name) return existing.filter((row) => key(row.assetName) === name);
  return [];
}

function swMatches(existing, incoming) {
  const n = key(incoming.name);
  const v = key(incoming.version);
  const r = key(incoming.relatedAsset);
  if (!n) return [];
  return existing.filter((row) => key(row.name) === n && key(row.version) === v && key(row.relatedAsset) === r);
}

function patchNonEmpty(existing, incoming, keys) {
  const next = { ...existing };
  for (const field of keys) {
    const value = str(incoming[field]);
    if (value !== "") next[field] = value;
  }
  return next;
}

function fillEmptyOnly(existing, incoming, keys) {
  const conflicts = [];
  const proposed = { ...existing };
  let filled = false;
  for (const field of keys) {
    const next = str(incoming[field]);
    const cur = str(existing[field]);
    if (!next) continue;
    if (!cur) {
      proposed[field] = next;
      filled = true;
      continue;
    }
    if (cur !== next) conflicts.push(field);
  }
  if (conflicts.length) {
    return { status: "conflict", reason: "field-mismatch", proposed, fields: conflicts };
  }
  if (filled) return { status: "update", reason: "", proposed, fields: [] };
  return { status: "unchanged", reason: "", proposed: existing, fields: [] };
}

function identityMissing(kind, incoming) {
  if (kind === "hardware") return !key(incoming.hostName) && !key(incoming.assetName);
  return !key(incoming.name);
}

function previewOne(kind, existingList, incoming, index) {
  const gss = isInheritedGssConflict(incoming);
  if (gss.conflict) {
    return {
      status: "conflict",
      reason: gss.reason,
      index,
      incoming,
      existingId: "",
      proposed: incoming,
      fields: [],
    };
  }
  if (identityMissing(kind, incoming)) {
    return {
      status: "conflict",
      reason: "no-match-key",
      index,
      incoming,
      existingId: "",
      proposed: incoming,
      fields: [],
    };
  }
  const matches = kind === "hardware" ? hwMatches(existingList, incoming) : swMatches(existingList, incoming);
  if (matches.length > 1) {
    return {
      status: "conflict",
      reason: "ambiguous-match",
      index,
      incoming,
      existingId: matches.map((row) => row.id).join(","),
      proposed: incoming,
      fields: [],
    };
  }
  if (matches.length === 0) {
    return {
      status: "add",
      reason: "",
      index,
      incoming,
      existingId: "",
      proposed: incoming,
      fields: [],
    };
  }
  const current = matches[0];
  const keys = kind === "hardware" ? HW_COMPARE : SW_COMPARE;
  const classified = fillEmptyOnly(current, incoming, keys);
  return {
    status: classified.status,
    reason: classified.reason,
    index,
    incoming,
    existingId: current.id,
    proposed: classified.proposed,
    fields: classified.fields,
  };
}

export function previewMerge(kind, existing, incomingRows, options = {}) {
  if (kind === "poam") return previewPoamMerge(existing, incomingRows, options);
  if (kind === "ppsm") return previewPpsmMerge(existing, incomingRows, options);
  const list = Array.isArray(existing) ? existing : [];
  const incoming = Array.isArray(incomingRows) ? incomingRows : [];
  const items = incoming.map((row, index) => previewOne(kind, list, row, index));
  const counts = { add: 0, update: 0, unchanged: 0, conflict: 0 };
  for (const item of items) counts[item.status] += 1;
  return { kind, items, counts };
}

function newId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function applyMerge(kind, existing, incomingRows, options = {}) {
  if (kind === "poam" || kind === "ppsm") return applyListMerge(kind, existing, incomingRows, options);
  const strategy = options.strategy === "replace" || options.mergeMode === "replace" ? "replace" : "merge";
  const includeInheritedGss = Boolean(options.includeInheritedGss || options.confirmInheritedGss);
  const confirmConflicts = Boolean(options.confirmConflicts);
  const preview = previewMerge(kind, existing, incomingRows);
  const usedExisting = new Set();
  const nextById = new Map();
  for (const row of Array.isArray(existing) ? existing : []) {
    if (row && row.id) nextById.set(row.id, row);
  }
  const applied = { added: 0, updated: 0, unchanged: 0, skipped: 0 };
  const prefix = kind === "hardware" ? "asset" : "software";
  const normalize = kind === "hardware" ? normalizeAsset : normalizeSoftware;
  const keys = kind === "hardware" ? HW_COMPARE : SW_COMPARE;

  for (const item of preview.items) {
    const gss = item.reason && String(item.reason).startsWith("inherited-gss");
    if (item.status === "conflict") {
      const allowed = gss ? includeInheritedGss : confirmConflicts;
      if (!allowed) {
        applied.skipped += 1;
        continue;
      }
      if (item.existingId && !String(item.existingId).includes(",")) {
        const current = nextById.get(item.existingId);
        if (current) {
          nextById.set(item.existingId, patchNonEmpty(current, item.incoming, keys));
          usedExisting.add(item.existingId);
          applied.updated += 1;
          continue;
        }
      }
      const id = newId(prefix);
      nextById.set(id, normalize({ ...item.incoming, id }, nextById.size));
      usedExisting.add(id);
      applied.added += 1;
      continue;
    }
    if (item.status === "add") {
      const id = newId(prefix);
      nextById.set(id, normalize({ ...item.incoming, id }, nextById.size));
      usedExisting.add(id);
      applied.added += 1;
      continue;
    }
    if (item.status === "update") {
      nextById.set(item.existingId, item.proposed);
      usedExisting.add(item.existingId);
      applied.updated += 1;
      continue;
    }
    usedExisting.add(item.existingId);
    applied.unchanged += 1;
  }

  let rows;
  if (strategy === "replace") {
    rows = [...nextById.values()].filter((row) => usedExisting.has(row.id));
  } else {
    rows = [...nextById.values()];
  }
  return { ok: true, kind, strategy, mergeMode: strategy, rows, preview, applied };
}

const POAM_COMPARE = [
  "emassPoamId",
  "controlId",
  "weakness",
  "description",
  "source",
  "status",
  "risk",
  "residualRisk",
  "resources",
  "scheduledCompletion",
  "milestones",
  "poc",
  "comments",
  "atoBlocker",
];

const PPSM_COMPARE = ["name", "source", "destination", "description", "notes", "protocol", "port"];

const ALWAYS_SKIP = new Set(["unknown-control", "unrecognized-status", "unrecognized-risk"]);

function catalogSet(options) {
  const raw = options?.catalogIds;
  if (!raw) return new Set();
  const list = Array.isArray(raw) ? raw : raw instanceof Set ? [...raw] : [];
  return new Set(list.map((id) => key(id)));
}

function countsFrom(items) {
  const counts = { add: 0, update: 0, unchanged: 0, conflict: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

function fillPoamFields(existing, incoming) {
  const conflicts = [];
  const proposed = { ...existing };
  let filled = false;
  for (const field of POAM_COMPARE) {
    if (field === "emassPoamId") {
      const next = str(incoming.emassPoamId);
      const cur = str(existing.emassPoamId);
      if (isBlankEmassPoamId(next)) continue;
      if (isBlankEmassPoamId(cur)) {
        proposed.emassPoamId = next;
        filled = true;
        continue;
      }
      if (cur !== next) conflicts.push("emassPoamId");
      continue;
    }
    if (field === "atoBlocker") {
      const next = Boolean(incoming.atoBlocker);
      const cur = Boolean(existing.atoBlocker);
      if (cur !== next) conflicts.push("atoBlocker");
      continue;
    }
    const next = str(incoming[field]);
    const cur = str(existing[field]);
    if (!next) continue;
    if (!cur) {
      proposed[field] = next;
      filled = true;
      continue;
    }
    if (cur !== next) conflicts.push(field);
  }
  if (conflicts.length) {
    return { status: "conflict", reason: "field-mismatch", proposed, fields: conflicts };
  }
  if (filled) return { status: "update", reason: "", proposed, fields: [] };
  return { status: "unchanged", reason: "", proposed: existing, fields: [] };
}

function poamMatches(existing, incoming) {
  if (!isBlankEmassPoamId(incoming.emassPoamId)) {
    const id = key(incoming.emassPoamId);
    const byId = existing.filter((row) => !isBlankEmassPoamId(row.emassPoamId) && key(row.emassPoamId) === id);
    if (byId.length) return byId;
  }
  const cid = key(incoming.controlId);
  const weak = key(incoming.weakness);
  if (!cid) return [];
  return existing.filter((row) => key(row.controlId) === cid && key(row.weakness) === weak);
}

function previewOnePoam(existingList, incoming, index, catalog) {
  const controlId = key(incoming?.controlId);
  if (!controlId || !catalog.has(controlId)) {
    return {
      status: "conflict",
      reason: "unknown-control",
      index,
      incoming,
      existingId: "",
      proposed: incoming,
      fields: ["controlId"],
    };
  }
  if (!isRecognizedPoamStatus(incoming.status)) {
    return {
      status: "conflict",
      reason: "unrecognized-status",
      index,
      incoming,
      existingId: "",
      proposed: incoming,
      fields: ["status"],
    };
  }
  if (!isRecognizedPoamRisk(incoming.risk) || !isRecognizedPoamRisk(incoming.residualRisk)) {
    return {
      status: "conflict",
      reason: "unrecognized-risk",
      index,
      incoming,
      existingId: "",
      proposed: incoming,
      fields: ["risk"],
    };
  }
  const matches = poamMatches(existingList, incoming);
  if (matches.length > 1) {
    return {
      status: "conflict",
      reason: "ambiguous-match",
      index,
      incoming,
      existingId: matches.map((row) => row.id).join(","),
      proposed: incoming,
      fields: [],
    };
  }
  if (matches.length === 0) {
    return {
      status: "add",
      reason: "",
      index,
      incoming,
      existingId: "",
      proposed: incoming,
      fields: [],
    };
  }
  const current = matches[0];
  const classified = fillPoamFields(current, incoming);
  return {
    status: classified.status,
    reason: classified.reason,
    index,
    incoming,
    existingId: current.id,
    proposed: classified.proposed,
    fields: classified.fields,
  };
}

function previewPoamMerge(existing, incomingRows, options = {}) {
  const list = Array.isArray(existing) ? existing : [];
  const incoming = Array.isArray(incomingRows) ? incomingRows : [];
  const catalog = catalogSet(options);
  const items = incoming.map((row, index) => previewOnePoam(list, row, index, catalog));
  return { kind: "poam", items, counts: countsFrom(items) };
}

function ppsmMatches(existing, incoming) {
  const src = key(incoming.source);
  const dest = key(incoming.destination);
  const proto = key(incoming.protocol);
  const port = key(incoming.port);
  const name = key(incoming.name);
  if (!src && !dest && !name && !proto && !port) return [];
  return existing.filter(
    (row) =>
      key(row.source) === src &&
      key(row.destination) === dest &&
      key(row.protocol) === proto &&
      key(row.port) === port,
  );
}

function previewOnePpsm(existingList, incoming, index) {
  if (!key(incoming.source) && !key(incoming.destination) && !key(incoming.name)) {
    return {
      status: "conflict",
      reason: "no-match-key",
      index,
      incoming,
      existingId: "",
      proposed: incoming,
      fields: [],
    };
  }
  const matches = ppsmMatches(existingList, incoming);
  if (matches.length > 1) {
    return {
      status: "conflict",
      reason: "ambiguous-match",
      index,
      incoming,
      existingId: matches.map((row) => row.id).join(","),
      proposed: incoming,
      fields: [],
    };
  }
  if (matches.length === 0) {
    return {
      status: "add",
      reason: "",
      index,
      incoming,
      existingId: "",
      proposed: incoming,
      fields: [],
    };
  }
  const current = matches[0];
  const classified = fillEmptyOnly(current, incoming, PPSM_COMPARE);
  return {
    status: classified.status,
    reason: classified.reason,
    index,
    incoming,
    existingId: current.id,
    proposed: classified.proposed,
    fields: classified.fields,
  };
}

function previewPpsmMerge(existing, incomingRows) {
  const list = Array.isArray(existing) ? existing : [];
  const incoming = Array.isArray(incomingRows) ? incomingRows : [];
  const items = incoming.map((row, index) => previewOnePpsm(list, row, index));
  return { kind: "ppsm", items, counts: countsFrom(items) };
}


function patchPoamNonEmpty(existing, incoming) {
  const next = { ...existing };
  for (const field of POAM_COMPARE) {
    if (field === "emassPoamId") {
      if (!isBlankEmassPoamId(incoming.emassPoamId)) next.emassPoamId = str(incoming.emassPoamId).trim();
      continue;
    }
    if (field === "atoBlocker") {
      next.atoBlocker = Boolean(incoming.atoBlocker);
      continue;
    }
    const value = str(incoming[field]);
    if (value !== "") next[field] = value;
  }
  return next;
}

function applyListMerge(kind, existing, incomingRows, options = {}) {
  const strategy = options.strategy === "replace" || options.mergeMode === "replace" ? "replace" : "merge";
  const confirmConflicts = Boolean(options.confirmConflicts);
  const preview = previewMerge(kind, existing, incomingRows, options);
  const usedExisting = new Set();
  const nextById = new Map();
  for (const row of Array.isArray(existing) ? existing : []) {
    if (row && row.id) nextById.set(row.id, row);
  }
  const applied = { added: 0, updated: 0, unchanged: 0, skipped: 0 };
  const prefix = kind === "poam" ? "poam" : "flow";
  const normalize = kind === "poam" ? normalizePoam : normalizeDataFlow;
  const keys = kind === "poam" ? POAM_COMPARE : PPSM_COMPARE;

  for (const item of preview.items) {
    if (item.status === "conflict") {
      if (ALWAYS_SKIP.has(item.reason) || !confirmConflicts) {
        applied.skipped += 1;
        continue;
      }
      if (item.existingId && !String(item.existingId).includes(",")) {
        const current = nextById.get(item.existingId);
        if (current) {
          const patched = kind === "poam" ? patchPoamNonEmpty(current, item.incoming) : patchNonEmpty(current, item.incoming, keys);
          nextById.set(item.existingId, normalize({ ...patched, id: item.existingId }, nextById.size));
          usedExisting.add(item.existingId);
          applied.updated += 1;
          continue;
        }
      }
      const id = newId(prefix);
      nextById.set(id, normalize({ ...item.incoming, id }, nextById.size));
      usedExisting.add(id);
      applied.added += 1;
      continue;
    }
    if (item.status === "add") {
      const id = newId(prefix);
      nextById.set(id, normalize({ ...item.incoming, id }, nextById.size));
      usedExisting.add(id);
      applied.added += 1;
      continue;
    }
    if (item.status === "update") {
      nextById.set(item.existingId, normalize({ ...item.proposed, id: item.existingId }, nextById.size));
      usedExisting.add(item.existingId);
      applied.updated += 1;
      continue;
    }
    usedExisting.add(item.existingId);
    applied.unchanged += 1;
  }

  let rows;
  if (strategy === "replace") {
    rows = [...nextById.values()].filter((row) => usedExisting.has(row.id));
  } else {
    rows = [...nextById.values()];
  }
  return { ok: true, kind, strategy, mergeMode: strategy, rows, preview, applied };
}


/** Seed POA&M working-paper rows from open scan findings. Existing columns only. Never mint controls, CCI maps, or auto-Satisfied. */

import { asList } from "./inventory.mjs";
import {
  emptyPoam,
  isBlankEmassPoamId,
  isRecognizedPoamRisk,
  isRecognizedPoamStatus,
  normalizeControlId,
  normalizePoam,
  TBD_EMASS,
} from "./poamCsv.mjs";
import { normalizeScanFinding } from "./ingest/scan.mjs";

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

const ALWAYS_SKIP = new Set(["unknown-control", "unrecognized-status", "unrecognized-risk"]);

function str(value) {
  return value == null ? "" : String(value).trim();
}

function key(value) {
  return str(value).toLowerCase();
}

function catalogSet(options) {
  const raw = options?.catalogIds;
  if (!raw) return new Set();
  const list = Array.isArray(raw) ? raw : raw instanceof Set ? [...raw] : [];
  return new Set(list.map((id) => key(id)));
}

export function isOpenFinding(finding) {
  return key(finding?.status) === "open";
}

function seedIdentity(row) {
  return `${key(row?.source)}|${key(row?.weakness)}|${key(row?.description)}`;
}

/**
 * Findings have no NIST control IDs. Control stays blank. Weakness/Description come from title/pluginId.
 * Does not invent Weakness Identifier, Raw Risk, Mitigations, or Security Checks.
 */
export function draftPoamFromOpenFinding(finding, index = 0) {
  const row = normalizeScanFinding(finding, index);
  const plugin = str(row.pluginId) || str(row.ruleId);
  const title = str(row.title) || plugin;
  const draft = normalizePoam(
    {
      ...emptyPoam(""),
      id: "",
      emassPoamId: TBD_EMASS,
      controlId: "",
      weakness: title,
      description: plugin,
      source: str(row.sourceType),
      status: "open",
      risk: "",
      residualRisk: "",
      resources: "",
      scheduledCompletion: "",
      milestones: "",
      poc: "",
      comments: "",
      atoBlocker: false,
    },
    index,
  );
  draft.id = "";
  return draft;
}

function fillSeedPoam(existing, incoming) {
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

function previewOneSeed(existingList, incoming, index, catalog) {
  const controlId = normalizeControlId(incoming?.controlId);
  if (controlId && !catalog.has(key(controlId))) {
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
  const matches = existingList.filter((row) => seedIdentity(row) === seedIdentity(incoming));
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
  const classified = fillSeedPoam(current, incoming);
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

/**
 * Open findings only. Non-open rows are omitted (not seeded). Blank Control is allowed
 * because findings have no NIST IDs; a non-blank unknown Control is skipped.
 */
export function previewPoamSeedFromFindings(existingPoams, findings, options = {}) {
  const existing = asList(existingPoams).map((row, i) => normalizePoam(row, i));
  const catalog = catalogSet(options);
  const items = [];
  asList(findings).forEach((raw, index) => {
    const finding = normalizeScanFinding(raw, index);
    if (!isOpenFinding(finding)) return;
    const incoming = draftPoamFromOpenFinding(finding, index);
    items.push(previewOneSeed(existing, incoming, index, catalog));
  });
  const counts = { add: 0, update: 0, unchanged: 0, conflict: 0 };
  for (const item of items) counts[item.status] += 1;
  return { kind: "poam-seed", items, counts };
}

function newId() {
  return `poam-${crypto.randomUUID().slice(0, 8)}`;
}

export function applyPoamSeedFromFindings(existingPoams, findings, options = {}) {
  const strategy = options.strategy === "replace" || options.mergeMode === "replace" ? "replace" : "merge";
  const confirmConflicts = Boolean(options.confirmConflicts);
  const preview = previewPoamSeedFromFindings(existingPoams, findings, options);
  const used = new Set();
  const nextById = new Map();
  for (const row of asList(existingPoams).map((item, i) => normalizePoam(item, i))) {
    if (row.id) nextById.set(row.id, row);
  }
  const applied = { added: 0, updated: 0, unchanged: 0, skipped: 0 };

  for (const item of preview.items) {
    if (item.status === "conflict") {
      if (ALWAYS_SKIP.has(item.reason) || !confirmConflicts) {
        applied.skipped += 1;
        continue;
      }
      if (item.existingId && !String(item.existingId).includes(",") && nextById.has(item.existingId)) {
        const current = nextById.get(item.existingId);
        const next = normalizePoam({ ...item.proposed, id: current.id }, 0);
        nextById.set(current.id, next);
        used.add(current.id);
        applied.updated += 1;
        continue;
      }
      const id = newId();
      nextById.set(id, normalizePoam({ ...item.incoming, id }, nextById.size));
      used.add(id);
      applied.added += 1;
      continue;
    }
    if (item.status === "add") {
      const id = newId();
      nextById.set(id, normalizePoam({ ...item.proposed, id }, nextById.size));
      used.add(id);
      applied.added += 1;
      continue;
    }
    if (item.status === "update") {
      nextById.set(item.existingId, normalizePoam({ ...item.proposed, id: item.existingId }, 0));
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
  return { ok: true, kind: "poam-seed", strategy, mergeMode: strategy, rows, preview, applied };
}

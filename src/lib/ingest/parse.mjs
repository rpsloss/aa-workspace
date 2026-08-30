/** PARSE HW/SW CSV and XLSX. Joint eMASS-oriented names. Never log CUI. */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { emptyAsset, emptySoftware, normalizeAsset, normalizeSoftware } from "../inventory.mjs";
import { looksLikePoamHeaders, mapPoamRow } from "../poamCsv.mjs";
import { looksLikePpsm, mapPpsmRow } from "./ppsm.mjs";
import { parseScanBuffer } from "./scan.mjs";

const require = createRequire(import.meta.url);
const MAP_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "emass-hw-sw-mapping.json");

export function mappingPath() {
  return MAP_PATH;
}

export function loadJointMap() {
  return JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
}

function str(value) {
  return value == null ? "" : String(value).trim();
}

function normHeader(value) {
  return str(value).replace(/\s+/g, " ").toLowerCase();
}

function aliasIndex(kindSpec) {
  const index = new Map();
  for (const col of kindSpec.columns || []) {
    const field = col.field;
    for (const alias of [col.header, ...(col.aliases || [])]) {
      const key = normHeader(alias);
      if (key && !index.has(key)) index.set(key, field);
    }
  }
  return index;
}

export function mappingHeaders(kind) {
  const map = loadJointMap();
  const spec = kind === "software" ? map.software : map.hardware;
  return (spec.columns || []).map((col) => col.header);
}

export function parseCsv(text) {
  const input = text == null ? "" : String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => str(cell) !== "")) rows.push(row);
      row = [];
    } else if (ch === "\r") {
      // swallow
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some((cell) => str(cell) !== "")) rows.push(row);
  }
  return rows;
}

function looksLikePoam(headers, map) {
  if (looksLikePoamHeaders(headers)) return true;
  const hints = (map?.poamHeaderHints || []).map(normHeader);
  if (!hints.length) return false;
  const set = new Set(headers.map(normHeader));
  let hits = 0;
  for (const hint of hints) {
    if (set.has(hint)) hits += 1;
  }
  return hits >= 2;
}

function scoreKind(headers, kindSpec) {
  const index = aliasIndex(kindSpec);
  let mapped = 0;
  for (const header of headers) {
    if (index.has(normHeader(header))) mapped += 1;
  }
  return mapped;
}

export function detectKind(headers, map = loadJointMap()) {
  if (looksLikePoam(headers, map)) return { kind: "poam", reason: null };
  if (looksLikePpsm(headers)) return { kind: "ppsm", reason: null };
  const hw = scoreKind(headers, map.hardware);
  const sw = scoreKind(headers, map.software);
  if (hw === 0 && sw === 0) return { kind: null, reason: "unrecognized-headers" };
  if (hw >= sw && hw >= 2) return { kind: "hardware", reason: null };
  if (sw > hw && sw >= 2) return { kind: "software", reason: null };
  if (hw >= 1 && hw >= sw) return { kind: "hardware", reason: null };
  if (sw >= 1) return { kind: "software", reason: null };
  return { kind: null, reason: "unrecognized-headers" };
}

function isJumpHostType(value, incomingLabel = "Jump Host") {
  const t = normHeader(value).replace(/[_-]+/g, " ");
  const want = normHeader(incomingLabel).replace(/[_-]+/g, " ");
  return t === want || t === "jump host" || t === "jumphost" || t === "jump";
}

function applyJumpHost(asset, map) {
  const spec = map?.hardware?.jumpHost || {};
  const incoming = spec.incomingAssetType || "Jump Host";
  const mappedType = spec.mappedAssetType || "Server";
  const notesValue = spec.notesValue || "Jump host";
  if (!isJumpHostType(asset.assetType, incoming)) return asset;
  const notes = str(asset.notes);
  const has = new RegExp(notesValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(notes);
  return {
    ...asset,
    assetType: mappedType,
    notes: has ? notes : notes ? `${notes}; ${notesValue}` : notesValue,
  };
}

function mapRow(headers, cells, kind, map) {
  const kindSpec = kind === "software" ? map.software : map.hardware;
  const index = aliasIndex(kindSpec);
  const fields = {};
  headers.forEach((header, i) => {
    const field = index.get(normHeader(header));
    if (!field) return;
    const value = str(cells[i]);
    if (!Object.hasOwn(fields, field) || fields[field] === "") fields[field] = value;
  });
  if (kind === "hardware") {
    const row = applyJumpHost(normalizeAsset({ ...emptyAsset(""), ...fields }, 0), map);
    row.id = "";
    return row;
  }
  const row = normalizeSoftware({ ...emptySoftware(""), ...fields }, 0);
  row.id = "";
  return row;
}

function sheetToAoa(sheet, XLSX) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
}

function aoaToTable(aoa) {
  const rows = (aoa || [])
    .map((row) => (Array.isArray(row) ? row.map((cell) => str(cell)) : []))
    .filter((row) => row.some((cell) => cell !== ""));
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0];
  const records = rows.slice(1);
  return { headers, records };
}

function extensionOf(filename) {
  const base = str(filename).split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot).toLowerCase() : "";
}

export function kindFromArtifactType(value) {
  const raw = str(value).toLowerCase();
  if (raw === "hardware" || raw === "hardware-baseline") return "hardware";
  if (raw === "software" || raw === "software-baseline") return "software";
  if (raw === "poam") return "poam";
  if (raw === "ppsm") return "ppsm";
  if (raw === "nessus") return "nessus";
  if (raw === "cklb") return "cklb";
  return null;
}

export function artifactTypeFromKind(kind) {
  if (kind === "hardware") return "hardware-baseline";
  if (kind === "software") return "software-baseline";
  if (kind === "poam") return "poam";
  if (kind === "ppsm") return "ppsm";
  if (kind === "nessus") return "nessus";
  if (kind === "cklb") return "cklb";
  return kind || "";
}

export function isScanKind(kind) {
  return kind === "nessus" || kind === "cklb" || kind === "scan";
}

export function classifyIngestFile(filename, buffer) {
  const ext = extensionOf(filename);
  const name = str(filename).toLowerCase();
  if (ext === ".ckl" || name.endsWith(".ckl")) {
    return { mode: "unsupported", reason: "ckl-xml-not-parsed", ext: ".ckl" };
  }
  if (ext === ".nessus" || name.endsWith(".nessus")) {
    return { mode: "parse", reason: null, ext: ".nessus" };
  }
  if (ext === ".cklb" || name.endsWith(".cklb")) {
    return { mode: "parse", reason: null, ext: ".cklb" };
  }
  if (buffer && Buffer.isBuffer(buffer)) {
    const head = buffer.subarray(0, Math.min(buffer.length, 512)).toString("utf8");
    if (/NessusClientData/i.test(head)) return { mode: "parse", reason: null, ext: ext || ".nessus" };
    if (ext === ".cklb") {
      try {
        const parsed = JSON.parse(buffer.toString("utf8"));
        if (parsed && typeof parsed === "object" && (parsed.stigs || parsed.cklb || parsed.benchmarks || parsed.target_data)) {
          return { mode: "parse", reason: null, ext: ".cklb" };
        }
      } catch {
        // not JSON
      }
    }
    if (/<CHECKLIST\b/i.test(head) && (ext === ".ckl" || ext === ".xml")) {
      return { mode: "unsupported", reason: "ckl-xml-not-parsed", ext: ext || ".ckl" };
    }
  }
  if (ext === ".csv" || ext === ".xlsx" || ext === ".xls") return { mode: "parse", reason: null, ext };
  return { mode: "store-only", reason: null, ext };
}

export function isScanParseFile(filename, buffer) {
  const classified = classifyIngestFile(filename, buffer);
  return classified.mode === "parse" && (classified.ext === ".nessus" || classified.ext === ".cklb");
}

function parseTabular(headers, records, requestedKind, map) {
  const requested =
    requestedKind === "hardware" ||
    requestedKind === "software" ||
    requestedKind === "poam" ||
    requestedKind === "ppsm"
      ? requestedKind
      : null;
  let kind = requested;
  if (looksLikePoam(headers, map)) {
    kind = "poam";
  } else if (looksLikePpsm(headers)) {
    kind = "ppsm";
  } else if (!kind) {
    const detected = detectKind(headers, map);
    if (!detected.kind) {
      return { ok: false, kind: null, errorClass: "UnrecognizedIngest", reason: detected.reason, rows: [] };
    }
    kind = detected.kind;
  }
  if (kind === "poam") {
    const rows = records.map((cells) => {
      const row = mapPoamRow(headers, cells);
      row.id = "";
      return row;
    });
    return { ok: true, kind: "poam", errorClass: null, reason: null, rows };
  }
  if (kind === "ppsm") {
    const rows = records.map((cells) => {
      const row = mapPpsmRow(headers, cells);
      row.id = "";
      return row;
    });
    return { ok: true, kind: "ppsm", errorClass: null, reason: null, rows };
  }
  const rows = records.map((cells) => mapRow(headers, cells, kind, map));
  return { ok: true, kind, errorClass: null, reason: null, rows };
}

export function parseIngestBuffer(buffer, options = {}) {
  const filename = str(options.filename);
  const requestedKind = kindFromArtifactType(options.artifactType || options.kind);
  const classified = classifyIngestFile(filename, buffer);
  if (classified.mode === "parse" && (classified.ext === ".nessus" || classified.ext === ".cklb")) {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
    return parseScanBuffer(buf, { filename, ext: classified.ext });
  }
  if (classified.mode === "unsupported") {
    return {
      ok: false,
      mode: "unsupported",
      kind: null,
      artifactType: requestedKind ? artifactTypeFromKind(requestedKind) : "",
      errorClass: "UnsupportedIngestType",
      reason: classified.reason,
      rows: [],
    };
  }
  if (classified.mode === "store-only") {
    return {
      ok: true,
      mode: "store-only",
      kind: null,
      artifactType: str(options.artifactType),
      errorClass: null,
      reason: "store-only",
      rows: [],
    };
  }
  const map = options.map || loadJointMap();
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  let table;
  if (classified.ext === ".xlsx" || classified.ext === ".xls") {
    let XLSX;
    try {
      XLSX = require("xlsx");
    } catch {
      return {
        ok: false,
        mode: "parse",
        kind: requestedKind,
        artifactType: requestedKind ? artifactTypeFromKind(requestedKind) : "",
        errorClass: "XlsxUnavailable",
        reason: "xlsx-unavailable",
        rows: [],
      };
    }
    const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    const names = wb.SheetNames || [];
    let chosen = names[0];
    if (requestedKind === "hardware" || requestedKind === "software") {
      const want = requestedKind === "hardware" ? /hardware|asset|hw/i : /software|sw/i;
      const hit = names.find((n) => want.test(n));
      if (hit) chosen = hit;
    } else {
      for (const name of names) {
        const candidate = aoaToTable(sheetToAoa(wb.Sheets[name], XLSX));
        const detected = detectKind(candidate.headers, map);
        if (detected.kind) {
          chosen = name;
          table = candidate;
          break;
        }
      }
    }
    if (!table) table = aoaToTable(sheetToAoa(wb.Sheets[chosen], XLSX));
  } else {
    const aoa = parseCsv(buf.toString("utf8"));
    table = aoaToTable(aoa);
  }
  const parsed = parseTabular(table.headers, table.records, requestedKind, map);
  return {
    ok: parsed.ok,
    mode: "parse",
    kind: parsed.kind,
    artifactType: parsed.kind ? artifactTypeFromKind(parsed.kind) : "",
    errorClass: parsed.errorClass,
    reason: parsed.reason,
    rows: parsed.rows,
  };
}

export { isJumpHostType, applyJumpHost };

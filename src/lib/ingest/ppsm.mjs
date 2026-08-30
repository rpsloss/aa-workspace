/** PPSM working-paper CSV → existing dataFlows fields. Not an official DISA/PPSM template. Never log CUI. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptyDataFlow, normalizeDataFlow } from "../boundary.mjs";

const MAP_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "ppsm-mapping.json");

function str(value) {
  return value == null ? "" : String(value).trim();
}

function normHeader(value) {
  return str(value).replace(/\s+/g, " ").toLowerCase();
}

export function ppsmMappingPath() {
  return MAP_PATH;
}

export function loadPpsmMap() {
  return JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
}

export function ppsmHeaders() {
  const map = loadPpsmMap();
  return (map.columns || []).map((col) => col.header);
}

function aliasIndex(map) {
  const index = new Map();
  for (const col of map.columns || []) {
    const field = col.field;
    for (const alias of [col.header, ...(col.aliases || [])]) {
      const key = normHeader(alias);
      if (key && !index.has(key)) index.set(key, field);
    }
  }
  return index;
}

export function looksLikePpsm(headers) {
  const set = new Set((headers || []).map(normHeader));
  const hasDest = set.has("destination");
  const hasSrc = set.has("source");
  const hasProto = set.has("protocol");
  const hasPort = set.has("port");
  if (hasDest && hasSrc && (hasProto || hasPort)) return true;
  if (hasDest && (hasProto || hasPort) && (hasSrc || set.has("description"))) return true;
  return false;
}

function humanFlowName(source, destination, description) {
  if (description) return description;
  if (source && destination) return `${source}→${destination}`;
  return source || destination || "";
}

/**
 * Map a PPSM CSV row onto dataFlow fields only (not inbound/outbound).
 * Protocol and Port go on optional `protocol`/`port` — never concatenated into `name`.
 * `name` is a human label (description, else source→dest). Does not invent partner names or ports.
 */
export function mapPpsmFields(fields) {
  const source = str(fields?.source);
  const destination = str(fields?.destination);
  const protocol = str(fields?.protocol);
  const port = str(fields?.port);
  const description = str(fields?.description);
  const row = emptyDataFlow("");
  row.name = humanFlowName(source, destination, description);
  row.source = source;
  row.destination = destination;
  row.description = description;
  row.protocol = protocol;
  row.port = port;
  row.notes = "";
  row.id = "";
  return row;
}

export function mapPpsmRow(headers, cells, map = loadPpsmMap()) {
  const index = aliasIndex(map);
  const fields = {};
  (headers || []).forEach((header, i) => {
    const field = index.get(normHeader(header));
    if (!field) return;
    const value = str(cells?.[i]);
    if (!Object.hasOwn(fields, field) || fields[field] === "") fields[field] = value;
  });
  const row = mapPpsmFields(fields);
  return normalizeDataFlow({ ...row, id: "" }, 0);
}

export function parsePpsmRecords(headers, records, map = loadPpsmMap()) {
  const rows = (records || []).map((cells) => {
    const row = mapPpsmRow(headers, cells, map);
    row.id = "";
    return row;
  });
  return { ok: true, kind: "ppsm", artifactType: "ppsm", errorClass: null, reason: null, rows };
}

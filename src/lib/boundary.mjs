/** Authorization boundary tables and data flows. Schema 3 fields; package schema 5. Never log package contents. */

import { asList, ensureInventory, SCHEMA_VERSION } from "./inventory.mjs";

export const TBD = "TBD";
export const PACKAGE_SCHEMA_VERSION = SCHEMA_VERSION;
export const BOUNDARY_TABLE_HEADERS = ["Name", "Ownership", "Description", "Notes"];
export const DATA_FLOW_HEADERS = ["Name", "Source", "Destination", "Protocol", "Port", "Description", "Notes"];

const ENTRY_FIELDS = ["id", "name", "description", "ownership", "notes"];
const FLOW_FIELDS = ["id", "name", "source", "destination", "description", "notes", "protocol", "port"];

function str(value) {
  return value == null ? "" : String(value);
}

export function emptyBoundaryEntry(id = "") {
  return { id, name: "", description: "", ownership: "", notes: "" };
}

export function emptyBoundaryRow(id = "") {
  return emptyBoundaryEntry(id);
}

export function emptyDataFlow(id = "") {
  return { id, name: "", source: "", destination: "", description: "", notes: "", protocol: "", port: "" };
}

export function emptyBoundary() {
  return {
    inbound: [],
    outbound: [],
    interconnect: [],
  };
}

export function normalizeBoundaryEntry(row, index = 0) {
  const fallbackId = `boundary-${index + 1}`;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return emptyBoundaryEntry(fallbackId);
  }
  const next = { ...row };
  for (const key of ENTRY_FIELDS) {
    next[key] = key === "id" ? str(row.id) || fallbackId : str(row[key]);
  }
  return next;
}

export function normalizeBoundaryRow(row, index = 0) {
  return normalizeBoundaryEntry(row, index);
}

export function normalizeDataFlow(row, index = 0) {
  const fallbackId = `flow-${index + 1}`;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return emptyDataFlow(fallbackId);
  }
  const next = { ...row };
  for (const key of FLOW_FIELDS) {
    next[key] = key === "id" ? str(row.id) || fallbackId : str(row[key]);
  }
  return next;
}

export function normalizeBoundary(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    inbound: asList(src.inbound).map((row, i) => normalizeBoundaryEntry(row, i)),
    outbound: asList(src.outbound).map((row, i) => normalizeBoundaryEntry(row, i)),
    interconnect: asList(src.interconnect).map((row, i) => normalizeBoundaryEntry(row, i)),
  };
}

/**
 * Schema bump (boundary fields from 3). Missing boundary/dataFlows become empty arrays/object.
 * Missing diagram evidence id becomes "". Does not drop unrelated fields.
 * Does not invent rows.
 */
export function ensureBoundary(pkg) {
  if (pkg === null || pkg === undefined) return pkg;
  if (typeof pkg !== "object" || Array.isArray(pkg)) return pkg;
  return {
    ...pkg,
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    boundary: normalizeBoundary(pkg.boundary),
    dataFlows: asList(pkg.dataFlows).map((row, i) => normalizeDataFlow(row, i)),
    boundaryDiagramEvidenceId: str(pkg.boundaryDiagramEvidenceId),
  };
}

export function migratePackage(pkg) {
  return ensureBoundary(ensureInventory(pkg));
}

export function findDiagramEvidence(pkg) {
  const id = str(pkg?.boundaryDiagramEvidenceId);
  const list = asList(pkg?.evidence);
  if (!id) return null;
  return list.find((item) => item && str(item.id) === id) ?? null;
}

export function diagramSlot(pkg) {
  const evidence = findDiagramEvidence(pkg);
  const evidenceId = str(pkg?.boundaryDiagramEvidenceId);
  return {
    evidenceId,
    title: evidence ? str(evidence.title) : "",
    originalName: evidence ? str(evidence.originalName) : "",
    storedName: evidence ? str(evidence.storedName) : "",
    hasFile: Boolean(evidence && str(evidence.storedName)),
    hasSlot: Boolean(evidenceId),
  };
}

function mdCell(value) {
  const text = value == null ? "" : String(value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
  return text || "—";
}

function markdownTableOrTbd(rows, headers, cellsFor) {
  const list = asList(rows);
  if (list.length === 0) return TBD;
  const header = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = list.map((row) => `| ${cellsFor(row).map(mdCell).join(" | ")} |`).join("\n");
  return `${header}\n${sep}\n${body}`;
}

function entryCells(row) {
  return [row.name, row.ownership, row.description, row.notes];
}

export function sspBoundaryMarkdown(pkg) {
  const b = ensureBoundary(pkg && typeof pkg === "object" && !Array.isArray(pkg) ? pkg : {});
  return {
    inbound: markdownTableOrTbd(b.boundary.inbound, BOUNDARY_TABLE_HEADERS, entryCells),
    outbound: markdownTableOrTbd(b.boundary.outbound, BOUNDARY_TABLE_HEADERS, entryCells),
    interconnect: markdownTableOrTbd(b.boundary.interconnect, BOUNDARY_TABLE_HEADERS, entryCells),
    dataFlows: markdownTableOrTbd(b.dataFlows, DATA_FLOW_HEADERS, (row) => [
      row.name,
      row.source,
      row.destination,
      row.protocol,
      row.port,
      row.description,
      row.notes,
    ]),
  };
}

export function renderBoundaryTablesMarkdown(pkg) {
  const tables = sspBoundaryMarkdown(pkg);
  return `### Inbound
${tables.inbound}

### Outbound
${tables.outbound}

### Interconnections
${tables.interconnect}`;
}

export function renderDataFlowsMarkdown(pkg) {
  return sspBoundaryMarkdown(pkg).dataFlows;
}

export function sspDiagramSlotMarkdown(pkg) {
  const slot = diagramSlot(pkg);
  if (!slot.hasSlot) return TBD;
  const file = slot.hasFile ? slot.originalName || slot.storedName : "no file attached";
  const titleBit = slot.title ? `: ${slot.title}` : "";
  return `Boundary diagram evidence slot ${slot.evidenceId}${titleBit}. File: ${file}. File is not required.`;
}

export function renderDiagramSlotMarkdown(pkg) {
  return sspDiagramSlotMarkdown(pkg);
}

/**
 * Accepted F2 sample seed (CoS). Inbound/outbound/dataFlows stay empty → SSP TBD.
 * Enterprise ICAM, GCCS-adjacent logistics feeds, enterprise SIEM, and patch WSUS/satellite
 * remain in intake/SSP prose only — not table rows. No ports or classification markings.
 * One interconnect: site-to-site VPN concentrator, ownership inherited/GSS, not a 9th host.
 */
export function seedSldssBoundary() {
  return {
    inbound: [],
    outbound: [],
    interconnect: [
      normalizeBoundaryEntry({
        id: "sldss-ix-vpn",
        name: "site-to-site VPN concentrator",
        description: "used for the alternate processing site",
        ownership: "inherited/GSS",
        notes: "Inherited/GSS interconnect. Not an SLDSS host; left off assets[].",
      }, 0),
    ],
  };
}

export function seedSldssDataFlows() {
  return [];
}

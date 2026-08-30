/** eMASS working-papers zip (GENERATE). In-memory only. Never log CUI. */

import { asList, normalizeAsset, normalizeSoftware } from "./inventory.mjs";
import { diagramSlot, sspBoundaryMarkdown, TBD } from "./boundary.mjs";
import { migratePackage, missingInheritanceSourceControls } from "./inheritance.mjs";
import { loadJointMap } from "./ingest/parse.mjs";
import { sspMarkdown } from "./sspMarkdown.mjs";
import { poamCsv } from "./poamCsv.mjs";
import { buildZip } from "./zipMemory.mjs";

export const ZIP_FALLBACK_ACRONYM = "sldss";
export const ZIP_SUFFIX = "-emass-working-papers.zip";
export const ARTIFACT_INDEX_COLUMNS = ["type", "originalName", "storedName", "mode", "taggedAt"];

function str(value) {
  return value == null ? "" : String(value);
}

function csvEscape(value) {
  const text = str(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function emitZipAcronym(pkg) {
  const intake = pkg?.intake && typeof pkg.intake === "object" ? pkg.intake : {};
  const safe = str(intake.acronym)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 48);
  return safe || ZIP_FALLBACK_ACRONYM;
}

export function emitZipFilename(pkg) {
  return `${emitZipAcronym(pkg)}${ZIP_SUFFIX}`;
}

export function jointCsv(kind, rows) {
  const map = loadJointMap();
  const spec = kind === "software" ? map.software : map.hardware;
  const columns = Array.isArray(spec?.columns) ? spec.columns : [];
  const headers = columns.map((col) => col.header);
  const list = asList(rows);
  const lines = list.map((row) => {
    const item = kind === "software" ? normalizeSoftware(row) : normalizeAsset(row);
    return columns.map((col) => csvEscape(item[col.field] ?? "")).join(",");
  });
  return [headers.join(","), ...lines].join("\n");
}

export function artifactIndexCsv(artifacts) {
  const rows = asList(artifacts).map((row) => {
    const type = str(row?.artifactType || row?.type);
    return [type, str(row?.originalName), str(row?.storedName), str(row?.mode), str(row?.taggedAt)]
      .map(csvEscape)
      .join(",");
  });
  return [ARTIFACT_INDEX_COLUMNS.join(","), ...rows].join("\n");
}

function originalsMap(originals) {
  const map = new Map();
  if (!originals) return map;
  if (originals instanceof Map) {
    for (const [key, value] of originals) {
      const name = str(key).replace(/\\/g, "/").split("/").pop();
      if (name && Buffer.isBuffer(value)) {
        map.set(name, value);
        map.set(str(key), value);
      }
    }
    return map;
  }
  if (typeof originals === "object") {
    for (const [key, value] of Object.entries(originals)) {
      const name = str(key).replace(/\\/g, "/").split("/").pop();
      if (name && Buffer.isBuffer(value)) {
        map.set(name, value);
        map.set(key, value);
      }
    }
  }
  return map;
}

function tableStatus(rows, emptyLabel) {
  const list = asList(rows);
  if (list.length === 0) return { status: "TBD", notes: emptyLabel };
  return { status: "present", notes: `${list.length} row${list.length === 1 ? "" : "s"}` };
}

function fieldBlankStatus(assets, field, label) {
  const list = asList(assets);
  if (list.length === 0) return { status: "TBD", notes: `no hardware rows (${label})` };
  const blank = list.filter((row) => !str(row?.[field]).trim()).length;
  if (blank > 0) return { status: "TBD", notes: `${blank} of ${list.length} hardware rows blank ${label}` };
  return { status: "present", notes: `${list.length} hardware rows have ${label}` };
}

export function completenessChecklist(pkg, options = {}) {
  const b = migratePackage(pkg && typeof pkg === "object" && !Array.isArray(pkg) ? pkg : {});
  const tables = sspBoundaryMarkdown(b);
  const inbound = tableStatus(b.boundary?.inbound, "empty inbound");
  const outbound = tableStatus(b.boundary?.outbound, "empty outbound");
  const dataFlows = tableStatus(b.dataFlows, "empty dataFlows");
  const host = fieldBlankStatus(b.assets, "hostName", "Host Name");
  const ip = fieldBlankStatus(b.assets, "ipAddress", "IP Address");
  const mac = fieldBlankStatus(b.assets, "macAddress", "MAC Address");

  const slot = diagramSlot(b);
  const diagram = slot.hasFile
    ? { status: "present", notes: slot.originalName || slot.storedName }
    : { status: "TBD", notes: "missing boundary diagram file" };

  const missingSource = missingInheritanceSourceControls(b);
  const inheritance =
    missingSource.length === 0
      ? { status: "present", notes: "no inherited/hybrid controls without a source" }
      : {
          status: "TBD",
          notes: `${missingSource.length} inherited/hybrid without source`,
        };

  const poams = asList(b.poams);
  const tbdPoam = poams.filter((row) => {
    const id = str(row?.emassPoamId).trim();
    return !id || id === "TBD-eMASS";
  });
  const poamId =
    tbdPoam.length === 0
      ? { status: "present", notes: poams.length === 0 ? "no POA&Ms" : "eMASS POA&M IDs pasted" }
      : { status: "TBD", notes: `${tbdPoam.length} of ${poams.length} emassPoamId TBD-eMASS` };

  const map = originalsMap(options.originals);
  const artifacts = asList(b.artifacts);
  const missingOriginals = artifacts.filter((row) => {
    const stored = str(row?.storedName).replace(/\\/g, "/").split("/").pop();
    if (!stored) return true;
    return !map.has(stored) && !map.has(str(row.storedName));
  });
  const tagged =
    missingOriginals.length === 0
      ? { status: "present", notes: artifacts.length === 0 ? "no tagged originals" : "tagged originals on disk" }
      : { status: "TBD", notes: `${missingOriginals.length} tagged original missing` };

  const line = (label, item) => `- ${label}: ${item.status}${item.notes ? ` (${item.notes})` : ""}`;

  return `# Completeness checklist

Working papers only. Not an AO or SCA decision. eMASS remains the system of record. CMMC is out of scope.

SSP empty inbound/outbound/dataFlows tables export as ${TBD}. emassPoamId stays TBD-eMASS until pasted.

## Boundary tables

${line("inbound", inbound)}
${line("outbound", outbound)}
${line("dataFlows", dataFlows)}

SSP inbound render: ${tables.inbound === TBD ? TBD : "present"}
SSP outbound render: ${tables.outbound === TBD ? TBD : "present"}
SSP dataFlows render: ${tables.dataFlows === TBD ? TBD : "present"}

## Hardware Host / IP / MAC

${line("Host Name", host)}
${line("IP Address", ip)}
${line("MAC Address", mac)}

## Boundary diagram file

${line("boundary diagram file", diagram)}

## inherited/hybrid without source

${line("inherited/hybrid without source", inheritance)}

## emassPoamId

${line("emassPoamId", poamId)}

## Tagged originals

${line("tagged original", tagged)}
`;
}

function originalZipName(storedName) {
  const base = str(storedName).replace(/\\/g, "/").split("/").pop();
  return base ? `originals/${base}` : "";
}

/**
 * Build zip entry list. `originals` is storedName -> Buffer (decrypted, in memory).
 * Omit bytes when the slot is empty or the buffer is missing. Do not include package.json or controls CSV.
 */
export function buildEmitFiles(pkg, options = {}) {
  const b = migratePackage(pkg && typeof pkg === "object" && !Array.isArray(pkg) ? pkg : {});
  const ac = emitZipAcronym(b);
  const map = originalsMap(options.originals);
  const files = [
    { name: `${ac}-SSP.md`, data: Buffer.from(sspMarkdown(b), "utf8") },
    { name: `${ac}-POAM.csv`, data: Buffer.from(poamCsv(b), "utf8") },
    { name: `${ac}-hardware.csv`, data: Buffer.from(jointCsv("hardware", b.assets), "utf8") },
    { name: `${ac}-software.csv`, data: Buffer.from(jointCsv("software", b.software), "utf8") },
    { name: "artifact-index.csv", data: Buffer.from(artifactIndexCsv(b.artifacts), "utf8") },
    { name: "completeness-checklist.md", data: Buffer.from(completenessChecklist(b, { originals: map }), "utf8") },
  ];

  const used = new Set();
  for (const row of asList(b.artifacts)) {
    const stored = str(row?.storedName).replace(/\\/g, "/").split("/").pop();
    if (!stored || used.has(stored)) continue;
    const buf = map.get(stored) || map.get(str(row.storedName));
    if (!buf) continue;
    const zipName = originalZipName(stored);
    if (!zipName) continue;
    files.push({ name: zipName, data: buf });
    used.add(stored);
  }

  return files;
}

export function buildEmitZip(pkg, options = {}) {
  return buildZip(buildEmitFiles(pkg, options));
}

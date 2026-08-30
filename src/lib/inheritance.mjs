/** Inheritance sources. Schema 5. Never log package contents, CUI, PII, or control text. */

import { asList, ensureInventory, SCHEMA_VERSION } from "./inventory.mjs";
import { ensureBoundary } from "./boundary.mjs";
import { ensureArtifacts } from "./ingest/artifacts.mjs";
import { ensureStigAssignments } from "./stig.mjs";
import { ensureScanFindings } from "./ingest/scan.mjs";

export { SCHEMA_VERSION };

export const SELECTION_STATUSES = Object.freeze([
  "in-scope",
  "inherited",
  "hybrid",
  "not-applicable",
  "tailored-out",
]);

export const SLDSS_GSS_SOURCE_ID = "sldss-src-gss";
export const SLDSS_ICAM_SOURCE_ID = "sldss-src-icam";
export const SLDSS_COMPONENT_SOURCE_ID = "sldss-src-component";

export const SLDSS_GSS_PACKAGE_ID = "EM-GSS-0000441";
export const SLDSS_ICAM_PACKAGE_ID = "SAMPLE-ICAM";
export const SLDSS_COMPONENT_PACKAGE_ID = "SAMPLE-COMPONENT";

export const SAMPLE_GSS_SOURCE_ID = SLDSS_GSS_SOURCE_ID;
export const SAMPLE_ICAM_SOURCE_ID = SLDSS_ICAM_SOURCE_ID;
export const SAMPLE_COMPONENT_SOURCE_ID = SLDSS_COMPONENT_SOURCE_ID;
export const GSS_SOURCE_ID = SLDSS_GSS_SOURCE_ID;
export const ICAM_SOURCE_ID = SLDSS_ICAM_SOURCE_ID;
export const COMPONENT_SOURCE_ID = SLDSS_COMPONENT_SOURCE_ID;
export const GSS_PACKAGE_ID = SLDSS_GSS_PACKAGE_ID;
export const SAMPLE_ICAM_PACKAGE_ID = SLDSS_ICAM_PACKAGE_ID;
export const SAMPLE_COMPONENT_PACKAGE_ID = SLDSS_COMPONENT_PACKAGE_ID;

export const SLDSS_ICAM_CONTROL_IDS = Object.freeze([
  "IA-2",
  "IA-2(1)",
  "IA-2(2)",
  "IA-2(8)",
  "IA-2(12)",
  "IA-8",
  "IA-8(1)",
  "IA-8(2)",
  "IA-8(4)",
]);
export const SAMPLE_ICAM_INHERITED_IDS = SLDSS_ICAM_CONTROL_IDS;
export const SAMPLE_IA_INHERITED_IDS = SLDSS_ICAM_CONTROL_IDS;
export const ICAM_INHERITED_CONTROL_IDS = SLDSS_ICAM_CONTROL_IDS;

function str(value) {
  return value == null ? "" : String(value);
}

export function isSelectionStatus(value) {
  return SELECTION_STATUSES.includes(value);
}

export function isInheritedOrHybrid(selection) {
  return selection === "inherited" || selection === "hybrid";
}

export const selectionNeedsSource = isInheritedOrHybrid;
export const needsInheritanceSource = isInheritedOrHybrid;

export function isSampleSource(source) {
  if (!source || typeof source !== "object") return false;
  if (source.sample) return true;
  return str(source.packageId).startsWith("SAMPLE-");
}

export const sourceIsSample = isSampleSource;

export function emptyInheritanceSource(id = "") {
  return { id, name: "", packageId: "", sample: false, notes: "" };
}

export function normalizeInheritanceSource(row, index = 0) {
  const fallbackId = `inherit-${index + 1}`;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return emptyInheritanceSource(fallbackId);
  }
  const next = { ...row };
  next.id = str(row.id) || fallbackId;
  next.name = str(row.name);
  next.packageId = str(row.packageId || row.emassId || row.emassSystemId);
  next.notes = str(row.notes);
  next.sample = Boolean(row.sample) || next.packageId.startsWith("SAMPLE-");
  return next;
}

export function sourceLabel(source) {
  if (!source) return "";
  const idBit = source.packageId ? ` — ${source.packageId}` : "";
  const sampleBit = isSampleSource(source) ? " [SAMPLE]" : "";
  return `${source.name || source.id}${idBit}${sampleBit}`;
}

export function sourceNarrative(source) {
  if (!source) return "";
  const idBit = source.packageId ? ` — ${source.packageId}` : "";
  const sampleBit = isSampleSource(source) ? " SAMPLE" : "";
  return `${source.name || source.id}${idBit}${sampleBit}`.trim();
}

/**
 * Sample seed only. Do not call from GET hydrate.
 * Only wires when selection is already inherited or hybrid.
 */
export function sampleInheritanceSourceId(item, selection) {
  if (!isInheritedOrHybrid(selection)) return "";
  const id = str(item?.id);
  const family = str(item?.family);
  if (family === "PE" && id !== "PE-1") return SLDSS_GSS_SOURCE_ID;
  if (SLDSS_ICAM_CONTROL_IDS.includes(id)) return SLDSS_ICAM_SOURCE_ID;
  if (family === "PM") return SLDSS_COMPONENT_SOURCE_ID;
  return "";
}

export function seedSldssInheritanceSources() {
  return [
    normalizeInheritanceSource(
      {
        id: SLDSS_GSS_SOURCE_ID,
        name: "Installation GSS (Fort Example)",
        packageId: SLDSS_GSS_PACKAGE_ID,
        sample: true,
        notes: "SAMPLE. Providing GSS named in the sample SSP for PE (except PE-1).",
      },
      0,
    ),
    normalizeInheritanceSource(
      {
        id: SLDSS_ICAM_SOURCE_ID,
        name: "DoD ICAM",
        packageId: SLDSS_ICAM_PACKAGE_ID,
        sample: true,
        notes: "SAMPLE placeholder. Not an official eMASS ID.",
      },
      1,
    ),
    normalizeInheritanceSource(
      {
        id: SLDSS_COMPONENT_SOURCE_ID,
        name: "Component cybersecurity program",
        packageId: SLDSS_COMPONENT_PACKAGE_ID,
        sample: true,
        notes: "SAMPLE placeholder. Not an official eMASS ID. Organization-level PM family.",
      },
      2,
    ),
  ];
}

function ensureControlSourceIds(controls) {
  if (!controls || typeof controls !== "object" || Array.isArray(controls)) return controls;
  const next = {};
  for (const [id, row] of Object.entries(controls)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      next[id] = row;
      continue;
    }
    next[id] = { ...row, inheritanceSourceId: str(row.inheritanceSourceId) };
  }
  return next;
}

/**
 * Schema bump (stamped with SCHEMA_VERSION). Missing inheritanceSources → [].
 * Adds inheritanceSourceId: "" on existing controls. Does not invent sample rows
 * or overlay membership. Does not drop unrelated fields.
 */
export function ensureInheritance(pkg) {
  if (pkg === null || pkg === undefined) return pkg;
  if (typeof pkg !== "object" || Array.isArray(pkg)) return pkg;
  return {
    ...pkg,
    schemaVersion: SCHEMA_VERSION,
    inheritanceSources: asList(pkg.inheritanceSources).map((row, i) => normalizeInheritanceSource(row, i)),
    controls: ensureControlSourceIds(pkg.controls),
  };
}

/** Non-destructive hydrate: inventory + boundary + inheritance + artifacts + STIG assignments + scan findings. Never seeds sample rows. */
export function migratePackage(pkg) {
  return ensureScanFindings(ensureStigAssignments(ensureArtifacts(ensureInheritance(ensureBoundary(ensureInventory(pkg))))));
}

export function hydrateOnGet(pkg) {
  return migratePackage(pkg);
}

export function hydrateOnLoad(pkg) {
  return migratePackage(pkg);
}

export function hydrateNeedsPersist(original, hydrated) {
  if (!original || typeof original !== "object" || Array.isArray(original)) return false;
  if (!hydrated || typeof hydrated !== "object") return false;
  if (original.schemaVersion !== hydrated.schemaVersion) return true;
  if (!Object.hasOwn(original, "inheritanceSources")) return true;
  if (!Object.hasOwn(original, "artifacts")) return true;
  if (!Object.hasOwn(original, "assets")) return true;
  if (!Object.hasOwn(original, "software")) return true;
  if (!Object.hasOwn(original, "boundary")) return true;
  if (!Object.hasOwn(original, "dataFlows")) return true;
  if (!Object.hasOwn(original, "boundaryDiagramEvidenceId")) return true;
  if (!Object.hasOwn(original, "stigAssignments")) return true;
  if (!Object.hasOwn(original, "scanFindings")) return true;
  const controls = original.controls;
  if (controls && typeof controls === "object" && !Array.isArray(controls)) {
    for (const row of Object.values(controls)) {
      if (row && typeof row === "object" && !Object.hasOwn(row, "inheritanceSourceId")) return true;
    }
  }
  return false;
}

export const hydrationChanged = hydrateNeedsPersist;

export function findInheritanceSource(pkg, sourceId) {
  const id = str(sourceId);
  if (!id) return null;
  return asList(pkg?.inheritanceSources).find((row) => row && str(row.id) === id) ?? null;
}

export function sourceIdResolves(pkg, sourceId) {
  return Boolean(findInheritanceSource(pkg, sourceId));
}

export function controlHasValidInheritanceSource(pkg, control) {
  if (!control || typeof control !== "object") return false;
  if (!isInheritedOrHybrid(control.selection)) return true;
  return sourceIdResolves(pkg, control.inheritanceSourceId);
}

export function missingInheritanceSourceControls(pkg) {
  const controls =
    pkg?.controls && typeof pkg.controls === "object" && !Array.isArray(pkg.controls) ? Object.values(pkg.controls) : [];
  return controls.filter((row) => row && typeof row === "object" && !controlHasValidInheritanceSource(pkg, row));
}

export const controlsMissingInheritanceSource = missingInheritanceSourceControls;
export const inheritanceIssues = (pkg) =>
  missingInheritanceSourceControls(pkg).map((row) => str(row.controlId)).filter(Boolean);

export function validateInheritance(pkg) {
  const missing = missingInheritanceSourceControls(pkg);
  const errors = missing.map((row) => ({
    controlId: str(row.controlId),
    code: "missing-inheritance-source",
    message: "inherited/hybrid control requires an inheritanceSources[] id",
  }));
  if (errors.length === 0) {
    return { ok: true, errors: [], errorClass: null, count: 0, missingCount: 0, controlIds: [] };
  }
  return {
    ok: false,
    errors,
    errorClass: "InheritanceSourceRequired",
    count: errors.length,
    missingCount: errors.length,
    controlIds: errors.map((row) => row.controlId).filter(Boolean),
  };
}

export function validateInheritanceSave(pkg) {
  const result = validateInheritance(pkg);
  return {
    ok: result.ok,
    errorClass: result.errorClass,
    invalidCount: result.count,
    controlIds: result.controlIds,
  };
}

export function gatePackageSave(pkg) {
  const result = validateInheritance(pkg);
  return {
    allow: result.ok,
    errors: result.errors,
    errorClass: result.errorClass,
    count: result.count,
    missingCount: result.missingCount,
  };
}

export function rejectIfInvalidInheritance(pkg) {
  const result = validateInheritance(pkg);
  if (result.ok) return pkg;
  const err = new Error("InheritanceValidationError");
  err.name = "InheritanceValidationError";
  err.code = "missing-inheritance-source";
  err.controlCount = result.count;
  throw err;
}

export function inheritanceSaveError(pkg) {
  const result = validateInheritance(pkg);
  if (result.ok) return null;
  const err = new Error("InheritanceSourceRequired");
  err.name = "InheritanceSourceRequired";
  err.missingCount = result.count;
  return err;
}

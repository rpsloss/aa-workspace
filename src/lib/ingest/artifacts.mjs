/** Tagged ingest artifacts. Original bytes go through the encrypted store. Never log CUI. */

import { asList } from "../inventory.mjs";

export const PARSE_TYPES = Object.freeze(["hardware-baseline", "software-baseline", "poam", "ppsm"]);
export const STORE_ONLY_TYPES = Object.freeze(["ssp", "policy", "letter", "diagram", "nessus", "cklb", "tdd", "conops"]);
export const JOINT_ARTIFACT_TYPES = Object.freeze([...PARSE_TYPES, ...STORE_ONLY_TYPES]);
export const NOT_THIS_PASS = Object.freeze(["ssp-narrative"]);

function str(value) {
  return value == null ? "" : String(value);
}

export function isJointArtifactType(value) {
  return JOINT_ARTIFACT_TYPES.includes(value);
}

export function isStoreOnlyType(value) {
  return STORE_ONLY_TYPES.includes(value);
}

export function isParseType(value) {
  return PARSE_TYPES.includes(value);
}

/** SSP/policy/letter/diagram are STORE-only. nessus/cklb may PARSE from .nessus/.cklb or attach STORE-only. POA&M may also attach STORE-only even when PARSE is available. Old .ckl XML is not parsed. */
export function allowsStoreOnly(value) {
  return isStoreOnlyType(value) || value === "poam";
}

export function modeForType(artifactType) {
  if (PARSE_TYPES.includes(artifactType)) return "parse";
  return "store-only";
}

export function emptyArtifact(id = "") {
  return {
    id,
    artifactType: "diagram",
    originalName: "",
    storedName: "",
    mode: "store-only",
    taggedAt: "",
    notes: "",
  };
}

export function normalizeArtifact(row, index = 0) {
  const fallbackId = `artifact-${index + 1}`;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return emptyArtifact(fallbackId);
  }
  const artifactType = isJointArtifactType(row.artifactType) ? row.artifactType : "diagram";
  const mode =
    row.mode === "parse" || row.mode === "generate" || row.mode === "store-only"
      ? row.mode
      : modeForType(artifactType);
  return {
    id: str(row.id) || fallbackId,
    artifactType,
    originalName: str(row.originalName),
    storedName: str(row.storedName),
    mode,
    taggedAt: str(row.taggedAt || row.uploadedAt),
    notes: str(row.notes),
  };
}

/**
 * Missing artifacts → []. Does not invent files or sample rows.
 * Does not drop unrelated package fields. Does not bump schema by itself.
 */
export function ensureArtifacts(pkg) {
  if (pkg === null || pkg === undefined) return pkg;
  if (typeof pkg !== "object" || Array.isArray(pkg)) return pkg;
  return {
    ...pkg,
    artifacts: asList(pkg.artifacts).map((row, i) => normalizeArtifact(row, i)),
  };
}

export function artifactTypeForKind(kind) {
  if (kind === "hardware") return "hardware-baseline";
  if (kind === "software") return "software-baseline";
  if (kind === "poam") return "poam";
  if (kind === "ppsm") return "ppsm";
  return isJointArtifactType(kind) ? kind : null;
}

export function kindForArtifactType(artifactType) {
  if (artifactType === "hardware-baseline") return "hardware";
  if (artifactType === "software-baseline") return "software";
  if (artifactType === "poam") return "poam";
  if (artifactType === "ppsm") return "ppsm";
  return null;
}

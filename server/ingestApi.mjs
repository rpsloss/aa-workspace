import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { errorClass, loadPackage, saveEncryptedBytes, savePackage } from "./packageStore.mjs";
import { getHydratedPackage } from "./packageApi.mjs";
import { migratePackage, validateInheritance } from "../src/lib/inheritance.mjs";
import {
  artifactTypeFromKind,
  classifyIngestFile,
  isScanKind,
  isScanParseFile,
  kindFromArtifactType,
  parseIngestBuffer,
} from "../src/lib/ingest/parse.mjs";
import { applyMerge, previewMerge } from "../src/lib/ingest/merge.mjs";
import { applyScanMerge, previewScanMerge } from "../src/lib/scanFindings.mjs";
import { applyPoamSeedFromFindings, previewPoamSeedFromFindings } from "../src/lib/scanPoamSeed.mjs";
import {
  allowsStoreOnly,
  isStoreOnlyType,
  normalizeArtifact,
} from "../src/lib/ingest/artifacts.mjs";

function str(value) {
  return value == null ? "" : String(value);
}

function formFlag(value) {
  return value === true || value === "true" || value === "1" || value === "on";
}

function safeName(original) {
  return str(original || "upload").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizeArtifactType(value) {
  const raw = str(value).trim();
  const kind = kindFromArtifactType(raw);
  if (kind) return artifactTypeFromKind(kind);
  const lower = raw.toLowerCase();
  if (isStoreOnlyType(lower)) return lower;
  return "";
}

function normalizeStrategy(value) {
  return value === "replace" ? "replace" : "merge";
}

function publicItems(preview) {
  return (preview?.items || []).map((item) => ({
    status: item.status,
    reason: item.reason || "",
    index: item.index,
    existingId: item.existingId || "",
    incoming: item.incoming || {},
  }));
}

function taggedArtifact({ artifactType, originalName, storedName, mode }) {
  return normalizeArtifact({
    id: `artifact-${crypto.randomUUID().slice(0, 8)}`,
    artifactType,
    originalName,
    storedName,
    mode,
    taggedAt: new Date().toISOString(),
    notes: "",
  });
}

function evidenceDirFor(packagePath, options = {}) {
  return options.evidenceDir || path.join(path.dirname(packagePath), "evidence");
}

function emptyPreviewPkg() {
  return migratePackage({
    schemaVersion: 5,
    framework: "DoD RMF",
    catalog: "NIST SP 800-53 Revision 5",
    systemOfRecord: "eMASS",
    cmmcInScope: false,
    assets: [],
    software: [],
    artifacts: [],
    stigAssignments: [],
    scanFindings: [],
    evidence: [],
    inheritanceSources: [],
    controls: {},
    poams: [],
    boundary: { inbound: [], outbound: [], interconnect: [] },
    dataFlows: [],
  });
}

function catalogIdsOf(pkg) {
  const controls = pkg?.controls;
  if (!controls || typeof controls !== "object" || Array.isArray(controls)) return [];
  return Object.keys(controls);
}

function existingForKind(kind, pkg) {
  if (kind === "software") return Array.isArray(pkg?.software) ? pkg.software : [];
  if (kind === "poam") return Array.isArray(pkg?.poams) ? pkg.poams : [];
  if (kind === "ppsm") return Array.isArray(pkg?.dataFlows) ? pkg.dataFlows : [];
  return Array.isArray(pkg?.assets) ? pkg.assets : [];
}

function listKeyForKind(kind) {
  if (kind === "software") return "software";
  if (kind === "poam") return "poams";
  if (kind === "ppsm") return "dataFlows";
  return "assets";
}

export function previewIngestAgainstPackage(packagePath, upload = {}, options = {}) {
  const buffer = upload.buffer;
  const filename = str(upload.filename);
  const artifactType = normalizeArtifactType(upload.artifactType || upload.kind);
  if (!buffer) {
    return { ok: false, status: 400, errorClass: "NoFile", mode: null, artifactType, kind: null, counts: null, items: [] };
  }
  if (isStoreOnlyType(artifactType) && !isScanParseFile(filename, buffer)) {
    return {
      ok: true,
      status: 200,
      errorClass: null,
      mode: "store-only",
      artifactType,
      kind: null,
      reason: "store-only",
      counts: { add: 0, update: 0, unchanged: 0, conflict: 0 },
      items: [],
    };
  }
  const classified = classifyIngestFile(filename, buffer);
  if (classified.mode === "unsupported") {
    return {
      ok: false,
      status: 400,
      errorClass: "UnsupportedIngestType",
      mode: "unsupported",
      artifactType,
      kind: null,
      reason: classified.reason,
      counts: null,
      items: [],
    };
  }
  if (classified.mode === "store-only") {
    return {
      ok: true,
      status: 200,
      errorClass: null,
      mode: "store-only",
      artifactType,
      kind: null,
      reason: "store-only",
      counts: { add: 0, update: 0, unchanged: 0, conflict: 0 },
      items: [],
    };
  }

  const loaded = loadPackage(packagePath, options);
  if (!loaded.ok) {
    return {
      ok: false,
      status: 500,
      errorClass: loaded.errorClass || "PackageUnreadable",
      mode: "parse",
      artifactType,
      kind: null,
      counts: null,
      items: [],
    };
  }
  const pkg = loaded.missing ? emptyPreviewPkg() : migratePackage(loaded.package);
  const parsed = parseIngestBuffer(buffer, { filename, artifactType, kind: upload.kind });
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      errorClass: parsed.errorClass,
      mode: parsed.mode,
      artifactType: parsed.artifactType || artifactType,
      kind: parsed.kind,
      reason: parsed.reason,
      counts: null,
      items: [],
    };
  }
  if (parsed.mode === "store-only") {
    return {
      ok: true,
      status: 200,
      errorClass: null,
      mode: "store-only",
      artifactType: parsed.artifactType || artifactType,
      kind: null,
      reason: "store-only",
      counts: { add: 0, update: 0, unchanged: 0, conflict: 0 },
      items: [],
    };
  }
  if (isScanKind(parsed.kind)) {
    const preview = previewScanMerge(pkg.scanFindings, parsed.rows, pkg.assets, pkg.stigAssignments);
    return {
      ok: true,
      status: 200,
      errorClass: null,
      mode: "parse",
      artifactType: parsed.artifactType,
      kind: parsed.kind,
      reason: parsed.reason,
      counts: preview.counts,
      items: publicItems(preview),
      incoming: parsed.rows,
    };
  }
  const existing = existingForKind(parsed.kind, pkg);
  const preview = previewMerge(parsed.kind, existing, parsed.rows, { catalogIds: catalogIdsOf(pkg) });
  return {
    ok: true,
    status: 200,
    errorClass: null,
    mode: "parse",
    artifactType: parsed.artifactType,
    kind: parsed.kind,
    reason: parsed.reason,
    counts: preview.counts,
    items: publicItems(preview),
    incoming: parsed.rows,
  };
}

function persistOriginal(packagePath, evidenceDir, buffer, originalName, storeOpts) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const storedName = `${Date.now()}-${safeName(originalName)}`;
  const dest = path.join(evidenceDir, path.basename(storedName));
  const saved = saveEncryptedBytes(dest, buffer, storeOpts);
  return { storedName, bytes: saved.bytes, dest };
}

function appendArtifact(pkg, artifact) {
  const artifacts = Array.isArray(pkg.artifacts) ? pkg.artifacts.slice() : [];
  artifacts.unshift(artifact);
  return { ...pkg, artifacts };
}

export function applyIngest(packagePath, evidenceDir, upload = {}, options = {}) {
  const buffer = upload.buffer;
  const filename = str(upload.filename);
  const artifactType = normalizeArtifactType(upload.artifactType || upload.kind);
  const strategy = normalizeStrategy(upload.strategy || upload.mergeMode);
  const includeInheritedGss = formFlag(upload.includeInheritedGss) || formFlag(upload.confirmInheritedGss);
  const confirmConflicts = formFlag(upload.confirmConflicts);
  const dir = evidenceDir || evidenceDirFor(packagePath, options);

  if (!buffer) {
    return { ok: false, status: 400, errorClass: "NoFile", mode: null, artifactType, kind: null };
  }

  const loaded = getHydratedPackage(packagePath, options);
  if (!loaded.ok) {
    return {
      ok: false,
      status: loaded.status || 500,
      errorClass: loaded.errorClass || "PackageUnreadable",
      mode: null,
      artifactType,
      kind: null,
    };
  }
  if (loaded.missing) {
    return { ok: false, status: 404, errorClass: "PackageMissing", mode: null, artifactType, kind: null };
  }

  if (!isScanParseFile(filename, buffer) && (isStoreOnlyType(artifactType) || (artifactType === "poam" && formFlag(upload.storeOnly)))) {
    return storeTaggedArtifact(packagePath, dir, { buffer, filename, artifactType: artifactType || "poam" }, options);
  }

  const classified = classifyIngestFile(filename, buffer);
  if (classified.mode === "unsupported") {
    return {
      ok: false,
      status: 400,
      errorClass: "UnsupportedIngestType",
      mode: "unsupported",
      artifactType,
      kind: null,
      reason: classified.reason,
    };
  }
  if (classified.mode === "store-only") {
    if (allowsStoreOnly(artifactType)) {
      return storeTaggedArtifact(packagePath, dir, { buffer, filename, artifactType }, options);
    }
    return {
      ok: false,
      status: 400,
      errorClass: artifactType ? "StoreOnlyNeedsStore" : "MissingArtifactType",
      mode: "store-only",
      artifactType,
      kind: null,
      reason: "store-only",
    };
  }

  const parsed = parseIngestBuffer(buffer, { filename, artifactType, kind: upload.kind });
  if (!parsed.ok) {
    if (artifactType === "poam") {
      const stored = storeTaggedArtifact(packagePath, dir, { buffer, filename, artifactType: "poam" }, options);
      if (stored.ok) {
        return {
          ...stored,
          mode: "store-only",
          artifactType: "poam",
          kind: "poam",
          reason: parsed.reason || "parse-failed-stored",
          parseErrorClass: parsed.errorClass,
        };
      }
    }
    return {
      ok: false,
      status: 400,
      errorClass: parsed.errorClass,
      mode: parsed.mode,
      artifactType: parsed.artifactType || artifactType,
      kind: parsed.kind,
      reason: parsed.reason,
    };
  }
  if (parsed.mode !== "parse" || !parsed.kind) {
    if (artifactType === "poam") {
      return storeTaggedArtifact(packagePath, dir, { buffer, filename, artifactType: "poam" }, options);
    }
    return {
      ok: false,
      status: 400,
      errorClass: "UnrecognizedIngest",
      mode: parsed.mode,
      artifactType: parsed.artifactType || artifactType,
      kind: parsed.kind,
      reason: parsed.reason || "store-only",
    };
  }

  let merged;
  let next;
  if (isScanKind(parsed.kind)) {
    merged = applyScanMerge(loaded.package.scanFindings, parsed.rows, loaded.package.assets, loaded.package.stigAssignments, {
      strategy,
      includeInheritedGss,
      confirmConflicts,
    });
    next = { ...loaded.package, scanFindings: merged.rows };
  } else {
    const listKey = listKeyForKind(parsed.kind);
    merged = applyMerge(parsed.kind, existingForKind(parsed.kind, loaded.package), parsed.rows, {
      strategy,
      includeInheritedGss,
      confirmConflicts,
      catalogIds: catalogIdsOf(loaded.package),
    });
    next = { ...loaded.package, [listKey]: merged.rows };
  }

  let stored;
  try {
    stored = persistOriginal(packagePath, dir, buffer, filename, options);
  } catch (err) {
    return {
      ok: false,
      status: 500,
      errorClass: errorClass(err),
      mode: "parse",
      artifactType: parsed.artifactType,
      kind: parsed.kind,
    };
  }

  const artifact = taggedArtifact({
    artifactType: parsed.artifactType,
    originalName: filename,
    storedName: stored.storedName,
    mode: "parse",
  });
  next = appendArtifact(next, artifact);

  const check = validateInheritance(next);
  if (!check.ok) {
    return {
      ok: false,
      status: 400,
      errorClass: check.errorClass || "InheritanceSourceRequired",
      mode: "parse",
      artifactType: parsed.artifactType,
      kind: parsed.kind,
      counts: merged.preview.counts,
    };
  }

  try {
    const saved = savePackage(packagePath, next, options);
    return {
      ok: true,
      status: 200,
      errorClass: null,
      mode: "parse",
      artifactType: parsed.artifactType,
      kind: parsed.kind,
      strategy,
      mergeMode: strategy,
      applied: merged.applied,
      counts: merged.preview.counts,
      storedName: stored.storedName,
      artifact,
      bytes: saved.bytes,
      package: next,
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      errorClass: errorClass(err),
      mode: "parse",
      artifactType: parsed.artifactType,
      kind: parsed.kind,
    };
  }
}

export function storeTaggedArtifact(packagePath, evidenceDir, upload = {}, options = {}) {
  const buffer = upload.buffer;
  const filename = str(upload.filename);
  const artifactType = normalizeArtifactType(upload.artifactType);
  const dir = evidenceDir || evidenceDirFor(packagePath, options);
  if (!buffer) {
    return { ok: false, status: 400, errorClass: "NoFile" };
  }
  if (!allowsStoreOnly(artifactType)) {
    return { ok: false, status: 400, errorClass: "InvalidArtifactType" };
  }
  const loaded = getHydratedPackage(packagePath, options);
  if (!loaded.ok) {
    return { ok: false, status: loaded.status || 500, errorClass: loaded.errorClass || "PackageUnreadable" };
  }
  if (loaded.missing) {
    return { ok: false, status: 404, errorClass: "PackageMissing" };
  }
  let stored;
  try {
    stored = persistOriginal(packagePath, dir, buffer, filename, options);
  } catch (err) {
    return { ok: false, status: 500, errorClass: errorClass(err) };
  }
  const artifact = taggedArtifact({
    artifactType,
    originalName: filename,
    storedName: stored.storedName,
    mode: "store-only",
  });
  const next = appendArtifact(loaded.package, artifact);
  const check = validateInheritance(next);
  if (!check.ok) {
    return { ok: false, status: 400, errorClass: check.errorClass || "InheritanceSourceRequired" };
  }
  try {
    const saved = savePackage(packagePath, next, options);
    return {
      ok: true,
      status: 200,
      errorClass: null,
      artifact,
      storedName: stored.storedName,
      bytes: saved.bytes,
      package: next,
    };
  } catch (err) {
    return { ok: false, status: 500, errorClass: errorClass(err) };
  }
}


function publicSeedItems(preview) {
  return (preview?.items || []).map((item) => ({
    status: item.status,
    reason: item.reason || "",
    index: item.index,
    existingId: item.existingId || "",
    incoming: item.incoming || {},
    fields: item.fields || [],
  }));
}

/**
 * Preview POA&M seed from stored open scan findings. Does not write. Does not auto-Satisfied.
 * Scan PARSE apply does not call this.
 */
export function previewPoamSeedAgainstPackage(packagePath, options = {}) {
  const loaded = loadPackage(packagePath, options);
  if (!loaded.ok) {
    return {
      ok: false,
      status: 500,
      errorClass: loaded.errorClass || "PackageUnreadable",
      kind: "poam-seed",
      counts: null,
      items: [],
    };
  }
  const pkg = loaded.missing ? emptyPreviewPkg() : migratePackage(loaded.package);
  const preview = previewPoamSeedFromFindings(pkg.poams, pkg.scanFindings, { catalogIds: catalogIdsOf(pkg) });
  return {
    ok: true,
    status: 200,
    errorClass: null,
    kind: "poam-seed",
    mode: "seed",
    counts: preview.counts,
    items: publicSeedItems(preview),
  };
}

/**
 * Apply POA&M seed from stored open findings. Merge preview; no silent overwrite.
 * Does not mint controls. Does not change assessment/selection/implementation.
 */
export function applyPoamSeed(packagePath, options = {}) {
  const strategy = normalizeStrategy(options.strategy || options.mergeMode);
  const confirmConflicts = formFlag(options.confirmConflicts);
  const loaded = getHydratedPackage(packagePath, options);
  if (!loaded.ok) {
    return {
      ok: false,
      status: loaded.status || 500,
      errorClass: loaded.errorClass || "PackageUnreadable",
      kind: "poam-seed",
    };
  }
  if (loaded.missing) {
    return { ok: false, status: 404, errorClass: "PackageMissing", kind: "poam-seed" };
  }
  const pkg = loaded.package;
  const merged = applyPoamSeedFromFindings(pkg.poams, pkg.scanFindings, {
    strategy,
    confirmConflicts,
    catalogIds: catalogIdsOf(pkg),
  });
  const next = { ...pkg, poams: merged.rows };
  const check = validateInheritance(next);
  if (!check.ok) {
    return {
      ok: false,
      status: 400,
      errorClass: check.errorClass || "InheritanceSourceRequired",
      kind: "poam-seed",
      counts: merged.preview.counts,
    };
  }
  try {
    const saved = savePackage(packagePath, next, options);
    return {
      ok: true,
      status: 200,
      errorClass: null,
      kind: "poam-seed",
      strategy,
      mergeMode: strategy,
      applied: merged.applied,
      counts: merged.preview.counts,
      items: publicSeedItems(merged.preview),
      bytes: saved.bytes,
      package: next,
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      errorClass: errorClass(err),
      kind: "poam-seed",
    };
  }
}

/** GET /api/emit — in-memory eMASS working-papers zip. Decrypt originals into zip buffers only. */

import fs from "node:fs";
import path from "node:path";
import { writeAudit } from "./audit.mjs";
import { errorClass, loadPossiblyEncryptedBytes, storePaths } from "./packageStore.mjs";
import { getHydratedPackage } from "./packageApi.mjs";
import { buildEmitZip, emitZipFilename } from "../src/lib/emit.mjs";

function basenameOnly(name) {
  return path.basename(String(name || ""));
}

export function emitWorkingPapers(packagePath, evidenceDir, options = {}) {
  const loaded = getHydratedPackage(packagePath, options);
  if (!loaded.ok) {
    return {
      ok: false,
      status: loaded.status || 500,
      errorClass: loaded.errorClass || "PackageUnreadable",
      buffer: null,
      filename: "",
      bytes: 0,
    };
  }
  if (loaded.missing) {
    return { ok: false, status: 404, errorClass: "PackageMissing", buffer: null, filename: "", bytes: 0 };
  }

  const originals = new Map();
  const dir = evidenceDir || path.join(path.dirname(packagePath), "evidence");
  const artifacts = Array.isArray(loaded.package.artifacts) ? loaded.package.artifacts : [];
  for (const row of artifacts) {
    const storedName = basenameOnly(row?.storedName);
    if (!storedName) continue;
    const filePath = path.join(dir, storedName);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    const got = loadPossiblyEncryptedBytes(filePath, options);
    if (!got.ok) {
      const { auditPath } = storePaths(packagePath);
      if (options.audit !== false) {
        writeAudit(options.auditPath || auditPath, {
          action: "decrypt-fail",
          outcome: "fail",
          bytesIn: got.bytes || 0,
          bytesOut: 0,
        });
      }
      continue;
    }
    if (got.missing || !got.buffer) continue;
    originals.set(storedName, got.buffer);
  }

  const buffer = buildEmitZip(loaded.package, { originals });
  const filename = emitZipFilename(loaded.package);
  const { auditPath } = storePaths(packagePath);
  if (options.audit !== false) {
    writeAudit(options.auditPath || auditPath, {
      action: "export",
      outcome: "ok",
      bytesIn: 0,
      bytesOut: buffer.length,
    });
  }
  return {
    ok: true,
    status: 200,
    errorClass: null,
    buffer,
    filename,
    bytes: buffer.length,
    persisted: loaded.persisted,
    encrypted: loaded.encrypted,
  };
}

export { errorClass };

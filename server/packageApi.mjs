import { errorClass, loadPackage, savePackage } from "./packageStore.mjs";
import { hydrateNeedsPersist, migratePackage, validateInheritance } from "../src/lib/inheritance.mjs";

/**
 * GET /api/package: non-destructive schema hydrate.
 * Picks up missing arrays (inheritanceSources, assets, …) as [].
 * Never replaces user rows with sample seed.
 * If the on-disk package is still plaintext, encrypt-in-place atomically.
 * Does not wait for a UI save. Fail closed without wipe.
 */
export function getHydratedPackage(packagePath, options = {}) {
  const result = loadPackage(packagePath, options);
  if (!result.ok) {
    return {
      ok: false,
      status: 500,
      missing: false,
      package: null,
      errorClass: result.errorClass,
      persisted: false,
      bytes: result.bytes || 0,
      encrypted: Boolean(result.encrypted),
    };
  }
  if (result.missing) {
    return {
      ok: true,
      status: 200,
      missing: true,
      package: null,
      errorClass: null,
      persisted: false,
      bytes: 0,
      encrypted: false,
    };
  }
  const hydrated = migratePackage(result.package);
  const needsEncrypt = result.encrypted === false;
  let persisted = false;
  let encrypted = Boolean(result.encrypted);
  if (hydrateNeedsPersist(result.package, hydrated) || needsEncrypt) {
    try {
      savePackage(packagePath, hydrated, options);
      persisted = true;
      encrypted = true;
    } catch (err) {
      return {
        ok: false,
        status: 500,
        missing: false,
        package: null,
        errorClass: errorClass(err),
        persisted: false,
        bytes: result.bytes || 0,
        encrypted: Boolean(result.encrypted),
      };
    }
  }
  return {
    ok: true,
    status: 200,
    missing: false,
    package: hydrated,
    errorClass: null,
    persisted,
    bytes: result.bytes || 0,
    encrypted,
  };
}

export function putValidatedPackage(packagePath, pkg, options = {}) {
  if (pkg === null || pkg === undefined || typeof pkg !== "object" || Array.isArray(pkg)) {
    return { ok: false, status: 400, errorClass: "InvalidPackageShape", count: 0, bytes: 0 };
  }
  const hydrated = migratePackage(pkg);
  const check = validateInheritance(hydrated);
  if (!check.ok) {
    return {
      ok: false,
      status: 400,
      errorClass: check.errorClass || "InheritanceSourceRequired",
      count: check.missingCount || check.count || 0,
      bytes: 0,
    };
  }
  try {
    const saved = savePackage(packagePath, hydrated, options);
    return { ok: true, status: 200, errorClass: null, count: 0, bytes: saved.bytes };
  } catch (err) {
    return { ok: false, status: 500, errorClass: errorClass(err), count: 0, bytes: 0 };
  }
}

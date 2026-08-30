import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { appendAudit } from "./auditLog.mjs";
import { encryptToFile, isEncryptedBuffer } from "./atRest.mjs";
import {
  errorClass,
  loadPossiblyEncryptedBytes,
  saveEncryptedBytes,
  storePaths,
} from "./packageStore.mjs";
import { logEvent } from "./log.mjs";
import { getHydratedPackage, putValidatedPackage } from "./packageApi.mjs";
import { applyIngest, applyPoamSeed, previewIngestAgainstPackage, previewPoamSeedAgainstPackage, storeTaggedArtifact } from "./ingestApi.mjs";
import { emitWorkingPapers } from "./emitApi.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const packagePath = path.join(dataDir, "package.json");
const evidenceDir = path.join(dataDir, "evidence");
const artifactsDir = path.join(dataDir, "artifacts");
const { auditPath } = storePaths(packagePath);
const storeOpts = {};

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });
fs.mkdirSync(artifactsDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const LISTEN_HOST = "127.0.0.1";
const LOCAL_VITE_ORIGIN = "http://127.0.0.1:5173";
const CLIENT_AUDIT_ACTIONS = new Set(["export", "reload-sample"]);

const app = express();
app.use(cors({ origin: LOCAL_VITE_ORIGIN }));
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    systemOfRecord: "eMASS",
    cmmc: false,
    framework: "DoD RMF / NIST SP 800-53 Rev 5",
  });
});

app.get("/api/package", (_req, res) => {
  const result = getHydratedPackage(packagePath, storeOpts);
  if (!result.ok) {
    logEvent("package.load.fail", { status: result.status, errorClass: result.errorClass });
    // Never overwrite a corrupt on-disk package with empty/partial state.
    res.status(result.status).json({ error: "package-unreadable", errorClass: result.errorClass });
    return;
  }
  if (result.missing) {
    logEvent("package.load.miss", { status: 200 });
    res.json({ package: null });
    return;
  }
  const controls = result.package?.controls;
  const controlCount =
    controls && typeof controls === "object" && !Array.isArray(controls) ? Object.keys(controls).length : 0;
  logEvent("package.load.ok", { status: 200, controlCount });
  res.json({ package: result.package });
});

app.put("/api/package", (req, res) => {
  const pkg = req.body?.package;
  const result = putValidatedPackage(packagePath, pkg, storeOpts);
  if (!result.ok) {
    logEvent("package.save.fail", {
      status: result.status,
      errorClass: result.errorClass,
      missingCount: result.count || 0,
    });
    const error =
      result.errorClass === "InvalidPackageShape"
        ? "Expected { package }"
        : result.errorClass === "InheritanceSourceRequired"
          ? "inheritance-source-required"
          : "package-save-failed";
    res.status(result.status).json({ error, errorClass: result.errorClass, missingCount: result.count || 0 });
    return;
  }
  try {
    for (const name of fs.readdirSync(evidenceDir)) {
      if (name.endsWith(".tmp")) continue;
      const filePath = path.join(evidenceDir, name);
      if (!fs.statSync(filePath).isFile()) continue;
      const raw = fs.readFileSync(filePath);
      if (!isEncryptedBuffer(raw)) encryptToFile(filePath, raw);
    }
  } catch (err) {
    logEvent("evidence.seal.fail", { errorClass: errorClass(err) });
  }
  logEvent("package.save.ok", { status: 200, bytes: result.bytes });
  res.json({ ok: true, savedAt: new Date().toISOString() });
});

function clientAudit(req, res) {
  const action = req.body?.action;
  if (!CLIENT_AUDIT_ACTIONS.has(action)) {
    res.status(400).json({ error: "invalid-action" });
    return;
  }
  const rawBytes = req.body?.bytesOut ?? req.body?.bytes;
  const bytes = typeof rawBytes === "number" && Number.isFinite(rawBytes) ? rawBytes : 0;
  appendAudit(auditPath, { action, outcome: "ok", bytes });
  res.json({ ok: true });
}

app.post("/api/audit", clientAudit);
app.post("/api/package-access", clientAudit);
app.post("/api/access-audit", clientAudit);
app.post("/api/package/audit", clientAudit);

app.post("/api/evidence/upload", upload.single("file"), (req, res) => {
  if (!req.file || !req.file.buffer) {
    logEvent("evidence.upload.fail", { status: 400, errorClass: "NoFile" });
    res.status(400).json({ error: "No file" });
    return;
  }
  const safe = String(req.file.originalname || "upload").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${Date.now()}-${safe}`;
  const dest = path.join(evidenceDir, path.basename(storedName));
  try {
    const saved = saveEncryptedBytes(dest, req.file.buffer);
    logEvent("evidence.upload.ok", { status: 200, bytes: saved.bytes || req.file.size });
    res.json({
      storedName,
      originalName: req.file.originalname,
      size: req.file.size,
      path: `data/evidence/${storedName}`,
    });
  } catch (err) {
    logEvent("evidence.upload.fail", { status: 500, errorClass: errorClass(err) });
    res.status(500).json({ error: "evidence-save-failed", errorClass: errorClass(err) });
  }
});

app.get("/api/evidence/file/:name", (req, res) => {
  const name = path.basename(req.params.name);
  const filePath = path.join(evidenceDir, name);
  if (!fs.existsSync(filePath)) {
    logEvent("evidence.get.miss", { status: 404 });
    res.status(404).end();
    return;
  }
  const loaded = loadPossiblyEncryptedBytes(filePath);
  if (!loaded.ok) {
    appendAudit(auditPath, { action: "decrypt-fail", outcome: "fail", bytes: loaded.bytes || 0 });
    logEvent("evidence.get.fail", { status: 500, errorClass: loaded.errorClass });
    res.status(500).json({ error: "evidence-unreadable", errorClass: loaded.errorClass });
    return;
  }
  res.status(200).send(loaded.buffer);
});


function formFlag(value) {
  if (value === true || value === "true" || value === "1" || value === "on") return true;
  return false;
}

app.post("/api/ingest/preview", upload.single("file"), (req, res) => {
  const result = previewIngestAgainstPackage(
    packagePath,
    {
      buffer: req.file?.buffer,
      filename: req.file?.originalname,
      artifactType: req.body?.artifactType || req.body?.kind,
    },
    storeOpts,
  );
  if (!result.ok) {
    logEvent("ingest.preview.fail", { status: result.status, errorClass: result.errorClass, kind: result.kind || undefined });
    res.status(result.status).json({
      error: "ingest-preview-failed",
      errorClass: result.errorClass,
      mode: result.mode,
      reason: result.reason,
    });
    return;
  }
  logEvent("ingest.preview.ok", {
    status: 200,
    kind: result.kind || undefined,
    rowCount: result.items?.length || 0,
    added: result.counts?.add || 0,
    updated: result.counts?.update || 0,
    unchanged: result.counts?.unchanged || 0,
    conflictCount: result.counts?.conflict || 0,
  });
  res.json({
    ok: true,
    mode: result.mode,
    artifactType: result.artifactType,
    kind: result.kind,
    reason: result.reason,
    counts: result.counts,
    items: result.items,
    incoming: result.incoming,
  });
});

app.post("/api/ingest/apply", upload.single("file"), (req, res) => {
  const result = applyIngest(
    packagePath,
    evidenceDir,
    {
      buffer: req.file?.buffer,
      filename: req.file?.originalname,
      artifactType: req.body?.artifactType || req.body?.kind,
      strategy: req.body?.strategy || req.body?.mergeMode,
      includeInheritedGss: formFlag(req.body?.includeInheritedGss) || formFlag(req.body?.confirmInheritedGss),
      confirmConflicts: formFlag(req.body?.confirmConflicts),
    },
    storeOpts,
  );
  if (!result.ok) {
    logEvent("ingest.apply.fail", { status: result.status, errorClass: result.errorClass, kind: result.kind || undefined });
    res.status(result.status).json({ error: "ingest-apply-failed", errorClass: result.errorClass, reason: result.reason });
    return;
  }
  logEvent("ingest.apply.ok", {
    status: 200,
    kind: result.kind,
    added: result.applied?.added || 0,
    updated: result.applied?.updated || 0,
    unchanged: result.applied?.unchanged || 0,
    skipped: result.applied?.skipped || 0,
    bytes: result.bytes || 0,
  });
  res.json({
    ok: true,
    artifactType: result.artifactType,
    kind: result.kind,
    strategy: result.strategy,
    mergeMode: result.mergeMode,
    applied: result.applied,
    counts: result.counts,
    package: result.package,
  });
});

app.post("/api/ingest/store", upload.single("file"), (req, res) => {
  const result = storeTaggedArtifact(
    packagePath,
    evidenceDir,
    { buffer: req.file?.buffer, filename: req.file?.originalname, artifactType: req.body?.artifactType },
    storeOpts,
  );
  if (!result.ok) {
    logEvent("ingest.store.fail", { status: result.status, errorClass: result.errorClass });
    res.status(result.status).json({ error: "ingest-store-failed", errorClass: result.errorClass });
    return;
  }
  logEvent("ingest.store.ok", { status: 200, bytes: result.bytes || 0 });
  res.json({ ok: true, artifact: result.artifact, package: result.package });
});


app.post("/api/ingest/poam-seed/preview", (_req, res) => {
  const result = previewPoamSeedAgainstPackage(packagePath, storeOpts);
  if (!result.ok) {
    logEvent("ingest.poam-seed.preview.fail", { status: result.status, errorClass: result.errorClass });
    res.status(result.status).json({ error: "poam-seed-preview-failed", errorClass: result.errorClass });
    return;
  }
  logEvent("ingest.poam-seed.preview.ok", {
    status: 200,
    rowCount: result.items?.length || 0,
    added: result.counts?.add || 0,
    updated: result.counts?.update || 0,
    unchanged: result.counts?.unchanged || 0,
    conflictCount: result.counts?.conflict || 0,
  });
  res.json({
    ok: true,
    kind: result.kind,
    mode: result.mode,
    counts: result.counts,
    items: result.items,
  });
});

app.post("/api/ingest/poam-seed/apply", (req, res) => {
  const result = applyPoamSeed(packagePath, {
    ...storeOpts,
    strategy: req.body?.strategy || req.body?.mergeMode,
    confirmConflicts: formFlag(req.body?.confirmConflicts),
  });
  if (!result.ok) {
    logEvent("ingest.poam-seed.apply.fail", { status: result.status, errorClass: result.errorClass });
    res.status(result.status).json({ error: "poam-seed-apply-failed", errorClass: result.errorClass });
    return;
  }
  logEvent("ingest.poam-seed.apply.ok", {
    status: 200,
    added: result.applied?.added || 0,
    updated: result.applied?.updated || 0,
    unchanged: result.applied?.unchanged || 0,
    skipped: result.applied?.skipped || 0,
  });
  res.json({
    ok: true,
    kind: result.kind,
    strategy: result.strategy,
    mergeMode: result.mergeMode,
    applied: result.applied,
    counts: result.counts,
    items: result.items,
    package: result.package,
  });
});

app.get("/api/emit", (_req, res) => {
  const result = emitWorkingPapers(packagePath, evidenceDir, storeOpts);
  if (!result.ok) {
    logEvent("emit.fail", { status: result.status, errorClass: result.errorClass });
    res.status(result.status).json({ error: "emit-failed", errorClass: result.errorClass });
    return;
  }
  logEvent("emit.ok", { status: 200, bytes: result.bytes });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
  res.status(200).send(result.buffer);
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(root, "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  const parseFail = err?.type === "entity.parse.failed" || err instanceof SyntaxError;
  const status = parseFail ? 400 : 500;
  const cls = parseFail ? "SyntaxError" : errorClass(err);
  // Do not log req.body, file contents, or err.message (may include snippets).
  logEvent("request.fail", { status, errorClass: cls });
  res.status(status).json({
    error: parseFail ? "invalid-json" : "internal",
    errorClass: cls,
  });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, LISTEN_HOST, () => {
  logEvent("api.listen", { port });
  console.log("eMASS remains the system of record. CMMC is out of scope.");
});

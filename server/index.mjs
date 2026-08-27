import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const packagePath = path.join(dataDir, "package.json");
const evidenceDir = path.join(dataDir, "evidence");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, evidenceDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const app = express();
app.use(cors());
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
  if (!fs.existsSync(packagePath)) {
    res.json({ package: null });
    return;
  }
  const raw = fs.readFileSync(packagePath, "utf8");
  res.json({ package: JSON.parse(raw) });
});

app.put("/api/package", (req, res) => {
  const pkg = req.body?.package;
  if (!pkg || typeof pkg !== "object") {
    res.status(400).json({ error: "Expected { package }" });
    return;
  }
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
  res.json({ ok: true, savedAt: new Date().toISOString() });
});

app.post("/api/evidence/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file" });
    return;
  }
  res.json({
    storedName: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    path: `data/evidence/${req.file.filename}`,
  });
});

app.get("/api/evidence/file/:name", (req, res) => {
  const name = path.basename(req.params.name);
  const filePath = path.join(evidenceDir, name);
  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }
  res.sendFile(filePath);
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(root, "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`A&A Workbench API http://127.0.0.1:${port}`);
  console.log("eMASS remains the system of record. CMMC is out of scope.");
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isEncryptedBuffer, loadPackage, savePackage } from "../server/packageStore.mjs";
import { getHydratedPackage } from "../server/packageApi.mjs";
import { applyIngest, previewIngestAgainstPackage, storeTaggedArtifact } from "../server/ingestApi.mjs";
import { mappingHeaders, parseIngestBuffer } from "../src/lib/ingest/parse.mjs";
import { previewMerge } from "../src/lib/ingest/merge.mjs";
import { seedSldssBoundary, seedSldssDataFlows } from "../src/lib/boundary.mjs";
import { seedSldssAssets } from "../src/lib/inventory.mjs";
import {
  SAMPLE_GSS_SOURCE_ID,
  migratePackage,
  seedSldssInheritanceSources,
  validateInheritance,
} from "../src/lib/inheritance.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const temps = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-f14-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function assertNoLiveData(dir) {
  assert.equal(dir.includes(`${path.sep}data${path.sep}`), false);
  assert.notEqual(path.resolve(dir), path.join(root, "data"));
}

function fixturePkg(overrides = {}) {
  return {
    schemaVersion: 5,
    framework: "DoD RMF",
    catalog: "NIST SP 800-53 Revision 5",
    systemOfRecord: "eMASS",
    cmmcInScope: false,
    sample: false,
    updatedAt: "2026-08-28T00:00:00.000Z",
    intake: { systemName: "Fixture System", acronym: "FX" },
    controls: {
      "AC-1": { controlId: "AC-1", selection: "in-scope", notes: "keep-me-f14", inheritanceSourceId: "" },
    },
    policies: [],
    evidence: [],
    poams: [],
    ssp: { purpose: "keep ssp" },
    assets: [
      {
        id: "a1",
        assetName: "Keep Asset",
        assetType: "Server",
        manufacturer: "Dell",
        model: "R740",
        serialNumber: "SN-KEEP",
        hostName: "keep-host",
        ipAddress: "",
        macAddress: "",
        osFirmware: "RHEL 8",
        location: "Lab",
        notes: "",
      },
      {
        id: "a-extra",
        assetName: "Extra Existing",
        assetType: "Server",
        manufacturer: "",
        model: "",
        serialNumber: "",
        hostName: "extra-host",
        ipAddress: "",
        macAddress: "",
        osFirmware: "",
        location: "",
        notes: "",
      },
    ],
    software: [{ id: "s1", name: "Keep SW", vendor: "Acme", version: "1.0", license: "", relatedAsset: "Keep Asset" }],
    boundary: { inbound: [], outbound: [], interconnect: [] },
    dataFlows: [],
    boundaryDiagramEvidenceId: "",
    inheritanceSources: [],
    artifacts: [],
    ...overrides,
  };
}

function hwCsv(rows) {
  const headers = mappingHeaders("hardware");
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => {
      const map = {
        "Asset Name": row.assetName || "",
        "Asset Type": row.assetType || "",
        Manufacturer: row.manufacturer || "",
        Model: row.model || "",
        "Serial Number": row.serialNumber || "",
        "Host Name": row.hostName || "",
        "IP Address": row.ipAddress || "",
        "MAC Address": row.macAddress || "",
        "OS/Firmware": row.osFirmware || "",
        Location: row.location || "",
      };
      const value = map[h] ?? "";
      return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    }).join(","));
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

function swCsv(rows) {
  const headers = mappingHeaders("software");
  const lines = [headers.join(",")];
  for (const row of rows) {
    const map = {
      "Software Name": row.name || "",
      Vendor: row.vendor || "",
      Version: row.version || "",
      License: row.license || "",
      "Related Asset/Host": row.relatedAsset || "",
    };
    lines.push(headers.map((h) => map[h] || "").join(","));
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

function xlsxBuffer(headers, rows) {
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

describe("F14 mapping-driven headers", () => {
  it("uses Joint HW/SW headers from the canonical mapping JSON", () => {
    assert.deepEqual(mappingHeaders("hardware"), [
      "Asset Name",
      "Asset Type",
      "Manufacturer",
      "Model",
      "Serial Number",
      "Host Name",
      "IP Address",
      "MAC Address",
      "OS/Firmware",
      "Location",
    ]);
    assert.deepEqual(mappingHeaders("software"), [
      "Software Name",
      "Vendor",
      "Version",
      "License",
      "Related Asset/Host",
    ]);
    const csv = hwCsv([
      {
        assetName: "Jump Box",
        assetType: "Jump Host",
        manufacturer: "FictionalCo",
        hostName: "jump-1",
        ipAddress: "10.0.0.9",
      },
    ]);
    const parsed = parseIngestBuffer(csv, { filename: "hw.csv" });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.kind, "hardware");
    assert.equal(parsed.rows[0].assetType, "Server");
    assert.equal(parsed.rows[0].notes, "Jump host");
    assert.equal(parsed.rows[0].hostName, "jump-1");
  });

  it("parses XLSX through the same mapping; old .ckl XML stays rejected", () => {
    const buf = xlsxBuffer(mappingHeaders("software"), [["Fixture App", "Acme", "2.0", "", "Keep Asset"]]);
    const parsed = parseIngestBuffer(buf, { filename: "sw.xlsx", artifactType: "software-baseline" });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.artifactType, "software-baseline");
    assert.equal(parsed.rows[0].name, "Fixture App");
    assert.equal(parsed.rows[0].version, "2.0");

    const poam = parseIngestBuffer(Buffer.from("eMASS_POAM_ID,Weakness,Scheduled Completion\nTBD,x,2026-01-01\n"), {
      filename: "poam.csv",
    });
    assert.equal(poam.ok, true);
    assert.equal(poam.kind, "poam");
    const nessus = parseIngestBuffer(Buffer.from("<NessusClientData_v2/>"), { filename: "scan.nessus" });
    assert.equal(nessus.ok, true);
    assert.equal(nessus.kind, "nessus");
    const cklbEmpty = parseIngestBuffer(Buffer.from("{}"), { filename: "bench.cklb" });
    assert.equal(cklbEmpty.ok, false);
    assert.equal(cklbEmpty.errorClass, "InvalidScanFormat");
    const ckl = parseIngestBuffer(Buffer.from("<CHECKLIST/>"), { filename: "bench.ckl" });
    assert.equal(ckl.ok, false);
    assert.equal(ckl.errorClass, "UnsupportedIngestType");
  });
});

describe("F14 merge preview is read-only", () => {
  it("fills empty fields as update and treats differing non-empty fields as conflict", () => {
    const existing = fixturePkg().assets;
    const incoming = [
      {
        id: "",
        assetName: "Keep Asset",
        assetType: "Server",
        manufacturer: "Dell",
        model: "R740",
        serialNumber: "SN-KEEP",
        hostName: "keep-host",
        ipAddress: "10.0.0.21",
        macAddress: "",
        osFirmware: "RHEL 8",
        location: "Lab",
        notes: "",
      },
      {
        id: "",
        assetName: "Keep Asset",
        assetType: "Server",
        manufacturer: "OtherCo",
        model: "R740",
        serialNumber: "SN-KEEP",
        hostName: "keep-host",
        ipAddress: "",
        macAddress: "",
        osFirmware: "RHEL 8",
        location: "Lab",
        notes: "",
      },
      {
        id: "",
        assetName: "GSS F5 pair",
        assetType: "Network Device",
        manufacturer: "F5",
        model: "BIG-IP",
        serialNumber: "",
        hostName: "gss-f5",
        ipAddress: "",
        macAddress: "",
        osFirmware: "",
        location: "",
        notes: "inherited/GSS",
      },
    ];
    const preview = previewMerge("hardware", existing, incoming);
    assert.equal(preview.counts.update, 1);
    assert.equal(preview.counts.conflict, 2);
    assert.equal(preview.items[0].status, "update");
    assert.equal(preview.items[0].proposed.ipAddress, "10.0.0.21");
    assert.equal(existing[0].ipAddress, "");
    assert.equal(preview.items[1].status, "conflict");
    assert.equal(preview.items[1].reason, "field-mismatch");
    assert.ok(preview.items[2].reason.startsWith("inherited-gss"));
  });
});

describe("F14 apply goes through encrypted store", () => {
  it("encrypts package and original after apply; merge keeps extra rows; GSS skipped without confirm", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, fixturePkg());
    const csv = hwCsv([
      {
        assetName: "Keep Asset",
        assetType: "Server",
        manufacturer: "Dell",
        model: "R740",
        serialNumber: "SN-KEEP",
        hostName: "keep-host",
        ipAddress: "10.0.0.21",
      },
      {
        assetName: "New Box",
        assetType: "Server",
        hostName: "new-host",
        manufacturer: "FictionalCo",
      },
      {
        assetName: "GSS F5 pair",
        assetType: "Network Device",
        manufacturer: "F5",
        hostName: "gss-f5",
      },
    ]);
    const preview = previewIngestAgainstPackage(
      file,
      { buffer: csv, filename: "hw.csv", artifactType: "hardware-baseline" },
      { audit: false },
    );
    assert.equal(preview.ok, true);
    assert.equal(preview.mode, "parse");
    const before = loadPackage(file, { audit: false }).package;
    assert.equal(before.assets.find((row) => row.id === "a1").ipAddress, "");
    assert.equal(before.assets.length, 2);

    const applied = applyIngest(
      file,
      evidenceDir,
      { buffer: csv, filename: "hw.csv", artifactType: "hardware-baseline", strategy: "merge" },
      { audit: false },
    );
    assert.equal(applied.ok, true);
    assert.equal(applied.strategy, "merge");
    assert.equal(applied.applied.added, 1);
    assert.equal(applied.applied.updated, 1);
    assert.ok(applied.applied.skipped >= 1);
    const names = applied.package.assets.map((row) => row.assetName);
    assert.ok(names.includes("Keep Asset"));
    assert.ok(names.includes("Extra Existing"));
    assert.ok(names.includes("New Box"));
    assert.equal(names.includes("GSS F5 pair"), false);
    assert.equal(applied.package.assets.find((row) => row.hostName === "keep-host").ipAddress, "10.0.0.21");
    assert.equal(applied.package.artifacts.length, 1);
    assert.equal(applied.package.artifacts[0].artifactType, "hardware-baseline");
    assert.equal(applied.package.artifacts[0].mode, "parse");
    assert.equal(applied.package.cmmcInScope, false);

    const onDisk = fs.readFileSync(file);
    assert.equal(isEncryptedBuffer(onDisk), true);
    assert.equal(onDisk.includes(Buffer.from("Keep Asset")), false);
    const original = fs.readFileSync(path.join(evidenceDir, applied.storedName));
    assert.equal(isEncryptedBuffer(original), true);
    assert.equal(original.includes(Buffer.from("GSS F5 pair")), false);

    const replaced = applyIngest(
      file,
      evidenceDir,
      {
        buffer: hwCsv([{ assetName: "Only One", assetType: "Server", hostName: "only-1" }]),
        filename: "hw2.csv",
        artifactType: "hardware-baseline",
        strategy: "replace",
      },
      { audit: false },
    );
    assert.equal(replaced.ok, true);
    assert.equal(replaced.package.assets.length, 1);
    assert.equal(replaced.package.assets[0].assetName, "Only One");
  });

  it("STORE-only tags encrypted originals without parsing SSP narrative", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, fixturePkg());
    const bytes = Buffer.from("# fictional ssp\npurpose: do not parse me\n", "utf8");
    const stored = storeTaggedArtifact(
      file,
      evidenceDir,
      { buffer: bytes, filename: "ssp.md", artifactType: "ssp" },
      { audit: false },
    );
    assert.equal(stored.ok, true);
    assert.equal(stored.artifact.mode, "store-only");
    assert.equal(stored.package.ssp.purpose, "keep ssp");
    assert.equal(isEncryptedBuffer(fs.readFileSync(path.join(evidenceDir, stored.storedName))), true);
  });
});

describe("F14 encrypt-on-GET plaintext fixture", () => {
  it("GET hydrate encrypts plaintext in place without wipe or SAMPLE seed", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const pkg = fixturePkg({ schemaVersion: 3 });
    delete pkg.inheritanceSources;
    delete pkg.artifacts;
    fs.writeFileSync(file, JSON.stringify(pkg), "utf8");
    assert.equal(fs.readFileSync(file, "utf8").includes("keep-me-f14"), true);
    const result = getHydratedPackage(file, { audit: false });
    assert.equal(result.ok, true);
    assert.equal(result.encrypted, true);
    assert.equal(result.package.controls["AC-1"].notes, "keep-me-f14");
    assert.equal(result.package.assets[0].assetName, "Keep Asset");
    assert.deepEqual(result.package.inheritanceSources, []);
    assert.deepEqual(result.package.artifacts, []);
    assert.equal(JSON.stringify(result.package).includes("SAMPLE-ICAM"), false);
    const onDisk = fs.readFileSync(file);
    assert.equal(isEncryptedBuffer(onDisk), true);
    assert.equal(onDisk.includes(Buffer.from("keep-me-f14")), false);
    assert.equal(fs.readFileSync(file, "utf8").includes("keep-me-f14"), false);
  });
});

describe("F14 F2 leftover still holds", () => {
  it("inbound outbound dataFlows stay empty", () => {
    const boundary = seedSldssBoundary();
    const flows = seedSldssDataFlows();
    assert.deepEqual(boundary.inbound, []);
    assert.deepEqual(boundary.outbound, []);
    assert.deepEqual(flows, []);
  });
});

describe("F14 F3 inheritance still passes", () => {
  it("hydrate does not invent SAMPLE sources; inherited still requires a source id", () => {
    const old = {
      schemaVersion: 3,
      framework: "DoD RMF",
      catalog: "NIST SP 800-53 Revision 5",
      systemOfRecord: "eMASS",
      cmmcInScope: false,
      sample: true,
      controls: {
        "AC-1": { controlId: "AC-1", selection: "in-scope", notes: "keep-me" },
        "PE-2": { controlId: "PE-2", selection: "inherited", notes: "keep-pe" },
      },
      assets: seedSldssAssets().slice(0, 1),
      software: [],
      boundary: seedSldssBoundary(),
      dataFlows: seedSldssDataFlows(),
    };
    const migrated = migratePackage(old);
    assert.deepEqual(migrated.inheritanceSources, []);
    assert.equal(migrated.controls["PE-2"].inheritanceSourceId, "");
    assert.equal(validateInheritance(migrated).ok, false);
    migrated.inheritanceSources = seedSldssInheritanceSources();
    migrated.controls["PE-2"].inheritanceSourceId = SAMPLE_GSS_SOURCE_ID;
    assert.equal(validateInheritance(migrated).ok, true);
    assert.equal(migrated.controls["AC-1"].inheritanceSourceId, "");
    assert.equal(JSON.stringify(migratePackage(old).inheritanceSources).includes("SAMPLE-ICAM"), false);
  });
});

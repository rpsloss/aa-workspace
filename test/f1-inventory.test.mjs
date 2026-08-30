import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPackage, savePackage } from "../server/packageStore.mjs";
import {
  SCHEMA_VERSION,
  HW_CSV_COLUMNS,
  SW_CSV_COLUMNS,
  ensureInventory,
  hardwareCsv,
  seedSldssAssets,
  seedSldssSoftware,
  softwareCsv,
} from "../src/lib/inventory.mjs";

const temps = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-f1-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function oldPackage() {
  return {
    schemaVersion: 1,
    framework: "DoD RMF",
    catalog: "NIST SP 800-53 Revision 5",
    systemOfRecord: "eMASS",
    cmmcInScope: false,
    sample: true,
    updatedAt: "2026-08-28T00:00:00.000Z",
    intake: { systemName: "Fixture System", acronym: "FX" },
    controls: {
      "AC-1": { controlId: "AC-1", selection: "in-scope", notes: "keep-me" },
    },
    policies: [{ id: "pol-AC-1", controlId: "AC-1", body: "keep policy" }],
    evidence: [{ id: "ev-1", title: "keep evidence" }],
    poams: [{ id: "poam-001", emassPoamId: "TBD-eMASS", controlId: "AU-6(3)", weakness: "keep weakness" }],
    ssp: { purpose: "keep ssp", hardwareSoftware: "Qty 4 RHEL 8 application VMs; F5/proxy pair (GSS-managed, inherited)" },
  };
}

describe("F1 seed", () => {
  it("seeds eight SLDSS hosts and does not put F5 on that list", () => {
    const assets = seedSldssAssets();
    assert.equal(assets.length, 8);
    const names = assets.map((a) => a.assetName);
    assert.deepEqual(names, [
      "RHEL 8 application VM 1",
      "RHEL 8 application VM 2",
      "RHEL 8 application VM 3",
      "RHEL 8 application VM 4",
      "PostgreSQL VM 1",
      "PostgreSQL VM 2",
      "Windows Server jump host 1",
      "Windows Server jump host 2",
    ]);
    const blob = JSON.stringify(assets).toLowerCase();
    assert.equal(blob.includes("f5"), false);
    assert.equal(blob.includes("proxy"), false);
    assert.equal(
      assets.filter((a) => /inherited|gss/i.test(`${a.assetName} ${a.assetType}`)).length,
      0,
    );
    assert.ok(assets.every((a) => a.hostName === ""));
  });

  it("seeds software from the SSP list without inventing licenses", () => {
    const software = seedSldssSoftware();
    assert.deepEqual(
      software.map((s) => s.name),
      ["SLDSS app", "PostgreSQL", "native SIEM forwarders"],
    );
    assert.equal(software.find((s) => s.name === "SLDSS app")?.version, "2.1");
    assert.equal(software.find((s) => s.name === "PostgreSQL")?.version, "15");
    assert.ok(software.every((s) => s.license === ""));
  });
});

describe("F1 schema migration", () => {
  it("bumps schema and loads missing assets/software as empty arrays without corrupting the rest", () => {
    const old = oldPackage();
    assert.equal(Object.hasOwn(old, "assets"), false);
    assert.equal(Object.hasOwn(old, "software"), false);
    const migrated = ensureInventory(old);
    assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
    assert.equal(SCHEMA_VERSION, 5);
    assert.deepEqual(migrated.assets, []);
    assert.deepEqual(migrated.software, []);
    assert.deepEqual(migrated.controls, old.controls);
    assert.deepEqual(migrated.policies, old.policies);
    assert.deepEqual(migrated.evidence, old.evidence);
    assert.deepEqual(migrated.poams, old.poams);
    assert.equal(migrated.poams[0].emassPoamId, "TBD-eMASS");
    assert.equal(migrated.ssp.purpose, "keep ssp");
    assert.equal(migrated.intake.acronym, "FX");
    assert.equal(migrated.cmmcInScope, false);
  });

  it("treats non-array assets/software as empty without dropping other fields", () => {
    const weird = { ...oldPackage(), assets: null, software: { name: "nope" } };
    const migrated = ensureInventory(weird);
    assert.deepEqual(migrated.assets, []);
    assert.deepEqual(migrated.software, []);
    assert.equal(migrated.controls["AC-1"].notes, "keep-me");
  });
});

describe("F1 HW/SW CSV", () => {
  it("emits Joint eMASS-oriented hardware columns and one row per SLDSS host", () => {
    const csv = hardwareCsv(seedSldssAssets());
    const [header, ...rows] = csv.split("\n");
    assert.equal(header, HW_CSV_COLUMNS.join(","));
    assert.deepEqual(HW_CSV_COLUMNS, [
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
    assert.equal(rows.length, 8);
    assert.ok(rows.some((line) => line.startsWith("RHEL 8 application VM 1,")));
    assert.equal(csv.toLowerCase().includes("f5"), false);
    assert.equal(header.includes("id"), false);
    assert.equal(header.includes("Role"), false);
    assert.equal(HW_CSV_COLUMNS.includes("Role"), false);
    assert.equal(header.split(",").includes("Role"), false);
    assert.ok(!HW_CSV_COLUMNS.some((c) => c === "Role" || /^role$/i.test(c)));
  });

  it("emits software columns aligned to name, vendor, version, license, related asset/host", () => {
    const csv = softwareCsv(seedSldssSoftware());
    const [header, ...rows] = csv.split("\n");
    assert.equal(header, SW_CSV_COLUMNS.join(","));
    assert.deepEqual(SW_CSV_COLUMNS, [
      "Software Name",
      "Vendor",
      "Version",
      "License",
      "Related Asset/Host",
    ]);
    assert.equal(rows.length, 3);
    assert.ok(rows[0].startsWith("SLDSS app,"));
    assert.ok(rows[0].includes("2.1"));
    assert.ok(rows[1].startsWith("PostgreSQL,"));
  });
});

describe("F1 packageStore round-trip", () => {
  it("saves and loads assets and software via temp dirs, not data/", () => {
    const dir = tempDir();
    assert.equal(dir.includes(`${path.sep}data${path.sep}`), false);
    assert.notEqual(path.resolve(dir), path.join(root, "data"));
    const file = path.join(dir, "package.json");
    const pkg = ensureInventory({
      ...oldPackage(),
      assets: seedSldssAssets(),
      software: seedSldssSoftware(),
    });
    const saved = savePackage(file, pkg);
    assert.equal(saved.ok, true);
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, true);
    assert.deepEqual(loaded.package.assets, pkg.assets);
    assert.deepEqual(loaded.package.software, pkg.software);
    assert.equal(loaded.package.schemaVersion, 5);
    assert.equal(loaded.package.assets.length, 8);
    assert.equal(JSON.stringify(loaded.package.assets).toLowerCase().includes("f5"), false);
    assert.equal(fs.existsSync(path.join(root, "data", "package.json.tmp")), false);
  });
});

describe("F1 local bind and CORS", () => {
  it("binds the API to 127.0.0.1 and restricts CORS to the local Vite origin", () => {
    const src = fs.readFileSync(path.join(root, "server/index.mjs"), "utf8");
    assert.match(src, /LISTEN_HOST\s*=\s*"127\.0\.0\.1"/);
    assert.match(src, /listen\(\s*port\s*,\s*LISTEN_HOST/);
    assert.match(src, /LOCAL_VITE_ORIGIN\s*=\s*"http:\/\/127\.0\.0\.1:5173"/);
    assert.match(src, /cors\(\s*\{\s*origin:\s*LOCAL_VITE_ORIGIN/);
    assert.equal(/\bapp\.use\(\s*cors\(\s*\)\s*\)/.test(src), false);
    assert.equal(/0\.0\.0\.0/.test(src), false);
  });

  it("keeps Vite on 127.0.0.1:5173", () => {
    const src = fs.readFileSync(path.join(root, "vite.config.ts"), "utf8");
    assert.match(src, /host:\s*"127\.0\.0\.1"/);
    assert.match(src, /port:\s*5173/);
  });
});

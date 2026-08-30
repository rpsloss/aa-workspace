import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPackage, savePackage } from "../server/packageStore.mjs";
import {
  SCHEMA_VERSION,
  seedSldssAssets,
  seedSldssSoftware,
} from "../src/lib/inventory.mjs";
import {
  TBD,
  migratePackage,
  seedSldssBoundary,
  seedSldssDataFlows,
  sspBoundaryMarkdown,
  sspDiagramSlotMarkdown,
} from "../src/lib/boundary.mjs";
import { sspMarkdown } from "../src/lib/sspMarkdown.mjs";

const temps = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-f2-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function schema2Package() {
  return {
    schemaVersion: 2,
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
    evidence: [
      {
        id: "ev-001",
        title: "SLDSS authorization boundary diagram (v2.1)",
        type: "diagram",
        storedName: "",
        originalName: "",
      },
    ],
    poams: [{ id: "poam-001", emassPoamId: "TBD-eMASS", controlId: "AU-6(3)", weakness: "keep weakness" }],
    ssp: {
      purpose: "keep ssp",
      authorizationBoundary: "keep boundary",
      informationFlow: "Mission users authenticate via inherited DoD ICAM (PIV) — leftover prose, not a table.",
    },
    assets: [{ id: "a1", assetName: "keep asset", assetType: "Server" }],
    software: [{ id: "s1", name: "keep sw" }],
  };
}

function section(md, heading) {
  const parts = md.split(heading);
  if (parts.length < 2) return "";
  return parts[1].split("\n## ")[0].split("\n### ")[0];
}

describe("F2 schema 2 to 3 migration", () => {
  it("loads missing boundary and dataFlows as empty arrays/objects without corrupting the rest", () => {
    const old = schema2Package();
    assert.equal(Object.hasOwn(old, "boundary"), false);
    assert.equal(Object.hasOwn(old, "dataFlows"), false);
    assert.equal(Object.hasOwn(old, "boundaryDiagramEvidenceId"), false);
    const migrated = migratePackage(old);
    assert.equal(migrated.schemaVersion, 5);
    assert.equal(SCHEMA_VERSION, 5);
    assert.deepEqual(migrated.boundary, { inbound: [], outbound: [], interconnect: [] });
    assert.deepEqual(migrated.dataFlows, []);
    assert.equal(migrated.boundaryDiagramEvidenceId, "");
    assert.equal(migrated.controls["AC-1"].notes, "keep-me");
    assert.deepEqual(migrated.policies, old.policies);
    assert.equal(migrated.poams[0].emassPoamId, "TBD-eMASS");
    assert.equal(migrated.ssp.purpose, "keep ssp");
    assert.equal(migrated.assets[0].assetName, "keep asset");
    assert.equal(migrated.software[0].name, "keep sw");
    assert.equal(migrated.cmmcInScope, false);
  });

  it("treats non-array/non-object boundary and dataFlows as empty without dropping other fields", () => {
    const weird = { ...schema2Package(), boundary: null, dataFlows: { name: "nope" }, boundaryDiagramEvidenceId: null };
    const migrated = migratePackage(weird);
    assert.deepEqual(migrated.boundary.inbound, []);
    assert.deepEqual(migrated.boundary.outbound, []);
    assert.deepEqual(migrated.boundary.interconnect, []);
    assert.deepEqual(migrated.dataFlows, []);
    assert.equal(migrated.boundaryDiagramEvidenceId, "");
    assert.equal(migrated.controls["AC-1"].notes, "keep-me");
  });
});

describe("F2 SSP TBD", () => {
  it("renders TBD for empty inbound, outbound, interconnect, and dataFlows and does not use leftover flow prose", () => {
    const pkg = migratePackage({
      ...schema2Package(),
      boundary: { inbound: [], outbound: [], interconnect: [] },
      dataFlows: [],
    });
    const md = sspMarkdown(pkg);
    const tables = sspBoundaryMarkdown(pkg);
    assert.equal(tables.inbound, TBD);
    assert.equal(tables.outbound, TBD);
    assert.equal(tables.interconnect, TBD);
    assert.equal(tables.dataFlows, TBD);
    assert.match(md, /### Inbound\nTBD/);
    assert.match(md, /### Outbound\nTBD/);
    assert.match(md, /### Interconnections\nTBD/);
    assert.match(md, /### Data flows\nTBD/);
    const flowSection = section(md, "## Information flow");
    assert.equal(flowSection.includes("leftover prose"), false);
    assert.equal(flowSection.includes("Mission users authenticate"), false);
    assert.equal(md.includes("invented partner"), false);
    assert.equal(/port 443|TCP\/443|classification: secret/i.test(md), false);
  });
});

describe("F2 accepted sample seed", () => {
  it("keeps inbound, outbound, and dataFlows empty and seeds only the VPN interconnect", () => {
    const boundary = seedSldssBoundary();
    const flows = seedSldssDataFlows();
    assert.deepEqual(boundary.inbound, []);
    assert.deepEqual(boundary.outbound, []);
    assert.deepEqual(flows, []);
    assert.deepEqual(
      boundary.interconnect.map((r) => r.name),
      ["site-to-site VPN concentrator"],
    );
    assert.equal(boundary.interconnect[0].ownership, "inherited/GSS");
    assert.equal(boundary.interconnect[0].description, "used for the alternate processing site");
    const tables = sspBoundaryMarkdown({ boundary, dataFlows: flows });
    assert.equal(tables.inbound, TBD);
    assert.equal(tables.outbound, TBD);
    assert.equal(tables.dataFlows, TBD);
    const blob = JSON.stringify({ boundary, flows }).toLowerCase();
    assert.equal(blob.includes("icam"), false);
    assert.equal(blob.includes("siem"), false);
    assert.equal(blob.includes("wsus"), false);
    assert.equal(blob.includes("gccs"), false);
    assert.equal(/:\d{2,5}|tcp\/|udp\//i.test(blob), false);
    assert.equal(blob.includes("secret"), false);
  });

  it("does not add the VPN concentrator as an SLDSS asset or invent an APS interconnect", () => {
    const assets = seedSldssAssets();
    const boundary = seedSldssBoundary();
    assert.equal(assets.length, 8);
    const assetBlob = JSON.stringify(assets).toLowerCase();
    assert.equal(assetBlob.includes("vpn"), false);
    assert.equal(assetBlob.includes("concentrator"), false);
    assert.equal(assetBlob.includes("f5"), false);
    const names = [...boundary.inbound, ...boundary.outbound].map((r) => r.name.toLowerCase());
    assert.equal(names.some((n) => n.includes("vpn")), false);
    const vpn = boundary.interconnect.filter((r) => /vpn/i.test(r.name));
    assert.equal(vpn.length, 1);
    assert.equal(vpn[0].ownership, "inherited/GSS");
  });

  it("keeps jump hosts as Asset Type Server with Jump host in notes and still 8 hosts", () => {
    const assets = seedSldssAssets();
    assert.equal(assets.length, 8);
    const jumps = assets.filter((a) => /jump host/i.test(a.assetName) || /jump host/i.test(a.notes));
    assert.equal(jumps.length, 2);
    assert.ok(jumps.every((a) => a.assetType === "Server"));
    assert.ok(jumps.every((a) => a.notes === "Jump host"));
    assert.ok(jumps.every((a) => a.osFirmware === "Windows Server"));
    assert.ok(jumps.every((a) => a.hostName === ""));
    assert.equal(assets.filter((a) => a.assetType === "Jump Host").length, 0);
    const db = assets.filter((a) => /PostgreSQL/i.test(a.assetName));
    assert.equal(db.length, 2);
    assert.ok(db.every((a) => a.osFirmware === ""));
    const sw = seedSldssSoftware();
    const siem = sw.find((s) => s.name === "native SIEM forwarders");
    assert.equal(siem.vendor, "");
    assert.equal(siem.version, "");
    assert.equal(siem.relatedAsset, "");
  });
});

describe("F2 diagram evidence slot", () => {
  it("exists without requiring a file", () => {
    const pkg = migratePackage({
      ...schema2Package(),
      boundaryDiagramEvidenceId: "ev-001",
    });
    assert.equal(pkg.boundaryDiagramEvidenceId, "ev-001");
    const slot = sspDiagramSlotMarkdown(pkg);
    assert.match(slot, /Boundary diagram evidence slot/);
    assert.match(slot, /ev-001/);
    assert.match(slot, /no file attached/i);
    const md = sspMarkdown(pkg);
    assert.match(md, /### Boundary diagram/);
    assert.match(md, /no file attached/i);
    const empty = migratePackage(schema2Package());
    assert.equal(empty.boundaryDiagramEvidenceId, "");
    assert.equal(sspDiagramSlotMarkdown(empty), TBD);
  });
});

describe("F2 packageStore round-trip", () => {
  it("saves and loads boundary tables via temp dirs, not data/", () => {
    const dir = tempDir();
    assert.equal(dir.includes(`${path.sep}data${path.sep}`), false);
    assert.notEqual(path.resolve(dir), path.join(root, "data"));
    const file = path.join(dir, "package.json");
    const pkg = migratePackage({
      ...schema2Package(),
      assets: seedSldssAssets(),
      software: seedSldssSoftware(),
      boundary: seedSldssBoundary(),
      dataFlows: seedSldssDataFlows(),
      boundaryDiagramEvidenceId: "ev-001",
    });
    const saved = savePackage(file, pkg);
    assert.equal(saved.ok, true);
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, true);
    const normalized = migratePackage(loaded.package);
    assert.deepEqual(normalized.boundary, pkg.boundary);
    assert.deepEqual(normalized.dataFlows, pkg.dataFlows);
    assert.equal(normalized.schemaVersion, 5);
    assert.equal(normalized.assets.length, 8);
    assert.equal(JSON.stringify(normalized.assets).toLowerCase().includes("vpn"), false);
    assert.equal(fs.existsSync(path.join(root, "data", "package.json.tmp")), false);
    const md = sspMarkdown(normalized);
    assert.match(md, /### Inbound\nTBD/);
    assert.match(md, /### Outbound\nTBD/);
    assert.match(md, /### Data flows\nTBD/);
    assert.match(md, /site-to-site VPN concentrator/);
    assert.match(md, /inherited\/GSS/);
  });
});

describe("F2 source wiring", () => {
  it("sample seeds boundary tables and does not add a 9th VPN host", () => {
    const sample = fs.readFileSync(path.join(root, "src/data/sample.ts"), "utf8");
    assert.match(sample, /seedSldssBoundary\(\)/);
    assert.match(sample, /seedSldssDataFlows\(\)/);
    assert.match(sample, /boundaryDiagramEvidenceId:\s*"ev-001"/);
    const inventory = fs.readFileSync(path.join(root, "src/lib/inventory.mjs"), "utf8");
    assert.equal(/assetName:.*vpn/i.test(inventory), false);
    const ui = [
      fs.readFileSync(path.join(root, "src/pages/Ssp.tsx"), "utf8"),
      fs.readFileSync(path.join(root, "src/pages/Boundary.tsx"), "utf8"),
    ].join("\n");
    assert.equal(/<canvas/i.test(ui), false);
  });
});

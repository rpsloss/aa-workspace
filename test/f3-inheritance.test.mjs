import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPackage, savePackage } from "../server/packageStore.mjs";
import { getHydratedPackage, putValidatedPackage } from "../server/packageApi.mjs";
import { SCHEMA_VERSION as INVENTORY_SCHEMA, HW_CSV_COLUMNS, hardwareCsv, seedSldssAssets } from "../src/lib/inventory.mjs";
import { seedSldssBoundary, seedSldssDataFlows } from "../src/lib/boundary.mjs";
import {
  GSS_PACKAGE_ID,
  SAMPLE_COMPONENT_PACKAGE_ID,
  SAMPLE_COMPONENT_SOURCE_ID,
  SAMPLE_GSS_SOURCE_ID,
  SAMPLE_ICAM_PACKAGE_ID,
  SAMPLE_ICAM_SOURCE_ID,
  SELECTION_STATUSES,
  hydrateNeedsPersist,
  hydrateOnLoad,
  migratePackage,
  sampleInheritanceSourceId,
  seedSldssInheritanceSources,
  validateInheritance,
} from "../src/lib/inheritance.mjs";

const temps = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-f3-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function schema3Package() {
  return {
    schemaVersion: 3,
    framework: "DoD RMF",
    catalog: "NIST SP 800-53 Revision 5",
    systemOfRecord: "eMASS",
    cmmcInScope: false,
    sample: true,
    updatedAt: "2026-08-28T00:00:00.000Z",
    intake: { systemName: "Fixture System", acronym: "FX" },
    controls: {
      "AC-1": { controlId: "AC-1", selection: "in-scope", notes: "keep-me", inheritedFrom: "" },
      "PE-2": { controlId: "PE-2", selection: "inherited", inheritedFrom: "Installation GSS (Fort Example) — eMASS EM-GSS-0000441", notes: "keep-pe" },
    },
    policies: [{ id: "pol-AC-1", controlId: "AC-1", body: "keep policy" }],
    evidence: [{ id: "ev-001", title: "keep evidence" }],
    poams: [{ id: "poam-001", emassPoamId: "TBD-eMASS", controlId: "AU-6(3)", weakness: "keep weakness" }],
    ssp: { purpose: "keep ssp" },
    assets: [{ id: "a1", assetName: "keep asset", assetType: "Server" }],
    software: [{ id: "s1", name: "keep sw" }],
    boundary: { inbound: [], outbound: [], interconnect: [{ id: "ix-vpn", name: "site-to-site VPN concentrator", ownership: "inherited/GSS", notes: "intake.boundarySummary" }] },
    dataFlows: [],
    boundaryDiagramEvidenceId: "ev-001",
  };
}

describe("F3 schema 3 to 4 migration", () => {
  it("loads missing inheritanceSources as [] without corrupting the rest", () => {
    const old = schema3Package();
    assert.equal(Object.hasOwn(old, "inheritanceSources"), false);
    assert.equal(Object.hasOwn(old.controls["PE-2"], "inheritanceSourceId"), false);
    const migrated = migratePackage(old);
    assert.equal(migrated.schemaVersion, 5);
    assert.equal(INVENTORY_SCHEMA, 5);
    assert.deepEqual(migrated.inheritanceSources, []);
    assert.equal(migrated.controls["AC-1"].notes, "keep-me");
    assert.equal(migrated.controls["PE-2"].notes, "keep-pe");
    assert.equal(migrated.controls["PE-2"].selection, "inherited");
    assert.equal(migrated.controls["PE-2"].inheritanceSourceId, "");
    assert.equal(migrated.controls["AC-1"].inheritanceSourceId, "");
    assert.deepEqual(migrated.policies, old.policies);
    assert.equal(migrated.poams[0].emassPoamId, "TBD-eMASS");
    assert.equal(migrated.ssp.purpose, "keep ssp");
    assert.equal(migrated.assets[0].assetName, "keep asset");
    assert.equal(migrated.software[0].name, "keep sw");
    assert.equal(migrated.boundary.interconnect[0].name, "site-to-site VPN concentrator");
    assert.equal(migrated.cmmcInScope, false);
  });

  it("treats non-array inheritanceSources as empty without dropping other fields", () => {
    const weird = { ...schema3Package(), inheritanceSources: { name: "nope" } };
    const migrated = migratePackage(weird);
    assert.deepEqual(migrated.inheritanceSources, []);
    assert.equal(migrated.controls["AC-1"].notes, "keep-me");
  });
});

describe("F3 SAMPLE inheritance sources", () => {
  it("seeds GSS EM-GSS-0000441, DoD ICAM SAMPLE, and component program SAMPLE", () => {
    const sources = seedSldssInheritanceSources();
    assert.equal(sources.length, 3);
    const gss = sources.find((s) => s.packageId === GSS_PACKAGE_ID);
    const icam = sources.find((s) => s.id === SAMPLE_ICAM_SOURCE_ID);
    const component = sources.find((s) => s.id === SAMPLE_COMPONENT_SOURCE_ID);
    assert.ok(gss);
    assert.equal(gss.id, SAMPLE_GSS_SOURCE_ID);
    assert.equal(gss.packageId, "EM-GSS-0000441");
    assert.match(gss.name, /GSS/i);
    assert.equal(gss.sample, true);
    assert.ok(icam);
    assert.equal(icam.name, "DoD ICAM");
    assert.equal(icam.packageId, SAMPLE_ICAM_PACKAGE_ID);
    assert.ok(icam.packageId.startsWith("SAMPLE"));
    assert.equal(icam.sample, true);
    assert.ok(component);
    assert.match(component.name, /component/i);
    assert.equal(component.packageId, SAMPLE_COMPONENT_PACKAGE_ID);
    assert.ok(component.packageId.startsWith("SAMPLE"));
    assert.equal(component.sample, true);
    const ids = sources.map((s) => s.packageId).join(" ");
    assert.equal(/EM-[A-Z]+-\d+/.test(ids.replace("EM-GSS-0000441", "")), false);
  });

  it("wires existing inherited sample rows only where the narrative already implies GSS/ICAM/component", () => {
    assert.equal(sampleInheritanceSourceId({ id: "PE-2", family: "PE" }, "inherited"), SAMPLE_GSS_SOURCE_ID);
    assert.equal(sampleInheritanceSourceId({ id: "PE-1", family: "PE" }, "inherited"), "");
    assert.equal(sampleInheritanceSourceId({ id: "PE-2", family: "PE" }, "in-scope"), "");
    assert.equal(sampleInheritanceSourceId({ id: "IA-2", family: "IA" }, "inherited"), SAMPLE_ICAM_SOURCE_ID);
    assert.equal(sampleInheritanceSourceId({ id: "IA-2(12)", family: "IA" }, "inherited"), SAMPLE_ICAM_SOURCE_ID);
    assert.equal(sampleInheritanceSourceId({ id: "IA-1", family: "IA" }, "inherited"), "");
    assert.equal(sampleInheritanceSourceId({ id: "IA-5", family: "IA" }, "in-scope"), "");
    assert.equal(sampleInheritanceSourceId({ id: "PM-1", family: "PM" }, "inherited"), SAMPLE_COMPONENT_SOURCE_ID);
    assert.equal(sampleInheritanceSourceId({ id: "AC-1", family: "AC" }, "in-scope"), "");
    assert.equal(sampleInheritanceSourceId({ id: "AC-1", family: "AC" }, "hybrid"), "");
  });
});

describe("F3 hybrid and validation", () => {
  it("hybrid is a selectable status", () => {
    assert.ok(SELECTION_STATUSES.includes("hybrid"));
    assert.ok(SELECTION_STATUSES.includes("inherited"));
    assert.ok(SELECTION_STATUSES.includes("in-scope"));
    const ui = fs.readFileSync(path.join(root, "src/pages/Tailoring.tsx"), "utf8");
    assert.match(ui, /option value="hybrid"/);
    assert.match(ui, /Inheritance source/);
  });

  it("inherited without source fails validation", () => {
    const pkg = migratePackage({
      ...schema3Package(),
      inheritanceSources: seedSldssInheritanceSources(),
      controls: {
        "PE-2": { controlId: "PE-2", selection: "inherited", inheritanceSourceId: "", inheritedFrom: "GSS" },
      },
    });
    const result = validateInheritance(pkg);
    assert.equal(result.ok, false);
    assert.equal(result.errorClass, "InheritanceSourceRequired");
    assert.equal(result.missingCount, 1);
  });

  it("hybrid without source fails validation", () => {
    const pkg = migratePackage({
      ...schema3Package(),
      inheritanceSources: seedSldssInheritanceSources(),
      controls: {
        "AC-2": { controlId: "AC-2", selection: "hybrid", inheritanceSourceId: "", inheritedFrom: "" },
      },
    });
    const result = validateInheritance(pkg);
    assert.equal(result.ok, false);
    assert.equal(result.missingCount, 1);
  });

  it("inherited with a real source id passes", () => {
    const pkg = migratePackage({
      ...schema3Package(),
      inheritanceSources: seedSldssInheritanceSources(),
      controls: {
        "PE-2": {
          controlId: "PE-2",
          selection: "inherited",
          inheritanceSourceId: SAMPLE_GSS_SOURCE_ID,
          inheritedFrom: "Installation GSS",
        },
      },
    });
    const result = validateInheritance(pkg);
    assert.equal(result.ok, true);
    assert.equal(result.missingCount, 0);
  });

  it("hybrid with a real source id passes", () => {
    const pkg = migratePackage({
      ...schema3Package(),
      inheritanceSources: seedSldssInheritanceSources(),
      controls: {
        "IA-2": {
          controlId: "IA-2",
          selection: "hybrid",
          inheritanceSourceId: SAMPLE_ICAM_SOURCE_ID,
          inheritedFrom: "DoD ICAM",
        },
      },
    });
    assert.equal(validateInheritance(pkg).ok, true);
  });

  it("in-scope without source passes", () => {
    const pkg = migratePackage({
      ...schema3Package(),
      inheritanceSources: [],
      controls: {
        "AC-1": { controlId: "AC-1", selection: "in-scope", inheritanceSourceId: "" },
      },
    });
    assert.equal(validateInheritance(pkg).ok, true);
  });

  it("inherited with unknown source id fails", () => {
    const pkg = migratePackage({
      ...schema3Package(),
      inheritanceSources: seedSldssInheritanceSources(),
      controls: {
        "PE-2": { controlId: "PE-2", selection: "inherited", inheritanceSourceId: "not-a-source" },
      },
    });
    assert.equal(validateInheritance(pkg).ok, false);
  });
});

describe("F3 inventory and VPN interconnect still correct", () => {
  it("keeps 8 hosts, F5 off assets, and VPN as inherited/GSS interconnect", () => {
    const assets = seedSldssAssets();
    const boundary = seedSldssBoundary();
    assert.equal(assets.length, 8);
    const blob = JSON.stringify(assets).toLowerCase();
    assert.equal(blob.includes("f5"), false);
    assert.equal(blob.includes("vpn"), false);
    const vpn = boundary.interconnect.filter((r) => /vpn/i.test(r.name));
    assert.equal(vpn.length, 1);
    assert.equal(vpn[0].name, "site-to-site VPN concentrator");
    assert.equal(vpn[0].ownership, "inherited/GSS");
    const jumps = assets.filter((a) => /jump host/i.test(a.notes));
    assert.equal(jumps.length, 2);
    assert.ok(jumps.every((a) => a.assetType === "Server"));
  });
});

describe("F3 GET hydrate is non-destructive", () => {
  it("hydrates missing arrays on load and can persist without wiping user edits", () => {
    const dir = tempDir();
    assert.equal(dir.includes(`${path.sep}data${path.sep}`), false);
    assert.notEqual(path.resolve(dir), path.join(root, "data"));
    const file = path.join(dir, "package.json");
    const old = schema3Package();
    savePackage(file, old);
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, true);
    const hydrated = hydrateOnLoad(loaded.package);
    assert.equal(hydrateNeedsPersist(loaded.package, hydrated), true);
    assert.equal(hydrated.schemaVersion, 5);
    assert.deepEqual(hydrated.inheritanceSources, []);
    assert.equal(hydrated.controls["AC-1"].notes, "keep-me");
    assert.equal(hydrated.controls["PE-2"].inheritedFrom.includes("EM-GSS-0000441"), true);
    savePackage(file, hydrated);
    const again = loadPackage(file);
    assert.equal(again.package.schemaVersion, 5);
    assert.deepEqual(again.package.inheritanceSources, []);
    assert.equal(again.package.controls["PE-2"].notes, "keep-pe");
    assert.equal(again.package.assets[0].assetName, "keep asset");
    assert.equal(fs.existsSync(path.join(root, "data", "package.json.tmp")), false);
  });
});

describe("F3 packageStore round-trip", () => {
  it("saves and loads inheritanceSources via temp dirs, not data/", () => {
    const dir = tempDir();
    const file = path.join(dir, "package.json");
    const pkg = migratePackage({
      ...schema3Package(),
      inheritanceSources: seedSldssInheritanceSources(),
      assets: seedSldssAssets(),
      software: [],
      boundary: seedSldssBoundary(),
      dataFlows: seedSldssDataFlows(),
      controls: {
        "PE-2": {
          controlId: "PE-2",
          selection: "inherited",
          inheritanceSourceId: SAMPLE_GSS_SOURCE_ID,
        },
      },
    });
    assert.equal(validateInheritance(pkg).ok, true);
    const saved = savePackage(file, pkg);
    assert.equal(saved.ok, true);
    const loaded = loadPackage(file);
    const normalized = migratePackage(loaded.package);
    assert.equal(normalized.schemaVersion, 5);
    assert.equal(normalized.inheritanceSources.length, 3);
    assert.ok(normalized.inheritanceSources.some((s) => s.packageId === "EM-GSS-0000441"));
    assert.equal(normalized.assets.length, 8);
    assert.equal(validateInheritance(normalized).ok, true);
  });
});

describe("F3 source wiring in sample and server", () => {
  it("sample seeds inheritance sources and does not mint extra official-looking package IDs", () => {
    const sample = fs.readFileSync(path.join(root, "src/data/sample.ts"), "utf8");
    assert.match(sample, /seedSldssInheritanceSources\(\)/);
    assert.match(sample, /sampleInheritanceSourceId/);
    const src = fs.readFileSync(path.join(root, "src/lib/inheritance.mjs"), "utf8");
    assert.match(src, /EM-GSS-0000441/);
    assert.match(src, /SAMPLE-ICAM/);
    assert.equal(/EM-ICAM-\d+/.test(src), false);
    const server = [
      fs.readFileSync(path.join(root, "server/index.mjs"), "utf8"),
      fs.readFileSync(path.join(root, "server/packageApi.mjs"), "utf8"),
    ].join("\n");
    assert.match(server, /hydrateOnLoad|migratePackage|getHydratedPackage/);
    assert.match(server, /validateInheritance/);
  });
});

describe("F3 HW CSV no Role", () => {
  it("Joint hardware CSV does not emit a Role column", () => {
    const csv = hardwareCsv(seedSldssAssets());
    const header = csv.split("\n")[0];
    assert.equal(header, HW_CSV_COLUMNS.join(","));
    assert.equal(header.includes("Role"), false);
    assert.equal(HW_CSV_COLUMNS.includes("Role"), false);
  });
});

describe("F3 GET /api/package hydrate does not wipe user rows", () => {
  it("hydrates missing inheritanceSources as [] and does not replace user assets with sample seed", () => {
    const dir = tempDir();
    const file = path.join(dir, "package.json");
    const old = schema3Package();
    savePackage(file, old);
    const onDisk = loadPackage(file, { audit: false }).package;
    assert.equal(onDisk.assets[0].assetName, "keep asset");
    assert.equal(Object.hasOwn(onDisk, "inheritanceSources"), false);

    const result = getHydratedPackage(file);
    assert.equal(result.ok, true);
    assert.equal(result.package.schemaVersion, 5);
    assert.deepEqual(result.package.inheritanceSources, []);
    assert.equal(result.package.assets.length, 1);
    assert.equal(result.package.assets[0].assetName, "keep asset");
    assert.equal(result.package.controls["AC-1"].notes, "keep-me");
    assert.equal(result.package.controls["PE-2"].notes, "keep-pe");
    assert.equal(result.package.controls["PE-2"].inheritanceSourceId, "");
    assert.equal(JSON.stringify(result.package.assets).includes("RHEL 8 application VM"), false);

    const after = loadPackage(file, { audit: false }).package;
    assert.equal(after.assets[0].assetName, "keep asset");
    assert.equal(after.assets.length, 1);
    assert.deepEqual(after.inheritanceSources ?? [], []);
  });

  it("PUT rejects inherited/hybrid missing source and leaves the file unchanged", () => {
    const dir = tempDir();
    const file = path.join(dir, "package.json");
    const good = schema3Package();
    good.controls["PE-2"].selection = "in-scope";
    savePackage(file, good);
    const before = fs.readFileSync(file);
    const invalid = {
      ...good,
      inheritanceSources: seedSldssInheritanceSources(),
      controls: {
        "PE-2": { controlId: "PE-2", selection: "inherited", inheritanceSourceId: "" },
      },
    };
    const result = putValidatedPackage(file, invalid);
    assert.equal(result.ok, false);
    assert.equal(result.errorClass, "InheritanceSourceRequired");
    assert.deepEqual(fs.readFileSync(file), before);
  });
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { loadPackage, savePackage } from "../server/packageStore.mjs";
import { getHydratedPackage } from "../server/packageApi.mjs";
import { applyIngest, previewIngestAgainstPackage, storeTaggedArtifact } from "../server/ingestApi.mjs";
import { parseIngestBuffer } from "../src/lib/ingest/parse.mjs";
import { STORE_ONLY_TYPES, isStoreOnlyType, allowsStoreOnly } from "../src/lib/ingest/artifacts.mjs";
import { SCHEMA_VERSION, seedSldssAssets, seedSldssSoftware } from "../src/lib/inventory.mjs";
import { seedSldssBoundary } from "../src/lib/boundary.mjs";
import { hydrateNeedsPersist, migratePackage } from "../src/lib/inheritance.mjs";
import {
  SCHEMA_VERSION as STIG_SCHEMA,
  ensureStigAssignments,
  seedSldssStigAssignments,
  stigFamilyFor,
  unassignedAssets,
} from "../src/lib/stig.mjs";

const temps = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-f4-"));
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

function schema4Package(overrides = {}) {
  return {
    schemaVersion: 4,
    framework: "DoD RMF",
    catalog: "NIST SP 800-53 Revision 5",
    systemOfRecord: "eMASS",
    cmmcInScope: false,
    sample: false,
    updatedAt: "2026-08-28T00:00:00.000Z",
    intake: { systemName: "Fixture System", acronym: "FX" },
    controls: {
      "AC-1": {
        controlId: "AC-1",
        selection: "in-scope",
        assessment: "in-progress",
        implementation: "implemented",
        notes: "keep-me-f4",
        inheritanceSourceId: "",
      },
    },
    policies: [],
    evidence: [],
    poams: [],
    ssp: { purpose: "keep ssp" },
    assets: [{ id: "a1", assetName: "keep asset", assetType: "Server", osFirmware: "RHEL 8" }],
    software: [{ id: "s1", name: "keep sw", version: "1" }],
    boundary: {
      inbound: [],
      outbound: [],
      interconnect: [{ id: "ix-vpn", name: "site-to-site VPN concentrator", ownership: "inherited/GSS" }],
    },
    dataFlows: [],
    boundaryDiagramEvidenceId: "",
    inheritanceSources: [],
    artifacts: [],
    ...overrides,
  };
}

describe("F4 sample STIG assignments", () => {
  it("seeds eight hosts, F5 absent, jumps windows-server, postgres hosts unassigned, postgresql on software", () => {
    const assets = seedSldssAssets();
    const software = seedSldssSoftware();
    const assignments = seedSldssStigAssignments();
    const pkg = ensureStigAssignments({
      schemaVersion: 4,
      cmmcInScope: false,
      assets,
      software,
      stigAssignments: assignments,
      boundary: seedSldssBoundary(),
    });

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

    const assetBlob = JSON.stringify(assets).toLowerCase();
    assert.equal(assetBlob.includes("f5"), false);
    assert.equal(assetBlob.includes("proxy"), false);
    const assignBlob = JSON.stringify(assignments).toLowerCase();
    assert.equal(assignBlob.includes("f5"), false);
    assert.equal(assignBlob.includes("proxy"), false);
    assert.equal(assignBlob.includes("vpn"), false);
    assert.equal(/u_rhel|u_ms_|v2r3|win10|win11/.test(assignBlob), false);
    assert.ok(assignments.every((row) => row.officialId === "" || row.officialId === "TBD"));

    const jumps = assets.filter((a) => /jump host/i.test(a.notes));
    assert.equal(jumps.length, 2);
    assert.ok(jumps.every((a) => a.osFirmware === "Windows Server"));
    assert.equal(/win10|win11|windows 10|windows 11/i.test(JSON.stringify(jumps)), false);
    for (const jump of jumps) {
      assert.equal(stigFamilyFor(pkg, "asset", jump.id), "windows-server");
    }

    const postgresHosts = assets.filter((a) => /postgresql vm/i.test(a.assetName));
    assert.equal(postgresHosts.length, 2);
    assert.ok(postgresHosts.every((a) => a.osFirmware === ""));
    assert.ok(postgresHosts.every((a) => stigFamilyFor(pkg, "asset", a.id) === ""));
    const unassigned = unassignedAssets(pkg);
    assert.deepEqual(
      unassigned.map((a) => a.id).sort(),
      ["sldss-hw-db-1", "sldss-hw-db-2"].sort(),
    );

    const pgSw = software.find((s) => s.id === "sldss-sw-pg");
    assert.equal(pgSw?.name, "PostgreSQL");
    assert.equal(stigFamilyFor(pkg, "software", "sldss-sw-pg"), "postgresql");
    assert.equal(
      assignments.filter((row) => row.targetKind === "software" && row.stigProductFamily === "postgresql").length,
      1,
    );
    assert.equal(
      assignments.some((row) => row.targetKind === "asset" && row.stigProductFamily === "postgresql"),
      false,
    );

    const rhel = assignments.filter((row) => row.targetKind === "asset" && row.stigProductFamily === "rhel-8");
    assert.deepEqual(
      rhel.map((row) => row.targetId).sort(),
      ["sldss-hw-app-1", "sldss-hw-app-2", "sldss-hw-app-3", "sldss-hw-app-4"].sort(),
    );

    const vpn = seedSldssBoundary().interconnect.filter((row) => /vpn/i.test(row.name));
    assert.equal(vpn.length, 1);
    assert.equal(
      assignments.some((row) => row.targetId === vpn[0].id || /vpn/i.test(row.targetId)),
      false,
    );

    assert.equal(pkg.cmmcInScope, false);
  });
});

describe("F4 schema 4 to 5 migrate", () => {
  it("loads missing stigAssignments as [] without sample-seeding or corrupting the rest", () => {
    const old = schema4Package();
    assert.equal(Object.hasOwn(old, "stigAssignments"), false);
    const migrated = migratePackage(old);
    assert.equal(migrated.schemaVersion, 5);
    assert.equal(SCHEMA_VERSION, 5);
    assert.equal(STIG_SCHEMA, 5);
    assert.deepEqual(migrated.stigAssignments, []);
    assert.equal(migrated.controls["AC-1"].notes, "keep-me-f4");
    assert.equal(migrated.controls["AC-1"].assessment, "in-progress");
    assert.equal(migrated.assets[0].assetName, "keep asset");
    assert.equal(migrated.software[0].name, "keep sw");
    assert.equal(migrated.boundary.interconnect[0].name, "site-to-site VPN concentrator");
    assert.equal(migrated.cmmcInScope, false);
    assert.equal(JSON.stringify(migrated.stigAssignments).includes("sldss-hw-app-1"), false);
    assert.equal(JSON.stringify(migrated.assets).includes("RHEL 8 application VM"), false);
  });

  it("drops invalid families (win10/win11) and does not invent official DISA STIG IDs", () => {
    const migrated = ensureStigAssignments({
      ...schema4Package(),
      stigAssignments: [
        { targetKind: "asset", targetId: "a1", stigProductFamily: "win10", officialId: "U_MS_WINDOWS_10_V2R3" },
        { targetKind: "asset", targetId: "a1b", stigProductFamily: "win11", officialId: "" },
        { targetKind: "asset", targetId: "a1", stigProductFamily: "windows-server", officialId: "" },
        { targetKind: "nope", targetId: "x", stigProductFamily: "rhel-8", officialId: "" },
      ],
    });
    assert.deepEqual(migrated.stigAssignments, [
      { targetKind: "asset", targetId: "a1", stigProductFamily: "windows-server", officialId: "" },
    ]);
    assert.equal(/U_MS_WINDOWS_10_V2R3|U_RHEL_8_V2R3/.test(JSON.stringify(migrated.stigAssignments)), false);
  });
});

describe("F4 GET hydrate is non-destructive", () => {
  it("hydrates missing stigAssignments as [] and does not replace user rows with sample seed", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const old = schema4Package({
      assets: seedSldssAssets(),
      software: seedSldssSoftware(),
    });
    assert.equal(Object.hasOwn(old, "stigAssignments"), false);
    savePackage(file, old);
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, true);
    const hydrated = migratePackage(loaded.package);
    assert.equal(hydrateNeedsPersist(loaded.package, hydrated), true);
    assert.equal(hydrated.schemaVersion, 5);
    assert.deepEqual(hydrated.stigAssignments, []);
    assert.equal(hydrated.assets.length, 8);
    assert.equal(unassignedAssets(hydrated).length, 8);

    const result = getHydratedPackage(file);
    assert.equal(result.ok, true);
    assert.equal(result.package.schemaVersion, 5);
    assert.deepEqual(result.package.stigAssignments, []);
    assert.equal(result.package.assets[0].assetName, "RHEL 8 application VM 1");
    assert.equal(result.package.controls["AC-1"].notes, "keep-me-f4");
    assert.equal(result.package.controls["AC-1"].assessment, "in-progress");
    assert.equal(stigFamilyFor(result.package, "asset", "sldss-hw-app-1"), "");
    assert.equal(stigFamilyFor(result.package, "software", "sldss-sw-pg"), "");

    const after = loadPackage(file, { audit: false }).package;
    assert.deepEqual(after.stigAssignments ?? [], []);
    assert.equal(after.assets.length, 8);
    assert.equal(fs.existsSync(path.join(root, "data", "package.json.tmp")), false);
  });
});

describe("F4 no auto-Satisfied", () => {
  it("STIG assignments do not flip control assessment to satisfied", () => {
    const pkg = ensureStigAssignments({
      ...schema4Package(),
      assets: seedSldssAssets(),
      software: seedSldssSoftware(),
      stigAssignments: seedSldssStigAssignments(),
    });
    assert.equal(pkg.controls["AC-1"].assessment, "in-progress");
    assert.notEqual(pkg.controls["AC-1"].assessment, "satisfied");
    const src = fs.readFileSync(path.join(root, "src/lib/stig.mjs"), "utf8");
    assert.equal(/\bassessment\s*=\s*["']satisfied["']/.test(src), false);
    assert.equal(Object.values(pkg.controls).some((row) => row.assessment === "satisfied"), false);
  });
});

describe("F4 STORE-only nessus/cklb; old .ckl XML PARSE stays rejected", () => {
  it("PARSE of old .ckl XML is UnsupportedIngestType; .nessus/.cklb may PARSE (F5)", () => {
    const nessus = parseIngestBuffer(Buffer.from("<NessusClientData_v2/>"), { filename: "scan.nessus" });
    assert.equal(nessus.ok, true);
    assert.equal(nessus.kind, "nessus");
    assert.equal(nessus.errorClass, null);
    const cklb = parseIngestBuffer(Buffer.from(JSON.stringify({ stigs: [], target_data: {} })), { filename: "bench.cklb" });
    assert.equal(cklb.ok, true);
    assert.equal(cklb.kind, "cklb");
    const ckl = parseIngestBuffer(Buffer.from("<CHECKLIST/>"), { filename: "bench.ckl" });
    assert.equal(ckl.ok, false);
    assert.equal(ckl.errorClass, "UnsupportedIngestType");

    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    savePackage(file, migratePackage(schema4Package()));
    const preview = previewIngestAgainstPackage(
      file,
      { buffer: Buffer.from("<CHECKLIST/>"), filename: "bench.ckl" },
      { audit: false },
    );
    assert.equal(preview.ok, false);
    assert.equal(preview.errorClass, "UnsupportedIngestType");
    const applied = applyIngest(
      file,
      path.join(dir, "evidence"),
      { buffer: Buffer.from("<CHECKLIST/>"), filename: "bench.ckl" },
      { audit: false },
    );
    assert.equal(applied.ok, false);
    assert.equal(applied.errorClass, "UnsupportedIngestType");
  });

  it("STORE-only nessus and cklb tag encrypted originals without parsing", () => {
    assert.equal(isStoreOnlyType("nessus"), true);
    assert.equal(isStoreOnlyType("cklb"), true);
    assert.equal(allowsStoreOnly("nessus"), true);
    assert.equal(allowsStoreOnly("cklb"), true);
    assert.ok(STORE_ONLY_TYPES.includes("nessus"));
    assert.ok(STORE_ONLY_TYPES.includes("cklb"));

    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, migratePackage(schema4Package()));
    const storedNessus = storeTaggedArtifact(
      file,
      evidenceDir,
      { buffer: Buffer.from("<NessusClientData_v2/>do-not-parse"), filename: "scan.nessus", artifactType: "nessus" },
      { audit: false },
    );
    assert.equal(storedNessus.ok, true);
    assert.equal(storedNessus.artifact.artifactType, "nessus");
    assert.equal(storedNessus.artifact.mode, "store-only");
    const storedCklb = storeTaggedArtifact(
      file,
      evidenceDir,
      { buffer: Buffer.from('{"stigs":[]}'), filename: "bench.cklb", artifactType: "cklb" },
      { audit: false },
    );
    assert.equal(storedCklb.ok, true);
    assert.equal(storedCklb.artifact.artifactType, "cklb");
    assert.equal(storedCklb.artifact.mode, "store-only");
    assert.notEqual(storedNessus.artifact.id, storedCklb.artifact.id);
    assert.equal(storedCklb.package.controls["AC-1"].assessment, "in-progress");
    assert.equal(storedCklb.package.ssp.purpose, "keep ssp");
  });
});

describe("F4 sample wiring", () => {
  it("sample seeds stigAssignments and UI matrix exists; schema is 5", () => {
    const sample = fs.readFileSync(path.join(root, "src/data/sample.ts"), "utf8");
    assert.match(sample, /seedSldssStigAssignments\(\)/);
    const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
    assert.match(app, /\/stig/);
    assert.match(app, /STIG matrix/);
    const page = fs.readFileSync(path.join(root, "src/pages/Stig.tsx"), "utf8");
    assert.match(page, /Unassigned hosts/);
    assert.match(page, /Software-row STIGs/);
    assert.match(page, /Assets vs family/);
    assert.equal(/U_RHEL_8_V2R3/.test(page), false);
    assert.equal(SCHEMA_VERSION, 5);
  });
});

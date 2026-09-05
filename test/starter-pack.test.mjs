import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { savePackage } from "../server/packageStore.mjs";
import { emitWorkingPapers } from "../server/emitApi.mjs";
import { storeTaggedArtifact } from "../server/ingestApi.mjs";
import { isStoreOnlyType, allowsStoreOnly, STORE_ONLY_TYPES } from "../src/lib/ingest/artifacts.mjs";
import {
  applyStarterPack,
  emptyDesignExtract,
  ensureDesignExtract,
  guessStigFamily,
  normalizeDesignExtract,
  sampleSldssDesignExtract,
  starterPackChecklist,
  starterPackCsv,
  starterPackMarkdown,
} from "../src/lib/starterPack.mjs";
import { buildEmitFiles } from "../src/lib/emit.mjs";
import { unzipNames } from "../src/lib/zipMemory.mjs";

const temps = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-starter-"));
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

const miniCatalog = [
  { id: "AC-1", title: "Policy and Procedures", overlays: ["nist-moderate", "cnssi-1253", "dod-rmf"], policyControl: true },
  { id: "AC-2", title: "Account Management", overlays: ["nist-moderate", "cnssi-1253", "dod-rmf"], policyControl: false },
  { id: "SC-7", title: "Boundary Protection", overlays: ["nist-moderate", "cnssi-1253", "dod-rmf"], policyControl: false },
];

function barePkg(overrides = {}) {
  return {
    schemaVersion: 5,
    framework: "DoD RMF",
    catalog: "NIST SP 800-53 Revision 5",
    systemOfRecord: "eMASS",
    cmmcInScope: false,
    sample: false,
    updatedAt: "2026-09-04T00:00:00.000Z",
    intake: {
      systemName: "Fixture System",
      acronym: "FX",
      emassSystemId: "",
      emassRegistrationStatus: "not-registered",
      confidentiality: "Low",
      integrity: "Low",
      availability: "Low",
      overlayNistModerate: false,
      overlayCnssi1253: false,
      overlayDodRmf: false,
      overlayPrivacy: false,
      dataTypes: "",
      impactJustification: "",
      rmfStep: "Categorize",
      roles: {},
    },
    controls: {},
    policies: [],
    evidence: [],
    poams: [],
    ssp: { purpose: "", authorizationBoundary: "" },
    assets: [],
    software: [],
    boundary: { inbound: [], outbound: [], interconnect: [] },
    dataFlows: [],
    boundaryDiagramEvidenceId: "",
    inheritanceSources: [],
    artifacts: [],
    stigAssignments: [],
    scanFindings: [],
    designExtract: emptyDesignExtract(),
    ...overrides,
  };
}

describe("starter pack artifact types", () => {
  it("treats tdd and conops as store-only", () => {
    assert.ok(STORE_ONLY_TYPES.includes("tdd"));
    assert.ok(STORE_ONLY_TYPES.includes("conops"));
    assert.equal(isStoreOnlyType("tdd"), true);
    assert.equal(allowsStoreOnly("conops"), true);
  });
});

describe("design extract normalize / ensure", () => {
  it("fills empty designExtract without inventing components", () => {
    const pkg = ensureDesignExtract({ schemaVersion: 5 });
    assert.equal(pkg.designExtract.components.length, 0);
    assert.equal(pkg.designExtract.interfaces.length, 0);
    assert.equal(pkg.designExtract.confidentiality, "Moderate");
  });

  it("normalizes sample SLDSS-paired extract", () => {
    const ex = sampleSldssDesignExtract();
    assert.ok(ex.components.length >= 3);
    assert.ok(ex.interfaces.some((row) => row.port === "443"));
    assert.equal(ex.confidentiality, "Moderate");
  });
});

describe("guessStigFamily", () => {
  it("maps OS/app text to product families and never invents official IDs", () => {
    assert.equal(guessStigFamily("RHEL 8"), "rhel-8");
    assert.equal(guessStigFamily("Windows Server"), "windows-server");
    assert.equal(guessStigFamily("PostgreSQL 15"), "postgresql");
    assert.equal(guessStigFamily("obscure appliance"), "");
  });
});

describe("applyStarterPack", () => {
  it("seeds intake, HW/SW, dataFlows, STIG draft with blank officialId, and catalog controls", () => {
    const extract = sampleSldssDesignExtract();
    const next = applyStarterPack(barePkg(), extract, { catalog: miniCatalog, merge: false });
    assert.equal(next.intake.confidentiality, "Moderate");
    assert.equal(next.intake.overlayNistModerate, true);
    assert.equal(next.intake.rmfStep, "Select");
    assert.ok(next.intake.impactJustification.includes("working paper"));
    assert.ok(next.assets.length >= 3);
    assert.ok(next.software.some((row) => /postgres/i.test(row.name)));
    assert.ok(next.dataFlows.some((row) => row.port === "443" && row.protocol === "TCP"));
    assert.ok(next.stigAssignments.length > 0);
    assert.ok(next.stigAssignments.every((row) => row.officialId === ""));
    assert.ok(next.controls["AC-1"]);
    assert.ok(next.controls["AC-2"]);
    assert.ok(next.designExtract.generatedAt);
  });

  it("does not invent DISA STIG IDs on merge regenerate", () => {
    const first = applyStarterPack(barePkg(), sampleSldssDesignExtract(), { catalog: miniCatalog });
    first.stigAssignments[0].officialId = "TBD";
    const second = applyStarterPack(first, sampleSldssDesignExtract(), { catalog: miniCatalog, merge: true });
    assert.ok(second.stigAssignments.every((row) => row.officialId === "" || row.officialId === "TBD"));
    assert.equal(second.stigAssignments.some((row) => /V-\d+|U_\w+_STIG/.test(row.officialId)), false);
  });
});

describe("starterPackChecklist", () => {
  it("reports percent for starter artifacts without AO claims", () => {
    const empty = starterPackChecklist(barePkg());
    assert.equal(empty.total, 5);
    assert.ok(empty.percent < 100);
    const filled = applyStarterPack(barePkg(), sampleSldssDesignExtract(), { catalog: miniCatalog });
    const check = starterPackChecklist(filled);
    assert.equal(check.percent, 100);
    assert.equal(check.done, 5);
  });
});

describe("starter pack emit", () => {
  it("includes starter-pack MD and CSV in zip file list", () => {
    const pkg = applyStarterPack(barePkg(), sampleSldssDesignExtract(), { catalog: miniCatalog });
    const files = buildEmitFiles(pkg);
    const names = files.map((f) => f.name);
    assert.ok(names.includes("FX-starter-pack.md"));
    assert.ok(names.includes("FX-starter-pack.csv"));
    const md = starterPackMarkdown(pkg);
    assert.match(md, /Working papers only/);
    assert.match(md, /Not an official DISA/);
    const csv = starterPackCsv(pkg);
    assert.match(csv, /Categorization memo/);
  });

  it("emitWorkingPapers zip contains starter-pack entries", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    fs.mkdirSync(evidenceDir);
    const pkg = applyStarterPack(barePkg(), sampleSldssDesignExtract(), { catalog: miniCatalog });
    savePackage(file, pkg, { audit: false });
    const emitted = emitWorkingPapers(file, evidenceDir, { audit: false });
    assert.equal(emitted.ok, true);
    const names = unzipNames(emitted.buffer);
    assert.ok(names.includes("FX-starter-pack.md"));
    assert.ok(names.includes("FX-starter-pack.csv"));
  });
});

describe("store tdd/conops artifacts", () => {
  it("stores tdd as tagged encrypted original without parsing narrative", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    fs.mkdirSync(evidenceDir);
    const pkg = barePkg({ ssp: { purpose: "keep ssp", authorizationBoundary: "lab" } });
    savePackage(file, pkg, { audit: false });
    const bytes = Buffer.from("# fictional TDD\nkeep me store-only\n", "utf8");
    const stored = storeTaggedArtifact(
      file,
      evidenceDir,
      { buffer: bytes, filename: "tdd.md", artifactType: "tdd" },
      { audit: false },
    );
    assert.equal(stored.ok, true);
    assert.equal(stored.artifact.artifactType, "tdd");
    assert.equal(stored.artifact.mode, "store-only");
    assert.equal(stored.package.ssp.purpose, "keep ssp");
    assert.ok(stored.package.artifacts.some((row) => row.artifactType === "tdd"));
  });
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { applyIngest, applyPoamSeed, previewPoamSeedAgainstPackage } from "../server/ingestApi.mjs";
import { savePackage } from "../server/packageStore.mjs";
import { previewMerge } from "../src/lib/ingest/merge.mjs";
import { parseCklbJson } from "../src/lib/ingest/scan.mjs";
import { SCHEMA_VERSION, seedSldssAssets } from "../src/lib/inventory.mjs";
import { migratePackage } from "../src/lib/inheritance.mjs";
import { POAM_CSV_COLUMNS, TBD_EMASS } from "../src/lib/poamCsv.mjs";
import {
  applyPoamSeedFromFindings,
  draftPoamFromOpenFinding,
  previewPoamSeedFromFindings,
} from "../src/lib/scanPoamSeed.mjs";
import { seedSldssStigAssignments } from "../src/lib/stig.mjs";

const temps = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-f7-"));
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

function fixtureCklbMixed() {
  return JSON.stringify({
    title: "Fixture CKLB mixed statuses",
    id: "fixture-cklb-f7",
    stigs: [
      {
        stig_name: "Fixture Windows Server product family",
        stig_id: "FIXTURE-WS",
        rules: [
          {
            group_id: "V-FIX-0001",
            rule_id: "SV-FIX-0001",
            severity: "medium",
            rule_title: "Fixture open rule",
            status: "open",
            ccis: ["CCI-999001"],
          },
          {
            group_id: "V-FIX-0002",
            rule_id: "SV-FIX-0002",
            severity: "low",
            rule_title: "Fixture not a finding",
            status: "notafinding",
          },
          {
            group_id: "V-FIX-0003",
            rule_id: "SV-FIX-0003",
            severity: "info",
            rule_title: "Fixture informational",
            status: "informational",
          },
        ],
      },
    ],
    target_data: { host_name: "fx-jump-1" },
  });
}

function baselineAssets() {
  const assets = seedSldssAssets();
  const byId = new Map(assets.map((row) => [row.id, row]));
  byId.get("sldss-hw-jump-1").hostName = "fx-jump-1";
  return assets;
}

function fixturePkg(overrides = {}) {
  return {
    schemaVersion: 5,
    framework: "DoD RMF",
    catalog: "NIST SP 800-53 Revision 5",
    systemOfRecord: "eMASS",
    cmmcInScope: false,
    sample: false,
    updatedAt: "2026-08-30T00:00:00.000Z",
    intake: { systemName: "Fixture System", acronym: "FX" },
    controls: {
      "AC-1": {
        controlId: "AC-1",
        selection: "in-scope",
        assessment: "in-progress",
        implementation: "implemented",
        notes: "keep-me-f7",
        inheritanceSourceId: "",
      },
    },
    policies: [],
    evidence: [],
    poams: [],
    ssp: { purpose: "keep ssp" },
    assets: baselineAssets(),
    software: [],
    boundary: { inbound: [], outbound: [], interconnect: [] },
    dataFlows: [],
    boundaryDiagramEvidenceId: "",
    inheritanceSources: [],
    artifacts: [],
    stigAssignments: seedSldssStigAssignments(),
    ...overrides,
  };
}

describe("F7 open finding seeds existing POA&M columns only", () => {
  it("drafts Weakness/Description from title/pluginId with TBD-eMASS and blank Control", () => {
    const parsed = parseCklbJson(fixtureCklbMixed());
    const open = parsed.rows.find((row) => row.status === "open");
    const draft = draftPoamFromOpenFinding(open);
    assert.equal(draft.emassPoamId, TBD_EMASS);
    assert.equal(draft.controlId, "");
    assert.equal(draft.weakness, "Fixture open rule");
    assert.equal(draft.description, "SV-FIX-0001");
    assert.equal(draft.source, "cklb");
    assert.equal(draft.status, "open");
    assert.equal(draft.risk, "");
    assert.equal(draft.residualRisk, "");
    assert.equal(draft.atoBlocker, false);
    assert.equal(Object.hasOwn(draft, "weaknessIdentifier"), false);
    const preview = previewPoamSeedFromFindings([], parsed.rows, { catalogIds: ["AC-1"] });
    assert.equal(preview.counts.add, 1);
    assert.equal(preview.counts.conflict, 0);
    assert.equal(preview.items.length, 1);
    assert.equal(preview.items[0].incoming.controlId, "");
    const notAFinding = parsed.rows.find((row) => row.status === "not-a-finding");
    const info = parsed.rows.find((row) => row.status === "informational");
    assert.ok(notAFinding);
    assert.ok(info);
  });
});

describe("F7 unknown Control stays skipped on CSV ingest; seed does not mint", () => {
  it("does not add ZZ-99 to the catalog and treats a minted Control as unknown-control on POA&M PARSE merge", () => {
    const parsed = parseCklbJson(fixtureCklbMixed());
    const open = parsed.rows.find((row) => row.status === "open");
    const draft = { ...draftPoamFromOpenFinding(open), controlId: "ZZ-99" };
    const csvPreview = previewMerge("poam", [], [draft], { catalogIds: ["AC-1"] });
    assert.equal(csvPreview.items[0].status, "conflict");
    assert.equal(csvPreview.items[0].reason, "unknown-control");
    const seed = applyPoamSeedFromFindings([], parsed.rows, { catalogIds: ["AC-1"] });
    assert.equal(seed.applied.added, 1);
    assert.equal(seed.rows[0].controlId, "");
    assert.equal(seed.rows.some((row) => row.controlId === "ZZ-99"), false);
  });
});

describe("F7 merge preview does not silently overwrite", () => {
  it("conflicts when an existing row differs and skips without confirm", () => {
    const parsed = parseCklbJson(fixtureCklbMixed());
    const open = parsed.rows.find((row) => row.status === "open");
    const existing = {
      id: "poam-keep",
      emassPoamId: "EM-KEEP-1",
      controlId: "AC-1",
      weakness: "Fixture open rule",
      description: "SV-FIX-0001",
      source: "cklb",
      status: "ongoing",
      risk: "Low",
      residualRisk: "Low",
      resources: "keep-resources",
      scheduledCompletion: "",
      milestones: "",
      poc: "",
      comments: "",
      atoBlocker: false,
    };
    const preview = previewPoamSeedFromFindings([existing], parsed.rows, { catalogIds: ["AC-1"] });
    assert.equal(preview.items[0].status, "conflict");
    assert.equal(preview.items[0].reason, "field-mismatch");
    const skipped = applyPoamSeedFromFindings([existing], parsed.rows, { catalogIds: ["AC-1"] });
    assert.equal(skipped.applied.skipped, 1);
    assert.equal(skipped.rows[0].status, "ongoing");
    assert.equal(skipped.rows[0].emassPoamId, "EM-KEEP-1");
    assert.equal(skipped.rows[0].resources, "keep-resources");
  });
});

describe("F7 apply through store; scan PARSE still does not auto-seed", () => {
  it("seeds open findings only, leaves controls and assessment, keeps existing POA&M columns", () => {
    assert.deepEqual(POAM_CSV_COLUMNS, [
      "eMASS_POAM_ID",
      "Control",
      "Weakness",
      "Description",
      "Source",
      "Status",
      "Risk",
      "Residual_Risk",
      "Resources",
      "Scheduled_Completion",
      "Milestones",
      "POC",
      "ATO_Blocker",
      "Comments",
    ]);
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, migratePackage(fixturePkg()));
    const scanned = applyIngest(
      file,
      evidenceDir,
      { buffer: Buffer.from(fixtureCklbMixed()), filename: "fixture.cklb", artifactType: "cklb" },
      { audit: false },
    );
    assert.equal(scanned.ok, true);
    assert.equal(scanned.package.poams.length, 0);
    assert.equal(scanned.package.controls["AC-1"].assessment, "in-progress");
    const preview = previewPoamSeedAgainstPackage(file, { audit: false });
    assert.equal(preview.ok, true);
    assert.equal(preview.counts.add, 1);
    const seeded = applyPoamSeed(file, { audit: false });
    assert.equal(seeded.ok, true);
    assert.equal(seeded.applied.added, 1);
    assert.equal(seeded.package.poams.length, 1);
    const row = seeded.package.poams[0];
    assert.equal(row.emassPoamId, TBD_EMASS);
    assert.equal(row.controlId, "");
    assert.equal(row.weakness, "Fixture open rule");
    assert.equal(row.description, "SV-FIX-0001");
    assert.equal(row.source, "cklb");
    assert.equal(Object.keys(seeded.package.controls).join(","), "AC-1");
    assert.equal(seeded.package.controls["AC-1"].assessment, "in-progress");
    assert.notEqual(seeded.package.controls["AC-1"].assessment, "satisfied");
    assert.equal(seeded.package.controls["AC-1"].selection, "in-scope");
    assert.equal(seeded.package.controls["AC-1"].implementation, "implemented");
    assert.equal(seeded.package.controls["AC-1"].notes, "keep-me-f7");
    assert.equal(seeded.package.cmmcInScope, false);
    assert.equal(SCHEMA_VERSION, 5);
    const again = applyPoamSeed(file, { audit: false });
    assert.equal(again.ok, true);
    assert.equal(again.applied.unchanged, 1);
    assert.equal(again.applied.added, 0);
    assert.equal(again.package.poams.length, 1);
    assert.equal(again.package.poams[0].emassPoamId, TBD_EMASS);
  });
});

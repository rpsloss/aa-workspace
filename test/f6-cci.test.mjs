import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { applyIngest, previewIngestAgainstPackage } from "../server/ingestApi.mjs";
import { savePackage } from "../server/packageStore.mjs";
import { parseIngestBuffer } from "../src/lib/ingest/parse.mjs";
import {
  cciAdvisoryDisplay,
  collectCciIdsFromCklbRule,
  extractCciIdsFromText,
  parseCklbJson,
  parseNessusXml,
} from "../src/lib/ingest/scan.mjs";
import { SCHEMA_VERSION, seedSldssAssets } from "../src/lib/inventory.mjs";
import { migratePackage } from "../src/lib/inheritance.mjs";
import { seedSldssStigAssignments } from "../src/lib/stig.mjs";

const temps = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-f6-"));
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

function fixtureCklbWithCci() {
  return JSON.stringify({
    title: "Fixture CKLB with CCI field",
    id: "fixture-cklb-cci-1",
    stigs: [
      {
        stig_name: "Fixture Windows Server product family",
        stig_id: "FIXTURE-WS",
        rules: [
          {
            group_id: "V-FIX-0001",
            rule_id: "SV-FIX-0001",
            severity: "medium",
            rule_title: "Fixture rule with in-file CCI",
            status: "open",
            ccis: ["CCI-999001"],
          },
        ],
      },
    ],
    target_data: { host_name: "fx-jump-1" },
  });
}

function fixtureCklbWithoutCci() {
  return JSON.stringify({
    title: "Fixture CKLB without CCI field",
    id: "fixture-cklb-nocci-1",
    stigs: [
      {
        stig_name: "Fixture Windows Server product family",
        stig_id: "FIXTURE-WS",
        rules: [
          {
            group_id: "V-FIX-0001",
            rule_id: "SV-FIX-0001",
            severity: "medium",
            rule_title: "Fixture rule without CCI",
            status: "open",
            check_content: "Fictional check. Mentions CCI-999009 only in prose, not a CCI field.",
          },
        ],
      },
    ],
    target_data: { host_name: "fx-jump-1" },
  });
}

function fixtureNessusWithCci() {
  return `<?xml version="1.0" ?>
<NessusClientData_v2>
  <Policy>
    <policyName>Fixture Lab Scan</policyName>
  </Policy>
  <Report name="fixture-report">
    <ReportHost name="fx-app-1">
      <ReportItem pluginID="999001" pluginName="Fixture open finding" pluginFamily="Fixture" severity="2">
        <cm:compliance-reference>CCI-999002</cm:compliance-reference>
        <description>Fictional finding for tests.</description>
      </ReportItem>
    </ReportHost>
  </Report>
</NessusClientData_v2>
`;
}

function fixtureNessusWithoutCci() {
  return `<?xml version="1.0" ?>
<NessusClientData_v2>
  <Policy>
    <policyName>Fixture Lab Scan</policyName>
  </Policy>
  <Report name="fixture-report">
    <ReportHost name="fx-app-1">
      <ReportItem pluginID="999001" pluginName="Fixture open finding" pluginFamily="Fixture" severity="2">
        <description>Fictional finding. CCI-999008 appears only in description, not a CCI field.</description>
      </ReportItem>
    </ReportHost>
  </Report>
</NessusClientData_v2>
`;
}

function baselineAssets() {
  const assets = seedSldssAssets();
  const byId = new Map(assets.map((row) => [row.id, row]));
  byId.get("sldss-hw-app-1").hostName = "fx-app-1";
  byId.get("sldss-hw-jump-1").hostName = "fx-jump-1";
  byId.get("sldss-hw-db-1").hostName = "fx-db-1";
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
        notes: "keep-me-f6",
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

describe("F6 CKLB with in-file CCI copies it as advisory", () => {
  it("parses ccis from the CKLB rule field and does not mint extras", () => {
    const parsed = parseCklbJson(fixtureCklbWithCci());
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.rows[0].cciIds, ["CCI-999001"]);
    assert.equal(parsed.rows[0].cciAdvisory, "CCI-999001");
    assert.equal(cciAdvisoryDisplay(parsed.rows[0]), "CCI-999001");
    assert.equal(collectCciIdsFromCklbRule({ ccis: ["CCI-999001"] }).includes("CCI-999003"), false);
    const viaBuffer = parseIngestBuffer(Buffer.from(fixtureCklbWithCci()), { filename: "fixture.cklb" });
    assert.deepEqual(viaBuffer.rows[0].cciIds, ["CCI-999001"]);
  });
});

describe("F6 CKLB without CCI stays empty / TBD", () => {
  it("does not copy CCI tokens from check_content or mint a catalog id", () => {
    const parsed = parseCklbJson(fixtureCklbWithoutCci());
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.rows[0].cciIds, []);
    assert.equal(parsed.rows[0].cciAdvisory, "");
    assert.equal(cciAdvisoryDisplay(parsed.rows[0]), "TBD");
    assert.deepEqual(extractCciIdsFromText(""), []);
  });
});

describe("F6 Nessus CCI field vs description", () => {
  it("copies CCI from compliance-reference and ignores description-only tokens", () => {
    const withCci = parseNessusXml(fixtureNessusWithCci());
    assert.equal(withCci.ok, true);
    assert.deepEqual(withCci.rows[0].cciIds, ["CCI-999002"]);
    const without = parseNessusXml(fixtureNessusWithoutCci());
    assert.equal(without.ok, true);
    assert.deepEqual(without.rows[0].cciIds, []);
    assert.equal(cciAdvisoryDisplay(without.rows[0]), "TBD");
  });
});

describe("F6 apply findings does not auto-Satisfied", () => {
  it("stores advisory CCI and leaves selection, implementation, assessment, and POA&M unchanged", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    const before = migratePackage(fixturePkg());
    savePackage(file, before);
    const preview = previewIngestAgainstPackage(
      file,
      { buffer: Buffer.from(fixtureCklbWithCci()), filename: "fixture.cklb", artifactType: "cklb" },
      { audit: false },
    );
    assert.equal(preview.ok, true);
    assert.deepEqual(preview.items[0].incoming.cciIds, ["CCI-999001"]);
    const applied = applyIngest(
      file,
      evidenceDir,
      { buffer: Buffer.from(fixtureCklbWithCci()), filename: "fixture.cklb", artifactType: "cklb" },
      { audit: false },
    );
    assert.equal(applied.ok, true);
    const finding = applied.package.scanFindings.find((row) => row.pluginId === "SV-FIX-0001");
    assert.deepEqual(finding.cciIds, ["CCI-999001"]);
    assert.equal(finding.cciAdvisory, "CCI-999001");
    assert.equal(applied.package.controls["AC-1"].assessment, "in-progress");
    assert.notEqual(applied.package.controls["AC-1"].assessment, "satisfied");
    assert.equal(applied.package.controls["AC-1"].selection, "in-scope");
    assert.equal(applied.package.controls["AC-1"].implementation, "implemented");
    assert.equal(applied.package.controls["AC-1"].notes, "keep-me-f6");
    assert.equal(applied.package.poams.length, 0);
    assert.equal(applied.package.cmmcInScope, false);
    assert.equal(SCHEMA_VERSION, 5);
  });
});

describe("F6 apply without CCI stays empty and still not Satisfied", () => {
  it("stores empty cciIds and does not flip assessment", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, migratePackage(fixturePkg()));
    const applied = applyIngest(
      file,
      evidenceDir,
      { buffer: Buffer.from(fixtureCklbWithoutCci()), filename: "empty-cci.cklb", artifactType: "cklb" },
      { audit: false },
    );
    assert.equal(applied.ok, true);
    const finding = applied.package.scanFindings.find((row) => row.pluginId === "SV-FIX-0001");
    assert.deepEqual(finding.cciIds, []);
    assert.equal(finding.cciAdvisory, "");
    assert.equal(cciAdvisoryDisplay(finding), "TBD");
    assert.equal(applied.package.controls["AC-1"].assessment, "in-progress");
    assert.notEqual(applied.package.controls["AC-1"].assessment, "satisfied");
    assert.equal(applied.package.poams.length, 0);
    assert.equal(applied.package.cmmcInScope, false);
  });
});

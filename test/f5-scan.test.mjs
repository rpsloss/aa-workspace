import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isEncryptedBuffer, loadPackage, loadPossiblyEncryptedBytes, savePackage } from "../server/packageStore.mjs";
import { getHydratedPackage } from "../server/packageApi.mjs";
import { applyIngest, previewIngestAgainstPackage, storeTaggedArtifact } from "../server/ingestApi.mjs";
import { parseIngestBuffer } from "../src/lib/ingest/parse.mjs";
import { hasClassifiedMarking } from "../src/lib/ingest/scan.mjs";
import { SCHEMA_VERSION, seedSldssAssets, seedSldssSoftware } from "../src/lib/inventory.mjs";
import { seedSldssStigAssignments, stigFamilyFor } from "../src/lib/stig.mjs";
import { hydrateNeedsPersist, migratePackage } from "../src/lib/inheritance.mjs";

const temps = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-f5-"));
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

function fixtureNessus() {
  return `<?xml version="1.0" ?>
<NessusClientData_v2>
  <Policy>
    <policyName>Fixture Lab Scan</policyName>
  </Policy>
  <Report name="fixture-report">
    <ReportHost name="fx-app-1">
      <HostProperties>
        <tag name="host-ip">10.0.0.10</tag>
        <tag name="operating-system">Red Hat Enterprise Linux 8</tag>
      </HostProperties>
      <ReportItem pluginID="999001" pluginName="Fixture open finding" pluginFamily="Fixture" severity="2" port="0" protocol="tcp" svc_name="general">
        <risk_factor>Medium</risk_factor>
        <description>Fictional finding for tests.</description>
      </ReportItem>
    </ReportHost>
    <ReportHost name="fx-jump-1">
      <HostProperties>
        <tag name="operating-system">Windows 10</tag>
      </HostProperties>
      <ReportItem pluginID="999010" pluginName="Fixture jump finding" pluginFamily="Fixture" severity="1">
        <risk_factor>Low</risk_factor>
        <description>Fictional jump-host finding.</description>
      </ReportItem>
    </ReportHost>
    <ReportHost name="fx-db-1">
      <HostProperties>
        <tag name="operating-system">Red Hat Enterprise Linux 8</tag>
      </HostProperties>
      <ReportItem pluginID="999020" pluginName="Fixture db finding" pluginFamily="Fixture" severity="2">
        <description>Fictional postgres VM finding.</description>
      </ReportItem>
    </ReportHost>
    <ReportHost name="fx-f5-gss">
      <ReportItem pluginID="999002" pluginName="Fixture F5 finding" pluginFamily="Fixture" severity="3">
        <description>Fictional inherited GSS host.</description>
      </ReportItem>
    </ReportHost>
    <ReportHost name="fx-unknown">
      <ReportItem pluginID="999003" pluginName="Unmatched host finding" pluginFamily="Fixture" severity="1">
        <description>Fictional unmatched host.</description>
      </ReportItem>
    </ReportHost>
  </Report>
</NessusClientData_v2>
`;
}

function fixtureCklb() {
  return JSON.stringify({
    title: "Fixture CKLB",
    id: "fixture-cklb-1",
    stigs: [
      {
        stig_name: "Fixture Windows Server product family",
        stig_id: "FIXTURE-WS",
        rules: [
          {
            group_id: "V-FIX-0001",
            rule_id: "SV-FIX-0001",
            severity: "medium",
            rule_title: "Fixture rule",
            status: "open",
          },
          {
            group_id: "V-FIX-0002",
            rule_id: "SV-FIX-0002",
            severity: "low",
            rule_title: "Fixture not a finding",
            status: "notafinding",
          },
        ],
      },
    ],
    target_data: { host_name: "fx-jump-1" },
  });
}

function classifiedNessus() {
  return `<?xml version="1.0" ?>
<NessusClientData_v2>
  <Policy>
    <policyName>FIXTURE SECRET MARKING</policyName>
  </Policy>
  <Report name="fixture-classified">
    <ReportHost name="fx-app-1">
      <ReportItem pluginID="999001" pluginName="Must not ingest" pluginFamily="Fixture" severity="4">
        <description>Fictional.</description>
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
        notes: "keep-me-f5",
        inheritanceSourceId: "",
      },
    },
    policies: [],
    evidence: [],
    poams: [],
    ssp: { purpose: "keep ssp" },
    assets: baselineAssets(),
    software: seedSldssSoftware(),
    boundary: { inbound: [], outbound: [], interconnect: [] },
    dataFlows: [],
    boundaryDiagramEvidenceId: "",
    inheritanceSources: [],
    artifacts: [],
    stigAssignments: seedSldssStigAssignments(),
    ...overrides,
  };
}

describe("F5 parse .nessus and match hostname", () => {
  it("parses a fictional .nessus and matches Host Name to SLDSS assets", () => {
    const parsed = parseIngestBuffer(Buffer.from(fixtureNessus()), { filename: "fixture.nessus" });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.kind, "nessus");
    assert.equal(parsed.artifactType, "nessus");
    const app = parsed.rows.find((row) => row.hostName === "fx-app-1");
    assert.equal(app.pluginId, "999001");
    assert.equal(app.severity, "medium");
    assert.equal(app.status, "open");
    assert.equal(app.stigFamily, "");

    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    savePackage(file, migratePackage(fixturePkg()));
    const preview = previewIngestAgainstPackage(
      file,
      { buffer: Buffer.from(fixtureNessus()), filename: "fixture.nessus" },
      { audit: false },
    );
    assert.equal(preview.ok, true);
    assert.equal(preview.mode, "parse");
    const matched = preview.items.find((item) => item.incoming.pluginId === "999001");
    assert.equal(matched.status, "add");
    assert.equal(matched.incoming.assetId, "sldss-hw-app-1");
    assert.equal(matched.incoming.unmatchedHost, "");
  });
});

describe("F5 parse .cklb and match hostname", () => {
  it("parses a fictional .cklb and matches the jump host as Windows Server", () => {
    const parsed = parseIngestBuffer(Buffer.from(fixtureCklb()), { filename: "fixture.cklb" });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.kind, "cklb");
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0].pluginId, "SV-FIX-0001");
    assert.equal(parsed.rows[0].status, "open");
    assert.equal(parsed.rows[1].status, "not-a-finding");
    assert.equal(parsed.rows[0].stigFamily, "windows-server");

    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const pkg = migratePackage(fixturePkg());
    savePackage(file, pkg);
    const preview = previewIngestAgainstPackage(
      file,
      { buffer: Buffer.from(fixtureCklb()), filename: "fixture.cklb", artifactType: "cklb" },
      { audit: false },
    );
    assert.equal(preview.ok, true);
    const open = preview.items.find((item) => item.incoming.pluginId === "SV-FIX-0001");
    assert.equal(open.status, "add");
    assert.equal(open.incoming.assetId, "sldss-hw-jump-1");
    const jump = pkg.assets.find((row) => row.id === "sldss-hw-jump-1");
    assert.equal(jump.assetType, "Server");
    assert.equal(jump.osFirmware, "Windows Server");
    assert.equal(/workstation/i.test(jump.assetType), false);
  });
});

describe("F5 F5-named host is not added to assets", () => {
  it("flags inherited/GSS F5 and does not apply it to the SLDSS hardware list", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    const before = migratePackage(fixturePkg());
    const assetCount = before.assets.length;
    savePackage(file, before);
    const preview = previewIngestAgainstPackage(
      file,
      { buffer: Buffer.from(fixtureNessus()), filename: "fixture.nessus" },
      { audit: false },
    );
    const f5 = preview.items.find((item) => item.incoming.hostName === "fx-f5-gss");
    assert.equal(f5.status, "conflict");
    assert.match(f5.reason, /inherited-gss/);
    const applied = applyIngest(
      file,
      evidenceDir,
      { buffer: Buffer.from(fixtureNessus()), filename: "fixture.nessus" },
      { audit: false },
    );
    assert.equal(applied.ok, true);
    assert.equal(applied.package.assets.length, assetCount);
    assert.equal(applied.package.assets.some((row) => /f5/i.test(JSON.stringify(row))), false);
    assert.equal(applied.package.scanFindings.some((row) => row.hostName === "fx-f5-gss"), false);
    assert.equal(applied.package.cmmcInScope, false);
  });
});

describe("F5 classified marking is rejected", () => {
  it("rejects PARSE when metadata indicates SECRET and does not ingest findings", () => {
    assert.equal(hasClassifiedMarking("UNCLASSIFIED"), false);
    assert.equal(hasClassifiedMarking(""), false);
    const parsed = parseIngestBuffer(Buffer.from(classifiedNessus()), { filename: "secret.nessus" });
    assert.equal(parsed.ok, false);
    assert.equal(parsed.errorClass, "ClassifiedIngestRejected");
    assert.deepEqual(parsed.rows, []);
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    savePackage(file, migratePackage(fixturePkg()));
    const preview = previewIngestAgainstPackage(
      file,
      { buffer: Buffer.from(classifiedNessus()), filename: "secret.nessus" },
      { audit: false },
    );
    assert.equal(preview.ok, false);
    assert.equal(preview.errorClass, "ClassifiedIngestRejected");
    const applied = applyIngest(
      file,
      path.join(dir, "evidence"),
      { buffer: Buffer.from(classifiedNessus()), filename: "secret.nessus" },
      { audit: false },
    );
    assert.equal(applied.ok, false);
    assert.equal(applied.errorClass, "ClassifiedIngestRejected");
    const after = loadPackage(file, { audit: false }).package;
    const migrated = migratePackage(after);
    assert.deepEqual(migrated.scanFindings, []);
    assert.equal(migrated.intake.classification || "", "");
  });
});

describe("F5 unmatched host is a preview conflict", () => {
  it("does not silently add unmatched hosts as assets", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, migratePackage(fixturePkg()));
    const preview = previewIngestAgainstPackage(
      file,
      { buffer: Buffer.from(fixtureNessus()), filename: "fixture.nessus" },
      { audit: false },
    );
    const unmatched = preview.items.find((item) => item.incoming.hostName === "fx-unknown");
    assert.equal(unmatched.status, "conflict");
    assert.equal(unmatched.reason, "unmatched-host");
    const applied = applyIngest(
      file,
      evidenceDir,
      { buffer: Buffer.from(fixtureNessus()), filename: "fixture.nessus" },
      { audit: false },
    );
    assert.equal(applied.ok, true);
    assert.equal(applied.package.assets.some((row) => row.hostName === "fx-unknown"), false);
    assert.equal(applied.package.scanFindings.some((row) => row.hostName === "fx-unknown"), false);
  });
});

describe("F5 apply stores encrypted original and findings; no auto-Satisfied", () => {
  it("writes mode parse artifact, encrypts original bytes, leaves controls and postgres host STIG alone", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, migratePackage(fixturePkg()));
    const applied = applyIngest(
      file,
      evidenceDir,
      { buffer: Buffer.from(fixtureNessus()), filename: "fixture.nessus", artifactType: "nessus" },
      { audit: false },
    );
    assert.equal(applied.ok, true);
    assert.equal(applied.mode, "parse");
    assert.equal(applied.artifact.artifactType, "nessus");
    assert.equal(applied.artifact.mode, "parse");
    const storedPath = path.join(evidenceDir, applied.storedName);
    const raw = fs.readFileSync(storedPath);
    assert.equal(isEncryptedBuffer(raw), true);
    const loadedBytes = loadPossiblyEncryptedBytes(storedPath);
    assert.equal(loadedBytes.ok, true);
    assert.equal(loadedBytes.buffer.toString("utf8").includes("NessusClientData"), true);
    const appFinding = applied.package.scanFindings.find((row) => row.pluginId === "999001");
    assert.equal(appFinding.assetId, "sldss-hw-app-1");
    const jumpFinding = applied.package.scanFindings.find((row) => row.pluginId === "999010");
    assert.equal(jumpFinding.assetId, "sldss-hw-jump-1");
    assert.equal(jumpFinding.stigFamily, "windows-server");
    const dbFinding = applied.package.scanFindings.find((row) => row.pluginId === "999020");
    assert.equal(dbFinding.assetId, "sldss-hw-db-1");
    assert.equal(dbFinding.stigFamily, "");
    assert.equal(stigFamilyFor(applied.package, "asset", "sldss-hw-db-1"), "");
    assert.equal(applied.package.controls["AC-1"].assessment, "in-progress");
    assert.notEqual(applied.package.controls["AC-1"].assessment, "satisfied");
    assert.equal(applied.package.poams.length, 0);
    const jump = applied.package.assets.find((row) => row.id === "sldss-hw-jump-1");
    assert.equal(jump.assetType, "Server");
    assert.equal(jump.osFirmware, "Windows Server");
  });
});

describe("F5 schema migrate", () => {
  it("loads missing scanFindings as [] without sample-seeding or flipping assessment", () => {
    const old = fixturePkg();
    assert.equal(Object.hasOwn(old, "scanFindings"), false);
    const migrated = migratePackage(old);
    assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
    assert.equal(SCHEMA_VERSION, 5);
    assert.deepEqual(migrated.scanFindings, []);
    assert.equal(migrated.controls["AC-1"].notes, "keep-me-f5");
    assert.equal(migrated.controls["AC-1"].assessment, "in-progress");
    assert.equal(migrated.cmmcInScope, false);

    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    savePackage(file, old);
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, true);
    const hydrated = migratePackage(loaded.package);
    assert.equal(hydrateNeedsPersist(loaded.package, hydrated), true);
    const result = getHydratedPackage(file);
    assert.equal(result.ok, true);
    assert.deepEqual(result.package.scanFindings, []);
    assert.equal(result.package.controls["AC-1"].assessment, "in-progress");
    const after = loadPackage(file, { audit: false }).package;
    assert.deepEqual(after.scanFindings, []);
  });
});

describe("F5 STORE-only still works; .ckl XML stays rejected", () => {
  it("stores nessus as STORE-only and rejects .ckl PARSE", () => {
    const ckl = parseIngestBuffer(Buffer.from("<CHECKLIST/>"), { filename: "old.ckl" });
    assert.equal(ckl.ok, false);
    assert.equal(ckl.errorClass, "UnsupportedIngestType");
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, migratePackage(fixturePkg()));
    const stored = storeTaggedArtifact(
      file,
      evidenceDir,
      { buffer: Buffer.from(fixtureNessus()), filename: "fixture.nessus", artifactType: "nessus" },
      { audit: false },
    );
    assert.equal(stored.ok, true);
    assert.equal(stored.artifact.mode, "store-only");
    assert.deepEqual(stored.package.scanFindings, []);
  });
});

describe("F5 missing classification still parses", () => {
  it("treats absent marking as CUI-adjacent and does not label the package classified", () => {
    const xml = `<?xml version="1.0"?><NessusClientData_v2><Report name="lab"><ReportHost name="fx-app-1"><ReportItem pluginID="1" pluginName="x" severity="0"></ReportItem></ReportHost></Report></NessusClientData_v2>`;
    const parsed = parseIngestBuffer(Buffer.from(xml), { filename: "plain.nessus" });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.rows[0].status, "informational");
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    savePackage(file, migratePackage(fixturePkg()));
    const applied = applyIngest(
      file,
      path.join(dir, "evidence"),
      { buffer: Buffer.from(xml), filename: "plain.nessus" },
      { audit: false },
    );
    assert.equal(applied.ok, true);
    assert.equal(applied.package.intake.classification || "", "");
    assert.equal(applied.package.cmmcInScope, false);
  });
});

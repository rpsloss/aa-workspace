import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isEncryptedBuffer, loadPackage, savePackage } from "../server/packageStore.mjs";
import { applyIngest, previewIngestAgainstPackage, storeTaggedArtifact } from "../server/ingestApi.mjs";
import { emitWorkingPapers } from "../server/emitApi.mjs";
import { parseIngestBuffer } from "../src/lib/ingest/parse.mjs";
import { previewMerge } from "../src/lib/ingest/merge.mjs";
import { sspBoundaryMarkdown, TBD } from "../src/lib/boundary.mjs";
import { migratePackage } from "../src/lib/inheritance.mjs";
import { POAM_CSV_COLUMNS, poamCsv, TBD_EMASS } from "../src/lib/poamCsv.mjs";
import { ppsmHeaders } from "../src/lib/ingest/ppsm.mjs";
import { unzipNames, unzipFile } from "../src/lib/zipMemory.mjs";

const temps = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-ingest-rest-"));
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

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
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
      "AC-1": { controlId: "AC-1", selection: "in-scope", notes: "keep-ac1", inheritanceSourceId: "" },
      "AC-2": { controlId: "AC-2", selection: "in-scope", notes: "keep-ac2", inheritanceSourceId: "" },
    },
    policies: [],
    evidence: [],
    poams: [
      {
        id: "p1",
        emassPoamId: TBD_EMASS,
        controlId: "AC-1",
        weakness: "Fixture review gap",
        description: "",
        source: "Self-assessment",
        status: "open",
        risk: "Low",
        residualRisk: "Low",
        resources: "",
        scheduledCompletion: "",
        milestones: "",
        poc: "",
        comments: "",
        atoBlocker: false,
      },
      {
        id: "p-extra",
        emassPoamId: TBD_EMASS,
        controlId: "AC-2",
        weakness: "Keep extra fixture row",
        description: "stays on merge",
        source: "Self-assessment",
        status: "open",
        risk: "Low",
        residualRisk: "Low",
        resources: "",
        scheduledCompletion: "",
        milestones: "",
        poc: "",
        comments: "",
        atoBlocker: false,
      },
    ],
    ssp: { purpose: "keep ssp fixture" },
    assets: [],
    software: [],
    boundary: { inbound: [], outbound: [], interconnect: [] },
    dataFlows: [],
    boundaryDiagramEvidenceId: "",
    inheritanceSources: [],
    artifacts: [],
    ...overrides,
  };
}

function poamCsvBuffer(rows) {
  const lines = [POAM_CSV_COLUMNS.join(",")];
  for (const row of rows) {
    const map = {
      eMASS_POAM_ID: row.emassPoamId ?? "",
      Control: row.controlId ?? "",
      Weakness: row.weakness ?? "",
      Description: row.description ?? "",
      Source: row.source ?? "",
      Status: row.status ?? "",
      Risk: row.risk ?? "",
      Residual_Risk: row.residualRisk ?? "",
      Resources: row.resources ?? "",
      Scheduled_Completion: row.scheduledCompletion ?? "",
      Milestones: row.milestones ?? "",
      POC: row.poc ?? "",
      ATO_Blocker: row.atoBlocker ?? "",
      Comments: row.comments ?? "",
    };
    lines.push(POAM_CSV_COLUMNS.map((h) => csvEscape(map[h] ?? "")).join(","));
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

function ppsmCsvBuffer(rows) {
  const headers = ppsmHeaders();
  const lines = [headers.join(",")];
  for (const row of rows) {
    const map = {
      Source: row.source ?? "",
      Destination: row.destination ?? "",
      Protocol: row.protocol ?? "",
      Port: row.port ?? "",
      Description: row.description ?? "",
    };
    lines.push(headers.map((h) => csvEscape(map[h] ?? "")).join(","));
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

const FICTIONAL_POAM_ROWS = [
  {
    emassPoamId: "",
    controlId: "AC-1",
    weakness: "Fixture review gap",
    description: "Filled from fixture csv",
    source: "Self-assessment",
    status: "open",
    risk: "Low",
    residualRisk: "Low",
    resources: "",
    scheduledCompletion: "",
    milestones: "",
    poc: "Fixture ISSO",
    atoBlocker: "N",
    comments: "",
  },
  {
    emassPoamId: "",
    controlId: "ZZ-99",
    weakness: "Unknown control must skip",
    description: "must not mint",
    source: "Self-assessment",
    status: "open",
    risk: "Low",
    residualRisk: "Low",
    atoBlocker: "N",
  },
  {
    emassPoamId: "EM-FIX-7",
    controlId: "AC-1",
    weakness: "New fixture weakness",
    description: "pasted id kept",
    source: "Self-assessment",
    status: "open",
    risk: "Moderate",
    residualRisk: "Low",
    atoBlocker: "N",
  },
];

describe("POA&M CSV columns stay the existing set", () => {
  it("does not add Weakness Identifier / Raw Risk / Mitigations / Security Checks", () => {
    assert.deepEqual([...POAM_CSV_COLUMNS], [
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
    const csv = poamCsv(fixturePkg());
    assert.equal(csv.includes("Weakness Identifier"), false);
    assert.equal(csv.includes("Raw Risk"), false);
    assert.equal(csv.includes("Mitigations"), false);
    assert.equal(csv.includes("Security Checks"), false);
  });
});

describe("POA&M parse and merge preview", () => {
  it("parses fictional CSV, fills empty fields, and leaves TBD-eMASS when blank", () => {
    const buf = poamCsvBuffer(FICTIONAL_POAM_ROWS);
    const parsed = parseIngestBuffer(buf, { filename: "fixture-poam.csv" });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.kind, "poam");
    assert.equal(parsed.artifactType, "poam");
    assert.equal(parsed.rows[0].emassPoamId, TBD_EMASS);
    assert.equal(parsed.rows[0].controlId, "AC-1");
    assert.equal(parsed.rows[2].emassPoamId, "EM-FIX-7");

    const existing = fixturePkg().poams;
    const preview = previewMerge("poam", existing, parsed.rows, { catalogIds: ["AC-1", "AC-2"] });
    assert.equal(preview.items[0].status, "update");
    assert.equal(preview.items[0].proposed.description, "Filled from fixture csv");
    assert.equal(existing[0].description, "");
    assert.equal(preview.items[1].status, "conflict");
    assert.equal(preview.items[1].reason, "unknown-control");
    assert.equal(preview.items[2].status, "add");
    assert.equal(preview.counts.update, 1);
    assert.equal(preview.counts.conflict, 1);
    assert.equal(preview.counts.add, 1);
  });
});

describe("POA&M apply through encrypted store", () => {
  it("skips unknown control IDs, does not mint controls, keeps extra rows, stores original", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, fixturePkg());
    const csv = poamCsvBuffer(FICTIONAL_POAM_ROWS);
    const preview = previewIngestAgainstPackage(
      file,
      { buffer: csv, filename: "fixture-poam.csv", artifactType: "poam" },
      { audit: false },
    );
    assert.equal(preview.ok, true);
    assert.equal(preview.mode, "parse");
    assert.equal(preview.kind, "poam");
    assert.ok(preview.items.some((item) => item.reason === "unknown-control"));

    const applied = applyIngest(
      file,
      evidenceDir,
      { buffer: csv, filename: "fixture-poam.csv", artifactType: "poam", strategy: "merge" },
      { audit: false },
    );
    assert.equal(applied.ok, true);
    assert.equal(applied.applied.added, 1);
    assert.equal(applied.applied.updated, 1);
    assert.ok(applied.applied.skipped >= 1);
    const poams = applied.package.poams;
    const weaknesses = poams.map((row) => row.weakness);
    assert.ok(weaknesses.includes("Fixture review gap"));
    assert.ok(weaknesses.includes("Keep extra fixture row"));
    assert.ok(weaknesses.includes("New fixture weakness"));
    assert.equal(weaknesses.includes("Unknown control must skip"), false);
    const updated = poams.find((row) => row.id === "p1");
    assert.equal(updated.description, "Filled from fixture csv");
    assert.equal(updated.emassPoamId, TBD_EMASS);
    const added = poams.find((row) => row.weakness === "New fixture weakness");
    assert.equal(added.emassPoamId, "EM-FIX-7");
    assert.deepEqual(Object.keys(applied.package.controls).sort(), ["AC-1", "AC-2"]);
    assert.equal(Object.hasOwn(applied.package.controls, "ZZ-99"), false);
    assert.equal(applied.package.cmmcInScope, false);
    assert.equal(applied.package.artifacts[0].artifactType, "poam");
    assert.equal(applied.package.artifacts[0].mode, "parse");
    const original = fs.readFileSync(path.join(evidenceDir, applied.storedName));
    assert.equal(isEncryptedBuffer(original), true);
    assert.equal(original.includes(Buffer.from("Unknown control must skip")), false);
    const onDisk = fs.readFileSync(file);
    assert.equal(isEncryptedBuffer(onDisk), true);

    const confirmed = applyIngest(
      file,
      evidenceDir,
      {
        buffer: csv,
        filename: "fixture-poam.csv",
        artifactType: "poam",
        strategy: "merge",
        confirmConflicts: true,
      },
      { audit: false },
    );
    assert.equal(confirmed.ok, true);
    assert.equal(Object.hasOwn(confirmed.package.controls, "ZZ-99"), false);
    assert.equal(confirmed.package.poams.some((row) => row.controlId === "ZZ-99"), false);
  });
});

describe("STORE-only attach stays encrypted with a new id", () => {
  it("does not parse SSP narrative and does not overwrite another artifact id", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, fixturePkg());
    const first = storeTaggedArtifact(
      file,
      evidenceDir,
      { buffer: Buffer.from("# fixture ssp\ndo not parse\n", "utf8"), filename: "ssp.md", artifactType: "ssp" },
      { audit: false },
    );
    const second = storeTaggedArtifact(
      file,
      evidenceDir,
      { buffer: Buffer.from("fixture letter", "utf8"), filename: "letter.txt", artifactType: "letter" },
      { audit: false },
    );
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.notEqual(first.artifact.id, second.artifact.id);
    assert.equal(first.artifact.mode, "store-only");
    assert.equal(second.artifact.mode, "store-only");
    assert.equal(second.package.artifacts.length, 2);
    assert.equal(second.package.ssp.purpose, "keep ssp fixture");
    assert.equal(isEncryptedBuffer(fs.readFileSync(path.join(evidenceDir, first.storedName))), true);
    assert.equal(isEncryptedBuffer(fs.readFileSync(path.join(evidenceDir, second.storedName))), true);
    assert.equal(fs.readFileSync(path.join(evidenceDir, first.storedName)).includes(Buffer.from("do not parse")), false);
  });
});

describe("PPSM CSV maps to dataFlows without inventing rows", () => {
  it("empty file leaves inbound/outbound/dataFlows TBD", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, fixturePkg());
    const empty = ppsmCsvBuffer([]);
    const parsed = parseIngestBuffer(empty, { filename: "ppsm.csv", artifactType: "ppsm" });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.kind, "ppsm");
    assert.equal(parsed.rows.length, 0);
    const applied = applyIngest(
      file,
      evidenceDir,
      { buffer: empty, filename: "ppsm.csv", artifactType: "ppsm", strategy: "merge" },
      { audit: false },
    );
    assert.equal(applied.ok, true);
    assert.deepEqual(applied.package.dataFlows, []);
    assert.deepEqual(applied.package.boundary.inbound, []);
    assert.deepEqual(applied.package.boundary.outbound, []);
    const tables = sspBoundaryMarkdown(applied.package);
    assert.equal(tables.inbound, TBD);
    assert.equal(tables.outbound, TBD);
    assert.equal(tables.dataFlows, TBD);
    const blob = JSON.stringify(applied.package);
    assert.equal(blob.includes("SAMPLE-ICAM"), false);
    assert.equal(/WSUS/.test(blob), false);
    assert.equal(/GCCS/.test(blob), false);
  });

  it("rows map Source/Destination/Protocol/Port from the file onto dataFlows only", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, fixturePkg());
    const csv = ppsmCsvBuffer([
      {
        source: "app-tier",
        destination: "db-tier",
        protocol: "TCP",
        port: "5432",
        description: "Fixture db flow",
      },
    ]);
    const applied = applyIngest(
      file,
      evidenceDir,
      { buffer: csv, filename: "ppsm.csv", artifactType: "ppsm", strategy: "merge" },
      { audit: false },
    );
    assert.equal(applied.ok, true);
    assert.equal(applied.package.dataFlows.length, 1);
    const flow = applied.package.dataFlows[0];
    assert.equal(flow.source, "app-tier");
    assert.equal(flow.destination, "db-tier");
    assert.equal(flow.protocol, "TCP");
    assert.equal(flow.port, "5432");
    assert.equal(flow.name, "Fixture db flow");
    assert.equal(flow.description, "Fixture db flow");
    assert.equal(flow.name.includes("TCP"), false);
    assert.equal(flow.name.includes("5432"), false);
    assert.deepEqual(applied.package.boundary.inbound, []);
    assert.deepEqual(applied.package.boundary.outbound, []);
    assert.equal(applied.package.artifacts[0].artifactType, "ppsm");
    assert.equal(applied.package.artifacts[0].mode, "parse");
    const blob = JSON.stringify(applied.package);
    assert.equal(blob.includes("ICAM"), false);
    assert.equal(blob.includes("SIEM"), false);
    assert.equal(blob.includes("WSUS"), false);
    assert.equal(blob.includes("GCCS"), false);

    const noDesc = parseIngestBuffer(
      ppsmCsvBuffer([{ source: "web", destination: "api", protocol: "TCP", port: "443", description: "" }]),
      { filename: "ppsm.csv", artifactType: "ppsm" },
    );
    assert.equal(noDesc.ok, true);
    assert.equal(noDesc.rows[0].name, "web→api");
    assert.equal(noDesc.rows[0].protocol, "TCP");
    assert.equal(noDesc.rows[0].port, "443");
    assert.equal(noDesc.rows[0].name.includes("443"), false);
  });
});

describe("PPSM name is a human label; old dataFlows without protocol/port still load", () => {
  it("omits protocol/port concatenation and hydrates missing fields as empty string", () => {
    const migrated = migratePackage({
      schemaVersion: 3,
      framework: "DoD RMF",
      catalog: "NIST SP 800-53 Revision 5",
      systemOfRecord: "eMASS",
      cmmcInScope: false,
      controls: { "AC-1": { controlId: "AC-1", selection: "in-scope" } },
      dataFlows: [{ id: "f1", name: "legacy flow", source: "src", destination: "dst", description: "old", notes: "" }],
    });
    assert.equal(migrated.dataFlows[0].name, "legacy flow");
    assert.equal(migrated.dataFlows[0].source, "src");
    assert.equal(migrated.dataFlows[0].protocol, "");
    assert.equal(migrated.dataFlows[0].port, "");
  });
});

describe("POA&M STORE-only attach", () => {
  it("stores encrypted original when parse is not used", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, fixturePkg());
    const bytes = Buffer.from("not-a-real-poam-export", "utf8");
    const stored = storeTaggedArtifact(
      file,
      evidenceDir,
      { buffer: bytes, filename: "fixture-poam.pdf", artifactType: "poam" },
      { audit: false },
    );
    assert.equal(stored.ok, true);
    assert.equal(stored.artifact.artifactType, "poam");
    assert.equal(stored.artifact.mode, "store-only");
    assert.equal(stored.package.poams.length, fixturePkg().poams.length);
    assert.equal(stored.package.poams[0].weakness, "Fixture review gap");
    assert.equal(isEncryptedBuffer(fs.readFileSync(path.join(evidenceDir, stored.storedName))), true);
    assert.equal(fs.readFileSync(path.join(evidenceDir, stored.storedName)).includes(Buffer.from("not-a-real-poam-export")), false);
  });

  it("parse success still stores the encrypted original; parse fail still allows STORE-only", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, fixturePkg());
    const csv = poamCsvBuffer([
      {
        emassPoamId: "",
        controlId: "AC-1",
        weakness: "Fixture review gap",
        description: "Filled from fixture csv",
        source: "Self-assessment",
        status: "open",
        risk: "Low",
        residualRisk: "Low",
        atoBlocker: "N",
      },
    ]);
    const applied = applyIngest(
      file,
      evidenceDir,
      { buffer: csv, filename: "fixture-poam.csv", artifactType: "poam", strategy: "merge" },
      { audit: false },
    );
    assert.equal(applied.ok, true);
    assert.equal(applied.mode, "parse");
    assert.equal(applied.package.artifacts[0].mode, "parse");
    assert.equal(applied.package.artifacts[0].artifactType, "poam");
    assert.equal(isEncryptedBuffer(fs.readFileSync(path.join(evidenceDir, applied.storedName))), true);

    const failed = applyIngest(
      file,
      evidenceDir,
      { buffer: Buffer.from("this is not tabular poam"), filename: "broken-poam.bin", artifactType: "poam" },
      { audit: false },
    );
    assert.equal(failed.ok, true);
    assert.equal(failed.artifact.mode, "store-only");
    assert.equal(failed.artifact.artifactType, "poam");
    assert.notEqual(failed.artifact.id, applied.package.artifacts[0].id);
    assert.equal(isEncryptedBuffer(fs.readFileSync(path.join(evidenceDir, failed.storedName))), true);
  });
});

describe("F8 zip still works after this ingest pass", () => {
  it("emits working-papers zip with ingested POA&M original and TBD inbound", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    savePackage(file, fixturePkg());
    const csv = poamCsvBuffer([
      {
        emassPoamId: "",
        controlId: "AC-1",
        weakness: "Fixture review gap",
        description: "Filled from fixture csv",
        source: "Self-assessment",
        status: "open",
        risk: "Low",
        residualRisk: "Low",
        atoBlocker: "N",
      },
    ]);
    const applied = applyIngest(
      file,
      evidenceDir,
      { buffer: csv, filename: "fixture-poam.csv", artifactType: "poam", strategy: "merge" },
      { audit: false },
    );
    assert.equal(applied.ok, true);
    const emitted = emitWorkingPapers(file, evidenceDir, { audit: false });
    assert.equal(emitted.ok, true);
    const names = unzipNames(emitted.buffer);
    assert.ok(names.includes("FX-POAM.csv"));
    assert.ok(names.includes("FX-SSP.md"));
    assert.ok(names.includes("completeness-checklist.md"));
    assert.ok(names.some((name) => name.startsWith("originals/")));
    const poamOut = unzipFile(emitted.buffer, "FX-POAM.csv").toString("utf8");
    assert.match(poamOut, /Fixture review gap/);
    assert.equal(poamOut.includes("Weakness Identifier"), false);
    const checklist = unzipFile(emitted.buffer, "completeness-checklist.md").toString("utf8");
    assert.match(checklist, /inbound: TBD/);
    assert.match(checklist, /outbound: TBD/);
    assert.match(checklist, /dataFlows: TBD/);
    const loaded = loadPackage(file, { audit: false });
    assert.equal(loaded.package.cmmcInScope, false);
  });
});

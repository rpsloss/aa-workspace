import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isEncryptedBuffer, loadPackage, saveEncryptedBytes, savePackage } from "../server/packageStore.mjs";
import { getHydratedPackage } from "../server/packageApi.mjs";
import { emitWorkingPapers } from "../server/emitApi.mjs";
import { readAuditLines } from "../server/audit.mjs";
import { mappingHeaders } from "../src/lib/ingest/parse.mjs";
import { seedSldssBoundary, seedSldssDataFlows, TBD, sspBoundaryMarkdown } from "../src/lib/boundary.mjs";
import { sspMarkdown } from "../src/lib/sspMarkdown.mjs";
import { seedSldssAssets, hardwareCsv, softwareCsv } from "../src/lib/inventory.mjs";
import { POAM_CSV_COLUMNS, poamCsv } from "../src/lib/poamCsv.mjs";
import {
  ARTIFACT_INDEX_COLUMNS,
  artifactIndexCsv,
  buildEmitFiles,
  completenessChecklist,
  emitZipFilename,
  jointCsv,
} from "../src/lib/emit.mjs";
import { draftPoamFromOpenFinding } from "../src/lib/scanPoamSeed.mjs";
import { unzipFile, unzipNames } from "../src/lib/zipMemory.mjs";

const temps = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-f8-"));
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
      "AC-1": { controlId: "AC-1", selection: "in-scope", notes: "keep-me-f8", inheritanceSourceId: "" },
      "PE-2": { controlId: "PE-2", selection: "inherited", notes: "keep-pe", inheritanceSourceId: "" },
    },
    policies: [],
    evidence: [],
    poams: [
      {
        id: "poam-001",
        emassPoamId: "TBD-eMASS",
        controlId: "AU-6(3)",
        weakness: "keep weakness",
        description: "keep desc",
        source: "Self-assessment",
        status: "open",
        risk: "Moderate",
        residualRisk: "Low",
        resources: "",
        scheduledCompletion: "",
        milestones: "",
        poc: "",
        comments: "",
        atoBlocker: false,
      },
    ],
    ssp: { purpose: "keep ssp", authorizationBoundary: "lab" },
    assets: seedSldssAssets().slice(0, 2),
    software: [{ id: "s1", name: "Keep SW", vendor: "Acme", version: "1.0", license: "", relatedAsset: "Keep Asset" }],
    boundary: seedSldssBoundary(),
    dataFlows: seedSldssDataFlows(),
    boundaryDiagramEvidenceId: "",
    inheritanceSources: [],
    artifacts: [],
    ...overrides,
  };
}

describe("F8 zip contents", () => {
  it("contains SSP, POA&M CSV, HW/SW CSV, artifact index, checklist; omits package.json and controls CSV", () => {
    const pkg = fixturePkg();
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    fs.mkdirSync(evidenceDir);
    savePackage(file, pkg, { audit: false });
    const emitted = emitWorkingPapers(file, evidenceDir, { audit: false });
    assert.equal(emitted.ok, true);
    assert.equal(emitted.filename, "FX-emass-working-papers.zip");
    const names = unzipNames(emitted.buffer);
    assert.ok(names.includes("FX-SSP.md"));
    assert.ok(names.includes("FX-POAM.csv"));
    assert.ok(names.includes("FX-hardware.csv"));
    assert.ok(names.includes("FX-software.csv"));
    assert.ok(names.includes("artifact-index.csv"));
    assert.ok(names.includes("completeness-checklist.md"));
    assert.equal(names.some((n) => n.toLowerCase().includes("package.json")), false);
    assert.equal(names.some((n) => n.toLowerCase().includes("controls.csv")), false);
    assert.equal(names.some((n) => /poam\.json$/i.test(n)), false);
    assert.equal(names.some((n) => /role/i.test(n)), false);
  });

  it("falls back to sldss-emass-working-papers.zip when acronym is missing", () => {
    const pkg = fixturePkg({ intake: { systemName: "No Acronym", acronym: "" } });
    assert.equal(emitZipFilename(pkg), "sldss-emass-working-papers.zip");
    const files = buildEmitFiles(pkg);
    assert.ok(files.some((row) => row.name === "sldss-SSP.md"));
  });
});

describe("F8 HW/SW CSV from mapping", () => {
  it("uses Joint mapping headers with no Role column and no workspace id", () => {
    const pkg = fixturePkg();
    const hw = jointCsv("hardware", pkg.assets);
    const sw = jointCsv("software", pkg.software);
    const hwHeaders = hw.split("\n")[0].split(",");
    const swHeaders = sw.split("\n")[0].split(",");
    assert.deepEqual(hwHeaders, mappingHeaders("hardware"));
    assert.deepEqual(swHeaders, mappingHeaders("software"));
    assert.equal(hwHeaders.includes("Role"), false);
    assert.equal(hwHeaders.includes("id"), false);
    assert.equal(swHeaders.includes("id"), false);
    assert.equal(hw.split("\n")[0].toLowerCase().includes("role"), false);
    assert.equal(hw, hardwareCsv(pkg.assets));
    assert.equal(sw, softwareCsv(pkg.software));
  });
});

describe("F8 POA&M CSV columns", () => {
  it("uses existing columns only", () => {
    const csv = poamCsv(fixturePkg());
    const header = csv.split("\n")[0];
    assert.equal(
      header,
      "eMASS_POAM_ID,Control,Weakness,Description,Source,Status,Risk,Residual_Risk,Resources,Scheduled_Completion,Milestones,POC,ATO_Blocker,Comments",
    );
    assert.deepEqual(header.split(","), [...POAM_CSV_COLUMNS]);
    assert.equal(header.includes("Weakness Identifier"), false);
    assert.equal(header.includes("Raw Risk"), false);
    assert.equal(header.includes("Mitigations"), false);
    assert.equal(header.includes("Security Checks"), false);
    assert.match(csv, /TBD-eMASS/);
  });
});

describe("F8 empty tables still TBD in SSP", () => {
  it("inbound outbound dataFlows stay TBD in the zip SSP", () => {
    const pkg = fixturePkg();
    const tables = sspBoundaryMarkdown(pkg);
    assert.equal(tables.inbound, TBD);
    assert.equal(tables.outbound, TBD);
    assert.equal(tables.dataFlows, TBD);
    const md = sspMarkdown(pkg);
    assert.match(md, /### Inbound\nTBD/);
    assert.match(md, /### Outbound\nTBD/);
    assert.match(md, /### Data flows\nTBD/);
    const files = buildEmitFiles(pkg);
    const ssp = files.find((row) => row.name.endsWith("-SSP.md"));
    const text = ssp.data.toString("utf8");
    assert.match(text, /### Inbound\nTBD/);
    assert.match(text, /### Outbound\nTBD/);
    assert.match(text, /### Data flows\nTBD/);
  });
});

describe("F8 completeness checklist", () => {
  it("reports present vs TBD for the locked items and does not invent AO/POA&M language", () => {
    const pkg = fixturePkg({
      artifacts: [
        {
          id: "art-1",
          artifactType: "diagram",
          originalName: "boundary.png",
          storedName: "",
          mode: "store-only",
          taggedAt: "2026-08-28T00:00:00.000Z",
          notes: "",
        },
      ],
    });
    const md = completenessChecklist(pkg, { originals: new Map() });
    assert.match(md, /inbound: TBD \(empty inbound\)/);
    assert.match(md, /outbound: TBD \(empty outbound\)/);
    assert.match(md, /dataFlows: TBD \(empty dataFlows\)/);
    assert.match(md, /Host Name: TBD/);
    assert.match(md, /IP Address: TBD/);
    assert.match(md, /MAC Address: TBD/);
    assert.match(md, /boundary diagram file: TBD \(missing boundary diagram file\)/);
    assert.match(md, /inherited\/hybrid without source: TBD/);
    assert.match(md, /emassPoamId: TBD \(1 of 1 emassPoamId TBD-eMASS\)/);
    assert.match(md, /tagged original: TBD \(1 tagged original missing\)/);
    assert.match(md, /Not an AO or SCA decision/);
    assert.equal(md.includes("Weakness Identifier"), false);
    const index = artifactIndexCsv(pkg.artifacts);
    assert.equal(index.split("\n")[0], ARTIFACT_INDEX_COLUMNS.join(","));
    assert.match(index, /diagram,boundary\.png,,store-only,/);
    assert.equal(index.includes("keep weakness"), false);
  });

  it("flags a seed row with blank Control as TBD missing control; a row with Control is not flagged", () => {
    const draft = draftPoamFromOpenFinding({
      status: "open",
      title: "Fixture open rule",
      pluginId: "SV-FIX-0001",
      sourceType: "cklb",
    });
    assert.equal(draft.controlId, "");
    const blankMd = completenessChecklist({ ...fixturePkg(), poams: [draft] });
    assert.match(blankMd, /Control: TBD \(1 of 1 missing control, not ready for eMASS paste\)/);
    assert.match(blankMd, /not ready for eMASS paste/);
    assert.equal(blankMd.includes("Weakness Identifier"), false);

    const filledMd = completenessChecklist(fixturePkg());
    assert.match(filledMd, /Control: present \(POA&M Control filled\)/);
    assert.equal(filledMd.includes("missing control"), false);
    assert.equal(filledMd.includes("not ready for eMASS paste"), false);

    const mixedMd = completenessChecklist({
      ...fixturePkg(),
      poams: [draft, fixturePkg().poams[0]],
    });
    assert.match(mixedMd, /Control: TBD \(1 of 2 missing control, not ready for eMASS paste\)/);
  });
});

describe("F8 stored originals stay ciphertext on disk", () => {
  it("decrypts tagged artifacts into zip buffers only and omits empty slots", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    fs.mkdirSync(evidenceDir);
    const marker = Buffer.from("keep-me-f8-original-bytes");
    saveEncryptedBytes(path.join(evidenceDir, "tagged.bin"), marker);
    const pkg = fixturePkg({
      artifacts: [
        {
          id: "art-ok",
          artifactType: "policy",
          originalName: "policy.md",
          storedName: "tagged.bin",
          mode: "store-only",
          taggedAt: "2026-08-28T00:00:00.000Z",
          notes: "",
        },
        {
          id: "art-empty",
          artifactType: "letter",
          originalName: "empty-letter.pdf",
          storedName: "",
          mode: "store-only",
          taggedAt: "2026-08-28T00:00:00.000Z",
          notes: "",
        },
        {
          id: "art-miss",
          artifactType: "ssp",
          originalName: "missing-ssp.md",
          storedName: "no-such.bin",
          mode: "store-only",
          taggedAt: "2026-08-28T00:00:00.000Z",
          notes: "",
        },
      ],
    });
    savePackage(file, pkg, { audit: false });
    const emitted = emitWorkingPapers(file, evidenceDir, { audit: false });
    assert.equal(emitted.ok, true);
    const names = unzipNames(emitted.buffer);
    assert.ok(names.includes("originals/tagged.bin"));
    assert.equal(names.includes("originals/no-such.bin"), false);
    const unzipped = unzipFile(emitted.buffer, "originals/tagged.bin");
    assert.deepEqual(unzipped, marker);
    const onDisk = fs.readFileSync(path.join(evidenceDir, "tagged.bin"));
    assert.equal(isEncryptedBuffer(onDisk), true);
    assert.equal(onDisk.includes(marker), false);
    const leftovers = fs.readdirSync(evidenceDir);
    assert.deepEqual(leftovers, ["tagged.bin"]);
    assert.equal(fs.existsSync(path.join(dir, "tagged.bin")), false);
    const index = unzipFile(emitted.buffer, "artifact-index.csv").toString("utf8");
    assert.match(index, /policy,policy\.md,tagged\.bin,store-only,/);
    assert.equal(index.includes("keep-me-f8-original-bytes"), false);
    const checklist = unzipFile(emitted.buffer, "completeness-checklist.md").toString("utf8");
    assert.match(checklist, /tagged original: TBD \(2 tagged original missing\)/);
  });
});

describe("F8 encrypt-on-GET still works", () => {
  it("seals plaintext package.json when emit hydrates", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    fs.mkdirSync(evidenceDir);
    const pkg = fixturePkg();
    fs.writeFileSync(file, JSON.stringify(pkg), "utf8");
    assert.equal(fs.readFileSync(file, "utf8").includes("keep-me-f8"), true);
    const emitted = emitWorkingPapers(file, evidenceDir);
    assert.equal(emitted.ok, true);
    const onDisk = fs.readFileSync(file);
    assert.equal(isEncryptedBuffer(onDisk), true);
    assert.equal(onDisk.includes(Buffer.from("keep-me-f8")), false);
    const loaded = loadPackage(file, { audit: false });
    assert.equal(loaded.ok, true);
    assert.equal(loaded.package.controls["AC-1"].notes, "keep-me-f8");
    assert.equal(loaded.package.cmmcInScope, false);
    const again = getHydratedPackage(file, { audit: false });
    assert.equal(again.ok, true);
    assert.equal(again.encrypted, true);
  });

  it("returns 404 when the package is missing", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const result = emitWorkingPapers(file, path.join(dir, "evidence"), { audit: false });
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.equal(result.errorClass, "PackageMissing");
  });
});

describe("F8 audit export is bytes only", () => {
  it("writes export without package or original text", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const evidenceDir = path.join(dir, "evidence");
    fs.mkdirSync(evidenceDir);
    savePackage(file, fixturePkg(), { audit: false });
    const emitted = emitWorkingPapers(file, evidenceDir);
    assert.equal(emitted.ok, true);
    const auditPath = path.join(dir, "audit.log");
    const text = fs.readFileSync(auditPath, "utf8");
    assert.equal(text.includes("keep-me-f8"), false);
    assert.equal(text.includes("keep weakness"), false);
    assert.equal(text.includes("AU-6(3)"), false);
    const lines = readAuditLines(auditPath);
    assert.ok(lines.some((row) => row.action === "export" && row.outcome === "ok" && row.bytesOut === emitted.bytes));
  });
});

describe("F8 Export page and API wiring", () => {
  it("keeps existing download buttons and adds the zip button with no sync", () => {
    const src = fs.readFileSync(path.join(root, "src/pages/Export.tsx"), "utf8");
    assert.match(src, /Download eMASS working-papers zip/);
    assert.match(src, /Download SSP/);
    assert.match(src, /Download POA&amp;M CSV/);
    assert.match(src, /Download JSON/);
    assert.match(src, /Download hardware CSV/);
    assert.match(src, /Download software CSV/);
    assert.match(src, /fetch\("\/api\/emit"\)/);
    assert.match(src, /No sync/);
    assert.match(src, /no eMASS API connection/i);
    const server = fs.readFileSync(path.join(root, "server/index.mjs"), "utf8");
    assert.match(server, /app\.get\(\s*"\/api\/emit"/);
    assert.equal(/0\.0\.0\.0/.test(server), false);
    const pkgJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
    assert.match(pkgJson, /test\/f8-emit\.test\.mjs/);
  });
});

describe("F8 F14 leftover still holds", () => {
  it("seed inbound outbound dataFlows remain empty", () => {
    const boundary = seedSldssBoundary();
    const flows = seedSldssDataFlows();
    assert.deepEqual(boundary.inbound, []);
    assert.deepEqual(boundary.outbound, []);
    assert.deepEqual(flows, []);
  });
});


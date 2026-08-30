import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ENC_MAGIC,
  KEY_FILENAME,
  decryptBuffer,
  encryptBuffer,
  isEncryptedBuffer as isCiphertext,
  loadKey,
  loadOrCreateKey,
} from "../server/atRest.mjs";
import { readAuditLines } from "../server/audit.mjs";
import {
  isEncryptedBuffer,
  loadPackage,
  saveEncryptedBytes,
  savePackage,
  storePaths,
} from "../server/packageStore.mjs";
import { getHydratedPackage } from "../server/packageApi.mjs";
import { seedSldssBoundary, seedSldssDataFlows, TBD, sspBoundaryMarkdown } from "../src/lib/boundary.mjs";
import { seedSldssAssets } from "../src/lib/inventory.mjs";

const temps = [];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-cui-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function fixturePkg() {
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
      "AC-1": { controlId: "AC-1", selection: "in-scope", notes: "keep-me-cui-fixture" },
    },
    policies: [{ id: "pol-AC-1", controlId: "AC-1", body: "keep this policy body" }],
    evidence: [],
    poams: [{ id: "poam-001", emassPoamId: "TBD-eMASS", controlId: "AU-6(3)", weakness: "keep weakness" }],
    ssp: { purpose: "keep ssp", authorizationBoundary: "lab" },
    assets: [{ id: "a1", assetName: "keep asset", assetType: "Server" }],
    software: [{ id: "s1", name: "keep sw" }],
    boundary: { inbound: [], outbound: [], interconnect: [] },
    dataFlows: [],
  };
}

function assertNoLiveData(dir) {
  assert.equal(dir.includes(`${path.sep}data${path.sep}`), false);
  assert.notEqual(path.resolve(dir), path.join(root, "data"));
}

describe("F2 accepted seed leftover confirmation", () => {
  it("inbound outbound dataFlows are empty (SSP TBD) and interconnect is the VPN concentrator only", () => {
    const boundary = seedSldssBoundary();
    const flows = seedSldssDataFlows();
    assert.deepEqual(boundary.inbound, []);
    assert.deepEqual(boundary.outbound, []);
    assert.deepEqual(flows, []);
    assert.equal(boundary.interconnect.length, 1);
    assert.equal(boundary.interconnect[0].name, "site-to-site VPN concentrator");
    assert.equal(boundary.interconnect[0].ownership, "inherited/GSS");
    const tables = sspBoundaryMarkdown({ boundary, dataFlows: flows });
    assert.equal(tables.inbound, TBD);
    assert.equal(tables.outbound, TBD);
    assert.equal(tables.dataFlows, TBD);
    const blob = JSON.stringify({ boundary, flows }).toLowerCase();
    assert.equal(blob.includes("icam"), false);
    assert.equal(blob.includes("siem"), false);
    assert.equal(blob.includes("wsus"), false);
    assert.equal(blob.includes("gccs"), false);
    const assets = seedSldssAssets();
    assert.equal(assets.length, 8);
    assert.equal(JSON.stringify(assets).toLowerCase().includes("vpn"), false);
  });
});

describe("AES-256-GCM encrypt/decrypt", () => {
  it("round-trips a buffer and does not leave plaintext in the ciphertext", () => {
    const key = crypto.randomBytes(32);
    const marker = "keep-me-cui-fixture";
    const pt = Buffer.from(JSON.stringify({ notes: marker, controlId: "AC-1" }), "utf8");
    const enc = encryptBuffer(pt, key);
    assert.equal(isCiphertext(enc), true);
    assert.ok(enc.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC));
    assert.equal(enc.includes(Buffer.from(marker)), false);
    assert.deepEqual(decryptBuffer(enc, key), pt);
  });

  it("wrong key fails closed without producing plaintext", () => {
    const key = crypto.randomBytes(32);
    const pt = Buffer.from("keep-me-cui-fixture");
    const enc = encryptBuffer(pt, key);
    assert.throws(() => decryptBuffer(enc, crypto.randomBytes(32)), (err) => err.name === "DecryptionError");
  });
});

describe("package encryption at rest", () => {
  it("save/load round-trip encrypts on disk and decrypts in memory", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const pkg = fixturePkg();
    const saved = savePackage(file, pkg);
    assert.equal(saved.ok, true);
    const onDisk = fs.readFileSync(file);
    assert.equal(isEncryptedBuffer(onDisk), true);
    assert.equal(onDisk.includes(Buffer.from("keep-me-cui-fixture")), false);
    assert.equal(onDisk.includes(Buffer.from("keep this policy body")), false);
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, true);
    assert.deepEqual(loaded.package, pkg);
    assert.equal(loaded.package.cmmcInScope, false);
    const { keyPath } = storePaths(file);
    assert.equal(path.basename(keyPath), KEY_FILENAME);
    assert.equal(fs.existsSync(keyPath), true);
    assert.equal(loadKey(keyPath).length, 32);
    const mode = fs.statSync(keyPath).mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it("crash during write leaves the canonical ciphertext decryptable", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const first = fixturePkg();
    savePackage(file, first);
    const before = fs.readFileSync(file);
    const next = { ...first, updatedAt: "2026-08-28T12:00:00.000Z", intake: { ...first.intake, acronym: "ZZ" } };
    assert.throws(
      () => savePackage(file, next, { crashAfterTempWrite: true }),
      (err) => err.name === "SimulatedCrash",
    );
    assert.deepEqual(fs.readFileSync(file), before);
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, true);
    assert.deepEqual(loaded.package, first);
    assert.equal(loaded.package.intake.acronym, "FX");
    const leftovers = fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"));
    assert.ok(leftovers.length >= 1);
    const tmpBytes = fs.readFileSync(path.join(dir, leftovers[0]));
    assert.equal(isEncryptedBuffer(tmpBytes), true);
    assert.equal(tmpBytes.includes(Buffer.from("keep-me-cui-fixture")), false);
  });

  it("wrong key fails closed and does not wipe the file", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const pkg = fixturePkg();
    savePackage(file, pkg);
    const before = fs.readFileSync(file);
    const { keyPath } = storePaths(file);
    fs.writeFileSync(keyPath, crypto.randomBytes(32));
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, false);
    assert.equal(loaded.package, null);
    assert.equal(loaded.errorClass, "DecryptionError");
    assert.deepEqual(fs.readFileSync(file), before);
    assert.equal(isEncryptedBuffer(before), true);
  });

  it("legacy plaintext JSON still loads without wiping, next save encrypts", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const pkg = fixturePkg();
    fs.writeFileSync(file, JSON.stringify(pkg), "utf8");
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, true);
    assert.deepEqual(loaded.package, pkg);
    assert.equal(fs.readFileSync(file, "utf8").includes("keep-me-cui-fixture"), true);
    savePackage(file, loaded.package);
    const after = fs.readFileSync(file);
    assert.equal(isEncryptedBuffer(after), true);
    assert.equal(after.includes(Buffer.from("keep-me-cui-fixture")), false);
    assert.deepEqual(loadPackage(file).package, pkg);
  });

  it("encrypts evidence bytes under the same data-dir key", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const evidenceDir = path.join(dir, "evidence");
    fs.mkdirSync(evidenceDir);
    const dest = path.join(evidenceDir, "ev.bin");
    const payload = Buffer.from("keep-me-cui-fixture-evidence");
    saveEncryptedBytes(dest, payload);
    const onDisk = fs.readFileSync(dest);
    assert.equal(isEncryptedBuffer(onDisk), true);
    assert.equal(onDisk.includes(Buffer.from("keep-me-cui-fixture-evidence")), false);
    const { keyPath } = storePaths(dest);
    assert.equal(keyPath, path.join(dir, KEY_FILENAME));
    const key = loadOrCreateKey(keyPath);
    assert.deepEqual(decryptBuffer(onDisk, key), payload);
  });
});

describe("package-access audit log", () => {
  it("save and load emit audit lines without payload text", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const pkg = fixturePkg();
    savePackage(file, pkg);
    loadPackage(file);
    const { auditPath } = storePaths(file);
    assert.equal(path.basename(auditPath), "audit.log");
    assert.equal(fs.existsSync(auditPath), true);
    const text = fs.readFileSync(auditPath, "utf8");
    assert.equal(text.includes("keep-me-cui-fixture"), false);
    assert.equal(text.includes("keep this policy body"), false);
    assert.equal(text.includes("keep weakness"), false);
    assert.equal(text.includes("AC-1"), false);
    assert.equal(text.includes("AU-6(3)"), false);
    const lines = readAuditLines(auditPath);
    assert.ok(lines.length >= 2);
    const actions = lines.map((row) => row.action);
    assert.ok(actions.includes("put"));
    assert.ok(actions.includes("get"));
    for (const row of lines) {
      assert.equal(typeof row.timestamp, "string");
      assert.equal(typeof row.action, "string");
      assert.equal(typeof row.outcome, "string");
      assert.equal(typeof row.bytesIn, "number");
      assert.equal(typeof row.bytesOut, "number");
      assert.equal(Object.hasOwn(row, "timestamp"), true);
      assert.equal(text.includes("keep-me-cui-fixture"), false);
    }
  });

  it("decrypt failure emits decrypt-fail without wiping or logging package text", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    savePackage(file, fixturePkg());
    fs.writeFileSync(storePaths(file).keyPath, crypto.randomBytes(32));
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, false);
    const auditPath = storePaths(file).auditPath;
    const text = fs.readFileSync(auditPath, "utf8");
    assert.equal(text.includes("keep-me-cui-fixture"), false);
    const lines = readAuditLines(auditPath);
    assert.ok(lines.some((row) => row.action === "decrypt-fail" && row.outcome === "fail"));
    assert.equal(fs.existsSync(file), true);
  });
});

describe("GET hydrate remains non-destructive under encryption", () => {
  it("hydrates missing arrays without replacing user rows or sample-seeding assets", () => {
    const dir = tempDir();
    assertNoLiveData(dir);
    const file = path.join(dir, "package.json");
    const old = {
      schemaVersion: 3,
      framework: "DoD RMF",
      catalog: "NIST SP 800-53 Revision 5",
      systemOfRecord: "eMASS",
      cmmcInScope: false,
      sample: true,
      updatedAt: "2026-08-28T00:00:00.000Z",
      intake: { systemName: "Fixture System", acronym: "FX" },
      controls: {
        "AC-1": { controlId: "AC-1", selection: "in-scope", notes: "keep-me-cui-fixture" },
      },
      policies: [{ id: "pol-AC-1", controlId: "AC-1", body: "keep policy" }],
      evidence: [],
      poams: [],
      ssp: { purpose: "keep ssp" },
      assets: [{ id: "a1", assetName: "keep asset", assetType: "Server" }],
      software: [{ id: "s1", name: "keep sw" }],
      boundary: {
        inbound: [],
        outbound: [],
        interconnect: [
          { id: "ix-vpn", name: "site-to-site VPN concentrator", ownership: "inherited/GSS" },
        ],
      },
      dataFlows: [],
    };
    savePackage(file, old);
    const result = getHydratedPackage(file);
    assert.equal(result.ok, true);
    assert.equal(result.package.schemaVersion, 5);
    assert.deepEqual(result.package.inheritanceSources, []);
    assert.equal(result.package.assets.length, 1);
    assert.equal(result.package.assets[0].assetName, "keep asset");
    assert.equal(result.package.controls["AC-1"].notes, "keep-me-cui-fixture");
    assert.equal(JSON.stringify(result.package.assets).includes("RHEL 8 application VM"), false);
    assert.equal(result.package.cmmcInScope, false);
    const after = loadPackage(file, { audit: false }).package;
    assert.equal(after.assets[0].assetName, "keep asset");
    assert.deepEqual(after.boundary.inbound, []);
    assert.deepEqual(after.dataFlows, []);
    assert.equal(after.boundary.interconnect[0].name, "site-to-site VPN concentrator");
    const onDisk = fs.readFileSync(file);
    assert.equal(isEncryptedBuffer(onDisk), true);
    assert.equal(onDisk.includes(Buffer.from("keep-me-cui-fixture")), false);
    assert.equal(fs.existsSync(path.join(root, "data", "package.json.tmp")), false);
  });
});

describe("CUI leftovers wiring", () => {
  it("gitignores the key and audit file and does not claim CMMC certification", () => {
    const gi = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
    assert.match(gi, /data\/\.package-key/);
    assert.match(gi, /data\/audit\.log/);
    const matrix = fs.readFileSync(path.join(root, "docs/cui-practice-matrix.md"), "utf8");
    assert.match(matrix, /not.*CMMC certification claim/i);
    assert.match(matrix, /not.*SPRS score/i);
    assert.equal(/CMMC certified/i.test(matrix), false);
    const types = fs.readFileSync(path.join(root, "src/types.ts"), "utf8");
    assert.match(types, /cmmcInScope:\s*false/);
    const server = fs.readFileSync(path.join(root, "server/index.mjs"), "utf8");
    assert.match(server, /LISTEN_HOST\s*=\s*"127\.0\.0\.1"/);
    assert.match(server, /LOCAL_VITE_ORIGIN\s*=\s*"http:\/\/127\.0\.0\.1:5173"/);
    assert.equal(/0\.0\.0\.0/.test(server), false);
  });
});

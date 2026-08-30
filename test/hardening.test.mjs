import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { isEncryptedBuffer, loadPackage, savePackage } from "../server/packageStore.mjs";
import { isControlSelected, patchControl, retargetControls } from "../src/lib/tailor.mjs";

const temps = [];

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-wb-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function samplePkg() {
  return {
    schemaVersion: 1,
    framework: "DoD RMF",
    catalog: "NIST SP 800-53 Revision 5",
    systemOfRecord: "eMASS",
    cmmcInScope: false,
    sample: true,
    updatedAt: "2026-08-28T00:00:00.000Z",
    intake: {
      systemName: "Fixture System",
      acronym: "FX",
      overlayNistModerate: true,
      overlayCnssi1253: true,
      overlayDodRmf: true,
      overlayPrivacy: true,
    },
    controls: {
      "AC-1": {
        controlId: "AC-1",
        selection: "in-scope",
        implementation: "implemented",
        notes: "policy keep",
        inheritedFrom: "",
        naJustification: "",
        implementationStatement: "AC-1 implemented in fixture.",
        responsibleRole: "ISSO",
        parameters: "",
        assessment: "in-progress",
      },
      "AC-2": {
        controlId: "AC-2",
        selection: "in-scope",
        implementation: "implemented",
        notes: "unrelated keep",
        inheritedFrom: "",
        naJustification: "",
        implementationStatement: "AC-2 implemented in fixture.",
        responsibleRole: "ISSO",
        parameters: "",
        assessment: "in-progress",
      },
      "PT-1": {
        controlId: "PT-1",
        selection: "in-scope",
        implementation: "partial",
        notes: "privacy keep",
        inheritedFrom: "",
        naJustification: "",
        implementationStatement: "PT-1 partial in fixture.",
        responsibleRole: "ISSO",
        parameters: "",
        assessment: "not-started",
      },
    },
    policies: [
      {
        id: "pol-AC-1",
        controlId: "AC-1",
        title: "AC-1 Policy and Procedures",
        status: "draft",
        owner: "ISSO",
        body: "keep this policy body",
        lastUpdated: "2026-08-01",
      },
      {
        id: "pol-PT-1",
        controlId: "PT-1",
        title: "PT-1 Policy and Procedures",
        status: "stub",
        owner: "ISSO",
        body: "privacy policy body",
        lastUpdated: "2026-08-01",
      },
    ],
    evidence: [],
    poams: [],
    ssp: { purpose: "fixture", authorizationBoundary: "lab" },
  };
}

const catalog = [
  { id: "AC-1", title: "Policy and Procedures", overlays: ["nist-moderate"], policyControl: true },
  { id: "AC-2", title: "Account Management", overlays: ["nist-moderate"], policyControl: false },
  { id: "PT-1", title: "Policy and Procedures", overlays: ["privacy"], policyControl: true },
  { id: "PT-2", title: "Authority to Process PII", overlays: ["privacy"], policyControl: false },
];

describe("package save/load", () => {
  it("round-trips with equality", () => {
    const dir = tempDir();
    const file = path.join(dir, "package.json");
    const pkg = samplePkg();
    const saved = savePackage(file, pkg);
    assert.equal(saved.ok, true);
    assert.ok(saved.bytes > 0);
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.missing, false);
    assert.deepEqual(loaded.package, pkg);
    const onDisk = fs.readFileSync(file);
    assert.equal(isEncryptedBuffer(onDisk), true);
    assert.equal(onDisk.includes(Buffer.from("policy keep")), false);
    assert.equal(onDisk.includes(Buffer.from("AC-1 implemented in fixture.")), false);
  });

  it("crash during write does not corrupt the canonical file", () => {
    const dir = tempDir();
    const file = path.join(dir, "package.json");
    const first = samplePkg();
    savePackage(file, first);
    const before = fs.readFileSync(file);

    const next = { ...first, updatedAt: "2026-08-28T12:00:00.000Z", intake: { ...first.intake, acronym: "ZZ" } };
    assert.throws(() => savePackage(file, next, { crashAfterTempWrite: true }), (err) => err.name === "SimulatedCrash");

    assert.deepEqual(fs.readFileSync(file), before);
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, true);
    assert.deepEqual(loaded.package, first);
    assert.equal(isEncryptedBuffer(before), true);

    const leftovers = fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"));
    assert.ok(leftovers.length >= 1);
    const canonicalStillGood = loadPackage(file, { audit: false });
    assert.equal(canonicalStillGood.ok, true);
    assert.deepEqual(canonicalStillGood.package, first);
  });

  it("truncated sibling temp does not replace the canonical file", () => {
    const dir = tempDir();
    const file = path.join(dir, "package.json");
    const pkg = samplePkg();
    savePackage(file, pkg);
    fs.writeFileSync(path.join(dir, "package.json.orphan.tmp"), "{", "utf8");
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, true);
    assert.deepEqual(loaded.package, pkg);
  });

  it("malformed JSON fails safely and does not rewrite the file", () => {
    const dir = tempDir();
    const file = path.join(dir, "package.json");
    const raw = "{not-valid-json";
    fs.writeFileSync(file, raw, "utf8");
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, false);
    assert.equal(loaded.errorClass, "SyntaxError");
    assert.equal(loaded.package, null);
    assert.equal(fs.readFileSync(file, "utf8"), raw);
  });

  it("non-object JSON fails safely", () => {
    const dir = tempDir();
    const file = path.join(dir, "package.json");
    fs.writeFileSync(file, "[1,2,3]", "utf8");
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, false);
    assert.equal(loaded.errorClass, "InvalidPackageShape");
    assert.equal(fs.readFileSync(file, "utf8"), "[1,2,3]");
  });

  it("missing file loads as empty without creating a package", () => {
    const dir = tempDir();
    const file = path.join(dir, "package.json");
    const loaded = loadPackage(file);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.missing, true);
    assert.equal(loaded.package, null);
    assert.equal(fs.existsSync(file), false);
  });

  it("keeps a backup of the previous good file when one does not exist", () => {
    const dir = tempDir();
    const file = path.join(dir, "package.json");
    const first = samplePkg();
    const second = { ...first, updatedAt: "2026-08-28T01:00:00.000Z" };
    const third = { ...first, updatedAt: "2026-08-28T02:00:00.000Z" };
    savePackage(file, first);
    assert.equal(fs.existsSync(file + ".bak"), false);
    savePackage(file, second);
    assert.deepEqual(loadPackage(file + ".bak", { audit: false }).package, first);
    savePackage(file, third);
    assert.deepEqual(loadPackage(file + ".bak", { audit: false }).package, first);
    assert.deepEqual(loadPackage(file).package, third);
    assert.equal(isEncryptedBuffer(fs.readFileSync(file)), true);
  });

  it("rejects non-object saves without writing a canonical file", () => {
    const dir = tempDir();
    const file = path.join(dir, "package.json");
    assert.throws(() => savePackage(file, null), (err) => err.name === "InvalidPackageShape");
    assert.throws(() => savePackage(file, [1]), (err) => err.name === "InvalidPackageShape");
    assert.equal(fs.existsSync(file), false);
  });
});

describe("tailoring", () => {
  it("include or exclude of one control does not drop unrelated controls", () => {
    const pkg = samplePkg();
    const idsBefore = Object.keys(pkg.controls).sort();
    const tailored = patchControl(pkg, "AC-2", {
      selection: "tailored-out",
      implementation: "not-applicable",
      naJustification: "out of boundary",
    });
    assert.deepEqual(Object.keys(tailored.controls).sort(), idsBefore);
    assert.equal(tailored.controls["AC-2"].selection, "tailored-out");
    assert.equal(tailored.controls["AC-1"].notes, "policy keep");
    assert.equal(tailored.controls["PT-1"].notes, "privacy keep");
    assert.deepEqual(tailored.controls["AC-1"], pkg.controls["AC-1"]);
    assert.deepEqual(tailored.policies, pkg.policies);

    const back = patchControl(tailored, "AC-2", { selection: "in-scope", implementation: "implemented" });
    assert.deepEqual(Object.keys(back.controls).sort(), idsBefore);
    assert.equal(back.controls["PT-1"].notes, "privacy keep");
  });

  it("overlay retarget adds or drops overlay controls without corrupting the rest", () => {
    const pkg = samplePkg();
    assert.equal(isControlSelected(pkg.intake, ["privacy"]), true);

    const withoutPrivacy = {
      ...pkg,
      intake: { ...pkg.intake, overlayPrivacy: false },
    };
    const dropped = retargetControls(withoutPrivacy, catalog);
    assert.ok(dropped.controls["AC-1"]);
    assert.ok(dropped.controls["AC-2"]);
    assert.equal(dropped.controls["AC-2"].notes, "unrelated keep");
    assert.equal(dropped.controls["PT-1"], undefined);
    assert.equal(dropped.controls["PT-2"], undefined);
    assert.deepEqual(
      dropped.policies.map((p) => p.controlId),
      ["AC-1"],
    );
    assert.equal(dropped.policies[0].body, "keep this policy body");
    assert.equal(dropped.ssp.purpose, "fixture");

    const restored = retargetControls({ ...dropped, intake: { ...dropped.intake, overlayPrivacy: true } }, catalog);
    assert.ok(restored.controls["AC-2"]);
    assert.equal(restored.controls["AC-2"].notes, "unrelated keep");
    assert.ok(restored.controls["PT-1"]);
    assert.equal(restored.controls["PT-1"].selection, "in-scope");
    assert.equal(restored.controls["PT-1"].implementation, "not-implemented");
    assert.ok(restored.controls["PT-2"]);
    assert.ok(restored.policies.some((p) => p.controlId === "AC-1" && p.body === "keep this policy body"));
    assert.ok(restored.policies.some((p) => p.controlId === "PT-1"));
  });
});

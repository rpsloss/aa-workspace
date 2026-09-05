/** TDD/CONOPS → Categorize/Select starter pack. Working papers only. Never invent DISA STIG IDs. Never log CUI. */

import { asList, emptyAsset, emptySoftware, normalizeAsset, normalizeSoftware } from "./inventory.mjs";
import { emptyDataFlow, normalizeDataFlow } from "./boundary.mjs";
import { normalizeStigAssignments, upsertStigAssignment, isStigProductFamily } from "./stig.mjs";
import { retargetControls } from "./tailor.mjs";
import { normalizeArtifact } from "./ingest/artifacts.mjs";

export const DESIGN_ARTIFACT_TYPES = Object.freeze(["tdd", "conops"]);
export const IMPACT_LEVELS = Object.freeze(["Low", "Moderate", "High"]);
export const INTERFACE_DIRECTIONS = Object.freeze(["inbound", "outbound", "bidirectional", "internal"]);

function str(value) {
  return value == null ? "" : String(value);
}

function newId(prefix) {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

function impactOr(value, fallback = "Moderate") {
  const v = str(value);
  return IMPACT_LEVELS.includes(v) ? v : fallback;
}

export function emptyDesignComponent(id = "") {
  return { id: id || newId("comp"), name: "", os: "", apps: "", notes: "" };
}

export function emptyDesignInterface(id = "") {
  return {
    id: id || newId("iface"),
    name: "",
    port: "",
    protocol: "",
    direction: "outbound",
    source: "",
    destination: "",
    notes: "",
  };
}

export function emptyDesignExtract() {
  return {
    dataTypes: "",
    components: [],
    interfaces: [],
    confidentiality: "Moderate",
    integrity: "Moderate",
    availability: "Moderate",
    notes: "",
    generatedAt: "",
  };
}

function normalizeComponent(row, index = 0) {
  const fallback = `comp-${index + 1}`;
  if (!row || typeof row !== "object" || Array.isArray(row)) return emptyDesignComponent(fallback);
  return {
    id: str(row.id) || fallback,
    name: str(row.name),
    os: str(row.os),
    apps: str(row.apps),
    notes: str(row.notes),
  };
}

function normalizeInterface(row, index = 0) {
  const fallback = `iface-${index + 1}`;
  if (!row || typeof row !== "object" || Array.isArray(row)) return emptyDesignInterface(fallback);
  const direction = INTERFACE_DIRECTIONS.includes(str(row.direction)) ? str(row.direction) : "outbound";
  return {
    id: str(row.id) || fallback,
    name: str(row.name),
    port: str(row.port),
    protocol: str(row.protocol),
    direction,
    source: str(row.source),
    destination: str(row.destination),
    notes: str(row.notes),
  };
}

export function normalizeDesignExtract(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    dataTypes: str(src.dataTypes),
    components: asList(src.components).map((row, i) => normalizeComponent(row, i)),
    interfaces: asList(src.interfaces).map((row, i) => normalizeInterface(row, i)),
    confidentiality: impactOr(src.confidentiality),
    integrity: impactOr(src.integrity),
    availability: impactOr(src.availability),
    notes: str(src.notes),
    generatedAt: str(src.generatedAt),
  };
}

/**
 * Missing designExtract → empty. Does not invent sample rows.
 * Does not drop unrelated package fields. Does not bump schema by itself.
 */
export function ensureDesignExtract(pkg) {
  if (pkg === null || pkg === undefined) return pkg;
  if (typeof pkg !== "object" || Array.isArray(pkg)) return pkg;
  return {
    ...pkg,
    designExtract: normalizeDesignExtract(pkg.designExtract),
  };
}

export function isDesignArtifactType(value) {
  return DESIGN_ARTIFACT_TYPES.includes(value);
}

export function designArtifacts(pkg) {
  return asList(pkg?.artifacts)
    .map((row, i) => normalizeArtifact(row, i))
    .filter((row) => isDesignArtifactType(row.artifactType));
}

/** Guess product family from OS/app text. Never invents official DISA STIG IDs. */
export function guessStigFamily(text) {
  const s = str(text).toLowerCase();
  if (!s) return "";
  if (/postgres|postgresql|\bpgsql\b/.test(s)) return "postgresql";
  if (/rhel|red\s*hat|centos|rocky\s*linux|alma/.test(s)) return "rhel-8";
  if (/windows\s*server|win\s*server|\bserver\s*201[69]\b|\bserver\s*202[02]\b|\bwindows\b/.test(s)) {
    return "windows-server";
  }
  return "";
}

function buildImpactJustification(extract) {
  const c = extract.confidentiality;
  const i = extract.integrity;
  const a = extract.availability;
  const data = extract.dataTypes || "system data types (TBD)";
  return (
    `Draft FIPS 199 / CNSSI 1253 impact from TDD/CONOPS starter extract (working paper only). ` +
    `Proposed C/I/A = ${c}/${i}/${a}. Data types considered: ${data}. ` +
    `Confirm against the official categorization memo before posting to eMASS.`
  );
}

function splitApps(apps) {
  return str(apps)
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Apply editable extract into the package model.
 * Seeds intake impact/overlays, HW/SW, dataFlow/PPSM prep, STIG family draft (officialId blank),
 * and control set via existing catalog/retarget. Does not mint NIST controls outside the catalog.
 */
export function applyStarterPack(pkg, extract, options = {}) {
  const catalog = Array.isArray(options.catalog) ? options.catalog : [];
  const merge = options.merge !== false;
  const ex = normalizeDesignExtract(extract);
  const base = pkg && typeof pkg === "object" && !Array.isArray(pkg) ? pkg : {};

  let next = {
    ...base,
    intake: { ...(base.intake || {}) },
    assets: merge ? asList(base.assets).map((row, i) => normalizeAsset(row, i)) : [],
    software: merge ? asList(base.software).map((row, i) => normalizeSoftware(row, i)) : [],
    dataFlows: merge ? asList(base.dataFlows).map((row, i) => normalizeDataFlow(row, i)) : [],
    stigAssignments: merge ? normalizeStigAssignments(base.stigAssignments) : [],
    artifacts: asList(base.artifacts).map((row, i) => normalizeArtifact(row, i)),
    controls: { ...(base.controls || {}) },
  };

  next.intake = {
    ...next.intake,
    confidentiality: ex.confidentiality,
    integrity: ex.integrity,
    availability: ex.availability,
    dataTypes: ex.dataTypes || next.intake.dataTypes || "",
    overlayNistModerate: true,
    overlayCnssi1253: true,
    overlayDodRmf: true,
    impactJustification: str(next.intake.impactJustification).trim()
      ? next.intake.impactJustification
      : buildImpactJustification(ex),
    rmfStep:
      next.intake.rmfStep === "Categorize" || !next.intake.rmfStep ? "Select" : next.intake.rmfStep,
  };

  for (const comp of ex.components) {
    const name = str(comp.name).trim();
    if (!name) continue;
    const existingIdx = next.assets.findIndex(
      (row) => str(row.assetName).toLowerCase() === name.toLowerCase(),
    );
    const assetId = existingIdx >= 0 ? next.assets[existingIdx].id : newId("hw");
    const assetRow = normalizeAsset(
      {
        ...(existingIdx >= 0 ? next.assets[existingIdx] : emptyAsset(assetId)),
        id: assetId,
        assetName: name,
        assetType: str(next.assets[existingIdx]?.assetType) || "Server",
        osFirmware: comp.os || (existingIdx >= 0 ? next.assets[existingIdx].osFirmware : ""),
        notes: [
          existingIdx >= 0 ? str(next.assets[existingIdx].notes) : "",
          "Seeded from TDD/CONOPS starter pack (working paper).",
          comp.notes,
        ]
          .filter(Boolean)
          .join(" "),
      },
      existingIdx >= 0 ? existingIdx : next.assets.length,
    );
    if (existingIdx >= 0) next.assets[existingIdx] = assetRow;
    else next.assets.push(assetRow);

    const family = guessStigFamily(`${comp.os} ${comp.name} ${comp.apps}`);
    if (family && isStigProductFamily(family)) {
      const prior = next.stigAssignments.find(
        (row) => row.targetKind === "asset" && row.targetId === assetId,
      );
      next.stigAssignments = upsertStigAssignment(next.stigAssignments, {
        targetKind: "asset",
        targetId: assetId,
        stigProductFamily: family,
        officialId: prior?.officialId || "",
      });
    }

    for (const appName of splitApps(comp.apps)) {
      const swIdx = next.software.findIndex(
        (row) =>
          str(row.name).toLowerCase() === appName.toLowerCase() &&
          str(row.relatedAsset).toLowerCase() === name.toLowerCase(),
      );
      const swId = swIdx >= 0 ? next.software[swIdx].id : newId("sw");
      const swRow = normalizeSoftware(
        {
          ...(swIdx >= 0 ? next.software[swIdx] : emptySoftware(swId)),
          id: swId,
          name: appName,
          relatedAsset: name,
          vendor: swIdx >= 0 ? next.software[swIdx].vendor : "",
          version: swIdx >= 0 ? next.software[swIdx].version : "",
          license: swIdx >= 0 ? next.software[swIdx].license : "",
        },
        swIdx >= 0 ? swIdx : next.software.length,
      );
      if (swIdx >= 0) next.software[swIdx] = swRow;
      else next.software.push(swRow);

      const swFamily = guessStigFamily(appName);
      if (swFamily === "postgresql") {
        const priorSw = next.stigAssignments.find(
          (row) => row.targetKind === "software" && row.targetId === swId,
        );
        next.stigAssignments = upsertStigAssignment(next.stigAssignments, {
          targetKind: "software",
          targetId: swId,
          stigProductFamily: "postgresql",
          officialId: priorSw?.officialId || "",
        });
      }
    }
  }

  for (const iface of ex.interfaces) {
    const label =
      str(iface.name).trim() ||
      [iface.source, iface.destination].filter(Boolean).join(" → ") ||
      [iface.protocol, iface.port].filter(Boolean).join("/");
    if (!label && !iface.port && !iface.protocol) continue;
    const flowName = label || "Starter pack flow";
    const existingIdx = next.dataFlows.findIndex(
      (row) =>
        str(row.name).toLowerCase() === flowName.toLowerCase() &&
        str(row.port) === str(iface.port) &&
        str(row.protocol).toLowerCase() === str(iface.protocol).toLowerCase(),
    );
    const flowId = existingIdx >= 0 ? next.dataFlows[existingIdx].id : newId("flow");
    const directionNote = iface.direction ? `Direction: ${iface.direction}.` : "";
    const flow = normalizeDataFlow(
      {
        ...(existingIdx >= 0 ? next.dataFlows[existingIdx] : emptyDataFlow(flowId)),
        id: flowId,
        name: flowName,
        source: iface.source || (existingIdx >= 0 ? next.dataFlows[existingIdx].source : ""),
        destination:
          iface.destination || (existingIdx >= 0 ? next.dataFlows[existingIdx].destination : ""),
        protocol: iface.protocol || (existingIdx >= 0 ? next.dataFlows[existingIdx].protocol : ""),
        port: iface.port || (existingIdx >= 0 ? next.dataFlows[existingIdx].port : ""),
        description:
          (existingIdx >= 0 ? next.dataFlows[existingIdx].description : "") ||
          "PPSM/data-flow prep from TDD/CONOPS starter pack (not an official DISA PPSM emit).",
        notes: [existingIdx >= 0 ? str(next.dataFlows[existingIdx].notes) : "", directionNote, iface.notes]
          .filter(Boolean)
          .join(" "),
      },
      existingIdx >= 0 ? existingIdx : next.dataFlows.length,
    );
    if (existingIdx >= 0) next.dataFlows[existingIdx] = flow;
    else next.dataFlows.push(flow);
  }

  if (catalog.length > 0) {
    next = retargetControls(next, catalog);
  }

  next.designExtract = {
    ...ex,
    generatedAt: new Date().toISOString(),
  };
  next.updatedAt = new Date().toISOString();
  return next;
}

function hasDesignDocs(pkg) {
  return designArtifacts(pkg).length > 0;
}

function hasCategorizationMemo(pkg) {
  const ex = normalizeDesignExtract(pkg?.designExtract);
  const impactFilled = Boolean(ex.confidentiality && ex.integrity && ex.availability);
  const dataFilled = Boolean(str(ex.dataTypes).trim()) || Boolean(str(pkg?.intake?.dataTypes).trim());
  const justification = Boolean(str(pkg?.intake?.impactJustification).trim());
  return (impactFilled && dataFilled) || justification || hasDesignDocs(pkg);
}

function hasHwSw(pkg) {
  return asList(pkg?.assets).length > 0 && asList(pkg?.software).length > 0;
}

function hasPpsmPrep(pkg) {
  return asList(pkg?.dataFlows).some((row) => str(row?.protocol).trim() || str(row?.port).trim());
}

function hasStigDraft(pkg) {
  return normalizeStigAssignments(pkg?.stigAssignments).length > 0;
}

function hasControlSet(pkg) {
  const controls = pkg?.controls;
  if (!controls || typeof controls !== "object" || Array.isArray(controls)) return false;
  return Object.keys(controls).length > 0;
}

/** Artifact checklist for Categorize/Select starter pack. Heuristic only — not an AO decision. */
export function starterPackChecklist(pkg) {
  const items = [
    {
      id: "categorization-memo",
      label: "Categorization memo",
      detail: "TDD/CONOPS on file and/or draft C/I/A + data types",
      done: hasCategorizationMemo(pkg),
      href: "/design",
    },
    {
      id: "hw-sw",
      label: "HW/SW inventory",
      detail: "At least one hardware and one software row",
      done: hasHwSw(pkg),
      href: "/assets",
    },
    {
      id: "ppsm-prep",
      label: "PPSM / data-flow prep",
      detail: "dataFlows with protocol or port (working-paper fields)",
      done: hasPpsmPrep(pkg),
      href: "/boundary",
    },
    {
      id: "stig-matrix",
      label: "STIG matrix draft",
      detail: "Product-family tags present; official DISA IDs stay blank/TBD",
      done: hasStigDraft(pkg),
      href: "/stig",
    },
    {
      id: "control-set",
      label: "Control set",
      detail: "Tailored baseline from existing catalog/selection",
      done: hasControlSet(pkg),
      href: "/tailoring",
    },
  ];
  const done = items.filter((item) => item.done).length;
  const total = items.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { items, done, total, percent };
}

function csvEscape(value) {
  const text = str(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** eMASS-oriented starter-pack checklist CSV. Not an official DISA template. */
export function starterPackCsv(pkg) {
  const checklist = starterPackChecklist(pkg);
  const ex = normalizeDesignExtract(pkg?.designExtract);
  const header = ["Item", "Status", "Detail", "Href"];
  const lines = checklist.items.map((item) =>
    [item.label, item.done ? "present" : "TBD", item.detail, item.href].map(csvEscape).join(","),
  );
  const meta = [
    "",
    `# Proposed C/I/A,${csvEscape(`${ex.confidentiality}/${ex.integrity}/${ex.availability}`)}`,
    `# Data types,${csvEscape(ex.dataTypes)}`,
    `# Components,${ex.components.length}`,
    `# Interfaces,${ex.interfaces.length}`,
    `# Generated at,${csvEscape(ex.generatedAt || "")}`,
    `# Note,Working papers only. eMASS remains SoR. Not an official DISA/PPSM/STIG template.`,
  ];
  return [header.join(","), ...lines, ...meta].join("\n");
}

/** Markdown starter-pack memo for the working-papers zip. */
export function starterPackMarkdown(pkg) {
  const checklist = starterPackChecklist(pkg);
  const ex = normalizeDesignExtract(pkg?.designExtract);
  const intake = pkg?.intake && typeof pkg.intake === "object" ? pkg.intake : {};
  const line = (item) => `- ${item.label}: ${item.done ? "present" : "TBD"} (${item.detail})`;
  const comps = ex.components
    .map((c) => `- ${c.name || "(unnamed)"} · OS ${c.os || "TBD"} · apps ${c.apps || "TBD"}`)
    .join("\n");
  const ifaces = ex.interfaces
    .map((i) => {
      const label = i.name || [i.source, i.destination].filter(Boolean).join("→") || "(flow)";
      return `- ${label} · ${i.protocol || "TBD"}/${i.port || "TBD"} · ${i.direction}`;
    })
    .join("\n");

  return `# Categorize/Select starter pack

Working papers only. Not an AO or SCA decision. eMASS remains the system of record.
Not an official DISA PPSM or STIG template. Official DISA STIG IDs stay blank/TBD.

## System

- Name: ${str(intake.systemName) || "TBD"}
- Acronym: ${str(intake.acronym) || "TBD"}
- Proposed C/I/A: ${ex.confidentiality}/${ex.integrity}/${ex.availability}
- Data types: ${ex.dataTypes || str(intake.dataTypes) || "TBD"}

## Checklist (${checklist.percent}%)

${checklist.items.map(line).join("\n")}

## Components (extract)

${comps || "- TBD"}

## Interfaces / PPSM prep (extract)

${ifaces || "- TBD"}

## Notes

${ex.notes || "_None_"}

Generated at: ${ex.generatedAt || "not generated yet"}
`;
}

/** Fictional SLDSS-paired placeholders for demo only. */
export function sampleSldssDesignExtract() {
  return normalizeDesignExtract({
    dataTypes:
      "DoD ID numbers, work emails, unit identifiers, NSNs, requisition quantities, transportation control numbers, free-text logistics remarks (CUI). Limited work PII. No PHI. No classified.",
    confidentiality: "Moderate",
    integrity: "Moderate",
    availability: "Moderate",
    notes:
      "Fictional placeholders paired with the SLDSS sample. Replace with real TDD/CONOPS extracts before any eMASS transcription.",
    components: [
      {
        id: "comp-app",
        name: "SLDSS app tier",
        os: "RHEL 8",
        apps: "SLDSS application",
        notes: "Behind authenticated reverse proxy (GSS).",
      },
      {
        id: "comp-db",
        name: "SLDSS database tier",
        os: "RHEL 8",
        apps: "PostgreSQL",
        notes: "Separate VLAN; data-at-rest on volumes.",
      },
      {
        id: "comp-jump",
        name: "Admin jump hosts",
        os: "Windows Server",
        apps: "",
        notes: "Jump host role; Asset Type Server in Joint CSV.",
      },
    ],
    interfaces: [
      {
        id: "iface-icam",
        name: "ICAM authentication",
        protocol: "TCP",
        port: "443",
        direction: "inbound",
        source: "DoD ICAM",
        destination: "SLDSS reverse proxy",
        notes: "Inherited identity; PPSM prep only.",
      },
      {
        id: "iface-siem",
        name: "SIEM log forward",
        protocol: "TCP",
        port: "514",
        direction: "outbound",
        source: "SLDSS app tier",
        destination: "Enterprise SIEM",
        notes: "Working-paper port; confirm with GSS.",
      },
      {
        id: "iface-feed",
        name: "Logistics feed",
        protocol: "TCP",
        port: "8443",
        direction: "outbound",
        source: "SLDSS app tier",
        destination: "Accredited logistics partner",
        notes: "PPSM registration in progress (sample).",
      },
    ],
  });
}

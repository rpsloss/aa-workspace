/** PARSE .nessus XML and .cklb JSON into scan findings. Never invent CCI/control maps or DISA STIG IDs. Never log CUI. */

import { asList } from "../inventory.mjs";
import { isStigProductFamily } from "../stig.mjs";

export const SCAN_SOURCE_TYPES = Object.freeze(["nessus", "cklb"]);
export const SCAN_STATUSES = Object.freeze([
  "open",
  "not-a-finding",
  "not-applicable",
  "not-reviewed",
  "informational",
]);

const FINDING_FIELDS = [
  "id",
  "assetId",
  "unmatchedHost",
  "hostName",
  "pluginId",
  "ruleId",
  "severity",
  "status",
  "stigFamily",
  "title",
  "sourceType",
  "inheritedGss",
];

function str(value) {
  return value == null ? "" : String(value).trim();
}

function key(value) {
  return str(value).toLowerCase();
}

function decodeXml(text) {
  return str(text)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attrs(openTag) {
  const out = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(openTag || ""))) out[m[1]] = decodeXml(m[2]);
  return out;
}

export function emptyScanFinding(id = "") {
  return {
    id,
    assetId: "",
    unmatchedHost: "",
    hostName: "",
    pluginId: "",
    ruleId: "",
    severity: "",
    status: "",
    stigFamily: "",
    title: "",
    sourceType: "",
    inheritedGss: false,
    cciIds: [],
    cciAdvisory: "",
  };
}

/**
 * Copy CCI identifiers that already appear in source text/fields.
 * Does not mint CCI-NNNN, does not look up a CCI catalog, does not map to NIST controls.
 */
export function extractCciIdsFromText(value) {
  const text = str(value);
  if (!text) return [];
  const out = [];
  const seen = new Set();
  const re = /\bCCI-\d+\b/gi;
  let m;
  while ((m = re.exec(text))) {
    const id = m[0].toUpperCase();
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function collectCciIdsFromValue(value, acc, seen) {
  if (value == null || value === "") return;
  if (Array.isArray(value)) {
    for (const item of value) collectCciIdsFromValue(item, acc, seen);
    return;
  }
  if (typeof value === "object") {
    const system = str(value.system || value.type);
    if (system && !/^cci$/i.test(system)) return;
    collectCciIdsFromValue(value.id ?? value.cci ?? value.cciId ?? value.cci_id ?? value.value, acc, seen);
    return;
  }
  for (const id of extractCciIdsFromText(value)) {
    if (!seen.has(id)) {
      seen.add(id);
      acc.push(id);
    }
  }
}

export function normalizeCciIds(value) {
  const acc = [];
  const seen = new Set();
  collectCciIdsFromValue(value, acc, seen);
  return acc;
}

export function cciAdvisoryFromIds(ids) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  return list.length ? list.join(", ") : "";
}

export function cciAdvisoryDisplay(row) {
  const ids = normalizeCciIds(row?.cciIds);
  if (ids.length) return ids.join(", ");
  const advisory = str(row?.cciAdvisory);
  return advisory || "TBD";
}

const CKLB_CCI_KEYS = ["ccis", "cci", "cciIds", "cci_ids", "cciId", "cci_id", "cci_ref", "cciRef", "cciRefs"];

export function collectCciIdsFromCklbRule(rule) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) return [];
  const blobs = [];
  for (const k of CKLB_CCI_KEYS) {
    if (rule[k] != null) blobs.push(rule[k]);
  }
  if (rule.identifiers != null) blobs.push(rule.identifiers);
  return normalizeCciIds(blobs);
}

export function collectCciIdsFromNessusItem(itemXml) {
  const xml = str(itemXml);
  if (!xml) return [];
  const blobs = [];
  const re = /<([\w:-]*(?:cci[_-]?refs?|cci|compliance-reference))(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(xml))) blobs.push(decodeXml(m[2]));
  return normalizeCciIds(blobs);
}

export function normalizeSeverity(value) {
  const t = key(value);
  if (t === "4" || t === "critical") return "critical";
  if (t === "3" || t === "high") return "high";
  if (t === "2" || t === "medium" || t === "moderate") return "medium";
  if (t === "1" || t === "low") return "low";
  if (t === "0" || t === "info" || t === "informational" || t === "none") return "informational";
  return str(value).toLowerCase();
}

export function normalizeFindingStatus(value, severity = "") {
  const t = key(value).replace(/[_ ]+/g, "-");
  if (t === "open" || t === "failed" || t === "fail") return "open";
  if (
    t === "notafinding" ||
    t === "not-a-finding" ||
    t === "not-a-findings" ||
    t === "passed" ||
    t === "pass"
  ) {
    return "not-a-finding";
  }
  if (t === "notapplicable" || t === "not-applicable" || t === "na" || t === "n-a") return "not-applicable";
  if (t === "notreviewed" || t === "not-reviewed" || t === "not-checked") return "not-reviewed";
  if (t === "informational" || t === "info") return "informational";
  if (!t && severity === "informational") return "informational";
  if (!t) return "open";
  return t;
}

/**
 * Product family from CKLB benchmark title only (rhel-8 / windows-server / postgresql).
 * Does not invent official DISA STIG IDs. Does not map Nessus plugin families.
 */
export function inferStigFamilyFromText(text) {
  const t = key(text);
  if (!t) return "";
  if (/\bpostgresql\b|\bpostgres\b/.test(t)) return "postgresql";
  if (/windows\s*server/.test(t) || t.includes("windows-server")) return "windows-server";
  if (/rhel[\s-]*8/.test(t) || /red hat enterprise linux\s*8/.test(t)) return "rhel-8";
  return "";
}

export function normalizeScanFinding(row, index = 0) {
  const fallbackId = `finding-${index + 1}`;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return emptyScanFinding(fallbackId);
  }
  const sourceType = SCAN_SOURCE_TYPES.includes(row.sourceType) ? row.sourceType : str(row.sourceType);
  const familyRaw = str(row.stigFamily);
  const stigFamily = isStigProductFamily(familyRaw) ? familyRaw : "";
  const cciIds = normalizeCciIds([row.cciIds, row.cciAdvisory]);
  return {
    id: str(row.id) || fallbackId,
    assetId: str(row.assetId),
    unmatchedHost: str(row.unmatchedHost),
    hostName: str(row.hostName),
    pluginId: str(row.pluginId),
    ruleId: str(row.ruleId),
    severity: normalizeSeverity(row.severity) || str(row.severity).toLowerCase(),
    status: normalizeFindingStatus(row.status, normalizeSeverity(row.severity)),
    stigFamily,
    title: str(row.title),
    sourceType,
    inheritedGss: Boolean(row.inheritedGss),
    cciIds,
    cciAdvisory: cciAdvisoryFromIds(cciIds),
  };
}

export function normalizeScanFindings(list) {
  return asList(list).map((row, i) => normalizeScanFinding(row, i));
}

/**
 * Missing scanFindings → []. Does not invent sample findings, CCI maps, or control status.
 * Does not drop unrelated package fields. Does not stamp schema by itself.
 */
export function ensureScanFindings(pkg) {
  if (pkg === null || pkg === undefined) return pkg;
  if (typeof pkg !== "object" || Array.isArray(pkg)) return pkg;
  return {
    ...pkg,
    scanFindings: normalizeScanFindings(pkg.scanFindings),
  };
}

/**
 * Classified / secret / TS markings in metadata. UNCLASSIFIED is not classified.
 * Missing marking is CUI-adjacent working paper (still parse; do not label the package classified).
 */
export function hasClassifiedMarking(text) {
  const raw = str(text);
  if (!raw) return false;
  const t = raw.replace(/\bUNCLASSIFIED\b/gi, " ");
  if (/\bTOP\s*SECRET\b/i.test(t)) return true;
  if (/\bTS\/\//i.test(t)) return true;
  if (/\bSECRET\b/i.test(t)) return true;
  if (/\bCONFIDENTIAL\b/i.test(t)) return true;
  if (/\bCLASSIFIED\b/i.test(t)) return true;
  return false;
}

export function classifiedParseError(kind = "") {
  return {
    ok: false,
    mode: "parse",
    kind: kind || null,
    artifactType: kind || "",
    errorClass: "ClassifiedIngestRejected",
    reason: "classified-marking",
    rows: [],
  };
}

function tagByName(xml, name) {
  const re = new RegExp(`<tag\\b[^>]*name="${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>([\\s\\S]*?)</tag>`, "i");
  const m = xml.match(re);
  return m ? decodeXml(m[1]) : "";
}

function nessusMetadataBlob(xml) {
  const parts = [];
  const policy = xml.match(/<Policy\b[\s\S]*?<\/Policy>/i);
  if (policy) {
    const name = policy[0].match(/<policyName>([\s\S]*?)<\/policyName>/i);
    if (name) parts.push(decodeXml(name[1]));
    const comments = policy[0].match(/<(?:policyComments|Comments)>([\s\S]*?)<\/(?:policyComments|Comments)>/i);
    if (comments) parts.push(decodeXml(comments[1]));
  }
  const reportOpen = xml.match(/<Report\b([^>]*)>/i);
  if (reportOpen) parts.push(attrs(reportOpen[1]).name || "");
  const props = xml.matchAll(/<HostProperties>([\s\S]*?)<\/HostProperties>/gi);
  for (const block of props) {
    const tags = block[1].matchAll(/<tag\b([^>]*)>([\s\S]*?)<\/tag>/gi);
    for (const tag of tags) {
      const name = key(attrs(tag[1]).name);
      if (name.includes("classif") || name.includes("marking") || name === "security") {
        parts.push(decodeXml(tag[2]));
      }
    }
  }
  const header = xml.replace(/<ReportItem\b[\s\S]*$/i, "").slice(0, 16000);
  const classAttrs = header.matchAll(/\bclassification\s*=\s*"([^"]*)"/gi);
  for (const m of classAttrs) parts.push(decodeXml(m[1]));
  return parts.join("\n");
}

function complianceStatus(itemXml) {
  const m = itemXml.match(/<([\w:]*compliance-result)>([\s\S]*?)<\/\1>/i) || itemXml.match(/compliance-result["'\s>]+([^<]*)/i);
  if (!m) return "";
  return normalizeFindingStatus(m[2] || m[1]);
}

function parseNessusHosts(xml) {
  const hosts = [];
  const re = /<ReportHost\b([^>]*)>([\s\S]*?)<\/ReportHost>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const a = attrs(m[1]);
    const body = m[2];
    const hostName = a.name || tagByName(body, "host-fqdn") || tagByName(body, "netbios-name") || "";
    const items = [];
    const itemRe = /<ReportItem\b([^>]*)>([\s\S]*?)<\/ReportItem>/gi;
    let im;
    while ((im = itemRe.exec(body))) {
      items.push({ open: im[1], body: im[2] });
    }
    hosts.push({ hostName, body, items });
  }
  return hosts;
}

export function parseNessusXml(xmlText) {
  const xml = str(xmlText);
  if (!/NessusClientData/i.test(xml) && !/<ReportHost\b/i.test(xml)) {
    return {
      ok: false,
      mode: "parse",
      kind: "nessus",
      artifactType: "nessus",
      errorClass: "InvalidScanFormat",
      reason: "not-nessus-xml",
      rows: [],
    };
  }
  if (hasClassifiedMarking(nessusMetadataBlob(xml))) {
    return classifiedParseError("nessus");
  }
  const rows = [];
  for (const host of parseNessusHosts(xml)) {
    for (const item of host.items) {
      const a = attrs(item.open);
      const severity = normalizeSeverity(a.severity || "") || normalizeSeverity(decodeXml((item.body.match(/<risk_factor>([\s\S]*?)<\/risk_factor>/i) || [])[1] || ""));
      const pluginId = str(a.pluginID || a.pluginId);
      const title = str(a.pluginName);
      const status = complianceStatus(item.body) || normalizeFindingStatus("", severity);
      rows.push(
        normalizeScanFinding(
          {
            id: "",
            hostName: host.hostName,
            pluginId,
            ruleId: "",
            severity,
            status,
            stigFamily: "",
            title,
            sourceType: "nessus",
            cciIds: collectCciIdsFromNessusItem(item.body),
          },
          rows.length,
        ),
      );
    }
  }
  for (const row of rows) row.id = "";
  return {
    ok: true,
    mode: "parse",
    kind: "nessus",
    artifactType: "nessus",
    errorClass: null,
    reason: null,
    rows,
  };
}

function cklbMetadataBlob(obj) {
  const parts = [];
  const keys = ["classification", "marking", "security_classification", "securityClassification", "class"];
  for (const k of keys) {
    if (obj && obj[k] != null) parts.push(String(obj[k]));
  }
  if (obj && obj.title != null) parts.push(String(obj.title));
  const td = (obj && (obj.target_data || obj.targetData)) || {};
  for (const k of keys) {
    if (td[k] != null) parts.push(String(td[k]));
  }
  return parts.join("\n");
}

function collectCklbRules(stig) {
  if (!stig || typeof stig !== "object") return [];
  if (Array.isArray(stig.rules)) return stig.rules;
  const out = [];
  for (const group of Array.isArray(stig.groups) ? stig.groups : []) {
    if (Array.isArray(group?.rules)) out.push(...group.rules);
    else if (group && typeof group === "object") out.push(group);
  }
  return out;
}

function looksLikeCklb(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  if (Array.isArray(obj.stigs) || Array.isArray(obj.benchmarks)) return true;
  if (obj.cklb && typeof obj.cklb === "object") return true;
  if (obj.target_data || obj.targetData) return true;
  return false;
}

export function parseCklbJson(input) {
  let obj = input;
  if (typeof input === "string" || Buffer.isBuffer(input)) {
    try {
      obj = JSON.parse(Buffer.isBuffer(input) ? input.toString("utf8") : input);
    } catch {
      return {
        ok: false,
        mode: "parse",
        kind: "cklb",
        artifactType: "cklb",
        errorClass: "InvalidScanFormat",
        reason: "cklb-not-json",
        rows: [],
      };
    }
  }
  if (!looksLikeCklb(obj)) {
    return {
      ok: false,
      mode: "parse",
      kind: "cklb",
      artifactType: "cklb",
      errorClass: "InvalidScanFormat",
      reason: "not-cklb-json",
      rows: [],
    };
  }
  if (obj.cklb && typeof obj.cklb === "object" && !Array.isArray(obj.stigs)) {
    obj = { ...obj.cklb, ...obj };
  }
  if (hasClassifiedMarking(cklbMetadataBlob(obj))) {
    return classifiedParseError("cklb");
  }
  const target = obj.target_data || obj.targetData || {};
  const hostName = str(target.host_name || target.hostName || target.hostname || obj.host_name);
  const assetName = str(target.asset_name || target.assetName);
  const stigs = Array.isArray(obj.stigs) ? obj.stigs : Array.isArray(obj.benchmarks) ? obj.benchmarks : [];
  const rows = [];
  for (const stig of stigs) {
    const family = inferStigFamilyFromText(
      [stig?.stig_name, stig?.stigName, stig?.display_name, stig?.title, stig?.stig_id].filter(Boolean).join(" "),
    );
    for (const rule of collectCklbRules(stig)) {
      const pluginId = str(rule.rule_id || rule.ruleId || rule.group_id || rule.groupId);
      rows.push(
        normalizeScanFinding(
          {
            id: "",
            hostName: hostName || assetName,
            pluginId,
            ruleId: str(rule.rule_id || rule.ruleId || rule.group_id || rule.groupId),
            severity: rule.severity,
            status: rule.status,
            stigFamily: family,
            title: str(rule.rule_title || rule.ruleTitle || rule.group_title || rule.groupTitle),
            sourceType: "cklb",
            cciIds: collectCciIdsFromCklbRule(rule),
          },
          rows.length,
        ),
      );
    }
  }
  for (const row of rows) row.id = "";
  return {
    ok: true,
    mode: "parse",
    kind: "cklb",
    artifactType: "cklb",
    errorClass: null,
    reason: null,
    rows,
  };
}

export function parseScanBuffer(buffer, options = {}) {
  const filename = str(options.filename);
  const ext = filename.toLowerCase().includes(".cklb")
    ? ".cklb"
    : filename.toLowerCase().includes(".nessus")
      ? ".nessus"
      : str(options.ext).toLowerCase();
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  if (ext === ".cklb") return parseCklbJson(buf.toString("utf8"));
  return parseNessusXml(buf.toString("utf8"));
}

export { FINDING_FIELDS };

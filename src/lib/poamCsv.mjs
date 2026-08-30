/** POA&M CSV working paper. Existing eMASS-oriented columns only. Never invent identifiers. */

export const TBD_EMASS = "TBD-eMASS";

export const POAM_STATUSES = Object.freeze(["open", "ongoing", "risk-accepted", "completed", "canceled"]);
export const POAM_RISKS = Object.freeze(["Very High", "High", "Moderate", "Low", "Very Low"]);

function str(value) {
  return value == null ? "" : String(value);
}

function csvEscape(value) {
  const text = str(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Existing Export-page columns. Do not add Weakness Identifier / Raw Risk / Mitigations / Security Checks. */
export const POAM_CSV_COLUMNS = [
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
];

/** Header → existing PoamItem field. Aliases are the same columns under typical spacing, not new eMASS vocabulary. */
export const POAM_COLUMN_MAP = Object.freeze([
  { header: "eMASS_POAM_ID", field: "emassPoamId", aliases: ["eMASS POAM ID", "EMASS_POAM_ID", "EMASS POAM ID"] },
  { header: "Control", field: "controlId", aliases: ["Control ID", "ControlID"] },
  { header: "Weakness", field: "weakness", aliases: [] },
  { header: "Description", field: "description", aliases: [] },
  { header: "Source", field: "source", aliases: [] },
  { header: "Status", field: "status", aliases: [] },
  { header: "Risk", field: "risk", aliases: [] },
  { header: "Residual_Risk", field: "residualRisk", aliases: ["Residual Risk", "ResidualRisk"] },
  { header: "Resources", field: "resources", aliases: [] },
  { header: "Scheduled_Completion", field: "scheduledCompletion", aliases: ["Scheduled Completion", "ScheduledCompletion"] },
  { header: "Milestones", field: "milestones", aliases: [] },
  { header: "POC", field: "poc", aliases: [] },
  { header: "ATO_Blocker", field: "atoBlocker", aliases: ["ATO Blocker", "ATOBlocker"] },
  { header: "Comments", field: "comments", aliases: [] },
]);

export function poamCsv(pkg) {
  const rows = Array.isArray(pkg?.poams) ? pkg.poams : [];
  const lines = rows.map((p) =>
    [
      p?.emassPoamId,
      p?.controlId,
      p?.weakness,
      p?.description,
      p?.source,
      p?.status,
      p?.risk,
      p?.residualRisk,
      p?.resources,
      p?.scheduledCompletion,
      p?.milestones,
      p?.poc,
      p?.atoBlocker ? "Y" : "N",
      p?.comments,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [POAM_CSV_COLUMNS.join(","), ...lines].join("\n");
}

export function emptyPoam(id = "") {
  return {
    id,
    emassPoamId: TBD_EMASS,
    controlId: "",
    weakness: "",
    description: "",
    source: "",
    status: "",
    risk: "",
    residualRisk: "",
    resources: "",
    scheduledCompletion: "",
    milestones: "",
    poc: "",
    comments: "",
    atoBlocker: false,
  };
}

export function isBlankEmassPoamId(value) {
  const v = str(value).trim();
  return v === "" || v.toUpperCase() === "TBD-EMASS";
}

export function resolveEmassPoamId(value) {
  const v = str(value).trim();
  if (isBlankEmassPoamId(v)) return TBD_EMASS;
  return v;
}

/** Trim / uppercase / strip interior spaces. Does not mint an id that is not in the incoming string. */
export function normalizeControlId(value) {
  return str(value).trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizePoamStatus(value) {
  const raw = str(value).trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
  if (key === "open") return "open";
  if (key === "ongoing") return "ongoing";
  if (key === "risk-accepted" || key === "risk accepted") return "risk-accepted";
  if (key === "completed") return "completed";
  if (key === "canceled" || key === "cancelled") return "canceled";
  return raw;
}

export function normalizePoamRisk(value) {
  const raw = str(value).trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
  if (key === "very high") return "Very High";
  if (key === "high") return "High";
  if (key === "moderate") return "Moderate";
  if (key === "low") return "Low";
  if (key === "very low") return "Very Low";
  return raw;
}

export function parseAtoBlocker(value) {
  const v = str(value).trim().toLowerCase();
  return v === "y" || v === "yes" || v === "true" || v === "1" || v === "blocker";
}

export function isRecognizedPoamStatus(value) {
  const v = str(value).trim();
  return v === "" || POAM_STATUSES.includes(v);
}

export function isRecognizedPoamRisk(value) {
  const v = str(value).trim();
  return v === "" || POAM_RISKS.includes(v);
}

export function normalizePoam(row, index = 0) {
  const fallbackId = `poam-${index + 1}`;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return emptyPoam(fallbackId);
  }
  return {
    id: str(row.id) || fallbackId,
    emassPoamId: resolveEmassPoamId(row.emassPoamId),
    controlId: normalizeControlId(row.controlId),
    weakness: str(row.weakness).trim(),
    description: str(row.description).trim(),
    source: str(row.source).trim(),
    status: normalizePoamStatus(row.status),
    risk: normalizePoamRisk(row.risk),
    residualRisk: normalizePoamRisk(row.residualRisk),
    resources: str(row.resources).trim(),
    scheduledCompletion: str(row.scheduledCompletion).trim(),
    milestones: str(row.milestones).trim(),
    poc: str(row.poc).trim(),
    comments: str(row.comments).trim(),
    atoBlocker: row.atoBlocker === true || row.atoBlocker === "true" || parseAtoBlocker(row.atoBlocker),
  };
}

function normHeader(value) {
  return str(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function poamAliasIndex() {
  const index = new Map();
  for (const col of POAM_COLUMN_MAP) {
    for (const alias of [col.header, ...(col.aliases || [])]) {
      const key = normHeader(alias);
      if (key && !index.has(key)) index.set(key, col.field);
    }
  }
  return index;
}

export function looksLikePoamHeaders(headers) {
  const set = new Set((headers || []).map(normHeader));
  let hits = 0;
  for (const hint of ["emass_poam_id", "emass poam id", "weakness", "scheduled_completion", "scheduled completion", "ato_blocker", "residual_risk", "residual risk"]) {
    if (set.has(hint)) hits += 1;
  }
  if (hits >= 2) return true;
  return (headers || []).some((h) => /poam/i.test(str(h)));
}

export function mapPoamRow(headers, cells) {
  const index = poamAliasIndex();
  const fields = {};
  (headers || []).forEach((header, i) => {
    const field = index.get(normHeader(header));
    if (!field) return;
    const value = str(cells?.[i]).trim();
    if (!Object.hasOwn(fields, field) || fields[field] === "") fields[field] = value;
  });
  const row = normalizePoam({ ...emptyPoam(""), ...fields, id: "" }, 0);
  row.id = "";
  if (Object.hasOwn(fields, "atoBlocker")) {
    row.atoBlocker = parseAtoBlocker(fields.atoBlocker);
  }
  return row;
}

export function parsePoamRecords(headers, records) {
  const rows = (records || []).map((cells) => mapPoamRow(headers, cells));
  return { ok: true, kind: "poam", artifactType: "poam", errorClass: null, reason: null, rows };
}

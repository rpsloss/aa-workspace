/** CM-8 HW/SW inventory. Joint eMASS-oriented CSV. Never log package contents. */

export const SCHEMA_VERSION = 5;

/** Workspace-only key for list edit. Not an eMASS CSV column. */
export const HW_CSV_COLUMNS = [
  "Asset Name",
  "Asset Type",
  "Manufacturer",
  "Model",
  "Serial Number",
  "Host Name",
  "IP Address",
  "MAC Address",
  "OS/Firmware",
  "Location",
];

export const SW_CSV_COLUMNS = [
  "Software Name",
  "Vendor",
  "Version",
  "License",
  "Related Asset/Host",
];

export function emptyAsset(id = "") {
  return {
    id,
    assetName: "",
    assetType: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    hostName: "",
    ipAddress: "",
    macAddress: "",
    osFirmware: "",
    location: "",
    notes: "",
  };
}

export function emptySoftware(id = "") {
  return {
    id,
    name: "",
    vendor: "",
    version: "",
    license: "",
    relatedAsset: "",
  };
}

const HW_FIELDS = [
  "id",
  "assetName",
  "assetType",
  "manufacturer",
  "model",
  "serialNumber",
  "hostName",
  "ipAddress",
  "macAddress",
  "osFirmware",
  "location",
  "notes",
];

const SW_FIELDS = ["id", "name", "vendor", "version", "license", "relatedAsset"];

function str(value) {
  return value == null ? "" : String(value);
}

export function asList(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeAsset(row, index = 0) {
  const fallbackId = `asset-${index + 1}`;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return emptyAsset(fallbackId);
  }
  const next = { ...row };
  for (const key of HW_FIELDS) {
    next[key] = key === "id" ? str(row.id) || fallbackId : str(row[key]);
  }
  return next;
}

export function normalizeSoftware(row, index = 0) {
  const fallbackId = `software-${index + 1}`;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return emptySoftware(fallbackId);
  }
  const next = { ...row };
  for (const key of SW_FIELDS) {
    next[key] = key === "id" ? str(row.id) || fallbackId : str(row[key]);
  }
  return next;
}

/**
 * Normalizes assets/software. Missing/non-array become [].
 * Stamps SCHEMA_VERSION (5 as of F4). Does not drop unrelated package fields.
 */
export function ensureInventory(pkg) {
  if (pkg === null || pkg === undefined) return pkg;
  if (typeof pkg !== "object" || Array.isArray(pkg)) return pkg;
  return {
    ...pkg,
    schemaVersion: SCHEMA_VERSION,
    assets: asList(pkg.assets).map((row, i) => normalizeAsset(row, i)),
    software: asList(pkg.software).map((row, i) => normalizeSoftware(row, i)),
  };
}

const SLDSS_LOCATION = "Fort Example, VA \u2014 Building 410 data hall";

function asset(partial, index) {
  return normalizeAsset({ ...emptyAsset(partial.id), ...partial }, index);
}

/**
 * Eight SLDSS hosts from ssp.hardwareSoftware qty counts.
 * No DNS host names exist in the sample narrative; Host Name stays blank.
 * F5/proxy pair is GSS-managed inherited and is not seeded here.
 * VPN concentrator is not a 9th host (F2 interconnect).
 * Jump hosts: eMASS Asset Type = Server; "Jump host" lives in notes.
 */
export function seedSldssAssets() {
  const location = SLDSS_LOCATION;
  return [
    asset(
      {
        id: "sldss-hw-app-1",
        assetName: "RHEL 8 application VM 1",
        assetType: "Virtual Machine",
        osFirmware: "RHEL 8",
        location,
      },
      0,
    ),
    asset(
      {
        id: "sldss-hw-app-2",
        assetName: "RHEL 8 application VM 2",
        assetType: "Virtual Machine",
        osFirmware: "RHEL 8",
        location,
      },
      1,
    ),
    asset(
      {
        id: "sldss-hw-app-3",
        assetName: "RHEL 8 application VM 3",
        assetType: "Virtual Machine",
        osFirmware: "RHEL 8",
        location,
      },
      2,
    ),
    asset(
      {
        id: "sldss-hw-app-4",
        assetName: "RHEL 8 application VM 4",
        assetType: "Virtual Machine",
        osFirmware: "RHEL 8",
        location,
      },
      3,
    ),
    asset(
      {
        id: "sldss-hw-db-1",
        assetName: "PostgreSQL VM 1",
        assetType: "Virtual Machine",
        osFirmware: "",
        location,
      },
      4,
    ),
    asset(
      {
        id: "sldss-hw-db-2",
        assetName: "PostgreSQL VM 2",
        assetType: "Virtual Machine",
        osFirmware: "",
        location,
      },
      5,
    ),
    asset(
      {
        id: "sldss-hw-jump-1",
        assetName: "Windows Server jump host 1",
        assetType: "Server",
        osFirmware: "Windows Server",
        location,
        notes: "Jump host",
      },
      6,
    ),
    asset(
      {
        id: "sldss-hw-jump-2",
        assetName: "Windows Server jump host 2",
        assetType: "Server",
        osFirmware: "Windows Server",
        location,
        notes: "Jump host",
      },
      7,
    ),
  ];
}

export function seedSldssSoftware() {
  const appHosts = [
    "RHEL 8 application VM 1",
    "RHEL 8 application VM 2",
    "RHEL 8 application VM 3",
    "RHEL 8 application VM 4",
  ].join("; ");
  const dbHosts = ["PostgreSQL VM 1", "PostgreSQL VM 2"].join("; ");
  return [
    normalizeSoftware(
      {
        id: "sldss-sw-app",
        name: "SLDSS app",
        vendor: "",
        version: "2.1",
        license: "",
        relatedAsset: appHosts,
      },
      0,
    ),
    normalizeSoftware(
      {
        id: "sldss-sw-pg",
        name: "PostgreSQL",
        vendor: "",
        version: "15",
        license: "",
        relatedAsset: dbHosts,
      },
      1,
    ),
    normalizeSoftware(
      {
        id: "sldss-sw-siem",
        name: "native SIEM forwarders",
        vendor: "",
        version: "",
        license: "",
        relatedAsset: "",
      },
      2,
    ),
  ];
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function hardwareCsv(assets) {
  const lines = asList(assets).map((row) => {
    const item = normalizeAsset(row);
    return [
      item.assetName,
      item.assetType,
      item.manufacturer,
      item.model,
      item.serialNumber,
      item.hostName,
      item.ipAddress,
      item.macAddress,
      item.osFirmware,
      item.location,
    ]
      .map(csvEscape)
      .join(",");
  });
  return [HW_CSV_COLUMNS.join(","), ...lines].join("\n");
}

export function softwareCsv(software) {
  const lines = asList(software).map((row) => {
    const item = normalizeSoftware(row);
    return [item.name, item.vendor, item.version, item.license, item.relatedAsset].map(csvEscape).join(",");
  });
  return [SW_CSV_COLUMNS.join(","), ...lines].join("\n");
}

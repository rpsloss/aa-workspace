import type { StigProductFamily } from "../../types";

export type ScanSourceType = "nessus" | "cklb";
export type ScanFindingStatus = "open" | "not-a-finding" | "not-applicable" | "not-reviewed" | "informational" | string;

export type ScanFinding = {
  id: string;
  assetId: string;
  unmatchedHost: string;
  hostName: string;
  pluginId: string;
  ruleId: string;
  severity: string;
  status: ScanFindingStatus;
  stigFamily: StigProductFamily | "";
  title: string;
  sourceType: ScanSourceType | "";
  inheritedGss: boolean;
  cciIds?: string[];
  cciAdvisory?: string;
};

export const SCAN_SOURCE_TYPES: readonly ScanSourceType[];
export const SCAN_STATUSES: readonly string[];
export const FINDING_FIELDS: readonly string[];

export function emptyScanFinding(id?: string): ScanFinding;
export function extractCciIdsFromText(value: unknown): string[];
export function normalizeCciIds(value: unknown): string[];
export function cciAdvisoryFromIds(ids: unknown): string;
export function cciAdvisoryDisplay(row: unknown): string;
export function collectCciIdsFromCklbRule(rule: unknown): string[];
export function collectCciIdsFromNessusItem(itemXml: unknown): string[];
export function normalizeSeverity(value: unknown): string;
export function normalizeFindingStatus(value: unknown, severity?: string): string;
export function inferStigFamilyFromText(text: unknown): StigProductFamily | "";
export function normalizeScanFinding(row: unknown, index?: number): ScanFinding;
export function normalizeScanFindings(list: unknown): ScanFinding[];
export function ensureScanFindings<T>(pkg: T): T & { scanFindings: ScanFinding[] };
export function hasClassifiedMarking(text: unknown): boolean;
export function classifiedParseError(kind?: string): {
  ok: false;
  mode: "parse";
  kind: string | null;
  artifactType: string;
  errorClass: "ClassifiedIngestRejected";
  reason: "classified-marking";
  rows: [];
};
export function parseNessusXml(xmlText: string): {
  ok: boolean;
  mode: "parse";
  kind: "nessus" | null;
  artifactType: string;
  errorClass: string | null;
  reason: string | null;
  rows: ScanFinding[];
};
export function parseCklbJson(input: string | Buffer | object): {
  ok: boolean;
  mode: "parse";
  kind: "cklb" | null;
  artifactType: string;
  errorClass: string | null;
  reason: string | null;
  rows: ScanFinding[];
};
export function parseScanBuffer(buffer: Buffer | string, options?: { filename?: string; ext?: string }): {
  ok: boolean;
  mode: "parse";
  kind: "nessus" | "cklb" | null;
  artifactType: string;
  errorClass: string | null;
  reason: string | null;
  rows: ScanFinding[];
};

import type { AaPackage, PoamItem, PoamRisk, PoamStatus } from "../types";

export const TBD_EMASS: "TBD-eMASS";
export const POAM_STATUSES: readonly PoamStatus[];
export const POAM_RISKS: readonly PoamRisk[];
export const POAM_CSV_COLUMNS: readonly string[];
export const POAM_COLUMN_MAP: readonly { header: string; field: string; aliases: readonly string[] }[];

export function poamCsv(pkg: Pick<AaPackage, "poams"> | { poams?: PoamItem[] | unknown } | null | undefined): string;
export function emptyPoam(id?: string): PoamItem;
export function isBlankEmassPoamId(value: unknown): boolean;
export function resolveEmassPoamId(value: unknown): string;
export function normalizeControlId(value: unknown): string;
export function normalizePoamStatus(value: unknown): string;
export function normalizePoamRisk(value: unknown): string;
export function parseAtoBlocker(value: unknown): boolean;
export function isRecognizedPoamStatus(value: unknown): boolean;
export function isRecognizedPoamRisk(value: unknown): boolean;
export function normalizePoam(row: unknown, index?: number): PoamItem;
export function looksLikePoamHeaders(headers: string[] | null | undefined): boolean;
export function mapPoamRow(headers: string[], cells: string[]): PoamItem;
export function parsePoamRecords(headers: string[], records: string[][]): {
  ok: boolean;
  kind: "poam";
  artifactType: "poam";
  errorClass: string | null;
  reason: string | null;
  rows: PoamItem[];
};

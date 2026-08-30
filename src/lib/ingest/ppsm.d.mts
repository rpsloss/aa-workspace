import type { DataFlow } from "../../types";

export function ppsmMappingPath(): string;
export function loadPpsmMap(): {
  format: string;
  disclaimer: string;
  artifactType: string;
  handling: string;
  target: string;
  matchPreference: string[];
  columns: { header: string; field: string; aliases: string[] }[];
};
export function ppsmHeaders(): string[];
export function looksLikePpsm(headers: string[] | null | undefined): boolean;
export function mapPpsmFields(fields: { source?: string; destination?: string; protocol?: string; port?: string; description?: string } | null | undefined): DataFlow;
export function mapPpsmRow(headers: string[], cells: string[], map?: ReturnType<typeof loadPpsmMap>): DataFlow;
export function parsePpsmRecords(headers: string[], records: string[][], map?: ReturnType<typeof loadPpsmMap>): {
  ok: boolean;
  kind: "ppsm";
  artifactType: "ppsm";
  errorClass: string | null;
  reason: string | null;
  rows: DataFlow[];
};

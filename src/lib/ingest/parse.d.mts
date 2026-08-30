import type { Asset, DataFlow, PoamItem, SoftwareItem } from "../../types";
import type { ScanFinding } from "./scan.d.mts";

export type IngestKind = "hardware" | "software" | "poam" | "ppsm" | "nessus" | "cklb";

export function mappingPath(): string;
export function loadJointMap(): {
  format: string;
  disclaimer: string;
  hardware: {
    artifactType: string;
    handling: string;
    matchPreference: string[];
    jumpHost: { incomingAssetType: string; mappedAssetType: string; notesValue: string };
    columns: { header: string; field: string; aliases: string[] }[];
  };
  software: {
    artifactType: string;
    handling: string;
    matchPreference: string[];
    columns: { header: string; field: string; aliases: string[] }[];
  };
};
export function mappingHeaders(kind: "hardware" | "software"): string[];
export function parseCsv(text: string): string[][];
export function detectKind(headers: string[], map?: ReturnType<typeof loadJointMap>): { kind: IngestKind | null; reason: string | null };
export function kindFromArtifactType(value: string | undefined | null): IngestKind | null;
export function artifactTypeFromKind(kind: string | null | undefined): string;
export function isScanKind(kind: string | null | undefined): boolean;
export function classifyIngestFile(filename: string, buffer?: Buffer | null): { mode: "parse" | "store-only" | "unsupported"; reason: string | null; ext: string };
export function isScanParseFile(filename: string, buffer?: Buffer | null): boolean;
export function parseIngestBuffer(buffer: Buffer | string, options?: { filename?: string; kind?: string; artifactType?: string; map?: ReturnType<typeof loadJointMap> }): {
  ok: boolean;
  mode: "parse" | "store-only" | "unsupported";
  kind: IngestKind | null;
  artifactType: string;
  errorClass: string | null;
  reason: string | null;
  rows: Array<Asset | SoftwareItem | PoamItem | DataFlow | ScanFinding>;
};

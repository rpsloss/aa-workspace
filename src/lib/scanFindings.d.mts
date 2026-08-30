import type { Asset } from "../types";
import type { ScanFinding } from "./ingest/scan.d.mts";

export { ensureScanFindings, normalizeScanFinding, normalizeScanFindings, emptyScanFinding } from "./ingest/scan.d.mts";
export type { ScanFinding };

export function matchHostToAssets(
  assets: unknown,
  hostName?: string,
  assetName?: string,
): { matches: Asset[]; reason: "ambiguous-match" | "unmatched-host" | null };

export function gssConflictForHost(hostName?: string, assetName?: string): { conflict: boolean; reason: string };

export function previewScanMerge(
  existingFindings: unknown,
  incomingRows: unknown,
  assets: unknown,
  stigAssignments?: unknown,
): {
  kind: "scan";
  items: Array<{
    status: "add" | "update" | "unchanged" | "conflict";
    reason: string;
    index: number;
    incoming: ScanFinding;
    existingId: string;
    proposed: ScanFinding;
    fields: string[];
  }>;
  counts: { add: number; update: number; unchanged: number; conflict: number };
};

export function applyScanMerge(
  existingFindings: unknown,
  incomingRows: unknown,
  assets: unknown,
  stigAssignments?: unknown,
  options?: {
    strategy?: "merge" | "replace";
    mergeMode?: "merge" | "replace";
    includeInheritedGss?: boolean;
    confirmInheritedGss?: boolean;
    confirmConflicts?: boolean;
  },
): {
  ok: boolean;
  kind: "scan";
  strategy: "merge" | "replace";
  mergeMode: "merge" | "replace";
  rows: ScanFinding[];
  preview: ReturnType<typeof previewScanMerge>;
  applied: { added: number; updated: number; unchanged: number; skipped: number };
};

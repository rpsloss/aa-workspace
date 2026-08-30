import type { PoamItem } from "../types";
import type { ScanFinding } from "./ingest/scan.d.mts";

export function isOpenFinding(finding: unknown): boolean;
export function draftPoamFromOpenFinding(finding: unknown, index?: number): PoamItem;
export function previewPoamSeedFromFindings(
  existingPoams: unknown,
  findings: unknown,
  options?: { catalogIds?: Iterable<string> | Set<string> },
): {
  kind: "poam-seed";
  items: Array<{
    status: "add" | "update" | "unchanged" | "conflict";
    reason: string;
    index: number;
    incoming: PoamItem;
    existingId: string;
    proposed: PoamItem;
    fields: string[];
  }>;
  counts: { add: number; update: number; unchanged: number; conflict: number };
};
export function applyPoamSeedFromFindings(
  existingPoams: unknown,
  findings: unknown,
  options?: {
    strategy?: "merge" | "replace";
    mergeMode?: "merge" | "replace";
    confirmConflicts?: boolean;
    catalogIds?: Iterable<string> | Set<string>;
  },
): {
  ok: boolean;
  kind: "poam-seed";
  strategy: "merge" | "replace";
  mergeMode: "merge" | "replace";
  rows: PoamItem[];
  preview: ReturnType<typeof previewPoamSeedFromFindings>;
  applied: { added: number; updated: number; unchanged: number; skipped: number };
};
export type { ScanFinding };

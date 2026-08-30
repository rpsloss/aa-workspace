import type { Asset, DataFlow, PoamItem, SoftwareItem } from "../../types";

export type MergeStatus = "add" | "update" | "unchanged" | "conflict";
export type MergeKind = "hardware" | "software" | "poam" | "ppsm";
export type MergeItem = {
  status: MergeStatus;
  reason: string;
  index: number;
  incoming: Asset | SoftwareItem | PoamItem | DataFlow;
  existingId: string;
  proposed: Asset | SoftwareItem | PoamItem | DataFlow;
  fields: string[];
};

export function isInheritedGssConflict(row: Partial<Asset> | Partial<SoftwareItem> | null | undefined): { conflict: boolean; reason: string };
export function isInheritedGssHardwareConflict(row: Partial<Asset> | null | undefined): { conflict: boolean; reason: string };
export function previewMerge(kind: MergeKind, existing: unknown, incomingRows: unknown, options?: { catalogIds?: Iterable<string> | Set<string> }): {
  kind: MergeKind;
  items: MergeItem[];
  counts: { add: number; update: number; unchanged: number; conflict: number };
};
export function applyMerge(
  kind: MergeKind,
  existing: unknown,
  incomingRows: unknown,
  options?: {
    strategy?: "merge" | "replace";
    mergeMode?: "merge" | "replace";
    includeInheritedGss?: boolean;
    confirmInheritedGss?: boolean;
    confirmConflicts?: boolean;
    catalogIds?: Iterable<string> | Set<string>;
  },
): {
  ok: boolean;
  kind: MergeKind;
  strategy: "merge" | "replace";
  mergeMode: "merge" | "replace";
  rows: Array<Asset | SoftwareItem | PoamItem | DataFlow>;
  preview: ReturnType<typeof previewMerge>;
  applied: { added: number; updated: number; unchanged: number; skipped: number };
};

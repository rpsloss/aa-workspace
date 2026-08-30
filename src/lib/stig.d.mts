import type { Asset, SoftwareItem, StigAssignment, StigProductFamily, StigTargetKind } from "../types";

export const SCHEMA_VERSION: number;

export const STIG_PRODUCT_FAMILIES: readonly StigProductFamily[];
export const STIG_TARGET_KINDS: readonly StigTargetKind[];
export const STIG_FAMILY_LABELS: Readonly<Record<StigProductFamily, string>>;

export function isStigProductFamily(value: string | undefined | null): value is StigProductFamily;
export function isStigTargetKind(value: string | undefined | null): value is StigTargetKind;
export function emptyStigAssignment(): {
  targetKind: StigTargetKind;
  targetId: string;
  stigProductFamily: string;
  officialId: string;
};
export function normalizeStigAssignment(row: unknown): StigAssignment | null;
export function normalizeStigAssignments(list: unknown): StigAssignment[];
export function ensureStigAssignments<T>(pkg: T): T & { schemaVersion: number; stigAssignments: StigAssignment[] };
export function seedSldssStigAssignments(): StigAssignment[];
export function stigFamilyFor(pkg: { stigAssignments?: unknown } | null | undefined, targetKind: string, targetId: string): StigProductFamily | "";
export function stigOfficialIdFor(pkg: { stigAssignments?: unknown } | null | undefined, targetKind: string, targetId: string): string;
export function unassignedAssets(pkg: { assets?: unknown; stigAssignments?: unknown } | null | undefined): Asset[];
export function softwareStigAssignments(pkg: { software?: unknown; stigAssignments?: unknown } | null | undefined): Array<StigAssignment & { software: SoftwareItem | null }>;
export function upsertStigAssignment(
  list: unknown,
  next?: {
    targetKind?: string;
    targetId?: string;
    stigProductFamily?: string;
    officialId?: string;
  },
): StigAssignment[];

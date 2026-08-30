import type { ControlRecord, InheritanceSource, SelectionStatus } from "../types";

export const SCHEMA_VERSION: number;
export const SELECTION_STATUSES: readonly SelectionStatus[];
export const SLDSS_GSS_SOURCE_ID: string;
export const SLDSS_ICAM_SOURCE_ID: string;
export const SLDSS_COMPONENT_SOURCE_ID: string;
export const SLDSS_GSS_PACKAGE_ID: string;
export const SLDSS_ICAM_PACKAGE_ID: string;
export const SLDSS_COMPONENT_PACKAGE_ID: string;
export const SAMPLE_GSS_SOURCE_ID: string;
export const SAMPLE_ICAM_SOURCE_ID: string;
export const SAMPLE_COMPONENT_SOURCE_ID: string;
export const GSS_SOURCE_ID: string;
export const ICAM_SOURCE_ID: string;
export const COMPONENT_SOURCE_ID: string;
export const GSS_PACKAGE_ID: string;
export const SAMPLE_ICAM_PACKAGE_ID: string;
export const SAMPLE_COMPONENT_PACKAGE_ID: string;
export const SLDSS_ICAM_CONTROL_IDS: readonly string[];
export const SAMPLE_ICAM_INHERITED_IDS: readonly string[];
export const SAMPLE_IA_INHERITED_IDS: readonly string[];
export const ICAM_INHERITED_CONTROL_IDS: readonly string[];

export function isSelectionStatus(value: string | undefined | null): value is SelectionStatus;
export function isInheritedOrHybrid(selection: string | undefined | null): boolean;
export const selectionNeedsSource: typeof isInheritedOrHybrid;
export const needsInheritanceSource: typeof isInheritedOrHybrid;
export function isSampleSource(source: InheritanceSource | { packageId?: string; sample?: boolean } | null | undefined): boolean;
export const sourceIsSample: typeof isSampleSource;
export function emptyInheritanceSource(id?: string): InheritanceSource;
export function normalizeInheritanceSource(row: unknown, index?: number): InheritanceSource;
export function sourceLabel(source: InheritanceSource | null | undefined): string;
export function sourceNarrative(source: InheritanceSource | null | undefined): string;
export function sampleInheritanceSourceId(item: { id?: string; family?: string } | null | undefined, selection: string | undefined | null): string;
export function seedSldssInheritanceSources(): InheritanceSource[];
export function ensureInheritance<T>(pkg: T): T & { schemaVersion: number; inheritanceSources: InheritanceSource[] };
export function migratePackage<T>(pkg: T): T;
export function hydrateOnGet<T>(pkg: T): T;
export function hydrateOnLoad<T>(pkg: T): T;
export function hydrateNeedsPersist(original: object | null | undefined, hydrated: object | null | undefined): boolean;
export const hydrationChanged: typeof hydrateNeedsPersist;
export function findInheritanceSource(pkg: { inheritanceSources?: unknown } | null | undefined, sourceId: string | undefined | null): InheritanceSource | null;
export function sourceIdResolves(pkg: { inheritanceSources?: unknown } | null | undefined, sourceId: string | undefined | null): boolean;
export function controlHasValidInheritanceSource(
  pkg: { inheritanceSources?: unknown } | null | undefined,
  control: Pick<ControlRecord, "selection" | "inheritanceSourceId"> | { selection?: string; inheritanceSourceId?: string } | null | undefined,
): boolean;
export function missingInheritanceSourceControls(pkg: { controls?: unknown; inheritanceSources?: unknown } | null | undefined): ControlRecord[];
export function controlsMissingInheritanceSource(pkg: { controls?: unknown; inheritanceSources?: unknown } | null | undefined): ControlRecord[];
export function inheritanceIssues(pkg: { controls?: unknown; inheritanceSources?: unknown } | null | undefined): string[];
export function validateInheritance(pkg: { controls?: unknown; inheritanceSources?: unknown } | null | undefined): {
  ok: boolean;
  errors: { controlId: string; code: string; message?: string }[];
  errorClass: string | null;
  count: number;
  missingCount: number;
  controlIds: string[];
};
export function validateInheritanceSave(pkg: { controls?: unknown; inheritanceSources?: unknown } | null | undefined): {
  ok: boolean;
  errorClass: string | null;
  invalidCount: number;
  controlIds: string[];
};
export function gatePackageSave(pkg: { controls?: unknown; inheritanceSources?: unknown } | null | undefined): {
  allow: boolean;
  errors: { controlId: string; code: string }[];
  errorClass: string | null;
  count: number;
  missingCount: number;
};
export function rejectIfInvalidInheritance<T>(pkg: T): T;
export function inheritanceSaveError(pkg: { controls?: unknown; inheritanceSources?: unknown } | null | undefined): (Error & { name: string; missingCount: number }) | null;

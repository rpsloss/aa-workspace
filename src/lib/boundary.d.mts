import type { AaPackage, Boundary, BoundaryEntry, DataFlow, EvidenceItem } from "../types";

export const PACKAGE_SCHEMA_VERSION: number;
export const TBD: "TBD";
export const BOUNDARY_TABLE_HEADERS: readonly string[];
export const DATA_FLOW_HEADERS: readonly string[];

export function emptyBoundaryEntry(id?: string): BoundaryEntry;
export function emptyBoundaryRow(id?: string): BoundaryEntry;
export function emptyDataFlow(id?: string): DataFlow;
export function emptyBoundary(): Boundary;
export function normalizeBoundaryEntry(row: unknown, index?: number): BoundaryEntry;
export function normalizeDataFlow(row: unknown, index?: number): DataFlow;
export function ensureBoundary<T>(pkg: T): T & {
  schemaVersion: number;
  boundary: Boundary;
  dataFlows: DataFlow[];
  boundaryDiagramEvidenceId: string;
};
export function migratePackage<T>(pkg: T): T & {
  schemaVersion: number;
  boundary: Boundary;
  dataFlows: DataFlow[];
  boundaryDiagramEvidenceId: string;
};
export function hydrateOnGet<T>(pkg: T): T & {
  schemaVersion: number;
  boundary: Boundary;
  dataFlows: DataFlow[];
  boundaryDiagramEvidenceId: string;
};
export function findDiagramEvidence(pkg: { boundaryDiagramEvidenceId?: string; evidence?: EvidenceItem[] | unknown } | null | undefined): EvidenceItem | null;
export function diagramSlot(pkg: { boundaryDiagramEvidenceId?: string; evidence?: EvidenceItem[] | unknown } | null | undefined): {
  evidenceId: string;
  title: string;
  originalName: string;
  storedName: string;
  hasFile: boolean;
  hasSlot: boolean;
};
export function seedSldssBoundary(): Boundary;
export function seedSldssDataFlows(): DataFlow[];
export function sspBoundaryMarkdown(pkg: Pick<AaPackage, "boundary" | "dataFlows"> | { boundary?: unknown; dataFlows?: unknown } | null | undefined): {
  inbound: string;
  outbound: string;
  interconnect: string;
  dataFlows: string;
};
export function sspDiagramSlotMarkdown(pkg: { boundaryDiagramEvidenceId?: string; evidence?: EvidenceItem[] | unknown } | null | undefined): string;

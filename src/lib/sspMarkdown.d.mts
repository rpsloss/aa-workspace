import type { AaPackage, EvidenceItem } from "../types";

export const TBD: "TBD";

export function sspBoundaryMarkdown(
  pkg: Pick<AaPackage, "boundary" | "dataFlows"> | { boundary?: unknown; dataFlows?: unknown } | null | undefined,
): {
  inbound: string;
  outbound: string;
  interconnect: string;
  dataFlows: string;
};

export function sspDiagramSlotMarkdown(
  pkg: { boundaryDiagramEvidenceId?: string; evidence?: EvidenceItem[] | unknown } | null | undefined,
): string;

export function renderDiagramSection(
  pkg: { boundaryDiagramEvidenceId?: string; evidence?: EvidenceItem[] | unknown } | null | undefined,
): string;

export function sspMarkdown(
  pkg: AaPackage | Record<string, unknown>,
  catalogOrOptions?: Record<string, { title?: string }> | { titleFor?: (id: string) => string },
): string;

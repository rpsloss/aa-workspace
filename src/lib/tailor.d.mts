import type { AaPackage, ControlRecord, Intake } from "../types";

export type CatalogItem = {
  id: string;
  title?: string;
  overlays: string[];
  policyControl?: boolean;
};

export function overlayFlags(intake: Intake): string[];

export function isControlSelected(
  intake: Pick<Intake, "overlayNistModerate" | "overlayCnssi1253" | "overlayDodRmf" | "overlayPrivacy">,
  overlays: string[],
): boolean;

export function patchControl(pkg: AaPackage, id: string, partial: Partial<ControlRecord>): AaPackage;

export function retargetControls(pkg: AaPackage, catalog: CatalogItem[]): AaPackage;

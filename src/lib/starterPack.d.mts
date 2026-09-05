import type { AaPackage, ImpactLevel, StigProductFamily } from "../types";

export type DesignComponent = {
  id: string;
  name: string;
  os: string;
  apps: string;
  notes: string;
};

export type DesignInterface = {
  id: string;
  name: string;
  port: string;
  protocol: string;
  direction: "inbound" | "outbound" | "bidirectional" | "internal";
  source: string;
  destination: string;
  notes: string;
};

export type DesignExtract = {
  dataTypes: string;
  components: DesignComponent[];
  interfaces: DesignInterface[];
  confidentiality: ImpactLevel;
  integrity: ImpactLevel;
  availability: ImpactLevel;
  notes: string;
  generatedAt: string;
};

export type StarterPackChecklistItem = {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  href: string;
};

export type StarterPackChecklist = {
  items: StarterPackChecklistItem[];
  done: number;
  total: number;
  percent: number;
};

export const DESIGN_ARTIFACT_TYPES: readonly string[];
export const IMPACT_LEVELS: readonly ImpactLevel[];
export const INTERFACE_DIRECTIONS: readonly string[];

export function emptyDesignComponent(id?: string): DesignComponent;
export function emptyDesignInterface(id?: string): DesignInterface;
export function emptyDesignExtract(): DesignExtract;
export function normalizeDesignExtract(raw: unknown): DesignExtract;
export function ensureDesignExtract<T>(pkg: T): T & { designExtract: DesignExtract };
export function isDesignArtifactType(value: string | undefined | null): boolean;
export function designArtifacts(pkg: unknown): import("../types").StoredArtifact[];
export function guessStigFamily(text: string | undefined | null): StigProductFamily | "";
export function applyStarterPack(
  pkg: AaPackage | Record<string, unknown>,
  extract: DesignExtract | unknown,
  options?: { catalog?: Array<{ id: string; title?: string; overlays: string[]; policyControl?: boolean }>; merge?: boolean },
): AaPackage;
export function starterPackChecklist(pkg: unknown): StarterPackChecklist;
export function starterPackCsv(pkg: unknown): string;
export function starterPackMarkdown(pkg: unknown): string;
export function sampleSldssDesignExtract(): DesignExtract;

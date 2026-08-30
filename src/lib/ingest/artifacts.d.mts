import type { JointArtifactType, StoredArtifact, ArtifactMode } from "../../types";

export const PARSE_TYPES: readonly JointArtifactType[];
export const STORE_ONLY_TYPES: readonly JointArtifactType[];
export const JOINT_ARTIFACT_TYPES: readonly JointArtifactType[];
export const NOT_THIS_PASS: readonly string[];
export function isJointArtifactType(value: string | undefined | null): value is JointArtifactType;
export function isStoreOnlyType(value: string | undefined | null): value is JointArtifactType;
export function isParseType(value: string | undefined | null): boolean;
export function allowsStoreOnly(value: string | undefined | null): boolean;
export function modeForType(artifactType: string | undefined | null): ArtifactMode;
export function emptyArtifact(id?: string): StoredArtifact;
export function normalizeArtifact(row: unknown, index?: number): StoredArtifact;
export function ensureArtifacts<T>(pkg: T): T & { artifacts: StoredArtifact[] };
export function artifactTypeForKind(kind: string | null | undefined): JointArtifactType | null;
export function kindForArtifactType(artifactType: string | null | undefined): "hardware" | "software" | "poam" | "ppsm" | null;

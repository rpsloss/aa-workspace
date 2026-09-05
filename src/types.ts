export type ImpactLevel = "Low" | "Moderate" | "High";

export type AuthorizationType = "ATO" | "IATT" | "IATO" | "ATO-C" | "Denial";

export type RmfStep =
  | "Categorize"
  | "Select"
  | "Implement"
  | "Assess"
  | "Authorize"
  | "Monitor";

export type SelectionStatus = "in-scope" | "inherited" | "hybrid" | "not-applicable" | "tailored-out";

export type ImplementationStatus =
  | "implemented"
  | "partial"
  | "planned"
  | "not-implemented"
  | "inherited"
  | "not-applicable";

export type AssessmentStatus = "not-started" | "in-progress" | "satisfied" | "other-than-satisfied";

export type PoamStatus = "open" | "ongoing" | "risk-accepted" | "completed" | "canceled";

export type PoamRisk = "Very High" | "High" | "Moderate" | "Low" | "Very Low";

export type PolicyStatus = "stub" | "draft" | "ready-for-review" | "signed";

export type EvidenceType =
  | "policy"
  | "procedure"
  | "screenshot"
  | "scan"
  | "config"
  | "interview"
  | "test"
  | "diagram"
  | "artifact";

export type RoleKey =
  | "authorizingOfficial"
  | "aoDesignatedRep"
  | "systemOwner"
  | "isso"
  | "issm"
  | "sca"
  | "programManager"
  | "privacyOfficer";

export type Person = {
  name: string;
  org: string;
  email: string;
  phone: string;
};

export type Intake = {
  systemName: string;
  acronym: string;
  emassSystemId: string;
  emassRegistrationStatus: "not-registered" | "draft" | "registered";
  emassInstance: string;
  aoPath: string;
  inheritanceFedramp: string;
  inheritanceDodIl: string;
  appointmentsNotes: string;
  ppsmNotes: string;
  csspNotes: string;
  version: string;
  systemType: "Major Application" | "Enclave" | "GSS" | "PIT" | "PIT Enclave";
  description: string;
  mission: string;
  organization: string;
  component: string;
  location: string;
  classification: string;
  cuiCategories: string[];
  confidentiality: ImpactLevel;
  integrity: ImpactLevel;
  availability: ImpactLevel;
  overlayNistModerate: boolean;
  overlayCnssi1253: boolean;
  overlayDodRmf: boolean;
  overlayPrivacy: boolean;
  authorizationType: AuthorizationType;
  authorizationDate: string;
  authorizationExpire: string;
  rmfStep: RmfStep;
  boundarySummary: string;
  architectureSummary: string;
  userTypes: string;
  interconnections: string;
  dataTypes: string;
  hostingModel: string;
  impactJustification: string;
  pii: boolean;
  phi: boolean;
  roles: Record<RoleKey, Person>;
};

export type InheritanceSource = {
  /** Workspace-only id. Not an eMASS field. */
  id: string;
  name: string;
  /** Providing system's eMASS package ID, or a SAMPLE-prefixed placeholder. */
  packageId: string;
  /** SAMPLE seed or SAMPLE-prefixed placeholder — label SAMPLE in the UI. */
  sample: boolean;
  notes: string;
};

export type ControlRecord = {
  controlId: string;
  selection: SelectionStatus;
  implementation: ImplementationStatus;
  inheritedFrom: string;
  /** Workspace id referencing inheritanceSources[]. Required when inherited or hybrid. */
  inheritanceSourceId: string;
  naJustification: string;
  implementationStatement: string;
  responsibleRole: string;
  parameters: string;
  assessment: AssessmentStatus;
  notes: string;
};

export type PolicyStub = {
  id: string;
  controlId: string;
  title: string;
  status: PolicyStatus;
  owner: string;
  body: string;
  lastUpdated: string;
};

export type EvidenceItem = {
  id: string;
  title: string;
  controlIds: string[];
  type: EvidenceType;
  source: string;
  collectedOn: string;
  collector: string;
  notes: string;
  storedName: string;
  originalName: string;
};

export type PoamItem = {
  id: string;
  emassPoamId: string;
  controlId: string;
  weakness: string;
  description: string;
  source: string;
  status: PoamStatus;
  risk: PoamRisk;
  residualRisk: PoamRisk;
  resources: string;
  scheduledCompletion: string;
  milestones: string;
  poc: string;
  comments: string;
  atoBlocker: boolean;
};

export type SspNarrative = {
  purpose: string;
  authorizationBoundary: string;
  systemEnvironment: string;
  informationFlow: string;
  hardwareSoftware: string;
  externalServices: string;
  inheritanceNotes: string;
};

/** Workspace-only id is not an eMASS CSV column. */
export type Asset = {
  id: string;
  assetName: string;
  assetType: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  hostName: string;
  ipAddress: string;
  macAddress: string;
  osFirmware: string;
  location: string;
  /** Workspace-only. Not an eMASS CSV column. Use for role/function (e.g. Jump host). */
  notes: string;
};

/** Workspace-only id is not an eMASS CSV column. */
export type SoftwareItem = {
  id: string;
  name: string;
  vendor: string;
  version: string;
  license: string;
  relatedAsset: string;
};

/** Workspace-only id is not an eMASS field. */
export type BoundaryEntry = {
  id: string;
  name: string;
  description: string;
  ownership: string;
  notes: string;
};

export type Boundary = {
  inbound: BoundaryEntry[];
  outbound: BoundaryEntry[];
  interconnect: BoundaryEntry[];
};

/** Workspace-only id is not an eMASS field. */
export type DataFlow = {
  id: string;
  name: string;
  source: string;
  destination: string;
  description: string;
  notes: string;
  /** Optional. PPSM Protocol column. Empty string or omitted on old packages. */
  protocol?: string;
  /** Optional. PPSM Port column. Empty string or omitted on old packages. */
  port?: string;
};

export type StigProductFamily = "rhel-8" | "windows-server" | "postgresql";

export type StigTargetKind = "asset" | "software";

/** Workspace-only. officialId is blank or TBD until an official identifier is pasted. Do not invent DISA STIG IDs. */
export type StigAssignment = {
  targetKind: StigTargetKind;
  targetId: string;
  stigProductFamily: StigProductFamily;
  officialId: string;
};

/** Workspace scan finding from PARSE of .nessus or .cklb. Not a NIST control status. pluginId/ruleId come from the file; stigFamily is rhel-8/windows-server/postgresql when known. cciIds are copied from file CCI fields when present (advisory only). Do not map to Satisfied. */
export type ScanFinding = {
  id: string;
  assetId: string;
  unmatchedHost: string;
  hostName: string;
  pluginId: string;
  ruleId: string;
  severity: string;
  status: string;
  stigFamily: StigProductFamily | "";
  title: string;
  sourceType: "nessus" | "cklb" | "";
  inheritedGss: boolean;
  /** CCI identifiers copied from the source file when present. Empty if the file has none. Advisory only. */
  cciIds?: string[];
  /** Display of cciIds, or empty. UI shows TBD when empty. Advisory only — not a control status. */
  cciAdvisory?: string;
};

/** Joint interchange artifact tag (workspace-only; not an official eMASS enum). HW/SW/POA&M/PPSM may be PARSE; ssp/policy/letter/diagram remain STORE-only. nessus/cklb may PARSE (.nessus/.cklb) or STORE-only; old .ckl XML stays STORE-only / parse-rejected. POA&M may also STORE-only. */
export type JointArtifactType =
  | "hardware-baseline"
  | "software-baseline"
  | "poam"
  | "ppsm"
  | "ssp"
  | "policy"
  | "letter"
  | "diagram"
  | "nessus"
  | "cklb"
  | "tdd"
  | "conops";

/** Editable TDD/CONOPS extract for Categorize/Select starter pack (workspace-only). */
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
  /** ISO timestamp when generate last ran. Empty until generate. */
  generatedAt: string;
};

export type ArtifactMode = "parse" | "generate" | "store-only";

/** Tagged original. Bytes live encrypted under data/evidence/. Workspace-only id is not an eMASS field. */
export type StoredArtifact = {
  id: string;
  artifactType: JointArtifactType;
  originalName: string;
  storedName: string;
  mode: ArtifactMode;
  taggedAt: string;
  notes: string;
};

export type AaPackage = {
  schemaVersion: number;
  framework: "DoD RMF";
  catalog: "NIST SP 800-53 Revision 5";
  systemOfRecord: "eMASS";
  cmmcInScope: false;
  sample: boolean;
  updatedAt: string;
  intake: Intake;
  controls: Record<string, ControlRecord>;
  policies: PolicyStub[];
  evidence: EvidenceItem[];
  poams: PoamItem[];
  ssp: SspNarrative;
  assets: Asset[];
  software: SoftwareItem[];
  boundary: Boundary;
  dataFlows: DataFlow[];
  /** Evidence record id for the boundary diagram file slot. File is optional. */
  boundaryDiagramEvidenceId: string;
  /** Providing systems (GSS, ICAM, component program, …). Workspace ids plus package IDs. */
  inheritanceSources: InheritanceSource[];
  /** Tagged ingest files (PARSE HW/SW/POA&M/PPSM originals and STORE-only artifacts). */
  artifacts: StoredArtifact[];
  /** Workspace STIG product-family tags. Missing → []. officialId blank/TBD; not an official DISA STIG ID list. */
  stigAssignments: StigAssignment[];
  /** Findings from PARSE of .nessus/.cklb. Missing → []. Never auto-maps to NIST Satisfied. */
  scanFindings: ScanFinding[];
  /** Editable TDD/CONOPS extract for starter pack. Missing → empty via ensureDesignExtract. */
  designExtract: DesignExtract;
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  authorizingOfficial: "Authorizing Official",
  aoDesignatedRep: "AO Designated Representative",
  systemOwner: "Information System Owner",
  isso: "ISSO",
  issm: "ISSM",
  sca: "Security Control Assessor",
  programManager: "Program Manager",
  privacyOfficer: "Privacy Officer",
};

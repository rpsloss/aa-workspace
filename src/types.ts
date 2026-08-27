export type ImpactLevel = "Low" | "Moderate" | "High";

export type AuthorizationType = "ATO" | "IATT" | "IATO" | "ATO-C" | "Denial";

export type RmfStep =
  | "Categorize"
  | "Select"
  | "Implement"
  | "Assess"
  | "Authorize"
  | "Monitor";

export type SelectionStatus = "in-scope" | "inherited" | "not-applicable" | "tailored-out";

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

export type ControlRecord = {
  controlId: string;
  selection: SelectionStatus;
  implementation: ImplementationStatus;
  inheritedFrom: string;
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

export type AaPackage = {
  schemaVersion: 1;
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

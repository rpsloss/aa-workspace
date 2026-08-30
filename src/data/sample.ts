import { CATALOG } from "./catalog";
import { isControlSelected, retargetControls as retargetFromCatalog } from "../lib/tailor.mjs";
import {
  SCHEMA_VERSION,
  ensureInventory,
  seedSldssAssets,
  seedSldssSoftware,
} from "../lib/inventory.mjs";
import {
  ensureBoundary,
  seedSldssBoundary,
  seedSldssDataFlows,
} from "../lib/boundary.mjs";
import {
  ensureInheritance,
  sampleInheritanceSourceId,
  seedSldssInheritanceSources,
} from "../lib/inheritance.mjs";
import { ensureArtifacts } from "../lib/ingest/artifacts.mjs";
import { ensureStigAssignments, seedSldssStigAssignments } from "../lib/stig.mjs";
import { ensureScanFindings } from "../lib/ingest/scan.mjs";
import type {
  AaPackage,
  ControlRecord,
  EvidenceItem,
  ImplementationStatus,
  Intake,
  Person,
  PolicyStub,
  PoamItem,
  SelectionStatus,
} from "../types";

export { isControlSelected };

function person(name: string, org: string, email: string): Person {
  return { name, org, email, phone: "DSN 555-0100" };
}

const org = "U.S. Army — fictional sample program";

function statement(id: string, selection: SelectionStatus, inheritedFrom: string): string {
  if (selection === "inherited") {
    return `${id} is inherited from ${inheritedFrom}. The ISSO maintains the inheritance record and validates the providing system's authorization remains current. Implementation details reside in the provider SSP; this system consumes the inherited capability as described in the authorization boundary.`;
  }
  if (selection === "not-applicable") {
    return `${id} is not applicable to SLDSS. See N/A justification.`;
  }
  return `${id} is implemented for the Sentinel Logistics Decision Support System within the authorization boundary. The ISSO is the control owner. Technical enforcement is applied through the enclave AD/ICAM stack, application RBAC, and the installation GSS where noted. Procedures are documented in the associated -1 policy stub and standard operating procedures. Residual gaps, if any, are tracked in the POA&M.`;
}

function policyBody(title: string, controlId: string): string {
  return `# ${title}

**Control:** ${controlId} (NIST SP 800-53 Rev 5)
**System:** Sentinel Logistics Decision Support System (SLDSS)
**Classification:** CUI
**Status:** Stub — expand before SCA evidence freeze
**System of record for the authorization package:** eMASS

## 1. Purpose
This stub establishes the organizational policy and procedures required by ${controlId} for SLDSS. It is a working draft for the A&A package, not a signed issuance.

## 2. Scope
Applies to all users, administrators, and support personnel of SLDSS, including inherited GSS and ICAM providers to the extent this system relies on them.

## 3. Policy
The Information System Owner shall ensure ${controlId} is implemented consistently with the tailored baseline, DoD RMF, and CNSSI 1253 overlays selected for this moderate-impact system.

## 4. Roles
- ISSO: day-to-day implementation and evidence
- ISSM: program oversight
- System Owner: resource and residual risk
- AO: authorization decision (recorded in eMASS)

## 5. Procedures
1. Identify in-scope components and inherited providers.
2. Implement the control as stated in the SSP.
3. Collect evidence and retain per AU/records schedule.
4. Review at least annually or when the boundary changes.
5. Record weaknesses in the POA&M and export to eMASS.

## 6. Enforcement
Violations are handled under PS-8 and applicable command policy.

## 7. References
NIST SP 800-53 Rev 5, NIST SP 800-37 Rev 2, CNSSI 1253, DoDI 8510.01.
`;
}

export function emptyPerson(): Person {
  return { name: "", org: "", email: "", phone: "" };
}

export function defaultIntake(): Intake {
  return {
    systemName: "",
    acronym: "",
    emassSystemId: "",
    emassRegistrationStatus: "not-registered",
    emassInstance: "",
    aoPath: "",
    inheritanceFedramp: "",
    inheritanceDodIl: "",
    appointmentsNotes: "",
    ppsmNotes: "",
    csspNotes: "",
    version: "1.0",
    systemType: "Major Application",
    description: "",
    mission: "",
    organization: "",
    component: "",
    location: "",
    classification: "CUI",
    cuiCategories: [],
    confidentiality: "Moderate",
    integrity: "Moderate",
    availability: "Moderate",
    overlayNistModerate: true,
    overlayCnssi1253: true,
    overlayDodRmf: true,
    overlayPrivacy: false,
    authorizationType: "ATO",
    authorizationDate: "",
    authorizationExpire: "",
    rmfStep: "Select",
    boundarySummary: "",
    architectureSummary: "",
    userTypes: "",
    interconnections: "",
    dataTypes: "",
    hostingModel: "",
    impactJustification: "",
    pii: false,
    phi: false,
    roles: {
      authorizingOfficial: emptyPerson(),
      aoDesignatedRep: emptyPerson(),
      systemOwner: emptyPerson(),
      isso: emptyPerson(),
      issm: emptyPerson(),
      sca: emptyPerson(),
      programManager: emptyPerson(),
      privacyOfficer: emptyPerson(),
    },
  };
}

export function buildSamplePackage(): AaPackage {
  const intake: Intake = {
    systemName: "Sentinel Logistics Decision Support System",
    acronym: "SLDSS",
    emassSystemId: "EM-SLDSS-0001847",
    emassRegistrationStatus: "registered",
    emassInstance: "Army eMASS (sample instance)",
    aoPath: "Component AO path — Army / PEO (sample); AO COL A. Reyes",
    inheritanceFedramp: "None. SLDSS is not a FedRAMP cloud service; hosting is on-premises.",
    inheritanceDodIl: "DoD IL4 identity (ICAM) inherited; application remains on-prem enclave (not a cloud IL hosting package).",
    appointmentsNotes: "ISSO and ISSM appointment memos on file with the program office (sample). SCA independence documented. AO designation dated 2026-03-01.",
    ppsmNotes: "Internal enclave ports covered by the GSS interconnection agreement. PPSM registration in progress for the outbound accredited logistics feed.",
    csspNotes: "Enterprise SOC/CSSP provides SIEM transport and after-hours monitoring. SLDSS-specific alert routing is tracked on POA&M SI-4(5).",
    version: "2.1",
    systemType: "Major Application",
    description:
      "SLDSS is a major application that fuses requisition, transportation, and on-hand asset data to present a common logistics picture for a geographic combatant command staff. It is unclassified, processes CUI, and is categorized Moderate/Moderate/Moderate under FIPS 199 / CNSSI 1253.",
    mission:
      "Provide timely, accurate logistics decision support so the command can prioritize movement, identify shortfalls, and track high-priority cargo without relying on disconnected spreadsheets.",
    organization: "Fictional Army program office (sample)",
    component: "Department of the Army (sample)",
    location: "Fort Example, VA — Building 410 data hall + IL4 SaaS identity inheritance",
    classification: "CUI",
    cuiCategories: ["OPSEC", "Legal", "Privacy"],
    confidentiality: "Moderate",
    integrity: "Moderate",
    availability: "Moderate",
    overlayNistModerate: true,
    overlayCnssi1253: true,
    overlayDodRmf: true,
    overlayPrivacy: true,
    authorizationType: "ATO",
    authorizationDate: "",
    authorizationExpire: "",
    rmfStep: "Implement",
    boundarySummary:
      "The authorization boundary includes the SLDSS application tier, application database, jump/admin workstation VLAN, and the site-to-site VPN concentrator used for the alternate processing site. The installation GSS (identity directory hardware, facility PE, and core routing) and DoD ICAM (PIV/CAC authentication) are inherited providers and are outside this system's authorization except as consumed services. Public web is not in boundary. Developer laptops are not in boundary.",
    architectureSummary:
      "Two-tier app: RHEL application servers behind an authenticated reverse proxy; PostgreSQL on a separate VLAN; STIG'd Windows admin jump hosts; logs forwarded to the enterprise SIEM. TLS 1.2+ in transit; data-at-rest encryption on database volumes. No wireless inside the enclave. Remote access is VPN to the jump tier only.",
    userTypes:
      "Command logistics staff (privileged mission users), application administrators, database administrators, ISSO/ISSM, and read-only auditors. No public users. Contractors operate under PS-7.",
    interconnections:
      "Inbound: Enterprise ICAM (SAML/PIV). Outbound: GCCS-adjacent logistics feeds (one-way, accredited connection request in progress), enterprise SIEM, patch WSUS/satellite. No direct Internet from the app tier.",
    dataTypes:
      "DoD ID numbers, work emails, unit identifiers, NSNs, requisition quantities, transportation control numbers, and free-text logistics remarks. Limited PII (work identity). No PHI. No classified data.",
    hostingModel: "On-premises enclave with inherited IL4 identity services",
    impactJustification:
      "Loss of confidentiality could expose operational logistics patterns (CUI/OPSEC). Integrity failures could mis-prioritize cargo. Availability loss would degrade staff planning but not a weapons system; 72-hour MTD is acceptable. Moderate is appropriate for all three; High is not justified.",
    pii: true,
    phi: false,
    roles: {
      authorizingOfficial: person("COL A. Reyes", org, "ao.reyes.sample@army.mil"),
      aoDesignatedRep: person("LTC J. Okonkwo", org, "aodr.okonkwo.sample@army.mil"),
      systemOwner: person("Ms. P. Hartmann", org, "iso.hartmann.sample@army.mil"),
      isso: person("Mr. D. Voss", org, "isso.voss.sample@army.mil"),
      issm: person("Ms. K. Singh", org, "issm.singh.sample@army.mil"),
      sca: person("Mr. L. Chen (SCA, independent)", "Assessing org (sample)", "sca.chen.sample@army.mil"),
      programManager: person("MAJ R. Ellis", org, "pm.ellis.sample@army.mil"),
      privacyOfficer: person("Ms. N. Alvarez", org, "privacy.alvarez.sample@army.mil"),
    },
  };

  const planned = new Set(["AU-6(3)", "CP-4(1)", "SC-7(8)", "SI-4(5)", "CM-7(5)"]);
  const na = new Set(["AC-18", "AC-18(1)", "AC-18(3)", "AC-19", "AC-19(5)"]);
  const partial = new Set(["CA-8", "IR-3", "RA-5(11)", "SR-6"]);

  const controls: Record<string, ControlRecord> = {};
  for (const item of CATALOG) {
    if (!isControlSelected(intake, item.overlays)) continue;
    let selection: SelectionStatus = "in-scope";
    let implementation: ImplementationStatus = "implemented";
    let inheritedFrom = "";
    let inheritanceSourceId = "";
    let naJustification = "";

    if (item.family === "PE" && item.id !== "PE-1") {
      selection = "inherited";
      implementation = "inherited";
      inheritedFrom = "Installation GSS (Fort Example) — eMASS EM-GSS-0000441";
    } else if (
      ["IA-2", "IA-2(1)", "IA-2(2)", "IA-2(8)", "IA-2(12)", "IA-8", "IA-8(1)", "IA-8(2)", "IA-8(4)"].includes(
        item.id,
      )
    ) {
      selection = "inherited";
      implementation = "inherited";
      inheritedFrom = "DoD ICAM / Enterprise PIV — inherited identity provider";
    } else if (item.family === "PM") {
      selection = "inherited";
      implementation = "inherited";
      inheritedFrom = "Component cybersecurity program (organization-level PM family)";
    } else if (na.has(item.id)) {
      selection = "not-applicable";
      implementation = "not-applicable";
      naJustification =
        "No wireless or government-furnished mobile devices are in the SLDSS authorization boundary. Wireless is disabled at the enclave edge (GSS). Mobile access is prohibited.";
    } else if (planned.has(item.id)) {
      implementation = "planned";
    } else if (partial.has(item.id)) {
      implementation = "partial";
    } else if (item.id.startsWith("PT-") && item.id !== "PT-1" && item.id !== "PT-5") {
      implementation = "partial";
    }

    inheritanceSourceId = sampleInheritanceSourceId(item, selection);

    controls[item.id] = {
      controlId: item.id,
      selection,
      implementation,
      inheritedFrom,
      inheritanceSourceId,
      naJustification,
      implementationStatement: statement(item.id, selection, inheritedFrom),
      responsibleRole: selection === "inherited" ? "Provider ISSO / SLDSS ISSO (validate)" : "ISSO",
      parameters: item.policyControl ? "Reviewed annually or upon significant change." : "",
      assessment: planned.has(item.id) || partial.has(item.id) ? "not-started" : "in-progress",
      notes: "",
    };
  }

  const policies: PolicyStub[] = CATALOG.filter(
    (item) => item.policyControl && isControlSelected(intake, item.overlays),
  ).map((item) => {
    const familyName = item.id.split("-")[0];
    const signed = ["AC-1", "IA-1", "IR-1", "PL-1"].includes(item.id);
    const draft = ["CP-1", "AU-1", "CM-1"].includes(item.id);
    return {
      id: `pol-${item.id}`,
      controlId: item.id,
      title: `${familyName} ${item.title}`,
      status: signed ? "signed" : draft ? "draft" : "stub",
      owner: "ISSO / ISSM",
      body: policyBody(`${familyName} ${item.title}`, item.id),
      lastUpdated: "2026-08-01",
    };
  });

  const evidence: EvidenceItem[] = [
    {
      id: "ev-001",
      title: "SLDSS authorization boundary diagram (v2.1)",
      controlIds: ["PL-2", "PL-8", "CA-3", "SC-7"],
      type: "diagram",
      source: "System owner architecture package",
      collectedOn: "2026-07-14",
      collector: "ISO",
      notes: "Draft pending AO-DR concurrence. Listed as an ATO blocker until signed.",
      storedName: "",
      originalName: "",
    },
    {
      id: "ev-002",
      title: "STIG checklist excerpt — RHEL app tier",
      controlIds: ["CM-6", "CM-7", "SI-2", "SC-28"],
      type: "scan",
      source: "SCC / Evaluate-STIG",
      collectedOn: "2026-08-10",
      collector: "ISSO",
      notes: "Open CAT IIs mapped to POA&M where not mitigated.",
      storedName: "",
      originalName: "",
    },
    {
      id: "ev-003",
      title: "PIV logon screenshot — jump host",
      controlIds: ["IA-2", "IA-2(1)", "IA-2(12)", "AC-17"],
      type: "screenshot",
      source: "Admin jump host",
      collectedOn: "2026-08-12",
      collector: "ISSO",
      notes: "Shows CAC required; local password logon disabled.",
      storedName: "",
      originalName: "",
    },
    {
      id: "ev-004",
      title: "SIEM onboarding ticket — SLDSS indexes",
      controlIds: ["AU-2", "AU-6", "AU-12", "SI-4"],
      type: "artifact",
      source: "Enterprise SOC",
      collectedOn: "2026-06-22",
      collector: "ISSO",
      notes: "Forwarding works; correlation use-cases (AU-6(3)) not yet complete.",
      storedName: "",
      originalName: "",
    },
    {
      id: "ev-005",
      title: "Incident response plan tabletop notes",
      controlIds: ["IR-4", "IR-8", "IR-3"],
      type: "test",
      source: "ISSM-led tabletop",
      collectedOn: "2026-03-18",
      collector: "ISSM",
      notes: "Tabletop only; coordinated test with CP still open.",
      storedName: "",
      originalName: "",
    },
    {
      id: "ev-006",
      title: "Privacy Threshold Analysis (PTA) — SLDSS",
      controlIds: ["RA-8", "PT-2", "PT-5", "PL-2"],
      type: "policy",
      source: "Privacy officer",
      collectedOn: "2026-05-02",
      collector: "Privacy Officer",
      notes: "PTA determined PIA required. PIA in draft.",
      storedName: "",
      originalName: "",
    },
  ];

  const poams: PoamItem[] = [
    {
      id: "poam-001",
      emassPoamId: "TBD-eMASS",
      controlId: "AU-6(3)",
      weakness: "Audit repositories are not fully correlated across app, OS, and proxy logs.",
      description:
        "SLDSS forwards logs to the enterprise SIEM, but correlation content packs for proxy + application events are not production-ready. Review is siloed.",
      source: "Self-assessment",
      status: "open",
      risk: "Moderate",
      residualRisk: "Low",
      resources: "SOC analyst (0.2 FTE) + ISSO; no additional funding",
      scheduledCompletion: "2026-11-30",
      milestones: "1) Finish index mapping (Sep). 2) Correlation rules in test (Oct). 3) Production + evidence (Nov).",
      poc: "ISSO Voss",
      comments: "Not an AO stopper if monitored; keep visible.",
      atoBlocker: false,
    },
    {
      id: "poam-002",
      emassPoamId: "TBD-eMASS",
      controlId: "CP-4(1)",
      weakness: "Coordinated contingency plan test with related GSS/IR plans is overdue.",
      description:
        "Last coordinated test slipped. Tabletop for IR was completed; CP failover to alternate processing was not exercised with the GSS owner.",
      source: "Continuous monitoring",
      status: "open",
      risk: "High",
      residualRisk: "Moderate",
      resources: "GSS coordination; weekend maintenance window",
      scheduledCompletion: "2026-09-15",
      milestones: "1) Schedule with GSS (complete). 2) Execute failover test. 3) AAR into CP and eMASS.",
      poc: "ISO Hartmann",
      comments: "AO typically requires a current CP test for moderate systems.",
      atoBlocker: true,
    },
    {
      id: "poam-003",
      emassPoamId: "TBD-eMASS",
      controlId: "SC-7(8)",
      weakness: "Not all outbound application traffic is forced through an authenticated proxy.",
      description:
        "App tier default route still allows a management subnet path that bypasses the authenticated proxy. Change is in CAB queue.",
      source: "Architecture review",
      status: "ongoing",
      risk: "High",
      residualRisk: "Moderate",
      resources: "Network engineering (GSS) + change window",
      scheduledCompletion: "2026-09-30",
      milestones: "1) CAB package submitted. 2) Implement deny-by-default remaining path. 3) Packet capture evidence.",
      poc: "ISSO Voss / GSS NOSC",
      comments: "Treat as ATO blocker until the bypass is removed or formally accepted.",
      atoBlocker: true,
    },
    {
      id: "poam-004",
      emassPoamId: "TBD-eMASS",
      controlId: "SI-4(5)",
      weakness: "System-generated alerts are not consistently reaching the ISSO on-call.",
      description:
        "SIEM alerts exist but on-call routing for SLDSS-specific signatures is incomplete. After-hours coverage depends on enterprise SOC general queue.",
      source: "SCA interview prep",
      status: "open",
      risk: "Moderate",
      residualRisk: "Low",
      resources: "SOC on-call update; ISSO phone tree",
      scheduledCompletion: "2026-10-15",
      milestones: "1) Signature list. 2) On-call test. 3) SOP update.",
      poc: "ISSM Singh",
      comments: "",
      atoBlocker: false,
    },
    {
      id: "poam-005",
      emassPoamId: "TBD-eMASS",
      controlId: "CM-7(5)",
      weakness: "Allow-by-exception software execution is partial on admin jump hosts.",
      description:
        "Application servers are locked down; two jump hosts still permit local admin software install for troubleshooting. Moving to application control.",
      source: "STIG review",
      status: "ongoing",
      risk: "Moderate",
      residualRisk: "Low",
      resources: "WDAC / application control policy",
      scheduledCompletion: "2026-12-01",
      milestones: "1) Inventory allowed tools. 2) WDAC audit mode. 3) Enforce.",
      poc: "ISSO Voss",
      comments: "",
      atoBlocker: false,
    },
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    framework: "DoD RMF",
    catalog: "NIST SP 800-53 Revision 5",
    systemOfRecord: "eMASS",
    cmmcInScope: false,
    sample: true,
    updatedAt: new Date().toISOString(),
    intake,
    controls,
    policies,
    evidence,
    poams,
    assets: seedSldssAssets(),
    software: seedSldssSoftware(),
    boundary: seedSldssBoundary(),
    dataFlows: seedSldssDataFlows(),
    boundaryDiagramEvidenceId: "ev-001",
    inheritanceSources: seedSldssInheritanceSources(),
    artifacts: [],
    stigAssignments: seedSldssStigAssignments(),
    scanFindings: [],
    ssp: {
      purpose:
        "This System Security Plan describes security and privacy controls selected and implemented for SLDSS under DoD RMF (DoDI 8510.01) using NIST SP 800-53 Revision 5, the NIST moderate baseline (800-53B), and CNSSI 1253 overlays. CMMC is not used. eMASS is the system of record for the authorization; this workbench holds working papers.",
      authorizationBoundary:
        intake.boundarySummary,
      systemEnvironment: intake.architectureSummary,
      informationFlow:
        "Mission users authenticate via inherited DoD ICAM (PIV), reach the application through the authenticated reverse proxy, and read/write logistics records in PostgreSQL. Logs egress to the enterprise SIEM. A single accredited data exchange (in progress) will pull read-only transportation events. No data is exported to public networks from the app tier.",
      hardwareSoftware:
        "Qty 4 RHEL 8 application VMs; qty 2 PostgreSQL VMs; qty 2 Windows Server jump hosts; F5/proxy pair (GSS-managed, inherited); HSMs not dedicated (enterprise PKI inherited). Software: SLDSS app v2.1, PostgreSQL 15, native SIEM forwarders. Inventory is maintained under CM-8 (spreadsheet + GSS CMDB).",
      externalServices:
        "DoD ICAM (identity), Installation GSS (facilities, core network, proxy, SIEM transport), enterprise PKI, patch satellite. Each provider must have a current authorization; ISSO tracks authorization expiration dates quarterly.",
      inheritanceNotes:
        "PE family (except PE-1) inherited from Installation GSS EM-GSS-0000441. Selected IA controls inherited from DoD ICAM. PM family inherited from the component cybersecurity program. Hybrid controls remain the SLDSS ISSO's responsibility to validate. Do not paste inheritance as 'implemented' in eMASS without the providing system's identifier.",
    },
  };
}


export function hydratePackage(raw: Partial<AaPackage> | null | undefined): AaPackage {
  const defaults = defaultIntake();
  const intake = raw?.intake ?? defaults;
  const emptySsp = {
    purpose: "",
    authorizationBoundary: "",
    systemEnvironment: "",
    informationFlow: "",
    hardwareSoftware: "",
    externalServices: "",
    inheritanceNotes: "",
  };
  return ensureScanFindings(ensureStigAssignments(
    ensureArtifacts(
    ensureInheritance(
    ensureBoundary(
      ensureInventory({
        schemaVersion: SCHEMA_VERSION,
        framework: raw?.framework ?? "DoD RMF",
        catalog: raw?.catalog ?? "NIST SP 800-53 Revision 5",
        systemOfRecord: "eMASS",
        cmmcInScope: false,
        sample: raw?.sample ?? false,
        updatedAt: raw?.updatedAt ?? new Date().toISOString(),
        intake: {
          ...defaults,
          ...intake,
          roles: { ...defaults.roles, ...(intake.roles ?? {}) },
        },
        controls: raw?.controls ?? {},
        policies: raw?.policies ?? [],
        evidence: raw?.evidence ?? [],
        poams: raw?.poams ?? [],
        ssp: { ...emptySsp, ...(raw?.ssp ?? {}) },
        assets: raw?.assets,
        software: raw?.software,
        boundary: raw?.boundary,
        dataFlows: raw?.dataFlows,
        boundaryDiagramEvidenceId: raw?.boundaryDiagramEvidenceId,
        inheritanceSources: raw?.inheritanceSources,
        artifacts: raw?.artifacts,
        stigAssignments: raw?.stigAssignments,
        scanFindings: raw?.scanFindings,
      }),
    ),
    ),
    ),
  ));
}

export function retargetControls(pkg: AaPackage): AaPackage {
  return retargetFromCatalog(pkg, CATALOG);
}

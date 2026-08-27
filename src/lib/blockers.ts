import { CATALOG } from "../data/catalog";
import type { AaPackage } from "../types";

export type BlockerSeverity = "blocker" | "warning" | "info";

export type Blocker = {
  id: string;
  severity: BlockerSeverity;
  title: string;
  detail: string;
  href: string;
};

export function impactKey(pkg: AaPackage): string {
  return `${pkg.intake.confidentiality[0]}${pkg.intake.integrity[0]}${pkg.intake.availability[0]}`;
}

export function controlList(pkg: AaPackage) {
  return Object.values(pkg.controls).sort((a, b) => a.controlId.localeCompare(b.controlId, "en", { numeric: true }));
}

export function computeBlockers(pkg: AaPackage): Blocker[] {
  const blockers: Blocker[] = [];
  const i = pkg.intake;

  if (!i.emassSystemId.trim()) {
    blockers.push({
      id: "emass-id",
      severity: "blocker",
      title: "eMASS system ID missing",
      detail: "Register or paste the eMASS record identifier. This workspace is not the authorization system of record.",
      href: "/intake",
    });
  } else if (i.emassRegistrationStatus === "not-registered") {
    blockers.push({
      id: "emass-reg",
      severity: "blocker",
      title: "eMASS registration not marked complete",
      detail: "Set registration status once the system exists in eMASS. Do not treat local drafts as posted.",
      href: "/intake",
    });
  }

  if (!i.systemName.trim() || !i.boundarySummary.trim() || !i.impactJustification.trim()) {
    blockers.push({
      id: "intake-core",
      severity: "blocker",
      title: "Intake incomplete (name, boundary, or FIPS 199 justification)",
      detail: "Categorize cannot be closed until identification, boundary, and impact rationale are filled.",
      href: "/intake",
    });
  }

  if (!i.roles.authorizingOfficial.name || !i.roles.isso.name || !i.roles.systemOwner.name) {
    blockers.push({
      id: "roles",
      severity: "blocker",
      title: "AO, ISO, or ISSO not named",
      detail: "RMF roles must be identifiable before the AO package is assembled.",
      href: "/intake",
    });
  }

  const scoped = controlList(pkg).filter((c) => c.selection === "in-scope");
  const missingStmt = scoped.filter((c) => c.implementationStatement.trim().length < 40);
  if (missingStmt.length > 0) {
    blockers.push({
      id: "ssp-gaps",
      severity: "blocker",
      title: `${missingStmt.length} in-scope control(s) lack an implementation statement`,
      detail: "eMASS SSP import quality fails when implementation text is empty. Start with high-visibility families (AC, AU, IA, SC).",
      href: "/ssp",
    });
  }

  const unimplemented = scoped.filter(
    (c) => c.implementation === "not-implemented" || c.implementation === "planned",
  );
  const uncovered = unimplemented.filter((c) => !pkg.poams.some((p) => p.controlId === c.controlId && p.status !== "completed" && p.status !== "canceled"));
  if (uncovered.length > 0) {
    blockers.push({
      id: "uncovered-gaps",
      severity: "blocker",
      title: `${uncovered.length} unimplemented/planned control(s) have no open POA&M`,
      detail: "DoD packages expect residual gaps either implemented, inherited, N/A with justification, or on a POA&M.",
      href: "/poam",
    });
  }

  const naMissing = controlList(pkg).filter((c) => c.selection === "not-applicable" && c.naJustification.trim().length < 20);
  if (naMissing.length > 0) {
    blockers.push({
      id: "na-just",
      severity: "blocker",
      title: `${naMissing.length} N/A control(s) missing justification`,
      detail: "Assessors reject N/A without a system-specific rationale.",
      href: "/tailoring",
    });
  }

  const inheritedMissing = controlList(pkg).filter((c) => c.selection === "inherited" && !c.inheritedFrom.trim());
  if (inheritedMissing.length > 0) {
    blockers.push({
      id: "inherit",
      severity: "blocker",
      title: `${inheritedMissing.length} inherited control(s) missing provider system`,
      detail: "Record the providing GSS/ICAM eMASS ID. Inheritance without a provider is treated as unimplemented.",
      href: "/tailoring",
    });
  }

  const policyBlock = pkg.policies.filter((p) => p.status === "stub");
  if (policyBlock.length > 0) {
    blockers.push({
      id: "policies",
      severity: "warning",
      title: `${policyBlock.length} -1 policy stub(s) not advanced past stub`,
      detail: "Policy and procedures controls need more than a generated stub before SCA.",
      href: "/policies",
    });
  }

  const evidenceControls = new Set(pkg.evidence.flatMap((e) => e.controlIds));
  const highVis = scoped.filter((c) => ["AC-2", "AU-2", "IA-2", "SC-7", "CM-6", "IR-4", "RA-5", "CA-2"].includes(c.controlId));
  const missingEv = highVis.filter((c) => c.selection === "in-scope" && !evidenceControls.has(c.controlId));
  if (missingEv.length > 0) {
    blockers.push({
      id: "evidence",
      severity: "warning",
      title: `High-visibility controls without evidence: ${missingEv.map((c) => c.controlId).join(", ")}`,
      detail: "Map artifacts (STIG, screenshots, scans, diagrams) before the SCA kickoff.",
      href: "/evidence",
    });
  }

  const atoPoams = pkg.poams.filter((p) => p.atoBlocker && p.status !== "completed" && p.status !== "canceled" && p.status !== "risk-accepted");
  for (const p of atoPoams) {
    blockers.push({
      id: `poam-${p.id}`,
      severity: "blocker",
      title: `ATO-blocking POA&M on ${p.controlId}`,
      detail: p.weakness,
      href: "/poam",
    });
  }

  const overdue = pkg.poams.filter((p) => {
    if (p.status === "completed" || p.status === "canceled") return false;
    if (!p.scheduledCompletion) return false;
    return p.scheduledCompletion < new Date().toISOString().slice(0, 10);
  });
  if (overdue.length > 0) {
    blockers.push({
      id: "overdue",
      severity: "warning",
      title: `${overdue.length} POA&M(s) past scheduled completion`,
      detail: "Update milestones in this workspace and in eMASS together.",
      href: "/poam",
    });
  }

  if (i.pii && !pkg.evidence.some((e) => e.controlIds.includes("RA-8"))) {
    blockers.push({
      id: "pia",
      severity: "warning",
      title: "PII flagged but RA-8 / PIA evidence is thin",
      detail: "Complete PTA/PIA artifacts and keep the privacy overlay selected.",
      href: "/evidence",
    });
  }

  if (!pkg.ssp.authorizationBoundary.trim() || !pkg.ssp.purpose.trim()) {
    blockers.push({
      id: "ssp-narr",
      severity: "blocker",
      title: "SSP narrative incomplete",
      detail: "Purpose and authorization boundary must be in the SSP, not only in intake working notes.",
      href: "/ssp",
    });
  }

  if (i.rmfStep === "Categorize" || i.rmfStep === "Select") {
    blockers.push({
      id: "step",
      severity: "info",
      title: `RMF step is still ${i.rmfStep}`,
      detail: "Advance the step in intake as artifacts mature. The AO decision is recorded in eMASS, not here.",
      href: "/intake",
    });
  }

  const catalogHit = CATALOG.filter((c) => pkg.controls[c.id]).length;
  if (catalogHit === 0) {
    blockers.push({
      id: "empty",
      severity: "blocker",
      title: "No controls in the tailored baseline",
      detail: "Select NIST 800-53 Rev 5 moderate (and overlays) then rebuild the control set.",
      href: "/tailoring",
    });
  }

  return blockers;
}

export function readiness(pkg: AaPackage): { score: number; label: string } {
  const items = computeBlockers(pkg);
  const block = items.filter((b) => b.severity === "blocker").length;
  const warn = items.filter((b) => b.severity === "warning").length;
  const score = Math.max(0, Math.min(100, 100 - block * 12 - warn * 4));
  const label = score >= 80 ? "Package forming" : score >= 55 ? "Not AO-ready" : "Blocked";
  return { score, label };
}

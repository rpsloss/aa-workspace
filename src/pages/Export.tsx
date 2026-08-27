import { CATALOG_BY_ID } from "../data/catalog";
import { controlList } from "../lib/blockers";
import { usePackage } from "../lib/store";

function download(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export default function ExportPage() {
  const { pkg } = usePackage();
  const ac = pkg.intake.acronym || "SYSTEM";

  function sspMarkdown() {
    const controls = controlList(pkg)
      .filter((c) => c.selection !== "tailored-out")
      .map((c) => {
        const title = CATALOG_BY_ID[c.controlId]?.title ?? "";
        return `### ${c.controlId} ${title}\n\n- Selection: ${c.selection}\n- Implementation: ${c.implementation}\n- Inherited from: ${c.inheritedFrom || "—"}\n- N/A justification: ${c.naJustification || "—"}\n\n${c.implementationStatement}\n`;
      })
      .join("\n");
    return `# System Security Plan — ${pkg.intake.systemName}

**Acronym:** ${pkg.intake.acronym}  
**eMASS ID:** ${pkg.intake.emassSystemId}  
**Catalog:** ${pkg.catalog}  
**Framework:** ${pkg.framework}  
**System of record:** eMASS  
**CMMC:** out of scope  
**Impact:** C=${pkg.intake.confidentiality} I=${pkg.intake.integrity} A=${pkg.intake.availability}

> Working paper exported from A&A Workbench. Transcribe or attach in eMASS. This file is not an authorization.

## Purpose
${pkg.ssp.purpose}

## Authorization boundary
${pkg.ssp.authorizationBoundary}

## System environment
${pkg.ssp.systemEnvironment}

## Information flow
${pkg.ssp.informationFlow}

## Hardware and software
${pkg.ssp.hardwareSoftware}

## External services
${pkg.ssp.externalServices}

## Inheritance
${pkg.ssp.inheritanceNotes}

## Control implementations

${controls}
`;
  }

  function poamCsv() {
    const header = [
      "eMASS_POAM_ID",
      "Control",
      "Weakness",
      "Description",
      "Source",
      "Status",
      "Risk",
      "Residual_Risk",
      "Resources",
      "Scheduled_Completion",
      "Milestones",
      "POC",
      "ATO_Blocker",
      "Comments",
    ];
    const lines = pkg.poams.map((p) =>
      [
        p.emassPoamId,
        p.controlId,
        p.weakness,
        p.description,
        p.source,
        p.status,
        p.risk,
        p.residualRisk,
        p.resources,
        p.scheduledCompletion,
        p.milestones,
        p.poc,
        p.atoBlocker ? "Y" : "N",
        p.comments,
      ]
        .map(csvEscape)
        .join(","),
    );
    return [header.join(","), ...lines].join("\n");
  }

  function controlsCsv() {
    const header = [
      "Control",
      "Title",
      "Selection",
      "Implementation",
      "Inherited_From",
      "NA_Justification",
      "Responsible_Role",
      "Assessment",
      "Implementation_Statement",
    ];
    const lines = controlList(pkg).map((c) =>
      [
        c.controlId,
        CATALOG_BY_ID[c.controlId]?.title ?? "",
        c.selection,
        c.implementation,
        c.inheritedFrom,
        c.naJustification,
        c.responsibleRole,
        c.assessment,
        c.implementationStatement,
      ]
        .map(csvEscape)
        .join(","),
    );
    return [header.join(","), ...lines].join("\n");
  }

  return (
    <div>
      <div className="kicker">Export · do not replace eMASS</div>
      <h1>eMASS working papers</h1>
      <p>
        Download drafts to attach or transcribe. There is no eMASS API connection in v1. After export, update the eMASS
        record and treat that copy as authoritative.
      </p>
      <div className="grid two">
        <div className="card">
          <h2>SSP (Markdown)</h2>
          <p>Narrative plus implementation statements.</p>
          <button type="button" className="primary" onClick={() => download(`${ac}-SSP.md`, sspMarkdown())}>
            Download SSP
          </button>
        </div>
        <div className="card">
          <h2>POA&amp;M (CSV)</h2>
          <p>Columns named for typical eMASS POA&amp;M entry, not an official template.</p>
          <button type="button" className="primary" onClick={() => download(`${ac}-POAM.csv`, poamCsv(), "text/csv")}>
            Download POA&amp;M CSV
          </button>
        </div>
        <div className="card">
          <h2>Control implementation (CSV)</h2>
          <p>Tailoring and SSP text for bulk review.</p>
          <button
            type="button"
            className="primary"
            onClick={() => download(`${ac}-controls.csv`, controlsCsv(), "text/csv")}
          >
            Download controls CSV
          </button>
        </div>
        <div className="card">
          <h2>Full package (JSON)</h2>
          <p>Local snapshot including policies and evidence index. Saved copy also lives in data/package.json.</p>
          <button
            type="button"
            className="primary"
            onClick={() => download(`${ac}-package.json`, JSON.stringify(pkg, null, 2), "application/json")}
          >
            Download JSON
          </button>
        </div>
      </div>
    </div>
  );
}

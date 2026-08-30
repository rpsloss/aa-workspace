/** SSP markdown working paper. Reads boundary/dataFlows tables. Empty tables → TBD. */

import { TBD, sspBoundaryMarkdown, sspDiagramSlotMarkdown, ensureBoundary } from "./boundary.mjs";

export { TBD, sspBoundaryMarkdown };

export function renderDiagramSection(pkg) {
  return sspDiagramSlotMarkdown(pkg);
}

function controlTitle(catalogOrOptions, id) {
  if (!catalogOrOptions) return "";
  if (typeof catalogOrOptions.titleFor === "function") {
    return catalogOrOptions.titleFor(id) || "";
  }
  return catalogOrOptions[id]?.title ?? "";
}

function controlBlocks(pkg, catalogOrOptions) {
  const controls = Object.values(pkg?.controls && typeof pkg.controls === "object" ? pkg.controls : {}).filter(
    (row) => row && row.selection !== "tailored-out",
  );
  controls.sort((a, b) => String(a.controlId || "").localeCompare(String(b.controlId || ""), "en", { numeric: true }));
  return controls
    .map((c) => {
      const title = controlTitle(catalogOrOptions, c.controlId);
      return `### ${c.controlId}${title ? ` ${title}` : ""}

- Selection: ${c.selection ?? ""}
- Implementation: ${c.implementation ?? ""}
- Inherited from: ${c.inheritedFrom || "—"}
- Inheritance source id: ${c.inheritanceSourceId || "—"}
- N/A justification: ${c.naJustification || "—"}

${c.implementationStatement ?? ""}
`;
    })
    .join("\n");
}

export function sspMarkdown(pkg, catalogOrOptions = {}) {
  const b = ensureBoundary(pkg && typeof pkg === "object" && !Array.isArray(pkg) ? pkg : {});
  const intake = b.intake && typeof b.intake === "object" ? b.intake : {};
  const ssp = b.ssp && typeof b.ssp === "object" ? b.ssp : {};
  const tables = sspBoundaryMarkdown(b);
  const diagram = sspDiagramSlotMarkdown(b);

  return `# System Security Plan — ${intake.systemName ?? ""}

**Acronym:** ${intake.acronym ?? ""}  
**eMASS ID:** ${intake.emassSystemId ?? ""}  
**Catalog:** ${b.catalog ?? ""}  
**Framework:** ${b.framework ?? ""}  
**System of record:** eMASS  
**CMMC:** out of scope  
**Impact:** C=${intake.confidentiality ?? ""} I=${intake.integrity ?? ""} A=${intake.availability ?? ""}

> Working paper exported from A&A Workbench. Transcribe or attach in eMASS. This file is not an authorization.

## Purpose
${ssp.purpose ?? ""}

## Authorization boundary
${ssp.authorizationBoundary ?? ""}

### Inbound
${tables.inbound}

### Outbound
${tables.outbound}

### Interconnections
${tables.interconnect}

## System environment
${ssp.systemEnvironment ?? ""}

## Information flow
### Data flows
${tables.dataFlows}

### Boundary diagram
${diagram}

## Hardware and software
${ssp.hardwareSoftware ?? ""}

## External services
${ssp.externalServices ?? ""}

## Inheritance
${ssp.inheritanceNotes ?? ""}

## Control implementations

${controlBlocks(b, catalogOrOptions)}
`;
}

import { CATALOG_BY_ID } from "../data/catalog";
import { controlList } from "../lib/blockers";
import { hardwareCsv, softwareCsv } from "../lib/inventory.mjs";
import { poamCsv } from "../lib/poamCsv.mjs";
import { sspMarkdown } from "../lib/sspMarkdown.mjs";
import { reportPackageAccess, usePackage } from "../lib/store";

function download(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  reportPackageAccess("export", blob.size);
}

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

async function downloadEmitZip(fallbackAcronym: string) {
  const res = await fetch("/api/emit");
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const disp = res.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(disp);
  a.download = match?.[1] || `${fallbackAcronym}-emass-working-papers.zip`;
  a.click();
  URL.revokeObjectURL(url);
  reportPackageAccess("export", blob.size);
}

export default function ExportPage() {
  const { pkg } = usePackage();
  const ac = pkg.intake.acronym || "SYSTEM";

  function sspMarkdownText() {
    return sspMarkdown(pkg, CATALOG_BY_ID);
  }

  function controlsCsv() {
    const header = [
      "Control",
      "Title",
      "Selection",
      "Implementation",
      "Inherited_From",
      "Inheritance_Source_Id",
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
        c.inheritanceSourceId,
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
          <h2>Working-papers zip</h2>
          <p>
            One zip: SSP markdown, POA&amp;M CSV, hardware/software CSV, artifact index, completeness checklist, and
            tagged originals. Not a live eMASS connection. No sync.
          </p>
          <button type="button" className="primary" onClick={() => void downloadEmitZip(ac)}>
            Download eMASS working-papers zip
          </button>
        </div>
        <div className="card">
          <h2>SSP (Markdown)</h2>
          <p>Narrative plus boundary/data-flow tables (TBD if empty) and implementation statements.</p>
          <button type="button" className="primary" onClick={() => download(`${ac}-SSP.md`, sspMarkdownText())}>
            Download SSP
          </button>
        </div>
        <div className="card">
          <h2>POA&amp;M (CSV)</h2>
          <p>Columns named for typical eMASS POA&amp;M entry, not an official template.</p>
          <button type="button" className="primary" onClick={() => download(`${ac}-POAM.csv`, poamCsv(pkg), "text/csv")}>
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
        <div className="card">
          <h2>Hardware (CSV)</h2>
          <p>
            Joint eMASS hardware-oriented columns for paste/upload. Workspace <code>id</code> is omitted.
            Host Name / serial / IP / MAC are blank until the CMDB is pasted. No sync button.
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => download(`${ac}-hardware.csv`, hardwareCsv(pkg.assets), "text/csv")}
          >
            Download hardware CSV
          </button>
        </div>
        <div className="card">
          <h2>Software (CSV)</h2>
          <p>
            Columns: Software Name, Vendor, Version, License, Related Asset/Host. Workspace <code>id</code> is
            omitted.
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => download(`${ac}-software.csv`, softwareCsv(pkg.software), "text/csv")}
          >
            Download software CSV
          </button>
        </div>
      </div>
    </div>
  );
}

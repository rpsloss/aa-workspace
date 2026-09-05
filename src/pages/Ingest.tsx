import { useState } from "react";
import { cciAdvisoryDisplay } from "../lib/ingest/scan.mjs";
import { usePackage } from "../lib/store";
import type { AaPackage, JointArtifactType } from "../types";

type ParseArtifactType = "" | "hardware-baseline" | "software-baseline" | "poam" | "ppsm" | "nessus" | "cklb";

type PreviewItem = {
  status: "add" | "update" | "unchanged" | "conflict";
  reason: string;
  index: number;
  existingId: string;
  incoming: Record<string, string>;
};

type PreviewResponse = {
  ok: boolean;
  mode: string;
  artifactType?: JointArtifactType | "";
  kind: "hardware" | "software" | "poam" | "ppsm" | "nessus" | "cklb" | null;
  reason?: string | null;
  counts?: { add: number; update: number; unchanged: number; conflict: number };
  items?: PreviewItem[];
  errorClass?: string;
};

const STORE_TYPES: JointArtifactType[] = ["poam", "ssp", "policy", "letter", "diagram", "nessus", "cklb", "tdd", "conops"];
const PARSE_TYPES: ParseArtifactType[] = ["hardware-baseline", "software-baseline", "poam", "ppsm", "nessus", "cklb"];

function labelOf(row: Record<string, string>, kind: string | null) {
  if (kind === "software") return row.name || "(unnamed software)";
  if (kind === "poam") return row.controlId || row.emassPoamId || row.weakness || "(poam row)";
  if (kind === "ppsm") {
    const path = [row.source, row.destination].filter(Boolean).join(" → ");
    return path || row.name || "(flow row)";
  }
  if (kind === "nessus" || kind === "cklb") {
    return row.hostName || row.unmatchedHost || row.pluginId || row.ruleId || "(finding)";
  }
  return row.assetName || row.hostName || "(unnamed asset)";
}

function detailOf(row: Record<string, string>, kind: string | null) {
  if (kind === "software") {
    return [row.version, row.relatedAsset].filter(Boolean).join(" · ");
  }
  if (kind === "poam") {
    return [row.emassPoamId, row.status, row.risk, row.weakness].filter(Boolean).join(" · ");
  }
  if (kind === "ppsm") {
    return [row.protocol, row.port, row.description].filter(Boolean).join(" · ");
  }
  if (kind === "nessus" || kind === "cklb") {
    const cci = cciAdvisoryDisplay(row);
    return [row.pluginId || row.ruleId, row.severity, row.status, row.stigFamily, cci && cci !== "TBD" ? `CCI (advisory) ${cci}` : "CCI (advisory) TBD", row.assetId ? `asset ${row.assetId}` : ""].filter(Boolean).join(" · ");
  }
  return [row.assetType, row.hostName, row.notes].filter(Boolean).join(" · ");
}

export default function Ingest() {
  const { pkg, setPackage } = usePackage();
  const [file, setFile] = useState<File | null>(null);
  const [artifactType, setArtifactType] = useState<ParseArtifactType>("");
  const [strategy, setStrategy] = useState<"merge" | "replace">("merge");
  const [includeInheritedGss, setIncludeInheritedGss] = useState(false);
  const [confirmConflicts, setConfirmConflicts] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [storeType, setStoreType] = useState<JointArtifactType>("diagram");
  const [storeFile, setStoreFile] = useState<File | null>(null);

  async function runPreview() {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (artifactType) body.append("artifactType", artifactType);
      const res = await fetch("/api/ingest/preview", { method: "POST", body });
      const data = (await res.json()) as PreviewResponse;
      if (!res.ok) {
        setPreview(null);
        setMessage(
            data.errorClass === "ClassifiedIngestRejected"
              ? "Classified or secret/TS scan metadata is not parsed."
              : data.errorClass === "UnsupportedIngestType"
                ? "This file type is not parsed this pass (old .ckl XML stays STORE-only)."
                : "Preview failed.",
          );
        return;
      }
      setPreview(data);
    } catch {
      setMessage("Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runApply() {
    if (!file || !preview || preview.mode !== "parse") return;
    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (preview.artifactType) body.append("artifactType", preview.artifactType);
      else if (preview.kind === "software") body.append("artifactType", "software-baseline");
      else if (preview.kind === "hardware") body.append("artifactType", "hardware-baseline");
      else if (preview.kind) body.append("artifactType", preview.kind);
      body.append("strategy", strategy);
      if (includeInheritedGss) body.append("includeInheritedGss", "true");
      if (confirmConflicts) body.append("confirmConflicts", "true");
      const res = await fetch("/api/ingest/apply", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setMessage("Apply failed.");
        return;
      }
      if (data.package) setPackage(() => data.package as AaPackage);
      const a = data.applied || {};
      setMessage(`Applied: ${a.added || 0} added, ${a.updated || 0} updated, ${a.unchanged || 0} unchanged, ${a.skipped || 0} skipped.`);
      setPreview(null);
    } catch {
      setMessage("Apply failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runStore() {
    if (!storeFile) return;
    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", storeFile);
      body.append("artifactType", storeType);
      const res = await fetch("/api/ingest/store", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setMessage("Store failed.");
        return;
      }
      if (data.package) setPackage(() => data.package as AaPackage);
      setMessage("Stored encrypted original bytes (STORE-only).");
      setStoreFile(null);
    } catch {
      setMessage("Store failed.");
    } finally {
      setBusy(false);
    }
  }

  const gssConflicts = (preview?.items || []).filter((item) => item.reason.startsWith("inherited-gss"));
  const unknownControls = (preview?.items || []).filter((item) => item.reason === "unknown-control");
  const otherConflicts = (preview?.items || []).filter(
    (item) => item.status === "conflict" && !item.reason.startsWith("inherited-gss") && item.reason !== "unknown-control",
  );

  return (
    <div>
      <div className="kicker">Ingest · working papers</div>
      <h1>Ingest working papers</h1>
      <p>
        PARSE Joint eMASS-oriented hardware/software CSV or XLSX, POA&amp;M CSV (existing columns only), a simple PPSM
        ports/protocols CSV, or CUI/unclassified .nessus / .cklb scans. Preview the merge, then apply. STORE-only uploads
        keep original bytes encrypted and tagged (POA&amp;M, SSP, policy, letter, diagram, nessus, cklb) with a new id per
        upload. POA&amp;M can be parsed and/or stored as an original. This is not an official DISA template and not a live
        eMASS connection. No sync button. Old .ckl XML is not parsed (STORE-only). Scan findings do not auto-mark NIST
        controls Satisfied. CCI ids from the file are advisory only (TBD if absent). Scan PARSE does not seed POA&amp;Ms — use the separate open-finding seed on STIG / POA&amp;M (Control blank).
      </p>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>PARSE tabular / scans</h2>
        <label>File (CSV, XLSX, .nessus, or .cklb)</label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.nessus,.cklb"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
          }}
        />
        <div className="grid two">
          <div>
            <label>Artifact type</label>
            <select value={artifactType} onChange={(e) => setArtifactType(e.target.value as ParseArtifactType)}>
              <option value="">Auto-detect from headers</option>
              {PARSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Strategy</label>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)}>
              <option value="merge">Merge (keep rows absent from upload)</option>
              <option value="replace">Replace (drop rows absent from upload)</option>
            </select>
          </div>
        </div>
        <p>
          POA&amp;M uses existing columns only (eMASS_POAM_ID, Control, Weakness, …). Blank eMASS_POAM_ID stays
          TBD-eMASS. Control IDs must already exist on this package (controls keys) — unknown IDs are skipped/conflict
          and never minted from a NIST catalog. POA&amp;M originals can also be STORE-only (parse and/or attach). PPSM
          headers (Source, Destination, Protocol, Port, Description) are workspace working-paper names, not an official
          DISA/PPSM template. Rows map to dataFlows only; empty inbound/outbound stay TBD. Protocol and Port from the
          file go on optional dataFlow protocol/port fields; name stays a human label (description or source→dest).
          Default merge does not silently overwrite. .nessus and .cklb findings match Host Name then Asset Name; unmatched
          hosts are conflicts (not silent new assets). F5/proxy scan hosts are inherited/GSS and are not added to the SLDSS
          hardware list without confirm. Classified/secret/TS metadata is rejected. Jump hosts stay Windows Server (not
          Workstation). PostgreSQL VM hosts may match by hostname; host OS STIG is not guessed as RHEL.
        </p>
        <div className="row">
          <button type="button" className="primary" disabled={!file || busy} onClick={() => void runPreview()}>
            Preview
          </button>
          <button
            type="button"
            disabled={!preview || preview.mode !== "parse" || busy}
            onClick={() => void runApply()}
          >
            Apply
          </button>
        </div>
        {preview?.mode === "store-only" ? (
          <p>This file is not tabular. Use STORE-only below (POA&amp;M may be parse and/or store-only).</p>
        ) : null}
        {preview?.counts ? (
          <p>
            {preview.artifactType || preview.kind} · add {preview.counts.add} · update {preview.counts.update} · unchanged{" "}
            {preview.counts.unchanged} · conflict {preview.counts.conflict}
          </p>
        ) : null}
        {gssConflicts.length > 0 ? (
          <label>
            <input type="checkbox" style={{ width: "auto" }} checked={includeInheritedGss} onChange={(e) => setIncludeInheritedGss(e.target.checked)} /> Confirm
            inherited/GSS (including F5/proxy) rows onto this system hardware list
          </label>
        ) : null}
        {unknownControls.length > 0 ? (
          <p>Unknown control IDs are skipped and are not added to the package catalog.</p>
        ) : null}
        {otherConflicts.length > 0 ? (
          <label>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={confirmConflicts}
              onChange={(e) => setConfirmConflicts(e.target.checked)}
            />{" "}
            Confirm other conflicts (field mismatch, unmatched host, ambiguous, or missing match key). Confirmed unmatched
            hosts are stored as findings only — they are not added to the hardware list.
          </label>
        ) : null}
        {preview?.items && preview.items.length > 0 ? (
          <div style={{ overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Row</th>
                  <th>Detail</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {preview.items.map((item) => (
                  <tr key={item.index}>
                    <td>
                      <span className={`pill ${item.status === "conflict" ? "warning" : item.status === "add" ? "ok" : "info"}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>{labelOf(item.incoming, preview.kind)}</td>
                    <td>{detailOf(item.incoming, preview.kind)}</td>
                    <td className="mono">{item.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>STORE-only (tagged original bytes)</h2>
        <p>
          Upload, tag, encrypt. New id per upload. POA&amp;M may be attached here even when PARSE ran or failed; parse
          success still stores the original encrypted. SSP, policy, letter, and diagram are never parsed into narrative.
          nessus/cklb may also be attached here without PARSE (use PARSE above for .nessus/.cklb findings). Old .ckl XML
          stays STORE-only.
        </p>
        <label>Joint artifact type</label>
        <select value={storeType} onChange={(e) => setStoreType(e.target.value as JointArtifactType)}>
          {STORE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label>File</label>
        <input type="file" onChange={(e) => setStoreFile(e.target.files?.[0] ?? null)} />
        <div className="row">
          <button type="button" className="primary" disabled={!storeFile || busy} onClick={() => void runStore()}>
            Store encrypted
          </button>
        </div>
      </div>

      {message ? <p>{message}</p> : null}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>Scan findings ({pkg.scanFindings?.length || 0})</h2>
        <p>
          Structured list from PARSE apply. assetId when matched; unmatchedHost when not. No canvas. Findings do not set
          control assessment to Satisfied. CCI identifiers are advisory copies from the file (TBD if the file has none)
          and do not change selection, implementation, or assessment.
        </p>
        {(pkg.scanFindings || []).length === 0 ? (
          <p>None stored yet.</p>
        ) : (
          <div style={{ overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Match</th>
                  <th>Plugin / rule</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Family</th>
                  <th>Source</th>
                  <th>CCI (advisory)</th>
                </tr>
              </thead>
              <tbody>
                {(pkg.scanFindings || []).map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.hostName || row.unmatchedHost || "—"}</td>
                    <td>{row.assetId ? row.assetId : row.unmatchedHost ? "unmatched" : "—"}</td>
                    <td className="mono">{row.pluginId || row.ruleId || "—"}</td>
                    <td>{row.severity || "—"}</td>
                    <td>{row.status || "—"}</td>
                    <td>{row.stigFamily || "—"}</td>
                    <td>{row.sourceType || "—"}</td>
                    <td className="mono">{cciAdvisoryDisplay(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Tagged artifacts ({pkg.artifacts.length})</h2>
        {pkg.artifacts.length === 0 ? (
          <p>None stored yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Mode</th>
                <th>Original name</th>
              </tr>
            </thead>
            <tbody>
              {pkg.artifacts.map((row) => (
                <tr key={row.id}>
                  <td>{row.artifactType}</td>
                  <td>{row.mode}</td>
                  <td className="mono">{row.originalName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

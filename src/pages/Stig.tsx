import { useState } from "react";
import {
  STIG_FAMILY_LABELS,
  STIG_PRODUCT_FAMILIES,
  stigFamilyFor,
  stigOfficialIdFor,
  unassignedAssets,
  upsertStigAssignment,
} from "../lib/stig.mjs";
import { cciAdvisoryDisplay } from "../lib/ingest/scan.mjs";
import { usePackage } from "../lib/store";
import type { StigProductFamily, StigTargetKind } from "../types";

function familySelectValue(pkg: { stigAssignments?: unknown }, kind: StigTargetKind, id: string) {
  return stigFamilyFor(pkg, kind, id) || "";
}

type SeedPreview = {
  ok: boolean;
  counts?: { add: number; update: number; unchanged: number; conflict: number };
  items?: Array<{ status: string; reason: string; index: number; incoming: Record<string, string> }>;
  applied?: { added: number; updated: number; unchanged: number; skipped: number };
};

export default function StigMatrix() {
  const { pkg, setPackage } = usePackage();
  const unassigned = unassignedAssets(pkg);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedPreview, setSeedPreview] = useState<SeedPreview | null>(null);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [confirmSeedConflicts, setConfirmSeedConflicts] = useState(false);

  async function previewPoamSeed() {
    setSeedBusy(true);
    setSeedMessage(null);
    try {
      const res = await fetch("/api/ingest/poam-seed/preview", { method: "POST" });
      const data = (await res.json()) as SeedPreview;
      if (!res.ok) {
        setSeedPreview(null);
        setSeedMessage("POA&M seed preview failed.");
        return;
      }
      setSeedPreview(data);
    } catch {
      setSeedMessage("POA&M seed preview failed.");
    } finally {
      setSeedBusy(false);
    }
  }

  async function applyPoamSeed() {
    if (!seedPreview) return;
    setSeedBusy(true);
    setSeedMessage(null);
    try {
      const res = await fetch("/api/ingest/poam-seed/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmConflicts: confirmSeedConflicts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSeedMessage("POA&M seed apply failed.");
        return;
      }
      if (data.package) setPackage(() => data.package);
      const a = data.applied || {};
      setSeedMessage(`Seeded: ${a.added || 0} added, ${a.updated || 0} updated, ${a.unchanged || 0} unchanged, ${a.skipped || 0} skipped.`);
      setSeedPreview(null);
    } catch {
      setSeedMessage("POA&M seed apply failed.");
    } finally {
      setSeedBusy(false);
    }
  }


  function patchAssignment(targetKind: StigTargetKind, targetId: string, family: string, officialId: string) {
    setPackage((p) => ({
      ...p,
      stigAssignments: upsertStigAssignment(p.stigAssignments, {
        targetKind,
        targetId,
        stigProductFamily: family,
        officialId,
      }),
    }));
  }

  return (
    <div>
      <div className="kicker">CM-6 · STIG coverage</div>
      <h1>STIG matrix</h1>
      <p>
        Workspace product-family tags for SLDSS hosts and software. Allowed families are rhel-8, windows-server, and
        postgresql only. Official DISA STIG identifiers stay blank or TBD until pasted — this app does not invent them.
        Assignments do not auto-mark controls Satisfied. The F5/proxy pair is GSS-managed inherited and is not an SLDSS
        host or STIG/CKLB row. The site-to-site VPN interconnect has no STIG row. PostgreSQL STIG is on the software
        row, not the VM host OS (hosts stay unassigned; do not guess RHEL). .nessus and .cklb may be parsed into the
        findings list below; they do not auto-Satisfied controls. CCI identifiers copied from the file are advisory
        only (TBD when the file has none) and do not set selection, implementation, or assessment. Open findings may
        seed POA&amp;M rows through a separate preview/apply (Control blank). Old .ckl XML stays STORE-only.
      </p>

      <div className="card" style={{ marginBottom: "1rem" }} id="stig-unassigned">
        <h2>Unassigned hosts ({unassigned.length})</h2>
        {unassigned.length === 0 ? (
          <p>Every hardware row has a product family.</p>
        ) : (
          <ul>
            {unassigned.map((row) => (
              <li key={row.id}>
                <span className="pill warning">unassigned</span> {row.assetName || "(unnamed)"}{" "}
                <span className="muted">
                  {row.assetType}
                  {row.osFirmware ? ` · ${row.osFirmware}` : " · OS/firmware blank"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2>Assets vs family</h2>
      <div className="card" style={{ overflow: "auto", marginBottom: "1.25rem" }}>
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Type</th>
              <th>OS/Firmware</th>
              {STIG_PRODUCT_FAMILIES.map((family) => (
                <th key={family}>{STIG_FAMILY_LABELS[family]}</th>
              ))}
              <th>Family</th>
              <th>Official ID</th>
            </tr>
          </thead>
          <tbody>
            {pkg.assets.map((row) => {
              const family = familySelectValue(pkg, "asset", row.id);
              const official = stigOfficialIdFor(pkg, "asset", row.id);
              return (
                <tr key={row.id} className={family ? undefined : "unassigned"}>
                  <td>{row.assetName || "(unnamed)"}</td>
                  <td>{row.assetType}</td>
                  <td>{row.osFirmware || "—"}</td>
                  {STIG_PRODUCT_FAMILIES.map((col) => (
                    <td key={col} className="mono">
                      {family === col ? <span className="pill ok">yes</span> : "—"}
                    </td>
                  ))}
                  <td>
                    <select
                      value={family}
                      onChange={(e) => patchAssignment("asset", row.id, e.target.value, official)}
                    >
                      <option value="">Unassigned</option>
                      {STIG_PRODUCT_FAMILIES.map((item) => (
                        <option key={item} value={item}>
                          {STIG_FAMILY_LABELS[item as StigProductFamily]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={official}
                      placeholder="TBD"
                      onChange={(e) => patchAssignment("asset", row.id, family || "", e.target.value)}
                      disabled={!family}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Software-row STIGs</h2>
      <p>
        Application STIGs attach to the software inventory row (for example PostgreSQL), not the host OS. Host OS remains
        a separate asset assignment.
      </p>
      <div className="card" style={{ overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Software</th>
              <th>Version</th>
              <th>Related asset/host</th>
              {STIG_PRODUCT_FAMILIES.map((family) => (
                <th key={family}>{STIG_FAMILY_LABELS[family]}</th>
              ))}
              <th>Family</th>
              <th>Official ID</th>
            </tr>
          </thead>
          <tbody>
            {pkg.software.map((row) => {
              const family = familySelectValue(pkg, "software", row.id);
              const official = stigOfficialIdFor(pkg, "software", row.id);
              return (
                <tr key={row.id}>
                  <td>{row.name || "(unnamed)"}</td>
                  <td>{row.version || "—"}</td>
                  <td>{row.relatedAsset || "—"}</td>
                  {STIG_PRODUCT_FAMILIES.map((col) => (
                    <td key={col} className="mono">
                      {family === col ? <span className="pill ok">yes</span> : "—"}
                    </td>
                  ))}
                  <td>
                    <select
                      value={family}
                      onChange={(e) => patchAssignment("software", row.id, e.target.value, official)}
                    >
                      <option value="">Unassigned</option>
                      {STIG_PRODUCT_FAMILIES.map((item) => (
                        <option key={item} value={item}>
                          {STIG_FAMILY_LABELS[item as StigProductFamily]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={official}
                      placeholder="TBD"
                      onChange={(e) => patchAssignment("software", row.id, family || "", e.target.value)}
                      disabled={!family}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Scan findings</h2>
      <p>
        Findings from PARSE of .nessus / .cklb, matched to hardware by Host Name then Asset Name. Unmatched hosts stay
        unmatched (not silent new assets). F5/proxy is inherited/GSS and is not an SLDSS hardware row. CCI ids below are
        advisory copies from the file (TBD if absent). They do not auto-trace to NIST Satisfied and do not seed POA&amp;Ms
        by themselves.
      </p>
      <div className="card" style={{ overflow: "auto" }}>
        {(pkg.scanFindings || []).length === 0 ? (
          <p>No scan findings stored. PARSE a CUI/unclassified .nessus or .cklb on eMASS ingest.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Host</th>
                <th>Asset</th>
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
                  <td className="mono">{row.assetId || (row.unmatchedHost ? "unmatched" : "—")}</td>
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
        )}
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2>POA&amp;M seed from open findings</h2>
        <p>
          Separate from scan PARSE apply. Only <span className="mono">open</span> findings. Weakness and Description
          come from the finding title and plugin/rule id. Control stays blank — findings have no NIST IDs, and unknown
          Control is skipped (never minted). eMASS_POAM_ID stays TBD-eMASS unless already pasted. Existing POA&amp;M
          columns only. Merge preview; no silent overwrite. Does not auto-mark controls Satisfied.
        </p>
        <div className="row">
          <button type="button" className="primary" disabled={seedBusy} onClick={() => void previewPoamSeed()}>
            Preview POA&amp;M seed
          </button>
          <button type="button" disabled={!seedPreview || seedBusy} onClick={() => void applyPoamSeed()}>
            Apply seed
          </button>
        </div>
        {seedPreview?.counts ? (
          <p>
            add {seedPreview.counts.add} · update {seedPreview.counts.update} · unchanged {seedPreview.counts.unchanged}{" "}
            · conflict {seedPreview.counts.conflict}
          </p>
        ) : null}
        {(seedPreview?.items || []).some((item) => item.status === "conflict" && item.reason !== "unknown-control") ? (
          <label>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={confirmSeedConflicts}
              onChange={(e) => setConfirmSeedConflicts(e.target.checked)}
            />{" "}
            Confirm field-mismatch conflicts (unknown Control is always skipped)
          </label>
        ) : null}
        {(seedPreview?.items || []).some((item) => item.reason === "unknown-control") ? (
          <p>Unknown control IDs are skipped and are not added to the package catalog.</p>
        ) : null}
        {seedPreview?.items && seedPreview.items.length > 0 ? (
          <div style={{ overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Weakness</th>
                  <th>Control</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {seedPreview.items.map((item) => (
                  <tr key={item.index}>
                    <td>
                      <span className={`pill ${item.status === "conflict" ? "warning" : item.status === "add" ? "ok" : "info"}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>{item.incoming.weakness || item.incoming.description || "(finding)"}</td>
                    <td className="mono">{item.incoming.controlId || "(blank)"}</td>
                    <td className="mono">{item.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {seedMessage ? <p>{seedMessage}</p> : null}
      </div>
    </div>
  );
}

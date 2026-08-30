import { useState } from "react";
import { emptyAsset, emptySoftware } from "../lib/inventory.mjs";
import { Link } from "react-router-dom";
import { usePackage } from "../lib/store";
import type { Asset, SoftwareItem } from "../types";

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export default function Assets() {
  const { pkg, setPackage } = usePackage();
  const [selHw, setSelHw] = useState<string | null>(pkg.assets[0]?.id ?? null);
  const [selSw, setSelSw] = useState<string | null>(pkg.software[0]?.id ?? null);
  const hw = pkg.assets.find((a) => a.id === selHw);
  const sw = pkg.software.find((s) => s.id === selSw);

  function patchHw(id: string, partial: Partial<Asset>) {
    setPackage((p) => ({
      ...p,
      assets: p.assets.map((row) => (row.id === id ? { ...row, ...partial } : row)),
    }));
  }

  function patchSw(id: string, partial: Partial<SoftwareItem>) {
    setPackage((p) => ({
      ...p,
      software: p.software.map((row) => (row.id === id ? { ...row, ...partial } : row)),
    }));
  }

  return (
    <div>
      <div className="kicker">CM-8 · inventory</div>
      <h1>Hardware and software</h1>
      <p>
        SLDSS authorization-boundary hosts and software for eMASS HW/SW working papers. Joint eMASS has no Jump Host
        type: jump hosts use Asset Type Server and role/function/notes Jump host, with OS/firmware Windows Server
        (version blank). The site-to-site VPN concentrator is an inherited/GSS interconnect, not a 9th SLDSS host.
        The F5/proxy pair is GSS-managed (inherited) and is not on this SLDSS hardware list — no SLDSS STIG/CKLB row
        for F5. Host names, serials, IPs, and MACs stay blank until the CMDB/spreadsheet is pasted. Product-family STIG
        tags (rhel-8 / windows-server / postgresql) live on the STIG matrix. No eMASS sync.
      </p>

      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => {
            const n = emptyAsset(newId("asset"));
            setPackage((p) => ({ ...p, assets: [...p.assets, n] }));
            setSelHw(n.id);
          }}
        >
          Add hardware
        </button>
        <button
          type="button"
          onClick={() => {
            const n = emptySoftware(newId("software"));
            setPackage((p) => ({ ...p, software: [...p.software, n] }));
            setSelSw(n.id);
          }}
        >
          Add software
        </button>
        <Link className="btn" to="/stig">
          STIG matrix
        </Link>
      </div>

      <h2>SLDSS hardware ({pkg.assets.length})</h2>
      <div className="split">
        <div className="card" style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Asset name</th>
                <th>Type</th>
                <th>Notes</th>
                <th>OS/Firmware</th>
                <th>Host name</th>
              </tr>
            </thead>
            <tbody>
              {pkg.assets.map((row) => (
                <tr key={row.id} className="clickable" onClick={() => setSelHw(row.id)}>
                  <td>{row.assetName || "(unnamed)"}</td>
                  <td>{row.assetType}</td>
                  <td>{row.notes}</td>
                  <td>{row.osFirmware}</td>
                  <td className="mono">{row.hostName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          {hw ? (
            <>
              <label>Asset name</label>
              <input value={hw.assetName} onChange={(e) => patchHw(hw.id, { assetName: e.target.value })} />
              <label>Asset type</label>
              <input value={hw.assetType} onChange={(e) => patchHw(hw.id, { assetType: e.target.value })} />
              <div className="grid two">
                <div>
                  <label>Manufacturer</label>
                  <input value={hw.manufacturer} onChange={(e) => patchHw(hw.id, { manufacturer: e.target.value })} />
                </div>
                <div>
                  <label>Model</label>
                  <input value={hw.model} onChange={(e) => patchHw(hw.id, { model: e.target.value })} />
                </div>
              </div>
              <label>Serial number</label>
              <input value={hw.serialNumber} onChange={(e) => patchHw(hw.id, { serialNumber: e.target.value })} />
              <label>Host name</label>
              <input value={hw.hostName} onChange={(e) => patchHw(hw.id, { hostName: e.target.value })} />
              <div className="grid two">
                <div>
                  <label>IP address</label>
                  <input value={hw.ipAddress} onChange={(e) => patchHw(hw.id, { ipAddress: e.target.value })} />
                </div>
                <div>
                  <label>MAC address</label>
                  <input value={hw.macAddress} onChange={(e) => patchHw(hw.id, { macAddress: e.target.value })} />
                </div>
              </div>
              <label>OS / firmware</label>
              <input value={hw.osFirmware} onChange={(e) => patchHw(hw.id, { osFirmware: e.target.value })} />
              <label>Location</label>
              <input value={hw.location} onChange={(e) => patchHw(hw.id, { location: e.target.value })} />
              <label>Role / function / notes (workspace only — not an eMASS Asset Type)</label>
              <textarea value={hw.notes} onChange={(e) => patchHw(hw.id, { notes: e.target.value })} />
              <div className="row">
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setPackage((p) => ({ ...p, assets: p.assets.filter((x) => x.id !== hw.id) }));
                    setSelHw(null);
                  }}
                >
                  Delete hardware
                </button>
              </div>
            </>
          ) : (
            <p>Select or add a hardware asset.</p>
          )}
        </div>
      </div>

      <h2 style={{ marginTop: "1.25rem" }}>Software ({pkg.software.length})</h2>
      <div className="split">
        <div className="card" style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Vendor</th>
                <th>Version</th>
                <th>Related asset/host</th>
              </tr>
            </thead>
            <tbody>
              {pkg.software.map((row) => (
                <tr key={row.id} className="clickable" onClick={() => setSelSw(row.id)}>
                  <td>{row.name || "(unnamed)"}</td>
                  <td>{row.vendor}</td>
                  <td>{row.version}</td>
                  <td>{row.relatedAsset}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          {sw ? (
            <>
              <label>Software name</label>
              <input value={sw.name} onChange={(e) => patchSw(sw.id, { name: e.target.value })} />
              <label>Vendor</label>
              <input value={sw.vendor} onChange={(e) => patchSw(sw.id, { vendor: e.target.value })} />
              <label>Version</label>
              <input value={sw.version} onChange={(e) => patchSw(sw.id, { version: e.target.value })} />
              <label>License</label>
              <input value={sw.license} onChange={(e) => patchSw(sw.id, { license: e.target.value })} />
              <label>Related asset / host</label>
              <textarea value={sw.relatedAsset} onChange={(e) => patchSw(sw.id, { relatedAsset: e.target.value })} />
              <div className="row">
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setPackage((p) => ({ ...p, software: p.software.filter((x) => x.id !== sw.id) }));
                    setSelSw(null);
                  }}
                >
                  Delete software
                </button>
              </div>
            </>
          ) : (
            <p>Select or add a software item.</p>
          )}
        </div>
      </div>
    </div>
  );
}

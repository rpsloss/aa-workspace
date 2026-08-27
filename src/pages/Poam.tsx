import { useState } from "react";
import { usePackage } from "../lib/store";
import type { PoamItem, PoamRisk, PoamStatus } from "../types";

const risks: PoamRisk[] = ["Very High", "High", "Moderate", "Low", "Very Low"];

function blank(): PoamItem {
  return {
    id: `poam-${crypto.randomUUID().slice(0, 8)}`,
    emassPoamId: "TBD-eMASS",
    controlId: "",
    weakness: "",
    description: "",
    source: "Self-assessment",
    status: "open",
    risk: "Moderate",
    residualRisk: "Low",
    resources: "",
    scheduledCompletion: "",
    milestones: "",
    poc: "",
    comments: "",
    atoBlocker: false,
  };
}

export default function Poam() {
  const { pkg, setPackage } = usePackage();
  const [sel, setSel] = useState<string | null>(pkg.poams[0]?.id ?? null);
  const item = pkg.poams.find((p) => p.id === sel);

  function patch(id: string, partial: Partial<PoamItem>) {
    setPackage((p) => ({
      ...p,
      poams: p.poams.map((x) => (x.id === id ? { ...x, ...partial } : x)),
    }));
  }

  return (
    <div>
      <div className="kicker">CA-5 · residual risk</div>
      <h1>POA&amp;M</h1>
      <p>
        Working POA&amp;M register aligned to typical eMASS fields. Assign eMASS POA&amp;M IDs after create-in-eMASS.
        Mark ATO blockers for the dashboard.
      </p>
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => {
            const n = blank();
            setPackage((p) => ({ ...p, poams: [n, ...p.poams] }));
            setSel(n.id);
          }}
        >
          Add POA&amp;M
        </button>
      </div>
      <div className="split">
        <div className="card" style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Control</th>
                <th>Risk</th>
                <th>Status</th>
                <th>ATO</th>
                <th>Weakness</th>
              </tr>
            </thead>
            <tbody>
              {pkg.poams.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => setSel(p.id)}>
                  <td className="mono">{p.controlId}</td>
                  <td>{p.risk}</td>
                  <td>{p.status}</td>
                  <td>{p.atoBlocker ? "blocker" : ""}</td>
                  <td>{p.weakness}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          {item ? (
            <>
              <label>Control ID</label>
              <input value={item.controlId} onChange={(e) => patch(item.id, { controlId: e.target.value })} />
              <label>eMASS POA&amp;M ID</label>
              <input value={item.emassPoamId} onChange={(e) => patch(item.id, { emassPoamId: e.target.value })} />
              <label>Weakness (short)</label>
              <input value={item.weakness} onChange={(e) => patch(item.id, { weakness: e.target.value })} />
              <label>Description</label>
              <textarea value={item.description} onChange={(e) => patch(item.id, { description: e.target.value })} />
              <label>Source</label>
              <input value={item.source} onChange={(e) => patch(item.id, { source: e.target.value })} />
              <div className="grid two">
                <div>
                  <label>Status</label>
                  <select value={item.status} onChange={(e) => patch(item.id, { status: e.target.value as PoamStatus })}>
                    <option value="open">Open</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="risk-accepted">Risk accepted</option>
                    <option value="completed">Completed</option>
                    <option value="canceled">Canceled</option>
                  </select>
                </div>
                <div>
                  <label>Scheduled completion</label>
                  <input
                    type="date"
                    value={item.scheduledCompletion}
                    onChange={(e) => patch(item.id, { scheduledCompletion: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid two">
                <div>
                  <label>Risk</label>
                  <select value={item.risk} onChange={(e) => patch(item.id, { risk: e.target.value as PoamRisk })}>
                    {risks.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Residual risk</label>
                  <select
                    value={item.residualRisk}
                    onChange={(e) => patch(item.id, { residualRisk: e.target.value as PoamRisk })}
                  >
                    {risks.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label>Resources</label>
              <input value={item.resources} onChange={(e) => patch(item.id, { resources: e.target.value })} />
              <label>Milestones</label>
              <textarea value={item.milestones} onChange={(e) => patch(item.id, { milestones: e.target.value })} />
              <label>POC</label>
              <input value={item.poc} onChange={(e) => patch(item.id, { poc: e.target.value })} />
              <label>Comments</label>
              <textarea value={item.comments} onChange={(e) => patch(item.id, { comments: e.target.value })} />
              <label>
                <input
                  type="checkbox"
                  checked={item.atoBlocker}
                  onChange={(e) => patch(item.id, { atoBlocker: e.target.checked })}
                  style={{ width: "auto", marginRight: 8 }}
                />
                Treat as ATO blocker
              </label>
              <div className="row">
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setPackage((p) => ({ ...p, poams: p.poams.filter((x) => x.id !== item.id) }));
                    setSel(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          ) : (
            <p>Select or add a POA&amp;M.</p>
          )}
        </div>
      </div>
    </div>
  );
}

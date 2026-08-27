import { useState } from "react";
import { usePackage } from "../lib/store";
import type { EvidenceItem, EvidenceType } from "../types";

const types: EvidenceType[] = [
  "policy",
  "procedure",
  "screenshot",
  "scan",
  "config",
  "interview",
  "test",
  "diagram",
  "artifact",
];

function blank(): EvidenceItem {
  return {
    id: `ev-${crypto.randomUUID().slice(0, 8)}`,
    title: "",
    controlIds: [],
    type: "artifact",
    source: "",
    collectedOn: new Date().toISOString().slice(0, 10),
    collector: "",
    notes: "",
    storedName: "",
    originalName: "",
  };
}

export default function Evidence() {
  const { pkg, setPackage } = usePackage();
  const [sel, setSel] = useState<string | null>(pkg.evidence[0]?.id ?? null);
  const item = pkg.evidence.find((e) => e.id === sel);

  function patch(id: string, partial: Partial<EvidenceItem>) {
    setPackage((p) => ({
      ...p,
      evidence: p.evidence.map((e) => (e.id === id ? { ...e, ...partial } : e)),
    }));
  }

  async function upload(file: File) {
    if (!item) return;
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/evidence/upload", { method: "POST", body });
    if (!res.ok) return;
    const data = await res.json();
    patch(item.id, { storedName: data.storedName, originalName: data.originalName });
  }

  return (
    <div>
      <div className="kicker">RMF Step 4 · Assess (artifacts)</div>
      <h1>Evidence map</h1>
      <p>
        Index artifacts to controls. Upload is stored under <span className="mono">data/evidence/</span> on this
        machine. Official evidence repositories and eMASS attachments remain authoritative.
      </p>
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => {
            const n = blank();
            setPackage((p) => ({ ...p, evidence: [n, ...p.evidence] }));
            setSel(n.id);
          }}
        >
          Add evidence
        </button>
      </div>
      <div className="split">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {pkg.evidence.map((e) => (
                <tr key={e.id} className="clickable" onClick={() => setSel(e.id)}>
                  <td>{e.title || "(untitled)"}</td>
                  <td>{e.type}</td>
                  <td className="mono">{e.controlIds.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          {item ? (
            <>
              <label>Title</label>
              <input value={item.title} onChange={(e) => patch(item.id, { title: e.target.value })} />
              <label>Type</label>
              <select value={item.type} onChange={(e) => patch(item.id, { type: e.target.value as EvidenceType })}>
                {types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <label>Control IDs (comma-separated)</label>
              <input
                value={item.controlIds.join(", ")}
                onChange={(e) =>
                  patch(item.id, {
                    controlIds: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
              <label>Source</label>
              <input value={item.source} onChange={(e) => patch(item.id, { source: e.target.value })} />
              <label>Collected on</label>
              <input type="date" value={item.collectedOn} onChange={(e) => patch(item.id, { collectedOn: e.target.value })} />
              <label>Collector</label>
              <input value={item.collector} onChange={(e) => patch(item.id, { collector: e.target.value })} />
              <label>Notes</label>
              <textarea value={item.notes} onChange={(e) => patch(item.id, { notes: e.target.value })} />
              <label>Attach file (optional)</label>
              <input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
              {item.storedName ? (
                <p className="muted">
                  Stored as {item.originalName} ({item.storedName})
                </p>
              ) : null}
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setPackage((p) => ({ ...p, evidence: p.evidence.filter((e) => e.id !== item.id) }));
                  setSel(null);
                }}
              >
                Delete record
              </button>
            </>
          ) : (
            <p>Select or add evidence.</p>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { emptyBoundaryEntry, emptyDataFlow, diagramSlot } from "../lib/boundary.mjs";
import { usePackage } from "../lib/store";
import type { BoundaryEntry, DataFlow, EvidenceItem } from "../types";

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

type ListKey = "inbound" | "outbound" | "interconnect";

export default function BoundaryPage() {
  const { pkg, setPackage } = usePackage();
  const [selIn, setSelIn] = useState<string | null>(pkg.boundary.inbound[0]?.id ?? null);
  const [selOut, setSelOut] = useState<string | null>(pkg.boundary.outbound[0]?.id ?? null);
  const [selIx, setSelIx] = useState<string | null>(pkg.boundary.interconnect[0]?.id ?? null);
  const [selFlow, setSelFlow] = useState<string | null>(pkg.dataFlows[0]?.id ?? null);
  const slot = diagramSlot(pkg);

  function patchList(key: ListKey, id: string, partial: Partial<BoundaryEntry>) {
    setPackage((p) => ({
      ...p,
      boundary: {
        ...p.boundary,
        [key]: p.boundary[key].map((row) => (row.id === id ? { ...row, ...partial } : row)),
      },
    }));
  }

  function addList(key: ListKey) {
    const n = emptyBoundaryEntry(newId(`bnd-${key.slice(0, 2)}`));
    setPackage((p) => ({
      ...p,
      boundary: { ...p.boundary, [key]: [...p.boundary[key], n] },
    }));
    if (key === "inbound") setSelIn(n.id);
    if (key === "outbound") setSelOut(n.id);
    if (key === "interconnect") setSelIx(n.id);
  }

  function deleteList(key: ListKey, id: string) {
    setPackage((p) => ({
      ...p,
      boundary: { ...p.boundary, [key]: p.boundary[key].filter((row) => row.id !== id) },
    }));
    if (key === "inbound") setSelIn(null);
    if (key === "outbound") setSelOut(null);
    if (key === "interconnect") setSelIx(null);
  }

  function patchFlow(id: string, partial: Partial<DataFlow>) {
    setPackage((p) => ({
      ...p,
      dataFlows: p.dataFlows.map((row) => (row.id === id ? { ...row, ...partial } : row)),
    }));
  }

  async function uploadDiagram(file: File) {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/evidence/upload", { method: "POST", body });
    if (!res.ok) return;
    const data = (await res.json()) as { storedName: string; originalName: string };
    setPackage((p) => {
      let id = p.boundaryDiagramEvidenceId;
      let evidence = p.evidence;
      if (!id || !evidence.some((e) => e.id === id)) {
        const n: EvidenceItem = {
          id: newId("ev"),
          title: "Authorization boundary diagram",
          controlIds: [],
          type: "diagram",
          source: "",
          collectedOn: new Date().toISOString().slice(0, 10),
          collector: "",
          notes: "",
          storedName: "",
          originalName: "",
        };
        id = n.id;
        evidence = [n, ...evidence];
      }
      return {
        ...p,
        boundaryDiagramEvidenceId: id,
        evidence: evidence.map((e) =>
          e.id === id ? { ...e, storedName: data.storedName, originalName: data.originalName, type: "diagram" } : e,
        ),
      };
    });
  }

  function ensureDiagramSlot() {
    if (pkg.boundaryDiagramEvidenceId) return;
    const existing = pkg.evidence.find((e) => e.type === "diagram");
    if (existing) {
      setPackage((p) => ({ ...p, boundaryDiagramEvidenceId: existing.id }));
      return;
    }
    const n: EvidenceItem = {
      id: newId("ev"),
      title: "Authorization boundary diagram",
      controlIds: [],
      type: "diagram",
      source: "",
      collectedOn: new Date().toISOString().slice(0, 10),
      collector: "",
      notes: "",
      storedName: "",
      originalName: "",
    };
    setPackage((p) => ({
      ...p,
      boundaryDiagramEvidenceId: n.id,
      evidence: [n, ...p.evidence],
    }));
  }

  const inbound = pkg.boundary.inbound.find((r) => r.id === selIn);
  const outbound = pkg.boundary.outbound.find((r) => r.id === selOut);
  const interconnect = pkg.boundary.interconnect.find((r) => r.id === selIx);
  const flow = pkg.dataFlows.find((r) => r.id === selFlow);

  return (
    <div>
      <div className="kicker">CA-3 · SC-7 · boundary</div>
      <h1>Authorization boundary</h1>
      <p>
        Inbound, outbound, and interconnection tables plus data flows for the SSP. Names should match the system
        narrative. Empty tables export as TBD. The diagram is an evidence file slot — not a canvas editor. VPN
        concentrator stays off the SLDSS hardware list.
      </p>

      <EntryBlock
        title={`Inbound (${pkg.boundary.inbound.length})`}
        rows={pkg.boundary.inbound}
        selected={inbound}
        sel={selIn}
        onSelect={setSelIn}
        onAdd={() => addList("inbound")}
        onPatch={(id, partial) => patchList("inbound", id, partial)}
        onDelete={(id) => deleteList("inbound", id)}
      />
      <EntryBlock
        title={`Outbound (${pkg.boundary.outbound.length})`}
        rows={pkg.boundary.outbound}
        selected={outbound}
        sel={selOut}
        onSelect={setSelOut}
        onAdd={() => addList("outbound")}
        onPatch={(id, partial) => patchList("outbound", id, partial)}
        onDelete={(id) => deleteList("outbound", id)}
      />
      <EntryBlock
        title={`Interconnections (${pkg.boundary.interconnect.length})`}
        rows={pkg.boundary.interconnect}
        selected={interconnect}
        sel={selIx}
        onSelect={setSelIx}
        onAdd={() => addList("interconnect")}
        onPatch={(id, partial) => patchList("interconnect", id, partial)}
        onDelete={(id) => deleteList("interconnect", id)}
      />

      <h2 style={{ marginTop: "1.25rem" }}>Data flows ({pkg.dataFlows.length})</h2>
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => {
            const n = emptyDataFlow(newId("flow"));
            setPackage((p) => ({ ...p, dataFlows: [...p.dataFlows, n] }));
            setSelFlow(n.id);
          }}
        >
          Add data flow
        </button>
      </div>
      <div className="split">
        <div className="card" style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Source</th>
                <th>Destination</th>
              </tr>
            </thead>
            <tbody>
              {pkg.dataFlows.length === 0 ? (
                <tr>
                  <td colSpan={3}>TBD</td>
                </tr>
              ) : (
                pkg.dataFlows.map((row) => (
                  <tr key={row.id} className="clickable" onClick={() => setSelFlow(row.id)}>
                    <td>{row.name || "(unnamed)"}</td>
                    <td>{row.source}</td>
                    <td>{row.destination}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="card">
          {flow ? (
            <>
              <label>Name</label>
              <input value={flow.name} onChange={(e) => patchFlow(flow.id, { name: e.target.value })} />
              <label>Source</label>
              <input value={flow.source} onChange={(e) => patchFlow(flow.id, { source: e.target.value })} />
              <label>Destination</label>
              <input value={flow.destination} onChange={(e) => patchFlow(flow.id, { destination: e.target.value })} />
              <label>Protocol</label>
              <input value={flow.protocol ?? ""} onChange={(e) => patchFlow(flow.id, { protocol: e.target.value })} />
              <label>Port</label>
              <input value={flow.port ?? ""} onChange={(e) => patchFlow(flow.id, { port: e.target.value })} />
              <label>Description</label>
              <textarea value={flow.description} onChange={(e) => patchFlow(flow.id, { description: e.target.value })} />
              <label>Notes</label>
              <textarea value={flow.notes} onChange={(e) => patchFlow(flow.id, { notes: e.target.value })} />
              <div className="row">
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setPackage((p) => ({ ...p, dataFlows: p.dataFlows.filter((x) => x.id !== flow.id) }));
                    setSelFlow(null);
                  }}
                >
                  Delete data flow
                </button>
              </div>
            </>
          ) : (
            <p>Select or add a data flow. Empty table exports as TBD.</p>
          )}
        </div>
      </div>

      <h2 style={{ marginTop: "1.25rem" }}>Boundary diagram (evidence slot)</h2>
      <div className="card">
        <p>
          Attach an existing diagram file through the evidence upload API. No drawing tool. A slot may exist with no
          file.
        </p>
        <label>Evidence record</label>
        <select
          value={pkg.boundaryDiagramEvidenceId}
          onChange={(e) => setPackage((p) => ({ ...p, boundaryDiagramEvidenceId: e.target.value }))}
        >
          <option value="">(none — SSP section TBD)</option>
          {pkg.evidence.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title || e.id} ({e.type})
            </option>
          ))}
        </select>
        <div className="row">
          <button type="button" onClick={ensureDiagramSlot}>
            Create empty diagram slot
          </button>
        </div>
        <label>Attach file (optional)</label>
        <input
          type="file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadDiagram(f);
          }}
        />
        {slot.hasSlot ? (
          <p className="muted">
            Slot: {slot.title || slot.evidenceId}.{" "}
            {slot.hasFile ? `File: ${slot.originalName} (${slot.storedName})` : "No file attached."}
          </p>
        ) : (
          <p className="muted">No diagram evidence selected. SSP will show TBD for this section.</p>
        )}
      </div>
    </div>
  );
}

function EntryBlock({
  title,
  rows,
  selected,
  sel,
  onSelect,
  onAdd,
  onPatch,
  onDelete,
}: {
  title: string;
  rows: BoundaryEntry[];
  selected: BoundaryEntry | undefined;
  sel: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onPatch: (id: string, partial: Partial<BoundaryEntry>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <h2 style={{ marginTop: "1.25rem" }}>{title}</h2>
      <div className="row">
        <button type="button" className="primary" onClick={onAdd}>
          Add row
        </button>
      </div>
      <div className="split">
        <div className="card" style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Ownership</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3}>TBD</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className={`clickable${sel === row.id ? " active" : ""}`} onClick={() => onSelect(row.id)}>
                    <td>{row.name || "(unnamed)"}</td>
                    <td>{row.description}</td>
                    <td>{row.ownership}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="card">
          {selected ? (
            <>
              <label>Name</label>
              <input value={selected.name} onChange={(e) => onPatch(selected.id, { name: e.target.value })} />
              <label>Description</label>
              <textarea
                value={selected.description}
                onChange={(e) => onPatch(selected.id, { description: e.target.value })}
              />
              <label>Ownership</label>
              <input
                value={selected.ownership}
                onChange={(e) => onPatch(selected.id, { ownership: e.target.value })}
                placeholder="inherited, if the narrative says so"
              />
              <label>Notes</label>
              <textarea value={selected.notes} onChange={(e) => onPatch(selected.id, { notes: e.target.value })} />
              <div className="row">
                <button type="button" className="danger" onClick={() => onDelete(selected.id)}>
                  Delete row
                </button>
              </div>
            </>
          ) : (
            <p>Select or add a row. Empty table exports as TBD.</p>
          )}
        </div>
      </div>
    </>
  );
}

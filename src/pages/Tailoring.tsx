import { useMemo, useState } from "react";
import { CATALOG, CATALOG_BY_ID, FAMILIES } from "../data/catalog";
import { controlList } from "../lib/blockers";
import { usePackage } from "../lib/store";
import type { ControlRecord, ImplementationStatus, SelectionStatus } from "../types";

export default function Tailoring() {
  const { pkg, setPackage, retargetFromIntake } = usePackage();
  const [family, setFamily] = useState("ALL");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const rows = controlList(pkg);
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const meta = CATALOG_BY_ID[r.controlId];
      if (family !== "ALL" && meta?.family !== family) return false;
      const hay = `${r.controlId} ${meta?.title ?? ""} ${r.implementation} ${r.selection}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [rows, family, q]);
  const selected = sel ? pkg.controls[sel] : null;
  const meta = sel ? CATALOG_BY_ID[sel] : null;

  function patch(id: string, partial: Partial<ControlRecord>) {
    setPackage((p) => ({
      ...p,
      controls: { ...p.controls, [id]: { ...p.controls[id], ...partial } },
    }));
  }

  const counts = {
    total: rows.length,
    inScope: rows.filter((r) => r.selection === "in-scope").length,
    inherited: rows.filter((r) => r.selection === "inherited").length,
    na: rows.filter((r) => r.selection === "not-applicable").length,
    out: rows.filter((r) => r.selection === "tailored-out").length,
  };

  return (
    <div>
      <div className="kicker">RMF Step 2 · Select</div>
      <h1>800-53 Rev 5 tailoring</h1>
      <p>
        Working baseline for this package ({CATALOG.length} catalog entries). Overlays come from intake. Adjust
        selection, inheritance, and N/A here; write implementation on the SSP page.
      </p>
      <div className="row">
        <button type="button" onClick={retargetFromIntake}>
          Rebuild from overlays
        </button>
        <span className="muted">
          {counts.total} selected · {counts.inScope} in-scope · {counts.inherited} inherited · {counts.na} N/A ·{" "}
          {counts.out} tailored out
        </span>
      </div>
      <div className="grid two">
        <div>
          <label>Family</label>
          <select value={family} onChange={(e) => setFamily(e.target.value)}>
            <option value="ALL">All families</option>
            {FAMILIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id} — {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="AC-2, boundary, inherited…" />
        </div>
      </div>
      <div className="split">
        <div className="card" style={{ overflow: "auto", maxHeight: "70vh" }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Selection</th>
                <th>Impl</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.controlId} className="clickable" onClick={() => setSel(r.controlId)}>
                  <td className="mono">{r.controlId}</td>
                  <td>{CATALOG_BY_ID[r.controlId]?.title}</td>
                  <td>{r.selection}</td>
                  <td>{r.implementation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          {selected && meta ? (
            <>
              <h2>
                {selected.controlId} {meta.title}
              </h2>
              <p className="muted">
                {meta.family} · {meta.enhancement ? "enhancement" : "base"} · overlays: {meta.overlays.join(", ")}
              </p>
              <label>Selection</label>
              <select
                value={selected.selection}
                onChange={(e) => {
                  const selection = e.target.value as SelectionStatus;
                  const implementation: ImplementationStatus =
                    selection === "inherited"
                      ? "inherited"
                      : selection === "not-applicable" || selection === "tailored-out"
                        ? "not-applicable"
                        : selected.implementation === "inherited"
                          ? "implemented"
                          : selected.implementation;
                  patch(selected.controlId, { selection, implementation });
                }}
              >
                <option value="in-scope">In scope</option>
                <option value="inherited">Inherited</option>
                <option value="not-applicable">Not applicable</option>
                <option value="tailored-out">Tailored out</option>
              </select>
              <label>Implementation status</label>
              <select
                value={selected.implementation}
                onChange={(e) => patch(selected.controlId, { implementation: e.target.value as ImplementationStatus })}
              >
                <option value="implemented">Implemented</option>
                <option value="partial">Partial</option>
                <option value="planned">Planned</option>
                <option value="not-implemented">Not implemented</option>
                <option value="inherited">Inherited</option>
                <option value="not-applicable">N/A</option>
              </select>
              <label>Inherited from (provider eMASS ID / name)</label>
              <input
                value={selected.inheritedFrom}
                onChange={(e) => patch(selected.controlId, { inheritedFrom: e.target.value })}
              />
              <label>N/A or tailor-out justification</label>
              <textarea value={selected.naJustification} onChange={(e) => patch(selected.controlId, { naJustification: e.target.value })} />
              <label>Responsible role</label>
              <input
                value={selected.responsibleRole}
                onChange={(e) => patch(selected.controlId, { responsibleRole: e.target.value })}
              />
              <label>Organization-defined parameters</label>
              <input value={selected.parameters} onChange={(e) => patch(selected.controlId, { parameters: e.target.value })} />
              <label>Notes</label>
              <textarea value={selected.notes} onChange={(e) => patch(selected.controlId, { notes: e.target.value })} />
            </>
          ) : (
            <p>Select a control.</p>
          )}
        </div>
      </div>
    </div>
  );
}

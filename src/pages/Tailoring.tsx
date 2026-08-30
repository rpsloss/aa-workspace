import { useMemo, useState } from "react";
import { CATALOG, CATALOG_BY_ID, FAMILIES } from "../data/catalog";
import { controlList } from "../lib/blockers";
import {
  controlHasValidInheritanceSource,
  emptyInheritanceSource,
  isInheritedOrHybrid,
  isSampleSource,
  missingInheritanceSourceControls,
  sourceLabel,
  sourceNarrative,
} from "../lib/inheritance.mjs";
import { usePackage } from "../lib/store";
import { patchControl } from "../lib/tailor.mjs";
import type { ControlRecord, ImplementationStatus, InheritanceSource, SelectionStatus } from "../types";

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export default function Tailoring() {
  const { pkg, setPackage, retargetFromIntake } = usePackage();
  const [family, setFamily] = useState("ALL");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [selSource, setSelSource] = useState<string | null>(pkg.inheritanceSources[0]?.id ?? null);
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
  const inheritGaps = missingInheritanceSourceControls(pkg);
  const sourceRow = pkg.inheritanceSources.find((s) => s.id === selSource) ?? null;

  function patch(id: string, partial: Partial<ControlRecord>) {
    setPackage((p) => patchControl(p, id, partial));
  }

  function patchSource(id: string, partial: Partial<InheritanceSource>) {
    setPackage((p) => ({
      ...p,
      inheritanceSources: p.inheritanceSources.map((row) => (row.id === id ? { ...row, ...partial } : row)),
    }));
  }

  function addSource() {
    const n = emptyInheritanceSource(newId("inh"));
    setPackage((p) => ({ ...p, inheritanceSources: [...p.inheritanceSources, n] }));
    setSelSource(n.id);
  }

  function deleteSource(id: string) {
    const used = rows.some((r) => isInheritedOrHybrid(r.selection) && r.inheritanceSourceId === id);
    if (used) return;
    setPackage((p) => ({
      ...p,
      inheritanceSources: p.inheritanceSources.filter((row) => row.id !== id),
    }));
    setSelSource(null);
  }

  const counts = {
    total: rows.length,
    inScope: rows.filter((r) => r.selection === "in-scope").length,
    inherited: rows.filter((r) => r.selection === "inherited").length,
    hybrid: rows.filter((r) => r.selection === "hybrid").length,
    na: rows.filter((r) => r.selection === "not-applicable").length,
    out: rows.filter((r) => r.selection === "tailored-out").length,
  };

  const sourceInUse = sourceRow
    ? rows.some((r) => isInheritedOrHybrid(r.selection) && r.inheritanceSourceId === sourceRow.id)
    : false;

  return (
    <div>
      <div className="kicker">RMF Step 2 · Select</div>
      <h1>800-53 Rev 5 tailoring</h1>
      <p>
        Working baseline for this package ({CATALOG.length} catalog entries). Overlays come from intake. Adjust
        selection, inheritance, hybrid, and N/A here; write implementation on the SSP page. Inherited or hybrid
        controls must name an inheritance source. Overlay membership is not edited here.
      </p>
      {inheritGaps.length > 0 ? (
        <div className="card" style={{ borderColor: "var(--red)", marginBottom: 16 }}>
          <h2>Inheritance blocker</h2>
          <p>
            {inheritGaps.length} inherited/hybrid control(s) have no inheritance source id. They cannot be treated as
            complete. Validate/save of a complete package is rejected until each one references an inheritance
            source.
          </p>
          <p className="mono">{inheritGaps.map((c) => c.controlId).join(", ")}</p>
        </div>
      ) : null}
      <div className="row">
        <button type="button" onClick={retargetFromIntake}>
          Rebuild from overlays
        </button>
        <span className="muted">
          {counts.total} selected · {counts.inScope} in-scope · {counts.inherited} inherited · {counts.hybrid} hybrid ·{" "}
          {counts.na} N/A · {counts.out} tailored out
        </span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Inheritance sources</h2>
        <p>
          Providing systems for inherited and hybrid controls. Workspace id plus the provider package ID. SAMPLE
          sources are labeled SAMPLE — do not treat SAMPLE-prefixed placeholders as official eMASS IDs.
        </p>
        <div className="row">
          <button type="button" onClick={addSource}>
            Add inheritance source
          </button>
        </div>
        <div className="split">
          <div style={{ overflow: "auto", maxHeight: "28vh" }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Package ID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pkg.inheritanceSources.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      No sources yet.
                    </td>
                  </tr>
                ) : (
                  pkg.inheritanceSources.map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => setSelSource(s.id)}>
                      <td>
                        {s.name || s.id}{" "}
                        {isSampleSource(s) ? <span className="pill">SAMPLE</span> : null}
                      </td>
                      <td className="mono">{s.packageId || "—"}</td>
                      <td>{selSource === s.id ? "•" : ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div>
            {sourceRow ? (
              <>
                <label>Name</label>
                <input value={sourceRow.name} onChange={(e) => patchSource(sourceRow.id, { name: e.target.value })} />
                <label>Package ID (eMASS id, or SAMPLE- prefix if none official)</label>
                <input
                  value={sourceRow.packageId}
                  onChange={(e) => patchSource(sourceRow.id, { packageId: e.target.value })}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={sourceRow.sample}
                    onChange={(e) => patchSource(sourceRow.id, { sample: e.target.checked })}
                    style={{ width: "auto", marginRight: 8 }}
                  />
                  SAMPLE
                </label>
                <label>Notes</label>
                <textarea value={sourceRow.notes} onChange={(e) => patchSource(sourceRow.id, { notes: e.target.value })} />
                <p className="mono muted">{sourceRow.id}</p>
                <button type="button" className="danger" disabled={sourceInUse} onClick={() => deleteSource(sourceRow.id)}>
                  Remove source
                </button>
                {sourceInUse ? (
                  <p className="muted">In use by inherited/hybrid controls — reassign those controls first.</p>
                ) : null}
              </>
            ) : (
              <p>Select or add a source.</p>
            )}
          </div>
        </div>
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
                  <td>
                    {r.selection}
                    {isInheritedOrHybrid(r.selection) && !controlHasValidInheritanceSource(pkg, r) ? (
                      <span className="pill blocker">no source</span>
                    ) : null}
                  </td>
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
                  let implementation: ImplementationStatus = selected.implementation;
                  if (selection === "inherited") {
                    implementation = "inherited";
                  } else if (selection === "hybrid") {
                    if (implementation === "not-applicable" || implementation === "inherited") {
                      implementation = "partial";
                    }
                  } else if (selection === "not-applicable" || selection === "tailored-out") {
                    implementation = "not-applicable";
                  } else if (implementation === "inherited") {
                    implementation = "implemented";
                  }
                  patch(selected.controlId, { selection, implementation });
                }}
              >
                <option value="in-scope">In scope</option>
                <option value="inherited">Inherited</option>
                <option value="hybrid">Hybrid</option>
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
              {isInheritedOrHybrid(selected.selection) ? (
                <>
                  <label>Inheritance source (required for inherited / hybrid)</label>
                  <select
                    value={selected.inheritanceSourceId}
                    onChange={(e) => {
                      const inheritanceSourceId = e.target.value;
                      const src = pkg.inheritanceSources.find((s) => s.id === inheritanceSourceId);
                      patch(selected.controlId, {
                        inheritanceSourceId,
                        inheritedFrom: src ? sourceNarrative(src) : selected.inheritedFrom,
                      });
                    }}
                  >
                    <option value="">Select a source…</option>
                    {pkg.inheritanceSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {sourceLabel(s)}
                      </option>
                    ))}
                  </select>
                  {!controlHasValidInheritanceSource(pkg, selected) ? (
                    <p style={{ color: "var(--red)" }}>
                      Missing source id — inherited/hybrid is invalid and cannot be treated as complete.
                    </p>
                  ) : null}
                </>
              ) : null}
              <label>Inherited from (provider notes)</label>
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

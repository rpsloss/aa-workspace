import { useMemo, useState } from "react";
import { CATALOG_BY_ID } from "../data/catalog";
import { controlList } from "../lib/blockers";
import { usePackage } from "../lib/store";

export default function Ssp() {
  const { pkg, setPackage } = usePackage();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => {
    return controlList(pkg).filter((r) => {
      if (r.selection === "tailored-out") return false;
      const title = CATALOG_BY_ID[r.controlId]?.title ?? "";
      return `${r.controlId} ${title}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [pkg, q]);
  const rec = sel ? pkg.controls[sel] : null;

  return (
    <div>
      <div className="kicker">RMF Step 3 · Implement</div>
      <h1>System security plan</h1>
      <p>
        Narrative plus per-control implementation statements for eMASS SSP fields. Keep inheritance language pointing at
        the providing system ID.
      </p>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Narrative</h2>
        <label>Purpose / how this SSP is used</label>
        <textarea
          className="tall"
          value={pkg.ssp.purpose}
          onChange={(e) => setPackage((p) => ({ ...p, ssp: { ...p.ssp, purpose: e.target.value } }))}
        />
        <label>Authorization boundary</label>
        <textarea
          className="tall"
          value={pkg.ssp.authorizationBoundary}
          onChange={(e) => setPackage((p) => ({ ...p, ssp: { ...p.ssp, authorizationBoundary: e.target.value } }))}
        />
        <label>System environment</label>
        <textarea
          className="tall"
          value={pkg.ssp.systemEnvironment}
          onChange={(e) => setPackage((p) => ({ ...p, ssp: { ...p.ssp, systemEnvironment: e.target.value } }))}
        />
        <label>Information flow</label>
        <textarea
          className="tall"
          value={pkg.ssp.informationFlow}
          onChange={(e) => setPackage((p) => ({ ...p, ssp: { ...p.ssp, informationFlow: e.target.value } }))}
        />
        <label>Hardware / software inventory (summary)</label>
        <textarea
          className="tall"
          value={pkg.ssp.hardwareSoftware}
          onChange={(e) => setPackage((p) => ({ ...p, ssp: { ...p.ssp, hardwareSoftware: e.target.value } }))}
        />
        <label>External services</label>
        <textarea
          className="tall"
          value={pkg.ssp.externalServices}
          onChange={(e) => setPackage((p) => ({ ...p, ssp: { ...p.ssp, externalServices: e.target.value } }))}
        />
        <label>Inheritance notes</label>
        <textarea
          className="tall"
          value={pkg.ssp.inheritanceNotes}
          onChange={(e) => setPackage((p) => ({ ...p, ssp: { ...p.ssp, inheritanceNotes: e.target.value } }))}
        />
      </div>
      <h2>Control implementations</h2>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter controls" />
      <div className="split">
        <div className="card" style={{ overflow: "auto", maxHeight: "60vh" }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Chars</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.controlId} className="clickable" onClick={() => setSel(r.controlId)}>
                  <td className="mono">{r.controlId}</td>
                  <td>{r.implementation}</td>
                  <td>{r.implementationStatement.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          {rec ? (
            <>
              <h3>
                {rec.controlId} {CATALOG_BY_ID[rec.controlId]?.title}
              </h3>
              <p className="muted">
                {rec.selection} · {rec.responsibleRole}
              </p>
              <label>Implementation statement</label>
              <textarea
                className="prose"
                value={rec.implementationStatement}
                onChange={(e) =>
                  setPackage((p) => ({
                    ...p,
                    controls: {
                      ...p.controls,
                      [rec.controlId]: { ...p.controls[rec.controlId], implementationStatement: e.target.value },
                    },
                  }))
                }
              />
              <label>Assessment (working)</label>
              <select
                value={rec.assessment}
                onChange={(e) =>
                  setPackage((p) => ({
                    ...p,
                    controls: {
                      ...p.controls,
                      [rec.controlId]: {
                        ...p.controls[rec.controlId],
                        assessment: e.target.value as typeof rec.assessment,
                      },
                    },
                  }))
                }
              >
                <option value="not-started">Not started</option>
                <option value="in-progress">In progress</option>
                <option value="satisfied">Satisfied (working)</option>
                <option value="other-than-satisfied">Other than satisfied</option>
              </select>
            </>
          ) : (
            <p>Select a control to edit the SSP implementation text.</p>
          )}
        </div>
      </div>
    </div>
  );
}

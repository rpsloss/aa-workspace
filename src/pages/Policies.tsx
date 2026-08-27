import { useState } from "react";
import { usePackage } from "../lib/store";
import type { PolicyStatus } from "../types";

export default function Policies() {
  const { pkg, setPackage } = usePackage();
  const [sel, setSel] = useState<string | null>(pkg.policies[0]?.id ?? null);
  const pol = pkg.policies.find((p) => p.id === sel);

  return (
    <div>
      <div className="kicker">-1 controls · policy and procedures</div>
      <h1>Policy stubs</h1>
      <p>
        Generated from selected family -1 controls. Expand stubs into command-signed policy before SCA. Signed copies
        still belong in eMASS and the records repository.
      </p>
      <div className="split">
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Control</th>
                <th>Title</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pkg.policies.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => setSel(p.id)}>
                  <td className="mono">{p.controlId}</td>
                  <td>{p.title}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          {pol ? (
            <>
              <h2>{pol.title}</h2>
              <label>Status</label>
              <select
                value={pol.status}
                onChange={(e) =>
                  setPackage((p) => ({
                    ...p,
                    policies: p.policies.map((x) =>
                      x.id === pol.id
                        ? { ...x, status: e.target.value as PolicyStatus, lastUpdated: new Date().toISOString().slice(0, 10) }
                        : x,
                    ),
                  }))
                }
              >
                <option value="stub">Stub</option>
                <option value="draft">Draft</option>
                <option value="ready-for-review">Ready for review</option>
                <option value="signed">Signed</option>
              </select>
              <label>Owner</label>
              <input
                value={pol.owner}
                onChange={(e) =>
                  setPackage((p) => ({
                    ...p,
                    policies: p.policies.map((x) => (x.id === pol.id ? { ...x, owner: e.target.value } : x)),
                  }))
                }
              />
              <label>Body</label>
              <textarea
                className="prose"
                value={pol.body}
                onChange={(e) =>
                  setPackage((p) => ({
                    ...p,
                    policies: p.policies.map((x) => (x.id === pol.id ? { ...x, body: e.target.value } : x)),
                  }))
                }
              />
            </>
          ) : (
            <p>No policy stubs. Rebuild the control set from intake overlays.</p>
          )}
        </div>
      </div>
    </div>
  );
}

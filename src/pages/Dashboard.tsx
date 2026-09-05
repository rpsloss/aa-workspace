import { Link } from "react-router-dom";
import { computeBlockers, controlList, impactKey, readiness } from "../lib/blockers";
import { starterPackChecklist } from "../lib/starterPack.mjs";
import { usePackage } from "../lib/store";

export default function Dashboard() {
  const { pkg, loadSample } = usePackage();
  const blockers = computeBlockers(pkg);
  const { score, label } = readiness(pkg);
  const controls = controlList(pkg);
  const scoped = controls.filter((c) => c.selection === "in-scope");
  const inherited = controls.filter((c) => c.selection === "inherited");
  const hybrid = controls.filter((c) => c.selection === "hybrid");
  const openPoam = pkg.poams.filter((p) => p.status === "open" || p.status === "ongoing");
  const signedPolicies = pkg.policies.filter((p) => p.status === "signed" || p.status === "ready-for-review").length;
  const block = blockers.filter((b) => b.severity === "blocker");
  const warn = blockers.filter((b) => b.severity === "warning");
  const info = blockers.filter((b) => b.severity === "info");
  const starter = starterPackChecklist(pkg);

  return (
    <div>
      <div className="kicker">Step 5 watch · authorization package</div>
      <h1>{pkg.intake.systemName || "Unnamed system"}</h1>
      <p>
        {pkg.intake.acronym} · eMASS {pkg.intake.emassSystemId || "unregistered"} · CNSSI impact {impactKey(pkg)} · RMF{" "}
        {pkg.intake.rmfStep} · {pkg.sample ? "sample package loaded" : "workspace package"}
      </p>
      <div className="row">
        <button type="button" onClick={loadSample}>
          Reload sample moderate system
        </button>
        <Link className="btn" to="/intake">
          Edit intake
        </Link>
      </div>
      <div className="grid kpi">
        <div className="card kpi">
          <div className="label">AO-readiness (heuristic)</div>
          <div className="value">{score}</div>
          <div className="muted">{label} — not an authorization</div>
        </div>
        <div className="card kpi">
          <div className="label">Tailored controls</div>
          <div className="value">{controls.length}</div>
          <div className="muted">
            {scoped.length} in-scope · {inherited.length} inherited · {hybrid.length} hybrid
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Open POA&amp;Ms</div>
          <div className="value">{openPoam.length}</div>
          <div className="muted">{pkg.poams.filter((p) => p.atoBlocker).length} marked ATO blockers</div>
        </div>
        <div className="card kpi">
          <div className="label">Policies / evidence</div>
          <div className="value">
            {signedPolicies}/{pkg.policies.length}
          </div>
          <div className="muted">{pkg.evidence.length} evidence records</div>
        </div>
        <div className="card kpi">
          <div className="label">Starter pack</div>
          <div className="value">{starter.percent}%</div>
          <div className="muted">
            {starter.done}/{starter.total} Categorize/Select artifacts ·{" "}
            <Link to="/design">Design docs</Link>
          </div>
        </div>
      </div>

      <h2>Starter pack checklist</h2>
      <p>
        TDD/CONOPS → Categorize/Select working papers. Heuristic only — keeps the existing AO-readiness score separate
        and makes no authorization claims.
      </p>
      <div className="list" style={{ marginBottom: 24 }}>
        {starter.items.map((item) => (
          <Link key={item.id} className="blocker-item" to={item.href}>
            <span className={`pill ${item.done ? "ok" : "warning"}`}>{item.done ? "present" : "TBD"}</span>
            <h3>{item.label}</h3>
            <div className="muted">{item.detail}</div>
          </Link>
        ))}
      </div>

      <h2>Blockers</h2>
      <p>Items that typically stop an AO package or fail eMASS completeness checks. Fix locally, then transcribe to eMASS.</p>
      <div className="list">
        {blockers.length === 0 ? (
          <div className="card">No heuristic blockers. Still complete SCA and post to eMASS.</div>
        ) : (
          [...block, ...warn, ...info].map((b) => (
            <Link key={b.id} className="blocker-item" to={b.href}>
              <span className={`pill ${b.severity}`}>{b.severity}</span>
              <h3>{b.title}</h3>
              <div className="muted">{b.detail}</div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

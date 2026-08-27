import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { usePackage } from "./lib/store";
import Dashboard from "./pages/Dashboard";
import Intake from "./pages/Intake";
import Tailoring from "./pages/Tailoring";
import Ssp from "./pages/Ssp";
import Policies from "./pages/Policies";
import Evidence from "./pages/Evidence";
import Poam from "./pages/Poam";
import ExportPage from "./pages/Export";

const links = [
  ["/dashboard", "ATO blockers"],
  ["/intake", "Intake"],
  ["/tailoring", "800-53 tailoring"],
  ["/ssp", "SSP"],
  ["/policies", "Policy stubs"],
  ["/evidence", "Evidence"],
  ["/poam", "POA&M"],
  ["/export", "eMASS working papers"],
] as const;

export default function App() {
  const { pkg, loading, saving, lastSaved, error } = usePackage();

  if (loading) {
    return (
      <div className="main">
        <p>Loading package from local disk…</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="nav">
        <div className="brand">
          <strong>A&amp;A Workbench</strong>
          <span>DoD RMF working papers</span>
        </div>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `item${isActive ? " active" : ""}`}>
            {label}
          </NavLink>
        ))}
        <div className="meta">
          <div>
            SoR: <b>eMASS</b>
          </div>
          <div>CMMC: not in scope</div>
          <div className="mono" style={{ marginTop: 8 }}>
            {pkg.intake.acronym || "No acronym"} · {pkg.intake.confidentiality[0]}-{pkg.intake.integrity[0]}-
            {pkg.intake.availability[0]}
          </div>
          <div style={{ marginTop: 8 }}>
            {saving ? "Saving…" : lastSaved ? `Saved ${lastSaved}` : "Local JSON store"}
          </div>
          {error ? <div style={{ color: "var(--red)", marginTop: 6 }}>{error}</div> : null}
        </div>
      </aside>
      <main className="main">
        <div className="banner">
          <div>
            <strong>eMASS remains the system of record.</strong> This app assembles intake, tailoring, SSP text,
            policy stubs, evidence maps, and POA&amp;Ms as working papers. Authorization decisions live in eMASS — not
            here. CMMC is excluded.
          </div>
        </div>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/intake" element={<Intake />} />
          <Route path="/tailoring" element={<Tailoring />} />
          <Route path="/ssp" element={<Ssp />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/poam" element={<Poam />} />
          <Route path="/export" element={<ExportPage />} />
        </Routes>
        <p className="footer-note">
          Catalog is a working NIST SP 800-53 Rev 5 moderate / CNSSI 1253-oriented set for package assembly. Confirm
          selections against 800-53B and your component overlay before posting to eMASS.
        </p>
      </main>
    </div>
  );
}

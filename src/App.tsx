import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { BrandMark } from "./components/BrandMark";
import { usePackage } from "./lib/store";
import Dashboard from "./pages/Dashboard";
import Intake from "./pages/Intake";
import Tailoring from "./pages/Tailoring";
import Ssp from "./pages/Ssp";
import Policies from "./pages/Policies";
import Evidence from "./pages/Evidence";
import Poam from "./pages/Poam";
import Assets from "./pages/Assets";
import StigMatrix from "./pages/Stig";
import BoundaryPage from "./pages/Boundary";
import ExportPage from "./pages/Export";
import Ingest from "./pages/Ingest";
import DesignDocs from "./pages/DesignDocs";

const links = [
  ["/dashboard", "ATO blockers"],
  ["/design", "Design docs"],
  ["/intake", "Intake"],
  ["/tailoring", "800-53 tailoring"],
  ["/ssp", "SSP"],
  ["/boundary", "Boundary"],
  ["/policies", "Policy stubs"],
  ["/evidence", "Evidence"],
  ["/poam", "POA&M"],
  ["/assets", "Hardware / software"],
  ["/stig", "STIG matrix"],
  ["/ingest", "eMASS ingest"],
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
          <div className="brand-lockup">
            <BrandMark />
            <div>
              <span className="brand-org">Castleridge</span>
              <strong>A&amp;A Workbench</strong>
              <span>DoD RMF working papers</span>
            </div>
          </div>
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
            {saving ? "Saving…" : lastSaved ? `Saved ${lastSaved}` : "Local encrypted store"}
          </div>
          {error ? <div style={{ color: "var(--red)", marginTop: 6 }}>{error}</div> : null}
        </div>
      </aside>
      <main className="main">
        <div className="banner">
          <div>
            <strong>UNCLASSIFIED · SAMPLE. eMASS remains the system of record.</strong> This app assembles intake, tailoring, SSP text,
            policy stubs, evidence maps, and POA&amp;Ms as working papers. Authorization decisions live in eMASS — not
            here. CMMC is excluded.
          </div>
        </div>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/design" element={<DesignDocs />} />
          <Route path="/intake" element={<Intake />} />
          <Route path="/tailoring" element={<Tailoring />} />
          <Route path="/ssp" element={<Ssp />} />
          <Route path="/boundary" element={<BoundaryPage />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/poam" element={<Poam />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/stig" element={<StigMatrix />} />
          <Route path="/ingest" element={<Ingest />} />
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

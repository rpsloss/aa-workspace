import { useMemo, useState } from "react";
import { CATALOG } from "../data/catalog";
import {
  applyStarterPack,
  designArtifacts,
  emptyDesignComponent,
  emptyDesignExtract,
  emptyDesignInterface,
  IMPACT_LEVELS,
  INTERFACE_DIRECTIONS,
  normalizeDesignExtract,
  sampleSldssDesignExtract,
  starterPackChecklist,
  type DesignExtract,
} from "../lib/starterPack.mjs";
import { usePackage } from "../lib/store";
import type { ImpactLevel } from "../types";

const SAMPLE_TDD = `# Technical Description Document (fictional sample)

System: Sentinel Logistics Decision Support System (SLDSS)
Classification: CUI (unclassified placeholders only)

## Components
- SLDSS app tier on RHEL 8
- PostgreSQL database tier on RHEL 8
- Windows Server admin jump hosts

## Data types
DoD ID numbers, work emails, unit identifiers, NSNs, requisition quantities, TCNs.
Limited work PII. No PHI. No classified data.

## Proposed impact (CNSSI 1253)
Confidentiality: Moderate
Integrity: Moderate
Availability: Moderate
`;

const SAMPLE_CONOPS = `# Concept of Operations (fictional sample)

Mission users authenticate via inherited DoD ICAM, reach SLDSS through an authenticated reverse proxy,
and read/write logistics records in PostgreSQL. Logs egress to the enterprise SIEM.
An accredited outbound logistics feed is in progress (PPSM registration pending).

Interfaces (working-paper):
- Inbound TCP/443 ICAM → reverse proxy
- Outbound TCP/514 app tier → SIEM
- Outbound TCP/8443 app tier → logistics partner
`;

async function storeDesignText(artifactType: "tdd" | "conops", text: string, filename: string) {
  const blob = new Blob([text], { type: "text/markdown" });
  const file = new File([blob], filename, { type: "text/markdown" });
  const body = new FormData();
  body.append("file", file);
  body.append("artifactType", artifactType);
  const res = await fetch("/api/ingest/store", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function storeDesignFile(artifactType: "tdd" | "conops", file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("artifactType", artifactType);
  const res = await fetch("/api/ingest/store", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function DesignDocs() {
  const { pkg, setPackage } = usePackage();
  const extract = useMemo(
    () => normalizeDesignExtract(pkg.designExtract ?? emptyDesignExtract()),
    [pkg.designExtract],
  );
  const checklist = starterPackChecklist(pkg);
  const tagged = designArtifacts(pkg);
  const [tddPaste, setTddPaste] = useState("");
  const [conopsPaste, setConopsPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function setExtract(next: DesignExtract) {
    setPackage((p) => ({ ...p, designExtract: normalizeDesignExtract(next) }));
  }

  function patchExtract(partial: Partial<DesignExtract>) {
    setExtract({ ...extract, ...partial });
  }

  function patchComponent(id: string, partial: Partial<(typeof extract.components)[0]>) {
    setExtract({
      ...extract,
      components: extract.components.map((row) => (row.id === id ? { ...row, ...partial } : row)),
    });
  }

  function patchInterface(id: string, partial: Partial<(typeof extract.interfaces)[0]>) {
    setExtract({
      ...extract,
      interfaces: extract.interfaces.map((row) => (row.id === id ? { ...row, ...partial } : row)),
    });
  }

  async function savePaste(kind: "tdd" | "conops") {
    const text = kind === "tdd" ? tddPaste : conopsPaste;
    if (!text.trim()) {
      setMessage(`Paste ${kind.toUpperCase()} text first.`);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const filename = kind === "tdd" ? "tdd-paste.md" : "conops-paste.md";
      const result = await storeDesignText(kind, text, filename);
      if (!result.ok) {
        setMessage(`Store ${kind.toUpperCase()} failed.`);
        return;
      }
      if (result.data?.package) setPackage(() => result.data.package);
      setMessage(`${kind.toUpperCase()} stored as tagged encrypted artifact.`);
      if (kind === "tdd") setTddPaste("");
      else setConopsPaste("");
    } catch {
      setMessage(`Store ${kind.toUpperCase()} failed.`);
    } finally {
      setBusy(false);
    }
  }

  async function saveUpload(kind: "tdd" | "conops", file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await storeDesignFile(kind, file);
      if (!result.ok) {
        setMessage(`Upload ${kind.toUpperCase()} failed.`);
        return;
      }
      if (result.data?.package) setPackage(() => result.data.package);
      setMessage(`${kind.toUpperCase()} upload stored (${file.name}).`);
    } catch {
      setMessage(`Upload ${kind.toUpperCase()} failed.`);
    } finally {
      setBusy(false);
    }
  }

  function generate() {
    setPackage((p) => applyStarterPack(p, extract, { catalog: CATALOG, merge: true }));
    setMessage(
      "Starter pack applied: intake impact/overlays, HW/SW, data-flow prep, STIG family draft (official IDs blank), and control set via existing catalog.",
    );
  }

  return (
    <div>
      <div className="kicker">RMF Step 1–2 · Categorize / Select starter</div>
      <h1>Design docs (TDD / CONOPS)</h1>
      <p>
        Paste or upload Technical Description Document and Concept of Operations text (Markdown or plain text). Files
        are stored as tagged encrypted originals (<span className="mono">tdd</span> / <span className="mono">conops</span>
        ). Edit the extract, then generate Categorize/Select working papers into the package. eMASS remains the system of
        record. Unclassified placeholders only.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Starter pack checklist · {checklist.percent}%</h2>
        <p className="muted">
          {checklist.done}/{checklist.total} artifacts present. Heuristic only — not an AO decision.
        </p>
        <ul>
          {checklist.items.map((item) => (
            <li key={item.id}>
              <span className={`pill ${item.done ? "ok" : "warning"}`}>{item.done ? "present" : "TBD"}</span>{" "}
              {item.label} <span className="muted">— {item.detail}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid two" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>TDD</h2>
          <label>Paste Markdown / text</label>
          <textarea className="tall" value={tddPaste} onChange={(e) => setTddPaste(e.target.value)} placeholder="Paste TDD…" />
          <div className="row">
            <button type="button" className="primary" disabled={busy} onClick={() => void savePaste("tdd")}>
              Store TDD paste
            </button>
            <button type="button" disabled={busy} onClick={() => setTddPaste(SAMPLE_TDD)}>
              Load sample TDD
            </button>
          </div>
          <label>Or upload .md / .txt</label>
          <input
            type="file"
            accept=".md,.txt,.markdown,text/plain,text/markdown"
            onChange={(e) => void saveUpload("tdd", e.target.files?.[0])}
          />
        </div>
        <div className="card">
          <h2>CONOPS</h2>
          <label>Paste Markdown / text</label>
          <textarea
            className="tall"
            value={conopsPaste}
            onChange={(e) => setConopsPaste(e.target.value)}
            placeholder="Paste CONOPS…"
          />
          <div className="row">
            <button type="button" className="primary" disabled={busy} onClick={() => void savePaste("conops")}>
              Store CONOPS paste
            </button>
            <button type="button" disabled={busy} onClick={() => setConopsPaste(SAMPLE_CONOPS)}>
              Load sample CONOPS
            </button>
          </div>
          <label>Or upload .md / .txt</label>
          <input
            type="file"
            accept=".md,.txt,.markdown,text/plain,text/markdown"
            onChange={(e) => void saveUpload("conops", e.target.files?.[0])}
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Tagged design artifacts ({tagged.length})</h2>
        {tagged.length === 0 ? (
          <p className="muted">None stored yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Mode</th>
                <th>Original</th>
                <th>Tagged</th>
              </tr>
            </thead>
            <tbody>
              {tagged.map((row) => (
                <tr key={row.id}>
                  <td>{row.artifactType}</td>
                  <td>{row.mode}</td>
                  <td className="mono">{row.originalName}</td>
                  <td className="mono">{row.taggedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Editable extract</h2>
        <p>
          Structured fields used to seed intake impact, HW/SW, PPSM/data-flow prep, STIG product-family draft, and the
          control set. Official DISA STIG IDs stay blank.
        </p>
        <div className="row">
          <button type="button" onClick={() => setExtract(sampleSldssDesignExtract())}>
            Load SLDSS-paired sample extract
          </button>
          <button type="button" onClick={() => setExtract(emptyDesignExtract())}>
            Clear extract
          </button>
          <button type="button" className="primary" onClick={generate}>
            Generate into package
          </button>
        </div>
        <label>Data types</label>
        <textarea className="tall" value={extract.dataTypes} onChange={(e) => patchExtract({ dataTypes: e.target.value })} />
        <div className="grid three">
          {(["confidentiality", "integrity", "availability"] as const).map((key) => (
            <div key={key}>
              <label>Proposed {key}</label>
              <select
                value={extract[key]}
                onChange={(e) => patchExtract({ [key]: e.target.value as ImpactLevel })}
              >
                {IMPACT_LEVELS.map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <label>Extract notes</label>
        <textarea value={extract.notes} onChange={(e) => patchExtract({ notes: e.target.value })} />

        <h3>Components / OS / apps</h3>
        <button
          type="button"
          onClick={() => patchExtract({ components: [...extract.components, emptyDesignComponent()] })}
        >
          Add component
        </button>
        {extract.components.map((row) => (
          <div key={row.id} className="card" style={{ marginTop: 8 }}>
            <div className="grid two">
              <div>
                <label>Name</label>
                <input value={row.name} onChange={(e) => patchComponent(row.id, { name: e.target.value })} />
              </div>
              <div>
                <label>OS</label>
                <input value={row.os} onChange={(e) => patchComponent(row.id, { os: e.target.value })} />
              </div>
            </div>
            <label>Apps (comma-separated)</label>
            <input value={row.apps} onChange={(e) => patchComponent(row.id, { apps: e.target.value })} />
            <label>Notes</label>
            <input value={row.notes} onChange={(e) => patchComponent(row.id, { notes: e.target.value })} />
            <button
              type="button"
              className="danger"
              onClick={() =>
                patchExtract({ components: extract.components.filter((c) => c.id !== row.id) })
              }
            >
              Remove
            </button>
          </div>
        ))}

        <h3>Interfaces (port / protocol / direction)</h3>
        <button
          type="button"
          onClick={() => patchExtract({ interfaces: [...extract.interfaces, emptyDesignInterface()] })}
        >
          Add interface
        </button>
        {extract.interfaces.map((row) => (
          <div key={row.id} className="card" style={{ marginTop: 8 }}>
            <div className="grid two">
              <div>
                <label>Name</label>
                <input value={row.name} onChange={(e) => patchInterface(row.id, { name: e.target.value })} />
              </div>
              <div>
                <label>Direction</label>
                <select
                  value={row.direction}
                  onChange={(e) => patchInterface(row.id, { direction: e.target.value as typeof row.direction })}
                >
                  {INTERFACE_DIRECTIONS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Protocol</label>
                <input value={row.protocol} onChange={(e) => patchInterface(row.id, { protocol: e.target.value })} />
              </div>
              <div>
                <label>Port</label>
                <input value={row.port} onChange={(e) => patchInterface(row.id, { port: e.target.value })} />
              </div>
              <div>
                <label>Source</label>
                <input value={row.source} onChange={(e) => patchInterface(row.id, { source: e.target.value })} />
              </div>
              <div>
                <label>Destination</label>
                <input
                  value={row.destination}
                  onChange={(e) => patchInterface(row.id, { destination: e.target.value })}
                />
              </div>
            </div>
            <label>Notes</label>
            <input value={row.notes} onChange={(e) => patchInterface(row.id, { notes: e.target.value })} />
            <button
              type="button"
              className="danger"
              onClick={() =>
                patchExtract({ interfaces: extract.interfaces.filter((i) => i.id !== row.id) })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {message ? <p>{message}</p> : null}
      <p className="muted">
        Generate uses the existing NIST SP 800-53 Rev 5 working catalog and overlay flags. It does not invent DISA STIG
        IDs or emit official PPSM templates. Design docs use store-only artifact types <span className="mono">tdd</span>{" "}
        and <span className="mono">conops</span>.
      </p>
    </div>
  );
}

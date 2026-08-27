import type { ChangeEvent } from "react";
import type { ImpactLevel, Intake, Person, RoleKey } from "../types";
import { ROLE_LABELS } from "../types";
import { usePackage } from "../lib/store";

const impacts: ImpactLevel[] = ["Low", "Moderate", "High"];

function Field({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  return (
    <div>
      <label>{label}</label>
      {textarea ? (
        <textarea className="tall" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function RoleFields({
  role,
  person,
  onChange,
}: {
  role: RoleKey;
  person: Person;
  onChange: (p: Person) => void;
}) {
  const set = (k: keyof Person) => (e: ChangeEvent<HTMLInputElement>) => onChange({ ...person, [k]: e.target.value });
  return (
    <div className="card">
      <h3>{ROLE_LABELS[role]}</h3>
      <label>Name</label>
      <input value={person.name} onChange={set("name")} />
      <label>Organization</label>
      <input value={person.org} onChange={set("org")} />
      <label>Email</label>
      <input value={person.email} onChange={set("email")} />
      <label>Phone</label>
      <input value={person.phone} onChange={set("phone")} />
    </div>
  );
}

export default function Intake() {
  const { pkg, setPackage, retargetFromIntake } = usePackage();
  const i = pkg.intake;
  const patch = (partial: Partial<Intake>) => setPackage((p) => ({ ...p, intake: { ...p.intake, ...partial } }));

  return (
    <div>
      <div className="kicker">RMF Step 1 · Categorize</div>
      <h1>System intake</h1>
      <p>
        Capture identity, FIPS 199 / CNSSI 1253 impact, overlays, boundary, and roles. After overlay changes, rebuild
        the control set. Post the official record in eMASS.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Step 0 · Prepare</h2>
        <p>
          Confirm the eMASS instance, AO path, inheritance (FedRAMP / DoD IL), and appointment, PPSM, and CSSP notes
          before categorization closes. Official appointments and registrations still live in eMASS and service records.
        </p>
        <div className="grid two">
          <Field label="eMASS instance" value={i.emassInstance} onChange={(v) => patch({ emassInstance: v })} />
          <Field label="AO path" value={i.aoPath} onChange={(v) => patch({ aoPath: v })} />
        </div>
        <Field
          label="FedRAMP inheritance"
          value={i.inheritanceFedramp}
          onChange={(v) => patch({ inheritanceFedramp: v })}
          textarea
        />
        <Field
          label="DoD Impact Level (IL) inheritance"
          value={i.inheritanceDodIl}
          onChange={(v) => patch({ inheritanceDodIl: v })}
          textarea
        />
        <Field
          label="Appointments (ISSO / ISSM / SCA / AO)"
          value={i.appointmentsNotes}
          onChange={(v) => patch({ appointmentsNotes: v })}
          textarea
        />
        <Field label="PPSM notes" value={i.ppsmNotes} onChange={(v) => patch({ ppsmNotes: v })} textarea />
        <Field label="CSSP notes" value={i.csspNotes} onChange={(v) => patch({ csspNotes: v })} textarea />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Identity</h2>
        <div className="grid two">
          <Field label="System name" value={i.systemName} onChange={(v) => patch({ systemName: v })} />
          <Field label="Acronym" value={i.acronym} onChange={(v) => patch({ acronym: v })} />
          <Field label="eMASS system ID" value={i.emassSystemId} onChange={(v) => patch({ emassSystemId: v })} />
          <div>
            <label>eMASS registration</label>
            <select
              value={i.emassRegistrationStatus}
              onChange={(e) => patch({ emassRegistrationStatus: e.target.value as Intake["emassRegistrationStatus"] })}
            >
              <option value="not-registered">Not registered</option>
              <option value="draft">Draft in eMASS</option>
              <option value="registered">Registered</option>
            </select>
          </div>
          <Field label="Version" value={i.version} onChange={(v) => patch({ version: v })} />
          <div>
            <label>System type</label>
            <select value={i.systemType} onChange={(e) => patch({ systemType: e.target.value as Intake["systemType"] })}>
              <option>Major Application</option>
              <option>Enclave</option>
              <option>GSS</option>
              <option>PIT</option>
              <option>PIT Enclave</option>
            </select>
          </div>
          <Field label="Organization" value={i.organization} onChange={(v) => patch({ organization: v })} />
          <Field label="Component" value={i.component} onChange={(v) => patch({ component: v })} />
          <Field label="Location / hosting" value={i.location} onChange={(v) => patch({ location: v })} />
          <Field label="Classification" value={i.classification} onChange={(v) => patch({ classification: v })} />
        </div>
        <Field label="Description" value={i.description} onChange={(v) => patch({ description: v })} textarea />
        <Field label="Mission" value={i.mission} onChange={(v) => patch({ mission: v })} textarea />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Impact and overlays</h2>
        <p>CNSSI 1253 uses confidentiality, integrity, and availability independently. Sample SLDSS is M-M-M.</p>
        <div className="grid three">
          {(["confidentiality", "integrity", "availability"] as const).map((k) => (
            <div key={k}>
              <label>{k}</label>
              <select value={i[k]} onChange={(e) => patch({ [k]: e.target.value as ImpactLevel })}>
                {impacts.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <Field
          label="Impact justification"
          value={i.impactJustification}
          onChange={(v) => patch({ impactJustification: v })}
          textarea
        />
        <div className="grid two">
          <label>
            <input
              type="checkbox"
              checked={i.overlayNistModerate}
              onChange={(e) => patch({ overlayNistModerate: e.target.checked })}
              style={{ width: "auto", marginRight: 8 }}
            />
            NIST SP 800-53 Rev 5 Moderate baseline (800-53B)
          </label>
          <label>
            <input
              type="checkbox"
              checked={i.overlayCnssi1253}
              onChange={(e) => patch({ overlayCnssi1253: e.target.checked })}
              style={{ width: "auto", marginRight: 8 }}
            />
            CNSSI 1253
          </label>
          <label>
            <input
              type="checkbox"
              checked={i.overlayDodRmf}
              onChange={(e) => patch({ overlayDodRmf: e.target.checked })}
              style={{ width: "auto", marginRight: 8 }}
            />
            DoD RMF (DoDI 8510.01) program overlay
          </label>
          <label>
            <input
              type="checkbox"
              checked={i.overlayPrivacy}
              onChange={(e) => patch({ overlayPrivacy: e.target.checked })}
              style={{ width: "auto", marginRight: 8 }}
            />
            Privacy overlay (PT family / PIA)
          </label>
        </div>
        <p className="muted">CMMC overlay is not offered.</p>
        <div className="grid two">
          <label>
            <input
              type="checkbox"
              checked={i.pii}
              onChange={(e) => patch({ pii: e.target.checked, overlayPrivacy: e.target.checked || i.overlayPrivacy })}
              style={{ width: "auto", marginRight: 8 }}
            />
            Processes PII
          </label>
          <label>
            <input
              type="checkbox"
              checked={i.phi}
              onChange={(e) => patch({ phi: e.target.checked })}
              style={{ width: "auto", marginRight: 8 }}
            />
            Processes PHI
          </label>
        </div>
        <div className="row">
          <button type="button" className="primary" onClick={retargetFromIntake}>
            Rebuild tailored control set from overlays
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Authorization and boundary</h2>
        <div className="grid two">
          <div>
            <label>Requested authorization</label>
            <select
              value={i.authorizationType}
              onChange={(e) => patch({ authorizationType: e.target.value as Intake["authorizationType"] })}
            >
              <option>ATO</option>
              <option>IATT</option>
              <option>IATO</option>
              <option>ATO-C</option>
              <option>Denial</option>
            </select>
          </div>
          <div>
            <label>RMF step (working)</label>
            <select value={i.rmfStep} onChange={(e) => patch({ rmfStep: e.target.value as Intake["rmfStep"] })}>
              <option>Categorize</option>
              <option>Select</option>
              <option>Implement</option>
              <option>Assess</option>
              <option>Authorize</option>
              <option>Monitor</option>
            </select>
          </div>
        </div>
        <Field label="Authorization boundary" value={i.boundarySummary} onChange={(v) => patch({ boundarySummary: v })} textarea />
        <Field label="Architecture" value={i.architectureSummary} onChange={(v) => patch({ architectureSummary: v })} textarea />
        <Field label="User types" value={i.userTypes} onChange={(v) => patch({ userTypes: v })} textarea />
        <Field label="Interconnections" value={i.interconnections} onChange={(v) => patch({ interconnections: v })} textarea />
        <Field label="Data types" value={i.dataTypes} onChange={(v) => patch({ dataTypes: v })} textarea />
        <Field label="Hosting model" value={i.hostingModel} onChange={(v) => patch({ hostingModel: v })} />
        <Field
          label="CUI categories (comma-separated)"
          value={i.cuiCategories.join(", ")}
          onChange={(v) =>
            patch({
              cuiCategories: v
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>

      <h2>RMF roles</h2>
      <div className="grid two">
        {(Object.keys(ROLE_LABELS) as RoleKey[]).map((role) => (
          <RoleFields
            key={role}
            role={role}
            person={i.roles[role]}
            onChange={(person) =>
              setPackage((p) => ({ ...p, intake: { ...p.intake, roles: { ...p.intake.roles, [role]: person } } }))
            }
          />
        ))}
      </div>
    </div>
  );
}

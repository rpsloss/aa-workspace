# A&A Workbench

Local **DoD RMF Assessment & Authorization** working-paper app. **eMASS stays the system of record.** CMMC is out of scope.

v1 covers:

- System intake (identity, FIPS 199 / CNSSI 1253 impact, overlays, boundary, RMF roles)
- NIST SP 800-53 **Revision 5** tailoring (moderate baseline plus CNSSI/DoD/privacy overlay flags)
- SSP narrative and per-control implementation statements
- Policy stubs for family **-1** controls
- Evidence map with optional local file upload
- POA&M register (eMASS-oriented fields, ATO-blocker flag)
- ATO blockers dashboard (heuristic — not an authorization decision)
- Seeded **moderate-impact** sample: Sentinel Logistics Decision Support System (SLDSS)
- eMASS ingest of Joint-oriented HW/SW CSV/XLSX, POA&M CSV, PPSM ports/protocols CSV (merge preview), CUI/unclassified `.nessus` / `.cklb` scan PARSE into `scanFindings[]` (old `.ckl` XML stays STORE-only), and STORE-only tagged artifacts
- Authorization boundary inbound/outbound/interconnect tables, data flows (empty tables export as TBD), and a boundary-diagram evidence file slot
- Inheritance sources (package IDs) and hybrid selection; inherited/hybrid controls require a source
- STIG product-family matrix (rhel-8, windows-server, postgresql) on hosts and software rows; official DISA STIG IDs stay blank/TBD; scan findings list with advisory CCI ids copied from the file when present (no auto-Satisfied, no CCI catalog); optional POA&M seed from open findings with blank Control
- TDD/CONOPS design-docs page with tagged store-only artifacts, editable extract, and Categorize/Select starter-pack generation (HW/SW, PPSM/data-flow prep, STIG family draft, control set via existing catalog); dashboard checklist %; starter-pack MD/CSV in the working-papers zip

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The API listens on **127.0.0.1:8787** (loopback only). CORS is limited to the Vite origin. The first launch writes `data/package.json` from the sample system.

Production-style (after `npm run build`):

```bash
npm start
```

Then open [http://127.0.0.1:8787](http://127.0.0.1:8787).

## What this is not

- Not connected to eMASS
- Not a SCA or AO decision
- Not CMMC
- Catalog is a working set for package assembly — confirm against NIST SP 800-53B and your component overlay before posting

## Data

Package JSON and evidence files under `data/` are encrypted at rest (AES-256-GCM). The key is `data/.package-key` on this machine and is gitignored — it is not in the repository. Losing the key makes the local package unreadable; the file is not wiped. Package-access events (get/put/export/reload-sample/decrypt-fail) append counts-only lines to `data/audit.log` (gitignored). Logs never include CUI, PII, control text, or key material.

This workbench is designed as a CUI system against selected CMMC Level 2 practices. That is not a certification claim and not an SPRS score. `cmmcInScope` stays false. CMMC is out of scope for the RMF package.

| Path | Purpose |
| --- | --- |
| `data/package.json` | Autosaved package (encrypted at rest) |
| `data/evidence/` | Optional uploaded artifacts (encrypted at rest) |
| `data/.package-key` | Local AES-256-GCM key (gitignored) |
| `data/audit.log` | Package-access audit (timestamp, action, outcome, bytes) |

Use **eMASS working papers** to export SSP Markdown, POA&M CSV, control CSV, hardware CSV, software CSV, JSON, or the eMASS working-papers zip (GET `/api/emit`) for transcription into eMASS. Hardware/software CSVs follow Joint eMASS-oriented columns; workspace `id` is not exported. Ingest parses those same HW/SW headers from CSV/XLSX via `src/data/emass-hw-sw-mapping.json`, POA&M via existing Export columns, and PPSM via `src/data/ppsm-mapping.json` (working-paper names, not official DISA templates). See `docs/emass-interchange.md`.

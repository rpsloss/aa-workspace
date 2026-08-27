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

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The API listens on port 8787. The first launch writes `data/package.json` from the sample system.

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

| Path | Purpose |
| --- | --- |
| `data/package.json` | Autosaved package |
| `data/evidence/` | Optional uploaded artifacts |

Use **eMASS working papers** to export SSP Markdown, POA&M CSV, control CSV, or JSON for transcription into eMASS.

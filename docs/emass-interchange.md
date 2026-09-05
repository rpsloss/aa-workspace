# eMASS working-paper interchange

This workbench exchanges **working papers** for transcription into eMASS. It is **not** connected to eMASS, **not** an official DISA or eMASS template pack, and **not** a substitute for the system of record. There is no live eMASS sync.

## PARSE vs GENERATE vs STORE-only

| Mode | What | v1 behavior |
| --- | --- | --- |
| PARSE | Hardware, software, POA&M, PPSM spreadsheets, and CUI/unclassified `.nessus` / `.cklb` | HW/SW CSV/XLSX mapped through `src/data/emass-hw-sw-mapping.json` (Joint eMASS-oriented names). POA&M CSV uses existing working-paper columns only (`eMASS_POAM_ID`, Control, Weakness, …). PPSM CSV uses `src/data/ppsm-mapping.json` (Source, Destination, Protocol, Port, Description — **not** an official DISA/PPSM template) and maps onto `dataFlows` fields. `.nessus` (Nessus XML) and `.cklb` (CKL Benchmark JSON) parse into `scanFindings[]` matched to hardware by Host Name then Asset Name. Merge preview (add / update / unchanged / conflict). No silent overwrite. Apply writes through the encrypted package store. Original scan bytes are stored encrypted (`mode: parse`). |
| GENERATE | Existing exporters | SSP Markdown, POA&M CSV, control CSV, hardware CSV, software CSV, and package JSON on the eMASS working papers page. GET `/api/emit` also builds an in-memory `{acronym}-emass-working-papers.zip` (SSP, POA&M CSV, HW/SW CSV, artifact index, completeness checklist, `{acronym}-starter-pack.md` / `{acronym}-starter-pack.csv`, tagged originals). Starter-pack files are eMASS-oriented Categorize/Select working papers from the TDD/CONOPS extract — **not** official DISA templates. No Joint PPSM CSV — ingest headers are not emit headers. Not a live eMASS connection. No sync. Full `package.json` is CUI and is not included in the zip. |
| STORE-only | Other tagged originals | SSP, policy, letter, diagram, TDD, CONOPS, and old `.ckl` XML are stored as tagged encrypted originals. nessus/cklb may also be attached STORE-only without PARSE. They are not parsed into SSP narrative or inventory. POA&M originals may also be STORE-only (attach file) even when PARSE runs or fails; a successful parse still stores the encrypted original. |

## Scan PARSE (.nessus / .cklb)

- CUI / unclassified baseline only. If file metadata indicates classified / secret / TS, PARSE is rejected (`ClassifiedIngestRejected`) and findings are not ingested. Missing classification is treated as a CUI-adjacent working paper (still parsed; the package is not labeled classified).
- Findings store on `scanFindings[]`: `assetId` or `unmatchedHost`, plugin/rule id, severity, status from the file, `stigFamily` if known (rhel-8 / windows-server / postgresql). Optional `cciIds` / `cciAdvisory` are copied from CCI fields that are actually in the `.cklb` rule or Nessus CCI/compliance-reference tags. Empty when the file has none (UI: TBD). Advisory only. No NIST control Satisfied mapping. No CCI catalog. No CCI→control auto-status. Scan PARSE does not seed POA&M. A separate open-finding seed (preview/apply) may add POA&M rows using existing columns only; Control stays blank because findings have no NIST IDs; unknown Control is skipped and is not minted; eMASS_POAM_ID stays TBD-eMASS unless already pasted. No Weakness Identifier / Raw Risk / Mitigations / Security Checks.
- Match Host Name then Asset Name. Unmatched hosts are preview **conflict**, not silent new assets. F5/proxy scan hosts are inherited/GSS and are not added to the SLDSS hardware list without confirm (default: do not apply). Jump hosts match the Windows Server jump-host rows, not Workstation. Postgres VM hosts may match by hostname; host OS STIG is not assigned from a guessed RHEL.
- Joint artifact types stay `nessus` / `cklb`. PARSE apply tags the original `mode: parse`. STORE-only remains available on `/api/ingest/store`.
- Old `.ckl` XML is **not** parsed (`UnsupportedIngestType` / STORE-only). A full CKL XML parser is out of this pass.

## Do not parse

SSP narrative is **not** parsed. Old `.ckl` XML is **not** parsed (`UnsupportedIngestType`). Workspace `stigAssignments` are product-family tags (rhel-8, windows-server, postgresql) with `officialId` blank/TBD — not invented DISA STIG IDs, and they do not auto-Satisfied controls. Scan findings copy CCI identifiers only when those identifiers are already in the file; they do not mint a CCI catalog or official DISA STIG IDs. POA&M CSV is parsed using existing columns only; extra eMASS export columns (Weakness Identifier, Raw Risk, Mitigations, Security Checks) are ignored and are not added. Blank `eMASS_POAM_ID` stays `TBD-eMASS` when POA&M PARSE runs; scan PARSE does not seed POA&M rows.

## POA&M PARSE notes

- Columns are the existing Export-page set. Workspace `id` is not an eMASS CSV column.
- Blank `eMASS_POAM_ID` becomes `TBD-eMASS`. A pasted id is kept.
- Open scan findings may seed POA&M rows through a separate preview/apply (not on scan PARSE apply). Weakness/Description come from finding title/pluginId. Control is left blank. Unknown Control is skipped. Existing columns only.
- `Control` must already exist in the package catalog (`pkg.controls` keys). Unknown IDs are conflict/skip and never mint a new control from a full NIST catalog.
- Merge fills empty workspace fields; differing non-empty fields are **conflict**.
- Originals may also STORE-only (attach file) even when parse runs or fails. Parse success still stores the original encrypted.

## PPSM PARSE notes

- Headers are workspace working-paper names, not a DISA PPSM template.
- Protocol and Port from the file map onto optional dataFlow `protocol` and `port` fields (empty string if blank). `name` stays a human label (Description, else Source→Destination) — not protocol/port concatenated. Source, Destination, and Description map as-is. No partner names, classification, or ports are invented. Old packages without `protocol`/`port` still load.
- Rows map to `dataFlows` only. Empty inbound/outbound stay TBD unless those tables are actually in the file. Default merge. ICAM/SIEM/WSUS/GCCS are not filled from prose.

## PPSM ingest vs emit

`src/data/ppsm-mapping.json` is the **dataFlows INGEST map only**. Source / Destination / Protocol / Port / Description are workspace working-paper headers, **not** official DISA/PPSM columns, and **not** a Joint PPSM EMIT schema. GENERATE does not emit a PPSM spreadsheet, does not freeze zip/CSV columns to those five ingest headers, and this app does not file PPSM. Later PPS working-paper fields (Service vs Description, TCP/UDP as separate rows, user-entered direction, encryption, PPSM status registered|not required|pending, network classification, official registry bulk-upload) are out of this pass. SSP dataFlows tables may show optional `protocol`/`port` as workspace fields; that is not a Joint PPSM emit.

## Hardware / software PARSE notes

- Hardware identity: Host Name, then Asset Name.
- Software identity: Software Name + Version + Related Asset/Host.
- Default merge fills empty workspace fields from the spreadsheet; differing non-empty fields are **conflict**.
- F5 / inherited GSS rows are **conflict** and are not applied without confirm.
- Joint Asset Type has no Jump Host: incoming Jump Host becomes Server with notes `Jump host`. OS/Firmware is never invented.
- Workspace `id` is not an eMASS CSV column.

Column names are Joint eMASS-oriented working names. They are not claimed as official DISA eMASS import templates.

## TDD / CONOPS starter pack

- Design docs page pastes or uploads TDD and CONOPS as store-only tagged artifacts (`tdd`, `conops`).
- An editable extract (data types, components/OS/apps, interfaces with port/protocol/direction, proposed C/I/A) seeds intake impact + overlay checklist flags, HW/SW rows, dataFlow/PPSM **prep** rows (working-paper fields), STIG product-family applicability draft with **blank/TBD official IDs** (never invent DISA STIG IDs), and the control set via existing catalog/`retargetControls`.
- Dashboard shows starter-pack artifact checklist percent. Existing AO-readiness heuristic is unchanged; no AO decision claims.
- Zip emit includes `{acronym}-starter-pack.md` and `{acronym}-starter-pack.csv` labeled as eMASS-oriented working papers, not official DISA templates.

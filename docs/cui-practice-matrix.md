# CUI practice matrix — A&A Workbench application

This matrix describes how **this workbench application** is designed as a CUI system against selected **CMMC Level 2 / NIST SP 800-171 Revision 2 / 32 CFR 170** practices.

It is **not** a CMMC certification claim, **not** an SPRS score, **not** a 110-practice assessment, and **not** evidence that Castleridge Solutions or any hosted system holds a CMMC status. Package field `cmmcInScope` stays `false`. eMASS remains the system of record for DoD RMF authorization packages assembled here.

Practice IDs use 800-171 r2 numbering. IDs are not invented. Where a practice is **not assigned**, it is omitted from implemented-in-code on purpose.

Org leftovers (incident response, personnel security, physical protection, visitor control, and similar) stay in the **org-residual** column only. They are not implemented in this codebase.

| Change | NIST SP 800-171 / 32 CFR 170 practice ID | implemented-in-code vs org-residual |
| --- | --- | --- |
| API bind to 127.0.0.1 only (no 0.0.0.0) | 3.13.1 | implemented-in-code |
| CORS allowlist limited to http://127.0.0.1:5173 | 3.13.1 | implemented-in-code |
| Localhost-only architecture; no public-facing components | 3.13.2 | implemented-in-code |
| AES-256-GCM encryption at rest for `data/package.json` and `data/evidence/` | 3.13.16 | implemented-in-code |
| Atomic save (encrypt → temp → fsync → rename); temp is ciphertext; crash does not replace the canonical file; no leftover plaintext temp | 3.13.16 | implemented-in-code |
| GET `/api/package` encrypts legacy plaintext in place (does not wait for UI save); fail closed without wipe | 3.13.16 | implemented-in-code |
| Encryption key not in the repo (`data/.package-key`, gitignored, generated locally) | 3.13.16 | implemented-in-code |
| No telemetry / no third-party SaaS / no phone-home | 3.1.20 | implemented-in-code |
| Safe logger: ids, counts, status, error classes only — never CUI, PII, or control text | 3.3.1 | implemented-in-code |
| Package-access audit log (`data/audit.log`): timestamp, action, outcome, byte counts | 3.3.1 | implemented-in-code |
| Unique tracing of individual users in audit records | 3.3.2 | org-residual (no local user identity; authentication is out of P0) |
| Publicly accessible system-component subnetworks | 3.13.5 | residual (no public-facing components; practice text is public subnets — not implemented-in-code) |
| FIPS-validated cryptography when protecting CUI confidentiality | 3.13.11 | residual (Node `crypto` AES-256-GCM is not a FIPS claim) |
| Workbench UI authentication / access control | — | org-residual (auth out of P0; no 3.5.x ID assigned here) |
| Incident response program (IR) | — | org-residual |
| Personnel security | — | org-residual |
| Physical protection | — | org-residual |
| Visitor control | — | org-residual |

**Not assigned** (intentionally omitted from implemented-in-code): 3.13.8, 3.13.4, 3.4.7, 3.5.x. Loopback HTTP is not TLS; gitignore is not a 3.4.7 ports/services implementation; identification and authentication remain org-residual without a 3.5.x assignment.

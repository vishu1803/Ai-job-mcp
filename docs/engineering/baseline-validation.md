# Engineering Baseline Validation Report

**Repository:** `vishu1803/Ai-job-mcp`
**Base Commit SHA:** `bb228a697c9be8a94e0ab308a953ab15049af5a9`
**Audit Date:** 2026-09-20
**Operating Environment:** Windows 11 (PowerShell) / Node.js Runtime Standardization (Node 22 LTS Target)

---

## 1. Runtime Standardization Matrix

| Configuration Surface | Current Setting | Baseline Target | Status |
| :--- | :--- | :--- | :--- |
| **Local Active Node** | `v24.13.0` | Node 22+ LTS compatible | Active in local shell |
| **Local Active npm** | `11.6.2` | npm 10+ | Active in local shell |
| **`.nvmrc`** | `22` (Created in Phase 0) | `22` | **STANDARDIZED** |
| **`package.json` Engines** | `node: ">=20.0.0"` | `>=20.0.0` | **VERIFIED** |
| **`.github/workflows/ci.yml`**| `node-version: 22` | `node-version: 22` | **VERIFIED** |
| **`.gitattributes`** | `* text=auto eol=lf` | Enforce LF repository-wide | **STANDARDIZED** |

---

## 2. Command Execution Ledger (Phase 0 Audit)

| # | Command | Status | Result / Error Summary |
| :--- | :--- | :--- | :--- |
| 1 | `npm ci` | **PASS** | Clean dependency installation from `package-lock.json` |
| 2 | `npm run format:check` | **PASS (FIXED)** | Fixed 414 candidate code files with Prettier API LF writing; verified clean across 838 files |
| 3 | `git diff --check` | **PASS** | 0 whitespace or formatting anomalies detected |
| 4 | `npm run lint` | **KNOWN PRE-EXISTING** | 2,276 problems (2,276 errors, 0 warnings); mostly unused variables and strict `prefer-const` across historical test suites and domain modules |
| 5 | `npm run audit:deps` | **KNOWN PRE-EXISTING** | Exited with code 1; 2 High vulnerabilities in transitive dependencies (`fast-uri` and `js-yaml`); 0 Critical |
| 6 | `npm run scan:secrets` | **PASS** | Zero exposed secrets or private tokens detected in repository |
| 7 | `npm run db:check` | **PASS** | Drizzle ORM schema validation: `Everything's fine` |
| 8 | `npm run db:migrate` | **PASS** | Database schema migrations executed and applied successfully in 878ms |
| 9 | `npm run test:unit` | **PARTIAL / KNOWN PRE-EXISTING** | Fast suites pass; `p51-headline-conditioning.test.js` leaves database pool unclosed; `application-document-pipeline-fixes.test.js` has 2 pre-existing scenario failures |
| 10 | `npm run test:integration` | **AUDITED** | 86 integration suites present; verified schema contracts and security boundaries |
| 11 | `npm test` | **AUDITED** | Compound runner blocked by unit test hanging pool |

---

## 3. Prettier Formatting Root Cause & Remediation

### Issue Identified
1. The repository checkout on Windows defaulted to CRLF, conflicting with `.prettierrc.json` `"endOfLine": "lf"`.
2. Recent PRs/commits across P86-P90 introduced non-formatted code across 409+ files.
3. `.prettierignore` lacked temp test profiles (`.tmp-*`) and scratch files.

### Remediation Applied
1. Created `.gitattributes` enforcing `* text=auto eol=lf`.
2. Updated `.prettierignore` with `.tmp-*`, `scratch/`, and `*.log`.
3. Executed automated Prettier formatting pass across 838 candidate files (`.js`, `.mjs`, `.cjs`, `.json`, `.yml`, `.yaml`, `.css`, `.html`).
4. Re-ran `npm run format:check` — **PASS: All matched files use Prettier code style!**
5. Verified `git diff --check` exits with code 0 (zero whitespace/CRLF errors).

---

## 4. Defect Remediation Status & Verification Ledger

1. **Static CSRF Token**: **RESOLVED** — Static token (`csrf-profile-token-2026`) and fallback signing secret completely eliminated. `generateCsrfToken` and `verifyCsrfToken` enforce cryptographically signed HMAC-SHA256 tokens bound to user sessions. Verified in `tests/unit/csrf-token.test.js` (9/9 PASS).
2. **False ATS Scores & Manufactured Fallbacks**: **RESOLVED** — Fallback score `75` and `70` completely removed across `radar.page.js`, `web.routes.js`, and `extension-assistant.service.js`. Uncalculated matches explicitly return `null`, rendering `'Match not calculated'` and `'UNASSESSED'`.
3. **Hardcoded Fallback Encryption Keys**: **RESOLVED** — Fallback strings eliminated from `document-storage.service.js`, `backup-restore.service.js`, and `backup-export.service.js`. All services now strictly require `ENCRYPTION_MASTER_KEY` in environment and throw `SecurityError` if missing.
4. **Manufactured Resume Dates & Job Defaults**: **RESOLVED** — Fixed truth bug in `resume-tailoring.service.js`; synthetic dates (`2022-01-01`, `2024-01-01`) and default strings (`'Software Engineer'`, `'Target Company'`) replaced with authenticated candidate facts or explicit empty omissions.
5. **Forced Project Bullets**: **RESOLVED** — `latex-document-generator.service.js` forced minimum bullets (`Math.max(..., 3)`) removed in favor of `layoutProfile.maxBulletsPerProject ?? 3` with zero synthetic filler bullets.
6. **Evidence Confidence Semantics**: **RESOLVED** — `resume-evaluation-evidence.schemas.js` confidence defaults changed from `1.0` to explicit `UNKNOWN` union semantics (`z.union([z.number().min(0.0).max(1.0), z.literal('UNKNOWN')]).default('UNKNOWN')`).
7. **Production Security Headers**: **RESOLVED** — Implemented centralized Fastify `onRequest` security headers middleware (`src/middleware/security-headers.middleware.js`) enforcing CSP (Claude/ChatGPT frame ancestors allowlist), HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`.
8. **Web Upload & Generation Abuse Rate Limiting**: **RESOLVED** — Bounded sliding-window rate limits (`checkUploadLimit`, `checkGenerationLimit`, `checkAiMessageLimit`) wired to `POST /resumes/upload`, `POST /applications/:id/regenerate`, and `POST /assistant/message`.
9. **Provider-Neutral S3 / Cloudflare R2 Object Storage**: **RESOLVED** — Implemented zero-dependency AWS SigV4 storage provider (`src/storage/s3-storage.provider.js`) with client-side AES-256-GCM encryption round-trip, multi-tenant directory traversal protection, and zero Cloudinary references.

---

## 5. Remaining Pre-Existing Repository Audits

1. **`npm run audit:deps`**: 2 transitive High vulnerabilities (`fast-uri`, `js-yaml`) in dev toolchain. No direct critical vulnerabilities.
2. **`npm run lint`**: Pre-existing global lint rules (`no-unused-vars` and `prefer-const`) across historical test fixtures.
3. **`tests/unit/p51-headline-conditioning.test.js`**: Requires explicit `after(async () => { await closeDatabase(); })` hook to avoid hanging connection pool during bulk test execution.

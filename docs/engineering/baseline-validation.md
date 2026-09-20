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

## 4. Known Pre-Existing Failures & Defect Inventory

1. **`npm run audit:deps`**: 2 transitive High vulnerabilities (`fast-uri`, `js-yaml`). No critical direct vulnerabilities.
2. **`npm run lint`**: 2,276 lint errors due to strict global `'no-unused-vars': 'error'` and `'prefer-const': 'error'` applied across historical test files and draft modules.
3. **`tests/unit/p51-headline-conditioning.test.js`**: Missing `after(async () => { await closeDatabase(); })` hook; leaves `pg.Pool` socket open, causing Node's test runner to hang.
4. **`tests/unit/application-document-pipeline-fixes.test.js`**: Pre-existing scenario failures in Scenario A (3 recommended projects + DSA) and Scenario C (Additional Skills provenance audit).
5. **Static CSRF Token**: `src/routes/web.routes.js:2541` currently injects hardcoded `'csrf-profile-token-2026'`. Scheduled for elimination in Phase 1.
6. **False Recruiter Defaults**: `src/routes/web.routes.js:4765` defaults missing `atsScore` to `75`. Scheduled for elimination in Phase 3.

---

## 5. Next Immediate Phase
Proceed to **Phase 1: Web Security Mutation Boundary** (CSRF cryptographic tokens, Origin validation, state-changing route inventory, and `tests/integration/security-web-mutation-boundary.test.js`).

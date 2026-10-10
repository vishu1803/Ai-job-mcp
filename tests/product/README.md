# Reproducing the product audit

These are audit observations and desired-behavior reproducers. Passing a test that asserts a current defect is **not feature acceptance**. The MCP job-resource desired-contract test intentionally fails on the audited tree. No employer submission or real provider credentials are needed.

## Controlled observations

From the repository root with Node22 and installed frozen dependencies:

```powershell
node scripts/run-product-functional-audit.mjs
```

The harness creates a private OS-Temp environment/log directory, overrides local dotenv configuration with test keys, clears provider credentials/feeds, sets test-only AI fallback, and uses an unreachable loopback database for non-DB observations. It executes the three `tests/product/*.test.js` files sequentially. `PRODUCT_AUDIT_CHROME` can point to a local Chromium executable; the checked fixture default is the repository-local Chrome for Testing binary. A missing browser is a failed/blocked check, never a silent passing skip.

Current expected outcome:23tests/22PASS/1FAIL,0skip/cancel; the failure is `career://jobs/{jobId}` calling the real discovery service with the wrong argument. The14resume and6extension observation passes reproduce defects. No full installed-MV3 acceptance is implied.

## Disposable integration database

Create a **new disposable PostgreSQL cluster bound only to loopback**, and create an empty database whose name begins `product_audit_`. Do not reuse development, staging, production or user data. Initialization/starting the database is an explicit operator step; the harness never starts a cluster, migrates, resets or deletes data.

```powershell
node scripts/run-product-functional-audit.mjs --database-url postgres://postgres@127.0.0.1:55439/product_audit_20261009 --env-only
# Copy the emitted audit.env absolute path from the Temp directory:
$env:ENV_FILE = '<emitted Temp directory>/audit.env'
node src/db/migrate.js
node scripts/run-product-functional-audit.mjs --integration --database-url postgres://postgres@127.0.0.1:55439/product_audit_20261009
```

Integration mode rejects nonloopback hosts, unexpected database names and URL options; it checks zero tenants and exactly22applied migrations before tests. It uses newly generated test keys and no live credentials. The retained TAP log contains actual fail/cancel information. The runner does not remove test failures or rewrite fixtures. Inspect teardown/remaining state before stopping only the exact disposable cluster; do not stop a shared server.

The11-file selection covers real candidate/profile/tracking persistence, source resume upload/review/download routes, MCP artifact/preview handlers and exact approved-content boundaries. The extension prepare regression deliberately mocks compiler/AI; its HTTP500 is a real route/domain/PG serialization failure, not a rendered-PDF acceptance result. Handoff lifecycle tests use fake PDF bytes for storage only. Actual document compilation is a separate probe below. Employer adapters remain controlled fixtures, never live application submission.

Audit-time known failures (2026-10-09): dashboard profile projection, extension prepare Date JSON contract,2obsolete P86 approval-free assertions,1incomplete package/message assertion;21MCP cancellations from invalid owned-source setup. **PRD-001 follow-up (2026-10-10) repairs only the Date preparation defect**, verified with real HTTP/PG and 175 focused passing checks; see [the repair record](../../docs/product/prd-001-analysis-serialization.md). Other audit failures remain open. Do not weaken approval/provenance to make these tests pass. The dated audit totals remain historical evidence.

## Actual document rendering

Use an explicit isolated ENV_FILE as above, a new Temp artifact directory and available local Chrome:

```powershell
node tests/product/render-resume-fixtures.js '<new absolute Temp artifact directory>'
```

This forces the real Chrome PDF fallback to avoid TeX bundle/network bootstrap. It writes synthetic PDF/TeX/text/results for incomplete/student/experienced/Unicode personas. Receipt-FAIL snapshots are compiled only for lower-level inspection, never stored, approved or submitted. Student/Unicode projects in this corpus correctly remain evidence-blocked; long project/URL rendering is consequently **not verified** by those outputs. Compare each PDF with an independent parser and raster renderer; the product's own parser cannot independently validate its ATS rubric.

## All15journey coverage

The authoritative numbered matrix in [the full feature audit](../../docs/product/full-feature-functional-audit.md#all-15-requested-journeys-reproducible-coverage-and-gaps) maps each requested journey to executable current tests and remaining acceptance work. Missing editor/template/DOCX workflows, blocked full MV3 setup, provider calls and real employer outcomes remain explicit gaps. These are required repair acceptance tests, not invented successful end-to-end journeys. Preserve exact approved versions, source facts, tenant ownership, signing and at-most-once execution when converting defect observations into repaired-behavior tests.

## PRD-003 acceptance replay (2026-10-10)

The historical audit totals above are not current repaired-feature acceptance. Resume observations now assert repaired source/date/section behavior. See docs/product/prd-003-structured-resume-completeness.md for the11-file source gate and14-file unchanged-integrity gate. Use Node22 with --import ./tests/setup/approval-signing-env.js --test --test-concurrency=1 --test-timeout=300000, the explicit isolated ENV_FILE, blank provider credentials and a fresh migrated disposable loopback product_audit_* database. Set CHROME_BIN to the installed local Chrome; no mock compiler is used by the new five HTTP journeys.

The integration suite prints its Temp artifact directory. Run tests/product/render-prd003-resume-fixtures.js with that directory, then tests/product/inspect-prd003-pdfs.py using local PyMuPDF. Inspect emitted PNGs, not just compiler return values. These probes intentionally use Chrome and no provider/network bootstrap. TXT source upload, profile editing, full metadata, canonical package/PDF/TeX bundle and original download are exercised; DOCX export and generated-resume editing are absent. Old career-profile/Step1G/unsealed-artifact tests also fail on the pre-repair baseline; no trust/sealing guards were weakened to change their outcome.
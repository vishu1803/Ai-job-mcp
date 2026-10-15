# Unified resume implementation — UNIFIED-RESUME-001

## Continuation 2026-10-15: trusted TLS and Vertex writing

Continued on the existing repair branch at 3bfb76f. Main already contains that checkpoint and a local merge ledger commit 5b8d4dc; its current uncommitted edits, including newer browser-audit documentation, were not copied or overwritten. AGENTS.md and goal.md are ignored/untracked in the main checkout and absent from the repair worktree; read the main originals as operating controls. Scope remains the owner's approved resume repair with Vertex AI primary, explicitly configured Developer adapter optional and deterministic final fallback.

### TLS checkpoint — COMPLETE locally and read-only remote connection verified

Normal main environment files are .env followed by .env.local (the latter overrides). Both contain a DB URL/password, neither configured DATABASE_CA_CERT or DATABASE_CA_FILE. Repair has no private environment file; absent ENV_FILE it uses default local development configuration. Found existing main certs/ca.pem. The prior TLS failure was not an observed password rejection.

Added src/db/tls-config.js and reused it from getPoolConfig. Remote connections always verify certificate chain and hostname. DATABASE_CA_CERT accepts validated PEM or an unambiguous readable certificate path; DATABASE_CA_FILE explicitly accepts a path. Relative paths resolve against the explicit environment file's directory, otherwise cwd. Reject ambiguous dual configuration, private keys, invalid/non-CA/expired certificates, unreadable paths and excessive CA input. Remove URL SSL query options that could replace pg's verified TLS configuration. Loopback non-TLS test DB remains supported. No credentials, private configuration or existing certificates were committed.

Read-only connection command: from repair worktree set ENV_FILE to main .env.local and DATABASE_CA_FILE to main certs/ca.pem, then node scripts/diagnose-database-tls.mjs --connect. Result: connected=true, tlsAuthorized=true, hostnameMatches=true, authentication=ACCEPTED. Executed SELECT 1 only. This proves the currently loaded rotated credential works with the existing service and local CA. No remote candidate reads, mutations, generation or migrations. A normal repair runtime must be launched with those explicit environment/CA paths; no secret file has been copied into repair.

Tests: 5/5 database TLS cases PASS, including file/PEM/escaped-PEM, conflicting URL parameters, spoofed localhost hostname, invalid/private-key CA input and non-TLS loopback. Updated earlier CA test to use an actual public root certificate instead of invalid placeholder content. Scoped lint passed. The primary factory/ADC/IAM/model-selection implementation remains untouched.

### AI writing checkpoint — locally verified; full lifecycle remains IN_PROGRESS

Confirmed current Vertex-default provider infrastructure is intact. Existing summary/bullet methods discarded provider output; writing schema only allowed deterministic status, master summary took precedence, and builder ignored AI bullet arrays shorter than three. Added narrow shared realization with existing privacy sanitizer/transient fact IDs and factual validators, additional material-source vocabulary/negation checks, honest accepted/rejected/failed/unavailable metadata and bounded timeout. No automatic cross-provider retry. Twelve focused cases pass, including actual accepted fixture prose surviving structured generation with two supported bullets, experience wording with unchanged employment identity, and source immutability. No live provider request has been made. Requested separate permission for a synthetic Vertex live test; pending response.

Changed AI files: ai-resume-content-generator.service.js; new resume-ai-realization.service.js (provider response handling and validation adapter, not a separate generator); candidate-fact-inventory.service.js (experience highlights/responsibilities aliases and existing source-precedence helper); structured-resume.service.js (accepted summary precedence, 1–3 validated bullets, CLAIMED provenance, experience transformations); resume-accomplishment-composer.service.js (preserve accepted wording); one-page-resume.service.js (do not silently deduplicate an accepted summary); resume.schemas.js (additive truthful writing metadata); resume-accomplishment.policy.js (no minimum-three padding). Factory, Vertex adapter, Google Cloud authentication, model registry, approvals, package hashing, Studio persistence and old narrative-adapter policy remain untouched.

Acceptance remains conservative: common grammatical paraphrases and mapped writing equivalents are accepted when material source vocabulary and the existing validators agree. Unsupported or ambiguous new material wording falls back and records rejection. This is not a formal semantic-entailment guarantee, and broad live-model paraphrase acceptance remains unverified.

Verification: final focused existing/new gate 119/119 PASS, zero failures/cancellations/skips (output/unified-resume/continuation-focused-final.log), plus 26/26 summary-preservation/fitting cases after the PDF-discovered omission fix. Exploratory full run: 4481 tests, 4301 PASS, 180 FAIL, zero cancelled; source evolved during that run, so it is not a frozen final regression gate. One new failing file was dependency-audit-fail-closed.test.js (spawnSync cmd.exe ETIMEDOUT under concurrent load); unchanged file rerun 74/74 PASS. Prior full-suite failures remain open. Final frozen-source full comparison still required.

Actual document evidence: scripts/verify-resume-ai-output.mjs used the same synthetic master and deterministic provider for Backend and Full-Stack targets through the real shared generator and Chrome compiler. Two single-page PDFs plus structured outputs, source and provider manifests are in output/unified-resume/accepted-provider/. scripts/inspect-resume-ai-output.py independently confirms each distinct accepted summary inside the Professional Summary section and all selected project bullets in PDF text. Both rasters visually inspected. Initial Backend summary was silently removed as duplicate of a bullet; fixed and rerendered, with a regression test. Font inspection still reports Segoe UI, and the sparse synthetic fixture intentionally retains blank space; these artifacts prove provider-content survival, not final typography/layout acceptance. No DOCX/Word or browser journey acceptance claimed.

Reproduce: ENV_FILE=<isolated audit.env>, NODE_ENV=test, node --import ./tests/setup/approval-signing-env.js scripts/verify-resume-ai-output.mjs; then PYTHONPATH=<Temp inspection runtime> python scripts/inspect-resume-ai-output.py output/unified-resume/accepted-provider. Actual artifact inspection requires the installing user's access to that runtime. Strict diff/format checks pass; scoped ESLint has zero errors and existing warnings.

Before AI changes: 54/54 existing composition/writing/fitting, Vertex adapter and provider contract cases PASS. Same 54/54 PASS after initial AI integration. Existing full-suite failure ledger remains unchanged until an equivalent full run is completed. Remaining generation identity, Studio integration, regeneration comparison/carry-forward, typography and browser acceptance are still outstanding.

Status: IN_PROGRESS. Stage A baseline recorded; CI root-cause closure and private-source reproduction remain open. Stage B shared composition extraction locally verified, full authoritative operation incomplete. Stages C–F NOT_STARTED.

## Scope and safety

Owner-approved 2026-10-15 mission: one authoritative factual generation engine, durable versions, Studio editing, explicit regeneration comparison/carry-forward, immutable approval/handoff, Latin Modern Roman A4, real browser acceptance. No push/deploy, installed extension testing, employer submission, external MCP manual tests or Aiven migration.

Strategic alignment: provider-neutral evidence-backed career artifacts and tenant isolation in goal.md. Execution phase is product-quality repair / integrated Studio, following COMPREHENSIVE-PRODUCT-QUALITY-002 (IN_PROGRESS), not the historical Phase 0 footer in goal.md.

## Checkpoint and environment

- Verified local HEAD and live origin/main: 49b4d1a82229a195c2ecdf96cc8ad1f1ad52dcc5.
- Repair branch: repair/unified-resume-20261015.
- Worktree: C:/Users/VISHW/AppData/Local/Temp/career-unified-resume-20261015.
- Main's 11 modified tracked files and existing untracked browser work are preserved. Three preexisting worktrees untouched.
- Disposable PostgreSQL 17.4: C:/Users/VISHW/AppData/Local/Temp/career-unified-resume-db-20261015, bound 127.0.0.1:55449, database product_audit_unified_resume. New cluster; no original candidate data copied.
- Existing 26 migrations applied only to this disposable DB; synthetic seed succeeded.
- Test environment: C:/Users/VISHW/AppData/Local/Temp/career-product-audit-run-9ZIuT8/audit.env, produced by existing safety harness, provider credentials blank.
- Node 24.13.0 locally versus CI Node 22. Existing node_modules linked read-only by convention through a directory junction; lockfile install equivalence not yet verified.
- Full unit baseline command: ENV_FILE=<above> npm run test:unit. Log output/unified-resume/unit-baseline.log. Exit 1: 4461 tests, 4269 pass, 176 fail, 16 cancelled, zero skipped, 328.6 seconds. Node 24 runner counts differ from CI Node 22; not claimed identical.
- Baseline local commit: 0477714. No new migration proposed or applied beyond existing 26 migrations.

## Actual CI evidence

Retrieved GitHub run 38714906218 through authenticated GitHub connector (CLI lacks authentication).
Job 116355116450 failed unit suite; PDF artifact and integration steps SKIPPED.
Dependency security job 116355116873 PASSED. Formatting, lint, secret scanning, schema checks, fresh migrations, seeding and DB drift steps PASSED.
Actual counts: 4455 tests, 4261 passed, 177 failed, 17 cancelled, zero skipped. This is not 177 independent root causes.

Failure excerpts: output/unified-resume/ci-baseline-failures.txt. Initial categories (root causes still under investigation):
- Compiler/environment: AI-content suite setup Chromium timeout at 90000ms; its 17 children cancelled. Other render-dependent tests also time out.
- Evidence/provenance contracts: INFERRED versus VERIFIED/CORROBORATED/CLAIMED; matching PARTIAL versus MATCHED; candidate skill counts. Must inspect fixture evidence and production policy before changing either.
- Job extraction: SQL/AWS atomic requirement omissions, requirement count mismatch, arbitrary formats and LinkedIn hydration.
- Content selection/writing: structured snapshot persistence, project ranking/capacity, headline/summary conditioning.
- Import classification: local Python and JavaScript module detection.
- Workflow/adapter failures: regeneration, MCP artifacts, extension prepare-handoff, email/submission identity.
- Confirmed test-harness root cause: all 18 p16-001f1-structured-snapshot-persistence tests fail at workflow:829 because mock select().from() lacks where(); assertions never execute. This is not proof of 18 product defects.
- Evidence fixtures require policy reconciliation: arbitrary-format fixtures label package manifest/code usage VERIFIED without authoritative scoped verification. Current github-source-fact-v1 deliberately refuses those upgrades. Repair fixtures using authentic scoped evidence or candidate claims; never relax policy to satisfy old expectations.
No assertions deleted, no policy relaxed, no full-suite PASS claimed.

## Normal app database probe

Read normal app's resolved pool configuration without exposing secrets: TLS enabled, certificateValidation=false, caConfigured=false. A separate read-only SELECT 1 probe enforcing rejectUnauthorized=true failed with SELF_SIGNED_CERT_IN_CHAIN before authentication; credential rotation is NOT VERIFIED. Requested trusted Aiven CA path. No remote query succeeded, migration or data mutation occurred. Do not fall back to unvalidated TLS to make the probe pass.

Main contains an existing uncommitted integrity-policy change which admits evidence lacking verification metadata; it was not copied into this clean repair branch. Main remains untouched.

## Source-backed current dependency map

| Entry | Actual path | Divergence |
| --- | --- | --- |
| MCP generate_tailored_resume | src/mcp/tools/career-artifact-tools.js:892 -> JobApplicationWorkflowService.prepareJobApplication (:735) | Shared with extension but not Studio |
| MCP prepare workflow | src/mcp/tools/job-workflow-tools.js:144 -> prepareJobApplication | Same operation |
| Extension prepare-handoff | src/routes/extension.routes.js:1133 -> prepareJobApplication | Same operation |
| Web regeneration | src/routes/web.routes.js:4496 -> regenerateApplicationPackage (:1583) | Duplicates content/AI/structured/fitting orchestration |
| Web handoff fallback | src/routes/web.routes.js:4289 -> CandidateArtifactContentService.generateApplicationDocuments | Can compose documents independently when package absent |
| Studio master+job | ResumeStudioDraftService.create (:143) -> normalized master clone (:207), defaultStudioSelection (:238) | No authoritative tailoring, first two source projects |
| Studio preview/export | ResumeStudioDocumentService -> compileStudioDocument -> studioDocumentContent | Empty targetRole and fixed section order at document-content:182 |
| Existing application generation | prepareJobApplication -> generateApplicationDocuments (:1090) -> AI content (:1211) -> buildStructuredResumeSnapshot (:1227) -> integrity schemas/receipt -> fitOnePageResume (:1252) -> persistPreparedPackage (:1386) | Existing implementation to reuse |
| Regeneration | generateApplicationDocuments (:1780) -> AI (:1987) -> structured (:2003) -> fitting (:2026) | Duplicated orchestration must converge |

Rendering: latex-compiler.service.js:220 and :253 explicitly bypass native TeX for strictOnePage; Chrome HTML :705 uses Segoe UI/system sans. Studio subclasses that converter for layout trials. Font declarations alone do not establish PDF embedding.

Provider: ai-resume-content-generator.service.js:51 resolves a configured provider; explicit false/null and non-live tests use deterministic composition. Workflow catches AI errors and logs fallback. Accepted artifact metadata still needs investigation.

Identity today: canonical reviewed resume/version in resumes and candidate profileMetadata.resumeData; applicationPackages hold versioned generated structures; Studio drafts separately encrypt master/content and append CAS revision history; Studio documents bind exact draft/revision/content/source hashes. A generation-to-Studio relationship is missing. Preserve current encryption, CAS, approvals and historical packages while adding linkage.

## Remaining acceptance / next steps

1. Finish isolated unit baseline, reconcile CI root causes and inspect runtime TLS without logging credentials.
2. Finish remaining contracts/source review and real master/defective-artifact discovery without remote mutation.
3. Stage B: extract shared existing orchestration and prove generation/regeneration parity before adding Studio adapter.
4. Stage C/D: durable generation linkage, Library, exact Studio loading, version comparison and explicit compatible edit carry-forward.
5. Stage E: actual embedded Latin Modern and independent one-page geometry/content/DOCX verification.
6. Stage F: complete real HTTP/browser journeys and all repository gates; leave local fixture app for manual review.

NOT VERIFIED: credential rotation connectivity/TLS, original/corrected real candidate PDF, complete shared-engine implementation, generated Library linkage, regeneration carry-forward, corrected font embedding, DOCX pagination, final browser workflows or full acceptance. No completion percentage asserted.

## Stage B checkpoint: shared composition extraction

Changed src/services/job-application-workflow.service.js and added src/services/resume-generation-content.service.js. Both prepareJobApplication and regenerateApplicationPackage now call generateResumeContent for AI/deterministic composition, structured snapshot construction, schema/evidence validation and physical fitting. Removed duplicated orchestration; retained existing services, JSON-safe cloning, caller authorization, source loading, persistence, approval and renderer policies. Provider failure logs no longer include arbitrary provider exception text.

This is an internal composition boundary, NOT the completed authorized generation/persistence API. Source resolution, project selection and application persistence still live in workflow. Studio and web handoff fallback still diverge. No UI change, new schema, source overwrite or approval bypass.

Tests added: tests/unit/resume-generation-content.test.js verifies semantic parity against pre-extraction composition for fresher and long-history fixtures, source immutability, compiler failure propagation and rejection of unknown page count. Compiler is explicitly stubbed in these contract tests; no PDF acceptance claim.

Verification:
- Before extraction: 29/29 existing source-grounded writing and one-page selection tests pass.
- After extraction/final JSON-safe clone check: 33/33 pass, zero failures/cancellations/skips; output/unified-resume/composition-final.log.
- Full post-extraction suite: 4465 tests, 4285 pass, 180 fail, zero cancelled/skipped, 274.96 seconds; output/unified-resume/unit-after-extraction.log. Reused isolated fixture DB after baseline, so not a fresh-state/Node22 CI equivalence claim. All failing test locations were already failing or cancelled in baseline; AI-quality setup completed this time, revealing failed job-conditioning assertions (FullStack/PythonBackend summary similarity 1.000 and frontend emphasis failure). Full suite remains RED.
- Scoped ESLint: zero errors, eight preexisting workflow warnings. Scoped formatting and git diff --check pass.
- Secrets scan: PASS. Schema integrity: PASS (zero unindexed FKs/stale update paths). Drizzle migration-journal check: PASS. Logs in output/unified-resume.
- No remote CI rerun, push or deployment.

Provider investigation: current summary synthesis invokes provider.generateStructured when configured but discards its output, then uses composeSourceGroundedSummary. Metadata honestly reports SOURCE_GROUNDED_DETERMINISTIC/providerUsed=false and ADVISORY_ONLY/FAILED/UNAVAILABLE. Provider-authored writing is not implemented by this extraction; must add validated fact-bound selection/composition without bypassing current policy.

## Actual existing PDF baseline

Independent PyMuPDF 1.26.7 inspection (isolated Temp dependency) of tracked synthetic artifacts:
- output/pdf/test-retention/mid-backend-after.pdf: 1 page, 594.96 x 841.92 pt; embedded font resource names SegoeUI-Bold, SegoeUI-Semibold, SegoeUI, SegoeUI-Italic.
- output/resume-studio/screenshots/integrated.pdf: 1 page, same dimensions; SegoeUI-Bold, SegoeUI, SegoeUI-Italic plus MicrosoftYaHei/Bold glyph fallback.

These are existing synthetic PDFs, not the user's original defective PDF or repaired outputs. Confirms typography mismatch in actual PDFs. No new rendered artifact, corrected geometry or visual acceptance is claimed. Default Python lacked PyMuPDF; old project inspection runtime had access restrictions; new runtime lives at C:/Users/VISHW/AppData/Local/Temp/career-unified-pdf-inspection and requires access as its installing user.

Continuation priority: complete authorized generation/persistence boundary and stable generation identity, then map exact saved content into Studio without cloning master. Preserve all current source/approval invariants. The full original A–H acceptance checklist remains outstanding; do not relabel this bounded extraction as complete.

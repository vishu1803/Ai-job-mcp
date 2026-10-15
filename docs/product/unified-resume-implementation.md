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


### Optimizer regression checkpoint - locally verified, lifecycle remains IN_PROGRESS

Frozen unit run on b54daa1: 4481 total, 4300 pass, 181 fail, zero cancelled (unit-frozen-vertex-checkpoint.log). Diagnosed new resume-structure-content-conditioning:223 failure: layout optimizer expanded selected project bullets after semantic freeze. Allowing truthful one/two-bullet content exposed a previously masked path; assertSemanticEquivalence erroneously permitted bullet additions. Fixed optimizer to retain the exact validated structure across layout trials, apply only layout proposals after freeze and fail overflow instead of pruning accepted bullets. Tightened semantic assertion to reject additions, removals, rewrites and reorderings. Updated the rollback test to trigger a genuine compact-layout trial rather than content expansion, preserving all rollback assertions.

Verification: three new DB-independent preservation tests PASS (changed master, multi-pass compile, bullet additions/changes and compact overflow). Existing focused optimizer/AI/content contract run: 41 pass, two known baseline failures (fixed section-order expectation omits existing coursework/languages; fallback/master summary identical across jobs). Previously new semantic-fingerprint case now PASS. These baseline defects remain open. No assertion disabled or evidence policy relaxed. Scoped ESLint zero errors, existing warnings. Full suite remains RED and is not acceptance.

Disposable PG cluster had stopped; restarted the existing loopback cluster without reinitializing data. Its log reports Windows resource error 1450 and a recovery delay from server.log sharing inside the data directory. No remote database action performed. Next: durable generation persistence and exact Studio adapter, then typography/browser gates; baseline summary quality and CI failures remain required closure.


### Durable generation ledger checkpoint - internal persistence verified, entry adapters not yet integrated

Added new resume_generations table/schema and ResumeGenerationVersionService. It stores encrypted, hash-bound exact structured content, complete canonical source snapshot/version/hash, target job snapshot, selected/omitted content decisions through the existing tailoring/receipt data, provider/renderer metadata, PDF/DOCX artifact descriptors, origin, optional application/package references and parent generation. Reuses existing AES-GCM chunked payload storage; no new encryption design or competing generator. Trusted owned contexts only; source readiness and current canonical snapshot are rechecked under a candidate row lock at save. Concurrent identical idempotency keys return the existing immutable version, changed requests conflict. Historical reads do not require the source to remain current. Database guards reject forged owner/source/parent/application/package bindings and content updates. Application/package deletion may unlink their optional relational references; the encrypted request retains the original historical association. No generation operation can promote a package through this service.

Compatibility analysis: migration0026 only creates a table, indexes, function and trigger. No existing table, enum, data, package hash, Studio revision or API contract changed. Old application versions can continue operating while the new table exists. No backfill of guessed historical identities. Rollback of application code can leave the unused additive table in place; removal would require an explicit backup/export and separate authorized migration. Never delete recorded generations during rollback. All FK columns have supporting leading indexes. Prototype local migration was adjusted before commit to add two missing FK indexes, then all 27 migrations were successfully applied to fresh isolated product_audit_unified_migration_0026 on the existing disposable loopback cluster (9 generation-table indexes). Existing isolated test DB also has the additive indexes. No Aiven schema change or remote migration.

Verification: tests/integration/resume-generation-versions.test.js 9/9 PASS using real dedicated PostgreSQL, synthetic source and artifact-reference fixtures. Covers exact encrypted save/reload, concurrent retries, conflicting keys, cross-tenant/readonly denial, immutable parent/child preservation, stale source/evidence rejection, database mutation/scope guards and unchanged candidate/master. These are persistence contracts with fixture artifact descriptors, NOT proof of real generated PDF/DOCX or HTTP/browser lifecycle. Scoped ESLint zero errors; Drizzle journal check PASS. Existing schema audit parses only core schema.js and does not inspect this new module; reviewed indexes directly and validated fresh SQL execution instead. No UI/API adapter or generation caller uses the ledger yet. Next checkpoint must connect the authoritative operation and exact Studio loading, preserving old draft contracts and approved application selection.


### Exact generation-to-Studio checkpoint - persistence/HTTP verified; overall milestone IN_PROGRESS

New migration0027 adds nullable generation_id to Studio drafts, a unique generation link and a narrowly extended source guard. Existing NULL-generation drafts retain the original reviewed-master policy, encryption identity and CAS rules. Generation-backed inserts require exact saved generation ownership/source-version/hash instead of requiring the old master to remain current. Generation linkage cannot change on updates. All 28 migrations PASS on fresh disposable product_audit_unified_migration_0027. No remote migration. Rollback may leave the nullable column/index in place; older code can operate legacy drafts but should not be used to edit newly generated drafts, whose payload has additive fields. Never remove links or rewrite encrypted snapshots to force downgrade compatibility.

Studio POST /drafts now also accepts exactly {generationId}; no client-authored content or ownership override. Locks the saved generation, reuses its existing draft, copies only its saved one-page selected view into editing representation, and retains original generation/source snapshots encrypted. Added generation reference metadata and optional targetRole/sectionOrder/DSA to editing contract; portable JSON schema updated. Original fact IDs, provenance and skill category metadata remain in sourceFields and the immutable generated snapshot; candidate editing nodes retain existing CLAIMED semantics. Generated initial summary, selected skills/categories, project ordering/bullets/links and source experience are preserved. Document projection now honors saved targetRole/order/categories and DSA; DOCX block ordering matches selected section ordering. Existing draft projection defaults remain for historical records. Frontend /resume-studio?generationId= opens the exact saved version, then replaces the URL with stable draftId; refresh reuses it. UI/browser execution of this new deep link is not yet acceptance-verified.

Verification: tests/integration/resume-generation-versions.test.js 13/13 PASS (generation-studio-http-final.log): real PostgreSQL plus real Fastify HTTP/session/CSRF; exact generated content, edited save/reopen, stale save rejection, generation immutability, ownership denial, historical-master opening, existing history/restore CAS and portable response schema. Synthetic persistence/artifact-reference fixtures only, no mocked HTTP API responses. Existing Studio unit/state/navigation/frontend/proposal/document gate 49/49 PASS. Scoped ESLint zero errors, format and diff checks PASS. No compiled Studio round-trip, exported documents, browser screenshots or approval/handoff proof claimed by this checkpoint.

Remaining critical integration: existing master+job create path still clones source until the authoritative authorized operation is connected; web/MCP/extension/workflow generation does not yet save into the new ledger; Library generation cards/actions and regeneration comparison/edit carry-forward remain missing. These are acknowledged incomplete paths, not separate new generators. The new content adapter only converts an already-generated representation; it does not rank, tailor, rewrite or call AI. Next: authoritative source/ranking/render/persist orchestration shared by callers, then Library/UI and exact approval/handoff. Existing red full-suite/summary issues and Latin Modern/DOCX/browser/live Vertex acceptance remain open.


### Authorized generation operation checkpoint - Studio master entry corrected; other adapters pending

Added ResumeGenerationService.execute around existing generateResumeContent, ProjectRelevanceService, canonical master/source helpers, common Studio document compiler, evidence receipt sealing and DocumentStorageService. Requires an owned active candidate, current reviewed master/version, bounded job, allowed origin/template, optional owned parent/application and stable retry key. Loads immutable master snapshot before provider work; rechecks it when committing the generation. Reuses original canonical project reconciliation and the existing resumeSkillInputs helper (now exported) so indexed-only profile views cannot silently drop imported master projects or skills. Provider policy/factory/Vertex ADC/IAM remain unchanged. The selected content is compiled and independently checked, both artifacts stored with existing authenticated evidence envelopes, then the durable version is saved. Failed writes clean up only newly created artifact blobs; concurrent retries retain the first generation. Origin is provenance metadata, not idempotency/content policy.

Studio master+job POST now invokes this operation, saves successfully, then opens that exact generation. Removed the old master-clone/default-selection orchestration. Existing generationId path, encrypted revisions and source normalization remain. Saved complete job-analysis snapshot is reused in Studio when present. Other web/MCP/extension workflow generation still calls the shared composition helper directly and must be adapted to execute; it is not yet the final unified entry contract.

Confirmed another integration defect: JobDescriptionParser returns JobRequirement.extractedValue, while normalizeJobInput ignored this canonical field and erased explicitly supplied parsed requirements. Added extractedValue fallback when prior text fields are absent, preserving existing text precedence. Regression test covers actual parser-to-normalizer Node.js/PostgreSQL retention and rejects malformed field shape. Comparable existing normalization gate before 28 pass/1 fail; after 30 pass/1 same baseline failure (PARTIAL versus MATCHED provenance expectation). No parser/evidence assertions weakened.

Also confirmed fallback writer/master precedence retained generic original summaries. Job-conditioned writing now asks the existing deterministic fallback to select supported facts instead of copying the master verbatim; direct source-normalization defaults preserve authored source summaries. Builder accepts the resulting grounded summary with truthful deterministic metadata. Fitter preserves a chosen, fact-bound writer summary; existing explicit dedup behavior remains for unrelated source projections. One new fallback case verifies no false providerUsed claim, nonempty grounded output and unchanged master.

Verification: focused writer/composition/fitter/optimizer/Studio gate 81/81 PASS (generation-operation-focused.log). Real database/Fastify ledger/Studio integration 14/14 PASS (generation-operation-final.log), including execute with actual source/ranking/fixture-provider/receipt/encrypted storage, retry reuse across origins, master+job-to-generated-Studio, compiler failure without completed version, and artifact decryption/hash binding. Its compiler bytes/verification are explicitly controlled contract fixtures, not real document acceptance. Scoped ESLint zero errors/14 existing warnings; formatting/diff checks pass. Full frozen suite not yet rerun. New operation is not yet connected to every workflow adapter; Library/compare/approval/handoff/real compiler/browser/font gates remain open. Next: adapt existing workflow prepare and regeneration (preserve public results), connect version Library/API and bind handoff to exact saved artifacts, then actual document/browser verification.


### Real saved-document pipeline and contact-retention checkpoint

Added scripts/verify-unified-generation.mjs: guarded synthetic-only loopback operation using a deterministic Vertex fixture, real JobDescriptionParser/ProjectRelevanceService/shared writer/fitter, actual Chrome PDF and native DOCX compilation, independent Python PDF/OpenXML verifier, authenticated encrypted artifact storage, durable generation records and exact Studio opening. Each run now writes to a unique directory and advances latest.json only after both targets succeed, preventing mixed old/new artifact evidence. It intentionally retains its disposable candidate/master/generation fixtures for subsequent browser review. No real provider or Aiven request.

Actual successful artifacts: output/unified-resume/integrated-generation/2026-10-15T17-26-18.055Z-d5185770/. Backend selected Library API; Full-Stack ranked Community Events first and also selected Library API. Distinct fixture-provider summaries survive exact saved structures, actual PDFs and Studio drafts. PDF/DOCX hashes verified against encrypted stored bytes. Both are one physical A4 page, 594.96 x 841.92pt, minimum observed body 9.9975pt; independent checks report text/word spacing/Unicode maps/reading order/links/margins/no overlap/no clipping and DOCX paragraph equivalence. Both final PDF rasters visually inspected. DOCX pagination in Word/LibreOffice remains NOT VERIFIED. Sparse synthetic source and deliberately limited fixture prose leave substantial unused page area; no final density/content-quality acceptance is claimed.

Visual review exposed source identity fields lost between canonical identity and low-level profile projection. Fixed the new operation to retain reviewed master phone, location, headline and profile links; explicit current candidate email takes precedence, otherwise reviewed master email is retained. Current userCustom null/empty contact clears are honored even with a warm low-level profile cache, using the freshly authorized owner snapshot for source precedence. Old generation identity remains immutable after a clear/regeneration. Regression integration remains 14/14 PASS (generation-operation-contact-final.log); independent final PDF inspection confirms phone/location and links in both documents. Source/master data is unchanged by generation.

Required font acceptance still FAILS: actual final font inspection reports embedded SegoeUI Regular/Bold/Semibold/Italic. The compiler's generic embedded-font check is not a Latin Modern family check. This checkpoint proves real content/persistence/rendering, not final typography. Font repair, all-entry adapters, Library, explicit comparison/carry-forward, approval/handoff and full browser/CI closure are outstanding. Original owner master/previous defective PDF remain unavailable by a scoped identity; asked asynchronously for sign-in email, candidate/master ID or local path, and continue synthetic work. Live synthetic Vertex authorization remains pending separately.

### Entry-adapter checkpoint - shared execute boundary, lifecycle still IN_PROGRESS

Normal application generation, MCP generate/prepare, extension authenticated prepare-handoff, web regeneration and Studio master-entry now reach ResumeGenerationService.execute. CandidateArtifactContentService projects the saved structure into its existing document DTO; workflow no longer runs its own second composition. Origin is authenticated adapter metadata and excluded from content/idempotency semantics. Complete provided plus parsed job requirements are bounded and retained; existing EvidenceMatchingService and ProjectRelevanceService feed the shared writer. Imported non-UUID project identities are mapped deterministically within the candidate scope while retaining original source identifiers. Canonical source sections are restricted to the selected master. Existing provider factory/Vertex ADC/IAM are untouched.

Confirmed defects repaired: single-technology prose requirements were not split into atomic skills; valid candidate-confirmed backend skills were prematurely restricted by repository evidence and a two-claimed-skills cap; actual job title was replaced by its normalized role family; MCP projection dropped authored experience strings/project descriptions and upgraded mere evidence references to VERIFIED. Inferred/unknown/missing and repository-only technologies still do not become candidate qualifications. Legacy content fixtures now supply the required reviewed master and valid owner identifiers; retain original content assertions and use the actual shared composition through a controlled saved-orchestration fixture. No fabricated independent verification.

Verification: dedicated PostgreSQL/Fastify/session/CSRF contract remains 14/14 PASS after source/matching integration (entry-source-matching-contract.log). Focused nearby content/writing gate 63/63 PASS; final source/legacy/selection gate 21/21 PASS (entry-checkpoint-final.log). Existing normalization gate has the same baseline PARTIAL-vs-MATCHED failure. Legacy regeneration tests still have two pre-existing fixture failures; MCP unit fixtures have the same four failing locations as frozen baseline and need current reviewed-master setup. Cross-adapter real HTTP generation parity is not yet proven. Current handoff still recompiles, and existing regeneration still promotes CURRENT: these are explicitly open defects for the next lifecycle checkpoint. Full suite remains RED; no acceptance or font/browser claim. No remote database call, migration, push or deployment.

### Regeneration and exact-artifact checkpoint - selection safety verified, comparison UI still open

Removed the old regenerate-and-promote branch. Regeneration now saves a new child through the shared operation and returns a Studio review link. It never records/promotes an application package, updates a handoff kit or transfers manual edits. Retries against the same selected package/master/reason reuse the generation. Reason is retained in immutable generation metadata. The web action opens the alternative in Studio. Saved job descriptions/requirements are recovered from the selected package when the older application row lacks them, avoiding title-only regeneration. Selective counterpart regeneration remains explicitly unavailable under the existing guard; BOTH remains supported.

Studio approval now binds generationId and canonical selected identity, and uses a generation's associated application when present. It still requires exact current revision, reviewed=true, measured document, existing source/evidence checks and version-bound approval ticket. Added an internal historical-approved-artifact resolver: validates authenticated package receipt, candidate/tenant ownership, document ID, revision, source/content hashes, generation and PDF/DOCX hashes; it reads immutable encrypted document bytes after later draft edits without weakening current-revision export/approval CAS.

Handoff resolves an exact saved generation or approved Studio artifact before rendering. It verifies the saved content/source reference and encrypted artifact receipt/hash and re-wraps the same PDF bytes under the application's current package receipt. It no longer recompiles that resume or invents a TeX export for it. Historical packages without a new reference keep their existing renderer. Cover-letter compilation and existing PDF QA/readiness checks remain. This is an internal artifact/HTTP contract checkpoint, not final browser or real-PDF acceptance.

Verification: isolated PostgreSQL/Fastify contract 15/15 PASS (lifecycle-handoff-contract.log). New scenario performs actual Studio approval/ticket, edits the old draft, regenerates twice, proves stable child identity and unchanged CURRENT package/old edits, opens unedited alternative, explicitly approves it for the same application as the next package version, and still reads the old approved bytes. Stale export/approval and foreign-owner access reject. Handoff test spies reject any resume rendering and assert one cover-letter-only compiler call plus byte-identical encrypted handoff PDF. Generation resolver rejects a sealed but mismatched content reference. Compiler and PDF-QA outputs in these contract cases are controlled fixtures; not independently measured real PDFs. Real compiled document evidence remains the earlier artifact checkpoint, with Segoe UI failure still open.

Nearby unit gate 57/57 PASS (lifecycle-unit-final.log), including accepted Vertex fixture writing, shared composition, Studio export gates, real-content assertions and existing extension reuse/page actions. Updated two previously failing regeneration fixtures to provide valid saved job data and match the approved review-before-selection contract; replaced impossible old implicit promotion assertions with explicit no-promotion/no-handoff-mutation and reason/parent assertions. No safety guard disabled. Scoped ESLint zero errors/eight existing warnings. No new schema migration, production call, push or deployment. Full suite, cross-adapter HTTP parity, Library, comparison/explicit compatible edit transfer, font repair and full browser journey remain IN_PROGRESS.

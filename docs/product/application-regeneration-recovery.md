# Application regeneration and historical package recovery

Date: 2026-10-14. Phase: P0 product acceptance. Status: **COMPLETE locally for full BOTH regeneration; live development verification required**. Production: **NO-GO**. No new roadmap PRD identifier.

## Original reproduction

The reported development application is219553ba-0e89-4a4d-babb-eff4fcc4490e and its missing historical hash is6355a3bca8e1f8daf4f745a2681de702382ba9486e82a271f1cd6e11676a32bf. Those live records were not read, edited, regenerated or approved in this task. Their missing-version cause is reported evidence, not a new database finding.

A new disposable PostgreSQL17 cluster at127.0.0.1:55444/product_audit_regeneration, isolated provider-blank ENV_FILE and synthetic tenants reproduce the failure through production services.110 persisted candidate skills contain MISSING at indices47,48,49,54,57,59,76,78,79,105. Before production edits, regeneration raises ten Zod invalid_enum_value errors at claimedSkills[index].truthCategory, received MISSING_EVIDENCE. Baseline:1 PASS/2 FAIL/0 CANCELLED/0 SKIPPED. The other failure used an all-digits historical hash and produced handoff HTTP500: the version-or-hash lookup misclassified a valid64-character numeric SHA as an integer version. This is a separate lookup edge case, not a claim about the reported mixed-hex hash. Fixed-width SHA recognition now precedes version parsing and still requires artifact quarantine validation. Final recovery fixtures use the reported mixed hash as a hint and separately test numeric hashes. Evidence: OS Temp career-regeneration-20261014/baseline.log.

A real PostgreSQL trigger rejects only the synthetic application's new package insert. The corrected fault assertion follows Drizzle's cause chain. Before transaction repair, the old application's handoffKit and updatedAt changed despite that failure; snapshots were written before promotion. Evidence: persistence-baseline-corrected.log,0 PASS/1 FAIL. The earlier fault-test invocation incorrectly matched the wrapper message rather than its PostgreSQL cause and is not counted as product preservation proof.

## Root cause and corrected truth-category contract

Database provenance and affirmative application claims are distinct domains. Canonical normalizeTruthCategory intentionally maps MISSING to MISSING_EVIDENCE. Both prepareJobApplication and regenerateApplicationPackage selected every non-VERIFIED/non-CORROBORATED row as a claimedSkill, with an inaccurate self-reported note. The affirmative schema correctly rejected missing evidence.

TruthCategoryEnum remains VERIFIED/CORROBORATED/CLAIMED/USER_PROVIDED/INFERRED. It is not widened to missing/unknown. A shared projection uses the existing ISSUE-06 skillTrustStatus: raw candidate rollups are not independent proficiency assessments. VERIFIED/CORROBORATED/INFERRED signals remain INFERRED unless an explicit stored candidate claim gives CLAIMED. SELF_DECLARED/LEARNING become CLAIMED; USER_PROVIDED remains distinct. No implemented repository extractor independently establishes candidate competence, so this projection emits no verifiedSkills. Independently validated source-fact policy is unchanged.

MISSING/UNKNOWN inventory is retained separately as optional skillGaps entries with name, availability (MISSING_EVIDENCE or UNKNOWN) and the existing candidateSkillId. These are inventory availability gaps, not affirmative qualifications or invented job requirements. Job matching retains its own required-but-unestablished semantics. Preview labels gaps explicitly. Render selection and the master-resume fallback omit unsupported statuses even when a job or project mentions the same skill. A separate failing unit baseline exposed AI context's empty-selection fallback treating missing-only profile inventory as authorized skills; that context filter is also repaired. Authoritative stored candidate rows are not removed or updated. An actual stored user claim remains a claim, not verified competence.

The new JSONB field is optional with no default. Existing package representations without it remain supported; no migration or historical rewrite is needed. New gaps participate in canonical hashing and approval binding as ordinary content. Hash format, timestamp contract, structured resume2.0.0, receipt signing and old approval bindings are unchanged.

## Historical recovery and persistence

- A handoff GET with a historical currentPackageHash but no available ledger row shows recovery. It does not generate replacement content or bless the missing hash.
- Explicit BOTH regeneration reads the owned application and current candidate/profile/job data, validates the saved job, generates fresh content and checks current source eligibility. It does not depend on missing/quarantined prose or answers.
- RESUME/COVER_LETTER with a missing/quarantined counterpart receives actionable HISTORICAL_PACKAGE_UNAVAILABLE guidance. Even a trusted counterpart currently receives PARTIAL_REGENERATION_UNAVAILABLE: the existing renderer rebuilds canonical resume content and cannot guarantee selective retention. Choose BOTH. Exact selective counterpart reuse remains a product limitation; no silent substitution is allowed.
- Fresh project rankings come from the current job/profile. Current trusted package reuse reads packagePayload, not the ledger envelope. Unknown scopes, invalid saved job data and READONLY contexts fail before persistence. No invented application destination is supplied when the saved URL is absent.
- Existing assertCurrentPackage/assertArtifactReceipt behavior remains. Internal persist:false handoff staging disables only ledger/cache/snapshot writes; it still validates the exact freshly sealed package and generates real QA-checked encrypted artifacts.
- After QA, one PostgreSQL transaction locks the application and records the package/receipt, encrypted document snapshots and handoff metadata using transaction-scoped tracking. Nested service transactions remain savepoints. Concurrent promotions serialize monotonically and bind every document/kit to its package hash. An insert/snapshot/metadata failure rolls back database exposure. Source changes remain fail-closed.
- Existing version IDs, payloads, hashes, old document bytes, approvals and executions are not replaced. Normal archival lifecycle changes preserve the old version. No consumed approval is reopened or inherited. Fresh approval is issued only by a separate explicit review/approval request bound to the new version.

Rendering before the transaction can leave encrypted staging files after a failed write or interruption. Such orphan files have no trusted package/document route and cannot be downloaded through the authenticated artifact journey. This repair does not add a general storage garbage collector.

## Tests and verification

New tests: tests/unit/application-skill-projection.test.js and tests/integration/application-regeneration-recovery.test.js. They cover missing/unknown projection, legacy affirmative categories, inference versus claims, job/master-resume exclusion, exact reported missing indices, actual HTTP recovery, real PDF download, preview, quarantine, partial recovery errors, inactive source, ownership/permissions, invalid job/scope, repeated/concurrent regeneration, real PostgreSQL insertion failure, fresh approval/consumed ticket preservation and new-process/server reload.

HTTP redirects alone are not acceptance: success requires a persisted valid CURRENT package, matching receipt/hash, correctly bound artifact metadata, SAVED application with no external submission, no inherited approval and working preview/download. Provider/GitHub content is controlled; actual PostgreSQL, TCP HTTP, encryption, Chrome PDFs and separate-process reload are exercised. No employer submission occurs.

**Final unique selected coverage:854 PASS/0 remaining FAIL/0 CANCELLED/0 SKIPPED across35 files;21 newly added tests (six unit/fifteen integration).** This is combined nonoverlapping acceptance evidence, not one all-green command or a sum of repeated executions. The35-file main run (gate-files-final.txt/gate-final.log) ran852 tests:850 PASS/two FAIL. The same-tenant denial assertion expected404 but the established route correctly returns403; corrected recovery rerun passed13/13. The other failure was an obsolete mock test expecting unauthenticated CODE_USAGE observations to be MATCHED. A read-only ESM loader ran unchanged HEAD source and reproduced16 PASS/one FAIL; assertions now require seven PARTIAL observations, zero verified matches and corresponding bounded heuristic weights. No production matching or verification policy changed. The corrected semantics rerun passed17/17 (truth-final.log).

The later numeric-hash repair was verified by a ten-file affected tracking/approval/quarantine/handoff rerun:214 PASS/0 FAIL (tracking-rerun-files.txt/tracking-final.log), including14 recovery cases and one added hash case. A further actual Applications-list→Handoff→Regenerate→Preview journey passed1/1 (applications-flow-final.log), giving the fifteenth recovery case. Earlier35-file run:767 PASS/50 FAIL, with49 setup failures from old hardcoded disposable-path guards and one unsupported raw-origin/CSRF-header expectation. Guards now allow only the exact new Temp cluster with port55444 and product_audit_regeneration assertions; existing ownership/evidence controls are unchanged. Header rejection was not an existing web-route contract; browser CSRF acceptance is not claimed or redesigned. Earlier fixture displayName and ticket CONSUMED/ISSUED corrections, Windows loader URL correction and all intermediate logs are retained separately, not added to final totals.

PRD-001 serialization/package identity, PRD-003 schemas/source/persistence/download, ISSUE-02 immutable approval target/content, ISSUE-03 durable at-most-once execution, ISSUE-06 source/provenance/narrative, historical quarantine, GitHub installation linking/reconnection/large-tree preservation and application tracking/handoff regressions pass in the selected coverage. Provider/GitHub fixtures do not establish live platform acceptance. Full-repository/hosted CI, live AI, installed extension and the user's actual application recovery are not verified here.

Quality:14 JavaScript syntax checks PASS; lint0 errors/16 pre-existing warnings (source baseline17), no new warnings;13 other JS files/two docs Prettier PASS; strict scoped scan16 files/zero secret findings and whitespace PASS. Lifecycle audit117 integration files/102 DB users/zero violations PASS. The existing job-workflow.schemas.js full-file Prettier drift is reproduced on HEAD and left unchanged outside the new formatted gap block. No migration/dependency changes. Fresh migration applied22 existing migrations. After test teardown the disposable cluster contains zero tenants and zero other connections; its exact Temp path/postmaster.pid port55444 were verified and only that cluster stopped successfully. Test artifacts/logs remain in OS Temp career-regeneration-20261014.

## Files changed

- src/services/application-skill-projection.js: shared affirmative-claim/gap projection.
- src/domain/job/job-workflow.schemas.js: optional typed availability gaps; affirmative vocabulary preserved.
- src/services/job-application-workflow.service.js: both projections, fresh data/job/scope handling, transactional promotion and explicit gap preview.
- src/services/application-handoff.service.js: authenticated staging without ledger writes and transaction-scoped artifact snapshots.
- src/services/application-tracking.service.js: fixed-width SHA-256 recognition before numeric version parsing; ownership and receipt gates unchanged.
- src/services/candidate-artifact-content.service.js and structured-resume.service.js: omit missing/unknown skills from affirmative rendering.
- src/services/ai-context-sanitizer.service.js: filter missing/unknown skill inventory from model authorization context, including empty-selection fallback.
- src/routes/web.routes.js: missing-hash recovery and actionable regeneration errors.
- Two focused test files, exact disposable-cluster allowlist updates in historical-artifact-quarantine.test.js/github-large-tree-synchronization.test.js, obsolete controlled-observation assertions in truth-category-and-requirement-semantics.test.js, this report and project.md.

## Completion and remaining limitations

Full BOTH regeneration is locally verified, including persisted packages rather than success redirects alone. Exact selective counterpart reuse remains blocked with explicit guidance; no falsely advertised retention or new bytes substituted under a partial request. Orphan encrypted staging-file garbage collection is not added. Live development recovery, installed extension/live providers, and broader resume writing/ATS/layout quality remain separate. The exact historical reason the reported hash is absent remains unknown without a separately scoped read-only investigation of that development record; no missing historical bytes are invented.

APPLICATION REGENERATION: PASS (local BOTH)

MISSING_EVIDENCE HANDLING: PASS

HISTORICAL PACKAGE QUARANTINE: PASS

NEW PACKAGE PERSISTED: YES (disposable fixtures)

FRESH APPROVAL REQUIRED: YES

APPROVED SNAPSHOTS IMMUTABLE: PASS

TENANT ISOLATION: PASS

PRD-001 REGRESSION: PASS

PRD-003 REGRESSION: PASS

ISSUE-06 REGRESSION: PASS

TOTAL TESTS PASSING:854

TOTAL TESTS FAILING:0 (final selected acceptance; intermediate failures above)

PRODUCTION DECISION: NO-GO

## Live development verification required

No configured development database or GitHub resources are modified. The repair still needs the user's explicit live regeneration of application219553ba-0e89-4a4d-babb-eff4fcc4490e. Use the updated development server, open Handoff, select BOTH and Regenerate, inspect the newly persisted package/documents, then separately review and approve the new version. If source eligibility is blocked, reconnect/select/synchronize the specific source through the existing supported lifecycle before retrying. No historical package bytes are reconstructed or approved automatically.

Production remains **NO-GO**.


## Subsequent strict one-page writing repair (2026-10-14)

The user reported live development regeneration success after the repair above. The subsequent [PRD-002 repair](prd-002-source-grounded-writing.md) makes normal preparation and BOTH use the same factual writer and pre-seal A4/10pt one-page selection. New actual HTTP/PostgreSQL tests verify full-source save/reload/edit/BOTH, selected preview/export and controlled overflow without partial package persistence. Historical quarantine, current artifact receipts, source eligibility, immutable snapshots and fresh approval remain required. This session did not regenerate any existing user application. Updated live PDF inspection requires the user's next explicit BOTH regeneration and separate review/approval; production NO-GO.

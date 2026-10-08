# ISSUE-06 Final Closure Report

Date: 2026-10-08. Decision: **FIX IMPLEMENTED BUT LIVE VERIFICATION REQUIRED**.
Local remediation COMPLETE; real provider, deployment and browser/MCP staging acceptance remain NOT VERIFIED — EXTERNAL DEPENDENCY. No overall completion percentages changed.

## Original Security Blockers

The previous completion pass correctly remained incomplete: 53 of the original 54 failures resolved, 1,346/1,350 selected passes, model prose and historical artifact/CURRENT reuse gaps. This pass closes those two boundaries; prior ISSUE-01–05 security implementations remain unchanged.

## Model-Prose Exploit Reproduction

Before edits, the unchanged test `assistant must not return model self-attestation as verified candidate proficiency` failed: one test, zero passes. Authoritative input was React **INFERRED**, model input was profile/workspace guidance context, model output was “Your React proficiency is independently verified”, and public `response.content` repeated it even though citation.verified=false. The escape boundary was `AiCareerAssistantService._parseStructuredResponse`, which copied both structured summaries and free-form text.
Evidence: OS-Temp `issue06-closure-before-narrative.log`. The assertion was not weakened; it now passes.

## Server-Enforced Narrative Trust Boundary

Model prose and metadata are untrusted, irrespective of language, confidence, citation shape or real evidence IDs. No semantic keyword filter or prompt-only guarantee is used:

- Assistant accepts only deduplicated allowlisted navigation IDs; labels, findings and public text come from server templates.
- Summary/project-bullet providers cannot replace server synthesis. Resume/cover-letter adapters retain exact server wording; arbitrary rewrites fall back.
- Composed summaries do not default to VERIFIED. Composition is not verification.
- Project-improvement patches remain proposed untrusted code. Public descriptions and validation plans are server-authored, prospective, and explicitly not proof of candidate experience.
- Export requires a module-private generation capability with an unchanged content fingerprint. Copied JSON, changed objects and imported legacy prose cannot self-assert current policy.

Policy receipt and generation capability establish generation provenance, **not** candidate proficiency. Existing authoritative evidence checks remain the only way to retain narrowly scoped source facts.

## Output Channels Protected

| Consumer                                                  | Server enforcement                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| Browser career assistant / web API                        | Server summaries/findings/action labels; model action IDs only           |
| Extension job explanation                                 | Deterministic page-derived advice, not provider prose                    |
| Candidate summaries, structured resumes, application text | Deterministic synthesis and existing evidence trust normalization        |
| Resume and cover-letter linguistic adapters               | Exact server wording only; metadata reconstructed                        |
| Portfolio/export formats                                  | Fresh server-generation capability; imported historical text rejected    |
| Matching/ranking                                          | Existing deterministic trust policy; no model status authority           |
| Project-improvement MCP proposals                         | Server prospective descriptions/plans; patch is unverified proposed work |
| MCP text/structured/tools/resources                       | Same domain services; application dossier uses guarded tracking reads    |

This describes the repository's current server channels, not an assurance that arbitrary external AI clients cannot misinterpret returned observations. Already-downloaded/offline copies cannot be recalled.

## Historical Artifact Inventory

| Path                                                          | Treatment                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Encrypted PDF, TeX, cover-letter and portfolio bytes          | Unmarked legacy plaintext rejected after decryption, retained in storage                        |
| Direct storage identifiers                                    | Authenticated tenant/candidate envelope, purpose, expected package and current receipt required |
| Web view/download/ZIP                                         | Resolve guarded selected/current package before storage; quarantine rejects bypass              |
| Document listings/previews and package history                | Unsafe prose/payload redacted, identity/history retained                                        |
| Application list/detail/cached metadata                       | Unsigned handoff caches and legacy embedded packages removed from responses                     |
| CURRENT reuse, version selection and restore                  | Current receipt/hash/source checks; no automatic historical promotion                           |
| Approval issuance and approved-package execution              | Current policy check before issuing or atomically claiming execution                            |
| MCP application resources/tools and extension prepare/preview | Common guarded tracking/workflow/storage services                                               |
| Uploaded source-resume originals                              | Scoped owned-source capability; user claims, never generated/verified output                    |

No generic public document-ID download bypass was found; source-resume document IDs resolve through owned ingestion. Lower-level storage-ID attacks are exercised directly.

## Artifact Quarantine Policy

Fresh server generation creates an HMAC receipt with policy `source-backed-narrative/v1`, tenant, candidate, canonical package body hash, issue time, nonce and sorted candidate resource bindings (resource/connection state, owner, external identity, URL and evidence epoch). Receipt signatures use the validated application secret with a distinct domain `career-artifact-policy-receipt/v1`; there is no fallback secret.
The receipt is approval-sensitive package content. The ISSUE-02 canonical serializer/hashing is reused. Reads revalidate signature, content, scope, source bindings and a conservative **24-hour** freshness window. Invalid/unavailable DB state fails closed. Any captured source change/revocation/deletion requires regeneration and fresh review.

AES-GCM authenticated envelopes bind generated bytes, plaintext SHA-256, tenant/candidate, purpose and package receipt. Handoff cache manifests authenticate the entire kit; copying a valid receipt onto changed cache prose/URLs is insufficient.
Historical records are not deleted or assigned invented provenance. Claims remain available with accurate labels. Current-policy artifact reuse fails conservatively if any candidate resource/connection is inactive or ownership is inconsistent; operational cleanup/reingestion may be necessary before fresh generation. This conservative availability tradeoff is intentional, not a claim of live GitHub freshness.

## Approved Snapshot and Execution Safety

No production code rewrites approved snapshots, substitutes regenerated content or reopens consumed approvals.

- A newly regenerated package has a new server receipt/hash and needs new human approval.
- Handoff rendering resolves the exact persisted package version when a UI-enriched preview is supplied; client additions are not blessed.
- An otherwise correctly signed historical snapshot without current provenance is rejected **before** execution claim; adapterCalls=0 and stored snapshot unchanged.
- Revocation after a consumed approval leaves it permanently CONSUMED; replay does not invoke the adapter again.
- ISSUE-03 durable PostgreSQL execution ownership and ISSUE-04 single-use credential transactions are unchanged.

## Files Changed

**93 files in the complete existing ISSUE-06 worktree footprint**, including retained earlier ISSUE-06 implementation; not 93 files newly edited in this closure pass. Other pre-existing ISSUE-04/05 changes and unrelated `.claude/` are excluded and preserved.

| File                                                             | Reason                                                                                                               |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                   | Existing parser dependency and reproducible installation.                                                            |
| `package-lock.json`                                              | Existing parser dependency and reproducible installation.                                                            |
| `drizzle/meta/_journal.json`                                     | Existing ISSUE-06 evidence downgrade, source-epoch guards and migration journal; no artifact rewrite.                |
| `drizzle/0021_evidence_verification_integrity.sql`               | Existing ISSUE-06 evidence downgrade, source-epoch guards and migration journal; no artifact rewrite.                |
| `src/connectors/github/github-connector.js`                      | Existing pinned authoritative source extraction and narrow verification scope.                                       |
| `src/domain/candidate/candidate.schemas.js`                      | Compatible observation/claim semantics; never equate technology labels with proficiency.                             |
| `src/domain/career/cover-letter.schemas.js`                      | Compatible observation/claim semantics; never equate technology labels with proficiency.                             |
| `src/domain/career/resume.schemas.js`                            | Compatible observation/claim semantics; never equate technology labels with proficiency.                             |
| `src/domain/career/skill-taxonomy.js`                            | Compatible observation/claim semantics; never equate technology labels with proficiency.                             |
| `src/domain/mcp/career-artifact-tools.schemas.js`                | Apply common trust policy at web, extension and MCP boundaries.                                                      |
| `src/extractors/github/code-scanners/import-scanner.js`          | Existing pinned authoritative source extraction and narrow verification scope.                                       |
| `src/extractors/github/github-evidence-extractor.js`             | Existing pinned authoritative source extraction and narrow verification scope.                                       |
| `src/extractors/github/skill-rollup.js`                          | Existing pinned authoritative source extraction and narrow verification scope.                                       |
| `src/mcp/tools/career-artifact-tools.js`                         | Apply common trust policy at web, extension and MCP boundaries.                                                      |
| `src/routes/extension.routes.js`                                 | Apply common trust policy at web, extension and MCP boundaries.                                                      |
| `src/services/ai-career-assistant.service.js`                    | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/ai-resume-content-generator.service.js`            | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/candidate-artifact-content.service.js`             | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/candidate-fact-inventory.service.js`               | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/candidate-profile.service.js`                      | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/cover-letter-drafting.service.js`                  | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/evidence-linking.service.js`                       | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/evidence-matching.service.js`                      | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/evidence/evidence-ref-mapper.js`                   | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/evidence/verification-policy.js`                   | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/extension-assistant.service.js`                    | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/portfolio-recommendation.service.js`               | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/resume-composition-primitives.js`                  | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/structured-resume.service.js`                      | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/zero-hallucination-integrity.service.js`           | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `tests/unit/evidence-verification-security.test.js`              | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/evidence-verification-security.test.js`       | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/evidence-verification-migration.test.js`      | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `docs/security/evidence-verification-integrity.md`               | Trust policy, failure inventory, closure evidence and staging instructions.                                          |
| `project.md`                                                     | Execution ledger, verified results and rollout limitations.                                                          |
| `tests/fixtures/pinned-github-connector.js`                      | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `src/services/resume-tailoring.service.js`                       | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/mcp/tools/career-read-tools.js`                             | Apply common trust policy at web, extension and MCP boundaries.                                                      |
| `src/mcp/resources/career-resources.js`                          | Apply common trust policy at web, extension and MCP boundaries.                                                      |
| `src/domain/mcp/career-read-tools.schemas.js`                    | Apply common trust policy at web, extension and MCP boundaries.                                                      |
| `src/domain/extension/extension-assistant.schemas.js`            | Compatible observation/claim semantics; never equate technology labels with proficiency.                             |
| `src/domain/career/portfolio-recommendation.schemas.js`          | Compatible observation/claim semantics; never equate technology labels with proficiency.                             |
| `tests/unit/mcp-career-read-tools.test.js`                       | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/mcp-career-read-tools.test.js`                | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/resume-tailoring.service.test.js`                    | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/resume-tailoring.service.test.js`             | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/portfolio-recommendation.service.test.js`            | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/mcp-candidate-profile-contract.test.js`              | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/candidate-profile.service.test.js`            | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/candidate-repository-ingestion.test.js`       | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/evidence-linking.test.js`                     | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/github-evidence-extractor.test.js`            | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/source-resume-ingestion.test.js`              | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/analyze-job-fit-evidence-trust.test.js`              | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/candidate-artifact-content.test.js`                  | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/cover-letter-drafting.service.test.js`               | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/evidence-linking.test.js`                            | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/evidence-matching.service.test.js`                   | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/github-evidence-extractor.test.js`                   | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/p87-ai-career-assistant.test.js`                     | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/skill-taxonomy.test.js`                              | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/p87-extension-ai-assistant.test.js`                  | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `src/services/career-artifact-export.service.js`                 | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `tests/unit/career-artifact-export.service.test.js`              | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/cover-letter-drafting.service.test.js`        | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `docs/security/issue06-completion-failure-inventory.md`          | Trust policy, failure inventory, closure evidence and staging instructions.                                          |
| `tests/unit/p89-ai-provider-architecture.test.js`                | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `src/services/evidence/narrative-policy.js`                      | Exact server rendering and nonserializable generation capability.                                                    |
| `src/services/evidence/artifact-policy.js`                       | Server-signed current-policy receipts and source/freshness checks.                                                   |
| `src/services/document-storage.service.js`                       | Authenticated encrypted envelope and legacy-byte quarantine.                                                         |
| `src/services/source-resume-ingestion.service.js`                | Keep owned source originals as claims, not generated artifacts.                                                      |
| `src/services/application-handoff.service.js`                    | Resolve exact persisted content, bind generated bytes and authenticate cache manifests.                              |
| `src/services/application-tracking.service.js`                   | Quarantine package history, documents, lists and unsigned caches at retrieval.                                       |
| `src/services/job-application-workflow.service.js`               | Guard CURRENT reuse, approval creation and pre-claim execution; seal only fresh generation.                          |
| `src/services/resume-accomplishment-composer.service.js`         | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/routes/web.routes.js`                                       | Apply common trust policy at web, extension and MCP boundaries.                                                      |
| `src/mcp/tools/handoff-artifacts.js`                             | Apply common trust policy at web, extension and MCP boundaries.                                                      |
| `tests/unit/narrative-trust-boundary.test.js`                    | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/historical-artifact-quarantine.test.js`       | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/application-approval-content-binding.test.js` | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/application-approval-execution.test.js`       | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/p55-ai-context-privacy.test.js`                      | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/phase9-4-approval-persistence.test.js`        | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/security-authorization.test.js`               | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/integration/application-handoff-route.test.js`            | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/application-regeneration.test.js`                    | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/application-content-defects.test.js`                 | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/application-package-lifecycle.test.js`               | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `tests/unit/p17-gemini-realization.test.js`                      | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `src/services/resume-content-strategy.service.js`                | Conservative downstream evidence and narrative rendering; preserve useful claims without verification upgrades.      |
| `src/services/project-improvement-recommender.service.js`        | Keep proposed code untrusted; render qualification prose and verification plan on server.                            |
| `tests/unit/project-improvement-recommender.test.js`             | Adversarial or compatibility regression; explicit source/ownership/key fixtures and conservative trust expectations. |
| `docs/security/issue06-final-closure-report.md`                  | Trust policy, failure inventory, closure evidence and staging instructions.                                          |

## Database Changes

Existing migration **0021_evidence_verification_integrity.sql is required** for ISSUE-06 rollout: conservative historical evidence downgrade, preserved claims/notes and database verification/epoch guards. No new artifact table, column, enum or migration was added by this closure pass. Receipt/envelope metadata uses existing JSON/encrypted storage. Artifacts and approval/execution history are quarantined on read, not rewritten.

Fresh private PostgreSQL 17.4 cluster: all **22 migrations** applied. Focused tests verify fresh/repeat migration, two-tenant historical preservation/downgrade, transactional rollback, stale-ingestion resistance and DB promotion guards.

## Tests Added

**103 new tests this closure pass**:

- 70 narrative trust/capability tests, including the 16-case adversarial corpus across assistant, extension, summary and project bullets, plus adapter/export/async-composer checks.
- 31 real-PostgreSQL historical-artifact tests: legacy formats, forged receipts, tenant/candidate/content/source substitution, revocation/deletion/expiry, current reuse and restore, encrypted restart, MCP/extension/web boundaries, rollback, fresh approval, immutable snapshot and consumed state.
- 2 project-improvement tests: model narrative/verification-plan laundering and authoritative no-actionable-gap branch.
  The original React test is unchanged. Existing p17/provider/export tests now assert the server trust contract rather than acceptance of arbitrary model text. Original meaningful content, schema, ownership, escaping, transaction and size assertions are retained.

## Test Results

Final disjoint selections; repeated diagnostic runs are not added twice:

| Selection                                |      PASS |  FAIL | SKIPPED | CANCELLED |
| ---------------------------------------- | --------: | ----: | ------: | --------: |
| ISSUE-06 + privacy/provider + migration  |       158 |     0 |       0 |         0 |
| Evidence/career broad (35 files)         |       576 |     0 |       0 |         0 |
| Expanded application/artifact (19 files) |       230 |     4 |       0 |         0 |
| ISSUE-02/03 + approval/write tools       |       178 |     0 |       0 |         0 |
| ISSUE-04 OAuth/MCP                       |       173 |     0 |       0 |         0 |
| ISSUE-01/05/auth/tenant/database         |       265 |     0 |       0 |         0 |
| New narrative/artifact plus existing p17 |       105 |     0 |       0 |         0 |
| Project-improvement unit/integration     |        23 |     0 |       0 |         0 |
| **Unique total**                         | **1,708** | **4** |   **0** |     **0** |

**ISSUE-06 tests: 230 PASS / 0 FAIL** (127 existing +103 new). Original failures: **54/54 resolved**.
Automated BLOCKED: 0 in the final selections. Manual live/staging checks remain NOT VERIFIED and are not counted as automated skips/passes.

Exact common command:

```powershell
$env:ENV_FILE="$env:TEMP/ai-job-issue01-test.env"
node --import ./tests/setup/approval-signing-env.js --test --test-concurrency=2 --test-timeout=120000 --test-reporter=tap <selection files>
```

Approval/write selection runs concurrency=1 because older test suites share fixed installation IDs; the security tests still explicitly launch 50 simultaneous callers. Final logs: OS-Temp `issue06-closure-accepted-{focused,broad,expanded,oauth,installation_signing,new,proposals}.log` and `issue06-closure-accepted-approval-last.log`.

Diagnostic failures are retained: initial obsolete fixture/wording assertions; one new-test fixture/hook error; invalid legacy approval fixtures; shared fixed installation-ID collisions (9 CANCELLED in an intermediate run); and three migration cleanup failures from a damaged disposable PG cluster. Required empty directories had disappeared; checkpoint failed and the cluster terminated. Cause of directory removal is not established. No application guard was disabled. Old cluster retained; a **fresh** private loopback cluster was initialized, migrations/checkpoint succeeded and all final DB gates reran there. These are environment failures, not baseline product bugs or passing tests.

## Remaining Failures

These **four** expanded-suite failures reproduce against actual pre-ISSUE-06 HEAD `86a56c0` in an OS-Temp archived checkout: **89 tests, 85 PASS /4 FAIL** (`issue06-closure-expanded-pre06.log`).

| Original location                                     | Failure                                                               | Disposition                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| integration/web-application-routes.test.js:427        | Dashboard lacks expected cloud-mesh-kernel repository text            | Independently reproduced baseline; separate dashboard/fixture diagnosis        |
| unit/extension-prepare-handoff-regression.test.js:345 | Expected HTTP 200, receives PREPARE_HANDOFF_FAILED 500                | Independently reproduced baseline; underlying cause not assigned without proof |
| unit/p86-job-application-workflow.test.js:322         | Expected missing-data ValidationError; approval guard rejects earlier | Existing obsolete direct-submit contract; do not weaken ISSUE-02               |
| unit/p86-job-application-workflow.test.js:360         | Direct submission without approval gets APPROVAL_TICKET_REQUIRED      | Existing obsolete contract; approval is mandatory                              |

No unexplained new failures remain. The full repository suite is not claimed green. The separately documented minimum-bullet-count issue remains out of scope; this report does not assume it caused the extension failure.
The former salary locale failure is corrected with explicit en-US formatting. Privacy and 17-question MCP profile checks now use isolated synthetic fixtures, not a personal database row.

## ISSUE-01–05 Regression Results

- ISSUE-01 PASS: foreign installation authority, state and tenant isolation.
- ISSUE-02 PASS: altered client content cannot replace approved authoritative content.
- ISSUE-03 PASS: real PostgreSQL, separate service instances, **50 callers / adapterCalls=1**, row-lock contention and crash/replay states.
- ISSUE-04 PASS: real PostgreSQL, separate pools/instances and independent processes; **50 code callers /1 exchange**, **50 refresh callers /1 rotation /1 successor**.
- ISSUE-05 PASS: missing/invalid independent production secrets prevent startup/signing; domain separation and historical signature rejection.
  All remain locally verified, not live/deployment accepted.

## Migration and Quality Gates

| Gate                                                             | Result                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Modified-code Prettier and forced three security-document checks | PASS                                                                                     |
| JavaScript syntax                                                | 85/85 PASS                                                                               |
| ESLint                                                           | PASS: 0 errors, 45 warnings; no warnings treated as passing tests                        |
| Strict introduced-secret comparison against actual HEAD          | PASS: 16 current /16 baseline synthetic matches, 0 introduced matches; no values printed |
| Drizzle journal /22 migration files                              | PASS                                                                                     |
| Live schema drift                                                | PASS: 30 tables, 154 indexes, no missing tables/columns/indexes                          |
| Column references                                                | PASS: 30 tables /905 files, no invalid references                                        |
| Database lifecycle                                               | PASS: 109 integration files /94 DB-using /0 violations                                   |
| Whitespace                                                       | git diff --check PASS                                                                    |

Four prefer-const warnings introduced by earlier ISSUE-06 matching edits were removed mechanically; the full 576-test broad selection reran PASS afterward. Other existing warnings were not broadly cleaned up. Final static comparison includes all93 ISSUE-06 files. No unrelated reformat or secret values printed.
Cleanup verified the exact fresh OS-Temp data_directory, PostgreSQL17.4 and zero other client connections, followed by a successful CHECKPOINT. Only that disposable cluster was stopped; restricted-token stop needed approved elevation. Both disposable clusters and logs were retained; no user database or historical artifacts deleted.

## Manual Staging Verification

1. Drain old writers/readers; apply migration0021. Do not roll back to a verifier that trusts old labels while writes are enabled.
2. Deploy valid independent approval keys and consistent application key/encryption key across replicas. Rotation intentionally invalidates outstanding receipts/approvals; regenerate/review/reapprove, never re-sign old snapshots.
3. Test live GitHub pinned-source ingestion, revoked/suspended installation/webhook state and resource epoch invalidation.
4. Test malicious/malformed provider narratives through browser, extension and MCP text/structured outputs; only server wording must appear.
5. Attempt historical PDF/TeX/letter/portfolio/bundle/document-ID/current-version retrieval across tenants; verify quarantine and useful regeneration guidance.
6. Regenerate explicitly, review a new immutable version, approve anew and execute once across replicas; consumed approvals stay spent.
7. Verify PDF/TeX compiler/R2 configuration, cache behavior, 24-hour expiry, key rotation and operators' preservation of historical audit artifacts.
   Real GitHub, AI provider, browser/MCP clients and deployment acceptance were not exercised here.

## Remaining Risks

- Deterministic fallback reduces free-form personalization; no arbitrary semantic model verifier or claim catalogue is promised.
- Package policy receipts use the existing application key with explicit domain separation, not a new independently provisioned key. Compromise of that secret or trusted server/DB administrative access is outside this mitigation.
- Freshness checks use local authoritative resource state/epochs and bounded time, not a live GitHub request per download. External revocation propagation must be validated in staging.
- Conservative source binding can reduce availability; no automatic regeneration/substitution for approved content.
- Existing external adapters without provider idempotency still need their documented manual reconciliation.
- Four proven unrelated baseline test failures remain; no overall release-readiness claim or percentages.

## Completion Decision

**FIX IMPLEMENTED BUT LIVE VERIFICATION REQUIRED**

ISSUE-06 STATUS: FIX IMPLEMENTED BUT LIVE VERIFICATION REQUIRED
MODEL-PROSE FALSE VERIFICATION: BLOCKED
MODEL OUTPUT AUTHORITY: SERVER-ENFORCED
OUTPUT CHANNEL COVERAGE: COMPLETE
HISTORICAL ARTIFACT QUARANTINE: PASS
CURRENT PACKAGE REUSE GUARD: PASS
APPROVED SNAPSHOT IMMUTABILITY: PASS
CONSUMED APPROVAL PROTECTION: PASS
ORIGINAL 54 FAILURES RESOLVED: 54
TOTAL TESTS PASSING: 1708
TOTAL TESTS FAILING: 4
NEW TESTS ADDED: 103
ISSUE-01 REGRESSION: PASS
ISSUE-02 REGRESSION: PASS
ISSUE-03 REGRESSION: PASS
ISSUE-04 REGRESSION: PASS
ISSUE-05 REGRESSION: PASS
MIGRATION REQUIRED: YES
FORMATTING: PASS
LIVE VERIFICATION REQUIRED: YES
NEXT RECOMMENDED ISSUE: ISSUE-06 staging acceptance; ISSUE-07 only under separate authorization.

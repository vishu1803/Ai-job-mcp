# ISSUE-06: Evidence verification integrity

Date: 2026-10-08. Status: **LOCALLY COMPLETE / FIX IMPLEMENTED BUT LIVE VERIFICATION REQUIRED**.

## Final closure — current local result (2026-10-08)

The model-prose and historical-artifact blockers are locally closed. The [final closure report](issue06-final-closure-report.md) is the current result: 103 new tests PASS, 230 total ISSUE-06 tests PASS; 1,708/1,712 selected PASS and four individually reproduced unrelated pre-ISSUE-06 failures. All original54 failures resolved. ISSUE-01–05 selected gates PASS. Live/staging acceptance is outstanding; no project percentages changed.

Arbitrary provider prose, citation IDs and model VERIFIED fields confer no authority. Public qualification text is server-authored; linguistic adapters retain exact server wording. This intentionally limits free-form personalization rather than pretending a heuristic can verify arbitrary prose. Fresh exports require an unchanged, module-private generation capability. Project-improvement proposed code is not evidence of completed candidate work; its public prose/plans are server-authored.

Current artifact receipts cryptographically bind canonical content, policy, scope, source identity/ownership/state/epoch and a 24-hour freshness window. Authenticated encrypted envelopes bind byte content/purpose/package; whole-kit signatures protect cache metadata. Legacy or changed content is quarantined at download, listing, preview, MCP/extension, CURRENT reuse/version restore, approval and pre-execution boundaries. Uploaded owned source originals remain user claims, not generated verified outputs. No approved snapshot is rewritten; regeneration requires a new version and human approval; spent executions stay spent.

The receipt uses the validated application secret with a separate signing domain, no fallback. Key rotation invalidates receipts and outstanding approvals intentionally. Drain old replicas, apply0021, preserve audit history and require regeneration/reapproval. No new schema/migration was added in the closure. Local revocation state/freshness and conservative all-candidate-source binding are explicit operational limitations; see staging steps and remaining risks in the report.

## Earlier completion pass — superseded local result (2026-10-08)

**Decision: FIX INCOMPLETE.** This section supersedes the earlier 103-test/54-failure/13-formatting-failure state below, which is retained as historical evidence. No project percentage, prior P0 invariant, commit or push was changed.

### Failure inventory and compatibility

Reproduced the exact broader selection before completion edits: **425 tests, 371 PASS / 54 FAIL / 0 SKIPPED / 0 CANCELLED**. Every failure has its original location, exact exception/assertion, implementation, classification, expectation assessment and correction in [the full 54-item inventory](issue06-completion-failure-inventory.md).

- 11 fixture/causal failures: owned active connections, stable repository IDs, pinned commit/tree/blob responses, correctly scoped candidate resources and a batch fixture that actually reaches the intended rollback boundary.
- 37 obsolete security-policy expectations: manifest/citation/name/count or unsupported parser output cannot establish VERIFIED competence. Useful claims/observations, taxonomy direction, confidence math, bounded input, profile lifecycle and rollback assertions remain.
- 4 actual compatibility regressions: taxonomy explanations, claim labels and framework support signals restored without restoring verification shortcuts.
- 2 pre-ISSUE-06 defects independently reproduced against archived actual HEAD `86a56c0`: manual-claim summary expectation (corrected to the existing UNVERIFIED_CLAIM domain contract), and missing hardcoded personal candidate (retained FAIL).

**Original 54: 53 now PASS; 1 proven baseline FAIL.** Expanded gates exposed two further baseline failures: extension salary locale `160,000` versus `1,60,000`, and privacy test requiring the same absent personal candidate. Both reproduced against actual pre-ISSUE-06 code, not merely classified by inspection. Baseline logs: `%TEMP%/issue06-prechange-baseline.log`, `issue06-prechange-locale-baseline.log`, `issue06-prechange-privacy-baseline.log`. Temporary archived checkout uses installed dependencies and disposable DB; it does not mutate the worktree.

### Provenance-origin boundary

A well-shaped proof is no longer sufficient. A module-private WeakMap registers actual scoped `evidence_items` read objects at explicitly audited database-read boundaries. Canonical source identity includes evidence ID, tenant, candidate, resource, provider/type, commit/path/line, raw import and verification record. Server-owned projections retain authority only while that identity is unchanged. JSON replay, schema parsing, client/model/profile metadata and source substitution cannot create that authority. This request-local capability is not a mutex or concurrency authority: PostgreSQL/ingestion still own durable verification and epoch concurrency.

| Entry / writer                            | Untrusted input                                          | Authority / enforced limit                                                                                                                          |
| ----------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub ingestion                          | Requested candidate/repository; external response bytes  | Authenticated candidate/resource/active connection, pinned commit/tree/blob hash, Acorn AST, transaction epoch recheck; sole evidence insert writer |
| Web/API profile updates and resume claims | Profile custom metadata, supplied labels/claims          | Normalize labels and booleans; retain self-reports; custom metadata is never registered as a trusted evidence row                                   |
| MCP write/read tools and resources        | Candidate/evidence IDs, filters, claimed metadata        | Scoped DB lookups and output policy; relinking cannot verify competence or substitute source identity                                               |
| Browser extension/assistant               | Context, skill names, descriptions                       | Shared matching/profile policy; associations remain PARTIAL/INFERRED/CLAIMED, not satisfied verified proficiency                                    |
| LLM outputs / internal generator calls    | Model prose, fact IDs, supplied fact metadata            | Structured labels cannot self-verify; **free-form assistant prose remains an open failing acceptance boundary below**                               |
| EvidenceLinkingService                    | Evidence ID, skill/project linkage, requested confidence | Tenant/candidate/resource scope, immutable established skill binding, DB-origin read; confidence never establishes verification                     |
| Candidate repository ingestion            | Retrieved evidence/project association                   | Only projectId association update; immutable source fields remain guarded                                                                           |
| Background/reprocessing                   | Existing metadata, competing ingestions                  | Fresh ingestion epoch, resource/connection locks and DB guards; stale ingestion cannot restore invalid proof                                        |

Database registration call sites: CandidateProfileService scoped evidence queries, EvidenceLinkingService scoped get/list queries, and the MCP source-evidence resource query. No public create-proof endpoint or second evidence insert writer was found. Test registrations explicitly model the database dependency boundary. A compromised privileged database/application process is outside this capability's threat model.

### Downstream results

- Profile aggregation/create/update: userCustom proof cannot self-verify; legacy verified skill arrays become reported arrays; default WORKING_KNOWLEDGE is no longer presented as assessed proficiency. Source facts remain narrowly scoped and UNATTRIBUTED.
- Matching/ranking: repository associations remain PARTIAL/low trust; self-report remains CLAIMED/UNVERIFIED_CLAIM. Count, confidence, synonym and taxonomy utility remains.
- Portfolio: contribution confidence remains UNVERIFIED; access/ownership/member/fork labels do not prove technical work.
- Resume/cover-letter generation: supplied assertions are normalized; direct fallback summary no longer invents role-specific accomplishments, production experience or daily practice from names. Provided career history remains CLAIMED. Cover-letter counters/audit are computed after normalization, so verifiedParagraphs cannot contradict output labels.
- Application documents: generated skill audit separates observed versus claimed skills; deprecated matchedVerifiedSkills stays empty. Approved immutable ISSUE-02 snapshots were not rewritten.
- MCP tools/resources: source evidence is explicit, profile/experience aliases are reported rather than verified, and no tool promotes skill proficiency by count/name alone.
- Browser assistant: name-only matches remain appropriately labeled PARTIAL; canonical profile/readiness citations are not independently verified qualifications. Model prompt no longer calls supplied skill names Verified Skills.
- Career artifact export: normalizes historical/client-supplied labels and booleans; citations say Source observation, not Verified. All four formats carry explicit candidate-provided/inferred qualification. **This does not alter previously stored PDF/TeX bytes or immutable approved packages.**

### Historical migration

Real disposable PostgreSQL 17.4: fresh 22 migrations, existing evidence/claims upgrade, two distinct tenant/candidate/resource lineages, preserved excerpts/notes/previous metadata, repeated migration runner, and rollback of the migration transaction all PASS. Pipeline tests prove fresh revalidation, stale-epoch rejection, direct promotion guards, connection invalidation and persistence rollback. Migration 0021 reuses JSON columns; no new table/column/enum. Rollback removes an uncommitted migration, not a supported operational downgrade to insecure VERIFIED behavior.

### Final test record

All commands use `ENV_FILE=%TEMP%/ai-job-issue01-test.env` and explicit `--import ./tests/setup/approval-signing-env.js`, `--test --test-reporter=tap --test-concurrency=2 --test-timeout=90000`. Only the private loopback PostgreSQL on port 55431 is used.

| Disjoint final selection                                        |    Tests |     PASS |  FAIL | SKIPPED | CANCELLED |
| --------------------------------------------------------------- | -------: | -------: | ----: | ------: | --------: |
| ISSUE-06 unit/pipeline/migration + privacy/provider regressions |      158 |      156 |     2 |       0 |         0 |
| Broader 35-file evidence/career/MCP/browser/export selection    |      576 |      574 |     2 |       0 |         0 |
| ISSUE-02/03 approval/snapshot/MCP-write regressions             |      178 |      178 |     0 |       0 |         0 |
| ISSUE-04 OAuth/MCP/token regressions                            |      173 |      173 |     0 |       0 |         0 |
| ISSUE-01/05 GitHub/tenant/auth/signing/DB regressions           |      265 |      265 |     0 |       0 |         0 |
| **Unique total**                                                | **1350** | **1346** | **4** |   **0** |     **0** |

ISSUE-06 itself: **127 tests, 126 PASS / 1 FAIL**. The original 103 remain passing. This pass adds **24 tests: 23 PASS / 1 FAIL**, intentionally retaining the newly reproduced model-prose acceptance failure rather than hiding it. The other three final failures are individually reproduced baseline defects, not cancelled/skipped infrastructure tests.

Logs: `%TEMP%/issue06-completion-acceptance-final.log`, `issue06-completion-final4-broad.log`, `issue06-completion-final-p0-0203.log`, `issue06-completion-final-p0-04.log`, `issue06-completion-final-p0-0105.log`. The earlier failed intermediate runs are retained, not represented as passing final results. The 35-file manifest is the original 24 plus structured-resume/ranking, MCP read/resource conformance, browser/P90 and artifact-export suites. Additional privacy/provider files are `p55-ai-context-privacy.test.js` and `p89-ai-provider-architecture.test.js`.

ISSUE-01–05 each PASS. Real PostgreSQL ISSUE-03: 50 concurrent callers, adapterCalls=1. ISSUE-04: 50 separate-pool code callers yield one exchange; 50 refresh callers yield one rotation/successor. Independent process tests also PASS. External GitHub/AI providers and deployment acceptance remain NOT VERIFIED — EXTERNAL DEPENDENCY, not automatic-test passes or skips.

### Quality gates

All original 13 formatting failures fixed, without unrelated repository-wide formatting. Current ISSUE-06 manifest: **67 files**; complete per-file reasons below. Modified JavaScript syntax, formatting, ESLint, whitespace, migration journal, live schema drift, Drizzle column and database lifecycle checks are recorded in the ledger after final checks. Strict scan initially found 14 existing synthetic fixture patterns across four previously tracked test files; introduced-line strict findings were zero. No token/key values or environment dumps were printed. Final scan after documentation is required before handoff.

### Open local acceptance blockers — do not mark complete

Final quality evidence: 60/60 modified JavaScript syntax checks PASS; ESLint 0 errors / 47 warnings. Configured modified-file Prettier PASS and forced checks on both ISSUE-06 Markdown documents PASS (repository defaults ignore Markdown, SQL and lockfiles). All original 13 code-formatting failures are resolved. No mass rewrite of the existing ledger/npm lockfile or unrelated formatting. SQL verification is the actual fresh/upgrade/rollback PostgreSQL migration execution. Whitespace, migration journal, live DB drift, column-reference and lifecycle gates PASS. Final strict scan across 67 files: 14 unchanged synthetic fixture patterns, zero introduced matches; no secret values printed. Exact disposable data_directory and PostgreSQL 17.4 verified with zero other client connections, then only that cluster stopped successfully (restricted stop denied; approved elevated stop succeeded). OS-Temp data/logs retained, no user database stopped/deleted, no commit/push.

1. **Confirmed model-prose gap:** a mock provider returns “Your React proficiency is independently verified.” for an INFERRED React association. AiCareerAssistantService returns the sentence verbatim while citation.verified=false. Source: `src/services/ai-career-assistant.service.js`, `handleUserMessage` / `_parseStructuredResponse`. Reproduction: `%TEMP%/issue06-model-prose-acceptance.log`; failing test `assistant must not return model self-attestation as verified candidate proficiency`. Structured-label sanitization and prompt instructions are not sufficient narrative verification. The test must not be weakened to accept an unverified badge beside a false verification assertion. A server-enforced grounded narrative/fallback policy is still required.
2. **Historical artifact bypass needs implementation/proof:** `src/routes/web.routes.js` artifact view/download routes stream stored PDF/TeX/bundle content, and `JobApplicationWorkflowService.prepareJobApplication` can reuse a CURRENT package. These paths do not pass stored bytes through CareerArtifactExportService. A safe quarantine/regeneration/reapproval policy for pre-policy artifacts must be implemented and exercised; do not edit approved snapshots in place or weaken ISSUE-02/03. This is source-traced missing enforcement, not a claimed live exploit reproduction.
3. Real GitHub/AI/MCP/browser staging acceptance and migration locking/duration on a sanitized staging copy remain outstanding.
4. Separate generator minimum-bullet-count defect remains documented and out of scope unless it becomes necessary for trust acceptance.

Next recommended work remains **ISSUE-06**, specifically the server-enforced model-narrative boundary and historical-artifact quarantine/regeneration/reapproval. Do not advance to ISSUE-07 or recalculate project completion.

### ISSUE-06 file manifest and reasons

| File                                                        | Reason                                                                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                              | Explicit Acorn parser dependency / lockfile and focused test contract.                                                                               |
| `package-lock.json`                                         | Explicit Acorn parser dependency / lockfile and focused test contract.                                                                               |
| `drizzle/meta/_journal.json`                                | Register additive evidence-integrity migration; preserve earlier OAuth migration.                                                                    |
| `drizzle/0021_evidence_verification_integrity.sql`          | Historical downgrade/preservation, immutable provenance, epoch invalidation and DB promotion guards.                                                 |
| `src/connectors/github/github-connector.js`                 | Immutable commit/tree/ref content retrieval at the GitHub boundary.                                                                                  |
| `src/domain/candidate/candidate.schemas.js`                 | Compatible conservative defaults and explicit observed/reported trust fields in output schemas.                                                      |
| `src/domain/career/cover-letter.schemas.js`                 | Compatible conservative defaults and explicit observed/reported trust fields in output schemas.                                                      |
| `src/domain/career/resume.schemas.js`                       | Compatible conservative defaults and explicit observed/reported trust fields in output schemas.                                                      |
| `src/domain/career/skill-taxonomy.js`                       | Retain useful signals, confidence and taxonomy without competence verification shortcuts.                                                            |
| `src/domain/mcp/career-artifact-tools.schemas.js`           | Compatible conservative defaults and explicit observed/reported trust fields in output schemas.                                                      |
| `src/extractors/github/code-scanners/import-scanner.js`     | Bounded Acorn AST static ESM extraction; no regex verification of comments or unsupported syntax.                                                    |
| `src/extractors/github/github-evidence-extractor.js`        | Authoritative pinned source/blob verification, scoped access, ingestion epoch, fail-closed persistence and attribution.                              |
| `src/extractors/github/skill-rollup.js`                     | Retain useful signals, confidence and taxonomy without competence verification shortcuts.                                                            |
| `src/mcp/tools/career-artifact-tools.js`                    | Normalize tool/resource outputs; distinguish source observations from verified candidate competence.                                                 |
| `src/routes/extension.routes.js`                            | Preserve canonical trust labels in browser/extension output projections.                                                                             |
| `src/services/ai-career-assistant.service.js`               | Remove skill-name/readiness verification shortcuts and misleading prompt/citation labels; open raw-model-prose gate remains.                         |
| `src/services/ai-resume-content-generator.service.js`       | Guard direct generator outputs; remove name-to-accomplishment fallback templates and misleading model context.                                       |
| `src/services/candidate-artifact-content.service.js`        | Separate observed/claimed skills and remove fabricated proficiency/accomplishment templates.                                                         |
| `src/services/candidate-fact-inventory.service.js`          | Prevent duplicate fact merging and metadata from promoting/corroborating claims.                                                                     |
| `src/services/candidate-profile.service.js`                 | Guard client custom metadata, aggregate trust conservatively, register DB reads and separate self-report/default proficiency.                        |
| `src/services/cover-letter-drafting.service.js`             | Use qualified claims/observations; normalize before integrity audit and metadata counters.                                                           |
| `src/services/evidence-linking.service.js`                  | Scope linkage, prevent skill substitution and CLAIMED/confidence promotion; register scoped DB reads.                                                |
| `src/services/evidence-matching.service.js`                 | Retain low-trust/PARTIAL associations and claimed tenure without verifying repository-based candidate experience.                                    |
| `src/services/evidence/evidence-ref-mapper.js`              | Expose narrow source verification and preserve authority only across identical server projections.                                                   |
| `src/services/evidence/verification-policy.js`              | Central trust semantics, request-local DB-origin capability, canonical source identity and output normalization.                                     |
| `src/services/extension-assistant.service.js`               | Preserve accurately labeled PARTIAL associations rather than verified satisfied requirements.                                                        |
| `src/services/portfolio-recommendation.service.js`          | Do not infer verified personal contribution from access or unverified statistics.                                                                    |
| `src/services/resume-composition-primitives.js`             | Preserve conservative trust through resume snapshots, final composition and receipts.                                                                |
| `src/services/structured-resume.service.js`                 | Preserve conservative trust through resume snapshots, final composition and receipts.                                                                |
| `src/services/zero-hallucination-integrity.service.js`      | Require exact authoritative source facts for VERIFIED assertions; reject copied-ID verification.                                                     |
| `tests/unit/evidence-verification-security.test.js`         | Adversarial parser/origin/claims/attribution/tenant/downstream tests; retain open model-prose acceptance failure.                                    |
| `tests/integration/evidence-verification-security.test.js`  | Adversarial parser/origin/claims/attribution/tenant/downstream tests; retain open model-prose acceptance failure.                                    |
| `tests/integration/evidence-verification-migration.test.js` | Real PostgreSQL fresh/upgrade/two-tenant preservation/repeat/rollback verification.                                                                  |
| `docs/security/evidence-verification-integrity.md`          | Trust policy, origin boundary, parser limitations, migration/rollout, tests and remaining blockers.                                                  |
| `project.md`                                                | Mandatory execution ledger; record implemented, passing, failing and open acceptance state without percentage changes.                               |
| `tests/fixtures/pinned-github-connector.js`                 | Pinned GitHub provider-boundary test fixture: repository/commit/tree/content/blob contract.                                                          |
| `src/services/resume-tailoring.service.js`                  | Preserve job-relevant weak claims without inventing candidate authorship or proficiency.                                                             |
| `src/mcp/tools/career-read-tools.js`                        | Normalize tool/resource outputs; distinguish source observations from verified candidate competence.                                                 |
| `src/mcp/resources/career-resources.js`                     | Normalize tool/resource outputs; distinguish source observations from verified candidate competence.                                                 |
| `src/domain/mcp/career-read-tools.schemas.js`               | Compatible conservative defaults and explicit observed/reported trust fields in output schemas.                                                      |
| `src/domain/extension/extension-assistant.schemas.js`       | Preserve accurately labeled PARTIAL associations rather than verified satisfied requirements.                                                        |
| `src/domain/career/portfolio-recommendation.schemas.js`     | Do not infer verified personal contribution from access or unverified statistics.                                                                    |
| `tests/unit/mcp-career-read-tools.test.js`                  | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/integration/mcp-career-read-tools.test.js`           | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/unit/resume-tailoring.service.test.js`               | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/integration/resume-tailoring.service.test.js`        | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/unit/portfolio-recommendation.service.test.js`       | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/unit/mcp-candidate-profile-contract.test.js`         | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/integration/candidate-profile.service.test.js`       | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/integration/candidate-repository-ingestion.test.js`  | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/integration/evidence-linking.test.js`                | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/integration/github-evidence-extractor.test.js`       | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/integration/source-resume-ingestion.test.js`         | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/unit/analyze-job-fit-evidence-trust.test.js`         | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/unit/candidate-artifact-content.test.js`             | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/unit/cover-letter-drafting.service.test.js`          | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/unit/evidence-linking.test.js`                       | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/unit/evidence-matching.service.test.js`              | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/unit/github-evidence-extractor.test.js`              | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/unit/p87-ai-career-assistant.test.js`                | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/unit/skill-taxonomy.test.js`                         | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/unit/p87-extension-ai-assistant.test.js`             | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `src/services/career-artifact-export.service.js`            | Guard historical/client export labels, rename unsupported Verified citations and qualify all export formats.                                         |
| `tests/unit/career-artifact-export.service.test.js`         | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `tests/integration/cover-letter-drafting.service.test.js`   | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |
| `docs/security/issue06-completion-failure-inventory.md`     | Record all 54 original failures, exact evidence, classification and corrective action.                                                               |
| `tests/unit/p89-ai-provider-architecture.test.js`           | Repair specific owned/pinned fixtures or obsolete verification expectations while preserving meaningful lifecycle, isolation and utility assertions. |

## Earlier incomplete implementation record (historical)

This is a local remediation record, not a production-readiness claim. Do not deploy
the partial patch as a completed security release. ISSUE-01 through ISSUE-05 remain
locally verified with their separate live/deployment acceptance outstanding. Overall
project percentages are intentionally unchanged.

## Original reproduction

Before editing, the actual GitHub evidence extractor and evidence-linking service
were exercised against disposable PostgreSQL. Only GitHub responses were mocked.

| Input / operation                                                                  | Original result                                                   | Why incorrect                                                                         |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/app.js` containing a block comment around `import React from 'react';`        | CODE_IMPORT_USAGE, line 2, confidence 1, candidate skill VERIFIED | A comment is not an executable reference and does not establish candidate competence. |
| Set that skill to CLAIMED, then link the same evidence with requested confidence 1 | CLAIMED became VERIFIED without independent verification          | Relinking and confidence were being treated as proof.                                 |

Reproduction log: `%TEMP%/issue06-original-reproductions.log`. Synthetic fixture
rows were removed after the experiment. No real GitHub credentials were used.

Root causes were the line-oriented regular-expression scanner, type/confidence
rollups, caller-influenced confidence updates, and downstream count/name-based
promotion. The old code did not distinguish repository observations from personal
authorship or candidate proficiency.

## Trust model

| State    | Meaning                                                                                                                  | Does not mean                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| CLAIMED  | Candidate-provided assertion without independently sufficient support                                                    | Independently verified experience                                                             |
| OBSERVED | A source contains a signal, such as a manifest entry, README text, language summary or account-associated commit message | Executed code, practical experience or proficiency                                            |
| VERIFIED | The exact canonical repository-static-reference fact passed the checks below                                             | Runtime execution, reachability, correctness, authorship, production use or skill proficiency |
| INVALID  | Revalidation/access changes invalidate an earlier source observation for current verified use                            | User content should be deleted                                                                |
| INFERRED | Existing candidate-skill/output vocabulary for a conclusion from observations                                            | A substitute spelling of VERIFIED                                                             |

OBSERVED and INVALID live in `evidence_items.metadata.verification`, not a new
database enum. Existing candidate-skill states remain compatible. No implemented
extractor independently measures competence, so candidate skill VERIFIED or
CORROBORATED cannot be established by the repository pipeline. Such legacy labels
are downgraded; self-reports remain CLAIMED. Identity verification is a separate
concept and is not a skill-verification decision.

## Current verification rules

`src/services/evidence/verification-policy.js` is the shared application policy.
The database adds constraints at the persistence boundary in migration 0021.
An accepted fact has the canonical text:

> Repository OWNER/REPO contains a static module reference to "MODULE" in PATH:LINE at COMMIT.

Required context and checks:

1. Authenticated tenant/user owns the candidate and its active linked resource
   connection. The repository response matches the configured numeric ID or full name.
2. Resolve an immutable commit SHA; request its tree and each inspected file at
   that SHA. Reject a truncated tree, missing commit, malformed response or source mismatch.
3. Independently compute the Git blob hash from returned bytes; compare it with
   both the tree entry and content response. Do not confuse a blob SHA with a commit SHA.
4. Parse the complete bounded source with Acorn. Only static ESM import/re-export
   declarations in eligible JavaScript source may produce this narrow verified fact.
5. Persist tenant, candidate, resource, current ingestion epoch, repository ID/full
   name/owner/URL, commit, blob, path, exact AST line range, extraction/validation
   method, observation time, fact text and explicit UNATTRIBUTED attribution.
6. Recheck resource epoch and active connection inside the evidence persistence
   transaction. New evidence and skill rollups commit together.
7. The read policy requires an observation no older than 24 hours and no future
   timestamp. Stale observations remain available but are not currently VERIFIED.

The proof metadata is a server-managed record of checks, not a cryptographic
attestation that arbitrary clients can supply. Read helpers validate shape/context;
the extractor and database remain the authoritative write boundary. Confidence
does not satisfy any missing check. An arbitrary narrative cannot become verified
by copying a legitimate evidence ID; integrity-gated VERIFIED prose must match the
precise canonical fact on the authoritative record.

## Supported parsers and limitations

- Acorn parses `.js`, `.mjs` and `.cjs`; only top-level static ESM declarations are
  extracted. Source is never executed.
- Comments, strings, template literals, Markdown fences and documentation examples
  cannot establish static usage. Generated/vendor/build/docs/test/fixture/example
  paths and generated headers are excluded from verification.
- Source must fit 256 KiB and 1,000 lines. Oversized or malformed files yield no
  verified import fact. Parsing is not performed on a truncated executable prefix.
- TypeScript, JSX, Python, Go, Rust, dynamic imports and CommonJS `require` are not
  independently verified by this implementation. CommonJS needs scope-aware
  binding analysis; a shadowed `require` must not be mistaken for a dependency load.
- Existing Node/Python/Go/Rust manifest parsing continues as OBSERVED signals.
  A declared dependency, lockfile entry or framework name is not practical experience.
- This is conservative and reduces legacy extraction coverage. Language-aware
  parsers and compatibility contracts still need follow-up within ISSUE-06.
- Heuristics cannot universally identify every generated or documentation file.
  Even an accepted source declaration proves only the scoped static fact.

## Attribution

Repository ownership, access, organization membership, collaboration, a fork or
shared authorship never establishes that the candidate wrote the analyzed source.
Static-reference facts explicitly remain UNATTRIBUTED.

Commit contribution signals require a verified GitHub identity with a numeric
account ID matching GitHub's normalized `author.id`. Username, email and absence
of an identity are not sufficient. This is **account association**, not a signature
verification, diff review, proof of labor or proficiency check. Commit messages
remain OBSERVED. Tests cover matching verified IDs, unverified IDs and matching
usernames with different IDs. Live identity/commit provenance acceptance is pending.

## State transitions, freshness and concurrency

- CLAIMED remains CLAIMED on relinking, high confidence and model reprocessing.
- OBSERVED becomes VERIFIED only for a freshly retrieved and checked narrow source
  fact. Reprocessing arbitrary persisted metadata does not count as verification.
- Beginning revalidation reserves a durable new resource epoch and invalidates old
  source facts before external I/O. A later GitHub or persistence failure does not
  restore the old verified label.
- Resource linkage/status/identity changes and connection revocation/credential/
  ownership/expiry changes invalidate associated GitHub evidence through triggers.
- Immutable source/context fields and established skill bindings cannot be changed
  by an update helper. INVALID cannot return to VERIFIED in the same epoch.
- Concurrent ingestion runs lock/recheck the resource; an older epoch cannot win
  after a newer operation. Tests force the interleaving with real PostgreSQL.
- A passive outage not yet observed by the application is not instantly detectable.
  Read-time freshness caps verified use at 24 hours; there is no background scheduler
  or new GitHub webhook infrastructure in this patch.

GitHub 403/404/429/unavailable, revoked/suspended installation, deleted repository,
missing file, source-integrity mismatch, parser failure and database failures never
optimistically promote evidence. A failed ingestion may leave prior evidence
INVALID by design. Users must revalidate rather than rely on stale verified claims.

## Downstream propagation

Profile assembly, taxonomy, matching, evidence references, career artifact inputs,
structured resume snapshots, cover-letter/portfolio results, selected MCP outputs
and browser-assistant comparisons have conservative trust guards. GitHub-backed
profiles are not reused from the old TTL cache. Output schemas no longer default
omitted trust to VERIFIED. Direct AI resume summary/project-bullet returns are also
guarded; an LLM response or deterministic narrative synthesizer is not a verifier.

Focused tests exercise real service boundaries, including a real MCP career-profile
handler and final resume recomposition. They are not proof that every legacy output
contract works: the broader profile/resume/MCP suite is still failing. Raw prose,
legacy `verifiedSkillsUsed`-style fields, proficiency defaults, all narrative/fact
composer entry points and all direct output contracts still need a complete final
review. Generic recursive label sanitization alone does not prove factual accuracy.
In particular, the pure policy helper validates proof shape, not its authoritative
origin: it must not be applied to client/model-created proof metadata as though it
were a trusted database record. A complete audit/test of every metadata-to-output
boundary is still required. This is an unclosed acceptance risk, not a claimed
reproduced public API exploit.

## Historical data and migration rollout

Migration `0021_evidence_verification_integrity.sql` uses existing JSON columns,
functions and triggers; it adds no table, enum or column. It preserves excerpts,
fingerprints, user claim notes and old verification metadata for review.

- Existing GitHub evidence is marked OBSERVED / historical revalidation required.
- Existing candidate skill VERIFIED/CORROBORATED labels become INFERRED, or CLAIMED
  when user/resume-claim metadata identifies self-report. Prior status is recorded.
- Historical records are never grandfathered into new verification.
- Fresh 22-migration databases, upgrades from the preceding 21 migrations and a
  repeated migration-runner invocation were exercised with real disposable PostgreSQL.
  This proves tracked-runner repeat safety, not manual rerunning of CREATE TRIGGER SQL.
- There is no down migration. Rollback must not restore unsupported verification:
  drain writers, retain conservative labels/guards and forward-fix. Do not run old
  writers against this new contract or restore an old backup as trusted verification.

Deployment is **not approved while ISSUE-06 is incomplete**. Before a future rollout,
back up the database, drain all ingestion/writer instances, apply reviewed 0021 with
the normal runner, deploy matching code to all replicas, invalidate profile caches
and revalidate authorized repositories. Do not touch application approval snapshots,
consumption tombstones, OAuth token families or ISSUE-01 installation ownership.

## Files changed for ISSUE-06 (35)

- `package.json`: explicit production Acorn dependency.
- `package-lock.json`: lockfile production dependency classification.
- `drizzle/meta/_journal.json`: append migration 0021, retain 0020.
- `drizzle/0021_evidence_verification_integrity.sql`: historical downgrade, invalidation and guarded writes.
- `src/connectors/github/github-connector.js`: retain stable GitHub commit account ID.
- `src/domain/candidate/candidate.schemas.js`: explicit evidence verification output, conservative project default.
- `src/domain/career/cover-letter.schemas.js`: conservative paragraph default.
- `src/domain/career/resume.schemas.js`: conservative bullet default.
- `src/domain/career/skill-taxonomy.js`: observations/counts do not verify proficiency.
- `src/domain/mcp/career-artifact-tools.schemas.js`: conservative MCP paragraph/bullet defaults.
- `src/extractors/github/code-scanners/import-scanner.js`: bounded AST-only static-reference extraction.
- `src/extractors/github/github-evidence-extractor.js`: pinned retrieval, integrity, attribution, epochs and transactional persistence.
- `src/extractors/github/skill-rollup.js`: confidence is not competence verification.
- `src/mcp/tools/career-artifact-tools.js`: guard artifact tool outputs.
- `src/routes/extension.routes.js`: repository associations exposed as observations.
- `src/services/ai-career-assistant.service.js`: skill names cannot self-verify.
- `src/services/ai-resume-content-generator.service.js`: guard direct generated narrative labels.
- `src/services/candidate-artifact-content.service.js`: guarded snapshot and skill partitioning.
- `src/services/candidate-fact-inventory.service.js`: personal claims versus repository observations.
- `src/services/candidate-profile.service.js`: conservative profile aggregation and cache handling.
- `src/services/cover-letter-drafting.service.js`: guarded draft results.
- `src/services/evidence-linking.service.js`: no client confidence promotion, ownership/immutable binding checks.
- `src/services/evidence-matching.service.js`: no observation/taxonomy-to-proficiency promotion.
- `src/services/evidence/evidence-ref-mapper.js`: preserve scoped proof and actual source identity.
- `src/services/evidence/verification-policy.js`: shared explicit verification policy.
- `src/services/extension-assistant.service.js`: no name-based verified-skill fallback.
- `src/services/portfolio-recommendation.service.js`: conservative recommendation labels/narrative.
- `src/services/resume-composition-primitives.js`: evidence reference defaults are not verification.
- `src/services/structured-resume.service.js`: guarded input and final recomposition.
- `src/services/zero-hallucination-integrity.service.js`: exact authoritative fact binding.
- `tests/unit/evidence-verification-security.test.js`: 68 parser/policy/downstream tests.
- `tests/integration/evidence-verification-security.test.js`: 33 real-database pipeline/adversarial tests.
- `tests/integration/evidence-verification-migration.test.js`: 2 fresh/upgrade/repeat migration tests.
- `docs/security/evidence-verification-integrity.md`: policy, limits, results and rollout record.
- `project.md`: mandatory execution ledger; no overall percentage changes.

The checkout also contains earlier uncommitted ISSUE-04/05 changes. Those are not
counted as ISSUE-06 changes. No commit/push was performed.

## Verification results

Final selected runs, counted once (reruns are not added):

| Gate                                                        | Tests | PASS | FAIL | SKIPPED | CANCELLED |
| ----------------------------------------------------------- | ----: | ---: | ---: | ------: | --------: |
| New ISSUE-06 focused tests                                  |   103 |  103 |    0 |       0 |         0 |
| ISSUE-02/03 approval/content/write-tool regressions         |   178 |  178 |    0 |       0 |         0 |
| ISSUE-04 OAuth/MCP authentication regressions               |   173 |  173 |    0 |       0 |         0 |
| ISSUE-01/05 installation/signing/auth/tenant/DB regressions |   265 |  265 |    0 |       0 |         0 |
| Existing extraction/profile/matching/resume/MCP suite       |   425 |  371 |   54 |       0 |         0 |
| Total selected automated tests                              |  1144 | 1090 |   54 |       0 |         0 |

Automated tests blocked by environment: 0 in these selections. Live GitHub,
provider-generated narrative and staging acceptance are NOT VERIFIED; they were
not executed or counted as passing/skipped automated tests. The database was
PostgreSQL 17.4 in a private loopback OS-Temp cluster, not a user/production database.

Focused command (explicit test-key preload preserves ISSUE-05):

```powershell
$env:ENV_FILE="$env:TEMP/ai-job-issue01-test.env"
node --import ./tests/setup/approval-signing-env.js --test --test-reporter=tap --test-concurrency=1 --test-timeout=90000 tests/unit/evidence-verification-security.test.js tests/integration/evidence-verification-security.test.js tests/integration/evidence-verification-migration.test.js
```

The migration test deliberately restricts itself to the configured disposable
loopback cluster on port 55431 before creating/dropping uniquely named child DBs.
Provision a disposable cluster; do not point this test at an existing shared database.

Final logs are in OS Temp: `issue06-focused-final.log`, `issue06-broad-final.log`,
`issue06-previous-02-03-final.log`, `issue06-previous-04-final.log`,
`issue06-previous-01-05-final.log`, `issue06-lint.log`, `issue06-format.log`.

Prior security invariants passed without modifying their implementations:
ISSUE-03 50 simultaneous requests reach the adapter once; ISSUE-04 50 separate-pool
code exchanges and refresh rotations each have one winner/one successor pair;
independent-process credential tests pass. ISSUE-01 authority/tenant/state/cookie,
ISSUE-02 immutable snapshot and ISSUE-05 required keys/domain/historical signature
tests remain green. These are local results, not live external acceptance.

Other gates: 29/29 JavaScript syntax checks PASS; modified-file ESLint has 0 errors
and 43 warnings. A rule/message comparison of tracked modified JavaScript with HEAD
found no introduced warning messages. Prettier check FAIL: 13 modified files still
have formatting differences; no repository-wide reformat was performed. `git diff
--check` PASS. Drizzle journal check PASS; database drift check PASS (30 tables,
154 indexes, no missing tables/columns/indexes); lifecycle audit PASS (108 integration
files, 93 DB-using, zero violations).

Strict secret scan on all 35 ISSUE-06 files: zero matches / zero introduced matches;
no key/token/environment dumps were included. After all tests, the exact OS-Temp
`data_directory` and PostgreSQL 17.4 version were checked and only that disposable
cluster was stopped successfully. Temporary database files and logs were retained;
no user database was stopped or deleted.

## Existing failure inventory (not silently converted to passes)

| File                                               | Failed tests | Main incompatibility / investigation needed                                          |
| -------------------------------------------------- | -----------: | ------------------------------------------------------------------------------------ |
| integration/candidate-profile.service.test.js      |            4 | Legacy verified-claim precedence and archive/restore contract                        |
| integration/candidate-repository-ingestion.test.js |            3 | Active owned connection / pinned-content fixtures and old verified-skill expectation |
| integration/evidence-linking.test.js               |            3 | Manifest promotion and batch skill-substitution contract                             |
| integration/github-evidence-extractor.test.js      |            4 | Legacy extractor fixtures lack new authority/provenance contract                     |
| integration/source-resume-ingestion.test.js        |            1 | Legacy VERIFIED-skill preservation expectation                                       |
| unit/analyze-job-fit-evidence-trust.test.js        |            2 | Old MATCHED/CORROBORATED authority assumptions                                       |
| unit/candidate-artifact-content.test.js            |            3 | Changed skill partitioning and narrative content expectations                        |
| unit/cover-letter-drafting.service.test.js         |            1 | Opening paragraph expects repository-backed verified competence                      |
| unit/evidence-linking.test.js                      |            1 | Expanded reference metadata versus old lightweight contract                          |
| unit/evidence-matching.service.test.js             |            7 | Manifest/taxonomy verification expectations and known manual-claim summary failure   |
| unit/github-evidence-extractor.test.js             |            8 | Removed regex language coverage, bounds and verified-rollup expectations             |
| unit/mcp-candidate-profile-contract.test.js        |            1 | Hardcoded real candidate fixture absent in disposable DB                             |
| unit/p87-ai-career-assistant.test.js               |            1 | Legacy skill-name verification fallback expectation                                  |
| unit/skill-taxonomy.test.js                        |           15 | Citation-count/manifest/language promotion and level contracts                       |

Before editing, a selected 84-test baseline had 83 PASS / 1 FAIL. The confirmed
pre-existing failure is `tests/unit/evidence-matching.service.test.js:198` (manual
claim PARTIAL summary expected 1, actual 0). A full 425-test pre-edit baseline was
not established: the other 53 failures cannot all be called pre-existing. Some
are intentionally obsolete trust expectations; others are unresolved compatibility
or fixture failures. Existing test expectations were not weakened to produce green.

A new direct-generator regression also exposed the existing minimum-three-bullet
contract returning only two after deduplication. The trust test checks nonempty
conservative output; the separate minimum-bullet defect is documented, not fixed.

## Remaining acceptance / next work

1. Finish ISSUE-06: reconcile legacy contracts and fixtures with explicit source
   observation versus candidate claim semantics; investigate actual archive, batch,
   language-level and artifact behavior failures rather than blindly updating tests.
2. Complete all writer/output-path review, including raw prose, proficiency defaults,
   narrative composers, legacy verified-named fields and cached/historical artifacts.
   Prove weak evidence cannot be rendered as independently verified experience.
3. Extend supported-language parsing only with sound language-aware behavior. Keep
   unsupported cases conservative; do not restore regex verification to satisfy tests.
4. Exercise real GitHub repository ID/tree/content/commit attribution, revoked and
   suspended installations, 403/404/rate limits and deleted/changed source in staging.
5. Verify real MCP/profile/matching/resume/cover-letter output end to end, including
   AI providers, supported source-backed facts and self-reported experience.
6. Review historical data effects and migration locking/duration on a staging copy;
   coordinate all writer instances and invalidate output caches before revalidation.

Until these acceptance items are established, the completion decision remains
**FIX INCOMPLETE**, not merely "live verification pending". Next recommended issue:
**ISSUE-06 continuation**, not ISSUE-07 or unrelated remediation.

# Large Repository Synchronization Remediation Report

Date: 2026-10-10. Decision: **FIX VERIFIED LOCALLY**. Production: **NO-GO**.
Live source traversal and selection were checked read-only; development ingestion was not run.

### Root Cause

`GitHubAppConnector.getRepositoryTree` imposed an application-defined cap after filtering entries. On the 1,000th retained entry it stopped reading and returned `truncated: true`, even for a complete upstream response. The extractor correctly rejected that result as `Incomplete repository tree`. Two controlled fixtures, representing 1,231 and 4,179 entries, reproduced this exact failure before production edits (0 PASS / 2 FAIL).

GitHub's recursive Trees API instead documents limits of 100,000 entries / 7 MB and directs clients to fetch nonrecursive subtrees if its response is truncated. A successful HTTP response alone does not establish completeness. [GitHub Trees API](https://docs.github.com/en/rest/git/trees)

### Existing Tree Cap

Removed `MAX_TREE_ENTRIES = 1000` and the silent ten-level depth filter. Exactly 1,000 entries previously also produced a false truncation result. Unsafe/malformed entries and excessive depth now fail explicitly instead of silently disappearing.

### Traversal Implementation

The production extractor reserves its durable epoch, uses an isolated connector with a shared per-repository budget, pins the branch commit, resolves that commit's root tree through `/git/commits/{sha}`, and traverses immutable tree identities. A complete recursive response is validated against its root and every directory's Git tree SHA-1. Git sorting, directory mode encoding, UTF-8 names and raw child SHA bytes are used when reconstructing tree objects. Selected file bodies retain the existing Git blob integrity checks against the pinned commit/tree.

Traversal is iterative. Source entries are sorted deterministically. Binary files, symlinks, submodules and generated/vendor directories are explicit exclusions, returned in `excludedPaths` under `SOURCE_TREE_WITH_EXPLICIT_EXCLUSIONS`. Default excluded directory names: `.git`, `node_modules`, `vendor`, `dist`, `build`, `coverage`, `.next`, `.venv`, `venv`, `__pycache__`, `target`.

### Truncation Handling

Discard a truncated recursive listing completely. Fetch the root's nonrecursive tree, verify its full Git hash, then queue eligible directories by immutable child SHA. Each direct response must be nontruncated, correctly bound and hash-complete. Batches and HTTP requests are bounded. Missing subtrees, altered SHAs, missing children, duplicates, malformed modes/paths and direct-tree truncation fail closed. Incomplete results never enter evidence persistence.

### Resource Limits

All settings are validated positive integers with hard ceilings; invalid configuration fails explicitly. These budgets apply per repository attempt, including retries and selection pagination. Token acquisition retains its existing separate authentication timeout/retry policy.

| Environment setting | Default | Hard ceiling |
| --- | ---: | ---: |
| `GITHUB_SYNC_MAX_FILES` | 50,000 | 100,000 |
| `GITHUB_SYNC_MAX_DIRECTORIES` | 10,000 | 50,000 |
| `GITHUB_SYNC_MAX_DEPTH` | 64 | 128 |
| `GITHUB_SYNC_MAX_FILE_BYTES` | 1,048,576 | 1,048,576 |
| `GITHUB_SYNC_MAX_DOWNLOADED_BYTES` | 33,554,432 | 134,217,728 |
| `GITHUB_SYNC_MAX_REQUESTS` | 300 | 2,000 |
| `GITHUB_SYNC_MAX_DURATION_MS` | 180,000 | 600,000 |
| `GITHUB_SYNC_CONCURRENCY` | 2 | 8 |

Files/directories are counted within the declared discovery scope. The file byte limit applies to selected content, checked against metadata before download and actual decoded bytes afterward. The download budget counts streamed HTTP response bytes, including JSON/base64 overhead. Deadline and caller abort signals bound HTTP work; retries honor primary and secondary rate limits. Limits raise `GITHUB_SYNC_INCOMPLETE` with an explicit reason; the service returns `status: INCOMPLETE` and warnings.

### Evidence Integrity

No evidence or project writes occur until discovery, selected blob retrieval, parsing and authoritative checks succeed. Public metadata is insufficient to prove installation selection: the extractor additionally checks the fresh installation repository listing before persistence. Connection/account/installation, resource ID, candidate owner, active lifecycle and epoch bindings are rechecked under transactional locks.

Existing ISSUE-06 freshness behavior is preserved: reserving an epoch invalidates older proofs even when the new attempt fails. Historical rows remain; stale evidence is not represented as current. Attempts record `IN_PROGRESS`, `COMPLETE` or `INCOMPLETE` in existing resource JSON metadata. A killed worker leaves a pending attempt with no completion timestamp; a new sync safely supersedes it. Failure annotation is guarded by its own attempt epoch, so a disconnect can be recorded without replacing the disconnect's invalidation epoch or overwriting a newer scan. A database outage may leave `IN_PROGRESS`; it cannot claim completion.

The existing analysis policy still selects at most ten manifests and fifteen scannable source files. This is bounded analysis, not exhaustive code review. Selected paths/counts and limits are recorded in `analysisScope`. VERIFIED facts remain narrowly scoped static module references with validated blob/line provenance, never authorship, employment or proficiency claims. Manifest, language, README and other signals remain conservative observations. Missing selected content and mismatched blobs reject the attempt, including when other files were already retrieved.

### Repository Identity Preservation

Stable numeric GitHub IDs remain authoritative. Existing project/resource links are reused; no replacement/import lifecycle was introduced. Disposable PostgreSQL fixtures retain all ten resource IDs, eleven authored project rows and links, prior skills and evidence. Repeated and concurrent synchronization creates no duplicate source facts or projects. Historical exact duplicates in development data were not removed.

Read-only live checks at **2026-10-10T17:06:43.266Z** reverified tenant/user/connection, configured App/account ownership, non-suspension, candidate/resource mappings and current installation selection:

| Repository | GitHub ID | Existing resource ID | Raw entries | Scoped entries | Complete |
| --- | --- | --- | ---: | ---: | --- |
| Ai-job-mcp | 1338724502 | 658e5861-246e-4709-9156-3196ad7bc0ab | 1,231 | 1,225 | YES |
| Ai-job-search-board | 957786589 | 054867e0-9b4b-441d-a760-a13dacf46358 | 4,179 | 47 | YES |

Both upstream recursive responses were nontruncated. The board's large generated `ai-job-board-backend/node_modules` subtree explains most exclusions; binary images are also excluded. Each repaired traversal and final selection check used three connector requests. Commit/tree SHAs, exclusions, byte counts and database fingerprints are recorded in [read-only evidence](large-repository-sync-readonly-evidence.json). No live truncated response was encountered; fallback proof comes from deterministic fixtures.

### Files Changed

- `src/connectors/github/github-tree-traversal.js`: complete immutable tree traversal and Git tree validation.
- `src/connectors/github/github-sync-budget.js`: bounded limits, streaming byte accounting, deadlines and concurrency.
- `src/connectors/github/github-connector.js`: remove local cap; budget-scoped connector, fresh selection check and secondary rate-limit handling.
- `src/extractors/github/github-evidence-extractor.js`: shared attempt budget/status, selected file validation, pinned README, ownership/selection checks and explicit analysis scope.
- `src/services/candidate-repository-ingestion.service.js`: abort propagation and explicit incomplete summary.
- `.env.example`: operational settings.
- Two new test suites and two Git object/interruption fixture helpers listed below.
- `tests/unit/github-deep-inspection.test.js`: replace obsolete cap assertions and invalid fake Git identities with meaningful immutable-tree fixtures.
- `tests/integration/historical-artifact-quarantine.test.js` and `tests/integration/evidence-verification-migration.test.js`: allow only the exact new disposable cluster under loopback/database/directory guards; preserve existing allowed environments.
- This report, read-only evidence JSON and `project.md`.

The workspace already contained earlier product/security changes. They were retained. No SQL migration or package/dependency change is required by this repair: attempt metadata is additive JSON and legacy records remain readable.

### Tests Added

**54 new tests:** 36 in `tests/unit/github-large-tree.test.js`, 18 in `tests/integration/github-large-tree-synchronization.test.js`. Helpers: `tests/fixtures/github-large-tree.js` (independent Git object construction) and `tests/fixtures/github-interrupted-ingestion.js` (real killed extractor worker).

| Required case | Evidence |
| --- | --- |
| Fewer/exactly/more than 1,000; several thousand | 999, 1,000, 1,001, 1,231, 4,179, 6,000 entry fixtures |
| Deep directories | Twenty nested directories accepted; configured depth exceeded explicitly rejected |
| Truncated/nontruncated trees | Recursive fast path and complete bounded subtree fallback |
| Missing/changed subtree | 404, SHA mismatch, missing child with false completeness flag rejected |
| Rate limiting; 403/404/5xx | Retry accounting, primary/secondary rate limits and failed requests |
| Malformed responses | Invalid tree structure, duplicate/unsafe paths and identity mismatches |
| Symlinks/submodules/generated/vendor | Explicit exclusions; generated subtrees not requested during fallback |
| Oversized files/byte/request budgets | Metadata and decoded limits; bounded streamed body; shared queue/request cap |
| Interruption | Caller abort, deadline and child-process termination after durable epoch reservation |
| Concurrent/repeated sync | PostgreSQL stable IDs, deduplication and superseded epoch checks |
| Deselection during traversal | Fresh listing rejection even for accessible public metadata; lifecycle disconnect |
| Tenant/installation/owner change | Foreign tenant and changed durable bindings fail before trusted writes |

Integration tests use real PostgreSQL and the production connector/extractor/ingestion service with mocked outbound GitHub HTTP. They prove the integration boundaries, not real employer/platform execution. No applications are generated or submitted in the development account.

### Test Results

Final 17-file gate: **495 PASS / 0 FAIL / 0 CANCELLED / 0 SKIPPED**. New tests passing: **54**. A subsequent focused final-source unit recheck passed **36/36**; it is a subset and is not added to 495.

Reproduction/intermediate results retained for traceability:

- Original defect reproduction: 0 PASS / 2 FAIL, as expected before repair.
- First broad gate: 484 PASS / 3 FAIL / 0 CANCELLED / 0 SKIPPED. All failures were the pre-existing migration test's hard-coded port 55431 versus the new disposable port 55442. The guard now verifies the exact new directory/database before permitting that port.
- Second broad gate: 492 PASS / 1 FAIL / 0 CANCELLED / 0 SKIPPED. A new disconnect test exposed an attempt-status annotation gap after lifecycle epoch rotation. This repair was corrected without altering freshness or ownership checks.
- Final gate resolved all four intermediate failures. The previous session's HTTP recovery failure also passed within this current gate.

Quality gates: modified-file ESLint PASS (zero errors/warnings), twelve JS syntax checks PASS, modified-file Prettier PASS, `git diff --check` PASS, `drizzle-kit check` PASS, fresh/repeated/upgrade/rollback PostgreSQL migration tests PASS, DB lifecycle audit PASS (116 integration files, 101 DB-using, zero violations), repository secret scan PASS (zero exposed secrets). Disposable fixture teardown left zero tenants and zero `issue06_*` child databases; the disposable PostgreSQL server was stopped without deleting its evidence files. Production gates remain separate.

Reproduction command: `node --test tests/unit/github-large-tree.test.js` (first run before editing). Final gate uses Node 22, `--import ./tests/setup/approval-signing-env.js --test --test-concurrency=1 --test-timeout=180000`, with an explicit isolated `ENV_FILE` and `DATABASE_URL=postgres://postgres@127.0.0.1:55442/product_audit_large_tree`. The file list is in [gate manifest](large-repository-sync-gate-files.txt). Full TAP logs were retained under Windows Temp `career-large-tree-20261010` (`regressions.tap`, `final-regressions.tap`, `verified-regressions.tap`, `final-unit.tap`).

### Existing Security Regression

The gate includes ISSUE-01 globally unique installation claiming/reconnect isolation, historical selection reconciliation, ISSUE-02 exact immutable approval content binding, ISSUE-03 atomic at-most-once execution, ISSUE-06 provenance/epochs/quarantine, and PRD-001 persisted timestamp serialization/stable canonical hashes. No approval, signing, snapshot, installation-claim or evidence-trust policy was bypassed or relaxed.

### Development Data Preservation

The development database was accessed in `BEGIN READ ONLY` transactions only. Before/after whole-row aggregate fingerprints matched for resources, projects, project links, candidate skills, evidence, applications and packages. Snapshot counts: resources **10**, projects **11**, links **11**, candidate skills **123**, evidence **514**, applications **14**, packages **602**. These are observed counts, not permanent expected totals after an authorized future sync. No other repositories were imported or activated. No historical package or approval was rewritten.

### Remaining Risks

Live evidence persistence for the two affected resources remains unverified because development writes are expressly out of scope. Live GitHub truncation, quota exhaustion, API outages and selection races were tested using fixtures; the live sources returned complete trees. Large installations may reach configured budgets and require an explicit operational adjustment within hard ceilings. Analysis remains sampled and exclusions are deliberate and visible. Non-UTF-8 content/names or unsupported parsing fail conservatively rather than producing unverifiable facts. Production is NO-GO pending separate release gates.

### Manual Activation Requirements

No resource activation is needed: the existing resources are already ACTIVE. A separately authorized targeted sync of **only Ai-job-mcp and Ai-job-search-board** is the next live operation. Preserve existing IDs and compare counts/identities before and after; do not import the other 31 repositories. Resume/application regeneration and fresh approval remain separate user actions.

### Completion Decision

**FIX VERIFIED LOCALLY.** The six critical local acceptance conditions are satisfied by real PostgreSQL plus production-path connector fixtures. Read-only live source traversal and installation selection also pass; live database ingestion remains separately required.

```text
LARGE TREE SUPPORT: PASS
TRUNCATED TREE HANDLING: PASS
PARTIAL EVIDENCE PROMOTION BLOCKED: YES
RESOURCE IDS PRESERVED: YES
PROJECT IDS PRESERVED: YES
REPEATED SYNC IDEMPOTENT: YES
CONCURRENT SYNC SAFE: YES
TENANT ISOLATION: PASS
NEW TESTS PASSING: 54
TOTAL TESTS PASSING: 495
TOTAL TESTS FAILING: 0
LIVE REPOSITORY SYNC REQUIRED: YES
PRODUCTION DECISION: NO-GO
NEXT RECOMMENDED REPAIR: Resume structure and quality roadmap
```

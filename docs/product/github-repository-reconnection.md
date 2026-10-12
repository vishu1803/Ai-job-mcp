# GitHub repository reconnection without rebuilding the candidate

Updated: 2026-10-11. Phase: P0 product acceptance. Production: **NO-GO**.
Implementation and controlled integration verification complete; development
resource reconciliation was explicitly authorized and the ten activations were
committed as recorded below. The previously blocked two large repositories have
now completed an explicitly authorized, targeted development synchronization
and an idempotency repeat. The latest results and preservation limitations are
recorded in the final section; the earlier dated results remain historical.
No new PRD identifier.

## Cause and affected boundaries

Fresh OAuth updates the owned `resource_connections` row to ACTIVE through
`GitHubInstallationService.linkInstallation` and
`upsertGitHubAppConnection`. It does not select repositories or update their
resource status. The ten historical resource rows were already DISCONNECTED
before this reconnection. The 2026-10-08 execution ledger records quarantine of
six conflicting connections and their fourteen resources; the scoped quarantine
script explicitly includes this historical connection and sets its resources
DISCONNECTED. This documented earlier operation explains the historical state;
its original execution is not independently replayed or audited in this turn.
The current `ConnectionService.disconnectConnection` changes the connection,
while its trigger invalidates resource evidence epochs; it does not change child
resource status.
Reconnecting the parent cannot imply consent to reactivate every historical
repository. Those ten rows require deliberate
repository selection. ISSUE-06 triggers rotate evidence epochs when a connection
changes; historical proof does not become current merely because OAuth succeeds.

Sources previously queried ACTIVE resources only, so the connected account could
appear alongside an empty repository list without explaining the preserved,
disconnected records. Manage Repositories is `/onboarding?step=3&from=sources`;
its save boundary is POST `/onboarding/repositories/select`.

The old selection handler accepted stored resources or request-supplied names as
fallbacks when GitHub listing failed or was empty, matched names as aliases for
identity, and did not consistently retrieve all pages. Those fallbacks cannot
establish present installation access. Project ingestion looked up a slug derived
from the current repository name before consulting historical resource links;
renames could create another project, and concurrent genesis raced on uniqueness.

Deterministic pre-edit PostgreSQL/HTTP regressions reproduced listing-outage
selection succeeding instead of failing closed, rename creating another project,
and concurrent project creation failing on uniqueness. The baseline log contains
five failures: the different-ID/same-name case initially failed on a missing
fixture `displayName`, and teardown incorrectly passed a TestContext to
`closeDatabase`. These two are test defects, not product reproductions. Corrected
fixtures now verify different repository IDs never inherit another repository's
linked project. No security assertion was weakened to obtain a pass.

## Read-only development inspection

Inspection used effective development configuration, required
`APP_URL=https://dev.aicareershub.tech`, rejected production environments, and
used a PostgreSQL REPEATABLE READ READ ONLY transaction ending in ROLLBACK.
Only scoped identity/status fields, aggregate counts and whitelisted package
metadata were read. Credentials, authorization codes and signed state were not
selected or printed.

- Tenant: `24d53f53-780e-4431-b065-32180c354175`.
- User: `9dd8e4fb-456b-4104-9cb1-c839a544b721`.
- Candidate: `10a2b51b-09bf-4090-8040-1f60ebeb89c9`.
- Historical connection: `1743c149-bf4c-4c4e-a1fa-0532dfd5460a`, ACTIVE.
- Installation: `155430459`; numeric account `97516061`.
- Fresh OAuth authority policy: `personal-owner-or-org-owner-v1`.

At `2026-10-10T14:52:25.633Z`, live GitHub App authentication verified the
installation belongs to the configured App and the recorded account and is not
suspended. A short-lived installation token with contents/metadata read access
was used only in memory to enumerate GitHub's
[installation repository endpoint](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation).
GitHub reported `repository_selection=all`, 41 accessible repositories, including
all ten historical immutable IDs. This is live access verification, not a mock.
Access must be checked again immediately before any authorized modification.

## Reviewable before/after mapping

Every name below is under `vishu1803/`. The stored and currently accessible names
match. All rows belong to the exact candidate and historical connection above;
their `external_resource_id` is the numeric GitHub ID, without needing a legacy
name guess. **After was applied at 2026-10-10T15:44:32.849Z after fresh verification.** Other 31 accessible repositories
are not included in this reconciliation.

| Historical resource ID | GitHub repository ID | Repository | Current access/selection | Before | Applied after |
| --- | --- | --- | --- | --- | --- |
| `658e5861-246e-4709-9156-3196ad7bc0ab` | `1338724502` | Ai-job-mcp | Accessible / all | DISCONNECTED | ACTIVE |
| `054867e0-9b4b-441d-a760-a13dacf46358` | `957786589` | Ai-job-search-board | Accessible / all | DISCONNECTED | ACTIVE |
| `84863adb-6e8a-47f3-9414-fa15abf5bb3e` | `1073066950` | Ai-powered-code-review-assistant | Accessible / all | DISCONNECTED | ACTIVE |
| `84096c61-32ca-4a87-8fd1-1ae3efa3676d` | `1096543793` | Audience-query-system | Accessible / all | DISCONNECTED | ACTIVE |
| `0ba206ac-be0d-47bc-8b1a-c47c9b8c2d0b` | `1082315274` | Collaborative-task-manager | Accessible / all | DISCONNECTED | ACTIVE |
| `83e1d1dd-af80-4f8e-bed3-6bc127c5fe59` | `1183348597` | Modern-Portfolio | Accessible / all | DISCONNECTED | ACTIVE |
| `b80ff55f-2d39-43d9-a121-d9ecfbecb247` | `963757661` | Object-detection-web-app | Accessible / all | DISCONNECTED | ACTIVE |
| `39b504f5-2cf2-4656-ab9a-2d897a29523e` | `1060038556` | Product-Data-Explorer | Accessible / all | DISCONNECTED | ACTIVE |
| `2c95f256-9e9e-4dd5-a1dd-29ddf233b593` | `1066529685` | Python-projects | Accessible / all | DISCONNECTED | ACTIVE |
| `c4245f1e-d99a-41f0-b1fd-8cfe8370d455` | `1271291376` | VamTech | Accessible / all | DISCONNECTED | ACTIVE |

Read-only tenant totals: 10 resources, 11 projects, 11 project/resource
associations, 82 candidate skills, 246 evidence items, 52 candidate claims,
602 application packages, 2,143 tailored documents. Duplicate resource groups by
provider/external ID: zero. Duplicate project groups by candidate/slug: zero.
These totals were reverified immediately before activation and remained unchanged
after its commit. All ten resources are ACTIVE with their original IDs. The
activation proof compares IDs/content across eighteen tenant tables and all
connection rows; normal lifecycle evidence-epoch invalidation is intentional.

## Implemented reconciliation and synchronization repair

`src/services/github-repository-selection.service.js` centralizes selection:

1. Lock the exact tenant/user connection and verify candidate ownership.
2. Require a modern ACTIVE, OAuth-verified connection; reuse the existing
   installation verifier for configured App, account, permissions and suspension
   checks. Compare the fresh account ID to the existing owned claim.
3. Enumerate current installation access across all pages, bypassing cached
   listings. Reject outages, incomplete/looping pages, inconsistent counts or
   duplicate identities without modifying selection.
4. Lock tenant GitHub resource rows in stable order. Match immutable numeric IDs,
   with recorded numeric legacy metadata accepted. Reject ambiguous records,
   foreign candidate/connection ownership and legacy name-only identity.
5. Update eligible existing resource UUIDs; retain metadata/cache/history and
   existing links. `existingOnly: true` prohibits insertion for the bounded
   historical repair. Normal explicit selection of a genuinely different GitHub
   ID can create a separate resource, but never reuse the old repository history.
6. Disconnect only omitted ACTIVE resources within the same candidate/connection.
   Do not activate inaccessible IDs. Audit changes atomically. Exact repeated
   selections perform no writes, epoch rotation or duplicate audit insertion.

`src/routes/web.routes.js` uses the service for listing and selection, preserving
existing response/redirect contracts and adding user scope to connection lookup.
`src/views/sources.page.js` explains the number of historical disconnected
repositories and directs users to Manage Repositories.
`src/app.js` forwards the existing installation-service integration test override.
`src/connectors/github/github-connector.js` supports fresh selection listings
without changing ordinary cached reads.

`src/services/candidate-repository-ingestion.service.js` serializes project
genesis by candidate, consults owned `project_resources` associations first and
atomically creates a project/link only when needed. Existing authored project
content and UUIDs survive rename and repeated synchronization. Same-name,
different-ID repositories do not inherit linked projects. Conflict-safe link
insertion retains uniqueness. `src/extractors/github/github-evidence-extractor.js`
uses connection-before-resource lock ordering during persistence, consistent
with disconnect/selection. Stale overlapping scans still fail closed when the
evidence epoch changes; the newest eligible scan may finish without duplication.

No migration, bulk reimport, profile reconstruction, ownership-index change,
token persistence, trust promotion or approval-policy change is required.
Lifecycle triggers intentionally invalidate stale verification metadata; preserving
evidence records does not mean restoring old VERIFIED labels.

## Guarded development execution — authorized activation complete

The earlier installation-ID authorization covered only restoration. The latest
explicit authorization now covers activation of these ten existing resources and
their idempotent synchronization, excluding the other31 and all application
generation/submission. Fresh live preflight at2026-10-10T15:41:04.848Z reverified
current ownership, unique installation claim/indexes, App/account/access and
immutable resource mappings. A nested rollback rehearsal preceded the commit.

After explicit approval of the ten rows above:

1. Require development configuration and the exact connection, tenant, user,
   candidate, installation/account and current globally unique owned claim.
   Recheck the deployed ownership indexes and fresh installation access.
2. In an outer transaction, lock that connection and its resource rows. Verify
   the exact ten UUID/numeric-ID pairs, candidate/tenant/connection bindings and
   expected DISCONNECTED statuses; abort on additional rows or snapshot drift.
   Capture IDs/counts and authoritative content of candidate, projects, links,
   skills, evidence, claims, contributions and historical application snapshots.
3. Invoke the application selection service on that transaction with
   `existingOnly: true` and only the ten approved numeric IDs. It repeats current
   provider and owner checks. Verify the change list contains exactly those
   DISCONNECTED-to-ACTIVE resource UUIDs, no insertion or other disconnection.
4. Compare preserved IDs/counts/content before commit, allowing only resource
   lifecycle fields, the existing evidence-epoch/verification invalidation trigger
   and the selection audit. Roll back on any discrepancy. Do not alter the
   globally unique installation claim, credentials or connection ownership.
5. Default dry-run must roll back; apply only after specific authorization and
   successful checks. Re-run read-only inspection and report actual totals.
   If access changed, abort the approved plan and report inaccessible rows.

The exact existing-only service, nested transaction rollback, ten-row change list
and partial-write rollback on an attempted new resource are exercised against
disposable PostgreSQL. Activation committed through the existing-only service
and atomic audit; post-commit counts and preservation checks passed.
No unnecessary extraction occurs during selection. A later explicit supported
repository sync refreshes eligible current evidence using existing fingerprints
and link IDs; it does not delete or bulk rebuild the candidate. Do not overlap
scans deliberately or change stale-scan protections.

## Application package conditions are distinct

- `RESOURCE_INACTIVE`: receipt source binding includes a disconnected resource.
  All candidate resource bindings are currently checked by ISSUE-06. Recovering
  eligible resources enables new receipts; it cannot make old receipts current.
  If an ineligible source remains required, generation must remain blocked under
  the existing policy, rather than silently dropping the binding.
- Fresh generated hash not found: `regenerateApplicationPackage` calls
  `buildApplicationHandoffKit` before `recordApplicationPackage`. When the new
  receipt is rejected, handoff's exact-version fallback can report a missing hash
  for content that has not been saved yet. The primary eligibility failure must
  be addressed; this does not prove a persisted historical version was deleted.
- Truly missing historical package: read-only lookup found no package ledger rows
  for application `219553ba-0e89-4a4d-babb-eff4fcc4490e` and no current hash/version
  or handoff hash on that application. No saved authoritative snapshot exists to
  serve at the reported hash. Its legacy handoff GET may derive a new draft hash;
  such a hash cannot stand in for an approved historical snapshot.
- Application `c0d14ffe-7101-4dc3-a929-cc49bd1c8cf0` has one CURRENT version 1,
  hash `025e4bc25b364029b8d59682fe6eb325d4807bc92df7c29184fe4874adff7629`,
  without a current evidence receipt policy. It needs new generation, not a
  rewritten historical payload.
- The reported hashes `6355a3bca8e1f8daf4f745a2681de702382ba9486e82a271f1cd6e11676a32bf`,
  `69e63c0f6c0f6b11d1b6348b1104c4311d9d6751a672d82a54eb8f70a17b892a`
  and `66d91ecbd6f5a7164bfa75a97bc24e943e362a5014dd9fcc2f1e80340d8b5779`
  were not found in scoped ledger/document references during inspection.

After recovery and any necessary supported evidence refresh, explicit BOTH
regeneration must create a new persisted package with a current receipt and
matching canonical hash. Preserve historical payloads/hashes and require fresh
review/approval. Do not substitute for old approved content or reopen consumed
approvals. Live affected-account regeneration was not performed this turn.

## Verification and limitations

The final focused gate covers the following ten files, using Node 22, synthetic
signing-key preload, isolated blank-provider ENV_FILE, actual loopback HTTP where
specified, and disposable real PostgreSQL on port 55441, database
`product_audit_prd003`:

```text
tests/integration/github-repository-reconnection.test.js
tests/integration/github-installation-linking.test.js
tests/integration/candidate-repository-ingestion.test.js
tests/integration/application-approval-content-binding.test.js
tests/integration/application-approval-execution.test.js
tests/integration/evidence-verification-security.test.js
tests/integration/historical-artifact-quarantine.test.js
tests/integration/handoff-quarantine-recovery.test.js
tests/unit/github-connector.test.js
tests/unit/terminal-logging.test.js
```

Command: `node --import ./tests/setup/approval-signing-env.js --test
--test-concurrency=1 --test-timeout=180000` with those files. Final result:
**277 PASS, zero failures/cancellations/skips**, also recorded in `project.md`.
Scoped ESLint: zero errors, one existing unused-candidate warning; Prettier and
`git diff --check` pass. Logs remain in OS Temp
`career-prd003-20261010/github-repository-reconciliation-final.log`.

New tests cover all ten historical resource IDs, partial selection leaving nine
disconnected, complete pagination, outages, selection changes, rename and
replacement IDs, foreign user/tenant refusal, changed installation account,
concurrent selections/project genesis, repeat sync, existing skills/evidence IDs,
browser refresh and a fresh application instance. A fresh app instance proves
persisted association reuse; it is not a live OS server-restart acceptance test.

The recovery test now connects ten DISCONNECTED existing resources through
authenticated real HTTP selection, then performs real HTTP regeneration and
PostgreSQL persistence. It checks current receipt binds all ten original IDs,
canonical hash agreement, immutable archived payload and zero approval tickets.
PDF generation/QA uses actual Chromium through the supported compiler fallback;
native TeX and live AI are not claimed. Outbound GitHub identity/list/content
responses in automated tests are controlled fixtures; live GitHub access was
checked separately. No real employer application is submitted.

ISSUE-01 fresh OAuth/identity/ownership and global claim regressions, ISSUE-02
content binding, ISSUE-03 at-most-once execution and ISSUE-06 evidence/quarantine
regressions are retained. A legacy quarantine test initially rejected this safe
fixture directory before its assertions ran; its setup now additionally permits
only the exact current OS-Temp data directory plus loopback/product-audit database
guards. Initial test failures and corrected fixtures are not counted as product
defects or security-policy changes. Earlier overlapping passes are not added to
the final total. Full repository green and production release acceptance are not
claimed.

Actual development resources reactivated: **10**. Still disconnected: **0**.
All original resource IDs remain mapped to the same immutable GitHub repository
IDs, tenant, candidate and historical connection. Other31 repositories were not
imported. Production data was not accessed or changed.

## Authorized live synchronization and additional idempotency defect

Activation rollback rehearsal and committed proof are recorded in OS Temp
`career-prd003-20261010/github-resource-activation-dry-run.json` and
`github-resource-activation-applied.json`. Only the ten supported lifecycle
transitions were permitted; content fingerprints across eighteen tenant tables
and all connection rows matched the baseline except normal lifecycle evidence
epoch/verification invalidation. The existing globally unique installation
ownership claim remains unchanged.

Before extraction, a read-only identity check found34 coarse fingerprint collision
groups and six pre-existing complete-fact duplicate groups. Distinct legitimate
imports/dependencies can share the legacy fingerprint because it omits line
ranges and excerpts. The extractor's single-row fingerprint map could attach a
new proof to the wrong immutable historical location; ISSUE-06 correctly rejects
that update. It also did not add freshly inserted facts to the map for same-batch
deduplication. A disposable PostgreSQL regression reproduced this before editing.

The narrow repair uses complete immutable fact identity (canonical skill ID,
evidence type, provider, recursively sorted full source location and excerpt).
Existing exact duplicate rows are retained; the lowest UUID is consistently
refreshed. Newly inserted facts enter the map immediately. Historical fingerprint
values/algorithm, receipt bindings, epoch checks, static-reference attribution,
pinned-commit/blob validation and approval rules are unchanged. No migration or
historical cleanup was performed.

The first real sync processed eight repositories with zero new projects. All
original82 candidate skill IDs/content and246 evidence IDs/meaningful content
were retained, along with eleven projects and all application history. Current
repository inspection added41 distinct skill rows and268 evidence facts: totals
123 and514, respectively. These are current observations, not fabricated
competence or duplicated profile records. Resource/project/candidate-skill
duplicate identity groups remain zero; the six historical complete-fact duplicate
groups remain unchanged, with no new duplicates. The service's `evidenceCreated`
counter counts processed facts; actual additions above come from database counts.

At the 2026-10-10 reconciliation checkpoint, two repositories remained
ACTIVE/accessible but extraction failed closed:

| Repository | Complete GitHub tree entries | Connector entry cap | Result |
| --- | --- | --- | --- |
| Ai-job-mcp | 1,231 | 1,000 | Incomplete repository tree |
| Ai-job-search-board | 4,179 | 1,000 | Incomplete repository tree |

Read-only GitHub verification at2026-10-10T16:11:38.323Z confirmed both raw GitHub
responses have `truncated=false`; truncation occurs at the existing connector
cap. No cap or incomplete-tree integrity check was bypassed. A bounded,
commit-pinned large-tree retrieval repair is a separate remaining product task.
Both real synchronization passes processed the same eight repositories. The
repeat created/updated zero projects and added zero skill/evidence records;
existing resources, projects, links, skill and evidence IDs remained stable.
These two extraction blockers prevent claiming complete ten-repository
synchronization.

Independent final REPEATABLE READ READ ONLY verification
at2026-10-10T16:14:46.322Z confirms:

| Record type | Before activation | Final after two sync passes |
| --- | --- | --- |
| Candidates / identities | 1 / 1 | 1 / 1 |
| Resources / ACTIVE resources | 10 / 0 | 10 / 10 |
| Projects / project-resource links | 11 / 11 | 11 / 11 |
| Candidate skills | 82 | 123 (all82 originals preserved;41 distinct additions) |
| Evidence records | 246 | 514 (all246 originals preserved;268 current additions) |
| Candidate claims | 52 | 52 |
| Resumes / sections | 1 / 7 | 1 / 7 |
| Job applications | 14 | 14 |
| Application packages | 602 | 602 |
| Tailored documents | 2,143 | 2,143 |
| Analysis snapshots | 90 | 90 |
| Application approval tickets / executions | 0 / 0 | 0 / 0 |

Final evidence: OS Temp `career-prd003-20261010/github-authorized-sync-result.json`
and `github-activation-final-verification.json` with corresponding logs. The
selection and partial-sync audit records describe the actual scope and warnings.
No automatic application generation, approval consumption or employer submission
occurred; production remains NO-GO.

The current ten-file controlled gate reports278PASS/1FAIL/0CANCEL/0SKIP out of279.
All repository ingestion tests and the installation/approval/execution/evidence
security suites pass. One controlled HTTP handoff recovery returns BLOCKED where
READY is expected. Two diagnostic startup rechecks crashed with JavaScript heap
exhaustion (one default host allocation failure, one384MB limited retry). After
host virtual memory recovered, final ingestion plus HTTP recovery recheck passed
**27/27, zero failures/cancellations/skips**, including that formerly failing test
and fresh-unapproved-package acceptance. Its original failure did not reproduce
and its exact cause was not established. The full ten-file gate was not rerun;
overlapping results are not summed or reported as a new all-green279-test run.
Scoped three-file ESLint0errors/0warnings and Prettier pass. Applications were
not generated or submitted in the development account. Existing controlled tests
use disposable PostgreSQL and synthetic provider content; live repository
access/synchronization is evidenced separately.

## Authorized large-repository synchronization and repeat (2026-10-11)

**Status: COMPLETE for the two authorized live development synchronizations and
repeat identity/idempotency checks.** Only the existing Ai-job-mcp and
Ai-job-search-board resource IDs were passed to
`CandidateRepositoryIngestionService.syncCandidateRepositories`. No other
repository was synchronized or imported. No application or resume generation,
approval consumption, submission, production operation, or deployment occurred.
The earlier 1,000-entry blockers are resolved for these live sources using the
published bounded traversal repair. This does not claim exhaustive code analysis
or production readiness.

### Ownership, access and stable identities

Fresh preflights at `2026-10-11T04:16:48.219Z`,
`2026-10-11T04:27:42.797Z` and `2026-10-11T04:29:06.543Z` verified the same
tenant, ACTIVE user/candidate and ACTIVE historical connection listed above.
Live GitHub verified installation `155430459` belongs to the configured App and
personal account `97516061`, with contents/metadata access and no suspension.
The existing OAuth identity/authority metadata agrees. Both ownership indexes
remain valid, ready and unique; this connection remains the sole global
installation claimant. Fresh complete listing returned 41 accessible
repositories, including both approved numeric IDs; the other 39 were excluded.
Database configuration was checked for the public development URL and a
nonproduction environment. Tokens and credentials were not printed.

| Repository | Stable GitHub ID | Preserved resource ID | Preserved linked project IDs |
| --- | --- | --- | --- |
| Ai-job-mcp | 1338724502 | 658e5861-246e-4709-9156-3196ad7bc0ab | 57e17373-ea29-48ae-94fc-0758ce284969; f68e4520-52bd-4355-822f-2bc0a02d8c5f |
| Ai-job-search-board | 957786589 | 054867e0-9b4b-441d-a760-a13dacf46358 | d0c5640b-7f1d-4a94-ac45-319727c139ed |

All eleven original project-resource links remain unchanged, including both
historical MCP project links. All ten resources remain ACTIVE, independently
confirmed after completion. Installation ownership and connection rows are
unchanged.

### Live bounded traversal results

Both passes pinned the same immutable commit and tree for each repository.
Git tree/blob checks, current installation selection, transactional ownership,
candidate/tenant bindings, ingestion epochs and conservative verification
checks remained enabled. No operational limits were raised or integrity checks
bypassed.

| Repository | Pinned commit SHA | Verified root tree SHA | First pass completed (UTC) | Repeat completed (UTC) |
| --- | --- | --- | --- | --- |
| Ai-job-mcp | f6060ec44bab9c265417374c95f848bcfe9788c4 | cc3ba3c4d9f10cb85f6194b48183aa44c39e50c9 | 04:17:27.059 | 04:28:15.760 |
| Ai-job-search-board | 6b2f1df8840c4c015e9cdabd69b84222fa5c0a45 | 4b88bdfccdb9f7bd464e74c204b7d277ae211569 | 04:17:59.040 | 04:28:45.118 |

All four durable resource attempts ended COMPLETE. Both repeat service results
also reported COMPLETE, one repository processed each, zero warnings, zero
projects created and zero projects updated. Each attempt used 25 budgeted
requests. MCP downloaded 843,552 bytes; Board downloaded 1,533,763 bytes. The
scope is explicitly `SOURCE_TREE_WITH_EXPLICIT_EXCLUSIONS`: binary images/icons
were excluded, and Board's `ai-job-board-backend/node_modules` was excluded.
Existing analysis limits remain ten manifests/fifteen source files: MCP analyzed
one manifest and fifteen sources; Board analyzed two manifests and fourteen
sources. Complete discovery within this declared scope does not mean every
source file was analyzed. Truncated upstream fallback remains fixture-tested;
this live operation did not demonstrate GitHub returning a truncated tree.

### Counts, additions and verification changes

| Record type | Before | After first pass | After repeat |
| --- | ---: | ---: | ---: |
| Candidates / candidate identities | 1 / 1 | 1 / 1 | 1 / 1 |
| Resources / ACTIVE resources | 10 / 10 | 10 / 10 | 10 / 10 |
| Projects / project-resource links | 11 / 11 | 11 / 11 | 11 / 11 |
| Candidate skills | 123 | 135 | 135 |
| Evidence records | 514 | 571 | 571 |
| Candidate claims | 52 | 52 | 52 |
| Resumes / sections | 1 / 7 | 1 / 7 | 1 / 7 |
| Job applications | 14 | 14 | 14 |
| Application packages | 602 | 602 | 602 |
| Tailored documents | 2,143 | 2,143 | 2,143 |
| Analysis snapshots | 90 | 90 | 90 |
| Application approval tickets / executions | 0 / 0 | 0 / 0 | 0 / 0 |
| Action approval tickets | 1 | 1 | 1 |

The first pass added **12 distinct candidate skills and 57 evidence records**.
MCP added 25 evidence records (23 OBSERVED, two VERIFIED); Board added 32
(16 OBSERVED, sixteen VERIFIED). New VERIFIED evidence represents checked
repository static references, not verified authorship, proficiency or career
accomplishments. No candidate skill was promoted to VERIFIED. The service's
`evidenceCreated` count is processed evidence, not the insertion count; additions
were measured by preserved/new database IDs.

Seven original evidence rows moved from INVALID/stale to OBSERVED/current:
four MCP and three Board. No original row moved to VERIFIED. Total current
OBSERVED changed 273 -> 319, current VERIFIED 14 -> 32, and stale INVALID
227 -> 220. Three original candidate skills moved MISSING -> INFERRED; with the
twelve additions, total INFERRED changed 82 -> 97. CLAIMED remained 21 and
SELF_DECLARED remained seven; MISSING changed 13 -> 10. The repeat added
**zero evidence and zero skills**, changed **zero verification/provenance
statuses**, and retained the same commits, trees and IDs. Normal observation
timestamps and proof epochs were refreshed; those are lifecycle fields, not
immutable source facts or approved package content.

Resource/project/candidate-skill duplicate identity groups remained zero.
The same six pre-existing exact evidence-fact duplicate groups, each containing
two rows, were retained unchanged. There were zero new duplicate groups and
zero cleanup/deletion operations.

### Preservation checks, guard failure and limits of proof

Read-only REPEATABLE READ checkpoints covered eighteen tenant tables,
connection ownership, other-tenant records and the eight unapproved resources
and their evidence. All original IDs remain, all historical project associations
match, all other resources/evidence and connection rows are unchanged, and
application/package/document/snapshot/approval data match their original row
fingerprints. Original projects, candidate/profile records and skill identities
also match; skill rollups are expected mutable derived values.

The initial operational preservation assertion failed after both first-pass
ingestions had completed. Three existing MCP evidence rows had different
fingerprints including their nonverification metadata:

- `2fdfeeb5-eae9-4847-bb84-a6ca7e65aa92` (drizzle.config.js pattern evidence).
- `3dd071ab-b733-45a2-9be6-11e73e75364f` (README React keyword evidence).
- `54133b1b-8519-4e9d-b15d-9a3d066c77f2` (GitHub workflow evidence).

The repeat was held for inspection. Source review confirms the production
upsert matches complete immutable source facts (skill, type, provider, full
location and excerpt) and updates metadata, confidence and detection time;
it does not replace those source facts. These three rows received current
extraction metadata and OBSERVED proofs. All 511 other original evidence
fingerprints match after excluding normal verification/confidence/time fields,
and all original evidence-project associations match. The original checkpoint
stored digests, not full metadata values, so **the exact old metadata values and
a byte-for-byte independent pre-sync metadata comparison for these three rows
cannot be recovered from that checkpoint**. Do not describe all original
metadata as unchanged. No historical restoration or metadata rewrite was
performed to hide the assertion.

A new checkpoint was taken after this inspection. The authorized repeat passed
the full checkpoint comparison, including all nonverification evidence metadata,
without allowing these three IDs as exceptions. Original digests, the failed
assertion and the inspection are retained. Canonical package hashing and
ISSUE-06 validation were never changed; these operational comparison digests
are not approval bindings.

The historical candidate identity still stores installation ID `155430459`
rather than personal account ID `97516061`. It was preserved, not repaired as
part of this sync. Installation authority was independently verified through
the OAuth-bound connection and live App/account checks. The extractor grants no
GitHub commit authorship from that historical identity. The 220 remaining stale
evidence rows were preserved and not forced to VERIFIED/current. Repository
recovery does not repair missing historical application package versions or
make old approved packages current; fresh application generation/review remains
separate and was not attempted.

### Verification evidence and next action

Operational verification: **four COMPLETE repository attempts, zero ingestion
failures/warnings**, original identity/history checks as qualified above, repeat
idempotency PASS, ownership/access/tenant isolation PASS, no new duplicate facts,
and all ten resources ACTIVE. One initial preservation assertion failed and is
disclosed above. Read-only diagnostic mistakes (an unsupported initial log level,
an overstrict historical identity expectation and a guessed audit table name)
were corrected without data repairs; they are not GitHub synchronization
failures.

The runtime was unchanged from published `f6060ec`. The matching earlier
668 PASS / 0 FAIL / 0 CANCELLED / 0 SKIPPED publication gate was not rerun or
counted as live verification. No new runtime tests or migrations were added for
this authorized operational execution. Real live GitHub/development PostgreSQL
checks above are separate from the earlier controlled provider fixtures.

Evidence is retained under OS Temp `career-large-tree-20261010`:
`two-repository-sync-baseline.json`, `two-repository-sync-first-attempt-result.json`,
`two-repository-sync-first-pass-inspection.json`,
`two-repository-sync-first-pass-snapshot.json`, `two-repository-sync-result.json`,
`two-repository-sync-final-snapshot.json`, and live/repeat logs. The successful
scoped synchronization audit is
`8a7de006-84f7-40a9-8238-c97fef25a0d8`, event
`github.repositories_synchronized`, created `2026-10-11T04:29:15.660692Z`.
Ownership/access final recheck completed at `04:29:06.543Z`.
Changed-documentation Prettier and `git diff --check` passed; strict scanning
of added documentation found zero secret patterns. The repeat helper passed
Node 22 syntax checking. Only this report and project.md were changed in the
tracked workspace; no commit/push was performed in this operational task.

No further repository activation is required. Next product repair remains
resume structure and quality; any fresh resume/application generation or
approval is a separate action. Production remains **NO-GO**.

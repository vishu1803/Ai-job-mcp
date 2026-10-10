# GitHub repository reconnection without rebuilding the candidate

Date: 2026-10-10. Phase: P0 product acceptance. Production: **NO-GO**.
Implementation and controlled integration verification complete; development
resource reconciliation was explicitly authorized and the ten activations were
committed as recorded below. Two live synchronization passes preserved history
and identity counts; full extraction remains blocked for two oversized trees.
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

Two repositories remain ACTIVE/accessible but extraction fails closed:

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

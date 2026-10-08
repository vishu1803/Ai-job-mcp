# Integrated Security Staging Acceptance Report

Date: 2026-10-08. Scope: ISSUE-01 through ISSUE-06 acceptance only.

**Decision: NO-GO for production. Integrated staging acceptance: BLOCKED — EXTERNAL DEPENDENCY.**
All six selected remediation gates pass **LOCAL ONLY**. None earns LIVE VERIFIED status.
The documented public staging domain returned HTTP 502, isolation and disposable identities
are unconfirmed, and independent release quality/dependency gates fail. No deployment,
production database connection, real GitHub action or employer submission was performed.

Base HEAD: `86a56c0a6b615d9b087e48d4ebf2a3ab315c943f`, plus the existing uncommitted remediations.
The 108 modified runtime/test/migration/configuration inputs were fingerprinted before report edits:
`b6b33ada0744129a1e01ee303e6672208b119f69cb787d2d046f2dbc69e8b499`.
This identifies the local inputs, not an immutable deployed release or clean-install proof.
Exact 89-file selections, commands and counts: [acceptance manifest](integrated-staging-acceptance-selections.json).
The verification-only skill kept this pass from changing product implementations or weakening tests.
No historical overall completion percentages were recalculated.

## 1. Environment inventory

| Requirement                        | Current evidence                                                                                                                                                  | Acceptance consequence                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Public staging                     | Runbooks name `https://dev.aicareershub.tech`; permitted unauthenticated HTTPS probes of `/livez`, `/healthz` and both OAuth discovery endpoints returned **502** | Public endpoint exists/responds, but application availability is not established                          |
| Actual deployment identity/version | No verified deployment/resource ID or running build fingerprint supplied                                                                                          | Cannot establish that remediated code is deployed                                                         |
| Production isolation               | Local `.env`/`.env.local` reference two remote database providers; neither was identified as disposable staging                                                   | Neither remote database was contacted                                                                     |
| Local environment                  | `.env.local` advertises localhost; GitHub/AI credentials are present, but their ownership, scope and staging status are unknown                                   | Presence is not authorization to exercise them                                                            |
| Signing keys                       | Both approval secrets absent from checked local env files and inherited environment                                                                               | Local files are not deployable protected-functionality configuration; deployed secret-store state unknown |
| Disposable identities/repositories | None supplied or independently established                                                                                                                        | Personal/org owner/member/attacker live tests blocked                                                     |
| PostgreSQL                         | Explicit synthetic ENV_FILE; private PostgreSQL 17.4, loopback port 55431, verified OS-Temp data directory                                                        | Real database tests are LOCAL, not managed-staging acceptance                                             |
| Replicas                           | Existing node/PostgreSQL/cloudflared processes are present; restricted process/network inventory cannot establish their topology                                  | A running tunnel is not proof of multiple isolated app replicas                                           |
| Storage/AI integrations            | No authorized staging storage identity/bucket or controlled provider account established                                                                          | Mock storage/provider checks only                                                                         |
| Backup and restore                 | Architecture/runbooks/scripts exist; no current staging backup manifest, restore drill or recovery-point evidence supplied                                        | Operational rollback readiness unverified                                                                 |
| CI/deployment                      | `.github/workflows/ci.yml` is a verification workflow with disposable PG; no verified deployment execution supplied                                               | CI configuration is not deployment evidence                                                               |

Initial sandbox HTTPS probes failed with EACCES; browsing-tool probes were inaccessible.
Those were not treated as outages. A separately permitted read-only network retry produced the
four actual 502 responses. No cookies, tokens or credentials were sent. No provider credentials,
raw keys, environment dumps or remote database credentials are recorded here.

## 2. Actual staging availability

**BLOCKED — EXTERNAL DEPENDENCY.** A historical runbook describes staging, but a healthy,
isolated, current staging deployment is not available for this acceptance pass. The user was
asked for its URL/resource ID and authorized disposable test scope; none was supplied during
the pass. No production service was used as a substitute.

The runbook's older IMPLEMENTED/VERIFIED checkboxes are historical assertions, not evidence
for this release. Investigate the 502 in the staging deployment/tunnel/origin with its operator;
this review does not assign a specific cause without deployment access.

## 3. Deployment and migration results

**PASS — LOCAL ONLY** for SQL compatibility checks; **BLOCKED — EXTERNAL DEPENDENCY** for staging rollout.

| Migration                                | Compatibility and history policy                                                                                                                                                                                              | Verification                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `0018_secure_github_installation_claims` | Global partial unique installation index, session numeric GitHub ID and durable phased state. Historical duplicate claims intentionally abort migration; no automatic winner/deletion                                         | Real-PG tests cover clean expansion, duplicate failure/rollback and racing authorized claims                                      |
| `0019_atomic_application_execution`      | Additive execution ledger; unique approval ownership and status CHECK. Consumed approvals, original signatures and snapshots must remain intact                                                                               | Fresh schema, actual unique index, contention/crash tests; this pass's upgrade preserves the exact consumed ticket row            |
| `0020_atomic_oauth_credentials`          | Nullable lineage/timestamps plus three unique indexes. Revokes ALL historical OAuth pairs and consumes outstanding pre-upgrade codes; fresh consent required                                                                  | This pass upgrades a two-branch legacy family: both rows preserved/revoked and code consumed; indexes/DDL rollback/repeat checked |
| `0021_evidence_verification_integrity`   | Historical GitHub evidence becomes OBSERVED; unsupported candidate VERIFIED/CORROBORATED labels become CLAIMED/INFERRED with historical metadata retained. Four DB triggers enforce scope/epoch/invalidation/promotion policy | Fresh 22 migrations, upgrade, claim/note preservation, repeat and transactional rollback tests pass                               |

Journal entries 0–21 are ordered; 0018–0021 are contiguous with increasing timestamps.
Current-schema drift: **30 tables, 154 indexes, zero missing declared tables/columns/indexes**.
This does not override the separate schema-integrity gate failure in section 10.

Additional current-pass rehearsal: isolated synthetic database at migration0017 ->0019 ->0020
->0021 ->repeat. The consumed approval row, historical signature and snapshot metadata remained
byte-for-byte equivalent after PostgreSQL decoding. A transactional drop of the new OAuth index
and rotation column was rolled back and both restored; legacy revocation tombstones remained.
This is a pre-commit DDL rollback proof, NOT an authorized post-upgrade vulnerable-code rollback.
Evidence: `%TEMP%/integrated-acceptance-upgrade.log` and focused migration TAP.

ISSUE-05 changes approval signatures to domain-separated v2 formats without a DB migration.
All historical formats are rejected; never re-sign historical rows. ISSUE-06 artifact receipts
and encrypted envelopes use existing storage/JSON, not a new migration. Legacy bytes are
quarantined on read, not destroyed, relabeled or substituted into approved snapshots.

**Mixed versions are unsafe.** Stop/drain every old application and background writer before
migrations/keys/policy activation. Ordinary zero-downtime rolling deployment is not accepted.
Old binaries can bypass claims, omit OAuth lineage or restore unsupported trust labels even
where additive schema remains technically readable. The generic staging runbook's "previous
commit"/"fully backward-compatible" rollback guidance is insufficient for these remediations.

Runbook callback discrepancy: `docs/cloudflare-staging-architecture.md` shows the GitHub App
user callback as `/auth/github/callback`; the secure installation service constructs
`/integrations/github/authorize/callback` (`github-installation.service.js:70`). Register the
actual App user callback separately from login OAuth before live tests. Deployed settings were
not inspected, so this is a documentation/configuration risk, not a confirmed live mismatch.

## 4. ISSUE-01 acceptance — installation authority

**PASS — LOCAL ONLY. Live gate: BLOCKED — EXTERNAL DEPENDENCY.**

Current service verifies stable GitHub user ID, exact user-accessible installation through
`/user/installations`, personal account identity, or active organization owner role=admin.
Only then does App-level visibility validate installation lifecycle/account consistency.
App JWT visibility alone cannot claim an installation (`github-installation.service.js:298–386`).
State binds session/user/tenant/installation, PKCE, expiry and replay protection. Production
`__Host-gh_install_state` has Secure, Path=/ and no Domain (`:39–49`). Database uniqueness
arbitrates two authorized tenant claimants; no process-local lock is the authority.

Current unit/integration gates pass legitimate personal/org owner/reconnect, foreign unclaimed
and claimed installations, inaccessible/non-admin organization, stable-ID mismatch, state
attacks, lifecycle/API failure and race cases. GitHub responses are controlled test responses.
Real personal/org identities, App permission configuration, browser cookie delivery and
revoked/suspended live installation behavior remain unverified.

## 5. ISSUE-02 acceptance — approved content

**PASS — LOCAL ONLY. Live gate: BLOCKED — EXTERNAL DEPENDENCY.**

Canonical server identity and immutable authoritative approval snapshot remain the only
executable content (`src/domain/job/application-package-identity.js`; workflow submission).
Tests retain approval/destination/context/version binding and reject tampered, expired or
legacy tickets. Concurrent clients supplying B with A's identity still execute only approved A.
The historical-artifact suite rejects unsafe old snapshots before execution and requires a
new generated version, review and approval; it does not rewrite old approvals.

No real extension preview-to-execution acceptance against a deployed backend was performed.
No employer endpoint was contacted. Live testing must use a network-isolated non-submitting
adapter, not a real application submission.

## 6. ISSUE-03 acceptance — one execution owner

**PASS — LOCAL ONLY. Deployed multi-replica gate: BLOCKED — EXTERNAL DEPENDENCY.**

`application-execution.repository.js:31–81` atomically consumes/claims and persists durable
execution identity/event. STARTED commits before the adapter; result/application/audit commit
together afterward. PostgreSQL does not make external HTTP transactional. UNKNOWN or durable
STARTED after ambiguous failure never reopens the approval.

| Local scenario                           | Successful owners | Adapter calls |
| ---------------------------------------- | ----------------: | ------------: |
| 2 interleaved service instances          |                 1 |             1 |
| 10 contenders                            |                 1 |             1 |
| 50 separate service instances            |                 1 |             1 |
| 50 waiting on a real PostgreSQL row lock |                 1 |             1 |

Independent Node-process, durable audit, restart/replay, claim/write/audit failure and ambiguous
outcome tests also pass. Losers receive CONFLICT/TICKET_ALREADY_CONSUMED; HTTP replay coverage
asserts 409. Adapters are non-submitting. External idempotency is **not live verified**;
built-in handoff adapters do not prove an employer honors an idempotency key. Two deployed
replicas behind the actual staging load balancer still need the 2/10/50 HTTP/MCP scenarios.

## 7. ISSUE-04 acceptance — OAuth and MCP

**PASS — LOCAL ONLY. Real-client/multi-replica gate: BLOCKED — EXTERNAL DEPENDENCY.**

Code row locking plus conditional consumption and token/audit persistence share a transaction
(`oauth-authorization.service.js:608–786`). Refresh uses a PostgreSQL family transaction lock,
locked re-read, conditional rotation, successor and audit commit (`:789–968` and OAuth repository).
Unique indexes prevent code roots/predecessor successors/active-family branching.

| Credential         | Callers / separate pools | Winners | New successor pairs |
| ------------------ | -----------------------: | ------: | ------------------: |
| Authorization code |                        2 |       1 |                   1 |
| Authorization code |                       10 |       1 |                   1 |
| Authorization code |                       50 |       1 |                   1 |
| Refresh            |                        2 |       1 |                   1 |
| Refresh            |                       10 |       1 |                   1 |
| Refresh            |                       50 |       1 |                   1 |

Independent processes, forced contention, PKCE/client/redirect/resource/tenant/scopes,
revocation, replay, transaction failures, crashes and lost-commit acknowledgement tests pass.
MCP bearer access before/after ordinary rotation and old access invalidation pass locally.

Strict refresh replay policy deliberately revokes the entire family, including the concurrent
winner's pair when a losing duplicate is detected. One issuance lineage is guaranteed; a raced
winner is not promised continued usability. Use a separate, non-raced fresh authorization to
test post-rotation live MCP access. Lost response/uncertain commit requires reauthorization,
not blind retry or successor recovery. Real Claude/ChatGPT/browser clients remain unverified.

## 8. ISSUE-05 acceptance — signing configuration

**PASS — LOCAL ONLY. Secret-store/replica gate: BLOCKED — EXTERNAL DEPENDENCY.**

Actual local production-mode entry-point tests reject either missing key, both absent, empty,
whitespace, placeholder, short/malformed and equal decoded keys before protected traffic.
Valid independent explicit fixture keys allow listen/signing. Construction/use guards,
domain separation, wrong/tampered/malformed signatures and historical rejection pass.
Runtime has no public fallback; test keys are explicitly preloaded only in test environments.

This proves code behavior, not secret-manager permissions, key entropy/provisioning, deployed
replica consistency or hosting-log redaction. Neither missing local key is a statement about
an uninspected deployment secret store. No configured private key was used or printed.

Rotation invalidates outstanding approvals only in its approval domain; fresh review is required.
Application-key rotation also intentionally invalidates ISSUE-06 application artifact receipts
and caches, requiring regeneration/review/reapproval. Action-key rotation does not invalidate
application approvals/receipts. Encryption keys are separate and must remain recoverable for
retained encrypted bytes; signing rotation is not an encryption-key migration.

## 9. ISSUE-06 acceptance — evidence and artifacts

**PASS — LOCAL ONLY. Live source/provider/storage/browser gate: BLOCKED — EXTERNAL DEPENDENCY.**

**230/230 ISSUE-06 tests pass** within the selected groups. Tests exercise the real services,
AST extraction, authoritative database origin, tenant/candidate/source identity, epoch/freshness,
DB guards and historical storage policy, with controlled GitHub/provider/storage responses.

- Commented/string/documentation-only imports cannot establish verified executable references.
- A valid narrow VERIFIED static repository reference is not verified candidate proficiency;
  contributor identity/access/organization membership is not proof of authorship.
- Forged well-shaped metadata, confidence, model citations/status and cross-tenant references
  cannot create verification authority.
- Model prose is untrusted; server rendering/allowlisted action selection and exact narrative
  retention block the original React self-verification exploit and equivalent output channels.
- Web/MCP/extension downloads, document IDs, historical PDF/TeX/letters/portfolios, cache
  manifests, version selection and CURRENT reuse cannot authorize legacy bytes from metadata.
- Receipt/source revocation/epoch/expiry failures require regeneration and fresh review/approval.
  Approved snapshots remain unchanged and consumed approvals stay spent after revocation.

Local receipt checks use authoritative local source state plus a 24-hour bound, not a live GitHub
request for each download. Actual webhook/revocation propagation and cross-replica storage
consistency remain mandatory staging checks. Previously downloaded/offline copies cannot be
recalled. Real compiler/provider/browser/extension behavior is not established by mocks.

## 10. Full selected test results and release gates

All eight groups reran in this pass. Disjoint final results, excluding diagnostic repetitions:

| Selection                                   |      PASS |  FAIL | SKIPPED | CANCELLED |
| ------------------------------------------- | --------: | ----: | ------: | --------: |
| Focused evidence/migration/privacy/provider |       158 |     0 |       0 |         0 |
| Broad evidence/career                       |       576 |     0 |       0 |         0 |
| Expanded application/artifact               |       230 |     4 |       0 |         0 |
| Approval/content/concurrency/write tools    |       178 |     0 |       0 |         0 |
| OAuth/MCP                                   |       173 |     0 |       0 |         0 |
| Installation/signing/auth/tenant/DB         |       265 |     0 |       0 |         0 |
| Narrative/historical artifact/p17           |       105 |     0 |       0 |         0 |
| Project-improvement                         |        23 |     0 |       0 |         0 |
| **Unique selected total**                   | **1,708** | **4** |   **0** |     **0** |

Automated environment-BLOCKED tests in these final selections: **0**. Six live issue gates
remain BLOCKED and are not six skipped/passing automated tests. This is the complete selected
six-remediation regression set, **not** a green `npm test` of every repository suite, CI execution,
real browser E2E, live integration or artifact compiler run.

| Other gate                                                   | Result                                | Evidence / limitation                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Changed P0 JavaScript syntax                                 | PASS — LOCAL ONLY                     | 102/102                                                                                                                                             |
| Changed P0 ESLint                                            | PASS — LOCAL ONLY                     | 0 errors /45 warnings                                                                                                                               |
| Repository-wide ESLint                                       | **FAIL — REMEDIATION REQUIRED**       | 950 files;129 errors/165 warnings. Browser globals and duplicate extension class handlers; not silently classified baseline                         |
| ISSUE-06 code formatting                                     | PASS — LOCAL ONLY                     | Existing 93-file ISSUE-06 manifest's applicable JS/JSON passes                                                                                      |
| All modified P0 formatting                                   | **FAIL / partly environment-blocked** | `src/db/schema.js` style warning; missing installed Prettier YAML module prevents checking CI YAML                                                  |
| Repository-wide formatting                                   | **FAIL**                              | Directory expansion EPERM in ignored scratch Chrome profile; explicit 923 tracked-file retry finds46 style-warning files and8 missing-module errors |
| Drizzle journal / drift                                      | PASS — LOCAL ONLY                     | 22 migrations;30 tables/154 indexes;zero missing declared objects                                                                                   |
| Schema integrity                                             | **FAIL — REMEDIATION REQUIRED**       | Execution user/candidate/application FKs lack covering indexes; extractor epoch update omits updatedAt (`github-evidence-extractor.js:167`)         |
| Column references                                            | PASS — LOCAL ONLY                     | 905 files/30 tables/zero invalid references                                                                                                         |
| DB lifecycle                                                 | PASS — LOCAL ONLY                     | 109 integration files/94 DB-using/zero violations                                                                                                   |
| Tracked-file secret scan                                     | PASS — LOCAL ONLY                     | 1,096 tracked files, zero non-fixture findings; keys/env/storage not dumped                                                                         |
| Strict changed-file scan vs HEAD                             | PASS — LOCAL ONLY                     | 23 current/23 historical synthetic matches;zero introduced matches                                                                                  |
| Whitespace                                                   | PASS — LOCAL ONLY                     | `git diff --check`                                                                                                                                  |
| Dependency vulnerability audit                               | **FAIL — REMEDIATION REQUIRED**       | Raw npm registry audit:1 critical/2 high/6 moderate,9 vulnerable package nodes                                                                      |
| Clean install / actual release artifact                      | NOT VERIFIED                          | Installed tree differs from lockfile; no install/lockfile mutation performed                                                                        |
| Managed backups/restore, deployed replicas, external clients | BLOCKED — EXTERNAL DEPENDENCY         | No isolated authorized staging evidence                                                                                                             |

Raw audit findings include locked `proxy-addr@2.0.7` (critical), transitive
`@modelcontextprotocol/sdk@1.30.0` (high), and dev `brace-expansion@1.1.18` (high).
Advisories: [proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h),
[MCP SDK](https://github.com/advisories/GHSA-6qxp-vccf-f47h),
[brace expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).
Reachability/exploitation was not established. In particular proxy-addr is in the production
lock graph via Express but absent from the current installed tree; the core server uses Fastify.
Installed glob also reports an incompatible minimatch resolution. Do not infer deployment
safety or blindly apply npm's suggested major downgrade; require dependency triage and a clean CI build.

**Audit-wrapper false green:** `scripts/audit-dependencies.js:21–35` parses npm's failed-request
JSON; `:48–55` defaults missing vulnerability metadata to zero. Restricted registry access failed,
yet the wrapper printed PASS and exited0. That result was rejected. Permitted raw `npm.cmd audit
--json --ignore-scripts --fetch-retries=0 --fetch-timeout=20000` returned actual metadata and exit1.
The wrapper must eventually fail closed on incomplete/error reports; no out-of-scope fix was made.

Logs retained in OS Temp: `integrated-acceptance-<group>.log`, `-upgrade.log`,
`-baseline-final.log`, `-modified-static.log`, `-eslint.json`, `-format.log`,
`-tracked-format.log`, `-issue06-format.log`, `-schema-integrity.log`,
`-tracked-secret-scan.log`, `-dependencies.log`, and `-npm-audit.json`.
Initial baseline-launch ESM path error was corrected to a file URL and rerun; its three
file-load failures are diagnostics, not new unique acceptance failures or baseline proof.
An accidentally verbose diagnostic log-reader was interrupted; no test was cancelled.

## 11. Independently reproduced baseline failures

The same four failures occur on the current checkout AND archived actual pre-ISSUE-06 HEAD.
All 932 archive blobs under src/tests/drizzle/scripts/package/workflows were compared against
actual HEAD: zero missing files or mismatches, including all failing tests and implementations.
This pass created a separate
fresh local database with exactly the archive's **20 original migrations**, not the current
22-migration DB; **34 tests /30 PASS /4 FAIL /0 SKIPPED /0 CANCELLED**.
Diagnostic/archive counts are not added to the current 1,712 unique selection.

| Test                                                          | Exact failing contract                                                                  | Classification / action                                                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/integration/web-application-routes.test.js:427`        | `/dashboard` lacks expected `/cloud-mesh-kernel/` text                                  | Reproduced baseline dashboard/fixture-contract failure; underlying product-versus-fixture cause not established; separately diagnose |
| `tests/unit/extension-prepare-handoff-regression.test.js:345` | Expected200, actual500 PREPARE_HANDOFF_FAILED                                           | Reproduced baseline workflow failure; do not assign the separately known bullet-minimum defect without proof; separately diagnose    |
| `tests/unit/p86-job-application-workflow.test.js:322`         | Expected ValidationError from missing data, earlier mandatory approval rejection occurs | Obsolete pre-approval direct-submit expectation; preserve approval guard; future fixture must supply a legitimate approved target    |
| `tests/unit/p86-job-application-workflow.test.js:360`         | Direct submit without ticket gets APPROVAL_TICKET_REQUIRED                              | Obsolete insecure success expectation; do not remove approval requirements                                                           |

These are FAIL, not PASS/SKIP. They reproduce before ISSUE-06; this does not make the release
suite green or excuse unresolved user-facing workflows. Additional lint/format/schema/audit
failures above are independently reported current release blockers, not assumed baseline.

## 12. External dependencies

Required: operator-identified isolated staging; current immutable build; two or more replicas
with shared isolated PG; dedicated private artifact storage; secret store; DNS/TLS/ingress;
disposable GitHub users/personal/org/fork repositories and owner/member roles; staging GitHub
App/login clients with correct callbacks; authorized OAuth/MCP clients; adversarial provider
fixture endpoint; compiler/browser/extension runtime; non-submitting adapter with observable
call counter; backup/restore access and attributable operator audit identity.

Existing credential presence is not sufficient. Do not request secret values in chat, reuse
personal repositories or production sessions, or use real employer endpoints.

## 13. Remaining release blockers

1. Staging public application/discovery returns502; actual build and production isolation unknown.
2. Authorized disposable identity/repository/adapter/provider scope is unavailable.
3. No deployed multi-replica acceptance evidence for approval or OAuth exclusivity.
4. Secret-store provenance, consistency, startup negatives, log redaction and rotation unverified.
5. Managed PG/storage backup and restore evidence and recovery operator not established.
6. Six live acceptance matrices below remain incomplete.
7. Raw dependency gate fails and its wrapper can incorrectly report success on network failure.
8. Full lint, formatting and schema-integrity gates fail; installed dependency/tooling tree is inconsistent.
9. Four reproduced baseline tests remain red; dashboard/extension workflow impact needs diagnosis.
10. Coordinated stop-all rollout, callback registration and safe roll-forward procedure need operator rehearsal.

## 14. Rollback readiness

**NOT READY / BLOCKED.** Documentation and local transactional rehearsal are not a managed
restore drill. Before staging migration, capture encrypted PG and artifact snapshots, migration
journal/build metadata and secret version identifiers (never secret values); restore into a
separate isolated environment and prove tenant ownership/decryption/consumption history.

After security migrations commit, default to roll-forward. If the application must roll back,
keep protected submission, OAuth issuance/rotation, installation linking and unsafe artifact
serving disabled, stop every vulnerable worker, and retain security constraints/history.
Never reset consumed approvals, delete executions, reactivate legacy tokens/codes, re-sign
old tickets or restore unsupported VERIFIED labels. A backup from before execution must not
be restored into an enabled service that could repeat an external side effect. Reconcile
UNKNOWN/STARTED outcomes without retrying the adapter. No production restore/rollback ran.

The private local cluster was checkpointed, exact directory/version and zero other client
connections verified, then only that test cluster stopped. Logs and cluster files are retained.
Temporary synthetic upgrade/baseline databases were removed after their tests; they can be
recreated, and contained no user data. Existing remote DBs, other local PostgreSQL processes,
node services, cloudflared and browser profiles were not stopped or modified.

## 15. Production go/no-go and prioritized staging checklist

**NO-GO.** Local six-remediation regression gates pass; integrated LIVE acceptance does not.
Do not deploy production or claim production readiness from this report.

### P0 — establish safe staging before authenticated testing

1. Supply operator-approved staging deployment ID/URL and immutable release digest; restore
   200 health/discovery responses. Prove separate database, artifact bucket/prefix, secrets,
   identities and outbound integrations from production. Never substitute production.
2. Provision disposable owner/attacker users, organization owner and ordinary member, personal/
   organization/third-party/fork repositories and installations. Define deletion/retention scope.
3. Provision an observable non-submitting adapter and controlled malicious-response AI fixture;
   deny employer-submission egress. Record that no real job application is authorized.
4. Provision independent random action/application keys through a secret manager, consistent
   versions on every replica, plus separate encryption/session/GitHub credentials. Use no public
   test preloader in deployed startup. Register login and installation-App callbacks correctly.
5. Establish fresh PG and encrypted artifact backups; restore into isolation. Record recovery
   owner, recovery point/object versions, checksums, migration state and consumption tombstones.
6. Resolve release audit/lint/format/schema blockers under a separately scoped change; validate
   a clean lockfile-based CI artifact. Do not weaken remediation tests or auto-force dependency fixes.

### P1 — coordinated deployment and six live acceptance runs

7. Disable protected traffic; drain/stop ALL old replicas/workers. Preflight duplicate installation
   claims on isolated staging. Apply0018–0021 in journal order; verify historical invalidation,
   evidence downgrade and artifact quarantine. Start at least two patched replicas on shared PG
   and artifact storage, with identical build/policy/key version IDs. No mixed-version rollout.
8. ISSUE-01: real login/App-user OAuth+PKCE, stable identity, exact installation, personal and
   active-org-owner success; foreign/member/inaccessible/revoked/suspended rejection; state
   expiry/replay/callback mismatch; browser Secure/Path=/host-only cookie attributes. Do not
   weaken org policy if configured user-token permissions cannot prove authority.
9. ISSUE-02: browser/extension preview A, approve frozen A, send B with A identity, verify only A
   at mock boundary; bind destination/version/attachments. Reject legacy/expired/tampered tickets.
10. ISSUE-03: route2,10,50 authenticated requests across both pinned replicas and load balancer;
    assert one durable owner and at most one mock call, deterministic loser responses and matching
    audit execution IDs. Interrupt before/during/after boundary; STARTED/UNKNOWN never auto-retry.
11. ISSUE-04: real authorized OAuth/MCP client consent+S256+token+MCP and ordinary refresh+MCP;
    reject wrong client/tenant/resource/scopes; revoke/replay family. Run2,10,50 code and refresh
    contenders across replicas: one lineage each. Inject response loss; require reauthorization
    after uncertain commit. Verify strict duplicate refresh revokes the winner's family too.
12. ISSUE-05: disposable production-mode startup probes remove each key independently and
    exercise invalid values; require no protected listen/signing. Fresh approvals succeed,
    historical signatures fail. Rotate one signing domain across drained replicas; verify only
    intended approval domain invalidates, including application receipts when its key changes.
    Inspect redacted hosting/application logs; compare secret version IDs, never values.
13. ISSUE-06: ingest actual controlled commented/string/README/executable sources; verify pinned
    SHA/blob/location and conservative attribution. Attempt forged/stale/foreign provenance and
    malicious/multilingual/free-form/model-JSON assertions through browser, extension, web and
    MCP. Try historical PDF/TeX/cover/portfolio IDs, cache/version/CURRENT paths. Revoke the live
    source and verify webhook/epoch propagation across replicas. Regenerate a NEW version,
    review/approve anew; old snapshots unchanged, spent approvals remain spent.

### P2 — acceptance evidence and release decision

14. Re-run the selected regressions plus clean CI/full applicable suites, real browser/compiler/
    storage tests and raw registry audit. Keep the four baseline failures explicit until resolved
    or accepted through a documented release decision; record all skips/cancellations/blocks.
15. Retain sanitized run IDs, build/migration/key-version identifiers, replica routing evidence,
    durable counts/audits, screenshots and backup/restore evidence. No tokens/raw credentials in
    reports. Only upgrade individual gates to PASS — LIVE VERIFIED after these actual checks.
    Obtain a new go/no-go review; do not automatically release based on local counts.

## Changes in this acceptance pass

- This report: current inventory, local results, blockers, rollback constraints and live procedure.
- Acceptance selections JSON: exact reproducible89-file input manifest and unique counts.
- `project.md`: mandatory current acceptance ledger; integrated task BLOCKED on external staging.

No product code, schema, test expectations, credentials, production resources, overall percentages,
ISSUE-07 implementation, commits or pushes changed in this pass.

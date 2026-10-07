# ISSUE-03: Durable, single-owner application execution

## Scope and decision

Only approval consumption, durable execution and result/status consistency are changed. ISSUE-01 installation authority and ISSUE-02 signed immutable snapshots remain mandatory. ISSUE-04 and ISSUE-05 are not addressed. No completion percentages are recalculated.

Local PostgreSQL security verification is complete; deployment/staging acceptance and any real provider submission/idempotency verification remain pending. Completion decision: **FIX IMPLEMENTED BUT LIVE VERIFICATION REQUIRED**.

## Original reproduction

Before product-code changes, `application-approval-execution.test.js` forced two independent service instances to finish loading the same ISSUED ticket before either proceeded. Both used real PostgreSQL reads/writes and valid ISSUE-02 snapshots. Result:

```text
ISSUE-03 interleaved callers=2 adapterCalls=2 successes=2
tests 1 / pass 0 / fail 1 / cancelled 0 / skipped 0
```

`%TEMP%/issue03-original-race.log` preserves the failing regression. No employer was contacted. The original helper updated status without an expected prior status, swallowed persistence errors, and did not give one caller exclusive execution ownership. Tracking was several independent transactions with swallowed failures.

## State machine and identity

Old: read ISSUED -> best-effort unconditional CONSUMED update -> adapter/handoff -> best-effort tracking.

New approval lifecycle: **ISSUED -> CONSUMED permanently when execution ownership commits**. CONSUMED means the execution right is spent, NOT that an employer received an application. EXPIRED/REVOKED/PENDING/APPROVED/legacy/unknown tickets cannot execute. Existing workflows issue ISSUED content-bound tickets; no legacy APPROVED shortcut is introduced.

Separate durable execution lifecycle:

```text
CLAIMED -> STARTED -> SUCCEEDED
                  -> FAILED   (explicit adapter guarantee of no side effect)
                  -> UNKNOWN  (ambiguous failure)
CLAIMED -> FAILED             (known failure before STARTED)
```

- CLAIMED: ownership and intent committed, no boundary authorized yet. There is no automatic takeover or lease expiry.
- STARTED: authorization to enter the adapter/manual boundary committed. On restart its outcome must be treated as reconciliation-required, even if the process actually died before sending anything.
- SUCCEEDED: a validated adapter/handoff result and application status committed together. HANDOFF_READY is success of handoff, not external submission.
- FAILED: known failure without an external effect. This approval nevertheless stays spent.
- UNKNOWN: side effect/result persistence is uncertain. Never automatically resubmit.
- Interrupted recovery writes may leave CLAIMED or STARTED. These are durable blocking states, not reusable approvals.

`application_executions.id` is a random, server-issued execution/idempotency UUID, separate from approval ID, application ID and employer reference. The record retains tenant/user/candidate/application, approved source package UUID, version/hash, claimed/started/completed timestamps, result, external reference and failure classification. Source package UUID is intentionally not a cascading FK: ISSUE-02's signed snapshot remains the authority even if the mutable package ledger changes. Tenant/user/candidate/application deletion cascades through the existing approval ownership model.

## Atomic claim and transaction boundaries

`claimApplicationExecution` uses one PostgreSQL transaction:

1. Tenant-scoped SELECT FOR UPDATE on the approval. Lock acquisition precedes expiry evaluation, including when the lock holder only locks without updating the row.
2. UPDATE ... WHERE status = 'ISSUED' RETURNING, matching the already verified user/candidate/application, signature, package hash/version, job/destination, exact expiry and complete JSONB metadata. Require expiry > clock_timestamp(). Snapshot/context changes between verification and claim fail closed.
3. Insert the execution intent, protected by global UNIQUE(approval_id).
4. Insert application.execution_claimed audit event; commit everything together.

Exactly one caller gets a confirmed claim. Others receive domain `CONFLICT`, details `TICKET_ALREADY_CONSUMED`, HTTP 409 on the web submit route. A failed insert/transaction or unknown claim commit acknowledgement never permits fallback execution. An existing execution also blocks a second claim if an operator corrupts ticket status back to ISSUED.

STARTED + execution_started event commit in another local transaction **before** the boundary. The boundary is invoked once, outside all database transactions. SUCCEEDED result + exact approved application's status/metadata/applied timestamp + execution_succeeded event then commit together. No package regeneration, duplicate application creation or mutable CURRENT-package substitution occurs. Metadata separately records executed package UUID/version; the package ledger is not rewritten to impersonate the historical approval target.

PostgreSQL and employer HTTP do not form an ACID transaction. Timeout, malformed response, uncertain rejection or result write failure causes UNKNOWN when persistence is possible; otherwise STARTED remains. An explicit FAILED/REJECTED adapter result is definitive only with sideEffectOccurred === false. Thrown exceptions are conservatively ambiguous once STARTED. No automatic retries exist. A confirmed commit whose acknowledgement is lost may already be terminal; recovery cannot overwrite that terminal result.

## Adapter policy

Inspected base adapter and all Ashby, Greenhouse, iCIMS, Lever, SmartRecruiters, Workday and generic portal adapters. Built-ins inherit staging/handoff behavior and block automatic final submit. They implement no employer submission HTTP idempotency or deterministic submission reconciliation. An injected authorized adapter receives executionId, idempotencyKey (same UUID) and approvalTicketId, alongside ONLY the detached frozen ISSUE-02 snapshot.

Forwarding an idempotency key is not evidence that a provider honors it. External idempotency: **NOT VERIFIED — EXTERNAL DEPENDENCY**. No employer requests or safe duplicate-lookup guarantees were tested. This gateway guarantees at most one adapter invocation per approval, not an exactly-once external outcome or prevention of a human manually submitting twice. Separate approvals for the same job are outside this per-approval remediation.

## Crash recovery matrix

| Failure point | Stored state | Adapter may have executed? | Retry safe? | Required action |
|---|---|---|---|---|
| Before claim / confirmed claim rollback | ISSUED, no execution | No | Yes, if still valid | Re-verify and claim normally |
| Claim commit acknowledgement lost | ISSUED/no execution OR CONSUMED/CLAIMED | No from this caller | Only if DB proves unclaimed | Inspect durable state; never bypass claim |
| Immediately after claim | CONSUMED/CLAIMED | No, under new code | No same-approval retry | Quiesce owner; operator reconciliation |
| After intent persistence | CONSUMED/CLAIMED | No | No | Same; intent/claim/audit are one commit |
| Before adapter, STARTED committed | CONSUMED/STARTED, or FAILED after known pre-start failure | Uncertain to a recovering process | No | Reconcile; do not infer from elapsed time |
| While adapter runs | CONSUMED/STARTED or UNKNOWN | Yes | No | Stop/quiesce owner; inspect provider |
| After adapter success | CONSUMED/STARTED | Yes | No | Provider lookup / human reconciliation |
| Before result persistence | CONSUMED/STARTED or UNKNOWN | Yes | No | Record proven result without executing |
| After result persistence/commit | CONSUMED/SUCCEEDED (or terminal FAILED/UNKNOWN) | According to result | No | Read saved result; never resubmit |
| Before success audit insertion | STARTED until result transaction commits | Yes | No | Failure rolls back result/application; record UNKNOWN if possible |
| After success audit insert, before commit | STARTED after rollback; SUCCEEDED after commit | Yes | No | Inspect commit outcome; all three records commit together |
| After success audit commit | CONSUMED/SUCCEEDED | According to saved result | No | Return/read evidence; no execution |

Actual child-process kills exercise both "during adapter" and "after adapter success before persistence". Other boundaries use real durable records, real PostgreSQL trigger failures/transaction rollback, or injected transaction/commit-acknowledgement failures. These are not claims of testing real network partitions or power-loss durability.

## Operator reconciliation (no automatic retry feature)

There is deliberately no new public reconciliation API/worker. Only an authorized operator with database access may resolve interrupted executions, after stopping/quiescing the original owner and obtaining provider evidence or human confirmation. Time alone, a missing audit event or a client assertion is NOT evidence of no side effect.

The existing result persistence function accepts a maintenance-only `reconciliationEvidence` reference and expected `fromStatus`. An authorized database operator may invoke it after quiescing the old owner and verifying provider evidence. It conditionally transitions only CLAIMED/STARTED/UNKNOWN, writes the proven result/application status, and emits `application.execution_reconciliation_completed` with the PostgreSQL current_user, tenant, approval/execution IDs, reference and old/new states in ONE transaction. UNKNOWN cannot be marked successful without evidence; terminal executions cannot be overwritten. No public route calls this maintenance option. A reference is an operator attestation, NOT automatic verification against a provider. Use an attributable operator database identity in staging/production. Do not clear consumed_at, delete the execution, reset the approval, or invoke an adapter during reconciliation. Persistence/auditing is locally tested with synthetic evidence; live reconciliation remains unverified.

Any new attempt requires separate explicit human review/approval and a determination that another side effect is safe. It must not be automatically created by recovery. UNKNOWN and stale CLAIMED/STARTED must be operationally monitored; no dashboard or reconciler is claimed by this fix.

## Audit consistency

- approval_issued commits with snapshot issuance.
- execution_claimed commits with claim/intent.
- execution_started commits before boundary.
- execution_succeeded / execution_failed / execution_outcome_unknown commit with result; success includes application status.
- execution_replay_rejected is best-effort so audit failure cannot change deterministic rejection or reopen ownership.
- Reconciliation event commits with the operator-attested result/status through the persistence hook above. Audits never decide whether execution is permitted; status CAS + unique durable intent do.

## Rollout / compatibility / rollback

1. Disable submission traffic and stop **all** old workers. Mixed old/new serving is unsafe: old workers swallow failed writes and do not participate in this protocol.
2. Apply journaled additive migration 0019. Preserve existing approvals and consumed history; no backfill resets or selects new execution owners.
3. Deploy all workers with ISSUE-01/02/03 changes intact; validate schema and staging concurrency before re-enabling submission.
4. Old consumed approvals remain denied without requiring execution backfill; legacy hash-only tickets remain denied by ISSUE-02. Re-prepare/review legacy content instead of grandfathering it.
5. Rollback requires disabling submission and stopping workers again. Retain the additive table and consumed approvals as forensic evidence. A rollback to vulnerable code is NOT a safe enabled-service rollback. Do not drop execution data to make old code work.

Forward migration and repeated migration succeeded both on the existing disposable cluster and a fresh disposable database containing all 20 migrations. UNIQUE approval ownership and status CHECK were inspected in PostgreSQL. Dropping evidence / production rollback was intentionally not performed.

## Verification evidence

Node 24.13.0; disposable PostgreSQL 17 at loopback port 55431; synthetic `%TEMP%/ai-job-issue01-test.env`; no real provider credentials or existing user database. Existing dependencies reused; no signing/authentication changes.

- New ISSUE-03 suite: **50/50 PASS**. Four adapter contention scenarios (2, 10, 50 separate instances, 50 row-lock contenders), 10-way manual handoff, and two independent Node processes/pools all have one winner. Each adapter contention scenario invokes the adapter exactly once. Immediate in-flight replay and operator-attested reconciliation without re-execution/evidence-less transition rejection are separately covered.
- ISSUE-02: **71/71 PASS** (44 integration + 27 canonical identity); persistence suite 10/10; focused combined **131/131 PASS**. New assertions retain frozen approved A under concurrent supplied B and HTTP replay returns 409. The write-failure test now injects failure inside the real transaction, not just the outer db.insert method.
- ISSUE-01/security/auth/DB/tenant/artifact gate: **209/209 PASS**. Extension gate **25/25 PASS**.
- Wider workflow gate: **190 PASS / 42 FAIL**. An identical 42-location failure set was recorded before ISSUE-03 product edits; no failures were reclassified as passes.
- Additional adapter/lifecycle/tracking gate: **148 PASS / 3 FAIL**. These three stale fixtures hit unchanged ISSUE-02 destination/application checks before the changed execution logic; they were not included in the pre-edit baseline run and are not claimed as baseline-executed.
- Final selected unique tests: **748 total / 703 PASS / 45 FAIL / 0 CANCELLED / 0 SKIPPED**. No whole-repository green claim.
- Modified-file lint: 0 errors, 10 existing unused-variable warnings. DB lifecycle audit: 104 integration files / 90 DB-using / 0 violations. Whitespace check and fresh/repeated migration checks passed.

Logs: `%TEMP%/issue03-original-race.log`, `issue03-baseline.log`, `issue03-focused-final.log`, `issue03-security-final.log`, `issue03-extension-final.log`, `issue03-regression-final.log`, `issue03-adapters-final.log`, `issue03-lint-final.log`, `issue03-migration-check.log`.

After all gates, verified server version 17.4 and exact disposable data_directory, then stopped that cluster successfully. Synthetic database files/settings/logs remain in Temp for reproduction; no user database was stopped/deleted.

Remaining manual acceptance: coordinated staging migration/deployment, concurrent authenticated HTTP/MCP calls across deployed instances, real provider idempotency/reconciliation if a submission adapter is enabled, and interrupted-execution operator runbook. ISSUE-01 real GitHub staging remains pending separately. Overall production release remains blocked; ISSUE-04 is next and still open.

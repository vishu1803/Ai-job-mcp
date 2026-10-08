# ISSUE-02: Content-bound application approval

## Trust boundary and reproduced defect

The original `requestApplicationApproval` signed a caller-supplied hash without
loading a package. `submitJobApplication` compared that hash to the ticket and
passed the caller's independent package to either an adapter or document renderer.
Before remediation, a hermetic reproduction retained an approved hash of 64 `a`
characters while replacing resume text. The adapter observed
`PACKAGE B: changed after approval` and threw `REACHED_ADAPTER`.

Preparation creates server-generated candidate/job/document/answer content and
records versioned `application_packages.package_payload` JSONB. That ledger has
row UUIDs and numeric versions, but hash-only historical records and legacy null
payloads exist. Preparation also enriches its response with presentation/artifact
metadata **after** recording the base package. Consequently a prepare response is
not itself the authoritative approval target. Client-side edits to it never become
approved content. Use `get_application_package` and `create_application_preview`
to review the persisted version; preview also returns the complete `approvalContent`.
The extension preview endpoint loads this same authoritative payload; a supplied
package body cannot substitute a different preview under the persisted hash.

## Authoritative target: immutable approval snapshot

1. Authenticate and authorize access to the tenant's candidate.
2. Resolve exactly one persisted package by tenant, candidate, hash selector and
   optional application/version selectors. Reject absent/ambiguous/null payloads.
3. Verify application ownership and independently recompute package identity.
   Legacy/corrupt hashes require a new preparation, not a compatibility bypass.
4. Derive job ID and destination from that payload, checking any supplied hints.
5. Copy the canonical execution payload into
   `application_approval_tickets.metadata.approvalTarget`, with format
   `application-package-approval/v1` and the source package row UUID.
6. Sign format, package row UUID, package version, content hash, ticket UUID,
   tenant, user, candidate, application, job, destination and expiry. Require a
   successful durable insert before returning the ticket.
7. At submission, read the ticket durably, validate existing context/lifecycle
   checks, verify the signature, require the versioned snapshot, and independently
   re-hash it. Validate snapshot candidate/job/destination against the ticket.
8. Execute a detached, recursively frozen copy of **only** that snapshot, with
   server-signed application/version/hash bookkeeping reconstructed separately.
   Client package bodies remain optional compatibility hints; they are not adapter
   or manual-handoff input. A supplied B with A's identity executes A, never B.

Snapshot immutability is content-addressed and signature-enforced: modifying the
snapshot, its hash, package UUID, version, destination or context invalidates the
authorization. Later ledger updates/regeneration cannot change the stored approval
target. An explicitly approved historical version remains usable until expiry or
revocation; it never silently switches to CURRENT. No application-package payload
is backfilled or rewritten to bless an old approval.

## Canonical contract

`src/domain/job/application-package-identity.js` owns the one package hashing
function (re-exported from the workflow service for compatibility).

The fixed hash envelope is `{format, package}`. Object keys at every depth are
serialized in lexical order, including numeric-looking keys; arrays retain order.
Only finite numbers, strings, booleans, null, dense arrays and plain JSON objects
are accepted. Undefined object properties are omitted consistently with JSONB;
undefined/sparse array elements and non-JSON values are rejected.

All package fields are explicitly approval-sensitive by default, including:

- Candidate ID/name/email/phone, candidate/contact/profile snapshots and links.
- Entire target job: ID, employer, title, URLs, portal/source and job metadata.
- Resume and cover-letter text, their content hashes and structured resume data.
- Answers, screening responses, attachments and artifact references/hashes/URLs.
- Portal-specific fields, generation/schema contracts, evidence, tailoring data,
  application metadata and any future extension field consumed by an adapter.

The ONLY top-level exclusions are `packageHash`, `preparedAt`, `applicationId`,
`packageVersion`, `packageStatus`, and `lifecycleAction`. They are stripped from
execution content, not merely excluded from hashing. Application/version/hash
are then reconstructed from signed server context. Other readiness/artifact fields
remain hashed because they can affect adapter behavior. Nested extension data is
never selectively stripped. Updating any approval-sensitive content requires a
new server-prepared/reviewed package and new approval.

Manual handoff returns approved Markdown/answers/artifact metadata. It does not
re-render documents from live candidate profiles or reuse unsnapshotted mutable
application handoff metadata after approval. Preparing PDFs remains a pre-approval
operation. Presentation-only enriched PDFs not in the persisted payload are not
implicitly covered by approval, and are not substituted during execution.

## Persistence and rollout

No schema migration is needed: the existing JSONB metadata column holds the
snapshot. Ticket creation is a single PostgreSQL insert containing signature and
snapshot together. Snapshot creation/read errors fail closed; submission never
uses the process cache as snapshot authority. Lifecycle status writes themselves
retain existing behavior and are explicitly **not** claimed atomic by this fix.

Deploy all application workers together; do not keep vulnerable old workers
serving requests. Existing hash-only tickets cannot execute in the new service.
Existing packages using the old narrow hash need re-preparation and review; the
prepare reuse path detects old hashes and bypasses reuse. Changed answers also
bypass reuse rather than returning changed content under a stale hash. There is
no unsafe rollback that makes pre-remediation tickets safe: rolling back code
reintroduces the vulnerability and requires disabling submission endpoints first.

Necessary compatibility correction: the package ledger permits a new version
after HANDOFF_READY/READY_FOR_FINAL_REVIEW only when `finalSubmitBlocked === true`
and there is no applied timestamp or external SUBMITTED evidence. This preserves
changed-answer preparation without returning B under A's hash. Unverified staging
and actual submitted records retain default-deny protection.

## Verification and remaining scope

Tests exercise both adapter methods, manual handoff, all major sensitive content
mutations with unchanged hashes, deterministic hashing, non-JSON rejection,
tenant/user/candidate boundaries, destination/version mismatch, durable snapshot
tampering, restart plus ledger mutation, storage failures, legacy ticket rejection,
and MCP preview/approval/reference-only submission.
Real HTTP injection also verifies extension preview and web approval/manual
submission with altered client package content.

ISSUE-03 (atomic consumption, status-persistence failure handling and concurrent
replay) remains unresolved. ISSUE-05 (public fallback signing key) also remains
unresolved; production requires a private signing secret. No claim is made about
third-party adapter behavior, external URL byte immutability, or a live employer
submission. Current built-in adapters stage/handoff, not autonomous submission.
Before adding binary-transmitting adapters, bind and verify actual attachment bytes
against the approved content hashes and prohibit live-profile/destination rewriting.

ISSUE-01 code/state/cookie/ownership protections are unchanged by this remediation;
its live GitHub staging acceptance is still pending.

Approval snapshots contain candidate PII and duplicate selected package content.
They inherit tenant cascade deletion and existing database access controls; an
operational approval-snapshot retention policy has not been verified here.

## Local verification (2026-10-07)

All database checks used the disposable loopback PostgreSQL 17 cluster with all
19 existing migrations applied. No real GitHub, AI or employer credentials were
used. There is no ISSUE-02 schema migration.

| Final gate | Passed | Failed | Cancelled/skipped |
|---|---:|---:|---:|
| Content identity, durable binding, approvals, authorization, Phase 7 | 145 | 0 | 0 |
| ISSUE-01, auth, database, tracking, artifacts, tenant isolation | 209 | 0 | 0 |
| Extension API/matrix | 25 | 0 | 0 |
| Broader application/MCP/workflow | 118 | 37 | 0 |
| Document/content/email regression | 72 | 5 | 0 |
| Tracking unit | 5 | 0 | 0 |

Gates overlap: de-duplicated selected final checks cover **552 tests: 510 passed,
42 failed, 0 cancelled/skipped**. The two new files contain **71 new tests, all
passing**. The 42 red cases are the same test locations that failed when relevant
modules were loaded read-only from pre-fix HEAD using a Node loader hook; no
working-tree file was replaced to obtain the baseline. Some now fail earlier
because stricter destination/content checks reject unsafe fixtures.

Known red groups: empty/unconfigured external job feed and cascading MCP tests;
stale dashboard/status/adapter expectations; absent hardcoded historical user,
candidate/application rows; incomplete Drizzle mocks; and deprecated direct-flow
tests without approval tickets. The structured-resume suite also contains a
historical hash-neutrality expectation incompatible with approving structured
content, but its current baseline failure occurs earlier in its incomplete DB mock.
These suites were not silently skipped or treated as passing.

Targeted ESLint: 0 errors, 9 pre-existing unused-variable warnings. Static database
lifecycle audit: 103 integration files, 89 DB-using files, 0 violations.
`git diff --check` passed. Live staging/browser review and a configured employer
adapter remain unverified; ISSUE-01 live GitHub acceptance remains separately due.

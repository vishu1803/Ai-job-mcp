# Architecture Specification: Two-Phase Human-in-the-Loop Action Approval State Machine (P9-002A)

**Document ID**: `ARCH-032`  
**Phase**: `PHASE 9 — Approved GitHub / Project Modification Workflows`  
**Task**: `P9-002A` (Architecture & Security Review)  
**Status**: `APPROVED`  
**Date**: `2026-08-25`  
**Target Implementation**: `P9-002`  

---

## 1. Executive Summary & Strategic Context

In Phase 9 (Task `P9-001`), the Antigravity Career Hub established the **Project Improvement Recommender**, which deterministically synthesizes structured code/architecture proposals to bridge candidate skill gaps without performing any repository writes or external mutations.

This specification (`ARCH-032`) defines the architectural, security, and cryptographic foundations for **Task P9-002**: the **Two-Phase Human-in-the-Loop Action Approval State Machine** (`ActionApprovalTicketService`).

The approval state machine forms the **sole, impassable authorization boundary** between AI-generated project improvement proposals and downstream GitHub mutation services (`P9-003`). Under no circumstances can an AI agent, background worker, or direct API caller modify a user repository without consuming a valid, unexpired, cryptographically verified, and human-confirmed `ApprovalTicket`.

```
+---------------------------------------------------------------------------------------------------+
|                                TWO-PHASE HUMAN-IN-THE-LOOP FLOW                                    |
|                                                                                                   |
|  [ P9-001 Recommender ] ---> Generates Validated ProjectImprovementProposal                       |
|           |                                                                                       |
|           v                                                                                       |
|  [ Phase 1: PROPOSE ]  ---> ActionApprovalTicketService.createTicket(context, proposal)           |
|           |                 • Mints ApprovalTicket (Status: PENDING, TTL: 15m)                     |
|           |                 • Calculates HMAC-SHA256 Signature over Ticket Canonical Form        |
|           |                 • Binds expectedHeadSha, patchFingerprint, and tenantId                |
|           |                 • Emits audit event: approval.ticket_created                          |
|           v                                                                                       |
|  [ Human Review Gate ] ---> Interactive Human Review (UI / CLI / IDE Dialog)                     |
|           |                 • Inspects target repository, branch, diff, risk, test plan           |
|           v                                                                                       |
|  [ Phase 2: CONFIRM ]  ---> ActionApprovalTicketService.approveTicket(context, ticketId)          |
|           |                 • Verifies Authenticated Human Identity & RBAC                        |
|           |                 • Atomic CAS: PENDING -> APPROVED (WHERE expires_at > NOW())          |
|           |                 • Emits audit event: approval.ticket_approved                         |
|           v                                                                                       |
|  [ Execution Gate ]    ---> ActionApprovalTicketService.consumeTicketForExecution(ticketId)       |
|  (P9-003 Consumer)          • SELECT FOR UPDATE & Atomic CAS: APPROVED -> EXECUTING              |
|                             • Verifies latestHeadSha === expectedHeadSha                          |
|                             • Calls Scoped GitHub App Connector (Branch, Commit, Draft PR)        |
|                             • Transitions EXECUTING -> EXECUTED (or FAILED with rollback)         |
|                             • Emits audit event: approval.execution_completed                     |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Canonical State Machine & Lifecycle Transitions

### 2.1 State Definitions

The lifecycle of an action approval is governed by 8 mutually exclusive states:

| State | Type | Description |
| :--- | :--- | :--- |
| **`PENDING`** | Initial / Active | Ticket created, cryptographically signed, and awaiting human confirmation. Valid for 15 minutes. |
| **`APPROVED`** | Transitional | Human has reviewed and explicitly approved the proposal. Ready for execution consumption. |
| **`EXECUTING`** | Transitional / Locked | Execution worker has atomically acquired the lock. GitHub mutations are in progress. Prevents concurrent execution. |
| **`EXECUTED`** | **Terminal (Success)** | GitHub branch, commit, and draft PR successfully created. Ticket is consumed and permanently archived. |
| **`REJECTED`** | **Terminal (User)** | User reviewed the proposal and explicitly rejected it. Cannot be approved or executed. |
| **`CANCELLED`** | **Terminal (User)** | User or candidate cancelled the proposal before execution completed. |
| **`EXPIRED`** | **Terminal (System)** | 15-minute validity window elapsed before human approval or execution pickup. |
| **`FAILED`** | **Terminal (Error)** | GitHub write operations failed, network partitioned, or base HEAD SHA diverged. Safe rollback completed. |

### 2.2 Formal State Transition Table

```
           +---------------------------------------------+
           |                                             |
           v                                             |
      [ PENDING ] -------------> [ REJECTED ] (Terminal) |
        |   |   \                                        |
        |   |    +-------------> [ CANCELLED ] (Terminal)|
        |   |                                            |
        |   +------------------> [ EXPIRED ] (Terminal)  |
        v                                                |
      [ APPROVED ] ------------> [ CANCELLED ] (Terminal)|
        |   \                                            |
        |    +-----------------> [ EXPIRED ] (Terminal)  |
        v                                                |
      [ EXECUTING ] -----------> [ FAILED ] (Terminal)---+
        |
        v
      [ EXECUTED ] (Terminal)
```

| Transition ID | From State | To State | Trigger / Actor | Preconditions | Postconditions & Side Effects | Audit Event |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T-01** | `[NEW]` | `PENDING` | System (`propose_action`) | Valid `ProjectImprovementProposal`, valid `resourceId`, valid `expectedHeadSha`, valid `tenantId` | Ticket persisted; HMAC-SHA256 generated; `expires_at = NOW() + 15m` | `approval.ticket_created` |
| **T-02** | `PENDING` | `APPROVED` | Human User (`confirm_action`) | Session tenant matches ticket; User role $\in$ `{OWNER, MEMBER}`; `Date.now() <= expires_at`; valid HMAC | `approved_by_user_id = user.id`, `approved_at = NOW()` | `approval.ticket_approved` |
| **T-03** | `PENDING` | `REJECTED` | Human User (`reject_action`) | Session tenant matches ticket; User role $\in$ `{OWNER, MEMBER}`; `rejection_reason` provided | `rejection_reason` recorded; terminal lock | `approval.ticket_rejected` |
| **T-04** | `PENDING` | `CANCELLED` | Human User (`cancel_action`) | Session tenant matches ticket; User is proposal owner or `OWNER` | Ticket marked CANCELLED; terminal lock | `approval.ticket_cancelled` |
| **T-05** | `PENDING` | `EXPIRED` | System (Lazy query or Sweeper) | `NOW() > expires_at` and status is `PENDING` | Ticket marked EXPIRED; terminal lock | `approval.ticket_expired` |
| **T-06** | `APPROVED` | `EXECUTING` | Execution Worker (P9-003) | Atomic row lock (`SELECT FOR UPDATE`); `consumed_at IS NULL`; `latestHeadSha === expectedHeadSha` | `status = EXECUTING`, `consumed_at = NOW()`, `idempotency_key` locked | `approval.execution_started` |
| **T-07** | `APPROVED` | `CANCELLED` | Human User (`cancel_action`) | Session tenant matches ticket; ticket has not entered `EXECUTING` | Ticket marked CANCELLED; terminal lock | `approval.ticket_cancelled` |
| **T-08** | `APPROVED` | `EXPIRED` | System | `NOW() > approved_at + 5m` and execution not started | Ticket marked EXPIRED; terminal lock | `approval.ticket_expired` |
| **T-09** | `EXECUTING` | `EXECUTED` | Execution Worker (P9-003) | Branch, commit, and draft PR successfully created on GitHub | `executed_at = NOW()`, `execution_result = { prUrl, prNumber, branch, sha }` | `approval.execution_completed` |
| **T-10** | `EXECUTING` | `FAILED` | Execution Worker (P9-003) | GitHub write error, network timeout, or optimistic lock mismatch | `failure_reason` recorded; non-destructive rollback executed | `approval.execution_failed` |

### 2.3 Strict State Invariants
1. **Immutability of Terminal States**: Once a ticket reaches `EXECUTED`, `REJECTED`, `CANCELLED`, `EXPIRED`, or `FAILED`, no further transitions or modifications are possible.
2. **Single-Use Consumption**: A ticket can be transitioned to `EXECUTING` exactly once via atomic compare-and-set (`consumed_at IS NULL`).
3. **Execution Window Ceiling**: An approved ticket must be executed within 5 minutes of approval, or it expires to prevent stale Git base branch mutations.
4. **Zero AI Self-Approval**: The state machine strictly verifies that `approved_by_user_id` corresponds to an authenticated human user context (`McpRequestContext.userId` / authenticated session cookie) and never an AI agent or synthetic task.

---

## 3. Database Schema Design & Migration Strategy

### 3.1 Drizzle ORM Table Schema (`action_approval_tickets`)

The table will be defined in `src/db/schema.js` and migrated to PostgreSQL via Drizzle Kit:

```typescript
import { pgTable, pgEnum, uuid, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants, users, candidates, resourceConnections } from './schema.js';

export const approvalTicketStatusEnum = pgEnum('approval_ticket_status', [
  'PENDING',
  'APPROVED',
  'EXECUTING',
  'EXECUTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
]);

export const actionApprovalTickets = pgTable(
  'action_approval_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id').notNull().references(() => resourceConnections.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id').notNull(),

    // Action Parameters & Git Constraints
    actionType: text('action_type').notNull().default('PROJECT_IMPROVEMENT_PR'),
    repositoryName: text('repository_name').notNull(),
    baseBranch: text('base_branch').notNull().default('main'),
    targetBranch: text('target_branch').notNull(),
    expectedHeadSha: text('expected_head_sha').notNull(),

    // Cryptographic Binding & Integrity
    patchFingerprint: text('patch_fingerprint').notNull(),
    patchSummary: jsonb('patch_summary').notNull(), // { fileCount, totalDiffLines, expectedFiles: [] }
    hmacSignature: text('hmac_signature').notNull(),

    // State Machine & Audit Details
    status: approvalTicketStatusEnum('status').notNull().default('PENDING'),
    rejectionReason: text('rejection_reason'),
    failureReason: text('failure_reason'),

    // Human Approval
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    // Execution Tracking
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key'),
    executionResult: jsonb('execution_result'), // { prUrl, prNumber, branchName, commitSha }

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    tenantStatusIdx: index('idx_approval_tickets_tenant_status').on(table.tenantId, table.status),
    candidateIdx: index('idx_approval_tickets_candidate').on(table.candidateId),
    resourceIdx: index('idx_approval_tickets_resource').on(table.resourceId),
    expiresAtIdx: index('idx_approval_tickets_expires_at').on(table.expiresAt),
    idempotencyUq: uniqueIndex('uq_approval_tickets_idempotency')
      .on(table.tenantId, table.idempotencyKey),
  })
);
```

---

## 4. Cryptographic Binding & Tamper Resistance

### 4.1 HMAC-SHA256 Ticket Payload Canonicalization

To ensure that an approved ticket cannot be transferred to another repository, branch, patch, or tenant, the ticket is signed with an HMAC-SHA256 signature calculated over a strict canonical string:

```javascript
/**
 * Canonical format for ticket HMAC generation and validation:
 * V1|<tenantId>|<userId>|<candidateId>|<resourceId>|<proposalId>|<repoLower>|<baseBranch>|<targetBranch>|<expectedHeadSha>|<patchFingerprint>|<expiresAtIso>
 */
export function buildCanonicalTicketPayload(ticket) {
  return [
    'V1',
    ticket.tenantId,
    ticket.userId,
    ticket.candidateId,
    ticket.resourceId,
    ticket.proposalId,
    ticket.repositoryName.toLowerCase().trim(),
    ticket.baseBranch.trim(),
    ticket.targetBranch.trim(),
    ticket.expectedHeadSha.toLowerCase().trim(),
    ticket.patchFingerprint.toLowerCase().trim(),
    new Date(ticket.expiresAt).toISOString(),
  ].join('|');
}
```

### 4.2 Key Derivation & Multi-Tenant Separation

- **Master Secret**: Loaded from `ACTION_APPROVAL_HMAC_SECRET` (minimum 32 bytes).
- **Per-Tenant Subkey Derivation**: Computed using HKDF-SHA256 with `salt = tenantId` and `info = 'antigravity:action_approval:v1'`.
- **Zero Plaintext Secrets in Database**: The signature stored in the database is only valid if computed with the tenant-derived key. An attacker with read access to the database cannot forge signatures for modified payloads.

---

## 5. Human Approval Interface & Presentation Contract

When a human user is prompted to approve an `ActionApprovalTicket` (via Web UI, CLI, or IDE modal), the system presents a structured preview with zero ambiguous fields:

```typescript
interface HumanApprovalPresentation {
  ticketId: string;
  repository: string; // "vishu1803/job-tracker-api"
  baseBranch: string; // "main"
  targetBranch: string; // "feat/career-hub-redis-8f3a12bc"
  expectedHeadSha: string; // "9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a"
  targetSkills: string[]; // ["Redis"]
  rationale: string;
  architecturalChange: string;
  filesToModify: Array<{
    path: string;
    operation: 'CREATE' | 'MODIFY' | 'DELETE';
    diffLinesCount: number;
  }>;
  verificationPlan: {
    buildInstructions: string;
    testCommands: string[];
    expectedOutcomes: string[];
    rollbackAdvice: string;
  };
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  timeRemainingSeconds: number;
}
```

---

## 6. Concurrency, Replay Protection & Idempotency

### 6.1 Database Transaction Flow for Approval (`approveTicket`)

```sql
BEGIN;

-- 1. Lock ticket row with tenant scoping
SELECT * FROM action_approval_tickets
WHERE id = :ticketId AND tenant_id = :tenantId
FOR UPDATE;

-- 2. Validate state, expiry, and HMAC signature
-- (If expired -> UPDATE status = 'EXPIRED'; COMMIT; throw ApprovalExpiredError)
-- (If not PENDING -> throw InvalidTicketStateError)

-- 3. Atomic state transition
UPDATE action_approval_tickets
SET status = 'APPROVED',
    approved_by_user_id = :approvedByUserId,
    approved_at = NOW(),
    updated_at = NOW()
WHERE id = :ticketId AND tenant_id = :tenantId;

-- 4. Emit audit log inside transaction or immediately upon commit
INSERT INTO audit_logs (tenant_id, user_id, action, ...)
VALUES (:tenantId, :approvedByUserId, 'approval.ticket_approved', ...);

COMMIT;
```

### 6.2 Database Transaction Flow for Execution Pickup (`consumeTicketForExecution`)

```sql
BEGIN;

-- 1. Acquire exclusive lock
SELECT * FROM action_approval_tickets
WHERE id = :ticketId AND tenant_id = :tenantId
FOR UPDATE;

-- 2. Verify status === 'APPROVED' and consumed_at IS NULL
-- 3. Verify NOW() <= approved_at + INTERVAL '5 minutes'

-- 4. Mark EXECUTING
UPDATE action_approval_tickets
SET status = 'EXECUTING',
    consumed_at = NOW(),
    idempotency_key = :idempotencyKey,
    updated_at = NOW()
WHERE id = :ticketId AND tenant_id = :tenantId AND status = 'APPROVED';

COMMIT;
```

---

## 7. Comprehensive Threat Model & Mitigations

| ID | Threat Scenario | Attack Vector | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **T-01** | **Token Theft / Leakage** | Exfiltrating GitHub write tokens from memory or database. | Ephemeral tokens generated on-the-fly scoped only to target repo; never returned to AI or client; scrubbed from audit logs. |
| **T-02** | **Ticket ID Sniffing / Brute Force** | Guessing UUIDv4 ticket ID to confirm unapproved action. | UUIDv4 (122 bits entropy) + strict `tenant_id` WHERE clauses. Mismatches return `404 NOT_FOUND`. |
| **T-03** | **Ticket Replay** | Re-submitting an already executed ticket to trigger duplicate PRs. | Atomic CAS on `consumed_at IS NULL` and transition to `EXECUTED`. Re-use returns `409 Conflict`. |
| **T-04** | **Ticket Parameter Tampering** | Changing `targetBranch` or `repositoryName` in database or payload. | HMAC-SHA256 signature verification over canonical payload fails if any field is modified. |
| **T-05** | **Patch Substitution** | Modifying generated patch files before GitHub write. | `patchFingerprint` HMAC validated against exact file SHA-256 hashes before commit creation. |
| **T-06** | **Cross-Tenant Confused Deputy** | Tenant A confirming or executing a ticket created by Tenant B. | Multi-tenant sovereign query guards (`tenant_id = context.tenantId`) + HKDF tenant-isolated HMAC keys. |
| **T-07** | **Approval Impersonation** | Client passing arbitrary `userId` in approval request. | Authoritative identity extracted solely from verified `McpRequestContext` / session cookie. |
| **T-08** | **Stale Base Branch Mutation** | Base branch (`main`) updated after ticket creation; diff applies on wrong commit. | Optimistic concurrency check (`latestHeadSha === expectedHeadSha`) rejects execution with `409 Conflict`. |
| **T-09** | **Concurrent Confirmation Race** | Two simultaneous HTTP requests confirming the same ticket. | Row-level locking (`SELECT FOR UPDATE`) ensures first request succeeds and second is rejected cleanly. |
| **T-10** | **Prompt Injection / Indirect Injection** | Malicious job description commanding AI to approve its own changes. | AI has zero write authority; state machine requires interactive human confirmation with valid RBAC role. |
| **T-11** | **Malicious Workflow Injection** | Proposal attempting to modify `.github/workflows/*` to steal CI secrets. | P9-001 patch safety engine blocks CI/CD files at generation; P9-002 re-asserts fingerprint integrity. |
| **T-12** | **Database Record Tampering** | Rogue DBA or compromised DB modifying ticket status directly. | HMAC verification at execution time rejects tampered rows lacking a valid signature. |
| **T-13** | **Client Clock Manipulation** | Client skewing clock to revive an expired ticket. | Authoritative PostgreSQL server clock (`NOW()`) governs all expiry comparisons. |
| **T-14** | **Duplicate Execution on Network Retry** | Client retrying `confirm_action` after network timeout. | `idempotency_key` unique index prevents duplicate executions; returns existing PR outcome safely. |
| **T-15** | **Partial Execution Failure** | Network drops after branch creation but before PR creation. | Ticket marked `FAILED`; rollback closes orphan branch; audit log records failure reason. |

---

## 8. Role-Based Access Control (RBAC) Matrix

| Operation | `OWNER` | `MEMBER` | `READONLY` | Unauthenticated |
| :--- | :---: | :---: | :---: | :---: |
| **`createTicket`** (Propose) | Allowed | Allowed (Own candidate) | **Denied (403)** | **Denied (401)** |
| **`getTicket`** (Inspect) | Allowed | Allowed | Allowed | **Denied (401)** |
| **`approveTicket`** (Confirm) | Allowed | Allowed (Own candidate) | **Denied (403)** | **Denied (401)** |
| **`rejectTicket`** (Reject) | Allowed | Allowed (Own candidate) | **Denied (403)** | **Denied (401)** |
| **`cancelTicket`** (Cancel) | Allowed | Allowed (Own candidate) | **Denied (403)** | **Denied (401)** |
| **`consumeTicket`** (Execute) | System Internal | System Internal | **Denied (403)** | **Denied (401)** |

---

## 9. Integration with Future Phase 9 Tasks

```
+-----------------------------------------------------------------------------------------+
|                               PHASE 9 TASK BOUNDARY MATRIX                              |
|                                                                                         |
|  [ P9-001 ] Project Improvement Recommender (COMPLETE)                                 |
|             • Synthesizes proposal & structured file diff                               |
|             • Validates patch safety (max 10 files, 500 lines, no .github/workflows)   |
|             • Emits ProjectImprovementProposal                                          |
|                                                                                         |
|  [ P9-002 ] Action Approval State Machine (THIS ARCHITECTURE / NEXT IMPLEMENTATION)     |
|             • Implements ActionApprovalTicketService & database table                   |
|             • Manages PENDING -> APPROVED -> EXECUTING -> EXECUTED lifecycle            |
|             • Enforces 15m TTL, single-use CAS, HMAC signing, and replay protection     |
|             • ZERO GitHub writes                                                        |
|                                                                                         |
|  [ P9-003 ] GitHub Write Operations (LATER TASK)                                        |
|             • Consumes APPROVED ticket from P9-002                                      |
|             • Implements createBranch, createCommitPatch, createDraftPullRequest        |
|             • Scoped installation tokens only (contents:write, pull_requests:write)     |
|                                                                                         |
|  [ P9-004 ] Default Branch Safety Constraints (LATER TASK)                              |
|             • Enforces write isolation to feat/career-hub-*                             |
|             • Hard throw on any attempt to commit to main/master                        |
|                                                                                         |
|  [ P9-005 ] MCP Write Tools Exposure (LATER TASK)                                       |
|             • Exposes propose_project_improvement & confirm_and_create_pr               |
|                                                                                         |
|  [ P9-006 ] PR Diff Preview & Test Suite Reporting (LATER TASK)                         |
|             • Integrates live diff visualization and test outcome preview               |
+-----------------------------------------------------------------------------------------+
```

---

## 10. Step-by-Step Implementation Sequence for P9-002

1. **Database Schema & Migration**:
   - Add `approvalTicketStatusEnum` and `actionApprovalTickets` table to `src/db/schema.js`.
   - Generate and apply Drizzle migration (`drizzle-kit generate`).
2. **Domain Schemas & Error Types**:
   - Create `src/domain/career/approval-ticket.schemas.js` with Zod schemas (`ApprovalTicketSchema`, `CreateApprovalTicketSchema`, `ApproveTicketRequestSchema`).
   - Add specific error classes in `src/errors/`: `ApprovalTicketNotFoundError`, `ApprovalTicketExpiredError`, `ApprovalTicketStateError`, `StaleHeadShaError`, `InvalidTicketSignatureError`.
3. **Cryptographic Helper Module**:
   - Create `src/security/approval-signer.js` providing `buildCanonicalTicketPayload()`, `signTicketPayload()`, `verifyTicketSignature()`.
4. **Repository Layer**:
   - Create `src/db/repositories/approval-ticket.repository.js` with transactional methods (`createTicket`, `getTicketForUpdate`, `transitionStatusAtomic`, `findExpiredTickets`).
5. **State Machine Service**:
   - Create `src/services/action-approval-ticket.service.js` implementing `createTicket()`, `getTicket()`, `approveTicket()`, `rejectTicket()`, `cancelTicket()`, `consumeTicketForExecution()`, `completeExecution()`, `failExecution()`.
6. **Audit Event Integration**:
   - Wire `McpAuditService` to log canonical events (`approval.ticket_created`, `approval.ticket_approved`, `approval.ticket_rejected`, `approval.ticket_cancelled`, `approval.ticket_expired`).
7. **Comprehensive Test Suites**:
   - Unit tests (`tests/unit/action-approval-ticket.test.js`): State transitions, TTL expiry, replay resistance, HMAC verification, RBAC rules, tamper detection.
   - Integration tests (`tests/integration/action-approval-ticket.test.js`): PostgreSQL transactional row locking, concurrent confirmation contention, multi-tenant isolation, clean DB teardown.

---

## 11. Final Architecture Review Gate Verdict

**Verdict**: **`P9-002A APPROVED`**

The architecture for the Two-Phase Human-in-the-Loop Action Approval State Machine is fully specified, cryptographically sound, and compliant with all project constitutions (`AGENTS.md`, `goal.md`, `project.md`). It provides an impermeable security perimeter before any GitHub write operations can be implemented.

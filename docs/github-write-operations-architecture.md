# Architecture Specification: GitHub Write Operations & Approved PR Creation (P9-003A)

**Document ID**: `ARCH-033`  
**Phase**: `PHASE 9 — Approved GitHub / Project Modification Workflows`  
**Task**: `P9-003A` (Architecture & Security Review)  
**Status**: `APPROVED`  
**Date**: `2026-08-25`  
**Target Implementation**: `P9-003`  

---

## 1. Executive Summary & Trust Boundary Definition

In Phase 9, Tasks `P9-001` and `P9-002` established the advisory **Project Improvement Recommender** and the **Two-Phase Human-in-the-Loop Action Approval State Machine** (`ActionApprovalTicketService`).

This specification (`ARCH-033`) defines the architectural, security, and GitHub REST API integration contracts for **Task P9-003**: **GitHub Write Operations** (`GitHubWriteService`).

Task `P9-003` is the **first phase that performs live write mutations against external GitHub repositories**. It is governed by a strict Zero-Trust model:

> **Core Invariant**: The GitHub Write Service CANNOT be invoked directly by AI clients, HTTP routes, or background workers. It requires a valid, unexpired, single-use, cryptographically verified `ActionApprovalTicket` in `APPROVED` status, consumed atomically via `ActionApprovalTicketService.consumeTicketForExecution()`.

```
+---------------------------------------------------------------------------------------------------+
|                                  P9-003 WRITE EXECUTION PIPELINE                                  |
|                                                                                                   |
|  [ Execution Trigger ] --------> Caller invokes GitHubWriteService.executeApprovedTicket()         |
|           |                                                                                       |
|           v                                                                                       |
|  [ Step 1: Authorization Gate ]                                                                   |
|           |                      • Calls ActionApprovalTicketService.consumeTicketForExecution()  |
|           |                      • Validates tenantId, HMAC-SHA256 signature, 5m execution window |
|           |                      • SELECT FOR UPDATE & Atomic CAS: APPROVED -> EXECUTING          |
|           v                                                                                       |
|  [ Step 2: Scoped Token Minting ]                                                                 |
|           |                      • Resolves GitHub installation ID from DB connection record      |
|           |                      • Requests installation token from GitHub App Auth Manager       |
|           |                      • Scopes: repositories: [targetRepo], contents: write, pr: write  |
|           v                                                                                       |
|  [ Step 3: Base HEAD Verification (Optimistic Concurrency) ]                                      |
|           |                      • GET /repos/{owner}/{repo}/git/ref/heads/{baseBranch}           |
|           |                      • Verifies currentHeadSha === ticket.expectedHeadSha             |
|           |                      • (If diverged: FAIL CLOSED with 409 StaleHeadShaError)          |
|           v                                                                                       |
|  [ Step 4: Atomic Multi-File Tree & Commit (Git Data API) ]                                       |
|           |                      • POST /repos/{owner}/{repo}/git/trees (base_tree + file blobs)  |
|           |                      • POST /repos/{owner}/{repo}/git/commits (tree + parent commit)   |
|           v                                                                                       |
|  [ Step 5: Feature Branch Ref Creation ]                                                          |
|           |                      • POST /repos/{owner}/{repo}/git/refs (refs/heads/feat/...)      |
|           v                                                                                       |
|  [ Step 6: Draft Pull Request Creation ]                                                          |
|           |                      • POST /repos/{owner}/{repo}/pulls (draft: true, head, base)     |
|           |                      • Formats sanitized markdown body with skill gap context         |
|           v                                                                                       |
|  [ Step 7: Finalize State & Audit ]                                                               |
|           |                      • Calls ActionApprovalTicketService.completeExecution()         |
|           |                      • Emits audit event: github.pull_request.created                 |
|           v                                                                                       |
|  [ Non-Destructive Rollback on Failure ]                                                          |
|           • If tree/commit fails: no ref created, mark FAILED                                    |
|           • If PR creation fails: DELETE refs/heads/{targetBranch}, mark FAILED                   |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. GitHub REST API Strategy: Git Data API vs. Contents API

### 2.1 Comparative Analysis

| Dimension | Option A: Contents API (`PUT /contents/{path}`) | Option B: Git Data API (`trees` $\rightarrow$ `commits` $\rightarrow$ `refs`) |
| :--- | :--- | :--- |
| **Multi-File Atomicity** | **Non-atomic**: Creates 1 commit per file. A 5-file patch generates 5 distinct commits and intermediate broken states. | **Atomic**: Constructs a single new Git tree containing all patch files and creates exactly 1 commit. |
| **Branch Safety** | Requires creating an empty branch ref pointing to base commit before writing files. | Ref creation occurs **after** the commit is created, pointing directly to the final commit SHA. |
| **API Call Volume** | $N$ HTTP calls for $N$ files ($5\times$ rate limit consumption). | Exactly 3 HTTP calls (`POST /git/trees`, `POST /git/commits`, `POST /git/refs`) regardless of file count. |
| **Rollback Complexity** | High: Must revert multiple commits if failure occurs midway. | Low: If tree/commit fails before ref creation, zero GitHub refs exist; no cleanup needed. |
| **Evaluation Verdict** | **REJECTED** | **ACCEPTED (Canonical Architecture)** |

### 2.2 Canonical Git Data API Protocol

1. **Create Git Tree (`POST /repos/{owner}/{repo}/git/trees`)**:
   ```json
   {
     "base_tree": "9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a",
     "tree": [
       {
         "path": "src/services/cache-manager.js",
         "mode": "100644",
         "type": "blob",
         "content": "export class CacheManager { ... }\n"
       },
       {
         "path": "tests/unit/cache-manager.test.js",
         "mode": "100644",
         "type": "blob",
         "content": "import { describe, it } from 'node:test'; ...\n"
       }
     ]
   }
   ```
2. **Create Git Commit (`POST /repos/{owner}/{repo}/git/commits`)**:
   ```json
   {
     "message": "feat(cache): implement Redis caching layer\n\nAddresses missing Redis skill requirement.\n\nCo-authored-by: Antigravity Career Hub <bot@careerhub.antigravity.dev>",
     "tree": "treeShaFromStep1",
     "parents": ["9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a"]
   }
   ```
3. **Create Branch Reference (`POST /repos/{owner}/{repo}/git/refs`)**:
   ```json
   {
     "ref": "refs/heads/feat/career-hub-redis-8f3a12bc",
     "sha": "commitShaFromStep2"
   }
   ```
4. **Create Draft Pull Request (`POST /repos/{owner}/{repo}/pulls`)**:
   ```json
   {
     "title": "[Career Hub] Implement Redis Caching Layer",
     "head": "feat/career-hub-redis-8f3a12bc",
     "base": "main",
     "draft": true,
     "body": "### Proposed Project Enhancement\n\n..."
   }
   ```

---

## 3. Least-Privilege GitHub App Permission & Token Scoping

### 3.1 GitHub App Permissions Matrix

| Permission Category | Scope Level | Required for P9-003? | Justification |
| :--- | :---: | :---: | :--- |
| **`Metadata`** | `read` | **YES** | Mandatory for all GitHub Apps to resolve repository endpoints. |
| **`Contents`** | `write` | **YES** | Required to create tree blobs, commits, and branch refs. |
| **`Pull requests`** | `write` | **YES** | Required to open draft PRs and close them on rollback. |
| `Administration` | `none` | **PROHIBITED** | Zero permission to modify repository settings, collaborators, or branch rules. |
| `Workflows` | `none` | **PROHIBITED** | Physically blocks AI from modifying `.github/workflows/*` or CI configurations. |
| `Secrets` | `none` | **PROHIBITED** | Zero access to repository environment variables or Actions secrets. |
| `Actions` | `none` | **PROHIBITED** | Zero permission to trigger or cancel CI/CD workflow runs. |

### 3.2 Dynamic Installation Token Scoping

When minting tokens via `GitHubAppAuthManager.getInstallationToken()`, the execution service passes:
- `installationId`: Trusted installation ID resolved from database `resource_connections`.
- `repositories`: `[targetRepositoryName]` (strictly single-repository scope).
- `permissions`: `{ contents: 'write', pull_requests: 'write' }`.

This ensures the generated token (`ghs_*`) cannot be used to read or write to any other repository in the user's GitHub organization.

---

## 4. Concurrency, Optimistic Locking & Idempotency

### 4.1 Base Branch HEAD SHA Verification (`expectedHeadSha`)
Before issuing any mutation calls, `GitHubWriteService` retrieves the live base branch commit:
```http
GET /repos/{owner}/{repo}/git/ref/heads/{baseBranch}
```
- If `liveSha.toLowerCase() !== ticket.expectedHeadSha.toLowerCase()`:
  - Repository has been updated since proposal generation.
  - Transition ticket to `FAILED` with `failureReason: 'STALE_BASE_HEAD_SHA'`.
  - Throw `StaleHeadShaError` (`409 Conflict`).
  - **No silent rebase or force push is ever permitted**.

### 4.2 Idempotency & Duplicate Execution Protection
- The execution operation generates or accepts an `idempotencyKey`.
- `ActionApprovalTicketService.consumeTicketForExecution` records the key in the database with a unique index constraint.
- If a network retry arrives with the same `idempotencyKey`, the service safely inspects whether a branch or PR already exists on GitHub matching `ticket.targetBranch`:
  - If PR already exists $\rightarrow$ returns existing PR outcome (`{ prUrl, prNumber, branchName, commitSha }`).
  - If branch exists but PR does not $\rightarrow$ completes PR creation and finalizes execution.

---

## 5. Non-Destructive Rollback & Failure Recovery

| Failure Point | System State | Rollback Action | Terminal Ticket State |
| :--- | :--- | :--- | :---: |
| **Base HEAD Mismatch** | No writes performed | None | `FAILED` |
| **Tree / Commit Creation Fails** | In-memory only; no refs created on GitHub | None | `FAILED` |
| **Branch Ref Creation Fails** | Commit object created in Git DAG (unreferenced) | None (orphaned commit collected by Git GC) | `FAILED` |
| **PR Creation Fails** | Feature branch exists on GitHub | `DELETE /repos/{owner}/{repo}/git/refs/heads/{targetBranch}` | `FAILED` |
| **Network Timeout After PR** | PR and branch exist on GitHub | Idempotent lookup resolves PR URL; mark `EXECUTED` | `EXECUTED` |

> [!IMPORTANT]
> **Rollback Safety Boundary**: Rollback operations are strictly confined to deleting the specific feature branch (`feat/career-hub-*`) created during the current operation. Rollback NEVER touches default branches (`main`, `master`), never executes force resets (`git reset --hard`), and never rewrites commit history.

---

## 6. PR Body Template & Content Injection Sanitization

To prevent indirect prompt injection or misleading UI formatting from untrusted job descriptions, the PR body is wrapped in a structured, sanitized template:

```markdown
## [Career Hub] Project Improvement Proposal

**Target Skill(s)**: `Redis`  
**Skill Gap Status**: `MISSING` (Identified from target job requirements)  
**Confidence Score**: `95%`  
**Action Approval Ticket**: `c29f4a18-9a3d-4c3d-b4ef-123456789abc`

---

### Architectural Rationale
Addresses missing job requirement for **Redis** by introducing a modular, test-backed caching service.

### Modified Files (2)
- `src/services/cache-manager.js` (CREATE, +35 lines)
- `tests/unit/cache-manager.test.js` (CREATE, +25 lines)

---

### Verification & Testing Instructions
```bash
# 1. Install dependencies
npm install ioredis

# 2. Run unit tests
npm test
```

---
> ⚠️ **Draft Pull Request Notice**: This Pull Request was generated by Antigravity Career Hub with explicit candidate approval. Review all code changes carefully before merging into your default branch.
```

---

## 7. Comprehensive Security Threat Model & Mitigations

| ID | Threat Scenario | Attack Vector | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **T-01** | **Token Exfiltration** | Write tokens leaked via error logs or API responses. | Ephemeral tokens generated in backend memory; scrubbed by `SecretScrubber` and audit logger. |
| **T-02** | **Cross-Tenant Repository Modification** | Tenant A executing write against Tenant B's repository. | Sovereign tenant chain check (`context.tenantId === ticket.tenantId === resource.tenantId`) + single-repo token scoping. |
| **T-03** | **Approval Ticket Bypass** | Direct write API call without ticket approval. | `GitHubWriteService` requires `ActionApprovalTicketService.consumeTicketForExecution()` as mandatory entry point. |
| **T-04** | **Stale Base Commit Mutation** | `main` branch advances after proposal; diff applies on wrong commit. | Optimistic concurrency check (`liveSha === ticket.expectedHeadSha`) rejects execution with `409 Conflict`. |
| **T-05** | **Default Branch Overwrite** | Modifying `main` or `master` directly. | Code enforces regex `^feat/career-hub-[a-z0-9-]+$`; throws `ForbiddenOperationError` on default branch targets. |
| **T-06** | **Partial Multi-File Commit State** | Network drops midway through multi-file patch. | Low-level Git Data API creates entire tree and single commit atomically before branch ref creation. |
| **T-07** | **Duplicate PR / Branch Collision** | Client retries `confirm_action` rapidly. | PostgreSQL row-level locks (`SELECT FOR UPDATE`) + `idempotencyKey` ensure single-winner execution. |
| **T-08** | **CI/CD Workflow Hijacking** | Patch attempts to write `.github/workflows/ci.yml` to steal secrets. | Blocked by P9-001 patch safety engine and zero `workflows` permission on GitHub App. |
| **T-09** | **Secret Insertion in Code** | Proposal inserts hard-coded API keys in repository files. | Re-scanned via `SecretScrubber` before tree blob creation. |
| **T-10** | **GitHub API Secondary Rate Limits** | Rapid PR creations trigger HTTP 403/429 abuse limits. | `GitHubRateLimiter` bucket tracking + jittered exponential backoff. |
| **T-11** | **Prompt Injection in PR Markdown** | Malicious job description markdown breaks PR UI or embeds phishing links. | Markdown escaping & structured safe templating. |
| **T-12** | **Compromised Resource Connection** | Forged `resourceId` passed to write service. | Verified against authenticated database connection record with tenant matching. |
| **T-13** | **Orphaned Branch Left on Failure** | PR creation fails after branch ref created. | Automated non-destructive cleanup deletes `feat/career-hub-*` ref. |
| **T-14** | **Unauthenticated Caller** | Anonymous request to write endpoint. | Requires authenticated `MEMBER` or `OWNER` session context (401/403). |
| **T-15** | **Force Push History Tampering** | Overwriting existing branch history. | Code strictly prohibits `force: true` in ref update calls. |

---

## 8. Boundaries Matrix Across Phase 9 Tasks

```
+-----------------------------------------------------------------------------------------+
|                               PHASE 9 TASK BOUNDARY MATRIX                              |
|                                                                                         |
|  [ P9-001 ] Project Improvement Recommender (COMPLETE & VERIFIED)                       |
|             • Synthesizes advisory proposal & structured diff                           |
|             • Enforces patch safety limits & secret scanning                            |
|                                                                                         |
|  [ P9-002 ] Action Approval State Machine (COMPLETE & VERIFIED)                         |
|             • Manages PENDING -> APPROVED -> EXECUTING -> EXECUTED lifecycle            |
|             • Enforces 15m TTL, single-use CAS, and cryptographic HMAC signing          |
|                                                                                         |
|  [ P9-003 ] GitHub Write Operations (THIS ARCHITECTURE / NEXT IMPLEMENTATION)           |
|             • Implements GitHubWriteService consuming APPROVED tickets                  |
|             • Scoped installation tokens (contents: write, pull_requests: write)        |
|             • Git Data API (trees -> commits -> refs -> draft pulls)                    |
|             • Base HEAD SHA verification & non-destructive rollback                     |
|                                                                                         |
|  [ P9-004 ] Execution Safety Hardening (LATER TASK)                                     |
|             • Dedicated standalone safety gate validating branches and files            |
|             • Hard exception on any non-feat branch mutation attempt                    |
|                                                                                         |
|  [ P9-005 ] MCP Write Tools Exposure (LATER TASK)                                       |
|             • Exposes propose_project_improvement & confirm_and_create_pr               |
|                                                                                         |
|  [ P9-006 ] PR Diff Preview & Test Reporting (LATER TASK)                               |
|             • Visual diff rendering and test report generation                          |
+-----------------------------------------------------------------------------------------+
```

---

## 9. Live GitHub Sandbox Testing Strategy

For live sandbox testing, the test suite will target a dedicated test repository:
- **Sandbox Repository**: `vishu1803/Ai-job-mcp` (or designated test repo).
- **Execution Scope**:
  1. Mint ephemeral installation token scoped to sandbox repo.
  2. Verify base HEAD SHA on `main`.
  3. Create single atomic commit on `feat/career-hub-test-[timestamp]`.
  4. Create Draft PR against `main`.
  5. Verify PR created in Draft state.
  6. **Automated Teardown**: Close Draft PR and delete `refs/heads/feat/career-hub-test-[timestamp]`.
  7. Confirm `main` branch remains 100% untouched.

---

## 10. Step-by-Step Implementation Sequence for P9-003

1. **GitHub App Token Scoping Enhancement**:
   - Update `GitHubAppAuthManager.getInstallationToken()` in `src/connectors/github/auth.js` to accept `options.permissions` (e.g. `{ contents: 'write', pull_requests: 'write' }`).
   - Update `buildTokenCacheKey` in `src/connectors/github/token-cache.js` to incorporate requested permissions into the cache key.
2. **GitHub Connector Write Methods**:
   - Add `createGitTree()`, `createGitCommit()`, `createGitRef()`, `deleteGitRef()`, `createDraftPullRequest()`, and `getBranchHeadSha()` to `GitHubAppConnector` (`src/connectors/github/github-connector.js`).
3. **GitHub Write Service Orchestration**:
   - Create `src/services/github-write.service.js`:
     - Consumes `ActionApprovalTicketService.consumeTicketForExecution()`.
     - Verifies `expectedHeadSha`.
     - Orchestrates Git tree, commit, ref, and draft PR creation.
     - Finalizes ticket via `completeExecution()` or `failExecution()`.
     - Emits canonical audit events.
4. **Comprehensive Test Suites**:
   - Unit tests (`tests/unit/github-write.service.test.js`): Mocked GitHub API calls, tree construction, commit message formatting, HEAD mismatch rejection, rollback on partial failure.
   - Integration tests (`tests/integration/github-write.service.test.js`): Full ticket consumption lifecycle with mocked GitHub endpoints, multi-tenant isolation, and clean DB teardown.
   - Live Sandbox tests (`tests/integration/live/github-write.live.test.js`): Real GitHub App write, draft PR creation, and automated branch deletion cleanup against test repository.

---

## 11. Final Architecture Review Gate Verdict

**Verdict**: **`P9-003A APPROVED`**

The architecture for GitHub Write Operations is fully specified, adheres to least-privilege token scoping, enforces single-commit atomic patch application via the Git Data API, provides non-destructive rollback, and preserves an impassable authorization boundary via `ActionApprovalTicketService`.

# ARCH-042: ChatGPT Consequential Action Execution & Human-in-the-Loop Write Safety Architecture Specification

**Status**: APPROVED  
**Security Level**: Critical Code Write Execution & Consequential Action Safety  
**Target AI Client**: OpenAI ChatGPT (ChatGPT Web, ChatGPT Desktop, Developer Mode, Custom Actions)  
**Governing Standards**: Model Context Protocol (MCP) Streamable HTTP Spec 2026-07-28, RFC 8707, RFC 9700 (OAuth 2.1), GitHub Git Data API  
**Governing ADR**: ADR-063 (`docs/decisions.md`)  
**Prerequisite Architecture**: ARCH-031 (`docs/github-project-modification-architecture.md`), ARCH-032 (`docs/approval-state-machine-architecture.md`), ARCH-034 (`docs/github-write-safety-architecture.md`), ARCH-036 (`docs/pr-diff-preview-test-reporting-architecture.md`), ARCH-040 (`docs/chatgpt-mcp-connector-architecture.md`)  

---

## 1. Executive Summary & Strategic Context

When connecting OpenAI ChatGPT to external repositories via the Model Context Protocol, the highest risk surface is **consequential code modification** (creating branches, committing files, opening pull requests). Without rigorous server-side safety barriers, an AI agent could hallucinate harmful code changes, introduce supply-chain vulnerabilities, overwrite critical configuration files, or push unauthorized commits directly to default branches.

**ARCH-042** defines the definitive architectural and safety specification for consequential actions executed through ChatGPT. It enforces:
1. **Zero Raw Write Primitives**: ChatGPT receives zero low-level write tools (`write_file`, `create_commit`, `push_branch`, `merge_pr` are strictly prohibited).
2. **Two-Phase Human Approval State Machine**: All proposed changes flow through an immutable `ActionApprovalTicket` with explicit user confirmation.
3. **Anti-AI Self-Approval Stopping Protocol**: `propose_project_improvement` outputs structured review payloads with explicit instructions mandating human intervention before `confirm_and_create_pr` can be called.
4. **Structured Diff Previews & Cryptographic Fingerprinting**: Diffs are formatted in unified format with line bounds, and patches are cryptographically fingerprinted using SHA-256 to prevent post-approval tampering.
5. **Truthful Test Execution Reporting**: Test lifecycle states (`NOT_RUN`, `PASSED`, `FAILED`) are reported truthfully with credential-stripped sandboxing.
6. **Centralized Safety Kernel (`GitHubWriteSafetyService`)**: Dynamic default branch protection, strict `feat/career-hub-*` branch whitelisting, binary filtering, and entropy secret scanning.

```
+---------------------------------------------------------------------------------------------------------+
|                                  CHATGPT WRITE SAFETY WORKFLOW TOPOLOGY                                 |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|   +-------------------------------------------------------------------------------------------------+   |
|   |   PHASE 1: PROPOSAL & REVIEW (Read-Only State Creation)                                         |   |
|   |                                                                                                 |   |
|   |   ChatGPT calls: propose_project_improvement({ resourceId, missingSkill, candidateGoals })      |   |
|   |                                                                                                 |   |
|   |   Career Hub Backend:                                                                           |   |
|   |   1. Computes legitimate architectural enhancement for missing skill                            |   |
|   |   2. Generates unified diff preview (clamped <= 4000 chars/file, <= 25 KB review ceiling)       |   |
|   |   3. Computes immutable patch SHA-256 fingerprint                                               |   |
|   |   4. Generates truthful test execution report (lifecycle: NOT_RUN default)                      |   |
|   |   5. Creates PENDING ActionApprovalTicket (15-minute TTL, bound to tenantId & userId)           |   |
|   |   6. Returns Review Payload with MANDATORY HUMAN STOPPING PROTOCOL INSTRUCTIONS                 |   |
|   +-----------------------------------------------+-------------------------------------------------+   |
|                                                   |                                                     |
|                                                   v                                                     |
|   +-------------------------------------------------------------------------------------------------+   |
|   |   HUMAN-IN-THE-LOOP STOPPING PROTOCOL (User Interface Gate)                                     |   |
|   |                                                                                                 |   |
|   |   ChatGPT displays:                                                                             |   |
|   |   - What will change (files, line additions/deletions)                                          |   |
|   |   - Why (targeted skill gap and architectural rationale)                                        |   |
|   |   - Diff preview & security warnings (dependencies added, config touched)                       |   |
|   |   - Approval Ticket ID & Expiration countdown                                                    |   |
|   |   - ASKS USER: "Do you approve creating branch feat/career-hub-... and opening a Draft PR?"     |   |
|   |                                                                                                 |   |
|   |   * USER EXPLICITLY RESPONDS: "Yes, I approve"                                                  |   |
|   +-----------------------------------------------+-------------------------------------------------+   |
|                                                   |                                                     |
|                                                   v                                                     |
|   +-------------------------------------------------------------------------------------------------+   |
|   |   PHASE 2: CONFIRMATION & SAFE EXECUTION                                                        |   |
|   |                                                                                                 |   |
|   |   ChatGPT calls: confirm_and_create_pr({ ticketId: "uuid", confirmed: true })                   |   |
|   |                                                                                                 |   |
|   |   Career Hub Backend (Safety Kernel Execution):                                                 |   |
|   |   1. Validates OAuth token matches ticket.tenantId and ticket.userId (404 default-deny)         |   |
|   |   2. Atomically transitions ticket PENDING -> APPROVED -> EXECUTING (SELECT FOR UPDATE)         |   |
|   |   3. Verifies repository default branch (e.g. main) is NOT target branch                        |   |
|   |   4. Asserts target branch matches refs/heads/feat/career-hub-* pattern                         |   |
|   |   5. Verifies live base branch HEAD SHA matches expectedHeadSha (409 on drift)                  |   |
|   |   6. Verifies patch SHA-256 fingerprint matches approved ticket fingerprint                     |   |
|   |   7. Executes Git Data API: create tree -> create commit -> create ref -> create Draft PR       |   |
|   |   8. Transitions ticket to EXECUTED and writes immutable audit record                           |   |
|   |   9. Returns Draft PR URL and branch metadata to ChatGPT                                        |   |
|   +-------------------------------------------------------------------------------------------------+   |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Anti-AI Self-Approval Stopping Protocol

A critical vulnerability in autonomous AI agents is "self-approval" — where an AI agent generates a proposal and immediately calls the confirmation tool in the same turn without waiting for human user input.

### 2.1 Stopping Protocol Formatting
When `propose_project_improvement` succeeds, the tool response includes an explicit top-level `instructions` block:

```json
{
  "ticketId": "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
  "status": "PENDING_USER_APPROVAL",
  "expiresAt": "2026-08-26T10:45:00.000Z",
  "review": {
    "targetRepository": "vishu1803/Ai-job-mcp",
    "targetBranch": "feat/career-hub-fastapi-migration",
    "baseBranch": "main",
    "skillGapAddressed": "fastapi",
    "summary": "Adds FastAPI router and health check endpoint to demonstrate async API design.",
    "files": [
      {
        "path": "src/api/fastapi_app.py",
        "operation": "CREATE",
        "linesAdded": 42,
        "linesDeleted": 0,
        "diffPreview": "@@ -0,0 +1,42 @@\n+from fastapi import FastAPI\n+app = FastAPI()\n..."
      }
    ],
    "patchFingerprint": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "testReport": {
      "status": "NOT_RUN",
      "summary": "Static code proposal. Tests not executed in sandbox.",
      "tests": []
    },
    "securityWarnings": []
  },
  "instructions": "STOP! Do NOT call confirm_and_create_pr automatically. Present the above diff preview, target branch, and file changes to the user. Wait for the user's explicit confirmation before proceeding."
}
```

### 2.2 Server-Side Stopping Invariant
Even if an AI client ignores the prompt stopping instruction and immediately invokes `confirm_and_create_pr`, the server enforces:
1. **Explicit Confirmation Argument**: `confirm_and_create_pr` requires `{ ticketId, confirmed: true }`.
2. **Audit Logging of Caller**: The user identity (`userId`, `tenantId`, `clientId: 'chatgpt-web'`) is permanently attached to the approval audit log.
3. **No Patch Mutation**: `confirm_and_create_pr` accepts ZERO patch code arguments; it executes strictly the pre-hashed patch stored in the database.

---

## 3. Threat Model & Consequential Action Defenses

| Threat ID | Threat Description | Severity | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **T-01** | AI Overwrites Main / Master Branch | Critical | Dynamic default branch inspection via GitHub API. Target branches equal to `default_branch` throw `ProtectedDefaultBranchError`. |
| **T-02** | Stale Base Branch Race Condition | High | Compares `expectedHeadSha` with live repo HEAD SHA. Divergence throws `409 Conflict` (`STALE_HEAD_SHA`). |
| **T-03** | Malicious CI/CD Workflow Hijack | Critical | Blocklist `.github/workflows/*`, `.circleci/*`, GitHub Actions configs from AI modification. Violations throw `WorkflowModificationError`. |
| **T-04** | Post-Approval Patch Tampering | Critical | Pre-computed SHA-256 patch fingerprint verified before execution. Tampering throws `PatchPolicyViolationError`. |
| **T-05** | Credential Exfiltration via Patch | High | Pre-execution Shannon entropy scanning and regex secret detection. Violations throw `SecretDetectedError`. |
| **T-06** | Cross-Tenant Ticket Hijacking | Critical | Ticket lookups enforce `tenant_id = req.auth.tenantId`. Foreign lookups throw `404 Not Found`. |
| **T-07** | Auto-Merging Pull Requests | High | System creates strictly Draft Pull Requests (`draft: true`). Merging pull requests is permanently out of scope. |
| **T-08** | Directory Traversal in Diff Paths | High | Strict POSIX path normalization rejects `..`, leading slashes, and null bytes (`INVALID_FILE_PATH`). |

---

## 4. Verification and Acceptance

- Verified via unit tests (`tests/unit/mcp-write-tools.test.js`, `tests/unit/github-write-safety.service.test.js`).
- Verified via integration tests (`tests/integration/chatgpt-mcp-connector.test.js`).
- Status: **APPROVED (ARCH-042 / ADR-063)**.

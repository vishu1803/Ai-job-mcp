# Antigravity Career Hub — Onboarding Walkthrough

**Step-by-Step Practical Guide for New Candidates & AI Integrations**  
*Document Version: 1.0.0 (Phase 13 / P13-005)*

---

## 1. Operating Environment Overview

This walkthrough guides you through setting up and utilizing Career Hub across two deployment contexts:

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE A: Local & Demo Environment (Available & Verified Today)        │
│ • Local Fastify server (`http://127.0.0.1:3000`)                       │
│ • Dedicated hermetic test database (`career_hub_beta_p13_004_*`)       │
│ • Synthetic candidate identities (`*.test` email domains)              │
│ • Full 16-tool MCP catalog testable via local test runner              │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE B: Public Staging / Beta Environment (Blocked on Custom Domain)  │
│ • Persistent Custom Domain (`https://staging.careerhub.ai`)            │
│ • Cloudflare Named Tunnel (`cloudflared`)                              │
│ • Live GitHub App OAuth redirects & webhook deliveries                 │
│ • Live Claude Desktop / ChatGPT Custom GPT connector setup             │
└────────────────────────────────────────────────────────────────────────┘
```

> [!NOTE]
> **Environment Accuracy Notice**: Steps requiring external browser redirection or third-party webhooks are marked with `BLOCKED UNTIL PUBLIC STAGING`. In the current development environment, all business logic, isolation boundaries, and AI integrations are `VERIFIED` hermetically via automated integration suites (`tests/integration/synthetic-beta-p13-004.test.js`).

---

## 2. Step-by-Step Onboarding Walkthrough

---

### Step 1: Create Account

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`BLOCKED UNTIL PUBLIC STAGING`)
* **What the User Does**:
  * *In Public Staging*: Clicks "Sign in with GitHub" on the login page.
  * *In Local/Demo*: Initiates registration via OAuth callback route or runs synthetic test fixture.
* **What the System Does**:
  * Atomically creates a personal `Tenant` (`FREE` tier), `User` record (`role: 'OWNER'`, `status: 'ACTIVE'`), and initial `Candidate` profile in a single transaction.
  * Issues a cryptographically secure session cookie (`__Host-career_hub_session`).
* **What the User Should Expect**: Immediate redirection to the `/onboarding` onboarding wizard with status `REGISTERED`.
* **Common Failure Cases**: GitHub OAuth code expiration or state mismatch (`400 BAD_REQUEST`).
* **Security Notes**: State parameters are cryptographically signed with HMAC-SHA256 and verified against CSRF attacks.

---

### Step 2: Complete Candidate Onboarding

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Fills in baseline profile details: `Display Name` ("Alex Mercer"), `Headline` ("Full-Stack Architect"), and `Target Roles` ("Senior Full-Stack Engineer").
* **What the System Does**:
  * Updates candidate profile with user-authored headline and notes.
  * Maintains strict separation between user narrative and automated evidence.
* **What the User Should Expect**: Confirmation that profile metadata is saved.
* **Common Failure Cases**: Empty display name or invalid role string.
* **Security Notes**: User inputs are sanitized to prevent XSS.

---

### Step 3: Connect GitHub App

* **Phase Availability**: Phase A (`VERIFIED` via fixtures) | Phase B (`BLOCKED UNTIL PUBLIC STAGING`)
* **What the User Does**:
  * Clicks "Connect GitHub" in settings.
  * Grants authorization on GitHub App installation screen.
* **What the System Does**:
  * Captures GitHub App `installation_id`.
  * Encrypts credentials with **AES-256-GCM** using the platform master encryption key before persisting to `resource_connections`.
  * Transitions candidate onboarding state to `RESOURCES_CONNECTED`.
* **What the User Should Expect**: GitHub connection status indicates `ACTIVE` with account username displayed.
* **Common Failure Cases**: User cancels GitHub App installation prompt.
* **Security Notes**: Plaintext tokens are never stored in the database or logged in server telemetry.

---

### Step 4: Select Repositories for Ingestion

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Selects specific repositories to index (e.g., `alex-mercer/react-node-microservices`).
  * Deselects private or non-career repositories to follow the principle of least privilege.
* **What the System Does**:
  * Creates `resources` records (`resourceType: 'REPOSITORY'`) associated with the candidate workspace.
* **What the User Should Expect**: Repository list shows selected repositories in `ACTIVE` status.
* **Common Failure Cases**: Repository is deleted or transferred on GitHub.
* **Security Notes**: Repositories are strictly bound to the authenticated `tenant_id`.

---

### Step 5: Execute Repository Ingestion Pipeline

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Clicks "Scan Repository" or allows automated webhook ingestion to trigger.
* **What the System Does**:
  * Fetches repository file tree.
  * Parses package manifests (`package.json`, `go.mod`, `Cargo.toml`, etc.) and code ASTs.
  * Runs all extracted excerpts through the `SecretScrubber` to purge credentials.
  * Inserts immutable `evidence_items` pinned to commit SHAs.
  * Calculates `candidate_skills` rollups via `SkillRollupCalculator`.
* **What the User Should Expect**: Ingestion progress indicator completes with summary: "15 Evidence Items, 5 Verified Skills extracted".
* **Common Failure Cases**: Repository contains zero supported manifests or has exceeded file size limits (>50 MB).
* **Security Notes**: The parser executes in a sandboxed, read-only process with zero code execution.

---

### Step 6: Inspect Verified Skills

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Navigates to `/candidate/skills` or calls MCP tool `list_verified_skills`.
* **What the System Does**:
  * Returns normalized skills categorized into `LANGUAGE`, `FRAMEWORK`, `DATABASE`, `CLOUD_DEVOPS`, etc., alongside provenance status (`VERIFIED`) and confidence scores.
* **What the User Should Expect**:
  ```json
  [
    { "name": "React", "category": "FRAMEWORK", "provenance": "VERIFIED", "confidence": 0.95 },
    { "name": "PostgreSQL", "category": "DATABASE", "provenance": "VERIFIED", "confidence": 0.90 }
  ]
  ```
* **Common Failure Cases**: Unrecognized proprietary libraries mapped to category `TOOL`.
* **Security Notes**: Only skills derived from authorized repositories are returned.

---

### Step 7: Inspect Project Evidence Provenance

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Clicks on a verified skill or calls MCP tool `inspect_project_evidence(projectId: "...")`.
* **What the System Does**:
  * Retrieves immutable evidence citations showing exact file paths, commit hashes, and code excerpts.
* **What the User Should Expect**:
  ```json
  {
    "skill": "React",
    "evidence": [
      {
        "filePath": "package.json",
        "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "lineRange": { "start": 10, "end": 12 },
        "excerpt": "\"react\": \"^18.2.0\""
      }
    ]
  }
  ```
* **Common Failure Cases**: Commit hash no longer exists if repository history was force-pushed.
* **Security Notes**: Cross-tenant evidence inspection returns `404 NOT_FOUND`.

---

### Step 8: Analyze a Target Job Description

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Pastes target job description text into the analysis tool or invokes MCP `analyze_job_fit`.
* **What the System Does**:
  * Parses JD requirements into canonical skill taxonomy.
  * Matches requirements against candidate evidence graph.
  * Emits ATS Fit Score (0–100) and categorized breakdown (`MATCHED`, `PARTIAL`, `MISSING`, `UNKNOWN`).
* **What the User Should Expect**:
  * Match grade: `EXCELLENT` (Score: 92/100).
  * Matched: React, Node.js, PostgreSQL, Docker.
  * Missing: Kubernetes (High Priority).
* **Common Failure Cases**: Truncated job description missing requirements section.
* **Security Notes**: LLMs are prohibited from altering match scores or hallucinating match statuses.

---

### Step 9: Generate Tailored Resume

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Clicks "Generate Tailored Resume" or calls MCP `generate_tailored_resume`.
* **What the System Does**:
  * Formats verified projects and achievements to emphasize target job requirements.
  * Embeds citation references to code evidence.
  * Tags unverified user claims with `[Unverified User Claim]`.
* **What the User Should Expect**: Rendered Markdown resume ready for export, strictly grounded in authentic code evidence.
* **Common Failure Cases**: Candidate workspace has 0 connected repositories.
* **Security Notes**: Original candidate profile and base resume are never overwritten.

---

### Step 10: Generate Targeted Cover Letter

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Calls MCP `draft_cover_letter(targetCompany: "CloudScale Inc", targetRole: "Senior Engineer")`.
* **What the System Does**:
  * Composes a tailored professional narrative highlighting verified engineering projects matching the company's stack.
* **What the User Should Expect**: Professional, evidence-backed cover letter letterhead.
* **Common Failure Cases**: Target company or role parameters missing.
* **Security Notes**: Zero hallucinated employment tenure or enterprise roles.

---

### Step 11: Recommend Portfolio Projects

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Calls MCP `recommend_portfolio_projects(jobDescription: "...")`.
* **What the System Does**:
  * Evaluates all candidate projects against the JD using 10 architectural depth dimensions.
  * Returns the top 2–3 recommended repositories with talking points for interviews.
* **What the User Should Expect**: Prioritized list of repository links with specific file highlights.
* **Common Failure Cases**: Only 1 project connected in workspace.
* **Security Notes**: Output only includes repositories authorized in candidate's workspace.

---

### Step 12: Track Job Application

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Calls MCP `track_job_application` with company name, job title, and URL.
* **What the System Does**:
  * Persists `job_applications` record in status `SAVED` or `APPLIED`.
  * Creates initial `application_stages` child record (`RESUME_SUBMITTED`).
* **What the User Should Expect**: Application appears in active tracker dashboard.
* **Common Failure Cases**: Duplicate URL already tracked.
* **Security Notes**: Foreign tenant applications are inaccessible (`404 NOT_FOUND`).

---

### Step 13: Connect AI Clients (Gemini / Claude / ChatGPT)

* **Phase Availability**:
  * Gemini Personal Token: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
  * Claude / ChatGPT OAuth 2.1: Phase A (`VERIFIED` hermetically) | Phase B (`BLOCKED UNTIL PUBLIC STAGING`)
* **What the User Does**:
  * *Gemini*: Generates Personal MCP Token (`mcp_live_*`) in settings and adds to client config.
  * *Claude*: Adds Custom Connector URL (`https://staging.careerhub.ai/mcp`) and logs in via OAuth.
  * *ChatGPT*: Imports Custom GPT Action with OpenAPI manifest.
* **What the System Does**:
  * Validates bearer token, enforces RBAC permission ceilings, and mints `McpRequestContext`.
* **What the User Should Expect**: AI assistant successfully lists and executes Career Hub tools.
* **Common Failure Cases**: Token expired or revoked.
* **Security Notes**: Tokens cannot be used across different environments (`live` vs `test`).

---

### Step 14: Propose Project Improvement (Write Safety Step 1)

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Instructs AI assistant: "Propose a Docker security update for my repository."
* **What the System Does**:
  * AI invokes MCP tool `propose_project_improvement`.
  * Server calculates unified diff, generates cryptographic HMAC fingerprint, and returns an `Action Approval Ticket` (`ticketId`, status: `PENDING`).
* **What the User Should Expect**: AI displays proposed patch and ticket ID, stating: "Review required before pull request can be created."
* **Common Failure Cases**: Proposed file path does not exist in repository.
* **Security Notes**: No Git write operations have occurred yet.

---

### Step 15: Review Unified Diff

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Inspects the exact unified diff in the UI or AI chat response to verify correctness.
* **What the System Does**:
  * Ensures patch does not introduce security vulnerabilities or modify sensitive configuration files.
* **What the User Should Expect**: Clean, human-readable diff (e.g., updating base Docker image to unprivileged user).
* **Common Failure Cases**: User rejects changes.
* **Security Notes**: Patch fingerprint prevents in-flight tampering.

---

### Step 16: Approve and Create Pull Request (Write Safety Step 2)

* **Phase Availability**: Phase A (`VERIFIED`) | Phase B (`AVAILABLE`)
* **What the User Does**:
  * Confirms approval in chat: "Approved. Create the pull request."
  * AI invokes `confirm_and_create_pr(ticketId: "...")`.
* **What the System Does**:
  * Server checks ticket validity, asserts remote HEAD SHA matches `expectedHeadSha`, creates branch `antigravity/patch-*`, commits patch, and opens a Pull Request on GitHub.
* **What the User Should Expect**: Direct link to the newly created GitHub Pull Request.
* **Common Failure Cases**: Repository was modified on GitHub during review (`HEAD_SHA_MISMATCH`).
* **Security Notes**: Direct pushes to `main`/`master` are strictly prohibited.

# Anthropic Claude Custom Connector Setup & Troubleshooting Guide

**Status**: IMPLEMENTED & VERIFIED  
**Governing Standard**: Model Context Protocol (MCP) Streamable HTTP Spec (2026-07-28), RFC 8707, RFC 9700 (OAuth 2.1 / BCP), RFC 9728, RFC 8414  
**Architecture Reference**: [ARCH-037 (Claude Remote MCP & OAuth 2.1)](./claude-mcp-connector-architecture.md), [ARCH-038 (Claude Tier Compatibility)](./claude-tier-compatibility-architecture.md), [ARCH-039 (Provider-Neutral Tool Response Parity)](./provider-neutral-prompt-compatibility-review.md)  
**Governing Decisions**: [ADR-058, ADR-059, ADR-060](./decisions.md)

---

## 1. Overview

Antigravity Career Hub exposes a standards-compliant **Remote Model Context Protocol (MCP)** interface that enables **Anthropic Claude** to act as an AI career intelligence copilot. 

Through this integration, Claude can:
1. Inspect candidate profiles, verified skill inventories, and commit-grounded code evidence.
2. Calculate deterministic Applicant Tracking System (ATS) job-fit scores and prioritize skill gaps.
3. Synthesize evidence-grounded application artifacts (tailored resumes, cover letters, portfolio rankings).
4. Propose atomic, test-verified GitHub code improvements and open Draft Pull Requests under strict two-phase human approval.

### Provider-Neutral Architecture & Inverse Authority

Career Hub operates under the **Inverse Authority Principle**:
* **Career Hub Domain & Safety Kernel is Authoritative**: All candidate evidence, skill valuations, ATS scores, safety ceilings, and repository modifications are computed and enforced server-side by PostgreSQL and domain services.
* **Claude is an Interchangeable Client**: Claude functions purely as a consuming AI interface over Streamable HTTP (`POST /mcp`). Claude possesses zero database credentials, zero direct Git shell access, and zero authority to fabricate claims or bypass human approval gates.

```
+--------------------------------------------------------------------------------------------------+
|                                    CLAUDE MCP INTEGRATION TOPOLOGY                               |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|   +--------------------------+              +------------------------------------------------+   |
|   |   Anthropic Claude       |              |   Career Hub Public Perimeter (HTTPS)          |   |
|   |   - Claude.ai (Web)      |              |   - TLS 1.2+ Termination                       |   |
|   |   - Claude Desktop       |              |   - Origin Header Validation (Anti-Rebinding)  |   |
|   |   - Claude Code (CLI)    |              |   - Rate Limiter & DDoS Mitigation             |   |
|   +-------------+------------+              +-----------------------+------------------------+   |
|                 |                                                   |                            |
|                 | 1. Discovery (401 + RFC 9728 Metadata)            |                            |
|                 +-------------------------------------------------->|                            |
|                 |                                                   |                            |
|                 | 2. OAuth 2.1 + RFC 8707 (resource param) Flow     |                            |
|                 +-------------------------------------------------->|                            |
|                 |    GET  /oauth/authorize?resource=...             |                            |
|                 |    POST /oauth/token     (resource binding)       |                            |
|                 |                                                   v                            |
|                 | 3. Streamable HTTP JSON-RPC (Bearer Token)   +----+------------------------+   |
|                 +--------------------------------------------->|   OAuth 2.1 Auth Middleware |   |
|                                                                +--------------+--------------+   |
|                                                                               |                  |
|                                                                               v                  |
|                                                                +--------------+--------------+   |
|                                                                | Immutable McpRequestContext |   |
|                                                                | (tenantId, userId, scopes)  |   |
|                                                                +--------------+--------------+   |
|                                                                               |                  |
|                                                                               v                  |
|                                                                +--------------+--------------+   |
|                                                                | Career Hub MCP Tools        |   |
|                                                                | - Read & Artifact Tools     |   |
|                                                                | - Approved Write Tools      |   |
|                                                                +--------------+--------------+   |
|                                                                               |                  |
|                                                                               v                  |
|                                                                +--------------+--------------+   |
|                                                                | GitHubWriteSafetyService    |   |
|                                                                | & Approval State Machine    |   |
|                                                                +-----------------------------+   |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

---

## 2. Supported Claude Clients

| Client | Platform | Transport | Auth Type | Client ID |
| :--- | :--- | :--- | :--- | :--- |
| **Claude.ai (Web)** | Browser (SaaS) | Streamable HTTP (`POST /mcp`) | OAuth 2.1 + PKCE S256 | `claude-web` |
| **Claude Desktop** | macOS / Windows Native | Streamable HTTP / Stdio Proxy | OAuth 2.1 + PKCE S256 | `claude-desktop` |
| **Claude Code (CLI)** | Terminal | Streamable HTTP / Stdio Proxy | OAuth 2.1 + PKCE S256 | `claude-cli` |

---

## 3. Prerequisites

Before setting up the custom connector, ensure you have:
1. **Node.js**: v20.x or higher (v24 LTS recommended).
2. **PostgreSQL Database**: Running locally or via Supabase with migrations applied (`npm run db:migrate`).
3. **GitHub App / OAuth App**: Configured in GitHub Developer Settings with Client ID and Client Secret.
4. **Cloudflare Tunnel CLI (`cloudflared`)**: Installed for local development (`winget install Cloudflare.cloudflared` on Windows, or `brew install cloudflared` on macOS).
5. **Anthropic Claude Account**: Active account on [Claude.ai](https://claude.ai) (Free, Pro, Team, or Enterprise).

---

## 4. Local Development Quickstart

Connecting Claude to a local Career Hub instance requires exposing your local server to the public internet over secure HTTPS so Claude's cloud backend can reach it.

### 4.1 Start Career Hub

Launch the Career Hub backend server in your terminal:

```bash
npm run dev
```

By default, the server starts on `http://localhost:3000`. Verify health locally:

```bash
curl http://localhost:3000/healthz
# Expected output: {"status":"healthy","database":"connected",...}
```

### 4.2 Start Cloudflare Quick Tunnel

In a **separate terminal window**, launch a Cloudflare Quick Tunnel forwarding to your local server:

```bash
cloudflared tunnel --url http://localhost:3000
```

Cloudflare will generate a public HTTPS URL with a random subdomain:

```text
+--------------------------------------------------------------------------------------------+
| Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):    |
| https://random-subdomain-1234.trycloudflare.com                                            |
+--------------------------------------------------------------------------------------------+
```

> [!IMPORTANT]
> Both the `npm run dev` process and the `cloudflared tunnel` process must remain running simultaneously. If the tunnel stops or restarts, a new URL will be generated.

### 4.3 Configure Environment Variables

Update your local `.env.local` file with the active public tunnel URL:

```env
# Public MCP & OAuth Base URLs (Match your active tunnel)
MCP_PUBLIC_URL=https://<random-subdomain>.trycloudflare.com/mcp
OAUTH_ISSUER_URL=https://<random-subdomain>.trycloudflare.com

# Node Environment & Server Port
PORT=3000
NODE_ENV=development
```

> [!CAUTION]
> Never commit `.env.local` to Git. Keep private keys, GitHub secrets, and database credentials out of version control.

### 4.4 Configure GitHub OAuth Callback

Because Claude will log you into Career Hub via GitHub OAuth, your GitHub App must accept callbacks from your active tunnel domain.

1. Navigate to **GitHub $\rightarrow$ Settings $\rightarrow$ Developer Settings $\rightarrow$ GitHub Apps $\rightarrow$ [Your App]**.
2. Update the **Authorization callback URL** to:
   ```text
   https://<random-subdomain>.trycloudflare.com/auth/github/callback
   ```
3. Save changes.

---

## 5. Add Career Hub Custom Connector in Claude

### 5.1 MCP Endpoint Configuration

1. Log into [Claude.ai](https://claude.ai).
2. Click your profile avatar (bottom-left) $\rightarrow$ **Settings** $\rightarrow$ **Integrations** / **Connectors** (or **Developer Settings**).
3. Click **Add Custom Connector**.
4. Enter the connector details:
   * **Name**: `Career Hub` (or `vishumcp`)
   * **Remote MCP Server URL**: `https://<random-subdomain>.trycloudflare.com/mcp`

### 5.2 OAuth Client ID Configuration

When prompted for authentication credentials:
* **Authentication Type**: `OAuth 2.0` (Authorization Code with PKCE)
* **Client ID**: `claude-web` (Pre-registered public client ID)
* **Client Secret**: *(Leave blank)* — Career Hub implements RFC 7636 PKCE S256 for public clients. No client secret is issued or required.

> [!NOTE]
> Career Hub does not use Dynamic Client Registration (RFC 7591) for Claude clients. Using the pre-registered `claude-web` Client ID ensures instant authorization without registration errors.

### 5.3 OAuth Login and Consent Flow

Once you click **Connect** in Claude:

1. **Authorization Initiation**: Claude opens a pop-up browser window to `GET /oauth/authorize`.
2. **Session Bridge (Automatic Login)**:
   * If you are not logged into Career Hub, the server preserves the OAuth request state in an encrypted parameter and automatically redirects you to GitHub OAuth (`/auth/github/login`).
   * If you have an active GitHub session in your browser, the login and session creation will complete instantaneously.
3. **Interactive Consent Screen**: Career Hub presents an interactive consent screen displaying:
   * Connected User & Tenant identity.
   * Requested permissions:
     * `career:read` (Inspect candidate profile, verified skills, evidence, and run ATS job matching).
     * `career:write` (Generate tailored application artifacts and propose code improvements).
   * Clear safety disclosure: *Claude never receives GitHub tokens; write operations require explicit human confirmation.*
4. **Granting Access**: Click **Authorize Claude**.
5. **Token Exchange**: Career Hub redirects back to Claude's callback (`https://claude.ai/api/mcp/auth_callback`) with a single-use authorization code. Claude exchanges the code and PKCE verifier at `POST /oauth/token` for an access token.
6. **Connected**: Claude discovers all 9 tools and confirms the connector is active.

---

## 6. Tool Catalog

The Career Hub MCP server registers exactly **9 tools** across 3 categories. All tools are served from the single unified endpoint (`POST /mcp`).

```
+-------------------------------------------------------------------------------------------------+
|                                 CAREER HUB 9-TOOL MCP CATALOG                                   |
+-------------------------------------------------------------------------------------------------+
|                                                                                                 |
|   +------------------------------------+       +--------------------------------------------+   |
|   | 1. Career Read Tools (4 tools)     |       | 2. Application Artifact Tools (3 tools)    |   |
|   | Scope: career:read                 |       | Scope: career:write / career:read          |   |
|   | - get_candidate_profile            |       | - generate_tailored_resume                 |   |
|   | - list_verified_skills             |       | - draft_cover_letter                       |   |
|   | - inspect_project_evidence         |       | - recommend_portfolio_projects             |   |
|   | - analyze_job_fit                  |       +--------------------------------------------+   |
|   +------------------------------------+                                                        |
|                                                +--------------------------------------------+   |
|                                                | 3. Approved GitHub Write Tools (2 tools)   |   |
|                                                | Scope: career:write                        |   |
|                                                | - propose_project_improvement              |   |
|                                                | - confirm_and_create_pr                    |   |
|                                                +--------------------------------------------+   |
|                                                                                                 |
+-------------------------------------------------------------------------------------------------+
```

### 6.1 Career Read Tools

#### 1. `get_candidate_profile`
* **Purpose**: Retrieves candidate headline, bio, experience history, highlighted projects, and top verified skills.
* **Scope**: `career:read` | **Role**: `READONLY`, `MEMBER`, `OWNER`
* **Key Inputs**: `{ candidateId?: string }` (Defaults to authenticated user's candidate).
* **Important Output**: Comprehensive profile JSON, connected resources summary, verified skills summary.

#### 2. `list_verified_skills`
* **Purpose**: Retrieves a paginated list of candidate skills verified against real codebase evidence.
* **Scope**: `career:read` | **Role**: `READONLY`, `MEMBER`, `OWNER`
* **Key Inputs**: `{ category?: string, minConfidence?: number, page?: number, limit?: number }`
* **Important Output**: Array of skill records with `confidence` ($0.0 - 1.0$), `proficiencyLevel`, and `provenance: "VERIFIED"`.

#### 3. `inspect_project_evidence`
* **Purpose**: Deeply inspects commit-pinned code evidence items for a specific repository project.
* **Scope**: `career:read` | **Role**: `READONLY`, `MEMBER`, `OWNER`
* **Key Inputs**: `{ projectId: string, skillSlug?: string, limit?: number }`
* **Important Output**: Pinned file paths, commit SHAs, line ranges, AST import patterns, and sanitized code excerpts.

#### 4. `analyze_job_fit`
* **Purpose**: Evaluates candidate fit against a target job description, normalizes requirements via the Skill Taxonomy Engine, calculates a 100-point ATS fit score, and prioritizes skill gaps.
* **Scope**: `career:read` | **Role**: `READONLY`, `MEMBER`, `OWNER`
* **Key Inputs**: `{ jobDescriptionText: string, targetRoleLevel?: string }`
* **Important Output**: ATS Fit Score ($0 - 100$), Match Grade (`EXCELLENT`, `STRONG`, `MODERATE`, `WEAK`, `LOW`), Matched/Missing skills list, Safety ceiling application note.
* **Safety Constraint**: If $\ge 3$ critical required technical skills are missing, score is strictly clamped to $\le 24.9$ (`LOW` fit).

---

### 6.2 Application Artifact Tools

#### 5. `generate_tailored_resume`
* **Purpose**: Generates evidence-grounded resume bullet points tailored to target job requirements.
* **Scope**: `career:write` | **Role**: `MEMBER`, `OWNER`
* **Key Inputs**: `{ jobDescriptionText: string, targetRoleTitle?: string, maxPages?: number }`
* **Safety Constraint**: All bullet points must cite authenticated evidence nodes. Zero-Hallucination Gate rejects fabricated claims.

#### 6. `draft_cover_letter`
* **Purpose**: Drafts a narrative cover letter directly tying the candidate's verified codebase achievements to job requirements.
* **Scope**: `career:write` | **Role**: `MEMBER`, `OWNER`
* **Key Inputs**: `{ jobDescriptionText: string, companyName: string, tone?: string }`
* **Safety Constraint**: Narrative claims without verified backing are labelled `[Unverified User Claim]` or omitted.

#### 7. `recommend_portfolio_projects`
* **Purpose**: Analyzes connected repositories and ranks the top 3–5 projects demonstrating maximum relevance for a target job family.
* **Scope**: `career:read` / `career:write` | **Role**: `MEMBER`, `OWNER`
* **Key Inputs**: `{ jobDescriptionText: string, limit?: number }`
* **Important Output**: Ranked projects with relevance scores, matching skill coverage, and architectural density metrics.

---

### 6.3 Approved GitHub Write Tools

#### 8. `propose_project_improvement`
* **Purpose**: Analyzes missing skills for a job and drafts an atomic code enhancement proposal with unified diff previews, test execution reports, and a cryptographic patch fingerprint (`SHA-256`), minting a pending `ActionApprovalTicket`.
* **Scope**: `career:write` | **Role**: `MEMBER`, `OWNER`
* **Key Inputs**: `{ projectId: string, missingSkillSlug: string, improvementDescription: string }`
* **Important Output**: `ticketId`, `patchSummary`, `diffPreview` (capped at 4,000 chars per file), and explicit machine-readable stopping instructions.
* **Safety Constraint**: Does NOT modify any Git branch or repository. Mints a pending ticket awaiting human authorization.

#### 9. `confirm_and_create_pr`
* **Purpose**: Validates human approval of a pending ticket, verifies base branch HEAD commit SHA, creates an isolated feature branch (`feat/career-hub-*`), applies the atomic patch, and opens a Draft Pull Request on GitHub.
* **Scope**: `career:write` | **Role**: `MEMBER`, `OWNER`
* **Key Inputs**: `{ ticketId: string, confirmed: true, idempotencyKey?: string, userNotes?: string }`
* **Safety Constraint**: Strictly rejects arbitrary patches or file payloads from Claude. All code mutations are sourced exclusively from the server-side validated ticket record. Modification of default branches (`main`, `master`) is physically blocked.

---

## 7. First Verification Tests (Read-Only)

Always begin verifying your connection with read-only tools before attempting artifact generation or write operations.

### 7.1 List Verified Skills Test

In a new Claude conversation, prompt:

```text
Use Career Hub to list my verified technical skills and their confidence scores.
```

**Expected Response**: Claude invokes `list_verified_skills` and returns a structured summary of your verified technologies (e.g. `Go: 1.0`, `PostgreSQL: 1.0`, `Fastify: 1.0`, `Docker: 1.0`).

### 7.2 Analyze Job Fit Test

Prompt Claude with a target job description:

```text
Use Career Hub to analyze my fit for this job description:

Job Title: Senior Backend Engineer
Requirements:
- Strong experience with Go, PostgreSQL, Docker
- Experience building RESTful microservices
- Nice to have: Kubernetes, Kafka
```

**Expected Response**: Claude invokes `analyze_job_fit` and returns:
* Calculated ATS Fit Score (e.g. `86.5 / 100 - STRONG`).
* Matched required skills (`go`, `postgresql`, `docker`, `rest-api`).
* Missing preferred skills (`kubernetes`, `kafka`).
* Prioritized skill gaps and recommendations.

---

## 8. Write Workflow & Human Safety Gating

Career Hub enforces a strict, non-bypassable **Two-Phase Human Approval State Machine** for any action affecting external repositories:

```
+---------------------------------------------------------------------------------------------------+
|                                  TWO-PHASE WRITE APPROVAL WORKFLOW                                |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|   1. Claude invokes propose_project_improvement                                                   |
|      - Analyzes missing skills and synthesizes enhancement                                        |
|      - Runs static safety analysis and generates unified diff preview                             |
|      - Generates cryptographic patchFingerprint (SHA-256)                                         |
|      - Mints ActionApprovalTicket in PostgreSQL (Status: PENDING, TTL: 15 mins)                   |
|                                                                                                   |
|                                    v                                                              |
|                                                                                                   |
|   2. Human Review Boundary                                                                        |
|      - Claude displays diff preview, affected files, test reports, and ticketId                   |
|      - AI Execution STOP PROTOCOL: Claude stops and waits for human instructions                  |
|      - User inspects code changes in chat and confirms: "Yes, open Draft PR"                      |
|                                                                                                   |
|                                    v                                                              |
|                                                                                                   |
|   3. Claude invokes confirm_and_create_pr({ ticketId: "...", confirmed: true })                   |
|      - ActionApprovalTicketService transitions ticket: PENDING -> APPROVED -> EXECUTING           |
|      - GitHubWriteSafetyService enforces safety gates:                                            |
|        * Target branch must be isolated: feat/career-hub-[a-z0-9-]+                               |
|        * Default branch protection: Rejects writes to main/master                                 |
|        * HEAD commit check: Live base HEAD SHA must match expectedHeadSha                         |
|        * Secret scanner: High-entropy credentials stripped                                        |
|      - Applies atomic commit via GitHub Git Data API (Tree -> Commit -> Ref)                       |
|      - Opens Draft Pull Request on GitHub with provenance summary                                 |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### Safety Invariants:
* **Claude Cannot Directly Push Code**: Claude has no GitHub tokens or direct Git repository access.
* **No Arbitrary Patch Payloads**: `confirm_and_create_pr` accepts only the `ticketId` and `confirmed: true`. It rejects any attempt by Claude to supply altered diffs.
* **Default Branches are Protected**: Commits directly targeting `main`, `master`, `develop`, or `release/*` are rejected with `ForbiddenOperationError`.

---

## 9. Comprehensive Troubleshooting Matrix

The following table details known failure modes observed during Claude custom connector integration, their root causes, diagnostic checks, and exact resolutions:

| # | Symptom | Likely Cause | Diagnostic Check | Exact Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **1** | `"Automatic client registration isn’t supported"` | Claude attempted Dynamic Client Registration (RFC 7591) which is disabled. | Claude UI connector creation error banner. | Specify the pre-registered OAuth Client ID `claude-web` in the custom connector configuration. |
| **2** | `invalid_request: Unrecognized key(s) in object: 'resource'` | Claude sent RFC 8707 `resource` parameter to an outdated server schema. | Fastify server 400 Bad Request error log on `GET /oauth/authorize`. | Ensure Career Hub server is up to date (RFC 8707 support is built-in). Do not attempt to strip the `resource` parameter. |
| **3** | `"User must be authenticated to authorize OAuth client"` | User opened `/oauth/authorize` in a browser session with no active Career Hub login. | HTTP 401 response on `/oauth/authorize`. | Ensure Authorization Session Bridge is active. Log in via `/auth/github/login` or allow the bridge to redirect to GitHub login automatically. |
| **4** | `401 Unauthorized / WWW-Authenticate: Bearer` | Claude connecting to `POST /mcp` without an `Authorization: Bearer <token>` header or token expired. | Response header inspection. | Complete OAuth login and consent flow in Claude UI to mint an active access token. |
| **5** | `Route GET /mcp not found / 404 / 405 Method Not Allowed` | Endpoint URL was mistyped (e.g. missing `/mcp`) or GET request lacked discovery parameters. | Fastify router access logs. | Verify endpoint URL in Claude is exactly `https://<host>/mcp`. Fastify handles `POST /mcp` (JSON-RPC) and `GET /mcp` (SSE / Streamable HTTP). |
| **6** | `OAuth discovery returns localhost instead of tunnel URL` | `MCP_PUBLIC_URL` or `OAUTH_ISSUER_URL` in `.env.local` was not updated with the public tunnel domain. | Inspect `curl https://<host>/.well-known/oauth-authorization-server`. | Set `MCP_PUBLIC_URL=https://<tunnel-domain>/mcp` and `OAUTH_ISSUER_URL=https://<tunnel-domain>` in `.env.local` and restart server. |
| **7** | `MCP connector cannot reach server / Connection Refused` | Local server process or Cloudflare tunnel process is stopped. | Run `curl -I https://<host>/healthz`. | Verify both `npm run dev` and `cloudflared tunnel` are actively running in separate terminal windows. |
| **8** | `GitHub callback mismatch (redirect_uri_mismatch)` | GitHub App OAuth callback does not match the active Cloudflare tunnel URL. | GitHub OAuth login error screen. | Update Authorization Callback URL in GitHub Developer Settings to `https://<tunnel-domain>/auth/github/callback`. |
| **9** | `Cloudflare tunnel URL changed on restart` | Cloudflare Quick Tunnel was restarted, producing a new random subdomain. | Compare terminal output of `cloudflared` with `.env.local`. | Update `.env.local`, GitHub App callback, and Claude custom connector URL with the new tunnel domain. |
| **10** | `Zero tools visible / Tools not appearing in Claude chat` | OAuth token was issued with missing scopes or role ceiling clamped permissions. | Query `oauth_tokens` in database. | Reconnect custom connector in Claude UI, ensuring both `career:read` and `career:write` scopes are approved. |
| **11** | `Token expired / Refresh Token Rotation (RTR) failure` | Access token expired (1 hour TTL) and refresh token was invalidated or reused. | Claude tool call returns 401. | In Claude Settings, disconnect and reconnect the custom connector to perform a fresh authorization code exchange. |
| **12** | `Write operation rejected (409 Conflict / Stale Head SHA)` | Base branch HEAD advanced on GitHub between proposal creation and confirmation, or ticket expired (15 min TTL). | MCP tool error output shows `StaleHeadShaError` or `ApprovalTicketExpiredError`. | Re-run `propose_project_improvement` to generate a fresh proposal rebased on current repository HEAD. |

---

## 10. Local Development vs. Production Deployment

| Dimension | Local Development (Quick Tunnel) | Production Deployment |
| :--- | :--- | :--- |
| **Public Hostname** | Ephemeral (`*.trycloudflare.com`), changes on restart | Permanent custom domain (e.g. `https://api.careerhub.example.com`) |
| **Ingress & TLS** | Managed via `cloudflared tunnel` CLI | Native cloud load balancer / Ingress with automated TLS 1.2+ certificates |
| **GitHub App Settings** | Authorization Callback URL must be updated when tunnel restarts | Static, permanent Authorization Callback URL in GitHub Developer Settings |
| **Environment Configuration** | Configured in local `.env.local` file | Managed via cloud secret managers (AWS Secrets Manager, GCP Secret Manager, Vault) |
| **OAuth Metadata Discovery** | Dynamic tunnel domain returned in `/.well-known/*` | Permanent production domain returned in `/.well-known/*` |
| **User Experience** | Requires running local server and tunnel commands | One-click connector configuration in Claude with zero developer steps |

---

## 11. Security Invariants & Data Protection

* **Zero Credential Transmission to Claude**: Never paste GitHub Personal Access Tokens (PATs), OAuth client secrets, or private keys into Claude chat prompts.
* **Public Client PKCE Protection**: Claude Web, Desktop, and CLI clients authenticate via RFC 7636 PKCE S256 without client secrets.
* **Sovereign Multi-Tenant Isolation**: Tenant identity (`tenantId`) and user identity (`userId`) are derived 100% server-side from PostgreSQL session and token records. Claude client parameters cannot override or spoof tenant boundaries.
* **Pre-Execution Secret Scrubbing**: All repository excerpts, diffs, and evidence items pass through `SecretScrubber` before being sent to Claude over MCP.
* **Human-in-the-Loop Write Safety**: Autonomous code mutations are prohibited. All repository writes require two-phase human review, cryptographic ticket validation, and branch isolation.

---

## 12. Quick Verification Checklist

Use this checklist to verify your Claude custom connector setup:

- [ ] **Career Hub Server Active**: `npm run dev` is running on `http://localhost:3000`.
- [ ] **Public Tunnel Active**: `cloudflared tunnel` is forwarding traffic to port `3000`.
- [ ] **Public Health Check Passes**: `curl -I https://<tunnel-domain>/healthz` returns `HTTP 200 OK`.
- [ ] **OAuth Metadata Discoverable**: `curl https://<tunnel-domain>/.well-known/oauth-authorization-server` returns `HTTP 200 OK`.
- [ ] **GitHub OAuth Callback Updated**: GitHub App callback points to `https://<tunnel-domain>/auth/github/callback`.
- [ ] **Claude Connector Configured**: Added custom connector with URL `https://<tunnel-domain>/mcp` and Client ID `claude-web`.
- [ ] **OAuth Consent Flow Completed**: GitHub login and consent screen approved without errors.
- [ ] **Read Tool Verified**: Prompted Claude to run `list_verified_skills` and received verified skills list.
- [ ] **Job Fit Analysis Verified**: Prompted Claude to run `analyze_job_fit` and received ATS fit score and skill gap breakdown.
- [ ] **Write Safety Preserved**: Write operations require explicit proposal review and confirmation before opening Draft PRs.

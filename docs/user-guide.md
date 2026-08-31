# Antigravity Career Hub — User Guide

**Universal, Evidence-Backed AI Career Platform**  
*Document Version: 1.0.0 (Phase 13 / P13-005)*

---

## 1. What Career Hub Does

**Antigravity Career Hub** is an evidence-first career intelligence platform designed to bridge your authentic software engineering work with modern hiring requirements.

Unlike conventional resume builders or AI assistants that fabricate claims ("hallucinate") credentials, Career Hub operates under strict principles of **provenance and truth**:

* **Authentic Code Evidence**: It inspects your real GitHub repositories (dependencies, code AST patterns, commit history, Dockerfiles) to extract verifiable engineering facts.
* **Separation of Facts vs. Claims**: It explicitly distinguishes between `VERIFIED` facts (backed by repository commits and manifests), `INFERRED` skills (derived via language/framework relationships), and `[Unverified User Claim]` entries (self-reported notes).
* **Job-Fit Alignment**: It analyzes job descriptions and compares required skills against your verified evidence graph to produce actionable match scores and highlight exact skill gaps.
* **Tailored Career Artifacts**: It generates resumes, cover letters, and portfolio recommendations strictly grounded in verified facts.
* **Provider-Neutral Model Context Protocol (MCP)**: It allows your favorite AI agents—**Google Gemini**, **Anthropic Claude**, and **OpenAI ChatGPT**—to access your career data securely without locking you into a single AI ecosystem.
* **Safe, Human-Approved Code Enhancements**: It proposes project improvements and creates pull requests on your repositories **only after explicit two-phase human review and approval**.

---

## 2. Platform Feature Status Matrix

To maintain total transparency, every feature in Career Hub is classified by its operational status:

| Status Tag | Meaning |
| :--- | :--- |
| `VERIFIED` | Implemented and verified via automated test suites and synthetic environments. |
| `AVAILABLE` | Fully implemented in the backend and operational when configured. |
| `MANUAL SETUP REQUIRED` | Requires operator action (e.g., DNS routing, tunnel configuration, OAuth app registration). |
| `BLOCKED UNTIL PUBLIC STAGING` | Functionality requires a live, public HTTPS domain (`https://staging.careerhub.ai`). |

---

## 3. Account Creation & Candidate Onboarding

### 3.1 Personal Workspace Architecture
When you register for Career Hub, the platform automatically provisions an isolated **Personal Tenant** (`FREE` tier) and an initial **Candidate Profile**. 

* **Multi-Tenant Sovereign Isolation** (`VERIFIED`): Your profile, evidence, and applications are isolated to your workspace. Cross-tenant access is rejected with a `404 NOT_FOUND` default-deny.
* **Passwordless Identity** (`VERIFIED`): Authentication is anchored to your verified GitHub identity.

### 3.2 Onboarding Lifecycle States
Your account transitions through four deterministic onboarding states:
1. `REGISTERED`: Initial account created; no resources linked.
2. `RESOURCES_CONNECTED`: GitHub App installed; at least one repository connected.
3. `PROFILE_REVIEW`: Evidence ingested, skills extracted, candidate headline and summary confirmed.
4. `COMPLETED`: Account fully activated for MCP querying and job matching.

---

## 4. Connecting GitHub & Managing Repositories

### 4.1 Principle of Least Privilege (`VERIFIED`)
Career Hub does **NOT** require access to your entire GitHub account. When installing the GitHub App, you can choose:
* **All Repositories**: Grants access to all current and future repositories.
* **Only Select Repositories (Recommended)**: Grants access exclusively to the specific portfolio projects or showcase repositories you want indexed for career evidence.

```
GitHub Installation Prompt:
┌──────────────────────────────────────────────┐
│  Repository access:                          │
│  ( ) All repositories                        │
│  (•) Only select repositories                │
│      [ Select: react-node-microservices ▼ ]  │
└──────────────────────────────────────────────┘
```

### 4.2 How Repository Ingestion Works (`VERIFIED`)
Once connected, the ingestion pipeline analyzes the selected repositories:
1. **Repository Metadata**: Captures default branch, language breakdown, and commit author identity.
2. **Package Manifest Ingestion**: Parses `package.json`, `go.mod`, `Cargo.toml`, `requirements.txt`, `pom.xml`, and `build.gradle` to identify exact libraries and frameworks.
3. **AST & Import Ingestion**: Identifies source-level imports and API usages pinned to commit SHAs.
4. **DevOps & Infrastructure Inspection**: Extracts Dockerfile configurations, Kubernetes manifests, and CI/CD workflow definitions.
5. **Secret Scrubbing**: All parsed files are scrubbed through a cryptographic secret filter before saving; zero API keys, passwords, or tokens ever enter the evidence database.

---

## 5. How Evidence Becomes Skills & Projects

Career Hub transforms raw repository code into a structured, verifiable candidate profile:

```
┌─────────────────────────┐
│   GitHub Repository     │
│   (e.g., microservices) │
└───────────┬─────────────┘
            │ Ingests code & manifests
            ▼
┌─────────────────────────┐
│     Evidence Items      │  --> Pinned to commit SHA, filePath, and line numbers
│  (Immutable Provenance) │
└───────────┬─────────────┘
            │ Rollup & Verification
            ▼
┌─────────────────────────┐
│     Candidate Skills    │  --> "React" (VERIFIED, 95% confidence, 3 evidence citations)
│  (Aggregated Taxonomy)  │  --> "PostgreSQL" (VERIFIED, 90% confidence)
└─────────────────────────┘
```

* **Projects** (`VERIFIED`): High-level showcase aggregates representing distinct software systems or products.
* **Evidence Items** (`VERIFIED`): Immutable provenance nodes containing the exact file path, line range, commit SHA, and code excerpt proving skill usage.
* **Verified Skills** (`VERIFIED`): Aggregated skills categorized by the standard taxonomy (`LANGUAGE`, `FRAMEWORK`, `DATABASE`, `CLOUD_DEVOPS`, `TOOL`, `ARCHITECTURE`, `CONCEPT`).

---

## 6. Job-Fit Analysis & Gap Detection

### 6.1 Deterministic Matching Engine (`VERIFIED`)
When you input a target Job Description (JD), Career Hub:
1. **Extracts Requirements**: Identifies required and preferred technical skills, experience levels, and domain expectations.
2. **Evaluates Provenance**: Compares requirements against your verified evidence graph.
3. **Classifies Requirements**:
   * `MATCHED`: Skill is backed by verified repository evidence.
   * `PARTIAL`: Skill is self-claimed or related via the taxonomy graph (e.g., Next.js satisfies a React requirement).
   * `MISSING`: Verifiable technical requirement with 0 matching evidence items.
   * `UNKNOWN`: Subjective or qualitative qualification (e.g., "collaborative mindset") that cannot be mechanically verified.

### 6.2 ATS Fit Score (`VERIFIED`)
Calculates a transparent 0–100 score based on weighted requirement satisfaction, architectural depth, and verified evidence density.

---

## 7. Generating Tailored Career Artifacts

Career Hub provides three evidence-backed artifact generators:

### 7.1 Tailored Resume Generation (`VERIFIED`)
* Highlights verified projects and skills most relevant to the target job description.
* Every technical bullet point includes clickable evidence references.
* Unverified user claims are explicitly demarcated as `[Unverified User Claim]` to prevent accidental misrepresentation.
* **Safe Invariant**: Tailoring generates a new application document snapshot; it **never overwrites** your original base resume.

### 7.2 Cover Letter Drafting (`VERIFIED`)
* Synthesizes a formal narrative demonstrating how your specific engineering achievements directly address the employer's challenges.
* Uses evidence-backed facts rather than generic conversational filler.

### 7.3 Portfolio Recommendations (`VERIFIED`)
* Recommends the top 2–3 repositories from your workspace that best demonstrate the technical stack required by the employer.
* Provides customized README talking points for technical interview discussions.

---

## 8. Job Application Tracking

Career Hub includes a complete, sovereign application tracker (`VERIFIED`):

```
┌──────────┐     ┌───────────┐     ┌──────────────┐     ┌──────────────┐
│  SAVED   │ ──> │  APPLIED  │ ──> │  SCREENING   │ ──> │ INTERVIEWING │
└──────────┘     └───────────┘     └──────────────┘     └──────┬───────┘
                                                               │
                                  ┌────────────────────────────┴────────────┐
                                  ▼                                         ▼
                         ┌─────────────────┐                       ┌─────────────────┐
                         │ OFFER_RECEIVED  │                       │    REJECTED     │
                         └─────────────────┘                       └─────────────────┘
```

* **Application Aggregate**: Stores company name, job title, job URL, compensation, work arrangement, and notes.
* **Interview Stage Progression**: Tracks interview loops (`RECRUITER_SCREEN`, `TECHNICAL_ASSESSMENT`, `SYSTEM_DESIGN`, `BEHAVIORAL`, `ONSITE_LOOP`, `OFFER_NEGOTIATION`) with timestamps, interviewer notes, and outcomes (`PASSED`, `FAILED`, `PENDING`).
* **Immutable Document Snapshots**: Attaches point-in-time snapshots of the exact resume and cover letter versions submitted for each application.
* **Application Analytics**: Descriptive funnel analytics detailing application volume, interview progression rates, and recurring skill gaps.

---

## 9. Multi-AI Client Model Context Protocol (MCP)

Career Hub provides a universal **Model Context Protocol (MCP)** interface over Streamable HTTP (2026-07-28 standard).

```
 ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
 │  Google Gemini  │       │ Anthropic Claude│       │ OpenAI ChatGPT  │
 └────────┬────────┘       └────────┬────────┘       └────────┬────────┘
          │ Personal Token          │ OAuth 2.1 PKCE          │ OAuth 2.1 PKCE
          └────────────────┬────────┴─────────────────────────┘
                           │ Streamable HTTP JSON-RPC
                           ▼
          ┌───────────────────────────────────┐
          │   Career Hub Remote MCP Server    │
          │   (Server-Controlled Auth & RBAC) │
          └───────────────────────────────────┘
```

### 9.1 Google Gemini Integration (`VERIFIED`)
* Connects using dedicated Personal MCP API Tokens (`mcp_live_<64-hex>`).
* Provides read-only inspection (`get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit`), artifact generation, and job tracking.

### 9.2 Anthropic Claude Integration (`VERIFIED`)
* Connects via Claude Desktop / Web Custom Connector using **OAuth 2.1 Authorization Code Flow with PKCE (S256)**.
* Compliant with Claude Free (single connector) and Claude Pro/Team (multi-connector) environments.
* Complete setup details in [`docs/claude-custom-connector-guide.md`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/claude-custom-connector-guide.md).

### 9.3 OpenAI ChatGPT Integration (`VERIFIED`)
* Connects via ChatGPT Custom GPT Actions using **RFC 9728 Protected Resource Discovery** and OAuth 2.1 bearer authorization.
* Complete setup details in [`docs/chatgpt-custom-connector-guide.md`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/chatgpt-custom-connector-guide.md).

### 9.4 Full MCP Tool Catalog (26 Tools across 6 Domains)

| Category | Tool Name | Scope Required | Description |
| :--- | :--- | :--- | :--- |
| **Career Read (4)** | `get_candidate_profile` | `career:read` | Inspect candidate profile, verified skills overview, and projects. |
| | `list_verified_skills` | `career:read` | List skills verified by code AST analysis. |
| | `inspect_project_evidence` | `career:read` | Inspect commit-pinned evidence items for a project. |
| | `analyze_job_fit` | `career:read` | Match candidate evidence graph against a target job description. |
| **Career Artifacts (3)** | `generate_tailored_resume` | `career:write` | Generate evidence-grounded tailored resume markdown. |
| | `draft_cover_letter` | `career:write` | Draft targeted cover letter explaining engineering background. |
| | `recommend_portfolio_projects` | `career:read` | Select top portfolio repositories matching job requirements. |
| **Career Write (2)** | `propose_project_improvement` | `career:write` | Generate branch/patch proposal for human approval ticket. |
| | `confirm_and_create_pr` | `career:write` | Execute approved pull request on repository. |
| **Career Tracking (7)** | `track_job_application` | `career:write` | Create a new tracked job application entry. |
| | `list_active_applications` | `career:read` | List active job applications in workspace. |
| | `get_job_application` | `career:read` | Get detailed application record with stages and documents. |
| | `update_application_status` | `career:write` | Transition application lifecycle status. |
| | `add_application_stage` | `career:write` | Add interview stage to an application. |
| | `update_application_stage_outcome` | `career:write` | Record outcome and feedback for an interview stage. |
| | `attach_application_document` | `career:write` | Attach point-in-time tailored document to application. |
| **Job Workflow (8)** | `search_jobs` | `career:read` | Query verified job postings with remote, skills, and salary filters. |
| | `get_job_posting` | `career:read` | Fetch full normalized job posting details and requirements. |
| | `prepare_job_application` | `career:read` | Orchestrate profile, verified evidence, tailored resume, and package hash. |
| | `validate_job_application` | `career:read` | Validate package completeness and duplicate prevention rules. |
| | `create_application_preview` | `career:read` | Produce the human-reviewable application package preview. |
| | `request_application_approval` | `career:write` | Generate single-use cryptographic approval ticket (15-min TTL). |
| | `submit_job_application` | `career:write` | Submit approved package with ticket and hash verification. |
| | `get_application_submission_status`| `career:read` | Retrieve submission outcome, tracking state, and external ATS reference. |
| **Career Profile (2)** | `get_career_profile` | `career:read` | Retrieve candidate’s persistent career profile and job preferences. |
| | `update_career_preferences` | `career:write` | Update candidate’s target roles, locations, remote policy, and salary floor. |

### 9.5 MCP Resources & Resource Templates (8 Resources)

| Resource URI | MIME Type | Scope | Description |
| :--- | :--- | :--- | :--- |
| `ui://career-hub/job-fit-radar/v1` | `text/html;profile=mcp-app` | `career:read` | Sandboxed SVG Job Fit Radar chart and ATS score gauge (SEP-1865). |
| `career://profile` | `application/json` | `career:read` | Live candidate career profile, target roles, and top verified skills. |
| `career://skills` | `application/json` | `career:read` | Comprehensive AST-verified skills catalog with confidence scores. |
| `career://connections` | `application/json` | `career:read` | Connected GitHub installations, repository sync states, and indexed branches. |
| `career://projects/{projectId}` | `application/json` | `career:read` | Deep architectural dossier for a specific repository codebase. |
| `career://evidence/{evidenceId}` | `application/json` | `career:read` | Commit-pinned code evidence item with file path and sanitized excerpt. |
| `career://jobs/{jobId}` | `application/json` | `career:read` | Full normalized job posting details and compensation ranges. |
| `career://applications/{applicationId}` | `application/json` | `career:read` | Tracked application dossier with chronological interview timeline. |

### 9.6 Structured Reusable MCP Prompts (4 Prompts)

| Prompt Name | Scope Required | Description |
| :--- | :--- | :--- |
| `find_matching_jobs` | `career:read` | Instructs assistant to find suitable job openings matching candidate profile. |
| `review_resume` | `career:read` | Audits candidate resume bullets against AST code evidence and flags ungrounded claims. |
| `prepare_application` | `career:write` | Prepares an end-to-end tailored job application package for a target role. |
| `explain_skill_gap` | `career:read` | Analyzes candidate skill gaps and recommends practical repository enhancements. |

---

## 10. Safe, Human-Approved GitHub Write Workflows

To ensure AI assistants can never modify your code without your knowledge, Career Hub enforces a strict **Two-Phase Write Safety Protocol** (`VERIFIED`):

```
Step 1: AI Analysis
        │ AI analyzes repository gap
        ▼
Step 2: Propose Improvement (propose_project_improvement)
        │ Server generates patch, cryptographic HMAC signature, and Action Approval Ticket
        ▼
Step 3: Human Review & Diff Inspection
        │ Human inspects unified diff and verifies changes
        ▼
Step 4: Explicit Confirmation (confirm_and_create_pr)
        │ Human signs off -> Server verifies branch HEAD SHA -> Creates Pull Request
        ▼
Step 5: Pull Request Opened on GitHub
```

* **Zero Direct Pushes**: The server **never** commits directly to your `main` or `master` branch. All modifications create an isolated branch (`antigravity/patch-*`) and submit a Pull Request.
* **HEAD SHA Protection**: If the target branch has changed on GitHub since the proposal was created, the ticket fails closed to prevent merge conflicts or overwritten code.

---

## 11. Security, Privacy & Data Sovereignty (GDPR)

Career Hub provides full sovereignty over your data (`VERIFIED`):

### 11.1 Disconnecting GitHub (`VERIFIED`)
You can disconnect a GitHub connection at any time:
* **Immediate Credential Scrubbing**: Your encrypted installation tokens and OAuth tokens are permanently overwritten with random scrubbed data.
* **Artifact Preservation**: Historical job applications, generated resumes, and interview records remain intact in your workspace.

### 11.2 OAuth Token Revocation (`VERIFIED`)
You can revoke AI client access (Claude or ChatGPT tokens) instantly. Once revoked, any subsequent API calls fail immediately with `401 UNAUTHENTICATED`.

### 11.3 Permanent Account Erasure (GDPR Article 17) (`VERIFIED`)
You have the absolute right to be forgotten:
* **Confirmation Required**: Must be initiated by workspace `OWNER` providing the exact confirmation phrase `"DELETE MY ACCOUNT"`.
* **Atomic Cascade**: Completely and permanently purges your Tenant workspace across all 18 database tables in a single transaction.
* **Taxonomy Safety**: The shared global technology taxonomy remains intact for other users, while all your personal data, tokens, and evidence are permanently erased.

---

## 12. Troubleshooting Guide

| Issue | Potential Cause | Verified Resolution |
| :--- | :--- | :--- |
| **GitHub connection fails during OAuth** | Missing callback URL or expired authorization state | Ensure GitHub App callback is configured to `https://<domain>/auth/github/callback`. Re-initiate connection from settings. |
| **Repository does not appear in list** | GitHub App permissions restricted | Visit GitHub App settings (`github.com/settings/installations`) and ensure repository is selected in repository access list. |
| **Skills not extracted after repository connection** | Repository has unsupported manifests or empty commit tree | Ensure the repository has a supported manifest (`package.json`, `go.mod`, `Cargo.toml`, etc.) on the default branch. |
| **MCP returns 401 UNAUTHENTICATED in Claude/ChatGPT** | OAuth token expired or revoked | Re-authenticate the Custom Connector in Claude/ChatGPT to trigger OAuth 2.1 authorization code flow and refresh tokens. |
| **MCP write tool returns 403 FORBIDDEN** | Token lacks `career:write` scope | Generate an MCP API token with `MEMBER` or `OWNER` role, or authorize the `career:write` scope during OAuth consent. |
| **Pull Request proposal fails with HEAD_SHA_MISMATCH** | Remote repository was updated after proposal generation | Re-run `propose_project_improvement` to generate a fresh ticket against the latest branch commit. |
| **Public staging endpoint unreachable** | Public staging domain not yet configured | Feature is `BLOCKED UNTIL PUBLIC STAGING`. Follow [`docs/staging-deployment-runbook.md`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/staging-deployment-runbook.md) when a domain is provisioned. |

---

## 13. AI Connection Center & Public MCP Documentation Explorer

### 13.1 AI Connection Center (`/connect`) (`VERIFIED`)
Accessible from the top navigation bar, the AI Connection Center enables authenticated candidates to:
* **View Provider Connection Status**: Live status badges and configuration guides for Anthropic Claude, OpenAI ChatGPT, and Google Gemini.
* **Copy Universal Remote MCP Endpoint**: Copyable endpoint (`POST /mcp`) with explicit guidance on local development vs. remote hosted cloud AI tunnels.
* **Generate & Manage Personal MCP API Tokens**: Issue high-entropy tokens (`mcp_live_*` / `mcp_dev_*`) with role permission ceiling enforcement, custom expiration windows (30, 60, 90 days, or no expiration), and immediate one-click revocation.
* **Two-Phase Write Safety Verification**: Visual walkthrough of the non-negotiable human approval state machine.

### 13.2 Public Developer Documentation Explorer (`/docs/mcp`) (`VERIFIED`)
A public developer documentation portal detailing:
* **Streamable HTTP Transport**: Protocol revision `2026-07-28` with SSE event streaming and JSON-RPC 2.0 error schemas.
* **Interactive 26-Tool Catalog**: Filterable and searchable tool catalog with complete parameter specifications, scope requirements, and sample JSON-RPC payloads across 6 domains.
* **8 MCP Resources & 4 Prompts**: Live inspector for `career://` and `ui://` resources and prompt templates.
* **OAuth 2.1 RFC 8414 & RFC 9728 Discovery**: Specifications for metadata endpoints and PKCE S256 code exchange.
* **Client Quickstart Guides**: Copyable configuration snippets for Claude Desktop (`claude_desktop_config.json`), Custom GPT Actions, and Gemini Antigravity SDK scripts.

---

## 14. Platform Roadmap & Boundaries

| Capability | Phase | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Remote MCP Server (26 Tools)** | Phase 7–14 | `VERIFIED & OPERATIONAL` | Fully operational over Streamable HTTP with OAuth 2.1 & Personal Tokens (26 tools, 8 resources, 4 prompts). |
| **AI Connection Center & Docs** | Phase 13.5 (P13.5-004) | `VERIFIED & OPERATIONAL` | Web UI available at `/connect` and `/docs/mcp`. |
| **Official MCP Registry Listing** | Phase 13.5 / 14 | `READY FOR SUBMISSION (NOT PUBLISHED)` | Verified `server.json` manifest conforming to official schema; publication blocked until permanent HTTPS domain (Phase 14). |
| **MCP Apps UI Extensions** | Phase 13.5 (P13.5-005) | `IMPLEMENTED (JOB-FIT RADAR)` | Sandboxed `ui://career-hub/job-fit-radar/v1` interactive SVG radar chart & ATS widget for `analyze_job_fit` (SEP-1865); host support must be verified per client. |
| **Public Staging Deployment** | Phase 14 | `BLOCKED UNTIL PUBLIC STAGING` | Cloudflare Named Tunnel with verified staging domain (`staging.careerhub.ai`). |
| **Local MCP Testing** | Phase 1–14 | `LOCAL DEVELOPMENT ONLY` | Localhost (`http://localhost:3000/mcp`) for local processes; requires HTTPS tunnel for hosted AI. |

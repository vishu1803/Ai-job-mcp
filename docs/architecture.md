# System Architecture Specification

**Project**: Antigravity Career Hub (Universal AI Career MCP Platform)  
**Status**: Specification & Architectural Foundation  
**Last Updated**: 2026-08-19  

---

## 1. Product Overview
Antigravity Career Hub is a provider-neutral, evidence-backed AI career copilot that integrates directly with a candidate's real-world code repositories and professional resources via the Model Context Protocol (MCP). 

The platform's primary purpose is to eliminate hallucination in career artifacts (resumes, cover letters, portfolios) and technical interview preparation. It accomplishes this by grounding all candidate claims in cryptographic and immutable references to actual code commits, README files, repository structures, and package manifests, while allowing any MCP-compliant AI client (Google Gemini, Anthropic Claude, OpenAI ChatGPT, Cursor) to act as the conversational career advisor.

---

## 2. Architectural Principles

1. **Provider Neutrality**: Core career intelligence, candidate profiles, evidence linking, and data storage are strictly agnostic of any specific AI model provider.
2. **Radical Evidence Provenance**: Every skill, achievement, and bullet point must resolve to a valid `EvidenceId` pointing to verified source material. Unverified claims are explicitly flagged as `[Unverified User Claim]`.
3. **Zero Fabrication**: The system refuses to generate or validate claims that lack ground-truth evidence.
4. **Human-in-the-Loop Consequential Safety**: Any operation that modifies external state (creating branches, pushing commits, opening PRs, sending applications) requires explicit two-phase human authorization (`propose` -> `confirm`).
5. **Multi-Tenant Cryptographic Isolation**: Strict tenant isolation at the database, service, and MCP transport layers. User credentials and OAuth tokens are encrypted at rest with AES-256-GCM.
6. **Modular Monolith First**: The system is designed as a single modular application with decoupled domain boundaries, avoiding premature microservice complexity.
7. **Stateless Remote MCP Protocol**: MCP interaction conforms to the official Streamable HTTP specification (version 2026-07-28), enabling horizontal scalability and load balancing.

---

## 3. High-Level System Diagram

```
+---------------------------------------------------------------------------------------------------+
|                                          USER ACTORS & CLIENTS                                    |
|   +------------------------------------+          +-------------------------------------------+   |
|   |         Web Browser User           |          |         AI Clients (Gemini/Claude/GPT)    |   |
|   +-----------------+------------------+          +---------------------+---------------------+   |
+---------------------|---------------------------------------------------|-------------------------+
                      | HTTPS / REST                                      | Streamable HTTP / JSON-RPC
                      v                                                   v
+---------------------------------------------------------------------------------------------------+
|                                          API & MCP GATEWAY                                        |
|   +------------------------------------+          +-------------------------------------------+   |
|   |      Fastify REST API Gateway      |          |         Remote MCP Gateway                |   |
|   |   - Session / OAuth 2.1 Auth       |          |   - Per-User Bearer / OAuth 2.1 Auth      |   |
|   |   - CORS, Rate Limiting, Helmet    |          |   - Streamable HTTP + SSE Fallback        |   |
|   +-----------------+------------------+          +---------------------+---------------------+   |
+---------------------|---------------------------------------------------|-------------------------+
                      |                                                   |
                      +-------------------------+-------------------------+
                                                |
                                                v
+---------------------------------------------------------------------------------------------------+
|                                      APPLICATION CORE SERVICES                                    |
|  +---------------------------+  +---------------------------+  +-------------------------------+  |
|  |     Candidate Service     |  | Career Intelligence Engine|  |     Safety & Action Engine    |  |
|  | - Profile aggregation     |  | - JD parsing & taxonomy   |  | - Two-phase commit state mach |  |
|  | - Evidence graph builder  |  | - Gap analysis & scoring  |  | - Sandboxed Git patch builder|  |
|  | - Provenance validation   |  | - Tailored adaptation     |  | - Approval ticket manager     |  |
|  +-------------+-------------+  +-------------+-------------+  +---------------+---------------+  |
+----------------|------------------------------|--------------------------------|------------------+
                 |                              |                                |
                 v                              v                                v
+---------------------------------------------------------------------------------------------------+
|                                    RESOURCE CONNECTOR LAYER                                       |
|  +---------------------------------------------------------------------------------------------+  |
|  | `ResourceConnector` Interface & Registry                                                    |  |
|  | - GitHub App Connector (Octokit, App ID + PEM, Short-Lived Installation Tokens, Webhooks)   |  |
|  | - [Planned] GitLab Connector                                                                |  |
|  | - [Planned] Google Drive / Document Connector                                               |  |
|  | - [Planned] Notion Connector                                                                |  |
|  +--------------------------------------------+------------------------------------------------+  |
+-----------------------------------------------|---------------------------------------------------+
                                                v
+---------------------------------------------------------------------------------------------------+
|                                   DATA & PERSISTENCE LAYER                                        |
|  +----------------------------------------------------+  +-------------------------------------+  |
|  | PostgreSQL (Drizzle ORM)                           |  | Redis / In-Memory Cache             |  |
|  | - users, tenants, sessions                         |  | - Repository tree cache             |  |
|  | - resource_connections (AES-256-GCM tokens)        |  | - Rate limiting buckets             |  |
|  | - candidate_profiles, evidence_items, skills       |  | - Approval ticket TTL store         |  |
|  | - job_descriptions, match_results, audit_logs      |  |                                     |  |
|  +----------------------------------------------------+  +-------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## 4. Major Components

1. **REST API Gateway**: Handles standard user registration, authentication, dashboard views, and connection management.
2. **Remote MCP Server**: Stateless JSON-RPC 2.0 gateway running over Streamable HTTP exposing career inspection and adaptation tools to AI clients.
3. **Resource Connector Registry**: Manages external connectors implementing the standard `ResourceConnector` contract.
4. **Candidate & Evidence Engine**: Inspects source files, package manifests, and Git trees to construct an immutable evidence graph.
5. **Career Intelligence Engine**: Deterministically parses job requirements, normalizes technologies, and performs match scoring and gap analysis.
6. **Action & Safety Service**: Controls consequential write actions using approval state machines and sandboxed branch workflows.
7. **Security & Cryptography Subsystem**: Handles AES-256-GCM encryption/decryption, HMAC webhook verification, and tenant boundary enforcement.

---

## 5. Frontend Responsibilities
* **Authentication UI**: Login, registration, session management, and OAuth redirects.
* **Connector Management**: GitHub App install buttons, repository selection toggles, connector health indicators, and disconnect options.
* **Profile & Evidence Browser**: Visual exploration of extracted skills, linked repositories, file paths, and commit citations.
* **Job Analysis & Fit Dashboard**: Inputting job descriptions, viewing match percentage breakdown, and inspecting missing vs. satisfied skills.
* **MCP Integration Center**: Generating user-scoped MCP connection URLs and bearer tokens, with copy-paste instructions for Gemini, Claude, and ChatGPT.
* **Action Review & Confirmation**: Viewing proposed Git branch diffs and granting explicit approval to open PRs.
* **Data Sovereignty Controls**: Exporting candidate data, revoking tokens, and triggering complete account deletion (GDPR).

---

## 6. Backend Responsibilities
* **Request Handling & Routing**: Fastify server handling REST endpoints and MCP transport routes.
* **Multi-Tenant Context Injection**: Validating session or Bearer tokens and attaching verified `tenant_id` and `user_id` to every request.
* **Schema Validation**: Enforcing Zod input/output schemas on all endpoints and MCP tool arguments.
* **Token Lifecycle Management**: Requesting short-lived GitHub installation tokens (`ghs_*`), rotating refresh tokens, and encrypting tokens at rest.
* **Audit Logging**: Writing immutable records of all data access, MCP tool calls, and external actions.

---

## 7. Career Intelligence Responsibilities
* **Job Requirement Extraction**: Parsing structured entities (required technical skills, soft skills, seniority level, education, domain experience) from raw job description text.
* **Taxonomy Normalization**: Mapping synonymous skill names (e.g., "React.js", "ReactJS", "React" -> `React`) to standard canonical identifiers.
* **Four-Tier Evidence Categorization**:
  * `VERIFIED`: Backed by repository code, commit history, or verified document.
  * `CLAIMED`: Stated in candidate bio or resume but without code evidence.
  * `INFERRED`: Derived from complementary verified skills (e.g., TypeScript implies JavaScript).
  * `MISSING`: Required by the job description but absent from candidate evidence and claims.
* **ATS Fit Scoring**: Mathematical calculation of requirement coverage with full transparency and zero black-box scoring.
* **Tailored Artifact Generation**: Generating resume bullets and cover letter sections that strictly reference verified `EvidenceId`s.

---

## 8. Resource Connector Layer
The Resource Connector Layer encapsulates all third-party API interactions behind a unified interface:

```javascript
/**
 * @interface ResourceConnector
 */
export class ResourceConnector {
  /**
   * @param {string} connectionId
   * @param {object} credentials Decrypted credential payload
   */
  constructor(connectionId, credentials) {}

  async testConnection() {}
  async listWorkspaces() {}
  async listRepositories() {}
  async getRepository(repoId) {}
  async getFileTree(repoId, branch) {}
  async getFileContent(repoId, filePath, ref) {}
  async getRecentCommits(repoId, limit) {}
  
  // Optional Write Capabilities (Guarded by Safety Engine)
  async createBranch(repoId, baseBranch, newBranch) {}
  async commitFiles(repoId, branch, message, files) {}
  async createPullRequest(repoId, title, body, head, base) {}
}
```

* **Isolation**: The connector layer knows nothing about resumes, job descriptions, or career scoring.
* **Pluggability**: Adding GitLab, Google Drive, or Notion requires only implementing this interface.

---

## 9. MCP Interface Layer
* **Transport**: Conforms to the official MCP 2026-07-28 specification using stateless **Streamable HTTP** (`POST` with header-based routing via `Mcp-Method`) and optional Server-Sent Events (SSE) fallback.
* **Authentication**: Every MCP request must supply `Authorization: Bearer <mcp_token>`. The gateway resolves the token to an active `user_id` and `tenant_id`.
* **Tool Surface**:
  * `get_candidate_profile`: Retrieve verified candidate summary and repository overview.
  * `list_verified_skills`: List skills with mandatory evidence citations.
  * `inspect_project_evidence`: Retrieve detailed repository and code-level evidence for a given project.
  * `analyze_job_fit`: Parse a job description and return match breakdown against candidate evidence.
  * `generate_tailored_resume`: Generate ATS-optimized resume sections citing only verified evidence.
  * `draft_cover_letter`: Draft a role-specific cover letter incorporating verified project highlights.
  * `propose_project_improvement`: Propose code enhancements to fill detected job skill gaps.
  * `confirm_and_create_pr`: Two-phase confirmation to open a draft PR on a feature branch.
* **Audit Trail**: Every tool call is logged with execution duration, tenant ID, and tool input arguments.

---

## 10. AI Client Layer
The platform operates as a tool and context server for external AI clients:
* **Google Gemini**: Connects via Gemini Developer API tool calling and Gemini Enterprise custom remote MCP connectors.
* **Anthropic Claude**: Connects via Claude Desktop and Claude Web custom connectors over public HTTPS.
* **OpenAI ChatGPT**: Connects via ChatGPT Developer Mode custom MCP connectors.
* **Local Agents / IDEs**: Connects via Cursor, VS Code MCP extensions, or local CLI agents.

**Strict Decoupling**: No client-specific logic or proprietary prompt formatting is permitted within the core candidate model or connector layer.

---

## 11. Database Responsibilities
* **Relational Storage (PostgreSQL)**:
  * Multi-tenant account tables (`tenants`, `users`, `sessions`, `api_keys`).
  * Connection registry (`resource_connections`) storing encrypted credential blobs.
  * Normalized candidate model (`candidate_profiles`, `skills`, `evidence_items`, `projects`).
  * Job tracking & results (`job_descriptions`, `match_results`, `applications`).
  * Immutable compliance logs (`audit_logs`, `action_approvals`).
* **Semi-Structured Storage (`JSONB`)**:
  * Flexible metadata storage for AST-parsed repository manifests, file trees, and raw job requirement JSON.
* **Caching & Ephemeral State (Redis / In-Memory)**:
  * GitHub API response caching with `ETag` tracking.
  * Per-user and global rate limiting buckets.
  * 15-minute TTL storage for action approval tickets.

---

## 12. Authentication Boundary
* **User Authentication**: Web dashboard uses secure session cookies or OAuth 2.1 Authorization Code Flow with PKCE.
* **MCP Client Authentication**: AI clients authenticate to the remote MCP server using dedicated cryptographically random Bearer tokens (`mcp_live_*`) hashed with SHA-256 in the database.
* **Connector Authentication**: Third-party integrations authenticate using short-lived provider tokens obtained via installation IDs or refreshed OAuth tokens.

---

## 13. Authorization Boundary
* **Tenant Isolation**: Every database query and business operation must filter on `tenant_id` and `user_id`. No endpoint or tool may accept an arbitrary `user_id` from client payloads.
* **Connector Permissions**: Connectors default to read-only access (`contents:read`). Write access is explicitly separated and requires tenant-level opt-in.
* **Consequential Action Boundary**: Write operations cannot execute on tool call alone. They must transition through a pending `ApprovalTicket` verified by the user.

---

## 14. Audit and Logging Boundary
* **PII & Secret Sanitization**: Pino logging middleware intercepts and scrubs access tokens, refresh tokens, private keys, authorization headers, and candidate personal identifiers before writing logs.
* **Audit Logging**: Consequential actions (logins, credential updates, MCP tool invocations, Git branch creation, account deletion) write immutable records to the `audit_logs` table.

---

## 15. External Integrations
1. **GitHub App**: Provides fine-grained repository access, commit history inspection, and webhook event streaming.
2. **AI Provider APIs (Testing/Verification)**: Google Gemini API SDK for running automated end-to-end integration tests.
3. **Database & Cache**: PostgreSQL (v15+) and Redis (v7+).

---

## 16. Data Flow

```
[User Connects GitHub]
      │
      ▼
[GitHub App Webhook / OAuth Callback]
      │
      ▼ (Store encrypted tokens)
[resource_connections Table (AES-256-GCM)]
      │
      ▼ (Background Ingestion)
[GitHub Evidence Extractor]
      │
      ▼ (Parse package manifests, commits, READMEs)
[Unified Candidate Model & Evidence Graph]
      │
      ▼ (Store normalized entities)
[candidate_profiles + evidence_items Tables]
      │
      ▼ (Query via Remote MCP)
[AI Client: Gemini / Claude / ChatGPT]
```

---

## 17. Request Flow (Remote MCP Tool Call)

```
1. AI Client sends HTTP POST to /mcp with Header `Authorization: Bearer <mcp_token>`
2. Fastify MCP Gateway authenticates token -> resolves `tenant_id` and `user_id`
3. MCP Gateway routes request to requested Tool Handler (e.g. `analyze_job_fit`)
4. Tool Handler calls Career Intelligence Engine with validated Zod input
5. Career Intelligence Engine retrieves user's verified Evidence Graph from database
6. Gap analysis and match scoring executed deterministically
7. Zero-Hallucination Integrity Gate validates that all citations reference valid Evidence IDs
8. Response serialized to JSON-RPC 2.0 payload and returned to AI Client
9. Audit log entry recorded asynchronously
```

---

## 18. Asynchronous & Background Work
* **Initial Repository Sync**: Ingestion of large repositories occurs asynchronously with progress status tracked on the user connection.
* **Webhook Processing**: GitHub webhook events (`push`, `installation_repositories`) are validated and placed on an async queue to update the candidate evidence graph incrementally.
* **Approval Expiration**: Ephemeral approval tickets automatically expire after 15 minutes via Redis key TTL or database cleanup jobs.

---

## 19. Deployment Architecture
* **Production Runtime**: Docker containerized Node.js (Alpine LTS) service.
* **Hosting Options**: Azure App Service / Container Apps (via Azure for Students credit) or Fly.io / Render.
* **Managed Services**: Managed PostgreSQL (e.g., Azure Database for PostgreSQL or Neon) and Upstash Redis.
* **TLS & Reverse Proxy**: Public HTTPS terminated at Cloudflare or cloud load balancer.

---

## 20. Local Development Architecture
* **Runtime**: Node.js v20+ LTS (ESM).
* **Local Database**: Local PostgreSQL instance or Docker container (`postgres:16-alpine`).
* **Environment**: Local `.env` file containing test encryption keys and local database credentials.
* **Tunneling**: `ngrok` or `cloudflared` for receiving GitHub App webhooks locally.
* **Test Runner**: Node test runner or Vitest for fast, zero-compilation test execution.

---

## 21. MVP Architecture
The MVP focuses strictly on the verifiable Golden Path:
* Fastify backend with ESM.
* PostgreSQL database with core tables (`users`, `resource_connections`, `candidate_profiles`, `skills`, `evidence_items`).
* GitHub App connector for read-only repository inspection.
* Career intelligence engine for job description parsing and evidence matching.
* Remote MCP server over Streamable HTTP.
* Gemini client integration verifying end-to-end evidence citation.

---

## 22. Future Architecture
* Multi-connector ingestion (GitLab, Google Drive, Notion, LinkedIn PDF exports).
* Dynamic portfolio generation with automated deployment to GitHub Pages or Vercel.
* Automated multi-turn conversational agents for mock technical interview preparation.
* Claude Custom Connectors and ChatGPT Developer Mode production connectors.
* Real-time ATS application tracking dashboard.

---

## 23. Components Explicitly Deferred
1. **Automated Application Bot Submissions**: Prohibited by project constitution to prevent bot spam and account bans.
2. **Autonomous Main Branch Commits**: Prohibited; all writes must target isolated feature branches and draft PRs.
3. **Complex Microservice Mesh**: Deferred until production scale demands it.
4. **Third-Party Paid LLM Proxying**: The platform does not proxy LLM tokens; users connect their own AI clients via MCP.

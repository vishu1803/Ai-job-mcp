# ARCH-038: Claude Free & Pro/Team Multi-Connector Architecture & Compatibility Review

**Status**: APPROVED  
**Security Level**: Public Perimeter & Multi-Connector AI Client Integration  
**Target AI Client**: Anthropic Claude (Claude Free, Claude Pro, Claude Max, Claude Team, Claude Desktop, Claude Code CLI)  
**Governing Standards**: Model Context Protocol (MCP) Streamable HTTP Spec 2026-07-28, RFC 8707 (Resource Indicators for OAuth 2.0), RFC 9700 (OAuth 2.1 / BCP), RFC 9728 (Protected Resource Metadata), RFC 8414  
**Governing ADR**: ADR-059 (`docs/decisions.md`)  
**Prerequisite Architecture**: ARCH-037 (`docs/claude-mcp-connector-architecture.md`), ARCH-022 (`docs/mcp-server-architecture.md`), ARCH-035 (`docs/mcp-write-tools-architecture.md`)  

---

## 1. Executive Summary & Strategic Context

In **Phase 10 (Task P10-001)**, Antigravity Career Hub established standard public HTTPS OAuth 2.1 + PKCE S256 connectivity with RFC 8707 Resource Indicators for **Anthropic Claude**. The server exposes a cohesive 9-tool catalog spanning Career Read, Application Artifact, and Approved GitHub Write operations.

**ARCH-038** provides the formal architectural and compatibility review for connecting Claude across different subscription tiers and operational topologies:
1. **Claude Free Tier**: Strictly constrained to a single active custom remote MCP connector per account/conversation.
2. **Claude Pro / Max / Team / Enterprise Tiers**: Supporting multiple concurrent remote custom MCP connectors (e.g., Career Hub + GitHub + Notion + Linear).

This document evaluates tool catalog economics, context window token overhead, tool-naming collision defenses, cross-connector trust boundaries, write safety invariants, and provider neutrality.

```
+---------------------------------------------------------------------------------------------------------+
|                                    CLAUDE MCP MULTI-TIER TOPOLOGY                                       |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|   +-------------------------------------------------------------------------------------------------+   |
|   |   ANTHROPIC CLAUDE CLIENT TIERS                                                                 |   |
|   |                                                                                                 |   |
|   |   [Claude Free Tier]                           [Claude Pro / Team / Enterprise Tiers]           |   |
|   |   - Exactly 1 Remote Custom MCP Connector      - Multiple Concurrent Remote MCP Connectors      |   |
|   |   - Single-Connector Workflow Focus            - Cross-Connector Coexistence & Tool Routing     |   |
|   +-----------------------+-------------------------------------------------+-----------------------+   |
|                           |                                                 |                           |
|                           | (Single Remote MCP Connection)                  | (Multi-Connector Stream)  |
|                           v                                                 v                           |
|   +-------------------------------------------------------------------------------------------------+   |
|   |   MCP STREAMABLE HTTP TRANSPORT (RFC 8707 / OAuth 2.1 Bearer Token)                             |   |
|   |   POST https://<career-hub-domain>/mcp                                                          |   |
|   +-----------------------------------------------+-------------------------------------------------+   |
|                                                   |                                                     |
|                                                   v                                                     |
|   +-------------------------------------------------------------------------------------------------+   |
|   |   CAREER HUB REMOTE MCP SERVER (Single Unified Endpoint)                                        |   |
|   |                                                                                                 |   |
|   |   +----------------------------------+  +----------------------------------+                    |   |
|   |   | Career Read Tools (4 tools)      |  | Application Artifacts (3 tools)  |                    |   |
|   |   | - get_candidate_profile          |  | - generate_tailored_resume       |                    |   |
|   |   | - list_verified_skills           |  | - draft_cover_letter             |                    |   |
|   |   | - inspect_project_evidence       |  | - recommend_portfolio_projects   |                    |   |
|   |   | - analyze_job_fit                |  +----------------------------------+                    |   |
|   |   +----------------------------------+  +----------------------------------+                    |   |
|   |                                         | Approved GitHub Writes (2 tools) |                    |   |
|   |                                         | - propose_project_improvement    |                    |   |
|   |                                         | - confirm_and_create_pr          |                    |   |
|   |                                         +----------------------------------+                    |   |
|   +-----------------------------------------------+-------------------------------------------------+   |
|                                                   |                                                     |
|                                                   v                                                     |
|   +-------------------------------------------------------------------------------------------------+   |
|   |   SOVEREIGN DOMAIN & SAFETY KERNEL                                                              |   |
|   |   - McpRequestContext Minting (Tenant & User Identity derived 100% server-side)                 |   |
|   |   - ActionApprovalTicket State Machine (Human-in-the-loop authorization gate)                   |   |
|   |   - GitHubWriteSafetyService (Dynamic default branch protection & patch sanitization)           |   |
|   |   - Zero-Hallucination Integrity Gates & SecretScrubber                                         |   |
|   +-------------------------------------------------------------------------------------------------+   |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Current Career Hub Tool Catalog Invariant

The Career Hub MCP server registers exactly **9 tools** organized across 3 functional domains:

### 2.1 Career Read Tools (Scope: `career:read` | Roles: `OWNER`, `MEMBER`, `READONLY`)
1. **`get_candidate_profile`**: Returns candidate headline, bio, experience entries, highlighted projects, and verified skill summary.
2. **`list_verified_skills`**: Returns paginated list of verified skills with confidence scores, proficiency levels, and evidence counts.
3. **`inspect_project_evidence`**: Returns detailed code-grounded evidence nodes (file paths, commit SHAs, line ranges, excerpts) for a repository project.
4. **`analyze_job_fit`**: Parses target job description, normalizes requirements, executes evidence matching, computes 100-point ATS fit score, and identifies skill gaps.

### 2.2 Application Artifact Tools (Scope: `career:write` / `career:read` | Roles: `OWNER`, `MEMBER`)
5. **`generate_tailored_resume`**: Generates evidence-grounded resume bullets aligned with target job description while enforcing strict zero-hallucination metric gates.
6. **`draft_cover_letter`**: Synthesizes authentic, commit-backed narrative cover letters tied directly to candidate code achievements.
7. **`recommend_portfolio_projects`**: Analyzes repository catalog and ranks top 3–5 projects demonstrating direct relevance and architectural density for target job families.

### 2.3 Approved GitHub Write Tools (Scope: `career:write` | Roles: `OWNER`, `MEMBER`)
8. **`propose_project_improvement`**: Analyzes missing skills and drafts an atomic feature enhancement proposal with unified diff preview, test execution report, and cryptographic patch fingerprint, minting a pending `ApprovalTicket`.
9. **`confirm_and_create_pr`**: Executes human-approved patch against a new isolated feature branch (`feat/career-hub-*`) and opens a Draft Pull Request on GitHub.

### 2.4 Architectural Invariant: Single Logical MCP Connector
All 9 tools are served by a single unified remote MCP endpoint (`POST /mcp`). The tools share a cohesive authentication facade, a unified domain context, and consistent error semantics. They MUST NOT be split into separate servers.

---

## 3. Claude Free Single-Connector Architecture & Operational Model

### 3.1 Tier Constraint Analysis
Claude Free enforces a hard ceiling of **exactly 1 active custom remote MCP connector** per user. 

### 3.2 Sufficiency Evaluation
The 9-tool Career Hub catalog is architecturally **100% self-contained and sufficient** for Claude Free users:
* **Complete End-to-End Workflow**: A user can inspect their verified skills, analyze a job posting, generate tailored application materials, propose project enhancements, and create GitHub PRs using only the single Career Hub MCP connector.
* **No External Helper Server Needed**: Because Career Hub encapsulates repository inspection, ATS scoring, document synthesis, and GitHub write execution internally, Claude Free users do not need a separate GitHub or resume-export connector.
* **Zero Missing Capabilities**: Read, artifact synthesis, and write operations coexist under the single connection without feature degradation.

### 3.3 Protocol & Context Budget Economics
Empirical analysis of the registered tool schemas confirms extreme compactness:
* Total JSON Schema size for all 9 tools: **4,338 bytes** (~**1,085 tokens**).
* In Claude's context window, 1,085 tokens represents **< 0.55%** of the context budget.
* Tool definitions declare compact Zod shapes, minimal required properties, and bounded descriptions, leaving > 99% of context available for conversation, job descriptions, and generated documents.

### 3.4 Official Anthropic Limits Notice
*Specific numerical tool count or schema payload ceilings on Claude Free servers are **not established by current repository evidence**.* However, the 9-tool catalog (4.3 KB schema) complies comfortably with standard MCP client implementations.

---

## 4. Claude Pro / Max / Team Multi-Connector Architecture

### 4.1 Multi-Connector Coexistence Topology
In Claude Pro, Max, and Team tiers, users may configure multiple simultaneous remote MCP connectors (e.g., `Career Hub`, `Official GitHub MCP`, `Notion MCP`, `Linear MCP`, `Google Drive MCP`).

```
+---------------------------------------------------------------------------------------------------+
|                                  MULTI-CONNECTOR COEXISTENCE MODEL                                |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|   +-------------------------------------------------------------------------------------------+   |
|   |   CLAUDE PRO / TEAM CONVERSATION CONTEXT                                                  |   |
|   |                                                                                           |   |
|   |   Registered Tool Namespaces in AI Context:                                               |   |
|   |   +-----------------------+ +-----------------------+ +-----------------------+           |   |
|   |   | Career Hub MCP        | | Official GitHub MCP   | | Notion MCP            |           |   |
|   |   | (9 tools)             | | (15+ tools)           | | (8+ tools)            |           |   |
|   |   | get_candidate_profile | | get_file_contents     | | get_page              |           |   |
|   |   | analyze_job_fit       | | create_issue          | | search_database       |           |   |
|   |   | confirm_and_create_pr | | create_pull_request   | | update_block          |           |   |
|   |   +-----------+-----------+ +-----------+-----------+ +-----------+-----------+           |   |
|   +---------------+-------------------------+-------------------------+-----------------------+   |
|                   |                         |                         |                           |
|                   v                         v                         v                           |
|   +---------------+-------+ +---------------+-------+ +---------------+-------+                   |
|   | Career Hub Server     | | GitHub MCP Server     | | Notion MCP Server     |                   |
|   | (OAuth 2.1 to Hub)    | | (OAuth to GitHub)     | | (OAuth to Notion)     |                   |
|   +-----------------------+ +-----------------------+ +-----------------------+                   |
+---------------------------------------------------------------------------------------------------+
```

### 4.2 Multi-Connector Risks & Mitigations
1. **Tool Name Collisions**: Multiple connectors registering identical or near-identical tool names (e.g., `create_pull_request` vs `confirm_and_create_pr`).
2. **Ambiguous Descriptions**: Vague tool descriptions leading Claude to invoke the wrong connector.
3. **Cross-Connector Prompt Injection**: Malicious instructions embedded in Notion documents or GitHub issues attempting to trigger Career Hub write actions.
4. **Context Window Saturation**: Multiple large tool schemas consuming substantial context tokens.
5. **Accidental Write Execution**: Claude choosing a direct GitHub mutation tool over Career Hub's human-approved PR flow.

---

## 5. Tool-Naming Collision Model & Collision Matrix

### 5.1 Collision Analysis Matrix

| Career Hub Tool Name | Potential Third-Party Tool Names | Collision Risk Level | Architectural Defense & Disambiguation |
| :--- | :--- | :--- | :--- |
| `get_candidate_profile` | `get_profile`, `search_profile`, `get_user` | **LOW** | Explicit prefix `candidate_profile` binds specifically to verified career persona. |
| `list_verified_skills` | `list_skills`, `get_skills`, `search_skills` | **LOW** | Qualified adjective `verified_skills` prevents confusion with generic taxonomy tools. |
| `inspect_project_evidence` | `get_evidence`, `inspect_repo`, `get_file` | **LOW** | Compound naming `project_evidence` ties directly to code-grounded proof nodes. |
| `analyze_job_fit` | `analyze_job`, `match_job`, `evaluate_fit` | **LOW** | Descriptive verb-noun `analyze_job_fit` clearly declares ATS evaluation scope. |
| `generate_tailored_resume` | `generate_resume`, `tailor_resume`, `create_doc` | **LOW** | Qualified domain name `tailored_resume` indicates ATS-targeted synthesis. |
| `draft_cover_letter` | `draft_letter`, `generate_cover_letter` | **LOW** | Specific noun `cover_letter` with action verb `draft`. |
| `recommend_portfolio_projects`| `list_projects`, `recommend_repos` | **LOW** | Specific verb-noun `recommend_portfolio_projects`. |
| `propose_project_improvement` | `propose_changes`, `create_issue`, `suggest_code` | **LOW** | Distinctive `project_improvement` domain naming. |
| **`confirm_and_create_pr`** | `create_pull_request`, `create_pr`, `open_pr` | **MEDIUM** | Distinctive compound prefix **`confirm_and_`** signals mandatory two-phase approval ticket requirement. |

### 5.2 Evaluation of Tool Namespacing (`career_*`)
* **Current State**: Career Hub tool names are already distinct and domain-specific. No collisions exist with standard MCP tool schemas.
* **Namespacing Recommendation**:
  * For Phase 10: Retain current canonical tool names (`get_candidate_profile`, etc.) to maintain 100% backward compatibility with existing Gemini integration and integration test suites.
  * For Future Roadmap (Phase 13+): If client-side routing ambiguity is observed in wild multi-connector environments, Career Hub can register tool aliases (e.g. `career_get_candidate_profile`) alongside the primary names without breaking existing clients.

---

## 6. Write Tool Safety & Multi-Connector Non-Interference

### 6.1 Defense Against Cross-Connector Write Bypass
In a multi-connector environment where both Career Hub and GitHub MCP are active, Claude might have access to:
1. `Official GitHub MCP` $\rightarrow$ `create_pull_request` (direct Git mutation using user's GitHub PAT).
2. `Career Hub MCP` $\rightarrow$ `confirm_and_create_pr` (two-phase human-approved mutation).

### 6.2 Invariant Guarantees
* **Career Hub Isolation**: Career Hub write safety does NOT depend on Claude's tool choice. Career Hub's server kernel enforces:
  1. `confirm_and_create_pr` accepts ONLY `{ ticketId, confirmed: true, idempotencyKey, userNotes }`.
  2. The patch content, target branch (`feat/career-hub-*`), base commit SHA, and files are loaded **strictly from the authenticated PostgreSQL database record** minted during `propose_project_improvement`.
  3. No external connector (GitHub, Notion, etc.) can provide or alter the patch payload.
  4. The execution is permanently validated by `GitHubWriteSafetyService` against protected branch lists, binary file filters, CI/CD workflow blocks, and high-entropy secret detection.
* **Zero Self-Approval**: Claude cannot autonomously approve a proposal. The `ActionApprovalTicket` requires an explicit, interactive human confirmation boundary before `confirm_and_create_pr` succeeds.

---

## 7. Cross-Connector Trust Boundary & Security Model

### 7.1 The Fundamental Isolation Rule: `Connector A != Connector B`
```
   [Notion MCP / External Connector] ----(Untrusted Data)----> [Claude AI Context]
                                                                        |
                                                                        | (Tool Arguments)
                                                                        v
                                                             [Career Hub MCP Server]
                                                                        |
                                                                        v
                                                        [STRICT VALIDATION & SANITIZATION]
                                                        - Zod Schema Validation
                                                        - Multi-Tenant TenantId Enforcement
                                                        - SecretScrubber Protection
                                                        - 404 Default-Deny Security Gate
```

### 7.2 Core Security Invariants
1. **Zero Implicit Trust**: Data retrieved from other MCP connectors (e.g., job descriptions from Notion, candidate notes from Google Drive) is treated as **untrusted user input**.
2. **Server-Side Identity Minting**: Career Hub derives `tenantId`, `userId`, and `role` strictly from the validated OAuth 2.1 access token. Claude cannot supply or override tenant or candidate boundaries.
3. **Secret Scrubbing**: All tool outputs pass through `SecretScrubber` before transmission to Claude, preventing credentials from leaking into Claude's context or to other connected MCP servers.
4. **Prompt Injection Defense**: Tool inputs (such as raw job description text in `analyze_job_fit` or `propose_project_improvement`) are sanitized and validated against length bounds ($\le 50\text{ KB}$) and structural schemas before domain execution.

---

## 8. Context Window & Token Budget Economics

### 8.1 Measured Schema Token Footprint

| Tool Name | JSON Schema Byte Size | Approximate Token Count |
| :--- | :--- | :--- |
| `get_candidate_profile` | 377 bytes | ~94 tokens |
| `list_verified_skills` | 373 bytes | ~93 tokens |
| `inspect_project_evidence` | 389 bytes | ~97 tokens |
| `analyze_job_fit` | 511 bytes | ~128 tokens |
| `recommend_portfolio_projects` | 529 bytes | ~132 tokens |
| `draft_cover_letter` | 533 bytes | ~133 tokens |
| `generate_tailored_resume` | 538 bytes | ~135 tokens |
| `propose_project_improvement` | 655 bytes | ~164 tokens |
| `confirm_and_create_pr` | 433 bytes | ~108 tokens |
| **TOTAL (All 9 Tools)** | **4,338 bytes** | **~1,085 tokens** |

### 8.2 Output Budget Ceilings
To prevent large responses from exhausting Claude's context or triggering rate limits, Career Hub enforces strict server-side output caps:
* `get_candidate_profile`: Max 15 KB (top 5 experience, top 5 projects, top 15 skills).
* `list_verified_skills`: Max 20 KB (paginated, default 20 items).
* `inspect_project_evidence`: Max 30 KB (paginated, max 500 chars/excerpt).
* `analyze_job_fit`: Max 25 KB.
* `generate_tailored_resume`: Max 25 KB.
* `draft_cover_letter`: Max 15 KB (3–6 paragraphs).
* `recommend_portfolio_projects`: Max 20 KB (top 3–5 projects).
* `propose_project_improvement`: Max 25 KB (diffs clamped at 4,000 chars/file, max 500 lines).

---

## 9. Tool Discovery UX & Semantic Clarity

### 9.1 Discovery Principles
When Claude connects to Career Hub via `POST /mcp` with `tools/list`:
1. **Descriptive Descriptions**: Every tool defines a clear, single-sentence summary declaring exactly what data it requires and what it produces.
2. **Clear Parameter Guidance**: All arguments carry `.describe(...)` metadata explaining their purpose, default behavior, and constraints.
3. **Advisory Annotations (MCP 2026-07-28)**:
   * Read tools declare `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`.
   * Artifact tools declare `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`.
   * Write proposal declares `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`.
   * Write confirmation declares `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`.

---

## 10. Provider Neutrality & Inverse Authority

### 10.1 Invariant Confirmation
Connecting Claude introduces **zero provider-specific coupling**:
* **Claude is an Interchangeable Interface**: Claude communicates strictly via standard Streamable HTTP MCP JSON-RPC 2.0.
* **Inverse Authority Maintained**:
  * Claude has **ZERO authority** over verified candidate facts, ATS scores, skill evidence, or approval tickets.
  * Claude cannot fabricate verified skills or bypass evidence linking.
  * Claude cannot write directly to PostgreSQL or execute Git commands.
* **Identical Backend for Gemini and Claude**: The domain services (`CandidateProfileService`, `EvidenceMatchingService`, `AtsFitScoreService`, `GitHubWriteService`) execute identically regardless of whether the caller is Google Gemini or Anthropic Claude.

---

## 11. Security Review & Standard Compatibility

### 11.1 Security Matrix

| Security Domain | Standard / Mechanism | Implementation Status | Invariant Enforced |
| :--- | :--- | :--- | :--- |
| **Authentication** | OAuth 2.1 + PKCE S256 | `COMPLETE` | RFC 7636 S256 mandatory; plaintext PKCE forbidden. |
| **Resource Binding** | RFC 8707 Resource Indicators | `COMPLETE` | Tokens bound strictly to MCP endpoint URL. |
| **Metadata Discovery** | RFC 9728 & RFC 8414 | `COMPLETE` | Standard discovery endpoints at `/.well-known/*`. |
| **Token Lifecycle** | Refresh Token Rotation (RTR) | `COMPLETE` | Single-use refresh tokens; replay triggers revocation. |
| **Tenant Isolation** | Sovereign Context (PostgreSQL) | `COMPLETE` | 404 default-deny on cross-tenant access. |
| **Scope Ceilings** | `career:read`, `career:write` | `COMPLETE` | Clamped to user role (`ROLE_SCOPE_CEILINGS`). |
| **Perimeter Defense** | TLS 1.2+, Origin Validation | `COMPLETE` | Origin header matched to block DNS rebinding. |
| **Write Safety** | Approval Ticket State Machine | `COMPLETE` | Physical human approval required before PR creation. |

---

## 12. Failure Modes & Remediation Protocol

| Failure Scenario | Trigger Condition | System Behavior | User/Client Remediation |
| :--- | :--- | :--- | :--- |
| **F-01: Connector Unavailable** | Network interruption / server restart | Claude receives HTTP 502/503 or connection timeout. | Claude prompts user to check connection status. Server auto-recovers. |
| **F-02: OAuth Token Expired** | Access token exceeds TTL (1 hour) | Server returns `401 Unauthorized` (`McpErrorCode.UNAUTHENTICATED`). | Claude automatically executes background refresh token exchange using stored refresh token. |
| **F-03: Refresh Token Replay** | Stale refresh token reused | Server revokes token family and returns `400 Bad Request`. | User is prompted to re-authenticate via OAuth login. |
| **F-04: Tool Name Collision** | Multiple connectors register same name | Client disambiguation error or unpredictable tool selection. | User selects specific connector in Claude UI. Tools use domain-specific names. |
| **F-05: Malformed Tool Arguments** | Claude generates invalid JSON schema input | Fastify/Zod schema validation rejects request with `-32602 Invalid Params`. | Claude receives detailed schema error and re-prompts with corrected arguments. |
| **F-06: Cross-Connector Injection** | Malicious text in external data source | Ingestion layer sanitizes input; `SecretScrubber` strips tokens. | Injection is neutralized. Proposal diffs require human review. |
| **F-07: Unapproved Write Invocation** | Claude attempts `confirm_and_create_pr` without valid ticket | Server rejects with `404 Not Found` or `400 Invalid Ticket State`. | Claude must first invoke `propose_project_improvement` and obtain human review. |
| **F-08: Stale Base Commit SHA** | Remote repository HEAD changes during review | Server rejects with `409 Conflict` (`StaleHeadShaError`). | Claude must re-generate proposal against current repository HEAD. |

---

## 13. Test Requirements for Multi-Connector Verification

Future deterministic verification suites should cover:
1. **Tool Catalog Discovery Contract**: Assert exact 9 tools registered with valid schemas and 2026-07-28 annotations.
2. **Schema Budget Invariant**: Assert total tool definition payload $\le 10\text{ KB}$ ($\sim 2,500$ tokens).
3. **Cross-Connector Argument Isolation**: Assert write tools strictly reject arbitrary client patches.
4. **OAuth Token Resource Indicator Binding**: Assert RFC 8707 parameter validation on authorize and token endpoints.
5. **Output Budget Clamping**: Assert all tool responses conform to defined byte ceilings.

---

## 14. Manual Setup Requirements

* **For Architecture Review (`ARCH-038` / `P10-002A`)**: **Zero manual setup required.**
* **For Production End-User Operation**: Users connect Claude by navigating to Claude Settings $\rightarrow$ Integrations $\rightarrow$ Add Custom Connector, entering the Career Hub MCP URL, and completing the standard OAuth 2.1 login and consent flow once.

---

## 15. Implementation Decision

* **Backend Code Changes Required**: **`NO`**.
* **Rationale**: The existing backend architecture already natively satisfies all single-connector (Claude Free) and multi-connector (Claude Pro/Team) operational requirements:
  1. The 9-tool catalog is exposed on a single unified Streamable HTTP endpoint (`POST /mcp`).
  2. Schema size is exceptionally compact (4.3 KB / ~1,085 tokens).
  3. OAuth 2.1 with PKCE and RFC 8707 resource binding is fully implemented and verified.
  4. Write safety is strictly enforced at the database and execution kernel level, making write bypass impossible regardless of how many connectors are active in the client.

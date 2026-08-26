# ARCH-041: ChatGPT Tier Compatibility, Tool Context Economics & Multi-Connector Coexistence Review

**Status**: APPROVED  
**Security Level**: Public Perimeter & Multi-Connector AI Client Integration  
**Target AI Client**: OpenAI ChatGPT (ChatGPT Free, Plus, Pro, Team, Enterprise, Edu, Developer Mode)  
**Governing Standards**: Model Context Protocol (MCP) Streamable HTTP Spec 2026-07-28, RFC 8707 (Resource Indicators for OAuth 2.0), RFC 9700 (OAuth 2.1 / BCP), RFC 9728 (Protected Resource Metadata), RFC 8414  
**Governing ADR**: ADR-062 (`docs/decisions.md`)  
**Prerequisite Architecture**: ARCH-040 (`docs/chatgpt-mcp-connector-architecture.md`), ARCH-038 (`docs/claude-tier-compatibility-architecture.md`), ARCH-022 (`docs/mcp-server-architecture.md`), ARCH-035 (`docs/mcp-write-tools-architecture.md`)  

---

## 1. Executive Summary & Strategic Context

In **Phase 11 (Task P11-001 & ARCH-040)**, Antigravity Career Hub established standard public HTTPS OAuth 2.1 + PKCE S256 connectivity with RFC 8707 Resource Indicators for **OpenAI ChatGPT**. The server exposes a cohesive 9-tool catalog spanning Career Read, Application Artifact, and Approved GitHub Write operations.

**ARCH-041** provides the formal architectural and compatibility review for connecting ChatGPT across different subscription tiers and operational topologies:
1. **ChatGPT Plus / Pro / Free Developer Mode**: Personal AI workflows connecting custom MCP servers with OAuth 2.1 authentication.
2. **ChatGPT Team / Enterprise / Edu**: Workspace-level connector governance, multiple concurrent custom MCP servers (e.g., Career Hub + GitHub + Jira + Notion), and organization-managed authentication.

This document evaluates tool catalog economics, context window token overhead, tool-naming collision defenses, cross-connector trust boundaries, write safety invariants, and provider neutrality.

```
+---------------------------------------------------------------------------------------------------------+
|                                    CHATGPT MCP MULTI-TIER TOPOLOGY                                      |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|   +-------------------------------------------------------------------------------------------------+   |
|   |   OPENAI CHATGPT CLIENT TIERS                                                                   |   |
|   |                                                                                                 |   |
|   |   [ChatGPT Plus / Pro / Free Dev Mode]         [ChatGPT Team / Enterprise / Edu Tiers]          |   |
|   |   - Personal MCP Developer Mode                - Workspace-Level Managed MCP Connectors         |   |
|   |   - Single / Multi Custom MCP Connectors       - Cross-Connector Coexistence & Enterprise Auth  |   |
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
|   |   +---------------------------------------------------------------------------------------------+   |
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

## 3. Tool Context Token Economics for ChatGPT

When ChatGPT indexes an MCP server, tool definitions and JSON schemas are injected into the system prompt context. Minimizing this footprint is essential to preserve context budget for user conversation and candidate evidence analysis.

| Tool Name | Domain Group | Schema Size (Bytes) | Estimated Context Tokens (GPT-4o / o1) | Description |
| :--- | :--- | :--- | :--- | :--- |
| `get_candidate_profile` | Career Read | 412 B | ~95 tokens | Candidate summary, bio, projects, verified skills |
| `list_verified_skills` | Career Read | 490 B | ~115 tokens | Paginated verified skills with confidence scores |
| `inspect_project_evidence` | Career Read | 548 B | ~130 tokens | Pinned evidence nodes and code excerpts |
| `analyze_job_fit` | Career Read | 620 B | ~150 tokens | 100-point ATS score & skill gap analysis |
| `generate_tailored_resume` | Artifact | 465 B | ~110 tokens | Evidence-grounded resume bullets |
| `draft_cover_letter` | Artifact | 440 B | ~105 tokens | Targeted commit-backed narrative letter |
| `recommend_portfolio_projects` | Artifact | 480 B | ~115 tokens | Top 3-5 ranked projects with case studies |
| `propose_project_improvement` | Write Gate | 560 B | ~135 tokens | Proposes code additions with diff preview & ticket |
| `confirm_and_create_pr` | Write Action | 323 B | ~80 tokens | Executes approved ticket to Draft PR |
| **TOTAL CATALOG** | **9 Tools** | **4,338 B** | **~1,035 tokens** | **< 0.85% of standard 128k context** |

### Key Economic Insight:
The entire 9-tool Career Hub catalog consumes only **~1,035 tokens**, leaving **> 99.1%** of ChatGPT's 128k context window available for repository analysis, large job descriptions, and deep multi-turn career coaching conversations.

---

## 4. Multi-Connector Coexistence & Collision Avoidance

In ChatGPT Team / Enterprise environments, users frequently configure multiple custom actions and MCP connectors concurrently (e.g., Career Hub + GitHub MCP + Jira MCP + Slack MCP).

### 4.1 Naming Collision Evaluation

| Career Hub Tool | Potential External Conflict | Collision Risk | Architectural Defense |
| :--- | :--- | :--- | :--- |
| `get_candidate_profile` | `get_user_profile` (Generic) | **Low** | Specifically names candidate career domain (`candidate_profile`). |
| `list_verified_skills` | `list_skills` (Generic) | **Low** | Explicitly scoped to verified evidence skills (`verified_skills`). |
| `inspect_project_evidence`| `get_file` / `read_code` | **Low** | Scoped to career evidence analysis rather than general file reading. |
| `analyze_job_fit` | `match_job` (Generic) | **Low** | Clear domain-specific terminology (`analyze_job_fit`). |
| `generate_tailored_resume`| `create_resume` | **Low** | Specific to evidence tailoring (`generate_tailored_resume`). |
| `draft_cover_letter` | `write_letter` | **Low** | Specific to career application artifacts (`draft_cover_letter`). |
| `recommend_portfolio_projects`| `list_repos` | **Low** | Scoped to career portfolio recommendations. |
| `propose_project_improvement` | `create_patch` | **Low** | Scoped to skill-gap project improvement proposal. |
| `confirm_and_create_pr` | `create_pull_request` (GitHub MCP) | **Low** | Distinct semantics: operates on `ticketId` rather than raw Git parameters. |

### 4.2 Cross-Connector Trust Boundary
- **Rule**: `Connector A != Connector B`. Career Hub NEVER trusts data from external MCP connectors (e.g., a third-party resume parser or external GitHub MCP) as verified evidence.
- All candidate skills and projects MUST be verified through Career Hub's authenticated resource connectors and cryptographic evidence linkers.
- External payloads passed into Career Hub MCP tools undergo strict Zod schema validation and PII/secret scrubbing via `SecretScrubber`.

---

## 5. Write Safety & Human-in-the-Loop Isolation

1. **Two-Phase Approval Gate**: ChatGPT cannot perform direct code writes, file edits, or pull request creation in a single step.
2. **Stopping Protocol**: `propose_project_improvement` returns structured diffs, test execution reports, and explicit stopping instructions requiring human review.
3. **Execution Guard**: `confirm_and_create_pr` requires boolean `confirmed: true` and a valid, unexpired `ticketId`. It rejects any attempt to supply modified code or alter branch targets.
4. **Dynamic Default Branch Protection**: Enforced server-side by `GitHubWriteSafetyService`. Mutations are restricted to `feat/career-hub-*` branches; default branches (`main`, `master`) are immutable.

---

## 6. Provider Neutrality & Inverse Authority Invariant

- **Principle**: ChatGPT is an interchangeable consumer interface. It possesses **zero authority** over business logic, ATS scoring, candidate verification status, or Git permissions.
- All scoring formulas, evidence integrity gates, and rate limits are computed authoritatively by Career Hub backend services.
- If ChatGPT sends spoofed assertions (e.g., `atsScore: 100` or `status: VERIFIED`), Career Hub's deterministic domain services ignore or reject the input.

---

## 7. Architectural Acceptance & Status

- **Conclusion**: Career Hub's existing 9-tool MCP catalog, Streamable HTTP transport, and OAuth 2.1 implementation seamlessly support all OpenAI ChatGPT tiers (Free, Plus, Pro, Team, Enterprise, Edu) with **zero backend code changes required**.
- **Status**: **APPROVED (ARCH-041 / ADR-062)**.

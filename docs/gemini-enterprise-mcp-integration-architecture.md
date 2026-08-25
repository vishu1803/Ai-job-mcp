# Gemini Enterprise & Google AI Studio Custom MCP Connector Integration Architecture (ARCH-029)

**Document ID**: `ARCH-029`  
**Phase**: Phase 8 (Task P8-005A)  
**Parent Specifications**: `goal.md`, `project.md`, `docs/mcp-server-architecture.md` (`ARCH-020`), `docs/mcp-streamable-http-architecture.md` (`ARCH-021`), `docs/mcp-api-tokens-architecture.md` (`ARCH-022`), `docs/mcp-career-read-tools-architecture.md` (`ARCH-023`), `docs/mcp-application-artifact-tools-architecture.md` (`ARCH-024`), `docs/gemini-integration-architecture.md` (`ARCH-026`), `docs/vertex-ai-gemini-architecture.md` (`ARCH-028`)  
**Decision Record**: `docs/decisions.md` (`ADR-050`)  
**Status**: APPROVED & ARCHITECTURE REVIEW COMPLETE  
**Author**: Antigravity Core Architecture & Cloud Integration Team  
**Date**: 2026-08-24  

---

## 1. Executive Summary & Problem Context

In **Phase 7** and **Phase 8**, the Antigravity Career Hub developed and verified:
1. A production-grade **Streamable HTTP Remote MCP Server** (`src/mcp/server.js`, `src/routes/mcp.routes.js`) exposing 7 career tools over `POST /mcp` authenticated via scoped Bearer API tokens (`mcp_token_*`).
2. An **Inverse-Authority AI Integration Engine** (`AiProvider`, `GeminiProviderAdapter`, `GeminiVertexAdapter`, `TaskPolicyRegistry`, `PromptPolicyRegistry`) ensuring that AI clients explain and format candidate data without the authority to fabricate skills or alter ATS scores.

Task **P8-005** specifies:
> *"Configure Gemini Enterprise / Gemini Developer Studio custom connector integration documentation"*

Because Google's AI product ecosystem, branding, and tool integration interfaces have evolved rapidly (e.g. Google AI Studio, Vertex AI Agent Builder, Gemini Enterprise in Google Workspace, and the open Model Context Protocol), this architecture review (**P8-005A**) disambiguates the current 2026 Google landscape, clarifies the relationship between "Custom Connectors" and "Remote MCP Servers", and establishes a unified integration specification.

---

## 2. 2026 Google AI Ecosystem Taxonomy & Tool Integration Topology

Google provides four distinct integration tiers for connecting Gemini models to external systems:

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                               2026 GOOGLE AI ECOSYSTEM                                   │
├──────────────────────────┬──────────────────────────┬────────────────────────────────────┤
│ 1. Developer Prototyping │ 2. Enterprise Agents     │ 3. Enterprise Workplace            │
│    Google AI Studio      │    Vertex AI Agent       │    Gemini Enterprise               │
│    (aistudio.google.com) │    Builder & ADK         │    (Google Workspace)              │
├──────────────────────────┼──────────────────────────┼────────────────────────────────────┤
│ • Gemini Developer API   │ • Enterprise Agent       │ • Google Workspace with Gemini     │
│ • Function Calling /     │   Orchestration          │ • Connected Apps & Custom          │
│   Interactions API       │ • Native Streamable HTTP │   MCP Server Data Stores           │
│ • OpenAPI 3.0 Tool       │   MCP Tool Integration   │ • Discovery Engine Search & Batch  │
│   Declarations           │ • Multi-Agent (A2A)      │   Data Connectors                  │
│ • System Instructions    │ • Cloud Run Endpoints    │ • Zero data retention for training │
└──────────────────────────┴──────────────────────────┴────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                      ANTIGRAVITY CAREER HUB REMOTE MCP SERVER                            │
│                     (Streamable HTTP Endpoint: POST /mcp)                                │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ • Authentication: Scoped Bearer API Tokens (mcp_token_*)                                 │
│ • Tenant Context: Multi-Tenant Sovereign Default-Deny (404 Isolation)                    │
│ • Tool Catalog (7 Tools):                                                                │
│   - Read Tools (career:read): get_candidate_profile, list_verified_skills,               │
│                               inspect_project_evidence, analyze_job_fit                  │
│   - Artifact Tools (career:write): generate_tailored_resume, draft_cover_letter,         │
│                                   recommend_portfolio_projects                           │
│ • Protocol: JSON-RPC 2.0 (tools/list, tools/call) + OpenAPI 3.0 Compatibility Schema    │
│ • Security Invariants: Zero DB mutations from read tools, PII/Secret Scrubbing,          │
│   non-blocking audit logging (mcp.tool.completed)                                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Disambiguation: "Custom Connectors" vs. "Model Context Protocol (MCP)"

In Google Cloud and enterprise terminology, there are two distinct mechanisms for external system integration:

| Dimension | Discovery Engine Custom Connectors (Batch Ingestion) | Remote MCP Server (Real-Time Runtime Tools) |
| :--- | :--- | :--- |
| **Primary Purpose** | Asynchronous batch crawling, indexing, and semantic search over large static document corpora. | Synchronous, real-time tool execution, structured analysis, and artifact generation. |
| **Interaction Flow** | **Fetch $\rightarrow$ Transform $\rightarrow$ Index**: Crawls external APIs on a recurring schedule and ingests JSON/PDFs into a Discovery Engine data store. | **Reason $\rightarrow$ Discover $\rightarrow$ Call $\rightarrow$ Return**: AI model inspects live schemas and calls tools on demand during a conversational turn. |
| **Data Freshness** | Bounded by indexing sync schedule (e.g. hourly/daily). | **Live real-time**: Instant access to latest GitHub commits, verified candidate profile, and active job requirements. |
| **State Mutation** | Read-only indexation. | Supports controlled write/artifact generation (`draft_cover_letter`, `generate_tailored_resume`). |
| **Antigravity Fit** | Unnecessary for live career reasoning; high storage/caching overhead. | **PRIMARY ARCHITECTURE**: Matches Antigravity's multi-tenant, zero-hallucination, evidence-linked career intelligence engine. |

**Architectural Decision**: Antigravity Career Hub standardizes on the **Model Context Protocol (MCP)** over Streamable HTTP as the universal runtime tool integration interface for all Gemini clients (Developer, Vertex, Enterprise).

---

## 4. Multi-Channel Integration Architecture

The Antigravity Career Hub supports three distinct integration channels, allowing any Gemini platform to connect seamlessly:

### Channel 1: Native Streamable HTTP Remote MCP Integration (Primary)
* **Target Clients**: Google Cloud Vertex AI Agent Builder, Agent Development Kit (ADK), Gemini CLI, Antigravity IDE, Anthropic Claude Desktop, OpenAI ChatGPT Developer Mode.
* **Protocol**: MCP JSON-RPC 2.0 over Streamable HTTP (`POST /mcp`).
* **Configuration Format**:
  ```json
  {
    "mcpServers": {
      "antigravity-career-hub": {
        "url": "https://<your-domain>/mcp",
        "transport": "http",
        "headers": {
          "Authorization": "Bearer mcp_token_<your-token>",
          "Content-Type": "application/json"
        }
      }
    }
  }
  ```
* **Capabilities Negotiated**: `tools/list`, `tools/call`.

---

### Channel 2: OpenAPI 3.0 / Gemini Function Declaration Gateway (Schema Export)
* **Target Clients**: Google AI Studio Prompts / Workspaces, Vertex AI Extensions, custom frontend agents requiring static OpenAPI specifications.
* **Mechanism**: The 7 MCP tools are exported as standard Gemini `FunctionDeclarations` / OpenAPI 3.0 operation schemas:
  - `POST /mcp` receives standard JSON-RPC `tools/call` dispatched by the hosting runtime.
  - Can be manually pasted or imported into Google AI Studio system prompts as structured function definitions.
* **Example Function Declaration Schema (`analyze_job_fit`)**:
  ```json
  {
    "name": "analyze_job_fit",
    "description": "Calculates deterministic ATS fit score, requirement match matrix, and verified skill density for a candidate against a target job description.",
    "parameters": {
      "type": "OBJECT",
      "properties": {
        "candidateId": { "type": "STRING", "description": "Candidate profile UUID" },
        "jobDescription": { "type": "STRING", "description": "Full job description text" }
      },
      "required": ["candidateId", "jobDescription"]
    }
  }
  ```

---

### Channel 3: Gemini Enterprise / Google Workspace Connected App Data Store
* **Target Clients**: Gemini Enterprise (Google Workspace users accessing Gemini side panels in Gmail, Docs, and Drive).
* **Mechanism**: 
  1. Google Cloud Administrator navigates to **Google Cloud Console $\rightarrow$ Gemini Enterprise $\rightarrow$ Connected Apps**.
  2. Selects **Add Custom MCP Server Data Store**.
  3. Configures:
     - **Server URL**: `https://<your-domain>/mcp`
     - **Authentication**: Bearer Token with header `Authorization: Bearer mcp_token_...`
     - **Scope**: Career Read / Artifact Generation
  4. Authorizes enterprise organizational units (OUs) to access the Career Hub tool suite directly within Google Workspace sidebars.

---

## 5. End-to-End Security & Trust Boundaries

Connecting an external Gemini client to the Remote MCP Server enforces strict security guarantees:

```
[External Gemini Client / AI Studio / Vertex AI]
                       │
                       │ 1. HTTPS POST /mcp (JSON-RPC 2.0)
                       │    Header: Authorization: Bearer mcp_token_xxx
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 FASTIFY MCP ROUTE HANDLER                   │
│ 1. Token Verification: SHA-256 hash lookup in database      │
│ 2. Tenant Context Minting: Extracts tenantId, userId, role  │
│ 3. Scope Gate: Verifies career:read vs career:write         │
│ 4. Rate Limiter: Enforces 60-300 RPM ceiling per token      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 MCP SERVER RUNTIME DISPATCH                 │
│ 1. Tools Whitelist Assert: Only 7 approved tools permitted  │
│ 2. Argument Validation: Strict Zod schema parsing           │
│ 3. Tenant Isolation Guard: assertTenantId matches record    │
│ 4. Inverse Authority Gate: Read tools cause 0 DB mutations   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 OUTPUT SANITIZATION & AUDIT                 │
│ 1. Output Clamping: 15 KB profile / 500-char evidence max   │
│ 2. Secret Scrubbing: Strips API keys, passwords, PII tokens │
│ 3. Failure-Isolated Audit: mcp.tool.completed in PostgreSQL │
└─────────────────────────────────────────────────────────────┘
```

1. **Zero Database Mutation from Read Tools**: `get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, and `analyze_job_fit` execute pure in-memory read queries against PostgreSQL.
2. **Sovereign Multi-Tenant Isolation**: An API token issued to Tenant A will return `404 NOT_FOUND` if queried with a `candidateId` or `projectId` belonging to Tenant B.
3. **No Private Keys / Secret Leakage**: `SecretScrubber` strips all tokens and credentials prior to JSON-RPC response serialization.
4. **Failure-Isolated Audit Trail**: Telemetry is recorded in `audit_logs` asynchronously without blocking or failing user tool responses.

---

## 6. Deliverables Specification for Task P8-005

In **P8-005**, the team will produce:
1. **User & Administrator Integration Guide** ([`docs/gemini-enterprise-mcp-integration.md`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/gemini-enterprise-mcp-integration.md)):
   - Prerequisites & Token Minting Walkthrough.
   - Section 1: Google Cloud Vertex AI Agent Builder & ADK Setup.
   - Section 2: Google AI Studio Prototyping & Function Calling Walkthrough.
   - Section 3: Gemini Enterprise / Google Workspace Connected App Configuration.
   - Section 4: Local Developer Setup (Gemini CLI / Antigravity IDE).
   - Section 5: Troubleshooting, Diagnostic Curl Commands, and Error Code Reference.
2. **Verification & Testing**:
   - Verify Remote MCP handshake with standard JSON-RPC 2.0 curl payloads across both `career:read` and `career:write` tools.
   - Verify zero secret exposure in documentation examples (using standard synthetic placeholders `mcp_token_...`).

---

## 7. Architecture Review Signoff Checklist

- [x] Researched official 2026 Google AI Studio, Vertex AI Agent Builder, and Gemini Enterprise capabilities.
- [x] Disambiguated Custom Data Connectors (batch ingestion) vs. Remote MCP Server (runtime tool execution).
- [x] Defined 3 integration channels (Native MCP, OpenAPI Gateway, Enterprise Connected App).
- [x] Preserved sovereign multi-tenant isolation, token scoping, and inverse authority principles.
- [x] Defined concrete implementation deliverables for Task P8-005.

**Recommendation**: **`P8-005A APPROVED`**. Proceed to execute Task P8-005 upon user instruction.

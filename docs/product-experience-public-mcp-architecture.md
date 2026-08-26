# Architectural Specification: Product Experience, Public MCP, Routing Topology & MCP Apps

**Architecture Identifier**: `ARCH-051`  
**Related Decision Records**: `ADR-071` (Pending Acceptance)  
**Phase**: Phase 13.5 (Product Experience, Public MCP & Career Document Onboarding)  
**Status**: `PROPOSED / ARCHITECTURE REVIEW`  
**Date**: 2026-08-26  

---

## 1. Executive Summary & Problem Context

Antigravity Career Hub has achieved 100% verification across Phases 0–13, delivering a provider-neutral Model Context Protocol (MCP) server, deterministic evidence matching, zero-hallucination integrity gates, two-phase write safety, sovereign multi-tenant isolation, and OAuth 2.1 authorization across Gemini, Claude, and ChatGPT.

However, a critical product gap exists between the current backend protocol engine and a real-world, user-facing public product:
1. **Lack of Human-Facing Web Experience**: There is currently no web UI for a human user to discover the product, register via browser, inspect their candidate dashboard, manage connected GitHub repositories, view parsed skills, or generate/manage AI connection tokens visually.
2. **MCP Discoverability & Documentation**: Potential users and AI developers need an interactive, public documentation portal (`/docs/mcp`) and compliance with the official **MCP Registry** (`registry.modelcontextprotocol.io`) standard (`server.json`).
3. **Interactive UI inside AI Clients**: The 2026-07-28 MCP specification introduced the **MCP Apps** extension (`io.modelcontextprotocol/ui`), allowing MCP servers to render rich, interactive sandboxed iframes (e.g. radar charts, code evidence trees, diff inspectors) directly inside AI hosts such as Claude and ChatGPT.

This document defines the complete human product experience, clean web routing topology, AI connection center, public MCP documentation, MCP Registry readiness, and MCP Apps extension architecture.

---

## 2. Web Routing Topology & Endpoint Architecture

To maintain strict architectural separation between the **Model Context Protocol (MCP) transport** and the **Human Web Application**, the platform establishes a clean, decoupled endpoint topology:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Career Hub Fastify Ingress                        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         │                                                   │
         ▼                                                   ▼
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│     Human Web Application (UI)   │        │   Machine Protocol APIs & MCP    │
├──────────────────────────────────┤        ├──────────────────────────────────┤
│ /              Landing Page      │        │ /mcp           Remote MCP Server │
│ /login         Auth Portal       │        │ /oauth/*       OAuth 2.1 RFC 8414│
│ /onboarding    Setup Wizard      │        │ /.well-known/* RFC 9728 Discovery│
│ /dashboard     Candidate Home    │        │ /api/*         REST API Services │
│ /resumes       Resume Manager    │        │ /webhooks/*    GitHub Webhooks   │
│ /applications  Job Tracker       │        │ /livez, /healthz Health Probes   │
│ /connect       AI Hub & Tokens   │        └──────────────────────────────────┘
│ /settings      Security & GDPR   │
│ /docs/mcp      Public MCP Docs   │
└──────────────────────────────────┘
```

### 2.1 Strict Protocol Invariants
* **`POST /mcp`**: The authoritative MCP JSON-RPC protocol endpoint over Streamable HTTP (2026-07-28 standard). It strictly handles JSON-RPC tool calls, resource requests, and prompt evaluations with Bearer authentication. It **NEVER** serves HTML or web pages.
* **`GET /mcp`**: Handles MCP SSE streaming / Streamable HTTP metadata handshakes. Returns protocol discovery envelopes, never browser redirects.
* **`/` (Root)**: Serves the public, human-facing landing page showcasing the value proposition, live interactive product demonstration, verified statistics, and one-click GitHub authentication.

---

## 3. Human Web Application Architecture & Design System

The frontend is constructed using high-performance, responsive HTML5 and Vanilla CSS with zero heavy frontend framework overhead, ensuring fast load times (<100ms), zero bundling bloat, and total aesthetic appeal:

### 3.1 Design Aesthetics & Tokens
* **Color Palette**: Curated dark-mode theme utilizing deep slate backgrounds (`#0B0F19`, `#111827`), glassmorphic panels (`rgba(31, 41, 55, 0.65)` with `backdrop-filter: blur(12px)`), vibrant electric indigo accents (`#6366F1`), cyan telemetry highlights (`#06B6D4`), and emerald verification badges (`#10B981`).
* **Typography**: Modern font stack (`Inter`, `system-ui`) with clear typographic hierarchy and monospace evidence citations (`JetBrains Mono`).
* **Micro-Animations**: Smooth CSS transitions on card hovers, status badge pulses, interactive match score progress arcs, and collapsible evidence trees.

### 3.2 Human Navigation Views
1. **Landing Page (`/`)**: Hero section, "Truth in AI vs Hallucination" comparison, live demo preview, features grid, supported AI clients (Gemini, Claude, ChatGPT), verified security guarantees, and call to action.
2. **Authentication Portal (`/login`)**: GitHub OAuth 2.1 initiation with PKCE S256, state validation, and automatic post-login redirection.
3. **Onboarding Wizard (`/onboarding`)**: 4-step wizard guiding new candidates through profile setup, GitHub App installation, repository selection, and base resume upload.
4. **Candidate Dashboard (`/dashboard`)**: Central hub displaying candidate headline, verified skill cloud (categorized by taxonomy), top showcase projects, and real-time AST evidence metrics.
5. **Connected Sources Hub (`/dashboard/sources`)**: Visual interface for adding/removing GitHub repositories, initiating scans, inspecting file trees, and reviewing secret-scrubbing logs.
6. **Career Document Management (`/resumes`)**: Multi-resume uploader, parsed section review, claim-to-evidence alignment view, and tailored document history.
7. **Job Application Kanban (`/applications`)**: Drag-and-drop interview tracking board with stage details, compensation tracking, and attached resume snapshots.
8. **AI Connection Center (`/connect`)**: Visual connection cards for Gemini, Claude, and ChatGPT, personal MCP API token generator, OAuth client status, scope inspector, and one-click revocation.
9. **Account & Privacy Settings (`/settings`)**: Session management, GitHub credential disconnect, audit log download, and GDPR Article 17 hard account erasure.
10. **Public MCP Documentation (`/docs/mcp`)**: Interactive API & Tool explorer with real-time JSON schema inspection, copyable config snippets for `claude_desktop_config.json`, and ChatGPT action OpenAPI manifests.

---

## 4. AI Connection Center Architecture

The AI Connection Center (`/connect`) provides an intuitive, secure interface for managing third-party AI client access:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AI Connection Center (/connect)                 │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌────────────────────────┐  ┌────────────────────────┐  ┌───────────┐ │
│  │   Anthropic Claude     │  │    OpenAI ChatGPT      │  │ Google... │ │
│  ├────────────────────────┤  ├────────────────────────┤  ├───────────┤ │
│  │ Status: CONNECTED      │  │ Status: CONNECTED      │  │ Status:...│ │
│  │ Client: claude-web     │  │ Client: custom-gpt     │  │ Token: ...│ │
│  │ Protocol: OAuth 2.1    │  │ Protocol: OAuth 2.1    │  │ Scope: ...│ │
│  │ Scopes: career:read/wr │  │ Scopes: career:read    │  │           │ │
│  │ [Revoke Access]        │  │ [Revoke Access]        │  │ [Generate]│ │
│  └────────────────────────┘  └────────────────────────┘  └───────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Security Invariants
* **Zero Secret Exposure**: Plaintext access tokens are never displayed in the UI after issuance. Refresh tokens and installation keys remain strictly on the backend.
* **Granular Role Ceilings**: UI clearly denotes whether a connected client possesses `READONLY` (`career:read`) or `MEMBER` (`career:read`, `career:write`) capabilities.
* **Instant Revocation**: Revoking a client immediately invalidates the entire token family in PostgreSQL, causing subsequent MCP calls to fail with `401 UNAUTHENTICATED`.

---

## 5. Official MCP Registry Integration

The official Model Context Protocol Registry (`registry.modelcontextprotocol.io`) acts as the decentralized directory for public MCP servers.

### 5.1 Registry Specification Standard (`server.json`)
Career Hub publishes its public registry manifest conforming to the 2026-07-28 registry specification:

```json
{
  "$schema": "https://schema.modelcontextprotocol.io/v1/server.json",
  "name": "io.github.vishu1803.career-hub",
  "displayName": "Antigravity Career Hub",
  "description": "Universal, evidence-backed career intelligence and job application platform anchored in authentic repository code.",
  "version": "1.0.0",
  "homepage": "https://staging.careerhub.ai",
  "repository": {
    "type": "git",
    "url": "https://github.com/vishu1803/Ai-job-mcp"
  },
  "license": "Apache-2.0",
  "transport": {
    "type": "http",
    "url": "https://staging.careerhub.ai/mcp"
  },
  "authentication": {
    "type": "oauth2",
    "authorizationUrl": "https://staging.careerhub.ai/oauth/authorize",
    "tokenUrl": "https://staging.careerhub.ai/oauth/token",
    "scopes": {
      "career:read": "Read verified candidate profile, skills, projects, and evidence",
      "career:write": "Generate tailored resumes, cover letters, and track applications"
    }
  },
  "capabilities": {
    "tools": true,
    "resources": true,
    "prompts": true,
    "ui": true
  }
}
```

### 5.2 Registry Verification & Publishing Checklist
1. **Domain Ownership Verification**: Host `.well-known/mcp-server` containing signed cryptographic challenge on `staging.careerhub.ai` or configure DNS TXT verification record.
2. **OAuth Discovery Compliance**: Maintain RFC 8414 (`/.well-known/oauth-authorization-server`) and RFC 9728 (`/.well-known/oauth-protected-resource`) metadata discovery endpoints.
3. **Health SLA**: Ensure `GET /healthz` meets public uptime and latency SLAs (<500ms p95).
4. **Deprecation & Versioning Strategy**: Follow semantic versioning (`v1.x.x`) with backwards-compatible tool definitions.

---

## 6. MCP Apps Extension Architecture (`io.modelcontextprotocol/ui`)

As standardized in the 2026-07-28 MCP release, **MCP Apps** enable MCP servers to deliver interactive user interfaces directly inside AI clients (Claude Desktop/Web, ChatGPT, and compatible hosts).

### 6.1 Protocol Architecture
* **Extension Identifier**: `io.modelcontextprotocol/ui`
* **Resource URI Scheme**: `ui://<server-name>/<app-id>`
* **MIME Profile**: `text/html;profile=mcp-app`
* **Security Model**: The host renders the UI inside a sandboxed HTML5 iframe with strict `sandbox="allow-scripts allow-forms allow-same-origin"` policies, preventing unauthorized DOM or parent window access.
* **Bidirectional JSON-RPC**: The embedded iframe communicates with the Career Hub server via `window.parent.postMessage` / MCP client bridge to execute tool calls and receive dynamic updates.

### 6.2 Career Hub MVP MCP Apps Catalog

```
┌────────────────────────────────────────────────────────────────────────┐
│ Claude Chat Window                                                     │
│                                                                        │
│ User: "Analyze my fit for this Staff Distributed Systems Engineer job" │
│                                                                        │
│ Claude: Invokes `analyze_job_fit`                                      │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ [MCP App: ui://career-hub/job-fit-radar]                           │ │
│ │                                                                    │ │
│ │  ATS Fit Score: 94/100 [EXCELLENT]                                 │ │
│ │                                                                    │ │
│ │  [Interactive Radar: Go 95% | Kafka 90% | K8s 85% | Redis 90%]     │ │
│ │                                                                    │ │
│ │  Matched Skills: [Go] [PostgreSQL] [Kafka] [Docker]               │ │
│ │  Missing Gaps:   [eBPF (High Priority)]                           │ │
│ │                                                                    │ │
│ │  [Generate Tailored Resume]   [Track Application]                  │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

1. **`ui://career-hub/job-fit-radar` (Job-Fit Radar & Gap Visualizer)**:
   * Rendered on `analyze_job_fit`.
   * Displays an interactive 10-dimension SVG radar chart of candidate strengths vs job requirements, collapsible skill gap cards, and one-click action buttons to generate tailored resumes or track applications.
2. **`ui://career-hub/evidence-graph` (Interactive AST Evidence Explorer)**:
   * Rendered on `inspect_project_evidence`.
   * Visualizes the commit tree, AST import hierarchy, line-numbered syntax highlighted code excerpts, and cryptographic verification badges.
3. **`ui://career-hub/pr-diff-inspector` (Two-Phase Write Diff Inspector)**:
   * Rendered on `propose_project_improvement`.
   * Displays a syntax-highlighted side-by-side unified diff of proposed repository changes with explicit "Approve & Create Pull Request" confirmation triggers.
4. **`ui://career-hub/application-pipeline` (Interactive Application Tracker)**:
   * Rendered on `track_job_application` and `get_job_application`.
   * Displays an inline Kanban stage progression bar, attached document previews, and interview note logger.

---

## 7. Staged Rollout Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: Local & Hermetic Test (Current Verified Baseline)             │
│ • Local Fastify server (`127.0.0.1:3000`)                              │
│ • Dynamic isolated PostgreSQL databases (`career_hub_beta_*`)          │
│ • Synthetic 5-user beta topologies (Alex, Beth, Carlos, Diana, Elena)  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: Web Experience & Career Document Onboarding (Phase 13.5)      │
│ • Public landing page, candidate onboarding wizard, and dashboard     │
│ • Source resume upload, parsing, and claim-vs-evidence alignment       │
│ • AI connection center & interactive `/docs/mcp` documentation         │
│ • MCP Apps (`io.modelcontextprotocol/ui`) interactive components       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: Production Staging Domain & Named Tunnel Deployment           │
│ • Acquire custom domain (`staging.careerhub.ai`)                       │
│ • Cloudflare Named Tunnel (`cloudflared`) with Edge TLS 1.3 & HSTS     │
│ • Persistent staging PostgreSQL database with automated migrations     │
│ • Live GitHub App OAuth redirects & webhook deliveries                 │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: MCP Registry Publication & Production Launch                  │
│ • Publish verified `server.json` to `registry.modelcontextprotocol.io` │
│ • Onboard live external candidates across Gemini, Claude, and ChatGPT  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Security & Privacy Architecture

1. **Strict Context Minting**: All web requests validate session cookies (`__Host-career_hub_session`), while all MCP requests validate Bearer tokens (`mcp_live_*` or `mcp_oauth_acc_*`). The server mints an immutable `ConnectorContext` or `McpRequestContext` with server-derived `tenantId`, `userId`, and `role`.
2. **CSRF & Origin Verification**: All state-changing web mutations (`POST`, `PUT`, `DELETE`) require Fastify CSRF origin validation against `config.APP_URL`.
3. **Secret Redaction**: Zero tokens, passwords, encryption keys, or private code excerpts are leaked in HTTP responses, audit logs, or client-rendered templates.
4. **Least-Privilege GitHub Grants**: Explicit repository selection avoids unnecessary access to private candidate repositories.
5. **Two-Phase Write Enforcement**: No AI client can create Git branches or pull requests without explicit human ticket signoff.

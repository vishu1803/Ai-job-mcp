# Living Integrations Specification

**Project**: Antigravity Career Hub (Universal AI Career MCP Platform)  
**Status**: Authoritative Integrations Matrix  
**Last Updated**: 2026-08-19  

---

## 1. Provider Integration Matrix

| Provider / Service | Integration Mode | Read Tools | Write Tools | Status | Official Verification Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GitHub** | GitHub App (`@octokit/app`) | YES | YES (Gated) | **READY FOR P3** | Short-lived installation tokens (1h), repository-scoped access, webhook HMAC verification. |
| **Google Gemini** | Developer API / Enterprise MCP | YES | YES (Gated) | **PLANNED (P8)** | Function calling + Streamable HTTP MCP connector. API billed separately from AI Pro subscription. |
| **Anthropic Claude** | Remote MCP Custom Connector | YES | YES (Gated) | **PLANNED (P10)** | Free tier supports 1 custom remote connector; Pro/Team supports multiple. Requires public HTTPS endpoint. |
| **OpenAI ChatGPT** | Developer Mode MCP Connector | YES | YES (Gated) | **PLANNED (P11)** | Developer Mode supports Streamable HTTP / SSE MCP servers with OAuth 2.1 auth. |
| **Model Context Protocol** | Modular `@modelcontextprotocol/server` | YES | YES (Gated) | **READY FOR P7** | 2026-07-28 specification standardizing stateless Streamable HTTP as primary transport. |
| **PostgreSQL** | Drizzle ORM / pg connection pool | YES | YES | **READY FOR P1** | PostgreSQL 16+ with native JSONB indexing and relational tenant isolation. |
| **Azure for Students** | Azure App Service / Container Apps | N/A | N/A | **PLANNED (P13)** | $100 annual credit for compute and database hosting without out-of-pocket costs. |

---

## 2. Detailed Integration Specifications

---

### A. GitHub Integration (GitHub App)
* **Purpose**: Primary candidate code repository ingestion, commit history extraction, and sandboxed feature branch / PR adaptation.
* **Official Documentation**: [GitHub Apps Developer Documentation](https://docs.github.com/en/apps)
* **Authentication Mechanism**: 
  * Server-to-Server: App ID + RSA Private Key (PEM) generates temporary JWT -> exchanged for 1-hour Installation Access Token (`ghs_*`).
  * User-to-Server: GitHub App OAuth web flow with PKCE for user linking.
* **Required Permissions / Scopes**:
  * `contents: read` (Repository files, trees, commit history)
  * `metadata: read` (Repository names, stars, topics, languages)
  * `pull_requests: write` (Only requested if project modification workflows are enabled)
* **API / SDK**: `@octokit/app`, `@octokit/rest`, `@octokit/webhooks`.
* **Expected Capabilities**:
  * Inspect repository tree without cloning full git repository.
  * Extract package manifests (`package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`).
  * Retrieve file contents and commit metadata for specific SHA.
  * Create feature branch and draft pull request on explicit user approval.
* **Limitations**: 5,000 API requests/hour per installation. Must implement ETag caching and shallow inspection.
* **Security Concerns**: App private key must be protected in environment variables; stored installation tokens encrypted with AES-256-GCM.
* **Development Setup**: GitHub Developer Sandbox App with `smee.io` or `ngrok` webhook proxy.
* **Test Strategy**: Mock Octokit responses for unit tests; live test suite against a dedicated sandbox test repository.
* **Production Considerations**: Webhook signature verification (`X-Hub-Signature-256`) and background worker queuing.
* **Current Status**: Specification Complete; implementation planned for Phase 3.

---

### B. Google Gemini Integration
* **Purpose**: Primary target AI client demonstrating evidence-backed career analysis, ATS gap scoring, and resume adaptation.
* **Official Documentation**: [Google Gemini Developer API Documentation](https://ai.google.dev)
* **Authentication Mechanism**: Gemini Developer API Key (for testing) / Bearer token authentication to remote MCP gateway (for client mode).
* **Required Permissions / Scopes**: MCP scope `career:read`, `career:write`.
* **API / SDK**: `@google/genai` SDK or direct MCP client protocol.
* **Expected Capabilities**:
  * Execute MCP tools via Gemini function calling.
  * Receive structured candidate evidence and return evidence-grounded recommendations.
  * Explain technical skill gaps with repository references.
* **Limitations**: Developer API rate limits; Google AI Pro consumer subscription does not cover developer API token usage.
* **Security Concerns**: Prompt injection via untrusted repository content; mitigated by data encapsulation and zero-hallucination validation gates.
* **Development Setup**: Local API key from Google AI Studio.
* **Test Strategy**: Automated integration tests running standard job description prompts against Gemini API and asserting accurate MCP tool calls.
* **Production Considerations**: Monitor token consumption and latency metrics.
* **Current Status**: Specification Complete; implementation planned for Phase 8.

---

### C. Model Context Protocol (MCP) Remote Server
* **Purpose**: Standards-compliant gateway exposing career intelligence and action tools to any MCP client.
* **Official Documentation**: [Model Context Protocol Specification](https://modelcontextprotocol.io)
* **Authentication Mechanism**: Per-user Bearer token (`Authorization: Bearer mcp_live_*`) validated against SHA-256 database hash.
* **Required Permissions / Scopes**: Granular tool execution scopes (`career:read`, `resume:generate`, `actions:propose`).
* **API / SDK**: `@modelcontextprotocol/server` (2026 specification).
* **Expected Capabilities**:
  * Handle JSON-RPC 2.0 requests over Streamable HTTP (`POST /mcp`).
  * Support fallback Server-Sent Events (`GET /mcp/sse`).
  * Expose tools: `get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit`, `generate_tailored_resume`, `draft_cover_letter`, `propose_project_improvement`, `confirm_and_create_pr`.
* **Limitations**: Remote MCP requires publicly accessible HTTPS endpoint when interacting with cloud web clients.
* **Security Concerns**: Cross-tenant tool execution; mitigated by mandatory tenant resolution before tool dispatch.
* **Development Setup**: Local Fastify server with MCP route handler.
* **Test Strategy**: MCP Inspector CLI and automated JSON-RPC test client.
* **Production Considerations**: High-throughput stateless HTTP load balancing.
* **Current Status**: Specification Complete; implementation planned for Phase 7.

---

### D. Authentication Provider
* **Purpose**: Multi-tenant user login, session management, and OAuth account linking.
* **Official Documentation**: [Fastify OAuth2 Documentation](https://github.com/fastify/fastify-oauth2) / [OAuth 2.1 Spec](https://oauth.net/2.1/)
* **Authentication Mechanism**: OAuth 2.1 Authorization Code Flow with PKCE + Secure HTTP-only session cookies.
* **Required Permissions / Scopes**: `user:email`, `read:user`.
* **API / SDK**: `@fastify/oauth2`, `@fastify/session`, `@fastify/cookie`.
* **Expected Capabilities**:
  * User registration and login via GitHub or Google.
  * Encrypted session storage in PostgreSQL or Redis.
  * Issue and revoke remote MCP Bearer tokens.
* **Limitations**: Cookie sessions require proper domain and CORS configurations in production.
* **Security Concerns**: CSRF, session fixation; mitigated by PKCE, cryptographic `state` validation, and SameSite=Strict cookies.
* **Development Setup**: Local OAuth app credentials in `.env`.
* **Test Strategy**: Automated tests for signup, login, session validation, token refresh, and logout.
* **Production Considerations**: HTTPS termination and cookie domain configuration.
* **Current Status**: Specification Complete; implementation planned for Phase 2.

---

### E. Database Integration (PostgreSQL + Drizzle ORM)
* **Purpose**: Primary multi-tenant ACID persistence layer and relational data store.
* **Official Documentation**: [PostgreSQL Documentation](https://www.postgresql.org/docs/) / [Drizzle ORM Documentation](https://orm.drizzle.team)
* **Authentication Mechanism**: PostgreSQL connection string with TLS (`sslmode=require` in production).
* **API / SDK**: `pg` (Node-Postgres connection pool), `drizzle-orm`, `drizzle-kit`.
* **Expected Capabilities**:
  * Multi-tenant relational schema with foreign key cascades.
  * GIN-indexed `JSONB` storage for ASTs and repository trees.
  * Idempotent SQL migration execution.
* **Limitations**: Connection pool sizing must align with container memory limits.
* **Security Concerns**: SQL injection (mitigated by Drizzle parameterized queries) and cross-tenant leakage (mitigated by strict `tenant_id` filtering).
* **Development Setup**: Local PostgreSQL container (`docker run --name pg-career -p 5432:5432 -e POSTGRES_PASSWORD=postgres -d postgres:16-alpine`).
* **Test Strategy**: Ephemeral test database created and migrated during CI runs.
* **Production Considerations**: Automated backups, connection pooling (PgBouncer), and index optimization.
* **Current Status**: Specification Complete; implementation planned for Phase 1.

---

### F. Hosting & Infrastructure (Azure for Students / Fly.io)
* **Purpose**: Production deployment of containerized backend, database, and public MCP endpoint.
* **Official Documentation**: [Azure for Students Portal](https://azure.microsoft.com/free/students) / [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/)
* **Authentication Mechanism**: Azure CLI / Service Principal deployment credentials.
* **Expected Capabilities**:
  * Host Docker containerized Node.js backend with automated HTTPS TLS.
  * Managed PostgreSQL flexible server or container database.
  * Custom domain configuration.
* **Limitations**: $100 annual credit renewed once every 12 months; credit does not roll over.
* **Security Concerns**: Cloud firewall rules; restrict database ingress exclusively to container virtual network.
* **Development Setup**: Local Docker container build and run.
* **Test Strategy**: Automated container smoke test verifying `/healthz` on port 8080.
* **Production Considerations**: Multi-stage lightweight Alpine Docker image (<150 MB).
* **Current Status**: Specification Complete; deployment planned for Phase 13.

# Architecture Decision Records (ADRs)

**Project**: Antigravity Career Hub (Universal AI Career MCP Platform)  
**Status**: Living Architecture Decision Ledger  
**Last Updated**: 2026-08-19  

---

## Index of Decisions

| ID | Title | Status | Date |
| :--- | :--- | :--- | :--- |
| **ADR-001** | Application Architecture (Modular Monolith) | **ACCEPTED** | 2026-08-19 |
| **ADR-002** | Backend Runtime and Framework (Node.js ESM + Fastify) | **ACCEPTED** | 2026-08-19 |
| **ADR-003** | Frontend Technology Stack | **PROPOSED** | 2026-08-19 |
| **ADR-004** | Primary Database Technology (PostgreSQL 16+) | **ACCEPTED** | 2026-08-19 |
| **ADR-005** | ORM and Data-Access Strategy (Drizzle ORM) | **ACCEPTED** | 2026-08-19 |
| **ADR-006** | User Authentication and Session Management Strategy | **PROPOSED** | 2026-08-19 |
| **ADR-007** | GitHub Integration Strategy (GitHub App Architecture) | **ACCEPTED** | 2026-08-19 |
| **ADR-008** | Model Context Protocol (MCP) Implementation Strategy | **ACCEPTED** | 2026-08-19 |
| **ADR-009** | Remote MCP Transport (Stateless Streamable HTTP) | **ACCEPTED** | 2026-08-19 |
| **ADR-010** | AI Provider Abstraction and Neutrality | **ACCEPTED** | 2026-08-19 |
| **ADR-011** | Automated Testing and Quality Assurance Strategy | **ACCEPTED** | 2026-08-19 |
| **ADR-012** | Cloud Hosting and Deployment Strategy | **PROPOSED** | 2026-08-19 |
| **ADR-013** | Secret and Credential Encryption at Rest | **ACCEPTED** | 2026-08-19 |
| **ADR-014** | Multi-User and Tenant Isolation Model | **ACCEPTED** | 2026-08-19 |
| **ADR-015** | CI Database Isolation Strategy | **ACCEPTED** | 2026-08-20 |

---

### ADR-001: Application Architecture (Modular Monolith)
* **Status**: ACCEPTED
* **Date**: 2026-08-19
* **Context**: The platform needs to support user accounts, GitHub repository ingestion, evidence extraction, career intelligence, and remote MCP tool execution. We must choose between microservices, serverless functions, or a modular monolith.
* **Decision**: Adopt a **Modular Monolith** architecture with strictly encapsulated domain modules (`auth`, `connectors`, `candidate`, `career`, `mcp`, `actions`).
* **Alternatives Considered**:
  * *Microservices*: High operational complexity, deployment overhead, network latency between candidate indexing and MCP tools.
  * *Serverless Functions (AWS Lambda / Vercel)*: Cold start penalties for MCP tool invocation latency (<1.5s target) and complex stateful WebSocket/SSE connections.
* **Reasons**: A modular monolith provides the simplest operational model, zero inter-service network latency, shared in-memory data structures, and straightforward local development while keeping boundaries clean.
* **Consequences**: Fast development velocity, single deployment target, simplified end-to-end integration testing.
* **Revisit Conditions**: When independent scaling of repository indexing vs. MCP tool querying becomes a demonstrable bottleneck.

---

### ADR-002: Backend Runtime and Framework (Node.js ESM + Fastify)
* **Status**: ACCEPTED
* **Date**: 2026-08-19
* **Context**: Need high I/O throughput for concurrent GitHub API calls and MCP JSON-RPC requests, native JSON manipulation, and zero-compilation development speed.
* **Decision**: Use **Node.js (v20+ LTS / v24)** with native **ECMAScript Modules (ESM)**, **Fastify** as the web framework, **Zod** for runtime schema validation, and **JSDoc** for IDE type-hints.
* **Alternatives Considered**:
  * *Express*: Older architecture, slower routing, lacks modern async lifecycle hooks, unmaintained core.
  * *TypeScript + NestJS*: Heavy boilerplate, slow build/transpilation cycles, unnecessary object-oriented complexity.
  * *Go / Rust*: Excellent performance, but slower iteration speed for rapid schema evolution and JSON AST manipulation.
* **Reasons**: Node.js ESM eliminates build steps; Fastify delivers benchmark-leading throughput, native JSON schema support, and powerful plugin encapsulation; Zod guarantees bulletproof runtime validation.
* **Consequences**: Fast startup, zero compilation friction, deterministic type-safety at runtime boundaries.
* **Revisit Conditions**: If memory usage under high concurrent indexing workloads demands native compiled binaries.

---

### ADR-003: Frontend Technology Stack
* **Status**: PROPOSED
* **Date**: 2026-08-19
* **Context**: The user dashboard requires account management, GitHub App installation, evidence exploration, job description fit visualization, and MCP connection token generation.
* **Decision**: Propose a lightweight **Vite + React (Vanilla CSS / Tailwind)** or **Fastify SSR with modern HTML5/JS components**.
* **Alternatives Considered**:
  * *Next.js*: Powerful, but introduces full-stack framework overlap with the Fastify backend and unnecessary hosting complexity.
  * *Static SPA (Vite + React)*: Clean separation of concerns; static files can be served directly by Fastify or CDN.
* **Reasons**: Keeping the frontend decoupled as a static SPA or clean Fastify-served view keeps backend MCP APIs completely unpolluted.
* **Consequences**: Requires final confirmation during Phase 13 frontend milestone.
* **Revisit Conditions**: Before commencing Phase 13 (Public Multi-User Beta).

---

### ADR-004: Primary Database Technology (PostgreSQL 16+)
* **Status**: ACCEPTED
* **Date**: 2026-08-19
* **Context**: Need ACID transactions for user accounts and audit logs, foreign key constraints for multi-tenant isolation, and flexible semi-structured JSON storage for ASTs and repository trees.
* **Decision**: Use **PostgreSQL (v16+)** with native `JSONB` columns and GIN indexes.
* **Alternatives Considered**:
  * *MongoDB / DocumentDB*: Lacks strict relational constraints needed for multi-tenant security and audit trails.
  * *SQLite*: Great for local tests, but lacks production multi-tenant concurrency and managed cloud scaling.
* **Reasons**: PostgreSQL combines relational rigor with document flexibility (`JSONB`), supported by every major cloud provider.
* **Consequences**: Dependable relational integrity, powerful JSON querying capabilities, simple backup/restore workflows.
* **Revisit Conditions**: None anticipated for the foreseeable project lifecycle.

---

### ADR-005: ORM and Data-Access Strategy (Drizzle ORM)
* **Status**: ACCEPTED
* **Date**: 2026-08-19
* **Context**: Need a lightweight, type-safe data access layer for PostgreSQL with zero runtime overhead and explicit migration generation.
* **Decision**: Use **Drizzle ORM** (`drizzle-orm` + `drizzle-kit`).
* **Alternatives Considered**:
  * *Prisma*: Heavy binary engine, higher cold start latency, rigid schema migrations.
  * *TypeORM*: Bloated ActiveRecord pattern with legacy decorator dependencies.
  * *Raw pg / Knex*: Lacks modern schema definition and automated migration tooling.
* **Reasons**: Drizzle is lightweight, executes raw SQL under the hood, natively supports ESM and JavaScript with JSDoc, and generates clean, inspectable SQL migrations.
* **Consequences**: Fast query execution, explicit SQL control, zero background binary engines.
* **Revisit Conditions**: If automated schema management becomes complex across dynamic tenant sharding.

---

### ADR-006: User Authentication and Session Management Strategy
* **Status**: PROPOSED
* **Date**: 2026-08-19
* **Context**: Need secure multi-tenant user authentication supporting both web browser sessions and remote MCP Bearer token authentication.
* **Decision**: Propose combining **OAuth 2.1 (GitHub / Google Login) via `@fastify/oauth2` + `@fastify/session`** for Web UI, and **SHA-256 hashed API Keys / Bearer Tokens** for MCP client access.
* **Alternatives Considered**:
  * *Supabase Auth / Clerk*: External dependency; ties multi-tenant credential models to third-party vendor lock-in.
  * *Custom JWTs*: Revocation complexity and stateless session invalidation risks.
* **Reasons**: Standard server-side sessions with encrypted cookies provide the highest security for Web UI, while dedicated MCP API tokens can be scoped and revoked independently.
* **Consequences**: Requires final review and verification during Phase 2 (Authentication implementation).
* **Revisit Conditions**: Phase 2 implementation signoff.

---

### ADR-007: GitHub Integration Strategy (GitHub App Architecture)
* **Status**: ACCEPTED
* **Date**: 2026-08-19
* **Context**: Traditional OAuth Apps request wide personal scopes that never expire. GitHub Apps allow granular repository selection and issue short-lived installation access tokens.
* **Decision**: Implement integration strictly as a **GitHub App** using `@octokit/app` and `@octokit/rest`.
* **Alternatives Considered**:
  * *Personal Access Tokens (PATs)*: Cannot be safely managed in a multi-user SaaS; requires users to manually copy/paste tokens.
  * *OAuth App*: Broad permissions; cannot limit access to specific repositories.
* **Reasons**: GitHub Apps adhere to least-privilege principles, support 1-hour short-lived tokens (`ghs_*`), and provide real-time webhook updates.
* **Consequences**: Requires GitHub App registration, webhook secret validation, and private key (PEM) storage.
* **Revisit Conditions**: If supporting self-hosted GitHub Enterprise Server requires custom OAuth flows.

---

### ADR-008: Model Context Protocol (MCP) Implementation Strategy
* **Status**: ACCEPTED
* **Date**: 2026-08-19
* **Context**: The system must expose tools and context to AI clients via the official Model Context Protocol.
* **Decision**: Use the official `@modelcontextprotocol/server` modular SDK (2026 specification) wrapped in Fastify request handlers.
* **Alternatives Considered**:
  * *Custom JSON-RPC parser*: Prone to spec drift and incompatibilities with official Gemini/Claude clients.
  * *Legacy 2024/2025 SDK*: Deprecated monolithic packages.
* **Reasons**: Ensures 100% compliance with official tool registration, protocol version negotiation, and schema validation.
* **Consequences**: Seamless compatibility with all official MCP clients.
* **Revisit Conditions**: When MCP specification publishes new minor/major releases.

---

### ADR-009: Remote MCP Transport (Stateless Streamable HTTP)
* **Status**: ACCEPTED
* **Date**: 2026-08-19
* **Context**: MCP specification (2026-07-28) deprecated legacy HTTP+SSE for remote connections in favor of stateless Streamable HTTP with header routing.
* **Decision**: Standardize on **Streamable HTTP** (`POST /mcp` with `Mcp-Method` routing and Bearer token auth), while maintaining an optional SSE fallback endpoint (`/mcp/sse`) for legacy client compatibility.
* **Alternatives Considered**:
  * *Pure stdio*: Only works for local CLI clients; cannot support remote multi-tenant SaaS or cloud AI web apps (Claude Web, ChatGPT).
  * *WebSocket transport*: Requires sticky sessions and stateful socket management on load balancers.
* **Reasons**: Streamable HTTP is stateless, fits standard REST/HTTP load balancers, and is the official standard for Claude, Gemini, and ChatGPT remote connectors.
* **Consequences**: Zero sticky-session requirement; trivial horizontal scaling behind any cloud proxy.
* **Revisit Conditions**: None.

---

### ADR-010: AI Provider Abstraction and Neutrality
* **Status**: ACCEPTED
* **Date**: 2026-08-19
* **Context**: Core career intelligence must not be coupled to Gemini, Claude, or ChatGPT.
* **Decision**: Strictly isolate all candidate modeling, evidence linking, and job analysis inside a provider-neutral engine. All capabilities are exposed solely via standard MCP tool schemas.
* **Alternatives Considered**:
  * *Directly integrating Gemini SDK in the business logic*: Creates vendor lock-in and breaks Claude/ChatGPT support.
* **Reasons**: Guarantees that any MCP client receives identical, verifiable tool responses regardless of underlying LLM.
* **Consequences**: Clean separation of concerns; testing can be executed against deterministic mock clients or real AI APIs.
* **Revisit Conditions**: None.

---

### ADR-011: Automated Testing and Quality Assurance Strategy
* **Status**: ACCEPTED
* **Date**: 2026-08-19
* **Context**: The project demands strict verification (>80% unit test coverage, multi-tenant security verification, live Golden Path integration).
* **Decision**: Standardize on **Vitest / Node.js Native Test Runner** (`node:test` + `node:assert`) with mock fixtures and live integration test suites.
* **Alternatives Considered**:
  * *Jest*: Slower ESM support, complex configuration.
* **Reasons**: Fast startup, native ESM execution, built-in mocking and coverage reporting.
* **Consequences**: All PRs and tasks must include automated test verification before completion.
* **Revisit Conditions**: None.

---

### ADR-012: Cloud Hosting and Deployment Strategy
* **Status**: PROPOSED
* **Date**: 2026-08-19
* **Context**: Need a cost-effective hosting environment for MVP demonstration with public HTTPS for Claude/Gemini remote MCP connectivity.
* **Decision**: Propose deploying MVP to **Azure Container Apps / App Service** using the active Azure for Students ($100 annual credit) or **Render / Fly.io** free/hobby tiers.
* **Alternatives Considered**:
  * *AWS ECS / EKS*: High baseline cost and operational overhead.
  * *Localhost + Ngrok*: Sufficient for development, but insufficient for persistent multi-user beta testing.
* **Reasons**: Azure for Students provides sufficient credit for container compute and PostgreSQL without out-of-pocket costs during MVP.
* **Consequences**: Requires containerization via Dockerfile and automated GitHub Actions deployment.
* **Revisit Conditions**: Finalized before Phase 13 deployment.

---

### ADR-013: Secret and Credential Encryption at Rest
* **Status**: ACCEPTED
* **Date**: 2026-08-19
* **Context**: Storing third-party GitHub installation tokens and OAuth refresh tokens in plaintext is a critical vulnerability.
* **Decision**: Enforce **AES-256-GCM** authenticated symmetric encryption for all secret columns in PostgreSQL. Each record uses a unique 12-byte cryptographically random IV, generating ciphertext and a 16-byte HMAC authentication tag.
* **Alternatives Considered**:
  * *AES-256-CBC*: Lacks built-in authentication tag; vulnerable to bit-flipping attacks.
  * *Plaintext database*: Unacceptable security risk.
* **Reasons**: AES-256-GCM is the industry standard for authenticated encryption at rest with tamper detection.
* **Consequences**: Master key (`ENCRYPTION_KEY`) must be supplied via environment variable; tampering with ciphertext throws immediate errors.
* **Revisit Conditions**: When migrating to Cloud KMS (Azure Key Vault / AWS KMS) in Phase 14.

---

### ADR-014: Multi-User and Tenant Isolation Model
* **Status**: ACCEPTED
* **Date**: 2026-08-19
* **Context**: The platform is multi-tenant. We must ensure User A can never access User B's repositories, candidate profile, or evidence graph.
* **Decision**: Implement a **Shared Database, Row-Level Tenant Isolation** model. Every entity table contains `tenant_id` and `user_id` foreign keys with database-level indexes, and all service queries strictly enforce tenant scoping from authenticated request context.
* **Alternatives Considered**:
  * *Database-per-tenant*: Excessive resource overhead and migration complexity for hundreds of individual users.
  * *Schema-per-tenant*: Higher maintenance cost without substantial security benefit over strict row-level filtering.
* **Reasons**: Balances resource efficiency on small cloud tiers with bulletproof isolation when enforced at the service and data-access layer.
* **Consequences**: Automated multi-tenant security test suite is mandatory for every release.
* **Revisit Conditions**: If enterprise clients require dedicated isolated database instances.

---

### ADR-015: CI Database Isolation Strategy
* **Status**: ACCEPTED
* **Date**: 2026-08-20
* **Context**: Automated GitHub Actions CI must reliably validate code formatting, static linting, Drizzle ORM configuration, schema migrations from scratch, unit test suites, and live integration tests (covering table CRUD, session hashing, audit sanitization, cascade deletions, and multi-tenant isolation). The test database environment must guarantee complete isolation from development/production databases, support parallel CI concurrency, prevent credential exposure, and avoid depleting cloud connection and storage limits (e.g., Aiven Free 20-connection ceiling and 1GB storage).
* **Decision**: Adopt **Ephemeral Native GitHub Actions PostgreSQL Service Containers (`postgres:17-alpine` on `localhost:5432`)** as the primary hermetic CI test database architecture. Every pull request and push runs against an empty, isolated PostgreSQL service container, applies migrations from scratch (`npm run db:migrate`), and runs all unit and integration test suites.
* **Alternatives Considered**:
  * *Shared Cloud Database on Aiven Free (e.g. `testdb`)*: High risk of connection exhaustion against the 20-connection limit, concurrency race conditions between parallel PR runs, network latency, and requirement to expose cloud credentials in CI secrets.
  * *Dynamic Ephemeral Database on Cloud Aiven (`CREATE DATABASE / DROP DATABASE` per run)*: Risk of orphaned test databases exhausting the 1GB storage limit on unhandled runner cancellations, administrative privilege exposure, and connection pool saturation.
  * *Isolated Schemas on Cloud Aiven (`CREATE SCHEMA`)*: Requires non-standard migration runner configuration for non-public schemas, while still consuming cloud connection quotas.
* **Reasons**: Ephemeral container services provide 100% hermetic isolation per job, infinite parallel execution without race conditions, zero cloud cost, zero cloud connection depletion, and zero credential exposure in GitHub Actions secrets for standard PR checks.
* **Consequences**:
  * Clean, reproducible test runs starting with an empty database verifying migration scripts from scratch on every commit.
  * Local development continues smoothly with `.env.local` pointing to Aiven Free PostgreSQL.
  * Cloud development and production databases remain completely isolated from CI execution.
* **Revisit Conditions**: When multi-region cloud staging validation requires scheduled end-to-end smoke tests against managed cloud database instances.


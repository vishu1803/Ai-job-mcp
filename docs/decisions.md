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
| **ADR-018** | Resource Connections Persistence Schema | **ACCEPTED** | 2026-08-21 |
| **ADR-019** | Provider-Neutral Resource Connector Core Architecture | **ACCEPTED** | 2026-08-21 |
| **ADR-020** | Resource Connection Lifecycle API Architecture | **ACCEPTED** | 2026-08-21 |
| **ADR-021** | GitHub App Authentication & Private Key Management Architecture | **ACCEPTED** | 2026-08-21 |
| **ADR-022** | GitHub App Installation Linking Architecture | **ACCEPTED** | 2026-08-21 |
| **ADR-023** | GitHub App Webhook Ingress and State Synchronization Architecture | **ACCEPTED** | 2026-08-21 |
| **ADR-024** | GitHub Read Connector Architecture | **ACCEPTED** | 2026-08-21 |
| **ADR-025** | GitHub Deep Repository Inspection Architecture | **ACCEPTED** | 2026-08-22 |
| **ADR-026** | GitHub Connector Caching & Rate-Limit Architecture | **ACCEPTED** | 2026-08-22 |
| **ADR-027** | Unified Candidate and Resource Domain Model | **ACCEPTED** | 2026-08-22 |
| **ADR-028** | GitHub Evidence Extractor Architecture & Security Rules | **ACCEPTED** | 2026-08-22 |
| **ADR-029** | Evidence Linking and Provenance Integrity Architecture | **ACCEPTED** | 2026-08-22 |
| **ADR-030** | Candidate Profile Service Architecture and Claim Integrity | **ACCEPTED** | 2026-08-22 |
| **ADR-031** | Career Intelligence Engine Architecture & Deterministic Scoring | **ACCEPTED** | 2026-08-22 |
| **ADR-032** | Skill Taxonomy & Normalization Engine Architecture | **ACCEPTED** | 2026-08-22 |
| **ADR-033** | Evidence Matching & Gap Analysis Architecture | **ACCEPTED** | 2026-08-22 |
| **ADR-034** | Project Relevance Scoring Architecture | **ACCEPTED** | 2026-08-22 |
| **ADR-035** | ATS Fit Score Architecture & Deterministic Evaluation Engine | **ACCEPTED** | 2026-08-22 |
| **ADR-036** | Zero-Hallucination Career Integrity Gate Architecture | **ACCEPTED** | 2026-08-22 |
| **ADR-037** | Career Artifact Adaptation Architecture | **ACCEPTED** | 2026-08-22 |
| **ADR-038** | Cover Letter Drafting Engine Architecture | **ACCEPTED** | 2026-08-22 |
| **ADR-039** | Portfolio Recommendation & Hiring-Signal Architecture | **ACCEPTED** | 2026-08-22 |
| **ADR-040** | Career Artifact Export & Canonical Interchange Architecture | **ACCEPTED** | 2026-08-22 |
| **ADR-041** | Resume Integrity Audit Tool Architecture | **ACCEPTED** | 2026-08-23 |
| **ADR-042** | MCP Server Foundation & Career Tool Exposure Architecture | **ACCEPTED** | 2026-08-23 |
| **ADR-043** | MCP Authentication Hybrid Model (Personal Tokens vs OAuth 2.1) | **ACCEPTED** | 2026-08-23 |
| **ADR-045** | MCP Application Artifact Tools Architecture | **ACCEPTED** | 2026-08-23 |
| **ADR-046** | Unified MCP Audit Logging Architecture & Schema Invariants | **ACCEPTED** | 2026-08-24 |
| **ADR-047** | Gemini AI Provider & Trust-Boundary Architecture | **ACCEPTED** | 2026-08-24 |
| **ADR-048** | Gemini End-to-End Golden Path Architecture & Dual-Mode Verification Strategy | **ACCEPTED** | 2026-08-24 |
| **ADR-049** | Vertex AI Gemini Provider Architecture & Google Cloud Credit Integration | **ACCEPTED** | 2026-08-24 |
| **ADR-050** | Gemini Enterprise & Google AI Studio Remote MCP Integration Architecture | **ACCEPTED** | 2026-08-24 |
| **ADR-051** | MCP Performance Benchmarking & Latency Target Architecture | **ACCEPTED** | 2026-08-24 |
| **ADR-052** | Approved GitHub / Project Modification Workflows & Human-in-the-Loop Safety Architecture | **ACCEPTED** | 2026-08-25 |
| **ADR-053** | Two-Phase Action Approval State Machine & Cryptographic Binding Architecture | **ACCEPTED** | 2026-08-25 |
| **ADR-054** | GitHub Write Operations & Low-Level Git Data API Integration Architecture | **ACCEPTED** | 2026-08-25 |
| **ADR-055** | GitHub Write Safety Constraints & Centralized Execution Kernel Architecture | **ACCEPTED** | 2026-08-25 |

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

---

### ADR-016: Application Secret Encryption at Rest (AES-256-GCM)
* **Status**: ACCEPTED
* **Date**: 2026-08-20
* **Context**: Future resource connectors (GitHub, Google, third-party platforms) require persisting sensitive tokens (OAuth access/refresh tokens, API keys, webhook secrets). Storing credentials in plaintext is unacceptable. The application requires a centralized, robust, tamper-resistant, authenticated symmetric encryption foundation with key versioning and seamless rotation capabilities.
* **Decision**: Standardize on **AES-256-GCM** authenticated encryption implemented in `src/security/encryption.js` utilizing Node.js native `node:crypto`.
  * **Key Management**: 256-bit (32-byte) symmetric keys (`ENCRYPTION_MASTER_KEY` / `ENCRYPTION_KEY`) strictly encoded as 64-character hexadecimal or 44-character Base64. Raw UTF-8 human passphrases and built-in fallbacks are explicitly rejected. Explicit key-versioning support (`keyVersion: 'v1'`) and multi-version key rings allow concurrent key resolution during rotation.
  * **IV / Nonce**: Cryptographically secure random 96-bit (12-byte) IV generated per encryption operation (`crypto.randomBytes(12)`).
  * **Authentication Tag**: 128-bit (16-byte) GCM authentication tag for tamper detection.
  * **Additional Authenticated Data (AAD)**: Encodes format version and key version (`v1:<keyVersion>`) to cryptographically bind metadata to the ciphertext.
  * **Serialization Formats**: Supports compact string (`enc:v1:<keyVersion>:<iv>:<tag>:<ciphertext>`) and structured JSON validated by Zod `EncryptedPayloadSchema`.
  * **Payload Cap**: Strict 64 KB (65,536 bytes) maximum plaintext cap bounding usage to credentials.
* **Alternatives Considered**:
  * *AES-256-CBC with HMAC-SHA256*: Requires manual composition (Encrypt-then-MAC); more complex and error-prone than native AES-GCM AEAD mode.
  * *Client-side or Cloud KMS for every secret read/write*: Introduces excessive network latency, cost, and external availability dependencies during development; envelope encryption or Cloud KMS root key management can wrap this foundation in Phase 14.
  * *Unauthenticated AES-ECB / AES-CBC*: Insecure and vulnerable to bit-flipping and padding oracle attacks.
* **Reasons**: AES-256-GCM is the modern industry standard for authenticated encryption at rest, offering high throughput, hardware acceleration (AES-NI), built-in integrity verification, and zero third-party dependencies.
* **Consequences**:
  * All credential columns in PostgreSQL will store opaque, tamper-evident ciphertext packages.
  * Attempted tampering with ciphertext, IV, tag, or key version immediately throws safe `AUTHENTICATION_FAILED` `CryptoError`.
  * Zero plaintext or key leakage in logs or error objects.
* **Revisit Conditions**: When enterprise migration to Hardware Security Modules (HSM) or Cloud KMS (Azure Key Vault / AWS KMS) envelope encryption is scheduled in Phase 14.

---

### ADR-017: Authentication Architecture (OAuth 2.1 + PKCE + Server-Side Sessions)
* **Status**: ACCEPTED (Supersedes ADR-006)
* **Date**: 2026-08-20
* **Context**: The platform requires secure multi-tenant user authentication supporting browser web access and remote MCP AI client tool execution. We must evaluate OAuth/OIDC providers, session models, token storage, PKCE, and whether stateless JWTs are needed.
* **Decision**: Adopt **OAuth 2.1 with PKCE (`S256`) and Server-Side Database Sessions** (`sessions` table where `sessions.id` stores the SHA-256 hash of the 256-bit random session token, and `HttpOnly`, `Secure`, `SameSite=Lax` cookies) for web browser users, with **GitHub OAuth 2.0 / GitHub App** as the primary identity provider.
  * **Session Identifier Decision**: Approved Option A (`sessions.id = SHA-256(raw_token)`). Direct Primary Key B-tree lookup (<0.2ms) with zero secondary index overhead, matching existing verified P1-004 schema.
  * **JWT Decision**: Explicitly **REJECT JWTs** for the initial application. Stateless JWTs create unacceptable revocation lag, token theft risks in `localStorage`, and key rotation complexity without benefits for a modular monolith.
  * **PKCE Decision**: Enforce **PKCE with `S256`** for all OAuth flows to prevent authorization code interception and injection attacks.
  * **External Identity Mapping**: External identities anchored on immutable `(provider, provider_user_id)` pairs. P2-002 maps verified GitHub email to user/tenant; a dedicated `user_identities` table is designed for multi-IdP linking in Phase 3/4.
  * **GitHub Login vs GitHub App Separation**: GitHub OAuth Login (P2-002) exchanges short-lived tokens solely to read `/user` identity and discards them. GitHub App (P3-001/P3-002) uses server-to-server JWTs with private PEM keys to mint 1-hour `ghs_*` installation tokens encrypted in `resource_connections`.
  * **Tenant Resolution**: Tenant context is resolved exclusively from the verified database session and user record, never from untrusted client parameters.
  * **Remote MCP Clients**: AI clients authenticate via scoped, SHA-256 hashed API Bearer tokens (`Authorization: Bearer <mcp_token>`) in Phase 5.
* **Alternatives Considered**:
  * *Stateless JWTs in LocalStorage/Cookies*: Rejected due to inability to revoke sessions immediately upon user suspension or compromise without server-side blocklists.
  * *Third-Party Managed Auth (Clerk/Auth0/Supabase Auth)*: Rejected due to external vendor lock-in, recurring SaaS cost, and friction in multi-tenant data ownership.
* **Reasons**: Delivers maximum browser security (OWASP compliance), instant session revocation, zero token leakage, defense against CSRF/XSS, and seamless integration with existing P1-004 `sessions` database schema.
* **Consequences**:
  * Clean, simple authentication pipeline with indexed database lookups (<0.5ms).
  * First-time users are automatically provisioned with a personal tenant workspace.
  * Extensible to additional providers (Google, OIDC) via pluggable `IdentityProvider` adapters.
* **Revisit Conditions**: If microservices architecture in future phases demands cross-service distributed assertion tokens.

---

### ADR-018: Resource Connection Data Model (Provider-Neutral Authorization Boundary)
* **Status**: ACCEPTED
* **Date**: 2026-08-21
* **Context**: The platform requires connecting to external user resources across multiple providers (GitHub App installations, GitLab repositories, Google Drive, OneDrive, Notion). We must establish a clean, provider-neutral relational data model in PostgreSQL/Drizzle that enforces strict multi-tenant isolation, provides tamper-evident AES-256-GCM credential encryption at rest, separates identity authentication from resource authorization, and decouples the career intelligence engine from provider-specific schemas.
* **Decision**: Implement a centralized, provider-neutral **`resource_connections`** table governed by the following core architectural decisions:
  * **Identity vs. Resource Separation**: Identity authentication (`users`, `sessions`) is strictly decoupled from resource authorization (`resource_connections`). Ephemeral login tokens are never stored; resource connections persist encrypted long-lived tokens and installation credentials.
  * **Dual Ownership & Multi-Tenant Boundary**: Every connection requires both `tenant_id` (enforcing strict organization-level isolation) and `user_id` (attributing the creator for auditability and personal connection scoping) with `ON DELETE CASCADE`.
  * **Primary Key**: Standardized on UUIDv4 (`id: uuid().primaryKey().defaultRandom()`) matching platform-wide conventions.
  * **Provider & Auth Type Enumeration**: PostgreSQL enums `resource_provider` (`GITHUB_APP`, `GITLAB`, `GOOGLE_DRIVE`, `ONEDRIVE`, `NOTION`, `CUSTOM_API`) and `connection_auth_type` (`APP_INSTALLATION`, `OAUTH2_CODE`, `API_KEY`, `SERVICE_ACCOUNT`).
  * **Encrypted Credential Storage**: Standardizes on the P2-001 `AES-256-GCM` engine, storing the compact encrypted package (`enc:v1:<keyVersion>:<iv>:<tag>:<ciphertext>`) in `encrypted_credentials`, with an explicit indexed `key_version` column to support offline cryptographic key rotation batch sweeps. Plaintext credentials capped at 64 KB are decrypted exclusively in transient runtime memory.
  * **Scopes & Metadata**: Permissions are stored as a structured `jsonb` array (`scopes`) supporting native JSON inspection and Fastify serialization. Safe, non-sensitive provider metadata is stored in `metadata` (`jsonb`).
  * **Lifecycle State Machine**: Explicit enum `resource_connection_status` (`PENDING`, `ACTIVE`, `EXPIRED`, `REVOKED`, `ERROR`, `DISCONNECTED`) with clear disconnect, revoke, and hard-delete semantics.
  * **Uniqueness Constraints**: Enforces `UNIQUE (tenant_id, provider, external_account_id)` to prevent duplicate account bindings within a tenant workspace.
  * **Resource Decoupling**: Specific resources (e.g. Git repositories, file trees) are modeled as child entities in downstream tables (`repositories`) referencing `connection_id`, keeping `resource_connections` as a pure authorization boundary.
* **Alternatives Considered**:
  * *Provider-specific connection tables (`github_connections`, `google_connections`)*: Rejected due to severe schema bloat, duplicated encryption logic, and breaking provider-neutral career engine interfaces.
  * *Separate columns for ciphertext, IV, tag, and key version*: Rejected in favor of the self-contained compact format, while adding an indexed `key_version` column for high-speed rotation queries.
  * *Embedding repository trees directly inside the connection record*: Rejected because repositories have independent lifecycles, permissions, sync statuses, and evidence item graphs.
* **Reasons**: Balances robust cryptographic security with maximum architectural flexibility, enabling seamless addition of new connectors (GitLab, Notion) with zero schema migrations to the core career intelligence layer.
* **Consequences**:
  * All connector implementations (P2-004, P3-001) will map their credentials into the standard encrypted envelope.
  * Audit logs record only sanitized connection metadata, guaranteeing zero credential leaks.
* **Revisit Conditions**: When enterprise customers require hardware security module (HSM) envelope encryption or external Cloud KMS credential proxying in Phase 14.

---

### ADR-019: Provider-Neutral Resource Connector Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-21
* **Context**: The career intelligence platform requires accessing user resources from multiple heterogeneous external providers (GitHub, GitLab, Google Drive, OneDrive, Notion). We need an extensible, provider-neutral connector abstraction and registry layer that sits between encrypted connection persistence (`resource_connections`) and upstream career intelligence services without leaking provider-specific APIs, data models, or credentials into the core platform.
* **Decision**: Implement a modular, provider-neutral **Connector Architecture** governed by the following core architectural specifications:
  * **Base Interface (`BaseResourceConnector`)**: Define a minimal, abstract base connector class requiring `getCapabilities()`, `validate()`, and `getAccount()`, with capability-guarded methods for `listResources()`, `getResource()`, `refreshCredentials()`, and `revokeAccess()`.
  * **Explicit Capability Model (`CONNECTOR_CAPABILITIES`)**: Use frozen capability flags (`READ_ACCOUNT`, `LIST_RESOURCES`, `READ_RESOURCE`, `READ_CONTENT`, `REFRESH_CREDENTIAL`, `REVOKE_ACCESS`, `WRITE_RESOURCE`) allowing heterogeneous providers to declare their exact capabilities rather than enforcing an artificial uniform feature set.
  * **Connector Registry (`ConnectorRegistry`)**: Maintain a centralized singleton registry mapping provider identifiers (`resourceProviderEnum`) to stateless connector singleton instances, providing capability introspection and connector resolution.
  * **Immutable Execution Context (`ConnectorContext`)**: Require server-minted execution context (`tenantId`, `userId`, `connectionId`, `provider`, `authType`, `scopes`, `requestId`) derived strictly from authenticated session state, completely isolating connectors from raw client HTTP request manipulation.
  * **Transient Credential Decryption Lifecycle**: Decrypt credentials via P2-001 `AES-256-GCM` immediately prior to external vendor invocation and pass them strictly as local invocation arguments, ensuring zero plaintext retention in heap singletons, logs, or audit records.
  * **Normalized Domain Models**: Map disparate vendor entities into standardized, provider-neutral data structures (`NormalizedAccount`, `NormalizedResource`, `ConnectorOperationResult`).
  * **Unified Error Mapping**: Translate provider-specific HTTP errors into standardized application exceptions (`ConnectorAuthError`, `InsufficientScopeError`, `ProviderRateLimitError`, `ProviderUnavailableError`, `ResourceNotFoundError`, `UnsupportedCapabilityError`) derived from `AppError`.
  * **Opaque Cursor-Based Pagination**: Mandate cursor-based pagination with a hard upper bound of 100 items per page.
  * **Zero Direct External Dependencies in Core**: Keep the connector abstraction and registry dependency-free in Phase 2; isolate vendor SDKs (e.g. `@octokit/*`) to provider-specific packages in Phase 3+.
* **Alternatives Considered**:
  * *Tight Coupling to GitHub API*: Rejected because the product mission requires multi-provider ingestion (GitLab, Google Drive, Notion) without rewrite.
  * *Heavyweight Plugin Framework*: Rejected due to unnecessary dynamic module loading complexity and fragile runtime lifecycle management.
  * *Passing Raw Express/Fastify Request Objects to Connectors*: Rejected due to severe security risks, parameter tampering, and credential leakage across middleware boundaries.
* **Reasons**: Enforces strict separation of concerns, guarantees multi-tenant safety, provides robust resilience against vendor API variations, and establishes an immutable foundation for Phase 3 (GitHub App integration).
* **Consequences**:
  * Phase 3 GitHub App connector will implement `BaseResourceConnector` and register with `ConnectorRegistry`.
  * All downstream career intelligence engines (Phase 5+) will consume normalized domain models exclusively.
* **Revisit Conditions**: If asynchronous streaming ingestion or bi-directional real-time socket connections are introduced in Phase 15.

---

### ADR-020: Resource Connection Lifecycle API Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-21
* **Context**: We must expose secure, multi-tenant HTTP interfaces for listing, inspecting, health-checking, disconnecting, and deleting third-party resource connections. The API must strictly enforce multi-tenant isolation, user-creator ownership rules, zero credential leakage, and clear state transitions between `ACTIVE`, `DISCONNECTED`, and `DELETED` states.
* **Decision**: Implement the **Resource Connection Lifecycle API** under `/connections` adhering to the following core architectural decisions:
  * **5-Tier Separation**: Strictly separate HTTP routing (`src/routes/connections.routes.js`), business orchestration & decryption (`src/services/connection.service.js`), multi-tenant data access (`src/db/repositories/`), registry dispatch (`src/connectors/registry/`), and provider I/O (`src/connectors/`). Routes never access database connections directly or decrypt credentials.
  * **Mandatory Tenant Query Scoping**: Every database lookup must execute `WHERE tenant_id = req.tenant.id AND id = :id`. Cross-tenant lookups return `404 Not Found` (never `403 Forbidden`) to eliminate IDOR and enumeration vectors.
  * **Role & Creator Ownership Model**: All tenant members (`OWNER`, `MEMBER`, `READONLY`) can list and view connection metadata within their workspace. State-mutating operations (`test`, `disconnect`, `delete`) require either workspace `OWNER` role or being the **Connection Creator** (`connection.userId === req.user.id`).
  * **Zero Credential Exposure**: Response schemas (`ConnectionSummary`, `ConnectionDetail`, `ConnectionListResponse`, `ConnectionTestResult`) strictly omit `encrypted_credentials`, `key_version`, access tokens, and private keys.
  * **Health Probe Endpoint (`POST /connections/:id/test`)**: Transiently decrypts credentials, invokes `connector.validate()`, and mutates safe operational metadata (`last_validated_at`, `status`, `last_error_code`, `last_error_at`) alongside structured audit logging.
  * **Disconnect vs. Delete Semantics**:
    * `POST /connections/:id/disconnect`: Best-effort upstream revocation, immediately overwrites `encrypted_credentials` with scrubbed dummy ciphertext, and sets status to `DISCONNECTED` (idempotent).
    * `DELETE /connections/:id`: Permanently purges row from PostgreSQL, automatically cascading (`ON DELETE CASCADE`) to child `repositories` and evidence items.
  * **CSRF & Transport Hardening**: State-modifying actions use `POST`/`DELETE` verbs with `SameSite=Lax` cookie protection, `Content-Type: application/json` enforcement, and request correlation IDs.
* **Alternatives Considered**:
  * *Permitting any MEMBER to disconnect any workspace connection*: Rejected to prevent unauthorized tampering with team members' connected resources.
  * *Returning 403 on cross-tenant connection IDs*: Rejected to prevent attackers from probing whether specific UUIDs exist in other customer tenants.
  * *Soft-delete only*: Rejected in favor of explicit disconnect (soft disable with credential scrub) plus explicit hard delete (GDPR/privacy compliance purge).
* **Reasons**: Balances granular workspace collaboration with least-privilege security, prevents credential leaks, and guarantees total multi-tenant isolation.
* **Consequences**:
  * Task P2-005 will implement the `/connections` routes, Zod schemas, connection service, and integration tests according to this exact specification.
* **Revisit Conditions**: When fine-grained custom RBAC policy engines (e.g. OPA / Zanzibar) are introduced in Phase 14.

---

### ADR-021: GitHub App Authentication & Private Key Management Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-21
* **Context**: In Phase 3, we must integrate GitHub Apps to ingest repository trees, package manifests, and commit histories. GitHub Apps use asymmetric RSA private key JWT signing for App-level authentication and mint short-lived (1-hour) Installation Access Tokens (`ghs_*`) for repository operations. Because the App Private Key is the master cryptographic key for all installations, we must define strict invariants for key storage, JWT generation, token caching, refresh intervals, least-privilege scoping, and rate limiting.
* **Decision**: Implement the **GitHub App Authentication Module** in `src/connectors/github/auth.js` adhering to the following core architectural decisions:
  * **Master Private Key Isolation**: The GitHub App Private Key is an Application-Level Master Secret stored exclusively in environment variables (`GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_PRIVATE_KEY_BASE64`). It is **NEVER** stored in PostgreSQL, never committed to Git, never transmitted to clients, and strictly redacted from Pino logs and error messages.
  * **Native RS256 JWT Generation**: App JWTs are signed using Node.js native `node:crypto` (`createSign('RSA-SHA256')`) with a 60-second backdated `iat` (clock skew mitigation) and a 9-minute `exp` (within GitHub's 10-minute maximum).
  * **Partitioned In-Memory Token Cache**: Installation tokens are cached in memory keyed by `gh_token:${tenantId}:${installationId}:${repoScopeHash}`. Tokens are cached with a **5-minute proactive buffer** (`expires_at - 300s`) to ensure in-flight scanning operations never experience mid-request token expiration.
  * **Fine-Grained Least Privilege Scoping**: Tokens request only `contents: read` and `metadata: read` permissions restricted to explicit user-selected repositories (`repositories: [...]`).
  * **Seamless Auto-Refresh & Upstream Revocation**: Expired or missing tokens refresh transparently via App JWT; disconnecting a connection executes upstream `DELETE /installation/token` revocation and memory cache eviction.
  * **Zero-Downtime Key Rotation**: Leverages GitHub's dual-active private key support for zero-downtime key rotation via environment variable updates without requiring database schema changes or customer re-authentication.
* **Alternatives Considered**:
  * *Storing App Private Key in PostgreSQL database*: Rejected because the App Private Key is platform infrastructure, not tenant data. Compromising database rows should never compromise the App-level master key.
  * *No token caching (minting JWT per GitHub API call)*: Rejected due to GitHub App token minting rate limits (100 req/min) and unnecessary network latency.
  * *Indefinite token caching*: Rejected because GitHub installation tokens expire after 60 minutes.
* **Reasons**: Eliminates master credential leakage vectors, ensures sub-millisecond in-memory token retrieval, enforces multi-tenant memory partitioning, and guarantees compliance with GitHub App security best practices.
* **Consequences**:
  * Task P3-001 will implement `GitHubAppAuthManager` in `src/connectors/github/auth.js` following this specification.
* **Revisit Conditions**: If multi-region distributed token caching via Redis is required in Phase 14.

---

### ADR-022: GitHub App Installation Linking Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-21
* **Context**: In Task P3-002, authenticated workspace users link their GitHub App installations to their tenant. We must design a secure, idempotent user-to-server linking flow that prevents CSRF state manipulation, blocks cross-tenant installation hijacking, verifies installation state directly against GitHub using App JWTs, and creates/updates `resource_connections` records cleanly.
* **Decision**: Implement the **GitHub App Installation Linking Flow** adhering to the following core architectural decisions:
  * **Immutable Session Context Binding**: Both `/integrations/github/install` and `/integrations/github/install/callback` require verified user sessions (`req.auth`). `READONLY` workspace members are rejected with `403 Forbidden`.
  * **Cryptographic Anti-CSRF Transit Cookie (`__Host-gh_install_state`)**: State token is an HMAC-SHA256 signed payload containing `userId`, `tenantId`, a 256-bit `nonce`, and a 10-minute expiration. Single-use invalidation on arrival prevents replay attacks.
  * **Server-Side Verification via App JWT**: Never trust browser URL parameters. The backend verifies `GET /app/installations/:installation_id` via App JWT to confirm `account.id`, `account.login`, `target_type`, `repository_selection`, permissions (`contents:read`, `metadata:read`), and active status (`suspended_at === null`).
  * **Multi-Tenant Exclusive Ownership & Collision Guard**: A GitHub installation ID can belong to only one tenant workspace. Attempting to link an installation already bound to a different tenant is rejected with **`409 Conflict` (`INSTALLATION_ALREADY_LINKED`)**.
  * **Idempotent Connection Upsert**: Re-running installation setup for the same tenant and installation updates the existing record, reactivates disconnected connections, updates `display_name` and `metadata`, and sets status to `ACTIVE`.
  * **Ephemeral Credential Invariants**: Since the App Private Key is host-level configuration and installation tokens (`ghs_*`) are ephemeral in-memory entities, `encrypted_credentials` stores an AES-256-GCM encrypted metadata payload, avoiding long-lived token persistence in PostgreSQL.
* **Alternatives Considered**:
  * *Permitting an installation to belong to multiple customer tenants*: Rejected to eliminate cross-tenant confused deputy vectors and unauthorized repository visibility.
  * *Trusting browser URL query parameters without upstream verification*: Rejected to prevent attackers from spoofing public installation IDs.
* **Reasons**: Enforces uncompromising multi-tenant isolation, protects against CSRF and replay vectors, and guarantees robust verification of GitHub App permissions.
* **Consequences**:
  * Task P3-002 will implement `src/routes/integrations.routes.js` and `src/services/github-installation.service.js` according to this specification.
* **Revisit Conditions**: When self-hosted GitHub Enterprise Server (GHES) installations with custom base URLs are supported in Phase 14.

---

### ADR-023: GitHub Webhook Processing Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-21
* **Context**: In Phase 3 (Task P3-003), the platform requires real-time, reactive synchronization with GitHub App lifecycle events (e.g. app uninstalled, app suspended, repositories added/removed) to eliminate polling loops, maintain `resource_connections` data integrity, and immediately evict stale cached tokens (`ghs_*`). We must design an independent, secure webhook architecture that strictly validates HMAC-SHA256 signatures, preserves multi-tenant boundaries, prevents duplicate processing, and enforces an asynchronous boundary for heavy work.
* **Decision**: Implement the **GitHub Webhook Processing Subsystem** governed by the following core architectural decisions:
  * **Independent Cryptographic Gateway (`POST /webhooks/github`)**: Bypasses browser session authentication (`req.auth`) and protects the endpoint via dedicated `verifyWebhookSignature` middleware validating `X-Hub-Signature-256` HMAC-SHA256 against raw request body Buffer using constant-time comparison (`crypto.timingSafeEqual`).
  * **Raw Body Buffer Verification**: Computes HMAC strictly over original raw request body bytes before JSON parsing to prevent false signature rejections or timing attacks caused by re-serialized JSON discrepancies.
  * **Secret Isolation**: `GITHUB_WEBHOOK_SECRET` is host-level configuration stored in environment variables, never persisted in PostgreSQL, and redacted in Pino logging streams.
  * **Authoritative Tenant Resolution**: Tenant ownership is resolved strictly through database queries (`SELECT tenant_id FROM resource_connections WHERE provider = 'GITHUB_APP' AND installation_id = :id`). External payload tenant identifiers are never accepted.
  * **Direct State Synchronization & Token Cache Eviction**:
    * `installation.deleted` -> marks connection `REVOKED`, sets `last_error_code = 'APP_UNINSTALLED'`, and immediately calls `tokenCache.evict(tenantId, installationId)`.
    * `installation.suspend` -> marks connection `REVOKED`, sets `last_error_code = 'INSTALLATION_SUSPENDED'`, and evicts token cache.
    * `installation.unsuspend` -> restores connection to `ACTIVE`.
    * `installation_repositories.removed` / `.added` -> updates `metadata.repositorySelection` and clears relevant token cache partitions.
  * **Idempotency & Replay Protection**: Tracks delivery GUIDs (`X-GitHub-Delivery`) with a 24-hour in-memory TTL cache (`WebhookDeliveryCache`); duplicate deliveries return `200 OK` without executing duplicate side effects. Monotonic status transitions prevent out-of-order event regression.
  * **Asynchronous Heavy Processing Boundary**: Lightweight connection mutations and cache invalidations complete synchronously (<200ms). Heavy repository AST extraction, directory tree crawling, and commit parsing (Phase 4+) are decoupled into background job queues.
  * **Zero Phase 3 Schema Changes**: Adopts in-memory delivery tracking and structured audit logging (`audit_logs`), requiring zero new database tables or migrations in Phase 3.
* **Alternatives Considered**:
  * *Relying on re-serialized JSON for HMAC verification*: Rejected because JSON stringification produces non-deterministic whitespace, key ordering, and character escapes.
  * *Adding a dedicated relational webhook deliveries table in Phase 3*: Rejected to prevent premature database storage bloat and unnecessary migration overhead before Phase 4 repository scanning begins.
  * *Synchronous repository scanning inside webhook HTTP handlers*: Rejected because large repositories exceed standard HTTP timeout limits (GitHub requires responses within 10 seconds).
* **Reasons**: Guarantees airtight cryptographic ingress security, preserves multi-tenant boundaries, ensures instant token revocation upon upstream permission loss, and prevents polling rate-limit exhaustion.
* **Consequences**:
  * Task P3-003 will implement `src/security/webhook-signature.js`, `src/routes/webhooks.routes.js`, and `src/services/github-webhook.service.js` according to this specification.
* **Revisit Conditions**: When distributed background job workers (BullMQ / Redis) and deep repository push event indexing are introduced in Phase 4/5.

---

### ADR-024: GitHub Read Connector Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 3 (Task P3-004), the platform requires its first production resource connector implementation—`GitHubAppConnector`—to inspect linked GitHub repositories, read installation account profiles, and support discovery of user code assets. We must design a robust, stateless connector adhering to `BaseResourceConnector` without leaking GitHub-specific JSON structures, Octokit dependencies, or unnormalized errors into the core career platform.
* **Decision**: Implement `GitHubAppConnector` in `src/connectors/github/github-connector.js` governed by the following core architectural decisions:
  * **Stateless Subclass of `BaseResourceConnector`**: Implements `getCapabilities()` returning `READ_ACCOUNT`, `LIST_RESOURCES`, `READ_RESOURCE`, `REVOKE_ACCESS`. Connector instances store zero tenant state, zero mutable session data, and zero token material.
  * **Node.js Native `fetch` Client**: Standardizes on global `fetch` with `AbortSignal.timeout(10000)` instead of adding `@octokit/rest`. Provides full control over header injection, timeout enforcement, rate-limit inspection, and zero dependency bloat.
  * **Short-Lived Installation Token Sourcing**: Uses `GitHubAppAuthManager.getInstallationToken({ tenantId, installationId })` to acquire short-lived `ghs_*` tokens (60-minute TTL) cached in memory with a 5-minute proactive buffer.
  * **Strict Data Normalization**: Upstream GitHub payloads are pruned and transformed into immutable domain models:
    * `getAccount` -> `NormalizedAccount` (Installation target account identity: `id`, `name`, `avatarUrl`, `accountType`, `metadata`).
    * `listResources` -> `PaginatedResult<NormalizedResource>` (`id`, `name`, `fullName`, `type: 'REPOSITORY'`, `url`, `defaultBranch`, `isPrivate`, `languages`, `updatedAt`, `metadata`).
    * `getResource` -> `NormalizedResource`.
  * **Opaque Cursor Pagination**: Generic callers supply and receive opaque Base64URL cursor tokens (`{ page, limit, issuedAt }`). The connector translates between opaque cursors and GitHub's page-based API parameters (`per_page`, `page`).
  * **Canonical Repository Identifier**: The immutable numeric GitHub repository ID as a string (e.g. `"1043905096"`) is chosen as the canonical identifier. Lookups by `owner/repo` are supported as secondary resolution.
  * **Comprehensive Error Mapping**: Standardizes upstream responses into domain errors: 401 -> `ConnectorAuthError` (with token cache eviction), 403 (insufficient scope) -> `InsufficientScopeError`, 403/429 (rate limit) -> `ProviderRateLimitError`, 404 -> `ResourceNotFoundError`, 5xx/timeout -> `ProviderUnavailableError`.
  * **Rate Limit & Retry Policy**: Inspects `x-ratelimit-remaining`, warns when quota <= 5, and retries transient 5xx/timeouts with jittered exponential backoff (max 2 retries).
* **Alternatives Considered**:
  * *Using Octokit SDK*: Rejected to avoid 50+ transitive dependencies and leaky SDK-specific exception types.
  * *Using `owner/repo` as canonical repository ID*: Rejected because repository renames or ownership transfers would break relational integrity in future career profile evidence links.
  * *Persistent audit logging for all repository reads*: Rejected to prevent database write starvation during AI agent deep scanning.
* **Reasons**: Preserves clean separation of concerns, guarantees provider neutrality, enforces multi-tenant memory and token isolation, and provides robust resilience against rate limits and transient network failures.
* **Consequences**:
  * Task P3-004 will implement `GitHubAppConnector` in `src/connectors/github/github-connector.js` following this specification.
* **Revisit Conditions**: When deep repository tree traversal and multi-file batch downloading (P3-005) or GraphQL-based batch inspection is introduced.

---

### ADR-025: GitHub Deep Repository Inspection Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 3 (Task P3-005), the platform requires deep repository inspection capabilities—`getReadme`, `getRepositoryTree`, `getLanguages`, `getRecentCommits`, and `getFileContent`—to support Phase 4 skills extraction and project provenance tracking. We must design strict resource bounds, security protections, and data minimization invariants to prevent OOM crashes, path traversal vulnerabilities, binary ingestion errors, circular symlink loops, and secret/PII leakage.
* **Decision**: Implement deep repository inspection operations adhering to the following core architectural invariants:
  * **Strict File Size Limits**: Enforce a hard ceiling of 1 MB on single file content reading (`getFileContent`) and 256 KB on decoded README markdown (`getReadme`). Files exceeding these bounds are rejected or truncated with explicit metadata flags.
  * **Directory Tree Bounds**: Capped at a maximum depth of 10 nested directory levels and 1,000 total entries per crawl. Gracefully handles GitHub `truncated: true` payloads without crashing.
  * **Binary & Media Filtering**: Automatically filters out compiled binaries, executables, archives, and media files via extension blocklists and null-byte detection (first 512 bytes).
  * **Symlink Exclusion & POSIX Path Normalization**: Rejects Git symlink entries (`mode === '120000'`). Normalizes all file paths via `path.posix.normalize()`, strictly rejecting path traversal (`..`), leading slashes, null bytes (`%00`), and Windows backslashes with `400 ValidationError`.
  * **Commit History & PII Scrubbing**: Returns a maximum of 100 recent commits (default 30), prunes commit messages to 500 characters, and excludes raw author email addresses from domain payloads.
  * **Ephemeral Processing Policy**: Repositories are processed ephemerally in-memory for skills/evidence token extraction; full repository file trees and raw code clones are never stored permanently in PostgreSQL.
  * **Capability Expansion**: Declares `CONNECTOR_CAPABILITIES.READ_CONTENT` in `GitHubAppConnector`.
* **Alternatives Considered**:
  * *Storing full repository file trees in PostgreSQL*: Rejected to avoid database storage bloat and unnecessary data retention liability.
  * *Permitting unrestricted file sizes for code analysis*: Rejected to eliminate OOM vectors and event-loop blocking during AI candidate profiling.
  * *Following symlinks*: Rejected to eliminate path traversal vulnerabilities and circular loop deadlocks.
* **Reasons**: Guarantees system resilience against massive or hostile repositories, protects user privacy, enforces least-privilege data access, and prepares the platform for Phase 4 evidence extraction.
* **Consequences**:
  * Task P3-005 will implement deep inspection methods in `src/connectors/github/github-connector.js` following this specification.
* **Revisit Conditions**: When multi-file tarball streaming or semantic code embedding pipelines are introduced in Phase 5.

---

### ADR-026: GitHub Connector Caching & Rate-Limit Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 3 (Task P3-006), the platform requires an intelligent caching and rate-limit tracking layer for `GitHubAppConnector` to prevent exhausting GitHub's 5,000 req/hr installation quota during deep candidate repository scans and AI agent exploratory crawls. We must establish clear rules regarding what data can be cached, tenant partition isolation, conditional HTTP `ETag` / `If-None-Match` revalidation, memory bounds, TTL policies, and webhook-driven invalidation.
* **Decision**: Implement `GitHubConnectorCache` and `GitHubRateLimiter` governed by the following core architectural decisions:
  * **Strictly Normalized Domain Caching**: Only sanitized/normalized domain models (`NormalizedAccount`, `NormalizedResource`, `NormalizedLanguageBreakdown`, `NormalizedDirectoryTree`, `NormalizedReadme`, `NormalizedCommit`, `NormalizedFileContent`) and upstream `ETag` strings are stored in cache. Tokens, App JWTs, private keys, author emails, and unnormalized raw responses are strictly prohibited.
  * **Multi-Tenant Partition Isolation**: Cache keys are deterministically namespaced with `tenantId` and `installationId` (`gh_cache:<tenantId>:<installationId>:<operation>:<resourceId>:<paramsHash>`). Cross-tenant cache hits or lookups are impossible.
  * **HTTP `ETag` & 304 Conditional GET**: For stale cache entries possessing an upstream `ETag`, requests forward `If-None-Match: <etag>`. Upon receiving `304 Not Modified`, the cached payload is returned immediately with refreshed TTL and zero rate-limit quota consumption.
  * **Tiered TTL Policy**:
    * Account / Commits: 5 minutes.
    * Resource catalog / Trees / README / File contents: 15 minutes (or 24 hours if pinned to Git commit/tree SHA).
    * Languages: 30 minutes.
  * **Strict Memory Ceilings & LRU Eviction**: In-memory LRU cache capped at a global maximum of 2,000 entries (~50 MB ceiling) and 500 entries per tenant. Payloads exceeding 1 MB are never cached.
  * **Webhook-Driven Purging**: Webhook events (`push`, `installation_repositories.removed`, `installation.deleted`, `installation.suspend`) trigger immediate targeted cache eviction in `GitHubWebhookService`.
  * **In-Memory Rate Limit Tracking**: Tracks remaining quota (`x-ratelimit-remaining`) and reset epoch per installation. Emits `logger.warn` when remaining <= 50 and enforces proactive throttling when <= 5.
* **Alternatives Considered**:
  * *Using Redis for connector caching*: Rejected for Phase 3 to avoid external infrastructure dependencies before distributed multi-node deployment. In-memory LRU provides microsecond latency with strict memory bounds.
  * *Unconditional caching without `ETag` revalidation*: Rejected because code updates pushed to GitHub would remain stale until TTL expiry without guarantee of freshness.
* **Reasons**: Dramatically reduces GitHub API rate-limit quota consumption, accelerates repository inspection latency by >90% on repeated queries, and enforces bulletproof tenant isolation.
* **Consequences**:
  * Task P3-006 will implement `GitHubConnectorCache` and `GitHubRateLimiter` in `src/connectors/github/` and integrate them into `GitHubAppConnector`.
* **Revisit Conditions**: When distributed multi-instance clustering or Redis-backed global caching is introduced in Phase 14.

---

### ADR-027: Unified Candidate and Resource Domain Model
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 4 (Task P4-001A), the platform requires a canonical domain model that unifies candidate identity, connected third-party resources (GitHub, GitLab, LinkedIn, Google Drive, uploaded resumes), projects, skills, evidence items, and immutable provenance tracking. We must design a provider-neutral architecture that prevents vendor lock-in to GitHub, preserves strict multi-tenant isolation, enforces radical evidence provenance (zero hallucination), cleanly separates projects from individual repositories, and avoids bloated full-source code storage in PostgreSQL.
* **Decision**: Adopt the **Unified Candidate & Resource Domain Model** defined in `docs/unified-candidate-resource-model.md` governed by the following core architectural decisions:
  * **Canonical Candidate Entity**: Represents a sovereign human professional persona strictly owned by exactly one `Tenant` (`tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`). Decouples human identity from external accounts (GitHub username is an external identity attribute, never the primary key).
  * **Explicit Entity Layering**:
    * `User`: Platform authentication/session actor.
    * `Candidate`: Career profile persona.
    * `CandidateIdentity`: Linked third-party accounts (`GITHUB_APP`, `LINKEDIN`, etc.).
    * `ResourceConnection`: Credential and OAuth token vault (AES-256-GCM).
    * `Resource`: Provider-neutral catalog of external assets (e.g. Git repository numeric ID `1338724502`, Google Drive document, uploaded resume).
    * `Project`: Curated professional initiative decoupled from repositories via `project_resources` many-to-many join table ($1\text{ Project} \ne 1\text{ Repository}$).
    * `Skill`: Canonical global taxonomy dictionary (`slug`, `name`, `category`, `aliases`).
    * `CandidateSkill`: Candidate-specific skill claim with provenance status (`VERIFIED`, `INFERRED`, `CLAIMED`, `MISSING`) and confidence scoring ($0.00$ to $1.00$).
    * `EvidenceItem`: Immutable proof node linking skills/projects to exact source locations (`provider`, `resource_id`, `filePath`, `commitSha`, `lineRange`, `excerpt`, `confidenceScore`).
  * **Radical Provenance & Data Minimization**: Every derived fact must trace back to an exact source artifact and commit SHA. Full source files and ASTs are processed ephemerally in memory; only sanitized evidence excerpts ($\le 1\text{ KB}$) with secret redaction are stored.
  * **Multi-Tenant Security Invariants**: All relational tables enforce foreign keys to `tenants.id` with `ON DELETE CASCADE`. Cross-tenant candidate access returns 404 default-deny.
* **Alternatives Considered**:
  * *Global Shared Candidates Across Tenants*: Rejected because sharing candidate entities across organizational boundaries creates cross-tenant data leaks and violates GDPR/CCPA.
  * *Coupling Projects 1:1 with Git Repositories*: Rejected because real-world software projects frequently span multiple repositories (frontend + backend + infra) or live inside monorepos containing multiple projects.
  * *Persisting Full Repository Source Code / ASTs in PostgreSQL*: Rejected to eliminate database bloat and liability. Evidence pointers (commit SHA + file path + small excerpt) provide complete provenance with minimal footprint.
* **Reasons**: Guarantees provider neutrality, prevents resume hallucination with verifiable evidence chains, ensures strict multi-tenant cryptographic isolation, and establishes a robust foundation for Phase 4 skills extraction and Phase 5 career intelligence.
* **Consequences**:
  * Task P4-001 will implement Zod domain schemas and validators in `src/domain/candidate/` adhering to this specification.
  * Task P4-002 will implement the proposed PostgreSQL schema in `src/db/schema.js` and generate migrations.
* **Revisit Conditions**: When multi-tenant organization candidate sharing (with explicit candidate consent) or vector embedding storage for semantic project matching is introduced.

---

### ADR-028: GitHub Evidence Extractor Architecture & Security Rules
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 4 (Task P4-003A), the platform must parse raw, untrusted GitHub repository content (package manifests, configuration files, commit histories, code entrypoints) into verified, typed career evidence (`CandidateSkill`, `ProjectEvidence`, `EvidenceItem`). Untrusted repository content poses severe security risks including prototype pollution in JSON manifests, ReDoS in regex parsing, malicious code execution if scripts are evaluated, memory exhaustion via bloated manifests, and credential leakage if planted API keys/secrets are extracted into evidence excerpts. We must define strict architecture and security invariants before implementation.
* **Decision**: Adopt the **GitHub Evidence Extractor Architecture** defined in `docs/github-evidence-extractor-architecture.md` (`ARCH-008`) governed by the following core architectural decisions:
  * **Zero Code Execution & Pure Static Parsing**: Never execute, evaluate, import, or run untrusted repository code. Prohibit `eval()`, `new Function()`, `vm`, `child_process`, and external language runtimes. Use pure text-based safe JSON/TOML parsers, streaming line scanners, and linear non-backtracking regular expressions.
  * **Prototype Pollution & ReDoS Defense**: Sanitize JSON objects (strip `__proto__`, `constructor`, `prototype`), use `Object.create(null)` for lookup dictionaries, enforce line length limits ($\le 500$ chars), and cap file scanning ($\le 1,000$ lines, $\le 50$ KB per file).
  * **Multi-Ecosystem Manifest Support**: Modular parsers for Node.js (`package.json`), Python (`requirements.txt`, `Pipfile`, `pyproject.toml`), Go (`go.mod`), and Rust (`Cargo.toml`). Rejects unsafe pip flags (`-r`, `-e`, `-i`, `--extra-index-url`, `git+`) to prevent injection or SSRF vectors.
  * **Mandatory Secret & PII Redaction**: Every evidence excerpt ($\le 1024$ chars) must pass through `SecretScrubber` to strip private keys, GitHub tokens, AWS keys, JWTs, API secrets, and connection strings before persisting to `evidence_items`.
  * **Canonical Taxonomy Mapping**: Normalizes raw package identifiers (e.g. `@fastify/cors`, `pg`, `psycopg2`, `gorm.io/gorm`, `tokio`) to canonical global skill slugs (`fastify`, `postgresql`, `gorm`, `tokio`).
  * **Deterministic Deduplication**: Computes SHA-256 fingerprint over `(tenant_id, candidate_id, resource_id, skill_slug, evidence_type, file_path, commit_sha)` to enable idempotent re-extractions without duplicating rows in `evidence_items`.
  * **Mathematical Confidence Scoring & Rollup**: Assigns granular confidence scores ($0.20$ to $1.00$) and rolls up multiple evidence nodes into verified `CandidateSkill` assertions.
* **Alternatives Considered**:
  * *Using external CLI tools (e.g. `pip-compile`, `cargo metadata`, `go mod graph`)*: Rejected because invoking external language CLI binaries on untrusted repository code is a major remote code execution (RCE) vector and introduces massive deployment dependencies. Pure static parsing is secure, hermetic, and lightning fast.
  * *Unsanitized Full-File Excerpt Storage*: Rejected to prevent storing embedded secrets, database passwords, or bloated files in PostgreSQL `evidence_items`.
* **Reasons**: Guarantees airtight security against untrusted repository payloads, prevents credential leakage, enables reproducible evidence extraction across diverse software ecosystems, and preserves multi-tenant isolation.
* **Consequences**:
  * Task P4-003 will implement `GitHubEvidenceExtractorService`, manifest parsers, `TaxonomyMapper`, and `SecretScrubber` in `src/extractors/github/`.
* **Revisit Conditions**: When adding JVM (`pom.xml`, `build.gradle`) or C# (`.csproj`) manifest parsers in future phases.

---

### ADR-029: Evidence Linking and Provenance Integrity Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 4 (Task P4-004A), we must define how extracted evidence nodes (`EvidenceItem`) are linked to candidate skill rollups (`CandidateSkill`) and project initiatives (`Project`). The evidence linking model must guarantee zero-hallucination integrity for AI career tools, prevent cross-tenant evidence leakage, maintain stable immutable citation identifiers, preserve historical evidence without destructive mutations, and maintain transactional atomicity.
* **Decision**: Adopt the **Evidence Linking & Provenance Integrity Architecture** defined in `docs/evidence-linking-architecture.md` (`ARCH-009`) governed by the following core architectural decisions:
  * **Canonical Evidence Identity (`EvidenceId`)**: `evidence_items.id` (UUIDv4) is the universal, immutable identifier for all citations, API responses, and database foreign keys. Synthetic prefix IDs and compound keys are rejected.
  * **Fingerprint Decoupling**: Ingestion deduplication uses a deterministic SHA-256 content-addressable hash (`metadata.fingerprint`) computed over `(tenant_id, candidate_id, resource_id, skill_slug, evidence_type, file_path, commit_sha)`, decoupling deduplication from entity primary keys.
  * **Strict Provenance Immutability**: `id`, `tenantId`, `candidateId`, `resourceId`, `sourceProvider`, `evidenceType`, `sourceLocation` (`filePath`, `commitSha`, `lineRange`), and `excerpt` are strictly immutable once created. Linkers must never rewrite excerpts or provenance pointers.
  * **Skill Linking via Direct FKs & Primary Anchor**: `candidate_skills.primary_evidence_id` points to the highest-confidence anchor proof node, while `evidence_items.skill_id` links all supporting nodes. A separate join table is explicitly rejected as redundant overhead.
  * **Project Linking ($1 : N$)**: `evidence_items.project_id` links evidence directly to projects, while `project_resources` links projects to underlying repositories ($M : N$).
  * **Strict Multi-Tenant Default-Deny**: Enforces tenant equality across all participating entities (`EvidenceItem.tenantId == Candidate.tenantId == Resource.tenantId == Project.tenantId`). Cross-tenant operations return 404 default-deny.
  * **Concrete Commit SHA Pinning**: Provenance must always be pinned to a 40-character hexadecimal Git commit SHA. Transient branch names (`main`, `HEAD`) are strictly prohibited as persistent provenance values.
  * **Historical Evidence Preservation**: Code modifications or dependency deletions do not purge historical evidence; freshness is tracked via `detectedAt` and `lastObservedAt` timestamps.
  * **Transactional Atomicity**: All linking and rollup operations execute atomically inside a single database transaction downstream of external GitHub API retrieval.
* **Alternatives Considered**:
  * *Introducing a `candidate_skill_evidence` join table*: Rejected because `evidence_items` already contains `(tenant_id, candidate_id, skill_id)`. An extra join table introduces redundant writes and dual sources of truth without architectural benefit.
  * *Allowing dynamic branch names as provenance*: Rejected because branch heads change with every push, destroying cryptographic auditability and reproducibility.
  * *Deleting old evidence when dependencies are removed*: Rejected because historical accomplishments remain factual proof of competence.
* **Reasons**: Enforces provider-neutral zero-hallucination guarantees, maintains strict multi-tenant isolation, preserves historical provenance, and provides an efficient, verifiable foundation for Phase 5 Career Intelligence and Phase 7 Remote MCP Server.
* **Consequences**:
  * Task P4-004 will implement `EvidenceLinkingService` in `src/services/` and domain linking methods without modifying the database schema.
* **Revisit Conditions**: When multi-tenant organization credential sharing or cross-resource aggregate project trees are introduced in future phases.

---

### ADR-030: Candidate Profile Service Architecture and Claim Integrity
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 4 (Task P4-005A), the platform requires a canonical lifecycle and aggregation service for candidate profiles (`CandidateProfileService`). The service must combine verified identities, connected resources, domain projects, verified skill rollups, and manual user claims into a single coherent domain view without allowing unverified user claims to masquerade as verified facts, without permitting background resource syncs to overwrite user narratives, and without exposing sensitive credentials or private tokens.
* **Decision**: Adopt the **Candidate Profile Service Architecture** defined in `docs/candidate-profile-service-architecture.md` (`ARCH-010`) governed by the following core architectural decisions:
  * **Strict Claim Classification**: Rigorously separate machine-verified facts (`provenanceStatus` `VERIFIED` or `INFERRED`) from self-asserted user claims (`provenanceStatus = 'CLAIMED'`). User claims are explicitly tagged and serialized as `[Unverified User Claim]` and can never attain `VERIFIED` status without cryptographic evidence nodes.
  * **User Narrative Sovereignty**: Resource synchronization (e.g. GitHub App sync) updates resource catalogs and skill evidence graphs, but **never** overwrites explicit user-authored profile text (`displayName`, `headline`, `summary`, `canonicalEmail`).
  * **Candidate vs. User Decoupling**: Candidate profiles are decoupled from the platform authentication `User` entity, enabling multi-persona modeling, recruiter agency workflows, and organizational candidate directories under strict tenant isolation.
  * **Credential Redaction**: Profile responses expose clean resource summaries while strictly blacklisting `encryptedCredentials`, installation tokens, OAuth tokens, and private keys.
  * **Project Multi-Resource Decoupling**: Projects represent curated career initiatives ($1\text{ Project} \ne 1\text{ Repository}$) and can encompass multiple connected resources via `project_resources`.
  * **Multi-Tenant Sovereign Default-Deny**: All profile operations validate `tenant_id = context.tenantId`. Cross-tenant lookups fail closed with `404 Not Found`.
  * **Role-Based Access Control**: `OWNER` has full tenant profile authority; `MEMBER` can edit self-linked profiles; `READONLY` is restricted to read-only profile inspection with 403 enforcement.
* **Alternatives Considered**:
  * *Allowing unverified manual claims to be labeled as verified*: Rejected because it destroys the platform's core zero-hallucination guarantee and misleads ATS/AI recruiters.
  * *Overwriting profile headlines on every GitHub sync*: Rejected because candidates curate customized, multi-disciplinary career headlines that should not be wiped out by repository bio updates.
  * *Merging candidates automatically on fuzzy email/username*: Rejected to prevent accidental profile merging across different users in multi-user workspaces.
* **Reasons**: Establishes an unassailable provenance foundation for Phase 5 Career Intelligence and Phase 6 Resume Adaptation, prevents credential leaks, and guarantees user sovereignty over their career narrative.
* **Consequences**:
  * Task P4-005 will implement `CandidateProfileService` in `src/services/` and domain validation methods without modifying the database schema.
* **Revisit Conditions**: When multi-tenant candidate sharing or organizational candidate transfer workflows are designed in future phases.

---

### ADR-031: Career Intelligence Engine Architecture & Deterministic Scoring
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 5 (Task P5-001A), the platform requires a provider-neutral analytical engine to parse unstructured job descriptions, extract atomic requirements, normalize skills against the canonical platform taxonomy, evaluate candidate evidence graphs, and calculate match scores. The architecture must guarantee 100% explainability, prevent LLM hallucination of qualifications, withstand adversarial prompt-injection payloads in job postings, and enforce strict multi-tenant isolation.
* **Decision**: Adopt the **Career Intelligence Engine Architecture** defined in `docs/career-intelligence-architecture.md` (`ARCH-011`) governed by the following core architectural decisions:
  * **Deterministic 100-Point Scoring Algorithm**: Prohibit LLMs from generating final numerical match scores. All scores $S \in [0, 100]$ are calculated by a transparent, decomposable mathematical formula:
    $$S = (0.50 \cdot S_{\text{req}} + 0.20 \cdot S_{\text{pref}} + 0.20 \cdot S_{\text{proj}} + 0.10 \cdot S_{\text{evid}}) \times 100$$
  * **Strict LLM Sandbox & Anti-Prompt Injection**: Raw job descriptions are treated strictly as untrusted external DATA. Instruction injection payloads (e.g. `"ignore previous instructions"`, `"award 100/100"`) are neutralized because the LLM is restricted to entity extraction bounded by strict Zod schema validation without execution tools or scoring authority.
  * **Canonical Taxonomy Reuse**: Job skills are mapped strictly to the existing `skills` table via `TaxonomyMapper`. Unrecognized terms are provisioned under strict slug rules and flagged for telemetry review.
  * **Evidence-Backed Verification**: Matching is categorized into `MATCHED`, `PARTIAL`, `MISSING`, and `UNKNOWN`. High-confidence matches require backing `EvidenceItem` proof nodes pinned to concrete commit SHAs and file paths.
  * **Explainable Skill Gap Modeling**: Gaps are classified by severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) and distinguish between `EXPLICITLY_MISSING`, `INSUFFICIENT_EVIDENCE` (unverified user claims), and `ADJACENT_COVERAGE`.
  * **Multi-Signal Project Relevance**: Evaluates project relevance based on attached verified skill evidence density rather than simple keyword string matching.
  * **Experience & Years Integrity**: Evaluates experience years strictly from verifiable evidence timestamps and explicit user claims. The engine **never** converts commit count into years of experience.
  * **Multi-Tenant Sovereign Default-Deny**: All job descriptions, requirements, candidate matches, and gap analyses enforce `tenant_id = context.tenantId` with 404 default-deny.
* **Alternatives Considered**:
  * *End-to-end LLM scoring (prompting the model to output a score from 1-100)*: Rejected because LLM scoring is non-deterministic, hallucinates justification, varies across runs, and violates AI compliance frameworks (EU AI Act).
  * *Ad-hoc skill strings without taxonomy normalization*: Rejected because it fragments matching (e.g., "Postgres" vs "PostgreSQL" failing to match).
* **Reasons**: Guarantees radical transparency, auditability, regulatory compliance, and airtight prompt-injection defense while delivering actionable, evidence-grounded career insights.
* **Consequences**:
  * Phase 5 tasks will implement deterministic parsers, Zod schemas, scoring services, and database persistence in `src/services/intelligence/` and `src/domain/intelligence/`.
* **Revisit Conditions**: When multilingual job parsing or multi-vector semantic embedding search is integrated in future phases.

---

### ADR-032: Skill Taxonomy & Normalization Engine Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 5 (Task P5-002A), the platform requires a centralized, deterministic technology taxonomy and normalization engine. Real-world code evidence (manifest packages, AST imports, repository topics) and job postings contain hundreds of disparate technology representations, abbreviations, package names, and synonyms (e.g. `Postgres`, `PostgreSQL`, `pg`, `psycopg2`, `React`, `React.js`, `ReactJS`, `Node.js`, `NodeJS`). The architecture must guarantee that all synonyms map deterministically to a single canonical skill identity without fragmentation or hallucination, while supporting explicit framework-to-language relationships (`BUILT_ON`), safe unknown tool handling, and multi-tenant isolation.
* **Decision**: Adopt the **Skill Normalizer & Taxonomy Engine Architecture** defined in `docs/skill-taxonomy-architecture.md` (`ARCH-012`) governed by the following core architectural decisions:
  * **Strict Canonical Identity (One Canonical Slug per Tech)**: Every technical skill has exactly one canonical slug matching `^[a-z0-9]+(?:-[a-z0-9]+)*$` (e.g. `postgresql`, `react`, `node-js`, `c-sharp`, `fastapi`). Slugs are permanent and decoupled from UUID primary keys.
  * **Seven Approved Categories**: Strictly reuse the 7 approved categories (`LANGUAGE`, `FRAMEWORK`, `DATABASE`, `CLOUD_DEVOPS`, `TOOL`, `ARCHITECTURE`, `CONCEPT`) without introducing ad-hoc categories.
  * **Deterministic 7-Stage Normalization Pipeline**: Normalization executes in 7 deterministic stages: Input Bounds & Sanitization $\rightarrow$ Unicode NFKC & Case-Folding $\rightarrow$ Scope & Suffix Stripping $\rightarrow$ Direct Catalog Lookup $\rightarrow$ Multi-Variation Alias Lookup $\rightarrow$ Context/Keyword Disambiguation $\rightarrow$ Canonical Relationship Assembly.
  * **Explicit Relationship Graph over Naive Inheritance**: Relationship edges are explicitly typed (`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`, `PARENT_OF`). A framework (e.g. `React`) is modeled as `BUILT_ON` `JavaScript`, rather than an "instance of" JavaScript, preventing false transitive assumptions.
  * **Controlled Unknown Technology Handling**: Unrecognized terms generate validated kebab-case slugs, default to category `TOOL`, are flagged with `isCustom: true` and `requiresReview: true`, and emit `taxonomy.unknown_term_observed` audit telemetry for curator review. Unknown terms are never automatically aliased to existing technologies.
  * **Strict LLM Boundary**: LLMs cannot act as the primary normalizer, cannot create arbitrary canonical skills, and cannot mutate taxonomy records. Any optional LLM disambiguation output must be validated against the approved canonical catalog.
  * **Hybrid In-Memory & Database Storage**: Compiled in-memory catalog provides zero-latency $O(1)$ lookups in ingestion hot paths, while PostgreSQL `skills` table serves as the global relational source of truth for foreign key constraints (`candidate_skills.skill_id`, `evidence_items.skill_id`). Zero premature database migrations are introduced in P5-002A.
  * **Decoupled Confidence Taxonomy**: Separation between Normalization Confidence ($1.0$ exact, $0.95$ alias, $0.85$ contextual, $0.70$ LLM, $0.50$ unknown tool), Evidence Item Confidence, Candidate Skill Rollup Confidence, and Job Match Score.
* **Alternatives Considered**:
  * *LLM-driven freeform skill canonicalization*: Rejected because LLMs produce non-deterministic variations, invent duplicate slugs, and introduce latency into high-throughput repository scanners.
  * *Pure object-oriented taxonomy inheritance*: Rejected because software engineering relationships are multi-dimensional (e.g., Next.js is built on React, which is built on JavaScript, but Next.js also encompasses server-side Node.js runtimes and bundler tooling).
  * *Database-only taxonomy querying for every AST node*: Rejected because database latency on millions of parsed AST nodes per repository would violate indexing performance SLAs.
* **Reasons**: Ensures 100% deterministic, high-performance skill normalization, eliminates duplicate skill identities, maintains radical auditability, and provides zero-breaking-change backward compatibility for all existing evidence items and candidate profile records.
* **Consequences**:
  * Phase 5 Task P5-002 will implement the comprehensive 50+ technology alias catalog, relationship lookups, and test suite in `src/extractors/github/taxonomy/taxonomy-mapper.js` and `src/domain/career/`.
* **Revisit Conditions**: When tenant-custom organizational taxonomy extensions or multi-language internationalized taxonomy naming is requested.

---

### ADR-033: Evidence Matching & Gap Analysis Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 5 (Task P5-003A), the platform requires a deterministic, provider-neutral matching and gap analysis engine to evaluate structured job requirements (`JobRequirement`) against candidate profiles (`CandidateProfileView`, `CandidateSkill`, `Project`, `EvidenceItem`). The engine must classify matches with radical evidentiary precision (`MATCHED`, `PARTIAL`, `MISSING`, `UNKNOWN`), prioritize actionable skill gaps (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), enforce multi-tenant sovereign default-deny, and eliminate AI hallucinations without introducing premature database tables or non-deterministic LLM scoring.
* **Decision**: Adopt the **Evidence Matching & Gap Analysis Architecture** defined in `docs/evidence-matching-architecture.md` (`ARCH-013`) governed by the following core architectural decisions:
  * **Canonical 4-Status Match Evaluation**: Requirements are evaluated into exactly four canonical statuses (`MATCHED`, `PARTIAL`, `MISSING`, `UNKNOWN`).
  * **Strict Evidence Gating for `MATCHED`**: A technical skill requirement attains `MATCHED` if and only if backed by a canonical taxonomy match, `CandidateSkill.provenanceStatus === 'VERIFIED'` (or strong `INFERRED` $\ge 0.85$), and $\ge 1$ qualifying code `EvidenceItem` (`PACKAGE_MANIFEST_DEPENDENCY`, `CODE_IMPORT`, `CODE_USAGE`, `CONFIG_SYNTAX_DECLARATION`). A self-asserted claim or README mention alone **never** produces `MATCHED`.
  * **Precise Deterministic `PARTIAL` Conditions**: `PARTIAL` is reserved for specific conditions: (1) unverified user claims (`[Unverified User Claim]`), (2) adjacent/related technologies via taxonomy relationships (`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`), (3) partial tenure duration, or (4) evidence confidence $< 0.85$.
  * **Zero False Negative `MISSING` Assertions**: `MISSING` is applied only to mechanically evaluable requirements where the candidate possesses zero qualifying evidence and zero relevant claims. Subjective soft skills, culture requirements, or unstated candidate profile fields (e.g. unstated degree) evaluate to `UNKNOWN` or `INSUFFICIENT_EVIDENCE` rather than false negative absence.
  * **Taxonomy Relationship Integration**: Leverage `ARCH-012` directional graph edges (`BUILT_ON` with $0.90-0.95$ multiplier for frameworks/runtimes, `ECOSYSTEM_OF` with $0.75-0.80$ multiplier for SDKs/drivers, `IMPLEMENTS` with $0.50$ multiplier for sibling database/protocol implementations).
  * **Non-Skill Protocol Boundaries**:
    - *Experience*: Observed GitHub commit timestamps establish code activity duration, but are never conflated with corporate employment tenure without explicit work history records.
    - *Education*: Evaluated hierarchically by degree level and field of study; unstated profile education yields `UNKNOWN`.
    - *Location*: Evaluated against workplace constraints (`REMOTE`, `HYBRID`, `ON_SITE`); unstated candidate location yields `UNKNOWN`.
    - *Domain*: Evaluated against curated project domains and architectures, not single package imports.
  * **Separation of Match Confidence from Numerical Scoring**: Match confidence $C_{\text{match}}$ is computed deterministically per requirement ($C_{\text{req}} \times C_{\text{cand\_skill}} \times C_{\text{evid}}$). Final 100-point candidate scoring remains strictly separated in downstream scoring engines.
  * **Actionable Skill Gap Prioritization**: Gaps are classified by priority (`CRITICAL` for missing required, `HIGH` for unverified required claims or missing high-weight preferred, `MEDIUM` for standard preferred, `LOW` for optional) and severity (`EXPLICITLY_MISSING`, `UNVERIFIED_CLAIM`, `INSUFFICIENT_EVIDENCE`, `PARTIAL_TENURE`).
  * **Verifiable Match Explanations**: Structured, deterministic explanation strings linking up to 3 `EvidenceRef` nodes with commit-pinned provenance.
  * **Multi-Tenant Sovereign Default-Deny**: All match operations enforce `tenant_id === context.tenantId` across job descriptions, candidates, skills, and evidence. Cross-tenant lookups fail closed with `404 NotFoundError`.
  * **Ephemeral On-Demand Computation & $O(N)$ Performance**: Matching is executed in-memory with pre-indexed skill hash maps. No database migrations or persistent match tables are introduced in P5-003.
  * **Strict LLM Boundary**: LLMs are prohibited from deciding match statuses, confidence values, or gap severities.
* **Alternatives Considered**:
  * *LLM-driven matching decisions*: Rejected because LLMs hallucinate matches, produce non-deterministic verdicts across identical runs, and fail auditability requirements.
  * *Binary (MATCHED / MISSING) matching*: Rejected because it ignores transferable skills, partial tenure, and unverified user claims, creating harsh false negatives.
  * *Premature persistence tables (`candidate_requirement_matches`)*: Rejected because matching results are purely derived from existing database state and can be computed on-demand with sub-millisecond latency.
* **Reasons**: Guarantees radical transparency, mathematical explainability, regulatory compliance (EU AI Act), zero hallucinations, and actionable gap analysis while preserving multi-tenant isolation.
* **Consequences**:
  * Phase 5 Task P5-003 will implement the deterministic matching service, gap analysis engine, and Zod schemas in `src/domain/career/` and `src/services/`.
* **Revisit Conditions**: When semantic vector embedding similarity or custom recruiter scoring weights are introduced.

---

### ADR-034: Project Relevance Scoring Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 5 (Task P5-004A), the platform requires a deterministic, provider-neutral Project Relevance Engine to evaluate and rank candidate projects against target job descriptions. The engine must answer which specific projects demonstrate the highest technical depth and verified proof for a particular job, evaluate multi-dimensional architectural density across 10 engineering domains, support multi-repository aggregation with strict deduplication, enforce multi-tenant default-deny, and eliminate AI hallucinations without introducing premature database tables or non-deterministic LLM scoring.
* **Decision**: Adopt the **Project Relevance Scoring Architecture** defined in `docs/project-relevance-architecture.md` (`ARCH-014`) governed by the following core architectural decisions:
  * **Canonical 0–100 Composite Score**: Adopt a canonical composite score $S_{\text{proj}} \in [0.0, 100.0]$ decomposed into 5 transparent, additive components:
    - *Requirement Coverage* (50 Points): Direct required/preferred skills demonstrated in project code.
    - *Architectural Density* (25 Points): Multi-tier engineering depth across 10 deterministic dimensions.
    - *Evidence Quality* (15 Points): Evidentiary weight of attached proof nodes (Manifests/Imports $>$ Readmes).
    - *Project Completeness* (5 Points): Presence of automated test suites, documentation, and CI/CD pipelines.
    - *Activity Recency* (5 Points): Bounded recency multiplier capped at 5 points (prevents recency from dominating technical depth).
  * **Relevance Band Taxonomy**: Classify projects into four discrete relevance bands: `HIGH` ($\ge 75.0$), `MEDIUM` ($50.0 - 74.9$), `LOW` ($25.0 - 49.9$), and `MINIMAL` ($< 25.0$).
  * **Strict Deduplication Guard**: A skill or requirement is counted at most once per project regardless of the number of files or linked repositories.
  * **Directional Taxonomy Multipliers**: Apply calibrated taxonomy relationship weights (`BUILT_ON` with $0.90$, `ECOSYSTEM_OF` with $0.75$, `IMPLEMENTS` with $0.50$, `PARENT_OF` with $1.00$).
  * **Multi-Repository Aggregation (Project $\ne$ Repository)**: Support multi-resource projects by pooling and deduplicating evidence items across child repositories.
  * **Verifiable Explanations & Bounded Evidence Selection**: Produce deterministic explanation strings citing up to 5 commit-pinned `EvidenceRef` nodes.
  * **Multi-Tenant Sovereign Default-Deny**: Enforce `tenant_id === context.tenantId` across job descriptions, candidate profiles, projects, and resources with 404 default-deny.
  * **Ephemeral On-Demand Computation & $O(|\text{Projects}| \times |\text{Requirements}|)$ Performance**: Scoring is executed in-memory with pre-indexed hash maps. Zero premature database migrations are introduced in P5-004A.
  * **Strict LLM Boundary**: LLMs are prohibited from computing project scores or relevance bands.
* **Alternatives Considered**:
  * *LLM-driven project ranking*: Rejected because LLMs hallucinate project capabilities, vary across runs, and cannot be deterministically audited.
  * *Keyword search over README files*: Rejected because text mentions do not prove working code implementations or multi-tier architectural density.
  * *Repository byte size / file count scoring*: Rejected because huge auto-generated or vendored repositories would falsely score higher than clean, modular production services.
* **Reasons**: Guarantees mathematical explainability, regulatory compliance (EU AI Act), zero hallucinations, and actionable project highlighting while preserving multi-tenant isolation.
* **Consequences**:
  * Phase 5 Task P5-004 will implement the deterministic project relevance service and Zod schemas in `src/domain/career/` and `src/services/`.
* **Revisit Conditions**: When semantic vector embedding similarity or custom recruiter project filters are introduced.

---

### ADR-035: ATS Fit Score Calculator Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 5 (Task P5-005A), the platform requires a deterministic, provider-neutral apex evaluation engine to synthesize requirement match analysis (`P5-003`), project relevance scoring (`P5-004`), and candidate profile data (`Phase 4`) into an overall 100-point ATS Fit Score. The architecture must guarantee mathematical explainability, prevent qualification inflation (e.g. preferred skills masking missing core requirements), eliminate AI hallucinations without LLM scoring authority, prevent double-counting of evidence, enforce multi-tenant default-deny isolation, and deliver sub-millisecond in-memory performance without premature database migrations.
* **Decision**: Adopt the **ATS Fit Score Calculator Architecture** defined in `docs/ats-fit-score-architecture.md` (`ARCH-015`) governed by the following core architectural decisions:
  * **Canonical 100-Point Composite Fit Score**: Adopt a canonical 0–100 score decomposed into 7 distinct, additive components summing exactly to 100.0:
    - *Required Skills Coverage* ($40.0$ Points): Direct satisfaction of mandatory technical job requirements.
    - *Preferred Skills Coverage* ($15.0$ Points): Satisfaction of differentiator/bonus requirements.
    - *Project Relevance & Architectural Depth* ($20.0$ Points): Decaying top-3 weighted average of verified repository codebases.
    - *Professional Experience Tenure Fit* ($10.0$ Points): Corporate career tenure evaluated from explicit candidate experience records.
    - *Education Alignment Fit* ($5.0$ Points): Academic degree hierarchy compliance.
    - *Location & Work Authorization Fit* ($5.0$ Points): Remote / hybrid / on-site geographic compatibility.
    - *Evidence Confidence & Provenance Strength* ($5.0$ Points): Cryptographic verification quality across cited proof nodes.
  * **Required Skill Safety Gate (Hard Score Cap)**: Enforce non-compensatory score ceilings based on missing `REQUIRED` skills ($N_{\text{crit}}$):
    - $N_{\text{crit}} = 0$: Max score $100.0$ (Eligible for `EXCELLENT` / `STRONG`).
    - $N_{\text{crit}} = 1$: Hard cap $74.9$ (Capped at `MODERATE`).
    - $N_{\text{crit}} = 2$: Hard cap $49.9$ (Capped at `WEAK`).
    - $N_{\text{crit}} \ge 3$: Hard cap $24.9$ (Capped at `LOW`).
  * **Decaying Top-3 Project Aggregation**: Aggregate multiple candidate projects using a top-3 weighted average ($60\% / 30\% / 10\%$), rewarding deep primary systems while neutralizing micro-repository spam.
  * **Explicit UNKNOWN vs MISSING Neutrality**: Unstated candidate profile fields (e.g. unstated degree, unstated location) or subjective soft skills evaluate to `UNKNOWN` and receive neutral baseline credit, never incurring false-negative penalties.
  * **Fact vs Claim Precedence**: Unverified manual user claims (`[Unverified User Claim]`) contribute at a reduced partial factor ($0.25$) and cannot achieve `MATCHED` status without verified code evidence.
  * **Zero Conflation of Code Duration with Employment Tenure**: Observed Git commit history establishes technical skill duration, but is never converted into professional corporate employment tenure without explicit work history records.
  * **Fit Score Bands**: Classify overall fit into 5 discrete bands: `EXCELLENT` ($90.0 - 100.0$), `STRONG` ($75.0 - 89.9$), `MODERATE` ($50.0 - 74.9$), `WEAK` ($25.0 - 49.9$), and `LOW` ($0.0 - 24.9$).
  * **Deterministic Strengths & Explanations**: Generate structured `FitStrength` objects and evidence-linked narrative explanations without LLM generation.
  * **Multi-Tenant Sovereign Default-Deny**: Enforce `tenant_id === context.tenantId` across all inputs (job description, candidate profile, match analysis, project analysis) with 404 default-deny.
  * **Ephemeral In-Memory Computation & $\mathcal{O}(|\text{Req}| + |\text{Proj}| + |\text{Gaps}|)$ Latency**: Pure calculation service with zero network I/O, zero LLM calls, and zero premature database schema tables.
* **Alternatives Considered**:
  * *Prompting an LLM to generate the final fit score*: Rejected because LLMs hallucinate qualifications, produce varying scores across identical runs, and violate regulatory auditability requirements.
  * *Permitting preferred skills to compensate for missing required skills*: Rejected because hiring teams treat core requirements as mandatory knockouts.
  * *Equal weighting across all repositories*: Rejected because ten trivial utility repositories would falsely outweigh a single deep production-grade platform.
  * *Premature persistence tables (`candidate_job_fit_scores`)*: Rejected because ATS fit is derived on-demand from existing domain state with sub-millisecond latency.
* **Reasons**: Delivers radical transparency, mathematical explainability, regulatory compliance (EU AI Act, NYC Local Law 144), zero hallucinations, and actionable career insights while preserving multi-tenant isolation.
* **Consequences**:
  * Phase 5 Task P5-005 will implement `AtsFitScoreService` and domain schemas in `src/domain/career/` and `src/services/`.
* **Revisit Conditions**: When recruiter-customized component weight templates or organizational candidate ranking filters are introduced.

---

### ADR-036: Zero-Hallucination Career Integrity Gate Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 5 (Task P5-006A), the platform requires a definitive trust boundary between structured career intelligence and any downstream AI or human-readable career artifact (tailored resume bullets, cover letters, MCP tool responses, AI agent prompts). The gate must guarantee that no factual assertion is presented as verified without cryptographic proof grounded in immutable, commit-pinned evidence nodes, prevent qualification hallucinations, neutralize prompt-injection exploits, maintain multi-tenant default-deny isolation, and deliver sub-millisecond in-memory verification without premature database migrations.
* **Decision**: Adopt the **Zero-Hallucination Integrity Gate Architecture** defined in `docs/zero-hallucination-integrity-architecture.md` (`ARCH-016`) governed by the following core architectural decisions:
  * **Strict Verification Grounding**: No factual assertion may be assigned status `VERIFIED` unless it cites at least one valid, unforgeable `EvidenceId` (UUIDv4) that resolves to an active, tenant-matched `EvidenceItem`.
  * **Zero-Evidence Behavior**: When an evaluation query or AI generator asks about an unsupported skill or qualification, the gate **never** affirms capability. It outputs structured `MISSING_EVIDENCE`.
  * **Claim vs Fact Sovereignty**: Self-asserted manual profile claims cannot attain `VERIFIED` status without cryptographic evidence nodes and must always retain the explicit tag `[Unverified User Claim]` (`CLAIMED`).
  * **Zero Conflation of Code Duration with Corporate Tenure**: Observed Git commit timestamps establish technical skill duration, but are **never** converted into corporate employment tenure without explicit career history records.
  * **Taxonomic Inference Containment**: Skills inferred via taxonomy edges (e.g. Next.js $\rightarrow$ React via `BUILT_ON`) are classified strictly as `INFERRED` and cannot masquerade as direct `VERIFIED` evidence.
  * **Deterministic Multi-Evidence Aggregation**: Citations are deduplicated by `EvidenceId`, stably sorted by quality weight descending, and capped at a maximum of 5 `EvidenceRef` nodes per assertion. If any cited reference is invalid, the entire assertion fails closed.
  * **Comprehensive Blocking Rules**: Assigns status `BLOCKED` on unbacked verified claims, invalid EvidenceIds, tenant mismatches, candidate mismatches, provenance mismatches, unsupported tenure claims, or fabricated citations.
  * **Deterministic Safe Downgrade Protocol**: Over-broad or unverified claims are safely downgraded to factual inferred statements or labeled claims rather than completely fabricating proof.
  * **LLM Sandbox Boundary**: External AI models (Gemini, Claude, ChatGPT) receive only pre-validated assertions, and AI-generated outputs are strictly audited by the gate post-generation before release.
  * **Structured Audit Reason Codes**: Emits standardized, machine-readable reason codes (`VALID_EVIDENCE`, `VALID_INFERENCE`, `LABELED_USER_CLAIM`, `MISSING_EVIDENCE`, `UNBACKED_VERIFIED_CLAIM`, `INVALID_EVIDENCE_ID`, `TENANT_MISMATCH`, `CANDIDATE_MISMATCH`, `PROVENANCE_MISMATCH`, `UNSUPPORTED_TENURE`, `UNSUPPORTED_ACHIEVEMENT`, `FABRICATED_CITATION`).
  * **Multi-Tenant Sovereign Default-Deny**: Enforces `tenant_id === context.tenantId` across all assertions and cited evidence with 404 default-deny / `BLOCKED`.
  * **Ephemeral In-Memory Computation & $\mathcal{O}(|\text{Assertions}| + |\text{EvidenceRefs}|)$ Latency**: Pure validation engine executing with zero database writes, zero LLM calls, and zero premature schema migrations.
* **Alternatives Considered**:
  * *Trusting LLM-generated citations in resume bullets*: Rejected because LLMs hallucinate realistic-looking commit SHAs and repository paths that fail cryptographic auditability.
  * *Permitting commit activity to count as employment years*: Rejected because student or open-source commits do not equal professional corporate engineering tenure.
  * *Silently dropping invalid evidence citations*: Rejected because silent drops obscure security breaches and tenant boundary violations.
  * *Premature persistence tables (`career_assertions`)*: Rejected because integrity verification is performed on-demand during artifact generation with sub-millisecond latency.
* **Reasons**: Establishes an unassailable truth boundary for Phase 6 Resume Adaptation, Phase 7 Remote MCP Server, and provider-neutral AI integrations while guaranteeing complete regulatory auditability (EU AI Act).
* **Consequences**:
  * Phase 5 Task P5-006 will implement `ZeroHallucinationIntegrityService` and domain schemas in `src/domain/career/` and `src/services/`.
* **Revisit Conditions**: When persistent audited career assertion registries or cryptographic verification signatures (e.g. Ed25519 tokens) are introduced in future phases.

---

### ADR-037: Career Artifact Adaptation Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 6 (Task P6-001A), the platform requires a provider-neutral architecture for synthesizing evidence-backed career documents (`TailoredResume`, `TailoredCoverLetter`, `TailoredPortfolioContent`). The architecture must guarantee complete truth grounding in validated career assertions, prevent qualification hallucinations and metric fabrication, enforce multi-tenant default-deny isolation, decouple domain models from rendering engines (PDF/DOCX/HTML), support ATS keyword optimization through canonical taxonomy mapping, and execute on-demand without premature database migrations.
* **Decision**: Adopt the **Career Artifact Adaptation Architecture** defined in `docs/career-artifact-adaptation-architecture.md` (`ARCH-017`) governed by the following core architectural decisions:
  * **Absolute Truth Boundary & Grounding**: Artifact synthesis engines strictly consume `IntegrityCheckedAssertion` objects from the Zero-Hallucination Integrity Gate (`P5-006`). Unvalidated prose, raw candidate text, or unparsed repository files are strictly excluded from generation pipelines.
  * **Status Immutability**: Manual candidate claims retain the explicit label `[Unverified User Claim]` (`CLAIMED`), inferred skills retain `INFERRED` status, and missing evidence is never converted into affirmative qualifications.
  * **Structured Atomic Resume Bullets**: Every resume bullet is represented by `ResumeBullet` containing explicit `assertionIds`, commit-pinned `evidenceRefs`, relevance scores, and matched target job keywords.
  * **Safe ATS Keyword Alignment**: Target job terminology alignment is performed via canonical taxonomy mapping (`SkillTaxonomyEngine`). The engine is strictly prohibited from inserting keywords for skills the candidate does not demonstrate.
  * **Corporate Work History Authority**: Candidate employment tenure, employers, and job titles derive exclusively from explicit candidate work history records (`candidateProfile.experience`). Git commit timestamps and repository durations are never converted into corporate employment tenure.
  * **Quantitative Metric Safety**: Quantitative business outcome claims (e.g. *"Increased revenue by 40%"*, *"Scaled to 10M users"*) require explicit supporting evidence in candidate records; otherwise, they are strictly `BLOCKED`.
  * **Content Prioritization Hierarchy**: Deterministically prioritizes: 1. Verified Required Job Skills $\rightarrow$ 2. Verified Relevant Projects $\rightarrow$ 3. Verified Preferred Skills $\rightarrow$ 4. Inferred Related Skills $\rightarrow$ 5. Labeled Claims.
  * **LLM Sandbox & Phrasing Boundary**: External AI models (Gemini, Claude, ChatGPT) perform linguistic transformation only and are strictly forbidden from adding technologies, metrics, employers, or citations.
  * **Mandatory Post-Generation Integrity Gate**: Every generated bullet and paragraph is parsed and audited through `ZeroHallucinationIntegrityService` before release.
  * **Document Representation & Rendering Decoupling**: Synthesis outputs pure structured JSON domain models (`TailoredResume`, `TailoredCoverLetter`, `TailoredPortfolioContent`). PDF, DOCX, and HTML rendering are decoupled downstream adapters.
  * **Multi-Tenant Sovereign Default-Deny**: Enforces `context.tenantId` matches across all inputs with 404 default-deny.
  * **On-Demand Stateless Execution**: Operates in-memory with sub-second latency with zero premature database tables in Phase 6.
* **Alternatives Considered**:
  * *Generating raw markdown/prose directly from LLM without structured validation*: Rejected because LLMs hallucinate realistic-looking achievements, tools, and employment dates that fail cryptographic auditability.
  * *Coupling resume generation directly to a PDF engine (e.g. Puppeteer/PDFKit)*: Rejected because the platform must expose structured resume models via MCP tools and web APIs independently of visual styling.
  * *Premature persistence tables (`adapted_resumes`, `adapted_cover_letters`)*: Rejected because artifact adaptation is derived on-demand from existing domain state with sub-second latency; persistence belongs to Phase 12 (Application Tracking).
* **Reasons**: Guarantees verifiable career document integrity, eliminates AI hallucinations, complies with strict multi-tenant security invariants, and enables seamless provider-neutral AI consumption via MCP.
* **Consequences**:
  * Phase 6 Tasks (P6-001 through P6-005) will implement domain schemas and services in `src/domain/career/` and `src/services/`.
* **Revisit Conditions**: When user-saved application history or custom recruiter styling templates are introduced in Phase 12.

---

### ADR-038: Cover Letter Drafting Engine Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 6 (Task P6-002A), the platform requires a provider-neutral Cover Letter Drafting Engine (`CoverLetterDraftingService`) that synthesizes targeted, persuasive cover letters (`TailoredCoverLetter`) grounded in authentic repository evidence, verified work history, and target job match analysis. The engine must adhere to strict zero-hallucination truth boundaries, prevent fabrication of company facts, candidate accomplishments, or quantitative metrics, enforce multi-tenant default-deny isolation, support bounded narrative length (3-6 paragraphs), and execute in-memory on demand without premature database migrations.
* **Decision**: Adopt the **Cover Letter Drafting Engine Architecture** defined in `docs/cover-letter-drafting-architecture.md` (`ARCH-018`) governed by the following core architectural decisions:
  * **Absolute Truth Boundary**: Drafting pipelines consume strictly `IntegrityCheckedAssertion` objects, validated candidate profiles, parsed job descriptions, and pre-computed match/relevance analyses. Raw candidate prose, unparsed repository files, and arbitrary LLM hallucinations are strictly excluded.
  * **Structured Paragraph Schema**: Each cover letter paragraph is modeled as `CoverLetterParagraph` carrying explicit `paragraphType` (`OPENING`, `COMPANY_ALIGNMENT`, `RELEVANT_EXPERIENCE`, `PROJECT_EVIDENCE`, `MOTIVATION`, `CLOSING`), text, `assertionIds`, commit-pinned `evidenceRefs` (capped at 5), and status (`VERIFIED`, `INFERRED`, `CLAIMED`).
  * **Deterministic 6-Tier Content Prioritization**: Prioritizes 1. Verified Required Skills $\rightarrow$ 2. High-Relevance Projects $\rightarrow$ 3. Verified Preferred Skills $\rightarrow$ 4. Corporate Work History $\rightarrow$ 5. Inferred Skills $\rightarrow$ 6. Labeled User Claims.
  * **Corporate Work History Authority**: Employment dates, company names, and professional titles derive exclusively from explicit candidate work history records (`candidateProfile.experience`). Git commit timestamps and repository durations are never converted into corporate employment tenure.
  * **Company Alignment Grounding**: Company domain, mission, and tech stack statements must reference only explicit text from the trusted `JobDescription` input. Unstated company details are never fabricated.
  * **Quantitative Metric Safety Guard**: Quantitative claims (e.g. *"reduced latency by 45%"*, *"served 10M users"*) without backing evidence in candidate records trigger `ValidationError: Quantitative achievement claim rejected`.
  * **Status Immutability & Omission Policy**: Unverified manual claims retain `[Unverified User Claim]` or are safely omitted; inferred skills retain `INFERRED` status; missing skills are never claimed.
  * **Safe ATS Keyword Alignment**: Terminology alignment uses `SkillTaxonomyEngine` canonical mapping without injecting ungrounded technologies.
  * **Optional LLM Linguistic Sandbox**: External AI models operate inside passive XML input boundaries (`<job_input>`, `<candidate_facts>`, `<approved_assertions>`) to polish transitions and tone (`PROFESSIONAL`, `CONCISE`, `CONFIDENT`, `WARM`) but are strictly forbidden from adding facts, metrics, employers, or citations.
  * **Mandatory Post-Generation Integrity Gate**: All paragraphs are parsed and validated by `ZeroHallucinationIntegrityService` before release.
  * **Multi-Tenant Sovereign Default-Deny**: Enforces `tenant_id === context.tenantId` across all inputs with 404 default-deny.
  * **Ephemeral In-Memory Execution**: Operates in-memory with sub-second latency with zero database tables or migrations in Phase 6.
* **Alternatives Considered**:
  * *Unstructured LLM generation with raw prompt templates*: Rejected because LLMs hallucinate company relationships, ungrounded metrics, and non-existent technologies.
  * *Premature persistence tables (`adapted_cover_letters`)*: Rejected because cover letters are synthesized on-demand; persistence belongs to Phase 12 (Application Tracking).
* **Reasons**: Ensures complete factual authenticity, legal/regulatory compliance, mathematical explainability, and multi-tenant security while delivering compelling job-specific narratives.
* **Consequences**:
  * Phase 6 Task P6-002 will implement `CoverLetterDraftingService` and domain schemas in `src/domain/career/` and `src/services/`.
* **Revisit Conditions**: When custom user cover-letter styling templates or persistent application tracking are introduced in Phase 12.

---

### ADR-039: Portfolio Recommendation & Hiring-Signal Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 6 (Task P6-003A), the platform requires an evidence-first, deterministic Portfolio Recommendation Engine (`PortfolioRecommendationService`) that selects and strategies a candidate's featured projects (`PortfolioRecommendation`) for a target job. The engine must transcend simple keyword matching to optimize for job relevance, evidence depth, engineering maturity, signal complementarity, and marginal project value, while guarding against tutorial clones, superficial apps, and unbacked metrics without introducing premature database tables.
* **Decision**: Adopt the **Portfolio Recommendation & Hiring-Signal Architecture** defined in `docs/portfolio-recommendation-architecture.md` (`ARCH-019`) governed by the following core architectural decisions:
  * **Bounded Curated Sizing (1 to 5 Featured Projects)**: Deterministically recommends 1 to 5 featured projects based on evidence quality. Portfolios default to 2–3 projects and reject padding with weak repositories.
  * **Quality Over Quantity Deterministic Floor**: Superficial projects with low architectural density ($< 30.0$) and zero tests/CI are strictly disqualified from `featuredProjects`.
  * **Marginal Value Optimization**: Employs greedy marginal optimization selecting projects that maximize new required skill coverage and diverse architectural signals ($\mathcal{O}(k \cdot N)$).
  * **Signal Complementarity Across 7 Architectural Dimensions**: Evaluates projects across 7 orthogonal signal domains (`BACKEND_DISTRIBUTED`, `DATABASE_DATA_MODELING`, `FRONTEND_UI_UX`, `DEVOPS_INFRASTRUCTURE`, `SECURITY_AUTH`, `TESTING_QUALITY`, `API_INTEGRATIONS`) to prevent duplicate coverage inflation.
  * **Anti-Inflation Coverage Accounting**: Attributes shared skills (e.g. PostgreSQL across multiple repos) strictly to the highest-verification project and flags subsequent mentions as redundant.
  * **Ownership and Contribution Confidence**: Classifies repositories (`DIRECT_OWNER`, `ORGANIZATION_MEMBER`, `COLLABORATOR`, `FORK_UPSTREAM`) and author share (`PRIMARY_AUTHOR`, `MAJOR_CONTRIBUTOR`, `MINOR_CONTRIBUTOR`, `UNVERIFIED`) without fabricating solo claims for team projects.
  * **Tutorial & Clone Detection Guard**: Flags fork metadata, conventional tutorial names, and boilerplate READMEs as `LIKELY_TUTORIAL` to deprioritize generic clones with explicit user warnings.
  * **Story Completeness vs Technical Depth Decoupling**: Maintains separate scores for code quality vs. documentation clarity; generates actionable case study prompts for undocumented code rather than silently discarding it.
  * **Metric Integrity Guard**: Quantitative metrics must be backed by authentic evidence or benchmarks; unbacked numbers trigger `ValidationError` and are replaced with interview preparation prompts.
  * **Technical Interview Discussion Value**: Computes an interview value score ($0-100$) reflecting architectural complexity, custom middleware, and trade-off depth.
  * **Extensible Job-Family Personalization**: Dynamically adjusts signal weights across 7 job families (`BACKEND`, `FRONTEND`, `FULLSTACK`, `DEVOPS_CLOUD`, `DATA_ML`, `AI_ENGINEERING`, `GENERAL_SOFTWARE`).
  * **User Control & Override Support**: Supports user `PIN_FEATURED`, `EXCLUDE_PROJECT`, and `REORDER_OVERRIDE` actions with automated requirement gap recalculation.
  * **Decoupled Architecture**: Separates Recommendation Strategy (*WHAT to show*) from Content Synthesis (*HOW to describe it*) and Visual Rendering (*HOW to present it*).
  * **Multi-Tenant Sovereign Default-Deny**: Enforces `tenant_id === context.tenantId` across all inputs with 404 default-deny.
  * **Ephemeral In-Memory Execution**: Operates in-memory with sub-50ms latency with zero database tables or migrations in Phase 6.
* **Alternatives Considered**:
  * *Sorting projects solely by individual ProjectRelevanceScore*: Rejected because it selects redundant projects (e.g. 3 identical CRUD apps) and fails to maximize hiring signal breadth.
  * *LLM-driven project selection*: Rejected because LLMs hallucinate project capabilities, vary non-deterministically across runs, and cannot be mathematically audited.
  * *Premature persistence tables (`portfolio_recommendations`)*: Rejected because portfolio recommendations are synthesized on-demand; persistence belongs to Phase 12.
* **Reasons**: Synthesizes empirical recruiting science into a deterministic, evidence-first recommendation engine that maximizes candidate hiring impact while maintaining uncompromising zero-hallucination integrity.
* **Consequences**:
  * Phase 6 Task P6-003 will implement `PortfolioRecommendationService` and domain schemas in `src/domain/career/` and `src/services/`.
* **Revisit Conditions**: When persistent portfolio web deployment adapters or public portfolio hosting endpoints are introduced.

---

### ADR-040: Career Artifact Export & Canonical Interchange Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-22
* **Context**: In Phase 6 (Task P6-004A), the platform requires a standards-compliant, canonical interchange export layer (`CareerArtifactExportService`) that transforms tailored career artifacts (`TailoredResume`, `TailoredCoverLetter`, `PortfolioRecommendation`) into industry-standard formats (`JSON_RESUME`, `MARKDOWN`, `PLAIN_TEXT`, `CANONICAL_JSON`). The export layer must ensure full JSON Resume v1.0.0 validator compatibility without breaking schema checkers, deliver clean single-column ATS-safe plain text without Unicode ligature corruption or broken delimiters, generate semantic GFM Markdown with configurable citation formats, maintain cryptographic verification provenance inside compliant metadata extensions, support privacy/anonymization controls, and execute statelessly in-memory without premature database tables.
* **Decision**: Adopt the **Career Artifact Export & Canonical Interchange Architecture** defined in `docs/career-artifact-export-architecture.md` (`ARCH-020`) governed by the following core architectural decisions:
  * **Canonical Interchange Contract**: Encapsulates all export operations in a structured `ExportedArtifact` envelope containing `artifactId`, `tenantId`, `artifactType`, `format`, `mimeType`, `fileName`, `content`, and `metadata` (with SHA-256 checksum and line/byte counts).
  * **Strict JSON Resume v1.0.0 Compliance**: Maps `TailoredResume` strictly to JSON Resume standard root fields (`basics`, `work`, `education`, `skills`, `projects`, `certificates`, `meta`). All verification provenance, evidence hashes, and candidate assertion badges are namespaced inside `meta.antigravity` to preserve 100% validator compatibility with third-party tools (`resumed`, `resume-cli`).
  * **ATS-Optimized Plain Text Sanitization**: Formats plain text resumes into clean single-column linear text with ASCII section dividers, 2-space indents (zero tabs), and sanitized typography (converting curly quotes, em-dashes, and unicode bullets to standard ASCII).
  * **CommonMark & GFM Typography**: Formats resumes, cover letters, and portfolios into semantic GitHub Flavored Markdown with clean heading hierarchies, bullet styling, and safe HTML escaping.
  * **Configurable Evidence Citation Styles**: Supports `NONE` (clean application-ready copy), `INLINE` (compact inline citations), `FOOTNOTES` (numbered superscripts linking to an end-of-document evidence ledger), and `METADATA_ONLY` (retained strictly in JSON/frontmatter).
  * **Privacy & Anonymization Controls**: Supports `anonymize: true` for blind hiring screening (redacting full name, email, phone, and street address) and `includeUnverifiedClaims: false` for omitting unbacked manual assertions.
  * **Multi-Tenant Sovereign Default-Deny**: Enforces `tenant_id === context.tenantId` across all inputs with 404 default-deny.
  * **Ephemeral In-Memory Execution**: Operates in-memory with sub-5ms latency and zero database mutations.
* **Alternatives Considered**:
  * *Ad-hoc JSON dumping of internal domain models*: Rejected because internal service structures are proprietary and cannot be rendered by external resume builders or CLI tools.
  * *Directly embedding verification badges in JSON Resume root fields*: Rejected because invalid top-level fields break official JSON Resume schema validators.
  * *Coupling export directly to binary PDF generation (Puppeteer/PDFKit)*: Rejected because the core platform focuses on structured semantic interchange; visual PDF/DOCX rendering is decoupled downstream.
* **Reasons**: Establishes an open, verifiable interchange standard for candidate career assets that guarantees broad third-party tool interoperability, ATS parsing reliability, and tamper-evident provenance preservation.
* **Consequences**:
  * Phase 6 Task P6-004 will implement `CareerArtifactExportService` and domain schemas in `src/domain/career/` and `src/services/`.
* **Revisit Conditions**: When additional external interchange standards (e.g. HR-XML / HR Open JSON) or direct binary export formats are introduced.

---

### ADR-041: Resume Integrity Audit Tool Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-23
* **Context**: In Phase 6 (Task P6-005A), the platform requires an independent, provider-neutral Resume Integrity Audit Tool (`ResumeIntegrityAuditService`) that inspects final rendered or exported career documents (`TailoredResume`, `JSON_RESUME`, `MARKDOWN`, `PLAIN_TEXT`) to verify that every factual statement, skill claim, metric, employer, tenure, and education credential is grounded in approved career intelligence. The audit tool must operate as an independent verification firewall downstream from generators and exporters, never trusting internal generator status or LLM outputs, enforcing strict three-tier statuses (`PASS`, `WARN`, `BLOCK`), validating cryptographic evidence provenance, detecting status inflation and contradictions, and executing statelessly in-memory without premature database tables.
* **Decision**: Adopt the **Resume Integrity Audit Tool Architecture** defined in `docs/resume-integrity-audit-architecture.md` (`ARCH-021`) governed by the following core architectural decisions:
  * **Independent Zero-Trust Verification**: Operates decoupled from generators/exporters. Re-audits claims against ground-truth `IntegrityCheckedAssertions`, `EvidenceItems`, `CandidateProfile`, and `SkillTaxonomyEngine`.
  * **Multi-Format Ingestion**: Supports `STRUCTURED_RESUME`, `JSON_RESUME`, `MARKDOWN`, and `PLAIN_TEXT`. `PDF` and `DOCX` are explicitly declared unsupported at this phase to avoid OCR/layout text-flow parsing hallucinations.
  * **Three-Tier Status Gate (`PASS`, `WARN`, `BLOCK`)**: Emits `PASS` on 100% grounded facts; `WARN` on labeled user claims, valid inferences, and ambiguous terms; `BLOCK` on unsupported skills, ungrounded quantitative metrics, tenure/employer inflation, fabricated citations, cross-tenant leaks, or profile contradictions.
  * **Deterministic Typed Claim Extraction**: Extracts `SKILL`, `METRIC`, `EXPERIENCE`, `TENURE`, `EMPLOYER`, `EDUCATION`, and `ACHIEVEMENT` claims via conservative regex and structural parsing without LLM dependencies.
  * **Quantitative Metric Safety**: Concrete numerical figures (percentages, scales, latencies, revenues) without supporting evidence in candidate records trigger `UNSUPPORTED_METRIC` $\rightarrow$ `BLOCK`.
  * **Corporate Work History Authority**: Employment dates, titles, and company names derive exclusively from explicit candidate work records. Repository commit duration is never conflated with corporate tenure (`UNSUPPORTED_TENURE` $\rightarrow$ `BLOCK`).
  * **Cryptographic Evidence Reference Verification**: Every cited `EvidenceId` must resolve to an active, tenant-matched evidence item with identical `commitSha`, `filePath`, and `lineRange`.
  * **Status Inflation & Contradiction Detection**: Unlabeled claims or inferred skills promoted to verified code trigger `STATUS_INFLATION` (`BLOCK`). Direct discrepancies with candidate facts trigger `CONTRADICTORY_FACT` (`BLOCK`).
  * **Omission Invariant**: Omitting candidate skills or history is recognized as valid tailoring and is never penalized.
  * **Dual-Layer Defense in Depth**: P5-006 validates structured assertions before generation; P6-005 audits rendered documents post-generation/export.
  * **Multi-Tenant Sovereign Default-Deny**: Enforces `tenant_id === context.tenantId` across all inputs with 404 default-deny.
  * **Ephemeral In-Memory Execution**: Operates in-memory with sub-15ms latency and zero database mutations.
* **Alternatives Considered**:
  * *Trusting generator `status: 'VERIFIED'` metadata*: Rejected because generator bugs or LLM phrasing drift can introduce ungrounded claims.
  * *LLM-driven audit verdict decision*: Rejected because LLMs hallucinate realistic-looking justifications and vary non-deterministically.
  * *Premature persistence tables (`resume_audits`, `audit_findings`)*: Rejected because auditing is an on-demand verification service in Phase 6; persistence belongs to Phase 12.
* **Reasons**: Guarantees verifiable document integrity, eliminates hallucination risks, prevents ATS qualification misrepresentation, complies with EU AI Act auditability requirements, and maintains multi-tenant security.
* **Consequences**:
  * Phase 6 Task P6-005 will implement `ResumeIntegrityAuditService` and domain schemas in `src/domain/career/` and `src/services/`.
* **Revisit Conditions**: When persistent audit history or automated remediation workflows are introduced in Phase 12.

---

### ADR-042: MCP Server Foundation & Career Tool Exposure Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-23
* **Context**: In Phase 7 (Task P7-001A), the platform requires a standards-compliant Model Context Protocol (MCP) server layer to expose verified career intelligence, portfolio recommendations, artifact adaptation, and integrity auditing to external AI clients (Gemini, Claude, ChatGPT, Cursor). The MCP layer must operate strictly as an interface/adapter layer without duplicating domain business logic, maintain absolute multi-tenant default-deny isolation, enforce existing RBAC permissions, authenticate clients via Bearer API tokens mapped to trusted context, protect against prompt injection and oversized payloads, prevent credential and secret exfiltration, and operate statelessly with zero premature database migrations.
* **Decision**: Adopt the **MCP Server Foundation & Career Tool Exposure Architecture** defined in `docs/mcp-server-architecture.md` (`ARCH-022`) governed by the following core architectural decisions:
  * **Interface Adapter Pattern**: The MCP server is strictly a transport and schema adapter over existing domain services (`CandidateProfileService`, `AtsFitScoreService`, `ProjectRelevanceService`, `ResumeTailoringService`, `CoverLetterDraftingService`, `PortfolioRecommendationService`, `CareerArtifactExportService`, `ResumeIntegrityAuditService`). It never directly implements matching or scoring algorithms.
  * **Streamable HTTP as Primary Transport**: Adopts official MCP specification (2026-07-28 standard) utilizing Streamable HTTP over a unified `POST /mcp` endpoint with standard header protocol routing (`MCP-Protocol-Version`, `Mcp-Method`), supporting optional SSE response streaming for long-running operations and stateless load balancing.
  * **Bearer Token Authentication & Trusted Context Minting**: Authenticates clients via SHA-256 hashed Bearer API tokens (`mcp_api_tokens`) resolving to authenticated `User` and `Tenant` principals. Mints an immutable `McpRequestContext` (`userId`, `tenantId`, `role`, `tokenScopes`, `requestId`). Clients are strictly forbidden from providing security context in tool arguments.
  * **Multi-Tenant Sovereign Default-Deny**: Enforces strict tenant scoping across all tool queries. Any foreign tenant resource ID immediately returns `NotFoundError` (HTTP 404 / MCP error `-32004`) to prevent foreign resource enumeration.
  * **RBAC Alignment**: Maps existing workspace roles (`OWNER`, `MEMBER`, `READONLY`) directly to tool capabilities. `READONLY` users are permitted read and analysis tools (`get_candidate_profile`, `analyze_job_fit`, `recommend_portfolio`, `audit_resume`, `export_career_artifact`) but denied write tools (`tailor_resume`, `draft_cover_letter`).
  * **Narrow, Bounded Tool Catalog**: Exposes seven explicit, typed tools (`get_candidate_profile`, `analyze_job_fit`, `recommend_portfolio`, `tailor_resume`, `draft_cover_letter`, `audit_resume`, `export_career_artifact`) with strict Zod input/output validation, rejecting monolithic "god tools".
  * **Strict Internal Boundary Protection**: Prohibits exposing raw GitHub tokens, encryption keys (`AES-256-GCM`), repository mutations, raw database queries, webhook internals, or session caches over MCP.
  * **Prompt Injection & Untrusted Content Sandboxing**: Treats all external textual inputs (job descriptions, resume text, repository Readmes) as passive untrusted data, sandboxed with explicit delimiter tags and executed without shell/eval channels.
  * **Safe Error & Audit Model**: Maps domain errors to standard JSON-RPC 2.0 error codes without leaking SQL errors or stack traces. Emits sanitized audit events (`mcp.tool.invoked`, `mcp.tool.completed`, `mcp.tool.denied`, `mcp.tool.failed`) correlated via `requestId`.
  * **Ephemeral In-Memory Execution**: Read and analysis tools execute on-demand in-memory with zero database mutations.
* **Alternatives Considered**:
  * *Monolithic "God Tool" (`career_intelligence(action, payload)`)*: Rejected because dynamic untyped actions break client-side Zod validation, prevent granular RBAC scoping, and complicate auditability.
  * *Exposing raw database repositories over MCP*: Rejected because it bypasses tenant isolation, skips integrity gates, and leaks database implementation details.
  * *Stateful HTTP+SSE dual-endpoint transport*: Rejected in favor of modern single-endpoint Streamable HTTP, which is fully compatible with standard reverse proxies and cloud load balancers.
* **Reasons**: Establishes a secure, scalable, provider-neutral interface standard that enables seamless interoperability with major AI clients while strictly enforcing Antigravity's zero-hallucination integrity, multi-tenant isolation, and least-privilege security guarantees.
* **Consequences**:
  * Phase 7 Tasks P7-001 through P7-006 will implement the MCP server foundation, Streamable HTTP transport, Bearer authentication, and tool adapters.
* **Revisit Conditions**: When bidirectional agentic tool execution (Phase 9: PR/Commit modification workflows) or new MCP transport standards are introduced.

---

### ADR-043: MCP Authentication Hybrid Model (Dedicated Personal API Tokens in P7-003, OAuth 2.1 in P10/P11)
* **Status**: ACCEPTED
* **Date**: 2026-08-23
* **Context**: In Phase 7 (Task P7-003), following an independent architecture and security audit, the platform evaluated whether to implement full OAuth 2.1 authorization servers immediately or adopt dedicated personal MCP API tokens. Reusing browser session cookies as MCP Bearer tokens creates shared lifecycle vulnerabilities (revoking MCP access logs users out of web sessions), lacks independent scoping, and provides no user token management. However, implementing a full OAuth 2.1 authorization server (consent screens, client registration, PKCE authorization code grants) in Phase 7 is premature engineering, as Google Gemini and personal IDE agents (Cursor, Claude Desktop) connect via personal API keys, while hosted connector OAuth 2.1 is strictly required only for Phase 10 (Claude Web) and Phase 11 (ChatGPT Actions).
* **Decision**: Adopt the **Hybrid Authentication Model**:
  * **Dedicated Personal API Token Infrastructure (`P7-003`)**:
    * Dedicated `mcp_api_tokens` PostgreSQL table with UUID primary keys, foreign keys to `tenants` and `users` (`ON DELETE CASCADE`), token hash (`SHA-256`), dynamic per-token scopes (`jsonb`), and token lifecycle states (`ACTIVE`, `REVOKED`, `EXPIRED`).
    * Cryptographic token format: `mcp_<environment>_<32-byte-random-hex>` (e.g. `mcp_live_4a8b...`, `mcp_test_...`, `mcp_dev_...`). Raw token returned once at creation; never stored or logged in plaintext.
    * Strict environment binding: Rejects cross-environment token replay at extraction time.
    * Strict RBAC Scope Ceiling: Token requested scopes must be a subset of the user's role ceiling (`READONLY` $\rightarrow$ `['career:read']`; `MEMBER` $\rightarrow$ `['career:read', 'career:write', 'career:export']`; `OWNER` $\rightarrow$ `+['career:admin']`).
    * Full token lifecycle: Creation, listing (safe summaries without hashes/secrets), revocation (without affecting web sessions), rotation (atomic revoke + issue), and expiration (default 30 days; supports 30, 60, 90, or no expiry).
    * Quota enforcement: Maximum 10 active tokens per user.
    * Throttled `last_used_at` tracking (once every 60 seconds) to avoid database write amplification.
    * Transitional Session Fallback: Clearly documented fallback (`authMethod: 'SESSION_FALLBACK'`) for local testing compatibility, scheduled for full deprecation and removal in Phase 13 (Dashboard User Onboarding & Token UI).
  * **Deferred OAuth 2.1 Authorization Server (`P10 / P11`)**: Full third-party OAuth 2.1 (client registration, PKCE authorization code grant, consent screens, refresh tokens) will be implemented as an additive authentication provider during Phase 10 (Claude) and Phase 11 (ChatGPT).
* **Alternatives Considered**:
  * *Immediate OAuth 2.1 in Phase 7*: Rejected as premature engineering that introduces unneeded complexity before third-party connector phases.
  * *Permanent Browser Session Token Reuse*: Rejected due to lack of per-token scopes, lifecycle coupling, and inability for users to manage multiple independent AI client connections.
* **Reasons**: Delivers complete token isolation, least-privilege scoping, and secure token lifecycle for personal MCP use cases while ensuring an orderly, modular roadmap for third-party OAuth integration.
* **Consequences**:
  * Task P7-003 implements `McpApiTokenService`, `mcp_api_tokens` schema migration, and updated `authenticateMcpRequest`.
* **Revisit Conditions**: When Phase 10 (Claude connector) and Phase 11 (ChatGPT connector) introduce third-party OAuth 2.1 authorization servers.

---

### ADR-044: Career Read Tools over MCP Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-23
* **Context**: In Phase 7 (Task P7-004A), the platform requires exposing candidate career profile data, verified technical skills, project evidence, and ATS job fit analysis to external AI clients (Gemini, Claude, ChatGPT, Cursor) over the Model Context Protocol (MCP 2026-07-28 standard). We must design an optimal tool suite that maximizes model tool-selection accuracy, avoids context-window exhaustion, prevents secret/credential leakage, enforces multi-tenant sovereign default-deny isolation, aligns with existing RBAC and token scopes, prevents prompt injection, preserves single-source-of-truth domain logic, and ensures strict read-only execution with zero database mutations.
* **Decision**: Adopt the **Career Read Tools over MCP Architecture** defined in `docs/mcp-career-read-tools-architecture.md` (`ARCH-023`) governed by the following core architectural decisions:
  * **Narrow 4-Tool Catalog**: Exposes four dedicated, single-purpose tools with explicit, non-overlapping semantic boundaries:
    1. `get_candidate_profile`: High-level summary of identity, top skills (max 15), highlighted projects (max 5), experience (max 5), and completeness score.
    2. `list_verified_skills`: Paginated, filtered list of code-verified skills (`VERIFIED` status only) with confidence scores and evidence counts.
    3. `inspect_project_evidence`: Detailed inspection of a specific project, linked repositories, and commit-pinned, sanitized code excerpts ($\le 500$ chars).
    4. `analyze_job_fit`: Deterministic ATS fit score (0–100), requirement matches, top relevant projects, and prioritized skill gaps against untrusted job descriptions ($\le 20\text{ KB}$).
  * **Pure In-Memory Service Delegation**: MCP tools act strictly as transport and schema adapters, delegating execution directly to existing authoritative domain services (`CandidateProfileService`, `SkillTaxonomyEngine`, `EvidenceMatchingService`, `ProjectRelevanceService`, `AtsFitScoreService`). Zero duplicate business logic.
  * **Progressive Disclosure Pattern**: Enables AI agents to query high-level profiles first, then drill down into projects and specific commit evidence as needed, preventing context-window bloat.
  * **Advisory Tool Annotations**: All four tools declare `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: false` in MCP tool definitions. Annotations are advisory hints for model planners and client UIs; backend RBAC and tenant authorization remain mandatory.
  * **Strict Scope & RBAC Alignment**: All four read tools require scope `career:read` and are permitted for `OWNER`, `MEMBER`, and `READONLY` workspace roles. Mutating tools are strictly decoupled into later phases.
  * **Sovereign Multi-Tenant Isolation**: Extracts `tenantId` strictly from authenticated `McpRequestContext`. Cross-tenant lookups immediately return 404 `NotFoundError` / `-32004 (NOT_FOUND)` to prevent foreign entity enumeration.
  * **Hard Output Budgets & Sanitization**: Bounded array lengths, clamped pagination ($\le 50$ for skills, $\le 20$ for evidence), and secret scrubbing via `SecretScrubber` before emission.
  * **Prompt Injection Defense**: Treats external job descriptions and project texts as passive data; applies character length limits and structured Zod validation without shell/eval channels.
  * **Zero Database Mutations**: Guarantees zero database insertions, updates, or deletions during read tool execution.
* **Alternatives Considered**:
  * *Polymorphic "God Tool" (`career_intelligence(action, payload)`)*: Rejected because polymorphic schemas degrade LLM tool-calling accuracy ($<72\%$) and prevent granular Zod schema validation.
  * *Dumping All Repository Code & Evidence in Profile*: Rejected because it exhausts LLM context windows and increases latency and cost.
  * *Implementing Scoring Inside MCP Handlers*: Rejected because it duplicates domain business logic and breaches the single-source-of-truth invariant.
* **Reasons**: Establishes a secure, high-precision, token-efficient MCP read interface that enables seamless interoperability with major AI assistants while preserving Antigravity's core zero-hallucination, least-privilege, and multi-tenant security guarantees.
* **Consequences**:
  * Phase 7 Task P7-004 will implement the four tool adapters in `src/mcp/tools/` (or `src/mcp/`) and register them with `McpServerWrapper`.
* **Revisit Conditions**: When write/mutation tools (`generate_tailored_resume`, `draft_cover_letter`) are introduced in Task P7-005.

---

### ADR-045: MCP Application Artifact Tools Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-23
* **Context**: In Phase 7 (Task P7-005A), following the successful exposure of Career Read Tools (`P7-004`), the platform requires exposing artifact-producing career capabilities over the Model Context Protocol (MCP 2026-07-28 standard): `generate_tailored_resume`, `draft_cover_letter`, and `recommend_portfolio_projects`. We must design a secure, least-privilege tool suite that clearly classifies tools by side-effect profile, prevents unauthorized generation by read-only users, enforces dual-layer truth integrity gating, decouples structured generation from format exporting, enforces tenant-private caching and hard output budgets, sandboxes untrusted job description inputs, and executes statelessly in-memory without premature database persistence tables.
* **Decision**: Adopt the **MCP Application Artifact Tools Architecture** defined in `docs/mcp-application-artifact-tools-architecture.md` (`ARCH-024`) governed by the following core architectural decisions:
  * **Tool Classification & Scoping**:
    * `recommend_portfolio_projects`: Classified as Read / Analysis tool (`career:read`). Permitted for `OWNER`, `MEMBER`, and `READONLY`. Declares advisory annotations: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.
    * `generate_tailored_resume`: Classified as Artifact Synthesis tool (`career:write`). Permitted for `OWNER` and `MEMBER`; denied for `READONLY` (403 / `-32003 FORBIDDEN`). Declares advisory annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.
    * `draft_cover_letter`: Classified as Artifact Synthesis tool (`career:write`). Permitted for `OWNER` and `MEMBER`; denied for `READONLY` (403 / `-32003 FORBIDDEN`). Declares advisory annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.
  * **Pure In-Memory Interface Delegation**: MCP tool handlers act strictly as transport and validation gateways, delegating execution directly to authoritative domain services (`ResumeTailoringService`, `CoverLetterDraftingService`, `PortfolioRecommendationService`, `ResumePresentationService`, `ResumeIntegrityAuditService`, `ZeroHallucinationIntegrityService`). Zero duplicated ATS formulas, match rules, or scoring weights.
  * **Dual-Layer Integrity Verification**:
    * Pre-generation verification via `ZeroHallucinationIntegrityService` (P5-006) checks evidence grounding and classifies facts vs. claims.
    * Post-generation verification via `ResumeIntegrityAuditService` (P6-005) scans synthesized text for unbacked numbers (`QUANTITATIVE_METRIC_REGEX`), corporate tenure inflation, and status promotion (`STATUS_INFLATION`).
    * Verdict `BLOCK` fails synthesis with `-32602 (INVALID_PARAMS)`; verdict `WARN` / `PARTIAL` returns artifact with explicit warning metadata. No promotion of `CLAIMED` or `INFERRED` to `VERIFIED`.
  * **Decoupled Export Boundary**: `generate_tailored_resume` produces the canonical *structured* domain model (`TailoredResume`). Converting to external downloadable interchange formats (`JSON_RESUME`, `MARKDOWN`, `PLAIN_TEXT`) remains exclusively decoupled in `export_career_artifact` (`CareerArtifactExportService`).
  * **Resume Presentation Modes**: Preserves `PRESERVE_EXISTING` (layout audit via `ResumePresentationService`) and `GENERATE_NEW` (clean ATS template). Rejects arbitrary binary uploads; explicitly warns for unsupported visual formats.
  * **Statelessness & Zero Premature Migrations**: In P7-005, all artifact generation is stateless in-memory with zero database insertions/updates/deletions. Database tables (`resume_artifacts`, `cover_letter_artifacts`, `portfolio_artifacts`) are strictly deferred to Phase 12.
  * **Hard Output Budgets & Rate Limiting**:
    * Hard response budgets: Resume $\le 25\text{ KB}$, Cover Letter $\le 15\text{ KB}$, Portfolio $\le 20\text{ KB}$.
    * Dedicated compute rate limit tier in `McpRateLimiter`: 20 calls/min per tool per tenant for artifact tools.
  * **Multi-Tenant Sovereign Default-Deny**: Strict `tenantId` extraction from `McpRequestContext`. Any foreign entity lookup returns 404 `NotFoundError` / `-32004 (NOT_FOUND)`.
  * **Untrusted Content Sandboxing & Secret Scrubbing**: Job descriptions ($\le 20\text{ KB}$) and project texts are treated as passive data. All cited code excerpts are sanitized via `SecretScrubber`.
* **Alternatives Considered**:
  * *Allowing `READONLY` users to call `generate_tailored_resume`*: Rejected because generating customized job application documents is an active career writing action reserved for workspace members.
  * *Persisting generated documents immediately into PostgreSQL*: Rejected because Phase 7 focuses on remote MCP client interaction; persistent tracking belongs to Phase 12.
  * *Returning raw JSON Resume strings directly from `generate_tailored_resume`*: Rejected to keep synthesis decoupled from export formatting and preserve structured domain composability.
* **Reasons**: Establishes a secure, least-privilege, verifiable MCP artifact layer that guarantees zero hallucination, strict multi-tenant isolation, and high-performance AI client interoperability.
* **Consequences**:
  * Phase 7 Task P7-005 will implement the 3 artifact tool adapters in `src/mcp/tools/` with strict Zod schemas and register them with `McpServerWrapper`.
* **Revisit Conditions**: When persistent document history and application tracking are implemented in Phase 12.

---

### ADR-046: Unified MCP Audit Logging Architecture & Schema Invariants
* **Status**: ACCEPTED
* **Date**: 2026-08-24
* **Context**: In Phase 7 (Task P7-006A), the platform requires capturing comprehensive, immutable audit logs for all Model Context Protocol (MCP 2026-07-28 standard) tool executions, discovery requests, authentication decisions, role-based denials, and rate-limit enforcements across connected AI clients (Gemini, Claude, ChatGPT, Cursor). We evaluated whether to introduce a separate `mcp_audit_logs` table, add new top-level columns to `audit_logs`, or leverage the existing unified `audit_logs` PostgreSQL table. We must prevent schema fragmentation, maintain strict multi-tenant sovereign isolation, ensure high-throughput execution without blocking client responses, enforce strict credential and PII redaction, and comply with SOC 2, ISO 27001, and EU AI Act traceability requirements.
* **Decision**: Adopt the **Unified MCP Audit Logging Architecture** defined in `docs/mcp-audit-logging-architecture.md` (`ARCH-025`) governed by the following core architectural invariants:
  * **Single Unified Audit Ledger**: Explicitly reject creating a second audit table (e.g. `mcp_audit_logs`). All platform compliance events (Web, OAuth, GitHub App, MCP, Tokens) reside in the single canonical `audit_logs` PostgreSQL table.
  * **Existing Schema Completeness**: The existing `audit_logs` table schema is 100% complete and sufficient. Relational query axes (`tenant_id`, `user_id`, `event_type`, `resource_type`, `resource_id`, `request_id`, `ip_address`, `user_agent`, `created_at`) use existing indexed columns; execution telemetry (`durationMs`, `statusCode`, `errorCode`, `role`, `authMethod`, `tokenPrefix`, `protocolVersion`, `isError`, `parameters`, `summary`) is encapsulated inside the existing `details` JSONB envelope. Zero database schema migrations are needed.
  * **Canonical Event Taxonomy**: Employs hierarchical dot-notation naming: `mcp.tool.invoked`, `mcp.tool.completed`, `mcp.tool.denied`, `mcp.tool.failed`, `mcp.resource.listed`, `mcp.resource.read`, `mcp.prompt.listed`, `mcp.prompt.rendered`, `mcp.handshake.completed`, `mcp.token.*`.
  * **Strict PII & Credential Sanitization**: All audit details pass through `sanitizeAuditDetails()`, strictly stripping prohibited keys (tokens, passwords, private keys, raw resumes, full source code, SSNs) and enforcing a hard ceiling of 16 KB (`MAX_AUDIT_PAYLOAD_BYTES`). Raw API tokens and full hashes are never logged; only safe 16-char token prefixes (`mcp_live_4a8b...`) are recorded.
  * **Non-Blocking Asynchronous Persistence**: Audit logging executes asynchronously in a failure-isolated `try/catch` block. Database write transient failures are logged to operational logs (Pino) but never crash or delay client tool responses.
  * **Separation of Operational Logs and Compliance Ledger**: Pino logs to stdout for short-term telemetry and APM; PostgreSQL `audit_logs` provides immutable, long-term, tenant-scoped compliance records.
  * **Sovereign Multi-Tenant Isolation**: Every audit entry strictly associates `tenant_id` from the verified `McpRequestContext`. All audit queries enforce `tenant_id` filtering with 404 default-deny semantics.
* **Alternatives Considered**:
  * *Creating a separate `mcp_audit_logs` table*: Rejected because it fragments the compliance audit trail, complicates SOC 2 / ISO 27001 unified reporting, duplicates retention and purging logic, and violates the single-source-of-truth domain model.
  * *Adding MCP-specific top-level columns (`tool_name`, `duration_ms`, `status_code`) to `audit_logs`*: Rejected because it introduces sparse `NULL` columns for non-MCP events, requires schema migrations, and adds no performance benefit over indexed relational columns + JSONB.
  * *Relying solely on stdout/Pino operational logs*: Rejected because operational logs are transient, not queryable by tenants, not auditable for SOC 2, and lack relational database integrity guarantees.
* **Reasons**: Delivers unified, tamper-resistant, high-performance audit logging that satisfies all regulatory compliance frameworks without schema churn or duplicate systems.
* **Consequences**:
  * Task P7-006 will implement the `McpAuditService` / route integration and associated unit/integration test suites verifying live PostgreSQL audit log insertion.
* **Revisit Conditions**: When database partitioning for high-volume enterprise tenants (>10M monthly audit events) or external SIEM streaming webhooks are introduced in Phase 14.

---

### ADR-047: Gemini AI Provider & Trust-Boundary Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-24
* **Context**: In Phase 8 (Task P8-001A), the platform requires establishing the first generative AI integration with **Google Gemini**. We must define where Gemini adds value, what Gemini is trusted to do, what Gemini is strictly forbidden from deciding, how prompt injection is defeated, how outputs are validated, how model lifecycle and deprecations are managed, and how the platform remains completely provider-neutral without making Gemini the source of truth for candidate qualifications, match scores, or tenant authorization.
* **Decision**: Adopt the **Gemini Integration Architecture & AI Trust-Boundary Model** defined in `docs/gemini-integration-architecture.md` (`ARCH-026`) governed by the following core architectural decisions:
  * **Provider-Neutral AI Adapter Layer (5-Tier Architecture)**: Tier 5 introduces a clean `AiProvider` interface (`generateText`, `generateStructured`, `executeToolLoop`, `validateHealth`). `GeminiProviderAdapter` implements this contract using the official `@google/genai` SDK / REST protocol without leaking Gemini-specific types, prompts, or configurations into the core Career Intelligence (Tier 2) or Remote MCP (Tier 4) layers.
  * **Dynamic Model Routing & Catalog Policy**:
    * **Flagship Workhorse**: `gemini-3.7-flash` for high-reasoning coding and resume wording tasks.
    * **Interactive Secondary**: `gemini-3.6-flash` for fast job summary explanations.
    * **Deep Reasoning**: `gemini-3.1-pro` for deep portfolio case study synthesis.
    * **Micro-Tasks**: `gemini-3.5-flash-lite` for title normalization ambiguity resolution.
    * **Stable Primary Fallback**: `gemini-2.5-flash` for automated failover on rate limits or service degradation.
    * Models are configured through a centralized `ModelRegistry`; hardcoding model ID strings in domain code is strictly prohibited.
  * **Inverse Authority & Zero-Hallucination Trust Boundary**:
    * **Zero AI Authority over Facts**: Gemini is strictly prohibited from inventing employers, titles, dates, metrics, skills, or `EvidenceIds`. The PostgreSQL database and deterministic domain services (`SkillTaxonomyEngine`, `EvidenceMatchingService`, `AtsFitScoreService`, `ProjectRelevanceService`) remain the sole authoritative source of truth.
    * Gemini operates *strictly over approved, schema-validated facts* provided in structured context envelopes.
  * **Prompt Injection Defense & Sandboxing**: Untrusted data (raw job descriptions, repository READMEs, code snippets) is encapsulated in explicit XML data blocks (`<untrusted_job_description>`, `<passive_code_data>`) and evaluated beneath `systemInstruction` directives. Deterministic post-generation integrity gates provide absolute defense against prompt-level deceit.
  * **Mandatory Structured Output Validation**: Structured responses enforce native JSON Schema generation via Zod $\rightarrow$ JSON Schema $\rightarrow$ Gemini `responseSchema`. Free-form text parsing for structured data is strictly prohibited. All AI outputs pass through a 5-stage verification gate (`Zod Schema` $\rightarrow$ `Domain Rules` $\rightarrow$ `Evidence Verification` $\rightarrow$ `Resume Integrity Audit Gate` $\rightarrow$ `Secret Scrubbing`).
  * **Bounded Tool Calling & Anti-Loop Limits**: Tool calling is restricted to approved read/analysis tools (`get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit`, `recommend_portfolio_projects`). Direct DB/connector access is prohibited. Tool loop iteration depth is hard-capped at **3 turns**.
  * **Sovereign Multi-Tenant Isolation & Privacy**: Context caching for user-specific candidate data is disabled to prevent cross-tenant data pooling. PII (email, phone, address) and credentials are scrubbed before payload dispatch. Paid Gemini API tier guarantees zero customer data usage for model training.
  * **Zero Premature Persistence**: Phase 8 introduces zero new database tables. All AI compliance telemetry maps cleanly into the existing PostgreSQL `audit_logs` table (ADR-046).
* **Alternatives Considered**:
  * *Making Gemini the primary job matching engine*: Rejected because deterministic algorithms provide 100% explainability, mathematical consistency, zero hallucination risk, and sub-50ms execution speed.
  * *Relying on Gemini conversation memory for career history*: Rejected because PostgreSQL is the sovereign, queryable source of truth.
  * *Hardcoding a single Gemini model ID*: Rejected because AI models evolve rapidly; dynamic routing ensures zero-code-change model upgrades.
* **Reasons**: Establishes an enterprise-grade, evidence-backed AI client architecture that delivers compelling generative synthesis while rigorously guaranteeing data sovereignty, mathematical integrity, and provider neutrality.
* **Consequences**:
  * Task P8-001 will implement the `GeminiClient` / `GeminiProviderAdapter` in `src/clients/gemini/` with comprehensive unit and integration test suites.
* **Revisit Conditions**: When multi-provider AI adapters (Anthropic Claude in Phase 10, OpenAI ChatGPT in Phase 11) or enterprise Vertex AI IAM integrations (Phase 14) are introduced.

---

### ADR-048: Gemini End-to-End Golden Path Architecture & Dual-Mode Verification Strategy
* **Status**: ACCEPTED
* **Date**: 2026-08-24
* **Context**: In Phase 8 (Task P8-003A), the platform requires establishing the complete End-to-End Golden Path verification connecting GitHub repository ingestion, cryptographic evidence extraction, candidate profile synchronization, job requirement parsing, deterministic ATS scoring, and remote MCP tool calling with Google Gemini fit explanations. We must define how this end-to-end flow is verified without introducing flaky CI failures from upstream AI rate limits, without degrading test performance, and without violating the Inverse Authority Principle.
* **Decision**: Adopt the **Gemini End-to-End Golden Path Architecture & Dual-Mode Verification Strategy** defined in `docs/gemini-golden-path-architecture.md` (`ARCH-027`) governed by the following core architectural decisions:
  * **End-to-End Topology & Layer Orchestration**: Golden Path seamlessly integrates Phase 3 (GitHub Ingestion), Phase 4 (Evidence Linking & Candidate Profile), Phase 5 (Career Intelligence & ATS Matching), Phase 7 (Remote MCP Server), and Phase 8 (Gemini Client & Prompt Policies).
  * **Dual-Mode Verification Strategy**:
    * **Deterministic Golden Path (Normal CI / `npm test`)**: `tests/integration/gemini-golden-path.test.js` tests the entire end-to-end workflow (PostgreSQL fixtures, Fastify server, MCP JSON-RPC routing, tool dispatch, and deterministic ATS evaluation) using a deterministic mock SDK response to deliver 100% stable, fast ($\le 10\text{ s}$) test passes with zero external network dependency.
    * **Live External Golden Path (`npm run test:live`)**: `tests/integration/live/gemini-golden-path.live.test.js` tests live authentication and model execution against `ai.google.dev` using synthetic candidate fixtures, isolated from normal test runs.
  * **Inverse Authority & Non-Negotiable Invariants**: Gemini operates strictly as a natural language synthesis and reasoning assistant. Gemini has zero authority to alter match scores, verify skills, or invent evidence.
  * **Database Lifecycle Compliance**: All integration suites must include compliant `after()` hooks invoking `closeDatabase()` to drain and close the PostgreSQL pool.
* **Alternatives Considered**:
  * *Relying only on live Gemini calls for normal CI*: Rejected because upstream HTTP 429 rate limits cause CI build flakiness and worker hangs.
  * *Skipping live Golden Path verification entirely*: Rejected because real-world API validation guarantees model adherence and schema compatibility.
* **Reasons**: Guarantees fast, deterministic CI testing while preserving high-confidence live external verification against production AI services.
* **Consequences**:
  * Task P8-003 will implement the deterministic and live Golden Path integration suites.
* **Revisit Conditions**: When multi-agent workflows or PR modification actions are introduced in Phase 9.

---

### ADR-049: Vertex AI Gemini Provider Architecture & Google Cloud Credit Integration
* **Status**: ACCEPTED
* **Date**: 2026-08-24
* **Context**: In Phase 8 (Task P8-004A), live external verification against the Gemini Developer API (`ai.google.dev`) repeatedly encountered HTTP 429 `RESOURCE_EXHAUSTED` errors due to Google AI Studio's strict free-tier rate limits (~15 RPM). We must determine whether introducing Google Cloud Vertex AI is the appropriate next architectural step to resolve rate limits, leverage available Google Cloud promotional credits (e.g. $300 Free Trial, Google for Startups, Innovators program), and establish enterprise data governance while preserving the provider-neutral `AiProvider` abstraction.
* **Decision**: Adopt the **Vertex AI Gemini Provider Architecture** defined in `docs/vertex-ai-gemini-architecture.md` (`ARCH-028`) governed by the following core architectural decisions:
  * **Provider-Neutral Dual Adapter Abstraction**: The core `AiProvider` contract remains unchanged. We retain `GeminiDeveloperAdapter` (`src/clients/gemini/`) for lightweight API key access and introduce `GeminiVertexAdapter` (`src/clients/vertex/`) for Google Cloud Vertex AI execution via the unified `@google/genai` SDK (`vertexai: true`, `project`, `location`).
  * **Zero Logic Duplication**: 100% of prompt policies (`PromptPolicyRegistry`), XML prompt sandboxing, Zod schema conversion, and error normalization are shared across both adapters without code duplication.
  * **Promotional Credit Compatibility**: Vertex AI Foundation Model inference (`aiplatform.googleapis.com`) is confirmed fully `ELIGIBLE` for standard Google Cloud promotional credits, trial balances, and startup grants.
  * **Credential Security & ADC**: Local development authenticates via Google Cloud Application Default Credentials (ADC) without checking in service account keys. Production/CI uses least-privilege IAM service accounts (`roles/aiplatform.user`).
  * **Deterministic Test Integrity**: Normal CI (`npm test`, `npm run test:unit`, `npm run test:integration`) remains 100% deterministic and mock-based. Live verification is partitioned into optional suites (`npm run test:live:gemini`, `npm run test:live:vertex`).
* **Alternatives Considered**:
  * *Paying for higher AI Studio tiers with personal credit card*: Rejected because Google Cloud promotional credits cannot be used directly for AI Studio standalone billing, whereas Vertex AI consumes standard GCP project credits.
  * *Creating an entirely separate AI orchestrator for Vertex*: Rejected because it violates provider neutrality and duplicates prompt sandboxing and schema conversion logic.
* **Reasons**: Eliminates rate limit bottlenecks in live external testing, unlocks Google Cloud credit balances, enhances data governance, and prepares the platform for enterprise multi-cloud deployment.
* **Consequences**:
  * Task P8-004 will implement the `GeminiVertexAdapter` and dedicated live test suite with ADC support.
* **Revisit Conditions**: When multi-provider AI adapters (Anthropic Claude in Phase 10, OpenAI ChatGPT in Phase 11) or enterprise IAM features in Phase 14 are introduced.

---

### ADR-050: Gemini Enterprise & Google AI Studio Remote MCP Integration Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-24
* **Context**: In Phase 8 (Task P8-005A), we investigated connecting Google Gemini enterprise interfaces (Gemini Enterprise in Google Workspace, Vertex AI Agent Builder, Google AI Studio, and Gemini CLI) to the Antigravity Career Hub Remote MCP Server built in Phase 7. We must define the architectural relationship between Google Discovery Engine custom connectors (batch data ingestion) and Model Context Protocol servers (real-time tool execution), and establish multi-channel integration standards with strict security, token scoping, and sovereign tenant isolation.
* **Decision**: Adopt the **Gemini Enterprise & Google AI Studio Remote MCP Integration Architecture** defined in `docs/gemini-enterprise-mcp-integration-architecture.md` (`ARCH-029`) governed by the following core architectural decisions:
  * **Standardization on Streamable HTTP MCP**: The primary integration contract for all Gemini enterprise and developer tools is the native Model Context Protocol over Streamable HTTP (`POST /mcp`) using scoped Bearer API tokens (`mcp_token_*`).
  * **Disambiguation of Custom Connectors vs. MCP**: Clarifies that Discovery Engine custom connectors are for batch document ingestion/crawling, whereas the Antigravity Remote MCP Server provides real-time, zero-hallucination tool execution and deterministic candidate intelligence during agent reasoning turns.
  * **Multi-Channel Compatibility**: Supports 3 integration channels:
    1. *Native Streamable HTTP MCP*: Direct connection for Vertex AI Agent Builder, Agent Development Kit (ADK), Gemini CLI, Antigravity IDE, Claude, and ChatGPT.
    2. *OpenAPI 3.0 / Function Declaration Schema Gateway*: JSON schema export for Google AI Studio prompts and Vertex AI Extensions.
    3. *Gemini Enterprise Connected App Data Store*: Google Cloud Console integration for Google Workspace side panels.
  * **Inverse Authority & Multi-Tenant Sovereign Isolation**: Read tools (`get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit`) cause zero database mutations; cross-tenant accesses return default-deny `404 NOT_FOUND`; all requests record failure-isolated audit events in `audit_logs`.
* **Alternatives Considered**:
  * *Building a custom Discovery Engine data connector instead of MCP*: Rejected because batch document crawling cannot provide real-time ATS scoring, live GitHub commit verification, or interactive resume/cover-letter artifact generation.
  * *Exposing unauthenticated MCP endpoints*: Rejected because multi-tenant career intelligence requires strict API token authentication (`mcp_token_*`) and immutable tenant context derivation.
* **Reasons**: Establishes standard, secure, and future-proof tool connectivity between Google's AI agent ecosystem and the Antigravity Career Hub without code duplication or vendor lock-in.
* **Consequences**:
  * Task P8-005 will author comprehensive administrator and developer integration documentation (`docs/gemini-enterprise-mcp-integration.md`) with verified curl commands and step-by-step connection walkthroughs.
* **Revisit Conditions**: When Google Workspace add-on packaging or OAuth 2.1 authorization server upgrades occur in Phase 14.

---

### ADR-051: MCP Performance Benchmarking & Latency Target Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-24
* **Context**: In Phase 8 (Task P8-006A), we evaluated the performance benchmarking requirements for the Remote MCP server and the target of `<1.5s for cached queries`. We must establish an unambiguous, multi-layer benchmark decomposition, classify the 7 MCP tools by compute profile, evaluate current domain caching infrastructure, and establish realistic regression boundaries without exposing credentials or wasting cloud AI promotional credits.
* **Decision**: Adopt the **MCP Tool Latency Benchmark Architecture** defined in `docs/mcp-performance-architecture.md` (`ARCH-030`) governed by the following core architectural decisions:
  * **Four-Layer Latency Boundary Decomposition**: Formally separate latency measurements into:
    1. `TOOL_ONLY`: In-memory service handler execution excluding HTTP framing.
    2. `MCP_HTTP`: Full `POST /mcp` round-trip (transport, rate limiting, auth, execution, serialization, async audit dispatch).
    3. `GEMINI_TOOL`: Time from Gemini SDK tool invocation decision to tool response ingestion.
    4. `END_TO_END`: Full multi-turn agent interaction loop including user prompt, tool call, and final synthesis.
  * **Target Applicability Scope**: The `<1.5s` target applies strictly to the `MCP_HTTP` (p95) boundary under `DB_WARM` / `MCP_WARM` conditions. End-to-end multi-turn Gemini interactions (`END_TO_END`) are budgeted separately at `<4.0s` (p95).
  * **Three-Tier Tool Classification**: Classifies tools into `READ_FAST` (`get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`), `ANALYTICAL` (`analyze_job_fit`, `recommend_portfolio_projects`), and `AI_GENERATION` (`generate_tailored_resume`, `draft_cover_letter`).
  * **Cache State Definition & Realistic Baseline**: Acknowledges that domain career services currently operate on live PostgreSQL queries (`CACHE_NOT_IMPLEMENTED`), evaluating baseline performance against warm database connection pool states.
  * **Zero-Waste Deterministic Benchmarking**: Uses mock AI providers and direct HTTP loops for high-volume benchmark runs ($N=100$ requests per tool, $C=1, 5, 10$) to protect Google Cloud credits and avoid AI Studio HTTP 429 rate limits, reserving live Gemini runs for a small representative sample ($N \le 10$).
  * **Performance Regression Thresholds**: Enforces a strict regression failure if any tool's $p95_{\text{MCP\_HTTP}} > 1500\text{ms}$, if $p95$ degrades by $>25\%$, or if error rate $>0\%$.
* **Alternatives Considered**:
  * *Measuring only end-to-end user latency*: Rejected because cloud LLM token generation latency (1.8s – 4.0s) would mask underlying MCP and database performance characteristics.
  * *Fabricating synthetic in-memory cache hits*: Rejected because reporting artificial cache hits without implementing true caching violates execution integrity.
* **Reasons**: Provides rigorous, reproducible, and cost-effective performance telemetry while preserving tenant isolation, evidence grounding, and security invariants.
* **Consequences**:
  * Task P8-006 will implement `scripts/benchmark-mcp.js`, execute deterministic benchmark suites, generate `docs/mcp-performance-baseline.md`, and verify live Golden Path latency.
* **Revisit Conditions**: When distributed caching (e.g. Redis) or streaming MCP transports are introduced in later phases.

---

### ADR-052: Approved GitHub / Project Modification Workflows & Human-in-the-Loop Safety Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-25
* **Context**: In Phase 9 (Task P9-001A), we investigated enabling the AI career copilot to propose and execute legitimate code/project additions to bridge missing skill gaps identified from target job descriptions without fabricating claims. We must establish an airtight security model, threat mitigations, authority boundaries, human approval protocols, least-privilege GitHub App permissions, patch safety rules, and tenant isolation invariants before implementing write operations or MCP write tools.
* **Decision**: Adopt the **GitHub Project Modification Architecture** defined in `docs/github-project-modification-architecture.md` (`ARCH-031`) governed by the following core architectural decisions:
  * **Inverse Authority Principle for Repository Writes**: The AI (Gemini/Claude/ChatGPT) acts strictly as a proposer of improvement plans and code diffs; it has ZERO execution authority. All modifications require deterministic pre-validation and interactive human approval.
  * **Two-Phase Human-in-the-Loop Approval State Machine**: Implements an explicit two-phase protocol (`propose_project_improvement` $\rightarrow$ `ApprovalTicket` $\rightarrow$ `confirm_and_create_pr`). The `ApprovalTicket` is stored in PostgreSQL with a 15-minute TTL, SHA-256 HMAC patch fingerprint, and optimistic concurrency lock (`expectedHeadSha`). Re-use attempts or unapproved executions fail closed.
  * **Isolated Feature Branch Invariant & Default Branch Protection**: All automated writes are restricted to dedicated feature branches matching `^feat/career-hub-[a-z0-9-]+$`. Direct commits to default/protected branches (`main`, `master`), force pushing, branch deletions, and PR auto-merging are physically prohibited in code.
  * **Least-Privilege GitHub App Token Sourcing**: Scopes write installation access tokens down to the single target repository (`repositories: [targetRepo]`) and minimal permissions (`contents: write`, `pull_requests: write`), completely excluding workflow and administration permissions.
  * **Comprehensive Patch Safety & Workflow Blocklist**: Rejects path traversal (`..`), absolute paths, binary files, high-entropy secrets, diffs exceeding 10 files or 500 lines, and strictly prohibits modifications to `.github/workflows/*` or CI configurations.
  * **Immutable Audit Trail & Non-Destructive Rollback**: Records full provenance in PostgreSQL (`audit_logs`) including base commit, created commit, PR URL, and patch hash. Rollback is performed non-destructively by closing the draft PR and deleting the feature branch without rewriting Git history.
  * **Constrained MCP Interface**: Exposes exactly two domain-specific tools (`propose_project_improvement` for proposal/preview and `confirm_and_create_pr` for confirmed execution); never exposes generic shell or repository modification tools.
* **Alternatives Considered**:
  * *Granting the AI autonomous commit authority*: Rejected because autonomous code modification on external user repositories creates severe security, prompt injection, and hallucination risks.
  * *Exposing generic write_file() or execute_command() MCP tools*: Rejected because excessive agency turns the platform into an unconstrained coding agent violating OWASP LLM08.
  * *Committing directly to default branches without PRs*: Rejected because it bypasses repository branch protection and eliminates human oversight.
* **Reasons**: Enables candidates to legitimately acquire and prove missing job skills through safe, auditable, and human-verified repository enhancements while upholding uncompromising multi-tenant security and repository integrity.
* **Consequences**:
  * Phase 9 tasks (`P9-001` through `P9-006`) will implement the `ProjectImprovementRecommender`, `ApprovalTicket` state machine, scoped `GitHubAppConnector` write operations, safety constraints, MCP write tools, and diff preview test suites.
* **Revisit Conditions**: When multi-repository cross-linking or automated CI test runner execution inside isolated sandboxes are introduced in Phase 15.

---

### ADR-053: Two-Phase Action Approval State Machine & Cryptographic Binding Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-25
* **Context**: In Phase 9 (Task P9-002A), we designed the authorization gate for repository modification. We must establish a formal state machine, cryptographic tamper resistance, single-use consumption semantics, optimistic concurrency controls, expiration policies, and multi-tenant isolation guarantees before implementing the `ActionApprovalTicketService` in Task P9-002.
* **Decision**: Adopt the **Two-Phase Action Approval State Machine Architecture** defined in `docs/approval-state-machine-architecture.md` (`ARCH-032`) governed by the following core architectural decisions:
  * **Eight-State Lifecycle Model**: Enforces strict transitions across `PENDING`, `APPROVED`, `EXECUTING`, `EXECUTED`, `REJECTED`, `CANCELLED`, `EXPIRED`, and `FAILED`. Terminal states are permanent and immutable.
  * **Cryptographic HMAC-SHA256 Binding with HKDF Tenant Isolation**: Every ticket payload is signed with an HMAC-SHA256 signature calculated over a canonical pipe-delimited string of all mutable parameters (`tenantId`, `userId`, `candidateId`, `resourceId`, `proposalId`, `repositoryName`, `baseBranch`, `targetBranch`, `expectedHeadSha`, `patchFingerprint`, `expiresAt`). Signing keys are derived per tenant using HKDF-SHA256.
  * **Deterministic Single-Use Atomic CAS**: Execution pickup transitions `APPROVED` $\rightarrow$ `EXECUTING` via PostgreSQL row-level locks (`SELECT FOR UPDATE`) and atomic CAS (`consumed_at IS NULL`). Concurrent execution attempts or replays fail closed with `409 Conflict`.
  * **Optimistic Concurrency on Base HEAD SHA (`expectedHeadSha`)**: Ticket creation records the base branch's HEAD commit SHA. If the target repository has advanced before execution, execution fails closed with `StaleHeadShaError` (`409 Conflict`) rather than silently rebasing.
  * **Dual Expiration Ceilings (15m Creation TTL / 5m Execution Window)**: Tickets expire automatically after 15 minutes if unapproved, and within 5 minutes after approval if execution is not picked up, governed strictly by authoritative PostgreSQL server time (`NOW()`).
  * **Strict Role-Based Authorization**: Requires authenticated `MEMBER` or `OWNER` session context to approve or reject tickets. `READONLY` accounts and unauthenticated callers are rejected with `403 Forbidden`.
  * **Comprehensive Audit Trail**: Every lifecycle transition emits an asynchronous, redacted audit event to `audit_logs` (`approval.ticket_created`, `approval.ticket_approved`, `approval.ticket_rejected`, `approval.ticket_cancelled`, `approval.ticket_expired`, `approval.execution_started`, `approval.execution_completed`, `approval.execution_failed`).
* **Alternatives Considered**:
  * *Stateless Signed JWT Approval Tokens*: Rejected because revocations, concurrent race prevention, and terminal execution records require durable server-side state in PostgreSQL.
  * *Optimistic Execution without expectedHeadSha Checking*: Rejected because rebasing onto a moved `main` branch can silently invalidate code diff assumptions and break builds.
  * *Self-Approval by AI Copilot*: Rejected because it violates the Inverse Authority Principle and OWASP LLM08.
* **Reasons**: Guarantees that no external repository writes can occur without verified human oversight, cryptographic integrity, and race-free single-use execution semantics.
* **Consequences**:
  * Task P9-002 will implement `action_approval_tickets` table migration, `ActionApprovalTicketService`, repository layer, and comprehensive unit/integration test suites.
  * Task P9-003 will consume the approved ticket as its mandatory authorization token for GitHub branch and PR creation.
* **Revisit Conditions**: When multi-party approval policies (e.g. enterprise recruiter + candidate dual-signature) are introduced in Phase 13.

---

### ADR-054: GitHub Write Operations & Low-Level Git Data API Integration Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-25
* **Context**: In Phase 9 (Task P9-003A), we reviewed the architecture and security for performing approved GitHub repository mutations. We must establish a safe mechanism to apply multi-file patches, verify optimistic concurrency against live repository state, enforce least-privilege token scoping, open draft pull requests, and guarantee non-destructive rollback.
* **Decision**: Adopt the **GitHub Write Operations Architecture** defined in `docs/github-write-operations-architecture.md` (`ARCH-033`) governed by the following core architectural decisions:
  * **Low-Level Git Data API for Atomic Multi-File Commits**: Multi-file patches are applied via GitHub's Git Data API (`POST /git/trees` $\rightarrow$ `POST /git/commits` $\rightarrow$ `POST /git/refs`) creating exactly ONE atomic commit linking all patch files. The high-level Contents API (`PUT /contents/{path}`) is rejected because it generates $N$ non-atomic commits for $N$ files.
  * **Mandatory Action Approval Ticket Authorization Gate**: `GitHubWriteService` cannot be invoked directly by AI agents or external clients. It strictly requires consuming an `APPROVED` `ActionApprovalTicket` via `ActionApprovalTicketService.consumeTicketForExecution()`.
  * **Repository-Scoped Least-Privilege Installation Tokens**: Installation access tokens (`ghs_*`) are minted on-demand scoped strictly to the single target repository (`repositories: [targetRepo]`) and minimal permissions (`contents: write`, `pull_requests: write`). Administration, workflows, actions, and secrets permissions are strictly prohibited.
  * **Live Base Branch HEAD SHA Verification**: Verifies `latestHeadSha === ticket.expectedHeadSha` before creating trees/commits. Mismatches immediately fail closed with `StaleHeadShaError` (`409 Conflict`) to prevent applying diffs onto diverged base commits.
  * **Draft Pull Request Default**: All PRs are opened with `draft: true` against the repository's base branch with sanitized markdown templates containing full skill gap provenance, confidence scores, and testing instructions.
  * **Non-Destructive Rollback**: If PR creation fails after a branch is created, the system deletes the isolated `feat/career-hub-*` branch ref. Rollback never touches default branches (`main`, `master`) and never rewrites Git history.
* **Alternatives Considered**:
  * *Using GitHub Contents API per-file*: Rejected because it creates broken intermediate build states and consumes excessive API rate limits.
  * *Directly committing to protected main/master branches*: Rejected because it bypasses repository review policies and violates candidate safety.
  * *Autonomous merging of Pull Requests*: Rejected because PR merge authority must remain exclusively with repository owners.
* **Reasons**: Guarantees atomic, verifiable, and safe repository enhancements while maintaining complete candidate control and least-privilege security boundaries.
* **Consequences**:
  * Task P9-003 implemented `GitHubAppAuthManager` dynamic token scoping, Git Data API write methods in `GitHubAppConnector`, and `GitHubWriteService`.
  * Task P9-004 will consolidate execution safety invariants into a centralized safety kernel.
* **Revisit Conditions**: When automated branch rebasing or sandbox CI test execution workflows are introduced in Phase 15.

---

### ADR-055: GitHub Write Safety Constraints & Centralized Execution Kernel Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-25
* **Context**: In Phase 9 (Task P9-004A), we reviewed the security and architectural invariants required to guarantee that AI-driven repository write actions NEVER mutate default or protected branches, never alter CI/CD pipelines, never inject secrets, and never bypass human approval state machine boundaries.
* **Decision**: Adopt the **Centralized Write Safety Architecture** defined in `docs/github-write-safety-architecture.md` (`ARCH-034`) governed by the following core architectural decisions:
  * **Centralized Safety Kernel (`GitHubWriteSafetyService`)**: Introduce a dedicated, authoritative domain service owning all pre-execution validation gates (`validateBranchPolicy`, `validateGitRef`, `validatePatchPolicy`, `scanForSecrets`, `validateApprovalBinding`, `validateExpectedHeadSha`, `validateTokenPermissions`). `GitHubWriteService` and all future MCP write tools must route strictly through this kernel.
  * **Static & Authoritative Dynamic Default Branch Protection**: Enforces a strict static blocklist (`main`, `master`, `develop`, `release/*`, `prod*`, `v*`) and queries GitHub repository metadata (`default_branch`) on every execution. Direct modification of the repository default branch is physically prohibited with `ForbiddenOperationError(PROTECTED_DEFAULT_BRANCH)`.
  * **Target vs. Base Branch Separation**: Enforces `targetBranch !== baseBranch` on all write operations. All writes must target an isolated feature branch matching `^feat/career-hub-[a-z0-9-]+$`.
  * **Strict Git Ref Whitelist**: Only refs matching `refs/heads/feat/career-hub-[a-z0-9-]+` are allowed for creation. Tag injection (`refs/tags/*`), remote ref tampering (`refs/remotes/*`), and ref injection are strictly blocked.
  * **Physical Force-Push Elimination**: `createGitRef` omits force flags; `updateGitRef` is completely unexposed in `GitHubAppConnector`.
  * **Defense-in-Depth Patch Policy**: Re-validates POSIX path normalization, blocks directory traversal (`..`), hidden control directories (`.git/`, `.husky/`), CI/CD workflow files (`.github/workflows/*`, `.gitlab-ci*`, `Jenkinsfile`), environment/credential files (`.env*`, `*.pem`, `*.key`), and 38 binary file extensions.
  * **Pre-Execution High-Entropy Secret Scanning**: Scans all patch contents, file paths, commit messages, PR titles, and PR bodies for secrets via `SecretScrubber` before any Git Data API call.
  * **Optimistic Concurrency & Live Base HEAD SHA Enforcement**: Live base branch HEAD commit SHA must match `ticket.expectedHeadSha` prior to tree creation. Divergence fails closed with `StaleHeadShaError` (`409 Conflict`).
  * **Structured Audit Logging**: Every safety rejection emits an asynchronous, redacted audit record to `audit_logs` (`github.write.blocked.*`).
* **Alternatives Considered**:
  * *Relying solely on GitHub branch protection rules*: Rejected because GitHub branch protection rules may not be configured on personal/free repositories and do not prevent AI-generated workflow poisoning.
  * *Decentralizing validation inside individual route/MCP handlers*: Rejected because it permits bypass by alternate callers or future tool additions.
* **Reasons**: Guarantees non-bypassable, deterministic defense-in-depth across all repository write operations while preserving least-privilege security boundaries.
* **Consequences**:
  * Task P9-004 will implement `GitHubWriteSafetyService`, integrate it into `GitHubWriteService`, and author comprehensive unit, fuzz/property-based, and integration test suites.
* **Revisit Conditions**: When user-configurable branch policies or multi-branch enhancement workflows are introduced in Phase 15.

---

### ADR-056: Model Context Protocol (MCP) GitHub Write Tools Architecture & Human Approval Boundary
* **Status**: ACCEPTED
* **Date**: 2026-08-25
* **Context**: In Phase 9 (Task P9-005A), we designed the Model Context Protocol (MCP) interface to expose safe, approved GitHub write capabilities to AI clients (Gemini, Claude, ChatGPT). We must establish strict tool boundaries, prevent the introduction of generic write primitives, eliminate AI self-approval loops, enforce sovereign multi-tenant isolation, and ensure that MCP functions strictly as a transport/interface layer over our existing domain services, approval state machine, and write safety kernel.
* **Decision**: Adopt the **MCP GitHub Write Tools Architecture** defined in `docs/mcp-write-tools-architecture.md` (`ARCH-035`) governed by the following core architectural decisions:
  * **Exactly Two Domain-Specific Tools**: Expose only `propose_project_improvement` and `confirm_and_create_pr`. Generic write primitives (`modify_repository`, `write_file`, `create_commit`, `create_branch`, `execute_command`) are strictly prohibited to prevent unconstrained AI code execution and comply with the Inverse Authority Principle and OWASP LLM08.
  * **MCP as Pure Interface Layer**: The MCP handlers contain zero duplicated scoring, diff generation, or GitHub API execution logic. Handlers act as pure routing conduits: `propose` delegates to `ProjectImprovementRecommenderService` and `ActionApprovalTicketService.createTicket()`; `confirm` delegates to `ActionApprovalTicketService.approveTicket()` and `GitHubWriteService.executeApprovedTicket()`.
  * **Zero Client-Supplied Identity Trust**: Handlers derive `tenantId`, `userId`, and `role` exclusively from the immutable `McpRequestContext` minted by `authenticateMcpRequest()`. Client payloads cannot supply or override tenant or user bindings.
  * **Role-Based Access Control & Scope Ceilings**: Both write tools enforce `requiredRole: 'MEMBER'` and `requiredScopes: ['career:write']`. Callers with `READONLY` role or `career:read` tokens are rejected with `403 Forbidden`.
  * **Strict Minimal Confirm Input Schema**: `confirm_and_create_pr` accepts only `{ ticketId, confirmed: true, idempotencyKey, userNotes }`. It strictly rejects arbitrary `repository`, `branch`, `patch`, `commitMessage`, or `files`. All execution parameters are sourced exclusively from the approved database ticket record.
  * **Anti-AI Self-Approval Stopping Protocol**: Proposal tool output includes explicit machine-readable stopping instructions and requires a physical human review boundary before issuing confirmation. The approving user ID is permanently recorded in the database record and audit logs.
  * **Sovereign Multi-Tenant Isolation (404 Default-Deny)**: Cross-tenant ticket, candidate, job, or repository access fails closed with `404 Not Found` to prevent entity enumeration.
  * **Accurate MCP Tool Annotations (2026-07-28 Spec)**: Tools declare explicit hints (`readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true` for confirm).
  * **Comprehensive Error Model & Data Minimization**: Internal errors map cleanly to JSON-RPC 2.0 codes (`-32001`, `-32003`, `-32004`, `-32009`, `-32029`, `-32602`) with zero credential leaks or stack traces. Outbound responses omit HMAC secrets and installation tokens.
* **Alternatives Considered**:
  * *Exposing a generic `write_file` or `apply_patch` MCP tool*: Rejected because raw mutation tools bypass human approval boundaries, break optimistic concurrency locks, and create severe security risks.
  * *Allowing autonomous AI tool loops to approve tickets in the same turn*: Rejected because it destroys human-in-the-loop oversight and violates OWASP LLM08.
  * *Passing patch diffs directly in the confirm tool payload*: Rejected because it allows clients to tamper with approved code diffs prior to execution.
* **Reasons**: Guarantees airtight security, provider independence, strict multi-tenant isolation, and complete traceability while delivering an intuitive, powerful MCP interface for AI-assisted career enhancement.
* **Consequences**:
  * Task P9-005 will implement the MCP tool schemas in `src/domain/mcp/career-write-tools.schemas.js`, handlers in `src/mcp/tools/career-write-tools.js`, server registration in `src/mcp/server.js`, and comprehensive unit/integration/live test suites.
* **Revisit Conditions**: When multi-party approval policies (e.g. recruiter + candidate dual-signature) are integrated in Phase 13.

---

### ADR-057: PR Diff Preview, Test Execution Reporting, and Pre-Confirmation Safety Architecture
* **Status**: ACCEPTED
* **Date**: 2026-08-25
* **Context**: In Phase 9 (Task P9-006A), we designed the Pre-Confirmation Safety & Verification Layer operating between `propose_project_improvement` and `confirm_and_create_pr`. We must guarantee that human users and AI clients can thoroughly review exact diffs, test execution evidence, cryptographic patch fingerprints, and security warnings before authorizing remote repository modifications, and prevent blind approvals or execution of unreviewed mutations.
* **Decision**: Adopt the **PR Diff Preview, Test Execution Reporting, and Pre-Confirmation Safety Architecture** defined in `docs/pr-diff-preview-test-reporting-architecture.md` (`ARCH-036`) governed by the following core architectural decisions:
  * **Canonical Review Object**: Before confirmation, the system constructs a structured review object answering 9 fundamental questions (WHAT WILL CHANGE, WHY, WHERE, HOW MUCH, WHAT EVIDENCE SUPPORTS IT, WHAT TESTS WILL RUN, WHAT HAS BEEN VERIFIED, WHAT HAS NOT BEEN VERIFIED, WHAT EXACTLY WILL USER AUTHORIZE).
  * **Structured Diff Preview & Size Clamping**: Per-file diffs format unified diff snippets (`diffPreview`) bounded at 4,000 characters per file, 500 total lines, and a 25 KB global proposal JSON ceiling over MCP to prevent AI context window exhaustion.
  * **Cryptographic Patch Fingerprint Immutability**: A deterministic SHA-256 fingerprint (`patchFingerprint`) is computed across canonically sorted file operations (`operation:path:fileSha`), embedded in `ActionApprovalTicket.patchSummary`, and verified in the HMAC ticket signature and execution safety kernel. Zero post-approval patch regeneration is permitted.
  * **Truthful Test Execution Reporting**: Categorical lifecycle reporting (`NOT_RUN`, `PLANNED`, `RUNNING`, `PASSED`, `FAILED`, `SKIPPED`, `BLOCKED`). The system strictly forbids reporting `status: "PASSED"` for unexecuted tests and clearly separates static safety gates, ephemeral sandbox runs, and remote GitHub CI.
  * **Ephemeral Sandbox Security Boundary**: AI-generated code execution must never execute on the host machine or ingest production credentials (all GitHub keys, database credentials, ADC tokens, and session secrets are stripped with `env -i`, network disabled with `--net=none`, and hard resource/timeout quotas enforced).
  * **Base Branch Staleness Invalidation (Stale HEAD)**: If live repository base branch HEAD commit SHA diverges from `expectedHeadSha` before confirmation, execution fails closed with `StaleHeadShaError` (`409 Conflict`), requiring a fresh proposal rebased on current HEAD.
  * **Patch & Diff Invalidation**: Any mutation to patch files, target branches, or proposal parameters invalidates existing test results and approval tickets.
  * **Explicit Security Warnings Matrix**: Unsuppressed warnings for unexecuted tests (`WARN_TESTS_NOT_RUN`), dependency manifest additions (`WARN_DEPENDENCY_ADDED`), configuration changes (`WARN_CONFIG_MODIFIED`), and large diffs (`WARN_LARGE_DIFF`).
  * **Confirm Tool Execution-Only Boundary**: `confirm_and_create_pr` executes exclusively the exact reviewed ticket without AI re-prompting or patch re-synthesis.
  * **Structured Audit Telemetry**: Emits distinct audit events (`mcp.write.preview_generated`, `mcp.write.test_executed`, `mcp.write.warning_emitted`, `mcp.write.approval_requested`, `mcp.write.approval_confirmed`, `mcp.write.stale_head_blocked`) with zero secret retention.
* **Alternatives Considered**:
  * *Relying only on GitHub's native Draft PR diff view*: Rejected because it requires mutating remote Git branches before the user can inspect the diff, violating the principle that remote writes occur only after approval.
  * *Executing pre-confirmation tests directly on the host machine*: Rejected due to severe RCE and credential theft vulnerabilities from untrusted AI-generated code.
  * *Allowing implicit approval through chat conversational context ("yes", "looks good")*: Rejected because conversational affirmations lack cryptographic non-repudiation and enable accidental blind approvals.
* **Reasons**: Enforces complete transparency, cognitive review friction, cryptographic tamper-resistance, and airtight sandbox security before any remote Git Data API call is issued.
* **Consequences**:
  * Task P9-006 will implement domain schema enhancements in `src/domain/mcp/career-write-tools.schemas.js`, diff formatting and warning generation in `src/mcp/tools/career-write-tools.js` / `src/services/project-improvement-recommender.service.js`, and comprehensive unit/integration test suites.
* **Revisit Conditions**: When isolated WebAssembly or Firecracker microVM test runners are deployed for on-demand cloud sandboxing in Phase 14.


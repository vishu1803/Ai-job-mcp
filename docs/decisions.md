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

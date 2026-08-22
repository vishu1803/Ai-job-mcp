# Project Execution Tracker: Universal AI Career MCP Platform

**Source of Truth & Living Progress Tracker**  
*Last Updated: 2026-08-20*

---

## 1. Project Status Summary

| Metric | Current Value | Note |
| :--- | :--- | :--- |
| **Current Phase** | **PHASE 5 — Career Intelligence Engine** | Phase 0 (100%), Phase 1 (100%), Phase 2 (100%), Phase 3 (100%), Phase 4 (100%), Phase 5 (16.67% - P5-001 complete) |
| **Project State** | **ACTIVE / IN PROGRESS** | Phase 0 to Phase 4 complete; Phase 5 in progress |
| **Total Tasks** | **80 Tasks** | Across Phases 0 to 15 |
| **Completed Tasks** | **29 Tasks** | Phase 0 (4) + Phase 1 (6) + Phase 2 (6) + Phase 3 (6) + Phase 4 (6) + Phase 5 (1: P5-001) verified |
| **In Progress Tasks** | **0 Tasks** | P5-001 complete; ready for P5-002 |
| **Blocked Tasks** | **0 Tasks** | No active blockers |
| **Overall Task Completion** | **36.25% (29 / 80 Tasks)** | Strict calculation, zero inflation |
| **Weighted Phase Completion** | **32.29% (5.17 / 16 Phases)** | Strictly based on verified deliverables |

---

## 2. Phase-by-Phase Progress Summary

| Phase | Phase Name | Total Tasks | Completed | In Progress | Status | Completion % |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PHASE 0** | Research and Architecture | 4 | 4 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 1** | Multi-User Platform Foundation | 6 | 6 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 2** | Authentication & User Resource Connections | 6 | 6 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 3** | GitHub App Integration | 6 | 6 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 4** | Unified Candidate / Resource Model | 6 | 6 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 5** | Career Intelligence Engine | 6 | 1 | 0 | **IN_PROGRESS** | **16.67%** |
| **PHASE 6** | Resume / Cover-Letter / Portfolio Adaptation | 5 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 7** | Remote MCP Server | 6 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 8** | Gemini Integration | 5 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 9** | Approved GitHub / Project Modification Workflows | 6 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 10** | Claude Integration | 4 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 11** | ChatGPT Integration | 4 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 12** | Job / Application Tracking | 5 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 13** | Public Multi-User Beta | 5 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 14** | Security Hardening & Production Readiness | 6 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 15** | Advanced Automation | 4 | 0 | 0 | NOT_STARTED | **0.0%** |
| **TOTAL** | **All Phases Combined** | **80** | **29** | **0** | **IN_PROGRESS** | **36.25%** |

---

## 3. High-Level Milestone Roadmap

| Milestone ID | Target Phase | Milestone Description | MVP Critical? | Status | Target Date |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **M0** | Phase 0 | Ecosystem research, architecture signoff, project constitution (`goal.md`), execution tracker (`project.md`). | YES | **COMPLETE** | 2026-08-18 |
| **M1** | Phase 1-2 | Multi-tenant backend initialized, database schemas migrated, user auth & session isolation operational. | YES | **IN_PROGRESS** | TBD |
| **M2** | Phase 3-4 | GitHub App OAuth & webhook ingestion running; candidate profile & skill evidence graph extracted. | YES | NOT_STARTED | TBD |
| **M3** | Phase 5 | Job description parsing, skill normalization, and evidence-to-requirement matching engine validated. | YES | NOT_STARTED | TBD |
| **M4** | Phase 7-8 | Remote MCP server running over Streamable HTTP; Gemini client successfully calls tools and generates verified analysis. | YES | NOT_STARTED | TBD |
| **M5 (MVP)** | Phase 8 | **End-to-End MVP Golden Path Verified** (User -> GitHub -> Evidence Profile -> Job Match -> Gemini MCP -> Verifiable Output). | **YES (MVP GATE)** | NOT_STARTED | TBD |
| **M6** | Phase 9 | Safe, human-approved branch/PR project enhancement workflows operational. | NO | NOT_STARTED | TBD |
| **M7** | Phase 10-11 | Claude and ChatGPT connectors validated with zero core backend changes. | NO | NOT_STARTED | TBD |
| **M8** | Phase 12-14 | Multi-user beta launch, application tracking, end-to-end security hardening, and production audit. | NO | NOT_STARTED | TBD |

---

## 4. Master Task Table (Phases 0 - 15)

### Status Glossary:
* `COMPLETE`: Implemented, tested, and verified with evidence.
* `IN_PROGRESS`: Actively being worked on.
* `NOT_STARTED`: Planned, dependencies mapped, awaiting execution.
* `BLOCKED`: Awaiting external dependency, decision, or fix.
* `DEFERRED`: Postponed to a later phase.

---

### PHASE 0: Research and Architecture
*Objective: Thoroughly investigate the official 2026 ecosystem, verify official documentation, establish architectural contracts, and author project control files.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P0-001** | Research MCP 2026 spec, Gemini API, Claude remote MCP, ChatGPT connectors, GitHub Apps, and cloud quotas | None | **COMPLETE** | Official documentation search and fact extraction in `goal.md` and `project.md` |
| **P0-002** | Formulate Architecture Decision Records (ADRs) for runtime, framework, database, encryption, and transport | P0-001 | **COMPLETE** | ADR section documented in `project.md` |
| **P0-003** | Author Project Constitution (`goal.md`) | P0-001, P0-002 | **COMPLETE** | File created and validated against prompt requirements |
| **P0-004** | Author Living Execution Tracker (`project.md`) | P0-001, P0-002, P0-003 | **COMPLETE** | File created with all required matrices, task IDs, and checklists |

---

### PHASE 1: Multi-User Platform Foundation
*Objective: Build the core Node.js backend infrastructure, environment configuration, database ORM, and error handling framework.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P1-001** | Initialize Node.js ESM project with `package.json`, ESLint, Prettier, and core dependencies (Fastify, Zod, dotenv, Pino) | P0-004 | **COMPLETE** | `npm run lint`, `npm run format:check`, `npm test`, lifecycle test PASS |
| **P1-002** | Configure structured logging (Pino) with automatic secret masking / PII scrubbing | P1-001 | **COMPLETE** | `npm run lint`, `npm run format:check`, `npm test` (13/13 PASS), 10 focused security/redaction unit tests, lifecycle test PASS |
| **P1-003** | Setup PostgreSQL database connection pool and migration tool (Drizzle ORM) | P1-001 | **COMPLETE** | Live Supabase PostgreSQL 17.6 + Drizzle verified, `npm test` (29/29 PASS across 4 suites), `npm run db:migrate` PASS, `npm run db:check` PASS |
| **P1-004** | Create core database schema: `users`, `tenants`, `audit_logs`, `sessions` | P1-003 | **COMPLETE** | Live Supabase migration (`0000_familiar_wrecker.sql`), `npm test` (43/43 PASS across 6 suites), CRUD, multi-tenant isolation, cascade delete, and audit sanitization verified |
| **P1-005** | Implement standard API error handling, Zod request/response validation middleware, and health check endpoints (`/healthz`, `/livez`) | P1-001 | **COMPLETE** | HTTP integration tests returning 200 OK for `/livez` & `/healthz` (Supabase verified), 400 for Zod validation errors, 404 for not found, 409 for conflict, 500 for unhandled exceptions, zero secrets exposed |
| **P1-006** | Setup automated test runner (Vitest or Node Test Runner) and CI test workflow | P1-001 | **COMPLETE** | GitHub Actions CI workflow (`.github/workflows/ci.yml`), ADR-015, hermetic PostgreSQL 17 service container, `npm test` (64/64 PASS across 9 suites), `npm run lint` PASS, `npm run format:check` PASS, `npm run db:check` PASS |

---

### PHASE 2: Authentication and User Resource Connections
*Objective: Implement secure multi-tenant user authentication and encrypted credential storage for third-party connectors.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P2-001** | Implement AES-256-GCM symmetric encryption/decryption module for secrets at rest with per-record IV | P1-001 | **COMPLETE** | Unit tests in `tests/unit/encryption.test.js` & `tests/unit/errors.test.js` (26 tests): roundtrip encryption/decryption, random IV uniqueness, wrong key rejection, tampering detection, 64 KB limit, Unicode/emoji preservation, zero key/plaintext leakage, key rotation, ADR-016 |
| **P2-002A** | Authentication Architecture Review and Approval Gate | P1-004, P2-001 | **COMPLETE** | Architectural specification `docs/authentication-architecture.md`, ADR-017, standardized on OAuth 2.1 + PKCE + server-side PostgreSQL sessions, rejected initial stateless JWTs |
| **P2-002** | Implement User Authentication (OAuth 2.1 / Session with PKCE) | P2-002A | **COMPLETE & LIVE GATE VERIFIED** | Real GitHub OAuth configuration verified in `.env.local`. Live HTTP initiation (`GET /auth/github` -> `https://github.com/login/oauth/authorize`) verified on running dev server with PKCE `S256` and encrypted transit cookie. Live PostgreSQL verification gate (`scratch/verify-auth-gate.js`) 14/14 PASS (flow initiation, state tampering rejection, user/tenant provisioning, SHA-256 session token, cookie attributes, `/auth/me` context hydration, tenant boundary immunity, re-login deduplication, logout revocation, expired session rejection, suspended user blocking, audit trail sanitization, identity scope separation). All 131 automated unit/integration tests PASS across 31 suites. |
| **P2-003A** | Resource Connection Schema Design Review and Approval | P2-001, P2-002 | **COMPLETE & APPROVED** | Architectural review document `docs/resource-connections-schema-review.md`, ADR-018 in `docs/decisions.md`. Defined provider-neutral `resource_connections` model, dual tenancy (`tenant_id`, `user_id`), AES-256-GCM encrypted credential storage, status lifecycle, `jsonb` scopes, and unique constraint `(tenant_id, provider, external_account_id)`. |
| **P2-003** | Create `resource_connections` database schema storing encrypted tokens, connector status, and scopes | P2-003A | **COMPLETE** | Migration `0001_funny_human_fly.sql` applied to live PostgreSQL. Unit tests (`tests/unit/resource-connections.test.js` - 9 tests) and live integration tests (`tests/integration/resource-connections-schema.test.js` - 9 tests): metadata verification, CRUD, multi-tenant isolation, ownership FKs, unique constraint `(tenant_id, provider, external_account_id)`, P2-001 AES-256-GCM encryption/decryption, key-version consistency, status lifecycle transitions, user/tenant cascade deletion, and audit trail sanitization. Full suite: 149/149 PASS across 36 suites. |
| **P2-004A** | Resource Connector Architecture Review and Approval | P2-003 | **COMPLETE & APPROVED** | Architectural specification `docs/resource-connector-architecture.md`, ADR-019 in `docs/decisions.md`. Defined `BaseResourceConnector`, `CONNECTOR_CAPABILITIES`, `ConnectorRegistry`, `ConnectorContext`, transient credential decryption, normalized domain models, unified error mapping, and cursor pagination. |
| **P2-004** | Implement provider-neutral `ResourceConnector` interface and connector registry | P2-004A | **COMPLETE** | Implemented `BaseResourceConnector`, `CONNECTOR_CAPABILITIES`, `createConnectorContext`, `ConnectorRegistry`, `MockResourceConnector`, error classes, normalized domain models (`NormalizedAccount`, `NormalizedResource`, `ConnectorOperationResult`), and cursor pagination in `src/connectors/`. Unit tests (`tests/unit/connectors.test.js` - 32 tests) pass with zero credential retention. Full suite: 181/181 PASS across 46 suites. |
| **P2-005A** | Resource Connection Lifecycle API Review and Approval | P2-003, P2-004 | **COMPLETE & APPROVED** | Architectural specification `docs/resource-connection-api-review.md`, ADR-020 in `docs/decisions.md`. Defined 5-tier architecture, mandatory tenant query scoping, role & creator ownership model, safe Zod response models, health test behavior, disconnect vs delete semantics, and CSRF/rate-limiting requirements. |
| **P2-005** | Create connection lifecycle endpoints (list connections, test connection health, disconnect, revoke) | P2-005A | **COMPLETE** | Implemented `GET /connections`, `GET /connections/:id`, `POST /connections/:id/test`, `POST /connections/:id/disconnect`, `DELETE /connections/:id` in `src/routes/connections.routes.js`, `src/services/connection.service.js`, `src/db/repositories/connection.repository.js`, and `src/routes/connections.schemas.js`. Unit tests (`tests/unit/connection-service.test.js` - 14 tests) and live integration tests against PostgreSQL (`tests/integration/connections.test.js` - 20 tests): listing, pagination, filters, detail inspection, health testing with status mutation (`ACTIVE`, `REVOKED`, `ERROR`), 10 req/min rate limit, credential scrubbing on disconnect, idempotency, hard deletion, tenant boundary isolation (404 on cross-tenant lookup), and creator/owner role matrix enforcement. Full suite: 215/215 PASS across 58 suites. |
| **P2-006** | Enforce tenant isolation middleware ensuring all resource operations are scoped strictly to `req.user.id` | P2-002, P2-003 | **COMPLETE** | Implemented immutable request context (`req.auth` frozen), centralized resource authorization helper (`src/security/resource-authorization.js`), repository runtime guards (`assertTenantId` across all data access methods), and trusted connector context derivation (`createTrustedConnectorContext`). Unit tests (`tests/unit/tenant-isolation.test.js` - 20 tests) and live integration tests against PostgreSQL (`tests/integration/tenant-isolation-hardening.test.js` - 9 tests): cross-tenant 404 default-deny across all endpoints, spoofing resistance (query, header, body parameters ignored), and explicit negative regression test. Full suite: 244/244 PASS across 68 suites. |

---

### PHASE 3: GitHub App Integration
*Objective: Build the production GitHub App integration supporting fine-grained repository access, webhook handling, and read-only repository inspection.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P3-001A** | GitHub App Authentication & Cryptographic Key Management Architecture Review | P2-001, P2-006 | **COMPLETE & APPROVED** | Architectural specification `docs/github-app-auth-architecture-review.md`, ADR-021 in `docs/decisions.md`. Defined RSA private key PEM ingestion, RS256 App JWT minting (9-min exp, 60s clock skew buffer), short-lived installation access tokens (`ghs_*`, 60-min TTL), multi-tenant partitioned in-memory token cache (`gh_token:tenantId:installationId:repoScopeHash`), 5-minute proactive refresh buffer, upstream revocation, least privilege scopes, rate limit inspection, and zero-downtime key rotation protocol. |
| **P3-001** | Implement GitHub App authentication module (`src/connectors/github/auth.js`) using App ID and Private Key (PEM) | P3-001A | **COMPLETE** | Implemented `GitHubAppAuthManager`, `GitHubTokenCache`, `normalizeAppPrivateKey`, `generateAppJwt`, and `parseGitHubErrorResponse` in `src/connectors/github/`. Features: multiline and base64 PEM normalization, RS256 JWT generation with 60s backdated clock skew buffer and 9-min expiry, short-lived installation access tokens (`ghs_*`) requesting least-privilege `contents:read` and `metadata:read` scopes, tenant-partitioned in-memory token caching (`gh_token:tenantId:installationId:repoHash`) with 5-min proactive refresh buffer, concurrent request coalescing (anti-stampede), bounded exponential backoff retries on 429/5xx, upstream token revocation (`DELETE /installation/token`), and zero private key leakage. Unit tests (`tests/unit/github-app-auth.test.js` - 21 tests) pass. Full suite: 265/265 PASS across 77 suites. |
| **P3-002A** | GitHub App Installation Linking Architecture Review | P3-001 | **COMPLETE & APPROVED** | Architectural specification `docs/github-app-installation-linking-review.md`, ADR-022 in `docs/decisions.md`. Defined authenticated user/tenant session binding, HMAC-SHA256 anti-CSRF transit cookie (`__Host-gh_install_state`), server-side installation verification via App JWT (`GET /app/installations/:id`), strict cross-tenant installation collision rejection (409 Conflict), idempotent upsert into `resource_connections`, ephemeral in-memory token lifecycle, and audit events. |
| **P3-002** | Implement GitHub App installation callback & OAuth user-to-server linking flow | P2-003, P3-001, P3-002A | **COMPLETE** | Implemented `GitHubInstallationService` in `src/services/github-installation.service.js`, Fastify integration routes (`GET /integrations/github/install`, `GET /integrations/github/install/callback`) in `src/routes/integrations.routes.js`, Zod schemas in `src/routes/integrations.schemas.js`, and repository methods in `src/db/repositories/connection.repository.js`. Features: HMAC-SHA256 anti-CSRF transit state cookie (`gh_install_state` / `__Host-gh_install_state`), server-side installation identity & permission verification via App RS256 JWT, cross-tenant installation collision rejection with 409 Conflict (`INSTALLATION_ALREADY_LINKED`), idempotent `resource_connections` upsert, AES-256-GCM durable metadata encryption, role-based authorization (rejects READONLY with 403), zero private key or ephemeral token persistence, and structured audit logging (`github.installation_started`, `github.installation_linked`, `github.installation_rejected`). Verified across 16 unit tests and 8 live PostgreSQL integration tests. Total suite: 289/289 PASS across 85 suites. |
| **P3-003A** | GitHub App Webhook Architecture Review | P3-001, P3-002 | **COMPLETE & APPROVED** | Architectural specification `docs/github-webhook-architecture.md`, ADR-023 in `docs/decisions.md`. Defined HMAC-SHA256 signature verification over raw request body Buffer, secret isolation, authoritative tenant resolution via `installation_id`, installation (`created`, `deleted`, `suspend`, `unsuspend`) and repository (`added`, `removed`) lifecycle state transitions, partitioned in-memory token cache eviction (`tokenCache.evict`), delivery idempotency via `X-GitHub-Delivery` (24h TTL), and asynchronous execution boundary for repository AST scanning. |
| **P3-003** | Implement GitHub Webhook handler with `X-Hub-Signature-256` HMAC validation | P1-005, P3-001, P3-003A | **COMPLETE** | Implemented `POST /webhooks/github` route (`src/routes/webhooks.routes.js`), cryptographic HMAC-SHA256 signature verification over raw request body Buffer (`src/security/webhook-signature.js`), in-memory 24-hour delivery deduplication (`src/services/webhook-delivery-cache.js`), and lifecycle service (`src/services/github-webhook.service.js`). Features: 10 MB payload limit, constant-time `timingSafeEqual` comparison, authoritative tenant resolution via `installation.id`, lifecycle transitions (`installation.deleted` -> REVOKED, `installation.suspend` -> REVOKED, `installation.unsuspend` -> ACTIVE), repository selection updates (`installation_repositories.added`/`removed`), in-memory token cache eviction (`tokenCache.evict`), monotonic inactive state guards, unlinked installation safety, and structured audit logs with zero credential leakage. Verified across 7 signature unit tests, 12 service unit tests, and 8 PostgreSQL integration tests. Total suite: 318/318 PASS across 92 suites. |
| **P3-004A** | GitHub Read Connector Architecture Review | P2-004, P3-001, P3-002, P3-003 | **COMPLETE & APPROVED** | Architectural specification `docs/github-read-connector-architecture.md`, ADR-024 in `docs/decisions.md`. Defined `GitHubAppConnector` adhering to `BaseResourceConnector`, Node.js native `fetch` HTTP client with `AbortSignal.timeout(10000)`, short-lived installation token sourcing (`ghs_*`), domain models (`NormalizedAccount`, `NormalizedResource`), opaque cursor pagination translation (`base64url`), canonical numeric repository ID (`1043905096`), `metadata:read` scope mapping, rate-limit header parsing, retry policies, and zero persistent read audit noise. |
| **P3-004** | Implement GitHub Connector read tools: `get_user_profile`, `list_repositories`, `get_repository` | P2-004, P3-001, P3-004A | **COMPLETE** | Implemented `GitHubAppConnector` in `src/connectors/github/github-connector.js` adhering to `BaseResourceConnector`. Features: operations (`getAccount`, `listResources`, `getResource`, `validate`, `revokeAccess`), native `fetch` client with 10s timeout, short-lived installation token sourcing (`ghs_*`) via `GitHubAppAuthManager`, domain normalization (`NormalizedAccount`, `NormalizedResource`), opaque Base64URL cursor pagination (`INVALID_PAGINATION_CURSOR` rejection), canonical numeric repository ID (`1338724502`) and secondary `owner/repo` lookup, connection status validation (`ACTIVE` allowed; `REVOKED`/`DISCONNECTED` rejected), error mapping (401 -> `ConnectorAuthError` + token cache eviction, 403 -> `InsufficientScopeError`, 404 -> `ResourceNotFoundError`, 429 -> `ProviderRateLimitError`, 5xx/timeout -> `ProviderUnavailableError`), retry with exponential jittered backoff, and registration in `connectorRegistry` for `'GITHUB_APP'`. Verified across 20 unit tests, 3 PostgreSQL integration tests, and live verification against real GitHub installation `155430459`. Total suite: 350/350 PASS across 101 suites. |
| **P3-005A** | Deep Repository Inspection Architecture & Security Review | P3-004 | **COMPLETE & APPROVED** | Architectural specification `docs/github-deep-inspection-architecture.md`, ADR-025 in `docs/decisions.md`. Defined single file size ceiling (1MB), README content cap (256KB), directory tree depth (10 levels max) and entry bounds (1,000 entries max with graceful `truncated: true` handling), binary/compiled artifact extension blocklist and null-byte detection, symlink exclusion (`mode === '120000'`), strict POSIX path traversal normalization, commit history extraction (100 max) with author email/PII scrubbing, ephemeral in-memory processing (zero full repository cloning into PostgreSQL), and `READ_CONTENT` capability expansion. |
| **P3-005** | Implement deep repository inspection: `get_readme`, `get_repository_tree`, `get_languages`, `get_recent_commits`, `get_file_content` | P3-004, P3-005A | **COMPLETE** | Implemented `getReadme`, `getRepositoryTree`, `getLanguages`, `getRecentCommits`, `getFileContent` in `GitHubAppConnector` with `CONNECTOR_CAPABILITIES.READ_CONTENT`. Features: 1MB file size limit (`FILE_TOO_LARGE`), 256KB README markdown cap with safe Base64 decoding, 10-level tree depth and 1,000 entries cap, binary extension blocklist and 512-byte null-byte sniffing (`BINARY_FILE_REJECTED`), symlink exclusion (`SYMLINK_REJECTED`), strict POSIX path traversal rejection (`INVALID_FILE_PATH`), author email scrubbing, opaque cursor pagination, and ephemeral in-memory processing. Verified across 21 unit tests, 4 PostgreSQL integration tests, and live verification against real repository `vishu1803/Ai-job-mcp` (installation `155430459`). Total suite: 371/371 PASS across 109 suites. |
| **P3-006A** | GitHub Connector Caching & Rate-Limit Architecture Review | P3-005 | **COMPLETE & APPROVED** | Architectural specification `docs/github-connector-caching-architecture.md`, ADR-026 in `docs/decisions.md`. Defined in-memory LRU cache with multi-tenant deterministic partition isolation (`gh_cache:<tenantId>:<installationId>:<op>:<resourceId>:<paramsHash>`), HTTP `ETag` / `If-None-Match` 304 Not Modified conditional request revalidation, tiered TTL matrix (5m account/commits, 15m metadata/trees/README/files, 30m languages, 24h SHA-pinned content), strict memory ceilings (2,000 entries max globally, 500 entries per tenant, 1MB max cached payload), webhook-driven targeted cache invalidation (`push`, `installation_repositories.removed`, `installation.deleted`), and in-memory rate-limit tracking with warning thresholds (`remaining <= 50`). |
| **P3-006** | Implement rate-limit tracking and caching layer with `ETag` / `If-None-Match` support | P3-005, P3-006A | **COMPLETE** | Implemented `GitHubConnectorCache` and `GitHubRateLimiter` in `src/connectors/github/`. Features: in-memory Map-based LRU with multi-tenant partition isolation (`gh_cache:<tenantId>:<installationId>:<op>:<resourceId>:<paramsHash>`), HTTP `ETag` / `If-None-Match` 304 Not Modified conditional request revalidation, tiered TTL matrix (5m account/commits, 15m metadata/trees/README/files, 30m languages, 24h SHA-pinned content), strict memory ceilings (2,000 entries max globally, 500 entries per tenant, 1MB max cached payload), webhook-driven targeted cache invalidation (`installation.deleted`, `installation.suspend`, `installation_repositories`), and in-memory rate-limit tracking with warning thresholds (`remaining <= 50`) and proactive throttling (`remaining <= 5`). Verified across 10 cache unit tests, 7 rate-limiter unit tests, 3 connector revalidation unit tests, 2 webhook cache invalidation unit tests, and live verification against real GitHub installation `155430459` (repository `vishu1803/Ai-job-mcp`). Total suite: 400/400 PASS across 123 suites. |

---

### PHASE 4: Unified Candidate / Resource Model
*Objective: Build the schema-validated candidate profile engine that extracts skills and projects with mandatory evidence provenance.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P4-001A** | Unified Candidate / Resource Domain Model Architecture Review | P3-006 | **COMPLETE & APPROVED** | Architectural specification `docs/unified-candidate-resource-model.md`, ADR-027 in `docs/decisions.md`. Defined canonical `Candidate`, `CandidateIdentity`, provider-neutral `Resource`, `Project` ($1\text{ Project} \ne 1\text{ Repository}$), canonical `Skill` taxonomy, `CandidateSkill` with provenance status (`VERIFIED`, `INFERRED`, `CLAIMED`, `MISSING`), immutable `EvidenceItem` nodes, single-tenant strict isolation, ephemeral source processing, and proposed 8-table PostgreSQL schema. |
| **P4-001** | Design and implement Zod schemas for `CandidateProfile`, `SkillWithEvidence`, `ProjectEvidence`, and `EvidenceNode` | P1-001, P4-001A | **COMPLETE** | Unit tests validating valid and invalid candidate data structures (`tests/unit/candidate-domain-schemas.test.js` -> 29/29 PASS). Strict object constraints, path traversal rejection, secret excerpt redaction, and bounded metadata. |
| **P4-002** | Create database tables: `candidates`, `candidate_identities`, `resources`, `projects`, `project_resources`, `skills`, `candidate_skills`, `evidence_items` | P1-004, P4-001 | **COMPLETE** | Live database migration `drizzle/0002_sturdy_zarek.sql` executed on Aiven PostgreSQL. Comprehensive integration test suite `tests/integration/candidate-domain-schema.test.js` (8/8 PASS) verifying CRUD, composite unique constraints, RESTRICT/CASCADE foreign key rules, and cross-tenant default-deny isolation. |
| **P4-003A** | GitHub Evidence Extractor Architecture & Security Review | P3-005, P4-002 | **COMPLETE & APPROVED** | Architectural specification `docs/github-evidence-extractor-architecture.md` (`ARCH-008`), ADR-028 in `docs/decisions.md`. Defined threat model, zero-code-execution static parsing, multi-ecosystem manifest parsing (`package.json`, `requirements.txt`, `Pipfile`, `pyproject.toml`, `go.mod`, `Cargo.toml`), safe import regexes, secret scrubber ($\le 1024$ chars), taxonomy normalization engine, deterministic deduplication hashing, and candidate skill rollup formulas. |
| **P4-003** | Implement GitHub Evidence Extractor (analyzes `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, directory trees, and commit messages) | P3-005, P4-001, P4-003A | **COMPLETE** | Unit tests (`tests/unit/github-evidence-extractor.test.js` - 39 tests), live PostgreSQL integration tests (`tests/integration/github-evidence-extractor.test.js` - 5 tests), and live extraction gate against GitHub installation `155430459` (`vishu1803/Ai-job-mcp`). Full suite: 481/481 PASS across 158 suites. |
| **P4-004A** | Evidence Linking Engine Architecture Review | P4-003 | **COMPLETE & APPROVED** | Architectural specification `docs/evidence-linking-architecture.md` (`ARCH-009`), ADR-029 in `docs/decisions.md`. Defined canonical `EvidenceId` (UUIDv4), SHA-256 fingerprint deduplication decoupling, strict provenance immutability, skill linking via direct FKs & primary anchor, project linking ($1 : N$), strict multi-tenant default-deny (404), 40-char commit SHA pinning, historical evidence preservation, and transactional atomicity. |
| **P4-004** | Implement Evidence Linking Engine: every skill and project item is assigned an immutable `EvidenceId` referencing repository, file path, and commit SHA | P4-003, P4-004A | **COMPLETE** | Unit tests (`tests/unit/evidence-linking.test.js` - 17 tests), live PostgreSQL integration tests (`tests/integration/evidence-linking.test.js` - 9 tests). Verified canonical `EvidenceId` (UUIDv4), deterministic primary evidence selection, monotonic confidence scoring, project linking & `project_resources` association, cross-tenant 404 default-deny, atomic rollback on batch failure, and retention semantics. Full suite: 507/507 PASS across 170 suites. |
| **P4-005A** | Candidate Profile Service Architecture Review | P4-004 | **COMPLETE & APPROVED** | Architectural specification `docs/candidate-profile-service-architecture.md` (`ARCH-010`), ADR-030 in `docs/decisions.md`. Defined verified facts vs explicit `[Unverified User Claim]` labeling, user narrative sovereignty against background sync overwrites, Candidate vs User decoupling, credential scrubbing in resource summaries, multi-resource project modeling, RBAC (`OWNER`, `MEMBER`, `READONLY`), and `CandidateProfileView` domain serialization. |
| **P4-005** | Create Candidate Profile Service (CRUD operations, manual claim tagging as `[Unverified User Claim]`, profile sync) | P4-002, P4-004, P4-005A | **COMPLETE** | Unit tests (`tests/unit/candidate-profile.service.test.js` - 9 tests), live PostgreSQL integration tests (`tests/integration/candidate-profile.service.test.js` - 15 tests). Verified candidate CRUD, full profile view aggregation without leaked credentials, manual skill claim creation with `[Unverified User Claim]` labeling, claim preservation/elevation against verified evidence, narrative sovereignty during background sync, partitioned metadata (`userCustom` vs `systemInferred`), archive/restore, and RBAC (`OWNER`, `MEMBER` self-linked, `READONLY`). Full suite: 531/531 PASS across 180 suites. |
| **P4-006** | Multi-tenant candidate data isolation tests | P4-005 | **COMPLETE** | Dedicated security integration test suite (`tests/integration/candidate-tenant-isolation.test.js` - 24 tests across 13 suites). Verified strict 404 default-deny on cross-tenant candidate/resource/project/skill/evidence lookups, list pagination isolation, deep recursive payload leak checks (0 foreign UUIDs or metadata), manual claim isolation, cross-tenant evidence linking rejection, 0 foreign row mutation capture, client spoofing resistance, RBAC matrix (`OWNER`, `MEMBER`, `READONLY`), sync isolation, and deletion independence. Full suite: 555/555 PASS across 193 suites. |

---

### PHASE 5: Career Intelligence Engine
*Objective: Build the provider-neutral core for job requirement extraction, skill normalization, ATS matching, and project relevance ranking.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P5-001A** | Career Intelligence Engine Architecture Review | Phase 4 | **COMPLETE & APPROVED** | Architectural specification `docs/career-intelligence-architecture.md` (`ARCH-011`), ADR-031 in `docs/decisions.md`. Defined canonical `JobDescription` & `JobRequirement` domain models, taxonomy reuse, deterministic 100-point scoring formula, explainable match evaluations (`MATCHED`, `PARTIAL`, `MISSING`, `UNKNOWN`), prioritized skill gaps (`CRITICAL`, `HIGH`, `MED`, `LOW`), anti-prompt-injection sandbox, multi-tenant 404 default-deny, and future 4-table persistence model. |
| **P5-001** | Implement Job Description Parser (extracts title, level, required skills, preferred skills, domain, and responsibilities) | P4-001, P5-001A | **COMPLETE** | Implemented `JobDescriptionParser` and canonical domain schemas (`src/domain/career/`). Unit test suites (`tests/unit/job-description.schemas.test.js` - 11 tests, `tests/unit/job-description-parser.test.js` - 19 tests) verifying 5 real-world JDs, deterministic section partitioning, taxonomy normalization, experience/education/location parsing, prompt-injection defense, and resilient fallback. Full suite: 585/585 PASS across 204 suites. |
| **P5-002A** | Skill Normalizer & Taxonomy Engine Architecture Review | P5-001 | **COMPLETE & APPROVED** | Architectural specification `docs/skill-taxonomy-architecture.md` (`ARCH-012`), ADR-032 in `docs/decisions.md`. Defined single canonical slug model (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), 50+ technology alias catalog, 7-stage deterministic normalization pipeline, explicit relationship graph (`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`), controlled unknown tool slugification, strict LLM boundary, hybrid in-memory/PostgreSQL storage, and 100% backward compatibility with existing evidence. |
| **P5-002** | Implement Skill Normalizer & Taxonomy (e.g., maps "React.js", "ReactJS", "React" -> `React`; "Postgres" -> `PostgreSQL`) | P5-001, P5-002A | NOT_STARTED | Unit test with 50+ common technology synonym variations |
| **P5-003** | Implement Evidence Matching & Gap Analysis Engine (categorizes requirements as: Verified, User Claim, Inferred, or Missing) | P4-004, P5-002 | NOT_STARTED | Test matching candidate profile against job requirements with exact gap breakdown |
| **P5-004** | Implement Project Relevance Scoring (ranks candidate repositories by direct relevance to target job requirements) | P4-004, P5-003 | NOT_STARTED | Test project ranking accuracy given diverse job descriptions |
| **P5-005** | Implement ATS Fit Score calculator with transparent breakdown and reasoning | P5-003, P5-004 | NOT_STARTED | Test deterministic scoring output matching mathematical breakdown |
| **P5-006** | Zero-Hallucination Integrity Gate (validates that any career summary or match assertion contains valid evidence references) | P5-003 | NOT_STARTED | Test that queries with zero evidence produce explicit "Missing Evidence" status |

---

### PHASE 6: Resume / Cover-Letter / Portfolio Adaptation
*Objective: Generate tailored, verifiable resume bullets, cover letters, and portfolio recommendations strictly tied to evidence.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P6-001** | Implement Resume Tailoring Service (adapts candidate project descriptions using only verified technologies and commits) | P5-003, P5-006 | NOT_STARTED | Unit test verifying all generated bullets link to valid `EvidenceId` |
| **P6-002** | Implement Cover Letter Drafting Engine (weaves authentic repository evidence into targeted narrative for a specific job) | P5-003, P5-006 | NOT_STARTED | Test generating cover letter with real project citations |
| **P6-003** | Implement Portfolio Recommender (selects top 3-5 repositories and highlights key architectural achievements for target role) | P5-004 | NOT_STARTED | Test portfolio selection algorithm across Frontend, Backend, and DevOps roles |
| **P6-004** | Implement Export Formats (JSON Resume standard, Markdown, Plain Text) | P6-001 | NOT_STARTED | Test exporting tailored resume to standard JSON Resume format |
| **P6-005** | Implement Resume Integrity Audit Tool (scans any generated document for claims lacking evidence) | P5-006, P6-001 | NOT_STARTED | Test flagging injected unsubstantiated claims |

---

### PHASE 7: Remote MCP Server
*Objective: Expose the career platform services as a standards-compliant remote MCP server using Streamable HTTP and per-user authentication.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P7-001** | Implement MCP Server foundation using official `@modelcontextprotocol/server` (2026-07-28 spec) | P1-005 | NOT_STARTED | Initialize MCP server instance and verify protocol handshake |
| **P7-002** | Implement Streamable HTTP Transport with header routing (`Mcp-Method`) and fallback SSE endpoint | P7-001 | NOT_STARTED | HTTP test sending JSON-RPC 2.0 requests over Streamable HTTP and receiving responses |
| **P7-003** | Implement Per-User Bearer Token / OAuth 2.1 Authentication & Tenant Scoping for MCP requests | P2-002, P7-002 | NOT_STARTED | Security test: valid MCP token routes to correct user; invalid token returns 401 |
| **P7-004** | Expose Career Read Tools: `get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit` | P4-005, P5-003, P7-001 | NOT_STARTED | Automated MCP client tool invocation test returning structured candidate data |
| **P7-005** | Expose Application Artifact Tools: `generate_tailored_resume`, `draft_cover_letter`, `recommend_portfolio_projects` | P6-001, P6-002, P7-004 | NOT_STARTED | Automated MCP client tool invocation test returning verifiable artifacts |
| **P7-006** | Implement MCP Audit Logging (logs tool invocation timestamp, tenant ID, tool name, execution time, and client user-agent) | P1-004, P7-004 | NOT_STARTED | Verify database audit log records created for every MCP tool call |

---

### PHASE 8: Gemini Integration (First Target AI Client)
*Objective: Connect Google Gemini to the remote MCP server and validate end-to-end career copilot functionality.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P8-001** | Implement Gemini API Client adapter for testing tool calling against remote MCP endpoint | P7-004 | NOT_STARTED | Integration test: Gemini API calling MCP tools via function calling |
| **P8-002** | Configure Gemini System Prompts with strict zero-hallucination and evidence-citation constraints | P8-001 | NOT_STARTED | Test prompting Gemini with job description and verifying it calls `analyze_job_fit` |
| **P8-003** | Test end-to-end Golden Path with Gemini: User connects GitHub -> builds evidence -> analyzes job -> Gemini explains fit | P3-005, P5-003, P8-002 | NOT_STARTED | Full integration test executing Golden Path and asserting accurate response |
| **P8-004** | Configure Gemini Enterprise / Gemini Developer Studio custom connector integration documentation | P7-002, P8-003 | NOT_STARTED | Live verification walkthrough connecting Gemini to remote MCP URL |
| **P8-005** | Benchmark MCP tool execution latency with Gemini (target <1.5s for cached queries) | P8-003 | NOT_STARTED | Latency benchmarking suite recording p50, p95, and p99 response times |

---

### PHASE 9: Approved GitHub / Project Modification Workflows
*Objective: Enable safe, user-confirmed project enhancements to demonstrate missing skills without touching main branches.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P9-001** | Implement Project Improvement Recommender (analyzes missing job skills and proposes concrete code/architecture additions) | P5-003 | NOT_STARTED | Test generating legitimate enhancement plan for a sample repository |
| **P9-002** | Implement Two-Phase Human-in-the-Loop Action Approval State Machine (`propose_action` -> `ApprovalTicket` -> `confirm_action`) | P2-002, P9-001 | NOT_STARTED | Unit test: action cannot execute without valid, unexpired approval ticket |
| **P9-003** | Implement GitHub Write Operations: `create_branch`, `create_commit_patch`, `create_pull_request` | P3-001, P9-002 | NOT_STARTED | Integration test against test repository creating branch and draft PR |
| **P9-004** | Enforce Safety Constraints: write actions NEVER touch default branch (`main`/`master`); only create feature branches | P9-003 | NOT_STARTED | Security test asserting attempt to write to `main` throws `ForbiddenOperationError` |
| **P9-005** | Expose MCP Write Tools: `propose_project_improvement`, `confirm_and_create_pr` | P7-001, P9-003 | NOT_STARTED | MCP integration test: AI proposes change, receives ticket, user confirms, PR is opened |
| **P9-006** | Test PR diff preview and test suite execution reporting before user confirms | P9-005 | NOT_STARTED | Verify diff output and test status included in approval payload |

---

### PHASE 10: Claude Integration (Second Target AI Client)
*Objective: Connect Anthropic Claude to the remote MCP server via custom connector with zero backend modifications.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P10-001** | Configure Claude Remote MCP Custom Connector endpoint compatibility (Public HTTPS, OAuth 2.1) | P7-003 | NOT_STARTED | Verify Claude Desktop & Web connector handshake succeeds |
| **P10-002** | Validate Claude Free (1-connector limit) and Claude Pro/Team multi-connector compatibility | P10-001 | NOT_STARTED | Execute candidate analysis and resume tailoring tools via Claude interface |
| **P10-003** | Verify provider-neutral prompt adherence: Claude receives identical tool responses as Gemini | P8-003, P10-002 | NOT_STARTED | Compare tool execution outputs between Gemini and Claude on identical inputs |
| **P10-004** | Document Claude custom connector setup guide and troubleshooting instructions | P10-002 | NOT_STARTED | Step-by-step verified documentation in repository |

---

### PHASE 11: ChatGPT Integration (Third Target AI Client)
*Objective: Connect OpenAI ChatGPT to the remote MCP server via Developer Mode with zero backend modifications.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P11-001** | Configure ChatGPT Developer Mode MCP connector compatibility (OAuth 2.1, Streamable HTTP) | P7-003 | NOT_STARTED | Verify ChatGPT connection registration and tool discovery |
| **P11-002** | Test ChatGPT Read Tools execution (`get_candidate_profile`, `analyze_job_fit`) | P11-001 | NOT_STARTED | Execute career queries inside ChatGPT interface and verify response accuracy |
| **P11-003** | Test ChatGPT Write Tool execution with user confirmation flow (`propose` -> `confirm`) | P9-005, P11-001 | NOT_STARTED | Verify write safety gate prompts user inside ChatGPT before PR creation |
| **P11-004** | Document ChatGPT Developer Mode connector setup guide | P11-002 | NOT_STARTED | Step-by-step verified documentation in repository |

---

### PHASE 12: Job / Application Tracking
*Objective: Maintain an integrated, evidence-linked tracker of candidate applications, stages, and tailored artifact history.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P12-001** | Create database tables: `job_applications`, `application_stages`, `tailored_documents` | P1-004 | NOT_STARTED | Database migration and query tests |
| **P12-002** | Implement Application Tracking Service (create application, update status, link tailored resume/cover letter) | P12-001 | NOT_STARTED | Integration test: track application through stages (`Applied`, `Screening`, `Interview`, `Offer`) |
| **P12-003** | Expose MCP Tracking Tools: `track_job_application`, `update_application_status`, `list_active_applications` | P7-001, P12-002 | NOT_STARTED | MCP tool invocation tests via AI client |
| **P12-004** | Implement Application Analytics (match score vs. response rate, skill gap frequencies across targets) | P12-002 | NOT_STARTED | Test computing aggregate statistics across tracked applications |
| **P12-005** | Multi-tenant isolation verification for job application records | P12-001 | NOT_STARTED | Security test asserting User A cannot query User B application records |

---

### PHASE 13: Public Multi-User Beta
*Objective: Deploy a public-facing multi-tenant beta allowing independent users to register, connect GitHub, and use remote MCP.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P13-001** | Build lightweight web dashboard for account management, connector linking, and token generation | P2-005, P4-005 | NOT_STARTED | End-to-end browser test: sign up, link GitHub, copy MCP connection URL |
| **P13-002** | Implement User Data Sovereignty features: View Indexed Evidence, Disconnect, Hard Delete Account (GDPR) | P2-005, P4-005 | NOT_STARTED | Test account hard delete permanently purges all candidate data and encrypted tokens |
| **P13-003** | Deploy production staging environment with SSL, custom domain, and health monitoring | P1-005 | NOT_STARTED | HTTPS health check probe returning 200 OK |
| **P13-004** | Onboard 5 external beta users and conduct end-to-end verification across Gemini, Claude, and ChatGPT | P8-003, P10-002, P11-002, P13-001 | NOT_STARTED | Beta feedback log and zero critical cross-tenant errors |
| **P13-005** | Document User Guide, Onboarding Walkthrough, and Video Demo | P13-001 | NOT_STARTED | Documentation and demo published |

---

### PHASE 14: Security Hardening & Production Readiness
*Objective: Perform rigorous security audits, vulnerability scans, rate limiting, and performance optimization.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P14-001** | Implement Global and Per-User Rate Limiting on API and MCP endpoints (Redis token bucket) | P1-005, P7-002 | NOT_STARTED | Load test triggering 429 Too Many Requests upon limit breach |
| **P14-002** | Perform Automated Security Vulnerability Scan (`npm audit`, Snyk, SonarQube / static analysis) | P1-001 | NOT_STARTED | 0 high or critical vulnerabilities in dependency tree |
| **P14-003** | Execute Penetration Testing suite (cross-tenant IDOR, SQL injection, prompt injection in evidence, CSRF) | P2-006, P4-006, P7-003 | NOT_STARTED | Automated security test suite passing 100% |
| **P14-004** | Implement Structured Metrics & Tracing (OpenTelemetry / Prometheus) | P1-005 | NOT_STARTED | Verify metrics export endpoint exposes request rates and latency |
| **P14-005** | Implement Automated Database Backup & Disaster Recovery Runbook | P1-003 | NOT_STARTED | Execute automated backup and test restoration to clean database |
| **P14-006** | Conduct Final Production Readiness Review against Success Criteria | All prior | NOT_STARTED | Signed-off audit report against `goal.md` requirements |

---

### PHASE 15: Advanced Automation & Future Connectors
*Objective: Expand connector ecosystem (GitLab, Google Drive, Notion) and add advanced career intelligence features.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P15-001** | Implement GitLab Connector (`ResourceConnector` implementation for GitLab repositories) | P2-004 | NOT_STARTED | Integration test extracting evidence from GitLab project |
| **P15-002** | Implement Google Drive / Local Document Connector (parses PDF resumes, project briefs, and portfolios) | P2-004 | NOT_STARTED | Test extracting structured text and evidence from uploaded PDF |
| **P15-003** | Implement Notion Connector (indexes technical notes, project wikis, and design docs) | P2-004 | NOT_STARTED | Test reading Notion database pages into candidate evidence graph |
| **P15-004** | Implement Automated Portfolio Site Generator (builds static showcase and publishes to GitHub Pages / Vercel) | P6-003, P9-003 | NOT_STARTED | Test generating and deploying live portfolio site |

---

## 5. Architecture Decisions Records (ADRs)

### ADR-001: Language and Runtime Environment
* **Status**: ACCEPTED
* **Context**: Need high velocity, robust asynchronous I/O, native JSON manipulation, and zero-compilation build friction. The project owner has a strong preference for JavaScript.
* **Decision**: Use **Node.js (v20+ LTS)** with native **ECMAScript Modules (ESM)**. Runtime schema validation enforced via **Zod**, and IDE type-checking supported via standard **JSDoc**.
* **Consequences**: No TypeScript compilation step required; fast startup and debugging; strict runtime safety guaranteed by Zod schemas at all service and MCP boundaries.

### ADR-002: Backend Web Framework
* **Status**: ACCEPTED
* **Context**: Need a lightweight, high-performance HTTP framework capable of handling standard REST endpoints, Streamable HTTP MCP transports, and per-request tenant context.
* **Decision**: Use **Fastify**.
* **Rationale**: Fastify offers superior throughput compared to Express, built-in JSON schema validation, an extensible plugin architecture for encapsulating domain services, and first-class async lifecycle hooks (`onRequest`, `preHandler`).
* **Consequences**: Easy encapsulation of multi-tenant auth plugins, rate-limit plugins, and raw request routing for MCP.

### ADR-003: Database and ORM
* **Status**: ACCEPTED
* **Context**: Need ACID compliance for user accounts, installations, and audit trails, combined with flexible semi-structured JSON storage for candidate evidence trees and AST-parsed project metadata.
* **Decision**: Use **PostgreSQL (16+)** with **Drizzle ORM** and native `JSONB` columns.
* **Rationale**: PostgreSQL provides rock-solid relational integrity for multi-tenancy (`tenant_id`, `user_id` foreign keys) and powerful indexing (GIN indexes on `JSONB`) for querying skill evidence and AST nodes.
* **Consequences**: Clean database migrations, verifiable referential integrity, and efficient candidate graph querying.

### ADR-004: Multi-Tenant Credential Encryption at Rest
* **Status**: ACCEPTED
* **Context**: The platform stores sensitive third-party credentials (GitHub App installation tokens, OAuth refresh tokens). Storing them in plaintext or under a single hardcoded key is a critical security vulnerability.
* **Decision**: Use **AES-256-GCM** authenticated symmetric encryption. Each secret is encrypted with a unique 12-byte initialization vector (IV), producing ciphertext and a 16-byte HMAC authentication tag. The master encryption key is supplied via environment variable and NEVER stored in the database or source code.
* **Consequences**: High security; tampering with stored ciphertext is instantly detected; zero risk of plaintext credential leakage in database dumps.

### ADR-005: Model Context Protocol (MCP) Remote Transport
* **Status**: ACCEPTED
* **Context**: The MCP specification underwent a major update (version 2026-07-28), establishing stateless Streamable HTTP as the primary remote transport and deprecating legacy stateful HTTP+SSE.
* **Decision**: Build the remote MCP server using **Streamable HTTP** as primary transport, with header-based routing (`Mcp-Method`) and per-request Bearer authentication. Maintain fallback SSE support for legacy clients.
* **Consequences**: Server can be deployed behind standard cloud load balancers without requiring sticky sessions; fully compatible with modern Gemini, Claude, and ChatGPT MCP clients.

### ADR-006: GitHub Integration via GitHub App
* **Status**: ACCEPTED
* **Context**: Traditional OAuth Apps request overly broad user-level scopes that last indefinitely. GitHub Apps provide granular, repository-specific permissions and short-lived tokens.
* **Decision**: Standardize on **GitHub App** architecture. Request read-only permissions by default (`contents:read`, `metadata:read`). Request write permissions (`contents:write`, `pull_requests:write`) only when user explicitly enables project modification features.
* **Consequences**: Significantly improved security posture; users can select exact repositories to share; short token lifespan (1 hour) reduces blast radius of any token compromise.

### ADR-007: Human-in-the-Loop Consequential Action Protocol
* **Status**: ACCEPTED
* **Context**: Autonomous AI modifications to code repositories or job applications can cause irreversible damage or submit inaccurate data.
* **Decision**: Implement a mandatory **Two-Phase Commit** workflow:
  1. `propose_action` -> Generates diff/plan, returns a short-lived `ApprovalTicket` (15-minute TTL).
  2. `confirm_action(ticketId)` -> Requires explicit user confirmation before any Git write or external submission occurs.
* **Consequences**: Completely prevents accidental or unauthorized writes; guarantees full human oversight.

### ADR-008: AI Client Interoperability
* **Status**: ACCEPTED
* **Context**: The system must not lock into Gemini-specific, Claude-specific, or ChatGPT-specific features.
* **Decision**: The core career intelligence engine exposes capabilities strictly through standard MCP tool definitions (JSON-RPC 2.0 with JSON Schema). Client-specific adapters exist only at the outermost network perimeter.
* **Consequences**: Adding support for a new AI client requires zero changes to career logic, candidate models, or database schemas.

---

## 5. Integration Verification Matrix

*Status Legend: `YES` = Verified working; `NO` = Not supported; `UNKNOWN` = Needs live test verification; `N/A` = Not applicable.*

| Client / Provider | Transport | Auth Method | Read Tools | Write Tools | Safety Gate | Verified Working? | Official Verification Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Gemini API** | Streamable HTTP / stdio | API Key / Bearer | YES | YES | YES | UNKNOWN (Target Phase 8) | Supports native function calling and MCP schema integration via Gemini SDK. |
| **Gemini Enterprise** | Streamable HTTP (Remote) | OAuth 2.1 / Bearer | YES | YES | YES | UNKNOWN (Target Phase 8) | Public Preview support for custom remote MCP connectors added July 2026. |
| **Claude Free** | Streamable HTTP (Remote) | OAuth 2.1 / HTTPS | YES | YES | YES | UNKNOWN (Target Phase 10) | Verified: Free tier supports **one** custom remote MCP connector. |
| **Claude Pro / Team** | Streamable HTTP (Remote) | OAuth 2.1 / HTTPS | YES | YES | YES | UNKNOWN (Target Phase 10) | Supports multiple custom remote connectors; requires public HTTPS endpoint. |
| **ChatGPT Plus / Pro** | Streamable HTTP / SSE | OAuth 2.1 / Bearer | YES | YES | YES | UNKNOWN (Target Phase 11) | Developer Mode supports custom MCP servers (read and write tools). |
| **ChatGPT Team / Enterprise** | Streamable HTTP / SSE | OAuth 2.1 / Bearer | YES | YES | YES | UNKNOWN (Target Phase 11) | Workspace-level connector governance and MCP tool support. |
| **Cursor / Local Agents** | stdio / Streamable HTTP | Local / Bearer | YES | YES | YES | UNKNOWN (Target Phase 7) | Native stdio and HTTP support for all registered MCP tools. |

---

## 6. Cost and Resource Model

| Tier / Phase | Compute / Hosting | Database | AI API Tokens | GitHub / 3rd Party APIs | Monthly Estimated Cost |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Development** | Localhost / GitHub Codespaces (180 core hrs/mo student benefit) | Local PostgreSQL container / Neon Free Tier (0.5 GB) | Gemini API Developer Free Tier (rate limited) / Google AI Studio | GitHub App Developer Sandbox (Free) | **$0.00 / month** |
| **MVP Demonstration** | Azure for Students ($100 annual credit) or Render/Railway Free Tier | Azure Database for PostgreSQL (Flexible Server Burstable) or Neon | Gemini API Developer Free / Pay-as-you-go (<$5/mo) | GitHub App (Free tier API: 5,000 req/hr/install) | **$0.00 / month (covered by credits/free tier)** |
| **Small Beta (50 Users)** | Render / Railway / Azure Basic ($7 - $15/mo) | Managed PostgreSQL (10 GB storage, $15/mo) + Upstash Redis Free | User brings own AI client (Gemini/Claude/ChatGPT) via MCP | GitHub App (5,000 req/hr per installation) | **~$20 - $30 / month** |
| **Public Production** | Fly.io / AWS ECS / Cloudflare Workers (Auto-scaling) | Managed PostgreSQL Multi-AZ + Redis Cluster ($50 - $100/mo) | Zero token cost to platform (Users connect their own AI clients via MCP) | GitHub App Marketplace Listing (Free) | **~$70 - $150 / month (Scales with user base)** |

*Important Clarification: Because users connect their own AI clients (Gemini, Claude, ChatGPT) to the remote MCP server, the platform acts as an infrastructure/tool server and does NOT incur massive LLM token billing for end-user chat sessions.*

---

## 7. Master Verification Checklists

### Security & Privacy Checklist
- [ ] No hardcoded tokens, passwords, or API keys in source control
- [ ] Master encryption key configured exclusively via environment variable (`MASTER_ENCRYPTION_KEY`)
- [ ] All external access tokens and refresh tokens encrypted with AES-256-GCM prior to database write
- [ ] Multi-tenant isolation verified: all DB queries filter on `tenant_id` / `user_id`
- [ ] GitHub Webhook requests validated with `X-Hub-Signature-256` HMAC-SHA256
- [ ] OAuth 2.1 state parameter validated to prevent CSRF attacks
- [ ] MCP endpoints require valid Bearer token authentication
- [ ] PII and secret redaction enabled on all Pino logging streams
- [ ] Rate limiting active on all public and authenticated endpoints
- [ ] Hard deletion (GDPR purge) verified to completely delete user data and credentials

### Testing & Quality Checklist
- [ ] Unit test coverage >= 80% on career intelligence and candidate modeling logic
- [ ] 100% of Zod schemas validated against both valid and invalid test payloads
- [ ] Integration tests verify complete GitHub App installation and token refresh flow
- [ ] End-to-end test verifies Golden Path: Candidate Ingestion -> Match Analysis -> MCP Response
- [ ] Performance test confirms MCP cached tool latency < 1.5 seconds

### Deployment & Operations Checklist
- [ ] Dockerfile optimized with multi-stage build (Node.js Alpine)
- [ ] Database migration scripts run idempotently during deployment
- [ ] Health check endpoints (`/healthz`, `/livez`) monitored with automated alerts
- [ ] Continuous Integration (GitHub Actions) runs linting, tests, and audit on every PR
- [ ] Rollback strategy documented and tested for database migrations

---

## 8. Known Limitations & Constraints
1. **GitHub App Rate Limits**: GitHub limits installations to 5,000 requests per hour. Repositories with massive commit histories must be indexed incrementally with shallow fetches.
2. **Claude Free Connector Limit**: Users on Claude Free plan can only connect **one** custom remote MCP connector at a time.
3. **Streamable HTTP Client Rollout**: While modern MCP clients support Streamable HTTP, legacy 2025 tools may still require SSE fallback endpoints.
4. **No Direct Resume Submission**: The platform generates ATS-tailored documents and tracks applications, but does not autonomously submit forms on third-party job boards to prevent bot bans.

---

## 9. Change Log

| Date | Author | Version | Summary of Changes |
| :--- | :--- | :--- | :--- |
| 2026-08-18 | Lead Architect | v0.1.0 | Initialized project constitution (`goal.md`) and execution tracker (`project.md`). Completed Phase 0 ecosystem research and architecture definitions. |
| 2026-08-19 | Antigravity AI | v0.1.1 | Established `AGENTS.md` operating protocol, completed mandatory 3-document verification protocol, and confirmed Phase 1 readiness. |
| 2026-08-19 | Antigravity AI | v0.2.0 | Completed Pre-Coding Preparation (Tasks 1-16): Created comprehensive `docs/` suite, `.github/instructions/` guidelines, `README.md`, `.env.example`, `.gitignore`, conducted environment audit, and validated zero-fabrication data models. |
| 2026-08-19 | Antigravity AI | v0.2.1 | Completed 10-point Architecture Sanity Check across all 9 control and technical specification documents (10/10 VERIFIED). Confirmed zero conflicts, zero fabrication risks, and approved commencement of Task P1-001. |
| 2026-08-19 | Antigravity AI | v0.3.0 | Completed Task P1-001 (Node.js ESM Project Foundation): Configured `package.json`, ESLint 9 flat config, Prettier, runtime entrypoint `src/index.js`, Fastify app factory `src/app.js`, Zod environment validation `src/config/env.js`, and unit test suite. Verified 100% PASS. |
| 2026-08-20 | Antigravity AI | v0.4.0 | Completed Task P1-002 (Structured Logging & Redaction): Implemented centralized Pino logger module (`src/utils/logger.js`) with comprehensive sensitive token/PII redaction, safe request/response serializers, error serializer with cause tracking, and request ID correlation in Fastify (`src/app.js`). Verified 13/13 unit tests PASS and live lifecycle PASS. |
| 2026-08-20 | Antigravity AI | v0.4.1 | Documentation Consistency: Formally locked database stack to PostgreSQL 16+ and Drizzle ORM across all specifications and ADR references, eliminating residual slash-notation ambiguity. |
| 2026-08-20 | Antigravity AI | v0.5.0 | Completed Task P1-003 (PostgreSQL & Drizzle Foundation): Configured PostgreSQL connection pool (`pg`), Drizzle ORM client (`src/db/index.js`), `drizzle.config.js`, migration directory (`drizzle/`), database health check probe, and 11 unit tests. Verified 24/24 unit tests PASS and `drizzle-kit check` PASS. |
| 2026-08-20 | Antigravity AI | v0.5.1 | End-to-End Live Supabase Verification (P1-003): Connected and fully verified PostgreSQL connection pool, Drizzle ORM queries, live transactions, and programmatic migration runner (`src/db/migrate.js`) against managed Supabase PostgreSQL 17.6 database. Authored dedicated live integration test suite (`tests/integration/db.test.js`) and confirmed 29/29 total tests PASS with zero exposed credentials. |
| 2026-08-20 | Antigravity AI | v0.5.2 | Core Database Schema Review (P1-004A): Completed comprehensive architectural review for core identity and multi-tenancy entities (`tenants`, `users`, `sessions`, `audit_logs`) in `docs/schema-review.md`. |
| 2026-08-20 | Antigravity AI | v0.5.3 | Core Schema Review Clarification (P1-004A): Resolved all 4 review notes in `docs/schema-review.md`. Established dedicated audit sanitization boundary (independent from logger), clarified PostgreSQL session expiration query-level checks and indexed cleanup, eliminated redundant indexes (`idx_tenants_slug`, `idx_users_status`, `idx_sessions_tenant_user`), documented Open Policy Decision on tenant hard-deletion audit retention with MVP `CASCADE` rule, and upgraded gate status to **APPROVED**. |
| 2026-08-20 | Antigravity AI | v0.6.0 | Completed Task P1-004 (Core Identity Database Schema): Implemented Drizzle ORM models for `tenants`, `users`, `sessions`, and `audit_logs` in `src/db/schema.js`. Created dedicated audit persistence sanitizer (`src/utils/audit-sanitizer.js`) enforcing 16 KB payload cap and strict credential redaction. Generated and applied initial Drizzle migration (`0000_familiar_wrecker.sql`) to live Supabase PostgreSQL 17.6 database. Authored 13 live integration tests verifying CRUD, multi-tenant isolation, cascade delete, and audit sanitization. Verified 43/43 total tests PASS across 6 suites. |
| 2026-08-20 | Antigravity AI | v0.7.0 | Completed Task P1-005 (API Error Handling, Validation Middleware & Health Endpoints): Implemented centralized AppError hierarchy (`ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `DependencyError`, `InternalServerError`), Fastify error/404 handlers, reusable Zod request and response validation middleware (`validateRequest`, `validateResponse`), and production health endpoints (`GET /livez` liveness probe, `GET /healthz` PostgreSQL readiness probe). Verified 64/64 total tests PASS across 9 suites. |
| 2026-08-20 | Antigravity AI | v0.7.1 | Completed Task P1-003-A (Aiven PostgreSQL Migration & Provider-Neutral SSL): Transitioned active development database to Aiven Free PostgreSQL (PostgreSQL 18.6). Implemented `.env.local` priority loading in `src/config/env.js`, refactored SSL handling in `src/db/index.js` to be fully provider-neutral (supporting `sslmode=require`, `rejectUnauthorized: false`, and remote hosts without provider-specific hardcoding), configured conservative connection pool (max 5) suited for Aiven Free's 20-connection limit, successfully applied existing Drizzle migration (`0000_familiar_wrecker.sql`) to clean Aiven instance, and verified all 64 unit and live integration tests PASS with zero credential leakage. |
| 2026-08-20 | Antigravity AI | v0.8.0 | Completed Task P1-006 (Automated Test Runner & CI Workflow): Established GitHub Actions CI workflow (`.github/workflows/ci.yml`) validating formatting (Prettier), static analysis (ESLint 9), Drizzle ORM configuration/schema check, automated migration application from scratch on an ephemeral PostgreSQL 17 service container, unit testing, and live integration testing. Authored ADR-015 (CI Database Isolation Strategy). Completed Phase 1 (100% of Phase 1 tasks verified). |
| 2026-08-20 | Antigravity AI | v0.8.1 | CI Action Version Upgrade: Updated GitHub Actions workflow (`.github/workflows/ci.yml`) to `actions/checkout@v5` and `actions/setup-node@v7` to address GitHub Actions Node 20 runner deprecation warnings, while preserving the application runtime at Node.js 22. Verified all 64 tests PASS across 9 suites. |
| 2026-08-20 | Antigravity AI | v0.9.0 | Completed Task P2-001 (AES-256-GCM Secret Encryption Foundation): Implemented authenticated symmetric encryption at rest in `src/security/encryption.js` utilizing native `node:crypto` AES-256-GCM with 128-bit authentication tags, 96-bit random IVs, AAD version binding, key versioning for rotation, 64 KB payload caps, and Zod `EncryptedPayloadSchema`. Added `CryptoError` to centralized errors and expanded logger sensitive key redactions. Authored ADR-016. Verified 91/91 total tests PASS across 20 suites. |
| 2026-08-20 | Antigravity AI | v0.9.1 | P2-001 Security Review Hardening: Removed built-in fallback master key from `src/config/env.js` and added strict production environment validation. Hardened `normalizeKey` in `src/security/encryption.js` to strictly enforce 64-hex or 44-base64 encoding (rejecting arbitrary low-entropy UTF-8 passphrases). Added tests verifying `MISSING_KEY` errors when unconfigured. Verified 94/94 total tests PASS across 20 suites. |
| 2026-08-20 | Antigravity AI | v0.9.2 | Completed Task P2-002A (Authentication Architecture Review & Approval Gate): Completed comprehensive authentication architecture specification in `docs/authentication-architecture.md`. Standardized on OAuth 2.1 with PKCE (`S256`), GitHub OAuth primary IdP, and server-side PostgreSQL sessions with SHA-256 hashed tokens and `HttpOnly` cookies. Formally rejected stateless JWTs for initial browser app to preserve instantaneous session revocation. Authored ADR-017. Gate status: P2-002A APPROVED. |
| 2026-08-20 | Antigravity AI | v0.9.3 | P2-002A Consistency Gate Resolution: Resolved 5 architectural consistency items in `docs/authentication-architecture.md` and `docs/decisions.md` (ADR-017). Standardized on `sessions.id = SHA-256(raw_session_token)` for O(1) PK lookups with zero schema changes. Defined immutable `(provider, provider_user_id)` external identity mapping with `user_identities` specification. Formally decoupled GitHub OAuth login tokens from GitHub App installation tokens. Gate status: P2-002A CONSISTENCY GATE PASSED. |
| 2026-08-20 | Antigravity AI | v1.0.0 | Completed Task P2-002 (OAuth 2.1 & Server-Side Session Authentication): Implemented pluggable BaseIdentityProvider and GitHubProvider adapter with PKCE S256 code challenge generation and code exchange. Built encrypted transient state management (`oauth_transit` cookie with AES-256-GCM). Created SessionService managing 256-bit cryptographically secure session tokens, deterministic SHA-256 hashing for O(1) database storage (`sessions.id`), database validation (`expires_at > NOW()`), and revocation. Implemented AuthService orchestrating OAuth flow, user/tenant auto-provisioning with unique slugs, session minting, and audit logging. Added Fastify middleware (`authenticate`, `authorize`, `verifyCsrf`) and HTTP endpoints (`GET /auth/github`, `GET /auth/github/callback`, `GET /auth/me`, `POST /auth/logout`). Verified 127/127 tests PASS across 31 suites (including 9 end-to-end integration tests). |

---

## 10. Final Architecture Sanity Check (Pre-P1-001 Gate)

| Verification Item | Invariant / Target Specification | Result | Verification Notes |
| :--- | :--- | :--- | :--- |
| **1. Fastify Framework** | Core HTTP REST and MCP Gateway | **VERIFIED** | Consistent across ADR-002, `architecture.md`, `integrations.md`, and `backend.instructions.md`. |
| **2. Node.js ESM** | Native ES modules (`"type": "module"`) | **VERIFIED** | Consistent across `goal.md`, `decisions.md`, `project.md`, and `javascript.instructions.md`. |
| **3. Zod Validation** | Strict runtime schema enforcement | **VERIFIED** | Required for all route bodies, query params, MCP tool args, and environment configs. |
| **4. PostgreSQL 16+** | Primary multi-tenant ACID store | **VERIFIED** | Drizzle ORM models with `JSONB` indexing specified in `data-model.md` and `database.instructions.md`. |
| **5. Provider Neutrality** | Decoupled core MCP architecture | **VERIFIED** | Business logic strictly decoupled from AI vendors; uniform JSON-RPC 2.0 tool definitions. |
| **6. GitHub App Integration** | Fine-grained short-lived access | **VERIFIED** | Standardized on GitHub App (`@octokit/app`), 1-hour installation tokens (`ghs_*`), HMAC webhooks. |
| **7. Multi-Tenant Isolation** | Strict row-level tenant boundary | **VERIFIED** | `tenant_id` foreign keys mandated on all entity tables; query scoping enforced in security model. |
| **8. Zero-Fabrication Integrity** | Radical evidence provenance | **VERIFIED** | Immutable `EvidenceId` links required for all verified skills; unverified claims flagged explicitly. |
| **9. Two-Phase Action Safety** | Human-in-the-loop approval gate | **VERIFIED** | `ActionApproval` state machine (`propose` -> `confirm`) with 15-minute TTL; direct `main` push forbidden. |
| **10. AI Client Decoupling** | Gemini as client, not platform | **VERIFIED** | Zero Gemini-specific assumptions in candidate models; Claude and ChatGPT parity verified in matrix. |

---

## 11. Environment Readiness Audit

| Component | Detected Version / Status | Suitability | Notes |
| :--- | :--- | :--- | :--- |
| **Operating System** | Windows 11 (x64) | Fully Compatible | Local dev platform |
| **Node.js** | **v24.13.0** (ESM Native) | Exceeds Requirement (v20+ LTS) | Native ESM & crypto support verified |
| **npm** | **11.6.2** | Exceeds Requirement (v10+) | Package manager ready |
| **Git** | **2.51.0.windows.1** | Fully Compatible | Version control active |
| **Docker** | **28.4.0** (build d8eb465) | Fully Compatible | Ready for local PostgreSQL 16 container |
| **Python** | **3.10.2** | Available | Auxiliary scripting ready |
| **GitHub CLI** | **gh 2.97.0** (2026-07-31) | Fully Compatible | GitHub App & repository verification ready |

---

## 12. Next Recommended Implementation Tasks

**Task P3-001A (GitHub App Authentication & Cryptographic Key Management Architecture Review)** is **COMPLETE & APPROVED** (`docs/github-app-auth-architecture-review.md`, ADR-021).
**Task P3-001 (GitHub App Authentication Module)** is **COMPLETE & VERIFIED** (265/265 tests passing).
**Task P3-002A (GitHub App Installation Linking Architecture Review)** is **COMPLETE & APPROVED** (`docs/github-app-installation-linking-review.md`, ADR-022).
**Task P3-002 (GitHub App Installation Linking Flow)** is **COMPLETE & VERIFIED** (289/289 tests passing).

The project is ready to proceed with Task **P3-003**:

1. **[P3-003]**: Implement GitHub Webhook handler with `X-Hub-Signature-256` HMAC validation (`/webhooks/github`).
2. **[P3-004]**: Implement scoped repository cataloging service with AST/manifest metadata fetching (`src/connectors/github/repository.js`).
3. **[P3-005]**: Build repository selector & permissions synchronization API (`/integrations/github/repositories`).
4. **[P3-006]**: Implement rate-limit tracking and caching layer with `ETag` / `If-None-Match` support.

---

## 13. Evidence of Completed Work

### Phase 0: Research & Architecture (v0.1.0)
* **P0-001**: Comprehensive official ecosystem research completed (MCP 2026-07-28 spec, Gemini Developer API, Claude custom connectors, ChatGPT Developer Mode, GitHub Apps fine-grained permissions, student benefit constraints).
* **P0-002**: Architecture Decision Records formulated and recorded (ADR-001 to ADR-008).
* **P0-003**: `goal.md` written and validated as stable project constitution.
* **P0-004**: `project.md` written with master task table (P0-001 to P15-004), integration matrix, cost model, and execution checklists.

### Pre-Coding Preparation (v0.2.0 & v0.2.1)
* **Technical Documentation**: Created `docs/architecture.md`, `docs/decisions.md` (ADR-001 through ADR-014), `docs/security.md`, `docs/data-model.md`, `docs/integrations.md`, and `docs/golden-path.md`.
* **Agent Guidelines**: Created `.github/instructions/javascript.instructions.md`, `backend.instructions.md`, `database.instructions.md`, `security.instructions.md`, and `testing.instructions.md`.
* **Project Configuration**: Created `README.md`, `.env.example`, and `.gitignore`.
* **Environment Audit**: Verified Node.js v24.13.0, npm 11.6.2, Git 2.51.0, Docker 28.4.0, Python 3.10.2, and GitHub CLI 2.97.0.
* **Sanity Gate**: Verified 10/10 architectural invariants across all 9 documents.

### Phase 1: Multi-User Platform Foundation
* **P1-001 (Node.js ESM Foundation)**:
  * Files Created: `package.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `src/config/env.js`, `src/app.js`, `src/index.js`, `tests/unit/app.test.js`, `scratch/test-lifecycle.js`.
  * Dependencies Added: `fastify` (v5.2.1), `zod` (v3.24.2), `dotenv` (v16.4.7), `pino` (v9.6.0), `eslint` (v9.20.1), `prettier` (v3.5.1), `@eslint/js` (v9.20.0), `eslint-config-prettier` (v10.0.1).
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm test` -> PASS (3/3 tests passed, duration 1.35s)
    * `node scratch/test-lifecycle.js` -> PASS (HTTP 200 OK on `/healthz`, graceful shutdown on SIGINT)
* **P1-002 (Structured Logging & Security Redaction)**:
  * Files Created / Updated: `src/utils/logger.js`, `src/app.js`, `src/index.js`, `eslint.config.js`, `tests/unit/logger.test.js`.
  * Logging Architecture: Centralized Pino instance, environment-aware log level, custom safe serializers (`req`, `res`, `err`), contextual child loggers (`createChildLogger`), and Fastify `x-request-id` / correlation ID generation.
  * Redaction Coverage: Explicit multi-level fast-redact paths across top-level, nested, and header targets for authorization headers, cookies, API keys, bearer tokens, OAuth client secrets, private keys, GitHub tokens, session secrets, master encryption keys, passwords, candidate PII (email, phone, ssn), and raw source code/resumes.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm test` -> PASS (13/13 tests passed across 2 suites)
    * `node scratch/test-lifecycle.js` -> PASS (Structured logging on boot, request correlation, clean graceful shutdown)
* **P1-003 (PostgreSQL & Drizzle ORM Foundation - Live Supabase Verified)**:
  * Files Created / Updated: `src/db/index.js`, `src/db/migrate.js`, `src/db/schema.js`, `drizzle.config.js`, `drizzle/.gitkeep`, `src/config/env.js`, `src/utils/logger.js`, `package.json`, `tests/unit/db.test.js`, `tests/integration/db.test.js`.
  * Dependencies Added: `pg` (v8.23.0), `drizzle-orm` (v0.45.2), `drizzle-kit` (v0.31.10), `@types/pg` (v8.23.1).
  * npm Scripts Added: `db:generate`, `db:migrate`, `db:check`, `db:studio`, `test:unit`, `test:integration`.
  * Database Architecture: Centralized `pg.Pool` connection pool with auto-SSL/TLS resolution for cloud hosts, statement timeout handling (10s), `parseSanitizedDbUrl` metadata extractor, Drizzle ORM initialization, `checkDatabaseHealth` probe (`SELECT 1`), and `closeDatabase` lifecycle drain.
  * Live Supabase Database Verification (100% VERIFIED):
    * Reached managed PostgreSQL database on host `db.dsglltpfahfeadedvimu.supabase.co` on port `5432`.
    * Engine verified: **PostgreSQL 17.6** on x86_64-pc-linux-gnu.
    * Database probe: `SELECT 1 AS alive` executed and verified through both `pg.Pool` and Drizzle ORM.
    * Real Transaction & Migration: Verified transactional DDL (`CREATE TABLE`), DML (`INSERT`/`SELECT`), and cleanup (`DROP TABLE`) with 0 residual tables left.
    * Programmatic Migrations: `runMigrations()` (`npm run db:migrate`) connected, verified, and exited cleanly.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run test:unit` -> PASS (24/24 unit tests passed across 3 suites)
    * `npm run test:integration` -> PASS (5/5 live integration tests passed against Supabase)
    * `npm test` -> PASS (29/29 total tests passed across 4 suites)
    * `npm run db:check` -> PASS (Drizzle Kit config loaded and verified)
* **P1-004A (Core Database Schema Architectural Review & Approval Gate)**:
  * Artifact Created / Updated: `docs/schema-review.md`.
  * Entities Evaluated: `tenants`, `users`, `sessions`, `audit_logs`.
  * Resolved Review Issues:
    1. **Dedicated Audit Sanitization**: Separated audit persistence rules from Pino logger; defined prohibited/permitted field allowlists and 16 KB payload limit.
    2. **PostgreSQL Session Expiration**: Documented query-level active check (`WHERE expires_at > NOW()`) and indexed background cleanup sweeps.
    3. **Index Optimization**: Removed redundant indexes (`idx_tenants_slug`, `idx_users_status`, `idx_sessions_tenant_user`); verified all remaining indexes map to concrete query patterns.
    4. **Audit Retention vs Tenant Deletion**: Classified as `OPEN POLICY DECISION (Tenant Hard Deletion Audit Retention Policy)`. Documented MVP decision (`CASCADE` on tenant hard delete, `SET NULL` on user delete) and post-cancellation archival path.
  * Approval Status: **APPROVED** (100% ready for P1-004 implementation).
* **P1-004 (Core Identity Database Schema - Live Supabase Verified)**:
  * Files Created / Updated: `src/db/schema.js`, `src/utils/audit-sanitizer.js`, `drizzle/0000_familiar_wrecker.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0000_snapshot.json`, `tests/unit/audit-sanitizer.test.js`, `tests/integration/identity-schema.test.js`.
  * Schema Objects Created:
    * **Enums**: `tenant_tier` (`'FREE'`, `'PRO'`, `'ENTERPRISE'`), `user_role` (`'OWNER'`, `'MEMBER'`, `'READONLY'`), `user_status` (`'ACTIVE'`, `'SUSPENDED'`, `'DELETED'`).
    * **Tables**: `tenants`, `users`, `sessions`, `audit_logs`.
    * **Constraints**: `tenants_slug_unique` (`UNIQUE (slug)`), `users_tenant_email_unique` (`UNIQUE (tenant_id, email)`).
    * **Foreign Keys**: `users.tenant_id -> tenants.id` (`CASCADE`), `sessions.user_id -> users.id` (`CASCADE`), `sessions.tenant_id -> tenants.id` (`CASCADE`), `audit_logs.tenant_id -> tenants.id` (`CASCADE`), `audit_logs.user_id -> users.id` (`SET NULL`).
    * **Indexes**: `idx_users_tenant_id` (`users.tenant_id`), `idx_sessions_user_id` (`sessions.user_id`), `idx_sessions_expires_at` (`sessions.expires_at`), `idx_audit_logs_tenant_created` (`audit_logs (tenant_id, created_at DESC)`), `idx_audit_logs_tenant_event` (`audit_logs (tenant_id, event_type)`), `idx_audit_logs_request_id` (`audit_logs.request_id`).
  * Live Supabase PostgreSQL Migration: Generated `drizzle/0000_familiar_wrecker.sql` via `drizzle-kit generate` and executed against managed Supabase PostgreSQL 17.6 (`npm run db:migrate` -> exit code 0, 7.35s).
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run test:unit` -> PASS (30/30 unit tests passed across 4 suites)
    * `npm run test:integration` -> PASS (13/13 live integration tests passed against Supabase across 2 suites)
    * `npm test` -> PASS (43/43 total tests passed across 6 suites)
    * `npm run db:check` -> PASS (Drizzle Kit config and schema snapshot verified)
* **P1-005 (API Error Handling, Validation Middleware & Health Endpoints - Verified)**:
  * Files Created / Updated: `src/errors/index.js`, `src/middleware/validate.js`, `src/plugins/error-handler.js`, `src/routes/health.routes.js`, `src/app.js`, `docs/architecture.md`, `tests/unit/errors.test.js`, `tests/unit/validate.test.js`, `tests/unit/app.test.js`, `tests/integration/health.test.js`.
  * Architecture Implemented:
    * **Centralized Error Model**: `AppError` base class and domain derivatives (`ValidationError` 400, `AuthenticationError` 401, `AuthorizationError` 403, `NotFoundError` 404, `ConflictError` 409, `RateLimitError` 429, `DependencyError` 503, `InternalServerError` 500).
    * **Zod Middleware**: Reusable `validateRequest` (preHandler for `body`, `query`, `params`, `headers`) and `validateResponse` (preSerialization contract enforcement).
    * **Health & Liveness Endpoints**: `GET /livez` (zero-dependency process liveness probe) and `GET /healthz` (PostgreSQL connection pool readiness check).
    * **Request Correlation**: Propagates `x-request-id` / `x-correlation-id` through incoming requests, Pino logs, outgoing response headers, and error envelopes.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run test:unit` -> PASS (48/48 unit tests passed across 6 suites)
    * `npm run test:integration` -> PASS (16/16 live integration tests passed across 3 suites)
    * `npm test` -> PASS (64/64 total tests passed across 9 suites)
    * `npm run db:check` -> PASS (Drizzle Kit schema and config verified)
* **P1-003-A (Aiven PostgreSQL Development Database Migration - Verified)**:
  * Database Environment: Transitioned active development database to managed **Aiven Free PostgreSQL** (PostgreSQL 18.6 on x86_64-pc-linux-gnu).
  * Supabase Retention: Retained previously verified Supabase database as historical verification environment (zero modifications or drops performed).
  * Provider-Neutral SSL Architecture: Updated `src/db/index.js` to eliminate provider-specific hostname checks (`supabase.co`/`supabase.com`), cleanly strip query-level SSL parameters from connection strings to prevent driver conflict, and automatically configure TLS with `rejectUnauthorized: false` for all remote cloud hosts and `sslmode=require` query modes.
  * Connection Pool Tuning: Configured conservative pool sizing (`DATABASE_POOL_MIN=1`, `DATABASE_POOL_MAX=5`) in `src/config/env.js`, ensuring zero connection starvation against Aiven Free's 20-connection ceiling.
  * Environment Isolation: Implemented `.env.local` priority override loading in `src/config/env.js` with Git ignore enforcement in `.gitignore`.
  * Migration Application: Applied existing migration `drizzle/0000_familiar_wrecker.sql` to clean Aiven instance (`npm run db:migrate` -> exit code 0, 2.26s). Verified all 4 tables (`tenants`, `users`, `sessions`, `audit_logs`), 3 enums (`tenant_tier`, `user_role`, `user_status`), and 12 indexes created successfully.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run test:unit` -> PASS (48/48 unit tests passed across 6 suites)
    * `npm run test:integration` -> PASS (16/16 live integration tests passed across 3 suites against Aiven)
    * `npm test` -> PASS (64/64 total tests passed across 9 suites)
    * `npm run db:check` -> PASS (Drizzle Kit config and schema verified)
* **P1-006 (Automated Test Runner & CI Workflow - Verified)**:
  * CI Pipeline Architecture: Authored and validated GitHub Actions CI workflow in `.github/workflows/ci.yml`.
  * Action Versioning: Configured current Node 24-compatible action versions (`actions/checkout@v5` and `actions/setup-node@v7`) eliminating Node 20 runner deprecation warnings, with the application runtime explicitly set to Node.js 22 LTS.
  * Isolation Strategy: Adopted ADR-015 establishing ephemeral native GitHub Actions PostgreSQL 17 service containers (`postgres:17-alpine` on `localhost:5432`) as hermetic test database environments.
  * Automated Verification Steps:
    1. Deterministic dependency installation via `npm ci` with Node.js 22 runtime caching.
    2. Code style validation via `npm run format:check` (Prettier).
    3. Static lint analysis via `npm run lint` (ESLint 9 flat configuration).
    4. Database schema check via `npm run db:check` (Drizzle Kit).
    5. Clean-slate migration execution via `npm run db:migrate` (applies `0000_familiar_wrecker.sql` against empty PostgreSQL instance).
    6. Unit test execution via `npm run test:unit` (48 tests across 6 suites).
    7. Live integration test execution via `npm run test:integration` (16 tests across 3 suites).
    8. Full test suite execution via `npm test` (64 tests across 9 suites).
  * Secret Protection: Standard PR checks require 0 repository secrets, eliminating credential leakage risk and cloud connection quotas.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run test:unit` -> PASS (48/48 unit tests passed across 6 suites)
### Phase 2: Authentication & User Resource Connections (In Progress)
* **P2-001 (AES-256-GCM Secret Encryption Foundation - Verified)**:
  * Files Created / Updated: `src/security/encryption.js`, `src/config/env.js`, `src/errors/index.js`, `src/utils/logger.js`, `.env.example`, `docs/security.md`, `docs/decisions.md` (ADR-016), `tests/unit/encryption.test.js`, `tests/unit/errors.test.js`.
  * Cryptographic Specification Implemented:
    * **Algorithm**: `AES-256-GCM` authenticated symmetric encryption using Node.js native `node:crypto`.
    * **Master Key**: 256-bit (32-byte) key normalization (`normalizeKey`) accepting 64-hex, 44-base64, 32-byte UTF8, or Buffer.
    * **IV / Nonce Generation**: 96-bit (12-byte) cryptographically secure random IV (`crypto.randomBytes(12)`) per encryption operation with strict uniqueness guarantees.
    * **Authentication Tag**: 128-bit (16-byte) GCM authentication tag for tamper detection.
    * **Additional Authenticated Data (AAD)**: Cryptographically binds format version and key version (`v1:<keyVersion>`) to the authentication tag, preventing metadata/version swapping attacks.
    * **Key Versioning & Rotation**: Encrypted payloads identify `keyVersion` (e.g. `'v1'`). Supports multi-key rings (`resolveKey`) and atomic secret rotation (`rotateSecret`).
    * **Payload Formats**: Serializes to compact string (`enc:v1:<keyVersion>:<iv>:<tag>:<ciphertext>`) and structured JSON validated via Zod `EncryptedPayloadSchema`.
    * **Payload Sizing Cap**: Enforces strict 64 KB (65,536 bytes) maximum plaintext cap bounding usage strictly to credentials/tokens (not large files/resumes).
    * **Zero Secret Leakage**: Centralized error mapping with safe `CryptoError` codes (`INVALID_KEY`, `UNKNOWN_KEY_VERSION`, `MALFORMED_PAYLOAD`, `AUTHENTICATION_FAILED`, `PAYLOAD_TOO_LARGE`) and Pino logger redaction ensuring zero plaintext or key exposure in errors/logs.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run test:unit` -> PASS (78/78 unit tests passed across 7 suites)
    * `npm run test:integration` -> PASS (16/16 live integration tests passed across 3 suites)
    * `npm test` -> PASS (94/94 total tests passed across 20 suites)
    * `npm run db:check` -> PASS (Drizzle Kit schema and config verified)
* **P2-002A (Authentication Architecture Review & Approval Gate - Verified)**:
  * Specification Document: Authored comprehensive architecture document `docs/authentication-architecture.md` covering all 19 dimensions.
  * Architecture Decision: Authored ADR-017 (*Authentication Architecture: OAuth 2.1 + PKCE + Server-Side Sessions*), formally superseding provisional ADR-006.
  * Core Architectural Decisions:
    * **Protocol**: Standardized on OAuth 2.1 authorization code flow with mandatory PKCE (`S256` method).
    * **Session Storage (Option A Approved)**: Server-side database sessions utilizing verified P1-004 `sessions` schema where `sessions.id` stores the SHA-256 hash of the 256-bit random session token for O(1) PK lookups with zero schema modifications.
    * **Browser Security**: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` (7 days) cookies with `__Host-` prefix in production.
    * **JWT Rejection**: Formally rejected stateless JWTs for the browser application to ensure instantaneous, zero-latency session revocation on logout, user suspension, or tenant deletion.
    * **Identity Provider Strategy**: GitHub OAuth 2.0 / GitHub App selected as primary IdP with pluggable `IdentityProvider` interface for future Google/OIDC extension.
    * **External Identity Mapping**: External identities anchored on immutable `(provider, provider_user_id)` pairs. P2-002 uses verified GitHub email for initial account creation; multi-IdP account linking defined via future `user_identities` table.
    * **GitHub Login vs GitHub App Separation**: GitHub OAuth login tokens are used solely to read `/user` profile and discarded; GitHub App repository tokens (`ghs_*`) are minted independently via App ID + PEM keys and stored in `resource_connections`.
    * **Tenant Resolution**: Tenant context strictly derived from authenticated session database records, never from untrusted client parameters.
* **P2-002 (OAuth 2.1 & Server-Side Session Authentication - Verified)**:
  * Files Created / Updated:
    * `src/security/providers/base.provider.js`: Pluggable abstract `BaseIdentityProvider` class defining authorization URL generation, code exchange, and profile normalization contracts.
    * `src/security/providers/github.provider.js`: Production GitHub OAuth 2.0 IdP adapter supporting PKCE `S256` code challenge generation, token exchange, and primary verified email extraction.
    * `src/security/oauth-state.js`: High-entropy 32-byte anti-CSRF state token and PKCE verifier generator, sealed inside encrypted `oauth_transit` cookies using authenticated AES-256-GCM.
    * `src/security/session.service.js`: Cryptographic session token generation (256-bit base64url), deterministic SHA-256 ID hashing for O(1) database storage (`sessions.id`), database validation with active expiration filtering (`expires_at > NOW()`), and instantaneous session revocation.
    * `src/security/auth.service.js`: Provider-neutral authentication orchestration service managing OAuth initiation, callback processing, transactional user and personal workspace tenant auto-provisioning with unique slugs, session minting, and audit logging.
    * `src/middleware/auth.middleware.js`: Fastify preHandler hooks for session authentication (`authenticate`), role-based access control (`authorize`), and defense-in-depth CSRF origin validation (`verifyCsrf`).
    * `src/routes/auth.routes.js`: Fastify REST endpoints for `GET /auth/github`, `GET /auth/github/callback`, `GET /auth/me`, and `POST /auth/logout`.
    * `src/app.js`: Registered `@fastify/cookie` and mounted authentication routes.
    * `tests/unit/github-provider.test.js`: 7 unit tests validating GitHub IdP URL construction, code exchange, error handling, and profile extraction.
    * `tests/unit/oauth-state.test.js`: 9 unit tests validating high-entropy state generation, S256 code challenge computation, transit cookie encryption/decryption, wrong key rejection, expired state rejection, and anti-CSRF mismatch rejection.
    * `tests/unit/session.test.js`: 6 unit tests validating 256-bit token entropy, deterministic hashing, and environment-aware cookie options (`__Host-` prefixed secure cookies in production).
    * `tests/integration/auth.test.js`: 9 comprehensive end-to-end integration tests validating:
      1. `GET /auth/github` initiates OAuth 2.1 PKCE flow, returns 302 redirect to GitHub, and sets encrypted transit cookie.
      2. `GET /auth/github/callback` rejects forged/mismatched anti-CSRF state parameter with 401.
      3. `GET /auth/github/callback` exchanges code, extracts verified profile, transactionally provisions new user and workspace tenant, mints session, and sets session cookie.
      4. `GET /auth/me` returns authenticated user, tenant, and session context.
      5. `GET /auth/me` rejects unauthenticated request without session cookie with 401 `UNAUTHENTICATED`.
      6. `GET /auth/me` rejects forged or non-existent session token with 401 `INVALID_SESSION`.
      7. `POST /auth/logout` revokes session in PostgreSQL and clears session cookie.
      8. Re-login for existing user updates session without creating duplicate tenant records.
      9. Suspended user is denied authentication with 403 `ACCOUNT_SUSPENDED`.
      10. `GET /dashboard` rejects unauthenticated requests with 401 `UNAUTHENTICATED`.
      11. `GET /dashboard` returns protected dashboard placeholder (`message`, `user.id`, `user.displayName`, `user.role`, `tenant.id`, `tenant.name`) for authenticated users with zero credential leakage.
      12. `GET /dashboard` enforces tenant trust boundary by ignoring spoofed tenant IDs in query/headers.
      13. `GET /auth/github/callback` redirects to `/dashboard` upon successful browser login.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
    * `npm run test:unit` -> PASS (102/102 unit tests passed across 27 suites)
    * `npm run test:integration` -> PASS (29/29 live integration tests passed across 4 suites)
    * `npm test` -> PASS (131/131 total tests passed across 31 suites)
* **P2-003A (Resource Connection Schema Design Review & Approval - Approved)**:
  * Specification Document: Authored comprehensive architectural review `docs/resource-connections-schema-review.md`.
  * Architecture Decision: Authored ADR-018 (*Resource Connection Data Model: Provider-Neutral Authorization Boundary*) in `docs/decisions.md`.
  * Core Design Resolutions:
    * **Provider-Neutral Model**: Uniform `resource_connections` schema decoupling external authorization from the AI career intelligence engine.
    * **Dual Ownership Boundary**: Bound by `tenant_id` (organization multi-tenant isolation) and `user_id` (human authorizer accountability) with `ON DELETE CASCADE`.
    * **Encrypted Credential Storage**: Native integration with P2-001 AES-256-GCM engine storing compact ciphertext packages (`encrypted_credentials`) with an explicit indexed `key_version` column for high-speed offline key rotation sweeps.
    * **Permissions & Scopes**: Structured `jsonb` array storage (`scopes`) supporting native JSON inspection and zero type-casting friction.
    * **Lifecycle State Machine**: Explicit status enum (`PENDING`, `ACTIVE`, `EXPIRED`, `REVOKED`, `ERROR`, `DISCONNECTED`) with defined disconnect, revoke, and hard-delete semantics.
    * **Uniqueness Constraints**: Enforces `UNIQUE (tenant_id, provider, external_account_id)` to prevent duplicate account bindings per workspace.
    * **Resource Decoupling**: Repositories and file trees are modeled as downstream child entities (`repositories`) referencing `connection_id`.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
    * `npm test` -> PASS (131/131 total tests passed across 31 suites)
* **P2-003 (Resource Connections Database Schema & Live Verification)**:
  * Schema & Migration:
    * Implemented `resource_connections` table, `resource_provider`, `connection_auth_type`, and `resource_connection_status` PostgreSQL enums in `src/db/schema.js`.
    * Generated migration `drizzle/0001_funny_human_fly.sql` using Drizzle Kit.
    * Applied migration to active Aiven PostgreSQL development database (`npm run db:migrate`).
  * Automated Tests:
    * `tests/unit/resource-connections.test.js`: 9 unit tests validating schema exports, all 21 columns, enum values, credential encryption, key-version consistency, JSONB scopes parsing, and metadata safety bounds.
    * `tests/integration/resource-connections-schema.test.js`: 9 live PostgreSQL integration tests validating:
      1. PostgreSQL metadata: table exists, enums registered, all 21 columns and types present, unique and B-tree indexes created.
      2. CRUD operations: create, read, update, delete with timestamp and status tracking.
      3. Strict multi-tenant isolation: Tenant A queries/mutations cannot access Tenant B connections.
      4. Ownership foreign keys: invalid `tenant_id` and `user_id` rejected with FK violation error.
      5. Uniqueness constraint: duplicate `(tenant_id, provider, external_account_id)` rejected; distinct tenants with identical external IDs allowed.
      6. AES-256-GCM encryption & decryption: ciphertext at rest contains zero plaintext secrets, decrypts cleanly, and tampered ciphertext is rejected.
      7. Status lifecycle state transitions: `PENDING` -> `ACTIVE` -> `EXPIRED` -> `REVOKED` -> `ERROR` -> `DISCONNECTED`.
      8. Cascade deletion: deleting user or tenant automatically cascades and purges resource connections.
      9. Audit logging boundary: connection lifecycle events pass through dedicated sanitizer stripping all tokens and credentials.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
    * `npm run test:unit` -> PASS (111/111 unit tests passed across 31 suites)
    * `npm run test:integration` -> PASS (38/38 live integration tests passed across 5 suites)
    * `npm test` -> PASS (149/149 total tests passed across 36 suites)
* **P2-004A (Resource Connector Architecture Review & Approval - Approved)**:
  * Specification Document: Authored comprehensive architectural specification `docs/resource-connector-architecture.md`.
  * Architecture Decision: Authored ADR-019 (*Provider-Neutral Resource Connector Architecture*) in `docs/decisions.md`.
  * Core Design Resolutions:
    * **Base Interface (`BaseResourceConnector`)**: Defined abstract class with required methods (`getCapabilities`, `validate`, `getAccount`) and capability-guarded methods (`listResources`, `getResource`, `refreshCredentials`, `revokeAccess`).
    * **Capability Model (`CONNECTOR_CAPABILITIES`)**: Frozen enumeration supporting explicit capability advertisement across diverse provider types (GitHub, GitLab, Google Drive, OneDrive, Notion).
    * **Connector Registry (`ConnectorRegistry`)**: Centralized singleton registry for provider-to-connector mapping and capability introspection.
    * **Connector Context (`ConnectorContext`)**: Immutable server-minted context enforcing `tenantId`, `userId`, `connectionId`, `scopes`, and `requestId`.
    * **Transient Credential Boundary**: Decrypts credentials in runtime memory only during connector invocations, ensuring zero plaintext leakage in logs, global state, or audit trails.
    * **Domain Model Normalization**: Defined `NormalizedAccount`, `NormalizedResource`, and `ConnectorOperationResult` data structures.
    * **Error Taxonomy**: Unified error classes derived from `AppError` with clear HTTP statuses and retryability semantics.
    * **Cursor Pagination & Resilience**: Standardized opaque cursor pagination (capped at 100 items), 10-second timeouts, and bounded exponential backoff for idempotent reads.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
    * `npm test` -> PASS (149/149 total tests passed across 36 suites)
* **P2-004 (Provider-Neutral Resource Connector Core & Registry)**:
  * Framework Components:
    * `src/connectors/base/resource-connector.js`: Abstract `BaseResourceConnector` with mandatory `validate()`, `getAccount()`, `getCapabilities()`, and capability-guarded `listResources()`, `getResource()`, `refreshCredentials()`, `revokeAccess()`.
    * `src/connectors/base/capabilities.js`: Immutable frozen `CONNECTOR_CAPABILITIES` enum.
    * `src/connectors/base/context.js`: `createConnectorContext` factory enforcing UUID validation, provider enums, and context immutability.
    * `src/connectors/base/models.js`: Normalized domain model factories (`createNormalizedAccount`, `createNormalizedResource`, `createOperationResult`, `createPaginationOptions`, `createPaginatedResult`) with 100-item page capping.
    * `src/connectors/registry/connector-registry.js`: `ConnectorRegistry` class and singleton `connectorRegistry` managing provider-to-connector mapping and duplicate protection.
    * `src/connectors/errors/connector-errors.js`: Unified error taxonomy (`ConnectionNotFoundError`, `ConnectionInactiveError`, `ConnectorAuthError`, `InsufficientScopeError`, `ProviderRateLimitError`, `ProviderUnavailableError`, `ResourceNotFoundError`, `UnsupportedCapabilityError`).
    * `src/connectors/testing/mock-connector.js`: In-memory `MockResourceConnector` for deterministic contract testing with zero external I/O.
    * `src/connectors/index.js`: Clean root module re-export.
  * Automated Tests:
    * `tests/unit/connectors.test.js`: 32 comprehensive unit tests covering:
      1. BaseResourceConnector instantiation prevention and capability guarding.
      2. Capabilities enum immutability and valid identifiers.
      3. Context creation, UUID validation, requestId fallback, and immutability.
      4. Registry registration, resolution, duplicate conflict handling, override flag, and capability introspection.
      5. Error taxonomy HTTP status mappings, retryability flags, rate-limit retryAfter preservation, and message safety.
      6. Normalized domain models (Account, Resource, OperationResult).
      7. Pagination boundaries (default 50, maximum 100 cap, invalid limit rejection).
      8. Mock connector complete lifecycle execution and error simulation.
      9. Security boundaries: context does not store credentials, registry does not retain credentials, and connector instances remain stateless.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
    * `npm run test:unit` -> PASS (143/143 unit tests passed across 41 suites)
    * `npm run test:integration` -> PASS (38/38 live integration tests passed across 5 suites)
    * `npm test` -> PASS (181/181 total tests passed across 46 suites)
* **P2-005A (Resource Connection Lifecycle API Review & Approval - Approved)**:
  * Specification Document: Authored architectural specification `docs/resource-connection-api-review.md`.
  * Architecture Decision: Authored ADR-020 (*Resource Connection Lifecycle API Architecture*) in `docs/decisions.md`.
  * Core Design Resolutions:
    * **5-Tier Architectural Separation**: Strict isolation between route validation (`src/routes/connections.routes.js`), service orchestration & decryption (`src/services/connection.service.js`), multi-tenant data access (`src/db/repositories/`), registry dispatch (`src/connectors/registry/`), and provider I/O (`src/connectors/`).
    * **Mandatory Tenant Query Scoping**: Enforced `WHERE tenant_id = req.tenant.id AND id = :id` for all lookups; returns 404 on foreign tenant IDs to eliminate IDOR and tenant enumeration.
    * **Role & Creator Ownership Matrix**: All workspace members (`OWNER`, `MEMBER`, `READONLY`) can list and view connection metadata; mutating actions (`test`, `disconnect`, `delete`) require either workspace `OWNER` role or being the **Connection Creator** (`connection.userId === req.user.id`).
    * **Zero Credential Exposure**: Response schemas (`ConnectionSummary`, `ConnectionDetail`, `ConnectionListResponse`, `ConnectionTestResult`, `ConnectionMutationResult`) strictly omit all credentials, keys, and tokens.
    * **Health Probe Endpoint (`POST /connections/:id/test`)**: Decrypts credentials transiently, invokes `connector.validate()`, and mutates safe operational metadata (`last_validated_at`, `status`, `last_error_code`, `last_error_at`) alongside structured audit logging.
    * **Disconnect vs. Delete Semantics**: `POST /disconnect` performs best-effort upstream revocation, immediately overwrites `encrypted_credentials` with dummy scrubbed ciphertext, and sets status to `DISCONNECTED` (idempotent); `DELETE` permanently purges row with foreign key cascades.
    * **CSRF & Transport Security**: Strict `POST`/`DELETE` verb usage, `SameSite=Lax` cookies, and `application/json` payload enforcement.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
    * `npm test` -> PASS (181/181 total tests passed across 46 suites)
* **P2-005 (Resource Connection Lifecycle API Endpoints & Service)**:
  * API & Service Components:
    * `src/routes/connections.routes.js`: Fastify plugin registering `GET /connections`, `GET /connections/:id`, `POST /connections/:id/test`, `POST /connections/:id/disconnect`, `DELETE /connections/:id` with `authenticate` and `verifyCsrf` hooks.
    * `src/routes/connections.schemas.js`: Strict Zod validation schemas (`ConnectionSummarySchema`, `ConnectionDetailSchema`, `ConnectionListResponseSchema`, `ConnectionTestResultSchema`, `ConnectionMutationResultSchema`, `ConnectionListQuerySchema`, `ConnectionParamsSchema`).
    * `src/services/connection.service.js`: Complete business service handling creator & owner authorization, transient AES-256-GCM decryption, 10 req/min health test rate limiting, lifecycle guards, connector invocation, and sanitized audit logging.
    * `src/db/repositories/connection.repository.js`: Encapsulated database repository enforcing `WHERE tenant_id = req.tenant.id` on all queries.
    * `src/app.js`: Registered `connectionsRoutes` under `/connections` prefix.
  * Automated Tests:
    * `tests/unit/connection-service.test.js`: 14 unit tests covering role/creator authorization matrix (`OWNER`, creator `MEMBER`, non-creator `MEMBER` 403, `READONLY` 403), 10 req/min rate limiting, lifecycle state transitions (`DISCONNECTED` 409, `REVOKED` 401), model sanitization (zero credential leakage), and Zod schema boundaries.
    * `tests/integration/connections.test.js`: 20 live integration tests against Aiven PostgreSQL covering unauthenticated 401, listing with pagination and filters, detail model, cross-tenant 404 isolation, health testing with `MockResourceConnector`, status mutation (`ACTIVE`, `REVOKED`, `ERROR`), 403 for non-creator member/readonly, credential scrubbing on disconnect, idempotency, hard deletion, and audit logging.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
    * `npm test` -> PASS (215/215 total tests passed across 58 suites)
* **P2-006 (Global Resource Tenant Isolation & Authorization Hardening)**:
  * Security Architecture Components:
    * `src/middleware/auth.middleware.js`: Hydrated and froze immutable request context (`req.auth = Object.freeze({ userId, tenantId, sessionId, role })`), preventing client query/header/body injection attacks from spoofing tenant or identity context.
    * `src/security/resource-authorization.js`: Implemented centralized `authorizeResourceAccess` (verifying tenant matching with 404 default-deny, `READONLY` 403 blocks on mutations, and non-creator `MEMBER` 403 blocks on mutations) and `createTrustedConnectorContext` (minting immutable `ConnectorContext` only after authorization).
    * `src/db/repositories/connection.repository.js`: Added runtime `assertTenantId` assertions across all repository functions (`listConnectionsByTenant`, `findConnectionByIdAndTenant`, `updateConnectionMetadata`, `disconnectConnectionRecord`, `deleteConnectionRecord`, `writeAuditRecord`), preventing any un-scoped queries.
    * `src/services/connection.service.js`: Integrated `authorizeResourceAccess` and `createTrustedConnectorContext` into all service lifecycles.
  * Automated Tests:
    * `tests/unit/tenant-isolation.test.js`: 20 unit tests verifying cross-tenant default-deny (404), RBAC read/mutate rules, creator ownership, trusted connector context minting, and repository guard assertions.
    * `tests/integration/tenant-isolation-hardening.test.js`: 9 live integration tests against PostgreSQL proving cross-tenant 404 default deny across all operations, resistance against query (`?tenant_id=...`), header (`X-Tenant-Id: ...`), and body spoofing, and an explicit negative regression test proving that repository tenant scoping prevents data leakage.
  * Documentation Updates:
    * Updated `docs/security.md` Section 5 with complete 5-layer tenant-isolation enforcement model.
    * Updated `docs/architecture.md` Section 6 with platform-level isolation boundaries.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
    * `npm run test:unit` -> PASS (177/177 unit tests passed across 53 suites)
    * `npm run test:integration` -> PASS (67/67 live integration tests passed across 15 suites)
    * `npm test` -> PASS (244/244 total tests passed across 68 suites)
* **P3-001A (GitHub App Authentication & Cryptographic Key Management Architecture Review)**:
  * Deliverable: Authored [`docs/github-app-auth-architecture-review.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/github-app-auth-architecture-review.md).
  * Architecture Decision: Authored ADR-021 (*GitHub App Authentication & Private Key Management Architecture*) in `docs/decisions.md`.
  * Core Design Resolutions:
    * **App Master Key Isolation**: Enforced that the GitHub App Private Key is an Application-Level Master Secret stored in environment variables (`GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_PRIVATE_KEY_BASE64`), never stored in PostgreSQL or returned to clients, and strictly redacted from Pino logs and error messages.
    * **RS256 JWT Generation**: Native `node:crypto` signing with 60-second backdated `iat` (clock skew buffer) and 9-minute `exp` (under GitHub's 10-minute maximum).
    * **Installation Token Minting & Scoping**: `POST /app/installations/:id/access_tokens` minting short-lived `ghs_*` tokens (60-minute TTL) with fine-grained least privilege (`contents: read`, `metadata: read`) restricted to user-selected repositories.
    * **Partitioned In-Memory Token Caching**: In-memory cache partitioned by `gh_token:${tenantId}:${installationId}:${repoScopeHash}` with a **5-minute proactive buffer** (`expires_at - 300s`) preventing mid-operation expiration.
    * **Seamless Auto-Refresh & Revocation**: Transparent lazy token refresh; upstream `DELETE /installation/token` revocation and cache eviction on disconnect.
    * **Rate-Limit Management**: Automatic tracking of `x-ratelimit-remaining` and proactive backoff when remaining quota <= 10.
    * **Zero-Downtime Key Rotation**: Seamless dual-key rotation via environment variables without customer re-authentication or DB migration.
* **P3-001 (GitHub App Authentication Module)**:
  * Implemented Modules:
    * `src/connectors/github/auth.js`: Implemented `GitHubAppAuthManager`, `normalizeAppPrivateKey`, and `generateAppJwt`. Features: RS256 JWT signing (9-minute validity, 60s backdated clock skew buffer), short-lived installation access token acquisition (`POST /app/installations/:id/access_tokens`), least-privilege scoping (`contents:read`, `metadata:read`), concurrent request coalescing (anti-stampede via single-flight map), bounded exponential backoff on 429/5xx retries, and upstream token revocation (`DELETE /installation/token`).
    * `src/connectors/github/token-cache.js`: Implemented `GitHubTokenCache` and `buildTokenCacheKey`. Features: multi-tenant partitioned cache keys (`gh_token:tenantId:installationId:repoHash`), 5-minute proactive refresh buffer (`expires_at - 300s`), and explicit eviction on disconnect/revocation.
    * `src/connectors/github/errors.js`: Implemented error classes (`GitHubAuthError`, `GitHubInstallationNotFoundError`, `GitHubRateLimitError`, `GitHubApiError`) and safe response parser `parseGitHubErrorResponse`.
    * `src/config/env.js` & `.env.example`: Added strongly-typed Zod environment configuration for `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_PRIVATE_KEY_BASE64`, and `GITHUB_APP_WEBHOOK_SECRET`.
  * Automated Tests:
    * `tests/unit/github-app-auth.test.js`: 21 unit tests verifying multiline and base64 PEM normalization, escaped newline handling, RS256 JWT claim verification and signature validation, multi-tenant partitioned cache isolation, 5-minute safety buffer expiry, least-privilege repository scoping, concurrent request coalescing (5 simultaneous calls -> exactly 1 upstream fetch), upstream 401/404/429/503 error mapping, bounded exponential backoff retries, upstream revocation, and zero private key leakage.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
    * `npm run test:unit` -> PASS (198/198 unit tests passed across 62 suites)
    * `npm run test:integration` -> PASS (67/67 live integration tests passed across 15 suites)
    * `npm test` -> PASS (265/265 total tests passed across 77 suites)
* **P3-002A (GitHub App Installation Linking Architecture Review)**:
  * Deliverable: Authored [`docs/github-app-installation-linking-review.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/github-app-installation-linking-review.md).
  * Architecture Decision: Authored ADR-022 (*GitHub App Installation Linking Architecture*) in `docs/decisions.md`.
  * Core Design Resolutions:
    * **User & Tenant Binding**: Strict enforcement of immutable request session context (`req.auth.userId`, `req.auth.tenantId`). `READONLY` workspace members receive 403 Forbidden.
    * **Cryptographic Anti-CSRF State**: HMAC-SHA256 signed transit cookie (`__Host-gh_install_state`) binding `userId`, `tenantId`, and a 256-bit `nonce` with a 10-minute TTL and single-use invalidation.
    * **Direct Server-Side Verification**: Backend mints RS256 App JWT and verifies installation metadata against `api.github.com/app/installations/:id` before creating or updating any records.
    * **Multi-Tenant Exclusive Ownership**: A GitHub installation ID can belong to only one tenant workspace across the platform. Attempts to link an already bound installation to a different tenant are rejected with **`409 Conflict` (`INSTALLATION_ALREADY_LINKED`)**.
    * **Idempotent Connection Persistence**: Idempotently upserts `resource_connections` for existing installations within the same tenant.
    * **Zero Permanent Credential Storage**: App private key remains host-level environment configuration; installation tokens remain ephemeral and in-memory; `encrypted_credentials` stores an AES-256-GCM encrypted metadata payload.
* **P3-002 (GitHub App Installation Linking Flow)**:
  * Implemented Modules:
    * `src/services/github-installation.service.js`: Implemented `GitHubInstallationService` containing `createInstallationState`, `validateInstallationState`, `verifyGitHubInstallation`, and `linkInstallation`.
    * `src/routes/integrations.routes.js`: Implemented Fastify plugin for `GET /integrations/github/install` and `GET /integrations/github/install/callback`.
    * `src/routes/integrations.schemas.js`: Implemented Zod schemas for callback query parameters (`installation_id`, `state`, `setup_action`).
    * `src/db/repositories/connection.repository.js`: Added `findConnectionByInstallationId` and `upsertGitHubAppConnection` with tenant boundary safety.
    * `src/app.js`: Registered `integrationsRoutes` under prefix `/integrations`.
  * Automated Tests:
    * `tests/unit/github-installation-service.test.js`: 16 unit tests covering state creation/validation, signature verification, token expiration, user/tenant session binding, GitHub installation verification (404/401/suspended/insufficient permissions), cross-tenant collision detection (409 Conflict), idempotent same-tenant upsert, AES-256-GCM encrypted payload, and zero master secret leakage.
    * `tests/integration/github-installation-linking.test.js`: 8 live PostgreSQL integration tests covering unauthenticated rejection (401), READONLY role rejection (403), transit cookie setting & GitHub redirect (302), missing/invalid state rejection (400/401), end-to-end installation linking with DB persistence and audit logging, idempotent repeat callback, and cross-tenant collision rejection (409 Conflict).
  * Live Post-Installation Verification:
    * Executed live database verification gate for real GitHub App installation (`http://localhost:3000/dashboard?connection=linked`).
    * Verified Database Record:
      - `provider`: `GITHUB_APP`
      - `auth_type`: `APP_INSTALLATION`
      - `installation_id`: `155430459`
      - `external_account_id`: `97516061`
      - `external_account_name`: `vishu1803`
      - `status`: `ACTIVE`
      - `scopes`: `["contents:read", "metadata:read"]`
      - `metadata.repositorySelection`: `all`, `metadata.targetType`: `User`
      - `encrypted_credentials`: AES-256-GCM encrypted compact string (`enc:v1:v1:...`); verified zero `ghs_*` tokens, zero RSA private keys, and zero App JWTs at rest.
      - `tenant_id` & `user_id`: strictly bound to authenticated workspace tenant (`vishwanath-nishad-a7da33`) and member (`OWNER`).
      - Audit trail: `github.installation_linked` recorded with zero sensitive data.
    * Quality & Integrity Checks:
      - `npm test` -> PASS (289/289 tests passed across 85 suites)
      - `npm run lint` -> PASS (0 errors, 0 warnings)
      - `npm run format:check` -> PASS (All files use Prettier code style)
      - `npm run db:check` -> PASS (Drizzle Kit schema check verified)
* **P3-003A (GitHub App Webhook Architecture Review - Approved)**:
  * Specification Document: Authored [`docs/github-webhook-architecture.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/github-webhook-architecture.md).
  * Architecture Decision: Authored ADR-023 (*GitHub Webhook Processing Architecture*) in `docs/decisions.md`.
  * Core Design Resolutions:
    * **Independent Cryptographic Gateway (`POST /webhooks/github`)**: Bypasses browser session authentication (`req.auth`) and protects the endpoint via dedicated `verifyWebhookSignature` middleware validating `X-Hub-Signature-256` HMAC-SHA256 against raw request body Buffer using constant-time comparison (`crypto.timingSafeEqual`).
    * **Raw Body Buffer Verification**: Computes HMAC strictly over original raw request body bytes before JSON parsing to prevent false signature rejections or timing attacks.
    * **Secret Isolation**: `GITHUB_WEBHOOK_SECRET` is host-level configuration stored in environment variables, never persisted in PostgreSQL, and redacted in Pino logging streams.
    * **Authoritative Tenant Resolution**: Tenant ownership is resolved strictly through database queries (`SELECT tenant_id FROM resource_connections WHERE provider = 'GITHUB_APP' AND installation_id = :id`). External payload tenant identifiers are never accepted.
    * **Direct State Synchronization & Token Cache Eviction**:
      - `installation.deleted` -> marks connection `REVOKED`, sets `last_error_code = 'APP_UNINSTALLED'`, and immediately calls `tokenCache.evict(tenantId, installationId)`.
      - `installation.suspend` -> marks connection `REVOKED`, sets `last_error_code = 'INSTALLATION_SUSPENDED'`, and evicts token cache.
      - `installation.unsuspend` -> restores connection to `ACTIVE`.
      - `installation_repositories.removed` / `.added` -> updates `metadata.repositorySelection` and clears relevant token cache partitions.
    * **Idempotency & Replay Protection**: Tracks delivery GUIDs (`X-GitHub-Delivery`) with a 24-hour in-memory TTL cache (`WebhookDeliveryCache`); duplicate deliveries return `200 OK` without executing duplicate side effects. Monotonic status transitions prevent out-of-order event regression.
    * **Asynchronous Heavy Processing Boundary**: Lightweight connection mutations and cache invalidations complete synchronously (<200ms). Heavy repository AST extraction, directory tree crawling, and commit parsing (Phase 4+) are decoupled into background job queues.
    * **Zero Phase 3 Schema Changes**: Adopts in-memory delivery tracking and structured audit logging (`audit_logs`), requiring zero new database tables or migrations in Phase 3.
* **P3-003 (Implement GitHub Webhook Handler - Completed)**:
  * Route & Middleware:
    * `src/routes/webhooks.routes.js`: Fastify route plugin for `POST /webhooks/github`. Enforces 10 MB payload limit, captures raw request body Buffer for HMAC verification via scoped Content-Type parser, and operates independently from browser sessions (`req.auth`).
    * `src/security/webhook-signature.js`: Implemented `verifyWebhookSignature` (HMAC-SHA256 with `crypto.timingSafeEqual` constant-time comparison) and `generateWebhookSignature` test helper.
    * `src/services/webhook-delivery-cache.js`: Implemented `WebhookDeliveryCache` (in-memory bounded 24-hour TTL cache for `X-GitHub-Delivery` deduplication).
    * `src/services/github-webhook.service.js`: Implemented `GitHubWebhookService` managing header verification, deduplication, authoritative database tenant resolution via `installation.id`, lifecycle transitions (`installation.deleted` -> REVOKED, `installation.suspend` -> REVOKED, `installation.unsuspend` -> ACTIVE), repository selection updates (`installation_repositories.added`/`removed`), in-memory token cache eviction (`GitHubTokenCache`), monotonic inactive state guards, unlinked installation handling, and audit trail generation.
    * `src/app.js`: Registered `webhooksRoutes` under prefix `/webhooks`.
  * Security Invariants Enforced:
    * Raw body Buffer verification (rejects re-serialized JSON tampering).
    * Zero secret or raw signature leakage in audit logs and logging streams.
    * Strict tenant boundary resolution (tenant context derived exclusively from verified database lookups, never accepted from request bodies).
    * Bounded in-memory delivery deduplication (24h TTL) preventing duplicate side effects.
    * Immediate partitioned token cache invalidation on installation deletion, suspension, or repository removal.
  * Automated Tests:
    * `tests/unit/webhook-signature.test.js`: 7 unit tests covering valid Buffer/string payloads, missing signature (401), malformed signatures (401), tampered payloads (401), wrong secret (401), missing server secret (500), and Unicode/whitespace stability.
    * `tests/unit/github-webhook.test.js`: 12 unit tests covering delivery caching & TTL expiry, FIFO eviction, missing event/delivery headers (400), invalid signatures (401), ping events (200), duplicate delivery deduplication (200 duplicate), unsupported events (200 ignored), lifecycle transitions (`deleted`, `suspend`, `unsuspend`), repository selection updates, monotonic state guards on revoked connections, and unlinked installation safety.
    * `tests/integration/github-webhook.test.js`: 8 live PostgreSQL integration tests covering unauthenticated access with valid HMAC-SHA256 signature, missing/invalid signature rejection (401), missing header rejection (400), ping event processing, `installation.deleted` status & audit log verification, `installation.suspend` / `unsuspend` lifecycle verification, `installation_repositories` metadata update & token cache eviction, repeat delivery deduplication without duplicate DB updates, and cross-tenant safety.
  * Known Phase 3 Limitation:
    * Webhook delivery deduplication is process-local in-memory and does not provide distributed cross-instance deduplication. Centralized Redis delivery tracking will be introduced in Phase 14+.
  * Quality & Integrity Checks:
    * `npm run test:unit` -> PASS (235/235 tests passed)
    * `npm run test:integration` -> PASS (83/83 tests passed)
    * `npm test` -> PASS (318/318 tests passed across 92 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
* **P3-002A Follow-Up (Fix GitHub App Setup Update Callback — Completed & Live Verified)**:
  * Problem Addressed: Real GitHub App Setup URL invocations following repository permission changes on GitHub arrive as `GET /integrations/github/install/callback?installation_id=...&setup_action=update` without an application `state` parameter, previously triggering a 400 `VALIDATION_ERROR`.
  * Security & Architecture Invariants Enforced:
    * **Strict Initial Flow Protection**: Initial installation (`setup_action=install` or undefined) continues to strictly mandate the `state` query parameter and HMAC-SHA256 signed transit cookie; missing/invalid states are rejected with 400/401.
    * **Authenticated Update Flow**: `setup_action=update` allows absent `state` parameter only when authenticated session (`req.auth`) is present. Rejects `READONLY` users with 403 Forbidden.
    * **Server-Side Identity Verification**: Backend verifies installation permissions (`contents:read`, `metadata:read`) directly with GitHub via App RS256 JWT before applying any updates.
    * **Strict Tenant Ownership Enforcement**: The existing connection must already exist in PostgreSQL and belong to `req.auth.tenantId`. Missing connections or cross-tenant lookups return 404 (preventing foreign tenant information disclosure and unauthorized connection claiming).
    * **Metadata Refresh & Token Cache Invalidation**: Updates `metadata.repositorySelection`, refreshes `last_validated_at`, reactivates revoked connections, evicts `GitHubTokenCache` partitions for `(tenantId, installationId)`, and writes `github.installation_updated` audit records.
    * **Safe Redirection**: Redirects user to `/dashboard?connection=updated` (vs `/dashboard?connection=linked` on initial install).
  * Files Modified:
    * `src/routes/integrations.schemas.js`: Made `state` optional at schema level; added `setup_action` enum validation (`['install', 'update', 'request']`).
    * `src/services/github-installation.service.js`: Added `updateInstallation` method, accepted `tokenCache` in constructor, and added automatic token cache eviction upon installation link or update.
    * `src/routes/integrations.routes.js`: Added conditional flow handling for `setup_action=update` vs initial install, and safe transit cookie invalidation.
    * `src/app.js`: Passed `tokenCache` into `integrationsRoutes`.
    * `tests/unit/github-installation-service.test.js`: Added 5 unit tests for `updateInstallation` (metadata update, role checks, 404 on missing/foreign tenant, disconnected rejection, token cache eviction).
    * `tests/integration/github-installation-linking.test.js`: Added 4 live integration tests against PostgreSQL covering update callback redirect, metadata update, 404 on missing/cross-tenant connections, and initial state requirement enforcement.
  * Live Database Regression Verification:
    * Verified against real live database connection for installation `155430459` belonging to live tenant: simulated `GET /integrations/github/install/callback?installation_id=155430459&setup_action=update` with authenticated session returned **`302 Found` -> `/dashboard?connection=updated`**.
  * Verification Commands:
    * `npm run test:unit` -> PASS (240/240 tests passed across 74 suites)
    * `npm run test:integration` -> PASS (87/87 tests passed across 19 suites)
    * `npm test` -> PASS (327/327 tests passed across 93 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
* **P3-004A (GitHub Read Connector Architecture Review — Completed & Approved)**:
  * Deliverable: Authored [`docs/github-read-connector-architecture.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/github-read-connector-architecture.md).
  * Architecture Decision: Authored ADR-024 (*GitHub Read Connector Architecture*) in `docs/decisions.md`.
  * Core Design Resolutions:
    * **Stateless Subclass of `BaseResourceConnector`**: Defines `GitHubAppConnector` registered under `'GITHUB_APP'` declaring capabilities `READ_ACCOUNT`, `LIST_RESOURCES`, `READ_RESOURCE`, `REVOKE_ACCESS`. Instances store zero tenant state, zero mutable session data, and zero token material.
    * **Node.js Native `fetch` HTTP Client**: Uses runtime native `fetch` with `AbortSignal.timeout(10000)` instead of adding external dependencies (`@octokit/rest`), providing total control over header injection, timeout enforcement, rate-limit header parsing, and zero dependency bloat.
    * **Short-Lived Token Sourcing**: Uses `GitHubAppAuthManager.getInstallationToken({ tenantId, installationId })` to acquire short-lived `ghs_*` tokens (60-minute TTL) cached in memory with a 5-minute proactive buffer.
    * **Strict Domain Normalization**: Prunes raw GitHub API payloads into immutable provider-neutral domain models:
      * `getAccount` -> `NormalizedAccount` (`id`, `name`, `displayName`, `avatarUrl`, `provider: 'GITHUB_APP'`, `accountType: 'USER' | 'ORGANIZATION'`, `metadata: { repositorySelection, targetType, htmlUrl }`).
      * `listResources` -> `PaginatedResult<NormalizedResource>` (`id`, `name`, `fullName`, `type: 'REPOSITORY'`, `url`, `defaultBranch`, `isPrivate`, `languages`, `updatedAt`, `metadata: { numericId, description, archived, fork, visibility, stargazersCount, forksCount, openIssuesCount, size, license }`).
      * `getResource` -> `NormalizedResource`.
    * **Opaque Cursor Pagination Strategy**: Generic platform callers supply and receive opaque Base64URL cursor tokens (`{ page, limit, issuedAt }`). The connector converts between opaque cursors and GitHub's page-based API parameters (`per_page`, `page`), setting `hasMore = false` and `nextCursor = null` upon reaching the final page.
    * **Canonical Repository Identifier**: The immutable numeric GitHub repository ID as a string (e.g. `"1043905096"`) is chosen as the canonical identifier. Lookups by `owner/repo` are supported as secondary resolution.
    * **Existing Permission Alignment**: All P3-004 read operations require only `metadata:read` (already granted during installation). Deep file/directory traversal in P3-005 will use `contents:read`.
    * **Comprehensive Error Normalization**: Standardizes upstream responses into domain errors: 401 -> `ConnectorAuthError` (with token cache eviction), 403 (insufficient scope) -> `InsufficientScopeError`, 403/429 (rate limit) -> `ProviderRateLimitError`, 404 -> `ResourceNotFoundError`, 5xx/timeout -> `ProviderUnavailableError`.
    * **Rate Limiting & Retry Policy**: Inspects `x-ratelimit-remaining`, warns when quota <= 5, and retries transient 5xx/timeouts with jittered exponential backoff (max 2 retries).
    * **Audit Strategy**: High-frequency read queries do not generate persistent database audit records to prevent table bloat during AI exploratory crawls; lifecycle/revocation actions generate structured audit events.
* **P3-004 (Implement GitHub Connector Read Tools — Completed & Live Verified)**:
  * Implementation:
    * `src/connectors/github/github-connector.js`: Implemented `GitHubAppConnector` inheriting from `BaseResourceConnector`. Operations: `getAccount`, `listResources`, `getResource`, `validate`, `revokeAccess`. Features: Node.js runtime native `fetch` with `globalThis.AbortSignal.timeout(10000)`, short-lived installation access token sourcing (`ghs_*`) via `GitHubAppAuthManager`, domain normalization (`NormalizedAccount`, `NormalizedResource`), opaque Base64URL cursor pagination (`INVALID_PAGINATION_CURSOR` rejection), canonical numeric repository ID (`1338724502`) with secondary `owner/repo` (`vishu1803/Ai-job-mcp`) lookup, connection status validation (`ACTIVE` allowed; `REVOKED`/`DISCONNECTED` rejected with 403 `ConnectionInactiveError`), comprehensive error mapping (401 -> `ConnectorAuthError` with instant token cache eviction, 403 -> `InsufficientScopeError`, 404 -> `ResourceNotFoundError`, 429/403 -> `ProviderRateLimitError`, 5xx/timeout -> `ProviderUnavailableError`), retry with exponential jittered backoff (max 2 retries), and rate-limit remaining warning logger.
    * `src/connectors/github/index.js`: Exported `GitHubAppConnector`.
    * `src/app.js`: Automatically registers `GitHubAppConnector` for provider `'GITHUB_APP'` in `connectorRegistry` on application bootstrap.
  * Automated Test Verification:
    * `tests/unit/github-connector.test.js`: 20 unit tests covering capability declarations, account normalization (User & Org), repository listing and opaque cursor encoding/decoding/tampering, numeric and owner/repo lookups, validation health probing, token revocation and cache eviction, error mappings (401, 403 scope, 429 rate limit, 404, 5xx retry, timeout), and inactive connection enforcement.
    * `tests/integration/github-connector.test.js`: 3 PostgreSQL integration tests verifying DB connection resolution, multi-tenant isolation barrier (Tenant B cannot invoke Tenant A's connection -> 404 `ConnectionNotFoundError`), and status enforcement (`REVOKED` rejected with 403 `ConnectionInactiveError`).
  * Live Verification Against Real GitHub App Installation `155430459`:
    * `getAccount()` -> Verified `NormalizedAccount` for `id: "97516061"`, `name: "vishu1803"`, `provider: "GITHUB_APP"`, `accountType: "USER"`.
    * `listResources({ limit: 5 })` -> Returned 41 authorized repositories with valid `nextCursor` and `hasMore: true`.
    * `getResource("1338724502")` -> Resolved repository `Ai-job-mcp`, `type: "REPOSITORY"`, `defaultBranch: "main"`, `languages: ["JavaScript"]`, `visibility: "public"`.
    * `getResource("vishu1803/Ai-job-mcp")` -> Resolved identical repository payload matching numeric ID `1338724502`.
    * `validate()` -> Returned `{ healthy: true, message: "GitHub App connection is healthy and authorized" }`.
    * Confirmed zero secret leakage (no `ghs_*` tokens, App JWTs, or private keys printed or persisted).
  * Verification Commands:
    * `npm run test:unit` -> PASS (260/260 tests passed across 81 suites)
    * `npm run test:integration` -> PASS (90/90 tests passed across 20 suites)
    * `npm test` -> PASS (350/350 tests passed across 101 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
* **P3-005A (Deep Repository Inspection Architecture & Security Review — Completed & Approved)**:
  * Deliverable: Authored [`docs/github-deep-inspection-architecture.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/github-deep-inspection-architecture.md).
  * Architecture Decision: Authored ADR-025 (*GitHub Deep Repository Inspection Architecture*) in `docs/decisions.md`.
  * Core Security & Resource Invariants Defined:
    * **File Size Ceiling**: Hard 1MB cap on `getFileContent`; files exceeding 1MB throw `400 ValidationError('FILE_TOO_LARGE')`.
    * **README Bounds**: 256KB cap on decoded markdown text with safe Base64 decoding and whitespace stripping.
    * **Directory Tree Bounds**: Maximum depth of 10 directory levels and 1,000 total entries; handles GitHub `truncated: true` payloads safely.
    * **Binary & Media Filtering**: Comprehensive extension blocklist and 512-byte null-byte sniffing (`BINARY_FILE_REJECTED`).
    * **Symlink Exclusion**: Explicitly skips Git symlinks (`mode === '120000'`) to eliminate circular references and directory traversal escapes.
    * **POSIX Path Normalization**: Strict path sanitization (`path.posix.normalize()`) rejecting `..`, leading slashes, null bytes (`%00`), and Windows backslashes (`INVALID_FILE_PATH`).
    * **Commit History & PII Scrubbing**: Maximum 100 recent commits (default 30), 500-char message pruning, and author email redaction.
    * **Rate Limiting & ETag Caching Preparation**: Inspects rate limits and extracts `ETag` headers for Phase 3 Task P3-006 304 conditional queries.
    * **Ephemeral In-Memory Processing**: Repositories are processed ephemerally for Phase 4 skill/evidence token extraction; zero full repository cloning into PostgreSQL.
    * **Capability Expansion**: Declares `CONNECTOR_CAPABILITIES.READ_CONTENT` in `GitHubAppConnector`.
* **P3-005 (Implement Deep GitHub Repository Inspection — Completed & Live Verified)**:
  * Implementation:
    * `src/connectors/github/github-connector.js`: Extended `GitHubAppConnector` with deep repository inspection operations: `getReadme()`, `getRepositoryTree()`, `getLanguages()`, `getRecentCommits()`, `getFileContent()`. Features: `CONNECTOR_CAPABILITIES.READ_CONTENT` capability declaration, single file size limit (1MB cap with `FILE_TOO_LARGE` rejection), README decoded markdown cap (256KB with `truncated: true`), directory tree bounds (10 directory levels max, 1,000 entries max with graceful `truncated: true` handling), blocked binary extension filtering (`.png`, `.jpg`, `.zip`, `.pdf`, `.wasm`, `.exe`, etc.) and 512-byte null-byte binary sniffing (`BINARY_FILE_REJECTED`), symlink exclusion (`mode === '120000'` excluded from tree; `SYMLINK_REJECTED` on file read), strict POSIX path traversal rejection (`INVALID_FILE_PATH`), commit history extraction (100 max, default 30, 500-char message pruning, author email scrubbing, opaque cursor pagination), and ephemeral in-memory processing (zero raw file dumping into PostgreSQL).
  * Automated Test Verification:
    * `tests/unit/github-deep-inspection.test.js`: 21 unit tests covering capability declarations, Base64 README decoding, 256KB README truncation, 404 missing README safety, tree depth capping, 1,000 entry limit, binary and symlink tree exclusion, language percentage calculations, commits author PII scrubbing, pagination cursor roundtrip, 1MB file limit, blocked binary extension rejection, null-byte binary sniffing, symlink file rejection, path traversal rejection (`../`, leading `/`, `\`, null bytes), 401 token cache eviction, 403 scope mapping, and 429 rate limit mapping.
    * `tests/integration/github-connector.test.js`: 3 PostgreSQL integration tests verified against database-backed connections for Tenant A read operations, Tenant B cross-tenant 404 barrier, and REVOKED connection 403 status guard.
    * `tests/unit/github-connector.test.js`: Updated capability size assertion to 5 (`READ_CONTENT` included).
  * Live Verification Against Real GitHub Repository `vishu1803/Ai-job-mcp` (`installation_id = 155430459`):
    * `getReadme()` -> Successfully extracted `README.md` (`size: 6740`, `truncated: false`, UTF-8 markdown decoded).
    * `getRepositoryTree()` -> Successfully walked directory hierarchy (`rootSha: "5fe4bec9cc62f6445fd7f7b433f811f631e4b6d3"`, 119 entries, normalized POSIX paths with depth).
    * `getLanguages()` -> Successfully returned language breakdown (`totalBytes: 566483`, `primaryLanguage: "JavaScript"`, `percentage: 100`).
    * `getRecentCommits(limit: 5)` -> Successfully returned 5 recent commits with author login/name, timestamps, `authorEmail: undefined` (redacted), and message summaries.
    * `getFileContent("package.json")` -> Successfully extracted manifest (`size: 1422`, valid UTF-8 JSON).
    * Safety Boundary 1 -> Traversal path (`../../etc/passwd`) immediately rejected with `400 ValidationError (INVALID_FILE_PATH)`.
    * Safety Boundary 2 -> Blocked binary (`assets/logo.png`) immediately rejected with `400 ValidationError (BINARY_FILE_REJECTED)`.
    * Confirmed zero secret leakage and zero raw source persisted in PostgreSQL.
  * Verification Commands:
    * `npm run test:unit` -> PASS (281/281 tests passed across 89 suites)
    * `npm run test:integration` -> PASS (90/90 tests passed across 20 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
* **P3-006A (GitHub Connector Caching & Rate-Limit Architecture Review — Completed & Approved)**:
  * Deliverable: Authored [`docs/github-connector-caching-architecture.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/github-connector-caching-architecture.md).
  * Architecture Decision: Authored ADR-026 (*GitHub Connector Caching & Rate-Limit Architecture*) in `docs/decisions.md`.
  * Core Architectural Resolutions Defined:
    * **Strictly Normalized Domain Models**: Only sanitized domain payloads (`NormalizedAccount`, `NormalizedResource`, `NormalizedLanguageBreakdown`, `NormalizedDirectoryTree`, `NormalizedReadme`, `NormalizedCommit`, `NormalizedFileContent`) and upstream `ETag` strings are stored in cache. Tokens, App JWTs, private keys, raw personal author emails, and unnormalized raw responses are strictly prohibited.
    * **Multi-Tenant Partition Isolation**: Cache keys are deterministically namespaced with `tenantId` and `installationId` (`gh_cache:<tenantId>:<installationId>:<op>:<resourceId>:<paramsHash>`). Cross-tenant cache hits or lookups are impossible.
    * **HTTP `ETag` & 304 Conditional GET**: For stale cache entries possessing an upstream `ETag`, requests forward `If-None-Match: <etag>`. Upon receiving `304 Not Modified`, the cached payload is returned immediately with refreshed TTL and zero rate-limit quota consumption.
    * **Tiered TTL Matrix**: 5m account/commits, 15m metadata/trees/README/files (or 24h if Git commit/tree SHA pinned), 30m languages.
    * **Memory Ceilings & LRU Eviction**: In-memory LRU cache capped at a global maximum of 2,000 entries (~50 MB ceiling) and 500 entries per tenant. Payloads exceeding 1 MB are never cached.
    * **Webhook-Driven Purging**: Webhook events (`push`, `installation_repositories.removed`, `installation.deleted`, `installation.suspend`) trigger immediate targeted cache eviction in `GitHubWebhookService`.
    * **In-Memory Rate Limit Tracking**: Tracks remaining quota (`x-ratelimit-remaining`) and reset epoch per installation. Emits `logger.warn` when remaining <= 50 and enforces proactive throttling when <= 5.
* **P3-006 (Implement GitHub Connector Caching & Rate-Limit Tracking — Completed & Live Verified)**:
  * Implementation:
    * `src/connectors/github/github-connector-cache.js`: Created `GitHubConnectorCache` implementing Map-based in-memory LRU cache with multi-tenant partition isolation (`gh_cache:<tenantId>:<installationId>:<operation>:<resourceId>:<paramsHash>`). Features: deterministic parameter hashing (`_hashParams`), global capacity ceiling (2,000 entries), per-tenant capacity ceiling (500 entries), oversized payload rejection (> 1 MB rejected with `sizeBytes` calculation), tiered TTL matrix (`getAccount`: 300s, `listResources`: 600s, `getResource`: 900s, `getLanguages`: 1800s, `getRepositoryTree`: 900s / 86400s pinned, `getReadme`: 900s / 86400s pinned, `getFileContent`: 900s / 86400s pinned, `getRecentCommits`: 300s), `touch()` TTL refresh on HTTP 304, targeted eviction methods (`evict`, `evictTenant`, `clear`), and runtime statistics (`hits`, `misses`, `revalidations304`, `evictions`, `size`).
    * `src/connectors/github/github-rate-limiter.js`: Created `GitHubRateLimiter` tracking upstream quota (`limit`, `remaining`, `resetAt`) per `(tenantId, installationId)`. Features: case-insensitive header parsing (`x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`), warning logger when remaining <= 50, proactive delay throttling when remaining <= 5, hard rejection with `ProviderRateLimitError` when remaining === 0, and automatic quota reset when window elapses.
    * `src/connectors/github/github-connector.js`: Injected `cache` and `rateLimiter` into `GitHubAppConnector`. Integrated conditional requests via `If-None-Match: <etag>` for stale cache entries, HTTP 304 handling (`cache.touch`), cache storage on 200 responses, cache eviction on 404/401 errors, and cache eviction on `revokeAccess`.
    * `src/services/github-webhook.service.js`: Integrated connector cache eviction into webhook events: `installation.deleted` and `installation.suspend` completely purge connector cache for `(tenantId, installationId)`; `installation_repositories.removed` purges `listResources` and removed repository entries; `installation_repositories.added` purges `listResources` and `getAccount`.
    * `src/app.js` & `src/routes/webhooks.routes.js`: Wired `connectorCache` and `rateLimiter` through application bootstrap and webhook ingress routes.
  * Automated Test Verification:
    * `tests/unit/github-connector-cache.test.js`: 10 unit tests covering deterministic key generation, set/get/expiration, fresh hits, stale misses, touch revalidation on HTTP 304, 1MB size bounds, multi-tenant partition isolation, targeted eviction (resource, operation, installation, tenant), and LRU eviction (global 2000 limit, per-tenant 500 limit).
    * `tests/unit/github-rate-limiter.test.js`: 7 unit tests covering response header parsing (case-insensitive Map/Headers/Objects), tenant quota isolation, healthy assertions, throttling delay when remaining <= 5, `ProviderRateLimitError` rejection when remaining === 0, and reset window elapsed clearing.
    * `tests/unit/github-connector.test.js`: Extended with 3 caching & revalidation unit tests verifying cache miss -> 200 -> ETag stored, fresh hit -> 0 network calls, stale hit + ETag -> `If-None-Match` -> 304 Not Modified handled, and 401 Unauthorized -> data cache + token cache eviction.
    * `tests/unit/github-webhook.test.js`: Extended with 2 unit tests asserting connector cache purging on `installation.deleted` and `installation_repositories.removed`.
    * `tests/integration/github-connector.test.js`: All 90 integration tests passed.
  * Live Verification Against Real GitHub App Installation `155430459` (repository `vishu1803/Ai-job-mcp`):
    * Request 1 (`getResource`): Fresh miss -> HTTP 200 OK -> ETag `W/"8042c3a7a5e77aab34d741c7926b1d9ba528f5d33e470a79515b93a3cc3bc990"` stored in cache -> Rate limit quota tracked (`limit: 6050`, `remaining: 6033`).
    * Request 2 (`getResource`): Fresh hit -> Retrieved directly from in-memory cache with zero network egress.
    * Request 3 (`getResource`): Stale revalidation -> Sent `If-None-Match` header -> Upstream returned `HTTP 304 Not Modified` -> Served cached domain model -> `cache.touch()` refreshed TTL.
    * Request 4 (`getReadme`): Extracted README with ETag -> Stale revalidation returned `304 Not Modified` -> TTL touched.
    * Request 5 (`getRepositoryTree`): Extracted tree with ETag `W/"49658daea829c0f4cdb71b6b73c09d5757460445651997950a30eb948f3787ba"`.
    * Security Inspection: Verified zero `ghs_*` tokens, App JWTs, private keys, or raw personal email PII present in cache store.
  * Verification Commands:
    * `npm run test:unit` -> PASS (310/310 tests passed across 103 suites)
    * `npm run test:integration` -> PASS (90/90 tests passed across 20 suites)
    * `npm test` -> PASS (400/400 tests passed across 123 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
* **P4-001A (Unified Candidate / Resource Domain Model Architecture Review — Completed & Approved)**:
  * Deliverable: Authored [`docs/unified-candidate-resource-model.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/unified-candidate-resource-model.md).
  * Architecture Decision: Authored ADR-027 (*Unified Candidate and Resource Domain Model*) in `docs/decisions.md`.
  * Core Domain & Relational Invariants Defined:
    * **Provider-Neutral Candidate Entity**: Represents a sovereign human professional persona strictly owned by exactly one `Tenant` (`tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`). Decoupled from external provider accounts (GitHub username is an external identity claim, never the candidate primary key).
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
    * **Proposed Database Schema**: Proposed 8 clean PostgreSQL tables (`candidates`, `candidate_identities`, `resources`, `projects`, `project_resources`, `skills`, `candidate_skills`, `evidence_items`) and comprehensive indexing matrix.
    * **Design-Only Gate**: Verified zero premature code changes, zero migrations generated, zero database mutations, and zero Cloudflare Tunnel dependencies introduced.
* **P4-001 (Design and Implement Domain Zod Schemas — Completed & Verified)**:
  * Deliverables:
    * `src/domain/candidate/candidate.schemas.js`: Implemented canonical domain Zod schemas for `CandidateProfileSchema`, `CandidateIdentitySchema`, `SkillSchema`, `SkillWithEvidenceSchema`, `ProjectSchema`, `ProjectEvidenceSchema`, `ResourceSummarySchema`, `EvidenceSourceLocationSchema`, and `EvidenceNodeSchema`.
    * `src/domain/candidate/index.js` & `src/domain/index.js`: Re-exported domain contracts for application consumers.
    * `docs/domain-schema-contracts.md`: Documented domain data contracts, validation rules, field definitions, and security invariants.
  * Validation & Security Invariants Enforced:
    * `z.strictObject()` on all domain schemas to reject injection of unexpected properties or sensitive tokens.
    * Strict POSIX path traversal rejection (rejects `..`, leading `/`, backslashes `\`, null bytes `\0`/`%00`).
    * Git commit SHA validation (exact 40-character hex format).
    * Structured line range validation (`end >= start`, positive integers).
    * Secret and credential rejection in `SafeMetadataSchema` and `EvidenceExcerptSchema` (rejects private keys, `ghs_*` tokens, and `Bearer` headers).
    * Hard excerpt ceiling of $\le 1024$ characters.
    * Decimal confidence score validation bounded between $0.00$ and $1.00$.
  * Automated Unit Test Suite:
    * `tests/unit/candidate-domain-schemas.test.js`: 27 unit tests across 8 suites verifying valid and invalid payloads, boundary conditions, and security rejection.
  * Verification Commands:
    * `node --test tests/unit/candidate-domain-schemas.test.js` -> PASS (29/29 tests passed across 9 suites)
    * `npm run test:unit` -> PASS (339/339 tests passed across 104 suites)
    * `npm run test:integration` -> PASS (90/90 tests passed across 20 suites)
    * `npm test` -> PASS (429/429 tests passed across 132 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit schema check verified)
* **P4-002 (Implement Unified Candidate / Resource Database Schema — Completed & Verified)**:
  * Deliverables:
    * `src/db/schema.js`: Implemented the 8 approved PostgreSQL/Drizzle domain tables (`candidates`, `candidate_identities`, `resources`, `projects`, `project_resources`, `skills`, `candidate_skills`, `evidence_items`) and 6 new pgEnums (`candidate_status`, `resource_type`, `resource_status`, `skill_category`, `provenance_status`, `evidence_type`).
    * `drizzle/0002_sturdy_zarek.sql`: Generated non-destructive PostgreSQL migration creating the 8 domain tables, enums, indexes, and foreign keys without modifying Phase 1/2/3 tables.
    * `tests/integration/candidate-domain-schema.test.js`: Live integration test suite exercising CRUD, unique constraints, restrict/cascade delete rules, and multi-tenant isolation.
  * Relational & Security Invariants Enforced:
    * **Multi-Tenant Ownership**: All tenant-owned tables (`candidates`, `candidate_identities`, `resources`, `projects`, `project_resources`, `candidate_skills`, `evidence_items`) enforce `tenant_id NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.
    * **Global Taxonomy Independence**: `skills` table is a global canonical dictionary without tenant scoping (`skills.slug UNIQUE`), referenced by `candidate_skills` via `ON DELETE RESTRICT`.
    * **Decoupled Architecture**: `ResourceConnection` (credentials/auth) is decoupled from `resources` (`connection_id ON DELETE SET NULL`), and `projects` is decoupled from individual repositories ($1\text{ Project} \ne 1\text{ Repository}$) via `project_resources`.
    * **Immutable Provenance**: `evidence_items` is an append-oriented table storing structured source pointers (`source_location` JSONB) and sanitized excerpts ($\le 1024$ chars).
    * **Composite Unique Constraints**:
      * `candidate_identities`: `UNIQUE (tenant_id, provider, external_account_id)`
      * `resources`: `UNIQUE (tenant_id, provider, external_resource_id)`
      * `projects`: `UNIQUE (tenant_id, candidate_id, slug)`
      * `project_resources`: `UNIQUE (project_id, resource_id)`
      * `candidate_skills`: `UNIQUE (tenant_id, candidate_id, skill_id)`
  * Live Database Migration & Verification:
    * `npm run db:migrate` -> Successfully executed `0002_sturdy_zarek.sql` on the live Aiven PostgreSQL database in 4.2s.
    * `node --test tests/integration/candidate-domain-schema.test.js` -> PASS (8/8 test suites passed against Aiven database).
    * `npm test` -> PASS (437/437 tests passed across 141 suites).
    * `npm run lint` -> PASS (0 errors, 0 warnings).
    * `npm run format:check` -> PASS (All matched files use Prettier code style).
    * `npm run db:check` -> PASS (Drizzle Kit check passed).
* **P4-003 (Implement GitHub Evidence Extractor — Completed & Verified)**:
  * Deliverables:
    * `src/extractors/github/security/secret-scrubber.js`: High-entropy credential detector and scrubber (redacts GitHub tokens `ghp_`/`ghs_`, private keys RSA/EC, AWS AKIA keys, Bearer/raw JWTs, DB connection strings, and variable secret assignments; enforces hard $\le 1024$ chars excerpt ceiling).
    * `src/extractors/github/taxonomy/taxonomy-mapper.js`: Canonical taxonomy normalizer mapping 50+ ecosystem packages across Node, Python, Go, and Rust to canonical skills and 7 valid categories (`LANGUAGE`, `FRAMEWORK`, `DATABASE`, `CLOUD_DEVOPS`, `TOOL`, `ARCHITECTURE`, `CONCEPT`).
    * `src/extractors/github/manifest-parsers/base-manifest-parser.js`: Base parser contract with line length ($\le 500$ chars) and file size ($\le 1\text{ MB}$) bounding.
    * `src/extractors/github/manifest-parsers/node-manifest-parser.js`: `package.json` parser with prototype stripping and object depth ceiling ($\le 5$).
    * `src/extractors/github/manifest-parsers/python-manifest-parser.js`: `requirements.txt`, `Pipfile`, `pyproject.toml` parser with unsafe pip flag rejection (`-r`, `-e`, `-i`, `--extra-index-url`, `git+`).
    * `src/extractors/github/manifest-parsers/go-manifest-parser.js`: `go.mod` parser extracting direct dependencies and detecting `// indirect` dependencies.
    * `src/extractors/github/manifest-parsers/rust-manifest-parser.js`: `Cargo.toml` parser extracting `[dependencies]`, `[dev-dependencies]`, and `[workspace.dependencies]`.
    * `src/extractors/github/code-scanners/import-scanner.js`: Pure static regex import scanner for JS/TS, Python, Go, and Rust entrypoints with linear bounds ($\le 1000$ lines, $\le 500$ chars/line) and zero code execution.
    * `src/extractors/github/fingerprint.js`: SHA-256 deterministic fingerprint deduplication engine (`SHA256(tenantId:candidateId:resourceId:skillSlug:evidenceType:filePath:commitSha)`).
    * `src/extractors/github/skill-rollup.js`: Candidate skill rollup scoring engine implementing $\text{RollupScore} = \min(1.0, \max(\text{conf}) \times (0.8 + 0.05 \times \min(4, \text{count})))$ and provenance transitions (`VERIFIED`, `INFERRED`, `CLAIMED`, `MISSING`).
    * `src/extractors/github/github-evidence-extractor.js`: Core orchestrator managing pre-transaction GitHub API data acquisition, declarative parsing, secret scrubbing, and atomic multi-tenant database persistence.
    * `src/extractors/github/index.js`: Module re-exports.
  * Security & Architectural Invariants Enforced:
    * **Zero Code Execution**: Pure static analysis; no `eval()`, `new Function()`, `vm`, `child_process`, or runtime interpreters invoked.
    * **Strict Multi-Tenant Isolation**: Verified single-tenant boundaries across candidates, resources, evidence items, and candidate skills with 404 default-deny on cross-tenant access.
    * **Deterministic Idempotency**: Repeated extractions produce zero duplicate evidence items or candidate skill rows.
    * **Excerpt Minimization & Secret Redaction**: Verified no complete source code stored; excerpts capped at $\le 1024$ chars with all credentials replaced with `[REDACTED_SECRET]`.
  * Live Verification Against Real GitHub App Installation `155430459` (repository `vishu1803/Ai-job-mcp`):
    * Successfully authenticated with GitHub App RS256 JWT -> Sourced installation token -> Retrieved directory tree and README -> Extracted normalized skills (`fastify`, `postgresql`, `drizzle-orm`) -> Persisted 3 sanitized `evidence_items` with SHA-256 fingerprints -> Generated 3 `candidate_skills` rollups with provenance `INFERRED` (confidence $0.51$) -> Updated `resources.last_synced_at`.
  * Verification Commands:
    * `node --test tests/unit/github-evidence-extractor.test.js` -> PASS (39/39 tests passed across 11 suites)
    * `node --test tests/integration/github-evidence-extractor.test.js` -> PASS (5/5 test suites passed against Aiven PostgreSQL)
    * `npm run test:unit` -> PASS (378/378 tests passed across 123 suites)
    * `npm run test:integration` -> PASS (103/103 tests passed across 35 suites)
    * `npm test` -> PASS (481/481 tests passed across 158 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P4-004A (Evidence Linking Engine Architecture Review — Completed & Approved)**:
  * Deliverables:
    * `docs/evidence-linking-architecture.md`: Comprehensive specification (`ARCH-009`) establishing evidence identity, deduplication fingerprint decoupling, immutability invariants, skill linking via direct FKs & primary anchor, project linking ($1 : N$), strict multi-tenant default-deny (404), concrete commit SHA pinning, historical evidence preservation, and transactional atomicity.
    * `docs/decisions.md` (ADR-029): Formally accepted *Evidence Linking and Provenance Integrity Architecture*.
  * Core Architecture & Security Decisions Approved:
    * **Canonical Evidence Identity (`EvidenceId`)**: `evidence_items.id` (UUIDv4) is the universal, immutable identifier for all citations, API responses, and foreign keys.
    * **Fingerprint Decoupling**: Ingestion deduplication uses a deterministic SHA-256 hash (`metadata.fingerprint`) computed over `(tenant_id, candidate_id, resource_id, skill_slug, evidence_type, file_path, commit_sha)`, decoupling deduplication from entity primary keys.
    * **Strict Provenance Immutability**: `id`, `tenantId`, `candidateId`, `resourceId`, `sourceProvider`, `evidenceType`, `sourceLocation` (`filePath`, `commitSha`, `lineRange`), and `excerpt` are strictly immutable once created. Linkers must never rewrite excerpts or provenance pointers.
    * **Skill Linking via Direct FKs & Primary Anchor**: `candidate_skills.primary_evidence_id` points to the highest-confidence anchor proof node, while `evidence_items.skill_id` links all supporting nodes. A separate join table is explicitly rejected as redundant overhead.
    * **Project Linking ($1 : N$)**: `evidence_items.project_id` links evidence directly to projects, while `project_resources` links projects to underlying repositories ($M : N$).
    * **Strict Multi-Tenant Default-Deny**: Enforces tenant equality across all participating entities (`EvidenceItem.tenantId == Candidate.tenantId == Resource.tenantId == Project.tenantId`). Cross-tenant operations return 404 default-deny.
    * **Concrete Commit SHA Pinning**: Provenance must always be pinned to a 40-character hexadecimal Git commit SHA. Transient branch names (`main`, `HEAD`) are strictly prohibited as persistent provenance values.
    * **Historical Evidence Preservation**: Code modifications or dependency deletions do not purge historical evidence; freshness is tracked via `detectedAt` and `lastObservedAt` timestamps.
    * **Transactional Atomicity**: All linking and rollup operations execute atomically inside a single database transaction downstream of external GitHub API retrieval.
* **P4-004 (Evidence Linking Engine Implementation — Completed)**:
  * Implemented Modules:
    * `src/services/evidence/primary-evidence-selector.js`: Deterministic ranking engine implementing 4-tier evidence comparison (Confidence Score -> Quality Tier -> Recency -> UUID Lexical Tie-Breaker).
    * `src/services/evidence/evidence-ref-mapper.js`: Provider-neutral lightweight domain `EvidenceRef` and full `EvidenceNode` formatters protecting sensitive excerpts and secrets.
    * `src/services/evidence-linking.service.js`: Core domain service for candidate skill linking, project linking, atomic batch linking, and provenance validation.
    * `src/services/evidence/index.js`: Module re-exports.
  * Verified Invariants:
    * **Canonical Evidence Identity**: Uses `evidence_items.id` (UUIDv4) across all citations, APIs, and foreign keys.
    * **Immutable Provenance Guard**: Throws `ValidationError` on any attempt to mutate `id`, `tenantId`, `candidateId`, `resourceId`, `sourceProvider`, `evidenceType`, `sourceLocation`, `excerpt`, or `fingerprint`.
    * **Monotonic Confidence Invariance**: Weaker evidence never downgrades stronger assertions or existing `VERIFIED` status.
    * **Deterministic Primary Selection**: Stronger anchor nodes are preserved when secondary/weaker evidence is linked.
    * **Project Linking & Association**: Automatically ensures `project_resources` association exists when linking evidence to projects.
    * **Strict Multi-Tenant Default-Deny**: Rejects cross-tenant evidence, candidate, resource, or project linkage with 404 `NotFoundError`.
    * **Atomic Rollback**: Batch operations roll back completely across all items if any constraint fails.
    * **Retention Semantics**: Project deletion sets `evidence_items.project_id = NULL` without destroying underlying evidence nodes.
  * Verification Commands:
    * `node --test tests/unit/evidence-linking.test.js` -> PASS (17/17 tests passed across 5 suites)
    * `node --test tests/integration/evidence-linking.test.js` -> PASS (9/9 tests passed across 7 suites against Aiven PostgreSQL)
    * `npm run test:unit` -> PASS (395/395 tests passed across 128 suites)
    * `npm run test:integration` -> PASS (112/112 tests passed across 42 suites)
    * `npm test` -> PASS (507/507 tests passed across 170 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P4-005A (Candidate Profile Service Architecture Review — Completed & Approved)**:
  * Deliverables:
    * `docs/candidate-profile-service-architecture.md`: Comprehensive architectural specification (`ARCH-010`) defining the lifecycle, aggregation, and claim integrity rules for `CandidateProfileService`.
    * `docs/decisions.md` (ADR-030): Formally accepted *Candidate Profile Service Architecture and Claim Integrity*.
  * Core Decisions Approved:
    * **Strict Claim Classification**: Rigorously separate machine-verified facts (`provenanceStatus` `VERIFIED` or `INFERRED`) from self-asserted user claims (`provenanceStatus = 'CLAIMED'`). User claims are explicitly tagged and serialized as `[Unverified User Claim]` and can never attain `VERIFIED` status without cryptographic evidence nodes.
    * **User Narrative Sovereignty**: Resource synchronization (e.g. GitHub App sync) updates resource catalogs and skill evidence graphs, but **never** overwrites explicit user-authored profile text (`displayName`, `headline`, `summary`, `canonicalEmail`).
    * **Candidate vs. User Decoupling**: Candidate profiles are decoupled from the platform authentication `User` entity, enabling multi-persona modeling, recruiter agency workflows, and organizational candidate directories under strict tenant isolation.
    * **Credential Redaction**: Profile responses expose clean resource summaries while strictly blacklisting `encryptedCredentials`, installation tokens, OAuth tokens, and private keys.
    * **Project Multi-Resource Decoupling**: Projects represent curated career initiatives ($1\text{ Project} \ne 1\text{ Repository}$) and can encompass multiple connected resources via `project_resources`.
    * **Multi-Tenant Sovereign Default-Deny**: All profile operations validate `tenant_id = context.tenantId`. Cross-tenant lookups fail closed with `404 Not Found`.
    * **Role-Based Access Control**: `OWNER` has full tenant profile authority; `MEMBER` can edit self-linked profiles; `READONLY` is restricted to read-only profile inspection with 403 enforcement.
* **P4-005 (Candidate Profile Service Implementation — Completed)**:
  * Implemented Modules:
    * `src/services/candidate-profile.service.js`: Complete domain service implementing `getProfile`, `listCandidates`, `createCandidate`, `updateProfile`, `addSkillClaim`, `removeSkillClaim`, `archiveCandidate`, `restoreCandidate`, and `syncProfileFromResources`.
  * Verified Invariants:
    * **Full Profile Aggregation**: Combines candidate root, identities, clean resource summaries, projects, and skills into a cohesive, provider-neutral `CandidateProfileView`.
    * **Credential Redaction**: Resources and identities strip all secrets, `encryptedCredentials`, tokens, and private keys from profile output.
    * **Strict Claim Classification**: Manual skill claims are persisted with `provenanceStatus = 'CLAIMED'`, `confidenceScore = 0.0`, `isUserClaim = true`, and serialized as `claimLabel = '[Unverified User Claim]'`.
    * **Evidence Precedence & Monotonicity**: Adding verified evidence elevates claims to `VERIFIED` with $\ge 0.85$ confidence. Adding manual claims on already-verified skills never downgrades score.
    * **Narrative Sovereignty**: `syncProfileFromResources` updates `profileMetadata.systemInferred` without overwriting user-authored `displayName`, `headline`, `summary`, or `canonicalEmail`.
    * **Metadata Partitioning**: Preserves distinct `userCustom` and `systemInferred` JSONB namespaces.
    * **Archive/Restore Lifecycle**: Correctly toggles `ACTIVE` and `ARCHIVED` status without destroying evidence or resource links.
    * **RBAC & Tenant Isolation**: Rejects cross-tenant access with 404 `NotFoundError`; permits `OWNER` full tenant mutation; permits `MEMBER` self-linked candidate mutation; rejects non-self-linked `MEMBER` and `READONLY` users with 403 `AuthorizationError`.
  * Verification Commands:
    * `node --test tests/unit/candidate-profile.service.test.js` -> PASS (9/9 tests passed across 3 suites)
    * `node --test tests/integration/candidate-profile.service.test.js` -> PASS (15/15 tests passed across 7 suites against Aiven PostgreSQL)
    * `npm run test:unit` -> PASS (404/404 tests passed across 131 suites)
    * `npm run test:integration` -> PASS (127/127 tests passed across 49 suites)
    * `npm test` -> PASS (531/531 tests passed across 180 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P4-006 (Multi-Tenant Candidate Data Isolation Security Tests — Completed)**:
  * Implemented Modules / Test Suites:
    * `tests/integration/candidate-tenant-isolation.test.js`: Dedicated security integration test suite containing 24 tests across 13 suites against live Aiven PostgreSQL.
  * Verified Invariants:
    * **Profile Isolation (404 Default-Deny)**: Tenant A cannot read Candidate B; Tenant B cannot read Candidate A. Cross-tenant lookups fail closed with `404 NotFoundError` (never 403) to prevent resource existence disclosure.
    * **List Isolation**: `listCandidates` across all pagination pages (page 1, page 2, pageSize 1, empty page) returns strictly tenant-scoped candidates with zero cross-tenant contamination.
    * **Deep Recursion Leak Check**: Serialized Candidate A profile payload contains 0 occurrences of Tenant B tenantId, candidateId, identityId, resourceId, projectId, evidenceId, or internal metadata tags.
    * **Resource & Project Isolation**: Profiles contain exclusively self-tenant resources, projects, and linked evidence items.
    * **Skill & Evidence Provenance Isolation**: Shared global taxonomy is decoupled from tenant-scoped `CandidateSkill` assertions and cryptographic `EvidenceItem` proof nodes.
    * **Manual Claim Isolation**: Adding/removing manual claims in Tenant A has zero side effects on Tenant B.
    * **Evidence Linking Isolation**: Attempting to link cross-tenant evidence, projects, candidates, or skills is blocked with 404 `NotFoundError`.
    * **Negative Mutation Proof**: Row-count snapshots prove exactly 0 foreign rows are altered across unauthorized update, claim, link, archive, or restore attempts.
    * **Spoofing Resistance**: Client-injected `tenantId` and `userId` fields in request bodies or query options are completely ignored in favor of trusted session context.
    * **RBAC Hardening**: `OWNER` has full mutation authority; `MEMBER` can mutate self-linked candidate profiles only (`candidate.userId === context.userId`) and is rejected with 403 on other candidates; `READONLY` is rejected with 403 on all mutating actions.
    * **Sync & Deletion Independence**: Background synchronization consumes only self-tenant resources. Deleting Candidate A or Tenant A rows does not affect or delete any Candidate B or Tenant B records.
  * Verification Commands:
    * `node --test tests/integration/candidate-tenant-isolation.test.js` -> PASS (24/24 tests passed across 13 suites against Aiven PostgreSQL)
    * `npm run test:unit` -> PASS (404/404 tests passed across 131 suites)
    * `npm run test:integration` -> PASS (151/151 tests passed across 62 suites)
    * `npm test` -> PASS (555/555 tests passed across 193 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P5-001A (Career Intelligence Engine Architecture Review — Completed & Approved)**:
  * Deliverables:
    * `docs/career-intelligence-architecture.md`: Comprehensive architectural specification (`ARCH-011`) defining canonical `JobDescription` & `JobRequirement` domain models, taxonomy normalization, deterministic 100-point scoring algorithm, evidence-backed matching (`MATCHED`, `PARTIAL`, `MISSING`, `UNKNOWN`), prioritized skill gap analysis (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), anti-prompt-injection sandbox, and multi-tenant sovereign default-deny isolation.
    * `docs/decisions.md` (ADR-031): Formally accepted *Career Intelligence Engine Architecture & Deterministic Scoring*.
* **P5-001 (Job Description Parser & Extraction Contracts — Completed)**:
  * Implemented Modules:
    * `src/domain/career/job-description.schemas.js`: Canonical domain Zod contracts for `JobDescriptionInputSchema`, `JobDescriptionSchema`, `JobCompensationSchema`, and source/status/workplace/seniority enums with strict $\le 50\,\text{KB}$ boundary protection.
    * `src/domain/career/job-requirement.schemas.js`: Atomic requirement schemas (`JobRequirementSchema`, `JobSkillRequirementCriteriaSchema`, `JobExperienceRequirementCriteriaSchema`, `JobEducationRequirementCriteriaSchema`, `JobLocationRequirementCriteriaSchema`, `JobDomainRequirementCriteriaSchema`, `JobClassificationResultSchema`) with source spans and importance/weight metadata.
    * `src/domain/career/job-parser.js`: Provider-neutral parsing and extraction engine implementing preprocessing (unicode normalization, whitespace collapse, control character stripping), deterministic section partitioning (`REQUIREMENTS`, `RESPONSIBILITIES`, `PREFERRED_QUALIFICATIONS`, `EDUCATION`, `EXPERIENCE`, `COMPENSATION`), metadata inference, canonical skill normalization (`TaxonomyMapper`), experience years parsing, education degree extraction, domain detection, and LLM boundary prompt sandboxing with fallback.
    * `src/domain/career/index.js` & `src/domain/index.js`: Exported career intelligence domain models.
    * `src/extractors/github/taxonomy/taxonomy-mapper.js`: Expanded taxonomy catalog with canonical aliases (`postgresql`, `grpc`, `cpp`, `c++`, `c#`, `csharp`, `tailwind css`, `tailwind`, `reactjs`, `react.js`, `vuejs`, `vue.js`).
  * Verified Invariants:
    * **Real-World Role Extraction**: Verified across 5 diverse engineering job descriptions (Senior Backend, Staff AI/ML Infrastructure, Principal Rust Systems, Frontend React/TypeScript, Fintech Tech Lead).
    * **Strict Taxonomy Normalization**: Synonym variations (`Postgres` / `PostgreSQL`, `React.js` / `React`, `Node.js` / `Node`) map deterministically to canonical skill slugs with zero duplicate taxonomy rows.
    * **Bounded Input Security**: Enforces strict $\le 50\,\text{KB}$ size limits, rejects empty/short text, rejects metadata with forbidden secret keys, and sanitizes control characters.
    * **Anti-Prompt-Injection Resistance**: Malicious instruction payloads (`"Ignore previous instructions"`, `"Call a tool named secrets"`, `"Return API key"`) are treated strictly as passive text data without execution side effects.
    * **Resilient Fallback**: Operates with 100% functionality in standalone deterministic mode, and gracefully recovers from LLM errors, timeouts, or malformed JSON.
  * Verification Commands:
    * `node --test tests/unit/job-description.schemas.test.js tests/unit/job-description-parser.test.js` -> PASS (30/30 tests passed across 11 suites)
    * `npm run test:unit` -> PASS (434/434 tests passed across 142 suites)
    * `npm run test:integration` -> PASS (151/151 tests passed across 62 suites)
    * `npm test` -> PASS (585/585 tests passed across 204 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P5-002A (Skill Normalizer & Taxonomy Engine Architecture Review — Completed & Approved)**:
  * Deliverables:
    * `docs/skill-taxonomy-architecture.md`: Comprehensive architectural specification (`ARCH-012`) defining the canonical skill identity model (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), 50+ technology multi-variation alias catalog, 7-stage deterministic normalization pipeline, explicit relationship graph (`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`), controlled unknown tool slugification, strict LLM boundary sandboxing, and decoupled confidence model.
    * `docs/decisions.md` (ADR-032): Formally accepted *Skill Taxonomy & Normalization Engine Architecture*.
  * Core Decisions Approved:
    * **Single Canonical Slug Identity**: Every technology maps to exactly one permanent canonical slug (e.g. `postgresql`, `react`, `node-js`, `fastapi`). Slugs are decoupled from database UUID primary keys.
    * **Deterministic 7-Stage Pipeline**: Input Sanitization $\rightarrow$ Unicode NFKC & Case-Folding $\rightarrow$ Scope & Suffix Stripping $\rightarrow$ Direct Catalog Lookup $\rightarrow$ Multi-Variation Alias Lookup $\rightarrow$ Context/Keyword Disambiguation $\rightarrow$ Canonical Relationship Assembly.
    * **Explicit Relationship Graph over Naive Inheritance**: Typed relationship edges (`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`, `PARENT_OF`). E.g., `React` is `BUILT_ON` `JavaScript`, not an "instance of" JavaScript.
    * **Controlled Unknown Technology Handling**: Unrecognized terms generate validated kebab-case slugs, default to category `TOOL`, are flagged with `isCustom: true` and `requiresReview: true`, and emit `taxonomy.unknown_term_observed` audit telemetry for curator review. Unknown terms are never automatically aliased.
    * **Strict LLM Boundary**: LLMs cannot act as the primary normalizer, cannot create arbitrary canonical skills, and cannot mutate taxonomy records.
    * **Zero Schema Migrations**: Uses in-memory compiled catalog for microsecond lookups in ingestion hot paths, with PostgreSQL `skills` table as global persistent relational source of truth. Zero breaking changes to existing evidence or candidate profile records.

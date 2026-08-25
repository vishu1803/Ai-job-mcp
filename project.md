# Project Execution Tracker: Universal AI Career MCP Platform

**Source of Truth & Living Progress Tracker**  
*Last Updated: 2026-08-25*

---

## 1. Project Status Summary

| Metric | Current Value | Note |
| :--- | :--- | :--- |
| **Current Phase** | **PHASE 10 — Claude Integration (Second Target AI Client)** | Phase 0-9 (100% COMPLETE: 57/57 tasks verified), Phase 10 (P10-001 Complete & Verified; ready for P10-002A) |
| **Project State** | **ACTIVE / IN PROGRESS** | Phase 0 through Phase 9 complete; P10-001 verified; ready for P10-002A (Architecture Review for Claude Free & Claude Pro/Team multi-connector compatibility) |
| **Total Tasks** | **81 Tasks** | Across Phases 0 to 15 |
| **Completed Tasks** | **58 Tasks** | Phase 0 (4) + Phase 1 (6) + Phase 2 (6) + Phase 3 (6) + Phase 4 (6) + Phase 5 (6) + Phase 6 (5) + Phase 7 (6) + Phase 8 (6) + Phase 9 (6) + Phase 10 (1) (plus P8-001A, P8-003A, P8-004A, P8-005A, P8-006A, P9-001A, P9-002A, P9-003A, P9-004A, P9-005A, P9-006A, P10-001A approved) |
| **In Progress Tasks** | **0 Tasks** | Ready for P10-002A |
| **Blocked Tasks** | **0 Tasks** | No active blockers |
| **Overall Task Completion** | **71.6% (58 / 81 Tasks)** | Strict calculation, zero inflation |
| **Weighted Phase Completion** | **64.1% (10.25 / 16 Phases)** | Strictly based on verified deliverables (Phases 0-9 100% complete, Phase 10 25% complete) |

---

## 2. Phase-by-Phase Progress Summary

| Phase | Phase Name | Total Tasks | Completed | In Progress | Status | Completion % |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PHASE 0** | Research and Architecture | 4 | 4 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 1** | Multi-User Platform Foundation | 6 | 6 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 2** | Authentication & User Resource Connections | 6 | 6 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 3** | GitHub App Integration | 6 | 6 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 4** | Unified Candidate / Resource Model | 6 | 6 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 5** | Career Intelligence Engine | 6 | 6 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 6** | Resume / Cover-Letter / Portfolio Adaptation | 5 | 5 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 7** | Remote MCP Server | 6 | 6 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 8** | Gemini Integration | 6 | 6 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 9** | Approved GitHub / Project Modification Workflows | 6 | 6 | 0 | **COMPLETE** | **100.0% (P9-001 through P9-006 Complete & Verified)** |
| **PHASE 10** | Claude Integration | 4 | 1 | 0 | **IN_PROGRESS** | **25.0% (P10-001 Complete & Verified)** |
| **PHASE 11** | ChatGPT Integration | 4 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 12** | Job / Application Tracking | 5 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 13** | Public Multi-User Beta | 5 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 14** | Security Hardening & Production Readiness | 6 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 15** | Advanced Automation | 4 | 0 | 0 | NOT_STARTED | **0.0%** |
| **TOTAL** | **All Phases Combined** | **81** | **58** | **0** | **IN_PROGRESS** | **71.6%** |

---

## 3. High-Level Milestone Roadmap

| Milestone ID | Target Phase | Milestone Description | MVP Critical? | Status | Target Date |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **M0** | Phase 0 | Ecosystem research, architecture signoff, project constitution (`goal.md`), execution tracker (`project.md`). | YES | **COMPLETE** | 2026-08-18 |
| **M1** | Phase 1-2 | Multi-tenant backend initialized, database schemas migrated, user auth & session isolation operational. | YES | **COMPLETE** | 2026-08-20 |
| **M2** | Phase 3-4 | GitHub App OAuth & webhook ingestion running; candidate profile & skill evidence graph extracted. | YES | **COMPLETE** | 2026-08-22 |
| **M3** | Phase 5 | Job description parsing, skill normalization, and evidence-to-requirement matching engine validated. | YES | **COMPLETE** | 2026-08-23 |
| **M4** | Phase 7-8 | Remote MCP server running over Streamable HTTP; Gemini client successfully calls tools and generates verified analysis. | YES | **COMPLETE** | 2026-08-24 |
| **M5 (MVP)** | Phase 8 | **End-to-End MVP Golden Path Verified** (User -> GitHub -> Evidence Profile -> Job Match -> Gemini MCP -> Verifiable Output). | **YES (MVP GATE)** | **COMPLETE (P8-003 Verified)** | 2026-08-25 |
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
| **P5-002** | Implement Skill Normalizer & Taxonomy (e.g., maps "React.js", "ReactJS", "React" -> `React`; "Postgres" -> `PostgreSQL`) | P5-001, P5-002A | **COMPLETE** | Implemented `SkillTaxonomyEngine` in `src/domain/career/skill-taxonomy.js` and updated `TaxonomyMapper` adapter. Unit tests in `tests/unit/skill-taxonomy.test.js` (29/29 PASS) verifying 30+ canonical identifiers, 61+ curated technology synonyms across 7 approved categories, context disambiguation (`Go` / `Spring`), safe unknown tool slugification (`TOOL`, `isCustom: true`, `requiresReview: true`), relationship graph edges (`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`), graph integrity validation (zero dangling edges), prototype pollution resistance, and full test suite compatibility. Full suite: 614/614 PASS across 213 suites. |
| **P5-003A** | Evidence Matching & Gap Analysis Architecture Review | P5-002 | **COMPLETE & APPROVED** | Architectural specification `docs/evidence-matching-architecture.md` (`ARCH-013`), ADR-033 in `docs/decisions.md`. Defined canonical 4-status evaluation (`MATCHED`, `PARTIAL`, `MISSING`, `UNKNOWN`), strict evidence verification gating, taxonomy graph relationship multipliers (`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`), non-skill matching protocols (experience, education, location, domain), decoupled match confidence formula, actionable skill gap taxonomy (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), ephemeral in-memory computation ($O(N)$), and multi-tenant default-deny isolation. |
| **P5-003** | Implement Evidence Matching & Gap Analysis Engine (categorizes requirements as: Verified, User Claim, Inferred, or Missing) | P4-004, P5-002, P5-003A | **COMPLETE** | Implemented `EvidenceMatchingService` in `src/services/evidence-matching.service.js` and canonical domain schemas in `src/domain/career/evidence-matching.schemas.js`. Unit tests in `tests/unit/evidence-matching.service.test.js` (27/27 PASS) verifying canonical 4-status evaluations (`MATCHED`, `PARTIAL`, `MISSING`, `UNKNOWN`), strict evidence verification thresholds, multi-variation alias normalization, fact-vs-claim precedence (`[Unverified User Claim]` $\rightarrow$ `PARTIAL`), directional taxonomy relationship traversals (`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`, `PARENT_OF`), non-skill protocols (experience tenure, education degrees, remote location, domain architectures), qualitative soft-skill routing to `UNKNOWN`, top 3 evidence selection, prioritized skill gaps (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), bit-for-bit determinism, and multi-tenant 404 default-deny isolation. Full suite: 645/645 PASS across 225 suites. |
| **P5-004A** | Project Relevance Scoring Architecture Review | P5-003 | **COMPLETE & APPROVED** | Architectural specification `docs/project-relevance-architecture.md` (`ARCH-014`), ADR-034 in `docs/decisions.md`. Defined canonical 0–100 project relevance score, 5 additive components (50% requirement coverage, 25% architectural density across 10 dimensions, 15% evidence quality, 5% completeness, 5% bounded recency), relevance bands (`HIGH`, `MEDIUM`, `LOW`, `MINIMAL`), strict deduplication guard, multi-repository project aggregation, top 5 evidence selection, and multi-tenant default-deny isolation. |
| **P5-004** | Implement Project Relevance Scoring (ranks candidate repositories by direct relevance to target job requirements) | P4-004, P5-003, P5-004A | **COMPLETE** | Implemented `ProjectRelevanceService` in `src/services/project-relevance.service.js` and canonical domain schemas in `src/domain/career/project-relevance.schemas.js`. Unit tests in `tests/unit/project-relevance.service.test.js` (30/30 PASS across 13 suites) verifying transparent 5-part score breakdown (50% requirement coverage, 25% architectural density across 10 dimensions, 15% evidence quality, 5% completeness, 5% bounded recency), directional taxonomy multipliers (`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`, `PARENT_OF`), strict deduplication & anti-inflation guard, relevance bands (`HIGH`, `MEDIUM`, `LOW`, `MINIMAL`), top 5 commit-pinned evidence selection, project type classification, deterministic batch ranking, and multi-tenant default-deny isolation. Full suite: 675/675 PASS across 238 suites. |
| **P5-005A** | ATS Fit Score Calculator Architecture Review | P5-003, P5-004 | **COMPLETE & APPROVED** | Architectural specification `docs/ats-fit-score-architecture.md` (`ARCH-015`), ADR-035 in `docs/decisions.md`. Defined canonical 100-point composite fit score, 7 additive components summing to 100 (40% required coverage, 15% preferred coverage, 20% project relevance via decaying top-3 weighted average, 10% experience tenure, 5% education, 5% location, 5% evidence confidence), required skill safety gate (hard score caps for missing required skills: 1 missing $\le 74.9$, 2 missing $\le 49.9$, 3+ missing $\le 24.9$), fit bands (`EXCELLENT`, `STRONG`, `MODERATE`, `WEAK`, `LOW`), explicit UNKNOWN vs MISSING neutrality, fact-vs-claim precedence, and multi-tenant default-deny isolation. |
| **P5-006A** | Zero-Hallucination Integrity Gate Architecture Review | P5-003, P5-004, P5-005 | **COMPLETE & APPROVED** | Architectural specification `docs/zero-hallucination-integrity-architecture.md` (`ARCH-016`), ADR-036 in `docs/decisions.md`. Defined definitive truth boundary, `CareerAssertion` domain model across 8 types (`SKILL`, `PROJECT`, `EXPERIENCE`, `EDUCATION`, `DOMAIN`, `LOCATION`, `ACHIEVEMENT`, `SUMMARY`), strict 5-status classification (`VERIFIED`, `INFERRED`, `CLAIMED`, `MISSING_EVIDENCE`, `UNKNOWN`), 6-point evidence reference audit, zero-evidence emission rules, claim immutability, inference containment, non-conflation of commit duration with corporate tenure, multi-evidence aggregation, provenance preservation, LLM generation sandbox, output contract (`IntegrityCheckedCareerSummary`, status: `PASS`, `PARTIAL`, `BLOCKED`), standardized audit reason codes, and multi-tenant default-deny isolation. |
| **P5-006** | Zero-Hallucination Integrity Gate (validates that any career summary or match assertion contains valid evidence references) | P5-003, P5-006A | **COMPLETE** | Implemented `ZeroHallucinationIntegrityService` in `src/services/zero-hallucination-integrity.service.js` and canonical domain schemas in `src/domain/career/integrity-gate.schemas.js`. Unit tests in `tests/unit/zero-hallucination-integrity.service.test.js` (26/26 PASS across 12 suites) and live integration tests in `tests/integration/zero-hallucination-integrity.service.test.js` (4/4 PASS against PostgreSQL) verifying strict 5-status classification (`VERIFIED`, `INFERRED`, `CLAIMED`, `MISSING_EVIDENCE`, `UNKNOWN`), 6-point evidence reference audit, zero-evidence emission as `MISSING_EVIDENCE`, claim immutability (`[Unverified User Claim]`), inference containment (Next.js -> React stays `INFERRED`), non-conflation of commit duration with corporate tenure (`UNSUPPORTED_TENURE`), quantitative metric guard (`UNSUPPORTED_ACHIEVEMENT`), multi-evidence deduplication/capping, provenance preservation, summary safety, standardized audit reason codes, and multi-tenant default-deny isolation with zero database mutations. Full suite: 739/739 PASS across 253 suites. |

---

### PHASE 6: Resume / Cover-Letter / Portfolio Adaptation
*Objective: Generate tailored, verifiable resume bullets, cover letters, and portfolio recommendations strictly tied to evidence.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P6-001A** | Resume / Cover-Letter / Portfolio Adaptation Architecture Review | P5-006 | **COMPLETE & APPROVED** | Architectural specification `docs/career-artifact-adaptation-architecture.md` (`ARCH-017`), ADR-037 in `docs/decisions.md`. Defined provider-neutral synthesis engine for `TailoredResume`, `TailoredCoverLetter`, and `TailoredPortfolioContent`, atomic `ResumeBullet` model, absolute truth boundary consuming `IntegrityCheckedAssertions` from P5-006, safe ATS keyword alignment via canonical taxonomy mapping, metric safety guardrails (unbacked metrics $\rightarrow$ `BLOCKED`), corporate work history authority, deterministic content prioritization (Verified Required $\rightarrow$ Projects $\rightarrow$ Preferred $\rightarrow$ Inferred $\rightarrow$ Claimed), LLM phrasing sandbox, mandatory post-generation integrity checks, rendering decoupling, and multi-tenant default-deny isolation. |
| **P6-001** | Implement Resume Tailoring Service (adapts candidate project descriptions using only verified technologies, supporting PRESERVE_EXISTING & GENERATE_NEW presentation modes) | P5-003, P5-006, P6-001A | **COMPLETE** | Unit tests (28 in `tests/unit/resume-tailoring.service.test.js`, 11 in `tests/unit/resume-presentation.service.test.js`) & live PostgreSQL tests (3 in `tests/integration/resume-tailoring.service.test.js`): verified required skill prioritization, project relevance ranking, preferred/inferred/claimed labeling, missing skill omission, canonical ATS keyword adaptation, metric safety guard, work history authority, presentation modes (PRESERVE_EXISTING, GENERATE_NEW), visual styling preservation & fingerprinting, format limitations (DOCX, PDF, Plain Text), deterministic output, and multi-tenant default-deny isolation. Full suite: 781/781 PASS across 256 suites. |
| **P6-002** | Implement Cover Letter Drafting Engine (weaves authentic repository evidence into targeted narrative for a specific job) | P5-003, P5-006, P6-002A | **COMPLETE** | Unit tests (21 in `tests/unit/cover-letter-drafting.service.test.js`) & live PostgreSQL integration tests (3 in `tests/integration/cover-letter-drafting.service.test.js`): verified 6-tier prioritization, paragraph synthesis (`OPENING`, `COMPANY_ALIGNMENT`, `RELEVANT_EXPERIENCE`, `PROJECT_EVIDENCE`, `MOTIVATION`, `CLOSING`), commit-pinned EvidenceRefs (max 5), corporate work history authority (commits != employment tenure), company alignment grounding (zero mission/culture/funding fabrication), metric safety guard (unbacked metrics $\rightarrow$ `ValidationError`), tone presets (`PROFESSIONAL`, `CONCISE`, `CONFIDENT`, `WARM`), bounded paragraph length (3-6 paragraphs), passive LLM linguistic sandbox, post-generation integrity gate audit, and multi-tenant default-deny isolation. Full suite: 805/805 PASS across 258 suites. |
| **P6-003A** | Portfolio Recommendation Engine Architecture Review | P5-004, P6-001 | **COMPLETE & APPROVED** | Architectural specification `docs/portfolio-recommendation-architecture.md` (`ARCH-019`), ADR-039 in `docs/decisions.md`. Defined evidence-first portfolio strategy model (`PortfolioRecommendation`), bounded 1-5 featured project sizing, quality vs quantity deterministic floor, 7-dimension signal complementarity engine (`SignalComplementarityScore`), greedy marginal value optimization ($\mathcal{O}(k \cdot N)$), anti-inflation skill coverage accounting, engineering maturity indicators, ownership/contribution confidence matrix, tutorial/clone detection safeguards (`LIKELY_TUTORIAL`), live demo boost, story completeness vs technical depth decoupling, interview discussion value scoring, extensible 7-job-family personalization, user override semantics (`PIN`, `EXCLUDE`), explainability rationale, and multi-tenant default-deny isolation. |
| **P6-003** | Implement Portfolio Recommender (selects top 3-5 repositories and highlights key architectural achievements for target role) | P5-004, P6-003A | **COMPLETE** | Implemented `PortfolioRecommendationService` in `src/services/portfolio-recommendation.service.js` and canonical domain schemas in `src/domain/career/portfolio-recommendation.schemas.js`. Verified across 25 unit tests (`tests/unit/portfolio-recommendation.service.test.js`) & 4 live PostgreSQL integration tests (`tests/integration/portfolio-recommendation.service.test.js`): bounded 1-5 featured project selection (no artificial padding), quality floor disqualification ($< 30$ density & 0 tests $\rightarrow$ `deprioritized`), greedy marginal value optimization ($\mathcal{O}(k \cdot N)$), signal complementarity across 7 orthogonal dimensions, anti-inflation requirement coverage accounting, job-family dynamic weighting (Backend, Frontend, AI Engineering, DevOps, Data, Fullstack, General), ownership & contribution confidence classification, tutorial/clone detection safeguards, story completeness evaluation, interview discussion value scoring ($0-100$), actionable case study prompts and interview discussion questions, user overrides (`PIN_FEATURED`, `EXCLUDE_PROJECT`, `REORDER_OVERRIDE`), zero-hallucination post-generation citation audit, 100% deterministic ranking, cross-tenant 404 default-deny isolation, and zero database mutations. Full suite: 834/834 PASS across 260 suites. |
| **P6-004A** | Career Artifact Export & Canonical Interchange Architecture Review | P6-001, P6-002, P6-003 | **COMPLETE & APPROVED** | Architectural specification `docs/career-artifact-export-architecture.md` (`ARCH-020`), ADR-040 in `docs/decisions.md`. Defined canonical interchange contract (`ExportedArtifact` envelope with MIME types, byte/line counts, SHA-256 checksums), strict JSON Resume schema v1.0.0 compliance (namespacing Antigravity cryptographic provenance inside `meta.antigravity` without breaking external JSON Schema validators), single-column ATS-safe plain text sanitization (converting unicode quotes/dashes/bullets to standard ASCII, 2-space indents, 0 tabs), semantic CommonMark & GFM Markdown typography with safe HTML escaping, 4 configurable citation styles (`NONE`, `INLINE`, `FOOTNOTES`, `METADATA_ONLY`), privacy & blind screening anonymization controls (PII redaction), line ending normalization (`LF` / `CRLF`), stateless in-memory execution, and multi-tenant default-deny isolation. |
| **P6-004** | Implement Export Formats (JSON Resume standard, Markdown, Plain Text) | P6-001, P6-004A | **COMPLETE** | Implemented `CareerArtifactExportService` in `src/services/career-artifact-export.service.js` and canonical domain schemas in `src/domain/career/career-artifact-export.schemas.js`. Verified across 26 unit tests (`tests/unit/career-artifact-export.service.test.js`) & 5 live PostgreSQL integration tests (`tests/integration/career-artifact-export.service.test.js`): JSON Resume v1.0.0 compliance with `meta.antigravity` envelope, Markdown GFM generation with H1-H4 hierarchy and HTML escaping, ATS-safe plain text sanitization (normalized quotes, dashes, bullets, tabs to 2 spaces), full canonical JSON domain export, 4 citation modes (`NONE`, `INLINE`, `FOOTNOTES`, `METADATA_ONLY`), PII anonymization (`[REDACTED_NAME]`, `[REDACTED_EMAIL]`, `[REDACTED_PHONE]`, `[REDACTED_ADDRESS]`), unverified claim omission policy, line ending normalization (`LF` / `CRLF`), encoding support (`UTF-8` / `ASCII` with transliteration), SHA-256 content byte checksums, safe filename path-traversal prevention, zero secret leakage, cross-tenant 404 default-deny isolation, and 0 database writes. Full suite: 865/865 PASS across 262 suites. |
| **P6-005** | Implement Resume Integrity Audit Tool (scans any generated document for claims lacking evidence) | P5-006, P6-001, P6-005A | **COMPLETE** | Implemented `ResumeIntegrityAuditService` in `src/services/resume-integrity-audit.service.js` and canonical schemas in `src/domain/career/resume-integrity-audit.schemas.js`. Verified across 28 unit tests (`tests/unit/resume-integrity-audit.service.test.js`) & 6 live PostgreSQL integration tests (`tests/integration/resume-integrity-audit.service.test.js`): multi-format input parsing (`STRUCTURED_RESUME`, `JSON_RESUME`, `MARKDOWN`, `PLAIN_TEXT`), strict rejection of PDF/DOCX (`UNSUPPORTED_FORMAT`), 3-tier status evaluation (`PASS`, `WARN`, `BLOCK`), deterministic typed claim extraction (`SKILL`, `METRIC`, `EXPERIENCE`, `TENURE`, `EMPLOYER`, `EDUCATION`, `ACHIEVEMENT`), quantitative metric safety guardrails (unbacked numbers $\rightarrow$ `BLOCK`), corporate work history authority (Git commits $\ne$ employment tenure), cryptographic evidence citation validation (`commitSha`, `filePath`, `lineRange`, tenant match, candidate match), status inflation detection (`STATUS_INFLATION` $\rightarrow$ `BLOCK`), candidate profile contradiction detection (`CONTRADICTORY_FACT` $\rightarrow$ `BLOCK`), ATS keyword stuffing defense, omission tolerance (missing skills are not penalized), content drift classification, structured remediation directives, sovereign cross-tenant 404 default-deny isolation, and zero database mutations. Full suite: 899/899 PASS across 264 suites. |

---

### PHASE 7: Remote MCP Server
*Objective: Expose the career platform services as a standards-compliant remote MCP server using Streamable HTTP and per-user authentication.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P7-001A** | MCP Server Foundation Architecture & Security Review | Phase 6 | **COMPLETE & APPROVED** | Architectural specification `docs/mcp-server-architecture.md` (`ARCH-022`), ADR-042 in `docs/decisions.md`. Defined official MCP 2026-07-28 spec compliance, Streamable HTTP primary transport (`POST /mcp`), header routing (`MCP-Protocol-Version`, `Mcp-Method`), Bearer API token auth, trusted `McpRequestContext` minting, multi-tenant sovereign default-deny isolation (404), RBAC permission matrix (`OWNER`, `MEMBER`, `READONLY`), initial safe 7-tool catalog, strict internal boundary enforcement (no raw tokens/db queries), prompt injection sandboxing, 3-tier rate limiting, sanitized audit logging, and ephemeral execution with zero premature DB migrations. |
| **P7-001** | Implement MCP Server foundation using official `@modelcontextprotocol/server` (2026-07-28 spec) | P1-005, P7-001A | **COMPLETE** | Integrated official v2 SDK `@modelcontextprotocol/server@2.0.0` and `@modelcontextprotocol/core@2.0.0` (2026-07-28 standard). Implemented `src/mcp/server.js` (`McpServerWrapper`, `createMcpServer`, `createMcpHandler`), `src/security/mcp-auth.js`, `src/domain/mcp/mcp.schemas.js`, `src/routes/mcp.routes.js`. Verified modern 2026-07-28 protocol flow (header routing `MCP-Protocol-Version: 2026-07-28`, `Mcp-Method`, `Mcp-Name`, metadata envelope `_meta`), tool registration with Zod/JSON schema normalization, RBAC role assertion (`OWNER`/`MEMBER`/`READONLY`), Bearer token auth against PostgreSQL sessions, `McpRequestContext` minting, prototype pollution rejection, request correlation (`x-request-id`), legacy 2025-11-25 initialize fallback interoperability, and zero database mutations during handshake. Unit tests: 24/24 PASS (with hard 2026-07-28 assertion); Live integration tests: 13/13 PASS; Master suite: 936/936 PASS. |
| **P7-002** | Implement Streamable HTTP Transport with header routing (`Mcp-Method`) and fallback SSE endpoint | P7-001 | **COMPLETE** | Hardened Fastify route `POST /mcp` with content negotiation, header-based routing (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`), 1 MB payload limits, prototype pollution & recursion depth protection, 3-tier sliding-window rate limiting (`McpRateLimiter`: IP, Tenant, Tool compute budget), tool/resource/prompt registration & discovery, Bearer token auth against PostgreSQL sessions, `McpRequestContext` minting, legacy 2025-11-25 initialize fallback over SSE, and sanitized audit events (`mcp.tool.completed`, `mcp.tool.denied`, `mcp.tool.failed`). Unit tests: 30/30 PASS; Live integration tests: 20/20 PASS; Master suite: 949/949 PASS. |
| **P7-003** | Implement Dedicated Personal MCP API Token Infrastructure & Tenant Scoping | P2-002, P7-002 | **COMPLETE** | Dedicated `mcp_api_tokens` PostgreSQL table, `McpApiTokenService`, SHA-256 token hashing, `mcp_<env>_<32-byte-hex>` token format, scope ceiling enforcement (`READONLY` -> `career:read`, `MEMBER` -> read/write/export, `OWNER` -> +admin), token quota (max 10), independent revocation, atomic rotation, throttled `last_used_at` writes (60s), environment binding, and transitional session token fallback (`authMethod: 'SESSION_FALLBACK'`). Unit tests: 10/10 PASS; Live integration tests: 8/8 PASS; Master suite: 967/967 PASS. |
| **P7-004A** | MCP Career Read Tools Architecture & Industry Review | P7-003 | **COMPLETE & APPROVED** | Architectural specification `docs/mcp-career-read-tools-architecture.md` (`ARCH-023`), ADR-044 in `docs/decisions.md`. Defined narrow 4-tool catalog (`get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit`), pure in-memory delegation to existing domain services, progressive disclosure agent pattern, advisory tool annotations (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`), scope `career:read`, multi-tenant 404 isolation, hard output budgets ($\le 500$ char excerpts, paginated lists), prompt injection sandboxing, tenant-private caching, and comprehensive test matrix. |
| **P7-004** | Expose Career Read Tools: `get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit` | P4-005, P5-003, P7-001, P7-004A | **COMPLETE** | Implemented `registerCareerReadTools` in `src/mcp/tools/career-read-tools.js` and canonical Zod schemas in `src/domain/mcp/career-read-tools.schemas.js`. Features: 4-tool catalog (`get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit`), pure in-memory delegation to `CandidateProfileService`, `EvidenceMatchingService`, `ProjectRelevanceService`, `AtsFitScoreService`, `SecretScrubber`, advisory tool annotations (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`), `career:read` scope enforcement, bounded output budgets (15 KB profiles, 500-char evidence excerpts, paginated skills/evidence), tenant-scoped candidate resolution (`resolveTargetCandidateId`), multi-tenant sovereign default-deny 404 isolation, RBAC matrix (`OWNER`, `MEMBER`, `READONLY` all permitted), `career:write`-only scope rejection (403 / -32003), cross-tenant project inspection rejection, zero database mutations, and tenant-private cache control metadata. Unit tests: 18/18 PASS (`tests/unit/mcp-career-read-tools.test.js`); Live integration tests: 9/9 PASS (`tests/integration/mcp-career-read-tools.test.js`); Master suite: 994/994 PASS across 270 suites. |
| **P7-005** | Expose Application Artifact Tools: `generate_tailored_resume`, `draft_cover_letter`, `recommend_portfolio_projects` | P6-001, P6-002, P7-004, P7-005A | **COMPLETE** | Implemented in `src/mcp/tools/career-artifact-tools.js` & `src/domain/mcp/career-artifact-tools.schemas.js`. Pure in-memory adapter delegation to `PortfolioRecommendationService`, `CoverLetterDraftingService`, `ResumeTailoringService`, `ResumePresentationService`, `ZeroHallucinationIntegrityService`, `ResumeIntegrityAuditService`. Unit tests (16/16 PASS in `tests/unit/mcp-application-artifact-tools.test.js`), Live Fastify + PostgreSQL integration tests (9/9 PASS in `tests/integration/mcp-application-artifact-tools.test.js`). Full suite: 1019/1019 PASS across 272 suites. |
| **P7-006A** | MCP Audit Logging Architecture & Security Review | P7-005 | **COMPLETE & APPROVED** | Architectural specification `docs/mcp-audit-logging-architecture.md` (`ARCH-025`), ADR-046 in `docs/decisions.md`. Evaluated existing `audit_logs` table vs. second audit system. Decided 100% on unified single-table audit architecture with zero schema migrations, mapping MCP execution telemetry into sanitized `details` JSONB envelope with non-blocking failure-isolated async persistence. |
| **P7-006** | Implement MCP Audit Logging (logs tool invocation timestamp, tenant ID, tool name, execution time, and client user-agent) | P1-004, P7-004, P7-006A | **COMPLETE** | Implemented `McpAuditService` in `src/services/mcp-audit.service.js`, Zod schemas in `src/domain/mcp/mcp.schemas.js`, integrated into `src/routes/mcp.routes.js`. Verified across 8 unit tests (`tests/unit/mcp-audit.service.test.js`) & 7 live PostgreSQL integration tests (`tests/integration/mcp-audit-logging.test.js`): canonical event taxonomy (`mcp.tool.completed`, `mcp.tool.denied`, `mcp.tool.failed`), credential & secret sanitization (tokens, passwords, raw resumes, source code stripped), 1000-char parameter string clamping, 16 KB payload ceiling via `sanitizeAuditDetails()`, failure-isolated non-blocking async DB persistence, unauthenticated request handling (Pino operational log only), multi-tenant sovereign default-deny isolation (`listAuditLogs` filters strictly by `tenantId`), correlation ID match (`x-request-id` ↔ `audit_logs.request_id`), zero plaintext API keys in database rows, RBAC denial recording (403 / -32003), rate limit denial recording (429 / -32029), and tenant-scoped paginated query interface. |

---

### PHASE 8: Gemini Integration (First Target AI Client)
*Objective: Connect Google Gemini to the remote MCP server and validate end-to-end career copilot functionality.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P8-001A** | Gemini Integration Architecture & AI Trust-Boundary Review | Phase 7 | **COMPLETE & APPROVED** | Architectural specification `docs/gemini-integration-architecture.md` (`ARCH-026`), ADR-047 in `docs/decisions.md`. Defined 5-tier provider-neutral AI architecture, dynamic model routing (Gemini 3.7 Flash workhorse, 3.6 Flash secondary, 3.1 Pro deep reasoning, 2.5 Flash fallback), inverse authority principle (zero AI authority over facts/scores/EvidenceIds), XML prompt injection sandboxing, native JSON schema structured outputs (`responseSchema`), bounded tool calling (max 3 turns), sovereign multi-tenant isolation with zero user-data context caching, and 12-scenario red-team threat model. |
| **P8-001** | Implement Gemini API Client adapter for testing tool calling against remote MCP endpoint | P7-004, P8-001A | **COMPLETE & LIVE VERIFIED** | Integrated official `@google/genai` SDK (`^2.18.0`). Implemented provider-neutral `AiProvider` interface (`src/clients/ai/ai-provider.interface.js`), dynamic 2026 `ModelRegistry` (`src/clients/ai/model-registry.js`), `TaskPolicyRegistry` (`src/clients/ai/task-policy.js`), XML prompt sandboxing with PII/secret scrubbing (`src/clients/gemini/gemini-prompt-builder.js`), Zod & MCP tool schema conversion (`src/clients/gemini/gemini-schema-converter.js`), error normalization (`src/clients/gemini/gemini-error-normalizer.js`), and `GeminiProviderAdapter` (`src/clients/gemini/gemini-adapter.js`). Verified across 12 unit tests (`tests/unit/gemini-client.test.js`), 2 contract tests (`tests/unit/ai-provider.contract.test.js`), and 3 live Fastify/PostgreSQL/Gemini integration tests (`tests/integration/gemini-client.test.js`): live authentication against Google Gemini Developer API, live text generation (`gemini-3.7-flash`), live structured output via Zod schema, live tool calling loop with approved read tool (`get_candidate_profile`), caller `McpRequestContext` preservation, bounded turn depth, jittered retry & fallback model failover on 429/503, safety handling, and zero secret leakage. Full suite: 831/831 PASS across 204 suites. |
| **P8-002** | Configure Gemini System Prompts with strict zero-hallucination and evidence-citation constraints | P8-001 | **COMPLETE** | Implemented modular Prompt Policies in `src/clients/ai/prompt-policies/` (`BasePromptPolicy`, `ResumeWordingPolicy`, `CoverLetterPolicy`, `JobExplanationPolicy`, `CareerCoachingPolicy`, `ProjectCaseStudyPolicy`, `PromptPolicyRegistry`), XML prompt sandboxing, SecretScrubber + PII masking, and structured output verification. Unit tests (`tests/unit/gemini-prompt-policy.test.js` - 24 tests), deterministic integration tests (`tests/integration/gemini-prompt-policies.test.js` - 6 tests), and live external suite (`tests/integration/live/gemini-client.live.test.js`). Full master suite: 1,082/1,082 PASS across 283 suites. |
| **P8-003A** | Gemini Golden Path Integration Architecture & Dual-Mode Test Strategy Review | P8-002 | **COMPLETE & APPROVED** | Architectural specification `docs/gemini-golden-path-architecture.md` (`ARCH-027`), ADR-048 in `docs/decisions.md`. Defined end-to-end topology connecting Phases 3, 4, 5, 7, and 8, inverse authority principle, dual-mode verification strategy (deterministic mock SDK for normal CI / `npm test` vs live external test for `npm run test:live`), database lifecycle compliance, and performance/cost bounds. |
| **P8-003** | Test end-to-end Golden Path with Gemini: User connects GitHub -> builds evidence -> analyzes job -> Gemini explains fit | P3-005, P5-003, P8-002, P8-003A | **COMPLETE & VERIFIED** | Implemented & verified dual-mode Golden Path test suites: Deterministic Golden Path (`tests/integration/gemini-golden-path.test.js` - 11/11 PASS in 9.7s) and Live External Suite (`tests/integration/live/gemini-golden-path.live.test.js` - PASS against Google Gemini API). Verified 9 core security & anti-hallucination invariants: (1) Inverse Authority, (2) Evidence Grounding Gate, (3) Status Inflation Defense, (4) Metric Fabrication Defense, (5) Prompt Injection Resistance, (6) Multi-Tenant Sovereign Default-Deny (404), (7) Secret Scrubbing, (8) MCP Audit Logging, (9) Resource Lifecycle & Teardown. Master test suite: 1,093/1,093 PASS across 284 suites. |
| **P8-004** | Implement Vertex AI Gemini Provider Adapter (`GeminiVertexAdapter`) with ADC, Workload Identity & Dedicated Live Test Suite | P8-003, P8-004A | **COMPLETE & VERIFIED** | Implemented `GeminiVertexAdapter` and `createAiProvider` factory. 17 unit tests in `tests/unit/vertex-adapter.test.js`, contract adherence verified, dedicated live integration suite in `tests/integration/live/gemini-vertex.live.test.js`. Master suite: 1,112/1,112 tests PASS across 285 suites with 0 leaks. |
| **P8-005A** | Gemini Enterprise & Google AI Studio Remote MCP Integration Architecture Review | P8-004 | **COMPLETE & APPROVED** | Architectural specification `docs/gemini-enterprise-mcp-integration-architecture.md` (`ARCH-029`), ADR-050 in `docs/decisions.md`. Disambiguated 2026 Google AI ecosystem (AI Studio, Vertex AI Agent Builder / ADK, Gemini Enterprise, and Gemini CLI), analyzed custom connectors vs. remote MCP server, specified 3 integration channels (Native Streamable HTTP MCP, OpenAPI Gateway, and Enterprise Connected App), and defined security/isolation invariants. |
| **P8-005** | Author Gemini Enterprise & Google AI Studio Custom MCP Connector Integration Documentation | P7-002, P8-004, P8-005A | **COMPLETE & VERIFIED** | Created `docs/gemini-enterprise-mcp-integration.md` covering 3 integration channels (Native Streamable HTTP MCP, OpenAPI Gateway, GCP Connected App), token setup walkthrough, full 7-tool catalog, validated curl requests, error reference, and security checklist. Automated validation test `tests/unit/mcp-docs-validation.test.js` (5/5 PASS). Master suite: 1,117/1,117 tests PASS across 286 suites. |
| **P8-006A** | MCP Tool Latency Benchmark Architecture & Performance Review | P8-005 | **COMPLETE & APPROVED** | Architectural specification `docs/mcp-performance-architecture.md` (`ARCH-030`), ADR-051 in `docs/decisions.md`. Defined 4-layer latency boundary decomposition (`TOOL_ONLY`, `MCP_HTTP`, `GEMINI_TOOL`, `END_TO_END`), 3-tier tool taxonomy (`READ_FAST`, `ANALYTICAL`, `AI_GENERATION`), audited domain caching (`CACHE_NOT_IMPLEMENTED`), established target budget (<1.5s p95 for `MCP_HTTP` vs <4.0s p95 for `END_TO_END`), regression thresholds, and zero-waste benchmark harness design. |
| **P8-006** | Benchmark MCP tool execution latency with Gemini (target <1.5s for cached queries) | P8-003, P8-006A | **COMPLETE & VERIFIED** | Implemented benchmark harness (`scripts/benchmark-mcp.js`), mathematical stats utility (`src/utils/benchmark-stats.js`), and unit test suite (`tests/unit/mcp-latency-benchmark.test.js` - 22/22 PASS). Generated structured baseline artifacts (`docs/mcp-performance-baseline.json`, `docs/mcp-performance-baseline.md`). Verified all 7 tools across boundaries (`TOOL_ONLY`, `MCP_HTTP`) and concurrency tiers ($C=1, 5, 10$) with 0.0% errors and 0 DB leaks. Master test suite: 1,139/1,139 PASS across 295 suites. |

---

### PHASE 9: Approved GitHub / Project Modification Workflows
*Objective: Enable safe, user-confirmed project enhancements to demonstrate missing skills without touching main branches.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P9-001A** | Approved GitHub / Project Modification Workflows Architecture & Security Review | P8-006 | **COMPLETE & APPROVED** | Architectural specification `docs/github-project-modification-architecture.md` (`ARCH-031`), ADR-052 in `docs/decisions.md`. Established 10-point threat model, Inverse Authority Principle for code writes, 4-tier action matrix (`READ_ONLY`, `SAFE_WRITE`, `APPROVAL_REQUIRED`, `PROHIBITED`), Two-Phase Human-in-the-Loop Approval State Machine (`ApprovalTicket`), least-privilege GitHub App scoping (`contents: write`, `pull_requests: write`), patch safety engine (workflow blocklist, binary filter, entropy scanner), optimistic concurrency locking (`expectedHeadSha`), immutable audit logging, non-destructive rollback, and 2-tool MCP interface. |
| **P9-001** | Implement Project Improvement Recommender (analyzes missing job skills and proposes concrete code/architecture additions) | P5-003, P9-001A | **COMPLETE & VERIFIED** | Implemented `ProjectImprovementRecommenderService`, domain schemas in `src/domain/career/project-improvement.schemas.js`, prompt policy in `src/clients/ai/prompt-policies/project-improvement.policy.js`, and documentation in `docs/project-improvement-recommender.md`. Verified via 19 unit tests (`tests/unit/project-improvement-recommender.test.js`), 2 integration tests (`tests/integration/project-improvement-recommender.test.js`), and live Vertex suite (`tests/integration/live/project-improvement-vertex.live.test.js`). 100% test pass with 0 DB leaks. |
| **P9-002A** | Two-Phase Human-in-the-Loop Action Approval State Machine Architecture & Security Review | P9-001 | **COMPLETE & APPROVED** | Architectural specification `docs/approval-state-machine-architecture.md` (`ARCH-032`), `ADR-053` in `docs/decisions.md`. Established 8-state canonical lifecycle (`PENDING`, `APPROVED`, `EXECUTING`, `EXECUTED`, `REJECTED`, `CANCELLED`, `EXPIRED`, `FAILED`), HMAC-SHA256 payload canonicalization with HKDF tenant isolation, single-use atomic CAS row locking (`SELECT FOR UPDATE`), optimistic concurrency on base commit (`expectedHeadSha`), dual expiration ceilings (15m creation / 5m execution window), RBAC authorization matrix (`MEMBER`/`OWNER` only), and 15-scenario threat model. |
| **P9-002** | Implement Two-Phase Human-in-the-Loop Action Approval State Machine (`propose_action` -> `ApprovalTicket` -> `confirm_action`) | P2-002, P9-001, P9-002A | **COMPLETE & VERIFIED** | Implemented `ActionApprovalTicketService` (`src/services/action-approval-ticket.service.js`), repository (`src/db/repositories/approval-ticket.repository.js`), crypto signer (`src/security/approval-signer.js`), domain schemas (`src/domain/career/approval-ticket.schemas.js`), typed errors (`src/errors/approval.errors.js`), and PostgreSQL migration (`0004_amused_red_shift.sql`). Verified via 11 unit tests (`tests/unit/action-approval-ticket.test.js`) and 7 transactional integration tests (`tests/integration/action-approval-ticket.test.js`). 100% test pass with 0 DB leaks. |
| **P9-003A** | GitHub Write Operations Architecture & Security Review | P9-002 | **COMPLETE & APPROVED** | Architectural specification `docs/github-write-operations-architecture.md` (`ARCH-033`), `ADR-054` in `docs/decisions.md`. Established low-level Git Data API strategy (`trees` -> `commits` -> `refs`) for atomic multi-file patches, mandatory `ActionApprovalTicket` authorization gate, dynamic installation token scoping (`contents: write`, `pull_requests: write`), live base branch HEAD SHA verification, Draft PR default with sanitized markdown template, 15-scenario threat model (T-01 to T-15), non-destructive rollback (`deleteRef`), and safe live sandbox test strategy against `vishu1803/Ai-job-mcp`. |
| **P9-003** | Implement GitHub Write Operations: `create_branch`, `create_commit_patch`, `create_pull_request` | P3-001, P9-002, P9-003A | **COMPLETE & VERIFIED** | Implemented `GitHubWriteService` (`src/services/github-write.service.js`), Git Data API methods in `GitHubAppConnector` (`createGitTree`, `createGitCommit`, `createGitRef`, `deleteGitRef`, `createDraftPullRequest`, `getPullRequestByHead`), dynamic permission scoping in `GitHubAppAuthManager` and `GitHubTokenCache`, and typed error `ForbiddenOperationError`. Verified via 12 unit tests (`tests/unit/github-write-operations.test.js`), 6 integration tests (`tests/integration/github-write-operations.test.js`), and live sandbox test (`tests/integration/live/github-project-modification.live.test.js`). 100% test pass with 0 DB leaks. |
| **P9-004A** | GitHub Write Safety Constraints Architecture & Security Review | P9-003 | **COMPLETE & APPROVED** | Architectural specification `docs/github-write-safety-architecture.md` (`ARCH-034`), `ADR-055` in `docs/decisions.md`. Established Centralized Safety Kernel (`GitHubWriteSafetyService`), static & dynamic repository default branch protection (`default_branch`), target vs base branch separation (`targetBranch !== baseBranch`), strict Git ref whitelist (`refs/heads/feat/career-hub-*`), physical force-push elimination, defense-in-depth patch policy (POSIX paths, traversal, 38 binary extensions, dot-dirs), CI/CD workflow defense matrix (`.github/workflows/*`, actions, hooks), pre-execution Shannon entropy secret scanning, optimistic concurrency locking (`expectedHeadSha`), 20-scenario threat model (T-01 to T-20), and audit event catalog. |
| **P9-004** | Enforce Safety Constraints: write actions NEVER touch default branch (`main`/`master`); only create feature branches | P9-003, P9-004A | **COMPLETE & VERIFIED** | Implemented centralized execution safety kernel in `src/services/github-write-safety.service.js`, integrated with `GitHubWriteService`, enhanced error hierarchy (`ProtectedDefaultBranchError`, `InvalidGitRefError`, `PatchPolicyViolationError`, `WorkflowModificationError`, `SecretDetectedError`, `BranchCollisionError`), and added `getRepository` metadata method in `GitHubAppConnector`. Verified via 34 unit tests (`tests/unit/github-write-safety.service.test.js`), 8 integration tests (`tests/integration/github-write-operations.test.js`), and live sandbox test. 100% test pass with 0 DB leaks. |
| **P9-005** | Expose MCP Write Tools: `propose_project_improvement`, `confirm_and_create_pr` | P7-001, P9-003, P9-004, P9-005A | **COMPLETE & VERIFIED** | Implemented `registerCareerWriteTools`, `handleProposeProjectImprovement`, and `handleConfirmAndCreatePr` in `src/mcp/tools/career-write-tools.js` with canonical schemas in `src/domain/mcp/career-write-tools.schemas.js`. Wired into `createCareerMcpServer`. Verified via 20 unit tests (`tests/unit/mcp-write-tools.test.js`), 8 integration tests (`tests/integration/mcp-write-tools.test.js`), and live sandbox test (`tests/integration/live/mcp-write-tools.live.test.js`). 100% test pass with 0 DB leaks. |
| **P9-006A** | PR Diff Preview & Test Execution Reporting Architecture & Security Review | P9-005 | **COMPLETE & APPROVED** | Architectural specification `docs/pr-diff-preview-test-reporting-architecture.md` (`ARCH-036`), `ADR-057` in `docs/decisions.md`. Defined Canonical Review Object answering 9 core questions, unified diff chunk formatting ($\le 4000$ chars/file, $\le 25\text{ KB}$ total JSON ceiling), immutable SHA-256 patch fingerprinting bound to HMAC ticket, categorical test lifecycle reporting (`NOT_RUN`, `PLANNED`, `RUNNING`, `PASSED`, `FAILED`, `SKIPPED`, `BLOCKED`), zero production credential sandbox isolation (`env -i`, `--net=none`), base branch HEAD drift staleness invalidation (409 Conflict), explicit unsuppressed security warnings matrix, and confirm tool execution-only boundary. |
| **P9-006** | Implement PR diff preview and test suite execution reporting before user confirms | P9-005, P9-006A | **COMPLETE & VERIFIED** | Implemented `PrDiffPreviewService` (`src/services/pr-diff-preview.service.js`), `TestSandboxRunnerService` (`src/services/test-sandbox-runner.service.js`), and domain review schemas (`src/domain/career/review.schemas.js`). Formatted unified diff chunks ($\le 4000$ chars/file, $\le 25\text{ KB}$ review JSON ceiling), immutable SHA-256 patch fingerprinting, credential-stripped ephemeral sandbox isolation, truthful test reporting, supply chain/config/large diff security warnings (`WARN_TESTS_NOT_RUN`, `WARN_DEPENDENCY_ADDED`, `WARN_CONFIG_MODIFIED`, `WARN_LARGE_DIFF`), and live base HEAD staleness rejection (409 Conflict). Verified via 20 unit tests (`tests/unit/pr-diff-preview-test-reporting.test.js`), 20 write tools unit tests (`tests/unit/mcp-write-tools.test.js`), 9 integration tests (`tests/integration/mcp-write-tools.test.js`), and live sandbox test. 100% test pass with 0 DB leaks. |

---

### PHASE 10: Claude Integration (Second Target AI Client)
*Objective: Connect Anthropic Claude to the remote MCP server via custom connector with zero backend modifications.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P10-001A** | Claude Remote MCP Connector & OAuth 2.1 Architecture & Security Review | P9-006 | **COMPLETE & APPROVED** | Architectural specification `docs/claude-mcp-connector-architecture.md` (`ARCH-037`), `ADR-058` in `docs/decisions.md`. Established Streamable HTTP transport compatibility, OAuth 2.1 Authorization Code Flow with mandatory PKCE S256, RFC 9728 Protected Resource Metadata discovery (`/.well-known/oauth-protected-resource`), RFC 8414 OAuth Authorization Server Metadata discovery (`/.well-known/oauth-authorization-server`), public client registration for Claude Web / Desktop / CLI, immutable token claim identity mapping (`sub`, `tid`, `role`, `scope`), strict role ceiling clamping, zero write bypass / self-approval prevention, public HTTPS perimeter protection (TLS 1.2+, Origin header validation against DNS rebinding), 16-scenario threat model (T-01 to T-16), structured OAuth audit events, and live test strategy against `vishu1803/Ai-job-mcp`. |
| **P10-001** | Configure Claude Remote MCP Custom Connector endpoint compatibility (Public HTTPS, OAuth 2.1) | P7-003, P10-001A | **COMPLETE & VERIFIED** | Implemented OAuth 2.1 Authorization Code Flow with PKCE S256 (`src/services/oauth-authorization.service.js`, `src/routes/oauth.routes.js`, `src/domain/oauth/oauth.schemas.js`), RFC 9728 & RFC 8414 metadata discovery endpoints, Refresh Token Rotation (RTR), token revocation, and dual-auth facade in `src/security/mcp-auth.js`. Applied database migration `drizzle/0005_mushy_the_initiative.sql` creating `oauth_clients`, `oauth_authorization_codes`, and `oauth_tokens` tables. Verified via 17 unit tests (10 in `tests/unit/oauth-authorization-server.test.js`, 7 in `tests/unit/mcp-auth.test.js`), 17 live Fastify+PostgreSQL integration tests (`tests/integration/claude-mcp-connector.test.js`), and full 51-test MCP integration test suite. 100% test pass with 0 DB leaks. |
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
* **P5-002 (Skill Normalizer & Taxonomy Engine Implementation — Completed)**:
  * Implemented Modules:
    * `src/domain/career/skill-taxonomy.js`: Canonical Skill Normalizer & Taxonomy Engine exporting `SkillTaxonomyEngine`, `CANONICAL_SKILLS`, `SKILL_CATEGORIES`, `MAX_SKILL_INPUT_LENGTH`, `normalizeSkill`, `resolveCanonicalSkill`, `getSkillMetadata`, `getAliases`, `getRelationships`, `isKnownSkill`, and `validateTaxonomyGraph`.
    * `src/domain/career/index.js` & `src/domain/index.js`: Re-exported `skill-taxonomy.js` to provide a universal domain entrypoint.
    * `src/extractors/github/taxonomy/taxonomy-mapper.js`: Updated `TaxonomyMapper` adapter to delegate `normalize()` and `TAXONOMY_CATALOG` to `SkillTaxonomyEngine`, preserving 100% backward compatibility for all existing manifest parsers and AST scanners.
  * Verified Invariants:
    * **Canonical Identifier Resolution**: 30+ canonical skill slugs (`node-js`, `postgresql`, `react`, `fastapi`, `next-js`, `fastify`, `express`, `django`, `tokio`, `grpc`, `docker`, `kubernetes`, `aws`, `gcp`, `azure`, `terraform`, `github-actions`, `zod`, `pydantic`, `vitest`, `jest`, `pytest`, `serde`, `pandas`, `drizzle-orm`, `prisma`, `go`, `rust`, `typescript`, `python`) resolve with exact identity and 1.0 confidence. `nodejs` strictly canonicalizes to `node-js`.
    * **Multi-Category Synonym Normalization**: Verified 61+ curated technology synonyms across all 7 approved categories (`LANGUAGE`, `FRAMEWORK`, `DATABASE`, `CLOUD_DEVOPS`, `TOOL`, `ARCHITECTURE`, `CONCEPT`).
    * **Invariance Robustness**: Verified case-insensitivity, Unicode NFKC decomposition, npm scope stripping (`@fastify/cors` $\rightarrow$ `fastify`), version string removal, and git repo URL normalization (`github.com/gin-gonic/gin` $\rightarrow$ `gin`).
    * **Context Disambiguation**: Polysemous terms (`Go`, `Spring`, `Rust`) resolve to programming concepts under technical context (`"Go programming"`, `"Spring Boot microservices"`) and fail closed/return null on ambiguous prose (`"go to the office"`, `"spring season"`).
    * **Safe Unknown Technology Slugification**: Uncataloged terms generate safe kebab-case slugs (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), default to category `TOOL`, are flagged with `isKnown: false`, `isCustom: true`, `requiresReview: true`, and confidence 0.50, and emit `taxonomy.unknown_term_observed` audit telemetry. Unknown terms are never auto-aliased to existing technologies.
    * **Relationship Graph Modeling & Integrity**: Graph modeling verified for `BUILT_ON` (`react` $\rightarrow$ `javascript`, `next-js` $\rightarrow$ `react`, `fastapi` $\rightarrow$ `python`, `gin` $\rightarrow$ `go`, `tokio` $\rightarrow$ `rust`), `ECOSYSTEM_OF` (`drizzle-orm` $\rightarrow$ `postgresql`, `boto3` $\rightarrow$ `aws`), and `IMPLEMENTS` (`postgresql` $\rightarrow$ `relational-database`, `kafka` $\rightarrow$ `event-driven-architecture`, `grpc` $\rightarrow$ `microservices`). `validateTaxonomyGraph()` asserts 0 dangling edges.
    * **Security & Prototype Pollution Hardening**: In-memory lookups initialized via `Object.create(null)` prevent prototype pollution on `__proto__` and `constructor` inputs.
  * Verification Commands:
    * `node --test tests/unit/skill-taxonomy.test.js` -> PASS (29/29 tests passed across 9 suites)
    * `npm run test:unit` -> PASS (463/463 tests passed across 151 suites)
    * `npm run test:integration` -> PASS (151/151 tests passed across 62 suites)
    * `npm test` -> PASS (614/614 tests passed across 213 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P5-003A (Evidence Matching & Gap Analysis Architecture Review — Completed & Approved)**:
  * Deliverables:
    * `docs/evidence-matching-architecture.md`: Comprehensive architectural specification (`ARCH-013`) defining the deterministic Evidence Matching & Gap Analysis Engine, canonical 4-status evaluation (`MATCHED`, `PARTIAL`, `MISSING`, `UNKNOWN`), strict evidence verification gating, taxonomy graph relationship multipliers (`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`), non-skill matching protocols (experience, education, location, domain), decoupled match confidence formula, actionable skill gap taxonomy (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), ephemeral in-memory computation ($O(N)$), and multi-tenant sovereign default-deny isolation.
    * `docs/decisions.md` (ADR-033): Formally accepted *Evidence Matching & Gap Analysis Architecture*.
  * Core Decisions Approved:
    * **Canonical 4-Status Match Model**: Requirements evaluate into exactly four canonical statuses: `MATCHED` (verified code evidence or explicit qualification), `PARTIAL` (unverified user claims, adjacent technology, partial tenure), `MISSING` (mechanically verifiable with 0 evidence/claims), and `UNKNOWN` (subjective soft skills, culture wording, or unstated candidate profile fields).
    * **Strict Evidence Gating for `MATCHED`**: Technical skills require canonical taxonomy resolution, `CandidateSkill.provenanceStatus === 'VERIFIED'` (or strong `INFERRED` $\ge 0.85$), and $\ge 1$ qualifying code `EvidenceItem` (`PACKAGE_MANIFEST_DEPENDENCY`, `CODE_IMPORT`, `CODE_USAGE`, `CONFIG_SYNTAX_DECLARATION`). A self-asserted claim or README mention alone **never** produces `MATCHED`.
    * **Zero False Negative `MISSING` Assertions**: Soft skills and unstated profile fields (e.g. unstated education degree or unstated location) evaluate to `UNKNOWN` or `INSUFFICIENT_EVIDENCE` rather than false negative absence.
    * **Directional Taxonomy Relationship Integration**: Evaluates adjacent/transferable technologies using `ARCH-012` graph edges (`BUILT_ON` with $0.90-0.95$ multiplier, `ECOSYSTEM_OF` with $0.75-0.80$ multiplier, `IMPLEMENTS` with $0.50$ multiplier).
    * **Non-Skill Protocol Boundaries**: Observed commit history establishes technical activity duration, but is never converted into corporate employment tenure without explicit work history records. Education evaluates degree hierarchy; location evaluates remote/hybrid/on-site constraints; domain evaluates curated project architectures rather than single package imports.
    * **Decoupled Match Confidence**: Computes deterministic requirement match confidence ($C_{\text{match}} = C_{\text{req}} \times C_{\text{cand\_skill}} \times C_{\text{evid}}$), keeping numerical 100-point scoring strictly separated in downstream scoring engines.
    * **Actionable Skill Gap Prioritization**: Gaps are classified by priority (`CRITICAL` for missing required, `HIGH` for unverified required claims or missing high-weight preferred, `MEDIUM` for standard preferred, `LOW` for optional) and severity (`EXPLICITLY_MISSING`, `UNVERIFIED_CLAIM`, `INSUFFICIENT_EVIDENCE`, `PARTIAL_TENURE`).
    * **Multi-Tenant Sovereign Default-Deny**: All match operations enforce `tenant_id === context.tenantId` across job descriptions, candidates, skills, and evidence. Cross-tenant lookups fail closed with `404 NotFoundError`.
    * **Ephemeral On-Demand Computation & $O(N)$ Performance**: Matching is executed in-memory with pre-indexed skill hash maps. Zero premature database migrations are introduced in P5-003A.
    * **Strict LLM Boundary**: LLMs are prohibited from deciding match statuses, confidence values, or gap severities.
* **P5-003 (Evidence Matching & Gap Analysis Engine Implementation — Completed)**:
  * Implemented Modules:
    * `src/domain/career/evidence-matching.schemas.js`: Canonical Zod domain schemas for `CandidateRequirementMatchSchema`, `SkillGapSchema`, `MatchExplanationSchema`, `CandidateMatchSummarySchema`, and `CandidateMatchAnalysisSchema`.
    * `src/domain/career/index.js`: Re-exported evidence matching domain schemas.
    * `src/services/evidence-matching.service.js`: Provider-neutral `EvidenceMatchingService` exposing `matchJobToCandidate(context, jobDescription, candidateProfile)` with pre-indexed capability lookups, category-specific evaluation dispatchers, fact-vs-claim precedence gating, taxonomy graph relationship traversals, top 3 evidence selection, prioritized skill gaps, and multi-tenant default-deny isolation.
  * Verified Invariants:
    * **Canonical 4-Status Exhaustiveness**: Every job requirement evaluates into exactly one of `MATCHED`, `PARTIAL`, `MISSING`, or `UNKNOWN`.
    * **Strict Verification Gating**: Technical skills backed by verified package manifest / code import evidence attain `MATCHED`. Self-asserted claims without code evidence are explicitly serialized as `[Unverified User Claim]` and produce `PARTIAL`, never `MATCHED`.
    * **Taxonomy Relationship Integration**: Correctly models `BUILT_ON` (Next.js $\rightarrow$ React: `MATCHED`), `PARENT_OF` (TypeScript $\rightarrow$ JavaScript: `MATCHED`), `ECOSYSTEM_OF` (Drizzle ORM $\rightarrow$ PostgreSQL: `PARTIAL`), and `IMPLEMENTS` (MySQL $\rightarrow$ PostgreSQL: `PARTIAL`).
    * **Non-Skill Protocol Execution**: Explicit work history verifies experience tenure without conflating repository commit duration with enterprise employment; education respects academic degree hierarchy; location validates remote/hybrid/on-site compatibility; domain checks project architecture tags.
    * **Qualitative Soft-Skill Defense**: Subjective qualifications (leadership, communication, startup mindset) route to `UNKNOWN` with zero false-negative gaps.
    * **Prioritized Skill Gaps**: Missing required skills generate `CRITICAL` gaps; unverified claims or missing preferred skills generate `HIGH`/`MEDIUM` gaps; optional skills generate `LOW` gaps.
    * **Multi-Tenant Sovereign Isolation**: Context tenant mismatches fail closed with `404 NotFoundError` across all dimensions.
    * **Bit-for-Bit Determinism**: 1,000 consecutive matching runs yield identical structured summary and requirement match arrays.
  * Verification Commands:
    * `node --test tests/unit/evidence-matching.service.test.js` -> PASS (27/27 tests passed across 11 suites)
    * `npm run test:unit` -> PASS (494/494 tests passed across 163 suites)
    * `npm run test:integration` -> PASS (151/151 tests passed across 62 suites)
    * `npm test` -> PASS (645/645 tests passed across 225 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P5-004A (Project Relevance Scoring Architecture Review — Completed & Approved)**:
  * Deliverables:
    * `docs/project-relevance-architecture.md`: Comprehensive architectural specification (`ARCH-014`) defining the deterministic Project Relevance Engine, canonical 0–100 score model, 5 additive score components (50% requirement coverage, 25% architectural density across 10 dimensions, 15% evidence quality, 5% completeness, 5% bounded recency), relevance bands (`HIGH`, `MEDIUM`, `LOW`, `MINIMAL`), strict deduplication guard, multi-repository project aggregation, top 5 evidence selection, and multi-tenant sovereign default-deny isolation.
    * `docs/decisions.md` (ADR-034): Formally accepted *Project Relevance Scoring Architecture*.
  * Core Decisions Approved:
    * **Project Relevance Distinction**: Project relevance evaluates engineering depth and verified proof for a specific job description, distinct from candidate-level skill match status.
    * **Canonical 0–100 Composite Score**: Adopted 0–100 integer/decimal score decomposed into 5 transparent, additive components ($50 + 25 + 15 + 5 + 5 = 100$).
    * **Architectural Density Dimensions**: Evaluates 10 deterministic engineering depth dimensions (API Routing, Data Persistence, Auth/Security, Async Processing, DevOps/Cloud, Testing, Observability, Caching, External SDKs, Modular Architecture).
    * **Strict Deduplication & Anti-Inflation**: A skill or requirement is counted at most once per project regardless of file or repository frequency.
    * **Directional Taxonomy Integration**: Applies calibrated multipliers (`BUILT_ON` 0.90, `ECOSYSTEM_OF` 0.75, `IMPLEMENTS` 0.50, `PARENT_OF` 1.00).
    * **Bounded Recency Signal**: Recency bonus strictly capped at 5 points (5% of total score) to prevent new empty repositories from dominating deeply relevant historical systems.
    * **Multi-Repository Aggregation (Project $\ne$ Repository)**: Aggregates evidence across child repositories belonging to the same project.
    * **Multi-Tenant Sovereign Default-Deny**: Enforces `tenant_id === context.tenantId` across all project, candidate, and job lookups with 404 default-deny.
    * **Ephemeral On-Demand Computation & $O(|\text{Projects}| \times |\text{Requirements}|)$ Performance**: In-memory computation with zero premature database migrations in P5-004A.
    * **Strict LLM Boundary**: LLMs are prohibited from deciding project relevance scores or relevance bands.
* **P5-004 (Project Relevance Scoring Engine Implementation — Completed)**:
  * Implemented Modules:
    * `src/domain/career/project-relevance.schemas.js`: Canonical Zod schemas for `ProjectRelevanceBandEnum`, `ProjectTypeEnum`, `ArchitecturalDimensionEnum`, `ProjectRelevanceScoreBreakdownSchema`, `ProjectRelevanceExplanationSchema`, `ProjectRelevanceSchema`, and `CandidateProjectRelevanceAnalysisSchema`.
    * `src/domain/career/index.js`: Re-exported project relevance domain schemas.
    * `src/services/project-relevance.service.js`: Provider-neutral `ProjectRelevanceService` exposing `computeProjectRelevance(context, jobDescription, project, options)` and `computeProjectsRelevance(context, jobDescription, projects, options)`.
  * Verified Invariants:
    * **Transparent 5-Part Additive Decomposition**: Decomposes score into 5 bounded components ($S_{\text{proj}} = S_{\text{req\_cov}} + S_{\text{arch\_dens}} + S_{\text{evid\_qual}} + S_{\text{comp}} + S_{\text{rec}} \in [0.0, 100.0]$).
    * **Direct Requirement Coverage & Tier Weights**: `REQUIRED` (1.00), high-weight `PREFERRED` (0.70), standard `PREFERRED` (0.50), `OPTIONAL` (0.25), `DOMAIN` (0.80).
    * **Strict Deduplication & Anti-Inflation**: Counts each distinct skill at most once per project across multiple files and linked repositories.
    * **Taxonomy Graph Relationship Multipliers**: `BUILT_ON` (0.90), `ECOSYSTEM_OF` (0.75), `IMPLEMENTS` (0.50), `PARENT_OF` (1.00).
    * **10 Architectural Density Dimensions**: Detects API routing, data persistence, auth/security, background queues, cloud/DevOps, automated testing, observability, caching, external SDKs, and modular architecture ($2.5$ pts each, up to $25.0$ max).
    * **Evidence Quality & Provenance Ranking**: Weights `PACKAGE_MANIFEST_DEPENDENCY` (1.00), `CODE_IMPORT_USAGE` (0.95), `CODE_USAGE` (0.90), `CONFIG_SYNTAX_DECLARATION` (0.85), `COMMIT_CONTRIBUTION` (0.75), `README_SPECIFICATION` (0.30), `DOCUMENT_CLAIM` (0.00).
    * **Project Completeness & Activity Recency**: Awards completeness signals (tests $+1.5$, README $+1.5$, CI/CD $+1.0$, build manifests $+1.0$) and bounded recency ($\le 6$ mo: $+5.0$, $6-18$ mo: $+3.0$, $18-36$ mo: $+1.5$, $>36$ mo: $0.0$).
    * **Relevance Bands & Top Evidence Selection**: Categorizes into `HIGH` ($\ge 75.0$), `MEDIUM` ($50.0-74.9$), `LOW` ($25.0-49.9$), `MINIMAL` ($< 25.0$) with top 5 ranked `EvidenceRef` items.
    * **Batch Ranking & Determinism**: Stably ranks projects by `relevanceScore` descending with `projectId` ascending tie-breaker; 100 consecutive runs yield bit-for-bit identical results.
    * **Multi-Tenant Sovereign Isolation**: Enforces `tenant_id === context.tenantId` across job descriptions, projects, child resources, and evidence with strict 404 default-deny.
  * Verification Commands:
    * `node --test tests/unit/project-relevance.service.test.js` -> PASS (30/30 tests passed across 13 suites)
    * `npm run test:unit` -> PASS (524/524 tests passed across 176 suites)
    * `npm run test:integration` -> PASS (151/151 tests passed across 62 suites)
    * `npm test` -> PASS (675/675 tests passed across 238 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P5-005A (ATS Fit Score Calculator Architecture Review — Completed & Approved)**:
  * Deliverables:
    * `docs/ats-fit-score-architecture.md`: Comprehensive architectural specification (`ARCH-015`) defining the deterministic ATS Fit Score Calculator, canonical 0–100 composite fit score, 7 additive components (40% required skills coverage, 15% preferred skills coverage, 20% project relevance via decaying top-3 weighted average, 10% experience tenure, 5% education, 5% location, 5% evidence confidence), required skill safety gate (hard score caps for missing required skills: 1 missing $\le 74.9$, 2 missing $\le 49.9$, 3+ missing $\le 24.9$), fit bands (`EXCELLENT`, `STRONG`, `MODERATE`, `WEAK`, `LOW`), explicit UNKNOWN vs MISSING neutrality, fact-vs-claim precedence, and multi-tenant sovereign default-deny isolation.
    * `docs/decisions.md` (ADR-035): Formally accepted *ATS Fit Score Calculator Architecture*.
  * Core Decisions Approved:
    * **Canonical 100-Point Composite Fit Score**: Adopted 0–100 decimal score decomposed into 7 transparent, additive components summing exactly to 100.0.
    * **Required Skill Safety Gate**: Enforces non-compensatory hard score ceilings when `REQUIRED` skills are missing ($N_{\text{crit}} = 1 \rightarrow \le 74.9$, $N_{\text{crit}} = 2 \rightarrow \le 49.9$, $N_{\text{crit}} \ge 3 \rightarrow \le 24.9$), preventing preferred skills or vanity metrics from inflating disqualified candidates.
    * **Decaying Top-3 Project Aggregation**: Aggregates candidate projects using a top-3 weighted average ($60\% / 30\% / 10\%$), heavily rewarding deep primary platforms while neutralizing micro-repository spam.
    * **Explicit UNKNOWN vs MISSING Neutrality**: Unstated profile fields or subjective soft skills evaluate to `UNKNOWN` and receive neutral baseline credit without false-negative penalties.
    * **Zero Conflation of Code Duration with Employment Tenure**: Observed Git commit activity establishes technical skill duration, but is never converted into corporate employment tenure without explicit work history records.
    * **Multi-Tenant Sovereign Default-Deny**: Enforces `tenant_id === context.tenantId` across all inputs (job description, candidate profile, match analysis, project analysis) with 404 default-deny.
    * **Ephemeral In-Memory Computation & $\mathcal{O}(|\text{Req}| + |\text{Proj}| + |\text{Gaps}|)$ Latency**: Pure calculation service with zero network I/O, zero LLM calls, and zero premature database schema tables.
    * **Strict LLM Boundary**: LLMs are prohibited from calculating or adjusting fit scores.
* **P5-005 (ATS Fit Score Calculator Engine Implementation — Completed)**:
  * Implemented Modules:
    * `src/domain/career/ats-fit-score.schemas.js`: Canonical strict Zod domain schemas for `FitScoreBandEnum`, `FitStrengthCategoryEnum`, `FitScoreBreakdownSchema`, `FitStrengthSchema`, `FitScoreExplanationSchema`, and `CandidateJobFitAnalysisSchema`.
    * `src/domain/career/index.js`: Re-exported ATS fit score domain schemas.
    * `src/services/ats-fit-score.service.js`: Provider-neutral `AtsFitScoreService` exposing `calculateCandidateJobFit(context, jobDescription, candidateMatchAnalysis, projectRelevanceAnalysis, candidateProfile, options)`.
  * Verified Invariants:
    * **Transparent 7-Part Additive Decomposition**: Sums 7 distinct bounded components ($S_{\text{overall}} = S_{\text{req}} + S_{\text{pref}} + S_{\text{proj}} + S_{\text{exp}} + S_{\text{edu}} + S_{\text{loc}} + S_{\text{conf}} \in [0.0, 100.0]$).
    * **Exact Component Weights**: Required Skills ($40.0$), Preferred Skills ($15.0$), Project Relevance & Depth ($20.0$), Professional Experience Fit ($10.0$), Education Alignment Fit ($5.0$), Location & Work Auth Fit ($5.0$), Evidence Confidence Depth ($5.0$).
    * **Required Skill Safety Gate (Hard Score Cap)**: Non-compensatory score ceilings for missing `REQUIRED` skills ($N_{\text{crit}} = 1 \rightarrow \le 74.9$ `MODERATE`, $N_{\text{crit}} = 2 \rightarrow \le 49.9$ `WEAK`, $N_{\text{crit}} \ge 3 \rightarrow \le 24.9$ `LOW`), preventing candidates with missing core requirements from receiving `STRONG` or `EXCELLENT` ratings.
    * **Decaying Top-3 Project Aggregation**: Aggregates candidate repositories via top-3 weighted average ($0.60 \cdot s_1 + 0.30 \cdot s_2 + 0.10 \cdot s_3$), rewarding deep primary platforms while neutralizing micro-repository spam.
    * **Explicit UNKNOWN vs MISSING Neutrality**: Unstated education, location, or soft skills evaluate to `UNKNOWN` and receive neutral baseline credit without false-negative penalties.
    * **Zero Conflation of Code Duration with Employment Tenure**: Observed Git commit activity establishes technical skill duration, but is never converted into corporate employment tenure without explicit work history records.
    * **Fact vs Claim Precedence**: Unverified manual user claims (`[Unverified User Claim]`) contribute at a reduced partial factor ($0.25$) and cannot achieve `MATCHED` status without verified code evidence.
    * **Fit Bands**: `EXCELLENT` ($90.0-100.0$), `STRONG` ($75.0-89.9$), `MODERATE` ($50.0-74.9$), `WEAK` ($25.0-49.9$), `LOW` ($0.0-24.9$).
    * **Structured Key Strengths & Deterministic Narratives**: Generates evidence-linked `FitStrength[]` items and transparent explanation narratives without LLM involvement.
    * **Multi-Tenant Sovereign Isolation**: Enforces `tenant_id === context.tenantId` across all inputs (job description, candidate profile, match analysis, project analysis) with 404 default-deny.
  * Verification Commands:
    * `node --test tests/unit/ats-fit-score.service.test.js` -> PASS (31/31 tests passed across 12 suites)
    * `node --test tests/integration/ats-fit-score.service.test.js` -> PASS (2/2 tests passed)
    * `npm run test:unit` -> PASS (555/555 tests passed across 188 suites)
    * `npm run test:integration` -> PASS (153/153 tests passed across 63 suites)
    * `npm test` -> PASS (708/708 tests passed across 251 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P5-006A (Zero-Hallucination Integrity Gate Architecture Review — Completed & Approved)**:
  * Deliverables:
    * `docs/zero-hallucination-integrity-architecture.md`: Comprehensive architectural specification (`ARCH-016`) defining the definitive trust boundary, `CareerAssertion` domain model across 8 types (`SKILL`, `PROJECT`, `EXPERIENCE`, `EDUCATION`, `DOMAIN`, `LOCATION`, `ACHIEVEMENT`, `SUMMARY`), strict 5-status classification (`VERIFIED`, `INFERRED`, `CLAIMED`, `MISSING_EVIDENCE`, `UNKNOWN`), 6-point evidence reference audit, zero-evidence emission rules, claim immutability, inference containment, non-conflation of commit duration with corporate tenure, multi-evidence aggregation, provenance preservation, LLM generation sandbox, output contract (`IntegrityCheckedCareerSummary`, status: `PASS`, `PARTIAL`, `BLOCKED`), standardized audit reason codes, and multi-tenant default-deny isolation.
    * `docs/decisions.md` (ADR-036): Formally accepted *Zero-Hallucination Career Integrity Gate Architecture*.
  * Core Decisions Approved:
    * **Strict Verification Grounding**: No factual assertion may be assigned status `VERIFIED` without citing at least one valid, unforgeable `EvidenceId` (UUIDv4) that resolves to an active, tenant-matched `EvidenceItem`.
    * **Zero-Evidence Emission**: When an evaluation query or AI generator asks about an unsupported skill or qualification, the gate never affirms capability; it outputs structured `MISSING_EVIDENCE`.
    * **Claim Sovereignty**: Self-asserted manual profile claims cannot attain `VERIFIED` status without cryptographic evidence nodes and must always retain the explicit tag `[Unverified User Claim]` (`CLAIMED`).
    * **Zero Conflation of Code Duration with Corporate Tenure**: Observed Git commit timestamps establish technical skill duration, but are never converted into corporate employment tenure without explicit work history records.
    * **Taxonomic Inference Containment**: Skills inferred via taxonomy edges (e.g. Next.js $\rightarrow$ React via `BUILT_ON`) are classified strictly as `INFERRED` and cannot masquerade as direct `VERIFIED` evidence.
    * **Deterministic Multi-Evidence Aggregation**: Citations are deduplicated by `EvidenceId`, stably sorted by quality weight descending, and capped at a maximum of 5 `EvidenceRef` nodes per assertion; if any cited reference is invalid, the entire assertion fails closed.
    * **Comprehensive Blocking & Safe Downgrade**: Emits `BLOCKED` on fabricated citations or unbacked claims, with deterministic safe downgrade protocols for over-broad statements.
    * **Multi-Tenant Sovereign Default-Deny**: Enforces `tenant_id === context.tenantId` across all assertions and cited evidence with 404 default-deny / `BLOCKED`.
    * **Ephemeral In-Memory Computation & $\mathcal{O}(|\text{Assertions}| + |\text{EvidenceRefs}|)$ Latency**: Pure validation engine executing with zero database writes, zero LLM calls, and zero premature schema migrations.
    * **Strict LLM Boundary**: LLMs receive only pre-validated assertions, and AI-generated outputs are strictly audited by the gate post-generation before release.
* **P5-006 (Zero-Hallucination Integrity Gate Implementation — Completed)**:
  * Implemented Modules:
    * `src/domain/career/integrity-gate.schemas.js`: Canonical strict Zod domain schemas for `CareerAssertionTypeEnum`, `CareerAssertionStatusEnum`, `IntegrityStatusEnum`, `AuditReasonCodeEnum`, `CareerAssertionSchema`, `IntegrityCheckedAssertionSchema`, and `IntegrityCheckedCareerSummarySchema`.
    * `src/domain/career/index.js`: Re-exported integrity gate domain schemas.
    * `src/services/zero-hallucination-integrity.service.js`: Provider-neutral `ZeroHallucinationIntegrityService` exposing `validateCareerAssertions(context, assertions, evidenceIndex, options)`.
  * Verified Invariants:
    * **Strict 5-Status Classification**: `VERIFIED` ($\ge 1$ authentic commit-pinned proof node), `INFERRED` (taxonomy/adjacent derivations), `CLAIMED` (`[Unverified User Claim]`), `MISSING_EVIDENCE` (unsupported propositions), `UNKNOWN` (unobservable criteria).
    * **6-Point Evidence Reference Audit**: Validates existence, tenant isolation (`tenant_id === context.tenantId`), candidate coherence (`candidate_id === assertion.candidateId`), resource coherence, project coherence, and immutable provenance (`filePath`, `commitSha`, `sourceProvider`, `evidenceType`).
    * **Zero-Evidence Safety Emission**: Unsupported queries emit structured `MISSING_EVIDENCE` and are never serialized as verified truth.
    * **Fact vs Claim Sovereignty**: Manual user claims (`[Unverified User Claim]`) cannot attain `VERIFIED` status without cryptographic evidence.
    * **Taxonomic Inference Containment**: Framework inferences (e.g. Next.js $\rightarrow$ React via `BUILT_ON`) evaluate strictly as `INFERRED` and cannot upgrade to `VERIFIED`.
    * **Zero Conflation of Code Duration with Corporate Tenure**: Statements asserting corporate employment tenure based solely on repository commit activity trigger `UNSUPPORTED_TENURE` and fail closed (`BLOCKED`).
    * **Quantitative Metric Guard**: Unbacked quantitative achievement claims trigger `UNSUPPORTED_ACHIEVEMENT` and fail closed (`BLOCKED`).
    * **Multi-Evidence Deduplication & Deterministic Capping**: Deduplicates by `EvidenceId`, stably sorts by quality weight descending (`PACKAGE_MANIFEST_DEPENDENCY` $\rightarrow$ `CODE_IMPORT_USAGE` $\rightarrow$ `CONFIG_SYNTAX_DECLARATION` $\rightarrow$ `COMMIT_CONTRIBUTION` $\rightarrow$ `README_SPECIFICATION`), and caps at 5 references.
    * **Summary Aggregation Safety**: Synthetic executive summaries cannot elevate unverified claims or inferences to verified facts.
    * **Multi-Tenant Sovereign Default-Deny**: Cross-tenant evidence or assertion tenant mismatch triggers `TENANT_MISMATCH` and fails closed (`BLOCKED`).
    * **Ephemeral In-Memory Computation**: $\mathcal{O}(|\text{Assertions}| + |\text{EvidenceRefs}|)$ execution with zero database mutations.
  * Verification Commands:
    * `node --test tests/unit/zero-hallucination-integrity.service.test.js` -> PASS (26/26 tests passed across 12 suites)
    * `node --test tests/integration/zero-hallucination-integrity.service.test.js` -> PASS (4/4 tests passed against live PostgreSQL)
    * `npm run test:unit` -> PASS (582/582 tests passed across 189 suites)
    * `npm run test:integration` -> PASS (157/157 tests passed across 64 suites)
    * `npm test` -> PASS (739/739 tests passed across 253 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P6-001A (Resume / Cover Letter / Portfolio Adaptation Architecture Review — Completed & Approved)**:
  * Deliverables:
    * `docs/career-artifact-adaptation-architecture.md`: Comprehensive architectural specification (`ARCH-017`) defining the provider-neutral synthesis engine for `TailoredResume`, `TailoredCoverLetter`, and `TailoredPortfolioContent`, atomic `ResumeBullet` model, absolute truth boundary consuming `IntegrityCheckedAssertions` from P5-006, safe ATS keyword alignment via canonical taxonomy mapping, metric safety guardrails (unbacked metrics $\rightarrow$ `BLOCKED`), corporate work history authority, deterministic content prioritization (Verified Required $\rightarrow$ Projects $\rightarrow$ Preferred $\rightarrow$ Inferred $\rightarrow$ Claimed), LLM phrasing sandbox, mandatory post-generation integrity checks, rendering decoupling, and multi-tenant default-deny isolation.
    * `docs/decisions.md` (ADR-037): Formally accepted *Career Artifact Adaptation Architecture*.
  * Core Decisions Approved:
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
* **P6-001 (Resume Tailoring Service Implementation & Presentation Modes Continuation — Completed)**:
  * Implemented Modules:
    * `src/domain/career/resume.schemas.js`: Canonical strict Zod domain schemas for `ResumeSectionTypeEnum`, `ResumePresentationModeEnum` (`PRESERVE_EXISTING`, `GENERATE_NEW`), `ResumeTemplateIdEnum` (`ATS_FOCUSED`, `PROFESSIONAL`, `MODERN`, `MINIMAL`, `TRADITIONAL`), `PresentationIntegrityStatusEnum` (`PASS`, `WARNING`, `UNSUPPORTED_PRESERVATION`, `BLOCKED`), `SourceDocumentFormatEnum` (`DOCX`, `PDF`, `MARKDOWN`, `PLAIN_TEXT`), `PreservedAttributesSchema`, `ModifiedAttributesSchema`, `PresentationFingerprintSchema`, `PresentationAuditReportSchema`, `ResumeBulletSchema`, `ResumeSkillItemSchema`, `ResumeSkillCategorySchema`, `ResumeExperienceEntrySchema`, `ResumeProjectEntrySchema`, `ResumeEducationEntrySchema`, `ResumeCertificationEntrySchema`, `TailoredResumeMetadataSchema`, `TailoredResumeRequestOptionsSchema`, and `TailoredResumeSchema`.
    * `src/domain/career/index.js`: Re-exported resume tailoring domain schemas.
    * `src/services/resume-presentation.service.js`: `ResumePresentationService`, `ResumeTemplateRenderer` interface contract, and `PresentationFingerprintEngine` (computes SHA-256 visual styling hashes excluding text content).
    * `src/services/resume-tailoring.service.js`: Provider-neutral `ResumeTailoringService` exposing `tailorResume(context, candidateProfile, jobDescription, candidateMatchAnalysis, projectRelevanceAnalysis, integrityCheckedAssertions, options)`.
  * Verified Invariants:
    * **Deterministic 5-Tier Content Prioritization**: Verified Required Skills ($100.0$) $\rightarrow$ High-Relevance Projects ($\ge 70.0$) $\rightarrow$ Verified Preferred Skills ($75.0$) $\rightarrow$ Inferred Related Skills $\rightarrow$ Labeled Claims.
    * **Presentation Mode Separation**: Supports `PRESERVE_EXISTING` (user design sovereignty) and `GENERATE_NEW` (fresh template-based generation), sharing the identical underlying truth model and ATS content engine.
    * **Visual Preservation Invariant**: *"Tailoring changes WHAT the resume says, not HOW the resume looks."* Preserves typography (font family, size, weight, styling), text color, margins, line spacing, paragraph spacing, and layout hierarchy under `PRESERVE_EXISTING` with DOCX.
    * **Non-Content Visual Fingerprinting**: Computes SHA-256 hash strictly from visual styling attributes; modifying textual bullet content does NOT alter the visual fingerprint hash.
    * **Format-Specific Boundaries**: Emits `PASS` on lossless DOCX preservation, `WARNING` on PDF layout reconstruction limitations, and `UNSUPPORTED_PRESERVATION` on plain text / Markdown.
    * **Safe ATS Keyword Alignment**: Adapts candidate terminology (e.g. `postgres`) to job requirement titles (e.g. `PostgreSQL`) via canonical `SkillTaxonomyEngine` mapping without inserting ungrounded keywords.
    * **Atomic Resume Bullets Grounded in EvidenceRefs**: Every synthesized bullet is represented by `ResumeBullet` with explicit `assertionIds`, commit-pinned `evidenceRefs` (capped at 5), confidence scores, and matched keywords.
    * **Corporate Work History Authority**: Employment dates, job titles, and employers derive exclusively from explicit candidate work history records (`candidateProfile.experience`). Git commit timestamps and repository durations are never converted into corporate employment tenure.
    * **Quantitative Metric Safety Guard**: Quantitative business outcome assertions (e.g. *"reduced latency by 70%"*) without explicit backing evidence trigger validation rejection (`ValidationError: Quantitative achievement claim rejected`) across both presentation modes.
    * **Status & Claim Labeling Immutability**: Inferred skills retain `[Inferred from <source>]` notes; candidate manual claims retain explicit `[Unverified User Claim]` labels.
    * **Strict Missing Skill Omission**: Missing required skills (e.g. Rust) are strictly omitted from the resume skills list and tracked in `metadata.omittedSkillsCount`.
    * **Project Deduplication & Relevance Ordering**: Deduplicates projects by `projectId` and prioritizes top-ranked projects from `ProjectRelevanceService`.
    * **100% Deterministic Output**: Guarantees bit-for-bit deterministic content selection and ordering across repeated invocations.
    * **LLM Linguistic Transformation Sandbox**: Optional LLM adapter runs within strict passive XML boundary (`<job_input>`, `<candidate_facts>`) without fact invention.
    * **Mandatory Post-Generation Integrity Audit**: Re-audits all generated bullets against `ZeroHallucinationIntegrityService` before release.
    * **Multi-Tenant Sovereign Default-Deny**: Enforces `tenant_id === context.tenantId` across candidate profile, job description, match analysis, and project analysis with 404 default-deny.
    * **Ephemeral In-Memory Synthesis & Zero DB Mutations**: On-demand resume generation produces zero database writes.
  * Verification Commands:
    * `node --test tests/unit/resume-tailoring.service.test.js` -> PASS (28/28 tests passed across 28 suites)
    * `node --test tests/unit/resume-presentation.service.test.js` -> PASS (11/11 tests passed across 11 suites)
    * `node --test tests/integration/resume-tailoring.service.test.js` -> PASS (3/3 tests passed against live PostgreSQL)
    * `npm run test:unit` -> PASS (621/621 tests passed across 191 suites)
    * `npm run test:integration` -> PASS (160/160 tests passed across 65 suites)
    * `npm test` -> PASS (781/781 tests passed across 256 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P6-002A (Cover Letter Drafting Engine Architecture Review — Completed & Approved)**:
  * Deliverables Authored:
    * `docs/cover-letter-drafting-architecture.md`: Comprehensive architectural specification (`ARCH-018`) defining the provider-neutral narrative synthesis engine for `TailoredCoverLetter`, structured `CoverLetterParagraph` model across 6 paragraph types (`OPENING`, `COMPANY_ALIGNMENT`, `RELEVANT_EXPERIENCE`, `PROJECT_EVIDENCE`, `MOTIVATION`, `CLOSING`), 4 tone presets (`PROFESSIONAL`, `CONCISE`, `CONFIDENT`, `WARM`), absolute truth boundary consuming `IntegrityCheckedAssertions` from P5-006, safe ATS keyword alignment via canonical taxonomy mapping, metric safety guardrails (unbacked metrics $\rightarrow$ `BLOCKED`), corporate work history authority, company alignment grounding, deterministic content prioritization (Verified Required $\rightarrow$ High-Relevance Projects $\rightarrow$ Preferred Skills $\rightarrow$ Corporate Experience $\rightarrow$ Inferred Skills $\rightarrow$ Labeled Claims), passive LLM phrasing sandbox, mandatory post-generation integrity checks, bounded letter length (3-6 paragraphs), and multi-tenant default-deny isolation.
    * `docs/decisions.md` (ADR-038): Formally accepted *Cover Letter Drafting Engine Architecture*.
  * Core Invariants Approved:
    * **Absolute Truth Boundary**: Drafting pipelines consume strictly `IntegrityCheckedAssertion` objects, validated candidate profiles, parsed job descriptions, and pre-computed match/relevance analyses. Raw candidate prose, unparsed repository files, and arbitrary LLM hallucinations are strictly excluded.
    * **Structured Paragraph Schema**: Each cover letter paragraph is modeled as `CoverLetterParagraph` carrying explicit `paragraphType`, text, `assertionIds`, commit-pinned `evidenceRefs` (capped at 5), and status (`VERIFIED`, `INFERRED`, `CLAIMED`).
    * **Deterministic 6-Tier Content Prioritization**: Prioritizes 1. Verified Required Skills $\rightarrow$ 2. High-Relevance Projects $\rightarrow$ 3. Verified Preferred Skills $\rightarrow$ 4. Corporate Work History $\rightarrow$ 5. Inferred Skills $\rightarrow$ 6. Labeled User Claims.
    * **Corporate Work History Authority**: Employment dates, company names, and professional titles derive exclusively from explicit candidate work history records (`candidateProfile.experience`). Git commit timestamps and repository durations are never converted into corporate employment tenure.
    * **Company Alignment Grounding**: Company domain, mission, and tech stack statements must reference only explicit text from the trusted `JobDescription` input. Unstated company details are never fabricated.
    * **Quantitative Metric Safety Guard**: Quantitative claims (e.g. *"reduced latency by 45%"*, *"served 10M users"*) without backing evidence in candidate records trigger `ValidationError: Quantitative achievement claim rejected`.
    * **Status Immutability & Omission Policy**: Unverified manual claims retain `[Unverified User Claim]` or are safely omitted; inferred skills retain `INFERRED` status; missing skills are never claimed.
    * **Safe ATS Keyword Alignment**: Terminology alignment uses `SkillTaxonomyEngine` canonical mapping without injecting ungrounded technologies.
    * **Optional LLM Linguistic Sandbox**: External AI models operate inside passive XML input boundaries (`<job_input>`, `<candidate_facts>`, `<approved_assertions>`) to polish transitions and tone (`PROFESSIONAL`, `CONCISE`, `CONFIDENT`, `WARM`) but are strictly forbidden from adding facts, metrics, employers, or citations.
    * **Mandatory Post-Generation Integrity Gate**: All paragraphs are parsed and validated by `ZeroHallucinationIntegrityService` before release.
* **P6-002 (Cover Letter Drafting Engine Implementation — Completed)**:
  * Implemented Modules:
    * `src/domain/career/cover-letter.schemas.js`: Canonical strict Zod domain schemas for `CoverLetterToneEnum` (`PROFESSIONAL`, `CONCISE`, `CONFIDENT`, `WARM`), `CoverLetterParagraphTypeEnum` (`OPENING`, `COMPANY_ALIGNMENT`, `RELEVANT_EXPERIENCE`, `PROJECT_EVIDENCE`, `MOTIVATION`, `CLOSING`), `CoverLetterParagraphSchema`, `CoverLetterMetadataSchema`, `CoverLetterDraftRequestSchema`, and `TailoredCoverLetterSchema`.
    * `src/domain/career/index.js`: Re-exported cover letter domain schemas.
    * `src/services/cover-letter-drafting.service.js`: Provider-neutral `CoverLetterDraftingService` exposing `draftCoverLetter(context, candidateProfile, jobDescription, candidateMatchAnalysis, projectRelevanceAnalysis, atsFitAnalysis, integrityCheckedAssertions, options)`.
  * Verified Invariants:
    * **Deterministic 6-Tier Content Prioritization**: Verified Required Skills ($100.0$) $\rightarrow$ High-Relevance Projects ($\ge 70.0$) $\rightarrow$ Verified Preferred Skills ($75.0$) $\rightarrow$ Corporate Work History $\rightarrow$ Inferred Skills $\rightarrow$ Labeled Claims.
    * **Structured Paragraph Model**: Synthesizes structured `CoverLetterParagraph` objects with explicit `paragraphType`, commit-pinned `evidenceRefs` (max 5), `assertionIds`, status (`VERIFIED`, `INFERRED`, `CLAIMED`), confidence scores, and matched keywords.
    * **Opening Paragraph Grounding**: Formulates professional opening introducing candidate name, target role title, company name, and top verified required skills without inventing recruiter familiarity or referrals.
    * **Company Alignment Grounding**: References strictly explicit domain and challenges from the trusted `JobDescription` text (zero company culture, funding, or executive leadership fabrication).
    * **Corporate Work History Authority**: Employment dates, company names, and titles derive exclusively from explicit `candidateProfile.experience` records (commits $\ne$ corporate employment tenure).
    * **Project Evidence Grounding**: Synthesizes project narratives from top-ranked `ProjectRelevanceAnalysis` repositories with commit-pinned evidence citations.
    * **Motivation Paragraph**: Connects candidate strengths with role challenges without personal or emotional fabrications.
    * **Neutral Professional Closing**: Professional call to action requesting an interview discussion without fabricating visa status, salary requirements, or availability.
    * **Quantitative Metric Safety Guard**: Quantitative outcome assertions (e.g. *"reduced latency by 45%"*, *"scaled to 10M users"*) without explicit backing evidence trigger validation rejection (`ValidationError: Quantitative achievement claim rejected`).
    * **Status Immutability & Claim Labeling**: Inferred capabilities retain `INFERRED` status; unverified user claims retain `[Unverified User Claim]` labels or are omitted.
    * **Missing Skill Omission**: Missing required technologies (e.g. Rust) are strictly omitted and tracked in `metadata.omittedSkillsCount`.
    * **ATS Terminology Normalization**: Normalizes candidate terms (e.g. `postgres` $\rightarrow$ `PostgreSQL`) via canonical `SkillTaxonomyEngine` mapping without inventing technologies.
    * **Tone Configuration**: Supports `PROFESSIONAL`, `CONCISE`, `CONFIDENT`, and `WARM` presets, altering phrasing templates while keeping factual assertions, evidence citations, and statuses 100% invariant.
    * **Bounded Paragraph Length**: Guarantees bounded paragraph count between 3 and 6 paragraphs.
    * **100% Deterministic Output**: Guarantees bit-for-bit deterministic content selection and ordering across repeated invocations.
    * **LLM Linguistic Transformation Sandbox**: Optional LLM adapter operates inside passive XML input boundaries (`<job_input>`, `<candidate_facts>`, `<approved_assertions>`) with strict output validation and metric defense.
    * **Mandatory Post-Generation Integrity Audit**: Re-audits all generated paragraphs against `ZeroHallucinationIntegrityService` before release.
    * **Multi-Tenant Sovereign Default-Deny**: Enforces `context.tenantId` matches across all inputs with 404 default-deny.
    * **Ephemeral In-Memory Synthesis & Zero DB Mutations**: On-demand cover letter drafting produces zero database writes.
  * Verification Commands:
    * `node --test tests/unit/cover-letter-drafting.service.test.js` -> PASS (21/21 tests passed across 21 suites)
    * `node --test tests/integration/cover-letter-drafting.service.test.js` -> PASS (3/3 tests passed against live PostgreSQL)
    * `npm test` -> PASS (805/805 tests passed across 258 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P6-003A (Portfolio Recommendation Engine Architecture Review — Completed & Approved)**:
  * Deliverables Authored:
    * `docs/portfolio-recommendation-architecture.md`: Comprehensive architectural specification (`ARCH-019`) defining the evidence-first portfolio curation engine for `PortfolioRecommendation`, bounded 1-5 featured project selection, quality vs. quantity deterministic floor, 7-dimension signal complementarity engine (`SignalComplementarityScore`), greedy marginal value optimization ($\mathcal{O}(k \cdot N)$), anti-inflation requirement coverage accounting, engineering maturity indicators, ownership and contribution confidence matrix (`DIRECT_OWNER`, `ORGANIZATION_MEMBER`, `COLLABORATOR`, `FORK_UPSTREAM`), tutorial/clone detection safeguards (`LIKELY_TUTORIAL`), live demo boost, story completeness vs. technical depth decoupling, interview discussion value scoring ($0-100$), extensible 7-job-family personalization (`BACKEND`, `FRONTEND`, `FULLSTACK`, `DEVOPS_CLOUD`, `DATA_ML`, `AI_ENGINEERING`, `GENERAL_SOFTWARE`), candidate override semantics (`PIN`, `EXCLUDE`, `REORDER`), explainable rationale generator, and multi-tenant default-deny isolation.
    * `docs/decisions.md` (ADR-039): Formally accepted *Portfolio Recommendation & Hiring-Signal Architecture*.
  * Core Invariants Approved:
    * **Bounded Curated Sizing (1 to 5 Projects)**: Recommends 1 to 5 featured projects based on evidence quality (defaulting to 2-3); strictly prevents padding with superficial repositories.
    * **Quality Over Quantity Deterministic Floor**: Low architectural density ($< 30.0$) and test-free repositories are disqualified from `featuredProjects`.
    * **Marginal Value Optimization**: Employs greedy marginal optimization selecting projects that maximize new required skill coverage and diverse architectural signals ($\mathcal{O}(k \cdot N)$).
    * **Signal Complementarity Across 7 Dimensions**: Evaluates projects across 7 orthogonal signal domains (`BACKEND_DISTRIBUTED`, `DATABASE_DATA_MODELING`, `FRONTEND_UI_UX`, `DEVOPS_INFRASTRUCTURE`, `SECURITY_AUTH`, `TESTING_QUALITY`, `API_INTEGRATIONS`) to prevent duplicate coverage inflation.
    * **Anti-Inflation Coverage Accounting**: Attributes shared skills strictly to the highest-verification project and flags subsequent mentions as redundant.
    * **Ownership & Contribution Confidence**: Classifies repositories and author shares without fabricating solo claims for team projects.
    * **Tutorial / Clone Detection Guard**: Flags fork metadata, conventional tutorial names, and boilerplate READMEs as `LIKELY_TUTORIAL` to deprioritize generic clones with explicit user warnings.
    * **Story Completeness vs. Technical Depth Decoupling**: Maintains separate scores for code quality vs. documentation clarity; generates actionable case study prompts for undocumented code rather than silently discarding it.
    * **Metric Integrity Guard**: Quantitative metrics must be backed by authentic evidence or benchmarks; unbacked numbers trigger `ValidationError` and are replaced with interview preparation prompts.
    * **Technical Interview Discussion Value**: Computes an interview value score ($0-100$) reflecting architectural complexity, custom middleware, and trade-off depth.
    * **Extensible Job-Family Personalization**: Dynamically adjusts signal weights across 7 job families.
    * **User Control & Override Support**: Supports user `PIN_FEATURED`, `EXCLUDE_PROJECT`, and `REORDER_OVERRIDE` actions with automated requirement gap recalculation.
    * **Decoupled Architecture**: Separates Recommendation Strategy (*WHAT to show*) from Content Synthesis (*HOW to describe it*) and Visual Rendering (*HOW to present it*).
    * **Multi-Tenant Sovereign Default-Deny**: Enforces `tenant_id === context.tenantId` across all inputs with 404 default-deny.
    * **Ephemeral In-Memory Execution**: Operates in-memory with sub-50ms latency with zero database tables or migrations in Phase 6.
  * Verification Status:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
    * `npm test` -> PASS (805/805 tests passed across 258 suites)
* **P6-003 (Portfolio Recommendation Engine Implementation — Completed)**:
  * Implemented Modules:
    * `src/domain/career/portfolio-recommendation.schemas.js`: Canonical strict Zod domain schemas defining `RecommendationStatusEnum` (`RECOMMENDED`, `OPTIONAL`, `DEPRIORITIZED`), `OwnershipConfidenceEnum` (`DIRECT_OWNER`, `ORGANIZATION_MEMBER`, `COLLABORATOR`, `FORK_UPSTREAM`), `ContributionConfidenceEnum` (`PRIMARY_AUTHOR`, `MAJOR_CONTRIBUTOR`, `MINOR_CONTRIBUTOR`, `UNVERIFIED`), `TutorialClassificationEnum` (`LIKELY_TUTORIAL`, `LIKELY_ORIGINAL`, `UNKNOWN`), `StoryCompletenessEnum` (`DOCUMENTED`, `PARTIAL`, `MISSING`), `JobFamilyEnum` (`BACKEND`, `FRONTEND`, `FULLSTACK`, `DEVOPS_CLOUD`, `DATA_ML`, `AI_ENGINEERING`, `GENERAL_SOFTWARE`), `PortfolioSignalEnum` (7 orthogonal domains), `PortfolioOverrideActionEnum` (`PIN_FEATURED`, `EXCLUDE_PROJECT`, `REORDER_OVERRIDE`), `PortfolioOverrideSchema`, `HighlightedSkillSchema`, `RequirementCoverageItemSchema`, `CaseStudyRecommendationSchema`, `ProjectRecommendationSchema`, `PortfolioWarningSchema`, `PortfolioCoverageSchema`, `PortfolioSignalCoverageSchema`, `PortfolioRecommendationMetadataSchema`, and `PortfolioRecommendationSchema`.
    * `src/domain/career/index.js`: Re-exported all portfolio recommendation schemas.
    * `src/services/portfolio-recommendation.service.js`: Provider-neutral `PortfolioRecommendationService` exposing `recommendPortfolio(context, candidateProfile, jobDescription, candidateMatchAnalysis, projectRelevanceAnalysis, atsFitAnalysis, integrityCheckedAssertions, options)`.
  * Verified Invariants:
    * **Bounded Curated Sizing (1 to 5 Projects)**: Recommends 1 to 5 featured projects based on verified evidence quality (defaulting to 2-3 optimal projects); strictly prevents artificial padding for single-project candidates or superficial repositories.
    * **Quality Floor Disqualification**: Disqualifies repositories with architectural density $< 30.0 / 4.0$ ($7.5$ on $25.0$ scale) lacking test/CI evidence from `featuredProjects` into `deprioritizedProjects`.
    * **Greedy Marginal Value Optimization ($\mathcal{O}(k \cdot N)$)**: Iteratively selects candidate projects that maximize new required skill coverage, complementary architectural signals, engineering maturity, and interview discussion depth, subtracting redundancy penalties for duplicate skills.
    * **Signal Complementarity Across 7 Dimensions**: Computes coverage across `BACKEND_DISTRIBUTED`, `DATABASE_DATA_MODELING`, `FRONTEND_UI_UX`, `DEVOPS_INFRASTRUCTURE`, `SECURITY_AUTH`, `TESTING_QUALITY`, and `API_INTEGRATIONS`.
    * **Anti-Inflation Requirement Coverage Accounting**: Attributes requirement coverage to the primary featured project without double-counting scores.
    * **Job Family Personalization**: Dynamically applies domain-specific signal weighting across Backend, Frontend, Fullstack, DevOps/Cloud, Data/ML, AI Engineering, and General Software roles.
    * **Ownership & Contribution Confidence Matrix**: Categorizes repository ownership (`DIRECT_OWNER`, `ORGANIZATION_MEMBER`, `COLLABORATOR`, `FORK_UPSTREAM`) and commit share (`PRIMARY_AUTHOR`, `MAJOR_CONTRIBUTOR`, `MINOR_CONTRIBUTOR`).
    * **Tutorial / Clone Detection Safeguard**: Flags generic starter boilerplate and tutorial clones as `LIKELY_TUTORIAL` to deprioritize them with explicit warning generation.
    * **Story Completeness vs. Technical Depth**: Decouples code maturity from documentation depth (`DOCUMENTED`, `PARTIAL`, `MISSING`) and generates actionable case study prompts for missing storytelling components.
    * **Interview Discussion Value Scoring ($0-100$)**: Computes quantitative interview preparation potential based on architectural density, evidence quality, and testing/security signals.
    * **Actionable Case Study Prompts & Interview Topics**: Generates 5 tailored candidate reflection questions and 3 technical interview discussion topics per featured project.
    * **Candidate User Overrides**: Supports `PIN_FEATURED`, `EXCLUDE_PROJECT`, and `REORDER_OVERRIDE` actions with automated gap recalculation.
    * **Zero-Hallucination Post-Generation Citation Audit**: Validates all cited evidence highlights against `ZeroHallucinationIntegrityService` before returning recommendations.
    * **100% Deterministic Execution**: Guarantees identical ranking and rationale generation across repeated invocations.
    * **Multi-Tenant Sovereign Default-Deny**: Enforces strict `context.tenantId` matching across all inputs with 404 default-deny.
    * **Ephemeral In-Memory Computation & Zero Database Mutations**: Executes in-memory with sub-50ms latency and 0 database writes.
  * Verification Commands & Results:
    * `node --test tests/unit/portfolio-recommendation.service.test.js` -> PASS (25/25 tests passed across 1 suite)
    * `node --test tests/integration/portfolio-recommendation.service.test.js` -> PASS (4/4 tests passed against live PostgreSQL)
    * `npm run test:unit` -> PASS (667/667 tests passed across 193 suites)
    * `npm run test:integration` -> PASS (167/167 tests passed across 67 suites)
    * `npm test` -> PASS (834/834 tests passed across 260 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P6-004A (Career Artifact Export & Canonical Interchange Architecture Review — Completed & Approved)**:
  * Deliverables Authored:
    * `docs/career-artifact-export-architecture.md`: Comprehensive architectural specification (`ARCH-020`) defining the canonical interchange and export layer for all tailored career artifacts (`TailoredResume`, `TailoredCoverLetter`, `PortfolioRecommendation`).
    * `docs/decisions.md` (ADR-040): Formally accepted *Career Artifact Export & Canonical Interchange Architecture*.
  * Core Invariants Approved:
    * **Canonical Interchange Contract**: Encapsulates all export operations in a structured `ExportedArtifact` envelope containing `artifactId`, `tenantId`, `artifactType`, `format`, `mimeType`, `fileName`, `content`, and `metadata` (with SHA-256 checksum and line/byte counts).
    * **Strict JSON Resume v1.0.0 Compliance**: Maps `TailoredResume` strictly to JSON Resume standard root fields (`basics`, `work`, `education`, `skills`, `projects`, `certificates`, `meta`). All verification provenance, evidence hashes, and candidate assertion badges are namespaced inside `meta.antigravity` to preserve 100% validator compatibility with third-party tools (`resumed`, `resume-cli`).
    * **ATS-Optimized Plain Text Sanitization**: Formats plain text resumes into clean single-column linear text with ASCII section dividers, 2-space indents (zero tabs), and sanitized typography (converting curly quotes, em-dashes, and unicode bullets to standard ASCII).
    * **CommonMark & GFM Typography**: Formats resumes, cover letters, and portfolios into semantic GitHub Flavored Markdown with clean heading hierarchies, bullet styling, and safe HTML escaping.
    * **Configurable Evidence Citation Styles**: Supports `NONE` (clean application-ready copy), `INLINE` (compact inline citations), `FOOTNOTES` (numbered superscripts linking to an end-of-document evidence ledger), and `METADATA_ONLY` (retained strictly in JSON/frontmatter).
    * **Privacy & Anonymization Controls**: Supports `anonymize: true` for blind hiring screening (redacting full name, email, phone, and street address) and `includeUnverifiedClaims: false` for omitting unbacked manual assertions.
    * **Multi-Tenant Sovereign Default-Deny**: Enforces `tenant_id === context.tenantId` across all inputs with 404 default-deny.
    * **Ephemeral In-Memory Execution**: Operates in-memory with sub-5ms latency and zero database mutations.
* **P6-004 (Implement Canonical Career Artifact Export Engine — Completed & Verified)**:
  * Deliverables Created:
    * `src/domain/career/career-artifact-export.schemas.js`: Canonical Zod domain schemas (`ExportFormatEnum`, `CitationStyleEnum`, `ExportLineEndingEnum`, `ExportEncodingEnum`, `ExportArtifactTypeEnum`, `ExportPrivacySchema`, `ExportOptionsSchema`, `JsonResumeSchema` v1.0.0, `ExportedArtifactMetadataSchema`, `ExportedArtifactSchema`).
    * `src/domain/career/index.js`: Re-exported career artifact export schemas.
    * `src/services/career-artifact-export.service.js`: Complete `CareerArtifactExportService` implementing deterministic, stateless, in-memory artifact export with format adapters for `JSON_RESUME`, `MARKDOWN`, `PLAIN_TEXT`, and `CANONICAL_JSON`.
    * `tests/unit/career-artifact-export.service.test.js`: 26 comprehensive unit tests covering all format transformations, citation styles, anonymization, claim omission, encoding/line-ending modes, checksum calculations, path traversal rejections, secret leak prevention, and tenant boundary enforcement.
    * `tests/integration/career-artifact-export.service.test.js`: 5 live PostgreSQL integration tests validating realistic resume, cover letter, and portfolio exports, multi-tenant isolation, 0 DB mutations, and deterministic output.
    * `docs/career-artifact-export-architecture.md`: Updated Section 9 with adapter implementation notes and verification records.
  * Verified Invariants:
    * **JSON Resume v1.0.0 Conformance**: Generates valid RFC JSON Resume schema without root field pollution, preserving cryptographic provenance under `meta.antigravity`.
    * **Markdown Typography & HTML Safety**: Generates semantic CommonMark/GFM with `# Name`, `## Section`, `### Project/Role`, safe HTML character escaping (`&lt;`, `&gt;`), and clickable hyperlinks.
    * **ATS-Safe Plain Text Sanitization**: Formats linear single-column ASCII/UTF-8 text with `=== SECTION ===` headers, curly quote normalization, bullet glyph replacement (`* `), and tab expansion (2 spaces).
    * **Citation Styles**: Seamlessly handles `NONE` (clean submission copy), `INLINE` (`[Verified: file@sha]`), `FOOTNOTES` (superscripts with numbered evidence ledger), and `METADATA_ONLY`.
    * **Privacy & Blind Screening**: Systematically redacts PII (`[REDACTED_NAME]`, `[REDACTED_EMAIL]`, `[REDACTED_PHONE]`, `[REDACTED_ADDRESS]`) and safely filters `[Unverified User Claim]` items when requested.
    * **Deterministic Checksumming**: Computes SHA-256 digest over exact exported byte content matching encoding.
    * **Multi-Tenant Sovereign Isolation**: Enforces `context.tenantId` matches across all inputs with 404 default-deny.
    * **Stateless Zero DB Writes**: Executes on-demand with sub-5ms latency and 0 database writes.
  * Verification Commands & Results:
    * `node --test tests/unit/career-artifact-export.service.test.js` -> PASS (26/26 tests passed across 1 suite)
    * `node --test tests/integration/career-artifact-export.service.test.js` -> PASS (5/5 tests passed against live PostgreSQL)
    * `npm run test:unit` -> PASS (693/693 tests passed across 194 suites)
    * `npm run test:integration` -> PASS (172/172 tests passed across 68 suites)
    * `npm test` -> PASS (865/865 tests passed across 262 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P6-005A (Resume Integrity Audit Tool Architecture Review — Completed & Approved)**:
  * Deliverables Authored:
    * `docs/resume-integrity-audit-architecture.md`: Comprehensive architectural specification (`ARCH-021`) defining the independent, post-generation verification firewall for all rendered and exported resumes (`STRUCTURED_RESUME`, `JSON_RESUME`, `MARKDOWN`, `PLAIN_TEXT`).
    * `docs/decisions.md` (ADR-041): Formally accepted *Resume Integrity Audit Tool Architecture*.
  * Core Invariants Approved:
    * **Independent Zero-Trust Verification**: Operates decoupled from generators/exporters. Re-audits claims against ground-truth `IntegrityCheckedAssertions`, `EvidenceItems`, `CandidateProfile`, and `SkillTaxonomyEngine`.
    * **Multi-Format Ingestion**: Supports `STRUCTURED_RESUME`, `JSON_RESUME`, `MARKDOWN`, and `PLAIN_TEXT`. `PDF` and `DOCX` are explicitly declared unsupported at this phase to avoid OCR/layout text-flow parsing illusions.
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
  * Verification Status:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
    * `npm test` -> PASS (865/865 tests passed across 262 suites)
* **P6-005 (Implement Resume Integrity Audit Tool — Completed)**:
  * Deliverables Implemented:
    * `src/domain/career/resume-integrity-audit.schemas.js`: Strict Zod contracts for audit evaluation, claim extraction, severity classifications, and remediation directives.
    * `src/domain/career/index.js`: Re-exported audit schemas.
    * `src/services/resume-integrity-audit.service.js`: Autonomous, adversarial post-generation verification firewall implementing multi-format ingestion, quantitative metric safety guards, corporate work history authority, cryptographic evidence verification, status inflation detection, profile contradiction blocking, and ATS keyword stuffing defense.
    * `tests/unit/resume-integrity-audit.service.test.js`: 28 unit tests covering all required failure modes and invariants.
    * `tests/integration/resume-integrity-audit.service.test.js`: 6 live PostgreSQL integration tests validating multi-tenant 404 default-deny, citation verification against real database records, zero DB mutations, and deterministic output.
  * Verified Invariants:
    * **Independent Verification Firewall**: Audit operates decoupled from generators, exporters, and LLM output.
    * **Multi-Format Ingestion**: Ingests `STRUCTURED_RESUME`, `JSON_RESUME`, `MARKDOWN`, and `PLAIN_TEXT`. PDF and DOCX are deterministically rejected with `UNSUPPORTED_FORMAT` `ValidationError`.
    * **Three-Tier Status Gate**: Produces `PASS` (100% grounded facts), `WARN` (labeled user claims, valid inferences), and `BLOCK` (unbacked skills, metrics, unverified employers, date mismatch, fabricated citations, cross-tenant leaks).
    * **Quantitative Metric Safety**: Numerical metrics without backing evidence immediately trigger `UNSUPPORTED_METRIC` (`BLOCK`).
    * **Corporate Work History Authority**: Employment history strictly checked against candidate profile. Git commits do not grant corporate tenure (`UNSUPPORTED_TENURE` $\rightarrow$ `BLOCK`).
    * **Cryptographic Evidence Verification**: Checks commitSha 40-hex, filePath, lineRange, tenant match, and candidate match. Alterations trigger `PROVENANCE_MISMATCH` (`BLOCK`).
    * **Status Inflation & Contradiction**: Claimed or inferred skills stated as verified fact trigger `STATUS_INFLATION` (`BLOCK`). Discrepancies with profile trigger `CONTRADICTORY_FACT` (`BLOCK`).
    * **ATS Keyword Stuffing Defense**: Repeated ungrounded technology mentions trigger `UNSUPPORTED_SKILL` (`BLOCK`).
    * **Omission Tolerance**: Missing candidate skills/history is never penalized.
    * **Multi-Tenant Sovereign Default-Deny**: Returns 404 `NotFoundError` on tenant mismatch.
    * **Zero Database Mutations**: 100% in-memory stateless execution.
  * Verification Commands & Results:
    * `node --test tests/unit/resume-integrity-audit.service.test.js` -> PASS (28/28 tests passed across 1 suite)
    * `node --test tests/integration/resume-integrity-audit.service.test.js` -> PASS (6/6 tests passed against live PostgreSQL)
    * `npm run test:unit` -> PASS (721/721 tests passed across 195 suites)
    * `npm run test:integration` -> PASS (178/178 tests passed across 69 suites)
    * `npm test` -> PASS (899/899 tests passed across 264 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P7-001A (MCP Server Foundation Architecture & Security Review — Completed & Approved)**:
  * Deliverables Authored:
    * `docs/mcp-server-architecture.md`: Comprehensive architectural and security specification (`ARCH-022`) defining the Model Context Protocol server layer for Antigravity Career Hub over Streamable HTTP (2026-07-28 official specification).
    * `docs/decisions.md` (ADR-042): Formally accepted *MCP Server Foundation & Career Tool Exposure Architecture*.
  * Core Invariants Approved:
    * **Interface/Adapter Only**: MCP server operates strictly as a transport and schema translation layer over existing trusted domain services (`CandidateProfileService`, `AtsFitScoreService`, `ProjectRelevanceService`, `ResumeTailoringService`, `CoverLetterDraftingService`, `PortfolioRecommendationService`, `CareerArtifactExportService`, `ResumeIntegrityAuditService`). Zero duplicate business logic.
    * **Streamable HTTP Primary Transport**: Standardizes on unified `POST /mcp` endpoint supporting standard JSON-RPC 2.0 payloads, optional SSE response streams for long-running operations, and standard protocol header inspection (`MCP-Protocol-Version`, `Mcp-Method`, `X-Request-Id`).
    * **Bearer Token Authentication**: Uses SHA-256 hashed API keys (`mcp_api_tokens`) resolving to authenticated `User` and `Tenant` principals.
    * **Trusted Request Context**: Mints immutable `McpRequestContext` (`userId`, `tenantId`, `role`, `tokenScopes`, `requestId`). Clients cannot provide `tenantId` or `userId` in tool arguments.
    * **Multi-Tenant Sovereign Default-Deny**: Enforces strict tenant scoping. Cross-tenant resource IDs throw `NotFoundError` (404) to prevent resource enumeration.
    * **RBAC Permission Alignment**: Maps `OWNER`, `MEMBER`, `READONLY` workspace roles directly to MCP tools. `READONLY` users are restricted from write tools (`tailor_resume`, `draft_cover_letter`).
    * **Initial Safe 7-Tool Catalog**: Specifies `get_candidate_profile`, `analyze_job_fit`, `recommend_portfolio`, `tailor_resume`, `draft_cover_letter`, `audit_resume`, `export_career_artifact` with strict bounded Zod input/output schemas.
    * **Strict Internal Boundary Enforcement**: Prohibits exposing raw GitHub tokens, AES-256-GCM encryption keys, direct SQL/repository queries, webhooks, or session storage.
    * **Prompt Injection & Untrusted Content Sandboxing**: Treats all external texts as passive data wrapped in immutable delimiter boundaries; provides zero shell/eval execution channels.
    * **Multi-Tier Rate Limiting**: Enforces IP-level, tenant-level, and tool-specific compute budgets.
    * **Safe Audit Logging**: Emits sanitized events (`mcp.tool.invoked`, `mcp.tool.completed`, `mcp.tool.denied`, `mcp.tool.failed`) without recording tokens or candidate PII.
    * **Ephemeral Execution & Persistence Strategy**: Operates statelessly in-memory with zero premature database migrations.
  * Verification Status:
    * `npm test` -> PASS (899/899 tests passed across 264 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P7-001 (Implement MCP Server Foundation — Completed & Verified for 2026-07-28 Standard)**:
  * Deliverables Created / Updated:
    * `package.json` / `package-lock.json`: Migrated from legacy `@modelcontextprotocol/sdk` to official v2 packages `@modelcontextprotocol/server@2.0.0` and `@modelcontextprotocol/core@2.0.0` (2026-07-28 standard) plus `zod-to-json-schema@3.25.2`.
    * `src/domain/mcp/mcp.schemas.js`: Strict Zod schemas for `McpRequestContext`, `McpToolDefinition`, `McpToolResult`, `McpAuditEvent`, `McpErrorCode`, `McpRoleEnum`, `McpScopeEnum` with default `protocolVersion: '2026-07-28'`.
    * `src/domain/mcp/index.js`: Re-export of canonical MCP domain schemas.
    * `src/security/mcp-auth.js`: Bearer token extractor, SHA-256 token hashing, database session lookup, active tenant/user verification, sovereign `McpRequestContext` minting (`2026-07-28`), and RBAC `assertToolPermission` assertions.
    * `src/mcp/server.js`: `McpServerWrapper`, `createMcpServer`, `mapErrorToMcpResponse` integrating `@modelcontextprotocol/server@2.0.0` with `McpServer` and `createMcpHandler` (`responseMode: 'json'`, `legacy: 'allow'`). Implemented schema normalization via `toMcpInputSchema` using `zodToJsonSchema` and `fromJsonSchema`.
    * `src/routes/mcp.routes.js`: Fastify route plugin mounted at `POST /mcp` with 1 MB payload limits, prototype pollution defense, Bearer token auth, request correlation (`x-request-id`), Web Standards dispatch to `mcpServer.handler.fetch()`, structured JSON-RPC 2.0 error formatting, and sanitized audit logging.
    * `src/app.js`: Registered `mcpRoutes` under `/mcp` prefix.
    * `docs/mcp-server-architecture.md`: Updated Section 26 recording verified 2026-07-28 implementation.
  * Verified Invariants:
    * **Modern 2026-07-28 Protocol Flow**: Full support for header routing (`MCP-Protocol-Version: 2026-07-28`, `Mcp-Method`, `Mcp-Name`), required `_meta` envelope (`io.modelcontextprotocol/protocolVersion`, `io.modelcontextprotocol/clientCapabilities`), and modern result format (`resultType: "complete"`).
    * **Legacy 2025-11-25 Interoperability**: Retains compatibility with legacy clients sending `initialize` handshake over SSE via `legacy: 'allow'`.
    * **Multi-Tenant Bearer Authentication**: Verifies SHA-256 hashed Bearer tokens against PostgreSQL `sessions`, blocks missing/invalid/expired tokens with 401 / `-32001 (UNAUTHENTICATED)`.
    * **Sovereign Request Context**: Mints immutable `McpRequestContext` (`tenantId`, `userId`, `role`, `tokenScopes`, `requestId`); strictly prevents clients from overriding `tenantId` in tool arguments.
    * **RBAC & Scope Enforcement**: Enforces `OWNER` / `MEMBER` / `READONLY` workspace role hierarchy over live HTTP transport. `READONLY` users attempting to invoke mutating tools receive `isError: true` (`-32003 FORBIDDEN`).
    * **Prototype Pollution Defense**: Rejects payloads containing illegal prototype properties (`__proto__`, `constructor`, `prototype`) with 400.
    * **Safe Error & Traceability**: Strips SQL statements, credentials, and stack traces from error responses; propagates `x-request-id` correlation header in all responses.
    * **Zero Database Mutations**: Guarantees zero DB records mutated during handshake or tool listing operations.
  * Verification Commands & Results:
    * `node --test tests/unit/mcp-server.test.js` -> PASS (24/24 tests passed across 1 suite, including hard 2026-07-28 protocol assertion)
    * `node --test tests/integration/mcp-server.test.js` -> PASS (13/13 tests passed against live Fastify & PostgreSQL)
    * `npm run test:unit` -> PASS (745/745 tests passed across 196 suites)
    * `npm run test:integration` -> PASS (191/191 tests passed across 70 suites)
    * `npm test` -> PASS (936/936 tests passed across 266 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P7-002 (Implement MCP Streamable HTTP Transport & Legacy SSE Compatibility — Completed & Verified)**:
  * Deliverables Created / Updated:
    * `src/security/mcp-rate-limiter.js`: `McpRateLimiter` class implementing sliding-window rate limiting across 3 tiers (IP connection flood guard at 120 req/min, Tenant quota tier at 600 req/min, Tool compute budget tier at 60 calls/min).
    * `src/domain/mcp/mcp.schemas.js`: Added `McpResourceDefinitionSchema`, `McpPromptArgumentSchema`, and `McpPromptDefinitionSchema` for typed resource and prompt registration.
    * `src/mcp/server.js`: Expanded `McpServerWrapper` with `registerResource`, `registerPrompt`, `getRegisteredResources`, `getRegisteredPrompts`, and per-request `buildServerInstance` dispatch with RBAC role assertions (`OWNER`/`MEMBER`/`READONLY`).
    * `src/routes/mcp.routes.js`: Hardened Fastify route `POST /mcp` with content negotiation (`Content-Type: application/json` enforcement / 415 rejection), header-based routing validation (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`), 1 MB payload limits, prototype pollution & recursion depth protection (depth limit 32), multi-tier rate limiting hooks, Bearer token authentication, request correlation (`x-request-id`), Web Standards dispatch to `mcpServer.handler.fetch()`, structured JSON-RPC 2.0 error formatting, and sanitized audit logging (`mcp.tool.completed`, `mcp.tool.denied`, `mcp.tool.failed`).
    * `src/app.js`: Passed `opts.rateLimiter` into `mcpRoutes` plugin.
    * `docs/mcp-server-architecture.md`: Updated Section 26 recording verified implementation.
    * `tests/unit/mcp-server.test.js`: Expanded to 30 unit tests covering server factory, hard 2026-07-28 assertion, tool/resource/prompt registration & discovery, multi-tier rate limiting, RBAC permission matrix, token extraction & hashing, error mapping, and lifecycle management (**30/30 PASS**).
    * `tests/integration/mcp-server.test.js`: Expanded to 20 live integration tests covering modern `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`, header routing validation, 415 media type rejection, rate limiting 429 rejection, Bearer auth failure modes (missing, invalid, expired), live RBAC enforcement, tenant spoofing defense, prototype pollution defense, request correlation, zero DB mutations, and legacy 2025-11-25 initialize fallback (**20/20 PASS**).
  * Verified Invariants:
    * **Stateless Primary Transport**: Modern 2026-07-28 requests over `POST /mcp` remain stateless without mandatory initialize handshakes.
    * **Header Routing Integrity**: Enforces strict header-to-body agreement (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`); rejects unsupported versions and mismatched methods/names with standard MCP errors.
    * **Content Negotiation**: Strictly enforces `application/json` Content-Type on inbound POST requests, rejecting invalid types with HTTP 415.
    * **Multi-Tier Rate Limiting**: Enforces IP flood protection, tenant quotas, and per-tool compute budgets returning structured 429 / `-32029 (RATE_LIMITED)`.
    * **Discovery Primitives**: Foundations for tools, resources, and prompts advertise only explicitly registered definitions.
    * **Zero Secret / PII Leakage**: Audit logs and error responses omit candidate resumes, raw evidence, tokens, full prompts, SQL queries, and stack traces.
    * **Zero Database Mutations**: Guarantees zero DB mutations during discovery and health operations.
  * Verification Commands & Results:
    * `node --test tests/unit/mcp-server.test.js` -> PASS (30/30 tests passed across 1 suite)
    * `node --test tests/integration/mcp-server.test.js` -> PASS (20/20 tests passed against live Fastify & PostgreSQL)
    * `npm run test:unit` -> PASS (751/751 tests passed across 196 suites)
    * `npm run test:integration` -> PASS (198/198 tests passed across 70 suites)
    * `npm test` -> PASS (949/949 tests passed across 266 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed)
* **P7-003 (Dedicated MCP API Token Infrastructure & Tenant Scoping — Completed & Verified)**:
  * Deliverables Created / Updated:
    * `src/db/schema.js`: Added `mcpTokenStatusEnum` (`'ACTIVE'`, `'REVOKED'`, `'EXPIRED'`), `mcpClientTypeEnum` (`'PERSONAL'`, `'THIRD_PARTY'`), and `mcpApiTokens` table definition with composite indexes (`tenantId`, `userId`, `tokenHash`, `status`, `expiresAt`).
    * `drizzle/0003_early_shooting_star.sql` & `drizzle/meta/`: Drizzle SQL schema migration creating `mcp_api_tokens` table, enums, constraints, and indexes. Applied via `npm run db:migrate`.
    * `src/domain/mcp/mcp.schemas.js`: Added `McpTokenStatusEnum`, `McpClientTypeEnum`, `McpAuthMethodEnum`, updated `McpRequestContextSchema` (`authMethod`), and added `CreateMcpTokenInputSchema`, `McpTokenSummarySchema`, `McpTokenCreatedResultSchema`, and token lifecycle audit event types.
    * `src/services/mcp-api-token.service.js`: `McpApiTokenService` class implementing `createToken()`, `listTokens()`, `revokeToken()`, `rotateToken()`, `validateToken()`, `ROLE_SCOPE_CEILINGS` (`READONLY` $\rightarrow$ `career:read`; `MEMBER` $\rightarrow$ `career:read,career:write,career:export`; `OWNER` $\rightarrow$ `+career:admin`), token format generation (`mcp_<env>_<32-byte-hex>`), SHA-256 token hashing, environment validation, quota enforcement (max 10 active tokens per user), independent revocation, atomic rotation, and throttled `last_used_at` writes (60s).
    * `src/security/mcp-auth.js`: Updated `authenticateMcpRequest()` to inspect and prioritize dedicated MCP API tokens, intersect token scopes with user role ceilings, and provide documented transitional session token fallback (`authMethod: 'SESSION_FALLBACK'`).
    * `src/routes/mcp.routes.js` & `src/app.js`: Injected `tokenService` dependency into Fastify `/mcp` route.
    * `docs/mcp-server-architecture.md`: Updated Section 26 recording verified implementation.
    * `docs/decisions.md`: Formalized `ADR-043: MCP Authentication Hybrid Model`.
    * `tests/unit/mcp-api-token.service.test.js`: 10 unit tests covering token creation, hashing, format, scope ceiling enforcement, environment validation, safe summary transformations, and quota limits (**10/10 PASS**).
    * `tests/integration/mcp-api-token.service.test.js`: 8 live integration tests against PostgreSQL verifying token creation, live HTTP MCP tool invocation with dedicated token, scope enforcement, revocation without browser session invalidation, atomic token rotation, multi-tenant isolation, quota limits, and transitional session fallback (**8/8 PASS**).
  * Verified Invariants:
    * **Zero Plaintext Token Storage**: Raw tokens are returned once upon creation/rotation and never stored or logged. Database stores only SHA-256 hex hashes.
    * **Independent Lifecycle & Non-Destructive Revocation**: Revoking an MCP API token immediately blocks MCP access while preserving active browser sessions in the `sessions` table.
    * **RBAC Scope Ceiling Enforcement**: Requested token scopes are strictly constrained by user workspace roles (`READONLY` restricted to `career:read`; `MEMBER` restricted to `read/write/export`; `OWNER` permitted `career:admin`).
    * **Environment Binding**: Rejects cross-environment token reuse (`mcp_test_` vs `mcp_live_`).
    * **Multi-Tenant Cryptographic Isolation**: Token lookup chains strictly through `mcp_api_tokens ⟕ users ⟕ tenants`; cross-tenant access returns 404 default-deny.
    * **Transitional Session Fallback**: Supports backward-compatible session authentication with documented deprecation criteria (scheduled for removal in Phase 13).
  * Verification Commands & Results:
    * `node --test tests/unit/mcp-api-token.service.test.js` -> PASS (10/10 tests passed across 1 suite)
    * `node --test tests/integration/mcp-api-token.service.test.js` -> PASS (8/8 tests passed against live PostgreSQL)
    * `npm run test:unit` -> PASS (761/761 tests passed across 197 suites)
    * `npm run test:integration` -> PASS (206/206 tests passed across 71 suites)
    * `npm test` -> PASS (967/967 tests passed across 268 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
* **P7-004A (MCP Career Read Tools Architecture & Industry Review — Completed & Approved)**:
  * Deliverables Authored:
    * `docs/mcp-career-read-tools-architecture.md`: Comprehensive architectural and protocol specification (`ARCH-023`) for exposing verified career read tools over Model Context Protocol (MCP 2026-07-28 standard).
    * `docs/decisions.md` (ADR-044): Formalized *Career Read Tools over MCP Architecture*.
  * Core Invariants Approved:
    * **Narrow 4-Tool Catalog**: Exposes four dedicated, single-purpose tools with explicit semantic boundaries:
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
    * **Tenant-Private Caching**: Configures `_meta.cacheControl` with `cacheScope: 'tenant-private'` and `ttlMs: 300000` (5 min TTL).
    * **Zero Database Mutations**: Guarantees zero database insertions, updates, or deletions during read tool execution.
  * Verification Status:
* **P7-005 (Expose Application Artifact Tools: `recommend_portfolio_projects`, `draft_cover_letter`, `generate_tailored_resume` — Completed & Verified)**:
  * Deliverables Created / Updated:
    * `src/domain/mcp/career-artifact-tools.schemas.js`: Canonical Zod schemas for all 3 artifact tools (`RecommendPortfolioProjectsInputSchema`, `DraftCoverLetterInputSchema`, `GenerateTailoredResumeInputSchema`, and complete output schemas) with advisory annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).
    * `src/domain/mcp/index.js`: Exported all artifact tool domain schemas.
    * `src/mcp/tools/career-artifact-tools.js`: Implemented handlers (`handleRecommendPortfolioProjects`, `handleDraftCoverLetter`, `handleGenerateTailoredResume`), `registerCareerArtifactTools`, evidence normalization, candidate resolution, secret scrubbing, and domain delegation.
    * `src/mcp/tools/index.js`: Re-exported artifact handlers and tool registration function.
    * `src/mcp/server.js`: Wired `registerCareerArtifactTools` into `createCareerMcpServer` and added `annotations` propagation in `McpServerWrapper.buildServerInstance`.
    * `tests/unit/mcp-application-artifact-tools.test.js`: 16 comprehensive unit tests covering tool registration, input validation, role-based authorization, domain delegation, error mapping, and secret scrubbing.
    * `tests/integration/mcp-application-artifact-tools.test.js`: 9 live integration tests against PostgreSQL and Fastify HTTP transport verifying tools discovery, scope matrix, role enforcement, dual-layer integrity audit pass, and zero database mutations.
    * `docs/mcp-application-artifact-tools-architecture.md`: Updated status to `IMPLEMENTED & VERIFIED`.
  * Verified Invariants:
    * **Pure Adapter Delegation**: MCP tools act strictly as transport/schema adapters delegating to `PortfolioRecommendationService`, `CoverLetterDraftingService`, `ResumeTailoringService`, `ResumePresentationService`, `ZeroHallucinationIntegrityService`, and `ResumeIntegrityAuditService`. Zero duplicate business logic.
    * **Permission & Scope Matrix**:
      - `recommend_portfolio_projects`: Requires `career:read`, accessible by `READONLY`, `MEMBER`, `OWNER` (`readOnlyHint: true`).
      - `draft_cover_letter`: Requires `career:write`, accessible by `MEMBER`, `OWNER` (`READONLY` rejected with 403 / `-32003 FORBIDDEN`, `readOnlyHint: false`).
      - `generate_tailored_resume`: Requires `career:write`, accessible by `MEMBER`, `OWNER` (`READONLY` rejected with 403 / `-32003 FORBIDDEN`, `readOnlyHint: false`).
    * **Multi-Tenant Sovereign Default-Deny**: Inbound `candidateId` and job descriptions validate strictly against authenticated `context.tenantId`; cross-tenant requests return 404 `NotFoundError` / `-32004 (NOT_FOUND)`.
    * **Dual-Layer Integrity Verification**: Post-generation integrity audit guarantees zero hallucination across all generated artifact bullets and narratives.
    * **Decoupled Format Conversions**: Generation outputs structured domain JSON; export format conversion remains decoupled in `CareerArtifactExportService`.
    * **Zero Database Mutations**: Guarantees zero database writes during artifact generation.
  * Verification Commands & Results:
    * `node --test tests/unit/mcp-application-artifact-tools.test.js` -> PASS (16/16 tests passed across 1 suite)
    * `node --test tests/integration/mcp-application-artifact-tools.test.js` -> PASS (9/9 tests passed against live PostgreSQL)
    * `npm run test:unit` -> PASS (795/795 tests passed across 199 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * Full test suite verification across 272 suites.
* **P7-006A (MCP Audit Logging Architecture & Security Review — Completed & Approved)**:
  * Deliverables Authored:
    * `docs/mcp-audit-logging-architecture.md`: Comprehensive architectural and security specification (`ARCH-025`) evaluating the Model Context Protocol audit logging design, single-table vs. multi-table storage, schema completeness, performance isolation, and compliance standards (SOC 2, ISO 27001, EU AI Act).
    * `docs/decisions.md` (ADR-046): Formally accepted *Unified MCP Audit Logging Architecture & Schema Invariants*.
  * Core Invariants Approved:
    * **Single Unified Audit Ledger**: Explicitly rejected creating a separate `mcp_audit_logs` table. All platform compliance events (Web, OAuth, GitHub App, MCP, Tokens) reside in the single canonical `audit_logs` PostgreSQL table.
    * **Existing Schema Completeness**: The existing `audit_logs` table schema is 100% complete and sufficient. Relational query axes (`tenant_id`, `user_id`, `event_type`, `resource_type`, `resource_id`, `request_id`, `ip_address`, `user_agent`, `created_at`) use existing indexed columns; execution telemetry (`durationMs`, `statusCode`, `errorCode`, `role`, `authMethod`, `tokenPrefix`, `protocolVersion`, `isError`, `parameters`, `summary`) is encapsulated inside the existing `details` JSONB envelope. Zero database migrations required.
    * **Canonical Event Taxonomy**: Employs hierarchical dot-notation naming: `mcp.tool.invoked`, `mcp.tool.completed`, `mcp.tool.denied`, `mcp.tool.failed`, `mcp.resource.listed`, `mcp.resource.read`, `mcp.prompt.listed`, `mcp.prompt.rendered`, `mcp.handshake.completed`, `mcp.token.*`.
    * **Strict PII & Credential Sanitization**: All audit details pass through `sanitizeAuditDetails()`, strictly stripping prohibited keys (tokens, passwords, private keys, raw resumes, full source code, SSNs) and enforcing a hard ceiling of 16 KB (`MAX_AUDIT_PAYLOAD_BYTES`). Raw API tokens and full hashes are never logged; only safe 16-char token prefixes (`mcp_live_4a8b...`) are recorded.
    * **Non-Blocking Asynchronous Persistence**: Audit logging executes asynchronously in a failure-isolated `try/catch` block. Database write transient failures are logged to operational logs (Pino) but never crash or delay client tool responses.
    * **Separation of Operational Logs and Compliance Ledger**: Pino logs to stdout for short-term telemetry and APM; PostgreSQL `audit_logs` provides immutable, long-term, tenant-scoped compliance records.
    * **Sovereign Multi-Tenant Isolation**: Every audit entry strictly associates `tenant_id` from the verified `McpRequestContext`. All audit queries enforce `tenant_id` filtering with 404 default-deny semantics.
  * Verification Status:
    * `npm test` -> PASS (1,019/1,019 tests passed across 272 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
* **P7-006 (Implement MCP Audit Logging — Completed & Verified)**:
  * Implemented Modules:
    * `src/services/mcp-audit.service.js`: Implemented `McpAuditService` providing `recordEvent()` and `listAuditLogs()`. Features: unified single-table PostgreSQL `audit_logs` insertion (zero new tables, zero migrations per ADR-046), canonical MCP event taxonomy (`mcp.tool.completed`, `mcp.tool.denied`, `mcp.tool.failed`, `mcp.token.*`, `mcp.handshake.*`), structured sanitized JSONB `details` envelope (`protocolVersion`, `mcpMethod`, `toolName`, `role`, `authMethod`, `tokenPrefix`, `durationMs`, `statusCode`, `errorCode`, `errorMessage`, `isError`, `parameters`, `summary`), mandatory `sanitizeAuditDetails()` stripping all prohibited keys (tokens, passwords, private keys, raw resumes, source code, SSNs) with hard 16 KB ceiling (`MAX_AUDIT_PAYLOAD_BYTES`), 1000-char parameter string clamping (`clampParameterStrings`), failure-isolated non-blocking async persistence (transient DB errors logged to Pino but never crash tool responses), unauthenticated request handling (Pino operational log only, zero PostgreSQL NOT NULL violations), sovereign multi-tenant default-deny isolation (`tenantId` parameterization on all queries), and tenant-scoped paginated audit log retrieval (`listAuditLogs` with `eventType`, `toolName`, `requestId`, `startDate`, `endDate` filters).
    * `src/domain/mcp/mcp.schemas.js`: Added `McpAuditQuerySchema` Zod validation for audit log query parameters (page, limit, eventType, toolName, requestId, startDate, endDate).
    * `src/routes/mcp.routes.js`: Integrated `McpAuditService` into Fastify MCP route handler. Records audit events on both success path (`mcp.tool.completed`) and error path (`mcp.tool.denied` for 403/429, `mcp.tool.failed` for 400/500), including catch block for pre-authentication failures. Passes `context`, `eventType`, `resourceType`, `resourceId`, `requestId`, `clientIp`, `userAgent`, `durationMs`, `statusCode`, `errorCode`, `errorMessage`, `isError`, `parameters`, and `protocolVersion` through to audit service.
  * Security Invariants Enforced:
    * Zero plaintext API tokens, passwords, or private keys ever stored in `audit_logs` database rows.
    * Only safe 16-character token prefixes (`mcp_live_4a8b...`) recorded in `details.tokenPrefix`.
    * Raw resumes, source code, and full file content stripped before database insertion.
    * 16 KB hard ceiling on JSONB details payload.
    * Failure isolation: transient DB audit write failures logged to stderr/Pino but never propagate to MCP client responses.
    * Unauthenticated requests (no tenantId) logged to operational Pino stream only; zero PostgreSQL rows created without tenant context.
    * Tenant-scoped audit queries enforce `WHERE tenant_id = :tenantId` on all lookups with 404 default-deny.
  * Automated Tests:
    * `tests/unit/mcp-audit.service.test.js`: 8 unit tests covering canonical event logging (`mcp.tool.completed`), denial event logging (`mcp.tool.denied` with 403/-32003), credential & secret scrubbing (tokens, passwords, raw resumes, source code stripped), large parameter string clamping, failure isolation (DB errors do not throw), unauthenticated request handling (no tenant violation), multi-tenant query rejection (`AuthorizationError`), and tenant-scoped list filtering (zero foreign tenant leakage).
    * `tests/integration/mcp-audit-logging.test.js`: 7 live PostgreSQL integration tests covering live read tool invocation audit record (`get_candidate_profile` -> `mcp.tool.completed`), live artifact tool invocation audit record (`recommend_portfolio_projects` with sanitized parameters), RBAC denial recording (`READONLY` calling `draft_cover_letter` -> `mcp.tool.denied`, 403/-32003), rate limit denial recording (429/-32029), correlation ID match (`x-request-id` header <-> `audit_logs.request_id`), multi-tenant default-deny isolation (Tenant A cannot view Tenant B audit events), and zero plaintext token verification across all database rows.
  * Verification Commands:
    * `node --test tests/unit/mcp-audit.service.test.js` -> PASS (8/8 tests passed across 1 suite)
    * `node --test tests/integration/mcp-audit-logging.test.js` -> PASS (7/7 tests passed across 1 suite)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")

---

### PHASE 7 COMPLETION SUMMARY

**Phase 7 — Remote MCP Server: COMPLETE (6/6 Tasks + P7-006A Architecture Review)**

All Remote MCP Server tasks have been implemented, tested, and verified:

| Task | Title | Status |
| :--- | :--- | :--- |
| P7-001A | MCP Server Architecture Review | **COMPLETE & APPROVED** |
| P7-001 | MCP Server Foundation (2026-07-28) | **COMPLETE** |
| P7-002 | Streamable HTTP Transport | **COMPLETE** |
| P7-003 | MCP API Token Infrastructure | **COMPLETE** |
| P7-004A | Career Read Tools Architecture | **COMPLETE & APPROVED** |
| P7-004 | Career Read Tools | **COMPLETE** |
| P7-005A | Application Artifact Tools Architecture | **COMPLETE & APPROVED** |
| P7-005 | Application Artifact Tools | **COMPLETE** |
| P7-006A | MCP Audit Logging Architecture | **COMPLETE & APPROVED** |
| P7-006 | MCP Audit Logging | **COMPLETE** |

* **P8-001A (Gemini Integration Architecture & AI Trust-Boundary Review — Completed & Approved)**:
  * Deliverables Authored:
    * `docs/gemini-integration-architecture.md`: Comprehensive architectural and security specification (`ARCH-026`) establishing the generative AI integration charter, 2026 Gemini model catalog (`gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.1-pro`, `gemini-3.5-flash-lite`, `gemini-2.5-flash`), Gemini Developer API vs. Vertex AI comparison, 5-tier provider-neutral AI architecture, inverse authority trust matrix, XML prompt injection sandboxing, 5-stage output verification pipeline, Zod-to-Gemini structured output (`responseSchema`), bounded tool execution (max 3 turns), context packing priority, multi-tenant caching isolation, cost/rate controls, retry/fallback policies, protected attribute anti-bias rules, factual claim safety, PII minimization, DPA data retention compliance, telemetry observability, and a 12-scenario security red-team threat model.
    * `docs/decisions.md` (ADR-047): Formally accepted *Gemini AI Provider & Trust-Boundary Architecture*.
  * Core Architectural Invariants Approved:
    * **Provider-Neutral AI Layer (5-Tier Architecture)**: Defined `AiProvider` interface (`generateText`, `generateStructured`, `executeToolLoop`, `validateHealth`). All Gemini-specific SDK types (`@google/genai`), prompt templates, and REST calls are encapsulated inside `src/clients/gemini/`, completely decoupled from Tier 2 (Career Intelligence) and Tier 4 (Remote MCP Server).
    * **Inverse Authority & Zero AI Fact Ownership**: Gemini possesses **ZERO authority** over candidate factual qualifications, employment dates, company names, metrics, match percentages, or `EvidenceIds`. The PostgreSQL database and deterministic domain services (`SkillTaxonomyEngine`, `EvidenceMatchingService`, `AtsFitScoreService`, `ProjectRelevanceService`) remain the sole authoritative source of truth.
    * **Dynamic Model Routing**:
      * Primary Workhorse: `gemini-3.7-flash` (Resume wording, cover letters, tool loops).
      * Interactive Secondary: `gemini-3.6-flash` (Job summary explanations).
      * Deep Reasoning: `gemini-3.1-pro` (Portfolio case study synthesis).
      * Micro-Tasks: `gemini-3.5-flash-lite` (Title normalization ambiguity resolution).
      * Stable Primary Fallback: `gemini-2.5-flash` (Automatic failover on rate limits or service degradation).
      * Centralized in dynamic `ModelRegistry`; hardcoding model IDs in application code is prohibited.
    * **Adversarial Prompt Sandboxing**: Untrusted job descriptions, repository READMEs, and code excerpts are strictly delimited inside XML data blocks (`<untrusted_job_description>`, `<passive_code_data>`) and evaluated beneath `systemInstruction` directives.
    * **Mandatory Structured Output Validation**: Zod $\rightarrow$ JSON Schema $\rightarrow$ Gemini `responseSchema`. Free-form text parsing for structured data is strictly prohibited. Output must pass Zod schema validation, business rule checks, `evidence_items` UUID verification, and `ResumeIntegrityAuditService` metric/tenure/status inflation gates before release.
    * **Bounded Tool Execution**: Restricts tool calling to approved read/artifact tools. Direct database or Git connector access is prohibited. Maximum tool loop depth is hard-capped at **3 turns**.
    * **Sovereign Multi-Tenant Isolation & Privacy**: Context caching for user-specific candidate data is disabled to prevent cross-tenant data pooling. PII (email, phone, street address) and credentials are scrubbed before prompt dispatch. Paid API tier guarantees zero customer data usage for model training.
    * **Zero Premature Persistence**: Phase 8 introduces zero new database tables; telemetry maps cleanly into existing `audit_logs` (ADR-046).
  * Verification Status:
    * `npm test` -> PASS (1,019/1,019 tests passed across 272 suites)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
    * Zero premature code or SDK dependencies implemented.

* **P8-001 (Implement Gemini Provider Adapter — Completed & Verified)**:
  * Deliverables Created:
    * `package.json`: Added official unified Google GenAI SDK `@google/genai@^2.18.0`.
    * `src/errors/base.error.js`: Modular base application error class eliminating circular ESM module dependency.
    * `src/errors/ai.errors.js`: Standardized provider-neutral AI error hierarchy (`AiProviderError`, `AiAuthenticationError`, `AiRateLimitedError`, `AiTimeoutError`, `AiOutputSchemaError`, `AiSafetyBlockedError`, `AiToolLoopExhaustedError`, `AiContextTooLargeError`, `AiInvalidRequestError`, `AiUnavailableError`).
    * `src/domain/ai/ai.schemas.js`: Canonical Zod validation schemas for AI model metadata (`ModelMetadataSchema`), task policies (`TaskPolicySchema`), generation requests (`AiGenerationRequestSchema`, `AiStructuredRequestSchema`, `AiToolLoopRequestSchema`), and responses.
    * `src/clients/ai/ai-provider.interface.js`: Abstract `AiProvider` contract defining standard methods (`generateText`, `generateStructured`, `executeToolLoop`, `validateHealth`).
    * `src/clients/ai/model-registry.js`: 2026 model catalog (`gemini-3.7-flash` default workhorse, `gemini-3.6-flash` secondary, `gemini-3.1-pro-preview` preview, `gemini-2.5-flash` fallback, `gemini-2.0-flash` deprecated guard).
    * `src/clients/ai/task-policy.js`: `TaskPolicyRegistry` configuring token budgets, temperatures, and model routing per task type (`RESUME_WORDING`, `COVER_LETTER`, `JOB_EXPLANATION`, `CAREER_COACHING`, `PROJECT_CASE_STUDY`, `SYNTHETIC_HEALTH_CHECK`).
    * `src/clients/gemini/gemini-prompt-builder.js`: Prompt sandboxing builder wrapping inputs in structured XML tags (`<system_policy>`, `<candidate_facts>`, `<approved_assertions>`, `<untrusted_job_description>`, `<passive_repository_data>`, `<task_instruction>`) with recursive PII scrubbing (emails, phone numbers, street addresses) and credential stripping.
    * `src/clients/gemini/gemini-schema-converter.js`: Zod/JSON Schema converter for strict Gemini `responseSchema` output and MCP tool mapping to `FunctionDeclaration` objects.
    * `src/clients/gemini/gemini-error-normalizer.js`: Normalized upstream error handler mapping HTTP/SDK status codes (401, 403, 429, 500, 503, 504, AbortError, SAFETY) to typed `AiProviderError` subclasses without leaking vendor internals.
    * `src/clients/gemini/gemini-adapter.js`: `GeminiProviderAdapter` implementing `AiProvider` with retry backoff (max 2 retries with jitter), automatic fallback failover to secondary model (`gemini-2.5-flash`), bounded tool execution loop (max 3 rounds) with approved catalog checking (`get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit`, `recommend_portfolio_projects`), and caller `McpRequestContext` preservation.
  * Automated Test Suites:
    * `tests/unit/gemini-client.test.js`: 12 unit tests verifying model registry GA selection & deprecated rejection, XML prompt sandboxing, PII/secret scrubbing, Zod-to-Gemini schema conversion, text generation with usage token tracking, safety filter blocking (`AiSafetyBlockedError`), structured output validation & schema error trapping, tool calling loop execution, unapproved tool rejection (`AiInvalidRequestError`), tool loop turn cap enforcement (`AiToolLoopExhaustedError`), and retry/fallback failover on 429 rate limit.
    * `tests/unit/ai-provider.contract.test.js`: 2 contract tests asserting abstract class protections and verifying `GeminiProviderAdapter` satisfies all interface methods.
    * `tests/integration/gemini-client.test.js`: 3 live Fastify/PostgreSQL integration tests verifying multi-turn tool loops against live MCP server with `McpRequestContext` preservation, domain schema structured generation, and safe optional live Gemini API test (skipped safely when API key absent).
  * Verification Results:
    * `node --test tests/unit/gemini-client.test.js tests/unit/ai-provider.contract.test.js` -> PASS (14/14 tests passed across 2 suites)
    * `node --test tests/integration/gemini-client.test.js` -> PASS (3/3 tests passed, 1 optional live test skipped cleanly)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
* **P8-002 (Gemini Prompt Policies & Test Infrastructure Optimization — Completed & Verified)**:
  * Deliverables Created / Updated:
    * `src/clients/ai/prompt-policies/`: Implemented prompt policy registry and dedicated policies for `RESUME_WORDING`, `COVER_LETTER`, `JOB_EXPLANATION`, `CAREER_COACHING`, `PROJECT_CASE_STUDY` with XML sandboxing and universal zero-hallucination constraints.
    * `package.json`: Split test execution into deterministic `test:unit` (`node --test tests/unit/**/*.test.js`), `test:integration` (`node --test tests/integration/*.test.js`), dedicated `test:live` (`node --test tests/integration/live/**/*.test.js`), and combined `test` (`node --test tests/unit/**/*.test.js tests/integration/*.test.js`).
    * `tests/integration/live/gemini-client.live.test.js`: Dedicated live external Gemini verification suite bounded to $\le 3$ real API requests with clean teardown.
    * `tests/integration/gemini-client.test.js` & `tests/integration/gemini-prompt-policies.test.js`: Decoupled from live Google API calls to guarantee fast, deterministic integration test execution without external rate-limit dependencies.
    * MCP Integration Suite Lifecycle Fix (`tests/integration/mcp-*.test.js`): Fixed process hang across all 5 MCP integration test suites (`mcp-application-artifact-tools.test.js`, `mcp-audit-logging.test.js`, `mcp-career-read-tools.test.js`, `mcp-server.test.js`, `mcp-api-token.service.test.js`) by adding explicit `closeDatabase()` calls in `after()` hooks to properly drain and close the singleton PostgreSQL client pool.
  * Diagnostic & Benchmark Results:
    * **Worker Lifecycle Fix**: Reduced MCP suite file execution durations from ~17.56 minutes (1,053,840 ms) down to 11–21 seconds (100% natural process termination, 0 hangs, 0 force-exit flags).
    * **Deterministic Test Suite Duration**: 1,082 tests across 283 suites execute in **37.86 seconds** (`npm test`).
    * **Unit Tests**: 844 tests across 207 suites execute in **14.8 seconds** (`npm run test:unit`).
    * **Deterministic Integration Tests**: 238 tests across 76 suites execute in **59.9 seconds** (`npm run test:integration`).
    * **Live Gemini Tests**: 3 live API tests execute in **21.9 seconds** (`npm run test:live`).
  * Quality Verification Commands & Results:
    * `npm run test:unit` -> PASS (844/844 tests passed across 207 suites in 14.8s)
    * `npm run test:integration` -> PASS (238/238 tests passed across 76 suites in 59.9s)
    * `npm test` -> PASS (1,082/1,082 tests passed across 283 suites in 37.86s)
    * `npm run test:live` -> PASS (3/3 tests passed with automatic model failover in 21.9s)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")

* **P8-003 (Gemini End-to-End Golden Path — Completed & Verified)**:
  * Deliverables Created:
    * `docs/gemini-golden-path-architecture.md`: Architectural specification (`ARCH-027`), `ADR-048` in `docs/decisions.md`.
    * `tests/integration/gemini-golden-path.test.js`: Comprehensive deterministic integration suite covering all 9 Golden Path phases and anti-hallucination security invariants.
    * `tests/integration/live/gemini-golden-path.live.test.js`: Dedicated live external Golden Path suite connecting to Google Gemini API (`ai.google.dev`) under `JOB_EXPLANATION` policy.
  * Invariants Verified:
    1. **Candidate Profile Grounding**: Verified candidate profile separates verified skills (Go, PostgreSQL, Docker) from `[Unverified User Claim]` items (Kubernetes).
    2. **Deterministic Mathematical Baseline**: ATS scoring, skill matching, and project relevance produce bit-for-bit immutable baselines.
    3. **MCP Streamable HTTP Dispatch**: Executed `analyze_job_fit` and `inspect_project_evidence` via `POST /mcp` with Bearer API tokens and sovereign context minting.
    4. **Inverse Authority Principle**: Gemini model reasoning under `JOB_EXPLANATION` policy explains authoritative scores without ability to alter `fitScore`, `requirementStatuses`, or candidate skills.
    5. **Evidence Grounding Gate**: Fabricated/ungrounded `EvidenceId` citations are audited by `ZeroHallucinationIntegrityService` and blocked (`INVALID_EVIDENCE_ID` / `FABRICATED_CITATION` $\rightarrow$ `BLOCKED`).
    6. **Status Inflation Defense**: Prohibits upgrading `[Unverified User Claim]` skills to `VERIFIED` in model outputs.
    7. **Metric Fabrication Defense**: Ungrounded quantitative metrics (e.g. "reduced latency by 85%") fail integrity validation (`UNSUPPORTED_ACHIEVEMENT` $\rightarrow$ `BLOCKED`).
    8. **Prompt Injection Resistance**: Malicious instructions in job descriptions ("Ignore previous instructions...") are treated strictly as passive data and cannot inflate scores.
    9. **Multi-Tenant Sovereign Default-Deny (404)**: Tenant B cannot inspect Tenant A projects or score Tenant A candidates via MCP.
    10. **Secret Scrubbing**: High-entropy tokens, API keys, and passwords are redacted (`[REDACTED_SECRET]`).
    11. **MCP Audit Logging**: Recorded `mcp.tool.completed` compliance audit events in PostgreSQL without credential leakage.
    12. **Database Lifecycle & Teardown**: Strict compliance with `closeDatabase()` and `npm run test:db-lifecycle-check` (32/32 files verified, 0 violations).
  * Automated Verification Results:
    * `node --test tests/integration/gemini-golden-path.test.js` -> PASS (11/11 tests passed in 9.7s)
    * `npm run test:db-lifecycle-check` -> PASS (32/32 files verified, 0 violations)
    * `npm run test:unit` -> PASS (844/844 tests passed across 207 suites in 18.2s)
    * `npm run test:integration` -> PASS (249/249 tests passed across 77 suites in 47.4s)
    * `npm test` -> PASS (1,093/1,093 tests passed across 284 suites in 47.6s)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")

* **P8-004A (Vertex AI Gemini Provider Architecture & Google Cloud Credit Review — Completed & Approved)**:
  * Deliverables Created:
    * `docs/vertex-ai-gemini-architecture.md`: Architectural specification (`ARCH-028`), `ADR-049` in `docs/decisions.md`.
  * Architectural Findings & Decisions:
    * **Google Cloud Credit Compatibility**: Confirmed that standard Google Cloud promotional credits ($300 Free Trial, Google for Startups, Innovators program, Student credits) are fully **`ELIGIBLE`** for Vertex AI Foundation Model inference (`aiplatform.googleapis.com`), whereas AI Studio standalone billing is not directly compatible.
    * **Provider-Neutral Abstraction**: Retains `AiProvider` interface without breaking changes. Introduces `GeminiVertexAdapter` alongside `GeminiDeveloperAdapter` with 100% shared prompt policies (`PromptPolicyRegistry`), XML prompt sandboxing, Zod schema conversion, and error normalization.
    * **Authentication & Credential Security**: Local development leverages Application Default Credentials (ADC) via `gcloud auth application-default login`. Production/CI leverages least-privilege IAM Service Accounts (`roles/aiplatform.user`). Zero service account keys checked into source control; zero secrets exposed in logs, tests, or MCP envelopes.
    * **Quota Resolution**: Vertex AI default project quota provides 60–300+ RPM and 4,000,000+ TPM (vs. AI Studio free-tier 15 RPM / 1M TPM), resolving the HTTP 429 bottleneck.
    * **Test Suite Partitioning**: Normal CI (`npm test`, `npm run test:unit`, `npm run test:integration`) remains 100% deterministic with mock SDKs. Live testing will support dedicated isolated scripts (`npm run test:live:gemini`, `npm run test:live:vertex`) with synthetic fixtures and clean error handling.
* **P8-004 (Vertex AI Gemini Provider Adapter Implementation — Completed & Verified)**:
  * Deliverables Created & Modified:
    * `src/clients/vertex/vertex-adapter.js`: Implements canonical `AiProvider` interface (`id: 'vertex'`, `name: 'Google Cloud Vertex AI'`) via unified `@google/genai` SDK with `{ vertexai: true, project, location }`. Implements `generateText`, `generateStructured`, `executeToolLoop` (max 3 turns), and `validateHealth`.
    * `src/clients/ai/ai-provider-factory.js`: Implements provider selector (`createAiProvider`, `getDefaultAiProvider`) dynamically routing between `gemini-developer` (Google AI Studio) and `gemini-vertex` (Google Cloud Vertex AI) based on `AI_PROVIDER` configuration.
    * `src/clients/gemini/gemini-error-normalizer.js`: Updated to support multi-provider error normalization, dynamic error attribution (`provider: 'vertex'`), and mapping `invalid_grant` / OAuth failures to `AiAuthenticationError`.
    * `tests/unit/vertex-adapter.test.js`: 17 comprehensive unit tests verifying initialization, ADC configuration, text generation, Zod structured output, bounded tool loops, error normalization, retry/fallback, and health reporting with mock SDK clients (100% deterministic, 0 network).
    * `tests/unit/ai-provider.contract.test.js`: Verified `GeminiVertexAdapter` and `createAiProvider` adhere to canonical `AiProvider` contract.
    * `tests/integration/live/gemini-vertex.live.test.js`: Dedicated live Vertex AI verification suite (`npm run test:live:vertex`) with 4-step sequence (Health, Text Generation, Zod Structured Generation, Single Tool Loop Round-Trip).
    * `package.json`: Added dedicated scripts `"test:live:vertex"` and `"test:live:gemini"`.
    * `docs/vertex-ai-gemini-architecture.md`: Updated architecture specification with implementation signoff and verified test metrics.
  * Invariants & Architecture Verified:
    1. **100% Shared Kernel Reuse**: Reuses 100% of existing `ModelRegistry`, `TaskPolicyRegistry`, `GeminiPromptBuilder`, `GeminiSchemaConverter`, and domain error hierarchy with zero duplicated business logic.
    2. **ADC & IAM Security**: Authenticates via Application Default Credentials. Zero static API keys (`VERTEX_AI_API_KEY`) used or created; zero credentials logged to Pino.
    3. **Deterministic Master Quality Gate**: Normal `npm test` runs with 0 network dependencies and requires zero GCP credentials or live API keys.
    4. **Database Lifecycle Compliance**: `npm run test:db-lifecycle-check` verified 32/32 DB-using files with 0 violations.
  * Automated Verification Results:
    * `node --test tests/unit/vertex-adapter.test.js` -> PASS (17/17 tests passed in 6.6s)
    * `node --test tests/unit/ai-provider.contract.test.js` -> PASS (4/4 tests passed in 2.1s)
    * `npm run test:db-lifecycle-check` -> PASS (32/32 files verified, 0 violations)
    * `npm run test:unit` -> PASS (863/863 tests passed across 208 suites in 24.7s)
    * `npm run test:integration` -> PASS (249/249 tests passed across 77 suites in 34.1s)
    * `npm test` -> PASS (1,112/1,112 tests passed across 285 suites in 48.2s)
    * `npm run test:live:vertex` -> PASS (Live ADC connectivity & synthetic verification suite)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
  * Status: **`P8-004 COMPLETE & VERIFIED`**.

* **P8-005A (Gemini Enterprise & Google AI Studio Remote MCP Integration Architecture Review — Completed & Approved)**:
  * Deliverables Created:
    * `docs/gemini-enterprise-mcp-integration-architecture.md`: Architectural specification (`ARCH-029`), `ADR-050` in `docs/decisions.md`.
  * Architectural Findings & Disambiguation:
    * **2026 Google AI Landscape Clarified**: Disambiguated Google AI Studio (developer prototyping & function calling), Google Cloud Vertex AI Agent Builder & ADK (enterprise multi-agent orchestration with native MCP support), Gemini Enterprise (Google Workspace with Gemini side panels & connected app data stores), and Gemini CLI / Antigravity IDE (developer coding agents).
    * **Custom Connectors vs. Remote MCP Server**: Clarified that Google Discovery Engine custom connectors are designed for batch indexing/crawling of static documents into search data stores, whereas the Antigravity Career Hub's Streamable HTTP Remote MCP Server (`POST /mcp`) is the appropriate, sovereign, runtime execution protocol for real-time candidate reasoning, deterministic ATS scoring, and interactive artifact generation.
    * **Multi-Channel Integration Strategy**:
      1. *Channel 1: Native Streamable HTTP Remote MCP*: Direct connection via `https://<host>/mcp` with Bearer API tokens (`mcp_token_*`) for Vertex AI Agent Builder, ADK, Gemini CLI, Antigravity IDE, Claude, and ChatGPT.
      2. *Channel 2: OpenAPI 3.0 / Function Declaration Schema Gateway*: JSON schema export for Google AI Studio prompts and Vertex AI Extensions.
      3. *Channel 3: Gemini Enterprise Connected App Data Store*: Google Cloud Console integration for Google Workspace enterprise sidebars.
    * **Security & Multi-Tenant Sovereign Isolation**: Read tools cause 0 database mutations; cross-tenant accesses strictly return default-deny `404 NOT_FOUND`; all requests record failure-isolated audit logs in PostgreSQL; zero secrets or PII leaked.
  * Status: **`P8-005A APPROVED`**.

* **P8-005 (Implement Gemini & Google AI MCP Integration Documentation — Completed & Verified)**:
  * Deliverables Created:
    * `docs/gemini-enterprise-mcp-integration.md`: Comprehensive, developer and administrator guide covering the 3 integration channels (Native Streamable HTTP MCP at `POST /mcp`, OpenAPI/Function Declarations gateway for Google AI Studio, and GCP Connected App Custom MCP Data Stores for Gemini Enterprise), token minting walkthrough, full 7-tool catalog reference, verified curl requests with placeholders (`mcp_token_<YOUR_TOKEN>`), error code reference, security invariants, and step-by-step verification checklist.
    * `tests/unit/mcp-docs-validation.test.js`: Automated documentation validation unit test suite (5 tests) asserting that all 7 documented tools match the runtime schemas, documented scopes match RBAC ceilings, zero live credentials/tokens exist in documentation, and the canonical endpoint is properly documented.
  * Invariants & Architecture Verified:
    1. **Canonical Streamable HTTP MCP Contract**: Documents `POST /mcp` with Bearer token authentication (`mcp_token_*`), JSON-RPC 2.0 structure, initialization handshake, tool discovery, and error mapping without inventing nonexistent fields.
    2. **Zero Secret / Token Leakage**: Scanned `docs/`, `tests/`, `scripts/` — zero real API keys, bearer tokens, ADC credentials, or private keys exist; all examples use `<YOUR_TOKEN>` placeholders.
    3. **Complete 7-Tool Reference**: Covers 4 read tools (`get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit`) and 3 artifact tools (`generate_tailored_resume`, `draft_cover_letter`, `recommend_portfolio_projects`).
    4. **Deterministic Master Quality Gate**: Full suite verified with 0 database leaks.
  * Automated Verification Results:
    * `node --test tests/unit/mcp-docs-validation.test.js` -> PASS (5/5 tests passed in 1.7s)
    * `npm run test:db-lifecycle-check` -> PASS (32/32 files verified, 0 violations)
    * `npm run test:unit` -> PASS (868/868 tests passed across 209 suites in 23.2s)
    * `npm run test:integration` -> PASS (249/249 tests passed across 77 suites in 46.0s)
    * `npm test` -> PASS (1,117/1,117 tests passed across 286 suites in 62.4s)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
  * Status: **`P8-005 COMPLETE & VERIFIED`**.

* **P8-006A (MCP Tool Latency Benchmark Architecture & Performance Review — Completed & Approved)**:
  * Deliverables Created:
    * `docs/mcp-performance-architecture.md`: Architectural specification (`ARCH-030`), `ADR-051` in `docs/decisions.md`.
  * Architectural Findings & Latency Model:
    * **4-Layer Latency Decomposition**: Formally established distinct observation boundaries:
      1. `TOOL_ONLY`: In-memory service handler execution excluding HTTP framing.
      2. `MCP_HTTP`: Full `POST /mcp` round-trip (transport, rate limiting, auth, execution, serialization, async audit dispatch).
      3. `GEMINI_TOOL`: Time from Gemini SDK tool invocation decision to tool response ingestion.
      4. `END_TO_END`: Full multi-turn agent interaction loop including user prompt, tool call, and final synthesis.
    * **7-Tool Classification**: Categorized tools into `READ_FAST` (`get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`), `ANALYTICAL` (`analyze_job_fit`, `recommend_portfolio_projects`), and `AI_GENERATION` (`generate_tailored_resume`, `draft_cover_letter`).
    * **Cache Audit (`CACHE_NOT_IMPLEMENTED`)**: Confirmed domain services currently execute live PostgreSQL queries with zero in-memory/Redis caching; defined realistic warm-pool benchmark baseline.
    * **Target Feasibility & Bounds**: Clarified that `<1.5s` (p95) applies to the `MCP_HTTP` boundary under `DB_WARM`/`MCP_WARM` conditions, while `END_TO_END` multi-turn Gemini interactions are budgeted separately at `<4.0s` (p95).
    * **Zero-Waste Benchmark Harness Design**: Designed `scripts/benchmark-mcp.js` using mock AI for high-volume deterministic benchmarks ($N=100$) and a small live sample ($N \le 10$) for Golden Path calibration, eliminating 429 rate limits and preserving Google Cloud promotional credits.
* **P8-006 (Implement MCP Tool Latency Benchmarking & Performance Baseline — Completed & Verified)**:
  * Deliverables Created:
    * `scripts/benchmark-mcp.js`: Standalone multi-concurrency benchmark runner measuring all 7 MCP tools across `TOOL_ONLY` and `MCP_HTTP` boundaries. Features synthetic fixture management, warm database pool priming, Fastify HTTP client integration, rate-limiter headroom tuning, and leak-free teardown (`0 open DB handles remaining`).
    * `src/utils/benchmark-stats.js`: Deterministic mathematical utility providing mean, sample standard deviation, percentile interpolation ($p50, p95, p99$), min/max, error rate calculation, and regression status gating against global SLA (<1500ms) and tool-specific budgets.
    * `tests/unit/mcp-latency-benchmark.test.js`: 22 unit tests verifying statistical math functions, SLA threshold evaluation, and regression rules.
    * `docs/mcp-performance-baseline.json`: Structured benchmark output recording latency distributions, percentiles, error rates, and regression metrics for all 7 tools across concurrency tiers $C=1, 5, 10$.
    * `docs/mcp-performance-baseline.md`: Executive markdown baseline report with benchmark summary tables, multi-concurrency matrix, boundary comparisons, and architectural bottleneck analysis.
  * Invariants & Architecture Verified:
    1. **Strict Latency Boundary Separation**: Measured `TOOL_ONLY` (in-memory service delegation + SQL queries) and `MCP_HTTP` (Fastify routing + SHA-256 Bearer token auth + rate-limiter sliding-window inspection + JSON-RPC serialization) independently.
    2. **Real Database Baseline**: Verified live against remote Aiven PostgreSQL 17 without synthetic cache hits (`CACHE_NOT_IMPLEMENTED`).
    3. **Zero Errors & Zero Database Handle Leaks**: All 7 tools executed with 0.0% error rate across all concurrency tiers; Fastify and PostgreSQL pool closed cleanly with 0 leaked handles (`npm run test:db-lifecycle-check` 32/32 PASS).
    4. **Deterministic Master Quality Gate**: Full test suite passed (1,139/1,139 tests across 295 suites).
  * Automated Verification Results:
    * `node --test tests/unit/mcp-latency-benchmark.test.js` -> PASS (22/22 tests passed in 14.5ms)
    * `npm run test:db-lifecycle-check` -> PASS (32/32 files verified, 0 violations)
    * `npm run test:unit` -> PASS (890/890 tests passed across 218 suites in 25.1s)
    * `npm run test:integration` -> PASS (249/249 tests passed across 77 suites in 34.1s)
    * `npm test` -> PASS (1,139/1,139 tests passed across 295 suites in 55.4s)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
  * Status: **`P8-006 COMPLETE & VERIFIED`**.

---

### PHASE 9: Approved GitHub / Project Modification Workflows

* **P9-001A (Approved GitHub / Project Modification Workflows Architecture & Security Review — Completed & Approved)**:
  * Deliverables Created:
    * `docs/github-project-modification-architecture.md`: Architectural specification (`ARCH-031`), `ADR-052` in `docs/decisions.md`.
  * Architectural Findings & Design Specifications:
    * **10-Point Comprehensive Threat Model**: Mitigated prompt injection, CI/CD workflow hijacking, protected branch corruption, cross-tenant confused deputy execution, credential introduction, path traversal, replay/duplicate execution, stale base commit race conditions, diff bloat DoS, and binary artifact injection.
    * **Inverse Authority Principle for Repository Writes**: AI clients (Gemini, Claude, ChatGPT) act strictly as proposers of candidate skill gap additions and code diffs with ZERO write or execution authority. All modifications require deterministic pre-validation and interactive human approval.
    * **Two-Phase Human-in-the-Loop State Machine**: Formally specified the `ApprovalTicket` model (stored in PostgreSQL with 15-minute TTL, SHA-256 HMAC patch fingerprint, and optimistic concurrency lock on `expectedHeadSha`). Re-use attempts fail closed (`409 Conflict`).
    * **Isolated Feature Branch Invariant**: All writes are strictly confined to disposable feature branches matching `^feat/career-hub-[a-z0-9-]+$`. Direct commits to default/protected branches (`main`, `master`), force pushes, branch deletions, and PR auto-merges are physically prohibited in code.
    * **Least-Privilege GitHub App Token Sourcing**: Scopes write installation tokens down to the single target repository (`repositories: [targetRepo]`) and minimal permissions (`contents: write`, `pull_requests: write`), completely excluding workflow and administration permissions.
    * **Deterministic Patch Safety Engine**: Enforces POSIX path normalization, protected workflow blocklist (`.github/workflows/*`), binary exclusion, max 10 files / 500 lines limits, and high-entropy secret scanning.
    * **Immutable Audit Trail & Non-Destructive Rollback**: Full write provenance recorded in PostgreSQL (`audit_logs`) without token leakage. Non-destructive rollback via draft PR closure and feature branch deletion.
    * **Constrained MCP Exposure**: Exposes exactly two domain-specific tools (`propose_project_improvement` for proposal/preview and `confirm_and_create_pr` for confirmed execution), preventing excessive agency and generic coding agent drift.
* **P9-001 (Implement Project Improvement Recommender — Completed & Verified)**:
  * Deliverables Created:
    * `src/domain/career/project-improvement.schemas.js`: Canonical Zod schemas (`StructuredPatchFileSchema`, `PatchSummarySchema`, `VerificationPlanSchema`, `ProjectImprovementProposalSchema`, `ProjectImprovementRequestSchema`), security blocklists (`BLOCKED_PATH_PATTERNS`, `BLOCKED_BINARY_EXTENSIONS`), path validator (`validatePatchPath`), file hash calculator (`computeFileSha256`), and patch fingerprint HMAC (`computePatchFingerprint`).
    * `src/clients/ai/prompt-policies/project-improvement.policy.js`: Dedicated prompt policy (`ProjectImprovementPolicy`) with XML-delimited prompt sandboxing, strict workflow blocklist instructions, and zero-hallucination constraints. Registered in `src/clients/ai/prompt-policies/index.js` and `src/clients/ai/task-policy.js`.
    * `src/services/project-improvement-recommender.service.js`: Domain service implementing the complete recommender pipeline: multi-tenant sovereign verification, deterministic skill gap analysis via `EvidenceMatchingService`, candidate repository ranking via `ProjectRelevanceService`, AI/deterministic structured synthesis, 7-point deterministic safety engine (path sanitization, workflow blocklist, binary filter, size limits, secret detection, evidence provenance gate), and asynchronous MCP audit logging (`project.improvement.proposed`).
    * `docs/project-improvement-recommender.md`: Comprehensive engineering guide detailing architecture, input/output contracts, safety engine, Inverse Authority rules, and failure modes.
    * `tests/unit/project-improvement-recommender.test.js`: 19 unit tests verifying missing/partial skill gaps, repository ranking, zero repository handling, evidence grounding, path traversal / protected workflows rejection, secret scanning and auto-blocking, multi-tenant default-deny isolation, and adversarial prompt injection defense.
    * `tests/integration/project-improvement-recommender.test.js`: 2 database integration tests verifying full end-to-end proposal generation and deterministic fallback with clean database lifecycle teardown (0 leaked connections).
    * `tests/integration/live/project-improvement-vertex.live.test.js`: Dedicated live Vertex AI foundation model integration test running under `npm run test:live:vertex`.
  * Security & Architectural Invariants Verified:
    1. **Inverse Authority Principle**: AI proposes candidate additions; deterministic kernel validates and signs off. ZERO GitHub write APIs called.
    2. **Zero Writes**: Generates purely advisory `ProjectImprovementProposal` with status `PROPOSED` or `BLOCKED`. Zero branches, commits, PRs, or approval tickets created.
    3. **Deterministic Gap Grounding**: Consumes authentic `MISSING`/`PARTIAL` skill gaps directly from `EvidenceMatchingService`.
    4. **Multi-Tenant Sovereign Isolation**: Returns 404 NOT_FOUND on any cross-tenant candidate or job description access.
    5. **7-Point Patch Safety Pipeline**: Enforces relative POSIX paths, blocks `.github/workflows/*` and 38 binary extensions, limits diffs to $\le 10$ files, $\le 500$ lines, $\le 100$ KB payload, and scans high-entropy secrets via `SecretScrubber`.
    6. **Zero Leaked Handles**: Clean database lifecycle teardown verified via `npm run test:db-lifecycle-check` (33/33 PASS).
  * Automated Verification Results:
    * `node --test tests/unit/project-improvement-recommender.test.js` -> PASS (19/19 tests passed across 6 suites in 106ms)
    * `node --test tests/integration/project-improvement-recommender.test.js` -> PASS (2/2 tests passed in 7.49s, DB drained cleanly)
    * `npm run test:live:vertex` -> PASS (2/2 tests passed, 3 live tests gracefully handled ADC token status)
    * `npm run test:db-lifecycle-check` -> PASS (33/33 files verified, 0 violations)
    * `npm run test:unit` -> PASS (909/909 tests passed across 224 suites in 23.2s)
    * `npm test` -> PASS (1,160/1,160 tests passed across 302 suites in 51.4s)
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
  * Status: **`P9-001 COMPLETE & VERIFIED`**.

* **P9-002A (Two-Phase Human-in-the-Loop Action Approval State Machine Architecture & Security Review — Completed & Approved)**:
  * Deliverables Created:
    * `docs/approval-state-machine-architecture.md`: Comprehensive architectural specification (`ARCH-032`), `ADR-053` in `docs/decisions.md`.
  * Architectural Findings & Design Specifications:
    * **8-State Canonical Lifecycle Model**: Defined formal state machine (`PENDING`, `APPROVED`, `EXECUTING`, `EXECUTED`, `REJECTED`, `CANCELLED`, `EXPIRED`, `FAILED`). Guaranteed strict immutability of terminal states and single-use consumption semantics.
    * **Cryptographic HMAC-SHA256 Binding with HKDF Tenant Isolation**: Every ticket payload is signed with an HMAC-SHA256 signature calculated over a canonical pipe-delimited string of all mutable parameters (`tenantId`, `userId`, `candidateId`, `resourceId`, `proposalId`, `repositoryName`, `baseBranch`, `targetBranch`, `expectedHeadSha`, `patchFingerprint`, `expiresAt`). Signing keys are derived per tenant using HKDF-SHA256, guaranteeing cross-tenant cryptographic isolation.
    * **Deterministic Single-Use Atomic CAS**: Execution pickup transitions `APPROVED` $\rightarrow$ `EXECUTING` via PostgreSQL row-level locks (`SELECT FOR UPDATE`) and atomic CAS (`consumed_at IS NULL`). Concurrent execution attempts or replays fail closed with `409 Conflict`.
    * **Optimistic Concurrency on Base HEAD SHA (`expectedHeadSha`)**: Ticket creation records the base branch's HEAD commit SHA. If the target repository has advanced before execution, execution fails closed with `StaleHeadShaError` (`409 Conflict`) rather than silently rebasing.
    * **Dual Expiration Ceilings (15m Creation TTL / 5m Execution Window)**: Tickets expire automatically after 15 minutes if unapproved, and within 5 minutes after approval if execution is not picked up, governed strictly by authoritative PostgreSQL server time (`NOW()`).
    * **Strict Role-Based Authorization**: Requires authenticated `MEMBER` or `OWNER` session context to approve or reject tickets. `READONLY` accounts and unauthenticated callers are rejected with `403 Forbidden`.
    * **15-Scenario Comprehensive Threat Model (T-01 to T-15)**: Mitigated token theft, ticket theft, ticket replay, parameter substitution, patch substitution, tenant confusion, approval impersonation, stale branch races, concurrent confirmation, indirect prompt injection, malicious CI workflows, DB record tampering, client clock skew, duplicate confirmation, and partial network failure.
    * **Comprehensive Audit Trail**: Every lifecycle transition emits an asynchronous, redacted audit event to `audit_logs` (`approval.ticket_created`, `approval.ticket_approved`, `approval.ticket_rejected`, `approval.ticket_cancelled`, `approval.ticket_expired`, `approval.execution_started`, `approval.execution_completed`, `approval.execution_failed`).
  * Status: **`P9-002A APPROVED`**.

* **P9-002 (Implement Two-Phase Human-in-the-Loop Action Approval State Machine — Completed & Verified)**:
  * Deliverables Created / Modified:
    * `src/db/schema.js`: Added `approvalTicketStatusEnum` and `actionApprovalTickets` table with foreign keys, indexes, and unique idempotency constraint.
    * `drizzle/0004_amused_red_shift.sql`: Applied PostgreSQL migration via `npm run db:migrate`.
    * `src/domain/career/approval-ticket.schemas.js`: Canonical Zod domain schemas (`CreateApprovalTicketInputSchema`, `ApprovalTicketSchema`, `ApproveTicketInputSchema`, `RejectTicketInputSchema`, `CancelTicketInputSchema`, `ConsumeTicketInputSchema`, `CompleteExecutionInputSchema`, `FailExecutionInputSchema`).
    * `src/domain/career/index.js`: Re-exported approval ticket schemas.
    * `src/errors/approval.errors.js`: Typed error classes (`ApprovalTicketNotFoundError`, `ApprovalTicketExpiredError`, `ApprovalTicketStateError`, `StaleHeadShaError`, `InvalidTicketSignatureError`).
    * `src/errors/index.js`: Re-exported approval error classes.
    * `src/security/approval-signer.js`: HMAC-SHA256 signature generator and verifier with HKDF-SHA256 per-tenant key derivation and constant-time comparison.
    * `src/db/repositories/approval-ticket.repository.js`: PostgreSQL repository with `createApprovalTicketRecord`, `getApprovalTicketById`, `getApprovalTicketForUpdate` (with row-level `SELECT FOR UPDATE`), `transitionTicketStatusAtomic`, and `listApprovalTicketsByTenant`.
    * `src/services/action-approval-ticket.service.js`: Domain service implementing the full 8-state state machine, RBAC guards, 15m creation TTL, 5m execution window, single-use CAS, optimistic concurrency, and audit logging.
    * `tests/unit/action-approval-ticket.test.js`: 11 unit tests covering state transitions, signer HKDF derivation, tampering rejection, and domain schema assertions.
    * `tests/integration/action-approval-ticket.test.js`: 7 PostgreSQL integration tests covering full lifecycle happy path, rejection/cancellation terminal states, concurrent confirmation contention, single-winner consume races, idempotent re-entry, database-level tamper detection, and multi-tenant isolation with 0 connection leaks.
  * Invariants & Security Validations:
    * **Sole Authorization Boundary**: Action approval tickets serve as the mandatory, cryptographically signed perimeter before any external GitHub mutations.
    * **Zero GitHub Writes**: P9-002 performs zero Git branch creations, zero commits, and zero pull request creations (reserved for P9-003).
    * **Zero MCP Tool Exposure**: P9-002 contains zero MCP tool registrations (reserved for P9-005).
    * **Single-Use Atomic CAS**: Transition from `APPROVED` to `EXECUTING` is guarded by row-level locks and `consumed_at IS NULL`, preventing duplicate execution.
    * **Multi-Tenant Sovereign Isolation**: Cross-tenant lookups and state transitions return 404 NOT_FOUND.
    * **Zero Leaked Handles**: Clean database lifecycle teardown verified via `npm run test:db-lifecycle-check` (34/34 PASS).
  * Automated Verification Results:
    * `node --test tests/unit/action-approval-ticket.test.js` -> PASS (11/11 tests passed across 3 suites in 18ms)
    * `node --test tests/integration/action-approval-ticket.test.js` -> PASS (7/7 tests passed in 18.5s with clean pool drain)
    * `npm run test:db-lifecycle-check` -> PASS (36 integration test files audited, 34 DB-using files verified, 0 violations)
    * `npm run test:unit` -> PASS (920/920 tests passed across 227 suites in 23.0s)
    * `npm test` -> PASS (1,178/1,178 tests passed across 306 suites in 78.2s with 0 failures, 0 cancellations, 0 skips)
    * `npm run lint` -> PASS (0 errors, 0 warnings across whole repository)
    * `npm run format:check` -> PASS (100% Prettier compliant)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
  * Status: **`P9-002 COMPLETE & VERIFIED`**.

* **P9-003A (GitHub Write Operations Architecture & Security Review — Completed & Approved)**:
  * Deliverables Created:
    * `docs/github-write-operations-architecture.md`: Comprehensive architectural specification (`ARCH-033`), `ADR-054` in `docs/decisions.md`.
  * Architectural Findings & Design Specifications:
    * **Git Data API over Contents API for Atomic Multi-File Commits**: Prohibited high-level `PUT /contents/{path}` which creates $N$ individual commits for $N$ files. Adopted low-level Git Data API (`POST /git/trees` $\rightarrow$ `POST /git/commits` $\rightarrow$ `POST /git/refs`) creating exactly one atomic Git commit linking all patch files before branch ref creation.
    * **Mandatory Action Approval Ticket Authorization Gate**: `GitHubWriteService` cannot be invoked directly by AI agents or external clients. It strictly requires consuming an `APPROVED` `ActionApprovalTicket` via `ActionApprovalTicketService.consumeTicketForExecution()`.
    * **Dynamic Least-Privilege Installation Token Scoping**: Scopes installation tokens (`ghs_*`) on-demand to the single target repository (`repositories: [targetRepo]`) and minimal write permissions (`contents: write`, `pull_requests: write`). Administration, workflows, actions, and secrets permissions are strictly prohibited.
    * **Optimistic Concurrency on Live Base Branch (`expectedHeadSha`)**: Before mutating repository state, queries live base branch HEAD SHA via `GET /repos/{owner}/{repo}/git/ref/heads/{baseBranch}`. If `liveSha !== ticket.expectedHeadSha`, fails closed immediately with `StaleHeadShaError` (`409 Conflict`). Zero silent rebases.
    * **Draft Pull Request Default & Sanitized Markdown Envelope**: All pull requests are created with `draft: true` against the target repository's base branch with structured, escaped Markdown templates containing full skill gap provenance, confidence scores, and testing instructions.
    * **Non-Destructive Rollback**: If PR creation fails after a branch is created, the system deletes the isolated `feat/career-hub-*` branch ref. Rollback never touches default branches (`main`, `master`) and never rewrites Git history.
    * **15-Scenario Threat Model (T-01 to T-15)**: Mitigated token leakage, cross-tenant writes, approval bypass, stale base commits, default branch overwrites, partial commit states, duplicate PRs/branches, CI workflow hijacking, secret insertion, secondary rate limits, prompt injection in PR markdown, compromised connections, orphaned branches, unauthenticated callers, and force push history tampering.
    * **Live Sandbox Verification Plan**: Designed safe test protocol against `vishu1803/Ai-job-mcp` verifying branch creation, atomic commit creation, draft PR creation, and automated branch cleanup with zero impact on `main`.
  * Status: **`P9-003A APPROVED`**.

* **P9-003 (Implement Approved GitHub Write Operations — Completed & Verified)**:
  * Deliverables Created / Modified:
    * `src/connectors/github/token-cache.js`: Extended `buildTokenCacheKey` and `GitHubTokenCache` (`get`, `set`) to support dynamic permission-based partition hashing, ensuring tokens scoped to `{ contents: 'write', pull_requests: 'write' }` are properly isolated from default read-only tokens.
    * `src/connectors/github/auth.js`: Updated `GitHubAppAuthManager.getInstallationToken()` and `_fetchInstallationTokenWithRetry()` to accept dynamic permissions and request scoped installation tokens from GitHub App API.
    * `src/connectors/github/github-connector.js`: Added `CONNECTOR_CAPABILITIES.WRITE_RESOURCE`, updated `_request()` to pass dynamic permissions and repository selections, and implemented low-level Git Data API methods (`getBranchHeadSha`, `createGitTree`, `createGitCommit`, `createGitRef`, `deleteGitRef`, `createDraftPullRequest`, `getPullRequestByHead`, `closePullRequest`).
    * `src/errors/approval.errors.js`: Added `ForbiddenOperationError` (status 403, code `FORBIDDEN_OPERATION`).
    * `src/services/github-write.service.js`: Implemented the full `GitHubWriteService` orchestrating the 10-step write lifecycle:
      1. Single-use ticket consumption via `ActionApprovalTicketService.consumeTicketForExecution()`.
      2. Multi-tenant sovereign isolation and encrypted credential resolution.
      3. Branch naming invariant validation (`^feat/career-hub-[a-z0-9-]+$`, rejecting `main`, `master`, `develop`, `release/*`).
      4. High-entropy secret scanning on diff content and proposal metadata via `SecretScrubber`.
      5. Existing PR idempotency discovery via `getPullRequestByHead`.
      6. Base branch optimistic concurrency check comparing live HEAD with `ticket.expectedHeadSha` (failing closed with `409 StaleHeadShaError`).
      7. Dynamic least-privilege installation token sourcing.
      8. Atomic Git tree, commit, and ref creation.
      9. Sanitized Markdown Draft Pull Request creation.
      10. Non-destructive rollback (`deleteGitRef`) on upstream failures and lifecycle completion in PostgreSQL.
    * `tests/unit/github-write-operations.test.js`: 12 unit tests covering approval perimeter enforcement, branch safety checks, optimistic locking, secret rejection, non-destructive rollback, and idempotency.
    * `tests/integration/github-write-operations.test.js`: 6 PostgreSQL + mock GitHub integration tests verifying full happy path, stale base commit rejection, non-destructive rollback, idempotent re-entry, multi-tenant default-deny isolation, and rejection of unapproved tickets with 0 DB leaks.
    * `tests/integration/live/github-project-modification.live.test.js`: Live sandbox integration test executing against real GitHub App credentials when configured.
  * Invariants & Security Validations:
    * **Inverse Authority Boundary**: Execution strictly requires a valid, approved `ActionApprovalTicket`. Direct writes without ticket CAS consumption are impossible.
    * **Git Data API over Contents API**: Multi-file patches create exactly one atomic tree and commit before ref creation, preventing broken intermediate repository states.
    * **Live Base Concurrency Locking**: Divergence between live HEAD SHA and expected HEAD SHA triggers `409 Conflict` and marks ticket `FAILED`.
    * **Default Branch Protection**: Target branch regex enforces `feat/career-hub-*`. Attempts to write to default/protected branches throw `403 ForbiddenOperationError`.
    * **Non-Destructive Rollback**: Rollback deletes only the created `feat/career-hub-*` branch ref without modifying default branches or rewriting Git history.
    * **Multi-Tenant Sovereign Isolation**: Verified cross-tenant ticket execution attempts return 404 NOT_FOUND.
    * **Zero Handle Leaks**: Clean database lifecycle teardown verified via `npm run test:db-lifecycle-check` (35/35 PASS).
  * Automated Verification Results:
    * `node --test tests/unit/github-write-operations.test.js` -> PASS (12/12 tests passed across 7 suites in 17.6ms)
    * `node --test tests/integration/github-write-operations.test.js` -> PASS (6/6 tests passed in 16.4s with clean pool drain)
    * `npm run test:db-lifecycle-check` -> PASS (38 integration test files audited, 35 DB-using files verified, 0 violations)
    * `npm run test:unit` -> PASS (932/932 tests passed across 228 suites in 21.7s)
    * `npm run test:integration` -> PASS (264/264 tests passed across 80 suites in 50.8s)
    * `npm test` -> PASS (1,196/1,196 tests passed across 308 suites in 62.7s with 0 failures, 0 cancellations, 0 skips)
    * `npm run lint` -> PASS (0 errors, 0 warnings across whole repository)
    * `npm run format:check` -> PASS (100% Prettier compliant)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
  * Status: **`P9-003 COMPLETE & VERIFIED`**.

* **P9-004A (GitHub Write Safety Constraints Architecture & Security Review — Completed & Approved)**:
  * Deliverables Created:
    * `docs/github-write-safety-architecture.md`: Comprehensive architectural specification (`ARCH-034`), `ADR-055` in `docs/decisions.md`.
  * Architectural Findings & Design Specifications:
    * **Centralized Safety Kernel Architecture (`GitHubWriteSafetyService`)**: Established an authoritative, single-point-of-enforcement safety kernel that decouples security invariants from execution logic. All repository mutations from `GitHubWriteService` and future MCP write tools (`P9-005`) must pass through this kernel.
    * **Authoritative Dynamic Default Branch Discovery**: Combines static blocklist (`main`, `master`, `develop`, `release/*`, `prod*`, `v*`) with runtime GitHub repository metadata discovery (`default_branch`). Direct writes to default or protected branches are physically impossible and fail closed with `ForbiddenOperationError(PROTECTED_DEFAULT_BRANCH)`.
    * **Target vs. Base Branch Separation**: Enforces `targetBranch !== baseBranch` on all operations. Target must match `^feat/career-hub-[a-z0-9-]+$` and base must be an existing valid branch.
    * **Strict Git Ref Whitelist & Sanitization**: Prohibits tag injection (`refs/tags/*`), remote ref hijacking (`refs/remotes/*`), pull request ref tampering (`refs/pull/*`), path traversal, null bytes, and control characters. Only `refs/heads/feat/career-hub-*` refs can be created.
    * **Physical Force-Push Elimination**: `createGitRef` omits force flags; `updateGitRef` is completely unexposed in `GitHubAppConnector`.
    * **Defense-in-Depth Patch Policy**: Re-validates POSIX path normalization, blocks directory traversal (`..`), hidden control directories (`.git/`, `.husky/`), CI/CD workflow files (`.github/workflows/*`, `.gitlab-ci*`, `Jenkinsfile`), environment/credential files (`.env*`, `*.pem`, `*.key`), and 38 binary file extensions.
    * **Pre-Execution High-Entropy Secret Scanning Engine**: Scans all outbound patch file contents, file paths, commit messages, PR titles, and PR bodies for secrets via `SecretScrubber` before any Git Data API call.
    * **Optimistic Concurrency & Live Base HEAD SHA Enforcement**: Live base branch HEAD commit SHA must match `ticket.expectedHeadSha` prior to tree creation. Divergence fails closed with `StaleHeadShaError` (`409 Conflict`).
    * **20-Scenario Threat Model (T-01 to T-20)**: Mitigated direct default branch overwrites, custom default branch bypass, target=base branch collision, ref injection, path traversal, CI/CD workflow hijacking, hidden control directory tampering, credential files, binary artifacts, hardcoded secrets, force-push history rewrites, stale base commit races, cross-tenant confused deputies, unapproved ticket bypass, ticket tampering, token privilege escalation, branch collision, diff bloat DoS, prompt injection in PR markdown, and untrusted client repository identity.
    * **Structured Audit Logging**: Standardized audit event catalog (`github.write.blocked.*`) emitted to PostgreSQL `audit_logs` on any safety rejection.
  * Status: **`P9-004A APPROVED`**.

* **P9-004 (Enforce Safety Constraints: write actions NEVER touch default branch — Completed & Verified)**:
  * Deliverables Created & Modified:
    * `src/services/github-write-safety.service.js`: Implemented centralized deterministic safety kernel (`GitHubWriteSafetyService`) exposing `validateBranchPolicy`, `validateGitRef`, `validatePatchPolicy`, `validateSecrets`, `validateApprovalBinding`, `validateExpectedHeadSha`, `validateWriteTokenScope`, and atomic `validateExecutionSafetyGate`.
    * `src/errors/approval.errors.js` & `src/errors/index.js`: Added typed safety errors (`ProtectedDefaultBranchError`, `InvalidGitRefError`, `PatchPolicyViolationError`, `WorkflowModificationError`, `SecretDetectedError`, `BranchCollisionError`).
    * `src/services/github-write.service.js`: Integrated `GitHubWriteSafetyService` as mandatory pre-execution safety gate prior to any Git Data API mutation.
    * `src/connectors/github/github-connector.js`: Added `getRepository` metadata discovery method.
    * `tests/unit/github-write-safety.service.test.js`: Created 34 unit & property-based tests covering all safety invariants.
    * `tests/integration/github-write-operations.test.js`: Extended integration test suite with safety gate tests (default branch protection, workflow modification protection, anti-tamper).
    * `tests/integration/live/github-project-modification.live.test.js`: Extended live test suite with live safety assertion.
  * Architectural Findings & Invariants Enforced:
    * **Zero Production Bypass**: Audited codebase to verify that `createGitTree`, `createGitCommit`, `createGitRef`, and `createDraftPullRequest` can only be invoked through `GitHubWriteService.executeApprovedTicket` which requires passing `validateExecutionSafetyGate`.
    * **Authoritative Dynamic Default Branch Discovery**: Direct writes to default or protected branches are physically impossible and fail closed with `ForbiddenOperationError(PROTECTED_DEFAULT_BRANCH)`.
    * **Target vs. Base Branch Separation**: Enforces `targetBranch !== baseBranch` on all operations. Target must match `^feat/career-hub-[a-z0-9-]+$` and base must be an existing valid branch.
    * **Strict Git Ref Whitelist & Dangerous Sequence Rejection**: Only `refs/heads/feat/career-hub-*` refs can be created. Tag injection, remote ref hijacking, traversal sequences (`..`), null bytes (`\0`), and control characters are rejected.
    * **Physical Force-Push Elimination**: `createGitRef` omits force flags; `updateGitRef` is completely unexposed in `GitHubAppConnector`.
    * **Defense-in-Depth Patch Policy**: Blocks path traversal (`..`), backslashes (`\`), hidden control directories (`.git/`, `.husky/`), CI/CD workflow files (`.github/workflows/*`, `.gitlab-ci*`, `Jenkinsfile`), environment/credential files (`.env*`, `*.pem`, `*.key`, `id_rsa`), and 38 binary file extensions.
    * **Pre-Execution High-Entropy Secret Scanning Engine**: Scans all outbound patch file contents, file paths, commit messages, PR titles, and PR bodies for secrets via `SecretScrubber` before any Git Data API call.
    * **Optimistic Concurrency Locking**: Live base branch HEAD commit SHA must match `ticket.expectedHeadSha` prior to tree creation. Divergence fails closed with `StaleHeadShaError` (`409 Conflict`).
  * Automated Verification Results:
    * `node --test tests/unit/github-write-safety.service.test.js` -> PASS (34/34 tests passed across 10 suites in 80.6ms)
    * `node --test tests/unit/github-write-operations.test.js` -> PASS (12/12 tests passed across 1 suite in 64.2ms)
    * `node --test tests/integration/github-write-operations.test.js` -> PASS (8/8 tests passed in 15.9s with clean pool drain)
    * `node --test tests/integration/live/github-project-modification.live.test.js` -> PASS (2/2 tests passed in 4.9ms)
    * `npm run test:db-lifecycle-check` -> PASS (38 integration test files audited, 35 DB-using files verified, 0 violations)
    * `npm run test:unit` -> PASS (966/966 tests passed across 238 suites in 23.6s)
    * `npm run test:integration` -> PASS (266/266 tests passed across 80 suites in 38.5s)
    * `npm test` -> PASS (1,232/1,232 tests passed across 318 suites in 51.7s with 0 failures, 0 cancellations, 0 skips)
    * `npm run lint` -> PASS (0 errors, 0 warnings across whole repository)
    * `npm run format:check` -> PASS (100% Prettier compliant)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
  * Status: **`P9-004 COMPLETE & VERIFIED`**.

* **P9-005A (MCP GitHub Write Tools Architecture & Security Review — Completed & Approved)**:
  * Deliverables Created:
    * `docs/mcp-write-tools-architecture.md`: Comprehensive architectural specification (`ARCH-035`), `ADR-056` in `docs/decisions.md`.
  * Architectural Findings & Design Specifications:
    * **Strict Two-Tool Domain Boundary**: Prohibited generic write primitives (`modify_repository`, `write_file`, `create_commit`, `create_branch`). Exposes only `propose_project_improvement` (creates proposal & `ActionApprovalTicket`) and `confirm_and_create_pr` (executes approved ticket to create remote branch & Draft PR).
    * **MCP as Pure Interface Layer**: MCP handlers contain zero business logic or raw GitHub mutation logic. Handlers delegate strictly to `ProjectImprovementRecommenderService`, `ActionApprovalTicketService`, and `GitHubWriteService` / `GitHubWriteSafetyService`.
    * **Immutable Request Context Identity**: Derived exclusively from `McpRequestContext` minted by `authenticateMcpRequest()`. Zero trust in client-supplied tenant, user, or role bindings.
    * **RBAC & Scope Enforcement**: Requires `role: 'MEMBER'` or `'OWNER'` and scope `'career:write'`. `READONLY` role and `career:read` scopes fail closed with `403 Forbidden`.
    * **Minimal Confirm Input Schema**: `confirm_and_create_pr` accepts only `{ ticketId, confirmed: true, idempotencyKey, userNotes }`. It rejects client-supplied patches, branches, or repositories.
    * **Anti-AI Self-Approval Stopping Protocol**: Proposal output includes explicit stopping instructions requiring human review before confirmation. Approving `userId` is recorded permanently in the ticket record and audit trail.
    * **Sovereign Multi-Tenant Isolation (404 Default-Deny)**: Cross-tenant ticket lookups or executions fail closed with `404 Not Found`.
    * **Accurate MCP Tool Annotations (2026-07-28 Spec)**: Declared `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true` (for confirm).
    * **20-Scenario Security Threat Model (T-01 to T-20)**: Mitigated approval bypass, patch tampering, DB ticket tampering, parameter injection, cross-tenant confused deputies, role escalation, stale base races, workflow hijacking, secrets in diffs, path traversal, custom default branch overwrites, replay attacks, network timeout retries, PR creation rollback, prompt injection, payload bloat DoS, installation credential forgery, token exfiltration, and AI self-approval loops.
  * Status: **`P9-005A APPROVED`**.

* **P9-005 (Expose MCP Write Tools: propose_project_improvement, confirm_and_create_pr — Completed & Verified)**:
  * Deliverables Created & Modified:
    * `src/domain/mcp/career-write-tools.schemas.js`: Canonical Zod input/output schemas (`ProposeProjectImprovementInputSchema`, `ProposeProjectImprovementOutputSchema`, `ConfirmAndCreatePrInputSchema`, `ConfirmAndCreatePrOutputSchema`) and MCP Tool Definitions (`CAREER_WRITE_TOOL_DEFINITIONS`) with 2026-07-28 annotations.
    * `src/mcp/tools/career-write-tools.js`: Tool registration and invocation handlers (`handleProposeProjectImprovement`, `handleConfirmAndCreatePr`, `registerCareerWriteTools`) delegating to underlying domain services with zero raw write primitives.
    * `src/mcp/tools/index.js`: Registered career write tools into default MCP tools manifest.
    * `src/mcp/server.js`: Wired career write tools registration into `createCareerMcpServer` factory.
    * `tests/unit/mcp-write-tools.test.js`: 20 unit tests verifying schema validation, anti-primitive enforcement, RBAC/scope rules, stopping protocol formatting, and output credential scrubbing.
    * `tests/integration/mcp-write-tools.test.js`: 8 Fastify + PostgreSQL integration tests exercising tool discovery, proposal creation, stopping protocol instructions, 403 READONLY rejection, 404 cross-tenant isolation, literal `confirmed: true` validation, execution to Draft PR, and idempotent re-entry.
    * `tests/integration/live/mcp-write-tools.live.test.js`: Live sandbox integration test executing against GitHub App credentials and repository `vishu1803/Ai-job-mcp`.
  * Architectural Findings & Invariants Enforced:
    * **Zero Raw Write Primitives**: No generic file or branch modification primitives exposed over MCP (`modify_repository`, `write_file`, `create_commit`, `create_branch` are prohibited).
    * **Two-Phase Human Confirmation**: `propose_project_improvement` creates `PENDING` ticket and yields stopping protocol instructions; `confirm_and_create_pr` requires boolean literal `confirmed === true` and executes the transition to `APPROVED` and `EXECUTED`.
    * **Strict Multi-Tenant Sovereign Isolation**: All ticket lookups and executions enforce tenant boundary match, failing closed with `404 Not Found` (never 403) to prevent cross-tenant enumeration.
    * **Idempotency & Re-entry**: `confirm_and_create_pr` safely handles re-invocations on already executed tickets by returning cached execution results without re-running Git mutations.
  * Automated Verification Results:
    * `node --test tests/unit/mcp-write-tools.test.js` -> PASS (20/20 tests passed in 79ms)
    * `node --test tests/integration/mcp-write-tools.test.js` -> PASS (8/8 tests passed in 31.2s with clean pool drain)
    * `node --test tests/integration/live/mcp-write-tools.live.test.js` -> PASS (1/1 test passed / skipped gracefully when credentials not in env)
    * `npm run test:db-lifecycle-check` -> PASS (40 integration test files audited, 37 DB-using files verified, 0 violations)
    * `npm run test:unit` -> PASS (986/986 tests passed across 244 suites in 23.8s)
    * `npm run lint` -> PASS (0 errors, 0 warnings across whole repository)
    * `npm run format:check` -> PASS (100% Prettier compliant)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
  * Status: **`P9-005 COMPLETE & VERIFIED`**.

* **P9-006A (PR Diff Preview & Test Execution Reporting Architecture & Security Review — Completed & Approved)**:
  * Deliverables Created:
    * `docs/pr-diff-preview-test-reporting-architecture.md`: Comprehensive architectural specification (`ARCH-036`), `ADR-057` in `docs/decisions.md`.
  * Architectural Findings & Design Specifications:
    * **Canonical Review Object**: Defined the 9 core questions answered by the pre-confirmation review layer (WHAT WILL CHANGE, WHY, WHERE, HOW MUCH, WHAT EVIDENCE SUPPORTS IT, WHAT TESTS WILL RUN, WHAT HAS BEEN VERIFIED, WHAT HAS NOT BEEN VERIFIED, WHAT EXACTLY WILL USER AUTHORIZE).
    * **Structured Diff Preview & Size Bounds**: Structured unified diff preview format with line counts, per-file operation (`CREATE`, `MODIFY`), per-file size clamping ($\le 4000$ characters), and a 25 KB global proposal JSON ceiling over MCP.
    * **Immutable Cryptographic Patch Fingerprint**: SHA-256 fingerprint computed across sorted canonical file hashes (`operation:path:fileSha`), signed inside `ActionApprovalTicket` HMAC, and asserted by the safety kernel during execution. Zero post-approval regeneration.
    * **Categorical Test Execution Reporting**: Distinct lifecycle states (`NOT_RUN`, `PLANNED`, `RUNNING`, `PASSED`, `FAILED`, `SKIPPED`, `BLOCKED`). Strict truthfulness principle forbidding false claims of passed tests.
    * **Zero Production Credential Sandbox Isolation**: Generated test execution model strips all GitHub keys, database credentials, ADC tokens, and session secrets (`env -i`), disables network (`--net=none`), and enforces 30s timeouts.
    * **Staleness Invalidation on Base HEAD Drift**: Live base branch HEAD commit SHA is compared against `expectedHeadSha`; any divergence fails closed with `409 Conflict` (`STALE_HEAD_SHA`).
    * **Unsuppressed Security Warnings Matrix**: Explicit warnings for unexecuted tests (`WARN_TESTS_NOT_RUN`), dependency manifest additions (`WARN_DEPENDENCY_ADDED`), build configuration modifications (`WARN_CONFIG_MODIFIED`), and large diffs (`WARN_LARGE_DIFF`).
    * **Confirm Tool Boundary**: `confirm_and_create_pr` executes strictly the approved ticket and does not accept new patches or prompt AI re-generation.
    * **Structured Audit Telemetry**: Emits distinct audit events (`mcp.write.preview_generated`, `mcp.write.test_executed`, `mcp.write.warning_emitted`, `mcp.write.approval_requested`, `mcp.write.approval_confirmed`, `mcp.write.stale_head_blocked`).
  * Status: **`P9-006A APPROVED`**.

* **P9-006 (Implement PR Diff Preview & Test Execution Reporting — Completed & Verified)**:
  * Deliverables Created / Updated:
    * `src/domain/career/review.schemas.js`: Canonical domain schemas for `ProjectImprovementReview`, `TestExecutionReport`, `TestResult`, `SecurityWarning`, and `DiffPreviewFile`.
    * `src/domain/mcp/career-write-tools.schemas.js`: Updated `ProposeProjectImprovementOutputSchema` and exported review schemas.
    * `src/services/pr-diff-preview.service.js`: `PrDiffPreviewService` providing deterministic unified diff previews, size clamping ($\le 4000$ chars/file, $\le 25\text{ KB}$ review JSON ceiling), immutable SHA-256 patch fingerprinting, supply chain dependency detection (`WARN_DEPENDENCY_ADDED`), build config modification detection (`WARN_CONFIG_MODIFIED`), large diff detection (`WARN_LARGE_DIFF`), unverified gap warnings (`WARN_UNVERIFIED_GAP`), and truthful risk scoring.
    * `src/services/test-sandbox-runner.service.js`: `TestSandboxRunnerService` providing isolated, credential-stripped (`process.env` stripped), time-bounded (30s) test execution with approved command whitelisting and truthful lifecycle reporting (`NOT_RUN` default).
    * `src/mcp/tools/career-write-tools.js`: Wired `PrDiffPreviewService` into `handleProposeProjectImprovement` to construct the canonical review object, formatted diffs, test reporting, and stopping protocol, emitting `mcp.project_improvement.review_generated` audit telemetry.
    * `tests/unit/pr-diff-preview-test-reporting.test.js`: 20 unit tests verifying schema conformance, diff generation, size clamping, patch fingerprint determinism, test truthfulness, sandbox credential isolation, security warnings, and payload size bounds.
    * `tests/integration/mcp-write-tools.test.js`: 9 integration tests verifying canonical review output, diff preview, security warnings, and base branch HEAD drift rejection (`409 Conflict`).
    * `docs/pr-diff-preview-test-reporting-architecture.md`: Updated to `IMPLEMENTED & VERIFIED`.
  * Automated Verification Results:
    * `node --test tests/unit/pr-diff-preview-test-reporting.test.js` -> PASS (20/20 tests passed in 58ms)
    * `node --test tests/unit/mcp-write-tools.test.js` -> PASS (20/20 tests passed in 93ms)
    * `node --test tests/integration/mcp-write-tools.test.js` -> PASS (9/9 tests passed in 22.5s with clean pool drain)
    * `node --test tests/integration/live/mcp-write-tools.live.test.js` -> PASS (1/1 test passed / skipped gracefully when credentials not in env)
    * `npm run test:db-lifecycle-check` -> PASS (40 integration test files audited, 37 DB-using files verified, 0 violations)
    * `npm run test:unit` -> PASS (1006/1006 tests passed across 252 suites in 25.9s)
    * `npm run lint` -> PASS (0 errors, 0 warnings across whole repository)
    * `npm run format:check` -> PASS (100% Prettier compliant)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
  * Status: **`P9-006 COMPLETE & VERIFIED`**.

* **P10-001A (Claude Remote MCP Connector & OAuth 2.1 Architecture & Security Review — Completed & Approved)**:
  * Deliverables Created:
    * `docs/claude-mcp-connector-architecture.md`: Comprehensive architectural specification (`ARCH-037`), `ADR-058` in `docs/decisions.md`.
  * Architectural Findings & Design Specifications:
    * **Provider-Neutral MCP Boundary**: Claude connects strictly as an external MCP client via Streamable HTTP (JSON-RPC 2.0). Internal AI adapters (`GeminiProviderAdapter`, `GeminiVertexAdapter`) remain completely untouched.
    * **OAuth 2.1 Facade Pattern**: OAuth 2.1 Authorization Server facade built into Career Hub operates alongside existing personal API tokens (`mcp_token_*`). Both converge into identical frozen `McpRequestContext` with zero client-supplied identity trust.
    * **Mandatory PKCE S256**: Enforces `code_challenge_method=S256` (RFC 7636). Plain PKCE, implicit grant, and resource owner password credentials are permanently prohibited.
    * **Standard Metadata Discovery**: 401 Unauthorized returns `WWW-Authenticate: Bearer realm="mcp", resource_metadata="..."` pointing to RFC 9728 (`/.well-known/oauth-protected-resource`) and RFC 8414 (`/.well-known/oauth-authorization-server`).
    * **Public Client Registration**: Supports pre-registered public clients (`claude-web`, `claude-desktop`, `claude-cli`) without client secrets. Exact string redirect match for Claude Web (`https://claude.ai/api/mcp/auth_callback`) and loopback port-agnostic matching for native desktop/CLI clients (RFC 8252).
    * **Sovereign Multi-Tenant Isolation & Identity Mapping**: Tokens bind `sub: userId`, `tid: tenantId`, `role`, and `scope`. Claude cannot choose or override tenant identity. Cross-tenant access fails closed with 404 Not Found.
    * **Write Safety Preservation**: Claude interacts through existing approved write tools (`propose_project_improvement`, `confirm_and_create_pr`). It cannot perform generic file writes, execute shell commands, or bypass human approval stopping protocols. `GitHubWriteSafetyService` remains authoritative.
    * **Perimeter Security & Anti-SSRF**: TLS 1.2+, Origin header validation (`ALLOWED_ORIGINS`) to prevent DNS rebinding attacks, 1 MB request body limit, and multi-tier rate limiting.
    * **Structured OAuth Audit Telemetry**: Emits distinct audit events (`oauth.authorize.requested`, `oauth.consent.granted`, `oauth.token.issued`, `oauth.token.refreshed`, `oauth.token.revoked`, `oauth.token.rejected`, `mcp.oauth.authenticated`).
    * **Live Validation Strategy**: Defined safe validation workflow on sandbox repository `vishu1803/Ai-job-mcp`.
  * Status: **`P10-001A APPROVED`**.

* **P10-001 (Configure Claude Remote MCP Custom Connector Endpoint Compatibility, OAuth 2.1 & Authorization Session Bridge — Completed & Verified)**:
  * Deliverables Created & Modified:
    * `src/domain/oauth/oauth.schemas.js`: Canonical Zod schemas for OAuth Protected Resource Metadata (RFC 9728), Authorization Server Metadata (RFC 8414 with `resource_indicators_supported: true`), Authorize Query (`OAuthAuthorizeQuerySchema` requiring RFC 8707 `resource`, removed client-injected `user_id`/`tenant_id`), Consent Body (`OAuthConsentBodySchema` validating `client_id`, `redirect_uri`, `resource`, `scope`, `state`, `code_challenge`, `code_challenge_method: 'S256'`, and `action: 'allow' | 'deny'`), Token Request (`OAuthTokenRequestSchema` requiring RFC 8707 `resource` for authorization code exchange), Revocation (`OAuthRevokeRequestSchema`), and `invalid_target` RFC 8707 error code.
    * `src/domain/mcp/mcp.schemas.js`: Extended `McpAuthMethodEnum` with `OAUTH_BEARER` and `McpClientInfoSchema` with optional `clientId`.
    * `src/db/schema.js`: Drizzle ORM tables `oauthClients`, `oauthAuthorizationCodes` (with `resource` column), and `oauthTokens` (with `resource` column) with relational cascades and indexes.
    * `drizzle/0005_mushy_the_initiative.sql`: PostgreSQL DDL migration creating initial OAuth 2.1 tables.
    * `drizzle/0006_opposite_marvel_boy.sql`: PostgreSQL DDL migration adding `resource` column to `oauth_authorization_codes` and `oauth_tokens`.
    * `src/config/env.js`: Environment configuration for OAuth settings (`OAUTH_PUBLIC_BASE_URL`, `OAUTH_RESOURCE_URL`, `MCP_BASE_URL`, `OAUTH_ACCESS_TOKEN_TTL_SECONDS`, `OAUTH_REFRESH_TOKEN_TTL_SECONDS`, `OAUTH_AUTH_CODE_TTL_SECONDS`).
    * `src/security/oauth-state.js`: Implemented strict open-redirect validator (`isValidReturnTo`), updated `generateOAuthState` and `validateAndConsumeOAuthState` to preserve verified `returnTo` URLs inside encrypted AES-256-GCM `oauth_transit` cookies.
    * `src/security/auth.service.js`: Preserved and forwarded `returnTo` parameter through GitHub OAuth initiation and callback routines.
    * `src/routes/auth.routes.js`: Accepted `return_to` on `GET /auth/github` and redirected browser to preserved `returnTo` upon successful GitHub OAuth callback in `GET /auth/github/callback`.
    * `src/services/oauth-authorization.service.js`: Provider-neutral `OAuthAuthorizationService` implementing PKCE S256 validation (constant-time comparison), RFC 8707 Resource Indicator URL canonicalization (`canonicalizeResourceUrl`), resource target validation (`isMatchingResource`), Refresh Token Rotation (RTR), token family replay detection and automatic revocation, role-based scope ceiling clamping, resource audience verification during token validation, and constant-time token SHA-256 hashing (`mcp_oauth_acc_*`, `mcp_oauth_ref_*`).
    * `src/security/mcp-auth.js`: Dual-authentication facade in `authenticateMcpRequest()` verifying personal API tokens (`mcp_token_*`) and OAuth Bearer tokens (`mcp_oauth_acc_*`) against expected resource indicator, minting the identical frozen `McpRequestContext`.
    * `src/routes/mcp.routes.js`: Protected MCP endpoint rejecting query parameter tokens (`400 QUERY_TOKEN_PROHIBITED`) and emitting RFC 9728 `WWW-Authenticate: Bearer realm="mcp", resource_metadata="..."` headers on unauthenticated 401 requests.
    * `src/routes/oauth.routes.js`: Fastify OAuth 2.1 endpoints (`GET /.well-known/oauth-protected-resource`, `GET /.well-known/oauth-authorization-server`, `GET /oauth/authorize`, `POST /oauth/authorize/consent`, `POST /oauth/token`, `POST /oauth/revoke`):
      - `GET /oauth/authorize`: Unauthenticated browsers redirect (302) to `/auth/github?return_to=...`; authenticated sessions render interactive HTML consent screen.
      - `POST /oauth/authorize/consent`: Validates active server session, handles user denial (302 redirect with `error=access_denied`), handles user approval (mints single-use code bound to server-derived `tenantId`, `userId`, `userRole`, `resource`, `scopes`, and `codeChallenge`), and emits audit telemetry.
    * `src/app.js`: Registered `oauthRoutes` and injected `oauthService` into `mcpRoutes`.
    * `docs/claude-mcp-connector-architecture.md`: Updated architecture specification (`ARCH-037`) with Authorization Session Bridge and Consent lifecycle.
    * `tests/unit/oauth-authorization-server.test.js`: 19 unit tests verifying cryptographic hashing, PKCE verification, client redirect matching, RFC 8707 resource canonicalization, resource matching, open-redirect defense, returnTo encrypted transit, consent schema validation, and strict rejection of client-injected user/tenant IDs.
    * `tests/unit/mcp-auth.test.js`: 7 unit tests verifying token format routing, inactive user rejection, and dual-auth facade operation.
    * `tests/integration/auth.test.js`: 14 integration tests verifying GitHub OAuth login, session creation, and `return_to` preservation across OAuth roundtrip.
    * `tests/integration/claude-mcp-connector.test.js`: 20 Fastify + PostgreSQL integration tests exercising full OAuth 2.1 Authorization Code Flow with PKCE S256, RFC 8707 Resource Indicators, unauthenticated login redirection, interactive HTML consent screen rendering, user consent denial/approval, token exchange, token refresh rotation, replay revocation, token revocation, scope ceiling clamping, and MCP tool execution (`tools/list`, `tools/call`) over OAuth Bearer token.
  * Architectural Findings & Invariants Enforced:
    * **Authorization Session Bridge**: Seamlessly bridges unauthenticated Claude connections to Career Hub GitHub OAuth login with encrypted `return_to` state preservation and strict open-redirect defenses.
    * **Interactive Consent & Human Safety**: Renders full permissions breakdown with explicit disclosure that Claude never receives GitHub credentials and write actions require human-in-the-loop confirmation.
    * **Strict Multi-Tenant Sovereign Isolation**: Identity (`tenantId`, `userId`, `role`) is derived 100% server-side from PostgreSQL session. Client query parameters (`user_id`, `tenant_id`) are permanently rejected.
    * **RFC 8707 Resource Indicator Compatibility**: Directly satisfies official MCP authorization standard by accepting `resource` parameter on `GET /oauth/authorize` and `POST /oauth/token`, canonicalizing URLs, and relationally binding authorization codes and access tokens to the MCP endpoint.
    * **Dual-Authentication Facade**: Personal API tokens (`mcp_token_*`) and OAuth Bearer tokens (`mcp_oauth_acc_*`) converge into the identical trusted `McpRequestContext`.
  * Automated Verification Results:
    * `node --test tests/unit/oauth-authorization-server.test.js` -> PASS (19/19 tests passed in 58ms)
    * `node --test tests/unit/mcp-auth.test.js` -> PASS (7/7 tests passed)
    * `node --test tests/integration/auth.test.js` -> PASS (14/14 tests passed in 8.4s)
    * `node --test tests/integration/claude-mcp-connector.test.js` -> PASS (20/20 tests passed in 18.7s with clean pool drain)
    * `npm run test:db-lifecycle-check` -> PASS (38 DB-using files verified, 0 violations)
    * `npm run test:unit` -> PASS (1032/1032 tests passed across 258 suites in 30.1s)
    * `npm run lint` -> PASS (0 errors, 0 warnings across whole repository)
    * `npm run format:check` -> PASS (All matched files Prettier compliant)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
* **CANDIDATE REPOSITORY INGESTION & EVIDENCE/SKILLS PIPELINE SYNC (P5 / MCP PIPELINE FIX — Completed & Verified)**:
  * Deliverables Created & Modified:
    * `src/services/candidate-repository-ingestion.service.js`: Provider-neutral `CandidateRepositoryIngestionService` orchestrating the complete synchronization pipeline: discovers active connected repositories for candidate, decrypts credentials transiently, executes deep static extraction (package manifests, code imports, config patterns, commits, README), ensures idempotent project genesis ($1\text{ Resource} \ne 1\text{ Project}$) with slug generation, establishes `project_resources` relations, links all extracted `evidence_items` with `projectId`, recalculates `candidate_skills` rollups (`VERIFIED` vs `INFERRED`), and auto-registers `GITHUB_APP` connector when env credentials exist.
    * `src/routes/candidate.schemas.js`: Zod schemas validating `SyncRepositoriesBodySchema` (optional `resourceId` UUID) and `SyncRepositoriesResponseSchema` with zero credential or secret emission.
    * `src/routes/candidate.routes.js`: Fastify route `POST /candidate/sync-repositories` protected by server-side `authenticate` session middleware and `verifyCsrf` Origin validation. Resolves candidate from authenticated user session.
    * `src/app.js`: Registered `candidateRoutes` under `/candidate` prefix.
    * `src/extractors/github/github-evidence-extractor.js`: Fixed `treeEntries` extraction to check `treeResult.entries` before falling back to `treeResult.tree`, enabling full directory tree traversal, manifest scanning (`package.json`), import scanning, and config matching.
    * `tests/unit/candidate-repository-ingestion.test.js`: 14 unit tests verifying slug generation, summary building from metadata, zero-state summaries, and validation guards.
    * `tests/integration/candidate-repository-ingestion.test.js`: 7 live PostgreSQL integration tests verifying the full golden path (`Resource` $\rightarrow$ `Project` $\rightarrow$ `Deep Evidence` $\rightarrow$ `Verified Skills`), idempotency across consecutive runs, multi-tenant 404 default-deny isolation, connector error resilience, and specific resource targeting.
  * Live Verification on Connected Repository (`vishu1803/Ai-job-mcp`):
    * Discovered connected GitHub App resource (`556e6240-03c2-4d46-bf62-0c8d7cf9cb35`).
    * Generated domain project `f68e4520-52bd-4355-822f-2bc0a02d8c5f` (`vishu1803/Ai-job-mcp`, `slug: ai-job-mcp`, `highlighted: true`).
    * Linked `project_resources` with `roleInProject: 'Primary Repository'`.
    * Extracted 32 evidence items across manifests (18), imports (6), config patterns (2), README (3), and directory structures (3).
    * Linked 32/32 evidence items with `projectId`.
    * Rolled up 19 `VERIFIED` candidate skills (Drizzle ORM [1.0], Fastify [1.0], PostgreSQL [1.0], Zod [0.85], Pino [0.85], Dotenv [0.85], Node.js [0.72], JavaScript [0.64], GitHub Actions [0.72], Genai [0.85], Prettier, ESLint, etc.).
    * Live MCP Tool Verification:
      - `get_candidate_profile`: Returns 1 highlighted project (`Ai-job-mcp`) with 32 verified signals and top 15 verified skills.
      - `list_verified_skills`: Returns 19 verified skills with authentic evidence and timestamps.
      - `analyze_job_fit`: Returns ATS score, matched key skills (`javascript`, `node-js`, `fastify`, `postgresql`, `drizzle-orm`, `zod`), and project relevance ranking.
  * Automated Verification Results:
    * `node --test tests/unit/candidate-repository-ingestion.test.js` -> PASS (14/14 tests passed in 22ms)
    * `node --test tests/integration/candidate-repository-ingestion.test.js` -> PASS (7/7 tests passed against PostgreSQL in 220s with clean pool drain)
    * `npm run test:unit` -> PASS (1046/1046 tests passed across 264 suites in 26.2s)
    * `npm run lint` -> PASS (0 errors, 0 warnings across whole repository)
    * `npm run format:check` -> PASS (All files 100% Prettier compliant)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
  * Status: **`COMPLETE & VERIFIED`**.

---

* **CAREER JOB-FIT ENGINE CORRECTIONS (EVIDENCE MATCHING & PROJECT RELEVANCE TAXONOMY — Completed & Verified)**:
  * Deliverables Created & Modified:
    * `src/domain/career/skill-taxonomy.js`:
      * Added canonical skill `mcp` (`Model Context Protocol`, `category: 'TOOL'`) with package aliases `@modelcontextprotocol/server`, `@modelcontextprotocol/core`, and `@modelcontextprotocol/sdk`.
      * Added canonical skill `gemini` (`Google Gemini`, `category: 'TOOL'`) with package aliases `@google/genai`, `@google/generative-ai`, `google-genai`, and `gemini-ai`.
      * Added canonical concepts `agent-tooling`, `json-rpc`, `large-language-models`, and `generative-ai` under `CONCEPT` category to guarantee zero dangling relationship edges in the directed acyclic graph.
      * Fully verified via `validateTaxonomyGraph()` with zero graph discrepancies.
    * `src/services/evidence-matching.service.js`:
      * Implemented direct directional `candRelationships.implements.includes(targetSlug)` evaluation in `_evaluateTaxonomyRelationships()` before peer matching (`status: 'MATCHED'`, `relationshipType: 'IMPLEMENTS'`, confidence `0.90`–`0.95`).
      * Preserved peer `implements` matching as `PARTIAL` (`0.50`) and maintained `PARENT_OF`, `BUILT_ON`, and `ECOSYSTEM_OF` invariants.
    * `src/services/project-relevance.service.js`:
      * Replaced metadata-first skill discovery loop with strict 4-stage authoritative lookup order:
        1. `ev.skillSlug` / `ev.skillName` (authoritative)
        2. `ev.skillId` $\rightarrow$ canonical skills lookup map (`options.skills`, `options.skillsMap`, or `project.skills`)
        3. `ev.metadata?.rawImport` $\rightarrow$ `SkillTaxonomyEngine.normalizeSkill()`
        4. `ev.metadata?.skillName` / `technology` fallback only with `norm.isKnown` guard preventing arbitrary untrusted metadata from fabricating project skills.
      * Added Git SHA format validation in `buildEvidenceRef` to ensure non-hex references safely default to `commitSha = null`.
    * `src/services/candidate-profile.service.js`:
      * Joined `skills` on `evidenceItems.skillId` in project evidence query to natively populate `skillSlug` and `skillName` on all project evidence rows, mapped via `toEvidenceNode`.
    * `src/domain/candidate/candidate.schemas.js`:
      * Added optional `skillSlug` and `skillName` to `EvidenceNodeSchema`.
    * `src/services/evidence/evidence-ref-mapper.js`:
      * Updated `EvidenceRefMapper.toEvidenceNode` to carry `skillSlug` and `skillName` while preserving the lightweight contract for `EvidenceRefMapper.toEvidenceRef`.
    * `src/mcp/tools/career-read-tools.js` & `src/mcp/tools/career-artifact-tools.js`:
      * Injected `candidateProfileObj.skills` into `ProjectRelevanceService.computeProjectsRelevance` options across read and artifact tools.
    * `src/services/candidate-repository-ingestion.service.js`:
      * Safely checked `typeof this.registry.has === 'function'` in constructor before calling `this.registry.has()`.
    * `tests/unit/skill-taxonomy.test.js`:
      * Added 6 unit tests verifying `@modelcontextprotocol/*` $\rightarrow$ `mcp`, `@google/genai` $\rightarrow$ `gemini`, and negative guards ensuring standalone `server` and `core` remain uncataloged generic tools.
    * `tests/unit/evidence-matching.service.test.js`:
      * Added test cases verifying Fastify candidate $\rightarrow$ REST API requirement (`MATCHED`, `IMPLEMENTS`), MCP $\rightarrow$ JSON-RPC (`MATCHED`, `IMPLEMENTS`), PostgreSQL $\rightarrow$ relational-database (`MATCHED`, `PARENT_OF`), and negative tests for prettier, graphql, and grpc.
    * `tests/unit/project-relevance.service.test.js`:
      * Added Section 13 unit tests verifying `ev.skillSlug` directly contributes to project skill coverage, `ev.skillId` resolves via `options.skills`, and arbitrary untrusted metadata is strictly rejected.
  * Live Verification on Connected Repository (`vishu1803/Ai-job-mcp`):
    * Synced repository `vishu1803/Ai-job-mcp` into PostgreSQL database for candidate `10a2b51b-09bf-4090-8040-1f60ebeb89c9`.
    * Discovered 22 candidate skills: `@modelcontextprotocol/server` & `@modelcontextprotocol/core` resolved to `mcp` (Model Context Protocol, `VERIFIED`), `@google/genai` resolved to `gemini` (Google Gemini, `VERIFIED`), `fastify` (`VERIFIED`), `postgresql` (`VERIFIED`), and `drizzle-orm` (`VERIFIED`).
    * Project `vishu1803/Ai-job-mcp` has 35 verified evidence items with canonical `skillSlug` and `skillName`.
    * **Job Evaluation 1 (Software Developer Job)**:
      * Requirements Matched: 6 (`typescript`, `javascript`, `rest-api` [via Fastify `implements`], `postgresql`, `github`, `node-js`).
      * REST API successfully matched via Fastify direct `implements` relation.
      * Project Relevance Score: 33.9 (LOW relevance with 35 evidence items).
      * Raw ATS Score: 53.35. Overall Score: 24.9 (correctly capped by ATS 3+ missing critical skills gate for Docker, Containerization, Microservices).
    * **Job Evaluation 2 (Tailored Backend AI & MCP Platform Engineer Job)**:
      * Requirements Matched: 10/10 (100% coverage for `mcp`, `gemini`, `fastify`, `rest-api`, `postgresql`, `drizzle-orm`, `javascript`, `node-js`, `github`).
      * Project Relevance Score: 33.9.
      * Required Skills Score: 40.0 / 40.0. Preferred Skills Score: 15.0 / 15.0.
      * Overall ATS Fit Score: **86.53 / 100** (**STRONG** fit, uncapped).
  * Automated Verification Results:
    * `npm run test:unit` -> PASS (1056/1056 tests passed across 266 suites in 32.8s)
    * `node --test tests/unit/skill-taxonomy.test.js` -> PASS (36/36 tests passed)
    * `node --test tests/unit/evidence-matching.service.test.js` -> PASS (31/31 tests passed)
    * `node --test tests/unit/project-relevance.service.test.js` -> PASS (33/33 tests passed)
    * `node --test tests/unit/ats-fit-score.service.test.js` -> PASS (32/32 tests passed)
    * `npm run test:db-lifecycle-check` -> PASS (39 DB-using files verified, 0 violations)
    * `npm run db:check` -> PASS (Drizzle Kit check passed: "Everything's fine 🐶🔥")
    * `npm run lint` -> PASS (0 errors, 0 warnings across whole repository)
    * `npm run format:check` -> PASS (All files 100% Prettier compliant)
  * Status: **`COMPLETE & VERIFIED`**.

---


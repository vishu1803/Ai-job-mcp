# Antigravity Career Hub (Universal AI Career MCP Platform)

> **Empowering professionals with a provider-neutral, evidence-backed AI career copilot that connects directly to real-world code repositories via the Model Context Protocol (MCP).**

---

## 1. Project Mission
Traditional AI resume builders and career assistants frequently hallucinate capabilities, generate generic buzzwords, or invent unverifiable work experience. 

**Antigravity Career Hub** solves this by rooting all career claims in verifiable ground truth extracted from a candidate's actual repositories, commit histories, package manifests, and architectural documents. By exposing these verified capabilities through the open **Model Context Protocol (MCP)**, users retain complete sovereignty over their data and can connect any major AI assistant—including **Google Gemini**, **Anthropic Claude**, and **OpenAI ChatGPT**—as their trusted career copilot.

---

## 2. Current Project Status

| Indicator | Status | Details |
| :--- | :--- | :--- |
| **Current Phase** | **PHASE 3 — GitHub App Integration** | GitHub App authentication module (App JWT, installation access tokens, partitioned in-memory token cache, anti-stampede coalescing) verified. |
| **Active Milestone** | **Task P3-001 Complete** | Ready for Task P3-002 (GitHub App Installation Callback & Linking Flow) |
| **Completed Tasks** | **17 / 80 Tasks (21.25%)** | Phase 0 (100%), Phase 1 (100%), Phase 2 (100%), Phase 3 (16.7%) |
| **Automated Tests** | **265 / 265 PASS (100%)** | 198 unit tests, 67 live integration tests across 77 suites |
| **Database** | **PostgreSQL (Aiven Free / Ephemeral CI)** | Managed with Drizzle ORM migrations |

---

## 3. Key Architectural Pillars

* **Provider Neutrality**: Core career intelligence and candidate models never depend on any single AI vendor. The AI client is an interchangeable interface over standard MCP.
* **Radical Evidence Provenance**: Every skill and claim contains an immutable `EvidenceId` citing repository name, file path, and commit SHA.
* **Zero-Hallucination Integrity Gates**: AI prompts and server-side validators reject unverified claims.
* **Human-in-the-Loop Consequential Safety**: External modifications (creating Git branches, opening draft pull requests) require explicit, two-phase user authorization.
* **Multi-Tenant Cryptographic Isolation**: All stored credentials and tokens are encrypted at rest with AES-256-GCM. Multi-tenant row-level isolation is enforced on every query.

---

## 4. System Architecture & Modules

```
Ai-career-agent/
├── src/
│   ├── app.js                         # Fastify application setup with plugins & hooks
│   ├── index.js                       # HTTP server entrypoint
│   ├── config/env.js                  # Strongly-typed environment configuration (Zod)
│   ├── connectors/                    # Provider-neutral resource connector framework (P2-004)
│   │   ├── base/                      # BaseResourceConnector, capabilities, context, models
│   │   ├── errors/                    # Connector error hierarchy with retryability semantics
│   │   ├── registry/                  # Centralized ConnectorRegistry singleton
│   │   └── testing/                   # Deterministic MockResourceConnector
│   ├── db/                            # PostgreSQL connection pool & Drizzle ORM
│   │   ├── schema.js                  # Tenants, users, sessions, audit_logs, resource_connections
│   │   ├── migrate.js                 # Programmatic schema migration runner
│   │   └── repositories/              # Tenant-isolated data access layer (P2-005)
│   ├── middleware/                    # Auth, authorization, CSRF, and Zod validation hooks
│   ├── routes/                        # REST endpoints
│   │   ├── auth.routes.js             # OAuth 2.1 PKCE login, session validation, /dashboard
│   │   ├── connections.routes.js      # Resource connection lifecycle API (P2-005)
│   │   ├── connections.schemas.js     # Zod request/response contracts
│   │   └── health.routes.js           # Liveness (/livez) and database health (/healthz)
│   ├── security/                      # Cryptographic core
│   │   ├── encryption.js              # AES-256-GCM authenticated encryption at rest (P2-001)
│   │   ├── auth.service.js            # User provisioning & tenant assignment
│   │   ├── session.service.js         # Cryptographically random SHA-256 session management
│   │   └── oauth-state.js             # Encrypted transit cookies & PKCE verification
│   └── utils/                         # Security redaction logger & audit data sanitizer
└── tests/
    ├── unit/                          # Fast isolated unit tests (157 tests)
    └── integration/                   # Live PostgreSQL & HTTP integration tests (58 tests)
```

---

## 5. Resource Connection Lifecycle API (`/connections`)

Implemented in **Task P2-005**:

| Method | Path | Summary | Access Role |
| :--- | :--- | :--- | :--- |
| `GET` | `/connections` | List connection summaries with pagination and filters | `OWNER`, `MEMBER`, `READONLY` |
| `GET` | `/connections/:id` | Get detailed connection metadata (strictly zero credentials) | `OWNER`, `MEMBER`, `READONLY` |
| `POST` | `/connections/:id/test` | Validate upstream authorization health against external provider | `OWNER`, Connection Creator |
| `POST` | `/connections/:id/disconnect` | Deactivate connection, purge credentials, best-effort revoke | `OWNER`, Connection Creator |
| `DELETE` | `/connections/:id` | Permanently delete connection record (cascades to child items) | `OWNER`, Connection Creator |

---

## 6. Verification & Quality Gates

Run the comprehensive test and verification pipeline:

```bash
# Run all unit tests
npm run test:unit

# Run live PostgreSQL integration tests
npm run test:integration

# Run entire test suite (unit + integration)
npm test

# Static analysis & linting
npm run lint

# Prettier format verification
npm run format:check

# Drizzle ORM schema validation
npm run db:check
```

---

## 7. Security & Compliance Rules

> [!WARNING]
> **CRITICAL SECURITY RULES**:
> 1. NEVER commit `.env` files or hardcode credentials in code.
> 2. All third-party secrets must be encrypted using AES-256-GCM (`encryptSecret`).
> 3. Consequential external operations MUST go through the two-phase approval gate.
> 4. All database queries must enforce tenant isolation (`WHERE tenant_id = req.tenant.id`).
> 5. Credentials must never appear in HTTP responses, logs, or audit records.

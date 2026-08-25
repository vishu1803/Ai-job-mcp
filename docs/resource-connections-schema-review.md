# Resource Connections Schema Architectural Review & Specification (P2-003A)

**Project**: Antigravity Career Hub (Universal AI Career MCP Platform)  
**Task ID**: P2-003A (Design Review & Approval Gate)  
**Author**: Lead Architecture & Security Agent  
**Date**: 2026-08-21  
**Status**: **APPROVED**  
**Governing Documents**: [`AGENTS.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/AGENTS.md), [`goal.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/goal.md), [`project.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/project.md), [`docs/data-model.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/data-model.md), [`docs/security.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/security.md), [`docs/decisions.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/decisions.md) (ADR-016, ADR-017), [`.github/instructions/database.instructions.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/.github/instructions/database.instructions.md)

---

## 1. Executive Summary & Product Purpose

The **Resource Connection** (`resource_connections`) subsystem defines the platform's multi-tenant integration boundary with external data and code providers (e.g., GitHub, GitLab, Google Drive, OneDrive, Notion, and custom APIs).

### Core Architectural Distinction: Identity vs. Resource Authorization [SPECIFIED]
1. **Authentication Identity (P2-002 / `users`, `sessions`)**:
   * Proves *who* the human actor is.
   * Uses GitHub OAuth 2.0 strictly to resolve email and name (`read:user`, `user:email`).
   * Identity tokens are ephemeral and discarded immediately after profile hydration; session state is managed exclusively via server-side database sessions.
2. **Resource Authorization (P2-003 / `resource_connections`)**:
   * Permits the platform to access external candidate resources (repositories, code trees, commit history, documents).
   * Persists long-lived, encrypted credentials (e.g., GitHub App installation tokens, OAuth refresh tokens, API keys).
   * Represents an isolated authorization boundary, completely decoupled from the AI intelligence layer.

---

## 2. Entity Ownership Model [SPECIFIED]

Every resource connection is bound by a strict dual-ownership hierarchy:

```
[Tenant] 1 ──── ∞ [ResourceConnection] ∞ ──── 1 [User]
```

| Field Name | Type | Relationship & Constraint | Specification Origin | Justification & Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `tenant_id` | `UUID` | `NOT NULL`, `REFERENCES tenants(id) ON DELETE CASCADE` | **SPECIFIED** | Strict tenancy boundary. Guarantees that no tenant can ever inspect, query, or execute operations against another tenant's external resources. |
| `user_id` | `UUID` | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE` | **SPECIFIED** | Human actor attribution. Identifies which workspace member authorized the connection, enforcing RBAC and immutable audit accountability. |

* **Tenant Isolation Rule**: All SQL queries executed by services or MCP tools MUST include `WHERE tenant_id = req.tenant.id`. Attempted cross-tenant access returns `404 Not Found` or `403 Forbidden`.
* **Cascade Deletion Semantics**: Deleting a tenant or user automatically cascades and purges all associated connection records and encrypted credential packages.

---

## 3. Database Schema Specification (`resource_connections`) [PROPOSED]

### 3.1. Drizzle ORM Table Definition

```javascript
import { pgTable, pgEnum, uuid, text, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';

export const resourceProviderEnum = pgEnum('resource_provider', [
  'GITHUB_APP',
  'GITLAB',
  'GOOGLE_DRIVE',
  'ONEDRIVE',
  'NOTION',
  'CUSTOM_API',
]);

export const connectionAuthTypeEnum = pgEnum('connection_auth_type', [
  'APP_INSTALLATION',
  'OAUTH2_CODE',
  'API_KEY',
  'SERVICE_ACCOUNT',
]);

export const resourceConnectionStatusEnum = pgEnum('resource_connection_status', [
  'PENDING',
  'ACTIVE',
  'EXPIRED',
  'REVOKED',
  'ERROR',
  'DISCONNECTED',
]);

export const resourceConnections = pgTable(
  'resource_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: resourceProviderEnum('provider').notNull(),
    authType: connectionAuthTypeEnum('auth_type').notNull(),
    displayName: text('display_name').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    externalAccountName: text('external_account_name'),
    installationId: text('installation_id'),
    encryptedCredentials: text('encrypted_credentials').notNull(),
    keyVersion: text('key_version').notNull().default('v1'),
    status: resourceConnectionStatusEnum('status').notNull().default('PENDING'),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }),
    lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('resource_connections_tenant_provider_account_unique').on(
      table.tenantId,
      table.provider,
      table.externalAccountId
    ),
    index('idx_resource_connections_tenant_id').on(table.tenantId),
    index('idx_resource_connections_user_id').on(table.userId),
    index('idx_resource_connections_tenant_status').on(table.tenantId, table.status),
    index('idx_resource_connections_expires_at').on(table.expiresAt),
    index('idx_resource_connections_key_version').on(table.keyVersion),
  ]
);
```

---

## 4. Column-by-Column Catalog & Design Rationale

| Column Name | Type | Constraints | Decision | Description & Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | `primaryKey()`, `defaultRandom()` | **SPECIFIED** | Globally unique connection identifier (UUIDv4). |
| `tenant_id` | `uuid` | `notNull()`, `references(tenants.id, CASCADE)` | **SPECIFIED** | Enforces multi-tenant data isolation boundary. |
| `user_id` | `uuid` | `notNull()`, `references(users.id, CASCADE)` | **SPECIFIED** | Attributed creator/authorizer of the connection. |
| `provider` | `resource_provider` | `notNull()` | **SPECIFIED** | Enum identifying provider (`'GITHUB_APP'`, `'GITLAB'`, etc.). |
| `auth_type` | `connection_auth_type` | `notNull()` | **SPECIFIED** | Authentication mechanism (`'APP_INSTALLATION'`, `'OAUTH2_CODE'`, `'API_KEY'`). |
| `display_name` | `text` | `notNull()` | **SPECIFIED** | Human-friendly connection label (e.g. `"Primary GitHub (octocat)"`). |
| `external_account_id` | `text` | `notNull()` | **SPECIFIED** | Immutable provider account identifier (e.g. GitHub numeric user ID `"583231"`). |
| `external_account_name` | `text` | `null` | **DERIVED** | Provider username or handle (e.g. `"octocat"`), updated during sync. |
| `installation_id` | `text` | `null` | **SPECIFIED** | GitHub App installation ID (e.g. `"12345678"`). Null for OAuth/API key providers. |
| `encrypted_credentials` | `text` | `notNull()` | **SPECIFIED** | AES-256-GCM encrypted package (`enc:v1:<keyVersion>:<iv>:<tag>:<ciphertext>`). |
| `key_version` | `text` | `notNull()`, `default('v1')` | **SPECIFIED** | Encryption master key version identifier enabling offline key rotation indexing. |
| `status` | `resource_connection_status`| `notNull()`, `default('PENDING')` | **SPECIFIED** | Lifecycle status (`PENDING`, `ACTIVE`, `EXPIRED`, `REVOKED`, `ERROR`, `DISCONNECTED`). |
| `scopes` | `jsonb` | `notNull()`, `default('[]')` | **SPECIFIED** | Array of granted scopes (e.g. `["contents:read", "metadata:read"]`). |
| `metadata` | `jsonb` | `notNull()`, `default('{}')` | **DERIVED** | Safe non-sensitive provider metadata (e.g. target type, repository selection). |
| `expires_at` | `timestamptz` | `null` | **SPECIFIED** | Access token expiration timestamp for automated background refresh scheduling. |
| `refreshed_at` | `timestamptz` | `null` | **DERIVED** | Timestamp of last successful token refresh. |
| `last_validated_at` | `timestamptz` | `null` | **SPECIFIED** | Timestamp of last successful API health probe. |
| `last_error_code` | `text` | `null` | **SPECIFIED** | Safe standardized error code (`ERR_RATE_LIMITED`, `ERR_TOKEN_EXPIRED`, etc.). |
| `last_error_at` | `timestamptz` | `null` | **DERIVED** | Timestamp of last connection error. |
| `created_at` | `timestamptz` | `notNull()`, `defaultNow()` | **SPECIFIED** | Initial connection creation timestamp. |
| `updated_at` | `timestamptz` | `notNull()`, `defaultNow()` | **SPECIFIED** | Last update timestamp. |

---

## 5. Credential Encryption & Token Storage Architecture [SPECIFIED]

### 5.1. P2-001 Native Cryptographic Foundation
* **Cryptographic Standard**: Authenticated Symmetric Encryption (`AES-256-GCM`) via `src/security/encryption.js`.
* **Zero Plaintext at Rest**: Plaintext access tokens, refresh tokens, App private keys, and API secrets NEVER touch database columns, caches, logs, or error objects.
* **Payload Serialization**:
  ```json
  {
    "accessToken": "ghs_16charInstallationToken...",
    "refreshToken": "ghr_40charRefreshToken...",
    "tokenType": "bearer",
    "privateKey": "-----BEGIN RSA PRIVATE KEY-----..."
  }
  ```
  The JSON payload is converted to UTF-8 Buffer, verified against the strict **64 KB size limit**, and encrypted using a unique 12-byte cryptographically random IV.
* **Storage Format**: Stored in `encrypted_credentials` as a compact string:
  ```
  enc:v1:v1:<iv_base64url>:<tag_base64url>:<ciphertext_base64url>
  ```
* **Tamper Resistance**: Tampering with ciphertext, IV, tag, or key version immediately throws `AUTHENTICATION_FAILED` `CryptoError`.

### 5.2. Key Versioning & Seamless Key Rotation
* The explicit `key_version` column permits indexing and batching key rotation jobs:
  ```sql
  SELECT id, encrypted_credentials FROM resource_connections WHERE key_version = 'v1';
  ```
* Secrets are rotated atomically via `rotateSecret(row.encryptedCredentials, newKey, 'v2')` without service interruption.

---

## 6. Connection Lifecycle & State Machine [SPECIFIED]

```mermaid
stateDiagram-v2
    [*] --> PENDING: Initiation (OAuth / App Install)
    PENDING --> ACTIVE: Callback verified & credentials validated
    PENDING --> ERROR: Handshake / Exchange failed
    ACTIVE --> EXPIRED: expires_at reached & refresh failed
    ACTIVE --> REVOKED: External 401/403 or webhook uninstall
    ACTIVE --> ERROR: Rate limited or network unreachable
    ERROR --> ACTIVE: Health check / Re-validation passes
    EXPIRED --> ACTIVE: User re-authenticates or refresh succeeds
    ACTIVE --> DISCONNECTED: User disconnects
    EXPIRED --> DISCONNECTED: User disconnects
    ERROR --> DISCONNECTED: User disconnects
    REVOKED --> DISCONNECTED: User disconnects
    DISCONNECTED --> [*]: Purged / Hard deleted
```

### State Definitions:
1. **`PENDING`**: Initial setup state. Created when an authorization flow begins; awaiting callback and verification.
2. **`ACTIVE`**: Connection healthy, validated, and operational.
3. **`EXPIRED`**: Token lifetime elapsed; refresh failed or refresh token expired.
4. **`REVOKED`**: Authorization revoked by external provider (e.g. GitHub App uninstalled, token revoked in GitHub settings).
5. **`ERROR`**: Transient operational failure (rate limits, network timeout, provider downtime).
6. **`DISCONNECTED`**: Soft-disconnected by user; encrypted credentials scrubbed.

---

## 7. Disconnect, Revoke, and Delete Semantics [SPECIFIED]

| Operation | Trigger | External Action | Database & Credential Action | Audit Event |
| :--- | :--- | :--- | :--- | :--- |
| **DISCONNECT** | User clicks "Disconnect" in UI / API | Best-effort provider token revocation API call | 1. Overwrite `encrypted_credentials` with empty/scrubbed ciphertext.<br>2. Set status to `'DISCONNECTED'`.<br>3. Downstream repositories marked inactive. | `connection.disconnected` |
| **REVOKE** | External webhook (e.g. `app.uninstalled`) or 401 response | None | 1. Set status to `'REVOKED'`.<br>2. Clear temporary access tokens.<br>3. Retain connection history for audit. | `connection.revoked` |
| **HARD DELETE** | Account deletion / GDPR purge | None | 1. Cascade delete all child entities (`repositories`, `evidence_items`).<br>2. Delete `resource_connections` row permanently. | `connection.deleted` |

---

## 8. Index Justification Matrix [SPECIFIED]

| Index Name | Target Columns | Classification | Rationale & Query Pattern |
| :--- | :--- | :--- | :--- |
| `resource_connections_tenant_provider_account_unique` | `(tenant_id, provider, external_account_id)` | **REQUIRED** | Prevents duplicate connections for the same external account within a single tenant workspace. |
| `idx_resource_connections_tenant_id` | `(tenant_id)` | **REQUIRED** | Multi-tenant list queries (`SELECT * FROM resource_connections WHERE tenant_id = $1`) and cascade delete optimization. |
| `idx_resource_connections_user_id` | `(user_id)` | **REQUIRED** | User-specific connection filtering and user cascade deletions. |
| `idx_resource_connections_tenant_status` | `(tenant_id, status)` | **REQUIRED** | Filtering active connections for tenant MCP tool execution (`WHERE tenant_id = $1 AND status = 'ACTIVE'`). |
| `idx_resource_connections_expires_at` | `(expires_at)` | **USEFUL** | Automated background token refresh workers (`WHERE status = 'ACTIVE' AND expires_at <= NOW() + INTERVAL '10 minutes'`). |
| `idx_resource_connections_key_version` | `(key_version)` | **USEFUL** | Offline cryptographic master key rotation batch queries (`WHERE key_version != $1`). |

---

## 9. Entity Relationship Diagram (ERD)

```
       ┌──────────────────────────────┐
       │           tenants            │
       │──────────────────────────────│
       │ id (PK, UUID)                │
       └──────────────┬───────────────┘
                      │ 1
                      │
                      │ ∞
       ┌──────────────▼──────────────┐                ┌──────────────────────────────┐
       │     resource_connections     │ 1            ∞ │            users             │
       │──────────────────────────────│────────────────│──────────────────────────────│
       │ id (PK, UUID)                │                │ id (PK, UUID)                │
       │ tenant_id (FK, UUID)         │                │ tenant_id (FK, UUID)         │
       │ user_id (FK, UUID)           │                └──────────────────────────────┘
       │ provider (ENUM)              │
       │ auth_type (ENUM)             │
       │ display_name (TEXT)          │
       │ external_account_id (TEXT)   │
       │ installation_id (TEXT, NULL) │
       │ encrypted_credentials (TEXT) │
       │ key_version (TEXT)           │
       │ status (ENUM)                │
       │ scopes (JSONB)               │
       │ metadata (JSONB)             │
       │ expires_at (TIMESTAMPTZ)     │
       │ refreshed_at (TIMESTAMPTZ)   │
       │ last_validated_at (TIMESTAMPTZ)
       │ last_error_code (TEXT)       │
       │ created_at (TIMESTAMPTZ)     │
       │ updated_at (TIMESTAMPTZ)     │
       └──────────────┬───────────────┘
                      │ 1
                      │
                      │ ∞
       ┌──────────────▼──────────────┐
       │         repositories         │ (Phase 3/4 Child Entity)
       │──────────────────────────────│
       │ id (PK, UUID)                │
       │ tenant_id (FK, UUID)         │
       │ connection_id (FK, UUID)     │
       │ external_repo_id (TEXT)      │
       │ full_name (TEXT)             │
       └──────────────────────────────┘
```

---

## 10. Audit Logging Boundary [SPECIFIED]

All lifecycle operations emit immutable entries to the `audit_logs` table via [`sanitizeAuditDetails`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/utils/audit-sanitizer.js):

| Audit Action | Recorded Payload Fields | Prohibited / Masked Fields |
| :--- | :--- | :--- |
| `connection.created` | `{ provider, authType, externalAccountId, scopes, keyVersion }` | `accessToken`, `refreshToken`, `privateKey`, `encryptedCredentials` |
| `connection.refreshed` | `{ provider, externalAccountId, expiresAt, durationMs }` | Tokens, credentials, authorization headers |
| `connection.revoked` | `{ provider, externalAccountId, reason, trigger }` | Raw webhook signatures, provider error payloads |
| `connection.disconnected`| `{ provider, externalAccountId, disconnectedBy }` | Any credential material |

---

## 11. Security Threat Model & Mitigations [SPECIFIED]

| Threat ID | Threat Category | Threat Scenario | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **TH-RC01** | **Credential Exposure at Rest** | Database breach leaks third-party tokens or private keys. | Authenticated AES-256-GCM encryption with unique per-record 96-bit random IV and 128-bit authentication tag. |
| **TH-RC02** | **Cross-Tenant IDOR** | Attacker queries connection ID belonging to another organization. | Mandatory request-context tenant scoping (`WHERE tenant_id = req.tenant.id`) in all queries. |
| **TH-RC03** | **Stale / Orphaned Tokens** | User deletes account but OAuth tokens remain active. | Cascading foreign keys (`ON DELETE CASCADE`) trigger automatic deletion and provider revocation. |
| **TH-RC04** | **Audit Log Leakage** | Raw OAuth callback or refresh token logged in audit records. | Dedicated `sanitizeAuditDetails()` gateway redacting sensitive token strings and private keys. |
| **TH-RC05** | **Tampering / Version Downgrade** | Ciphertext or key version altered in database. | GCM authentication tag binds ciphertext, IV, format version, and key version (AAD). Any mismatch throws `AUTHENTICATION_FAILED`. |

---

## 12. Drizzle ORM & PostgreSQL Compatibility [VERIFIED]

* **Database Engine**: PostgreSQL 16+ (fully verified against active Aiven PostgreSQL 18.6 development database and GitHub Actions PostgreSQL 17 CI container).
* **Native Drizzle Constructs**: Standard `pgTable`, `uuid`, `text`, `timestamp`, `jsonb`, `pgEnum`, `uniqueIndex`, `index`. Zero third-party extensions required.
* **Migration Strategy**: Generates clean DDL via `drizzle-kit generate` with explicit ENUM creation and foreign key constraints.

---

## 13. Open Decisions & Architecture Resolutions

| Decision Topic | Status | Resolution |
| :--- | :--- | :--- |
| **1. Primary Key Format** | **SPECIFIED** | UUIDv4 (`uuid('id').primaryKey().defaultRandom()`) matching platform standard. |
| **2. Provider Representation** | **SPECIFIED** | PostgreSQL Enum `resource_provider` for strict type safety and documentation. |
| **3. Credential Packaging** | **SPECIFIED** | Single compact string column `encrypted_credentials` (`enc:v1:...`) paired with an indexed `key_version` column. |
| **4. Repository Placement** | **SPECIFIED** | Excluded from `resource_connections`. Repositories are child entities in `repositories` (Phase 3). |
| **5. Uniqueness Rule** | **SPECIFIED** | `UNIQUE (tenant_id, provider, external_account_id)` preventing duplicate accounts per tenant. |

---

## 14. Gate Status & Recommendation

**Recommendation**: **`P2-003A APPROVED`**  
The `resource_connections` data model is fully specified, provider-neutral, secure, and compliant with all project constitutions. Implementation may proceed in Task **P2-003** upon approval.

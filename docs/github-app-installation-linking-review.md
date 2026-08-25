# GitHub App Installation Linking Architecture Review (Task P3-002A)

**Document Version**: `1.0.0`  
**Status**: `APPROVED / ARCHITECTURAL BASELINE`  
**Date**: `2026-08-21`  
**Phase**: `Phase 3 — Task P3-002A`  
**Governing Documents**: [`AGENTS.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/AGENTS.md), [`goal.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/goal.md), [`project.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/project.md), [`docs/github-app-auth-architecture-review.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/github-app-auth-architecture-review.md), [`docs/resource-connections-schema-review.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/resource-connections-schema-review.md), [`docs/resource-connector-architecture.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/resource-connector-architecture.md), [`docs/resource-connection-api-review.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/resource-connection-api-review.md), [`docs/decisions.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/decisions.md) (ADR-007, ADR-014, ADR-018, ADR-019, ADR-020, ADR-021), [`docs/security.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/security.md), [`docs/architecture.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/architecture.md).

---

## 1. Executive Summary & Purpose

In **Task P3-002**, Antigravity Career Hub implements the **GitHub App Installation & User-to-Server Linking Flow**. This allows an authenticated internal workspace user to install the GitHub App onto their personal GitHub account or organization and securely bind that installation to their active tenant workspace.

### Core Goals:
1. **Authenticated Linking**: Strictly bind the incoming GitHub installation callback to the authenticated internal user and tenant workspace.
2. **Cryptographic Anti-CSRF Transit State**: Prevent state injection, callback replay, and session fixation attacks via HMAC-SHA256 signed transit cookies.
3. **Server-Side Verification**: Never trust browser URL parameters (`installation_id`, `setup_action`). Verify installation status directly against `api.github.com/app/installations/:id` using App-level RS256 JWTs before persisting.
4. **Strict Cross-Tenant Isolation**: Guarantee that a GitHub installation can only belong to **one** tenant workspace across the platform. Cross-tenant installation hijacking is strictly blocked (409 Conflict).
5. **Idempotent Connection Persistence**: Create or update the `resource_connections` record cleanly without duplicate rows or orphan installations.

---

## 2. End-to-End Installation Flow & Sequence Diagram

```
User (Browser)          Fastify Backend               GitHub Platform            PostgreSQL
     │                         │                             │                       │
     │ 1. GET /integrations/   │                             │                       │
     │    github/install       │                             │                       │
     ├────────────────────────►│                             │                       │
     │                         │ 2. Generate signed state    │                       │
     │                         │    cookie (nonce + user/    │                       │
     │                         │    tenant binding)          │                       │
     │ 3. 302 Redirect to      │                             │                       │
     │    github.com/apps/...  │                             │                       │
     │◄────────────────────────┤                             │                       │
     │                         │                             │                       │
     │ 4. User authorizes app & selects repos                │                       │
     ├──────────────────────────────────────────────────────►│                       │
     │                         │                             │                       │
     │ 5. 302 Redirect to /integrations/github/install/callback                      │
     │    ?installation_id=123&state=abc                     │                       │
     ├────────────────────────►│                             │                       │
     │                         │ 6. Validate state cookie &  │                       │
     │                         │    session binding          │                       │
     │                         │ 7. Mint App JWT & verify    │                       │
     │                         │    GET /app/installations/123                       │
     │                         ├────────────────────────────►│                       │
     │                         │ 8. Return verified metadata │                       │
     │                         │◄────────────────────────────┤                       │
     │                         │                             │                       │
     │                         │ 9. Check cross-tenant collision                     │
     │                         ├────────────────────────────────────────────────────►│
     │                         │ 10. Upsert `resource_connections`                   │
     │                         ├────────────────────────────────────────────────────►│
     │ 11. 302 Redirect to     │                             │                       │
     │     /connections        │                             │                       │
     │◄────────────────────────┤                             │                       │
```

---

## 3. Authenticated User & Tenant Session Binding

### 3.1. Immutable Context Enforcement
The installation entrypoint (`GET /integrations/github/install`) and callback (`GET /integrations/github/install/callback`) require an active user session validated by `authMiddleware`:
* `req.auth.userId`
* `req.auth.tenantId`
* `req.auth.role`

### 3.2. Role Requirements
* **`OWNER`**: Permitted to initiate and complete GitHub App installation linking.
* **`MEMBER`**: Permitted to initiate and complete GitHub App installation linking.
* **`READONLY`**: **Denied with `403 Forbidden` (`FORBIDDEN_READONLY_ROLE`)**. Read-only workspace members cannot create or modify workspace integrations.

### 3.3. Anti-Spoofing Barrier
* Client query parameters (`?tenant_id=...`, `?user_id=...`) and HTTP headers (`X-Tenant-Id`) are strictly ignored.
* The trusted workspace ID is derived **exclusively** from the validated session record.

---

## 4. Cryptographic State & CSRF Protection (`__Host-gh_install_state`)

Because GitHub App installation flows involve cross-site redirects, the installation state token must be cryptographically protected against forgery, tampering, and replay.

### 4.1. Installation State Token Structure
```javascript
{
  "nonce": "7f8b9a2c-d4e5-4a1b-9c8e-3f2a1b0c9d8e", // 256-bit cryptographically random UUID
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "85e320ef-b0e5-4bc7-8565-576528c38ecd",
  "action": "github_app_install",
  "issuedAt": 1787300000,
  "expiresAt": 1787300600 // Exactly 10-minute TTL (600 seconds)
}
```

### 4.2. HMAC-SHA256 Signing & Transit Cookie
1. **Serialization**: `payload = base64url(JSON.stringify(stateObject))`
2. **Signature**: `signature = hmacSha256(payload, config.SESSION_COOKIE_SECRET)`
3. **State Token**: `stateToken = `${payload}.${signature}``
4. **Cookie Security**:
   * Name: `__Host-gh_install_state` (or `gh_install_state` in non-SSL dev)
   * Flags: `HttpOnly=true`, `Secure=true` (in prod), `SameSite=Lax`, `Path=/integrations/github`
   * Max-Age: `600` (10 minutes)

### 4.3. Callback State Verification Checklist
On callback arrival (`GET /integrations/github/install/callback?state=...&installation_id=...`):
1. **Query State Matches Cookie**: Verify `req.query.state === req.cookies.__Host-gh_install_state`.
2. **HMAC Signature Validation**: Verify signature using constant-time comparison (`crypto.timingSafeEqual`).
3. **Expiration Check**: Verify `Date.now() < state.expiresAt * 1000`.
4. **Session Cross-Check**: Verify `state.userId === req.auth.userId` and `state.tenantId === req.auth.tenantId`.
5. **Single-Use Invalidation**: Immediately clear the transit cookie with `Max-Age=0` to prevent replay.

---

## 5. Server-Side GitHub Installation Verification (via App JWT)

Never trust the `installation_id` from the browser URL alone. A malicious user could supply another user's public `installation_id` in their callback query.

### 5.1. Direct Verification Request
The backend verifies the installation directly via GitHub REST API using the P3-001 `GitHubAppAuthManager`:

* **HTTP Method**: `GET`
* **URL**: `https://api.github.com/app/installations/:installation_id`
* **Headers**:
  ```http
  Authorization: Bearer <APP_JWT>
  Accept: application/vnd.github+json
  X-GitHub-Api-Version: 2022-11-28
  User-Agent: Antigravity-Career-Hub/0.1.0
  ```

### 5.2. Verified GitHub Installation Payload
```json
{
  "id": 98765432,
  "account": {
    "id": 1234567,
    "login": "octocat",
    "type": "User",
    "avatar_url": "https://avatars.githubusercontent.com/u/1234567?v=4",
    "html_url": "https://github.com/octocat"
  },
  "repository_selection": "selected",
  "permissions": {
    "contents": "read",
    "metadata": "read"
  },
  "suspended_at": null,
  "single_file_name": null
}
```

### 5.3. Verification Checks
1. **Suspension Check**: Verify `suspended_at === null`. If suspended on GitHub, reject with `403 Forbidden` (`INSTALLATION_SUSPENDED`).
2. **Permissions Check**: Verify `permissions.contents === 'read'` and `permissions.metadata === 'read'`. If user customized or rejected required permissions, reject with `403 Forbidden` (`INSUFFICIENT_INSTALLATION_PERMISSIONS`).
3. **Target Identity**: Extract verified `account.id`, `account.login`, `account.type`, and `repository_selection`.

---

## 6. Tenant Linking Invariants & Cross-Tenant Collision Rejection

### Invariant 1: Multi-Tenant Exclusive Ownership
A single GitHub installation (`installation_id`) represents access to a specific GitHub account/organization's repositories. **An installation can only be attached to ONE tenant workspace at any time.**

### Invariant 2: Cross-Tenant Collision Rejection (409 Conflict)
Before creating a connection record, query the database:
```sql
SELECT id, tenant_id FROM resource_connections 
WHERE provider = 'GITHUB_APP' AND installation_id = :installation_id;
```
* If a record exists with `tenant_id === req.tenant.id`: **Permitted** (Idempotent update/reactivation).
* If a record exists with `tenant_id !== req.tenant.id`: **Strictly Rejected with `409 Conflict` (`INSTALLATION_ALREADY_LINKED`)**.
  * Prevents Tenant B from claiming Tenant A's connected GitHub organization repositories.
  * Audit event `github.installation_rejected` recorded with reason `cross_tenant_collision`.

---

## 7. `resource_connections` Mapping Specification

When a valid installation is verified and authorized, it is persisted to PostgreSQL via the Drizzle `resourceConnections` table schema established in P2-003:

| Column | Value / Mapping | Description |
| :--- | :--- | :--- |
| `id` | `crypto.randomUUID()` | Unique UUID v4 primary key. |
| `tenant_id` | `req.tenant.id` | Authenticated tenant workspace ID. |
| `user_id` | `req.user.id` | Authenticated user who authorized the installation. |
| `provider` | `'GITHUB_APP'` | Provider enum value. |
| `auth_type` | `'APP_INSTALLATION'` | Auth type enum value. |
| `display_name` | `GitHub (${account.login})` | Human-readable connection label. |
| `external_account_id` | `String(account.id)` | Numeric GitHub user or org ID. |
| `external_account_name`| `account.login` | GitHub username or organization slug. |
| `installation_id` | `String(installation.id)` | Numeric GitHub App installation ID. |
| `encrypted_credentials`| AES-256-GCM Compact Ciphertext | Dummy/marker payload `{ installationId, linkedAt }` (see Section 8). |
| `key_version` | `'v1'` | Current encryption key version. |
| `scopes` | `['contents:read', 'metadata:read']` | Verified granted scopes as JSONB array. |
| `status` | `'ACTIVE'` | Initial operational status. |
| `metadata` | JSONB Object | Safe operational metadata (avatar URL, repository selection, target type). |
| `last_validated_at` | `new Date()` | Timestamp of successful verification. |
| `last_error_code` | `null` | Cleared on successful linking. |
| `last_error_at` | `null` | Cleared on successful linking. |
| `created_at` | `new Date()` | Creation timestamp. |
| `updated_at` | `new Date()` | Last update timestamp. |

---

## 8. Application Master Key vs. Installation Credentials Boundary

To maintain absolute cryptographic safety and prevent master secret compromise:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Application-Level Master Secret (Host Environment)                       │
│    - Variable: `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_PRIVATE_KEY_BASE64`   │
│    - Storage: Server Environment Variables / Secrets Manager ONLY           │
│    - Scope: Global to Antigravity Career Hub application host               │
│    - Database Persistence: NEVER STORED IN DATABASE                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ Signs RS256 App JWTs
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. Ephemeral Installation Access Tokens (In-Memory Only)                    │
│    - Token: `ghs_*` (60-minute lifetime)                                    │
│    - Storage: In-Memory Partitioned `GitHubTokenCache` (P3-001)             │
│    - Database Persistence: NEVER STORED IN DATABASE                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ Minted on demand using App JWT + ID
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. Tenant Resource Connection (PostgreSQL `resource_connections`)           │
│    - Identifier: `installation_id` (e.g. "98765432")                        │
│    - Metadata: `account.login`, `repository_selection`, `scopes`            │
│    - `encrypted_credentials`: AES-256-GCM encrypted metadata payload        │
└─────────────────────────────────────────────────────────────────────────────┘
```

Because GitHub App tokens are minted dynamically using the App Private Key + `installation_id`, the `encrypted_credentials` column does not need to store permanent bearer tokens. It stores an AES-256-GCM encrypted payload containing installation metadata (`{ installationId, targetType, linkedAt }`) satisfying the schema requirement while eliminating stored long-lived credential risks.

---

## 9. Repository Scope & Selection Representation

GitHub App installations operate in one of two modes:
1. **`all`**: App has access to all current and future repositories in the account/org.
2. **`selected`**: App has access only to explicit repositories selected by the user in GitHub.

### Storage Representation
* **At Connection Level (`resource_connections.metadata`)**:
  ```json
  {
    "repositorySelection": "selected",
    "targetType": "User",
    "accountAvatarUrl": "https://avatars.githubusercontent.com/u/1234567?v=4",
    "accountHtmlUrl": "https://github.com/octocat"
  }
  ```
* **At Repository Level (Phase 3 P3-004/P3-005)**:
  * Repositories will be cataloged in a dedicated `repositories` table with `connection_id` and `tenant_id` foreign keys.
  * No repository rows are created during initial connection setup in P3-002.

---

## 10. Minimum Required GitHub App Permissions

For read-only repository scanning and evidence extraction:

| Permission Category | Minimum Level | Purpose |
| :--- | :--- | :--- |
| **`contents`** | `read` | Reading directory file trees, `package.json`, `go.mod`, `Cargo.toml`, and source files. |
| **`metadata`** | `read` | Listing repository names, primary language, description, and star counts. |
| **`pull_requests`** | `none` (Default) | Reserved for Phase 9 automated candidate modification workflows. |
| **`issues`** | `none` | Not required. |
| **`administration`**| `none` | Not required. |

---

## 11. Idempotency & Re-Installation Lifecycle Rules

| Scenario | State in Database | GitHub State | Action Taken |
| :--- | :--- | :--- | :--- |
| **First-time Install** | No record | Valid installation | Insert new `resource_connections` row with status `ACTIVE`. |
| **Re-run Setup / Update** | `ACTIVE` (same tenant) | Valid installation | Update `display_name`, `metadata`, and `last_validated_at`. Return `200 OK`. |
| **Reactivate Disconnected** | `DISCONNECTED` (same tenant) | Valid installation | Update status to `ACTIVE`, update `encrypted_credentials` and `metadata`. |
| **Cross-Tenant Install** | Exists in different tenant | Valid installation | **Reject with 409 Conflict (`INSTALLATION_ALREADY_LINKED`)**. |
| **Uninstalled on GitHub** | `ACTIVE` in DB | 404 from GitHub | Update status to `REVOKED`, set `last_error_code = 'INSTALLATION_NOT_FOUND'`. |

---

## 12. Disconnect, Upstream Revocation & Suspension Handling

### 12.1. User Initiated Disconnect (`POST /connections/:id/disconnect`)
1. Call `githubAppAuthManager.revokeInstallationToken(tenantId, installationId, token)`.
2. Evict token from in-memory `GitHubTokenCache`.
3. Overwrite `encrypted_credentials` with scrubbed dummy payload.
4. Set status to `DISCONNECTED`.

### 12.2. Webhook / GitHub Event Revocation (`installation.deleted`)
* Webhook handler (P3-003) finds `resource_connections` by `installation_id` and transitions status to `REVOKED`.

---

## 13. Audit Logging & Structured Events

All lifecycle transitions emit structured audit logs via `writeAuditRecord`:

| Event Action | Metadata Stored | Forbidden Data (Zero Leakage) |
| :--- | :--- | :--- |
| `github.installation_started` | `{ tenantId, userId, action }` | `stateToken`, session tokens |
| `github.installation_linked` | `{ tenantId, userId, connectionId, installationId, accountLogin, repositorySelection }` | App private key, `ghs_*` tokens |
| `github.installation_rejected`| `{ tenantId, userId, installationId, reason, statusCode }` | Private keys, raw response headers |
| `github.installation_disconnected` | `{ tenantId, userId, connectionId, installationId }` | Plaintext credentials |

---

## 14. Comprehensive Error Taxonomy & HTTP Status Mapping

| Condition | Domain Error Class | HTTP Status | Error Code |
| :--- | :--- | :--- | :--- |
| Missing or unauthenticated session | `AuthenticationError` | 401 | `AUTHENTICATION_REQUIRED` |
| Readonly user attempting to link | `AuthorizationError` | 403 | `FORBIDDEN_READONLY_ROLE` |
| State token signature invalid or tampered | `AuthenticationError` | 401 | `INVALID_OAUTH_STATE` |
| State token expired (>10 minutes) | `AuthenticationError` | 401 | `STATE_EXPIRED` |
| State user/tenant mismatch | `AuthenticationError` | 401 | `STATE_TENANT_MISMATCH` |
| Installation not found on GitHub | `GitHubInstallationNotFoundError` | 404 | `INSTALLATION_NOT_FOUND` |
| Installation suspended on GitHub | `AuthorizationError` | 403 | `INSTALLATION_SUSPENDED` |
| Installation already linked to another tenant | `ConflictError` | 409 | `INSTALLATION_ALREADY_LINKED` |
| Insufficient GitHub permissions granted | `AuthorizationError` | 403 | `INSUFFICIENT_PERMISSIONS` |
| GitHub API down or timeout | `ProviderUnavailableError` | 503 | `PROVIDER_UNAVAILABLE` |

---

## 15. Security Threat Model & Mitigations

| Threat ID | Threat Scenario | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **TH-LNK-01** | **CSRF State Injection**: Attacker tricks victim into visiting callback with attacker's `installation_id`. | Victim's tenant links attacker's GitHub account. | State token contains HMAC signature binding `userId` and `tenantId` checked against victim's active session. |
| **TH-LNK-02** | **Cross-Tenant Installation Hijacking**: Tenant B tries to claim Tenant A's GitHub installation ID. | Unauthorized access / collision. | Database uniqueness guard on `installation_id`. Returns `409 Conflict` if existing connection belongs to another tenant. |
| **TH-LNK-03** | **Callback Parameter Manipulation**: Attacker alters `installation_id` in URL query. | False connection creation. | Server verifies installation directly against `api.github.com/app/installations/:id` via App RS256 JWT. |
| **TH-LNK-04** | **Replay Attacks**: Attacker re-submits previously valid callback URL. | Duplicate operations. | Single-use transit cookie is cleared immediately on first arrival (`Max-Age=0`). |
| **TH-LNK-05** | **Privilege Escalation**: Read-only tenant member links GitHub organization. | Unauthorized tenant modification. | `authMiddleware` checks role; `READONLY` members receive `403 Forbidden`. |

---

## 16. Architecture & Service Boundary Implementation Plan

For Task P3-002, the implementation will create/update:

```
src/
├── routes/
│   ├── integrations.routes.js         # GET /integrations/github/install & GET /integrations/github/install/callback
│   └── integrations.schemas.js        # Zod request/response validation schemas
├── services/
│   └── github-installation.service.js # State generation, callback validation, GitHub verification, linking
└── db/repositories/
    └── connection.repository.js       # findConnectionByInstallationId, upsertConnectionRecord
```

---

## 17. Open Design Decisions & Final Architectural Recommendation

* **Decision 1**: Should we create a new `integrations.routes.js` or add to `connections.routes.js`?
  * **Recommendation**: Create `src/routes/integrations.routes.js` rooted under `/integrations/github`. This cleanly separates third-party OAuth/installation setup entrypoints from standard CRUD `/connections` lifecycle endpoints.
* **Decision 2**: What redirect URL should be used after successful linking?
  * **Recommendation**: Redirect to `/dashboard?connection=linked` (or `/connections?status=success`), with clear query indicators for UI toast notifications.

---

## 18. Architectural Review Conclusion

**P3-002A Status**: **`COMPLETE & APPROVED`**  
All architectural decisions, cryptographic state structures, tenant isolation invariants, error taxonomy, and threat mitigations are fully resolved and ready for implementation in Task P3-002.

# Resource Connection Lifecycle API Architecture Review (Task P2-005A)

**Document Version**: `1.0.0`  
**Status**: `APPROVED / ARCHITECTURAL BASELINE`  
**Date**: `2026-08-21`  
**Phase**: `Phase 2 — Task P2-005A`  
**Governing Documents**: [`AGENTS.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/AGENTS.md), [`goal.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/goal.md), [`project.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/project.md), [`docs/resource-connections-schema-review.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/resource-connections-schema-review.md), [`docs/resource-connector-architecture.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/resource-connector-architecture.md), [`docs/decisions.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/decisions.md) (ADR-016 through ADR-020), [`docs/security.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/security.md).

---

## 1. Endpoint Specifications & Summary Table

The Resource Connection Lifecycle API provides authenticated users and administrators with safe, multi-tenant HTTP interfaces to list, inspect, health-check, disconnect, and permanently delete third-party resource connections.

| Method | Path | Summary | Role Requirement | Mutates State? |
| :--- | :--- | :--- | :--- | :---: |
| `GET` | `/connections` | List active & inactive connections within the tenant workspace | `OWNER`, `MEMBER`, `READONLY` | No |
| `GET` | `/connections/:id` | Get detailed connection metadata (strictly zero credentials) | `OWNER`, `MEMBER`, `READONLY` | No |
| `POST` | `/connections/:id/test` | Validate upstream authorization health against external provider | `OWNER`, Connection Creator | Yes (`lastValidatedAt`, `status`) |
| `POST` | `/connections/:id/disconnect` | Deactivate connection, scrub encrypted credentials, best-effort revoke | `OWNER`, Connection Creator | Yes (`status`, `encryptedCredentials`) |
| `DELETE` | `/connections/:id` | Permanently delete connection record (cascades to repositories) | `OWNER`, Connection Creator | Yes (Hard Delete) |

### Endpoint Naming & REST Conventions
* All endpoints are rooted under `/connections`.
* `POST /connections/:id/test` is an operational RPC-style action triggering upstream health verification.
* `POST /connections/:id/disconnect` is an explicit state transition deactivating the connection and scrubbing ciphertext before potential permanent deletion.
* `DELETE /connections/:id` performs irreversible row deletion.

---

## 2. Route, Service, Repository & Connector Architecture

To maintain strict separation of concerns, the execution pipeline follows a unidirectional 5-tier architecture:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. ROUTE LAYER (`src/routes/connections.routes.js`)                     │
│    - Fastify schema validation (Zod preValidation / preSerialization)   │
│    - Session authentication (`requireAuth` hook)                        │
│    - Request correlation binding (`req.id`, `req.tenant.id`, `req.user`)│
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Validated Request Context
┌────────────────────────────────────▼────────────────────────────────────┐
│ 2. SERVICE LAYER (`src/services/connection.service.js`)                 │
│    - Role & ownership authorization (`canManageConnection`)             │
│    - Business orchestration & state machine validation                  │
│    - Transient credential decryption via `src/security/encryption.js`   │
│    - Audit logging via `src/utils/audit-sanitizer.js`                   │
└───────────────────┬─────────────────────────────────┬───────────────────┘
                    │ DB Operations                   │ External I/O
┌───────────────────▼───────────────┐ ┌───────────────▼─────────────────┐
│ 3. REPOSITORY LAYER               │ │ 4. CONNECTOR REGISTRY (P2-004)  │
│    (`src/db/repositories/`)       │ │    - Provider resolution        │
│    - Strict Tenant Filtering      │ │    - Capability assertion       │
│    - Drizzle ORM queries          │ └───────────────┬─────────────────┘
└───────────────────────────────────┘                 │
                                      ┌───────────────▼─────────────────┐
                                      │ 5. PROVIDER CONNECTOR           │
                                      │    - Upstream REST / API Client │
                                      │    - Normalized Error Mapping   │
                                      └─────────────────────────────────┘
```

### Architectural Prohibitions
* **Routes MUST NOT**: Query PostgreSQL tables directly, decrypt secrets, call external provider APIs, or parse vendor-specific JSON payloads.
* **Connectors MUST NOT**: Access database pools, manage transactions, or read HTTP sessions.
* **Repositories MUST NOT**: Execute queries without `WHERE tenant_id = req.tenant.id`.

---

## 3. Mandatory Tenant Isolation Query Pattern

All database interactions MUST enforce multi-tenant boundaries at the SQL query level:

```javascript
// MANDATORY REPOSITORY QUERY PATTERN:
export async function findTenantConnectionById(tenantId, connectionId) {
  const [connection] = await db
    .select()
    .from(resourceConnections)
    .where(
      and(
        eq(resourceConnections.id, connectionId),
        eq(resourceConnections.tenantId, tenantId)
      )
    );

  if (!connection) {
    // Return 404 to prevent enumeration/IDOR across tenant boundaries
    throw new ConnectionNotFoundError(connectionId, tenantId);
  }

  return connection;
}
```

### IDOR & Enumeration Defense:
* If User from Tenant A requests `GET /connections/<Tenant-B-Connection-UUID>`, the query returns 0 rows, triggering `404 Not Found`.
* The API **never** returns `403 Forbidden` for cross-tenant ID queries, preventing attackers from probing for the existence of connection UUIDs in other organizations.

---

## 4. User Ownership & Authorization Matrix

Within an authenticated tenant workspace, users have distinct permissions based on their workspace role (`OWNER`, `MEMBER`, `READONLY`) and whether they are the **Connection Creator** (`connection.userId === req.user.id`).

| Operation | `READONLY` Member | `MEMBER` (Not Creator) | `MEMBER` (Is Creator) | `OWNER` (Admin) | Authorization Check |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`GET /connections`** | ✅ View all | ✅ View all | ✅ View all | ✅ View all | Tenant membership |
| **`GET /connections/:id`** | ✅ View detail | ✅ View detail | ✅ View detail | ✅ View detail | Tenant membership |
| **`POST /connections/:id/test`** | ❌ 403 | ❌ 403 | ✅ Permitted | ✅ Permitted | `isCreator \|\| isTenantOwner` |
| **`POST /connections/:id/disconnect`**| ❌ 403 | ❌ 403 | ✅ Permitted | ✅ Permitted | `isCreator \|\| isTenantOwner` |
| **`DELETE /connections/:id`** | ❌ 403 | ❌ 403 | ✅ Permitted | ✅ Permitted | `isCreator \|\| isTenantOwner` |

### Guard Helper Rule (`assertConnectionAccess`):
```javascript
export function assertCanMutateConnection(user, connection) {
  const isCreator = connection.userId === user.id;
  const isOwner = user.role === 'OWNER';

  if (!isCreator && !isOwner) {
    throw new AuthorizationError(
      'You do not have permission to modify this resource connection. Only the connection creator or a workspace owner may perform this action.'
    );
  }
}
```

---

## 5. Safe Response Models (Zod Schemas)

Under **no circumstances** may `encrypted_credentials`, `key_version`, access tokens, refresh tokens, private keys, or raw vendor payloads be serialized in HTTP responses.

```javascript
import { z } from 'zod';

/**
 * Summary representation for connection lists.
 */
export const ConnectionSummarySchema = z.object({
  id: z.string().uuid(),
  provider: z.enum(['GITHUB_APP', 'GITLAB', 'GOOGLE_DRIVE', 'ONEDRIVE', 'NOTION', 'CUSTOM_API']),
  authType: z.enum(['APP_INSTALLATION', 'OAUTH2_CODE', 'API_KEY', 'SERVICE_ACCOUNT']),
  displayName: z.string(),
  externalAccountId: z.string(),
  externalAccountName: z.string().nullable(),
  status: z.enum(['PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR', 'DISCONNECTED']),
  scopes: z.array(z.string()),
  expiresAt: z.string().datetime().nullable(),
  lastValidatedAt: z.string().datetime().nullable(),
  lastErrorCode: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Detailed representation including creator metadata and safe metadata.
 */
export const ConnectionDetailSchema = ConnectionSummarySchema.extend({
  userId: z.string().uuid(),
  creator: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    email: z.string().email(),
  }).optional(),
  metadata: z.record(z.unknown()),
  lastErrorAt: z.string().datetime().nullable(),
  refreshedAt: z.string().datetime().nullable(),
});

/**
 * Paginated connection list response.
 */
export const ConnectionListResponseSchema = z.object({
  items: z.array(ConnectionSummarySchema),
  pagination: z.object({
    cursor: z.string().nullable(),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
    limit: z.number().int(),
    totalCount: z.number().int().optional(),
  }),
});

/**
 * Health check test result envelope.
 */
export const ConnectionTestResultSchema = z.object({
  connectionId: z.string().uuid(),
  provider: z.string(),
  healthy: z.boolean(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR', 'DISCONNECTED']),
  message: z.string(),
  validatedAt: z.string().datetime(),
  errorCode: z.string().nullable().optional(),
});

/**
 * Disconnect and Delete mutation result.
 */
export const ConnectionMutationResultSchema = z.object({
  connectionId: z.string().uuid(),
  provider: z.string(),
  status: z.string(),
  message: z.string(),
  updatedAt: z.string().datetime(),
});
```

---

## 6. Connection List & Detail Endpoints

### 6.1 `GET /connections`
* **Query Parameters**:
  * `provider` (optional enum filter)
  * `status` (optional enum filter)
  * `cursor` (opaque pagination token)
  * `limit` (positive integer, default: 50, maximum: 100)
* **Behavior**: Returns connections within `req.tenant.id` matching filters.
* **Ordering**: `created_at DESC`.

### 6.2 `GET /connections/:id`
* **URL Parameters**: `id` (UUIDv4)
* **Behavior**: Returns `ConnectionDetailSchema` if connection exists in tenant. Returns 404 otherwise.

---

## 7. Health Test Endpoint (`POST /connections/:id/test`)

### Execution Flow:
```
1. Authenticate session & enforce tenant membership.
2. Load connection: SELECT * FROM resource_connections WHERE id = :id AND tenant_id = :tenantId.
3. Authorize mutation: verify req.user is Creator OR Owner.
4. Check lifecycle: if status is DISCONNECTED, reject with 409 Conflict.
5. Decrypt credentials: decryptSecret(record.encryptedCredentials).
6. Resolve connector: connectorRegistry.get(record.provider).
7. Execute validation probe: await connector.validate(context, credentials).
8. Mutate connection record in PostgreSQL:
   - On success: status = 'ACTIVE', lastValidatedAt = NOW(), lastErrorCode = NULL, lastErrorAt = NULL.
   - On failure: status = 'ERROR' (or 'REVOKED' if 401), lastValidatedAt = NOW(), lastErrorCode = err.code, lastErrorAt = NOW().
9. Record audit event ('connection.tested').
10. Return ConnectionTestResultSchema.
```

---

## 8. Disconnect, Revoke & Delete Semantics

```
                     ┌───────────────────────────┐
                     │          ACTIVE           │
                     └─────────────┬─────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼ POST /disconnect                        ▼ Provider 401 / Webhook
   ┌───────────────────────┐                 ┌───────────────────────┐
   │     DISCONNECTED      │                 │        REVOKED        │
   │ - Ciphertext scrubbed │                 │ - Ciphertext retained │
   │ - Status DISCONNECTED │                 │ - Status REVOKED      │
   └──────────┬────────────┘                 └──────────┬────────────┘
              │                                         │
              └────────────────────┬────────────────────┘
                                   ▼ DELETE /connections/:id
                     ┌───────────────────────────┐
                     │       HARD DELETED        │
                     │ - Row purged from DB      │
                     │ - Cascades to child repos │
                     └───────────────────────────┘
```

### 8.1 Disconnect (`POST /connections/:id/disconnect`)
1. **Best-Effort Upstream Revocation**: If the connector advertises `CONNECTOR_CAPABILITIES.REVOKE_ACCESS`, attempt upstream revocation. If upstream API call fails or times out, proceed anyway.
2. **Immediate Local Cryptographic Scrubbing**: Overwrite `encrypted_credentials` with dummy scrubbed ciphertext (`encryptSecret('{"disconnected":true}')`), preventing any further usage of previous access tokens.
3. **Status Update**: Set `status = 'DISCONNECTED'`.
4. **Idempotency**: If connection is already `DISCONNECTED`, return 200 with no-op.

### 8.2 Hard Delete (`DELETE /connections/:id`)
1. Permanently delete row: `DELETE FROM resource_connections WHERE id = :id AND tenant_id = :tenantId`.
2. PostgreSQL foreign key cascade (`ON DELETE CASCADE`) automatically purges child `repositories` and associated evidence items.
3. Returns `200 OK` with `ConnectionMutationResultSchema`.

---

## 9. Error Mapping Taxonomy

All service and connector errors map to standard HTTP responses:

| Internal / Connector Error | HTTP Status | Response Code | Safe Client Message |
| :--- | :---: | :--- | :--- |
| `ConnectionNotFoundError` | 404 | `CONNECTION_NOT_FOUND` | "Resource connection not found in workspace" |
| `ConnectionInactiveError` | 409 | `CONNECTION_INACTIVE` | "Resource connection is inactive or disconnected" |
| `AuthorizationError` (Non-creator member) | 403 | `AUTHORIZATION_ERROR` | "You do not have permission to modify this connection" |
| `ConnectorAuthError` | 401 | `CONNECTOR_AUTH_FAILED` | "Third-party authorization failed or has been revoked" |
| `InsufficientScopeError` | 403 | `INSUFFICIENT_SCOPE` | "Connection lacks required permissions for this action" |
| `ProviderRateLimitError` | 429 | `PROVIDER_RATE_LIMITED` | "External provider rate limit exceeded. Please retry later." |
| `ProviderUnavailableError` | 503 | `PROVIDER_UNAVAILABLE` | "External provider service is temporarily unavailable" |
| `ValidationError` (Bad UUID, limit > 100) | 400 | `VALIDATION_ERROR` | Structured field validation errors |

---

## 10. Audit Logging & Compliance Boundary

Lifecycle events emit structured audit records via [`sanitizeAuditDetails`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/utils/audit-sanitizer.js):

| Event Type | Action Trigger | Recorded Audit Metadata |
| :--- | :--- | :--- |
| `connection.listed` | `GET /connections` | Filter parameters, returned item count (Debug/Low-noise) |
| `connection.viewed` | `GET /connections/:id` | `connectionId`, `provider` |
| `connection.tested` | `POST /connections/:id/test` | `connectionId`, `provider`, `healthy`, `durationMs`, `errorCode` |
| `connection.disconnected` | `POST /connections/:id/disconnect` | `connectionId`, `provider`, `externalAccountId`, `upstreamRevoked` |
| `connection.deleted` | `DELETE /connections/:id` | `connectionId`, `provider`, `externalAccountId` |

---

## 11. CSRF & Browser Security Requirements

Because these endpoints are accessed via cookie-authenticated browser sessions:
1. **Cookie Attributes**: Session cookie uses `SameSite=Lax`, `HttpOnly`, and `Secure` (with `__Host-` prefix in production).
2. **Safe State-Changing HTTP Verbs**: All state-modifying actions strictly use `POST` and `DELETE` (never `GET`).
3. **Content-Type Enforcement**: Requests require `application/json` or empty bodies, preventing simple HTML form POST submission attacks from third-party origins.

---

## 12. Rate Limiting & Concurrency Safety

### 12.1 Abuse Prevention
* `POST /connections/:id/test` triggers external network calls to third parties. It should be bounded to a reasonable rate limit per user/connection (e.g. 10 requests per minute) in Phase 14 to prevent upstream rate-limit exhaustion.

### 12.2 Concurrency & Race Conditions
* **Simultaneous Disconnect Requests**: Handled idempotently. The first request scrubs credentials and sets `DISCONNECTED`; the second finds `status === 'DISCONNECTED'` and returns successfully.
* **Test vs Disconnect Race**: If disconnect succeeds during test execution, the update checks status before overwriting.

---

## 13. Open Decisions & Resolutions

1. **Can `READONLY` members view connections?**
   * *Resolution*: **Yes.** Read-only workspace members need to see connected sources to review adapted resumes and evidence, but cannot test, disconnect, or delete connections.
2. **Can standard `MEMBER` users disconnect connections created by other members?**
   * *Resolution*: **No.** Only the **Connection Creator** or a workspace **`OWNER`** can test, disconnect, or delete a connection.
3. **Does `DELETE /connections/:id` require prior disconnect?**
   * *Resolution*: **No.** Direct deletion is permitted; it immediately hard-deletes the row and cascades to child resources.

---

## 14. Architectural Recommendation & Approval Gate

### Final Recommendation: **`P2-005A APPROVED`**

The proposed Resource Connection Lifecycle API:
1. Provides clean, RESTful endpoints (`/connections`) with strict schema validation.
2. Enforces multi-tenant isolation and user-creator ownership rules.
3. Ensures zero credential leakage across all response schemas.
4. Separates routes, business services, repositories, and provider connectors.
5. Accurately coordinates lifecycle transitions (Disconnect, Revoke, Delete).

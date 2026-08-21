# Architecture Specification: GitHub Read Connector (`GitHubAppConnector`)

**Document ID**: `ARCH-P3-004A`  
**Task Reference**: `P3-004A`  
**Status**: APPROVED  
**Target Implementation**: `P3-004` (`src/connectors/github/github-connector.js`)  
**Parent Framework**: `BaseResourceConnector` ([`src/connectors/base/resource-connector.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/connectors/base/resource-connector.js))  
**Authentication Infrastructure**: `GitHubAppAuthManager` ([`src/connectors/github/auth.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/connectors/github/auth.js))  

---

## 1. Objective & Architectural Scope

The objective of Task **P3-004A** is to define the architectural boundary, API interaction contracts, normalization pipelines, pagination mechanisms, error mappings, rate-limit policies, and security invariants for `GitHubAppConnector`—the platform's first production resource connector implementation.

`GitHubAppConnector` implements the provider-neutral [`BaseResourceConnector`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/connectors/base/resource-connector.js) abstraction to provide secure, read-only access to GitHub repositories and account metadata for linked workspace installations without leaking GitHub-specific API structures, headers, or internal formats into the core career platform.

### Core Read Operations (P3-004 Scope):
1. **`getAccount(context, credentials)`**: Retrieves normalized installation account metadata (`NormalizedAccount`).
2. **`listResources(context, credentials, options)`**: Lists accessible repositories with opaque cursor pagination (`PaginatedResult<NormalizedResource>`).
3. **`getResource(context, credentials, externalResourceId)`**: Fetches detailed metadata for a single repository (`NormalizedResource`).
4. **`validate(context, credentials)`**: Probes connection health and token viability against GitHub REST API.
5. **`revokeAccess(context, credentials)`**: Evicts cached tokens and executes best-effort upstream token revocation.

### Strict Architectural Boundaries:
* **No Deep Code / AST Parsing (Phase 4)**: AST parsing, manifest inspection (`package.json`, `Cargo.toml`), and candidate indexing are deferred to Phase 4.
* **No Deep Tree / Commit Traversal (P3-005)**: Multi-file tree crawling and commit log extraction are scoped to Task P3-005.
* **No Database Migrations**: Uses existing `resource_connections` schema and AES-256-GCM encrypted metadata payload from Phase 2/3.
* **Statelessness**: The connector instance holds zero mutable tenant state, zero user tokens, zero App JWTs, and zero private keys in memory.

---

## 2. End-to-End Execution Flow

```
                      Authenticated HTTP / MCP Client Request
                                         │
                   [auth.middleware] & Tenant Authorization
              (Validates session, frozen req.auth, tenant isolation)
                                         │
                   Query resource_connections from PostgreSQL
                  (Ensures tenant_id match & status === 'ACTIVE')
                                         │
                    createTrustedConnectorContext(connection)
           (Mints immutable context: tenantId, userId, connectionId)
                                         │
              Decrypt credentials (AES-256-GCM master key payload)
               (Yields installationId, targetType, linkedByUserId)
                                         │
            GitHubAppAuthManager.getInstallationToken({ tenantId, installationId })
            ┌────────────────────────────┴────────────────────────────┐
            ▼                                                         ▼
       Cache Hit (In-Memory)                                     Cache Miss
   (Returns cached ghs_* token)                             (Signs RS256 App JWT)
            │                                                         │
            │                                             POST /app/installations/:id/access_tokens
            │                                             (Coalesced single-flight request)
            │                                                         │
            └────────────────────────────┬────────────────────────────┘
                                         ▼
                     GitHubAppConnector Operation Invocation
                    (Uses native fetch + short-lived ghs_* token)
                                         │
                              GitHub REST API v2022-11-28
                                         │
                       Raw GitHub JSON Response / Headers
                                         │
                     Response Normalization & Sanitization
              (Maps to NormalizedAccount / NormalizedResource)
                                         │
                           Application Service / Route
                                         │
                    Sanitized JSON Response (Zero Leakage)
```

---

## 3. GitHubAppConnector Class Definition

`GitHubAppConnector` inherits from `BaseResourceConnector` and registers under provider identifier `'GITHUB_APP'`.

```javascript
/**
 * @file GitHub App Resource Connector Implementation
 * @extends BaseResourceConnector
 */
export class GitHubAppConnector extends BaseResourceConnector {
  /**
   * @param {object} options
   * @param {GitHubAppAuthManager} options.authManager - Injected App authentication manager
   * @param {typeof fetch} [options.fetchFn=globalThis.fetch] - HTTP client
   * @param {string} [options.baseUrl='https://api.github.com'] - GitHub REST API base URL
   * @param {number} [options.timeoutMs=10000] - Default operation timeout (10s)
   */
  constructor({
    authManager,
    fetchFn = globalThis.fetch,
    baseUrl = 'https://api.github.com',
    timeoutMs = 10000,
  }) {
    super('GITHUB_APP');
    if (!authManager) {
      throw new ValidationError('authManager is mandatory for GitHubAppConnector');
    }
    this.authManager = authManager;
    this.fetch = fetchFn;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  /**
   * Declares the supported connector capabilities.
   * @returns {ReadonlySet<string>}
   */
  getCapabilities() {
    return new Set([
      CONNECTOR_CAPABILITIES.READ_ACCOUNT,
      CONNECTOR_CAPABILITIES.LIST_RESOURCES,
      CONNECTOR_CAPABILITIES.READ_RESOURCE,
      CONNECTOR_CAPABILITIES.REVOKE_ACCESS,
    ]);
  }
}
```

### Connector Invariants:
1. **Stateless Instance**: Instances do not store tokens or tenant data in `this`. Every method requires `context` (`ConnectorContext`) and decrypted `credentials`.
2. **Strict Capability Guarding**: Inherited `this.assertCapability(...)` validates requested operations before execution.
3. **Transient Credential Handling**: Installation tokens (`ghs_*`) are retrieved on-demand from `this.authManager` and discarded immediately after request execution.

---

## 4. Operation Specifications & API Mappings

### 4.1. `getAccount(context, credentials)`

Retrieves normalized profile and account metadata for the linked installation.

* **Upstream GitHub Endpoint**: `GET /installation/repositories` (with `per_page=1`) using installation token, or `GET /app/installations/:installation_id` using App JWT.
* **Target Account Concept**: The account represents the **Installation Owner** (GitHub User or Organization owning the repositories), distinct from the specific workspace user who linked the integration.

#### Upstream Response Mapping to `NormalizedAccount`:

| Upstream GitHub Field | `NormalizedAccount` Field | Type / Transformation |
| :--- | :--- | :--- |
| `account.id` | `id` | `String(id)` (e.g. `"97516061"`) |
| `account.login` | `name` | `String(login)` (e.g. `"vishu1803"`) |
| `account.login` | `displayName` | `String(login)` |
| `account.avatar_url` | `avatarUrl` | `String(avatar_url)` |
| — | `provider` | Strictly `'GITHUB_APP'` |
| `account.type` | `accountType` | `type === 'Organization' ? 'ORGANIZATION' : 'USER'` |
| `repository_selection`, `html_url`, `target_type` | `metadata` | `{ repositorySelection: "all", htmlUrl: "https://github.com/vishu1803", targetType: "User" }` |

```javascript
// Output Structure (NormalizedAccount)
{
  id: "97516061",
  name: "vishu1803",
  displayName: "vishu1803",
  avatarUrl: "https://avatars.githubusercontent.com/u/97516061?v=4",
  provider: "GITHUB_APP",
  accountType: "USER",
  metadata: {
    repositorySelection: "all",
    targetType: "User",
    htmlUrl: "https://github.com/vishu1803"
  }
}
```

---

### 4.2. `listResources(context, credentials, options)`

Lists all repositories accessible to the GitHub App installation.

* **Upstream GitHub Endpoint**: `GET /installation/repositories`
* **Query Parameters**:
  * `per_page`: Derived from `options.limit` (default: 50, maximum: 100).
  * `page`: Derived from decoded opaque `options.cursor` (default: 1).
* **Authorization Scope Handling**: GitHub automatically returns only the repositories authorized during app installation (whether `repository_selection === 'all'` or `repository_selection === 'selected'`).

#### Upstream Repository Item Mapping to `NormalizedResource`:

| Upstream GitHub Field | `NormalizedResource` Field | Type / Transformation |
| :--- | :--- | :--- |
| `repo.id` | `id` | `String(id)` (Canonical Numeric ID, e.g. `"1043905096"`) |
| `repo.name` | `name` | `String(name)` (e.g. `"Ai-job-mcp"`) |
| `repo.full_name` | `fullName` | `String(full_name)` (e.g. `"vishu1803/Ai-job-mcp"`) |
| — | `type` | Strictly `'REPOSITORY'` |
| `repo.html_url` | `url` | `String(html_url)` |
| `repo.default_branch` | `defaultBranch` | `repo.default_branch || 'main'` |
| `repo.private` | `isPrivate` | `Boolean(repo.private)` |
| `repo.language` | `languages` | `repo.language ? [repo.language] : []` |
| `repo.updated_at` | `updatedAt` | `new Date(repo.updated_at)` |
| Additional safe fields | `metadata` | Extracted safe metadata (see below) |

```javascript
// NormalizedResource Metadata Allowlist:
metadata: {
  numericId: 1043905096,
  fullName: "vishu1803/Ai-job-mcp",
  description: "Universal Career AI Agent MCP Server",
  archived: false,
  fork: false,
  visibility: "public",
  stargazersCount: 5,
  forksCount: 1,
  openIssuesCount: 0,
  size: 2048,
  hasWiki: false,
  license: "Apache-2.0"
}
```

---

### 4.3. `getResource(context, credentials, externalResourceId)`

Fetches detailed metadata for a single repository.

* **Upstream GitHub Endpoint**:
  * Primary (by numeric ID): `GET /repositories/:id`
  * Secondary (by `owner/repo` name): `GET /repos/:owner/:repo`
* **Identifier Resolution**: If `externalResourceId` is numeric or digits-only, query `GET /repositories/:id`. If `externalResourceId` contains a slash (`/`), query `GET /repos/:owner/:repo`.
* **Output**: Single frozen `NormalizedResource`.

---

### 4.4. `validate(context, credentials)`

Performs a lightweight health check to confirm connection viability.

* **Upstream GitHub Endpoint**: `GET /installation/repositories?per_page=1`
* **Response**:
  * If HTTP 200: Returns `{ healthy: true, message: 'GitHub connection is active and authorized' }`.
  * If HTTP 401/404: Returns `{ healthy: false, message: 'Installation is revoked or suspended on GitHub' }`.

---

### 4.5. `revokeAccess(context, credentials)`

Revokes upstream tokens and invalidates cache upon disconnection.

* **Execution**:
  1. Calls `authManager.revokeInstallationToken({ tenantId: context.tenantId, installationId: credentials.installationId })`.
  2. Evicts all partitioned token cache entries for `(tenantId, installationId)`.
  3. Executes upstream `DELETE /installation/token` using the currently active `ghs_*` token if available.

---

## 5. Opaque Cursor Pagination Strategy

Generic platform callers interact strictly with opaque cursor strings. `GitHubAppConnector` converts between opaque cursor tokens and GitHub's page-based query structure.

### Cursor Encoding:
The opaque cursor is an encrypted or Base64URL-encoded JSON structure containing monotonic query pointers:

```typescript
interface GitHubPaginationCursor {
  page: number;      // 1-indexed GitHub page number
  limit: number;     // Page size (1..100)
  issuedAt: number;  // Timestamp to prevent stale cursors
}
```

### Conversion Flow:
1. **Initial Request (`cursor === null`)**:
   * Sets `page = 1`, `limit = options.limit || 50`.
   * Queries `GET /installation/repositories?per_page=50&page=1`.
2. **Next Page Evaluation**:
   * Let `totalCount = data.total_count` and `returnedCount = data.repositories.length`.
   * If `returnedCount === limit` and `(page * limit) < totalCount`:
     * Generates `nextCursor = base64url(JSON.stringify({ page: page + 1, limit, issuedAt: Date.now() }))`.
     * Sets `hasMore = true`.
   * Otherwise (last page or empty set):
     * Sets `nextCursor = null` and `hasMore = false`.
3. **Invalid Cursor Defense**:
   * If a provided cursor fails Base64URL decoding, contains non-integer page/limit, or specifies `page < 1`, the connector throws `ValidationError('Invalid pagination cursor', 'INVALID_PAGINATION_CURSOR')`.

---

## 6. Canonical Repository Identifier Decision

### Evaluation of Identifier Options:

| Identifier Type | Example | Immutability | Rename Safe? | Transfer Safe? | URL Friendly? | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GitHub Numeric ID** | `"1043905096"` | **Permanent** | **YES** | **YES** | **YES** | **SELECTED CANONICAL** |
| **Full Name (`owner/repo`)** | `"vishu1803/Ai-job-mcp"` | Mutable (changes on rename) | NO | NO | Requires encoding | Secondary Lookup Only |
| **GraphQL Node ID** | `"R_kgDOPlgU-A"` | Permanent | YES | YES | Complex Base64 | Internal Provider Only |

### Decision:
* **Canonical Identifier**: **Numeric GitHub Repository ID as a string** (e.g. `"1043905096"`).
* **Rationale**: Numeric IDs never change when a user renames their account or repository, or transfers ownership across organizations.
* **Secondary Lookup**: The connector supports lookup by `owner/repo` string in `getResource()` as a convenience, but the returned `NormalizedResource.id` is always the immutable numeric string.

---

## 7. Permission Requirements & Scopes

The operations defined in P3-004 require only the permissions already granted during Phase 3 installation:

| Operation | Required GitHub Permission | Granted in Current Installation? |
| :--- | :--- | :--- |
| `getAccount` | `metadata: read` | **YES (`metadata:read`)** ✅ |
| `listResources` | `metadata: read` | **YES (`metadata:read`)** ✅ |
| `getResource` | `metadata: read` | **YES (`metadata:read`)** ✅ |
| `validate` | `metadata: read` | **YES (`metadata:read`)** ✅ |
| *Deep File Reading (P3-005)* | `contents: read` | **YES (`contents:read`)** ✅ |

**Rule**: If GitHub responds with `403 Insufficient Scope`, the connector maps the failure to `InsufficientScopeError('GITHUB_APP', ['metadata:read'], grantedScopes)` without attempting to silently request elevated permissions.

---

## 8. Connection Lifecycle States & Read Enforcement

The connector strictly checks `context.connectionStatus` before attempting upstream calls:

| Connection Status | Read Operations Permitted? | Connector Behavior |
| :--- | :--- | :--- |
| **`ACTIVE`** | **YES** | Executes operation normally. |
| **`PENDING`** | **NO** | Throws `ConnectionInactiveError(connectionId, 'PENDING')`. |
| **`EXPIRED`** | **YES (Auto-refresh)** | Attempts token refresh via App JWT; if installation deleted, marks `REVOKED`. |
| **`ERROR`** | **NO** | Throws `ConnectionInactiveError(connectionId, 'ERROR')`. |
| **`REVOKED`** | **NO** | Throws `ConnectionInactiveError(connectionId, 'REVOKED')`. |
| **`DISCONNECTED`** | **NO** | Throws `ConnectionInactiveError(connectionId, 'DISCONNECTED')`. |

---

## 9. HTTP Client Decision: Native `fetch`

### Evaluation:
* **Octokit (`@octokit/rest`)**: Provides strongly-typed SDK wrappers, but adds large dependency tree (~50+ sub-packages), introduces custom error models that leak into domain logic, and complicates deterministic testing.
* **Native `fetch` (Node.js 22+ Global)**: Built into the Node.js runtime, zero external dependencies, seamless integration with `AbortSignal.timeout()`, full control over request headers, and identical to the proven implementation in `GitHubAppAuthManager`.

### Decision:
* Use **Node.js Native `fetch`** encapsulated within `GitHubAppConnector`.
* Centralize request execution, header injection, timeout management, rate-limit header parsing, and error mapping in a private helper `_request(endpoint, options)`.

---

## 10. Rate Limiting, Timeouts & Retry Policy

### Rate-Limit Header Inspection:
Every GitHub response is inspected for standard rate-limit headers:
* `x-ratelimit-limit`: Total quota allocated (5,000 req/hr for installation tokens).
* `x-ratelimit-remaining`: Remaining quota.
* `x-ratelimit-reset`: Unix epoch timestamp when quota resets.
* `retry-after`: Seconds to wait before retry (sent on 429/secondary rate limits).

### Throttling & Proactive Safety:
* If `x-ratelimit-remaining <= 5`, the connector logs a high-priority warning (`logger.warn`) and attaches rate-limit metadata to operation results.
* If HTTP 429 or HTTP 403 (with `x-ratelimit-remaining === '0'`) is returned, throws `ProviderRateLimitError('GITHUB_APP', retryAfter, resetTimestamp)`.

### Retry & Timeout Policy:

| Scenario | HTTP Status | Action | Max Retries | Backoff Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Success** | `200 OK` | Return parsed data | 0 | None |
| **Rate Limited** | `429` / `403` | If `Retry-After` <= 2s, retry | 1 | Wait `Retry-After` seconds |
| **Transient 5xx** | `500, 502, 503, 504` | Retry | 2 | Exponential jitter: `min(500 * 2^attempt + jitter, 3000ms)` |
| **Network Timeout** | `AbortError` (10s) | Retry | 1 | Immediate retry with fresh timeout |
| **Auth Failure** | `401 Unauthorized` | Evict cache & throw | 0 | Non-retryable (`ConnectorAuthError`) |
| **Not Found** | `404 Not Found` | Throw `ResourceNotFoundError` | 0 | Non-retryable |
| **Forbidden** | `403 Forbidden` | Throw `InsufficientScopeError` | 0 | Non-retryable |

---

## 11. Comprehensive Error Normalization Matrix

All raw GitHub API responses and network failures are translated into standard connector errors ([`src/connectors/errors/connector-errors.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/connectors/errors/connector-errors.js)):

| Upstream Status / Cause | GitHub Response Substring | Normalized Platform Error | HTTP Status | Retryable |
| :--- | :--- | :--- | :--- | :--- |
| **401 Unauthorized** | `"Bad credentials"`, `"Expired token"` | `ConnectorAuthError('GITHUB_APP', message, { requiresReauth: true })` | 401 | `false` |
| **403 Forbidden** | `"Resource not accessible by integration"` | `InsufficientScopeError('GITHUB_APP', ['metadata:read'])` | 403 | `false` |
| **403 Forbidden** | `"rate limit exceeded"` | `ProviderRateLimitError('GITHUB_APP', retryAfter, resetAt)` | 429 | `true` |
| **404 Not Found** | `"Not Found"` | `ResourceNotFoundError('GITHUB_APP', externalResourceId)` | 404 | `false` |
| **429 Too Many Requests** | `"You have exceeded a secondary rate limit"` | `ProviderRateLimitError('GITHUB_APP', retryAfter, resetAt)` | 429 | `true` |
| **500 / 502 / 503 / 504** | Server errors | `ProviderUnavailableError('GITHUB_APP', message, true)` | 503 | `true` |
| **Network Timeout** | `AbortError` / `ETIMEDOUT` | `ProviderUnavailableError('GITHUB_APP', 'Request timed out after 10s', true)` | 503 | `true` |
| **JSON Parse Error** | Malformed response | `ProviderUnavailableError('GITHUB_APP', 'Malformed API response', false)` | 502 | `false` |

---

## 12. Multi-Tenant Security & Isolation Invariants

1. **ConnectorContext Enforcement**: Every connector call requires a validated, frozen `ConnectorContext` minted via `createTrustedConnectorContext(req.auth, connection)`.
2. **Database Scoping**: Connection lookup is scoped by `tenant_id = :trustedTenantId`. Cross-tenant lookups throw `404 ConnectionNotFoundError`.
3. **Partitioned In-Memory Token Isolation**: Installation tokens are partitioned in memory by `gh_token:${tenantId}:${installationId}:${repoScopeHash}`. Tenant A can never consume or observe Tenant B's token material.
4. **Zero Confused Deputy**: The connector derives the `installationId` from decrypted database credentials, never from client input.
5. **Zero Secret Retention**: `GitHubAppConnector` instances do not retain tokens or credentials in instance variables.
6. **Zero Secret Leakage in Logs**: Pino logging uses structured redaction; tokens (`ghs_*`), JWTs, and raw Authorization headers are completely scrubbed.

---

## 13. Observability & Audit Strategy

### Pino Logging Contract:
All connector operations log structured operational telemetry:

```json
{
  "level": 30,
  "time": 1787338000000,
  "provider": "GITHUB_APP",
  "operation": "list_resources",
  "tenantId": "24d53f53-780e-4431-b065-32180c354175",
  "connectionId": "1743c149-bf4c-4c4e-a1fa-0532dfd5460a",
  "installationId": "155430459",
  "page": 1,
  "limit": 50,
  "returnedCount": 40,
  "totalCount": 40,
  "rateLimitRemaining": 4980,
  "latencyMs": 245,
  "status": 200,
  "msg": "github_app: list_resources completed"
}
```

### Audit Logging Policy:
* **High-Frequency Read Operations (`listResources`, `getResource`, `getAccount`)**: Do **NOT** write persistent rows to the PostgreSQL `audit_logs` table to prevent database write bloat during AI agent exploratory crawls.
* **Security & Lifecycle Operations (`validate` status changes, `revokeAccess`, token eviction)**: Write structured audit records (`github.connection_validated`, `github.connection_revoked`) via `writeAuditRecord`.

---

## 14. Testing Architecture (P3-004 Implementation)

### 14.1. Unit Tests (`tests/unit/github-connector.test.js`):
* `getCapabilities()` returns exact approved capability set.
* `getAccount()` maps GitHub account to `NormalizedAccount` and handles User vs. Org.
* `listResources()` paginates 40 items, encodes opaque cursor, and sets `hasMore = false` on final page.
* `listResources()` with multi-page dataset generates valid next cursor and resumes cleanly.
* `getResource()` resolves numeric ID (`1043905096`) and namespaced name (`vishu1803/Ai-job-mcp`).
* `validate()` returns `{ healthy: true }` on 200 and `{ healthy: false }` on 401/404.
* `revokeAccess()` invokes token revocation and cache eviction.
* Error mapping test suite: 401 -> `ConnectorAuthError`, 403 -> `InsufficientScopeError`, 404 -> `ResourceNotFoundError`, 429 -> `ProviderRateLimitError`, 503 -> `ProviderUnavailableError`.
* Rate-limit header parsing and proactive warning threshold validation.
* Monotonic cursor validation and invalid cursor rejection.

### 14.2. Hermetic Mocked HTTP Tests:
* Mocked upstream GitHub responses for all operations with zero network egress.
* Simulated network timeouts via abort signals.
* Simulated exponential backoff on 500/503 responses.

### 14.3. PostgreSQL Integration Tests (`tests/integration/github-connector.test.js`):
* Full lifecycle integration using test PostgreSQL database.
* Cross-tenant connection isolation (Tenant B cannot invoke connector on Tenant A's connection).
* `ConnectionInactiveError` enforcement on `REVOKED`, `DISCONNECTED`, and `PENDING` connections.

---

## 15. Live Verification Plan (Post P3-004 Implementation)

Using the active live GitHub App installation (`installation_id = 155430459`):
1. **Verify Account**: Execute `getAccount()` -> verify `NormalizedAccount` contains `id: "97516061"`, `name: "vishu1803"`, `provider: "GITHUB_APP"`.
2. **Verify Repository Listing**: Execute `listResources()` -> verify all 40 accessible repositories are returned with valid `NormalizedResource` structures.
3. **Verify Single Repository Inspection**: Execute `getResource("1043905096")` and `getResource("vishu1803/Ai-job-mcp")` -> verify identical `NormalizedResource` payload.
4. **Verify Health Validation**: Execute `validate()` -> verify `{ healthy: true }`.
5. **Verify Rate Limits**: Verify `rateLimitRemaining` is extracted and logged.

*(Note: Live calls will be executed during P3-004 verification, not during P3-004A architecture review).*

---

## 16. Architectural Decision Summary & Approval

* **Selected HTTP Client**: Node.js Native `fetch` with `AbortSignal.timeout(10000)`.
* **Canonical Repository Identifier**: Numeric GitHub ID as a string (`"1043905096"`).
* **Pagination Strategy**: Opaque Base64URL cursor mapped to `page` and `limit`.
* **Permissions Required**: `metadata:read` (Already granted).
* **Token Management**: Delegated to `GitHubAppAuthManager` and `GitHubTokenCache`.
* **ADR Recorded**: `ADR-024` in `docs/decisions.md`.
* **Final Status**: **P3-004A APPROVED**.

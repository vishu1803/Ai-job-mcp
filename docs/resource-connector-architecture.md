# Provider-Neutral Resource Connector Architecture (Task P2-004A)

**Document Version**: `1.0.0`  
**Status**: `APPROVED / ARCHITECTURAL BASELINE`  
**Date**: `2026-08-21`  
**Phase**: `Phase 2 — Task P2-004A`  
**Governing Documents**: [`AGENTS.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/AGENTS.md), [`goal.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/goal.md), [`project.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/project.md), [`docs/architecture.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/architecture.md), [`docs/data-model.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/data-model.md), [`docs/security.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/security.md), [`docs/decisions.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/decisions.md) (ADR-016, ADR-017, ADR-018, ADR-019), [`docs/resource-connections-schema-review.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/resource-connections-schema-review.md).

---

## 1. Executive Summary & Purpose of the Connector Layer

The **Resource Connector Layer** is the architectural bridge between encrypted third-party authorization persistence (`resource_connections` table) and the upstream AI Career Intelligence engine.

```
┌─────────────────────────────────────────────────────────────────────────┐
│              Career Intelligence & Adaptation Engine (Phases 5-6)       │
│                  Remote MCP Server & AI Clients (Phases 7-11)           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Normalized Resource Ingestion
┌────────────────────────────────────▼────────────────────────────────────┐
│                    Unified Resource / Candidate Model (Phase 4)         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Normalized Contracts (Accounts/Files/Repos)
┌────────────────────────────────────▼────────────────────────────────────┐
│                       CONNECTOR REGISTRY (P2-004)                       │
│    - Provider Lookup & Resolution       - Capability Introspection      │
│    - Tenant Isolation Enforcement       - Error Normalization           │
└───────────────────┬─────────────────────────────────┬───────────────────┘
                    │                                 │
   ┌────────────────▼───────────────┐ ┌───────────────▼─────────────────┐
   │ GitHub Connector (Phase 3)     │ │ GitLab / Drive Connectors       │
   │ - GitHub REST / Octokit        │ │ - GitLab / GDrive REST APIs     │
   │ - App Installation JWTs        │ │ - OAuth2 / API Keys             │
   └────────────────┬───────────────┘ └───────────────┬─────────────────┘
                    │ Transient Plaintext             │ Transient Plaintext
                    │ Credentials (in memory)         │ Credentials (in memory)
┌───────────────────▼─────────────────────────────────▼───────────────────┐
│             P2-001 AES-256-GCM Cryptographic Security Engine            │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Encrypted Ciphertext Package (`enc:v1:...`)
┌────────────────────────────────────▼────────────────────────────────────┐
│     PostgreSQL `resource_connections` (P2-003 Persistence Boundary)     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Responsibilities of the Connector Layer
1. **Provider Isolation**: Encapsulate all vendor-specific protocols, endpoints, rate limits, pagination formats, and authentication headers.
2. **Normalized Data Modeling**: Transform disparate vendor entities (GitHub repositories, GitLab projects, Google Drive documents, Notion pages) into unified domain models (`NormalizedAccount`, `NormalizedResource`).
3. **Strict Credential Boundary**: Access decrypted credentials only for the brief duration of an external API call within controlled memory boundaries, ensuring zero plaintext exposure in logs, application state, or audit trails.
4. **Tenant & Identity Scoping**: Guarantee that every connector invocation is strictly bounded by `tenant_id`, `user_id`, and `connection_id`.
5. **Separation from Career Intelligence**: The connector layer is strictly an I/O and normalization pipeline. It does **not** evaluate candidate skills, infer career attributes, or rewrite portfolio items.

---

## 2. Core Abstraction & Interface Contract

To prevent forcing every external provider into a rigid lowest-common-denominator shape, the connector architecture defines a base interface (`BaseResourceConnector`) with a clear distinction between **Required Core Operations**, **Optional Capability-Guarded Operations**, and **Deferred Future Operations**.

### 2.1 Interface Definition (`BaseResourceConnector`)

```javascript
/**
 * @abstract
 * Base class for all third-party resource connectors.
 */
export class BaseResourceConnector {
  /**
   * @param {string} provider - Resource provider identifier (from resourceProviderEnum)
   */
  constructor(provider) {
    if (new.target === BaseResourceConnector) {
      throw new TypeError('Cannot construct BaseResourceConnector instances directly');
    }
    this.provider = provider;
  }

  // -------------------------------------------------------------------------
  // 1. Mandatory Core Operations (Must be implemented by every connector)
  // -------------------------------------------------------------------------

  /**
   * Returns the set of capability flags supported by this connector.
   * @returns {ReadonlySet<string>}
   */
  getCapabilities() {
    throw new Error('getCapabilities() must be implemented by subclass');
  }

  /**
   * Validates health and active authorization of a connection against the provider.
   * @param {ConnectorContext} context - Trusted execution context
   * @param {DecryptedCredentials} credentials - Decrypted credential bundle
   * @returns {Promise<ValidationResult>}
   */
  async validate(context, credentials) {
    throw new Error('validate() must be implemented by subclass');
  }

  /**
   * Retrieves normalized profile/organization account metadata from the provider.
   * @param {ConnectorContext} context - Trusted execution context
   * @param {DecryptedCredentials} credentials - Decrypted credential bundle
   * @returns {Promise<NormalizedAccount>}
   */
  async getAccount(context, credentials) {
    throw new Error('getAccount() must be implemented by subclass');
  }

  // -------------------------------------------------------------------------
  // 2. Capability-Guarded Operations (Implemented if capability is declared)
  // -------------------------------------------------------------------------

  /**
   * Lists available resources (repositories, folders, documents) with cursor pagination.
   * Guarded by: CONNECTOR_CAPABILITIES.LIST_RESOURCES
   * @param {ConnectorContext} context
   * @param {DecryptedCredentials} credentials
   * @param {PaginationOptions} [options]
   * @returns {Promise<PaginatedResult<NormalizedResource>>}
   */
  async listResources(context, credentials, options = {}) {
    throw new UnsupportedCapabilityError(this.provider, 'LIST_RESOURCES');
  }

  /**
   * Fetches a single normalized resource by external identifier.
   * Guarded by: CONNECTOR_CAPABILITIES.READ_RESOURCE
   * @param {ConnectorContext} context
   * @param {DecryptedCredentials} credentials
   * @param {string} externalResourceId
   * @returns {Promise<NormalizedResource>}
   */
  async getResource(context, credentials, externalResourceId) {
    throw new UnsupportedCapabilityError(this.provider, 'READ_RESOURCE');
  }

  /**
   * Performs proactive credential refresh (e.g. OAuth2 token refresh or App JWT renewal).
   * Guarded by: CONNECTOR_CAPABILITIES.REFRESH_CREDENTIAL
   * @param {ConnectorContext} context
   * @param {DecryptedCredentials} credentials
   * @returns {Promise<RefreshedCredentialsResult>}
   */
  async refreshCredentials(context, credentials) {
    throw new UnsupportedCapabilityError(this.provider, 'REFRESH_CREDENTIAL');
  }

  /**
   * Revokes access on the provider side (best-effort authorization termination).
   * Guarded by: CONNECTOR_CAPABILITIES.REVOKE_ACCESS
   * @param {ConnectorContext} context
   * @param {DecryptedCredentials} credentials
   * @returns {Promise<void>}
   */
  async revokeAccess(context, credentials) {
    throw new UnsupportedCapabilityError(this.provider, 'REVOKE_ACCESS');
  }

  // -------------------------------------------------------------------------
  // 3. Deferred Future Operations (Phase 9+ Workflows)
  // -------------------------------------------------------------------------
  // writeResource() - Approved repository modifications, PR creation (Phase 9)
  // syncWebhooks()  - Webhook registration and validation (Phase 3 / P3-003)
}
```

### 2.2 Categorization of Operations
* **REQUIRED**: `getCapabilities()`, `validate()`, `getAccount()`. Every registered connector must be able to advertise capabilities, verify its credentials against the vendor, and return the authenticated account identity.
* **OPTIONAL (Capability-Guarded)**: `listResources()`, `getResource()`, `refreshCredentials()`, `revokeAccess()`. Connectors throw `UnsupportedCapabilityError` if invoked without declaring support.
* **PROVIDER-SPECIFIC**: Deep code tree inspections (`getReadme`, `getLanguages`, `getRecentCommits`) belong to provider-specific extensions (Phase 3) and are not forced into the root interface.
* **DEFERRED**: Write operations (`writeResource`, PR creation) remain deferred to Phase 9.

---

## 3. Capability Model

Rather than assuming all connectors support identical feature sets, connectors explicitly advertise their supported capabilities via a frozen enumeration:

```javascript
export const CONNECTOR_CAPABILITIES = Object.freeze({
  READ_ACCOUNT: 'READ_ACCOUNT',           // Retrieve external user/org profile
  LIST_RESOURCES: 'LIST_RESOURCES',       // Enumerate repositories, files, or databases
  READ_RESOURCE: 'READ_RESOURCE',         // Fetch individual resource details
  READ_CONTENT: 'READ_CONTENT',           // Deep content inspection (README, source files)
  REFRESH_CREDENTIAL: 'REFRESH_CREDENTIAL', // Exchange refresh token or mint fresh JWT
  REVOKE_ACCESS: 'REVOKE_ACCESS',         // Explicit upstream token revocation
  WRITE_RESOURCE: 'WRITE_RESOURCE',       // Modification / commit / branch creation (Phase 9)
});
```

### Provider Capability Matrix

| Provider | READ_ACCOUNT | LIST_RESOURCES | READ_RESOURCE | READ_CONTENT | REFRESH_CREDENTIAL | REVOKE_ACCESS | WRITE_RESOURCE |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **GITHUB_APP** | ✅ | ✅ (Repos) | ✅ | ✅ (Code) | ✅ (Installation Token) | ✅ (App Install) | ⏸️ (Phase 9) |
| **GITLAB** | ✅ | ✅ (Projects) | ✅ | ✅ (Code) | ✅ (OAuth2 Refresh) | ✅ (OAuth2 Revoke) | ⏸️ (Phase 9) |
| **GOOGLE_DRIVE** | ✅ | ✅ (Files/Docs) | ✅ | ✅ (Doc Text) | ✅ (OAuth2 Refresh) | ✅ (OAuth2 Revoke) | ❌ |
| **ONEDRIVE** | ✅ | ✅ (Files/Docs) | ✅ | ✅ (Doc Text) | ✅ (OAuth2 Refresh) | ✅ (OAuth2 Revoke) | ❌ |
| **NOTION** | ✅ | ✅ (Pages/DBs) | ✅ | ✅ (Blocks) | ❌ (Static Bot Token) | ❌ | ❌ |
| **CUSTOM_API** | ✅ | ❓ (Declared) | ❓ (Declared) | ❓ | ❓ (Declared) | ❓ | ❌ |

---

## 4. Connector Execution Context (`ConnectorContext`)

Connectors never receive raw HTTP request objects, Express/Fastify sessions, or unsanitized client inputs. All executions require an immutable, trusted `ConnectorContext` created by the service boundary:

```javascript
/**
 * @typedef {Object} ConnectorContext
 * @property {string} tenantId - Trusted organization UUID (enforces multi-tenancy)
 * @property {string} userId - Trusted initiating user UUID (authorizer attribution)
 * @property {string} connectionId - Target resource connection UUID
 * @property {string} provider - Resource provider enum value ('GITHUB_APP', 'GITLAB', etc.)
 * @property {string} authType - Credential mechanism ('APP_INSTALLATION', 'OAUTH2_CODE', etc.)
 * @property {string[]} scopes - Verified provider permission scopes
 * @property {string} requestId - Distributed correlation ID for structured telemetry
 */
```

### Context Security Invariants:
1. **Server-Minted**: `tenantId` and `userId` are derived exclusively from the verified server-side session (`req.user.id`, `req.tenant.id`).
2. **Zero Client Pollution**: Query strings, injected headers, and unvalidated payloads cannot override context properties.
3. **Correlation Tracking**: `requestId` is propagated through all external HTTP calls and logger bindings for complete distributed traceability.

---

## 5. Credential Access Boundary & Transient Decryption Lifecycle

Plaintext credentials (access tokens, refresh tokens, private keys) must NEVER be persisted in memory, attached to global singletons, or passed into generic route handlers.

### Controlled Invocation Workflow

```
1. Request Ingestion:
   Fastify Controller receives authenticated request (req.tenant.id, req.user.id).

2. Tenant-Scoped Database Query:
   SELECT * FROM resource_connections 
   WHERE id = :connectionId AND tenant_id = :tenantId AND status != 'DISCONNECTED';

3. Authorization & Status Check:
   Verify connection exists and status is ACTIVE (or PENDING during initial validation).

4. Transient Decryption:
   const rawSecretJson = decryptSecret(record.encryptedCredentials);
   const credentials = JSON.parse(rawSecretJson);

5. Connector Invocation:
   const result = await connector.listResources(context, credentials, options);

6. Immediate Memory Release:
   credentials object goes out of scope and is eligible for garbage collection.

7. Return Sanitized Domain Models:
   Controller returns normalized domain objects with ZERO credentials.
```

### Safety Rules:
- **No Caching of Plaintext**: Never cache decrypted access tokens in global objects or Redis.
- **Short-Lived Scope**: The decrypted `credentials` object is passed only as an explicit argument to connector methods.
- **Redaction**: Connector loggers automatically redact any credential keys if an error occurs.

---

## 6. Provider-Neutral Result Models

All external vendor representations are transformed into normalized, immutable domain models:

### 6.1 `NormalizedAccount`
```javascript
/**
 * @typedef {Object} NormalizedAccount
 * @property {string} id - Immutable provider account identifier (e.g. "88776655")
 * @property {string} name - Human-readable handle or organization name (e.g. "octocat")
 * @property {string} [displayName] - Optional human name (e.g. "The Octocat")
 * @property {string} [avatarUrl] - Safe public avatar URL
 * @property {string} provider - Provider enum value ('GITHUB_APP', 'GITLAB', etc.)
 * @property {string} accountType - Account classification ('USER', 'ORGANIZATION', 'WORKSPACE')
 * @property {Record<string, unknown>} metadata - Safe, non-sensitive provider metadata
 */
```

### 6.2 `NormalizedResource`
```javascript
/**
 * @typedef {Object} NormalizedResource
 * @property {string} id - Provider resource ID (e.g. GitHub repository ID "123456789")
 * @property {string} name - Resource name (e.g. "ai-career-agent")
 * @property {string} fullName - Full namespaced path (e.g. "vishu1803/ai-career-agent")
 * @property {string} type - Resource category ('REPOSITORY', 'DOCUMENT', 'FOLDER', 'DATABASE')
 * @property {string} [url] - Safe web URL to the resource on the provider
 * @property {string} [defaultBranch] - Default branch for code repositories (e.g. "main")
 * @property {boolean} isPrivate - Visibility classification
 * @property {string[]} [languages] - Programming languages or document formats
 * @property {Date} [updatedAt] - Last upstream modification timestamp
 * @property {Record<string, unknown>} metadata - Provider-neutral metadata (e.g. stars, forks, size)
 */
```

### 6.3 `ConnectorOperationResult<T>`
```javascript
/**
 * @template T
 * @typedef {Object} ConnectorOperationResult
 * @property {boolean} success - Operation outcome flag
 * @property {T} [data] - Normalized data payload upon success
 * @property {ConnectorErrorDetails} [error] - Standardized error descriptor upon failure
 */
```

---

## 7. Unified Error Taxonomy & Resilience Mapping

All vendor-specific HTTP status codes and error payloads (e.g. GitHub `401 Bad credentials`, `403 rate limit exceeded`, GitLab `404 Project Not Found`) are intercepted and translated into standard domain errors derived from [`AppError`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/errors/index.js):

| Connector Error Class | Base Error Class | HTTP Status | Code | Retryable? | Description |
| :--- | :--- | :---: | :--- | :---: | :--- |
| `ConnectionNotFoundError` | `NotFoundError` | 404 | `CONNECTION_NOT_FOUND` | No | Connection does not exist in tenant |
| `ConnectionInactiveError` | `AuthorizationError` | 403 | `CONNECTION_INACTIVE` | No | Connection is `DISCONNECTED` or `REVOKED` |
| `ConnectorAuthError` | `AuthenticationError` | 401 | `CONNECTOR_AUTH_FAILED` | No | Invalid/expired credentials; requires re-auth |
| `InsufficientScopeError` | `AuthorizationError` | 403 | `INSUFFICIENT_SCOPE` | No | Connection lacks required permission scopes |
| `ProviderRateLimitError` | `RateLimitError` | 429 | `PROVIDER_RATE_LIMITED` | Yes (after `retryAfter`) | Provider upstream quota exhausted |
| `ProviderUnavailableError` | `DependencyError` | 503 | `PROVIDER_UNAVAILABLE` | Yes | Vendor API down, network timeout, DNS failure |
| `ResourceNotFoundError` | `NotFoundError` | 404 | `RESOURCE_NOT_FOUND` | No | Specific repo/file not found on provider |
| `UnsupportedCapabilityError` | `ValidationError` | 400 | `UNSUPPORTED_CAPABILITY` | No | Operation not supported by provider |

---

## 8. Connector Registry Architecture (`ConnectorRegistry`)

The `ConnectorRegistry` is a centralized, singleton service responsible for managing connector factories, resolving adapters by provider type, and asserting capability support.

```javascript
export class ConnectorRegistry {
  constructor() {
    /** @type {Map<string, BaseResourceConnector>} */
    this.connectors = new Map();
  }

  /**
   * Registers a connector instance for a specific provider.
   * @param {string} provider - Provider enum value
   * @param {BaseResourceConnector} connector - Connector implementation
   */
  register(provider, connector) {
    if (!(connector instanceof BaseResourceConnector)) {
      throw new TypeError(`Connector for ${provider} must extend BaseResourceConnector`);
    }
    this.connectors.set(provider, connector);
  }

  /**
   * Resolves the connector registered for the specified provider.
   * @param {string} provider - Provider enum value
   * @returns {BaseResourceConnector}
   */
  get(provider) {
    const connector = this.connectors.get(provider);
    if (!connector) {
      throw new ValidationError(`Unsupported or unconfigured resource provider: ${provider}`);
    }
    return connector;
  }

  /**
   * Returns a list of all registered provider names.
   * @returns {string[]}
   */
  getSupportedProviders() {
    return Array.from(this.connectors.keys());
  }

  /**
   * Checks if a provider supports a specific capability.
   * @param {string} provider
   * @param {string} capability
   * @returns {boolean}
   */
  hasCapability(provider, capability) {
    const connector = this.get(provider);
    return connector.getCapabilities().has(capability);
  }
}
```

---

## 9. Provider Adapter Boundary & Encapsulation Rules

To preserve provider neutrality, strict boundary rules govern what code is permitted inside provider adapters versus core services:

### What Belongs INSIDE a Provider Adapter (`src/connectors/github/`, etc.)
- Vendor REST / GraphQL endpoint URLs and headers.
- Vendor SDKs (e.g. `@octokit/rest`, `@octokit/app`, `@google-cloud/storage`).
- Vendor payload JSON parsing and field mappings.
- Vendor-specific error codes (e.g. `API rate limit exceeded for user ID`).
- Vendor-specific pagination headers (`Link` headers, `next_page_token`).

### What Belongs in CORE Services (`src/services/`, `src/routes/`)
- Unified domain models (`NormalizedAccount`, `NormalizedResource`).
- Multi-tenant query filtering (`WHERE tenant_id = req.tenant.id`).
- Cryptographic decryption/encryption of credentials via `src/security/encryption.js`.
- Audit log recording via `src/utils/audit-sanitizer.js`.
- HTTP REST response formatting for API clients and MCP servers.

---

## 10. GitHub App Future Integration Architecture (Phase 3 Path)

The connector layer is designed to seamlessly receive the **GitHub App** implementation in Phase 3 without refactoring the core abstraction.

```
Phase 2 (Current Baseline):
[BaseResourceConnector] <─── [Dummy/Mock Connector in Unit Tests]

Phase 3 (GitHub App Integration):
[BaseResourceConnector] <─── [GitHubAppConnector] (src/connectors/github/)
                                  │
                   ┌──────────────┴──────────────┐
                   │ App Authentication (P3-001) │
                   │ - App ID & Private Key (PEM)│
                   │ - Installation Access Token │
                   └──────────────┬──────────────┘
                                  ▼
                   ┌─────────────────────────────┐
                   │ Octokit REST API Client     │
                   │ - listRepositories (P3-004) │
                   │ - getReadme / Tree (P3-005) │
                   └─────────────────────────────┘
```

### Phase 3 Extension Contract:
1. `GitHubAppConnector` extends `BaseResourceConnector`.
2. Declares capabilities: `READ_ACCOUNT`, `LIST_RESOURCES`, `READ_RESOURCE`, `READ_CONTENT`, `REFRESH_CREDENTIAL`, `REVOKE_ACCESS`.
3. Ingests encrypted installation credentials (`{ appId, installationId, privateKey }`).
4. Generates short-lived installation access tokens (`ghs_*`) in transient runtime memory via `@octokit/app`.
5. Maps GitHub repository objects to `NormalizedResource`.

---

## 11. Multi-Tenant & Dual-Ownership Security Enforcement

Multi-tenant security is enforced at the database retrieval layer before any connector method is invoked:

```javascript
/**
 * Loads a connection while strictly enforcing tenant isolation.
 */
export async function loadAuthorizedConnection(tenantId, connectionId) {
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
    throw new NotFoundError(`Resource connection ${connectionId} not found in current tenant`);
  }

  if (connection.status === 'DISCONNECTED' || connection.status === 'REVOKED') {
    throw new AuthorizationError(`Resource connection is in ${connection.status} state`);
  }

  return connection;
}
```

### Security Guarantees:
- **No Cross-Tenant IDOR**: Even if an attacker guesses a valid `connectionId` belonging to another tenant, the query returns `404 Not Found`.
- **Untrusted Client Inputs Ignored**: Route parameters for `tenant_id` are never accepted from request bodies or headers.

---

## 12. Standardized Cursor-Based Pagination Contract

To support large resource sets (e.g. GitHub organizations with thousands of repositories or Google Drives with deep folder structures), the connector interface mandates **opaque cursor-based pagination**:

```javascript
/**
 * @typedef {Object} PaginationOptions
 * @property {string} [cursor] - Opaque cursor token from previous page
 * @property {number} [limit=50] - Number of items to fetch (bounded between 1 and 100)
 */

/**
 * @template T
 * @typedef {Object} PaginatedResult
 * @property {T[]} items - Normalized resource items
 * @property {string|null} nextCursor - Opaque cursor for subsequent page, or null if exhausted
 * @property {boolean} hasMore - True if additional items exist
 * @property {number} [totalCount] - Optional total count if reported safely by provider
 */
```

### Safety Invariant:
- Maximum page limit is hard-capped at **100** items to prevent unbounded memory allocation and excessive upstream API latency.

---

## 13. Timeout, Retry & Idempotency Policies

External vendor communication is inherently non-deterministic. Connectors adhere to deterministic timeout and retry policies:

### 13.1 Timeout Policy
- All outgoing HTTP requests to external providers must have an explicit timeout of **10,000 ms (10 seconds)**.
- Requests exceeding 10s are aborted and throw `ProviderUnavailableError('Request timed out')`.

### 13.2 Retry Strategy
- **Read Operations (`validate`, `getAccount`, `listResources`, `getResource`)**: Retried up to **2 times** with exponential backoff (initial delay: 500ms, max delay: 2000ms) **only** on network disconnects (ECONNRESET, ETIMEDOUT) or upstream HTTP 502/503/504.
- **Rate Limited Responses (HTTP 429)**: NOT retried in-band during user requests. Throws `ProviderRateLimitError` containing `retryAfter` seconds.
- **Write Operations (Phase 9)**: Never retried automatically without explicit idempotency keys.

---

## 14. Provider Rate Limiting Normalization

When external providers return rate-limit errors, connectors extract standard rate-limit headers and populate `ProviderRateLimitError`:

```javascript
export class ProviderRateLimitError extends RateLimitError {
  /**
   * @param {string} provider
   * @param {number} [retryAfterSeconds=60]
   * @param {number} [resetTimestamp]
   */
  constructor(provider, retryAfterSeconds = 60, resetTimestamp) {
    super(`Rate limit exceeded for provider ${provider}. Retry after ${retryAfterSeconds}s`, {
      provider,
      retryAfter: retryAfterSeconds,
      resetAt: resetTimestamp ? new Date(resetTimestamp * 1000).toISOString() : undefined,
    });
    this.code = 'PROVIDER_RATE_LIMITED';
  }
}
```

---

## 15. Structured Logging & Observability (Zero Leakage)

All connector interactions emit structured JSON logs via Pino, bound to the request correlation context.

### Safe Logged Fields:
`tenantId`, `userId`, `connectionId`, `provider`, `operation`, `durationMs`, `itemCount`, `hasMore`, `statusCode`, `errorCode`.

### Strictly Redacted & Forbidden Fields:
`accessToken`, `refreshToken`, `clientSecret`, `privateKey`, `installationToken`, `Authorization` headers, `Cookie` headers, raw candidate files, repository code contents.

---

## 16. Audit Logging & Compliance Boundary

Consequential connector lifecycle events emit immutable audit records to the `audit_logs` table via [`sanitizeAuditDetails`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/utils/audit-sanitizer.js):

| Event Type | Trigger | Audit Details Recorded |
| :--- | :--- | :--- |
| `connector.validated` | Health probe succeeds/fails | `provider`, `externalAccountId`, `status`, `durationMs` |
| `connector.refreshed` | Credential refresh succeeds | `provider`, `keyVersion`, `expiresAt` |
| `connector.refresh_failed` | Credential refresh fails | `provider`, `errorCode`, `reason` |
| `connector.disconnected` | User disconnects connection | `provider`, `externalAccountId` |
| `connector.revoked` | Provider revokes access | `provider`, `externalAccountId`, `reason` |

---

## 17. Comprehensive Testing Strategy

To ensure hermetic, fast, and secure test execution across all environments:

### 17.1 Unit Tests (`tests/unit/`)
- **Registry Tests**: Validate provider registration, duplicate prevention, connector resolution, and unsupported provider errors.
- **Capability Tests**: Validate capability flag inheritance and `UnsupportedCapabilityError` throwing.
- **Error Mapping Tests**: Verify vendor HTTP errors translate accurately into `AppError` subclasses with correct HTTP status codes.
- **Dummy/Mock Connector**: Author a hermetic in-memory `MockResourceConnector` for testing interface compliance without external I/O.

### 17.2 Mocked Provider HTTP Tests
- Provider adapters in Phase 3+ will use mock HTTP servers or interceptors (`nock` / native mock dispatchers) to simulate vendor responses (pagination, rate limits, 500 errors).
- **Hard Rule**: Standard unit and integration test runs NEVER make live network requests to GitHub, Google, or Notion.

### 17.3 Integration Tests (`tests/integration/`)
- Test real PostgreSQL interactions with `resource_connections` and `audit_logs` using encrypted credentials and tenant isolation checks.

---

## 18. Dependency & SDK Strategy

- **Phase 2 (P2-004)**: Zero new external dependencies. The core abstraction, registry, mock connector, and error models use native Node.js ESM.
- **Phase 3 (P3-001 to P3-006)**: Introduce `@octokit/rest` and `@octokit/app` strictly scoped to the GitHub connector implementation.
- **Future Connectors**: Vendor SDKs are isolated into their respective connector sub-packages to prevent dependency bloat in the core platform.

---

## 19. Connector Lifecycle State Machine

```
              ┌─────────────────────────┐
              │         PENDING         │ (Connection initiated, awaiting validation)
              └────────────┬────────────┘
                           │ validate() succeeds
                           ▼
              ┌─────────────────────────┐
              │         ACTIVE          │ ◄─────────────────────────┐
              └──────┬────────────┬─────┘                           │
                     │            │                                 │ refreshCredentials()
   validate() fails  │            │ Token expires                   │ succeeds
   (temporary error) │            │ (expires_at reached)            │
                     ▼            ▼                                 │
              ┌────────────┐┌────────────┐                          │
              │   ERROR    ││  EXPIRED   │──────────────────────────┘
              └──────┬─────┘└─────┬──────┘
                     │            │
                     │            │ Upstream 401 / Revocation Webhook
                     ▼            ▼
              ┌─────────────────────────┐
              │         REVOKED         │ (Upstream access terminated)
              └────────────┬────────────┘
                           │ User clicks "Disconnect"
                           ▼
              ┌─────────────────────────┐
              │      DISCONNECTED       │ (Credentials overwritten with scrubbed data)
              └─────────────────────────┘
```

---

## 20. Open Architectural Decisions & Resolutions

1. **Should connectors manage database transactions?**
   * *Resolution*: **No.** Connectors are pure stateless I/O adapters. Persistence, database transactions, and audit logging belong in orchestrating service layers (`ConnectionService`).
2. **How are long-running sync operations handled?**
   * *Resolution*: Connectors return cursor-based batches. Background ingestion workers in Phase 4 manage iteration and job state.
3. **Should connector instances be singletons or per-request instantiations?**
   * *Resolution*: **Stateless Singletons.** Connectors hold no instance-level credential state; `credentials` and `context` are passed per method invocation.

---

## 21. Architectural Recommendation & Approval Gate

### Final Recommendation: **`P2-004A APPROVED`**

The proposed architecture:
1. Decouples third-party vendor details from the core platform and career engine.
2. Enforces strict multi-tenant isolation and credential transient memory boundaries.
3. Provides a clean capability model and opaque cursor pagination contract.
4. Seamlessly prepares the foundation for Phase 3 (GitHub App integration).
5. Introduces zero unapproved dependencies or schema modifications.

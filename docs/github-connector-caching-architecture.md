# Architecture & Security Specification: GitHub Connector Caching & Rate-Limit Layer (`P3-006A`)

**Document ID**: `ARCH-P3-006A`  
**Task Reference**: `P3-006A`  
**Status**: APPROVED  
**Target Implementation**: `P3-006` (`src/connectors/github/cache.js`, `src/connectors/github/rate-limiter.js`, & `GitHubAppConnector`)  
**Parent Framework**: `BaseResourceConnector` ([`src/connectors/base/resource-connector.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/connectors/base/resource-connector.js))  
**Authentication Infrastructure**: `GitHubAppAuthManager` ([`src/connectors/github/auth.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/connectors/github/auth.js))  
**Webhook Synchronization**: `GitHubWebhookService` ([`src/services/github-webhook.service.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/services/github-webhook.service.js))  

---

## 1. Executive Summary & Problem Statement

GitHub App installations are granted a primary REST API quota of **5,000 requests per hour per installation**. In Phases 4 and 5, AI career agents and skill extraction crawlers will perform deep repository scans—fetching directory trees, `package.json` manifests, language statistics, commit histories, and READMEs. Without an intelligent caching layer:
1. Exploratory crawls on multi-repository candidate portfolios will exhaust rate limits rapidly.
2. Identical manifests, trees, and language statistics will be repeatedly re-fetched and re-parsed across agent steps.
3. Network latency for static or rarely changing assets will degrade user experience.

Task **P3-006** introduces an in-memory, tenant-partitioned **GitHub Connector Caching & Rate-Limit Tracking Layer** that leverages standard HTTP `ETag` / `If-None-Match` conditional requests. When a resource is unchanged, GitHub returns **`304 Not Modified`** without transmitting the response body and with minimal/zero quota consumption.

---

## 2. Core Architectural & Security Invariants

### 2.1. What Data Can Safely Be Cached
* **Allowed in Cache (Strictly Normalized Domain Payloads)**:
  - Account metadata (`NormalizedAccount`)
  - Repository listings (`PaginatedResult<NormalizedResource>`)
  - Repository metadata (`NormalizedResource`)
  - Language breakdowns (`NormalizedLanguageBreakdown`)
  - Directory trees (`NormalizedDirectoryTree`) (max 1,000 entries)
  - Decoded README markdown (`NormalizedReadme`) (max 256 KB)
  - Scrubbed commit histories (`PaginatedResult<NormalizedCommit>`) (author email already stripped)
  - Normalized manifest text (`NormalizedFileContent`) (max 1 MB)
  - Upstream `ETag` string (e.g. `W/"6173276..."`) and timestamp metadata
* **Strictly Prohibited from Cache**:
  - Authentication tokens (`ghs_*`), user session tokens, App JWTs, RSA private keys.
  - Personal user author emails, phone numbers, or unredacted PII.
  - Unnormalized raw GitHub response bodies.
  - Files or payloads exceeding **1 MB**.

### 2.2. Multi-Tenant Cache Partitioning & Strict Isolation
* **Deterministic Namespace**: Cache keys are strictly namespaced by `tenantId` and `installationId`:
  ```
  gh_cache:<tenantId>:<installationId>:<operation>:<resourceId>:<paramsHash>
  ```
* **Isolation Guarantee**: The cache lookup engine enforces `tenantId` equality. Tenant B cannot probe, read, invalidate, or overwrite Tenant A's cache entries under any condition.

### 2.3. HTTP `ETag` / `If-None-Match` Conditional Protocol
* **Conditional Request Flow**:
  1. Caller invokes connector operation (e.g., `getFileContent(context, credentials, repoId, 'package.json')`).
  2. Cache lookup checks for an unexpired entry:
     - **Fresh Cache Hit (Within TTL)**: Returns cached normalized model immediately without network egress.
     - **Stale Cache Hit (Expired TTL but has `ETag`)**: Dispatches HTTP request with `If-None-Match: <etag>`.
     - **Cache Miss (No entry or no `ETag`)**: Dispatches standard HTTP request.
  3. GitHub Response Handling:
     - **`304 Not Modified`**: GitHub confirms content is unchanged. Connector refreshes cached `lastValidatedAt` and TTL, updates rate-limit trackers, and returns the cached normalized payload without re-parsing Base64 or allocating new memory buffers.
     - **`200 OK`**: Upstream content changed. Connector parses and normalizes the new response, extracts the new `ETag` header, updates the cache entry, and returns the normalized payload.
     - **`404 Not Found`**: Evicts the stale cache entry and throws `ResourceNotFoundError`.

### 2.4. Time-To-Live (TTL) Policy Matrix

| Resource Type / Operation | Default TTL | SHA-Pinned / Immutable TTL | Revalidation Mechanism |
| :--- | :--- | :--- | :--- |
| `getAccount` | 5 minutes (300s) | N/A | Webhook invalidation / TTL |
| `listResources` | 10 minutes (600s) | N/A | `installation_repositories` webhook / TTL |
| `getResource` | 15 minutes (900s) | N/A | `ETag` revalidation / TTL |
| `getLanguages` | 30 minutes (1800s) | N/A | `ETag` revalidation / TTL |
| `getRepositoryTree` | 15 minutes (900s) | 24 hours (86400s) if tree SHA | `ETag` revalidation / TTL |
| `getReadme` | 15 minutes (900s) | 24 hours (86400s) if commit SHA | `ETag` revalidation / TTL |
| `getFileContent` | 15 minutes (900s) | 24 hours (86400s) if commit SHA | `ETag` revalidation / TTL |
| `getRecentCommits` | 5 minutes (300s) | N/A | `ETag` revalidation / TTL |

### 2.5. Memory Ceilings & LRU Eviction Policy
* **Global Capacity Limit**: Capped at **2,000 entries** globally across all tenants (~50 MB max memory footprint).
* **Per-Tenant Limit**: Capped at **500 entries** per tenant.
* **Eviction Algorithm**: Least Recently Used (LRU) eviction when capacity is reached.
* **Payload Bound**: Payloads > 1 MB are never cached.

### 2.6. Webhook-Driven Invalidation
When asynchronous webhook events arrive via [`GitHubWebhookService`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/services/github-webhook.service.js), cache entries are proactively purged:
1. `installation.deleted` / `installation.suspend`: Evicts **all** cache entries for `(tenantId, installationId)`.
2. `installation_repositories.removed`: Evicts cached `listResources` and all entries for the removed repository IDs.
3. `installation_repositories.added`: Evicts cached `listResources` and `getAccount`.
4. `push` (Code pushed to repository): Evicts tree, README, language, commit, and file content cache entries for `(tenantId, installationId, repoId)`.

### 2.7. In-Memory Rate Limit Tracking & Proactive Throttling
* **Tracked State per `(tenantId, installationId)`**:
  - `limit`: Total hourly quota (e.g. 5,000).
  - `remaining`: Remaining quota from latest `x-ratelimit-remaining` header.
  - `resetAt`: UTC Date derived from `x-ratelimit-reset` epoch header.
  - `used`: Computed `limit - remaining`.
* **Proactive Protection Thresholds**:
  - **`remaining <= 50`**: Emits `logger.warn` alert with tenant and installation details.
  - **`remaining <= 5`**: Enforces artificial delay (jittered backoff) or throws `ProviderRateLimitError` to prevent upstream 429 lockout.

---

## 3. Component Architecture & Class Design

### 3.1. `GitHubConnectorCache` (`src/connectors/github/cache.js`)
```javascript
export class GitHubConnectorCache {
  constructor({ maxEntries = 2000, maxEntriesPerTenant = 500 } = {}) { ... }

  get(tenantId, installationId, operation, resourceId, params = {}) { ... }
  set(tenantId, installationId, operation, resourceId, params, entry, ttlSeconds) { ... }
  touch(tenantId, installationId, operation, resourceId, params, ttlSeconds) { ... }
  evict(tenantId, installationId, operation = null, resourceId = null) { ... }
  evictTenant(tenantId) { ... }
  clear() { ... }
  getStats() { ... } // returns { hits, misses, revalidations304, evictions, size }
}
```

### 3.2. `GitHubRateLimiter` (`src/connectors/github/rate-limiter.js`)
```javascript
export class GitHubRateLimiter {
  constructor() { ... }

  updateFromHeaders(tenantId, installationId, headers) { ... }
  getQuota(tenantId, installationId) { ... }
  assertAvailableQuota(tenantId, installationId) { ... }
}
```

### 3.3. Cache Entry Schema
```typescript
interface CacheEntry<T> {
  data: T;                  // Normalized domain model
  etag: string | null;      // Upstream ETag header
  cachedAt: number;         // Timestamp when cached
  expiresAt: number;        // Timestamp when TTL expires
  lastValidatedAt: number;  // Timestamp of last 200/304 check
  sizeBytes: number;        // Approximate payload size in bytes
}
```

---

## 4. Observability & Safe Logging Contract

* **Log Level**: Cache operations emit structured `debug` logs:
  ```json
  {
    "level": 20,
    "provider": "GITHUB_APP",
    "tenantId": "24d53f53-780e-4431-b065-32180c354175",
    "installationId": "155430459",
    "operation": "getFileContent",
    "resourceId": "1338724502:package.json",
    "cacheStatus": "HIT" | "MISS" | "REVALIDATED_304" | "EXPIRED",
    "rateLimitRemaining": 4992
  }
  ```
* **Zero Payload Ingestion in Logs**: Cached file bodies, README strings, and tokens are never printed to Pino logs or persisted to audit tables.

---

## 5. Testing & Verification Strategy

### 5.1. Unit Tests (`tests/unit/github-cache.test.js`):
* Cache hit, miss, and TTL expiration.
* `304 Not Modified` revalidation handling (refreshes TTL without data loss).
* Multi-tenant partition isolation (Tenant B cannot read Tenant A's cached entries).
* LRU eviction upon hitting global (2,000) or per-tenant (500) capacity limits.
* Rejection of oversized payloads (> 1 MB).
* Rate limiter quota tracking and warning thresholds.

### 5.2. Integration Tests:
* End-to-end conditional GET execution through `GitHubAppConnector`.
* Webhook-triggered cache invalidation integration.

### 5.3. Live Verification (`installation_id = 155430459`):
* Execute duplicate calls to `getLanguages()` and `getFileContent('package.json')`.
* Verify first call performs network fetch with `ETag` capture.
* Verify second call hits cache / receives `304 Not Modified` with zero rate limit quota consumption.

---

## 6. Approval & Sign-Off

* **Security Invariants Confirmed**: Tenant-partitioned keys, 1MB cache item ceiling, 2,000 global LRU limit, PII/secret exclusion, HTTP 304 conditional revalidation, webhook-driven invalidation.
* **ADR Recorded**: `ADR-026` in [`docs/decisions.md`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/decisions.md).
* **Final Verdict**: **`P3-006A APPROVED`**.

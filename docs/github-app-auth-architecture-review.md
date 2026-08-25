# GitHub App Authentication & Cryptographic Key Management Architecture Review (Task P3-001A)

**Document Version**: `1.0.0`  
**Status**: `APPROVED / ARCHITECTURAL BASELINE`  
**Date**: `2026-08-21`  
**Phase**: `Phase 3 — Task P3-001A`  
**Governing Documents**: [`AGENTS.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/AGENTS.md), [`goal.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/goal.md), [`project.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/project.md), [`docs/architecture.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/architecture.md), [`docs/security.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/security.md), [`docs/decisions.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/decisions.md) (ADR-007, ADR-013, ADR-016, ADR-018, ADR-019, ADR-020).

---

## 1. Executive Summary & Purpose of the GitHub App Auth Module

In **Phase 3**, Antigravity Career Hub transitions from standard user identity authentication (GitHub OAuth 2.1) to fine-grained repository evidence extraction via **GitHub Apps**.

A GitHub App operates under a **two-tiered asymmetric cryptographic authentication model**:
1. **App-Level Authentication (RS256 JWT)**: The application authenticates as the GitHub App itself using its numeric `App ID` and an RSA `Private Key (PEM)`.
2. **Installation-Level Authentication (`ghs_*` Access Tokens)**: The application exchanges an App-level JWT for short-lived (1-hour) **Installation Access Tokens** scoped to specific user/organization installations and repository sets.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ANTIGRAVITY CAREER HUB                             │
│                                                                             │
│  ┌─────────────────────────────────┐                                        │
│  │ Environment / Secret Store      │                                        │
│  │ - GITHUB_APP_ID (numeric)       │                                        │
│  │ - GITHUB_APP_PRIVATE_KEY (PEM)  │                                        │
│  └────────────────┬────────────────┘                                        │
│                   │                                                         │
│                   ▼                                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ `src/connectors/github/auth.js` (GitHub App Auth Module)               │  │
│  │                                                                       │  │
│  │  1. Generate RS256 JWT (9-min exp, 60s clock skew buffer)             │  │
│  │  2. Partitioned In-Memory Token Cache (`tenantId:installationId:repo`) │  │
│  │  3. Auto-Refresh Window (5-min buffer prior to token expiration)      │  │
│  └────────────────┬──────────────────────────────────▲───────────────────┘  │
│                   │                                  │                      │
└───────────────────┼──────────────────────────────────┼──────────────────────┘
                    │                                  │
                    │ POST /app/installations/         │ ghs_* Installation
                    │      :id/access_tokens           │ Token (60-min TTL)
                    │ (Auth: Bearer <App-JWT>)         │
                    ▼                                  │
┌──────────────────────────────────────────────────────┴──────────────────────┐
│                              GITHUB API (REST)                              │
│                                                                             │
│  - App JWT Validation (Public Key Verification on GitHub)                   │
│  - Installation Scope & Permission Enforcement                              │
│  - Minting of `ghs_*` Installation Access Token                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

Because the GitHub App Private Key is the **master cryptographic root** for all GitHub App installations across the platform, strict security controls and architectural invariants must govern its ingestion, memory residency, JWT signing, token caching, and rate limiting.

---

## 2. GitHub App Identity & Environment Configuration

### 2.1. Environment Variables Schema
All GitHub App configuration parameters are strongly typed and validated at application startup using Zod in [`src/config/env.js`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/config/env.js):

| Variable Name | Type | Sensitivity | Description |
| :--- | :--- | :--- | :--- |
| `GITHUB_APP_ID` | `z.coerce.number().int().positive()` | Public / Non-Secret | Numeric App ID assigned by GitHub upon App creation (e.g. `1234567`). |
| `GITHUB_APP_SLUG` | `z.string().min(1)` | Public / Non-Secret | URL-friendly slug for the GitHub App (e.g. `antigravity-career-hub`). |
| `GITHUB_APP_CLIENT_ID` | `z.string().min(1)` | Public / Non-Secret | App OAuth Client ID used for installation linking flows (P3-002). |
| `GITHUB_APP_CLIENT_SECRET` | `z.string().min(1)` | **SECRET** | App OAuth Client Secret used for code exchange (P3-002). |
| `GITHUB_APP_PRIVATE_KEY` | `z.string().min(100)` | **CRITICAL SECRET** | RSA Private Key PEM string or Base64-encoded PEM. |
| `GITHUB_APP_WEBHOOK_SECRET`| `z.string().min(16)` | **SECRET** | Secret string used to verify `X-Hub-Signature-256` HMAC signatures (P3-003). |

### 2.2. Production vs. Development Enforcing
* In `production` (`NODE_ENV=production`), `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` are **strictly required**. Missing values cause an immediate fatal startup exit (`MISSING_CONFIG`).
* In `development`/`test`, optional mock fallbacks enable isolated unit testing without live GitHub credentials.

---

## 3. Private Key PEM Security, Storage, Ingestion, and Lifecycle

### 3.1. Master Secret Classification
* **Application-Level Master Key**: The GitHub App Private Key belongs exclusively to the platform host environment. It is **NEVER** stored in PostgreSQL, never committed to Git, never passed to client browsers, and never serialized into audit logs.
* **Database Isolation**: The `resource_connections` table stores only *tenant-specific installation metadata* (`installation_id`, encrypted refresh tokens or transient installation tokens encrypted with AES-256-GCM). It **never** contains the App Private Key.

### 3.2. Formats & Ingestion Support
To eliminate newline/carriage-return corruption when passing PEM blocks across environment variables, CI secrets (GitHub Actions), or container orchestrators (Docker, Kubernetes), the module accepts two formats:

1. **Standard Multiline PEM**:
   ```
   -----BEGIN RSA PRIVATE KEY-----
   MIIEowIBAAKCAQEA...
   -----END RSA PRIVATE KEY-----
   ```
2. **Base64-Encoded PEM**: Single-line string containing the base64 representation of the PEM block (`GITHUB_APP_PRIVATE_KEY_BASE64` or base64-encoded `GITHUB_APP_PRIVATE_KEY`).

### 3.3. Key Normalization & Validation Helper
```javascript
/**
 * Normalizes and validates an RSA private key PEM block.
 *
 * @param {string} rawKey - Raw PEM or base64-encoded PEM
 * @returns {import('node:crypto').KeyObject} Validated native KeyObject
 * @throws {CryptoError} If key format is invalid or unsupported
 */
export function normalizeAppPrivateKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') {
    throw new CryptoError('GitHub App private key is required', 'MISSING_PRIVATE_KEY');
  }

  let pemString = rawKey.trim();

  // If base64 encoded without PEM headers, decode it
  if (!pemString.includes('-----BEGIN')) {
    try {
      pemString = Buffer.from(pemString, 'base64').toString('utf8');
    } catch {
      throw new CryptoError('Failed to base64-decode private key', 'INVALID_PRIVATE_KEY');
    }
  }

  // Handle literal escaped newlines ("\n") often present in env vars
  pemString = pemString.replace(/\\n/g, '\n');

  try {
    const keyObject = crypto.createPrivateKey({
      key: pemString,
      format: 'pem',
    });

    if (keyObject.asymmetricKeyType !== 'rsa') {
      throw new CryptoError(
        `Invalid key type '${keyObject.asymmetricKeyType}'. RSA 2048+ is required.`,
        'INVALID_KEY_TYPE'
      );
    }

    return keyObject;
  } catch (err) {
    throw new CryptoError(
      'GitHub App private key validation failed: ' + err.message,
      'INVALID_PRIVATE_KEY'
    );
  }
}
```

### 3.4. Zero Leakage & Log Redaction
* [`src/utils/logger.js`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/utils/logger.js) strictly redacts all instances of `privateKey`, `pem`, `GITHUB_APP_PRIVATE_KEY`, `jwt`, and `token` across all log streams.
* Error objects returned to clients or logged to Pino sanitize stack traces and exclude raw key representations.

---

## 4. GitHub App JWT (JSON Web Token) Generation & RFC 7519 Specification

### 4.1. JWT Claim Structure
To authenticate against GitHub API endpoints (such as `GET /app` or `POST /app/installations/:id/access_tokens`), the server signs an RS256 JWT containing RFC 7519 claims:

```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT"
  },
  "payload": {
    "iat": 1787299000,
    "exp": 1787299540,
    "iss": 1234567
  }
}
```

### 4.2. Timing Invariants & Clock Skew
* **`iat` (Issued At)**: Set to `Math.floor(Date.now() / 1000) - 60` (**60-second backdated buffer**) to prevent rejection due to minor clock skew between server and GitHub API servers.
* **`exp` (Expiration)**: Set to `iat + 540` (**9 minutes total validity**). GitHub enforces a hard 10-minute maximum expiration for App JWTs. Setting 9 minutes ensures tokens are never rejected for exceeding the 10-minute boundary.
* **`iss` (Issuer)**: Must be the numeric `GITHUB_APP_ID`.

### 4.3. Native Cryptographic Signing
Signing is performed via native Node.js `node:crypto`:
```javascript
export function generateAppJwt(appId, privateKeyObject) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60,       // 60-second clock skew buffer
    exp: now + (9 * 60), // 9-minute lifetime (under 10-min GitHub limit)
    iss: appId,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const message = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  const signature = signer.sign(privateKeyObject, 'base64url');

  return `${message}.${signature}`;
}
```

---

## 5. Installation Access Token (`ghs_*`) Minting, Scoping, and Lifecycle

### 5.1. Token Minting Request
To perform operations on behalf of an installation, the server requests an Installation Access Token:
* **HTTP Method**: `POST`
* **URL**: `https://api.github.com/app/installations/:installation_id/access_tokens`
* **Headers**:
  ```http
  Authorization: Bearer <APP_JWT>
  Accept: application/vnd.github+json
  X-GitHub-Api-Version: 2022-11-28
  User-Agent: Antigravity-Career-Hub/0.1.0
  ```
* **Optional Request Body (Least-Privilege Scoping)**:
  ```json
  {
    "repositories": ["repo-name-1", "repo-name-2"],
    "permissions": {
      "contents": "read",
      "metadata": "read"
    }
  }
  ```

### 5.2. GitHub Response Envelope
```json
{
  "token": "ghs_16C7e42F292c6912E7710c838347Ae178B4a",
  "expires_at": "2026-08-21T14:32:00Z",
  "permissions": {
    "contents": "read",
    "metadata": "read"
  },
  "repository_selection": "selected"
}
```

### 5.3. Token Characteristics
* **Prefix**: Always starts with `ghs_` (GitHub App Installation Access Token).
* **Lifetime**: Exactly **60 minutes (1 hour)** from creation.
* **Stateless Revocation**: Invalidated immediately if the GitHub App is uninstalled from the account or organization.

---

## 6. In-Memory Token Caching & Multi-Tenant Partitioning

Minting a new installation token on every individual API call would quickly exhaust GitHub App creation rate limits and add unnecessary 200ms+ round-trip latency. Therefore, installation tokens are cached in memory.

### 6.1. Cache Key Partitioning Strategy
To prevent any possibility of cross-tenant token leakage or cross-installation pollution in multi-tenant memory:
```
CacheKey = `gh_token:${tenantId}:${installationId}:${repoScopeHash}`
```
* **`tenantId`**: Ensures strict tenant memory isolation.
* **`installationId`**: Isolates different customer GitHub accounts.
* **`repoScopeHash`**: SHA-256 hash of sorted repository IDs requested.

### 6.2. Invalidation & Buffer Window
* **Expiration Calculation**: Cache TTL is set to `expiresAt - 300_000ms` (**5-minute safety buffer**).
* If a request occurs when remaining token lifetime is less than 5 minutes, the cache treats it as a miss and mints a fresh token.

```
Token Minted (T=0) ──────────────────────────► Expiration (T=60m)
                     [ Valid Cache Window: T=0 to T=55m ] ──► [ 5m Buffer: Mint Fresh Token ]
```

---

## 7. Token Refresh, Invalidation, and Upstream Revocation Protocol

### 7.1. Seamless Lazy Refresh
The auth module encapsulates token resolution:
```javascript
const token = await githubAppAuth.getInstallationToken({
  tenantId: req.tenant.id,
  installationId: connection.installationId,
  repositories: selectedRepos,
});
```
If cached and valid -> returned immediately from memory (0ms).  
If expired or missing -> App JWT generated, GitHub API called, fresh token cached and returned.

### 7.2. Upstream Explicit Revocation (`POST /connections/:id/disconnect`)
When a user disconnects their connection, the auth service executes upstream token revocation:
* **HTTP Method**: `DELETE`
* **URL**: `https://api.github.com/installation/token`
* **Headers**: `Authorization: Bearer ghs_...`
* **Status**: 204 No Content.
* **Post-Action**: Evicts cache entry and overwrites stored `resource_connections.encrypted_credentials` with scrubbed dummy payload.

---

## 8. GitHub App API Permissions, Scopes, and Repository Boundary

### 8.1. App Manifest Permissions
The GitHub App manifest defines least-privilege permissions:

| Permission Category | Level | Justification |
| :--- | :--- | :--- |
| **Repository Contents** (`contents`) | `read` | Mandatory for reading repository file trees, commit history, `package.json`, `go.mod`, `Cargo.toml`, and source code to build candidate evidence graphs. |
| **Repository Metadata** (`metadata`) | `read` | Mandatory for listing repository names, stars, primary language, topics, and descriptions. |
| **Pull Requests** (`pull_requests`) | `write` | Optional / On-Demand for Phase 9 automated candidate project adaptation workflows. (Default: disabled during read-only scanning). |
| **Issues / Discussions** | `none` | Not requested. |
| **Members / Administration** | `none` | Not requested. |

### 8.2. Repository Selection Enforcement
* **`selected` (Default)**: Users explicitly choose which repositories Antigravity Career Hub can access during the GitHub App installation modal.
* The application **never** requires or assumes `all` repository access.

---

## 9. Private Key Rotation Protocol (Zero-Downtime Multi-Key Support)

GitHub supports up to **two simultaneous active private keys** per GitHub App.

```
Step 1: GitHub Settings -> Generate Key 2 (Both Key 1 & Key 2 valid on GitHub)
Step 2: Antigravity Career Hub Config -> Update GITHUB_APP_PRIVATE_KEY to Key 2
Step 3: Verification -> Server generates JWTs with Key 2; GitHub validates successfully
Step 4: GitHub Settings -> Revoke / Delete Key 1
```

* **Zero Customer Disruption**: Ongoing installation tokens (`ghs_*`) remain valid until their 60-minute natural expiry.
* **Zero Database Updates Needed**: Since the App Private Key is not stored in PostgreSQL, rotation requires only an environment configuration update.

---

## 10. Failure Modes, Error Mapping & Fallback Behavior

| Upstream GitHub Response | Cause | Connector Error Mapping | Database Status Mutation |
| :--- | :--- | :--- | :--- |
| `401 Unauthorized` (`Bad credentials`) | Invalid App JWT, revoked private key, or expired token | `ConnectorAuthError` (401) | Mutates status to `REVOKED`, sets `last_error_code = 'CONNECTOR_AUTH_FAILED'` |
| `404 Not Found` (`Installation not found`) | User uninstalled App from GitHub Settings | `ConnectionNotFoundError` (404) / `ConnectorAuthError` | Mutates status to `REVOKED`, evicts cache |
| `403 Forbidden` (`Resource not accessible by integration`) | Repository not included in App installation selection | `AuthorizationError` (403) | Preserves connection, flags repository as inaccessible |
| `429 Too Many Requests` / `403 Rate Limited` | GitHub secondary or primary rate limit reached | `RateLimitError` (429) | Preserves credentials, sets `last_error_code = 'RATE_LIMITED'` |
| `500, 502, 503, 504` | GitHub API outage or network timeout | `ProviderUnavailableError` (503) | Mutates status to `ERROR`, enables retry with exponential backoff |

---

## 11. GitHub API Rate Limits, Quota Management & Backoff

### 11.1. Rate Limit Allocation
* **Installation Rate Limit**: 5,000 requests per hour per installation for user accounts; scales up to 12,500+ requests per hour for organization accounts with >20 repositories.
* **App JWT Endpoints**: `POST /app/installations/:id/access_tokens` is limited to 100 requests per minute per App.

### 11.2. Proactive Header Inspection & Backoff
All responses from `api.github.com` inspect:
* `x-ratelimit-limit`: Total quota
* `x-ratelimit-remaining`: Remaining requests
* `x-ratelimit-reset`: UTC epoch timestamp when quota resets
* `retry-after`: Seconds to wait (for secondary rate limits)

If `x-ratelimit-remaining <= 10`, the connector automatically defers background scanning tasks until `x-ratelimit-reset`.

---

## 12. Audit Logging & Zero-Leakage Invariants

Every lifecycle event in the GitHub App auth subsystem emits structured audit records:

| Event Type | Sanitized Details Stored | Forbidden Details (Zero-Leakage) |
| :--- | :--- | :--- |
| `github_app.token_minted` | `{ installationId, repoCount, expiresAt }` | `token` (`ghs_*`), `jwt`, `privateKey` |
| `github_app.token_revoked` | `{ installationId, reason }` | `token`, `encryptedCredentials` |
| `github_app.auth_failed` | `{ installationId, statusCode, errorCode }` | `privateKey`, request authorization header |
| `github_app.rate_limited` | `{ installationId, remaining, resetTime }` | caller identity payloads |

---

## 13. Implementation Blueprint for Task P3-001 (`src/connectors/github/auth.js`)

Task P3-001 will implement the following modular components:

```
src/connectors/github/
├── auth.js              # GitHubAppAuthManager (JWT minting, installation token exchange, caching)
├── errors.js            # GitHub-specific error mapping & rate limit parsing
└── index.js             # GitHub connector module export
```

### Core Interface Contract (`GitHubAppAuthManager`)
```javascript
export class GitHubAppAuthManager {
  constructor({ appId, privateKey, cache = new Map(), fetchFn = fetch }) {
    this.appId = appId;
    this.privateKey = normalizeAppPrivateKey(privateKey);
    this.tokenCache = cache;
    this.fetch = fetchFn;
  }

  /**
   * Generates a signed RS256 App JWT (valid for 9 minutes).
   * @returns {string} App JWT
   */
  getAppJwt() { ... }

  /**
   * Resolves a cached or fresh Installation Access Token.
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string|number} params.installationId
   * @param {string[]} [params.repositories]
   * @returns {Promise<{ token: string, expiresAt: Date, permissions: object }>}
   */
  async getInstallationToken({ tenantId, installationId, repositories }) { ... }

  /**
   * Revokes an installation token upstream and evicts cache.
   * @param {string} tenantId
   * @param {string|number} installationId
   * @returns {Promise<boolean>}
   */
  async revokeInstallationToken(tenantId, installationId) { ... }
}
```

---

## 14. Security Threat Model & Mitigations for GitHub App Credentials

| Threat ID | Threat Scenario | Mitigation Strategy |
| :--- | :--- | :--- |
| **TH-GH-01** | Compromise of App Private Key in Git repository | Private key is stored strictly in environment variables / secrets managers. Enforced by `.gitignore`, CI secret scanners, and pre-commit hooks. |
| **TH-GH-02** | Exposure of App Private Key via logs / stack traces | Redacted in Pino structured logger (`logger.js`). Never attached to error message strings or AppError metadata. |
| **TH-GH-03** | Installation Token Stolen from Memory / Cross-Tenant Pollution | Token cache keys partitioned by `tenantId`. Cache values expire within 55 minutes. Memory is not shared across isolated server instances. |
| **TH-GH-04** | Expired Token Used for In-Flight Scan Operations | 5-minute safety buffer refreshes token proactively before actual expiration. |
| **TH-GH-05** | Unauthorized Repository Access Beyond User Grant | Explicit repository scoping parameter (`repositories: [...]`) passed during installation token minting. |
| **TH-GH-06** | Clock Skew JWT Rejection | JWT `iat` backdated by 60 seconds; `exp` capped at 9 minutes. |

---

## 15. Summary of Architecture Recommendations for P3-001

1. **Native Cryptography First**: Use Node.js built-in `node:crypto` (`createSign`, `createPrivateKey`) for zero-dependency, high-performance RS256 JWT generation.
2. **Deterministic Partitioned Caching**: Implement in-memory token caching with tenant-scoped keys and 5-minute proactive refresh buffer.
3. **Strict Error Taxonomy**: Map GitHub HTTP response codes (401, 403, 404, 429, 503) directly into Antigravity Career Hub standard error taxonomy (`ConnectorAuthError`, `RateLimitError`, `ProviderUnavailableError`).
4. **Comprehensive Unit & Mock Testing**: Provide a complete test suite with synthetic RSA 2048 key generation (`crypto.generateKeyPairSync`) and mock HTTP fetchers for deterministic, offline verification.

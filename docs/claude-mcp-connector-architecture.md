# ARCH-037: Claude Remote MCP Custom Connector & OAuth 2.1 Integration Architecture Specification

**Status**: IMPLEMENTED & VERIFIED (Task P10-001 & RFC 8707 Compatibility Patch)  
**Security Level**: Critical Public Perimeter & OAuth 2.1 Authorization Boundary  
**Target AI Client**: Anthropic Claude (Claude.ai Web, Claude Desktop, Claude Code CLI)  
**Governing Standard**: Model Context Protocol (MCP) Streamable HTTP Spec 2026-07-28, RFC 6749, RFC 7636, RFC 8414, RFC 8707 (Resource Indicators for OAuth 2.0), RFC 9700 (OAuth 2.1 / BCP), RFC 9728 (Protected Resource Metadata), RFC 8252 (OAuth 2.0 for Native Apps)  
**Governing ADR**: ADR-058 (`docs/decisions.md`)  

---

## 1. Executive Summary & Strategic Context

In Phases 7 through 9, Career Hub established a provider-neutral Remote Model Context Protocol (MCP) server supporting:
1. **Candidate Read Tools**: `get_candidate_profile`, `get_verified_evidence`, `get_job_match_analysis`.
2. **Application Artifact Tools**: `generate_tailored_resume`, `generate_cover_letter`, `get_portfolio_recommendations`.
3. **Approved GitHub Write Tools**: `propose_project_improvement`, `confirm_and_create_pr` with diff previews, test execution reporting, cryptographic patch fingerprinting, and centralized safety gating.

**Phase 10 (Task P10-001 & Compatibility Patch)** defines and implements the architectural, security, and external integration boundary for connecting **Anthropic Claude** as the second major target AI client to the existing Remote MCP server over **Public HTTPS** using **OAuth 2.1 + RFC 8707 Resource Indicators**.

```
+--------------------------------------------------------------------------------------------------+
|                                    CLAUDE MCP INTEGRATION TOPOLOGY                               |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|   +--------------------------+              +------------------------------------------------+   |
|   |   Anthropic Claude       |              |   Career Hub Public Perimeter (HTTPS)          |   |
|   |   - Claude.ai (Web)      |              |   - TLS 1.2+ Termination                       |   |
|   |   - Claude Desktop       |              |   - Origin Header Validation (Anti-Rebinding)  |   |
|   |   - Claude Code (CLI)    |              |   - Rate Limiter & DDoS Mitigation             |   |
|   +-------------+------------+              +-----------------------+------------------------+   |
|                 |                                                   |                            |
|                 | 1. Discovery (401 + RFC 9728 Metadata)            |                            |
|                 +-------------------------------------------------->|                            |
|                 |                                                   |                            |
|                 | 2. OAuth 2.1 + RFC 8707 (resource param) Flow     |                            |
|                 +-------------------------------------------------->|                            |
|                 |    GET  /oauth/authorize?resource=...             |                            |
|                 |    POST /oauth/token     (resource binding)       |                            |
|                 |                                                   v                            |
|                 | 3. Streamable HTTP JSON-RPC (Bearer Token)   +----+------------------------+   |
|                 +--------------------------------------------->|   OAuth 2.1 Auth Middleware |   |
|                                                                +--------------+--------------+   |
|                                                                               |                  |
|                                                                               v                  |
|                                                                +--------------+--------------+   |
|                                                                | Immutable McpRequestContext |   |
|                                                                | (tenantId, userId, scopes)  |   |
|                                                                +--------------+--------------+   |
|                                                                               |                  |
|                                                                               v                  |
|                                                                +--------------+--------------+   |
|                                                                | Career Hub MCP Tools        |   |
|                                                                | - Read & Artifact Tools     |   |
|                                                                | - Approved Write Tools      |   |
|                                                                +--------------+--------------+   |
|                                                                               |                  |
|                                                                               v                  |
|                                                                +--------------+--------------+   |
|                                                                | GitHubWriteSafetyService    |   |
|                                                                | & Approval State Machine    |   |
|                                                                +-----------------------------+   |
+--------------------------------------------------------------------------------------------------+
```

---

## 2. Core Architectural Decisions

### 2.1 Provider-Neutral Architecture (Zero Business Logic Mutation)
- The MCP layer, domain services, career intelligence engine, and GitHub safety kernel remain 100% provider-neutral.
- Claude connects strictly as an **external MCP client** via standardized Streamable HTTP JSON-RPC.
- Zero modifications to AI provider adapters (`GeminiProviderAdapter`, `GeminiVertexAdapter`); Claude is a consuming client, not an internal AI backend.

### 2.2 OAuth 2.1 Facade in Front of Unified Security Layer
- We adopt an **OAuth 2.1 Authorization Server Facade** built into Career Hub that operates alongside the existing personal API token (`mcp_token_*`) system.
- **Dual Ingestion**:
  1. **Personal API Tokens** (`mcp_live_*`, `mcp_test_*`): Used by local scripts and developers.
  2. **OAuth 2.1 Bearer Tokens** (JWTs / Opaque Access Tokens): Used by Claude and third-party remote clients.
- Both paths converge into the exact same immutable, frozen `McpRequestContext` (`{ tenantId, userId, role, tokenScopes, authMethod, clientInfo }`).

### 2.3 Strict Authorization Code Flow with PKCE (RFC 7636 / RFC 9700)
- Mandatory `code_challenge_method=S256`. Plain text PKCE (`method=plain`) is strictly rejected.
- Implicit grants (`response_type=token`) and Resource Owner Password Credentials (ROPC) are permanently disabled.
- Authorization codes are single-use, cryptographically random (256-bit entropy), bound to the client ID, tenant ID, user ID, redirect URI, resource indicator, and code challenge, with a maximum TTL of 5 minutes (300 seconds).

### 2.4 RFC 8707 Resource Indicators for OAuth 2.0 / MCP Compatibility
- Official MCP authorization specification requires RFC 8707 Resource Indicators to bind tokens and authorization requests to the specific MCP endpoint:
  1. Claude transmits `resource=https://<public-mcp-host>/mcp` on `GET /oauth/authorize`.
  2. Server canonicalizes and validates `resource` against configured MCP resource URL (`getExpectedResourceUrl()`), rejecting mismatches with standard RFC 8707 error code `invalid_target` (HTTP 400).
  3. Single-use authorization codes are cryptographically and relationally bound to the canonical `resource` column in `oauth_authorization_codes`.
  4. Token exchange (`POST /oauth/token`) verifies `resource` parameter equality with authorization code binding and stores bound `resource` in `oauth_tokens`.
  5. `authenticateMcpRequest()` verifies that incoming OAuth Bearer access tokens are bound to the current MCP server audience/resource.

### 2.5 Protected Resource & Authorization Server Metadata Discovery
- When an unauthenticated client connects to `POST /mcp`, the server returns `401 Unauthorized` with:
  ```http
  WWW-Authenticate: Bearer realm="mcp", resource_metadata="https://api.careerhub.example.com/.well-known/oauth-protected-resource"
  ```
- Exposes standard discovery documents:
  1. `/.well-known/oauth-protected-resource` (RFC 9728) with `resource` indicator.
  2. `/.well-known/oauth-authorization-server` (RFC 8414) with `resource_indicators_supported: true`.
  3. `/.well-known/jwks.json` (RFC 7517).

---

## 3. Anthropic Claude Client Requirements & Protocol Matrix

| Parameter | Claude.ai (Web) | Claude Desktop (Native) | Claude Code (CLI) |
| :--- | :--- | :--- | :--- |
| **Transport** | Streamable HTTP (`POST /mcp`, `GET /mcp`) | Streamable HTTP / Stdio Proxy | Streamable HTTP / Stdio Proxy |
| **Auth Type** | OAuth 2.1 Authorization Code + PKCE | OAuth 2.1 Authorization Code + PKCE | OAuth 2.1 Authorization Code + PKCE |
| **PKCE Challenge** | `S256` Mandatory | `S256` Mandatory | `S256` Mandatory |
| **Redirect URI** | `https://claude.ai/api/mcp/auth_callback` | `http://localhost:<port>/callback` | `http://localhost:<port>/callback` |
| **Redirect Matching** | Strict String Equality | Loopback Port-Agnostic (RFC 8252) | Loopback Port-Agnostic (RFC 8252) |
| **Client Type** | Public Client (`client_id: claude-web`) | Public Client (`client_id: claude-desktop`) | Public Client (`client_id: claude-cli`) |
| **Client Secret** | None (PKCE S256 protected) | None (PKCE S256 protected) | None (PKCE S256 protected) |
| **Token Transport** | `Authorization: Bearer <token>` | `Authorization: Bearer <token>` | `Authorization: Bearer <token>` |
| **Query Token** | Prohibited (400 Bad Request) | Prohibited (400 Bad Request) | Prohibited (400 Bad Request) |

---

## 4. Discovery Documents & Endpoints Specification

### 4.1 Protected Resource Metadata (`/.well-known/oauth-protected-resource`)
```json
{
  "resource": "https://api.careerhub.example.com/mcp",
  "authorization_servers": [
    "https://api.careerhub.example.com"
  ],
  "scopes_supported": [
    "career:read",
    "career:write"
  ],
  "bearer_methods_supported": [
    "header"
  ],
  "resource_documentation": "https://docs.careerhub.example.com/mcp"
}
```

### 4.2 OAuth 2.1 Authorization Server Metadata (`/.well-known/oauth-authorization-server`)
```json
{
  "issuer": "https://api.careerhub.example.com",
  "authorization_endpoint": "https://api.careerhub.example.com/oauth/authorize",
  "token_endpoint": "https://api.careerhub.example.com/oauth/token",
  "revocation_endpoint": "https://api.careerhub.example.com/oauth/revoke",
  "jwks_uri": "https://api.careerhub.example.com/.well-known/jwks.json",
  "response_types_supported": [
    "code"
  ],
  "response_modes_supported": [
    "query"
  ],
  "grant_types_supported": [
    "authorization_code",
    "refresh_token"
  ],
  "code_challenge_methods_supported": [
    "S256"
  ],
  "scopes_supported": [
    "career:read",
    "career:write"
  ],
  "token_endpoint_auth_methods_supported": [
    "none"
  ],
  "service_documentation": "https://docs.careerhub.example.com/oauth"
}
```

---

## 5. End-to-End OAuth 2.1 Authorization & Token Lifecycle

```
Claude Client                      User Browser                   Career Hub OAuth Server             MCP Server
    |                                   |                                   |                             |
    | 1. Connect without token          |                                   |                             |
    +---------------------------------------------------------------------------------------------------->|
    | 2. 401 Unauthorized (resource_metadata header)                        |                             |
    |<----------------------------------------------------------------------------------------------------+
    |                                   |                                   |                             |
    | 3. Fetch .well-known metadata     |                                   |                             |
    +---------------------------------------------------------------------->|                             |
    | 4. Return metadata JSON           |                                   |                             |
    |<----------------------------------------------------------------------+                             |
    |                                   |                                   |                             |
    | 5. Open Auth URL with PKCE S256   |                                   |                             |
    |    (client_id, redirect_uri, scope, state, code_challenge)           |                             |
    +---------------------------------->|                                   |                             |
    |                                   | 6. GET /oauth/authorize           |                             |
    |                                   +---------------------------------->|                             |
    |                                   | 7. Authenticate User & Consent UI |                             |
    |                                   |<----------------------------------+                             |
    |                                   | 8. User approves consent          |                             |
    |                                   +---------------------------------->|                             |
    |                                   | 9. Redirect with code & state     |                             |
    |                                   |<----------------------------------+                             |
    | 10. Capture Auth Code             |                                   |                             |
    |<----------------------------------+                                   |                             |
    |                                                                       |                             |
    | 11. POST /oauth/token (code, code_verifier, redirect_uri, client_id)   |                             |
    +---------------------------------------------------------------------->|                             |
    | 12. Verify PKCE, Issue Access Token (1h) & Refresh Token (30d)        |                             |
    |<----------------------------------------------------------------------+                             |
    |                                                                                                     |
    | 13. POST /mcp (Authorization: Bearer <access_token>)                                                |
    +---------------------------------------------------------------------------------------------------->|
    | 14. Mint McpRequestContext -> Execute Tool -> Return JSON-RPC Result                                |
    |<----------------------------------------------------------------------------------------------------+
```

---

## 6. Identity Mapping & Multi-Tenant Sovereign Isolation

### 6.1 Token Payload Claims Schema
```json
{
  "iss": "https://api.careerhub.example.com",
  "aud": "https://api.careerhub.example.com/mcp",
  "sub": "usr_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "tid": "ten_0b9d4ff3-16f5-492f-a782-9850f91a1621",
  "role": "MEMBER",
  "scope": "career:read career:write",
  "client_id": "claude-web",
  "jti": "tok_c1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6",
  "iat": 1787654400,
  "exp": 1787658000
}
```

### 6.2 Immutable McpRequestContext Resolution
When `authenticateMcpRequest()` validates an OAuth token:
1. Cryptographically verifies JWT signature against active RS256/EdDSA public key in JWKS (or validates opaque token in `oauth_access_tokens` table).
2. Asserts `aud === "https://api.careerhub.example.com/mcp"` and `exp > now`.
3. Validates that the referenced user and tenant exist in database and have `status: 'ACTIVE'`.
4. Clamps `tokenScopes` to user's role ceiling (`ROLE_SCOPE_CEILINGS[user.role]`).
5. Constructs and freezes `McpRequestContext`:
   ```javascript
   {
     requestId: req.id,
     tenantId: token.tid,
     userId: token.sub,
     role: user.role,
     tokenScopes: effectiveScopes,
     authMethod: 'OAUTH_BEARER',
     clientInfo: {
       clientId: token.client_id,
       userAgent: req.headers['user-agent'],
       protocolVersion: req.headers['mcp-protocol-version'] || '2026-07-28',
       ipAddress: req.ip,
     },
     authenticatedAt: new Date().toISOString(),
   }
   ```
6. **Zero Client-Supplied Trust**: Claude cannot provide or override `tenantId`, `userId`, or `role`. Cross-tenant queries fail closed with `404 Not Found`.

---

## 7. Scope & Tool Authorization Matrix

| Scope | Allowed Operations | Role Ceiling |
| :--- | :--- | :--- |
| `career:read` | `get_candidate_profile`, `get_verified_evidence`, `get_job_match_analysis`, `generate_tailored_resume`, `generate_cover_letter`, `get_portfolio_recommendations` | `READONLY`, `MEMBER`, `ADMIN`, `OWNER` |
| `career:write` | All read operations + `propose_project_improvement`, `confirm_and_create_pr` | `MEMBER`, `ADMIN`, `OWNER` |

---

## 8. Public HTTPS & Perimeter Security Architecture

### 8.1 Network & TLS Invariants
- **TLS Protocol**: TLS 1.2 and TLS 1.3 only with AEAD ciphers (`ECDHE-ECDSA-AES128-GCM-SHA256`, `ECDHE-RSA-AES128-GCM-SHA256`, `CHACHA20-POLY1305`).
- **HSTS**: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- **Public Domain**: Fully qualified public domain (`api.careerhub.example.com`).

### 8.2 Anti-SSRF & DNS Rebinding Defenses
- **Origin Header Validation**: Incoming requests to `POST /mcp` must validate that the `Origin` header (when present) matches trusted origins or Claude web client origins (`https://claude.ai`). Untrusted origins are rejected with `403 Forbidden`.
- **Host Header Validation**: Strictly enforces `Host` / `X-Forwarded-Host` matches configured server domain.
- **Request Size Limiting**: Body ceiling capped at 1 MB; prototype pollution defenses active.

### 8.3 Rate Limiting Tiering
1. **IP-Level**: 120 requests / minute per IP address.
2. **OAuth Client-Level**: 300 requests / minute per `client_id`.
3. **Tenant-Level**: 60 requests / minute across MCP tools per tenant.
4. **Tool-Specific**: Write tools limited to 10 proposals / minute and 5 confirms / minute.

---

## 9. Security Threat Model (T-01 to T-16)

| Threat ID | Threat Vector | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **T-01** | Authorization Code Interception | Rogue client exchanges stolen auth code | Mandatory PKCE `S256`. Attacker cannot produce `code_verifier` matching `code_challenge`. |
| **T-02** | Open Redirect / Callback Poisoning | Auth code leaked to attacker domain | Exact string match against registered redirect URIs (`https://claude.ai/api/mcp/auth_callback`). Port-agnostic matching restricted strictly to `localhost`/`127.0.0.1`. |
| **T-03** | Token Replay After Expiry | Attacker uses expired access token | Short token lifespan (3600s). Replay rejected with `401 Unauthorized`. |
| **T-04** | Refresh Token Replay / Theft | Attacker attempts to maintain persistence | Refresh token rotation (RTR). Using an old refresh token invalidates the entire token family. |
| **T-05** | Cross-Tenant Data Access | Attacker attempts to query foreign tenant data | Token binds `tenantId`. All queries enforce SQL `where(eq(table.tenantId, context.tenantId))` returning `404 Not Found`. |
| **T-06** | Scope Escalation via Token Request | `READONLY` user requests `career:write` | Server clamps requested scopes to `ROLE_SCOPE_CEILINGS[user.role]`. |
| **T-07** | DNS Rebinding on Remote MCP | Webpage executes local MCP RPCs | Origin header validation and Host header verification on Fastify server. |
| **T-08** | CSRF on Authorization Endpoint | User tricked into authenticating attacker session | State parameter mandatory (`state`), SameSite=Lax session cookies, CSRF tokens on consent form. |
| **T-09** | Query Parameter Token Leakage | Access token exposed in proxy access logs | Query param tokens strictly prohibited. Only `Authorization: Bearer` accepted. |
| **T-10** | Claude Self-Approval Write Loop | AI attempts to propose and confirm PR in same turn | Stopping protocol strictly enforced. Confirmation requires human boolean assertion (`confirmed: true`) and logs human user ID. |
| **T-11** | Stale Base Commit SHA Race | PR created against drifted base branch | `GitHubWriteSafetyService` asserts `liveHeadSha === ticket.expectedHeadSha`, failing closed with `409 Conflict`. |
| **T-12** | Secret Leakage in Claude Response | Outbound diff previews leak credentials | Outbound diffs scrubbed through `SecretScrubber`. Zero database or cloud credentials exposed. |
| **T-13** | Client Impersonation | Malicious client claims to be `claude-web` | PKCE protection and strict redirect URI binding prevent token delivery to malicious endpoints. |
| **T-14** | Denial of Service on Token Endpoint | Rapid brute-force token generation | Rate limiting on `/oauth/token` (20 requests / min per IP). Single-use code invalidation. |
| **T-15** | Consent Phishing | Deceptive app requests excessive permissions | Clear consent screen showing exact requested scopes and target tenant organization name. |
| **T-16** | Replay of Executed Write Action | Re-submitting confirm request duplicates commit | `GitHubWriteService` checks existing Draft PR and returns cached execution record idempotently. |

---

## 10. Audit Telemetry Catalog

| Event Type | Resource Type | Trigger | Logged Metadata |
| :--- | :--- | :--- | :--- |
| `oauth.authorize.requested` | `oauth_authorization` | User lands on `/oauth/authorize` | `clientId`, `redirectUri`, `scopes`, `clientIp` |
| `oauth.consent.granted` | `oauth_authorization` | User clicks approve on consent screen | `clientId`, `tenantId`, `userId`, `scopes` |
| `oauth.token.issued` | `oauth_token` | Successful code exchange at `/oauth/token` | `clientId`, `tenantId`, `userId`, `scopes`, `tokenType` (no raw tokens) |
| `oauth.token.refreshed` | `oauth_token` | Refresh token exchange | `clientId`, `tenantId`, `userId`, `scopes` |
| `oauth.token.revoked` | `oauth_token` | Token revoked via `/oauth/revoke` | `clientId`, `tenantId`, `userId` |
| `oauth.token.rejected` | `oauth_token` | Invalid code, PKCE mismatch, or expired token | `clientId`, `errorCode`, `reason`, `clientIp` |
| `mcp.oauth.authenticated` | `mcp_session` | Authenticated MCP request via OAuth token | `tenantId`, `userId`, `role`, `scopes`, `toolName` |

---

## 11. Testing & Verification Strategy

### 11.1 Unit Test Suite (`tests/unit/oauth-authorization-server.test.js`)
- PKCE S256 computation and verification (`verifyCodeChallenge`).
- Metadata discovery document schemas (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`).
- Authorization code generation, 5-minute expiration, and single-use invalidation.
- Access token and refresh token issuance, signing, and verification.
- Scope ceiling clamping against user role.
- Redirect URI validation (exact match for web, loopback port-agnostic for native apps).

### 11.2 Integration Test Suite (`tests/integration/claude-mcp-connector.test.js`)
- Full OAuth 2.1 flow via Fastify inject:
  1. `401 Unauthorized` challenge with `resource_metadata` header.
  2. `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`.
  3. `GET /oauth/authorize` with PKCE S256 parameters.
  4. `POST /oauth/token` code exchange for access token.
  5. `POST /mcp` `tools/list` with OAuth Bearer token.
  6. `POST /mcp` `tools/call` for read and write tools.
- Multi-tenant isolation tests: Tenant B token cannot access Tenant A candidate or tickets (404 Not Found).
- PKCE failure tests: Invalid `code_verifier` rejected with 400 Bad Request (`invalid_grant`).
- Scope enforcement tests: Token with `career:read` rejected on `propose_project_improvement` (403 Forbidden).
- Stale base branch HEAD rejection (409 Conflict).

### 11.3 Public HTTPS & Live Sandbox Test Plan
- Safe live validation against sandbox repository `vishu1803/Ai-job-mcp`.
- Connect Claude (via Claude Desktop or Claude.ai custom connector URL) using test environment public endpoint (e.g. Cloudflare Tunnel / ngrok HTTPS).
- Complete end-to-end user flow: discovery $\rightarrow$ OAuth consent $\rightarrow$ tools listed $\rightarrow$ skill analysis $\rightarrow$ proposal $\rightarrow$ human approval $\rightarrow$ Draft PR creation.

---

## 12. Implementation Plan Sequence (Task P10-001)

1. **OAuth Domain Schemas**: Create `src/domain/oauth/oauth.schemas.js` (metadata schemas, authorize/token input/output schemas, token claim schemas).
2. **OAuth Database Schema**: Add `oauth_clients`, `oauth_authorization_codes`, and `oauth_tokens` tables to `src/db/schema.js` with Drizzle migration.
3. **OAuth Service**: Implement `src/services/oauth-authorization.service.js` (PKCE verification, auth code creation/consumption, token issuance/refresh/revocation).
4. **OAuth Routes**: Implement `src/routes/oauth.routes.js` (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`, `/.well-known/jwks.json`).
5. **MCP Auth Integration**: Update `src/security/mcp-auth.js` to validate OAuth 2.1 Bearer tokens and mint `McpRequestContext` with `authMethod: 'OAUTH_BEARER'`.
6. **401 Challenge Update**: Update `src/routes/mcp.routes.js` to attach `WWW-Authenticate: Bearer realm="mcp", resource_metadata="..."` on unauthenticated requests.
7. **Comprehensive Test Suites**: Author unit and integration tests covering OAuth, PKCE, token refresh, scope ceilings, and multi-tenant isolation.
8. **Regression & Documentation**: Run full test and lint gate, and update documentation.

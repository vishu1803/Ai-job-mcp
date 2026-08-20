# Authentication Architecture & Design Specification

**Project**: Antigravity Career Hub (Universal AI Career MCP Platform)  
**Document ID**: ARCH-AUTH-001  
**Status**: Living Architecture Specification (P2-002A Gate)  
**Governing Documents**: [`docs/security.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/security.md), [`docs/architecture.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/architecture.md), [`docs/data-model.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/data-model.md), [`docs/decisions.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/decisions.md) (ADR-017), [`project.md`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/project.md)

---

## 1. Goals & Strategic Context

The objective of the authentication system is to establish a secure, multi-tenant, developer-friendly identity foundation for the Antigravity Career Hub.

### Core Objectives:
1. **Zero-Trust Multi-Tenancy**: Every authenticated session is deterministically bound to a validated `user_id` and `tenant_id`. Tenant context is never inferred from unverified client inputs.
2. **Developer-First Web Experience**: Streamlined single-click authentication via standard OAuth 2.1 / OIDC.
3. **Defense-in-Depth Session Security**: Protection against Session Hijacking, Cross-Site Scripting (XSS) token theft, Cross-Site Request Forgery (CSRF), Session Fixation, and timing attacks.
4. **Dual Interface Compatibility**:
   * **Web Browser UI**: Server-side session management backed by encrypted/signed `HttpOnly` cookies and database session records.
   * **Remote MCP Gateway**: High-entropy scoped Bearer API tokens (`Authorization: Bearer <mcp_token>`) stored as SHA-256 hashes (Phase 5).
5. **Provider Neutrality**: Decoupled authentication adapters ensuring the core identity and tenant models remain independent of specific external identity providers (GitHub, Google, OIDC).

---

## 2. Requirements Matrix

| Requirement ID | Requirement Description | Classification | Decision Status |
| :--- | :--- | :--- | :--- |
| **REQ-AUTH-01** | Support OAuth 2.1 authorization code flow with PKCE (`S256`) | Security / Standards | **VERIFIED** |
| **REQ-AUTH-02** | Browser authentication via `HttpOnly`, `Secure`, `SameSite=Lax` session cookies | Browser Security | **VERIFIED** |
| **REQ-AUTH-03** | Server-side session state stored in PostgreSQL `sessions` table (SHA-256 hashed tokens) | Persistence / Auditing | **VERIFIED** |
| **REQ-AUTH-04** | Instant server-side session revocation on logout, user suspension, or tenant deletion | Revocation / Governance | **VERIFIED** |
| **REQ-AUTH-05** | Eliminate stateless JWTs from initial browser architecture to prevent revocation lag | Simplicity / Security | **VERIFIED** |
| **REQ-AUTH-06** | Automatic personal tenant workspace provisioning on first-time registration | Multi-Tenancy | **VERIFIED** |
| **REQ-AUTH-07** | Pluggable `IdentityProvider` interface supporting GitHub first, Google/OIDC next | Provider Neutrality | **VERIFIED** |
| **REQ-AUTH-08** | Multi-device session tracking and "logout all sessions" capability | User Security | **PROPOSED** |
| **REQ-AUTH-09** | Dedicated `user_identities` table for linking multiple social logins to one user | Future Identity Linking | **PROPOSED (Phase 3)** |

---

## 3. Evaluated Authentication Approaches

| Architecture Option | XSS / Token Theft Risk | Revocation Latency | Implementation Complexity | Multi-Tenant Scoping | MCP Gateway Fit | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Option A: OAuth 2.1 + Server-Side Sessions (Chosen)** | **Zero** (`HttpOnly` cookie prevents JS access) | **Instant** (Row deleted in DB) | **Low** (Uses native Fastify + PostgreSQL) | **Strict** (Tenant pinned in DB session) | **Clean Separation** (Browser uses cookie; MCP uses Bearer) | **ACCEPTED** |
| **Option B: OAuth + Pure Stateless JWT** | High (`localStorage`) or Medium (cookie) | High (Requires blocklist/wait for TTL) | Medium (Key management, JWKS, token refresh) | Weak (Stale tenant claims in token) | Poor (Token size overhead) | **REJECTED** |
| **Option C: Third-Party Managed Auth (Clerk/Auth0)** | Low | Low | High (External SaaS lock-in, vendor pricing) | External (Orphaned tenant mapping) | Medium | **REJECTED** |

---

## 4. Selected Architecture Overview

The platform standardizes on **OAuth 2.1 with PKCE (`S256`) and Server-Side Database Sessions**:

```
┌─────────────────┐       ┌────────────────────────┐       ┌──────────────────────┐
│  Browser / SPA  │ ◄───► │  Fastify Backend App   │ ◄───► │ PostgreSQL Database  │
└─────────────────┘       └────────────────────────┘       └──────────────────────┘
         │                           │                                │
         │ 1. GET /auth/login/github │                                │
         │──────────────────────────►│                                │
         │                           │ 2. Generate PKCE & State       │
         │ 3. Redirect to GitHub     │    Set signed transit cookie   │
         │◄──────────────────────────│                                │
         ▼                           │                                │
┌─────────────────┐                  │                                │
│ GitHub OAuth 2  │                  │                                │
└─────────────────┘                  │                                │
         │                           │                                │
         │ 4. User Authorizes        │                                │
         │    Redirect to Callback   │                                │
         ▼                           │                                │
┌─────────────────┐                  │                                │
│  Browser / SPA  │                  │                                │
└─────────────────┘                  │                                │
         │ 5. GET /auth/callback/gh  │                                │
         │──────────────────────────►│ 6. Verify State & Transit PKCE │
         │                           │    Exchange Code with GitHub   │
         │                           │    Fetch Normalized Profile    │
         │                           │                                │
         │                           │ 7. Find or Create User & Tenant│
         │                           │───────────────────────────────►│
         │                           │ 8. Mint Session & Hash Token   │
         │                           │    INSERT INTO sessions        │
         │                           │───────────────────────────────►│
         │ 9. Set HttpOnly Cookie    │                                │
         │    Redirect to /dashboard │                                │
         │◄──────────────────────────│                                │
```

---

## 5. OAuth 2.1 & PKCE Flow Specification

### 5.1. Authorization Request (`GET /auth/login/:provider`)
1. User clicks login with provider (e.g. `github`).
2. Server generates:
   * `state`: 32 cryptographically secure random bytes (`hex`).
   * `code_verifier`: 64 random bytes (`base64url`).
   * `code_challenge`: `base64url(sha256(code_verifier))`.
3. Server saves `state` and `code_verifier` in a short-lived (10-minute), signed/encrypted `HttpOnly` transit cookie (`__Host-oauth_state`).
4. Server redirects browser to Provider Authorization Endpoint:
   ```
   https://github.com/login/oauth/authorize
     ?client_id=GITHUB_APP_CLIENT_ID
     &redirect_uri=https://app.antigravitycareer.com/auth/callback/github
     &scope=read:user,user:email
     &state=STATE_VALUE
     &code_challenge=CODE_CHALLENGE
     &code_challenge_method=S256
   ```

### 5.2. Callback Verification (`GET /auth/callback/:provider`)
1. Provider redirects browser to callback with query params `?code=...&state=...`.
2. Server validates incoming `state` against the signed transit cookie `__Host-oauth_state`.
   * If state is missing, expired, or mismatch: Throws `400 AuthenticationError('Invalid OAuth state parameter')`.
3. Server exchanges `code` and stored `code_verifier` with Provider Token Endpoint via HTTPS POST.
4. Server retrieves normalized profile from Provider User API.
5. Server clears the temporary transit cookie.

---

## 6. PKCE Decision

* **Decision**: **PKCE with `S256` method is MANDATORY** for all OAuth flows.
* **Rationale (VERIFIED)**:
  * Even though Fastify acts as a confidential client holding a client secret, OAuth 2.1 mandates PKCE for all authorization code flows.
  * PKCE mitigates authorization code interception attacks and provides defense-in-depth against authorization code injection and callback tampering.

---

## 7. JWT Decision

* **Decision**: **NO JWTs IN THE INITIAL PRODUCT ARCHITECTURE**.
* **Rationale (VERIFIED)**:
  * **Revocation Integrity**: Stateless JWTs cannot be revoked immediately without maintaining a persistent server-side token blocklist, which defeats the purpose of being stateless.
  * **Tenant Security**: When a user's status changes to `SUSPENDED` or their role is modified, database sessions reflect the change on the very next request. JWTs create dangerous synchronization lags.
  * **Architectural Simplicity**: Our platform is a modular monolith backend. Database-backed session lookups on indexed `token_hash` take < 0.5ms.
  * **Remote AI Clients**: Non-browser MCP clients use dedicated, scoped SHA-256 hashed API tokens (Phase 5), not JWTs.

---

## 8. Session Model & Lifecycle Design

The session model directly utilizes the verified `sessions` schema established in Task **P1-004**:

### 8.1. Token Generation & Storage
1. **Raw Session Token**: Generated via `crypto.randomBytes(32).toString('base64url')` (256 bits of entropy).
2. **Database Storage**: The raw token is NEVER persisted in plaintext. The application computes:
   $$\text{token\_hash} = \text{SHA-256}(\text{raw\_session\_token})$$
   and inserts `token_hash` into the `sessions` table.
3. **Database Compromise Protection**: If the PostgreSQL database is breached, stolen `token_hash` values cannot be used by attackers to reconstruct valid session cookies.

### 8.2. Session Validation Pipeline
On every authenticated request:
1. Extract raw token from `session` cookie.
2. Compute `hash = sha256(raw_token)`.
3. Execute indexed query:
   ```sql
   SELECT s.id, s.tenant_id, s.user_id, s.expires_at, s.last_active_at,
          u.name, u.email, u.role, u.status,
          t.name AS tenant_name, t.tier AS tenant_tier
   FROM sessions s
   JOIN users u ON s.user_id = u.id
   JOIN tenants t ON s.tenant_id = t.id
   WHERE s.token_hash = $1
     AND s.expires_at > NOW()
     AND u.status = 'ACTIVE';
   ```
4. If valid: Attach context to request:
   * `req.user = { id, email, name, role }`
   * `req.tenant = { id: tenant_id, name: tenant_name, tier: tenant_tier }`
   * `req.tenantId = tenant_id`
   * `req.session = { id: session_id }`
5. Throttled activity update: If `NOW() - last_active_at > 15 minutes`, asynchronously update `sessions.last_active_at = NOW()`.

### 8.3. Session Expiration Policies
* **Absolute Lifetime**: 7 days (`604800` seconds) from creation.
* **Idle Inactivity Timeout**: 24 hours of inactivity invalidates the session.
* **Session Fixation Defense**: A brand new session token is minted on every login event; previous sessions for that client are invalidated.
* **Logout (`POST /auth/logout`)**: Deletes the database row corresponding to `token_hash` and clears the cookie with `Max-Age=0`.

---

## 9. Cookie Security Specification

| Cookie Attribute | Configuration | Security Justification |
| :--- | :--- | :--- |
| **Name** | `__Host-career_hub_session` (prod) / `career_hub_session` (dev) | `__Host-` prefix enforces `Secure`, `Path=/`, and disallows subdomain overwriting |
| **HttpOnly** | `true` | Prevents client-side JavaScript access; mitigates XSS session theft |
| **Secure** | `true` (enforced in prod; optional in local HTTP dev) | Cookie transmitted only over encrypted TLS (HTTPS) |
| **SameSite** | `Lax` | Prevents cross-site CSRF on state-changing calls while supporting top-level OAuth callback navigation |
| **Path** | `/` | Pinned to root path |
| **Max-Age** | `604800` (7 days) | Deterministic browser cookie lifespan matching database session `expires_at` |

---

## 10. User Identity Mapping & Provisioning

### 10.1. User Resolution Workflow
When an identity provider returns normalized profile `{ provider: 'github', providerUserId: '97516061', email: 'vishw@example.com', name: 'Vishwanat' }`:

```
               ┌───────────────────────────────┐
               │ Incoming Verified IdP Profile │
               └──────────────┬────────────────┘
                              │
                              ▼
               ┌───────────────────────────────┐
               │  Lookup User by Email in DB   │
               └──────────────┬────────────────┘
                              │
               ┌──────────────┴──────────────┐
         Found │                             │ Not Found
               ▼                             ▼
  ┌─────────────────────────┐   ┌───────────────────────────┐
  │ Check User Status       │   │ Provision New Workspace   │
  │ - ACTIVE: Proceed       │   │ 1. INSERT INTO tenants    │
  │ - SUSPENDED/DELETED:    │   │    slug = generateSlug()  │
  │   Throw 403 Forbidden   │   │    tier = 'FREE'          │
  └────────────┬────────────┘   │ 2. INSERT INTO users      │
               │                │    role = 'OWNER'         │
               │                │    status = 'ACTIVE'      │
               │                └────────────┬──────────────┘
               ▼                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │  Mint Session -> INSERT INTO sessions -> Set Cookie     │
  └─────────────────────────────────────────────────────────┘
```

### 10.2. Future Multi-Provider Identity Linking Table (`user_identities`)
In Phase 3/4, when supporting multiple identity providers per user (e.g. logging in with both GitHub and Google), a dedicated `user_identities` table will be introduced:

```sql
-- DESIGN SPECIFICATION (For Future Phase 3 Implementation - DO NOT CREATE YET)
CREATE TABLE user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL, -- 'github', 'google', 'gitlab'
  provider_user_id VARCHAR(128) NOT NULL,
  profile_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_identities_provider_uid_unique UNIQUE (provider, provider_user_id)
);
CREATE INDEX idx_user_identities_user_id ON user_identities(user_id);
```

---

## 11. Tenant Resolution & Request Context

* **Single Source of Truth**: Tenant identity is resolved **exclusively from the validated server-side session row**.
* **Request Context Binding**:
  * `req.tenantId` is immutable once set by the authentication middleware.
  * All database queries append `eq(table.tenantId, req.tenantId)` without exception.
  * Attempting to pass `?tenant_id=...` or `X-Tenant-Id` headers on standard authenticated user routes is strictly ignored.

---

## 12. Authorization Boundary (Separation of Concerns)

```
Incoming Request
      │
      ▼
┌────────────────────────────────────────┐
│ 1. Authentication Layer (`authenticate`)│ -> Verifies session cookie / Bearer token
│    Resolves: req.user, req.tenantId    │ -> Sets authenticated request context
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│ 2. Authorization Layer (`authorize`)   │ -> Checks user role ('OWNER' | 'MEMBER' | 'READONLY')
│    Verifies required permissions       │ -> Throws 403 Forbidden on privilege breach
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│ 3. Tenant Isolation Boundary           │ -> Injects eq(table.tenantId, req.tenantId)
│    Service / Data Access Scoping       │ -> Guarantees zero cross-tenant data leakage
└────────────────────────────────────────┘
```

---

## 13. Threat Model & Security Mitigations

| Threat | Attack Vector | Mitigation in Authentication Design |
| :--- | :--- | :--- |
| **OAuth State Forgery (CSRF)** | Attacker tricks victim into completing an attacker's OAuth login flow | High-entropy random `state` stored in encrypted/signed transit cookie; validated on callback |
| **Auth Code Interception** | Malicious app intercepts OAuth redirect code | PKCE (`S256`) code verifier validation at IdP token exchange endpoint |
| **Session Hijacking (XSS)** | Injected JavaScript attempts `document.cookie` theft | `HttpOnly` flag prevents JavaScript access to session cookies |
| **Cross-Site Request Forgery** | Malicious third-party website triggers state-changing actions | `SameSite=Lax`/`Strict` cookies + custom anti-CSRF headers for state mutations |
| **Session Fixation** | Attacker pre-sets session ID before victim logs in | New session ID and token minted upon successful authentication; old session destroyed |
| **Database Hash Leakage** | Stolen DB dump contains session records | `sessions.token_hash` stores SHA-256 hash; raw token is never persisted |
| **Timing Attacks** | Timing variance in token comparison | Cryptographic equality checks via constant-time hashing |
| **Orphaned User Deletion** | Tenant is hard deleted | PostgreSQL `ON DELETE CASCADE` removes all associated sessions and users |

---

## 14. Identity Provider Strategy

1. **Initial Provider (Phase 2 - Task P2-002)**: **GitHub OAuth 2.0 / GitHub App Login**.
   * *Rationale*: Matches target audience (software engineers) and directly integrates with candidate repository analysis.
2. **Secondary Provider (Phase 4)**: **Google OIDC / OAuth 2.0**.
   * *Rationale*: Broad enterprise and personal adoption.
3. **Pluggable Architecture**:
   * Implementation encapsulated in `src/security/providers/github.provider.js` implementing a unified `IdentityProvider` interface.

---

## 15. Modular Architecture & Implementation Boundaries

When Task P2-002 is executed, code will be organized into focused modules:

* `src/security/auth.service.js` — Core authentication business logic (OAuth redirect generation, callback handling, user registration).
* `src/security/session.service.js` — Session lifecycle management (minting, hashing, validation, revocation, cleanup).
* `src/security/providers/` — Identity provider adapters (`github.provider.js`, `google.provider.js`).
* `src/middleware/auth.middleware.js` — Fastify preHandler hooks (`authenticate`, `authorize`, `requireTenant`).
* `src/routes/auth.routes.js` — HTTP route definitions (`GET /auth/login/:provider`, `GET /auth/callback/:provider`, `POST /auth/logout`, `GET /auth/me`).

---

## 16. Open Policy Decisions & Recommendations

1. **Local Development Cookie Prefix (VERIFIED)**:
   * Production uses `__Host-career_hub_session` (requires HTTPS).
   * Local development (`NODE_ENV=development`) falls back to `career_hub_session` if running over plain HTTP on `localhost`.
2. **First-Time User Role (VERIFIED)**:
   * The first user creating a workspace is automatically assigned `OWNER`.
3. **Session Cleanup Strategy (VERIFIED)**:
   * Expired sessions are filtered at query time (`WHERE expires_at > NOW()`).
   * A periodic background cleanup sweep (`DELETE FROM sessions WHERE expires_at < NOW()`) will be scheduled in Phase 14.

---

## 17. Final Architecture Gate Verdict

**Status**: **P2-002A APPROVED**

The authentication architecture is fully specified, adheres to all project security invariants, leverages existing database schemas (`sessions`, `users`, `tenants`), avoids unnecessary JWT complexity, enforces OAuth 2.1 with PKCE, and establishes clean boundaries for Task **P2-002** implementation.

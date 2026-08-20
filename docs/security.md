# Security Specification & Threat Model

**Project**: Antigravity Career Hub (Universal AI Career MCP Platform)  
**Status**: Authoritative Security Baseline  
**Last Updated**: 2026-08-19  

---

## 1. Security Goals
1. **Zero Credential Exposure**: Never expose private API keys, GitHub App installation tokens, OAuth secrets, or user tokens to the frontend, AI clients, or server logs.
2. **Strict Multi-Tenant Cryptographic Isolation**: Guarantee that no tenant or user can ever read, modify, or query another tenant's repository metadata, candidate profile, evidence items, or audit history.
3. **Zero-Fabrication Career Integrity**: Deterministically enforce that all resume claims and portfolio highlights are substantiated by verifiable `EvidenceId` references to prevent AI hallucination.
4. **Human-in-the-Loop Consequential Safety**: Require explicit two-phase interactive human confirmation for all actions that alter external state (Git branch creation, commits, PRs, application submissions).
5. **Least Privilege by Design**: Request the absolute minimum GitHub App permissions necessary (read-only default, scoped repository selection).

---

## 2. Threat Model

| Threat ID | Threat Category | Description | Potential Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **TH-01** | **Cross-Tenant Data Leak (IDOR)** | Attacker guesses/supplies another user's `user_id` or `connection_id` in API or MCP tool call. | Critical (Data Breach) | Enforce request-context tenant scoping in all queries; never trust client-supplied tenant IDs. |
| **TH-02** | **Stolen GitHub Credentials at Rest** | Database compromise yields stored GitHub installation tokens or refresh tokens. | Critical (Account Takeover) | Authenticated AES-256-GCM encryption with unique per-record IV; short-lived 1-hour installation tokens. |
| **TH-03** | **Prompt Injection via Repository Content** | Malicious repository README contains instructions to exfiltrate tokens or manipulate AI outputs. | High (AI Manipulation) | Sanitize and delimit repository content; isolate LLM context; zero sensitive tokens in AI context. |
| **TH-04** | **Prompt Injection via Job Descriptions** | Untrusted job description contains jailbreak prompts to generate false credentials. | High (Hallucination) | Deterministic zero-hallucination validation gate; verify evidence links independently of LLM. |
| **TH-05** | **Webhook Forgery / Replay** | Attacker sends fake GitHub webhook events to trigger unauthorized repository ingestion. | Medium (Resource Exhaustion) | Validate `X-Hub-Signature-256` HMAC-SHA256 signature using webhook secret before processing. |
| **TH-06** | **Unauthenticated Remote MCP Access** | Unauthorized client queries remote MCP endpoint to extract candidate records. | High (Information Disclosure) | Mandatory `Authorization: Bearer <mcp_token>` with SHA-256 hashed token lookup and rate limiting. |
| **TH-07** | **Accidental Code Destruction** | AI tool call attempts to push code directly to `main` branch or merge PRs autonomously. | Critical (Data Loss / Corruption)| Hard restriction: write operations forbidden on default branch; require human-confirmed PR creation. |
| **TH-08** | **Server-Side Request Forgery (SSRF)** | Attacker inputs malicious repository URL pointing to internal cloud metadata (`169.254.169.254`). | High (Internal Breach) | Restrict repository queries to authenticated GitHub API endpoints; validate all external URL schemes. |

---

## 3. Authentication
* **Web UI Authentication**: Standard session authentication using encrypted HTTP-only, `SameSite=Strict`, `Secure` cookies, or OAuth 2.1 Authorization Code Flow with PKCE.
* **Remote MCP Authentication**: AI clients authenticate to the remote MCP gateway via `Authorization: Bearer <mcp_token>`.
  * Tokens follow the format: `mcp_live_[32_random_bytes_hex]`.
  * The server hashes incoming tokens using SHA-256 before querying the database to prevent timing attacks and plaintext database token leaks.

---

## 4. Authorization & Permission Model
* **Role-Based Access Control (RBAC)**: Supports `Owner`, `Member`, and `Read-Only` roles per tenant.
* **Operation Classification**:
  * **READ Operations**: Inspecting candidate profiles, listing skills, reading repository trees, calculating ATS fit scores. Authorized via valid session/MCP token.
  * **WRITE / EXTERNAL Operations**: Creating branches, committing code, opening PRs, updating user settings, deleting accounts. Authorized ONLY via two-phase human confirmation tickets.

---

## 5. Multi-Tenant Isolation
* Every database table containing tenant data includes `tenant_id` and `user_id` foreign keys.
* All service methods and Drizzle ORM queries MUST extract the authenticated `tenant_id` from the verified request context and append `eq(table.tenantId, req.tenantId)` to all `WHERE` clauses.
* Automated multi-tenant penetration tests verify that cross-tenant queries return `404 Not Found` or `403 Forbidden`.

---

## 6. OAuth 2.1 Architecture
* All third-party OAuth flows (GitHub, Google) strictly follow OAuth 2.1:
  * Authorization Code Flow with Proof Key for Code Exchange (PKCE).
  * Cryptographically random `state` parameter generated per session and validated on callback to prevent CSRF.
  * Short-lived authorization codes exchanged server-side over TLS.

---

## 7. GitHub App Security
* **App Authentication**: Uses GitHub App ID and RSA Private Key (PEM) to generate short-lived JWTs (10-minute max).
* **Installation Tokens**: Exchanges App JWT for temporary Installation Access Tokens (`ghs_*`) that expire within **1 hour**.
* **Repository-Level Granularity**: Users select exact repositories during GitHub App installation. The server never requests universal account-wide access unless explicitly granted.
* **Default Permissions**:
  * `contents: read` (Repository files, trees, commits)
  * `metadata: read` (Repository names, descriptions, languages)
  * `pull_requests: write` (Only requested if project adaptation workflows are enabled)

---

## 8. MCP Authentication & Gateway Security
* **Transport Security**: All remote MCP traffic requires TLS (HTTPS).
* **Origin Validation**: Incoming Streamable HTTP requests validate `Origin` and `Host` headers.
* **Header Sanitization**: Custom header `Mcp-Method` is strictly validated against an allowlist of registered MCP methods.
* **No Unauthenticated Tools**: Every MCP tool requires an authenticated user context.

---

## 9. MCP Authorization & Scoping
* MCP tokens can be granted granular scopes (e.g., `career:read`, `resume:generate`, `actions:propose`).
* Write tools (`confirm_and_create_pr`) verify that the calling MCP token has write privileges AND that a valid, unexpired `ApprovalTicket` exists.

---

## 10. Token Storage & Encryption at Rest
* Plaintext credentials (access tokens, refresh tokens, webhook secrets, API keys) are **NEVER** stored in plaintext in the database, caches, or logs.
* **Cryptographic Foundation (`src/security/encryption.js`)**:
  * **Algorithm**: `AES-256-GCM` (Authenticated Encryption with Associated Data) via native `node:crypto`.
  * **Master Key Format**: 256-bit (32-byte) symmetric key (`ENCRYPTION_MASTER_KEY` / `ENCRYPTION_KEY`) strictly encoded as a 64-character hexadecimal string or 44-character Base64 string. Raw human passphrases/arbitrary UTF-8 strings are explicitly rejected to prevent weak key generation.
  * **No Built-in Fallbacks**: No hardcoded or default encryption keys exist. In production (`NODE_ENV=production`), `ENCRYPTION_MASTER_KEY` is strictly required at startup. In development/testing, missing keys fail with `MISSING_KEY` errors rather than silently using insecure defaults.
  * **Key Versioning & Rotation**: Every encrypted package explicitly binds a `keyVersion` (e.g. `'v1'`). Key ring mappings enable multi-version decryption and seamless key rotation via `rotateSecret()`.
  * **Initialization Vector (IV)**: 12-byte (96-bit) cryptographically random IV generated via `crypto.randomBytes(12)` per encryption operation. Zero static/reused IVs.
  * **Authentication Tag**: 16-byte (128-bit) GCM authentication tag verifying ciphertext integrity. Any tampering with ciphertext, IV, tag, or header throws an immediate `AUTHENTICATION_FAILED` error.
  * **Additional Authenticated Data (AAD)**: Binds format version and key version (`v1:<keyVersion>`) to the GCM authentication tag to prevent version-swapping attacks.
  * **Storage Formats**:
    * **Compact String**: `enc:v1:<keyVersion>:<iv_base64url>:<tag_base64url>:<ciphertext_base64url>` for standard database columns and tokens.
    * **Structured JSON**: `{ version: 1, keyVersion: 'v1', iv: '...', tag: '...', ciphertext: '...' }` validated via Zod `EncryptedPayloadSchema`.
  * **Payload Boundary**: Strict 64 KB (65,536 bytes) maximum plaintext cap. Designed strictly for credentials, tokens, and secrets (NOT large files, resumes, or code trees).
  * **Data Scope**:
    * *Protected by this module*: GitHub installation access tokens, OAuth refresh tokens, third-party API keys, webhook signing secrets, MCP connection secrets.
    * *Not protected by this module*: Public repository trees, candidate profiles, and evidence graphs (which are isolated via row-level tenant access controls).

---

## 11. Secret Management
* Master keys (`ENCRYPTION_MASTER_KEY`, `AUTH_SECRET`, `GITHUB_APP_PRIVATE_KEY`) are stored exclusively in environment variables or cloud secret managers (Azure Key Vault / AWS Secrets Manager / GitHub Secrets).
* Zero secrets are committed to Git. `.gitignore` strictly protects `.env*` files.
* Centralized Pino logger redacts all master keys, token substrings, and plaintext properties across top-level and nested log outputs.

---

## 12. Session Security
* Session identifiers use 32-byte cryptographically secure random strings.
* Session cookies configured with: `HttpOnly`, `Secure`, `SameSite=Strict`, `Max-Age=86400` (24 hours).
* Sessions are revoked immediately upon logout or password/credential rotation.

---

## 13. CSRF Protection
* All state-changing REST endpoints (`POST`, `PUT`, `DELETE`) require a CSRF token header or use SameSite=Strict cookies with custom anti-forgery headers (`X-Requested-With` or `X-CSRF-Token`).
* OAuth callbacks validate the cryptographic `state` token before processing authorization codes.

---

## 14. CORS Policy
* CORS is restricted to authorized web origins (e.g., `https://app.antigravitycareer.com` or `http://localhost:3000` in development).
* Preflight `OPTIONS` requests are validated and cached with short `max-age` (10 minutes).
* Wildcard `*` origins are strictly prohibited on authenticated API and MCP routes.

---

## 15. Rate Limiting
* Fastify rate-limiting middleware (`@fastify/rate-limit`) backed by Redis / In-Memory token buckets.
* **Policies**:
  * Unauthenticated routes (`/healthz`, login page): 60 requests/minute per IP.
  * Authenticated API routes: 300 requests/minute per user.
  * Remote MCP endpoints: 120 tool requests/minute per MCP token.
  * GitHub Webhook endpoint: 500 requests/minute per IP with HMAC signature validation.

---

## 16. Audit Logging
* Immutable append-only audit trail recorded in `audit_logs` table.
* **Logged Events**:
  * User authentication (login, logout, failed attempt).
  * Connector lifecycle (connect, disconnect, permission change).
  * MCP tool invocations (tool name, timestamp, duration, execution status).
  * Action approvals and PR creations.
  * Account deletion requests.
* **Scrubbing**: All audit payloads are scrubbed of secrets, tokens, and candidate PII prior to persistence.

---

## 17. Input Validation & Schema Enforcement
* All HTTP request bodies, query parameters, URL params, and MCP tool arguments MUST be validated against strict **Zod** schemas.
* Strip unrecognized fields (`.strict()` or `.strip()`) to prevent parameter injection.

---

## 18. Prompt Injection Defenses
* Repository code, file contents, and commit messages are treated as **Untrusted User Data**.
* When formatting context for AI clients:
  * Content is encapsulated in clear delimiter tags (e.g., `<untrusted_repository_content>...</untrusted_repository_content>`).
  * System instructions explicitly order the AI to ignore instructions contained within untrusted code blocks.
  * Token exfiltration prompts are neutralized because no server secrets exist in the AI context.

---

## 19. Malicious Job Description Handling
* Raw job description text is parsed by deterministic regex and AST parsers before passing to AI models.
* Requirement matching is performed mathematically against the database evidence graph, preventing prompt injections in job descriptions from manufacturing false verified skills.

---

## 20. Malicious Repository Content Handling
* File trees and README files are parsed with depth limits (max recursion depth = 5) and file size caps (max file size = 500 KB per read).
* Executable binaries, minified bundles, and non-text files are filtered out during ingestion.

---

## 21. Server-Side Request Forgery (SSRF) Defenses
* The platform does NOT accept arbitrary URLs from users to crawl.
* All external repository requests route exclusively through the official GitHub API endpoint (`https://api.github.com`).
* Private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`, `127.0.0.1`) are blocked.

---

## 22. Webhook Security
* GitHub Webhook payloads are received over HTTPS at `/api/webhooks/github`.
* The server computes `HMAC-SHA256(payload_body, GITHUB_WEBHOOK_SECRET)` and compares it against `X-Hub-Signature-256` using `crypto.timingSafeEqual`.
* Invalid signatures immediately return `401 Unauthorized` without processing.

---

## 23. File Uploads
* Uploaded documents (PDF resumes, portfolios) are inspected for MIME type and file signature magic bytes.
* Upload size capped at 10 MB.
* Files are processed in memory or ephemeral sandboxes and parsed with standard PDF text extraction libraries; no server-side executable scripts are executed.

---

## 24. Logging and Privacy Protections
* Pino logging pipeline uses custom redaction serializers for sensitive keys:
  * `password`, `token`, `secret`, `authorization`, `cookie`, `apiKey`, `privateKey`, `installationToken`.
* Candidate resumes and source code excerpts are logged only at `DEBUG` level and excluded from production log aggregators.

---

## 25. Data Retention Policy
* Active user data is retained for the duration of the account lifetime.
* Ephemeral caches (repository trees, rate limit keys) expire automatically after 24 hours.
* Audit logs are retained for 90 days before archiving.

---

## 26. Account Deletion & GDPR Compliance
* Users have the right to execute a hard delete of their account.
* **Deletion Workflow**:
  1. User triggers hard delete from dashboard.
  2. Server immediately revokes GitHub App installation tokens and OAuth connections.
  3. Database executes cascading delete: `tenants`, `users`, `resource_connections`, `candidate_profiles`, `skills`, `evidence_items`, `match_results`.
  4. Confirmation is written to audit log with anonymized user ID.

---

## 27. Resource Disconnection & Token Revocation
* Disconnecting a repository or GitHub App immediately deletes the encrypted credential record from `resource_connections`.
* All cached repository data and associated candidate evidence are purged from the database.

---

## 28. External Action Authorization (Two-Phase Safety Protocol)
The architecture strictly enforces a two-phase commit state machine for consequential external operations:

```
[AI / User Requests Action]
           │
           ▼
[Phase 1: Propose Action]
  - Generate code diff / patch
  - Run sandboxed lint / test check
  - Create ApprovalTicket in Redis/DB with 15-minute TTL
  - Return ApprovalTicket ID and structured preview
           │
           ▼
[Phase 2: Explicit Human Confirmation]
  - User reviews diff in UI or calls `confirm_action(ticketId)`
  - Verify ticket is unexpired and belongs to authenticated tenant
  - Execute Git branch creation & draft PR opening
  - Invalidate ticket & record in audit log
```

* **Inviolable Invariant**: Pushing code directly to `main` or `master` is hardcoded as impossible.

---

## 29. Incident Response Basics
1. **Key Compromise**: If `ENCRYPTION_KEY` or `GITHUB_APP_PRIVATE_KEY` is compromised, invoke emergency rotation runbook: re-encrypt database records with new master key and revoke GitHub App private key in GitHub developer settings.
2. **Breach Containment**: Ability to revoke all active MCP tokens and user sessions globally via `REDIS_FLUSH_SESSIONS` and token revocation table.
3. **Audit Trail**: Inspect `audit_logs` to determine exact blast radius of affected tenant IDs.

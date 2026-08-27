# Phase 14: Security Hardening, Threat Modeling & Production Readiness Architecture

**Document ID**: `ARCH-051`  
**Related Tasks**: `P14-001A`, `P14-001` through `P14-006`  
**Related ADR**: `ADR-071`  
**Last Updated**: 2026-08-27  

---

## 1. Executive Security Posture

At the completion of Phase 13.5, **Antigravity Career Hub** operates as a robust, multi-tenant, provider-neutral AI career platform encompassing:
- **16 MCP Tools** adhering to the MCP 2026-07-28 Streamable HTTP specification.
- **Interactive MCP App UI** (`ui://career-hub/job-fit-radar/v1`) using sandboxed HTML5 SVG rendering.
- **Direct Source Resume Ingestion** with authenticated AES-256-GCM blob storage and `CLAIMED [Unverified User Claim]` truth isolation.
- **OAuth 2.1 PKCE Authorization Server** supporting Claude and ChatGPT custom connectors.
- **GitHub App Integration** with fine-grained read-only default permissions, HMAC-SHA256 webhook ingress, and two-phase human-confirmed write workflows.
- **Hermetic Multi-Tenant Isolation** verified across 5 synthetic beta tenants in isolated database instances.

Before exposing this platform to a persistent public staging domain and production internet traffic, Phase 14 executes rigorous, deterministic security hardening across all layers.

---

## 2. 13-Actor Comprehensive Threat Model

```
                                  [ INTERNET PERIMETER ]
                                             │
      ┌──────────────────────┬───────────────┴──────────────┬──────────────────────┐
      ▼                      ▼                              ▼                      ▼
[1. Unauth Attacker]   [4. Compromised AI]          [8. Malicious Upload]   [10. Fake Webhook]
[2. Malicious User]    [5. Malicious MCP Client]    [9. Malicious Repo]     [13. Supply Chain]
[3. Foreign Tenant]    [6. Stolen MCP Token]
                       [7. Replayed OAuth Token]
                                             │
                                             ▼
                             [ CLOUD INGRESS / TUNNEL ]
                                             │
                                             ▼
                             [ CAREER HUB SECURITY CORE ]
                     ├── Context-Bound Multi-Tenant Boundary
                     ├── AES-256-GCM Authenticated Encryption
                     ├── Two-Phase Human Write Safety Kernel
                     └── Zero-Hallucination Evidence Provenance
                                             │
                                             ▼
                            [ POSTGRESQL MULTI-TENANT DB ]
```

| Actor ID | Actor & Asset | Attack Vector | Trust Boundary | Existing Defense | Remaining Gap for Phase 14 | Verification Method | Severity |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ACT-01** | **Unauthenticated Attacker**<br>*Asset: Internal APIs & DB* | Endpoint enumeration, unauthenticated data extraction, SQL injection, DoS. | Public Internet $\to$ Fastify HTTP Ingress | `authenticate` middleware, Zod strict request parsing, parametrized SQL (Drizzle). | Global/Per-IP rate limiting (token bucket) not yet enforced at edge. | Automated DAST probing across all routes. | **CRITICAL** |
| **ACT-02** | **Authenticated Malicious User**<br>*Asset: High Compute & Storage* | Flooding resume upload endpoints, zip bombs, unbounded repo AST ingestion. | User Session $\to$ Backend Services | 10MB payload limit on multipart, file magic-byte validation, 10-level repo tree cap. | Per-user rate limiting on compute-heavy endpoints (`/resumes`, `/sync`). | Synthetic load test exceeding rate limit thresholds. | **HIGH** |
| **ACT-03** | **Malicious Tenant User**<br>*Asset: Foreign Tenant Data (IDOR)* | Guessing/injecting foreign UUIDs in candidate, project, resume, application, or evidence queries. | Tenant A $\to$ Tenant B Workspace | Server-derived context (`req.auth.tenantId`), sovereign 404 default-deny, composite SQL keys. | Automated continuous penetration test suite simulating 100% IDOR permutations. | Cross-tenant IDOR attack test suite. | **CRITICAL** |
| **ACT-04** | **Compromised AI Client**<br>*Asset: Stored Data & Write Access* | AI hallucinating authorization, attempting prompt injection to read raw DB or trigger git writes. | AI Model Context $\to$ Remote MCP Server | Stateless MCP gateway, strict Zod schemas, zero raw SQL exposure, two-phase write safety. | Explicit context sandboxing and inverse authority validation on all 16 tools. | LLM prompt-injection test fixtures. | **HIGH** |
| **ACT-05** | **Malicious MCP Client**<br>*Asset: MCP Gateway & Tools* | Rapid polling, oversized arguments, malformed JSON-RPC payloads, scope bypass. | External Client $\to$ `/mcp` HTTP Transport | `assertToolPermission`, Bearer token validation, Zod tool input schemas. | Per-token / per-client rate limiting and JSON-RPC payload size caps (256 KB). | Fuzzing JSON-RPC inputs with malformed data. | **HIGH** |
| **ACT-06** | **Stolen MCP API Token**<br>*Asset: Candidate Data via MCP* | Token leakage via client config or developer machine compromise. | AI Client Config $\to$ MCP Gateway | SHA-256 token hashing at rest, instantaneous one-click token revocation in UI. | Token expiration policies, last-used IP telemetry, and suspicious usage alerts. | Revocation integration test & expired token test. | **HIGH** |
| **ACT-07** | **Stolen / Replayed OAuth Token**<br>*Asset: Candidate Resources* | Replaying intercepted OAuth authorization code or refresh token. | OAuth Provider $\to$ Career Hub OAuth Server | PKCE S256 code challenge, single-use auth codes (10-min TTL), Refresh Token Rotation (RTR). | Strict client IP/Origin validation and TLS 1.3 channel binding. | Replay authorization code and revoked refresh token. | **CRITICAL** |
| **ACT-08** | **Malicious Uploaded Document**<br>*Asset: Host Server & Parser* | Polyglot files, PDF buffer overflows, malicious DOCX macro XML, recursive zip bombs. | Untrusted File $\to$ Document Parser | Magic bytes checking (`%PDF-`, `PK\x03\x04`), binary executable rejection (`MZ`, `ELF`), 10MB ceiling. | Strict decompression bomb expansion factor limits ($\le 10\times$) in XML/PDF tokenizers. | Upload malformed PDFs, zip bombs, and ELF binaries. | **CRITICAL** |
| **ACT-09** | **Malicious Repo Content**<br>*Asset: AST Parser & AI Context* | Prompt injection in READMEs, hidden null-byte files, symlink traversal, secrets in manifests. | GitHub Repo $\to$ Evidence Extractor | Posix path traversal validation, 1MB file cap, binary sniffing, symlink rejection, secret scrubber. | Regex ReDoS hardening across AST manifest parsing regexes. | Malicious repo test suite with symlinks and ReDoS strings. | **HIGH** |
| **ACT-10** | **Forged GitHub Webhook**<br>*Asset: Repository Sync State* | Fake webhook payload triggering unauthorized repo state change or resource exhaustion. | External Webhook $\to$ `/webhooks/github` | Cryptographic HMAC-SHA256 signature validation (`X-Hub-Signature-256`), 24h delivery cache. | IP allowlisting against GitHub's published webhook IP ranges (`api.github.com/meta`). | Replayed webhook delivery and forged signature tests. | **HIGH** |
| **ACT-11** | **Compromised Third-Party Connector**<br>*Asset: User Repositories* | Malicious or hijacked GitHub App private key / installation token. | GitHub App API $\to$ Connector Layer | Least privilege scopes (`contents:read`), AES-256-GCM metadata encryption, 1h token lifespan. | Emergency key rotation runbook and upstream token eviction procedures. | Simulated upstream revocation and token eviction test. | **HIGH** |
| **ACT-12** | **Malicious Operator / Admin**<br>*Asset: Raw Database Dumps* | Database snapshot inspection, credential extraction, unauthorized tenant snooping. | Database Layer $\to$ Data Store | Symmetric encryption of tokens/resumes (AES-256-GCM), sensitive key redaction in logger. | Production secret management (AWS KMS / GCP Secret Manager / Vault) vs env vars. | Automated DB dump inspection proving zero plaintext secrets. | **HIGH** |
| **ACT-13** | **Supply Chain Attacker**<br>*Asset: Node.js Dependencies* | Compromised npm package injecting backdoors or exfiltrating environment variables. | npm Registry $\to$ Application Runtime | `npm ci` deterministic lockfile, Prettier/ESLint static checks, zero extraneous runtime dependencies. | Automated `npm audit` CI gating, lockfile integrity auditing, transitive dependency pruning. | CI dependency vulnerability scanner. | **CRITICAL** |

---

## 3. Core Architectural Security Controls

### 3.1. Authentication & Session Hardening
1. **Server-Derived Context Authority**: All tenant and user identities are resolved exclusively from authenticated sessions or cryptographic OAuth tokens. No request body, query parameter, or custom header can override `req.auth.tenantId`.
2. **Cookie Security**:
   - `HttpOnly = true` (blocks JavaScript access).
   - `SameSite = Lax` (defends against cross-site request forgery).
   - `Secure = true` (mandated in production).
   - `__Host-` prefix enforced in production (`__Host-career_hub_session`).
3. **OAuth 2.1 & PKCE**:
   - Mandatory S256 code challenge generation and verification.
   - Exact client redirect URI matching (rejects wildcard or HTTP schemas).
   - Refresh Token Rotation (RTR) invalidating entire token family upon reuse detection.

### 3.2. MCP Gateway & Boundary Isolation
1. **Stateless Streamable HTTP**: Operates over `POST /mcp` with per-request Bearer authentication.
2. **Inverse Authority Principle**: AI clients recommend actions; Career Hub domain services validate and enforce all business constraints and security ceilings independently.
3. **Payload & Execution Sandboxing**:
   - Strict Zod schema validation on every tool call.
   - Output payload budgets ($\le 25\text{ KB}$ for single items, $\le 15\text{ KB}$ for lists).
   - Read-only tools have zero mutation side-effects.

### 3.3. Two-Phase Action Safety Kernel
1. **Proposal Phase**: Generates diff, affected files, commit message, and issues a cryptographic `ActionApprovalTicket` with HMAC-SHA256 signature and 15-minute TTL.
2. **Human Confirmation Phase**: Requires explicit human confirmation (`confirmed: true`) by an `OWNER` role.
3. **Kernel Gate Invariants**:
   - Target branch strictly forced to `feat/career-hub-*` (direct push to default/protected branch is blocked).
   - Stale HEAD SHA detection (fails closed if remote branch moved).
   - `.github/workflows/*` modification strictly forbidden (prevents CI/CD privilege escalation).

### 3.4. Cryptographic Storage & Key Lifecycle
1. **Authenticated AES-256-GCM**:
   - 256-bit symmetric master key (`ENCRYPTION_MASTER_KEY`).
   - Unique 96-bit (12-byte) cryptographically random IV per encryption operation.
   - 128-bit (16-byte) authentication tag verifying ciphertext integrity.
   - Additional Authenticated Data (AAD) binding payload type and key version (`v1`).
2. **Key Rotation Architecture**:
   - Support for dual-key decryption (`v1` and `v2`) with automatic re-encryption under the latest active version.
   - Master keys must be exactly 64 hex characters (32 bytes) or 44 base64 characters; low-entropy passphrases are rejected on startup.

---

## 4. Production Rate Limiting & Abuse Prevention Architecture

To prevent Denial of Service (DoS), brute force, and API resource exhaustion, Phase 14 establishes a multi-tiered token-bucket rate limiting architecture:

```
[ INCOMING REQUEST ]
         │
         ▼
[ Global IP Bucket ] ──────────> Exceeded? ──> 429 Too Many Requests (Retry-After)
         │
         ▼
[ Endpoint Route Tier ]
         ├── Auth Tier (/auth/*, /oauth/*): 10 req/min per IP
         ├── Upload Tier (/resumes/upload): 5 req/min per User
         ├── MCP Gateway Tier (/mcp): 60 req/min per Token / 120 req/min per Tenant
         ├── Ingestion Tier (/onboarding/sync): 2 req/min per Tenant
         └── General Web Tier (/dashboard, /projects): 120 req/min per Session
         │
         ▼
[ Execute Handler ]
```

| Rate Limit Tier | Target Endpoints | Scope / Key | Default Threshold | Burst Allowance | Action on Breach |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Auth Brute-Force** | `/auth/github`, `/auth/me`, `/oauth/token` | Client IP | 10 requests / min | 15 requests | 429 + `Retry-After: 60` |
| **Document Upload** | `POST /resumes/upload` | `tenantId:userId` | 5 uploads / min | 10 uploads | 429 + JSON Error |
| **MCP AI Invocation** | `POST /mcp` | `tokenHash` | 60 tool calls / min | 100 tool calls | JSON-RPC Error -32000 (Rate Limited) |
| **Repository Sync** | `POST /onboarding/sync`, `/candidate/sync` | `tenantId` | 2 syncs / 5 min | 3 syncs | 429 + `Retry-After: 300` |
| **General Web UI** | `GET /dashboard`, `/projects`, `/skills` | `sessionId` | 120 requests / min | 180 requests | 429 Rate Limit Page |

---

## 5. Logging, Data Redaction & Security Observability

### 5.1. Sensitive Data Redaction Filter
The centralized Pino logger and audit sanitizer enforce automated pattern and key-based scrubbing:
- **Redacted Keys**: `password`, `token`, `secret`, `authorization`, `cookie`, `privateKey`, `apiKey`, `githubAppPrivateKey`, `mcpToken`, `clientSecret`.
- **Redacted Content Patterns**:
  - GitHub Personal Access Tokens (`ghp_*`, `gho_*`, `ghu_*`, `ghs_*`, `ghr_*`).
  - Google API Keys (`AIzaSy*`).
  - Generic Bearer tokens (`Bearer mcp_*`, `Bearer eyJ*`).
  - Private Key PEM blocks (`-----BEGIN RSA PRIVATE KEY-----`).
- **Payload Caps**: Audit log payload JSON capped at 16 KB; excerpt previews capped at 1,000 characters.

### 5.2. Security Telemetry & Metrics
Phase 14 introduces structured Prometheus / OpenTelemetry security metrics:
- `security_auth_failures_total{provider, reason}`: Track authentication brute force.
- `security_cross_tenant_denials_total{operation, entity}`: Monitor potential IDOR attacks.
- `security_rate_limit_breaches_total{endpoint, tier}`: Measure abuse attempts.
- `mcp_tool_invocation_duration_seconds{tool, status}`: Monitor tool latency and errors.

---

## 6. Backup, Recovery & Data Sovereignty Architecture

### 6.1. Recovery Objectives
- **Recovery Point Objective (RPO)**: $\le 1\text{ hour}$ (maximum allowable data loss in disaster).
- **Recovery Time Objective (RTO)**: $\le 4\text{ hours}$ (maximum time to restore full platform availability).

### 6.2. Backup Strategy
1. **Automated Logical Snapshots**: Daily `pg_dump` with gzip compression and AES-256 encryption.
2. **Encrypted Blob Storage Snapshots**: Resume blobs stored with deterministic tenant UUID directory partitioning; synced daily with versioned, immutable storage buckets.
3. **Automated Restoration Verification**: Ephemeral database restore drill script executing migration validation and record count checks on a clean PostgreSQL instance.

---

## 7. Public Staging Deployment Architecture

```
[ AI CLIENT (Claude/ChatGPT/Gemini) ]       [ HUMAN BROWSER ]
                  │                                  │
                  └──────────────────┬───────────────┘
                                     │
                                     ▼
                  [ CLOUDFLARE EDGE (Custom Domain) ]
                  ├── TLS 1.3 Termination (Strict HSTS)
                  ├── DDoS & Bot Management
                  ├── Web Application Firewall (WAF)
                  └── Zero Inbound Open Firewall Ports
                                     │
                                     ▼
                    [ CLOUDFLARE NAMED TUNNEL ]
                    (cloudflared daemon via mTLS)
                                     │
                                     ▼
                     [ FASTIFY BACKEND CONTAINER ]
                     ├── Loopback Ingress (127.0.0.1:3000)
                     ├── __Host- Cookie Hardening
                     ├── Origin / CSRF Verification
                     └── Health Probes (/livez, /healthz)
                                     │
                                     ▼
                    [ MANAGED POSTGRESQL (Aiven TLS) ]
```

### 7.1. Staging Network Invariants
1. **No Inbound Open Ports**: Backend listens on loopback; all ingress traffic is routed through an outbound encrypted mTLS tunnel via `cloudflared`.
2. **Strict Security Headers**:
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self';`
3. **Local Hotspot Context Note**: The current development machine's local IPv6-only mobile hotspot is recognized as an isolated local networking constraint and is not an application security defect. Public staging will be deployed to a standard cloud container network with dual-stack IPv4/IPv6 support.

---

## 8. Summary of Phase 14 Security Gaps & Priorities

| Priority | Security Domain | Planned Control in Phase 14 | Task ID |
| :--- | :--- | :--- | :--- |
| **P0 (Critical)** | Automated Penetration Suite | Comprehensive automated DAST test suite testing IDOR, CSRF, SSRF, injection, and session hijacking. | `P14-002` |
| **P0 (Critical)** | Dependency & Supply Chain | Automated `npm audit` CI gating and vulnerability remediation for devDependencies (`drizzle-kit`/`esbuild`). | `P14-001` |
| **P1 (High)** | Secrets Leak Prevention | Pre-commit git secret scanner and automated history audit for high-entropy tokens. | `P14-001` |
| **P1 (High)** | Distributed Rate Limiting | In-memory token bucket rate limiting on `/mcp`, `/auth/*`, `/oauth/*`, and `/resumes/upload`. | `P14-003` |
| **P1 (High)** | Staging Infrastructure | Cloudflare Named Tunnel configuration with persistent domain (`staging.careerhub.ai`). | `P14-004` |
| **P2 (Medium)** | Backup & Disaster Recovery | Automated backup creation and test restore drill script. | `P14-005` |
| **P2 (Medium)** | Final Readiness Review | Formal audit report against all `goal.md` requirements prior to public release. | `P14-006` |

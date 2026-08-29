# Cloudflare Named Tunnel & Staging Infrastructure Specification

**Document Reference**: ARCH-054  
**Governing Standard**: Cloudflare Named Tunnels (Argo Tunnel), Model Context Protocol (MCP) Streamable HTTP Spec (2026-07-28), RFC 8414, RFC 9728, RFC 8707, RFC 9700 (OAuth 2.1 / BCP)  
**Status**: IN_PROGRESS (Staging Infrastructure Setup)  
**Target Domain**: `aicareershub.tech`  
**Staging Hostname**: `dev.aicareershub.tech`

---

## 1. Executive Summary & Purpose

Antigravity Career Hub uses a **persistent named Cloudflare Tunnel (`cloudflared`)** (`career-hub-dev`) to expose the locally running Fastify / Node.js application (`http://localhost:3000`) to a stable public HTTPS URL on `https://dev.aicareershub.tech`.

### Purpose of the Staging Environment
This environment is strictly designed for **testing and staging validation** of external cloud integrations that require public HTTPS ingress:
1. **GitHub OAuth 2.1 Authorization Code Flow**: End-to-end user authentication and session minting.
2. **GitHub App Lifecycle Callbacks**: User-to-server linking and installation redirects.
3. **GitHub Webhooks Ingress**: Cryptographic HMAC-SHA256 signature verification over real GitHub event payloads.
4. **Remote MCP Connectivity**: Streamable HTTP (`POST /mcp`) invocations from cloud AI assistants (Anthropic Claude Web, OpenAI ChatGPT Developer Mode / Custom GPTs, Google Gemini).
5. **OAuth 2.1 Metadata Discovery**: RFC 9728 Protected Resource Metadata and RFC 8414 Authorization Server Metadata validation.
6. **Perimeter Security Hardening**: Verification of anti-spoofing client IP extraction, distributed rate limiting, and CSRF origin validation behind a trusted reverse proxy.

> [!IMPORTANT]
> **Staging Boundary & Safety Guarantee**:
> This setup is a **testing / staging environment**, NOT a production cloud cluster deployment.
> - The local application binds to `http://127.0.0.1:<PORT>` (default: `3000`).
> - Cloudflare Tunnel creates an encrypted outbound-only connection to Cloudflare Edge. Zero inbound router ports are opened.
> - All Cloudflare credentials (`cert.pem`, `<TUNNEL_UUID>.json`) reside strictly outside the repository in the user's home profile (`%USERPROFILE%\.cloudflared\`).
> - Local development (`npm run dev` / `npm test`) remains 100% functional on `http://localhost:3000` without requiring `cloudflared`.

---

## 2. End-to-End Network Topology

```
+-----------------------------------------------------------------------------------------+
|                                    PUBLIC INTERNET                                      |
|   [User Browser]     [GitHub Webhook Ingress]     [Claude.ai / ChatGPT / Gemini MCP]    |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v (HTTPS / TLS 1.3 on Port 443)
+-----------------------------------------------------------------------------------------+
|                                CLOUDFLARE GLOBAL ANYCAST EDGE                           |
|   - DNS Resolution: dev.aicareershub.tech -> CNAME <TUNNEL_UUID>.cfargotunnel.com       |
|   - TLS 1.2 / 1.3 Termination (Cloudflare Edge Certificate)                             |
|   - Edge DDoS & Rate Limiting                                                           |
|   - Header Ingestion & Injection:                                                       |
|       * CF-Connecting-IP: <real_client_ip> (Authoritative, unforgeable)                 |
|       * X-Forwarded-For: <real_client_ip>, <cf_ip>                                      |
|       * X-Forwarded-Proto: https                                                        |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v (Encrypted Outbound QUIC / HTTP/2 Tunnel)
+-----------------------------------------------------------------------------------------+
|                                LOCAL DEVELOPMENT MACHINE                                |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |   cloudflared Daemon (Persistent Named Tunnel: career-hub-dev)                  |   |
|   |   - Authenticated with %USERPROFILE%\.cloudflared\<TUNNEL_UUID>.json            |   |
|   |   - Ingress Rule: dev.aicareershub.tech -> http://127.0.0.1:3000                |   |
|   |   - Catch-all Ingress: http_status:404                                          |   |
|   +----------------------------------------+----------------------------------------+   |
|                                            |                                            |
|                                            v (Loopback HTTP on 127.0.0.1:3000)          |
|   +---------------------------------------------------------------------------------+   |
|   |   Fastify Application (antigravity-career-hub)                                  |   |
|   |   - trustProxy: true (in production / staging mode)                             |   |
|   |   - extractClientIp: extracts CF-Connecting-IP behind proxy                     |   |
|   |   - Multi-tier Rate Limiter, DB Pool Guard & Concurrency Semaphore              |   |
|   |   - Route Handlers: /mcp, /auth/*, /integrations/*, /webhooks/*, /healthz       |   |
|   +----------------------------------------+----------------------------------------+   |
|                                            |                                            |
+--------------------------------------------|--------------------------------------------+
                                             |
                                             v (TLS 1.3 / SSL Mode Require)
+-----------------------------------------------------------------------------------------+
|                               AIVEN MANAGED POSTGRESQL 17                               |
|   - Multi-tenant schemas, evidence graphs, sessions, OAuth tokens, audit logs           |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Domain & DNS Architecture

### Domain Allocation
* **Apex Domain**: `aicareershub.tech` (Acquired via GitHub Student Developer Pack).
* **DNS Provider & Nameservers**: Cloudflare DNS.

### DNS Records Structure
| Hostname | Record Type | Target / Value | Purpose | Status |
| :--- | :--- | :--- | :--- | :--- |
| `dev.aicareershub.tech` | `CNAME` | `<TUNNEL_UUID>.cfargotunnel.com` (Proxied) | Staging HTTPS Ingress | **Active (P14-004)** |
| `app.aicareershub.tech` | `CNAME` | (Future Production Host) | Production Web Application | *Planned (Phase 14 Final)* |
| `api.aicareershub.tech` | `CNAME` | (Future Production Host) | Production API Gateway | *Planned (Phase 14 Final)* |
| `aicareershub.tech` | `CNAME` / `A` | (Future Apex Redirect) | Apex Root Redirect | *Planned (Phase 14 Final)* |

---

## 4. Cloudflare Tunnel Setup & Configuration

### Prerequisites
1. Windows 11 / 10 machine with PowerShell 5.1+ or PowerShell 7+.
2. Cloudflare account with active domain `aicareershub.tech`.
3. Node.js runtime (v20+) with Career Hub dependencies installed.

### Step 1: Install `cloudflared` CLI
Run in an elevated PowerShell session:
```powershell
winget install Cloudflare.cloudflared
```
*Verify installation*:
```powershell
cloudflared --version
```

### Step 2: Authenticate `cloudflared` with Cloudflare
```powershell
cloudflared tunnel login
```
* The CLI opens a browser window prompting you to log into Cloudflare.
* Select domain `aicareershub.tech`.
* Upon confirmation, Cloudflare downloads the origin certificate to:
  `%USERPROFILE%\.cloudflared\cert.pem`

### Step 3: Create Persistent Named Tunnel
```powershell
cloudflared tunnel create career-hub-dev
```
* Output returns the assigned **Tunnel UUID** and creates credentials JSON:
  `%USERPROFILE%\.cloudflared\<TUNNEL_UUID>.json`

### Step 4: Route Staging DNS to Named Tunnel
```powershell
cloudflared tunnel route dns career-hub-dev dev.aicareershub.tech
```
* Creates a proxied CNAME in Cloudflare DNS pointing `dev.aicareershub.tech` to `<TUNNEL_UUID>.cfargotunnel.com`.

### Step 5: Author Tunnel Configuration (`config.yml`)
Create the configuration file at `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: career-hub-dev
credentials-file: C:\Users\VISHW\.cloudflared\<YOUR_TUNNEL_UUID>.json

ingress:
  # Route staging hostname to the verified local Fastify listening port
  - hostname: dev.aicareershub.tech
    service: http://127.0.0.1:3000
    originRequest:
      connectTimeout: 30s
      noTLSVerify: false

  # Mandatory catch-all rule: reject all other hostnames and traffic
  - service: http_status:404
```

> [!CAUTION]
> **Credentials Location**: Never place `config.yml` or `<TUNNEL_UUID>.json` inside the git repository. Keep them strictly under `%USERPROFILE%\.cloudflared\`.

### Step 6: Start and Verify Tunnel
```powershell
cloudflared tunnel --config "$HOME\.cloudflared\config.yml" run career-hub-dev
```

---

## 5. Staging Environment Configuration

When starting Career Hub for staging verification, configure `.env.staging.local` (or supply environment variables):

```env
# ==============================================================================
# Antigravity Career Hub - Staging Environment Configuration
# ==============================================================================

# Server Runtime & Port Binding
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Staging Public URLs
APP_URL=https://dev.aicareershub.tech
MCP_BASE_URL=https://dev.aicareershub.tech/mcp
OAUTH_ISSUER_URL=https://dev.aicareershub.tech
OAUTH_RESOURCE_URL=https://dev.aicareershub.tech/mcp

# Database (Aiven Managed PostgreSQL 17)
DATABASE_URL=postgres://<username>:<password>@<aiven-host>:<port>/defaultdb?sslmode=require
DATABASE_SSL=require
DATABASE_POOL_MIN=1
DATABASE_POOL_MAX=5
DATABASE_STATEMENT_TIMEOUT_MS=10000

# Cryptographic Keys (AES-256-GCM)
ENCRYPTION_MASTER_KEY=<64_HEX_CHARACTERS_OR_44_B64>
ENCRYPTION_KEY_VERSION=v1
SESSION_COOKIE_NAME=career_hub_session
SESSION_COOKIE_SECRET=<HIGH_ENTROPY_STRING_MIN_32_CHARS>

# GitHub OAuth 2.1 App (User Authentication)
GITHUB_CLIENT_ID=<STAGING_GITHUB_OAUTH_CLIENT_ID>
GITHUB_CLIENT_SECRET=<STAGING_GITHUB_OAUTH_CLIENT_SECRET>
GITHUB_OAUTH_REDIRECT_URI=https://dev.aicareershub.tech/auth/github/callback

# GitHub App Integration (Repository Ingestion & Webhooks)
GITHUB_APP_ID=<STAGING_GITHUB_APP_ID>
GITHUB_APP_SLUG=antigravity-career-hub-dev
GITHUB_APP_CLIENT_ID=<STAGING_GITHUB_APP_CLIENT_ID>
GITHUB_APP_CLIENT_SECRET=<STAGING_GITHUB_APP_CLIENT_SECRET>
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=<STAGING_GITHUB_WEBHOOK_HMAC_SECRET>

# Telemetry
LOG_LEVEL=info
```

---

## 6. GitHub Integration Endpoints & Configuration

Configure these exact URLs in the **GitHub Developer Settings**:

### 1. GitHub OAuth App Settings (Login with GitHub)
* **Application name**: `Antigravity Career Hub (Dev/Staging)`
* **Homepage URL**: `https://dev.aicareershub.tech`
* **Authorization callback URL**: `https://dev.aicareershub.tech/auth/github/callback`

### 2. GitHub App Settings (Resource Connectors & Webhooks)
* **GitHub App name**: `Antigravity Career Hub Dev`
* **Homepage URL**: `https://dev.aicareershub.tech`
* **Callback URL (User-to-Server)**: `https://dev.aicareershub.tech/auth/github/callback`
* **Setup URL (Optional installation redirect)**: `https://dev.aicareershub.tech/integrations/github/install/callback`
* **Webhook URL**: `https://dev.aicareershub.tech/webhooks/github`
* **Webhook Secret**: Matches `GITHUB_WEBHOOK_SECRET` in `.env.local` / `.env.staging.local`
* **Permissions**:
  * Repository metadata: `Read-only`
  * Repository contents: `Read & write`
  * Pull requests: `Read & write`
* **Events**: `push`, `installation`, `installation_repositories`

---

## 7. Remote MCP Client Integration & Metadata Endpoints

### Public MCP Endpoint Contract
* **URL**: `POST https://dev.aicareershub.tech/mcp`
* **Transport**: Streamable HTTP (2026-07-28 MCP Standard)
* **Authentication**: Bearer Token (`Authorization: Bearer <token>`)

### Metadata Discovery Endpoints (RFC 9728 & RFC 8414)
1. **Protected Resource Metadata**:
   * **URL**: `GET https://dev.aicareershub.tech/.well-known/oauth-protected-resource`
   * **Response**:
     ```json
     {
       "resource": "https://dev.aicareershub.tech/mcp",
       "authorization_servers": ["https://dev.aicareershub.tech"],
       "scopes_supported": ["career:read", "career:write"],
       "bearer_methods_supported": ["header"],
       "resource_documentation": "https://dev.aicareershub.tech/docs/mcp"
     }
     ```
2. **OAuth 2.0 Authorization Server Metadata**:
   * **URL**: `GET https://dev.aicareershub.tech/.well-known/oauth-authorization-server`
   * **Endpoints provided**:
     * `authorization_endpoint`: `https://dev.aicareershub.tech/oauth/authorize`
     * `token_endpoint`: `https://dev.aicareershub.tech/oauth/token`
     * `revocation_endpoint`: `https://dev.aicareershub.tech/oauth/revoke`
     * `code_challenge_methods_supported`: `["S256"]`

### Pre-Configured Remote AI Clients
* **Anthropic Claude Web (`claude-web`)**:
  * Authorized Redirect URI: `https://claude.ai/api/mcp/auth_callback`
* **OpenAI ChatGPT Web (`chatgpt-web`)**:
  * Authorized Redirect URIs: `https://chatgpt.com/api/mcp/oauth_callback`, `https://chat.openai.com/api/mcp/oauth_callback`
* **Native Desktop / CLI Clients (`claude-desktop`, `claude-cli`)**:
  * Authorized Loopback URIs: `http://localhost/callback`, `http://127.0.0.1/callback`

---

## 8. Proxy & Client IP Security Architecture

### 1. Trust Boundary Definition
```
Untrusted Client -> Cloudflare Anycast Edge (Untrusted Headers Stripped)
                 -> cloudflared (Encrypted QUIC Tunnel)
                 -> Fastify Application (127.0.0.1:3000)
```

### 2. Client IP Extraction Rules ([`src/utils/extract-client-ip.js`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/utils/extract-client-ip.js))

| Scenario | Connection Path | `trustProxy` Setting | Injected Headers | Resolved Client IP | Security Guarantee |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A. Real Request via Staging** | Internet -> Cloudflare Edge -> Tunnel -> App | `true` | `CF-Connecting-IP: 203.0.113.1` (Edge) | `203.0.113.1` | Real client IP extracted accurately |
| **B. Spoofed `X-Forwarded-For`** | Direct Localhost -> App | `false` | `X-Forwarded-For: 10.0.0.99` | `127.0.0.1` | Spoofed proxy header ignored |
| **C. Spoofed `CF-Connecting-IP`** | Direct Localhost -> App | `false` | `CF-Connecting-IP: 1.2.3.4` | `127.0.0.1` | Spoofed Cloudflare header ignored |
| **D. Direct Localhost Request** | Direct Localhost -> App | `false` / `true` | None | `127.0.0.1` | Loopback socket address used safely |
| **E. Rate Limiter Key Selection** | Any Request | `true` / `false` | Header Variants | `ip:<resolved_ip>` | Rate limit identity strictly isolated |

### 3. CSRF & Origin Verification ([`src/middleware/auth.middleware.js`](file:///C:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/middleware/auth.middleware.js))
* State-changing requests (POST, PUT, DELETE) undergo strict `verifyCsrf` validation:
  * `Origin` must match `config.APP_URL` (`https://dev.aicareershub.tech`) or loopback.
  * Cross-origin requests from arbitrary third-party web domains are rejected immediately with `403 CSRF_DETECTED`.

---

## 9. Operational Lifecycle Runbook

### How to Start the Tunnel
```powershell
cloudflared tunnel --config "$HOME\.cloudflared\config.yml" run career-hub-dev
```

### How to Stop the Tunnel
* In foreground mode: Press `Ctrl + C`.
* If running as a Windows Service:
  ```powershell
  Stop-Service cloudflared
  ```

### How to Restart the Tunnel
```powershell
# Foreground mode: Restart process
cloudflared tunnel --config "$HOME\.cloudflared\config.yml" run career-hub-dev

# Windows Service mode:
Restart-Service cloudflared
```

### Troubleshooting Matrix

| Symptom / Error | Root Cause | Remediation |
| :--- | :--- | :--- |
| **Cloudflare Error 1033 (Tunnel Not Found / Offline)** | `cloudflared` process is not running on the local machine | Run `cloudflared tunnel run career-hub-dev` and verify output logs indicate active connections to edge data centers. |
| **HTTP 502 Bad Gateway from Cloudflare** | Fastify application is not listening on `http://127.0.0.1:3000` | Start Career Hub (`npm start` or `npm run dev`) and test `curl http://127.0.0.1:3000/livez` locally. |
| **DNS Resolution Fails for `dev.aicareershub.tech`** | DNS CNAME route missing in Cloudflare dashboard | Run `cloudflared tunnel route dns career-hub-dev dev.aicareershub.tech` or verify CNAME record in Cloudflare DNS. |
| **OAuth Callback Error: `redirect_uri_mismatch`** | GitHub OAuth App has `http://localhost:3000` instead of staging URL | Update GitHub Developer Settings to set Authorization callback URL to `https://dev.aicareershub.tech/auth/github/callback`. |
| **CSRF Error: `CSRF_DETECTED` on Form Submission** | `APP_URL` in `.env.local` is set to `http://localhost:3000` instead of `https://dev.aicareershub.tech` | Update `APP_URL=https://dev.aicareershub.tech` in `.env.local` (or run in staging mode) and restart Fastify. |
| **MCP 401 WWW-Authenticate shows `localhost`** | `OAUTH_ISSUER_URL` or `APP_URL` not updated in environment | Set `OAUTH_ISSUER_URL=https://dev.aicareershub.tech` and `OAUTH_RESOURCE_URL=https://dev.aicareershub.tech/mcp` in environment. |

---

## 10. Complete P14-004 Quality & Security Gates

- [x] **Public HTTPS Resolution & Connectivity**:
  - [x] `dev.aicareershub.tech` resolves to Cloudflare Edge.
  - [x] Valid Cloudflare TLS certificate presented (HTTPS).
  - [x] `GET https://dev.aicareershub.tech/livez` returns `200 OK`.
  - [x] `GET https://dev.aicareershub.tech/healthz` returns `200 OK` (database healthy, circuit breaker CLOSED, 0 leaked credentials).
- [x] **OAuth & Authentication**:
  - [x] `GET https://dev.aicareershub.tech/.well-known/oauth-protected-resource` returns RFC 9728 metadata.
  - [x] `GET https://dev.aicareershub.tech/.well-known/oauth-authorization-server` returns RFC 8414 metadata.
  - [x] Unauthenticated `POST https://dev.aicareershub.tech/mcp` returns `401 Unauthorized` with `WWW-Authenticate: Bearer realm="mcp", resource_metadata=".../.well-known/oauth-protected-resource"`.
  - [ ] GitHub OAuth login flow completes end-to-end via staging domain (requires human to configure GitHub OAuth settings).
- [ ] **GitHub Webhook Ingress**:
  - [x] `POST https://dev.aicareershub.tech/webhooks/github` reachable publicly.
  - [x] Valid HMAC `X-Hub-Signature-256` webhook accepted (`200 OK`).
  - [x] Invalid HMAC webhook rejected (`401 Unauthorized`).
- [ ] **Remote MCP Execution**:
  - [x] Remote MCP client (Claude Web / ChatGPT / Gemini) reachable at `https://dev.aicareershub.tech/mcp`.
  - [x] Authentication is strictly enforced with zero cross-tenant leak.
- [x] **Security & Anti-Spoofing Verification**:
  - [x] Spoofed forwarding headers tested and rejected on direct requests.
  - [x] Client IP extraction verified through Cloudflare tunnel.
  - [x] Zero tunnel credentials committed to repository.
  - [x] `npm run scan:secrets` and `npm run audit:deps` pass with 0 findings.
- [x] **Local Development Invariant**:
  - [x] `npm run dev` and `npm test` execute normally without `cloudflared`.

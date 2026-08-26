# Production Staging Deployment Runbook & Architecture Specification (ARCH-049)

**Document Identifier:** ARCH-049  
**Associated ADR:** ADR-069  
**Status:** IMPLEMENTED & VERIFIED  
**Phase:** Phase 13 — Public Multi-User Beta  
**Task:** P13-003  

---

## 1. Executive Summary & Staging Topology

This runbook defines the production staging deployment architecture for the **Antigravity Career Hub**. It transitions the system from ephemeral local Quick Tunnels to a persistent, secure, and monitorable staging infrastructure using **Cloudflare Named Tunnels**, **Managed PostgreSQL**, **Cloudflare-managed TLS/SSL**, and **Automated Health Probes**.

```
                                  PUBLIC INTERNET
                                         │
                   ┌─────────────────────┼─────────────────────┐
                   │                     │                     │
           Browser Users          Claude Remote MCP     ChatGPT Remote MCP
                   │                     │                     │
                   └─────────────────────┬─────────────────────┘
                                         │ HTTPS (TLS 1.3)
                                         ▼
                     ┌───────────────────────────────────────┐
                     │         CLOUDFLARE EDGE NETWORK       │
                     │  - Custom Staging Domain CNAME        │
                     │  - Automated Universal SSL (Edge)     │
                     │  - HTTP → HTTPS 301 Redirect & HSTS   │
                     │  - DDoS Mitigation & Edge WAF         │
                     └───────────────────┬───────────────────┘
                                         │ Encrypted Tunnel
                                         ▼
                     ┌───────────────────────────────────────┐
                     │    CLOUDFLARE NAMED TUNNEL DAEMON     │
                     │  (`cloudflared tunnel run <staging>`) │
                     │  - Zero inbound firewall ports opened │
                     └───────────────────┬───────────────────┘
                                         │ HTTP Loopback (127.0.0.1:3000)
                                         ▼
                     ┌───────────────────────────────────────┐
                     │       FASTIFY APPLICATION SERVICE     │
                     │  - Node.js LTS Process (PM2/systemd)  │
                     │  - NODE_ENV=production               │
                     │  - __Host- Cookie Prefix Protection   │
                     │  - RFC 9728 / RFC 8414 Metadata       │
                     │  - Streamable HTTP MCP (POST /mcp)    │
                     └───────────────────┬───────────────────┘
                                         │ PostgreSQL Wire (TLS Encrypted)
                                         ▼
                     ┌───────────────────────────────────────┐
                     │      MANAGED POSTGRESQL DATABASE      │
                     │  - Staging isolated instance / schema │
                     │  - Automated 7-day retention backups  │
                     │  - Drizzle ORM Connection Pool        │
                     └───────────────────────────────────────┘
```

---

## 2. Environment Configuration & Secret Isolation

Staging uses strictly environment-driven injection with zero secrets checked into Git:

```ini
# Core Runtime
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
APP_URL=https://<STAGING_DOMAIN>
OAUTH_ISSUER_URL=https://<STAGING_DOMAIN>
OAUTH_RESOURCE_URL=https://<STAGING_DOMAIN>/mcp

# Database Configuration (PostgreSQL with mandatory TLS)
DATABASE_URL=postgres://<user>:<password>@<staging-db-host>:5432/<staging-db-name>?sslmode=require
DATABASE_SSL=require
DATABASE_POOL_MIN=1
DATABASE_POOL_MAX=10
DATABASE_STATEMENT_TIMEOUT_MS=10000

# Cryptographic Keys (Mandatory in production mode)
ENCRYPTION_MASTER_KEY=<64-hex-or-44-base64-random-32-byte-key>
ENCRYPTION_KEY_VERSION=v1
SESSION_COOKIE_SECRET=<high-entropy-random-string>

# GitHub App Integration
GITHUB_CLIENT_ID=<staging-client-id>
GITHUB_CLIENT_SECRET=<staging-client-secret>
GITHUB_OAUTH_REDIRECT_URI=https://<STAGING_DOMAIN>/auth/github/callback
GITHUB_APP_ID=<staging-app-id>
GITHUB_APP_SLUG=<staging-app-slug>
GITHUB_APP_CLIENT_ID=<staging-app-client-id>
GITHUB_APP_CLIENT_SECRET=<staging-app-client-secret>
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=<staging-webhook-secret>

# AI Provider Credentials
GEMINI_API_KEY=<gemini-api-key>
GOOGLE_CLOUD_PROJECT=<gcp-project-id>
GOOGLE_CLOUD_LOCATION=<gcp-location>
```

---

## 3. Cloudflare Named Tunnel Setup

1. **Install `cloudflared` CLI**:
   ```bash
   # Windows PowerShell via winget:
   winget install --id Cloudflare.cloudflared
   # Linux:
   sudo apt-get install cloudflared
   ```

2. **Authenticate & Create Staging Tunnel**:
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create staging-career-hub
   ```

3. **Configure Tunnel Ingress (`/etc/cloudflared/config.yml` or `%USERPROFILE%\.cloudflared\config.yml`)**:
   ```yaml
   tunnel: <TUNNEL_UUID>
   credentials-file: /etc/cloudflared/<TUNNEL_UUID>.json

   ingress:
     - hostname: <STAGING_DOMAIN>
       service: http://localhost:3000
     - service: http_status:404
   ```

4. **Route DNS via Named Tunnel**:
   ```bash
   cloudflared tunnel route dns staging-career-hub <STAGING_DOMAIN>
   ```

5. **Run Tunnel as a Persistent System Service**:
   ```bash
   cloudflared service install
   # or run directly in process manager:
   cloudflared tunnel run staging-career-hub
   ```

---

## 4. Endpoints & Route Verification Matrix

| Endpoint | Method | Expected Status | Description |
|---|---|---|---|
| `/livez` | `GET` | `200 OK` | Zero-dependency process liveness probe. Returns JSON with uptime. |
| `/healthz` | `GET` | `200 OK` (or `503 Service Unavailable`) | Dependency readiness probe verifying PostgreSQL pool health. |
| `/.well-known/oauth-protected-resource` | `GET` | `200 OK` | RFC 9728 discovery returning resource `https://<STAGING_DOMAIN>/mcp`. |
| `/.well-known/oauth-authorization-server` | `GET` | `200 OK` | RFC 8414 discovery returning issuer and token endpoints. |
| `/auth/github` | `GET` | `302 Found` | Initiates GitHub OAuth 2.1 + PKCE authorization flow. |
| `/auth/github/callback` | `GET` | `302 Found` | Completes registration/onboarding and sets `__Host-career_hub_session`. |
| `/mcp` | `POST` | `200 OK` (JSON-RPC) | Streamable HTTP JSON-RPC 2.0 endpoint with Bearer authentication. |
| `/account` | `DELETE` | `200 OK` | GDPR Article 17 Hard Deletion (requires `OWNER` role + confirmation). |

---

## 5. Health Monitoring & Alerting Specification

- **Probe Configuration**: External uptime monitor (Cloudflare Health Checks, BetterStack, or UptimeRobot) configured to poll:
  - `GET https://<STAGING_DOMAIN>/livez` (Interval: 60s)
  - `GET https://<STAGING_DOMAIN>/healthz` (Interval: 60s)
- **Alert Policies**:
  - **Critical Alert**: `/healthz` returning 503 for $> 2$ consecutive polling intervals (PostgreSQL connectivity failure).
  - **Warning Alert**: HTTP 5xx response rate exceeding $1\%$ over a 5-minute rolling window.
  - **Latency Alert**: `/healthz` latency $> 250\text{ms}$ sustained for $> 5$ minutes.

---

## 6. Rollback & Disaster Recovery Procedures

1. **Application Rollback**:
   - Revert process/container to the preceding verified Git commit or container tag.
   - Restart process: `pm2 restart career-hub` or container restart.
   - Traffic routing through Cloudflare Named Tunnel immediately serves the restored application version.

2. **Database Schema Compatibility & Rollback**:
   - Drizzle schema changes strictly follow the **expand-and-contract pattern** (additive columns and non-breaking indexes only).
   - In the event of an application rollback, additive schema changes remain fully backward-compatible with the prior application version without requiring destructive column deletions.

3. **Backup Policy & GDPR Alignment**:
   - Managed PostgreSQL daily snapshots with 7-day retention.
   - Live hard deletions via `DELETE /account` take effect immediately on the active transactional database; expired backups purge naturally within the 7-day retention cycle in accordance with EDPB guidelines.

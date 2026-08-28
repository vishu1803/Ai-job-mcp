# Heroku Staging Architecture Review (P14-004)

*Architecture review only — no deployment, no domain purchase, no production infrastructure.*

---

## 1. Architecture Overview

```
Internet
    ↓
Heroku HTTPS (auto-provisioned TLS)
    ↓
Heroku Router (30s hard timeout, request queuing)
    ↓
Fastify 5 Application (web dyno)
    ├── Web UI (/, /login, /onboarding, /dashboard)
    ├── OAuth 2.1 (/.well-known/*, /oauth/*)
    ├── MCP Streamable HTTP (/mcp)
    ├── GitHub Webhooks (/webhooks/github)
    ├── GitHub App Callback (/integrations/github/install/callback)
    ├── GitHub OAuth Callback (/auth/github/callback)
    ├── Candidate Routes (/candidate/*)
    ├── Account Routes (/account/*)
    ├── Connection Routes (/connections/*)
    └── Security Controls
         ↓
Aiven PostgreSQL (external, TLS)
```

**Optional future addition:**
```
Internet
    ↓
Cloudflare DNS + Proxy (WAF, DDoS, caching)
    ↓
Heroku HTTPS
    ↓
Fastify Application
```

---

## 2. Heroku Runtime Assessment

### 2.1 Node.js Runtime Support

| Item | Value |
|---|---|
| **Heroku Node.js default** | 24.x (as of Dec 2025) |
| **Heroku Node.js latest** | 26.7.0 (Aug 2026) |
| **Our `engines.node`** | `>=20.0.0` — compatible |
| **Recommended version** | `"node": "24.x"` (LTS) in `package.json` engines |
| **ESM support** | Full (Heroku supports ESM Node.js apps) |

**Action required:** Update `package.json` engines from `>=20.0.0` to a specific range:
```json
"engines": { "node": "24.x" }
```
This ensures Heroku selects a known-good LTS version.

### 2.2 Build Process

Heroku's Node.js buildpack auto-detects:
1. Reads `engines.node` from `package.json`
2. Installs that Node.js version
3. Runs `npm install` (devDependencies excluded by `NODE_ENV=production`)
4. No build step required (no TypeScript compilation, no bundling)

**No `heroku-postbuild` script needed.** Database migrations are run manually via `heroku run npm run db:migrate`.

### 2.3 Start Command

| Item | Value |
|---|---|
| **package.json `start`** | `node src/index.js` |
| **Heroku Procfile** | Not needed — auto-detected from `start` script |
| **Heroku `web` process** | `node src/index.js` |

Heroku automatically uses the `start` script. A `Procfile` is optional but recommended for clarity:
```
web: node src/index.js
```

### 2.4 Environment / Config Vars

Heroku uses `config vars` (environment variables). Set via CLI or dashboard.

**Required for staging:**

| Config Var | Example Value | Source |
|---|---|---|
| `NODE_ENV` | `production` | Must be `production` for trustProxy + security hardening |
| `PORT` | (auto-set by Heroku) | Heroku injects this automatically |
| `DATABASE_URL` | `postgres://...@db-aiven.com:5432/career_hub` | Aiven PostgreSQL connection string |
| `ENCRYPTION_MASTER_KEY` | `64-hex-char-key` | Generate with `openssl rand -hex 32` |
| `SESSION_COOKIE_SECRET` | `random-secret` | Generate with `openssl rand -hex 32` |
| `GITHUB_CLIENT_ID` | `...` | GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | `...` | GitHub OAuth App |
| `GITHUB_OAUTH_REDIRECT_URI` | `https://<app>.herokuapp.com/auth/github/callback` | Must match GitHub settings |
| `GITHUB_APP_ID` | `...` | GitHub App settings |
| `GITHUB_APP_PRIVATE_KEY` | `-----BEGIN RSA PRIVATE KEY-----...` | GitHub App private key |
| `GITHUB_APP_WEBHOOK_SECRET` | `...` | GitHub App webhook secret |
| `APP_URL` | `https://<app>.herokuapp.com` | Used for OAuth metadata |
| `OAUTH_ISSUER_URL` | `https://<app>.herokuapp.com` | OAuth 2.1 issuer |
| `LOG_LEVEL` | `info` | Structured JSON logging |

**NOT required for staging:**
- No Heroku PostgreSQL add-on (we use Aiven)
- No Redis add-on (in-memory rate limiting is sufficient)

---

## 3. HTTP / Networking

### 3.1 Heroku HTTP Router Timeouts

| Timeout | Value | Impact |
|---|---|---|
| **Initial response** | 30 seconds hard limit | First byte must arrive within 30s or H12 error |
| **Total request** | 30 seconds (router-side) | Router drops connection, dyno continues processing |
| **Keep-alive** | 60 seconds (default) | Our `keepAliveTimeout: 30000` (30s) is fine |

**Critical for MCP:** MCP `tools/call` for expensive operations (resume generation, job-fit analysis) may approach 30s. Our current application-level timeouts are:
- `headersTimeout: 15000` (15s) ✅
- `keepAliveTimeout: 30000` (30s) ✅
- `connectionTimeoutMillis: 10000` (10s) for DB ✅
- `statement_timeout: 10000` (10s) for DB ✅

**Recommendation:** Ensure no MCP tool call takes >25s to avoid H12 errors. The DB statement timeout (10s) and connection timeout (10s) provide natural backpressure.

### 3.2 Client IP / trustProxy

| Deployment | `trustProxy` | `req.ip` behavior | `extractClientIp` behavior |
|---|---|---|---|
| **Local dev** | `false` | `127.0.0.1` (socket remote) | Uses `req.ip` directly |
| **Heroku** | `true` (NODE_ENV=production) | Leftmost `X-Forwarded-For` (client IP) | Uses `req.ip` (which is the client IP) |
| **Heroku + Cloudflare** | `true` | Leftmost `X-Forwarded-For` (Cloudflare → client) | `CF-Connecting-IP` takes precedence |

**Security verification:**
- Heroku's router sets `X-Forwarded-For: <client-ip>, <heroku-router-ip>` 
- With `trustProxy: true`, Fastify's `req.ip` returns the leftmost (client) IP ✅
- `extractClientIp()` detects the proxy via `req.ip !== req.socket.remoteAddress` ✅
- `CF-Connecting-IP` is only trusted when proxy is detected ✅
- Direct requests to the dyno (bypassing router) get `req.socket.remoteAddress` ✅

**P14-003 client-IP spoofing protection remains correct on Heroku.**

### 3.3 TLS

- Heroku auto-provisions TLS certificates for `*.herokuapp.com`
- TLS 1.2+ enforced by Heroku router
- No certificate management required for staging
- Custom domains get free auto-provisioned TLS via Heroku

---

## 4. Resume File Storage — CRITICAL LIMITATION

### 4.1 Current Implementation

`DocumentStorageService` (`src/services/document-storage.service.js`):
- Stores encrypted resume blobs on **local filesystem**
- Path: `storage/documents/{tenantId}/{storageKey}.enc`
- Uses `fs.writeFile()` / `fs.readFile()` / `fs.unlink()`

### 4.2 Heroku Ephemeral Filesystem

| Property | Value |
|---|---|
| **Filesystem lifetime** | Per dyno lifecycle |
| **Lost on** | Dyno restart, redeploy, daily cycling, sleep/wake |
| **Size limit** | ~1 GB (Eco: shared 512 MB) |
| **Restart frequency** | Every 24 hours (dyno cycling), every deploy |

### 4.3 Impact Assessment

| Scenario | Impact | Severity |
|---|---|---|
| **User uploads resume → dyno restarts** | Resume file is lost | HIGH |
| **User uploads resume → new deploy** | Resume file is lost | HIGH |
| **Resume already parsed → dyno restarts** | Parsed data in DB persists, but raw file gone | MEDIUM |
| **Local development** | Filesystem persists normally | N/A |

### 4.4 Verdict

| Question | Answer |
|---|---|
| **A. Safe for temporary staging-only testing?** | **YES, with caveats** — files exist between restarts. Resume upload + parse + store works within a single dyno lifecycle. |
| **B. Safe across dyno restarts?** | **NO** — all uploaded files are lost on restart. |
| **C. What happens on dyno restart/redeploy?** | All files in `storage/documents/` are deleted. |
| **D. Do uploaded resume files disappear?** | **YES**, on every dyno restart or deploy. |
| **E. Phase 15 architecture?** | External storage (S3, GCS, or database blobs) or cloud document connectors (Google Drive, OneDrive, Notion). |

### 4.5 Recommendation for Staging

**Accept the limitation for staging.** Document it clearly:
- Resume upload works for testing within a single dyno lifecycle
- Files are ephemeral — this is expected behavior for staging
- Do NOT rely on resume persistence across restarts
- Phase 15 (P15-002: Cloud Document Connectors) will provide persistent storage

**Alternative (if persistence is required for staging):**
- Use Aiven PostgreSQL `bytea` column to store encrypted resume blobs
- This would require a schema migration and service refactor — not recommended for P14-004

---

## 5. Database Architecture

### 5.1 Connectivity

```
Heroku Dyno (Node.js)
    ↓ TCP/TLS (outbound)
Aiven PostgreSQL (external)
    - TLS required (Aiven default)
    - Connection string: sslmode=require or sslmode=verify-full
    - Hostname: db-aiven.com (public DNS)
```

### 5.2 Pool Configuration (Current)

| Setting | Value | Heroku Assessment |
|---|---|---|
| `min` | 1 (default) | ✅ Good — keeps one warm connection |
| `max` | 5 (default, 10 staging) | ✅ Good — Eco dyno has limited RAM |
| `idleTimeoutMillis` | 30s | ✅ Good — prevents idle connection buildup |
| `connectionTimeoutMillis` | 10s | ✅ Good — reasonable for cross-internet |
| `statement_timeout` | 10s | ✅ Good — prevents runaway queries |
| `keepAlive` | true | ✅ Critical — prevents NAT timeout drops |
| `keepAliveInitialDelayMillis` | 10s | ✅ Good |
| SSL | `rejectUnauthorized: false` | ⚠️ Acceptable for staging; consider `true` for production |

### 5.3 Connection Limits

- Aiven PostgreSQL plans have connection limits (e.g., Hobby: 97 connections)
- Our pool `max: 5` per dyno is well within limits
- Single Eco/Basic dyno = 1 pool = max 5 connections ✅
- No connection exhaustion risk with single-instance deployment

### 5.4 Recommendation

**Keep current pool settings.** They are already well-tuned for a single-instance deployment. The `DbPoolGuard` circuit breaker provides additional protection if utilization spikes.

For production multi-instance deployment:
- Reduce `max` per instance to 3-4
- Monitor total connections across all instances
- Consider PgBouncer for connection pooling

---

## 6. MCP Streamable HTTP Compatibility

### 6.1 Transport Protocol

| MCP Transport | Heroku Support | Notes |
|---|---|---|
| **Streamable HTTP (POST /mcp)** | ✅ Supported | Standard HTTP POST — works on any platform |
| **SSE (GET /mcp)** | ✅ Supported | Heroku supports long-lived HTTP connections |
| **JSON-RPC over HTTP** | ✅ Supported | Standard HTTP |

### 6.2 MCP Endpoint on Heroku

```
https://<app-name>.herokuapp.com/mcp
```

**Behavior:**
- `POST /mcp` — JSON-RPC requests (initialize, tools/list, tools/call)
- Standard HTTP request/response cycle
- 30s Heroku router timeout is the main constraint
- Our application-level timeouts (10s DB, 15s headers) provide natural backpressure

### 6.3 MCP Client Compatibility

| Client | Can Test with Heroku? | Notes |
|---|---|---|
| **Claude (Remote MCP)** | ✅ YES — with HTTPS endpoint | Requires OAuth 2.1 + PKCE configuration |
| **ChatGPT (Remote MCP)** | ✅ YES — with HTTPS endpoint | Requires OAuth metadata endpoints |
| **Gemini** | ✅ YES — via MCP API token | Personal token auth, no OAuth needed |
| **Local MCP clients** | ✅ YES — via public URL | Can point to `https://<app>.herokuapp.com/mcp` |

### 6.4 OAuth Metadata Endpoints

Heroku will serve these correctly:
```
GET /.well-known/oauth-authorization-server
GET /.well-known/oauth-protected-resource
GET /oauth/authorize
POST /oauth/token
POST /oauth/register
```

All standard HTTP — no Heroku-specific configuration needed.

### 6.5 Long-Lived Requests

- MCP `tools/call` may take 5-20s for expensive operations
- Heroku's 30s router timeout allows this ✅
- Our `statement_timeout: 10s` prevents DB-level hangs ✅
- Application-level semaphore limits concurrent expensive operations ✅

---

## 7. GitHub OAuth / GitHub App / Webhooks

### 7.1 Callback URLs for Heroku Staging

| Callback | Local | Heroku Staging |
|---|---|---|
| **GitHub OAuth** | `http://localhost:3000/auth/github/callback` | `https://<app>.herokuapp.com/auth/github/callback` |
| **GitHub App Install** | `http://localhost:3000/integrations/github/install/callback` | `https://<app>.herokuapp.com/integrations/github/install/callback` |
| **GitHub Webhook** | `http://localhost:3000/webhooks/github` | `https://<app>.herokuapp.com/webhooks/github` |

### 7.2 Configuration Changes Required

**In GitHub OAuth App settings:**
- Update callback URL to `https://<app>.herokuapp.com/auth/github/callback`

**In GitHub App settings:**
- Update callback URL to `https://<app>.herokuapp.com/integrations/github/install/callback`
- Update webhook URL to `https://<app>.herokuapp.com/webhooks/github`
- Ensure webhook secret matches `GITHUB_APP_WEBHOOK_SECRET` config var

**In application config vars:**
- `GITHUB_OAUTH_REDIRECT_URI=https://<app>.herokuapp.com/auth/github/callback`
- `APP_URL=https://<app>.herokuapp.com`
- `OAUTH_ISSUER_URL=https://<app>.herokuapp.com`

### 7.3 Webhook Delivery

- GitHub sends webhooks to `https://<app>.herokuapp.com/webhooks/github`
- Heroku receives the webhook and routes to the dyno
- HMAC-SHA256 signature verification is unchanged ✅
- Webhook deduplication (in-memory) works on single instance ✅

---

## 8. AI Client Integration

### 8.1 What Becomes Possible with Heroku HTTPS

| Capability | Status | Requirement |
|---|---|---|
| **Claude Remote MCP** | 🟡 CAN TEST | Public HTTPS + OAuth 2.1 config |
| **ChatGPT Remote MCP** | 🟡 CAN TEST | Public HTTPS + OAuth metadata |
| **Gemini MCP** | ✅ CAN TEST | Public HTTPS + API token |
| **Local MCP clients** | ✅ CAN TEST | Public URL available |
| **Custom domain** | 🔲 FUTURE | Heroku custom domain add-on |
| **MCP Registry listing** | 🔲 FUTURE | Requires stable domain |

### 8.2 Claude Integration

With `https://<app>.herokuapp.com/mcp`:
1. Claude Desktop/Web can connect via custom connector
2. OAuth 2.1 + PKCE flow works over HTTPS
3. All 16 MCP tools accessible
4. **Limitation:** Claude custom connector requires a stable URL — Heroku app names are stable as long as the app exists

### 8.3 ChatGPT Integration

With `https://<app>.herokuapp.com/mcp`:
1. ChatGPT can discover OAuth metadata at `/.well-known/*`
2. MCP tools accessible via Streamable HTTP
3. **Note:** ChatGPT MCP support may require specific configuration

### 8.4 Gemini Integration

With `https://<app>.herokuapp.com/mcp`:
1. Gemini uses personal MCP API tokens (not OAuth)
2. Token auth works over any HTTPS endpoint
3. All 16 tools accessible

---

## 9. Cloudflare Decision

### 9.1 Options Comparison

| Option | Pros | Cons | Recommendation |
|---|---|---|---|
| **A. Heroku directly** | Simplest, zero config, free TLS | No WAF, no DDoS beyond Heroku's basic protection | ✅ **RECOMMENDED FOR STAGING** |
| **B. Heroku + Cloudflare DNS** | Custom domain, basic DDoS | Extra DNS management, no origin protection | 🔲 Future option |
| **C. Heroku + Cloudflare Proxy/WAF** | Full WAF, DDoS, caching, rate limiting | Complexity, double TLS termination, IP masking | 🔲 Production option |
| **D. Heroku + Cloudflare Tunnel** | Zero inbound ports, origin protection | Overkill for staging, tunnel maintenance | ❌ Not needed for Heroku |

### 9.2 Rationale

**For staging: Heroku directly is sufficient.**

- Heroku provides: TLS, basic DDoS mitigation, HTTP routing, load balancing
- Heroku does NOT provide: WAF, advanced rate limiting, bot management, custom caching
- Application-level rate limiting (P14-003) provides per-IP/per-tenant/per-token protection
- The `DbPoolGuard` circuit breaker protects the database

**Cloudflare becomes valuable when:**
- Custom domain is needed (`staging.careerhub.ai`)
- Advanced WAF rules are required
- Edge caching for the web UI is beneficial
- Production-grade DDoS protection is needed

### 9.3 Future Cloudflare Architecture (Production)

```
Internet
    ↓
Cloudflare Edge (WAF, DDoS, rate limiting, caching)
    ↓
Cloudflare DNS → Heroku CNAME
    ↓
Heroku HTTPS (auto TLS)
    ↓
Fastify Application
    ↓
Aiven PostgreSQL
```

---

## 10. Security Considerations

### 10.1 What Heroku Provides

| Security Feature | Heroku | Our Application |
|---|---|---|
| **TLS** | Auto-provisioned ✅ | N/A |
| **DDoS (basic)** | Heroku router absorbs ✅ | Application rate limiting ✅ |
| **DDoS (advanced)** | ❌ Not provided | Cloudflare (future) |
| **WAF** | ❌ Not provided | Cloudflare (future) |
| **Bot management** | ❌ Not provided | Application rate limiting ✅ |
| **IP spoofing protection** | Heroku router strips spoofed headers ✅ | `extractClientIp` validates proxy ✅ |

### 10.2 Environment Secrets

- Heroku config vars are encrypted at rest
- Config vars are NOT in the Git repository ✅
- Config vars are injected as environment variables at runtime ✅
- Logs may contain config var values if accidentally logged — Pino redaction is active ✅

### 10.3 Process Lifecycle

| Event | Behavior |
|---|---|
| **Deploy** | New dyno starts → old dyno terminated (zero-downtime with Eco/Basic) |
| **Daily cycling** | Dyno restarted every 24 hours |
| **Sleep (Eco only)** | After 30 min idle, dyno sleeps. First request takes ~30s to wake. |
| **Crash** | Dyno restarted automatically |
| **SIGTERM** | Graceful shutdown handler runs (`src/index.js`) |

### 10.4 Graceful Shutdown

Our `src/index.js` handles `SIGINT` and `SIGTERM`:
```javascript
process.on('SIGTERM', async () => {
  await app.close(); // Drains DB pool, stops rate limiter, etc.
  process.exit(0);
});
```

This is correct for Heroku — Heroku sends `SIGTERM` before terminating a dyno.

### 10.5 Database Pool on Restart

- `app.close()` calls `closeDatabase()` which drains the pool
- Heroku's router stops sending new requests before `SIGTERM`
- Connection pool is properly cleaned up ✅

### 10.6 Rate Limiter on Restart

- In-memory rate limiter state is lost on dyno restart
- This is acceptable — rate limiting resets are brief and infrequent
- Abuse protection resumes immediately on restart ✅

---

## 11. Deployment Architecture

### 11.1 Local Development

```
localhost:3000
    ↓
Fastify (trustProxy: false)
    ↓
Local PostgreSQL (or Aiven via DATABASE_URL)
    ↓
Local filesystem (storage/documents/)
```

### 11.2 Heroku Staging

```
https://<app>.herokuapp.com
    ↓
Heroku Router (HTTPS, trustProxy: true)
    ↓
Fastify (production mode)
    ↓
Aiven PostgreSQL (TLS)
    ↓
Ephemeral filesystem (storage/documents/) — files lost on restart
```

### 11.3 Future Production (Cloudflare + Heroku)

```
https://staging.careerhub.ai (or production domain)
    ↓
Cloudflare Edge (WAF, DDoS, TLS termination)
    ↓
Cloudflare DNS → Heroku CNAME
    ↓
Heroku HTTPS
    ↓
Fastify (trustProxy: true — must also trust CF-Connecting-IP)
    ↓
Aiven PostgreSQL (TLS)
    ↓
External storage (S3/GCS) — persistent resume blobs
```

---

## 12. Manual Setup Requirements

### Human Must Configure

| Action | Where | Notes |
|---|---|---|
| Create Heroku account | heroku.com | Or use GitHub Student Developer Pack |
| Claim GitHub Student credits | heroku.com/github-students | $13/month × 24 months |
| Create Heroku app | `heroku create <app-name>` | Choose app name carefully (becomes URL) |
| Set config vars | Heroku dashboard or CLI | All env vars from §2.4 |
| Generate encryption key | `openssl rand -hex 32` | Set as `ENCRYPTION_MASTER_KEY` |
| Update GitHub OAuth callback | GitHub OAuth App settings | `https://<app>.herokuapp.com/auth/github/callback` |
| Update GitHub App callback | GitHub App settings | `https://<app>.herokuapp.com/integrations/github/install/callback` |
| Update GitHub webhook URL | GitHub App settings | `https://<app>.herokuapp.com/webhooks/github` |
| Verify Aiven connectivity | `heroku run "node -e \"import('./src/db/index.js').then(m => m.checkDatabaseHealth())\""` | Confirm TLS works |

### Agent Can Automate

| Action | Command |
|---|---|
| Create Heroku app | `heroku create <app-name>` |
| Set config vars | `heroku config:set KEY=VALUE` |
| Run database migration | `heroku run npm run db:migrate` |
| View logs | `heroku logs --tail` |
| Restart dyno | `heroku restart` |
| Deploy | `git push heroku main` |

---

## 13. Deployment Sequence

```
1.  Human: Create Heroku account + claim student credits
2.  Human: Create Heroku app (agent: heroku create)
3.  Agent: Set all config vars (heroku config:set)
4.  Human: Update GitHub OAuth callback URL
5.  Human: Update GitHub App callback URL
6.  Human: Update GitHub webhook URL
7.  Agent: git push heroku main
8.  Agent: heroku run npm run db:migrate
9.  Agent: Verify health — curl https://<app>.herokuapp.com/healthz
10. Human: Test GitHub OAuth login
11. Human: Test MCP endpoint with Gemini
12. Human: Test GitHub webhook delivery
13. Agent: Verify all integration tests pass against staging
```

---

## 14. Rollback

```
# If deployment fails:
heroku rollback

# If config vars are wrong:
heroku config:set KEY=corrected-value

# If database migration fails:
heroku run npm run db:migrate  # (Drizzle migrations are forward-only)
# Manual SQL rollback if needed
```

---

## 15. Known Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| **30s HTTP timeout** | Expensive MCP tools may approach limit | DB statement timeout (10s) + concurrency limits |
| **Ephemeral filesystem** | Resume files lost on restart | Acceptable for staging; Phase 15 adds persistent storage |
| **Eco dyno sleep** | 30s cold start after idle | Use Basic dyno ($7/mo) for always-on staging |
| **Single instance** | No horizontal scaling | Sufficient for staging; multi-instance requires Redis |
| **In-memory rate limiting** | Resets on dyno restart | Acceptable — restarts are infrequent |
| **No custom domain** | URL is `*.herokuapp.com` | Can add Heroku custom domain later |
| **No WAF** | Basic protection only | Add Cloudflare for production |
| **No SSH access** | Cannot inspect dyno directly | Use `heroku logs --tail` and `/healthz` endpoint |
| **Node.js 20 EOL** | Our `>=20.0.0` engine allows EOL versions | Update to `"node": "24.x"` |

---

## 16. GitHub Student Developer Pack

| Item | Value |
|---|---|
| **Credit** | $13/month for 24 months ($312 total) |
| **Covers** | Eco dyno ($5/mo) + Basic dyno ($7/mo) + Heroku Postgres ($0/mo hobby) |
| **Sign up** | heroku.com/github-students/signup |
| **Verification** | Requires active GitHub Student Developer Pack membership |

**Cost estimate for staging:**
- Eco dyno: $5/month (with sleep) OR Basic dyno: $7/month (always on)
- No Heroku Postgres add-on (using Aiven)
- **Total: $5-7/month** — well within $13/month credit
- **Credit runs out:** ~24 months from signup

---

## 17. Summary

| Question | Answer |
|---|---|
| **Heroku suitability** | ✅ Excellent for staging — simple, managed, student credits |
| **MCP suitability** | ✅ Streamable HTTP works natively; 30s timeout is manageable |
| **OAuth suitability** | ✅ HTTPS endpoints serve OAuth metadata correctly |
| **GitHub webhook suitability** | ✅ Standard HTTPS ingress, HMAC verification unchanged |
| **Aiven connectivity** | ✅ TLS outbound works; pool settings already correct |
| **Resume filesystem** | ⚠️ Ephemeral — acceptable for staging, needs Phase 15 fix |
| **Cloudflare recommendation** | Not needed for staging; add for production/custom domain |
| **Custom domain requirement** | No — `*.herokuapp.com` is sufficient for staging tests |
| **Security considerations** | ✅ trustProxy + extractClientIp works correctly on Heroku |
| **Manual setup** | ~10 minutes (account, app creation, config, GitHub callback updates) |
| **Automated setup** | Agent can handle config vars, deploy, migration, health check |

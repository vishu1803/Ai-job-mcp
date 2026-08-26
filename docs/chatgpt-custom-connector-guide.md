# ChatGPT Remote MCP & OAuth 2.1 Connector Setup Guide

> **Document ID**: `GUIDE-004`  
> **Related Specifications**: `ARCH-040` (`docs/chatgpt-mcp-connector-architecture.md`), `ARCH-041` (`docs/chatgpt-tier-compatibility-architecture.md`), `ARCH-042` (`docs/chatgpt-write-safety-architecture.md`), `ADR-060`–`ADR-063`  
> **Status**: APPROVED & VERIFIED  
> **Target Audience**: Platform Developers, Candidates, Self-Hosters, System Administrators  

---

## 1. Overview & Architecture

The **Antigravity AI Career Hub** provides a remote, standards-compliant [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server integrated with OpenAI ChatGPT (ChatGPT Web, ChatGPT Desktop, and Custom GPTs).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                    OPENAI CLIENT                                      │
│                                                                                        │
│   ┌───────────────────────────┐                ┌───────────────────────────────────┐   │
│   │   ChatGPT Web Client      │                │    ChatGPT Desktop App (mac/win)  │   │
│   │   (client_id: chatgpt-web)│                │  (client_id: chatgpt-desktop)      │   │
│   └─────────────┬─────────────┘                └─────────────────┬─────────────────┘   │
└─────────────────┼────────────────────────────────────────────────┼─────────────────────┘
                  │                                                │
                  ▼                                                ▼
     Redirect: https://chatgpt.com/api/mcp/oauth_callback    Loopback: http://localhost:<port>/callback
                  │                                                │
                  └───────────────────────┬────────────────────────┘
                                          │
                                          ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                       ANTIGRAVITY CAREER HUB (FASTIFY + DRIZZLE)                       │
│                                                                                        │
│   1. RFC 9728 Protected Resource Metadata (GET /.well-known/oauth-protected-resource)  │
│   2. RFC 8414 OAuth Authorization Metadata (GET /.well-known/oauth-authorization-srv) │
│   3. OAuth 2.1 Interactive Consent & PKCE S256 (/oauth/authorize & /oauth/token)       │
│   4. Streamable HTTP MCP Endpoint (POST /mcp with Bearer Token Authorization)          │
│   5. Two-Phase Write Safety & Stopping Protocols (propose -> confirm_and_create_pr)    │
│   6. Sovereign Multi-Tenant Isolation (Strict Default-Deny 404 Boundaries)             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Prerequisites

1. **Active Career Hub Instance**: Running locally (`http://localhost:3000`) or deployed behind HTTPS.
2. **PostgreSQL Database**: Migrated with standard Drizzle schema (`npm run db:check`).
3. **ChatGPT Plus / Team / Enterprise Account**: Required for Developer Mode / Custom GPT actions / Remote MCP connections.
4. **Public HTTPS Tunnel** (for local development only): `cloudflared` (recommended) or `ngrok`.

---

## 3. Public HTTPS Tunnel Setup (Local Development)

ChatGPT servers require a valid public HTTPS URL to perform OAuth 2.1 metadata discovery and token exchange.

### Option A: Cloudflare Tunnel (`cloudflared`) — Recommended

```bash
# 1. Install cloudflared (Windows PowerShell via winget)
winget install --id Cloudflare.cloudflared

# 2. Expose local Career Hub port (default: 3000)
cloudflared tunnel --url http://localhost:3000
```

`cloudflared` will generate a public URL like:
```text
https://career-hub-demo.trycloudflare.com
```

### Option B: ngrok

```bash
ngrok http 3000
```

> [!IMPORTANT]
> Set your public HTTPS tunnel domain in your `.env` configuration:
> ```env
> BASE_URL=https://career-hub-demo.trycloudflare.com
> ```

---

## 4. Configuring ChatGPT Custom Connector / Custom Action

### Step 1: Open ChatGPT GPT Builder or Developer Settings

1. Navigate to **[ChatGPT Explore GPTs](https://chatgpt.com/gpts/editor)** or open your custom GPT editor.
2. Under the **Configure** tab, scroll to **Actions** and click **Create new action** (or configure **MCP Server** if available in your workspace tier).

### Step 2: Configure Authentication (OAuth 2.1)

Select **OAuth** as the Authentication Type and enter the following parameters:

| Field | Value | Notes |
|---|---|---|
| **Auth Type** | `OAuth` | Strict OAuth 2.1 with PKCE S256 |
| **Client ID** | `chatgpt-web` | For Web; use `chatgpt-desktop` for Desktop loopback |
| **Client Secret** | *(Leave Blank)* | Public client; confidential secrets not required |
| **Authorize URL** | `https://<YOUR_TUNNEL_OR_DOMAIN>/oauth/authorize` | RFC 8414 compliant endpoint |
| **Token URL** | `https://<YOUR_TUNNEL_OR_DOMAIN>/oauth/token` | RFC 8414 compliant endpoint |
| **Scope** | `career:read career:write` | Space-delimited requested scopes |
| **Token Exchange Method** | `Default (POST payload - x-www-form-urlencoded)` | Supported automatically |

### Step 3: Discovery Endpoints

The server automatically serves discovery documents per RFC 9728 and RFC 8414:

- **Protected Resource Metadata**: `https://<YOUR_DOMAIN>/.well-known/oauth-protected-resource`
- **Authorization Server Metadata**: `https://<YOUR_DOMAIN>/.well-known/oauth-authorization-server`
- **OpenID Discovery**: `https://<YOUR_DOMAIN>/.well-known/openid-configuration`

### Step 4: Import MCP Tool Schema / OpenAPI Specification

Import the OpenAPI specification from your Career Hub endpoint:
```text
https://<YOUR_DOMAIN>/documentation/json
```

Or connect directly via ChatGPT MCP Connector pointing to:
```text
https://<YOUR_DOMAIN>/mcp
```

---

## 5. Tool Catalog Reference (9 Sovereign Tools)

| # | Tool Name | Scope | Role | Mutation | Description |
|---|---|---|---|---|---|
| 1 | `get_candidate_profile` | `career:read` | `READONLY+` | Read-only | Returns candidate headline, summary, top verified skills, and connected identities. |
| 2 | `list_verified_skills` | `career:read` | `READONLY+` | Read-only | Returns paginated list of skills with confidence scores and evidence links. |
| 3 | `inspect_project_evidence` | `career:read` | `READONLY+` | Read-only | Returns project details, commit SHA, file paths, and sanitized code excerpts. |
| 4 | `analyze_job_fit` | `career:read` | `READONLY+` | Read-only | Computes ATS match score, identifies matched/missing skills, and applies safety ceilings. |
| 5 | `generate_tailored_resume` | `career:write` | `MEMBER` | Read-only | Assembles ATS-optimized resume grounded strictly in verified candidate evidence. |
| 6 | `draft_cover_letter` | `career:write` | `MEMBER` | Read-only | Drafts 3–6 paragraph tailored cover letter with citation integrity reports. |
| 7 | `recommend_portfolio_projects` | `career:read` | `READONLY+` | Read-only | Ranks candidate portfolio repositories against target job descriptions. |
| 8 | `propose_project_improvement` | `career:write` | `MEMBER` | Read-only (Ticket) | Analyzes skill gaps and generates patch diff preview + ActionApprovalTicket. |
| 9 | `confirm_and_create_pr` | `career:write` | `MEMBER` | **Write** (Draft PR) | Authorizes and opens a Draft Pull Request on GitHub. Requires `confirmed: true`. |

---

## 6. Two-Phase Write Safety & Stopping Protocols

The platform enforces strict human-in-the-loop governance for all external mutations. ChatGPT **cannot** directly write to candidate repositories.

### Interaction Flow

```
1. ChatGPT calls propose_project_improvement
   └── Server generates code patch, validates AST, and mints ActionApprovalTicket.
   └── Response returns diffPreview, patchFingerprint, and explicit STOPPING INSTRUCTIONS.

2. ChatGPT displays diff and ticketId to the User:
   "I have generated a proposed improvement to add Redis caching.
    Ticket ID: 7f83b...
    Please review the diff below and confirm if you would like me to open a Draft PR."

3. User reviews and types: "Yes, please open the PR."

4. ChatGPT calls confirm_and_create_pr with:
   {
     "ticketId": "7f83b...",
     "confirmed": true,
     "userNotes": "Approved by user in ChatGPT chat"
   }
   └── Server creates feature branch feat/career-hub-... and opens GitHub Draft PR.
```

> [!CAUTION]
> If ChatGPT attempts to call `confirm_and_create_pr` with `confirmed: false` or without human confirmation, the request is immediately rejected with error code `-32602`.

---

## 7. Multi-Tenant Sovereign Isolation

- **Default-Deny 404**: If an authorized ChatGPT session attempts to query candidate IDs, projects, or tickets belonging to another tenant workspace, the server returns `404 NOT_FOUND` rather than `403 FORBIDDEN` to prevent resource enumeration.
- **Query Parameter Prohibited**: Passing OAuth tokens in URL query parameters (`/mcp?token=...`) is strictly rejected with `400 QUERY_TOKEN_PROHIBITED`. Tokens must always be passed in the `Authorization: Bearer <token>` header.

---

## 8. Refresh Token Rotation (RTR) & Security

1. **Short-Lived Access Tokens**: Access tokens expire after 1 hour (3600 seconds).
2. **Rotating Refresh Tokens**: Each call to `POST /oauth/token` with `grant_type=refresh_token` yields a fresh access token and a **new** single-use refresh token.
3. **Replay Detection**: If a previously consumed refresh token is presented again (indicating token theft), the authorization server immediately revokes the **entire token family**, protecting the candidate account.
4. **Explicit Revocation**: Calling `POST /oauth/revoke` immediately invalidates the token across all active MCP sessions.

---

## 9. Troubleshooting Matrix

| Symptom | Probable Cause | Resolution |
|---|---|---|
| `401 Unauthorized` with `resource_metadata` header | Request lacked `Authorization: Bearer <token>` header. | Perform OAuth login flow in ChatGPT to obtain a valid bearer token. |
| `400 invalid_client` | Client ID was not recognized. | Ensure client ID is set to `chatgpt-web` or `chatgpt-desktop`. |
| `400 invalid_target` | RFC 8707 `resource` parameter was missing or mismatched. | Verify `resource` parameter equals `https://<DOMAIN>/mcp`. |
| `400 invalid_grant` | PKCE `code_verifier` was invalid or authorization code already used. | Re-authenticate from the consent screen; codes are strictly single-use. |
| `403 FORBIDDEN` on write tools | User has `READONLY` role or token was minted with only `career:read`. | Re-authorize with `career:write` scope and ensure user role is `MEMBER` or `OWNER`. |
| `404 NOT_FOUND` on project/candidate | Candidate belongs to another tenant workspace. | Ensure queries target only resources within the authenticated tenant boundary. |

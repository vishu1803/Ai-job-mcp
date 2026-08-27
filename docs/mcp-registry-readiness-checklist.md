# Official MCP Registry Readiness Checklist & Publishing Guide

**Target Registry**: `registry.modelcontextprotocol.io`  
**Manifest Standard**: `server.json` (Revision `2025-12-11` / `2026-07-28`)  
**Current Status**: `PLANNED / NOT PUBLISHED`  
**Dependency**: `BLOCKED UNTIL PUBLIC STAGING (Phase 14)`

---

## 1. Executive Summary

This document establishes the official operational readiness criteria, technical specifications, and security checklists required prior to publishing **Antigravity Career Hub** on the public Model Context Protocol (MCP) Registry (`registry.modelcontextprotocol.io`).

> [!IMPORTANT]
> **No Public Publication During Phase 13.5**: Career Hub is configured with full registry metadata in `server.json` and verified with automated validation tests, but **must not be published** until a stable, permanent public HTTPS domain (`staging.careerhub.ai`) and Cloudflare Named Tunnel are active in Phase 14.

---

## 2. Official Registry Specification & Research Answers

### 2.1 Registry Identity & Namespace
1. **What is the current official MCP Registry?**
   - The central public catalog hosted at `registry.modelcontextprotocol.io`.
2. **Is publishing done through `server.json` or another mechanism?**
   - Publishing is performed via a `server.json` manifest conforming to `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json` using the `mcp-publisher` CLI or Git repository webhook.
3. **What exact metadata fields are required?**
   - `$schema`, `name`, `title`, `description`, `version`, `homepage`, `documentation`, `repository`, `license`, `transport`, `authentication`, and `capabilities`.
4. **How are namespaces established?**
   - Namespaces use reverse-DNS or GitHub organization/user scoping (e.g. `ai.careerhub/mcp-server` or `io.github.vishu1803/ai-career-agent`) to prevent namespace squatting.
5. **How is domain/ownership verification performed?**
   - For custom domains: DNS TXT record challenge (`_mcp-registry-verification.<domain>`).
   - For GitHub repositories: GitHub OAuth authentication verifying maintainer permissions on the target repository.

### 2.2 Transport, Security & Remote Auth
6. **What transport/protocol metadata must be declared?**
   - `transport.type: "http"`, `transport.url: "https://<domain>/mcp"`, `transport.protocolVersion: "2026-07-28"`.
7. **How should remote OAuth/authentication be represented?**
   - `authentication.type: "oauth2"` with `authorizationUrl`, `tokenUrl`, `discoveryUrl`, and explicit scope definitions (`career:read`, `career:write`).
8. **How are versions managed?**
   - Strict Semantic Versioning 2.0.0 (`MAJOR.MINOR.PATCH`). Each registry release is immutable and pinned to a commit tag.
9. **How are updates published?**
   - Updated `server.json` is submitted via `mcp-publisher update` or automated CI/CD pipeline upon git tag release.
10. **What deprecation/removal model exists?**
    - `status: "DEPRECATED"` field with `migrationTarget` metadata. Active servers remain accessible until grace period expiration.
11. **What icon/documentation/privacy/terms metadata is required?**
    - High-resolution SVG/PNG icons (`512x512`), documentation URL (`/docs/mcp`), privacy policy URL, and terms of service URL.

### 2.3 Domain & Environment Constraints
12. **Is a stable public HTTPS domain mandatory?**
    - **YES.** Public registry entries for remote HTTP servers must point to publicly resolvable HTTPS endpoints with valid TLS certificates.
13. **Can local/localhost servers be registered?**
    - `localhost` HTTP URLs are rejected by the public registry. Local servers may only be registered as `stdio` package binaries (e.g. npm/pip packages).
14. **Are private/test servers supported?**
    - Private registries and internal enterprise catalogs can host `server.json` manifests for development, but the main public registry is strictly public.
15. **What must be true before publication?**
    - See the Readiness Checklist in Section 3 below.

---

## 3. Pre-Publication Readiness Checklist

### A. Infrastructure & Network Gates (`PHASE 14`)
- [ ] **Permanent Public Domain**: `staging.careerhub.ai` provisioned and configured.
- [ ] **Valid TLS Certificate**: Valid SSL/TLS certificate issued and terminating HTTPS traffic.
- [ ] **Cloudflare Named Tunnel**: High-availability `cloudflared` daemon routing traffic to Fastify backend.
- [ ] **Health Probe SLA**: `GET /healthz` responding with HTTP 200 and <300ms p95 latency.

### B. Security & Identity Gates
- [ ] **DNS Ownership Record**: DNS TXT record `_mcp-registry-verification.careerhub.ai` created.
- [ ] **OAuth 2.1 RFC 8414 Discovery**: `/.well-known/oauth-authorization-server` returning valid JSON metadata.
- [ ] **OAuth 2.1 RFC 9728 Discovery**: `/.well-known/oauth-protected-resource` returning valid resource metadata.
- [ ] **Secret Scrubbing**: Manifest verified with `src/mcp/registry/registry-validator.js` ensuring 0 secret leakage.
- [ ] **Two-Phase Write Safety**: Human confirmation required for all repository write actions.

### C. Capability & Documentation Gates
- [ ] **16-Tool Catalog**: All 16 registered tools operational over `POST /mcp`.
- [ ] **MCP Apps UI Extension**: `ui://career-hub/job-fit-radar/v1` registered and serving `text/html;profile=mcp-app`.
- [ ] **Public Developer Docs**: `/docs/mcp` accessible without session requirements.
- [ ] **Automated Manifest Test**: `tests/unit/mcp-registry-metadata.test.js` passing in CI pipeline.

---

## 4. Manifest Representation (`server.json`)

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "ai.careerhub/mcp-server",
  "title": "Antigravity Career Hub",
  "description": "Evidence-backed AI career intelligence and developer portfolio MCP server with verifiable AST provenance, two-phase human-approved PR workflows, and ATS job-fit analysis.",
  "version": "0.1.0",
  "homepage": "https://staging.careerhub.ai",
  "documentation": "https://staging.careerhub.ai/docs/mcp",
  "repository": {
    "type": "git",
    "url": "https://github.com/vishu1803/Ai-job-mcp"
  },
  "license": "Apache-2.0",
  "categories": ["developer-tools", "productivity", "career"],
  "icons": [
    {
      "src": "https://staging.careerhub.ai/static/icons/mcp-icon.png",
      "mimeType": "image/png",
      "sizes": "512x512"
    }
  ],
  "transport": {
    "type": "http",
    "url": "https://staging.careerhub.ai/mcp",
    "protocolVersion": "2026-07-28"
  },
  "authentication": {
    "type": "oauth2",
    "authorizationUrl": "https://staging.careerhub.ai/oauth/authorize",
    "tokenUrl": "https://staging.careerhub.ai/oauth/token",
    "scopes": {
      "career:read": "Read verified candidate profile, skills, projects, and evidence graph",
      "career:write": "Generate tailored resumes, cover letters, and manage job applications"
    },
    "discoveryUrl": "https://staging.careerhub.ai/.well-known/oauth-authorization-server"
  },
  "capabilities": {
    "tools": true,
    "resources": true,
    "prompts": true,
    "extensions": {
      "io.modelcontextprotocol/ui": {
        "version": "1.0.0",
        "resources": [
          "ui://career-hub/job-fit-radar/v1"
        ]
      }
    }
  },
  "status": "PLANNED / NOT PUBLISHED"
}
```

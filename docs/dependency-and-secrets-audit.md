# Phase 14: Dependency Vulnerability, Secrets & Cryptographic Key Management Audit

**Document ID**: `ARCH-053`  
**Related Tasks**: `P14-001A`, `P14-001`  
**Related ADR**: `ADR-071`  
**Last Updated**: 2026-08-27  

---

## 1. Executive Summary

Maintaining radical evidence provenance, user data sovereignty, and multi-tenant security requires an uncompromising approach to **software supply-chain integrity**, **secrets protection**, and **cryptographic key hygiene**.

This document establishes the official Phase 14 audit findings, tooling specifications, and operational protocols for:
1. Automated dependency vulnerability scanning and package integrity.
2. Comprehensive source code, git history, and runtime log secrets auditing.
3. Cryptographic key lifecycle management, zero-downtime rotation, and emergency revocation procedures.

---

## 2. Dependency Vulnerability Audit & Supply Chain Security

### 2.1. Current Dependency Audit State (`npm audit --json`)
An automated audit of the repository's dependency tree was executed on **2026-08-27**:

| Metric | Current Finding | Assessment |
| :--- | :---: | :--- |
| **Critical Severity Vulnerabilities** | **0** | Clean |
| **High Severity Vulnerabilities** | **0** | Clean |
| **Moderate Severity Vulnerabilities** | **4** | Isolated to `devDependencies` (`drizzle-kit` $\to$ `esbuild` $\le 0.24.2$) |
| **Low / Informational Vulnerabilities** | **0** | Clean |
| **Total Production Dependencies** | **123** | **0 Known Vulnerabilities in Production Runtime** |
| **Total Dev Dependencies** | **173** | 4 Moderate (Build tool dev-server advisory) |
| **Total Dependency Tree Nodes** | **296** | 100% Lockfile Integrity Verified |

### 2.2. Evaluation of Existing Moderate Advisory
- **Vulnerability**: `GHSA-67mh-4wv8-2f99` (`esbuild` dev server origin check issue, CWE-346, CVSS 5.3).
- **Dependency Path**: `drizzle-kit` (dev) $\to$ `@esbuild-kit/esm-loader` $\to$ `@esbuild-kit/core-utils` $\to$ `esbuild@0.24.2`.
- **Runtime Impact on Production**: **ZERO**. `drizzle-kit` is strictly a development-time CLI utility used for schema generation (`drizzle-kit generate`) and migration checking (`drizzle-kit check`). Neither `drizzle-kit` nor `esbuild` is imported or executed in the production Fastify runtime.
- **Recommended Action (Task P14-001)**: Monitor upstream `drizzle-kit` minor releases for transitive `esbuild` version bump; retain pinned lockfile in CI to preserve deterministic builds.

### 2.3. Automated Dependency Scanning Pipeline
Phase 14 mandates automated multi-layered supply-chain checks in `.github/workflows/ci.yml`:
1. **Deterministic `npm ci`**: Ensures exact match against `package-lock.json` with cryptographic SHA-512 subresource integrity verification.
2. **Automated `npm audit --audit-level=high`**: Fails the CI build if any `HIGH` or `CRITICAL` vulnerability is introduced by a new dependency.
3. **GitHub Dependabot Integration**: Configured in `.github/dependabot.yml` for weekly automated dependency pull requests.

---

## 3. Comprehensive Secrets Audit & Leak Prevention

### 3.1. Secrets Inventory & Purpose

| Secret Name | Category | Format / Length | Storage Location | Sensitivity |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Infrastructure | PostgreSQL URI with credentials | Environment Variable | **Critical** |
| `ENCRYPTION_MASTER_KEY` | Cryptographic | 64 Hex Characters (32 Bytes AES-256) | Environment Variable | **Critical** |
| `AUTH_SECRET` | Session Security | 32+ Random Characters | Environment Variable | **High** |
| `MCP_TOKEN_SECRET` | Token Hashing | 32+ Random Characters | Environment Variable | **High** |
| `GITHUB_CLIENT_SECRET` | OAuth 2.0 | 40 Hex Characters | Environment Variable | **High** |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App RS256 | RSA 2048-bit PEM String / Base64 | Environment Variable | **Critical** |
| `GITHUB_WEBHOOK_SECRET` | Webhook Signature | 32+ Hex Characters | Environment Variable | **High** |
| `GEMINI_API_KEY` | AI Provider (Test) | Google Developer API Key String | Environment Variable | **High** |

### 3.2. Multi-Channel Leak Prevention Audit

```
[ POTENTIAL LEAK CHANNELS ]
         ├── 1. Version Control (Git commits, PRs, commit messages)
         ├── 2. Runtime Application Logs (Pino structured logs, console.log)
         ├── 3. Audit Logs (PostgreSQL audit_logs table, payloads)
         ├── 4. HTML Rendered Views (Hidden inputs, data attributes)
         ├── 5. MCP Tool JSON-RPC Responses (tools/call output payloads)
         ├── 6. HTTP Error Payloads (Stack traces, validation details)
         ├── 7. Stored Blob Files (Decrypted cache on filesystem)
         └── 8. CI Build Logs & Test Fixtures
```

#### Verification & Invariants:
1. **Git History & Source Code**:
   - `.gitignore` explicitly blocks `.env`, `.env.local`, `.env.*.local`, `*.pem`, `*.key`, `*.cert`.
   - `.env.example` contains strictly generic descriptive placeholders (`placeholder_github_oauth_client_id`, `0123456789abcdef...`).
   - Test suites use mock tokens (`mcp_test_*`) or dynamically generated ephemeral test keys in memory.
2. **Runtime Logger Scrubbing**:
   - Centralized Pino logger in `src/utils/logger.js` enforces redaction for sensitive key names (`password`, `token`, `secret`, `authorization`, `cookie`, `privateKey`, `apiKey`, `githubAppPrivateKey`, `mcpToken`, `clientSecret`).
   - RegEx pattern scrubbers redact GitHub PATs (`ghp_*`, `ghs_*`), Google API Keys (`AIzaSy*`), and RSA PEM headers.
3. **Database Audit Log Payload Sanitizer**:
   - `src/utils/audit-sanitizer.js` deep-sanitizes all structured audit payloads before persistence.
   - Payloads are capped at 16 KB; strings matching known secret patterns are replaced with `[REDACTED]`.
4. **HTML & MCP Gateway Output Boundary**:
   - Web application views render only safe display fields (e.g. `user.email`, `user.displayName`, `token.prefix = mcp_live_a1b2...`). Raw personal MCP API tokens are shown **exactly once** upon creation in a flash notification banner and never stored in plaintext or re-rendered.
   - MCP tools return sanitized domain models; internal UUIDs and database connection strings are never exposed in tool responses.
5. **Fastify Centralized Error Handler**:
   - `src/errors/index.js` formats all error responses into clean JSON envelopes (`{ error: { code, message, requestId } }`).
   - Internal database error messages, SQL queries, and stack traces are suppressed in `NODE_ENV=production`.

---

## 4. Cryptographic Key Management & Rotation Protocol

### 4.1. Master Encryption Key (`ENCRYPTION_MASTER_KEY`)
- **Algorithm**: `AES-256-GCM` with native `node:crypto`.
- **Entropy Requirement**: Exactly 256 bits (32 bytes), represented as 64 hex characters or 44 base64 characters.
- **Key Normalization**: `normalizeKey()` in `src/security/encryption.js` rejects weak passphrases or invalid lengths on startup.

### 4.2. Zero-Downtime Key Rotation Strategy (Versioned AAD)
1. **Encryption**: Always performed using the active master key version (`ENCRYPTION_KEY_VERSION=v2`).
   ```json
   {
     "version": "v2",
     "iv": "<12-byte-hex>",
     "tag": "<16-byte-hex>",
     "data": "<ciphertext-hex>"
   }
   ```
2. **Decryption**: `decryptSecret()` inspects the payload's `version` field. If `payload.version === 'v1'`, it uses the secondary key (`ENCRYPTION_MASTER_KEY_V1`) to decrypt the record.
3. **Lazy Re-Encryption**: Upon successful read and mutation, the application re-encrypts the secret using active version `v2`.
4. **Batch Migration**: An offline migration script (`scripts/rotate-encryption-keys.js`) can iteratively decrypt all `resource_connections.encryptedMetadata` and `resumes.storageKey` under `v1` and re-encrypt under `v2`.

### 4.3. Emergency Secret Revocation Runbook

```
[ DETECTED COMPROMISE ]
           │
           ▼
[ 1. Invalidate Upstream Tokens ]
- GitHub App: Revoke active installation tokens via DELETE /installation/token
- Personal MCP Tokens: UPDATE mcp_api_tokens SET is_revoked = true WHERE tenant_id = :compromisedTenant
           │
           ▼
[ 2. Rotate Application Secrets ]
- Generate fresh ENCRYPTION_MASTER_KEY (v2) and AUTH_SECRET
- Deploy updated environment variables to staging / production
           │
           ▼
[ 3. Invalidate Active Web Sessions ]
- TRUNCATE sessions; (forces all users to re-authenticate via GitHub OAuth)
           │
           ▼
[ 4. Audit Trail Verification ]
- Query audit_logs for unauthorized access patterns during compromise window
```

---

## 5. Security Tooling Recommendations for Phase 14

| Tooling Area | Recommended Tool | Execution Point | Integration Target |
| :--- | :--- | :--- | :--- |
| **Dependency Scanning** | `npm audit --audit-level=high` | GitHub Actions CI | `.github/workflows/ci.yml` |
| **Static Secrets Scan** | `gitleaks` / `git-secrets` | Pre-commit & CI | Local developer hooks & CI gate |
| **Automated DAST** | Node.js Test Runner Security Suite | Local & CI | `tests/integration/penetration-testing.test.js` |
| **Container Image Scan** | Trivy / Docker Scout | CI Build Phase | Container image artifact scanning |
| **Database Encryption** | PostgreSQL native TLS (`sslmode=require`) | Production DB | Aiven Managed PostgreSQL |

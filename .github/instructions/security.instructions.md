# Security & Cryptography Guidelines

**Scope**: Security boundaries, credential encryption, tenant isolation, and MCP transport safety.  
**Governing Standard**: AES-256-GCM + OAuth 2.1 + Zero-Trust Multi-Tenancy.

---

## 1. Non-Negotiable Invariants

1. **Zero Hardcoded Secrets**: Never place API keys, passwords, webhook secrets, encryption keys, or private PEM strings in source code or committed fixtures.
2. **Never Log Sensitive Data**: Ensure Pino logger serializers redact `token`, `password`, `secret`, `authorization`, `privateKey`, and `installationToken`.
3. **Strict Parameter Validation**: Every route and tool handler MUST validate input using Zod before processing.
4. **Tenant Isolation Verification**: All tenant queries must filter by `tenant_id`. Every security PR must include an automated multi-tenant IDOR penetration test.
5. **Two-Phase Action Safety**: Code creation, branch creation, and PR operations MUST be gated by a two-phase approval ticket (`propose` -> `confirm`). Pushing directly to `main`/`master` is forbidden.

---

## 2. Symmetric Encryption Standards (AES-256-GCM)

* Use the centralized encryption helper (`src/utils/crypto.js`) for encrypting tokens at rest:
  ```javascript
  import { encryptSecret, decryptSecret } from '../utils/crypto.js';

  // Encrypt
  const { ciphertext, iv, authTag } = encryptSecret(plainToken, masterKey);

  // Decrypt
  const plainToken = decryptSecret(ciphertext, iv, authTag, masterKey);
  ```
* **Parameters**:
  * Algorithm: `aes-256-gcm`
  * IV: Exactly 12 random bytes per record (`crypto.randomBytes(12)`). Never reuse an IV.
  * Tag: 16-byte authentication tag verified on decryption.

---

## 3. Remote MCP Security Rules

* **Bearer Token Validation**: Remote MCP calls require `Authorization: Bearer mcp_live_*`.
* **Hash Lookups**: Incoming tokens are hashed via SHA-256 before database lookup. Plaintext MCP tokens are never stored in the database.
* **Header & Origin Validation**: Validate incoming `Origin`, `Host`, and custom `Mcp-Method` headers.

---

## 4. GitHub Webhook Security Rules

* Validate every webhook request against `X-Hub-Signature-256` using `crypto.timingSafeEqual` and the configured `GITHUB_WEBHOOK_SECRET`.
* Reject invalid or missing signatures with `401 Unauthorized`.

# Architecture Blueprint: User Data Sovereignty, Evidence Inspection, and GDPR Article 17 Hard Deletion Lifecycle (ARCH-048)

**Document Identifier:** ARCH-048  
**Associated ADR:** ADR-068  
**Status:** IMPLEMENTED & VERIFIED  
**Phase:** Phase 13 — Multi-User Production Readiness, Account Sovereignty & Tenant Lifecycle  
**Task:** P13-002  

---

## 1. Context and Problem Statement

As the Antigravity Career Hub transitions to multi-user public readiness, users must maintain total sovereignty over their professional data in compliance with GDPR Article 15 (Right of Access), Article 17 (Right to Erasure / "Forgotten"), and Article 20 (Data Portability). 

Specifically, users must be able to:
1. **Inspect Indexed Evidence & Provenance**: Audit exactly what code excerpts, commits, and manifest dependencies were extracted from their repositories to substantiate verified skills.
2. **Disconnect Connected Resources**: Halt future background synchronization and scrub all OAuth/installation credentials while preserving historical career artifacts (evidence, candidate skills, job applications, tailored resumes).
3. **Delete Indexed Resources**: Remove specific indexed repositories and cascade the deletion to derived evidence items, while triggering atomic skill rollup recalculation to downgrade or remove skills that no longer have empirical proof.
4. **Execute Hard Account Deletion (GDPR Article 17)**: Permanently purge all tenant-scoped data across all 18 tenant tables atomically, invalidate all active sessions, MCP tokens, and OAuth grants, while preserving the global shared skill taxonomy and emitting privacy-safe audit trails.

---

## 2. Architectural Design

```
+---------------------------------------------------------------------------------------------------+
|                                  USER BROWSER / CLIENT INTERFACE                                  |
+---------------------------------------------------------------------------------------------------+
       | GET /candidate/evidence                 | DELETE /candidate/resources/:id  | DELETE /account
       v                                         v                                  v
+---------------------------------------------------------------------------------------------------+
|                                FASTIFY HTTP & SECURITY BOUNDARY                                   |
| - Session Authentication (`career_hub_session` cookie via SHA-256 hash lookup)                   |
| - Origin-Based CSRF Verification (Host / Forwarded-Host matching on state-modifying requests)     |
| - Strict Tenant Scoping & RBAC (`OWNER` required for hard deletion)                               |
+---------------------------------------------------------------------------------------------------+
       |                                         |                                  |
       v                                         v                                  v
+---------------------------------------------------------------------------------------------------+
|                                   DATA SOVEREIGNTY SERVICE                                        |
|  - getIndexedEvidence(context, filters, pagination)                                               |
|  - getEvidenceItem(context, evidenceId)                                                           |
|  - disconnectConnection(context, connectionId)                                                    |
|  - deleteIndexedResource(context, resourceId)  --> SkillRollupCalculator.calculateRollup()       |
|  - hardDeleteAccount(context, confirmation)     --> Best-Effort Revocation + Atomic Purge          |
+---------------------------------------------------------------------------------------------------+
       |                                         |                                  |
       v                                         v                                  v
+---------------------------------------------------------------------------------------------------+
|                                POSTGRESQL MULTI-TENANT DATABASE                                   |
| - 18 Tenant-Scoped Tables: CASCADE Deletion on `DELETE FROM tenants WHERE id = :tenantId`         |
| - Global Taxonomy Tables: Preserved (`skills` global catalog intact)                              |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Core Capabilities & Invariants

### 3.1 Granular Evidence Provenance Inspection
- `GET /candidate/evidence`: Returns paginated lists of `evidence_items` with joined `skills`, `resources`, and `projects`.
- Supports filtering by `skillId`, `projectId`, `resourceId`, and `evidenceType`.
- Includes commit SHAs, relative file paths, line ranges, and safe excerpt snippets ($\le 1000$ chars).
- Strict tenant boundary: Cross-tenant lookup returns `404 NOT_FOUND`.

### 3.2 Resource Disconnection vs Resource Deletion
| Operation | HTTP Endpoint | Credential State | Historical Evidence & Skills | Applications & Tailored Docs |
| :--- | :--- | :--- | :--- | :--- |
| **Disconnect Connection** | `POST /connections/:id/disconnect` | Scrubbed (empty JSON ciphertext) | **Preserved** | **Preserved** |
| **Delete Indexed Resource** | `DELETE /candidate/resources/:id` | Retained (or disconnected) | **Cascaded & Recalculated** | **Preserved** |
| **Hard Delete Account** | `DELETE /account` | **Purged with Tenant** | **Purged with Tenant** | **Purged with Tenant** |

### 3.3 Skill Rollup Recalculation on Resource Deletion
When an indexed resource is deleted:
1. `project_resources` and `evidence_items` pointing to that resource are explicitly and transactionally purged.
2. The `resources` row is deleted.
3. For each affected skill of the candidate, `SkillRollupCalculator.calculateRollup(remainingEvidence)` recalculates confidence scores and provenance statuses.
4. If no evidence remains and the skill was `VERIFIED`/`INFERRED`, the `candidate_skills` entry is removed. If it was user-`CLAIMED`, `evidenceCount` and `confidenceScore` are set to `0.0`.

### 3.4 GDPR Article 17 Hard Deletion
- Requires `OWNER` role and exact confirmation payload `{"confirmPhrase": "DELETE MY ACCOUNT"}`.
- Best-effort upstream OAuth token revocation is executed.
- `DELETE FROM tenants WHERE id = :tenantId;` executes inside an atomic transaction, cascading across all 18 tenant tables:
  1. `tenants`
  2. `users`
  3. `sessions`
  4. `audit_logs`
  5. `resource_connections`
  6. `candidates`
  7. `candidate_identities`
  8. `resources`
  9. `projects`
  10. `project_resources`
  11. `candidate_skills`
  12. `evidence_items`
  13. `mcp_api_tokens`
  14. `action_approval_tickets`
  15. `oauth_authorization_codes`
  16. `oauth_tokens`
  17. `job_applications`
  18. `application_stages`
  19. `tailored_documents`
- Session cookie `career_hub_session` is cleared in HTTP response headers.
- Global `skills` taxonomy is preserved.

---

## 4. Verification Evidence

- Test Suite: `tests/integration/data-sovereignty.test.js` (13/13 PASS)
- Master Suite: 1,549 / 1,549 tests PASS
- DB Lifecycle Check: 48 / 48 test suites with 0 database leaks
- ESLint & Prettier: Clean with 0 errors

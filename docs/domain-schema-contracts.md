# Domain Schema Contracts & Validation Specification

**Project**: Antigravity Career Hub (Universal AI Career MCP Platform)  
**Phase**: Phase 4 — Unified Candidate / Resource Model  
**Task**: `P4-001`  
**Document ID**: `SPEC-008`  
**Status**: Authoritative Schema Contract  
**Date**: 2026-08-22  

---

## 1. Overview & Architecture Boundary

This specification establishes the canonical domain data contracts for **Antigravity Career Hub**, implemented via Zod in `src/domain/candidate/candidate.schemas.js`.

These domain schemas govern:
1. **Candidate Profile (`CandidateProfileSchema`)**: Unified, sovereign career persona profile.
2. **Candidate Identities (`CandidateIdentitySchema`)**: Verified third-party provider account bindings.
3. **Skills & Taxonomy (`SkillSchema`, `SkillWithEvidenceSchema`)**: Canonical taxonomy, provenance status, and confidence scoring.
4. **Projects & Portfolios (`ProjectSchema`, `ProjectEvidenceSchema`)**: Engineering initiatives decoupled from individual repositories ($1\text{ Project} \ne 1\text{ Repository}$).
5. **Resources (`ResourceSummarySchema`)**: Provider-neutral external asset catalog metadata.
6. **Evidence Nodes & Locations (`EvidenceNodeSchema`, `EvidenceSourceLocationSchema`)**: Immutable provenance nodes tying claims to exact file paths and commit SHAs.

---

## 2. Core Security & Validation Rules

### 2.1 Strict Object Boundaries (`z.strictObject`)
All schemas enforce strict object parsing. Any attempt by upstream callers or consumers to inject unrecognized or credential-bearing properties (e.g. `password`, `encryptedCredentials`, `privateKey`, `accessToken`, `appJwt`, `installationToken`, `webhookSecret`, `authorizationHeader`) triggers immediate validation rejection (`unrecognized_keys` / custom issue).

### 2.2 Safe Metadata Hardening (`SafeMetadataSchema`)
`metadata` fields across all domain entities are bounded `JSONB` objects that inspect keys case-insensitively and reject all variations of secret and credential names.

### 2.3 POSIX Path Traversal Rejection (`SafePosixFilePathSchema`)
Evidence source paths must be relative POSIX paths. The validator strictly rejects:
* Directory traversal sequences (`..`)
* Leading root slashes (`/`) or relative prefixes (`./`)
* Windows backslashes (`\`)
* Null bytes (`\0` and `%00`)

### 2.4 Evidence Excerpt Safety (`EvidenceExcerptSchema`)
* **Hard Size Ceiling**: Maximum **1,024 characters**.
* **Secret Scrubber**: Rejects raw RSA/EC private keys (`-----BEGIN ... PRIVATE KEY-----`), GitHub App/Personal tokens (`ghs_*`, `ghp_*`), and HTTP `Bearer` tokens.

### 2.5 Decimal Confidence Scoring (`ConfidenceScoreSchema`)
Confidence scores are strictly bounded floating-point numbers between `0.00` and `1.00`.

---

## 3. Schema Catalog & Field Definitions

### 3.1 `CandidateProfileSchema`
Represents the safe domain and external API representation of a candidate profile:

| Field | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | Canonical Candidate ID | Valid UUIDv4 format |
| `tenantId` | `UUID` (Optional) | Tenant workspace owner | Internal/service context only |
| `userId` | `UUID` (Optional) | Platform User ID | Optional/Nullable in multi-user workspace |
| `displayName` | `String` | Candidate full name | 1 to 255 characters |
| `headline` | `String` (Optional) | Professional headline | Max 500 characters |
| `summary` | `String` (Optional) | Evidence-grounded summary | Max 5,000 characters |
| `canonicalEmail`| `String` (Optional) | Primary verified contact email | Valid email format |
| `status` | `Enum` | Candidate lifecycle status | `ACTIVE`, `ARCHIVED`, `SUSPENDED` |
| `profileMetadata`| `JSON` | Profile settings/preferences | Disallows secret keys |
| `identities` | `Array` | Verified external identities | `CandidateIdentitySchema[]` |
| `skills` | `Array` | Skills with evidence nodes | `SkillWithEvidenceSchema[]` |
| `projects` | `Array` | Curated projects with evidence | `ProjectEvidenceSchema[]` |
| `createdAt` | `Date / ISO` | Creation timestamp | ISO 8601 string or Date |
| `updatedAt` | `Date / ISO` | Update timestamp | ISO 8601 string or Date |

---

### 3.2 `CandidateIdentitySchema`
Represents an external provider account bound to the candidate:

| Field | Type | Description | Constraints |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` (Optional) | Identity record ID | Valid UUIDv4 |
| `provider` | `Enum` | Third-party provider | `GITHUB_APP`, `GITLAB`, `LINKEDIN`, `GOOGLE`, `MANUAL` |
| `externalAccountId` | `String` | Immutable provider account ID | Non-empty string (e.g. `"97516061"`) |
| `externalUsername` | `String` | Provider handle/username | Non-empty string (e.g. `"vishu1803"`) |
| `externalEmail` | `String` (Optional)| Email from provider profile | Valid email format |
| `profileUrl` | `String` (Optional)| External profile URL | Valid URL format |
| `avatarUrl` | `String` (Optional)| Profile avatar image URL | Valid URL format |
| `verified` | `Boolean` | Proven via OAuth / App install | Default `false` |
| `verifiedAt` | `Date / ISO` (Optional)| Verification timestamp | ISO 8601 string or Date |
| `metadata` | `JSON` | Provider profile metadata | Public repositories count, bio, etc. |

---

### 3.3 `SkillSchema` & `SkillWithEvidenceSchema`
* **`SkillSchema`** (Canonical Global Taxonomy):
  * `slug`: Unique lowercase slug (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, e.g. `"postgresql"`, `"fastapi"`).
  * `name`: Display name (`"PostgreSQL"`, `"FastAPI"`).
  * `category`: `LANGUAGE`, `FRAMEWORK`, `DATABASE`, `CLOUD_DEVOPS`, `TOOL`, `ARCHITECTURE`, `CONCEPT`.
  * `aliases`: Array of synonyms (`["postgres", "pgsql", "postgresql-db"]`).
  * `description`: Taxonomy description.
* **`SkillWithEvidenceSchema`** (Candidate Assertion):
  * `provenanceStatus`: `VERIFIED`, `INFERRED`, `CLAIMED`, `MISSING`.
  * `confidenceScore`: Range `0.00` to `1.00` (default `0.00`).
  * `evidenceCount`: Non-negative integer (default `0`).
  * `evidence`: Array of `EvidenceNodeSchema` records.

---

### 3.4 `ProjectSchema` & `ProjectEvidenceSchema`
* **`ProjectSchema`**:
  * `name`: Project title (e.g. `"Antigravity Career Hub"`).
  * `slug`: URL slug (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, e.g. `"antigravity-career-hub"`).
  * `resources`: Array of `ResourceSummarySchema` records representing linked repositories, documents, or websites ($1\text{ Project} \ne 1\text{ Repository}$).
* **`ProjectEvidenceSchema`**:
  * Extends project metadata with `evidence: EvidenceNodeSchema[]`, `confidenceScore: Float`, and `provenanceStatus: Enum`.

---

### 3.5 `EvidenceNodeSchema` & `EvidenceSourceLocationSchema`
The foundational unit of immutable truth:

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Immutable Evidence ID |
| `candidateId` | `UUID` | Target Candidate ID |
| `resourceId` | `UUID` | Provenance Resource ID |
| `projectId` | `UUID` (Optional) | Associated Project ID |
| `skillId` | `UUID` (Optional) | Associated Canonical Skill ID |
| `evidenceType` | `Enum` | `PACKAGE_MANIFEST_DEPENDENCY`, `CODE_IMPORT_USAGE`, `FILE_PATTERN_MATCH`, `COMMIT_CONTRIBUTION`, `README_SPECIFICATION`, `DIRECTORY_STRUCTURE`, `DOCUMENT_CLAIM` |
| `sourceProvider` | `Enum` | `GITHUB_APP`, `GITLAB`, `GOOGLE_DRIVE`, `MANUAL`, etc. |
| `sourceLocation` | `Object` | Strict source pointer (`filePath`, `commitSha`, `lineRange`, `astContext`) |
| `excerpt` | `String` (Optional)| Sanitized excerpt ($\le 1024$ chars, zero secrets/keys) |
| `confidenceScore`| `Float` | Range `0.00` to `1.00` (default `1.0`) |
| `detectedAt` | `Date / ISO` | Observation timestamp |

---

## 4. Internal Service vs. External API Representation

To preserve tenant privacy and prevent accidental schema leaks:
1. **Internal Service Schemas**: May include `tenantId`, `userId`, and detailed internal metadata when routing through repositories and business logic.
2. **External API Schemas**: Strip `tenantId` (implicitly governed by authenticated session context), omit internal database keys, and exclude internal error diagnostics.
3. **Strict Credential Boundary**: Neither internal nor external candidate/evidence schemas ever accept or emit `encryptedCredentials`, IV, tag, or API tokens.

---

## 5. Verification & Test Coverage

All schemas are validated by `tests/unit/candidate-domain-schemas.test.js` covering:
* Positive validation of complete, nested candidate profiles.
* Rejection of invalid status enums and malformed UUIDs.
* Rejection of path traversal (`..`), backslashes, leading slashes, and null bytes in file paths.
* Rejection of invalid 40-char Git commit SHAs and inverted line ranges (`end < start`).
* Rejection of secret keys in metadata (`accessToken`, `privateKey`, `password`, `token`).
* Rejection of secret-bearing excerpts (RSA private keys, `ghs_*` tokens, `Bearer` strings).
* Rejection of invalid confidence scores ($< 0.00$ or $> 1.00$).

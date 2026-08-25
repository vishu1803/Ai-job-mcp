# Unified Data Model Specification

**Project**: Antigravity Career Hub (Universal AI Career MCP Platform)  
**Status**: Authoritative Data Model  
**Last Updated**: 2026-08-19  

---

## 1. Overview & Multi-Tenant Design Principles

1. **Strict Tenant Ownership**: Every entity in the system is owned by a `Tenant` and associated with a `User`. All database queries strictly scope filtering by `tenant_id`.
2. **Provider Neutrality**: Candidate profiles, skills, and evidence structures are decoupled from GitHub, GitLab, Google Drive, or any single AI model provider.
3. **Radical Evidence Provenance**: No skill or capability exists without a provenance classification (`VERIFIED`, `CLAIMED`, `INFERRED`, `MISSING`). Verified skills MUST reference an immutable `EvidenceItem`.
4. **Relational Integrity with Semi-Structured Flexibility**: Normalized relational tables for accounts, connections, and skills, paired with `JSONB` fields for parsed ASTs, manifest dependencies, and commit metadata.

---

## 2. Entity-Relationship Diagram (Conceptual)

```
[Tenant] 1 ──── ∞ [User] 1 ──── ∞ [Session]
   │                 │
   │ 1               │ 1
   ▼ ∞               ▼ ∞
[ResourceConnection] [MCPToken]
   │
   │ 1
   ▼ ∞
[Repository] 1 ──── ∞ [EvidenceItem] ∞ ──── 1 [CandidateSkill]
                           ▲                        │
                           │                        ▼
                           │                 [CandidateProfile]
                           │                        ▲
                           │                        │
[JobDescription] 1 ─── ∞ [JobRequirement] ─── ∞ [MatchResult]
   │
   ▼ 1
[JobApplication] 1 ─── ∞ [ApplicationStage]

[Tenant] 1 ──── ∞ [AuditLog]
[Tenant] 1 ──── ∞ [ActionApproval]
```

---

## 3. Entity Catalog

---

### Entity: `Tenant`
* **Purpose**: Represents an isolated organizational or individual workspace account.
* **Key Fields**:
  * `id` (UUID, Primary Key)
  * `name` (String, e.g., "Vishwash's Workspace")
  * `slug` (String, Unique)
  * `tier` (Enum: `FREE`, `PRO`, `ENTERPRISE`)
  * `createdAt`, `updatedAt` (Timestamps)
* **Ownership**: Root entity.
* **Relationships**: Has many `Users`, `ResourceConnections`, `CandidateProfiles`, `MCPTokens`, `AuditLogs`.
* **Lifecycle**: Created during user signup; purged on account hard deletion.
* **Sensitive Fields**: None.

---

### Entity: `User`
* **Purpose**: Represents an individual human actor authenticated to the platform.
* **Key Fields**:
  * `id` (UUID, Primary Key)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`)
  * `email` (String, Unique)
  * `displayName` (String)
  * `role` (Enum: `OWNER`, `MEMBER`, `READONLY`)
  * `avatarUrl` (String, Optional)
  * `status` (Enum: `ACTIVE`, `SUSPENDED`, `DELETED`)
  * `createdAt`, `updatedAt` (Timestamps)
* **Ownership**: Owned by `Tenant`.
* **Relationships**: Belongs to `Tenant`; has many `Sessions`, `MCPTokens`.
* **Lifecycle**: Created on signup; updated on profile changes; soft/hard deleted on request.
* **Sensitive Fields**: `email` (PII).

---

### Entity: `Session`
* **Purpose**: Tracks active Web UI login sessions.
* **Key Fields**:
  * `id` (String, Primary Key - 32-byte secure token hash)
  * `userId` (UUID, Foreign Key -> `User.id`)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`)
  * `ipAddress` (String, Masked)
  * `userAgent` (String)
  * `expiresAt` (Timestamp)
  * `createdAt` (Timestamp)
* **Ownership**: Owned by `User`.
* **Lifecycle**: Created on login; deleted on logout or expiration (24h TTL).
* **Sensitive Fields**: `id` (Session secret hash).

---

### Entity: `ResourceConnection`
* **Purpose**: Stores metadata and encrypted credentials for third-party integrations (GitHub App, GitLab, Google Drive).
* **Key Fields**:
  * `id` (UUID, Primary Key)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`)
  * `provider` (Enum: `GITHUB_APP`, `GITLAB`, `GOOGLE_DRIVE`, `NOTION`)
  * `externalAccountId` (String, e.g., GitHub User/Org ID)
  * `installationId` (String, Optional, for GitHub App installations)
  * `encryptedCredentials` (String / Bytea - AES-256-GCM encrypted tokens)
  * `encryptionIv` (String, 12-byte hex)
  * `encryptionTag` (String, 16-byte hex)
  * `status` (Enum: `ACTIVE`, `EXPIRED`, `REVOKED`, `ERROR`)
  * `scopes` (Array of Strings, e.g., `["contents:read", "metadata:read"]`)
  * `lastSyncedAt` (Timestamp)
  * `createdAt`, `updatedAt` (Timestamps)
* **Ownership**: Owned by `Tenant`.
* **Relationships**: Belongs to `Tenant`; has many `Repositories`.
* **Lifecycle**: Created upon completing OAuth/App installation; updated on token refresh; purged on disconnect.
* **Sensitive Fields**: `encryptedCredentials`, `encryptionIv`, `encryptionTag` (Critical Security).

---

### Entity: `Repository`
* **Purpose**: Represents an authorized Git repository indexed by the platform.
* **Key Fields**:
  * `id` (UUID, Primary Key)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`)
  * `connectionId` (UUID, Foreign Key -> `ResourceConnection.id`)
  * `externalRepoId` (String, e.g., GitHub Repo ID)
  * `fullName` (String, e.g., `octocat/hello-world`)
  * `description` (String, Optional)
  * `defaultBranch` (String, e.g., `main`)
  * `isPrivate` (Boolean)
  * `primaryLanguage` (String, Optional)
  * `languages` (JSONB, Language breakdown in bytes)
  * `topics` (Array of Strings)
  * `lastCommitSha` (String)
  * `lastIndexedAt` (Timestamp)
  * `createdAt`, `updatedAt` (Timestamps)
* **Ownership**: Owned by `Tenant`.
* **Relationships**: Belongs to `ResourceConnection`; has many `EvidenceItems`, `Projects`.
* **Lifecycle**: Created/updated during repository sync; deleted if repository access is revoked.
* **Sensitive Fields**: None (Metadata only).

---

### Entity: `EvidenceItem`
* **Purpose**: The foundational unit of truth. Represents a specific, verifiable proof of technical capability extracted from a repository or document.
* **Key Fields**:
  * `id` (UUID, Primary Key - Immutable `EvidenceId`)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`)
  * `repositoryId` (UUID, Foreign Key -> `Repository.id`, Optional)
  * `evidenceType` (Enum: `PACKAGE_DEPENDENCY`, `CODE_USAGE`, `COMMIT_HISTORY`, `README_ARCHITECTURE`, `DIRECTORY_STRUCTURE`)
  * `sourceFilePath` (String, e.g., `backend/src/routes/auth.js`)
  * `sourceCommitSha` (String, e.g., `9f8e7d6c...`)
  * `technology` (String, Normalized technology name, e.g., `FastAPI`, `PostgreSQL`, `Docker`)
  * `snippet` (Text, Sanitized code excerpt or AST node summary)
  * `lineStart`, `lineEnd` (Integers, Optional)
  * `detectedAt` (Timestamp)
  * `metadata` (JSONB - e.g., version strings, commit author date)
* **Ownership**: Owned by `Tenant`.
* **Relationships**: Belongs to `Repository`; linked to many `CandidateSkills`.
* **Lifecycle**: Created during repository AST/manifest parsing; refreshed during incremental sync.
* **Sensitive Fields**: Sanitized source code excerpts (Tenant Private).

---

### Entity: `CandidateProfile`
* **Purpose**: The aggregated, evidence-backed professional profile of the candidate.
* **Key Fields**:
  * `id` (UUID, Primary Key)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`, Unique)
  * `userId` (UUID, Foreign Key -> `User.id`)
  * `headline` (String, e.g., "Full-Stack Engineer (Node.js / Distributed Systems)")
  * `summary` (Text, Evidence-grounded summary)
  * `verifiedSkillsCount` (Integer)
  * `totalRepositoriesIndexed` (Integer)
  * `createdAt`, `updatedAt` (Timestamps)
* **Ownership**: Owned by `Tenant`.
* **Relationships**: Belongs to `Tenant` & `User`; has many `CandidateSkills`, `CandidateExperiences`, `CandidateEducations`, `Projects`.
* **Lifecycle**: Created automatically upon initial sync; updated on evidence updates.
* **Sensitive Fields**: Candidate personal details.

---

### Entity: `CandidateSkill`
* **Purpose**: Represents a specific skill claim associated with the candidate profile, linked to evidence.
* **Key Fields**:
  * `id` (UUID, Primary Key)
  * `candidateProfileId` (UUID, Foreign Key -> `CandidateProfile.id`)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`)
  * `name` (String, Canonical technology name, e.g., `PostgreSQL`)
  * `category` (Enum: `LANGUAGE`, `FRAMEWORK`, `DATABASE`, `CLOUD_DEVOPS`, `TOOL`, `CONCEPT`)
  * `provenanceStatus` (Enum: `VERIFIED`, `CLAIMED`, `INFERRED`, `MISSING`)
  * `confidenceScore` (Float, 0.0 to 1.0)
  * `evidenceCount` (Integer)
  * `primaryEvidenceId` (UUID, Foreign Key -> `EvidenceItem.id`, Optional)
  * `lastUsedDate` (Date, Derived from latest commit)
  * `createdAt`, `updatedAt` (Timestamps)
* **Ownership**: Owned by `Tenant`.
* **Relationships**: Belongs to `CandidateProfile`; linked to `EvidenceItems`.
* **Lifecycle**: Managed by Evidence Linking Engine.
* **Sensitive Fields**: None.

---

### Entity: `JobDescription`
* **Purpose**: Stores target job postings parsed for gap analysis and application tailoring.
* **Key Fields**:
  * `id` (UUID, Primary Key)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`)
  * `title` (String, e.g., "Senior Backend Engineer")
  * `company` (String, e.g., "Acme Corp")
  * `rawText` (Text, Raw input text)
  * `seniorityLevel` (Enum: `INTERN`, `JUNIOR`, `MID`, `SENIOR`, `STAFF`, `LEAD`)
  * `extractedRequirements` (JSONB, Structured requirements schema)
  * `createdAt` (Timestamp)
* **Ownership**: Owned by `Tenant`.
* **Relationships**: Belongs to `Tenant`; has many `JobRequirements`, `MatchResults`, `JobApplications`.
* **Lifecycle**: Created when user inputs job posting; retained for application tracking.
* **Sensitive Fields**: None.

---

### Entity: `JobRequirement`
* **Purpose**: Individual atomic requirement extracted from a JobDescription.
* **Key Fields**:
  * `id` (UUID, Primary Key)
  * `jobDescriptionId` (UUID, Foreign Key -> `JobDescription.id`)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`)
  * `skillName` (String, Canonical name)
  * `requirementType` (Enum: `HARD_REQUIREMENT`, `PREFERRED_SKILL`, `DOMAIN_KNOWLEDGE`, `YEARS_EXPERIENCE`)
  * `minYears` (Integer, Optional)
  * `importanceWeight` (Float, 1.0 to 5.0)
* **Ownership**: Owned by `Tenant`.
* **Relationships**: Belongs to `JobDescription`.
* **Lifecycle**: Created during JD parsing.
* **Sensitive Fields**: None.

---

### Entity: `MatchResult`
* **Purpose**: Stores the deterministic evidence-to-requirement comparison between a candidate profile and a job description.
* **Key Fields**:
  * `id` (UUID, Primary Key)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`)
  * `candidateProfileId` (UUID, Foreign Key -> `CandidateProfile.id`)
  * `jobDescriptionId` (UUID, Foreign Key -> `JobDescription.id`)
  * `overallFitPercentage` (Float, 0.0 to 100.0)
  * `verifiedRequirementsCount` (Integer)
  * `missingRequirementsCount` (Integer)
  * `gapSummary` (JSONB - detailed breakdown of Verified, Claimed, Inferred, and Missing skills)
  * `recommendedProjects` (JSONB - Array of top matching repository IDs with rationale)
  * `createdAt` (Timestamp)
* **Ownership**: Owned by `Tenant`.
* **Relationships**: Belongs to `CandidateProfile` & `JobDescription`.
* **Lifecycle**: Generated on demand during analysis.
* **Sensitive Fields**: None.

---

### Entity: `MCPToken`
* **Purpose**: Cryptographic Bearer token allowing an external AI client (Gemini/Claude/ChatGPT) to access remote MCP tools on behalf of a user.
* **Key Fields**:
  * `id` (UUID, Primary Key)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`)
  * `userId` (UUID, Foreign Key -> `User.id`)
  * `tokenHash` (String, SHA-256 hash of plaintext token)
  * `name` (String, e.g., "Gemini Desktop Token")
  * `scopes` (Array of Strings, e.g., `["career:read", "resume:write"]`)
  * `expiresAt` (Timestamp, Optional)
  * `lastUsedAt` (Timestamp)
  * `status` (Enum: `ACTIVE`, `REVOKED`)
  * `createdAt` (Timestamp)
* **Ownership**: Owned by `Tenant` & `User`.
* **Lifecycle**: Created in Web UI; hashed on creation; revoked on request.
* **Sensitive Fields**: `tokenHash` (Hashed, Never store plaintext).

---

### Entity: `ActionApproval` (Two-Phase Commit Ticket)
* **Purpose**: Represents a pending or executed consequential external action (e.g., creating a Git feature branch or PR).
* **Key Fields**:
  * `id` (UUID, Primary Key - `ApprovalTicketId`)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`)
  * `userId` (UUID, Foreign Key -> `User.id`)
  * `actionType` (Enum: `CREATE_BRANCH`, `CREATE_PULL_REQUEST`, `SUBMIT_APPLICATION`)
  * `targetRepositoryId` (UUID, Foreign Key -> `Repository.id`, Optional)
  * `actionPayload` (JSONB - diff preview, branch name, commit message, PR title/body)
  * `status` (Enum: `PENDING`, `CONFIRMED`, `REJECTED`, `EXPIRED`, `EXECUTED`)
  * `expiresAt` (Timestamp, 15-minute TTL)
  * `confirmedAt` (Timestamp, Optional)
  * `createdAt` (Timestamp)
* **Ownership**: Owned by `Tenant`.
* **Lifecycle**: Created during Phase 1 (`propose_action`); transitioned to `CONFIRMED` and `EXECUTED` during Phase 2; expires automatically after 15 minutes.
* **Sensitive Fields**: Proposed code diffs.

---

### Entity: `AuditLog`
* **Purpose**: Immutable compliance and security ledger recording all critical system events.
* **Key Fields**:
  * `id` (UUID, Primary Key)
  * `tenantId` (UUID, Foreign Key -> `Tenant.id`)
  * `userId` (UUID, Optional)
  * `eventType` (String, e.g., `MCP_TOOL_INVOKED`, `CONNECTOR_CONNECTED`, `ACTION_CONFIRMED`)
  * `resourceType` (String, e.g., `EvidenceItem`, `ResourceConnection`, `ActionApproval`)
  * `resourceId` (String, Optional)
  * `ipAddress` (String, Masked)
  * `userAgent` (String)
  * `details` (JSONB, Sanitized event metadata)
  * `createdAt` (Timestamp)
* **Ownership**: Owned by `Tenant`.
* **Lifecycle**: Append-only. Never updated or modified; archived after retention window.
* **Sensitive Fields**: Scrubbed of all credentials and PII before insert.

---

## 4. Evidence & Provenance Architecture Example

To illustrate how the platform guarantees zero fabrication, consider a candidate claiming experience with **FastAPI**:

```
+-----------------------------------------------------------------------------------------+
|                                    CANDIDATE SKILL                                      |
|  - Name: "FastAPI"                                                                      |
|  - Category: "FRAMEWORK"                                                                |
|  - Provenance Status: VERIFIED                                                          |
|  - Primary Evidence ID: `ev_9a8b7c6d-5e4f-3a2b-1c0d-ef1234567890`                       |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                                     EVIDENCE ITEM                                       |
|  - Evidence ID: `ev_9a8b7c6d-5e4f-3a2b-1c0d-ef1234567890`                               |
|  - Repository: `user-workspace/weather-backend`                                         |
|  - Evidence Type: CODE_USAGE                                                            |
|  - Source File: `app/api/v1/endpoints/weather.py` (Lines 12 - 28)                       |
|  - Commit SHA: `7b8e1f0c2a3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f`                              |
|  - Detected Usage: `@router.get("/forecast", response_model=ForecastResponse)`         |
|  - Verified Timestamp: 2026-06-14T14:32:00Z                                             |
+-----------------------------------------------------------------------------------------+
```

When an AI client generates a resume bullet or analyzes job fit:
1. The bullet point: *"Engineered asynchronous REST APIs using FastAPI and Pydantic in weather-backend"* embeds a citation link to `EvidenceId: ev_9a8b7c6d...`.
2. If the user had never written FastAPI code, the skill is classified as `MISSING` or `[Unverified User Claim]`, preventing false claims in generated artifacts.

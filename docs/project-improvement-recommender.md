# Project Improvement Recommender Guide & Architecture

**Document ID**: `DOC-P9-001`  
**Phase**: `PHASE 9 — Approved GitHub / Project Modification Workflows`  
**Task**: `P9-001`  
**Status**: `COMPLETE & VERIFIED`  
**Last Updated**: `2026-08-25`  

---

## 1. Purpose & Overview

The **Project Improvement Recommender** (`ProjectImprovementRecommenderService`) bridges the critical gap between passive career gap analysis and active, legitimate skill demonstration.

When a candidate applies for a target role requiring technical skills that they currently lack verified proof for (e.g. missing "Redis caching", "FastAPI migration", "Docker containerization", "Prometheus metrics"), traditional generative AI career tools fabricate claims or inject misleading keywords into resumes. In contrast, the Antigravity Career Hub identifies suitable candidate repositories and synthesizes concrete, testable architectural additions and structured code diffs for human review.

```
+---------------------------------------------------------------------------------------------------+
|                                 RECOMMENDER PROCESSING PIPELINE                                   |
|                                                                                                   |
|  [ JobDescription ] + [ CandidateProfile ]                                                        |
|           |                                                                                       |
|           v                                                                                       |
|  [ EvidenceMatchingService ] ----> Deterministic Skill Gap Analysis (MISSING / PARTIAL)          |
|           |                                                                                       |
|           v                                                                                       |
|  [ ProjectRelevanceService ] ----> Ranks Candidate Repositories & Validates Provenance            |
|           |                                                                                       |
|           v                                                                                       |
|  [ AiProvider / Policy ]    ----> Synthesizes Structured Patch & Verification Plan                 |
|           |                                                                                       |
|           v                                                                                       |
|  [ 7-Point Safety Engine ]  ----> Path Sanitization, Workflow Blocklist, Secret Scan, Limits      |
|           |                                                                                       |
|           v                                                                                       |
|  [ Validated Proposal ]    ----> Returns ProjectImprovementProposal (PROPOSED / BLOCKED)          |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Input Contract

The recommender consumes only trusted, normalized application domain objects validated through `ProjectImprovementRequestSchema`:

```typescript
interface ProjectImprovementRequest {
  context: {
    tenantId: string; // Mandatory trusted tenant UUID
    userId?: string;
  };
  candidateProfile: {
    candidate: { id: string; tenantId: string };
    skills: CandidateSkill[];
    projects: CandidateProject[];
    evidence: EvidenceGraphItem[];
  };
  jobDescription: {
    id: string;
    tenantId: string;
    requirements: JobRequirement[];
  };
  targetSkillSlugs?: string[]; // Optional filter (max 5)
  repositoryId?: string; // Optional repository target override
}
```

---

## 3. Output Contract (`ProjectImprovementProposal`)

The recommender outputs a canonical `ProjectImprovementProposal` validated through Zod:

```typescript
interface ProjectImprovementProposal {
  proposalId: string; // UUIDv4
  tenantId: string; // Foreign key to tenants.id
  candidateId: string; // Foreign key to candidates.id
  jobDescriptionId: string; // Foreign key to job_descriptions.id
  resourceId: string; // Foreign key to resources.id
  repositoryName: string; // e.g. "job-tracker-api"
  targetBranch: string; // e.g. "feat/career-hub-redis-3f8a91b2"
  targetSkillSlugs: string[]; // e.g. ["redis"]
  targetSkillNames: string[]; // e.g. ["Redis"]
  gapType: 'MISSING' | 'PARTIAL';
  title: string;
  rationale: string;
  architecturalChange: string;
  expectedFiles: string[];
  patch: {
    fileCount: number; // Max 10
    additionsCount: number;
    deletionsCount: number;
    totalDiffLines: number; // Max 500
    files: Array<{
      path: string; // Relative POSIX path
      operation: 'CREATE' | 'MODIFY' | 'DELETE';
      content: string; // File content
      sha256: string; // SHA-256 hex
      diffLinesCount: number;
    }>;
    patchFingerprint: string; // SHA-256 HMAC of sorted patch files
  };
  evidenceRefs: EvidenceRef[];
  verificationPlan: {
    buildInstructions: string;
    testCommands: string[];
    expectedOutcomes: string[];
    rollbackAdvice: string;
  };
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidenceScore: number;
  status: 'PROPOSED' | 'BLOCKED' | 'INVALID';
  blockReason?: string | null;
  createdAt: Date;
}
```

---

## 4. Structured Patch & Safety Engine

Every generated proposal is evaluated against a 7-point deterministic safety engine:

1. **POSIX Path Sanitization**: Files must use relative POSIX forward slashes, rejecting leading slashes, backslashes, `..` traversal, and null bytes (`\0`).
2. **Immutable Workflow Blocklist**: Files matching `.github/workflows/*`, `.circleci/*`, `.gitlab-ci.yml`, `.travis.yml`, `azure-pipelines.yml`, or `Jenkinsfile` are unconditionally rejected (`PATH_POLICY_VIOLATION`).
3. **Secret & Key File Protection**: Files matching `.env*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, or package lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) are prohibited from manual diff generation.
4. **Binary Extension Exclusion**: 38 binary/compiled extensions (`.png`, `.wasm`, `.zip`, `.exe`, `.pdf`, etc.) are blocked.
5. **Volume Limits**: Maximum 10 files per patch, maximum 500 total lines of diff, maximum 100 KB payload size.
6. **High-Entropy Secret Scanning**: `SecretScrubber` inspects all prose and file contents for AWS keys, GitHub tokens, JWTs, private keys, and connection strings. If detected, status is set to `BLOCKED` with reason `SECRET_DETECTED`.
7. **Evidence Grounding Gate**: Every cited `EvidenceRef` must exist in the verified candidate evidence graph.

---

## 5. AI Authority Limits (Inverse Authority Principle)

| Authority Dimension | AI Provider (Gemini / Vertex) | Deterministic Kernel |
| :--- | :--- | :--- |
| **Skill Gap Status** | Cannot determine; consumes from `EvidenceMatchingService`. | Authoritative matching engine. |
| **Repository Identity** | Cannot choose arbitrary external repositories. | Sourced strictly from verified candidate resources. |
| **Tenant Context** | Zero access to tenant or authentication tokens. | Enforces strict multi-tenant isolation. |
| **Execution Authority** | **ZERO write authority**. Cannot create branches or PRs. | Creates read-only proposal object. |
| **Proposal Synthesis** | Proposes title, rationale, code diff, and test steps. | Validates syntax, scans secrets, computes SHA-256 hash. |

---

## 6. Deterministic Failure Modes

| Error Code | HTTP Status | Trigger Condition |
| :--- | :--- | :--- |
| **`TENANT_ID_REQUIRED`** | `400` | Missing `tenantId` in execution context. |
| **`NOT_FOUND`** | `404` | Candidate, job description, or repository not found or belongs to another tenant. |
| **`UNSUPPORTED_SKILL_GAP`** | `400` | Job description contains 0 missing or partial skill gaps. |
| **`NO_SUITABLE_REPOSITORY`** | `400` | Candidate profile has 0 repositories or no repository with sufficient evidence. |
| **`PATH_POLICY_VIOLATION`** | `400` | Proposed path attempts directory traversal, protected workflow, or secret file edit. |
| **`PATCH_TOO_LARGE`** | `400` | Proposed diff exceeds 10 files, 500 lines, or 100 KB. |
| **`SECRET_DETECTED`** | N/A (`status: BLOCKED`) | Secret or API key pattern detected in generated code; proposal is blocked and redacted. |

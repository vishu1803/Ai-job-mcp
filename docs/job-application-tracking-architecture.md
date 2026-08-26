# Job & Application Tracking Architecture & Relational Schema Specification

> **Document ID**: `ARCH-043`  
> **Related Specifications**: `ARCH-011` (Career Intelligence Engine), `ARCH-015` (ATS Fit Score Calculator), `ARCH-016` (Zero-Hallucination Integrity Gate), `ARCH-017` (Resume & Cover Letter Adaptation), `ADR-064`  
> **Target Phase**: Phase 12 (Job / Application Tracking)  
> **Status**: APPROVED & IMPLEMENTED  

---

## 1. Executive Summary & Problem Statement

Candidates actively managing multiple technical applications need an evidence-linked system of record to track job postings, interview stages, and the exact tailored artifacts (resumes, cover letters, portfolio recommendations) submitted for each role.

### Key Architectural Invariants:
1. **Root Aggregate Pattern**: `JobApplication` serves as the parent entity for `ApplicationStage` events and `TailoredDocument` snapshots.
2. **Deterministic State Machine**: High-level application status transitions follow an explicit directed graph preventing illegal shortcuts (e.g., `SAVED -> OFFER_ACCEPTED` is strictly rejected).
3. **Chronological Stage Event Log**: Interview stages are tracked as append-only event histories preserving timestamps, outcomes, and candidate notes without overwriting macro application status.
4. **Immutable Artifact Snapshots**: Tailored resumes and cover letters attached to an application are stored as immutable snapshots with cryptographic SHA-256 content hashes (`content_hash`) and pinned citation graphs (`citation_refs`). Subsequent candidate profile or repository changes NEVER mutate past application snapshots.
5. **Multi-Tenant Sovereign Isolation**: All queries enforce strict tenant boundary scoping (`tenant_id`), returning `404 NOT_FOUND` for cross-tenant access attempts.
6. **Non-Spam Anti-Bot Rule**: In compliance with `goal.md` §8.1, the platform tracks candidate applications and NEVER performs automated, unsupervised submissions to third-party job boards.

---

## 2. Relational Schema Architecture (3-Table Model)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   tenants / candidates                                 │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ 1 : N (CASCADE)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                     job_applications                                   │
│  - id, tenant_id, candidate_id, company_name, job_title, job_url, source               │
│  - location, workplace_type, employment_type                                           │
│  - raw_job_description, parsed_job_description (jsonb), ats_fit_snapshot (jsonb)       │
│  - status (enum), applied_at, closed_at, compensation (jsonb), notes, metadata         │
└─────────────────────┬──────────────────────────────────────────────────┬───────────────┘
                      │ 1 : N (CASCADE)                                  │ 1 : N (CASCADE)
                      ▼                                                  ▼
┌──────────────────────────────────────────┐    ┌────────────────────────────────────────┐
│            application_stages            │    │           tailored_documents           │
│  - id, tenant_id, application_id         │    │  - id, tenant_id, application_id       │
│  - stage_type, title, scheduled_at       │    │  - candidate_id, document_type, version│
│  - completed_at, outcome, feedback       │    │  - title, content (jsonb), content_hash│
│  - interviewer_names, order_index        │    │  - citation_refs (jsonb), rendered_*   │
└──────────────────────────────────────────┘    └────────────────────────────────────────┘
```

---

## 3. Enumerations

### 3.1 `application_status`
```sql
CREATE TYPE "public"."application_status" AS ENUM(
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEWING',
  'OFFER_RECEIVED',
  'OFFER_ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'ARCHIVED'
);
```

### 3.2 `stage_type`
```sql
CREATE TYPE "public"."stage_type" AS ENUM(
  'DISCOVERY',
  'RESUME_SUBMITTED',
  'RECRUITER_SCREEN',
  'TECHNICAL_ASSESSMENT',
  'SYSTEM_DESIGN',
  'BEHAVIORAL',
  'ONSITE_LOOP',
  'OFFER_NEGOTIATION',
  'POST_OFFER',
  'OTHER'
);
```

### 3.3 `stage_outcome`
```sql
CREATE TYPE "public"."stage_outcome" AS ENUM(
  'PENDING',
  'PASSED',
  'FAILED',
  'SKIPPED',
  'RESCHEDULED'
);
```

### 3.4 `tailored_document_type`
```sql
CREATE TYPE "public"."tailored_document_type" AS ENUM(
  'TAILORED_RESUME',
  'TAILORED_COVER_LETTER',
  'PORTFOLIO_RECOMMENDATION',
  'CUSTOM_NOTE'
);
```

---

## 4. Directed Application State Machine

```
                               ┌─────────────┐
                               │    SAVED    │
                               └──────┬──────┘
                                      │
               ┌──────────────────────┼──────────────────────┐
               │                      ▼                      │
               │               ┌─────────────┐               │
               │               │   APPLIED   │               │
               │               └──────┬──────┘               │
               │                      │                      │
               │         ┌────────────┼────────────┐         │
               │         ▼                         ▼         │
               │  ┌─────────────┐           ┌─────────────┐  │
               │  │  SCREENING  │           │ REJECTED ◄──┼──┤ (From any active state)
               │  └──────┬──────┘           └─────────────┘  │
               │         │                         ▲         │
               │         ▼                         │         │
               │  ┌─────────────┐                  │         │
               │  │INTERVIEWING ├──────────────────┤         │
               │  └──────┬──────┘                  │         │
               │         │                         │         │
               │         ▼                         │         │
               │  ┌──────────────┐                 │         │
               │  │OFFER_RECEIVED├─────────────────┘         │
               │  └──────┬───────┘                           │
               │         │                                   │
               │         ▼                                   │
               │  ┌──────────────┐                           │
               │  │OFFER_ACCEPTED│                           │
               │  └──────┬───────┘                           │
               │         │                                   │
               ▼         ▼                                   ▼
        ┌───────────────────────────────────────────────────────────┐
        │               WITHDRAWN  /  ARCHIVED                      │
        └───────────────────────────────────────────────────────────┘
```

### Transition Validation Rules

| Current Status | Allowed Next Statuses | Transition Notes |
|---|---|---|
| `SAVED` | `APPLIED`, `WITHDRAWN`, `ARCHIVED` | Cannot skip submission to enter screening/interview/offer. |
| `APPLIED` | `SCREENING`, `INTERVIEWING`, `REJECTED`, `WITHDRAWN`, `ARCHIVED` | Sets `applied_at = now()`. |
| `SCREENING` | `INTERVIEWING`, `OFFER_RECEIVED`, `REJECTED`, `WITHDRAWN`, `ARCHIVED` | Recruiter screening in progress. |
| `INTERVIEWING` | `OFFER_RECEIVED`, `REJECTED`, `WITHDRAWN`, `ARCHIVED` | Technical/behavioral loops. |
| `OFFER_RECEIVED` | `OFFER_ACCEPTED`, `REJECTED` (rescinded), `WITHDRAWN` (declined), `ARCHIVED` | Decision pending. |
| `OFFER_ACCEPTED` | `ARCHIVED` | Terminal success state. |
| `REJECTED` | `ARCHIVED`, `APPLIED` (Reopened) | Reopening requires explicit user action. |
| `WITHDRAWN` | `ARCHIVED`, `SAVED`, `APPLIED` (Reopened) | Reopening resets timeline. |
| `ARCHIVED` | `SAVED`, `APPLIED`, `SCREENING`, `INTERVIEWING` | Un-archiving restores prior active state. |

---

## 5. Tailored Document Snapshots & Cryptographic Integrity

1. **Immutability Invariant**: Stored document snapshots on `tailored_documents` represent historical truth and are append-only.
2. **SHA-256 Content Hash Calculation**:
   ```javascript
   function computeContentHash(content) {
     const canonicalJson = JSON.stringify(sortKeys(content));
     return crypto.createHash('sha256').update(canonicalJson).digest('hex');
   }
   ```
3. **Citation Provenance**: Preserves `{ evidenceId, commitSha, filePath, lineRange }` references so that the proof of candidate competence remains permanently linked to the specific application version.

---

## 6. Database Indexes & Query Performance

1. `idx_job_applications_tenant_id`: `(tenant_id)`
2. `idx_job_applications_tenant_candidate`: `(tenant_id, candidate_id)`
3. `idx_job_applications_tenant_status`: `(tenant_id, status)`
4. `idx_job_applications_tenant_company`: `(tenant_id, company_name)`
5. `idx_job_applications_tenant_applied`: `(tenant_id, applied_at DESC)`
6. `idx_application_stages_tenant_application`: `(tenant_id, application_id)`
7. `idx_application_stages_app_order`: `(application_id, order_index)`
8. `idx_tailored_docs_tenant_application`: `(tenant_id, application_id)`
9. `idx_tailored_docs_tenant_candidate`: `(tenant_id, candidate_id)`
10. `idx_tailored_docs_content_hash`: `(content_hash)`

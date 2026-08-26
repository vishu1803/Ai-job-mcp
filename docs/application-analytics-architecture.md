# Application Analytics Architecture & Statistical Safety (ARCH-045 / ADR-065)

**Status**: **`IMPLEMENTED & VERIFIED`**  
**Date**: 2026-08-26  
**Scope**: Phase 12 / P12-004 — Application Analytics Engine & Statistical Governance  

---

## 1. Executive Summary & Objective

The **Application Analytics Engine** (`ApplicationAnalyticsService`) provides high-integrity, deterministic, descriptive statistical analysis across candidate job applications, interview stages, and skill gaps.

It answers critical candidate workflow questions:
1. **Application Funnel Progression**: What is the candidate's historical submission, response, interview, and offer progression?
2. **Match Score vs. Response Rate Correlation**: How do application-time ATS match score bands correlate with observed recruiter responses?
3. **Skill-Gap Frequency Distribution**: Which missing technical skills appear most frequently across target job requirements?

---

## 2. Core Architectural Invariants

1. **Zero Database Schema Overhead**: Computes analytics dynamically from indexed PostgreSQL tables (`job_applications`, `application_stages`, `skills`, `candidate_skills`). No analytics tables or materialized views needed.
2. **Immutable Point-in-Time Score Snapshots**: Historical correlation strictly consumes immutable `ats_fit_snapshot.overallScore` values captured at application time. No dynamic recalculation against current candidate skills.
3. **Descriptive Non-Causal Terminology**: All output schemas and reporting enforce strictly descriptive terms (`observedResponseRate`, `progressionSummary`, `historicalCohort`). Explicit disclaimer: *"Descriptive summary of historical application tracking data. Correlation does not imply causation."*
4. **Small-Sample Privacy & Suppression ($N < 5$)**: When cohort sample sizes are less than 5, percentage metrics are suppressed (`null`) and flagged with `INSUFFICIENT_DATA` to prevent misleading extrapolation or re-identification.
5. **Multi-Tenant Sovereign Isolation**: All analytics queries require authenticated `McpRequestContext.tenantId` and `candidateId`. Cross-tenant queries return `404 NOT_FOUND`.
6. **Canonical Skill Normalization**: Skill gaps are normalized against the canonical skill taxonomy (`skills.slug`), preventing duplicate counts for alias variants (e.g. `"Node.js"`, `"nodejs"` $\to$ `node-js`).

---

## 3. Mathematical & Funnel Definitions

### 3.1 Funnel Populations
- **Tracked Portfolio Total**: Count of all application records (`SAVED` through `ARCHIVED`).
- **Submitted Population ($N_{\text{submitted}}$)**: Applications actively submitted (`status != 'SAVED' || appliedAt IS NOT NULL`). Pure `SAVED` bookmarks are strictly excluded from response-rate denominators.
- **Responded Population ($N_{\text{responded}}$)**: Submitted applications that reached `SCREENING`, `INTERVIEWING`, `OFFER_RECEIVED`, `OFFER_ACCEPTED`, or have at least one interview stage event (`RECRUITER_SCREEN`, `TECHNICAL_ASSESSMENT`, `SYSTEM_DESIGN`, `BEHAVIORAL`, `ONSITE_LOOP`, `OFFER_NEGOTIATION`, `POST_OFFER`).
- **Withdrawn Logic**: If an application was withdrawn before any response occurred, it is deducted from the response denominator ($N_{\text{eff}} = N_{\text{submitted}} - N_{\text{withdrawn\_prior}}$) so employer responsiveness is not penalized.

### 3.2 Score Band Breakdown
1. `85.0 - 100.0` $\to$ **`EXCELLENT`**
2. `70.0 -  84.9` $\to$ **`STRONG`**
3. `50.0 -  69.9` $\to$ **`MODERATE`**
4. ` 0.0 -  49.9` $\to$ **`LOW`**
5. Missing Snapshot $\to$ **`UNSCORED`** (never coerced to `0`)

### 3.3 Three Skill-Gap Metrics
1. **Target Demand Frequency**: $\frac{\text{Jobs Requiring Skill } S}{N_{\text{analyzed\_jobs}}} \times 100$
2. **Overall Gap Rate**: $\frac{\text{Jobs where Candidate Lacked Skill } S}{N_{\text{analyzed\_jobs}}} \times 100$
3. **Conditional Gap Rate**: $\frac{\text{Jobs where Candidate Lacked Skill } S}{\text{Jobs Requiring Skill } S} \times 100$ (suppressed if $N_{\text{required}} < 5$)

---

## 4. Verification & Quality Gates

- **Unit Tests**: [`tests/unit/application-analytics.service.test.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/tests/unit/application-analytics.service.test.js)
- **Integration Tests**: [`tests/integration/application-analytics.service.test.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/tests/integration/application-analytics.service.test.js)

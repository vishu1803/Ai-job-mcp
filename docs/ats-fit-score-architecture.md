# ATS Fit Score Calculator Architecture Review (ARCH-015)

**Status**: APPROVED  
**Author**: Antigravity Platform Engineering & AI Architecture Team  
**Date**: 2026-08-22  
**Target Milestone**: Phase 5: Career Intelligence Engine (`P5-005A` / `P5-005`)  
**Document ID**: `ARCH-015`  
**Related Documents**:
* `docs/career-intelligence-architecture.md` (`ARCH-011`)
* `docs/skill-taxonomy-architecture.md` (`ARCH-012`)
* `docs/evidence-matching-architecture.md` (`ARCH-013`)
* `docs/project-relevance-architecture.md` (`ARCH-014`)
* `docs/decisions.md` (`ADR-035`)
* `AGENTS.md` & `goal.md`

---

## 1. Executive Summary & Objective

The **ATS Fit Score Calculator** is the apex evaluation engine of the Career Intelligence subsystem. It synthesizes discrete capability evaluations from upstream services—**Candidate Requirement Matching** (`P5-003`, `ARCH-013`) and **Project Relevance Scoring** (`P5-004`, `ARCH-014`)—into a unified, mathematically rigorous, and fully decomposable **100-Point Candidate-Job Fit Score**.

```
+---------------------------------------------------------------------------------------------------+
|                               ATS FIT SCORE CALCULATION PIPELINE                                  |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  +------------------------+      +---------------------------+      +--------------------------+  |
|  | CandidateMatchAnalysis |      | ProjectRelevanceAnalysis  |      |     CandidateProfile     |  |
|  | (P5-003 / ARCH-013)    |      | (P5-004 / ARCH-014)       |      | (Phase 4 / ARCH-010)     |  |
|  | - MATCHED / PARTIAL    |      | - Ranked Projects (0-100) |      | - Experience Tenure      |  |
|  | - MISSING / UNKNOWN    |      | - Architectural Signals   |      | - Education Degrees      |  |
|  | - Prioritized Gaps     |      | - Commit-Pinned Evidence  |      | - Location Preferences   |  |
|  +-----------+------------+      +-------------+-------------+      +------------+-------------+  |
|              |                                 |                                 |                |
|              +---------------------------------+---------------------------------+                |
|                                                |                                                  |
|                                                v                                                  |
|                    +-------------------------------------------------------+                      |
|                    |             ATS FIT SCORE CALCULATOR ENGINE           |                      |
|                    |  1. Required Skills Coverage (40%)                    |                      |
|                    |  2. Preferred Skills Coverage (15%)                   |                      |
|                    |  3. Project Relevance & Architecture Proof (20%)      |                      |
|                    |  4. Professional Experience Tenure Fit (10%)          |                      |
|                    |  5. Education Alignment Fit (5%)                      |                      |
|                    |  6. Location & Work Auth Fit (5%)                     |                      |
|                    |  7. Evidence Confidence & Provenance Strength (5%)    |                      |
|                    +---------------------------+---------------------------+                      |
|                                                |                                                  |
|                                                v                                                  |
|                    +-------------------------------------------------------+                      |
|                    |             REQUIRED SKILL SAFETY GATE                |                      |
|                    |  - 0 Missing Required: Max Score = 100.0 (No Cap)     |                      |
|                    |  - 1 Missing Required: Hard Score Cap = 74.9 (MODERATE|                      |
|                    |  - 2 Missing Required: Hard Score Cap = 49.9 (WEAK)   |                      |
|                    |  - 3+ Missing Required: Hard Score Cap = 24.9 (LOW)   |                      |
|                    +---------------------------+---------------------------+                      |
|                                                |                                                  |
|                                                v                                                  |
|                    +-------------------------------------------------------+                      |
|                    |               CandidateJobFitAnalysis                 |                      |
|                    |  - overallScore: [0.0 - 100.0]                        |                      |
|                    |  - fitBand: EXCELLENT | STRONG | MODERATE | WEAK | LOW|                      |
|                    |  - scoreBreakdown: 7 Distinct Additive Components     |                      |
|                    |  - keyStrengths: Structured, Evidence-Backed Proof    |                      |
|                    |  - skillGaps: Prioritized CRITICAL / HIGH / MED Gaps  |                      |
|                    |  - explanation: Deterministic Rationale Narrative     |                      |
|                    +-------------------------------------------------------+                      |
+---------------------------------------------------------------------------------------------------+
```

### Core Architectural Invariants
1. **Mathematical Explainability**: The overall score is an exact additive decomposition of 7 distinct, bounded components summing to $100.0$.
2. **Zero Score Hallucination**: Large Language Models (LLMs) are strictly forbidden from calculating, adjusting, or weighting scores.
3. **Required Skill Safety Gate**: Hard score caps prevent candidates with missing `REQUIRED` technical competencies from achieving misleadingly high scores through preferred skills or vanity projects.
4. **Zero Double-Counting**: Requirement matching, project relevance, and evidence confidence evaluate orthogonal facets of competence without inflating identical data signals.
5. **Multi-Tenant Sovereign Isolation**: All inputs and outputs enforce strict `context.tenantId` verification with immediate `404 NotFoundError` default-deny.
6. **Sub-Millisecond In-Memory Computation**: $\mathcal{O}(|\text{Requirements}| + |\text{Projects}|)$ algorithmic complexity with zero network I/O or premature database persistence.

---

## 2. The 100-Point Composite Scoring Model

### 2.1 Component Weight Distribution Matrix

| Component | Key Identifier | Max Points | Weight | Source Evaluation Engine | Core Assessment |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **Required Skills Coverage** | `requiredSkillsScore` | **$40.0$** | $40\%$ | `CandidateMatchAnalysis` (`P5-003`) | Direct satisfaction of mandatory job requirements. |
| **Preferred Skills Coverage** | `preferredSkillsScore` | **$15.0$** | $15\%$ | `CandidateMatchAnalysis` (`P5-003`) | Bonus and differentiator skills. |
| **Project Relevance & Depth** | `projectRelevanceScore` | **$20.0$** | $20\%$ | `ProjectRelevanceAnalysis` (`P5-004`) | Demonstrated full-stack architecture & verified codebases. |
| **Professional Experience Fit** | `experienceFitScore` | **$10.0$** | $10\%$ | `CandidateProfile.experience` | Explicit employment tenure alignment. |
| **Education Alignment Fit** | `educationFitScore` | **$5.0$** | $5\%$ | `CandidateProfile.education` | Academic degree hierarchy compliance. |
| **Location & Work Auth Fit** | `locationFitScore` | **$5.0$** | $5\%$ | `CandidateProfile.location` | Remote / hybrid / on-site geographic compatibility. |
| **Evidence Confidence Depth** | `evidenceConfidenceScore` | **$5.0$** | $5\%$ | `EvidenceRef` provenance quality | Machine-verified manifests/ASTs vs manual user claims. |
| **TOTAL** | `overallScore` | **$100.0$** | **$100\%$** | Combined Pipeline | **Canonical ATS Fit Score** |

$$\text{RawScore} = S_{\text{req}} + S_{\text{pref}} + S_{\text{proj}} + S_{\text{exp}} + S_{\text{edu}} + S_{\text{loc}} + S_{\text{conf}}$$

---

## 3. Required Skill Safety Gate (Hard Score Cap & Anti-Inflation)

In production hiring workflows, candidate qualifications are non-compensatory: **an abundance of secondary or preferred skills cannot compensate for missing core requirements**.

### 3.1 Hard Score Ceiling Protocol

The calculator inspects the count of `CRITICAL` skill gaps (i.e. `REQUIRED` technical requirements evaluated as `MISSING`):

$$\text{ScoreCap}(N_{\text{crit}}) = \begin{cases} 
100.0 & \text{if } N_{\text{crit}} = 0 \quad (\text{Eligible for EXCELLENT / STRONG}) \\
74.9 & \text{if } N_{\text{crit}} = 1 \quad (\text{Hard Cap: MODERATE Fit}) \\
49.9 & \text{if } N_{\text{crit}} = 2 \quad (\text{Hard Cap: WEAK Fit}) \\
24.9 & \text{if } N_{\text{crit}} \ge 3 \quad (\text{Hard Cap: LOW Fit})
\end{cases}$$

### 3.2 Effective Overall Score Formula

$$S_{\text{overall}} = \operatorname{round}\left(\min\left(\text{RawScore}, \, \text{ScoreCap}(N_{\text{crit}})\right), \, 2\right)$$

```
Example Scenario:
- Candidate has 100% Preferred Coverage (15.0 pts)
- Candidate has High Project Relevance (20.0 pts)
- Candidate has Full Experience Tenure (10.0 pts)
- Candidate has Master's Degree (5.0 pts)
- Candidate is Local / On-Site (5.0 pts)
- Candidate has High Evidence Confidence (5.0 pts)
- BUT Candidate is MISSING 1 Critical Required Skill (e.g., Python for Python Backend Role)
  -> Required Skills Score: 30.0 / 40.0
  -> Raw Score: 30.0 + 15.0 + 20.0 + 10.0 + 5.0 + 5.0 + 5.0 = 90.0
  -> Critical Gap Count: 1
  -> ScoreCap: 74.9
  -> Final ATS Fit Score: 74.9 / 100.0 (Classified as MODERATE, NOT EXCELLENT)
```

---

## 4. Component Formulations & Mathematical Specifications

### 4.1 Required Skills Coverage ($S_{\text{req}} \in [0.0, 40.0]$)

Consumes requirement matches from `CandidateMatchAnalysis` where `importance === 'REQUIRED'` and `category === 'SKILL'`:

$$S_{\text{req}} = 40.0 \times \frac{\sum_{r \in \text{ReqSkills}} W_{\text{tier}}(r) \times V_{\text{match}}(r)}{\sum_{r \in \text{ReqSkills}} W_{\text{tier}}(r)}$$

Where:
* $V_{\text{match}}(r) = 1.00$ for `MATCHED` (Cryptographically verified code evidence).
* $V_{\text{match}}(r) = 0.75$ for `PARTIAL` with verified adjacent framework (`BUILT_ON` e.g., Next.js for React).
* $V_{\text{match}}(r) = 0.50$ for `PARTIAL` with ecosystem driver (`ECOSYSTEM_OF` e.g., Drizzle for PostgreSQL).
* $V_{\text{match}}(r) = 0.50$ for `PARTIAL` with engine abstraction (`IMPLEMENTS` e.g., PostgreSQL for SQL).
* $V_{\text{match}}(r) = 0.25$ for `PARTIAL` with unverified self-claim (`[Unverified User Claim]`).
* $V_{\text{match}}(r) = 0.00$ for `MISSING` (0 evidence and 0 claims).
* $V_{\text{match}}(r) = 1.00$ for `UNKNOWN` (Excluded from penalty denominator).

*Default Behavior*: If the job description defines $0$ technical required skills, $S_{\text{req}}$ defaults neutrally to $40.0$.

---

### 4.2 Preferred Skills Coverage ($S_{\text{pref}} \in [0.0, 15.0]$)

Consumes requirement matches where `importance === 'PREFERRED'` or `importance === 'OPTIONAL'`:

$$S_{\text{pref}} = 15.0 \times \frac{\sum_{p \in \text{PrefSkills}} W_{\text{tier}}(p) \times V_{\text{match}}(p)}{\sum_{p \in \text{PrefSkills}} W_{\text{tier}}(p)}$$

*Default Behavior*: If the job description defines $0$ preferred skills, $S_{\text{pref}}$ defaults neutrally to $15.0$.

---

### 4.3 Project Relevance & Architecture Depth ($S_{\text{proj}} \in [0.0, 20.0]$)

Consumes `projectRankings` from `ProjectRelevanceAnalysis` (`P5-004`). To prevent spamming small or superficial repositories while rewarding deep, production-grade systems, the calculator applies a **decaying top-3 weighted average**:

$$S_{\text{proj\_agg}} = \begin{cases}
S_{\text{proj}}(1) & \text{if } |\text{Projects}| = 1 \\
0.67 \cdot S_{\text{proj}}(1) + 0.33 \cdot S_{\text{proj}}(2) & \text{if } |\text{Projects}| = 2 \\
0.60 \cdot S_{\text{proj}}(1) + 0.30 \cdot S_{\text{proj}}(2) + 0.10 \cdot S_{\text{proj}}(3) & \text{if } |\text{Projects}| \ge 3 \\
0.0 & \text{if } |\text{Projects}| = 0
\end{cases}$$

$$S_{\text{proj}} = \operatorname{round}\left(20.0 \times \frac{S_{\text{proj\_agg}}}{100.0}, \, 2\right)$$

*Key Rationale*: A candidate with one world-class project scoring $90.0$ earns $18.0 / 20.0$ points. Ten trivial utility repositories scoring $20.0$ earn only $4.0 / 20.0$ points.

---

### 4.4 Professional Experience Fit ($S_{\text{exp}} \in [0.0, 10.0]$)

Evaluates explicit corporate employment tenure from `candidateProfile.experience` against job requirements with `category === 'EXPERIENCE'`:

$$S_{\text{exp}} = \begin{cases}
10.0 & \text{if matchStatus is MATCHED} \\
10.0 \times \min\left(1.0, \, \frac{\text{ObservedTenureMonths}}{\text{RequiredTenureMonths}}\right) & \text{if matchStatus is PARTIAL} \\
0.0 & \text{if matchStatus is MISSING} \\
10.0 & \text{if matchStatus is UNKNOWN or 0 Experience Requirements}
\end{cases}$$

*Zero Conflation Rule*: Observed Git commit activity duration provides technical skill evidence, but is **never** credited as corporate professional employment tenure without explicit career history records.

---

### 4.5 Education Alignment Fit ($S_{\text{edu}} \in [0.0, 5.0]$)

Evaluates degrees recorded in `candidateProfile.education` against job requirements with `category === 'EDUCATION'`:

$$S_{\text{edu}} = \begin{cases}
5.0 & \text{if matchStatus is MATCHED (Degree meets/exceeds requirement)} \\
3.0 & \text{if matchStatus is PARTIAL (e.g. Bachelor's for Master's, or related STEM field)} \\
0.0 & \text{if matchStatus is MISSING (Explicitly below required minimum degree)} \\
5.0 & \text{if matchStatus is UNKNOWN (Unstated in candidate profile) or 0 Education Requirements}
\end{cases}$$

*Unstated Education Rule*: Candidates who omit education details from their profile evaluate to `UNKNOWN` and receive neutral baseline credit ($5.0$ pts), preventing automatic penalty when education is unstated.

---

### 4.6 Location & Work Authorization Fit ($S_{\text{loc}} \in [0.0, 5.0]$)

Evaluates geographic and remote alignment from `candidateProfile.location` against job requirements with `category === 'LOCATION'`:

$$S_{\text{loc}} = \begin{cases}
5.0 & \text{if matchStatus is MATCHED (Remote role, same metro, or authorized jurisdiction)} \\
3.75 & \text{if matchStatus is PARTIAL (Hybrid within commutable zone or relocation candidate)} \\
0.0 & \text{if matchStatus is MISSING (Strict on-site in non-commutable foreign jurisdiction)} \\
5.0 & \text{if matchStatus is UNKNOWN (Unstated location) or 0 Location Requirements}
\end{cases}$$

---

### 4.7 Evidence Confidence & Provenance Strength ($S_{\text{conf}} \in [0.0, 5.0]$)

Measures the evidentiary cryptographic integrity across all supporting evidence nodes cited in requirement matches and top projects:

$$S_{\text{conf}} = 5.0 \times \frac{\sum_{e \in \text{CitedEvidence}} W_{\text{evid}}(e) \times C_{\text{evid}}(e)}{\max(1, \, |\text{CitedEvidence}|)}$$

Where $W_{\text{evid}}$ reflects the established evidentiary hierarchy:
* `PACKAGE_MANIFEST_DEPENDENCY`: $1.00$
* `CODE_IMPORT_USAGE`: $0.95$
* `CODE_USAGE`: $0.90$
* `CONFIG_SYNTAX_DECLARATION`: $0.85$
* `COMMIT_CONTRIBUTION`: $0.75$
* `README_SPECIFICATION`: $0.30$
* `DOCUMENT_CLAIM` (`[Unverified User Claim]`): $0.00$

*Double-Counting Guard*: Evidence confidence acts as an independent quality validator ($5\%$ weight) without modifying or re-weighting the $40\%$ required skill score or $20\%$ project relevance score.

---

## 5. Fit Score Bands & Categorization

The overall ATS fit score maps into **5 deterministic fit bands**:

```
+---------------------------------------------------------------------------------------------------+
|                                     ATS FIT SCORE BANDS                                           |
+-------------------+----------------+--------------------------------------------------------------+
| Band              | Score Range    | Qualification Profile                                        |
+-------------------+----------------+--------------------------------------------------------------+
| **EXCELLENT**     | 90.0 - 100.0   | Full required skill satisfaction with verified code proof,   |
|                   |                | top-tier project relevance, and 0 critical skill gaps.       |
| **STRONG**        | 75.0 - 89.9    | Complete required technical coverage, solid project evidence,|
|                   |                | minor gaps limited strictly to preferred/optional skills.    |
| **MODERATE**      | 50.0 - 74.9    | Core competencies mostly met; at most 1 critical gap or      |
|                   |                | multiple partial skills; moderate project proof.             |
| **WEAK**          | 25.0 - 49.9    | Substantial required skill gaps (2 critical gaps) or low     |
|                   |                | architectural relevance in repository evidence.              |
| **LOW**           |  0.0 - 24.9    | Disqualifying skill gaps (3+ critical gaps); negligible code |
|                   |                | evidence matching job description requirements.              |
+-------------------+----------------+--------------------------------------------------------------+
```

---

## 6. Deterministic Explanations & Structured Strengths

### 6.1 Structured Fit Strengths (`FitStrength`)
Every calculation extracts up to **5 key strengths** directly derived from verified data points:
1. **Full Required Skill Mastery**: Generated when $S_{\text{req}} \ge 36.0 / 40.0$ ($90\%+$).
2. **High-Relevance Project Anchor**: Generated when top project relevance $\ge 75.0 / 100.0$.
3. **Deep Architectural Density**: Generated when candidate projects exhibit $\ge 6$ architectural dimensions.
4. **Cryptographically Verified Code Evidence**: Generated when $S_{\text{conf}} \ge 4.5 / 5.0$.
5. **Preferred Technology Alignment**: Generated when $S_{\text{pref}} \ge 12.0 / 15.0$.

### 6.2 Standardized Narrative Explanation Template
Explanations are constructed using deterministic templates:
* **Excellent / Strong**:  
  `"STRONG fit (84.5/100): Candidate satisfies all 5 required technical skills (FastAPI, PostgreSQL, Docker, Redis, Go) with verified repository evidence. Top project 'trading-api' exhibits high architectural density (82.0/100). Gaps are limited to 1 preferred skill (Kubernetes)."`
* **Capped Moderate (Missing Core Requirement)**:  
  `"MODERATE fit (74.9/100 - Score Capped): Candidate satisfies 4 of 5 required skills and demonstrates high project relevance, but is missing 1 critical required skill (Python), which caps the overall score at 74.9."`
* **Low / Weak**:  
  `"LOW fit (18.2/100): Candidate has 3 critical missing required skills (React, TypeScript, GraphQL) and lacks verified repository evidence matching the role requirements."`

---

## 7. Multi-Tenant Sovereign Isolation

1. **Hermetic Context Scoping**: Every invocation requires an authenticated, immutable `context` with `context.tenantId`.
2. **All-Input Boundary Verification**:
   * `jobDescription.tenantId === context.tenantId`
   * `candidateProfile.tenantId === context.tenantId`
   * `candidateMatchAnalysis.tenantId === context.tenantId`
   * `projectRelevanceAnalysis.tenantId === context.tenantId`
3. **Cross-Tenant Default-Deny**: Any tenant mismatch immediately triggers `404 NotFoundError` without revealing resource existence or state.
4. **Secret Scrubbing**: Output models contain zero API keys, auth headers, private emails, or session tokens.

---

## 8. Target Domain Schema Contracts

```javascript
import { z } from 'zod';
import { SafeSlugSchema } from '../candidate/candidate.schemas.js';
import { EvidenceRefSchema, SkillGapSchema } from './evidence-matching.schemas.js';
import { ProjectRelevanceSchema } from './project-relevance.schemas.js';

export const FitScoreBandEnum = z.enum([
  'EXCELLENT',
  'STRONG',
  'MODERATE',
  'WEAK',
  'LOW',
]);

export const FitScoreBreakdownSchema = z.strictObject({
  requiredSkillsScore: z.number().min(0.0).max(40.0),
  preferredSkillsScore: z.number().min(0.0).max(15.0),
  projectRelevanceScore: z.number().min(0.0).max(20.0),
  experienceFitScore: z.number().min(0.0).max(10.0),
  educationFitScore: z.number().min(0.0).max(5.0),
  locationFitScore: z.number().min(0.0).max(5.0),
  evidenceConfidenceScore: z.number().min(0.0).max(5.0),
  rawScore: z.number().min(0.0).max(100.0),
  scoreCap: z.number().min(0.0).max(100.0).nullable().optional(),
  overallScore: z.number().min(0.0).max(100.0),
});

export const FitStrengthSchema = z.strictObject({
  category: z.enum([
    'REQUIRED_SKILL_COVERAGE',
    'PROJECT_RELEVANCE',
    'ARCHITECTURAL_DENSITY',
    'EVIDENCE_INTEGRITY',
    'PREFERRED_SKILL_COVERAGE',
    'EXPERIENCE_TENURE',
  ]),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(1000),
  contributionScore: z.number().min(0.0).max(40.0),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
});

export const CandidateJobFitAnalysisSchema = z.strictObject({
  jobDescriptionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  tenantId: z.string().uuid(),
  overallScore: z.number().min(0.0).max(100.0),
  fitBand: FitScoreBandEnum,
  scoreBreakdown: FitScoreBreakdownSchema,
  criticalGapCount: z.number().int().nonnegative(),
  highGapCount: z.number().int().nonnegative(),
  isCapped: z.boolean(),
  keyStrengths: z.array(FitStrengthSchema).default([]),
  skillGaps: z.array(SkillGapSchema).default([]),
  topRelevantProjects: z.array(ProjectRelevanceSchema).max(3).default([]),
  explanation: z.string().min(1).max(2000),
  confidence: z.number().min(0.0).max(1.0),
  analyzedAt: z.string().datetime(),
});
```

---

## 9. Performance & In-Memory Computation

* **Pure In-Memory Reduction**: Operates directly on pre-computed `CandidateMatchAnalysis` and `ProjectRelevanceAnalysis` inputs.
* **$\mathcal{O}(|\text{Requirements}| + |\text{Projects}| + |\text{Gaps}|)$ Latency**: Execution takes $< 1.0\text{ ms}$ with zero network, filesystem, or database I/O.
* **Ephemeral On-Demand Computation**: No database migrations or persistent ATS fit tables are introduced in Phase 5. Persistence is evaluated during Phase 12 (Application Tracking).

---

## 10. Comprehensive Verification & Testing Strategy

In Phase `P5-005`, the implementation will be verified through:
1. **Mathematical Additive Decomposition**: Asserts that $S_{\text{overall}} = \sum \text{Components}$ across 50 simulated profiles.
2. **Safety Gate Score Cap Enforcement**:
   * 0 critical gaps $\rightarrow$ Eligible for $90.0 - 100.0$.
   * 1 critical gap $\rightarrow$ Max score clamped to $74.9$.
   * 2 critical gaps $\rightarrow$ Max score clamped to $49.9$.
   * 3+ critical gaps $\rightarrow$ Max score clamped to $24.9$.
3. **Decaying Top-3 Project Aggregation**: Verifies that 1 strong project ($90.0$) outranks 10 small projects ($20.0$).
4. **UNKNOWN vs MISSING Non-Penalization**: Asserts unstated education or soft skills do not lower scores below verified baselines.
5. **Multi-Tenant Isolation**: Confirms 404 default-deny across mismatched candidate, job, match analysis, and project analysis tenant IDs.
6. **Bit-for-Bit Determinism**: Asserts 100 consecutive runs produce strictly identical output payloads.

---

## 11. Implementation & Verification Status (P5-005)

The **ATS Fit Score Calculator Engine** has been implemented and verified in Phase `P5-005`:
* **Domain Schemas**: `src/domain/career/ats-fit-score.schemas.js` (`FitScoreBandEnum`, `FitStrengthCategoryEnum`, `FitScoreBreakdownSchema`, `FitStrengthSchema`, `FitScoreExplanationSchema`, `CandidateJobFitAnalysisSchema`).
* **Core Service**: `src/services/ats-fit-score.service.js` (`AtsFitScoreService.calculateCandidateJobFit`).
* **Unit Verification**: `tests/unit/ats-fit-score.service.test.js` (31/31 PASS across 12 suites).
* **Live Integration Verification**: `tests/integration/ats-fit-score.service.test.js` (2/2 PASS across live PostgreSQL database).
* **Quality Gates**: Full platform test suite (708/708 PASS across 251 suites), ESLint 0 errors, Prettier format check PASS, Drizzle Kit check PASS.

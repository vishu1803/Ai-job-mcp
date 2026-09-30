# ATS Industry Gap Analysis & Current-State Audit (Phase 0)

**Date**: 2026-09-30  
**Repository**: `https://github.com/vishu1803/Ai-job-mcp`  
**Document ID**: `ARCH-ATS-GAP-001`  
**Status**: COMPLETE & VERIFIED  

---

## 1. Executive Summary

This audit establishes the baseline architectural state of the **AI Career Agent / AI Job MCP** platform prior to implementing the **Industry-Grade ATS Intelligence Upgrade**. 

The repository currently provides robust, deterministic foundation services for:
* Multi-factor job match scoring (`AtsFitScoreService`, 40/15/20/10/5/5/5 model)
* ATS document parseability analysis (`AtsParseabilityService`, 11 structural checks)
* Native PDF & DOCX text extraction (`ResumeParserService`, `ResumePdfObserver`)
* Exact and semantic keyword coverage tracking (`ResumeKeywordCoverageService`)
* Candidate project relevance & 10-dimension architectural density (`ProjectRelevanceService`)
* Candidate evidence extraction from Git manifests & code ASTs (`GitHubEvidenceExtractorService`)
* Zero-hallucination claim verification (`ZeroHallucinationIntegrityService`, `ResumeClaimValidationService`)
* Application handoff packaging & readiness checks (`ApplicationReadinessService`, `ApplicationHandoffService`)

However, the current platform exhibits architectural gaps when evaluated against modern, enterprise-grade recruiting and applicant tracking system (ATS) expectations:
1. **Single Composite Score Conflation**: Downstream consumers often receive a single "Fit Score" or "ATS Score" rather than an explicit 8-dimensional profile distinguishing parseability, extraction accuracy, keyword match, content quality, candidate-job fit, evidence confidence, independent candidate quality, and application readiness.
2. **Scoring Policy Inconsistency for `UNKNOWN`**: The original design document (`docs/ats-fit-score-architecture.md`) specified neutral/non-penalizing credit for `UNKNOWN` requirements (such as unstated education or location), whereas the implementation (`src/services/ats-fit-score.service.js`) implemented Rule 23 (assigning 0.0 value factor). A canonical, unified scoring policy specification is required.
3. **Lack of ATS Compatibility Profiles**: While the system tests PDF text extractability, it lacks specific compatibility profiles modeling observable vendor behavior (Workday, Greenhouse, Lever, iCIMS, Taleo, Generic ATS).
4. **Lack of Parsing Simulation**: The system extracts text, but does not simulate what an ATS parser extracts into structured fields (ambiguous job titles, merged companies, broken dates, orphan bullets, confidence per field).
5. **Fixed vs. Role-Specific Scoring Profiles**: Scoring weights are globally hardcoded; engineering hiring rubrics differ significantly between Backend, Frontend, DevOps, ML, and QA roles.
6. **Absence of Open-Source Contribution Scoring**: Personal repository ownership is currently not separated from external open-source contributions (external PRs, merged commits, peer code reviews, maintainer status).
7. **Absence of Recruiter Search Simulation**: No dedicated recruiter search query simulator (Boolean AND/OR, exact keyword matching, alias resolution, phrase queries).
8. **Lack of Independent Candidate Quality Rubric**: Candidate strength is only assessed relative to a specific job description, without an orthogonal candidate-quality index.
9. **Lack of Standard Evaluation Benchmark**: Evaluation lacks a benchmark suite measuring precision, recall, F1, calibration error, and rank stability across labeled candidate/job pairs.

---

## 2. Inventory of Existing Architecture & Services

### 2.1 Services & Extraction Engines

| Service | File Path | Core Responsibility | Reusability Status |
| :--- | :--- | :--- | :--- |
| **`AtsFitScoreService`** | `src/services/ats-fit-score.service.js` | 7-component job fit calculator with critical gap score caps. | **REUSE & EXTEND**: Keep as core job-fit engine; extract scoring policy into canonical policy module. |
| **`AtsParseabilityService`** | `src/services/resume-ats-parseability.service.js` | 11 structural checks on compiled PDF/LaTeX/Text. | **REUSE & EXTEND**: Base engine for `ATS_PARSEABILITY_SCORE` and vendor compatibility profiles. |
| **`ResumeParserService`** | `src/services/resume-parser.service.js` | PDF (CMap inflate, text matrix decoding), DOCX, and TXT parsing; secret scrubbing. | **REUSE & EXTEND**: Core document extraction layer in canonical parsing pipeline. |
| **`ResumePdfObserver`** | `src/services/resume-pdf-observer.service.js` | Low-level PDF stream, font, and text run extraction. | **REUSE**: Low-level stream observer for PDF geometry and text runs. |
| **`PdfQaValidatorService`** | `src/services/pdf-qa-validator.service.js` | PDF QA validation (margins, selectable text, placeholder detection). | **REUSE**: Used in document generation QA gates. |
| **`PdfGeometryAnalyzerService`** | `src/services/pdf-geometry-analyzer.service.js` | Vertical layout, clipping, and page budget analysis. | **REUSE**: Geometry and clipping checks. |
| **`ResumeKeywordCoverageService`**| `src/services/resume-keyword-coverage.service.js` | Exact, taxonomy, and related keyword matches; placement tracking; keyword stuffing detection. | **REUSE & EXTEND**: Expose `KEYWORD_COVERAGE_SCORE` and recruiter search query simulation. |
| **`ResumeQualityAssessmentService`**| `src/services/resume-quality-assessment.service.js` | Composite parseability, job match, and evidence-backed coverage. | **EXTEND**: Integrate with multi-dimensional scoring architecture. |
| **`ResumeQualityScoreService`** | `src/services/resume-quality-score.service.js` | Content quality across specificity, accomplishments, density, and penalties. | **REUSE & EXTEND**: Expose `CONTENT_QUALITY_SCORE`. |
| **`EvidenceMatchingService`** | `src/services/evidence-matching.service.js` | Requirement decomposition and candidate skill/evidence matching. | **REUSE & EXTEND**: Expand requirement semantics (gated requirements, Boolean AND/OR). |
| **`ProjectRelevanceService`** | `src/services/project-relevance.service.js` | 10-dimension architectural density and requirement coverage for repositories. | **REUSE & EXTEND**: Deepen project quality classification (Tutorial vs CRUD vs Production-grade). |
| **`GitHubEvidenceExtractorService`**| `src/extractors/github/github-evidence-extractor.js` | Multi-language manifest parsing and entrypoint import scanning. | **REUSE & EXTEND**: Add open-source external contribution signals. |
| **`SkillTaxonomyEngine`** | `src/domain/career/skill-taxonomy.js` | Canonical taxonomy graph, aliases, and relationship types (`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`). | **REUSE**: Source of truth for skill normalization. |
| **`ApplicationReadinessService`**| `src/services/application-readiness.service.js` | Readiness items across contact, screening, work authorization, documents. | **REUSE & EXTEND**: Expose `APPLICATION_READINESS_SCORE` with safety gates. |
| **`ZeroHallucinationIntegrityService`**| `src/services/zero-hallucination-integrity.service.js`| Prevents unverified bullet generation. | **PRESERVE**: Integrity safeguard. |
| **`ResumeContentOptimizerService`**| `src/services/resume-content-optimizer.service.js` | Iterative layout and density optimization. | **EXTEND**: Connect to optimization loop with re-parsing & quality verification. |

### 2.2 Domain Schemas & Contracts

| Schema File | Core Schemas | Upgrade Plan |
| :--- | :--- | :--- |
| `src/domain/career/ats-fit-score.schemas.js` | `FitScoreBandEnum`, `FitScoreBreakdownSchema`, `CandidateJobFitAnalysisSchema` | Extend to support multi-dimensional scores, version tags, and explainable trace. |
| `src/domain/career/scoring-policy.js` | `ScoringWeightsSchema`, `ScoringPolicySchema`, `SCORING_POLICIES` | Expand into canonical scoring policy defining matching factors, UNKNOWN behavior, caps, and role profiles. |
| `src/domain/career/job-requirement.schemas.js` | `RequirementCategoryEnum`, `RequirementImportanceEnum`, `JobRequirementSchema` | Add requirement semantics (`CONDITIONAL`, `LOCATION_GATED`, `AUTHORIZATION_GATED`, Boolean groups). |
| `src/domain/career/resume.schemas.js` | `StructuredResumeSchema`, `ProfessionalSummarySchema`, `ResumeExperienceEntrySchema` | Establish as canonical parsed candidate profile target. |
| `src/domain/career/resume-keyword-coverage.schemas.js` | `ResumeKeywordCoverageReportSchema`, `KeywordPlacementSchema` | Add recruiter search simulation schemas. |

### 2.3 Database Tables

| Table | Relevant Columns | Usage |
| :--- | :--- | :--- |
| `resumes` | `parsedContent`, `metadata`, `contentHash`, `lifecycleState` | Source document artifact and parsed representation. |
| `resumeSections` | `sectionType`, `rawText`, `extractedEntities` | Parsed resume sections. |
| `jobAnalysisSnapshots` | `overallFit`, `matchAnalysis`, `projectRankings`, `metadata` | Persists derived analysis snapshots with version metadata. |
| `candidateClaims` | `claimType`, `statement`, `corroboratingEvidenceId` | Candidate self-claims. |
| `evidenceItems` | `evidenceType`, `sourceProvider`, `confidenceScore` | Verified code and repository evidence. |

---

## 3. Discovered Discrepancies & Architecture Risks

### 3.1 `UNKNOWN` Requirement Handling Discrepancy
* **Architecture Spec (`docs/ats-fit-score-architecture.md`)**:
  - $V_{\text{match}}(r) = 1.00$ for `UNKNOWN` (Excluded from penalty denominator).
  - Education unstated in profile: awarded 5.0 baseline points.
  - Location unstated: awarded 5.0 baseline points.
* **Implementation (`src/services/ats-fit-score.service.js`)**:
  - `match.matchStatus === 'UNKNOWN'` assigned `valueFactor = 0.0`.
  - In denominator audit, `UNKNOWN` earns 0.0 points under Rule 23 ("insufficient evidence earns 0.0").
* **Resolution Required (Phase 1)**:
  - Formally define the canonical scoring policy in `src/domain/career/scoring-policy.js`.
  - Distinguish between **neutral non-penalization** (excluding missing unstated criteria from denominator when the job does not require them) vs **hard absence** of required skills.
  - Document explicit invariant tests proving mathematical bounds, raw score composition, and capping behavior.

### 3.2 Single Score Conflation Risk
* Calling applications and MCP clients frequently request "ATS Score" and receive either `atsFitScore` (which is actually Candidate-Job Fit) or `atsParseabilityScore` (which is layout extractability).
* Conflating formatting extractability with qualification fit leads candidates to believe that fixing a margin will make them qualified for a Staff Kubernetes role when they do not know Go or Kubernetes.
* **Resolution Required (Phase 2)**:
  Expose 8 distinct, bounded dimensions:
  1. `ATS_PARSEABILITY_SCORE` (Document structure & extractability)
  2. `ATS_EXTRACTION_SCORE` (Field extraction completeness & accuracy)
  3. `KEYWORD_COVERAGE_SCORE` (Exact & semantic keyword representation)
  4. `CONTENT_QUALITY_SCORE` (Information density, specificity, impact)
  5. `JOB_FIT_SCORE` (Candidate qualifications vs job requirements)
  6. `EVIDENCE_CONFIDENCE_SCORE` (Cryptographic verification depth)
  7. `CANDIDATE_QUALITY_SCORE` (Role-independent engineering excellence)
  8. `APPLICATION_READINESS_SCORE` (End-to-end readiness with safety gates)

---

## 4. Proposed Implementation Mapping

```
Existing Services                     Target Upgrade Layer
─────────────────────────────────────────────────────────────────────────────
AtsParseabilityService           ───> Phase 2: ATS_PARSEABILITY_SCORE
                                      Phase 4: ATS Compatibility Profiles (Workday, etc.)
ResumeParserService              ───> Phase 3: Canonical ATS Parser Layer
                                      Phase 5: ATS Extraction Simulation
ResumeKeywordCoverageService     ───> Phase 2: KEYWORD_COVERAGE_SCORE
                                      Phase 11: Recruiter Search Simulation
ResumeQualityScoreService        ───> Phase 2: CONTENT_QUALITY_SCORE
AtsFitScoreService               ───> Phase 1: Canonical Scoring Policy Correctness
                                      Phase 2: JOB_FIT_SCORE
                                      Phase 6: Role-Specific Scoring Profiles
                                      Phase 10: Requirement Semantics
                                      Phase 15: Score Explainability
GitHubEvidenceExtractorService   ───> Phase 7: Open-Source Contribution Intelligence
ProjectRelevanceService          ───> Phase 8: Project Quality Engine
CandidateProfile / Experience    ───> Phase 9: Production Experience Intelligence
New Rubric Engine                ───> Phase 12: CANDIDATE_QUALITY_SCORE
New Policy Engine                ───> Phase 13: Bonus / Deduction Engine
EvidenceMatchingService          ───> Phase 14: Evidence-First Scoring
ApplicationReadinessService      ───> Phase 16: APPLICATION_READINESS_SCORE
New Benchmark Suite              ───> Phase 17: Benchmark / Calibration Framework
Unit / Invariant Battery         ───> Phase 18 & 19: Stability & Regression Testing
MCP Tools Wrapper                ───> Phase 20: MCP / API Contracts
Drizzle Persistence              ───> Phase 21 & 22: Persistence & Versioning
Web Views                        ───> Phase 23: UI / Reporting
ResumeContentOptimizerService    ───> Phase 24: Resume Optimization Loop
Security & Verification          ───> Phase 25-27: Final Validation & Report
```

---

## 5. Architectural Rules for Implementation

1. **Zero Duplicate Scoring Engines**: Do not create a second fit calculator. Extend `AtsFitScoreService` and `scoring-policy.js`.
2. **Deterministic Computations Only**: Never permit LLM prompts to output numeric scores. Scores must be mathematically derived by deterministic functions.
3. **No Fabrication**: Unverified claims must receive 0 evidence confidence and must never pass as verified code evidence.
4. **Preserve Backward Compatibility**: Existing method signatures must remain functional, providing defaults for newly introduced optional configuration parameters.

---
*Audit Completed. Ready for Phase 1 Execution.*

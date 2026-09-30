# Current Main Branch Gap Analysis: Industrial-Grade ATS Intelligence Upgrade

**Repository:** `vishu1803/Ai-job-mcp`  
**Base Branch:** `main` (authoritative source of truth)  
**Date:** 2026-09-30  
**Status:** REQUIRED FIRST DELIVERABLE COMPLETED

---

## 1. Executive Architecture Baseline & Guardrails

Before implementing changes, this gap analysis audits the current `main` branch to map requested capabilities against verified existing implementations.

### Non-Negotiable Architectural Rules
1. **The Existing Deterministic Scoring Architecture is Authoritative:**
   $$\text{CandidateMatchAnalysis} \longrightarrow \text{ProjectRelevanceAnalysis} \longrightarrow \text{AtsFitScoreService} \longrightarrow \text{scoring-policy.js}$$
   We will **NOT** replace this engine with a parallel scoring engine (e.g., no `new-ats-score.service.js`, `advanced-ats-score.service.js`, or `industry-ats-score.service.js`). Domain extensions and adapters wrap around the existing authoritative scoring engine.
2. **Reuse Existing Foundation Services:**
   - Text & PDF extraction: `ResumeParserService` (`src/services/resume-parser.service.js`)
   - Document Parseability: `AtsParseabilityService` (`src/services/resume-ats-parseability.service.js`)
   - Geometry & Layout: `PdfGeometryAnalyzerService` (`src/services/pdf-geometry-analyzer.service.js`)
   - Visual & Stream QA: `PdfQaValidatorService` (`src/services/pdf-qa-validator.service.js`)
   - Verification Firewall: `ResumeIntegrityAuditService` (`src/services/resume-integrity-audit.service.js`)
   - Statistical Calibration: `src/domain/career/score-calibration-benchmark.js` & `src/domain/career/calibration/`
3. **No Hallucinations, Multi-Tenant Sovereign Default-Deny, and Evidence Provenance:**
   All candidate claims must remain tied to verified evidence or explicit `CLAIMED` status.

---

## 2. Capability Mapping & Gap Classification Table

Every capability requested is classified strictly as one of:
- `ALREADY COMPLETE`
- `PARTIALLY IMPLEMENTED`
- `MISSING`
- `NEEDS REFACTOR`
- `NEEDS INTEGRATION`

| Capability | Current Main | Status | Existing Implementation | Required Change |
| :--- | :--- | :--- | :--- | :--- |
| **Resume parsing** | Magic-byte checking (PDF, DOCX, TXT), secret scrubbing, CMap font decoding, and canonical section splitting (`splitIntoSections`) | **ALREADY COMPLETE** | `src/services/resume-parser.service.js`<br>`src/utils/pdf-text-normalization.js` | None for parsing logic. Re-use `ResumeParserService` directly; do NOT duplicate PDF parsing. |
| **ATS extraction** | 4-stage ingestion pipeline extracting profile entities into `CanonicalCandidateProfile` | **PARTIALLY IMPLEMENTED** | `src/services/canonical-ats-parser.service.js`<br>`src/domain/career/canonical-candidate-profile.schemas.js` | Wrap parsed fields into canonical `AtsExtractionModel` contract where **every** extracted field contains `{ value, confidence, source: { page, section, textRange } }` for identity, contact, location, authorization, summary, skills, employment, job titles, employers, dates, tenure, education, certifications, projects, links (GitHub, LinkedIn, portfolio), and achievements. |
| **ATS profiles** | 6 vendor profiles (`GENERIC_ATS`, `WORKDAY`, `GREENHOUSE`, `LEVER`, `ICIMS`, `TALEO`) simulating observable parsing constraints | **NEEDS INTEGRATION** | `src/services/ats-compatibility-profiles.service.js`<br>`src/domain/career/ats-compatibility-profiles.schemas.js` | Standardize output contract to `{ profile, score, fieldExtraction, risks, warnings }`. Directly integrate with `PdfGeometryAnalyzerService`, `PdfQaValidatorService`, and `ResumeIntegrityAuditService`. |
| **Job fit** | Authoritative 100-point deterministic candidate-job fit scoring with mathematical invariants ($\sum w_i = 100.0$) and hard safety caps | **ALREADY COMPLETE** | `src/services/ats-fit-score.service.js`<br>`src/domain/career/scoring-policy.js`<br>`src/domain/career/ats-fit-score.schemas.js` | Retain `AtsFitScoreService` as authoritative calculation engine. Add optional `roleProfile` / `weights` configuration injection through `scoring-policy.js` without altering invariants. |
| **Role scoring** | 10 canonical profiles (`software_engineer`, `frontend_engineer`, `backend_engineer`, `fullstack_engineer`, `mobile_engineer`, `data_engineer`, `ml_engineer`, `devops_engineer`, `qa_engineer`, `embedded_engineer`) | **NEEDS INTEGRATION** | `src/domain/career/role-scoring-profiles.js` | Expose role-profile policy layer directly into `AtsFitScoreService.calculateCandidateJobFit(..., { roleProfile })` and multi-dimensional analysis, configuring weights without duplicating the underlying calculator. |
| **Open source** | GitHub activity scoring differentiating external PRs from solo repos; caps solo repos at $\le 30.0$ | **NEEDS REFACTOR** | `src/services/open-source-intelligence.service.js`<br>`src/domain/career/open-source-intelligence.schemas.js` | Formally export `OpenSourceContributionAnalysis`. Enforce exact 5 classification roles: `PERSONAL_PROJECT`, `EXTERNAL_CONTRIBUTION`, `MAINTAINER`, `ORGANIZATION_CONTRIBUTOR`, `REVIEWER`. Evaluate verifiable merged PRs, meaningful PRs, issues, reviews, contributor longevity, repository relevance, and maintenance activity without vanity star scoring. |
| **Candidate quality** | 10-dimension rubric evaluating candidate excellence independent of target job | **NEEDS INTEGRATION** | `src/services/candidate-quality-rubric.service.js`<br>`src/domain/career/candidate-quality-rubric.schemas.js` | Formally export `CandidateQualityAnalysis` answering *"How strong is this candidate independent of this specific job?"*, incorporating technical depth, production experience, project depth, open source, ownership, leadership, problem solving, and technical communication. Keep strictly decoupled from `CandidateJobFit`. |
| **Recruiter search** | Boolean search simulator supporting AND, OR, phrase matching, exact keywords, taxonomy aliases, and anti-gaming | **ALREADY COMPLETE** | `src/services/recruiter-search-simulation.service.js` | Retain verified implementation (`RELATED != EXACT` invariant enforced). Ensure continuous integration with MCP tool layer. |
| **Requirement semantics** | Extended requirement importance enums and requirement groups (`AND`, `OR`, `EQUIVALENT`) | **NEEDS INTEGRATION** | `src/domain/career/requirement-semantics.schemas.js`<br>`src/services/requirement-semantics.service.js` | Add `OPTIONAL` group operator alongside `AND`, `OR`, `EQUIVALENT`. Integrate semantic requirement evaluation into requirement match analysis pipeline. |
| **Application readiness** | 8 independent dimensions evaluated without score collapse; blends Parseability, Fit, and Quality with safety caps | **ALREADY COMPLETE** | `src/services/ats-multi-dimensional-intelligence.service.js`<br>`src/services/application-readiness-score.service.js` | Preserve separate metrics (`ATS Parseability`, `ATS Extraction Quality`, `Keyword Coverage`, `Resume Content Quality`, `Job Fit`, `Evidence Confidence`, `Candidate Quality`, `Application Readiness`). |
| **Calibration** | Statistical calibration engine (`Spearman rho`, `Pearson r`, `MAE`, `RMSE`) and benchmark harness (`Precision`, `Recall`, `F1`, `NDCG`) | **NEEDS INTEGRATION** | `src/domain/career/score-calibration-benchmark.js`<br>`evaluation/benchmark/ats-benchmark-runner.js`<br>`evaluation/benchmark/metrics.js` | Connect `AtsBenchmarkRunner` directly with `score-calibration-benchmark.js` to compute calibration error, rank correlation, score distribution, and stability without duplicating calibration code. |
| **Versioning** | Dispersed schema & parser version constants across separate domain modules | **NEEDS INTEGRATION** | `src/domain/career/scoring-policy.js`<br>`src/domain/career/canonical-candidate-profile.schemas.js`<br>`src/domain/career/ats-compatibility-profiles.schemas.js` | Unify and export reproducible analysis metadata containing: `parserVersion`, `taxonomyVersion`, `scoringPolicyVersion`, `roleProfileVersion`, `evidencePolicyVersion`, and `atsProfileVersion`. |

---

## 3. Priority-by-Priority Technical Plan

### Priority 1: ATS Extraction Model
- Construct `AtsExtractionModel` wrapping parsed entities from `ResumeParserService` and `CanonicalAtsParserService`.
- Envelope every extracted attribute:
  ```json
  {
    "value": "...",
    "confidence": 0.97,
    "source": {
      "page": 1,
      "section": "experience",
      "textRange": "lines 14-22"
    }
  }
  ```
- Support: identity, contact, location, authorization, summary, skills, employment, job titles, employers, dates, tenure, education, certifications, projects, links (GitHub, LinkedIn, portfolio), achievements.

### Priority 2: ATS Compatibility Profiles
- Align profile output schema to `{ profile, score, fieldExtraction, risks, warnings }`.
- Profile IDs: `GENERIC`, `WORKDAY_COMPATIBILITY`, `GREENHOUSE_COMPATIBILITY`, `LEVER_COMPATIBILITY`, `ICIMS_COMPATIBILITY`, `TALEO_COMPATIBILITY`.
- Connect `PdfGeometryAnalyzerService`, `PdfQaValidatorService`, and `ResumeIntegrityAuditService`.

### Priority 3: Role-Specific Scoring Profiles
- Keep `scoring-policy.js` authoritative.
- Expose role profile weighting through `AtsFitScoreService.calculateCandidateJobFit(..., { roleProfile, weights })`.
- Ensure role weights dynamically scale component points while maintaining strictly $\sum w_i = 100.0$.

### Priority 4: Open-Source Contribution Intelligence
- Formally export `OpenSourceContributionAnalysis`.
- Differentiate exact roles: `PERSONAL_PROJECT`, `EXTERNAL_CONTRIBUTION`, `MAINTAINER`, `ORGANIZATION_CONTRIBUTOR`, `REVIEWER`.
- Discard vanity star metrics; measure verified merged PRs, meaningful PRs, contributor longevity, and maintenance activity.

### Priority 5: Candidate Quality Analysis
- Formally export `CandidateQualityAnalysis` independent of target job descriptions.
- Evaluate technical depth, production experience, project depth, open source, ownership, leadership, problem solving, and technical communication.

### Priority 6: Requirement Semantics
- Ensure `ExtendedRequirementImportanceEnum` and `RequirementGroupSchema` support `AND`, `OR`, `OPTIONAL`, `EQUIVALENT`.
- Guarantee `React AND JavaScript` $\neq$ `React OR Vue`.

### Priority 7: Recruiter Search Simulation
- Confirm Boolean search and exact vs alias matching remain active and tested.

### Priority 8: Multi-Dimensional Application Readiness
- Confirm 8 distinct dimensions remain exposed and uncollapsed.

### Priority 9: Benchmarking & Calibration Integration
- Wire `evaluation/benchmark/ats-benchmark-runner.js` directly to `src/domain/career/score-calibration-benchmark.js`.
- Compute Spearman rho, Pearson r, MAE, RMSE, NDCG, and verify zero score variance across runs.

### Priority 10: Versioned Reproducibility
- Add metadata block with `parserVersion`, `taxonomyVersion`, `scoringPolicyVersion`, `roleProfileVersion`, `evidencePolicyVersion`, `atsProfileVersion` across analyses.

### Priority 11: Optimization Loop Pipeline
- Complete multi-stage verification flow: Parse $\to$ ATS Extraction $\to$ Analyze $\to$ Generate Improvements $\to$ Claim/Evidence Validation $\to$ Render $\to$ Re-parse $\to$ ATS Compatibility $\to$ Keyword Check $\to$ Job Fit Check $\to$ Quality Check $\to$ Accept/Reject.

### Priority 12: Regression Testing
- Verify all existing unit tests (92/92) continue passing.
- Add focused unit and adversarial test suites for new contracts.

# ARCH-017: Career Artifact Adaptation Architecture

**Document ID**: `ARCH-017`  
**Related ADR**: `ADR-037` (`docs/decisions.md`)  
**Status**: `APPROVED`  
**Phase**: Phase 6 (P6-001A)  
**Author**: Antigravity Core Architecture Team  
**Date**: 2026-08-22  

---

## 1. Executive Summary & Objective

The **Career Artifact Adaptation Engine** is the provider-neutral document synthesis layer of the Antigravity Career Platform. It transforms structured candidate profiles, verified cryptographic evidence graphs, requirement match analyses, project relevance rankings, and ATS fit scores into tailored, job-specific career artifacts:

1. **`TailoredResume`**: Job-aligned resumes structured into summary, skills, work experience, highlighted projects, and education.
2. **`TailoredCoverLetter`**: Persuasive, role-specific cover letters connecting candidate accomplishments directly to employer challenges.
3. **`TailoredPortfolioContent`**: Dynamic portfolio showcases highlighting verified codebases, architecture diagrams, and commit-pinned proof nodes.

```
+---------------------------------------------------------------------------------------------------+
|                            CAREER ARTIFACT ADAPTATION PIPELINE                                    |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  |                                  1. STRUCTURED INPUTS                                       |  |
|  |  • CandidateProfile (Phase 4 / ARCH-010)                                                    |  |
|  |  • JobDescription & JobRequirements (P5-001 / ARCH-011)                                     |  |
|  |  • CandidateMatchAnalysis (P5-003 / ARCH-013)                                                  |  |
|  |  • ProjectRelevanceAnalysis (P5-004 / ARCH-014)                                                |  |
|  |  • ATS Fit Score Analysis (P5-005 / ARCH-015)                                                 |  |
|  |  • IntegrityCheckedAssertions (P5-006 / ARCH-016)                                             |  |
|  +----------------------------------------------+----------------------------------------------+  |
|                                                 |                                                 |
|                                                 v                                                 |
|  +---------------------------------------------------------------------------------------------+  |
|  |                       2. CONTENT SELECTION & ATS ALIGNMENT ENGINE                           |  |
|  |  - Deterministic Content Prioritization (Verified Required > Projects > Preferred > Inferred)  |  |
|  |  - Canonical Synonym Keyword Alignment (e.g. Postgres -> PostgreSQL via SkillTaxonomyEngine) |  |
|  |  - Metric & Corporate Tenure Guardrails (Zero Conflation of Commits with Work History)      |  |
|  |  - Claim Sovereignty: [Unverified User Claim] Tag Preservation                             |  |
|  +----------------------------------------------+----------------------------------------------+  |
|                                                 |                                                 |
|                                                 v                                                 |
|  +---------------------------------------------------------------------------------------------+  |
|  |                           3. LINGUISTIC TRANSFORMATION SANDBOX                              |  |
|  |  - System Prompt Isolation: Strict JSON Output (Linguistic styling & tone adjustment only)   |  |
|  |  - Strict Non-Invention Constraint: LLM cannot invent skills, metrics, employers, or SHAs    |  |
|  +----------------------------------------------+----------------------------------------------+  |
|                                                 |                                                 |
|                                                 v                                                 |
|  +---------------------------------------------------------------------------------------------+  |
|  |                       4. POST-GENERATION INTEGRITY GATE (P5-006)                            |  |
|  |  - Statement Extraction & Zod Contract Validation                                          |  |
|  |  - ZeroHallucinationIntegrityService Verification: Re-audits all cited EvidenceRefs         |  |
|  |  - PASS -> Release | PARTIAL -> Release with Labeled Claims | BLOCKED -> Halt Execution      |  |
|  +----------------------------------------------+----------------------------------------------+  |
|                                                 |                                                 |
|                                                 v                                                 |
|  +---------------------------------------------------------------------------------------------+  |
|  |                             5. ADAPTED CAREER ARTIFACTS                                     |  |
|  |       TailoredResume  |  TailoredCoverLetter  |  TailoredPortfolioContent                   |  |
|  |       (Provider-Neutral Structured Models Ready for Rendering & MCP Exposure)               |  |
|  +---------------------------------------------------------------------------------------------+  |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Absolute Truth Boundary & Grounding Invariant

The **Zero-Hallucination Integrity Gate** (`P5-006` / `ARCH-016`) is the absolute authority governing artifact adaptation:

1. **Assertion-Grounded Ingestion**: Adaptation engines **must strictly consume** pre-audited `IntegrityCheckedAssertion` objects. They are forbidden from ingesting unvetted candidate text, unparsed repository source code, or raw external inputs.
2. **Status Immutability**:
   * $\text{CLAIMED} \not\rightarrow \text{VERIFIED}$: Self-asserted manual claims must retain the explicit label `[Unverified User Claim]`.
   * $\text{INFERRED} \not\rightarrow \text{VERIFIED}$: Inferred skills (e.g. Next.js $\rightarrow$ React) must retain `[Inferred]` status.
   * $\text{MISSING\_EVIDENCE} \not\rightarrow \text{VERIFIED}$: Missing qualifications can never be transformed into affirmative claims.
   * $\text{UNKNOWN} \not\rightarrow \text{VERIFIED}$: Subjective or unstated criteria cannot be synthesized as verified facts.
3. **No Phantom Citations**: Every factual statement in a resume bullet, cover letter paragraph, or portfolio showcase must cite genuine, commit-pinned `EvidenceRef` items.

---

## 3. Tailored Resume Domain Model

The `TailoredResume` entity is a structured, provider-neutral representation of a job-tailored resume:

```
+---------------------------------------------------------------------------+
|                               TailoredResume                              |
+---------------------------------------------------------------------------+
| • resumeId: UUIDv4                                                        |
| • tenantId: UUIDv4                                                        |
| • candidateId: UUIDv4                                                     |
| • targetJobId: UUIDv4                                                     |
| • headline: String (e.g. "Senior Backend Engineer | Go & Distributed DBs")|
| • summary: ResumeSection<String> (Grounding in verified assertions)       |
| • skills: Array<ResumeSkillGroup> (Categorized & ATS-prioritized)         |
| • experience: Array<ResumeExperienceItem> (Work history from profile)     |
| • projects: Array<ResumeProjectItem> (Top-ranked relevant repositories)   |
| • education: Array<ResumeEducationItem> (Academic degree records)         |
| • certifications: Array<ResumeCertificationItem> (Verified credentials)   |
| • atsMatchScore: Float [0.0, 100.0] (Read-only from P5-005)               |
| • integrityStatus: PASS | PARTIAL                                         |
| • metadata: Object (Version, tokens, generation parameters)               |
| • generatedAt: ISO 8601 Timestamp                                         |
+---------------------------------------------------------------------------+
```

---

## 4. Resume Bullet Domain Model

Every bullet point in work experience or project highlights is represented by the atomic `ResumeBullet` contract:

```
+---------------------------------------------------------------------------+
|                                ResumeBullet                               |
+---------------------------------------------------------------------------+
| • id: UUIDv4                                                              |
| • section: 'SUMMARY' | 'EXPERIENCE' | 'PROJECT' | 'EDUCATION'             |
| • text: String (1..500 chars, active voice action statement)              |
| • assertionIds: Array<UUIDv4> (Underlying CareerAssertion references)     |
| • evidenceRefs: Array<EvidenceRef> (Max 5 commit-pinned proof nodes)      |
| • status: VERIFIED | INFERRED | CLAIMED                                   |
| • confidenceScore: Float [0.0, 1.0]                                       |
| • relevanceScore: Float [0.0, 100.0]                                      |
| • matchedKeywords: Array<String> (Target job keywords satisfied)          |
| • claimLabel: String (e.g. '[Unverified User Claim]' or null)             |
+---------------------------------------------------------------------------+
```

### Bullet Validation Rules
* If a bullet makes a factual technical claim without backing evidence $\rightarrow$ **Safely Downgraded to `[Unverified User Claim]` or OMITTED**.
* If a bullet includes an unverified quantitative metric $\rightarrow$ **BLOCKED**.

---

## 5. ATS Keyword Adaptation & Synonym Mapping

The adaptation engine aligns candidate phrasing with target job terminology using canonical taxonomy mappings from `SkillTaxonomyEngine` (`P5-002`):

1. **Grounding Constraint**: Synonym substitution is permitted **only** when the candidate demonstrates authentic evidence for the canonical taxonomy skill.
   * *Example*: If target job requires `"PostgreSQL"` and candidate evidence demonstrates `"postgres"` in `package.json` (`pg` driver), the canonical slug is `postgresql`. The resume bullet may use the exact term `"PostgreSQL"` for ATS matching.
2. **Anti-Spam / Anti-Inflation Guard**: The engine is **strictly prohibited from inserting keywords** for skills the candidate does not demonstrate. Keyword stuffing of missing requirements is impossible.

---

## 6. Resume Summary Generation

1. **Grounding**: Executive summaries are generated exclusively from:
   * Top-ranked verified technical skills (`VERIFIED`).
   * Primary project highlights (`ProjectRelevanceService` top projects).
   * Verified corporate tenure from candidate profile experience records.
2. **Forbidden Phrases**: The engine rejects unsubstantiated seniority or leadership hype (e.g. *"Visionary world-class executive"*) unless supported by explicit candidate profile records.

---

## 7. Professional Experience Adaptation

1. **Work History Authority**: Corporate work history records (`candidateProfile.experience`) are the **sole source of truth** for employment tenure, job titles, employer names, and employment dates.
2. **Zero Conflation Guard**: Repository commit history duration is technical skill evidence, **never corporate employment tenure**. The engine never fabricates employment entries from GitHub repository activity.

---

## 8. Project Adaptation

1. **Relevance-Driven Selection**: Projects are selected and ordered using `ProjectRelevanceService` (`P5-004`) ranking ($P_1, P_2, P_3$).
2. **Evidence-Grounded Bullets**: Project bullets highlight verified architectural signals (e.g. database persistence, authentication middleware, Docker containers, automated tests) directly observed in the codebase.
3. **No Functional Fabrication**: A project description may tailor wording to the job's domain, but cannot invent features not present in the repository AST or manifests.

---

## 9. Quantitative Metric Safety

Quantitative claims require concrete, verifiable evidence:
* **Forbidden Without Proof**: Metrics asserting business outcomes (e.g. *"Increased revenue by 40%"*, *"Scaled to 10M users"*, *"Reduced infrastructure costs by $500K"*) without explicit documentation in candidate records are **BLOCKED**.
* **Permitted With Code Proof**: Codebase-verifiable metrics (e.g. *"Maintained 100% automated test coverage across 45 test suites"*, *"Implemented microservice handling 12 concurrent worker pools"*) are permitted when backed by AST/test evidence.

---

## 10. Tailored Cover Letter Domain Model

```
+---------------------------------------------------------------------------+
|                            TailoredCoverLetter                            |
+---------------------------------------------------------------------------+
| • letterId: UUIDv4                                                        |
| • tenantId: UUIDv4                                                        |
| • candidateId: UUIDv4                                                     |
| • targetJobId: UUIDv4                                                     |
| • recipient: Object { hiringManager, companyName, address }               |
| • opening: CoverLetterParagraph (Role application & core thesis)          |
| • companyAlignment: CoverLetterParagraph (Connecting to company mission)  |
| • relevantExperience: CoverLetterParagraph (Grounded corporate tenure)   |
| • projectEvidence: CoverLetterParagraph (Verified repository highlights)  |
| • motivation: CoverLetterParagraph (Domain & technical synergy)           |
| • closing: CoverLetterParagraph (Call to action & professional sign-off)  |
| • integrityStatus: PASS | PARTIAL                                         |
| • generatedAt: ISO 8601 Timestamp                                         |
+---------------------------------------------------------------------------+
```

### Cover Letter Claims Rule
* Every factual claim in `CoverLetterParagraph.text` links to valid `assertionIds` and `evidenceRefs`.
* User-asserted claims retain their `[Unverified User Claim]` status in metadata.

---

## 11. Tailored Portfolio Content Domain Model

```
+---------------------------------------------------------------------------+
|                          TailoredPortfolioContent                         |
+---------------------------------------------------------------------------+
| • portfolioId: UUIDv4                                                     |
| • tenantId: UUIDv4                                                        |
| • candidateId: UUIDv4                                                     |
| • targetJobId: UUIDv4                                                     |
| • hero: Object { headline, subheadline, callToAction }                    |
| • featuredSkills: Array<PortfolioSkillItem> (Top job-relevant skills)     |
| • featuredProjects: Array<PortfolioProjectItem> (Top 3 ranked projects)   |
| • evidenceHighlights: Array<PortfolioEvidenceItem> (Live code proof)      |
| • technologyStack: Array<PortfolioStackGroup> (Architecture categories)   |
| • integrityStatus: PASS | PARTIAL                                         |
| • generatedAt: ISO 8601 Timestamp                                         |
+---------------------------------------------------------------------------+
```

---

## 12. Content Prioritization Algorithm

When synthesizing resume, cover letter, or portfolio content, candidates often have dozens of skills and multiple repositories. The engine applies a deterministic selection hierarchy:

$$\text{PriorityRank} = \begin{cases}
1 & \text{VERIFIED Required Job Skills } (S_{\text{req}} \cap \text{Verified}) \\
2 & \text{VERIFIED High-Relevance Projects } (\text{Relevance} \ge 70.0) \\
3 & \text{VERIFIED Preferred Job Skills } (S_{\text{pref}} \cap \text{Verified}) \\
4 & \text{INFERRED Related Skills } (\text{Taxonomy Edge } \text{BUILT\_ON}) \\
5 & \text{CLAIMED Candidate Profile Assertions } (\text{Labeled Claims})
\end{cases}$$

Within each tier, items are stably sorted by `relevanceScore` descending, then `confidenceScore` descending, then `id` ascending.

---

## 13. LLM Sandbox & Prompt Architecture

When an external Large Language Model (e.g. Gemini 1.5 Pro) is invoked for phrasing enhancement:

```
+---------------------------------------------------------------------------------------------------+
|                                 LLM GENERATION TRUST BOUNDARY                                     |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  1. INPUT ENCAPSULATION                                                                           |
|     - System Prompt: "You are a professional career document phrasing engine. You receive         |
|       pre-verified candidate assertions and target job requirements. You must output strict JSON. |
|       You are strictly forbidden from adding technologies, metrics, dates, or employers not       |
|       explicitly present in the input assertions."                                                |
|     - Prompt Injection Neutralization: Untrusted text (job descriptions, candidate bios) is       |
|       wrapped in immutable passive XML tags (<job_input>, <candidate_facts>).                     |
|                                                                                                   |
|  2. OUTPUT CONTRACT                                                                               |
|     - Strict Zod Schema validation on JSON response.                                              |
|                                                                                                   |
|  3. POST-GENERATION INTEGRITY CHECK                                                               |
|     - Every generated bullet/paragraph is parsed into atomic statements.                          |
|     - Evaluated via ZeroHallucinationIntegrityService.validateCareerAssertions.                   |
|     - If LLM hallucinates an unsupported skill or metric:                                         |
|       -> Statement is DOWNGRADED or BLOCKED. Document cannot be released without PASS token.      |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

---

## 14. Post-Generation Integrity Validation

Generation is **never trusted merely because input assertions were verified**. The post-generation pipeline executes:

1. **Extraction**: Generated prose is parsed into atomic technical claims.
2. **Citation Verification**: Every cited `EvidenceId` is validated against the active evidence index.
3. **Cross-Tenant Guard**: Assertions and evidence references are verified against `context.tenantId`.
4. **Outcome Assignment**:
   * `PASS`: $100\%$ of statements backed by authentic evidence.
   * `PARTIAL`: Contains valid evidence alongside labeled `[Unverified User Claim]` items.
   * `BLOCKED`: Contains fabricated citations or unbacked claims. Generation fails closed.

---

## 15. Unsupported Content Protocol

| Content Type | Scenario | Action | Rationale |
| :--- | :--- | :---: | :--- |
| **Unsupported Metric** | Generated text claims "improved performance by 80%" with 0 benchmark proof. | **BLOCK** | Prevents fraudulent quantitative claims on resumes. |
| **Unsupported Technical Skill** | Candidate does not demonstrate required skill in repositories or claims. | **OMIT** | Prevents false-positive ATS keyword spam. |
| **Unverified Profile Claim** | Candidate self-asserts skill in profile bio without code evidence. | **LABEL** | Transparently includes claim with `[Unverified User Claim]`. |
| **Inferred Skill** | Candidate demonstrates Next.js, job requires React. | **INFER** | Includes as inferred with `[Inferred from Next.js]` note. |

---

## 16. Document Representation & Rendering Decoupling

The core adaptation engine produces **pure structured domain models** (`TailoredResume`, `TailoredCoverLetter`, `TailoredPortfolioContent`). 

* **No Premature PDF/DOCX Coupling**: Formatting, PDF generation, DOCX compilation, and HTML rendering are decoupled downstream presentation adapters (`src/rendering/` or client-side UI).
* **Deterministic Serialization**: Domain models serialize to clean, structured JSON ready for MCP tool consumption (`get_tailored_resume`, `get_tailored_cover_letter`).

---

## 17. Privacy, Security & Secret Sanitization

* **Zero Secret Propagation**: Code excerpts embedded in resume evidence citations have already passed `SecretScrubber` during extraction. The adaptation engine verifies that no API tokens, JWTs, private keys, or passwords appear in bullet text.
* **PII Minimization**: Contact information is restricted to canonical display name and email. Sensitive system metadata (database IDs, password hashes) is never included in generated output.

---

## 18. Versioning & Provenance Tracking

Every generated artifact carries complete provenance metadata:
* `resumeId` (`UUIDv4`): Unique artifact instance identifier.
* `candidateId` / `targetJobId`: Core relational bindings.
* `sourceCandidateVersion`: Timestamp of candidate profile at generation.
* `sourceJobVersion`: Timestamp of job description at generation.
* `generatorVersion`: Engine release version (e.g. `v1.0.0`).
* `assertionSetId`: Cryptographic hash of underlying assertion set.

---

## 19. Persistence Strategy

* **Phase 6 Scope**: In Phase 6, artifact adaptation operates as a **stateless on-demand synthesis service** (`ResumeAdaptationService`, `CoverLetterAdaptationService`, `PortfolioAdaptationService`).
* **Zero Premature DB Migrations**: Persistent resume registries and storage tables (`adapted_resumes`, `cover_letters`) will be introduced in Phase 12 (Job / Application Tracking) when user saved applications are implemented.

---

## 20. Multi-Tenant Default-Deny Isolation

* `context.tenantId` is strictly asserted across all operations.
* Candidate profile, target job description, requirement matches, project relevance scores, and evidence items must all belong to `context.tenantId`.
* Any cross-tenant access immediately fails closed with `404 NotFoundError`.

---

## 21. Comprehensive Testing Strategy (P6-001 through P6-005)

In Phase 6, the implementation will be verified against the following test suites:

1. **Evidence-Backed Resume Generation**: Verifies tailored resume generation with authentic, commit-pinned evidence references.
2. **ATS Keyword Alignment**: Asserts canonical synonym substitution (e.g. Postgres $\rightarrow$ PostgreSQL) when backed by evidence.
3. **Unsupported Skill Omission**: Asserts that ungrounded skills are omitted from the resume.
4. **Unsupported Metric Blocking**: Asserts that unbacked quantitative metric claims trigger `BLOCKED` status.
5. **Corporate Work History Guard**: Asserts that work experience bullets derive exclusively from explicit candidate experience records.
6. **Project Highlight Prioritization**: Asserts that projects are ordered by `ProjectRelevanceService` score.
7. **Cover Letter Evidence Grounding**: Asserts that cover letter paragraphs cite verified candidate achievements.
8. **Portfolio Showcase Grounding**: Asserts that portfolio highlights link to real repository codebases.
9. **Prompt Injection Hardening**: Asserts that malicious prompt injection payloads in job postings cannot generate false qualifications.
10. **LLM Citation Tampering Defense**: Asserts that hallucinated `EvidenceId` values are caught by post-generation integrity checks.
11. **Multi-Tenant Security Barrier**: Asserts that Tenant A cannot generate a resume for Candidate B or against Job B.
12. **Deterministic Serialization**: Asserts that identical inputs produce identical structured JSON domain models.
13. **Zero Database Mutation**: Verifies that on-demand adaptation causes zero database writes.

---

## 22. Open Decisions & Architectural Consensus

* **Decision 1: Separation of Adaptation from Rendering**:
  * *Consensus*: The engine outputs structured domain models; PDF/DOCX rendering is delegated to client/adapter layers.
* **Decision 2: On-Demand Stateless Synthesis**:
  * *Consensus*: In Phase 6, generation runs in-memory with sub-second latency; database persistence belongs to Phase 12.
* **Decision 3: Mandatory Post-Generation Integrity Gate**:
  * *Consensus*: All generated text must pass `ZeroHallucinationIntegrityService` before release to ensure complete provenance compliance.

---

## 23. Final Recommendation & Approval

The **Career Artifact Adaptation Architecture** establishes a rigorous, evidence-backed generation framework that guarantees complete zero-hallucination compliance, prevents metric fabrication, respects multi-tenant boundaries, and aligns candidate experience with target job requirements.

**Recommendation**: **APPROVE P6-001A**. Proceed to Phase 6 implementation upon user authorization.

# Cover Letter Drafting Engine Architecture

**Document Identifier**: `ARCH-018`  
**Related Decision Record**: `ADR-038` (`docs/decisions.md`)  
**Phase**: Phase 6 — Career Artifact Adaptation Engine (Task `P6-002A`)  
**Status**: APPROVED  
**Date**: 2026-08-22  
**Author**: DeepMind Advanced Agentic Coding Pair Programmer (Antigravity)  

---

## 1. Executive Summary & Objective

The **Cover Letter Drafting Engine** (`CoverLetterDraftingService`) is a provider-neutral, evidence-backed narrative generation service responsible for synthesizing persuasive, highly targeted cover letters (`TailoredCoverLetter`).

Unlike generic generative AI tools that hallucinate candidate achievements, invent company cultures, or exaggerate technical experience, the Cover Letter Drafting Engine operates on a **strict zero-hallucination truth boundary**. It weaves verified code evidence, authentic work history, and job match analysis into a cohesive professional narrative while preserving mathematical explainability, provenance traceability, and multi-tenant isolation.

```
+---------------------------------------------------------------------------------------------------+
|                           COVER LETTER DRAFTING PIPELINE ARCHITECTURE                             |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  1. STRUCTURED TRUSTED INPUTS                                                                     |
|     +------------------------------------------------------------------------------------------+  |
|     | • CandidateProfile (Explicit Work History, Education, Authored Identity)                 |  |
|     | • JobDescription (Parsed Title, Company, Explicit Requirements, Domain Scope)            |  |
|     | • CandidateMatchAnalysis (MATCHED, PARTIAL, MISSING, UNKNOWN classifications)            |  |
|     | • ProjectRelevanceAnalysis (Decaying top-3 ranked repositories & quality weights)         |  |
|     | • ATS Fit Score Analysis (Multi-factor score breakdown & critical gaps)                  |  |
|     | • IntegrityCheckedAssertions (Audited by P5-006 ZeroHallucinationIntegrityService)       |  |
|     +--------------------------------------------+---------------------------------------------+  |
|                                                  |                                                |
|                                                  v                                                |
|  2. DETERMINISTIC CONTENT SELECTION & PRIORITIZATION                                              |
|     +------------------------------------------------------------------------------------------+  |
|     | Priority 1: Verified Required Skills (100.0) -> Direct match for opening paragraph       |  |
|     | Priority 2: Verified High-Relevance Projects (>= 70.0) -> Pinned repository evidence     |  |
|     | Priority 3: Verified Preferred / Bonus Skills (75.0) -> Narrative differentiators        |  |
|     | Priority 4: Verified Corporate Experience -> Employment tenure, team roles, domain scope |  |
|     | Priority 5: Inferred Technical Capabilities -> Labeled taxonomy relationships            |  |
|     | Priority 6: Labeled User Claims -> Explicit [Unverified User Claim] preservation        |  |
|     | Metric Safety Guard: Quantitative claims without backing evidence -> BLOCKED             |  |
|     +--------------------------------------------+---------------------------------------------+  |
|                                                  |                                                |
|                                                  v                                                |
|  3. DETERMINISTIC DRAFT SYNTHESIS (Modular Monolith / Provider-Neutral)                          |
|     +------------------------------------------------------------------------------------------+  |
|     | • Opening: Role, Company, and Strongest Verified Alignment                               |  |
|     | • Company Alignment: Grounded strictly in explicit job text (Zero mission fabrication)   |  |
|     | • Relevant Experience: Derived strictly from candidate experience records (Zero Git tenure)|  |
|     | • Project Evidence: High-relevance repositories with commit-pinned evidence (Max 5 refs) |  |
|     | • Motivation: Grounded technical enthusiasm (Zero personal relationship fabrication)     |  |
|     | • Closing: Professional next steps (Zero visa/salary/interview fabrication)              |  |
|     +--------------------------------------------+---------------------------------------------+  |
|                                                  |                                                |
|                                                  v                                                |
|  4. OPTIONAL LLM LINGUISTIC SANDBOX (Passive XML Boundary)                                       |
|     +------------------------------------------------------------------------------------------+  |
|     | • Input: <job_input>, <candidate_facts>, <approved_assertions> (Instruction-Ignored)     |  |
|     | • Role: Polishes sentence flow, transitions, and tone (PROFESSIONAL / CONCISE / WARM)    |  |
|     | • Immutable Rule: LLM CANNOT add facts, skills, metrics, employers, or citations        |  |
|     +--------------------------------------------+---------------------------------------------+  |
|                                                  |                                                |
|                                                  v                                                |
|  5. MANDATORY POST-GENERATION INTEGRITY AUDIT (P5-006)                                           |
|     +------------------------------------------------------------------------------------------+  |
|     | • Verifies all paragraphs through ZeroHallucinationIntegrityService                       |  |
|     | • Validates EvidenceId existence, tenant ownership, candidate ownership, and SHA hashes  |  |
|     | • Unsupported metric -> BLOCKED | Unsupported skill -> OMIT | Unbacked claim -> BLOCKED|  |
|     +--------------------------------------------+---------------------------------------------+  |
|                                                  |                                                |
|                                                  v                                                |
|  6. CANONICAL TAILORED COVER LETTER ARTIFACT (TailoredCoverLetter)                                |
|     +------------------------------------------------------------------------------------------+  |
|     | In-memory structured domain model with complete provenance metadata & audit trail        |  |
|     +------------------------------------------------------------------------------------------+  |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Structured Domain Model: `TailoredCoverLetter`

The cover letter engine produces structured domain models validated by Zod schemas (`src/domain/career/cover-letter.schemas.js`).

### A. Paragraph Types (`CoverLetterParagraphTypeEnum`)
1. **`OPENING`**: Introduces candidate identity, target role, target company, and immediate core value proposition grounded in verified required skills.
2. **`COMPANY_ALIGNMENT`**: Bridges the candidate's technical profile to the company's explicit industry domain and technical scope as stated in the job posting.
3. **`RELEVANT_EXPERIENCE`**: Highlights professional corporate tenure, career leadership, and architectural responsibilities sourced strictly from candidate profile work history.
4. **`PROJECT_EVIDENCE`**: Highlights top-scoring repository codebases with authentic, commit-pinned technical achievements and architectural details.
5. **`MOTIVATION`**: Articulates technical resonance and enthusiasm grounded in the overlap between candidate strengths and target challenges.
6. **`CLOSING`**: Professional concluding statement requesting an interview discussion, adhering strictly to neutral professional standards.

### B. Tone Presets (`CoverLetterToneEnum`)
* **`PROFESSIONAL`** *(default)*: Balanced, structured, formal, and authoritative.
* **`CONCISE`**: Streamlined, high-density, bullet-friendly narrative for fast hiring-manager scannability.
* **`CONFIDENT`**: Direct, strong active voice highlighting measurable engineering capabilities.
* **`WARM`**: Collaborative, team-oriented, communicative tone suitable for startup and community cultures.

### C. Canonical Paragraph Schema (`CoverLetterParagraphSchema`)
```typescript
{
  id: string (UUIDv4),
  paragraphType: 'OPENING' | 'COMPANY_ALIGNMENT' | 'RELEVANT_EXPERIENCE' | 'PROJECT_EVIDENCE' | 'MOTIVATION' | 'CLOSING',
  text: string (min: 1, max: 2000 chars),
  assertionIds: string[] (UUIDv4),
  evidenceRefs: EvidenceRef[] (max: 5),
  status: 'VERIFIED' | 'INFERRED' | 'CLAIMED',
  confidenceScore: number (0.0 - 1.0),
  relevanceScore: number (0.0 - 100.0),
  matchedKeywords: string[],
  claimLabel: string | null
}
```

### D. Canonical Root Schema (`TailoredCoverLetterSchema`)
```typescript
{
  letterId: string (UUIDv4),
  tenantId: string (UUIDv4),
  candidateId: string (UUIDv4),
  targetJobId: string (UUIDv4),
  recipientName: string | null,
  companyName: string,
  roleTitle: string,
  paragraphs: CoverLetterParagraph[],
  overallFitScore: number (0.0 - 100.0),
  integrityStatus: 'PASS' | 'PARTIAL' | 'BLOCKED',
  metadata: {
    generatedAt: string (ISO8601),
    sourceCandidateVersion: string,
    sourceJobVersion: string,
    assertionSetId: string | null,
    generatorVersion: 'v1.0.0',
    tone: 'PROFESSIONAL' | 'CONCISE' | 'CONFIDENT' | 'WARM',
    totalParagraphs: number (3 - 6),
    verifiedParagraphs: number,
    inferredParagraphs: number,
    claimedParagraphs: number,
    wordCount: number,
    characterCount: number
  }
}
```

---

## 3. Absolute Truth Boundary & Grounding Invariants

The Cover Letter Drafting Engine strictly complies with the Zero-Hallucination Career Integrity Gate (`ARCH-016` / `ADR-036`):

1. **Input Exclusivity**: The drafting service may consume **only** `IntegrityCheckedAssertion` objects, validated candidate profiles, parsed job descriptions, and pre-computed match/relevance analyses.
2. **Prohibition of Raw Ingestion**: Unvetted markdown, unparsed raw repository files, untruncated git diffs, or unvalidated candidate bios are strictly barred from the drafting context.
3. **No Autonomous Fact Creation**: The engine is authorized to reorder, emphasize, and structure factual statements for readability; it possesses **zero authority** to create new skills, employers, dates, metrics, or achievements.

---

## 4. Deterministic Content Prioritization Hierarchy

When selecting evidence and crafting narrative paragraphs, the engine follows an immutable 6-tier prioritization sequence:

```
+------------------------------------------------------------------------------------+
|                      COVER LETTER CONTENT PRIORITIZATION HIERARCHY                 |
+------------------------------------------------------------------------------------+
|  Tier 1: VERIFIED Required Skills Evidence  (Relevance: 100.0)                     |
|          -> Direct match for opening statement and technical core                  |
+------------------------------------------------------------------------------------+
|  Tier 2: VERIFIED High-Relevance Projects   (Relevance: >= 70.0)                   |
|          -> Selected from ProjectRelevanceAnalysis (P5-004) with commit proof      |
+------------------------------------------------------------------------------------+
|  Tier 3: VERIFIED Preferred / Bonus Skills  (Relevance: 75.0)                      |
|          -> Differentiators enriching the project and experience narrative         |
+------------------------------------------------------------------------------------+
|  Tier 4: VERIFIED Corporate Experience Records                                     |
|          -> Employment tenure, career progression, team leadership from profile    |
+------------------------------------------------------------------------------------+
|  Tier 5: INFERRED Technical Capabilities    (Relevance: 50.0)                      |
|          -> Labeled taxonomic relationships (e.g. Next.js -> React)                |
+------------------------------------------------------------------------------------+
|  Tier 6: CLAIMED User Assertions            (Relevance: 25.0)                      |
|          -> Retains explicit [Unverified User Claim] label or safely omitted       |
+------------------------------------------------------------------------------------+
```

---

## 5. Section-by-Section Synthesis Invariants

### A. Opening Paragraph (`OPENING`)
* **Permitted Elements**:
  * Candidate full name and professional identity.
  * Explicit role title and company name from the trusted `JobDescription`.
  * Strongest verified alignment (e.g., top 2-3 verified required skills or matching architectural domain).
* **Strict Anti-Hallucination Rules**:
  * **Zero Referral Fabrication**: Must NOT claim referrals, mutual acquaintances, or internal recommendations.
  * **Zero Admiration Claims**: Must NOT invent ungrounded personal admiration (*"I have followed your company for 10 years"*).
  * **Zero Historical Contact**: Must NOT reference past applications or interviews unless explicitly present in trusted data.

### B. Company Alignment Paragraph (`COMPANY_ALIGNMENT`)
* **Permitted Elements**:
  * Explicit industry sector, domain challenges, and tech stack details present in the job posting text.
  * Direct alignment of candidate's verified skills to the company's stated architectural goals.
* **Strict Anti-Hallucination Rules**:
  * **Zero Company Fact Invention**: Must NOT fabricate company mission, products, funding rounds, valuation, employee headcount, executive leadership, or internal culture unless explicitly present in the input job posting.

### C. Relevant Experience Paragraph (`RELEVANT_EXPERIENCE`)
* **Permitted Elements**:
  * Sourced exclusively from explicit candidate work history (`candidateProfile.experience`).
  * Corporate job titles, company names, verified employment dates, and verified leadership accomplishments.
* **Strict Anti-Hallucination Rules**:
  * **Zero Git Duration as Corporate Tenure**: Git commit spans are NEVER converted into employment tenure.
  * **Zero Employer Fabrication**: Must NOT invent companies where the candidate did not work.

### D. Project Evidence Paragraph (`PROJECT_EVIDENCE`)
* **Permitted Elements**:
  * Top-scoring projects from `ProjectRelevanceAnalysis` (`P5-004`).
  * Specific technologies, libraries, and architectural patterns proven by commit-pinned evidence.
  * Commit-backed problem-solving narratives (e.g., *"Engineered distributed caching layer using Redis and Go"*).
* **Strict Anti-Hallucination Rules**:
  * **Zero Unsupported Capabilities**: A project cannot be described using technologies absent from its evidence graph.
  * **EvidenceRef Capping**: Maximum 5 commit-pinned `EvidenceRef` items per paragraph.

### E. Motivation Paragraph (`MOTIVATION`)
* **Permitted Elements**:
  * Grounded professional enthusiasm connecting the candidate's verified capabilities with the role's responsibilities.
  * Standard professional motivation statements (e.g., *"I look forward to leveraging my distributed systems background to advance your backend infrastructure"*).
* **Strict Anti-Hallucination Rules**:
  * **Zero Personal Fabrications**: Must NOT invent personal life stories, childhood passions, geographic relocations, or non-technical personal reasons.

### F. Closing Paragraph (`CLOSING`)
* **Permitted Elements**:
  * Standard professional call to action requesting an interview discussion.
  * Offer to walk through repository architectures and technical code samples.
* **Strict Anti-Hallucination Rules**:
  * **Zero Unverified Logistics**: Must NOT fabricate salary requirements, visa status, notice periods, or relocation agreements unless explicitly present in candidate profile metadata.

---

## 6. Truth Status Handling: Claims, Inferences, and Omissions

```
+------------------------------------------------------------------------------------+
|                     QUALIFICATION INTEGRITY CLASSIFICATION TABLE                   |
+---------------------+-------------------+------------------------------------------+
| Status              | Evidence State    | Engine Treatment in Cover Letter         |
+---------------------+-------------------+------------------------------------------+
| VERIFIED            | Commit-pinned     | Primary narrative; cited with EvidenceId |
| INFERRED            | Taxonomy edge     | Labeled [Inferred from <source>]         |
| CLAIMED             | Self-asserted     | Labeled [Unverified User Claim] or OMIT  |
| MISSING_EVIDENCE    | Zero evidence     | Strictly OMITTED; never asserted         |
| UNKNOWN             | Ambiguous soft-req| Neutral language; no false claims        |
+---------------------+-------------------+------------------------------------------+
```

1. **`CLAIMED` Handling**: Manual user claims must retain the explicit markdown tag `[Unverified User Claim]`. If embedding the claim creates unnatural or misleading prose, the engine **strictly omits** the claim rather than converting it to verified truth.
2. **`INFERRED` Handling**: Inferences (e.g., TypeScript inferred from Angular) are used with qualifiers (*"familiar with the Angular ecosystem, with underlying experience in TypeScript"*) and retain `INFERRED` status.
3. **`MISSING` Handling**: Technologies marked `MISSING` in `CandidateMatchAnalysis` are **never** claimed as strengths. The cover letter highlights adjacent strengths or omits the gap.

---

## 7. Metric Safety Guardrail

Any sentence containing quantitative business claims or performance percentages is subject to the **Metric Safety Guard**:

$$\text{Metric Assertion} \implies \exists e \in \text{CandidateEvidence} \text{ s.t. } \text{IsBacked}(e, \text{Metric})$$

* **Blocked Formats without Explicit Proof**:
  * Performance: *"improved throughput by 45%"*, *"cut latency by 200ms"*.
  * Scale: *"served 10M active users"*, *"handled 50k requests/second"*.
  * Financial: *"saved \$200,000 in cloud infrastructure costs"*.
  * Team: *"managed a team of 15 senior engineers"*.
* **Enforcement**: If a quantitative claim appears without backing evidence in `IntegrityCheckedAssertions`, the drafting engine fails closed with `ValidationError: Quantitative achievement claim rejected`.

---

## 8. Safe ATS Keyword Alignment

Keyword optimization utilizes the canonical `SkillTaxonomyEngine` (`P5-002`):

* **Allowed Synonym Alignment**:
  * Candidate evidence: `postgres` $\rightarrow$ Target job requires: `PostgreSQL` $\rightarrow$ Cover letter emits: `PostgreSQL`.
  * Candidate evidence: `k8s` $\rightarrow$ Target job requires: `Kubernetes` $\rightarrow$ Cover letter emits: `Kubernetes`.
* **Prohibited Keyword Injection**: If target job requires `AWS Lambda` but candidate has zero AWS evidence, `AWS Lambda` is **strictly prohibited** from appearing as a candidate qualification.

---

## 9. Optional LLM Linguistic Sandbox Boundary

The Cover Letter Drafting Engine is fully functional using deterministic template synthesis. When an optional LLM adapter (e.g. Gemini, Claude, ChatGPT) is provided, it operates inside an immutable passive sandbox:

```
+------------------------------------------------------------------------------------+
|                         LLM LINGUISTIC SANDBOX PROTOCOL                            |
+------------------------------------------------------------------------------------+
|                                                                                    |
|  1. PASSIVE XML INPUT ENCAPSULATION                                                |
|     <job_input>                                                                    |
|       Role: Senior Backend Engineer                                                |
|       Company: FinTech Global                                                      |
|       Context: High-throughput payment processing                                 |
|     </job_input>                                                                   |
|     <candidate_facts>                                                              |
|       Verified Skills: [Go, PostgreSQL, Docker, Redis]                             |
|       Top Project: payment-gateway (Relevance: 92.4, Commits: 142)                 |
|       Experience: Senior Developer at TechCorp (2021 - 2024)                       |
|     </candidate_facts>                                                             |
|     <approved_assertions>                                                          |
|       - [UUID-1] Architected Go microservices with PostgreSQL                      |
|       - [UUID-2] Implemented distributed idempotency with Redis                     |
|     </approved_assertions>                                                         |
|                                                                                    |
|  2. PERMITTED LLM ACTIONS                                                          |
|     • Improve sentence transitions and flow                                        |
|     • Adapt prose to requested tone (PROFESSIONAL / CONCISE / WARM)                |
|     • Enhance syntactic variety                                                    |
|                                                                                    |
|  3. STRICTLY PROHIBITED LLM ACTIONS (Trigger immediate validation rejection)       |
|     • Adding new technologies, frameworks, or cloud providers                      |
|     • Inventing metrics, percentages, or dollar amounts                            |
|     • Inventing employers, job titles, or employment dates                         |
|     • Creating or altering EvidenceIds                                             |
|     • Upgrading CLAIMED or INFERRED status to VERIFIED                             |
|                                                                                    |
+------------------------------------------------------------------------------------+
```

---

## 10. Mandatory Post-Generation Integrity Gate

Every generated paragraph—whether drafted deterministically or refined via LLM—must pass the `ZeroHallucinationIntegrityService` before release:

```
Drafted Paragraphs
       │
       ▼
Extract Factual Assertions & EvidenceRefs
       │
       ▼
ZeroHallucinationIntegrityService.auditAssertionList()
       │
       ├─► Any UNBACKED_VERIFIED_CLAIM   ──► FAIL CLOSED (BLOCKED)
       ├─► Any INVALID_EVIDENCE_ID       ──► FAIL CLOSED (BLOCKED)
       ├─► Any TENANT_MISMATCH           ──► FAIL CLOSED (404 NOT_FOUND)
       ├─► Any UNSUPPORTED_ACHIEVEMENT   ──► FAIL CLOSED (BLOCKED)
       └─► All Assertions Validated      ──► Release TailoredCoverLetter
```

---

## 11. Multi-Tenant Default-Deny Isolation

* `context.tenantId` is strictly asserted at the entry point of all methods.
* CandidateProfile, JobDescription, CandidateMatchAnalysis, ProjectRelevanceAnalysis, and EvidenceItems must all share the identical `tenantId`.
* Any cross-tenant access immediately fails closed with `404 NotFoundError`.

---

## 12. Determinism & Provenance Specification

1. **Deterministic Selection**: Given identical structured input models, the drafting engine will select the exact same set of assertions, projects, skills, and evidence references.
2. **Provenance Metadata**: Every `TailoredCoverLetter` carries `CoverLetterMetadata`:
   * `sourceCandidateVersion`: Timestamp/hash of candidate profile.
   * `sourceJobVersion`: Timestamp/hash of target job description.
   * `assertionSetId`: Canonical identifier of audited assertion graph.
   * `generatorVersion`: `v1.0.0`.
   * `tone`: Selected tone configuration.

---

## 13. Comprehensive Testing Strategy

The implementation in Task `P6-002` will be verified against the following comprehensive test suite:

1. **Verified Skill Grounding**: Asserts that skills mentioned in the opening and body are traceable to `IntegrityCheckedAssertions`.
2. **Verified Project Paragraph Grounding**: Asserts that projects cited in the letter correspond to top-ranked repositories from `ProjectRelevanceAnalysis`.
3. **Claimed Skill Labeling**: Asserts that unverified manual claims retain `[Unverified User Claim]` or are safely omitted.
4. **Inferred Skill Handling**: Asserts that inferred skills retain `[Inferred from <source>]` labeling.
5. **Unsupported Technology Omission**: Asserts that ungrounded job requirements are omitted from the cover letter.
6. **Unsupported Metric Blocking**: Asserts that unbacked quantitative metric claims trigger `ValidationError: Quantitative achievement claim rejected`.
7. **Corporate Work History Guard**: Asserts that employment tenure statements derive exclusively from profile work history.
8. **Company Alignment Safety**: Asserts that company domain statements reference only explicit job posting information.
9. **Motivation Safety**: Asserts that motivation statements connect verified skills to role requirements without personal fabrications.
10. **Closing Safety**: Asserts that closing statements remain neutral without inventing visa, salary, or interview details.
11. **ATS Terminology Adaptation**: Asserts canonical synonym substitution (e.g., `postgres` $\rightarrow$ `PostgreSQL`).
12. **EvidenceRef Deduplication & Capping**: Asserts that each paragraph contains at most 5 deduplicated `EvidenceRef` objects.
13. **LLM Prompt Injection Neutralization**: Asserts that prompt injection strings in job postings cannot generate false qualifications.
14. **LLM Citation Tampering Defense**: Asserts that fabricated `EvidenceId` values injected by an LLM fail post-generation integrity checks.
15. **Multi-Tenant Isolation (Default-Deny)**: Asserts that Tenant A cannot draft a cover letter for Candidate B or Job B (404).
16. **100% Bit-for-Bit Determinism**: Asserts that deterministic drafting mode produces identical structured outputs across 100 runs.
17. **Zero Database Mutation**: Asserts that on-demand cover letter synthesis causes zero database writes.

---

## 14. Persistence & Database Strategy

* **In Phase 6**: Cover letter drafting operates completely in-memory as an on-demand stateless calculation service with sub-second execution latency.
* **Zero Database Tables in Phase 6**: No database migrations or persistent cover letter tables are created in Phase 6. Persistence of user-customized and submitted cover letters belongs to **Phase 12 (Application Tracking & Analytics)**.

---

## 15. Open Decisions & Architectural Consensus

* **Decision 1: Paragraph-Level Evidence Citation**:
  * *Consensus*: Each paragraph carries its own array of `assertionIds` and `evidenceRefs`, providing granular traceability.
* **Decision 2: Bounded Letter Length (3 to 6 Paragraphs)**:
  * *Consensus*: Hard upper and lower bounds prevent generated letters from becoming overly verbose or excessively brief.
* **Decision 3: Tone Selection Without Truth Drift**:
  * *Consensus*: Tone presets alter syntactic framing and transitions, but cannot modify factual assertion content or status.

---

## 16. Final Recommendation & Approval

The **Cover Letter Drafting Engine Architecture (`ARCH-018`)** provides an airtight, evidence-backed narrative generation system that eliminates AI hallucinations, enforces rigorous provenance citation, guarantees multi-tenant security, and maintains absolute truth compatibility with the Zero-Hallucination Career Integrity Gate.

**Status**: **P6-002A APPROVED**.

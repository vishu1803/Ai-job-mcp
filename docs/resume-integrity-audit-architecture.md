# ARCH-021: Resume Integrity Audit Tool Architecture

**Document ID**: `ARCH-021`  
**Related ADR**: `ADR-041` (`docs/decisions.md`)  
**Status**: `APPROVED`  
**Phase**: Phase 6 (P6-005A)  
**Author**: Antigravity Core Architecture Team  
**Date**: 2026-08-23  

---

## 1. Executive Summary & Objective

The **Resume Integrity Audit Tool** is the independent, post-generation verification firewall of the Antigravity Career Platform. Operating downstream from the artifact synthesis (`P6-001`) and canonical export (`P6-004`) engines, the audit tool inspects rendered or exported career documents to guarantee that **every factual assertion, technical skill, employment tenure, quantitative metric, and educational credential is authenticated by approved, tenant-isolated career intelligence.**

### Core Mission:
The tool enforces an adversarial zero-trust inspection model. It answers seven definitive questions:
1. **What factual claims are made in the final document?**
2. **Which claims are backed by authentic cryptographic evidence?**
3. **Which claims represent valid taxonomic inferences?**
4. **Which claims are self-asserted user claims, and are they properly labeled?**
5. **Which claims are ungrounded or fabricated?**
6. **Are all cited `EvidenceId` references valid, active, and matching provenance?**
7. **Has unauthorized content drift occurred between approved assertions and the rendered text?**

```
+---------------------------------------------------------------------------------------------------+
|                           RESUME INTEGRITY AUDIT FIREWALL PIPELINE                                |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  |                             1. MULTI-FORMAT RESUME INGESTION                                |  |
|  |  • Structured TailoredResume (Direct AST & Assertion Graph)                                 |  |
|  |  • Exported JSON Resume v1.0.0 (Parsed Schema & meta.antigravity envelope)                  |  |
|  |  • CommonMark / GFM Markdown (AST Tokens, Footnotes, Inline Badges)                         |  |
|  |  • ATS Plain Text (Section Delimiters, Linear Bullet Streams)                               |  |
|  |  * [PDF / DOCX: Explicitly Unsupported at this Phase to Prevent Parsing Illusions]           |  |
|  +----------------------------------------------+----------------------------------------------+  |
|                                                 |                                                 |
|                                                 v                                                 |
|  +---------------------------------------------------------------------------------------------+  |
|  |                       2. DETERMINISTIC CLAIM EXTRACTION ENGINE                              |  |
|  |  - Skill Tokenizer (Canonical mapping via SkillTaxonomyEngine)                              |  |
|  |  - Quantitative Metric Regex Scanner (Percentages, Latencies, Scales, Revenues, Headcounts)  |  |
|  |  - Corporate Experience & Tenure Parser (Employer names, titles, calendar date ranges)      |  |
|  |  - Educational Credential Parser (Degrees, institutions, graduation dates)                  |  |
|  |  - Concrete Achievement Classifier (Measurable outcomes vs capability verbs)               |  |
|  +----------------------------------------------+----------------------------------------------+  |
|                                                 |                                                 |
|                                                 v                                                 |
|  +---------------------------------------------------------------------------------------------+  |
|  |                   3. INDEPENDENT GROUNDING & PROVENANCE VERIFIER                            |  |
|  |  - Cryptographic Evidence Pinning: commitSha (40-hex) + filePath + lineRange immutable       |  |
|  |  - Cross-Tenant Boundary Barrier: context.tenantId check on all assertions & evidence       |  |
|  |  - Work History Authority: Git commits != corporate tenure (requires explicit job record)  |  |
|  |  - Status Inflation Detector: Inferred / Claimed promoted to Fact -> BLOCK                   |  |
|  |  - Contradiction Detector: Resume claims contradicting candidate profile -> BLOCK           |  |
|  |  - Keyword Stuffing Barrier: Repetitive ungrounded keywords -> BLOCK                        |  |
|  |  - Omission Tolerance: Missing candidate facts are never penalized                          |  |
|  +----------------------------------------------+----------------------------------------------+  |
|                                                 |                                                 |
|                                                 v                                                 |
|  +---------------------------------------------------------------------------------------------+  |
|  |                       4. THREE-TIER AUDIT REPORT & REMEDIATION                              |  |
|  |  • PASS: 100% of factual claims backed by verified evidence                                 |  |
|  |  • WARN: Labeled user claims, valid inferences, minor storytelling gaps                     |  |
|  |  • BLOCK: Unsupported skills/metrics/tenures, fabricated citations, cross-tenant data       |  |
|  |  • Structured Remediation Directives for Every Violation                                    |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Core Principles & Zero-Trust Architecture

### 2.1 Principle of Adversarial Independence
The audit engine operates completely decoupled from document generation (`ResumeTailoringService`) and export (`CareerArtifactExportService`). It:
* **Never trusts generator metadata**: Internal tags like `status: 'VERIFIED'` inside a generated JSON object are treated as unverified claims until proven against raw evidence.
* **Never trusts embedded `meta.antigravity` envelopes blindly**: Exporter metadata is treated as a supplemental hint; visible document prose is always parsed and audited independently.
* **Never trusts LLM outputs**: AI models can hallucinate plausible achievements and commit hashes. The audit relies strictly on deterministic code rules and cryptographic indices.
* **Never trusts raw citations**: An inline citation like `[Verified: server.go#L10-50@1111111]` is looked up in the tenant's cryptographic evidence registry; if the SHA or line range has drifted, it is rejected.

### 2.2 Truth Grounding Hierarchy
Every extracted claim is mapped into a strict epistemic hierarchy:
1. **`VERIFIED`**: Directly backed by an active, tenant-matched `EvidenceItem` (e.g. AST function declaration, unit test, build config).
2. **`INFERRED`**: Grounded through canonical taxonomy graph edges (e.g. Next.js $\rightarrow$ React via `BUILT_ON`), retaining explicit inference labeling.
3. **`CLAIMED`**: Self-asserted by candidate, explicitly retaining the tag `[Unverified User Claim]`.
4. **`MISSING_EVIDENCE`**: Unbacked factual assertion $\rightarrow$ finding severity `BLOCK`.
5. **`UNKNOWN`**: Uncataloged or ambiguous term $\rightarrow$ finding severity `WARN`.

---

## 3. Supported Inputs & Format Handling

| Input Format | Extraction & Audit Strategy | Confidence Level |
| :--- | :--- | :--- |
| **`STRUCTURED_RESUME`** | Direct AST audit of `TailoredResume` objects (`bullets`, `skills`, `experience`, `projects`, `education`). Cross-checks all `assertionIds` and `evidenceRefs`. | **Highest (100% AST Fidelity)** |
| **`JSON_RESUME`** | Ingests official JSON Resume v1.0.0 (`basics`, `work`, `education`, `skills`, `projects`, `certificates`). Parses textual strings in `highlights` and `summary`. Uses `meta.antigravity` strictly as supplemental hint. | **High (Structured JSON)** |
| **`MARKDOWN`** | Safe CommonMark/GFM tokenizer inspecting H1-H4 headings, bullet lists, inline citations (`[Verified: ...]`), and footnotes (`[^1]`). Neutralizes HTML tags without execution. | **High (Semantic Document)** |
| **`PLAIN_TEXT`** | ATS-safe linear parser using conservative regex tokenization for uppercase section headers (`=== SECTION ===`), bullet streams (`* `), dates, and metrics. | **Medium-High (Text Stream)** |
| **`PDF` / `DOCX`** | **Explicitly UNSUPPORTED in Phase 6.** Binary layout formats introduce OCR and PDF text-flow parsing hallucinations. Unsupported formats throw `ValidationError`. | **N/A (Fails Safe)** |

---

## 4. Audit Result Data Model

```
+---------------------------------------------------------------------------------------------------+
|                                     ResumeIntegrityAudit                                          |
+---------------------------------------------------------------------------------------------------+
|  • auditId: UUIDv4                                                                                |
|  • tenantId: UUIDv4                                                                               |
|  • candidateId: UUIDv4                                                                            |
|  • artifactType: 'RESUME'                                                                         |
|  • inputFormat: 'STRUCTURED_RESUME' | 'JSON_RESUME' | 'MARKDOWN' | 'PLAIN_TEXT'                   |
|  • overallStatus: 'PASS' | 'WARN' | 'BLOCK'                                                       |
|  • evidenceCoverage: { totalClaims, groundedClaims, coveragePercentage }                         |
|  • contentDrift: 'NONE' | 'WORDING_ONLY' | 'SEMANTIC_CHANGE' | 'FACTUAL_CHANGE'                   |
|  • statistics: { total, verified, inferred, claimed, unsupported, blockedCount, warnCount }       |
|  • findings: IntegrityAuditFinding[]                                                              |
|  • auditedClaims: ClaimAudit[]                                                                    |
|  • integrityVersion: 'v1.0.0'                                                                     |
|  • auditedAt: ISO8601 Timestamp                                                                  |
+---------------------------------------------------------------------------------------------------+
```

### 4.1 Finding Model (`IntegrityAuditFinding`)
```javascript
export const IntegrityAuditFindingSchema = z.object({
  findingId: z.string().uuid(),
  code: IntegrityAuditReasonCodeEnum,
  severity: z.enum(['INFO', 'WARN', 'BLOCK']),
  message: z.string().trim().min(1),
  claimText: z.string().trim().min(1).max(1000),
  claimType: ClaimTypeEnum,
  location: z.object({
    section: z.string().trim().min(1),
    itemIndex: z.number().int().nonnegative().optional(),
    lineNumber: z.number().int().positive().optional(),
  }),
  assertionId: z.string().uuid().nullable().optional(),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  remediation: z.string().trim().min(1).max(500),
}).strict();
```

---

## 5. Three-Tier Status Model

```
       +---------------------------------------------------------------+
       |                      AUDIT STATUS GATE                        |
       +---------------------------------------------------------------+
                                       |
       +-------------------------------+-------------------------------+
       |                               |                               |
       v                               v                               v
   +-------+                       +-------+                       +-------+
   | PASS  |                       | WARN  |                       | BLOCK |
   +-------+                       +-------+                       +-------+
   All factual claims              Non-fatal concerns:             Fatal integrity violations:
   grounded in verified            • Labeled user claims           • Unsupported skills/metrics
   cryptographic evidence.         • Valid taxonomic inferences    • Fabricated EvidenceIds
   0 unsupported facts.            • Minor story gaps              • Cross-tenant data leaks
                                   • Unknown ambiguous terms       • Work history tenure inflation
```

### Invariant Rules:
1. **`BLOCK` Triggers**:
   - Any unsupported technical skill presented as verified fact.
   - Any quantitative metric (percentages, user scales, latencies, revenues) lacking supporting evidence.
   - Any employer name, job title, or employment dates not present in verified candidate work history.
   - Any invalid, missing, or cross-tenant `EvidenceId`.
   - Any commit SHA or file path provenance tampering.
   - Any direct contradiction of candidate profile truth.
2. **`WARN` Triggers**:
   - Self-asserted manual claims retaining explicit `[Unverified User Claim]` labels.
   - Valid taxonomic inferences (e.g. Next.js $\rightarrow$ React).
   - Ambiguous or uncataloged technical terms.
3. **`PASS` Triggers**:
   - 100% of factual statements are backed by authentic evidence with zero warnings or blocks.

---

## 6. Deterministic Claim Extraction Pipeline

The extractor tokenizes document sections into discrete factual claims without requiring an LLM:

```
Document Stream -> Structural Section Splitter -> Typed Claim Matchers -> Grounding Audit
```

### 6.1 Claim Types & Extraction Rules

| Claim Type | Regex & Pattern Logic | Grounding Target |
| :--- | :--- | :--- |
| **`SKILL`** | Tokenizes technical words against `SkillTaxonomyEngine` canonical terms and aliases. | Candidate verified skills & evidence items |
| **`METRIC`** | Scans for quantitative patterns: `\d+(?:\.\d+)?%`, `\$\d+[\d,.]*[kKmMbB]?`, `\d+[\d,.]*\s*(?:users|qps|rps|tps|events)`, `\d+ms`, `99\.\d+%`. | Candidate achievement evidence or benchmarks |
| **`EMPLOYER`** | Matches company names under `EXPERIENCE` / `work` headers. | `candidateProfile.experience[].company` |
| **`TENURE`** | Matches date ranges: `(19\|20\d\d)(?:[-/]\d\d)?\s*[-–—]\s*(?:Present\|(19\|20\d\d)(?:[-/]\d\d)?)`. | `candidateProfile.experience[].startDate/endDate` |
| **`EDUCATION`** | Matches degree titles (B.S., M.S., B.Tech, Ph.D.) and university names. | `candidateProfile.education[]` |
| **`ACHIEVEMENT`** | Action verbs followed by concrete outcomes (`designed`, `reduced`, `scaled`, `delivered`). | Project relevance signals & code evidence |

---

## 7. Input-Specific Audit Adaptations

### 7.1 Structured `TailoredResume` Audit
* Directly reads `resume.experience[].bullets`, `resume.projects[].bullets`, `resume.skills`, and `resume.education`.
* Verifies `assertionIds` and `evidenceRefs` against `ZeroHallucinationIntegrityService`.
* Re-audits ATS keyword alignment against `SkillTaxonomyEngine`.

### 7.2 JSON Resume v1.0.0 Audit
* Traverses standard root arrays: `work[].highlights`, `projects[].highlights`, `skills[].keywords`, `education`.
* Extracts claims from raw strings.
* Validates `meta.antigravity` integrity envelope without letting metadata override unbacked text in `work` or `skills`.

### 7.3 CommonMark / GFM Markdown Audit
* Safe tokenization of Markdown AST (headings `#`, bullet lists `- `, inline links, footnotes `[^1]`).
* Escapes and neutralizes HTML blocks (`<script>`, `<iframe>`, `javascript:` URLs).
* Resolves inline evidence badges `[Verified: path:lines@sha]` and footnotes against tenant evidence index.

### 7.4 ATS Plain Text Audit
* Splits linear text stream on standard uppercase headers (`=== SUMMARY ===`, `=== EXPERIENCE ===`, `=== PROJECTS ===`).
* Parses bullet lines (`* `, `- `) and extracts technical terms and quantitative figures.

---

## 8. Domain-Specific Verification Engines

### 8.1 Technical Skill Verification
* Normalizes extracted terms using `SkillTaxonomyEngine.resolveCanonicalSkill()`.
* Compares normalized slug against approved candidate assertions.
* **Anti-Stuffing Rule**: If a skill appears repeatedly (e.g. 5x) but candidate has 0 evidence for it, triggers `UNSUPPORTED_SKILL` $\rightarrow$ `BLOCK`.

### 8.2 Quantitative Metric Safety Gate
* Any quantitative statement (e.g. *"Increased throughput by 45%"*, *"Scaled to 10M users"*, *"Reduced P99 latency to 12ms"*) requires explicit cryptographic evidence or benchmark notes in candidate profile.
* Unbacked metric $\rightarrow$ triggers `UNSUPPORTED_METRIC` (`BLOCK`).
* Vague qualifiers (*"improved performance"*, *"scalable system"*) are treated neutrally.

### 8.3 Corporate Work History Authority
* Corporate employment tenure, job titles, and employers derive exclusively from `candidateProfile.experience`.
* **Zero Conflation Invariant**: Git commit history length and repository age are **never** accepted as corporate employment tenure.
* Claiming *"5 years of Go experience at Google"* when candidate only has 2 years of open-source Go commits $\rightarrow$ triggers `UNSUPPORTED_TENURE` (`BLOCK`).

### 8.4 Educational Credential Verification
* Degrees, institutions, and graduation dates cross-checked against `candidateProfile.education`.
* Adding unverified degrees (e.g. Stanford M.S. not in profile) $\rightarrow$ triggers `UNSUPPORTED_EDUCATION` (`BLOCK`).

---

## 9. Cryptographic Evidence Reference Validation

Every referenced `EvidenceId` must satisfy:
1. **Existence**: Resolves to an active record in `evidenceItems`.
2. **Tenant Match**: `evidence.tenantId === context.tenantId` (Mismatch $\rightarrow$ `TENANT_MISMATCH` $\rightarrow$ `BLOCK` / 404).
3. **Candidate Match**: `evidence.candidateId === context.candidateId` (Mismatch $\rightarrow$ `CANDIDATE_MISMATCH` $\rightarrow$ `BLOCK`).
4. **Provenance Pinning**: `commitSha` (40-hex), `filePath`, and `lineRange` match stored proof node exactly (Mismatch $\rightarrow$ `PROVENANCE_MISMATCH` $\rightarrow$ `BLOCK`).
5. **No Fabricated Citations**: Non-existent UUIDs or fake commit hashes trigger `FABRICATED_CITATION` (`BLOCK`).

---

## 10. Status Inflation & Contradiction Detection

### 10.1 Status Inflation
* Presenting an unverified user claim as established fact without the required label `[Unverified User Claim]` triggers `STATUS_INFLATION` (`BLOCK`).
* Presenting an inferred skill (Next.js $\rightarrow$ React) as direct verified commit code triggers `STATUS_INFLATION` (`BLOCK`).

### 10.2 Contradiction Detection
* Candidate profile: Title is "Software Engineer" $\rightarrow$ Resume: "Vice President of Infrastructure" $\rightarrow$ `CONTRADICTORY_FACT` (`BLOCK`).
* Candidate profile: Dates 2023–2024 $\rightarrow$ Resume: 2019–2024 $\rightarrow$ `CONTRADICTORY_FACT` (`BLOCK`).

---

## 11. Omission vs Fabrication Invariant

* **Omission**: Omitting a skill, project, or previous employer from a resume is **100% valid tailoring**. It is **NEVER** penalized as an integrity failure.
* **Fabrication**: Adding an unsupported skill, metric, employer, or credential is an **integrity failure**.
* The audit engine strictly measures **Grounding Precision**, not recall of the candidate's entire historical database.

---

## 12. Content Drift & Keyword Safety

* **Content Drift Analysis**:
  - `NONE`: Text matches approved structured assertions bit-for-bit.
  - `WORDING_ONLY`: Minor stylistic rephrasing without adding factual claims.
  - `SEMANTIC_CHANGE`: Altered narrative nuance $\rightarrow$ `WARN`.
  - `FACTUAL_CHANGE`: Injected tools, metrics, or entities not in approved assertions $\rightarrow$ `BLOCK`.

---

## 13. Audit Reason Codes & Remediation Directives

| Reason Code | Severity | Description | Remediation Directive |
| :--- | :--- | :--- | :--- |
| `UNSUPPORTED_SKILL` | `BLOCK` | Technology claimed without evidence | Remove skill from resume or connect repository demonstrating usage |
| `UNSUPPORTED_METRIC` | `BLOCK` | Quantitative figure without evidence | Remove quantitative metric or attach verified benchmark evidence |
| `UNSUPPORTED_TENURE` | `BLOCK` | Employment dates exceed work history | Align dates with verified candidate work history records |
| `UNSUPPORTED_EMPLOYER` | `BLOCK` | Unlisted corporate employer | Remove employer or add verified work history entry |
| `UNSUPPORTED_EDUCATION`| `BLOCK` | Unverified educational credential | Remove credential or verify degree in candidate profile |
| `CONTRADICTORY_FACT` | `BLOCK` | Resume contradicts candidate facts | Correct resume statement to match verified profile record |
| `STATUS_INFLATION` | `BLOCK` | Claim/inference presented as verified | Restore `[Unverified User Claim]` tag or label inference |
| `FABRICATED_CITATION` | `BLOCK` | Fake or non-existent EvidenceId/SHA | Cite authentic EvidenceId from active repository evidence index |
| `TENANT_MISMATCH` | `BLOCK` | Cross-tenant evidence referenced | Remove foreign evidence reference (access denied) |
| `PROVENANCE_MISMATCH` | `BLOCK` | Commit SHA or file path altered | Re-pin citation to verified commit SHA and file line range |
| `CONTENT_DRIFT` | `WARN` / `BLOCK` | Text deviates from approved facts | Re-sync document text with approved structured assertions |
| `LABELED_USER_CLAIM` | `WARN` | Explicit unverified claim present | User claim retained with explicit label |
| `VALID_INFERENCE` | `WARN` | Valid taxonomic inference present | Grounded via parent framework relationship |
| `VALID_EVIDENCE` | `INFO` | Cryptographically verified fact | Grounded in immutable commit-pinned proof node |

---

## 14. Architectural Relationship to P5-006

```
+-------------------------------------------------------------------+
|               DUAL-LAYER INTEGRITY DEFENSE IN DEPTH               |
+-------------------------------------------------------------------+
|                                                                   |
|   1. UPSTREAM GATE (P5-006): ZeroHallucinationIntegrityService    |
|      - Validates structured assertions before synthesis           |
|      - Audits individual CareerAssertion & EvidenceRef objects    |
|      - Gatekeepers LLM prompt inputs                              |
|                                                                   |
|   2. DOWNSTREAM FIREWALL (P6-005): ResumeIntegrityAuditService    |
|      - Audits the final rendered/exported artifact independently  |
|      - Parses raw text, Markdown, JSON Resume, ATS Plain Text     |
|      - Detects post-synthesis drift, inflation, or tampered prose |
|                                                                   |
+-------------------------------------------------------------------+
```
* **P6-005 never replaces P5-006**: P5-006 is the upstream gate for structured assertions; P6-005 is the downstream audit firewall for rendered documents.

---

## 15. LLM Boundary & Determinism

* **Zero LLM Requirement**: The audit engine is 100% deterministic and rule-based.
* **No AI Judgment on Verdicts**: If future AI-assisted natural language processing is added to propose candidate claim extractions, all verification, evidence lookups, and `PASS`/`WARN`/`BLOCK` decisions remain strictly deterministic code.

---

## 16. Multi-Tenant Sovereign Isolation (404 Default-Deny)

* Every audit execution requires `context.tenantId`.
* Verifies `candidateId`, `assertionId`, and `evidenceId` belong to `context.tenantId`.
* Cross-tenant inspection attempts throw `NotFoundError` (404 default-deny) without revealing foreign tenant information.

---

## 17. Performance, Complexity & Persistence Invariants

1. **Complexity**: $\mathcal{O}(|\text{Claims}| + |\text{EvidenceRefs}|)$ execution time using indexed Maps (`assertionsById`, `evidenceById`, `skillsByCanonicalSlug`).
2. **Latency**: Sub-15ms in-memory execution.
3. **Zero Database Writes**: Pure on-demand validation service producing 0 database mutations and requiring no database migrations in Phase 6.

---

## 18. Domain Schemas (P6-005 Contract)

```javascript
export const IntegrityAuditStatusEnum = z.enum(['PASS', 'WARN', 'BLOCK']);
export const IntegrityAuditSeverityEnum = z.enum(['INFO', 'WARN', 'BLOCK']);
export const ClaimTypeEnum = z.enum(['SKILL', 'METRIC', 'EXPERIENCE', 'EDUCATION', 'ACHIEVEMENT', 'TENURE', 'EMPLOYER', 'DOMAIN', 'OTHER']);
export const ContentDriftEnum = z.enum(['NONE', 'WORDING_ONLY', 'SEMANTIC_CHANGE', 'FACTUAL_CHANGE']);

export const IntegrityAuditReasonCodeEnum = z.enum([
  'VALID_EVIDENCE',
  'VALID_INFERENCE',
  'LABELED_USER_CLAIM',
  'MISSING_EVIDENCE',
  'INVALID_EVIDENCE_ID',
  'TENANT_MISMATCH',
  'CANDIDATE_MISMATCH',
  'RESOURCE_MISMATCH',
  'PROJECT_MISMATCH',
  'PROVENANCE_MISMATCH',
  'UNSUPPORTED_SKILL',
  'UNSUPPORTED_METRIC',
  'UNSUPPORTED_ACHIEVEMENT',
  'UNSUPPORTED_EMPLOYER',
  'UNSUPPORTED_DATE',
  'UNSUPPORTED_TENURE',
  'UNSUPPORTED_EDUCATION',
  'CONTRADICTORY_FACT',
  'FABRICATED_CITATION',
  'STATUS_INFLATION',
  'CONTENT_DRIFT',
]);
```

---

## 19. Deliverables & Implementation Roadmap for P6-005

1. **`docs/resume-integrity-audit-architecture.md` (`ARCH-021`)** — This document.
2. **`ADR-041` in `docs/decisions.md`**.
3. **Domain Schemas**: `src/domain/career/resume-integrity-audit.schemas.js`.
4. **Core Service**: `src/services/resume-integrity-audit.service.js`.
5. **Unit Tests**: `tests/unit/resume-integrity-audit.service.test.js` (26+ test cases).
6. **Live Integration Tests**: `tests/integration/resume-integrity-audit.service.test.js`.

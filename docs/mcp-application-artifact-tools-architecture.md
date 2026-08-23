# MCP Application Artifact Tools Architecture (ARCH-024)

**Status**: IMPLEMENTED & VERIFIED  
**Standard**: Model Context Protocol (MCP) Specification `2026-07-28`  
**Phase**: Phase 7 (Tasks P7-005A, P7-005)  
**Parent Specification**: `docs/mcp-server-architecture.md` (`ARCH-022`)  
**Decision Record**: `docs/decisions.md` (`ADR-045`)  

---

## 1. Executive Summary & Problem Context

The Antigravity Career Hub provides an evidence-backed, multi-tenant career intelligence platform that connects software professionals' code repositories (GitHub, GitLab), portfolios, and credentials to real-world career workflows.

Following the successful delivery of:
1. **MCP Foundation & Streamable HTTP Transport** (`P7-001`, `P7-002` / `ARCH-022`)
2. **Dedicated Personal MCP API Token Infrastructure** (`P7-003` / `ADR-043`)
3. **Career Read Tools** (`P7-004` / `ARCH-023` — `get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit`)

**Phase 7 Task P7-005A** defines the architecture for exposing **Application Artifact Tools** over the Model Context Protocol:
1. `generate_tailored_resume` (Tailors an evidence-grounded resume for a target job)
2. `draft_cover_letter` (Drafts an authentic, evidence-backed cover letter with tone presets)
3. `recommend_portfolio_projects` (Curates the candidate's optimal featured repositories and case-study signals)

This architecture document establishes the functional contracts, security threat model, RBAC and token scope permissions, dual-layer integrity verification pipeline, output budgeting, prompt injection sandboxing, deterministic idempotency, and client interoperability guarantees for external AI clients (Google Gemini, Anthropic Claude, OpenAI ChatGPT, Cursor, and personal developer IDEs).

```
+-----------------------------------------------------------------------------------+
|                           EXTERNAL AI CLIENTS (GEMINI / CLAUDE)                   |
+-----------------------------------------+-----------------------------------------+
                                          |
                         MCP Streamable HTTP (POST /mcp)
                         Header: MCP-Protocol-Version: 2026-07-28
                         Auth: Bearer mcp_live_4a8b...
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        FASTIFY MCP TRANSPORT & SECURITY LAYER                     |
|   - Multi-Tier Rate Limiting (20 req/min Artifact Tier)                           |
|   - Scope Assertions (career:read vs. career:write)                               |
|   - RBAC Role Checks (READONLY / MEMBER / OWNER)                                  |
|   - Sovereign Multi-Tenant Isolation (404 Default-Deny)                           |
+-----------------------------------------+-----------------------------------------+
                                          |
                         McpRequestContext (Immutable Principal)
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                    APPLICATION ARTIFACT TOOLS (P7-005 ADAPTERS)                   |
|   +------------------------------+  +------------------------------+              |
|   |    generate_tailored_resume  |  |      draft_cover_letter      |              |
|   |    (career:write / MEMBER)   |  |    (career:write / MEMBER)   |              |
|   +------------------------------+  +------------------------------+              |
|   +----------------------------------------------------------------+              |
|   |                 recommend_portfolio_projects                   |              |
|   |                 (career:read / READONLY+MEMBER)                |              |
|   +----------------------------------------------------------------+              |
+-----------------------------------------+-----------------------------------------+
                                          |
                         Pure In-Memory Service Delegation
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                      AUTHORITATIVE CAREER DOMAIN SERVICES                         |
|   - ResumeTailoringService (P6-001)       - CoverLetterDraftingService (P6-002)   |
|   - PortfolioRecommendationService (P6-003)- ResumePresentationService (P6-001)   |
|   - ZeroHallucinationIntegrityService     - ResumeIntegrityAuditService (P6-005)  |
|   - SkillTaxonomyEngine (P5-002)          - SecretScrubber / EvidenceRefMapper    |
+-----------------------------------------------------------------------------------+
                                          |
                         (Stateless Structured JSON Response)
                                          v
+-----------------------------------------------------------------------------------+
|                       EXPORT BOUNDARY (DECOUPLED SEPARATION)                      |
|   - generate_tailored_resume returns structured domain object (TailoredResume)   |
|   - Export format conversion (JSON Resume, Markdown, Plain Text) remains          |
|     the exclusive domain of export_career_artifact / CareerArtifactExportService  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Official MCP & Industry Research (2026-07-28 Standard)

Our design adheres to the official Model Context Protocol 2026 specification (`@modelcontextprotocol/server@2.0.0` / `@modelcontextprotocol/core@2.0.0`) and modern agent tool design best practices:

### 2.1 Protocol Requirements vs. Industry Recommendations vs. Product Architecture

| Dimension | MCP Protocol Requirement (`2026-07-28`) | Industry Best Practice (Anthropic / OpenAI / Google) | Antigravity Product Architecture |
| :--- | :--- | :--- | :--- |
| **Tool Declaration** | `tools/list` returns `name`, `description`, `inputSchema` (valid JSON Schema object). | Provide concise parameter descriptions, declare enum values, and avoid deeply nested untyped structures. | Strict Zod input/output schemas normalized via `zodToJsonSchema`; input validated at transport boundary. |
| **Tool Execution** | `tools/call` takes `name`, `arguments`, returns `{ content: Content[], isError?: boolean }`. | Structure primary output into `content[0].text` as parseable JSON string. | Return deterministic JSON string in `content[0].text` conforming to strict Zod output schemas. |
| **Tool Annotations** | Optional metadata object declaring operational characteristics. | Declare `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` to inform client model planning. | Annotations are **purely advisory metadata** for client planners; backend RBAC, token scopes, and tenant checks remain mandatory. |
| **Error Handling** | Standard JSON-RPC 2.0 error codes (`-32600`, `-32602`, `-32000` to `-32099`). | Differentiate parameter validation errors from authorization or rate-limit rejections. | Strict error mapping: `-32001 UNAUTHENTICATED`, `-32003 FORBIDDEN`, `-32004 NOT_FOUND`, `-32029 RATE_LIMITED`, `-32602 INVALID_PARAMS`. |
| **Write / Action Tools** | No distinct protocol message type; write tools use standard `tools/call`. | Distinguish read tools from mutating/write tools via scopes, annotations, and client confirmation flows. | Clear separation: read tools (`career:read`), artifact synthesis tools (`career:write`), external git actions (Phase 9 two-phase approval). |
| **Structured Output** | `content[0].text` carries UTF-8 text. | Return structured JSON rather than unstructured markdown to allow programmatic client validation. | Return structured JSON domain objects with section boundaries, typed assertions, and verification metadata. |
| **Output Budgets** | No protocol-enforced byte ceiling. | Limit response sizes ($\le 30\text{ KB}$) to prevent LLM context-window exhaustion and high latency. | Hard output budgets: Resume $\le 25\text{ KB}$, Cover Letter $\le 15\text{ KB}$, Portfolio $\le 20\text{ KB}$. |
| **Progress / Long Tasks** | Protocol supports `notifications/progress` for streaming progress tokens over SSE. | Long-running operations ($>3\text{s}$) should emit progress notifications or run asynchronously. | In-memory execution completes in $<200\text{ms}$; synchronous request-response is optimal for P7-005. |
| **Cancellation** | Protocol supports `notifications/cancelled` from client. | Wire HTTP abort signals to internal service execution to release server resources on disconnect. | Fastify `req.raw.on('close')` maps to `AbortSignal` to terminate downstream compute on client abort. |
| **Result Caching** | Optional client-side caching hints. | Never share cached outputs across different users or tenants; invalidate on candidate profile change. | Tenant-private caching only; cache keys include `tenantId:userId:candidateVersion:jobHash:optionsHash`. |
| **Sensitive Data** | No built-in redaction protocol. | Filter PII and strip credentials before returning data to LLM. | All code excerpts sanitized via `SecretScrubber`; private keys, passwords, and tokens stripped. |

---

## 3. Core Architectural Principle: Interface Adapter Pattern

The MCP layer is strictly an **interface and schema translation gateway**. It contains **zero duplicate career intelligence logic**:

```
+─────────────────────────────────────────────────────────────────────────+
|                        MCP TOOL ADAPTER LAYER                           |
|  - Parse & validate tool input arguments via Zod                        |
|  - Mint trusted McpRequestContext & enforce token scopes & RBAC         |
|  - Resolve target candidate ID within authenticated tenant              |
|  - Delegate directly to authoritative domain services                   |
|  - Enforce output budgets & dual integrity verification                 |
|  - Return structured JSON envelope                                      |
+────────────────────────────────────┬────────────────────────────────────+
                                     │ (Delegates)
                                     ▼
+─────────────────────────────────────────────────────────────────────────+
|                   AUTHORITATIVE DOMAIN SERVICES                         |
|  - ResumeTailoringService.tailorResume()                                |
|  - CoverLetterDraftingService.draftCoverLetter()                        |
|  - PortfolioRecommendationService.recommendPortfolio()                 |
|  - ResumePresentationService.auditPresentation()                        |
|  - ZeroHallucinationIntegrityService.validateAssertionSet()             |
|  - ResumeIntegrityAuditService.auditDocument()                          |
|  - SkillTaxonomyEngine.normalizeSkill()                                 |
+─────────────────────────────────────────────────────────────────────────+
```

### Invariant Checklist
1. **Zero Duplicated Formulas**: ATS weights, project relevance formulas, signal weights, and marginal value calculations live exclusively in Phase 5 and Phase 6 domain services.
2. **Zero Duplicated Truth Rules**: Verification status hierarchy (`VERIFIED` > `INFERRED` > `CLAIMED` > `MISSING_EVIDENCE`), tenure rules, and metric safety are enforced solely by `ZeroHallucinationIntegrityService` and `ResumeIntegrityAuditService`.
3. **Zero Direct Database Mutations**: All Phase 7 artifact operations execute on-demand in-memory without database insertions, updates, or deletions.

---

## 4. Tool Catalog, Classification & Operational Characteristics

### 4.1 Tool Classification

A fundamental architectural distinction separates recommendation analysis from document synthesis:

1. **`recommend_portfolio_projects` (READ-ONLY ANALYSIS)**:
   - **Classification**: Read / Analysis tool.
   - **Rationale**: It computes a ranking and recommendation of existing candidate projects against a job description. It does not synthesize new text, adapt bullet points, or generate new document artifacts.
   - **Scope**: `career:read`.
   - **RBAC Role Ceiling**: Permitted for `OWNER`, `MEMBER`, and `READONLY`.
   - **Annotations**: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.

2. **`generate_tailored_resume` (COMPUTE / SYNTHESIS / WRITE-ADJACENT)**:
   - **Classification**: Compute / Synthesis tool (Write-Adjacent).
   - **Rationale**: It generates a customized, tailored career document containing synthesized summaries, rephrased bullet points, adapted ATS keywords, and presentation layout structures. While stateless in P7-005, producing tailored application assets represents an active career writing capability.
   - **Scope**: `career:write`.
   - **RBAC Role Ceiling**: Permitted for `OWNER` and `MEMBER`. Denied for `READONLY` with `403 / -32003 (FORBIDDEN)`.
   - **Annotations**: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.

3. **`draft_cover_letter` (COMPUTE / SYNTHESIS / WRITE-ADJACENT)**:
   - **Classification**: Compute / Synthesis tool (Write-Adjacent).
   - **Rationale**: It synthesizes a personalized prose document addressing a target company and hiring team, selecting narrative angles, tone styles, and evidence paragraphs.
   - **Scope**: `career:write`.
   - **RBAC Role Ceiling**: Permitted for `OWNER` and `MEMBER`. Denied for `READONLY` with `403 / -32003 (FORBIDDEN)`.
   - **Annotations**: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`.

### 4.2 Summary Classification Matrix

| Tool Name | Tool Category | Required Token Scope | Minimum RBAC Role | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `recommend_portfolio_projects` | Career Analysis / Read | `career:read` | `READONLY` | `true` | `false` | `true` | `false` |
| `generate_tailored_resume` | Artifact Synthesis | `career:write` | `MEMBER` | `false` | `false` | `true` | `false` |
| `draft_cover_letter` | Artifact Synthesis | `career:write` | `MEMBER` | `false` | `false` | `true` | `false` |

> [!IMPORTANT]
> **Advisory vs. Mandatory Enforcement**: The `readOnlyHint: false` annotation informs client LLM planners that `generate_tailored_resume` and `draft_cover_letter` perform active document synthesis. Regardless of client behavior, backend middleware strictly validates that the token carries `career:write` and the user role is at least `MEMBER`.

---

## 5. Permission & RBAC Scoping Model

In accordance with ADR-043 (`ROLE_SCOPE_CEILINGS`), the platform enforces a strict permission hierarchy:

```
+--------------------------------------------------------------------------+
|                          WORKSPACE RBAC ROLES                            |
|                                                                          |
|   +------------------------------------------------------------------+   |
|   | READONLY                                                         |   |
|   | Scope Ceiling: ['career:read']                                   |   |
|   | Permitted Tools:                                                 |   |
|   |   - get_candidate_profile                                        |   |
|   |   - list_verified_skills                                         |   |
|   |   - inspect_project_evidence                                     |   |
|   |   - analyze_job_fit                                              |   |
|   |   - recommend_portfolio_projects                                 |   |
|   +------------------------------------------------------------------+   |
|                                    |                                     |
|                                    v                                     |
|   +------------------------------------------------------------------+   |
|   | MEMBER                                                           |   |
|   | Scope Ceiling: ['career:read', 'career:write', 'career:export']  |   |
|   | Permitted Tools:                                                 |   |
|   |   - (All READONLY tools)                                         |   |
|   |   - generate_tailored_resume                                     |   |
|   |   - draft_cover_letter                                           |   |
|   +------------------------------------------------------------------+   |
|                                    |                                     |
|                                    v                                     |
|   +------------------------------------------------------------------+   |
|   | OWNER                                                            |   |
|   | Scope Ceiling: ['career:read', 'career:write', 'career:export',  |   |
|   |                 'career:admin']                                  |   |
|   | Permitted Tools:                                                 |   |
|   |   - (All MEMBER tools) + Token Management & Workspace Admin      |   |
|   +------------------------------------------------------------------+   |
+--------------------------------------------------------------------------+
```

### Scoping Rules
1. **Auditor / Reviewer Principle**: Users with `READONLY` role or tokens with only `career:read` scope can inspect candidate qualifications and project recommendations, but cannot generate tailored job application documents.
2. **Explicit Rejection**: If a `READONLY` user or a token lacking `career:write` calls `generate_tailored_resume` or `draft_cover_letter`, the server immediately responds with `-32003 (FORBIDDEN)`.

---

## 6. Statelessness & Persistence Policy

For Phase 7 (Task P7-005):

1. **Stateless In-Memory Execution**:
   - All three artifact tools execute 100% in-memory.
   - Generated artifacts are returned directly in the JSON-RPC response envelope.
   - Zero rows are inserted, updated, or deleted in PostgreSQL.
2. **Zero Premature Persistence Tables**:
   - We **DO NOT** create `resume_artifacts`, `cover_letter_artifacts`, or `portfolio_artifacts` database tables in Phase 7.
   - Persistent application document history and stage tracking are scheduled for **Phase 12 (Job / Application Tracking)**.
3. **Reproducibility**:
   - Because generation is deterministic, invoking the tool with identical candidate state, job input, and configuration options produces bit-for-bit identical results without needing cached database rows.

---

## 7. Tool Functional Specifications & Schema Contracts

### 7.1 `generate_tailored_resume`

#### Functional Workflow
1. Resolves `candidateId` (or defaults to user's candidate persona within `context.tenantId`).
2. Parses `jobDescriptionText` via `JobDescriptionParser` (or fetches validated job from `context.tenantId`).
3. Executes `EvidenceMatchingService` and `ProjectRelevanceService` to determine requirement matches and ranked repositories.
4. Executes pre-generation verification via `ZeroHallucinationIntegrityService`.
5. Synthesizes tailored resume sections via `ResumeTailoringService` adhering to `presentationMode` (`PRESERVE_EXISTING` or `GENERATE_NEW`).
6. Executes post-generation document audit via `ResumeIntegrityAuditService`.
7. If post-generation audit state is `BLOCK`, rejects with structured `ValidationError` / `-32602`. If `PASS` or `WARN`, formats and returns bounded structured output.

#### Presentation Mode Handling
- **`GENERATE_NEW`** (Default): Generates a clean, modern, ATS-optimized structured resume using the requested `templateId` (`ATS_FOCUSED`, `PROFESSIONAL`, `MODERN`, `MINIMAL`, `TRADITIONAL`).
- **`PRESERVE_EXISTING`**: Accepts existing resume text or structured JSON. Uses `ResumePresentationService.auditPresentation` to evaluate layout compatibility.
  - If input is Markdown or Plain Text, verifies structure and preserves layout/section ordering.
  - If input is binary PDF or DOCX, returns explicit `UNSUPPORTED_PRESERVATION` status in `presentationAudit` and emits structured warnings rather than making false claims of visual pixel-perfection.

#### Input Schema (`GenerateTailoredResumeInputSchema`)
```typescript
{
  candidateId?: string (UUIDv4);
  jobDescriptionText?: string (50 to 20,000 chars);
  jobId?: string (UUIDv4);
  jobTitle?: string (max 255 chars);
  presentationMode?: 'PRESERVE_EXISTING' | 'GENERATE_NEW' (default 'GENERATE_NEW');
  existingResumeText?: string (max 30,000 chars);
  existingResumeFormat?: 'MARKDOWN' | 'PLAIN_TEXT' | 'JSON_RESUME';
  templateId?: 'ATS_FOCUSED' | 'PROFESSIONAL' | 'MODERN' | 'MINIMAL' | 'TRADITIONAL' (default 'ATS_FOCUSED');
  targetOptions?: {
    includeSummary?: boolean (default true);
    maxProjects?: number (int 1 to 5, default 3);
    maxBulletsPerRole?: number (int 1 to 6, default 4);
    preferredProjectIds?: string[] (UUIDv4, max 3);
  };
}
```

#### Output Schema (`GenerateTailoredResumeOutputSchema`)
```typescript
{
  resumeId: string (UUIDv4);
  candidateId: string (UUIDv4);
  jobTitle: string;
  presentationMode: 'PRESERVE_EXISTING' | 'GENERATE_NEW';
  templateId: string;
  presentationAudit: {
    status: 'PASS' | 'WARNING' | 'UNSUPPORTED_PRESERVATION';
    preservedAttributes: object;
    modifiedAttributes: object;
    warnings: string[];
  };
  integrityReport: {
    overallStatus: 'PASS' | 'PARTIAL';
    verifiedAssertionsCount: number;
    inferredAssertionsCount: number;
    claimedAssertionsCount: number;
    evidenceItemsCitedCount: number;
  };
  auditReport: {
    status: 'PASS' | 'WARN';
    totalClaimsChecked: number;
    verifiedClaimsCount: number;
    warningsCount: number;
  };
  resume: {
    basics: {
      name: string;
      headline: string | null;
      email?: string;
      location?: string;
    };
    summary?: string;
    skills: Array<{
      category: string;
      skills: Array<{
        skillSlug: string;
        skillName: string;
        provenance: 'VERIFIED' | 'INFERRED' | 'CLAIMED';
        evidenceCount: number;
      }>;
    }>;
    experience: Array<{
      company: string;
      title: string;
      startDate: string;
      endDate?: string;
      isCurrent: boolean;
      bullets: Array<{
        bulletId: string;
        text: string;
        status: 'VERIFIED' | 'INFERRED' | 'CLAIMED';
        evidenceRefs: EvidenceRef[];
      }>;
    }>;
    projects: Array<{
      projectId: string;
      name: string;
      description?: string;
      relevanceScore: number;
      bullets: Array<{
        bulletId: string;
        text: string;
        status: 'VERIFIED' | 'INFERRED' | 'CLAIMED';
        evidenceRefs: EvidenceRef[];
      }>;
    }>;
    education: Array<object>;
    certifications?: Array<object>;
  };
  warnings: string[];
}
```

---

### 7.2 `draft_cover_letter`

#### Functional Workflow
1. Resolves `candidateId` and validates target job input within `context.tenantId`.
2. Gathers candidate profile, match analysis, and ranked projects.
3. Validates pre-generation assertions via `ZeroHallucinationIntegrityService`.
4. Synthesizes structured paragraphs via `CoverLetterDraftingService`:
   - `OPENING`: Targeted introduction citing role and key competence.
   - `COMPANY_ALIGNMENT`: Grounded strictly in job description text (zero fabricated funding/culture claims).
   - `RELEVANT_EXPERIENCE`: Work history summary respecting corporate tenure.
   - `PROJECT_EVIDENCE`: Concrete repository evidence with commit-pinned `EvidenceRefs`.
   - `MOTIVATION`: Professional value proposition.
   - `CLOSING`: Call to action and availability.
5. Applies requested `tone` (`PROFESSIONAL`, `CONCISE`, `CONFIDENT`, `WARM`).
6. Executes post-generation verification; enforces metric safety (unbacked numbers $\rightarrow$ `BLOCK`).
7. Returns bounded structured cover letter.

#### Input Schema (`DraftCoverLetterInputSchema`)
```typescript
{
  candidateId?: string (UUIDv4);
  jobDescriptionText?: string (50 to 20,000 chars);
  jobId?: string (UUIDv4);
  jobTitle?: string (max 255 chars);
  companyName?: string (max 255 chars);
  recipientName?: string (max 255 chars);
  tone?: 'PROFESSIONAL' | 'CONCISE' | 'CONFIDENT' | 'WARM' (default 'PROFESSIONAL');
  targetParagraphCount?: number (int 3 to 6, default 4);
  preferredProjectIds?: string[] (UUIDv4, max 3);
}
```

#### Output Schema (`DraftCoverLetterOutputSchema`)
```typescript
{
  letterId: string (UUIDv4);
  candidateId: string (UUIDv4);
  companyName: string;
  jobTitle: string;
  recipientName?: string | null;
  tone: 'PROFESSIONAL' | 'CONCISE' | 'CONFIDENT' | 'WARM';
  metadata: {
    totalParagraphs: number;
    wordCount: number;
    characterCount: number;
    verifiedParagraphsCount: number;
    inferredParagraphsCount: number;
    claimedParagraphsCount: number;
  };
  integrityReport: {
    overallStatus: 'PASS' | 'PARTIAL';
    evidenceItemsCitedCount: number;
  };
  paragraphs: Array<{
    paragraphId: string;
    paragraphType: 'OPENING' | 'COMPANY_ALIGNMENT' | 'RELEVANT_EXPERIENCE' | 'PROJECT_EVIDENCE' | 'MOTIVATION' | 'CLOSING';
    text: string;
    status: 'VERIFIED' | 'INFERRED' | 'CLAIMED';
    evidenceRefs: EvidenceRef[];
    matchedKeywords: string[];
    claimLabel?: string | null;
  }>;
  warnings: string[];
}
```

---

### 7.3 `recommend_portfolio_projects`

#### Functional Workflow
1. Resolves `candidateId` and validates target job description within `context.tenantId`.
2. Classifies target `jobFamily` (`BACKEND`, `FRONTEND`, `FULLSTACK`, `DEVOPS_CLOUD`, `DATA_ML`, `AI_ENGINEERING`, `GENERAL_SOFTWARE`).
3. Evaluates candidate projects across 7 architectural signal dimensions.
4. Executes greedy marginal value optimization to select optimal 1–5 featured projects.
5. Applies tutorial/clone detection safeguards (`LIKELY_TUTORIAL` deprioritized).
6. Evaluates user overrides (`PIN_FEATURED`, `EXCLUDE_PROJECT`, `REORDER_OVERRIDE`).
7. Formulates interview discussion questions and case-study prompts.
8. Returns bounded structured portfolio recommendation.

#### Input Schema (`RecommendPortfolioProjectsInputSchema`)
```typescript
{
  candidateId?: string (UUIDv4);
  jobDescriptionText?: string (50 to 20,000 chars);
  jobId?: string (UUIDv4);
  jobTitle?: string (max 255 chars);
  jobFamily?: 'BACKEND' | 'FRONTEND' | 'FULLSTACK' | 'DEVOPS_CLOUD' | 'DATA_ML' | 'AI_ENGINEERING' | 'GENERAL_SOFTWARE';
  maxFeaturedProjects?: number (int 1 to 5, default 3);
  userOverrides?: Array<{
    projectId: string (UUIDv4);
    action: 'PIN_FEATURED' | 'EXCLUDE_PROJECT' | 'REORDER_OVERRIDE';
    targetOrder?: number (int 1 to 10);
    reason?: string (max 500 chars);
  }>;
}
```

#### Output Schema (`RecommendPortfolioProjectsOutputSchema`)
```typescript
{
  recommendationId: string (UUIDv4);
  candidateId: string (UUIDv4);
  jobTitle: string;
  jobFamily: 'BACKEND' | 'FRONTEND' | 'FULLSTACK' | 'DEVOPS_CLOUD' | 'DATA_ML' | 'AI_ENGINEERING' | 'GENERAL_SOFTWARE';
  signalComplementarityScore: number (0.0 to 100.0);
  highlightedSkills: Array<{
    skillSlug: string;
    skillName: string;
    priority: 'REQUIRED' | 'PREFERRED' | 'OPTIONAL';
    demonstratedInProjects: string[];
  }>;
  featuredProjects: Array<{
    projectId: string (UUIDv4);
    name: string;
    recommendationStatus: 'RECOMMENDED';
    relevanceScore: number (0.0 to 100.0);
    marginalValueScore: number;
    ownershipConfidence: string;
    contributionConfidence: string;
    tutorialClassification: 'LIKELY_ORIGINAL' | 'LIKELY_TUTORIAL' | 'UNKNOWN';
    storyCompleteness: 'DOCUMENTED' | 'PARTIAL' | 'MISSING';
    primarySignals: string[];
    evidenceHighlights: EvidenceRef[];
    caseStudyPrompt: string;
    interviewDiscussionTopics: string[];
  }>;
  supportingProjects: Array<{
    projectId: string (UUIDv4);
    name: string;
    recommendationStatus: 'OPTIONAL';
    relevanceScore: number;
    secondarySignals: string[];
  }>;
  deprioritizedProjects: Array<{
    projectId: string (UUIDv4);
    name: string;
    disqualificationReason: string;
  }>;
  warnings: string[];
}
```

---

## 8. Dual-Layer Integrity Pipeline & Status Policy

The artifact tools preserve the zero-hallucination truth invariants established across Phase 5 and Phase 6:

```
[Candidate & Job Inputs]
           │
           ▼
[Stage 1: Pre-Generation Integrity Gate (P5-006)]
  - Validates assertions against grounded EvidenceItems
  - Classifies: VERIFIED, INFERRED, CLAIMED, MISSING_EVIDENCE
  - Checks commit provenance & candidate identity
           │
           ▼
[Stage 2: Deterministic Artifact Synthesis (P6-001 / P6-002)]
  - Slices evidence-backed content (Verified > Projects > Preferred > Inferred > Claimed)
  - Enforces corporate work history authority (commits != tenure)
  - Enforces metric safety (unbacked numbers rejected)
           │
           ▼
[Stage 3: Post-Generation Document Audit (P6-005)]
  - Independent zero-trust scan of synthesized text
  - Verifies claim alignment, detects status inflation, checks metrics
           │
           ├── If Status == 'BLOCK' ──────► Throw ValidationError (-32602)
           │                                 (0 invalid artifacts emitted)
           ▼
[Stage 4: Return Verified Structured Artifact]
  - Emits status: PASS (100% verified) or PARTIAL/WARN (labeled claims present)
```

### Status Emission Policy
1. **`BLOCK` Verdict**: If any statement contains fabricated skills, ungrounded quantitative metrics, tenure inflation, cross-tenant evidence, or status promotion, generation **FAILS COMPLETELY**. MCP returns `-32602 (INVALID_PARAMS)` with specific audit findings.
2. **`PARTIAL` / `WARN` Verdict**: If the artifact contains user claims that are explicitly labeled `[Unverified User Claim]` or inferences labeled `[Inferred]`, generation succeeds, and the output envelope clearly flags `overallStatus: 'PARTIAL'` and lists warning items in `warnings[]`.
3. **No Promotion Guarantee**: MCP tools cannot transform `CLAIMED` into `VERIFIED` or `INFERRED` into `VERIFIED`.

---

## 9. Decoupled Export Boundary

A key design rule is **single responsibility per tool**:

* **`generate_tailored_resume`**: Produces the canonical *structured* domain model (`TailoredResume`) with typed sections, bullets, and `EvidenceRefs`.
* **`draft_cover_letter`**: Produces the structured paragraph model (`TailoredCoverLetter`).
* **`recommend_portfolio_projects`**: Produces the structured portfolio strategy model (`PortfolioRecommendation`).
* **`export_career_artifact`** (P7-005/P7-006): Exclusively handles transforming structured domain models into external downloadable interchange formats:
  - `JSON_RESUME` (v1.0.0 schema)
  - `MARKDOWN` (GFM typography with configurable citations: `NONE`, `INLINE`, `FOOTNOTES`)
  - `PLAIN_TEXT` (ATS single-column sanitized plain text)
  - `CANONICAL_JSON`

> [!NOTE]
> `generate_tailored_resume` does **NOT** return raw JSON Resume strings or binary DOCX/PDF buffers. This prevents redundant schema transformation code and keeps the tool output clean, machine-readable, and composable.

---

## 10. Cost, Rate Limiting & Latency Model

Artifact synthesis tools perform multi-stage extraction, scoring, synthesis, and dual integrity audits, making them computationally heavier than simple read tools.

### 10.1 Cost Metadata Matrix

| Tool Name | Estimated Cost | Expected Latency | Maximum Output Bytes | Downstream Services | External API Calls |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `recommend_portfolio_projects` | `medium` | 80 ms | 20,480 bytes (20 KB) | `PortfolioRecommendationService`, `ProjectRelevanceService` | 0 |
| `generate_tailored_resume` | `high` | 180 ms | 25,600 bytes (25 KB) | `ResumeTailoringService`, `ResumePresentationService`, `ResumeIntegrityAuditService` | 0 |
| `draft_cover_letter` | `high` | 150 ms | 15,360 bytes (15 KB) | `CoverLetterDraftingService`, `ZeroHallucinationIntegrityService` | 0 |

### 10.2 Rate Limiting Integration
We leverage the existing `McpRateLimiter` (`src/security/mcp-rate-limiter.js`) with dedicated tool compute tiers:
- **IP Limit**: 120 req/min per IP.
- **Tenant Overall Limit**: 600 req/min per Tenant.
- **Read Tool Limit**: 60 calls/min per Tool per Tenant.
- **Artifact Tool Limit**: **20 calls/min per Tool per Tenant** (`generate_tailored_resume`, `draft_cover_letter`).

---

## 11. Security Threat Model & Mitigations

| Threat Vector | Severity | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Unauthorized Artifact Generation** | High | Unprivileged users generate job application materials. | Scope assertion requires `career:write` and role $\ge$ `MEMBER`. `READONLY` rejected with 403 / `-32003`. |
| **Cross-Tenant Entity Access** | Critical | Tenant B accesses Tenant A's candidate, job, or evidence. | Mandatory `tenantId` extraction from `McpRequestContext`. Any foreign entity lookups immediately return `NotFoundError` (404 / `-32004`). |
| **Job Description Prompt Injection** | High | Malicious job description attempts to override system rules or exfiltrate candidate data. | Strict passive data sandboxing; size bounded ($\le 20\text{ KB}$); parsed into structural requirements; no dynamic evaluation or shell execution. |
| **Secret & Credential Exfiltration** | Critical | Repository excerpts contain API keys or tokens. | All code excerpts processed through `SecretScrubber`; private keys, passwords, and tokens stripped before emission. |
| **Status Inflation / Unverified Claims** | High | Candidate manual claims presented as code-verified facts. | Mandatory `ZeroHallucinationIntegrityService` + `ResumeIntegrityAuditService` audit gate; `STATUS_INFLATION` triggers `BLOCK`. |
| **Quantitative Metric Fabrication** | High | AI invents performance numbers (e.g. "improved latency by 45%"). | `QUANTITATIVE_METRIC_REGEX` detects unbacked numbers without candidate evidence $\rightarrow$ `BLOCK`. |
| **Corporate Tenure Inflation** | High | Git commit date range conflated with employment duration. | Corporate work history authority: employment dates derive strictly from candidate profile work entries. |
| **Context Window Exhaustion** | Medium | Oversized output crashes client LLM context. | Hard output budgets: Resume $\le 25\text{ KB}$, Cover Letter $\le 15\text{ KB}$, Portfolio $\le 20\text{ KB}$. |
| **Cross-Tenant Cache Poisoning** | Critical | Tenant A receives Tenant B's cached tailored resume. | All caching keys are strictly tenant-partitioned (`tenantId:userId:candidateVersion:paramsHash`). |
| **Denial of Service via Heavy Synthesis** | Medium | Rapid burst of complex resume tailoring calls exhausts server CPU. | Compute tier rate limiting (20 calls/min per tenant); synchronous in-memory execution. |

---

## 12. Observability & Audit Logging

Every artifact tool invocation emits structured, sanitized Pino logs and database audit entries conforming to `P1-002` and `P1-004`:

### Logged Events
1. **`mcp.tool.invoked`**: Emitted upon request receipt (`requestId`, `tenantId`, `userId`, `role`, `toolName`).
2. **`mcp.tool.completed`**: Emitted upon successful synthesis (`durationMs`, `integrityStatus`, `auditStatus`, `outputBytes`).
3. **`mcp.tool.denied`**: Emitted on authentication/RBAC failure (`reason`, `requiredScope`, `userRole`).
4. **`mcp.tool.failed`**: Emitted on validation or integrity gate failure (`errorCode`, `findingsCount`).

> [!CAUTION]
> **Data Privacy Invariant**: Full resumes, cover letters, job description texts, and raw candidate evidence are **NEVER logged in plaintext** to Pino logs or audit tables. Only metadata, byte counts, and finding reason codes are recorded.

---

## 13. Testing & Verification Matrix

The implementation of P7-005 must satisfy the following 27-point verification suite:

1. **Discovery**: `tools/list` returns all 3 artifact tools with accurate annotations and schemas.
2. **Scope Enforcement (`career:write`)**: `generate_tailored_resume` rejects token with only `career:read` with 403 / `-32003`.
3. **Scope Enforcement (`career:write`)**: `draft_cover_letter` rejects token with only `career:read` with 403 / `-32003`.
4. **Read Scope (`career:read`)**: `recommend_portfolio_projects` succeeds with `career:read` token.
5. **RBAC Role Matrix**: `OWNER` and `MEMBER` succeed for all 3 tools; `READONLY` is rejected for resume/cover letter.
6. **Multi-Tenant Default-Deny**: Tenant B cannot tailor resume using Tenant A's `candidateId` or `jobId` (404 / `-32004`).
7. **Direct Job Input**: Validates direct text parsing against 50–20,000 character boundaries.
8. **Job Input Injection Defense**: Prompt injection payloads in job descriptions are treated as passive data.
9. **Resume Mode (`GENERATE_NEW`)**: Synthesizes clean structured resume with requested `templateId`.
10. **Resume Mode (`PRESERVE_EXISTING`)**: Audits layout preservation; returns `UNSUPPORTED_PRESERVATION` for binary formats.
11. **Cover Letter Tone**: Generates distinct phrasing across `PROFESSIONAL`, `CONCISE`, `CONFIDENT`, `WARM`.
12. **Cover Letter Paragraph Budget**: Bounded strictly to requested `targetParagraphCount` (3 to 6).
13. **Portfolio Signal Complementarity**: Evaluates 7-dimension signals and calculates complementarity score (0–100).
14. **Portfolio Featured Projects Bound**: Clamped to requested `maxFeaturedProjects` (1 to 5).
15. **Portfolio Overrides**: Respects `PIN_FEATURED`, `EXCLUDE_PROJECT`, `REORDER_OVERRIDE`.
16. **Tutorial Deprioritization**: `LIKELY_TUTORIAL` projects are relegated to deprioritized list.
17. **Integrity Gate `BLOCK`**: Unsupported metrics or tenure claims trigger immediate `-32602` error.
18. **Integrity Gate `WARN`**: Labeled user claims produce `PARTIAL` status with explicit warning messages.
19. **Secret Scrubbing**: Live API keys and tokens in evidence excerpts are redacted with `[REDACTED_SECRET]`.
20. **Deterministic Idempotency**: 100 consecutive executions with identical inputs return bit-for-bit identical outputs.
21. **Zero Database Mutations**: Guarantees zero SQL INSERT, UPDATE, or DELETE operations across all 3 tools.
22. **Rate Limiting**: Exceeding 20 artifact calls/min triggers 429 / `-32029 (RATE_LIMITED)`.
23. **Output Size Clamping**: Resume $\le 25\text{ KB}$, Cover Letter $\le 15\text{ KB}$, Portfolio $\le 20\text{ KB}$.
24. **Export Boundary Separation**: Tool outputs structured domain objects; does not pollute with raw export strings.
25. **Client Interoperability**: Validated against official MCP Client, Gemini, Claude, and ChatGPT test harnesses.
26. **AbortSignal Propagation**: Disconnecting client terminates downstream computation.
27. **Cache Partition Isolation**: Cached artifacts are strictly tenant-partitioned and never cross-accessible.

---

## 14. Architecture Review & Final Signoff

### Review Findings Summary
- **Tool Catalog**: Cleanly separated 3 tools with distinct semantic responsibilities.
- **Scoping**: `recommend_portfolio_projects` appropriately scoped to `career:read`; `generate_tailored_resume` and `draft_cover_letter` appropriately scoped to `career:write`.
- **Integrity**: Dual-layer pre-generation gate + post-generation audit strictly maintained.
- **Persistence**: Stateless, zero-mutation in-memory execution preserved.
- **Safety**: Hard output limits, metric guards, secret scrubbing, and passive prompt injection defense verified.

**VERDICT**: **P7-005A APPROVED**

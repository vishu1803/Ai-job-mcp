# Gemini End-to-End Golden Path Architecture & Verification Specification (ARCH-027)

**Document ID**: `ARCH-027`  
**Phase**: Phase 8 (Task P8-003A)  
**Parent Specifications**: `goal.md`, `project.md`, `docs/gemini-integration-architecture.md` (`ARCH-026`), `docs/mcp-server-architecture.md` (`ARCH-022`), `docs/mcp-career-read-tools-architecture.md` (`ARCH-023`)  
**Decision Record**: `docs/decisions.md` (`ADR-048`)  
**Status**: APPROVED  
**Author**: Antigravity Core Architecture & Security Team  
**Date**: 2026-08-24  

---

## 1. Executive Summary & Golden Path Mission

The **Gemini End-to-End Golden Path** (`P8-003`) represents the definitive system integration milestone for Phase 8: demonstrating that an AI client (Google Gemini) can interact with Antigravity Career Hub over the Model Context Protocol (MCP 2026-07-28 standard) to examine authentic candidate code evidence and explain job fit without hallucinating qualifications or manipulating scores.

```
+--------------------------------------------------------------------------------------------------+
|                              END-TO-END GOLDEN PATH TOPOLOGY                                     |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|  [Step 1: GitHub Ingestion]  ==>  [Step 2: Evidence Linking]  ==>  [Step 3: Candidate Sync]     |
|  - Mock/Live Repo Commits         - AST & File Extraction           - Profile Aggregation         |
|  - Real PostgreSQL Records         - Immutable EvidenceIds           - Verified vs Claimed Skills  |
|                                                                                                  |
|                                         ||                                                       |
|                                         \/                                                       |
|                                                                                                  |
|  [Step 4: Target Job Parsing] ==> [Step 5: MCP Tool Invocation] ==> [Step 6: AI Fit Synthesis]   |
|  - Parsed Job Requirements         - Remote MCP Streamable HTTP      - Gemini 3.7 Flash Model     |
|  - Deterministic ATS Fit (0-100)   - analyze_job_fit Tool Call       - JOB_EXPLANATION Policy     |
|  - Gap Classification Matrix       - McpRequestContext Enforced      - Zero Score Manipulation    |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

---

## 2. Reusable System Components & Layer Integration

P8-003 connects existing, verified subsystems with zero architectural duplication:

1. **Connector & Evidence Extraction Layer** (Phases 3–4):
   - `GitHubConnector` & `GithubEvidenceExtractor` (`src/extractors/github/`).
   - `EvidenceLinkingService` (`src/services/evidence-linking.service.js`).
   - Creates cryptographic `EvidenceId` records linked to `commit_sha`, `file_path`, and `skills`.
2. **Candidate Profile Layer** (Phase 4):
   - `CandidateProfileService` (`src/services/candidate-profile.service.js`).
   - Maintains verified capabilities while isolating `[Unverified User Claim]` items.
3. **Career Intelligence & ATS Scoring Layer** (Phase 5):
   - `JobDescriptionParser` (`src/domain/career/job-description-parser.js`).
   - `EvidenceMatchingService` (`src/services/evidence-matching.service.js`).
   - `AtsFitScoreService` (`src/services/ats-fit-score.service.js`).
   - `ZeroHallucinationIntegrityService` (`src/services/zero-hallucination-integrity.service.js`).
4. **Remote MCP Server Layer** (Phase 7):
   - `McpServerWrapper` (`src/mcp/server.js`) and `registerCareerReadTools` (`src/mcp/tools/career-read-tools.js`).
   - Exposes `get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit`.
5. **AI Client Adapter & Prompt Policy Layer** (Phase 8, P8-001 & P8-002):
   - `GeminiProviderAdapter` (`src/clients/gemini/gemini-adapter.js`).
   - `PromptPolicyRegistry` & `JobExplanationPolicy` (`src/clients/ai/prompt-policies/`).
   - Structured output schema validation and error recovery.

---

## 3. Trust Boundaries, Security & Authority Matrix

### 3.1 Trust Boundary Invariants

```
+-----------------------------------------------------------------------------------+
|                        AUTHORITY & TRUST INVERSION MATRIX                         |
+-----------------------------------------------------------------------------------+
| 1. DETERMINISTIC AUTHORITY (Internal Domain Services):                            |
|    - Computes mathematical ATS match scores (0-100).                              |
|    - Classifies requirement statuses (MATCHED, PARTIAL, MISSING, UNKNOWN).        |
|    - Validates EvidenceIds, commit SHAs, file paths, and tenant isolation.        |
|    - AI IS STRICTLY FORBIDDEN FROM RECALCULATING OR OVERRIDING THESE RESULTS.     |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
| 2. PROTOCOL GATEWAY (Remote MCP Server):                                          |
|    - Authenticates incoming requests via McpRequestContext & Bearer tokens.       |
|    - Strictly isolates tenants with sovereign default-deny (404).                 |
|    - Clamps output budgets (15 KB profiles, 500-char evidence excerpts).          |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
| 3. AI REASONING AGENT (Google Gemini):                                            |
|    - Role: Natural Language Phrasing, Explanations, and Gap Summaries.            |
|    - Authority: ZERO AUTHORITY over facts, scores, EvidenceIds, or claims.        |
|    - Operates inside <untrusted_job_description> and <task_instruction> sandboxes.|
+-----------------------------------------------------------------------------------+
```

### 3.2 Security Protections:
- **Tenant Isolation**: All database fixtures and MCP calls use authenticated `tenantId`. Cross-tenant lookups return `404 NOT_FOUND`.
- **Secret & PII Sanitization**: `SecretScrubber` strips tokens, keys, and candidate contact details from prompts and tool responses.
- **Prompt Injection Defense**: Job descriptions are wrapped in passive `<untrusted_job_description>` XML tags; system policy explicitly prohibits executing instructions embedded in job text.

---

## 4. Test Strategy: Dual-Mode Deterministic & Live Verification

To preserve the repository's test performance and prevent flaky CI failures caused by upstream AI rate limits, P8-003 establishes a **Dual-Mode Verification Strategy**:

```
+------------------------------------------------------------------------------------+
|                         DUAL-MODE VERIFICATION STRATEGY                            |
+------------------------------------------------------------------------------------+
|                                                                                    |
|  1. DETERMINISTIC GOLDEN PATH (Normal CI - npm test / npm run test:integration)    |
|     - Target File: tests/integration/gemini-golden-path.test.js                    |
|     - Execution: Fastify Server + Remote PostgreSQL + MCP Tools + Mocked GenAI SDK |
|     - Verifies: Complete multi-stage workflow, real DB seeding, real MCP routing,   |
|       tool invocation parsing, schema validation, and deterministic fit assertions.|
|     - Timing: Sub-10 seconds; ZERO external network calls to ai.google.dev.        |
|                                                                                    |
|  2. LIVE EXTERNAL GOLDEN PATH (Explicit Verification - npm run test:live)          |
|     - Target File: tests/integration/live/gemini-golden-path.live.test.js          |
|     - Execution: Fastify Server + Remote PostgreSQL + Live Google Gemini API       |
|     - Verifies: Live authentication against ai.google.dev, live gemini-3.7-flash   |
|       tool loop, real model JSON response synthesis, and live prompt policy audit. |
|     - Guardrails: Synthetic candidate data only; isolated from normal test passes. |
|                                                                                    |
+------------------------------------------------------------------------------------+
```

---

## 5. Implementation Deliverables & Acceptance Criteria for P8-003

When P8-003 is executed, the following deliverables must be produced:

1. **Deterministic Golden Path Integration Suite**:
   - [`tests/integration/gemini-golden-path.test.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/tests/integration/gemini-golden-path.test.js)
   - Verifies steps 1 through 6 with full PostgreSQL and Fastify stack.
   - Includes compliant `after()` hook invoking `closeDatabase()`.
2. **Live External Golden Path Suite**:
   - [`tests/integration/live/gemini-golden-path.live.test.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/tests/integration/live/gemini-golden-path.live.test.js)
   - Verifies live tool calling against `ai.google.dev` with synthetic data.
3. **Execution Ledger & Quality Enforcement**:
   - All quality gates (`test:unit`, `test:integration`, `test:db-lifecycle-check`, `lint`, `format:check`, `db:check`) pass cleanly.

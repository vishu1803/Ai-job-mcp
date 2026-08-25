# MCP Tool Latency Benchmark Architecture & Performance Specification (ARCH-030)

**Document ID**: `ARCH-030`  
**Phase**: Phase 8 (Task P8-006A)  
**Parent Specifications**: `goal.md`, `project.md`, `docs/mcp-server-architecture.md` (`ARCH-020`), `docs/mcp-streamable-http-architecture.md` (`ARCH-021`), `docs/mcp-api-tokens-architecture.md` (`ARCH-022`), `docs/mcp-career-read-tools-architecture.md` (`ARCH-023`), `docs/mcp-application-artifact-tools-architecture.md` (`ARCH-024`), `docs/gemini-integration-architecture.md` (`ARCH-026`), `docs/gemini-golden-path-architecture.md` (`ARCH-027`), `docs/vertex-ai-gemini-architecture.md` (`ARCH-028`), `docs/gemini-enterprise-mcp-integration-architecture.md` (`ARCH-029`)  
**Decision Record**: `docs/decisions.md` (`ADR-051`)  
**Status**: APPROVED & ARCHITECTURE REVIEW COMPLETE  
**Author**: Antigravity Core Performance & Architecture Team  
**Date**: 2026-08-24  

---

## 1. Executive Summary & Problem Context

Task **P8-006** specifies:
> *"Benchmark MCP tool execution latency with Gemini (target <1.5s for cached queries)."*

Before executing performance measurements or modifying code in **P8-006**, this architecture specification (**P8-006A**) defines:
1. A rigorous **4-layer latency boundary decomposition** separating network transport, database queries, application domain calculations, and external AI model inference.
2. A **3-tier tool taxonomy** acknowledging different compute characteristics across the 7 MCP tools.
3. An audit of **current caching infrastructure** (reporting `CACHE_NOT_IMPLEMENTED` for domain services).
4. Realistic **latency budgets and regression thresholds** for both standalone MCP execution and multi-turn Gemini reasoning loops.
5. A **cost-controlled, deterministic benchmarking harness design** that prevents AI Studio HTTP 429 rate-limiting and conserves Google Cloud Vertex AI promotional credits.

---

## 2. Four-Layer Latency Boundary Decomposition

Latency must never be reported as a single collapsed number. The benchmark measures four distinct observation boundaries:

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             END_TO_END BOUNDARY (Layer 4)                                 │
│  User Request ──────────────────────────────────────────────────────────► Final Response │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                          GEMINI_TOOL BOUNDARY (Layer 3)                            │  │
│  │  Model Turn 1 (Tool Decision) ──────────────────────────► Model Turn 2 (Synthesis) │  │
│  │  ┌──────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                         MCP_HTTP BOUNDARY (Layer 2)                          │  │  │
│  │  │  POST /mcp (HTTP Parsing + Auth) ──────────────► JSON-RPC 2.0 Response       │  │  │
│  │  │  ┌────────────────────────────────────────────────────────────────────────┐  │  │  │
│  │  │  │                       TOOL_ONLY BOUNDARY (Layer 1)                     │  │  │  │
│  │  │  │  In-Memory Service Handler ────────► Domain Output                     │  │  │  │
│  │  │  │  • PostgreSQL Query Latency (dbMs)                                     │  │  │  │
│  │  │  │  • Domain Scoring & AST Matching (domainMs)                            │  │  │  │
│  │  │  │  • Secret Scrubbing & Output Formatting (scrubMs)                      │  │  │  │
│  │  │  └────────────────────────────────────────────────────────────────────────┘  │  │  │
│  │  │  • Fastify Routing, Rate Limiting & Bearer Token Verification (authMs)       │  │  │
│  │  │  • JSON Serialization & Async Pino Audit Telemetry (auditMs)                 │  │  │
│  │  └──────────────────────────────────────────────────────────────────────────────┘  │  │
│  │  • Network Round-Trip to Remote MCP Server (netMs)                                 │  │
│  └────────────────────────────────────────────────────────────────────────────────────┘  │
│  • Client Network, Prompt Tokenization & Cloud AI LLM Inference (modelMs)                │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Boundary Definitions

| Boundary Symbol | Starting Point | Ending Point | Included Components | Excluded Components |
| :--- | :--- | :--- | :--- | :--- |
| **`TOOL_ONLY`** | Service handler function invocation | Service returns domain object | Drizzle SQL queries, AST matching, ATS math, SecretScrubber. | Fastify HTTP, Bearer auth parsing, JSON serialization, AI models. |
| **`MCP_HTTP`** | Fastify receives `POST /mcp` request | Fastify sends complete response body | HTTP headers, JSON parsing, rate limiter, token lookup, tool execution, serialization, async audit dispatch. | Client network travel time, Gemini model thinking time. |
| **`GEMINI_TOOL`** | Gemini SDK decides to invoke tool | Gemini SDK receives tool response | Serialization into Gemini tool call, HTTP transport to `/mcp`, MCP execution, parsing tool result. | User prompt ingestion, final Gemini synthesis. |
| **`END_TO_END`** | User dispatches prompt to AI agent | User receives final stream completion | Gemini Turn 1 (decision), MCP execution, Gemini Turn 2 (synthesis & formatting). | N/A (Full user-perceived lifecycle). |

---

## 3. Tool Catalog Taxonomy & Latency Classification

The 7 tools exposed on the Remote MCP server perform vastly different computational tasks and cannot share identical performance targets:

```
                                  7-TOOL TAXONOMY
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
  1. READ_FAST                     2. ANALYTICAL                    3. AI_GENERATION
  • get_candidate_profile          • analyze_job_fit                • generate_tailored_resume
  • list_verified_skills           • recommend_portfolio_projects   • draft_cover_letter
  • inspect_project_evidence
  [Indexed SQL + Projection]       [Regex + Matrix ATS Math]        [Structured Tailoring + Integrity Gate]
```

### Classification Breakdown

| Tool Name | Class | Complexity Profile | Primary Latency Driver |
| :--- | :--- | :--- | :--- |
| `get_candidate_profile` | `READ_FAST` | Low ($O(1)$ indexed candidate query + skill join) | PostgreSQL indexed read + SecretScrubber |
| `list_verified_skills` | `READ_FAST` | Low ($O(K)$ paginated skill query with evidence links) | PostgreSQL query + skill status projection |
| `inspect_project_evidence` | `READ_FAST` | Low ($O(E)$ project evidence query by repo UUID) | PostgreSQL evidence query + code snippet scrubbing |
| `analyze_job_fit` | `ANALYTICAL` | Moderate ($O(N \times M)$ taxonomy matching + ATS score calculation) | Job parser regex + evidence join + fit score weighting |
| `recommend_portfolio_projects` | `ANALYTICAL` | Moderate (multi-project relevance scoring + ranking) | Multi-repo evidence extraction + relevance sort |
| `generate_tailored_resume` | `AI_GENERATION` | High (tailoring model assembly + dual-layer integrity audit) | In-memory resume tailoring + zero-hallucination verification |
| `draft_cover_letter` | `AI_GENERATION` | High (evidence synthesis + integrity verification) | Cover letter model assembly + claim verification |

> [!IMPORTANT]
> **AI Generation Tool Boundary Invariant**: In our architecture, `generate_tailored_resume` and `draft_cover_letter` MCP tool handlers execute **deterministic domain services** in Node.js (producing structured domain models with verified citations). When Gemini uses these tools to generate final user prose, the Gemini LLM generation time happens in **Layer 4 (`END_TO_END`)**, not inside the MCP tool execution itself.

---

## 4. Current Caching Infrastructure Review & State Definitions

### 4.1 Codebase Audit Result: `CACHE_NOT_IMPLEMENTED`
An inspection of `src/services/` and `src/mcp/tools/` confirms:
* **Webhook & Connector Caches**: Process-local LRU caches exist for GitHub installation tokens (`GitHubTokenCache`) and webhook idempotency (`WebhookDeliveryCache`).
* **Domain Career Services**: There is currently **NO in-memory caching or Redis caching layer** for candidate profile views, ATS fit scores, verified skill lists, or tailored resumes. Every MCP request executes live SQL queries via Drizzle ORM against the PostgreSQL database.
* **Architecture Decision**: The benchmark must evaluate performance against true **`DB_WARM` / `MCP_WARM`** runtime conditions without fabricating artificial cache hits.

### 4.2 Benchmark Cache State Definitions

| State Symbol | Definition | System Conditions |
| :--- | :--- | :--- |
| **`COLD`** | Initial execution after cold process boot. | Cold Node.js V8 JIT, cold DB connection pool (initial TCP/TLS handshake to PostgreSQL), empty OS buffer cache. |
| **`DB_WARM`** | DB connection pool active; PostgreSQL buffers primed. | Active database connection checked out from pool; PostgreSQL query plans cached; indexes in RAM. |
| **`MCP_WARM`** | Server process initialized; route handlers hot. | Fastify route tables compiled; token validation cached in memory; rate limiter maps populated. |
| **`GEMINI_WARM`** | AI Provider SDK pre-initialized. | Google GenAI SDK client initialized; TLS connections to Vertex/AI Studio established. |

---

## 5. Latency Target Evaluation (<1.5s Target Analysis)

Task P8-006 establishes an initial target of **`<1.5s for cached queries`**. We analyze this target across the four boundaries:

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                            TARGET FEASIBILITY BY BOUNDARY                                │
├───────────────────┬────────────────────┬────────────────────┬────────────────────────────┤
│ Boundary          │ Tool Class         │ Target Status      │ Architectural Expectation  │
├───────────────────┼────────────────────┼────────────────────┼────────────────────────────┤
│ 1. TOOL_ONLY      │ READ_FAST          │ EASILY ACHIEVABLE  │ 10ms – 50ms (local/warm)   │
│                   │ ANALYTICAL         │ EASILY ACHIEVABLE  │ 50ms – 250ms               │
│                   │ AI_GENERATION      │ EASILY ACHIEVABLE  │ 100ms – 400ms              │
├───────────────────┼────────────────────┼────────────────────┼────────────────────────────┤
│ 2. MCP_HTTP       │ READ_FAST          │ REALISTIC          │ 30ms – 150ms (local)       │
│                   │                    │                    │ 150ms – 450ms (remote DB)  │
│                   │ ANALYTICAL         │ REALISTIC          │ 200ms – 750ms (remote DB)  │
│                   │ AI_GENERATION      │ REALISTIC          │ 300ms – 950ms (remote DB)  │
├───────────────────┼────────────────────┼────────────────────┼────────────────────────────┤
│ 3. GEMINI_TOOL    │ ALL TOOLS          │ REALISTIC          │ 400ms – 1100ms             │
├───────────────────┼────────────────────┼────────────────────┼────────────────────────────┤
│ 4. END_TO_END     │ ALL TOOLS          │ AGGRESSIVE / N/A   │ 1800ms – 4500ms            │
│ (2 LLM Turns)     │                    │ (Model-bound)      │ (Includes 2x Cloud LLM)    │
└───────────────────┴────────────────────┴────────────────────┴────────────────────────────┘
```

### Formal Architectural Decision on the Target:
1. **Canonical Target Scope**: The **`<1.5s` target applies strictly to the `MCP_HTTP` (p95) boundary** for all 7 tools under `DB_WARM` / `MCP_WARM` operating conditions.
2. **End-to-End Gemini Budget**: Multi-turn Gemini Golden Path interactions (`END_TO_END`) are allocated a separate budget of **`<4.0s` (p95)** using Gemini 3.7 Flash / 2.5 Flash.

---

## 6. Statistical Metrics & Sub-Component Timing

The benchmark captures statistical distributions across all dimensions:

### 6.1 Distribution Metrics
* **Percentiles**: $p50$ (median), $p95$ (SLA ceiling), $p99$ (tail latency).
* **Summary Stats**: $\text{Min}$, $\text{Max}$, $\text{Mean}$, $\text{Standard Deviation} (\sigma)$.
* **Reliability**: $\text{Error Rate} (\%)$, $\text{HTTP Status Breakdown}$.

### 6.2 Granular Component Timing Breakdown (Per Request)
```
Total MCP_HTTP Duration = transportMs + authMs + dbMs + domainMs + serializationMs
```
* `transportMs`: Network framing + Fastify header parsing.
* `authMs`: Bearer token extraction + SHA-256 hash calculation + DB token validation + RBAC assertion.
* `dbMs`: PostgreSQL query dispatch + network round-trip to database + row deserialization.
* `domainMs`: Domain logic execution (ATS fit calculation, evidence matching, integrity audit).
* `serializationMs`: SecretScrubber execution + JSON-RPC 2.0 response formatting.

---

## 7. Concurrency & Environment Modeling

### 7.1 Concurrency Tiers
To ensure stability without overloading remote database instances:
1. **$C = 1$ (Sequential Baseline)**: 100 requests per tool. Establishes clean single-stream baseline without thread contention.
2. **$C = 5$ (Standard Agent Burst)**: Simulates concurrent agent reasoning turns.
3. **$C = 10$ (Stress Ceiling)**: Matches maximum PostgreSQL connection pool capacity (`max: 20` in `src/db/index.js`).

### 7.2 Environment Differentiation
* **Local Test Environment**: Node.js test process against local or remote PostgreSQL.
* **Remote Staging Environment**: Aiven Cloud PostgreSQL instance. Network latency to Aiven ($30\text{ms} - 80\text{ms}$ RTT per SQL query) is explicitly identified and subtracted when isolating pure application overhead.

---

## 8. Cost & Credit Protection Strategy (Zero Provider Burn)

To protect Google Cloud promotional credits, prevent AI Studio HTTP 429 rate limits, and maintain 100% deterministic reproducibility:

```
                               BENCHMARK EXECUTION SPLIT
                                           │
        ┌──────────────────────────────────┴──────────────────────────────────┐
        ▼                                                                     ▼
1. DETERMINISTIC BENCHMARK (N=100 per tool)              2. LIVE GOLDEN PATH SAMPLE (N=5)
• Target: Layers 1 & 2 (TOOL_ONLY, MCP_HTTP)             • Target: Layers 3 & 4 (GEMINI_TOOL, END_TO_END)
• Engine: Direct HTTP / Mock AI Provider                 • Engine: Live Vertex AI / AI Studio
• Cloud AI Cost: $0.00 (0 API tokens)                   • Cloud AI Cost: Minimal (<$0.01)
• Determinism: 100% Bit-for-bit                          • Purpose: Real-world latency calibration
```

---

## 9. Performance Regression Thresholds

The automated benchmark suite enforces the following regression barriers:

$$\text{Regression Trigger} = \begin{cases} \text{FAIL} & \text{if } p95_{\text{MCP\_HTTP}} > 1500\text{ms} \text{ for any tool} \\ \text{FAIL} & \text{if } p95_{\text{MCP\_HTTP}} > 1.25 \times p95_{\text{baseline}} \text{ (25\% regression)} \\ \text{FAIL} & \text{if } \text{Error Rate} > 0.0\% \\ \text{PASS} & \text{otherwise} \end{cases}$$

---

## 10. Benchmark Harness Architecture (`scripts/benchmark-mcp.js`)

### 10.1 Harness Design Requirements
1. **Non-Destructive**: Operates with temporary synthetic candidate personas; causes zero persistent database pollution.
2. **Machine-Readable Telemetry**: Outputs structured JSON artifacts (`docs/mcp-performance-baseline.json`) and formatted terminal tables.
3. **Database Lifecycle Compliance**: Complies with ADR-048; guarantees full pool draining and clean teardown passing `npm run test:db-lifecycle-check`.
4. **Zero Secret Leakage**: Sanitizes all candidate data and tokens from benchmark logs.

### 10.2 JSON Telemetry Output Schema
```json
{
  "timestamp": "2026-08-24T22:30:00.000Z",
  "environment": "local-node22-aiven-pg",
  "concurrency": 1,
  "iterations": 100,
  "targetBoundary": "MCP_HTTP",
  "results": [
    {
      "tool": "get_candidate_profile",
      "category": "READ_FAST",
      "p50Ms": 42.1,
      "p95Ms": 115.4,
      "p99Ms": 148.2,
      "minMs": 35.0,
      "maxMs": 182.0,
      "meanMs": 48.6,
      "stdDevMs": 14.2,
      "errorRate": 0.0,
      "status": "PASS"
    }
  ]
}
```

---

## 11. Security, Isolation & Audit Invariants

Performance benchmarking must strictly adhere to the project's security constraints:
1. **Tenant Isolation**: Benchmarking requests must include valid `mcp_token_*` credentials; cross-tenant queries must return `404 NOT_FOUND`.
2. **Audit Logging Integrity**: Audit logging (`src/services/mcp-audit.service.js`) must remain active during benchmarks to measure real-world asynchronous logging overhead.
3. **Secret Scrubbing**: `SecretScrubber` must execute on all tool payloads to capture true production serialization cost.

---

## 12. Deliverables Planned for Task P8-006

1. **Benchmark Runner Script**: `scripts/benchmark-mcp.js` (configurable iterations, concurrency, and tool filtering).
2. **Deterministic Benchmark Test**: `tests/unit/mcp-latency-benchmark.test.js` (validates statistical math and regression gates).
3. **Performance Baseline Artifact**: `docs/mcp-performance-baseline.md` (capturing initial $p50$, $p95$, $p99$ baselines across all 7 tools).
4. **Golden Path End-to-End Benchmark**: Controlled live verification of Gemini reasoning and tool latency.

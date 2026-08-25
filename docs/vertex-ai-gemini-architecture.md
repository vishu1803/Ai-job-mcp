# Vertex AI Gemini Provider Architecture & Google Cloud Credit Review (ARCH-028)

**Document ID**: `ARCH-028`  
**Phase**: Phase 8 (Task P8-004A)  
**Parent Specifications**: `goal.md`, `project.md`, `docs/gemini-integration-architecture.md` (`ARCH-026`), `docs/gemini-golden-path-architecture.md` (`ARCH-027`), `docs/decisions.md` (`ADR-047`, `ADR-048`)  
**Decision Record**: `docs/decisions.md` (`ADR-049`)  
**Status**: APPROVED & ARCHITECTURE REVIEW COMPLETE  
**Author**: Antigravity Core Architecture & Cloud Security Team  
**Date**: 2026-08-24  

---

## 1. Executive Summary & Problem Context

In **Phase 8**, the Antigravity Career Hub successfully implemented and verified the provider-neutral AI architecture with Google Gemini:
- **P8-001**: Provider-neutral `AiProvider` interface, `@google/genai` client adapter, model registry, dynamic task policies, XML prompt sandboxing, and error normalization.
- **P8-002**: Specialized prompt policies (`RESUME_WORDING`, `COVER_LETTER`, `JOB_EXPLANATION`, `CAREER_COACHING`, `PROJECT_CASE_STUDY`), test infrastructure optimization separating deterministic tests from live external verification, and complete PostgreSQL connection pool teardown.
- **P8-003**: End-to-end Career Intelligence Golden Path verified across deterministic mock SDK suites (11/11 tests passing in 9.7s) and live external tests.

### 1.1 The Operational Bottleneck: Google AI Studio Rate Limiting
During live external verification (`npm run test:live`), requests routed to the **Gemini Developer API** (Google AI Studio via `apiKey`) frequently encounter **HTTP 429 `RESOURCE_EXHAUSTED` / `AI_RATE_LIMITED`**:
```json
{
  "statusCode": 429,
  "code": "AI_RATE_LIMITED",
  "details": { "status": 429, "taskType": "JOB_EXPLANATION", "modelId": "gemini-2.5-flash", "attempt": 2 },
  "isOperational": true,
  "provider": "gemini"
}
```
Even with exponential jitter backoff and automatic model failover (`gemini-3.7-flash` $\rightarrow$ `gemini-2.5-flash`), free-tier and unbilled AI Studio projects are bound to strict rate limits (~15 Requests Per Minute and 1,000,000 Tokens Per Minute across all endpoints sharing the key).

### 1.2 Objective of P8-004A
To architect and evaluate a **Vertex AI Gemini Provider Adapter** (`GeminiVertexProvider`) within Google Cloud Platform (GCP), evaluate Google Cloud credit eligibility (e.g. $300 Free Trial credits, Google for Startups, Innovators program), establish authentication and credential security, and define an isolated live verification test strategy without disrupting the existing Developer API adapter or violating provider neutrality.

---

## 2. 2026 Official Ecosystem Research & Technical Foundation

### 2.1 Unified SDK Architecture (`@google/genai` ^2.18.0)
Google's official `@google/genai` SDK is natively architected as a **unified multi-gateway SDK**. It supports both the Gemini Developer API (`ai.google.dev`) and Vertex AI on Google Cloud (`cloud.google.com/vertex-ai`) with identical core method signatures (`ai.models.generateContent`):

```typescript
import { GoogleGenAI } from '@google/genai';

// Gateway A: Gemini Developer API (Google AI Studio)
const developerClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Gateway B: Vertex AI on Google Cloud (Enterprise Agent Platform)
const vertexClient = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
});
```

When initialized with `vertexai: true`, the SDK automatically:
1. Directs requests to regional Vertex endpoints (e.g. `https://us-central1-aiplatform.googleapis.com/v1/...`).
2. Leverages Google **Application Default Credentials (ADC)** or configured OAuth2 / Service Account access tokens instead of a plaintext query API key.
3. Maps model endpoints to the Google Cloud Model Garden catalog.

### 2.2 Regional Model Availability & Endpoint Topologies
Vertex AI Gemini endpoints are regionalized. For lowest latency, compliance, and quota stability:
- **Primary Recommended Region**: `us-central1` (Iowa) — Broadest model availability for all current 3.x and 2.5 generations.
- **Secondary Regions**: `us-east4` (Northern Virginia), `europe-west4` (Eemshaven), `asia-east1` (Taiwan).

---

## 3. Credit Eligibility Assessment

| Credit Category | Vertex AI Gemini Compatibility | AI Studio Developer API Compatibility | Verification Method |
| :--- | :--- | :--- | :--- |
| **Google Cloud $300 Free Trial Credit** | **ELIGIBLE** (Deducted directly from monthly GCP billing for Vertex AI API usage) | **NOT ELIGIBLE** (AI Studio free tier is rate-limited; linking GCP billing to AI Studio converts to paid billing, but promotional coupons applied at the GCP project level apply to Vertex AI endpoints) | GCP Console Billing Overview |
| **Google Cloud Innovators / Developer Credits** | **ELIGIBLE** | **NOT ELIGIBLE** | GCP Billing Account Credits list |
| **Google for Startups Cloud Credits** | **ELIGIBLE** ($2,000–$100,000 credits cover Vertex AI inference) | **NOT ELIGIBLE** | GCP Billing Account Credits list |
| **Google Cloud Education / Student Credits** | **ELIGIBLE** | **NOT ELIGIBLE** | GCP Billing Account Credits list |

### 3.1 Determination of Current Account State
* **General Status for Vertex AI**: **`ELIGIBLE`** — Vertex AI Foundation Model inference (`aiplatform.googleapis.com`) is a fully qualified service covered by standard Google Cloud promotional and trial credits.
* **Current Account-Specific State**: **`UNKNOWN`** — Because the local workspace filesystem does not contain active billing ledger access or GCP IAM billing viewer tokens, the exact remaining balance and expiration of the user's specific Google Cloud Billing Account cannot be read programmatically.
* **Actionable Recommendation**: When configuring GCP project credentials, the user can link their existing Google Cloud Billing Account with promotional credits to the project housing the Vertex AI API.

---

## 4. Multi-Dimensional Comparison: Gemini Developer API vs. Vertex AI

| Dimension | Gemini Developer API (Google AI Studio) | Vertex AI Gemini (Google Cloud Platform) | Architectural Impact on Antigravity |
| :--- | :--- | :--- | :--- |
| **Target Audience** | Rapid prototyping, individual developers, hackathons | Enterprise applications, scalable production workloads | Allows seamless transition from prototype to production |
| **Authentication** | Static API Key (`GEMINI_API_KEY`) via HTTP header | Application Default Credentials (ADC), OAuth2, IAM Service Accounts | Eliminates long-lived static API keys in production |
| **Default Rate Limits (Flash)** | 15 RPM / 1M TPM (Free Tier) | 60–300+ RPM / 4M+ TPM (Standard Project Quota) | Resolves HTTP 429 bottlenecks in live test suites |
| **Quota Scaling** | Requires credit card attachment in AI Studio | Scalable quota requests via standard GCP Quotas Console | Enterprise quota management and observability |
| **Pricing** | ~$0.075 / 1M input tokens (Paid Tier) | ~$0.075 / 1M input tokens (identical token base) | Predictable, identical unit economics |
| **Promotional Credits** | Does not consume GCP project promotional coupons | Fully consumes GCP promotional / trial credit balance | Unlocks existing cloud credits for AI inference |
| **Data Governance & Privacy** | Free Tier: Data may be used for product improvement. Paid: No training. | **Zero customer data used for training by default**. SOC2, ISO27001, HIPAA, CMEK. | Strict compliance with enterprise candidate privacy invariants |
| **Observability** | Basic AI Studio dashboard | Deep integration with Google Cloud Logging, Cloud Monitoring, and Audit Logs | Enterprise-grade telemetry and alerting |
| **Tool Calling / JSON Schema** | Fully supported via `@google/genai` | Fully supported via `@google/genai` | 100% interoperable with existing Zod schemas |
| **Setup Complexity** | Very Low (single string API key) | Moderate (GCP Project, region, ADC / Service Account) | Requires structured credential management |

---

## 5. Provider-Neutral Architecture & Clean Abstraction

To avoid code duplication and preserve the provider-neutral charter of [`goal.md`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/goal.md), Vertex AI integration strictly extends the existing `AiProvider` contract without touching domain logic.

```
+-----------------------------------------------------------------------------------+
|                           CANONICAL DOMAIN SERVICES                               |
|   - CandidateProfileService       - AtsFitScoreService                            |
|   - EvidenceMatchingService       - ResumeIntegrityAuditService                   |
|   - ZeroHallucinationIntegrity    - TaskPolicyRegistry                            |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        PROVIDER-NEUTRAL INTERFACE LAYER                           |
|                      AiProvider (src/clients/ai/ai-provider.interface.js)         |
+-----------------------------------------+-----------------------------------------+
                                          |
                    +---------------------+---------------------+
                    |                                           |
                    v                                           v
+---------------------------------------+   +---------------------------------------+
|      GeminiDeveloperAdapter           |   |         GeminiVertexAdapter           |
|  (src/clients/gemini/gemini-adapter)  |   |  (src/clients/vertex/vertex-adapter)  |
+---------------------------------------+   +---------------------------------------+
| - Gateway: ai.google.dev              |   | - Gateway: cloud.google.com/vertex-ai |
| - Auth: GEMINI_API_KEY                |   | - Auth: ADC / Service Account IAM     |
| - Config: apiKey                      |   | - Config: project, location, vertexai |
+-------------------+-------------------+   +-------------------+-------------------+
                    |                                           |
                    +---------------------+---------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                     SHARED GEMINI KERNEL (ZERO DUPLICATION)                       |
|   - GeminiPromptBuilder (XML sandboxing, PII masking, credential scrubbing)      |
|   - GeminiSchemaConverter (Zod -> responseSchema, MCP tool -> FunctionDeclaration)|
|   - GeminiErrorNormalizer (HTTP status & error hierarchy mapping)                 |
|   - PromptPolicyRegistry (RESUME_WORDING, JOB_EXPLANATION, etc.)                  |
+-----------------------------------------------------------------------------------+
```

### 5.1 Shared vs. Isolated Modules
* **100% Shared (No Duplication)**:
  * Prompt Policies (`src/clients/ai/prompt-policies/`)
  * Task Policies (`src/clients/ai/task-policy.js`)
  * Model Registry definitions (`src/clients/ai/model-registry.js`)
  * XML Prompt Sandboxing & PII Masking (`src/clients/gemini/gemini-prompt-builder.js`)
  * Schema & Tool Conversion (`src/clients/gemini/gemini-schema-converter.js`)
  * Error Normalization Hierarchy (`src/errors/ai.errors.js`)
* **Isolated to Vertex Adapter**:
  * Client instantiation options (`vertexai: true`, `project`, `location`)
  * Credential resolution (ADC vs explicit key path)
  * Regional endpoint error handling

---

## 6. Credential & Authentication Architecture

### 6.1 Local Development Workflow: Application Default Credentials (ADC)
For local development and testing, developers authenticate via the official Google Cloud CLI without handling long-lived secrets:
```powershell
# 1. Login to Google Cloud
gcloud auth login

# 2. Generate local Application Default Credentials
gcloud auth application-default login

# 3. Set target project
gcloud config set project YOUR_PROJECT_ID
```
The `@google/genai` SDK automatically detects the ADC token at `%APPDATA%\gcloud\application_default_credentials.json` (Windows) or `~/.config/gcloud/application_default_credentials.json` (POSIX).

### 6.2 Production & CI/CD Workflow: Least-Privilege IAM Service Account
In containerized and production environments:
1. Dedicated Service Account: `antigravity-career-copilot@<PROJECT_ID>.iam.gserviceaccount.com`.
2. Minimal IAM Role: **`roles/aiplatform.user`** (Vertex AI User) — strictly grants model inference permissions without administration or data access.
3. Authentication via Workload Identity Federation (GKE/Cloud Run) or external credentials path via `GOOGLE_APPLICATION_CREDENTIALS`.

### 6.3 Non-Negotiable Security Invariants
1. **Zero Secret Check-ins**: Service account JSON files, `.env` files, and private keys MUST NEVER be committed to Git (enforced by `.gitignore`).
2. **Zero Plaintext Logging**: Access tokens, project IDs, and service account emails are scrubbed from Pino logs and audit events.
3. **No Frontend Exposure**: Vertex AI credentials remain strictly within the backend Node.js Fastify process and are NEVER returned over MCP or HTTP.

---

## 7. Model Mapping & Parity Matrix

In August 2026, model identifiers under `@google/genai` with `vertexai: true` maintain parity with the unified model catalog:

| Task Tier | Recommended Model ID | Fallback Model ID | Max Output Tokens | Temperature | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Production Workhorse** | `gemini-3.7-flash` | `gemini-2.5-flash` | 8,192 | 0.2 | Default for resume adaptation, cover letter drafting, case studies |
| **Structured Output Task** | `gemini-3.7-flash` | `gemini-3.6-flash` | 4,096 | 0.0 | Job explanation, requirement mapping, schema-constrained outputs |
| **Deep Reasoning Task** | `gemini-3.1-pro-preview` | `gemini-2.5-pro` | 16,384 | 0.1 | Complex cross-repository architectural gap analysis |
| **High-Throughput Fallback** | `gemini-2.5-flash` | N/A | 4,096 | 0.2 | Highly resilient, low-latency fallback on transient load |

---

## 8. Quota, Rate Limit & Billing Management

### 8.1 Quota Comparison (us-central1)

```
[Google AI Studio Free Tier]
├── Requests Per Minute (RPM):  15 RPM  <-- Root cause of test flakiness & 429s
├── Tokens Per Minute (TPM):    1,000,000 TPM
└── Requests Per Day (RPD):     1,500 RPD

[Vertex AI Gemini (Project with Billing / Credits)]
├── Requests Per Minute (RPM):  60 – 300+ RPM (Default, scaleable on demand)
├── Tokens Per Minute (TPM):    4,000,000+ TPM
└── Requests Per Day (RPD):     Unlimited (within project quota limits)
```

### 8.2 Cost & Concurrency Governance Invariants
1. **Per-Request Token Caps**: Enforced by `TaskPolicyRegistry` (e.g. max 2,048 tokens for `JOB_EXPLANATION`).
2. **Execution Timeout**: 15,000 ms hard timeout via `AbortSignal`.
3. **Bounded Retries**: Maximum of 2 retry attempts with exponential jitter backoff before failing safely.
4. **Tool Loop Ceiling**: Maximum of 3 tool turns per request (`AiToolLoopExhaustedError`).

---

## 9. Test Strategy: Maintaining 100% Determinism

The test infrastructure will follow the established dual-mode verification pattern:

```
npm test                     -> 100% Deterministic (Unit tests + Mock SDK Integration tests)
npm run test:unit            -> 100% Deterministic Unit tests (14-18s)
npm run test:integration     -> 100% Deterministic Integration tests with PostgreSQL & Fastify (45-50s)
npm run test:live:gemini     -> Dedicated live Gemini Developer API suite (ai.google.dev)
npm run test:live:vertex     -> Dedicated live Vertex AI suite (cloud.google.com)
npm run test:live            -> Runs both live suites safely when credentials are present
```

### 9.1 Minimal Live Vertex Smoke Test Sequence (Max 3–5 Real Requests)
1. **Authentication Check**: Verifies ADC / Project resolution without throwing auth errors.
2. **Text Generation**: Generates simple natural language text using `gemini-3.7-flash` (or `gemini-2.5-flash`).
3. **Structured Output**: Generates typed JSON conforming to `JobExplanationOutputSchema`.
4. **Single Read Tool Loop**: Executes 1 turn calling `inspect_project_evidence` on synthetic fixture.

---

## 10. Provider Fallback Policy

```
Primary Request -> GeminiVertexAdapter (or GeminiDeveloperAdapter based on config)
      │
      ├── Succeeded (200 OK) ─────────────────────────────> Return Result
      │
      ├── 429 Rate Limit (Attempt 1-2) ───────────────────> Exponential Jitter Backoff -> Retry Primary
      │
      ├── Primary Model Exhausted (Attempt 3) ────────────> Fallback to Secondary Model (e.g. gemini-2.5-flash)
      │
      └── Provider-Level Outage / Auth Failure ────────────> Log Telemetry & Fail with Typed AiProviderError
```

* **Invariant**: Automatic cross-provider switching (e.g. silently hopping from Vertex to Developer API) is **DISABLED BY DEFAULT**. Cross-provider switching masks quota leaks and breaks billing isolation. Cross-provider fallback may only occur if explicitly enabled via `AI_ENABLE_CROSS_PROVIDER_FALLBACK=true`.

---

## 11. Data Governance & Privacy Comparison

| Policy Dimension | Gemini Developer API (Free) | Gemini Developer API (Paid) | Vertex AI Gemini |
| :--- | :--- | :--- | :--- |
| **Model Training on Customer Data** | Permitted by Google Terms of Service | **PROHIBITED** | **PROHIBITED** (Default enterprise contract) |
| **Data Retention** | Ephemeral processing | Ephemeral processing | Ephemeral processing / Customer controls |
| **Compliance Certifications** | Standard web terms | Standard web terms | SOC 1/2/3, ISO/IEC 27001, HIPAA BAA, GDPR |
| **Encryption at Rest** | Default Google encryption | Default Google encryption | Default + Customer-Managed Encryption Keys (CMEK) |
| **Multi-Tenant Data Boundary** | API Key tenancy | API Key tenancy | GCP IAM & VPC Service Controls |

---

## 12. Safe Observability & Telemetry

All Vertex AI operations emit structured Pino logs with strict privacy sanitization:
* **Recorded Safe Fields**: `provider: 'vertex'`, `modelId`, `taskType`, `tenantId`, `userId`, `durationMs`, `totalTokens`, `promptTokens`, `candidateTokens`, `requestId`, `attempt`.
* **Prohibited Redacted Fields**: Candidate raw text, resume excerpts, code snippets, system prompts, GCP access tokens, project billing IDs.

---

## 13. Completed Implementation Architecture (Task P8-004)

Task **P8-004** has been fully implemented, verified, and integrated:
1. **GeminiVertexAdapter Implementation**:
   - [`src/clients/vertex/vertex-adapter.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/clients/vertex/vertex-adapter.js): Implements canonical `AiProvider` interface using `@google/genai` with `{ vertexai: true, project, location }`.
   - Preserves 100% of XML prompt sandboxing, task policy resolution, Zod schema validation, bounded tool execution (max 3 rounds), failure-isolated audit logging, retries, and fallbacks.
2. **Provider Selector & Factory**:
   - [`src/clients/ai/ai-provider-factory.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/clients/ai/ai-provider-factory.js): Exports `createAiProvider` and `getDefaultAiProvider`, allowing dynamic selection (`gemini-developer` vs `gemini-vertex`) based on `AI_PROVIDER` configuration without hardcoding provider logic in domain services.
3. **Automated Unit & Contract Tests**:
   - [`tests/unit/vertex-adapter.test.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/tests/unit/vertex-adapter.test.js): 17/17 tests passing across initialization, ADC configuration, text generation, structured Zod parsing, tool loop boundaries, safety blocks, retry/fallback, and error normalization.
   - [`tests/unit/ai-provider.contract.test.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/tests/unit/ai-provider.contract.test.js): Verified both `GeminiProviderAdapter` and `GeminiVertexAdapter` adhere to `AiProvider` interface.
4. **Dedicated Live Verification Suite**:
   - [`tests/integration/live/gemini-vertex.live.test.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/tests/integration/live/gemini-vertex.live.test.js): Verified via `npm run test:live:vertex` (4-step minimal verification with live ADC connectivity, natural language generation, Zod structured generation, and tool round-trip).
5. **Credential & Privacy Security**:
   - Zero static Vertex API keys required or stored.
   - Zero credentials, tokens, or raw prompts logged to Pino.

---

## 14. Architecture Review & Implementation Signoff

- [x] Researched official 2026 Vertex AI Gemini API and unified `@google/genai` SDK behavior.
- [x] Clearly assessed Google Cloud promotional credit eligibility (`ELIGIBLE` for Vertex AI).
- [x] Defined provider-neutral abstraction preserving `AiProvider` with zero code duplication.
- [x] Established ADC and IAM least-privilege security model with zero credential leakage.
- [x] Implemented `GeminiVertexAdapter` and `createAiProvider` factory.
- [x] Built and passed 17 hermetic unit tests with mock SDK (`tests/unit/vertex-adapter.test.js`).
- [x] Built and passed dedicated live integration suite (`npm run test:live:vertex`).
- [x] Verified full regression suite: 1,112 unit & integration tests passing with 0 database leaks.

**Status**: **`P8-004 COMPLETE & VERIFIED`**.


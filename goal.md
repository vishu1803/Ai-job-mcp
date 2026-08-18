# Goal: Universal AI Career MCP Platform

## 1. Project Name
**Antigravity Career Hub** (Universal AI Career MCP Platform)

---

## 2. One-Sentence Mission
To empower professionals and job seekers with a provider-neutral, evidence-backed AI career copilot that connects directly to their real-world code repositories and professional resources through the Model Context Protocol (MCP), ensuring verifiable claims, human-in-the-loop safety, and interoperability across major AI clients.

---

## 3. Problem Being Solved
1. **Resume Hallucination & Exaggeration**: Traditional generative AI tools routinely hallucinate skills, invent accomplishments, or generate generic boilerplate that cannot be substantiated during technical interviews or background checks.
2. **Disconnected Evidence**: A candidate's actual proof of competence (code commits, architecture, test suites, pull requests, technical documentation) lives in isolated repositories (GitHub, GitLab) and cloud drives (Google Drive, OneDrive, Notion) completely detached from their job applications and resumes.
3. **Walled Gardens and Client Lock-In**: Existing AI career tools are locked into proprietary web interfaces or single AI providers. Users lose their career history, context, and custom instructions if they switch between Google Gemini, Anthropic Claude, OpenAI ChatGPT, or local models.
4. **Keyword Stuffing vs. Legitimate Capability**: ATS optimization tools encourage blind keyword stuffing. What candidates actually need is actionable, legitimate guidance to enhance their real projects to demonstrate missing requirements.
5. **Security and Multi-Tenant Token Exposure**: Existing MCP proof-of-concepts often run with single hard-coded developer tokens on `localhost` via `stdio`, lacking multi-tenant isolation, granular permission scoping, or end-user consent mechanisms for consequential actions.

---

## 4. Long-Term Vision
The Universal AI Career Platform will serve as the decentralized, user-sovereign intelligence backbone for lifelong career progression. Any professional can create an account, securely connect their personal or enterprise resources with granular read/write permissions, and connect any MCP-compliant AI assistant (Gemini, Claude, ChatGPT, Cursor, local LLMs) as their career advisor.

The platform continuously maintains a verifiable, evidence-backed profile of the user's authentic technical capabilities, dynamically adapts resumes and portfolios to target roles without fabricating claims, and guides safe, user-approved project enhancements through automated branches and pull requests.

```
+-----------------------------------------------------------------------------------+
|                                  USER RESOURCES                                   |
|   [GitHub Repos]  [GitLab]  [Google Drive]  [OneDrive]  [Notion]  [Uploaded Docs] |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                         1. RESOURCE CONNECTOR LAYER                               |
|   - Provider-neutral connector abstraction                                        |
|   - Multi-tenant credential isolation (AES-256-GCM)                               |
|   - GitHub App (Fine-grained permissions, short-lived tokens)                     |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                       2. UNIFIED CANDIDATE DATA MODEL                             |
|   - Skills with mandatory Provenance & Evidence Links                             |
|   - Profile, Experience, Education, Projects, Artifacts                           |
|   - Zero-Hallucination Integrity Gates                                            |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        3. CAREER INTELLIGENCE LAYER                               |
|   - Job requirement parser & skill normalization                                  |
|   - Evidence-to-requirement mapping & gap analysis                                |
|   - Verifiable resume/cover letter adaptation                                     |
|   - Project improvement recommender                                               |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                           4. ACTION & SAFETY LAYER                                |
|   - Human-in-the-loop authorization gates                                         |
|   - Branch -> Commit -> Test -> PR workflow                                       |
|   - Audit logging & non-destructive sandboxing                                    |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                         5. REMOTE MCP INTERFACE LAYER                             |
|   - Streamable HTTP (2026 MCP Spec) + SSE Fallback                                |
|   - Multi-tenant OAuth 2.1 / Bearer Authentication                                |
|   - Granular Tool Scoping & Origin Verification                                   |
+-------------------+---------------------+---------------------+-------------------+
                    |                     |                     |
                    v                     v                     v
         +--------------------+  +------------------+  +-------------------+
         | Google Gemini      |  | Anthropic Claude |  | OpenAI ChatGPT    |
         | (First Target)     |  | (Second Target)  |  | (Third Target)    |
         +--------------------+  +------------------+  +-------------------+
```

---

## 5. Core Principles

1. **Provider Neutrality**: The core platform, candidate model, career intelligence engine, and database MUST NEVER depend on Gemini-specific, Claude-specific, or ChatGPT-specific logic. The AI client is strictly an interchangeable interface interacting via standard MCP.
2. **Radical Evidence Provenance**: Every skill, experience claim, project highlight, or metric generated by the platform must be tied to verified evidence (file path, commit hash, README, repository metadata, or verified document). If evidence does not exist, the platform marks the claim as "unsubstantiated" or "candidate-claimed without evidence."
3. **Zero Fabrication**: The system must never fabricate professional experience, employment dates, certifications, degrees, projects, or technical competencies.
4. **Human-in-the-Loop Safety**: Consequential external operations (e.g., creating branches, pushing code, opening pull requests, submitting applications, modifying live portfolios) REQUIRE explicit, interactive human confirmation and review.
5. **Multi-Tenant Cryptographic Isolation**: No user data, GitHub installation token, OAuth token, or candidate profile shall ever be visible or accessible to another user. All third-party secrets are encrypted at rest using authenticated encryption (AES-256-GCM).
6. **Least Privilege by Design**: Connections to external providers request only the minimum scopes necessary. For GitHub, repository-level selection and read-only access are default. Write access is only requested when active workflows demand it.
7. **Transparent User Control**: Users retain full sovereignty over their data, including the right to inspect all indexed metadata, disconnect integrations, revoke tokens, and execute hard data deletion (GDPR/CCPA compliant).

---

## 6. Target Users
1. **Software Engineers & Developers**: Want to showcase their GitHub/GitLab codebases legitimately, tailor their resumes to job descriptions based on their actual code, and receive suggestions for project enhancements.
2. **Technical Job Seekers & Career Switchers**: Need objective gap analysis between target job descriptions and their existing portfolio, highlighting exactly what skills they have proven and what they need to build.
3. **Computer Science Students & New Grads**: Want to turn academic assignments, hackathon projects, and personal repositories into structured, evidence-backed resumes without exaggerating experience.
4. **Engineering Managers & Technical Consultants**: Want to maintain an active, accurate inventory of their technical skills, repositories, and publications across multiple clients or roles.

---

## 7. Primary Use Cases

### A. Candidate Capability & Evidence Discovery
* "What skills and technologies can you prove from my connected GitHub repositories?"
* "Which of my projects demonstrate experience with distributed systems and async queues?"
* "Summarize my backend engineering experience using only verified commits and projects."

### B. Job Requirement & Gap Analysis
* "Analyze this job description against my profile: what are the hard requirements, what do I satisfy, and what is missing?"
* "Do I have verifiable evidence for the required experience with PostgreSQL indexing and Redis caching?"
* "Generate a readiness score explaining the match breakdown with citations to my repositories."

### C. Evidence-Backed Application Artifacts
* "Generate a tailored resume for this Backend Engineer role using only projects where I wrote backend code."
* "Draft a cover letter explaining how my work in `repo-x` directly addresses their requirement for event-driven pipelines."
* "Select the top 3 repositories that should be featured on my public portfolio for a DevOps role."

### D. Legitimate Project Adaptation & Enhancement
* "The job requires FastAPI and Docker, but my project `weather-app` only uses Flask. Suggest legitimate architectural additions to implement FastAPI and Dockerize the app."
* "Create a branch `feat/fastapi-migration` on `weather-app`, add the suggested API router and Dockerfile, run the test suite, and open a draft pull request for my review."

### E. Application & Career Tracking
* "Record that I applied for the Staff Engineer role at Acme Corp today with resume version v2.4."
* "Show the status and timeline of all my active job applications."

---

## 8. Non-Goals

1. **Automated "Spam" Applications**: The platform will NOT build automated bot submitters that apply to hundreds of job listings indiscriminately without human review.
2. **Resume Embellishment & Fabrication**: The platform will NOT generate false credentials, exaggerate years of experience, or invent fake projects.
3. **Autonomous Silent Commits**: The platform will NEVER push commits directly to a user's `main` or `master` branch, nor merge pull requests autonomously.
4. **Monolithic AI Dependency**: The platform will NOT be built as a single prompt inside Google AI Studio, a ChatGPT Custom GPT, or a Claude Project artifact that cannot be decoupled from that specific vendor.
5. **Premature Distributed Microservices**: The platform will NOT be split into dozens of microservices before traffic and organizational scale necessitate it. A modular monolith with clean domain boundaries is the target architecture.

---

## 9. Provider-Neutral Architecture Principle
The architecture strictly enforces a 5-tier separation of concerns:

```
+--------------------------------------------------------------------------+
| Tier 1: Resource/Data Layer                                              |
| Abstract connector interface; OAuth token management; raw metadata fetch.|
+--------------------------------------------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------+
| Tier 2: Candidate & Career Intelligence Layer                            |
| Schema-validated candidate model; skill extraction; evidence linking;    |
| job requirement parsing; ATS scoring; project recommendation engine.     |
+--------------------------------------------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------+
| Tier 3: Action & Workflow Services Layer                                 |
| Safe Git operations; branch creation; patch generation; test execution;  |
| pull request drafting; approval workflow state machines.                 |
+--------------------------------------------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------+
| Tier 4: MCP Interface Layer                                              |
| Standard JSON-RPC 2.0; Streamable HTTP transport; per-user auth;         |
| tool definitions; resource providers; prompt templates.                  |
+--------------------------------------------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------+
| Tier 5: AI Client Layer (Consumer)                                       |
| Google Gemini, Anthropic Claude, OpenAI ChatGPT, Cursor, local agents.   |
+--------------------------------------------------------------------------+
```

No business logic, candidate scoring rules, or Git operations live inside the MCP tool wrappers or prompt templates. The MCP layer is purely an interoperability gateway exposing core service capabilities.

---

## 10. Resource Connector Principle
All external data sources implement the standard `ResourceConnector` interface:

* **Identity & Metadata**: Unique connector ID, user ID, provider type (`github`, `gitlab`, `gdrive`, `notion`, `local_doc`).
* **Capability Flags**: `canRead`, `canWrite`, `canSearch`, `supportsWebhooks`, `supportsStreaming`.
* **Authorization State**: Connection status (`active`, `expired`, `revoked`, `error`), scopes granted, expiration timestamp.
* **Resource Discovery**: Methods to list workspaces, repositories, files, and metadata.
* **Read Operations**: Structured extraction of documents, source code, commits, and schemas.
* **Write Operations (Optional)**: Sandboxed creation of branches, files, and pull requests.
* **Lifecycle Management**: Health check, token refresh, disconnect, and total data purge.

Adding a new connector (e.g., GitLab or Google Drive) requires ONLY implementing this interface and registering it with the connector registry. The career intelligence engine and MCP tools automatically consume the normalized resources.

---

## 11. Security Principles

1. **Zero Global/Shared Tokens**: Every external credential belongs strictly to a specific tenant/user.
2. **Authenticated Encryption at Rest**: All stored access tokens, refresh tokens, and webhook secrets are encrypted with AES-256-GCM using unique per-record initialization vectors (IV) and HMAC authentication tags.
3. **Short-Lived Installation Access Tokens**: For GitHub App integrations, server-to-server installation tokens expire in 1 hour; user-to-server tokens expire in 8 hours with refresh token rotation.
4. **OAuth 2.1 with PKCE**: All user-facing OAuth flows enforce Authorization Code Flow with PKCE (Proof Key for Code Exchange) and state parameter validation to prevent CSRF.
5. **Origin & Header Validation**: The remote MCP server validates `Origin`, `Authorization`, and `Mcp-Method` headers on all incoming Streamable HTTP requests.
6. **Strict Output Sanitization**: Candidate data and repository contents are sanitized before passing to AI clients to prevent prompt injection and token exfiltration.
7. **Comprehensive Audit Trails**: All read operations on user repositories and all write proposals/executions are logged in an immutable database audit log.

---

## 12. AI Truthfulness & Evidence Principle
The system enforces strict veracity rules:

* **Verified Evidence**: Derived directly from verified resources (e.g., "Contains 12 commits touching TypeScript in repository `acme/backend`").
* **Candidate Claim**: Stated by the user in an uploaded resume or bio, but without linked repository code. Marked clearly as `[Unverified User Claim]`.
* **Inferred Capability**: Suggested by career intelligence based on surrounding technologies (e.g., knowing React implies familiarity with HTML/JavaScript). Marked clearly as `[Inferred]`.
* **Zero Fabrication Guarantee**: The AI is instructed via MCP system prompt constraints and deterministic validation to reject generating resume bullets that have no corresponding Evidence ID in the candidate model.

---

## 13. Human Approval Principle
Consequential actions operate on a two-phase commit pattern:

1. **Phase 1: Propose & Preview**: The AI client calls a tool (e.g., `propose_project_adaptation`). The platform generates a diff, explains the rationale, and returns an `ApprovalRequestId` and a structured preview to the user.
2. **Phase 2: Explicit Confirmation**: The action is NEVER executed until the user explicitly calls `confirm_action(approvalRequestId)` or approves it via the platform UI.
3. **Automatic Expiration**: Approval requests expire after 15 minutes if not confirmed.

---

## 14. MVP Definition

The MVP proves the complete end-to-end "Golden Path" with zero fluff:

1. **User Authentication**: A user signs up/logs in via secure authentication.
2. **GitHub App Connection**: User installs the GitHub App and selects 1 or more specific repositories.
3. **Evidence Ingestion**: Platform reads repository metadata, languages, READMEs, file trees, and recent commits.
4. **Candidate Model Creation**: Platform builds a structured profile with verified skill evidence links.
5. **Job Description Analysis**: User inputs a job description; platform extracts hard/soft requirements.
6. **Evidence Matching & Gap Scoring**: Platform maps candidate evidence to job requirements and outputs match percentages and missing skills.
7. **Remote MCP Server**: MCP server runs over Streamable HTTP with per-user authentication.
8. **Gemini Client Integration**: Google Gemini connects to the remote MCP server and executes career analysis and evidence queries.
9. **Multi-Tenant Isolation Verification**: Automated tests verify that User A cannot read or analyze User B's repositories or candidate profile.

---

## 15. Long-Term Product Definition
The mature platform will include:
* Multi-connector ecosystem: GitHub, GitLab, Google Drive, Notion, LinkedIn exports, and PDF parsing.
* Dynamic portfolio generation with automated hosting (e.g., GitHub Pages or Vercel).
* Full interactive project adaptation with automated test verification and PR creation.
* Multi-client support: Google Gemini, Anthropic Claude, OpenAI ChatGPT, Cursor, and CLI agents.
* Comprehensive job search tracker with ATS response monitoring and application analytics.
* Community-contributed project templates for filling specific technical skill gaps.

---

## 16. Success Criteria
* **Accuracy**: 100% of resume bullets and portfolio claims generated by the system contain valid Evidence IDs linking to real user resources.
* **Security**: 0 cross-tenant data leaks; 0 exposed plaintext tokens in logs or database; 100% of webhook events verified with HMAC-SHA256 signatures.
* **Interoperability**: Identical MCP tool responses work seamlessly across Gemini, Claude, and ChatGPT without backend modifications.
* **Latency**: MCP tool execution latency under 1.5 seconds for cached candidate queries; under 4.0 seconds for live repository indexing.
* **Reliability**: 99.9% uptime on remote MCP HTTP endpoints.

---

## 17. Major Technical Constraints

1. **Language Choice**: Node.js (v20+ LTS) using ECMAScript Modules (ESM) and JavaScript with JSDoc and Zod schema validation. (No unnecessary compilation overhead, aligned with user preference).
2. **MCP Specification Alignment**: Built against the official Model Context Protocol 2026 specification (`Streamable HTTP` transport as primary, stateless architecture, header-based routing).
3. **GitHub API Rate Limits**: GitHub App installation tokens provide 5,000 requests/hour per installation. Ingestion must implement caching, conditional HTTP requests (`ETag` / `If-None-Match`), and selective shallow queries.
4. **Stateless Scale**: The backend server must remain stateless, storing session and token data in PostgreSQL/Redis to enable zero-downtime horizontal scaling.

---

## 18. Current Verified Ecosystem Facts (As of August 2026)

| Ecosystem Area | Verified Official Fact | Source Citation |
| :--- | :--- | :--- |
| **Model Context Protocol** | Specification version 2026-07-28 established stateless Streamable HTTP as the standard remote transport; legacy HTTP+SSE is deprecated. Modular packages (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`) supersede the monolithic SDK. | [Model Context Protocol Spec](https://modelcontextprotocol.io) |
| **Google Gemini API** | Supports tool definitions, function calling, and structured outputs natively. Gemini Enterprise supports custom remote MCP connectors. Gemini Developer API requires a separate Google Cloud Billing account for pay-as-you-go usage. | [Google Cloud / Gemini Developer Docs](https://ai.google.dev) |
| **Google AI Pro vs. API** | Google AI Pro ($19.99/mo consumer subscription) covers the consumer Gemini web app and Workspace features; it DOES NOT cover or subsidize Gemini Developer API token billing. | [Google AI Plans Documentation](https://one.google.com) |
| **Anthropic Claude** | Supports custom remote MCP connectors across all plans (Free, Pro, Team, Enterprise). Free tier users are limited to **one** custom connector. Connectors require public HTTPS endpoints. | [Claude Connectors Documentation](https://claude.com) |
| **OpenAI ChatGPT** | Official MCP support rolled out for Pro, Plus, Team, Enterprise, and Edu plans via Developer Mode. Supports both read and write tools using standard OAuth 2.1. | [OpenAI Connectors & MCP Guide](https://openai.com) |
| **GitHub Apps** | Preferred over OAuth Apps for production. Issues short-lived (1-hour) installation tokens (`ghs_*`) or user-to-server tokens (8-hour expiry with refresh tokens), with repository-specific fine-grained scopes. | [GitHub Apps Developer Docs](https://docs.github.com/apps) |
| **Azure for Students** | Provides $100 annual credit renewed once every 12 months upon active student verification. Credits expire if unused and do not roll over. | [Azure for Students Portal](https://azure.microsoft.com/free/students) |
| **GitHub Student Pack** | Provides 180 core hours/month of Codespaces and standard GitHub Pages limits (100 GB/mo bandwidth, 1 GB site size). Not intended for commercial SaaS hosting. | [GitHub Education Guidelines](https://docs.github.com) |

---

## 19. Major Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **GitHub API Rate Limit Exhaustion** | High | Medium | Implement Redis caching of repository trees and commit histories; use GitHub Webhooks to invalidate caches only when changes occur. |
| **Stolen Third-Party Tokens** | Critical | Low | Encrypt all credentials with AES-256-GCM; use short-lived GitHub App installation tokens (1h lifespan); store zero tokens in client-side code. |
| **AI Hallucination in Resume Generation** | High | Medium | Hard validation gate: every generated claim must match a database Evidence ID. Reject and re-prompt if an unverified claim is produced. |
| **Accidental Overwrite of User Code** | High | Low | Read-only default permissions; write actions require explicit user approval; modifications are restricted to new branches, never `main`. |
| **Remote MCP Client Timeout** | Medium | Medium | Maintain pre-indexed candidate data in PostgreSQL; do not perform cold GitHub API crawls synchronously during an MCP tool call. |

---

## 20. What Must NEVER Be Done

1. **NEVER** hardcode a single developer's GitHub token or API key in the server for all users.
2. **NEVER** allow the AI to invent skills, degrees, dates, companies, or projects without verified evidence.
3. **NEVER** push code directly to a default branch (`main` or `master`) or merge a pull request automatically.
4. **NEVER** expose an unauthenticated remote MCP HTTP endpoint that permits querying private user records.
5. **NEVER** mix tenant data in database queries; every query MUST filter explicitly by `user_id`.
6. **NEVER** commit secrets, `.env` files, or private keys to source control.
7. **NEVER** confuse consumer subscriptions (e.g., Google AI Pro) with developer API billing.
8. **NEVER** claim a service is "free" or "unlimited" without verifying official quota and tier documentation.

---

## 21. Definition of "Done"

A feature or phase is defined as **DONE** only when all of the following conditions are met:
1. **Source Code**: Clean, modular JavaScript (ESM) implementation adhering to architectural boundaries.
2. **Schema Validation**: All inputs and outputs validated via Zod schemas.
3. **Automated Unit Tests**: Unit tests written and passing with >80% coverage on business logic.
4. **Multi-Tenant Security Verification**: Tests explicitly verifying cross-tenant isolation and unauthorized access rejection.
5. **Live Integration Verification**: Verified end-to-end against real external APIs (GitHub API, MCP Client, Gemini API).
6. **Documentation & Changelog**: `project.md` updated with verification evidence and test logs.

---

## 22. Current Project Status
* **Phase**: Phase 0 — Research and Architecture
* **Status**: In Progress (Constitution and Execution Tracker Established)
* **Overall Completion**: Calculated in `project.md` based on verified tasks.

---

## 23. Official Source Citations & References
* [Model Context Protocol Specification (2026-07-28)](https://modelcontextprotocol.io)
* [Model Context Protocol GitHub Repository](https://github.com/modelcontextprotocol)
* [Google Gemini Developer API Documentation](https://ai.google.dev)
* [Google Cloud Gemini Enterprise MCP Support](https://cloud.google.com)
* [Anthropic Claude Custom Connectors Documentation](https://claude.com)
* [OpenAI ChatGPT MCP Integration Guide](https://openai.com)
* [GitHub Apps Authentication & Permissions Documentation](https://docs.github.com/en/apps)
* [GitHub Student Developer Pack Terms](https://education.github.com)
* [Microsoft Azure for Students Terms](https://azure.microsoft.com/free/students)

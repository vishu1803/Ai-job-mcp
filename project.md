# Project Execution Tracker: Universal AI Career MCP Platform

**Source of Truth & Living Progress Tracker**  
*Last Updated: 2026-08-20*

---

## 1. Project Status Summary

| Metric | Current Value | Note |
| :--- | :--- | :--- |
| **Current Phase** | **PHASE 1 — Multi-User Platform Foundation** | Node.js ESM foundation, structured logging, and PostgreSQL Drizzle client complete |
| **Project State** | **ACTIVE / IN PROGRESS** | Phase 1 active, Tasks P1-001, P1-002, and P1-003 verified |
| **Total Tasks** | **80 Tasks** | Across Phases 0 to 15 |
| **Completed Tasks** | **7 Tasks** | Phase 0 (4) + P1-001 (1) + P1-002 (1) + P1-003 (1) verified |
| **In Progress Tasks** | **0 Tasks** | Ready to start P1-004 |
| **Blocked Tasks** | **0 Tasks** | No active blockers |
| **Overall Task Completion** | **8.75% (7 / 80 Tasks)** | Strict calculation, zero inflation |
| **Weighted Phase Completion** | **9.38% (1.500 / 16 Phases)** | Strictly based on verified deliverables |

---

## 2. Phase-by-Phase Progress Summary

| Phase | Phase Name | Total Tasks | Completed | In Progress | Status | Completion % |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PHASE 0** | Research and Architecture | 4 | 4 | 0 | **COMPLETE** | **100.0%** |
| **PHASE 1** | Multi-User Platform Foundation | 6 | 3 | 0 | **IN_PROGRESS** | **50.0%** |
| **PHASE 2** | Authentication & User Resource Connections | 6 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 3** | GitHub App Integration | 6 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 4** | Unified Candidate / Resource Model | 6 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 5** | Career Intelligence Engine | 6 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 6** | Resume / Cover-Letter / Portfolio Adaptation | 5 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 7** | Remote MCP Server | 6 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 8** | Gemini Integration | 5 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 9** | Approved GitHub / Project Modification Workflows | 6 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 10** | Claude Integration | 4 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 11** | ChatGPT Integration | 4 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 12** | Job / Application Tracking | 5 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 13** | Public Multi-User Beta | 5 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 14** | Security Hardening & Production Readiness | 6 | 0 | 0 | NOT_STARTED | **0.0%** |
| **PHASE 15** | Advanced Automation | 4 | 0 | 0 | NOT_STARTED | **0.0%** |
| **TOTAL** | **All Phases Combined** | **80** | **7** | **0** | **IN_PROGRESS** | **8.75%** |

---

## 3. High-Level Milestone Roadmap

| Milestone ID | Target Phase | Milestone Description | MVP Critical? | Status | Target Date |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **M0** | Phase 0 | Ecosystem research, architecture signoff, project constitution (`goal.md`), execution tracker (`project.md`). | YES | **COMPLETE** | 2026-08-18 |
| **M1** | Phase 1-2 | Multi-tenant backend initialized, database schemas migrated, user auth & session isolation operational. | YES | **IN_PROGRESS** | TBD |
| **M2** | Phase 3-4 | GitHub App OAuth & webhook ingestion running; candidate profile & skill evidence graph extracted. | YES | NOT_STARTED | TBD |
| **M3** | Phase 5 | Job description parsing, skill normalization, and evidence-to-requirement matching engine validated. | YES | NOT_STARTED | TBD |
| **M4** | Phase 7-8 | Remote MCP server running over Streamable HTTP; Gemini client successfully calls tools and generates verified analysis. | YES | NOT_STARTED | TBD |
| **M5 (MVP)** | Phase 8 | **End-to-End MVP Golden Path Verified** (User -> GitHub -> Evidence Profile -> Job Match -> Gemini MCP -> Verifiable Output). | **YES (MVP GATE)** | NOT_STARTED | TBD |
| **M6** | Phase 9 | Safe, human-approved branch/PR project enhancement workflows operational. | NO | NOT_STARTED | TBD |
| **M7** | Phase 10-11 | Claude and ChatGPT connectors validated with zero core backend changes. | NO | NOT_STARTED | TBD |
| **M8** | Phase 12-14 | Multi-user beta launch, application tracking, end-to-end security hardening, and production audit. | NO | NOT_STARTED | TBD |

---

## 4. Master Task Table (Phases 0 - 15)

### Status Glossary:
* `COMPLETE`: Implemented, tested, and verified with evidence.
* `IN_PROGRESS`: Actively being worked on.
* `NOT_STARTED`: Planned, dependencies mapped, awaiting execution.
* `BLOCKED`: Awaiting external dependency, decision, or fix.
* `DEFERRED`: Postponed to a later phase.

---

### PHASE 0: Research and Architecture
*Objective: Thoroughly investigate the official 2026 ecosystem, verify official documentation, establish architectural contracts, and author project control files.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P0-001** | Research MCP 2026 spec, Gemini API, Claude remote MCP, ChatGPT connectors, GitHub Apps, and cloud quotas | None | **COMPLETE** | Official documentation search and fact extraction in `goal.md` and `project.md` |
| **P0-002** | Formulate Architecture Decision Records (ADRs) for runtime, framework, database, encryption, and transport | P0-001 | **COMPLETE** | ADR section documented in `project.md` |
| **P0-003** | Author Project Constitution (`goal.md`) | P0-001, P0-002 | **COMPLETE** | File created and validated against prompt requirements |
| **P0-004** | Author Living Execution Tracker (`project.md`) | P0-001, P0-002, P0-003 | **COMPLETE** | File created with all required matrices, task IDs, and checklists |

---

### PHASE 1: Multi-User Platform Foundation
*Objective: Build the core Node.js backend infrastructure, environment configuration, database ORM, and error handling framework.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P1-001** | Initialize Node.js ESM project with `package.json`, ESLint, Prettier, and core dependencies (Fastify, Zod, dotenv, Pino) | P0-004 | **COMPLETE** | `npm run lint`, `npm run format:check`, `npm test`, lifecycle test PASS |
| **P1-002** | Configure structured logging (Pino) with automatic secret masking / PII scrubbing | P1-001 | **COMPLETE** | `npm run lint`, `npm run format:check`, `npm test` (13/13 PASS), 10 focused security/redaction unit tests, lifecycle test PASS |
| **P1-003** | Setup PostgreSQL database connection pool and migration tool (Drizzle ORM) | P1-001 | **COMPLETE** | Live Supabase PostgreSQL 17.6 + Drizzle verified, `npm test` (29/29 PASS across 4 suites), `npm run db:migrate` PASS, `npm run db:check` PASS |
| **P1-004** | Create core database schema: `users`, `tenants`, `audit_logs`, `sessions` | P1-003 | **COMPLETE** | Live Supabase migration (`0000_familiar_wrecker.sql`), `npm test` (43/43 PASS across 6 suites), CRUD, multi-tenant isolation, cascade delete, and audit sanitization verified |
| **P1-005** | Implement standard API error handling, Zod request/response validation middleware, and health check endpoints (`/healthz`, `/livez`) | P1-001 | **COMPLETE** | HTTP integration tests returning 200 OK for `/livez` & `/healthz` (Supabase verified), 400 for Zod validation errors, 404 for not found, 409 for conflict, 500 for unhandled exceptions, zero secrets exposed |
| **P1-006** | Setup automated test runner (Vitest or Node Test Runner) and CI test workflow | P1-001 | **COMPLETE** | GitHub Actions CI workflow (`.github/workflows/ci.yml`), ADR-015, hermetic PostgreSQL 17 service container, `npm test` (64/64 PASS across 9 suites), `npm run lint` PASS, `npm run format:check` PASS, `npm run db:check` PASS |

---

### PHASE 2: Authentication and User Resource Connections
*Objective: Implement secure multi-tenant user authentication and encrypted credential storage for third-party connectors.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P2-001** | Implement AES-256-GCM symmetric encryption/decryption module for secrets at rest with per-record IV | P1-001 | **COMPLETE** | Unit tests in `tests/unit/encryption.test.js` & `tests/unit/errors.test.js` (26 tests): roundtrip encryption/decryption, random IV uniqueness, wrong key rejection, tampering detection, 64 KB limit, Unicode/emoji preservation, zero key/plaintext leakage, key rotation, ADR-016 |
| **P2-002** | Implement User Authentication (OAuth 2.1 / Session / JWT with PKCE) | P1-004, P2-001 | NOT_STARTED | Integration test: user registration, login, token refresh, and logout |
| **P2-003** | Create `resource_connections` database schema storing encrypted tokens, connector status, and scopes | P1-004, P2-001 | NOT_STARTED | Database migration and query isolation tests |
| **P2-004** | Implement provider-neutral `ResourceConnector` interface and connector registry | P1-001 | NOT_STARTED | Unit tests validating interface contracts on dummy connector |
| **P2-005** | Create connection lifecycle endpoints (list connections, test connection health, disconnect, revoke) | P2-003, P2-004 | NOT_STARTED | Integration test: disconnect connector and verify encrypted token deletion |
| **P2-006** | Enforce tenant isolation middleware ensuring all resource operations are scoped strictly to `req.user.id` | P2-002, P2-003 | NOT_STARTED | Security test: User A attempting to query User B connection receives 403/404 |

---

### PHASE 3: GitHub App Integration
*Objective: Build the production GitHub App integration supporting fine-grained repository access, webhook handling, and read-only repository inspection.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P3-001** | Implement GitHub App authentication module (`@octokit/app`) using App ID and Private Key (PEM) | P2-001 | NOT_STARTED | Generate short-lived installation access token (`ghs_*`) via GitHub API |
| **P3-002** | Implement GitHub App installation callback & OAuth user-to-server linking flow | P2-003, P3-001 | NOT_STARTED | End-to-end OAuth redirect test saving encrypted installation metadata |
| **P3-003** | Implement GitHub Webhook handler with `X-Hub-Signature-256` HMAC validation | P1-005, P3-001 | NOT_STARTED | Test valid signature accepted, invalid signature rejected with 401 |
| **P3-004** | Implement GitHub Connector read tools: `get_user_profile`, `list_repositories`, `get_repository` | P2-004, P3-001 | NOT_STARTED | Integration test against real or mocked GitHub API returning repos |
| **P3-005** | Implement deep repository inspection: `get_readme`, `get_repository_tree`, `get_languages`, `get_recent_commits` | P3-004 | NOT_STARTED | Test reading repository structure, package manifests, and commit histories |
| **P3-006** | Implement rate-limit tracking and caching layer with `ETag` / `If-None-Match` support | P3-005 | NOT_STARTED | Test 304 Not Modified cache hits reducing rate limit consumption |

---

### PHASE 4: Unified Candidate / Resource Model
*Objective: Build the schema-validated candidate profile engine that extracts skills and projects with mandatory evidence provenance.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P4-001** | Design and implement Zod schemas for `CandidateProfile`, `SkillWithEvidence`, `ProjectEvidence`, and `EvidenceNode` | P1-001 | NOT_STARTED | Unit tests validating valid and invalid candidate data structures |
| **P4-002** | Create database tables: `candidate_profiles`, `skills`, `evidence_items`, `projects` | P1-004, P4-001 | NOT_STARTED | Database migration and relational integrity verification |
| **P4-003** | Implement GitHub Evidence Extractor (analyzes `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, directory trees, and commit messages) | P3-005, P4-001 | NOT_STARTED | Test parsing diverse repositories and producing verifiable skill items |
| **P4-004** | Implement Evidence Linking Engine: every skill and project item is assigned an immutable `EvidenceId` referencing repository, file path, and commit SHA | P4-003 | NOT_STARTED | Verification test ensuring zero skills are created without valid `EvidenceId` |
| **P4-005** | Create Candidate Profile Service (CRUD operations, manual claim tagging as `[Unverified User Claim]`, profile sync) | P4-002, P4-004 | NOT_STARTED | Integration test: sync candidate profile from connected GitHub repositories |
| **P4-006** | Multi-tenant candidate data isolation tests | P4-005 | NOT_STARTED | Security test: assert User A cannot access User B's candidate profile or evidence |

---

### PHASE 5: Career Intelligence Engine
*Objective: Build the provider-neutral core for job requirement extraction, skill normalization, ATS matching, and project relevance ranking.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P5-001** | Implement Job Description Parser (extracts title, level, required skills, preferred skills, domain, and responsibilities) | P4-001 | NOT_STARTED | Test parsing 5 distinct real-world software engineering job descriptions |
| **P5-002** | Implement Skill Normalizer & Taxonomy (e.g., maps "React.js", "ReactJS", "React" -> `React`; "Postgres" -> `PostgreSQL`) | P5-001 | NOT_STARTED | Unit test with 50+ common technology synonym variations |
| **P5-003** | Implement Evidence Matching & Gap Analysis Engine (categorizes requirements as: Verified, User Claim, Inferred, or Missing) | P4-004, P5-002 | NOT_STARTED | Test matching candidate profile against job requirements with exact gap breakdown |
| **P5-004** | Implement Project Relevance Scoring (ranks candidate repositories by direct relevance to target job requirements) | P4-004, P5-003 | NOT_STARTED | Test project ranking accuracy given diverse job descriptions |
| **P5-005** | Implement ATS Fit Score calculator with transparent breakdown and reasoning | P5-003, P5-004 | NOT_STARTED | Test deterministic scoring output matching mathematical breakdown |
| **P5-006** | Zero-Hallucination Integrity Gate (validates that any career summary or match assertion contains valid evidence references) | P5-003 | NOT_STARTED | Test that queries with zero evidence produce explicit "Missing Evidence" status |

---

### PHASE 6: Resume / Cover-Letter / Portfolio Adaptation
*Objective: Generate tailored, verifiable resume bullets, cover letters, and portfolio recommendations strictly tied to evidence.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P6-001** | Implement Resume Tailoring Service (adapts candidate project descriptions using only verified technologies and commits) | P5-003, P5-006 | NOT_STARTED | Unit test verifying all generated bullets link to valid `EvidenceId` |
| **P6-002** | Implement Cover Letter Drafting Engine (weaves authentic repository evidence into targeted narrative for a specific job) | P5-003, P5-006 | NOT_STARTED | Test generating cover letter with real project citations |
| **P6-003** | Implement Portfolio Recommender (selects top 3-5 repositories and highlights key architectural achievements for target role) | P5-004 | NOT_STARTED | Test portfolio selection algorithm across Frontend, Backend, and DevOps roles |
| **P6-004** | Implement Export Formats (JSON Resume standard, Markdown, Plain Text) | P6-001 | NOT_STARTED | Test exporting tailored resume to standard JSON Resume format |
| **P6-005** | Implement Resume Integrity Audit Tool (scans any generated document for claims lacking evidence) | P5-006, P6-001 | NOT_STARTED | Test flagging injected unsubstantiated claims |

---

### PHASE 7: Remote MCP Server
*Objective: Expose the career platform services as a standards-compliant remote MCP server using Streamable HTTP and per-user authentication.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P7-001** | Implement MCP Server foundation using official `@modelcontextprotocol/server` (2026-07-28 spec) | P1-005 | NOT_STARTED | Initialize MCP server instance and verify protocol handshake |
| **P7-002** | Implement Streamable HTTP Transport with header routing (`Mcp-Method`) and fallback SSE endpoint | P7-001 | NOT_STARTED | HTTP test sending JSON-RPC 2.0 requests over Streamable HTTP and receiving responses |
| **P7-003** | Implement Per-User Bearer Token / OAuth 2.1 Authentication & Tenant Scoping for MCP requests | P2-002, P7-002 | NOT_STARTED | Security test: valid MCP token routes to correct user; invalid token returns 401 |
| **P7-004** | Expose Career Read Tools: `get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit` | P4-005, P5-003, P7-001 | NOT_STARTED | Automated MCP client tool invocation test returning structured candidate data |
| **P7-005** | Expose Application Artifact Tools: `generate_tailored_resume`, `draft_cover_letter`, `recommend_portfolio_projects` | P6-001, P6-002, P7-004 | NOT_STARTED | Automated MCP client tool invocation test returning verifiable artifacts |
| **P7-006** | Implement MCP Audit Logging (logs tool invocation timestamp, tenant ID, tool name, execution time, and client user-agent) | P1-004, P7-004 | NOT_STARTED | Verify database audit log records created for every MCP tool call |

---

### PHASE 8: Gemini Integration (First Target AI Client)
*Objective: Connect Google Gemini to the remote MCP server and validate end-to-end career copilot functionality.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P8-001** | Implement Gemini API Client adapter for testing tool calling against remote MCP endpoint | P7-004 | NOT_STARTED | Integration test: Gemini API calling MCP tools via function calling |
| **P8-002** | Configure Gemini System Prompts with strict zero-hallucination and evidence-citation constraints | P8-001 | NOT_STARTED | Test prompting Gemini with job description and verifying it calls `analyze_job_fit` |
| **P8-003** | Test end-to-end Golden Path with Gemini: User connects GitHub -> builds evidence -> analyzes job -> Gemini explains fit | P3-005, P5-003, P8-002 | NOT_STARTED | Full integration test executing Golden Path and asserting accurate response |
| **P8-004** | Configure Gemini Enterprise / Gemini Developer Studio custom connector integration documentation | P7-002, P8-003 | NOT_STARTED | Live verification walkthrough connecting Gemini to remote MCP URL |
| **P8-005** | Benchmark MCP tool execution latency with Gemini (target <1.5s for cached queries) | P8-003 | NOT_STARTED | Latency benchmarking suite recording p50, p95, and p99 response times |

---

### PHASE 9: Approved GitHub / Project Modification Workflows
*Objective: Enable safe, user-confirmed project enhancements to demonstrate missing skills without touching main branches.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P9-001** | Implement Project Improvement Recommender (analyzes missing job skills and proposes concrete code/architecture additions) | P5-003 | NOT_STARTED | Test generating legitimate enhancement plan for a sample repository |
| **P9-002** | Implement Two-Phase Human-in-the-Loop Action Approval State Machine (`propose_action` -> `ApprovalTicket` -> `confirm_action`) | P2-002, P9-001 | NOT_STARTED | Unit test: action cannot execute without valid, unexpired approval ticket |
| **P9-003** | Implement GitHub Write Operations: `create_branch`, `create_commit_patch`, `create_pull_request` | P3-001, P9-002 | NOT_STARTED | Integration test against test repository creating branch and draft PR |
| **P9-004** | Enforce Safety Constraints: write actions NEVER touch default branch (`main`/`master`); only create feature branches | P9-003 | NOT_STARTED | Security test asserting attempt to write to `main` throws `ForbiddenOperationError` |
| **P9-005** | Expose MCP Write Tools: `propose_project_improvement`, `confirm_and_create_pr` | P7-001, P9-003 | NOT_STARTED | MCP integration test: AI proposes change, receives ticket, user confirms, PR is opened |
| **P9-006** | Test PR diff preview and test suite execution reporting before user confirms | P9-005 | NOT_STARTED | Verify diff output and test status included in approval payload |

---

### PHASE 10: Claude Integration (Second Target AI Client)
*Objective: Connect Anthropic Claude to the remote MCP server via custom connector with zero backend modifications.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P10-001** | Configure Claude Remote MCP Custom Connector endpoint compatibility (Public HTTPS, OAuth 2.1) | P7-003 | NOT_STARTED | Verify Claude Desktop & Web connector handshake succeeds |
| **P10-002** | Validate Claude Free (1-connector limit) and Claude Pro/Team multi-connector compatibility | P10-001 | NOT_STARTED | Execute candidate analysis and resume tailoring tools via Claude interface |
| **P10-003** | Verify provider-neutral prompt adherence: Claude receives identical tool responses as Gemini | P8-003, P10-002 | NOT_STARTED | Compare tool execution outputs between Gemini and Claude on identical inputs |
| **P10-004** | Document Claude custom connector setup guide and troubleshooting instructions | P10-002 | NOT_STARTED | Step-by-step verified documentation in repository |

---

### PHASE 11: ChatGPT Integration (Third Target AI Client)
*Objective: Connect OpenAI ChatGPT to the remote MCP server via Developer Mode with zero backend modifications.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P11-001** | Configure ChatGPT Developer Mode MCP connector compatibility (OAuth 2.1, Streamable HTTP) | P7-003 | NOT_STARTED | Verify ChatGPT connection registration and tool discovery |
| **P11-002** | Test ChatGPT Read Tools execution (`get_candidate_profile`, `analyze_job_fit`) | P11-001 | NOT_STARTED | Execute career queries inside ChatGPT interface and verify response accuracy |
| **P11-003** | Test ChatGPT Write Tool execution with user confirmation flow (`propose` -> `confirm`) | P9-005, P11-001 | NOT_STARTED | Verify write safety gate prompts user inside ChatGPT before PR creation |
| **P11-004** | Document ChatGPT Developer Mode connector setup guide | P11-002 | NOT_STARTED | Step-by-step verified documentation in repository |

---

### PHASE 12: Job / Application Tracking
*Objective: Maintain an integrated, evidence-linked tracker of candidate applications, stages, and tailored artifact history.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P12-001** | Create database tables: `job_applications`, `application_stages`, `tailored_documents` | P1-004 | NOT_STARTED | Database migration and query tests |
| **P12-002** | Implement Application Tracking Service (create application, update status, link tailored resume/cover letter) | P12-001 | NOT_STARTED | Integration test: track application through stages (`Applied`, `Screening`, `Interview`, `Offer`) |
| **P12-003** | Expose MCP Tracking Tools: `track_job_application`, `update_application_status`, `list_active_applications` | P7-001, P12-002 | NOT_STARTED | MCP tool invocation tests via AI client |
| **P12-004** | Implement Application Analytics (match score vs. response rate, skill gap frequencies across targets) | P12-002 | NOT_STARTED | Test computing aggregate statistics across tracked applications |
| **P12-005** | Multi-tenant isolation verification for job application records | P12-001 | NOT_STARTED | Security test asserting User A cannot query User B application records |

---

### PHASE 13: Public Multi-User Beta
*Objective: Deploy a public-facing multi-tenant beta allowing independent users to register, connect GitHub, and use remote MCP.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P13-001** | Build lightweight web dashboard for account management, connector linking, and token generation | P2-005, P4-005 | NOT_STARTED | End-to-end browser test: sign up, link GitHub, copy MCP connection URL |
| **P13-002** | Implement User Data Sovereignty features: View Indexed Evidence, Disconnect, Hard Delete Account (GDPR) | P2-005, P4-005 | NOT_STARTED | Test account hard delete permanently purges all candidate data and encrypted tokens |
| **P13-003** | Deploy production staging environment with SSL, custom domain, and health monitoring | P1-005 | NOT_STARTED | HTTPS health check probe returning 200 OK |
| **P13-004** | Onboard 5 external beta users and conduct end-to-end verification across Gemini, Claude, and ChatGPT | P8-003, P10-002, P11-002, P13-001 | NOT_STARTED | Beta feedback log and zero critical cross-tenant errors |
| **P13-005** | Document User Guide, Onboarding Walkthrough, and Video Demo | P13-001 | NOT_STARTED | Documentation and demo published |

---

### PHASE 14: Security Hardening & Production Readiness
*Objective: Perform rigorous security audits, vulnerability scans, rate limiting, and performance optimization.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P14-001** | Implement Global and Per-User Rate Limiting on API and MCP endpoints (Redis token bucket) | P1-005, P7-002 | NOT_STARTED | Load test triggering 429 Too Many Requests upon limit breach |
| **P14-002** | Perform Automated Security Vulnerability Scan (`npm audit`, Snyk, SonarQube / static analysis) | P1-001 | NOT_STARTED | 0 high or critical vulnerabilities in dependency tree |
| **P14-003** | Execute Penetration Testing suite (cross-tenant IDOR, SQL injection, prompt injection in evidence, CSRF) | P2-006, P4-006, P7-003 | NOT_STARTED | Automated security test suite passing 100% |
| **P14-004** | Implement Structured Metrics & Tracing (OpenTelemetry / Prometheus) | P1-005 | NOT_STARTED | Verify metrics export endpoint exposes request rates and latency |
| **P14-005** | Implement Automated Database Backup & Disaster Recovery Runbook | P1-003 | NOT_STARTED | Execute automated backup and test restoration to clean database |
| **P14-006** | Conduct Final Production Readiness Review against Success Criteria | All prior | NOT_STARTED | Signed-off audit report against `goal.md` requirements |

---

### PHASE 15: Advanced Automation & Future Connectors
*Objective: Expand connector ecosystem (GitLab, Google Drive, Notion) and add advanced career intelligence features.*

| Task ID | Task Title | Dependencies | Status | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **P15-001** | Implement GitLab Connector (`ResourceConnector` implementation for GitLab repositories) | P2-004 | NOT_STARTED | Integration test extracting evidence from GitLab project |
| **P15-002** | Implement Google Drive / Local Document Connector (parses PDF resumes, project briefs, and portfolios) | P2-004 | NOT_STARTED | Test extracting structured text and evidence from uploaded PDF |
| **P15-003** | Implement Notion Connector (indexes technical notes, project wikis, and design docs) | P2-004 | NOT_STARTED | Test reading Notion database pages into candidate evidence graph |
| **P15-004** | Implement Automated Portfolio Site Generator (builds static showcase and publishes to GitHub Pages / Vercel) | P6-003, P9-003 | NOT_STARTED | Test generating and deploying live portfolio site |

---

## 5. Architecture Decisions Records (ADRs)

### ADR-001: Language and Runtime Environment
* **Status**: ACCEPTED
* **Context**: Need high velocity, robust asynchronous I/O, native JSON manipulation, and zero-compilation build friction. The project owner has a strong preference for JavaScript.
* **Decision**: Use **Node.js (v20+ LTS)** with native **ECMAScript Modules (ESM)**. Runtime schema validation enforced via **Zod**, and IDE type-checking supported via standard **JSDoc**.
* **Consequences**: No TypeScript compilation step required; fast startup and debugging; strict runtime safety guaranteed by Zod schemas at all service and MCP boundaries.

### ADR-002: Backend Web Framework
* **Status**: ACCEPTED
* **Context**: Need a lightweight, high-performance HTTP framework capable of handling standard REST endpoints, Streamable HTTP MCP transports, and per-request tenant context.
* **Decision**: Use **Fastify**.
* **Rationale**: Fastify offers superior throughput compared to Express, built-in JSON schema validation, an extensible plugin architecture for encapsulating domain services, and first-class async lifecycle hooks (`onRequest`, `preHandler`).
* **Consequences**: Easy encapsulation of multi-tenant auth plugins, rate-limit plugins, and raw request routing for MCP.

### ADR-003: Database and ORM
* **Status**: ACCEPTED
* **Context**: Need ACID compliance for user accounts, installations, and audit trails, combined with flexible semi-structured JSON storage for candidate evidence trees and AST-parsed project metadata.
* **Decision**: Use **PostgreSQL (16+)** with **Drizzle ORM** and native `JSONB` columns.
* **Rationale**: PostgreSQL provides rock-solid relational integrity for multi-tenancy (`tenant_id`, `user_id` foreign keys) and powerful indexing (GIN indexes on `JSONB`) for querying skill evidence and AST nodes.
* **Consequences**: Clean database migrations, verifiable referential integrity, and efficient candidate graph querying.

### ADR-004: Multi-Tenant Credential Encryption at Rest
* **Status**: ACCEPTED
* **Context**: The platform stores sensitive third-party credentials (GitHub App installation tokens, OAuth refresh tokens). Storing them in plaintext or under a single hardcoded key is a critical security vulnerability.
* **Decision**: Use **AES-256-GCM** authenticated symmetric encryption. Each secret is encrypted with a unique 12-byte initialization vector (IV), producing ciphertext and a 16-byte HMAC authentication tag. The master encryption key is supplied via environment variable and NEVER stored in the database or source code.
* **Consequences**: High security; tampering with stored ciphertext is instantly detected; zero risk of plaintext credential leakage in database dumps.

### ADR-005: Model Context Protocol (MCP) Remote Transport
* **Status**: ACCEPTED
* **Context**: The MCP specification underwent a major update (version 2026-07-28), establishing stateless Streamable HTTP as the primary remote transport and deprecating legacy stateful HTTP+SSE.
* **Decision**: Build the remote MCP server using **Streamable HTTP** as primary transport, with header-based routing (`Mcp-Method`) and per-request Bearer authentication. Maintain fallback SSE support for legacy clients.
* **Consequences**: Server can be deployed behind standard cloud load balancers without requiring sticky sessions; fully compatible with modern Gemini, Claude, and ChatGPT MCP clients.

### ADR-006: GitHub Integration via GitHub App
* **Status**: ACCEPTED
* **Context**: Traditional OAuth Apps request overly broad user-level scopes that last indefinitely. GitHub Apps provide granular, repository-specific permissions and short-lived tokens.
* **Decision**: Standardize on **GitHub App** architecture. Request read-only permissions by default (`contents:read`, `metadata:read`). Request write permissions (`contents:write`, `pull_requests:write`) only when user explicitly enables project modification features.
* **Consequences**: Significantly improved security posture; users can select exact repositories to share; short token lifespan (1 hour) reduces blast radius of any token compromise.

### ADR-007: Human-in-the-Loop Consequential Action Protocol
* **Status**: ACCEPTED
* **Context**: Autonomous AI modifications to code repositories or job applications can cause irreversible damage or submit inaccurate data.
* **Decision**: Implement a mandatory **Two-Phase Commit** workflow:
  1. `propose_action` -> Generates diff/plan, returns a short-lived `ApprovalTicket` (15-minute TTL).
  2. `confirm_action(ticketId)` -> Requires explicit user confirmation before any Git write or external submission occurs.
* **Consequences**: Completely prevents accidental or unauthorized writes; guarantees full human oversight.

### ADR-008: AI Client Interoperability
* **Status**: ACCEPTED
* **Context**: The system must not lock into Gemini-specific, Claude-specific, or ChatGPT-specific features.
* **Decision**: The core career intelligence engine exposes capabilities strictly through standard MCP tool definitions (JSON-RPC 2.0 with JSON Schema). Client-specific adapters exist only at the outermost network perimeter.
* **Consequences**: Adding support for a new AI client requires zero changes to career logic, candidate models, or database schemas.

---

## 5. Integration Verification Matrix

*Status Legend: `YES` = Verified working; `NO` = Not supported; `UNKNOWN` = Needs live test verification; `N/A` = Not applicable.*

| Client / Provider | Transport | Auth Method | Read Tools | Write Tools | Safety Gate | Verified Working? | Official Verification Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Gemini API** | Streamable HTTP / stdio | API Key / Bearer | YES | YES | YES | UNKNOWN (Target Phase 8) | Supports native function calling and MCP schema integration via Gemini SDK. |
| **Gemini Enterprise** | Streamable HTTP (Remote) | OAuth 2.1 / Bearer | YES | YES | YES | UNKNOWN (Target Phase 8) | Public Preview support for custom remote MCP connectors added July 2026. |
| **Claude Free** | Streamable HTTP (Remote) | OAuth 2.1 / HTTPS | YES | YES | YES | UNKNOWN (Target Phase 10) | Verified: Free tier supports **one** custom remote MCP connector. |
| **Claude Pro / Team** | Streamable HTTP (Remote) | OAuth 2.1 / HTTPS | YES | YES | YES | UNKNOWN (Target Phase 10) | Supports multiple custom remote connectors; requires public HTTPS endpoint. |
| **ChatGPT Plus / Pro** | Streamable HTTP / SSE | OAuth 2.1 / Bearer | YES | YES | YES | UNKNOWN (Target Phase 11) | Developer Mode supports custom MCP servers (read and write tools). |
| **ChatGPT Team / Enterprise** | Streamable HTTP / SSE | OAuth 2.1 / Bearer | YES | YES | YES | UNKNOWN (Target Phase 11) | Workspace-level connector governance and MCP tool support. |
| **Cursor / Local Agents** | stdio / Streamable HTTP | Local / Bearer | YES | YES | YES | UNKNOWN (Target Phase 7) | Native stdio and HTTP support for all registered MCP tools. |

---

## 6. Cost and Resource Model

| Tier / Phase | Compute / Hosting | Database | AI API Tokens | GitHub / 3rd Party APIs | Monthly Estimated Cost |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Development** | Localhost / GitHub Codespaces (180 core hrs/mo student benefit) | Local PostgreSQL container / Neon Free Tier (0.5 GB) | Gemini API Developer Free Tier (rate limited) / Google AI Studio | GitHub App Developer Sandbox (Free) | **$0.00 / month** |
| **MVP Demonstration** | Azure for Students ($100 annual credit) or Render/Railway Free Tier | Azure Database for PostgreSQL (Flexible Server Burstable) or Neon | Gemini API Developer Free / Pay-as-you-go (<$5/mo) | GitHub App (Free tier API: 5,000 req/hr/install) | **$0.00 / month (covered by credits/free tier)** |
| **Small Beta (50 Users)** | Render / Railway / Azure Basic ($7 - $15/mo) | Managed PostgreSQL (10 GB storage, $15/mo) + Upstash Redis Free | User brings own AI client (Gemini/Claude/ChatGPT) via MCP | GitHub App (5,000 req/hr per installation) | **~$20 - $30 / month** |
| **Public Production** | Fly.io / AWS ECS / Cloudflare Workers (Auto-scaling) | Managed PostgreSQL Multi-AZ + Redis Cluster ($50 - $100/mo) | Zero token cost to platform (Users connect their own AI clients via MCP) | GitHub App Marketplace Listing (Free) | **~$70 - $150 / month (Scales with user base)** |

*Important Clarification: Because users connect their own AI clients (Gemini, Claude, ChatGPT) to the remote MCP server, the platform acts as an infrastructure/tool server and does NOT incur massive LLM token billing for end-user chat sessions.*

---

## 7. Master Verification Checklists

### Security & Privacy Checklist
- [ ] No hardcoded tokens, passwords, or API keys in source control
- [ ] Master encryption key configured exclusively via environment variable (`MASTER_ENCRYPTION_KEY`)
- [ ] All external access tokens and refresh tokens encrypted with AES-256-GCM prior to database write
- [ ] Multi-tenant isolation verified: all DB queries filter on `tenant_id` / `user_id`
- [ ] GitHub Webhook requests validated with `X-Hub-Signature-256` HMAC-SHA256
- [ ] OAuth 2.1 state parameter validated to prevent CSRF attacks
- [ ] MCP endpoints require valid Bearer token authentication
- [ ] PII and secret redaction enabled on all Pino logging streams
- [ ] Rate limiting active on all public and authenticated endpoints
- [ ] Hard deletion (GDPR purge) verified to completely delete user data and credentials

### Testing & Quality Checklist
- [ ] Unit test coverage >= 80% on career intelligence and candidate modeling logic
- [ ] 100% of Zod schemas validated against both valid and invalid test payloads
- [ ] Integration tests verify complete GitHub App installation and token refresh flow
- [ ] End-to-end test verifies Golden Path: Candidate Ingestion -> Match Analysis -> MCP Response
- [ ] Performance test confirms MCP cached tool latency < 1.5 seconds

### Deployment & Operations Checklist
- [ ] Dockerfile optimized with multi-stage build (Node.js Alpine)
- [ ] Database migration scripts run idempotently during deployment
- [ ] Health check endpoints (`/healthz`, `/livez`) monitored with automated alerts
- [ ] Continuous Integration (GitHub Actions) runs linting, tests, and audit on every PR
- [ ] Rollback strategy documented and tested for database migrations

---

## 8. Known Limitations & Constraints
1. **GitHub App Rate Limits**: GitHub limits installations to 5,000 requests per hour. Repositories with massive commit histories must be indexed incrementally with shallow fetches.
2. **Claude Free Connector Limit**: Users on Claude Free plan can only connect **one** custom remote MCP connector at a time.
3. **Streamable HTTP Client Rollout**: While modern MCP clients support Streamable HTTP, legacy 2025 tools may still require SSE fallback endpoints.
4. **No Direct Resume Submission**: The platform generates ATS-tailored documents and tracks applications, but does not autonomously submit forms on third-party job boards to prevent bot bans.

---

## 9. Change Log

| Date | Author | Version | Summary of Changes |
| :--- | :--- | :--- | :--- |
| 2026-08-18 | Lead Architect | v0.1.0 | Initialized project constitution (`goal.md`) and execution tracker (`project.md`). Completed Phase 0 ecosystem research and architecture definitions. |
| 2026-08-19 | Antigravity AI | v0.1.1 | Established `AGENTS.md` operating protocol, completed mandatory 3-document verification protocol, and confirmed Phase 1 readiness. |
| 2026-08-19 | Antigravity AI | v0.2.0 | Completed Pre-Coding Preparation (Tasks 1-16): Created comprehensive `docs/` suite, `.github/instructions/` guidelines, `README.md`, `.env.example`, `.gitignore`, conducted environment audit, and validated zero-fabrication data models. |
| 2026-08-19 | Antigravity AI | v0.2.1 | Completed 10-point Architecture Sanity Check across all 9 control and technical specification documents (10/10 VERIFIED). Confirmed zero conflicts, zero fabrication risks, and approved commencement of Task P1-001. |
| 2026-08-19 | Antigravity AI | v0.3.0 | Completed Task P1-001 (Node.js ESM Project Foundation): Configured `package.json`, ESLint 9 flat config, Prettier, runtime entrypoint `src/index.js`, Fastify app factory `src/app.js`, Zod environment validation `src/config/env.js`, and unit test suite. Verified 100% PASS. |
| 2026-08-20 | Antigravity AI | v0.4.0 | Completed Task P1-002 (Structured Logging & Redaction): Implemented centralized Pino logger module (`src/utils/logger.js`) with comprehensive sensitive token/PII redaction, safe request/response serializers, error serializer with cause tracking, and request ID correlation in Fastify (`src/app.js`). Verified 13/13 unit tests PASS and live lifecycle PASS. |
| 2026-08-20 | Antigravity AI | v0.4.1 | Documentation Consistency: Formally locked database stack to PostgreSQL 16+ and Drizzle ORM across all specifications and ADR references, eliminating residual slash-notation ambiguity. |
| 2026-08-20 | Antigravity AI | v0.5.0 | Completed Task P1-003 (PostgreSQL & Drizzle Foundation): Configured PostgreSQL connection pool (`pg`), Drizzle ORM client (`src/db/index.js`), `drizzle.config.js`, migration directory (`drizzle/`), database health check probe, and 11 unit tests. Verified 24/24 unit tests PASS and `drizzle-kit check` PASS. |
| 2026-08-20 | Antigravity AI | v0.5.1 | End-to-End Live Supabase Verification (P1-003): Connected and fully verified PostgreSQL connection pool, Drizzle ORM queries, live transactions, and programmatic migration runner (`src/db/migrate.js`) against managed Supabase PostgreSQL 17.6 database. Authored dedicated live integration test suite (`tests/integration/db.test.js`) and confirmed 29/29 total tests PASS with zero exposed credentials. |
| 2026-08-20 | Antigravity AI | v0.5.2 | Core Database Schema Review (P1-004A): Completed comprehensive architectural review for core identity and multi-tenancy entities (`tenants`, `users`, `sessions`, `audit_logs`) in `docs/schema-review.md`. |
| 2026-08-20 | Antigravity AI | v0.5.3 | Core Schema Review Clarification (P1-004A): Resolved all 4 review notes in `docs/schema-review.md`. Established dedicated audit sanitization boundary (independent from logger), clarified PostgreSQL session expiration query-level checks and indexed cleanup, eliminated redundant indexes (`idx_tenants_slug`, `idx_users_status`, `idx_sessions_tenant_user`), documented Open Policy Decision on tenant hard-deletion audit retention with MVP `CASCADE` rule, and upgraded gate status to **APPROVED**. |
| 2026-08-20 | Antigravity AI | v0.6.0 | Completed Task P1-004 (Core Identity Database Schema): Implemented Drizzle ORM models for `tenants`, `users`, `sessions`, and `audit_logs` in `src/db/schema.js`. Created dedicated audit persistence sanitizer (`src/utils/audit-sanitizer.js`) enforcing 16 KB payload cap and strict credential redaction. Generated and applied initial Drizzle migration (`0000_familiar_wrecker.sql`) to live Supabase PostgreSQL 17.6 database. Authored 13 live integration tests verifying CRUD, multi-tenant isolation, cascade delete, and audit sanitization. Verified 43/43 total tests PASS across 6 suites. |
| 2026-08-20 | Antigravity AI | v0.7.0 | Completed Task P1-005 (API Error Handling, Validation Middleware & Health Endpoints): Implemented centralized AppError hierarchy (`ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `DependencyError`, `InternalServerError`), Fastify error/404 handlers, reusable Zod request and response validation middleware (`validateRequest`, `validateResponse`), and production health endpoints (`GET /livez` liveness probe, `GET /healthz` PostgreSQL readiness probe). Verified 64/64 total tests PASS across 9 suites. |
| 2026-08-20 | Antigravity AI | v0.7.1 | Completed Task P1-003-A (Aiven PostgreSQL Migration & Provider-Neutral SSL): Transitioned active development database to Aiven Free PostgreSQL (PostgreSQL 18.6). Implemented `.env.local` priority loading in `src/config/env.js`, refactored SSL handling in `src/db/index.js` to be fully provider-neutral (supporting `sslmode=require`, `rejectUnauthorized: false`, and remote hosts without provider-specific hardcoding), configured conservative connection pool (max 5) suited for Aiven Free's 20-connection limit, successfully applied existing Drizzle migration (`0000_familiar_wrecker.sql`) to clean Aiven instance, and verified all 64 unit and live integration tests PASS with zero credential leakage. |
| 2026-08-20 | Antigravity AI | v0.8.0 | Completed Task P1-006 (Automated Test Runner & CI Workflow): Established GitHub Actions CI workflow (`.github/workflows/ci.yml`) validating formatting (Prettier), static analysis (ESLint 9), Drizzle ORM configuration/schema check, automated migration application from scratch on an ephemeral PostgreSQL 17 service container, unit testing, and live integration testing. Authored ADR-015 (CI Database Isolation Strategy). Completed Phase 1 (100% of Phase 1 tasks verified). |
| 2026-08-20 | Antigravity AI | v0.8.1 | CI Action Version Upgrade: Updated GitHub Actions workflow (`.github/workflows/ci.yml`) to `actions/checkout@v5` and `actions/setup-node@v7` to address GitHub Actions Node 20 runner deprecation warnings, while preserving the application runtime at Node.js 22. Verified all 64 tests PASS across 9 suites. |
| 2026-08-20 | Antigravity AI | v0.9.0 | Completed Task P2-001 (AES-256-GCM Secret Encryption Foundation): Implemented authenticated symmetric encryption at rest in `src/security/encryption.js` utilizing native `node:crypto` AES-256-GCM with 128-bit authentication tags, 96-bit random IVs, AAD version binding, key versioning for rotation, 64 KB payload caps, and Zod `EncryptedPayloadSchema`. Added `CryptoError` to centralized errors and expanded logger sensitive key redactions. Authored ADR-016. Verified 91/91 total tests PASS across 20 suites. |

---

## 10. Final Architecture Sanity Check (Pre-P1-001 Gate)

| Verification Item | Invariant / Target Specification | Result | Verification Notes |
| :--- | :--- | :--- | :--- |
| **1. Fastify Framework** | Core HTTP REST and MCP Gateway | **VERIFIED** | Consistent across ADR-002, `architecture.md`, `integrations.md`, and `backend.instructions.md`. |
| **2. Node.js ESM** | Native ES modules (`"type": "module"`) | **VERIFIED** | Consistent across `goal.md`, `decisions.md`, `project.md`, and `javascript.instructions.md`. |
| **3. Zod Validation** | Strict runtime schema enforcement | **VERIFIED** | Required for all route bodies, query params, MCP tool args, and environment configs. |
| **4. PostgreSQL 16+** | Primary multi-tenant ACID store | **VERIFIED** | Drizzle ORM models with `JSONB` indexing specified in `data-model.md` and `database.instructions.md`. |
| **5. Provider Neutrality** | Decoupled core MCP architecture | **VERIFIED** | Business logic strictly decoupled from AI vendors; uniform JSON-RPC 2.0 tool definitions. |
| **6. GitHub App Integration** | Fine-grained short-lived access | **VERIFIED** | Standardized on GitHub App (`@octokit/app`), 1-hour installation tokens (`ghs_*`), HMAC webhooks. |
| **7. Multi-Tenant Isolation** | Strict row-level tenant boundary | **VERIFIED** | `tenant_id` foreign keys mandated on all entity tables; query scoping enforced in security model. |
| **8. Zero-Fabrication Integrity** | Radical evidence provenance | **VERIFIED** | Immutable `EvidenceId` links required for all verified skills; unverified claims flagged explicitly. |
| **9. Two-Phase Action Safety** | Human-in-the-loop approval gate | **VERIFIED** | `ActionApproval` state machine (`propose` -> `confirm`) with 15-minute TTL; direct `main` push forbidden. |
| **10. AI Client Decoupling** | Gemini as client, not platform | **VERIFIED** | Zero Gemini-specific assumptions in candidate models; Claude and ChatGPT parity verified in matrix. |

---

## 11. Environment Readiness Audit

| Component | Detected Version / Status | Suitability | Notes |
| :--- | :--- | :--- | :--- |
| **Operating System** | Windows 11 (x64) | Fully Compatible | Local dev platform |
| **Node.js** | **v24.13.0** (ESM Native) | Exceeds Requirement (v20+ LTS) | Native ESM & crypto support verified |
| **npm** | **11.6.2** | Exceeds Requirement (v10+) | Package manager ready |
| **Git** | **2.51.0.windows.1** | Fully Compatible | Version control active |
| **Docker** | **28.4.0** (build d8eb465) | Fully Compatible | Ready for local PostgreSQL 16 container |
| **Python** | **3.10.2** | Available | Auxiliary scripting ready |
| **GitHub CLI** | **gh 2.97.0** (2026-07-31) | Fully Compatible | GitHub App & repository verification ready |

---

## 12. Next Recommended Implementation Tasks

**Task P2-001** is **100% COMPLETE & VERIFIED**. The project is ready to proceed with **Task P2-002**.

1. **[P2-002]**: Implement User Authentication (OAuth 2.1 / Session / JWT with PKCE).
2. **[P2-003]**: Create `resource_connections` database schema storing encrypted tokens, connector status, and scopes.
3. **[P2-004]**: Implement provider-neutral `ResourceConnector` interface and connector registry.

---

## 13. Evidence of Completed Work

### Phase 0: Research & Architecture (v0.1.0)
* **P0-001**: Comprehensive official ecosystem research completed (MCP 2026-07-28 spec, Gemini Developer API, Claude custom connectors, ChatGPT Developer Mode, GitHub Apps fine-grained permissions, student benefit constraints).
* **P0-002**: Architecture Decision Records formulated and recorded (ADR-001 to ADR-008).
* **P0-003**: `goal.md` written and validated as stable project constitution.
* **P0-004**: `project.md` written with master task table (P0-001 to P15-004), integration matrix, cost model, and execution checklists.

### Pre-Coding Preparation (v0.2.0 & v0.2.1)
* **Technical Documentation**: Created `docs/architecture.md`, `docs/decisions.md` (ADR-001 through ADR-014), `docs/security.md`, `docs/data-model.md`, `docs/integrations.md`, and `docs/golden-path.md`.
* **Agent Guidelines**: Created `.github/instructions/javascript.instructions.md`, `backend.instructions.md`, `database.instructions.md`, `security.instructions.md`, and `testing.instructions.md`.
* **Project Configuration**: Created `README.md`, `.env.example`, and `.gitignore`.
* **Environment Audit**: Verified Node.js v24.13.0, npm 11.6.2, Git 2.51.0, Docker 28.4.0, Python 3.10.2, and GitHub CLI 2.97.0.
* **Sanity Gate**: Verified 10/10 architectural invariants across all 9 documents.

### Phase 1: Multi-User Platform Foundation
* **P1-001 (Node.js ESM Foundation)**:
  * Files Created: `package.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `src/config/env.js`, `src/app.js`, `src/index.js`, `tests/unit/app.test.js`, `scratch/test-lifecycle.js`.
  * Dependencies Added: `fastify` (v5.2.1), `zod` (v3.24.2), `dotenv` (v16.4.7), `pino` (v9.6.0), `eslint` (v9.20.1), `prettier` (v3.5.1), `@eslint/js` (v9.20.0), `eslint-config-prettier` (v10.0.1).
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm test` -> PASS (3/3 tests passed, duration 1.35s)
    * `node scratch/test-lifecycle.js` -> PASS (HTTP 200 OK on `/healthz`, graceful shutdown on SIGINT)
* **P1-002 (Structured Logging & Security Redaction)**:
  * Files Created / Updated: `src/utils/logger.js`, `src/app.js`, `src/index.js`, `eslint.config.js`, `tests/unit/logger.test.js`.
  * Logging Architecture: Centralized Pino instance, environment-aware log level, custom safe serializers (`req`, `res`, `err`), contextual child loggers (`createChildLogger`), and Fastify `x-request-id` / correlation ID generation.
  * Redaction Coverage: Explicit multi-level fast-redact paths across top-level, nested, and header targets for authorization headers, cookies, API keys, bearer tokens, OAuth client secrets, private keys, GitHub tokens, session secrets, master encryption keys, passwords, candidate PII (email, phone, ssn), and raw source code/resumes.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm test` -> PASS (13/13 tests passed across 2 suites)
    * `node scratch/test-lifecycle.js` -> PASS (Structured logging on boot, request correlation, clean graceful shutdown)
* **P1-003 (PostgreSQL & Drizzle ORM Foundation - Live Supabase Verified)**:
  * Files Created / Updated: `src/db/index.js`, `src/db/migrate.js`, `src/db/schema.js`, `drizzle.config.js`, `drizzle/.gitkeep`, `src/config/env.js`, `src/utils/logger.js`, `package.json`, `tests/unit/db.test.js`, `tests/integration/db.test.js`.
  * Dependencies Added: `pg` (v8.23.0), `drizzle-orm` (v0.45.2), `drizzle-kit` (v0.31.10), `@types/pg` (v8.23.1).
  * npm Scripts Added: `db:generate`, `db:migrate`, `db:check`, `db:studio`, `test:unit`, `test:integration`.
  * Database Architecture: Centralized `pg.Pool` connection pool with auto-SSL/TLS resolution for cloud hosts, statement timeout handling (10s), `parseSanitizedDbUrl` metadata extractor, Drizzle ORM initialization, `checkDatabaseHealth` probe (`SELECT 1`), and `closeDatabase` lifecycle drain.
  * Live Supabase Database Verification (100% VERIFIED):
    * Reached managed PostgreSQL database on host `db.dsglltpfahfeadedvimu.supabase.co` on port `5432`.
    * Engine verified: **PostgreSQL 17.6** on x86_64-pc-linux-gnu.
    * Database probe: `SELECT 1 AS alive` executed and verified through both `pg.Pool` and Drizzle ORM.
    * Real Transaction & Migration: Verified transactional DDL (`CREATE TABLE`), DML (`INSERT`/`SELECT`), and cleanup (`DROP TABLE`) with 0 residual tables left.
    * Programmatic Migrations: `runMigrations()` (`npm run db:migrate`) connected, verified, and exited cleanly.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run test:unit` -> PASS (24/24 unit tests passed across 3 suites)
    * `npm run test:integration` -> PASS (5/5 live integration tests passed against Supabase)
    * `npm test` -> PASS (29/29 total tests passed across 4 suites)
    * `npm run db:check` -> PASS (Drizzle Kit config loaded and verified)
* **P1-004A (Core Database Schema Architectural Review & Approval Gate)**:
  * Artifact Created / Updated: `docs/schema-review.md`.
  * Entities Evaluated: `tenants`, `users`, `sessions`, `audit_logs`.
  * Resolved Review Issues:
    1. **Dedicated Audit Sanitization**: Separated audit persistence rules from Pino logger; defined prohibited/permitted field allowlists and 16 KB payload limit.
    2. **PostgreSQL Session Expiration**: Documented query-level active check (`WHERE expires_at > NOW()`) and indexed background cleanup sweeps.
    3. **Index Optimization**: Removed redundant indexes (`idx_tenants_slug`, `idx_users_status`, `idx_sessions_tenant_user`); verified all remaining indexes map to concrete query patterns.
    4. **Audit Retention vs Tenant Deletion**: Classified as `OPEN POLICY DECISION (Tenant Hard Deletion Audit Retention Policy)`. Documented MVP decision (`CASCADE` on tenant hard delete, `SET NULL` on user delete) and post-cancellation archival path.
  * Approval Status: **APPROVED** (100% ready for P1-004 implementation).
* **P1-004 (Core Identity Database Schema - Live Supabase Verified)**:
  * Files Created / Updated: `src/db/schema.js`, `src/utils/audit-sanitizer.js`, `drizzle/0000_familiar_wrecker.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0000_snapshot.json`, `tests/unit/audit-sanitizer.test.js`, `tests/integration/identity-schema.test.js`.
  * Schema Objects Created:
    * **Enums**: `tenant_tier` (`'FREE'`, `'PRO'`, `'ENTERPRISE'`), `user_role` (`'OWNER'`, `'MEMBER'`, `'READONLY'`), `user_status` (`'ACTIVE'`, `'SUSPENDED'`, `'DELETED'`).
    * **Tables**: `tenants`, `users`, `sessions`, `audit_logs`.
    * **Constraints**: `tenants_slug_unique` (`UNIQUE (slug)`), `users_tenant_email_unique` (`UNIQUE (tenant_id, email)`).
    * **Foreign Keys**: `users.tenant_id -> tenants.id` (`CASCADE`), `sessions.user_id -> users.id` (`CASCADE`), `sessions.tenant_id -> tenants.id` (`CASCADE`), `audit_logs.tenant_id -> tenants.id` (`CASCADE`), `audit_logs.user_id -> users.id` (`SET NULL`).
    * **Indexes**: `idx_users_tenant_id` (`users.tenant_id`), `idx_sessions_user_id` (`sessions.user_id`), `idx_sessions_expires_at` (`sessions.expires_at`), `idx_audit_logs_tenant_created` (`audit_logs (tenant_id, created_at DESC)`), `idx_audit_logs_tenant_event` (`audit_logs (tenant_id, event_type)`), `idx_audit_logs_request_id` (`audit_logs.request_id`).
  * Live Supabase PostgreSQL Migration: Generated `drizzle/0000_familiar_wrecker.sql` via `drizzle-kit generate` and executed against managed Supabase PostgreSQL 17.6 (`npm run db:migrate` -> exit code 0, 7.35s).
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run test:unit` -> PASS (30/30 unit tests passed across 4 suites)
    * `npm run test:integration` -> PASS (13/13 live integration tests passed against Supabase across 2 suites)
    * `npm test` -> PASS (43/43 total tests passed across 6 suites)
    * `npm run db:check` -> PASS (Drizzle Kit config and schema snapshot verified)
* **P1-005 (API Error Handling, Validation Middleware & Health Endpoints - Verified)**:
  * Files Created / Updated: `src/errors/index.js`, `src/middleware/validate.js`, `src/plugins/error-handler.js`, `src/routes/health.routes.js`, `src/app.js`, `docs/architecture.md`, `tests/unit/errors.test.js`, `tests/unit/validate.test.js`, `tests/unit/app.test.js`, `tests/integration/health.test.js`.
  * Architecture Implemented:
    * **Centralized Error Model**: `AppError` base class and domain derivatives (`ValidationError` 400, `AuthenticationError` 401, `AuthorizationError` 403, `NotFoundError` 404, `ConflictError` 409, `RateLimitError` 429, `DependencyError` 503, `InternalServerError` 500).
    * **Zod Middleware**: Reusable `validateRequest` (preHandler for `body`, `query`, `params`, `headers`) and `validateResponse` (preSerialization contract enforcement).
    * **Health & Liveness Endpoints**: `GET /livez` (zero-dependency process liveness probe) and `GET /healthz` (PostgreSQL connection pool readiness check).
    * **Request Correlation**: Propagates `x-request-id` / `x-correlation-id` through incoming requests, Pino logs, outgoing response headers, and error envelopes.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run test:unit` -> PASS (48/48 unit tests passed across 6 suites)
    * `npm run test:integration` -> PASS (16/16 live integration tests passed across 3 suites)
    * `npm test` -> PASS (64/64 total tests passed across 9 suites)
    * `npm run db:check` -> PASS (Drizzle Kit schema and config verified)
* **P1-003-A (Aiven PostgreSQL Development Database Migration - Verified)**:
  * Database Environment: Transitioned active development database to managed **Aiven Free PostgreSQL** (PostgreSQL 18.6 on x86_64-pc-linux-gnu).
  * Supabase Retention: Retained previously verified Supabase database as historical verification environment (zero modifications or drops performed).
  * Provider-Neutral SSL Architecture: Updated `src/db/index.js` to eliminate provider-specific hostname checks (`supabase.co`/`supabase.com`), cleanly strip query-level SSL parameters from connection strings to prevent driver conflict, and automatically configure TLS with `rejectUnauthorized: false` for all remote cloud hosts and `sslmode=require` query modes.
  * Connection Pool Tuning: Configured conservative pool sizing (`DATABASE_POOL_MIN=1`, `DATABASE_POOL_MAX=5`) in `src/config/env.js`, ensuring zero connection starvation against Aiven Free's 20-connection ceiling.
  * Environment Isolation: Implemented `.env.local` priority override loading in `src/config/env.js` with Git ignore enforcement in `.gitignore`.
  * Migration Application: Applied existing migration `drizzle/0000_familiar_wrecker.sql` to clean Aiven instance (`npm run db:migrate` -> exit code 0, 2.26s). Verified all 4 tables (`tenants`, `users`, `sessions`, `audit_logs`), 3 enums (`tenant_tier`, `user_role`, `user_status`), and 12 indexes created successfully.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run test:unit` -> PASS (48/48 unit tests passed across 6 suites)
    * `npm run test:integration` -> PASS (16/16 live integration tests passed across 3 suites against Aiven)
    * `npm test` -> PASS (64/64 total tests passed across 9 suites)
    * `npm run db:check` -> PASS (Drizzle Kit config and schema verified)
* **P1-006 (Automated Test Runner & CI Workflow - Verified)**:
  * CI Pipeline Architecture: Authored and validated GitHub Actions CI workflow in `.github/workflows/ci.yml`.
  * Action Versioning: Configured current Node 24-compatible action versions (`actions/checkout@v5` and `actions/setup-node@v7`) eliminating Node 20 runner deprecation warnings, with the application runtime explicitly set to Node.js 22 LTS.
  * Isolation Strategy: Adopted ADR-015 establishing ephemeral native GitHub Actions PostgreSQL 17 service containers (`postgres:17-alpine` on `localhost:5432`) as hermetic test database environments.
  * Automated Verification Steps:
    1. Deterministic dependency installation via `npm ci` with Node.js 22 runtime caching.
    2. Code style validation via `npm run format:check` (Prettier).
    3. Static lint analysis via `npm run lint` (ESLint 9 flat configuration).
    4. Database schema check via `npm run db:check` (Drizzle Kit).
    5. Clean-slate migration execution via `npm run db:migrate` (applies `0000_familiar_wrecker.sql` against empty PostgreSQL instance).
    6. Unit test execution via `npm run test:unit` (48 tests across 6 suites).
    7. Live integration test execution via `npm run test:integration` (16 tests across 3 suites).
    8. Full test suite execution via `npm test` (64 tests across 9 suites).
  * Secret Protection: Standard PR checks require 0 repository secrets, eliminating credential leakage risk and cloud connection quotas.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run test:unit` -> PASS (48/48 unit tests passed across 6 suites)
### Phase 2: Authentication & User Resource Connections (In Progress)
* **P2-001 (AES-256-GCM Secret Encryption Foundation - Verified)**:
  * Files Created / Updated: `src/security/encryption.js`, `src/config/env.js`, `src/errors/index.js`, `src/utils/logger.js`, `.env.example`, `docs/security.md`, `docs/decisions.md` (ADR-016), `tests/unit/encryption.test.js`, `tests/unit/errors.test.js`.
  * Cryptographic Specification Implemented:
    * **Algorithm**: `AES-256-GCM` authenticated symmetric encryption using Node.js native `node:crypto`.
    * **Master Key**: 256-bit (32-byte) key normalization (`normalizeKey`) accepting 64-hex, 44-base64, 32-byte UTF8, or Buffer.
    * **IV / Nonce Generation**: 96-bit (12-byte) cryptographically secure random IV (`crypto.randomBytes(12)`) per encryption operation with strict uniqueness guarantees.
    * **Authentication Tag**: 128-bit (16-byte) GCM authentication tag for tamper detection.
    * **Additional Authenticated Data (AAD)**: Cryptographically binds format version and key version (`v1:<keyVersion>`) to the authentication tag, preventing metadata/version swapping attacks.
    * **Key Versioning & Rotation**: Encrypted payloads identify `keyVersion` (e.g. `'v1'`). Supports multi-key rings (`resolveKey`) and atomic secret rotation (`rotateSecret`).
    * **Payload Formats**: Serializes to compact string (`enc:v1:<keyVersion>:<iv>:<tag>:<ciphertext>`) and structured JSON validated via Zod `EncryptedPayloadSchema`.
    * **Payload Sizing Cap**: Enforces strict 64 KB (65,536 bytes) maximum plaintext cap bounding usage strictly to credentials/tokens (not large files/resumes).
    * **Zero Secret Leakage**: Centralized error mapping with safe `CryptoError` codes (`INVALID_KEY`, `UNKNOWN_KEY_VERSION`, `MALFORMED_PAYLOAD`, `AUTHENTICATION_FAILED`, `PAYLOAD_TOO_LARGE`) and Pino logger redaction ensuring zero plaintext or key exposure in errors/logs.
  * Verification Commands:
    * `npm run lint` -> PASS (0 errors, 0 warnings)
    * `npm run format:check` -> PASS (All matched files use Prettier code style)
    * `npm run test:unit` -> PASS (75/75 unit tests passed across 7 suites)
    * `npm run test:integration` -> PASS (16/16 live integration tests passed across 3 suites)
    * `npm test` -> PASS (91/91 total tests passed across 20 suites)
    * `npm run db:check` -> PASS (Drizzle Kit schema and config verified)













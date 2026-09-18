# Route Ownership Matrix (P86.1)

## Purpose
This document audits every HTTP route in the platform to verify single-ownership boundaries, prevent duplicate editing surfaces, and guarantee that no secondary profile or scoring architecture exists.

---

## 1. Web View Routes Audit

| Route | Primary View / Handler | Canonical Domain Owned | Information Hierarchy & Actions |
| :--- | :--- | :--- | :--- |
| `GET /` | `renderLandingPage` | Public Marketing / Proof | Landing overview, evidence demonstration, sign-in CTA |
| `GET /login` | `renderLoginPage` | Authentication Session | GitHub OAuth login portal, returnTo parameter redirection |
| `GET /dashboard` | `renderDashboardPage` | Candidate Command Center | **Derived Summary**: Action hero (readiness blockers), 3 action shortcuts, recent applications, embedded Career Copilot |
| `GET /profile` | `renderProfilePage` | Canonical Candidate Truth | **Authoritative Edit Workspace**: Basics, Professional, Skills, Experience, Education, Projects, Preferences & Eligibility |
| `POST /profile` | `POST /profile` handler | Canonical Candidate Truth | Batched update for canonical profile facts and career preferences; triggers readiness re-evaluation |
| `GET /apps/radar` | `renderRadarFormPage` / `renderRadarResultPage` | ATS Match & Job Discovery | Deterministic ATS score calculation, requirement gap analysis, tailored application launch |
| `GET /applications` | `renderApplicationsPage` | Application Pipeline | Tracked job applications, current statuses (`DRAFT`, `SUBMITTED`, `OFFER`, `REJECTED`), handoff kits |
| `GET /apply` | `renderApplyPage` | Application Preparation | 4-step linear application workflow strictly reading canonical profile facts and isolating employer-specific answers |
| `POST /applications` | `POST /applications` handler | Application Record | Stores application submission with immutable snapshot of tailored resume and screening answers |
| `GET /resumes` | `renderResumesPage` | Source Resumes & Artifacts | Ingested PDF/DOCX source resumes, claim review, compiled ATS LaTeX artifacts |
| `GET /sources` | `renderSourcesPage` | Resource Connections | Connected GitHub App repositories, sync status, disconnect management |
| `GET /connect` | `renderConnectPage` | MCP AI Client Tokens | Personal MCP bearer tokens, Claude/ChatGPT/Gemini configuration guides |
| `GET /settings` | `renderSettingsPage` | Account & Privacy | Account details, GDPR data deletion request, session management |
| `GET /docs/mcp` | `renderMcpDocsPage` | Developer Documentation | Public Model Context Protocol API spec, tool catalog, JSON-RPC schemas |
| `GET /assistant` | Redirect to `/dashboard?copilot=open` | Contextual Copilot | Preserved for backward compatibility; routes user to unified dashboard copilot |

---

## 2. Assistant & Workflow API Endpoints Audit

| Route | Handler | Safety Boundary & Invariant |
| :--- | :--- | :--- |
| `POST /assistant/message` | `AiCareerAssistantService.handleUserMessage` | Contextual assistant exchange. Never directly mutates database. Proposes changes via `SafeUpdateProposal`. |
| `POST /assistant/proposals/confirm` | `AiCareerAssistantService.applyProposal` | Applies user-approved proposal to canonical profile. Rejects if `confirmedByUser !== true` or target field is in `PROHIBITED_AUTO_MUTATION_FIELDS`. |
| `POST /assistant/proposals/reject` | `AiCareerAssistantService.rejectProposal` | Dismisses proposal. Zero database mutation. |
| `POST /api/extension/assistant/*` | `ExtensionAssistantService` | Thin client endpoints for browser extension. Reads canonical profile and detected DOM; enforces sensitive field gating. |
| `POST /mcp` | Fastify MCP Plugin | Pure JSON-RPC 2.0 interface for remote AI clients. Strictly separated from human web routes. |

---

## 3. Duplicate Route & Shadow Store Audit Result
- **Shadow Profile Stores**: ZERO detected. Relational tables (`candidates`, `candidate_identities`, `candidate_skills`, `projects`) and JSONB `profileMetadata.userCustom` & `careerPreferences` serve as single authoritative storage.
- **Duplicate Edit Interfaces**: Cleaned. Dashboard and Overview are verified as read-only derived summaries; editing takes place strictly on `/profile`.
- **Standalone AI Page**: Consolidated into the unified Career Copilot integrated into Dashboard and contextual workflows.

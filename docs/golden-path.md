# MVP Golden Path Specification

**Project**: Antigravity Career Hub (Universal AI Career MCP Platform)  
**Status**: Authoritative MVP End-to-End Validation Protocol  
**Last Updated**: 2026-08-19  

---

## 1. Overview
The **Golden Path** is the single, uninterrupted end-to-end user journey that proves the complete value proposition of the Antigravity Career Hub platform: connecting a user's authentic code repositories to an AI client (Google Gemini) via the Model Context Protocol (MCP) to deliver 100% verifiable, evidence-grounded career intelligence.

---

## 2. Scope Boundaries (What is In vs. Out)

### IN SCOPE (MVP Golden Path)
* User account creation & tenant initialization.
* GitHub App installation and repository selection.
* Read-only repository metadata, manifest, and commit inspection.
* Extraction of skills into the Unified Candidate Data Model with immutable `EvidenceId`s.
* Deterministic parsing of real-world job descriptions.
* Evidence-to-requirement matching, gap analysis, and ATS fit scoring.
* Remote MCP server exposing read tools over Streamable HTTP with per-user Bearer authentication.
* Google Gemini API / MCP client querying candidate profile and explaining job fit with citations.

### OUT OF SCOPE (Explicitly Excluded from MVP)
* Automated job application submission bots or web scrapers.
* Automated external messaging or recruiter emailing.
* Autonomous code modifications to default (`main`/`master`) branches.
* Mass resume generation without human review.
* Browser automation extensions.

---

## 3. Step-by-Step Golden Path Execution

```
[1. User Signup] ──> [2. Connect GitHub] ──> [3. Grant Repo Scopes] ──> [4. Select Repos]
                                                                                │
                                                                                ▼
[8. Input Job Description] <── [7. Candidate Profile] <── [6. Extract Evidence] <── [5. Ingest Metadata]
          │
          ▼
[9. Parse Requirements] ──> [10. Map to Evidence] ──> [11. Calculate Fit Score]
                                                               │
                                                               ▼
[15. User Inspects Proof] <── [14. Gemini Explains] <── [13. Gemini Calls MCP] <── [12. Gap Breakdown]
```

---

### Step 1: User Creates Account
* **Actor**: Candidate (Job Seeker)
* **Action**: Registers on the web platform via email or OAuth login.
* **Input**: User email, display name, password/OAuth callback.
* **Expected Output**: `Tenant` and `User` records created in PostgreSQL; encrypted session cookie issued.
* **Authorization Boundary**: Unauthenticated public endpoint -> Authenticated session.
* **Failure States**: Duplicate email (`409 Conflict`), invalid password strength (`400 Bad Request`).
* **Verification Criteria**: Database contains user record with hashed password/OAuth ID and active tenant record.

---

### Step 2: User Initiates GitHub App Connection
* **Actor**: Candidate
* **Action**: Clicks "Connect GitHub" in dashboard.
* **Input**: User clicks redirect link with generated PKCE code challenge and `state` parameter.
* **Expected Output**: Redirected to GitHub App installation screen (`https://github.com/apps/antigravity-career-hub/installations/new`).
* **Authorization Boundary**: Authenticated session required.
* **Failure States**: Invalid CSRF state parameter on callback (`403 Forbidden`).
* **Verification Criteria**: OAuth `state` stored in temporary session cache.

---

### Step 3: User Grants Scoped Permissions on GitHub
* **Actor**: Candidate & GitHub Platform
* **Action**: User authorizes the GitHub App with granular permissions (`contents:read`, `metadata:read`).
* **Input**: GitHub OAuth grant.
* **Expected Output**: GitHub issues installation authorization code and redirects to backend callback.
* **Authorization Boundary**: GitHub OAuth 2.1 perimeter.
* **Failure States**: User cancels installation on GitHub.
* **Verification Criteria**: Callback endpoint `/api/auth/github/callback` receives valid `code` and `installation_id`.

---

### Step 4: User Selects Accessible Repositories
* **Actor**: Candidate
* **Action**: Selects specific repositories (e.g., `user/weather-backend`, `user/react-portfolio`) rather than entire GitHub account.
* **Input**: Repository selection payload from GitHub App installation.
* **Expected Output**: GitHub issues `installation_id`; platform exchanges for short-lived installation access token (`ghs_*`).
* **Authorization Boundary**: Scoped exclusively to selected repository IDs.
* **Failure States**: User selects zero repositories -> Platform displays prompt to select at least 1 repository.
* **Verification Criteria**: Encrypted token stored in `resource_connections` table using AES-256-GCM.

---

### Step 5: Platform Retrieves Authorized Repository Information
* **Actor**: Resource Connector Subsystem (Backend)
* **Action**: Connects to GitHub API via `@octokit/rest` using installation access token.
* **Input**: Authorized repository list.
* **Expected Output**: Repository metadata (name, description, default branch, primary language, topics, latest commit SHA) stored in `repositories` table.
* **Authorization Boundary**: Read-only GitHub API requests.
* **Failure States**: GitHub API 403 rate limit -> Exponential backoff with `Retry-After`.
* **Verification Criteria**: Database `repositories` table populated with metadata.

---

### Step 6: Platform Extracts Candidate & Project Evidence
* **Actor**: Evidence Extractor Subsystem (Backend)
* **Action**: Inspects repository manifests (`package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`), directory trees, and recent commit messages.
* **Input**: Raw file contents retrieved via GitHub API.
* **Expected Output**: Atomic `EvidenceItem` records created in database with unique `EvidenceId`s, file paths, commit SHAs, and normalized technology tags (e.g., `FastAPI`, `PostgreSQL`, `Docker`).
* **Authorization Boundary**: Tenant isolation enforced; evidence linked strictly to authenticated `tenant_id`.
* **Failure States**: Malformed JSON manifest -> Non-blocking error logged; extractor continues with remaining files.
* **Verification Criteria**: Zero skills created without an associated `EvidenceItem`.

---

### Step 7: Candidate Profile & Evidence Graph Become Active
* **Actor**: Candidate Service (Backend)
* **Action**: Aggregates verified skills, repository summaries, and experience timeline into a structured `CandidateProfile`.
* **Input**: Extracted `EvidenceItems`.
* **Expected Output**: `CandidateProfile` and `CandidateSkill` records created with `provenanceStatus = VERIFIED`.
* **Authorization Boundary**: Internal domain service.
* **Failure States**: No code evidence found -> Profile marked as empty with guidance to connect repositories containing code.
* **Verification Criteria**: Querying `get_candidate_profile` returns JSON payload with valid evidence citations.

---

### Step 8: User Provides a Real Job Description
* **Actor**: Candidate
* **Action**: Pastes raw text of a target job posting into the dashboard or passes it via MCP prompt.
* **Input**: Job description text (e.g., "Senior Backend Engineer at Acme Corp requiring Node.js, PostgreSQL, Docker, Redis").
* **Expected Output**: `JobDescription` record created in database.
* **Authorization Boundary**: Authenticated user session or MCP Bearer token.
* **Failure States**: Empty or whitespace-only text (`400 Bad Request`).
* **Verification Criteria**: Job description record saved with assigned `id`.

---

### Step 9: Platform Extracts Job Requirements
* **Actor**: Career Intelligence Engine (Backend)
* **Action**: Parses job description into structured requirements (Title, Seniority, Required Skills, Preferred Skills).
* **Input**: Raw job description text.
* **Expected Output**: Array of `JobRequirement` records with canonical normalized skill names.
* **Authorization Boundary**: Deterministic regex/NLP extraction engine.
* **Failure States**: Ambiguous JD structure -> Fallback to keyword and technology taxonomy extractor.
* **Verification Criteria**: Requirements array contains normalized keys (e.g., `["Node.js", "PostgreSQL", "Docker", "Redis"]`).

---

### Step 10: Platform Maps Requirements Against Candidate Evidence
* **Actor**: Evidence Matching & Gap Analysis Engine
* **Action**: Compares job requirements against the candidate's verified evidence graph.
* **Input**: Candidate `EvidenceItem`s + `JobRequirement`s.
* **Expected Output**: Categorization of every requirement into 4 statuses:
  1. `VERIFIED` (Matched with repository evidence link).
  2. `CLAIMED` (User bio claim without code proof).
  3. `INFERRED` (Derived from complementary skill).
  4. `MISSING` (Required by job, absent from candidate profile).
* **Authorization Boundary**: Scoped strictly to candidate's own evidence.
* **Failure States**: None (deterministic matching).
* **Verification Criteria**: Output contains 100% of job requirements mapped to a provenance category.

---

### Step 11: Platform Calculates Deterministic Fit Score
* **Actor**: Career Intelligence Engine
* **Action**: Computes overall ATS readiness score and fit percentage.
* **Input**: Match categorization breakdown.
* **Expected Output**: `MatchResult` record containing numerical score (e.g., `75.0%`), verified count, and missing skill list.
* **Authorization Boundary**: Internal domain service.
* **Failure States**: None.
* **Verification Criteria**: Mathematical formula: `(Verified_Weights + 0.5 * Inferred_Weights) / Total_Weights * 100`.

---

### Step 12: Platform Identifies Strengths, Gaps, and Relevant Projects
* **Actor**: Career Intelligence Engine
* **Action**: Ranks candidate repositories by relevance to the target job and creates a structured gap breakdown report.
* **Input**: `MatchResult` + Repository metadata.
* **Expected Output**: Structured report highlighting:
  * Top matching repositories with file-level citations.
  * Verified technical strengths.
  * Concrete missing skills needed for the role.
* **Authorization Boundary**: Scoped to user tenant.
* **Failure States**: None.
* **Verification Criteria**: Report includes explicit `EvidenceId` citations for all positive claims.

---

### Step 13: Gemini Connects and Calls Remote MCP Server
* **Actor**: Google Gemini Client (AI Assistant)
* **Action**: Sends Streamable HTTP JSON-RPC request to `/mcp` calling `analyze_job_fit`.
* **Input**: `Authorization: Bearer <mcp_token>`, Tool Name: `analyze_job_fit`, Arguments: `{ jobDescriptionText: "..." }`.
* **Expected Output**: Remote MCP gateway validates Bearer token, executes tool, and returns JSON-RPC 2.0 response with structured fit analysis.
* **Authorization Boundary**: Per-user Bearer token validation and rate limiting.
* **Failure States**: Invalid Bearer token (`401 Unauthorized`), rate limit exceeded (`429 Too Many Requests`).
* **Verification Criteria**: JSON-RPC response status `200 OK` with well-formed `result` object.

---

### Step 14: Gemini Explains the Result with Citations
* **Actor**: Google Gemini Client
* **Action**: Synthesizes the MCP response and presents an evidence-grounded explanation to the user.
* **Input**: MCP tool output.
* **Expected Output**: Gemini response:
  * Explains match score.
  * Highlights verified skills citing exact repositories and files.
  * Honestly points out missing skills without fabricating claims.
* **Authorization Boundary**: Client-side AI presentation.
* **Failure States**: AI attempts to hallucinate missing experience -> Blocked by MCP system prompt constraints and tool contract.
* **Verification Criteria**: 100% of positive skill claims in the response cite verified repositories.

---

### Step 15: User Inspects Ground-Truth Evidence in Dashboard
* **Actor**: Candidate
* **Action**: Clicks on evidence citations in dashboard or reviews Gemini output to inspect exact file paths, commit SHAs, and code snippets.
* **Input**: User clicks on `EvidenceId` link.
* **Expected Output**: Visual inspection drawer showing repository name, file path, commit date, and detected code snippet.
* **Authorization Boundary**: Authenticated session verifying tenant ownership of evidence.
* **Failure States**: Evidence item not found (`404 Not Found`).
* **Verification Criteria**: User can verify that every resume claim corresponds to their actual code.

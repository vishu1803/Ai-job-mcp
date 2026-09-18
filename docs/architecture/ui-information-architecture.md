# UI Information Architecture (P86.1)

## Overview & Architecture Principles

The primary user experience is structured strictly around **consumer job-seeker objectives**, not engineering schemas or database tables.

```
                    CANDIDATE USER
                          │
         ┌────────────────┴────────────────┐
         ↓                                 ↓
    [PRIMARY WORKSPACE]               [ACCOUNT & SYSTEM]
    ├─ /dashboard (Command Center)    ├─ /settings (Privacy & Account)
    ├─ /apps/radar (Job Discovery)    ├─ /connect (API Tokens & MCP)
    ├─ /applications (Pipeline)       ├─ /docs/mcp (Technical Specs)
    ├─ /profile (Candidate Truth)     └─ /auth/logout
    └─ /resumes (Artifacts)
```

---

## 1. Primary Page Information Boundaries

### `/dashboard` — Candidate Command Center
- **Purpose**: Answers three immediate questions in under 5 seconds:
  1. *What do I need to do?* (Actionable readiness hero card highlighting missing profile or screening items with direct links).
  2. *What can I do?* (3 primary action triggers: Discover Jobs, Track Applications, Manage Resumes).
  3. *What is happening?* (Concise active applications, recent job matches, and resume status).
  4. *How can AI help?* (Contextual Career Copilot command panel).
- **Prohibited Content**:
  - NO raw AST syntax trees or code parsing diagnostics.
  - NO architecture pipeline diagrams (`1. Connect Sources → 2. AST Extraction...`).
  - NO duplicate 30-skill lists or full project galleries (summarized with count and link to Profile/Skills).
  - NO developer metrics, commit hashes, or database UUIDs.

---

### `/profile` — The Canonical Candidate Source of Truth
- **Purpose**: Authoritative workspace to view and edit all candidate facts, preferences, and eligibility.
- **Organization**: Progressive disclosure across 7 clear domains:
  1. **Basics & Contact**: Full name, headline, verified email, phone with dial code, location, links (LinkedIn, GitHub, Portfolio).
  2. **Professional Summary**: Current role, total years of experience, status, summary.
  3. **Skills**: Categorized (Languages, Frameworks, Databases, Cloud & DevOps, Architecture, Tools) with distinct provenance indicators (`VERIFIED` with repository counts, `CLAIMED`, `INFERRED`).
  4. **Work Experience**: Structured positions with collapsible edit drawers (Company, Role, Work Mode, Dates, Current toggle, Responsibilities, Achievements, Tech).
  5. **Education**: Degrees, institutions, fields of study, dates, GPA/grade, coursework.
  6. **Projects**: Grounded projects with repo URLs, live demo links, and tech tags.
  7. **Preferences & Eligibility**: Target roles, remote policy, compensation floor/target, notice period, work authorization status, visa sponsorship tri-state.
- **Application Readiness Bar**:
  - Live readiness evaluator showing exact missing or conflicting fields (e.g. *Needs attention: Phone number, Work authorization*).
  - Deep-link triggers that expand and focus the target drawer immediately.

---

### `/apps/radar` — Job Discovery & ATS Fit Radar
- **Purpose**: Evaluate candidate capability against target job postings.
- **Content**: Deterministic ATS match score (0–100), match category breakdown, satisfied requirements with evidence citations, missing requirements, and 1-click tailored application initiation.
- **AI Copilot Role**: Explains match breakdown, cites authentic profile evidence, and refuses to fabricate unevidenced requirements.

---

### `/applications` & `/apply` — Application Pipeline & Safe Handoff
- **Purpose**: 4-step linear preparation and submission tracking:
  - Step 1: Review screening readiness.
  - Step 2: Answer employer-specific screening questions (isolated in application scope).
  - Step 3: Tailor resume and cover letter with zero-hallucination verification.
  - Step 4: Final review, applicant declaration, and handoff kit export.
- **Rule**: Reuses canonical profile facts automatically; never forces re-typing of already established profile information.

---

### `/resumes` — Resume & Artifact Portfolio
- **Purpose**: Manage uploaded source resumes and compiled LaTeX ATS resume artifacts.
- **Content**: Baseline resume ingestion, evidence claim review, and one-page PDF downloads.

---

## 2. Technical Documentation Separation
All developer-facing details (Model Context Protocol, JSON-RPC endpoints, OAuth 2.1 specs, CQRS, evidence AST extractors, calibration mathematics) are strictly segregated to:
- Public Documentation: `/docs/mcp`
- Security Architecture: `/security`
- Markdown Repository Specs: `DESIGN.md`, `goal.md`, `project.md`, `SECURITY.md`
Normal job-seeking candidates never see internal engineering terms in primary workflows.

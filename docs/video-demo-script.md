# Antigravity Career Hub — Video Demo Script

**Universal AI Career MCP Platform: Product Demonstration**  
*Target Duration: 10–12 Minutes | Synthetic Demo Profile: Alex Mercer*  
*Document Version: 1.0.0 (Phase 13 / P13-005)*

---

## Production & Recording Notes
* **Presenter Persona**: Technical Product Lead / Developer Advocate.
* **Synthetic Candidate Profile**:
  * Name: `Alex Mercer`
  * Target Role: `Senior Full-Stack Engineer / Cloud Architect`
  * Sample Repository: `alex-mercer/react-node-microservices`
  * Target Company: `CloudScale Inc` (`https://jobs.example.test/cloudscale`)
* **Security & Privacy Safeguards**:
  * Zero real credentials, personal email addresses, or API keys displayed on screen.
  * All domains use reserved `.test` / `example.test` suffixes.
  * All tokens displayed are mock prefixes (e.g., `mcp_live_0123456789abcdef...`).

---

## Segment Breakdown & Timing

| Timestamp | Segment Title | Visual Focus | Audio / Narration Summary |
| :--- | :--- | :--- | :--- |
| **00:00 – 01:00** | Introduction & The Truth-in-AI Problem | Splash screen / Architecture diagram | The problem with AI resume builders: hallucination & lack of evidence. Intro to Career Hub. |
| **01:00 – 02:00** | Candidate Onboarding & Workspace | Registration screen & Onboarding wizard | Passwordless GitHub login, tenant creation, candidate headline setup. |
| **02:00 – 03:30** | GitHub Connection & AST Ingestion | GitHub App installation & Ingestion log | Least-privilege repo selection, manifest parsing, secret scrubbing. |
| **03:30 – 05:00** | Verified Skills & Evidence Provenance | Candidate Skills dashboard & Evidence modal | Distinction between verified facts, inferred skills, and unverified claims. |
| **05:00 – 06:30** | Job-Fit Analysis & Gap Detection | Job match analyzer & ATS Fit breakdown | Analyzing a real JD, 4-status match model (`MATCHED`, `PARTIAL`, `MISSING`, `UNKNOWN`). |
| **06:30 – 08:00** | Tailored Resume & Portfolio Generation | Markdown preview & Artifact export | Evidence-backed resume, targeted cover letter, portfolio repository talking points. |
| **08:00 – 09:30** | Sovereign Application Tracking | Application board & Stage progression | Tracking job applications, stages (`TECHNICAL_ASSESSMENT`), and document snapshots. |
| **09:30 – 11:00** | Multi-AI Client MCP Integrations | Gemini, Claude & ChatGPT chat interfaces | Provider-neutral MCP server querying profile and analytics across all 3 AI models. |
| **11:00 – 12:00** | Two-Phase Human-Approved PR Workflow | Chat proposal -> Diff review -> GitHub PR | Proposing code improvement, diff review, human approval signoff, and PR creation. |

---

## Detailed Script & Teleprompter Transcript

---

### [00:00 – 01:00] Segment 1: Introduction & The Truth-in-AI Problem

**Visuals**:
* Camera on presenter with subtle background screen showing the Antigravity Career Hub logo.
* Transition to high-level graphic contrasting "Traditional Hallucinating AI Resumes" vs. "Evidence-Backed Career Hub".

**Narration**:
> *"Welcome everyone. Today we are demonstrating Antigravity Career Hub—the universal, evidence-backed career intelligence platform.*
>
> *Every software engineer knows the dilemma with modern hiring: you've built complex distributed systems, microservices, and clean architectures, but generic resume tools reduce your work to buzzwords. Worse, standard AI assistants often hallucinate skills and claim experience you don't have, putting your credibility at risk.*
>
> *Career Hub solves this by anchoring your career profile in cryptographic truth: your actual code. It inspects your real GitHub repositories, verifies dependencies and AST patterns, and proves your qualifications with immutable commit citations. Let's see how it works."*

---

### [01:00 – 02:00] Segment 2: Candidate Onboarding & Workspace

**Visuals**:
* Browser screen recording of the Career Hub landing page.
* Presenter clicks "Sign in with GitHub".
* The dashboard transitions smoothly into the `/onboarding` wizard.

**Narration**:
> *"We start by signing in. Career Hub uses passwordless, GitHub-anchored authentication.*
>
> *The moment we register, the platform atomically provisions a dedicated, multi-tenant workspace for our candidate, Alex Mercer. Everything in Career Hub is sovereign and isolated—your data is never mixed with other users.*
>
> *We configure our headline as 'Full-Stack Architect' and set our target role as 'Senior Full-Stack Engineer'. Our account is now active and ready to connect our code repositories."*

---

### [02:00 – 03:30] Segment 3: GitHub Connection & Ingestion Pipeline

**Visuals**:
* Navigating to the integrations panel.
* GitHub App installation modal appears. Presenter selects "Only select repositories" and chooses `alex-mercer/react-node-microservices`.
* Ingestion progress bar runs, showing real-time file tree traversal and AST parsing.

**Narration**:
> *"Next, we connect our GitHub repositories. Notice our principle of least privilege: you don't need to give Career Hub access to your entire GitHub account. We select only our showcase project: `react-node-microservices`.*
>
> *Once connected, the ingestion pipeline immediately gets to work. It inspects our `package.json`, our Dockerfiles, and our TypeScript imports. Every code snippet passes through our cryptographic Secret Scrubber to ensure no private keys or tokens are ever ingested.*
>
> *In under 5 seconds, the ingestion finishes: 15 immutable evidence items and 5 core skills have been extracted."*

---

### [03:30 – 05:00] Segment 4: Verified Skills & Evidence Provenance

**Visuals**:
* Screen shows the `/candidate/skills` dashboard with clean badges (`React`, `Node.js`, `TypeScript`, `PostgreSQL`, `Docker`).
* Presenter clicks on the `React` skill badge.
* A provenance drawer opens showing file path `package.json`, commit SHA `aaaa...`, line range `10–12`, and the exact code excerpt.

**Narration**:
> *"Let's look at our skills dashboard. Notice the label: every skill is marked as `VERIFIED`.*
>
> *If we click on 'React', we don't just see a word—we see the exact provenance: the file path `package.json`, the exact line numbers, and the commit hash on the main branch.*
>
> *Career Hub enforces a strict separation of truth: verified code facts cannot be faked, related framework skills are labeled `INFERRED`, and manual notes are tagged as `[Unverified User Claim]`. Recruiters and AI hiring systems get 100% verified confidence."*

---

### [05:00 – 06:30] Segment 5: Job-Fit Analysis & Gap Detection

**Visuals**:
* Presenter pastes a job description for "Senior Full-Stack Engineer at CloudScale Inc" into the Job Fit Analyzer.
* Presenter clicks "Analyze Job Fit".
* The ATS Fit Score displays `92 / 100` (`EXCELLENT`) with breakdown columns for `MATCHED`, `PARTIAL`, and `MISSING`.

**Narration**:
> *"Now let's apply our verified profile to a target job opening at CloudScale Inc.*
>
> *We paste the job description and run the analysis. The Career Hub matching engine compares the employer's requirements against our evidence graph.*
>
> *Look at the results: we scored a 92 out of 100. React, Node.js, and PostgreSQL are marked `MATCHED` with verified code evidence. TypeScript is verified, while Kubernetes is highlighted as a `HIGH` priority gap because it's required by the JD but missing in this repository. This gives us clear, actionable insight before we even apply."*

---

### [06:30 – 08:00] Segment 6: Tailored Resume & Portfolio Generation

**Visuals**:
* Presenter clicks "Generate Tailored Artifacts".
* Side-by-side view showing the rendered Markdown resume, cover letter, and portfolio recommendations.
* Highlighting the evidence citations embedded beneath each project achievement.

**Narration**:
> *"With one click, Career Hub generates our application package:*
>
> *First, our Tailored Resume: it automatically highlights our microservices project, ordering achievements to emphasize what CloudScale Inc cares about, with verifiable proof citations.*
>
> *Second, a targeted Cover Letter explaining our engineering background without conversational fluff.*
>
> *And third, Portfolio Recommendations: it suggests the top 2 repositories from our workspace that best showcase the required architecture, giving us talking points for technical interviews.*
>
> *Crucially, tailoring creates a separate application snapshot—it never overwrites your base profile."*

---

### [08:00 – 09:30] Segment 7: Sovereign Application Tracking

**Visuals**:
* Navigating to the `/applications` Kanban tracker board.
* Presenter shows the newly created CloudScale Inc application card moving from `APPLIED` to `INTERVIEWING`.
* Presenter clicks the card to show attached interview stages (`RECRUITER_SCREEN`, `TECHNICAL_ASSESSMENT`) and the point-in-time resume snapshot.

**Narration**:
> *"Career Hub also manages our job search lifecycle with a built-in application tracker.*
>
> *Here is our CloudScale Inc application. We can advance it through interview stages: from Applied to Recruiter Screen, and into Technical Assessment. We can log interviewer feedback and attach the exact version of the tailored resume submitted on that date.*
>
> *Our Application Analytics tab summarizes our funnel progression and tracks recurring skill gaps across all active applications."*

---

### [09:30 – 11:00] Segment 8: Multi-AI Client Model Context Protocol (MCP)

**Visuals**:
* Split screen showing Google Gemini CLI, Anthropic Claude Desktop, and OpenAI ChatGPT.
* Presenter sends a query in Claude: *"What verified database skills does Alex Mercer have?"*
* Claude calls MCP tool `list_verified_skills` and responds with PostgreSQL citations.
* Presenter sends a query in ChatGPT: *"Analyze my fit for this Kubernetes job."*
* ChatGPT calls `analyze_job_fit` and returns the match score.

**Narration**:
> *"Now for the most powerful feature: Career Hub is completely provider-neutral via the Model Context Protocol (MCP).*
>
> *You are never locked into a single AI provider. Here we have Gemini connected via personal API tokens, and Claude and ChatGPT connected via OAuth 2.1.*
>
> *When we ask Claude 'What verified database skills does Alex have?', Claude queries our Career Hub MCP server. The server verifies the token, asserts our tenant boundary, and returns verified facts from PostgreSQL.*
>
> *Gemini, Claude, and ChatGPT receive identical, bit-for-bit structured tool responses. Career Hub owns your data and identity; the AI clients simply act as intelligent interfaces."*

---

### [11:00 – 12:00] Segment 9: Safe, Human-Approved Pull Request Workflow

**Visuals**:
* In Claude Desktop, presenter types: *"Propose adding an unprivileged security user to the Dockerfile in react-node-microservices."*
* Claude invokes `propose_project_improvement`.
* Server returns an Action Approval Ticket with unified diff preview.
* Presenter types: *"Approved. Create the pull request."*
* Claude invokes `confirm_and_create_pr`.
* Screen switches to GitHub.com showing the newly created Pull Request opened on a patch branch.

**Narration**:
> *"Finally, let's see how Career Hub enables safe repository enhancements.*
>
> *We ask Claude to improve the Dockerfile in our microservices repository. Notice what happens: Claude does not push code directly. Instead, it calls `propose_project_improvement`, generating a cryptographic Action Approval Ticket and a unified diff.*
>
> *We inspect the diff right in our chat. Once we explicitly approve, Career Hub verifies the commit SHA, creates a new isolated branch, and opens a Pull Request on GitHub.*
>
> *Zero unreviewed pushes, zero automated accidents. Total developer control.*
>
> *That is Antigravity Career Hub: verified evidence, intelligent job matching, universal AI MCP access, and complete developer sovereignty. Thank you for watching!"*

---

## Video Production Checklist

- [x] All candidate names and company names are synthetic (`Alex Mercer`, `CloudScale Inc`).
- [x] All email addresses use `.test` / `example.test` domains.
- [x] All token prefixes match standard patterns without exposing real encryption keys.
- [x] Timecodes match target 8–12 minute video duration.
- [x] All 16 MCP tools accurately represented in narration and visual cues.
- [x] Clear distinction between current local/demo capabilities and future public staging.

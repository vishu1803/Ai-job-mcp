# Portfolio Recommendation Engine Architecture (ARCH-019)
**Status**: APPROVED  
**Date**: 2026-08-22  
**Author**: Antigravity Career Hub Engineering  
**Decision Record**: ADR-039 in `docs/decisions.md`

---

## 1. Industry Research Findings & Citations

To construct an evidence-first, high-impact Portfolio Recommendation Engine, we synthesized empirical findings from technical recruitment studies, engineering leadership surveys, and portfolio review practices.

### 1.1 Technical Recruiter vs. Engineering Hiring Manager Scanning Behavior
*   **Recruiter Screening Context**: Technical recruiters conduct rapid initial triage, spending an average of **15 to 30 seconds** on a candidate profile ([hiremateai.com](https://www.hiremateai.com), [onehour.digital](https://onehour.digital)). They evaluate explicit keyword matches against target job requirements, verified tech stack presence, live deployment links, and clear navigation.
*   **Hiring Manager Deep-Dive**: Engineering hiring managers spend **1 to 3 minutes** evaluating shortlisted candidates ([refactortalent.com](https://refactortalent.com), [soltech.net](https://soltech.net)). Their goal is **risk mitigation**: evaluating whether the candidate possesses practical technical judgment, understands trade-offs, writes production-grade code, and can ship maintainable systems independently.

| Dimension | Technical Recruiter (Initial Filter) | Engineering Hiring Manager (Technical Decision) |
| :--- | :--- | :--- |
| **Primary Objective** | Minimum qualification screening & job description fit | Risk mitigation, engineering depth & team fit |
| **Scan Duration** | 15–30 seconds | 1–3 minutes (shortlisted) |
| **Primary Signals** | Stack match, clean presentation, live links | Architectural decisions, trade-offs, code quality, testing |
| **Common Red Flags** | Missing required skills, broken links, clutter | Tutorial clones, zero tests, superficial CRUD apps |

### 1.2 Curated Size & The "Rule of 2–4"
*   **Quality Beats Quantity**: Industry consensus overwhelmingly rejects portfolios containing 10+ superficial repositories ([refactortalent.com](https://refactortalent.com), [dev.to](https://dev.to)). A long list of trivial "toy" applications dilutes the candidate's strongest work and signals a lack of professional curation.
*   **Optimal Project Count**: Featuring **2 to 4 (maximum 5)** deep, well-documented, and production-grade projects provides sufficient signal breadth while preventing cognitive overload.

### 1.3 Case-Study Storytelling & Decision Logic
*   **Moving Beyond Feature Lists**: Engineering managers report that simply listing features or tech stacks provides weak signal. High-impact portfolios structure projects around **decision logic**: *Problem Context $\rightarrow$ Candidate Role $\rightarrow$ Architecture $\rightarrow$ Technical Decisions & Trade-offs $\rightarrow$ Verification/Proof $\rightarrow$ Outcomes & Retrospective*.
*   **The "Messy Middle"**: Documenting constraints, abandoned alternative approaches, and operational trade-offs (e.g., *choosing PostgreSQL over MongoDB for transactional ACID guarantees*) strongly signals senior engineering maturity.

### 1.4 Tutorial / Clone Detection & Authenticity
*   **The Clone Problem**: Generic tutorial clones (e.g., standard To-Do apps, clone tutorials from popular bootcamps) signal ability to follow instructions rather than independent problem solving.
*   **Safe Detection Signals**: Authentic evaluation requires detecting fork status, template repository metadata, low commit velocity, lack of custom tests/CI, and boilerplate README structures.

### 1.5 Citations & External References
1. **Refactor Talent** (2025/2026): *How Engineering Leaders Evaluate Developer Portfolios and Github Activity*. Focus on decision-making, trade-offs, and risk mitigation.
2. **Soltech Engineering Insights**: *Technical Portfolio Evaluation Best Practices for Software Hiring Managers*. Emphasis on live deployments, README quality, and architectural documentation.
3. **Emily Backes Design & Research**: *Recruiter and Hiring Manager Cognitive Load in Technical Portfolio Scanning*. Eye-tracking and time-on-page metrics.
4. **Dev.to Engineering Career Series**: *Curating Developer Portfolios: Quality Over Quantity in the Modern Hiring Market*.

---

## 2. Product Objective & Core Principles

### 2.1 The Core Product Question
The Portfolio Recommendation Engine does not merely answer:
> *"Which repositories have the highest individual keyword match score?"*

It answers:
> *"Which small, cohesive set of projects gives this candidate the strongest, most credible, and complementary technical argument for THIS specific job?"*

### 2.2 Core Architectural Principles
1. **Evidence-First Authority**: Recommendations are strictly grounded in verified repository artifacts (`IntegrityCheckedAssertions`, commit-pinned `EvidenceRefs`, and `ProjectRelevanceAnalysis`).
2. **Quality Over Quantity**: If a candidate only possesses two strong, production-grade projects, the engine recommends exactly two. It never pads portfolios with weak or superficial repositories.
3. **Signal Complementarity**: The engine selects projects that maximize distinct, non-redundant engineering competencies (e.g., Backend Architecture + Frontend State Management + DevOps/CI/CD).
4. **Marginal Value Optimization**: Each additional recommended project must contribute new verified skills, unrepresented architectural patterns, or target job requirements.
5. **Decoupled Architecture**: Strictly separates the **Recommendation Engine** (*WHAT to feature and why*), from the **Content Adapter** (*HOW to synthesize narrative summaries*), from the **Renderer** (*HOW to present the UI/PDF*).
6. **Multi-Tenant Isolation**: Default-deny multi-tenant isolation enforcing `404 NotFoundError` across all foreign tenant resources.
7. **Zero Premature Persistence**: Ephemeral in-memory evaluation without premature database mutations in Phase 6.

```
                          ┌────────────────────────────────────────────────────────┐
                          │               INPUTS (Phase 4 & Phase 5)               │
                          │ - CandidateProfile (P4-005)                           │
                          │ - JobDescription (P5-001)                             │
                          │ - CandidateMatchAnalysis (P5-003)                     │
                          │ - ProjectRelevanceAnalysis (P5-004)                   │
                          │ - IntegrityCheckedAssertions (P5-006)                 │
                          └─────────────────────────┬──────────────────────────────┘
                                                    │
                                                    ▼
    ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
    │                      PORTFOLIO RECOMMENDATION ENGINE (P6-003)                                │
    │                                                                                             │
    │   ┌───────────────────────────┐    ┌───────────────────────────┐    ┌───────────────────┐   │
    │   │  Candidate Project Filter │    │ Signal Diversity Engine   │    │ Marginal Utility  │   │
    │   │  - Ownership Confidence   │───▶│ - Signal Complementarity  │───▶│ Optimizer         │   │
    │   │  - Tutorial / Clone Guard │    │ - Anti-Inflation Coverage │    │ - Bounded Sizing  │   │
    │   └───────────────────────────┘    └───────────────────────────┘    └─────────┬─────────┘   │
    │                                                                               │             │
    │   ┌───────────────────────────┐    ┌───────────────────────────┐              │             │
    │   │ Explanability Generator   │    │ Case Study Generator      │◀─────────────┘             │
    │   │ - "Why Featured" Rationale│    │ - Decision Prompts        │                            │
    │   │ - Highlighted Skills (≤6) │    │ - Interview Questions     │                            │
    │   └───────────────────────────┘    └───────────────────────────┘                            │
    └───────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                                    │
                                                    ▼
                          ┌────────────────────────────────────────────────────────┐
                          │               OUTPUT: PortfolioRecommendation          │
                          │ - featuredProjects (1 to 5)                            │
                          │ - supportingProjects (0 to 3)                          │
                          │ - deprioritizedProjects                                │
                          │ - highlightedSkills (bounded ≤ 6)                      │
                          │ - targetRequirementsCovered / uncovered                │
                          │ - caseStudyRecommendations                             │
                          │ - portfolioWarnings & User Overrides                   │
                          └────────────────────────────────────────────────────────┘
```

---

## 3. Portfolio Recommendation Domain Model

The canonical domain model `PortfolioRecommendation` encapsulates the curated project strategy:

```javascript
/**
 * Canonical Portfolio Recommendation Domain Schema
 */
export const PortfolioRecommendationSchema = z.object({
  recommendationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  candidateId: z.string().uuid(),
  targetJobId: z.string().uuid(),
  targetJobTitle: z.string().min(1).max(255),
  targetCompanyName: z.string().min(1).max(255),
  jobFamily: z.enum([
    'BACKEND',
    'FRONTEND',
    'FULLSTACK',
    'DEVOPS_CLOUD',
    'DATA_ML',
    'AI_ENGINEERING',
    'GENERAL_SOFTWARE',
  ]),
  
  // Curated Project Tiers
  featuredProjects: z.array(FeaturedProjectRecommendationSchema).min(1).max(5),
  supportingProjects: z.array(SupportingProjectRecommendationSchema).max(5),
  deprioritizedProjects: z.array(DeprioritizedProjectSchema),

  // Hiring Signals & Coverage
  portfolioStrategySummary: z.string().min(10),
  overallPortfolioConfidence: z.number().min(0.0).max(1.0),
  targetRequirementsCovered: z.array(RequirementCoverageItemSchema),
  uncoveredRequirements: z.array(z.string()),
  highlightedSkills: z.array(HighlightedSkillSchema).max(6),
  
  // Case Study & Interview Enablement
  caseStudyRecommendations: z.array(CaseStudyRecommendationSchema),
  
  // Health & Warnings
  portfolioWarnings: z.array(PortfolioWarningSchema),
  
  // Metadata
  metadata: PortfolioRecommendationMetadataSchema,
}).strict();
```

---

## 4. Featured Project Selection & Bounded Project Sizing

### 4.1 Bounded Sizing Rule: 1 to 5 Projects
The engine deterministically selects between **1 and 5** featured projects based strictly on evidence depth:
*   **Count = 1**: Returned only when the candidate has exactly one verified project with substantial architectural depth and high job relevance.
*   **Count = 2–3 (Optimal Standard)**: The default recommendation for most candidates with high-quality evidence.
*   **Count = 4–5**: Recommended only when a candidate possesses multiple distinct, high-scoring projects that provide high marginal value across disparate job requirements without signal dilution.

### 4.2 Minimum Quality Threshold for Featured Status
A project is eligible for `featuredProjects` only if it satisfies all of the following:
1. `projectRelevanceScore >= 60.0` (from `ProjectRelevanceAnalysis`)
2. `ownershipConfidence in ['DIRECT', 'SUPPORTED']`
3. `tutorialClassification != 'LIKELY_TUTORIAL'`
4. Contains $\ge 1$ verified technical skill mapped to target job requirements.

---

## 5. Quality vs. Quantity Deterministic Rule

To prevent many weak/trivial projects from outranking a single strong, production-grade project, the engine establishes a deterministic quality floor:

$$\text{ProjectQualityScore} = w_{\text{arch}} \cdot S_{\text{arch}} + w_{\text{eng}} \cdot S_{\text{eng}} + w_{\text{rel}} \cdot S_{\text{rel}} + w_{\text{demo}} \cdot S_{\text{demo}}$$

Where:
*   $S_{\text{arch}}$: Architectural Density Score ($\ge 10$ imports/modules, clean directory layering)
*   $S_{\text{eng}}$: Engineering Maturity Score (tests, CI/CD, database schemas)
*   $S_{\text{rel}}$: Target Job Requirement Match Score
*   $S_{\text{demo}}$: Live Deployment / Verification Quality Score

**Rule of Discarding Superficial Repositories**:
*   A project with $S_{\text{arch}} < 30.0$ and zero test/CI evidence is classified as `SUPERFICIAL_PROJECT` and cannot enter `featuredProjects`, regardless of keyword matches.
*   The portfolio engine will recommend a 2-project portfolio of high quality over a 5-project portfolio containing superficial repositories.

---

## 6. Signal Diversity & Complementarity Engine

### 6.1 Avoiding Duplicate Coverage Inflation
When a candidate possesses multiple projects demonstrating identical skills (e.g., three basic CRUD apps in React and Express), presenting all three provides zero additional hiring signal and wastes hiring manager attention.

### 6.2 The 7 Core Architectural Signal Dimensions
Every candidate project is classified across orthogonal engineering signal dimensions:
1. `BACKEND_DISTRIBUTED`: Concurrency, microservices, gRPC, message queues, storage engines.
2. `DATABASE_DATA_MODELING`: Relational schemas, migrations, query optimization, indexing.
3. `FRONTEND_UI_UX`: Responsive layouts, component architecture, state management, accessibility.
4. `DEVOPS_INFRASTRUCTURE`: Docker, CI/CD pipelines, Kubernetes, Terraform, cloud deployment.
5. `SECURITY_AUTH`: JWT/OAuth, role-based access control, cryptographic verification, secret scrubbing.
6. `TESTING_QUALITY`: Unit tests, integration suites, test automation, mocks.
7. `API_INTEGRATIONS`: Third-party webhooks, rate limiting, external SDK integration.

### 6.3 Signal Complementarity Score ($S_{\text{comp}}$)
For a candidate set of selected projects $\mathcal{P} = \{P_1, P_2, \dots, P_k\}$, the Signal Complementarity Score measures the proportion of distinct required job signal categories covered by the collective set:

$$\text{SignalComplementarityScore}(\mathcal{P}) = \frac{\left| \bigcup_{P \in \mathcal{P}} \text{Signals}(P) \cap \text{RequiredSignals}(\text{Job}) \right|}{\left| \text{RequiredSignals}(\text{Job}) \right|}$$

---

## 7. Required-Skill Coverage & Anti-Inflation Analysis

The engine links each featured project directly to the verified requirements it fulfills in the `JobDescription`:
*   **Primary Anchor Requirement**: The highest-priority required skill uniquely demonstrated by this project.
*   **Secondary Covered Requirements**: Additional required or preferred skills supported by commit-pinned evidence in this project.
*   **Anti-Inflation Invariant**: If `Project A` and `Project B` both demonstrate `PostgreSQL`, the coverage ledger attributes `PostgreSQL` to the project with the highest verification quality / commit depth and marks the second occurrence as `REDUNDANT_COVERAGE`.

---

## 8. Marginal Project Value Optimization

Portfolio curation is modeled as a bounded greedy optimization algorithm. Starting with an empty set $\mathcal{P}_0 = \emptyset$, at each step $k$, candidate project $P^*$ is chosen to maximize the Marginal Project Value:

$$P^* = \arg\max_{P \notin \mathcal{P}_{k-1}} \text{MarginalProjectValue}(P \mid \mathcal{P}_{k-1})$$

$$\text{MarginalProjectValue}(P \mid \mathcal{P}_{k-1}) = \alpha \cdot \Delta \text{ReqCoverage}(P) + \beta \cdot \Delta \text{SignalDiversity}(P) + \gamma \cdot S_{\text{eng}}(P) + \delta \cdot S_{\text{interview}}(P)$$

Where:
*   $\Delta \text{ReqCoverage}(P)$: Number of *previously uncovered* required job skills fulfilled by $P$.
*   $\Delta \text{SignalDiversity}(P)$: Number of *new architectural signal dimensions* introduced by $P$.
*   $S_{\text{eng}}(P)$: Engineering maturity score of $P$.
*   $S_{\text{interview}}(P)$: Technical interview discussion value of $P$.
*   $\alpha=0.40, \beta=0.25, \gamma=0.20, \delta=0.15$

**Halting Condition**:
The algorithm terminates when:
1. $k = \text{maxFeaturedCount}$ (default 3, max 5), OR
2. $\text{MarginalProjectValue}(P^*) < \text{THRESHOLD}_{\text{marginal}}$ (preventing dilution with low-value additions).

---

## 9. Engineering Maturity Indicators

The engine evaluates concrete repository evidence indicators of engineering maturity:
1. **Automated Testing Suite**: Presence of test manifests (`vitest.config.ts`, `jest.config.js`, `*_test.go`, `tests/`) and assertion density.
2. **CI/CD Automation**: Presence of workflow configurations (`.github/workflows/`, `Dockerfile`, `docker-compose.yml`).
3. **Database Migration Disciplines**: Presence of structured migration directories (`drizzle/`, `migrations/`, `alembic/`).
4. **Architectural Separation**: Clean directory modularization (`src/services/`, `src/domain/`, `pkg/api/`) vs. single-file flat scripts.
5. **Observability & Logging**: Structured loggers, error-handling middleware, and metric emitters.

*Invariant*: Repository file count and dependency volume are never equated with engineering maturity. Quality is measured by architectural intent and evidence structure.

---

## 10. Ownership and Contribution Confidence

A repository may represent solo development, group work, forks, or contributions. The engine assigns an explicit `OwnershipConfidence` and `ContributionConfidence` without guessing:

```typescript
export const OwnershipConfidenceEnum = z.enum([
  'DIRECT_OWNER',      // Candidate created and owns the repository
  'ORGANIZATION_MEMBER',// Belongs to candidate's linked organization
  'COLLABORATOR',      // Confirmed multi-author contributor
  'FORK_UPSTREAM',     // Forked repository with custom commits
  'UNCERTAIN',         // Unresolved provenance
]);

export const ContributionConfidenceEnum = z.enum([
  'PRIMARY_AUTHOR',    // Candidate accounts for >= 60% of verified commits
  'MAJOR_CONTRIBUTOR', // Candidate accounts for 20% - 59% of verified commits
  'MINOR_CONTRIBUTOR', // Candidate accounts for < 20% of verified commits
  'UNVERIFIED',        // Cannot determine individual author share from AST
]);
```

*Policy*: The portfolio engine explicitly discloses `ContributionConfidence` and never presents organizational team achievements as exclusive solo work.

---

## 11. Tutorial & Clone Detection Safeguards

The engine evaluates projects for tutorial/clone indicators:
*   **Indicator 1 (Fork & Template Metadata)**: `isFork === true` or GitHub template repository origin with zero commit divergence.
*   **Indicator 2 (Conventional Tutorial Titles)**: Match against known tutorial patterns (`todo-app`, `weather-app-tutorial`, `netflix-clone`, `react-shopping-cart-starter`).
*   **Indicator 3 (Commit Velocity & Spread)**: Single initial commit containing 10,000 LOC followed by zero subsequent evolution.
*   **Indicator 4 (Boilerplate README)**: Default `create-react-app` or `Vite` README without project-specific problem statements.

**Classification Levels**:
*   `LIKELY_TUTORIAL`: Deprioritized from `featuredProjects` unless the candidate has explicitly customized the architecture with verified evidence.
*   `LIKELY_ORIGINAL`: Standard evaluation.
*   `UNKNOWN`: Neutral baseline.

---

## 12. Live Demo & Deployment Signals

A live working demo significantly decreases reviewer friction during hiring manager evaluation.
*   **Deployment Signal Verification**: Verified links to production deployments (e.g., Vercel, Netlify, Fly.io, AWS, Docker Hub) or verified live documentation.
*   **Isolation Policy**: Deployment presence acts as a **presentation booster** and risk-reducer, but technical competency scoring remains strictly tied to code and commit evidence.

---

## 13. README & Case Study Quality Assessment

The engine parses the project `README.md` and evaluates **Story Completeness**:

```typescript
export const StoryCompletenessEnum = z.enum([
  'DOCUMENTED', // Clear problem, architecture, decisions, and setup
  'PARTIAL',    // Basic description and setup commands only
  'MISSING',    // Default template or empty README
]);
```

**Story Completeness vs. Technical Quality Decoupling**:
A repository with brilliant distributed systems code but an empty README receives `HIGH_TECHNICAL_DEPTH + MISSING_STORY_COMPLETENESS`. The engine does not discard the project; instead, it features the project and generates actionable **Case Study Prompts** instructing the candidate on what documentation to add.

---

## 14. Outcome & Metric Integrity Guard

In accordance with `AGENTS.md` Rule 14 and `ARCH-016`:
*   Quantitative business metrics (e.g. *"reduced latency by 60%"*, *"handled 1M req/sec"*) are recommended only when backed by explicit candidate evidence or benchmark results.
*   If no empirical metric exists in candidate records, the engine never hallucinates numbers. It provides candidate interview prompts: *"If you conducted performance benchmarking or stress tests on this project, add verifiable latency/throughput figures to your case study."*

---

## 15. Deterministic Case Study Recommendations

For every featured project, the engine emits a structured `CaseStudyRecommendation` containing candidate prompts:

```typescript
export const CaseStudyRecommendationSchema = z.object({
  projectId: z.string().uuid(),
  projectDisplayName: z.string(),
  whyFeatured: z.string(),
  primaryRoleHighlighted: z.string(),
  skillsToHighlight: z.array(z.string()),
  evidenceCitations: z.array(EvidenceRefSchema).max(5),
  missingStoryElements: z.array(z.string()),
  interviewPrepQuestions: z.array(z.string()).max(5),
});
```

**Sample Candidate Case-Study Prompts**:
1. *Context*: "What business or technical problem prompted building this system?"
2. *Architecture*: "Why did you choose PostgreSQL over a document store for this service?"
3. *Trade-offs*: "What was the most difficult architectural constraint you had to balance?"
4. *Retrospective*: "If you were refactoring this system for 10x scale today, what would you alter first?"

---

## 16. Technical Interview Discussion Value

The engine calculates an `InterviewDiscussionValue` score ($0–100$) reflecting how effectively a project serves as an interview anchor:
*   **High Value (80–100)**: Complex multi-tier architectures, non-trivial data structures, custom middleware, error handling, rate limiting, and automated test coverage.
*   **Moderate Value (50–79)**: Standard full-stack web applications with clean REST/GraphQL endpoints and database integration.
*   **Low Value (0–49)**: Static landing pages, simple scripts, or tutorial exercises.

---

## 17. Recency Signal Weighting

While recency is valuable, it is never allowed to dominate over technical depth.
*   Projects updated within 6 months receive a modest recency bonus ($+5\%$).
*   An older project (e.g., 2 years old) demonstrating deep distributed systems principles retains its high ranking over a brand-new but trivial utility script.

---

## 18. Story Completeness vs. Technical Depth Decoupling

The engine maintains orthogonal ratings:
1. `technicalCompetenceScore` (Code, AST, dependencies, tests, commits)
2. `storyCompletenessScore` (README clarity, architecture diagrams, decision logs)

This prevents great code with poor documentation from being silently erased, transforming the recommendation engine into an active coaching copilot.

---

## 19. Bounded Multi-Objective Portfolio Optimization Algorithm

The complete portfolio selection algorithm operates deterministically in five distinct stages:

```
Stage 1: Filter Eligible Projects
  ├── Remove foreign tenant repositories (Tenant Default-Deny)
  ├── Filter out LIKELY_TUTORIAL and SUPERFICIAL_PROJECT items
  └── Score individual candidates using ProjectQualityScore

Stage 2: Greedy Marginal Value Iteration
  ├── Step 1: Select top anchor project P_1 (Highest Job Relevance + Quality)
  ├── Step 2: For k = 2..5, calculate MarginalProjectValue(P_i | P_selected)
  ├── Step 3: Add project with highest marginal value if above marginal threshold
  └── Step 4: Halt when target count is reached or marginal gains saturate

Stage 3: Classify Secondary & Deprioritized Projects
  ├── Unselected high-quality projects -> supportingProjects (0 to 3)
  └── Low-relevance / tutorial projects -> deprioritizedProjects with explicit rationale

Stage 4: Synthesize Case Study Recommendations & Rationale
  ├── Generate "Why Featured" explanations
  ├── Extract commit-pinned EvidenceRefs (capped at 5 per project)
  └── Formulate tailored interview questions

Stage 5: Post-Generation Integrity Gate
  └── Audit all EvidenceRefs and assertions via ZeroHallucinationIntegrityService
```

---

## 20. Deterministic Project Ordering & Tie-Breaking

Featured projects are ordered deterministically using the following strict tie-breaking hierarchy:
1. **Primary Strategic Job Match** (Covers the highest number of required tier-1 skills)
2. **Project Relevance Score** (Descending)
3. **Engineering Maturity Score** (Descending)
4. **Interview Discussion Value** (Descending)
5. **Stable Project UUID Sort** (Guarantees bit-for-bit determinism across runs)

---

## 21. Highlighted Skills Selection (Bounded to Maximum 6)

Portfolios that display 30+ generic technology badges cause cognitive fatigue. The engine selects a tightly bounded set of **maximum 6 highlighted skills**:
*   Must be `VERIFIED` in candidate evidence.
*   Must map directly to target job requirements.
*   Ranked by requirement priority (`REQUIRED` > `PREFERRED`) and candidate verification quality.

---

## 22. Evidence Highlights Selection & Provenance Capping

Each featured project selects **up to 5 canonical evidence references**:
*   Evidence references cite authentic file paths, commit SHAs, and AST detection types.
*   Raw source code is never dumped into client views; concise excerpts ($\le 256$ chars) are provided.

---

## 23. Portfolio Presentation Modes

In alignment with the architecture established in `P6-001`:
1. `PRESERVE_EXISTING`: The candidate provides an existing portfolio repository list or website; the engine audits their portfolio, recommends which projects to promote/demote/reorder, and flags gaps.
2. `GENERATE_NEW`: The engine designs the complete optimal portfolio layout and featured project composition from scratch for the target job.

---

## 24. Decoupling: Recommendation vs. Content vs. Rendering

```
┌──────────────────────────────┐
│  Portfolio Recommendation    │  <-- P6-003: Computes WHAT projects to show,
│  Engine (Core Strategy)      │      signal coverage, ordering & interview prompts.
└──────────────┬───────────────┘
               │ (PortfolioRecommendation JSON)
               ▼
┌──────────────────────────────┐
│  Portfolio Content Adapter   │  <-- Future P6-003B: Synthesizes tailored case
│  (Narrative Synthesis)       │      study copy and project descriptions.
└──────────────┬───────────────┘
               │ (TailoredPortfolioContent JSON)
               ▼
┌──────────────────────────────┐
│  Portfolio Rendering Layer   │  <-- Phase 7 / UI / PDF / Markdown adapters:
│  (Visual Presentation)       │      Renders static web pages, JSON Resume, etc.
└──────────────────────────────┘
```

---

## 25. Extensible Job-Family Personalization

The engine dynamically adjusts signal weighting according to target role classifications:
*   **Backend Engineer**: Prioritizes `BACKEND_DISTRIBUTED`, `DATABASE_DATA_MODELING`, and API performance.
*   **Frontend Engineer**: Prioritizes `FRONTEND_UI_UX`, responsive design, state management, and web vitals.
*   **Full-Stack Engineer**: Requires signal complementarity across both frontend and backend domains.
*   **DevOps / Cloud Engineer**: Prioritizes `DEVOPS_INFRASTRUCTURE`, Docker/Kubernetes, CI/CD, and IaC.
*   **Data / ML Engineer**: Prioritizes data pipelines, model inference, evaluation pipelines, and Python/SQL.
*   **AI Engineer**: Prioritizes LLM orchestration, vector databases, evaluation benchmarks, and agentic workflows.

---

## 26. User Control & Override Semantics

The engine respects user agency. Candidates can override recommendations:
*   `PIN_FEATURED`: Forces a project to be featured.
*   `EXCLUDE_PROJECT`: Suppresses a project from recommendation.
*   `REORDER_OVERRIDE`: Customizes featured project sequence.

When overrides are supplied, the engine recalculates requirement coverage and emits actionable warnings if an override creates an uncovered required skill.

---

## 27. Deterministic Explanations & Rationale Generation

Every project recommendation includes an explicit, understandable rationale:
> *"Featured as Anchor Project #1 because it provides verified evidence for 3 required skills (Go, PostgreSQL, Docker), demonstrates high architectural density (distributed storage microservice), and fulfills the target role's core backend infrastructure requirements."*

---

## 28. Trust, Integrity & Multi-Tenant Sovereign Isolation

*   **Tenant Isolation**: All candidate profiles, job descriptions, projects, and evidence items must verify `tenant_id === context.tenantId`. Mismatched IDs immediately trigger `NotFoundError` (404).
*   **Post-Generation Integrity Gate**: Every recommended project and citation is audited through `ZeroHallucinationIntegrityService` to ensure zero fabricated technologies, commits, or assertions.
*   **Ephemeral Statelessness**: Recommendations execute in-memory with sub-second latency and perform zero database writes.

---

## 29. LLM Linguistic Boundary & Performance/Persistence Contracts

### 29.1 LLM Boundary
*   **Deterministic Core**: All project scoring, marginal value calculations, filtering, ordering, and requirement coverage are performed by deterministic JavaScript algorithms.
*   **LLM Role (Optional)**: AI models are used strictly for linguistic polish of case-study interview questions and narrative prose within passive XML envelopes. The LLM is strictly prohibited from selecting projects or assigning scores.

### 29.2 Performance & Complexity Contract
*   Candidate projects are pre-filtered ($\le 50$ repositories).
*   Greedy marginal optimization operates in $\mathcal{O}(k \cdot N)$ where $k \le 5$ and $N \le 50$.
*   Execution latency is bounded at $< 50\text{ms}$ in-memory.

---

## 30. Verification & Test Strategy Matrix

The upcoming implementation (`P6-003`) will be verified across 26 test suites:
1. **Single Project Candidate**: Correctly recommends 1 project without padding.
2. **Standard 3–5 Project Candidate**: Selects optimal 3-project portfolio.
3. **Large Candidate Profile (20+ Projects)**: Tests bounded greedy selection performance.
4. **Duplicate Skill Coverage**: Proves anti-inflation rule prevents redundant CRUD selection.
5. **Marginal Value Optimization**: Proves high marginal value project is prioritized over redundant project.
6. **Signal Complementarity**: Validates diverse architectural signal maximization.
7. **Required Skill Coverage**: Verifies explicit coverage mapping against target job requirements.
8. **Engineering Maturity Weighting**: Verifies tested/modular project outranks flat unmaintained script.
9. **Tutorial / Clone Deprioritization**: Confirms tutorial clones are deprioritized with explicit warnings.
10. **Ownership / Contribution Confidence**: Verifies proper attribution of solo vs. organizational work.
11. **Live Demo Boost**: Verifies live deployment signal ranking enhancement.
12. **README Story Completeness**: Verifies technical depth is preserved when documentation is sparse.
13. **Interview Discussion Value**: Verifies rich decision histories yield higher interview value scores.
14. **Recency Balancing**: Verifies mature older projects are not unfairly penalized.
15. **Job-Family Personalization**: Verifies backend vs. frontend vs. DevOps tailoring.
16. **User Override Semantics**: Verifies candidate `PIN` and `EXCLUDE` overrides.
17. **100% Determinism**: Verifies bit-for-bit reproducible recommendations across 100 iterations.
18. **Multi-Tenant Default-Deny**: Verifies 404 on cross-tenant project, job, or evidence requests.
19. **Post-Generation Integrity Audit**: Verifies rejection of fabricated EvidenceIds.
20. **Zero DB Mutation Invariant**: Verifies 0 database writes during on-demand portfolio generation.

---

## 31. Architectural Decision Record (ADR-039) & Final Assessment

### Status
`P6-003A APPROVED` — The architecture is fully specified, evidence-grounded, and ready for clean, deterministic implementation in `P6-003`.

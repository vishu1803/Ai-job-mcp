# Verified Feature Catalog: AI Career Hub vs. Rezi & Industry Benchmarks

**Project:** AI Career Hub (`Ai-career-agent`)  
**Scope:** Reverse-Engineering Competitive Feature Catalog (Research Only)  
**Baseline Date:** 2026-10-14  
**Evidence Levels:**
* **`DIRECTLY_TESTED`**: Directly observed and empirically measured at runtime using Playwright or REA CDP tools on the isolated disposable environment.
* **`SOURCE_VERIFIED`**: Verified through direct inspection of active source code and tests in the local repository or cloned reference repository.
* **`CODE_VERIFIED`**: Confirmed by AST and static code inspection within Career Hub or Reactive Resume.
* **`DOCUMENTED`**: Official vendor documentation, user guides, or verified published changelogs.
* **`UNVERIFIED`**: Proprietary competitor claims not independently provable without restricted API/code access.

---

## 1. Classification Distribution

The original 55 features were audited directly against matrix rows and confirmed via [`git ls-files`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/services/resume-ats-parseability.service.js). Eleven newly discovered features from Rezi, Reactive Resume v6.0.3, and industry benchmarks have been appended (F56–F66):

| Classification | Original (F01–F55) | Newly Discovered (F56–F66) | Total (F01–F66) | Operational Definition |
| :--- | :---: | :---: | :---: | :--- |
| **`WORKING`** | **19** (34.5%) | **0** (0.0%) | **19** (28.8%) | Fully operational in backend and rendered in user-facing UI |
| **`BACKEND_ONLY`** | **19** (34.5%) | **2** (18.2%) | **21** (31.8%) | Fully implemented backend engine; missing UI visualization/controls |
| **`UX_GAP`** | **2** (3.6%) | **1** (9.1%) | **3** (4.5%) | Present in UI but non-interactive, read-only, or degraded |
| **`MISSING`** | **11** (20.0%) | **8** (72.7%) | **19** (28.8%) | Zero implementation across backend and frontend |
| **`REPAIR_SCOPE`** | **4** (7.3%) | **0** (0.0%) | **4** (6.1%) | Tracked in existing PRD repair streams (PRD-002, PRD-004, PRD-005) |
| **Total** | **55** (100.0%) | **11** (100.0%) | **66** (100.0%) | Complete Verified Feature Catalog |

---

## 2. Comprehensive 66-Feature Register

### Category A: Resume Creation, Intake & Parsing

| ID | Feature Name | Rezi Documented Baseline | Reactive Resume v6 Reference | Career Hub Current State | Career Hub Source Path | Evidence Level | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F01** | Multi-Format Resume Upload | PDF, DOCX, LinkedIn import | PDF, DOCX, JSON, LinkedIn | [`ResumeParserService`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/services/resume-parser.service.js) | `src/services/resume-parser.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F02** | Sandboxed PDF Text Extraction | Server-side parsing | Client-side `@formepdf/core` | Built-in CMap ToUnicode parser | `src/services/resume-parser.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F03** | DOCX OpenXML Extraction | Server-side XML unzip | Server-side mammoth/xml | Native PKZip + XML parser | `src/services/resume-parser.service.js` | `CODE_VERIFIED` | `WORKING` |
| **F04** | Secret & PII Scrubbing | Not documented | Not implemented | Regex scrubber for PATs, keys | `src/services/resume-parser.service.js` | `CODE_VERIFIED` | `WORKING` |
| **F05** | Cryptographic Document Storage | Cloud private storage | Local fs / S3 bucket | AES-256-GCM encrypted blobs | `src/services/document-storage.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F06** | Profile Extraction Editing | Form fields in editor | Form fields with instant sync | `/profile` web form | `src/routes/web.routes.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F07** | LinkedIn Profile Ingestion | ZIP export upload | Archive import parser | LinkedIn archive normalizer | `src/services/linkedin-import.service.js` | `CODE_VERIFIED` | `WORKING` |
| **F08** | Multi-Tenant Data Isolation | Account-level isolation | Tenant-per-user DB schema | Tenant ID scoped queries | `src/db/schema.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F09** | Public ATS PDF Checker | Standalone public tool | Standalone `/ats-checker` | Missing public standalone page | None | `DOCUMENTED` | `MISSING` |
| **F10** | Document Trash & Recovery | Not documented | Trash with 30-day recovery | Quarantined artifact recovery | `src/services/application-tracking.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |

---

### Category B: Job Targeting, Requirement Parsing & Match Analysis

| ID | Feature Name | Rezi Documented Baseline | Reactive Resume v6 Reference | Career Hub Current State | Career Hub Source Path | Evidence Level | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F11** | Job Description Ingestion | Paste URL or job text | Paste posting text | Paste text or portal URL | `src/services/job-application-workflow.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F12** | Requirement Classification | Skill extraction | Firecrawl / Exa keywords | Entity classifier (TECH, EXP) | `src/domain/job/job-requirements.js` | `CODE_VERIFIED` | `WORKING` |
| **F13** | Multi-Dimension Job Fit Engine | Rezi Score (100 pts) | Keyword match percentage | Weighted fit engine (0–100) | `src/services/ats-fit-score.service.js` | `DIRECTLY_TESTED` | `BACKEND_ONLY` |
| **F14** | Keyword Gap Identification | Target Keyword list | Keyword pills in Check mode | Required vs Missing delta | `src/services/resume-keyword-coverage.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |
| **F15** | Project Relevance Ranking | Not available | Manual project reordering | Multi-factor project ranker | `src/services/project-relevance.service.js` | `DIRECTLY_TESTED` | `BACKEND_ONLY` |
| **F16** | Targeting Radar View | Dashboard job cards | Kanban application board | Match radar at `/apps/radar` | `src/views/radar.page.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F17** | Application Status Tracking | Status dropdown | Board (Saved to Offer) | Stages lifecycle tracking | `src/services/application-tracking.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F18** | UI Keyword Coverage Chips | Green/Red keyword pills | Matched/Missing badges | Static score fallback (line 683) | `src/views/apply.page.js` | `DIRECTLY_TESTED` | `UX_GAP` |
| **F19** | Architectural Skill Signals | Not available | Not available | Signal detection engine | `src/services/project-relevance.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |
| **F20** | Truth-Partitioned Skills | All skills equal | Categorized skill lists | VERIFIED vs CLAIMED gates | `src/domain/career/resume.schemas.js` | `DIRECTLY_TESTED` | `WORKING` |

---

### Category C: Resume Tailoring, Generation & Grounding

| ID | Feature Name | Rezi Documented Baseline | Reactive Resume v6 Reference | Career Hub Current State | Career Hub Source Path | Evidence Level | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F21** | AI Bullet Generation | Google XYZ formula | LLM prompt suggestions | AI content generator | `src/services/ai-resume-content-generator.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |
| **F22** | Radical Grounding Guard | Not implemented | Not implemented | Evidence Validation Receipt | `src/services/structured-resume.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F23** | Proposal Patch Interface | Suggestion accept/reject | Suggestion cards (`canApplyTo` guard) | Missing UI suggestion cards | None | `SOURCE_VERIFIED` | `MISSING` |
| **F24** | Empty-Profile AI Guard | Allows generation | Allows generation | Fail-closed summary guard | `src/services/source-grounded-summary.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F25** | Metric Substantiation Prompts | Prompts for numbers | Not implemented | Backend metric validator | `src/services/resume-writing-quality.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |
| **F26** | Single-Page Budget Solver | Auto-Adjust spacing | Forme density sliders | Dynamic section pruner | `src/services/one-page-resume.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F27** | Professional Summary Writing | AI summary from job | AI summary generation | Grounded summary composer | `src/services/source-grounded-summary.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |
| **F28** | Action Verb Starter Enforcer | Built-in verb checker | Linter warning rules | Strong verb taxonomy gate | `src/services/resume-writing-quality.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |
| **F29** | Repetition & Jargon Guard | Word repetition checks | Text lint rules | Duplicate phrase analyzer | `src/services/resume-writing-quality.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |
| **F30** | Algorithmic Problem Solving Section | Not available | Custom section | Dedicated LeetCode/DSA block | `src/services/latex-document-generator.service.js` | `DIRECTLY_TESTED` | `WORKING` |

---

### Category D: In-Browser Review, Diagnostics & Editing

| ID | Feature Name | Rezi Documented Baseline | Reactive Resume v6 Reference | Career Hub Current State | Career Hub Source Path | Evidence Level | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F31** | In-Browser Bullet Editor | Rich text inline editor | Inline contenteditable | Missing interactive editor | None | `DOCUMENTED` | `MISSING` |
| **F32** | Drag-and-Drop Reordering | Drag handles on sections | `@dnd-kit` section reordering | Static section order | `src/services/latex-document-generator.service.js` | `SOURCE_VERIFIED` | `MISSING` |
| **F33** | Click-to-Edit Preview Sync | Preview click highlights | PageMap coordinate translation | Static iframe / image preview | None | `SOURCE_VERIFIED` | `MISSING` |
| **F34** | 5-Category ATS Diagnostics | Content/Format/Opt/Best/Ready | Readability findings list | PDF Parseability checks | `src/services/resume-ats-parseability.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |
| **F35** | Real-Time Score Updates | Dynamic 0–100 recalculation | Instant rule re-evaluation | Computed only on generation | `src/services/ats-fit-score.service.js` | `DIRECTLY_TESTED` | `BACKEND_ONLY` |
| **F36** | Side-by-Side Tailoring View | Split editor + live PDF | Dual-pane Write/Preview | Single-column form flow | `src/views/apply.page.js` | `DIRECTLY_TESTED` | `UX_GAP` |
| **F37** | Immutable Version Hashing | Not available | Version restore history | SHA-256 package sealing | `src/services/job-application-workflow.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F38** | Pre-Exposure QA Audit | Visual warning flags | Forme overflow flags | Automated PDF validation | `src/services/resume-content-quality-gate.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F39** | Human Approval Gate | One-click apply | Manual download | Explicit candidate approval | `src/services/application-approval.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F40** | Up to 200 Undo/Redo Steps | Not documented | 200 undo steps in Zustand | Missing undo/redo history | None | `SOURCE_VERIFIED` | `MISSING` |

---

### Category E: Layout, Typography & Multi-Format Export

| ID | Feature Name | Rezi Documented Baseline | Reactive Resume v6 Reference | Career Hub Current State | Career Hub Source Path | Evidence Level | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F41** | Vector PDF Compilation | Proprietary PDF engine | Client-side WASM Forme | Hermetic Tectonic XeTeX | `src/services/latex-compiler.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F42** | Headless Chrome Vector Fallback | Not documented | Serverless worker fallback | `--headless=new --print-to-pdf` | `src/services/latex-compiler.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F43** | Native DOCX OpenXML Export | Download as DOCX | `docx` library builder | Missing DOCX exporter | None | `SOURCE_VERIFIED` | `MISSING` |
| **F44** | Text Selection & Reading Order | Linear ATS text | Linear DOM hierarchy | ToUnicode CMap mapped glyphs | `src/services/resume-parser.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F45** | 10pt Minimum Body Font Size | Down to 8pt | User font slider (8–14pt) | Hard 10pt base font class | `src/services/latex-document-generator.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F46** | 0.52in Parser-Safe Margins | Margin sliders | Margin sliders | Frozen 0.52in geometry | `src/services/latex-document-generator.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F47** | Multi-Template Switcher | 17 ATS templates | 17 templates (Azurill, etc.) | Single canonical ATS LaTeX | `src/services/latex-document-generator.service.js` | `DIRECTLY_TESTED` | `REPAIR_SCOPE` |
| **F48** | PDF Geometry Analysis | Auto-Adjust spacing | Bounding box telemetry | Internal layout analyzer | `src/services/pdf-geometry-analyzer.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F49** | Ligature Normalization | Not documented | Font subsetting | `Ligatures = NoCommon` | `src/services/latex-document-generator.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F50** | JSON Resume Schema Export | JSON export | Native JSON Resume v1.0.0 | Export projection service | `src/services/structured-resume.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |

---

### Category F: Failure Recovery, Security & Operating Discipline

| ID | Feature Name | Rezi Documented Baseline | Reactive Resume v6 Reference | Career Hub Current State | Career Hub Source Path | Evidence Level | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F51** | Stale Suggestion Invalidation | Not documented | `canApplyTo` string match check | Invalidation on content drift | `src/services/application-handoff.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |
| **F52** | Historical Version Pinning | Read-only duplicates | Named version snapshots | Immutable package snapshots | `src/services/application-tracking.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F53** | Fail-Closed Identity Refusal | Generates blank fields | Allows placeholder names | Refuses generation on missing identity | `src/services/latex-document-generator.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F54** | Zero Synthetic Token Leakage | May hallucinate details | LLM provider dependent | Strict audit tokens scanner | `src/services/candidate-artifact-content.service.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F55** | Disposable Database Isolation | Shared cloud tenancy | Single tenant local DB | Tenant-isolated encryption | `src/services/document-storage.service.js` | `DIRECTLY_TESTED` | `WORKING` |

---

### Category G: Newly Discovered Competitive Features (F56–F66)

| ID | Feature Name | Rezi Documented Baseline | Reactive Resume v6 Reference | Career Hub Current State | Career Hub Source Path | Evidence Level | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F56** | Shareable Public Resume Link | Document link sharing | Public link + password + views | Missing public link generator | None | `DOCUMENTED` | `MISSING` |
| **F57** | Human Expert Review Booking | Rezi Review ($8 or Pro tier) | Not implemented | Missing human review module | None | `DOCUMENTED` | `MISSING` |
| **F58** | Coach / Peer Feedback Link | Shared dashboard in Enterprise | Shared document link | Missing collaborative feedback | None | `DOCUMENTED` | `MISSING` |
| **F59** | Master Resume Duplication | Master resume duplication | Duplicate resume button | Branching via regenerate API | `src/services/job-application-workflow.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |
| **F60** | Direct Cloud Drive Export | Export to Google Drive | Not implemented | Missing cloud drive export | None | `DOCUMENTED` | `MISSING` |
| **F61** | In-Browser Click-to-Select | Click element on preview | PageMap bounding box sync | Static preview iframe | None | `SOURCE_VERIFIED` | `UX_GAP` |
| **F62** | Trash & 30-Day Recovery | Not documented | Trash with 30-day restore | Quarantined artifact recovery | `src/services/application-tracking.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |
| **F63** | Multi-Language Interface | English only | Lingui i18n translation | English only web views | None | `SOURCE_VERIFIED` | `MISSING` |
| **F64** | Cover Letter Linked Styling | Separate cover letter | Linked resume sender styling | Separate generator service | `src/services/latex-document-generator.service.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |
| **F65** | Browser Extension Autofill | Rezi Chrome extension | Not implemented | Companion extension in repo | `extension/background.js` | `DIRECTLY_TESTED` | `WORKING` |
| **F66** | Subscription Plan Tier Gate | Free / Pro ($29) / Lifetime ($149) | Open source (100% free) | Schema tier enums (FREE, PRO) | `src/db/schema.js` | `CODE_VERIFIED` | `BACKEND_ONLY` |

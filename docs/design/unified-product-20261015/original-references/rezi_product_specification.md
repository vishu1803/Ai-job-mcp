# Rezi Product & Interaction Specification (Documented Baseline)

**Target Product:** Rezi ([rezi.ai](https://www.rezi.ai))  
**Scope:** Functional Specification & Benchmark Comparison (Research Only)  
**Investigation Bounds:** Derived exclusively from official vendor documentation, published guides, tutorials, and pricing tiers. Proprietary backend algorithms, private APIs, and minified bundles are strictly excluded per terms of service.  
**Evidence Confidence:**
* **`DOCUMENTED`**: Explicitly confirmed in official Rezi guides, tutorials, or marketing documentation.
* **`UNVERIFIED`**: Mentioned in third-party reviews or inferred from user workflows without official specification.
* **`REQUIRES AUTHORIZED TESTING`**: Proprietary backend algorithms (internal score weighting, ATS parseability models) not disclosed by Rezi.

---

## 1. Screen-by-Screen User Journey Specification

### Screen 1: Onboarding, Account Setup & Document Taxonomy
* **Interaction**: Candidate signs up via email or Google OAuth. Rezi prompts for current career level (Student, Entry, Mid, Senior, Executive) and target role.
* **Document Model**:
  - *Master Resume*: Comprehensive catalog of all career experience, projects, skills, and certifications.
  - *Targeted Resume*: Cloned/duplicated instance tailored to a specific job description.
  - *Cover Letter & Resignation Letter*: Standalone documents linked to the candidate profile.
* **Evidence Status**: `DOCUMENTED` (Rezi Guide: *Getting Started with Rezi*).

---

### Screen 2: Master Resume Duplication & Job Branching
* **Interaction**: From the dashboard, user clicks the "..." menu on a master resume and selects "Duplicate".
* **System Action**: Creates a cloned resume document inheriting all sections, contact information, and styling options.
* **Workflow Best Practice**: Rezi explicitly guides users never to apply with a master resume directly, but to branch independent versions for each target job.
* **Evidence Status**: `DOCUMENTED` (Rezi Guide: *How to Tailor Your Resume*).

---

### Screen 3: AI Keyword Targeting Interface
* **Interaction**: User navigates to the "Job Description" tab, pastes the target job title and job posting description.
* **System Action**: Rezi parses the text and displays a split interface:
  - *Matched Keywords*: Displayed as green pill tags indicating terms found in both the resume and the job description.
  - *Missing Keywords*: Displayed as yellow/red pill tags representing high-priority skills absent from the current resume.
* **Interaction Mechanics**: Clicking a missing keyword suggests relevant experience bullets or prompts the candidate to add the skill under "Technical Skills".
* **Evidence Status**: `DOCUMENTED` (Rezi Guide: *AI Keyword Targeting*).
* **Proprietary Boundary**: The exact natural language extraction algorithm and keyword frequency weighting are `REQUIRES AUTHORIZED TESTING`.

---

### Screen 4: Resume Editor & AI Bullet Rephraser
* **Editor Structure**: Form-based field editor (not freeform text) with separate modules for Contact, Summary, Experience, Projects, Education, and Skills.
* **Google XYZ Bullet Formulator**:
  - Rezi features an AI bullet generator based on Google's formula: *"Accomplished [X], as measured by [Y], by doing [Z]"*.
  - User enters a role and basic accomplishment prompt; AI outputs 3–5 bullet options containing action verbs and quantified impact placeholders.
* **AI Generation Limits**: Rezi replaced complex "AI Credits" with whole-number **AI Generations** (limited on Free; unlimited on Pro/Lifetime).
* **Evidence Status**: `DOCUMENTED` (Rezi Guide: *AI Resume Bullet Point Generator*).

---

### Screen 5: The Rezi Score (100-Point Quality Diagnostic)
* **Visual Presentation**: Real-time circular progress gauge in the top navigation bar updating as the user edits.
* **The 5 Evaluation Categories**:
  1. *Content*: Evaluates presence of numbers/metrics, action verbs, and bullet count.
  2. *Format*: Validates layout margins, single-column reading flow, and standard font hierarchy.
  3. *Optimization*: Measures target job keyword density and requirement coverage.
  4. *Best Practices*: Flags buzzwords, clichés, personal pronouns (e.g. "I", "me"), and contact omissions.
  5. *Application Ready*: Final pre-submission checklist confirming readiness for corporate ATS ingestion.
* **Evidence Status**: `DOCUMENTED` (Rezi Guide: *Understanding the Rezi Score*).
* **Proprietary Boundary**: Internal category weights (e.g., whether Content is weighted 30% or 40%) are proprietary and labeled `REQUIRES AUTHORIZED TESTING`.

---

### Screen 6: Finish Up & Auto-Adjust Spacing Solver
* **Problem Solved**: Resumes that overflow onto page 2 by just 2–4 lines.
* **Interaction**: On the "Finish Up & Preview" screen, user clicks **"Auto-Adjust"**.
* **System Action**: Dynamically reduces margins, line height, and section padding incrementally until the document fits precisely onto 1 full page.
* **Manual Override Controls**: Users can manually tweak font size (8pt to 12pt), line height (1.0 to 1.6), and margin padding (0.25in to 1.0in).
* **Evidence Status**: `DOCUMENTED` (Rezi Guide: *Finish Up & Formatting*).
* **Known Usability Limitation**: Aggressive font shrinking can push text below the 10pt recruiter readability threshold.

---

### Screen 7: Multi-Format Export & Cloud Sync
* **Export Options**:
  - *PDF Download*: Formatted for standard ATS parsers.
  - *DOCX Download*: Native Microsoft Word document.
  - *Google Drive Sync*: Saves a synchronized copy directly to the user's linked Google Drive account.
* **Evidence Status**: `DOCUMENTED` (Rezi Guide: *Exporting Your Resume*).

---

### Screen 8: Shareable Public Resume Links & Collaboration
* **Public Links**: Users can generate a unique web link (`rezi.ai/r/username`) to share a read-only responsive web view of their resume with recruiters.
* **Collaboration Model**:
  - Rezi does **not** feature real-time Google Docs style simultaneous multi-user co-authoring.
  - Feedback is collected through public links or the formal **Rezi Review** service.
* **Evidence Status**: `DOCUMENTED`.

---

### Screen 9: Rezi Review (Human Expert Resume Review Service)
* **Service Overview**: A human-in-the-loop review service where professional resume writers manually inspect and critique the user's document.
* **Pricing & Availability**:
  - Free Plan: $8–$10 per review (one-time add-on).
  - Pro Plan ($29/mo): Includes **1 free expert review per month**.
  - Lifetime Plan ($149): Includes discounted access to review credits.
* **Feedback Rubric**: Experts provide written feedback covering formatting, bullet impact, grammatical precision, and corporate ATS compliance.
* **Evidence Status**: `DOCUMENTED` (Rezi Guide: *Rezi Resume Review Service*).

---

### Screen 10: Pricing Tiers & Plan Restrictions

| Feature / Tier | Free Plan ($0) | Pro Plan ($29 / month) | Lifetime Plan ($149 one-time) | Enterprise ($99/mo per 200 users) |
| :--- | :---: | :---: | :---: | :---: |
| **Resume Count** | 1 Resume | **Unlimited** | **Unlimited** | **Unlimited** |
| **PDF Downloads** | 3 Total | **Unlimited** | **Unlimited** | **Unlimited** |
| **DOCX Downloads** | Blocked | **Unlimited** | **Unlimited** | **Unlimited** |
| **AI Generations** | Limited daily cap | **Unlimited** | **Unlimited** | **Unlimited** |
| **Keyword Targeting** | Preview only | **Full Match Analysis** | **Full Match Analysis** | **Full Match Analysis** |
| **Rezi Score Breakdown** | Summary score only | **Full 5-category breakdown** | **Full 5-category breakdown** | **Full 5-category breakdown** |
| **Human Expert Review** | $8–$10 add-on | **1 Free Review / month** | Discounted add-on | Custom reviewer pool |
| **ATS Templates** | Standard template | **All 17 ATS templates** | **All 17 ATS templates** | Custom white-label branding |

---

## 2. Competitive Feature Comparison Matrix

| Feature Dimension | Rezi (rezi.ai) | Reactive Resume v6 | Teal | Huntr | AI Career Hub |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Editor Type** | Form-based fields | Dual-pane Write/PDF | Form-based inventory | Dual-pane editor | Form-based `/apply` |
| **AI Bullet Style** | Google XYZ formula | Prompt suggestions | Action + Metric prompts | LLM chat assistant | Grounded bullet composer |
| **Keyword Gap Chips** | Green/Red pill tags | Keyword findings list | Keyword match list | Checklist items | Backend engine (`UX_GAP`) |
| **Scoring Feedback** | 5-category Rezi Score | Readability findings | Overall match % | Match checklist | ATS Parseability & Fit |
| **1-Page Spacing** | Auto-Adjust spacing | Forme density sliders | Manual toggling | Manual padding | Section budget pruner |
| **Word Export** | Native `.docx` | Native `.docx` (AST) | Native `.docx` | Native `.docx` | Missing (`MISSING`) |
| **LaTeX Support** | None | None | None | None | Hermetic Tectonic XeTeX |
| **Evidence Moat** | None (User claims) | None (User claims) | None (User claims) | None (User claims) | **Cryptographic SHA-256** |
| **Human Review** | Rezi Review ($8/mo) | None | Coach network | Coaching portal | Missing (`MISSING`) |
| **Public Links** | Web view URL | URL + Password + Stats | Public portfolio link | Shared board link | Missing (`MISSING`) |

---

## 3. Explicit Research Limitations & Boundaries

1. **Scoring Weights**: Rezi's exact formula for combining Content, Format, Optimization, and Best Practices into a 0–100 integer is proprietary and remains unverified.
2. **Keyword Match Parsing**: Whether Rezi uses simple n-gram token matching or dense semantic embeddings is unconfirmed.
3. **Internal Code**: No proprietary minified JavaScript, private endpoints, or session-authenticated internal tools were decompiled or accessed during this research.

# Canonical Data Ownership Map (P86.1)

## Purpose & Operating Invariant
This document establishes the authoritative field ownership across the entire platform. Every candidate fact has **exactly one canonical owner** where it is edited and stored. All other surfaces treat candidate data as **derived summaries**, **read-only evaluations**, or **immutable snapshots**.

Under no circumstances may an application screening form, resume export, or dashboard widget silently mutate canonical profile facts without explicit user action.

---

## 1. Candidate Field Ownership Matrix

| Field | Canonical Source / Storage | Classification | Authorized Consumers & Usage | Mutation Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Full Name** | `candidates.displayName` | CANONICAL | Resume header, Application handoff, Dashboard greeting | Direct Profile edit or User-confirmed AI proposal |
| **Professional Headline** | `candidates.headline` | CANONICAL | Resume title, Job discovery radar, Profile card | Direct Profile edit or User-confirmed AI proposal |
| **Email Address** | `candidates.canonicalEmail` | CANONICAL | Resume contact, Application kit, Session auth | Direct Profile edit (verified) |
| **Phone & Dial Code** | `profileMetadata.userCustom.phoneNumber`, `countryCode` | CANONICAL | Resume contact, Application screening | Direct Profile edit or User-confirmed AI proposal |
| **Location (City/State/Country)** | `candidates.profileMetadata.userCustom.location` | CANONICAL | Job matching radar, Application screening | Direct Profile edit or User-confirmed AI proposal |
| **Professional Summary** | `candidates.summary` | CANONICAL | Resume executive summary, Copilot context | Direct Profile edit or User-confirmed AI proposal |
| **Years of Experience** | `userCustom.yearsOfExperience` | CANONICAL | Seniority filtering, Screening eligibility | Direct Profile edit (Prohibited from silent AI mutation) |
| **Current Role & Employment Status** | `profile.currentRole`, `careerStatus` | CANONICAL | Resume experience header, Job matching | Direct Profile edit |
| **Skills (Taxonomy & Provenance)** | `candidate_skills` + `evidence_items` | CANONICAL + EVIDENCE | ATS matching, Resume generation, Gap analysis | AST sync (VERIFIED) or User declaration (CLAIMED) |
| **Work History (Experience Items)** | `profileMetadata.userCustom.experience` | CANONICAL | Resume work history, Job match score | Direct Profile edit or Source Resume Ingestion |
| **Education & Degrees** | `profileMetadata.userCustom.education` | CANONICAL | Resume education section, Screening readiness | Direct Profile edit or Source Resume Ingestion |
| **Projects & Artifacts** | `projects` + `project_resources` | CANONICAL + EVIDENCE | Portfolio showcase, Tailored resume bullets | Repository AST sync or Direct Profile edit |
| **Target Job Roles** | `careerPreferences.targetRoles` | CANONICAL | Job search radar, Recommended jobs | Direct Profile edit or User-confirmed AI proposal |
| **Workplace Preference** | `careerPreferences.remotePreference` | CANONICAL | Job search radar (`REMOTE`/`HYBRID`/`ON_SITE`) | Direct Profile edit or User-confirmed AI proposal |
| **Salary Floor & Target** | `careerPreferences.salaryFloor`, `targetSalary` | CANONICAL | Job compensation filtering | Direct Profile edit (Prohibited from silent AI mutation) |
| **Relocation Willingness** | `careerPreferences.relocationPreference` | CANONICAL | Geographic match scoring | Direct Profile edit or User-confirmed AI proposal |
| **Notice Period / Availability** | `careerPreferences.noticePeriod`, `customNoticePeriod` | CANONICAL | Application screening readiness, Handoff kit | Direct Profile edit or User-confirmed AI proposal |
| **Work Authorization** | `careerPreferences.workAuthorization` | CANONICAL | Jurisdiction screening, Application handoff | Direct Profile edit (Prohibited from silent AI mutation) |
| **Visa Sponsorship (Tri-State)** | `careerPreferences.visaSponsorshipRequired` | CANONICAL | Jurisdiction screening (`YES`/`NO`/`UNKNOWN`) | Direct Profile edit (Prohibited from silent AI mutation) |
| **Application Screening Answers** | `job_applications.answers` | APPLICATION-SPECIFIC | Target employer screening submission only | **Isolated to that application package**; never mutates Profile |
| **Tailored Resume Artifact** | `application_packages.tailoredResume` | SNAPSHOT | PDF export, Employer application submission | Immutable once compiled |
| **Dashboard Presentation** | `/dashboard` | DERIVED SUMMARY | Visual overview, action suggestions | Read-only; delegates edits to Profile |

---

## 2. Classification Definitions

1. **CANONICAL**: The single authoritative database record for that candidate attribute. All queries resolve here.
2. **EVIDENCE**: Immutable provenance linked to a verified GitHub repository AST, file path, commit hash, or document token.
3. **DERIVED SUMMARY**: Computed at read-time (e.g. `ApplicationReadinessService.evaluateReadiness()` or `AtsFitScoreService.calculateJobMatchScore()`). Zero stored duplicate data.
4. **APPLICATION-SPECIFIC**: Scoped strictly to one job application (`job_applications.id`). May provide overrides for that submission without polluting the permanent candidate profile.
5. **SNAPSHOT**: An immutable point-in-time document package (e.g. LaTeX PDF resume, cover letter, or handoff zip archive) frozen at time of application submission.
6. **PROHIBITED AUTO-MUTATION**: Fields that AI or automated scripts are mathematically blocked from altering without explicit human verification (`workAuthorization`, `visaSponsorshipRequired`, `yearsOfExperience`, `education`, `employmentHistory`).

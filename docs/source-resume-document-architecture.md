# Architectural Specification: Source Resume Ingestion, Document Lifecycle & Claim-Evidence Separation

**Architecture Identifier**: `ARCH-052`  
**Related Decision Records**: `ADR-072` (Pending Acceptance)  
**Phase**: Phase 13.5 (Product Experience, Public MCP & Career Document Onboarding)  
**Status**: `PROPOSED / ARCHITECTURE REVIEW`  
**Date**: 2026-08-26  

---

## 1. Executive Summary & Core Invariant

Antigravity Career Hub was designed as an evidence-first platform where claims are backed by authentic code artifacts. In a complete real-world workflow, candidates possess existing resumes (PDF, DOCX, Plain Text) representing their historical career narrative.

### The Fundamental Truth Invariant
> [!IMPORTANT]
> **AN UPLOADED RESUME IS NOT REPOSITORY-VERIFIED EVIDENCE.**
> Statements, skills, achievements, and employment dates extracted from an uploaded resume represent candidate self-assertions and MUST be classified under the platform truth model as `CLAIMED` (serialized with explicit `[Unverified User Claim]` labels).
>
> An unverified resume claim NEVER attains `VERIFIED` provenance status unless it is independently corroborated by repository package manifests, code AST imports, or commit-pinned evidence items.

---

## 2. Document Storage Architecture: The Hybrid Model

To guarantee both high-performance structured querying and high-security binary preservation, Career Hub adopts a **Hybrid Document Storage Model**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Source Resume Upload                            │
│                        (PDF / DOCX / TXT)                              │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
┌──────────────────────────────────┐┌──────────────────────────────────┐
│    PostgreSQL Relational DB      ││   Encrypted Document Blob Store  │
├──────────────────────────────────┤├──────────────────────────────────┤
│ • resumes (metadata, hashes)     ││ • Raw binary ciphertext          │
│ • resume_sections (structured)   ││ • Encrypted with AES-256-GCM     │
│ • candidate_claims (CLAIMED)     ││ • Unique IV & Key Version        │
│ • tailored_documents (snapshots) ││ • Local / S3 / GCS abstraction   │
└──────────────────────────────────┘└──────────────────────────────────┘
```

### 2.1 Storage Components
1. **Encrypted Document Blob Storage**:
   * Stores the raw, unmodified binary source file (PDF, DOCX, TXT).
   * Encrypted at rest using **AES-256-GCM** with per-document initialization vectors (IV) and authentication tags.
   * Abstracted via `DocumentStorageService` to support local encrypted file storage (in staging) and AWS S3 / Google Cloud Storage (in production).
2. **PostgreSQL Relational Schema**:
   * `resumes`: Metadata root containing `tenantId`, `candidateId`, `fileName`, `fileSizeBytes`, `mimeType`, `contentHash` (SHA-256), `storageKey`, `lifecycleState`, and timestamps.
   * `resume_sections`: Structured parsed sections (`SUMMARY`, `WORK_EXPERIENCE`, `EDUCATION`, `SKILLS`, `PROJECTS`, `CERTIFICATIONS`).
   * `candidate_claims`: Individual extracted assertions tagged with `provenanceStatus: 'CLAIMED'`.
   * `tailored_documents`: Immutable, point-in-time tailored application snapshots attached to job applications.

---

## 3. Complete Document Lifecycle State Machine

A career document transitions through six deterministic lifecycle states:

```
┌──────────┐     ┌──────────┐     ┌────────────────┐     ┌───────────────┐
│  SOURCE  │ ──> │  PARSED  │ ──> │ USER_APPROVED  │ ──> │  BASE_RESUME  │
└──────────┘     └──────────┘     └────────────────┘     └───────┬───────┘
                                                                 │
                                                                 ▼
                                                        ┌─────────────────┐
                                                        │ TAILORED_VERSION│
                                                        └────────┬────────┘
                                                                 │
                                                                 ▼
                                                        ┌─────────────────┐
                                                        │ EXPORT_SNAPSHOT │
                                                        └─────────────────┘
```

### 3.1 State Definitions
1. **`SOURCE`**: Raw file uploaded, encrypted, and content hash computed. Binary stored in blob store.
2. **`PARSED`**: Text extracted via sandboxed parser; structured sections and claims extracted. Awaiting candidate review.
3. **`USER_APPROVED`**: Candidate has reviewed parsed sections, edited any OCR/formatting artifacts, and confirmed accuracy.
4. **`BASE_RESUME`**: Promoted to the candidate's active base resume profile. Acts as the foundational narrative for tailoring.
5. **`TAILORED_VERSION`**: Generated Markdown/JSON artifact customized for a specific Job Description by prioritizing relevant projects and highlighting verified skills.
6. **`EXPORT_SNAPSHOT`**: Immutable point-in-time snapshot permanently attached to a `job_applications` record.

---

## 4. Multi-Format Parsing & Structured Extraction Pipeline

```
┌─────────────────┐
│ Binary Stream   │
└────────┬────────┘
         │ 1. Magic Number MIME Validation & 10MB Size Check
         ▼
┌─────────────────┐
│ Sandboxed Parser│ ──> PDF: pdf-parse / PDF.js sandbox
└────────┬────────┘ ──> DOCX: mammoth.js AST walker
         │          ──> Plain Text: UTF-8 normalizer
         │ 2. Text Normalization & Secret Scrubber
         ▼
┌─────────────────┐
│ Section Splitter│ ──> Header, Summary, Experience, Education, Skills, Projects
└────────┬────────┘
         │ 3. Taxonomy Normalization & Entity Extractor
         ▼
┌─────────────────┐
│ Claim Generator │ ──> Ingests candidate_claims with provenanceStatus = 'CLAIMED'
└─────────────────┘
```

### 4.1 Supported Formats & Parsing Engines
* **PDF (`application/pdf`)**: Parsed in an isolated, sandboxed worker using `pdf-parse` / `pdfjs-dist` with all JavaScript execution disabled.
* **DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)**: Parsed via `mammoth.js` extracting clean semantic HTML/Markdown AST without binary macro execution.
* **Plain Text / Markdown (`text/plain`, `text/markdown`)**: Ingested with strict UTF-8 NFKC normalization and control character stripping.

### 4.2 Security & Ingestion Safeguards
1. **Magic Number Inspection**: Validates file headers (e.g. `%PDF-` for PDF, `PK\x03\x04` for DOCX) rather than trusting client-provided file extensions or Content-Type headers.
2. **Size Ceilings**: Strict 10MB per-document upload limit.
3. **Anti-Malware Hook**: Scans buffer against ClamAV / VirusTotal stream inspection hooks before persistence.
4. **Secret Scrubbing**: Raw text passes through `SecretScrubber` to purge inadvertently pasted API keys, passwords, or personal credentials before saving.
5. **PII Masking**: Private candidate contact details (phone numbers, physical addresses) are segregated into user-private metadata namespaces.

---

## 5. Provenance & Claim-to-Evidence Alignment

When a resume is parsed, extracted skills are mapped against the **Unified Candidate Data Model**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Candidate Profile Graph                         │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  [Extracted Resume Claim]                     [GitHub Ingestion]       │
│  "5 years building React apps"                react-node-microservices │
│  Status: CLAIMED                              package.json: "react"    │
│  Confidence: 0.50                             Status: VERIFIED (0.95)  │
│             │                                           │              │
│             └─────────────────────┬─────────────────────┘              │
│                                   │                                    │
│                                   ▼                                    │
│                     ┌───────────────────────────┐                      │
│                     │  Corroborated Skill Node  │                      │
│                     │  "React"                  │                      │
│                     │  Provenance: VERIFIED     │                      │
│                     │  Evidence: Commit a1b2... │                      │
│                     │  Narrative: User Claim    │                      │
│                     └───────────────────────────┘                      │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Reconciliation Rules
* If an extracted skill is backed by repository evidence $\to$ Skill status becomes `VERIFIED` with repository evidence citations, while preserving the user's qualitative resume bullet point.
* If an extracted skill has **zero** repository evidence $\to$ Skill status remains `CLAIMED`, serialized in all downstream MCP tool outputs and tailored resumes with `[Unverified User Claim]`.
* Background repository re-scans **never** overwrite user-authored narrative summaries (Narrative Sovereignty).

---

## 6. Tailoring & Immutable Application Snapshots

When applying for a job:
1. `resume-tailoring.service.js` selects the candidate's active `BASE_RESUME`.
2. It analyzes the target Job Description (`ARCH-013` Evidence Matching).
3. It reorders project bullet points, prioritizes verified skills that match the JD, and generates a tailored document.
4. When attached to an application via `attach_application_document` (or `POST /api/applications/:id/documents`), Career Hub computes the SHA-256 `contentHash` and stores an **immutable snapshot** in `tailored_documents`.
5. Even if the candidate later uploads a new base resume or modifies their profile, historical application records remain permanently bound to the exact document submitted on that date.

---

## 7. Data Sovereignty & GDPR Deletion Semantics

* **Document Deletion**: Candidates can delete any uploaded source resume or tailored draft at any time. The database records are removed and the encrypted binary blob is wiped from storage.
* **Full Account Erasure**: During GDPR Article 17 Hard Deletion (`DELETE /account`), all source resumes, parsed sections, extracted claims, tailored documents, and encrypted binary blobs belonging to `tenantId` are permanently purged in a single atomic operation.

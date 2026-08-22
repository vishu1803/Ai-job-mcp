# ARCH-020: Career Artifact Export & Canonical Interchange Architecture

**Document ID**: `ARCH-020`  
**Related ADR**: `ADR-040` (`docs/decisions.md`)  
**Status**: `APPROVED`  
**Phase**: Phase 6 (P6-004A)  
**Author**: Antigravity Core Architecture Team  
**Date**: 2026-08-22  

---

## 1. Executive Summary & Problem Statement

The **Career Artifact Export Engine** is the standards-compliant interchange layer of the Antigravity Career Platform. Rather than simply dumping whatever internal in-memory object a service happens to return, the export layer transforms tailored career artifacts (`TailoredResume`, `TailoredCoverLetter`, `PortfolioRecommendation`) into industry-standard, interoperable, and presentation-ready interchange formats.

### Core Problem:
Without a rigorous canonical interchange architecture:
1. **Proprietary Vendor Lock-in**: Internal JSON structures cannot be imported by external resume builders, CLI tools, or web renderers.
2. **ATS Corruption**: Unformatted or multi-column text pasted into legacy Application Tracking Systems (Workday, Greenhouse, Taleo, iCIMS) suffers from character encoding corruption (ligatures, curly quotes, unclosed tabs) and broken section hierarchies.
3. **Loss of Provenance in Standard Ecosystems**: Exporting to industry formats like JSON Resume standard (jsonresume.org) risks stripping out cryptographic verification hashes and evidence citations, or conversely, breaking schema validators by polluting core fields.
4. **Inconsistent Artifact Serialization**: Resumes, cover letters, and portfolio recommendations require distinct formatting rules across Markdown, Plain Text, and JSON, while sharing a unified citation and privacy policy.

```
+---------------------------------------------------------------------------------------------------+
|                            CANONICAL ARTIFACT EXPORT PIPELINE                                     |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  |                             1. STRUCTURED TAILORED ARTIFACTS                                |  |
|  |  • TailoredResume (P6-001 / ARCH-017)                                                       |  |
|  |  • TailoredCoverLetter (P6-002 / ARCH-018)                                                   |  |
|  |  • PortfolioRecommendation (P6-003 / ARCH-019)                                              |  |
|  |  • IntegrityCheckedAssertions (P5-006 / ARCH-016)                                           |  |
|  +----------------------------------------------+----------------------------------------------+  |
|                                                 |                                                 |
|                                                 v                                                 |
|  +---------------------------------------------------------------------------------------------+  |
|  |                         2. EXPORT OPTIONS & PRIVACY CONTROLS                                |  |
|  |  - Format: JSON_RESUME | MARKDOWN | PLAIN_TEXT | CANONICAL_JSON                                |  |
|  |  - Citation Style: NONE (Application-Ready) | INLINE | FOOTNOTES | METADATA_ONLY              |  |
|  |  - Privacy: Anonymization (Redact PII) | Omission of [Unverified User Claim] items          |  |
|  |  - Line Endings: LF (POSIX) | CRLF (Windows) | Encoding: UTF-8 | ASCII                       |  |
|  +----------------------------------------------+----------------------------------------------+  |
|                                                 |                                                 |
|                                                 v                                                 |
|  +---------------------------------------------------------------------------------------------+  |
|  |                       3. FORMAT-SPECIFIC CANONICAL ADAPTERS                                 |  |
|  |  +-----------------------+ +-----------------------+ +-----------------------------------+  |  |
|  |  |   JSON Resume v1.0.0  | |  CommonMark / GFM     | |     ATS-Safe Plain Text           |  |  |
|  |  |  - Strict Validator  | |  - Typographic H1-H4  | |  - Standard ASCII/UTF-8           |  |  |
|  |  |    Compliance         | |  - Markdown Links     | |  - Explicit Section Separators    |  |  |
|  |  |  - meta.evidenceGraph | |  - Footnote Index     | |  - 2-Space Indents (No Tabs)      |  |  |
|  |  +-----------------------+ +-----------------------+ +-----------------------------------+  |  |
|  +----------------------------------------------+----------------------------------------------+  |
|                                                 |                                                 |
|                                                 v                                                 |
|  +---------------------------------------------------------------------------------------------+  |
|  |                         4. VALIDATED EXPORTED ARTIFACT ENVELOPE                             |  |
|  |  • ExportedArtifact { format, mimeType, filename, content, metadata, verificationHash }     |  |
|  |  • 100% Deterministic, In-Memory, Sub-5ms Latency, Zero Database Writes                    |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Industry Standards & Compatibility Analysis

### 2.1 JSON Resume Standard (jsonresume.org / Schema v1.0.0)
JSON Resume is the global open-source standard for structured resumes, supported by hundreds of themes, CLI tools, and career platforms.

#### Strict Compatibility Requirements:
To ensure 100% compatibility with official JSON Resume validators (e.g. `resumed`, `resume-cli`, `@jsonresume/schema`):
1. **Root Fields**: Must conform strictly to schema v1.0.0 (`basics`, `work`, `volunteer`, `education`, `awards`, `certificates`, `publications`, `skills`, `languages`, `interests`, `references`, `projects`, `meta`).
2. **No Top-Level Field Pollution**: Custom verification attributes must **never** be injected at the root level.
3. **Canonical Extension via `meta`**: All Antigravity provenance data (evidence references, commit SHAs, integrity audit scores, ATS match scores, job IDs) are namespaced inside the standard `meta` object under `meta.antigravity`.

#### Mapping Table (`TailoredResume` $\rightarrow$ JSON Resume v1.0.0):

| Antigravity `TailoredResume` Field | JSON Resume v1.0.0 Standard Path | Notes / Transformation Logic |
| :--- | :--- | :--- |
| `candidate.displayName` | `basics.name` | Candidate full name |
| `headline` | `basics.label` | Target role headline |
| `candidate.canonicalEmail` | `basics.email` | Contact email (subject to `anonymize` option) |
| `candidate.canonicalPhone` | `basics.phone` | Contact phone (subject to `anonymize` option) |
| `summary` | `basics.summary` | Executive career summary |
| `candidate.location` | `basics.location` | Standard `{ city, region, countryCode }` |
| `experience[]` | `work[]` | `name` (company), `position` (title), `startDate`, `endDate`, `summary`, `highlights` (bullets) |
| `projects[]` | `projects[]` | `name`, `description`, `highlights` (bullets), `keywords` (languages/frameworks), `url` |
| `skills[].skills[]` | `skills[]` | `name` (category name), `level` (`VERIFIED` / `INFERRED`), `keywords` (skill names) |
| `education[]` | `education[]` | `institution`, `studyType` (degree), `area` (fieldOfStudy), `startDate`, `endDate`, `score` (grade) |
| `certifications[]` | `certificates[]` | `name`, `issuer` (issuingOrganization), `date` (issueDate), `url` |
| `metadata`, `evidenceRefs`, `integrityStatus` | `meta.antigravity.*` | Non-breaking metadata namespace |

---

### 2.2 CommonMark & GitHub Flavored Markdown (GFM)
Markdown is the standard format for developer documentation, GitHub profile repositories, and technical portfolio sites.

#### Design Invariants:
1. **Semantic Heading Hierarchy**: Single `# Candidate Name` H1, `## SECTION` H2, `### Sub-item` H3, `#### Role / Date` H4.
2. **Bullet Typography**: Standard `- ` bullet markers with 2-space nesting.
3. **Evidence Citations**:
   - If `citationStyle: 'NONE'`: Clean application-ready text.
   - If `citationStyle: 'INLINE'`: Compact inline badge (e.g. `[[Verified: src/server.go:10-45@1111111](url)]`).
   - If `citationStyle: 'FOOTNOTES'`: Numbered superscripts `[^1]` linking to a `# Verified Evidence Ledger` at the bottom of the document.
4. **Safe Markdown Rendering**: Escapes raw HTML tags to prevent XSS during web rendering.

---

### 2.3 ATS-Optimized Plain Text (ASCII / Clean UTF-8)
Designed for direct copy-pasting into enterprise ATS text boxes (Workday, Greenhouse, Lever, Taleo) where rich text formatting fails.

#### Design Invariants:
1. **Zero Multi-Column Layouts**: Strict single-column linear layout.
2. **Clean Section Dividers**: Capitalized section headers with standard ASCII underlines:
   ```text
   EXPERIENCE
   ==========
   Staff Backend Engineer | Apex Systems
   2021-06 - Present | Remote
   * Designed distributed storage engine in Go...
   ```
3. **Sanitized Typography**:
   - Converts curly quotes (`“`, `”`, `‘`, `’`) to standard ASCII (`"`, `'`).
   - Converts em-dashes (`—`) and en-dashes (`–`) to standard hyphens (`-`).
   - Converts Unicode bullet characters (`•`, `▪`, `►`) to standard ASCII asterisk `* ` or hyphen `- `.
   - Replaces raw tab characters `\t` with 2 spaces.
4. **Configurable Line Breaks**: `LF` (`\n`) for modern web/POSIX systems; `CRLF` (`\r\n`) for Windows/legacy enterprise systems.

---

## 3. Artifact-Specific Export Specifications

### 3.1 Resume Export (`TailoredResume`)
Supported Formats: `JSON_RESUME`, `MARKDOWN`, `PLAIN_TEXT`, `CANONICAL_JSON`.

* **JSON Resume**: Complete RFC-compliant JSON representation with `meta.antigravity` verification envelope.
* **Markdown**: Complete resume with structured sections (Summary, Technical Skills categorized, Professional Experience, Featured Projects with commit evidence, Education, Certifications).
* **Plain Text**: Linear text layout optimized for ATS text fields.
* **Canonical JSON**: Raw validated `TailoredResume` domain object.

### 3.2 Cover Letter Export (`TailoredCoverLetter`)
Supported Formats: `MARKDOWN`, `PLAIN_TEXT`, `CANONICAL_JSON`.

* **Markdown**: Formal business letter format:
  ```markdown
  # Cover Letter: Alex Mercer

  **Date**: August 22, 2026  
  **To**: Hiring Team, Apex Data Platforms  
  **Position**: Principal Backend Infrastructure Engineer  

  ---

  Dear Hiring Team,

  [Opening paragraph...]

  [Company alignment paragraph...]

  [Relevant experience paragraph...]

  [Closing & sign-off...]

  Sincerely,  
  Alex Mercer  
  alex@example.com | github.com/alex
  ```
* **Plain Text**: Standard business letter formatting with blank line paragraph separators.
* **Canonical JSON**: Raw validated `TailoredCoverLetter` domain object.

### 3.3 Portfolio Recommendation Export (`PortfolioRecommendation`)
Supported Formats: `MARKDOWN`, `PLAIN_TEXT`, `CANONICAL_JSON`.

* **Markdown**: Executive project showcase & interview enablement guide:
  - **Executive Summary**: Job family alignment, target requirements covered, 7-dimension signal coverage.
  - **Featured Projects**: Detailed case study breakdown per project (Why Featured, Role, Key Technologies, Architecture Signals, Evidence Highlights).
  - **Candidate Reflection Prompts**: 5 tailored questions to help the candidate prepare case study narratives.
  - **Interview Discussion Topics**: 3 technical talking points for system design interviews.
  - **Supporting & Deprioritized Projects**: Summary of secondary repositories.
* **Plain Text**: Structured interview preparation and portfolio summary.
* **Canonical JSON**: Raw validated `PortfolioRecommendation` domain object.

---

## 4. Citation Styles & Privacy Controls

### 4.1 Citation Styles Matrix

| Citation Style | Target Use Case | Presentation Example |
| :--- | :--- | :--- |
| `NONE` | Direct employer job applications | `Built distributed streaming pipeline in Go handling 50k events/sec.` |
| `INLINE` | Technical peer review / GitHub portfolios | `Built distributed streaming pipeline in Go [Verified: cmd/server/main.go#L1-50@1111111].` |
| `FOOTNOTES` | Academic / Technical verified dossiers | `Built distributed streaming pipeline in Go.[^1]\n\n[^1]: Verified in cmd/server/main.go (Lines 1-50, SHA 1111111).` |
| `METADATA_ONLY` | JSON Resume / API integrations | Included strictly in JSON `meta` or YAML frontmatter; body prose remains clean. |

### 4.2 Privacy & Anonymization Controls
* **`anonymize: true`**:
  - Replaces candidate name with `Candidate [Initials]` or `Candidate Profile`.
  - Redacts email address $\rightarrow$ `[REDACTED_EMAIL]`.
  - Redacts phone number $\rightarrow$ `[REDACTED_PHONE]`.
  - Strips exact street address, retaining only City/State/Country.
* **`includeUnverifiedClaims: false`**:
  - Strips bullets and skills tagged as `[Unverified User Claim]` or status `CLAIMED`.
* **`stripInternalIds: true`**:
  - Removes internal UUIDs (`resumeId`, `tenantId`, `candidateId`, `targetJobId`) from external exports for cleaner payloads.

---

## 5. Domain Schemas & Contracts

### 5.1 Enumerations & Options Schema
```javascript
export const ExportFormatEnum = z.enum([
  'JSON_RESUME',
  'MARKDOWN',
  'PLAIN_TEXT',
  'CANONICAL_JSON',
]);

export const ExportCitationStyleEnum = z.enum([
  'NONE',
  'INLINE',
  'FOOTNOTES',
  'METADATA_ONLY',
]);

export const ExportLineEndingEnum = z.enum(['LF', 'CRLF']);

export const ExportArtifactTypeEnum = z.enum([
  'RESUME',
  'COVER_LETTER',
  'PORTFOLIO',
]);

export const ExportOptionsSchema = z.object({
  format: ExportFormatEnum.default('MARKDOWN'),
  citationStyle: ExportCitationStyleEnum.default('NONE'),
  anonymize: z.boolean().default(false),
  includeUnverifiedClaims: z.boolean().default(true),
  stripInternalIds: z.boolean().default(true),
  lineEnding: ExportLineEndingEnum.default('LF'),
  includeFooter: z.boolean().default(false),
  customHeader: z.string().trim().max(1000).optional(),
}).strict();
```

### 5.2 Exported Artifact Schema
```javascript
export const ExportedArtifactMetadataSchema = z.object({
  artifactType: ExportArtifactTypeEnum,
  format: ExportFormatEnum,
  citationStyle: ExportCitationStyleEnum,
  anonymized: z.boolean(),
  exportedAt: DateOrIsoStringSchema,
  byteLength: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative(),
  sha256Checksum: z.string().length(64),
  generatorVersion: z.string().default('v1.0.0'),
}).strict();

export const ExportedArtifactSchema = z.object({
  artifactId: z.string().uuid(),
  tenantId: z.string().uuid(),
  artifactType: ExportArtifactTypeEnum,
  format: ExportFormatEnum,
  mimeType: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  content: z.string(),
  metadata: ExportedArtifactMetadataSchema,
}).strict();
```

---

## 6. Service Architecture & Method Signatures

```javascript
export class CareerArtifactExportService {
  /**
   * Exports a TailoredResume to the target format.
   *
   * @param {Object} context - Multi-tenant security context { tenantId, userId }
   * @param {TailoredResume} resume - Validated TailoredResume object
   * @param {CandidateProfile} candidate - Candidate profile (for contact/location details)
   * @param {ExportOptions} [options] - Formatting and privacy options
   * @returns {ExportedArtifact}
   */
  exportResume(context, resume, candidate, options = {}) { ... }

  /**
   * Exports a TailoredCoverLetter to the target format.
   *
   * @param {Object} context - Multi-tenant security context { tenantId, userId }
   * @param {TailoredCoverLetter} coverLetter - Validated TailoredCoverLetter object
   * @param {CandidateProfile} candidate - Candidate profile (for header details)
   * @param {ExportOptions} [options] - Formatting and privacy options
   * @returns {ExportedArtifact}
   */
  exportCoverLetter(context, coverLetter, candidate, options = {}) { ... }

  /**
   * Exports a PortfolioRecommendation to the target format.
   *
   * @param {Object} context - Multi-tenant security context { tenantId, userId }
   * @param {PortfolioRecommendation} portfolio - Validated PortfolioRecommendation object
   * @param {CandidateProfile} candidate - Candidate profile
   * @param {ExportOptions} [options] - Formatting and privacy options
   * @returns {ExportedArtifact}
   */
  exportPortfolio(context, portfolio, candidate, options = {}) { ... }
}
```

---

## 7. Quality & Verification Invariants

1. **JSON Resume Validator Invariant**: `exportResume(..., { format: 'JSON_RESUME' })` output must pass valid JSON Schema parsing against JSON Resume v1.0.0 without unknown root field errors.
2. **ATS Cleanliness Invariant**: `exportResume(..., { format: 'PLAIN_TEXT' })` must contain 0 unmapped Unicode ligatures, 0 unclosed tabs, and strictly ASCII-safe section headers.
3. **Deterministic Output Invariant**: 100 consecutive exports of the same artifact with identical options must yield 100% bit-for-bit identical `content` and `sha256Checksum`.
4. **Zero Database Mutation Invariant**: Exporting is an in-memory transformation producing 0 database reads/writes.
5. **Multi-Tenant Sovereign Isolation Invariant**: All input artifacts and candidates must match `context.tenantId`; any mismatch immediately throws `NotFoundError` (404 default-deny).
6. **Privacy & Anonymization Invariant**: When `anonymize: true`, email, phone, and full name are systematically redacted across all formats.

---

## 8. Summary of Deliverables for P6-004

1. `docs/career-artifact-export-architecture.md` (`ARCH-020`) — This document.
2. `ADR-040` in `docs/decisions.md`.
3. Canonical Domain Schemas: `src/domain/career/export.schemas.js`.
4. Core Export Service: `src/services/career-artifact-export.service.js`.
5. Unit Tests: `tests/unit/career-artifact-export.service.test.js`.
6. Live Integration Tests: `tests/integration/career-artifact-export.service.test.js`.

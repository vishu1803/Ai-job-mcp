# Resume Studio backend contract v1.0.0

BLUEPRINT-2026-001 implementation contract. Existing structured resume schema stays 2.0.0.
This document resolves blueprint examples against the current repository. The Studio is
an explicitly authorized feature track beside Phase 14/16/17 and PRD repairs.

## Authentication and errors

Use the existing HttpOnly `career_hub_session` cookie (production cookie name is
selected by existing session configuration). Browser fetch uses `credentials: 'include'`.
No new tokens, authentication tables or login flow. Existing middleware's session-token
transport compatibility remains unchanged; MCP tokens are not Studio credentials.
POST/PATCH requests require the existing session-bound `x-csrf-token` and same-origin
`Origin` header. Obtain CSRF through the current authenticated page bootstrap.
The authenticated user and tenant determine candidate ownership; never send those IDs.
All success responses use `{ "success": true, "data": ... }`. All routes request JSON.
Errors use the existing central envelope:

```json
{"success":false,"data":null,"error":{"code":"VALIDATION_ERROR","message":"Invalid Studio analysis request","details":null,"requestId":"...","state":"...","title":"...","supportId":"...","recoveryAction":null}}
```

Additional existing presentation fields may vary with the centralized error catalog.
400 VALIDATION_ERROR; 401 UNAUTHENTICATED/INVALID_SESSION; 403 CSRF_DETECTED,
CSRF_TOKEN_MISSING/CSRF_TOKEN_INVALID or FORBIDDEN; 404 NOT_FOUND for nonexistent
or foreign resources; 413 framework body limit; 500 sanitized INTERNAL_ERROR for
unexpected failures. CAS conflicts use 409 with `error.details[0].reason` equal
to DRAFT_REVISION_CONFLICT or STALE_PROPOSAL. Do not retry those blindly.

## Implemented slice STUDIO-BE-001: baseline analysis

`POST /api/v1/resume-studio/analyze` returns 200. Reads the authenticated candidate's
current profile; does not create a draft, application, approval or artifact. Request
schema: `src/domain/career/resume-studio.schemas.js:StudioAnalyzeRequestSchema`.
Response data schema: `StudioAnalyzeResponseSchema` in the same file.
Portable JSON Schemas for frontend tooling: `docs/api/resume-studio-v1.schema.json`
(request and responseData; wrap responseData in the success envelope).
Unknown keys at request root/job target are rejected, including identity and score fields.

```json
{"jobTarget":{"title":"Backend Engineer","company":"Example","sourceUrl":"https://example.test/jobs/42","rawDescription":"Requirements: Strong practical experience building APIs with PostgreSQL and React. Collaborate on reliable backend systems and document technical decisions."}}
```

title/company are optional nonempty strings up to 255 characters. sourceUrl is optional
HTTP(S), no credentials, up to 2048 characters, retained only as metadata; NEVER fetched.
rawDescription is trimmed, minimum 100 characters, maximum accepted 250,000 characters
within the 1 MiB HTTP body limit. Analysis truncates above 50,000 characters or 51,200
UTF-8 bytes at a code-point boundary, with JOB_DESCRIPTION_TRUNCATED warning.
URL-only ingestion is unavailable until an independently tested SSRF-safe adapter exists.

Response shape (field names; values below are illustrative, not measured scores):

```json
{"success":true,"data":{"contractVersion":"1.0.0","candidateId":"11111111-1111-4111-8111-111111111111","analyzedAt":"2026-10-14T12:00:00.000Z","target":{"title":"Backend Engineer","company":"Example","requirementsCount":2,"extractionMode":"DETERMINISTIC"},"warnings":[],"fitStatus":"AVAILABLE","candidateFit":{"overallScore":0,"scoreBreakdown":{}},"requirementAnalysis":{},"projectRelevance":{},"keywordCoverage":{},"keywords":[{"term":"React","category":"EXACT_CLAIMED","truthState":"CLAIMED","lexicalMatchType":"EXACT","satisfiesRequirement":false,"explanation":"Candidate-reported skill; not independently verified."}],"writingQuality":{"status":"NOT_EVALUABLE","report":null},"parseability":{"status":"NOT_VERIFIED","reason":"No compiled artifact was inspected."}}}
```

Nested engine objects above are abbreviated, not schema-valid fixtures. A complete
schema-valid synthetic response is in `tests/fixtures/resume-studio-analysis-response.json`.
The executable schemas reference current CandidateJobFitAnalysisSchema (seven component
scoreBreakdown), CandidateMatchAnalysisSchema, CandidateProjectRelevanceAnalysisSchema,
and ResumeKeywordCoverageReportSchema. Scores describe explainable internal candidate
fit, not measured employer ATS acceptance or ranking. KeywordCoverage is lexical
profile-baseline coverage, not extraction proof or independently verified skill coverage.
Use keywords.truthState and requirementAnalysis for evidence state; never infer truth
from candidateAuthorization, lexical presence or a confidence value.
No extracted requirements => candidateFit null / INSUFFICIENT_REQUIREMENTS. No bullets
=> writingQuality NOT_EVALUABLE / report null, avoiding the legacy empty-report 50 score.
Parseability stays NOT_VERIFIED until an actual output passes artifact verification.
Writing scores are deterministic writing heuristics, not ATS predictions. Metric support
is exposed as sourceSupportedMetricCount/sourceSupportedMetricUsage and means support
in candidate source statements, not independent verification of the metric. The legacy
writer's text-only atsParseability and fact-utilization placeholders are excluded.
Project recommendation is current engine SELECTED status (top-two budget), not cosine
similarity or a promise that source content is included in a generated artifact.
Equivalent alias matching and truth are independent: equivalent CLAIMED content is
never verified. INFERRED content is unsupported, never displayed as a satisfied match.
Related matches never satisfy exact requirements. Existing verification policy limits
VERIFIED to scoped repository source facts; it does not prove candidate competence.

## Slice 2 draft endpoints

Persistent create/read/update are implemented by [draft contract 1.1.0](resume-studio-drafts-v1.md).
This is an additive contract; the analysis request/response above stay version1.0.0.
Canonical master cloning requires `{kind:"RESUME",resumeId}`; the earlier planned PROFILE
alternative is deferred. The draft contract documents actual conflict details arrays,
schemas, node IDs, selection semantics and source/provenance boundaries.

## Slice 3 proposal endpoints

Generate/read/accept/reject proposals are implemented by [proposal contract1.2.0](resume-studio-proposals-v1.md).
This is additive: analysis1.0.0 and draft1.1.0 payloads remain unchanged. Unavailable
or unsupported model output is explicit; no proposal is automatically applied.

## Integrated history, diagnostics and document endpoints

See [additive contract 1.3.0](resume-studio-documents-v1.md) and its JSON Schemas/real synthetic
HTTP fixtures for implemented paths. The canonical export path is singular `/export`, and
approval is `/approval`. History uses latest 200 headers plus direct revision retrieval;
restore uses `restoreRevision`. Earlier planned `/exports` and `/approval-package` names
were never implemented and remain unavailable. Bounded geometry is part of `/preview`;
there is no separate `/fit` endpoint. JSON Resume, public sharing and coach reviews remain
deferred. Original analysis and draft/proposal contracts are unchanged.

Editing a sealed snapshot creates a new draft branch; never mutate packages or consumed
tickets. Approval still requires existing explicit review ticket flow and binds actual
export hashes plus exact provenance. Application submission remains existing separately
authorized action; no Studio submission endpoint. No public sharing/coaching in scope.
Every mutation is transactional with revision increment, history and proposal invalidation.
The monotonic draft revision is independent of resume.version/application package version.
Undo/redo via restore creates new revisions, preventing ABA/stale acceptance; 200 visible
history steps may be paginated without deleting approved or audit snapshots.

## Original slice implementation roadmap (historical)

1. STUDIO-BE-001 canonical session API + baseline diagnostics (this slice).
2. STUDIO-BE-002 separate draft persistence/migration and independent clones with stable
   node IDs, hashes, preserved provenance, tenant+user isolation and transactional CAS.
3. STUDIO-BE-003 selection/edit/history/restore; no destructive modifications to profile.
4. STUDIO-BE-004 grounded proposal generation and accept/reject transactions. Bounded
   candidate_facts/candidate_skills and scoped evidence only; no invented metric, employer,
   technology, dates. Provider output must pass deterministic validation. Fail closed on
   unsupported text or unavailable provider; no false zero-hallucination receipt.
5. STUDIO-BE-005 previews/geometry, reuse verified PRD-002 boundaries; no implicit source
   condensation/omission. PageMap observer requires investigation: exact ID mapping not
   established by blueprint assertions. Do not guarantee dense arbitrary content fits.
6. STUDIO-BE-006 native DOCX/OpenXML + independent roundtrip verification. PRD-004 parser
   and broader PRD-005 native TeX gates remain separate dependencies; actual Word/Google
   Docs/LibreOffice compatibility is NOT VERIFIED until tested in those applications.
7. STUDIO-BE-007 existing approval/regeneration integration with output checksums.

The current sole-owner integration status is recorded in project.md STUDIO-INTEGRATION-001.
The roadmap above originated in Slice1; it is not the current endpoint availability table.

Reuse current parser, EvidenceMatchingService, ProjectRelevanceService.computeProjectsRelevance,
AtsFitScoreService, CandidateProfileService, keyword and writing services. Slice1 changed
no frontend, parser, structured-resume, LaTeX/geometry, storage, workflow or approval repair
files and required no migration. Later integrated changes stay isolated from active repair
implementations. PRD-002 is locally complete; PRD-004/005 and live AI
remain open. The integrated frontend now consumes implemented contracts through real
session/CSRF HTTP. Native Office rendering remains unverified pending local setup; live
provider quality is not claimed. No commit/push/merge/deploy authorized.


## Local main consolidation and library navigation (2026-10-15)

Local integration/checkpoint commits and main merge are now authorized and completed; earlier no-commit statements describe the historical slices. Remote publication/deployment remain prohibited. Additive1.4 [owned draft library and web context](resume-studio-library-v1.md) and its JSON Schema are implemented.1.0analysis/1.1draft/1.2proposals/1.3document contracts remain compatible. See ../product/unified-ui-milestone-1-handoff.md for current592-case local verification and limits.

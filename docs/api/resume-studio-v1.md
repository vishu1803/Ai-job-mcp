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
unexpected failures. Future CAS conflicts use 409 with `error.details.reason` equal
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

## Dependent endpoint contracts (NOT IMPLEMENTED; no frontend calls yet)

Canonical prefix `/api/v1/resume-studio`; UUID IDs. All success payloads carry
contractVersion. These contracts fix ordering, authority and boundaries for later slices;
their executable schemas and complete response fixtures are delivered before each slice.
Server returns 404 for these paths today; availability is not inferred from this table.

| Method/path | Request | Response and dependency |
| --- | --- | --- |
| POST /drafts | source `{kind: PROFILE}` or `{kind: RESUME, resumeId}`, jobTarget | 201 draft with id, revision=1, sourceSnapshotHash, contentHash, structuredResume, immutable provenance, selection; ownership-checked clone storage first |
| GET /drafts/:id | none | draft at authoritative revision; tenant AND user/candidate scoped |
| PATCH /drafts/:id | expectedRevision, edits `[{nodeId,text}]`, optional selection `{projectIds,experienceIds,bulletIds,skillIds}` | updated draft; atomic CAS; changes candidate-authored CLAIMED text only; source facts remain immutable |
| POST /drafts/:id/proposals | expectedRevision, nodeId | 201 immutable proposal: id,draftId,baseRevision,nodeId,originalText,proposedText,rationale,evidenceLinks,truthState,status=PENDING |
| POST /drafts/:id/proposals/:proposalId/decision | expectedRevision, decision ACCEPT or REJECT | atomic decision and draft; authoritative revision + stable node snapshot + PENDING status; stale => 409 STALE_PROPOSAL with no text overwrite |
| GET /drafts/:id/history | cursor?, limit<=50 | bounded revision metadata, nextCursor; immutable intermediate revisions retained |
| POST /drafts/:id/restore | expectedRevision, revisionToRestore | new revision; history never destroyed; pending proposals invalidated even if text returns to original |
| POST /drafts/:id/preview | expectedRevision | revision-bound PDF artifact reference + measured page count/A4/font/layout report; PageMap only where exact nodes are verified, never heuristic click claims |
| POST /drafts/:id/fit | expectedRevision | measured geometry-only result or NEEDS_CONTENT_DECISION with exact suggested omissions; no implicit pruning |
| POST /drafts/:id/exports | expectedRevision, format PDF/DOCX/JSON | verified revision-bound artifact, hash, downloadUrl; PDF must exactly one A4 page with actual body font>=10pt (measurement tolerance documented), readable extraction, >=0.50in margins; fail closed on overflow |
| POST /drafts/:id/approval-package | expectedRevision | prepared package through EXISTING approval/hash/receipt pipeline; draft and download are not approval |

Editing a sealed snapshot creates a new draft branch; never mutate packages or consumed
tickets. Approval still requires existing explicit review ticket flow and binds actual
export hashes plus exact provenance. Application submission remains existing separately
authorized action; no Studio submission endpoint. No public sharing/coaching in scope.
Every mutation is transactional with revision increment, history and proposal invalidation.
The monotonic draft revision is independent of resume.version/application package version.
Undo/redo via restore creates new revisions, preventing ABA/stale acceptance; 200 visible
history steps may be paginated without deleting approved or audit snapshots.

## Implementation dependencies and ownership

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

Reuse current parser, EvidenceMatchingService, ProjectRelevanceService.computeProjectsRelevance,
AtsFitScoreService, CandidateProfileService, keyword and writing services. No frontend,
parser, structured-resume, LaTeX/geometry, encrypted storage, workflow or approval repair
files changed. The new app registration is the only shared composition seam. No dependency
installation/migration in slice001. PRD-002 is locally complete; PRD-004/005 and live AI
remain open. Antigravity may connect analyze now after branch integration; editor and
export bindings must wait for implemented dependent slices. No push/merge/deploy authorized.

> Current2026-10-15: consolidated actual-main app is available on127.0.0.1:4318. Original4317/backend worktree retained. See [first milestone handoff](unified-ui-milestone-1-handoff.md) for current login,592-case evidence and remaining Office/handoff limits. Historical worktree/cluster lifecycle records below are retained. No shared-database migration/push/deployment occurred.

# Resume Studio integration handoff

Updated 2026-10-15. STUDIO-INTEGRATION-001 is **IN_PROGRESS**. The integrated candidate workflow is implemented locally; final Office rendering acceptance is **BLOCKED** pending manual assistance. This is not a production readiness declaration.

## Integration and recovery

Integration worktree: `C:\Users\VISHW\AppData\Local\Temp\career-resume-studio-backend`, branch `backend/resume-studio-20261014`. Main, backend and frontend remain separate registered worktrees of the same repository at `890bcf03ed37bff11a912e68c1c7ee37c21f401a`. No commits, merges, pushes or deployments.

Original tracked binary patches and complete modified/untracked file snapshots are preserved in `C:\Users\VISHW\AppData\Local\Temp\career-resume-studio-recovery-1791991401301`. The recovery manifest records hashes and branches. Main's two original files and frontend's 26 original files were rechecked against that manifest with zero differences. Backend contains the reviewed frontend additions and subsequent integration changes; the original frontend worktree remains unchanged. The ledger reconciles both workstreams and the latest main PRD history. No agent work, screenshots, research or repair directories were discarded.

The seven imported frontend files were the Studio page, CSS, client controller, frontend unit/browser tests, layout and Studio web-route additions. Backend contracts remained authoritative. The only shared route change is the Studio import and route. The layout adds Studio navigation and hides the competing Copilot drawer only inside Studio. A narrow shared navigation breakpoint correction prevents the additional link from overflowing other pages. Existing PRD-004/005 renderer, parser, approval and handoff implementations are unchanged; Studio adapters reuse their established services.

Complete current file manifest: [changed-files.json](../../output/resume-studio/changed-files.json). Hashes and workstream classifications: [integration-manifest.json](../../output/resume-studio/integration-manifest.json). Artifact manifests exclude their own hashes to avoid recursive changes.

## Candidate workflow

Authenticated `/resume-studio` lists only the candidate's designated canonical masters. Paste a target job, analyze requirements, create an independent draft, choose content, edit and autosave, reload the owned draft, review a grounded wording proposal and inspect its source, compile the real document, review page fit, download PDF/DOCX, and explicitly approve when target metadata is sufficient. Export and approval are separate actions. No external application is submitted.

Autosave uses the last acknowledged snapshot. Conflict recovery pauses saving and keeps local unsaved edits. It merges only per-node/per-selection deltas against the latest server state, preserving unrelated server edits; conflicting fields require an explicit local/server choice. Current employment flags and canonical end dates are reviewed as one logical field. Stale proposals and artifacts cannot overwrite newer revisions. Revision restoration appends a new revision and temporarily locks editing during the restore request.

Proposals use the existing source-preserving generator capability: filler compression, case, whitespace and punctuation. Broad paraphrasing, invented metrics, job-keyword injection and inferred skills promoted to verified competence are refused. Provider output is untrusted and never automatically applied. The UI describes this limited wording capability and exposes candidate-authored source provenance rather than fake repository verification. All provider responses used in tests are deterministic synthetic responses; live-provider quality remains unverified.

## Canonical API contracts

All API paths begin `/api/v1/resume-studio`. Existing contracts remain compatible:

| Version | Paths | Contract / portable JSON Schema |
| --- | --- | --- |
| 1.0.0 | POST `/analyze` | [analysis](../api/resume-studio-v1.md) / [schema](../api/resume-studio-v1.schema.json) |
| 1.1.0 | POST `/drafts`, GET/PATCH `/drafts/:id` | [drafts](../api/resume-studio-drafts-v1.md) / [schema](../api/resume-studio-drafts-v1.schema.json) |
| 1.2.0 | POST/GET `/drafts/:id/proposals`, GET `/drafts/:id/proposals/:proposalId`, POST `/drafts/:id/proposals/:proposalId/decision` | [proposals](../api/resume-studio-proposals-v1.md) / [schema](../api/resume-studio-proposals-v1.schema.json) |
| 1.3.0 | GET `/drafts/:id/history`, GET `/drafts/:id/history/:revision`, POST `/drafts/:id/restore`, GET `/drafts/:id/diagnostics`, POST `/drafts/:id/preview`, GET `/drafts/:id/document`, GET `/drafts/:id/documents/:documentId/pdf` or `/png`, POST `/drafts/:id/export`, POST `/drafts/:id/approval` | [documents/history](../api/resume-studio-documents-v1.md) / [schema](../api/resume-studio-documents-v1.schema.json) |

Executable schemas are in `src/domain/career/resume-studio*.schemas.js`; matching synthetic frontend fixtures are in `tests/fixtures/resume-studio-*`. Contract generators are `scripts/export-resume-studio-{draft,proposal,document}-contracts.mjs`. Proposal list is an additive 1.2 response; historical draft/restore retain the existing 1.1 response. Diagnostics embeds the existing 1.0 analysis.

Existing HttpOnly session cookies, same-origin requests, session-bound `x-csrf-token`, OWNER/MEMBER mutations and exact candidate ownership apply. READONLY may inspect its own data but cannot mutate, compile, export or approve. A tenant OWNER does not gain another candidate's resources. Foreign IDs return 404. Responses use no-store and existing JSON success/error envelopes. Never send caller-controlled ownership, evidence, approval or verification flags.

Typical requests:

```json
{"expectedRevision":3,"edits":[{"nodeId":"<server-issued-node-id>","text":"Candidate-authored wording"}]}
```

```json
{"expectedRevision":3,"nodeId":"<server-issued-bullet-node-id>"}
```

```json
{"expectedRevision":3,"decision":"ACCEPT"}
```

```json
{"expectedRevision":3,"documentId":"<server-issued-document-uuid>","format":"PDF"}
```

400 invalid schema/node; 401 session; 403 role/CSRF; 404 absent/foreign; 409 stale revision, stale proposal/document or replayed decision/approval; 413 bounded payload; 422 unsafe wording or output needing candidate review; 503 unavailable provider/compiler/verifier; 500 sanitized persistence/integrity failure. Conflict reasons are authoritative server values in `error.details`; do not blindly replay requests.

## Document and approval verification

Preview uses the exact compiled PDF and a raster from that PDF, with click-to-edit only for unambiguous measured summary/bullet rectangles. Unmapped/repeated text has no invented coordinate mapping. Zoom supports Fit/50/75/100/125. The full inline PDF remains available if a preview is overfull.

Generation reuses the current LaTeX document generator and established Chrome compiler through a Studio adapter. Four bounded spacing layouts preserve every selected section and bullet: margins 0.60 to 0.50 inches, configured body font 10pt, body line height 1.24 to 1.16. Name/contact spacing protects measured font boxes. There is no implicit pruning, text clipping or aggressive font shrinking. If layout remains unsafe or overfull, export/approval fail closed and the candidate must review content selection.

Independent PyMuPDF verification measures actual A4 page count, font sizes, embedded font programs, ToUnicode maps, selectable/extracted text, word separation, selected content, reading order, clipping, overlap and safe glyphs. Configured 10pt measures 9.997499pt after PDF unit conversion; the numeric tolerance is documented as 0.05pt. Final export requires exactly one page and all checks; a READY label alone cannot bypass verification.

Native DOCX uses local OpenXML ZIP generation with ordinary paragraphs/styles, A4 geometry and a 10pt floor. Independent CRC/XML/paragraph-text/geometry/style checks pass. Word/Google Docs/LibreOffice pagination and visual compatibility are separate and currently unverified. DOCX does not promise pixel identity with the PDF.

Document bytes and metadata are encrypted, immutable and bound to canonical draft identity/revision/source/content/payload hashes and exact output checksums. Compilation runs outside a transaction; ownership and revision are locked and rechecked before persistence. A concurrent edit creates no obsolete artifact. Export/approval require the exact current document binding. Approval reuses existing application package hashing/sealing and signed approval-ticket services, records trusted IP/user agent and explicit review, and leaves old approved packages immutable. Replaying approval creates no duplicate package or ticket. Integration into other application's attachment/submission adapters remains separate PRD-dependent work.

Artifacts and verification JSON: [junior PDF](../../output/resume-studio/junior.pdf), [mid-level PDF](../../output/resume-studio/mid-level.pdf), [experienced PDF](../../output/resume-studio/experienced.pdf), [dense four-role PDF](../../output/resume-studio/dense-spacing-diagnostic.pdf); matching `.png`, `.docx` and `.verification.json` files are in that directory. Synthetic fixtures retain Chinese identity glyphs, contact links and populated optional sections. Three-role experienced content retains 15 years and nine bullets; dense proof retains four roles and twelve bullets. A 12-role overflow case retains all selected content and refuses final output. Final rasters were visually inspected; these are synthetic acceptance examples, not private candidate records.

## Verification record

Final combined gate: **500 PASS / 0 FAIL / 0 CANCELLED / 0 SKIPPED**, 80 suites across 26 files, 170.77 seconds. This is 140 Studio cases (including 16 real-browser cases) plus 360 relevant regressions; overlapping earlier runs are not added. Full log: `C:\Users\VISHW\AppData\Local\Temp\studio-final-500-gate.log`. Structured result and reproducible file list: [test-results.json](../../output/resume-studio/test-results.json). Tests run sequentially against real TCP Fastify, existing session/CSRF middleware, isolated PostgreSQL 17, installed Chrome and the actual PDF verifier. Browser API responses are not mocked. The separate three-persona/dense/overflow artifact script also passes; its assertions are not added to the Node test count.

Scoped JavaScript lint completes with zero errors/warnings; scoped JavaScript/JSON formatting and tracked whitespace checks pass. The installed formatter's CSS plugin is unavailable; CSS was exercised in real browsers, and a CSS formatter pass is not claimed. The scoped secret scan result and original-worktree hash comparison are recorded in the integration manifest. The full repository suite, live provider and production were not tested.

Actual integrated screenshots: [desktop](../../output/resume-studio/screenshots/desktop-viewport.png), [laptop](../../output/resume-studio/screenshots/laptop-viewport.png), [tablet](../../output/resume-studio/screenshots/tablet-viewport.png), [mobile](../../output/resume-studio/screenshots/mobile-viewport.png), [junior](../../output/resume-studio/screenshots/junior.png), [experienced](../../output/resume-studio/screenshots/experienced.png). Full-page counterparts and real HTTP downloads are retained alongside them. Desktop/mobile viewport images and all four final PDF rasters were visually inspected after the final changes.

The earlier 498-case gate had one newly added end-date normalization failure. It was corrected to the established canonical `endDate:null,isCurrent:true` representation, without changing the draft schema. Offline-save testing also exposed CSS overriding `hidden`; the production UI and test were corrected so Retry appears only after an actual offline error. Dense output exposed overlapping font boxes at 1.10 spacing; header spacing and the bounded body floor were corrected without weakening verification. The final gate replaces earlier overlapping runs; reruns are not added to totals.

Coverage includes source preservation; owned master/draft creation; autosave/reload; all inclusion decisions; two-tab unrelated and same-field conflicts; explicit proposal accept/reject/source inspection; generation during manual edits; stale/replayed proposal acceptance; offline save recovery; actual PDF compilation, PageMap and downloads; history and locked restoration; explicit approval, rollback/recovery and immutable packages; cross-tenant/same-tenant OWNER/READONLY/session/CSRF denials; four browser viewport sizes, keyboard tabs/focus trapping/Escape and no root horizontal overflow. Device sizes are Chrome viewport emulation, not physical devices or a full WCAG conformance audit.

Migrations 0022/0023/0024 form an additive chain of 25 total migrations. Upgrade and fresh disposable database application/replay were verified; existing data is retained. Only the authorized loopback fixture database and a fresh `product_audit_resume_studio_docs_fresh_*` database were migrated. No shared development/production migration occurred. Code rollback can leave additive data intact; no destructive down migration was attempted.

After the final gate, the fixture database contained zero tenants, drafts, proposals, documents and packages, with 25 migrations. Only PostgreSQL background workers remained; there were zero other client sessions. Only the verified Temp cluster on port 55447 was stopped with `pg_ctl`; its postmaster file is absent. Data directories, fresh migration database and artifacts are retained. Shared services and Word processes were not stopped. Restart this exact disposable cluster before reproducing database tests.

Runtime requires existing configured encryption/session/approval keys, Chrome/Chromium, Python/PyMuPDF (`scripts/requirements-studio-pdf.txt`) and an existing supported AI-provider configuration for proposals. No new JavaScript dependency or framework was introduced. Missing compiler/verifier/provider fails closed. Credentials were not logged or embedded in frontend output. All test keys/candidates are synthetic. Do not use the disposable test environment's settings in development or production.

## UI cleanup

Preserved approved editorial typography, palette and responsive layout. Removed slice/debug labels, placeholder verified employers/metrics, fake master UUIDs, simulated HTML final preview, redundant parseability/writing score cards, visible revision metadata and the competing global Copilot drawer within Studio. Consolidated document checks with the actual preview and made the selection drawer an outline/jump tool rather than duplicate checkboxes. Job targeting collapses after creation; one primary include control remains per item. Saving, conflict choices, evidence, grounded suggestions, export, approval and actionable document failures remain visible where useful. No new design framework, emojis or decorative dashboard charts.

## Remaining assistance and readiness

**Office rendering acceptance is BLOCKED.** Installed Word's read-only synthetic DOCX opening waited without returning a PDF. The exact cause is not established; first-run/activation prompts may require interactive setup. Only the verified helper PowerShell process was stopped; existing Word processes and user documents were left untouched. The synthetic proof directory and documents remain available.

Development-only manual steps: open Word normally, finish any activation/first-run prompts yourself, and confirm a blank document opens normally. Do not send credentials or license information. Once ready, confirm that state so the guarded local renderer can be rerun. Alternatively provide an already installed LibreOffice executable path. For direct inspection, open the three synthetic DOCX files in `output/resume-studio`, check pagination, and save each as PDF into a separate `output/resume-studio/word-validation` folder; report the resulting paths for independent inspection. No production account/data change is required.

Until native Office rendering is measured, full Studio acceptance remains incomplete. Live AI-provider quality, employer ATS behavior, native TeX compilation, real-device/accessibility conformance, Google Docs/LibreOffice compatibility and production deployment are not verified. Existing P0/production readiness repairs remain separate. Optional sharing, coaching, collaboration and broader rewrite capabilities were not added. **Deployment readiness: NO-GO pending Office acceptance and existing application readiness gates.**
